namespace CjERP.Application.DTOs
{
    public class PlanillaInsertRequestDto
    {
        public string FiltroOperativoKey { get; set; } = string.Empty;
        public string Responsable { get; set; } = string.Empty;
        public long? IdSuministroProvisional { get; set; }
        public int? IdBancoCta { get; set; }
        public int? IdProyecto { get; set; }
        public string IdSite { get; set; } = string.Empty;
        public int? CorreSite { get; set; }
        public int? IdTarea { get; set; }
        public int? IdCliente { get; set; }
        public string Cuenta { get; set; } = string.Empty;
        public string CuentaNumero { get; set; } = string.Empty;
        public string CuentaInter { get; set; } = string.Empty;
        public string NombreCta { get; set; } = string.Empty;
        public string Ruc { get; set; } = string.Empty;
        public string TipoPago { get; set; } = string.Empty;
        public string TipoPagoLabel { get; set; } = string.Empty;
        public decimal Monto { get; set; }
        public decimal? Subtotal { get; set; }
        public decimal? Total { get; set; }
        public decimal? Igv { get; set; }
        public int IdRendicion { get; set; }
        public string Detalle { get; set; } = string.Empty;
        public string Comentario { get; set; } = string.Empty;
        public string FechaVencimiento { get; set; } = string.Empty;
        public string FechaEmision { get; set; } = string.Empty;
        public string Solicitante { get; set; } = string.Empty;
        public string SolicitanteLabel { get; set; } = string.Empty;
        public string Gestor { get; set; } = string.Empty;
        public string GestorLabel { get; set; } = string.Empty;
        public string Validador { get; set; } = string.Empty;
        public string ValidadorLabel { get; set; } = string.Empty;
        public string Moneda { get; set; } = string.Empty;
        public string MonedaLabel { get; set; } = string.Empty;
        public string Bien { get; set; } = string.Empty;
        public string BienLabel { get; set; } = string.Empty;
        public string Comprobante { get; set; } = string.Empty;
        public string ComprobanteLabel { get; set; } = string.Empty;
        public string Serie { get; set; } = string.Empty;
        public string FacturaUrl { get; set; } = string.Empty;
        public string FacturaPath { get; set; } = string.Empty;
        public string TipoTrabajo { get; set; } = string.Empty;
        public string SiteNombre { get; set; } = string.Empty;
        public string Usuario { get; set; } = string.Empty;
        public string Ot { get; set; } = string.Empty;
        public decimal? TipoCambio { get; set; }
        public int? IdUsuarioFactura { get; set; }
    }

    public class PlanillaUpdateRequestDto : PlanillaInsertRequestDto
    {
        public int Correlativo { get; set; }
    }

    public class SuministroProvisionalVigenteRequestDto
    {
        public int? IdResponsable { get; set; }
        public int? IdTarea { get; set; }
        public int? IdCliente { get; set; }
        public int? IdProyecto { get; set; }
        public string IdSite { get; set; } = string.Empty;
        public int? CorreSite { get; set; }
        public string TipoTrabajo { get; set; } = string.Empty;
    }

    public class SuministroProvisionalVigenteDto
    {
        public long? IdProvisional { get; set; }
        public int? IdResponsable { get; set; }
        public string Responsable { get; set; } = string.Empty;
        public int? IdTarea { get; set; }
        public string Tarea { get; set; } = string.Empty;
        public string TipoTrabajo { get; set; } = string.Empty;
        public string Ot { get; set; } = string.Empty;
        public string Comentario { get; set; } = string.Empty;
        public decimal? Monto { get; set; }
        public DateTime? FechaInicio { get; set; }
        public string NombreCliente { get; set; } = string.Empty;
        public string NombreProyecto { get; set; } = string.Empty;
        public string NombreSite { get; set; } = string.Empty;
    }
}
