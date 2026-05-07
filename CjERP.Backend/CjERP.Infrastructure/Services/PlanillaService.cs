using System.Data;
using System.Globalization;
using System.Text.Json;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace CjERP.Infrastructure.Services
{
    public class PlanillaService : IPlanillaService
    {
        private const string InsertStoredProcedureName = "dbo.sp_Planilla_Insertar";
        private const string UpdateStoredProcedureName = "dbo.sp_Planilla_Actualizar";
        private const string UpdateStatusStoredProcedureName = "dbo.sp_Planilla_ActualizarEstado";

        private readonly IConfiguration _configuration;
        private readonly ILogger<PlanillaService> _logger;

        public PlanillaService(IConfiguration configuration, ILogger<PlanillaService> logger)
        {
            _configuration = configuration;
            _logger = logger;
        }

        public async Task InsertarPlanillaAsync(PlanillaInsertRequestDto request, CancellationToken cancellationToken = default)
        {
            using var connection = new SqlConnection(_configuration.GetConnectionString("DefaultConnection"));

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
                "[PlanillaService] Parámetros enviados a sp_Planilla_Insertar:{NewLine}{Payload}",
                Environment.NewLine,
                JsonSerializer.Serialize(logObject, new JsonSerializerOptions { WriteIndented = true }));

            await connection.ExecuteAsync(
                new CommandDefinition(
                    InsertStoredProcedureName,
                    parameters,
                    commandType: CommandType.StoredProcedure,
                    cancellationToken: cancellationToken));
        }

        public async Task ActualizarPlanillaAsync(PlanillaUpdateRequestDto request, CancellationToken cancellationToken = default)
        {
            using var connection = new SqlConnection(_configuration.GetConnectionString("DefaultConnection"));

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
                "[PlanillaService] Parámetros enviados a sp_Planilla_Actualizar:{NewLine}{Payload}",
                Environment.NewLine,
                JsonSerializer.Serialize(logObject, new JsonSerializerOptions { WriteIndented = true }));

            await connection.ExecuteAsync(
                new CommandDefinition(
                    UpdateStoredProcedureName,
                    parameters,
                    commandType: CommandType.StoredProcedure,
                    cancellationToken: cancellationToken));
        }

        public async Task ActualizarEstadoPlanillaAsync(PlanillaActualizarEstadoRequestDto request, CancellationToken cancellationToken = default)
        {
            using var connection = new SqlConnection(_configuration.GetConnectionString("DefaultConnection"));

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
                "[PlanillaService] Parámetros enviados a sp_Planilla_ActualizarEstado:{NewLine}{Payload}",
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
                new CommandDefinition(
                    UpdateStatusStoredProcedureName,
                    parameters,
                    commandType: CommandType.StoredProcedure,
                    cancellationToken: cancellationToken));
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

            return parameters;
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
                $"El campo {fieldName} debe enviarse como código numérico. Valor recibido: '{value ?? "null"}'.");
        }
    }
}
