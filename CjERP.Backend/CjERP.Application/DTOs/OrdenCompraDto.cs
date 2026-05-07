namespace CjERP.Application.DTOs;

public class OrdenCompraConsultaRequestDto
{
    public int? IdCliente { get; set; }
    public int? IdProyecto { get; set; }
    public string? IdSite { get; set; }
    public int? Correlativo { get; set; }
    public string? Ot { get; set; }
    public string? TipoTrabajo { get; set; }
    public int? IdSolicitante { get; set; }
    public int? IdResponsable { get; set; }
    public string? IdOc { get; set; }
}

public class OrdenCompraCabeceraDto
{
    public int IdOc { get; set; }
    public int IdSolicitante { get; set; }
    public string Solicitante { get; set; } = string.Empty;
    public int IdResponsable { get; set; }
    public string Responsable { get; set; } = string.Empty;
    public decimal Subtotal { get; set; }
    public decimal Igv { get; set; }
    public decimal Total { get; set; }
    public string Moneda { get; set; } = string.Empty;
    public string Comprobante { get; set; } = string.Empty;
    public int? IdAprobador1 { get; set; }
    public int? IdAprobador2 { get; set; }
    public int? IdAprobador3 { get; set; }
    public int? IdValidador { get; set; }
    public string Estado { get; set; } = string.Empty;
    public string NroDocumento { get; set; } = string.Empty;
    public DateTime? Fecha { get; set; }
    public int? IdEstado { get; set; }
}

public class OrdenCompraDetalleDto
{
    public int IdOc { get; set; }
    public int? IdSolicitante { get; set; }
    public string Solicitante { get; set; } = string.Empty;
    public int? IdResponsable { get; set; }
    public string Responsable { get; set; } = string.Empty;
    public int? IdMoneda { get; set; }
    public string Moneda { get; set; } = string.Empty;
    public int? IdCliente { get; set; }
    public string NombreCliente { get; set; } = string.Empty;
    public int? IdProyecto { get; set; }
    public string NombreProyecto { get; set; } = string.Empty;
    public string IdSite { get; set; } = string.Empty;
    public string NombreSite { get; set; } = string.Empty;
    public string TipoTrabajo { get; set; } = string.Empty;
    public int? IdTarea { get; set; }
    public string Tarea { get; set; } = string.Empty;
    public string Detalle { get; set; } = string.Empty;
    public decimal Cantidad { get; set; }
    public decimal PrecioUnitario { get; set; }
    public string Ot { get; set; } = string.Empty;
    public decimal SubtotalD { get; set; }
    public decimal IgvD { get; set; }
    public decimal TotalD { get; set; }
    public string OcAdela { get; set; } = string.Empty;
    public string OcPor { get; set; } = string.Empty;
    public int? Fila { get; set; }
    public int? Correlativo { get; set; }
    public string Cuenta { get; set; } = string.Empty;
    public string CuentaInter { get; set; } = string.Empty;
    public string NombreCta { get; set; } = string.Empty;
    public string Banco { get; set; } = string.Empty;
    public int? IdBanco { get; set; }
    public int? IdComprobante { get; set; }
    public decimal OcAdeMon { get; set; }
    public decimal OcPorAde { get; set; }
    public int? IdAprobador1 { get; set; }
    public int? IdAprobador2 { get; set; }
    public int? IdAprobador3 { get; set; }
    public decimal MonFic { get; set; }
    public decimal PorFict { get; set; }
    public string RutaImagen { get; set; } = string.Empty;
    public string Estado { get; set; } = string.Empty;
    public int? IdValidador { get; set; }
    public int? IdGestor { get; set; }
    public string Gestor { get; set; } = string.Empty;
}

public class OrdenCompraInsertDetalleDto
{
    public int IdCliente { get; set; }
    public int IdProyecto { get; set; }
    public string IdSite { get; set; } = string.Empty;
    public string Detalle { get; set; } = string.Empty;
    public decimal Cantidad { get; set; }
    public decimal PrecioUnitario { get; set; }
}

public class OrdenCompraInsertRequestDto
{
    public int IdSolicitante { get; set; }
    public int IdResponsable { get; set; }
    public int IdWeb { get; set; }
    public DateTime FechaOrden { get; set; }
    public string Observacion { get; set; } = string.Empty;
    public string UsuarioCreacion { get; set; } = string.Empty;
    public DateTime FechaCreacion { get; set; }
    public TimeSpan HoraCreacion { get; set; }
    public int IdMoneda { get; set; }
    public int IdComprobante { get; set; }
    public int IdEstado { get; set; }
    public int IdValidador { get; set; }
    public int IdGestor { get; set; }
    public int IdFormaPago { get; set; }
    public int DiasPago { get; set; }
    public decimal Peso { get; set; }
    public List<OrdenCompraInsertDetalleDto> Detalle { get; set; } = [];
}

public class OrdenCompraRechazoMasivoRequestDto
{
    public List<int> IdsOc { get; set; } = [];
    public string Observacion { get; set; } = string.Empty;
    public int? IdAprobador { get; set; }
}
