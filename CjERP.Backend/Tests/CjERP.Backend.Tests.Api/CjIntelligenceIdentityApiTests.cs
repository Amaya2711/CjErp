using System.Security.Claims;
using CjERP.Api.Controllers;
using CjERP.Application.DTOs.CjIntelligence;
using CjERP.Application.Interfaces.Services.AI;
using CjERP.Infrastructure.Services;
using CjERP.Infrastructure.Services.AI.CjIntelligence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CjERP.Backend.Tests.Api;

/// <summary>
/// IDENTIDAD PERMANENTE desde la API: el CONTROLADOR REAL con el SERVICIO DE CHAT REAL y un almacen que reproduce lo que hace SQL tras un conflicto de
/// identidad (login reutilizado: el procedimiento lanza 51010) o tras SEPARAR (la conversacion archivada ya no se encuentra para el login).
/// El modelo (proveedor) y la consulta de pagos EXPLOTAN si se alcanzan: demuestran que nada llega a ellos.
/// Estas pruebas NO tocan SQL; la parte de procedimientos esta en los scripts 22 (G) y 23 y en las pruebas de integracion (omitidas por defecto).
/// </summary>
[Trait("Category", "Unit")]
public sealed class CjIntelligenceIdentityApiTests
{
    private static readonly Guid ArchivedConversation = Guid.Parse("11111111-2222-3333-4444-555555555555");

    private sealed class ExplodingProvider : IOpenAiToolChatProvider
    {
        public int Calls { get; private set; }
        public bool HasConfiguration(out string errorMessage) { errorMessage = string.Empty; return true; }
        public Task<OpenAiToolChatResult> SendAsync(IReadOnlyList<OpenAiToolChatMessage> messages, IReadOnlyList<OpenAiToolDefinition> tools, CancellationToken ct)
        {
            Calls++;
            throw new InvalidOperationException("El modelo no debia recibir nada.");
        }
    }

    private sealed class ExplodingPagos : ICjIntelligencePagosGateway
    {
        public int Calls { get; private set; }
        public Task<PagosQueryResult> ResumenAsync(string login, string nivelSolicitado, PagosResumenArgs args, CancellationToken ct)
        {
            Calls++;
            throw new InvalidOperationException("No debia consultarse pagos.");
        }
    }

    private sealed class AllowScopes : ICjIntelligenceScopeResolver
    {
        public Task<CjIntelligenceScopeDecision> ResolveAsync(string? idUsuario, CancellationToken ct) =>
            Task.FromResult(CjIntelligenceScopeDecision.Allow(IaResolvedScope.ForRestricted(IaScopeLevel.Propio, IaScopeFields.ResponsableOSolicitante, [10], false)));
    }

    /// <summary>Lo que SQL hace con el login reutilizado: sp_IA_Cj_* lanza 51010 (SqlException) y el acceso a datos lo traduce a esta excepcion.</summary>
    private sealed class ConflictStore : ICjIntelligenceConversationStore
    {
        public List<string> Touched { get; } = [];
        private Exception Deny(string op) { Touched.Add(op); return new CjIntelligenceIdentityException(); }
        public Task<Guid> CreateAsync(string login, string? titulo, string modulo, CancellationToken ct) => throw Deny("Create");
        public Task<IReadOnlyList<CjConversationRow>> ListAsync(string login, int pagina, int tamano, CancellationToken ct) => throw Deny("List");
        public Task<CjConversationOpen> OpenAsync(string login, Guid id, int desde, int cantidad, CancellationToken ct) => throw Deny("Open");
        public Task<bool> RenameAsync(string login, Guid id, string titulo, CancellationToken ct) => throw Deny("Rename");
        public Task<bool> DeleteAsync(string login, Guid id, CancellationToken ct) => throw Deny("Delete");
        public Task<CjTurnStart> StartTurnAsync(string login, Guid id, Guid cm, Guid owner, string contenido, int ttl, CancellationToken ct) => throw Deny("StartTurn");
        public Task<CjTurnStart> StartTurnInNewConversationAsync(string login, Guid cm, Guid owner, string contenido, string modulo, int ttl, CancellationToken ct) => throw Deny("StartNew");
        public Task<bool> RenewAsync(long idTurno, Guid owner, int ttl, CancellationToken ct) => throw Deny("Renew");
        public Task<long> RecordResultAsync(long idTurno, Guid owner, CjResultRecord record, CancellationToken ct) => throw Deny("Record");
        public Task CompleteAsync(long idTurno, Guid owner, CjCompleteRequest request, CancellationToken ct) => throw Deny("Complete");
        public Task FailAsync(long idTurno, Guid owner, string estado, string? error, CancellationToken ct) => throw Deny("Fail");
        public Task<bool> SaveStateAsync(long idTurno, Guid owner, int versionEsperada, string estadoJson, CancellationToken ct) => throw Deny("State");
        public Task<long?> RecordAuditAsync(CjAuditRecord record, CancellationToken ct) => throw Deny("Audit");
    }

    /// <summary>Lo que SQL hace tras SEPARAR: el login es valido y vacio; la conversacion archivada ya no es suya (no se encuentra).</summary>
    private sealed class ArchivedStore : ICjIntelligenceConversationStore
    {
        public List<string> Touched { get; } = [];
        public Task<Guid> CreateAsync(string login, string? titulo, string modulo, CancellationToken ct) => throw new NotSupportedException();
        public Task<IReadOnlyList<CjConversationRow>> ListAsync(string login, int pagina, int tamano, CancellationToken ct) { Touched.Add("List"); return Task.FromResult<IReadOnlyList<CjConversationRow>>([]); }
        public Task<CjConversationOpen> OpenAsync(string login, Guid id, int desde, int cantidad, CancellationToken ct) { Touched.Add("Open"); return Task.FromResult(new CjConversationOpen(false, null, 0, null, [], [])); }
        public Task<bool> RenameAsync(string login, Guid id, string titulo, CancellationToken ct) { Touched.Add("Rename"); return Task.FromResult(false); }
        public Task<bool> DeleteAsync(string login, Guid id, CancellationToken ct) { Touched.Add("Delete"); return Task.FromResult(false); }
        public Task<CjTurnStart> StartTurnAsync(string login, Guid id, Guid cm, Guid owner, string contenido, int ttl, CancellationToken ct) { Touched.Add("StartTurn"); return Task.FromResult(new CjTurnStart { Resultado = CjTurnResults.NotFound }); }
        public Task<CjTurnStart> StartTurnInNewConversationAsync(string login, Guid cm, Guid owner, string contenido, string modulo, int ttl, CancellationToken ct) => throw new NotSupportedException();
        public Task<bool> RenewAsync(long idTurno, Guid owner, int ttl, CancellationToken ct) => throw new NotSupportedException();
        public Task<long> RecordResultAsync(long idTurno, Guid owner, CjResultRecord record, CancellationToken ct) => throw new NotSupportedException();
        public Task CompleteAsync(long idTurno, Guid owner, CjCompleteRequest request, CancellationToken ct) => throw new NotSupportedException();
        public Task FailAsync(long idTurno, Guid owner, string estado, string? error, CancellationToken ct) => throw new NotSupportedException();
        public Task<bool> SaveStateAsync(long idTurno, Guid owner, int versionEsperada, string estadoJson, CancellationToken ct) => throw new NotSupportedException();
        public Task<long?> RecordAuditAsync(CjAuditRecord record, CancellationToken ct) => Task.FromResult<long?>(1);
    }

    private static (CjIntelligenceController Controller, ExplodingProvider Provider, ExplodingPagos Pagos) Build(ICjIntelligenceConversationStore store)
    {
        var provider = new ExplodingProvider();
        var pagos = new ExplodingPagos();
        var service = new CjIntelligenceChatService(provider, new AllowScopes(), store, pagos, new CjIntelligenceOptions(), NullLogger<CjIntelligenceChatService>.Instance);
        var services = new ServiceCollection().AddSingleton<ICjIntelligenceChatService>(service).BuildServiceProvider();
        var user = new ClaimsPrincipal(new ClaimsIdentity([new Claim("IdUsuario", "jperez")], "test"));
        return (new CjIntelligenceController(services) { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = user } } }, provider, pagos);
    }

    private static (int Status, string Json) Read(IActionResult result)
    {
        var (status, value) = result switch
        {
            ObjectResult o => (o.StatusCode ?? 200, o.Value),
            StatusCodeResult s => (s.StatusCode, null),
            _ => (0, null)
        };
        return (status, System.Text.Json.JsonSerializer.Serialize(value));
    }

    private static CjAiChatRequestDto Chat(bool withConversation) => new()
    {
        Message = "pagos de octubre",
        ClientMessageId = Guid.NewGuid().ToString(),
        ConversationId = withConversation ? ArchivedConversation.ToString() : null
    };

    [Fact]
    public async Task LoginReutilizado_SqlDeniegaLaIdentidad_TodasLasRutasDeLaApiResponden403_SinTocarElModeloNiPagos()
    {
        var store = new ConflictStore();
        var (controller, provider, pagos) = Build(store);
        var ct = CancellationToken.None;

        var results = new[]
        {
            Read(await controller.Chat(Chat(withConversation: false), ct)),
            Read(await controller.Chat(Chat(withConversation: true), ct)),
            Read(await controller.Listar(1, 30, ct)),
            Read(await controller.Abrir(ArchivedConversation.ToString(), ct)),
            Read(await controller.Renombrar(ArchivedConversation.ToString(), new CjAiRenameRequestDto { Titulo = "x" }, ct)),
            Read(await controller.Eliminar(ArchivedConversation.ToString(), ct))
        };

        Assert.All(results, r => Assert.Equal(403, r.Status));
        Assert.All(results, r => Assert.DoesNotContain("retirada", r.Json));          // ni rastro del historial archivado
        Assert.Equal(0, provider.Calls);
        Assert.Equal(0, pagos.Calls);
        Assert.NotEmpty(store.Touched);                                              // las operaciones SI llegaron al almacen (SQL fue quien denego)
    }

    [Fact]
    public async Task ConversacionArchivadaTrasSeparar_LaApiResponde404_ElLoginVeUnListadoVacio_SinTocarElModeloNiPagos()
    {
        var store = new ArchivedStore();
        var (controller, provider, pagos) = Build(store);
        var ct = CancellationToken.None;

        var abrir = Read(await controller.Abrir(ArchivedConversation.ToString(), ct));
        var renombrar = Read(await controller.Renombrar(ArchivedConversation.ToString(), new CjAiRenameRequestDto { Titulo = "x" }, ct));
        var eliminar = Read(await controller.Eliminar(ArchivedConversation.ToString(), ct));
        var chat = Read(await controller.Chat(Chat(withConversation: true), ct));
        var listar = Read(await controller.Listar(1, 30, ct));

        Assert.Equal(404, abrir.Status);
        Assert.Equal(404, renombrar.Status);
        Assert.Equal(404, eliminar.Status);
        Assert.Equal(404, chat.Status);
        Assert.Equal(200, listar.Status);
        Assert.Contains("[]", listar.Json);                                          // el login arranca vacio
        Assert.Equal(0, provider.Calls);
        Assert.Equal(0, pagos.Calls);
    }
}
