import httpClient from "./httpClient";
import type { EmpleadoCta } from "../models/empleadoCta";

export async function listarEmpleadosCta(): Promise<EmpleadoCta[]> {
  const response = await httpClient.get<EmpleadoCta[]>("/empleado/cta/listar");
  return Array.isArray(response) ? response : [];
}

export async function listarEmpleadosWup(): Promise<EmpleadoCta[]> {
  const response = await httpClient.get<EmpleadoCta[]>("/empleado/cta/listar-wup");
  return Array.isArray(response) ? response : [];
}

export async function listarEmpleadosPorCargo(idCargo = 30): Promise<EmpleadoCta[]> {
  const response = await httpClient.get<EmpleadoCta[]>("/empleado/cta/listar-cargo", {
    params: { idCargo },
  });
  return Array.isArray(response) ? response : [];
}
