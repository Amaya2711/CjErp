import httpClient from "./httpClient";
import type { ConstanteLookupDto, ConstanteOption } from "../models/constante";

function extraerArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function mapConstanteToOption(item: ConstanteLookupDto): ConstanteOption {
  const campoNormalizado = String(item.campo ?? "").trim().toLowerCase();
  const firstNonEmpty = (...values: Array<string | null | undefined>) =>
    values.find((value) => String(value ?? "").trim())?.trim() ?? "";
  const label = campoNormalizado === "estado_cheque"
    ? firstNonEmpty(item.valorIni, item.descripcion)
    : campoNormalizado === "banco"
      ? firstNonEmpty(item.valorIni, item.descripcion, item.detalle, item.valor)
      : (item.descripcion ?? "");

  return {
    value: campoNormalizado === "banco" ? item.codigo : (item.valor ?? ""),
    label,
    codigo: item.codigo,
    valor: item.valor,
    campo: item.campo,
    orden: item.orden ?? 0,
  };
}

export async function getConstantesPorCampo(campo: string): Promise<ConstanteLookupDto[]> {
  const response = await httpClient.get<ConstanteLookupDto[]>("/lookup/constantes", {
    params: { campo, cacheBust: Date.now() },
    headers: { "Cache-Control": "no-cache" },
  });

  return extraerArray<ConstanteLookupDto>(response);
}

export async function getConstanteOptionsPorCampo(campo: string): Promise<ConstanteOption[]> {
  const data = await getConstantesPorCampo(campo);

  return data
    .map(mapConstanteToOption)
    .sort((a, b) => a.orden - b.orden || a.label.localeCompare(b.label));
}
