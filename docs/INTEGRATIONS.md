# Integraciones — Cj ERP Web

> Basado en código (2026-09-25). No se documentan valores de secretos; solo nombres de secciones de configuración.
> **Antes de integrar algo nuevo, reutilizar el servicio existente** (p.ej. SharePoint → `ISharePointCommercialUploadService`, PDF → QuestPDF, email → patrón MailKit de `AsistenciaReporteService`, jobs → Hangfire).

| Integración | Clases / ubicación | Config (sección) | Autenticación | Endpoints externos | Módulos que la usan |
|---|---|---|---|---|---|
| **SharePoint / Microsoft Graph** | `CjERP.Api/Services/SharePointCommercialUploadService.cs` (`ISharePointCommercialUploadService`: `UploadExpenseInvoiceAsync`, `UploadBytesAsync`, `DownloadFileAsync`), `CjERP.Api/Configuration/SharePointOptions.cs`; también `PlanillaBoletaService` (firmas), `AsistenciaSharePointService` | `SharePoint` (TenantId, ClientId, ClientSecret, HostName, SitePath, DocumentLibraryName, carpetas/`FolderPaths`, `Asistencia`, `MobileCommunicationsFolderPath`) | OAuth2 client_credentials (`login.microsoftonline.com/{tenant}`), scope `graph.microsoft.com/.default`; **token + siteId + driveId pedidos en cada operación** (sin caché) | `graph.microsoft.com/v1.0/sites/…`, `/drives/{id}/root:/{path}:/content` | Tesorería (facturas gastos, cheques), Pendientes, Contratos (plantillas DOCX), Suministro, Mobile (adjuntos), Boletas (firma), Export asistencia |
| SharePoint (FE) | `cjerp-frontend/src/utils/sharepoint.ts` (`SHAREPOINT_BASE_URL` fijo, `buildSharePointUrl`) | — | sesión del navegador | URLs directas | Imágenes de asistencia, adjuntos |
| **WUP** (WhatsApp/SMS propio) | `CjERP.Infrastructure/Services/WupAuthService.cs`, `WupService.cs`, `WupSettings` (`Application/DTOs/ReportesWhatsapp/ReporteWhatsappModels.cs`) | `WupSettings` (BaseUrl, LoginEndpoint, EnviarAdjuntoEndpoint, Usuario, Password, TimeoutSeconds) | login usuario/password → token (caché estática 20 min) → Bearer | `{BaseUrl}auth/login`, `{BaseUrl}cjcomunicacionadjuntos` (**HTTP plano**) | Reportes WUP operativo/gerencial/boleta, envío manual, respuestas del webhook |
| **Meta WhatsApp Cloud API** | `MetaWhatsAppService.cs` | `MetaWhatsAppSettings` (Enabled=false, AccessToken, PhoneNumberId, GraphVersion) | Bearer | `graph.facebook.com/{ver}/{phoneId}/messages`, `/media` | Webhook entrante si `ResponseProvider="meta"` |
| **Webhook WhatsApp entrante** | `WhatsappWebhookController.cs` (anónimo), `WhatsappInboundService.cs` | `WhatsappInboundSettings` (Enabled, VerifyToken, ResponseProvider, ResponseMode, DefaultRangeDays) | GET verify token; **POST sin validación de firma** | `/api/whatsapp/webhook` | Autoservicio asistencia/boleta |
| **OpenAI** | `IaChatService.cs` (planner JSON), `ConciliacionBcpService.cs` (análisis de extractos), `SqlMonitorService.AnalizarQueryAsync` | `OpenAI` (ApiKey, Model, MaxTokens) + env `OPENAI_API_KEY`, `OPENAI_MODEL` | Bearer | `api.openai.com/v1/chat/completions`, `/v1/responses` | IA Chat, Conciliación, SQL Monitor |
| **Anthropic** | `IaChatService.SendMessageAsync` | `Anthropic` (ApiKey, Model, MaxTokens) + env `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_MAX_TOKENS` | `x-api-key`, `anthropic-version: 2023-06-01` | `api.anthropic.com/v1/messages` | IA Chat → exportar dashboard HTML |
| **SMTP / correo** | MailKit en `AsistenciaReporteService.cs` y `ContratosController.cs` (no hay servicio de email compartido) | `SmtpSettings` (Host, Port, UserName, Password, From, EnableSsl, AllowInvalidCertificate, AllowInsecureFallback, TimeoutSeconds) | usuario/password; puede aceptar certificados inválidos y caer a sin TLS | servidor SMTP | Llamadas de atención (asistencia), contratos (3ª aprobación) |
| **Expo Push** | `MobilePushDispatchService.cs` + Job `MobilePushDispatchJob` | `MobilePush` (Enabled=false, BatchSize, RetryMinutes, ReminderAfterMinutes, InitialMaxAgeHours) | ninguna | `exp.host/--/api/v2/push/send` (1 por mensaje) | Comunicaciones móviles |
| **Gestor de archivos legacy** | `OrdenCompraController.cs`, `PagoTesoreriaController.cs` | **constante en código** (URL + token) | token fijo en código | `elnk.uno/cjmultimedia/mgr001.php` | Archivos de OC, facturas en revisión de pagos |
| **Google Maps JS** | `features/reportes/gerencial/mapasite.tsx`, `features/operaciones/operacion/seguimientoempleado.tsx`, iframe en `aprobarcampo.tsx` | `VITE_GOOGLE_MAPS_API_KEY`, `VITE_GOOGLE_MAPS_MAP_ID` (`cjerp-frontend/.env`, versionado) | API key de navegador | Maps JS | Mapa de sites/personal, tracking |
| **PDF (servidor)** | QuestPDF Community (`Program.cs:124`): `ReportePdfService`, `OrdenCompraPdfDocument`, `PlanillaBoletaPdfGenerator`, `AsistenciaReporteService` | — | — | — | Asistencia, OC, boletas |
| **PDF (cliente)** | `jspdf` + `jspdf-autotable` (import dinámico), `html2canvas` en iachat | — | — | — | pagartesoreria, rptasistencia*, dshpagos, iachat |
| **Excel** | FE `xlsx` 0.18.5 (import dinámico, worker en `analisisExport.worker.ts`); BE ClosedXML (conciliación) y lectura manual ZIP+XML (`MigracionImportService`) | — | — | — | Exportaciones, migración, conciliación |
| **Word (DOCX)** | `ContratosController.ReplaceWordPlaceholders` (ZipArchive + XDocument, sin librería) | — | — | — | Contratos |
| **Hangfire** | `CjERP.Api/Jobs/*`, schedulers en `CjERP.Api/Services/` | `ConnectionStrings:DefaultConnection` | — | — | Ver tabla de jobs |

## Jobs y procesos en segundo plano
| Job | Registro | Programación | Qué hace |
|---|---|---|---|
| `reporte-whatsapp-asistencia-wup` (Operativo) | `ReporteWhatsappJobScheduler` al arrancar (`Program.cs:433-435`) | `Cron.Daily` a la hora de `ReporteWupConfig` (días ignorados) | Envía reporte de asistencia por WUP |
| `reporte-whatsapp-asistencia-wup-gerencial-{día}` | idem | un job por día configurado | Reporte gerencial |
| Boleta (`PLANILLA_BOLETA_WUP`) | solo al reprogramar desde UI | **comparte JobId con Operativo** (colisión) | Envía boletas por WUP |
| `asistencia-sharepoint-diario` | `AsistenciaSharePointJobScheduler` al arrancar | `Cron.Daily` (default 02:00, zona Lima), 3 reintentos | Export JSON de asistencia del mes a SharePoint |
| `mobile-push-dispatch` | `Program.cs:438-442` | `*/5 * * * *` UTC, `DisableConcurrentExecution(600)`, 2 reintentos | Despacho de push Expo |
| `AsistenciaReporteJob.EnviarPdfEmpleadoLlamadaAtencionAsync` | Enqueue desde API | fire-and-forget, 2 reintentos | Email de llamada de atención |
| `ReporteWhatsAppJob.EjecutarManualAsync / ReintentarFallidosAsync` | Enqueue desde /reportes-whatsapp | bajo demanda | Ejecución manual |
| `SqlMonitorWorker` (HostedService) | `Program.cs:238` | 30 s / 1 min / 5 min / diario | Capturas `sp_Monitor_*` |
| `ActiveUserSessionCleanupHostedService` | `Program.cs:229` | 10 min | Purga sesiones en memoria |

## Estado en memoria (no sobrevive reinicios ni escala a >1 instancia)
`ActiveUserSessionService` (sesiones), `ReporteWhatsappRuntimeMonitor` (ejecuciones en curso), `WhatsappInboundService.ConversationStates`, `IaChatService.Conversations`, `WupAuthService` (token), `TesoreriaGastosController.Gastos`.

## Integraciones no encontradas
SAP, Telegram, Outlook/Graph mail (el correo va por SMTP), notificaciones push web, facturación electrónica (SUNAT), servicios SOAP.
