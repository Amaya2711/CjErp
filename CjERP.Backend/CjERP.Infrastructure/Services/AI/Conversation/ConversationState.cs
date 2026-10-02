// Extraido de IaChatService.cs en Fase 1.4 (docs/AI_COPILOT_IMPLEMENTATION_PLAN.md).
// Codigo movido tal cual: no se cambio ningun comportamiento, solo la ubicacion (incluye el mismo
// lock interno y el mismo limite hardcodeado de 12 turnos, distinto del ConversationHistoryLimit=6
// usado al construir el contexto para el planner - inconsistencia ya documentada, D-5, sin resolver
// todavia).
using CjERP.Application.DTOs.IaChat;

namespace CjERP.Infrastructure.Services;

using static CjERP.Infrastructure.Services.IaTextUtils;

/// <summary>
/// Representa el alcance de datos con el que se autorizo el ultimo resultado guardado en esta
/// conversacion (Fase 2, preparacion — ver docs/AI_COPILOT_IMPLEMENTATION_PLAN.md). "Level" es la
/// etiqueta (Propio/Equipo/Total) e "Identifiers" es el conjunto completo de identificadores que
/// la resolvieron en ese momento (p.ej. el empleado titular + todos los miembros del equipo
/// vigentes). Comparar solo "Level" no basta: un equipo puede conservar el mismo nivel y cambiar de
/// miembros entre un turno y el siguiente — por eso se compara el conjunto completo, no la
/// etiqueta. Esta clase se usa para preparar la invalidacion de memoria; ningun componente la
/// conecta todavia a una decision de autorizacion real (eso depende de inspeccionar
/// sp_IA_Planilla_Buscar, sin resolver).
/// </summary>
public sealed record IaAuthorizedScope(string Level, IReadOnlyList<string> Identifiers);

/// <summary>
/// Estado conversacional de una conversationId: historial acotado de turnos y ultima respuesta
/// estructurada devuelta al usuario. Es el UNICO lugar que muta este estado (via AppendTurn/
/// AppendAssistant); todo lo demas (IaConversationFollowUpResolver, IaOrchestrator) solo LEE.
///
/// OwnerIdUsuario se fija una sola vez, en el constructor, al momento de crear la conversacion
/// (ver IaConversationStore.CreateNew) — no existe ningun metodo para cambiarlo despues. Una
/// conversacion ya creada nunca puede ser adoptada ni reclamada por otro IdUsuario.
/// </summary>
public sealed class ConversationState
{
    private readonly object _sync = new();
    private readonly List<ConversationTurn> _turns = [];

    public ConversationState(string conversationId, string ownerIdUsuario)
    {
        ConversationId = conversationId;
        OwnerIdUsuario = ownerIdUsuario;
    }

    public string ConversationId { get; }

    public string OwnerIdUsuario { get; }

    public IaChatResponseDto? LastResponse { get; private set; }

    public Dictionary<string, object?>? LastToolParameters { get; private set; }

    public string? LastToolName { get; private set; }

    public IaAuthorizedScope? LastAuthorizedScope { get; private set; }

    /// <summary>
    /// Registra el alcance con el que se autorizo el resultado que se esta a punto de guardar.
    /// Preparacion de Fase 2: ningun llamador existe todavia (la resolucion real de alcance
    /// depende de inspeccionar sp_IA_Planilla_Buscar), pero el mecanismo de invalidacion queda
    /// listo y probado.
    /// </summary>
    public void RecordAuthorizedScope(IaAuthorizedScope scope)
    {
        lock (_sync)
        {
            LastAuthorizedScope = scope;
        }
    }

    /// <summary>
    /// true solo si el alcance actualmente resuelto (nivel + conjunto completo de identificadores)
    /// coincide exactamente con el que autorizo el ultimo resultado guardado. Si no hay ningun
    /// alcance registrado todavia, devuelve false (nada que reutilizar sin autorizar primero).
    /// </summary>
    public bool MatchesAuthorizedScope(IaAuthorizedScope current)
    {
        lock (_sync)
        {
            if (LastAuthorizedScope is null)
            {
                return false;
            }

            if (!string.Equals(LastAuthorizedScope.Level, current.Level, StringComparison.Ordinal))
            {
                return false;
            }

            return LastAuthorizedScope.Identifiers
                .ToHashSet(StringComparer.Ordinal)
                .SetEquals(current.Identifiers);
        }
    }

    public void AppendTurn(string role, string text)
    {
        var normalizedText = NormalizeText(text) ?? string.Empty;

        lock (_sync)
        {
            _turns.Add(new ConversationTurn(role, normalizedText, DateTimeOffset.UtcNow));

            if (_turns.Count > 12)
            {
                _turns.RemoveRange(0, _turns.Count - 12);
            }
        }
    }

    public void AppendAssistant(
        string answer,
        IaChatResponseDto response,
        string? toolName,
        Dictionary<string, object?>? toolParameters)
    {
        lock (_sync)
        {
            LastResponse = response;
            LastToolName = NormalizeText(toolName);
            LastToolParameters = toolParameters is null
                ? null
                : toolParameters.ToDictionary(item => item.Key, item => item.Value);

            if (_turns.Count == 0 || !string.Equals(_turns[^1].Role, "assistant", StringComparison.OrdinalIgnoreCase))
            {
                _turns.Add(new ConversationTurn("assistant", NormalizeText(answer) ?? string.Empty, DateTimeOffset.UtcNow));
            }
            else
            {
                _turns[^1] = new ConversationTurn("assistant", NormalizeText(answer) ?? string.Empty, DateTimeOffset.UtcNow);
            }

            if (_turns.Count > 12)
            {
                _turns.RemoveRange(0, _turns.Count - 12);
            }
        }
    }

    public List<ConversationTurn> GetRecentTurns(int limit)
    {
        lock (_sync)
        {
            if (_turns.Count == 0)
            {
                return [];
            }

            return _turns
                .TakeLast(Math.Max(1, limit))
                .ToList();
        }
    }
}

public sealed record ConversationTurn(string Role, string Text, DateTimeOffset Timestamp);
