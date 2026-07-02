using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;

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

        private readonly IPlanillaConsultaService _planillaConsultaService;
        private readonly ILogger<PlanillaConsultaController> _logger;

        public PlanillaConsultaController(
            IPlanillaConsultaService planillaConsultaService,
            ILogger<PlanillaConsultaController> logger)
        {
            _planillaConsultaService = planillaConsultaService;
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

            var providedNames = new HashSet<string>(
                providedParameters.Keys,
                StringComparer.OrdinalIgnoreCase);

            var requiredParameters = string.Equals(consulta, "aprobar", StringComparison.OrdinalIgnoreCase)
                ? RequiredParametersAprobar
                : string.Equals(consulta, "vacaciones", StringComparison.OrdinalIgnoreCase)
                    ? RequiredParametersVacaciones
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

        private static string GetStoredProcedureLabel(string? consulta)
        {
            return (consulta ?? string.Empty).Trim().ToLowerInvariant() switch
            {
                "aprobar" => "sp_Planilla_Consulta_Aprobar",
                "vacaciones" => "sp_EmpleadoOtros_ListarVacaciones",
                _ => "sp_Planilla_Consulta_Estados"
            };
        }
    }
}
