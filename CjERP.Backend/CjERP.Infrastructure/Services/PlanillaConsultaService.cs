using System;
using System.Collections.Generic;
using System.Data;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Text.RegularExpressions;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;
using Microsoft.Data.SqlClient;

namespace CjERP.Infrastructure.Services
{
    public class PlanillaConsultaService : IPlanillaConsultaService
    {
        private const string StoredProcedureEstados = "dbo.sp_Planilla_Consulta_Estados";
        private const string StoredProcedureAprobar = "dbo.sp_Planilla_Consulta_Aprobar";
        private const string StoredProcedureVacaciones = "dbo.sp_EmpleadoOtros_ListarVacaciones";
        private const string StoredProcedureVacacionesTotal = "dbo.sp_EmpleadoOtros_ListarVacacionesTotal";
        private const string StoredProcedurePagadosDashboard = "dbo.sp_Planilla_ConsultarPagados_Dsh";
        private const string StoredProcedureImportarConsultaDsh = "dbo.sp_Importar_ConsultaDsh";
        private const string StoredProcedureImportarResumenOT = "dbo.sp_Importar_ResumenOT";
        private const string StoredProcedureMovimientosGastosIngresos = "dbo.sp_Movimientos_Consulta_GastosIngresos";
        private const string StoredProcedureGastosPagados = "dbo.sp_Planilla_Consulta_Gastos_Pagados";
        private const string QueryClientesActivos = "clientes-activos";
        private const string QueryProyectosActivos = "proyectos-activos";
        private readonly ISqlCommandFactory _sqlCommandFactory;

        public PlanillaConsultaService(ISqlCommandFactory sqlCommandFactory)
        {
            _sqlCommandFactory = sqlCommandFactory;
        }

        public async Task<PlanillaConsultaEstadosResponseDto> ConsultarEstadosAsync(
            IEnumerable<PlanillaConsultaParametroDto> parametros,
            string? consulta = null,
            int? maxRows = null,
            int? pageNumber = null,
            int? pageSize = null,
            CancellationToken cancellationToken = default)
        {
            await using var connection = _sqlCommandFactory.CreateConnection();

            var parametrosList = (parametros ?? []).ToList();
            var storedProcedureName = ResolveStoredProcedureName(consulta);

            if (string.Equals(storedProcedureName, QueryClientesActivos, StringComparison.OrdinalIgnoreCase))
            {
                var clienteRows = (await connection.QueryAsync(
                        _sqlCommandFactory.Create(
                            """
                            SELECT
                                IdCliente,
                                NombreCliente
                            FROM dbo.Cliente
                            WHERE Estado = 1
                            ORDER BY NombreCliente;
                            """,
                            null,
                            CommandType.Text,
                            cancellationToken,
                            commandTimeout: 120)))
                    .Select(MapRow)
                    .ToList();

                var clienteTotalRows = clienteRows.Count;
                var clienteNormalizedPageSize = pageSize.HasValue && pageSize.Value > 0 ? pageSize.Value : clienteTotalRows > 0 ? clienteTotalRows : 1;
                var clienteNormalizedPageNumber = pageNumber.HasValue && pageNumber.Value > 0 ? pageNumber.Value : 1;
                var clienteTotalPages = clienteNormalizedPageSize > 0
                    ? Math.Max(1, (int)Math.Ceiling(clienteTotalRows / (double)clienteNormalizedPageSize))
                    : 1;

                if (clienteNormalizedPageNumber > clienteTotalPages)
                {
                    clienteNormalizedPageNumber = clienteTotalPages;
                }

                var clienteSkip = clienteNormalizedPageSize > 0 ? (clienteNormalizedPageNumber - 1) * clienteNormalizedPageSize : 0;
                var clientePagedRows = clienteRows
                    .Skip(clienteSkip)
                    .Take(clienteNormalizedPageSize)
                    .ToList();

                var clienteColumns = clientePagedRows
                    .SelectMany(row => row.Keys)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();

                return new PlanillaConsultaEstadosResponseDto
                {
                    Columns = clienteColumns,
                    Rows = clientePagedRows,
                    TotalRows = clienteTotalRows,
                    PageNumber = clienteNormalizedPageNumber,
                    PageSize = clienteNormalizedPageSize,
                    TotalPages = clienteTotalPages,
                    HasPreviousPage = clienteNormalizedPageNumber > 1,
                    HasNextPage = clienteNormalizedPageNumber < clienteTotalPages,
                    MaxRowsAllowed = maxRows,
                    LimitExceeded = maxRows.HasValue && maxRows.Value > 0 && clienteTotalRows > maxRows.Value,
                    Message = null
                };
            }

            if (string.Equals(storedProcedureName, QueryProyectosActivos, StringComparison.OrdinalIgnoreCase))
            {
                var proyectoRows = (await connection.QueryAsync(
                        _sqlCommandFactory.Create(
                            """
                            SELECT DISTINCT
                                a.IdCliente,
                                b.NombreCliente,
                                a.IdProyecto,
                                c.NombreProyecto
                            FROM dbo.Importar a
                            LEFT JOIN dbo.Cliente b
                                ON b.IdCliente = a.IdCliente
                            LEFT JOIN dbo.Proyecto c
                                ON c.IdProyecto = a.IdProyecto
                            WHERE a.IdEstado = 1
                            ORDER BY
                                b.NombreCliente,
                                c.NombreProyecto;
                            """,
                            null,
                            CommandType.Text,
                            cancellationToken,
                            commandTimeout: 120)))
                    .Select(MapRow)
                    .ToList();

                var proyectoTotalRows = proyectoRows.Count;
                var proyectoNormalizedPageSize = pageSize.HasValue && pageSize.Value > 0 ? pageSize.Value : proyectoTotalRows > 0 ? proyectoTotalRows : 1;
                var proyectoNormalizedPageNumber = pageNumber.HasValue && pageNumber.Value > 0 ? pageNumber.Value : 1;
                var proyectoTotalPages = proyectoNormalizedPageSize > 0
                    ? Math.Max(1, (int)Math.Ceiling(proyectoTotalRows / (double)proyectoNormalizedPageSize))
                    : 1;

                if (proyectoNormalizedPageNumber > proyectoTotalPages)
                {
                    proyectoNormalizedPageNumber = proyectoTotalPages;
                }

                var proyectoSkip = proyectoNormalizedPageSize > 0 ? (proyectoNormalizedPageNumber - 1) * proyectoNormalizedPageSize : 0;
                var proyectoPagedRows = proyectoRows
                    .Skip(proyectoSkip)
                    .Take(proyectoNormalizedPageSize)
                    .ToList();

                var proyectoColumns = proyectoPagedRows
                    .SelectMany(row => row.Keys)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();

                return new PlanillaConsultaEstadosResponseDto
                {
                    Columns = proyectoColumns,
                    Rows = proyectoPagedRows,
                    TotalRows = proyectoTotalRows,
                    PageNumber = proyectoNormalizedPageNumber,
                    PageSize = proyectoNormalizedPageSize,
                    TotalPages = proyectoTotalPages,
                    HasPreviousPage = proyectoNormalizedPageNumber > 1,
                    HasNextPage = proyectoNormalizedPageNumber < proyectoTotalPages,
                    MaxRowsAllowed = maxRows,
                    LimitExceeded = maxRows.HasValue && maxRows.Value > 0 && proyectoTotalRows > maxRows.Value,
                    Message = null
                };
            }

            parametrosList = await EnsureBancoIdParameterAsync(
                connection,
                parametrosList,
                storedProcedureName,
                cancellationToken);
            var parametrosFiltrados = FilterParametersForStoredProcedure(storedProcedureName, parametrosList);
            var dynamicParameters = BuildParameters(parametrosFiltrados);

            var rows = (await connection.QueryAsync(
                _sqlCommandFactory.Create(
                    storedProcedureName,
                    dynamicParameters,
                    CommandType.StoredProcedure,
                    cancellationToken,
                    commandTimeout: 120)))
                .Select(MapRow)
                .ToList();

            if (string.Equals(storedProcedureName, StoredProcedurePagadosDashboard, StringComparison.OrdinalIgnoreCase))
            {
                rows = ApplyPagadosDashboardFilters(rows, parametrosList);
            }

            if (string.Equals(storedProcedureName, StoredProcedureImportarConsultaDsh, StringComparison.OrdinalIgnoreCase))
            {
                rows = ApplyImportarConsultaDshFilters(rows, parametrosList);
            }

            var totalRows = rows.Count;
            var normalizedPageSize = pageSize.HasValue && pageSize.Value > 0 ? pageSize.Value : totalRows > 0 ? totalRows : 1;
            var normalizedPageNumber = pageNumber.HasValue && pageNumber.Value > 0 ? pageNumber.Value : 1;
            var totalPages = normalizedPageSize > 0
                ? Math.Max(1, (int)Math.Ceiling(totalRows / (double)normalizedPageSize))
                : 1;

            if (normalizedPageNumber > totalPages)
            {
                normalizedPageNumber = totalPages;
            }

            var limitExceeded = maxRows.HasValue && maxRows.Value > 0 && totalRows > maxRows.Value;
            var skip = normalizedPageSize > 0 ? (normalizedPageNumber - 1) * normalizedPageSize : 0;
            var pagedRows = rows
                .Skip(skip)
                .Take(normalizedPageSize)
                .ToList();

            if (!limitExceeded)
            {
                await EnrichRowsWithFacturaDataAsync(connection, pagedRows, cancellationToken);
            }

            var columns = pagedRows
                .SelectMany(row => row.Keys)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            return new PlanillaConsultaEstadosResponseDto
            {
                Columns = columns,
                Rows = limitExceeded ? [] : pagedRows,
                TotalRows = totalRows,
                PageNumber = normalizedPageNumber,
                PageSize = normalizedPageSize,
                TotalPages = totalPages,
                HasPreviousPage = normalizedPageNumber > 1,
                HasNextPage = normalizedPageNumber < totalPages,
                MaxRowsAllowed = maxRows,
                LimitExceeded = limitExceeded,
                Message = limitExceeded
                    ? $"Se encontraron {totalRows} registros. El máximo permitido para mostrar es {maxRows}. Aplique más filtros, preferiblemente por rango de fechas."
                    : null
            };
        }

        public async Task<PlanillaConsultaEstadosResponseDto> ConsultarGastosPagadosPorIdAsync(
            int id,
            CancellationToken cancellationToken = default)
        {
            await using var connection = _sqlCommandFactory.CreateConnection();

            var dynamicParameters = new DynamicParameters();
            dynamicParameters.Add("@id", id, DbType.Int32);

            var rows = (await connection.QueryAsync(
                _sqlCommandFactory.Create(
                    StoredProcedureGastosPagados,
                    dynamicParameters,
                    CommandType.StoredProcedure,
                    cancellationToken,
                    commandTimeout: 120)))
                .Select(MapRow)
                .ToList();

            if (rows.Count > 0)
            {
                await EnrichRowsWithFacturaDataAsync(connection, rows, cancellationToken);
            }

            var columns = rows
                .SelectMany(row => row.Keys)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            return new PlanillaConsultaEstadosResponseDto
            {
                Columns = columns,
                Rows = rows,
                TotalRows = rows.Count,
                PageNumber = 1,
                PageSize = rows.Count > 0 ? rows.Count : 1,
                TotalPages = 1,
                HasPreviousPage = false,
                HasNextPage = false,
                MaxRowsAllowed = null,
                LimitExceeded = false,
                Message = rows.Count > 0 ? null : "No encontrado"
            };
        }

        private static string ResolveStoredProcedureName(string? consulta)
        {
            return (consulta ?? string.Empty).Trim().ToLowerInvariant() switch
            {
                "aprobar" => StoredProcedureAprobar,
                "vacaciones" => StoredProcedureVacaciones,
                "vacaciones-total" => StoredProcedureVacacionesTotal,
                "pagados-dashboard" => StoredProcedurePagadosDashboard,
                "importar-consulta-dsh" => StoredProcedureImportarConsultaDsh,
                "importar-resumen-ot" => StoredProcedureImportarResumenOT,
                "movimientos-gastos-ingresos" => StoredProcedureMovimientosGastosIngresos,
                "clientes-activos" => QueryClientesActivos,
                "proyectos-activos" => QueryProyectosActivos,
                _ => StoredProcedureEstados
            };
        }

        private static List<Dictionary<string, object?>> ApplyFecIngresoFilter(
            List<Dictionary<string, object?>> rows,
            DateTime? fechaInicio,
            DateTime? fechaFin)
        {
            if (!fechaInicio.HasValue && !fechaFin.HasValue)
            {
                return rows;
            }

            return rows
                .Where(row =>
                {
                    var fechaRegistro = TryGetDate(row, "FecIngreso", "fecIngreso", "fecingreso");

                    if (!fechaRegistro.HasValue)
                    {
                        return false;
                    }

                    var date = fechaRegistro.Value.Date;

                    if (fechaInicio.HasValue && date < fechaInicio.Value.Date)
                    {
                        return false;
                    }

                    if (fechaFin.HasValue && date > fechaFin.Value.Date)
                    {
                        return false;
                    }

                    return true;
                })
                .ToList();
        }

        private static List<Dictionary<string, object?>> ApplyPagadosDashboardFilters(
            List<Dictionary<string, object?>> rows,
            IEnumerable<PlanillaConsultaParametroDto> parametros)
        {
            var idCliente = GetIntParameterValue(parametros, "IdCliente");
            var idProyecto = GetIntParameterValue(parametros, "IdProyecto");
            var idSite = GetStringParameterValue(parametros, "IdSite");
            var correlativo = GetIntParameterValue(parametros, "Correlativo");

            if (!idCliente.HasValue &&
                !idProyecto.HasValue &&
                string.IsNullOrWhiteSpace(idSite) &&
                !correlativo.HasValue)
            {
                return rows;
            }

            return rows
                .Where(row =>
                {
                    if (idCliente.HasValue && (TryGetInt(row, "IdCliente") ?? -1) != idCliente.Value)
                    {
                        return false;
                    }

                    if (idProyecto.HasValue && (TryGetInt(row, "IdProyecto") ?? -1) != idProyecto.Value)
                    {
                        return false;
                    }

                    if (!string.IsNullOrWhiteSpace(idSite))
                    {
                        var rowIdSite = TryGetString(row, "IdSite", "idSite", "IDSITE", "id_site");
                        if (!string.Equals(rowIdSite?.Trim(), idSite.Trim(), StringComparison.OrdinalIgnoreCase))
                        {
                            return false;
                        }
                    }

                    if (correlativo.HasValue)
                    {
                        var rowCorrelativo =
                            TryGetInt(row, "Correlativo") ??
                            TryGetInt(row, "Corre") ??
                            TryGetInt(row, "CorSite") ??
                            TryGetInt(row, "Id");

                        if (rowCorrelativo != correlativo.Value)
                        {
                            return false;
                        }
                    }

                    return true;
                })
                .ToList();
        }

        private static List<Dictionary<string, object?>> ApplyImportarConsultaDshFilters(
            List<Dictionary<string, object?>> rows,
            IEnumerable<PlanillaConsultaParametroDto> parametros)
        {
            var fechaInicio = GetDateParameterValue(parametros, "FechaInicio");
            var fechaFin = GetDateParameterValue(parametros, "FechaFin");

            if (!fechaInicio.HasValue && !fechaFin.HasValue)
            {
                return rows;
            }

            var yearStart = fechaInicio?.Year;
            var yearEnd = fechaFin?.Year;

            return rows
                .Where(row =>
                {
                    var rowYear = TryGetYear(row, "AnoGestion", "anoGestion", "Ano", "ano");

                    if (!rowYear.HasValue)
                    {
                        return false;
                    }

                    if (yearStart.HasValue && rowYear.Value < yearStart.Value)
                    {
                        return false;
                    }

                    if (yearEnd.HasValue && rowYear.Value > yearEnd.Value)
                    {
                        return false;
                    }

                    return true;
                })
                .ToList();
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

            var facturaRows = new Dictionary<int, Dictionary<string, object?>>();
            const int maxCorrelativosPorLote = 2000;

            for (var i = 0; i < correlativos.Count; i += maxCorrelativosPorLote)
            {
                var correlativosLote = correlativos
                    .Skip(i)
                    .Take(maxCorrelativosPorLote)
                    .ToList();

                var facturaRowsLote = (await connection.QueryAsync(
                    CreateCommand(
                        sql,
                        new { Correlativos = correlativosLote },
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

                foreach (var item in facturaRowsLote)
                {
                    facturaRows[item.Key] = item.Value;
                }
            }

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

        private static IEnumerable<PlanillaConsultaParametroDto> FilterParametersForStoredProcedure(
            string storedProcedureName,
            IEnumerable<PlanillaConsultaParametroDto> parametros)
        {
            if (!string.Equals(storedProcedureName, StoredProcedureAprobar, StringComparison.OrdinalIgnoreCase))
            {
                if (string.Equals(storedProcedureName, StoredProcedureVacaciones, StringComparison.OrdinalIgnoreCase))
                {
                    var allowedParametersVacaciones = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                    {
                        "FechaInicial",
                        "FechaFinal",
                        "IdEstado",
                        "NombreEmpleado",
                        "IdEmpleado"
                    };

                    return parametros.Where(parametro =>
                        !string.IsNullOrWhiteSpace(parametro.Nombre) &&
                        allowedParametersVacaciones.Contains(parametro.Nombre.Trim().TrimStart('@')));
                }

                if (string.Equals(storedProcedureName, StoredProcedureVacacionesTotal, StringComparison.OrdinalIgnoreCase))
                {
                    var allowedParametersVacacionesTotal = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                    {
                        "FechaInicial",
                        "FechaFinal",
                        "NombreEmpleado",
                        "IdEmpresa",
                        "IdEmpleado"
                    };

                    return parametros.Where(parametro =>
                        !string.IsNullOrWhiteSpace(parametro.Nombre) &&
                        allowedParametersVacacionesTotal.Contains(parametro.Nombre.Trim().TrimStart('@')));
                }

                if (string.Equals(storedProcedureName, StoredProcedurePagadosDashboard, StringComparison.OrdinalIgnoreCase))
                {
                    var allowedParametersPagadosDashboard = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                    {
                        "FechaInicio",
                        "FechaFin",
                        "TextoBusqueda"
                    };

                    return parametros.Where(parametro =>
                        !string.IsNullOrWhiteSpace(parametro.Nombre) &&
                        allowedParametersPagadosDashboard.Contains(parametro.Nombre.Trim().TrimStart('@')));
                }

                if (string.Equals(storedProcedureName, StoredProcedureImportarConsultaDsh, StringComparison.OrdinalIgnoreCase))
                {
                    // Este SP no recibe parámetros.
                    return Enumerable.Empty<PlanillaConsultaParametroDto>();
                }

                if (string.Equals(storedProcedureName, StoredProcedureImportarResumenOT, StringComparison.OrdinalIgnoreCase))
                {
                    var allowedParametersImportarResumenOT = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                    {
                        "OT",
                        "IdCliente",
                        "IdProyecto",
                        "IdSite",
                        "Correlativo",
                        "TipoTrabajo"
                    };

                    return parametros.Where(parametro =>
                        !string.IsNullOrWhiteSpace(parametro.Nombre) &&
                        allowedParametersImportarResumenOT.Contains(parametro.Nombre.Trim().TrimStart('@')));
                }

                return parametros;
            }

            var allowedParameters = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "IdSolicitante",
                "IdValidador",
                "IdBanco",
                "Estados",
                "FechaInicio",
                "FechaFin",
                "FechaDeposito",
                "IncluirEstado99",
                "TipoCambio"
            };

            return parametros.Where(parametro =>
                !string.IsNullOrWhiteSpace(parametro.Nombre) &&
                allowedParameters.Contains(parametro.Nombre.Trim().TrimStart('@')));
        }

        private async Task<List<PlanillaConsultaParametroDto>> EnsureBancoIdParameterAsync(
            SqlConnection connection,
            List<PlanillaConsultaParametroDto> parametros,
            string storedProcedureName,
            CancellationToken cancellationToken)
        {
            if (!string.Equals(storedProcedureName, StoredProcedureEstados, StringComparison.OrdinalIgnoreCase))
            {
                return parametros;
            }

            if (parametros.Any(parametro =>
                string.Equals(
                    parametro.Nombre?.Trim().TrimStart('@'),
                    "IdBanco",
                    StringComparison.OrdinalIgnoreCase)))
            {
                return parametros;
            }

            var codigoBanco = GetStringParameterValue(parametros, "CodigoBanco");
            if (string.IsNullOrWhiteSpace(codigoBanco))
            {
                return parametros;
            }

            var idBanco = await connection.QueryFirstOrDefaultAsync<int?>(
                CreateCommand(
                    @"
SELECT TOP 1 IdBanco
FROM dbo.Bancos
WHERE Codigo = @CodigoBanco
  AND Activo = 1",
                    new { CodigoBanco = codigoBanco.Trim() },
                    CommandType.Text,
                    cancellationToken,
                    commandTimeout: 30));

            if (!idBanco.HasValue || idBanco.Value <= 0)
            {
                throw new InvalidOperationException($"No se encontro un banco activo con codigo {codigoBanco}.");
            }

            var resolved = new List<PlanillaConsultaParametroDto>(parametros)
            {
                new()
                {
                    Nombre = "IdBanco",
                    Valor = idBanco.Value.ToString(CultureInfo.InvariantCulture),
                    Tipo = "int"
                }
            };

            return resolved;
        }

        private static Dictionary<string, object?> MapRow(dynamic row)
        {
            var data = (IDictionary<string, object>)row;
            var result = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

            foreach (var item in data)
            {
                if (string.IsNullOrWhiteSpace(item.Key))
                {
                    continue;
                }

                // Algunos SP devuelven aliases repetidos o que solo difieren en casing.
                // En ese caso conservamos el ultimo valor en lugar de lanzar un 500.
                result[item.Key] = NormalizeValue(item.Value);
            }

            if (!result.ContainsKey("Serie"))
            {
                var serieAlias = GetFirstExistingValue(result, "Serie", "serie", "Documento", "documento", "SerieDocumento", "serieDocumento", "SerieFactura", "serieFactura");

                if (serieAlias is not null)
                {
                    result["Serie"] = serieAlias;
                }
            }

            return result;
        }

        private static object? GetFirstExistingValue(
            IReadOnlyDictionary<string, object?> row,
            params string[] keys)
        {
            foreach (var key in keys)
            {
                if (row.TryGetValue(key, out var value) && value is not null)
                {
                    return value;
                }
            }

            return null;
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

        private static string? GetStringParameterValue(
            IEnumerable<PlanillaConsultaParametroDto> parametros,
            string parameterName)
        {
            var parametro = parametros.FirstOrDefault(p =>
                string.Equals(
                    p.Nombre?.Trim().TrimStart('@'),
                    parameterName,
                    StringComparison.OrdinalIgnoreCase));

            var value = parametro?.Valor?.Trim();
            return string.IsNullOrWhiteSpace(value) ? null : value;
        }

        private static int? GetIntParameterValue(
            IEnumerable<PlanillaConsultaParametroDto> parametros,
            string parameterName)
        {
            var value = GetStringParameterValue(parametros, parameterName);

            return int.TryParse(value, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed)
                ? parsed
                : null;
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

        private static string? TryGetString(
            IReadOnlyDictionary<string, object?> row,
            params string[] keys)
        {
            foreach (var key in keys)
            {
                if (!row.TryGetValue(key, out var rawValue) || rawValue is null)
                {
                    continue;
                }

                var text = rawValue.ToString()?.Trim();

                if (!string.IsNullOrWhiteSpace(text))
                {
                    return text;
                }
            }

            return null;
        }

        private static DateTime? TryGetDate(
            IReadOnlyDictionary<string, object?> row,
            params string[] keys)
        {
            foreach (var key in keys)
            {
                if (!row.TryGetValue(key, out var rawValue) || rawValue is null)
                {
                    continue;
                }

                switch (rawValue)
                {
                    case DateTime dateTime:
                        return dateTime;
                    case DateTimeOffset dateTimeOffset:
                        return dateTimeOffset.DateTime;
                }

                var text = rawValue.ToString()?.Trim();

                if (string.IsNullOrWhiteSpace(text))
                {
                    continue;
                }

                var dateText = text.Split(' ', 'T')[0].Trim();

                if (string.IsNullOrWhiteSpace(dateText))
                {
                    continue;
                }

                if (DateTime.TryParseExact(dateText, "MMddyyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var compactUsDate))
                {
                    return compactUsDate;
                }

                if (DateTime.TryParseExact(dateText, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var isoDate))
                {
                    return isoDate;
                }

                if (DateTime.TryParseExact(dateText, "MM/dd/yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var usDate))
                {
                    return usDate;
                }

                if (DateTime.TryParseExact(dateText, "dd/MM/yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var peruDate))
                {
                    return peruDate;
                }

                if (DateTime.TryParse(dateText, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDate))
                {
                    return parsedDate;
                }
            }

            return null;
        }

        private static int? TryGetYear(
            IReadOnlyDictionary<string, object?> row,
            params string[] keys)
        {
            var text = TryGetString(row, keys);

            if (string.IsNullOrWhiteSpace(text))
            {
                return null;
            }

            if (int.TryParse(text, NumberStyles.Any, CultureInfo.InvariantCulture, out var year) && year > 0)
            {
                return year;
            }

            if (DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDate))
            {
                return parsedDate.Year;
            }

            var match = Regex.Match(text, @"\b(19|20)\d{2}\b");
            if (match.Success && int.TryParse(match.Value, NumberStyles.Any, CultureInfo.InvariantCulture, out var matchedYear))
            {
                return matchedYear;
            }

            return null;
        }

        private static DateTime? GetDateParameterValue(
            IEnumerable<PlanillaConsultaParametroDto> parametros,
            string parameterName)
        {
            var parametro = parametros.FirstOrDefault(p =>
                string.Equals(
                    p.Nombre?.Trim().TrimStart('@'),
                    parameterName,
                    StringComparison.OrdinalIgnoreCase));

            if (parametro is null || string.IsNullOrWhiteSpace(parametro.Valor))
            {
                return null;
            }

            var value = parametro.Valor.Trim();
            var dateText = value.Split(' ', 'T')[0].Trim();

            if (DateTime.TryParseExact(dateText, "MMddyyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var compactUsDate))
            {
                return compactUsDate;
            }

            if (DateTime.TryParseExact(dateText, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var isoDate))
            {
                return isoDate;
            }

            if (DateTime.TryParseExact(dateText, "MM/dd/yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var usDate))
            {
                return usDate;
            }

            if (DateTime.TryParseExact(dateText, "dd/MM/yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var peruDate))
            {
                return peruDate;
            }

            if (DateTime.TryParse(dateText, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDate))
            {
                return parsedDate;
            }

            return null;
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
                "date" or "datetime" => TryParseDateValue(rawValue),
                _ => rawValue.Trim()
            };
        }

        private static DateTime? TryParseDateValue(string rawValue)
        {
            var value = rawValue.Trim();

            if (string.IsNullOrWhiteSpace(value))
            {
                return null;
            }

            var dateText = value.Split(' ', 'T')[0].Trim();

            if (DateTime.TryParseExact(dateText, "MMddyyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var compactUsDate))
            {
                return compactUsDate;
            }

            if (DateTime.TryParseExact(dateText, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var isoDate))
            {
                return isoDate;
            }

            if (DateTime.TryParseExact(dateText, "MM/dd/yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var usDate))
            {
                return usDate;
            }

            if (DateTime.TryParseExact(dateText, "dd/MM/yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var peruDate))
            {
                return peruDate;
            }

            return DateTime.TryParse(dateText, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDate)
                ? parsedDate
                : null;
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


