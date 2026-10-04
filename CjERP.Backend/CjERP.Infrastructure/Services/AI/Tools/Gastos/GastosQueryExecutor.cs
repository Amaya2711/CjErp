// Extraido de IaChatService.cs en Fase 1.3 (docs/AI_COPILOT_IMPLEMENTATION_PLAN.md).
// Codigo movido tal cual: no se cambio ningun comportamiento, solo la ubicacion. Este componente
// es el UNICO punto del sistema que ejecuta dbo.sp_IA_Planilla_Buscar; no decide filtros, no arma
// prompts ni analiza resultados. IaChatService.cs sigue coordinando y delega aqui la obtencion de
// datos.
using System.Data;
using System.Globalization;
using Dapper;
using CjERP.Application.Interfaces.Services.AI;
using CjERP.Infrastructure.Persistence.Sql;
using Microsoft.Extensions.Logging;

namespace CjERP.Infrastructure.Services;

using static CjERP.Infrastructure.Services.IaChatSharedDefaults;

public interface IGastosQueryExecutor
{
    Task<PlanillaBuscarExecutionResult> EjecutarBuscarPlanillaAsync(
        BuscarPlanillaArgs args,
        CancellationToken cancellationToken,
        bool fetchAllPages = false);

    /// <summary>
    /// Ejecucion con alcance OBLIGATORIO (Fase 2). Sin un IaResolvedScope valido no se llega a SQL.
    /// NO esta conectada al flujo real todavia: IaOrchestrator sigue usando la ruta sin alcance hasta
    /// completar permisos, resolucion de identidad y despliegue de la version del SP con alcance.
    /// </summary>
    Task<PlanillaBuscarExecutionResult> EjecutarBuscarPlanillaConAlcanceAsync(
        BuscarPlanillaArgs args,
        IaResolvedScope scope,
        CancellationToken cancellationToken,
        bool fetchAllPages = false);

    /// <summary>
    /// Resumen agrupado DENTRO de SQL: dbo.sp_IA_Planilla_Buscar en modo RESUMEN (mismo filtrado y mismo alcance
    /// que el detalle). No trae filas de detalle: devuelve los grupos (dimensiones pedidas + moneda) y los totales
    /// por moneda de todo el universo filtrado. Alcance obligatorio.
    /// </summary>
    Task<PlanillaResumenExecutionResult> EjecutarResumenPlanillaConAlcanceAsync(
        BuscarPlanillaArgs args,
        IReadOnlyList<string> dimensions,
        int top,
        IaResolvedScope scope,
        CancellationToken cancellationToken);
}

public sealed class GastosQueryExecutor : IGastosQueryExecutor
{
    private const string StoredProcedureBuscar = "dbo.sp_IA_Planilla_Buscar";
    private const int MaxLocalAggregationRows = 4000;

    private readonly ISqlCommandFactory _sqlCommandFactory;
    private readonly ILogger<GastosQueryExecutor> _logger;

    public GastosQueryExecutor(ISqlCommandFactory sqlCommandFactory, ILogger<GastosQueryExecutor> logger)
    {
        _sqlCommandFactory = sqlCommandFactory;
        _logger = logger;
    }

    public Task<PlanillaBuscarExecutionResult> EjecutarBuscarPlanillaAsync(
        BuscarPlanillaArgs args,
        CancellationToken cancellationToken,
        bool fetchAllPages = false) =>
        FetchAsync(args, scope: null, cancellationToken, fetchAllPages);

    public Task<PlanillaBuscarExecutionResult> EjecutarBuscarPlanillaConAlcanceAsync(
        BuscarPlanillaArgs args,
        IaResolvedScope scope,
        CancellationToken cancellationToken,
        bool fetchAllPages = false)
    {
        // Falla ANTES de abrir cualquier conexion: sin alcance no se ejecuta nada.
        ArgumentNullException.ThrowIfNull(args);
        ArgumentNullException.ThrowIfNull(scope);
        return FetchAsync(args, scope, cancellationToken, fetchAllPages);
    }

    public async Task<PlanillaResumenExecutionResult> EjecutarResumenPlanillaConAlcanceAsync(
        BuscarPlanillaArgs args,
        IReadOnlyList<string> dimensions,
        int top,
        IaResolvedScope scope,
        CancellationToken cancellationToken)
    {
        // Falla ANTES de abrir cualquier conexion: sin alcance ni dimensiones validas no se ejecuta nada.
        ArgumentNullException.ThrowIfNull(args);
        ArgumentNullException.ThrowIfNull(dimensions);
        ArgumentNullException.ThrowIfNull(scope);

        if (dimensions.Count is < 1 or > 3)
        {
            throw new ArgumentException("El resumen admite de 1 a 3 dimensiones.", nameof(dimensions));
        }

        await using var connection = _sqlCommandFactory.CreateConnection();

        var parameters = BuildResumenParameters(args, dimensions, top, scope);
        _logger.LogInformation(
            "IA Chat ejecutando {StoredProcedure} en modo RESUMEN agrupando por {Dimensiones}",
            StoredProcedureBuscar,
            string.Join(",", dimensions));

        using var grid = await connection.QueryMultipleAsync(
            _sqlCommandFactory.Create(
                StoredProcedureBuscar,
                parameters,
                CommandType.StoredProcedure,
                cancellationToken,
                commandTimeout: 120));

        var groups = (await grid.ReadAsync()).Select(MapRow).ToList();
        var totals = (await grid.ReadAsync()).Select(MapRow).ToList();

        var totalRows = 0;
        foreach (var total in totals)
        {
            if (total.TryGetValue("Registros", out var registros) && TryConvertToInt(registros, out var count))
            {
                totalRows += count;
            }
        }

        return new PlanillaResumenExecutionResult
        {
            Groups = groups,
            TotalsByCurrency = totals,
            TotalRows = totalRows
        };
    }

    /// <summary>Mismos parametros que el detalle (filtros y alcance) mas los del modo RESUMEN.</summary>
    internal static DynamicParameters BuildResumenParameters(
        BuscarPlanillaArgs args,
        IReadOnlyList<string> dimensions,
        int top,
        IaResolvedScope scope)
    {
        var parameters = BuildParameters(args, scope);
        parameters.Add("@Modo", "RESUMEN", DbType.String, size: 10);
        parameters.Add("@AgruparPor", string.Join(",", dimensions), DbType.String, size: 100);
        parameters.Add("@Top", top, DbType.Int32);
        return parameters;
    }

    private Task<PlanillaBuscarExecutionResult> FetchAsync(
        BuscarPlanillaArgs args,
        IaResolvedScope? scope,
        CancellationToken cancellationToken,
        bool fetchAllPages) =>
        FetchPagesAsync(args, scope, fetchAllPages, EjecutarBuscarPlanillaPageAsync, cancellationToken);

    /// <summary>
    /// Bucle de paginacion con la obtencion de cada pagina inyectada (permite probarlo sin SQL).
    /// Cada pagina recibe una copia COMPLETA de los criterios (WithPage) y el MISMO alcance.
    /// </summary>
    internal static async Task<PlanillaBuscarExecutionResult> FetchPagesAsync(
        BuscarPlanillaArgs args,
        IaResolvedScope? scope,
        bool fetchAllPages,
        Func<BuscarPlanillaArgs, IaResolvedScope?, CancellationToken, Task<List<Dictionary<string, object?>>>> fetchPage,
        CancellationToken cancellationToken)
    {
        var rows = await fetchPage(args, scope, cancellationToken);

        if (fetchAllPages)
        {
            var totalRows = GetTotalRows(rows);
            var pageSize = Math.Clamp(args.TamanoPagina, 1, MaxPageSize);
            var accumulatedRows = new List<Dictionary<string, object?>>(rows);
            var nextPage = args.Pagina + 1;

            while (accumulatedRows.Count < totalRows && accumulatedRows.Count < MaxLocalAggregationRows)
            {
                var nextArgs = args.WithPage(nextPage, pageSize);

                var nextPageRows = await fetchPage(nextArgs, scope, cancellationToken);
                if (nextPageRows.Count == 0)
                {
                    break;
                }

                accumulatedRows.AddRange(nextPageRows);
                nextPage++;

                if (nextPageRows.Count < pageSize)
                {
                    break;
                }
            }

            rows = accumulatedRows;
        }

        // El store dbo.sp_IA_Planilla_Buscar es la fuente canónica del filtro.
        // No se aplica un refiltro local por contains sobre Responsable/Solicitante
        // para no alterar el universo real devuelto por SQL.

        // Sin permiso de totales globales, las 15 columnas globales se RETIRAN de las filas (el SP ya las
        // devuelve en NULL; esto es defensa en profundidad) y se informan como no disponibles. Un NULL
        // nunca se convierte en cero. La ruta heredada (scope == null) no cambia.
        var unavailable = scope is { CanViewGlobalTotals: false }
            ? IaGlobalColumns.Names
            : (IReadOnlyList<string>)Array.Empty<string>();

        if (unavailable.Count > 0)
        {
            rows = IaGlobalColumns.StripFromRows(rows);
        }

        return new PlanillaBuscarExecutionResult
        {
            Rows = rows,
            TotalRows = GetTotalRows(rows),
            UnavailableColumns = unavailable
        };
    }

    private async Task<List<Dictionary<string, object?>>> EjecutarBuscarPlanillaPageAsync(
        BuscarPlanillaArgs args,
        IaResolvedScope? scope,
        CancellationToken cancellationToken)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();

        var parameters = BuildParameters(args, scope);
        _logger.LogInformation(
            "IA Chat ejecutando {StoredProcedure} con parametros: {Parametros}",
            StoredProcedureBuscar,
            BuildCompactDictionaryPreview(args.AsDictionary()));

        var rows = (await connection.QueryAsync(
                _sqlCommandFactory.Create(
                    StoredProcedureBuscar,
                    parameters,
                    CommandType.StoredProcedure,
                    cancellationToken,
                    commandTimeout: 120)))
            .Select(MapRow)
            .ToList();

        _logger.LogInformation(
            "IA Chat ejecuto {StoredProcedure} en {DataSource}/{Database} y obtuvo {RowCount} filas.",
            StoredProcedureBuscar,
            connection.DataSource,
            connection.Database,
            rows.Count);

        return rows;
    }

    /// <summary>
    /// Parametros del SP. Con alcance, agrega los 4 parametros de alcance; sin alcance (ruta heredada)
    /// no los agrega y la version del SP con alcance rechazara la llamada (falla cerrada).
    /// </summary>
    internal static DynamicParameters BuildParameters(BuscarPlanillaArgs args, IaResolvedScope? scope)
    {
        var parameters = new DynamicParameters();
        parameters.Add("@TextoBusqueda", args.TextoBusqueda, DbType.String, size: 500);
        parameters.Add("@Estados", args.Estados, DbType.String, size: 100);
        // El store se valida en SQL con el formato compacto yyyyMMdd, igual que en los EXEC manuales.
        parameters.Add("@FechaInicio", args.FechaInicio?.ToString("yyyyMMdd", CultureInfo.InvariantCulture), DbType.String, size: 8);
        parameters.Add("@FechaFin", args.FechaFin?.ToString("yyyyMMdd", CultureInfo.InvariantCulture), DbType.String, size: 8);
        parameters.Add("@IdSite", args.IdSite, DbType.String, size: 50);
        parameters.Add("@Site", args.Site, DbType.String, size: 150);
        parameters.Add("@CorreSite", args.CorreSite, DbType.Int32);
        parameters.Add("@Cliente", args.Cliente, DbType.String, size: 150);
        parameters.Add("@Proyecto", args.Proyecto, DbType.String, size: 150);
        parameters.Add("@Responsable", args.Responsable, DbType.String, size: 150);
        parameters.Add("@Solicitante", args.Solicitante, DbType.String, size: 150);
        parameters.Add("@Ot", args.Ot, DbType.String, size: 100);
        parameters.Add("@CoincidirTodas", args.CoincidirTodas, DbType.Boolean);
        parameters.Add("@IncluirEstado99", args.IncluirEstado99, DbType.Boolean);
        parameters.Add("@Pagina", args.Pagina, DbType.Int32);
        parameters.Add("@TamanoPagina", args.TamanoPagina, DbType.Int32);
        parameters.Add("@TipoCambio", args.TipoCambio, DbType.Decimal);

        if (scope is not null)
        {
            parameters.Add("@AlcanceNivel", scope.SqlNivel, DbType.String, size: 12);
            parameters.Add("@AlcanceCampos", scope.SqlCampos, DbType.String, size: 2);
            parameters.Add("@AlcanceEmpleados", scope.SqlEmpleados, DbType.String, size: -1);
            parameters.Add("@VerTotalesGlobales", scope.CanViewGlobalTotals, DbType.Boolean);
        }

        return parameters;
    }

    private static int GetTotalRows(List<Dictionary<string, object?>> rows)
    {
        if (rows.Count == 0)
        {
            return 0;
        }

        foreach (var row in rows)
        {
            foreach (var key in new[] { "TotalRegistros", "TotalRows", "totalRegistros", "totalRows" })
            {
                if (row.TryGetValue(key, out var value) && TryConvertToInt(value, out var total))
                {
                    return total;
                }
            }
        }

        return rows.Count;
    }

    private static bool TryConvertToInt(object? value, out int result)
    {
        switch (value)
        {
            case int i:
                result = i;
                return true;
            case long l when l <= int.MaxValue && l >= int.MinValue:
                result = (int)l;
                return true;
            case short s:
                result = s;
                return true;
            case byte b:
                result = b;
                return true;
            case decimal d when d <= int.MaxValue && d >= int.MinValue:
                result = (int)d;
                return true;
            case string s when int.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed):
                result = parsed;
                return true;
            default:
                result = 0;
                return false;
        }
    }

    private static Dictionary<string, object?> MapRow(dynamic row)
    {
        var values = (IDictionary<string, object>)row;
        return values.ToDictionary(
            item => item.Key,
            item => item.Value == DBNull.Value ? null : item.Value);
    }
}

/// <summary>
/// Resultado del modo RESUMEN: grupos (dimensiones + moneda) y totales por moneda de TODO el universo filtrado.
/// Nunca contiene filas de detalle ni columnas globales.
/// </summary>
public sealed class PlanillaResumenExecutionResult
{
    public List<Dictionary<string, object?>> Groups { get; set; } = [];

    public List<Dictionary<string, object?>> TotalsByCurrency { get; set; } = [];

    /// <summary>Suma de Registros de los totales por moneda (= registros del universo filtrado).</summary>
    public int TotalRows { get; set; }
}

public sealed class PlanillaBuscarExecutionResult
{
    public List<Dictionary<string, object?>> Rows { get; set; } = [];

    public int TotalRows { get; set; }

    /// <summary>
    /// Columnas NO disponibles por permisos (vacio = todas disponibles). Una columna listada aqui no esta
    /// en las filas y NO equivale a cero.
    /// </summary>
    public IReadOnlyList<string> UnavailableColumns { get; set; } = Array.Empty<string>();
}
