namespace CjERP.Application.DTOs;

/// <summary>Configuración del job que sincroniza la lista M_EMPLEADOS de SharePoint.</summary>
public sealed class EmpleadosListaSharePointConfigDto
{
    public string CodigoJob { get; set; } = "EMPLEADOS_LISTA_SHAREPOINT";
    public bool Activo { get; set; }
    public string HoraEjecucion { get; set; } = "04:00";
    public string TimeZone { get; set; } = "SA Pacific Standard Time";
    public string CronExpression { get; set; } = "0 4 * * *";
    public DateTimeOffset? UltimaEjecucion { get; set; }
    public string? UltimoEstado { get; set; }
    public int? UltimaCantidadRegistros { get; set; }
    public int? UltimaCantidadCreados { get; set; }
    public int? UltimaCantidadActualizados { get; set; }
    public string? Mensaje { get; set; }
    /// <summary>Solo informativo (vienen de la configuración del servidor).</summary>
    public string Lista { get; set; } = string.Empty;
    public string Origen { get; set; } = "sp_Consultar_EmpleadoSharepoint";
    public string ColumnaClave { get; set; } = string.Empty;
}

public sealed class EmpleadosListaSharePointConfigUpdateDto
{
    public bool Activo { get; set; }
    public string HoraEjecucion { get; set; } = "04:00";
}

public sealed class EmpleadosListaSharePointLogDto
{
    public long Id { get; set; }
    public string TipoEjecucion { get; set; } = string.Empty;
    public string Lista { get; set; } = string.Empty;
    public int CantidadRegistros { get; set; }
    public int CantidadCreados { get; set; }
    public int CantidadActualizados { get; set; }
    public int CantidadSinCambios { get; set; }
    public string Estado { get; set; } = string.Empty;
    public DateTimeOffset FechaInicioEjecucion { get; set; }
    public DateTimeOffset? FechaFinEjecucion { get; set; }
    public int DuracionSegundos { get; set; }
    public string? Usuario { get; set; }
    public string? Mensaje { get; set; }
    public string? DetalleError { get; set; }
}
