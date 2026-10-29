using CjERP.Application.DTOs;
using CjERP.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CjERP.Api.Controllers;

[ApiController]
[Route("api/reportes/ventassunat")]
[Authorize]
public sealed class VentasSunatController : ControllerBase
{
    private readonly IVentasSunatService _service;

    public VentasSunatController(IVentasSunatService service)
    {
        _service = service;
    }

    [HttpPost("cargar")]
    public async Task<IActionResult> Cargar([FromBody] VentasSunatCargarRequestDto request, CancellationToken cancellationToken)
    {
        try
        {
            var usuario = User.FindFirst("NombreEmpleado")?.Value ?? User.FindFirst("IdUsuario")?.Value;
            var data = await _service.CargarAsync(request.Datos, usuario, cancellationToken);
            return Ok(new { success = true, message = "Registro de ventas cargado.", data });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = "Ocurrio un error interno al cargar las ventas.", detail = ex.Message });
        }
    }

    [HttpGet("periodos")]
    public async Task<IActionResult> ListarPeriodos(CancellationToken cancellationToken)
    {
        try
        {
            var data = await _service.ListarPeriodosAsync(cancellationToken);
            return Ok(new { success = true, message = "ok", data });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = "Ocurrio un error interno al listar los periodos.", detail = ex.Message });
        }
    }

    [HttpGet("clientes")]
    public async Task<IActionResult> ListarClientes(CancellationToken cancellationToken)
    {
        try
        {
            var data = await _service.ListarClientesAsync(cancellationToken);
            return Ok(new { success = true, message = "ok", data });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = "Ocurrio un error interno al listar los clientes.", detail = ex.Message });
        }
    }

    [HttpGet("anio")]
    public async Task<IActionResult> ConsultarAnio([FromQuery] string anio, CancellationToken cancellationToken)
    {
        try
        {
            var data = await _service.ConsultarAnioAsync(anio, cancellationToken);
            return Ok(new { success = true, message = "ok", data });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = "Ocurrio un error interno al consultar el anio.", detail = ex.Message });
        }
    }

    [HttpGet("periodo")]
    public async Task<IActionResult> ConsultarPeriodo([FromQuery] string periodo, [FromQuery] string rucEmisor, CancellationToken cancellationToken)
    {
        try
        {
            var data = await _service.ConsultarPeriodoAsync(periodo, rucEmisor, cancellationToken);
            return Ok(new { success = true, message = "ok", data });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = "Ocurrio un error interno al consultar el periodo.", detail = ex.Message });
        }
    }

    [HttpPost("validar")]
    public async Task<IActionResult> Validar([FromBody] VentasSunatValidarRequestDto request, CancellationToken cancellationToken)
    {
        try
        {
            var data = await _service.ValidarAsync(request.Lote, cancellationToken);
            return Ok(new { success = true, message = "Validacion completada.", data });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = "Ocurrio un error interno al validar las ventas.", detail = ex.Message });
        }
    }
}
