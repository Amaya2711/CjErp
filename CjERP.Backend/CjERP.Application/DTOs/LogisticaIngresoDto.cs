namespace CjERP.Application.DTOs;

/// <summary>Opcion de catalogo (Constante) usada por la pantalla de ingreso de equipos.</summary>
public class LogisticaIngresoCatalogoDto
{
    /// <summary>UBICACION, UBI_ALMACEN o ESTADO_LOG.</summary>
    public string Tipo { get; set; } = string.Empty;
    public int Correlativo { get; set; }
    public string? Nombre { get; set; }
}

/// <summary>Linea de DetLogistica con sus nombres (pestanas Pedido, x Recepcionar, Series y x Validar).</summary>
public class LogisticaIngresoLineaDto
{
    public string PedidoSap { get; set; } = string.Empty;
    public string? IdSolicitud { get; set; }
    public string? Region { get; set; }
    public string? Guia { get; set; }
    public DateTime? FecIngreso { get; set; }
    public DateTime? FechaCreacion { get; set; }
    public string? IdSite { get; set; }
    public int? CorreSite { get; set; }
    public string? TipoTrabajo { get; set; }
    public string? Observacion { get; set; }
    public string? Posicion { get; set; }
    public string? Serie { get; set; }
    public string? CodPap { get; set; }
    public string? Centro { get; set; }
    public string? Almacen { get; set; }
    public string? Lote { get; set; }
    public string Correlativo { get; set; } = string.Empty;
    public int IdEstado { get; set; }
    public int? IdCliente { get; set; }
    public int? IdProyecto { get; set; }
    public string? Comentario { get; set; }
    public string? NombreMaterial { get; set; }
    public string? UnidadMedida { get; set; }
    public string? NombreCliente { get; set; }
    public string? NombreProyecto { get; set; }
    public string? NombreSite { get; set; }
    public string? NomEstado { get; set; }
    public decimal CantSap { get; set; }
    public int? IdUbicacion { get; set; }
    public DateTime? Fecha { get; set; }
}

public class LogisticaIngresoConsultaDto
{
    /// <summary>PEDIDO, RECEPCION, VALIDACION o SERIE.</summary>
    public string Etapa { get; set; } = string.Empty;
    public string? Pedidos { get; set; }
    public string? Solicitudes { get; set; }
    public DateTime? FechaIni { get; set; }
    public DateTime? FechaFin { get; set; }
    public int? IdUbicacion { get; set; }
}

public class LogisticaIngresoCambioEstadoItemDto
{
    public string Correlativo { get; set; } = string.Empty;
    public int? IdEstado { get; set; }
}

public class LogisticaIngresoCambioEstadoDto
{
    public List<LogisticaIngresoCambioEstadoItemDto> Items { get; set; } = new();
    /// <summary>Solo validacion: zona de almacen (Constante UBI_ALMACEN) donde queda el pedido.</summary>
    public int? IdZonaAlmacen { get; set; }
}

public class LogisticaIngresoCambioEstadoResultDto
{
    public int Actualizadas { get; set; }
    public int PedidosCompletos { get; set; }
}

public class LogisticaIngresoSerieDto
{
    public string Correlativo { get; set; } = string.Empty;
    public string? Serie { get; set; }
    public string? Comentario { get; set; }
}

public class LogisticaIngresoSerieMasivaItemDto
{
    public string? Pedido { get; set; }
    public string? CodPap { get; set; }
    public string? Site { get; set; }
    public string? IdSite { get; set; }
    public string? Serie { get; set; }
}

public class LogisticaIngresoSerieMasivaDto
{
    public List<LogisticaIngresoSerieMasivaItemDto> Items { get; set; } = new();
    public bool SoloValidar { get; set; }
}

public class LogisticaIngresoGuiaDto
{
    public List<string> Pedidos { get; set; } = new();
    public string Guia { get; set; } = string.Empty;
    public DateTime FecIngreso { get; set; }
    public bool Reasignar { get; set; }
    public int? IdCliente { get; set; }
    public int? IdProyecto { get; set; }
    public string? TipoTrabajo { get; set; }
    public string? IdSite { get; set; }
    public int? CorreSite { get; set; }
}

public class LogisticaIngresoGuiaResultDto
{
    public int PedidosActualizados { get; set; }
    public int LineasActualizadas { get; set; }
}

public class LogisticaPedidoItemDto
{
    public int? Fila { get; set; }
    public string? PedidoSap { get; set; }
    public string? IdSolicitud { get; set; }
    public string? Site { get; set; }
    public string? DescSite { get; set; }
    public string? Solicitante { get; set; }
    public string? CodPap { get; set; }
    public string? Descripcion { get; set; }
    public decimal? CantSolicitada { get; set; }
    public decimal? CantSap { get; set; }
    public string? Centro { get; set; }
    public string? AlmOrigen { get; set; }
    public string? Lote { get; set; }
    public string? ObsSolic { get; set; }
    public string? Region { get; set; }
    public string? Oc { get; set; }
    public string? Posicion { get; set; }
    public string? Cliente { get; set; }
    public string? Proyecto { get; set; }
    public string? TipoTrabajo { get; set; }
    /// <summary>yyyy-MM-dd.</summary>
    public string? FecIngreso { get; set; }
    public string? Guia { get; set; }
}

public class LogisticaPedidoImportarDto
{
    public List<LogisticaPedidoItemDto> Items { get; set; } = new();
    public bool SoloValidar { get; set; }
}

/// <summary>Resultado por linea de una carga (Estado: OK, OMITIDO o ERROR).</summary>
public class LogisticaIngresoLineaResultadoDto
{
    public int Fila { get; set; }
    public string Estado { get; set; } = string.Empty;
    public string? Mensaje { get; set; }
}

public class LogisticaIngresoCargaResultDto
{
    public bool Aplicado { get; set; }
    public List<LogisticaIngresoLineaResultadoDto> Lineas { get; set; } = new();
}

public class LogisticaSecundarioItemDto
{
    public int? Fila { get; set; }
    public string? IdMaterial { get; set; }
    public string? IdSolicitud { get; set; }
    public string? Site { get; set; }
    public string? DescSite { get; set; }
    public string? Descripcion { get; set; }
    public decimal? Cantidad { get; set; }
    public string? Lote { get; set; }
}

public class LogisticaSecundarioImportarDto
{
    public List<LogisticaSecundarioItemDto> Items { get; set; } = new();
    public bool SoloValidar { get; set; }
}
