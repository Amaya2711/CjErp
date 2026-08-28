import httpClient from "./httpClient";
import type { ConstanteLookupDto, ConstanteOption } from "../models/constante";

function extraerArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function mapConstanteToOption(item: ConstanteLookupDto): ConstanteOption {
  const campoNormalizado = String(item.campo ?? "").trim().toLowerCase();
  const label =
    campoNormalizado === "estado_cheque"
      ? (item.valorIni ?? item.descripcion ?? "")
      : (item.descripcion ?? "");

  return {
    value: item.valor ?? "",
    label,
    codigo: item.codigo,
    valor: item.valor,
    campo: item.campo,
    orden: item.orden ?? 0,
  };
}

export async function getConstantesPorCampo(campo: string): Promise<ConstanteLookupDto[]> {
  const response = await httpClient.get<ConstanteLookupDto[]>("/lookup/constantes", {
    params: { campo },
  });

  return extraerArray<ConstanteLookupDto>(response);
}

export async function getConstanteOptionsPorCampo(campo: string): Promise<ConstanteOption[]> {
  const data = await getConstantesPorCampo(campo);

  return data
    .map(mapConstanteToOption)
    .sort((a, b) => a.orden - b.orden || a.label.localeCompare(b.label));
}
