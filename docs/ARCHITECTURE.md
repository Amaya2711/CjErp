# Arquitectura real — Cj ERP Web

> Documento derivado del código (análisis 2026-09-25, commit `c2f1825`). Si contradice al código, **manda el código**.
> "PV" = PENDIENTE DE VALIDACIÓN.

## 1. Vista general

```
 Navegador (React 19 + TS + Vite)                 Vercel (cj-erp.vercel.app)
   features/**/*.tsx  (páginas)                     vercel.json: /api/* → Railway
        │  usa
   src/api/*Service.ts  ─── httpClient.ts (axios, baseURL /api, JWT Bearer, desenvuelve {success,data})
        │ HTTPS JSON
        ▼
 ASP.NET Core 8 (CjERP.Api)                       Railway (cjerp-production.up.railway.app), Docker :8080
   Middleware: ExceptionHandler → ForwardedHeaders → HttpsRedirection → Compression
               → SlowRequestLogging → CORS → RateLimiter("api") → ResponseCaching → AuthN(JWT) → AuthZ
   Controllers/*Controller.cs   ([Authorize] a nivel de clase, sin roles/policies)
        │ (a veces SQL directo en el controller — ver §4)
        ▼
   CjERP.Infrastructure/Services/*Service.cs   (lógica + Dapper)
   CjERP.Infrastructure/Repositories/*.cs      (solo 3: AsistenciaSharePoint, PlanillaBoleta, Reporte)
        │ ISqlCommandFactory (Singleton) → SqlConnection + Dapper CommandDefinition
        ▼
   SQL Server  (Stored Procedures dbo.sp_* + SQL inline; misma BD aloja Hangfire)
        │
   Integraciones: Microsoft Graph/SharePoint · Meta WhatsApp Cloud API · WUP · OpenAI · Anthropic
                  SMTP (MailKit) · Expo Push · gestor legacy elnk.uno · Google Maps (FE)
   Background: Hangfire (jobs recurrentes) + HostedServices (SqlMonitorWorker, limpieza de sesiones)
```

## 2. Stack

| Capa | Tecnología (versión en manifiestos) |
|---|---|
| Frontend | React 19.2, TypeScript 5.9, Vite 8, react-router-dom 7, axios 1.13, Tailwind 4 (poco usado), lucide-react, recharts 3, xlsx 0.18.5, jspdf 3 + jspdf-autotable, **devextreme 26.1.4 (solo `pagos_dev.tsx`)** |
| Backend | .NET 8 (`net8.0`), ASP.NET Core, Dapper 2.1.72, Microsoft.Data.SqlClient 7, EF Core 8.0.11 (**registrado pero sin uso real**), Hangfire 1.8.14 (SqlServer storage), JwtBearer 8, Swashbuckle 6.6 (solo Development), QuestPDF 2024.12 (Community), MailKit 4.17, ClosedXML (conciliación) |
| Base de datos | SQL Server. La mayoría de SPs **no están versionados** en el repo (ver DATABASE_MAP) |
| Despliegue | BE: `CjERP.Backend/Dockerfile` (sdk:8.0 → aspnet:8.0, `ASPNETCORE_ENVIRONMENT=Production`, puerto 8080) + `railpack.json`. FE: Vercel (`cjerp-frontend/vercel.json`). **Sin CI** (`.github/workflows` vacío) |

## 3. Estructura del repositorio

> El repo git real es `Cj-Erp-Web/`. La carpeta padre `Cj_ERP_Web/` es otro repo git con un snapshot antiguo (aparece todo como "deleted"): **no trabajar allí**.

```
Cj-Erp-Web/
├─ CjERP.Backend/
│  ├─ CjERP.Backend.sln
│  ├─ CjERP.Api/              Web API: Program.cs, Controllers/ (54), Jobs/, Services/ (schedulers, SharePoint,
│  │                          SqlMonitorWorker), Middleware/, Health/, Configuration/, appsettings.json
│  ├─ CjERP.Application/      SOLO DTOs/ e Interfaces/ (Services, Repositories). Sin lógica
│  ├─ CjERP.Domain/           VACÍO (solo .csproj)
│  ├─ CjERP.Infrastructure/   Services/ (implementación + Dapper), Repositories/ (3), Persistence/Sql/SqlCommandFactory,
│  │                          Persistence/Context/CjERPDbContext (sin DbSets), DependencyInjection/
│  ├─ CjERP.Shared/           Configuration/* (JwtSettings, SqlSettings, SessionSettings, Smtp, OpenAi, Anthropic, PlanillaXml)
│  ├─ Database/               Scripts SQL por módulo (Arrendamientos, Finanzas, IaChat, Mantenimiento, Mobile,
│  │                          OrdenCompra, Planilla, Recursoshumanos, Reportes, Seguridad) — parciales
│  ├─ Docs/IAChat.md          Doc del chat IA
│  └─ Tests/PagoTesoreriaChecks  Consola de checks (no está en la .sln)
├─ cjerp-frontend/
│  ├─ src/api/                Servicios HTTP por dominio (*Service.ts) + httpClient.ts
│  ├─ src/app/router/         AppRouter.tsx (rutas estáticas lazy), PrivateRoute, AutoSecurityRoute
│  ├─ src/app/session/        SessionManager.tsx (idle timeout)
│  ├─ src/layouts/            MainLayout.tsx (sidebar desde menú dinámico)
│  ├─ src/components/base/    Componentes reutilizables (AppPage, AppCard, DataGridBase, SidePanelForm, CrudToolbar…)
│  ├─ src/components/lookups/ FiltroOperativoLookup
│  ├─ src/hooks/              useConstantesPorCampo, useCrudForm, useFiltroOperativoLookup
│  ├─ src/features/<modulo>/  Páginas por módulo
│  ├─ src/models/             Tipos TS por dominio
│  └─ src/utils/              authStorage, jwt, httpError, sharepoint, imageCompression, menuIcons…
└─ tmp/, artifacts/, Varios/  Artefactos locales (no son código fuente)
```

## 4. Backend — patrones reales

### 4.1 Cadena típica
`Controller` → `I<X>Service` (interfaz en Application) → `<X>Service` (Infrastructure) → `ISqlCommandFactory` + Dapper → `dbo.sp_*`.

```csharp
await using var cn = _sqlFactory.CreateConnection();
var rows = await cn.QueryAsync<T>(_sqlFactory.Create("dbo.sp_X", new { ... }, CommandType.StoredProcedure, ct));
```
- `ISqlCommandFactory` (`Persistence/Sql/SqlCommandFactory.cs`): `CreateConnection()`, `Create(sql, params, commandType, ct, timeout)`, timeout por defecto 60 s, pool/Encrypt desde `SqlSettings`.
- **Registro DI**: todo en `CjERP.Api/Program.cs` (líneas ~217-306) + `AddInfrastructure()`. Servicios Scoped; `ActiveUserSessionService` Singleton; HttpClients tipados para integraciones.

### 4.2 Desviaciones del patrón (existentes, no replicar)
| Desviación | Dónde |
|---|---|
| SQL/ADO directo en controllers | `MantenimientoEmpleadosController` (2940 l), `MantenimientoExternosController` (2961 l, copia del anterior), `ContratosController` (2298 l), `EmpleadoFichaController`, `PlanillaConsultaController` (elige nombres de SP), `TestConnectionController` |
| `new SqlConnection(GetConnectionString(...))` en vez de la factory | Seg*Service (5), AuditoriaCambiosService, AsistenciaReporteService, CompensacionService, EmpleadoCtaService, SqlServerHealthCheck + los controllers de arriba |
| Servicio concreto inyectado sin interfaz | `PagoTesoreriaService` |
| Lógica de negocio en capa Api | `Api/Services/*` (SharePointCommercialUploadService, schedulers, AsistenciaSharePointService) |
| Estado estático en memoria | `TesoreriaGastosController` (`static List<GastoDto>`) |
| Descubrimiento de parámetros vía `sys.parameters` / columnas vía `sys.columns` en runtime | PlanillaService, PlanillaConsultaService, CompensacionService, ConciliacionBcpService, EmpleadoFichaController, MantenimientoEmpleados/Externos, AsistenciaValidarCampoService |

### 4.3 Convención de respuesta
- Mayoría: `Ok(new { success = true, message, data })`; error: `BadRequest(new { success = false, message })`.
- Seguridad/Lookup/IaChat/PagoTesoreria devuelven **datos crudos** (sin envelope).
- Excepciones no capturadas → handler global (Program.cs) → 500 `{ success:false, message, detail (solo Dev) }`. Varios controllers devuelven `ex.Message`/`ex.ToString()` (deuda).
- El **frontend tolera ambos**: `httpClient.ts` devuelve `data.data` si existe, rechaza si `success===false`, redirige a `/` en 401.

### 4.4 Transversal
- **Auth**: JWT HS256, 30 min, claims `IdUsuario, NombreEmpleado, Correo, CodEmp, IdEmpleadoCj, IdCargo, CodVal, Cuadrilla, IdPerfil, IdRol, SessionId`. Sesión validada contra store **en memoria** (`ActiveUserSessionService`, idle 30 min). Ver `AGENTS.md` §Seguridad y `docs/TECHNICAL_DEBT.md`.
- **Rate limit**: ventana fija global "api" 120 req/60 s (no particionada por usuario). Login y `ReportesWhatsappController` con `[DisableRateLimiting]`.
- **Health**: `/health` (SELECT 1), `GET /api/TestConnection` (anónimo).
- **Logging**: ILogger estándar; `SlowRequestLoggingMiddleware` (umbral `SqlSettings:SlowRequestThresholdMs`=1500) añade `Server-Timing`.
- **Auditoría**: `IAuditoriaCambiosService.RegistrarAsync/RegistrarLoteAsync` → `sp_AuditoriaCambios_Registrar` → `dbo.AuditoriaCambios`. **Reutilizar** para nuevas auditorías (corre fuera de la transacción de negocio).
- **Hangfire**: storage SQL, sin dashboard. Recurrentes: reportes WhatsApp (Operativo/Gerencial, reprogramables desde BD), `asistencia-sharepoint-diario`, `mobile-push-dispatch` (*/5 min). Ver INTEGRATIONS.md.
- **HostedServices**: `SqlMonitorWorker` (capturas 30 s/1 min/5 min, limpieza diaria), `ActiveUserSessionCleanupHostedService` (10 min).

## 5. Frontend — patrones reales

- **Routing**: `src/app/router/AppRouter.tsx` — ~120 rutas estáticas `lazy()` bajo `<PrivateRoute>` (solo verifica token) + `<MainLayout>`. Fallback `*` → `DynamicMenuRoutePage` (placeholder). **No hay guard por menú/permiso.** Para agregar una página: crear en `features/<modulo>/`, registrar ruta en AppRouter y el ítem en `SegMenu` (BD) con la misma ruta.
- **Menú**: `MainLayout` → `features/dashboard/services/dashboardMenuService` → `features/seguridad/services/menuService.obtenerMenuDinamicoPorUsuario` → `GET /api/menu/dinamico` (cache memoria + `sessionStorage`). `app/menu/menuData.ts`/`menuDashboard.ts` son **código muerto**.
- **HTTP**: siempre vía `src/api/httpClient.ts` (default export con `get/post/put/delete<T>`). Base: DEV `http://127.0.0.1:5015/api` fijo; PROD `VITE_API_BASE_URL` o `https://cjerp-production.up.railway.app/api`. Timeout 30 s (sobreescribible por request).
- **Errores**: `utils/httpError.ts#getHttpErrorMessage(error, fallback)` (estándar, ~49 usos).
- **Sesión**: `utils/authStorage.ts` (`localStorage["authUser"]`), `SessionManager` (idle `VITE_IDLE_TIMEOUT_MINUTES`=30, sincroniza pestañas), `features/auth/services/logoutSession.ts`.
- **Estado**: sin store global (no Redux/Zustand). `useState/useMemo` locales + contexto `PageTitleContext` (MainLayout). Hooks compartidos en `src/hooks`.
- **Estilos**: predominan estilos inline (`const styles: Record<string, CSSProperties>`), CSS plano por página en tesorería, Tailwind 4 en ~11 archivos.
- **Grillas**: `components/base/DataGridBase` (propio) o tablas HTML propias. DevExtreme **solo** en `pagos_dev.tsx`.
- **Exportación**: Excel con `xlsx` (a menudo `import("xlsx")` dinámico); PDF cliente con `jspdf` + `jspdf-autotable` (dinámico). Gráficos con `recharts`.
- **Páginas muy grandes** (monolíticas, 4 000–9 000 líneas): ver TECHNICAL_DEBT.md.

### 5.1 Catálogo de reutilizables (usar antes de crear)
| Elemento | Uso |
|---|---|
| `components/base/AppPage` | Wrapper de página con título/acciones |
| `AppCard`, `AppSectionHeader`, `AppToolbar`, `ToolbarFiltro`, `AppStatusMessage` | Layout y mensajes |
| `DataGridBase` | Tabla con sort, acciones por fila, loading |
| `StoredProcedureGrid` | Grid genérico sobre filas de SP |
| `SidePanelForm` | Drawer lateral de formulario |
| `CrudToolbar` (+ `matchesCrudToolbarSearch`) | Buscador + botones CRUD |
| `ConfirmDialog` | Confirmación modal |
| `InputBase`, `SelectBase` | Inputs con label/error |
| `PlaceholderPage` | Página "en construcción" |
| `components/lookups/FiltroOperativoLookup` + `hooks/useFiltroOperativoLookup` | Filtro operativo encadenado (filtro → tipo trabajo → OT → tarea) |
| `hooks/useConstantesPorCampo(campos)` | Combos desde tabla `Constante` (`/lookup/constantes`) |
| `hooks/useCrudForm` | Estado CRUD genérico con panel |
| `utils/sharepoint.ts#buildSharePointUrl`, `utils/imageCompression.ts#compressImageForUpload` | Archivos |
| `features/finanzas/tesoreria/components/DatosOcDrawer` / `DatosOcFloatingCard` | Detalle de OC |

## 6. Entornos y configuración
- `appsettings.json` (versionado) + `appsettings.Development.json` (ignorado) + variables de entorno (Railway). `ConnectionStrings:DefaultConnection` obligatoria (Program.cs falla al iniciar si falta).
- Secciones: `JwtSettings`, `SessionSettings`, `SqlSettings`, `SmtpSettings`, `SharePoint`, `MobilePush`, `MobileAppVersion`, `MobileMonitor`, `PlanillaXml`, `WupSettings`, `WhatsappInboundSettings`, `MetaWhatsAppSettings`, `ReporteWhatsAppJobDefaults`, `OpenAI`, `Anthropic`, `Cors:AllowedOrigins`.
- Env overrides explícitos: `OPENAI_API_KEY`, `OPENAI_MODEL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_MAX_TOKENS`.
- FE: `.env` (versionado, contiene key de Google Maps), `.env.local-backend`, `.env.railway-backend`, `.env.example`. En DEV el httpClient ignora `VITE_API_BASE_URL`.
- Arranque local: BE `dotnet run` en `CjERP.Api` (http://localhost:5015, Swagger en Development); FE `npm run dev` (Vite proxy `/api` → 127.0.0.1:5015).
