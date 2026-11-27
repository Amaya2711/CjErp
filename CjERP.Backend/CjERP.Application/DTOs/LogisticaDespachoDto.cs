namespace CjERP.Application.DTOs;

// ---- x Despachar ---- (reglas: docs/mobile/despachos-reglas-legado.md)

public class LogisticaDespachoConsultaDto
{
    /// <summary>Numeros de solicitud separados por comas.</summary>
    public string? Solicitudes { get; set; }
    public DateTime? FechaIni { get; set; }
    public DateTime? FechaFin { get; set; }
    public int? IdCliente { get; set; }
    public int? IdProyecto { get; set; }
    public string? IdSite { get; set; }
    public int? CorreSite { get; set; }
    /// <summary>"NUEVO" (CabSolicitud.IdWeb = 1), "ANTIGUO" (IdWeb vacio); vacio = ambos.</summary>
    public string? Origen { get; set; }
}

public class LogisticaDespachoLineaDto
{
    public string NroSolicitud { get; set; } = string.Empty;
    public string? PedidoSap { get; set; }
    public string? Correlativo { get; set; }
    public string Posicion { get; set; } = string.Empty;
    public string? CodPap { get; set; }
    public string? NombreMaterial { get; set; }
    public string? UnidadMedida { get; set; }
    /// <summary>true = material codigo 40: lleva serie y se despacha completo.</summary>
    public bool EsEquipo { get; set; }
    public decimal CantSap { get; set; }
    public string? Serie { get; set; }
    public string? Observacion { get; set; }
    public string? RutaImagen { get; set; }
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
    /// <summary>true = solicitud del sistema nuevo (se puede despachar/rechazar); false = del sistema antiguo (solo lectura).</summary>
    public bool EsSistemaNuevo { get; set; }
}

public class LogisticaDespachoSerieDto
{
    public string Serie { get; set; } = string.Empty;
    public string? PedidoSap { get; set; }
    public string? IdSite { get; set; }
}

public class LogisticaDespachoItemDto
{
    public string NroSolicitud { get; set; } = string.Empty;
    public string Posicion { get; set; } = string.Empty;
    /// <summary>Obligatoria en equipos (codigo 40).</summary>
    public string? Serie { get; set; }
    /// <summary>Cantidad a despachar (0 &lt; cantidad &lt;= pedida); vacio = la pedida. Los equipos se despachan completos.</summary>
    public decimal? Cantidad { get; set; }
    /// <summary>Ruta/URL de la imagen ya subida (obligatoria).</summary>
    public string? RutaImagen { get; set; }
    public string? Observacion { get; set; }
}

public class LogisticaDespachoGrabarDto
{
    public List<LogisticaDespachoItemDto> Items { get; set; } = new();
}

public class LogisticaDespachoGrabarResultDto
{
    public int Procesadas { get; set; }
    /// <summary>Lineas despachadas con menos cantidad de la pedida (la diferencia volvio a Disponible).</summary>
    public int ConDiferencia { get; set; }
}

public class LogisticaDespachoRechazoItemDto
{
    public string NroSolicitud { get; set; } = string.Empty;
    public string Posicion { get; set; } = string.Empty;
}

public class LogisticaDespachoRechazarDto
{
    public List<LogisticaDespachoRechazoItemDto> Items { get; set; } = new();
    /// <summary>Motivo del rechazo (obligatorio).</summary>
    public string? Observacion { get; set; }
}

public class LogisticaDespachoRechazarResultDto
{
    public int Procesadas { get; set; }
}
