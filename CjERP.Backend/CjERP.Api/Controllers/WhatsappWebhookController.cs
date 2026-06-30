using CjERP.Application.DTOs.WhatsappInbound;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/whatsapp/webhook")]
[AllowAnonymous]
public sealed class WhatsappWebhookController : ControllerBase
{
    private readonly IWhatsappInboundService _whatsappInboundService;

    public WhatsappWebhookController(IWhatsappInboundService whatsappInboundService)
    {
        _whatsappInboundService = whatsappInboundService;
    }

    [HttpGet]
    public IActionResult Verify(
        [FromQuery(Name = "hub.mode")] string? mode,
        [FromQuery(Name = "hub.verify_token")] string? verifyToken,
        [FromQuery(Name = "hub.challenge")] string? challenge)
    {
        if (!string.Equals(mode, "subscribe", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest("Invalid mode");
        }

        if (!_whatsappInboundService.IsVerificationTokenValid(verifyToken))
        {
            return Unauthorized();
        }

        return Content(challenge ?? string.Empty, "text/plain");
    }

    [HttpPost]
    public async Task<IActionResult> Receive(
        [FromBody] WhatsappWebhookPayloadDto payload,
        CancellationToken cancellationToken)
    {
        var result = await _whatsappInboundService.ProcesarWebhookAsync(payload, cancellationToken);
        return Ok(new
        {
            success = true,
            message = "Webhook recibido.",
            data = result
        });
    }
}
