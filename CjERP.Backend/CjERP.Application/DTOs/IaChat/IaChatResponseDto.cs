namespace CjERP.Application.DTOs.IaChat;

public sealed class IaChatResponseDto
{
    public bool Success { get; set; }

    public string Module { get; set; } = "GASTOS";

    public string Answer { get; set; } = string.Empty;

    public string ResponseType { get; set; } = "conversation";

    public Dictionary<string, object?>? InterpretedFilters { get; set; }

    public List<Dictionary<string, object?>>? DetailRows { get; set; }

    public Dictionary<string, object?>? Summary { get; set; }

    public IaChatChartResponseDto? Chart { get; set; }

    public int? TotalRows { get; set; }

    public string? ErrorMessage { get; set; }

    // Fase 2 (docs/AI_COPILOT_IMPLEMENTATION_PLAN.md): el backend genera y valida el ID de
    // conversacion — este campo le informa al cliente cual usar en el siguiente turno. Antes de
    // este cambio el cliente generaba su propio ID (crypto.randomUUID en iachat.tsx) y el backend
    // lo adoptaba ciegamente; el frontend debe migrar a adoptar este valor (cambio coordinado,
    // pendiente, no incluido en esta sesion).
    public string? ConversationId { get; set; }

    // Fase 2: campos NO disponibles por permisos (p.ej. las columnas globales de site/OC cuando la cuenta no
    // tiene el permiso de totales globales). Un campo listado aqui no esta en las filas y NO equivale a
    // cero. null/vacio = todos los campos disponibles.
    public List<string>? UnavailableFields { get; set; }
}
