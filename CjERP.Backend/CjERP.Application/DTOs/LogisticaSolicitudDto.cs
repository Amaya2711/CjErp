namespace CjERP.Application.DTOs;

/// <summary>Opcion de catalogo de la pestana Solicitud (forma de envio, entrega, solicitante, validador).</summary>
public class LogisticaSolicitudCatalogoDto
{
    /// <summary>FORMA_ENVIO, ENTREGA, SOLICITANTE o VALIDADOR.</summary>
    public string Tipo { get; set; } = string.Empty;
    public int Id { get; set; }
    public string? Nombre { get; set; }
    public string? Documento { get; set; }
    public string? Telefono { get; set; }
}

/// <summary>Linea de DetLogistica validada (estado 2) con saldo disponible para solicitar.</summary>
public class LogisticaSolicitudDisponibleDto
{
    public string Correlativo { get; set; } = string.Empty;
    public string? PedidoSap { get; set; }
    public string CodPap { get; set; } = string.Empty;
    public string? NombreMaterial { get; set; }
    public string? UnidadMedida { get; set; }
    public string? Serie { get; set; }
    public decimal CantSap { get; set; }
    public decimal Saldo { get; set; }
    public int? IdCliente { get; set; }
    public int? IdProyecto { get; set; }
    public string? IdSite { get; set; }
    public int? CorreSite { get; set; }
    public string? TipoTrabajo { get; set; }
    public string? NombreSite { get; set; }
    public string? NombreCliente { get; set; }
    public string? NombreProyecto { get; set; }
    public bool MismoSite { get; set; }
    public decimal StockDisponible { get; set; }
}

/// <summary>Material consumible (cod. 30) con stock disponible, sin linea de origen.</summary>
public class LogisticaSolicitudConsumibleDto
{
    public string CodPap { get; set; } = string.Empty;
    public string? NombreMaterial { get; set; }
    public string? UnidadMedida { get; set; }
    public decimal Disponible { get; set; }
}

public class LogisticaSolicitudItemDto
{
    /// <summary>Linea de DetLogistica de origen; vacio = sale del stock disponible sin linea de origen.</summary>
    public string? Correlativo { get; set; }
    public string CodPap { get; set; } = string.Empty;
    public decimal Cantidad { get; set; }
}

public class LogisticaSolicitudRegistrarDto
{
    public int IdCliente { get; set; }
    public int IdProyecto { get; set; }
    public string IdSite { get; set; } = string.Empty;
    public int CorreSite { get; set; }
    public string TipoTrabajo { get; set; } = string.Empty;
    public int IdSolicitante { get; set; }
    public int FormaEnvio { get; set; }
    public int RazonSocial { get; set; }
    public string Ubigeo { get; set; } = string.Empty;
    public string Direccion { get; set; } = string.Empty;
    public string? Referencia { get; set; }
    public int IdConEntrega1 { get; set; }
    public int? IdConEntrega2 { get; set; }
    public string? ImagenSolicitud { get; set; }
    public List<LogisticaSolicitudItemDto> Items { get; set; } = new();
}

public class LogisticaSolicitudRegistrarResultDto
{
    public string NroSolicitud { get; set; } = string.Empty;
    /// <summary>9 = pendiente de aprobacion; 3 = sin aprobacion (pasa directo a despacho).</summary>
    public int IdEstado { get; set; }
    public bool CorreoEnviado { get; set; }
    public string? CorreoMensaje { get; set; }
}

public class LogisticaSolicitudPorAprobarConsultaDto
{
    public int? IdCliente { get; set; }
    public int? IdProyecto { get; set; }
    public string? IdSite { get; set; }
    public int? CorreSite { get; set; }
}

public class LogisticaSolicitudPorAprobarDto
{
    public string NroSolicitud { get; set; } = string.Empty;
    public int? IdCliente { get; set; }
    public int? IdProyecto { get; set; }
    public string? IdSite { get; set; }
    public int? CorreSite { get; set; }
    public string? TipoTrabajo { get; set; }
    public string? NombreCliente { get; set; }
    public string? NombreProyecto { get; set; }
    public string? NombreSite { get; set; }
    public string? Usuario { get; set; }
    public DateTime? FechaCreacion { get; set; }
    public string? Solicitante { get; set; }
    public string? FormaEnvio { get; set; }
    public string? Direccion { get; set; }
    public string? Referencia { get; set; }
    public int Lineas { get; set; }
    public decimal Cantidad { get; set; }
    public int IdEstado { get; set; }
}

public class LogisticaSolicitudDetalleDto
{
    public string? Posicion { get; set; }
    public string? Correlativo { get; set; }
    public string? PedidoSap { get; set; }
    public string? CodPap { get; set; }
    public string? NombreMaterial { get; set; }
    public string? UnidadMedida { get; set; }
    public decimal CantSap { get; set; }
    public string? Serie { get; set; }
    public int IdEstado { get; set; }
    public string? NomEstado { get; set; }
    public string? IdSiteOrigen { get; set; }
    public string? NombreSiteOrigen { get; set; }
}

public class LogisticaSolicitudAprobarDto
{
    public List<string> Solicitudes { get; set; } = new();
    /// <summary>APROBAR (exige validador) u OBSERVAR (exige observacion).</summary>
    public string Accion { get; set; } = "APROBAR";
    public int? IdValidador { get; set; }
    public string? Observacion { get; set; }
}

public class LogisticaSolicitudAprobarResultDto
{
    public int Procesadas { get; set; }
    public int CorreosEnviados { get; set; }
    public string? CorreoMensaje { get; set; }
}

/// <summary>Cabecera de la solicitud para el PDF y el correo.</summary>
public class LogisticaSolicitudCorreoCabDto
{
    public string NroSolicitud { get; set; } = string.Empty;
    public int IdEstado { get; set; }
    public string? NombreCliente { get; set; }
    public string? NombreProyecto { get; set; }
    public string? IdSite { get; set; }
    public string? NombreSite { get; set; }
    public string? TipoTrabajo { get; set; }
    public string? Solicitante { get; set; }
    public string? SolicitanteCorreo { get; set; }
    public int AreaCj { get; set; }
    public string? FormaEnvio { get; set; }
    public string? RazonSocial { get; set; }
    public string? Ubigeo { get; set; }
    public string? Direccion { get; set; }
    public string? Referencia { get; set; }
    public string? Observacion { get; set; }
    public DateTime? FechaCreacion { get; set; }
    public string? Usuario { get; set; }
    public string? Entrega1 { get; set; }
    public string? Entrega2 { get; set; }
}

// ---- x Campo ----

public class LogisticaCampoConsultaDto
{
    /// <summary>Numeros de solicitud separados por comas.</summary>
    public string? Solicitudes { get; set; }
    public DateTime? FechaIni { get; set; }
    public DateTime? FechaFin { get; set; }
    public int? IdRespCampo { get; set; }
    public int? IdCliente { get; set; }
    public int? IdProyecto { get; set; }
    public string? IdSite { get; set; }
    public int? CorreSite { get; set; }
}

public class LogisticaCampoLineaDto
{
    public string NroSolicitud { get; set; } = string.Empty;
    public string? PedidoSap { get; set; }
    public string? Correlativo { get; set; }
    public string Posicion { get; set; } = string.Empty;
    public string? CodPap { get; set; }
    public string? NombreMaterial { get; set; }
    public string? UnidadMedida { get; set; }
    public decimal CantSap { get; set; }
    public string? Serie { get; set; }
    public string? Observacion { get; set; }
    public string? RutaImagen { get; set; }
    public string? ImagenEnvio { get; set; }
    public int IdEstado { get; set; }
    public string? NomEstado { get; set; }
    public int? IdCliente { get; set; }
    public int? IdProyecto { get; set; }
    public string? IdSite { get; set; }
    public int? CorreSite { get; set; }
    public string? TipoTrabajo { get; set; }
    public string? NombreSite { get; set; }
    public string? NombreProyecto { get; set; }
    public string? NombreCliente { get; set; }
    public DateTime? FechaCreacion { get; set; }
}

public class LogisticaCampoItemDto
{
    public string NroSolicitud { get; set; } = string.Empty;
    public string Posicion { get; set; } = string.Empty;
    public string? Correlativo { get; set; }
    /// <summary>14 (x cruzar) o 10 (observada); vacio = 14.</summary>
    public int? IdEstado { get; set; }
    /// <summary>Cantidad conforme (0..cantidad enviada).</summary>
    public decimal? Cantidad { get; set; }
    public string? Observacion { get; set; }
}

public class LogisticaCampoGrabarDto
{
    public List<LogisticaCampoItemDto> Items { get; set; } = new();
}

public class LogisticaCampoGrabarResultDto
{
    public int Procesadas { get; set; }
    public int ConDiferencia { get; set; }
}
