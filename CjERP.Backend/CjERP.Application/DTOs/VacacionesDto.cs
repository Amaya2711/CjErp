namespace CjERP.Application.DTOs;

public sealed class VacacionesGrabarRequestDto
{
    public int IdEmpleadoCj { get; set; }
    public DateTime FechaInicio { get; set; }
    public DateTime FechaFin { get; set; }
    public int? IdEstado { get; set; }
}

public sealed class VacacionesRechazarRequestDto
{
    public int IdEmpleadoCj { get; set; }
    public DateTime FechaInicio { get; set; }
    public DateTime FechaFin { get; set; }
}

public sealed class VacacionesAprobarRequestDto
{
    public int IdEmpleadoCj { get; set; }
    public DateTime FechaInicio { get; set; }
    public DateTime FechaFin { get; set; }
    public int IdEstadoActual { get; set; }
}

public sealed class VacacionesGrabarResultDto
{
    public int? Exito { get; set; }
    public int? Resultado { get; set; }
    public int? Ok { get; set; }
    public string? Mensaje { get; set; }
    public int? DiasSolicitados { get; set; }
    public int? DiasInsertados { get; set; }
    public int? IdEmpleadoOtros { get; set; }
    public int? FilasEmpleadoOtrosActualizadas { get; set; }
}

public sealed class VacacionPoliticaGuardarRequestDto
{
    public int? IdPolitica { get; set; }
    public string Codigo { get; set; } = string.Empty;
    public string Nombre { get; set; } = string.Empty;
    public string? Descripcion { get; set; }
    public decimal DiasBase { get; set; }
    public decimal DiasAdicionales { get; set; }
    public decimal DiasMaximoAcumulable { get; set; }
    public int MesesMinimosGoce { get; set; } = 12;
    public bool PermiteFraccionamiento { get; set; } = true;
    public int MinDiasFraccion { get; set; } = 1;
    public decimal? MaxDiasPorSolicitud { get; set; }
    public bool Vigente { get; set; } = true;
    public string? Observacion { get; set; }
}

public sealed class VacacionPeriodoGenerarRequestDto
{
    public int IdEmpleado { get; set; }
    public int IdPolitica { get; set; }
    public int Anio { get; set; }
    public string? Observacion { get; set; }
}

public sealed class VacacionPeriodoGenerarMasivoRequestDto
{
    public int Anio { get; set; }
    public int IdPolitica { get; set; }
    public string? Observacion { get; set; }
}

public sealed class VacacionSaldoDto
{
    public int IdPeriodo { get; set; }
    public int IdEmpleado { get; set; }
    public int IdPolitica { get; set; }
    public int Anio { get; set; }
    public DateTime? FechaInicioPeriodo { get; set; }
    public DateTime? FechaFinPeriodo { get; set; }
    public decimal DiasOtorgados { get; set; }
    public decimal DiasConsumidos { get; set; }
    public decimal DiasReservados { get; set; }
    public decimal DiasDisponibles { get; set; }
    public string? Estado { get; set; }
}

public sealed class VacacionSolicitudListItemDto
{
    public int IdSolicitud { get; set; }
    public int IdEmpleado { get; set; }
    public string? NombreEmpleado { get; set; }
    public string? NroDocumento { get; set; }
    public int IdPeriodo { get; set; }
    public int? Anio { get; set; }
    public DateTime? FechaInicio { get; set; }
    public DateTime? FechaFin { get; set; }
    public decimal CantidadDias { get; set; }
    public string? Estado { get; set; }
    public string? Motivo { get; set; }
    public string? Observacion { get; set; }
    public DateTime? FechaCreacion { get; set; }
    public string? UsuarioCreacion { get; set; }
    public DateTime? FechaAprobacion { get; set; }
    public string? UsuarioAprobacion { get; set; }
    public DateTime? FechaRechazo { get; set; }
    public string? UsuarioRechazo { get; set; }
    public string? MotivoRechazo { get; set; }
    public DateTime? FechaCancelacion { get; set; }
    public string? UsuarioCancelacion { get; set; }
    public string? MotivoCancelacion { get; set; }
    public DateTime? FechaFinalizacion { get; set; }
    public string? UsuarioFinalizacion { get; set; }
}

public sealed class VacacionSolicitudListarRequestDto
{
    public string? Estado { get; set; }
    public DateTime? FechaInicioDesde { get; set; }
    public DateTime? FechaInicioHasta { get; set; }
    public string? NombreEmpleado { get; set; }
    public int? IdEmpleado { get; set; }
}

public sealed class VacacionMovimientoListItemDto
{
    public int IdVacacionMovimiento { get; set; }
    public int IdEmpleado { get; set; }
    public string? NombreEmpleado { get; set; }
    public string? NroDocumento { get; set; }
    public int IdPeriodo { get; set; }
    public int? Anio { get; set; }
    public int? IdSolicitud { get; set; }
    public DateTime FechaMovimiento { get; set; }
    public string TipoMovimiento { get; set; } = string.Empty;
    public decimal CantidadDias { get; set; }
    public string Estado { get; set; } = string.Empty;
    public string? Referencia { get; set; }
    public string? Observacion { get; set; }
    public int? IdMovimientoOrigen { get; set; }
    public string? UsuarioCreacion { get; set; }
    public DateTime? FechaCreacion { get; set; }
}

public sealed class VacacionMovimientoListarRequestDto
{
    public DateTime? FechaDesde { get; set; }
    public DateTime? FechaHasta { get; set; }
    public string? Estado { get; set; }
    public string? TipoMovimiento { get; set; }
    public string? NombreEmpleado { get; set; }
    public int? IdEmpleado { get; set; }
}

public sealed class VacacionSolicitudRegistrarRequestDto
{
    public int IdEmpleado { get; set; }
    public int IdPeriodo { get; set; }
    public DateTime FechaInicio { get; set; }
    public DateTime FechaFin { get; set; }
    public decimal CantidadDias { get; set; }
    public string? Motivo { get; set; }
    public string? Observacion { get; set; }
}

public sealed class VacacionSolicitudAprobarRequestDto
{
    public int IdSolicitud { get; set; }
    public string? Observacion { get; set; }
}

public sealed class VacacionSolicitudRechazarRequestDto
{
    public int IdSolicitud { get; set; }
    public string MotivoRechazo { get; set; } = string.Empty;
    public string? Observacion { get; set; }
}

public sealed class VacacionSolicitudCancelarRequestDto
{
    public int IdSolicitud { get; set; }
    public string MotivoCancelacion { get; set; } = string.Empty;
    public string? Observacion { get; set; }
}

public sealed class VacacionSolicitudFinalizarRequestDto
{
    public int IdSolicitud { get; set; }
    public string? Observacion { get; set; }
}

public sealed class VacacionMovimientoRevertirRequestDto
{
    public int IdVacacionMovimiento { get; set; }
    public string? Observacion { get; set; }
}

public sealed class VacacionOperacionResultDto
{
    public int? Ok { get; set; }
    public int? Exito { get; set; }
    public int? Resultado { get; set; }
    public string? Accion { get; set; }
    public string? Mensaje { get; set; }
    public int? IdPolitica { get; set; }
    public int? IdPeriodo { get; set; }
    public int? IdSolicitud { get; set; }
    public int? IdVacacionMovimiento { get; set; }
    public int? IdMovimientoReversa { get; set; }
}
