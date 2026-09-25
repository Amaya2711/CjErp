import httpClient from "./httpClient";

export type OrdenCompraCabeceraDto = {
  idOc: number;
  idSolicitante: number;
  solicitante: string;
  idResponsable: number;
  responsable: string;
  subtotal: number;
  igv: number;
  total: number;
  moneda: string;
  comprobante: string;
  idAprobador1?: number | null;
  idAprobador2?: number | null;
  idAprobador3?: number | null;
  idValidador?: number | null;
  validador?: string | null;
  validador2?: string | null;
  validador3?: string | null;
  estado: string;
  nroDocumento?: string;
  fecha?: string | null;
  idEstado?: number | null;
  estadoOc?: number | null;
  idSite?: string;
  nombreSite?: string;
  idProyecto?: number | null;
  nombreCliente?: string;
  nombreProyecto?: string;
};

export type OrdenCompraDetalleDto = {
  idOc: number;
  idSolicitante?: number | null;
  solicitante?: string;
  idResponsable?: number | null;
  responsable?: string;
  idMoneda?: number | null;
  moneda?: string;
  idCliente?: number | null;
  nombreCliente?: string;
  idProyecto?: number | null;
  nombreProyecto?: string;
  idSite?: string;
  nombreSite?: string;
  tipoTrabajo?: string;
  idTarea?: number | null;
  tarea?: string;
  detalle?: string;
  cantidad?: number;
  precioUnitario?: number;
  ot?: string;
  subtotalD?: number;
  igvD?: number;
  totalD?: number;
  fila?: number | null;
  correlativo?: number | null;
  estado?: string;
  gestor?: string;
  rutaImagen?: string;
  imgOc?: string;
  imgPresupuesto?: string;
  ocAdela?: string;
  ocPor?: string;
  cuenta?: string;
  cuentaInter?: string;
  nombreCta?: string;
  banco?: string;
  idBanco?: number | null;
  idComprobante?: number | null;
  ocAdeMon?: number;
  ocPorAde?: number;
  monFic?: number;
  porFict?: number;
};

export type OrdenCompraConsultaParams = {
  idCliente?: number | null;
  idProyecto?: number | null;
  idSite?: string | null;
  correlativo?: number | null;
  ot?: string | null;
  tipoTrabajo?: string | null;
  idSolicitante?: number | null;
  idResponsable?: number | null;
  idOc?: string | null;
};

export type OrdenCompraInsertDetallePayload = {
  idCliente: number;
  idProyecto: number;
  idSite: string;
  correlativo?: number | null;
  tipoTrabajo?: string;
  idTarea?: number | null;
  ot?: string;
  detalle: string;
  cantidad: number;
  precioUnitario: number;
  idComprobante?: number | null;
  imgOc?: string;
  imgPresupuesto?: string;
  peso?: number;
};

export type OrdenCompraInsertPayload = {
  idSolicitante: number;
  idResponsable: number;
  idWeb: number;
  fechaOrden: string;
  observacion: string;
  usuarioCreacion: string;
  fechaCreacion: string;
  horaCreacion: string;
  idMoneda: number;
  idComprobante: number;
  idEstado: number;
  idValidador: number;
  idGestor: number;
  idFormaPago: number;
  diasPago: number;
  peso: number;
  detalle: OrdenCompraInsertDetallePayload[];
};

export type OrdenCompraRechazoMasivoPayload = {
  idsOc: number[];
  observacion: string;
  idAprobador?: number;
};

export type OrdenCompraAprobarPayload = {
  idsOc: number[];
  nivel?: number;
  idAprobador?: number;
  observacion?: string;
};

export type OrdenCompraAprobacionResult = {
  idOc: number;
  nivel: number;
  idAprobador: number;
};

export type OrdenCompraEditarDetallePayload = {
  idOc: number;
  idSite: string;
  correlativo?: number | null;
  fila?: number | null;
  campo: string;
  valor?: string | null;
  idUsuario?: number | null;
  usuarioAccion?: string;
};

export type OrdenCompraReciboDto = {
  correlativo: number;
  fecIngreso?: string | null;
  subtotal?: number;
  igv?: number;
  total?: number;
  moneda?: string;
  detalle?: string;
  rutaImagen?: string;
  idCliente?: number | null;
  idProyecto?: number | null;
  idSite?: string;
  correSite?: number | null;
  tipoTrabajo?: string;
  comprobante?: string;
  responsable?: string;
  nroDocumento?: string;
  estado?: string;
  tarea?: string;
  fila?: number | null;
  idOc?: number | null;
  cliente?: string;
  proyecto?: string;
  site?: string;
  ot?: string;
  cuenta?: string;
  comentario?: string;
  bien?: string;
  serie?: string;
  tipoPago?: string;
  solicitante?: string;
  gestor?: string;
  validador?: string;
  fechaEmision?: string | null;
  fechaVencimiento?: string | null;
};

export type OrdenCompraRecibosParams = {
  idOc: number;
  fila?: number | null;
};

export type OrdenCompraAsociarRecibosPayload = {
  idOc: number;
  fila?: number | null;
  nivel?: number;
  correlativos: number[];
};

export type OrdenCompraAsociarRecibosResult = {
  idOc: number;
  solicitados: number;
  asociados: number;
};

export type OrdenCompraMontoOcDto = {
  idOc?: number | null;
  fechaOc?: string | null;
  idCliente?: number | null;
  idProyecto?: number | null;
  correlativo?: number | null;
  nombreCliente?: string;
  nombreProyecto?: string;
  tipoTrabajo?: string;
  idSite?: string;
  nombreSite?: string;
  montoOc?: number;
  pagadoFic?: number;
  avanceFic?: number;
  pagado?: number;
  avance?: number;
  saldo?: number;
  detalle?: string;
  estado?: string;
  fila?: number | null;
  solicitante?: string;
};

export type OrdenCompraConsumoDto = {
  idOc: number;
  fila?: number | null;
  totalOc: number;
  pagadoOc: number;
};


export async function buscarOrdenCompraCabecera(params?: OrdenCompraConsultaParams) {
  return await httpClient.get<OrdenCompraCabeceraDto[]>("/facturacionfinanciera/oc/cabecera", { params });
}

export async function buscarOrdenCompraDetalle(params?: OrdenCompraConsultaParams) {
  return await httpClient.get<OrdenCompraDetalleDto[]>("/facturacionfinanciera/oc/detalle", { params });
}

export async function insertarOrdenCompra(payload: OrdenCompraInsertPayload) {
  return await httpClient.post<{ idOc: number }>("/facturacionfinanciera/oc", payload);
}

export async function rechazarOrdenCompraMasivo(payload: OrdenCompraRechazoMasivoPayload) {
  return await httpClient.post("/facturacionfinanciera/oc/rechazar-masivo", payload);
}

export async function aprobarOrdenCompra(payload: OrdenCompraAprobarPayload) {
  return await httpClient.post<OrdenCompraAprobacionResult[]>("/facturacionfinanciera/oc/aprobar", payload);
}

export async function editarDetalleOrdenCompra(payload: OrdenCompraEditarDetallePayload) {
  return await httpClient.post("/facturacionfinanciera/oc/detalle/editar", payload);
}

export async function buscarRecibosAsociadosOrdenCompra(params: OrdenCompraRecibosParams) {
  return await httpClient.get<OrdenCompraReciboDto[]>("/facturacionfinanciera/oc/recibos/asociados", { params });
}

export async function buscarRecibosSinAsociarOrdenCompra(params: OrdenCompraRecibosParams) {
  return await httpClient.get<OrdenCompraReciboDto[]>("/facturacionfinanciera/oc/recibos/sin-asociar", { params });
}

export async function asociarRecibosOrdenCompra(payload: OrdenCompraAsociarRecibosPayload) {
  return await httpClient.post<OrdenCompraAsociarRecibosResult>("/facturacionfinanciera/oc/recibos/asociar", payload);
}

export async function buscarMontoOcOrdenCompra(params: OrdenCompraRecibosParams) {
  return await httpClient.get<OrdenCompraMontoOcDto[]>("/facturacionfinanciera/oc/monto-oc", { params });
}

export async function buscarConsumoOrdenCompra(
  params: OrdenCompraRecibosParams,
  options?: { signal?: AbortSignal }
) {
  return await httpClient.get<OrdenCompraConsumoDto | null>("/facturacionfinanciera/oc/consumo", {
    params,
    signal: options?.signal,
  });
}

export const descargarOrdenCompraPdf = (idOc: number) =>
  httpClient.get<Blob>(`/facturacionfinanciera/oc/${idOc}/pdf`, {
    responseType: "blob",
  });

export async function subirArchivoOrdenCompra(file: File, codigoReferencia = "1") {
  const data = new FormData();
  data.append("archivo", file);
  data.append("codigoReferencia", codigoReferencia);
  return await httpClient.post<{ codigo: string }>("/facturacionfinanciera/oc/archivo", data);
}

export const descargarArchivoOrdenCompra = (codigo: string) =>
  httpClient.get<Blob>(`/facturacionfinanciera/oc/archivo/${encodeURIComponent(codigo)}`, {
    responseType: "blob",
  });

