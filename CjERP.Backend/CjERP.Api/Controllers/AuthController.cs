using CjERP.Application.DTOs.Auth;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly IAuthService _authService;
        private readonly IJwtService _jwtService;

        public AuthController(IAuthService authService, IJwtService jwtService)
        {
            _authService = authService;
            _jwtService = jwtService;
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequestDto request)
        {
            if (request == null)
                return BadRequest("Debe enviar los datos del login.");

            if (string.IsNullOrWhiteSpace(request.IdUsuario))
                return BadRequest("Debe ingresar el usuario.");

            if (string.IsNullOrWhiteSpace(request.Clave))
                return BadRequest("Debe ingresar la clave.");

            var usuario = await _authService.LoginAsync(request);

            if (usuario == null)
                return Unauthorized("Usuario o contraseña incorrectos.");

            var token = _jwtService.GenerateToken(usuario);
            usuario.Token = token;
            usuario.Expiration = DateTime.UtcNow.AddMinutes(60);

            return Ok(new
            {
                success = true,
                message = "Login correcto.",
                data = usuario
            });
        }
    }
}