using CjERP.Application.Interfaces.Services;
using CjERP.Backend.Tests.Ia.TestSupport;
using CjERP.Infrastructure.Persistence.Sql;
using CjERP.Infrastructure.Services;
using CjERP.Shared.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace CjERP.Backend.Tests.Ia.IntegrationTests;

/// <summary>
/// Verifica que el grafo de DI del modulo IA (el mismo conjunto de registros de Program.cs tras
/// los pasos 1.9, 1.12 y 1.13) resuelve sin excepciones, sin arrancar la API real (sin Kestrel,
/// sin Hangfire, sin conexion a SQL Server real). Esto cubre un riesgo distinto al de "compila":
/// un registro faltante o un ciclo de dependencias solo aparece al construir el ServiceProvider,
/// no al compilar. No reemplaza una prueba de arranque real de CjERP.Api.
/// </summary>
[Trait("Category", "Integration")]
public sealed class DiResolutionTests
{
    [Fact]
    public void ServiceProvider_ConLosRegistrosDeProgramCs_ResuelveIIaChatServiceSinExcepciones()
    {
        var services = new ServiceCollection();

        services.AddSingleton(NullLoggerFactory.Instance);
        services.AddLogging();

        services.AddSingleton<ISqlCommandFactory>(_ => FakeSqlCommandFactory.NeverCalled());

        services.AddSingleton<IOptions<OpenAiSettings>>(Options.Create(new OpenAiSettings
        {
            ApiKey = "test-openai-key",
            Model = "gpt-4.1-mini-test",
            MaxTokens = 1500
        }));
        services.AddSingleton<IOptions<AnthropicSettings>>(Options.Create(new AnthropicSettings
        {
            ApiKey = "test-anthropic-key",
            Model = "claude-test",
            MaxTokens = 1500
        }));

        // Mismo patron que Program.cs, sin AddHttpClient<T> (evita depender del paquete de
        // HttpClientFactory solo para esta prueba): HttpClient inyectado directamente.
        services.AddScoped<IOpenAiChatProvider>(sp =>
            new OpenAiChatProvider(new HttpClient(), sp.GetRequiredService<IOptions<OpenAiSettings>>()));
        services.AddScoped<IAnthropicMessagesProvider>(sp =>
            new AnthropicMessagesProvider(new HttpClient(), sp.GetRequiredService<IOptions<AnthropicSettings>>()));

        services.AddScoped<IGastosQueryPlanner, GastosQueryPlanner>();
        services.AddScoped<IGastosQueryExecutor, GastosQueryExecutor>();
        services.AddSingleton<IIaConversationStore, InMemoryIaConversationStore>();
        services.AddScoped<IIaAuditService, IaAuditService>();
        services.AddScoped<IResponseGenerator, ResponseGenerator>();
        services.AddScoped<IIaDashboardExportService, IaDashboardExportService>();
        services.AddScoped<IIaChatService, IaOrchestrator>();

        using var provider = services.BuildServiceProvider(validateScopes: true);
        using var scope = provider.CreateScope();

        var exception = Record.Exception(() => scope.ServiceProvider.GetRequiredService<IIaChatService>());

        Assert.Null(exception);
    }
}
