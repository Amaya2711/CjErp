// Extraido de IaChatService.cs (paso 1.2 original de docs/AI_COPILOT_IMPLEMENTATION_PLAN.md,
// seccion 1.2, ejecutado tras los pasos "Fase 1.1-1.4" de los anexos). Codigo movido tal cual:
// no se cambio ningun comportamiento, solo la ubicacion.
//
// Alcance reducido respecto al diseño original de la fila 1.2 de la tabla: esa fila tambien
// asignaba ExtractJsonCandidate y NormalizeResponseType a esta clase, pero ambos ya migraron a
// otros componentes en pasos posteriores (ExtractJsonCandidate -> GastosQueryPlanner.cs en la
// extraccion "Fase 1.2" de los anexos; NormalizeResponseType -> IaConversationFollowUpResolver.cs
// en la extraccion "Fase 1.4"). Verificado con grep sobre IaChatService.cs antes de este cambio:
// ninguno de los dos sigue definido ahi. Solo quedaban NormalizeText y Truncate.
namespace CjERP.Infrastructure.Services;

internal static class IaTextUtils
{
    internal static string? NormalizeText(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    internal static string Truncate(string value, int maxLength)
    {
        if (string.IsNullOrEmpty(value) || value.Length <= maxLength)
        {
            return value;
        }

        return value[..maxLength];
    }
}
