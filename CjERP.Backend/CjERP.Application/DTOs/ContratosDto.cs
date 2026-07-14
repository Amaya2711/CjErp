namespace CjERP.Application.DTOs;

public sealed class ContratoEmpleadoDetalleDto
{
    public int IdEmpleado { get; set; }
    public string NombreEmpleado { get; set; } = string.Empty;
    public string NroDocumento { get; set; } = string.Empty;
    public string Correo { get; set; } = string.Empty;
    public string Telefono { get; set; } = string.Empty;
    public string Empresa { get; set; } = string.Empty;
    public string Cliente { get; set; } = string.Empty;
    public string Area { get; set; } = string.Empty;
    public string Ubicacion { get; set; } = string.Empty;
    public string Direccion { get; set; } = string.Empty;
    public int? IdCargo { get; set; }
    public int? IdTipoEmpleado { get; set; }
    public int? IdEmpRel { get; set; }
    public int? IdEstado { get; set; }
    public bool? IdActivo { get; set; }
    public string FechaIniLaboral { get; set; } = string.Empty;
    public string FechaFinLaboral { get; set; } = string.Empty;
    public string FechaBaja { get; set; } = string.Empty;
    public string? MesesN { get; set; }
    public string? NuevaFechaFinLaboral { get; set; }
    public string? Aprobacion1Fecha { get; set; }
    public string? Aprobacion2Fecha { get; set; }
    public string? Aprobacion3Fecha { get; set; }
}

public sealed class ContratoEmpleadoHistorialDto
{
    public int IdHistorialLaboral { get; set; }
    public int IdEmpleado { get; set; }
    public string FechaIniLaboral { get; set; } = string.Empty;
    public string FechaFinLaboral { get; set; } = string.Empty;
    public string FechaBaja { get; set; } = string.Empty;
    public int? IdEstado { get; set; }
    public bool? IdActivo { get; set; }
    public int? IdTipoEmpleado { get; set; }
    public int? IdCargo { get; set; }
    public int? IdEmpRel { get; set; }
    public string MotivoMovimiento { get; set; } = string.Empty;
    public string TipoMovimiento { get; set; } = string.Empty;
    public string Observacion { get; set; } = string.Empty;
    public string UsuarioCre { get; set; } = string.Empty;
    public string FechaCreacion { get; set; } = string.Empty;
}

public sealed class ContratoEmpleadoResponseDto
{
    public ContratoEmpleadoDetalleDto? Empleado { get; set; }
    public IReadOnlyList<ContratoEmpleadoHistorialDto> Historial { get; set; } = Array.Empty<ContratoEmpleadoHistorialDto>();
    public ContratoEmpleadoSolicitudVigenciaDto? SolicitudVigencia { get; set; }
}

public sealed class ContratoEmpleadoRenovarRequestDto
{
    public int IdEmpleado { get; set; }
    public string NuevaFechaFinLaboral { get; set; } = string.Empty;
    public string MotivoMovimiento { get; set; } = "RENOVACION";
    public string Observacion { get; set; } = string.Empty;
}

public sealed class ContratoEmpleadoAprobarVigenciaRequestDto
{
    public string Observacion { get; set; } = string.Empty;
    public int NivelAprobacion { get; set; }
}

public sealed class ContratoPlantillaGenerarRequestDto
{
    public string DocumentPath { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public Dictionary<string, string> Replacements { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class ContratoEmpleadoSolicitudVigenciaDto
{
    public int IdSolicitudVigencia { get; set; }
    public int IdEmpleado { get; set; }
    public string FechaFinActual { get; set; } = string.Empty;
    public string NuevaFechaFinLaboral { get; set; } = string.Empty;
    public string EstadoSolicitud { get; set; } = string.Empty;
    public int AprobacionesRealizadas { get; set; }
    public int AprobacionesRequeridas { get; set; } = 3;
    public int? Aprobacion1IdEmpleado { get; set; }
    public int? Aprobacion2IdEmpleado { get; set; }
    public int? Aprobacion3IdEmpleado { get; set; }
    public string? Aprobacion1Usuario { get; set; }
    public string? Aprobacion2Usuario { get; set; }
    public string? Aprobacion3Usuario { get; set; }
    public string? Aprobacion1Observacion { get; set; }
    public string? Aprobacion2Observacion { get; set; }
    public string? Aprobacion3Observacion { get; set; }
    public string? Aprobacion1Fecha { get; set; }
    public string? Aprobacion2Fecha { get; set; }
    public string? Aprobacion3Fecha { get; set; }
    public string? UsuarioCre { get; set; }
    public string? FechaCreacion { get; set; }
    public string? UsuarioMod { get; set; }
    public string? FechaMod { get; set; }
}
