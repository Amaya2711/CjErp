using System.Data;
using CjERP.Application.DTOs.Seguridad;
using CjERP.Application.Interfaces.Services;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace CjERP.Infrastructure.Services;

public class SegPerfilService : ISegPerfilService
{
    private readonly string _connectionString;

    public SegPerfilService(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("No se encontró la cadena de conexión DefaultConnection.");
    }

    private IDbConnection CreateConnection()
    {
        return new SqlConnection(_connectionString);
    }

    public async Task<IEnumerable<PerfilDto>> ListarAsync()
    {
        using var connection = CreateConnection();

        var result = await connection.QueryAsync<PerfilDto>(
            "dbo.sp_SegPerfil_ListarActivos",
            commandType: CommandType.StoredProcedure
        );

        return result;
    }

    public async Task<PerfilDto?> ObtenerPorIdAsync(int idPerfil)
    {
        using var connection = CreateConnection();

        var result = await connection.QueryFirstOrDefaultAsync<PerfilDto>(
            "dbo.sp_SegPerfil_ObtenerPorId",
            new { IdPerfil = idPerfil },
            commandType: CommandType.StoredProcedure
        );

        return result;
    }

    public async Task<int> CrearAsync(CrearPerfilRequest request, string usuario)
    {
        using var connection = CreateConnection();

        var id = await connection.ExecuteScalarAsync<int>(
            "dbo.sp_SegPerfil_Crear",
            new
            {
                request.NombrePerfil,
                request.Descripcion,
                request.EsActivo,
                UsuarioCreacion = usuario
            },
            commandType: CommandType.StoredProcedure
        );

        return id;
    }

    public async Task<int> ActualizarAsync(int idPerfil, ActualizarPerfilRequest request, string usuario)
    {
        using var connection = CreateConnection();

        var id = await connection.ExecuteScalarAsync<int>(
            "dbo.sp_SegPerfil_Actualizar",
            new
            {
                IdPerfil = idPerfil,
                request.NombrePerfil,
                request.Descripcion,
                request.EsActivo,
                UsuarioActualiza = usuario
            },
            commandType: CommandType.StoredProcedure
        );

        return id;
    }

    public async Task<int> EliminarAsync(int idPerfil)
    {
        using var connection = CreateConnection();

        var id = await connection.ExecuteScalarAsync<int>(
            "dbo.sp_SegPerfil_Eliminar",
            new { IdPerfil = idPerfil },
            commandType: CommandType.StoredProcedure
        );

        return id;
    }

    public async Task<IEnumerable<RolDto>> ListarRolesPorPerfilAsync(int idPerfil)
    {
        using var connection = CreateConnection();

        var result = await connection.QueryAsync<RolDto>(
            "dbo.sp_SegPerfilRol_ComboRolesPorPerfil",
            new { IdPerfil = idPerfil },
            commandType: CommandType.StoredProcedure
        );

        return result;
    }
}