namespace CjERP.Application.DTOs
{
    /// <summary>Cambio manual de Planilla.Estado desde pagos_v2 (columna "Cambiar estado").</summary>
    public class PlanillaCambiarEstadoManualRequestDto
    {
        public string IdSite { get; set; } = string.Empty;
        public int NuevoEstado { get; set; }
        public string Observacion { get; set; } = string.Empty;
    }

    public class PlanillaCambiarEstadoManualResultDto
    {
        public int Correlativo { get; set; }
        public string IdSite { get; set; } = string.Empty;
        public int EstadoAnterior { get; set; }
        public int EstadoNuevo { get; set; }
    }
}
