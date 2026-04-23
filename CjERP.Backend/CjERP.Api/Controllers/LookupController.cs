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
        public async Task<IActionResult> GetFiltros()
        {
            var result = await _lookupService.ListarFiltrosOperativosAsync();
            return Ok(result);
        }

        [HttpGet("tipotrabajo")]
        public async Task<IActionResult> GetTipoTrabajo([FromQuery] string filtroKey)
        {
            if (string.IsNullOrWhiteSpace(filtroKey))
                return BadRequest("filtroKey es requerido.");
            var result = await _lookupService.ListarTipoTrabajoAsync(filtroKey);
            return Ok(result);
        }

        [HttpGet("ot")]
        public async Task<IActionResult> GetOT([FromQuery] string filtroKey)
        {
            if (string.IsNullOrWhiteSpace(filtroKey))
                return BadRequest("filtroKey es requerido.");
            var result = await _lookupService.ListarOTAsync(filtroKey);
            return Ok(result);
        }

        [HttpGet("tareas")]
        public async Task<IActionResult> GetTareas()
        {
            var result = await _lookupService.ListarTareasAsync();
            return Ok(result);
        }
    }
}
