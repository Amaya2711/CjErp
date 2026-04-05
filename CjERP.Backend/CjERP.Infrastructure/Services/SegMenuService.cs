using System.Data;
using CjERP.Application.DTOs.Seguridad;
using CjERP.Application.Interfaces.Services;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace CjERP.Infrastructure.Services;

public class SegMenuService : ISegMenuService
{
    private readonly string _connectionString;

    private sealed class MenuDinamicoRow
    {
        public int IdMenuNivel1 { get; set; }
        public string? MenuNivel1 { get; set; }
        public string? IconoNivel1 { get; set; }
        public int? OrdenNivel1 { get; set; }

        public int? IdMenuNivel2 { get; set; }
        public string? MenuNivel2 { get; set; }
        public string? IconoNivel2 { get; set; }
        public int? OrdenNivel2 { get; set; }

        public int? IdMenuNivel3 { get; set; }
        public string? MenuNivel3 { get; set; }
        public string? RutaNivel3 { get; set; }
        public string? IconoNivel3 { get; set; }
        public int? OrdenNivel3 { get; set; }
    }

    public SegMenuService(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("No se encontró la cadena de conexión DefaultConnection.");
    }

    // 🔥 CAMBIO IMPORTANTE: usar SqlConnection (NO IDbConnection)
    private SqlConnection CreateConnection()
    {
        return new SqlConnection(_connectionString);
    }

    public async Task<IEnumerable<MenuDto>> ListarCompletoAsync()
    {
        using var connection = CreateConnection();

        var result = await connection.QueryAsync<MenuDto>(
            "dbo.sp_SegMenu_ListarCompleto",
            commandType: CommandType.StoredProcedure
        );

        return result;
    }

    public async Task<IEnumerable<MenuDto>> ListarPorUsuarioAsync(string idUsuario)
    {
        using var connection = CreateConnection();

        var rows = await connection.QueryAsync<MenuDinamicoRow>(
            "dbo.sp_Seguridad_ObtenerMenuDinamico",
            new { IdUsuario = idUsuario },
            commandType: CommandType.StoredProcedure
        );

        var menuMap = new Dictionary<int, MenuDto>();

        foreach (var row in rows)
        {
            if (row.IdMenuNivel1 > 0 && !menuMap.ContainsKey(row.IdMenuNivel1))
            {
                menuMap[row.IdMenuNivel1] = new MenuDto
                {
                    IdMenu = row.IdMenuNivel1,
                    IdMenuPadre = null,
                    NombreMenu = row.MenuNivel1 ?? string.Empty,
                    Ruta = null,
                    Icono = row.IconoNivel1,
                    OrdenMenu = row.OrdenNivel1 ?? 0,
                    NivelMenu = 0,
                    CodigoMenu = null
                };
            }

            if (row.IdMenuNivel2.HasValue && row.IdMenuNivel2.Value > 0 && !menuMap.ContainsKey(row.IdMenuNivel2.Value))
            {
                menuMap[row.IdMenuNivel2.Value] = new MenuDto
                {
                    IdMenu = row.IdMenuNivel2.Value,
                    IdMenuPadre = row.IdMenuNivel1,
                    NombreMenu = row.MenuNivel2 ?? string.Empty,
                    Ruta = null,
                    Icono = row.IconoNivel2,
                    OrdenMenu = row.OrdenNivel2 ?? 0,
                    NivelMenu = 1,
                    CodigoMenu = null
                };
            }

            if (row.IdMenuNivel3.HasValue && row.IdMenuNivel3.Value > 0 && !menuMap.ContainsKey(row.IdMenuNivel3.Value))
            {
                var parentId = row.IdMenuNivel2 ?? row.IdMenuNivel1;

                menuMap[row.IdMenuNivel3.Value] = new MenuDto
                {
                    IdMenu = row.IdMenuNivel3.Value,
                    IdMenuPadre = parentId,
                    NombreMenu = row.MenuNivel3 ?? string.Empty,
                    Ruta = row.RutaNivel3,
                    Icono = row.IconoNivel3,
                    OrdenMenu = row.OrdenNivel3 ?? 0,
                    NivelMenu = row.IdMenuNivel2.HasValue ? 2 : 1,
                    CodigoMenu = null
                };
            }
        }

        return menuMap.Values
            .OrderBy(m => m.NivelMenu)
            .ThenBy(m => m.OrdenMenu)
            .ThenBy(m => m.IdMenu)
            .ToList();
    }

    public async Task<IEnumerable<MenuDto>> ListarAsignadoPorRolAsync(int idRol)
    {
        using var connection = CreateConnection();

        var result = await connection.QueryAsync<MenuDto>(
            "dbo.sp_SegMenu_ListarAsignadoPorRol",
            new { IdRol = idRol },
            commandType: CommandType.StoredProcedure
        );

        return result;
    }

    public async Task GuardarAsignacionRolAsync(int idRol, IEnumerable<int> menuIds, string usuario)
    {
        using var connection = CreateConnection();

        // ✅ ahora sí funciona correctamente
        await connection.OpenAsync();

        using var transaction = connection.BeginTransaction();

        try
        {
            // Eliminar asignaciones previas
            await connection.ExecuteAsync(
                "dbo.sp_SegRolMenuAccion_EliminarVerPorRol",
                new { IdRol = idRol },
                transaction: transaction,
                commandType: CommandType.StoredProcedure
            );

            // Insertar nuevas asignaciones
            foreach (var idMenu in menuIds.Distinct())
            {
                await connection.ExecuteAsync(
                    "dbo.sp_SegRolMenuAccion_InsertarVer",
                    new
                    {
                        IdRol = idRol,
                        IdMenu = idMenu,
                        UsuarioCreacion = usuario
                    },
                    transaction: transaction,
                    commandType: CommandType.StoredProcedure
                );
            }

            // Confirmar transacción
            transaction.Commit();
        }
        catch
        {
            // Revertir si hay error
            transaction.Rollback();
            throw;
        }
    }
}