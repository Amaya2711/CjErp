import httpClient from "./httpClient";
import type {
  ConciliacionBcpAnalizarRequest,
  ConciliacionBcpAnalizarResponse,
  ConciliacionBcpActualizarClasificacionRequest,
  ConciliacionBcpActualizarComentarioRequest,
  ConciliacionBcpClasificacionCombosResponse,
  ConciliacionBcpConciliarPlanillaRequest,
  ConciliacionBcpConciliarPlanillaResponse,
  ConciliacionBcpConciliarPlanillaRegistro,
  ConciliacionBcpExportRequest,
  ConciliacionBcpExportResponse,
  ConciliacionBcpInsertRequest,
  ConciliacionBcpInsertResponse,
  IngresosPendientesResponse,
  CxcCargaSireResponse,
  CxcDocumento,
  CxcCargaDetraccionesResponse,
  CxcDetraccion,
} from "../models/conciliacionBcp";

const BASE_URL = "/finanzas/conciliacion";

// El backend ejecuta dos SP con CommandTimeout de 300 s (movimientos + sp_Planilla_Consulta_Estados).
// El timeout del cliente debe ser mayor para recibir el error del servidor en vez de cortar antes.
const CONCILIAR_TIMEOUT_MS = 330000;

export async function analizarConciliacionBcp(
  request: ConciliacionBcpAnalizarRequest
): Promise<ConciliacionBcpAnalizarResponse> {
  return await httpClient.post<ConciliacionBcpAnalizarResponse>(`${BASE_URL}/analizar`, request, {
    timeout: 120000,
  });
}

export async function insertarConciliacionBcp(
  request: ConciliacionBcpInsertRequest
): Promise<ConciliacionBcpInsertResponse> {
  return await httpClient.post<ConciliacionBcpInsertResponse>(`${BASE_URL}/insertar`, request, {
    timeout: 120000,
  });
}

export async function exportarAnalisisConciliacionBcp(
  request: ConciliacionBcpExportRequest
): Promise<ConciliacionBcpExportResponse> {
  return await httpClient.post<ConciliacionBcpExportResponse>(`${BASE_URL}/exportar-analisis`, request, {
    timeout: 120000,
  });
}

export async function conciliarPlanillaConciliacionBcp(
  request: ConciliacionBcpConciliarPlanillaRequest
): Promise<ConciliacionBcpConciliarPlanillaResponse> {
  return await httpClient.post<ConciliacionBcpConciliarPlanillaResponse>(`${BASE_URL}/conciliar-planilla`, request, {
    timeout: CONCILIAR_TIMEOUT_MS,
  });
}

export async function conciliarPlanillaConciliacionV1(
  request: ConciliacionBcpConciliarPlanillaRequest
): Promise<ConciliacionBcpConciliarPlanillaResponse> {
  return await httpClient.post<ConciliacionBcpConciliarPlanillaResponse>(`${BASE_URL}/conciliar-planilla-v1`, request, {
    timeout: CONCILIAR_TIMEOUT_MS,
  });
}

export async function actualizarComentarioMovimientoConciliacionBcp(
  idMovimientoBanco: number,
  request: ConciliacionBcpActualizarComentarioRequest
): Promise<ConciliacionBcpConciliarPlanillaRegistro> {
  return await httpClient.put<ConciliacionBcpConciliarPlanillaRegistro>(
    `${BASE_URL}/movimientos/${idMovimientoBanco}/comentario`,
    request,
    {
      timeout: 30000,
    }
  );
}

export async function actualizarComentarioMovimientoConciliacionV1(
  idMovimientoBanco: number,
  request: ConciliacionBcpActualizarComentarioRequest
): Promise<ConciliacionBcpConciliarPlanillaRegistro> {
  return await httpClient.put<ConciliacionBcpConciliarPlanillaRegistro>(
    `${BASE_URL}/movimientos/${idMovimientoBanco}/comentario-v1`,
    request,
    {
      timeout: 30000,
    }
  );
}

export async function obtenerCombosClasificacionConciliacionBcp(): Promise<ConciliacionBcpClasificacionCombosResponse> {
  return await httpClient.get<ConciliacionBcpClasificacionCombosResponse>(`${BASE_URL}/clasificacion/combos`, {
    timeout: 30000,
  });
}

export async function actualizarClasificacionMovimientoConciliacionBcp(
  request: ConciliacionBcpActualizarClasificacionRequest
): Promise<ConciliacionBcpConciliarPlanillaRegistro> {
  return await httpClient.put<ConciliacionBcpConciliarPlanillaRegistro>(
    `${BASE_URL}/movimientos/clasificacion`,
    request,
    {
      timeout: 30000,
    }
  );
}

export async function actualizarClasificacionMovimientoConciliacionV1(
  request: ConciliacionBcpActualizarClasificacionRequest
): Promise<ConciliacionBcpConciliarPlanillaRegistro> {
  return await httpClient.put<ConciliacionBcpConciliarPlanillaRegistro>(
    `${BASE_URL}/movimientos/clasificacion-v1`,
    request,
    {
      timeout: 30000,
    }
  );
}

export async function cargarSireCxc(params: {
  nombreArchivo: string;
  contenido: string;
  soloAnalizar: boolean;
}): Promise<CxcCargaSireResponse> {
  return await httpClient.post<CxcCargaSireResponse>("/finanzas/cxc/carga-sire", params, {
    timeout: 120000,
  });
}

export async function cargarDetraccionesCxc(params: {
  nombreArchivo: string;
  contenido: string;
  soloAnalizar: boolean;
}): Promise<CxcCargaDetraccionesResponse> {
  return await httpClient.post<CxcCargaDetraccionesResponse>("/finanzas/cxc/carga-detracciones", params, {
    timeout: 120000,
  });
}

export async function obtenerDetraccionesCxc(): Promise<CxcDetraccion[]> {
  return await httpClient.get<CxcDetraccion[]>("/finanzas/cxc/detracciones", { timeout: 30000 });
}

export async function obtenerDocumentosCxc(periodo?: string | null): Promise<CxcDocumento[]> {
  return await httpClient.get<CxcDocumento[]>("/finanzas/cxc/documentos", {
    params: { periodo: periodo || undefined },
    timeout: 30000,
  });
}

export async function obtenerIngresosPendientes(params: {
  fechaInicio?: string | null;
  fechaFin?: string | null;
  codigoBanco?: string | null;
}): Promise<IngresosPendientesResponse> {
  return await httpClient.get<IngresosPendientesResponse>(`${BASE_URL}/ingresos-pendientes`, {
    params: {
      fechaInicio: params.fechaInicio || undefined,
      fechaFin: params.fechaFin || undefined,
      codigoBanco: params.codigoBanco || undefined,
    },
    timeout: 30000,
  });
}
