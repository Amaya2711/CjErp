using System.ComponentModel.DataAnnotations;

namespace CjERP.Application.DTOs;

public sealed class PagoTesoreriaItemDto
{
    [Range(1, int.MaxValue)] public int Correlativo { get; set; }
    [Required, StringLength(50)] public string IdSite { get; set; } = "";
    public decimal TotalPagar { get; set; }
    public int Estado { get; set; }
    [Required, RegularExpression("^[A-Fa-f0-9]{64}$")] public string Version { get; set; } = "";
}

public sealed class PagoTesoreriaRequestDto
{
    public int EstadoOrigen { get; set; }
    [Range(1, int.MaxValue)] public int IdEjecutor { get; set; }
    [Range(1, int.MaxValue)] public int IdTransferencia { get; set; }
    [Range(1, int.MaxValue)] public int IdBanco { get; set; }
    [Range(1, int.MaxValue)] public int IdMoneda2 { get; set; }
    public DateTime FechaDeposito { get; set; }
    [StringLength(50)] public string Cheque { get; set; } = "";
    [StringLength(50)] public string NroOperacion { get; set; } = "";
    [StringLength(500)] public string Comentario { get; set; } = "";
    [Required, MinLength(1), MaxLength(500)] public List<PagoTesoreriaItemDto> Items { get; set; } = [];
}

public sealed class PagoTesoreriaAccionDto
{
    [Required] public string Accion { get; set; } = "";
    [Required, MinLength(1), MaxLength(500)] public List<PagoTesoreriaItemDto> Items { get; set; } = [];
    [StringLength(500)] public string Observacion { get; set; } = "";
    public int? IdRetencion { get; set; }
    public bool AplicarGenerales { get; set; }
    public bool AplicarBanco { get; set; }
    public bool AplicarRendicion { get; set; }
    public bool AplicarOperacion { get; set; }
    public int? IdComprobante { get; set; }
    public int? IdTipoPago { get; set; }
    [StringLength(11)] public string Ruc { get; set; } = "";
    [StringLength(50)] public string Serie { get; set; } = "";
    public DateTime? FecEmision { get; set; }
    public int? IdBanco { get; set; }
    public int? IdMoneda2 { get; set; }
    public DateTime? FechaDeposito { get; set; }
    public int? IdTransferencia { get; set; }
    [StringLength(50)] public string NroOperacion { get; set; } = "";
    public int? IdRendicion { get; set; }
    public bool AplicarDetalle { get; set; }
    [StringLength(4000)] public string Detalle { get; set; } = "";
    public bool AplicarAdjunto { get; set; }
    [StringLength(2500)] public string ImgFactura { get; set; } = "";
}
