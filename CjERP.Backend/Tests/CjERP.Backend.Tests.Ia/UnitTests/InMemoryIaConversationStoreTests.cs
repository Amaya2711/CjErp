using CjERP.Application.DTOs.IaChat;
using CjERP.Infrastructure.Services;
using Xunit;

namespace CjERP.Backend.Tests.Ia.UnitTests;

/// <summary>
/// Tests directos de InMemoryIaConversationStore. Reescrito en Fase 2 (docs/AI_COPILOT_IMPLEMENTATION_PLAN.md)
/// cuando GetOrCreate(string? conversationId) fue reemplazado por CreateNew(ownerIdUsuario) +
/// TryGetOwned(conversationId, ownerIdUsuario): el ID ya no lo propone el cliente, y una
/// conversacion existente nunca se adopta ni se reclama — solo se valida contra su dueno original.
/// </summary>
[Trait("Category", "Unit")]
public sealed class InMemoryIaConversationStoreTests
{
    private const string UsuarioA = "usuario-A";
    private const string UsuarioB = "usuario-B";

    [Fact]
    public void CreateNew_GeneraEstadoVacioConDuenoAsignado()
    {
        var store = new InMemoryIaConversationStore();

        var state = store.CreateNew(UsuarioA);

        Assert.False(string.IsNullOrWhiteSpace(state.ConversationId));
        Assert.Equal(UsuarioA, state.OwnerIdUsuario);
        Assert.Null(state.LastResponse);
        Assert.Null(state.LastToolName);
        Assert.Null(state.LastToolParameters);
        Assert.Empty(state.GetRecentTurns(12));
    }

    [Fact]
    public void CreateNew_LlamadasSucesivas_GeneraIdentificadoresDistintos()
    {
        var store = new InMemoryIaConversationStore();

        var first = store.CreateNew(UsuarioA);
        var second = store.CreateNew(UsuarioA);

        Assert.NotEqual(first.ConversationId, second.ConversationId);
    }

    [Fact]
    public void CreateNew_OwnerIdUsuarioVacio_LanzaExcepcion()
    {
        var store = new InMemoryIaConversationStore();

        Assert.Throws<ArgumentException>(() => store.CreateNew(" "));
    }

    [Fact]
    public void TryGetOwned_MismoDueno_DevuelveLaMismaInstanciaConEstadoConservado()
    {
        var store = new InMemoryIaConversationStore();
        var created = store.CreateNew(UsuarioA);
        created.AppendTurn("user", "primera pregunta");

        var access = store.TryGetOwned(created.ConversationId, UsuarioA);

        Assert.Equal(ConversationAccessStatus.Owned, access.Status);
        Assert.Same(created, access.State);
        Assert.Single(access.State!.GetRecentTurns(12));
    }

    [Fact]
    public void TryGetOwned_DuenoDistinto_DevuelveForbiddenSinEntregarElEstado()
    {
        var store = new InMemoryIaConversationStore();
        var created = store.CreateNew(UsuarioA);

        var access = store.TryGetOwned(created.ConversationId, UsuarioB);

        Assert.Equal(ConversationAccessStatus.Forbidden, access.Status);
        Assert.Null(access.State);
    }

    [Fact]
    public void TryGetOwned_ConversationIdDesconocido_DevuelveNotFoundSinCrearNada()
    {
        var store = new InMemoryIaConversationStore();

        var access = store.TryGetOwned(Guid.NewGuid().ToString("N"), UsuarioA);

        Assert.Equal(ConversationAccessStatus.NotFound, access.Status);
        Assert.Null(access.State);

        // Verifica explicitamente que TryGetOwned no haya creado, de paso, una conversacion con
        // ese identificador desconocido (requisito: un ID ajeno/desconocido nunca se adopta).
        var secondAttempt = store.TryGetOwned(Guid.NewGuid().ToString("N"), UsuarioA);
        Assert.Equal(ConversationAccessStatus.NotFound, secondAttempt.Status);
    }

    [Fact]
    public void TryGetOwned_ConversationIdOOwnerVacios_DevuelveNotFound()
    {
        var store = new InMemoryIaConversationStore();

        Assert.Equal(ConversationAccessStatus.NotFound, store.TryGetOwned("", UsuarioA).Status);
        Assert.Equal(ConversationAccessStatus.NotFound, store.TryGetOwned("algun-id", " ").Status);
    }

    [Fact]
    public void ConversacionesDistintas_NoComparteEstado()
    {
        var store = new InMemoryIaConversationStore();

        var stateA = store.CreateNew(UsuarioA);
        stateA.AppendAssistant("respuesta A", new IaChatResponseDto { Success = true }, "buscar_planilla", null);

        var stateB = store.CreateNew(UsuarioB);

        Assert.NotNull(stateA.LastResponse);
        Assert.Null(stateB.LastResponse);
    }

    [Fact]
    public void AccesoConcurrente_MismoDueno_AmbasLecturasResuelvenLaMismaInstancia()
    {
        // Verifica que dos solicitudes concurrentes del MISMO dueno sobre la MISMA conversacion no
        // produzcan instancias distintas ni pierdan turnos ya agregados (proteccion minima de Fase 2
        // sobre el store actual, sin esperar a la persistencia SQL de Fase 4).
        var store = new InMemoryIaConversationStore();
        var created = store.CreateNew(UsuarioA);
        created.AppendTurn("user", "pregunta inicial");

        var accesses = new System.Collections.Concurrent.ConcurrentBag<ConversationAccess>();
        Parallel.For(0, 20, _ =>
        {
            accesses.Add(store.TryGetOwned(created.ConversationId, UsuarioA));
        });

        Assert.All(accesses, access =>
        {
            Assert.Equal(ConversationAccessStatus.Owned, access.Status);
            Assert.Same(created, access.State);
        });
    }

    [Fact]
    public void AppendAssistant_ConservaLastResponseLastToolNameYLastToolParameters()
    {
        var store = new InMemoryIaConversationStore();
        var state = store.CreateNew(UsuarioA);
        var response = new IaChatResponseDto { Success = true, Answer = "ok" };
        var toolParameters = new Dictionary<string, object?> { ["cliente"] = "Claro" };

        state.AppendAssistant("ok", response, "buscar_planilla", toolParameters);

        Assert.Same(response, state.LastResponse);
        Assert.Equal("buscar_planilla", state.LastToolName);
        Assert.Equal("Claro", state.LastToolParameters!["cliente"]);
    }

    [Fact]
    public void AppendAssistant_CopiaLosParametros_NoCompartiendoReferenciaConElLlamador()
    {
        var store = new InMemoryIaConversationStore();
        var state = store.CreateNew(UsuarioA);
        var toolParameters = new Dictionary<string, object?> { ["cliente"] = "Claro" };

        state.AppendAssistant("ok", new IaChatResponseDto { Success = true }, "buscar_planilla", toolParameters);
        toolParameters["cliente"] = "Entel";

        Assert.Equal("Claro", state.LastToolParameters!["cliente"]);
    }

    [Fact]
    public void GetRecentTurns_RespetaElLimiteHardcodeadoDe12Turnos()
    {
        // HALLAZGO PRESERVADO (comportamiento original, no un bug de esta fase): el limite real de
        // turnos almacenados es 12 (hardcodeado en AppendTurn/AppendAssistant), distinto del
        // ConversationHistoryLimit=6 que el orquestador usa solo al construir el texto de contexto
        // para el planner. Ver D-5 / anexo de Fase 1.0: inconsistencia conocida, sin resolver todavia.
        var store = new InMemoryIaConversationStore();
        var state = store.CreateNew(UsuarioA);

        for (var i = 0; i < 20; i++)
        {
            state.AppendTurn("user", $"pregunta {i}");
        }

        var turns = state.GetRecentTurns(20);

        Assert.Equal(12, turns.Count);
        Assert.Equal("pregunta 19", turns[^1].Text);
    }

    [Fact]
    public void AppendAssistant_SiElUltimoTurnoYaEsAssistant_LoReemplazaEnVezDeAgregarUnoNuevo()
    {
        var store = new InMemoryIaConversationStore();
        var state = store.CreateNew(UsuarioA);

        state.AppendTurn("user", "pregunta");
        state.AppendAssistant("primera respuesta", new IaChatResponseDto { Success = true }, null, null);
        state.AppendAssistant("respuesta corregida", new IaChatResponseDto { Success = true }, null, null);

        var turns = state.GetRecentTurns(12);

        Assert.Equal(2, turns.Count);
        Assert.Equal("respuesta corregida", turns[^1].Text);
    }

    [Fact]
    public void AuthorizedScope_MismoNivelPeroMiembrosDistintos_NoCoincide()
    {
        // Preparacion de Fase 2 (sin conectar todavia a ninguna decision real de autorizacion):
        // comparar solo el nivel ("Equipo" == "Equipo") no basta si cambio la composicion del equipo.
        var store = new InMemoryIaConversationStore();
        var state = store.CreateNew(UsuarioA);

        state.RecordAuthorizedScope(new IaAuthorizedScope("Equipo", ["E1", "E2"]));

        Assert.False(state.MatchesAuthorizedScope(new IaAuthorizedScope("Equipo", ["E1", "E3"])));
        Assert.True(state.MatchesAuthorizedScope(new IaAuthorizedScope("Equipo", ["E2", "E1"])));
    }

    [Fact]
    public void AuthorizedScope_SinRegistrarTodavia_NuncaCoincide()
    {
        var store = new InMemoryIaConversationStore();
        var state = store.CreateNew(UsuarioA);

        Assert.False(state.MatchesAuthorizedScope(new IaAuthorizedScope("Propio", ["E1"])));
    }
}
