namespace CjERP.Application.DTOs.IaChat;

public sealed class IaChatConsultarRequestDto
{
    public string Module { get; set; } = string.Empty;

    public string Question { get; set; } = string.Empty;

    public string? ConversationId { get; set; }
}
