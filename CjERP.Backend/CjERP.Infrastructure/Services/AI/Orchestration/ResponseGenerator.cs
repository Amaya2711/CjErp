// Extraido de IaChatService.cs (fila 1.12 de la tabla original de docs/AI_COPILOT_IMPLEMENTATION_PLAN.md).
// Codigo movido tal cual: no se cambio ningun comportamiento, solo la ubicacion. Genera la
// respuesta final de GASTOS vía OpenAI a partir del payload ya analizado (GastosAnalysisService) y
// normaliza el texto cuando el payload mezcla monedas. Depende de IOpenAiChatProvider (misma
// interfaz ya desacoplada en Fase 1.2); no toca SQL, ConversationState ni auditoria.
using System.Globalization;
using System.Text.Json;

using static CjERP.Infrastructure.Services.IaTextUtils;
using static CjERP.Infrastructure.Services.GastosQueryPlanner;
using static CjERP.Infrastructure.Services.GastosAnalysisService;

namespace CjERP.Infrastructure.Services;

public interface IResponseGenerator
{
    Task<string> GenerateOpenAiFinalAnswerAsync(
        string question,
        string conversationContext,
        string module,
        string route,
        string responseType,
        BuscarPlanillaArgs searchArgs,
        object payload,
        CancellationToken cancellationToken);
}

public sealed class ResponseGenerator : IResponseGenerator
{
    private readonly IOpenAiChatProvider _openAiChatProvider;

    public ResponseGenerator(IOpenAiChatProvider openAiChatProvider)
    {
        _openAiChatProvider = openAiChatProvider;
    }

    public async Task<string> GenerateOpenAiFinalAnswerAsync(
        string question,
        string conversationContext,
        string module,
        string route,
        string responseType,
        BuscarPlanillaArgs searchArgs,
        object payload,
        CancellationToken cancellationToken)
    {
        var systemPrompt = """
Actua como un analista senior de gastos empresariales especializado en control presupuestal, rendiciones, ordenes de compra y seguimiento operativo.

Responde siempre en espanol claro, ejecutivo y orientado a negocio.
Basa tu respuesta unicamente en la informacion entregada en la conversacion y en el resultado de la consulta actual.
La conversacion previa es la fuente principal para entender la intencion del usuario. Si el mensaje actual es una continuacion, no reinicies el tema ni pierdas el contexto.
Si el mensaje actual es una continuidad o confirmacion breve, la prioridad de interpretacion debe ser el historial conversacional por encima del resultado nuevo.
No inventes datos, montos, clientes, responsables, solicitantes, proyectos, sites ni estados.
Si no hay datos suficientes, indicalo claramente y sugiere validar la consulta.
Redacta una respuesta natural, como si fuera una respuesta directa de chat.
Si la metrica principal del resultado actual es Ventas, analiza y describe la respuesta como ventas; no la presentes como gasto, subtotal o consumo salvo que el usuario lo pida explicitamente o exista una comparacion entre ambos conceptos.
Si el payload incluye comparison.enabled = true, la respuesta debe tratarse como una comparativa entre dos metricas distintas:
- Ventas = comparison.ventasField
- Gastos = comparison.gastosField
- Usa comparison.totals y comparison.breakdowns como fuente principal para tablas, diferencias, porcentajes y conclusiones.
- No mezcles ventas y gastos en una sola suma ni digas que el resultado corresponde solo a gastos si el usuario pidio compararlos.
Adapta el formato a la necesidad que se desprende del historial:
- si la conversacion esta pidiendo analisis, explica el resultado de forma ejecutiva;
- si esta pidiendo desglose, separa por las dimensiones relevantes;
- si esta pidiendo comparacion, usa diferencias y porcentajes;
- si esta pidiendo continuidad sobre un resultado previo, conserva el hilo y responde sobre ese mismo resultado.
No respondas con una plantilla rigida si el historial indica otra necesidad.
Menciona siempre el periodo o rango de fechas analizado cuando exista.
Si el payload incluye unavailableFields, esos campos NO estan disponibles por permisos del usuario y no son cero: no los estimes, no los sustituyas por otros campos, no calcules saldos, porcentajes, comparaciones, semaforos ni totales con ellos y no los presentes como 0; si la pregunta los requiere, indica claramente que no estan disponibles.
            Separa siempre los resultados por moneda cuando existan una o varias monedas en la data. Todo resumen, total, comparacion o detalle debe indicar la moneda correspondiente.
            Si el payload indica que multipleCurrencies = true o hasMultipleCurrencies = true, la respuesta debe considerar moneda separada como regla obligatoria:
            - no presentes un unico total analizado sin moneda;
            - no asumas que todo esta en soles;
            - usa currencyTotals y breakdowns.currency para mostrar cada moneda por separado;
            - si necesitas un total, debe ir rotulado por moneda (por ejemplo: "Soles", "Dolares");
            - si el dato mezcla monedas, el resumen principal debe iniciar por el desglose por moneda y no por una cifra consolidada.
            Si existe mas de una moneda, no mezcles importes en un solo total sin separarlos primero por moneda.
            Si el payload incluye breakdowns.currency, currencyTotals o comparison.breakdowns.currency, usalos de forma explicita dentro de la respuesta.
            Regla de moneda obligatoria:
            - Si hasMultipleCurrencies = true, no redactes un total consolidado.
            - No sumes monedas distintas bajo una sola cifra, ni siquiera como texto descriptivo.
            - No uses frases como "por un total de X considerando ambas monedas" ni equivalentes.
            - Si hay varias monedas, la respuesta debe comenzar con el desglose por moneda y luego, si corresponde, el detalle ejecutivo.
Si hay suficiente informacion para un analisis ejecutivo, desarrolla conclusiones claras y naturales sin limitarte a un resumen corto.
""";

        var prioritiseHistory = QuestionLooksLikeConversation(question);

        var userPrompt = $"""
Consulta actual:
{question}

Modulo:
{module}

Historial de conversacion:
{conversationContext}

Prioridad de interpretacion:
{(prioritiseHistory ? "HISTORIAL_CONVERSACIONAL" : "RESULTADO_ACTUAL")}

Periodo consultado:
{BuildPeriodText(searchArgs)}

Resultado estructurado de la consulta actual:
{JsonSerializer.Serialize(payload, IaChatSharedDefaults.JsonOptions)}

Genera una respuesta final que respete el hilo de la conversacion y analice los datos disponibles sin forzar una plantilla fija.
""";

        var answer = await _openAiChatProvider.SendChatCompletionAsync(
            [
                new OpenAiChatMessage
                {
                    Role = "system",
                    Content = systemPrompt
                },
                new OpenAiChatMessage
                {
                    Role = "user",
                    Content = userPrompt
                }
            ],
            cancellationToken,
            responseFormatJson: false);

        return NormalizeCurrencyResponseIfNeeded(answer, payload);
    }

    private static string NormalizeCurrencyResponseIfNeeded(string answer, object payload)
    {
        if (!TryGetHasMultipleCurrencies(payload, out var hasMultipleCurrencies) || !hasMultipleCurrencies)
        {
            return answer;
        }

        var currencySummary = BuildCurrencySummaryFromPayload(payload);
        if (string.IsNullOrWhiteSpace(currencySummary))
        {
            return answer;
        }

        var lines = NormalizeText(answer)
            .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries)
            .ToList();

        var sanitizedLines = new List<string>();
        foreach (var line in lines)
        {
            var lower = line.ToLowerInvariant();
            if (lower.Contains("considerando ambas monedas") ||
                lower.Contains("total consolidado") ||
                (lower.Contains("por un total de") && lower.Contains("moneda")) ||
                (lower.Contains("total analizado") && !lower.Contains("soles") && !lower.Contains("dolares") && !lower.Contains("usd")))
            {
                continue;
            }

            sanitizedLines.Add(line);
        }

        var sanitizedAnswer = string.Join(Environment.NewLine, sanitizedLines).Trim();
        if (string.IsNullOrWhiteSpace(sanitizedAnswer))
        {
            sanitizedAnswer = answer.Trim();
        }

        return $"{currencySummary}{Environment.NewLine}{Environment.NewLine}{sanitizedAnswer}";
    }

    private static bool TryGetHasMultipleCurrencies(object payload, out bool hasMultipleCurrencies)
    {
        hasMultipleCurrencies = false;

        try
        {
            using var document = JsonDocument.Parse(JsonSerializer.Serialize(payload, IaChatSharedDefaults.JsonOptions));
            var root = document.RootElement;

            if (root.TryGetProperty("hasMultipleCurrencies", out var directHasMultiple) &&
                directHasMultiple.ValueKind == JsonValueKind.True)
            {
                hasMultipleCurrencies = true;
                return true;
            }

            if (root.TryGetProperty("assumptions", out var assumptions) &&
                assumptions.ValueKind == JsonValueKind.Object &&
                assumptions.TryGetProperty("multipleCurrencies", out var assumptionMultiple) &&
                assumptionMultiple.ValueKind == JsonValueKind.True)
            {
                hasMultipleCurrencies = true;
                return true;
            }

            if (root.TryGetProperty("currencyTotals", out var currencyTotals) &&
                currencyTotals.ValueKind == JsonValueKind.Array &&
                currencyTotals.GetArrayLength() > 1)
            {
                hasMultipleCurrencies = true;
                return true;
            }
        }
        catch
        {
            return false;
        }

        return true;
    }

    private static string BuildCurrencySummaryFromPayload(object payload)
    {
        try
        {
            using var document = JsonDocument.Parse(JsonSerializer.Serialize(payload, IaChatSharedDefaults.JsonOptions));
            var root = document.RootElement;
            if (!root.TryGetProperty("currencyTotals", out var currencyTotals) || currencyTotals.ValueKind != JsonValueKind.Array)
            {
                return string.Empty;
            }

            var parts = new List<string>();
            foreach (var item in currencyTotals.EnumerateArray())
            {
                var moneda = TryGetJsonString(item, "moneda") ?? TryGetJsonString(item, "Moneda") ?? string.Empty;
                var registros = TryGetJsonInt32(item, "registros") ?? TryGetJsonInt32(item, "Registros") ?? 0;
                var monto = TryGetJsonDecimal(item, "monto") ?? TryGetJsonDecimal(item, "Monto") ?? 0m;

                if (monto <= 0m)
                {
                    continue;
                }

                parts.Add($"- {FormatCurrencySummaryLabel(moneda)}: {FormatCurrencySummaryAmount(moneda, monto)} en {registros} registros");
            }

            if (parts.Count == 0)
            {
                return string.Empty;
            }

            return $"Resumen por moneda:{Environment.NewLine}{string.Join(Environment.NewLine, parts)}{Environment.NewLine}- No se muestra total consolidado porque la data mezcla monedas.";
        }
        catch
        {
            return string.Empty;
        }
    }

    private static string FormatCurrencySummaryLabel(string moneda)
    {
        var normalized = NormalizeText(moneda)?.ToUpperInvariant() ?? string.Empty;
        return normalized switch
        {
            "USD" or "US$" or "DOLARES" or "DOLÁRES" => "Dólares",
            _ => "Soles"
        };
    }

    private static string FormatCurrencySummaryAmount(string moneda, decimal monto)
    {
        var normalized = NormalizeText(moneda)?.ToUpperInvariant() ?? string.Empty;
        var formatted = monto.ToString("N2", CultureInfo.InvariantCulture);
        return normalized switch
        {
            "USD" or "US$" or "DOLARES" or "DOLÁRES" => $"US$ {formatted}",
            _ => $"S/ {formatted}"
        };
    }

    private static string? TryGetJsonString(JsonElement element, string propertyName)
    {
        return element.TryGetProperty(propertyName, out var property) && property.ValueKind is JsonValueKind.String or JsonValueKind.Number
            ? property.ToString()
            : null;
    }

    private static int? TryGetJsonInt32(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        return property.ValueKind switch
        {
            JsonValueKind.Number when property.TryGetInt32(out var value) => value,
            JsonValueKind.String when int.TryParse(property.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed) => parsed,
            _ => null
        };
    }

    private static decimal? TryGetJsonDecimal(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        return property.ValueKind switch
        {
            JsonValueKind.Number when property.TryGetDecimal(out var value) => value,
            JsonValueKind.String when decimal.TryParse(property.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed) => parsed,
            _ => null
        };
    }
}
