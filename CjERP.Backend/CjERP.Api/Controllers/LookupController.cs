using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Threading.Tasks;
using CjERP.Application.Interfaces;

namespace CjERP.Api.Controllers
{
    [ApiController]
    [Route("api/lookup/filtro-operativo")]
    [Authorize]
    public class LookupController : ControllerBase
    {
        private readonly ILookupService _lookupService;

        public LookupController(ILookupService lookupService)
        {
            _lookupService = lookupService;
        }

        [HttpGet("filtros")]
        public async Task<IActionResult> GetFiltros(CancellationToken cancellationToken)
        {
            var result = await _lookupService.ListarFiltrosOperativosAsync(cancellationToken);
            return Ok(result);
        }

        [HttpGet("tipotrabajo")]
        public async Task<IActionResult> GetTipoTrabajo([FromQuery] string filtroKey, CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(filtroKey))
                return BadRequest("filtroKey es requerido.");
            var result = await _lookupService.ListarTipoTrabajoAsync(filtroKey, cancellationToken);
            return Ok(result);
        }

        [HttpGet("ot")]
        public async Task<IActionResult> GetOT([FromQuery] string filtroKey, CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(filtroKey))
                return BadRequest("filtroKey es requerido.");
            var result = await _lookupService.ListarOTAsync(filtroKey, cancellationToken);
            return Ok(result);
        }

        [HttpGet("tareas")]
        public async Task<IActionResult> GetTareas(CancellationToken cancellationToken)
        {
            var result = await _lookupService.ListarTareasAsync(cancellationToken);
            return Ok(result);
        }

        [HttpGet("valores-gasto")]
        public async Task<IActionResult> GetValoresGasto(
            [FromQuery] int idCliente,
            [FromQuery] int idProyecto,
            [FromQuery] string idSite,
            [FromQuery] int correlativo,
            [FromQuery] string tipoTrabajo,
            [FromQuery] string? ot,
            [FromQuery] bool usarOt = false,
            [FromQuery] decimal tipoCambio = 3.80m,
            CancellationToken cancellationToken = default)
        {
            if (idCliente <= 0)
                return BadRequest("idCliente es requerido.");

            if (string.IsNullOrWhiteSpace(idSite))
                return BadRequest("idSite es requerido.");

            if (correlativo <= 0)
                return BadRequest("correlativo es requerido.");

            if (string.IsNullOrWhiteSpace(tipoTrabajo))
                return BadRequest("tipoTrabajo es requerido.");

            var result = await _lookupService.ObtenerValoresGastoAsync(
                idCliente,
                idProyecto,
                idSite,
                correlativo,
                tipoTrabajo,
                string.IsNullOrWhiteSpace(ot) ? null : ot,
                usarOt,
                tipoCambio,
                cancellationToken);

            return Ok(result);
        }

        [HttpGet("~/api/lookup/constantes")]
        public async Task<IActionResult> GetConstantes([FromQuery] string campo, CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(campo))
                return BadRequest("campo es requerido.");

            var result = await _lookupService.ListarConstantesPorCampoAsync(campo, cancellationToken);
            return Ok(result);
        }

        [HttpGet("~/api/lookup/solicitantes")]
        public async Task<IActionResult> GetSolicitantes([FromQuery] int? idCargo, [FromQuery] int? idEmpleado, CancellationToken cancellationToken)
        {
            var result = await _lookupService.ListarSolicitantesAsync(
                idCargo.GetValueOrDefault() <= 0 ? null : idCargo,
                idEmpleado.GetValueOrDefault() <= 0 ? null : idEmpleado,
                cancellationToken
            );

            return Ok(result);
        }

        [HttpGet("~/api/lookup/gestores")]
        public async Task<IActionResult> GetGestores(CancellationToken cancellationToken)
        {
            var result = await _lookupService.ListarGestoresAsync(cancellationToken);
            return Ok(result);
        }

        [HttpGet("~/api/lookup/validador")]
        public async Task<IActionResult> GetValidador(CancellationToken cancellationToken)
        {
            var result = await _lookupService.ListarValidadoresAsync(cancellationToken);
            return Ok(result);
        }

        [HttpGet("~/api/lookup/ubigeos")]
        public async Task<IActionResult> GetUbigeos(CancellationToken cancellationToken)
        {
            var result = await _lookupService.ListarUbigeosAsync(cancellationToken);
            return Ok(result);
        }
    }
}
