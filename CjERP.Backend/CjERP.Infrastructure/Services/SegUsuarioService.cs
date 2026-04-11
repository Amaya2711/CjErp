using System.Data;
using CjERP.Application.DTOs.Seguridad;
using CjERP.Application.Interfaces.Services;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace CjERP.Infrastructure.Services;

public class SegUsuarioService : ISegUsuarioService
{
    private readonly string _connectionString;

    public SegUsuarioService(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("No se encontró la cadena de conexión DefaultConnection.");
    }

    private IDbConnection CreateConnection()
    {
        return new SqlConnection(_connectionString);
    }

    public async Task<IEnumerable<UsuarioDto>> ListarAsync()
    {
        using var connection = CreateConnection();

        var result = await connection.QueryAsync<UsuarioDto>(
            "dbo.sp_UsuarioListar",
            commandType: CommandType.StoredProcedure
        );

        return result;
    }
}
