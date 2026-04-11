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

    public async Task<IEnumerable<MenuDto>> ListarDinamicoTotalAsync()
    {
        using var connection = CreateConnection();

        var rows = await connection.QueryAsync<MenuDinamicoRow>(
            "dbo.sp_Seguridad_ObtenerMenuDinamicoTotal",
            commandType: CommandType.StoredProcedure
        );

        return BuildMenusFromDynamicRows(rows);
    }

    public async Task<IEnumerable<MenuDto>> ListarDinamicoPorPerfilAsync(int idPerfil)
    {
        using var connection = CreateConnection();

        var rows = await connection.QueryAsync<MenuDinamicoRow>(
            "dbo.sp_Seguridad_ObtenerMenuDinamico",
            new { IdPerfil = idPerfil },
            commandType: CommandType.StoredProcedure
        );

        return BuildMenusFromDynamicRows(rows);
    }

    public async Task<IEnumerable<MenuDto>> ListarPorUsuarioAsync(string idUsuario)
    {
        using var connection = CreateConnection();

        var rows = await connection.QueryAsync<MenuDinamicoRow>(
            "dbo.sp_Seguridad_ObtenerMenuDinamico",
            new { IdUsuario = idUsuario },
            commandType: CommandType.StoredProcedure
        );

        return BuildMenusFromDynamicRows(rows);
    }

    public async Task<int> CrearMenuPrincipalAsync(CrearMenuPrincipalRequest request, string usuario)
    {
        using var connection = CreateConnection();

        var creado = await connection.QueryFirstOrDefaultAsync<MenuDto>(
            "dbo.sp_SegMenu_Crear",
            new
            {
                request.NombreMenu,
                IdMenuPadre = (int?)null,
                Ruta = (string?)null,
                request.Icono,
                request.OrdenMenu,
                request.CodigoMenu,
                request.EsVisible,
                request.EsActivo,
                EsNodoPrincipal = true,
                UsuarioCreacion = usuario
            },
            commandType: CommandType.StoredProcedure
        );

        if (creado is null)
        {
            throw new InvalidOperationException("No se pudo crear el menú principal.");
        }

        return creado.IdMenu;
    }

    private static IEnumerable<MenuDto> BuildMenusFromDynamicRows(IEnumerable<MenuDinamicoRow> rows)
    {
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
            else if (row.IdMenuNivel2.HasValue && row.IdMenuNivel2.Value > 0 && menuMap.TryGetValue(row.IdMenuNivel2.Value, out var menuNivel2Existente))
            {
                // Do not overwrite a deeper node label already resolved with route information.
                var hasResolvedRoute = !string.IsNullOrWhiteSpace(menuNivel2Existente.Ruta);

                if (!hasResolvedRoute && string.IsNullOrWhiteSpace(menuNivel2Existente.NombreMenu) && !string.IsNullOrWhiteSpace(row.MenuNivel2))
                {
                    menuNivel2Existente.NombreMenu = row.MenuNivel2;
                }

                menuNivel2Existente.IdMenuPadre ??= row.IdMenuNivel1;
                menuNivel2Existente.Icono ??= row.IconoNivel2;
                menuNivel2Existente.OrdenMenu = row.OrdenNivel2 ?? menuNivel2Existente.OrdenMenu;

                if (!hasResolvedRoute)
                {
                    menuNivel2Existente.NivelMenu = Math.Min(menuNivel2Existente.NivelMenu, 1);
                }
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
            else if (row.IdMenuNivel3.HasValue && row.IdMenuNivel3.Value > 0 && menuMap.TryGetValue(row.IdMenuNivel3.Value, out var menuNivel3Existente))
            {
                var parentId = row.IdMenuNivel2 ?? row.IdMenuNivel1;

                // Prioritize level-3 values from the dynamic SP when IdMenu is duplicated across levels.
                if (!string.IsNullOrWhiteSpace(row.MenuNivel3))
                {
                    menuNivel3Existente.NombreMenu = row.MenuNivel3;
                }

                if (!string.IsNullOrWhiteSpace(row.RutaNivel3))
                {
                    menuNivel3Existente.Ruta = row.RutaNivel3;
                }

                menuNivel3Existente.IdMenuPadre = parentId;
                menuNivel3Existente.Icono = row.IconoNivel3 ?? menuNivel3Existente.Icono;
                menuNivel3Existente.OrdenMenu = row.OrdenNivel3 ?? menuNivel3Existente.OrdenMenu;
                menuNivel3Existente.NivelMenu = row.IdMenuNivel2.HasValue ? 2 : 1;
            }
        }

        return menuMap.Values
            .OrderBy(m => m.NivelMenu)
            .ThenBy(m => m.OrdenMenu)
            .ThenBy(m => m.IdMenu)
            .ToList();
    }

    public async Task<IEnumerable<MenuDto>> ListarAsignadoPorPerfilRolAsync(int idPerfil, int idRol)
    {
        using var connection = CreateConnection();

        var result = await connection.QueryAsync<MenuDto>(
            "dbo.sp_SegPerfilRolMenu_ListarAsignado",
            new { IdPerfil = idPerfil, IdRol = idRol },
            commandType: CommandType.StoredProcedure
        );

        return result;
    }

    public async Task GuardarAsignacionPerfilRolAsync(int idPerfil, int idRol, IEnumerable<int> menuIds, string usuario)
    {
        using var connection = CreateConnection();

        // ✅ ahora sí funciona correctamente
        await connection.OpenAsync();

        using var transaction = connection.BeginTransaction();

        try
        {
            // Eliminar asignaciones previas
            await connection.ExecuteAsync(
                "dbo.sp_SegPerfilRolMenu_EliminarPorPerfilRol",
                new { IdPerfil = idPerfil, IdRol = idRol },
                transaction: transaction,
                commandType: CommandType.StoredProcedure
            );

            // Insertar nuevas asignaciones
            foreach (var idMenu in menuIds.Distinct())
            {
                await connection.ExecuteAsync(
                    "dbo.sp_SegPerfilRolMenu_Insertar",
                    new
                    {
                        IdPerfil = idPerfil,
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

    public async Task<int> SincronizarPerfilUsuarioAsync(int idPerfil, string idUsuario)
    {
        using var connection = CreateConnection();

        await connection.OpenAsync();
        using var transaction = connection.BeginTransaction();

        try
        {
            var asignaciones = await connection.QueryAsync<(int IdRol, int IdMenu)>(
                @"
                SELECT DISTINCT
                    pr.IdRol,
                    rma.IdMenu
                FROM dbo.SegPerfilRol pr
                INNER JOIN dbo.SegRolMenuAccion rma
                    ON pr.IdRol = rma.IdRol
                LEFT JOIN dbo.SegAccion a
                    ON rma.IdAccion = a.IdAccion
                WHERE pr.IdPerfil = @IdPerfil
                  AND ISNULL(pr.EsActivo, 1) = 1
                  AND ISNULL(rma.EsActivo, 1) = 1
                  AND ISNULL(rma.EsPermitido, 1) = 1
                  AND (a.IdAccion IS NULL OR a.CodigoAccion = 'VER')
                ",
                new { IdPerfil = idPerfil },
                transaction: transaction
            );

            var total = 0;

            foreach (var asignacion in asignaciones)
            {
                await connection.ExecuteAsync(
                    "dbo.sp_SegPerfilRolMenu_Insertar",
                    new
                    {
                        IdPerfil = idPerfil,
                        IdRol = asignacion.IdRol,
                        IdMenu = asignacion.IdMenu,
                        UsuarioCreacion = idUsuario
                    },
                    transaction: transaction,
                    commandType: CommandType.StoredProcedure
                );

                total++;
            }

            transaction.Commit();
            return total;
        }
        catch
        {
            transaction.Rollback();
            throw;
        }
    }
}