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
    public int? IdCargo { get; set; }
    public int? IdTipoEmpleado { get; set; }
    public int? IdEmpRel { get; set; }
    public int? IdEstado { get; set; }
    public bool? IdActivo { get; set; }
    public string FechaIniLaboral { get; set; } = string.Empty;
    public string FechaFinLaboral { get; set; } = string.Empty;
    public string FechaBaja { get; set; } = string.Empty;
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
}

public sealed class ContratoEmpleadoRenovarRequestDto
{
    public int IdEmpleado { get; set; }
    public string NuevaFechaFinLaboral { get; set; } = string.Empty;
    public string MotivoMovimiento { get; set; } = "RENOVACION";
    public string Observacion { get; set; } = string.Empty;
}
