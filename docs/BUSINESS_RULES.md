# Reglas de negocio detectadas — Cj ERP Web

> Solo reglas respaldadas por código (archivo:línea aproximada, commit `c2f1825`). Reglas dentro de SPs no versionados = **PV** (PENDIENTE DE VALIDACIÓN).
> ⚠ = regla implementada solo en frontend o duplicada/inconsistente entre capas. **No cambiar estas reglas sin informarlo antes.**

## 1. Estados de `Planilla` (recibos)
| Código | Significado inferido | Fuente |
|---|---|---|
| 0 | Pendiente 1ª aprobación | `pagos_v1.tsx` ~585; subsanar 2→0 (`PagoTesoreriaWorkflow.cs` EstadoDestino) |
| 1 | Aprobado → Revisión tesorería | Workflow; CodEmpleado 77 fuerza 1 |
| 2 | Observada en aprobación | `pagos_v1.tsx` ~2778 |
| 3 | Rechazado | `TesoreriaGastosController.cs` ~338, `PlanillaConsultaController.cs` ~531 |
| 4 | **Pagado** (filtro "pagado" en SPs de OC/OT/conciliación) | `PagoTesoreriaService.PagarAsync` |
| 5 | Administrativo | Workflow; estado por defecto GET /tesoreria/pagos |
| 6 | Re-aprobar | `pagos_v1.tsx` ~587 |
| 7 | Observada en tesorería | Workflow |
| 8 | Programado | Workflow |
| 9 | Contabilidad (revisado) | Workflow |
| 10 | "Hormiga" (CodEstado por defecto al aprobar) | `PlanillaConsultaController.cs` ~688 |
| 99 | parámetro `IncluirEstado99` (PV) · 100 = pseudoestado "búsqueda" en UI | PlanillaConsultaService ~875 |
⚠ Mapeos de etiquetas de pestañas cruzados entre `pagos_v1.tsx` y `gastosaprobar.tsx`. Nombres oficiales: `Constante` MAESTRO/ESTADO (PV).

## 2. Aprobaciones y usuarios especiales
- **CodEmpleado/IdEmpleadoCj == 77** es un "super-aprobador" fijo en código: aprueba directo a estado 1 (`PlanillaConsultaController.cs:689`, `PlanillaService.cs:416`) y puede editar estado en revisión (`PagoTesoreriaRevision.cs:13`).
- 2ª aprobación de recibos determinada por `LimiteSegundaAprobacion` dentro de `sp_Planilla_ProcesarAprobacionMasiva` (PV).
- **OC**: 3 niveles secuenciales; nivel 3 ⇒ aprobada (IdEstado=1); rechazada (6) no aprobable (`OrdenCompraService.cs` ~745-848).
- **Contratos**: 3 aprobaciones secuenciales (`AprobacionesRequeridas=3`, `ContratosDto.cs:88`); nivel 3 exige documento; sin validar aprobadores distintos.
- **Vacaciones legacy**: 97→98→99; validadores asignados en `EmpleadoCjDetalle` (IdResponsableCj, IdSegundoVacaciones, IdTerceroVacaciones).
- **Compensación**: 97→98→9; rechazo 22 devuelve días.
- **Arrendamientos**: aprobaciones mínimas de pago = parámetro `PAGO_APROBACIONES_MINIMAS` (default 2, `00_Arrendamientos_Base.sql` ~2320).
- ⚠ El backend no valida perfil/rol del aprobador en ningún flujo; varios endpoints aceptan `IdAprobador`/`UsuarioAccion` desde el body.
- ⚠ FE: acceso total a acciones si `idperfil===8 && idrol===5` (`utils/authStorage.ts:48-50`); roles 4/5 = admin en `rptasistencia.tsx` y `compensacionreal.tsx`; rol 5 = admin de comunicaciones móviles (`MobileMonitor:AdminRoleIds`).
- Acceso "administrativo" a reportes WUP/SharePoint: usuario llamado ADMIN/ADMINISTRADOR/SISTEMA/SYSTEM, o rol en [ADMIN, ADMINISTRADOR, TI, RRHH, SISTEMAS, SUPERADMIN], o tener ruta rptwup* en el menú (`ReporteAutomaticoService.cs:472-495`).

## 3. Monedas, tipo de cambio, impuestos
- **IGV 18 %**: FE `gastos.tsx:671` (`IGV_RATE=0.18`, solo si comprobante es factura); BE OC `IdComprobante 2 o 6` ⇒ 18 % (`OrdenCompraService.cs:617`). ⚠ `oc.tsx:1386` y `oc_v1.tsx:3500` aplican 18 % siempre.
- **Tipo de cambio fijo** ⚠: 3.8 en `gastos.tsx:289` y en `sp_Planilla_Consulta_Estados` (multiplica si TipoMoneda≠1); 3.5 en `conciliacion_v1.tsx:3234`. `pagos_v1` envía TC por moneda (USD/EUR/DOP/COP). Moneda 1 = soles.
- **Detracción/retención**: catálogo `Constante` DETRACCION (ValorFin = %), 0–100, aplicado con IdRetencion 1..5 (`PagoTesoreriaWorkflow.cs` ~159-163); según `PagosTesoreria.md` el SP la aplica a comprobantes 2 y 5.
- **Arrendamientos**: monedas CHAR(3) (PEN/USD); moneda por concepto (ALQUILER→MonedaAlquiler, MANTENIMIENTO, COCHERA, otro→Moneda, fallback PEN); TC diario Compra/Venta>0; importes y TC los envía el cliente.

## 4. Pagos de tesorería (`PagoTesoreriaService` / `PagoTesoreriaWorkflow`)
- Solo se paga desde estado 5 u 8; lote 1–500 sin duplicados; misma moneda (IdMoneda2) y TotalPagar>0.
- Fecha de depósito no futura (hora Lima UTC-5).
- Control de concurrencia por versión: SHA-256 de ~35 columnas (`VersionSql`).
- Ejecutor = Empleado con IdCargo=14 activo. Medio CHEQUE exige número de cheque; medio ≠ EFECTIVO exige NroOperacion.
- Programar (5→8) exige IdBancoCta, Cuenta, CuentaInter, NombreCta.
- Acciones: RUC 11 dígitos o vacío; adjunto solo https; FecEmision no futura; observar/subsanar/corregir exigen motivo.
- Revisión AM/PM: 'PM' si hora Lima > 14:00.

## 5. Visibilidad de datos
- `sp_Planilla_Consulta_Estados` filtra por solicitante salvo que `@IdCargo` esté en `Constante 'PERMISOS'`; responsables con IdCargo ∈ (10, 11, 83). ⚠ IdCargo/IdEmpleado llegan del cliente.
- `maxRows` en consultas genéricas → `LimitExceeded` ("aplique más filtros").

## 6. Orden de Compra
- Cabecera obligatoria: solicitante, responsable, validador, gestor, moneda, comprobante, forma de pago. Detalle: cliente, proyecto, site, tipo de trabajo, tarea, cantidad>0, precio>0, detalle (`OrdenCompraController.cs:61-95`).
- Archivos: jpg, png, bmp, gif, pdf, xls, xlsx ≤25 MB.
- Asociar recibos: nivel 2/3 exige recibo Estado=4; recibos asociables en estados {0,1,4,5,6}.
- Consumo = CabOrdenCompra.Subtotal vs SUM(Planilla.Subtotal, Estado=4).

## 7. RRHH
- **Empleado**: obligatorios empresa, cliente, área, ubicación, responsable, 2º y 3º validador, correo (con @), dirección, fecha inicio; DNI único entre activos del mismo cargo; cargo 50 = empleado CJ, 51 = externo; usuario generado IdCargo 84; sexo M/F → 1/2.
- **Estados EmpleadoCj**: 9 pendiente, 1 activo, 0 baja.
- **Contrato (FE)**: VENCIDO si faltan ≤0 días, X VENCER ≤30, VIGENTE resto (`contratos.tsx:535-556`). Nueva fecha fin ≥ inicio laboral y > hoy−10 años.
- **Vacaciones**: FechaFin ≥ FechaInicio; saldo ≥ días; días calendario inclusivos (sin hábiles/feriados); ⚠ FE: si el empleado cambió de empresa (varios idEmpRel), saldo efectivo 0. Modelo nuevo: DiasBase 30 por defecto; reglas de política (MesesMinimosGoce, fraccionamiento, máximos) guardadas pero **no aplicadas**.
- **Compensación**: días solicitados ≤ DiasPendientes; comentario ≤500; rechazo exige comentario.

## 8. Asistencia
- ⚠ Jornada **9.6 h** (`rptasistencia.tsx:178-179`, repetido en `rptasistenciaempleado.tsx`); FALTA/INCOMPLETO suma 9.6 h; refrigerio 1 h descontado; excluye SABADO/DOMINGO/FERIADO (feriado llega como estado).
- Tolerancias/tardanzas/horas extra: dentro de `RptAsistenciaFechas` (PV).
- Estado 9 = pendiente de validación (ingreso/salida); rechazo exige observación.
- KPIs gerenciales (`AsistenciaReporteService.cs`): VERDE ≥95 %; empleado ROJO si diferencia < −8 h o ≥3 incidencias, AMARILLO si <0 h o ≥1; responsable ROJO ≥8, AMARILLO ≥4. Periodo gerencial automático: semana anterior lun-dom (hora Perú).
- Llamada de atención: máx. 1 por empleado/día (hora Perú).
- Semáforo de estados: precaución {3,5,6,7,8,9,10,14,15,19}, óptimo {1,4,11,12,13,16,17,18,21,97,98,99,100} (significado en `Constante estado_asistencia`, PV).

## 9. Reportes WhatsApp / Mobile
- Config WUP: hora HH:mm; gerencial ≥1 día; bloque ≥1; delay ≥5 s. Dedupe por empleado+FechaProceso+Tipo con ENVIADO.
- Teléfono Perú normalizado a `51XXXXXXXXX` (9 dígitos iniciando en 9, o 11 con prefijo 51).
- Periodo operativo: día 1 ⇒ mes anterior completo; otro día ⇒ 1° del mes → ayer. Boleta: mes MM/yyyy.
- Comunicaciones: persistencia 3 (obligatoria) ⇒ PermiteConfirmacion; adjuntos ≤15 MB; destinatarios activos.

## 10. Arrendamientos
- No dos pagos COMPLETO del mismo inquilino+concepto+mes/año contable.
- Edición de pago solo si EstadoValidacion ∈ {PENDIENTE, RECHAZADO}; sin duplicado NumeroOperacion+Fecha+Inquilino+Arrendador.
- Aplicación: obligación saldo ≤0 ⇒ PAGADO, >0 pagado ⇒ PARCIAL; excedente ⇒ saldo a favor. ⚠ permite aplicar pagos PENDIENTE.
- Tipos pago COMPLETO|PARCIAL|EXONERADO; conceptos ALQUILER|MANTENIMIENTO|COCHERA|OTRO; TipoMovimiento de versión CREACION|RENOVACION|AMPLIACION|ADENDA|SUSPENSION|RESOLUCION|CANCELACION|FINALIZACION|MODIFICACION.
- Estado `VENCIDO` de obligaciones: se cuenta en dashboard pero ningún proceso lo asigna.

## 11. Catálogos (`Constante`) usados como fuente de reglas
TIPO_TRANSFERENCIA, TIPO_PAGO, RENDICION, DETRACCION, BANCO, BANCO_EMP, TIPO_MONEDA, TIPO_COMPROBANTE, TIPO_BIEN, TAREA, MAESTRO/ESTADO, MAESTRO/ANTICIPO, PERMISOS, estado_log, estado_cheque, forma_pago, OPE_STATUS_CLARO, EMPRESA_CJ, CLIENTE_CJ, AREA_CJ, UBICACION_CJ, SEXO, TIPO_DOC, estado_asistencia, estado_suministro, ESTADO_SUMINISTRO, ID_REEMBOLSO, TARIFA_ENERGIA, EMPRESA_ENERGIA, tipo_moneda; Programa ASIGNACIONES (WORK, TIPO_TRABAJO, ZONA). **Nuevos catálogos: agregar como `Campo` en `Constante` antes que crear tablas.**

## 12. Números mágicos a conocer (no cambiar sin analizar impacto)
77 (super-aprobador), IdCargo 14 (ejecutor de pagos), 13 (validador), 30 (cargo por defecto listar), 10/11/83 (responsables), 50/51 (empleado/externo), 84 (cargo usuario), perfil 8 + rol 5 (acceso total FE), roles 4/5 (admin FE), rol 5 (admin mobile), estados 97/98/99 (vacaciones, compensación), 9 (pendiente en EmpleadoCj/Asistencia), bancos detectados por texto `%SCOTI%`/`%BCP%`.
