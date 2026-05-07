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
  estado: string;
  nroDocumento?: string;
  fecha?: string | null;
  idEstado?: number | null;
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
  detalle: string;
  cantidad: number;
  precioUnitario: number;
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
