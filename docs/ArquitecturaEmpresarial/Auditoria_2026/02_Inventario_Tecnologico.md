# 02 - Inventario tecnológico (Auditoría 2026)

Fecha: 2026-10-14. Alcance: `Cj-Erp-Web/` (repo real). Solo lectura: no se ejecutó build, tests ni conexión a servicios.
Convención: **[H]** hecho comprobado en código/manifiesto, **[I]** inferencia, **[R]** riesgo, **[Rec]** recomendación. "PV" = pendiente de validación. No se reproduce ningún secreto.

## 1. Proyectos .NET (CjERP.Backend/CjERP.Backend.sln)

| Componente | Propósito | Tecnología | Versión comprobada | Dependencias | Criticidad | Estado de mantenimiento | Riesgos |
|---|---|---|---|---|---|---|---|
| CjERP.Api | Host web: 52 archivos `*Controller.cs`, Program.cs (560 líneas), Jobs, schedulers, middleware, health | ASP.NET Core Web (Sdk.Web) | net8.0 | Application, Infrastructure, Shared; Hangfire.AspNetCore/SqlServer 1.8.14; JwtBearer 8.0.25; Swashbuckle 6.6.2 | Crítica | Activo (commits recientes) | Controllers con SQL directo y archivos de 2 000+ líneas; .NET 8 llega a fin de soporte en nov-2026 ([I], dato externo) |
| CjERP.Application | DTOs e interfaces (sin lógica) | Class library | net8.0 | Domain, Shared | Alta | Activo | Capa anémica |
| CjERP.Domain | Dominio | Class library | net8.0 | ninguna | Baja | Vacío ([H] solo .csproj) | Capa declarada sin contenido |
| CjERP.Infrastructure | Servicios Dapper (92 .cs en Services), 4 Repositories, SqlCommandFactory, EF DbContext sin DbSets, PDF, correo, IA | Class library | net8.0 | Dapper 2.1.72; Microsoft.Data.SqlClient 7.0.0; EF Core SqlServer/Design/Tools 8.0.11; MailKit 4.17.0; QuestPDF 2024.12.1; Logging.Abstractions/Options 8.0.2 | Crítica | Activo | EF Core sin uso real ([H] solo TestConnection y registro DI): paquetes muertos; licencia QuestPDF (comunidad/comercial) PV |
| CjERP.Shared | Settings de configuración | Class library | net8.0 | ninguna | Media | Estable | - |
| CjERP.Backend.Tests.Ia | xUnit del IA Chat | xUnit 2.9.2, Test.Sdk 17.11.1, runner 2.8.2, coverlet 6.0.2 | net8.0 | Infrastructure, Application, Shared | Media | Activo | Fakes manuales; reflexión sobre internos (InternalsVisibleTo) |
| CjERP.Backend.Tests.Viaticos | xUnit unit + integración + E2E HTTP en memoria (LocalDB) | xUnit 2.9.2, AspNetCore.TestHost 8.0.11, coverlet 6.0.2 | net8.0 | Api, Infrastructure, Application | Media | Activo | Requiere LocalDB/BD; no ejecutado en esta auditoría |
| PagoTesoreriaChecks | Consola de checks manuales | Exe | net8.0 | Infrastructure | Baja | Ad hoc | **No** está en la .sln ([H], la .sln solo lista Ia y Viaticos); no es test automatizado |

Observación [H]: `CjERP.Api.csproj` no referencia Dapper ni MailKit directamente (llegan transitivos vía Infrastructure). El Dockerfile copia solo los 5 csproj de producción; los tests no entran al build.

## 2. Frontend (cjerp-frontend/package.json)

| Componente | Propósito | Tecnología | Versión (rango en manifiesto) | Dependencias | Criticidad | Mantenimiento | Riesgos |
|---|---|---|---|---|---|---|---|
| SPA | UI de todos los módulos (224 .tsx, 135 .ts; 138 `lazy()` en AppRouter) | React / react-dom | ^19.2.5 | react-router-dom ^7.13.2, axios ^1.13.6 | Crítica | Activo | Sin store global; estilos inline; páginas de 4 000-8 600 líneas |
| Build | Bundler/TS | Vite ^8.0.1, TypeScript ~5.9.3, @vitejs/plugin-react ^6.0.1 | idem | - | Alta | Activo | Rangos `^` (existe package-lock.json) |
| UI/Reportes | Gráficos, Excel, PDF | recharts ^3.2.1, xlsx ^0.18.5, jspdf ^3.0.3, jspdf-autotable ^5.0.2, pdf-lib ^1.17.1, lucide-react ^1.7.0, tailwindcss ^4.2.2 | idem | - | Media | Activo | `xlsx` 0.18.5 tiene avisos de seguridad conocidos en el registro npm público (dato externo, PV con `npm audit`) |
| DevExtreme | Solo `pagos_dev.tsx` | devextreme / devextreme-react 26.1.4 (fijas) | idem | - | Baja | Legacy | Licencia comercial; la regla del proyecto prohíbe nuevos usos. [H] único import en `pagos_dev.tsx` |
| Calidad | Lint / tests | eslint ^9.39.4, typescript-eslint ^8.57.0, vitest ^3.2.7, @testing-library/react ^16.3.3, jsdom ^29.1.1 | idem | - | Media | Activo | Tests solo en `features/comercial/viaticos` |
| Hosting | Vercel: rewrite `/api/*` a Railway + fallback SPA | vercel.json | - | - | Crítica | Estable | URL del backend de producción codificada en vercel.json (cambiarla exige redeploy) |

Google Maps: `VITE_GOOGLE_MAPS_API_KEY` en `cjerp-frontend/.env` **versionado** (clave de navegador; [Rec] restringir por referrer en la consola de Google).

## 3. Despliegue e infraestructura

| Componente | Evidencia | Versión | Notas / Riesgos |
|---|---|---|---|
| Dockerfile BE | `CjERP.Backend/Dockerfile` | sdk:8.0 (build), aspnet:8.0 (runtime), `ASPNETCORE_URLS=http://+:8080`, ENV Production | [H] sin HEALTHCHECK, sin usuario no-root, sin pin de digest |
| Railway | `railpack.json` (provider dotnet) + Dockerfile | - | Dos mecanismos de build conviven; cuál usa Railway es PV. Variables de entorno no verificables |
| Vercel | `cjerp-frontend/vercel.json` | - | Un solo entorno aparente |
| CI/CD | `.github/workflows/` | - | **Directorio vacío [H]**: sin CI, sin tests automáticos ni gate de build. `main` despliega solo (memoria del proyecto) |
| BD | SQL Server (la misma BD aloja Hangfire) | versión no determinable | PV: versión/edición, backups, HA |
| Higiene git | `.gitignore` | - | Ignora bin/obj/tmp/artifacts, pero **16 archivos de `CjERP.Backend/tmp/` y `CjERP.Api.csproj.user` siguen rastreados** ([H] `git ls-files`) |

## 4. Procesos en segundo plano

| Componente | Propósito | Tecnología | Versión | Dependencias | Criticidad | Mantenimiento | Riesgos |
|---|---|---|---|---|---|---|---|
| Hangfire Server (in-process, 5 workers) | Ejecutar jobs dentro del proceso web | Hangfire, SQL Server storage, `PrepareSchemaIfNecessary=true` | 1.8.14 | BD principal | Alta | Activo | Sin dashboard montado ([H] no hay `UseHangfireDashboard`); jobs y API comparten proceso/CPU |
| ReporteWhatsAppJob + ReporteWhatsappJobScheduler | Reporte automático por WUP (operativo/gerencial) | Hangfire recurrente | - | WUP, SQL, QuestPDF | Alta | Activo | Reprogramación al arrancar en `Task.Run` tolerante a fallos |
| AsistenciaReporteJob | Reporte de asistencia | `AutomaticRetry` 2 intentos | - | SQL | Media | Activo | - |
| AsistenciaSharePointJob + Scheduler | Export diario a SharePoint | 3 reintentos | - | Graph/SharePoint | Media | Activo | Sin `DisableConcurrentExecution` ([H]) |
| GastosExcelSharePointJob + Scheduler | Gastos a tabla Excel en SharePoint | `DisableConcurrentExecution(1800)`, 3 reintentos | - | Graph | Media | Activo | - |
| MobilePushDispatchJob | Push Expo cada 5 min (cron UTC `*/5 * * * *`) | RecurringJob | - | Expo, SQL | Media | Activo | - |
| SqlMonitorWorker | Muestreo SQL (HostedService) | BackgroundService | - | SQL | Media | Activo | Estado en memoria; endpoint `KILL` abierto a cualquier autenticado (TECHNICAL_DEBT C7) |
| ActiveUserSessionCleanupHostedService | Limpia sesiones en memoria | HostedService | - | - | Media | Activo | Dependencia de estado en proceso |
| ReporteWhatsappRuntimeMonitor | Estado de ejecución en memoria (Singleton) | - | - | - | Baja | Activo | Se pierde en reinicio |

## 5. Integraciones externas

| Integración | Evidencia | Tecnología | Criticidad | Riesgos |
|---|---|---|---|---|
| Microsoft Graph: correo y SharePoint/Excel | `Program.cs` (GraphMailSettings, `IGraphMailSender`), `SharePointCommercialUploadService`, `GraphExcelTableWriter` | HttpClient directo (sin SDK Graph) | Alta | Credenciales de aplicación; [H] sin Polly ni políticas de reintento HTTP |
| SMTP (MailKit 4.17.0) | `SmtpMailSender` (Infrastructure) | MailKit | Baja (respaldo) | SMTP saliente da timeout en Railway (AGENTS.md) |
| WUP (WhatsApp) | `WupService`, `WupAuthService` | HttpClient | Alta | Dashboard expone logs con PDFs (TECHNICAL_DEBT C9) |
| Meta WhatsApp Cloud API | `MetaWhatsAppService`, `WhatsappWebhookController` (`[AllowAnonymous]`) | HttpClient | Media | Webhook sin firma (C8) |
| OpenAI / Anthropic | `OpenAiChatProvider`, `AnthropicMessagesProvider` | HttpClient | Media | Claves vacías en appsettings (se esperan por variable de entorno); datos de gastos enviados a terceros |
| Expo Push | `MobilePushDispatchService` | HttpClient | Media | - |
| Gestor legacy elnk.uno | `ConciliacionBcpService` (HttpClient tipado) | HttpClient | Baja | Dependencia de sistema legado |
| Google Maps | FE `.env` | JS API | Baja | Clave en repo |

## 6. App móvil

[H] No existe código de la app móvil (Expo) en el repo ni en la carpeta padre: solo el **backend móvil** (`MobileCommunication/Device/Version/Monitor`, 20 scripts en `Database/Mobile`). Estado: NO ENCONTRADO (la app cliente vive en otro repositorio, PV).

## 7. Pruebas automatizadas y cobertura

| Suite | Pruebas (conteo `[Fact]/[Theory]` o `it/test`) | Cobertura medida |
|---|---|---|
| Tests.Ia | 249 | Sin informe de cobertura en el repo (coverlet.collector instalado, no ejecutado) |
| Tests.Viaticos | 147 (unit + integración con LocalDB + E2E en memoria) | idem |
| FE vitest (viaticos) | 78 `it/test` en 7 archivos | idem |
| PagoTesoreriaChecks | script de consola | no aplica |

[H] Cobertura funcional: solo IA Chat, Viáticos, `JwtService.RenewToken`, bandeja de OC y `GraphExcelTableWriter`. **0 pruebas** para Planilla/Pagos, Conciliación, RRHH, Arrendamientos, Mobile, Seguridad/Auth (salvo renovación de token). [I] cobertura de líneas global del BE muy baja (sin medición). Sin CI, ninguna suite corre automáticamente.

## 8. Scripts SQL versionados

[H] 160 archivos `.sql` bajo `CjERP.Backend/Database/` (Arrendamientos 5, Asistencia 1, Finanzas 16, IaChat 23, Logistica 9, Mantenimiento 8, Mobile 20, OrdenCompra 1, Planilla 8, Recursoshumanos 9, Reportes 2, Seguridad 1, Viaticos 57). 149 SPs únicos con `CREATE [OR ALTER] PROCEDURE dbo.*` frente a ~183 referenciados según docs (conteo exacto PV). **0 DDL de tablas núcleo** (Planilla, OC, EmpleadoCj, Usuario, Seg*). Sin herramienta de migraciones (DbUp/Flyway/EF Migrations): ejecución manual; varios módulos marcados "no ejecutados en BD real" (Beneficio, Descanso, Logística).

## 9. Código duplicado, obsoleto o legacy

- FE [H]: `pagos_dev.tsx` (4 592 l., DevExtreme), `rptasistencia copy.tsx` (5 293 l., copia con espacio en el nombre), `vacaciones.tsx` (5 279, legacy), `conciliacion.tsx` (4 601, BCP), `oc.tsx` legacy, `m_importar.tsx` legacy; **pares v1/v2** (`pagos_v1`/`pagos_v2` 6 595/6 445; `oc_v1`/`oc_v2` 6 469/6 353; `pagartesoreria_v1/v2`) = duplicación casi total.
- BE [H]: `MantenimientoEmpleadosController` / `MantenimientoExternosController` (2 689 / 2 711 líneas, copias entre sí, SQL inline); `ContratosController` 2 060 líneas con SQL inline; `TesoreriaGastosController` con `static List<GastoDto>` (línea 203); `TestConnectionController` sin `[Authorize]`; EF Core sin uso.
- `features/cj-intelligence/**`: documentado como roto (`/ai/*` inexistente), DOCUMENTADO, no reverificado endpoint a endpoint.
- Artefactos locales en el árbol: `artifacts/`, `tmp/`, `Varios/`, `.codexbuild/`, `bin_check` (Api e Infrastructure), `TEMP_NO_USE.txt`; builds de depuración anidados en `CjERP.Api/bin/codex-build/...temp5/...` (rutas profundas rompen recorridos recursivos en Windows).

## 10. Archivos más grandes (líneas, `Measure-Object -Line`, excluye bin/obj/tests)

### 10.1 Top 15 .cs
| # | Líneas | Archivo (CjERP.Backend/...) |
|---|---|---|
| 1 | 5 584 | Infrastructure/Services/ConciliacionBcpService.cs |
| 2 | 2 711 | Api/Controllers/MantenimientoExternosController.cs |
| 3 | 2 689 | Api/Controllers/MantenimientoEmpleadosController.cs |
| 4 | 2 485 | Infrastructure/Services/Arrendamientos/ArrendamientosService.cs |
| 5 | 2 327 | Infrastructure/Services/ReportePdfService.cs |
| 6 | 2 060 | Api/Controllers/ContratosController.cs |
| 7 | 1 916 | Infrastructure/Services/OrdenCompraService.cs |
| 8 | 1 748 | Infrastructure/Services/AI/Orchestration/IaOrchestrator.cs |
| 9 | 1 706 | Infrastructure/Services/AsistenciaReporteService.cs |
| 10 | 1 390 | Infrastructure/Services/PlanillaBoletaService.cs |
| 11 | 1 358 | Infrastructure/Services/PlanillaConsultaService.cs |
| 12 | 1 207 | Infrastructure/Services/ReporteAutomaticoService.cs |
| 13 | 1 172 | Infrastructure/Repositories/ReporteRepository.cs |
| 14 | 1 128 | Infrastructure/Services/CompensacionService.cs |
| 15 | 979 | Infrastructure/Services/AI/Tools/Gastos/GastosAnalysisService.cs |

### 10.2 Top 15 .tsx
| # | Líneas | Archivo (cjerp-frontend/src/features/...) |
|---|---|---|
| 1 | 8 657 | reportes/rptasistencia.tsx |
| 2 | 6 676 | finanzas/conciliacion_v1.tsx |
| 3 | 6 595 | finanzas/tesoreria/pagos_v1.tsx |
| 4 | 6 469 | finanzas/facturacionfinanciera/oc_v1.tsx |
| 5 | 6 445 | finanzas/tesoreria/pagos_v2.tsx |
| 6 | 6 405 | finanzas/tesoreria/Historial.tsx |
| 7 | 6 353 | finanzas/facturacionfinanciera/oc_v2.tsx |
| 8 | 6 057 | reportes/rptasistenciaempleado.tsx |
| 9 | 5 775 | finanzas/tesoreria/gastosaprobar.tsx |
| 10 | 5 769 | finanzas/tesoreria/gastos.tsx |
| 11 | 5 293 | reportes/rptasistencia copy.tsx |
| 12 | 5 279 | recursoshumanos/vacaciones.tsx |
| 13 | 4 601 | finanzas/conciliacion.tsx |
| 14 | 4 592 | finanzas/tesoreria/pagos_dev.tsx |
| 15 | 4 569 | reportes/administrativo/iachat.tsx |

[R] 11 de los 15 .tsx superan 5 000 líneas: revisión humana inviable y alta probabilidad de regresión. El conteo `-Line` omite líneas vacías; el total real es algo mayor.

## 11. Módulos por estado

| Módulo | Estado | Evidencia |
|---|---|---|
| Seguridad (login, JWT, menú, perfiles, permisos de acción) | IMPLEMENTADO (con deudas críticas) | AuthController, Seg*Controller |
| Recibos/gastos, Pagos tesorería, Cheques | IMPLEMENTADO | PlanillaConsulta, PagoTesoreria, TesoreriaCheques |
| Orden de compra | IMPLEMENTADO | OrdenCompraController |
| Conciliación bancaria | IMPLEMENTADO | FinanzasConciliacionController |
| RRHH: Vacaciones, Compensación, Contratos, Boletas | IMPLEMENTADO | controllers respectivos |
| Beneficio, Descanso médico | PARCIAL | código presente; SP/menú "no ejecutados en BD real" (PV) |
| Logística equipos (ingreso) | PARCIAL | scripts 00-07 no ejecutados (PV); Recojo/Suministro implementados; Reembolso actualizar = 501 |
| Viáticos (Comercial) | PARCIAL | 3 controllers, 57 scripts, tests; "nada desplegado en JC_Db" (memoria del proyecto, PV) |
| Asistencia y reportes WUP/WhatsApp | IMPLEMENTADO | jobs + controllers |
| Reportes gerenciales / SQL Monitor | IMPLEMENTADO | - |
| IA Chat (backend) | IMPLEMENTADO | IaChatController, 249 tests |
| cj-intelligence (FE) | DOCUMENTADO como roto | sin `/ai/*` |
| Arrendamientos | IMPLEMENTADO | ArrendamientosService |
| Comunicaciones móviles (backend) | IMPLEMENTADO | 4 controllers; app cliente NO ENCONTRADA |
| Comercial (cliente, cobranzas, facturación), Planta (epps, principal), Compras (solicitudes, ordencompra), Dashboard, Inicio | PARCIAL / stubs | docs MODULES (no releídos completos) |
| CI/CD | NO ENCONTRADO | `.github/workflows` vacío |
| Dashboard Hangfire | NO ENCONTRADO | sin `UseHangfireDashboard` |
| Migraciones SQL automatizadas | NO ENCONTRADO | |
| Infraestructura como código | NO ENCONTRADO | |

## 12. Hallazgos de higiene de repositorio
- [H] `CjERP.Api/appsettings.json` está **rastreado en git** y contiene valores no vacíos en claves de tipo: cadena de conexión, clave JWT, contraseña SMTP, ClientSecret, otra contraseña, VerifyToken y AccessToken de WhatsApp. Solo se informa archivo y tipo. [Rec] rotar todo, mover a variables de entorno o secret store, purgar historial (TECHNICAL_DEBT C6 ya lo reconoce parcialmente).
- [H] `cjerp-frontend/.env`, `.env.example`, `.env.local-backend`, `.env.railway-backend` rastreados (claves de Google Maps).
- [H] 16 archivos de `CjERP.Backend/tmp/` y `CjERP.Api.csproj.user` rastreados.

## 13. Carpetas analizadas vs pendientes

**Analizadas:** raíz de `Cj-Erp-Web/`; `CjERP.Backend/` (.sln, 5 csproj + 3 de tests, Dockerfile, railpack.json, Program.cs, Controllers (listado y atributos de autorización), Jobs, Services de Api, Middleware, Health, Tests (listados y conteos), Database (conteo por módulo y SPs), Infrastructure/Persistence/Sql y DI, ActiveUserSessionService); `cjerp-frontend/` (package.json, vercel.json, vitest.config, estructura de src/api y src/features, conteos); `.github`; `docs/ARCHITECTURE.md` y títulos de `TECHNICAL_DEBT.md`.

**Pendientes / no analizadas a fondo:** contenido interno de cada Service de Infrastructure (92 archivos) y cada Controller; contenido de los scripts SQL; `docs/MODULES.md`, `API_MAP.md`, `DATABASE_MAP.md` (no leídos completos); `cjerp-frontend/src/components`, `hooks`, `utils`, `layouts` (solo estructura); `Varios/`, `tmp/`, `artifacts/`, `.codexbuild/` (artefactos locales); `CjERP.Api/Configuration` y `Filters`; versiones resueltas reales (`package-lock.json`, `project.assets.json`) y CVEs de paquetes (requieren `npm audit` / `dotnet list package --vulnerable`, fuera del alcance de solo lectura sin ejecución).
