using System.Security.Claims;
using CjERP.Api.Configuration;
using CjERP.Application.DTOs.Auth;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace CjERP.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly IAuthService _authService;
        private readonly IJwtService _jwtService;
        private readonly IActiveUserSessionService _activeUserSessionService;
        private readonly JwtSettings _jwtSettings;

        public AuthController(
            IAuthService authService,
            IJwtService jwtService,
            IActiveUserSessionService activeUserSessionService,
            IOptions<JwtSettings> jwtSettings)
        {
            _authService = authService;
            _jwtService = jwtService;
            _activeUserSessionService = activeUserSessionService;
            _jwtSettings = jwtSettings.Value;
        }

        [DisableRateLimiting]
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequestDto request, CancellationToken cancellationToken)
        {
            if (request == null)
                return BadRequest("Debe enviar los datos del login.");

            if (string.IsNullOrWhiteSpace(request.IdUsuario))
                return BadRequest("Debe ingresar el usuario.");

            if (string.IsNullOrWhiteSpace(request.Clave))
                return BadRequest("Debe ingresar la clave.");

            var usuario = await _authService.LoginAsync(request, cancellationToken);

            if (usuario == null)
                return Unauthorized("Usuario o contraseña incorrectos.");

            var sessionId = Guid.NewGuid().ToString("N");
            _activeUserSessionService.SetActiveSession(usuario.IdUsuario, sessionId);

            var token = _jwtService.GenerateToken(usuario, sessionId);
            usuario.Token = token;
            usuario.SessionId = sessionId;
            usuario.Expiration = DateTime.UtcNow.AddMinutes(_jwtSettings.DurationInMinutes);

            return Ok(new
            {
                success = true,
                message = "Login correcto.",
                data = usuario
            });
        }

        [Authorize]
        [HttpPost("logout")]
        public IActionResult Logout()
        {
            var userId = User.FindFirstValue("IdUsuario") ?? User.Identity?.Name;
            if (!string.IsNullOrWhiteSpace(userId))
            {
                _activeUserSessionService.LogoutUser(userId);
            }

            return Ok(new
            {
                success = true,
                message = "Sesion cerrada correctamente."
            });
        }

        [AllowAnonymous]
        [HttpPost("logout-beacon")]
        public IActionResult LogoutBeacon([FromBody] LogoutByTokenRequestDto request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.Token))
            {
                return Ok(new { success = true });
            }

            var principal = _jwtService.ValidateToken(request.Token, validateLifetime: false);
            var userId = principal?.FindFirstValue("IdUsuario") ?? principal?.Identity?.Name;

            if (!string.IsNullOrWhiteSpace(userId))
            {
                _activeUserSessionService.LogoutUser(userId);
            }

            return Ok(new { success = true });
        }
    }
}
