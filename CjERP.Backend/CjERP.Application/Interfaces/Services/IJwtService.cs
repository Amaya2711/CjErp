using System.Security.Claims;
using CjERP.Application.DTOs.Auth;

namespace CjERP.Application.Interfaces.Services
{
    public interface IJwtService
    {
        string GenerateToken(LoginResponseDto usuario, string sessionId);
        ClaimsPrincipal? ValidateToken(string token, bool validateLifetime = true);
    }
}
