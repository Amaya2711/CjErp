using CjERP.Application.Interfaces.Services.AI;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// PRUEBAS SINTETICAS (sin SQL): validacion de la fabrica de alcance, que es la primera barrera
/// antes de enviar parametros al SP. La validacion equivalente del SP se revisa en
/// IaScopedSpScriptContractTests (estatica) y requiere integracion real contra SQL Server.
/// </summary>
[Trait("Category", "Unit")]
public sealed class IaResolvedScopeTests
{
    [Fact]
    public void ForTotal_NoLlevaIdentificadoresNiCampos()
    {
        var scope = IaResolvedScope.ForTotal(canViewGlobalTotals: false);

        Assert.Equal(IaScopeLevel.Total, scope.Level);
        Assert.False(scope.IsRestricted);
        Assert.Empty(scope.EmployeeIds);
        Assert.Equal("TOTAL", scope.SqlNivel);
        Assert.Null(scope.SqlCampos);
        Assert.Null(scope.SqlEmpleados);
        Assert.False(scope.CanViewGlobalTotals);
    }

    [Fact]
    public void ForRestricted_OrdenaYDeduplicaIdentificadores()
    {
        var scope = IaResolvedScope.ForRestricted(
            IaScopeLevel.Equipo, IaScopeFields.ResponsableOSolicitante, [30, 10, 30, 20], true);

        Assert.Equal([10, 20, 30], scope.EmployeeIds);
        Assert.Equal("10,20,30", scope.SqlEmpleados);
        Assert.Equal("RESTRINGIDO", scope.SqlNivel);
        Assert.Equal("RS", scope.SqlCampos);
        Assert.True(scope.CanViewGlobalTotals);
    }

    [Theory]
    [InlineData(IaScopeFields.Responsable, "R")]
    [InlineData(IaScopeFields.Solicitante, "S")]
    [InlineData(IaScopeFields.ResponsableOSolicitante, "RS")]
    public void ForRestricted_MapeaCamposAlCodigoDelSp(IaScopeFields fields, string expected)
    {
        var scope = IaResolvedScope.ForRestricted(IaScopeLevel.Propio, fields, [5], false);
        Assert.Equal(expected, scope.SqlCampos);
    }

    [Fact]
    public void ForRestricted_NivelTotal_SeRechaza() =>
        Assert.Throws<ArgumentException>(() =>
            IaResolvedScope.ForRestricted(IaScopeLevel.Total, IaScopeFields.Responsable, [1], false));

    [Fact]
    public void ForRestricted_NivelNoDefinido_SeRechaza() =>
        Assert.Throws<ArgumentException>(() =>
            IaResolvedScope.ForRestricted((IaScopeLevel)0, IaScopeFields.Responsable, [1], false));

    [Theory]
    [InlineData(IaScopeFields.None)]
    [InlineData((IaScopeFields)8)]
    public void ForRestricted_CamposInvalidos_SeRechazan(IaScopeFields fields) =>
        Assert.Throws<ArgumentException>(() =>
            IaResolvedScope.ForRestricted(IaScopeLevel.Propio, fields, [1], false));

    [Fact]
    public void ForRestricted_ListaVacia_SeRechaza() =>
        Assert.Throws<ArgumentException>(() =>
            IaResolvedScope.ForRestricted(IaScopeLevel.Propio, IaScopeFields.Responsable, [], false));

    [Theory]
    [InlineData(0)]
    [InlineData(-4)]
    public void ForRestricted_IdentificadorNoPositivo_SeRechaza(int id) =>
        Assert.Throws<ArgumentException>(() =>
            IaResolvedScope.ForRestricted(IaScopeLevel.Propio, IaScopeFields.Responsable, [1, id], false));

    [Fact]
    public void ForRestricted_Nulo_SeRechaza() =>
        Assert.Throws<ArgumentNullException>(() =>
            IaResolvedScope.ForRestricted(IaScopeLevel.Propio, IaScopeFields.Responsable, null!, false));

    [Fact]
    public void ForRestricted_MasDelMaximo_SeRechaza()
    {
        var tooMany = Enumerable.Range(1, IaResolvedScope.MaxEmployeeIds + 1);
        Assert.Throws<ArgumentException>(() =>
            IaResolvedScope.ForRestricted(IaScopeLevel.Equipo, IaScopeFields.ResponsableOSolicitante, tooMany, false));
    }

    [Fact]
    public void ForRestricted_ExactamenteElMaximo_SeAcepta()
    {
        var scope = IaResolvedScope.ForRestricted(
            IaScopeLevel.Equipo, IaScopeFields.ResponsableOSolicitante, Enumerable.Range(1, IaResolvedScope.MaxEmployeeIds), false);
        Assert.Equal(IaResolvedScope.MaxEmployeeIds, scope.EmployeeIds.Count);
    }

    [Fact]
    public void Fingerprint_CambiaConCualquierComponenteDelAlcance()
    {
        var baseScope = IaResolvedScope.ForRestricted(IaScopeLevel.Equipo, IaScopeFields.ResponsableOSolicitante, [1, 2], false);
        var sameScope = IaResolvedScope.ForRestricted(IaScopeLevel.Equipo, IaScopeFields.ResponsableOSolicitante, [2, 1], false);
        var otherMember = IaResolvedScope.ForRestricted(IaScopeLevel.Equipo, IaScopeFields.ResponsableOSolicitante, [1, 3], false);
        var otherGlobals = IaResolvedScope.ForRestricted(IaScopeLevel.Equipo, IaScopeFields.ResponsableOSolicitante, [1, 2], true);
        var otherFields = IaResolvedScope.ForRestricted(IaScopeLevel.Equipo, IaScopeFields.Responsable, [1, 2], false);
        var otherLevel = IaResolvedScope.ForRestricted(IaScopeLevel.Propio, IaScopeFields.ResponsableOSolicitante, [1, 2], false);

        Assert.Equal(baseScope.Fingerprint, sameScope.Fingerprint);
        Assert.NotEqual(baseScope.Fingerprint, otherMember.Fingerprint);
        Assert.NotEqual(baseScope.Fingerprint, otherGlobals.Fingerprint);
        Assert.NotEqual(baseScope.Fingerprint, otherFields.Fingerprint);
        Assert.NotEqual(baseScope.Fingerprint, otherLevel.Fingerprint);
    }

    [Fact]
    public void AuthorizationResult_AllowSinAlcance_SeRechaza() =>
        Assert.Throws<ArgumentNullException>(() => IaAuthorizationResult.Allow(null!));

    [Fact]
    public void AuthorizationResult_Deny_NoTieneAlcance()
    {
        var result = IaAuthorizationResult.Deny("x");
        Assert.False(result.Allowed);
        Assert.Null(result.Scope);
        Assert.Equal("x", result.DenyReason);
    }
}
