using CjERP.Infrastructure.Services;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// Tests directos (sin reflexion) de GastosAnalysisService (Fase 1.3), extraido de IaChatService.cs.
/// AggregateRowsByField/BuildChart siguen cubiertos por ChartAndAggregationTests.cs (via
/// IaChatServiceReflection, que ahora delega en esta clase); aqui se agrega cobertura directa nueva
/// para funciones puras que antes no tenian ningun test propio.
/// </summary>
[Trait("Category", "Unit")]
public sealed class GastosAnalysisServiceDirectTests
{
    private static List<Dictionary<string, object?>> FixtureRows() =>
    [
        new() { ["Cliente"] = "Claro", ["Subtotal"] = 1000m, ["Estado"] = "PAGADO" },
        new() { ["Cliente"] = "Entel", ["Subtotal"] = 500m, ["Estado"] = "PENDIENTE" }
    ];

    [Fact]
    public void BuildDetailAnswer_SinFilas_DevuelveMensajeSinResultados()
    {
        var answer = GastosAnalysisService.BuildDetailAnswer([], 0, new BuscarPlanillaArgs());

        Assert.Equal("No se encontraron registros para los filtros indicados.", answer);
    }

    [Fact]
    public void BuildDetailAnswer_ConFilas_IncluyeConteoYVistaPrevia()
    {
        var answer = GastosAnalysisService.BuildDetailAnswer(FixtureRows(), 2, new BuscarPlanillaArgs());

        Assert.Contains("Se encontraron 2 registros de detalle", answer);
        Assert.Contains("Vista previa", answer);
    }

    [Fact]
    public void ResolveExpenseField_ConSubtotal_DevuelveSubtotal()
    {
        var field = GastosAnalysisService.ResolveExpenseField(FixtureRows());

        Assert.Equal("Subtotal", field);
    }

    [Fact]
    public void ResolveExpenseField_SinCampoConocido_DevuelveNull()
    {
        var rows = new List<Dictionary<string, object?>> { new() { ["Otro"] = 1 } };

        Assert.Null(GastosAnalysisService.ResolveExpenseField(rows));
    }

    [Fact]
    public void ResolveValueField_PriorizaSubtotalSobreOtrosCampos()
    {
        var rows = new List<Dictionary<string, object?>>
        {
            new() { ["Subtotal"] = 100m, ["Total"] = 999m }
        };

        // HALLAZGO DOCUMENTADO (no es un bug a corregir en Fase 1.3): la comparacion es case-insensitive,
        // pero el metodo devuelve el candidato tal cual esta escrito en su lista "preferred" interna
        // ("SubTotal", con T mayuscula) y no la grafia real de la fila ("Subtotal").
        Assert.Equal("SubTotal", GastosAnalysisService.ResolveValueField(rows));
    }

    [Theory]
    [InlineData("Monto", true)]
    [InlineData("Ventas", true)]
    [InlineData("Cliente", false)]
    public void IsNumericField_IdentificaCamposMonetariosConocidos(string key, bool esperado)
    {
        Assert.Equal(esperado, GastosAnalysisService.IsNumericField(key));
    }

    [Fact]
    public void BuildScopeText_ConFiltrosExplicitos_ArmaTextoLegible()
    {
        var args = new BuscarPlanillaArgs { Cliente = "Claro", Estados = "PAGADO" };

        var scope = GastosAnalysisService.BuildScopeText(args);

        Assert.Contains("con estados PAGADO", scope);
    }

    [Fact]
    public void BuildScopeText_SinFiltros_DevuelveVacio()
    {
        Assert.Equal(string.Empty, GastosAnalysisService.BuildScopeText(new BuscarPlanillaArgs()));
    }

    [Fact]
    public void ShouldCompareVentasAndGastos_RequiereAmbosCamposYMencionDeComparacion()
    {
        var rows = new List<Dictionary<string, object?>>
        {
            new() { ["Ventas"] = 100m, ["Subtotal"] = 80m }
        };

        Assert.True(GastosAnalysisService.ShouldCompareVentasAndGastos("comparar ventas vs gastos", rows));
        Assert.False(GastosAnalysisService.ShouldCompareVentasAndGastos("cuanto se vendio", rows));
    }
}
