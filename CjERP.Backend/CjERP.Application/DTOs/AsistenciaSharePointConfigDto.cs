namespace CjERP.Application.DTOs;

public sealed class AsistenciaSharePointConfigDto
{
    public string CodigoJob { get; set; } = "ASISTENCIA_SHAREPOINT";
    public bool Activo { get; set; }
    public string HoraEjecucion { get; set; } = "02:00";
    public string TimeZone { get; set; } = "SA Pacific Standard Time";
    public string CronExpression { get; set; } = "0 2 * * *";
    public DateTimeOffset? UltimaEjecucion { get; set; }
    public string? UltimoEstado { get; set; }
    public int? UltimaCantidadRegistros { get; set; }
    public string? UltimoArchivo { get; set; }
    public string? Mensaje { get; set; }
}

public sealed class AsistenciaSharePointConfigUpdateDto
{
    public bool Activo { get; set; }
    public string HoraEjecucion { get; set; } = "02:00";
}

public sealed class AsistenciaSharePointLogDto
{
    public long Id { get; set; }
    public string TipoEjecucion { get; set; } = string.Empty;
    public DateTime FechaInicio { get; set; }
    public DateTime FechaFin { get; set; }
    public string NombreArchivo { get; set; } = string.Empty;
    public int CantidadRegistros { get; set; }
    public string Estado { get; set; } = string.Empty;
    public DateTimeOffset FechaInicioEjecucion { get; set; }
    public DateTimeOffset? FechaFinEjecucion { get; set; }
    public int DuracionSegundos { get; set; }
    public string? Usuario { get; set; }
    public string? Mensaje { get; set; }
    public string? DetalleError { get; set; }
}
