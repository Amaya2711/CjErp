namespace CjERP.Application.DTOs;

public sealed class VacacionesGrabarRequestDto
{
    public int IdEmpleadoCj { get; set; }
    public DateTime FechaInicio { get; set; }
    public DateTime FechaFin { get; set; }
    public int? IdResponsableCj { get; set; }
    public int? IdSegundoVacaciones { get; set; }
    public int? IdTerceroVacaciones { get; set; }
    public int? IdEstado { get; set; }
}

public sealed class VacacionesGrabarResultDto
{
    public int? Exito { get; set; }
    public int? Resultado { get; set; }
    public string? Mensaje { get; set; }
    public int? IdEmpleadoOtros { get; set; }
}
