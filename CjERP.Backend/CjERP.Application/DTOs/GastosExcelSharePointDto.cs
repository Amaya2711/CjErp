namespace CjERP.Application.DTOs;

/// <summary>Configuración del job que actualiza la tabla de gastos del Excel en SharePoint.</summary>
public sealed class GastosExcelSharePointConfigDto
{
    public string CodigoJob { get; set; } = "GASTOS_EXCEL_SHAREPOINT";
    public bool Activo { get; set; }
    public string HoraEjecucion { get; set; } = "03:00";
    public string TimeZone { get; set; } = "SA Pacific Standard Time";
    public string CronExpression { get; set; } = "0 3 * * *";
    /// <summary>Cliente de Planilla cuyos gastos se exportan.</summary>
    public int IdCliente { get; set; } = 4;
    /// <summary>Estado de Planilla que se exporta (4 = pagado).</summary>
    public int EstadoPlanilla { get; set; } = 4;
    public DateTimeOffset? UltimaEjecucion { get; set; }
    public string? UltimoEstado { get; set; }
    public int? UltimaCantidadRegistros { get; set; }
    public string? Mensaje { get; set; }
    /// <summary>Solo informativo: archivo y tabla de Excel que se actualizan (vienen de la configuración del servidor).</summary>
    public string Archivo { get; set; } = string.Empty;
    public string Tabla { get; set; } = string.Empty;
}

public sealed class GastosExcelSharePointConfigUpdateDto
{
    public bool Activo { get; set; }
    public string HoraEjecucion { get; set; } = "03:00";
    public int IdCliente { get; set; } = 4;
    public int EstadoPlanilla { get; set; } = 4;
}

public sealed class GastosExcelSharePointLogDto
{
    public long Id { get; set; }
    public string TipoEjecucion { get; set; } = string.Empty;
    public int IdCliente { get; set; }
    public int EstadoPlanilla { get; set; }
    public string Archivo { get; set; } = string.Empty;
    public string Tabla { get; set; } = string.Empty;
    public int CantidadRegistros { get; set; }
    public string Estado { get; set; } = string.Empty;
    public DateTimeOffset FechaInicioEjecucion { get; set; }
    public DateTimeOffset? FechaFinEjecucion { get; set; }
    public int DuracionSegundos { get; set; }
    public string? Usuario { get; set; }
    public string? Mensaje { get; set; }
    public string? DetalleError { get; set; }
}

/// <summary>Fila agregada de gastos por site, año, proyecto, cliente, trabajo, tarea y moneda.</summary>
public sealed class GastoExcelSharePointDto
{
    public string? IdSite { get; set; }
    public string? NombreSite { get; set; }
    public int? Anio { get; set; }
    public string? Proyecto { get; set; }
    public string? Cliente { get; set; }
    public string? Trabajo { get; set; }
    public string? Tarea { get; set; }
    public decimal? TotalGastos { get; set; }
    public string? Moneda { get; set; }
}
