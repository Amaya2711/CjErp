import axios, { type AxiosRequestConfig } from "axios";
import { clearAuthUser, getAuthUser } from "./authStore";
import { isJwtExpired } from "./jwt";
import { setSessionNotice } from "./sessionNotice";

const productionApiBaseUrl = "https://cjerp-production.up.railway.app/api";

/**
 * Desarrollo: el backend local (puerto 5015) en el mismo host desde el que se abrió la app,
 * así funciona también al abrirla en el celular por la IP de la PC.
 * Producción / app empaquetada: VITE_API_BASE_URL o el backend de Railway.
 */
export const API_BASE_URL: string = import.meta.env.DEV
  ? import.meta.env.VITE_API_BASE_URL?.trim() || `http://${window.location.hostname}:5015/api`
  : import.meta.env.VITE_API_BASE_URL?.trim() || productionApiBaseUrl;

type AppConfig = AxiosRequestConfig & { skipAuthRedirect?: boolean };

let onUnauthorized: () => void = () => {};
/** La app registra aquí qué hacer ante sesión vencida (normalmente, ir al login). */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

const client = axios.create({ baseURL: API_BASE_URL, timeout: 30000 });

client.interceptors.request.use((config) => {
  if ((config.url ?? "").toLowerCase().includes("/auth/login")) return config;

  const user = getAuthUser();
  if (user?.token) {
    if (isJwtExpired(user.token)) {
      setSessionNotice("Su sesión terminó. Ingrese de nuevo.");
      void clearAuthUser();
      onUnauthorized();
      return Promise.reject(new axios.CanceledError("JWT expirado."));
    }
    config.headers.Authorization = `Bearer ${user.token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => {
    const data = response?.data as { success?: boolean; message?: string; data?: unknown } | undefined;
    if (data && typeof data === "object") {
      if (data.success === false) {
        return Promise.reject(new Error(data.message || "La operación no fue completada por el servidor."));
      }
      if ("data" in data) return data.data as never;
    }
    return data as never;
  },
  (error) => {
    const skip = Boolean((error?.config as AppConfig | undefined)?.skipAuthRedirect);
    if (error?.response?.status === 401 && !skip) {
      // 401 con sesión abierta: JWT vencido o sesión cerrada por inactividad/servidor (cada login crea su propia sesión; no se pisan entre sí).
      setSessionNotice("Su sesión terminó (vencimiento o inactividad). Ingrese de nuevo.");
      void clearAuthUser();
      onUnauthorized();
    }
    return Promise.reject(error);
  },
);

/** Mensaje legible de un error de la API (el backend devuelve texto o {message}). */
export function getErrorMessage(error: unknown, fallback = "No se pudo completar la operación."): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as unknown;
    if (typeof body === "string" && body.trim()) return body;
    const message = (body as { message?: string } | undefined)?.message;
    if (message) return message;
    if (error.code === "ECONNABORTED") return "El servidor tardó demasiado en responder. Intente de nuevo.";
    if (!error.response) return "Sin conexión con el servidor. Revise su internet.";
    if (error.response.status === 429) return "Demasiados intentos. Espere un momento e intente de nuevo.";
    if (error.response.status === 403) return "No tiene permiso para esta operación.";
    if (error.response.status >= 500) return "El servidor tuvo un problema. Intente de nuevo en un momento.";
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Código HTTP de un error de la API (undefined si no hubo respuesta). */
export function getHttpStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

export const httpClient = {
  get: <T>(url: string, config?: AppConfig) => client.get(url, config) as unknown as Promise<T>,
  post: <T>(url: string, data?: unknown, config?: AppConfig) =>
    client.post(url, data, config) as unknown as Promise<T>,
  put: <T>(url: string, data?: unknown, config?: AppConfig) =>
    client.put(url, data, config) as unknown as Promise<T>,
  delete: <T>(url: string, config?: AppConfig) => client.delete(url, config) as unknown as Promise<T>,
};
