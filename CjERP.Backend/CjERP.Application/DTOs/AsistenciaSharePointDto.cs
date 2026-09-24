namespace CjERP.Application.DTOs;

public sealed class AsistenciaSharePointDto
{
    public int IdEmpleado { get; set; }
    public string NombreEmpleado { get; set; } = string.Empty;
    public DateTime? FechaAsistencia { get; set; }
    public DateTime? Hora { get; set; }
    public DateTime? HoraSalida { get; set; }
    public decimal? LatitudSalida { get; set; }
    public decimal? LongitudSalida { get; set; }
    public int? IdEstado { get; set; }
    public string Estado { get; set; } = string.Empty;
}
