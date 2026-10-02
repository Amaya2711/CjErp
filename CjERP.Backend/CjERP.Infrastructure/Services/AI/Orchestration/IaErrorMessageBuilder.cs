// Extraido de IaChatService.cs (fila 1.7 de la tabla original de docs/AI_COPILOT_IMPLEMENTATION_PLAN.md).
// Codigo movido tal cual: no se cambio ningun comportamiento, solo la ubicacion. Traduce
// excepciones tecnicas a mensajes amigables para el usuario final; no toca SQL, HTTP ni
// ConversationState.
using static CjERP.Infrastructure.Services.IaTextUtils;

namespace CjERP.Infrastructure.Services;

internal static class IaErrorMessageBuilder
{
    internal static string BuildFriendlyErrorMessage(Exception ex)
    {
        if (IsDevelopmentEnvironment())
        {
            var diagnosticMessage = NormalizeText(ex.Message)
                                    ?? NormalizeText(ex.InnerException?.Message)
                                    ?? ex.GetType().Name;

            return diagnosticMessage;
        }

        if (ex is InvalidOperationException invalidOperationException)
        {
            var message = NormalizeText(invalidOperationException.Message) ?? string.Empty;

            if (message.Contains("Falta configurar la clave privada de OpenAI.", StringComparison.OrdinalIgnoreCase) ||
                message.Contains("Falta configurar el modelo de OpenAI.", StringComparison.OrdinalIgnoreCase))
            {
                return message;
            }

            if (message.Contains("OpenAI devolvio un error", StringComparison.OrdinalIgnoreCase))
            {
                if (message.Contains("rate_limit_exceeded", StringComparison.OrdinalIgnoreCase) ||
                    message.Contains("Request too large", StringComparison.OrdinalIgnoreCase) ||
                    message.Contains("tokens per min", StringComparison.OrdinalIgnoreCase))
                {
                    return "La consulta devolvio demasiada informacion para ser enviada completa a OpenAI en una sola solicitud. El sistema debe resumir y compactar el resultado antes del analisis.";
                }

                return "OpenAI devolvio un error al procesar la consulta. Revisa la configuracion de OPENAI_API_KEY y OPENAI_MODEL, o prueba con una pregunta mas especifica.";
            }

            if (message.Contains("OpenAI no devolvio contenido util.", StringComparison.OrdinalIgnoreCase))
            {
                return "OpenAI respondió con un formato inesperado. Intenta nuevamente con una consulta más precisa.";
            }

            if (message.Contains("Falta configurar la clave privada de Anthropic.", StringComparison.OrdinalIgnoreCase) ||
                message.Contains("Falta configurar el modelo de Anthropic.", StringComparison.OrdinalIgnoreCase))
            {
                return message
                    .Replace("Anthropic", "la IA", StringComparison.OrdinalIgnoreCase);
            }

            if (message.Contains("Anthropic devolvio un error", StringComparison.OrdinalIgnoreCase))
            {
                return "La IA devolvio un error al procesar la consulta. Revisa la configuracion de la API y el modelo, o prueba con una pregunta mas especifica.";
            }

            if (message.Contains("No se pudo interpretar la respuesta de Anthropic.", StringComparison.OrdinalIgnoreCase))
            {
                return "La IA respondió con un formato inesperado. Intenta nuevamente con una consulta mas precisa.";
            }

            if (message.Contains("La IA no devolvio HTML util para el reporte.", StringComparison.OrdinalIgnoreCase))
            {
                return "La IA no devolvio un dashboard HTML valido para exportar el reporte.";
            }

            if (message.Contains("Consulta excedio el limite de iteraciones", StringComparison.OrdinalIgnoreCase))
            {
                return "La consulta excedio el limite de iteraciones permitidas. Reformulala de forma mas concreta.";
            }
        }

        if (ex is HttpRequestException)
        {
            return "No se pudo conectar con OpenAI. Verifica la red y vuelve a intentarlo.";
        }

        return "No fue posible completar la consulta. Intenta nuevamente con una pregunta mas especifica.";
    }

    internal static bool IsDevelopmentEnvironment()
    {
        return string.Equals(
            Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT"),
            "Development",
            StringComparison.OrdinalIgnoreCase);
    }
}
