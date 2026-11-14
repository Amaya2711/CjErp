import { abrirArchivoLegacy, descargarArchivoLegacy } from "../api/archivoLegacyService";
import { buildSharePointUrl } from "./sharepoint";

export type OrigenAdjunto = "sharepoint" | "legacy" | "ninguno";

/**
 * Determina dónde está el adjunto según el valor registrado:
 * 1) ruta de SharePoint (URL o ruta relativa) → sharepoint
 * 2) sin ruta de SharePoint pero con código numérico → gestor del sistema antiguo (elnk.uno)
 * 3) vacío → ninguno
 */
export function resolverOrigenAdjunto(ruta?: string | null): OrigenAdjunto {
  const valor = String(ruta ?? "").trim();
  if (!valor) return "ninguno";
  if (/^\d+$/.test(valor)) return "legacy";
  return "sharepoint";
}

export const esCodigoLegacy = (ruta?: string | null): boolean => resolverOrigenAdjunto(ruta) === "legacy";

/** URL visible del adjunto: la de SharePoint, o el propio código si viene del sistema antiguo. */
export function urlVisibleAdjunto(ruta?: string | null): string {
  const valor = String(ruta ?? "").trim();
  if (!valor) return "";
  return esCodigoLegacy(valor) ? valor : buildSharePointUrl(valor);
}

/** Abre un adjunto en pestaña nueva: SharePoint primero; si no hay ruta de SharePoint, el sistema antiguo. */
export async function abrirAdjunto(ruta?: string | null): Promise<void> {
  const origen = resolverOrigenAdjunto(ruta);
  if (origen === "ninguno") {
    throw new Error("No hay ruta de documento registrada.");
  }
  if (origen === "sharepoint") {
    window.open(buildSharePointUrl(ruta), "_blank", "noopener,noreferrer");
    return;
  }
  await abrirArchivoLegacy(String(ruta).trim());
}

/**
 * Descarga el contenido del adjunto: códigos numéricos van al sistema antiguo; el resto usa la
 * descarga de SharePoint propia de cada pantalla (`descargarSharePoint`).
 */
export function descargarAdjuntoBlob(
  ruta: string,
  descargarSharePoint: (ruta: string) => Promise<Blob>,
): Promise<Blob> {
  return esCodigoLegacy(ruta) ? descargarArchivoLegacy(ruta.trim()) : descargarSharePoint(ruta);
}

/** Tipo de vista previa según el contenido real (para adjuntos sin extensión, como los del sistema antiguo). */
export function tipoMedioDesdeBlob(blob: Blob): "image" | "pdf" | "unknown" {
  if (blob.type.startsWith("image/")) return "image";
  if (blob.type === "application/pdf") return "pdf";
  return "unknown";
}
