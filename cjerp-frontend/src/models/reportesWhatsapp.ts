export type ReporteWhatsappTipo = "operativo" | "gerencial";

export type ReporteWhatsappConfiguracion = {
  tipoReporte?: string;
  horaEjecucion: string;
  diasEjecucion?: string[];
  cantidadEmpleadosPorBloque: number;
  delaySegundosEntreBloques: number;
  activo: boolean;
  usuarioModificacion?: string;
  fechaModificacion?: string | null;
  usaRespaldoAppSettings?: boolean;
};

export type ReporteWhatsappPeriodo = {
  fechaInicio: string;
  fechaFin: string;
  fechaProceso: string;
  etiquetaPeriodo: string;
};

export type ReporteWhatsappRuntime = {
  tipoReporte?: string;
  executionId: string;
  isRunning: boolean;
  origenEjecucion: string;
  usuarioEjecucion: string;
  fechaInicio?: string | null;
  fechaFin?: string | null;
  mensaje: string;
  totalEmpleados: number;
  empleadosProcesados: number;
  enviados: number;
  errores: number;
  omitidos: number;
  duplicados: number;
  bloqueActual: number;
  totalBloques: number;
  empleadoActualId?: number | null;
  empleadoActualNombre: string;
  segundosRestantesEstimados?: number | null;
  segundosEsperaBloqueActual?: number | null;
  periodo?: ReporteWhatsappPeriodo | null;
};

export type ReporteWhatsappKpis = {
  totalProcesados: number;
  totalEnviados: number;
  totalErrores: number;
  totalOmitidos: number;
  totalDuplicados: number;
  totalPendientesRetry: number;
};

export type ReporteWhatsappLog = {
  idLog: number;
  idEmpleado: number;
  usuario: string;
  telefono: string;
  fechaProceso: string;
  tipoReporte: string;
  estadoEnvio: string;
  mensajeError: string;
  fechaEnvio?: string | null;
  requestJson: string;
  responseJson: string;
  numeroBloque?: number | null;
  ordenEnvio?: number | null;
  tiempoEsperaEntreBloques?: number | null;
  duracionEnvioSegundos?: number | null;
  origenEjecucion: string;
  usuarioEjecucion: string;
  nombreEmpleado: string;
};

export type ReporteWhatsappDashboard = {
  puedeAdministrar: boolean;
  configuracion: ReporteWhatsappConfiguracion;
  periodoActual: ReporteWhatsappPeriodo;
  runtime: ReporteWhatsappRuntime;
  kpis: ReporteWhatsappKpis;
  logs: ReporteWhatsappLog[];
};

export type ReporteWhatsappEjecucionResultado = {
  accepted: boolean;
  alreadyRunning: boolean;
  executionId: string;
  jobId: string;
  message: string;
};
