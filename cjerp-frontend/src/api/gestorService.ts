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
  idEmpleado?: number | null
): Promise<ConstanteOption[]> {
  const response = await httpClient.get<SolicitanteLookupDto[]>("/lookup/gestores", {
    params: { idEmpleado: idEmpleado && idEmpleado > 0 ? idEmpleado : undefined },
  });

  return extraerArray<SolicitanteLookupDto>(response)
    .map(mapGestorToOption)
    .sort((a, b) => a.label.localeCompare(b.label));
}

export type GestorValidadorOptions = {
  gestores: ConstanteOption[];
  validadores: ConstanteOption[];
};

export async function listarGestorValidadorOptions(
  idEmpleadoCj: number
): Promise<GestorValidadorOptions> {
  const response = await httpClient.get<{
    gestores?: SolicitanteLookupDto[];
    validadores?: SolicitanteLookupDto[];
  }>("/lookup/gestor-validador", { params: { idEmpleadoCj } });

  return {
    gestores: extraerArray<SolicitanteLookupDto>(response?.gestores)
      .map(mapGestorToOption)
      .sort((a, b) => a.label.localeCompare(b.label)),
    validadores: extraerArray<SolicitanteLookupDto>(response?.validadores)
      .map((item) => ({ ...mapGestorToOption(item), campo: "validador" }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}
