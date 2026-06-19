namespace CjERP.Application.DTOs.IaChat;

public sealed class IaChatDashboardExportRequestDto
{
    public string Module { get; set; } = string.Empty;

    public string Question { get; set; } = string.Empty;

    public string ContextualSummary { get; set; } = string.Empty;

    public string? StructuredDataJson { get; set; }

    public string? ConversationId { get; set; }

    public string? ResponseType { get; set; }
}
