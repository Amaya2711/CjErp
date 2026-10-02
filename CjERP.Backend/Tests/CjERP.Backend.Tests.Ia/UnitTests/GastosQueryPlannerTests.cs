using CjERP.Backend.Tests.Ia.TestSupport;
using CjERP.Infrastructure.Services;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// Tests directos de GastosQueryPlanner (Fase 1.2), extraido de IaChatService.cs
/// (GetOpenAiPlannerDecisionAsync + NormalizeOpenAiPlannerDecision). No hay HTTP real: el planner
/// recibe un FakeOpenAiChatProvider que devuelve el JSON crudo que el test controla.
/// </summary>
[Trait("Category", "Unit")]
public sealed class GastosQueryPlannerTests
{
    [Fact]
    public async Task DecideAsync_EnviaSystemPromptYUserPromptAlProvider()
    {
        var provider = new FakeOpenAiChatProvider()
            .EnqueueResponse("""{"route":"conversation","responseType":"conversation","answer":"ok","buscarArgs":null}""");
        var planner = new GastosQueryPlanner(provider);

        await planner.DecideAsync(
            "GASTOS", "mostrar ese resultado en pdf", "conv-1", "sin historial previo",
            presentationMode: null, hasAttachment: false, isPdfAttachment: false,
            prefersStructuredAttachmentResponse: false, CancellationToken.None);

        Assert.Single(provider.ReceivedMessages);
        var messages = provider.ReceivedMessages[0];
        Assert.Equal(2, messages.Count);
        Assert.Equal("system", messages[0].Role);
        Assert.Equal("user", messages[1].Role);
        Assert.Contains("mostrar ese resultado en pdf", messages[1].Content);
    }

    [Fact]
    public async Task DecideAsync_ConDecisionConversacional_RespetaLaDecisionDelProvider()
    {
        var provider = new FakeOpenAiChatProvider()
            .EnqueueResponse("""{"route":"conversation","responseType":"conversation","answer":"listo","buscarArgs":null}""");
        var planner = new GastosQueryPlanner(provider);

        var decision = await planner.DecideAsync(
            "GASTOS", "mostrar ese resultado en pdf", "conv-1", "historial",
            presentationMode: null, hasAttachment: false, isPdfAttachment: false,
            prefersStructuredAttachmentResponse: false, CancellationToken.None);

        Assert.Equal("conversation", decision.Route);
        Assert.Equal("conversation", decision.ResponseType);
        Assert.Equal("listo", decision.Answer);
    }

    [Fact]
    public async Task DecideAsync_ConFiltroEstructuradoExplicito_FuerzaRutaBuscarPlanillaAunSiElProviderDijoConversation()
    {
        // HALLAZGO PRESERVADO (comportamiento original de NormalizeOpenAiPlannerDecision,
        // IaChatService.cs antes de Fase 1.2): si la pregunta trae un filtro explicito
        // ("cliente X"), el planner ignora route=conversation del modelo y fuerza buscar_planilla.
        var provider = new FakeOpenAiChatProvider()
            .EnqueueResponse("""{"route":"conversation","responseType":"conversation","answer":"Consulta procesada correctamente.","buscarArgs":null}""");
        var planner = new GastosQueryPlanner(provider);

        var decision = await planner.DecideAsync(
            "GASTOS", "gastos del cliente Claro", "conv-1", "sin historial",
            presentationMode: null, hasAttachment: false, isPdfAttachment: false,
            prefersStructuredAttachmentResponse: false, CancellationToken.None);

        Assert.Equal("buscar_planilla", decision.Route);
        Assert.Equal("detail", decision.ResponseType);
        Assert.Null(decision.Answer);
    }

    [Fact]
    public async Task DecideAsync_SinRouteEnLaRespuesta_UsaFallbackSegunLaPregunta()
    {
        var provider = new FakeOpenAiChatProvider()
            .EnqueueResponse("""{"responseType":null,"answer":null,"buscarArgs":null}""");
        var planner = new GastosQueryPlanner(provider);

        var decision = await planner.DecideAsync(
            "GASTOS", "gastos pendientes", "conv-1", "sin historial",
            presentationMode: null, hasAttachment: false, isPdfAttachment: false,
            prefersStructuredAttachmentResponse: false, CancellationToken.None);

        Assert.Equal("buscar_planilla", decision.Route);
        Assert.Equal("detail", decision.ResponseType);
    }

    [Fact]
    public async Task DecideAsync_ConTextoAdicionalAlrededorDelJson_ExtraeElCandidatoJsonCorrectamente()
    {
        var provider = new FakeOpenAiChatProvider()
            .EnqueueResponse("""Aqui esta el resultado: {"route":"buscar_planilla","responseType":"detail","answer":null,"buscarArgs":null} gracias""");
        var planner = new GastosQueryPlanner(provider);

        var decision = await planner.DecideAsync(
            "GASTOS", "gastos del proyecto Backbone", "conv-1", "sin historial",
            presentationMode: null, hasAttachment: false, isPdfAttachment: false,
            prefersStructuredAttachmentResponse: false, CancellationToken.None);

        Assert.Equal("buscar_planilla", decision.Route);
    }
}
