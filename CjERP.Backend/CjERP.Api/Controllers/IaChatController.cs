using System.Security.Claims;
using CjERP.Application.DTOs.IaChat;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/ia-chat")]
[Authorize]
public sealed class IaChatController : ControllerBase
{
    private readonly IIaChatService _iaChatService;

    public IaChatController(
        IIaChatService iaChatService)
    {
        _iaChatService = iaChatService;
    }

    [HttpPost("consultar")]
    public async Task<IActionResult> Consultar(
        [FromBody] IaChatConsultarRequestDto request,
        CancellationToken cancellationToken)
    {
        if (request is null)
        {
            return BadRequest(new IaChatResponseDto
            {
                Success = false,
                Module = "GASTOS",
                ErrorMessage = "La solicitud no puede venir vacia."
            });
        }

        var usuarioId = User.FindFirstValue("IdUsuario")
            ?? User.FindFirstValue(ClaimTypes.Name)
            ?? User.Identity?.Name;

        var response = await _iaChatService.ConsultarAsync(request, usuarioId, cancellationToken);

        if (!response.Success)
        {
            return BadRequest(response);
        }

        return Ok(response);
    }
}
