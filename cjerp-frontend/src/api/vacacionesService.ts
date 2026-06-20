import httpClient from "./httpClient";

export type VacacionesGuardarRequest = {
  idEmpleadoCj: number;
  fechaInicio: string;
  fechaFin: string;
  idEstado?: number;
};

export async function crearVacacion(payload: VacacionesGuardarRequest) {
  return await httpClient.post<{ success: boolean; message?: string; data?: unknown }>(
    "/admin/vacaciones",
    payload
  );
}
