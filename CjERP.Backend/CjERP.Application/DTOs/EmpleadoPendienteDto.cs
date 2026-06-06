namespace CjERP.Application.DTOs;

public class EmpleadoPendienteBuscarRequestDto
{
    public int? IdPendiente { get; set; }
    public int? IdEmpleado { get; set; }
    public int? IdResponsable { get; set; }
    public int? IdEstado { get; set; }
    public DateTime? FechaInicio { get; set; }
    public DateTime? FechaFin { get; set; }
}

public class EmpleadoPendienteInsertRequestDto
{
    public int IdEmpleado { get; set; }
    public DateTime? FechaInicio { get; set; }
    public DateTime? FechaEstimacionTermino { get; set; }
    public DateTime? FechaRealTermino { get; set; }
    public int? IdEstado { get; set; }
    public string? Comentario { get; set; }
    public string? Observacion { get; set; }
    public int? IdResponsable { get; set; }
    public string? Ruta { get; set; }
    public string? UsuarioCreacion { get; set; }
}

public class EmpleadoPendienteUpdateRequestDto
{
    public int IdPendiente { get; set; }
    public int IdEmpleado { get; set; }
    public DateTime? FechaInicio { get; set; }
    public DateTime? FechaEstimacionTermino { get; set; }
    public DateTime? FechaRealTermino { get; set; }
    public int? IdEstado { get; set; }
    public string? Comentario { get; set; }
    public string? Observacion { get; set; }
    public int? IdResponsable { get; set; }
    public string? Ruta { get; set; }
    public string? UsuarioModificacion { get; set; }
}

public class EmpleadoPendienteCommandResultDto
{
    public int Resultado { get; set; }
    public int? IdPendiente { get; set; }
    public string Mensaje { get; set; } = string.Empty;
}

public class EmpleadoPendienteDto
{
    public int IdPendiente { get; set; }
    public int IdEmpleado { get; set; }
    public string NombreEmpleado { get; set; } = string.Empty;
    public DateTime? FechaInicio { get; set; }
    public DateTime? FechaEstimacionTermino { get; set; }
    public DateTime? FechaRealTermino { get; set; }
    public int? IdEstado { get; set; }
    public string Estado { get; set; } = string.Empty;
    public string Comentario { get; set; } = string.Empty;
    public string Observacion { get; set; } = string.Empty;
    public int? IdResponsable { get; set; }
    public string Responsable { get; set; } = string.Empty;
    public string Ruta { get; set; } = string.Empty;
    public int? IdActivo { get; set; }
    public string UsuarioCreacion { get; set; } = string.Empty;
    public DateTime? FechaCreacion { get; set; }
    public string UsuarioModificacion { get; set; } = string.Empty;
    public DateTime? FechaModificacion { get; set; }
}
