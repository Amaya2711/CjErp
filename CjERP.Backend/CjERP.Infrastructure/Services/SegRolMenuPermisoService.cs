using System.Data;
using CjERP.Application.DTOs.Seguridad;
using CjERP.Application.Interfaces.Services;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace CjERP.Infrastructure.Services;

public class SegRolMenuPermisoService : ISegRolMenuPermisoService
{
    private readonly string _connectionString;

    public SegRolMenuPermisoService(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("No se encontró la cadena de conexión DefaultConnection.");
    }

    private IDbConnection CreateConnection()
    {
        return new SqlConnection(_connectionString);
    }

    public async Task<IEnumerable<SegRolMenuPermisoDto>> ListarPorRolAsync(int idRol)
    {
        using var connection = CreateConnection();

        var result = await connection.QueryAsync<SegRolMenuPermisoDto>(
            "dbo.sp_SegRolMenuPermiso_ListarPorRol",
            new { IdRol = idRol },
            commandType: CommandType.StoredProcedure
        );

        return result;
    }

    public async Task<SegRolMenuPermisoDto?> ObtenerAsync(int idRol, int idMenu)
    {
        using var connection = CreateConnection();

        var result = await connection.QueryFirstOrDefaultAsync<SegRolMenuPermisoDto>(
            "dbo.sp_SegRolMenuPermiso_Obtener",
            new
            {
                IdRol = idRol,
                IdMenu = idMenu
            },
            commandType: CommandType.StoredProcedure
        );

        return result;
    }

    public async Task GuardarAsync(GuardarSegRolMenuPermisoDto dto)
    {
        using var connection = CreateConnection();

        await connection.ExecuteAsync(
            "dbo.sp_SegRolMenuPermiso_Guardar",
            new
            {
                dto.IdRol,
                dto.IdMenu,
                dto.PuedeVer,
                dto.PuedeCrear,
                dto.PuedeEditar,
                dto.PuedeEliminar,
                dto.PuedeAprobar,
                dto.PuedeExportar,
                Usuario = dto.Usuario
            },
            commandType: CommandType.StoredProcedure
        );
    }
}