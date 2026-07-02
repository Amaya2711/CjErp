import httpClient from "./httpClient";
import type { ConstanteOption } from "../models/constante";
import type { EmpleadoCta } from "../models/empleadoCta";
import type { TareaOption } from "../models/filtroOperativo";
import type { SolicitanteLookupDto } from "../models/solicitante";

type TareaBootstrapItem = {
  correlativo?: string | number;
  Correlativo?: string | number;
  tarea?: string;
  Tarea?: string;
};

type GastosBootstrapApiResponse = {
  empleados?: EmpleadoCta[];
  solicitantes?: SolicitanteLookupDto[];
  gestores?: SolicitanteLookupDto[];
  validadores?: SolicitanteLookupDto[];
  tareas?: TareaBootstrapItem[];
};

export type GastosBootstrapResponse = {
  empleados: EmpleadoCta[];
  solicitantes: ConstanteOption[];
  gestores: ConstanteOption[];
  validadores: ConstanteOption[];
  tareas: TareaOption[];
};

type GastosBootstrapParams = {
  idCargo?: number | null;
  idEmpleado?: number | null;
};

function extraerArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function mapLookupToOption(
  item: SolicitanteLookupDto,
  campo: "solicitante" | "gestor" | "validador"
): ConstanteOption {
  const codigo = String(item.id ?? "");

  return {
    value: codigo,
    codigo,
    label: item.nombre ?? "",
    valor: codigo,
    campo,
    orden: 0,
  };
}

export async function getGastosBootstrap(
  params: GastosBootstrapParams
): Promise<GastosBootstrapResponse> {
  const response = await httpClient.get<GastosBootstrapApiResponse>("/lookup/gastos/bootstrap", {
    params: {
      idCargo: params.idCargo && params.idCargo > 0 ? params.idCargo : undefined,
      idEmpleado: params.idEmpleado && params.idEmpleado > 0 ? params.idEmpleado : undefined,
    },
  });

  return {
    empleados: extraerArray<EmpleadoCta>(response?.empleados),
    solicitantes: extraerArray<SolicitanteLookupDto>(response?.solicitantes)
      .map((item) => mapLookupToOption(item, "solicitante"))
      .sort((a, b) => a.label.localeCompare(b.label)),
    gestores: extraerArray<SolicitanteLookupDto>(response?.gestores)
      .map((item) => mapLookupToOption(item, "gestor"))
      .sort((a, b) => a.label.localeCompare(b.label)),
    validadores: extraerArray<SolicitanteLookupDto>(response?.validadores)
      .map((item) => mapLookupToOption(item, "validador"))
      .sort((a, b) => a.label.localeCompare(b.label)),
    tareas: extraerArray<TareaBootstrapItem>(response?.tareas)
      .map((item) => ({
        correlativo: Number(item?.correlativo ?? item?.Correlativo ?? 0),
        tarea: item?.tarea ?? item?.Tarea ?? "",
      }))
      .filter((item) => Number.isFinite(item.correlativo) && item.correlativo > 0),
  };
}
