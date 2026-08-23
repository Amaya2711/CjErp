import httpClient from "./httpClient";

export type SqlMonitorResumen = {
  estadoServidor: string;
  semaforo: string;
  sesionesUsuario: number;
  requestsActivos: number;
  requestsBloqueados: number;
  conexiones: number;
  memoriaSqlMb: number;
  memoriaDisponibleMb: number;
  pageLifeExpectancySegundos: number;
  alertasPendientes: number;
  sesionesMonitor: number;
  requestsMonitor: number;
  cpuSqlMs: number;
  logicalReadsMonitor: number;
  readsMonitor: number;
  writesMonitor: number;
  observacion?: string | null;
};

export type SqlMonitorQuery = {
  id: number;
  fechaHora?: string | null;
  sessionId?: number | null;
  databaseName: string;
  status: string;
  command: string;
  cpuTimeMs: number;
  elapsedTimeMs: number;
  reads: number;
  writes: number;
  logicalReads: number;
  cantidadFilas: number;
  waitType: string;
  waitTimeMs: number;
  blockingSessionId?: number | null;
  hostName: string;
  programName: string;
  loginName: string;
  nivel: string;
};

export type SqlMonitorSesionActiva = {
  id: number;
  sessionId?: number | null;
  databaseName: string;
  status: string;
  hostName: string;
  programName: string;
  loginName: string;
  cpuTimeMs: number;
  elapsedTimeMs: number;
  reads: number;
  writes: number;
  logicalReads: number;
  blockingSessionId?: number | null;
  waitType: string;
  waitTimeMs: number;
  loginTime?: string | null;
  lastRequestStartTime?: string | null;
  lastRequestEndTime?: string | null;
  openTransactionCount: number;
  nivel: string;
};

export type SqlMonitorTopSql = {
  id: number;
  executionCount: number;
  cpuTotalMs: number;
  cpuPromedioMs: number;
  tiempoTotalMs: number;
  tiempoPromedioMs: number;
  logicalReadsTotal: number;
  logicalReadsPromedio: number;
  logicalWritesTotal: number;
  rowsTotal: number;
  lastExecutionTime?: string | null;
  sqlText: string;
};

export type SqlMonitorBloqueo = {
  id: number;
  sessionId?: number | null;
  blockingSessionId?: number | null;
  databaseName: string;
  waitType: string;
  waitTimeMs: number;
  waitResource: string;
  hostName: string;
  programName: string;
  loginName: string;
  sqlText: string;
  nivel: string;
};

export type SqlMonitorNetwork = {
  id: number;
  fechaHora?: string | null;
  sessionId?: number | null;
  databaseName: string;
  waitTimeMs: number;
  elapsedTimeMs: number;
  cpuTimeMs: number;
  cantidadFilas: number;
  reads: number;
  writes: number;
  logicalReads: number;
  hostName: string;
  programName: string;
  loginName: string;
  sqlText: string;
};

export type SqlMonitorAlerta = {
  id: number;
  fechaHora?: string | null;
  tipoAlerta: string;
  nivel: string;
  sessionId?: number | null;
  databaseName: string;
  titulo: string;
  detalle: string;
  estado: string;
  analizadoIA: boolean;
};

export type SqlMonitorOverhead = {
  snapshotsUltimos5Min: number;
  queriesGuardadasUltimos5Min: number;
  bloqueosGuardadosUltimos5Min: number;
  sesionesMonitor: number;
  requestsMonitorActivos: number;
  cpuMonitorActualMs: number;
  logicalReadsMonitorActual: number;
  readsMonitorActual: number;
  writesMonitorActual: number;
  nivel: string;
  observacion?: string | null;
};

export type SqlMonitorQueryDetalle = {
  id: number;
  fechaHora?: string | null;
  sessionId?: number | null;
  databaseName: string;
  status: string;
  command: string;
  cpuTimeMs: number;
  elapsedTimeMs: number;
  reads: number;
  writes: number;
  logicalReads: number;
  cantidadFilas: number;
  waitType: string;
  waitTimeMs: number;
  waitResource: string;
  blockingSessionId?: number | null;
  hostName: string;
  programName: string;
  loginName: string;
  nivel: string;
  sqlText: string;
  queryPlan?: string | null;
};

export type SqlMonitorAnalisis = {
  nivelRiesgo: string;
  diagnostico: string;
  causaProbable: string;
  recomendaciones: string[];
  indicesPotenciales: string[];
  observaciones: string[];
};

export type SqlMonitorAlertaFiltros = {
  nivel?: string;
  tipoAlerta?: string;
  estado?: string;
  fecha?: string;
};

export const sqlMonitorService = {
  async obtenerResumen(): Promise<SqlMonitorResumen> {
    return httpClient.get<SqlMonitorResumen>("/sqlmonitor/resumen");
  },

  async obtenerQueries(): Promise<SqlMonitorQuery[]> {
    return httpClient.get<SqlMonitorQuery[]>("/sqlmonitor/queries");
  },

  async obtenerSesionesActivas(): Promise<SqlMonitorSesionActiva[]> {
    return httpClient.get<SqlMonitorSesionActiva[]>("/sqlmonitor/sesiones");
  },

  async obtenerTopSql(rango?: string): Promise<SqlMonitorTopSql[]> {
    return httpClient.get<SqlMonitorTopSql[]>("/sqlmonitor/top-sql", {
      params: { rango: rango ?? undefined },
    });
  },

  async obtenerBloqueos(): Promise<SqlMonitorBloqueo[]> {
    return httpClient.get<SqlMonitorBloqueo[]>("/sqlmonitor/bloqueos");
  },

  async obtenerNetwork(): Promise<SqlMonitorNetwork[]> {
    return httpClient.get<SqlMonitorNetwork[]>("/sqlmonitor/network");
  },

  async obtenerAlertas(filtros: SqlMonitorAlertaFiltros = {}): Promise<SqlMonitorAlerta[]> {
    return httpClient.get<SqlMonitorAlerta[]>("/sqlmonitor/alertas", {
      params: {
        nivel: filtros.nivel || undefined,
        tipoAlerta: filtros.tipoAlerta || undefined,
        estado: filtros.estado || undefined,
        fecha: filtros.fecha || undefined,
      },
    });
  },

  async obtenerOverhead(): Promise<SqlMonitorOverhead> {
    return httpClient.get<SqlMonitorOverhead>("/sqlmonitor/overhead");
  },

  async obtenerQueryDetalle(id: number): Promise<SqlMonitorQueryDetalle> {
    return httpClient.get<SqlMonitorQueryDetalle>(`/sqlmonitor/query/${id}`);
  },

  async analizarQuery(id: number): Promise<SqlMonitorAnalisis> {
    return httpClient.post<SqlMonitorAnalisis>(`/sqlmonitor/analizar/${id}`);
  },
};
