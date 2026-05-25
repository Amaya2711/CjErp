namespace CjERP.Application.DTOs;

public class AuditoriaCambioDto
{
    public string Modulo { get; set; } = string.Empty;
    public string Entidad { get; set; } = string.Empty;
    public string IdRegistro { get; set; } = string.Empty;
    public string Accion { get; set; } = string.Empty;
    public string? Seccion { get; set; }
    public string Campo { get; set; } = string.Empty;
    public string? ValorAnterior { get; set; }
    public string? ValorNuevo { get; set; }
    public string UsuarioAccion { get; set; } = string.Empty;
    public string? Observacion { get; set; }
}

public class AuditoriaCambioFiltroDto
{
    public string? Modulo { get; set; }
    public string? Entidad { get; set; }
    public string? IdRegistro { get; set; }
    public string? Seccion { get; set; }
    public string? Campo { get; set; }
    public string? UsuarioAccion { get; set; }
    public DateTime? FechaDesde { get; set; }
    public DateTime? FechaHasta { get; set; }
    public int Top { get; set; } = 300;
}

public class AuditoriaCambioConsultaDto
{
    public long IdAuditoria { get; set; }
    public string Modulo { get; set; } = string.Empty;
    public string Entidad { get; set; } = string.Empty;
    public string IdRegistro { get; set; } = string.Empty;
    public string Accion { get; set; } = string.Empty;
    public string? Seccion { get; set; }
    public string Campo { get; set; } = string.Empty;
    public string? ValorAnterior { get; set; }
    public string? ValorNuevo { get; set; }
    public string UsuarioAccion { get; set; } = string.Empty;
    public DateTime FechaAccion { get; set; }
    public string? Observacion { get; set; }
}
