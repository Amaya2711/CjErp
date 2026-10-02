// Extraido de IaChatService.cs en Fase 1.2 (docs/AI_COPILOT_IMPLEMENTATION_PLAN.md).
// Codigo movido tal cual (comunicacion HTTP con Anthropic): no se cambio ningun comportamiento,
// solo la ubicacion. Unico cambio de firma: SendMessageAsync recibia un flag "includeTools" y
// resolvia internamente GetToolsForModule(ModuleGastos) (logica de dominio GASTOS, ver
// IaChatService.cs). Como el unico llamador real de este metodo (GenerarDashboardReporteAsync)
// siempre pasaba includeTools: false, ese branch nunca se ejecutaba en produccion. Para que este
// Provider sea generico (no conozca "buscar_planilla" ni el modulo GASTOS), ahora recibe la
// lista de tools ya resuelta por el llamador. El comportamiento real (unico camino vivo) es
// identico: se sigue enviando Tools = [] en el unico caso que hoy se ejecuta.
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using CjERP.Shared.Configuration;
using Microsoft.Extensions.Options;

namespace CjERP.Infrastructure.Services;

using static CjERP.Infrastructure.Services.IaChatSharedDefaults;
using static CjERP.Infrastructure.Services.IaTextUtils;

/// <summary>
/// Comunicacion HTTP pura con la API de Anthropic (messages). No decide el prompt de negocio,
/// el modulo ni las tools a exponer: quien lo consume (hoy, IaChatService.GenerarDashboardReporteAsync)
/// decide que enviar.
/// </summary>
public interface IAnthropicMessagesProvider
{
    bool HasConfiguration(out string errorMessage);

    Task<AnthropicMessagesResponse> SendMessageAsync(
        string systemPrompt,
        List<AnthropicMessageRequest> messages,
        List<AnthropicToolDefinition> tools,
        CancellationToken cancellationToken);
}

public sealed class AnthropicMessagesProvider : IAnthropicMessagesProvider
{
    private readonly HttpClient _httpClient;
    private readonly AnthropicSettings _anthropicSettings;

    public AnthropicMessagesProvider(HttpClient httpClient, IOptions<AnthropicSettings> anthropicSettings)
    {
        _httpClient = httpClient;
        _anthropicSettings = anthropicSettings.Value;
    }

    public bool HasConfiguration(out string errorMessage)
    {
        if (string.IsNullOrWhiteSpace(_anthropicSettings.ApiKey))
        {
            errorMessage = "Falta configurar la clave privada de la IA.";
            return false;
        }

        if (string.IsNullOrWhiteSpace(_anthropicSettings.Model))
        {
            errorMessage = "Falta configurar el modelo de la IA.";
            return false;
        }

        errorMessage = string.Empty;
        return true;
    }

    public async Task<AnthropicMessagesResponse> SendMessageAsync(
        string systemPrompt,
        List<AnthropicMessageRequest> messages,
        List<AnthropicToolDefinition> tools,
        CancellationToken cancellationToken)
    {
        var requestPayload = new AnthropicMessagesRequest
        {
            Model = _anthropicSettings.Model.Trim(),
            MaxTokens = _anthropicSettings.MaxTokens > 0 ? _anthropicSettings.MaxTokens : 1500,
            Temperature = 0,
            System = systemPrompt,
            Messages = messages,
            Tools = tools
        };

        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages");
        httpRequest.Headers.Add("x-api-key", _anthropicSettings.ApiKey.Trim());
        httpRequest.Headers.Add("anthropic-version", "2023-06-01");
        httpRequest.Content = new StringContent(
            JsonSerializer.Serialize(requestPayload, JsonOptions),
            Encoding.UTF8,
            "application/json");

        using var response = await _httpClient.SendAsync(httpRequest, cancellationToken);
        var payload = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Anthropic devolvio un error {(int)response.StatusCode}: {Truncate(payload, 500)}");
        }

        var anthropicResponse = JsonSerializer.Deserialize<AnthropicMessagesResponse>(payload, JsonOptions);
        if (anthropicResponse is null)
        {
            throw new InvalidOperationException("No se pudo interpretar la respuesta de Anthropic.");
        }

        return anthropicResponse;
    }

    /// <summary>Extrae el texto plano de los bloques de contenido devueltos por Anthropic.</summary>
    internal static string ExtractAssistantText(IEnumerable<AnthropicContentBlock> content)
    {
        var textBlocks = content
            .Where(block => string.Equals(block.Type, "text", StringComparison.OrdinalIgnoreCase))
            .Select(block => block.Text?.Trim())
            .Where(text => !string.IsNullOrWhiteSpace(text))
            .ToList();

        return string.Join(Environment.NewLine, textBlocks);
    }
}

public sealed class AnthropicMessagesRequest
{
    public string Model { get; set; } = string.Empty;

    [JsonPropertyName("max_tokens")]
    public int MaxTokens { get; set; }

    [JsonPropertyName("temperature")]
    public double? Temperature { get; set; }

    public string System { get; set; } = string.Empty;

    public List<AnthropicMessageRequest> Messages { get; set; } = [];

    public List<AnthropicToolDefinition> Tools { get; set; } = [];
}

public sealed class AnthropicMessagesResponse
{
    [JsonPropertyName("content")]
    public List<AnthropicContentBlock> Content { get; set; } = [];
}

public sealed class AnthropicMessageRequest
{
    public string Role { get; set; } = string.Empty;

    public List<AnthropicContentBlock> Content { get; set; } = [];
}

public sealed class AnthropicContentBlock
{
    public string Type { get; set; } = string.Empty;

    public string? Text { get; set; }

    public string? Id { get; set; }

    public string? Name { get; set; }

    public JsonElement? Input { get; set; }

    [JsonPropertyName("tool_use_id")]
    public string? ToolUseId { get; set; }

    public AnthropicMediaSource? Source { get; set; }

    public object? Content { get; set; }

    [JsonPropertyName("is_error")]
    public bool? IsError { get; set; }
}

public sealed class AnthropicMediaSource
{
    public string Type { get; set; } = "base64";

    [JsonPropertyName("media_type")]
    public string MediaType { get; set; } = string.Empty;

    public string Data { get; set; } = string.Empty;
}

public sealed class AnthropicToolDefinition
{
    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public bool Strict { get; set; } = true;

    [JsonPropertyName("input_schema")]
    public Dictionary<string, object?> InputSchema { get; set; } = [];
}
