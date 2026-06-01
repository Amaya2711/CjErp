using System.Data;
using System.Globalization;
using System.Text.Json;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;

namespace CjERP.Infrastructure.Services
{
    public class PlanillaService : IPlanillaService
    {
        private const string VigenteStoredProcedureName = "dbo.sp_SuministroProvisional_ObtenerVigente";
        private const string InsertStoredProcedureName = "dbo.sp_Planilla_Insertar";
        private const string UpdateStoredProcedureName = "dbo.sp_Planilla_Actualizar";
        private const string UpdateStatusStoredProcedureName = "dbo.sp_Planilla_ActualizarEstado";

        private readonly ISqlCommandFactory _sqlCommandFactory;
        private readonly ILogger<PlanillaService> _logger;

        public PlanillaService(ISqlCommandFactory sqlCommandFactory, ILogger<PlanillaService> logger)
        {
            _sqlCommandFactory = sqlCommandFactory;
            _logger = logger;
        }

        public async Task<IReadOnlyList<SuministroProvisionalVigenteDto>> ObtenerSuministrosProvisionalesVigentesAsync(
            SuministroProvisionalVigenteRequestDto request,
            CancellationToken cancellationToken = default)
        {
            await using var connection = _sqlCommandFactory.CreateConnection();
            var parameters = await BuildSuministroVigenteParametersAsync(connection, request, cancellationToken);

            var rows = await connection.QueryAsync(
                _sqlCommandFactory.Create(
                    VigenteStoredProcedureName,
                    parameters,
                    CommandType.StoredProcedure,
                    cancellationToken));

            return rows.Select(MapSuministroVigenteRow).ToList();
        }

        public async Task InsertarPlanillaAsync(PlanillaInsertRequestDto request, CancellationToken cancellationToken = default)
        {
            await using var connection = _sqlCommandFactory.CreateConnection();

            var parameters = BuildPlanillaParameters(request);

            var logObject = new
            {
                IdProyecto = request.IdProyecto,
                IdSite = request.IdSite,
                CorreSite = request.CorreSite,
                IdTipoTrabajo = 0,
                IdTarea = request.IdTarea,
                Detalle = request.Detalle,
                IdResponsable = ParseRequiredInt(request.Responsable, nameof(request.Responsable)),
                IdCliente = request.IdCliente,
                IdBien = ParseRequiredInt(request.Bien, nameof(request.Bien)),
                IdComprobante = ParseRequiredInt(request.Comprobante, nameof(request.Comprobante)),
                RUC = request.Ruc,
                Serie = request.Serie,
                IdTipoPago = ParseRequiredInt(request.TipoPago, nameof(request.TipoPago)),
                TipoMoneda = ParseRequiredInt(request.Moneda, nameof(request.Moneda)),
                Total = request.Total ?? request.Monto,
                Subtotal = request.Subtotal ?? request.Monto,
                Igv = request.Igv ?? 0m,
                IdRendicion = request.IdRendicion,
                Comentario = request.Comentario,
                IdSolicitante = ParseRequiredInt(request.Solicitante, nameof(request.Solicitante)),
                IdGestor = ParseRequiredInt(request.Gestor, nameof(request.Gestor)),
                IdValidador = ParseRequiredInt(request.Validador, nameof(request.Validador)),
                FechaPropuesta = DateTime.Now,
                IdBancoCta = request.IdBancoCta,
                Cuenta = request.CuentaNumero,
                CuentaInter = request.CuentaInter,
                NombreCta = request.NombreCta,
                TipoTrabajo = request.TipoTrabajo,
                SiteNombre = request.SiteNombre,
                Usuario = request.Usuario,
                Ot = request.Ot,
                TipoCambio = request.TipoCambio ?? 0m,
                FecEmision = request.FechaEmision,
                RutaFacturaOriginal = request.FacturaPath,
                RutaFacturaUrl = request.FacturaUrl,
                RutaFacturaEnviada = request.FacturaPath,
                IdUsuarioFactura = request.IdUsuarioFactura,
                FechaVencimiento = request.FechaVencimiento
            };

            _logger.LogInformation(
                "[PlanillaService] ParÃ¡metros enviados a sp_Planilla_Insertar:{NewLine}{Payload}",
                Environment.NewLine,
                JsonSerializer.Serialize(logObject, new JsonSerializerOptions { WriteIndented = true }));

            await connection.ExecuteAsync(
                _sqlCommandFactory.Create(
                    InsertStoredProcedureName,
                    parameters,
                    CommandType.StoredProcedure,
                    cancellationToken,
                    commandTimeout: 120));
        }

        public async Task ActualizarPlanillaAsync(PlanillaUpdateRequestDto request, CancellationToken cancellationToken = default)
        {
            await using var connection = _sqlCommandFactory.CreateConnection();

            var parameters = BuildPlanillaParameters(request);
            parameters.Add("@Correlativo", request.Correlativo, DbType.Int32);

            var logObject = new
            {
                Correlativo = request.Correlativo,
                IdProyecto = request.IdProyecto,
                IdSite = request.IdSite,
                CorreSite = request.CorreSite,
                IdTipoTrabajo = 0,
                IdTarea = request.IdTarea,
                Detalle = request.Detalle,
                IdResponsable = ParseRequiredInt(request.Responsable, nameof(request.Responsable)),
                IdCliente = request.IdCliente,
                IdBien = ParseRequiredInt(request.Bien, nameof(request.Bien)),
                IdComprobante = ParseRequiredInt(request.Comprobante, nameof(request.Comprobante)),
                RUC = request.Ruc,
                Serie = request.Serie,
                IdTipoPago = ParseRequiredInt(request.TipoPago, nameof(request.TipoPago)),
                TipoMoneda = ParseRequiredInt(request.Moneda, nameof(request.Moneda)),
                Total = request.Total ?? request.Monto,
                Subtotal = request.Subtotal ?? request.Monto,
                Igv = request.Igv ?? 0m,
                IdRendicion = request.IdRendicion,
                Comentario = request.Comentario,
                IdSolicitante = ParseRequiredInt(request.Solicitante, nameof(request.Solicitante)),
                IdGestor = ParseRequiredInt(request.Gestor, nameof(request.Gestor)),
                IdValidador = ParseRequiredInt(request.Validador, nameof(request.Validador)),
                FechaPropuesta = DateTime.Now,
                IdBancoCta = request.IdBancoCta,
                Cuenta = request.CuentaNumero,
                CuentaInter = request.CuentaInter,
                NombreCta = request.NombreCta,
                TipoTrabajo = request.TipoTrabajo,
                SiteNombre = request.SiteNombre,
                Usuario = request.Usuario,
                Ot = request.Ot,
                TipoCambio = request.TipoCambio ?? 0m,
                FecEmision = request.FechaEmision,
                RutaFacturaOriginal = request.FacturaPath,
                RutaFacturaUrl = request.FacturaUrl,
                RutaFacturaEnviada = request.FacturaPath,
                IdUsuarioFactura = request.IdUsuarioFactura,
                FechaVencimiento = request.FechaVencimiento
            };

            _logger.LogInformation(
                "[PlanillaService] ParÃ¡metros enviados a sp_Planilla_Actualizar:{NewLine}{Payload}",
                Environment.NewLine,
                JsonSerializer.Serialize(logObject, new JsonSerializerOptions { WriteIndented = true }));

            await connection.ExecuteAsync(
                _sqlCommandFactory.Create(
                    UpdateStoredProcedureName,
                    parameters,
                    CommandType.StoredProcedure,
                    cancellationToken,
                    commandTimeout: 120));
        }

        public async Task ActualizarEstadoPlanillaAsync(PlanillaActualizarEstadoRequestDto request, CancellationToken cancellationToken = default)
        {
            await using var connection = _sqlCommandFactory.CreateConnection();

            var idAprobador = request.IdAprobador.GetValueOrDefault();
            if (idAprobador <= 0)
            {
                throw new InvalidOperationException("El IdAprobador es obligatorio para actualizar el estado de la planilla.");
            }

            var parameters = new DynamicParameters();
            parameters.Add("@CodEstado", request.CodEstado, DbType.Int32);
            parameters.Add("@Correlativo", request.Correlativo, DbType.Int32);
            parameters.Add("@IdSite", NullIfWhiteSpace(request.IdSite), DbType.String);
            parameters.Add("@IdAprobador", idAprobador, DbType.Int32);
            parameters.Add("@Observacion", NullIfWhiteSpace(request.Observacion), DbType.String);

            _logger.LogInformation(
                "[PlanillaService] ParÃ¡metros enviados a sp_Planilla_ActualizarEstado:{NewLine}{Payload}",
                Environment.NewLine,
                JsonSerializer.Serialize(
                    new
                    {
                        request.CodEstado,
                        request.Correlativo,
                        request.IdSite,
                        IdAprobador = idAprobador,
                        request.Observacion,
                    },
                    new JsonSerializerOptions { WriteIndented = true }));

            await connection.ExecuteAsync(
                _sqlCommandFactory.Create(
                    UpdateStatusStoredProcedureName,
                    parameters,
                    CommandType.StoredProcedure,
                    cancellationToken,
                    commandTimeout: 120));
        }

        private static DynamicParameters BuildPlanillaParameters(PlanillaInsertRequestDto request)
        {
            var idResponsable = ParseRequiredInt(request.Responsable, nameof(request.Responsable));
            var idBien = ParseRequiredInt(request.Bien, nameof(request.Bien));
            var idComprobante = ParseRequiredInt(request.Comprobante, nameof(request.Comprobante));
            var idTipoPago = ParseRequiredInt(request.TipoPago, nameof(request.TipoPago));
            var tipoMoneda = ParseRequiredInt(request.Moneda, nameof(request.Moneda));
            var idSolicitante = ParseRequiredInt(request.Solicitante, nameof(request.Solicitante));
            var idGestor = ParseRequiredInt(request.Gestor, nameof(request.Gestor));
            var idValidador = ParseRequiredInt(request.Validador, nameof(request.Validador));

            var parameters = new DynamicParameters();
            parameters.Add("@IdProyecto", request.IdProyecto, DbType.Int32);
            parameters.Add("@IdSite", NullIfWhiteSpace(request.IdSite), DbType.String);
            parameters.Add("@CorreSite", request.CorreSite, DbType.Int32);
            parameters.Add("@IdTipoTrabajo", 0, DbType.Int32);
            parameters.Add("@IdTarea", request.IdTarea, DbType.Int32);
            parameters.Add("@Detalle", NullIfWhiteSpace(request.Detalle), DbType.String);
            parameters.Add("@IdResponsable", idResponsable, DbType.Int32);
            parameters.Add("@IdCliente", request.IdCliente, DbType.Int32);
            parameters.Add("@IdBien", idBien, DbType.Int32);
            parameters.Add("@IdComprobante", idComprobante, DbType.Int32);
            parameters.Add("@RUC", NullIfWhiteSpace(request.Ruc), DbType.String);
            parameters.Add("@Serie", NullIfWhiteSpace(request.Serie), DbType.String);
            parameters.Add("@IdTipoPago", idTipoPago, DbType.Int32);
            parameters.Add("@TipoMoneda", tipoMoneda, DbType.Int32);
            parameters.Add("@Total", request.Total ?? request.Monto, DbType.Decimal);
            parameters.Add("@Subtotal", request.Subtotal ?? request.Monto, DbType.Decimal);
            parameters.Add("@Igv", request.Igv ?? 0m, DbType.Decimal);
            parameters.Add("@IdRendicion", request.IdRendicion, DbType.Int32);
            parameters.Add("@Comentario", NullIfWhiteSpace(request.Comentario), DbType.String);
            parameters.Add("@IdSolicitante", idSolicitante, DbType.Int32);
            parameters.Add("@IdGestor", idGestor, DbType.Int32);
            parameters.Add("@IdValidador", idValidador, DbType.Int32);
            parameters.Add("@FechaPropuesta", DateTime.Now, DbType.DateTime);
            parameters.Add("@IdBancoCta", request.IdBancoCta, DbType.Int32);
            parameters.Add("@Cuenta", NullIfWhiteSpace(request.CuentaNumero), DbType.String);
            parameters.Add("@CuentaInter", NullIfWhiteSpace(request.CuentaInter), DbType.String);
            parameters.Add("@NombreCta", NullIfWhiteSpace(request.NombreCta), DbType.String);
            parameters.Add("@TipoTrabajo", NullIfWhiteSpace(request.TipoTrabajo), DbType.String);
            parameters.Add("@SiteNombre", NullIfWhiteSpace(request.SiteNombre), DbType.String);
            parameters.Add("@Usuario", NullIfWhiteSpace(request.Usuario), DbType.String);
            parameters.Add("@Ot", NullIfWhiteSpace(request.Ot), DbType.String);
            parameters.Add("@TipoCambio", request.TipoCambio ?? 0m, DbType.Decimal);
            parameters.Add("@FecEmision", ParseNullableDate(request.FechaEmision), DbType.DateTime);
            parameters.Add("@RutaFactura", NullIfWhiteSpace(request.FacturaPath), DbType.String);
            parameters.Add("@IdUsuarioFactura", request.IdUsuarioFactura, DbType.Int32);
            parameters.Add("@FechaVencimiento", ParseNullableDate(request.FechaVencimiento), DbType.DateTime);
            parameters.Add("@IdProvisional", request.IdSuministroProvisional, DbType.Int32);

            return parameters;
        }

        private async Task<DynamicParameters> BuildSuministroVigenteParametersAsync(
            SqlConnection connection,
            SuministroProvisionalVigenteRequestDto request,
            CancellationToken cancellationToken)
        {
            var parameters = new DynamicParameters();
            var availableParameters = NormalizeParameterNames(
                await GetStoredProcedureParametersAsync(connection, VigenteStoredProcedureName, cancellationToken));

            AddParameterIfExists(availableParameters, parameters, request.IdResponsable, DbType.Int32, "@IdResponsable", "@idResponsable", "@idresponsable");
            AddParameterIfExists(availableParameters, parameters, request.IdTarea, DbType.Int32, "@IdTarea", "@idTarea", "@idtarea", "@id_tarea");
            AddParameterIfExists(availableParameters, parameters, request.IdCliente, DbType.Int32, "@IdCliente", "@idCliente", "@idcliente");
            AddParameterIfExists(availableParameters, parameters, request.IdProyecto, DbType.Int32, "@IdProyecto", "@idProyecto", "@idproyecto");
            AddParameterIfExists(availableParameters, parameters, NullIfWhiteSpace(request.IdSite), DbType.String, "@IdSite", "@idSite", "@idsite");
            AddParameterIfExists(availableParameters, parameters, request.CorreSite, DbType.Int32, "@CorreSite", "@correSite", "@corresite", "@Correlativo", "@correlativo");
            AddParameterIfExists(availableParameters, parameters, 1, DbType.Int32, "@IdEstado", "@idEstado", "@idestado");
            AddParameterIfExists(availableParameters, parameters, NullIfWhiteSpace(request.TipoTrabajo), DbType.String, "@TipoTrabajo", "@tipoTrabajo", "@tipo_trabajo");

            return parameters;
        }

        private static IReadOnlySet<string> NormalizeParameterNames(IEnumerable<string> parameters)
        {
            return parameters
                .Where(static name => !string.IsNullOrWhiteSpace(name))
                .Select(static name => name.Trim())
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
        }

        private static void AddParameterIfExists(
            IReadOnlySet<string> availableParameters,
            DynamicParameters parameters,
            object? value,
            DbType dbType,
            params string[] candidateNames)
        {
            var parameterName = candidateNames.FirstOrDefault(availableParameters.Contains);
            if (string.IsNullOrWhiteSpace(parameterName))
            {
                return;
            }

            parameters.Add(parameterName, value, dbType);
        }

        private async Task<IReadOnlyList<string>> GetStoredProcedureParametersAsync(
            SqlConnection connection,
            string procedureName,
            CancellationToken cancellationToken)
        {
            const string sql = """
                SELECT p.name
                FROM sys.parameters p
                INNER JOIN sys.objects o ON p.object_id = o.object_id
                INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
                WHERE s.name = @SchemaName
                  AND o.name = @ProcedureName
                """;

            var normalized = procedureName.Split('.', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            var schemaName = normalized.Length > 1 ? normalized[0] : "dbo";
            var objectName = normalized.Length > 1 ? normalized[1] : normalized[0];

            var rows = await connection.QueryAsync<string>(
                _sqlCommandFactory.Create(
                    sql,
                    new { SchemaName = schemaName, ProcedureName = objectName },
                    cancellationToken: cancellationToken));

            return rows.ToList();
        }

        private static SuministroProvisionalVigenteDto MapSuministroVigenteRow(dynamic row)
        {
            var values = (IDictionary<string, object?>)row;

            return new SuministroProvisionalVigenteDto
            {
                IdProvisional = GetNullableLong(values, "IdProvisional", "idProvisional", "idprovisional", "IdSuministroProvisional", "idSuministroProvisional"),
                IdResponsable = GetNullableInt(values, "IdResponsable", "idResponsable", "idresponsable"),
                Responsable = GetNullableString(values, "Responsable", "responsable", "NombreEmpleado", "nombreempleado") ?? string.Empty,
                IdTarea = GetNullableInt(values, "IdTarea", "idTarea", "idtarea", "Id_Tarea", "id_tarea"),
                Tarea = GetNullableString(values, "Tarea", "tarea", "valorini") ?? string.Empty,
                TipoTrabajo = GetNullableString(values, "TipoTrabajo", "tipoTrabajo", "tipo_trabajo") ?? string.Empty,
                Ot = GetNullableString(values, "Ot", "ot", "OT") ?? string.Empty,
                Comentario = GetNullableString(values, "Comentario", "comentario") ?? string.Empty,
                Monto = GetNullableDecimal(values, "Monto", "monto"),
                FechaInicio = GetNullableDateTime(values, "FechaInicio", "fechaInicio", "fechainicio"),
                NombreCliente = GetNullableString(values, "NombreCliente", "nombreCliente", "nombrecliente") ?? string.Empty,
                NombreProyecto = GetNullableString(values, "NombreProyecto", "nombreProyecto", "nombreproyecto") ?? string.Empty,
                NombreSite = GetNullableString(values, "NombreSite", "nombreSite", "nombresite") ?? string.Empty
            };
        }

        private static string? GetNullableString(IDictionary<string, object?> values, params string[] keys)
        {
            foreach (var key in keys)
            {
                if (values.TryGetValue(key, out var value) && value is not null && value != DBNull.Value)
                {
                    var text = value.ToString()?.Trim();
                    if (!string.IsNullOrWhiteSpace(text))
                    {
                        return text;
                    }
                }
            }

            return null;
        }

        private static int? GetNullableInt(IDictionary<string, object?> values, params string[] keys)
        {
            foreach (var key in keys)
            {
                if (values.TryGetValue(key, out var value) && value is not null && value != DBNull.Value)
                {
                    if (value is int intValue)
                    {
                        return intValue;
                    }

                    if (int.TryParse(value.ToString(), out var parsed))
                    {
                        return parsed;
                    }
                }
            }

            return null;
        }

        private static long? GetNullableLong(IDictionary<string, object?> values, params string[] keys)
        {
            foreach (var key in keys)
            {
                if (values.TryGetValue(key, out var value) && value is not null && value != DBNull.Value)
                {
                    if (value is long longValue)
                    {
                        return longValue;
                    }

                    if (long.TryParse(value.ToString(), out var parsed))
                    {
                        return parsed;
                    }
                }
            }

            return null;
        }

        private static decimal? GetNullableDecimal(IDictionary<string, object?> values, params string[] keys)
        {
            foreach (var key in keys)
            {
                if (values.TryGetValue(key, out var value) && value is not null && value != DBNull.Value)
                {
                    if (value is decimal decimalValue)
                    {
                        return decimalValue;
                    }

                    if (decimal.TryParse(value.ToString(), out var parsed))
                    {
                        return parsed;
                    }
                }
            }

            return null;
        }

        private static DateTime? GetNullableDateTime(IDictionary<string, object?> values, params string[] keys)
        {
            foreach (var key in keys)
            {
                if (values.TryGetValue(key, out var value) && value is not null && value != DBNull.Value)
                {
                    if (value is DateTime dateTime)
                    {
                        return dateTime;
                    }

                    if (DateTime.TryParse(value.ToString(), out var parsed))
                    {
                        return parsed;
                    }
                }
            }

            return null;
        }

        private static string? NullIfWhiteSpace(string? value)
        {
            return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        }

        private static DateTime? ParseNullableDate(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return null;
            }

            return DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed)
                ? parsed
                : null;
        }

        private static int ParseRequiredInt(string? value, string fieldName)
        {
            if (int.TryParse(value, out var parsed))
            {
                return parsed;
            }

            throw new InvalidOperationException(
                $"El campo {fieldName} debe enviarse como cÃ³digo numÃ©rico. Valor recibido: '{value ?? "null"}'.");
        }
    }
}
