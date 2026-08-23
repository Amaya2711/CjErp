namespace CjERP.Application.DTOs
{
    public class PersonalMapaDto
    {
        public int? IdEmpleado { get; set; }
        public string NombreEmpleado { get; set; } = string.Empty;
        public string? Departamento { get; set; }
        public string? Cargo { get; set; }
        public decimal? LatitudFinal { get; set; }
        public decimal? LongitudFinal { get; set; }
        public DateTime? FechaHora { get; set; }
        public string? Fecha { get; set; }
        public string? FechaAsistencia { get; set; }
        public string? Hora { get; set; }
        public string? OrigenMarcacion { get; set; }
        public string? Ubicacion { get; set; }
        public string? Site { get; set; }
        public string? Cliente { get; set; }
        public string? Proyecto { get; set; }
        public string? Imagen { get; set; }
        public string? ImagenSalida { get; set; }
        public string? ImagenFinal { get; set; }
    }
}
