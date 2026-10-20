using System.Security.Claims;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/sqlmonitor")]
[Authorize]
public class SqlMonitorController : ControllerBase
{
    private readonly ISqlMonitorService _sqlMonitorService;
    private readonly IActiveUserSessionService _activeUserSessionService;

    public SqlMonitorController(ISqlMonitorService sqlMonitorService, IActiveUserSessionService activeUserSessionService)
    {
        _sqlMonitorService = sqlMonitorService;
        _activeUserSessionService = activeUserSessionService;
    }

    /// <summary>Usuarios del ERP con actividad reciente (sesiones JWT en memoria del servidor).</summary>
    [HttpGet("usuarios-activos")]
    public IActionResult GetUsuariosActivos([FromQuery] int minutos = 10)
    {
        minutos = Math.Clamp(minutos, 1, 60);
        var ahora = DateTimeOffset.UtcNow;
        var usuarios = _activeUserSessionService
            .ListarUsuariosActivos(ahora.AddMinutes(-minutos))
            .Select(u => new
            {
                idUsuario = u.UserId,
                sesiones = u.Sesiones,
                ultimaActividadUtc = u.UltimaActividadUtc,
                minutosInactivo = (int)Math.Floor((ahora - u.UltimaActividadUtc).TotalMinutes),
            })
            .ToList();

        return Ok(new
        {
            success = true,
            message = "Usuarios activos obtenidos correctamente.",
            data = new { ventanaMinutos = minutos, total = usuarios.Count, usuarios },
        });
    }

    [HttpGet("resumen")]
    public async Task<IActionResult> GetResumen(CancellationToken cancellationToken)
    {
        var data = await _sqlMonitorService.ObtenerResumenAsync(cancellationToken);
        return Ok(new { success = true, message = "Resumen obtenido correctamente.", data });
    }

    [HttpGet("queries")]
    public async Task<IActionResult> GetQueries(CancellationToken cancellationToken)
    {
        var data = await _sqlMonitorService.ObtenerQueriesAsync(cancellationToken);
        return Ok(new { success = true, message = "Consultas obtenidas correctamente.", data });
    }

    [HttpGet("sesiones")]
    public async Task<IActionResult> GetSesionesActivas(CancellationToken cancellationToken)
    {
        var data = await _sqlMonitorService.ObtenerSesionesActivasAsync(cancellationToken);
        return Ok(new { success = true, message = "Sesiones activas obtenidas correctamente.", data });
    }

    [HttpGet("top-sql")]
    public async Task<IActionResult> GetTopSql([FromQuery] string? rango, CancellationToken cancellationToken)
    {
        var data = await _sqlMonitorService.ObtenerTopSqlAsync(rango, cancellationToken);
        return Ok(new { success = true, message = "Top SQL obtenido correctamente.", data });
    }

    [HttpGet("bloqueos")]
    public async Task<IActionResult> GetBloqueos(CancellationToken cancellationToken)
    {
        var data = await _sqlMonitorService.ObtenerBloqueosAsync(cancellationToken);
        return Ok(new { success = true, message = "Bloqueos obtenidos correctamente.", data });
    }

    [HttpGet("network")]
    public async Task<IActionResult> GetNetwork(CancellationToken cancellationToken)
    {
        var data = await _sqlMonitorService.ObtenerNetworkAsync(cancellationToken);
        return Ok(new { success = true, message = "Metricas de red obtenidas correctamente.", data });
    }

    [HttpGet("alertas")]
    public async Task<IActionResult> GetAlertas(
        [FromQuery] string? nivel,
        [FromQuery] string? tipoAlerta,
        [FromQuery] string? estado,
        [FromQuery] DateTime? fecha,
        CancellationToken cancellationToken)
    {
        var data = await _sqlMonitorService.ObtenerAlertasAsync(nivel, tipoAlerta, estado, fecha, cancellationToken);
        return Ok(new { success = true, message = "Alertas obtenidas correctamente.", data });
    }

    [HttpGet("overhead")]
    public async Task<IActionResult> GetOverhead(CancellationToken cancellationToken)
    {
        var data = await _sqlMonitorService.ObtenerOverheadAsync(cancellationToken);
        return Ok(new { success = true, message = "Overhead obtenido correctamente.", data });
    }

    [HttpGet("query/{id:long}")]
    public async Task<IActionResult> GetQueryDetalle(long id, CancellationToken cancellationToken)
    {
        if (id <= 0)
        {
            return BadRequest(new { success = false, message = "Id de query invalido." });
        }

        var data = await _sqlMonitorService.ObtenerQueryDetalleAsync(id, cancellationToken);
        if (data is null)
        {
            return NotFound(new { success = false, message = "No se encontro el detalle de la query solicitada." });
        }

        return Ok(new { success = true, message = "Detalle obtenido correctamente.", data });
    }

    [HttpPost("analizar/{id:long}")]
    public async Task<IActionResult> Analizar(long id, CancellationToken cancellationToken)
    {
        if (id <= 0)
        {
            return BadRequest(new { success = false, message = "Id de query invalido." });
        }

        var usuario = User.Identity?.Name
            ?? User.FindFirstValue(ClaimTypes.Name)
            ?? User.FindFirstValue(ClaimTypes.Upn)
            ?? User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue(ClaimTypes.NameIdentifier);

        var data = await _sqlMonitorService.AnalizarQueryAsync(id, usuario, cancellationToken);
        return Ok(new { success = true, message = "Analisis generado correctamente.", data });
    }

    [HttpPost("cancelar/{sessionId:int}")]
    public async Task<IActionResult> CancelarSesion(int sessionId, CancellationToken cancellationToken)
    {
        if (sessionId <= 0)
        {
            return BadRequest(new { success = false, message = "SessionId invalido." });
        }

        await _sqlMonitorService.CancelarSesionAsync(sessionId, cancellationToken);
        return Ok(new
        {
            success = true,
            message = $"Se solicito la cancelacion de la sesion {sessionId}."
        });
    }
}
