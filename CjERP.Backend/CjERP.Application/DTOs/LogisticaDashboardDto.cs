namespace CjERP.Application.DTOs;

/// <summary>Filtros opcionales del dashboard de logistica de equipos (cliente / proyecto / site).</summary>
public class LogisticaDashboardConsultaDto
{
    public int? IdCliente { get; set; }
    public int? IdProyecto { get; set; }
    public string? IdSite { get; set; }
    public int? CorreSite { get; set; }
}

public class LogisticaDashboardResumenDto
{
    public int Solicitudes { get; set; }
    public int Lineas { get; set; }
    public int LineasPendientes { get; set; }
    public int SolicitudesPendientes { get; set; }
    public int LineasObservadas { get; set; }
    public int SolicitudesObservadas { get; set; }
    public int? DiasMaxPendiente { get; set; }
    public decimal? DiasPromPendiente { get; set; }
}

public class LogisticaDashboardEstadoDto
{
    public int IdEstado { get; set; }
    public string Estado { get; set; } = string.Empty;
    public int Lineas { get; set; }
    public int Solicitudes { get; set; }
}

public class LogisticaDashboardAntiguedadDto
{
    public string Rango { get; set; } = string.Empty;
    public int Orden { get; set; }
    public int Lineas { get; set; }
}

public class LogisticaDashboardTendenciaDto
{
    public DateTime Fecha { get; set; }
    public int Solicitudes { get; set; }
}

public class LogisticaDashboardProyectoDto
{
    public string Proyecto { get; set; } = string.Empty;
    public int Pendientes { get; set; }
    public int Observadas { get; set; }
    public int Total { get; set; }
}

public class LogisticaDashboardAntiguaDto
{
    public string NroSolicitud { get; set; } = string.Empty;
    public DateTime? FechaCreacion { get; set; }
    public int Dias { get; set; }
    public int Lineas { get; set; }
    public string? Estado { get; set; }
    public string? Proyecto { get; set; }
    public string? Site { get; set; }
}

public class LogisticaDashboardDto
{
    public LogisticaDashboardResumenDto Resumen { get; set; } = new();
    public List<LogisticaDashboardEstadoDto> Estados { get; set; } = new();
    public List<LogisticaDashboardAntiguedadDto> Antiguedad { get; set; } = new();
    public List<LogisticaDashboardTendenciaDto> Tendencia { get; set; } = new();
    public List<LogisticaDashboardProyectoDto> Proyectos { get; set; } = new();
    public List<LogisticaDashboardAntiguaDto> Antiguas { get; set; } = new();
}
