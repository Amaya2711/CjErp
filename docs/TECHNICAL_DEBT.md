# Deuda técnica y riesgos — Cj ERP Web

> Hallazgos verificados en código (2026-09-25, commit `c2f1825`). **Solo documentado: no se ha corregido nada.**
> No se muestran valores de secretos. Clasificación: CRÍTICO · ALTO · MEDIO · BAJO.
> Si una solicitud futura toca un área listada aquí, avisar del riesgo; no refactorizar como efecto secundario.

## CRÍTICO

| # | Hallazgo | Ubicación | Riesgo | Acción recomendada |
|---|---|---|---|---|
| C1 | **Sin autorización por rol en backend.** Solo `[Authorize]`; `AddAuthorization()` sin policies. Cualquier usuario autenticado puede: aprobar/rechazar recibos, OC, vacaciones, contratos, empleados y marcaciones; asignarse perfiles/roles y editar menús/permisos; migrar datos | `Program.cs:365`, todos los controllers | Escalada de privilegios, fraude | Policies por permiso (SegPermisoAccion/SegRolMenuPermiso) verificadas en servidor |
| C2 | **Suplantación de aprobador/usuario**: IdAprobador/UsuarioAccion/UsuarioCreacion aceptados del body | OrdenCompraController (~306, 365), TesoreriaGastosController (~329), CompensacionController (~192), AsistenciaValidarCampoController (~70, 120), EmpleadoPendienteController, LogisticaRecojoController, SegRolMenuPermiso/SegPermisosAcciones, TesoreriaChequesController | Auditoría falsificable | Tomar siempre de claims |
| C3 | **Consulta genérica con IdCargo/IdEmpleado del cliente**: enviando un IdCargo de `Constante PERMISOS` se ven todos los recibos | `PlanillaConsultaController.EnsureClaimFallback` (~599-634), `sp_Planilla_Consulta_Estados` (~51-62) | Fuga de datos financieros | Forzar claims del token |
| C4 | **Contraseñas en texto plano** y truncadas a 10 chars; login sin rate limit ni lockout | `Database/Mobile/13_Perfil_Cargo_Login.sql:4,17`; `AuthController` `[DisableRateLimiting]` | Robo masivo de credenciales, fuerza bruta | Hash (PBKDF2/bcrypt), limitador por IP/usuario |
| C5 | **Clave inicial fija** al aprobar empleado; re-aprobar resetea la clave de usuario existente; aprobar no verifica IdEstado==9 (reactiva bajas) | `MantenimientoEmpleadosController.cs` ~1549-1650, ~261-301 (y Externos) | Acceso no autorizado | Clave aleatoria + cambio obligatorio; validar estado |
| C6 | **Secretos en repositorio**: `CjERP.Api/appsettings.json` (tracked) contiene la contraseña SMTP con valor real (línea 28; resto son placeholders); `appsettings.Development.json` **estuvo versionado** (commits 17dcea5, b5e8bc8, 5b44519) con cadena de conexión, secreto SharePoint, password WUP, tokens y API keys; token del gestor legacy **fijo en código** en `OrdenCompraController.cs:19` y `PagoTesoreriaController.cs`; `cjerp-frontend/.env` tracked con API key Google Maps | ver columna | Compromiso de SMTP, BD, Azure AD, OpenAI/Anthropic | Rotar todas las credenciales; mover a variables de entorno; purgar historial; restringir key de Maps por referrer |
| C7 | **SQL Monitor**: `POST /api/sqlmonitor/cancelar/{id}` ejecuta `KILL` para cualquier autenticado | `SqlMonitorService.cs:552` | DoS de BD | Restringir a rol DBA |
| C8 | **Webhook WhatsApp** anónimo sin validar `X-Hub-Signature-256` → genera/envía PDFs de asistencia y boletas a números de empleados | `WhatsappWebhookController.cs:10,39-51` | Spam/costo, fuga de datos, DoS | Validar HMAC con App Secret + idempotencia |
| C9 | **Dashboard WUP sin chequeo admin** devuelve logs con `RequestJson` que contiene PDFs base64 (boletas ajenas) | `ReportesWhatsappController.cs:27-33`, `ReporteRepository.cs` ~620-667 | Fuga de nóminas | Chequeo admin + no persistir base64 |
| C10 | **`POST /tesoreria/pagos/grabar`** marca pagado (8→4) sin transacción, sin control de versión, sin LogPlanilla/MovEstadosPagos, sin validaciones de PagarAsync | `PagoTesoreriaService.cs:176-191` | Pagos sin trazabilidad | Unificar con PagarAsync |
| C11 | **`TesoreriaGastosController` con estado estático**: `static List<GastoDto>`/`_nextId`; DELETE no borra en BD; auditoría con Id ficticio | `TesoreriaGastosController.cs:104-105,170,289` | Datos/auditoría incorrectos, memoria | Eliminar estado en memoria |
| C12 | **Datos de negocio fijos en FE**: `conciliacion_v1.tsx` crea recibos reales con proyecto/site/cliente/TC fijos | `conciliacion_v1.tsx` ~3188-3238 | Registros contables incorrectos | Parametrizar/validar en backend |

## ALTO

| # | Hallazgo | Ubicación |
|---|---|---|
| A1 | **Archivos monolíticos**: FE `rptasistencia.tsx` 8970, `conciliacion_v1.tsx` 7265, `pagos_v1.tsx` 6510, `rptasistenciaempleado.tsx` 6328, `gastosaprobar.tsx` 6217, `vacaciones.tsx` 6105, `gastos.tsx` 5707, `oc_v1.tsx` 5602, `conciliacion.tsx` 4959, `mapasite.tsx` 4899, `pagos_dev.tsx` 4884, `iachat.tsx` 4645, `dshpagos.tsx` 4024; BE `ConciliacionBcpService.cs` 6375, `IaChatService.cs` 5716, `MantenimientoExternosController.cs` 2961, `MantenimientoEmpleadosController.cs` 2940, `ArrendamientosService.cs` 2707, `ReportePdfService.cs` 2637, `ContratosController.cs` 2298 |
| A2 | **Duplicación de páginas con ruta activa**: pagos_v1/pagos_dev, gastos/gastosaprobar (~66 %), oc/oc_v1, conciliacion/_v1, pagartesoreria/_v1 (~98 %), rptasistencia/rptasistenciaempleado (~96 %) + `rptasistencia copy.tsx`, vacaciones/vacacionespage, empleados/externo |
| A3 | **Controllers duplicados**: MantenimientoEmpleados vs MantenimientoExternos (39 líneas de diferencia). Bug: en Externos 4 de 6 variantes de INSERT usan literal `50` como IdCargo (líneas 786, 843, 956, 1010) → externos guardados como empleados según esquema |
| A4 | **SQL/ADO directo en controllers** (violación de capas): MantenimientoEmpleados/Externos, Contratos, EmpleadoFicha, PlanillaConsulta (elige SPs), TestConnection |
| A5 | **`MAX(Id)+1`**: EmpleadoCj (6 variantes ×2 controllers), Usuario, Empleado legacy, DetOrdenCompra.Fila (`OrdenCompraService.ActualizarAsync`), NroInterno en `sp_MigracionImport_Insertar` (sin lock), `SegMenu.OrdenMenu` en script |
| A6 | **Falta de transacción**: `OrdenCompraService.InsertarAsync` (SP + UPDATE IdWeb + N UPDATE); `PlanillaService` insert/update + auditoría; `ChequeEmpleadoService`; CompensacionService valida saldo fuera de tx; auditoría siempre fuera de la tx de negocio (y se omite en silencio si el SP no existe) |
| A7 | **Concurrencia**: `OrdenCompraService.AprobarAsync` sin UPDLOCK; PUT OC no bloquea OC aprobada; `sp_Vacacion_Solicitud_Registrar` valida saldo sin lock; staging global `updimportar` (DELETE sin filtro) |
| A8 | **Conciliación v1** actualiza `MovimientosConciliacion` y `MovimientosBcp` con el mismo Id (IDENTITY independientes) → puede modificar un movimiento ajeno (`ConciliacionBcpService.cs` ~917-983, 1257-1325) |
| A9 | **SPs no versionados** (~122 de 183) y scripts frágiles: parches por `REPLACE(OBJECT_DEFINITION)` (Planilla/03b,03d,03e), `03c` corrupto, `OrdenCompra/01` con sentencias tras `GO`, `sp_Planilla_Consulta_Estados` del repo ≠ producción, `sp_a_Contrato_Guardar` en 3 scripts |
| A10 | **Sesión**: JWT absoluto 30 min sin refresh (expulsa usuarios activos); sesiones en memoria (redeploy invalida todo; no escala); token en `localStorage` |
| A11 | **Rate limiter global no particionado** (120 req/min para toda la API) → cuello de botella/DoS |
| A12 | **IA Chat**: HTML generado por LLM en iframe `allow-scripts allow-same-origin` con JWT en localStorage (XSS); memoria de conversación global por `conversationId` sin usuario ni TTL; hasta 4000 filas financieras enviadas a OpenAI; sin control de rol |
| A13 | **Exposición de datos personales**: `/empleado/cta/listar` devuelve cuentas bancarias de todos; `rptasistenciaempleado.tsx` descarga asistencia de toda la empresa y filtra en cliente; correos de contratos a destinatarios fijos (incluye cuenta personal) |
| A14 | **SMTP inseguro** (`AllowInvalidCertificate`, `AllowInsecureFallback`); **WUP por HTTP plano** a IP pública |
| A15 | **Colisión de JobId** Operativo/Boleta WUP; Boleta no se reprograma al arrancar; `DiasEjecucion` ignorado en no gerenciales |
| A16 | **Errores internos al cliente** (`ex.ToString()`/`ex.Message`): TesoreriaGastos, PlanillaConsulta, OrdenCompra, Contratos, AsistenciaReporte, Vacaciones, MantenimientoMigracion, SegMenu |
| A17 | **Sin CI/CD ni tests** (`.github/workflows` vacío; solo `Tests/PagoTesoreriaChecks` fuera de la .sln) |
| A18 | Arrendamientos: aplicar pago PENDIENTE sin aprobaciones; aprobar/aplicar/revertir sin auditoría |

## MEDIO

| # | Hallazgo |
|---|---|
| M1 | **SQL no sargable**: fechas como texto con `TRY_CONVERT` multi-formato en WHERE; `LTRIM(RTRIM(ISNULL()))` en joins; `TRY_CONVERT(int, IdOc)`; `LIKE '%x%'` en 9 columnas; CTE que agrega toda `Planilla` sin filtro (`sp_Planilla_Consulta_Estados`) |
| M2 | **N+1 / secuencial**: `sp_Planilla_ConsultaIni` 1 llamada por banco; asociar recibos 1 UPDATE por recibo; alta OC 1 UPDATE por línea; aprobación de vacaciones y de campo en bucle desde FE; cursor en `sp_Vacacion_Periodo_GenerarMasivo`; staging fila a fila; 9 conexiones para lookups de empleados; `PuedeAsync` carga el menú completo por request |
| M3 | **Paginación/filtrado en memoria**: consulta genérica trae todo y hace Skip/Take; `sp_Asistencia_ValidarCampo`, `sp_Planilla_Listar_Reembolso` sin parámetros; webhook carga todos los empleados por mensaje |
| M4 | **Introspección de esquema en cada request** (`sys.parameters`, `sys.columns`, `COL_LENGTH`, `OBJECT_ID`) y DDL en runtime (`ALTER TABLE` en ReporteRepository, `EnsureSchemaAsync` en AsistenciaSharePointRepository) — síntoma de falta de migraciones |
| M5 | **Acceso a datos inconsistente**: `new SqlConnection` en Seg*Service, AuditoriaCambios, AsistenciaReporte, Compensacion, EmpleadoCta y controllers (ignoran timeouts/pool de SqlSettings); EF Core registrado sin uso; `CjERP.Domain` vacío; namespaces `CjERP.Api.Configuration` dentro de Shared; lógica en capa Api |
| M6 | **Lógica duplicada FE/BE/SQL**: IGV (FE 5+ sitios vs BE), TC fijo, jornada 9.6 h en 2-3 archivos FE, mapeo de estados en pagos_v1 vs gastosaprobar, `NormalizePhone` ×3, zona horaria Perú ×4+, conciliación SQL huérfana vs C#, `sp_EmpleadoCj_AprobarCompleto` vs C# |
| M7 | **Dos modelos de vacaciones** (legacy en uso, nuevo sin UI); **dos pipelines de migración**; **dos fuentes de menú** (SP vs SQL inline) |
| M8 | **Envelope de respuesta inconsistente** (Seguridad/Lookup sin `{success,data}`; BadRequest string vs objeto) |
| M9 | SharePoint sin caché de token; `new HttpClient()` por llamada en SqlMonitorService; push Expo 1 a 1 sin receipts |
| M10 | FE roto: CJ Intelligence llama `/ai/*` inexistente; reembolso "actualizar" → 501; `existeUsuarioPerfil` apunta a ruta inexistente (doble guardado); `importar.tsx:317` lee `row.oT` (columna OT vacía) |
| M11 | `AppRuntimeGuard` convierte cualquier `unhandledrejection` en pantalla de crash global |
| M12 | Dependencias: DevExtreme (licencia comercial) cargado solo por `pagos_dev.tsx`; `xlsx` 0.18.5 desactualizado |
| M13 | Configuración fija en código: URL producción en `httpClient.ts`, SharePoint base URL, plantillas de contratos atadas a 2026, CORS con localhost siempre |
| M14 | Logs con PII y PDFs base64 sin retención (`ReporteWhatsAppLog`), `IaChatAuditoria` sin índices ni retención |

## BAJO

| # | Hallazgo |
|---|---|
| B1 | Stubs con ruta (~25): contabilidad, compras, comercial, planta, inicio, logística, operaciones (capitalizacion/asignacion), reporte operativo/financiero, administracion (asistencia/marcacion/solicitud), recursoshumanos (personal/asistencia), mantenimiento (consulta/mantenimiento), arrendamientos (documentos/auditoría/configuración) |
| B2 | Archivos huérfanos/vacíos: `rptasistencia copy.tsx`, `dashboard2.tsx`, `DepositoPage.tsx`, `operacion/compensacion.tsx` (0 B), `descansomedico.tsx`/`evaluacion.tsx` (0 B), `administracion/asistencia.tsx`, `marcacion.tsx`, `administracion/mantenimiento/ConsultaPage.tsx`, `features/gestion/*`, `CruceSeriesPage.tsx`, `SolicitudPage.tsx`, `pages/reporte/administrativo.tsx`, `pages/UsuariosPage.tsx`, `pages/ConfiguracionPage.tsx`, `app/menu/menuData.ts`, `menuDashboard.ts`, `utils/menu/iconMapper.ts`, `api/tesoreriaService.ts`, `seguridadPermisosService.ts` |
| B3 | Rutas duplicadas/alias: cheque/cheques, compensacion/compensacionreal, vacaciones (2), modificaciones (2), exportación SharePoint (2), dashboard1 (2), pagosdsh/dshpagos, `/reporte/…` vs `/reportes/…` |
| B4 | Mojibake en literales ("Ã³", "SÃBADO"); typo en SP `sp_EmpleadoOtros_ActualizaarVacaciones` y archivo `exportacionasistnciasharepointpage.tsx` |
| B5 | Código muerto: `ValidarPagoRequest` (Arrendamientos), herramientas Anthropic en IaChatService, `EjecutarAccionAsync` en AsistenciaValidarCampoService, `MobileCommunicationPublisher` sin consumidores, constantes de SP sin uso |
| B6 | `QuestPDF.Settings.EnableDebugging = true` (`ReportePdfService.cs` ~2167); comparación de VerifyToken no en tiempo constante; validación de adjuntos solo por extensión |
| B7 | Carpetas de artefactos locales con copias de configuración (`CjERP.Backend/artifacts`, `bin/`, `.codexbuild`, `tmp/`) — no versionadas pero con posibles secretos en disco |
| B8 | Repo git exterior `Cj_ERP_Web/` con snapshot antiguo que confunde (todo aparece "deleted") |

## Mejoras sugeridas (no implementadas)
1. Autorización server-side por permiso (reutilizando `SegPermisoAccion`) — prioridad máxima.
2. Rotación de secretos + purga de historial + validación al arranque de `JwtSettings:Key`.
3. Versionar todos los SPs/DDL en `CjERP.Backend/Database/` (exportar desde BD).
4. Extraer componentes compartidos de las páginas de tesorería (bandejas, filtros, exportación) antes de seguir creciendo archivos.
5. Unificar duplicados (Empleados/Externos parametrizando cargo; eliminar `_dev`/legacy tras confirmar menú).
6. IDENTITY/SEQUENCE en lugar de `MAX+1`; transacciones que incluyan auditoría.
7. Refresh token o JWT deslizante; store de sesión persistente.
