namespace CjERP.Application.DTOs;

public sealed class VacacionesGrabarRequestDto
{
    public int IdEmpleadoCj { get; set; }
    public DateTime FechaInicio { get; set; }
    public DateTime FechaFin { get; set; }
    public int? IdEstado { get; set; }
}

public sealed class VacacionesGrabarResultDto
{
    public int? Exito { get; set; }
    public int? Resultado { get; set; }
    public string? Mensaje { get; set; }
    public int? DiasSolicitados { get; set; }
    public int? DiasInsertados { get; set; }
    public int? IdEmpleadoOtros { get; set; }
}
