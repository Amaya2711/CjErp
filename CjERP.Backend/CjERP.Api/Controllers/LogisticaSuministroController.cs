using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using CjERP.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/operacion/suministro")]
[Authorize]
public class LogisticaSuministroController : ControllerBase
{
    private readonly ILogisticaSuministroService _logisticaSuministroService;
    private readonly ISharePointCommercialUploadService _sharePointCommercialUploadService;

    public LogisticaSuministroController(
        ILogisticaSuministroService logisticaSuministroService,
        ISharePointCommercialUploadService sharePointCommercialUploadService)
    {
        _logisticaSuministroService = logisticaSuministroService;
        _sharePointCommercialUploadService = sharePointCommercialUploadService;
    }

    public class UploadImagenSuministroRequest
    {
        public IFormFile? Archivo { get; set; }
        public string Correlativo { get; set; } = string.Empty;
        public string IdSite { get; set; } = string.Empty;
        public string Comentario { get; set; } = string.Empty;
    }

    [HttpPost("buscar")]
    public async Task<IActionResult> Buscar(
        [FromBody] LogisticaSuministroBuscarRequestDto request,
        CancellationToken cancellationToken)
    {
        var data = await _logisticaSuministroService.BuscarAsync(request, cancellationToken);
        return Ok(new { success = true, message = "ok", data });
    }

    [HttpPost("insertar")]
    public async Task<IActionResult> Insertar(
        [FromBody] LogisticaSuministroInsertRequestDto request,
        CancellationToken cancellationToken)
    {
        var validation = ValidateRequest(
            request.IdCliente,
            request.IdProyecto,
            request.IdSite,
            request.Correlativo);
        if (validation is not null)
        {
            return BadRequest(new { success = false, message = validation });
        }

        var id = await _logisticaSuministroService.InsertarAsync(request, cancellationToken);
        return Ok(new
        {
            success = true,
            message = "Suministro registrado correctamente.",
            data = new
            {
                idSuministro = id,
                correlativo = request.Correlativo
            }
        });
    }

    [HttpPost("actualizar")]
    public async Task<IActionResult> Actualizar(
        [FromBody] LogisticaSuministroUpdateRequestDto request,
        CancellationToken cancellationToken)
    {
        var validation = ValidateRequest(
            request.IdCliente,
            request.IdProyecto,
            request.IdSite,
            request.Correlativo);
        if (validation is not null)
        {
            return BadRequest(new { success = false, message = validation });
        }

        await _logisticaSuministroService.ActualizarAsync(request, cancellationToken);
        return Ok(new { success = true, message = "Suministro actualizado correctamente." });
    }

    [HttpPost("upload-imagen")]
    [RequestSizeLimit(10_000_000)]
    public async Task<IActionResult> UploadImagen(
        [FromForm] UploadImagenSuministroRequest request,
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
                    null,
                    request.IdSite,
                    request.Correlativo,
                    request.Comentario,
                    null,
                    "suministros",
                    "suministro"),
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

    private static string? ValidateRequest(
        int idCliente,
        int idProyecto,
        string? idSite,
        int? correlativo)
    {
        if (idCliente <= 0)
        {
            return "Cliente es obligatorio.";
        }

        if (idProyecto <= 0)
        {
            return "Proyecto es obligatorio.";
        }

        if (string.IsNullOrWhiteSpace(idSite))
        {
            return "Site es obligatorio.";
        }

        return null;
    }
}
