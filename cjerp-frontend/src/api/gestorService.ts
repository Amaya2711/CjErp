import httpClient from "./httpClient";
import type { ConstanteOption } from "../models/constante";
import type { SolicitanteLookupDto } from "../models/solicitante";

function extraerArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function mapGestorToOption(item: SolicitanteLookupDto): ConstanteOption {
  const codigo = String(item.id ?? "");

  return {
    value: codigo,
    codigo,
    label: item.nombre ?? "",
    valor: codigo,
    campo: "gestor",
    orden: 0,
  };
}

export async function listarGestorOptions(
): Promise<ConstanteOption[]> {
  const response = await httpClient.get<SolicitanteLookupDto[]>("/lookup/gestores");

  return extraerArray<SolicitanteLookupDto>(response)
    .map(mapGestorToOption)
    .sort((a, b) => a.label.localeCompare(b.label));
}
