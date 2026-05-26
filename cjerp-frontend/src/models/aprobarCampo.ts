export type AprobarCampoRow = Record<string, unknown> & {
  id?: number;
  idAsistencia?: number;
  idempleado?: number;
  idEmpleado?: number;
  responsable?: string;
  empleado?: string;
  nombreempleado?: string;
  nombreEmpleado?: string;
  estado?: string;
  fechaasistencia?: string;
  fechaAsistencia?: string;
  ingreso?: string;
  hora?: string;
  salida?: string;
  horasalida?: string;
  horaSalida?: string;
  comentario?: string;
  observacion?: string;
  latitud?: string;
  longitud?: string;
  latitudsalida?: string;
  longitudsalida?: string;
  latitudSalida?: string;
  longitudSalida?: string;
  imagen?: string;
  imagensalida?: string;
  imagenSalida?: string;
};

export type AprobarCampoFiltro = {
  responsable?: string;
  empleado?: string;
  estado?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  search?: string;
};

export type AprobarCampoClave = {
  idAsistencia?: number;
  idEmpleado?: number;
  fechaAsistencia?: string;
};

export type AprobarCampoListaResponse = {
  columns: string[];
  rows: AprobarCampoRow[];
};

export type AprobarCampoGuardarRequest = {
  idAsistencia?: number;
  idEmpleado?: number;
  fechaAsistencia: string;
  responsable?: string;
  empleado?: string;
  estado?: string;
  ingreso?: string;
  salida?: string;
  observacion?: string;
  latitud?: string;
  longitud?: string;
  latitudSalida?: string;
  longitudSalida?: string;
  imagen?: string;
  imagenSalida?: string;
  usuarioAccion?: string;
};

export type AprobarCampoAccionRequest = AprobarCampoClave & {
  observacion: string;
  usuarioAccion?: string;
};

export type AprobarCampoOperacionResponse = {
  idRegistro: string;
  row?: AprobarCampoRow | null;
};
