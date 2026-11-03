using CjERP.Application.DTOs.CjIntelligence;
using CjERP.Application.Interfaces.Services.AI;
using CjERP.Infrastructure.Services.AI.CjIntelligence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

/// <summary>
/// CJ Intelligence (pagos). Contrato esperado por cjerp-frontend/src/features/cj-intelligence/services/aiService.ts.
/// - La identidad sale SOLO del claim "IdUsuario" del JWT validado (CjIntelligenceIdentity); nunca del cuerpo ni de la URL.
/// - Mientras el modulo no este registrado/configurado (AddCjIntelligence), todos los endpoints responden "deshabilitado"
///   y /status devuelve enabled = false: la pagina muestra el aviso en vez de fallar.
/// - El chat anterior (/api/ia-chat) no se toca.
/// </summary>
[ApiController]
[Route("api/ai")]
[Authorize]
public sealed class CjIntelligenceController : ControllerBase
{
    private readonly IServiceProvider _services;

    public CjIntelligenceController(IServiceProvider services)
    {
        _services = services;
    }

    [HttpGet("status")]
    public IActionResult Status()
    {
        var enabled = _services.GetService(typeof(ICjIntelligenceChatService)) is not null;
        var available = enabled && CjIntelligenceIdentity.TryGetLogin(User, out var statusLogin) && EsUsuarioPermitido(statusLogin);
        return Ok(new { success = true, data = new CjAiStatusDto { Enabled = enabled, Available = available } });
    }

    [HttpPost("chat")]
    [RequestSizeLimit(32768)]
    public async Task<IActionResult> Chat([FromBody] CjAiChatRequestDto request, CancellationToken cancellationToken)
    {
        if (!TryPrepare(out var service, out var login, out var error)) return error!;
        return ToActionResult(await service!.ChatAsync(login, request ?? new CjAiChatRequestDto(), cancellationToken));
    }

    [HttpGet("conversations")]
    public async Task<IActionResult> Listar([FromQuery] int pagina = 1, [FromQuery] int tamano = 30, CancellationToken cancellationToken = default)
    {
        if (!TryPrepare(out var service, out var login, out var error)) return error!;
        return ToActionResult(await service!.ListarAsync(login, pagina, tamano, cancellationToken));
    }

    [HttpGet("conversations/{id}")]
    public async Task<IActionResult> Abrir(string id, CancellationToken cancellationToken)
    {
        if (!TryPrepare(out var service, out var login, out var error)) return error!;
        return ToActionResult(await service!.AbrirAsync(login, id, cancellationToken));
    }

    [HttpPut("conversations/{id}/titulo")]
    public async Task<IActionResult> Renombrar(string id, [FromBody] CjAiRenameRequestDto request, CancellationToken cancellationToken)
    {
        if (!TryPrepare(out var service, out var login, out var error)) return error!;
        return ToActionResult(await service!.RenombrarAsync(login, id, request?.Titulo ?? string.Empty, cancellationToken));
    }

    [HttpDelete("conversations/{id}")]
    public async Task<IActionResult> Eliminar(string id, CancellationToken cancellationToken)
    {
        if (!TryPrepare(out var service, out var login, out var error)) return error!;
        return ToActionResult(await service!.EliminarAsync(login, id, cancellationToken));
    }

    private bool TryPrepare(out ICjIntelligenceChatService? service, out string login, out IActionResult? error)
    {
        login = string.Empty;
        error = null;
        service = _services.GetService(typeof(ICjIntelligenceChatService)) as ICjIntelligenceChatService;
        if (service is null)
        {
            error = StatusCode(503, new { success = false, message = "CJ Intelligence esta deshabilitado en este entorno.", errorCode = CjAiErrorCodes.Disabled });
            return false;
        }

        if (!CjIntelligenceIdentity.TryGetLogin(User, out login))
        {
            error = StatusCode(403, new { success = false, message = "Identidad no valida.", errorCode = CjAiErrorCodes.PermissionDenied });
            return false;
        }

        if (!EsUsuarioPermitido(login))
        {
            error = StatusCode(403, new { success = false, message = "No tiene acceso a CJ Intelligence.", errorCode = CjAiErrorCodes.PermissionDenied });
            return false;
        }

        return true;
    }

    // Lanzamiento restringido (CjIntelligence:UsuariosPermitidos). Las opciones se registran junto con el servicio (AddCjIntelligence);
    // sin opciones registradas no hay restriccion adicional (solo ocurre en pruebas con un servicio doble).
    private bool EsUsuarioPermitido(string login) =>
        _services.GetService(typeof(CjIntelligenceOptions)) is not CjIntelligenceOptions options || options.EsUsuarioPermitido(login);

    private IActionResult ToActionResult<T>(CjAiResult<T> result) =>
        result.Ok
            ? Ok(new { success = true, data = result.Value })
            : StatusCode(result.HttpStatus, new { success = false, message = result.Message, errorCode = result.ErrorCode });
}
