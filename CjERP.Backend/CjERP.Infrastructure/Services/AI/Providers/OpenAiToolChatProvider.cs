// CJ Intelligence (etapa 0): proveedor OpenAI con function calling, independiente de
// OpenAiChatProvider (que sigue sirviendo sin cambios al chat anterior). Diferencias:
// - Devuelve un resultado tipado (texto, llamadas a herramienta, motivo de fin, tokens, latencia)
//   en lugar de solo el texto.
// - Admite mensajes con tool_calls y mensajes de rol "tool".
// - No fija Temperature (algunos modelos de razonamiento lo rechazan); el modelo sale de OpenAiSettings.
// - Reintenta un numero limitado de veces solo ante 429 y 5xx transitorios.
// No esta registrado en DI todavia: se conectara cuando exista el bucle de herramientas.
using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using CjERP.Shared.Configuration;
using Microsoft.Extensions.Options;

namespace CjERP.Infrastructure.Services;

public sealed class OpenAiToolDefinition
{
    public string Name { get; init; } = string.Empty;

    public string Description { get; init; } = string.Empty;

    /// <summary>JSON Schema de los argumentos (type=object).</summary>
    public JsonObject Parameters { get; init; } = new();

    public bool Strict { get; init; } = true;
}

public sealed class OpenAiToolCall
{
    public string Id { get; init; } = string.Empty;

    public string Name { get; init; } = string.Empty;

    /// <summary>Argumentos tal como los devolvio el modelo: texto JSON SIN validar.</summary>
    public string ArgumentsJson { get; init; } = "{}";
}

public sealed class OpenAiToolChatMessage
{
    public string Role { get; init; } = string.Empty;

    public string? Content { get; init; }

    /// <summary>Solo para role = assistant cuando el modelo pidio herramientas.</summary>
    public IReadOnlyList<OpenAiToolCall>? ToolCalls { get; init; }

    /// <summary>Solo para role = tool: id de la llamada que responde.</summary>
    public string? ToolCallId { get; init; }

    public static OpenAiToolChatMessage System(string content) => new() { Role = "system", Content = content };

    public static OpenAiToolChatMessage User(string content) => new() { Role = "user", Content = content };

    public static OpenAiToolChatMessage Tool(string toolCallId, string content) =>
        new() { Role = "tool", ToolCallId = toolCallId, Content = content };

    public static OpenAiToolChatMessage AssistantWithCalls(string? content, IReadOnlyList<OpenAiToolCall> calls) =>
        new() { Role = "assistant", Content = content, ToolCalls = calls };
}

public sealed class OpenAiToolChatResult
{
    public string? Content { get; init; }

    public IReadOnlyList<OpenAiToolCall> ToolCalls { get; init; } = [];

    /// <summary>stop, tool_calls, length, content_filter, etc. (valor de OpenAI).</summary>
    public string? FinishReason { get; init; }

    public int? PromptTokens { get; init; }

    public int? CompletionTokens { get; init; }

    /// <summary>Modelo realmente usado segun OpenAI (puede incluir sufijo de version).</summary>
    public string? Model { get; init; }

    /// <summary>Tiempo total en OpenAI de esta llamada, incluidos reintentos.</summary>
    public long LatencyMs { get; init; }

    public int Attempts { get; init; } = 1;
}

public interface IOpenAiToolChatProvider
{
    bool HasConfiguration(out string errorMessage);

    Task<OpenAiToolChatResult> SendAsync(
        IReadOnlyList<OpenAiToolChatMessage> messages,
        IReadOnlyList<OpenAiToolDefinition> tools,
        CancellationToken cancellationToken);
}

public sealed class OpenAiToolChatProvider : IOpenAiToolChatProvider
{
    internal const int MaxAttempts = 3;

    private readonly HttpClient _httpClient;
    private readonly OpenAiSettings _settings;
    private readonly Func<TimeSpan, CancellationToken, Task> _delay;

    public OpenAiToolChatProvider(HttpClient httpClient, IOptions<OpenAiSettings> settings)
        : this(httpClient, settings, Task.Delay)
    {
    }

    internal OpenAiToolChatProvider(
        HttpClient httpClient,
        IOptions<OpenAiSettings> settings,
        Func<TimeSpan, CancellationToken, Task> delay)
    {
        _httpClient = httpClient;
        _settings = settings.Value;
        _delay = delay;
    }

    public bool HasConfiguration(out string errorMessage)
    {
        if (string.IsNullOrWhiteSpace(_settings.ApiKey))
        {
            errorMessage = "Falta configurar la clave privada de OpenAI.";
            return false;
        }

        if (string.IsNullOrWhiteSpace(_settings.Model))
        {
            errorMessage = "Falta configurar el modelo de OpenAI.";
            return false;
        }

        errorMessage = string.Empty;
        return true;
    }

    public async Task<OpenAiToolChatResult> SendAsync(
        IReadOnlyList<OpenAiToolChatMessage> messages,
        IReadOnlyList<OpenAiToolDefinition> tools,
        CancellationToken cancellationToken)
    {
        var body = BuildRequestBody(messages, tools);
        var stopwatch = Stopwatch.StartNew();

        for (var attempt = 1; ; attempt++)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/chat/completions");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _settings.ApiKey.Trim());
            request.Content = new StringContent(body, Encoding.UTF8, "application/json");

            using var response = await _httpClient.SendAsync(request, cancellationToken);
            var payload = await response.Content.ReadAsStringAsync(cancellationToken);

            if (response.IsSuccessStatusCode)
            {
                return ParseResponse(payload, stopwatch.ElapsedMilliseconds, attempt);
            }

            if (attempt < MaxAttempts && IsTransient(response.StatusCode))
            {
                await _delay(ComputeDelay(response, attempt), cancellationToken);
                continue;
            }

            // El cuerpo de error de OpenAI no incluye la clave, pero se recorta por prolijidad y tamano de log.
            throw new InvalidOperationException(
                $"OpenAI devolvio un error {(int)response.StatusCode}: {(payload.Length > 500 ? payload[..500] : payload)}");
        }
    }

    internal string BuildRequestBody(
        IReadOnlyList<OpenAiToolChatMessage> messages,
        IReadOnlyList<OpenAiToolDefinition> tools)
    {
        var root = new JsonObject
        {
            ["model"] = _settings.Model.Trim(),
            ["max_completion_tokens"] = _settings.MaxTokens > 0 ? _settings.MaxTokens : 1500
        };

        var jsonMessages = new JsonArray();
        foreach (var message in messages)
        {
            var node = new JsonObject { ["role"] = message.Role };
            if (message.Content is not null)
            {
                node["content"] = message.Content;
            }

            if (message.ToolCalls is { Count: > 0 })
            {
                var calls = new JsonArray();
                foreach (var call in message.ToolCalls)
                {
                    calls.Add(new JsonObject
                    {
                        ["id"] = call.Id,
                        ["type"] = "function",
                        ["function"] = new JsonObject { ["name"] = call.Name, ["arguments"] = call.ArgumentsJson }
                    });
                }

                node["tool_calls"] = calls;
            }

            if (!string.IsNullOrEmpty(message.ToolCallId))
            {
                node["tool_call_id"] = message.ToolCallId;
            }

            jsonMessages.Add(node);
        }

        root["messages"] = jsonMessages;

        if (tools.Count > 0)
        {
            var jsonTools = new JsonArray();
            foreach (var tool in tools)
            {
                jsonTools.Add(new JsonObject
                {
                    ["type"] = "function",
                    ["function"] = new JsonObject
                    {
                        ["name"] = tool.Name,
                        ["description"] = tool.Description,
                        ["strict"] = tool.Strict,
                        // JsonNode ya tiene padre si se reutiliza: se clona para no mutar la definicion.
                        ["parameters"] = tool.Parameters.DeepClone()
                    }
                });
            }

            root["tools"] = jsonTools;
        }

        return root.ToJsonString();
    }

    internal static OpenAiToolChatResult ParseResponse(string payload, long latencyMs, int attempts)
    {
        using var document = JsonDocument.Parse(payload);
        var root = document.RootElement;

        if (!root.TryGetProperty("choices", out var choices)
            || choices.ValueKind != JsonValueKind.Array
            || choices.GetArrayLength() == 0)
        {
            throw new InvalidOperationException("OpenAI no devolvio contenido util.");
        }

        var choice = choices[0];
        var message = choice.GetProperty("message");

        string? content = message.TryGetProperty("content", out var contentNode) && contentNode.ValueKind == JsonValueKind.String
            ? contentNode.GetString()?.Trim()
            : null;

        var calls = new List<OpenAiToolCall>();
        if (message.TryGetProperty("tool_calls", out var toolCalls) && toolCalls.ValueKind == JsonValueKind.Array)
        {
            foreach (var call in toolCalls.EnumerateArray())
            {
                var function = call.GetProperty("function");
                calls.Add(new OpenAiToolCall
                {
                    Id = call.GetProperty("id").GetString() ?? string.Empty,
                    Name = function.GetProperty("name").GetString() ?? string.Empty,
                    ArgumentsJson = function.TryGetProperty("arguments", out var args) ? args.GetString() ?? "{}" : "{}"
                });
            }
        }

        if (string.IsNullOrWhiteSpace(content) && calls.Count == 0)
        {
            throw new InvalidOperationException("OpenAI no devolvio contenido util.");
        }

        int? promptTokens = null;
        int? completionTokens = null;
        if (root.TryGetProperty("usage", out var usage) && usage.ValueKind == JsonValueKind.Object)
        {
            promptTokens = usage.TryGetProperty("prompt_tokens", out var p) && p.TryGetInt32(out var pv) ? pv : null;
            completionTokens = usage.TryGetProperty("completion_tokens", out var c) && c.TryGetInt32(out var cv) ? cv : null;
        }

        return new OpenAiToolChatResult
        {
            Content = content,
            ToolCalls = calls,
            FinishReason = choice.TryGetProperty("finish_reason", out var finish) && finish.ValueKind == JsonValueKind.String
                ? finish.GetString()
                : null,
            PromptTokens = promptTokens,
            CompletionTokens = completionTokens,
            Model = root.TryGetProperty("model", out var model) && model.ValueKind == JsonValueKind.String ? model.GetString() : null,
            LatencyMs = latencyMs,
            Attempts = attempts
        };
    }

    private static bool IsTransient(HttpStatusCode status) =>
        status == HttpStatusCode.TooManyRequests || (int)status is 500 or 502 or 503 or 504;

    private static TimeSpan ComputeDelay(HttpResponseMessage response, int attempt)
    {
        if (response.Headers.RetryAfter?.Delta is { } delta && delta > TimeSpan.Zero)
        {
            return delta > TimeSpan.FromSeconds(10) ? TimeSpan.FromSeconds(10) : delta;
        }

        return TimeSpan.FromMilliseconds(500 * Math.Pow(2, attempt - 1));
    }
}
