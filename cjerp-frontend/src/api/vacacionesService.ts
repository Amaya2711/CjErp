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
  idEmpleado?: number;
  maxRows?: number;
  consulta?: string;
};

export type VacacionSaldoItem = {
  idPeriodo: number;
  idEmpleado: number;
  idPolitica: number;
  anio: number;
  fechaInicioPeriodo?: string | null;
  fechaFinPeriodo?: string | null;
  diasOtorgados: number;
  diasConsumidos: number;
  diasReservados: number;
  diasDisponibles: number;
  estado?: string | null;
};

export type VacacionSolicitudRegistrarRequest = {
  idEmpleado: number;
  idPeriodo: number;
  fechaInicio: string;
  fechaFin: string;
  cantidadDias: number;
  motivo?: string;
  observacion?: string;
};

export type VacacionSolicitudEstadoRequest = {
  idSolicitud: number;
  observacion?: string;
};

export type VacacionSolicitudRechazarEstadoRequest = {
  idSolicitud: number;
  motivoRechazo: string;
  observacion?: string;
};

export type VacacionSolicitudCancelarEstadoRequest = {
  idSolicitud: number;
  motivoCancelacion: string;
  observacion?: string;
};

export type VacacionMovimientoRevertirRequest = {
  idVacacionMovimiento: number;
  observacion?: string;
};

export type VacacionSolicitudListarRequest = {
  estado?: string;
  fechaInicioDesde?: string;
  fechaInicioHasta?: string;
  nombreEmpleado?: string;
  idEmpleado?: number;
};

export type VacacionMovimientoListarRequest = {
  fechaDesde?: string;
  fechaHasta?: string;
  estado?: string;
  tipoMovimiento?: string;
  nombreEmpleado?: string;
  idEmpleado?: number;
};

export type VacacionSolicitudListItem = {
  idSolicitud: number;
  idEmpleado: number;
  nombreEmpleado?: string | null;
  nroDocumento?: string | null;
  idPeriodo: number;
  anio?: number | null;
  fechaInicio?: string | null;
  fechaFin?: string | null;
  cantidadDias: number;
  estado?: string | null;
  motivo?: string | null;
  observacion?: string | null;
  fechaCreacion?: string | null;
  usuarioCreacion?: string | null;
  fechaAprobacion?: string | null;
  usuarioAprobacion?: string | null;
  fechaRechazo?: string | null;
  usuarioRechazo?: string | null;
  motivoRechazo?: string | null;
  fechaCancelacion?: string | null;
  usuarioCancelacion?: string | null;
  motivoCancelacion?: string | null;
  fechaFinalizacion?: string | null;
  usuarioFinalizacion?: string | null;
};

export type VacacionMovimientoListItem = {
  idVacacionMovimiento: number;
  idEmpleado: number;
  nombreEmpleado?: string | null;
  nroDocumento?: string | null;
  idPeriodo: number;
  anio?: number | null;
  idSolicitud?: number | null;
  fechaMovimiento?: string | null;
  tipoMovimiento?: string | null;
  cantidadDias: number;
  estado?: string | null;
  referencia?: string | null;
  observacion?: string | null;
  idMovimientoOrigen?: number | null;
  usuarioCreacion?: string | null;
  fechaCreacion?: string | null;
};

export type VacacionOperacionResponse = {
  success: boolean;
  message?: string;
  data?: {
    ok?: number;
    exito?: number;
    resultado?: number;
    accion?: string;
    mensaje?: string;
    idPolitica?: number;
    idPeriodo?: number;
    idSolicitud?: number;
    idVacacionMovimiento?: number;
    idMovimientoReversa?: number;
  };
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
  const params: VacacionesConsultaRequest = {
    consulta: "vacaciones",
    ...payload,
  };

  return await httpClient.get<PlanillaConsultaEstadosResponse>("/admin/vacaciones/listar", {
    params,
  });
}

export async function obtenerSaldoVacaciones(idEmpleado: number) {
  return await httpClient.get<{ success: boolean; message?: string; data?: VacacionSaldoItem[] }>(
    `/admin/vacaciones/saldo/${idEmpleado}`
  );
}

export async function listarSolicitudesVacaciones(payload: VacacionSolicitudListarRequest = {}) {
  return await httpClient.get<{ success: boolean; message?: string; data?: VacacionSolicitudListItem[] }>(
    "/admin/vacaciones/solicitud/listar",
    {
      params: payload,
    }
  );
}

export async function listarMovimientosVacaciones(payload: VacacionMovimientoListarRequest = {}) {
  return await httpClient.get<{ success: boolean; message?: string; data?: VacacionMovimientoListItem[] }>(
    "/admin/vacaciones/movimiento/listar",
    {
      params: payload,
    }
  );
}

export async function registrarSolicitudVacaciones(payload: VacacionSolicitudRegistrarRequest) {
  return await httpClient.post<VacacionOperacionResponse>("/admin/vacaciones/solicitud", payload);
}

export async function aprobarSolicitudVacaciones(payload: VacacionSolicitudEstadoRequest) {
  return await httpClient.post<VacacionOperacionResponse>("/admin/vacaciones/solicitud/aprobar", payload);
}

export async function rechazarSolicitudVacaciones(payload: VacacionSolicitudRechazarEstadoRequest) {
  return await httpClient.post<VacacionOperacionResponse>("/admin/vacaciones/solicitud/rechazar", payload);
}

export async function cancelarSolicitudVacaciones(payload: VacacionSolicitudCancelarEstadoRequest) {
  return await httpClient.post<VacacionOperacionResponse>("/admin/vacaciones/solicitud/cancelar", payload);
}

export async function finalizarSolicitudVacaciones(payload: VacacionSolicitudEstadoRequest) {
  return await httpClient.post<VacacionOperacionResponse>("/admin/vacaciones/solicitud/finalizar", payload);
}

export async function revertirMovimientoVacaciones(payload: VacacionMovimientoRevertirRequest) {
  return await httpClient.post<VacacionOperacionResponse>("/admin/vacaciones/movimiento/revertir", payload);
}
