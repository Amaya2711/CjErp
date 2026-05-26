import httpClient from "./httpClient";
import type {
  AprobarCampoAccionRequest,
  AprobarCampoClave,
  AprobarCampoFiltro,
  AprobarCampoGuardarRequest,
  AprobarCampoListaResponse,
  AprobarCampoOperacionResponse,
  AprobarCampoRow,
} from "../models/aprobarCampo";

const BASE_URL = "/operacion/aprobarcampo";

export async function listarAprobarCampo(params?: AprobarCampoFiltro) {
  return await httpClient.get<AprobarCampoListaResponse>(`${BASE_URL}/listar`, { params });
}

export async function obtenerAprobarCampoDetalle(params: AprobarCampoClave) {
  return await httpClient.get<AprobarCampoRow>(`${BASE_URL}/detalle`, { params });
}

export async function crearAprobarCampo(payload: AprobarCampoGuardarRequest) {
  return await httpClient.post<AprobarCampoOperacionResponse>(BASE_URL, payload);
}

export async function actualizarAprobarCampo(payload: AprobarCampoGuardarRequest) {
  return await httpClient.put<AprobarCampoOperacionResponse>(BASE_URL, payload);
}

export async function aprobarIngresoAprobarCampo(payload: AprobarCampoAccionRequest) {
  return await httpClient.post<AprobarCampoOperacionResponse>(`${BASE_URL}/aprobar-ingreso`, payload);
}

export async function aprobarSalidaAprobarCampo(payload: AprobarCampoAccionRequest) {
  return await httpClient.post<AprobarCampoOperacionResponse>(`${BASE_URL}/aprobar-salida`, payload);
}

export async function rechazarAprobarCampo(payload: AprobarCampoAccionRequest) {
  return await httpClient.post<AprobarCampoOperacionResponse>(`${BASE_URL}/rechazar`, payload);
}
