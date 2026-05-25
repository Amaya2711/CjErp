import httpClient from "./httpClient";
import type { AuditoriaCambioFiltro, AuditoriaCambioItem } from "../models/auditoria";

const BASE_URL = "/auditoria-cambios";

export async function consultarAuditoriaCambios(filtro: AuditoriaCambioFiltro) {
  return await httpClient.get<AuditoriaCambioItem[]>(BASE_URL, { params: filtro });
}
