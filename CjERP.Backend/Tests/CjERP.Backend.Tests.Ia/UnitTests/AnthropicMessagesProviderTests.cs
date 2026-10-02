using CjERP.Backend.Tests.Ia.TestSupport;
using CjERP.Infrastructure.Services;
using CjERP.Shared.Configuration;
using Microsoft.Extensions.Options;
using System.Net;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// Tests directos de AnthropicMessagesProvider (Fase 1.2), extraido de IaChatService.cs. Ninguno de
/// estos tests hace una llamada real a Anthropic: todos usan FakeHttpMessageHandler.
/// </summary>
[Trait("Category", "Unit")]
public sealed class AnthropicMessagesProviderTests
{
    private static AnthropicMessagesProvider CreateProvider(FakeHttpMessageHandler handler, string apiKey = "test-key", string model = "claude-test")
    {
        var httpClient = new HttpClient(handler, disposeHandler: false);
        var settings = Options.Create(new AnthropicSettings { ApiKey = apiKey, Model = model, MaxTokens = 1500 });
        return new AnthropicMessagesProvider(httpClient, settings);
    }

    private static List<AnthropicMessageRequest> SimpleUserMessage(string text) =>
    [
        new()
        {
            Role = "user",
            Content = [new AnthropicContentBlock { Type = "text", Text = text }]
        }
    ];

    [Fact]
    public void HasConfiguration_SinApiKey_DevuelveFalse()
    {
        var provider = CreateProvider(new FakeHttpMessageHandler(), apiKey: "");

        Assert.False(provider.HasConfiguration(out var error));
        Assert.Contains("clave privada de la IA", error);
    }

    [Fact]
    public void HasConfiguration_SinModelo_DevuelveFalse()
    {
        var provider = CreateProvider(new FakeHttpMessageHandler(), model: "");

        Assert.False(provider.HasConfiguration(out var error));
        Assert.Contains("modelo de la IA", error);
    }

    [Fact]
    public async Task SendMessageAsync_EnviaTools_TalCualLasRecibe()
    {
        var handler = new FakeHttpMessageHandler();
        handler.EnqueueJson("""{"content":[{"type":"text","text":"hola"}]}""");
        var provider = CreateProvider(handler);

        await provider.SendMessageAsync("system prompt", SimpleUserMessage("hola"), tools: [], CancellationToken.None);

        Assert.Equal(1, handler.CallCount);
        Assert.Contains("\"tools\":[]", handler.RequestBodies[0]);
    }

    [Fact]
    public async Task SendMessageAsync_ConRespuestaValida_DevuelveContentBlocks()
    {
        var handler = new FakeHttpMessageHandler();
        handler.EnqueueJson("""{"content":[{"type":"text","text":"respuesta de claude"}]}""");
        var provider = CreateProvider(handler);

        var response = await provider.SendMessageAsync("system prompt", SimpleUserMessage("hola"), tools: [], CancellationToken.None);

        Assert.Single(response.Content);
        Assert.Equal("respuesta de claude", response.Content[0].Text);
    }

    [Fact]
    public async Task SendMessageAsync_RespuestaHttpNoExitosa_LanzaInvalidOperationException()
    {
        var handler = new FakeHttpMessageHandler();
        handler.EnqueueStatus(HttpStatusCode.TooManyRequests, "rate limited");
        var provider = CreateProvider(handler);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            provider.SendMessageAsync("system prompt", SimpleUserMessage("hola"), tools: [], CancellationToken.None));

        Assert.Contains("Anthropic devolvio un error 429", ex.Message);
    }

    [Fact]
    public async Task SendMessageAsync_JsonInvalido_LanzaExcepcionDeParseo()
    {
        var handler = new FakeHttpMessageHandler();
        handler.EnqueueJson("esto no es JSON valido");
        var provider = CreateProvider(handler);

        await Assert.ThrowsAnyAsync<Exception>(() =>
            provider.SendMessageAsync("system prompt", SimpleUserMessage("hola"), tools: [], CancellationToken.None));
    }

    [Fact]
    public void ExtractAssistantText_UneBloquesDeTextoConSaltoDeLinea()
    {
        List<AnthropicContentBlock> content =
        [
            new() { Type = "text", Text = "primera parte" },
            new() { Type = "tool_use", Text = "ignorado" },
            new() { Type = "text", Text = "segunda parte" }
        ];

        var text = AnthropicMessagesProvider.ExtractAssistantText(content);

        Assert.Equal($"primera parte{Environment.NewLine}segunda parte", text);
    }
}
