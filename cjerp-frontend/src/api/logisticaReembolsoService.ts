import httpClient from "./httpClient";
import type {
  LogisticaReembolsoBuscarRequest,
  LogisticaReembolsoDto,
  LogisticaReembolsoUpdateRequest,
} from "../models/logisticaReembolso";

export async function buscarLogisticaReembolso(payload: LogisticaReembolsoBuscarRequest) {
  return await httpClient.post<LogisticaReembolsoDto[]>("/operacion/reembolso/buscar", payload);
}

export async function actualizarLogisticaReembolso(payload: LogisticaReembolsoUpdateRequest) {
  return await httpClient.post<unknown>("/operacion/reembolso/actualizar", payload);
}
