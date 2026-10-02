using CjERP.Backend.Tests.Ia.TestSupport;
using CjERP.Infrastructure.Services;
using CjERP.Shared.Configuration;
using Microsoft.Extensions.Options;
using System.Net;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// Tests directos de OpenAiChatProvider (Fase 1.2), extraido de IaChatService.cs. Ninguno de estos
/// tests hace una llamada real a OpenAI: todos usan FakeHttpMessageHandler.
/// </summary>
[Trait("Category", "Unit")]
public sealed class OpenAiChatProviderTests
{
    private static OpenAiChatProvider CreateProvider(FakeHttpMessageHandler handler, string apiKey = "test-key", string model = "gpt-4.1-mini-test")
    {
        var httpClient = new HttpClient(handler, disposeHandler: false);
        var settings = Options.Create(new OpenAiSettings { ApiKey = apiKey, Model = model, MaxTokens = 1500 });
        return new OpenAiChatProvider(httpClient, settings);
    }

    [Fact]
    public void HasConfiguration_SinApiKey_DevuelveFalse()
    {
        var provider = CreateProvider(new FakeHttpMessageHandler(), apiKey: "");

        Assert.False(provider.HasConfiguration(out var error));
        Assert.Contains("clave privada de OpenAI", error);
    }

    [Fact]
    public void HasConfiguration_SinModelo_DevuelveFalse()
    {
        var provider = CreateProvider(new FakeHttpMessageHandler(), model: "");

        Assert.False(provider.HasConfiguration(out var error));
        Assert.Contains("modelo de OpenAI", error);
    }

    [Fact]
    public void HasConfiguration_ConApiKeyYModelo_DevuelveTrue()
    {
        var provider = CreateProvider(new FakeHttpMessageHandler());

        Assert.True(provider.HasConfiguration(out var error));
        Assert.Empty(error);
    }

    [Fact]
    public async Task SendChatCompletionAsync_EnviaEndpointYHeaderDeAutorizacionCorrectos()
    {
        var handler = new FakeHttpMessageHandler();
        handler.EnqueueJson("""{"choices":[{"message":{"role":"assistant","content":"hola"}}]}""");
        var provider = CreateProvider(handler, apiKey: "sk-test-123");

        await provider.SendChatCompletionAsync(
            [new OpenAiChatMessage { Role = "user", Content = "hola" }],
            CancellationToken.None,
            responseFormatJson: false);

        Assert.Equal(1, handler.CallCount);
        Assert.Single(handler.RequestBodies);
        Assert.Contains("\"model\":\"gpt-4.1-mini-test\"", handler.RequestBodies[0]);
    }

    [Fact]
    public async Task SendChatCompletionAsync_ConRespuestaValida_DevuelveContenidoRecortado()
    {
        var handler = new FakeHttpMessageHandler();
        handler.EnqueueJson("""{"choices":[{"message":{"role":"assistant","content":"  respuesta util  "}}]}""");
        var provider = CreateProvider(handler);

        var content = await provider.SendChatCompletionAsync(
            [new OpenAiChatMessage { Role = "user", Content = "hola" }],
            CancellationToken.None,
            responseFormatJson: false);

        Assert.Equal("respuesta util", content);
    }

    [Fact]
    public async Task SendChatCompletionAsync_RespuestaHttpNoExitosa_LanzaInvalidOperationException()
    {
        var handler = new FakeHttpMessageHandler();
        handler.EnqueueStatus(HttpStatusCode.InternalServerError, "boom");
        var provider = CreateProvider(handler);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() => provider.SendChatCompletionAsync(
            [new OpenAiChatMessage { Role = "user", Content = "hola" }],
            CancellationToken.None,
            responseFormatJson: false));

        Assert.Contains("OpenAI devolvio un error 500", ex.Message);
    }

    [Fact]
    public async Task SendChatCompletionAsync_JsonInvalido_LanzaExcepcionDeParseo()
    {
        var handler = new FakeHttpMessageHandler();
        handler.EnqueueJson("esto no es JSON valido");
        var provider = CreateProvider(handler);

        await Assert.ThrowsAnyAsync<Exception>(() => provider.SendChatCompletionAsync(
            [new OpenAiChatMessage { Role = "user", Content = "hola" }],
            CancellationToken.None,
            responseFormatJson: false));
    }

    [Fact]
    public async Task SendChatCompletionAsync_SinContenidoUtil_LanzaInvalidOperationException()
    {
        var handler = new FakeHttpMessageHandler();
        handler.EnqueueJson("""{"choices":[]}""");
        var provider = CreateProvider(handler);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() => provider.SendChatCompletionAsync(
            [new OpenAiChatMessage { Role = "user", Content = "hola" }],
            CancellationToken.None,
            responseFormatJson: false));

        Assert.Contains("no devolvio contenido util", ex.Message);
    }
}
