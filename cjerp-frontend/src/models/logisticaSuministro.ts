export type LogisticaSuministroDto = {
  idSuministro?: number | null;
  idSuministroProvisional?: number | null;
  idCliente?: number | null;
  nombreCliente?: string | null;
  idProyecto?: number | null;
  nombreProyecto?: string | null;
  idSite?: string | null;
  nombreSite?: string | null;
  correlativo?: number | null;
  tipoTrabajo?: string | null;
  ot?: string | null;
  idTarea?: number | null;
  tarea?: string | null;
  fechaInicio?: string | null;
  idAprobador?: number | null;
  aprobador?: string | null;
  comentario?: string | null;
  monto?: number | null;
  idMoneda?: number | null;
  moneda?: string | null;
  imagenUrl?: string | null;
  imagenPath?: string | null;
  esActivo?: boolean | null;
  usuarioCreacion?: string | null;
  fechaCreacion?: string | null;
  usuarioActualizacion?: string | null;
  fechaActualizacion?: string | null;
  usuarioEliminacion?: string | null;
  fechaEliminacion?: string | null;
};

export type LogisticaSuministroBuscarRequest = {
  idProvisional?: number | null;
  idCliente?: number | null;
  idProyecto?: number | null;
};

export type LogisticaSuministroInsertRequest = {
  idCliente: number;
  idProyecto: number;
  idSite: string;
  correlativo?: number | null;
  tipoTrabajo?: string | null;
  ot?: string | null;
  idTarea?: number | null;
  fechaInicio?: string | null;
  idAprobador?: number | null;
  comentario?: string | null;
  monto?: number | null;
  idMoneda?: number | null;
  imagenUrl?: string | null;
  imagenPath?: string | null;
};

export type LogisticaSuministroUpdateRequest = {
  idCliente: number;
  idProyecto: number;
  idSite: string;
  correlativo?: number | null;
  tipoTrabajo?: string | null;
  ot?: string | null;
  idTarea?: number | null;
  fechaInicio?: string | null;
  idAprobador?: number | null;
  comentario?: string | null;
  monto?: number | null;
  idMoneda?: number | null;
  imagenUrl?: string | null;
  imagenPath?: string | null;
};
