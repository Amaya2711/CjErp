export type ChequeFiltro = {
  idEmpleado?: number;
  idEstado?: number;
};

export type ChequeRow = {
  idCheque: number;
  idBanco: number;
  fechaCheque: string;
  nroCheque: string;
  importe: number;
  idMoneda: number;
  nombreMoneda?: string | null;
  idEmpleado: number;
  nombreEmpleado?: string | null;
  nombreBanco?: string | null;
  idEstado: number;
  nombreEstado?: string | null;
  comentario?: string | null;
  ruta?: string | null;
  fechaCreacion?: string | null;
  fechaModificacion?: string | null;
};

export type ChequeGuardarRequest = {
  idCheque?: number | null;
  idBanco: number;
  fechaCheque: string;
  nroCheque: string;
  importe: number;
  idMoneda: number;
  idEmpleado: number;
  idEstado: number;
  comentario?: string | null;
  ruta?: string | null;
  usuarioAccion?: string;
};

export type ChequeRechazarRequest = {
  idEstadoRechazado?: number | null;
  observacion: string;
  usuarioAccion?: string;
};
