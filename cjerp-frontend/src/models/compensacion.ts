export type CompensacionFiltro = {
  idEmpleadoCj?: number;
  idEstado?: number;
  idActivo?: number;
  fechaDesde?: string;
  fechaHasta?: string;
  incluirInactivos?: boolean;
};

export type CompensacionRow = {
  id: number;
  idEmpleadoCompensacion: number;
  idEmpleadoCj: number | null;
  idEstado: number | null;
  fecha: string;
  idActivo: number | null;
  idAutorizado: number | null;
  fechaAutorizado: string;
  fechaInicio: string;
  fechaFin: string;
  fechaPre: string;
  fechaPrimera: string;
  idPre: number | null;
  idPrimera: number | null;
  idGestor: number | null;
  usuario: string;
  fechaCreacion: string;
  idRechazo: number | null;
  fechaRechazo: string;
  pagada: boolean;
  comentario: string;
  tipoCompensacion: string;
  cantidadDias: number;
  idSaldoCompensacion: number | null;
  idMovimiento: number | null;
  procesadoSaldo: boolean;
  nombreEmpleado: string;
  idResponsableCj: number | null;
  idSegundoVacaciones: number | null;
  primer: string;
  segundo: string;
  estado: string;
  activo: string;
  diasBase: number;
  diasGanados: number;
  diasTomados: number;
  diasPendientes: number;
  diasDisponibles: number;
  porcentajeUso: number;
};

export type CompensacionGuardarRequest = {
  id?: number;
  idEmpleadoCj: number | null;
  idEstado: number | null;
  fecha: string;
  idActivo: number | null;
  idAutorizado: number | null;
  fechaAutorizado: string;
  fechaInicio: string;
  fechaFin: string;
  fechaPre: string;
  fechaPrimera: string;
  idPre: number | null;
  idPrimera: number | null;
  idGestor: number | null;
  usuario: string;
  idRechazo: number | null;
  fechaRechazo: string;
  pagada: boolean;
  comentario: string;
  tipoCompensacion: string;
  cantidadDias: number;
  idSaldoCompensacion: number | null;
  idMovimiento: number | null;
  procesadoSaldo: boolean;
};

export type CompensacionSaldo = {
  idEmpleadoCj: number | null;
  nombreEmpleado: string;
  diasBase: number;
  diasGanados: number;
  diasTomados: number;
  diasPendientes: number;
};

export type CompensacionAccion =
  | "PRIMER_APROBADOR"
  | "SEGUNDO_APROBADOR"
  | "RECHAZAR";

export type ProcesarCompensacionRequest = {
  idEmpleadoCj: number;
  fechaInicio: string;
  fechaFin: string;
  accion: CompensacionAccion;
  comentario?: string;
  usuario: string;
  idEmpleadoAccion?: number;
};

export type ProcesarCompensacionResponse = {
  mensaje: string;
};
