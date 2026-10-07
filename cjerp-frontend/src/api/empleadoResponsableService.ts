import httpClient from "./httpClient";

export type EmpleadoResponsableInsertarRequest = {
  idBancoCta?: number;
  idBancoActual?: number;
  cuentaActual?: string;
  nombreCtaActual?: string;
  nombre: string;
  cuenta: string;
  cuentaInter: string;
  tipoCuenta: string;
  nombreCta: string;
  banco: string;
  idBanco: string;
  nroDocumento: string;
};

/** Datos de la cuenta que identifica el registro original en una actualización. */
export type EmpleadoResponsableActualizarRequest = EmpleadoResponsableInsertarRequest & {
  idBancoActual: number;
  cuentaActual: string;
  nombreCtaActual: string;
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

export async function actualizarEmpleadoResponsable(
  idEmpleado: number,
  request: EmpleadoResponsableActualizarRequest,
): Promise<void> {
  await httpClient.put(`/tesoreria/gastos/responsables/${idEmpleado}`, request);
}
