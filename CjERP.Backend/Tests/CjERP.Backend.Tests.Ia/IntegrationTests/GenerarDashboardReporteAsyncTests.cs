using System.Text.Json;
using CjERP.Application.DTOs.IaChat;
using CjERP.Backend.Tests.Ia.TestSupport;
using CjERP.Infrastructure.Services;
using Xunit;

namespace CjERP.Backend.Tests.Ia.IntegrationTests;

/// <summary>
/// Prueba, a traves de la superficie publica real (IaOrchestrator.GenerarDashboardReporteAsync),
/// la correccion de Fase 2: StructuredDataJson enviado por el cliente deja de ser la fuente de
/// datos del dashboard — el payload se reconstruye en el backend (IaExecutiveReportBuilder) a
/// partir del ultimo resultado guardado en una conversacion PROPIA del usuario (propiedad
/// verificada, no autorizacion de alcance de datos — IIaAuthorizationService sigue sin conectar).
/// Cubre tambien el requisito de propiedad: conversacion inexistente, ajena, o sin resultado previo
/// deben rechazarse.
/// </summary>
[Trait("Category", "Integration")]
public sealed class GenerarDashboardReporteAsyncTests
{
    private static string PlannerJson(string route, string responseType, string answer, object? searchArgs = null) =>
        JsonSerializer.Serialize(new { route, responseType, answer, buscarArgs = searchArgs });

    private static string OpenAiEnvelope(string plannerJsonContent) =>
        JsonSerializer.Serialize(new { choices = new[] { new { message = new { content = plannerJsonContent } } } });

    private static string AnthropicEnvelope(string html) =>
        JsonSerializer.Serialize(new { content = new[] { new { type = "text", text = html } } });

    [Fact]
    public async Task Exportar_SinConversationId_Rechaza()
    {
        var handler = new FakeHttpMessageHandler();
        var service = IaChatServiceTestFactory.Create(handler, FakeSqlCommandFactory.NeverCalled());

        var result = await service.GenerarDashboardReporteAsync(
            new IaChatDashboardExportRequestDto
            {
                Module = "GASTOS",
                Question = "gastos de Claro",
                ContextualSummary = "resumen",
                StructuredDataJson = "{\"fabricado\":true}",
                ConversationId = null
            },
            idUsuario: "usuario-A");

        Assert.False(result.Success);
        Assert.Contains("conversación", result.ErrorMessage, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Exportar_ConversationIdDesconocidoOAjeno_Rechaza()
    {
        var handler = new FakeHttpMessageHandler();
        var service = IaChatServiceTestFactory.Create(handler, FakeSqlCommandFactory.NeverCalled());

        var result = await service.GenerarDashboardReporteAsync(
            new IaChatDashboardExportRequestDto
            {
                Module = "GASTOS",
                Question = "gastos de Claro",
                ContextualSummary = "resumen",
                StructuredDataJson = "{\"fabricado\":true}",
                ConversationId = Guid.NewGuid().ToString("N")
            },
            idUsuario: "usuario-A");

        Assert.False(result.Success);
        Assert.Contains("acceso", result.ErrorMessage, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Exportar_ConversacionSinResultadoPrevio_Rechaza()
    {
        var handler = new FakeHttpMessageHandler()
            .EnqueueJson(OpenAiEnvelope(PlannerJson("conversation", "conversation", "Hola, en que te ayudo?")));
        var service = IaChatServiceTestFactory.Create(handler, FakeSqlCommandFactory.NeverCalled());

        var consulta = await service.ConsultarAsync(
            new IaChatConsultarRequestDto { Module = "GASTOS", Question = "hola" },
            idUsuario: "usuario-A");

        Assert.NotNull(consulta.ConversationId);

        var result = await service.GenerarDashboardReporteAsync(
            new IaChatDashboardExportRequestDto
            {
                Module = "GASTOS",
                Question = "gastos de Claro",
                ContextualSummary = "resumen",
                StructuredDataJson = "{\"fabricado\":true}",
                ConversationId = consulta.ConversationId
            },
            idUsuario: "usuario-A");

        Assert.False(result.Success);
        Assert.Contains("resultado previo", result.ErrorMessage, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Exportar_ConResultadoPrevioPropio_IgnoraStructuredDataJsonDelClienteYUsaElReconstruidoEnBackend()
    {
        var handler = new FakeHttpMessageHandler()
            .EnqueueJson(AnthropicEnvelope("<main id=\"report-root\">dashboard</main>"));
        var (service, store) = IaChatServiceTestFactory.CreateWithStore(handler, FakeSqlCommandFactory.NeverCalled());

        // Siembra directa de un "resultado previo guardado en una conversacion propia" (propiedad,
        // no autorizacion de alcance) sin tocar SQL (gap ya documentado:
        // ISqlCommandFactory.CreateConnection() no es simulable). Esto es exactamente lo que
        // ConsultarAsync habria dejado en ConversationState.LastResponse tras una consulta real de
        // GASTOS contra Claro/Backbone Norte.
        var conversationState = store.CreateNew("usuario-A");
        var detailRows = new List<Dictionary<string, object?>>
        {
            new() { ["Cliente"] = "Claro", ["Proyecto"] = "Backbone Norte", ["Subtotal"] = 1000m, ["Moneda"] = "PEN", ["Estado"] = "PAGADO", ["Fecha"] = "2026-01-10" },
            new() { ["Cliente"] = "Claro", ["Proyecto"] = "Backbone Norte", ["Subtotal"] = 500m, ["Moneda"] = "PEN", ["Estado"] = "PAGADO", ["Fecha"] = "2026-01-15" }
        };
        conversationState.AppendAssistant(
            "Claro gasto S/ 1,500.00 en Backbone Norte.",
            new IaChatResponseDto
            {
                Success = true,
                Module = "GASTOS",
                Answer = "Claro gasto S/ 1,500.00 en Backbone Norte.",
                ResponseType = "detail",
                DetailRows = detailRows,
                TotalRows = detailRows.Count
            },
            toolName: "buscar_planilla",
            toolParameters: null);

        var fabricado = JsonSerializer.Serialize(new { montoFabricadoPorElCliente = 999_999_999m, clienteFabricado = "NoAutorizado" });

        var result = await service.GenerarDashboardReporteAsync(
            new IaChatDashboardExportRequestDto
            {
                Module = "GASTOS",
                Question = "gastos de Claro",
                ContextualSummary = "resumen de Claro",
                StructuredDataJson = fabricado,
                ConversationId = conversationState.ConversationId
            },
            idUsuario: "usuario-A");

        Assert.True(result.Success);

        // La prueba decisiva: lo que realmente se envio a Anthropic (capturado por el handler fake)
        // debe contener los datos RECONSTRUIDOS por el backend (Backbone Norte, S/ 1,500.00), y
        // NUNCA el contenido fabricado que el cliente intento inyectar.
        var promptEnviado = handler.RequestBodies.Single();
        Assert.Contains("Backbone Norte", promptEnviado);
        Assert.Contains("1,500.00", promptEnviado);
        Assert.DoesNotContain("NoAutorizado", promptEnviado);
        Assert.DoesNotContain("999999999", promptEnviado);
    }

    [Fact]
    public async Task Exportar_ConConversationIdDeOtroUsuario_Rechaza()
    {
        var handler = new FakeHttpMessageHandler();
        var (service, store) = IaChatServiceTestFactory.CreateWithStore(handler, FakeSqlCommandFactory.NeverCalled());

        var conversationDeA = store.CreateNew("usuario-A");
        conversationDeA.AppendAssistant(
            "respuesta",
            new IaChatResponseDto { Success = true, DetailRows = [new() { ["Cliente"] = "Claro", ["Subtotal"] = 100m }] },
            "buscar_planilla",
            null);

        var result = await service.GenerarDashboardReporteAsync(
            new IaChatDashboardExportRequestDto
            {
                Module = "GASTOS",
                Question = "gastos de Claro",
                ContextualSummary = "resumen",
                StructuredDataJson = "{}",
                ConversationId = conversationDeA.ConversationId
            },
            idUsuario: "usuario-B");

        Assert.False(result.Success);
        Assert.Contains("acceso", result.ErrorMessage, StringComparison.OrdinalIgnoreCase);
    }
}
