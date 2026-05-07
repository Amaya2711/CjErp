import httpClient from "./httpClient";
import type { ConstanteOption } from "../models/constante";
import type { SolicitanteLookupDto } from "../models/solicitante";

function extraerArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function mapValidadorToOption(item: SolicitanteLookupDto): ConstanteOption {
  const codigo = String(item.id ?? "");

  return {
    value: codigo,
    codigo,
    label: item.nombre ?? "",
    valor: codigo,
    campo: "validador",
    orden: 0,
  };
}

export async function listarValidadorOptions(): Promise<ConstanteOption[]> {
  const response = await httpClient.get<SolicitanteLookupDto[]>("/lookup/validador");

  return extraerArray<SolicitanteLookupDto>(response)
    .map(mapValidadorToOption)
    .sort((a, b) => a.label.localeCompare(b.label));
}
