using System.Security.Claims;
using CjERP.Application.DTOs.Mobile;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace CjERP.Api.Controllers;
[ApiController,Authorize,Route("api/mobile/dispositivos")]
public sealed class MobileDeviceController(IMobileDeviceService service) : ControllerBase
{ [HttpPost("registrar")] public async Task<IActionResult> Registrar([FromBody]MobileDeviceRegistrationDto req,CancellationToken ct){if(!Identity(out var emp,out var user))return Forbid();if(string.IsNullOrWhiteSpace(req.DeviceId)||string.IsNullOrWhiteSpace(req.PushToken)||string.IsNullOrWhiteSpace(req.Plataforma))return BadRequest(new{success=false,message="Datos de dispositivo incompletos."});var result=await service.RegistrarAsync(emp,user,req,ct);return result.Resultado>0?Ok(new{success=true,message=result.Mensaje}):BadRequest(new{success=false,message=result.Mensaje});} [HttpPost("desactivar")] public async Task<IActionResult> Desactivar([FromBody]MobileDeviceDeactivateDto req,CancellationToken ct){if(!Identity(out var emp,out var user))return Forbid();if(string.IsNullOrWhiteSpace(req.DeviceId))return BadRequest(new{success=false,message="DeviceId es obligatorio."});var result=await service.DesactivarAsync(emp,user,req.DeviceId.Trim(),ct);return result.Resultado>0?Ok(new{success=true,message=result.Mensaje}):BadRequest(new{success=false,message=result.Mensaje});} private bool Identity(out int emp,out string user){user=User.FindFirstValue("IdUsuario")??string.Empty;return int.TryParse(User.FindFirstValue("IdEmpleadoCj"),out emp)&&emp>0&&!string.IsNullOrWhiteSpace(user);} }
