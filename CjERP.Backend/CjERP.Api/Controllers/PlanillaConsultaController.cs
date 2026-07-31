using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;
using Microsoft.Data.SqlClient;

namespace CjERP.Api.Controllers
{
    [ApiController]
    [Route("api/planilla/consulta-estados")]
    [Authorize]
    public class PlanillaConsultaController : ControllerBase
    {
        private static readonly string[] RequiredParameters = ["IdCargo", "IdEmpleado"];
        private static readonly string[] RequiredParametersAprobar = ["IdCargo", "IdEmpleado", "Estados"];
        private static readonly string[] RequiredParametersVacaciones = [];
        private static readonly string[] RequiredParametersPagadosDashboard = [];
        private static readonly string[] RequiredParametersImportarConsultaDsh = [];
        private static readonly string[] RequiredParametersMovimientosGastosIngresos = [];

        private readonly IPlanillaConsultaService _planillaConsultaService;
        private readonly IPlanillaService _planillaService;
        private readonly ILogger<PlanillaConsultaController> _logger;

        public PlanillaConsultaController(
            IPlanillaConsultaService planillaConsultaService,
            IPlanillaService planillaService,
            ILogger<PlanillaConsultaController> logger)
        {
            _planillaConsultaService = planillaConsultaService;
            _planillaService = planillaService;
            _logger = logger;
        }

        [HttpPost]
        public async Task<IActionResult> ConsultarEstados(
            [FromBody] PlanillaConsultaEstadosRequestDto request,
            CancellationToken cancellationToken)
        {
            var consulta = request?.Consulta?.Trim();
            var parametros = (request?.Parametros ?? new List<PlanillaConsultaParametroDto>())
                .Where(parametro => parametro is not null)
                .ToList();

            var providedParameters = new Dictionary<string, string?>(
                StringComparer.OrdinalIgnoreCase);

            foreach (var parametro in parametros)
            {
                var normalizedName = parametro.Nombre?.Trim().TrimStart('@');

                if (string.IsNullOrWhiteSpace(normalizedName))
                {
                    continue;
                }

                providedParameters[normalizedName] = parametro.Valor;
            }

            EnsureClaimFallback(providedParameters);

            var providedNames = new HashSet<string>(
                providedParameters.Keys,
                StringComparer.OrdinalIgnoreCase);

            var requiredParameters = string.Equals(consulta, "aprobar", StringComparison.OrdinalIgnoreCase)
                ? RequiredParametersAprobar
                : string.Equals(consulta, "vacaciones", StringComparison.OrdinalIgnoreCase)
                    ? RequiredParametersVacaciones
                : string.Equals(consulta, "pagados-dashboard", StringComparison.OrdinalIgnoreCase)
                    ? RequiredParametersPagadosDashboard
                    : string.Equals(consulta, "importar-consulta-dsh", StringComparison.OrdinalIgnoreCase)
                            ? RequiredParametersImportarConsultaDsh
                        : string.Equals(consulta, "movimientos-gastos-ingresos", StringComparison.OrdinalIgnoreCase)
                            ? RequiredParametersMovimientosGastosIngresos
                        : RequiredParameters;

            var missingParameters = requiredParameters
                .Where(requiredName => !providedNames.Contains(requiredName))
                .ToList();

            if (missingParameters.Count > 0)
            {
                return BadRequest(new
                {
                    success = false,
                    message = $"Faltan parametros requeridos para {GetStoredProcedureLabel(consulta)}: {string.Join(", ", missingParameters)}."
                });
            }

            var emptyValueParameters = requiredParameters
                .Where(requiredName => string.IsNullOrWhiteSpace(
                    providedParameters.TryGetValue(requiredName, out var value) ? value : null))
                .ToList();

            if (emptyValueParameters.Count > 0)
            {
                return BadRequest(new
                {
                    success = false,
                    message = $"Los parametros requeridos no pueden estar vacios: {string.Join(", ", emptyValueParameters)}."
                });
            }

            try
            {
                var stopwatch = Stopwatch.StartNew();
                var result = await _planillaConsultaService.ConsultarEstadosAsync(
                    parametros,
                    consulta,
                    request?.MaxRows,
                    request?.PageNumber,
                    request?.PageSize,
                    cancellationToken);
                stopwatch.Stop();

                _logger.LogInformation(
                    "[PlanillaConsulta] consulta={Consulta} rows={Rows} limitExceeded={LimitExceeded} maxRows={MaxRows} elapsedMs={ElapsedMs}",
                    GetStoredProcedureLabel(consulta),
                    result.TotalRows,
                    result.LimitExceeded,
                    request?.MaxRows,
                    stopwatch.Elapsed.TotalMilliseconds);

                return Ok(new
                {
                    success = true,
                    message = "Consulta ejecutada correctamente.",
                    data = result
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "[PlanillaConsulta] Error ejecutando consulta-estados. Parametros={Parametros}",
                    string.Join(
                        ", ",
                        parametros.Select(p => $"{p.Nombre}={p.Valor} ({p.Tipo})")));

                throw;
            }
        }

        [HttpGet("gastos-pagados/{id:int}")]
        public async Task<IActionResult> ObtenerGastosPagadosPorId(
            int id,
            CancellationToken cancellationToken)
        {
            if (id <= 0)
            {
                return BadRequest(new
                {
                    success = false,
                    message = "El id debe ser mayor que cero."
                });
            }

            try
            {
                var result = await _planillaConsultaService.ConsultarGastosPagadosPorIdAsync(id, cancellationToken);

                return Ok(new
                {
                    success = true,
                    message = result.TotalRows > 0 ? "Consulta ejecutada correctamente." : "No encontrado",
                    data = result
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "[PlanillaConsulta] Error ejecutando gastos-pagados/{Id}",
                    id);

                throw;
            }
        }

        [HttpPut("{id:int}/tarea")]
        public async Task<IActionResult> ActualizarTarea(
            int id,
            [FromBody] PlanillaActualizarTareaRequestDto request,
            CancellationToken cancellationToken)
        {
            if (id <= 0)
            {
                return BadRequest(new
                {
                    success = false,
                    message = "El correlativo debe ser mayor que cero."
                });
            }

            if (request is null || request.IdTarea <= 0)
            {
                return BadRequest(new
                {
                    success = false,
                    message = "La tarea seleccionada es obligatoria."
                });
            }

            try
            {
                await _planillaService.ActualizarTareaPlanillaAsync(
                    new PlanillaActualizarTareaRequestDto
                    {
                        Correlativo = id,
                        IdTarea = request.IdTarea
                    },
                    ResolveUsuarioAccion(),
                    cancellationToken);

                return Ok(new
                {
                    success = true,
                    message = "Tarea actualizada correctamente."
                });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new
                {
                    success = false,
                    message = ex.Message
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "[PlanillaConsulta] Error actualizando tarea del correlativo {Correlativo}",
                    id);

                throw;
            }
        }

        [HttpPut("{correlativo:int}/nro-operacion")]
        public async Task<IActionResult> ActualizarNroOperacion(
            int correlativo,
            [FromBody] PlanillaActualizarNroOperacionRequestDto request,
            CancellationToken cancellationToken)
        {
            if (correlativo <= 0)
            {
                return BadRequest(new
                {
                    success = false,
                    message = "El correlativo debe ser mayor que cero."
                });
            }

            if (request is null)
            {
                return BadRequest(new
                {
                    success = false,
                    message = "La información de la operación es obligatoria."
                });
            }

            try
            {
                await _planillaService.ActualizarNroOperacionPlanillaAsync(
                    new PlanillaActualizarNroOperacionRequestDto
                    {
                        Correlativo = correlativo,
                        NroOperacion = request.NroOperacion
                    },
                    ResolveUsuarioAccion(),
                    cancellationToken);

                return Ok(new
                {
                    success = true,
                    message = "Numero de operacion actualizado correctamente."
                });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new
                {
                    success = false,
                    message = ex.Message
                });
            }
            catch (SqlException ex)
            {
                _logger.LogError(
                    ex,
                    "[PlanillaConsulta] Error SQL actualizando nro operacion del correlativo {Correlativo}",
                    correlativo);

                return StatusCode(500, new
                {
                    success = false,
                    message = ex.Message,
                    detail = ex.ToString()
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "[PlanillaConsulta] Error actualizando nro operacion del correlativo {Correlativo}",
                    correlativo);

                return StatusCode(500, new
                {
                    success = false,
                    message = ex.Message,
                    detail = ex.ToString()
                });
            }
        }

        private static string GetStoredProcedureLabel(string? consulta)
        {
            return (consulta ?? string.Empty).Trim().ToLowerInvariant() switch
            {
                "aprobar" => "sp_Planilla_Consulta_Aprobar",
                "vacaciones" => "sp_EmpleadoOtros_ListarVacaciones",
                "pagados-dashboard" => "sp_Planilla_ConsultarPagados_Dsh",
                "importar-consulta-dsh" => "sp_Importar_ConsultaDsh",
                "movimientos-gastos-ingresos" => "sp_Movimientos_Consulta_GastosIngresos",
                _ => "sp_Planilla_Consulta_Estados"
            };
        }

        private void EnsureClaimFallback(Dictionary<string, string?> providedParameters)
        {
            if (!providedParameters.TryGetValue("IdEmpleado", out var idEmpleado) || string.IsNullOrWhiteSpace(idEmpleado))
            {
                var resolvedIdEmpleado = ResolveNumericClaimValue(
                    User.FindFirstValue("IdEmpleado"),
                    User.FindFirstValue("CodEmp"),
                    User.FindFirstValue("codEmp"),
                    User.FindFirstValue(ClaimTypes.NameIdentifier),
                    User.FindFirstValue("IdUsuario"));

                if (!string.IsNullOrWhiteSpace(resolvedIdEmpleado))
                {
                    providedParameters["IdEmpleado"] = resolvedIdEmpleado;
                }
            }

            if (!providedParameters.TryGetValue("IdCargo", out var idCargo) || string.IsNullOrWhiteSpace(idCargo))
            {
                var resolvedIdCargo = ResolveNumericClaimValue(
                    User.FindFirstValue("IdCargo"),
                    User.FindFirstValue("idCargo"),
                    User.FindFirstValue("IdRol"),
                    User.FindFirstValue("idrol"));

                if (!string.IsNullOrWhiteSpace(resolvedIdCargo))
                {
                    providedParameters["IdCargo"] = resolvedIdCargo;
                }
            }
        }

        private static string? ResolveNumericClaimValue(params string?[] values)
        {
            foreach (var value in values)
            {
                if (int.TryParse(value, out var parsed) && parsed > 0)
                {
                    return parsed.ToString();
                }
            }

            return null;
        }

        private string ResolveUsuarioAccion()
        {
            return User.FindFirstValue("Usuario")
                ?? User.FindFirstValue("IdUsuario")
                ?? User.FindFirstValue(ClaimTypes.Name)
                ?? User.Identity?.Name
                ?? "SISTEMA";
        }
    }
}
