export type ReporteWhatsappTipo = "operativo" | "gerencial" | "boleta";

export type ReporteWhatsappConfiguracion = {
  tipoReporte?: string;
  horaEjecucion: string;
  diasEjecucion?: string[];
  cantidadEmpleadosPorBloque: number;
  delaySegundosEntreBloques: number;
  activo: boolean;
  usarSemanaEnCurso?: boolean;
  usarMesEnCurso?: boolean;
  usuarioModificacion?: string;
  fechaModificacion?: string | null;
  usaRespaldoAppSettings?: boolean;
};

export type ReporteWhatsappPeriodo = {
  fechaInicio: string;
  fechaFin: string;
  fechaProceso: string;
  etiquetaPeriodo: string;
  periodo?: string;
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

export type ReporteWhatsappBoletaDestino = {
  idEmpleado: number;
  idBoleta?: number | null;
  usuario: string;
  nombreEmpleado: string;
  numeroDocumento: string;
  telefono: string;
  correo: string;
  periodo: string;
  nombreTrabajador: string;
  pdfDisponible: boolean;
  tieneTelefonoConfigurado: boolean;
  estadoPdf: string;
  estadoDestino: string;
};

export type ReporteWhatsappDashboard = {
  puedeAdministrar: boolean;
  configuracion: ReporteWhatsappConfiguracion;
  periodoActual: ReporteWhatsappPeriodo;
  runtime: ReporteWhatsappRuntime;
  kpis: ReporteWhatsappKpis;
  logs: ReporteWhatsappLog[];
  destinatarios?: ReporteWhatsappBoletaDestino[];
};

export type ReporteWhatsappEjecucionResultado = {
  accepted: boolean;
  alreadyRunning: boolean;
  executionId: string;
  jobId: string;
  message: string;
};

export type ReporteWhatsappEjecucionRequest = {
  idsEmpleadoSeleccionados?: number[];
};

export type ReporteWhatsappManualDestinatario = {
  idEmpleado: number;
  usuario: string;
  nombreEmpleado: string;
  telefono: string;
  correo: string;
};

export type ReporteWhatsappManualAdjunto = {
  nombreArchivo: string;
  contenidoBase64: string;
  contentType: string;
};

export type ReporteWhatsappManualSendRequest = {
  titulo: string;
  mensaje: string;
  destinatarios: ReporteWhatsappManualDestinatario[];
  adjuntos: ReporteWhatsappManualAdjunto[];
};

export type ReporteWhatsappManualSendItemResult = {
  idEmpleado: number;
  usuario: string;
  nombreEmpleado: string;
  telefono: string;
  totalAdjuntos: number;
  enviados: number;
  errores: number;
  estado: string;
  detalle: string;
};

export type ReporteWhatsappManualSendResult = {
  totalDestinatarios: number;
  totalAdjuntos: number;
  totalMensajes: number;
  enviados: number;
  errores: number;
  resultados: ReporteWhatsappManualSendItemResult[];
};
