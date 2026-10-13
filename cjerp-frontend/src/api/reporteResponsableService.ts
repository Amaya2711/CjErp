import httpClient from "./httpClient";
import { buildPlanillaConsultaEstadosRequest, consultarPlanillaEstados } from "./planillaConsultaService";
import type { PlanillaConsultaParametro } from "../models/planillaConsulta";

/**
 * Criterio del store: uno o varios responsables, el número de documento, o el ámbito operativo
 * (cliente, opcionalmente proyecto y site) sin indicar responsable. Son excluyentes.
 */
export type ConsultaPorResponsable =
  | { modo: "responsables"; idResponsables: number[] }
  | { modo: "documento"; nroDocumento: string }
  | { modo: "operativo"; idCliente: number; idProyecto?: number; idSite?: string };

export type RptResponsableRow = {
  tipoRegistro: string;
  observacionVinculacion: string;
  idOc: number | null;
  fila: number | null;
  ot: string;
  idCliente: number | null;
  cliente: string;
  idProyecto: number | null;
  proyecto: string;
  idSite: string;
  site: string;
  correSite: number | null;
  tipoTrabajo: string;
  tipoTrabajoOc: string;
  tipoTrabajoPlanilla: string;
  otOc: string;
  otPlanilla: string;
  filaOc: number | null;
  filaPlanilla: number | null;
  fechaOc: string;
  idResponsableOc: number | null;
  responsableOc: string;
  documentoResponsableOc: string;
  moneda: string;
  cantidad: number | null;
  precioUnitario: number | null;
  subtotalOc: number | null;
  detalleOc: string;
  correlativoPago: number | null;
  /** Planilla.Subtotal del gasto asociado (lo completa el backend; el store no lo entrega). */
  subtotalGasto: number | null;
  monedaGasto: string;
  solicitanteOc: string;
  solicitantePlanilla: string;
  fechaIngresoPlanilla: string;
  /** Planilla.Serie y Planilla.NroOperacion del pago (los completa el backend). */
  seriePago: string;
  nroOperacionPago: string;
  /** Planilla.Detalle del pago (lo completa el backend). */
  detallePago: string;
  /** Planilla.IdSite del pago (lo completa el backend): puede diferir del sitio de la OC. */
  idSitePlanilla: string;
  estadoAprobacionOc: string;
  aprobador1Oc: string;
  aprobador2Oc: string;
  aprobador3Oc: string;
  fechaAprobador1Oc: string;
  fechaAprobador2Oc: string;
  fechaAprobador3Oc: string;
  idResponsablePlanilla: number | null;
  responsablePlanilla: string;
  documentoResponsablePlanilla: string;
  fechaDeposito: string;
  estadoPlanilla: string;
  tieneOc: boolean;
  tienePago: boolean;
};

type RawRow = Record<string, unknown>;

/** El store entrega los alias tal cual; se busca sin distinguir mayúsculas por si el JSON viene en camelCase. */
function buildLookup(row: RawRow) {
  const byLower = new Map<string, unknown>();
  Object.entries(row).forEach(([key, value]) => byLower.set(key.toLowerCase(), value));
  return (name: string) => byLower.get(name.toLowerCase());
}

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim());
const numberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const flag = (value: unknown) => value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";

export function mapRptResponsableRow(raw: RawRow): RptResponsableRow {
  const get = buildLookup(raw);
  return {
    tipoRegistro: text(get("TipoRegistro")),
    observacionVinculacion: text(get("ObservacionVinculacion")),
    idOc: numberOrNull(get("IdOc")),
    fila: numberOrNull(get("Fila")),
    ot: text(get("Ot")),
    idCliente: numberOrNull(get("IdCliente")),
    cliente: text(get("NombreCliente")),
    idProyecto: numberOrNull(get("IdProyecto")),
    proyecto: text(get("NombreProyecto")),
    idSite: text(get("IdSite")),
    site: text(get("NombreSite")),
    correSite: numberOrNull(get("CorreSite")),
    tipoTrabajo: text(get("TipoTrabajo")),
    tipoTrabajoOc: text(get("TipoTrabajoOC")),
    tipoTrabajoPlanilla: text(get("TipoTrabajoPlanilla")),
    otOc: text(get("OtOC")),
    otPlanilla: text(get("OtPlanilla")),
    filaOc: numberOrNull(get("FilaOC")),
    filaPlanilla: numberOrNull(get("FilaPlanilla")),
    fechaOc: text(get("FechaOC")),
    idResponsableOc: numberOrNull(get("IdResponsableOC")),
    responsableOc: text(get("NombreResponsableOC")),
    documentoResponsableOc: text(get("NroDocumentoResponsableOC")),
    moneda: text(get("MonedaOC")),
    cantidad: numberOrNull(get("Cantidad")),
    precioUnitario: numberOrNull(get("PrecioUnitario")),
    subtotalOc: numberOrNull(get("SubtotalOC")),
    detalleOc: text(get("DetalleOC")),
    correlativoPago: numberOrNull(get("CorrelativoPago")),
    subtotalGasto: numberOrNull(get("SubtotalGasto")),
    monedaGasto: text(get("MonedaGasto")),
    solicitanteOc: text(get("SolicitanteOC")),
    solicitantePlanilla: text(get("SolicitantePlanilla")),
    fechaIngresoPlanilla: text(get("FechaIngresoPlanilla")),
    seriePago: text(get("SeriePago")),
    nroOperacionPago: text(get("NroOperacionPago")),
    detallePago: text(get("DetallePago")),
    idSitePlanilla: text(get("IdSitePlanilla")),
    estadoAprobacionOc: text(get("EstadoAprobacionOC")),
    aprobador1Oc: text(get("Aprobador1OC")),
    aprobador2Oc: text(get("Aprobador2OC")),
    aprobador3Oc: text(get("Aprobador3OC")),
    fechaAprobador1Oc: text(get("FechaAprobador1OC")),
    fechaAprobador2Oc: text(get("FechaAprobador2OC")),
    fechaAprobador3Oc: text(get("FechaAprobador3OC")),
    idResponsablePlanilla: numberOrNull(get("IdResponsablePlanilla")),
    responsablePlanilla: text(get("NombreResponsablePlanilla")),
    documentoResponsablePlanilla: text(get("NroDocumentoResponsablePlanilla")),
    fechaDeposito: text(get("FechaDeposito")),
    estadoPlanilla: text(get("EstadoPlanilla")),
    tieneOc: flag(get("TieneOC")),
    tienePago: flag(get("TienePago")),
  };
}

/** Ejecuta `dbo.sp_Planilla_ConsultarPorOT` (consulta "planilla-por-ot" del endpoint de planilla). */
export async function consultarOrdenesPorResponsable(
  criterio: ConsultaPorResponsable,
  options?: { signal?: AbortSignal },
): Promise<RptResponsableRow[]> {
  let parametros: PlanillaConsultaParametro[];
  if (criterio.modo === "responsables") {
    parametros = [{ nombre: "IdResponsables", valor: criterio.idResponsables.join(","), tipo: "string" }];
  } else if (criterio.modo === "documento") {
    parametros = [{ nombre: "NroDocumento", valor: criterio.nroDocumento.trim(), tipo: "string" }];
  } else {
    parametros = [{ nombre: "IdCliente", valor: String(criterio.idCliente), tipo: "int" }];
    if (criterio.idProyecto) parametros.push({ nombre: "IdProyecto", valor: String(criterio.idProyecto), tipo: "int" });
    if (criterio.idSite) parametros.push({ nombre: "IdSite", valor: criterio.idSite, tipo: "string" });
  }

  const request = {
    ...buildPlanillaConsultaEstadosRequest(parametros, { baseParams: { idCargo: null, idEmpleado: null } }),
    consulta: "planilla-por-ot",
  };

  const response = await consultarPlanillaEstados(request, { timeoutMs: 120000, signal: options?.signal });
  return (Array.isArray(response.rows) ? response.rows : []).map(mapRptResponsableRow);
}

/** Redacta el análisis del reporte con la IA configurada en el backend (recibe solo datos agregados). */
export async function generarAnalisisIaResponsable(contexto: string, options?: { signal?: AbortSignal }): Promise<string> {
  const data = await httpClient.post<{ analisis: string }>(
    "/reportes/gerencial/responsable/analisis-ia",
    { contexto },
    { timeout: 120000, signal: options?.signal },
  );
  return data?.analisis ?? "";
}
