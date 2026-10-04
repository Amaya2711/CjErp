using CjERP.Application.DTOs.IaChat;
using CjERP.Infrastructure.Services;

namespace CjERP.Backend.Tests.Ia.TestSupport;

/// <summary>
/// Punto unico de acceso, desde los tests, a la logica que originalmente vivia en el monolito
/// <see cref="IaChatService"/>. Tras el paso 1.14 (extraccion final de ConsultarAsync/
/// GenerarDashboardReporteAsync a <see cref="IaOrchestrator"/>), ya no queda ningun metodo privado
/// de instancia/estatico pendiente de extraer: todas las llamadas de este helper son directas,
/// sin reflexion (los dos ultimos casos, NeedsClarification y BuildChart, se migraron en ese mismo
/// paso). Se conserva el nombre de la clase y su rol de "punto unico de acceso" para no romper los
/// archivos de test que ya lo consumen.
/// </summary>
internal static class IaChatServiceReflection
{
    /// <summary>Extraido a IaPromptGuardrails en Fase 1.1 (ya no vive en IaChatService).</summary>
    public static bool ContainsProhibitedSqlIntent(string question) =>
        IaPromptGuardrails.ContainsProhibitedSqlIntent(question);

    /// <summary>Extraido a IaOrchestrator en el paso 1.14 (ya no vive en IaChatService).</summary>
    public static bool NeedsClarification(string question) =>
        IaOrchestrator.NeedsClarification(question);

    /// <summary>
    /// Extraido a IaErrorMessageBuilder en el paso 1.7 (ya no vive en IaChatService).
    /// </summary>
    public static string BuildFriendlyErrorMessage(Exception ex) =>
        IaErrorMessageBuilder.BuildFriendlyErrorMessage(ex);

    /// <summary>
    /// Extraido a BuscarPlanillaQuestionHeuristics en Fase 1.1 (ya no vive en IaChatService).
    /// Proyecta el resultado (de tipo interno <c>BuscarPlanillaArgs</c>) a un snapshot publico
    /// legible desde los tests.
    /// </summary>
    public static BuscarPlanillaArgsSnapshot BuildSearchArgsFromQuestion(string question)
    {
        var args = BuscarPlanillaQuestionHeuristics.BuildSearchArgsFromQuestion(question);
        return BuscarPlanillaArgsSnapshot.FromReflected(args);
    }

    /// <summary>Extraido a GastosAnalysisService en Fase 1.3 (ya no vive en IaChatService).</summary>
    public static List<Dictionary<string, object?>> AggregateRowsByField(
        List<Dictionary<string, object?>> rows, string groupField, string? amountField) =>
        GastosAnalysisService.AggregateRowsByField(rows, groupField, amountField);

    /// <summary>
    /// BuildChart es de instancia (no estatico); requiere una instancia real de IaOrchestrator.
    /// Extraido a IaOrchestrator en el paso 1.14 (ya no vive en IaChatService); ya no requiere
    /// reflexion porque el metodo se promovio a internal (visible via InternalsVisibleTo).
    /// </summary>
    public static IaChatChartResponseDto BuildChart(
        IaOrchestrator service, string agruparPor, string question, List<Dictionary<string, object?>> groupedRows) =>
        service.BuildChart(agruparPor, question, groupedRows);

    /// <summary>
    /// Store compartido por todos los tests de este helper (no el mismo que usa la app real via DI,
    /// pero el mismo tipo concreto: InMemoryIaConversationStore). Extraido a Services/AI/Conversation
    /// en Fase 1.4 (ya no vive en IaChatService).
    ///
    /// Fase 2: GetOrCreate(string? conversationId) fue reemplazado por CreateNew(ownerIdUsuario) +
    /// TryGetOwned(conversationId, ownerIdUsuario) — un conversationId ya no es suficiente por si
    /// solo para recuperar un estado, se necesita tambien el dueno. Este helper preserva el
    /// contrato que los tests de follow-up ya usaban ("la misma clave de test siempre devuelve la
    /// misma instancia") mapeando esa clave a un ID real generado por el store, bajo un dueno de
    /// prueba fijo — no reintroduce la semantica vieja en produccion, solo en este helper de test.
    /// </summary>
    private static readonly InMemoryIaConversationStore SharedConversationStore = new();
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, string> TestKeyToRealConversationId = new();
    private const string TestOwnerIdUsuario = "test-owner";

    public static ConversationState GetOrCreateConversationState(string testKey)
    {
        var realConversationId = TestKeyToRealConversationId.GetOrAdd(
            testKey,
            _ => SharedConversationStore.CreateNew(TestOwnerIdUsuario).ConversationId);

        var access = SharedConversationStore.TryGetOwned(realConversationId, TestOwnerIdUsuario);
        return access.State!;
    }

    /// <summary>Siembra LastResponse/LastToolName/LastToolParameters en un ConversationState existente,
    /// usando el metodo publico AppendAssistant (ya no requiere reflexion: ConversationState es publico).</summary>
    public static void SeedLastResponse(
        ConversationState conversationState, string answer, IaChatResponseDto response,
        string? toolName = null, Dictionary<string, object?>? toolParameters = null) =>
        conversationState.AppendAssistant(answer, response, toolName, toolParameters);

    /// <summary>Extraido a IaConversationFollowUpResolver en Fase 1.4 (ya no vive en IaChatService).</summary>
    public static bool TryReformatLastChart(
        string question, ConversationState conversationState, out IaChatChartResponseDto? chart, out string answer) =>
        IaConversationFollowUpResolver.TryReformatLastChart(question, conversationState, out chart, out answer);

    /// <summary>Extraido a IaConversationFollowUpResolver en Fase 1.4 (ya no vive en IaChatService).</summary>
    public static bool TryReuseLastResponseForFollowUp(
        string question, ConversationState conversationState,
        out IaChatResponseDto? response, out string answer, out string followUpIntent) =>
        IaConversationFollowUpResolver.TryReuseLastResponseForFollowUp(
            question, conversationState, out response, out answer, out followUpIntent);

    /// <summary>Extraido a IaConversationFollowUpResolver en Fase 1.4 (ya no vive en IaChatService).</summary>
    public static bool TryListMatchesFromLastResult(
        string question, ConversationState conversationState, out IaChatResponseDto? response, out string answer) =>
        IaConversationFollowUpResolver.TryListMatchesFromLastResult(question, conversationState, out response, out answer);
}

/// <summary>Proyeccion publica y legible del tipo privado <c>IaChatService.BuscarPlanillaArgs</c>,
/// para poder hacer asserts en los tests sin exponer el tipo original.</summary>
public sealed record BuscarPlanillaArgsSnapshot(
    string? TextoBusqueda,
    string? Estados,
    DateOnly? FechaInicio,
    DateOnly? FechaFin,
    string? IdSite,
    string? Site,
    string? Cliente,
    string? Proyecto,
    string? Responsable,
    string? Solicitante,
    string? Ot,
    bool CoincidirTodas,
    bool IncluirEstado99,
    int Pagina,
    int TamanoPagina,
    decimal? TipoCambio,
    bool EstadosAplicadosPorDefecto,
    bool FechasAplicadasPorDefecto)
{
    public static BuscarPlanillaArgsSnapshot FromReflected(object args)
    {
        var t = args.GetType();
        T Get<T>(string name) => (T)t.GetProperty(name)!.GetValue(args)!;
        T? GetNullable<T>(string name) where T : struct => (T?)t.GetProperty(name)!.GetValue(args);

        return new BuscarPlanillaArgsSnapshot(
            TextoBusqueda: (string?)t.GetProperty("TextoBusqueda")!.GetValue(args),
            Estados: (string?)t.GetProperty("Estados")!.GetValue(args),
            FechaInicio: GetNullable<DateOnly>("FechaInicio"),
            FechaFin: GetNullable<DateOnly>("FechaFin"),
            IdSite: (string?)t.GetProperty("IdSite")!.GetValue(args),
            Site: (string?)t.GetProperty("Site")!.GetValue(args),
            Cliente: (string?)t.GetProperty("Cliente")!.GetValue(args),
            Proyecto: (string?)t.GetProperty("Proyecto")!.GetValue(args),
            Responsable: (string?)t.GetProperty("Responsable")!.GetValue(args),
            Solicitante: (string?)t.GetProperty("Solicitante")!.GetValue(args),
            Ot: (string?)t.GetProperty("Ot")!.GetValue(args),
            CoincidirTodas: Get<bool>("CoincidirTodas"),
            IncluirEstado99: Get<bool>("IncluirEstado99"),
            Pagina: Get<int>("Pagina"),
            TamanoPagina: Get<int>("TamanoPagina"),
            TipoCambio: GetNullable<decimal>("TipoCambio"),
            EstadosAplicadosPorDefecto: Get<bool>("EstadosAplicadosPorDefecto"),
            FechasAplicadasPorDefecto: Get<bool>("FechasAplicadasPorDefecto"));
    }
}
