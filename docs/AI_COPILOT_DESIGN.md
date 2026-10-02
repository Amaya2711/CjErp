# CJ ERP AI / Copilot — Diseño de arquitectura consolidado

> **Documento de diseño, no implementado.** Ningún componente descrito aquí existe todavía en el código salvo lo explícitamente marcado "vivo hoy". No crea tablas, SPs, endpoints ni modifica `IaChatService`/frontend. Fuente: análisis de solo lectura del código real (2026-09-28/29) + verificación directa del SP `sp_IA_Planilla_Buscar` en BD (2026-09-29). Complementa `AGENTS.md` y el resto de `docs/*.md`; no los reemplaza.
> Convención: "PV" = pendiente de validación. Decisiones ya tomadas con el usuario están marcadas **[DECIDIDO]**.

---

## 1. Resumen ejecutivo

- **Nivel de avance real: ~25-30%.** Existe un flujo completo de extremo a extremo (pregunta → planner OpenAI → ejecución de 1 SP → respuesta con texto/tabla/gráfico → export PDF/Excel → auditoría) para **un solo módulo (GASTOS)**. Es un cimiento sólido, no un prototipo descartable — los prompts y el patrón de ejecución del SP ya están maduros y no deben reescribirse desde cero.
- **Lo que falta es justo lo que más importa**: autorización real en backend (hoy 0% — confirmado por `grep "[Authorize(Roles" = 0` en todo el repo), memoria conversacional persistente y aislada por usuario, generalización de "1 tool" a un registro de N tools, auditoría con tokens/costo/feedback, y frontend multi-módulo/multi-conversación.
- **Verificación directa del único SP ya conectado a IA (`sp_IA_Planilla_Buscar`, 2026-09-29): CONFIRMADO SEGURO.** El `SELECT` final (43 columnas) no incluye `Cuenta`, `CuentaInter`, `NombreCta`, `IdBanco`, `NroDocumento`, `Telefono`, `Correo` ni `Sexo`. Solo expone datos de negocio (montos, cliente/proyecto/site, nombres de responsable/solicitante, y reconciliación OC-vs-Gasto ya calculada por fila: `SubOc`, `SubPlanilla`, `DiferenciaFic`, `PorcentajeFic`).
- **Bloqueante crítico independiente de la IA**: `SegPermisoAccion`/`SegRolMenuPermiso` son 100% frontend-only (0 consumidores backend confirmados por grep). Ningún nuevo tool de IA puede autorizarse sobre una base que no autoriza nada hoy — es Fase 0.
- **Secretos reales versionados en `appsettings.Development.json`** (historial git, commits `17dcea5`/`b5e8bc8`/`5b44519`): API key real de OpenAI, password SQL Server, `SharePoint.ClientSecret`, `WupSettings.Password`, `WhatsappInboundSettings.VerifyToken`, y una API key de Anthropic comentada. Rotar es prerequisito de Fase 0. **Pendiente de ejecutar** (requiere acceso a consolas externas que no tengo).

---

## 2. Mapa del IA Chat actual (arquitectura real, verificada línea por línea)

```
React (iachat.tsx, 4645 líneas)
  │  POST /ia-chat/consultar { module:"GASTOS", question, conversationId, presentationMode, attachment }
  ▼
IaChatController.cs (67 líneas) — [Authorize] JWT, extrae idUsuario de claims
  ▼
IaChatService.cs (5716 líneas) — ConsultarAsync (líneas 75-748)
  ├─ AllowedModules={"GASTOS"} + ContainsProhibitedSqlIntent (filtro anti-inyección, 9 palabras, bypasable con "_")
  ├─ GetConversationState(conversationId) → ConcurrentDictionary ESTÁTICO (línea 52), sin TTL, sin dueño
  ├─ Cascada de atajos conversacionales (reformatear gráfico, reusar último resultado, refinar filtros)
  ├─ Planner OpenAI (GetOpenAiPlannerDecisionAsync, 3034-3097)
  │    → POST api.openai.com/v1/chat/completions (response_format=json_object, temperature=0)
  │    → JSON {route:"buscar_planilla"|"conversation", responseType, answer, buscarArgs}
  ├─ Si route=buscar_planilla:
  │    BuscarPlanillaArgs → dbo.sp_IA_Planilla_Buscar (17 params Dapper, paginación real @Pagina/@TamanoPagina)
  │    → agregación local (hasta 4000 filas) → BuildOpenAiAnalysisPayload → OpenAI de nuevo (respuesta final)
  ├─ RegistrarAuditoriaAsync → dbo.sp_IaChatAuditoria_Insertar (10 puntos de invocación)
  ▼
IaChatResponseDto { success, answer, responseType, chart, detailRows, summary, totalRows }
  ▼
React: StructuredResponseBlock (KPIs, DetailTable, ExecutiveChartBlock con Recharts)
  │ (opcional) POST /ia-chat/exportar-dashboard → Anthropic (prompt exige HTML+Chart.js)
  ▼
iframe sandbox="allow-scripts allow-same-origin" → html2canvas → PDF
```

**Confirmado explícitamente por `Docs/IAChat.md:13`**: *"La integracion con IA generativa anterior quedo como referencia de rollback dentro del codigo."* — las ~126 líneas de tool-use de Anthropic nunca invocadas y los bloques `if(false && ...)` (líneas 413, 484) son código muerto dejado a propósito.

### Detalle verificado del SP `sp_IA_Planilla_Buscar` (verificación 2026-09-29)
- Diseño de paginación correcto: filtra candidatos por texto/fecha/estado (`#Candidatos`) → pagina con `ROW_NUMBER()` (`#Pagina`) → **recién después** ejecuta los `OUTER APPLY` costosos (reconciliación OC-vs-Planilla), solo sobre la página actual. No trae el universo completo antes de paginar.
- Parámetros `Cliente`/`Proyecto`/`Responsable`/`Solicitante` son `NVARCHAR` con `LIKE` (texto libre), **no** hay parámetros `INT` para IDs de esas entidades — los campos `IdSolicitante/IdValidador/IdCliente/IdProyecto` (`int?`) que sí existen en la clase C# `BuscarPlanillaArgs` (`IaChatService.cs:5568-5574`) son **vestigiales**, no un bug de sincronización: el SP nunca se diseñó para recibirlos. Limpiar en el refactor de Fase 1.
- Manejo de errores: `THROW 50001/50002/50003` incluye `ERROR_MESSAGE()`/`ERROR_NUMBER()`/`ERROR_LINE()` — coincide con el riesgo ya documentado de que `BuildFriendlyErrorMessage` expone esto crudo solo en `ASPNETCORE_ENVIRONMENT=Development` (mapea a genérico en producción).
- **Hallazgo para el roadmap**: este SP ya calcula reconciliación OC-vs-Gasto por fila (`SubOc`, `SubPlanilla`, `DiferenciaFic`, `PorcentajeFic`, `CodigoValidacionFic`). Antes de construir el tool de Fase 2 `analizar_oc_vs_planilla` (sobre `sp_OrdenCompra_Consulta_Estados`), verificar si `buscar_gastos_planilla` ya responde una parte relevante de esas preguntas — evitar duplicar lógica (regla 2 de AGENTS.md).

---

## 3. Componentes reutilizables (no reescribir)

| Componente | Ubicación | Estado | Reutilizable como |
|---|---|---|---|
| `SendOpenAiChatCompletionAsync` | `IaChatService.cs:3192-3230` | Vivo | `Providers/OpenAiProvider` (agregar reintentos + capturar `usage`) |
| `SendMessageAsync` (Anthropic) | `IaChatService.cs:901-940` | Vivo | `Providers/AnthropicProvider` (quitar parámetro `includeTools`, capturar `usage`) |
| `sp_IA_Planilla_Buscar` + ejecución | `IaChatService.cs:942-1060` | Vivo, **verificado seguro** | Primer tool registrado tal cual (sección 5.2) |
| `BuildOpenAiAnalysisPayload` + breakdowns/top-records | `IaChatService.cs:1404-1963` | Vivo | Generalizar a `ResultAnalyzer` no atado a Planilla |
| `IaChatChartResponseDto` | `DTOs/IaChat/IaChatChartResponseDto.cs:3-14` | Vivo, en producción | Contrato canónico de gráfico — más seguro que el del prototipo `cj-intelligence` (el LLM nunca decide layout) |
| `RegistrarAuditoriaAsync` + `IaChatAuditoria` | `IaChatService.cs:2976-3014`, `Database/IaChat/01_IaChatAuditoria.sql` | Vivo | Base de `IaAuditService` ampliado |
| `iachat.tsx`: `MessageBubble`, `ExecutiveChartBlock`, `DetailTable`, export Excel/PDF | `iachat.tsx:2252-2901` | Vivo | UI base, generalizar a multi-módulo |
| `AiConversationSidebar.tsx`, `KnowledgePage.tsx` | `cj-intelligence/**` | Prototipo sin backend | Diseño de referencia para sidebar de conversaciones y gobernanza de conocimiento |

## 4. Componentes a refactorizar

`IaChatService.cs` (5716 líneas) se separa por responsabilidad, no se reescribe:

| Extraer a | Rango actual |
|---|---|
| `Orchestration/IaOrchestrator` | 100-760 (routing conversacional) |
| `Providers/OpenAiProvider`, `Providers/AnthropicProvider` | 901-940, 3192-3230 |
| `Tools/Gastos/BuscarGastosPlanillaTool` | 942-1060 |
| `Conversation/IaConversationService` | 2895-2974, 52 |
| `Audit/IaAuditService` | 2976-3014 |
| `Orchestration/QueryPlanner` | 3034-3097 |
| `Orchestration/ResponseGenerator` | 3099-3190, 5032-5104 |
| **Eliminar** (código muerto confirmado) | 413, 484 (`if(false&&...)`), 3542-3630, 3780-3799, 5513-5556 (~126 líneas tool-use Anthropic) |

---

## 5. Componentes nuevos — diseño detallado

### 5.1 `IaAuthorizationService`

**Por qué es 100% nuevo**: no existe en todo el backend ningún endpoint donde el filtro de alcance de datos (`IdEmpleado`/`IdResponsable`/`IdCargo`) se tome exclusivamente del JWT sin que el body pueda sobreescribirlo. Antipatrón confirmado a **no repetir**: `CompensacionController.ResolveEmpleadoAccion` (líneas 189-208) prioriza `request.IdEmpleadoAccion` del body sobre el claim JWT.

```csharp
public interface IIaAuthorizationService
{
    IaSecurityContext BuildContext(ClaimsPrincipal user);         // una vez por request, solo del JWT
    IaAuthorizationResult Authorize(IaSecurityContext ctx, string toolName, string module);
    IaDataScope ResolveScope(IaSecurityContext ctx, string toolName);  // filtro obligatorio, no-overrideable
}

public sealed record IaSecurityContext(string IdUsuario, int? IdEmpleadoCj, int? IdCargo, int? IdPerfil, int? IdRol);
public enum IaScopeLevel { Propio, Equipo, AreaOSite, Total }
public sealed record IaDataScope(IaScopeLevel Level, IReadOnlyDictionary<string,object?> ParametrosForzados);
public sealed record IaAuthorizationResult(bool Permitido, string? MotivoRechazo);
```

**Regla de oro**: `scope.ParametrosForzados` siempre pisa lo que el LLM propuso, nunca al revés:
```csharp
// MAL (patrón existente hoy, a no replicar): var idEmpleado = args.IdEmpleado ?? context.IdEmpleadoCj;
// BIEN: args.IdEmpleado = scope.ParametrosForzados["IdEmpleado"];  // pisa siempre
```

**Tabla nueva** (no reusar `SegPermisoAccion` tal cual — es frontend-only y su modelo es por ruta/pestaña, no por función server-side; reusar su *forma*, no su enforcement):
```sql
-- PROPUESTA, no crear todavía
CREATE TABLE dbo.IaToolPermiso (
    IdToolPermiso INT IDENTITY PRIMARY KEY,
    ToolName      VARCHAR(100) NOT NULL,
    IdRol         INT NULL,
    IdPerfil      INT NULL,
    ScopeLevel    VARCHAR(20) NOT NULL,   -- 'Propio'|'Equipo'|'AreaOSite'|'Total'
    EsActivo      BIT NOT NULL DEFAULT 1
);
```
**Fail-closed por diseño**: si un tool no tiene fila para el rol/perfil del usuario → denegado (al revés del resto del ERP hoy, que es fail-open).

### 5.2 `IaToolRegistry`

```csharp
public interface IIaTool
{
    string Name { get; }
    string Module { get; }
    string DescriptionForLlm { get; }
    JsonSchema ArgsSchema { get; }
    IReadOnlySet<string> ColumnasProhibidas { get; }   // ej. {"Cuenta","CuentaInter","NombreCta"}
    int MaxFilasPorDefecto { get; }
    Task<IaToolRawResult> ExecuteAsync(Dictionary<string,object?> args, CancellationToken ct);
}

public interface IIaToolRegistry
{
    IReadOnlyList<IIaTool> GetToolsForModule(string module);
    Task<IaToolResult> ExecuteAsync(string toolName, Dictionary<string,object?> argsDelLlm, IaDataScope scope, CancellationToken ct);
}
```

**Flujo único de ejecución** (centraliza lo que hoy está disperso y es inconsistente):
```csharp
public async Task<IaToolResult> ExecuteAsync(string toolName, Dictionary<string,object?> argsDelLlm, IaDataScope scope, CancellationToken ct)
{
    var tool = _tools.SingleOrDefault(t => t.Name == toolName) ?? throw new IaToolNotRegisteredException(toolName); // fail-closed

    var argsFinales = new Dictionary<string,object?>(argsDelLlm);
    foreach (var (campo, valor) in scope.ParametrosForzados) argsFinales[campo] = valor;   // scope siempre gana

    IaToolRawResult raw;
    try { raw = await tool.ExecuteAsync(argsFinales, ct); }
    catch (Exception ex) { await _audit.RegistrarErrorAsync(toolName, argsFinales, ex, ct); throw new IaToolExecutionException(toolName, ex); }

    // Proyección de columnas prohibidas — SIEMPRE, sin depender de que cada tool "se acuerde"
    var rowsSeguras = raw.Rows.Select(row => row.Where(kv => !tool.ColumnasProhibidas.Contains(kv.Key))
                                               .ToDictionary(kv => kv.Key, kv => kv.Value)).ToList();
    if (rowsSeguras.Count > tool.MaxFilasPorDefecto) rowsSeguras = rowsSeguras.Take(tool.MaxFilasPorDefecto).ToList();

    await _audit.RegistrarExitoAsync(toolName, argsFinales, raw.StoredProcedureName, rowsSeguras.Count, ct);
    return new IaToolResult(rowsSeguras, raw.TotalRows, tool.Module);
}
```

**Por qué importa la proyección centralizada**: si mañana se conecta `sp_Planilla_Consulta_Estados` (que sí trae `Cuenta`/`CuentaInter`, confirmado en `Database/Planilla/01_sp_Planilla_Consulta_Estados.sql:147-148`) como un tool nuevo sin pasar por este registry, esas columnas llegarían al LLM. Con este diseño es estructuralmente imposible que un tool nuevo lo olvide — `ColumnasProhibidas` es obligatorio en la interfaz, no opcional.

**Primer tool = envoltura de lo que ya existe, cero reescritura del SP**:
```csharp
public sealed class BuscarGastosPlanillaTool : IIaTool
{
    public string Name => "buscar_gastos_planilla";
    public string Module => "GASTOS";
    public IReadOnlySet<string> ColumnasProhibidas => new HashSet<string>();  // confirmado limpio, sección 2
    public int MaxFilasPorDefecto => 20000;  // = MaxPageSize actual (IaChatService.cs:26)
    // ExecuteAsync: exactamente la misma llamada a dbo.sp_IA_Planilla_Buscar de hoy, solo movida de lugar
}
```

**Catálogo dinámico para el planner** (generaliza el prompt hardcodeado actual):
```csharp
var toolsDisponibles = _registry.GetToolsForModule(context.ModuloActivo);  // ya filtrado por IaAuthorizationService
// se inyecta {Name, DescriptionForLlm, ArgsSchema} en el prompt de sistema del planner
```
Agregar un tool nuevo en Fase 2/3/4 no requiere tocar el prompt a mano.

### 5.3 `IaConversationService`

**El problema exacto**: `Conversations.GetOrAdd(conversationId, ...)` (`IaChatService.cs:2163`) — sin TTL, sin dueño. Cualquiera que reenvíe un `conversationId` ajeno hereda `LastResponse`/historial de otro usuario.

**[DECIDIDO] Opción B**: el backend genera y es autoridad del `conversationId` (no el frontend). Justificación: ya se va a tocar el frontend en la Fase 1 de generalización multi-módulo; aprovechar ese mismo cambio para dar de baja el patrón `sessionStorage` por un sidebar persistente real, en vez de hacerlo dos veces.

**Contrato HTTP nuevo**:
```
POST /api/ia-chat/conversaciones   {modulo}       → crea con IdUsuario=claim JWT, devuelve {idConversacion}
GET  /api/ia-chat/conversaciones?modulo=&top=     → alimenta AiConversationSidebar.tsx (ya existe como prototipo)
GET  /api/ia-chat/conversaciones/{id}/mensajes    → reabrir un hilo (hoy no existe: se pierde al limpiar sessionStorage)
POST /api/ia-chat/consultar {conversationId, ...} → conversationId SIEMPRE viene del POST /conversaciones anterior
```

```csharp
public interface IIaConversationService
{
    Task<IaConversationState> ObtenerOCrearAsync(string? conversationId, string idUsuario, string modulo, CancellationToken ct);
    Task GuardarTurnoAsync(string conversationId, string rol, string texto, string? tool,
        Dictionary<string,object?>? parametros, long? idAuditoriaResultado, CancellationToken ct);
    Task<IReadOnlyList<IaConversacionResumenDto>> ListarRecientesAsync(string idUsuario, int top, CancellationToken ct);
}
```

**Validación de propiedad (defensa en profundidad, se mantiene aunque el ID ya nazca en backend)**:
```csharp
public async Task<IaConversationState> ObtenerOCrearAsync(string? conversationId, string idUsuario, string modulo, CancellationToken ct)
{
    if (string.IsNullOrWhiteSpace(conversationId)) return IaConversationState.Efimera(idUsuario);

    if (_cache.TryGetValue(conversationId, out IaConversationState? cacheada))
    {
        if (cacheada!.IdUsuarioPropietario != idUsuario) throw new IaConversationForbiddenException(conversationId); // nunca se "presta"
        return cacheada;
    }
    var fila = await _repo.ObtenerPorIdAsync(conversationId, ct)
        ?? await _repo.CrearAsync(conversationId, idUsuario, modulo, ct);
    if (fila.IdUsuario != idUsuario) throw new IaConversationForbiddenException(conversationId);

    var estado = await CargarEstadoCompletoAsync(fila, ct);
    _cache.Set(conversationId, estado, new MemoryCacheEntryOptions { SlidingExpiration = TimeSpan.FromMinutes(30) }); // TTL real
    return estado;
}
```
`IaConversationForbiddenException` se trata como conversación nueva efímera (nunca revelar al usuario que el ID pertenecía a otra persona — evita enumeración).

**Esquema persistido**:
```sql
-- PROPUESTA, no crear todavía
IaConversacion (IdConversacion PK, IdUsuario NOT NULL /*fijo en creación, nunca reasignado*/,
                Modulo, Titulo, FechaCreacion, FechaUltimoMensaje, Estado)
IaMensaje (IdMensaje PK, IdConversacion FK, Rol, Contenido, Tool, ParametrosJson,
           IdIaChatAuditoria FK NULL  /* referencia al resultado completo, NO duplicar el payload */,
           FechaCreacion, TokensEntrada, TokensSalida, Modelo, DuracionMs)
```

### 5.4 Flujo integrado (los 3 componentes juntos)

```
IaOrchestrator.ConsultarAsync(pregunta, jwt)
  1. context = _authService.BuildContext(jwt)
  2. estadoConv = _conversationService.ObtenerOCrearAsync(conversationId, context.IdUsuario, modulo)
  3. tools = _registry.GetToolsForModule(modulo)                     ← ya filtrado por permiso de módulo
  4. decision = _planner.Decidir(pregunta, tools, estadoConv.UltimosTurnos)
  5. auth = _authService.Authorize(context, decision.Tool, modulo)
       si no permitido → responder rechazo amable, auditar, fin
  6. scope = _authService.ResolveScope(context, decision.Tool)
  7. resultado = await _registry.ExecuteAsync(decision.Tool, decision.Args, scope, ct)
  8. respuesta = _responseGenerator.Generar(pregunta, resultado)
  9. _conversationService.GuardarTurnoAsync(...)
```

---

## 6. Inventario de Tools (curado)

```
FASE 1 (ya existe, verificado seguro):
  buscar_gastos_planilla        → sp_IA_Planilla_Buscar               [REUTILIZAR TAL CUAL]

FASE 2 — Orden de Compra:
  consultar_oc_cabecera         → sp_OrdenCompra_BuscarCabecera       [REUTILIZAR TAL CUAL]
  consultar_consumo_oc          → GET /oc/consumo (SQL agregado, 1 fila) [REUTILIZAR TAL CUAL — mejor candidato del inventario]
  consultar_oc_detalle          → sp_OrdenCompra_BuscarDetalle        [WRAPPER: excluir Cuenta/CuentaInter/NombreCta/Banco]
  analizar_oc_vs_planilla       → sp_OrdenCompra_Consulta_Estados     [WRAPPER: forzar filtro Año/Cliente/fecha; revisar
                                                                        solapamiento con buscar_gastos_planilla, sección 2]

FASE 3 — Asistencia (solo agregado):
  consultar_reporte_asistencia  → RptAsistenciaFechas                 [WRAPPER: excluir Sexo, capar rango, restringir por rol]
  consultar_sites_cliente       → sp_Site_Listar                      [REUTILIZAR TAL CUAL]
  ❌ NUNCA: sp_AsistenciaTracking_Consulta, sp_Asistencia_UltimoMovimientoEmpleado,
            sp_Asistencia_ValidarCampo (GPS + foto + dato disciplinario, sin restricción de rol)

FASE 4 — Tesorería (solo agregado):
  consultar_resumen_pagos_periodo → sp_Planilla_ReporteResumen        [AMPLIAR — confirmar en BD si ya agrega]
  ❌ NUNCA sin wrapper: sp_Planilla_ConsultaIni, GET /tesoreria/pagos (confirmado: expone Cuenta/CuentaInter/NombreCta)

FASE 3-4 — RRHH (individual, filtro SIEMPRE forzado por IaAuthorizationService):
  consultar_mis_vacaciones        → sp_EmpleadoOtros_ListarVacaciones  [AMPLIAR: forzar IdEmpleado=JWT]
  consultar_mi_saldo_compensacion → sp_EmpleadoCompensacion_Consultar  [AMPLIAR: forzar IdEmpleadoCj=JWT]
  ❌ NUNCA: ContratosController.ListarResumen (DNI+correo+tel de TODOS), sp_EmpleadoCj_Ficha (proxy dinámico,
            ficha completa, riesgo de fuga automática de columnas nuevas)

NUNCA EXPONER A NINGÚN TOOL (transversal):
  sp_Empleado_Cta_Listar, PagoTesoreriaService.CuentasAsync, sp_ChequeEmpleado_*,
  sp_ValidarUsuario (login — riesgo de fuerza bruta de credenciales vía IA, no de fuga de columna),
  sp_SegRol_*/sp_SegPerfil_*/sp_UsuarioListar/SP_GenerarUsuario (Seguridad)
```

---

## 7. Matriz de seguridad por módulo

| Módulo | Permiso hoy (real) | Riesgo si se expone sin wrapper | Restricción obligatoria |
|---|---|---|---|
| Gastos | `[Authorize]` solo | Ninguno confirmado (sección 2) | Ninguna adicional urgente |
| Orden de Compra | `[Authorize]` solo | `Cuenta/CuentaInter` en `sp_OrdenCompra_BuscarDetalle` | Proyectar columnas (ya lo hace `IaToolRegistry`) |
| Asistencia (agregado) | `[Authorize]` solo, sin rol | `Sexo`, PII de contacto, toda la plantilla sin restricción | Excluir `Sexo`; rol gerencial para "todo el equipo" |
| Asistencia (GPS/foto individual) | `[Authorize]` solo | GPS preciso + fotos de todos, sin parámetros | **Excluir por completo** |
| RRHH (vacaciones/compensación) | `[Authorize]` solo, sin filtro propio | Sin DNI/sueldo en estos 2 SPs específicos | Forzar `IdEmpleado`=JWT vía `IaAuthorizationService` |
| RRHH (ficha/contratos resumen) | `[Authorize]` solo | DNI+correo+tel de TODOS | **Excluir por completo** |
| Tesorería/Pagos | `PagoTesoreriaController.PuedeAsync()` (único control de menú real en todo el backend) | Cuenta bancaria + CCI + titular + montos | Solo SPs agregados, nunca listado crudo |
| Seguridad | `[Authorize]` solo | Gestión de usuarios/roles | **Excluir por completo del alcance de IA** |

---

## 8. Auditoría — ampliación de `IaChatAuditoria`

| Campo | ¿Existe hoy? |
|---|---|
| IdUsuario, Modulo, Pregunta, Herramienta, ParametrosJson, DuracionMs, CantidadRegistros, FueExitoso, MensajeError, FechaCreacion | **Sí** (tabla actual) |
| IdConversacion | No — agregar FK a `IaConversacion` |
| RoutingMode (intención detectada) | No — hoy vive solo en memoria (`interpretedFilters["routingMode"]`) |
| StoredProcedure (nombre explícito) | No — inferible hoy solo por `Herramienta`, frágil si crecen los tools |
| Modelo, Proveedor ('openai'\|'anthropic') | No |
| TokensEntrada, TokensSalida, CostoEstimado | No — ninguna llamada hoy captura `usage` de ninguna API |
| TuvoAdjunto | No |

## 9. RAG, feedback, streaming, costos (resumen — detalle en el informe original de la sesión)

- **RAG**: solo para preguntas conceptuales (`docs/*.md` + `AGENTS.md`, ya troceados por sección). Nunca vectorizar datos transaccionales. Separar `KNOWLEDGE` (RAG) / `DATA` (Tool) / `MIXED` (ambos).
- **Embeddings**: SQL Server (columna serializada), sin vector DB dedicado — volumen esperado bajo (documentación + ejemplos, no millones de filas).
- **Semantic Kernel**: no introducir en Fases 0-3; el orchestrator propio ya resuelve function calling sin la curva de aprendizaje de SK.
- **Streaming**: SSE (no SignalR — el stack no tiene backplane Redis; SignalR lo requeriría para escalar horizontalmente).
- **Feedback**: `IaConsultaFeedback` (FK a `IaChatAuditoria`) + `IaQueryExample` con embedding para few-shot dinámico, sin reentrenar modelo.
- **Costos**: capturar `usage` de OpenAI/Anthropic (hoy ausente en ambos DTOs de respuesta), tabla de precios por modelo en configuración.

## 10. Roadmap

| Fase | Objetivo | Componentes | Depende de | Estado |
|---|---|---|---|---|
| 0 | Seguridad base | Rotar secretos filtrados; ✅ verificar `sp_IA_Planilla_Buscar` (hecho, seguro) | — | **Parcial — falta rotar secretos** |
| 1 | Refactor | `IaOrchestrator/Providers/Tools/Audit`; eliminar código muerto; `IaAuthorizationService`, `IaToolRegistry`, `IaConversationService` (diseñados en este documento) | Fase 0 | Diseño completo, no implementado |
| 2 | Orden de Compra | 4 tools (sección 6) | Fase 1 | Pendiente |
| 3 | Asistencia (agregado) + RRHH individual | Tools con RLS forzado | Fase 1 | Pendiente |
| 4 | Tesorería (agregado) | Wrapper de resumen sin cuentas bancarias | Fase 1 | Pendiente |
| 5 | Reportes gerenciales | `sp_Importar_ConsultaDsh` con wrapper | Fase 1 | Pendiente |
| 6 | RAG + Semantic Catalog | Embeddings sobre `docs/*.md` | Fase 1 | Pendiente |
| 7 | Feedback | `IaConsultaFeedback` + `IaQueryExample` | Fase 6 | Pendiente |
| 8 | Historial/UX/Streaming | Sidebar real (ya diseñado en 5.3), SSE, sugerencias | Fase 1 | Pendiente |

## 11. Pendiente de ejecutar (no lo puedo hacer yo — requiere accesos externos)

1. **Rotar secretos** listados en la sección 1 (consolas de OpenAI, Anthropic, Azure AD/SharePoint, SQL Server, WUP, WhatsApp).
2. **Purga de historial de git** de `appsettings.Development.json` (destructivo — requiere confirmación explícita antes de ejecutar, no se hará sin ella).
3. Confirmar con DBA si `sp_OrdenCompra_Consulta_Estados` y `sp_Planilla_ReporteResumen` agregan en SQL o traen detalle (afecta veredicto de la sección 6).

---

*Documento generado en sesión de análisis 2026-09-28/29. Referencias cruzadas: `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_MAP.md`, `docs/API_MAP.md`, `docs/TECHNICAL_DEBT.md`.*
