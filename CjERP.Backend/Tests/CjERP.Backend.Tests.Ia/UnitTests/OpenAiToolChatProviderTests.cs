using CjERP.Backend.Tests.Ia.TestSupport;
using CjERP.Infrastructure.Services;
using CjERP.Shared.Configuration;
using Microsoft.Extensions.Options;
using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// Tests de OpenAiToolChatProvider (CJ Intelligence, etapa 0). Ninguno llama a OpenAI: usan
/// FakeHttpMessageHandler y un delay instantaneo.
/// </summary>
[Trait("Category", "Unit")]
public sealed class OpenAiToolChatProviderTests
{
    private static OpenAiToolChatProvider CreateProvider(FakeHttpMessageHandler handler, List<TimeSpan>? delays = null, string model = "modelo-test")
    {
        var httpClient = new HttpClient(handler, disposeHandler: false);
        var settings = Options.Create(new OpenAiSettings { ApiKey = "sk-test", Model = model, MaxTokens = 800 });
        return new OpenAiToolChatProvider(httpClient, settings, (d, _) =>
        {
            delays?.Add(d);
            return Task.CompletedTask;
        });
    }

    private static OpenAiToolDefinition SampleTool() => new()
    {
        Name = "consultar_pagos",
        Description = "Consulta pagos.",
        Parameters = new JsonObject
        {
            ["type"] = "object",
            ["additionalProperties"] = false,
            ["properties"] = new JsonObject { ["mes"] = new JsonObject { ["type"] = "string" } },
            ["required"] = new JsonArray("mes")
        }
    };

    [Fact]
    public async Task Send_RespuestaConTexto_DevuelveContenidoTokensYMotivoDeFin()
    {
        var handler = new FakeHttpMessageHandler();
        handler.EnqueueJson("""
            {"model":"modelo-test-2026","choices":[{"finish_reason":"stop","message":{"role":"assistant","content":"  hola  "}}],
             "usage":{"prompt_tokens":120,"completion_tokens":15}}
            """);
        var provider = CreateProvider(handler);

        var result = await provider.SendAsync([OpenAiToolChatMessage.User("hola")], [], CancellationToken.None);

        Assert.Equal("hola", result.Content);
        Assert.Empty(result.ToolCalls);
        Assert.Equal("stop", result.FinishReason);
        Assert.Equal(120, result.PromptTokens);
        Assert.Equal(15, result.CompletionTokens);
        Assert.Equal("modelo-test-2026", result.Model);
        Assert.Equal(1, result.Attempts);
    }

    [Fact]
    public async Task Send_RespuestaConToolCalls_NoExigeTextoYConservaArgumentosSinValidar()
    {
        var handler = new FakeHttpMessageHandler();
        handler.EnqueueJson("""
            {"choices":[{"finish_reason":"tool_calls","message":{"role":"assistant","content":null,
              "tool_calls":[{"id":"call_1","type":"function","function":{"name":"consultar_pagos","arguments":"{\"mes\":\"2026-10\"}"}}]}}]}
            """);
        var provider = CreateProvider(handler);

        var result = await provider.SendAsync([OpenAiToolChatMessage.User("pagos")], [SampleTool()], CancellationToken.None);

        var call = Assert.Single(result.ToolCalls);
        Assert.Equal("call_1", call.Id);
        Assert.Equal("consultar_pagos", call.Name);
        Assert.Equal("{\"mes\":\"2026-10\"}", call.ArgumentsJson);
        Assert.Equal("tool_calls", result.FinishReason);
        Assert.Null(result.Content);
        Assert.Null(result.PromptTokens);
    }

    [Fact]
    public async Task Send_ArmaCuerpoConHerramientasMensajesToolYSinTemperature()
    {
        var handler = new FakeHttpMessageHandler();
        handler.EnqueueJson("""{"choices":[{"finish_reason":"stop","message":{"content":"ok"}}]}""");
        var provider = CreateProvider(handler);
        var tool = SampleTool();
        var calls = new[] { new OpenAiToolCall { Id = "call_1", Name = "consultar_pagos", ArgumentsJson = "{\"mes\":\"2026-10\"}" } };

        await provider.SendAsync(
            [
                OpenAiToolChatMessage.System("sistema"),
                OpenAiToolChatMessage.User("pagos"),
                OpenAiToolChatMessage.AssistantWithCalls(null, calls),
                OpenAiToolChatMessage.Tool("call_1", "{\"filas\":3}")
            ],
            [tool, tool],
            CancellationToken.None);

        using var doc = JsonDocument.Parse(handler.RequestBodies[0]);
        var root = doc.RootElement;
        Assert.Equal("modelo-test", root.GetProperty("model").GetString());
        Assert.Equal(800, root.GetProperty("max_completion_tokens").GetInt32());
        Assert.False(root.TryGetProperty("temperature", out _));
        Assert.Equal(2, root.GetProperty("tools").GetArrayLength());
        Assert.True(root.GetProperty("tools")[0].GetProperty("function").GetProperty("strict").GetBoolean());

        var messages = root.GetProperty("messages");
        Assert.Equal("assistant", messages[2].GetProperty("role").GetString());
        Assert.Equal("call_1", messages[2].GetProperty("tool_calls")[0].GetProperty("id").GetString());
        Assert.Equal("tool", messages[3].GetProperty("role").GetString());
        Assert.Equal("call_1", messages[3].GetProperty("tool_call_id").GetString());
    }

    [Fact]
    public async Task Send_SinHerramientas_NoIncluyeCampoTools()
    {
        var handler = new FakeHttpMessageHandler();
        handler.EnqueueJson("""{"choices":[{"message":{"content":"ok"}}]}""");
        var provider = CreateProvider(handler);

        await provider.SendAsync([OpenAiToolChatMessage.User("hola")], [], CancellationToken.None);

        Assert.DoesNotContain("\"tools\"", handler.RequestBodies[0]);
    }

    [Fact]
    public async Task Send_429Transitorio_ReintentaYTerminaConExito()
    {
        var handler = new FakeHttpMessageHandler();
        handler.EnqueueStatus(HttpStatusCode.TooManyRequests, "rate");
        handler.EnqueueStatus(HttpStatusCode.ServiceUnavailable, "down");
        handler.EnqueueJson("""{"choices":[{"message":{"content":"ok"}}]}""");
        var delays = new List<TimeSpan>();
        var provider = CreateProvider(handler, delays);

        var result = await provider.SendAsync([OpenAiToolChatMessage.User("hola")], [], CancellationToken.None);

        Assert.Equal(3, handler.CallCount);
        Assert.Equal(3, result.Attempts);
        Assert.Equal(2, delays.Count);
    }

    [Fact]
    public async Task Send_ErrorPersistente_LanzaTrasMaximoDeIntentos()
    {
        var handler = new FakeHttpMessageHandler();
        for (var i = 0; i < OpenAiToolChatProvider.MaxAttempts; i++)
        {
            handler.EnqueueStatus(HttpStatusCode.BadGateway, "bad");
        }

        var provider = CreateProvider(handler);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            provider.SendAsync([OpenAiToolChatMessage.User("hola")], [], CancellationToken.None));

        Assert.Contains("error 502", ex.Message);
        Assert.Equal(OpenAiToolChatProvider.MaxAttempts, handler.CallCount);
    }

    [Fact]
    public async Task Send_ErrorNoTransitorio_NoReintenta()
    {
        var handler = new FakeHttpMessageHandler();
        handler.EnqueueStatus(HttpStatusCode.BadRequest, "invalid");
        var provider = CreateProvider(handler);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            provider.SendAsync([OpenAiToolChatMessage.User("hola")], [], CancellationToken.None));

        Assert.Equal(1, handler.CallCount);
    }

    [Fact]
    public async Task Send_SinTextoNiToolCalls_Lanza()
    {
        var handler = new FakeHttpMessageHandler();
        handler.EnqueueJson("""{"choices":[{"message":{"content":null}}]}""");
        var provider = CreateProvider(handler);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            provider.SendAsync([OpenAiToolChatMessage.User("hola")], [], CancellationToken.None));

        Assert.Contains("no devolvio contenido util", ex.Message);
    }

    [Fact]
    public void HasConfiguration_SinClaveOSinModelo_DevuelveFalse()
    {
        var sinClave = new OpenAiToolChatProvider(
            new HttpClient(new FakeHttpMessageHandler()),
            Options.Create(new OpenAiSettings { ApiKey = "", Model = "m" }));
        var sinModelo = new OpenAiToolChatProvider(
            new HttpClient(new FakeHttpMessageHandler()),
            Options.Create(new OpenAiSettings { ApiKey = "k", Model = "" }));

        Assert.False(sinClave.HasConfiguration(out var e1));
        Assert.Contains("clave privada", e1);
        Assert.False(sinModelo.HasConfiguration(out var e2));
        Assert.Contains("modelo", e2);
    }
}
