import httpClient from "./httpClient";

export type ContratoEmpleadoDetalle = {
  idEmpleado: number;
  nombreEmpleado: string;
  nroDocumento: string;
  correo: string;
  telefono: string;
  empresa: string;
  cliente: string;
  area: string;
  ubicacion: string;
  idCargo: number | null;
  idTipoEmpleado: number | null;
  idEmpRel: number | null;
  idEstado: number | null;
  idActivo: boolean | null;
  fechaIniLaboral: string;
  fechaFinLaboral: string;
  fechaBaja: string;
};

export type ContratoEmpleadoHistorial = {
  idHistorialLaboral: number;
  idEmpleado: number;
  fechaIniLaboral: string;
  fechaFinLaboral: string;
  fechaBaja: string;
  idEstado: number | null;
  idActivo: boolean | null;
  idTipoEmpleado: number | null;
  idCargo: number | null;
  idEmpRel: number | null;
  motivoMovimiento: string;
  tipoMovimiento: string;
  observacion: string;
  usuarioCre: string;
  fechaCreacion: string;
};

export type ContratoEmpleadoResponse = {
  empleado: ContratoEmpleadoDetalle | null;
  historial: ContratoEmpleadoHistorial[];
};

export type RenovarContratoRequest = {
  idEmpleado: number;
  nuevaFechaFinLaboral: string;
  motivoMovimiento?: string;
  observacion?: string;
};

export async function obtenerContratoEmpleado(idEmpleado: number): Promise<ContratoEmpleadoResponse> {
  const response = await httpClient.get<ContratoEmpleadoResponse>(`/recursoshumanos/contratos/${idEmpleado}`);
  return {
    empleado: response?.empleado ?? null,
    historial: Array.isArray(response?.historial) ? response.historial : [],
  };
}

export async function renovarContratoEmpleado(payload: RenovarContratoRequest) {
  return await httpClient.put<{ idEmpleado: number; nuevaFechaFinLaboral: string }>(
    "/recursoshumanos/contratos/renovar",
    payload
  );
}

export async function desactivarHistorialContrato(idHistorialLaboral: number) {
  return await httpClient.put<{ idHistorialLaboral: number; usuario: string }>(
    `/recursoshumanos/contratos/historial/${idHistorialLaboral}/desactivar`
  );
}
