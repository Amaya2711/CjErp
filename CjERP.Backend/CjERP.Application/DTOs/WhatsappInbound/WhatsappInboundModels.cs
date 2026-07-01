using System.Text.Json.Serialization;

namespace CjERP.Application.DTOs.WhatsappInbound;

public sealed class WhatsappInboundSettings
{
    public bool Enabled { get; set; } = true;
    public string VerifyToken { get; set; } = "SET_VIA_ENVIRONMENT_OR_LOCAL_SETTINGS";
    public string ResponseMode { get; set; } = "wsp";
    public string ResponseProvider { get; set; } = "wup";
    public int DefaultRangeDays { get; set; } = 30;

    public bool HasVerifyTokenConfigured() =>
        !string.IsNullOrWhiteSpace(VerifyToken) &&
        !VerifyToken.Contains("SET_VIA_ENVIRONMENT_OR_LOCAL_SETTINGS", StringComparison.OrdinalIgnoreCase);
}

public sealed class MetaWhatsAppSettings
{
    public bool Enabled { get; set; }
    public string AccessToken { get; set; } = string.Empty;
    public string PhoneNumberId { get; set; } = string.Empty;
    public string GraphVersion { get; set; } = "v23.0";

    public bool HasConfiguredAccessToken() =>
        !string.IsNullOrWhiteSpace(AccessToken) &&
        !AccessToken.Contains("SET_VIA_ENVIRONMENT_OR_LOCAL_SETTINGS", StringComparison.OrdinalIgnoreCase);

    public bool HasConfiguredPhoneNumberId() =>
        !string.IsNullOrWhiteSpace(PhoneNumberId) &&
        !PhoneNumberId.Contains("SET_VIA_ENVIRONMENT_OR_LOCAL_SETTINGS", StringComparison.OrdinalIgnoreCase);

    public bool IsReady() => Enabled && HasConfiguredAccessToken() && HasConfiguredPhoneNumberId();
}

public sealed class WhatsappWebhookPayloadDto
{
    [JsonPropertyName("object")]
    public string Object { get; set; } = string.Empty;

    [JsonPropertyName("entry")]
    public IReadOnlyList<WhatsappWebhookEntryDto> Entry { get; set; } = Array.Empty<WhatsappWebhookEntryDto>();
}

public sealed class WhatsappWebhookEntryDto
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("changes")]
    public IReadOnlyList<WhatsappWebhookChangeDto> Changes { get; set; } = Array.Empty<WhatsappWebhookChangeDto>();
}

public sealed class WhatsappWebhookChangeDto
{
    [JsonPropertyName("field")]
    public string Field { get; set; } = string.Empty;

    [JsonPropertyName("value")]
    public WhatsappWebhookValueDto? Value { get; set; }
}

public sealed class WhatsappWebhookValueDto
{
    [JsonPropertyName("messaging_product")]
    public string MessagingProduct { get; set; } = string.Empty;

    [JsonPropertyName("metadata")]
    public WhatsappWebhookMetadataDto? Metadata { get; set; }

    [JsonPropertyName("contacts")]
    public IReadOnlyList<WhatsappWebhookContactDto> Contacts { get; set; } = Array.Empty<WhatsappWebhookContactDto>();

    [JsonPropertyName("messages")]
    public IReadOnlyList<WhatsappWebhookMessageDto> Messages { get; set; } = Array.Empty<WhatsappWebhookMessageDto>();

    [JsonPropertyName("statuses")]
    public IReadOnlyList<WhatsappWebhookStatusDto> Statuses { get; set; } = Array.Empty<WhatsappWebhookStatusDto>();
}

public sealed class WhatsappWebhookMetadataDto
{
    [JsonPropertyName("display_phone_number")]
    public string DisplayPhoneNumber { get; set; } = string.Empty;

    [JsonPropertyName("phone_number_id")]
    public string PhoneNumberId { get; set; } = string.Empty;
}

public sealed class WhatsappWebhookContactDto
{
    [JsonPropertyName("wa_id")]
    public string WaId { get; set; } = string.Empty;

    [JsonPropertyName("profile")]
    public WhatsappWebhookProfileDto? Profile { get; set; }
}

public sealed class WhatsappWebhookProfileDto
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
}

public sealed class WhatsappWebhookMessageDto
{
    [JsonPropertyName("from")]
    public string From { get; set; } = string.Empty;

    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("timestamp")]
    public string Timestamp { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("text")]
    public WhatsappWebhookTextDto? Text { get; set; }

    [JsonPropertyName("button")]
    public WhatsappWebhookButtonDto? Button { get; set; }

    [JsonPropertyName("interactive")]
    public WhatsappWebhookInteractiveDto? Interactive { get; set; }
}

public sealed class WhatsappWebhookTextDto
{
    [JsonPropertyName("body")]
    public string Body { get; set; } = string.Empty;
}

public sealed class WhatsappWebhookButtonDto
{
    [JsonPropertyName("text")]
    public string Text { get; set; } = string.Empty;

    [JsonPropertyName("payload")]
    public string Payload { get; set; } = string.Empty;
}

public sealed class WhatsappWebhookInteractiveDto
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("button_reply")]
    public WhatsappWebhookInteractiveReplyDto? ButtonReply { get; set; }

    [JsonPropertyName("list_reply")]
    public WhatsappWebhookInteractiveReplyDto? ListReply { get; set; }
}

public sealed class WhatsappWebhookInteractiveReplyDto
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;
}

public sealed class WhatsappWebhookStatusDto
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;
}

public sealed class WhatsappInboundProcessResultDto
{
    public bool Received { get; set; }
    public int MessagesDetected { get; set; }
    public int ResponsesSent { get; set; }
    public IReadOnlyList<string> Actions { get; set; } = Array.Empty<string>();
}

public sealed class MetaWhatsAppSendTextRequestDto
{
    public string To { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? PhoneNumberId { get; set; }
}

public sealed class MetaWhatsAppSendDocumentRequestDto
{
    public string To { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string Caption { get; set; } = string.Empty;
    public byte[] FileBytes { get; set; } = Array.Empty<byte>();
    public string ContentType { get; set; } = "application/pdf";
    public string? PhoneNumberId { get; set; }
}

public sealed class MetaWhatsAppSendResponseDto
{
    public bool Success { get; set; }
    public int StatusCode { get; set; }
    public string ResponseBody { get; set; } = string.Empty;
    public string ErrorMessage { get; set; } = string.Empty;
}
