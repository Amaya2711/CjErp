// Fase 2 — fuente real de permisos del IA Chat (IIaPermissionStore).
// ESTADO: implementada, SIN probar contra una BD (no hay forma de simular SqlConnection) y NO activa:
// el orquestador solo la usa si IaScopeEnforcementOptions.Enabled = true (hoy no esta enlazada).
// Lee dbo.IaToolPermiso (script 08, PROPUESTA no ejecutada). Si la tabla no existe o la consulta falla,
// la excepcion llega a IaAuthorizationService, que la traduce en DENEGACION (fail-closed).
//
// Reglas:
// - Se consulta por IdUsuario en CADA llamada, sin cache: una revocacion o reduccion rige de inmediato.
// - Solo cuentan asignaciones activas: SegUsuarioPerfilRol.EsActivo, SegPerfilRol.EsActivo, y perfil y rol
//   activos. Los claims IdPerfil/IdRol del JWT NO se usan (el login puede devolver varias filas sin filtrar
//   EsActivo).
// - Devuelve TODAS las concesiones activas de la cuenta; IaAuthorizationService las une de forma
//   determinista. Un nivel desconocido en la tabla se ignora (no concede nada) y se registra un aviso.
using CjERP.Application.Interfaces.Services.AI;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;
using Microsoft.Extensions.Logging;

namespace CjERP.Infrastructure.Services;

public sealed class IaPermissionStore : IIaPermissionStore
{
    private readonly ISqlCommandFactory _sqlCommandFactory;
    private readonly ILogger<IaPermissionStore> _logger;

    public IaPermissionStore(ISqlCommandFactory sqlCommandFactory, ILogger<IaPermissionStore> logger)
    {
        _sqlCommandFactory = sqlCommandFactory;
        _logger = logger;
    }

    public async Task<IReadOnlyList<IaPermissionGrant>> GetActiveGrantsAsync(
        string idUsuario,
        string toolName,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(idUsuario) || string.IsNullOrWhiteSpace(toolName))
        {
            return Array.Empty<IaPermissionGrant>();
        }

        await using var connection = _sqlCommandFactory.CreateConnection();

        var rows = await connection.QueryAsync<PermisoRow>(
            _sqlCommandFactory.Create(
                """
                SELECT t.ScopeLevel, t.PermiteTotalesGlobales
                FROM dbo.SegUsuarioPerfilRol upr
                INNER JOIN dbo.SegPerfilRol pr
                    ON pr.IdPerfilRol = upr.IdPerfilRol
                   AND pr.EsActivo = 1
                INNER JOIN dbo.SegPerfil p
                    ON p.IdPerfil = pr.IdPerfil
                   AND p.EsActivo = 1
                INNER JOIN dbo.SegRol r
                    ON r.IdRol = pr.IdRol
                   AND r.EsActivo = 1
                INNER JOIN dbo.IaToolPermiso t
                    ON t.IdPerfilRol = pr.IdPerfilRol
                   AND t.ToolName = @ToolName
                   AND t.EsActivo = 1
                WHERE upr.IdUsuario = @IdUsuario
                  AND upr.EsActivo = 1
                """,
                new { IdUsuario = idUsuario, ToolName = toolName },
                cancellationToken: cancellationToken));

        var grants = new List<IaPermissionGrant>();
        foreach (var row in rows)
        {
            if (TryParseLevel(row.ScopeLevel, out var level))
            {
                grants.Add(new IaPermissionGrant(level, row.PermiteTotalesGlobales));
            }
            else
            {
                _logger.LogWarning("IaToolPermiso con ScopeLevel desconocido '{ScopeLevel}': se ignora (no concede acceso).", row.ScopeLevel);
            }
        }

        return grants;
    }

    // Mapeo por nombre de columna (mas robusto que tuplas posicionales).
    private sealed class PermisoRow
    {
        public string? ScopeLevel { get; set; }

        public bool PermiteTotalesGlobales { get; set; }
    }

    internal static bool TryParseLevel(string? value, out IaScopeLevel level)
    {
        switch (value?.Trim().ToUpperInvariant())
        {
            case "PROPIO":
                level = IaScopeLevel.Propio;
                return true;
            case "EQUIPO":
                level = IaScopeLevel.Equipo;
                return true;
            case "TOTAL":
                level = IaScopeLevel.Total;
                return true;
            default:
                level = default;
                return false;
        }
    }
}
