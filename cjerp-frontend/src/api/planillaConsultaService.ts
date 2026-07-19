import httpClient from "./httpClient";
import type {
  PlanillaConsultaParametro,
  PlanillaConsultaEstadosRequest,
  PlanillaConsultaEstadosResponse,
} from "../models/planillaConsulta";
import { getAuthUser } from "../utils/authStorage";
import { parseJwtPayload } from "../utils/jwt";

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

function getJwtClaimValue(
  payload: Record<string, unknown> | null,
  ...keys: string[]
): unknown {
  if (!payload) {
    return undefined;
  }

  for (const key of keys) {
    if (key in payload) {
      return payload[key];
    }
  }

  return undefined;
}

export function buildPlanillaConsultaEstadosBaseParams(): PlanillaConsultaParametro[] {
  const authUser = getAuthUser();
  const jwtPayload = authUser?.token ? parseJwtPayload(authUser.token) : null;
  const idCargo = getFirstPositiveIntegerString(
    authUser?.idCargo,
    authUser?.idrol,
    (authUser as Record<string, unknown> | null)?.IdRol,
    getJwtClaimValue(
      jwtPayload,
      "IdCargo",
      "idCargo",
      "IdRol",
      "idRol",
      "idrol",
      "role"
    )
  );
  const idEmpleado = getFirstPositiveIntegerString(
    authUser?.idEmpleado,
    authUser?.codEmp,
    authUser?.empleado,
    (authUser as Record<string, unknown> | null)?.IdEmpleado,
    getJwtClaimValue(
      jwtPayload,
      "IdEmpleado",
      "idEmpleado",
      "CodEmp",
      "codEmp",
      "CodEmpleadoMostrar",
      "nameid",
      "sub",
      "IdUsuario"
    )
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
  request: PlanillaConsultaEstadosRequest,
  options?: { timeoutMs?: number }
): Promise<PlanillaConsultaEstadosResponse> {
  return httpClient.post<PlanillaConsultaEstadosResponse>(PLANILLA_CONSULTA_API_URL, request, {
    timeout: options?.timeoutMs,
  });
}

export function buildPlanillaPagadosDashboardRequest(args: {
  fechaInicio: string;
  fechaFin: string;
  textoBusqueda?: string;
  idCliente?: number;
  idProyecto?: number;
  idSite?: string;
  correlativo?: number;
  maxRows?: number;
  pageNumber?: number;
  pageSize?: number;
}): PlanillaConsultaEstadosRequest {
  const parametros: PlanillaConsultaParametro[] = [
    {
      nombre: "FechaInicio",
      valor: args.fechaInicio,
      tipo: "date",
    },
    {
      nombre: "FechaFin",
      valor: args.fechaFin,
      tipo: "date",
    },
  ];

  const textoBusqueda = args.textoBusqueda?.trim() ?? "";
  if (textoBusqueda) {
    parametros.push({
      nombre: "TextoBusqueda",
      valor: textoBusqueda,
      tipo: "string",
    });
  }

  if (Number.isFinite(args.idCliente) && (args.idCliente ?? 0) > 0) {
    parametros.push({
      nombre: "IdCliente",
      valor: String(Math.trunc(args.idCliente as number)),
      tipo: "int",
    });
  }

  if (Number.isFinite(args.idProyecto) && (args.idProyecto ?? 0) > 0) {
    parametros.push({
      nombre: "IdProyecto",
      valor: String(Math.trunc(args.idProyecto as number)),
      tipo: "int",
    });
  }

  const idSite = args.idSite?.trim() ?? "";
  if (idSite) {
    parametros.push({
      nombre: "IdSite",
      valor: idSite,
      tipo: "string",
    });
  }

  if (Number.isFinite(args.correlativo) && (args.correlativo ?? 0) > 0) {
    parametros.push({
      nombre: "Correlativo",
      valor: String(Math.trunc(args.correlativo as number)),
      tipo: "int",
    });
  }

  return {
    consulta: "pagados-dashboard",
    parametros,
    maxRows: args.maxRows,
    pageNumber: args.pageNumber,
    pageSize: args.pageSize,
  };
}
