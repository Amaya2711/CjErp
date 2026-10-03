// Fase 2 — servicio de autorizacion y resolucion de alcance del IA Chat.
// ESTADO: implementado y probado de forma sintetica; NO registrado en DI ni invocado por
// IaOrchestrator. Sus dependencias (IIaPermissionStore, IIaEmployeeDirectory) no tienen
// implementacion todavia (fuente de permisos y IdPerfil/IdRol pendientes), de modo que no existe
// forma de conectarlo por accidente. Ver docs/AI_COPILOT_IMPLEMENTATION_PLAN.md.
using CjERP.Application.Interfaces.Services.AI;
using Microsoft.Extensions.Logging;

namespace CjERP.Infrastructure.Services;

public sealed class IaAuthorizationService : IIaAuthorizationService
{
    // Codigos internos estables; no se exponen con detalle al usuario ni al LLM.
    public const string DenyIdentityMissing = "identidad_ausente";
    public const string DenyToolMissing = "herramienta_ausente";
    public const string DenyNoRowScope = "sin_permiso_de_alcance";
    public const string DenyEmployeeUnresolved = "empleado_no_resuelto";
    public const string DenyVerificationFailed = "fallo_de_verificacion";

    private readonly IIaPermissionStore _permissionStore;
    private readonly IIaEmployeeDirectory _employeeDirectory;
    private readonly ILogger<IaAuthorizationService> _logger;

    public IaAuthorizationService(
        IIaPermissionStore permissionStore,
        IIaEmployeeDirectory employeeDirectory,
        ILogger<IaAuthorizationService> logger)
    {
        _permissionStore = permissionStore;
        _employeeDirectory = employeeDirectory;
        _logger = logger;
    }

    public async Task<IaAuthorizationResult> AuthorizeAsync(
        IaAuthorizationRequest request,
        CancellationToken cancellationToken)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.IdUsuario))
        {
            return IaAuthorizationResult.Deny(DenyIdentityMissing);
        }

        if (string.IsNullOrWhiteSpace(request.ToolName))
        {
            return IaAuthorizationResult.Deny(DenyToolMissing);
        }

        try
        {
            var idUsuario = request.IdUsuario.Trim();
            var grants = await _permissionStore.GetActiveGrantsAsync(idUsuario, request.ToolName, cancellationToken);
            var combined = CombineGrants(grants);

            // Sin nivel de alcance concedido no hay acceso a filas: tener solo "totales globales" no basta.
            if (combined.Level is null)
            {
                return IaAuthorizationResult.Deny(DenyNoRowScope);
            }

            if (combined.Level == IaScopeLevel.Total)
            {
                return IaAuthorizationResult.Allow(IaResolvedScope.ForTotal(combined.GlobalTotals));
            }

            var titular = await _employeeDirectory.ResolveEmpleadoCjAsync(idUsuario, cancellationToken);
            if (titular is null || titular <= 0)
            {
                return IaAuthorizationResult.Deny(DenyEmployeeUnresolved);
            }

            var ids = new List<int> { titular.Value };
            if (combined.Level == IaScopeLevel.Equipo)
            {
                var reports = await _employeeDirectory.GetDirectReportsAsync(titular.Value, cancellationToken);
                ids = BuildTeam(titular.Value, reports);
            }

            return IaAuthorizationResult.Allow(IaResolvedScope.ForRestricted(
                combined.Level.Value,
                IaScopeFields.ResponsableOSolicitante,
                ids,
                combined.GlobalTotals));
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "IA Chat: fallo al verificar permisos; se deniega por defecto.");
            return IaAuthorizationResult.Deny(DenyVerificationFailed);
        }
    }

    /// <summary>
    /// Combina TODAS las concesiones activas de la cuenta sin elegir una fila arbitraria:
    /// el nivel efectivo es el MAS AMPLIO concedido (Total &gt; Equipo &gt; Propio) y los totales
    /// globales se conceden si CUALQUIER concesion activa los otorga. Es una union determinista e
    /// independiente del orden. Nivel y totales globales se combinan por separado.
    /// </summary>
    internal static (IaScopeLevel? Level, bool GlobalTotals) CombineGrants(IReadOnlyList<IaPermissionGrant>? grants)
    {
        if (grants is null || grants.Count == 0)
        {
            return (null, false);
        }

        IaScopeLevel? level = null;
        foreach (var grant in grants.Where(g => g is not null && g.Level.HasValue))
        {
            if (level is null || grant.Level!.Value > level.Value)
            {
                level = grant.Level;
            }
        }

        return (level, grants.Any(g => g is not null && g.GlobalTotals));
    }

    /// <summary>Equipo = titular + subordinados directos. Excluye autorreferencias y duplicados; ids no positivos se ignoran.</summary>
    internal static List<int> BuildTeam(int titular, IEnumerable<int>? directReports)
    {
        var team = new HashSet<int> { titular };
        foreach (var id in directReports ?? Array.Empty<int>())
        {
            if (id > 0)
            {
                team.Add(id);
            }
        }

        return team.OrderBy(id => id).ToList();
    }
}

internal static class IaResolvedScopeExtensions
{
    /// <summary>
    /// Representacion para ConversationState.MatchesAuthorizedScope: el nivel codifica tambien los
    /// campos y el permiso de totales, para que un cambio en cualquiera invalide la memoria.
    /// </summary>
    internal static IaAuthorizedScope ToAuthorizedScope(this IaResolvedScope scope) =>
        new(
            $"{scope.Level}:{scope.Fields}:globales={(scope.CanViewGlobalTotals ? 1 : 0)}",
            scope.EmployeeIds.Select(id => id.ToString(System.Globalization.CultureInfo.InvariantCulture)).ToList());
}
