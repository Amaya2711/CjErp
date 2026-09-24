using System.Security.Claims;
using CjERP.Application.DTOs.Mobile;
using CjERP.Application.Interfaces.Services;
using CjERP.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace CjERP.Api.Controllers;
[ApiController,Authorize,Route("api/mobile/comunicaciones")]
public sealed class MobileCommunicationController(IMobileCommunicationService service, ISharePointCommercialUploadService sharePoint) : ControllerBase
{
 [HttpGet] public async Task<IActionResult> Listar([FromQuery]MobileCommunicationListRequestDto request,CancellationToken ct){if(!Employee(out var emp))return Forbid();return Ok(new{success=true,data=await service.ListarAsync(emp,request,ct)});}
 [HttpGet("{id:long}")] public async Task<IActionResult> Obtener(long id,CancellationToken ct){if(!Employee(out var emp))return Forbid();var item=await service.ObtenerAsync(id,emp,ct);return item is null?NotFound(new{success=false,message="La comunicación no existe o no está disponible."}):Ok(new{success=true,data=item});}
 [HttpPost("{id:long}/leer")] public Task<IActionResult> Leer(long id,[FromBody]MobileCommunicationActionRequestDto? request,CancellationToken ct)=>Execute(id,request?.IdDispositivo,false,ct);
 [HttpPost("{id:long}/confirmar")] public Task<IActionResult> Confirmar(long id,[FromBody]MobileCommunicationActionRequestDto? request,CancellationToken ct)=>Execute(id,request?.IdDispositivo,true,ct);
 [HttpGet("pendientes")] public async Task<IActionResult> Pendientes(CancellationToken ct){if(!Employee(out var emp))return Forbid();return Ok(new{success=true,data=await service.PendientesObligatoriasAsync(emp,ct)});}
 [HttpGet("/api/mobile/notificaciones/resumen")] public async Task<IActionResult> Resumen(CancellationToken ct){if(!Employee(out var emp))return Forbid();return Ok(new{success=true,data=await service.ResumenAsync(emp,ct)});}
 [HttpGet("{id:long}/adjuntos")] public async Task<IActionResult> Adjuntos(long id,CancellationToken ct){if(!Employee(out var emp))return Forbid();return Ok(new{success=true,data=await service.ListarAdjuntosAsync(id,emp,ct)});}
 [HttpGet("{id:long}/adjuntos/{idAdjunto:long}/descargar")] public async Task<IActionResult> DescargarAdjunto(long id,long idAdjunto,CancellationToken ct){if(!Employee(out var emp))return Forbid();var adjunto=await service.ObtenerAdjuntoAsync(id,idAdjunto,emp,ct);if(adjunto is null)return NotFound(new{success=false,message="El adjunto no existe o no está disponible."});var bytes=await sharePoint.DownloadFileAsync(adjunto.RutaAlmacenamiento,ct);return File(bytes,string.IsNullOrWhiteSpace(adjunto.TipoContenido)?"application/octet-stream":adjunto.TipoContenido,adjunto.NombreArchivo);}
 private async Task<IActionResult> Execute(long id,long? device,bool confirm,CancellationToken ct){if(!Employee(out var emp))return Forbid();var result=confirm?await service.ConfirmarAsync(id,emp,device,ct):await service.MarcarLeidoAsync(id,emp,device,ct);return result.Resultado>0?Ok(new{success=true,message=result.Mensaje}):BadRequest(new{success=false,message=result.Mensaje??"No fue posible guardar el cambio."});}
    private bool Employee(out int id)=>int.TryParse(User.FindFirstValue("IdEmpleadoCj"),out id)&&id>0;
}
