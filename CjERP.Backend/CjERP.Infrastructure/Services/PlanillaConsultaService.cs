using System;
using System.Collections.Generic;
using System.Data;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;
using Microsoft.Data.SqlClient;

namespace CjERP.Infrastructure.Services
{
    public class PlanillaConsultaService : IPlanillaConsultaService
    {
        private const string StoredProcedureName = "dbo.sp_Planilla_Consulta_Estados";
        private readonly ISqlCommandFactory _sqlCommandFactory;

        public PlanillaConsultaService(ISqlCommandFactory sqlCommandFactory)
        {
            _sqlCommandFactory = sqlCommandFactory;
        }

        public async Task<PlanillaConsultaEstadosResponseDto> ConsultarEstadosAsync(
            IEnumerable<PlanillaConsultaParametroDto> parametros,
            CancellationToken cancellationToken = default)
        {
            await using var connection = _sqlCommandFactory.CreateConnection();

            var dynamicParameters = BuildParameters(parametros ?? []);

            var rows = (await connection.QueryAsync(
                _sqlCommandFactory.Create(
                    StoredProcedureName,
                    dynamicParameters,
                    CommandType.StoredProcedure,
                    cancellationToken,
                    commandTimeout: 120)))
                .Select(MapRow)
                .ToList();

            await EnrichRowsWithFacturaDataAsync(connection, rows, cancellationToken);

            var columns = rows
                .SelectMany(row => row.Keys)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            return new PlanillaConsultaEstadosResponseDto
            {
                Columns = columns,
                Rows = rows
            };
        }

        private CommandDefinition CreateCommand(
            string sql,
            object? parameters = null,
            CommandType? commandType = null,
            CancellationToken cancellationToken = default,
            int? commandTimeout = null)
        {
            return _sqlCommandFactory.Create(sql, parameters, commandType, cancellationToken, commandTimeout);
        }

        private async Task EnrichRowsWithFacturaDataAsync(
            SqlConnection connection,
            List<Dictionary<string, object?>> rows,
            CancellationToken cancellationToken)
        {
            var correlativos = rows
                .Select(row => TryGetInt(row, "Corre") ?? TryGetInt(row, "Correlativo") ?? TryGetInt(row, "Id"))
                .Where(value => value.HasValue && value.Value > 0)
                .Select(value => value!.Value)
                .Distinct()
                .ToList();

            if (correlativos.Count == 0)
            {
                return;
            }

            var availableColumns = (await connection.QueryAsync<string>(
                CreateCommand(
                    @"
SELECT c.name
FROM sys.columns c
INNER JOIN sys.objects o ON o.object_id = c.object_id
INNER JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE s.name = 'dbo'
  AND o.name = 'Planilla'
  AND c.name IN @ColumnNames",
                    new
                    {
                        ColumnNames = new[]
                        {
                            "Correlativo",
                            "Observacion",
                            "RutaFactura",
                            "RutaFacturaOriginal",
                            "RutaFacturaUrl",
                            "RutaFacturaEnviada",
                            "IdUsuarioFactura",
                        }
                    },
                    CommandType.Text,
                    cancellationToken)))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            if (!availableColumns.Contains("Correlativo"))
            {
                return;
            }

            var selectColumns = new List<string> { "Correlativo" };

            foreach (var optionalColumn in new[]
                     {
                         "Comentario",
                         "RutaFactura",
                         "RutaFacturaOriginal",
                         "RutaFacturaUrl",
                         "RutaFacturaEnviada",
                         "IdUsuarioFactura",
                         "imgFactura"
                     })
            {
                if (availableColumns.Contains(optionalColumn))
                {
                    selectColumns.Add(optionalColumn);
                }
            }

            var sql = $@"
SELECT
    {string.Join("," + Environment.NewLine + "    ", selectColumns)}
FROM Planilla
WHERE Correlativo IN @Correlativos";

            var facturaRows = (await connection.QueryAsync(
                CreateCommand(
                    sql,
                    new { Correlativos = correlativos },
                    CommandType.Text,
                    cancellationToken,
                    commandTimeout: 120)))
                .Select(MapRow)
                .Select(row => new
                {
                    Correlativo = TryGetInt(row, "Correlativo") ?? 0,
                    Row = row
                })
                .Where(item => item.Correlativo > 0)
                .GroupBy(item => item.Correlativo)
                .ToDictionary(
                    group => group.Key,
                    group => group
                        .Select(item => item.Row)
                        .First());

            foreach (var row in rows)
            {
                var correlativo = TryGetInt(row, "Corre") ?? TryGetInt(row, "Correlativo") ?? TryGetInt(row, "Id");

                if (!correlativo.HasValue || correlativo.Value <= 0)
                {
                    continue;
                }

                if (!facturaRows.TryGetValue(correlativo.Value, out var facturaData))
                {
                    continue;
                }

                foreach (var item in facturaData)
                {
                    if (string.Equals(item.Key, "Correlativo", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    if (!row.ContainsKey(item.Key) || row[item.Key] is null)
                    {
                        row[item.Key] = item.Value;
                    }
                }
            }
        }

        private static DynamicParameters BuildParameters(IEnumerable<PlanillaConsultaParametroDto> parametros)
        {
            var dynamicParameters = new DynamicParameters();

            foreach (var parametro in parametros)
            {
                if (string.IsNullOrWhiteSpace(parametro.Nombre))
                {
                    continue;
                }

                dynamicParameters.Add(
                    "@" + parametro.Nombre.Trim().TrimStart('@'),
                    ParseValue(parametro.Valor, parametro.Tipo),
                    ResolveDbType(parametro.Tipo));
            }

            return dynamicParameters;
        }

        private static Dictionary<string, object?> MapRow(dynamic row)
        {
            var data = (IDictionary<string, object>)row;

            return data.ToDictionary(
                item => item.Key,
                item => NormalizeValue(item.Value),
                StringComparer.OrdinalIgnoreCase);
        }

        private static object? NormalizeValue(object? value)
        {
            if (value == null || value == DBNull.Value)
            {
                return null;
            }

            return value switch
            {
                DateTime dateValue => dateValue.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
                DateTimeOffset dateOffsetValue => dateOffsetValue.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
                _ => value
            };
        }

        private static int? TryGetInt(
            IReadOnlyDictionary<string, object?> row,
            string key)
        {
            if (!row.TryGetValue(key, out var rawValue) || rawValue is null)
            {
                return null;
            }

            return rawValue switch
            {
                int intValue => intValue,
                long longValue when longValue <= int.MaxValue && longValue >= int.MinValue => (int)longValue,
                decimal decimalValue when decimalValue <= int.MaxValue && decimalValue >= int.MinValue => (int)decimalValue,
                _ => int.TryParse(rawValue.ToString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed)
                    ? parsed
                    : null
            };
        }

        private static object? ParseValue(string? rawValue, string? rawType)
        {
            if (string.IsNullOrWhiteSpace(rawValue))
            {
                return null;
            }

            var type = (rawType ?? "string").Trim().ToLowerInvariant();

            return type switch
            {
                "int" or "integer" => int.TryParse(rawValue, NumberStyles.Any, CultureInfo.InvariantCulture, out var intValue)
                    ? intValue
                    : null,
                "decimal" or "number" => decimal.TryParse(rawValue, NumberStyles.Any, CultureInfo.InvariantCulture, out var decimalValue)
                    ? decimalValue
                    : null,
                "bool" or "boolean" => bool.TryParse(rawValue, out var boolValue)
                    ? boolValue
                    : null,
                "date" or "datetime" => DateTime.TryParse(rawValue, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dateValue)
                    ? dateValue
                    : null,
                _ => rawValue.Trim()
            };
        }

        private static DbType? ResolveDbType(string? rawType)
        {
            var type = (rawType ?? "string").Trim().ToLowerInvariant();

            return type switch
            {
                "int" or "integer" => DbType.Int32,
                "decimal" or "number" => DbType.Decimal,
                "bool" or "boolean" => DbType.Boolean,
                "date" => DbType.Date,
                "datetime" => DbType.DateTime,
                _ => DbType.String
            };
        }
    }
}
