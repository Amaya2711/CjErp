// Fase 2 (docs/AI_COPILOT_IMPLEMENTATION_PLAN.md): reemplaza GetOrCreate(string? conversationId)
// por un contrato que fija el dueno (IdUsuario) de forma atomica al crear, y que nunca permite que
// una conversacion existente sea adoptada por otro IdUsuario ni por un cliente que adivine o
// reutilice un identificador ajeno. Diferencias deliberadas respecto a la version anterior:
//
// - El identificador de conversacion ya NO lo propone el cliente: lo genera el backend en
//   CreateNew. Si el cliente envia un conversationId que no existe en el store, NO se crea una
//   conversacion con ese identificador (eso era la version anterior, GetOrCreate) — se ignora y se
//   crea una nueva con ID propio del backend. Esto cierra la posibilidad de "plantar" un ID y
//   esperar que alguien mas lo use despues.
// - TryGetOwned nunca "reclama" una conversacion sin dueno para quien pregunta: si el dueno
//   registrado no coincide, o no hay dueno (estado invalido/heredado), se rechaza explicitamente —
//   no hay ningun metodo "TryClaimOwner".
using System.Collections.Concurrent;

namespace CjERP.Infrastructure.Services;

public enum ConversationAccessStatus
{
    Owned,
    NotFound,
    Forbidden,
    OwnerMissingInvalid
}

public readonly record struct ConversationAccess(ConversationAccessStatus Status, ConversationState? State)
{
    public static ConversationAccess Ok(ConversationState state) => new(ConversationAccessStatus.Owned, state);

    public static ConversationAccess Fail(ConversationAccessStatus status) => new(status, null);
}

public interface IIaConversationStore
{
    /// <summary>Crea una conversacion nueva con ID generado por el backend y dueno fijado de forma
    /// atomica. ownerIdUsuario es obligatorio (no vacio) — identidad ausente nunca crea una
    /// conversacion "anonima".</summary>
    ConversationState CreateNew(string ownerIdUsuario);

    /// <summary>Busca una conversacion existente y valida que ownerIdUsuario sea su dueno. Nunca
    /// crea ni adopta: Owned solo si existe y el dueno coincide exactamente; en cualquier otro caso
    /// (no existe, dueno distinto, o dueno invalido/ausente) devuelve el motivo sin el estado.</summary>
    ConversationAccess TryGetOwned(string conversationId, string ownerIdUsuario);
}

/// <summary>
/// Implementacion en memoria de proceso (sigue siendo temporal — la persistencia SQL real es
/// Fase 4 del plan). Debe registrarse como Singleton por la misma razon que la version anterior:
/// el estado debe sobrevivir entre requests HTTP durante la vida del proceso.
/// </summary>
public sealed class InMemoryIaConversationStore : IIaConversationStore
{
    private readonly ConcurrentDictionary<string, ConversationState> _conversations = new(StringComparer.Ordinal);

    public ConversationState CreateNew(string ownerIdUsuario)
    {
        if (string.IsNullOrWhiteSpace(ownerIdUsuario))
        {
            throw new ArgumentException("ownerIdUsuario es obligatorio para crear una conversacion.", nameof(ownerIdUsuario));
        }

        // Bucle de reintento defensivo ante una colision teorica de Guid.NewGuid() — TryAdd nunca
        // pisa una conversacion existente (de cualquier dueno) con una nueva.
        while (true)
        {
            var conversationId = Guid.NewGuid().ToString("N");
            var state = new ConversationState(conversationId, ownerIdUsuario);
            if (_conversations.TryAdd(conversationId, state))
            {
                return state;
            }
        }
    }

    public ConversationAccess TryGetOwned(string conversationId, string ownerIdUsuario)
    {
        if (string.IsNullOrWhiteSpace(conversationId) || string.IsNullOrWhiteSpace(ownerIdUsuario))
        {
            return ConversationAccess.Fail(ConversationAccessStatus.NotFound);
        }

        if (!_conversations.TryGetValue(conversationId, out var state))
        {
            return ConversationAccess.Fail(ConversationAccessStatus.NotFound);
        }

        if (string.IsNullOrWhiteSpace(state.OwnerIdUsuario))
        {
            // Defensivo: con el contrato actual (OwnerIdUsuario fijado en el constructor, sin
            // setter) esto no deberia ocurrir nunca para conversaciones creadas via CreateNew. Se
            // mantiene como red de seguridad explicita, nunca se adjudica a quien pregunta.
            return ConversationAccess.Fail(ConversationAccessStatus.OwnerMissingInvalid);
        }

        return string.Equals(state.OwnerIdUsuario, ownerIdUsuario, StringComparison.Ordinal)
            ? ConversationAccess.Ok(state)
            : ConversationAccess.Fail(ConversationAccessStatus.Forbidden);
    }
}
