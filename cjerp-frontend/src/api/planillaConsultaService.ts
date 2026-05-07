import httpClient from "./httpClient";
import type {
  PlanillaConsultaParametro,
  PlanillaConsultaEstadosRequest,
  PlanillaConsultaEstadosResponse,
} from "../models/planillaConsulta";
import { getAuthUser } from "../utils/authStorage";

const PLANILLA_CONSULTA_API_URL = "/planilla/consulta-estados";

function toPositiveIntegerString(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? String(Math.trunc(parsed)) : "";
}

function getFirstPositiveIntegerString(...values: unknown[]): string {
  for (const value of values) {
    const normalized = toPositiveIntegerString(value);

    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function normalizeParametroNombre(nombre: string): string {
  return nombre.trim().replace(/^@+/, "").toLowerCase();
}

export function buildPlanillaConsultaEstadosBaseParams(): PlanillaConsultaParametro[] {
  const authUser = getAuthUser();
  const idCargo = getFirstPositiveIntegerString(
    authUser?.idCargo,
    authUser?.idrol,
    (authUser as Record<string, unknown> | null)?.IdRol
  );
  const idEmpleado = getFirstPositiveIntegerString(
    authUser?.idEmpleado,
    authUser?.codEmp,
    authUser?.empleado,
    (authUser as Record<string, unknown> | null)?.IdEmpleado
  );

  console.log(
    "[PlanillaConsulta] codigoidrol",
    authUser?.idrol ?? (authUser as Record<string, unknown> | null)?.IdRol ?? ""
  );
  console.log(
    "[PlanillaConsulta] codigoEmpleadoMostrar",
    authUser?.idEmpleado ??
      authUser?.codEmp ??
      authUser?.empleado ??
      (authUser as Record<string, unknown> | null)?.IdEmpleado ??
      ""
  );
  console.log("[PlanillaConsulta] parametros base", {
    IdCargo: idCargo,
    IdEmpleado: idEmpleado,
  });

  return [
    {
      nombre: "IdCargo",
      valor: idCargo,
      tipo: "int",
    },
    {
      nombre: "IdEmpleado",
      valor: idEmpleado,
      tipo: "int",
    },
  ];
}

export function buildPlanillaConsultaEstadosRequest(
  parametros: PlanillaConsultaParametro[]
): PlanillaConsultaEstadosRequest {
  const merged = [...buildPlanillaConsultaEstadosBaseParams(), ...parametros];
  const deduped = new Map<string, PlanillaConsultaParametro>();

  for (const parametro of merged) {
    const normalizedName = normalizeParametroNombre(parametro.nombre);

    if (!normalizedName) {
      continue;
    }

    deduped.set(normalizedName, {
      ...parametro,
      nombre: parametro.nombre.trim().replace(/^@+/, ""),
    });
  }

  const request = {
    parametros: Array.from(deduped.values()),
  };

  console.log("[PlanillaConsulta] request final", request);

  return request;
}

export async function consultarPlanillaEstados(
  request: PlanillaConsultaEstadosRequest
): Promise<PlanillaConsultaEstadosResponse> {
  return httpClient.post<PlanillaConsultaEstadosResponse>(PLANILLA_CONSULTA_API_URL, request);
}
