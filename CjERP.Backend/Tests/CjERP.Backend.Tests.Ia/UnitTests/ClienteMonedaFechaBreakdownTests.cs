using System.Text.Json;
using CjERP.Infrastructure.Services;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// PRUEBAS SINTETICAS del analisis "por cliente, moneda y fecha" (caso real: "gastos por cliente y moneda para el
/// mes de setiembre 2026"). Filas en memoria; no ejecutan SQL.
/// </summary>
[Trait("Category", "Unit")]
public sealed class ClienteMonedaFechaBreakdownTests
{
    private static List<Dictionary<string, object?>> Rows() =>
    [
        new() { ["IdPlanilla"] = 1, ["Fecha"] = "01/09/2026", ["Cliente"] = "AMX", ["Moneda"] = "SOLES", ["Subtotal"] = 100m, ["SubtotalSoles"] = 100m },
        new() { ["IdPlanilla"] = 2, ["Fecha"] = "01/09/2026", ["Cliente"] = "AMX", ["Moneda"] = "SOLES", ["Subtotal"] = 50m, ["SubtotalSoles"] = 50m },
        new() { ["IdPlanilla"] = 3, ["Fecha"] = "02/09/2026", ["Cliente"] = "AMX", ["Moneda"] = "DOLARES", ["Subtotal"] = 10m, ["SubtotalSoles"] = 35m },
        new() { ["IdPlanilla"] = 4, ["Fecha"] = "02/09/2026", ["Cliente"] = "IPT", ["Moneda"] = "SOLES", ["Subtotal"] = 200m, ["SubtotalSoles"] = 200m }
    ];

    [Fact]
    public void ClienteXMoneda_AgrupaPorAmbasDimensiones_SinMezclarMonedas()
    {
        var result = GastosAnalysisService.BuildClientCurrencyBreakdown(Rows());

        Assert.Equal(3, result.Count);

        var amxSoles = result.Single(r => (string?)r["Cliente"] == "AMX" && (string?)r["Moneda"] == "SOLES");
        Assert.Equal(2, amxSoles["Registros"]);
        Assert.Equal(150m, amxSoles["SubtotalMonedaOriginal"]);
        Assert.Equal(150m, amxSoles["SubtotalSolesEquivalente"]);

        var amxDolares = result.Single(r => (string?)r["Cliente"] == "AMX" && (string?)r["Moneda"] == "DOLARES");
        Assert.Equal(10m, amxDolares["SubtotalMonedaOriginal"]);   // el original NO se suma con los soles
        Assert.Equal(35m, amxDolares["SubtotalSolesEquivalente"]);
    }

    [Fact]
    public void FechaXMoneda_AgrupaPorDiaYMoneda()
    {
        var result = GastosAnalysisService.BuildDateCurrencyBreakdown(Rows());

        Assert.Equal(3, result.Count);
        Assert.Equal("2026-09-01", result[0]["Fecha"]);
        Assert.Equal(2, result[0]["Registros"]);
        Assert.Equal(150m, result[0]["SubtotalMonedaOriginal"]);
        Assert.Contains(result, r => (string?)r["Fecha"] == "2026-09-02" && (string?)r["Moneda"] == "DOLARES");
    }

    [Theory]
    [InlineData("01/09/2026", 2026, 9, 1)]   // dd/mm/aaaa: 1 de setiembre (antes se leia como 9 de enero)
    [InlineData("12/09/2026", 2026, 9, 12)]
    [InlineData("25/09/2026", 2026, 9, 25)]
    [InlineData("2026-09-03", 2026, 9, 3)]
    public void LasFechasDelStoreSeLeenComoDiaMesAnio(string texto, int anio, int mes, int dia)
    {
        var row = new Dictionary<string, object?> { ["Fecha"] = texto };

        Assert.True(GastosAnalysisService.TryGetRowDate(row, out var fecha));
        Assert.Equal(new DateTime(anio, mes, dia), fecha.Date);
    }

    [Fact]
    public void ElDesglosePorMes_NoMueveLosPrimerosDiasDeSetiembreAEnero()
    {
        var rows = new List<Dictionary<string, object?>>
        {
            new() { ["Fecha"] = "01/09/2026", ["Subtotal"] = 10m },
            new() { ["Fecha"] = "05/09/2026", ["Subtotal"] = 20m },
            new() { ["Fecha"] = "25/09/2026", ["Subtotal"] = 30m }
        };

        var result = GastosAnalysisService.BuildMonthBreakdown(rows, "Subtotal");

        Assert.Single(result);
        Assert.Equal(3, result[0]["Registros"]);
        Assert.Equal(60m, result[0]["Subtotal"]);
    }

    [Fact]
    public void SinColumnaSubtotalSoles_NoSeInventaElEquivalente()
    {
        var rows = new List<Dictionary<string, object?>>
        {
            new() { ["Fecha"] = "01/09/2026", ["Cliente"] = "AMX", ["Moneda"] = "SOLES", ["Subtotal"] = 100m }
        };

        var result = GastosAnalysisService.BuildClientCurrencyBreakdown(rows);

        Assert.Single(result);
        Assert.False(result[0].ContainsKey("SubtotalSolesEquivalente"));
    }

    [Fact]
    public void ElPayloadDelAnalisis_IncluyeLosDesglosesClienteMonedaYFechaMoneda()
    {
        var payload = GastosAnalysisService.BuildOpenAiAnalysisPayload(
            "gastos por cliente y moneda para el mes de setiembre 2026", new BuscarPlanillaArgs(), Rows(), 4,
            new Dictionary<string, object?>(), new Dictionary<string, object?>());

        using var json = JsonDocument.Parse(JsonSerializer.Serialize(payload));
        var breakdowns = json.RootElement.GetProperty("breakdowns");

        Assert.Equal(3, breakdowns.GetProperty("clientCurrency").GetArrayLength());
        Assert.Equal(3, breakdowns.GetProperty("dateCurrency").GetArrayLength());
        // Con mas de una moneda no se entrega un total consolidado (regla vigente): cada moneda va separada.
        Assert.True(json.RootElement.GetProperty("hasMultipleCurrencies").GetBoolean());
        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("totalAmount").ValueKind);
    }
}
