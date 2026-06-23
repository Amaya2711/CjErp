import httpClient from "./httpClient";

export type FichaEmpleadoRow = Record<string, unknown>;

export type FichaEmpleadoResponse = {
  rows: FichaEmpleadoRow[];
  columns: string[];
  totalRows: number;
};

export async function obtenerFichaEmpleado(idEmpleado: number): Promise<FichaEmpleadoResponse> {
  const response = await httpClient.get<FichaEmpleadoResponse>("/empleado/ficha", {
    params: { idEmpleado },
  });

  return {
    rows: Array.isArray(response.rows) ? response.rows : [],
    columns: Array.isArray(response.columns) ? response.columns : [],
    totalRows: Number(response.totalRows ?? 0) || 0,
  };
}

export async function obtenerFichaEmpleadoByName(nombreEmpleado: string): Promise<FichaEmpleadoResponse> {
  const response = await httpClient.get<FichaEmpleadoResponse>("/empleado/ficha", {
    params: { nombreEmpleado },
  });

  return {
    rows: Array.isArray(response.rows) ? response.rows : [],
    columns: Array.isArray(response.columns) ? response.columns : [],
    totalRows: Number(response.totalRows ?? 0) || 0,
  };
}
