using CjERP.Application.DTOs.Auth;

namespace CjERP.Application.Interfaces.Services
{
    public interface IAuthService
    {
        Task<LoginResponseDto?> LoginAsync(LoginRequestDto request);
    }
}