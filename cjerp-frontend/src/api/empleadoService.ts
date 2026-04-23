import httpClient from "./httpClient";
import type { EmpleadoCta } from "../models/empleadoCta";

export async function listarEmpleadosCta(): Promise<EmpleadoCta[]> {
  const response = await httpClient.get<EmpleadoCta[]>("/empleado/cta/listar");
  return Array.isArray(response) ? response : [];
}
