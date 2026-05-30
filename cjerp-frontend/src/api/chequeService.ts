import httpClient from "./httpClient";
import type {
  ChequeFiltro,
  ChequeGuardarRequest,
  ChequeRechazarRequest,
  ChequeRow,
} from "../models/cheque";

const BASE_URL = "/tesoreria/cheques";

export type ChequeImagenUploadResponse = {
  fileName: string;
  fileUrl: string;
  storagePath: string;
};

function sanitizeNumber(value?: number | null): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function listarCheques(filtro: ChequeFiltro = {}): Promise<ChequeRow[]> {
  const response = await httpClient.get<ChequeRow[]>(BASE_URL, {
    params: {
      idEmpleado: sanitizeNumber(filtro.idEmpleado),
      idEstado: sanitizeNumber(filtro.idEstado),
    },
  });

  return Array.isArray(response) ? response : [];
}

export async function obtenerCheque(idCheque: number): Promise<ChequeRow> {
  return await httpClient.get<ChequeRow>(`${BASE_URL}/${idCheque}`);
}

export async function crearCheque(payload: ChequeGuardarRequest): Promise<ChequeRow> {
  return await httpClient.post<ChequeRow>(BASE_URL, payload);
}

export async function actualizarCheque(idCheque: number, payload: ChequeGuardarRequest): Promise<ChequeRow> {
  return await httpClient.put<ChequeRow>(`${BASE_URL}/${idCheque}`, payload);
}

export async function rechazarCheque(
  idCheque: number,
  payload: ChequeRechazarRequest
): Promise<ChequeRow> {
  return await httpClient.post<ChequeRow>(`${BASE_URL}/${idCheque}/rechazar`, payload);
}

export async function subirImagenCheque(formData: FormData): Promise<ChequeImagenUploadResponse> {
  return await httpClient.post<ChequeImagenUploadResponse>(`${BASE_URL}/upload-imagen`, formData);
}
