using System.Collections.Generic;

namespace CjERP.Application.DTOs
{
    public class PlanillaProcesarAprobacionMasivaRequestDto
    {
        public int CodEstado { get; set; }
        public string? Observacion { get; set; }
        public int IdRegularizar { get; set; }
        public List<PlanillaProcesarAprobacionItemDto> Registros { get; set; } = [];
    }

    public class PlanillaProcesarAprobacionItemDto
    {
        public int Correlativo { get; set; }
        public string IdSite { get; set; } = string.Empty;
        public int TipoMoneda { get; set; }
    }

    public class AprobacionResultadoDto
    {
        public bool Exito { get; set; }
        public int Correlativo { get; set; }
        public string IdSite { get; set; } = string.Empty;
        public int TipoMoneda { get; set; }
        public string? Moneda { get; set; }
        public decimal Total { get; set; }
        public int? IdResponsable { get; set; }
        public int? EstadoAnterior { get; set; }
        public int EstadoSolicitado { get; set; }
        public int EstadoAplicado { get; set; }
        public bool RequiereSegundaAprobacion { get; set; }
        public decimal? LimiteSegundaAprobacion { get; set; }
        public string? Mensaje { get; set; }
    }

    public class AprobacionResumenDto
    {
        public int TotalSeleccionados { get; set; }
        public int Procesados { get; set; }
        public int NoProcesados { get; set; }
        public int EnviadosSegundaAprobacion { get; set; }
        public int Aprobados { get; set; }
        public int PrimeraAprobacion { get; set; }
        public int Observados { get; set; }
        public int Rechazados { get; set; }
    }

    public class PlanillaProcesarAprobacionMasivaResponseDto
    {
        public List<AprobacionResultadoDto> Detalle { get; set; } = [];
        public AprobacionResumenDto? Resumen { get; set; }
    }
}
