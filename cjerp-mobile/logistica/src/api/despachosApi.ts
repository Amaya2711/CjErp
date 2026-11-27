import { httpClient } from "@cjerp/shared";

/** Endpoints reales del backend: CjERP.Api/Controllers/Mobile/MobileLogisticaDespachosController.cs. No inventar otros. */
const BASE = "/mobile/logistica/despachos";

export type DespachoLinea = {
  nroSolicitud: string;
  pedidoSap?: string | null;
  correlativo?: string | null;
  posicion: string;
  codPap?: string | null;
  nombreMaterial?: string | null;
  unidadMedida?: string | null;
  /** Material código 40: lleva serie y se despacha completo. */
  esEquipo: boolean;
  cantSap: number;
  serie?: string | null;
  observacion?: string | null;
  rutaImagen?: string | null;
  idEstado: number;
  nomEstado?: string | null;
  idSite?: string | null;
  nombreSite?: string | null;
  nombreProyecto?: string | null;
  nombreCliente?: string | null;
  fechaCreacion?: string | null;
  /** true = solicitud del sistema nuevo (se puede despachar/rechazar); false = del sistema antiguo (solo lectura). */
  esSistemaNuevo: boolean;
};

export type DespachoSerie = { serie: string; pedidoSap?: string | null; idSite?: string | null };

export type DespacharItem = {
  nroSolicitud: string;
  posicion: string;
  serie?: string;
  cantidad?: number;
  rutaImagen: string;
  observacion?: string;
};

export type OrigenDespacho = "" | "NUEVO" | "ANTIGUO";

export const consultarDespachos = (solicitudes?: string, origen: OrigenDespacho = "") =>
  httpClient.get<DespachoLinea[]>(BASE, {
    params: { solicitudes: solicitudes?.trim() || undefined, origen: origen || undefined },
  });

export const listarSeries = (codPap: string, buscar?: string) =>
  httpClient.get<DespachoSerie[]>(`${BASE}/series`, { params: { codPap, buscar: buscar?.trim() || undefined } });

export const subirImagen = (archivo: File, nroSolicitud: string, posicion: string) => {
  const form = new FormData();
  form.append("archivo", archivo);
  form.append("nroSolicitud", nroSolicitud);
  form.append("posicion", posicion);
  return httpClient.post<{ fileName: string; fileUrl: string; storagePath: string }>(`${BASE}/imagen`, form, {
    timeout: 120000,
  });
};

export const despachar = (items: DespacharItem[]) =>
  httpClient.post<{ procesadas: number; conDiferencia: number }>(`${BASE}/despachar`, { items });

export const rechazar = (items: { nroSolicitud: string; posicion: string }[], observacion: string) =>
  httpClient.post<{ procesadas: number }>(`${BASE}/rechazar`, { items, observacion });

/** Reduce la foto (lado mayor 1600 px, JPEG) para subirla rápido desde el celular. */
export async function reducirImagen(archivo: File, maxLado = 1600): Promise<File> {
  if (!archivo.type.startsWith("image/")) return archivo;
  const bitmap = await createImageBitmap(archivo).catch(() => null);
  if (!bitmap) return archivo;
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.8));
  return blob ? new File([blob], "despacho.jpg", { type: "image/jpeg" }) : archivo;
}
