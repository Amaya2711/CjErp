namespace CjERP.Infrastructure.Services;

/// <summary>
/// Interruptor de TRANSICION de la Fase 2 (docs/AI_COPILOT_IMPLEMENTATION_PLAN.md). Con Enabled = false
/// (valor por defecto y estado actual: el orquestador ni siquiera lo recibe en DI) el IA Chat sigue por
/// la ruta ANTIGUA, sin alcance. Con Enabled = true el orquestador autoriza por cuenta, resuelve el
/// alcance, revalida la memoria y solo ejecuta con alcance obligatorio; sin IIaAuthorizationService o
/// con denegacion NO ejecuta nada (no hay fallback sin restriccion).
///
/// NO ACTIVAR hasta contar con: implementaciones reales de IIaPermissionStore e IIaEmployeeDirectory,
/// IdPerfil/IdRol definidos, y el SP 02_sp_IA_Planilla_Buscar_Alcance.sql desplegado y probado.
/// Al activar, este tipo y la rama heredada de IaOrchestrator.ExecuteSearchAsync se ELIMINAN: debe quedar
/// una unica ruta de ejecucion con alcance obligatorio.
/// </summary>
public sealed class IaScopeEnforcementOptions
{
    public bool Enabled { get; set; }
}
