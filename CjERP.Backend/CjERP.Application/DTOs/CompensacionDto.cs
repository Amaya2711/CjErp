namespace CjERP.Application.DTOs;

public sealed class CompensacionFiltroDto
{
    public int? IdEmpleadoCj { get; set; }
    public int? IdEstado { get; set; }
    public int? IdActivo { get; set; }
    public DateTime? FechaDesde { get; set; }
    public DateTime? FechaHasta { get; set; }
    public DateTime? FechaInicio { get; set; }
    public DateTime? FechaFin { get; set; }
    public bool IncluirInactivos { get; set; }
}

public sealed class CompensacionDto
{
    public long IdEmpleadoCompensacion { get; set; }
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
    public string NombreEmpleado { get; set; } = string.Empty;
    public int? IdResponsableCj { get; set; }
    public int? IdSegundoVacaciones { get; set; }
    public string Primer { get; set; } = string.Empty;
    public string Segundo { get; set; } = string.Empty;
    public string Estado { get; set; } = string.Empty;
    public string Activo { get; set; } = string.Empty;
    public decimal DiasBase { get; set; }
    public decimal DiasGanados { get; set; }
    public decimal DiasTomados { get; set; }
    public decimal DiasPendientes { get; set; }
    public decimal DiasDisponibles { get; set; }
    public decimal PorcentajeUso { get; set; }
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

public sealed class CompensacionSaldoDto
{
    public int? IdEmpleadoCj { get; set; }
    public string NombreEmpleado { get; set; } = string.Empty;
    public decimal DiasBase { get; set; }
    public decimal DiasGanados { get; set; }
    public decimal DiasTomados { get; set; }
    public decimal DiasPendientes { get; set; }
}

public sealed class ProcesarCompensacionRequestDto
{
    public int IdEmpleadoCj { get; set; }
    public DateTime FechaInicio { get; set; }
    public DateTime FechaFin { get; set; }
    public string Accion { get; set; } = string.Empty;
    public string? Comentario { get; set; }
    public string Usuario { get; set; } = string.Empty;
}

public sealed class ProcesarCompensacionResultDto
{
    public string Mensaje { get; set; } = string.Empty;
}
