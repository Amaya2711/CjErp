using CjERP.Application.DTOs.Auth;

namespace CjERP.Application.Interfaces.Services
{
    public interface IJwtService
    {
        string GenerateToken(LoginResponseDto usuario);
    }
}