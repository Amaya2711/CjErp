export type ApiResponse<T> = {
  success: boolean;
  message: string;
  data: T;
};

export type EmpleadoPendienteDto = {
  idPendiente: number;
  idEmpleado: number;
  nombreEmpleado: string;
  fechaInicio?: string | null;
  fechaEstimacionTermino?: string | null;
  fechaRealTermino?: string | null;
  idEstado?: number | null;
  estado: string;
  comentario: string;
  observacion: string;
  idResponsable?: number | null;
  responsable: string;
  ruta: string;
  idActivo?: number | null;
  usuarioCreacion: string;
  fechaCreacion?: string | null;
  usuarioModificacion: string;
  fechaModificacion?: string | null;
};

export type EmpleadoPendienteBuscarRequest = {
  idPendiente?: number | null;
  idEmpleado?: number | null;
  idResponsable?: number | null;
  idEstado?: number | null;
  fechaInicio?: string | null;
  fechaFin?: string | null;
};

export type EmpleadoPendienteInsertRequest = {
  idEmpleado: number;
  fechaInicio?: string | null;
  fechaEstimacionTermino?: string | null;
  fechaRealTermino?: string | null;
  idEstado?: number | null;
  comentario?: string | null;
  observacion?: string | null;
  idResponsable?: number | null;
  ruta?: string | null;
  usuarioCreacion: string;
};

export type EmpleadoPendienteUpdateRequest = {
  idPendiente: number;
  idEmpleado: number;
  fechaInicio?: string | null;
  fechaEstimacionTermino?: string | null;
  fechaRealTermino?: string | null;
  idEstado?: number | null;
  comentario?: string | null;
  observacion?: string | null;
  idResponsable?: number | null;
  ruta?: string | null;
  usuarioModificacion: string;
};
