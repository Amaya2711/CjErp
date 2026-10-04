using System.Text.Json;
using CjERP.Application.Interfaces.Services.AI;
using CjERP.Infrastructure.Services;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// PRUEBAS SINTETICAS de la ruta de resumen calculado en SQL (modo RESUMEN de sp_IA_Planilla_Buscar): deteccion de
/// dimensiones en la pregunta, parametros enviados al store y payload para el redactor. No ejecutan SQL.
/// </summary>
[Trait("Category", "Unit")]
public sealed class ResumenSqlRouteTests
{
    [Theory]
    [InlineData("gastos por cliente y moneda para el mes de setiembre 2026", "CLIENTE,MONEDA")]
    [InlineData("gastos por cliente, moneda y fecha", "CLIENTE,MONEDA,FECHA")]
    [InlineData("resumen de gastos por mes", "MES")]
    [InlineData("cuanto se gasto por site", "SITE")]
    [InlineData("gastos por responsable y estado", "RESPONSABLE,ESTADO")]
    [InlineData("gastos por tipo de pago", "TIPOPAGO")]
    [InlineData("gastos por moneda y por cliente", "MONEDA,CLIENTE")]
    public void DetectaLasDimensionesDeAgrupacion(string pregunta, string esperadas)
    {
        Assert.True(BuscarPlanillaQuestionHeuristics.TryResolveSummaryDimensions(pregunta, out var dimensions));
        Assert.Equal(esperadas.Split(','), dimensions);
    }

    [Theory]
    [InlineData("gastos pendientes de setiembre 2026")]
    [InlineData("gastos del cliente Claro")]
    [InlineData("gastos por aprobar")]                        // "por aprobar" no es una dimension
    [InlineData("detalle de gastos por cliente")]              // pide el detalle
    [InlineData("listado de gastos por moneda")]
    [InlineData("")]
    public void NoUsaElResumen_SiNoHayAgrupacionOSePideElDetalle(string pregunta)
    {
        Assert.False(BuscarPlanillaQuestionHeuristics.TryResolveSummaryDimensions(pregunta, out var dimensions));
        Assert.Empty(dimensions);
    }

    [Fact]
    public void LosParametrosDelResumen_AgreganElModoSinPerderElAlcance()
    {
        var args = new BuscarPlanillaArgs { Estados = "PAGADO", FechaInicio = new DateOnly(2026, 9, 1), FechaFin = new DateOnly(2026, 9, 30) }.Normalize();
        var scope = IaResolvedScope.ForTotal(canViewGlobalTotals: false);

        var parameters = GastosQueryExecutor.BuildResumenParameters(args, ["CLIENTE", "MONEDA"], top: 200, scope);

        Assert.Equal("RESUMEN", parameters.Get<string>("Modo"));
        Assert.Equal("CLIENTE,MONEDA", parameters.Get<string>("AgruparPor"));
        Assert.Equal(200, parameters.Get<int>("Top"));
        Assert.Equal("TOTAL", parameters.Get<string>("AlcanceNivel"));       // el alcance viaja igual que en el detalle
        Assert.Equal("PAGADO", parameters.Get<string>("Estados"));
        Assert.Equal("20260901", parameters.Get<string>("FechaInicio"));
    }

    [Fact]
    public void ElPayloadDelResumen_IncluyeGruposYTotalesPorMoneda_SinFilasDeDetalle()
    {
        var result = new PlanillaResumenExecutionResult
        {
            Groups = [new() { ["Cliente"] = "AMX", ["Moneda"] = "SOLES", ["Registros"] = 3 }],
            TotalsByCurrency =
            [
                new() { ["Moneda"] = "SOLES", ["Registros"] = 3 },
                new() { ["Moneda"] = "DOLARES", ["Registros"] = 1 }
            ],
            TotalRows = 4
        };

        var payload = GastosAnalysisService.BuildResumenAnalysisPayload(
            "gastos por cliente y moneda", new BuscarPlanillaArgs().Normalize(), ["CLIENTE", "MONEDA"], result,
            new Dictionary<string, object?>(), new Dictionary<string, object?>());

        using var json = JsonDocument.Parse(JsonSerializer.Serialize(payload));
        var root = json.RootElement;

        Assert.Equal("sql_summary", root.GetProperty("assumptions").GetProperty("analysisMode").GetString());
        Assert.Equal(4, root.GetProperty("totalRows").GetInt32());
        Assert.True(root.GetProperty("hasMultipleCurrencies").GetBoolean());
        Assert.Equal(2, root.GetProperty("totalsByCurrency").GetArrayLength());
        Assert.Equal(1, root.GetProperty("groups").GetArrayLength());
        Assert.False(root.TryGetProperty("detailSample", out _));
        Assert.False(root.TryGetProperty("topRecords", out _));
    }
}
