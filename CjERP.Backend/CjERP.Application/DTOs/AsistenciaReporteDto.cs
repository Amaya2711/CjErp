namespace CjERP.Application.DTOs;

public class AsistenciaReporteRequestDto
{
    public string FechaInicio { get; set; } = string.Empty;
    public string FechaFin { get; set; } = string.Empty;
}

public class AsistenciaReportePdfRequestDto
{
    public string FechaInicio { get; set; } = string.Empty;
    public string FechaFin { get; set; } = string.Empty;
    public string Destinatario { get; set; } = "Reporte x Empleado";
    public IReadOnlyList<AsistenciaReportePdfItemDto> Items { get; set; } = Array.Empty<AsistenciaReportePdfItemDto>();
}

public class AsistenciaReportePdfItemDto
{
    public string Fecha { get; set; } = string.Empty;
    public string Hora { get; set; } = string.Empty;
    public string NombreEmpleado { get; set; } = string.Empty;
    public string Responsable { get; set; } = string.Empty;
    public string Ubicacion { get; set; } = string.Empty;
    public int? IdEmpleado { get; set; }
    public string Salida { get; set; } = string.Empty;
    public string EstadoMarcacionTexto { get; set; } = string.Empty;
    public decimal TotalHoras { get; set; }
    public decimal TotalHorasFaltaIncompleto { get; set; }
    public decimal TotalHorasEmpleado { get; set; }
    public decimal TotalHorasLaborales { get; set; }
    public decimal TotalHorasFaltaAprobar { get; set; }
    public decimal DiferenciaHoras { get; set; }
    public string EstadoValidacionHoras { get; set; } = string.Empty;
    public string Comentario { get; set; } = string.Empty;
    public string Observacion { get; set; } = string.Empty;
}

public class AsistenciaReporteDto
{
    public string Fecha { get; set; } = string.Empty;
    public string Hora { get; set; } = string.Empty;
    public string NombreEmpleado { get; set; } = string.Empty;
    public string TipoAprobacion { get; set; } = string.Empty;
    public string Responsable { get; set; } = string.Empty;
    public string Estado { get; set; } = string.Empty;
    public string Comentario { get; set; } = string.Empty;
    public string Observacion { get; set; } = string.Empty;
    public string Empresa { get; set; } = string.Empty;
    public string Cliente { get; set; } = string.Empty;
    public string Proyecto { get; set; } = string.Empty;
    public string Site { get; set; } = string.Empty;
    public string Area { get; set; } = string.Empty;
    public string Ubicacion { get; set; } = string.Empty;
    public int? IdEmpleado { get; set; }
    public string EstadoAct { get; set; } = string.Empty;
    public string Sexo { get; set; } = string.Empty;
    public string FechaIniLaboral { get; set; } = string.Empty;
    public string FechaFinLaboral { get; set; } = string.Empty;
    public string Salida { get; set; } = string.Empty;
    public string EstadoMarcacionTexto { get; set; } = string.Empty;
    public string TiempoTrabajado { get; set; } = string.Empty;
    public decimal TotalHoras { get; set; }
    public decimal TotalHorasEmpleado { get; set; }
    public decimal TotalHorasLaborales { get; set; }
    public decimal TotalHorasFaltaAprobar { get; set; }
    public string EstadoValidacionHoras { get; set; } = string.Empty;
    public string TiempoHoras { get; set; } = string.Empty;
    public string OrigenMarcacion { get; set; } = string.Empty;
}
