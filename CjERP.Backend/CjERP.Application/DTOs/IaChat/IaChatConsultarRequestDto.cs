namespace CjERP.Application.DTOs.IaChat;

public sealed class IaChatConsultarRequestDto
{
    public string Module { get; set; } = string.Empty;

    public string Question { get; set; } = string.Empty;

    public string? ConversationId { get; set; }

    public string? PresentationMode { get; set; }

    public IaChatImageAttachmentDto? Attachment { get; set; }
}

public sealed class IaChatImageAttachmentDto
{
    public string? FileName { get; set; }

    public string? MimeType { get; set; }

    public string? Base64Data { get; set; }
}
