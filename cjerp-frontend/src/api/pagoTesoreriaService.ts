import httpClient from "./httpClient";

export type PagoTesoreriaRow = {
  idAnticipo: number | null;
  correlativo: number;
  idSite: string;
  estado: number;
  tipoMoneda: number;
  idResponsable: number;
  fecha: string | null;
  fechaDeposito: string | null;
  ot: string | null;
  responsable: string | null;
  solicitante: string | null;
  cliente: string | null;
  proyecto: string | null;
  site: string | null;
  tipoTrabajo: string | null;
  tarea: string | null;
  comprobante: string | null;
  moneda: string | null;
  subtotal: number;
  igv: number;
  total: number;
  montoRetencion: number;
  totalPagar: number;
  detalle: string | null;
  serie: string | null;
  banco: string | null;
  transferencia: string | null;
  nroOperacion: string | null;
  cheque: string | null;
  comentarioAdicional: string | null;
  version: string;
  idComprobante: number | null;
  idTipoPago: number | null;
  ruc: string | null;
  fecEmision: string | null;
  idRendicion: number | null;
  rendicion: string | null;
  idRetencion: number | null;
  idBanco: number | null;
  idBancoCta: number | null;
  cuenta: string | null;
  cuentaInter: string | null;
  nombreCta: string | null;
  idMoneda2: number | null;
  idTransferencia: number | null;
  revisionPm: string | null;
  revisionPmAprobar: string | null;
  fechaRevisionAprobar: string | null;
  fechaRevision: string | null;
  observacion: string | null;
  imgFactura: string | null;
};
export type PagoOpcion = {
  id: number;
  nombre: string;
  porcentaje?: number | null;
};
export type PagoCatalogos = {
  anticipos: PagoOpcion[];
  estados: PagoOpcion[];
  ejecutores: PagoOpcion[];
  bancos: PagoOpcion[];
  transferencias: PagoOpcion[];
  monedas: PagoOpcion[];
  retenciones: PagoOpcion[];
  comprobantes: PagoOpcion[];
  tiposPago: PagoOpcion[];
  rendiciones: PagoOpcion[];
};
export type PagoTesoreriaRequest = {
  estadoOrigen: number;
  idEjecutor: number;
  idTransferencia: number;
  idBanco: number;
  idMoneda2: number;
  fechaDeposito: string;
  cheque: string;
  nroOperacion: string;
  comentario: string;
  items: PagoAccionItem[];
};
const url = "/tesoreria/pagos";
export type PagoRevisionPermisos = { puedeEditar: boolean; puedeEditarOperacion: boolean; puedeEditarEstado: boolean };
export type PagoRevisionRequest = Pick<PagoTesoreriaRow, "idAnticipo" | "nroOperacion" | "idComprobante" | "idTipoPago" | "imgFactura" | "estado"> & {
  item: PagoAccionItem;
  confirmarCambioEstado: boolean;
};
export const guardarRevisionTesoreria = (request: PagoRevisionRequest) =>
  httpClient.put<{ procesados: number }>(`${url}/revision`, request);

export const descargarFacturaRevision = (correlativo: number) =>
  httpClient.get<Blob>(`${url}/revision/${correlativo}/factura`, { responseType: "blob" });

// Mismo endpoint y almacenamiento que la página Gastos.
export const subirFacturaRevision = (archivo: File, row: PagoTesoreriaRow) => {
  const data = new FormData();
  data.append("archivo", archivo);
  data.append("gastoId", String(row.correlativo));
  if (row.serie) data.append("serie", row.serie);
  if (row.responsable) data.append("responsable", row.responsable);
  return httpClient.post<{ fileUrl: string; storagePath: string }>("/tesoreria/gastos/upload-factura", data);
};

export const obtenerCatalogosPago = (signal?: AbortSignal) =>
  httpClient.get<{ catalogos: PagoCatalogos; puedePagar: boolean; permisosRevision: PagoRevisionPermisos }>(
    `${url}/catalogos`,
    { signal },
  );
export const listarPagosTesoreria = (
  estado: number,
  desde: string,
  hasta: string,
  signal?: AbortSignal,
) =>
  httpClient.get<PagoTesoreriaRow[]>(url, {
    params: { estado, desde: desde || undefined, hasta: hasta || undefined },
    signal,
    timeout: 90000,
  });
export const obtenerCuentasPago = (
  idResponsable: number,
  signal?: AbortSignal,
) =>
  httpClient.get<
    {
      cuenta: string | null;
      cuentaInter: string | null;
      nombreCta: string | null;
      banco: string | null;
    }[]
  >(`${url}/cuentas/${idResponsable}`, { signal });
export const registrarPagosTesoreria = (request: PagoTesoreriaRequest) =>
  httpClient.post<{ procesados: number }>(url, request, { timeout: 210000 });
export const grabarPagoTesoreria = (request: Omit<PagoTesoreriaRequest, "estadoOrigen">) =>
  httpClient.post<{ procesados: number }>(`${url}/grabar`, request, { timeout: 60000 });

export type PagoAccionItem = {
  correlativo: number;
  idSite: string;
  estado: number;
  version: string;
  totalPagar: number;
};
export type PagoAccion =
  | "revisar"
  | "contabilidad-programar"
  | "contabilidad-administrativo"
  | "programar"
  | "administrativo"
  | "observar"
  | "rendicion"
  | "corregir"
  | "subsanar";
export type PagoAccionRequest = {
  accion: PagoAccion;
  items: PagoAccionItem[];
  observacion: string;
  idRetencion?: number;
  aplicarGenerales?: boolean;
  aplicarBanco?: boolean;
  aplicarRendicion?: boolean;
  aplicarOperacion?: boolean;
  idComprobante?: number;
  idTipoPago?: number;
  ruc?: string;
  serie?: string;
  fecEmision?: string;
  idBanco?: number;
  idMoneda2?: number;
  fechaDeposito?: string;
  idTransferencia?: number;
  nroOperacion?: string;
  idRendicion?: number;
  aplicarDetalle?: boolean;
  detalle?: string;
  aplicarAdjunto?: boolean;
  imgFactura?: string;
};
export const ejecutarAccionTesoreria = (request: PagoAccionRequest) =>
  httpClient.post<{ procesados: number }>(`${url}/acciones`, request, {
    timeout: 210000,
  });
export const crearItemsTesoreria = (
  rows: PagoTesoreriaRow[],
): PagoAccionItem[] =>
  rows.map((r) => ({
    correlativo: r.correlativo,
    idSite: r.idSite,
    estado: r.estado,
    version: r.version,
    totalPagar: r.totalPagar,
  }));
