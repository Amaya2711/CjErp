// CJ Intelligence: autorizacion por alcance SOLO para el nuevo modulo (el chat anterior no se toca).
//
// Garantias, todas con pruebas (CjIntelligenceScopeResolverTests):
// - Identidad ausente, permiso ausente, empleado no resuelto, excepcion o servicio que no devuelve alcance
//   => DENEGADO. En ningun caso se produce un alcance TOTAL de respaldo. TOTAL solo llega si una
//   concesion activa en IaToolPermiso (ScopeLevel = TOTAL) lo otorga.
// - Los almacenes interpretan filas que entrega ICjIntelligenceAuthorizationData (SQL por procedimiento con la conexion de
//   cj_ia, sin permisos sobre tablas). La interpretacion (niveles desconocidos, empleado ambiguo...) es logica pura y se
//   prueba sin base de datos; solo SqlCjIntelligenceAuthorizationData requiere SQL real.
// - Se consulta en CADA operacion, sin cache: un cambio o revocacion rige de inmediato.
using System.Data;
using CjERP.Application.Interfaces.Services.AI;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;
using Microsoft.Extensions.Logging;

namespace CjERP.Infrastructure.Services.AI.CjIntelligence;

/// <summary>
/// Nombre de permiso con el que se autorizan TODAS las herramientas de pagos de CJ Intelligence. Se reutiliza
/// la concesion existente de 'buscar_planilla' (IaToolPermiso no se modifica) porque consultan los mismos datos
/// con el mismo procedimiento. Una herramienta futura con otros datos debera tener su propia concesion.
/// </summary>
public static class CjIntelligenceTools
{
    public const string PagosPermission = "buscar_planilla";
}

public sealed record CjIntelligenceScopeDecision(IaResolvedScope? Scope, string? DenyReason)
{
    public bool Allowed => Scope is not null;

    public static CjIntelligenceScopeDecision Allow(IaResolvedScope scope) => new(scope, null);

    public static CjIntelligenceScopeDecision Deny(string reason) => new(null, reason);
}

public interface ICjIntelligenceScopeResolver
{
    /// <summary>Nunca lanza para denegar (salvo cancelacion). Quien llame no debe ejecutar nada sin Allowed.</summary>
    Task<CjIntelligenceScopeDecision> ResolveAsync(string? idUsuario, CancellationToken cancellationToken);
}

public sealed class CjIntelligenceScopeResolver : ICjIntelligenceScopeResolver
{
    public const string DenyIdentityMissing = "identidad_ausente";
    public const string DenyNotAllowed = "no_autorizado";
    public const string DenyVerificationFailed = "fallo_de_verificacion";

    private readonly IIaAuthorizationService _authorization;
    private readonly ILogger<CjIntelligenceScopeResolver> _logger;

    public CjIntelligenceScopeResolver(IIaAuthorizationService authorization, ILogger<CjIntelligenceScopeResolver> logger)
    {
        _authorization = authorization;
        _logger = logger;
    }

    public async Task<CjIntelligenceScopeDecision> ResolveAsync(string? idUsuario, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(idUsuario))
        {
            return CjIntelligenceScopeDecision.Deny(DenyIdentityMissing);
        }

        try
        {
            var result = await _authorization.AuthorizeAsync(
                new IaAuthorizationRequest(idUsuario.Trim(), CjIntelligenceTools.PagosPermission),
                cancellationToken);

            return result is { Allowed: true, Scope: not null }
                ? CjIntelligenceScopeDecision.Allow(result.Scope)
                : CjIntelligenceScopeDecision.Deny(result?.DenyReason ?? DenyNotAllowed);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "CJ Intelligence: fallo al autorizar; se deniega.");
            return CjIntelligenceScopeDecision.Deny(DenyVerificationFailed);
        }
    }
}

public sealed record CjPermissionRow(string? ScopeLevel, bool PermiteTotalesGlobales);

/// <summary>Acceso a datos de autorizacion (solo lectura). Una excepcion aqui nunca debe interpretarse como "permitido".</summary>
public interface ICjIntelligenceAuthorizationData
{
    Task<IReadOnlyList<CjPermissionRow>> GetPermissionRowsAsync(string idUsuario, string toolName, CancellationToken cancellationToken);

    Task<IReadOnlyList<int>> GetEmployeeIdsAsync(string idUsuario, CancellationToken cancellationToken);

    Task<IReadOnlyList<int>> GetTeamIdsAsync(int idEmpleadoCj, CancellationToken cancellationToken);
}

/// <summary>Implementacion SQL: procedimientos sp_IA_Cj_Autorizacion_* con la conexion de cj_ia. Requiere BD real para probarse.</summary>
public sealed class SqlCjIntelligenceAuthorizationData : ICjIntelligenceAuthorizationData
{
    private readonly ICjIntelligenceSqlCommandFactory _sql;

    public SqlCjIntelligenceAuthorizationData(ICjIntelligenceSqlCommandFactory sql)
    {
        _sql = sql;
    }

    public async Task<IReadOnlyList<CjPermissionRow>> GetPermissionRowsAsync(string idUsuario, string toolName, CancellationToken cancellationToken)
    {
        await using var connection = _sql.CreateConnection();
        var rows = await connection.QueryAsync<CjPermissionRow>(
            _sql.Create(
                "dbo.sp_IA_Cj_Autorizacion_Permisos",
                new { IdUsuario = idUsuario, ToolName = toolName },
                CommandType.StoredProcedure,
                cancellationToken));
        return rows.ToList();
    }

    public async Task<IReadOnlyList<int>> GetEmployeeIdsAsync(string idUsuario, CancellationToken cancellationToken)
    {
        await using var connection = _sql.CreateConnection();
        var ids = await connection.QueryAsync<int>(
            _sql.Create("dbo.sp_IA_Cj_Autorizacion_Empleado", new { IdUsuario = idUsuario }, CommandType.StoredProcedure, cancellationToken));
        return ids.ToList();
    }

    public async Task<IReadOnlyList<int>> GetTeamIdsAsync(int idEmpleadoCj, CancellationToken cancellationToken)
    {
        await using var connection = _sql.CreateConnection();
        var ids = await connection.QueryAsync<int>(
            _sql.Create("dbo.sp_IA_Cj_Autorizacion_Equipo", new { IdEmpleadoCj = idEmpleadoCj }, CommandType.StoredProcedure, cancellationToken));
        return ids.ToList();
    }
}

/// <summary>IIaPermissionStore: interpreta las filas de permisos. Sin concesion o nivel desconocido = no concede nada.</summary>
public sealed class CjIntelligencePermissionStore : IIaPermissionStore
{
    private readonly ICjIntelligenceAuthorizationData _data;
    private readonly ILogger<CjIntelligencePermissionStore> _logger;

    public CjIntelligencePermissionStore(ICjIntelligenceAuthorizationData data, ILogger<CjIntelligencePermissionStore> logger)
    {
        _data = data;
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

        // Una excepcion se propaga: IaAuthorizationService la traduce en denegacion.
        var rows = await _data.GetPermissionRowsAsync(idUsuario.Trim(), toolName.Trim(), cancellationToken);

        var grants = new List<IaPermissionGrant>();
        foreach (var row in rows ?? Array.Empty<CjPermissionRow>())
        {
            if (row is null)
            {
                continue;
            }

            if (IaPermissionStore.TryParseLevel(row.ScopeLevel, out var level))
            {
                grants.Add(new IaPermissionGrant(level, row.PermiteTotalesGlobales));
            }
            else
            {
                // Nivel desconocido: no concede nada (fail-closed). La fila se descarta, incluso su permiso de totales.
                _logger.LogWarning("IaToolPermiso con ScopeLevel desconocido '{ScopeLevel}': se ignora.", row.ScopeLevel);
            }
        }

        return grants;
    }
}

/// <summary>IIaEmployeeDirectory: interpreta los empleados devueltos por SQL. Cero o varios = no resuelto.</summary>
public sealed class CjIntelligenceEmployeeDirectory : IIaEmployeeDirectory
{
    private readonly ICjIntelligenceAuthorizationData _data;

    public CjIntelligenceEmployeeDirectory(ICjIntelligenceAuthorizationData data)
    {
        _data = data;
    }

    public async Task<int?> ResolveEmpleadoCjAsync(string idUsuario, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(idUsuario))
        {
            return null;
        }

        var ids = (await _data.GetEmployeeIdsAsync(idUsuario.Trim(), cancellationToken) ?? Array.Empty<int>())
            .Distinct()
            .ToList();

        // Unico y positivo; ninguno o ambiguo = no resuelto (el servicio de autorizacion deniega).
        return ids.Count == 1 && ids[0] > 0 ? ids[0] : null;
    }

    public async Task<IReadOnlyList<int>> GetDirectReportsAsync(int idEmpleadoCj, CancellationToken cancellationToken)
    {
        if (idEmpleadoCj <= 0)
        {
            return Array.Empty<int>();
        }

        var ids = await _data.GetTeamIdsAsync(idEmpleadoCj, cancellationToken) ?? Array.Empty<int>();

        // Solo positivos, sin duplicados, sin el titular, en orden estable.
        return ids.Where(id => id > 0 && id != idEmpleadoCj).Distinct().OrderBy(id => id).ToList();
    }
}
