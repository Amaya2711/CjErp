using CjERP.Application.Interfaces.Services.AI;
using CjERP.Infrastructure.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// PRUEBAS SINTETICAS con almacenes y directorio falsos en memoria. NO prueban la fuente real de
/// permisos ni las relaciones reales de BD (ninguna de las dos esta implementada todavia).
/// </summary>
[Trait("Category", "Unit")]
public sealed class IaAuthorizationServiceTests
{
    private const string Tool = "buscar_planilla";

    [Fact]
    public async Task IdentidadAusente_Deniega_YNoConsultaNada()
    {
        var store = new FakeStore();
        var service = Build(store, new FakeDirectory());

        foreach (var id in new string?[] { null, "", "   " })
        {
            var result = await service.AuthorizeAsync(new IaAuthorizationRequest(id, Tool), default);
            Assert.False(result.Allowed);
            Assert.Equal(IaAuthorizationService.DenyIdentityMissing, result.DenyReason);
        }

        Assert.Equal(0, store.Calls);
    }

    [Fact]
    public async Task HerramientaAusente_Deniega()
    {
        var result = await Build(new FakeStore(), new FakeDirectory())
            .AuthorizeAsync(new IaAuthorizationRequest("u1", " "), default);

        Assert.False(result.Allowed);
        Assert.Equal(IaAuthorizationService.DenyToolMissing, result.DenyReason);
    }

    [Fact]
    public async Task SinConcesiones_Deniega()
    {
        var result = await Authorize("u1", new FakeStore(), new FakeDirectory());
        Assert.False(result.Allowed);
        Assert.Equal(IaAuthorizationService.DenyNoRowScope, result.DenyReason);
    }

    [Fact]
    public async Task SoloTotalesGlobales_SinNivel_Deniega()
    {
        var store = new FakeStore().Grant("u1", new IaPermissionGrant(null, true));
        var result = await Authorize("u1", store, new FakeDirectory().WithEmployee("u1", 7));

        Assert.False(result.Allowed);
        Assert.Equal(IaAuthorizationService.DenyNoRowScope, result.DenyReason);
    }

    [Fact]
    public async Task Propio_RestringeAlTitular_ConResponsableOSolicitante()
    {
        var store = new FakeStore().Grant("u1", new IaPermissionGrant(IaScopeLevel.Propio, false));
        var result = await Authorize("u1", store, new FakeDirectory().WithEmployee("u1", 7));

        Assert.True(result.Allowed);
        Assert.Equal(IaScopeLevel.Propio, result.Scope!.Level);
        Assert.Equal([7], result.Scope.EmployeeIds);
        Assert.Equal(IaScopeFields.ResponsableOSolicitante, result.Scope.Fields);
        Assert.False(result.Scope.CanViewGlobalTotals);
    }

    [Fact]
    public async Task Equipo_TitularMasDirectos_SinAutorreferenciaNiDuplicadosNiIndirectos()
    {
        var store = new FakeStore().Grant("u1", new IaPermissionGrant(IaScopeLevel.Equipo, false));
        var directory = new FakeDirectory()
            .WithEmployee("u1", 7)
            .WithDirectReports(7, 7, 11, 11, 12, -3, 0);   // 7 = autorreferencia; -3/0 = invalidos; 11 duplicado

        var result = await Authorize("u1", store, directory);

        Assert.True(result.Allowed);
        Assert.Equal([7, 11, 12], result.Scope!.EmployeeIds);
        Assert.Equal(1, directory.DirectReportsCalls);   // un solo nivel: no se recorre la jerarquia
    }

    [Fact]
    public async Task Equipo_SinSubordinados_SoloTitular()
    {
        var store = new FakeStore().Grant("u1", new IaPermissionGrant(IaScopeLevel.Equipo, false));
        var result = await Authorize("u1", store, new FakeDirectory().WithEmployee("u1", 7));

        Assert.Equal([7], result.Scope!.EmployeeIds);
    }

    [Fact]
    public async Task Total_NoRequiereEmpleado_YNoLlevaIdentificadores()
    {
        var store = new FakeStore().Grant("u1", new IaPermissionGrant(IaScopeLevel.Total, false));
        var directory = new FakeDirectory();   // no resuelve a nadie
        var result = await Authorize("u1", store, directory);

        Assert.True(result.Allowed);
        Assert.Equal(IaScopeLevel.Total, result.Scope!.Level);
        Assert.Empty(result.Scope.EmployeeIds);
        Assert.Equal(0, directory.ResolveCalls);
    }

    [Theory]
    [InlineData(IaScopeLevel.Propio)]
    [InlineData(IaScopeLevel.Equipo)]
    [InlineData(IaScopeLevel.Total)]
    public async Task TotalesGlobales_SonIndependientesDelNivel(IaScopeLevel level)
    {
        var withGlobals = new FakeStore().Grant("u1", new IaPermissionGrant(level, true));
        var withoutGlobals = new FakeStore().Grant("u1", new IaPermissionGrant(level, false));
        var directory = new FakeDirectory().WithEmployee("u1", 7);

        Assert.True((await Authorize("u1", withGlobals, directory)).Scope!.CanViewGlobalTotals);
        Assert.False((await Authorize("u1", withoutGlobals, directory)).Scope!.CanViewGlobalTotals);
    }

    [Fact]
    public async Task TotalesGlobales_ConcedidosEnOtraFila_SeCombinanConElNivel()
    {
        var store = new FakeStore()
            .Grant("u1", new IaPermissionGrant(IaScopeLevel.Propio, false))
            .Grant("u1", new IaPermissionGrant(null, true));
        var result = await Authorize("u1", store, new FakeDirectory().WithEmployee("u1", 7));

        Assert.Equal(IaScopeLevel.Propio, result.Scope!.Level);
        Assert.True(result.Scope.CanViewGlobalTotals);
    }

    [Fact]
    public void VariosPerfilesRoles_SeCombinanPorUnion_SinDependerDelOrden()
    {
        var grants = new[]
        {
            new IaPermissionGrant(IaScopeLevel.Propio, false),
            new IaPermissionGrant(IaScopeLevel.Equipo, false),
            new IaPermissionGrant(null, true),
            new IaPermissionGrant(IaScopeLevel.Propio, false)
        };

        foreach (var permutation in Permutations(grants))
        {
            var (level, globals) = IaAuthorizationService.CombineGrants(permutation);
            Assert.Equal(IaScopeLevel.Equipo, level);
            Assert.True(globals);
        }
    }

    [Fact]
    public void CombineGrants_TotalGanaSobreOtrosNiveles()
    {
        var (level, globals) = IaAuthorizationService.CombineGrants(
        [
            new IaPermissionGrant(IaScopeLevel.Propio, false),
            new IaPermissionGrant(IaScopeLevel.Total, false)
        ]);

        Assert.Equal(IaScopeLevel.Total, level);
        Assert.False(globals);
    }

    [Fact]
    public void CombineGrants_VacioONulo_NoConcedeNada()
    {
        Assert.Equal((null, false), IaAuthorizationService.CombineGrants([]));
        Assert.Equal((null, false), IaAuthorizationService.CombineGrants(null));
    }

    [Theory]
    [InlineData(IaScopeLevel.Propio)]
    [InlineData(IaScopeLevel.Equipo)]
    public async Task EmpleadoNoResuelto_Deniega_ParaPropioYEquipo(IaScopeLevel level)
    {
        var store = new FakeStore().Grant("u1", new IaPermissionGrant(level, false));

        var result = await Authorize("u1", store, new FakeDirectory());   // sin empleado
        Assert.False(result.Allowed);
        Assert.Equal(IaAuthorizationService.DenyEmployeeUnresolved, result.DenyReason);

        var zero = await Authorize("u1", store, new FakeDirectory().WithEmployee("u1", 0));
        Assert.False(zero.Allowed);
    }

    [Fact]
    public async Task CuentasDistintasDelMismoEmpleado_NoComparten_Permisos()
    {
        var store = new FakeStore().Grant("cuenta-a", new IaPermissionGrant(IaScopeLevel.Total, true));
        var directory = new FakeDirectory().WithEmployee("cuenta-a", 7).WithEmployee("cuenta-b", 7);

        Assert.True((await Authorize("cuenta-a", store, directory)).Allowed);

        var other = await Authorize("cuenta-b", store, directory);
        Assert.False(other.Allowed);
        Assert.Equal(IaAuthorizationService.DenyNoRowScope, other.DenyReason);
    }

    [Fact]
    public async Task FalloDelAlmacenDePermisos_Deniega()
    {
        var store = new FakeStore { Throw = new InvalidOperationException("sql caido") };
        var result = await Authorize("u1", store, new FakeDirectory());

        Assert.False(result.Allowed);
        Assert.Equal(IaAuthorizationService.DenyVerificationFailed, result.DenyReason);
    }

    [Fact]
    public async Task FalloDelDirectorio_Deniega()
    {
        var store = new FakeStore().Grant("u1", new IaPermissionGrant(IaScopeLevel.Equipo, false));
        var directory = new FakeDirectory { Throw = new TimeoutException() };
        var result = await Authorize("u1", store, directory);

        Assert.False(result.Allowed);
        Assert.Equal(IaAuthorizationService.DenyVerificationFailed, result.DenyReason);
    }

    [Fact]
    public async Task Cancelacion_SePropaga_NoSeTrataComoDenegacionSilenciosa()
    {
        var store = new FakeStore { Throw = new OperationCanceledException() };
        await Assert.ThrowsAsync<OperationCanceledException>(() => Authorize("u1", store, new FakeDirectory()));
    }

    [Fact]
    public async Task ColeccionDeConcesionesNula_Deniega()
    {
        var store = new FakeStore { ReturnNull = true };
        var result = await Authorize("u1", store, new FakeDirectory());
        Assert.False(result.Allowed);
    }

    [Fact]
    public async Task MemoriaPrevia_SeInvalida_SiCambiaMiembroONivelOTotales()
    {
        var directory = new FakeDirectory().WithEmployee("u1", 7).WithDirectReports(7, 11);
        var store = new FakeStore().Grant("u1", new IaPermissionGrant(IaScopeLevel.Equipo, false));
        var before = (await Authorize("u1", store, directory)).Scope!;

        var state = new ConversationState("c1", "u1");
        state.RecordAuthorizedScope(before.ToAuthorizedScope());
        Assert.True(state.MatchesAuthorizedScope(before.ToAuthorizedScope()));

        // Cambia la composicion del equipo.
        directory.WithDirectReports(7, 11, 12);
        var newMember = (await Authorize("u1", store, directory)).Scope!;
        Assert.False(state.MatchesAuthorizedScope(newMember.ToAuthorizedScope()));

        // Cambia solo el permiso de totales globales.
        var globalsOnly = IaResolvedScope.ForRestricted(
            IaScopeLevel.Equipo, IaScopeFields.ResponsableOSolicitante, before.EmployeeIds, true);
        Assert.False(state.MatchesAuthorizedScope(globalsOnly.ToAuthorizedScope()));

        // Cambia el nivel.
        var propio = IaResolvedScope.ForRestricted(
            IaScopeLevel.Propio, IaScopeFields.ResponsableOSolicitante, before.EmployeeIds, false);
        Assert.False(state.MatchesAuthorizedScope(propio.ToAuthorizedScope()));
    }

    private static Task<IaAuthorizationResult> Authorize(string user, FakeStore store, FakeDirectory directory) =>
        Build(store, directory).AuthorizeAsync(new IaAuthorizationRequest(user, Tool), default);

    private static IaAuthorizationService Build(FakeStore store, FakeDirectory directory) =>
        new(store, directory, NullLogger<IaAuthorizationService>.Instance);

    private static IEnumerable<IaPermissionGrant[]> Permutations(IaPermissionGrant[] items)
    {
        if (items.Length <= 1)
        {
            yield return items;
            yield break;
        }

        for (var i = 0; i < items.Length; i++)
        {
            var rest = items.Where((_, index) => index != i).ToArray();
            foreach (var tail in Permutations(rest))
            {
                yield return new[] { items[i] }.Concat(tail).ToArray();
            }
        }
    }

    private sealed class FakeStore : IIaPermissionStore
    {
        private readonly Dictionary<string, List<IaPermissionGrant>> _grants = new();

        public Exception? Throw { get; set; }

        public bool ReturnNull { get; set; }

        public int Calls { get; private set; }

        public FakeStore Grant(string user, IaPermissionGrant grant)
        {
            if (!_grants.TryGetValue(user, out var list))
            {
                _grants[user] = list = [];
            }

            list.Add(grant);
            return this;
        }

        public Task<IReadOnlyList<IaPermissionGrant>> GetActiveGrantsAsync(
            string idUsuario, string toolName, CancellationToken cancellationToken)
        {
            Calls++;
            if (Throw is not null)
            {
                throw Throw;
            }

            if (ReturnNull)
            {
                return Task.FromResult<IReadOnlyList<IaPermissionGrant>>(null!);
            }

            IReadOnlyList<IaPermissionGrant> result = _grants.TryGetValue(idUsuario, out var list) ? list : [];
            return Task.FromResult(result);
        }
    }

    private sealed class FakeDirectory : IIaEmployeeDirectory
    {
        private readonly Dictionary<string, int> _employees = new();
        private readonly Dictionary<int, int[]> _reports = new();

        public Exception? Throw { get; set; }

        public int ResolveCalls { get; private set; }

        public int DirectReportsCalls { get; private set; }

        public FakeDirectory WithEmployee(string user, int idEmpleadoCj)
        {
            _employees[user] = idEmpleadoCj;
            return this;
        }

        public FakeDirectory WithDirectReports(int titular, params int[] reports)
        {
            _reports[titular] = reports;
            return this;
        }

        public Task<int?> ResolveEmpleadoCjAsync(string idUsuario, CancellationToken cancellationToken)
        {
            ResolveCalls++;
            if (Throw is not null)
            {
                throw Throw;
            }

            return Task.FromResult<int?>(_employees.TryGetValue(idUsuario, out var id) ? id : null);
        }

        public Task<IReadOnlyList<int>> GetDirectReportsAsync(int idEmpleadoCj, CancellationToken cancellationToken)
        {
            DirectReportsCalls++;
            if (Throw is not null)
            {
                throw Throw;
            }

            IReadOnlyList<int> result = _reports.TryGetValue(idEmpleadoCj, out var list) ? list : [];
            return Task.FromResult(result);
        }
    }
}
