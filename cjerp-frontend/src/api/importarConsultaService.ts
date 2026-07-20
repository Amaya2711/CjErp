import httpClient from "./httpClient";
import type {
  ImportarConsultaDshRequest,
  ImportarConsultaDshResponse,
} from "../models/importarConsultaDsh";

const IMPORTAR_CONSULTA_API_URL = "/planilla/consulta-estados";

export async function consultarImportarConsultaDsh(
  request: ImportarConsultaDshRequest,
  options?: { timeoutMs?: number }
): Promise<ImportarConsultaDshResponse> {
  return httpClient.post<ImportarConsultaDshResponse>(IMPORTAR_CONSULTA_API_URL, request, {
    timeout: options?.timeoutMs,
  });
}
