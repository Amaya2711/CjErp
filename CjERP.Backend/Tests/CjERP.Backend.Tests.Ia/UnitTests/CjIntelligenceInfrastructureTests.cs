using System.Security.Claims;
using CjERP.Application.Interfaces.Services.AI;
using CjERP.Infrastructure.Services;
using CjERP.Infrastructure.Services.AI.CjIntelligence;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// CJ Intelligence: logica que NO depende de una base de datos: interpretacion de permisos y empleados, errores del acceso a
/// datos, latido del bloqueo, identidad del JWT y verificacion de lo aplicado por SQL.
/// </summary>
[Trait("Category", "Unit")]
public sealed class CjIntelligenceInfrastructureTests
{
    // ------------------------------------------------------------------ permisos y empleados

    private sealed class FakeData : ICjIntelligenceAuthorizationData
    {
        public IReadOnlyList<CjPermissionRow>? Permissions { get; set; } = [];
        public IReadOnlyList<int>? Employees { get; set; } = [10];
        public IReadOnlyList<int>? Team { get; set; } = [];
        public Exception? Throws { get; set; }
        public int PermissionCalls { get; private set; }
        public int EmployeeCalls { get; private set; }
        public List<(string User, string Tool)> PermissionArgs { get; } = [];

        public Task<IReadOnlyList<CjPermissionRow>> GetPermissionRowsAsync(string idUsuario, string toolName, CancellationToken ct)
        {
            PermissionCalls++;
            PermissionArgs.Add((idUsuario, toolName));
            return Throws is null ? Task.FromResult(Permissions!) : Task.FromException<IReadOnlyList<CjPermissionRow>>(Throws);
        }

        public Task<IReadOnlyList<int>> GetEmployeeIdsAsync(string idUsuario, CancellationToken ct)
        {
            EmployeeCalls++;
            return Throws is null ? Task.FromResult(Employees!) : Task.FromException<IReadOnlyList<int>>(Throws);
        }

        public Task<IReadOnlyList<int>> GetTeamIdsAsync(int idEmpleadoCj, CancellationToken ct) =>
            Throws is null ? Task.FromResult(Team!) : Task.FromException<IReadOnlyList<int>>(Throws);
    }

    private static CjIntelligencePermissionStore Store(FakeData data) => new(data, NullLogger<CjIntelligencePermissionStore>.Instance);

    [Theory]
    [InlineData(null, "buscar_planilla")]
    [InlineData("", "buscar_planilla")]
    [InlineData("  ", "buscar_planilla")]
    [InlineData("jperez", null)]
    [InlineData("jperez", " ")]
    public async Task Permisos_ArgumentosEnBlanco_NoConsultanYNoConceden(string? user, string? tool)
    {
        var data = new FakeData();
        var grants = await Store(data).GetActiveGrantsAsync(user!, tool!, CancellationToken.None);

        Assert.Empty(grants);
        Assert.Equal(0, data.PermissionCalls);
    }

    [Fact]
    public async Task Permisos_InterpretaNivelesSinImportarMayusculasNiEspacios()
    {
        var data = new FakeData
        {
            Permissions = [new CjPermissionRow(" propio ", false), new CjPermissionRow("EQUIPO", true), new CjPermissionRow("Total", false)]
        };

        var grants = await Store(data).GetActiveGrantsAsync(" jperez ", " buscar_planilla ", CancellationToken.None);

        Assert.Equal(
            new[] { (IaScopeLevel.Propio, false), (IaScopeLevel.Equipo, true), (IaScopeLevel.Total, false) },
            grants.Select(g => (g.Level!.Value, g.GlobalTotals)).ToArray());
        Assert.Equal(("jperez", "buscar_planilla"), data.PermissionArgs[0]);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("SUPERADMIN")]
    [InlineData("TOTALES")]
    public async Task Permisos_NivelDesconocidoONulo_SeDescartaConSuPermisoDeTotales(string? level)
    {
        var data = new FakeData { Permissions = [new CjPermissionRow(level, true)] };

        var grants = await Store(data).GetActiveGrantsAsync("jperez", "buscar_planilla", CancellationToken.None);

        Assert.Empty(grants);
    }

    [Fact]
    public async Task Permisos_ListaNulaOFilaNula_NoConcedeNiLanza()
    {
        var nula = new FakeData { Permissions = null };
        var conFilaNula = new FakeData { Permissions = [null!, new CjPermissionRow("PROPIO", false)] };

        Assert.Empty(await Store(nula).GetActiveGrantsAsync("jperez", "buscar_planilla", CancellationToken.None));
        Assert.Single(await Store(conFilaNula).GetActiveGrantsAsync("jperez", "buscar_planilla", CancellationToken.None));
    }

    [Fact]
    public async Task Permisos_ErrorDeAcceso_SePropagaYElServicioDeAutorizacionDeniega()
    {
        var data = new FakeData { Throws = new TimeoutException("sql") };
        await Assert.ThrowsAsync<TimeoutException>(() => Store(data).GetActiveGrantsAsync("jperez", "buscar_planilla", CancellationToken.None));

        var service = new IaAuthorizationService(Store(data), new CjIntelligenceEmployeeDirectory(data), NullLogger<IaAuthorizationService>.Instance);
        var decision = await new CjIntelligenceScopeResolver(service, NullLogger<CjIntelligenceScopeResolver>.Instance)
            .ResolveAsync("jperez", CancellationToken.None);

        Assert.False(decision.Allowed);
        Assert.Null(decision.Scope);
    }

    [Fact]
    public async Task Empleado_UnoPositivo_SeResuelve()
    {
        var directory = new CjIntelligenceEmployeeDirectory(new FakeData { Employees = [42] });
        Assert.Equal(42, await directory.ResolveEmpleadoCjAsync("jperez", CancellationToken.None));
    }

    [Fact]
    public async Task Empleado_RepetidoIgual_SeTrataComoUnico()
    {
        var directory = new CjIntelligenceEmployeeDirectory(new FakeData { Employees = [42, 42] });
        Assert.Equal(42, await directory.ResolveEmpleadoCjAsync("jperez", CancellationToken.None));
    }

    [Theory]
    [MemberData(nameof(EmpleadosNoResueltos))]
    public async Task Empleado_NingunoAmbiguoONoPositivo_NoSeResuelve(int[]? ids)
    {
        var directory = new CjIntelligenceEmployeeDirectory(new FakeData { Employees = ids });
        Assert.Null(await directory.ResolveEmpleadoCjAsync("jperez", CancellationToken.None));
    }

    public static IEnumerable<object?[]> EmpleadosNoResueltos() =>
    [
        [Array.Empty<int>()],
        [new[] { 1, 2 }],
        [new[] { 0 }],
        [new[] { -5 }],
        [null]
    ];

    [Fact]
    public async Task Empleado_UsuarioEnBlanco_NoConsulta()
    {
        var data = new FakeData();
        Assert.Null(await new CjIntelligenceEmployeeDirectory(data).ResolveEmpleadoCjAsync("  ", CancellationToken.None));
        Assert.Equal(0, data.EmployeeCalls);
    }

    [Fact]
    public async Task Equipo_FiltraNoPositivosDuplicadosYElTitular()
    {
        var directory = new CjIntelligenceEmployeeDirectory(new FakeData { Team = [12, 0, -1, 11, 12, 10] });

        var team = await directory.GetDirectReportsAsync(10, CancellationToken.None);

        Assert.Equal(new[] { 11, 12 }, team);
    }

    [Fact]
    public async Task Equipo_TitularInvalidoOListaNula_DevuelveVacio()
    {
        Assert.Empty(await new CjIntelligenceEmployeeDirectory(new FakeData()).GetDirectReportsAsync(0, CancellationToken.None));
        Assert.Empty(await new CjIntelligenceEmployeeDirectory(new FakeData { Team = null }).GetDirectReportsAsync(10, CancellationToken.None));
    }

    [Fact]
    public async Task Composicion_PropioConEmpleadoAmbiguo_Deniega_YEquipoLimpiaLaLista()
    {
        var ambiguo = new FakeData { Permissions = [new CjPermissionRow("PROPIO", false)], Employees = [1, 2] };
        var s1 = new IaAuthorizationService(Store(ambiguo), new CjIntelligenceEmployeeDirectory(ambiguo), NullLogger<IaAuthorizationService>.Instance);
        var d1 = await new CjIntelligenceScopeResolver(s1, NullLogger<CjIntelligenceScopeResolver>.Instance).ResolveAsync("jperez", CancellationToken.None);
        Assert.False(d1.Allowed);

        var equipo = new FakeData { Permissions = [new CjPermissionRow("EQUIPO", false)], Employees = [10], Team = [11, 0, 10, 12] };
        var s2 = new IaAuthorizationService(Store(equipo), new CjIntelligenceEmployeeDirectory(equipo), NullLogger<IaAuthorizationService>.Instance);
        var d2 = await new CjIntelligenceScopeResolver(s2, NullLogger<CjIntelligenceScopeResolver>.Instance).ResolveAsync("jperez", CancellationToken.None);
        Assert.Equal(new[] { 10, 11, 12 }, d2.Scope!.EmployeeIds);
    }

    [Fact]
    public async Task UsuarioInactivoOInexistente_SqlNoDevuelveFilas_ElAlcanceSeDeniega_AunqueConserveRolesYPermisos()
    {
        // sp_IA_Cj_Autorizacion_* devuelven CERO filas cuando fn_IA_Cj_UsuarioValido es NULL (usuario inexistente, IdEstado 0 o NULL):
        // sin concesiones y sin empleado el resultado es denegacion, nunca un alcance por defecto.
        var data = new FakeData { Permissions = [], Employees = [], Team = [] };
        var service = new IaAuthorizationService(Store(data), new CjIntelligenceEmployeeDirectory(data), NullLogger<IaAuthorizationService>.Instance);

        var decision = await new CjIntelligenceScopeResolver(service, NullLogger<CjIntelligenceScopeResolver>.Instance)
            .ResolveAsync("inactivo", CancellationToken.None);

        Assert.False(decision.Allowed);
        Assert.Null(decision.Scope);
        Assert.Equal(IaAuthorizationService.DenyNoRowScope, decision.DenyReason);
    }

    // ------------------------------------------------------------------ latido del bloqueo

    private static async Task WaitFor(Func<bool> condition, int timeoutMs = 5000)
    {
        var until = DateTime.UtcNow.AddMilliseconds(timeoutMs);
        while (!condition())
        {
            if (DateTime.UtcNow > until) throw new TimeoutException("La condicion esperada no se cumplio a tiempo.");
            await Task.Delay(5);
        }
    }

    private static CjIntelligenceTurnLease NewLease(Func<CancellationToken, Task<bool>> renew, SemaphoreSlim gate) =>
        new(renew, TimeSpan.FromSeconds(40), null, (_, ct) => gate.WaitAsync(ct));

    [Fact]
    public async Task Latido_RenuevaEnCadaTick_YNoSeCancelaMientrasSigaSiendoPropietaria()
    {
        var gate = new SemaphoreSlim(0);
        var calls = 0;
        await using var lease = NewLease(_ => { Interlocked.Increment(ref calls); return Task.FromResult(true); }, gate);
        lease.Start();

        gate.Release(); await WaitFor(() => calls == 1);
        gate.Release(); await WaitFor(() => calls == 2);

        Assert.False(lease.Lost);
        Assert.False(lease.Token.IsCancellationRequested);
        lease.ThrowIfLost();
    }

    [Fact]
    public async Task Latido_SiLaRenovacionDiceQueSePerdio_CancelaElTokenYNoSigueRenovando()
    {
        var gate = new SemaphoreSlim(0);
        var calls = 0;
        await using var lease = NewLease(_ => { Interlocked.Increment(ref calls); return Task.FromResult(false); }, gate);
        lease.Start();

        gate.Release(); await WaitFor(() => lease.Lost);

        Assert.True(lease.Token.IsCancellationRequested);
        gate.Release(); await Task.Delay(50);
        Assert.Equal(1, calls);
        Assert.Throws<CjIntelligenceLockLostException>(lease.ThrowIfLost);
    }

    [Fact]
    public async Task Latido_UnFalloAislado_SeTolera_PeroDosSeguidos_SePierdeElBloqueo()
    {
        var gate = new SemaphoreSlim(0);
        var script = new Queue<Func<Task<bool>>>(
        [
            () => throw new TimeoutException("sql"),
            () => Task.FromResult(true),
            () => throw new TimeoutException("sql"),
            () => throw new TimeoutException("sql")
        ]);
        var calls = 0;
        await using var lease = NewLease(_ => { Interlocked.Increment(ref calls); return script.Dequeue()(); }, gate);
        lease.Start();

        gate.Release(); await WaitFor(() => calls == 1);
        await Task.Delay(30); Assert.False(lease.Lost);
        gate.Release(); await WaitFor(() => calls == 2);
        gate.Release(); await WaitFor(() => calls == 3);
        await Task.Delay(30); Assert.False(lease.Lost);          // el exito anterior reinicio la cuenta
        gate.Release(); await WaitFor(() => lease.Lost);

        Assert.True(lease.Token.IsCancellationRequested);
        Assert.Equal(4, calls);
    }

    [Fact]
    public async Task Latido_Liberar_DetieneLaRenovacion_SinMarcarPerdida()
    {
        var gate = new SemaphoreSlim(0);
        var calls = 0;
        var lease = NewLease(_ => { Interlocked.Increment(ref calls); return Task.FromResult(true); }, gate);
        lease.Start();
        await lease.DisposeAsync();

        gate.Release(); await Task.Delay(50);

        Assert.Equal(0, calls);
        Assert.False(lease.Lost);
    }

    [Fact]
    public async Task Latido_CancelacionExterna_DetieneSinMarcarPerdida()
    {
        var gate = new SemaphoreSlim(0);
        var calls = 0;
        using var external = new CancellationTokenSource();
        await using var lease = NewLease(_ => { Interlocked.Increment(ref calls); return Task.FromResult(true); }, gate);
        lease.Start(external.Token);

        external.Cancel();
        gate.Release(); await Task.Delay(50);

        Assert.Equal(0, calls);
        Assert.False(lease.Lost);
    }

    [Fact]
    public async Task Latido_NoSePuedeIniciarDosVeces_NiConIntervaloNoPositivo()
    {
        var gate = new SemaphoreSlim(0);
        await using var lease = NewLease(_ => Task.FromResult(true), gate);
        lease.Start();
        Assert.Throws<InvalidOperationException>(() => lease.Start());
        Assert.Throws<ArgumentOutOfRangeException>(() => new CjIntelligenceTurnLease(_ => Task.FromResult(true), TimeSpan.Zero));
    }

    // ------------------------------------------------------------------ identidad del JWT

    private static ClaimsPrincipal Principal(params (string Type, string Value)[] claims) =>
        new(new ClaimsIdentity(claims.Select(c => new Claim(c.Type, c.Value)), "test"));

    [Fact]
    public void Identidad_LeeSoloElClaimIdUsuario_Recortado()
    {
        Assert.True(CjIntelligenceIdentity.TryGetLogin(Principal(("IdUsuario", "  jperez  ")), out var login));
        Assert.Equal("jperez", login);
    }

    [Fact]
    public void Identidad_SinClaim_NoRecurreAIdentityName()
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Name, "jperez")], "test"));
        Assert.False(CjIntelligenceIdentity.TryGetLogin(principal, out var login));
        Assert.Equal(string.Empty, login);
        Assert.False(CjIntelligenceIdentity.TryGetLogin(null, out _));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("juan\nperez")]
    [InlineData("juan\0perez")]
    public void Identidad_ValoresInvalidos_SeRechazan(string value)
    {
        Assert.False(CjIntelligenceIdentity.TryGetLogin(Principal(("IdUsuario", value)), out _));
    }

    [Fact]
    public void Identidad_MasLargaQueLaColumna_SeRechaza()
    {
        Assert.False(CjIntelligenceIdentity.TryGetLogin(Principal(("IdUsuario", new string('a', CjIntelligenceIdentity.MaxLength + 1))), out _));
        Assert.True(CjIntelligenceIdentity.TryGetLogin(Principal(("IdUsuario", new string('a', CjIntelligenceIdentity.MaxLength))), out _));
    }

    [Fact]
    public void Identidad_ClaimsContradictorios_SeRechazan_YRepetidosIguales_SeAceptan()
    {
        Assert.False(CjIntelligenceIdentity.TryGetLogin(Principal(("IdUsuario", "ana"), ("IdUsuario", "luis")), out _));
        Assert.True(CjIntelligenceIdentity.TryGetLogin(Principal(("IdUsuario", "ana"), ("IdUsuario", "ana")), out var login));
        Assert.Equal("ana", login);
    }

    // ------------------------------------------------------------------ verificacion de lo aplicado por SQL

    private static IaResolvedScope Equipo() =>
        IaResolvedScope.ForRestricted(IaScopeLevel.Equipo, IaScopeFields.ResponsableOSolicitante, [10, 11, 12], false);

    [Theory]
    [InlineData("EQUIPO", "10,11,12", true)]
    [InlineData("EQUIPO", " 12, 10 ,11 ", true)]
    [InlineData("EQUIPO", "10,11", false)]
    [InlineData("EQUIPO", "10,11,12,13", false)]
    [InlineData("EQUIPO", "10,11,x", false)]
    [InlineData("EQUIPO", "0,10,11,12", false)]
    [InlineData("EQUIPO", "-10,11,12", false)]
    [InlineData("EQUIPO", "", false)]
    [InlineData("EQUIPO", null, false)]
    [InlineData("PROPIO", "10,11,12", false)]
    [InlineData("TOTAL", "10,11,12", false)]
    [InlineData(null, "10,11,12", false)]
    [InlineData("equipo", "10,11,12", false)]
    public void Alcance_ComparaNivelYEmpleadosAplicadosConLosEsperados(string? nivel, string? lista, bool esperado)
    {
        Assert.Equal(esperado, CjIntelligenceScopeEvidence.Matches(Equipo(), nivel, lista));
    }

    [Fact]
    public void Alcance_Total_SoloCoincideSinLista_YPropioConUnEmpleado()
    {
        var total = IaResolvedScope.ForTotal(false);
        Assert.True(CjIntelligenceScopeEvidence.Matches(total, "TOTAL", null));
        Assert.True(CjIntelligenceScopeEvidence.Matches(total, "TOTAL", " "));
        Assert.False(CjIntelligenceScopeEvidence.Matches(total, "TOTAL", "10"));
        Assert.False(CjIntelligenceScopeEvidence.Matches(total, "EQUIPO", null));

        var propio = IaResolvedScope.ForRestricted(IaScopeLevel.Propio, IaScopeFields.ResponsableOSolicitante, [7], false);
        Assert.True(CjIntelligenceScopeEvidence.Matches(propio, "PROPIO", "7"));
        Assert.False(CjIntelligenceScopeEvidence.Matches(propio, "PROPIO", "7,8"));
    }

    [Fact]
    public void Alcance_Huella_EsEstableDe64CaracteresYDistintaSiCambiaElAlcance()
    {
        var h1 = CjIntelligenceScopeEvidence.Hash("EQUIPO", "10,11,12");
        var h2 = CjIntelligenceScopeEvidence.Hash("EQUIPO", "10,11,12");
        var h3 = CjIntelligenceScopeEvidence.Hash("EQUIPO", "10,11,13");
        var h4 = CjIntelligenceScopeEvidence.Hash("TOTAL", null);

        Assert.Equal(64, h1.Length);
        Assert.Equal(h1, h2);
        Assert.NotEqual(h1, h3);
        Assert.NotEqual(h1, h4);
    }
}
