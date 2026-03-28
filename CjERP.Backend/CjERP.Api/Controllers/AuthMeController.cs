using System.Security.Claims;
using CjERP.Application.DTOs.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers
{
    [ApiController]
    [Route("api/auth")]
    [Authorize]
    public class AuthMeController : ControllerBase
    {
        [HttpGet("me")]
        public IActionResult Me()
        {
            var dto = new CurrentUserDto
            {
                IdUsuario = User.FindFirstValue("IdUsuario") ?? string.Empty,
                NombreEmpleado = User.FindFirstValue("NombreEmpleado"),
                Correo = User.FindFirstValue("Correo"),
                CodEmp = ParseNullableInt(User.FindFirstValue("CodEmp")),
                CodVal = ParseNullableInt(User.FindFirstValue("CodVal")),
                Cuadrilla = ParseNullableInt(User.FindFirstValue("Cuadrilla"))
            };

            return Ok(new
            {
                success = true,
                message = "Usuario autenticado.",
                data = dto
            });
        }

        private static int? ParseNullableInt(string? value)
        {
            if (int.TryParse(value, out var result))
                return result;

            return null;
        }
    }
}