import httpClient from "./httpClient";
import type {
  AprobacionResultadoDto,
  AprobacionResumenDto,
  PlanillaAprobacionMasivaRegistroRequest,
  PlanillaAprobacionMasivaRequest,
  PlanillaAprobacionMasivaResponse,
  PlanillaConsultaParametro,
  PlanillaConsultaEstadosRequest,
  PlanillaConsultaEstadosResponse,
  PlanillaRechazoRequest,
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

type PlanillaConsultaEstadosBaseParamOverrides = {
  idCargo?: string | null;
  idEmpleado?: string | null;
};

type PlanillaConsultaEstadosRequestOptions = {
  baseParams?: PlanillaConsultaEstadosBaseParamOverrides;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export function buildPlanillaConsultaEstadosBaseParams(
  overrides: PlanillaConsultaEstadosBaseParamOverrides = {}
): PlanillaConsultaParametro[] {
  const authUser = getAuthUser();
  const jwtPayload = authUser?.token ? parseJwtPayload(authUser.token) : null;
  const idCargo =
    overrides.idCargo !== undefined
      ? overrides.idCargo
      : getFirstPositiveIntegerString(
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
  const idEmpleado =
    overrides.idEmpleado !== undefined
      ? overrides.idEmpleado
      : getFirstPositiveIntegerString(
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

  // No exponer cargo, empleado ni parámetros de consultas en la consola del navegador.

  const baseParams: PlanillaConsultaParametro[] = [];

  if (idCargo) {
    baseParams.push({
      nombre: "IdCargo",
      valor: idCargo,
      tipo: "int",
    });
  }

  if (idEmpleado) {
    baseParams.push({
      nombre: "IdEmpleado",
      valor: idEmpleado,
      tipo: "int",
    });
  }

  return baseParams;
}

export function buildPlanillaConsultaEstadosRequest(
  parametros: PlanillaConsultaParametro[],
  options?: PlanillaConsultaEstadosRequestOptions
): PlanillaConsultaEstadosRequest {
  const merged = [
    ...buildPlanillaConsultaEstadosBaseParams(options?.baseParams),
    ...parametros,
  ];
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

  // No exponer la solicitud ni parámetros de stores en la consola del navegador.

  return request;
}

export async function consultarPlanillaEstados(
  request: PlanillaConsultaEstadosRequest,
  options?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<PlanillaConsultaEstadosResponse> {
  return httpClient.post<PlanillaConsultaEstadosResponse>(PLANILLA_CONSULTA_API_URL, request, {
    timeout: options?.timeoutMs,
    signal: options?.signal,
  });
}

export async function consultarGastosPagadosPorId(
  id: number,
  options?: { timeoutMs?: number }
): Promise<PlanillaConsultaEstadosResponse> {
  return httpClient.get<PlanillaConsultaEstadosResponse>(
    `${PLANILLA_CONSULTA_API_URL}/gastos-pagados/${encodeURIComponent(String(Math.trunc(id)))}`,
    {
      timeout: options?.timeoutMs,
    }
  );
}

export async function actualizarPlanillaNroOperacion(
  correlativo: number,
  nroOperacion: string,
  options?: { timeoutMs?: number }
): Promise<void> {
  await httpClient.put(
    `${PLANILLA_CONSULTA_API_URL}/${encodeURIComponent(String(Math.trunc(correlativo)))}/nro-operacion`,
    { nroOperacion },
    {
      timeout: options?.timeoutMs,
    }
  );
}

export async function actualizarPlanillaTarea(
  id: number,
  idTarea: number,
  options?: { timeoutMs?: number }
): Promise<void> {
  await httpClient.put(
    `${PLANILLA_CONSULTA_API_URL}/${encodeURIComponent(String(Math.trunc(id)))}/tarea`,
    { idTarea: Math.trunc(idTarea) },
    {
      timeout: options?.timeoutMs,
    },
  );
}

export async function aprobarPlanillaMasiva(
  request: PlanillaAprobacionMasivaRequest,
  options?: { timeoutMs?: number }
): Promise<PlanillaAprobacionMasivaResponse> {
  return httpClient.post<PlanillaAprobacionMasivaResponse>(
    `${PLANILLA_CONSULTA_API_URL}/aprobar-masivo`,
    {
      codEstado: Math.trunc(request.codEstado),
      observacion: request.observacion ?? null,
      idRegularizar: Math.trunc(request.idRegularizar),
      registros: request.registros.map((item) => ({
        correlativo: Math.trunc(item.correlativo),
        idSite: item.idSite,
        tipoMoneda: Math.trunc(item.tipoMoneda),
      })),
    },
    {
      timeout: options?.timeoutMs,
    }
  );
}

/** Registros por envío en aprobaciones/observaciones/rechazos masivos (transacciones cortas en el SP). */
export const BLOQUE_APROBACION_MASIVA = 40;

export type AprobacionMasivaPorBloquesResultado = {
  detalle: AprobacionResultadoDto[];
  resumen: AprobacionResumenDto;
  bloquesTotales: number;
  bloquesCompletados: number;
  /** Error del primer bloque que falló; los bloques anteriores ya quedaron aplicados. */
  error: unknown | null;
};

/**
 * Misma operación que `aprobarPlanillaMasiva`, pero enviada en bloques secuenciales (por defecto 40 registros).
 * Cada bloque es una transacción corta en el SP (menos tiempo de bloqueo sobre Planilla). Se detiene en el primer
 * error y devuelve lo ya procesado. Los límites diarios por responsable los recalcula el SP con lo ya aprobado de
 * los bloques previos, por lo que el estado final coincide con el de un único envío.
 */
export async function aprobarPlanillaMasivaPorBloques(
  request: PlanillaAprobacionMasivaRequest,
  options?: {
    timeoutMs?: number;
    tamanoBloque?: number;
    onProgreso?: (bloqueActual: number, bloquesTotales: number) => void;
  },
): Promise<AprobacionMasivaPorBloquesResultado> {
  const tamano = Math.max(1, Math.trunc(options?.tamanoBloque ?? BLOQUE_APROBACION_MASIVA));
  const bloques: PlanillaAprobacionMasivaRegistroRequest[][] = [];
  for (let inicio = 0; inicio < request.registros.length; inicio += tamano) {
    bloques.push(request.registros.slice(inicio, inicio + tamano));
  }

  const resultado: AprobacionMasivaPorBloquesResultado = {
    detalle: [],
    resumen: {
      totalSeleccionados: 0,
      procesados: 0,
      noProcesados: 0,
      enviadosSegundaAprobacion: 0,
      aprobados: 0,
      primeraAprobacion: 0,
      observados: 0,
      rechazados: 0,
    },
    bloquesTotales: bloques.length,
    bloquesCompletados: 0,
    error: null,
  };

  for (let indice = 0; indice < bloques.length; indice += 1) {
    options?.onProgreso?.(indice + 1, bloques.length);
    try {
      // 429 = límite de peticiones del servidor (compartido por todos los usuarios): se rechaza antes de ejecutar
      // el SP, así que reintentar el mismo bloque es seguro. Hasta 3 reintentos con espera creciente.
      let respuesta: PlanillaAprobacionMasivaResponse | undefined;
      for (let intento = 0; ; intento += 1) {
        try {
          respuesta = await aprobarPlanillaMasiva(
            { ...request, registros: bloques[indice] },
            { timeoutMs: options?.timeoutMs },
          );
          break;
        } catch (errorBloque) {
          const status = (errorBloque as { response?: { status?: number } })?.response?.status;
          if (status !== 429 || intento >= 3) throw errorBloque;
          await new Promise((resolve) => setTimeout(resolve, 5000 * (intento + 1)));
        }
      }
      resultado.detalle.push(...(respuesta?.detalle ?? []));
      const parcial = respuesta?.resumen;
      if (parcial) {
        for (const campo of Object.keys(resultado.resumen) as Array<keyof AprobacionResumenDto>) {
          resultado.resumen[campo] += Number(parcial[campo]) || 0;
        }
      }
      resultado.bloquesCompletados += 1;
    } catch (error) {
      resultado.error = error;
      break;
    }
  }

  return resultado;
}

export async function rechazarPlanilla(
  request: PlanillaRechazoRequest,
  options?: { timeoutMs?: number }
): Promise<void> {
  await httpClient.post(
    `${PLANILLA_CONSULTA_API_URL}/${encodeURIComponent(String(Math.trunc(request.correlativo)))}/rechazar`,
    {
      idSite: request.idSite,
      observacion: request.observacion,
      idAprobador: request.idAprobador ?? null,
    },
    {
      timeout: options?.timeoutMs,
    }
  );
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
