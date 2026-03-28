using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using CjERP.Api.Configuration;
using CjERP.Application.DTOs.Auth;
using CjERP.Application.Interfaces.Services;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace CjERP.Infrastructure.Services
{
    public class JwtService : IJwtService
    {
        private readonly JwtSettings _jwtSettings;

        public JwtService(IOptions<JwtSettings> jwtSettings)
        {
            _jwtSettings = jwtSettings.Value;
        }

        public string GenerateToken(LoginResponseDto usuario)
        {
            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.Name, usuario.IdUsuario ?? string.Empty),
                new Claim("IdUsuario", usuario.IdUsuario ?? string.Empty),
                new Claim("NombreEmpleado", usuario.NombreEmpleado ?? string.Empty),
                new Claim("Correo", usuario.Correo ?? string.Empty),
                new Claim("CodEmp", usuario.CodEmp?.ToString() ?? string.Empty),
                new Claim("CodVal", usuario.CodVal?.ToString() ?? string.Empty),
                new Claim("Cuadrilla", usuario.Cuadrilla?.ToString() ?? string.Empty)
            };

            var key = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(_jwtSettings.Key));

            var creds = new SigningCredentials(
                key,
                SecurityAlgorithms.HmacSha256);

            var expiration = DateTime.UtcNow.AddMinutes(_jwtSettings.DurationInMinutes);

            var token = new JwtSecurityToken(
                issuer: _jwtSettings.Issuer,
                audience: _jwtSettings.Audience,
                claims: claims,
                expires: expiration,
                signingCredentials: creds);

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}