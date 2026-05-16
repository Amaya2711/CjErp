import httpClient from "./httpClient";
import type {
  LogisticaRecojoBuscarRequest,
  LogisticaRecojoDto,
  LogisticaRecojoInsertRequest,
} from "../models/logisticaRecojo";

export async function buscarLogisticaRecojo(payload: LogisticaRecojoBuscarRequest) {
  return await httpClient.post<LogisticaRecojoDto[]>("/logistica/recojo/buscar", payload);
}

export async function insertarLogisticaRecojo(payload: LogisticaRecojoInsertRequest) {
  return await httpClient.post<{ idRecojo: number }>("/logistica/recojo/insertar", payload);
}
