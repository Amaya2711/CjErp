using CjERP.Infrastructure.Persistence.Sql;
using CjERP.Infrastructure.Services;
using CjERP.Shared.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace CjERP.Backend.Tests.Ia.TestSupport;

/// <summary>
/// Construye instancias reales de <see cref="IaOrchestrator"/> (implementacion de IIaChatService
/// desde el paso 1.14; antes construia <c>IaChatService</c>, que ya no implementa la interfaz) con
/// dependencias controladas por el test: un HttpClient compartido sobre
/// <see cref="FakeHttpMessageHandler"/> inyectado en <see cref="OpenAiChatProvider"/> y
/// <see cref="AnthropicMessagesProvider"/> reales, un <see cref="GastosQueryPlanner"/> real que
/// delega en el provider de OpenAI, ISqlCommandFactory fake, configuracion minima valida y un
/// logger nulo.
/// </summary>
public static class IaChatServiceTestFactory
{
    public static IaOrchestrator Create(
        FakeHttpMessageHandler httpHandler,
        ISqlCommandFactory? sqlCommandFactory = null) =>
        CreateWithStore(httpHandler, sqlCommandFactory).Service;

    /// <summary>
    /// Igual que <see cref="Create"/>, pero tambien devuelve el <see cref="InMemoryIaConversationStore"/>
    /// usado por el servicio — necesario para tests que necesitan sembrar un resultado previo
    /// directamente en una conversacion propia (p.ej. probar exportacion) sin depender de una
    /// ejecucion SQL real contra sp_IA_Planilla_Buscar (gap ya documentado: ISqlCommandFactory.
    /// CreateConnection() devuelve el tipo concreto SqlConnection, no hay forma de simular filas
    /// sin una base de datos real). "Propio" aqui es propiedad de la conversacion, no autorizacion
    /// de alcance de datos (IIaAuthorizationService sigue sin conectar).
    /// </summary>
    public static (IaOrchestrator Service, IIaConversationStore Store) CreateWithStore(
        FakeHttpMessageHandler httpHandler,
        ISqlCommandFactory? sqlCommandFactory = null)
    {
        var httpClient = new HttpClient(httpHandler, disposeHandler: false);

        var openAiSettings = Options.Create(new OpenAiSettings
        {
            ApiKey = "test-openai-key",
            Model = "gpt-4.1-mini-test",
            MaxTokens = 1500
        });

        var anthropicSettings = Options.Create(new AnthropicSettings
        {
            ApiKey = "test-anthropic-key",
            Model = "claude-test",
            MaxTokens = 1500
        });

        var openAiChatProvider = new OpenAiChatProvider(httpClient, openAiSettings);
        var anthropicMessagesProvider = new AnthropicMessagesProvider(httpClient, anthropicSettings);
        var gastosQueryPlanner = new GastosQueryPlanner(openAiChatProvider);
        var resolvedSqlCommandFactory = sqlCommandFactory ?? FakeSqlCommandFactory.NeverCalled();
        var gastosQueryExecutor = new GastosQueryExecutor(resolvedSqlCommandFactory, NullLogger<GastosQueryExecutor>.Instance);
        var conversationStore = new InMemoryIaConversationStore();
        var auditService = new IaAuditService(resolvedSqlCommandFactory, NullLogger<IaAuditService>.Instance);
        var responseGenerator = new ResponseGenerator(openAiChatProvider);
        var dashboardExportService = new IaDashboardExportService(anthropicMessagesProvider, NullLogger<IaDashboardExportService>.Instance);

        var service = new IaOrchestrator(
            gastosQueryExecutor,
            openAiChatProvider,
            gastosQueryPlanner,
            conversationStore,
            auditService,
            responseGenerator,
            dashboardExportService,
            NullLogger<IaOrchestrator>.Instance);

        return (service, conversationStore);
    }
}
