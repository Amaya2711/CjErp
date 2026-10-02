// Extraido de IaChatService.cs en Fase 1.2 (docs/AI_COPILOT_IMPLEMENTATION_PLAN.md).
// Codigo movido tal cual (comunicacion HTTP con OpenAI): no se cambio ningun comportamiento,
// solo la ubicacion. IaChatService.cs ya no conoce el endpoint, los headers ni el formato
// de request/response de OpenAI: eso ahora vive exclusivamente aqui.
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using CjERP.Shared.Configuration;
using Microsoft.Extensions.Options;

namespace CjERP.Infrastructure.Services;

using static CjERP.Infrastructure.Services.IaChatSharedDefaults;
using static CjERP.Infrastructure.Services.IaTextUtils;

/// <summary>
/// Comunicacion HTTP pura con la API de OpenAI (chat completions). No decide que preguntar,
/// que tool usar ni que datos enviar: eso es responsabilidad del planner/coordinador que lo
/// consume (ver <see cref="GastosQueryPlanner"/> e <see cref="IaChatService.GenerateOpenAiFinalAnswerAsync"/>).
/// </summary>
public interface IOpenAiChatProvider
{
    bool HasConfiguration(out string errorMessage);

    Task<string> SendChatCompletionAsync(
        List<OpenAiChatMessage> messages,
        CancellationToken cancellationToken,
        bool responseFormatJson);
}

public sealed class OpenAiChatProvider : IOpenAiChatProvider
{
    private readonly HttpClient _httpClient;
    private readonly OpenAiSettings _openAiSettings;

    public OpenAiChatProvider(HttpClient httpClient, IOptions<OpenAiSettings> openAiSettings)
    {
        _httpClient = httpClient;
        _openAiSettings = openAiSettings.Value;
    }

    public bool HasConfiguration(out string errorMessage)
    {
        if (string.IsNullOrWhiteSpace(_openAiSettings.ApiKey))
        {
            errorMessage = "Falta configurar la clave privada de OpenAI.";
            return false;
        }

        if (string.IsNullOrWhiteSpace(_openAiSettings.Model))
        {
            errorMessage = "Falta configurar el modelo de OpenAI.";
            return false;
        }

        errorMessage = string.Empty;
        return true;
    }

    public async Task<string> SendChatCompletionAsync(
        List<OpenAiChatMessage> messages,
        CancellationToken cancellationToken,
        bool responseFormatJson)
    {
        var requestPayload = new OpenAiChatCompletionRequest
        {
            Model = _openAiSettings.Model.Trim(),
            MaxCompletionTokens = _openAiSettings.MaxTokens > 0 ? _openAiSettings.MaxTokens : 1500,
            Temperature = 0,
            Messages = messages,
            ResponseFormat = responseFormatJson ? new OpenAiResponseFormat { Type = "json_object" } : null
        };

        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/chat/completions");
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _openAiSettings.ApiKey.Trim());
        httpRequest.Content = new StringContent(
            JsonSerializer.Serialize(requestPayload, JsonOptions),
            Encoding.UTF8,
            "application/json");

        using var response = await _httpClient.SendAsync(httpRequest, cancellationToken);
        var payload = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"OpenAI devolvio un error {(int)response.StatusCode}: {Truncate(payload, 500)}");
        }

        var openAiResponse = JsonSerializer.Deserialize<OpenAiChatCompletionResponse>(payload, JsonOptions);
        var content = openAiResponse?.Choices.FirstOrDefault()?.Message?.Content;

        if (string.IsNullOrWhiteSpace(content))
        {
            throw new InvalidOperationException("OpenAI no devolvio contenido util.");
        }

        return content.Trim();
    }
}

public sealed class OpenAiChatCompletionRequest
{
    public string Model { get; set; } = string.Empty;

    public List<OpenAiChatMessage> Messages { get; set; } = [];

    [JsonPropertyName("max_completion_tokens")]
    public int? MaxCompletionTokens { get; set; }

    public decimal? Temperature { get; set; }

    [JsonPropertyName("response_format")]
    public OpenAiResponseFormat? ResponseFormat { get; set; }
}

public sealed class OpenAiChatCompletionResponse
{
    public List<OpenAiChoice> Choices { get; set; } = [];
}

public sealed class OpenAiChoice
{
    public OpenAiChatMessage? Message { get; set; }
}

public sealed class OpenAiChatMessage
{
    public string Role { get; set; } = string.Empty;

    public string? Content { get; set; }
}

public sealed class OpenAiResponseFormat
{
    public string Type { get; set; } = "json_object";
}
