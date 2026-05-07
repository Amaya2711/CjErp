namespace CjERP.Application.DTOs
{
    public class PlanillaActualizarEstadoRequestDto
    {
        public int Correlativo { get; set; }
        public int CodEstado { get; set; }
        public string IdSite { get; set; } = string.Empty;
        public int? IdAprobador { get; set; }
        public string Observacion { get; set; } = string.Empty;
    }
}
