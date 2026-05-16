export type LogisticaReembolsoDto = {
  correlativo: number;
  idCliente?: number | null;
  nombreCliente?: string | null;
  idProyecto?: number | null;
  nombreProyecto?: string | null;
  idSite?: string | null;
  nombreSite?: string | null;
  responsable?: string | null;
  solicitante?: string | null;
  detalle?: string | null;
  comentario?: string | null;
  monto?: number | null;
  subtotal?: number | null;
  igv?: number | null;
  total?: number | null;
  moneda?: string | null;
  estado?: string | null;
  codEstado?: number | null;
  fechaEmision?: string | null;
  fechaDeposito?: string | null;
  fechaVencimiento?: string | null;
  fechaCreacion?: string | null;
  usuario?: string | null;
  tipoPago?: string | null;
  comprobante?: string | null;
  serie?: string | null;
  ruc?: string | null;
  esActivo?: boolean | null;
};

export type LogisticaReembolsoBuscarRequest = {
  correlativo?: number | null;
};

export type LogisticaReembolsoUpdateRequest = {
  correlativo: number;
  usuarioActualizacion?: string | null;
  observacion?: string | null;
};
