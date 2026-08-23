namespace CjERP.Application.DTOs
{
    public class SiteMapaDto
    {
        public string IdSite { get; set; } = string.Empty;
        public string NombreSite { get; set; } = string.Empty;
        public int? Correlativo { get; set; }
        public string Departamento { get; set; } = string.Empty;
        public string? Provincia { get; set; }
        public string? Distrito { get; set; }
        public decimal? Latitud { get; set; }
        public decimal? Longitud { get; set; }
        public int? IdCliente { get; set; }
        public int? IdProyecto { get; set; }
        public string? NombreCliente { get; set; }
        public string? NombreProyecto { get; set; }
        public string? Direccion { get; set; }
        public string? Referencia { get; set; }
    }
}
