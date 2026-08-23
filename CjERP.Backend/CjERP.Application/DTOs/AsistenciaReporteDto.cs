namespace CjERP.Application.DTOs;

public class AsistenciaReporteRequestDto
{
    public string FechaInicio { get; set; } = string.Empty;
    public string FechaFin { get; set; } = string.Empty;
}

public class AsistenciaReportePdfRequestDto
{
    public string FechaInicio { get; set; } = string.Empty;
    public string FechaFin { get; set; } = string.Empty;
    public string Destinatario { get; set; } = "Reporte x Empleado";
    public IReadOnlyList<AsistenciaReportePdfItemDto> Items { get; set; } = Array.Empty<AsistenciaReportePdfItemDto>();
}

public sealed class AsistenciaGerencialPdfRequestDto
{
    public string? FechaInicio { get; set; }
    public string? FechaFin { get; set; }
    public bool UsarPeriodoAutomatico { get; set; } = true;
    public string Destinatario { get; set; } = "Gerencia CJ Telecom";
}

public sealed class AsistenciaActualizarEstadoMarcacionRequestDto
{
    public int? IdEmpleado { get; set; }
    public string FechaAsistencia { get; set; } = string.Empty;
    public int IdEstado { get; set; }
    public string EstadoMarcacionAnterior { get; set; } = string.Empty;
    public string EstadoMarcacionNuevo { get; set; } = string.Empty;
}

public sealed class AsistenciaLlamadaAtencionEstadoRequestDto
{
    public IReadOnlyList<int> IdsEmpleado { get; set; } = Array.Empty<int>();
}

public sealed class AsistenciaTrackingConsultaRequestDto
{
    public int IdEmpleado { get; set; }
    public string FechaAsistencia { get; set; } = string.Empty;
}

public class AsistenciaReportePdfItemDto
{
    public string Fecha { get; set; } = string.Empty;
    public string Hora { get; set; } = string.Empty;
    public string NombreEmpleado { get; set; } = string.Empty;
    public string Telefono { get; set; } = string.Empty;
    public string CorreoEmpleado { get; set; } = string.Empty;
    public string CorreoResponsable { get; set; } = string.Empty;
    public string Responsable { get; set; } = string.Empty;
    public string Empresa { get; set; } = string.Empty;
    public string Cliente { get; set; } = string.Empty;
    public string Area { get; set; } = string.Empty;
    public string Ubicacion { get; set; } = string.Empty;
    public int? IdEmpleado { get; set; }
    public string Salida { get; set; } = string.Empty;
    public string Estado { get; set; } = string.Empty;
    public string EstadoMarcacionTexto { get; set; } = string.Empty;
    public decimal TotalHoras { get; set; }
    public decimal TotalHorasFaltaIncompleto { get; set; }
    public decimal TotalHorasEmpleado { get; set; }
    public decimal TotalHorasLaborales { get; set; }
    public decimal TotalHorasFaltaAprobar { get; set; }
    public decimal DiferenciaHoras { get; set; }
    public string EstadoValidacionHoras { get; set; } = string.Empty;
    public string Comentario { get; set; } = string.Empty;
    public string Observacion { get; set; } = string.Empty;
}

public class AsistenciaReporteDto
{
    public string Fecha { get; set; } = string.Empty;
    public string Hora { get; set; } = string.Empty;
    public string NombreEmpleado { get; set; } = string.Empty;
    public string Telefono { get; set; } = string.Empty;
    public string CorreoEmpleado { get; set; } = string.Empty;
    public string CorreoResponsable { get; set; } = string.Empty;
    public string TipoAprobacion { get; set; } = string.Empty;
    public string Responsable { get; set; } = string.Empty;
    public string Estado { get; set; } = string.Empty;
    public string Comentario { get; set; } = string.Empty;
    public string Observacion { get; set; } = string.Empty;
    public string Empresa { get; set; } = string.Empty;
    public string Cliente { get; set; } = string.Empty;
    public string Proyecto { get; set; } = string.Empty;
    public string Site { get; set; } = string.Empty;
    public string Area { get; set; } = string.Empty;
    public string Ubicacion { get; set; } = string.Empty;
    public int? IdEmpleado { get; set; }
    public string EstadoAct { get; set; } = string.Empty;
    public string Sexo { get; set; } = string.Empty;
    public string FechaIniLaboral { get; set; } = string.Empty;
    public string FechaFinLaboral { get; set; } = string.Empty;
    public string Salida { get; set; } = string.Empty;
    public string EstadoMarcacionTexto { get; set; } = string.Empty;
    public string TiempoTrabajado { get; set; } = string.Empty;
    public decimal TotalHoras { get; set; }
    public decimal TotalHorasEmpleado { get; set; }
    public decimal TotalHorasLaborales { get; set; }
    public decimal TotalHorasFaltaAprobar { get; set; }
    public string EstadoValidacionHoras { get; set; } = string.Empty;
    public string TiempoHoras { get; set; } = string.Empty;
    public string OrigenMarcacion { get; set; } = string.Empty;
}

public sealed class AsistenciaTrackingConsultaDto
{
    public int IdEmpleado { get; set; }
    public string NombreEmpleado { get; set; } = string.Empty;
    public string FechaAsistencia { get; set; } = string.Empty;
    public IReadOnlyList<AsistenciaTrackingPuntoDto> Puntos { get; set; } = Array.Empty<AsistenciaTrackingPuntoDto>();
}

public sealed class AsistenciaTrackingPuntoDto
{
    public int IdEmpleado { get; set; }
    public string NombreEmpleado { get; set; } = string.Empty;
    public string FechaAsistencia { get; set; } = string.Empty;
    public string Hora { get; set; } = string.Empty;
    public string? HoraSalida { get; set; }
    public decimal? LatPto { get; set; }
    public decimal? LonPto { get; set; }
    public string Source { get; set; } = string.Empty;
    public DateTime? FechaHora { get; set; }
}

public sealed class AsistenciaGerencialPdfDto
{
    public string Titulo { get; set; } = "Reporte Gerencial de Asistencia";
    public string PeriodoConsultado { get; set; } = string.Empty;
    public DateTime FechaGeneracion { get; set; }
    public string Destinatario { get; set; } = string.Empty;
    public string NombreArchivo { get; set; } = string.Empty;
    public AsistenciaGerencialPeriodoDto Periodo { get; set; } = new();
    public AsistenciaGerencialKpisDto Kpis { get; set; } = new();
    public AsistenciaGerencialGraficosDto Graficos { get; set; } = new();
    public AsistenciaGerencialIncidenciasDto Incidencias { get; set; } = new();
    public IReadOnlyList<AsistenciaGerencialConclusionDto> ResumenEjecutivo { get; set; } = Array.Empty<AsistenciaGerencialConclusionDto>();
}

public sealed class AsistenciaGerencialPeriodoDto
{
    public DateTime FechaInicio { get; set; }
    public DateTime FechaFin { get; set; }
    public string FechaInicioTexto { get; set; } = string.Empty;
    public string FechaFinTexto { get; set; } = string.Empty;
}

public sealed class AsistenciaGerencialKpisDto
{
    public int TotalEmpleados { get; set; }
    public int TotalRegistros { get; set; }
    public decimal PorcentajeAsistencia { get; set; }
    public int Presentes { get; set; }
    public int Tardanzas { get; set; }
    public int SinMarcar { get; set; }
    public int SinSalida { get; set; }
    public decimal TotalHorasLaboradas { get; set; }
    public decimal PromedioHorasPorEmpleado { get; set; }
    public int PendientesAprobacion { get; set; }
    public int EmpleadosConDiferenciaNegativa { get; set; }
    public string SemaforoGeneral { get; set; } = "VERDE";
}

public sealed class AsistenciaGerencialGraficosDto
{
    public IReadOnlyList<AsistenciaGerencialEstadoChartItemDto> DistribucionPorEstado { get; set; } = Array.Empty<AsistenciaGerencialEstadoChartItemDto>();
    public IReadOnlyList<AsistenciaGerencialTendenciaDiariaDto> TendenciaDiaria { get; set; } = Array.Empty<AsistenciaGerencialTendenciaDiariaDto>();
    public IReadOnlyList<AsistenciaGerencialRankingItemDto> TopResponsables { get; set; } = Array.Empty<AsistenciaGerencialRankingItemDto>();
    public IReadOnlyList<AsistenciaGerencialRankingItemDto> TopEmpleados { get; set; } = Array.Empty<AsistenciaGerencialRankingItemDto>();
}

public sealed class AsistenciaGerencialIncidenciasDto
{
    public IReadOnlyList<AsistenciaGerencialGrupoIncidenciaDto> IncidenciasPorResponsable { get; set; } = Array.Empty<AsistenciaGerencialGrupoIncidenciaDto>();
    public IReadOnlyList<AsistenciaGerencialGrupoIncidenciaDto> IncidenciasPorCliente { get; set; } = Array.Empty<AsistenciaGerencialGrupoIncidenciaDto>();
    public IReadOnlyList<AsistenciaGerencialGrupoIncidenciaDto> IncidenciasPorArea { get; set; } = Array.Empty<AsistenciaGerencialGrupoIncidenciaDto>();
    public IReadOnlyList<AsistenciaGerencialGrupoIncidenciaDto> IncidenciasPorEstado { get; set; } = Array.Empty<AsistenciaGerencialGrupoIncidenciaDto>();
    public IReadOnlyList<AsistenciaGerencialPendienteAprobacionDto> PendientesAprobacion { get; set; } = Array.Empty<AsistenciaGerencialPendienteAprobacionDto>();
    public IReadOnlyList<AsistenciaGerencialEmpleadoDiferenciaDto> EmpleadosConDiferenciaNegativa { get; set; } = Array.Empty<AsistenciaGerencialEmpleadoDiferenciaDto>();
    public IReadOnlyList<string> RecomendacionesEjecutivas { get; set; } = Array.Empty<string>();
}

public sealed class AsistenciaGerencialConclusionDto
{
    public string Semaforo { get; set; } = "VERDE";
    public string Titulo { get; set; } = string.Empty;
    public string Descripcion { get; set; } = string.Empty;
}

public sealed class AsistenciaGerencialEstadoChartItemDto
{
    public string Estado { get; set; } = string.Empty;
    public int Cantidad { get; set; }
    public decimal Porcentaje { get; set; }
    public string Semaforo { get; set; } = "VERDE";
}

public sealed class AsistenciaGerencialTendenciaDiariaDto
{
    public DateTime Fecha { get; set; }
    public string FechaTexto { get; set; } = string.Empty;
    public int TotalRegistros { get; set; }
    public int Presentes { get; set; }
    public int Incidencias { get; set; }
    public decimal PorcentajeAsistencia { get; set; }
}

public sealed class AsistenciaGerencialRankingItemDto
{
    public string Nombre { get; set; } = string.Empty;
    public int Cantidad { get; set; }
    public decimal Horas { get; set; }
    public string EtiquetaSecundaria { get; set; } = string.Empty;
    public string Semaforo { get; set; } = "VERDE";
}

public sealed class AsistenciaGerencialGrupoIncidenciaDto
{
    public string Nombre { get; set; } = string.Empty;
    public int Cantidad { get; set; }
    public decimal Porcentaje { get; set; }
}

public sealed class AsistenciaGerencialPendienteAprobacionDto
{
    public string NombreEmpleado { get; set; } = string.Empty;
    public string Responsable { get; set; } = string.Empty;
    public int CantidadPendientes { get; set; }
    public decimal HorasPendientes { get; set; }
}

public sealed class AsistenciaGerencialEmpleadoDiferenciaDto
{
    public string NombreEmpleado { get; set; } = string.Empty;
    public string Responsable { get; set; } = string.Empty;
    public decimal DiferenciaHoras { get; set; }
    public decimal HorasLaboradas { get; set; }
    public decimal HorasConsideradas { get; set; }
}
