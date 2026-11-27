using CjERP.Api.Authorization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers.Mobile;

/// <summary>
/// Punto de entrada de la app móvil de logística. Solo confirma que el usuario autenticado
/// (app MOB_LOGISTICA) tiene permiso sobre el menú MOB_LOG_DESPACHOS. Los endpoints de
/// despacho se agregan aquí con [RequiereMenu] cuando se defina el flujo.
/// </summary>
[ApiController, Authorize, Route("api/mobile/logistica")]
public sealed class MobileLogisticaAccesoController : ControllerBase
{
    [HttpGet("acceso")]
    [RequiereMenu("MOB_LOGISTICA", "MOB_LOG_DESPACHOS", MenuAccion.Ver)]
    public IActionResult Acceso()
    {
        return Ok(new
        {
            success = true,
            message = "Acceso permitido.",
            data = new
            {
                idUsuario = User.FindFirst("IdUsuario")?.Value,
                nombreEmpleado = User.FindFirst("NombreEmpleado")?.Value
            }
        });
    }
}
