import httpClient from "./httpClient";

/**
 * Archivos/imágenes registrados en el sistema antiguo (gestor elnk.uno), por código numérico.
 * Endpoint global: GET /api/archivos/legacy/{codigo}.
 */
export const descargarArchivoLegacy = (codigo: string | number) =>
  httpClient.get<Blob>(`/archivos/legacy/${encodeURIComponent(String(codigo).trim())}`, {
    responseType: "blob",
    timeout: 120000,
  });

/** Descarga el archivo y devuelve una URL temporal (blob:) para usar en <img src> o abrir en pestaña. Liberar con URL.revokeObjectURL. */
export async function obtenerUrlArchivoLegacy(codigo: string | number): Promise<string> {
  const blob = await descargarArchivoLegacy(codigo);
  return URL.createObjectURL(blob);
}

/** Abre el archivo del sistema antiguo en una pestaña nueva. */
export async function abrirArchivoLegacy(codigo: string | number): Promise<void> {
  // Se abre la pestaña antes de descargar para que el bloqueador de ventanas no la impida.
  const pestana = window.open("", "_blank");
  try {
    const url = await obtenerUrlArchivoLegacy(codigo);
    if (pestana) pestana.location.href = url;
    else window.open(url, "_blank");
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    pestana?.close();
    throw error;
  }
}
