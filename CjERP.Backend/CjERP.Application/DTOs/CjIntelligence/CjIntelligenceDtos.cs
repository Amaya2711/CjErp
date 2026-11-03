namespace CjERP.Application.DTOs.CjIntelligence;

// Contrato de CJ Intelligence. Las formas de AiChatResponse / AiConversation / AiConversationDetail / AiStatus
// coinciden con cjerp-frontend/src/features/cj-intelligence/types.ts (JSON camelCase).

public sealed class CjAiChatRequestDto
{
    public string? Message { get; set; }

    /// <summary>GUID de una conversacion existente del usuario; vacio = crear una nueva.</summary>
    public string? ConversationId { get; set; }

    /// <summary>OBLIGATORIO. GUID generado por el navegador por peticion; unico por usuario. Reenviar el MISMO valor (y el mismo contenido)
    /// al reintentar evita duplicados; reutilizarlo con otro contenido o en otra conversacion devuelve un conflicto (409).</summary>
    public string? ClientMessageId { get; set; }
}

public sealed class CjAiResultRefDto
{
    public long IdResultado { get; set; }

    public string Herramienta { get; set; } = string.Empty;

    public DateTime FechaConsultaUtc { get; set; }

    public int? Filas { get; set; }

    public bool Truncado { get; set; }

    public string? HashResultado { get; set; }

    /// <summary>consulta_nueva | resultado_guardado: distingue datos recien consultados de datos de un turno anterior.</summary>
    public string Fuente { get; set; } = "consulta_nueva";
}

public sealed class CjAiChatResponseDto
{
    public string Answer { get; set; } = string.Empty;

    public string AnalysisType { get; set; } = "pagos";

    public string SuggestedVisualization { get; set; } = "none";

    public List<Dictionary<string, object?>> Data { get; set; } = [];

    public int QueriesExecuted { get; set; }

    public long ExecutionTimeMs { get; set; }

    public List<string> Warnings { get; set; } = [];

    public string ConversationId { get; set; } = string.Empty;

    public long TurnId { get; set; }

    /// <summary>true cuando se devolvio la respuesta ya guardada de una peticion repetida (sin volver a consultar).</summary>
    public bool Replayed { get; set; }

    public List<CjAiResultRefDto> Results { get; set; } = [];
}

public sealed class CjAiConversationDto
{
    public string IdConversacion { get; set; } = string.Empty;

    /// <summary>Nombre de usuario (dbo.Usuario.IdUsuario).</summary>
    public string IdUsuario { get; set; } = string.Empty;

    public string? Titulo { get; set; }

    public DateTime FechaCreacion { get; set; }

    public DateTime FechaUltimoMensaje { get; set; }

    public bool IdActivo { get; set; } = true;
}

public sealed class CjAiMessageDto
{
    public string Role { get; set; } = string.Empty;

    public string? Content { get; set; }

    public DateTime? Fecha { get; set; }

    public int? Secuencia { get; set; }

    /// <summary>true cuando el contenido original se sustituyo por un aviso porque excede los permisos vigentes del usuario.</summary>
    public bool Omitted { get; set; }
}

public sealed class CjAiConversationDetailDto
{
    public CjAiConversationDto Conversation { get; set; } = new();

    public List<CjAiMessageDto> Messages { get; set; } = [];

    public List<CjAiResultRefDto> Results { get; set; } = [];
}

public sealed class CjAiStatusDto
{
    public bool Enabled { get; set; }

    public bool Available { get; set; }
}

public sealed class CjAiRenameRequestDto
{
    public string? Titulo { get; set; }
}
