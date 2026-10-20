# 05 - Auditoría de Seguridad, DevOps e Infraestructura (solo lectura)

> Fecha: 2026-10-14. Alcance: repo `Cj-Erp-Web/` (BE .NET 8, FE React/Vite, Dockerfile, vercel.json, docs). Método: lectura de código y configuración; **no se ejecutó nada, no se instaló nada, no se contactó BD ni Railway**. Ningún valor de secreto aparece en este documento.
> Estados: IMPLEMENTADO / PARCIAL / DOCUMENTADO (solo documentado, no corregido) / NO ENCONTRADO / NO VERIFICABLE (requiere acceso a BD, Railway, Azure o GitHub).
> Prioridad: P0 (inmediata) · P1 (<30 días) · P2 (<90 días) · P3 (mejora). Nada aquí se afirma como explotable sin evidencia de código; donde la evidencia es indirecta se indica.
> Fuentes previas contrastadas: `docs/TECHNICAL_DEBT.md` (2026-09-25), `docs/INTEGRATIONS.md`, `AGENTS.md`.

## 1. Semáforo por área

| Área | Semáforo | Justificación breve |
|---|---|---|
| Autenticación (login, JWT, sesión) | ROJO | Clave en texto plano (según SP/doc), login sin rate limit ni lockout, sesión solo en memoria |
| Autorización backend (roles, IDOR) | ROJO | `AddAuthorization()` sin policies; casi todo solo `[Authorize]`; usuario/aprobador desde body (doc) |
| Gestión de secretos | ROJO | Secreto SMTP en archivo versionado; historial git con config sensible; tokens fijos en código; copias de appsettings en carpetas locales |
| Exposición de BD / red | AMARILLO (parte NO VERIFICABLE) | `Encrypt=false` + `TrustServerCertificate=true` declarados; topología de red real no verificable desde el repo |
| Endpoints sensibles (KILL, webhook, WUP) | ROJO | KILL sin rol; webhook sin firma; dashboard WUP sin chequeo admin |
| CORS / transporte / cabeceras | AMARILLO | CORS acotado a orígenes, pero localhost siempre permitido; sin CSP/HSTS explícitos; SMTP/WUP inseguros |
| Rate limiting / DoS | AMARILLO | Limitador global fijo (no por usuario/IP); login excluido |
| Logging / datos personales (Ley 29733) | AMARILLO | Logs con PII y PDFs base64 sin retención (doc); sin evidencia de política de protección de datos |
| CI/CD y calidad | ROJO | `.github/workflows` vacío; sin pipeline; tests existen pero fuera de pipeline |
| Dependencias | AMARILLO | Versiones recientes en BE; `xlsx` 0.18.5 desactualizado; no se auditó con herramientas (no permitido) |
| Segregación de ambientes | AMARILLO | `.env.*` y `appsettings.Development.json` ignorados; Docker con `ASPNETCORE_ENVIRONMENT=Production`; staging real no evidenciado |
| Backups / DR | GRIS | No hay documentación de backups ni RTO/RPO en el repo |
| Observabilidad | AMARILLO | Health check SQL + log de requests lentos; sin métricas/APM/alertas |
| Resiliencia / SPOF | ROJO | Sesiones en memoria, instancia única, Hangfire en la misma BD |

## 2. Hallazgos

### SEC-01 - Backend sin autorización por rol/política
- Componente: API (todos los controllers). Archivo: `CjERP.Backend/CjERP.Api/Program.cs` (`builder.Services.AddAuthorization();` sin policies; `UseAuthorization()`).
- Evidencia: no hay `AddPolicy`; búsqueda de `Authorize(Roles/Policy)` / `IsInRole` sin resultados en controllers; único control por rol encontrado: `MobileMonitorController` (`IdRol` en `MobileMonitor:AdminRoleIds`). Los permisos `SegPermisoAccion` se aplican solo en FE (AGENTS.md).
- Estado: NO ENCONTRADO (control server-side) / DOCUMENTADO (TECHNICAL_DEBT C1).
- Impacto: cualquier usuario autenticado puede invocar directamente endpoints de aprobación, seguridad (perfiles/menús), migración, etc., saltándose la UI.
- Riesgo: Alto (escalada de privilegios, fraude). Prioridad: **P0/P1**.
- Recomendación: policies basadas en permiso (`SegRolMenuPermiso`/`SegPermisoAccion`) con `IAuthorizationHandler`; empezar por Seguridad, SQL Monitor, Aprobaciones, Pagos, Mantenimiento.
- Dependencias: SEC-02, tablas Seg*, FE (permisos ya modelados).

### SEC-02 - Usuario/aprobador aceptado desde el body (suplantación) e IDOR por parámetros
- Componente: OrdenCompra, TesoreriaGastos, Compensacion, AsistenciaValidarCampo, EmpleadoPendiente, LogisticaRecojo, TesoreriaCheques, PlanillaConsulta (IdCargo/IdEmpleado del cliente).
- Evidencia: documentado con líneas en TECHNICAL_DEBT C2/C3. No re-verificado línea por línea en esta auditoría. Los claims necesarios sí existen (`IdUsuario`, `IdEmpleadoCj`, `IdCargo`, `IdRol`).
- Estado: DOCUMENTADO.
- Impacto: auditoría falsificable; lectura de datos financieros de otros usuarios cambiando IdCargo.
- Riesgo: Alto. Prioridad: **P1**.
- Recomendación: derivar siempre usuario/cargo de claims; eliminar o ignorar esos campos en los DTO; pruebas de integración de IDOR.
- Dependencias: SEC-01; contratos API consumidos por FE y app móvil (evaluar impacto antes de quitar campos).

### SEC-03 - Contraseñas en texto plano y login sin protección anti fuerza bruta
- Componente: `AuthService.LoginAsync` -> `dbo.sp_ValidarUsuario` con `@pClave`; `AuthController.Login` con `[DisableRateLimiting]`.
- Evidencia: `AuthService.cs` pasa la clave tal cual al SP; doc: clave en texto plano truncada a 10 caracteres (`Database/Mobile/13_Perfil_Cargo_Login.sql`). Sin lockout ni contador de intentos en código. El mensaje de error no distingue usuario/clave (correcto).
- Estado: DOCUMENTADO (texto plano; contenido de BD NO VERIFICABLE) / NO ENCONTRADO (rate limit/lockout de login).
- Impacto: filtración de BD o backup expone todas las claves; fuerza bruta sin límite.
- Riesgo: Alto. Prioridad: **P0** (rate limit login) / **P1** (hash).
- Recomendación: (1) limitador de login por IP+usuario y lockout temporal; (2) hash con sal (PBKDF2/Argon2) con migración "al primer login"; (3) quitar truncado de 10 y fijar política mínima; (4) alerta por intentos fallidos.
- Dependencias: app móvil (mismo login), `sp_ValidarUsuario` no versionado (PV), SEC-20.

### SEC-04 - Secretos en archivos versionados e historial git
- Componente: `CjERP.Backend/CjERP.Api/appsettings.json` (tracked), `cjerp-frontend/.env` (tracked), historial git.
- Evidencia (sin valores): en `appsettings.json` la clave `SmtpSettings:Password` tiene un valor no-placeholder. Las demás claves sensibles (`ConnectionStrings:DefaultConnection`, `JwtSettings:Key`, `SharePoint:ClientSecret`, `WupSettings:Password`, `WhatsappInboundSettings:VerifyToken`, `MetaWhatsAppSettings:AccessToken`) tienen aspecto de placeholder; `OpenAI:ApiKey` y `Anthropic:ApiKey` vacíos (se leen de variable de entorno). `appsettings.Development.json` está en `.gitignore` pero **existió versionado**: `git log --all -- appsettings.Development.json` devuelve más de 15 commits (p. ej. 17dcea5, b5e8bc8, 5b44519); existe la rama `backup/pre-push-secret-cleanup` y el commit `ac57801` ("limpia configuracion sensible"), lo que sugiere limpieza parcial sin purga del historial. `cjerp-frontend/.env` tracked contiene `VITE_GOOGLE_MAPS_API_KEY` (clave de navegador: exposición esperada, debe restringirse por referrer).
- Estado: PARCIAL (limpieza parcial) / DOCUMENTADO (C6). Vigencia de los valores del historial: NO VERIFICABLE (no se compararon).
- Impacto: quien tenga lectura del repo (`github.com/Amaya2711/CjErp`; visibilidad NO VERIFICABLE) o un clon antiguo puede recuperar credenciales de BD, Azure AD, SMTP, WUP y APIs de IA.
- Riesgo: Alto/crítico. Prioridad: **P0**.
- Recomendación: rotar TODAS las credenciales que estuvieron alguna vez en el repo (BD, JWT key, client secret de Azure/Graph, SMTP, WUP, Meta, OpenAI, Anthropic); quitar el valor SMTP de `appsettings.json` (usar `SmtpSettings__Password`); purgar historial (`git filter-repo`) y confirmar repo privado; activar GitHub secret scanning/push protection; validar al arranque `JwtSettings:Key` (longitud y no placeholder).
- Dependencias: despliegue en Railway (variables), Azure, SEC-05.

### SEC-05 - Tokens fijos en código y carpetas locales con copias de configuración
- Componente: `OrdenCompraController.cs` y `PagoTesoreriaController.cs` (token del gestor legacy `elnk.uno` como constante); carpetas `tmp/`, `CjERP.Backend/artifacts/`, `artifacts/`, `.codexbuild/`, `CjERP.Backend/_tmpbuild_backend`, `bin_check`; `TEMP_NO_USE.txt` (4 bytes) y `Varios/` (vacía).
- Evidencia: copias de `appsettings.json` y `appsettings.Development.json` en disco bajo `tmp/oc-api-build/` y `CjERP.Backend/artifacts/{access-check,recojo-build,reembolso-build,revision-check}/` (no versionadas: `.gitignore` excluye `tmp/`, `artifacts/`, `bin/`, `obj/`). Sin embargo `git ls-files` muestra **16 archivos de `CjERP.Backend/tmp/backendobj*/` versionados** (nuget.g.props, `project.assets.json`, dgspec): no son secretos pero exponen rutas locales y ensucian el repo. Logs `tmp/cjerp-api-5015.*.log` en disco (contenido no revisado; podrían tener PII).
- Estado: DOCUMENTADO (B7) / VERIFICADO en disco.
- Impacto: riesgo de copia accidental de secretos al comprimir/compartir carpetas; token fijo no rotable sin redeploy.
- Riesgo: Medio. Prioridad: **P1**.
- Recomendación: borrar carpetas de build locales con config; mover el token del gestor legacy a configuración; `git rm -r --cached CjERP.Backend/tmp` y ampliar `.gitignore` (`**/tmp/`, `**/artifacts/`); revisar y borrar `tmp/*.log`.
- Dependencias: SEC-04.

### SEC-06 - Conexión a SQL Server: cifrado y exposición
- Componente: `appsettings.json` -> `SqlSettings:Encrypt=false`, `SqlSettings:TrustServerCertificate=true`; Dockerfile (Railway).
- Evidencia: ambos flags literales en `appsettings.json` (no son secretos). Host/puerto de la cadena real se inyectan fuera del repo (NO VERIFICABLE). La API corre en Railway (`cjerp-production.up.railway.app`), por lo que el SQL Server debe ser alcanzable desde Railway: si es on-prem o un servidor propio, implica puerto SQL publicado a Internet o VPN (NO VERIFICABLE). Nota: estos flags de `SqlSettings` podrían no aplicarse a la cadena de `DefaultConnection` (Hangfire y health check usan la cadena directa); validar qué valor efectivo tiene la cadena real.
- Estado: PARCIAL (cifrado desactivado en config) / NO VERIFICABLE (topología).
- Impacto: con `Encrypt=false` el tráfico TDS puede viajar sin TLS por Internet; `TrustServerCertificate=true` anula validación de certificado (MITM).
- Riesgo: Alto si el SQL es público; Medio con red privada. Prioridad: **P0 (verificar) / P1 (corregir)**.
- Recomendación: ver sección 4. Mínimo: `Encrypt=true`, certificado válido y `TrustServerCertificate=false`; login SQL con mínimo privilegio (sin `sa`/`db_owner`; `VIEW SERVER STATE` solo para el monitor); allowlist de IP si hay IP de salida fija.
- Dependencias: proveedor de BD, Railway, SQL Monitor.

### SEC-07 - JWT: configuración, almacenamiento y sesión
- Componente: `Program.cs` (AddJwtBearer), `JwtService`, `ActiveUserSessionService`, FE `utils/authStorage.ts`.
- Evidencia: HS256 simétrico; valida emisor, audiencia, lifetime y firma, `ClockSkew=0`, `RequireHttpsMetadata` fuera de dev; token 30 min con refresh (`POST /api/auth/refresh`) y sesión server-side por `SessionId` (valida y renueva actividad; idle 30 min); logout revoca la sesión. Sin validación de longitud/entropía de `JwtSettings:Key` al arranque. Token en `localStorage` (expuesto a XSS). `logout-beacon` anónimo cierra la sesión del token presentado (impacto bajo).
- Estado: IMPLEMENTADO (validaciones base, refresh, sesión) / PARCIAL (key, almacenamiento).
- Riesgo: Medio; sube a Alto combinado con SEC-12. Prioridad: **P2** (P1 la validación de clave).
- Recomendación: validar clave al arranque; cookie `HttpOnly; Secure; SameSite` (o BFF) en lugar de `localStorage`; RS256/OIDC si se adopta Entra ID (SEC-20).
- Dependencias: SEC-12, SEC-21.

### SEC-08 - Webhook WhatsApp anónimo sin verificación de firma
- Componente: `WhatsappWebhookController` (`[AllowAnonymous]`, `POST /api/whatsapp/webhook`).
- Evidencia: el POST llama a `ProcesarWebhookAsync` sin verificar `X-Hub-Signature-256`; búsqueda de `Hub-Signature`/`HMAC` en el BE: sin resultados. El GET sí valida `hub.verify_token`. `WhatsappInboundSettings:Enabled=true` en `appsettings.json`.
- Estado: NO ENCONTRADO (firma) / DOCUMENTADO (C8).
- Impacto: un tercero puede enviar payloads falsos y provocar generación/envío de PDFs de asistencia/boletas a números de empleados, costos y carga.
- Riesgo: Alto. Prioridad: **P0/P1**.
- Recomendación: validar HMAC SHA-256 con App Secret sobre el cuerpo crudo (tiempo constante), idempotencia por `message.id`, rate limit por origen; deshabilitar `Enabled` si no se usa hasta corregir.
- Dependencias: Meta/WUP, `WhatsappInboundService`.

### SEC-09 - SQL Monitor: `KILL` de sesiones para cualquier usuario autenticado
- Componente: `SqlMonitorController.CancelarSesion` (`POST /api/sqlmonitor/cancelar/{sessionId}`), `SqlMonitorService.cs:552` (`KILL {sessionId}`).
- Evidencia: controller solo `[Authorize]`, sin chequeo de rol; `sessionId` es `int` > 0 (no hay inyección, sí cancelación arbitraria, incluidas sesiones de otros usuarios o de Hangfire).
- Estado: NO ENCONTRADO (control de rol) / DOCUMENTADO (C7).
- Impacto: DoS dirigido sobre la BD. Riesgo: Alto. Prioridad: **P0**.
- Recomendación: restringir toda la ruta a rol administrador/DBA (patrón de `MobileMonitorController`), auditar cada KILL, impedir matar la propia sesión de la app.
- Dependencias: SEC-01.

### SEC-10 - Dashboard WUP y logs con PDFs base64
- Componente: `ReportesWhatsappController.ObtenerDashboard` (`GET .../dashboard`), `ReporteRepository`.
- Evidencia: `ObtenerDashboard` no llama a `UsuarioAutorizadoAsync` (otros métodos del mismo controller sí); doc C9/M14: `RequestJson` con PDFs base64 de boletas en `ReporteWhatsAppLog` sin retención.
- Estado: NO ENCONTRADO (chequeo en dashboard) / DOCUMENTADO.
- Impacto: fuga de nóminas (datos personales y financieros). Riesgo: Alto. Prioridad: **P0/P1**.
- Recomendación: aplicar `UsuarioAutorizadoAsync`; no persistir base64; purgar lo existente; política de retención.
- Dependencias: SEC-15.

### SEC-11 - Endpoint de diagnóstico anónimo
- Componente: `TestConnectionController` (`GET /api/testconnection`), `/health`.
- Evidencia: `TestConnectionController` no tiene `[Authorize]` y no hay `FallbackPolicy` -> accesible sin token; informa conectividad a SQL (usa `CJERPDbContext`). Los controllers Mobile* y `PagoTesoreriaController` sí tienen `[Authorize]` (combinado en `[ApiController, Authorize, ...]`). `/health` anónimo, solo estado.
- Estado: IMPLEMENTADO (resto) / NO ENCONTRADO (protección en TestConnection).
- Impacto/Riesgo: bajo (oráculo de disponibilidad). Prioridad: **P1** (fácil).
- Recomendación: eliminar el controller o proteger; `FallbackPolicy = RequireAuthenticatedUser` para que lo nuevo nazca protegido (excepto login/webhook/health).

### SEC-12 - IA Chat: HTML de LLM en iframe con `allow-scripts allow-same-origin`
- Componente: FE `features/reportes/administrativo/iachat.tsx:2812`, BE `IaChatService`.
- Evidencia: sandbox con ambos permisos anula el aislamiento si el contenido es del mismo origen (srcDoc); token en `localStorage`. Doc A12: hasta 4000 filas financieras enviadas a OpenAI; memoria de conversación por `conversationId` sin usuario ni TTL.
- Estado: PARCIAL/DOCUMENTADO. Explotabilidad real depende de cómo se inyecta el HTML (no demostrado).
- Riesgo: Medio-Alto. Prioridad: **P1**.
- Recomendación: quitar `allow-same-origin`; sanear HTML; ligar conversación al usuario con TTL; acuerdo de tratamiento de datos con el proveedor y enmascarado de datos personales.
- Dependencias: SEC-07, SEC-15.

### SEC-13 - CORS, cabeceras y HTTPS
- Componente: `Program.cs` (`ReactPolicy`, `UseForwardedHeaders`, `UseHttpsRedirection`), `cjerp-frontend/vercel.json`.
- Evidencia: `WithOrigins(allowedOrigins)` + `AllowAnyHeader/AllowAnyMethod`, sin `AllowCredentials` ni `*` (bien). Orígenes por defecto incluyen `https://cj-erp.vercel.app` y `localhost:5173` también en producción (M13). `UseForwardedHeaders` sin `KnownProxies/KnownNetworks` (por defecto solo loopback; efecto en IP/esquema tras Railway NO VERIFICABLE). No se encontró HSTS, CSP, `X-Content-Type-Options` ni `X-Frame-Options` en BE ni en `vercel.json` (solo rewrites). Swagger solo en Development; Hangfire Dashboard **no se mapea** (`UseHangfireDashboard` sin resultados): no hay panel expuesto.
- Estado: IMPLEMENTADO (CORS acotado, Swagger/Hangfire no expuestos) / NO ENCONTRADO (cabeceras de seguridad).
- Riesgo: Bajo-Medio. Prioridad: **P2**.
- Recomendación: quitar localhost en Production; `headers` en `vercel.json` (CSP, HSTS, nosniff, frame-ancestors, referrer-policy); configurar `ForwardedHeadersOptions` para Railway; `UseHsts`.

### SEC-14 - Rate limiting
- Componente: `Program.cs` `AddFixedWindowLimiter("api")` (120 req/min desde `SqlSettings`), `RequireRateLimiting("api")`.
- Evidencia: ventana fija global, no particionada por IP/usuario (un cliente ruidoso agota la cuota de todos, A11); `login` y `refresh` con `[DisableRateLimiting]`.
- Estado: PARCIAL. Riesgo: Medio. Prioridad: **P1** (junto con SEC-03).
- Recomendación: `PartitionedRateLimiter` por usuario/IP; política estricta para `login` y webhook.
- Dependencias: SEC-13 (IP real tras proxy).

### SEC-15 - Protección de datos personales (Ley N.° 29733 y reglamento)
- Componente: empleados, cuentas bancarias, boletas, asistencia/GPS, descansos médicos (datos de salud), WUP/WhatsApp, IA externa.
- Evidencia: se tratan datos personales y sensibles. Doc A13/M14: `/empleado/cta/listar` devuelve cuentas de todos; asistencia completa descargada y filtrada en cliente; logs con PII; datos a OpenAI/Anthropic. No se encontró en el repo política de privacidad, registro de banco de datos personales (ANPDP), consentimientos, retención ni acuerdos de tratamiento con terceros.
- Estado: NO ENCONTRADO (gobierno documental) / NO VERIFICABLE (si existe fuera del repo). No es opinión legal; validar con asesoría legal.
- Riesgo: Alto (regulatorio/reputacional). Prioridad: **P1/P2**.
- Recomendación: inventario y registro de bancos de datos ante la ANPDP; medidas de seguridad (control de acceso, trazabilidad, cifrado); minimización de endpoints (filtro server-side); retención y purga de logs; cláusulas con Meta, WUP, OpenAI, Anthropic, Microsoft.
- Dependencias: SEC-01, SEC-02, SEC-10, SEC-12.

### SEC-16 - Inyección SQL
- Componente: Dapper con parámetros (patrón dominante) y excepciones puntuales.
- Evidencia: uso mayoritario de `sp_*` parametrizados. SQL dinámico por interpolación: `Mantenimiento{Empleados,Externos}Controller` (`INSERT INTO dbo.Empleado (columnas) VALUES (valores)` con listas armadas en código; parametrización de valores NO VERIFICADA), `ConciliacionBcpService:2485` (`keyExpression`/`tableName`), `ArrendamientosService:1826` (`COL_LENGTH('{tabla}','{columna}')`), `OrdenCompraService:1898` (`tablaEmpleado`), repos SharePoint (`TOP ({limit})`), `KILL {sessionId}` (int).
- Estado: PARCIAL (no se demostró explotación; las interpolaciones parecen internas o enteras).
- Riesgo: Bajo-Medio. Prioridad: **P2**.
- Recomendación: confirmar que tabla/columna/expresión provienen de listas blancas; migrar INSERT dinámicos a SP.
- Dependencias: A4/A5 de TECHNICAL_DEBT.

### SEC-17 - Errores y logging
- Componente: `UseExceptionHandler` global, controllers con `ex.ToString()`/`ex.Message` (26 usos de `ex.ToString()` en controllers), `SlowRequestLoggingMiddleware`, `QuestPDF.Settings.EnableDebugging`.
- Evidencia: el manejador global oculta detalles fuera de Development (bien); varios controllers devuelven la excepción al cliente (A16). Los logs de arranque de OpenAI/Anthropic registran solo booleanos (sin claves). Sin logging estructurado centralizado ni retención definida.
- Estado: PARCIAL. Riesgo: Medio. Prioridad: **P2**.
- Recomendación: mensaje genérico + `traceId`; eliminar `ex.ToString()` de respuestas; redacción de PII en logs.

### SEC-18 - SMTP y WUP inseguros
- Componente: `SmtpSettings:AllowInvalidCertificate=true`, `AllowInsecureFallback=true`; WUP `BaseUrl` por HTTP plano (doc).
- Evidencia: flags en `appsettings.json`. Correo principal por Graph (HTTPS) con SMTP de respaldo.
- Estado: IMPLEMENTADO (Graph principal) / PARCIAL (respaldo inseguro).
- Riesgo: Medio (credenciales y PDFs de boletas sin TLS hacia WUP). Prioridad: **P1** WUP, P2 SMTP.
- Recomendación: exigir HTTPS en WUP (o túnel/VPN); flags SMTP en `false`.
- Dependencias: proveedor WUP.

### SEC-19 - CI/CD, pruebas y contenedor
- Componente: `.github/workflows/` (vacío), `CjERP.Backend/Dockerfile`, `railpack.json`, `Tests/`.
- Evidencia: sin workflows; `main` despliega solo (memoria del proyecto) a Railway/Vercel sin gates. Existen `Tests/CjERP.Backend.Tests.Ia`, `Tests.Viaticos` y `PagoTesoreriaChecks`, fuera de pipeline. Dockerfile multi-stage con imagen oficial `dotnet/aspnet:8.0` (tag flotante), **corre como root** (sin `USER`), sin `HEALTHCHECK`.
- Estado: NO ENCONTRADO (CI/CD) / PARCIAL (Docker).
- Riesgo: Alto operativo. Prioridad: **P1**.
- Recomendación: workflow mínimo (build BE+FE, tests, `dotnet list package --vulnerable`, `npm audit`, gitleaks), protección de `main` con PR obligatorio, ambiente de staging; Dockerfile con usuario no root y `HEALTHCHECK`.
- Dependencias: SEC-04, SEC-24.

### SEC-20 - Entra ID / MFA / SSO como opción
- Componente: autenticación completa; ya existe tenant Microsoft 365 (SharePoint, Graph, correo `cj-telecom.com`).
- Evidencia: `SharePoint:TenantId/ClientId` ya se usan para Graph (client credentials); no hay OIDC de usuarios ni MFA; login propio con claves propias.
- Estado: NO ENCONTRADO.
- Evaluación: **viable y recomendable** a mediano plazo. Ventajas: MFA y acceso condicional (según licencia M365, PV), elimina contraseñas propias (SEC-03), SSO, baja inmediata de empleados, tokens RS256 validables por JWKS. Retos: mapear UPN/correo con `Usuario`/`EmpleadoCj` (el claim `Correo` ya existe), app móvil Expo (MSAL/AppAuth), usuarios externos sin cuenta M365, convivencia temporal con login legacy. Fases: (1) hash + lockout ya; (2) OIDC (Authorization Code + PKCE) en FE, validación del token Entra en la API y emisión del JWT interno con los claims actuales (puente); (3) apagar login por clave.
- Prioridad: **P2**. Dependencias: SEC-01, SEC-03, licencias M365.

### SEC-21 - SPOF, escalabilidad y DR
- Componente: sesiones en memoria, Hangfire en la misma BD, instancia única, estado estático, backups.
- Evidencia: `ActiveUserSessionService` usa `ConcurrentDictionary` (un redeploy invalida todas las sesiones; no escala a más de una instancia sin store compartido); Hangfire usa `DefaultConnection` (misma BD operativa) con `PrepareSchemaIfNecessary=true` y 5 workers; más estado en memoria (`WhatsappInboundService.ConversationStates`, `IaChatService.Conversations`, `WupAuthService`, `TesoreriaGastosController`). No hay documentación de backups, RPO/RTO ni restauración probada (NO ENCONTRADO en el repo). Réplicas en Railway: NO VERIFICABLE.
- Estado: DOCUMENTADO (A10) / NO ENCONTRADO (DR).
- Riesgo: Alto operativo. Prioridad: **P1** (backups) / P2 (sesión compartida).
- Recomendación: documentar y probar backups SQL (completo + log, copia externa); sesión en BD/Redis o solo JWT corto + refresh con revocación; Hangfire con esquema/BD propia; control de jobs duplicados si se escala.

### SEC-22 - Dependencias (solo versiones; sin ejecutar auditoría)
- Evidencia BE: JwtBearer 8.0.25, EF Core 8.0.11, Hangfire 1.8.14, MailKit 4.17.0, Dapper 2.1.72, Microsoft.Data.SqlClient 7.0.0, QuestPDF 2024.12.1, Swashbuckle 6.6.2 (recientes; CVE no verificados). EF Core registrado sin uso. FE: React 19.2, axios ^1.13, vite ^8, jspdf ^3, `xlsx` ^0.18.5 (paquete npm sin mantenimiento con vulnerabilidades públicas conocidas) y `devextreme` 26.1.4 (licencia comercial, solo `pagos_dev.tsx`).
- Estado: PARCIAL / NO VERIFICABLE (CVE vigentes).
- Riesgo: Medio. Prioridad: **P2**.
- Recomendación: `xlsx` solo con archivos de origen confiable o migrar a alternativa mantenida; eliminar `devextreme`; Dependabot + auditoría en CI; verificar elegibilidad de licencia QuestPDF Community.

### SEC-23 - Observabilidad
- Evidencia: `/health` (SQL), `SlowRequestLoggingMiddleware`, `SqlMonitorWorker` y `sp_Monitor_*`. Sin APM, métricas, trazas, alertas ni `traceId` correlacionado; logs a consola.
- Estado: PARCIAL. Prioridad: **P2**.
- Recomendación: OpenTelemetry + Application Insights/Grafana, alertas (5xx, latencia, jobs fallidos), eventos de seguridad (logins fallidos, KILL, cambios de permisos), `/health/live` y `/health/ready`.

### SEC-24 - Segregación de ambientes
- Evidencia: `.env.local-backend` y `.env.railway-backend` (FE) comentados como local y "ambiente de pruebas"; `appsettings.Development.json` ignorado; `httpClient.ts` fija la URL de producción como fallback. Sin evidencia de BD/Railway de staging en el repo; AGENTS/TECHNICAL_DEBT (B9) mencionan objetos de prueba en la BD de producción.
- Estado: NO VERIFICABLE (¿el ambiente de pruebas usa datos de producción?).
- Riesgo: Medio-Alto si pruebas usan datos reales. Prioridad: **P1** (confirmar).
- Recomendación: BD y servicio de staging con datos anonimizados; secretos distintos por ambiente; retirar objetos `*_Test`/`*_Backup` de producción.

## 3. Aspectos positivos verificados
Hangfire Dashboard no expuesto; Swagger solo en Development; CORS sin comodín ni credenciales; JWT valida issuer/audience/lifetime/firma; sesión server-side con idle y refresh; login sin enumeración de usuarios; correo por Graph (HTTPS) como camino principal; manejador global de excepciones oculta detalle en producción; secretos de IA por variable de entorno; `.gitignore` excluye `.env*`, `appsettings.Development.json`, `tmp/`, `artifacts/`. Endpoints anónimos: login, `logout-beacon`, webhook, `/health`, `testconnection`.
No revisado por política: valores de `.env`, `appsettings*.json` y contenido de `tmp/*.log`.

## 4. Opciones para reducir la exposición de la base de datos (SEC-06)

| Opción | Descripción | Esfuerzo | Efecto |
|---|---|---|---|
| A. Red privada / VPN | API y BD en la misma red privada o Railway conectado por VPN/WireGuard; cerrar 1433 a Internet | Medio-Alto | Elimina exposición pública |
| B. Túnel/gateway | Sidecar con túnel (Cloudflare Tunnel/Tailscale/SSH) hacia la BD; la BD solo acepta el túnel | Medio | Sin puerto público; compatible con Railway |
| C. IP allowlist | Firewall del SQL permite solo la IP de salida estática de la API y admins | Bajo | Reduce superficie; no cifra |
| D. TLS correcto | `Encrypt=true`, certificado válido, `TrustServerCertificate=false` | Bajo | Protege en tránsito (mínimo obligatorio con A-C) |
| E. Mínimo privilegio | Login dedicado por aplicación, sin `db_owner`; EXECUTE solo sobre SP; cuentas separadas para monitor y Hangfire | Medio | Limita impacto de compromiso y de SEC-09 |
| F. BD gestionada | Azure SQL/Managed Instance con Private Link, backups gestionados, Entra auth | Alto | Resuelve red, TLS, backup y DR |
| G. API como única entrada | Ya es la arquitectura; reforzar con SEC-01/02 para que la API no sea el vector | Medio | Cierra el camino "API -> BD" |

Orden sugerido: D + E + C en semanas; B o A el mes siguiente; F como decisión de arquitectura.

## 5. Acciones de 0 a 30 días

1. (P0) Rotar credenciales que estuvieron en repo/historial (BD, JWT key, Azure/Graph, SMTP, WUP, Meta, OpenAI, Anthropic) y mover el valor SMTP de `appsettings.json` a variables de entorno. (SEC-04)
2. (P0) Verificar y documentar cómo se conecta Railway a SQL Server; activar `Encrypt=true` con certificado válido, o túnel/allowlist. (SEC-06)
3. (P0) Restringir `POST /api/sqlmonitor/cancelar/{id}` y todo SQL Monitor a rol administrador. (SEC-09)
4. (P0) Limitador de intentos/lockout en `login` (IP+usuario). (SEC-03/14)
5. (P0/P1) Verificar HMAC `X-Hub-Signature-256` en el webhook (o `Enabled=false` hasta tenerlo). (SEC-08)
6. (P1) Chequeo de administrador en `dashboard` WUP; dejar de guardar base64 y purgar logs. (SEC-10)
7. (P1) Eliminar o proteger `TestConnectionController`; definir `FallbackPolicy` autenticada. (SEC-11)
8. (P1) Tomar usuario/aprobador de claims en endpoints críticos (pagos, OC, compensación, asistencia). (SEC-02)
9. (P1) Primer workflow de GitHub Actions (build + tests + secret scanning + auditoría de dependencias) y protección de `main`. (SEC-19)
10. (P1) Documentar y probar backups SQL (RPO/RTO) y confirmar separación staging/producción. (SEC-21/24)
11. (P1) Quitar `allow-same-origin` del iframe del IA Chat y ligar conversaciones al usuario. (SEC-12)
12. (P1) Validar `JwtSettings:Key` al arranque; WUP por HTTPS; limpiar `tmp/` versionado y carpetas locales con appsettings. (SEC-05/07/18)

Siguiente fase (30-90 días): policies por permiso en todo el BE, hash de contraseñas, Entra ID/MFA (SEC-20), cabeceras de seguridad, sesión compartida, observabilidad y programa de cumplimiento Ley 29733.
