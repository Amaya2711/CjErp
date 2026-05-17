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
  empresa: string;
  cliente: string;
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
  totalHorasLaborales: number;
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
  totalHorasEmpleado: number;
  totalHorasLaborales: number;
  estadoValidacionHoras: string;
};

export type AsistenciaReportePdfRequest = {
  fechaInicio: string;
  fechaFin: string;
  destinatario: string;
  items: AsistenciaReportePdfItem[];
};
