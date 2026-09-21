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
    public string Validador { get; set; } = string.Empty;
    public string Validador2 { get; set; } = string.Empty;
    public string Validador3 { get; set; } = string.Empty;
    public string Estado { get; set; } = string.Empty;
    public string NroDocumento { get; set; } = string.Empty;
    public DateTime? Fecha { get; set; }
    public int? IdEstado { get; set; }
    public int? EstadoOc { get; set; }
    public string IdSite { get; set; } = string.Empty;
    public string NombreSite { get; set; } = string.Empty;
    public string NombreCliente { get; set; } = string.Empty;
    public string NombreProyecto { get; set; } = string.Empty;
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
    public string ImgOc { get; set; } = string.Empty;
    public string ImgPresupuesto { get; set; } = string.Empty;
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
    public int? Correlativo { get; set; }
    public string TipoTrabajo { get; set; } = string.Empty;
    public int? IdTarea { get; set; }
    public string Ot { get; set; } = string.Empty;
    public string Detalle { get; set; } = string.Empty;
    public decimal Cantidad { get; set; }
    public decimal PrecioUnitario { get; set; }
    public int? IdComprobante { get; set; }
    public string ImgOc { get; set; } = string.Empty;
    public string ImgPresupuesto { get; set; } = string.Empty;
    public decimal Peso { get; set; }
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

public class OrdenCompraAprobarRequestDto
{
    public List<int> IdsOc { get; set; } = [];
    public int? Nivel { get; set; }
    public int? IdAprobador { get; set; }
    public string Observacion { get; set; } = string.Empty;
}

public class OrdenCompraEditarDetalleRequestDto
{
    public int IdOc { get; set; }
    public string IdSite { get; set; } = string.Empty;
    public int? Correlativo { get; set; }
    public int? Fila { get; set; }
    public string Campo { get; set; } = string.Empty;
    public string? Valor { get; set; }
    public int? IdUsuario { get; set; }
    public string UsuarioAccion { get; set; } = string.Empty;
}

public class OrdenCompraRecibosRequestDto
{
    public int IdOc { get; set; }
    public int? Fila { get; set; }
}

public class OrdenCompraReciboDto
{
    public int Correlativo { get; set; }
    public DateTime? FecIngreso { get; set; }
    public decimal Subtotal { get; set; }
    public decimal Igv { get; set; }
    public decimal Total { get; set; }
    public string Moneda { get; set; } = string.Empty;
    public string Detalle { get; set; } = string.Empty;
    public string RutaImagen { get; set; } = string.Empty;
    public int? IdCliente { get; set; }
    public int? IdProyecto { get; set; }
    public string IdSite { get; set; } = string.Empty;
    public int? CorreSite { get; set; }
    public string TipoTrabajo { get; set; } = string.Empty;
    public string Comprobante { get; set; } = string.Empty;
    public string Responsable { get; set; } = string.Empty;
    public string NroDocumento { get; set; } = string.Empty;
    public string Estado { get; set; } = string.Empty;
    public string Tarea { get; set; } = string.Empty;
    public int? Fila { get; set; }
    public int? IdOc { get; set; }
}

public class OrdenCompraAsociarRecibosRequestDto
{
    public int IdOc { get; set; }
    public int? Fila { get; set; }
    public int? Nivel { get; set; }
    public List<int> Correlativos { get; set; } = [];
}

public class OrdenCompraAsociarRecibosResultDto
{
    public int IdOc { get; set; }
    public int Solicitados { get; set; }
    public int Asociados { get; set; }
}
public class OrdenCompraMontoOcDto
{
    public int? IdOc { get; set; }
    public DateTime? FechaOc { get; set; }
    public int? IdCliente { get; set; }
    public int? IdProyecto { get; set; }
    public int? Correlativo { get; set; }
    public string NombreCliente { get; set; } = string.Empty;
    public string NombreProyecto { get; set; } = string.Empty;
    public string TipoTrabajo { get; set; } = string.Empty;
    public string IdSite { get; set; } = string.Empty;
    public string NombreSite { get; set; } = string.Empty;
    public decimal MontoOc { get; set; }
    public decimal PagadoFic { get; set; }
    public decimal AvanceFic { get; set; }
    public decimal Pagado { get; set; }
    public decimal Avance { get; set; }
    public decimal Saldo { get; set; }
    public string Detalle { get; set; } = string.Empty;
    public string Estado { get; set; } = string.Empty;
    public int? Fila { get; set; }
    public string Solicitante { get; set; } = string.Empty;
}

public class OrdenCompraConsumoDto
{
    public int IdOc { get; set; }
    public int? Fila { get; set; }
    public decimal TotalOc { get; set; }
    public decimal PagadoOc { get; set; }
}

public class OrdenCompraPdfMetadataDto
{
    public DateTime? FechaOrden { get; set; }
    public string FormaPago { get; set; } = string.Empty;
    public int? DiasPago { get; set; }
}

public class OrdenCompraPdfResultDto
{
    public byte[] Content { get; set; } = [];
    public string FileName { get; set; } = string.Empty;
}

public class OrdenCompraAprobacionResultDto
{
    public int IdOc { get; set; }
    public int Nivel { get; set; }
    public int IdAprobador { get; set; }
}

public class OrdenCompraEditarDetalleResultDto
{
    public int IdOc { get; set; }
    public string IdSite { get; set; } = string.Empty;
    public int? Correlativo { get; set; }
    public int? Fila { get; set; }
    public string Campo { get; set; } = string.Empty;
    public string? ValorAnterior { get; set; }
    public string? ValorNuevo { get; set; }
}


