import axios from "axios";
import httpClient from "../../../../../api/httpClient";
import type { IaChatRequest, IaChatResponse } from "../types";

export async function consultarIaChat(request: IaChatRequest): Promise<IaChatResponse> {
  return httpClient.post<IaChatResponse>("/ia-chat/consultar", request, {
    timeout: 120000,
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
