using System.Security.Claims;
using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/tesoreria/cheques")]
[Authorize]
public class TesoreriaChequesController : ControllerBase
{
    private readonly IChequeEmpleadoService _chequeEmpleadoService;
    private readonly ISharePointCommercialUploadService _sharePointCommercialUploadService;

    public TesoreriaChequesController(
        IChequeEmpleadoService chequeEmpleadoService,
        ISharePointCommercialUploadService sharePointCommercialUploadService)
    {
        _chequeEmpleadoService = chequeEmpleadoService;
        _sharePointCommercialUploadService = sharePointCommercialUploadService;
    }

    public class UploadChequeImagenRequest
    {
        public IFormFile? Archivo { get; set; }
        public int? IdCheque { get; set; }
        public string? NroCheque { get; set; }
        public int? IdEmpleado { get; set; }
    }

    [HttpGet]
    public async Task<IActionResult> Listar(
        [FromQuery] int? idEmpleado,
        [FromQuery] int? idEstado,
        CancellationToken cancellationToken)
    {
        var data = await _chequeEmpleadoService.ListarAsync(
            new ChequeEmpleadoFiltroDto
            {
                IdEmpleado = idEmpleado,
                IdEstado = idEstado
            },
            cancellationToken);

        return Ok(new { success = true, message = "ok", data });
    }

    [HttpGet("{idCheque:int}")]
    public async Task<IActionResult> Obtener(int idCheque, CancellationToken cancellationToken)
    {
        var data = await _chequeEmpleadoService.ObtenerAsync(idCheque, cancellationToken);
        if (data is null)
        {
            return NotFound(new { success = false, message = "No se encontro el cheque solicitado." });
        }

        return Ok(new { success = true, message = "ok", data });
    }

    [HttpPost]
    public async Task<IActionResult> Crear([FromBody] ChequeEmpleadoGuardarDto request, CancellationToken cancellationToken)
    {
        try
        {
            request.UsuarioAccion = ResolveUsuarioAccion(request.UsuarioAccion);
            var result = await _chequeEmpleadoService.CrearAsync(request, cancellationToken);
            return Ok(new { success = true, message = "Cheque creado correctamente.", data = result.Row });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
    }

    [HttpPut("{idCheque:int}")]
    public async Task<IActionResult> Actualizar(
        int idCheque,
        [FromBody] ChequeEmpleadoGuardarDto request,
        CancellationToken cancellationToken)
    {
        try
        {
            request.IdCheque = idCheque;
            request.UsuarioAccion = ResolveUsuarioAccion(request.UsuarioAccion);
            var result = await _chequeEmpleadoService.ActualizarAsync(request, cancellationToken);
            return Ok(new { success = true, message = "Cheque actualizado correctamente.", data = result.Row });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
    }

    [HttpPost("{idCheque:int}/rechazar")]
    public async Task<IActionResult> Rechazar(
        int idCheque,
        [FromBody] ChequeEmpleadoRechazarDto request,
        CancellationToken cancellationToken)
    {
        try
        {
            request.UsuarioAccion = ResolveUsuarioAccion(request.UsuarioAccion);
            var result = await _chequeEmpleadoService.RechazarAsync(idCheque, request, cancellationToken);
            return Ok(new { success = true, message = "Cheque rechazado correctamente.", data = result.Row });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
    }

    [HttpPost("upload-imagen")]
    [RequestSizeLimit(10_000_000)]
    public async Task<IActionResult> UploadImagen(
        [FromForm] UploadChequeImagenRequest request,
        CancellationToken cancellationToken)
    {
        if (request.Archivo is null)
        {
            return BadRequest(new { success = false, message = "Debe seleccionar una imagen." });
        }

        try
        {
            var uploadResult = await _sharePointCommercialUploadService.UploadExpenseInvoiceAsync(
                request.Archivo,
                new ExpenseInvoiceUploadContext(
                    request.IdCheque,
                    request.IdEmpleado?.ToString(),
                    request.NroCheque,
                    request.IdEmpleado?.ToString(),
                    "tesoreria/cheques",
                    "cheques",
                    "cheque"),
                cancellationToken);

            return Ok(new
            {
                success = true,
                message = "Imagen cargada correctamente.",
                data = new
                {
                    fileName = uploadResult.FileName,
                    fileUrl = uploadResult.FileUrl,
                    storagePath = uploadResult.StoragePath
                }
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
    }

    private string ResolveUsuarioAccion(string? usuarioAccion)
    {
        if (!string.IsNullOrWhiteSpace(usuarioAccion))
        {
            return usuarioAccion.Trim();
        }

        return User.FindFirstValue("IdUsuario")
            ?? User.FindFirstValue(ClaimTypes.Name)
            ?? User.Identity?.Name
            ?? "sistema";
    }
}
