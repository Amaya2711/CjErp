import axios from "axios";
import httpClient from "../../../../../api/httpClient";
import type {
  IaChatDashboardExportRequest,
  IaChatDashboardExportResponse,
  IaChatRequest,
  IaChatResponse,
} from "../types";

export async function consultarIaChat(request: IaChatRequest): Promise<IaChatResponse> {
  const response = await httpClient.post<IaChatResponse>("/ia-chat/consultar", request, {
    timeout: 300000,
  });

  // TEMPORAL (depuración): parámetros usados en dbo.sp_IA_Planilla_Buscar. Quitar tras depurar.
  const spParameters = response?.interpretedFilters?.spParameters;
  if (Array.isArray(spParameters) && spParameters.length > 0) {
    console.log("[IA Chat] Parámetros enviados a sp_IA_Planilla_Buscar:\n" + spParameters.join("\n"));
  }

  return response;
}

export async function exportarDashboardIaChat(
  request: IaChatDashboardExportRequest,
): Promise<IaChatDashboardExportResponse> {
  return httpClient.post<IaChatDashboardExportResponse>("/ia-chat/exportar-dashboard", request, {
    timeout: 300000,
  });
}

export function getIaChatErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { errorMessage?: string; message?: string; detail?: string }
      | undefined;

    return (
      data?.errorMessage ||
      data?.message ||
      data?.detail ||
      error.message ||
      "No fue posible consultar el asistente."
    );
  }

  if (error instanceof Error) {
    return error.message || "No fue posible consultar el asistente.";
  }

  return "No fue posible consultar el asistente.";
}
