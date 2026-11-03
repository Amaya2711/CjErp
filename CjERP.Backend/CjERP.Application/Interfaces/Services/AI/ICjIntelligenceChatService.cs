using CjERP.Application.DTOs.CjIntelligence;

namespace CjERP.Application.Interfaces.Services.AI;

/// <summary>Resultado de una operacion de CJ Intelligence: datos o un error con codigo estable (el FE lo traduce).</summary>
public sealed record CjAiResult<T>
{
    private CjAiResult(T? value, string? errorCode, string? message, int status)
    {
        Value = value;
        ErrorCode = errorCode;
        Message = message;
        HttpStatus = status;
    }

    public T? Value { get; }

    public string? ErrorCode { get; }

    public string? Message { get; }

    public int HttpStatus { get; }

    public bool Ok => ErrorCode is null;

    public static CjAiResult<T> Success(T value) => new(value, null, null, 200);

    public static CjAiResult<T> Fail(string errorCode, string message, int status) => new(default, errorCode, message, status);
}

public static class CjAiErrorCodes
{
    public const string Disabled = "AI_DISABLED";
    public const string PermissionDenied = "AI_PERMISSION_DENIED";
    public const string InvalidRequest = "INVALID_REQUEST";
    public const string NotFound = "CONVERSATION_NOT_FOUND";
    public const string Busy = "CONVERSATION_BUSY";
    public const string TurnExhausted = "TURN_EXHAUSTED";
    public const string OpenAiUnavailable = "OPENAI_UNAVAILABLE";
    public const string SqlTimeout = "SQL_TIMEOUT";
    public const string ScopeMismatch = "SCOPE_MISMATCH";
    public const string Internal = "AI_INTERNAL_ERROR";
    public const string TurnTimeout = "TURN_TIMEOUT";
    /// <summary>Mismo ClientMessageId con otro contenido o en otra conversacion (409).</summary>
    public const string IdempotencyConflict = "IDEMPOTENCY_CONFLICT";
    /// <summary>Lo guardado excede los permisos vigentes del usuario (403). El FE ya traduce este codigo.</summary>
    public const string ScopeReduced = "UnauthorizedDataScope";
}

/// <summary>
/// Casos de uso de CJ Intelligence. TODOS reciben el nombre de usuario ya extraido del JWT por el controlador;
/// ninguno acepta identidad ni empleados desde el cuerpo de la peticion.
/// </summary>
public interface ICjIntelligenceChatService
{
    Task<CjAiResult<CjAiChatResponseDto>> ChatAsync(string login, CjAiChatRequestDto request, CancellationToken cancellationToken);

    Task<CjAiResult<List<CjAiConversationDto>>> ListarAsync(string login, int pagina, int tamano, CancellationToken cancellationToken);

    Task<CjAiResult<CjAiConversationDetailDto>> AbrirAsync(string login, string idConversacion, CancellationToken cancellationToken);

    Task<CjAiResult<bool>> RenombrarAsync(string login, string idConversacion, string titulo, CancellationToken cancellationToken);

    Task<CjAiResult<bool>> EliminarAsync(string login, string idConversacion, CancellationToken cancellationToken);
}
