using CjERP.Application.DTOs.WhatsappInbound;

namespace CjERP.Application.Interfaces.Services;

public interface IWhatsappInboundService
{
    bool IsVerificationTokenValid(string? verifyToken);
    Task<WhatsappInboundProcessResultDto> ProcesarWebhookAsync(WhatsappWebhookPayloadDto? payload, CancellationToken cancellationToken = default);
}

public interface IMetaWhatsAppService
{
    Task<MetaWhatsAppSendResponseDto> SendTextAsync(MetaWhatsAppSendTextRequestDto request, CancellationToken cancellationToken = default);
    Task<MetaWhatsAppSendResponseDto> SendDocumentAsync(MetaWhatsAppSendDocumentRequestDto request, CancellationToken cancellationToken = default);
    Task<MetaWhatsAppSendResponseDto> SendReplyButtonsAsync(MetaWhatsAppSendReplyButtonsRequestDto request, CancellationToken cancellationToken = default);
}
