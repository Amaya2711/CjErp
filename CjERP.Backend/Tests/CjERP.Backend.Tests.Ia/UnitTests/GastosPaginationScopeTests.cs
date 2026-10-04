using CjERP.Application.Interfaces.Services.AI;
using CjERP.Infrastructure.Services;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// PRUEBAS SINTETICAS del bucle de paginacion (FetchPagesAsync) con la obtencion de pagina inyectada:
/// verifican que TODOS los filtros y el MISMO alcance llegan a cada pagina. Regresion: la copia manual
/// anterior omitia el filtro Site en las paginas 2+. No ejecutan SQL.
/// </summary>
[Trait("Category", "Unit")]
public sealed class GastosPaginationScopeTests
{
    private static BuscarPlanillaArgs FullyPopulatedArgs() => new()
    {
        TextoBusqueda = "texto",
        Estados = "PAGADO,APROBADO",
        FechaInicio = new DateOnly(2026, 1, 1),
        FechaFin = new DateOnly(2026, 6, 30),
        IdSolicitante = 11,
        IdValidador = 12,
        IdCliente = 13,
        IdProyecto = 14,
        IdSite = "LIM123",
        Site = "SITE NORTE",
        CorreSite = 3,
        Cliente = "CLARO",
        Proyecto = "PROY",
        Responsable = "RESP",
        Solicitante = "SOLI",
        Ot = "OT-9",
        CoincidirTodas = true,
        IncluirEstado99 = false,
        Pagina = 1,
        TamanoPagina = 2,
        TipoCambio = 3.91m,
        EstadosAplicadosPorDefecto = true,
        FechasAplicadasPorDefecto = true
    };

    [Fact]
    public void WithPage_CopiaTodasLasPropiedadesSalvoPaginaYTamano()
    {
        var original = FullyPopulatedArgs();
        var clone = original.WithPage(5, 7);

        Assert.NotSame(original, clone);
        Assert.Equal(5, clone.Pagina);
        Assert.Equal(7, clone.TamanoPagina);
        Assert.Equal(1, original.Pagina);       // el original no cambia
        Assert.Equal(2, original.TamanoPagina);

        // Reflexion: cualquier propiedad NUEVA que se agregue a BuscarPlanillaArgs queda cubierta.
        foreach (var property in typeof(BuscarPlanillaArgs).GetProperties()
                     .Where(p => p.CanRead && p.CanWrite
                                 && p.Name is not (nameof(BuscarPlanillaArgs.Pagina) or nameof(BuscarPlanillaArgs.TamanoPagina))))
        {
            Assert.True(
                Equals(property.GetValue(original), property.GetValue(clone)),
                $"La propiedad {property.Name} no se preservo en WithPage.");
        }
    }

    [Fact]
    public void ElOriginalTieneTodasLasPropiedadesPobladasEnLaPrueba()
    {
        // Guarda de la propia prueba: si alguien agrega una propiedad a BuscarPlanillaArgs y no la puebla
        // aqui, la verificacion por reflexion de arriba no la ejercitaria con un valor distinto del default.
        var populated = FullyPopulatedArgs();
        var defaults = new BuscarPlanillaArgs();

        foreach (var property in typeof(BuscarPlanillaArgs).GetProperties().Where(p => p.CanRead && p.CanWrite))
        {
            Assert.False(
                Equals(property.GetValue(populated), property.GetValue(defaults)) && property.Name is not nameof(BuscarPlanillaArgs.Pagina),
                $"FullyPopulatedArgs no puebla {property.Name} con un valor distinto del default.");
        }
    }

    [Fact]
    public async Task TodasLasPaginas_RecibenTodosLosFiltrosYElMismoAlcance()
    {
        var scope = IaResolvedScope.ForRestricted(IaScopeLevel.Equipo, IaScopeFields.ResponsableOSolicitante, [7, 11, 12], false);
        var calls = new List<(BuscarPlanillaArgs Args, IaResolvedScope? Scope)>();

        var result = await GastosQueryExecutor.FetchPagesAsync(
            FullyPopulatedArgs(), scope, fetchAllPages: true,
            (args, s, _) =>
            {
                calls.Add((args, s));
                return Task.FromResult(Page(args.Pagina, total: 5, pageSize: 2));
            },
            CancellationToken.None);

        Assert.Equal(3, calls.Count);                                   // 2 + 2 + 1 filas
        Assert.Equal(new[] { 1, 2, 3 }, calls.Select(c => c.Args.Pagina));
        Assert.Equal(5, result.Rows.Count);

        var first = calls[0].Args;
        foreach (var (args, s) in calls)
        {
            Assert.Same(scope, s);                                      // el MISMO alcance, nunca null
            Assert.Equal("SITE NORTE", args.Site);                      // regresion: antes se perdia en paginas 2+
            foreach (var property in typeof(BuscarPlanillaArgs).GetProperties()
                         .Where(p => p.CanRead && p.CanWrite
                                     && p.Name is not (nameof(BuscarPlanillaArgs.Pagina) or nameof(BuscarPlanillaArgs.TamanoPagina))))
            {
                Assert.True(
                    Equals(property.GetValue(first), property.GetValue(args)),
                    $"{property.Name} cambio entre paginas.");
            }
        }
    }

    [Fact]
    public async Task ParametrosSql_DePaginasPosteriores_SoloDifierenEnPaginaYTamano_ConElMismoAlcance()
    {
        var scope = IaResolvedScope.ForRestricted(IaScopeLevel.Propio, IaScopeFields.ResponsableOSolicitante, [7], true);
        var paramsPerPage = new List<Dapper.DynamicParameters>();

        await GastosQueryExecutor.FetchPagesAsync(
            FullyPopulatedArgs(), scope, fetchAllPages: true,
            (args, s, _) =>
            {
                paramsPerPage.Add(GastosQueryExecutor.BuildParameters(args, s));
                return Task.FromResult(Page(args.Pagina, total: 4, pageSize: 2));
            },
            CancellationToken.None);

        Assert.Equal(2, paramsPerPage.Count);
        var names = paramsPerPage[0].ParameterNames.ToList();
        Assert.Contains("Site", names);
        Assert.Contains("AlcanceNivel", names);

        foreach (var name in names.Where(n => n is not ("Pagina" or "TamanoPagina")))
        {
            Assert.True(
                Equals(paramsPerPage[0].Get<object?>("@" + name), paramsPerPage[1].Get<object?>("@" + name)),
                $"El parametro @{name} difiere entre paginas.");
        }

        Assert.Equal(1, paramsPerPage[0].Get<int>("@Pagina"));
        Assert.Equal(2, paramsPerPage[1].Get<int>("@Pagina"));
    }

    [Fact]
    public async Task UnaSolaPagina_NoPideMas_YFetchAllFalse_PideSoloLaPrimera()
    {
        var calls = 0;
        await GastosQueryExecutor.FetchPagesAsync(
            FullyPopulatedArgs(), IaResolvedScope.ForTotal(true), fetchAllPages: false,
            (args, _, _) => { calls++; return Task.FromResult(Page(1, total: 10, pageSize: 2)); },
            CancellationToken.None);

        Assert.Equal(1, calls);
    }

    [Fact]
    public async Task SinPermisoDeTotales_RetiraLasQuinceColumnas_YLoInforma()
    {
        var scope = IaResolvedScope.ForRestricted(IaScopeLevel.Propio, IaScopeFields.ResponsableOSolicitante, [7], false);

        var result = await GastosQueryExecutor.FetchPagesAsync(
            FullyPopulatedArgs(), scope, fetchAllPages: false,
            (_, _, _) => Task.FromResult(new List<Dictionary<string, object?>>
            {
                new() { ["IdPlanilla"] = 1, ["Subtotal"] = 10m, ["TotalRegistros"] = 1, ["Ventas"] = null, ["SubOc"] = 99m, ["PorcentajeFic"] = null }
            }),
            CancellationToken.None);

        Assert.Equal(IaGlobalColumns.Names.Count, result.UnavailableColumns.Count);
        Assert.Equal(["IdPlanilla", "Subtotal", "TotalRegistros"], result.Rows[0].Keys);
        Assert.Equal(1, result.TotalRows);
    }

    [Fact]
    public async Task ConPermisoDeTotales_ConservaColumnas_IncluidoUnCeroReal()
    {
        var result = await GastosQueryExecutor.FetchPagesAsync(
            FullyPopulatedArgs(), IaResolvedScope.ForTotal(true), fetchAllPages: false,
            (_, _, _) => Task.FromResult(new List<Dictionary<string, object?>>
            {
                new() { ["IdPlanilla"] = 1, ["Ventas"] = 0m, ["SubOc"] = 0m }
            }),
            CancellationToken.None);

        Assert.Empty(result.UnavailableColumns);
        Assert.Equal(0m, result.Rows[0]["Ventas"]);
        Assert.Equal(0m, result.Rows[0]["SubOc"]);
    }

    [Fact]
    public async Task RutaHeredadaSinAlcance_NoRetiraNadaNiDeclaraNoDisponibles()
    {
        var result = await GastosQueryExecutor.FetchPagesAsync(
            FullyPopulatedArgs(), scope: null, fetchAllPages: false,
            (_, _, _) => Task.FromResult(new List<Dictionary<string, object?>> { new() { ["Ventas"] = 5m } }),
            CancellationToken.None);

        Assert.Empty(result.UnavailableColumns);
        Assert.Equal(5m, result.Rows[0]["Ventas"]);
    }

    private static List<Dictionary<string, object?>> Page(int page, int total, int pageSize)
    {
        var start = (page - 1) * pageSize;
        var count = Math.Max(0, Math.Min(pageSize, total - start));
        return Enumerable.Range(start, count)
            .Select(i => new Dictionary<string, object?> { ["IdPlanilla"] = i + 1, ["TotalRegistros"] = total })
            .ToList();
    }
}
