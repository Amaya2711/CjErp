import httpClient from "./httpClient";

export type FichaEmpleadoRow = {
  NuevaFechaFinLaboral?: string | null;
  nuevaFechaFinLaboral?: string | null;
  Aprobacion1Fecha?: string | null;
  aprobacion1Fecha?: string | null;
  Aprobacion2Fecha?: string | null;
  aprobacion2Fecha?: string | null;
  Aprobacion3Fecha?: string | null;
  aprobacion3Fecha?: string | null;
  Meses_N?: string | number | null;
  meses_n?: string | number | null;
  Meses?: string | number | null;
  meses?: string | number | null;
  [key: string]: unknown;
};

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

export async function listarFichaEmpleados(): Promise<FichaEmpleadoResponse> {
  const response = await httpClient.get<FichaEmpleadoResponse>("/empleado/ficha");

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
