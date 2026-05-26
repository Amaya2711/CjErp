export type AsistenciaReporteQueryParams = {
  fechaInicio: string;
  fechaFin: string;
};

export type AsistenciaReporteItem = {
  fecha: string;
  hora: string;
  nombreEmpleado: string;
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
  responsable: string;
  ubicacion: string;
  idEmpleado: number | null;
  salida: string;
  estadoMarcacionTexto: string;
  totalHoras: number;
  totalHorasFaltaIncompleto: number;
  totalHorasEmpleado: number;
  totalHorasLaborales: number;
  totalHorasFaltaAprobar: number;
  diferenciaHoras: number;
  estadoValidacionHoras: string;
  observacion: string;
};

export type AsistenciaReportePdfRequest = {
  fechaInicio: string;
  fechaFin: string;
  destinatario: string;
  items: AsistenciaReportePdfItem[];
};
