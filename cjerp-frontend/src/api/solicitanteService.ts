import httpClient from "./httpClient";
import type { ConstanteOption } from "../models/constante";
import type { SolicitanteLookupDto } from "../models/solicitante";

type GetSolicitanteParams = {
  idCargo?: number | null;
  idEmpleado?: number | null;
};

function extraerArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function mapSolicitanteToOption(item: SolicitanteLookupDto): ConstanteOption {
  const codigo = String(item.id ?? "");

  return {
    value: codigo,
    codigo,
    label: item.nombre ?? "",
    valor: codigo,
    campo: "solicitante",
    orden: 0,
  };
}

export async function listarSolicitanteOptions(
  params: GetSolicitanteParams
): Promise<ConstanteOption[]> {
  const response = await httpClient.get<SolicitanteLookupDto[]>("/lookup/solicitantes", {
    params: {
      idCargo: params.idCargo && params.idCargo > 0 ? params.idCargo : undefined,
      idEmpleado: params.idEmpleado && params.idEmpleado > 0 ? params.idEmpleado : undefined,
    },
  });

  return extraerArray<SolicitanteLookupDto>(response)
    .map(mapSolicitanteToOption)
    .sort((a, b) => a.label.localeCompare(b.label));
}
