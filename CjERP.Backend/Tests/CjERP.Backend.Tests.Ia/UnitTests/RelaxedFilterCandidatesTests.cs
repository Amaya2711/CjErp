using CjERP.Infrastructure.Services;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>Regla 2026-10-23: sin resultados por el valor completo, se busca por coincidencia (palabra a palabra) y se agrupa por el campo.</summary>
[Trait("Category", "Unit")]
public sealed class RelaxedFilterCandidatesTests
{
    [Fact]
    public void Site_DeVariasPalabras_GeneraUnCandidatoPorPalabra_LaMasLargaPrimero()
    {
        var args = new BuscarPlanillaArgs { Site = "PU_HUAYCUYO_GRANDE" }.Normalize();

        var candidates = BuscarPlanillaQuestionHeuristics.BuildRelaxedFilterCandidates(args);

        Assert.Equal(new[] { "HUAYCUYO", "GRANDE" }, candidates.Select(c => c.Palabra));
        Assert.All(candidates, c => Assert.Equal("SITE", c.Dimension));
        Assert.Equal("HUAYCUYO", candidates[0].Args.Site);
    }

    [Fact]
    public void ValorDeUnaSolaPalabra_NoReintenta()
    {
        var args = new BuscarPlanillaArgs { Site = "HUAYCUYO" }.Normalize();

        Assert.Empty(BuscarPlanillaQuestionHeuristics.BuildRelaxedFilterCandidates(args));
    }

    [Fact]
    public void Cliente_DeVariasPalabras_AgrupaPorCliente_YConservaLosDemasFiltros()
    {
        var args = new BuscarPlanillaArgs { Cliente = "AMERICA MOVIL PERU", Proyecto = "Cano" }.Normalize();

        var candidates = BuscarPlanillaQuestionHeuristics.BuildRelaxedFilterCandidates(args);

        Assert.All(candidates, c => Assert.Equal("CLIENTE", c.Dimension));
        Assert.All(candidates, c => Assert.Equal("Cano", c.Args.Proyecto));
        Assert.Equal("AMERICA", candidates[0].Palabra.ToUpperInvariant());
    }

    [Fact]
    public void CodigoDeSite_SinResultados_SeReintentaComoNombre()
    {
        var args = new BuscarPlanillaArgs { IdSite = "LIM001" }.Normalize();

        var candidate = Assert.Single(BuscarPlanillaQuestionHeuristics.BuildRelaxedFilterCandidates(args));

        Assert.Equal("LIM001", candidate.Args.Site);
        Assert.Null(candidate.Args.IdSite);
    }
}
