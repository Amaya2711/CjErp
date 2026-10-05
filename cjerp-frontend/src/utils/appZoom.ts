/**
 * Zoom global de la interfaz (equivale a ver la app con el navegador al 65 %).
 *
 * Para REVERTIR sin tocar código, en la consola del navegador:
 *   localStorage.setItem("appZoom", "1"); location.reload();   // zoom normal (100 %)
 *   localStorage.removeItem("appZoom");   location.reload();   // vuelve al valor por defecto
 * Para probar otro valor: localStorage.setItem("appZoom", "0.8")
 * Para revertir para todos: poner ZOOM_ACTIVO = false.
 */
const ZOOM_ACTIVO = true;
const ZOOM_POR_DEFECTO = 0.65;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.5;

function leerZoom(): number {
  if (!ZOOM_ACTIVO) return 1;
  try {
    const guardado = Number(window.localStorage.getItem("appZoom"));
    if (Number.isFinite(guardado) && guardado >= ZOOM_MIN && guardado <= ZOOM_MAX) return guardado;
  } catch {
    // localStorage no disponible: se usa el valor por defecto
  }
  return ZOOM_POR_DEFECTO;
}

export function aplicarZoomApp(): void {
  document.documentElement.style.setProperty("--app-zoom", String(leerZoom()));
}
