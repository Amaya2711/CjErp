using CjERP.Application.DTOs.IaChat;
using CjERP.Backend.Tests.Ia.TestSupport;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// Escenarios obligatorios: "follow-up sobre la consulta anterior", "reutilizacion del resultado
/// anterior" y "aislamiento de conversationId". Protege los tres atajos conversacionales estaticos
/// (TryReformatLastChart, TryReuseLastResponseForFollowUp, TryListMatchesFromLastResult) y el
/// mecanismo de estado por conversationId (GetConversationState/Conversations), sembrando el estado
/// directamente por reflexion en vez de ejecutar un primer turno real contra SQL.
///
/// LIMITACION DOCUMENTADA: esto usa siempre un conversationId UNICO POR TEST (Guid nuevo) para no
/// interferir entre pruebas, porque "Conversations" es un diccionario ESTATICO compartido por todo
/// el proceso (incluida toda la suite de tests). Esa misma caracteristica (estado global de proceso,
/// sin due&#241;o) es exactamente el hueco de aislamiento entre usuarios reales que el diseño de
/// IaConversationService (Fase 4) va a cerrar.
/// </summary>
[Trait("Category", "Unit")]
public sealed class ConversationFollowUpTests
{
    private static string NuevoConversationId() => Guid.NewGuid().ToString("N");

    private static IaChatResponseDto RespuestaConDetalleYGrafico() => new()
    {
        Success = true,
        Module = "GASTOS",
        Answer = "Se encontraron 3 registros.",
        ResponseType = "detail",
        TotalRows = 3,
        DetailRows =
        [
            new() { ["Correlativo"] = 1, ["Cliente"] = "Claro" },
            new() { ["Correlativo"] = 2, ["Cliente"] = "Entel" },
            new() { ["Correlativo"] = 3, ["Cliente"] = "Claro" }
        ],
        Chart = new IaChatChartResponseDto
        {
            ChartType = "bar",
            Title = "Resumen por cliente",
            CategoryField = "Cliente",
            ValueField = "Total",
            Rows = [new() { ["Cliente"] = "Claro", ["Total"] = 1500m }]
        }
    };

    [Fact]
    public void TryReuseLastResponseForFollowUp_SinRespuestaPrevia_DevuelveFalse()
    {
        var state = IaChatServiceReflection.GetOrCreateConversationState(NuevoConversationId());

        var reutilizo = IaChatServiceReflection.TryReuseLastResponseForFollowUp(
            "exportar ese resultado a pdf", state, out _, out _, out _);

        Assert.False(reutilizo);
    }

    [Theory]
    [InlineData("exportar ese resultado a pdf", "export_report")]
    [InlineData("descargar el reporte")]
    [InlineData("quiero verlo en formato ejecutivo")]
    [InlineData("mostrar ese resultado de nuevo")]
    public void TryReuseLastResponseForFollowUp_ConRespuestaPrevia_LaReutilizaSegunLaFrase(
        string pregunta, string? intentEsperado = null)
    {
        var state = IaChatServiceReflection.GetOrCreateConversationState(NuevoConversationId());
        IaChatServiceReflection.SeedLastResponse(state, "respuesta previa", RespuestaConDetalleYGrafico());

        var reutilizo = IaChatServiceReflection.TryReuseLastResponseForFollowUp(
            pregunta, state, out var response, out var answer, out var followUpIntent);

        Assert.True(reutilizo);
        Assert.NotNull(response);

        // HALLAZGO DOCUMENTADO (no es un bug a corregir en Fase 1.0): el parametro `out string answer`
        // de TryReuseLastResponseForFollowUp se inicializa a string.Empty y NUNCA se reasigna en el
        // camino de exito (IaChatService.cs:2258-2313) - el texto real de la respuesta se asigna en
        // su lugar a `response.Answer` (linea 2299-2301). Cualquier futuro consumidor de este metodo
        // (p.ej. al extraerlo a un servicio propio en Fase 1) debe usar response.Answer, no el `out answer`.
        Assert.Empty(answer);
        Assert.NotEmpty(response!.Answer);

        if (intentEsperado is not null)
        {
            Assert.Equal(intentEsperado, followUpIntent);
        }
    }

    [Fact]
    public void TryListMatchesFromLastResult_RequiereDetailRowsPrevias()
    {
        var stateSinDetalle = IaChatServiceReflection.GetOrCreateConversationState(NuevoConversationId());
        IaChatServiceReflection.SeedLastResponse(
            stateSinDetalle, "solo texto", new IaChatResponseDto { Success = true, ResponseType = "conversation" });

        var conDetalle = IaChatServiceReflection.GetOrCreateConversationState(NuevoConversationId());
        IaChatServiceReflection.SeedLastResponse(conDetalle, "con detalle", RespuestaConDetalleYGrafico());

        Assert.False(IaChatServiceReflection.TryListMatchesFromLastResult(
            "muestrame el primero", stateSinDetalle, out _, out _));
    }

    [Fact]
    public void TryReformatLastChart_SinGraficoPrevio_DevuelveFalse()
    {
        var state = IaChatServiceReflection.GetOrCreateConversationState(NuevoConversationId());

        Assert.False(IaChatServiceReflection.TryReformatLastChart(
            "muestrame eso en tabla", state, out _, out _));
    }

    [Fact]
    public void TryReformatLastChart_ConGraficoPrevio_LoReformatea()
    {
        var state = IaChatServiceReflection.GetOrCreateConversationState(NuevoConversationId());
        IaChatServiceReflection.SeedLastResponse(state, "grafico previo", RespuestaConDetalleYGrafico());

        var reformateo = IaChatServiceReflection.TryReformatLastChart(
            "muestralo como grafico de pastel", state, out var chart, out var answer);

        Assert.True(reformateo);
        Assert.NotNull(chart);
        Assert.Equal("pie", chart!.ChartType);
        Assert.NotEmpty(answer);
    }

    [Fact]
    public void AislamientoDeConversationId_DosConversacionesDistintasNoComparteEstado()
    {
        var conversationIdA = NuevoConversationId();
        var conversationIdB = NuevoConversationId();

        var stateA = IaChatServiceReflection.GetOrCreateConversationState(conversationIdA);
        IaChatServiceReflection.SeedLastResponse(stateA, "respuesta de A", RespuestaConDetalleYGrafico());

        var stateB = IaChatServiceReflection.GetOrCreateConversationState(conversationIdB);

        // B es una conversacion nueva/distinta: no debe heredar el LastResponse sembrado en A.
        Assert.False(IaChatServiceReflection.TryReuseLastResponseForFollowUp(
            "exportar ese resultado", stateB, out _, out _, out _));

        // Volver a pedir el estado de A (mismo conversationId) SI debe conservar lo sembrado.
        var stateAOtraVez = IaChatServiceReflection.GetOrCreateConversationState(conversationIdA);
        Assert.True(IaChatServiceReflection.TryReuseLastResponseForFollowUp(
            "exportar ese resultado", stateAOtraVez, out _, out _, out _));
    }
}
