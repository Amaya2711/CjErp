/**
 * Zoom global de la interfaz (equivale a ver la app con el navegador al 70 %).
 *
 * En cada ingreso (login) ZoomPrompt pregunta si se quiere ajustar al 70 %, solo si el zoom
 * del navegador es > 75 %. La respuesta vive en sessionStorage["appZoomSesion"] ("si" | "no")
 * y se borra al cerrar sesión (clearAuthUser limpia sessionStorage), por lo que vuelve a preguntar.
 *
 * Override manual (consola): localStorage.setItem("appZoom", "0.8"); location.reload();
 * Para desactivar la función para todos: ZOOM_ACTIVO = false.
 */
const ZOOM_ACTIVO = true;
const ZOOM_OBJETIVO = 0.7;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.5;
/** El aviso/ajuste solo aplica si el zoom del navegador es mayor a este valor. */
const ZOOM_NAVEGADOR_UMBRAL = 0.75;
const CLAVE_SESION = "appZoomSesion"; // sessionStorage: se borra al cerrar sesión (clearAuthUser)
const CLAVE_OVERRIDE = "appZoom";

function leer(clave: string, sesion = false): string | null {
  try {
    return (sesion ? window.sessionStorage : window.localStorage).getItem(clave);
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
  return leer(CLAVE_SESION, true) === "si" && navegadorSuperaUmbral() ? ZOOM_OBJETIVO : 1;
}

export function aplicarZoomApp(): void {
  document.documentElement.style.setProperty("--app-zoom", String(leerZoom()));
}

/** true si hay que preguntar: función activa, sin respuesta en esta sesión de login y zoom del navegador > 75 %. */
export function debePreguntarZoom(): boolean {
  if (!ZOOM_ACTIVO || !navegadorSuperaUmbral()) return false;
  const pref = leer(CLAVE_SESION, true);
  return pref !== "si" && pref !== "no";
}

export function guardarPreferenciaZoom(usarZoom: boolean): void {
  try {
    window.sessionStorage.setItem(CLAVE_SESION, usarZoom ? "si" : "no");
  } catch {
    // sin localStorage: se aplica solo en esta sesión
  }
  document.documentElement.style.setProperty("--app-zoom", String(usarZoom ? ZOOM_OBJETIVO : 1));
}
