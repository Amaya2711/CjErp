import httpClient from "./httpClient";

export type MovimientoConsultaParametro = {
  nombre: string;
  valor: string;
  tipo: string;
};

export type MovimientoConsultaRequest = {
  consulta: string;
  parametros: MovimientoConsultaParametro[];
  maxRows?: number;
  pageNumber?: number;
  pageSize?: number;
};

export type MovimientoConsultaResponse = {
  rows?: Record<string, unknown>[];
  totalRows?: number;
  limitExceeded?: boolean;
  message?: string | null;
};

const MOVIMIENTOS_CONSULTA_API_URL = "/planilla/consulta-estados";

export async function consultarMovimientosGastosIngresos(
  request: MovimientoConsultaRequest,
  options?: { timeoutMs?: number },
): Promise<MovimientoConsultaResponse> {
  return httpClient.post<MovimientoConsultaResponse>(MOVIMIENTOS_CONSULTA_API_URL, request, {
    timeout: options?.timeoutMs,
  });
}
