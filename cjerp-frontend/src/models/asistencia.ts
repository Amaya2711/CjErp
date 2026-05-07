export type AsistenciaReporteQueryParams = {
  fechaInicio: string;
  fechaFin: string;
};

export type AsistenciaReporteItem = {
  fecha: string;
  hora: string;
  nombreEmpleado: string;
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
