using CjERP.Application.Interfaces.Services.AI;
using CjERP.Infrastructure.Persistence.Sql;
using CjERP.Infrastructure.Services;
using CjERP.Infrastructure.Services.AI.CjIntelligence;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// CJ Intelligence: el control de alcance nunca puede degradarse a TOTAL ante errores o permisos ausentes.
/// Sin SQL real: usa fakes del almacen de permisos y del directorio de empleados.
/// </summary>
[Trait("Category", "Unit")]
public sealed class CjIntelligenceScopeResolverTests
{
    private sealed class FakeStore : IIaPermissionStore
    {
        public IReadOnlyList<IaPermissionGrant> Grants { get; set; } = [];
        public Exception? Throws { get; set; }
        public List<string> ToolNames { get; } = [];

        public Task<IReadOnlyList<IaPermissionGrant>> GetActiveGrantsAsync(string idUsuario, string toolName, CancellationToken ct)
        {
            ToolNames.Add(toolName);
            return Throws is null ? Task.FromResult(Grants) : Task.FromException<IReadOnlyList<IaPermissionGrant>>(Throws);
        }
    }

    private sealed class FakeDirectory : IIaEmployeeDirectory
    {
        public int? Titular { get; set; } = 10;
        public IReadOnlyList<int> Reports { get; set; } = [11, 12];
        public Task<int?> ResolveEmpleadoCjAsync(string idUsuario, CancellationToken ct) => Task.FromResult(Titular);
        public Task<IReadOnlyList<int>> GetDirectReportsAsync(int idEmpleadoCj, CancellationToken ct) => Task.FromResult(Reports);
    }

    private sealed class FakeAuthorization : IIaAuthorizationService
    {
        public Func<IaAuthorizationResult?>? Result { get; set; }
        public Exception? Throws { get; set; }
        public int Calls { get; private set; }

        public Task<IaAuthorizationResult> AuthorizeAsync(IaAuthorizationRequest request, CancellationToken ct)
        {
            Calls++;
            if (Throws is not null) throw Throws;
            return Task.FromResult(Result!()!);
        }
    }

    private static CjIntelligenceScopeResolver Resolver(IIaAuthorizationService service) =>
        new(service, NullLogger<CjIntelligenceScopeResolver>.Instance);

    private static (CjIntelligenceScopeResolver Resolver, FakeStore Store, FakeDirectory Directory) Real()
    {
        var store = new FakeStore();
        var directory = new FakeDirectory();
        var service = new IaAuthorizationService(store, directory, NullLogger<IaAuthorizationService>.Instance);
        return (Resolver(service), store, directory);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task IdentidadAusente_Deniega_SinConsultarAutorizacion(string? usuario)
    {
        var service = new FakeAuthorization();
        var decision = await Resolver(service).ResolveAsync(usuario, CancellationToken.None);

        Assert.False(decision.Allowed);
        Assert.Null(decision.Scope);
        Assert.Equal(CjIntelligenceScopeResolver.DenyIdentityMissing, decision.DenyReason);
        Assert.Equal(0, service.Calls);
    }

    [Fact]
    public async Task ExcepcionDelServicio_Deniega_NoDevuelveAlcance()
    {
        var service = new FakeAuthorization { Throws = new InvalidOperationException("sql caido") };
        var decision = await Resolver(service).ResolveAsync("7", CancellationToken.None);

        Assert.False(decision.Allowed);
        Assert.Null(decision.Scope);
        Assert.Equal(CjIntelligenceScopeResolver.DenyVerificationFailed, decision.DenyReason);
    }

    [Fact]
    public async Task Cancelacion_SePropaga_NoSeConvierteEnDenegacion()
    {
        var service = new FakeAuthorization { Throws = new OperationCanceledException() };
        await Assert.ThrowsAsync<OperationCanceledException>(() => Resolver(service).ResolveAsync("7", CancellationToken.None));
    }

    [Fact]
    public async Task ServicioDenegaOResultadoNulo_Deniega()
    {
        var denies = new FakeAuthorization { Result = () => IaAuthorizationResult.Deny("sin_permiso_de_alcance") };
        var nulo = new FakeAuthorization { Result = () => null };

        var d1 = await Resolver(denies).ResolveAsync("7", CancellationToken.None);
        var d2 = await Resolver(nulo).ResolveAsync("7", CancellationToken.None);

        Assert.False(d1.Allowed);
        Assert.Equal("sin_permiso_de_alcance", d1.DenyReason);
        Assert.False(d2.Allowed);
        Assert.Equal(CjIntelligenceScopeResolver.DenyNotAllowed, d2.DenyReason);
    }

    [Fact]
    public async Task SinConcesiones_DeniegaYNoCaeATotal()
    {
        var (resolver, _, _) = Real();
        var decision = await resolver.ResolveAsync("7", CancellationToken.None);

        Assert.False(decision.Allowed);
        Assert.Null(decision.Scope);
        Assert.Equal(IaAuthorizationService.DenyNoRowScope, decision.DenyReason);
    }

    [Fact]
    public async Task FalloDelAlmacenDePermisos_DeniegaYNoCaeATotal()
    {
        var (resolver, store, _) = Real();
        store.Throws = new TimeoutException("timeout sql");

        var decision = await resolver.ResolveAsync("7", CancellationToken.None);

        Assert.False(decision.Allowed);
        Assert.Null(decision.Scope);
    }

    [Theory]
    [InlineData(null)]
    [InlineData(0)]
    [InlineData(-3)]
    public async Task EmpleadoNoResuelto_ConNivelPropio_Deniega(int? titular)
    {
        var (resolver, store, directory) = Real();
        store.Grants = [new IaPermissionGrant(IaScopeLevel.Propio, false)];
        directory.Titular = titular;

        var decision = await resolver.ResolveAsync("7", CancellationToken.None);

        Assert.False(decision.Allowed);
        Assert.Equal(IaAuthorizationService.DenyEmployeeUnresolved, decision.DenyReason);
    }

    [Fact]
    public async Task ConcesionPropio_DevuelveAlcanceRestringido_NuncaTotal()
    {
        var (resolver, store, _) = Real();
        store.Grants = [new IaPermissionGrant(IaScopeLevel.Propio, false)];

        var decision = await resolver.ResolveAsync("7", CancellationToken.None);

        Assert.True(decision.Allowed);
        Assert.Equal(IaScopeLevel.Propio, decision.Scope!.Level);
        Assert.True(decision.Scope.IsRestricted);
        Assert.Equal(new[] { 10 }, decision.Scope.EmployeeIds);
    }

    [Fact]
    public async Task ConcesionEquipo_IncluyeTitularYSubordinados()
    {
        var (resolver, store, _) = Real();
        store.Grants = [new IaPermissionGrant(IaScopeLevel.Equipo, false)];

        var decision = await resolver.ResolveAsync("7", CancellationToken.None);

        Assert.Equal(IaScopeLevel.Equipo, decision.Scope!.Level);
        Assert.Equal(new[] { 10, 11, 12 }, decision.Scope.EmployeeIds);
    }

    [Fact]
    public async Task SoloUnaConcesionTotalExplicita_OtorgaTotal()
    {
        var (resolver, store, _) = Real();
        store.Grants = [new IaPermissionGrant(IaScopeLevel.Propio, false), new IaPermissionGrant(IaScopeLevel.Total, false)];

        var decision = await resolver.ResolveAsync("7", CancellationToken.None);

        Assert.Equal(IaScopeLevel.Total, decision.Scope!.Level);
        Assert.False(decision.Scope.CanViewGlobalTotals);
    }

    [Fact]
    public async Task ConcesionSoloDeTotalesGlobales_SinNivel_Deniega()
    {
        var (resolver, store, _) = Real();
        store.Grants = [new IaPermissionGrant(null, true)];

        var decision = await resolver.ResolveAsync("7", CancellationToken.None);

        Assert.False(decision.Allowed);
    }

    [Fact]
    public async Task SiempreAutorizaConElPermisoDePagosExistente()
    {
        var (resolver, store, _) = Real();
        store.Grants = [new IaPermissionGrant(IaScopeLevel.Propio, false)];

        await resolver.ResolveAsync("7", CancellationToken.None);

        Assert.Equal(new[] { CjIntelligenceTools.PagosPermission }, store.ToolNames);
        Assert.Equal("buscar_planilla", CjIntelligenceTools.PagosPermission);
    }

    // ---- Fabrica de conexion: nunca cae a DefaultConnection ----

    // El proyecto de pruebas no referencia Microsoft.Extensions.Configuration (solo las abstracciones):
    // diccionario plano con la minima superficie que usa GetConnectionString.
    private sealed class DictConfig : IConfiguration
    {
        private readonly Dictionary<string, string?> _values;

        public DictConfig(Dictionary<string, string?> values) => _values = values;

        public string? this[string key]
        {
            get => _values.TryGetValue(key, out var v) ? v : null;
            set => throw new NotSupportedException();
        }

        public IConfigurationSection GetSection(string key) => new Section(key, this);

        public IEnumerable<IConfigurationSection> GetChildren() => [];

        public Microsoft.Extensions.Primitives.IChangeToken GetReloadToken() =>
            new Microsoft.Extensions.Primitives.CancellationChangeToken(CancellationToken.None);

        private sealed class Section(string path, DictConfig root) : IConfigurationSection
        {
            public string Key => path;
            public string Path => path;
            public string? Value { get => root[path]; set => throw new NotSupportedException(); }
            public string? this[string key] { get => root[$"{path}:{key}"]; set => throw new NotSupportedException(); }
            public IConfigurationSection GetSection(string key) => new Section($"{path}:{key}", root);
            public IEnumerable<IConfigurationSection> GetChildren() => [];
            public Microsoft.Extensions.Primitives.IChangeToken GetReloadToken() => root.GetReloadToken();
        }
    }

    private static IConfiguration Config(params (string Key, string Value)[] items) =>
        new DictConfig(items.ToDictionary(i => i.Key, i => (string?)i.Value));

    private static IOptions<CjERP.Api.Configuration.SqlSettings> Settings() =>
        Options.Create(new CjERP.Api.Configuration.SqlSettings());

    [Fact]
    public void FabricaDeConexion_SinCadenaDeCjIntelligence_LanzaYNoUsaDefaultConnection()
    {
        const string cadenaSysadmin = "Data Source=servidor-sysadmin;Initial Catalog=JC_Db;User Id=sa;Password=secreto-xyz";
        var config = Config(("ConnectionStrings:DefaultConnection", cadenaSysadmin));

        var ex = Assert.Throws<InvalidOperationException>(() => new CjIntelligenceSqlCommandFactory(config, Settings()));

        Assert.DoesNotContain("secreto-xyz", ex.Message);
        Assert.DoesNotContain("servidor-sysadmin", ex.Message);
        Assert.Contains("CjIntelligence", ex.Message);
    }

    [Fact]
    public void FabricaDeConexion_CadenaVacia_Lanza()
    {
        var config = Config(("ConnectionStrings:CjIntelligence", "  "), ("ConnectionStrings:DefaultConnection", "Data Source=otro"));

        Assert.Throws<InvalidOperationException>(() => new CjIntelligenceSqlCommandFactory(config, Settings()));
    }

    [Fact]
    public void FabricaDeConexion_ConCadenaPropia_UsaEsaYNoLaPorDefecto()
    {
        var config = Config(
            ("ConnectionStrings:CjIntelligence", "Data Source=servidor-cj-ia;Initial Catalog=JC_Db;User Id=cj_ia;Password=x"),
            ("ConnectionStrings:DefaultConnection", "Data Source=servidor-sysadmin;Initial Catalog=JC_Db;User Id=sa;Password=y"));

        var factory = new CjIntelligenceSqlCommandFactory(config, Settings());

        Assert.Contains("servidor-cj-ia", factory.ConnectionString);
        Assert.DoesNotContain("servidor-sysadmin", factory.ConnectionString);
    }
}
