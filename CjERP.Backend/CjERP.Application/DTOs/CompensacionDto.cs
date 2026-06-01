namespace CjERP.Application.DTOs;

public sealed class CompensacionFiltroDto
{
    public int? IdEmpleadoCj { get; set; }
    public int? IdEstado { get; set; }
    public DateTime? FechaDesde { get; set; }
    public DateTime? FechaHasta { get; set; }
    public bool IncluirInactivos { get; set; }
}

public sealed class CompensacionDto
{
    public int IdEmpleadoCompensacion { get; set; }
    public int? IdEmpleadoCj { get; set; }
    public int? IdEstado { get; set; }
    public DateTime? Fecha { get; set; }
    public int? IdActivo { get; set; }
    public int? IdAutorizado { get; set; }
    public DateTime? FechaAutorizado { get; set; }
    public DateTime? FechaInicio { get; set; }
    public DateTime? FechaFin { get; set; }
    public DateTime? FechaPre { get; set; }
    public DateTime? FechaPrimera { get; set; }
    public int? IdPre { get; set; }
    public int? IdPrimera { get; set; }
    public int? IdGestor { get; set; }
    public string Usuario { get; set; } = string.Empty;
    public DateTime? FechaCreacion { get; set; }
    public int? IdRechazo { get; set; }
    public DateTime? FechaRechazo { get; set; }
    public bool? Pagada { get; set; }
    public string Comentario { get; set; } = string.Empty;
    public string TipoCompensacion { get; set; } = string.Empty;
    public decimal CantidadDias { get; set; }
    public int? IdSaldoCompensacion { get; set; }
    public int? IdMovimiento { get; set; }
    public bool? ProcesadoSaldo { get; set; }
}

public sealed class CompensacionUpsertDto
{
    public int? IdEmpleadoCj { get; set; }
    public int? IdEstado { get; set; }
    public DateTime? Fecha { get; set; }
    public int? IdActivo { get; set; }
    public int? IdAutorizado { get; set; }
    public DateTime? FechaAutorizado { get; set; }
    public DateTime? FechaInicio { get; set; }
    public DateTime? FechaFin { get; set; }
    public DateTime? FechaPre { get; set; }
    public DateTime? FechaPrimera { get; set; }
    public int? IdPre { get; set; }
    public int? IdPrimera { get; set; }
    public int? IdGestor { get; set; }
    public string Usuario { get; set; } = string.Empty;
    public int? IdRechazo { get; set; }
    public DateTime? FechaRechazo { get; set; }
    public bool? Pagada { get; set; }
    public string Comentario { get; set; } = string.Empty;
    public string TipoCompensacion { get; set; } = string.Empty;
    public decimal CantidadDias { get; set; }
    public int? IdSaldoCompensacion { get; set; }
    public int? IdMovimiento { get; set; }
    public bool? ProcesadoSaldo { get; set; }
}
