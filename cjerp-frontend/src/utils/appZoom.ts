/**
 * Zoom global de la interfaz (equivale a ver la app con el navegador al 65 %).
 *
 * Al ingresar, ZoomPrompt (components/base) pregunta una sola vez por navegador si se
 * quiere usar el zoom (solo si el zoom del navegador es > 75 %; si ya está en 75 % o menos no
 * se pregunta ni se aplica, para no reducir dos veces); la respuesta se guarda en localStorage["appZoomPref"] ("si" | "no").
 *
 * Para cambiar la decisión: borrar la clave y recargar, o desde la consola:
 *   localStorage.removeItem("appZoomPref"); location.reload();   // vuelve a preguntar
 *   localStorage.setItem("appZoom", "0.8");  location.reload();   // fuerza otro valor (override)
 * Para desactivar la función para todos: ZOOM_ACTIVO = false.
 */
const ZOOM_ACTIVO = true;
const ZOOM_OBJETIVO = 0.65;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.5;
/** El aviso/ajuste solo aplica si el zoom del navegador es mayor a este valor. */
const ZOOM_NAVEGADOR_UMBRAL = 0.75;
const CLAVE_PREF = "appZoomPref";
const CLAVE_OVERRIDE = "appZoom";

function leer(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}

/**
 * Zoom actual del navegador (1 = 100 %). Aproximación: outerWidth no varía con el zoom
 * del navegador pero innerWidth (px CSS) sí. No se ve afectado por el CSS zoom de la app.
 */
export function zoomNavegador(): number {
  const ratio = window.outerWidth / window.innerWidth;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

function navegadorSuperaUmbral(): boolean {
  return zoomNavegador() > ZOOM_NAVEGADOR_UMBRAL;
}

function leerZoom(): number {
  if (!ZOOM_ACTIVO) return 1;
  const override = Number(leer(CLAVE_OVERRIDE));
  if (Number.isFinite(override) && override >= ZOOM_MIN && override <= ZOOM_MAX) return override;
  return leer(CLAVE_PREF) === "si" && navegadorSuperaUmbral() ? ZOOM_OBJETIVO : 1;
}

export function aplicarZoomApp(): void {
  document.documentElement.style.setProperty("--app-zoom", String(leerZoom()));
}

/** true si hay que preguntar: función activa, sin respuesta previa y zoom del navegador > 75 %. */
export function debePreguntarZoom(): boolean {
  if (!ZOOM_ACTIVO || !navegadorSuperaUmbral()) return false;
  const pref = leer(CLAVE_PREF);
  return pref !== "si" && pref !== "no";
}

export function guardarPreferenciaZoom(usarZoom: boolean): void {
  try {
    window.localStorage.setItem(CLAVE_PREF, usarZoom ? "si" : "no");
  } catch {
    // sin localStorage: se aplica solo en esta sesión
  }
  document.documentElement.style.setProperty("--app-zoom", String(usarZoom ? ZOOM_OBJETIVO : 1));
}
