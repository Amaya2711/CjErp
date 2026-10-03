using System.Text.Json;
using CjERP.Application.DTOs.IaChat;
using CjERP.Application.Interfaces.Services.AI;
using CjERP.Backend.Tests.Ia.TestSupport;
using CjERP.Infrastructure.Services;
using CjERP.Shared.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace CjERP.Backend.Tests.Ia.IntegrationTests;

/// <summary>
/// PRUEBAS SINTETICAS de la conexion PREPARADA del orquestador (Fase 2, desactivada por defecto).
/// Usan un ejecutor espia y un servicio de autorizacion falso: NO prueban la fuente real de permisos, el
/// directorio de empleados ni el SP. La activacion real queda pendiente (ver anexo del plan).
/// </summary>
[Trait("Category", "Unit")]
public sealed class IaScopeEnforcementOrchestratorTests
{
    private const string User = "usuario-A";

    private static string PlannerEnvelope(string route, string responseType = "detail") =>
        JsonSerializer.Serialize(new
        {
            choices = new[] { new { message = new { content = JsonSerializer.Serialize(new { route, responseType, answer = "" }) } } }
        });

    private static string TextEnvelope(string text) =>
        JsonSerializer.Serialize(new { choices = new[] { new { message = new { content = text } } } });

    private static IaResolvedScope Restricted(bool globals, params int[] ids) =>
        IaResolvedScope.ForRestricted(IaScopeLevel.Equipo, IaScopeFields.ResponsableOSolicitante, ids, globals);

    private sealed class SpyExecutor : IGastosQueryExecutor
    {
        public int LegacyCalls { get; private set; }
        public int ScopedCalls { get; private set; }
        public IaResolvedScope? LastScope { get; private set; }
        public IReadOnlyList<string> Unavailable { get; set; } = Array.Empty<string>();

        public Task<PlanillaBuscarExecutionResult> EjecutarBuscarPlanillaAsync(
            BuscarPlanillaArgs args, CancellationToken cancellationToken, bool fetchAllPages = false)
        {
            LegacyCalls++;
            return Task.FromResult(Result());
        }

        public Task<PlanillaBuscarExecutionResult> EjecutarBuscarPlanillaConAlcanceAsync(
            BuscarPlanillaArgs args, IaResolvedScope scope, CancellationToken cancellationToken, bool fetchAllPages = false)
        {
            ScopedCalls++;
            LastScope = scope;
            return Task.FromResult(Result());
        }

        public List<Dictionary<string, object?>>? Rows { get; set; }

        private PlanillaBuscarExecutionResult Result() => new()
        {
            Rows = Rows?.Select(r => new Dictionary<string, object?>(r)).ToList()
                ?? [new Dictionary<string, object?> { ["IdPlanilla"] = 1, ["Subtotal"] = 10m, ["Moneda"] = "SOLES", ["Estado"] = "PAGADO" }],
            TotalRows = 1,
            UnavailableColumns = Unavailable
        };
    }

    private sealed class FakeAuth : IIaAuthorizationService
    {
        public Func<IaAuthorizationResult> Next { get; set; } = () => IaAuthorizationResult.Deny("x");
        public int Calls { get; private set; }

        public Task<IaAuthorizationResult> AuthorizeAsync(IaAuthorizationRequest request, CancellationToken cancellationToken)
        {
            Calls++;
            return Task.FromResult(Next());
        }
    }

    private sealed class Harness
    {
        public required IaOrchestrator Service { get; init; }
        public required IIaConversationStore Store { get; init; }
        public required FakeHttpMessageHandler Handler { get; init; }
        public required SpyExecutor Executor { get; init; }
    }

    private static Harness Build(FakeAuth? auth, bool enabled, FakeHttpMessageHandler handler, SpyExecutor? executor = null)
    {
        executor ??= new SpyExecutor();
        var httpClient = new HttpClient(handler, disposeHandler: false);
        var openAi = new OpenAiChatProvider(httpClient, Options.Create(new OpenAiSettings { ApiKey = "k", Model = "m", MaxTokens = 1000 }));
        var anthropic = new AnthropicMessagesProvider(httpClient, Options.Create(new AnthropicSettings { ApiKey = "k", Model = "m", MaxTokens = 1000 }));
        var sql = FakeSqlCommandFactory.PointingToClosedLocalPort();
        var store = new InMemoryIaConversationStore();

        var service = new IaOrchestrator(
            executor,
            openAi,
            new GastosQueryPlanner(openAi),
            store,
            new IaAuditService(sql, NullLogger<IaAuditService>.Instance),
            new ResponseGenerator(openAi),
            new IaDashboardExportService(anthropic, NullLogger<IaDashboardExportService>.Instance),
            NullLogger<IaOrchestrator>.Instance,
            auth,
            enabled ? new IaScopeEnforcementOptions { Enabled = true } : null);

        return new Harness { Service = service, Store = store, Handler = handler, Executor = executor };
    }

    private static Task<IaChatResponseDto> Ask(Harness h, string question, string? conversationId = null) =>
        h.Service.ConsultarAsync(
            new IaChatConsultarRequestDto { Module = "GASTOS", Question = question, ConversationId = conversationId },
            User);

    [Fact]
    public async Task Desactivado_UsaLaRutaHeredada_SinAlcance()
    {
        var handler = new FakeHttpMessageHandler()
            .EnqueueJson(PlannerEnvelope("buscar_planilla"))
            .EnqueueJson(TextEnvelope("Respuesta."));
        var h = Build(auth: null, enabled: false, handler);

        var response = await Ask(h, "gastos del cliente Claro");

        Assert.True(response.Success);
        Assert.Equal(1, h.Executor.LegacyCalls);
        Assert.Equal(0, h.Executor.ScopedCalls);
        Assert.Null(response.UnavailableFields);
    }

    [Fact]
    public async Task Activado_SinServicioDeAutorizacion_DenegaYNoEjecutaNiLlamaAlLlm()
    {
        var h = Build(auth: null, enabled: true, new FakeHttpMessageHandler());

        var response = await Ask(h, "gastos del cliente Claro");

        Assert.False(response.Success);
        Assert.Contains("permiso", response.ErrorMessage, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(0, h.Executor.LegacyCalls);
        Assert.Equal(0, h.Executor.ScopedCalls);
        Assert.Equal(0, h.Handler.CallCount);
    }

    [Fact]
    public async Task Activado_ConDenegacion_NoEjecutaNada_SinFallbackALaRutaSinRestriccion()
    {
        var auth = new FakeAuth { Next = () => IaAuthorizationResult.Deny("sin_permiso_de_alcance") };
        var h = Build(auth, enabled: true, new FakeHttpMessageHandler());

        var response = await Ask(h, "gastos del cliente Claro");

        Assert.False(response.Success);
        Assert.Equal(1, auth.Calls);
        Assert.Equal(0, h.Executor.LegacyCalls);
        Assert.Equal(0, h.Executor.ScopedCalls);
        Assert.Equal(0, h.Handler.CallCount);
    }

    [Fact]
    public async Task Activado_SiLaAutorizacionLanza_Deniega()
    {
        var auth = new FakeAuth { Next = () => throw new InvalidOperationException("fallo") };
        var h = Build(auth, enabled: true, new FakeHttpMessageHandler());

        var response = await Ask(h, "gastos del cliente Claro");

        Assert.False(response.Success);
        Assert.Equal(0, h.Executor.LegacyCalls);
        Assert.Equal(0, h.Executor.ScopedCalls);
    }

    [Fact]
    public async Task Activado_ConPermiso_EjecutaSoloLaVarianteConAlcance_YPropagaLosCamposNoDisponibles()
    {
        var scope = Restricted(globals: false, 7, 11);
        var auth = new FakeAuth { Next = () => IaAuthorizationResult.Allow(scope) };
        var handler = new FakeHttpMessageHandler()
            .EnqueueJson(PlannerEnvelope("buscar_planilla"))
            .EnqueueJson(TextEnvelope("Respuesta."));
        var executor = new SpyExecutor { Unavailable = IaGlobalColumns.Names };
        var h = Build(auth, enabled: true, handler, executor);

        var response = await Ask(h, "gastos del cliente Claro");

        Assert.True(response.Success);
        Assert.Equal(0, executor.LegacyCalls);
        Assert.Equal(1, executor.ScopedCalls);
        Assert.Same(scope, executor.LastScope);
        Assert.Equal(15, response.UnavailableFields!.Count);
        Assert.NotNull(response.DetailRows);

        // El analisis enviado al LLM declara los campos no disponibles y la regla.
        Assert.Contains("unavailableFields", handler.RequestBodies[1], StringComparison.Ordinal);
    }

    [Fact]
    public async Task Activado_PreguntaQueDependeDeMetricaNoPermitida_RespondeNoDisponible_SinAnalisisNiFilas()
    {
        var auth = new FakeAuth { Next = () => IaAuthorizationResult.Allow(Restricted(false, 7)) };
        var handler = new FakeHttpMessageHandler().EnqueueJson(PlannerEnvelope("buscar_planilla"));
        var executor = new SpyExecutor { Unavailable = IaGlobalColumns.Names };
        var h = Build(auth, enabled: true, handler, executor);

        var response = await Ask(h, "cuales son las ventas del site LIM123");

        Assert.True(response.Success);
        Assert.Equal("conversation", response.ResponseType);
        Assert.Contains("no está disponible", response.Answer);
        Assert.Null(response.DetailRows);
        Assert.Equal(0, response.TotalRows);
        Assert.Equal(15, response.UnavailableFields!.Count);
        Assert.Equal(1, handler.CallCount);                       // solo el planner: no hubo analisis ni respuesta del LLM
    }

    [Fact]
    public async Task Activado_SiCambiaElAlcance_SeDescartaToda_LaMemoriaPrevia()
    {
        var current = Restricted(false, 7);
        var auth = new FakeAuth { Next = () => IaAuthorizationResult.Allow(current) };
        var handler = new FakeHttpMessageHandler()
            .EnqueueJson(PlannerEnvelope("conversation", "conversation"))
            .EnqueueJson(PlannerEnvelope("conversation", "conversation"))
            .EnqueueJson(PlannerEnvelope("conversation", "conversation"));
        var h = Build(auth, enabled: true, handler);

        var first = await Ask(h, "hola buenos dias");
        var state = h.Store.TryGetOwned(first.ConversationId!, User).State!;
        Assert.True(state.MatchesAuthorizedScope(current.ToAuthorizedScope()));
        Assert.Equal(2, state.GetRecentTurns(100).Count);

        // Mismo alcance: la memoria se conserva (2 turnos previos + 2 nuevos).
        await Ask(h, "otra consulta de prueba", first.ConversationId);
        Assert.Equal(4, state.GetRecentTurns(100).Count);

        // Cambia la composicion del equipo: se descarta TODA la memoria antes de responder.
        current = Restricted(false, 7, 8);
        await Ask(h, "una tercera consulta", first.ConversationId);
        Assert.Equal(2, state.GetRecentTurns(100).Count);
        Assert.True(state.MatchesAuthorizedScope(current.ToAuthorizedScope()));
    }

    [Fact]
    public async Task Activado_Exportar_ConAlcanceDistinto_SeRechaza_SinLlamarAlGeneradorDeInforme()
    {
        var seeded = Restricted(false, 7);
        var auth = new FakeAuth { Next = () => IaAuthorizationResult.Allow(Restricted(false, 7, 8)) };
        var handler = new FakeHttpMessageHandler();
        var h = Build(auth, enabled: true, handler);

        var state = h.Store.CreateNew(User);
        state.AppendAssistant("resp", new IaChatResponseDto
        {
            Success = true,
            Answer = "resp",
            ResponseType = "detail",
            DetailRows = [new Dictionary<string, object?> { ["Subtotal"] = 10m, ["Moneda"] = "SOLES" }],
            TotalRows = 1
        }, "buscar_planilla", new Dictionary<string, object?>());
        state.RecordAuthorizedScope(seeded.ToAuthorizedScope());

        var result = await h.Service.GenerarDashboardReporteAsync(
            new IaChatDashboardExportRequestDto
            {
                Module = "GASTOS", Question = "gastos", ContextualSummary = "resumen", ConversationId = state.ConversationId
            },
            User);

        Assert.False(result.Success);
        Assert.Contains("alcance", result.ErrorMessage, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(0, handler.CallCount);
    }

    private const string SentinelVentas = "987654.32";
    private const string SentinelSubOc = "111222.33";

    private static SpyExecutor ExecutorQueFiltraColumnasGlobales() => new()
    {
        // Simula un ejecutor/SP defectuoso: devuelve las columnas globales CON VALORES y sin declararlas no disponibles.
        Rows =
        [
            new Dictionary<string, object?>
            {
                ["IdPlanilla"] = 1, ["Subtotal"] = 10m, ["Moneda"] = "SOLES", ["Estado"] = "PAGADO", ["Site"] = "A",
                ["Ventas"] = 987654.32m, ["SubOc"] = 111222.33m, ["PorcentajeFic"] = 77.77m, ["ConPagadoSoles"] = 555m
            }
        ]
    };

    [Fact]
    public async Task Seguridad_NoDependeDeLaHeuristica_ColumnasGlobalesNuncaLlegaAlLlmNiALaRespuestaNiALaMemoria()
    {
        var question = "dime cuanto se facturo en total por cada site";
        Assert.False(IaGlobalColumns.QuestionNeedsGlobalMetric(question, IaGlobalColumns.Names));   // la heuristica NO lo detecta

        var auth = new FakeAuth { Next = () => IaAuthorizationResult.Allow(Restricted(globals: false, 7)) };
        var handler = new FakeHttpMessageHandler()
            .EnqueueJson(PlannerEnvelope("buscar_planilla"))
            .EnqueueJson(TextEnvelope("Respuesta."));
        var h = Build(auth, enabled: true, handler, ExecutorQueFiltraColumnasGlobales());

        var response = await Ask(h, question);

        Assert.True(response.Success);
        Assert.All(IaGlobalColumns.Names, name => Assert.DoesNotContain(response.DetailRows![0].Keys, k => string.Equals(k, name, StringComparison.OrdinalIgnoreCase)));
        Assert.Equal(15, response.UnavailableFields!.Count);

        foreach (var body in handler.RequestBodies)
        {
            Assert.DoesNotContain("987654", body, StringComparison.Ordinal);
            Assert.DoesNotContain("111222", body, StringComparison.Ordinal);
            Assert.DoesNotContain("77.77", body, StringComparison.Ordinal);
        }

        var state = h.Store.TryGetOwned(response.ConversationId!, User).State!;
        Assert.All(IaGlobalColumns.Names, name => Assert.DoesNotContain(state.LastResponse!.DetailRows![0].Keys, k => string.Equals(k, name, StringComparison.OrdinalIgnoreCase)));
    }

    [Fact]
    public async Task Seguridad_ConPermisoDeTotales_LasColumnasSiLlegan_YUnCeroRealSeConserva()
    {
        var auth = new FakeAuth { Next = () => IaAuthorizationResult.Allow(Restricted(globals: true, 7)) };
        var handler = new FakeHttpMessageHandler()
            .EnqueueJson(PlannerEnvelope("buscar_planilla"))
            .EnqueueJson(TextEnvelope("Respuesta."));
        var executor = new SpyExecutor
        {
            Rows = [new Dictionary<string, object?> { ["IdPlanilla"] = 1, ["Subtotal"] = 10m, ["Moneda"] = "SOLES", ["Ventas"] = 0m, ["SubOc"] = 5m }]
        };
        var h = Build(auth, enabled: true, handler, executor);

        var response = await Ask(h, "gastos del cliente Claro");

        Assert.Null(response.UnavailableFields);
        Assert.Equal(0m, response.DetailRows![0]["Ventas"]);      // cero real: la columna esta y vale 0
        Assert.Equal(5m, response.DetailRows[0]["SubOc"]);
    }

    [Fact]
    public async Task Revocacion_DelPermisoDeTotales_DescartaLaMemoria()
    {
        var current = Restricted(globals: true, 7);
        var auth = new FakeAuth { Next = () => IaAuthorizationResult.Allow(current) };
        var handler = new FakeHttpMessageHandler()
            .EnqueueJson(PlannerEnvelope("conversation", "conversation"))
            .EnqueueJson(PlannerEnvelope("conversation", "conversation"));
        var h = Build(auth, enabled: true, handler);

        var first = await Ask(h, "hola buenos dias");
        var state = h.Store.TryGetOwned(first.ConversationId!, User).State!;
        Assert.Equal(2, state.GetRecentTurns(100).Count);

        current = Restricted(globals: false, 7);          // mismo nivel y miembros; solo se revoca el permiso de totales
        await Ask(h, "otra consulta de prueba", first.ConversationId);

        Assert.Equal(2, state.GetRecentTurns(100).Count);  // la memoria previa se descarto
        Assert.True(state.MatchesAuthorizedScope(current.ToAuthorizedScope()));
    }

    [Fact]
    public async Task Revocacion_TotalDelAcceso_DescartaLaMemoria_YDeniega()
    {
        var current = Restricted(globals: false, 7);
        var auth = new FakeAuth { Next = () => IaAuthorizationResult.Allow(current) };
        var handler = new FakeHttpMessageHandler().EnqueueJson(PlannerEnvelope("conversation", "conversation"));
        var h = Build(auth, enabled: true, handler);

        var first = await Ask(h, "hola buenos dias");
        var state = h.Store.TryGetOwned(first.ConversationId!, User).State!;
        Assert.NotNull(state.LastResponse);

        auth.Next = () => IaAuthorizationResult.Deny("sin_permiso_de_alcance");
        var denied = await Ask(h, "otra consulta", first.ConversationId);

        Assert.False(denied.Success);
        Assert.Null(state.LastResponse);
        Assert.Empty(state.GetRecentTurns(100));
    }

    [Fact]
    public async Task Seguridad_Exportar_SinPermisoDeTotales_NoEnviaValoresGlobalesAlGeneradorAunqueLaMemoriaLosTenga()
    {
        var scope = Restricted(globals: false, 7);
        var auth = new FakeAuth { Next = () => IaAuthorizationResult.Allow(scope) };
        var handler = new FakeHttpMessageHandler()
            .EnqueueJson(JsonSerializer.Serialize(new { content = new[] { new { type = "text", text = "<main id=\"report-root\">x</main>" } } }));
        var h = Build(auth, enabled: true, handler);

        var state = h.Store.CreateNew(User);
        state.AppendAssistant("resp", new IaChatResponseDto
        {
            Success = true,
            Answer = "resp",
            ResponseType = "detail",
            // Memoria "contaminada": trae valores globales aunque el permiso vigente no los autoriza.
            DetailRows = [new Dictionary<string, object?> { ["Subtotal"] = 10m, ["Moneda"] = "SOLES", ["Ventas"] = 987654.32m, ["Ot"] = "1", ["Site"] = "A" }],
            TotalRows = 1
        }, "buscar_planilla", new Dictionary<string, object?>());
        state.RecordAuthorizedScope(scope.ToAuthorizedScope());

        var result = await h.Service.GenerarDashboardReporteAsync(
            new IaChatDashboardExportRequestDto
            {
                Module = "GASTOS", Question = "informe de ventas", ContextualSummary = "resumen", ConversationId = state.ConversationId
            },
            User);

        Assert.Equal(1, handler.CallCount);
        Assert.DoesNotContain("987654", handler.RequestBodies[0], StringComparison.Ordinal);
        Assert.Contains("metricUnavailable", handler.RequestBodies[0], StringComparison.OrdinalIgnoreCase);
        Assert.NotNull(result);
    }

    [Fact]
    public async Task Activado_Exportar_SinPermiso_SeRechaza()
    {
        var auth = new FakeAuth { Next = () => IaAuthorizationResult.Deny("x") };
        var handler = new FakeHttpMessageHandler();
        var h = Build(auth, enabled: true, handler);

        var state = h.Store.CreateNew(User);
        state.AppendAssistant("resp", new IaChatResponseDto
        {
            Success = true,
            Answer = "resp",
            DetailRows = [new Dictionary<string, object?> { ["Subtotal"] = 10m }],
            TotalRows = 1
        }, "buscar_planilla", new Dictionary<string, object?>());

        var result = await h.Service.GenerarDashboardReporteAsync(
            new IaChatDashboardExportRequestDto
            {
                Module = "GASTOS", Question = "gastos", ContextualSummary = "resumen", ConversationId = state.ConversationId
            },
            User);

        Assert.False(result.Success);
        Assert.Equal(0, handler.CallCount);
    }
}
