// Extraido de IaChatService.cs en Fase 1.3 (docs/AI_COPILOT_IMPLEMENTATION_PLAN.md).
// Codigo movido tal cual: no se cambio ningun comportamiento, solo la ubicacion. Este componente
// es el UNICO punto del sistema que ejecuta dbo.sp_IA_Planilla_Buscar; no decide filtros, no arma
// prompts ni analiza resultados. IaChatService.cs sigue coordinando y delega aqui la obtencion de
// datos.
using System.Data;
using System.Globalization;
using Dapper;
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

    public async Task<PlanillaBuscarExecutionResult> EjecutarBuscarPlanillaAsync(
        BuscarPlanillaArgs args,
        CancellationToken cancellationToken,
        bool fetchAllPages = false)
    {
        var rows = await EjecutarBuscarPlanillaPageAsync(args, cancellationToken);

        if (fetchAllPages)
        {
            var totalRows = GetTotalRows(rows);
            var pageSize = Math.Clamp(args.TamanoPagina, 1, MaxPageSize);
            var accumulatedRows = new List<Dictionary<string, object?>>(rows);
            var nextPage = args.Pagina + 1;

            while (accumulatedRows.Count < totalRows && accumulatedRows.Count < MaxLocalAggregationRows)
            {
                var nextArgs = new BuscarPlanillaArgs
                {
                    TextoBusqueda = args.TextoBusqueda,
                    Estados = args.Estados,
                    FechaInicio = args.FechaInicio,
                    FechaFin = args.FechaFin,
                    IdSolicitante = args.IdSolicitante,
                    IdValidador = args.IdValidador,
                    IdCliente = args.IdCliente,
                    IdProyecto = args.IdProyecto,
                    IdSite = args.IdSite,
                    CorreSite = args.CorreSite,
                    Cliente = args.Cliente,
                    Proyecto = args.Proyecto,
                    Responsable = args.Responsable,
                    Solicitante = args.Solicitante,
                    Ot = args.Ot,
                    CoincidirTodas = args.CoincidirTodas,
                    IncluirEstado99 = args.IncluirEstado99,
                    Pagina = nextPage,
                    TamanoPagina = pageSize,
                    TipoCambio = args.TipoCambio
                };

                var nextPageRows = await EjecutarBuscarPlanillaPageAsync(nextArgs, cancellationToken);
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

        return new PlanillaBuscarExecutionResult
        {
            Rows = rows,
            TotalRows = GetTotalRows(rows)
        };
    }

    private async Task<List<Dictionary<string, object?>>> EjecutarBuscarPlanillaPageAsync(
        BuscarPlanillaArgs args,
        CancellationToken cancellationToken)
    {
        await using var connection = _sqlCommandFactory.CreateConnection();

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

public sealed class PlanillaBuscarExecutionResult
{
    public List<Dictionary<string, object?>> Rows { get; set; } = [];

    public int TotalRows { get; set; }
}
