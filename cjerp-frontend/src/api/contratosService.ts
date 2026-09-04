import axios from "axios";
import httpClient from "./httpClient";

export type ContratoEmpleadoDetalle = {
  idEmpleado: number;
  nombreEmpleado: string;
  nroDocumento: string;
  correo: string;
  telefono: string;
  direccion: string;
  empresa: string;
  cliente: string;
  area: string;
  ubicacion: string;
  cargoPrint: string;
  idCargo: number | null;
  idTipoEmpleado: number | null;
  idEmpRel: number | null;
  idEstado: number | null;
  idActivo: boolean | null;
  fechaIniLaboral: string;
  fechaFinLaboral: string;
  fechaBaja: string;
  mesesN?: string | null;
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
  nivelAprobacion?: number;
  documentPath?: string;
  fileName?: string;
};

export type GenerarPlantillaContratoRequest = {
  documentPath: string;
  fileName: string;
  replacements: Record<string, string>;
};

export async function obtenerContratoEmpleado(idEmpleado: number): Promise<ContratoEmpleadoResponse> {
  const response = await httpClient.get<ContratoEmpleadoResponse>(`/recursoshumanos/contratos/${idEmpleado}`);
  return {
    empleado: response?.empleado ?? null,
    historial: Array.isArray(response?.historial) ? response.historial : [],
    solicitudVigencia: response?.solicitudVigencia ?? null,
  };
}

export async function listarContratosResumen(): Promise<ContratoEmpleadoDetalle[]> {
  const response = await httpClient.get<ContratoEmpleadoDetalle[]>("/recursoshumanos/contratos/resumen");
  return Array.isArray(response) ? response : [];
}

export async function renovarContratoEmpleado(payload: RenovarContratoRequest) {
  return await httpClient.put<{
    idEmpleado: number;
    nuevaFechaFinLaboral: string;
    estadoSolicitud: string;
    observacion: string;
    actualizoSolicitudPendiente?: boolean;
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

export async function generarPlantillaContrato(payload: GenerarPlantillaContratoRequest) {
  try {
    return await httpClient.post<Blob>(
      "/recursoshumanos/contratos/plantilla",
      payload,
      {
        responseType: "blob",
        skipAuthRedirect: false,
      }
    );
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
      const responseText = await error.response.data.text();
      if (responseText.trim()) {
        try {
          const parsed = JSON.parse(responseText) as {
            message?: string;
            detail?: string;
          };
          const message = [parsed.message, parsed.detail].filter(Boolean).join(" | ").trim();
          if (message) {
            throw new Error(message);
          }
        } catch {
          throw new Error(responseText);
        }
      }
    }

    throw error;
  }
}
