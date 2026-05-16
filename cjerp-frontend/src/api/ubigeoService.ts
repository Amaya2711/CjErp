import httpClient from "./httpClient";
import type { UbigeoOption } from "../models/ubigeo";

export async function listarUbigeos(): Promise<UbigeoOption[]> {
  const response = await httpClient.get<UbigeoOption[]>("/lookup/ubigeos");
  return Array.isArray(response) ? response : [];
}
