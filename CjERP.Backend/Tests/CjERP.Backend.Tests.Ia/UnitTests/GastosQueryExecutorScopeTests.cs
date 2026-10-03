using CjERP.Application.Interfaces.Services.AI;
using CjERP.Backend.Tests.Ia.TestSupport;
using CjERP.Infrastructure.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// PRUEBAS SINTETICAS: construccion de parametros y guardas del ejecutor con alcance obligatorio.
/// No ejecutan el SP: ISqlCommandFactory devuelve un SqlConnection concreto (ver FakeSqlCommandFactory),
/// asi que la ejecucion real contra sp_IA_Planilla_Buscar queda como prueba de INTEGRACION pendiente.
/// </summary>
[Trait("Category", "Unit")]
public sealed class GastosQueryExecutorScopeTests
{
    [Fact]
    public void ConAlcanceRestringido_EnviaLosCuatroParametrosDeAlcance()
    {
        var scope = IaResolvedScope.ForRestricted(
            IaScopeLevel.Equipo, IaScopeFields.ResponsableOSolicitante, [12, 7, 7], false);

        var parameters = GastosQueryExecutor.BuildParameters(new BuscarPlanillaArgs(), scope);

        Assert.Equal("RESTRINGIDO", parameters.Get<string>("@AlcanceNivel"));
        Assert.Equal("RS", parameters.Get<string>("@AlcanceCampos"));
        Assert.Equal("7,12", parameters.Get<string>("@AlcanceEmpleados"));
        Assert.False(parameters.Get<bool>("@VerTotalesGlobales"));
    }

    [Fact]
    public void ConAlcanceTotal_NoEnviaCamposNiEmpleados_YPropagaElPermisoDeTotales()
    {
        var parameters = GastosQueryExecutor.BuildParameters(new BuscarPlanillaArgs(), IaResolvedScope.ForTotal(true));

        Assert.Equal("TOTAL", parameters.Get<string>("@AlcanceNivel"));
        Assert.Null(parameters.Get<string?>("@AlcanceCampos"));
        Assert.Null(parameters.Get<string?>("@AlcanceEmpleados"));
        Assert.True(parameters.Get<bool>("@VerTotalesGlobales"));
    }

    [Fact]
    public void FiltrosDelUsuario_NoReemplazanNiAlteranElAlcance()
    {
        // Un LLM/usuario que pide otro responsable solo agrega un filtro de texto; el alcance sigue intacto.
        var args = new BuscarPlanillaArgs { Responsable = "OTRA PERSONA", Solicitante = "' OR 1=1 --" };
        var scope = IaResolvedScope.ForRestricted(IaScopeLevel.Propio, IaScopeFields.ResponsableOSolicitante, [7], false);

        var parameters = GastosQueryExecutor.BuildParameters(args, scope);

        Assert.Equal("7", parameters.Get<string>("@AlcanceEmpleados"));
        Assert.Equal("RESTRINGIDO", parameters.Get<string>("@AlcanceNivel"));
        Assert.Equal("OTRA PERSONA", parameters.Get<string>("@Responsable"));
    }

    [Fact]
    public void RutaHeredadaSinAlcance_NoAgregaParametrosDeAlcance()
    {
        var parameters = GastosQueryExecutor.BuildParameters(new BuscarPlanillaArgs(), scope: null);

        Assert.DoesNotContain("AlcanceNivel", parameters.ParameterNames);
        Assert.DoesNotContain("AlcanceCampos", parameters.ParameterNames);
        Assert.DoesNotContain("AlcanceEmpleados", parameters.ParameterNames);
        Assert.DoesNotContain("VerTotalesGlobales", parameters.ParameterNames);
        Assert.Contains("TextoBusqueda", parameters.ParameterNames);
    }

    [Fact]
    public async Task SinAlcance_FallaAntesDeTocarSql()
    {
        // NeverCalled lanza si alguien intenta abrir una conexion: la guarda debe saltar antes.
        var executor = new GastosQueryExecutor(
            FakeSqlCommandFactory.NeverCalled(),
            NullLogger<GastosQueryExecutor>.Instance);

        await Assert.ThrowsAsync<ArgumentNullException>(() =>
            executor.EjecutarBuscarPlanillaConAlcanceAsync(new BuscarPlanillaArgs(), scope: null!, CancellationToken.None));
    }

    [Fact]
    public async Task SinArgumentos_FallaAntesDeTocarSql()
    {
        var executor = new GastosQueryExecutor(
            FakeSqlCommandFactory.NeverCalled(),
            NullLogger<GastosQueryExecutor>.Instance);

        await Assert.ThrowsAsync<ArgumentNullException>(() =>
            executor.EjecutarBuscarPlanillaConAlcanceAsync(null!, IaResolvedScope.ForTotal(false), CancellationToken.None));
    }
}
