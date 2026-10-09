using System.Security.Claims;
using CjERP.Application.DTOs.Auth;

namespace CjERP.Application.Interfaces.Services
{
    public interface IJwtService
    {
        string GenerateToken(LoginResponseDto usuario, string sessionId);
        /// <summary>Emite un token nuevo con las mismas claims (y el mismo SessionId) y vigencia renovada.</summary>
        string RenewToken(ClaimsPrincipal principal);
        ClaimsPrincipal? ValidateToken(string token, bool validateLifetime = true);
    }
}
