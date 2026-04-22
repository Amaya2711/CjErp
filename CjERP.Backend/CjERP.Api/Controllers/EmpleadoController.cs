using CjERP.Application.Interfaces;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers
{
    [ApiController]
    [Route("api/empleado/cta")]
    public class EmpleadoController : ControllerBase
    {
        private readonly IEmpleadoCtaService _empleadoCtaService;

        public EmpleadoController(IEmpleadoCtaService empleadoCtaService)
        {
            _empleadoCtaService = empleadoCtaService;
        }

        [HttpGet("listar")]
        public async Task<IActionResult> Listar()
        {
            var empleados = await _empleadoCtaService.ListarAsync();
            return Ok(new
            {
                success = true,
                message = "Lista de empleados obtenida correctamente.",
                data = empleados
            });
        }
    }
}