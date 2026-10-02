using System.Text.Json;
using CjERP.Infrastructure.Services;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// Tests directos (sin reflexion) contra las clases extraidas de IaChatService.cs en Fase 1.1:
/// IaPromptGuardrails, BuscarPlanillaArgsParser y BuscarPlanillaArgsFromMemory. Estas clases son
/// visibles desde este proyecto de tests gracias a InternalsVisibleTo en CjERP.Infrastructure.csproj.
///
/// BuscarPlanillaQuestionHeuristics (tambien extraida en Fase 1.1) ya tiene cobertura directa via
/// IaChatServiceReflection.BuildSearchArgsFromQuestion, que desde esta fase llama a
/// BuscarPlanillaQuestionHeuristics.BuildSearchArgsFromQuestion sin pasar por reflexion.
/// </summary>
[Trait("Category", "Unit")]
public sealed class ExtractedGastosClassesDirectTests
{
    [Fact]
    public void IaPromptGuardrails_ContainsProhibitedSqlIntent_LlamadaDirectaSinReflexion()
    {
        Assert.True(IaPromptGuardrails.ContainsProhibitedSqlIntent("por favor haz un DROP TABLE Planilla"));
        Assert.False(IaPromptGuardrails.ContainsProhibitedSqlIntent("cuanto se ha pagado este mes"));
    }

    [Fact]
    public void BuscarPlanillaArgsParser_ParseBuscarPlanillaArgs_MapeaCamposDesdeJson()
    {
        using var document = JsonDocument.Parse("""
            {
                "cliente": "Claro",
                "proyecto": "Backbone Norte",
                "estados": "PENDIENTE",
                "tamanoPagina": 25,
                "pagina": 2
            }
            """);

        var args = BuscarPlanillaArgsParser.ParseBuscarPlanillaArgs(document.RootElement);

        Assert.Equal("Claro", args.Cliente);
        Assert.Equal("Backbone Norte", args.Proyecto);
        Assert.Equal("PENDIENTE", args.Estados);
        Assert.Equal(25, args.TamanoPagina);
        Assert.Equal(2, args.Pagina);
        Assert.False(args.EstadosAplicadosPorDefecto);
    }

    [Fact]
    public void BuscarPlanillaArgsParser_ParseBuscarPlanillaArgs_ConInputNulo_DevuelveArgsPorDefecto()
    {
        var args = BuscarPlanillaArgsParser.ParseBuscarPlanillaArgs(null);

        Assert.Equal("PAGADO", args.Estados);
        Assert.True(args.EstadosAplicadosPorDefecto);
        Assert.Equal(50, args.TamanoPagina);
    }

    [Fact]
    public void BuscarPlanillaArgsParser_ParseBuscarPlanillaArgs_TamanoPaginaFueraDeRango_SeAjustaAlLimite()
    {
        using var document = JsonDocument.Parse("""{ "tamanoPagina": 999999 }""");

        var args = BuscarPlanillaArgsParser.ParseBuscarPlanillaArgs(document.RootElement);

        Assert.Equal(20000, args.TamanoPagina); // MaxPageSize (IaChatSharedDefaults.MaxPageSize)
    }

    [Fact]
    public void BuscarPlanillaArgsFromMemory_BuildArgsFromToolParameters_ConDiccionarioVacio_DevuelveNull()
    {
        Assert.Null(BuscarPlanillaArgsFromMemory.BuildArgsFromToolParameters(null));
        Assert.Null(BuscarPlanillaArgsFromMemory.BuildArgsFromToolParameters([]));
    }

    [Fact]
    public void BuscarPlanillaArgsFromMemory_BuildArgsFromToolParameters_MapeaCamposDesdeDiccionario()
    {
        var toolParameters = new Dictionary<string, object?>
        {
            ["cliente"] = "Entel",
            ["estados"] = "PAGADO",
            ["coincidirTodas"] = true
        };

        var args = BuscarPlanillaArgsFromMemory.BuildArgsFromToolParameters(toolParameters);

        Assert.NotNull(args);
        Assert.Equal("Entel", args!.Cliente);
        Assert.Equal("PAGADO", args.Estados);
        Assert.True(args.CoincidirTodas);
    }
}
