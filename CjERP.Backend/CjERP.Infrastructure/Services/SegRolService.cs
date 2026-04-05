using System.Data;
using CjERP.Application.DTOs.Seguridad;
using CjERP.Application.Interfaces.Services;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace CjERP.Infrastructure.Services;

public class SegRolService : ISegRolService
{
    private readonly string _connectionString;

    public SegRolService(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("No se encontró la cadena de conexión DefaultConnection.");
    }

    private IDbConnection CreateConnection()
    {
        return new SqlConnection(_connectionString);
    }

    public async Task<IEnumerable<RolDto>> ListarAsync()
    {
        using var connection = CreateConnection();

        var result = await connection.QueryAsync<RolDto>(
            "dbo.sp_SegRol_Listar",
            commandType: CommandType.StoredProcedure
        );

        return result;
    }

    public async Task<RolDto?> ObtenerPorIdAsync(int idRol)
    {
        using var connection = CreateConnection();

        var result = await connection.QueryFirstOrDefaultAsync<RolDto>(
            "dbo.sp_SegRol_ObtenerPorId",
            new { IdRol = idRol },
            commandType: CommandType.StoredProcedure
        );

        return result;
    }

    public async Task<int> CrearAsync(CrearRolRequest request, string usuario)
    {
        using var connection = CreateConnection();

        var id = await connection.ExecuteScalarAsync<int>(
            "dbo.sp_SegRol_Crear",
            new
            {
                request.NombreRol,
                request.Descripcion,
                request.EsActivo,
                UsuarioCreacion = usuario
            },
            commandType: CommandType.StoredProcedure
        );

        return id;
    }

    public async Task<int> ActualizarAsync(int idRol, ActualizarRolRequest request, string usuario)
    {
        using var connection = CreateConnection();

        var id = await connection.ExecuteScalarAsync<int>(
            "dbo.sp_SegRol_Actualizar",
            new
            {
                IdRol = idRol,
                request.NombreRol,
                request.Descripcion,
                request.EsActivo,
                UsuarioActualiza = usuario
            },
            commandType: CommandType.StoredProcedure
        );

        return id;
    }

    public async Task<int> EliminarAsync(int idRol)
    {
        using var connection = CreateConnection();

        var id = await connection.ExecuteScalarAsync<int>(
            "dbo.sp_SegRol_Eliminar",
            new { IdRol = idRol },
            commandType: CommandType.StoredProcedure
        );

        return id;
    }
}