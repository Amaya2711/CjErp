// Fase 2 (docs/AI_COPILOT_IMPLEMENTATION_PLAN.md) — contratos de autorizacion y alcance del IA Chat.
// ESTADO: contratos preparados y probados de forma sintetica. NO estan conectados al flujo real
// (IaOrchestrator) ni registrados en DI: faltan la fuente de permisos, la asignacion de
// IdPerfil/IdRol y el despliegue SQL compatible. Ver el anexo del plan.
//
// Reglas del diseno que estos tipos imponen:
// - La identidad es SOLO el IdUsuario autenticado por el backend (nunca body, nunca el LLM, nunca un nombre).
// - Se autoriza por cuenta (IdUsuario). Dos cuentas del mismo empleado no comparten permisos.
// - Denegar ante identidad ausente, permiso ausente o fallo de verificacion.
// - El permiso de totales globales es INDEPENDIENTE del nivel de alcance de filas.
namespace CjERP.Application.Interfaces.Services.AI;

/// <summary>Nivel de alcance de filas. Orden = amplitud creciente (Propio &lt; Equipo &lt; Total).</summary>
public enum IaScopeLevel
{
    Propio = 1,
    Equipo = 2,
    Total = 3
}

/// <summary>
/// Campos de Planilla contra los que se evalua la pertenencia de la fila al alcance.
/// Decision confirmada: Propio = responsable O solicitante. Equipo se evalua igual sobre el conjunto del equipo.
/// </summary>
[Flags]
public enum IaScopeFields
{
    None = 0,
    Responsable = 1,
    Solicitante = 2,
    ResponsableOSolicitante = Responsable | Solicitante
}

/// <summary>
/// Una concesion activa para una cuenta y una herramienta. "Level" y "GlobalTotals" son permisos
/// independientes: una cuenta puede tener uno, otro, ambos o ninguno.
/// </summary>
public sealed record IaPermissionGrant(IaScopeLevel? Level, bool GlobalTotals);

/// <summary>
/// Fuente de permisos (SIN IMPLEMENTAR: la tabla/origen de permisos y los IdPerfil/IdRol concretos
/// estan pendientes de decision). Debe devolver TODAS las concesiones activas de la cuenta, no una
/// fila elegida arbitrariamente; la combinacion la hace el servicio de autorizacion.
/// </summary>
public interface IIaPermissionStore
{
    Task<IReadOnlyList<IaPermissionGrant>> GetActiveGrantsAsync(
        string idUsuario,
        string toolName,
        CancellationToken cancellationToken);
}

/// <summary>
/// Directorio de empleados (SIN IMPLEMENTAR). Resuelve la identidad corporativa en servidor:
/// Usuario.IdEmpleado -> Empleado.IdEmpleadoCj -> EmpleadoCj.IdEmpleado, y los subordinados directos
/// (EmpleadoCjDetalle.IdResponsableCj = titular).
/// </summary>
public interface IIaEmployeeDirectory
{
    /// <summary>EmpleadoCj.IdEmpleado de la cuenta, o null si no se puede resolver de forma unica.</summary>
    Task<int?> ResolveEmpleadoCjAsync(string idUsuario, CancellationToken cancellationToken);

    /// <summary>EmpleadoCj.IdEmpleado de quienes reportan directamente al titular (sin incluirlo).</summary>
    Task<IReadOnlyList<int>> GetDirectReportsAsync(int idEmpleadoCj, CancellationToken cancellationToken);
}

public sealed record IaAuthorizationRequest(string? IdUsuario, string ToolName);

/// <summary>
/// Resultado de autorizar. Solo cuando Allowed == true existe Scope; cuando es false, Scope es null y
/// DenyReason es un codigo interno estable (no se muestra al usuario ni al LLM con detalle).
/// </summary>
public sealed record IaAuthorizationResult
{
    private IaAuthorizationResult(bool allowed, IaResolvedScope? scope, string? denyReason)
    {
        Allowed = allowed;
        Scope = scope;
        DenyReason = denyReason;
    }

    public bool Allowed { get; }

    public IaResolvedScope? Scope { get; }

    public string? DenyReason { get; }

    public static IaAuthorizationResult Allow(IaResolvedScope scope) =>
        new(true, scope ?? throw new ArgumentNullException(nameof(scope)), null);

    public static IaAuthorizationResult Deny(string reason) => new(false, null, reason);
}

public interface IIaAuthorizationService
{
    /// <summary>
    /// Nunca lanza para denegar: cualquier fallo interno se traduce en Deny. Quien llame debe tratar
    /// una excepcion inesperada tambien como denegacion.
    /// </summary>
    Task<IaAuthorizationResult> AuthorizeAsync(
        IaAuthorizationRequest request,
        CancellationToken cancellationToken);
}
