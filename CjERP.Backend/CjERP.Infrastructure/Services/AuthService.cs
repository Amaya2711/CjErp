using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;
using CjERP.Application.DTOs.Auth;
using CjERP.Application.Interfaces.Services;
using Microsoft.Extensions.Configuration;

namespace CjERP.Infrastructure.Services
{
    public class AuthService : IAuthService
    {
        private readonly IConfiguration _configuration;

        public AuthService(IConfiguration configuration)
        {
            _configuration = configuration;
        }

        public async Task<LoginResponseDto?> LoginAsync(LoginRequestDto request)
        {
            using var connection = new SqlConnection(
                _configuration.GetConnectionString("DefaultConnection"));

            var requestedUser = request.IdUsuario?.Trim();

            var parameters = new DynamicParameters();
            parameters.Add("@pIdUsuario", requestedUser, DbType.String);
            parameters.Add("@pClave", request.Clave, DbType.String);

            var result = await connection.QueryFirstOrDefaultAsync<LoginResponseDto>(
                "dbo.sp_ValidarUsuario",
                parameters,
                commandType: CommandType.StoredProcedure);

            if (result == null)
                return null;

            // Safety check: reject if the SP returns a different user than requested.
            if (!string.Equals(result.IdUsuario?.Trim(), requestedUser, StringComparison.OrdinalIgnoreCase))
                return null;

            return result;
        }
    }
}