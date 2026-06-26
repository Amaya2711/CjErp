import httpClient from "./httpClient";
import type {
  ConciliacionBcpAnalizarRequest,
  ConciliacionBcpAnalizarResponse,
  ConciliacionBcpConciliarPlanillaRequest,
  ConciliacionBcpConciliarPlanillaResponse,
  ConciliacionBcpExportRequest,
  ConciliacionBcpExportResponse,
  ConciliacionBcpInsertRequest,
  ConciliacionBcpInsertResponse,
} from "../models/conciliacionBcp";

const BASE_URL = "/finanzas/conciliacion";

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
    timeout: 120000,
  });
}
