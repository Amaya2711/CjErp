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
  solicitudVigencia: ContratoEmpleadoSolicitudVigencia | null;
};

export type RenovarContratoRequest = {
  idEmpleado: number;
  nuevaFechaFinLaboral: string;
  motivoMovimiento?: string;
  observacion?: string;
};

export type ContratoEmpleadoSolicitudVigencia = {
  idSolicitudVigencia: number;
  idEmpleado: number;
  fechaFinActual: string;
  nuevaFechaFinLaboral: string;
  estadoSolicitud: string;
  aprobacionesRealizadas: number;
  aprobacionesRequeridas: number;
  aprobacion1IdEmpleado: number | null;
  aprobacion2IdEmpleado: number | null;
  aprobacion3IdEmpleado: number | null;
  aprobacion1Usuario: string | null;
  aprobacion2Usuario: string | null;
  aprobacion3Usuario: string | null;
  aprobacion1Observacion: string | null;
  aprobacion2Observacion: string | null;
  aprobacion3Observacion: string | null;
  aprobacion1Fecha: string | null;
  aprobacion2Fecha: string | null;
  aprobacion3Fecha: string | null;
  usuarioCre: string | null;
  fechaCreacion: string | null;
  usuarioMod: string | null;
  fechaMod: string | null;
};

export type AprobarVigenciaRequest = {
  observacion?: string;
};

export async function obtenerContratoEmpleado(idEmpleado: number): Promise<ContratoEmpleadoResponse> {
  const response = await httpClient.get<ContratoEmpleadoResponse>(`/recursoshumanos/contratos/${idEmpleado}`);
  return {
    empleado: response?.empleado ?? null,
    historial: Array.isArray(response?.historial) ? response.historial : [],
    solicitudVigencia: response?.solicitudVigencia ?? null,
  };
}

export async function renovarContratoEmpleado(payload: RenovarContratoRequest) {
  return await httpClient.put<{
    idEmpleado: number;
    nuevaFechaFinLaboral: string;
    estadoSolicitud: string;
    observacion: string;
  }>(
    "/recursoshumanos/contratos/renovar",
    payload
  );
}

export async function aprobarVigenciaContratoEmpleado(idEmpleado: number, payload: AprobarVigenciaRequest = {}) {
  return await httpClient.post<{
    idSolicitudVigencia: number;
    idEmpleado: number;
    nuevaFechaFinLaboral: string;
    estadoSolicitud: string;
    aprobacionesRealizadas: number;
    aprobacionesRequeridas: number;
  }>(`/recursoshumanos/contratos/${idEmpleado}/aprobar-vigencia`, payload);
}

export async function desactivarHistorialContrato(idHistorialLaboral: number) {
  return await httpClient.put<{ idHistorialLaboral: number; usuario: string }>(
    `/recursoshumanos/contratos/historial/${idHistorialLaboral}/desactivar`
  );
}
