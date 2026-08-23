namespace CjERP.Application.DTOs.SqlMonitor;

public sealed class SqlMonitorResumenDto
{
    public string EstadoServidor { get; set; } = string.Empty;
    public string Semaforo { get; set; } = string.Empty;
    public int SesionesUsuario { get; set; }
    public int RequestsActivos { get; set; }
    public int RequestsBloqueados { get; set; }
    public int Conexiones { get; set; }
    public decimal MemoriaSqlMb { get; set; }
    public decimal MemoriaDisponibleMb { get; set; }
    public decimal PageLifeExpectancySegundos { get; set; }
    public int AlertasPendientes { get; set; }
    public int SesionesMonitor { get; set; }
    public int RequestsMonitor { get; set; }
    public decimal CpuSqlMs { get; set; }
    public decimal LogicalReadsMonitor { get; set; }
    public decimal ReadsMonitor { get; set; }
    public decimal WritesMonitor { get; set; }
    public string? Observacion { get; set; }
}

public sealed class SqlMonitorQueryDto
{
    public long Id { get; set; }
    public DateTime? FechaHora { get; set; }
    public int? SessionId { get; set; }
    public string DatabaseName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Command { get; set; } = string.Empty;
    public decimal CpuTimeMs { get; set; }
    public decimal ElapsedTimeMs { get; set; }
    public decimal Reads { get; set; }
    public decimal Writes { get; set; }
    public decimal LogicalReads { get; set; }
    public decimal CantidadFilas { get; set; }
    public string WaitType { get; set; } = string.Empty;
    public decimal WaitTimeMs { get; set; }
    public int? BlockingSessionId { get; set; }
    public string HostName { get; set; } = string.Empty;
    public string ProgramName { get; set; } = string.Empty;
    public string LoginName { get; set; } = string.Empty;
    public string Nivel { get; set; } = string.Empty;
}

public sealed class SqlMonitorSesionActivaDto
{
    public long Id { get; set; }
    public int? SessionId { get; set; }
    public string DatabaseName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string HostName { get; set; } = string.Empty;
    public string ProgramName { get; set; } = string.Empty;
    public string LoginName { get; set; } = string.Empty;
    public decimal CpuTimeMs { get; set; }
    public decimal ElapsedTimeMs { get; set; }
    public decimal Reads { get; set; }
    public decimal Writes { get; set; }
    public decimal LogicalReads { get; set; }
    public int? BlockingSessionId { get; set; }
    public string WaitType { get; set; } = string.Empty;
    public decimal WaitTimeMs { get; set; }
    public DateTime? LoginTime { get; set; }
    public DateTime? LastRequestStartTime { get; set; }
    public string LastRequestEndTime { get; set; } = string.Empty;
    public int OpenTransactionCount { get; set; }
    public string Nivel { get; set; } = string.Empty;
}

public sealed class SqlMonitorTopSqlDto
{
    public long Id { get; set; }
    public int ExecutionCount { get; set; }
    public decimal CpuTotalMs { get; set; }
    public decimal CpuPromedioMs { get; set; }
    public decimal TiempoTotalMs { get; set; }
    public decimal TiempoPromedioMs { get; set; }
    public decimal LogicalReadsTotal { get; set; }
    public decimal LogicalReadsPromedio { get; set; }
    public decimal LogicalWritesTotal { get; set; }
    public decimal RowsTotal { get; set; }
    public DateTime? LastExecutionTime { get; set; }
    public string SqlText { get; set; } = string.Empty;
}

public sealed class SqlMonitorBloqueoDto
{
    public long Id { get; set; }
    public int? SessionId { get; set; }
    public int? BlockingSessionId { get; set; }
    public string DatabaseName { get; set; } = string.Empty;
    public string WaitType { get; set; } = string.Empty;
    public decimal WaitTimeMs { get; set; }
    public string WaitResource { get; set; } = string.Empty;
    public string HostName { get; set; } = string.Empty;
    public string ProgramName { get; set; } = string.Empty;
    public string LoginName { get; set; } = string.Empty;
    public string SqlText { get; set; } = string.Empty;
    public string Nivel { get; set; } = string.Empty;
}

public sealed class SqlMonitorNetworkDto
{
    public long Id { get; set; }
    public DateTime? FechaHora { get; set; }
    public int? SessionId { get; set; }
    public string DatabaseName { get; set; } = string.Empty;
    public decimal WaitTimeMs { get; set; }
    public decimal ElapsedTimeMs { get; set; }
    public decimal CpuTimeMs { get; set; }
    public decimal CantidadFilas { get; set; }
    public decimal Reads { get; set; }
    public decimal Writes { get; set; }
    public decimal LogicalReads { get; set; }
    public string HostName { get; set; } = string.Empty;
    public string ProgramName { get; set; } = string.Empty;
    public string LoginName { get; set; } = string.Empty;
    public string SqlText { get; set; } = string.Empty;
}

public sealed class SqlMonitorAlertaDto
{
    public long Id { get; set; }
    public DateTime? FechaHora { get; set; }
    public string TipoAlerta { get; set; } = string.Empty;
    public string Nivel { get; set; } = string.Empty;
    public int? SessionId { get; set; }
    public string DatabaseName { get; set; } = string.Empty;
    public string Titulo { get; set; } = string.Empty;
    public string Detalle { get; set; } = string.Empty;
    public string Estado { get; set; } = string.Empty;
    public bool AnalizadoIA { get; set; }
}

public sealed class SqlMonitorOverheadDto
{
    public int SnapshotsUltimos5Min { get; set; }
    public int QueriesGuardadasUltimos5Min { get; set; }
    public int BloqueosGuardadosUltimos5Min { get; set; }
    public int SesionesMonitor { get; set; }
    public int RequestsMonitorActivos { get; set; }
    public decimal CpuMonitorActualMs { get; set; }
    public decimal LogicalReadsMonitorActual { get; set; }
    public decimal ReadsMonitorActual { get; set; }
    public decimal WritesMonitorActual { get; set; }
    public string Nivel { get; set; } = string.Empty;
    public string? Observacion { get; set; }
}

public sealed class SqlMonitorQueryDetalleDto
{
    public long Id { get; set; }
    public DateTime? FechaHora { get; set; }
    public int? SessionId { get; set; }
    public string DatabaseName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Command { get; set; } = string.Empty;
    public decimal CpuTimeMs { get; set; }
    public decimal ElapsedTimeMs { get; set; }
    public decimal Reads { get; set; }
    public decimal Writes { get; set; }
    public decimal LogicalReads { get; set; }
    public decimal CantidadFilas { get; set; }
    public string WaitType { get; set; } = string.Empty;
    public decimal WaitTimeMs { get; set; }
    public string WaitResource { get; set; } = string.Empty;
    public int? BlockingSessionId { get; set; }
    public string HostName { get; set; } = string.Empty;
    public string ProgramName { get; set; } = string.Empty;
    public string LoginName { get; set; } = string.Empty;
    public string Nivel { get; set; } = string.Empty;
    public string SqlText { get; set; } = string.Empty;
    public string? QueryPlan { get; set; }
}

public sealed class SqlMonitorAnalisisDto
{
    public string NivelRiesgo { get; set; } = string.Empty;
    public string Diagnostico { get; set; } = string.Empty;
    public string CausaProbable { get; set; } = string.Empty;
    public List<string> Recomendaciones { get; set; } = [];
    public List<string> IndicesPotenciales { get; set; } = [];
    public List<string> Observaciones { get; set; } = [];
}
