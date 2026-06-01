using System.Data;
using CjERP.Application.DTOs.Auth;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;

namespace CjERP.Infrastructure.Services
{
    public class AuthService : IAuthService
    {
        private readonly ISqlCommandFactory _sqlCommandFactory;

        public AuthService(ISqlCommandFactory sqlCommandFactory)
        {
            _sqlCommandFactory = sqlCommandFactory;
        }

        public async Task<LoginResponseDto?> LoginAsync(LoginRequestDto request, CancellationToken cancellationToken = default)
        {
            await using var connection = _sqlCommandFactory.CreateConnection();

            var requestedUser = request.IdUsuario?.Trim();

            var parameters = new DynamicParameters();
            parameters.Add("@pIdUsuario", requestedUser, DbType.String);
            parameters.Add("@pClave", request.Clave, DbType.String);

            var result = await connection.QueryFirstOrDefaultAsync<LoginResponseDto>(
                _sqlCommandFactory.Create(
                    "dbo.sp_ValidarUsuario",
                    parameters,
                    CommandType.StoredProcedure,
                    cancellationToken));

            if (result == null)
                return null;

            if (!string.Equals(result.IdUsuario?.Trim(), requestedUser, StringComparison.OrdinalIgnoreCase))
                return null;

            return result;
        }
    }
}
