using CjERP.Infrastructure.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// Test directo de IaDashboardExportService (extraido en el paso 1.13 original de la tabla de
/// Fase 1, PV levantado tras lectura linea por linea). AllowedModules y la validacion de campos
/// vacios se quedaron deliberadamente en IaChatService.GenerarDashboardReporteAsync (guardia
/// compartida con ConsultarAsync); esta clase solo cubre lo que depende de IAnthropicMessagesProvider.
/// </summary>
[Trait("Category", "Unit")]
public sealed class IaDashboardExportServiceTests
{
    private sealed class FakeAnthropicMessagesProvider : IAnthropicMessagesProvider
    {
        private readonly bool _hasConfiguration;
        private readonly string _configurationError;
        private readonly string? _htmlToReturn;
        private readonly Exception? _exceptionToThrow;

        public FakeAnthropicMessagesProvider(
            bool hasConfiguration = true,
            string configurationError = "",
            string? htmlToReturn = null,
            Exception? exceptionToThrow = null)
        {
            _hasConfiguration = hasConfiguration;
            _configurationError = configurationError;
            _htmlToReturn = htmlToReturn;
            _exceptionToThrow = exceptionToThrow;
        }

        public bool HasConfiguration(out string errorMessage)
        {
            errorMessage = _configurationError;
            return _hasConfiguration;
        }

        public Task<AnthropicMessagesResponse> SendMessageAsync(
            string systemPrompt,
            List<AnthropicMessageRequest> messages,
            List<AnthropicToolDefinition> tools,
            CancellationToken cancellationToken)
        {
            if (_exceptionToThrow is not null)
            {
                throw _exceptionToThrow;
            }

            return Task.FromResult(new AnthropicMessagesResponse
            {
                Content =
                [
                    new AnthropicContentBlock { Type = "text", Text = _htmlToReturn ?? string.Empty }
                ]
            });
        }
    }

    [Fact]
    public async Task GenerarAsync_SinConfiguracionDeAnthropic_DevuelveFailureSinLlamarAlProveedor()
    {
        var service = new IaDashboardExportService(
            new FakeAnthropicMessagesProvider(hasConfiguration: false, configurationError: "Falta configurar la clave privada de Anthropic."),
            NullLogger<IaDashboardExportService>.Instance);

        var result = await service.GenerarAsync(
            question: "cuanto gasto Claro",
            contextualSummary: "resumen",
            structuredDataJson: "{}",
            module: "GASTOS",
            idUsuario: "1",
            cancellationToken: CancellationToken.None);

        Assert.False(result.Success);
        Assert.Equal("Falta configurar la clave privada de Anthropic.", result.ErrorMessage);
    }

    [Fact]
    public async Task GenerarAsync_RespuestaValida_EnvuelveHtmlSinEtiquetaHtmlEnDocumentoCompleto()
    {
        var service = new IaDashboardExportService(
            new FakeAnthropicMessagesProvider(htmlToReturn: "<main id=\"report-root\">hola</main>"),
            NullLogger<IaDashboardExportService>.Instance);

        var result = await service.GenerarAsync(
            question: "cuanto gasto Claro",
            contextualSummary: "resumen",
            structuredDataJson: "{}",
            module: "GASTOS",
            idUsuario: "1",
            cancellationToken: CancellationToken.None);

        Assert.True(result.Success);
        Assert.Equal("GASTOS", result.Module);
        Assert.StartsWith("<!DOCTYPE html>", result.HtmlContent);
        Assert.Contains("<main id=\"report-root\">hola</main>", result.HtmlContent);
    }

    [Fact]
    public async Task GenerarAsync_LaIaNoDevuelveHtmlUtil_DevuelveFailureConMensajeAmigable()
    {
        var service = new IaDashboardExportService(
            new FakeAnthropicMessagesProvider(htmlToReturn: "   "),
            NullLogger<IaDashboardExportService>.Instance);

        var result = await service.GenerarAsync(
            question: "cuanto gasto Claro",
            contextualSummary: "resumen",
            structuredDataJson: "{}",
            module: "GASTOS",
            idUsuario: "1",
            cancellationToken: CancellationToken.None);

        Assert.False(result.Success);
        Assert.Equal("La IA no devolvio un dashboard HTML valido para exportar el reporte.", result.ErrorMessage);
    }
}
