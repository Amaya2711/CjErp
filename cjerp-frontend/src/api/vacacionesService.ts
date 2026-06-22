import httpClient from "./httpClient";
import type { PlanillaConsultaEstadosResponse } from "../models/planillaConsulta";

export type VacacionesGuardarRequest = {
  idEmpleadoCj: number;
  fechaInicio: string;
  fechaFin: string;
  idEstado?: number;
};

export type VacacionesRechazarRequest = {
  idEmpleadoCj: number;
  fechaInicio: string;
  fechaFin: string;
};

export type VacacionesAprobarRequest = {
  idEmpleadoCj: number;
  fechaInicio: string;
  fechaFin: string;
  idEstadoActual: number;
};

export type VacacionesConsultaRequest = {
  idEstado?: number;
  fechaInicio?: string;
  fechaFin?: string;
  nombreEmpleado?: string;
  maxRows?: number;
};

export async function crearVacacion(payload: VacacionesGuardarRequest) {
  return await httpClient.post<{ success: boolean; message?: string; data?: unknown }>(
    "/admin/vacaciones",
    payload
  );
}

export async function rechazarVacacion(payload: VacacionesRechazarRequest) {
  return await httpClient.post<{ success: boolean; message?: string; data?: unknown }>(
    "/admin/vacaciones/rechazar",
    payload
  );
}

export async function aprobarVacacion(payload: VacacionesAprobarRequest) {
  return await httpClient.post<{ success: boolean; message?: string; data?: unknown }>(
    "/admin/vacaciones/aprobar",
    payload
  );
}

export async function listarVacaciones(payload: VacacionesConsultaRequest = {}): Promise<PlanillaConsultaEstadosResponse> {
  return await httpClient.get<PlanillaConsultaEstadosResponse>("/admin/vacaciones/listar", {
    params: payload,
  });
}
