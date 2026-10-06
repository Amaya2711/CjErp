import httpClient from "./httpClient";

export type EmpleadoResponsableInsertarRequest = {
  nombre: string;
  cuenta: string;
  cuentaInter: string;
  tipoCuenta: string;
  nombreCta: string;
  banco: string;
  idBanco: string;
  nroDocumento: string;
};

export type EmpleadoResponsableBusqueda = {
  idEmpleado?: number | null;
  nombreEmpleado?: string;
  nombre?: string;
};

export async function buscarEmpleadosResponsables(
  nombre: string,
  signal?: AbortSignal,
): Promise<EmpleadoResponsableBusqueda[]> {
  return httpClient.get<EmpleadoResponsableBusqueda[]>("/tesoreria/gastos/responsables/buscar", {
    params: { nombre },
    signal,
  });
}

export async function insertarEmpleadoResponsable(
  request: EmpleadoResponsableInsertarRequest,
): Promise<void> {
  await httpClient.post("/tesoreria/gastos/responsables", request);
}
