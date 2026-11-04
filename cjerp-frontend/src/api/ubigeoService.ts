import httpClient from "./httpClient";
import type { UbigeoOption } from "../models/ubigeo";

export async function listarUbigeos(): Promise<UbigeoOption[]> {
  // El backend deja esta respuesta 30 min en la caché del navegador; `v` fuerza una copia nueva cuando cambia el formato
  // (v2: se agregó codUbigeo; las copias antiguas traían idUbigeo = 0 en todas las filas).
  const response = await httpClient.get<UbigeoOption[]>("/lookup/ubigeos", { params: { v: 2 } });
  return Array.isArray(response) ? response : [];
}
