export type AsistenciaReporteQueryParams = {
  fechaInicio: string;
  fechaFin: string;
};

export type AsistenciaReporteItem = {
  fecha: string;
  hora: string;
  nombreEmpleado: string;
  telefono: string;
  correoEmpleado: string;
  correoResponsable: string;
  tipoAprobacion: string;
  responsable: string;
  estado: string;
  comentario: string;
  observacion: string;
  empresa: string;
  cliente: string;
  proyecto: string;
  site: string;
  area: string;
  ubicacion: string;
  idEmpleado: number | null;
  estadoAct: string;
  sexo: string;
  fechaIniLaboral: string;
  fechaFinLaboral: string;
  salida: string;
  estadoMarcacionTexto: string;
  tiempoTrabajado: string;
  totalHoras: number;
  totalHorasEmpleado: number;
  totalHorasLaborales: number;
  totalHorasFaltaAprobar: number;
  estadoValidacionHoras: string;
  tiempoHoras: string;
  origenMarcacion: string;
};

export type AsistenciaReportePdfItem = {
  fecha: string;
  hora: string;
  nombreEmpleado: string;
  telefono: string;
  correoEmpleado: string;
  correoResponsable: string;
  responsable: string;
  empresa?: string;
  cliente?: string;
  area?: string;
  ubicacion: string;
  idEmpleado: number | null;
  salida: string;
  estado: string;
  estadoMarcacionTexto: string;
  totalHoras: number;
  totalHorasFaltaIncompleto: number;
  totalHorasEmpleado: number;
  totalHorasLaborales: number;
  totalHorasFaltaAprobar: number;
  diferenciaHoras: number;
  estadoValidacionHoras: string;
  comentario: string;
  observacion: string;
};

export type AsistenciaReportePdfRequest = {
  fechaInicio: string;
  fechaFin: string;
  destinatario: string;
  items: AsistenciaReportePdfItem[];
};

export type AsistenciaGerencialPdfRequest = {
  fechaInicio?: string;
  fechaFin?: string;
  usarPeriodoAutomatico?: boolean;
  destinatario?: string;
};

export type AsistenciaEnviarPdfLlamadaAtencionResponse = {
  accepted: boolean;
  alreadyRunning?: boolean;
  executionId?: string;
  jobId?: string;
  message: string;
};

export type AsistenciaActualizarEstadoMarcacionRequest = {
  idEmpleado: number;
  fechaAsistencia: string;
  idEstado: number;
  estadoMarcacionAnterior: string;
  estadoMarcacionNuevo: string;
};

export type AsistenciaTrackingQueryParams = {
  idEmpleado: number;
  fechaAsistencia: string;
};

export type AsistenciaTrackingPunto = {
  idEmpleado: number;
  nombreEmpleado: string;
  fechaAsistencia: string;
  hora: string;
  horaSalida?: string | null;
  latPto: number | null;
  lonPto: number | null;
  source: string;
  fechaHora: string | null;
  imagen?: string | null;
  imagenSalida?: string | null;
  imagenFinal?: string | null;
};

export type AsistenciaTrackingResponse = {
  idEmpleado: number;
  nombreEmpleado: string;
  fechaAsistencia: string;
  puntos: AsistenciaTrackingPunto[];
};
