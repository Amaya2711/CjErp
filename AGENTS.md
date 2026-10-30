# Cj ERP Web

Memoria operativa del proyecto. Corta y de consulta rápida; el detalle está en `docs/`.
**Fuente única para todos los agentes** (Codex lee `AGENTS.md`; Claude Code lo importa desde `CLAUDE.md`). Editar solo este archivo; no duplicar su contenido en `CLAUDE.md`.
Fuente de verdad: **1) código actual → 2) este archivo → 3) docs/**. Si docs y código difieren, **manda el código**: informar la inconsistencia y actualizar la doc.
Última revisión integral: 2026-09-25 (commit `c2f1825`). "PV" = PENDIENTE DE VALIDACIÓN.

> ⚠ El repo git real es **esta carpeta** (`Cj-Erp-Web/`). La carpeta padre `Cj_ERP_Web/` es otro repo con un snapshot antiguo (todo figura "deleted"): no trabajar ni commitear allí.

## Objetivo del sistema
ERP web de CJ Telecom (Perú): recibos/gastos y pagos de tesorería, órdenes de compra, conciliación bancaria, RRHH (empleados, contratos, vacaciones, días compensatorios, boletas), asistencia de campo, reportes gerenciales y automáticos por WhatsApp, arrendamientos, comunicaciones a app móvil y chat IA sobre gastos.

## Arquitectura
```
React (features/*.tsx) → src/api/*Service.ts → httpClient (axios, /api, JWT) → Vercel rewrite → Railway
→ CjERP.Api/Controllers ([Authorize] sin roles) → CjERP.Infrastructure/Services (Dapper vía ISqlCommandFactory)
→ SQL Server: dbo.sp_* (mayoría) o SQL inline   ·   Hangfire (misma BD) · Graph/SharePoint · WUP · OpenAI · Anthropic · SMTP
```
Detalle: `docs/ARCHITECTURE.md`.

## Stack tecnológico
- FE: React 19 + TypeScript 5.9 + Vite 8, react-router 7, axios, recharts, xlsx, jspdf, lucide-react, Tailwind 4 (poco). DevExtreme instalado pero **solo** en `pagos_dev.tsx` → **no usar**.
- BE: .NET 8, ASP.NET Core, **Dapper** (EF Core registrado pero sin uso), Hangfire, QuestPDF, MailKit, ClosedXML, JWT.
- BD: SQL Server. ~183 SPs referenciados; solo ~61 versionados en `CjERP.Backend/Database/`.
- Deploy: BE Docker/Railway; FE Vercel. Sin CI.

## Estructura del proyecto
```
CjERP.Backend/  CjERP.Api (Program.cs, Controllers, Jobs, Services*, Middleware) · CjERP.Application (solo DTOs + interfaces)
                CjERP.Infrastructure (Services, 3 Repositories, SqlCommandFactory) · CjERP.Shared (Configuration) · CjERP.Domain (vacío)
                Database/<Modulo>/*.sql · Docs/IAChat.md · Tests/PagoTesoreriaChecks
cjerp-frontend/src/  api/ · app/router/AppRouter.tsx · layouts/MainLayout.tsx · components/base/ · components/lookups/
                     hooks/ · features/<modulo>/ · models/ · utils/
docs/            ARCHITECTURE · MODULES · API_MAP · DATABASE_MAP · PROCESS_MAP · BUSINESS_RULES · INTEGRATIONS · TECHNICAL_DEBT
```

## Frontend
- Nueva página: `features/<modulo>/<pagina>.tsx` + ruta lazy en `app/router/AppRouter.tsx` + ítem en `SegMenu` (BD) con la **misma ruta**.
- HTTP **siempre** con `src/api/httpClient.ts` (desenvuelve `{success,data}`, rechaza `success:false`, 401 → login). Errores: `utils/httpError.ts#getHttpErrorMessage`.
- Reutilizar: `components/base/` (AppPage, AppCard, DataGridBase, StoredProcedureGrid, SidePanelForm, CrudToolbar, ConfirmDialog, InputBase, SelectBase, AppStatusMessage, ToolbarFiltro, PlaceholderPage), `components/datagrid/DataGridPro` (grilla avanzada: agrupar, filtros, resumen, edición, export; reemplaza la necesidad de DevExtreme), `components/lookups/FiltroOperativoLookup`, hooks `useConstantesPorCampo`, `useCrudForm`, `useFiltroOperativoLookup`, utils `sharepoint`, `imageCompression`, `authStorage`.
- **REGLA — GRIDS**: toda grilla/tabla de datos nueva (carga de Excel, reportes, listados, resultados) **debe** usar `components/datagrid/DataGridPro` (`GridColumn` de `components/datagrid/types`; ejemplo mínimo: `features/finanzas/tesoreria/cheques.tsx`, `features/reportes/gerencial/ventassunat.tsx`). No crear `<table>` manuales ni nuevas grillas propias; `DataGridBase`/`StoredProcedureGrid` solo se mantienen donde ya existen. Si falta una capacidad, extender `DataGridPro`.
- Estilo dominante: estilos inline tipados. Sin store global. Grillas propias (DataGridBase). Excel `xlsx` y PDF `jspdf` con import dinámico. Gráficos `recharts`.

## Backend
- Patrón: Controller → `I<X>Service` (Application/Interfaces) → `<X>Service` (Infrastructure) → `ISqlCommandFactory.CreateConnection()` + `Create("dbo.sp_X", params, CommandType.StoredProcedure, ct)` + Dapper. Registrar en `Program.cs` (Scoped).
- Respuesta: `Ok(new { success = true, message, data })` / `BadRequest(new { success = false, message })`.
- Auditoría: reutilizar `IAuditoriaCambiosService` (`sp_AuditoriaCambios_Registrar`).
- Catálogos: `Constante` vía `sp_Constante_ListarPorCampo` / `GET /api/lookup/constantes?campo=`.
- Jobs: Hangfire (`CjERP.Api/Jobs`, schedulers en `CjERP.Api/Services`).
- **Correo (regla)**: enviar siempre por `ISmtpMailSender` (Application/Interfaces/Services), que usa **Microsoft Graph primero** (`IGraphMailSender`, remitente `TI2@cj-telecom.com`) y SMTP solo como respaldo. **No** abrir `MailKit.SmtpClient` directo en código nuevo: el SMTP saliente da timeout desde Railway. No bloquear la acción de negocio esperando el correo (enviar en segundo plano o tolerar el fallo) ni loguear/mostrar credenciales. Detalle y requisitos de Azure (Mail.Send): `docs/INTEGRATIONS.md`.
- **No replicar** desviaciones existentes: SQL en controllers (MantenimientoEmpleados/Externos, Contratos), `new SqlConnection` directo, estado estático en memoria.

## Base de datos
- "Planilla" = tabla **`dbo.Planilla` de recibos/gastos** (no nómina). Nómina = `PlanillaBoleta*`.
- Tablas núcleo sin DDL en repo: Planilla, CabOrdenCompra/DetOrdenCompra, EmpleadoCj(+Detalle), Empleado (legacy), Usuario, Constante, Seg*, Asistencia, EmpleadoOtros. Validar columnas en BD antes de usarlas.
- Relación clave: `Planilla.IdOc + Fila → DetOrdenCompra`; "pagado" = `Planilla.Estado = 4`.
- Inventario completo de SPs y tablas: `docs/DATABASE_MAP.md`.

## Seguridad
- Login `POST /api/auth/login` → `sp_ValidarUsuario` (clave en texto plano) → JWT HS256 30 min (claims: IdUsuario, NombreEmpleado, Correo, CodEmp, IdEmpleadoCj, IdCargo, CodVal, Cuadrilla, IdPerfil, IdRol, SessionId) + sesión en memoria (idle 30 min en el servidor, respaldo; la web cierra sesión a los **10 min sin uso** y renueva el token con `POST /api/auth/refresh` cada ≤5 min mientras hay uso). Token en `localStorage["authUser"]`.
- Menú dinámico: `GET /api/menu/dinamico` → `sp_Seguridad_ObtenerMenuDinamico` (Usuario → SegUsuarioPerfilRol → SegPerfilRol → SegPerfilRolMenu → SegMenu).
- Permisos por acción/pestaña: tabla `SegPermisoAccion` (`/api/seguridad-permisos-acciones`), usados **solo en FE** (`pagos_v1`, `oc_v1`). Bypass FE perfil 8 + rol 5.
- ⚠ Backend **sin autorización por rol** (solo JWT). Excepciones: `PagoTesoreriaController` (ruta en menú), `MobileMonitorController` (rol 5), reportes WUP / export SharePoint (acceso administrativo).
- Secretos: ver `docs/TECHNICAL_DEBT.md` C6. Nunca mostrar ni copiar valores de `appsettings*.json`, `.env`, constantes de token.

## Módulos
Seguridad · Tesorería/Finanzas (recibos, pagos, cheques, conciliación) · Orden de Compra · RRHH (vacaciones, contratos, ficha, compensación días, boletas) · Mantenimiento (empleados, externos, migración, auditoría) · Administración (pendientes, export asistencia, comunicaciones móviles) · Operaciones/Asistencia (aprobar campo, seguimiento, suministro, reembolso) · Logística (recojo) · Reportes (asistencia, gerenciales, WUP, IA chat, SQL monitor) · Arrendamientos · Mobile (API para app Expo). Stubs: comercial, planta, contabilidad, compras, inicio. Detalle: `docs/MODULES.md`.

## Índice rápido de funcionalidades
> FE = `cjerp-frontend/src/`, C = `CjERP.Api/Controllers/`, S = `CjERP.Infrastructure/Services/`. Endpoints completos en `docs/API_MAP.md`.

### Recibos / gastos (tabla Planilla)
- FE: `features/finanzas/tesoreria/gastos.tsx` (registro), `pagos_v1.tsx` (**aprobaciones**), `pagos_v2.tsx` (copia de v1 con `DataGridPro`; mismos servicios y permisos de `pagos_v1`), `gastosaprobar.tsx`; API `api/planillaConsultaService.ts`
- BE: C/TesoreriaGastosController, C/PlanillaConsultaController → S/PlanillaService, S/PlanillaConsultaService
- SP: `sp_Planilla_Insertar`, `sp_Planilla_Actualizar`, `sp_Planilla_ActualizarEstado`, `sp_Planilla_ProcesarAprobacionMasiva`, `sp_Planilla_Consulta_Estados` (consulta genérica; `consulta` elige SP), `sp_Planilla_Consulta_Aprobar`, `sp_Finanzas_CargarValoresGasto`
- Tablas: Planilla, Constante, CuentaEmpleado, Empleado/EmpleadoCj
- **pagos_v2 · carga en 2 tiempos (SQL 13/14 creados en JC_Db y validados el 29/10/2026: 0 diferencias frente a `sp_Planilla_Consulta_Estados` en la bandeja Aprobar; PV: otras pestañas e índices 15)**: la grilla pide `consulta="pagos-v2-ligero"` → `sp_Planilla_Consulta_Estados_Ligero` (mismas columnas/filtros que `sp_Planilla_Consulta_Estados`, sin agregados financieros; scripts `Database/Planilla/13`) y luego `consulta="pagos-v2-totales"` → `sp_Planilla_Consulta_Estados_Totales(@Correlativos, TipoCambio*)` (script `14`; totales pagados por OT/sitio, Importar, pagado por OC/Fila y agrupación bancaria solo de los correlativos mostrados; devuelve `Corre`+`IdSite`). El FE funde esas 12 columnas en las filas sin cambiar su `id`. Si el SP ligero falla de inmediato (500 en <15 s) vuelve a `pagos-v1`; se desactiva con `localStorage["pagosV2Ligero"]="0"`. Índices `Planilla/12`, `15`, `Finanzas/13`. Equivalencia: `Planilla/16_validacion_ligero_totales_SoloLectura.sql`. Detalle de rendimiento del SP original: `Planilla/11` (OPTION RECOMPILE + columnas `FecIngresoDate/FechaDepositoDate`). Aprobar/re-aprobar/observar/rechazar masivo en `pagos_v2` va en **bloques de 40** (`aprobarPlanillaMasivaPorBloques`, `BLOQUE_APROBACION_MASIVA`): se detiene en el primer error y reintenta ante 429 (límite global 120 peticiones/min). `mainColumns` está memoizado para no reprocesar la grilla con cada setState. `Planilla/17` = ligero v2 (z/z1 → EXISTS). Pestañas de `pagos_v2`: se abre en **Total Órdenes sin consultar** (solo con Buscar); cada pestaña conserva filtros y datos de su primera carga (caché por pestaña, incluida la suma por responsable) y solo se vuelve a consultar con el botón **Actualizar** o tras aprobar/observar/rechazar; mientras carga muestra "Cargando información de …".
- Procesos: registro → aprobación (1ª/2ª, observar, rechazar) → tesorería

### Viáticos (copia de gastos filtrada por tarea)
- FE: `features/finanzas/tesoreria/viaticos.tsx` (copia de `gastos.tsx`; ruta `/finanzas/tesoreria/viaticos`, ítem `SegMenu` PV) + `ViaticosResumen.tsx` (pestaña **Resumen**); mismos servicios, endpoints y tabla `Planilla` que gastos (no hay backend propio)
- Solo tarea VIATICO: constante `ID_TAREA_VIATICO = 93`; todas las consultas envían `IdTarea=93` a `sp_Planilla_Consulta_Estados` (param. `@IdTarea`, script de referencia `Database/Planilla/07_...idtarea.sql`); en "Nuevo viático" la Tarea es una lista con solo VIATICO, preseleccionada
- Resumen: filtros Cliente-Proyecto-Site (`FiltroOperativoLookup`), Solicitante y Responsable (multiselección con autollenado; sin filtros listan todo el catálogo, con filtros solo lo existente en los datos), rango de fechas y moneda; KPIs, gráficos (mensual, estado, Top solicitantes/responsables/clientes/proyectos/sites/tipo de trabajo, diario) y cuadros por responsable y solicitante con suma por moneda. Montos siempre en la moneda real del recibo (sin convertir); pagados (estado 4) se ubican por fecha de depósito
- Etiquetas visibles dicen "viático(s)" en lugar de "gasto(s)"

### Pago de tesorería
- FE: `features/finanzas/tesoreria/pagartesoreria.tsx` (+`PagoEtapaForm.tsx`, `PagoRevisionCells.tsx`), `pagartesoreria_v1.tsx`, `pagartesoreria_v2.tsx` (copia de v1 con `DataGridPro`; edición de Revisión en `usePagoRevisionEditor.tsx`); API `api/pagoTesoreriaService.ts`
- BE: C/PagoTesoreriaController → S/PagoTesoreriaService, PagoTesoreriaWorkflow (`EstadoDestino`), PagoTesoreriaRevision
- SP: `sp_Planilla_ActualizarRevisionMasiva`, `sp_Planilla_ContabilidadMasivo`, `sp_Planilla_PasarAdministrativoMasivo`, `sp_Planilla_ProgramarMasivo`, `sp_Planilla_AdministrativoMasivo`, `sp_Planilla_PagoContabilidadMasivo`, `sp_Planilla_ActualizarRendirMasivo`, `sp_Planilla_ConsultaIni`, `sp_Planilla_ReporteResumen`
- Tablas: Planilla, LogPlanilla, MovEstadosPagos · Doc: `CjERP.Backend/Database/Finanzas/PagosTesoreria.md`
- Estados: 1 revisión → 9 contabilidad → 8 programado / 5 administrativo → 4 pagado; 7 observada

### Orden de compra
- FE: `features/finanzas/facturacionfinanciera/oc_v1.tsx` (activa), `oc_v2.tsx` (copia de v1 con `DataGridPro` en bandeja, detalle, monto y recibos; reporte sin cambios), `oc.tsx` (legacy); API `api/ordenCompraService.ts`
- BE: C/OrdenCompraController → S/OrdenCompraService, S/OrdenCompraPdfDocument
- SP: `sp_OrdenCompra_Insertar`, `sp_OrdenCompra_BuscarCabecera`, `sp_OrdenCompra_BuscarDetalle`, `sp_OrdenCompra_RechazarMasivo`, `sp_OrdenCompra_Consulta_Estados`
- Tablas: CabOrdenCompra, DetOrdenCompra, Planilla (IdOc/Fila)
- Procesos: alta → aprobación nivel 1→2→3 (IdEstado 0→1; 6 rechazada) → asociar recibos → consumo/PDF

### Cheques
- FE: `features/finanzas/tesoreria/cheques.tsx`; API `api/chequeService.ts` · BE: C/TesoreriaChequesController → S/ChequeEmpleadoService · SP: `sp_ChequeEmpleado_Listar/Obtener/Insertar/Actualizar`

### Conciliación bancaria
- FE: `features/finanzas/conciliacion_v1.tsx` (multibanco), `conciliacion.tsx` (BCP); API `api/conciliacionService.ts`
- BE: C/FinanzasConciliacionController → S/ConciliacionBcpService
- SP: `sp_MovimientosConciliacion_Insertar/Buscar/ActualizarClasificacionContable`, `sp_MovimientosBcp_*`, `sp_Planilla_Consulta_Estados`
- Tablas: MovimientosConciliacion, MovimientosBcp, Bancos, PlantillasBanco* · Integración: OpenAI (opcional)

### Vacaciones
- FE: `features/recursoshumanos/vacacionespage.tsx` (activa), `vacaciones.tsx` (legacy); API `api/vacacionesService.ts`
- BE: C/VacacionesController → S/VacacionesService
- SP legacy (en uso): `sp_EmpleadoOtros_GrabarVacaciones`, `sp_EmpleadoOtros_ActualizaarVacaciones`, `sp_EmpleadoOtros_ListarVacaciones(Total)` · SP modelo nuevo (sin UI): `sp_Vacacion_*`
- Tablas: EmpleadoOtros (legacy), VacacionPolitica/Periodo/Solicitud/Movimiento (nuevo)
- Estados legacy: 97 → 98 → 99; 0 rechazado
- Al aprobar la **3ra validación** (IdEstadoActual 99) se envía por correo el PDF de la solicitud (S/VacacionesCorreoService + VacacionesPdfDocument, correo vía S/SmtpMailSender (Graph → SMTP)) a `Constante` campo `correo_vacaciones` con `ValorFin=1` (correo en `ValorIni`, PV); datos del PDF desde `dbo.vVacaciones` (PV: no versionada). Un fallo del correo no revierte la aprobación.

### Beneficios (adelanto de sueldo / préstamo)
- FE: `features/recursoshumanos/beneficio.tsx` (ruta `/recursoshumanos/beneficio`; pestañas Adelanto, Préstamo, Aprobar, Reporte); API `api/beneficioService.ts` · BE: C/BeneficioController (`/api/admin/beneficios`) → S/BeneficioService, BeneficioPdfDocument (QuestPDF), correo vía S/SmtpMailSender (Graph → SMTP)
- SP: `sp_Beneficio_ListarEmpleados/Registrar/Listar/Detalle/Aprobar/Rechazar` (scripts `Database/Recursoshumanos/06`, menú `07`; PV: no ejecutados en BD real) · Tablas existentes: cabBeneficio, DetBeneficio, EmpleadoCj.IdAptoBeneficio, Constante (`CORRELATIVO`/7, `BENEFICIO`, `APROBADO_PAGO_BENEFICIO`, `correo_beneficio`)
- Reglas (de FrmBeneficio): empleado cargo 50 y estado 1; `IdAptoBeneficio = 2` = no apto; tipo 1 = préstamo (cuotas), 2 = adelanto (siempre 1 cuota; el préstamo admite 1 a 60); IdAprobado 0 pendiente / 1 aprobado / 2 rechazado. Al aprobar se envía el PDF a `Constante correo_beneficio` con `ValorFin=1` (correo en `ValorIni`, PV); un fallo del correo no revierte la aprobación. Aprobador/usuario salen del JWT. Al rechazar, el empleado vuelve a apto (`IdAptoBeneficio = 1`, PV) si no tiene otro beneficio pendiente o aprobado (mejora sobre el original).

### Descanso médico
- FE: `features/recursoshumanos/descansomedico.tsx` (ruta `/recursoshumanos/descansomedico`; pestañas Ingreso, Aprobar con 4 etapas, Reporte); API `api/descansoService.ts` · BE: C/DescansoController (`/api/admin/descanso`) → S/DescansoService, DescansoPdfDocument (QuestPDF), correo vía S/SmtpMailSender (Graph → SMTP), adjunto a SharePoint (`ISharePointCommercialUploadService`, carpeta `DESCANSO_MEDICO`)
- SP: `sp_Descanso_ListarEmpleados/Registrar/Listar/Aprobar/Rechazar/Carta` (scripts `Database/Recursoshumanos/08`, menú `09`; PV: no ejecutados en BD real) · Tablas existentes: EmpleadoDescanso (una fila por día), Asistencia, Constante (`ESTADO_ASISTENCIA`, `correo_DESCANSO`)
- Etapas (IdEstado): 97 → 98 → 99 → 100 → 5 aprobado; 0 rechazado (rechazable desde 4, 97, 98, 99). Al aprobar la etapa final (100 → 5) se marca `Asistencia.IdEstado = 5` en el rango y se envía el PDF a `Constante correo_DESCANSO` con `ValorFin=1` (correo en `ValorIni`, PV); un fallo del correo no revierte la aprobación. Aprobador/usuario salen del JWT.
- Sin bloqueos en código: todo activo; solo se bloquea con filas de `SegPermisoAccion` por usuario (puedeVer/puedeEjecutar en NO) para `tab.ingreso/aprobar/reporte`, `tab.aprobacion_1..4`, `button.grabar/aprobar/rechazar`.

### Compensación (días compensatorios)
- FE: `features/recursoshumanos/compensacionreal.tsx`; API `api/compensacionService.ts` · BE: C/CompensacionController (`/api/admin/compensacion`) → S/CompensacionService · SP: `sp_EmpleadoCompensacion*` · Estados 97 → 98 → 9; 22 rechazado

### Contratos laborales
- FE: `features/recursoshumanos/contratos.tsx`; API `api/contratosService.ts` · BE: C/ContratosController (SQL inline) · SP: `sp_EmpleadoCj_Ficha` · Tablas: EmpleadoCjSolicitudVigencia, EmpleadoCjHistorialLaboral, EmpleadoCj · Integración: SharePoint (plantillas DOCX), SMTP · Proceso: renovar → 3 aprobaciones → historial

### Boletas de pago (nómina XML)
- FE: `features/recursoshumanos/planillas.tsx`; API `api/planillaBoletaApi.ts` · BE: C/PlanillaBoletaController → S/PlanillaBoletaService, Repositories/PlanillaBoletaRepository, PlanillaBoletaPdfGenerator · SP: `sp_PlanillaBoleta_ImportarXml` · Tablas: PlanillaBoleta*

### Empleados / Externos
- FE: `features/mantenimiento/empleados.tsx`, `externo.tsx`, `mantenimiento/m_empleado.tsx`; API `api/empleadosCrudService.ts`, `externosCrudService.ts`, `empleadoService.ts`, `fichaService.ts`
- BE: C/MantenimientoEmpleadosController, C/MantenimientoExternosController (copias, SQL inline), C/EmpleadoController, C/EmpleadoFichaController → S/EmpleadoCtaService
- SP: `sp_EmpleadoCj_Ficha/Actualizar/EliminarLogico`, `SP_GenerarUsuario`, `sp_Empleado_ListarValidadores`, `sp_Empleado_Cta_Listar`, `sp_EmpleadoCj_Listar_Wup`, `sp_EmpleadoCj_Listar_Cargo`
- Tablas: EmpleadoCj, EmpleadoCjDetalle, Empleado, Usuario, Asistencia · Estados: 9 pendiente → 1 activo → 0 baja

### Asistencia
- FE: `features/operaciones/operacion/aprobarcampo.tsx`, `seguimientoempleado.tsx`, `features/reportes/rptasistencia.tsx`, `rptasistenciaempleado.tsx`, `features/administracion/exportacionasistnciasharepointpage.tsx`; API `api/asistenciaService.ts`, `aprobarCampoService.ts`, `asistenciaSharePointService.ts`
- BE: C/AsistenciaReporteController, C/AsistenciaValidarCampoController, C/AsistenciaSharePointController → S/AsistenciaReporteService, S/AsistenciaValidarCampoService, Api/Services/AsistenciaSharePointService · Jobs AsistenciaReporteJob, AsistenciaSharePointJob
- SP: `RptAsistenciaFechas`, `sp_Asistencia_ValidarCampo`, `sp_Asistencia_AprobarIngreso/AprobarSalida/RechazarDocumento`, `sp_Asistencia_ActualizarEstadoEmpleado`, `sp_AsistenciaTracking_Consulta`, `sp_Asistencia_BuscarPorFechas_Job`
- Tablas: Asistencia, AsistenciaSharePointJobConfig/ExportLog, ReporteWhatsAppLog · Estado 9 = pendiente de validar
- Job gastos → Excel (pestaña "Gastos Excel SharePoint" de `administracion/exportacionasistnciasharepointpage`): FE `features/administracion/GastosExcelJobPanel.tsx`, `api/gastosExcelSharePointService.ts` · BE C/GastosExcelSharePointController → Api/Services/GastosExcelSharePointService + GastosExcelSharePointJobScheduler, Jobs/GastosExcelSharePointJob, Infrastructure/Repositories/GastosExcelSharePointRepository, Services/Graph/GraphExcelTableWriter · Tablas `GastosExcelSharePointJobConfig/Log` (activo y programado automáticamente)

### Pendientes (tareas)
- FE: `features/administracion/pendientes.tsx`; API `api/empleadoPendienteService.ts` · BE: C/EmpleadoPendienteController → S/EmpleadoPendienteService · SP: `sp_EmpleadoPendiente_Listar/Insertar/Actualizar`

### Migración / importación de OT
- FE: `features/mantenimiento/migracion/importar.tsx` (nuevo), `m_importar.tsx` (legacy) · BE: C/MantenimientoMigracionImportController, C/MantenimientoMigracionController → S/MigracionImportProcesarNewService, S/MigracionImportService · SP: `sp_MigracionImport_ProcesarNew`, `sp_MigracionImport_Insertar/Actualizar` · Tablas: importar, updimportar, Cliente, Proyecto, Site

### Seguridad (usuarios, perfiles, roles, menú, permisos)
- FE: `features/seguridad/pages/*`, servicios `features/seguridad/services/*`; sesión `utils/authStorage.ts`, `app/session/SessionManager.tsx`
- BE: C/AuthController, C/SegMenuController, C/SegPerfilController, C/SegRolController, C/SegUsuarioController, C/Seguridad/SegPermisosAccionesController → S/AuthService, JwtService, ActiveUserSessionService, Seg*Service
- SP: `sp_ValidarUsuario`, `sp_Seguridad_ObtenerMenuDinamico`, `sp_SegMenu_*`, `sp_SegPerfil*`, `sp_SegRol_*`, `sp_SegPerfilRolMenu_*`, `sp_SegUsuarioPerfilRol_Insertar`, `sp_SegPermisoAccion_*`

### Auditoría de cambios
- FE: `features/mantenimiento/consulta/modificaciones.tsx`; API `api/auditoriaCambiosService.ts` · BE: C/AuditoriaCambiosController → S/AuditoriaCambiosService · SP: `sp_AuditoriaCambios_Registrar` · Tabla: AuditoriaCambios

### Lookups / catálogos
- API FE: `constantesService`, `solicitanteService`, `gestorService`, `validadorService`, `ubigeoService`, `filtroOperativoService`, `gastosBootstrapService` · BE: C/LookupController → S/LookupService · SP: `sp_Constante_ListarPorCampo`, `sp_ListarSolicitante`, `sp_ListarGestor`, `sp_ListarValidador`, `sp_Empleado_Listar_GestorValidador`, `sp_Listar_Ubigeo`, `sp_Importar_FiltroOperativo_Listar`, `sp_Importar_TipoTrabajo_Listar`, `sp_Importar_OT_Listar`

### Reportes WhatsApp (WUP) y envío de mensajes
- FE: `features/mantenimiento/sistemas/rptwup.tsx` (+`rptwupgerencial`, `rptboleta`), `features/inicio/enviomensajes.tsx`; API `api/reportesWhatsappService.ts`
- BE: C/ReportesWhatsappController, C/WhatsappWebhookController → S/ReporteAutomaticoService, S/ReportePdfService, Repositories/ReporteRepository, S/WupService, S/WupAuthService, S/WhatsappInboundService, S/MetaWhatsAppService · Job ReporteWhatsAppJob · Scheduler Api/Services/ReporteWhatsappJobScheduler
- SP: `RptAsistenciaFechas`, `sp_EmpleadoCj_Listar_Wup(_Gerencia)` · Tablas: ReporteWupConfig, ReporteWhatsAppLog(Gerencia)

### Reporte de asistencia por WhatsApp oficial de Meta (rptwup_v1)
- FE: `features/mantenimiento/sistemas/rptwup_v1.tsx` (ruta `/mantenimiento/sistemas/rptwup_v1`, ítem `SegMenu` PV: script `Database/Reportes/03_ReporteWhatsappExcluido.sql`); API `api/reportesWhatsappService.ts` (`obtenerDestinatariosMeta`, `guardarDestinatariosMeta`, `ejecutarAhora("meta")`)
- BE: tipo `ASISTENCIA_META` (`ReporteWhatsappTipos.Meta`, ruta `meta`) sobre el mismo pipeline de `rptwup`: C/ReportesWhatsappController (`meta/destinatarios` GET/PUT) → S/ReporteAutomaticoService (envío por `IMetaWhatsAppService.SendDocumentAsync` en lugar de WUP) · job Hangfire `reporte-whatsapp-asistencia-meta` (nace deshabilitado) · config en `ReporteWupConfig`, logs en `ReporteWhatsAppLog` (TipoReporte = ASISTENCIA_META)
- Lista = `sp_EmpleadoCj_Listar_Wup`; tabla `ReporteWhatsappExcluido(TipoReporte, IdEmpleado)` guarda los DESMARCADOS (sin fila = marcado). Job y envío manual solo envían a marcados; el manual reenvía aunque ya exista envío del período.
- PV: Meta solo entrega mensajes con documento libre dentro de la ventana de 24 h del usuario; fuera de ella exige plantilla aprobada (no implementada).

### Reportes gerenciales
- FE: `features/reportes/gerencial/*` (dashboardcj, dashboard1, dashboard3, backlog, ingresosegresos, analisis, analisisproyecto, mapasite); API `importarConsultaService`, `movimientosConsultaService`, `mapasiteService`
- BE: C/ReportesGerencialesController, C/PlanillaConsultaController · SP: `sp_Importar_ConsultaDsh`, `sp_Movimientos_Consulta_GastosIngresos`, `sp_Site_Listar`, `sp_Asistencia_UltimoMovimientoEmpleado`

### IA Chat
- FE: `features/reportes/administrativo/iachat.tsx` (+`iachat/services/iaChatService.ts`); `features/cj-intelligence/**` está **roto** (`/ai/*` no existe)
- BE: C/IaChatController → S/IaChatService (OpenAI planner + Anthropic HTML) · SP: `sp_IA_Planilla_Buscar`, `sp_IaChatAuditoria_Insertar` · Doc: `CjERP.Backend/Docs/IAChat.md`

### SQL Monitor
- FE: `features/sqlmonitor/pages/sqlmonitor.tsx`; API `api/sqlMonitorService.ts` · BE: C/SqlMonitorController → S/SqlMonitorService, Api/Services/SqlMonitorWorker · SP: `sp_Monitor_*`

### Logística / operación
- Recojo: FE `features/logistica/gestionequipos/recojo.tsx` · C/LogisticaRecojoController · SP `sp_Logistica_Recojo_Buscar/Insertar`
- Equipos · ingreso (migración de FrmLogistic_v1): FE `features/logistica/gestionequipos/ingresoequipo.tsx` (+`equipos/ingreso/*`: Pedido, x Recepcionar, Series, x Validar; stock en `equipos/StockPanel.tsx`) · API `api/logisticaEquiposService.ts` · C/LogisticaEquiposController (`/api/logistica/equipos`) → S/LogisticaEquiposService · SP `sp_Logistica_Ingreso_*`, `sp_Logistica_Pedido_Importar` (+ stock `sp_Stock_Mover`) · Scripts `Database/Logistica/00-07` (PV: no ejecutados en BD real) · Estados línea (DetLogistica) 0 creado → 1 recepcionado → 2 validado; 8 no recepcionado; 4/6 observado/rechazado
- Equipos · solicitud y x Aprobar (migración de FrmLogistic_v1): FE `features/logistica/gestionequipos/solicitudequipo.tsx` (+`equipos/solicitud/SolicitudTab.tsx`, `PorAprobarTab.tsx`; resto de pestañas aún deshabilitadas) · mismo `api/logisticaEquiposService.ts` y C/LogisticaEquiposController (`solicitud/catalogos|disponibles|registrar|por-aprobar|{nro}/detalle|aprobar`) → S/LogisticaEquiposService + S/LogisticaSolicitudCorreoService (PDF QuestPDF `LogisticaSolicitudPdfDocument`, correo vía `ISmtpMailSender`; destinatarios `Constante correo_logistica` / `correo_logistica_impl` con `ValorFin=1`, PV) · SP `sp_Logistica_Solicitud_Catalogos/Disponible/Registrar/PorAprobar/Detalle/Aprobar/Correo` (script `Database/Logistica/08`) y `sp_Logistica_Solicitud_Consumible` (script `11`); la pestaña Solicitud exige elegir el sitio destino (todo lo demás `inert` hasta entonces) y tiene las vistas Listado, Consumible, Adicional y Resumen ( PV: no ejecutado en BD real; tablas CabSolicitud, DetSolicitud, MovMaterial, Kardex tomadas del VB) · Estados: solicitud 9 (x aprobar) o 3 (sin aprobación) → aprobar 4 / observar 6; stock vía `sp_Stock_Mover` (Disponible→Aprobado→Despachado; observar devuelve a Disponible). Sin adjunto de imagen ni "agregar a solicitud en x aprobar" (pendientes).
- Equipos · página única `/logistica/gestionequipos/all` (`gestionequipos/all.tsx`): reúne en un solo `EtapasPage` solo Solicitud, x Campo, Reporte, Alerta, Dashboard y Observadas (etapas exportadas por `solicitudequipo` y `campoequipo`; Reporte, Alerta, Dashboard y Observadas aún sin contenido, salen deshabilitadas). Requiere ítem `SegMenu` con esa ruta (PV: no creado en BD). Las rutas por separado se mantienen.
- Equipos · página BASE `/logistica/gestionequipos/demo` (`gestionequipos/demo.tsx`): copia autocontenida de `all` (importa las pestañas directamente) con los pasos para agregar una etapa en el comentario de cabecera. Usarla como plantilla de nuevas páginas; no está en el menú.
- Equipos · x Campo: FE `features/logistica/gestionequipos/campoequipo.tsx` (+`equipos/campo/CampoTab.tsx`) · C/LogisticaEquiposController (`campo/consultar|grabar`) → S/LogisticaEquiposService · SP `sp_Logistica_Campo_Consultar/Grabar` (script `Database/Logistica/09`; PV: no ejecutado en BD real). Estado 11 → 14 (x cruzar), 10 si hay observación/diferencia, 21 si el material no es cod. 10/40; stock Campo→Cruce y la diferencia Campo→Observada.
- Suministro: FE `features/operaciones/operacion/suministro.tsx` · C/LogisticaSuministroController · SP `sp_SuministroProvisional_Listar/Kpis/Insertar/Actualizar/ObtenerVigente`
- Reembolso: FE `features/operaciones/operacion/reembolso.tsx` · C/LogisticaReembolsoController · SP `sp_Planilla_Listar_Reembolso` (actualizar = 501)

### Arrendamientos
- FE: `features/arrendamientos/pages/*`, `components/*`; API `api/arrendamientosService.ts` · BE: C/Arrendamientos/ArrendamientosController → S/Arrendamientos/ArrendamientosService
- SP: `sp_a_*_Guardar`, `sp_a_Obligacion_Generar`, `sp_a_Pago_Registrar/Aprobar/Aplicar/Revertir`, `sp_Arrendamiento_ResumenAnual` · Tablas `a_*` (DDL en `Database/Arrendamientos/`)
- Proceso: contrato → obligaciones → pago → aprobación (mín. 2) → aplicación → reversión

### Comunicaciones móviles
- FE: `features/admin/MobileCommunicationComposerPage.tsx`, `MobileCommunicationMonitorPage.tsx` · BE: C/MobileCommunicationController, C/MobileDeviceController, C/MobileMonitorController, C/MobileVersionController → S/MobileCommunicationService, S/MobileDeviceService, S/MobilePushDispatchService · Job MobilePushDispatchJob
- SP: `sp_Comunicacion_*`, `sp_ComunicacionAdjunto_*`, `sp_ComunicacionPush_*`, `sp_DispositivoMovil_*` · Tablas Comunicacion*, DispositivoMovil (DDL `Database/Mobile/`)

## Procesos principales
- Recibo: registro (`sp_Planilla_Insertar`) → aprobación masiva (0 → 1; 2 observada; 3 rechazada) → revisión 1→9 → contabilidad 9→8/5 → programar 5→8 → pagar →4.
- OC: alta → aprobación 3 niveles → asociar recibos pagados → consumo.
- Vacaciones (legacy): 97→98→99 · Compensación: 97→98→9 · Contrato: renovación con 3 aprobaciones · Empleado: 9→1→0.
- Asistencia: marcación 9 → aprobar ingreso/salida o rechazar → reporte/llamada de atención → export diario a SharePoint.
- Reporte WUP: job Hangfire → PDF por empleado → WUP → log.
Detalle y diagramas: `docs/PROCESS_MAP.md`.

## Stored Procedures importantes
`sp_Planilla_Consulta_Estados` (consulta central, también usada por conciliación) · `sp_Planilla_ProcesarAprobacionMasiva` · `sp_Planilla_Insertar/Actualizar/ActualizarEstado` · SPs `sp_Planilla_*Masivo` (etapas de tesorería) · `sp_OrdenCompra_*` · `sp_Constante_ListarPorCampo` (catálogos) · `sp_Seguridad_ObtenerMenuDinamico` · `sp_ValidarUsuario` · `sp_EmpleadoCj_Ficha` · `RptAsistenciaFechas` · `sp_AuditoriaCambios_Registrar`. Duplicados/obsoletos y lista completa: `docs/DATABASE_MAP.md` §3-4.

## Convenciones
- Idioma de código y datos: español (nombres de entidades, SP, rutas, mensajes).
- SP: `dbo.sp_<Entidad>_<Acción>`; arrendamientos `sp_a_*` / tablas `a_*`. Masivos con TVP o JSON.
- Rutas API en minúsculas por módulo (`/api/tesoreria/...`, `/api/facturacionfinanciera/oc`, `/api/admin/...`); JSON camelCase.
- Scripts SQL nuevos en `CjERP.Backend/Database/<Modulo>/NN_descripcion.sql`, idempotentes (`CREATE OR ALTER`).
- Hora de negocio: America/Lima (UTC-5); varias clases tienen su propio helper de zona horaria.
- Versiones de pantalla con sufijo `_v1` = versión vigente; `_dev`/sin sufijo suele ser legacy (confirmar en menú).

## Reglas de negocio
Estados de Planilla 0–10, super-aprobador 77, IGV 18 % (solo `IdComprobante` 2 y 6; **`IdComprobante = 5` NO calcula IGV: IGV = 0, Total = Total a pagar = Subtotal**; calculado en `gastos.tsx#tasaIgvPorComprobante` y `PlanillaService.ObtenerTasaIgv`), TC fijo 3.8 (⚠), detracciones por `Constante DETRACCION`, reglas de pago (estado 5/8, misma moneda, ejecutor cargo 14, fecha no futura), jornada 9.6 h (FE), validadores 1/2/3 en `EmpleadoCjDetalle`. Detalle con fuentes: `docs/BUSINESS_RULES.md`. **No cambiar reglas sin informar antes.**

> 🚨 **REGLA CRÍTICA — MONTOS Y TIPO DE CAMBIO (error grave ya ocurrido; NO repetir)**
> - `Subtotal`, `IGV`, `Total` (y cualquier monto de `Planilla`) se devuelven y se muestran **siempre en la moneda REAL del recibo**. **Si `TipoMoneda <> 1` NO se convierte a soles** en la columna original. Ej.: recibo en DÓLARES de US$ 2,173.91 debe verse `$ 2,173.91`, **nunca** `8,260.86`.
> - `TipoMoneda`: 1 SOLES · 2 DOLARES · 3 EUROS · 4 PESO DOMINICANO · 5 PESO COLOMBIANO (`Constante PLANTILLA/TIPO_MONEDA`).
> - El equivalente en soles va **solo en columnas aparte** (`SubtotalSoles`, `IGVSoles`, `TotalSoles`, `SumaEmp`…) y se calcula con los **tipos de cambio de la pantalla** (`TipoCambioUSD/EUR/DOP/COP`), nunca con un `3.8` fijo ni sobrescribiendo `Subtotal/IGV/Total`.
> - Al crear/modificar/restaurar un SP o consulta (`sp_Planilla_Consulta_Estados`, `sp_Planilla_ConsultaIni`, etc.) **verificar que `Subtotal/IGV/Total` salgan sin convertir** y que el SP acepte los parámetros `TipoCambio*` que envían `pagos_v1`, `pagos_v2` e `Historial`. Los scripts versionados `Database/Planilla/01` y `04` convierten `* 3.8` (**incorrecto**): usar `19_sp_Planilla_Consulta_Estados_vigente.sql` (copia del SP vigente en BD al 30/10/2026; `05` quedó desactualizado). La fecha de vencimiento del gasto sale en la columna `FechaPagoCre` (ISO `yyyy-MM-dd`; se guarda en `Planilla.FechaPagoCre` como texto `MM/dd/yyyy`); las versiones `_Ligero`/`_Totales` (`Planilla/13`, `14`, `17`) aún no la devuelven (PV).
> - Antes de ejecutar un script que reemplace un SP, **comparar con el SP vigente en la BD** (Script as ALTER); sobrescribirlo sin comparar causó este error y un 500 general en las grillas.

## Integraciones
SharePoint/Graph (`ISharePointCommercialUploadService`), correo por Graph (`IGraphMailSender`, remitente TI2) con SMTP de respaldo, WUP (`WupService`), Meta WhatsApp, OpenAI, Anthropic, SMTP (MailKit), Expo push, gestor legacy elnk.uno, Google Maps (FE), Hangfire. Detalle: `docs/INTEGRATIONS.md`.

## Riesgos conocidos (resumen — ver `docs/TECHNICAL_DEBT.md`)
- CRÍTICO: sin autorización por rol en backend; aprobador/usuario tomado del body; consulta genérica acepta IdCargo del cliente; contraseñas en texto plano; secretos en repo/historial; `KILL` de SQL para cualquier usuario; webhook sin firma; dashboard WUP expone boletas; `/tesoreria/pagos/grabar` sin controles; estado estático en TesoreriaGastosController.
- ALTO: archivos de 5 000–9 000 líneas; páginas y controllers duplicados; `MAX(Id)+1`; transacciones faltantes; SPs no versionados; JWT 30 min sin refresh; rate limit global.

## Reglas obligatorias para Claude Code y Codex
1. Revisar siempre código existente antes de crear funcionalidad nueva.
2. Antes de crear, buscar.
3. Antes de modificar, seguir toda la cadena de dependencias (FE → API → Controller → Service → Repository → SP/Dapper → Tablas → Estados → Reglas → Integraciones).
4. No duplicar Stored Procedures.
5. No duplicar endpoints.
6. No duplicar Services.
7. No duplicar Repositories.
8. No duplicar componentes.
9. No duplicar tablas.
10. Reutilizar funcionalidad existente siempre que sea razonable.
11. Mantener compatibilidad con la arquitectura existente.
12. Antes de modificar un proceso, identificar todas sus dependencias.
13. Si una modificación afecta Frontend + Backend + SQL, analizar las tres capas antes de realizarla.
14. No asumir nombres de tablas.
15. No asumir nombres de campos.
16. No asumir endpoints.
17. No asumir Stored Procedures.
18. Verificar siempre la existencia real de cada elemento (código y, si falta en el repo, marcar PV y pedir validación en BD).
19. No eliminar funcionalidad existente salvo autorización explícita.
20. No cambiar reglas de negocio sin informarlo previamente.
21. Preservar compatibilidad con procesos existentes.
22. Antes de crear un SP nuevo, buscar SP similares (`docs/DATABASE_MAP.md` §3 + grep + BD).
23. Antes de crear una tabla nueva, revisar tablas existentes (y `Constante` para catálogos).
24. Antes de crear un endpoint, revisar Controllers, Services y Repositories existentes (`docs/API_MAP.md`).
25. No utilizar DevExpress ni DevExtreme para nuevas funcionalidades.
26. Priorizar componentes existentes (`components/base`, hooks, lookups).
27. Priorizar alternativas sin licencia adicional.
28. Mantener TypeScript correctamente tipado.
29. Mantener compatibilidad con .NET 8.
30. Mantener compatibilidad con SQL Server.
31. No mostrar secretos ni credenciales.
32. No modificar configuración productiva sin autorización explícita (`appsettings.json`, `vercel.json`, `httpClient.ts` base URL, Dockerfile, variables Railway).
33. No cambiar contratos API existentes sin evaluar impacto (revisar todos los consumidores FE).
34. No renombrar campos utilizados por múltiples módulos sin identificar dependencias.
35. No realizar refactorizaciones masivas como efecto secundario de una solicitud pequeña.
36. Mantener cambios focalizados en el objetivo solicitado.
37. Si existe una solución existente mejor que crear una nueva, indicarlo.
38. Si existe incertidumbre, marcarla como **PENDIENTE DE VALIDACIÓN**.
39. **Montos y tipo de cambio**: nunca convertir a soles `Subtotal/IGV/Total` cuando `TipoMoneda <> 1`; mostrar siempre el valor real del recibo (ver regla crítica en "Reglas de negocio").

### Procedimiento para cada solicitud
1. Leer este archivo (`AGENTS.md`). 2. Consultar el doc de `docs/` relacionado. 3. Localizar la implementación real. 4. Buscar implementaciones similares. 5. Seguir dependencias. 6. Identificar impacto (FE, BE, SQL, permisos, procesos, integraciones). 7. Explicar brevemente **"Elementos que serán afectados"**. 8. Hacer solo los cambios necesarios. 9. Validar que no se rompa nada (`npm run build` en FE; `dotnet build` en BE). 10. Actualizar docs si cambió arquitectura, endpoint, SP, tabla, proceso, regla, integración o módulo (no por cambios triviales).

### Si se encuentra algo similar a lo pedido
Detener la creación y reportar:
```
FUNCIONALIDAD RELACIONADA ENCONTRADA
Archivo: … · Endpoint: … · Stored Procedure: … · Tabla: …
Similitud: …
Recomendación técnica: reutilizar | extender | refactorizar | crear nuevo (justificado)
```
