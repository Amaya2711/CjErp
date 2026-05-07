using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers
{
    [ApiController]
    [Route("api/planilla/consulta-estados")]
    [Authorize]
    public class PlanillaConsultaController : ControllerBase
    {
        private static readonly string[] RequiredParameters = ["IdCargo", "IdEmpleado", "Estados"];

        private readonly IPlanillaConsultaService _planillaConsultaService;

        public PlanillaConsultaController(IPlanillaConsultaService planillaConsultaService)
        {
            _planillaConsultaService = planillaConsultaService;
        }

        [HttpPost]
        public async Task<IActionResult> ConsultarEstados(
            [FromBody] PlanillaConsultaEstadosRequestDto request,
            CancellationToken cancellationToken)
        {
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

            var missingParameters = RequiredParameters
                .Where(requiredName => !providedNames.Contains(requiredName))
                .ToList();

            if (missingParameters.Count > 0)
            {
                return BadRequest(new
                {
                    success = false,
                    message = $"Faltan parametros requeridos para sp_Planilla_Consulta_Estados: {string.Join(", ", missingParameters)}."
                });
            }

            var emptyValueParameters = RequiredParameters
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

            var result = await _planillaConsultaService.ConsultarEstadosAsync(
                parametros,
                cancellationToken);

            return Ok(new
            {
                success = true,
                message = "Consulta ejecutada correctamente.",
                data = result
            });
        }
    }
}
