using CjERP.Application.DTOs.WhatsappInbound;

namespace CjERP.Application.Interfaces.Services;

public interface IWhatsappInboundService
{
    bool IsVerificationTokenValid(string? verifyToken);
    Task<WhatsappInboundProcessResultDto> ProcesarWebhookAsync(WhatsappWebhookPayloadDto? payload, CancellationToken cancellationToken = default);
}
