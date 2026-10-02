using CjERP.Backend.Tests.Ia.TestSupport;
using CjERP.Infrastructure.Services;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// Test directo de ResponseGenerator (extraido en el paso 1.12 original de la tabla de Fase 1),
/// en aislamiento de IaChatService, usando el mismo FakeOpenAiChatProvider que ya usan los tests
/// de GastosQueryPlanner. Antes de esta extraccion no existia ningun test (directo ni indirecto)
/// sobre la normalizacion de respuesta cuando el payload mezcla monedas (NormalizeCurrencyResponseIfNeeded
/// y sus helpers privados); este archivo cubre ese riesgo real que la extraccion hizo evidente.
/// </summary>
[Trait("Category", "Unit")]
public sealed class ResponseGeneratorTests
{
    [Fact]
    public async Task GenerateOpenAiFinalAnswerAsync_PayloadConUnaSolaMoneda_DevuelveRespuestaSinCambios()
    {
        var provider = new FakeOpenAiChatProvider()
            .EnqueueResponse("Claro gasto S/ 1,000.00 este mes.");
        var generator = new ResponseGenerator(provider);

        var payload = new
        {
            hasMultipleCurrencies = false,
            currencyTotals = new[] { new { moneda = "PEN", monto = 1000m, registros = 3 } }
        };

        var answer = await generator.GenerateOpenAiFinalAnswerAsync(
            question: "cuanto gasto Claro este mes",
            conversationContext: string.Empty,
            module: "GASTOS",
            route: "buscar_planilla",
            responseType: "summary",
            searchArgs: new BuscarPlanillaArgs(),
            payload: payload,
            cancellationToken: CancellationToken.None);

        Assert.Equal("Claro gasto S/ 1,000.00 este mes.", answer);
    }

    [Fact]
    public async Task GenerateOpenAiFinalAnswerAsync_PayloadConMultiplesMonedas_AnteponeResumenPorMoneda()
    {
        var provider = new FakeOpenAiChatProvider()
            .EnqueueResponse("Por un total de 1500 considerando ambas monedas.\nClaro registra gastos este mes.");
        var generator = new ResponseGenerator(provider);

        var payload = new
        {
            hasMultipleCurrencies = true,
            currencyTotals = new[]
            {
                new { moneda = "PEN", monto = 1000m, registros = 3 },
                new { moneda = "USD", monto = 500m, registros = 2 }
            }
        };

        var answer = await generator.GenerateOpenAiFinalAnswerAsync(
            question: "cuanto gasto Claro este mes",
            conversationContext: string.Empty,
            module: "GASTOS",
            route: "buscar_planilla",
            responseType: "summary",
            searchArgs: new BuscarPlanillaArgs(),
            payload: payload,
            cancellationToken: CancellationToken.None);

        Assert.StartsWith("Resumen por moneda:", answer);
        Assert.Contains("Soles: S/ 1,000.00 en 3 registros", answer);
        Assert.Contains("Dólares: US$ 500.00 en 2 registros", answer);
        Assert.DoesNotContain("considerando ambas monedas", answer, StringComparison.OrdinalIgnoreCase);
    }
}
