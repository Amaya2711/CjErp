using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class SeguridadController : ControllerBase
    {
        [HttpGet("perfil")]
        public IActionResult GetPerfil()
        {
            var usuario = User.Claims.Select(c => new
            {
                c.Type,
                c.Value
            });

            return Ok(new
            {
                success = true,
                message = "Acceso autorizado.",
                data = usuario
            });
        }
    }
}