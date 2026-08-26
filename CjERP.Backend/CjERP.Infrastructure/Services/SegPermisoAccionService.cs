using System.Data;
using CjERP.Application.DTOs.Seguridad;
using CjERP.Application.Interfaces.Services;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace CjERP.Infrastructure.Services;

public class SegPermisoAccionService : ISegPermisoAccionService
{
    private readonly string _connectionString;

    public SegPermisoAccionService(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("No se encontró la cadena de conexión DefaultConnection.");
    }

    private IDbConnection CreateConnection()
    {
        return new SqlConnection(_connectionString);
    }

    public async Task<IEnumerable<PermisoAccionDto>> ListarAsync(
        string? rutaPagina = null,
        int? idRol = null,
        int? idEmpleado = null,
        string? tipoElemento = null)
    {
        using var connection = CreateConnection();

        var result = await connection.QueryAsync<PermisoAccionDto>(
            "dbo.sp_SegPermisoAccion_Listar",
            new
            {
                RutaPagina = rutaPagina,
                IdRol = idRol,
                IdEmpleado = idEmpleado,
                TipoElemento = tipoElemento
            },
            commandType: CommandType.StoredProcedure
        );

        return result;
    }

    public async Task<PermisoAccionDto?> ObtenerAsync(int idPermisoAccion)
    {
        using var connection = CreateConnection();

        var result = await connection.QueryFirstOrDefaultAsync<PermisoAccionDto>(
            "dbo.sp_SegPermisoAccion_Obtener",
            new { IdPermisoAccion = idPermisoAccion },
            commandType: CommandType.StoredProcedure
        );

        return result;
    }

    public async Task<int> GuardarAsync(GuardarPermisoAccionRequestDto request, string usuario)
    {
        using var connection = CreateConnection();

        var id = await connection.ExecuteScalarAsync<int>(
            "dbo.sp_SegPermisoAccion_Guardar",
            new
            {
                request.IdPermisoAccion,
                request.RutaPagina,
                request.ClaveAccion,
                request.Etiqueta,
                request.TipoElemento,
                request.IdRol,
                request.IdEmpleado,
                request.PuedeVer,
                request.PuedeEjecutar,
                request.EsActivo,
                Usuario = string.IsNullOrWhiteSpace(request.Usuario) ? usuario : request.Usuario
            },
            commandType: CommandType.StoredProcedure
        );

        return id;
    }

    public async Task<int> EliminarAsync(int idPermisoAccion)
    {
        using var connection = CreateConnection();

        var id = await connection.ExecuteScalarAsync<int>(
            "dbo.sp_SegPermisoAccion_Eliminar",
            new { IdPermisoAccion = idPermisoAccion },
            commandType: CommandType.StoredProcedure
        );

        return id;
    }
}
