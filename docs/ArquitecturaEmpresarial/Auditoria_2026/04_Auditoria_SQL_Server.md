# 04 - Auditoría de la capa de datos (SQL Server)

Fecha: 2026-10-14 · Alcance: `Cj-Erp-Web/` (repo real) · Modalidad: SOLO LECTURA (código y scripts versionados; **no** se consultó la BD, no se ejecutó SQL, no se modificó nada).
Fuentes: `AGENTS.md`, `docs/DATABASE_MAP.md`, `docs/BUSINESS_RULES.md`, `docs/TECHNICAL_DEBT.md`, `CjERP.Backend/Database/**`, `CjERP.Infrastructure/**`, `CjERP.Api/Controllers/**`, `CjERP.Api/Program.cs`, `CjERP.Api/Services/**`.
Convención de lectura: **[H]** hecho verificado en código/scripts · **[I]** inferencia · **[R]** riesgo · **[Rec]** recomendación. Estados: IMPLEMENTADO / PARCIAL / DOCUMENTADO (solo en docs) / NO ENCONTRADO (no está en el repo) / NO VERIFICABLE (requiere la BD real). Prioridad: P1 (crítica) a P4 (baja). Todas las recomendaciones respetan la restricción "sin cambiar esquema" (no tablas/columnas/PK/FK nuevas ni cambios de tipo; sí se admiten cambios de código, parámetros, permisos y configuración).

> La BD productiva es `JC_Db` (nombre citado en scripts y en `docs/TECHNICAL_DEBT.md` B12). Versión/edición real: NO VERIFICABLE (ver §9). Los scripts de Viáticos exigen compatibilidad >= 140 y mencionan validación pendiente en SQL Server 2025 (LocalDB 2019 usado en pruebas).

---

## 1. Resumen ejecutivo

| # | Hallazgo clave | Prioridad |
|---|---|---|
| 1 | Las tablas núcleo (Planilla, OC, Empleado*, Usuario, Constante, Seg*, Asistencia…) **no tienen DDL** en el repo (solo "fixtures" de prueba). Modelo, PK, FK e índices reales son NO VERIFICABLES. | P1 |
| 2 | 129 de ~250 SPs referenciados desde C# **no tienen definición** versionada (52 %); incluye todo el flujo de pagos, OC, asistencia, empleados y el SQL Monitor. La cifra de AGENTS.md (183/61) está desactualizada. | P1 |
| 3 | `Planilla.Correlativo` **no es único** (77 repetidos, legacy `IdWeb NULL`); PK real de 6 columnas. Varios módulos lo usan como identificador de pago y al menos tres rutas escriben solo por `Correlativo`. | P1 |
| 4 | `MAX(Id)+1` en 18 puntos de C# (EmpleadoCj, Usuario, Empleado, DetOrdenCompra.Fila) sin bloqueo en la mayoría; riesgo de duplicados/deadlocks. | P2 |
| 5 | Fechas de negocio como texto (`FecIngreso`, `FechaDeposito`, `FechaAprobador`, `FechaRechazar`, `FecEmision`) con `TRY_CONVERT` multiformato: no sargable y ambiguo (101 antes que 103). | P2 |
| 6 | El backend usa un único acceso SQL con la credencial de la app; no hay `GRANT/DENY/ROLE` versionados ni autorización por rol en API: cualquier cliente con JWT (o con la cadena de conexión) ve todo. Sin barrera frente a Power Apps/Power Automate/agentes. | P1 |
| 7 | SQL en controllers y `new SqlConnection` fuera de `ISqlCommandFactory` (38 puntos) evita `SqlSettings` y mezcla lógica de negocio con acceso a datos. | P2 |
| 8 | Backup/DR, retención y crecimiento: **sin documentación alguna**. Tablas de log sin política de retención. | P1 |
| 9 | Jobs: Hangfire (misma BD) + `SqlMonitorWorker` en proceso; no hay SQL Agent versionado (NO VERIFICABLE en BD real). | P3 |
| 10 | Migración a Azure SQL: sin bloqueantes duros visibles en el repo (0 linked servers, CLR, xp_cmdshell, OPENROWSET, msdb, Service Broker, cross-DB); puntos a resolver: `USE JC_Db`, `vVacaciones`/SPs no versionados, SQL Monitor (DMVs/KILL), `Encrypt=false` por defecto, apps legacy conectadas directo. Azure SQL DB es viable con validación; MI es el plan B de bajo riesgo. | P2 |

---

## 2. Método y cifras

**[H]** Cuantificación de SPs (grep sobre código; excluye `Database/**/Pruebas`, `Produccion_PENDIENTE`, scripts `rollback`):

| Métrica | Valor | Comando/criterio |
|---|---|---|
| Nombres de SP/RPT referenciados como literal en C# (Api+Infrastructure+Application) | **250** | `"(dbo.)?(sp_|SP_|Rpt)\w+"`, únicos, case-insens. |
| Con definición (`CREATE/ALTER PROC`) en `Database/**` | **121** | intersección |
| **Sin definición versionada** | **129 (52 %)** | diferencia |
| Definidos en repo pero no referenciados por C# (internos o llamados por SQL) | 27 | p. ej. `sp_ViaticoInterno_*`, `sp_Stock_Mover` |
| Archivos `.sql` en `Database/` | 160 (incl. diagnósticos, fixtures y rollbacks) | |
| Scripts con `CREATE OR ALTER` / solo `ALTER PROC` | 61 / 2 | idempotencia razonable |

**[I]** El método cuenta literales; SPs construidos dinámicamente o con prefijo distinto (`dbo.` omitido, mayúsculas) pueden variar ±5. La diferencia respecto a AGENTS.md (183 referenciados/61 versionados) se explica por los módulos añadidos después (Viáticos, Logística equipos, Beneficio, Descanso, Mobile). **[Rec]** Actualizar AGENTS.md/DATABASE_MAP.md con la cifra nueva.

**[H]** Los 129 sin definición incluyen: `sp_Planilla_Insertar/Actualizar/ActualizarEstado/*Masivo/ConsultaIni(v1)/Consulta_Aprobar`, `sp_OrdenCompra_Insertar/BuscarCabecera/BuscarDetalle/RechazarMasivo`, `sp_Asistencia_*` (salvo ValidarCampo), `RptAsistenciaFechas`, `sp_EmpleadoCj_*`, `sp_EmpleadoOtros_*`, `sp_EmpleadoCompensacion*`, `sp_ChequeEmpleado_*`, `sp_Constante_ListarPorCampo`, `sp_GenerarUsuario`, `sp_Monitor_*` (12), `sp_PlanillaBoleta_ImportarXml`, SPs `sp_Seg*` y varios `sp_Importar_*`.

---

## 3. Hallazgos

### 3.1 Modelo relacional, claves, FK e índices

#### SQL-01 · DDL de tablas núcleo ausente
- Componente: modelo de datos. Archivo: `CjERP.Backend/Database/**`; `docs/DATABASE_MAP.md` §2, §5.
- Evidencia **[H]**: `CREATE TABLE` de `Planilla`, `Empleado`, `EmpleadoCj`, `Constante`, `Cliente`, `Site`, `SegMenu` aparece **solo** en `Database/Viaticos/Pruebas/00_Fixture_Legacy_NoProduccion.sql`, `Pruebas/Fase2/00_Fixture_Legacy_Fase2.sql` y `01_Fixture_Seguridad_Fase6.sql` (reconstrucciones parciales para pruebas, no la verdad de la BD). No hay DDL de `CabOrdenCompra`, `DetOrdenCompra`, `Usuario`, `Asistencia`, `EmpleadoOtros`, `EmpleadoCjDetalle`(real), `EmpleadoCjHistorialLaboral`, `LogPlanilla`, `MovEstadosPagos`, `CuentaEmpleado`, `MovimientosBcp`, `AuditoriaCambios`, `PlanillaBoleta*`, `Importar`/`updimportar`, `Proyecto`, `SegPerfil/SegRol/SegPerfilRol*`, `Suministro_provisional`, `ReporteWup*`.
- Sí versionadas con DDL real: Arrendamientos (`a_*`, 32 tablas), Conciliación multibanco, Comunicaciones móviles, Vacaciones (modelo nuevo), `EmpleadoCjSolicitudVigencia`, `SegPermisoAccion`, IA Chat (`IaChatAuditoria`, `IaToolPermiso`), jobs SharePoint, Stock (Logística), Viáticos (17 tablas).
- Estado: NO ENCONTRADO. Impacto: imposible reconstruir la BD, revisar integridad o planear migración sin acceso al servidor; las columnas se "descubren" por `COL_LENGTH` en tiempo de ejecución (SQL-15). Riesgo **[R]**: pérdida irrecuperable del modelo si falla el servidor y no hay backup verificado (SQL-24). Prioridad: **P1**.
- Recomendación **[Rec]**: extraer DDL de solo lectura desde la BD (SSMS "Generate Scripts" / `sqlpackage /Action:Extract` / DACPAC) a `Database/_Baseline/` sin ejecutar nada; es documentación, no cambio de esquema. Dependencias: acceso a BD (§9).

#### SQL-02 · SPs no versionados
- Evidencia: ver §2 (129/250). Archivos con parches frágiles **[H]**: `Database/Planilla/03b/03d/03e_*` reescriben SPs con `REPLACE(OBJECT_DEFINITION(...))` + `sp_executesql`; `Planilla/03c_*` está corrupto (DATABASE_MAP §1). `Database/Planilla/01_sp_Planilla_Consulta_Estados.sql` ≠ BD real (no declara parámetros TipoCambio* que envía el FE).
- Estado: PARCIAL (47 % versionado). Impacto: la lógica de pagos/OC/aprobación vive solo en la BD. Riesgo: cambio sin trazabilidad, sin revisión, sin rollback. Prioridad: **P1**.
- Rec: versionar (extraer `OBJECT_DEFINITION` de los 129) empezando por `sp_Planilla_*`, `sp_OrdenCompra_*`, `sp_Asistencia_*`, `sp_EmpleadoCj_*`; comparar hash scripts vs BD en cada despliegue (script de solo lectura). Dependencias: SQL-01.

#### SQL-03 · Versionado no equivale a desplegado
- **[H]** Varios scripts se declaran "NO EJECUTADO"/PV: Beneficio (06), Descanso (08), Logística 00-07, `IaChat/16, 17` ("VERSION 2 ... NO EJECUTADO"), Viáticos "Produccion_PENDIENTE" (`20_Menu_..._NO_EJECUTAR.sql`), `Finanzas/06_PagosV2_Menu.sql` (falta en BD según memoria del proyecto). Hay objetos temporales en producción (`sp_IA_Planilla_Buscar_Backup_20261004`, TECHNICAL_DEBT B9). 5 scripts fijan `USE JC_Db` (`Finanzas/03_trg_*`, Viáticos…) → no portables a otro nombre de BD / Azure SQL DB.
- Estado: PARCIAL. Impacto/riesgo: no hay registro de qué versión está en producción; despliegues manuales sin tabla de migraciones. Prioridad: P2.
- Rec: tabla/registro de despliegue *externo* (hoja o repo `MIGRATIONS.md`) con hash de cada script ejecutado; quitar `USE JC_Db` en scripts nuevos (usar el contexto de conexión). Sin cambiar esquema.

#### SQL-04 · Claves, FK e índices versionados
- **[H]** 113 `CREATE INDEX` y 108 menciones de `FOREIGN KEY` en scripts, concentrados en Viáticos (`05_FK_Externas.sql`, `06_FK_Planilla_OPCIONAL.sql`), Arrendamientos, Mobile, Vacaciones, Stock. Para el núcleo solo existe `Planilla/02_ix_Planilla_Consulta_Estados_Perf.sql` (5 índices sobre `Planilla`: `(Estado,FecIngreso,IdValidador,Correlativo DESC)`, `(Estado,FechaDeposito,…)`, `(IdSolicitante,IdWeb,Estado,Correlativo DESC)`, `(Estado,Ot,IdSite,CorreSite,Correlativo DESC)`, `(Estado,IdOc,Fila,Correlativo DESC)`).
- **[H]** Viáticos documenta: `Site` tiene PK de 4 columnas sin unicidad de `(IdSite,Correlativo)`; `Importar` no tiene PK; `Cliente`/`Proyecto` tienen PK de una columna INT (FK reales creadas). La referencia `Viatico*.PlanillaCorrelativo → Planilla` es **lógica, sin FK** (decisión vigente).
- Estado: PARCIAL. **[I]** El núcleo legacy probablemente carece de FK (Planilla→DetOrdenCompra, Planilla→Empleado, Asistencia→Empleado…). Riesgo: huérfanos, estados inválidos, joins con TRY_CONVERT. Prioridad: P2.
- Rec: (sin cambiar esquema) auditoría de huérfanos con consultas de solo lectura (§9); capturar los resultados como reglas en SPs/servicios de validación; no agregar FK hasta limpiar.

#### SQL-05 · Relación `Planilla.IdOc + Fila → DetOrdenCompra`
- **[H]** `Planilla.IdOc` es `varchar` (`OrdenCompraService.AsociarPagoNuevoOcSql`: `IdOc = CONVERT(VARCHAR(50), @IdOc)`); `CabOrdenCompra.IdOc` numérico; los SPs usan `TRY_CONVERT(int, IdOc)` (TECHNICAL_DEBT M1). `DetOrdenCompra` PK = `(IdOc, Fila)`. `Fila` se calcula en C# con `SELECT ISNULL(MAX(Fila),0) FROM dbo.DetOrdenCompra WHERE IdOc=@IdOc` (`OrdenCompraService.cs:1043`) dentro de transacción pero sin `UPDLOCK`. Consumo OC = `CabOrdenCompra.Subtotal` vs `SUM(Planilla.Subtotal WHERE Estado=4)`. Recibos asociables en estados {0,1,4,5,6}.
- Estado: PARCIAL (regla en código/docs; FK inexistente según doc). Impacto: sin integridad referencial; join no sargable. Riesgo: dos usuarios editando la misma OC pueden generar `Fila` duplicada → violación PK. Prioridad: P2.
- Rec: serializar con `UPDLOCK, HOLDLOCK` en el `SELECT MAX(Fila)` (patrón ya usado en `Mantenimiento/07_sp_MigracionImport_Insertar_V2.sql`); usar `IdOc` normalizado en parámetros. No cambiar tipo de columna.

#### SQL-06 · `Planilla.Correlativo` como identificador funcional (mapa completo, sin proponer cambiarlo)
- **[H]** Hechos (`TECHNICAL_DEBT` B12; `Viaticos/02_Tablas_Viatico_Aprobacion_Entrega.sql`; `IaChat/17_*:34-37`): PK declarada = `(IdProyecto, IdSite, IdTipoTrabajo, IdTarea, Correlativo, IdCliente)`; 112 485 filas / 112 407 correlativos distintos = 77 repetidos (155 filas), todos `IdWeb IS NULL` (generados por el sistema anterior, que sigue activo); las 30 filas `IdWeb=1` son únicas. `sp_Planilla_Insertar` genera `MAX(Correlativo)+1` bajo `UPDLOCK, HOLDLOCK`. Es el "número de pago".
- **Mapa de consumidores [H]:**

| Módulo | Archivo/objeto | Cómo lo usa |
|---|---|---|
| Registro/aprobación | `PlanillaService`, `sp_Planilla_Insertar/ProcesarAprobacionMasiva` (TVP `Correlativo, IdSite`) | clave del lote; devuelve `CorrelativoGenerado` |
| Pagos tesorería | `PagoTesoreriaService.cs:78-189`, `PagoTesoreriaWorkflow.cs:125-233`, `PagoTesoreriaRevision.cs` | `WHERE Correlativo=@correlativo`; items TVP `(Correlativo, IdSite)`; hash de versión (`VersionSql`) |
| Auditoría de pagos | `LogPlanilla`, `MovEstadosPagos` (columna Correlativo) | INSERT con clave completa de 6 columnas en el workflow (`PagoTesoreriaWorkflow.cs:230`) |
| Orden de compra | `OrdenCompraService.cs:75-80` (`UPDATE dbo.Planilla … WHERE Correlativo=@Correlativo`), `sp_OrdenCompra_Consulta_Estados` (`CorrelativoPlanilla`) | asocia recibos a OC |
| Conciliación bancaria | `ConciliacionBcpService` (`CorrelativoPlanilla`, `CorrelativoCsv` Scotiabank), `sp_MovimientosBcp_ConciliarPlanilla` | vínculo movimiento↔pago |
| Viáticos | `ViaticoEntrega/Liquidacion.PlanillaCorrelativo`, `ViaticoPlanillaIntegrationService`, `sp_ViaticoInterno_ResolverPago` | `Correlativo + IdWeb = 1`, valida 0/1/>1 filas, nunca `TOP 1`; `Viatico.LegacyPlanilla*` guarda las 6 columnas |
| IA Chat | `sp_IA_Planilla_Buscar` v3 | `Correlativo AS IdPlanilla` + clave de 6 columnas (corrección de identidad de fila) |
| Logística | `LogisticaSuministroService`, `LogisticaRecojo/Reembolso` | `Correlativo` del suministro/recibo |
| Mobile/RRHH | `ContratosController`, `MantenimientoEmpleados/Externos` (`Correlativo` de Constante/Site) | **homónimo**: `Constante.Correlativo` y `Site.Correlativo` / `CorreSite` son otros conceptos |
| Reportes | `PlanillaConsultaController/Service`, `GastosExcelSharePointRepository` | listados/exports |

- Estado: DOCUMENTADO/PARCIAL (convención en código, sin garantía en BD). Riesgo **[R]**: en las rutas que escriben por `Correlativo` solo (`OrdenCompraService.cs:75-80`, `sp_Planilla_ActualizarRendirMasivo` por `Correlativo+IdSite`, B11; trigger de fechas SQL-17) una fila legacy duplicada puede ser afectada junto a su gemela. Homonimia (`Constante`/`Site`/`CorreSite`) favorece errores al leer código. Prioridad: **P1**.
- Rec (sin cambiarlo): (a) toda escritura nueva por `Correlativo + IdWeb = 1` o por la clave de 6 columnas; (b) añadir a los `WHERE` de `UPDATE dbo.Planilla` de C# las columnas `IdSite`/`IdCliente`/`IdProyecto` ya presentes en los DTO; (c) un único helper/sp de "resolver pago" reutilizando `sp_ViaticoInterno_ResolverPago`; (d) documentar en BUSINESS_RULES el glosario de homónimos. Dependencias: pruebas con las 77 filas duplicadas.

#### SQL-07 · Estados como enteros sin catálogo ni restricción
- **[H]** `Planilla.Estado` 0-10 (+99/100 pseudo-estados de UI), `CabOrdenCompra.IdEstado` 0/1/6, EmpleadoCj 9→1→0, Vacaciones 97/98/99/0, Compensación 97/98/9/22, Descanso 97→100→5/0, Asistencia 9, Logística 0/1/2/8/4/6. Nombres oficiales en `Constante` MAESTRO/ESTADO (PV); transiciones codificadas en `PagoTesoreriaWorkflow.EstadoDestino` y en SPs no versionados. `BUSINESS_RULES` advierte etiquetas cruzadas entre `pagos_v1.tsx` y `gastosaprobar.tsx`; "pagado" = `Estado=4` es la clave de consumo de OC.
- Estado: DOCUMENTADO. Riesgo: valores fuera de rango o transiciones inválidas pueden escribirse por SQL inline (`PagoTesoreriaService` hace UPDATE directo) o por apps legacy. Prioridad: P2.
- Rec: matriz única de transiciones (documento + prueba automatizada), y en el workflow validar `Estado` actual (ya existe huella de versión SHA-256 en pagos). Sin CHECK nuevos.

### 3.2 Transacciones, errores y concurrencia

#### SQL-08 · TRY/CATCH, XACT_ABORT y control transaccional en SPs versionados
- **[H]** De 55 scripts con procedimientos (fuera de pruebas), 45 contienen `TRY` y 27 no declaran `SET XACT_ABORT ON` (la mayoría de consulta: `Finanzas/02_sp_Planilla_ConsultaIni_v2.sql`, `Planilla/01_sp_Planilla_Consulta_Estados.sql`, `OrdenCompra/01_*`, Mobile 03/08/11/13/14/16/17/18, `Asistencia/01_sp_Asistencia_ValidarCampo.sql` (**escritura**), `IaChat/*`). 86 archivos usan `THROW/RAISERROR` (errores 50020-50024 en IA Chat). Los SPs de escritura bien formados son: `Finanzas/sp_Planilla_ProcesarAprobacionMasiva.sql` (XACT_ABORT + TRY + TRAN), `Finanzas/09_sp_Planilla_ActualizarEstado_rechazador.sql`, Viáticos (10-18), Arrendamientos, Logística, Vacaciones.
- **[H]** Los 7 SP de etapas de tesorería y `sp_Planilla_Insertar/Actualizar/ActualizarEstado` no son auditables (sin definición). C# envuelve los masivos en `BeginTransactionAsync` (`PagoTesoreriaService.cs:160,228`; `PagoTesoreriaWorkflow.cs:122`; `PagoTesoreriaRevision.cs:45`).
- Estado: PARCIAL. Gaps documentados (A6): `OrdenCompraService.InsertarAsync` (SP + UPDATE `IdWeb` + N UPDATE sin tx), `PlanillaService` insert/update + auditoría, `ChequeEmpleadoService`, `CompensacionService` valida saldo fuera de tx; auditoría siempre fuera de la tx de negocio y se omite en silencio si el SP no existe.
- Impacto/riesgo: estados parciales (OC cabecera sin detalle; planilla sin auditoría). Prioridad: **P2**.
- Rec: `SET XACT_ABORT ON` + `TRY/CATCH` en SPs de escritura versionados (ej. `Asistencia/01_sp_Asistencia_ValidarCampo.sql`); en C# envolver en una única transacción de aplicación (`BeginTransactionAsync`) el trío OC SP/UPDATE/auditoría; la auditoría pasa a la misma conexión/tx.

#### SQL-09 · `MAX(Id)+1`
- **[H]** C#: `MantenimientoEmpleadosController.cs:676,734,790,848,904,959,1595,1750` y `MantenimientoExternosController.cs:704,762,818,876,932,987,1617,1772` (EmpleadoCj.IdEmpleado, Usuario.Id; 16 ocurrencias) + `OrdenCompraService.cs:1043` (Fila). SQL: `Recursoshumanos/04_EmpleadoCj_AprobarCompleto.sql:93,262` (Empleado legacy, Usuario), `Mantenimiento/03:27,47,82` y `07:57,68,88,124` (Cliente/Proyecto/Site/`Importar.NroInterno`), `SegMenu.OrdenMenu+1` en 5 scripts de menú. `Importar.NroInterno` en `07:124` **sin** `UPDLOCK` (`SELECT MAX(i.NroInterno) FROM dbo.Importar i`). `sp_Planilla_Insertar`: `MAX(Correlativo)+1` bajo `UPDLOCK, HOLDLOCK` (bloqueo serializable de toda la tabla durante la inserción).
- Estado: PARCIAL (en `07` y `sp_Planilla_Insertar` hay bloqueo; en controllers C# solo hay tx por defecto READ COMMITTED sin hints). Riesgo **[R]**: dos altas simultáneas obtienen el mismo `IdEmpleado` → violación de PK, o peor, colisión silenciosa si la PK no es única (`Empleado` legacy "MAX+1" y `Usuario.Id`). Bajo RCSI de Azure SQL DB (SQL-22) la ventana de carrera crece porque los lectores no bloquean. Prioridad: **P2**.
- Rec: (sin SEQUENCE/IDENTITY por no cambiar esquema) unificar la generación en una rutina con `WITH (UPDLOCK, HOLDLOCK)` o `sys.sp_getapplock` (ya usado en `Viaticos/ViaticoDistributedLock.cs`) y retorno del Id, reutilizada por Empleados y Externos (hoy duplicadas 6×2).

#### SQL-10 · Concurrencia y deadlocks
- **[H]** Bloqueo optimista con huella `VersionSql` en pagos (`PagoTesoreriaService/Workflow`: "si otro usuario modificó… se rechaza todo el lote"); `sp_getapplock` por movimiento en Viáticos (`ViaticoDistributedLock.cs`, timeout 10 s); `UPDLOCK/HOLDLOCK` en 23 scripts; **0** reintentos por error 1205 en acceso a datos (sin Polly; solo `AutomaticRetry` de Hangfire en jobs). `SqlSettings` por defecto: `DefaultCommandTimeoutSeconds=60`, `MaxPoolSize=100`. Hangfire `WorkerCount=5` + `SqlMonitorWorker` (cada 30 s) + peticiones web comparten el mismo servidor y BD.
- **[I]** `sp_Planilla_Insertar` serializable sobre toda `Planilla` bloquea el resto de inserciones y, con los 5 índices `Planilla/02_*` y el trigger de fechas (SQL-17), aumenta el costo del bloqueo. `sp_Planilla_Consulta_Estados` agrega toda `Planilla` sin filtro (M1) y compite con los UPDATE masivos.
- Estado: PARCIAL. Prioridad: P2.
- Rec: (1) captura de deadlocks vía `system_health` (§9); (2) reintento acotado (1205/1222) en el helper de conexión para endpoints de escritura; (3) `READ_COMMITTED_SNAPSHOT` evaluar con DBA (ver SQL-22); (4) `commandTimeout` explícito en reportes pesados.

#### SQL-11 · Manejo de errores en la capa C#
- **[H]** `ISqlCommandFactory.Create(...)` aplica timeout de 60 s; respuesta `{success,message}`; `SlowRequestThresholdMs=1500`. Auditoría omitida silenciosamente si falta el SP (A6). Error de 50xxx mapeado por servicio.
- Estado: PARCIAL. Rec: log estructurado del número de error SQL (`SqlException.Number`) y mapeo 1205/1222/2627 a respuestas 409/503 uniformes.

### 3.3 SQL dinámico, concatenación e inyección

#### SQL-12 · SQL dinámico en SPs
- **[H]** 16 scripts usan `sp_executesql`/`EXEC(...)`: (a) parches `EXEC sys.sp_executesql @definition` (`Planilla/03b,03d,03e`, `Finanzas/05_...`) para reescribir SPs; (b) `IaChat/16:244`, `17:354,998,1021` con parámetros tipados y "lista blanca" de dimensiones (comentado en `17:30-37`, errores 50022/50023); (c) `Recursoshumanos/03:327` y `04:169`; (d) diagnósticos `*_SoloLectura.sql` con `EXEC(N'SELECT … dbo.Tabla')` de texto fijo; (e) `Mantenimiento/06:6` `EXEC('CREATE TYPE …')`.
- Estado: IMPLEMENTADO con lista blanca en IA Chat; el riesgo restante está en los 129 SPs no revisables. **[R]** inyección SQL en SPs no versionados: NO VERIFICABLE. Prioridad: P3.
- Rec: buscar en BD `sys.sql_modules` con `EXEC(`/`sp_executesql` + parámetros `varchar` concatenados (§9).

#### SQL-13 · SQL concatenado/interpolado en C#
- **[H]** Revisión de `$"…"` y concatenaciones con SQL:

| Archivo:línea | Construcción | Origen del valor | Evaluación |
|---|---|---|---|
| `ConciliacionBcpService.cs:2485` | `FROM {tableName}`, `{keyExpression}` | constantes `dbo.MovimientosBcp`/`dbo.MovimientosConciliacion` (`:69,71`) y expresiones de plantilla | Bajo: nombres de tabla constantes; `GetSqlKeyExpression` depende de nombres de columna de plantilla de banco (verificar que vengan de BD/whitelist, no del usuario) |
| `ConciliacionBcpService.cs:1062,1413,1486,1561` | `.Replace("{0}", tableName)` | constante | Bajo |
| `OrdenCompraService.cs:1898` | `FROM {tablaEmpleado}` | `IdWeb == 1 ? "dbo.EmpleadoCj" : "dbo.Empleado"` | Bajo (binario fijo) |
| `ArrendamientosService.cs:1826` | `COL_LENGTH('{tabla}','{columna}')` | llamadas internas | Bajo si todas son literales; verificar invocaciones |
| `MantenimientoEmpleadosController.cs:1861` / `MantenimientoExternosController.cs:1883` | `INSERT INTO dbo.Empleado ({columns}) VALUES ({values})` | lista de columnas construida por código según `COL_LENGTH`, valores parametrizados | Bajo (nombres fijos en código; valores parametrizados) |
| `AsistenciaSharePointRepository.cs:166`, `GastosExcelSharePointRepository.cs:182` | `SELECT TOP ({limit})` | `limit` entero | Bajo (tipo int) |
| `AuditoriaCambiosService.cs:65` | `EXEC {RegistrarSp} @Modulo=@Modulo{index}` | constante + índices | Bajo |
| `SqlMonitorService.cs:552` | `KILL {sessionId}` | `int` validado `>0` y existente en `sys.dm_exec_sessions` | Inyección baja; **autorización alta (SQL-23)** |

- Estado: IMPLEMENTADO mayormente seguro (todo lo variable es parametrizado con Dapper). **[R]** residual: nombres de columna/tabla dinámicos; tipos numéricos usados como texto. Prioridad: P3.
- Rec: mantener lista blanca explícita y prueba unitaria que fallen ante identificadores no previstos; en `ExisteColumnaAsync` usar parámetros (`COL_LENGTH(@t,@c)`, ya hecho en `MantenimientoEmpleadosController.cs:2498`).

#### SQL-14 · SQL inline en controllers y fuera de `ISqlCommandFactory`
- **[H]** `new SqlConnection` en 38 puntos fuera de la fábrica (Controllers: `ContratosController` 5, `MantenimientoEmpleados/Externos` 8 c/u, `EmpleadoFichaController`; Services: `AsistenciaReporteService` 3, `AuditoriaCambiosService` 2, `EmpleadoCtaService` 3, `SegPerfil/SegRol/SegUsuario/SegPermisoAccion/SegRolMenuPermisoService`, `CompensacionService`, `SqlMonitorService`, `SqlServerHealthCheck`). SQL inline (cuenta de líneas con SELECT/INSERT/UPDATE): `MantenimientoEmpleados` 105, `MantenimientoExternos` 105, `OrdenCompraService` 85, `ConciliacionBcpService` 63, `ArrendamientosService` 59, `ContratosController` 54, `ReporteRepository` 42, `PlanillaBoletaRepository` 41. SQL inline escribe en `dbo.Usuario`, `dbo.Asistencia`, `dbo.Empleado`, `dbo.Planilla`, `dbo.CabOrdenCompra`, `dbo.DetOrdenCompra` (p. ej. `MantenimientoEmpleadosController.cs:1560-1629,1923,1975`; `OrdenCompraService.cs:75-81,161,400,456,468,546,1210,1228`).
- **[H]** `SqlCommandFactory` aplica `ConnectTimeout`, `MaxPoolSize`, `Encrypt` (default **false**) y `TrustServerCertificate` (default **true**) desde `SqlSettings`; las conexiones directas (`new SqlConnection(connectionString)`) **no** pasan por esa normalización **[I]** → comportamientos distintos de timeout/cifrado/pool; el pool se fragmenta por cadenas distintas.
- Estado: PARCIAL. Impacto: duplicación (copias Empleados/Externos), imposibilidad de aislar el acceso a datos. Riesgo: error al migrar a Azure (requiere `Encrypt=true`), pool agotado. Prioridad: **P2**.
- Rec: usar siempre `ISqlCommandFactory.CreateConnection()`; mover SQL a servicios (patrón ya declarado en AGENTS.md); no replicar en código nuevo.

### 3.4 Fechas, paginación y rendimiento

#### SQL-15 · Fechas como texto
- **[H]** `Planilla.FecEmision`, `FecIngreso`, `FechaDeposito`, `FechaAprobador*`, `FechaRechazar` (MM/DD/YYYY, doc BUSINESS_RULES línea 30) son texto. Hay columnas DATE `FecIngresoDate`/`FechaDepositoDate` alimentadas por el trigger (SQL-17). Parseo `TRY_CONVERT(DATE, …, 101) → 103 → 23` (`Finanzas/03_trg_*`), orden **distinto** por campo (FecIngreso 101→103→23; FechaDeposito 23→101→103). `Database/Finanzas/01_validacion_fechas_Planilla_SoloLectura.sql` existe para validar.
- Estado: PARCIAL. **[R]** (1) ambigüedad dd/MM vs MM/dd: `03/04/2026` se interpreta como 4 de marzo (101 primero) aun cuando el emisor haya escrito dd/MM; los TRY_CONVERT no fallan, **mal-clasifican silenciosamente**; (2) no sargable (`TRY_CONVERT` en WHERE; M1); (3) `FechaRechazar`/`FechaAprobador` sin columna DATE conocida. Prioridad: **P2**.
- Rec: usar las columnas `*Date` en filtros/ordenamientos nuevos; ejecutar la validación de solo lectura para cuantificar filas ambiguas (§9); estandarizar parámetros de entrada en ISO `yyyy-MM-dd` (ya es regla en IA Chat).

#### SQL-16 · Paginación
- **[H]** Paginación nativa solo en IA Chat (`sp_IA_Planilla_Buscar`, `OFFSET`/`@Pagina`), Logística Ingreso (`07`), Mobile (03, 12, 18) y Vacaciones (`03`). Listados principales (`sp_Planilla_Consulta_Estados`, `sp_Planilla_ConsultaIni`, `sp_OrdenCompra_Consulta_Estados`, reportes de asistencia, `PagoTesoreriaService` SELECT directo) devuelven el conjunto completo y la grilla lo pagina en el cliente (`DataGridBase`/`DataGridPro`). `SELECT TOP (@limit)` en logs.
- Estado: PARCIAL. Riesgo: crecimiento de `Planilla` (112 485 filas hoy) sin límite superior en respuestas; picos de memoria en API. Prioridad: P3.
- Rec: filtros obligatorios (rango de fecha/estado) y `TOP` de seguridad en C#; paginar solo en nuevos endpoints de integración (SQL-30).

#### SQL-17 · Trigger `trg_Planilla_SincronizarFechasDate`
- **[H]** `Database/Finanzas/03_trg_Planilla_SincronizarFechasDate.sql`: `AFTER INSERT, UPDATE` en `Planilla`, une `inserted i JOIN dbo.Planilla p ON i.Correlativo = p.Correlativo` (**solo Correlativo**); protegido con `TRIGGER_NESTLEVEL` y `UPDATE(...)`. Otros triggers: `trg_MaterialStock_Ledger` (Logística; "no interrumpir al sistema antiguo"), `TR_IaToolPermiso_SinBorrado`, `TR_Viatico_BloqueoMoneda`, `TR_ViaticoRendicionDetalle_AuditoriaTC`.
- Estado: PARCIAL (script; ¿ejecutado? NO VERIFICABLE). **[R]** Con 77 correlativos repetidos, el UPDATE por `Correlativo` toca la fila gemela legacy con la fecha de otra (sobrescribe `FecIngresoDate`/`FechaDepositoDate` si difieren). Prioridad: P2.
- Rec: unir por la clave de 6 columnas (`i.IdProyecto=p.IdProyecto AND i.IdSite=p.IdSite …`) en una versión revisada del trigger (CREATE OR ALTER, sin cambiar esquema). Verificar con `sys.triggers`.

### 3.5 Auditoría, jobs, operación

#### SQL-18 · Auditoría
- **[H]** `IAuditoriaCambiosService` → `sp_AuditoriaCambios_Registrar` (no versionado; tabla `AuditoriaCambios` sin DDL), usado por Arrendamientos, Asistencia, Cheques, Compensación, Conciliación, Logística… (`grep AuditoriaCambios`). Auditorías propias: `LogPlanilla` (snapshots antes/después), `MovEstadosPagos` (usuario varchar(10) → truncamiento), `ConciliacionAuditoria`, `IaChatAuditoria`, `ViaticoHistorial`, `TR_ViaticoRendicionDetalle_AuditoriaTC`, `ComunicacionEvento`.
- Estado: PARCIAL. **[R]** (1) auditoría fuera de la transacción de negocio y omitida si falta el SP (A6); (2) `sp_Planilla_Insertar/Actualizar` no auditan (se agrega `LogPlanilla` solo en el workflow de pagos); (3) el "usuario" viene del body en varios endpoints (C-críticos) → auditoría repudiable; (4) sin auditoría de **lectura**, clave para detectar accesos externos (SQL-30). Prioridad: P2.
- Rec: mover la auditoría dentro de la tx; usar siempre el usuario del JWT; habilitar SQL Audit/Extended Events de login y SELECT sobre tablas sensibles (config, no esquema).

#### SQL-19 · Jobs: Hangfire vs SQL Agent
- **[H]** `Program.cs:183-198`: Hangfire con `UseSqlServerStorage` en la **misma BD** (`PrepareSchemaIfNecessary=true`, `WorkerCount=5`). Recurring jobs: `MobilePushDispatchJob` (`Program.cs:548`), `AsistenciaSharePointJobScheduler`, `GastosExcelSharePointJobScheduler` (03:00 Lima, activo por defecto), `ReporteWhatsappJobScheduler` (días configurados). Reintentos `AutomaticRetry` 2-3. **SQL Agent: 0 referencias** (`sp_add_job`, `msdb` → 0 en `.sql`/`.cs`). `SqlMonitorWorker` (`CjERP.Api/Services/SqlMonitorWorker.cs`) corre en proceso con `PeriodicTimer` 30 s/1 min/5 min/1 día y llama `sp_Monitor_*` ("JOB" en DATABASE_MAP).
- Estado: IMPLEMENTADO (Hangfire) / NO VERIFICABLE (¿hay SQL Agent jobs en el servidor? p. ej. mantenimiento de índices, backups). Riesgo **[R]**: (a) si se escala el API a >1 réplica, `SqlMonitorWorker` y los `Scheduler` al arrancar duplican capturas; Hangfire serializa recurring jobs pero el worker no; (b) las tablas `Hangfire.*` crecen en la BD de negocio; (c) jobs de mantenimiento (estadísticas/índices) no documentados. Prioridad: P3.
- Rec: documentar inventario de jobs (§9 consulta msdb); limitar `SqlMonitorWorker` a una instancia (`sp_getapplock` o flag de configuración); retención de Hangfire (`JobExpirationTimeout`).

#### SQL-20 · SQL Monitor: DMVs y `KILL`
- **[H]** `SqlMonitorService.cs:70` (sys.dm_exec_sessions/requests), `:532-552` (`KILL {sessionId}` ejecutado desde el endpoint `POST /api/sqlmonitor/cancelar/{id}` para cualquier usuario autenticado, TECHNICAL_DEBT C7); usa `_monitorConnectionString` derivada de `sqlCommandFactory.ConnectionString`. `sp_Monitor_*` (12 SP) sin definición en el repo.
- Estado: PARCIAL. Riesgo: DoS desde cualquier JWT; en Azure SQL DB `KILL` exige `ALTER ANY CONNECTION` y los DMVs `VIEW DATABASE STATE`/`VIEW SERVER STATE` (otras vistas como `sys.dm_os_*` y `sys.dm_exec_connections` cambian). Prioridad: **P1** (seguridad) / P3 (migración).
- Rec: restringir a rol DBA y registrar en auditoría; revisar `sp_Monitor_*` antes de migrar.

#### SQL-21 · Backup, DR, retención y crecimiento
- **[H]** Búsqueda en `docs/**`, `AGENTS.md`, `CjERP.Backend/Docs/**`: **ninguna** mención de backup/restore/RPO/RTO/DR de la BD (los 'respaldo' hallados se refieren a SMTP). Los scripts de Viáticos consultan `recovery_model_desc`, tamaño y crecimiento de archivos (`00g_Diagnostico_Motor_SoloLectura.sql`), es decir el equipo previó revisarlo, pero sin resultados documentados. `sp_Monitor_LimpiarHistorico` (diario) limpia solo el histórico del Monitor.
- Tablas de crecimiento sin retención conocida **[I]**: `LogPlanilla`, `MovEstadosPagos`, `AuditoriaCambios`, `ConciliacionAuditoria`, `IaChatAuditoria`, `Comunicacion*`/`ComunicacionPushEntrega`, `AsistenciaSharePointExportLog`, `GastosExcelSharePointLog`, `ReporteWhatsAppLog`, `Stock*` (ledger), `Hangfire.*`, `Asistencia` (1 fila/empleado/día con coordenadas e imágenes por URL). `Planilla`: 112 485 filas (2026-10-04, doc B12) → volumen pequeño; no es un problema de tamaño sino de recuperabilidad.
- Estado: NO ENCONTRADO. Impacto: sin RPO/RTO acordados ni prueba de restauración; la BD concentra negocio + Hangfire + monitor. Riesgo: **P1** (pérdida de datos financieros).
- Rec: documentar modelo de recuperación, frecuencia de full/diff/log, retención, lugar y **prueba de restauración trimestral**; definir retención por tabla de log (purgas por jobs, sin cambiar esquema). Preguntas en §9.

#### SQL-22 · Aislamiento y bloqueos de lectura
- **[H]** 0 usos de `NOLOCK`/`READ UNCOMMITTED`/`IsolationLevel`; todo corre bajo el aislamiento por defecto del servidor. `is_read_committed_snapshot_on` se consulta en `00g_Diagnostico_Motor_SoloLectura.sql`; el valor real es NO VERIFICABLE.
- **[I]** En Azure SQL DB RCSI está ON por defecto; en SQL Server on-premises OFF por defecto. Cambia el comportamiento de `UPDLOCK/HOLDLOCK`, "MAX+1" y de lecturas durante masivos.
- Estado: NO VERIFICABLE. Prioridad: P3. Rec: medir bloqueos reales (§9) y pruebas de regresión de concurrencia antes de migrar.

#### SQL-23 · Vistas y objetos no versionados
- **[H]** `dbo.vVacaciones` (`VacacionesCorreoService.cs:30`, PDF de vacaciones) no tiene definición en el repo (PV); Logística versiona `vStockConciliacion`/`vStockDescuadres`; Viáticos `vw_ViaticoResumen`. Tipos `TVP_Planilla_Aprobacion`, `PlanillaRevisionType`, `Type_MigracionImport` no versionados (sí `Type_MigracionImportActualizar`).
- Estado: NO ENCONTRADO. Riesgo: ruptura de correo/PDF de vacaciones si cambia la vista; bloqueo de despliegue en nueva BD. Prioridad: P2. Rec: extraer definiciones; añadir a la prueba de humo.

#### SQL-24 · Duplicidad de objetos y de lógica
- **[H]** `sp_MovimientosBcp_*` vs `sp_MovimientosConciliacion_*` (dos tablas, mismo Id IDENTITY independiente: el código actualiza ambas con el **mismo Id**, riesgo de actualizar la fila equivocada); `sp_Planilla_AdministrativoMasivo` (5→4) vs `sp_Planilla_PagoContabilidadMasivo @Opc=2` (8→4); `sp_EmpleadoCj_AprobarCompleto` (repo, sin uso) vs `AprobarEmpleadoDirectoAsync` (C#, 6 copias en 2 controllers); legacy `sp_EmpleadoOtros_*` vs `sp_Vacacion_*`; `sp_a_Contrato_Guardar` en 3 scripts (gana el último ejecutado); menú: SP vs SQL inline. (DATABASE_MAP §4.)
- Estado: DOCUMENTADO. Prioridad: P3. Rec: no tocar sin autorización; elegir una fuente de verdad por proceso al versionar.

#### SQL-25 · Seguridad de datos en la BD
- **[H]** Clave en texto plano (`Database/Mobile/13_Perfil_Cargo_Login.sql`: `sp_ValidarUsuario`, truncada a 10 chars; C4). 0 `GRANT/DENY/CREATE ROLE/CREATE USER/CREATE LOGIN` en los scripts: los permisos del login de la app son NO VERIFICABLES **[I]** (probable `db_owner`/sa dado que el backend ejecuta DDL en caliente: `GastosExcelSharePoint*` "se crean solas si faltan", `PrepareSchemaIfNecessary` de Hangfire). `SqlSettings.Encrypt=false` y `TrustServerCertificate=true` como valores por defecto del código (valor efectivo en producción NO VERIFICABLE; no se leyeron `appsettings`).
- Estado: NO VERIFICABLE. Riesgo: **P1**. Rec: ver §6.

---

## 4. Lógica: qué debe quedarse en SQL, qué ir al backend, qué exponer por API

**[Rec] (sin cambio de esquema; reutiliza lo existente)**

| Capa | Debe quedarse / ir ahí | Evidencia actual |
|---|---|---|
| **SQL (SPs)** | Cambios de estado masivos atómicos (`sp_Planilla_*Masivo`, `ProcesarAprobacionMasiva`), consolidación de consumo OC, motores de reporte set-based (`sp_Planilla_Consulta_Estados`, `sp_OrdenCompra_Consulta_Estados`, `RptAsistenciaFechas`), reglas de integridad (existencia, unicidad lógica) y auditoría de BD | ya implementado así; Viáticos (10-18) es el modelo de referencia (XACT_ABORT, TRY, errores 50xxx) |
| **Backend (.NET)** | Autorización por rol/alcance (hoy ausente), orquestación (SharePoint/Graph/WUP/Meta/Expo/OpenAI), generación de documentos, validaciones de entrada, serialización de "usuario" desde el JWT, retry/idempotencia, generación de `MAX+1` centralizada, reglas dependientes de integraciones | `PagoTesoreriaWorkflow` (huella de versión), `ViaticoPlanillaIntegrationService` (idempotencia con `PLANILLA_INTENTO`) |
| **Sacar de controllers** | SQL en `MantenimientoEmpleados/Externos` y `ContratosController` → servicios con `ISqlCommandFactory` | ver SQL-14 |
| **APIs especializadas (lectura)** | Consultas de integración con DTO mínimos, paginadas y con rol/alcance: (1) estado de pago por `Correlativo+IdWeb` (reutilizar la lógica de `sp_ViaticoInterno_ResolverPago`), (2) consumo/saldo de OC (`sp_Planilla_OC_Resumen`/`sp_OrdenCompra_*`), (3) asistencia por rango (`RptAsistenciaFechas`), (4) vacaciones/beneficio/descanso por empleado, (5) catálogos `Constante` (ya `GET /api/lookup/constantes`), (6) gastos para IA (`sp_IA_Planilla_Buscar` con alcance `IaToolPermiso`) | Revisar `docs/API_MAP.md` antes de crear (regla 24); extender endpoints existentes antes de añadir |

**Patrón existente a reutilizar para agentes IA:** `IaToolPermiso` (`Database/IaChat/08-09`, ScopeLevel/`PermiteTotalesGlobales`) + `sp_IA_Planilla_Buscar` con alcance y lista blanca de dimensiones; es el único componente con matriz de permisos por herramienta.

---

## 5. Hallazgo transversal: controlar el acceso de apps externas (Power Apps, Power Automate, agentes)

#### SQL-26 · No existe barrera técnica frente a lectura directa de tablas operativas
- **[H]** Sin `GRANT/DENY/ROLE` versionados; una única cadena de conexión `DefaultConnection` (más `SqlMonitor`) para todo el backend; API con JWT y `[Authorize]` sin roles; webhooks sin firma (C-críticos); `DbContext/EF` registrado sin uso. Power Platform puede conectarse a SQL Server (conector, puerta de enlace) y a Azure SQL con credenciales/sesión del usuario si el firewall lo permite.
- Estado: NO IMPLEMENTADO / NO VERIFICABLE en BD. Riesgo: **P1** (Planilla expone montos, cuentas bancarias y pagos; `Usuario` contiene claves en texto plano; `EmpleadoCj` datos personales).
- Recomendaciones **[Rec]** (todas de configuración/permisos, no de esquema):
  1. **Login/usuario dedicado por consumidor** y revocar el uso de `sa`/`db_owner` por la app. Rol de aplicación con `EXECUTE` solo sobre los SPs usados (los 250 referenciados) y **sin** `SELECT` directo sobre tablas núcleo salvo donde el backend lo requiere (inline) → primero eliminar inline en controllers (SQL-14).
  2. **Rol de solo lectura "integración"** con `DENY SELECT` sobre esquemas operativos y permiso solo sobre vistas/SPs aprobados (la creación de vistas es aditiva; si no se aprueba ninguna, usar API).
  3. **Red:** firewall/Private Endpoint, IP allow-list solo del host del API; bloquear el conector SQL de Power Platform en la política DLP del tenant (conectores empresariales no permitidos) y no compartir cadenas de conexión.
  4. **Aplicaciones externas consumen solo APIs del ERP** con app-registration (OAuth client-credentials) y claims de rol/alcance; límites de tasa por cliente; respuestas con DTO mínimos (sin cuentas bancarias completas, sin claves).
  5. **Auditoría:** SQL Audit/XEvents por `login_name`/`application_name` (`Application Name` en la cadena para distinguir Power Platform/Hangfire/API) y alerta ante `SELECT` sobre `Planilla`, `Usuario`, `CuentaEmpleado`, `EmpleadoCj` desde un login que no sea el de la API.
  6. Agentes IA (OpenAI/Anthropic de IA Chat): mantener la ejecución mediante herramientas con alcance (`IaToolPermiso`), jamás SQL libre.
- Dependencias: SQL-14, SQL-25, autorización por rol del backend.

---

## 6. Compatibilidad de migración Azure SQL

**[H] = visto en el repo; [I] = inferido; NV = no verificable sin la BD.** "Bloqueante" = impediría Azure SQL Database (DB) pero no Managed Instance (MI) o VM.

| Característica | Evidencia en repo | Azure SQL DB | Azure SQL MI | SQL en VM | Acción |
|---|---|---|---|---|---|
| T-SQL estándar, TVP (`CREATE TYPE … AS TABLE`) | `Mantenimiento/06`; TVP `TVP_Planilla_Aprobacion` | OK | OK | OK | Extraer definiciones |
| `THROW/RAISERROR`, `TRY/CATCH`, `OPENJSON`, `STRING_AGG`, `STRING_SPLIT`, `TRY_CONVERT`, `AT TIME ZONE` (`IaChat/16:240`, 6 scripts) | usados | OK | OK | OK | Requiere compat >= 130/140 (`Viaticos/01` exige >= 140) |
| `sys.sp_getapplock/releaseapplock` | `ViaticoDistributedLock.cs` | OK | OK | OK | — |
| Triggers DML (`Planilla`, `MaterialStock`, etc.) | 5 | OK | OK | OK | Revisar trigger de Planilla (SQL-17) |
| `MERGE`, `IDENTITY`, vistas, funciones | 4 / 40 / 4 vistas | OK | OK | OK | — |
| `USE JC_Db` en scripts | 5 scripts | No soportado (hay que quitarlo) | OK | OK | Quitar `USE` |
| Cross-database / linked servers / OPENROWSET / OPENDATASOURCE / BULK INSERT | **0** en repo | n/a | n/a | n/a | Confirmar en BD (§9) |
| SQL Agent / `msdb` | **0** en repo | **No existe** (Elastic Jobs/Automation/Hangfire) | OK | OK | NV: inventariar jobs reales |
| `xp_cmdshell`, `sp_OACreate`, CLR | **0** | No soportado | CLR sí (SAFE) | OK | Confirmar `sys.assemblies` |
| Service Broker | **0** | No (limitado) | Sí (intra-instancia) | OK | Confirmar `is_broker_enabled` |
| DMVs `sys.dm_exec_*` (SQL Monitor), `sys.dm_db_partition_stats` | `SqlMonitorService.cs:70,532`; `sp_Monitor_*` (NV) | OK con `VIEW DATABASE STATE`; `dm_os_*` limitado | OK | OK | Revisar `sp_Monitor_*` |
| `KILL <spid>` | `SqlMonitorService.cs:552` | OK (con `ALTER ANY CONNECTION`) | OK | OK | Restringir a DBA |
| `sys.databases` (compat/collation/RCSI) | Viáticos 00g | Limitado a la propia BD | OK | OK | — |
| `vVacaciones` y SPs no versionados (129) | SQL-02/SQL-23 | NV | NV | NV | Extraer y probar |
| XML (`FOR XML`, `.nodes`, 5 scripts; `sp_PlanillaBoleta_ImportarXml`) | OK | OK | OK | OK | — |
| Collation / `COLLATE DATABASE_DEFAULT` | scripts de Viáticos | NV (collation de la BD origen) | NV (collation de la instancia) | NV | Mantener collation al restaurar |
| Hangfire en la misma BD (`PrepareSchemaIfNecessary`) | `Program.cs:183-198` | OK (necesita DDL en esquema `HangFire`) | OK | OK | Cuenta con permiso DDL |
| Conexión: `Encrypt=false` por defecto, `TrustServerCertificate=true` | `SqlSettings.cs`, `SqlCommandFactory.cs` | **Debe** ser `Encrypt=true` | Recomendado | Recomendado | Ajustar en configuración (fuera del alcance de esta auditoría tocar `appsettings`) |
| Aplicación **legacy** que escribe directo en BD ("sistema anterior" deja `IdWeb NULL`; FrmBeneficio/FrmLogistic_v1 originales) | B12, AGENTS.md | Requiere conectividad, TLS 1.2, autenticación SQL/Entra | Igual | Igual | Inventariar clientes y drivers |
| Backups propios / restore a otro servidor (`.bak`) | Desconocido | No (BACPAC/PITR gestionado) | Sí (`RESTORE FROM URL`) | Sí | Decidir según apps legacy |
| Tamaño/edición/Express | Viáticos 00g pregunta "Express tiene tope" | Límite por tier | Límite por tier | Límite por edición | NV (§9) |
| Pruebas: SQL Server 2025 (E2E pendiente) / LocalDB 2019 | `TECHNICAL_DEBT` Fase 5 | Compatible hasta nivel soportado | — | — | Correr suite `20_Suites_SQL2025.ps1` |

**Conclusión [I]:** sin evidencia de dependencias a nivel de instancia (linked servers, CLR, cross-DB, xp_cmdshell, Service Broker) en el repositorio, **Azure SQL Database es técnicamente viable** si la BD real tampoco los contiene (§9) y si se resuelven: quitar `USE JC_Db`, reemplazar SQL Agent (si existe) por Hangfire/Elastic Jobs, activar `Encrypt`, ajustar permisos del SQL Monitor y ensayar RCSI/`MAX+1`. **Managed Instance** es la opción de menor riesgo si existen jobs de Agent, apps legacy o `restore` desde `.bak`; **VM** solo si hay dependencias duras (CLR no SAFE, xp_cmdshell, DB mail, linked servers).

---

## 7. Mejoras propuestas SIN cambiar esquema (priorizadas)

| Prioridad | Mejora | Hallazgos |
|---|---|---|
| P1 | Extraer y versionar DDL núcleo, 129 SPs, vistas y TVP (sin ejecutar) | SQL-01, 02, 23 |
| P1 | Documentar y probar backup/restore; RPO/RTO; retención por log | SQL-21 |
| P1 | Cuentas y permisos mínimos (EXECUTE por SP), cierre de acceso directo a tablas, DLP/red | SQL-25, 26 |
| P1 | Escrituras por `Correlativo + IdWeb=1`/clave completa; arreglar trigger y `AsociarPagoNuevoOcSql` | SQL-06, 17 |
| P2 | Centralizar `MAX+1` con `UPDLOCK,HOLDLOCK`/applock | SQL-09, 05 |
| P2 | Una sola tx para OC/Planilla + auditoría | SQL-08, 18 |
| P2 | Mover SQL de controllers a servicios; todas las conexiones por la fábrica | SQL-14 |
| P2 | Fechas: usar `*Date`, medir ambigüedad | SQL-15 |
| P3 | Reintento 1205, límites en reportes, paginación en nuevas APIs | SQL-10, 16 |
| P3 | Inventario de jobs; `SqlMonitorWorker` a una instancia; retención Hangfire | SQL-19 |

---

## 8. Matriz de hallazgos (compacta)

| ID | Componente | Archivo/SP/método | Estado | Prioridad |
|---|---|---|---|---|
| SQL-01 | Modelo / DDL núcleo | `Database/**` (solo fixtures) | NO ENCONTRADO | P1 |
| SQL-02 | SPs no versionados | 129/250 | PARCIAL | P1 |
| SQL-03 | Versionado vs desplegado | scripts NO EJECUTADO, `USE JC_Db` | PARCIAL | P2 |
| SQL-04 | PK/FK/Índices | `Planilla/02_ix_*`, `Viaticos/05,06` | PARCIAL | P2 |
| SQL-05 | `IdOc+Fila` | `OrdenCompraService.cs:1043` | PARCIAL | P2 |
| SQL-06 | `Planilla.Correlativo` | PagoTesoreria*, OC, Conciliación, Viáticos, IA | PARCIAL/DOCUMENTADO | P1 |
| SQL-07 | Estados enteros | `PagoTesoreriaWorkflow.EstadoDestino` | DOCUMENTADO | P2 |
| SQL-08 | TRY/XACT_ABORT/tx | `Asistencia/01`, OC, Planilla | PARCIAL | P2 |
| SQL-09 | `MAX+1` | Mantenimiento*Controller, `04_EmpleadoCj_AprobarCompleto` | PARCIAL | P2 |
| SQL-10 | Concurrencia/deadlock | `sp_Planilla_Insertar`, Workflow | PARCIAL | P2 |
| SQL-11 | Errores en C# | `SqlCommandFactory` | PARCIAL | P3 |
| SQL-12 | SQL dinámico en SPs | 16 scripts | IMPLEMENTADO (lista blanca) | P3 |
| SQL-13 | SQL concatenado C# | tabla §3.3 | IMPLEMENTADO seguro | P3 |
| SQL-14 | SQL en controllers / conexiones directas | 38 `new SqlConnection` | PARCIAL | P2 |
| SQL-15 | Fechas texto | `03_trg_*`, `01_validacion_*` | PARCIAL | P2 |
| SQL-16 | Paginación | solo IA/Mobile/Logística | PARCIAL | P3 |
| SQL-17 | Trigger fechas | `03_trg_Planilla_SincronizarFechasDate.sql` | PARCIAL/NV | P2 |
| SQL-18 | Auditoría | `sp_AuditoriaCambios_Registrar`, `LogPlanilla` | PARCIAL | P2 |
| SQL-19 | Jobs Hangfire/Agent | `Program.cs`, Schedulers, `SqlMonitorWorker` | IMPLEMENTADO / NV | P3 |
| SQL-20 | SQL Monitor / KILL | `SqlMonitorService.cs:552` | PARCIAL | P1 |
| SQL-21 | Backup/DR/crecimiento | docs | NO ENCONTRADO | P1 |
| SQL-22 | Aislamiento (RCSI) | `00g_Diagnostico_Motor` | NO VERIFICABLE | P3 |
| SQL-23 | Vistas/TVP no versionados | `dbo.vVacaciones` | NO ENCONTRADO | P2 |
| SQL-24 | Duplicidades | DATABASE_MAP §4 | DOCUMENTADO | P3 |
| SQL-25 | Seguridad en BD | `Mobile/13`, 0 GRANT | NO VERIFICABLE | P1 |
| SQL-26 | Acceso apps externas | §5 | NO IMPLEMENTADO | P1 |

Para cada hallazgo, "Dependencias" = los hallazgos citados en su ficha; todos dependen en último término del acceso de solo lectura a la BD (§9) para convertir inferencias en hechos.

---

## 9. Preguntas que requieren acceso a la BD real (consultas de SOLO LECTURA, para aprobación posterior)

No se ejecutaron. Todas son `SELECT` sobre catálogos/DMVs; las marcadas (MI/VM) no aplican a Azure SQL DB. Ejecutar fuera de hora pico; sin `SELECT *` sobre tablas de datos.

**9.1 Preguntas**
1. Versión, edición, nivel de compatibilidad, collation, modelo de recuperación, RCSI, Query Store (¿SQL Server 2019/2022/2025? ¿Express?).
2. Tamaño de la BD, archivos, crecimiento y mayores tablas (incluye Hangfire).
3. ¿Existen SQL Agent jobs? ¿Cuáles, horario, propietario? ¿Backups: tipo, frecuencia, destino, última restauración probada?
4. ¿Linked servers, CLR, Service Broker, Database Mail, xp_cmdshell, referencias cross-DB?
5. Permisos reales del login de la API y de otros logins/aplicaciones (`db_owner`, `sa`).
6. ¿Qué SPs/vistas/tipos existen realmente vs los 250 referenciados? ¿cuántos objetos temporales/backup (B9)?
7. ¿Índices faltantes/no usados/fragmentados en `Planilla`, `Asistencia`, `DetOrdenCompra`, `EmpleadoCj`?
8. ¿Cuántos correlativos duplicados hoy y quiénes los generan? ¿Triggers vigentes en `Planilla`?
9. ¿Cuántas fechas de texto son ambiguas o no parseables?
10. ¿Deadlocks/bloqueos recientes y consultas más costosas?
11. ¿Quiénes se conectan a la BD (hosts, programas, versiones de driver)?

**9.2 Consultas propuestas (solo lectura)**
```sql
-- Q1 Versión, edición, compatibilidad, RCSI, Query Store, recuperación
SELECT @@VERSION AS version, SERVERPROPERTY('Edition') AS edicion, SERVERPROPERTY('EngineEdition') AS motor,
       d.name, d.compatibility_level, d.collation_name, d.recovery_model_desc,
       d.is_read_committed_snapshot_on, d.snapshot_isolation_state_desc, d.is_query_store_on, d.page_verify_option_desc
FROM sys.databases d WHERE d.name = DB_NAME();

-- Q2 Tamaño y crecimiento de archivos + mayores tablas
SELECT name, type_desc, size*8/1024 AS mb, CASE max_size WHEN -1 THEN 'sin limite' ELSE CONVERT(varchar(20), max_size*8/1024) END AS max_mb, growth, is_percent_growth
FROM sys.database_files;
SELECT TOP (25) s.name AS esquema, t.name AS tabla, SUM(ps.row_count) AS filas, SUM(ps.used_page_count)*8/1024 AS usado_mb
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
JOIN sys.dm_db_partition_stats ps ON ps.object_id=t.object_id AND ps.index_id IN (0,1)
GROUP BY s.name, t.name ORDER BY usado_mb DESC;

-- Q3 SQL Agent y backups (MI/VM; en Azure SQL DB no existe msdb)
SELECT j.name, j.enabled, s.name AS schedule, s.freq_type, s.active_start_time, j.date_modified FROM msdb.dbo.sysjobs j
LEFT JOIN msdb.dbo.sysjobschedules js ON js.job_id=j.job_id LEFT JOIN msdb.dbo.sysschedules s ON s.schedule_id=js.schedule_id;
SELECT TOP (60) database_name, type, backup_start_date, backup_finish_date, backup_size/1048576 AS mb, compressed_backup_size/1048576 AS mb_comp
FROM msdb.dbo.backupset WHERE database_name = DB_NAME() ORDER BY backup_finish_date DESC;

-- Q4 Dependencias de instancia
SELECT name, product, provider FROM sys.servers WHERE is_linked = 1;                       -- linked servers
SELECT name, permission_set_desc FROM sys.assemblies WHERE is_user_defined = 1;            -- CLR
SELECT name, is_broker_enabled, is_trustworthy_on FROM sys.databases WHERE name = DB_NAME();
SELECT DISTINCT referenced_server_name, referenced_database_name, OBJECT_NAME(referencing_id) AS objeto
FROM sys.sql_expression_dependencies WHERE referenced_database_name IS NOT NULL OR referenced_server_name IS NOT NULL;
SELECT OBJECT_NAME(object_id) AS modulo FROM sys.sql_modules
WHERE definition LIKE '%xp_cmdshell%' OR definition LIKE '%OPENROWSET%' OR definition LIKE '%OPENQUERY%' OR definition LIKE '%sp_OACreate%' OR definition LIKE '%msdb.%' OR definition LIKE '%sp_send_dbmail%';

-- Q5 Permisos del login de la aplicación
SELECT dp.name AS usuario, dp.type_desc, r.name AS rol FROM sys.database_principals dp
LEFT JOIN sys.database_role_members m ON m.member_principal_id=dp.principal_id
LEFT JOIN sys.database_principals r ON r.principal_id=m.role_principal_id WHERE dp.type IN ('S','U','G','E','X') ORDER BY dp.name;
SELECT grantee_principal_id, permission_name, state_desc, OBJECT_NAME(major_id) AS objeto FROM sys.database_permissions;

-- Q6 Objetos existentes (comparar con la lista de 250 referenciados)
SELECT s.name AS esquema, p.name, p.modify_date FROM sys.procedures p JOIN sys.schemas s ON s.schema_id=p.schema_id ORDER BY p.name;
SELECT name, type_desc, modify_date FROM sys.objects WHERE type IN ('V','TR','FN','IF','TF') ORDER BY type_desc, name;
SELECT name FROM sys.table_types;                       -- TVP
SELECT name, create_date FROM sys.procedures WHERE name LIKE '%Backup%' OR name LIKE '%_old%' OR name LIKE '%_bak%';  -- B9
SELECT OBJECT_NAME(object_id) AS modulo FROM sys.sql_modules WHERE (definition LIKE '%sp_executesql%' OR definition LIKE '%EXEC(%' OR definition LIKE '%EXEC (%') AND OBJECTPROPERTY(object_id,'IsProcedure')=1;

-- Q7 Índices faltantes, no usados y fragmentación (LIMITED)
SELECT TOP (30) OBJECT_NAME(d.object_id) AS tabla, d.equality_columns, d.inequality_columns, d.included_columns,
       s.user_seeks, s.user_scans, s.avg_total_user_cost*s.avg_user_impact*(s.user_seeks+s.user_scans) AS mejora
FROM sys.dm_db_missing_index_details d JOIN sys.dm_db_missing_index_groups g ON g.index_handle=d.index_handle
JOIN sys.dm_db_missing_index_group_stats s ON s.group_handle=g.index_group_handle WHERE d.database_id=DB_ID() ORDER BY mejora DESC;
SELECT OBJECT_NAME(i.object_id) AS tabla, i.name, ISNULL(u.user_seeks,0) seeks, ISNULL(u.user_scans,0) scans, ISNULL(u.user_lookups,0) lookups, ISNULL(u.user_updates,0) updates
FROM sys.indexes i LEFT JOIN sys.dm_db_index_usage_stats u ON u.object_id=i.object_id AND u.index_id=i.index_id AND u.database_id=DB_ID()
WHERE OBJECTPROPERTY(i.object_id,'IsUserTable')=1 AND i.type_desc<>'HEAP' ORDER BY updates DESC;
SELECT TOP (30) OBJECT_NAME(object_id) tabla, index_id, avg_fragmentation_in_percent, page_count
FROM sys.dm_db_index_physical_stats(DB_ID(), OBJECT_ID('dbo.Planilla'), NULL, NULL, 'LIMITED') WHERE page_count > 1000;

-- Q8 Claves e integridad del núcleo
SELECT t.name AS tabla, kc.name AS pk, STRING_AGG(c.name, ',') WITHIN GROUP (ORDER BY ic.key_ordinal) AS columnas
FROM sys.tables t JOIN sys.key_constraints kc ON kc.parent_object_id=t.object_id AND kc.type='PK'
JOIN sys.index_columns ic ON ic.object_id=t.object_id AND ic.index_id=kc.unique_index_id
JOIN sys.columns c ON c.object_id=t.object_id AND c.column_id=ic.column_id
WHERE t.name IN ('Planilla','CabOrdenCompra','DetOrdenCompra','EmpleadoCj','Empleado','Usuario','Constante','Asistencia','EmpleadoOtros') GROUP BY t.name, kc.name;
SELECT OBJECT_NAME(parent_object_id) AS tabla, name, OBJECT_NAME(referenced_object_id) AS referencia FROM sys.foreign_keys;
SELECT COUNT(*) AS filas, COUNT(DISTINCT Correlativo) AS correlativos, COUNT(*)-COUNT(DISTINCT Correlativo) AS repetidas FROM dbo.Planilla;
SELECT name, is_disabled FROM sys.triggers WHERE parent_id = OBJECT_ID('dbo.Planilla');
SELECT c.name, t.name AS tipo, c.max_length, c.is_nullable FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id
WHERE c.object_id=OBJECT_ID('dbo.Planilla') AND c.name IN ('IdOc','Fila','FecEmision','FecIngreso','FechaDeposito','FecIngresoDate','FechaDepositoDate','Comentario','IdWeb');
-- huérfanos Planilla -> DetOrdenCompra (IdOc varchar)
SELECT COUNT(*) FROM dbo.Planilla p WHERE NULLIF(LTRIM(RTRIM(p.IdOc)),'') IS NOT NULL AND TRY_CONVERT(int,p.IdOc)>0
AND NOT EXISTS (SELECT 1 FROM dbo.DetOrdenCompra d WHERE d.IdOc=TRY_CONVERT(int,p.IdOc) AND d.Fila=p.Fila);

-- Q9 Fechas de texto: no parseables y ambiguas (dd/mm vs mm/dd)
SELECT SUM(CASE WHEN NULLIF(LTRIM(RTRIM(FecIngreso)),'') IS NOT NULL AND TRY_CONVERT(date,FecIngreso,101) IS NULL AND TRY_CONVERT(date,FecIngreso,103) IS NULL AND TRY_CONVERT(date,FecIngreso,23) IS NULL THEN 1 ELSE 0 END) AS no_parseables,
       SUM(CASE WHEN TRY_CONVERT(date,FecIngreso,101) IS NOT NULL AND TRY_CONVERT(date,FecIngreso,103) IS NOT NULL AND TRY_CONVERT(date,FecIngreso,101)<>TRY_CONVERT(date,FecIngreso,103) THEN 1 ELSE 0 END) AS ambiguas
FROM dbo.Planilla;

-- Q10 Deadlocks y bloqueos (system_health) y consultas costosas
SELECT TOP (20) CONVERT(xml, event_data).value('(event/@timestamp)[1]','datetime2') AS ts, CONVERT(xml, event_data) AS grafo
FROM sys.fn_xe_file_target_read_file('system_health*.xel', NULL, NULL, NULL) WHERE object_name='xml_deadlock_report' ORDER BY 1 DESC;   -- (MI/VM)
SELECT TOP (25) qs.total_elapsed_time/qs.execution_count AS avg_us, qs.execution_count, SUBSTRING(st.text,1,200) AS sql
FROM sys.dm_exec_query_stats qs CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st ORDER BY avg_us DESC;

-- Q11 Quién se conecta (programas, hosts, drivers)
SELECT s.login_name, s.host_name, s.program_name, c.client_net_address, c.protocol_version, COUNT(*) AS sesiones
FROM sys.dm_exec_sessions s JOIN sys.dm_exec_connections c ON c.session_id=s.session_id WHERE s.is_user_process=1
GROUP BY s.login_name, s.host_name, s.program_name, c.client_net_address, c.protocol_version ORDER BY sesiones DESC;

-- Q12 Definición de vistas/SP críticos (para versionar)
SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.vVacaciones')) AS vVacaciones;
```
Notas: Q3/Q10 (xevents) requieren permisos de instancia; Q11 requiere `VIEW SERVER STATE`/`VIEW DATABASE STATE`; ninguna escribe ni modifica.

---

## 10. Supuestos y límites

- No se leyeron valores de `appsettings*`, cadenas de conexión ni secretos; los valores por defecto citados (`SqlSettings`) son los de la clase.
- Los conteos provienen de `grep` y pueden variar por patrones; son orientativos (±5).
- Toda afirmación sobre la BD real (índices, FK, permisos, jobs, backups, versión) es inferencia hasta ejecutar §9.
- Este informe no cambia reglas de negocio ni esquema; las recomendaciones de código requieren aprobación y análisis de dependencias (FE→API→Controller→Service→SP→Tablas) antes de implementarse.
