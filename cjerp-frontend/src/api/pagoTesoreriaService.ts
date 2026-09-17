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
  bancoCta?: string | null;
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
  correlativo?: number,
) =>
  httpClient.get<PagoTesoreriaRow[]>(url, {
    params: { estado, desde: desde || undefined, hasta: hasta || undefined, correlativo: correlativo || undefined },
    signal,
    timeout: 90000,
  });
export const listarPagosTesoreriaV1 = (estado: number, _desde = "", _hasta = "", signal?: AbortSignal, correlativoFiltro?: number, idEstadoFiltro?: number) =>
  httpClient.get<Record<string, unknown>[]>(`${url}/v1`, { params: { idEstado: estado === 100 ? idEstadoFiltro : estado, fechaInicio: _desde || undefined, fechaFin: _hasta || undefined }, signal, timeout: 90000 }).then((rows) => (Array.isArray(rows) ? rows : []).map((raw) => { const r = new Proxy(raw, { get: (target, prop: string) => target[prop] ?? target[Object.keys(target).find((key) => key.toLowerCase() === prop.toLowerCase()) ?? ""] }); return ({
    ...r,
    correlativo: Number(r.Corre ?? r.correlativo ?? 0), idSite: String(r.IdSite ?? r.idSite ?? ""), estado: Number(r.Estado ?? r.estado ?? 0), tipoMoneda: Number(r.TipoMoneda ?? r.tipoMoneda ?? 0), idResponsable: Number(r.IdResponsable ?? 0), idAnticipo: r.IdAnticipo == null ? null : Number(r.IdAnticipo), fecha: String(r.FecIngreso ?? ""), fechaDeposito: String(r.FechaDeposito ?? ""), ot: String(r.Ot ?? ""), responsable: String(r.Responsable ?? r.NomResponsable ?? ""), solicitante: String(r.Solicitante ?? ""), cliente: String(r.Cliente ?? ""), proyecto: String(r.NombreProyecto ?? ""), site: String(r.Site ?? ""), tipoTrabajo: String(r.Tipo_Trabajo ?? ""), tarea: String(r.Tarea ?? ""), comprobante: String(r.Comprobante ?? ""), moneda: String(r.Moneda ?? ""), subtotal: Number(r.Subtotal ?? 0), igv: Number(r.IGV ?? 0), total: Number(r.Total ?? 0), montoRetencion: Number(r.MontoRetencion ?? 0), totalPagar: Number(r.TotalPagar ?? 0), detalle: String(r.Detalle ?? ""), serie: String(r.Serie ?? ""), banco: String(r.Banco ?? ""), bancoCta: String(r.BancoCta ?? ""), transferencia: String(r.Transferencia ?? ""), nroOperacion: String(r.NroOperacion ?? ""), cheque: String(r.IdCheque ?? ""), comentarioAdicional: String(r.Comentario ?? ""), idComprobante: r.IdComprobante == null ? null : Number(r.IdComprobante), idTipoPago: r.IdTipoPago == null ? null : Number(r.IdTipoPago), ruc: String(r.RUC ?? ""), fecEmision: String(r.FecEmision ?? ""), idRendicion: r.IdRendicion == null ? null : Number(r.IdRendicion), rendicion: String(r.Rendicion ?? ""), idRetencion: r.IdRetencion == null ? null : Number(r.IdRetencion), idBanco: r.IdBanco == null ? null : Number(r.IdBanco), idBancoCta: r.IdBancoCta == null ? null : Number(r.IdBancoCta), cuenta: String(r.Cuenta ?? ""), cuentaInter: String(r.CuentaInter ?? ""), nombreCta: String(r.NombreCta ?? ""), idMoneda2: r.IdMoneda2 == null ? null : Number(r.IdMoneda2), idTransferencia: r.IdTransferencia == null ? null : Number(r.IdTransferencia), revisionPm: String(r.RevisionPm ?? ""), revisionPmAprobar: String(r.RevisionPmAprobar ?? ""), fechaRevisionAprobar: String(r.FechaReAprobador ?? ""), fechaRevision: String(r.FechaAprobador ?? ""), observacion: String(r.Observacion ?? ""), imgFactura: String(r.imgfactura ?? r.ImgFactura ?? ""), version: "v1",
  } as PagoTesoreriaRow); }).filter((r) => !correlativoFiltro || r.correlativo === correlativoFiltro));
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
