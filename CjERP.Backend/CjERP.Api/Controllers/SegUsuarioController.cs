using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/usuarios")]
[Authorize]
public class SegUsuarioController : ControllerBase
{
    private readonly ISegUsuarioService _segUsuarioService;

    public SegUsuarioController(ISegUsuarioService segUsuarioService)
    {
        _segUsuarioService = segUsuarioService;
    }

    [HttpGet]
    public async Task<IActionResult> Listar()
    {
        var result = await _segUsuarioService.ListarAsync();
        return Ok(result);
    }
}
