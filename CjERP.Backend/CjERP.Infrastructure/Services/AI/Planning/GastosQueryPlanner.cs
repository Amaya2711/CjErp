// Extraido de IaChatService.cs en Fase 1.2 (docs/AI_COPILOT_IMPLEMENTATION_PLAN.md).
// Codigo movido tal cual: no se cambio ningun comportamiento, solo la ubicacion.
// Decide route/responseType/buscarArgs para GASTOS a partir de la pregunta del usuario,
// delegando la comunicacion HTTP con OpenAI a IOpenAiChatProvider (Fase 1.2). No toca SQL,
// ConversationState ni auditoria: eso sigue coordinado por IaChatService.
using System.Text.Json;

namespace CjERP.Infrastructure.Services;

using static CjERP.Infrastructure.Services.IaChatSharedDefaults;
using static CjERP.Infrastructure.Services.BuscarPlanillaQuestionHeuristics;
using static CjERP.Infrastructure.Services.IaTextUtils;

public interface IGastosQueryPlanner
{
    Task<OpenAiPlannerDecision> DecideAsync(
        string module,
        string question,
        string? conversationId,
        string conversationContext,
        string? presentationMode,
        bool hasAttachment,
        bool isPdfAttachment,
        bool prefersStructuredAttachmentResponse,
        CancellationToken cancellationToken);
}

public sealed class GastosQueryPlanner : IGastosQueryPlanner
{
    private readonly IOpenAiChatProvider _openAiChatProvider;

    public GastosQueryPlanner(IOpenAiChatProvider openAiChatProvider)
    {
        _openAiChatProvider = openAiChatProvider;
    }

    public async Task<OpenAiPlannerDecision> DecideAsync(
        string module,
        string question,
        string? conversationId,
        string conversationContext,
        string? presentationMode,
        bool hasAttachment,
        bool isPdfAttachment,
        bool prefersStructuredAttachmentResponse,
        CancellationToken cancellationToken)
    {
        var systemPrompt = """
Eres un planificador de consultas para IA Chat Administrativo.
Devuelve exclusivamente JSON valido, sin markdown ni texto adicional.
Tu tarea es decidir si la consulta debe:
- usar buscar_planilla para detalle,
- o responder como conversation si es un seguimiento, una accion de presentacion o una consulta que no necesita SQL nuevo.

Reglas:
- No inventes filtros ni datos.
- No conviertas un nombre de persona en responsable o solicitante solo por detectarlo. Usa responsable o solicitante unicamente si el usuario lo indica de forma explicita.
- Si el usuario menciona nombres, clientes, proyectos, sites u otras palabras de negocio sin etiqueta explicita, mantenlos en textoBusqueda.
- Si el usuario escribe una etiqueta explicita como "responsable X", "solicitante Y", "cliente Z", "proyecto P", "site S" u "ot N", eso ya no es ambiguo: llena ese campo y usa route buscar_planilla.
- No respondas pidiendo confirmacion si la etiqueta del filtro ya fue escrita de forma explicita por el usuario.
- Frases como "separado por cliente y proyecto" o "agrupado por cliente y proyecto" son instrucciones de presentacion, no filtros adicionales.
- Si menciona cliente, proyecto, site, OT, estado o fechas, llena los campos adecuados.
- Si detectas mes y año, convierte a fechaInicio y fechaFin.
- Si detectas solo un anio, usa el anio completo.
- Si la consulta es un seguimiento como "mostrar ese resultado", "exportarlo", "en pdf", "cambiar formato" o "ver formato ejecutivo", no generes una nueva consulta SQL; usa route conversation.
- Devuelve un objeto con estas claves: route, responseType, answer, buscarArgs.
- route solo puede ser: buscar_planilla, conversation.
- responseType solo puede ser: detail, summary, chart, conversation.
- buscarArgs debe ser un objeto JSON cuando corresponda.
""";

        var userPrompt = BuildUserContext(
            question,
            conversationId,
            conversationContext,
            hasAttachment,
            presentationMode,
            isPdfAttachment,
            prefersStructuredAttachmentResponse);

        var rawResponse = await _openAiChatProvider.SendChatCompletionAsync(
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
            responseFormatJson: true);

        var candidate = ExtractJsonCandidate(rawResponse) ?? rawResponse;
        var decision = JsonSerializer.Deserialize<OpenAiPlannerDecision>(candidate, JsonOptions) ?? new OpenAiPlannerDecision();
        return NormalizeOpenAiPlannerDecision(decision, question);
    }

    private static string BuildUserContext(
        string question,
        string? conversationId,
        string conversationContext,
        bool hasAttachment,
        string? presentationMode,
        bool isPdfAttachment,
        bool prefersStructuredAttachmentResponse)
    {
        var attachmentInstruction = hasAttachment
            ? isPdfAttachment
                ? "La consulta incluye un PDF adjunto de referencia visual o documental. Extrae su estructura y responde de forma ejecutiva o de presentacion si la pregunta apunta a formato, estilo o rediseño."
                : "La consulta incluye una imagen adjunta de referencia visual. Usala para entender el estilo, la composicion y el formato deseado."
            : "No hay adjunto.";
        var presentationInstruction = NormalizeText(presentationMode)?.ToLowerInvariant() switch
        {
            "executive" => "Modo de presentacion solicitado: ejecutivo. Devuelve un cuadro compacto y claro, con top 5, KPI y resumen ejecutivo. Si el usuario pide detalle, puedes habilitarlo aparte.",
            "detail" => "Modo de presentacion solicitado: detalle. Prioriza el listado detallado y la trazabilidad de filtros.",
            _ => "Modo de presentacion solicitado: automatico."
        };
        var structuredInstruction = prefersStructuredAttachmentResponse
            ? "IMPORTANTE: devuelve exclusivamente JSON valido compatible con IaChatResponseDto. No uses markdown, no uses listas sueltas y prioriza responseType summary o chart con tablas compactas, KPI y top 5."
            : "La respuesta puede ser conversacional si no requiere estructura especial.";

        return $"""
Pregunta del usuario:
{question}

ConversationId:
{NormalizeText(conversationId) ?? "(sin conversationId)"}

Contexto de conversacion:
{conversationContext}

Instruccion de visualizacion:
- Si la pregunta modifica un grafico previo, toma como base el ultimo resultado estructurado.
- Si la pregunta solicita un grafico nuevo, elige el formato mas apropiado para la intencion del usuario y los datos reales.
- Si la pregunta es ambigua para cambiar un grafico, pide una aclaracion breve en lugar de inventar filtros.
- {presentationInstruction}
- {attachmentInstruction}
- {structuredInstruction}
""";
    }

    private static OpenAiPlannerDecision NormalizeOpenAiPlannerDecision(OpenAiPlannerDecision decision, string question)
    {
        decision.Route = NormalizePlannerValue(decision.Route);
        decision.ResponseType = NormalizePlannerValue(decision.ResponseType);
        decision.Answer = NormalizeText(decision.Answer);

        if (string.IsNullOrWhiteSpace(decision.Route))
        {
            decision.Route = QuestionLooksLikeConversation(question) ? "conversation" : "buscar_planilla";
        }

        if (decision.Route is not ("buscar_planilla" or "conversation"))
        {
            decision.Route = "buscar_planilla";
        }

        if (!QuestionLooksLikeConversation(question) &&
            HasExplicitStructuredFilters(question))
        {
            decision.Route = "buscar_planilla";
            if (string.IsNullOrWhiteSpace(decision.ResponseType) || decision.ResponseType == "conversation")
            {
                decision.ResponseType = "detail";
            }

            if (string.Equals(decision.Answer, "Consulta procesada correctamente.", StringComparison.OrdinalIgnoreCase))
            {
                decision.Answer = null;
            }
        }

        if (string.IsNullOrWhiteSpace(decision.ResponseType))
        {
            decision.ResponseType = decision.Route switch
            {
                "buscar_planilla" => "detail",
                _ => "conversation"
            };
        }

        return decision;
    }

    private static string? ExtractJsonCandidate(string text)
    {
        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');

        if (start < 0 || end <= start)
        {
            return null;
        }

        return text[start..(end + 1)];
    }

    /// <summary>Compartido con IaChatService.GenerateOpenAiFinalAnswerAsync (ver using static).</summary>
    internal static string? NormalizePlannerValue(string? value)
    {
        var normalized = NormalizeText(value);
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized.ToLowerInvariant();
    }

    /// <summary>Compartido con IaChatService (atajos conversacionales de seguimiento, ver using static).</summary>
    internal static bool HasExplicitStructuredFilters(string question)
    {
        return !string.IsNullOrWhiteSpace(ExtractResponsibleFilter(question)) ||
               !string.IsNullOrWhiteSpace(ExtractNamedFilter(question, "responsable")) ||
               !string.IsNullOrWhiteSpace(ExtractNamedFilter(question, "solicitante")) ||
               !string.IsNullOrWhiteSpace(ExtractNamedFilter(question, "cliente")) ||
               !string.IsNullOrWhiteSpace(ExtractNamedFilter(question, "proyecto")) ||
               !string.IsNullOrWhiteSpace(ExtractNamedFilter(question, "site")) ||
               !string.IsNullOrWhiteSpace(ExtractNamedFilter(question, "sitio")) ||
               !string.IsNullOrWhiteSpace(ExtractNamedFilter(question, "ot"));
    }

    /// <summary>Compartido con IaChatService.GenerateOpenAiFinalAnswerAsync (ver using static).</summary>
    internal static bool QuestionLooksLikeConversation(string question)
    {
        var normalized = question.ToLowerInvariant();
        return normalized.Contains("mostrar ese resultado", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("exportar", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("pdf", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("formato", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("reporte", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("volver", StringComparison.OrdinalIgnoreCase) ||
               normalized.Contains("continuar", StringComparison.OrdinalIgnoreCase);
    }
}

public sealed class OpenAiPlannerDecision
{
    public string? Route { get; set; }

    public string? ResponseType { get; set; }

    public string? Answer { get; set; }

    public JsonElement? BuscarArgs { get; set; }

    public JsonElement? ResumenArgs { get; set; }
}
