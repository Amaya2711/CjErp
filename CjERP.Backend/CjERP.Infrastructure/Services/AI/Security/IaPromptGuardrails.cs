// Extraido de IaChatService.cs en Fase 1.1 (docs/AI_COPILOT_IMPLEMENTATION_PLAN.md).
// Codigo movido tal cual: no se cambio ningun comportamiento, solo la ubicacion.

namespace CjERP.Infrastructure.Services;

internal static class IaPromptGuardrails
{
    internal static bool ContainsProhibitedSqlIntent(string question)
    {
        var dangerousTokens = new[]
        {
            "delete",
            "drop",
            "alter",
            "truncate",
            "insert",
            "update",
            "merge",
            "exec",
            "execute"
        };

        return dangerousTokens.Any(token =>
            System.Text.RegularExpressions.Regex.IsMatch(
                question,
                $@"\b{System.Text.RegularExpressions.Regex.Escape(token)}\b",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant));
    }
}
