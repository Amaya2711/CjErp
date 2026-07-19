import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { Cell, Label, Pie, PieChart, Tooltip } from "recharts";
import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppSectionHeader from "../../../components/base/AppSectionHeader";
import AppStatusMessage from "../../../components/base/AppStatusMessage";
import { FiltroOperativoLookup } from "../../../components/lookups/FiltroOperativoLookup";
import {
  buildPlanillaPagadosDashboardRequest,
  consultarGastosPagadosPorId,
  consultarPlanillaEstados,
} from "../../../api/planillaConsultaService";
import type { FiltroOperativoValue } from "../../../models/filtroOperativo";
import { getHttpErrorMessage } from "../../../utils/httpError";

type RawRow = Record<string, unknown>;

type DrillRow = {
  id: string;
  fechaIngreso: string;
  fechaDeposito: string;
  fechaEmision: string;
  fechaVencimiento: string;
  cliente: string;
  proyecto: string;
  site: string;
  ot: string;
  tarea: string;
  idCliente: number;
  idProyecto: number;
  idSite: string;
  correSite: number;
  idTarea: number;
  tipoPago: string;
  moneda: string;
  monto: number;
  totalPagar: number;
  igv: number;
  subtotal: number;
  responsable: string;
  detalle: string;
  comentario: string;
  cuenta: string;
  cuentaInter: string;
  banco: string;
  nroOperacion: string;
  solicitante: string;
  gestor: string;
  validador: string;
  bien: string;
  comprobante: string;
  serie: string;
  rendicion: string;
  facturaUrl: string;
  facturaPath: string;
  estado: string;
  estadoLabel: string;
  estadoCodigo: number;
  idSuministroProvisional: string;
  usuario: string;
  tipoTrabajo: string;
  siteNombre: string;
  filtroOperativo: string;
  Moneda?: string;
  MonedaLabel?: string;
  Monto?: number;
  Subtotal?: number;
  Total?: number;
  Igv?: number;
  IdRendicion?: string;
  FechaEmision?: string;
  FechaVencimiento?: string;
  FecIngreso?: string;
  Responsable?: string;
  Solicitante?: string;
  Gestor?: string;
  Validador?: string;
  Bien?: string;
  Comprobante?: string;
  Serie?: string;
  FacturaUrl?: string;
  FacturaPath?: string;
  TipoPago?: string;
  TipoPagoLabel?: string;
  TipoTrabajo?: string;
  Ot?: string;
  NombreEstado?: string;
  Estado?: string;
  IdSuministroProvisional?: string;
  FiltroOperativoKey?: string;
};

type ChartDatum = {
  label: string;
  rawLabel: string;
  value: number;
  count: number;
  amountsByCurrency: Record<string, number>;
};

type DrillLevel = "cliente" | "proyecto" | "site" | "tarea";
type DetailSortColumn = "id" | "fecha" | "cliente" | "proyecto" | "site" | "tarea" | "moneda" | "monto" | "montoPen";
type LevelSortColumn = "nivel" | "registros" | "montoPen" | string;

type DrillPath = {
  cliente: string | null;
  proyecto: string | null;
  site: string | null;
};

const PIE_COLORS = [
  "#2563EB",
  "#0EA5E9",
  "#14B8A6",
  "#22C55E",
  "#F59E0B",
  "#F97316",
  "#EF4444",
  "#A855F7",
  "#EC4899",
  "#64748B",
];
const DEFAULT_EXCHANGE_RATES = {
  USD: 3.5,
  DOP: 0.058,
} as const;
const DASHBOARD_REQUEST_TIMEOUT_MS = 120000;
const DASHBOARD_CHUNK_DAYS_THRESHOLD = 45;
const DASHBOARD_CHUNK_CONCURRENCY = 2;
const DETAIL_ROW_HEIGHT = 44;
const DETAIL_OVERSCAN = 8;
const DETAIL_VISIBLE_ROWS = 14;

function normalizeExchangeRateInput(value: string) {
  return value.replace(",", ".").replace(/[^\d.]/g, "");
}

function parseExchangeRateInput(value: string) {
  const parsed = Number(value.replace(",", ".").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function buildLookupSearchText(value?: FiltroOperativoValue) {
  const filtro = value?.filtro;
  const parts = [
    filtro?.nombreCliente,
    filtro?.nombreProyecto,
    filtro?.nombreSite,
    filtro?.nroInterno ? String(filtro.nroInterno) : "",
    value?.tipoTrabajo?.tipoTrabajo,
    value?.ot?.ot,
    value?.tarea?.tarea,
  ].filter(Boolean);

  return parts.join(" ").trim();
}

function hasValidFiltroSelection(value?: FiltroOperativoValue) {
  const filtro = value?.filtro;

  return Boolean(
    filtro &&
      Number(filtro.idCliente) > 0 &&
      Number(filtro.idProyecto) > 0 &&
      String(filtro.idSite ?? "").trim() &&
      Number(filtro.correlativo) > 0
  );
}

function buildPathFromFiltro(value?: FiltroOperativoValue): DrillPath {
  const filtro = value?.filtro;

  if (!filtro) {
    return { cliente: null, proyecto: null, site: null };
  }

  return {
    cliente: filtro.nombreCliente || null,
    proyecto: filtro.nombreProyecto || null,
    site: filtro.nombreSite || null,
  };
}

function getYearStartInputValue() {
  const today = new Date();
  return `${today.getFullYear()}-01-01`;
}

function getMonthEndInputValue() {
  const today = new Date();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
}

function parseInputDateValue(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function formatInputDateValue(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function countDaysBetween(start: Date, end: Date) {
  const startTime = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const endTime = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return Math.floor((endTime - startTime) / 86400000) + 1;
}

function addDays(value: Date, days: number) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);
}

function splitDateRangeIntoMonthChunks(fechaInicio: string, fechaFin: string) {
  const start = parseInputDateValue(fechaInicio);
  const end = parseInputDateValue(fechaFin);

  if (!start || !end || start > end || countDaysBetween(start, end) <= DASHBOARD_CHUNK_DAYS_THRESHOLD) {
    return [{ fechaInicio, fechaFin }];
  }

  const chunks: Array<{ fechaInicio: string; fechaFin: string }> = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());

  while (cursor <= end) {
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const chunkEnd = monthEnd < end ? monthEnd : end;

    chunks.push({
      fechaInicio: formatInputDateValue(cursor),
      fechaFin: formatInputDateValue(chunkEnd),
    });

    cursor = addDays(chunkEnd, 1);
  }

  return chunks;
}

function normalizeText(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const text = String(value).trim();
  if (!text) return 0;

  const direct = Number(text);
  if (Number.isFinite(direct)) return direct;

  const normalized = text.includes(",") && !text.includes(".") ? text.replace(",", ".") : text.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNumberOrZero(value: unknown): number {
  return toNumber(value);
}

function pickString(row: RawRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function pickNumber(row: RawRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    const parsed = toNumber(value);
    if (parsed !== 0 || String(value ?? "").trim() === "0") {
      return parsed;
    }
  }
  return 0;
}

function normalizeMonedaLabel(value: string) {
  const normalized = normalizeText(value);
  if (normalized.includes("USD") || normalized.includes("DOLAR")) return "USD";
  if (normalized.includes("DOP") || normalized.includes("DOMINICAN") || normalized.includes("PESO DOMINICANO") || normalized.includes("RD$")) return "DOP";
  if (normalized.includes("PEN") || normalized.includes("SOLES") || normalized.includes("S/")) return "PEN";
  return value.trim() || "Sin moneda";
}

function formatDisplayDate(value: string) {
  const text = value.trim();
  if (!text || text === "-") return "-";

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
    return text;
  }

  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00` : text;
  const parsed = new Date(isoDate);
  if (Number.isFinite(parsed.getTime())) {
    return parsed.toLocaleDateString("es-PE");
  }

  return text;
}

function formatModalText(value: string) {
  const text = value.trim();
  return text && text !== "-" ? text : "Sin dato";
}

function getDisplayDepositDate(row: DrillRow) {
  return row.fechaDeposito && row.fechaDeposito !== "-" ? row.fechaDeposito : row.fechaIngreso;
}

function parseDisplayDateTime(value: string) {
  const text = value.trim();
  if (!text || text === "-") return Number.NaN;

  const ddmmyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/;
  const ddmm = text.match(ddmmyyyy);
  if (ddmm) {
    const [, day, month, year] = ddmm;
    return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
  }

  const isoMatch = text.match(iso);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
  }

  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : Number.NaN;
}

function buildDrillRow(row: RawRow, preferredId?: string | number): DrillRow {
  const id =
    String(preferredId ?? "").trim() ||
    pickString(row, ["Correlativo", "correlativo", "Corre", "corre", "CorrelativoPlanilla", "Id", "id", "IdPlanilla", "idPlanilla"]);
  const fechaDeposito = formatDisplayDate(
    pickString(row, [
      "FechaDeposito",
      "Fecha Deposito",
      "Fecha Depósito",
      "FechaDepósito",
      "fechadeposito",
      "fechaDeposito",
      "fecha deposito",
      "FechaDepositoTexto",
      "fechaDepositoTexto",
      "FecDeposito",
      "fecDeposito",
      "Fec Deposito",
    ]),
  );
  const fechaIngreso = formatDisplayDate(
    pickString(row, [
      "FecIngreso",
      "fecIngreso",
      "FecIngresoTexto",
      "fecIngresoTexto",
      "FechaIngreso",
      "fechaIngreso",
    ]),
  );
  const fechaEmision = formatDisplayDate(
    pickString(row, [
      "FechaEmision",
      "fechaEmision",
      "FecEmision",
      "fecEmision",
      "FecIngreso",
      "fecIngreso",
      "FechaIngreso",
      "fechaIngreso",
    ]),
  );
  const fechaVencimiento = formatDisplayDate(
    pickString(row, [
      "FechaVencimiento",
      "fechaVencimiento",
      "FechaDeposito",
      "fechadeposito",
      "fechaDeposito",
    ]),
  );
  const cliente = pickString(row, ["Cliente", "cliente", "NombreCliente", "nombreCliente", "clienteNombre"]) || "Sin cliente";
  const proyecto = pickString(row, ["Proyecto", "proyecto", "NombreProyecto", "nombreProyecto"]) || "Sin proyecto";
  const site = pickString(row, ["Site", "site", "NombreSite", "nombreSite", "siteNombre"]) || "Sin site";
  const ot = pickString(row, ["OT", "Ot", "ot", "NroOt", "nroOt", "NumeroOT", "numeroOT"]);
  const tarea = pickString(row, ["Tarea", "tarea", "NombreTarea", "nombreTarea", "TipoTrabajo", "tipoTrabajo", "Trabajo", "trabajo", "TrabajoLabel", "trabajoLabel"]) || "Sin tarea";
  const tipoPago = pickString(row, ["TipoPago", "tipoPago", "IdTipoPago", "idTipoPago", "TipoPagoLabel", "tipoPagoLabel"]);
  const responsable = pickString(row, ["Responsable", "responsable", "ResponsableLabel", "responsableLabel", "NomResponsable", "nomResponsable", "NombreResponsable", "nombreResponsable", "ResponsableNombre", "responsableNombre"]);
  const detalle = pickString(row, ["Detalle", "detalle", "DetallePlanilla", "detallePlanilla"]);
  const comentario = pickString(row, ["Comentario", "comentario", "Observacion", "observacion"]);
  const cuenta = pickString(row, ["Cuenta", "cuenta", "CuentaNumero", "cuentaNumero", "NumeroCuenta", "numeroCuenta", "NroCuenta", "nroCuenta"]);
  const cuentaInter = pickString(row, ["CuentaInter", "cuentaInter", "CuentaInterPlanilla", "cuentaInterPlanilla", "CuentaInterNumero", "cuentaInterNumero"]);
  const banco = pickString(row, ["Banco", "banco", "NombreBanco", "nombreBanco", "BancoNombre", "bancoNombre"]);
  const nroOperacion = pickString(row, ["NroOperacion", "nroOperacion", "NumeroOperacion", "numeroOperacion", "Operacion", "operacion"]);
  const solicitante = pickString(row, ["Solicitante", "solicitante", "SolicitanteLabel", "solicitanteLabel", "NombreSolicitante", "nombreSolicitante"]);
  const gestor = pickString(row, ["Gestor", "gEstor", "gestor", "GestorLabel", "gestorLabel", "NombreGestor", "nombreGestor"]);
  const validador = pickString(row, ["Validador", "validador", "ValidadorLabel", "validadorLabel", "NombreValidador", "nombreValidador"]);
  const bien = pickString(row, ["Bien", "bien", "BienLabel", "bienLabel"]);
  const comprobante = pickString(row, ["Comprobante", "comprobante", "ComprobanteLabel", "comprobanteLabel"]);
  const serie = pickString(row, ["Serie", "serie", "SerieDocumento", "serieDocumento"]);
  const rendicion = pickString(row, ["IdRendicion", "idRendicion", "Rendicion", "rendicion"]);
  const facturaUrl = pickString(row, ["RutaFacturaUrl", "rutaFacturaUrl", "FacturaUrl", "facturaUrl", "imgFactura"]);
  const facturaPath = pickString(row, ["RutaFacturaEnviada", "rutaFacturaEnviada", "RutaFacturaOriginal", "rutaFacturaOriginal", "FacturaPath", "facturaPath"]);
  const estadoCodigo = pickNumber(row, ["Estado", "estado"]);
  const estado = estadoCodigo ? String(estadoCodigo) : pickString(row, ["Estado", "estado"]);
  const estadoLabel = pickString(row, ["NombreEstado", "nombreEstado", "EstadoLabel", "estadoLabel", "EstadoNombre", "estadoNombre"]);
  const idSuministroProvisional = pickString(
    row,
    [
      "idprovisional",
      "IdSuministroProvisional",
      "idSuministroProvisional",
      "IdSuministro",
      "idSuministro",
      "SuministroVigente",
      "suministroVigente",
      "Suministro",
      "suministro",
      "NroSuministro",
      "nroSuministro",
      "NumeroSuministro",
      "numeroSuministro",
    ],
  );
  const usuario = pickString(row, ["Usuario", "usuario"]);
  const tipoTrabajo = pickString(row, ["Tipo_Trabajo", "TipoTrabajo", "tipoTrabajo", "Trabajo", "trabajo", "TrabajoLabel", "trabajoLabel"]);
  const siteNombre = pickString(row, ["Site", "SiteNombre", "siteNombre"]);
  const filtroOperativo = [cliente, proyecto, siteNombre || site, tipoTrabajo, tarea].filter(Boolean).join(" - ");
  const moneda = normalizeMonedaLabel(
    pickString(row, ["Moneda", "moneda", "MonedaLabel", "monedaLabel", "TipoMoneda", "tipoMoneda", "MonedaDescripcion", "monedaDescripcion"]),
  );
  const subtotal = pickNumber(row, ["Subtotal", "subtotal"]);
  const igv = pickNumber(row, ["IGV", "Igv", "igv"]);
  const total = pickNumber(row, ["Total", "total", "Monto", "monto"]);
  const totalPagar = pickNumber(row, ["TotalPagar", "totalPagar"]);
  const subtotalSolesValue = row.SubtotalSoles ?? row.subtotalSoles;
  const subtotalSoles = subtotalSolesValue == null || subtotalSolesValue === "" ? null : toNumber(subtotalSolesValue);
  const monto = subtotal || total || subtotalSoles || 0;

  return {
    id: id || "-",
    fechaDeposito: fechaDeposito || "-",
    fechaIngreso: fechaIngreso || "-",
    fechaEmision: fechaEmision || "-",
    fechaVencimiento: fechaVencimiento || "-",
    cliente,
    proyecto,
    site,
    ot: ot || "-",
    tarea,
    idCliente: toNumber(row.IdCliente ?? row.idCliente),
    idProyecto: toNumber(row.IdProyecto ?? row.idProyecto),
    idSite: String(row.IdSite ?? row.idSite ?? "").trim(),
    correSite: toNumber(row.CorSite ?? row.corSite ?? row.CorreSite ?? row.correSite),
    idTarea: toNumber(row.IdTarea ?? row.idTarea),
    tipoPago: tipoPago || "-",
    moneda,
    monto,
    totalPagar: totalPagar || 0,
    igv,
    subtotal: subtotal || 0,
    responsable: responsable || "-",
    detalle: detalle || "-",
    comentario: comentario || "-",
    cuenta: cuenta || "-",
    cuentaInter: cuentaInter || "-",
    banco: banco || "-",
    nroOperacion: nroOperacion || "-",
    solicitante: solicitante || "-",
    gestor: gestor || "-",
    validador: validador || "-",
    bien: bien || "-",
    comprobante: comprobante || "-",
    serie: serie || "-",
    rendicion: rendicion || "-",
    facturaUrl: facturaUrl || "-",
    facturaPath: facturaPath || "-",
    estado: estado || "-",
    estadoLabel: estadoLabel || "-",
    estadoCodigo,
    idSuministroProvisional: idSuministroProvisional || "-",
    usuario: usuario || "-",
    tipoTrabajo: tipoTrabajo || "-",
    siteNombre: siteNombre || site,
    filtroOperativo: filtroOperativo || "-",
    Moneda: moneda,
    MonedaLabel: moneda,
    Monto: monto,
    Subtotal: subtotal || 0,
    Total: total,
    Igv: igv,
    IdRendicion: rendicion,
    FechaEmision: fechaEmision || "-",
    FechaVencimiento: fechaVencimiento || "-",
    FecIngreso: fechaIngreso || "-",
    Responsable: responsable || "-",
    Solicitante: solicitante || "-",
    Gestor: gestor || "-",
    Validador: validador || "-",
    Bien: bien || "-",
    Comprobante: comprobante || "-",
    Serie: serie || "-",
    FacturaUrl: facturaUrl || "-",
    FacturaPath: facturaPath || "-",
    TipoPago: tipoPago || "-",
    TipoPagoLabel: tipoPago || "-",
    TipoTrabajo: tipoTrabajo || "-",
    Ot: ot || "-",
    NombreEstado: estadoLabel || "-",
    Estado: estado || "-",
    IdSuministroProvisional: idSuministroProvisional || "-",
    FiltroOperativoKey: filtroOperativo || "-",
  };
}

function buildBreakdown(rows: DrillRow[], key: DrillLevel, usdExchangeRate: number, dopExchangeRate: number): ChartDatum[] {
  const map = new Map<string, ChartDatum>();

  for (const row of rows) {
    const rawLabel = row[key] || `Sin ${key}`;
    const currency = row.moneda || "Sin moneda";
    const penAmount = convertToPen(row.monto, currency, usdExchangeRate, dopExchangeRate);
    const current = map.get(rawLabel);
    if (current) {
      current.value += penAmount;
      current.count += 1;
      current.amountsByCurrency[currency] = (current.amountsByCurrency[currency] ?? 0) + row.monto;
      continue;
    }

    map.set(rawLabel, {
      label: rawLabel,
      rawLabel,
      value: penAmount,
      count: 1,
      amountsByCurrency: {
        [currency]: row.monto,
      },
    });
  }

  return Array.from(map.values()).sort((a, b) => b.value - a.value);
}

function formatCurrency(value: number, currency = "PEN") {
  const normalizedCurrency = currency === "USD" || currency === "DOP" || currency === "PEN" ? currency : "PEN";
  const localeByCurrency: Record<string, string> = {
    PEN: "es-PE",
    USD: "en-US",
    DOP: "es-DO",
  };
  return new Intl.NumberFormat(localeByCurrency[normalizedCurrency] ?? "es-PE", {
    style: "currency",
    currency: normalizedCurrency,
    currencyDisplay: "symbol",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCompactSoles(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) {
    return `S/ ${(value / 1_000_000).toFixed(1)} M`;
  }
  if (absolute >= 1_000) {
    return `S/ ${(value / 1_000).toFixed(1)} K`;
  }
  return formatCurrency(value, "PEN");
}

function formatPercentage(value: number) {
  return `${value.toFixed(1)}%`;
}

function getCurrencyShare(total: number, totalConvertedToPen: number, usdExchangeRate: number, dopExchangeRate: number, currency: string) {
  if (totalConvertedToPen <= 0) {
    return "0.0%";
  }

  const converted = convertToPen(total, currency, usdExchangeRate, dopExchangeRate);
  return formatPercentage((converted / totalConvertedToPen) * 100);
}

function convertToPen(value: number, currency: string, usdExchangeRate: number, dopExchangeRate: number) {
  if (currency === "USD") return value * usdExchangeRate;
  if (currency === "DOP") return value * dopExchangeRate;
  return value;
}

function formatExchangeRate(value: number) {
  return new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: value < 1 ? 3 : 1,
    maximumFractionDigits: value < 1 ? 3 : 1,
  }).format(value);
}

function getCurrentLevel(path: DrillPath): DrillLevel {
  if (!path.cliente) return "cliente";
  if (!path.proyecto) return "proyecto";
  if (!path.site) return "site";
  return "tarea";
}

function getLevelTitle(level: DrillLevel, path: DrillPath) {
  switch (level) {
    case "cliente":
      return "Gastos por cliente";
    case "proyecto":
      return `Proyectos de ${path.cliente}`;
    case "site":
      return `Sites de ${path.proyecto}`;
    case "tarea":
      return `Tareas de ${path.site}`;
    default:
      return "Dashboard";
  }
}

function getLevelDescription(level: DrillLevel) {
  switch (level) {
    case "cliente":
      return "Selecciona un cliente para ver el siguiente nivel.";
    case "proyecto":
      return "Haz clic en un proyecto para desglosar sus sites.";
    case "site":
      return "Haz clic en un site para revisar sus tareas.";
    case "tarea":
      return "Detalle final por tarea dentro del site seleccionado.";
    default:
      return "";
  }
}

function getNextPath(level: DrillLevel, path: DrillPath, label: string): DrillPath {
  if (level === "cliente") {
    return { cliente: label, proyecto: null, site: null };
  }
  if (level === "proyecto") {
    return { cliente: path.cliente, proyecto: label, site: null };
  }
  if (level === "site") {
    return { cliente: path.cliente, proyecto: path.proyecto, site: label };
  }
  return path;
}

type DashboardFetchArgs = {
  fechaInicio: string;
  fechaFin: string;
  textoBusqueda: string;
  idCliente?: number;
  idProyecto?: number;
  idSite?: string;
  correlativo?: number;
};

type DashboardFetchResult = {
  rows: RawRow[];
  totalRows: number;
  limitExceeded: boolean;
  message?: string | null;
};

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

async function fetchDashboardRows(args: DashboardFetchArgs): Promise<DashboardFetchResult> {
  const chunks = splitDateRangeIntoMonthChunks(args.fechaInicio, args.fechaFin);
  const responses = await mapWithConcurrency(chunks, DASHBOARD_CHUNK_CONCURRENCY, async (chunk) =>
    consultarPlanillaEstados(
      buildPlanillaPagadosDashboardRequest({
        ...args,
        fechaInicio: chunk.fechaInicio,
        fechaFin: chunk.fechaFin,
      }),
      { timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS },
    ),
  );

  const limitExceededResponse = responses.find((response) => response.limitExceeded);
  const rows = responses.flatMap((response) => (Array.isArray(response.rows) ? response.rows : []));
  const totalRows = responses.reduce((sum, response) => {
    const responseRows = Array.isArray(response.rows) ? response.rows.length : 0;
    return sum + (response.totalRows ?? responseRows);
  }, 0);

  return {
    rows,
    totalRows,
    limitExceeded: Boolean(limitExceededResponse),
    message: limitExceededResponse?.message,
  };
}

export default function Dashboard1Page() {
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draftFechaInicio, setDraftFechaInicio] = useState(getYearStartInputValue());
  const [draftFechaFin, setDraftFechaFin] = useState(getMonthEndInputValue());
  const [draftLookupValue, setDraftLookupValue] = useState<FiltroOperativoValue>({});
  const [draftUsdExchangeRate, setDraftUsdExchangeRate] = useState(String(DEFAULT_EXCHANGE_RATES.USD));
  const [draftDopExchangeRate, setDraftDopExchangeRate] = useState(String(DEFAULT_EXCHANGE_RATES.DOP));
  const [appliedFechaInicio, setAppliedFechaInicio] = useState(getYearStartInputValue());
  const [appliedFechaFin, setAppliedFechaFin] = useState(getMonthEndInputValue());
  const [appliedSearchText, setAppliedSearchText] = useState("");
  const [appliedUsdExchangeRate, setAppliedUsdExchangeRate] = useState<number>(DEFAULT_EXCHANGE_RATES.USD);
  const [appliedDopExchangeRate, setAppliedDopExchangeRate] = useState<number>(DEFAULT_EXCHANGE_RATES.DOP);
  const [path, setPath] = useState<DrillPath>({ cliente: null, proyecto: null, site: null });
  const [totalRows, setTotalRows] = useState(0);
  const [detailSortColumn, setDetailSortColumn] = useState<DetailSortColumn>("montoPen");
  const [detailSortDirection, setDetailSortDirection] = useState<"asc" | "desc">("desc");
  const [levelSortColumn, setLevelSortColumn] = useState<LevelSortColumn>("montoPen");
  const [levelSortDirection, setLevelSortDirection] = useState<"asc" | "desc">("desc");
  const [selectedGastoRow, setSelectedGastoRow] = useState<DrillRow | null>(null);
  const [selectedGastoDetailLoading, setSelectedGastoDetailLoading] = useState(false);
  const [selectedGastoDetailError, setSelectedGastoDetailError] = useState("");
  const [isLevelDetailExpanded, setIsLevelDetailExpanded] = useState(false);
  const [recordsExpanded, setRecordsExpanded] = useState(false);
  const [detailScrollTop, setDetailScrollTop] = useState(0);
  const pieWrapRef = useRef<HTMLDivElement | null>(null);
  const [pieSize, setPieSize] = useState({ width: 280, height: 288 });
  const isMountedRef = useRef(true);
  const selectedGastoDetailRequestRef = useRef(0);

  const loadRows = async (params?: {
    fechaInicio?: string;
    fechaFin?: string;
    lookupValue?: FiltroOperativoValue;
    path?: DrillPath;
    ignoreCodigoFilters?: boolean;
  }) => {
    const fechaInicio = params?.fechaInicio ?? draftFechaInicio;
    const fechaFin = params?.fechaFin ?? draftFechaFin;
    const lookupValue = params?.lookupValue ?? draftLookupValue;
    const filtroSeleccionado = lookupValue?.filtro;
    const useCodigoFilters = !params?.ignoreCodigoFilters && hasValidFiltroSelection(lookupValue);
    const searchText = useCodigoFilters ? "" : buildLookupSearchText(lookupValue);
    const nextPath = params?.path ?? { cliente: null, proyecto: null, site: null };

    setLoading(true);
    setError("");

    try {
      const response = await fetchDashboardRows({
        fechaInicio,
        fechaFin,
        textoBusqueda: searchText,
        idCliente: useCodigoFilters ? filtroSeleccionado?.idCliente : undefined,
        idProyecto: useCodigoFilters ? filtroSeleccionado?.idProyecto : undefined,
        idSite: useCodigoFilters ? filtroSeleccionado?.idSite : undefined,
        correlativo: useCodigoFilters ? filtroSeleccionado?.correlativo : undefined,
      });
      const detailRows = response.rows;

      if (useCodigoFilters && detailRows.length === 0 && !params?.ignoreCodigoFilters) {
        await loadRows({
          fechaInicio,
          fechaFin,
          lookupValue,
          path: nextPath,
          ignoreCodigoFilters: true,
        });
        return;
      }

      if (!isMountedRef.current) return;

      if (response.limitExceeded) {
        setRawRows([]);
        setError(response.message?.trim() || "La consulta excedio el maximo permitido para el dashboard.");
        return;
      }

      setAppliedFechaInicio(fechaInicio);
      setAppliedFechaFin(fechaFin);
      setAppliedSearchText(searchText);
      setPath(nextPath);
      setLevelSortColumn("montoPen");
      setLevelSortDirection("desc");
      setRawRows(detailRows);
      setTotalRows(response.totalRows ?? detailRows.length);
    } catch (err) {
      if (!isMountedRef.current) return;
      setRawRows([]);
      setTotalRows(0);
      setError(getHttpErrorMessage(err, "No se pudo cargar el dashboard desde sp_Planilla_ConsultarPagados_Dsh."));
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    void loadRows({
      fechaInicio: getYearStartInputValue(),
      fechaFin: getMonthEndInputValue(),
      lookupValue: {},
    });

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const container = pieWrapRef.current;
    if (!container || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateSize = () => {
      const { width, height } = container.getBoundingClientRect();
      setPieSize({
        width: Math.max(0, Math.floor(width)),
        height: Math.max(0, Math.floor(height)),
      });
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  const rows = useMemo(() => rawRows.map((row) => buildDrillRow(row)), [rawRows]);
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (path.cliente && row.cliente !== path.cliente) return false;
      if (path.proyecto && row.proyecto !== path.proyecto) return false;
      if (path.site && row.site !== path.site) return false;
      return true;
    });
  }, [path, rows]);

  const currentLevel = getCurrentLevel(path);
  const chartData = useMemo(
    () => buildBreakdown(filteredRows, currentLevel, appliedUsdExchangeRate, appliedDopExchangeRate),
    [appliedDopExchangeRate, appliedUsdExchangeRate, currentLevel, filteredRows],
  );
  const chartTotal = useMemo(() => chartData.reduce((accumulator, item) => accumulator + item.value, 0), [chartData]);
  const visibleCurrencies = useMemo(() => {
    const set = new Set<string>();
    for (const row of filteredRows) {
      set.add(row.moneda || "Sin moneda");
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [filteredRows]);
  const orderedVisibleCurrencies = useMemo(() => {
    const preferredOrder = ["PEN", "USD", "DOP"];
    const preferred = preferredOrder.filter((currency) => visibleCurrencies.includes(currency));
    const remaining = visibleCurrencies.filter((currency) => !preferredOrder.includes(currency));
    return [...preferred, ...remaining];
  }, [visibleCurrencies]);
  const totalsByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of filteredRows) {
      map.set(row.moneda, (map.get(row.moneda) ?? 0) + row.monto);
    }
    return Array.from(map.entries())
      .map(([currency, total]) => ({ currency, total }))
      .sort((a, b) => a.currency.localeCompare(b.currency));
  }, [filteredRows]);
  const currencyTotalsMap = useMemo(() => {
    return new Map(totalsByCurrency.map(({ currency, total }) => [currency, total]));
  }, [totalsByCurrency]);
  const totalConvertedToPen = useMemo(() => {
    return totalsByCurrency.reduce((accumulator, item) => {
      return accumulator + convertToPen(item.total, item.currency, appliedUsdExchangeRate, appliedDopExchangeRate);
    }, 0);
  }, [appliedDopExchangeRate, appliedUsdExchangeRate, totalsByCurrency]);
  const totalPen = currencyTotalsMap.get("PEN") ?? 0;
  const totalUsd = currencyTotalsMap.get("USD") ?? 0;
  const totalDop = currencyTotalsMap.get("DOP") ?? 0;
  const sortedChartData = useMemo(() => {
    const items = [...chartData];
    const direction = levelSortDirection === "asc" ? 1 : -1;

    const compareValues = (left: string | number, right: string | number) => {
      if (typeof left === "number" && typeof right === "number") {
        return (left - right) * direction;
      }

      return String(left).localeCompare(String(right), "es-PE", { numeric: true, sensitivity: "base" }) * direction;
    };

    items.sort((left, right) => {
      if (levelSortColumn === "nivel") return compareValues(left.label, right.label);
      if (levelSortColumn === "registros") return compareValues(left.count, right.count);
      if (levelSortColumn === "montoPen") {
        const leftPen = Object.entries(left.amountsByCurrency).reduce(
          (accumulator, [currency, amount]) => accumulator + convertToPen(amount, currency, appliedUsdExchangeRate, appliedDopExchangeRate),
          0,
        );
        const rightPen = Object.entries(right.amountsByCurrency).reduce(
          (accumulator, [currency, amount]) => accumulator + convertToPen(amount, currency, appliedUsdExchangeRate, appliedDopExchangeRate),
          0,
        );
        return compareValues(leftPen, rightPen);
      }

      const leftAmount = left.amountsByCurrency[levelSortColumn] ?? 0;
      const rightAmount = right.amountsByCurrency[levelSortColumn] ?? 0;
      return compareValues(leftAmount, rightAmount);
    });

    return items;
  }, [appliedDopExchangeRate, appliedUsdExchangeRate, chartData, levelSortColumn, levelSortDirection]);

  const handleLevelSortClick = (column: LevelSortColumn) => {
    if (levelSortColumn === column) {
      setLevelSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setLevelSortColumn(column);
    setLevelSortDirection("asc");
  };
  const sortedRows = useMemo(() => {
    const rowsToSort = [...filteredRows];
    const direction = detailSortDirection === "asc" ? 1 : -1;

    rowsToSort.sort((left, right) => {
      const leftValue = (() => {
        switch (detailSortColumn) {
          case "id":
            return Number.isFinite(Number(left.id)) ? Number(left.id) : left.id;
          case "fecha":
            return parseDisplayDateTime(getDisplayDepositDate(left));
          case "cliente":
            return left.cliente;
          case "proyecto":
            return left.proyecto;
          case "site":
            return left.site;
          case "tarea":
            return left.tarea;
          case "moneda":
            return left.moneda;
          case "monto":
            return left.monto;
          case "montoPen":
            return convertToPen(left.monto, left.moneda, appliedUsdExchangeRate, appliedDopExchangeRate);
          default:
            return left.id;
        }
      })();

      const rightValue = (() => {
        switch (detailSortColumn) {
          case "id":
            return Number.isFinite(Number(right.id)) ? Number(right.id) : right.id;
          case "fecha":
            return parseDisplayDateTime(getDisplayDepositDate(right));
          case "cliente":
            return right.cliente;
          case "proyecto":
            return right.proyecto;
          case "site":
            return right.site;
          case "tarea":
            return right.tarea;
          case "moneda":
            return right.moneda;
          case "monto":
            return right.monto;
          case "montoPen":
            return convertToPen(right.monto, right.moneda, appliedUsdExchangeRate, appliedDopExchangeRate);
          default:
            return right.id;
        }
      })();

      if (typeof leftValue === "number" && typeof rightValue === "number") {
        const leftNaN = Number.isNaN(leftValue);
        const rightNaN = Number.isNaN(rightValue);
        if (leftNaN && rightNaN) return 0;
        if (leftNaN) return 1;
        if (rightNaN) return -1;
        return (leftValue - rightValue) * direction;
      }

      return String(leftValue).localeCompare(String(rightValue), "es-PE", { numeric: true, sensitivity: "base" }) * direction;
    });

    return rowsToSort;
  }, [appliedDopExchangeRate, appliedUsdExchangeRate, detailSortColumn, detailSortDirection, filteredRows]);
  const detailWindow = useMemo(() => {
    if (!recordsExpanded) {
      return {
        startIndex: 0,
        endIndex: 0,
        topSpacer: 0,
        bottomSpacer: 0,
        visibleRows: [] as DrillRow[],
      };
    }

    const totalRowsCount = sortedRows.length;
    const startIndex = Math.max(0, Math.floor(detailScrollTop / DETAIL_ROW_HEIGHT) - DETAIL_OVERSCAN);
    const visibleCount = DETAIL_VISIBLE_ROWS + DETAIL_OVERSCAN * 2;
    const endIndex = Math.min(totalRowsCount, startIndex + visibleCount);

    return {
      startIndex,
      endIndex,
      topSpacer: startIndex * DETAIL_ROW_HEIGHT,
      bottomSpacer: Math.max(0, (totalRowsCount - endIndex) * DETAIL_ROW_HEIGHT),
      visibleRows: sortedRows.slice(startIndex, endIndex),
    };
  }, [detailScrollTop, recordsExpanded, sortedRows]);

  const handleDetailSortClick = (column: DetailSortColumn) => {
    if (detailSortColumn === column) {
      setDetailSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setDetailSortColumn(column);
    setDetailSortDirection(column === "fecha" || column === "monto" || column === "montoPen" ? "desc" : "asc");
  };

  useEffect(() => {
    setDetailScrollTop(0);
  }, [detailSortColumn, detailSortDirection, filteredRows.length, recordsExpanded]);

  const handleApplyFilters = async () => {
    const usdExchangeRate = parseExchangeRateInput(draftUsdExchangeRate);
    const dopExchangeRate = parseExchangeRateInput(draftDopExchangeRate);
    const useCodigoFilters = hasValidFiltroSelection(draftLookupValue);

    if (usdExchangeRate == null || dopExchangeRate == null) {
      setError("Ingrese tipos de cambio validos y mayores que cero para USD y DOP.");
      return;
    }

    setAppliedUsdExchangeRate(usdExchangeRate);
    setAppliedDopExchangeRate(dopExchangeRate);

    await loadRows({
      fechaInicio: draftFechaInicio,
      fechaFin: draftFechaFin,
      lookupValue: draftLookupValue,
      path: useCodigoFilters ? buildPathFromFiltro(draftLookupValue) : { cliente: null, proyecto: null, site: null },
    });
  };

  const handleChartClick = (datum: ChartDatum) => {
    if (currentLevel === "tarea") return;
    setPath((prev) => getNextPath(currentLevel, prev, datum.rawLabel));
  };

  const handleOpenLevelDetail = () => {
    setIsLevelDetailExpanded(true);
  };

  const handleCloseLevelDetail = () => {
    setIsLevelDetailExpanded(false);
  };

  const handleBreadcrumbReset = (level: "all" | "cliente" | "proyecto") => {
    if (level === "all") {
      setPath({ cliente: null, proyecto: null, site: null });
      return;
    }

    if (level === "cliente") {
      setPath((prev) => ({ cliente: prev.cliente, proyecto: null, site: null }));
      return;
    }

    setPath((prev) => ({ cliente: prev.cliente, proyecto: prev.proyecto, site: null }));
  };

  const handleExportVisibleToExcel = async () => {
    if (sortedRows.length === 0) return;
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const exportRows = sortedRows.map((row) => ({
      Id: row.id,
      Fecha: getDisplayDepositDate(row),
      Cliente: row.cliente,
      Proyecto: row.proyecto,
      Site: row.site,
      Tarea: row.tarea,
      Moneda: row.moneda,
      Monto: row.monto,
      "Monto en PEN": convertToPen(row.monto, row.moneda, appliedUsdExchangeRate, appliedDopExchangeRate),
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Seleccionados");
    XLSX.writeFile(workbook, `registros_detalle_${appliedFechaInicio}_${appliedFechaFin}.xlsx`);
  };

  const handleOpenRowDetails = (row: DrillRow) => {
    setSelectedGastoRow(row);
    setSelectedGastoDetailError("");
    setSelectedGastoDetailLoading(true);

    const requestId = ++selectedGastoDetailRequestRef.current;
    const selectedId = Number.parseInt(String(row.id).trim(), 10);

    void (async () => {
      try {
        if (!Number.isFinite(selectedId) || selectedId <= 0) {
          throw new Error("El ID seleccionado no es válido.");
        }

        const response = await consultarGastosPagadosPorId(selectedId, { timeoutMs: 120000 });

        if (selectedGastoDetailRequestRef.current !== requestId) {
          return;
        }

        const detailRows = Array.isArray(response.rows) ? response.rows : [];
        if (detailRows.length > 0) {
          setSelectedGastoRow(buildDrillRow(detailRows[0], selectedId));
        }
      } catch (error) {
        if (selectedGastoDetailRequestRef.current !== requestId) {
          return;
        }

        setSelectedGastoDetailError(getHttpErrorMessage(error, "No se pudo cargar el detalle completo del registro."));
      } finally {
        if (selectedGastoDetailRequestRef.current === requestId) {
          setSelectedGastoDetailLoading(false);
        }
      }
    })();
  };

  const handleCloseRowDetails = () => {
    selectedGastoDetailRequestRef.current += 1;
    setSelectedGastoRow(null);
    setSelectedGastoDetailLoading(false);
    setSelectedGastoDetailError("");
  };

  const selectedGastoConvertedPen = selectedGastoRow
    ? convertToPen(selectedGastoRow.monto, selectedGastoRow.moneda, appliedUsdExchangeRate, appliedDopExchangeRate)
    : 0;

  return (
    <AppPage title="" style={{ padding: 12 }} fillHeight>
      <div style={styles.page}>
        <div style={styles.mainContent}>
          <AppCard style={styles.compactCard}>
          <div style={styles.filtersRow}>
            <div style={styles.filterField}>
              <label style={styles.label}>Fecha inicio</label>
              <input type="date" value={draftFechaInicio} onChange={(event) => setDraftFechaInicio(event.target.value)} style={styles.input} />
            </div>
            <div style={styles.filterField}>
              <label style={styles.label}>Fecha fin</label>
              <input type="date" value={draftFechaFin} onChange={(event) => setDraftFechaFin(event.target.value)} style={styles.input} />
            </div>
            <div style={{ ...styles.filterField, flex: 1.5, minWidth: 320 }}>
              <label style={styles.label}>Búsqueda</label>
              <FiltroOperativoLookup
                value={draftLookupValue}
                onChange={setDraftLookupValue}
                showTrabajo={false}
                showOt={false}
                showTarea={false}
              />
            </div>
            <div style={styles.exchangeRateField}>
              <label style={styles.label}>Tipo cambio USD</label>
              <input
                type="text"
                inputMode="decimal"
                value={draftUsdExchangeRate}
                onChange={(event) => setDraftUsdExchangeRate(normalizeExchangeRateInput(event.target.value))}
                style={styles.input}
              />
            </div>
            <div style={styles.exchangeRateField}>
              <label style={styles.label}>Tipo cambio DOP</label>
              <input
                type="text"
                inputMode="decimal"
                value={draftDopExchangeRate}
                onChange={(event) => setDraftDopExchangeRate(normalizeExchangeRateInput(event.target.value))}
                style={styles.input}
              />
            </div>
            <div style={styles.actionsWrap}>
              <button type="button" style={styles.primaryButton} onClick={() => void handleApplyFilters()} disabled={loading}>
                Actualizar
              </button>
            </div>
          </div>
          </AppCard>

        {error ? <AppStatusMessage tone="error">{error}</AppStatusMessage> : null}

        <div style={styles.metricGrid}>
          <MetricCard label="Total convertido PEN" value={formatCurrency(totalConvertedToPen, "PEN")} accent />
          <MetricCard
            label="Total PEN"
            value={formatCurrency(totalPen, "PEN")}
            subValue={getCurrencyShare(totalPen, totalConvertedToPen, appliedUsdExchangeRate, appliedDopExchangeRate, "PEN")}
          />
          <MetricCard
            label="Total USD"
            value={formatCurrency(totalUsd, "USD")}
            subValue={getCurrencyShare(totalUsd, totalConvertedToPen, appliedUsdExchangeRate, appliedDopExchangeRate, "USD")}
          />
          <MetricCard
            label="Total DOP"
            value={formatCurrency(totalDop, "DOP")}
            subValue={getCurrencyShare(totalDop, totalConvertedToPen, appliedUsdExchangeRate, appliedDopExchangeRate, "DOP")}
          />
          <MetricCard label="Periodo aplicado" value={`${appliedFechaInicio} al ${appliedFechaFin}`} period />
        </div>

        <AppCard style={styles.mainCard}>
          <AppSectionHeader title={getLevelTitle(currentLevel, path)} description={getLevelDescription(currentLevel)} />

          <div style={styles.breadcrumbHeaderRow}>
            <div style={styles.breadcrumbRow}>
              <button type="button" style={path.cliente ? styles.breadcrumbButton : styles.breadcrumbButtonActive} onClick={() => handleBreadcrumbReset("all")}>
                Clientes
              </button>
              {path.cliente ? (
                <button type="button" style={path.proyecto ? styles.breadcrumbButton : styles.breadcrumbButtonActive} onClick={() => handleBreadcrumbReset("cliente")}>
                  {path.cliente}
                </button>
              ) : null}
              {path.proyecto ? (
                <button type="button" style={path.site ? styles.breadcrumbButton : styles.breadcrumbButtonActive} onClick={() => handleBreadcrumbReset("proyecto")}>
                  {path.proyecto}
                </button>
              ) : null}
              {path.site ? <span style={styles.breadcrumbFinal}>{path.site}</span> : null}
            </div>
            <button type="button" style={styles.expandSectionButton} onClick={handleOpenLevelDetail}>
              Ampliar
            </button>
          </div>

          {loading ? (
            <div style={styles.loadingBox}>Cargando informaciÃ³n del store...</div>
          ) : chartData.length === 0 ? (
            <div style={styles.emptyBox}>No se encontraron datos para el filtro seleccionado.</div>
          ) : (
            <div style={styles.chartLayout}>
              <div style={styles.chartBox}>
                <div style={styles.chartBoxInner}>
                  <div ref={pieWrapRef} style={styles.pieWrap}>
                    {pieSize.width > 0 && pieSize.height > 0 ? (
                      <PieChart width={pieSize.width} height={pieSize.height}>
                        <Pie
                          data={chartData}
                          dataKey="value"
                          nameKey="label"
                          innerRadius={56}
                          outerRadius={88}
                          cx={Math.max(0, Math.floor(pieSize.width / 2))}
                          cy={Math.max(0, Math.floor(pieSize.height / 2))}
                          paddingAngle={2}
                          onClick={(_, index) => {
                            const datum = chartData[index];
                            if (datum) handleChartClick(datum);
                          }}
                          >
                            {chartData.map((item, index) => (
                              <Cell
                                key={`${item.label}-${index}`}
                                fill={PIE_COLORS[index % PIE_COLORS.length]}
                              stroke="#ffffff"
                              strokeWidth={2}
                              cursor={currentLevel === "tarea" ? "default" : "pointer"}
                              />
                            ))}
                            <Label
                              position="center"
                              content={({ viewBox }) => {
                                const centerBox = viewBox as { cx?: number; cy?: number } | undefined;
                                const cx = typeof centerBox?.cx === "number" ? centerBox.cx : Math.floor(pieSize.width / 2);
                                const cy = typeof centerBox?.cy === "number" ? centerBox.cy : Math.floor(pieSize.height / 2);

                                return (
                                  <g>
                                    <text
                                      x={cx}
                                      y={cy - 5}
                                      textAnchor="middle"
                                      dominantBaseline="middle"
                                      style={{
                                        fontSize: 18,
                                        fontWeight: 900,
                                        fill: "#0F172A",
                                      }}
                                    >
                                      {formatCompactSoles(totalConvertedToPen)}
                                    </text>
                                    <text
                                      x={cx}
                                      y={cy + 16}
                                      textAnchor="middle"
                                      dominantBaseline="middle"
                                      style={{
                                        fontSize: 12,
                                        fontWeight: 700,
                                        fill: "#64748B",
                                      }}
                                    >
                                      Total general
                                    </text>
                                  </g>
                                );
                              }}
                            />
                          </Pie>
                          <Tooltip formatter={(value) => formatCurrency(Number(value ?? 0), "PEN")} />
                        </PieChart>
                    ) : null}
                  </div>
                  <div style={styles.legendPanel}>
                    {chartData.map((item, index) => (
                      <button
                        key={`${item.label}-legend`}
                        type="button"
                        style={currentLevel === "tarea" ? styles.legendItemDisabled : styles.legendItem}
                        onClick={() => handleChartClick(item)}
                        disabled={currentLevel === "tarea"}
                      >
                        <span
                          style={{
                            ...styles.legendSwatch,
                            backgroundColor: PIE_COLORS[index % PIE_COLORS.length],
                          }}
                        />
                        <span style={styles.legendText}>{item.label}</span>
                        <span style={styles.legendPercent}>
                          {formatPercentage(chartTotal > 0 ? (item.value / chartTotal) * 100 : 0)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

                <div style={styles.detailSection}>
                  <div style={styles.detailPanel}>
                    <div style={styles.tableWrap}>
                      <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.sortableTh}>
                            <button type="button" style={styles.sortHeaderButton} onClick={() => handleLevelSortClick("nivel")}>
                              <span>Nivel</span>
                              {levelSortColumn === "nivel" ? <span style={styles.sortIndicator}>{levelSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                            </button>
                          </th>
                          <th style={styles.sortableTh}>
                            <button type="button" style={styles.sortHeaderButton} onClick={() => handleLevelSortClick("registros")}>
                              <span>Registros</span>
                              {levelSortColumn === "registros" ? <span style={styles.sortIndicator}>{levelSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                            </button>
                          </th>
                          {orderedVisibleCurrencies.map((currency) => (
                            <th key={currency} style={styles.sortableTh}>
                              <button type="button" style={styles.sortHeaderButton} onClick={() => handleLevelSortClick(currency)}>
                                <span>{currency}</span>
                                {levelSortColumn === currency ? <span style={styles.sortIndicator}>{levelSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                              </button>
                            </th>
                          ))}
                          <th style={styles.sortableTh}>
                            <button type="button" style={{ ...styles.sortHeaderButton, ...styles.accentSortHeaderButton }} onClick={() => handleLevelSortClick("montoPen")}>
                              <span>Monto en PEN</span>
                              {levelSortColumn === "montoPen" ? <span style={styles.sortIndicator}>{levelSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {chartData.length === 0 ? (
                          <tr>
                            <td colSpan={3 + orderedVisibleCurrencies.length} style={styles.emptyCell}>No hay detalle para mostrar.</td>
                          </tr>
                        ) : (
                          sortedChartData.map((item) => (
                            <tr key={item.label}>
                              <td style={styles.td}>
                                <button
                                  type="button"
                                  style={currentLevel === "tarea" ? styles.flatText : styles.linkButton}
                                  onClick={() => handleChartClick(item)}
                                  disabled={currentLevel === "tarea"}
                                >
                                  {item.label}
                                </button>
                              </td>
                              <td style={styles.td}>{item.count}</td>
                              {orderedVisibleCurrencies.map((currency) => (
                                <td key={currency} style={styles.tdStrong}>
                                  {item.amountsByCurrency[currency] != null
                                    ? formatCurrency(item.amountsByCurrency[currency], currency)
                                    : "-"}
                                </td>
                              ))}
                              <td style={{ ...styles.tdStrong, ...styles.accentTableCell }}>
                                {formatCurrency(
                                  Object.entries(item.amountsByCurrency).reduce(
                                    (accumulator, [currency, amount]) =>
                                      accumulator + convertToPen(amount, currency, appliedUsdExchangeRate, appliedDopExchangeRate),
                                    0,
                                  ),
                                  "PEN",
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
          </AppCard>
        </div>

        <div style={styles.recordsSection}>
          <div
            role="button"
            tabIndex={0}
            style={styles.recordsHeaderButton}
            onClick={() => setRecordsExpanded((value) => !value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setRecordsExpanded((value) => !value);
              }
            }}
          >
            <div style={styles.recordsHeaderLeft}>
              <span style={styles.recordsHeaderIcon}>☰</span>
              <div>
                <div style={styles.recordsHeaderTitle}>Detalle de registros</div>
                <div style={styles.recordsHeaderSubtitle}>Consulta el detalle completo de los registros del nivel seleccionado</div>
              </div>
            </div>
            <div style={styles.recordsHeaderRight}>
              <div style={styles.selectionCountBadge}>
                Registros existentes: <strong>{filteredRows.length}</strong>
              </div>
              <button
                type="button"
                style={filteredRows.length > 0 && !loading ? styles.primaryButton : styles.primaryButtonDisabled}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleExportVisibleToExcel();
                }}
                onKeyDown={(event) => event.stopPropagation()}
                disabled={filteredRows.length === 0 || loading}
              >
                Exportar a Excel
              </button>
              <div style={styles.recordsHeaderChevron}>{recordsExpanded ? "⌃" : "⌄"}</div>
            </div>
          </div>

          {recordsExpanded ? (
            <AppCard style={styles.compactCard}>
              <div style={styles.detailRecordsTableWrap} onScroll={(event) => setDetailScrollTop(event.currentTarget.scrollTop)}>
                <table style={styles.detailRecordsTable}>
                <thead>
                  <tr>
                    <th style={styles.sortableTh}>
                      <button type="button" style={styles.sortHeaderButton} onClick={() => handleDetailSortClick("id")}>
                        <span>Id</span>
                        {detailSortColumn === "id" ? <span style={styles.sortIndicator}>{detailSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                      </button>
                    </th>
                    <th style={styles.sortableTh}>
                      <button type="button" style={styles.sortHeaderButton} onClick={() => handleDetailSortClick("fecha")}>
                        <span>Fecha</span>
                        {detailSortColumn === "fecha" ? <span style={styles.sortIndicator}>{detailSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                      </button>
                    </th>
                    <th style={styles.sortableTh}>
                      <button type="button" style={styles.sortHeaderButton} onClick={() => handleDetailSortClick("cliente")}>
                        <span>Cliente</span>
                        {detailSortColumn === "cliente" ? <span style={styles.sortIndicator}>{detailSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                      </button>
                    </th>
                    <th style={styles.sortableTh}>
                      <button type="button" style={styles.sortHeaderButton} onClick={() => handleDetailSortClick("proyecto")}>
                        <span>Proyecto</span>
                        {detailSortColumn === "proyecto" ? <span style={styles.sortIndicator}>{detailSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                      </button>
                    </th>
                    <th style={styles.sortableTh}>
                      <button type="button" style={styles.sortHeaderButton} onClick={() => handleDetailSortClick("site")}>
                        <span>Site</span>
                        {detailSortColumn === "site" ? <span style={styles.sortIndicator}>{detailSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                      </button>
                    </th>
                    <th style={styles.sortableTh}>
                      <button type="button" style={styles.sortHeaderButton} onClick={() => handleDetailSortClick("tarea")}>
                        <span>Tarea</span>
                        {detailSortColumn === "tarea" ? <span style={styles.sortIndicator}>{detailSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                      </button>
                    </th>
                    <th style={styles.sortableTh}>
                      <button type="button" style={styles.sortHeaderButton} onClick={() => handleDetailSortClick("moneda")}>
                        <span>Moneda</span>
                        {detailSortColumn === "moneda" ? <span style={styles.sortIndicator}>{detailSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                      </button>
                    </th>
                    <th style={styles.sortableTh}>
                      <button type="button" style={styles.sortHeaderButton} onClick={() => handleDetailSortClick("monto")}>
                        <span>Monto</span>
                        {detailSortColumn === "monto" ? <span style={styles.sortIndicator}>{detailSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                      </button>
                    </th>
                    <th style={styles.sortableTh}>
                      <button type="button" style={styles.sortHeaderButton} onClick={() => handleDetailSortClick("montoPen")}>
                        <span>Monto en PEN</span>
                        {detailSortColumn === "montoPen" ? <span style={styles.sortIndicator}>{detailSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} style={styles.emptyCell}>
                        Cargando informaciÃ³n del store...
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={styles.emptyCell}>
                        No hay registros para mostrar.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {detailWindow.topSpacer > 0 ? (
                        <tr aria-hidden="true">
                          <td colSpan={9} style={{ padding: 0, border: 0, height: detailWindow.topSpacer }} />
                        </tr>
                      ) : null}
                      {detailWindow.visibleRows.map((row, index) => (
                        <tr key={`${row.id}-${detailWindow.startIndex + index}`} style={{ height: DETAIL_ROW_HEIGHT }}>
                          <td style={styles.tdStrong}>
                            <button type="button" style={styles.rowDetailButton} onClick={() => handleOpenRowDetails(row)}>
                              {row.id}
                            </button>
                          </td>
                          <td style={styles.td}>{getDisplayDepositDate(row)}</td>
                          <td style={styles.td}>{row.cliente}</td>
                          <td style={styles.td}>{row.proyecto}</td>
                          <td style={styles.td}>{row.site}</td>
                          <td style={styles.td}>{row.tarea}</td>
                          <td style={styles.tdStrong}>{row.moneda}</td>
                          <td style={styles.tdStrong}>{formatCurrency(row.monto, row.moneda)}</td>
                          <td style={styles.tdStrong}>{formatCurrency(convertToPen(row.monto, row.moneda, appliedUsdExchangeRate, appliedDopExchangeRate), "PEN")}</td>
                        </tr>
                      ))}
                      {detailWindow.bottomSpacer > 0 ? (
                        <tr aria-hidden="true">
                          <td colSpan={9} style={{ padding: 0, border: 0, height: detailWindow.bottomSpacer }} />
                        </tr>
                      ) : null}
                    </>
                  )}
                </tbody>
              </table>
            </div>
            </AppCard>
          ) : null}
        </div>

        {selectedGastoRow ? (
          <div style={styles.modalOverlay} onClick={handleCloseRowDetails} role="presentation">
            <div
              style={styles.modalPanel}
              role="dialog"
              aria-modal="true"
              aria-labelledby="visualizar-gasto-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div style={styles.modalHeader}>
                <div>
                  <div id="visualizar-gasto-title" style={styles.modalTitle}>
                    Visualizar gasto
                  </div>
                  <div style={styles.modalSubtitle}>
                    Registro #{formatModalText(selectedGastoRow.id)}
                    {selectedGastoRow.serie !== "-" ? ` - ${formatModalText(selectedGastoRow.comprobante)} ${formatModalText(selectedGastoRow.serie)}` : ""}
                  </div>
                </div>
                <button type="button" style={styles.modalCloseButton} onClick={handleCloseRowDetails}>
                  x Cerrar
                </button>
              </div>
              <>
                {selectedGastoDetailLoading ? (
                  <div style={styles.modalLoadingBox}>Cargando detalle completo del registro...</div>
                ) : null}
                {selectedGastoDetailError ? (
                  <div style={styles.modalErrorBox}>{selectedGastoDetailError}</div>
                ) : null}
                <div style={styles.modalExecutiveGrid}>
                  <section style={styles.modalFinancePanel}>
                    <div style={styles.modalFinanceTitle}>Comprobante</div>
                    <div style={styles.modalAmountRows}>
                      <div style={styles.modalAmountRow}>
                        <span>Subtotal</span>
                        <strong>{formatCurrency(selectedGastoRow.subtotal, selectedGastoRow.moneda)}</strong>
                      </div>
                      <div style={styles.modalAmountRow}>
                        <span>IGV</span>
                        <strong>{formatCurrency(selectedGastoRow.igv, selectedGastoRow.moneda)}</strong>
                      </div>
                      <div style={styles.modalAmountDivider} />
                      <div style={styles.modalAmountRowStrong}>
                        <span>Total ({selectedGastoRow.moneda})</span>
                        <strong>{formatCurrency(selectedGastoRow.totalPagar || selectedGastoRow.monto, selectedGastoRow.moneda)}</strong>
                      </div>
                    </div>
                    <div style={styles.modalConvertedTile}>
                      <span style={styles.modalConvertedTileLabel}>Total convertido</span>
                      <strong style={styles.modalConvertedTileValue}>{formatCurrency(selectedGastoConvertedPen, "PEN")}</strong>
                    </div>
                    {selectedGastoRow.facturaUrl !== "-" || selectedGastoRow.facturaPath !== "-" ? (
                      <a
                        href={selectedGastoRow.facturaUrl !== "-" ? selectedGastoRow.facturaUrl : selectedGastoRow.facturaPath}
                        target="_blank"
                        rel="noreferrer"
                        style={styles.facturaLink}
                      >
                        Ver factura
                      </a>
                    ) : null}
                  </section>

                  <section style={styles.modalInfoPanel}>
                    <div style={styles.modalInfoRow}>
                      <span style={styles.modalInfoLabel}>Tipo</span>
                      <strong style={styles.modalInfoValue}>
                        {formatModalText(selectedGastoRow.comprobante)}
                        {selectedGastoRow.serie !== "-" ? ` - serie ${formatModalText(selectedGastoRow.serie)}` : ""}
                      </strong>
                    </div>
                    <div style={styles.modalInfoRow}>
                      <span style={styles.modalInfoLabel}>Emision</span>
                      <strong style={styles.modalInfoValue}>{formatModalText(selectedGastoRow.fechaEmision)}</strong>
                    </div>
                    <div style={styles.modalInfoRow}>
                      <span style={styles.modalInfoLabel}>Deposito</span>
                      <strong style={styles.modalInfoValue}>{formatModalText(getDisplayDepositDate(selectedGastoRow))}</strong>
                    </div>
                    <div style={styles.modalInfoRow}>
                      <span style={styles.modalInfoLabel}>Vencimiento</span>
                      <strong style={styles.modalInfoValue}>{formatModalText(selectedGastoRow.fechaVencimiento)}</strong>
                    </div>
                    <div style={styles.modalInfoGap} />
                    <div style={styles.modalInfoRow}>
                      <span style={styles.modalInfoLabel}>Responsable</span>
                      <strong style={styles.modalInfoValue}>{formatModalText(selectedGastoRow.responsable)}</strong>
                    </div>
                    <div style={styles.modalInfoRow}>
                      <span style={styles.modalInfoLabel}>Solicitante</span>
                      <strong style={styles.modalInfoValue}>{formatModalText(selectedGastoRow.solicitante)}</strong>
                    </div>
                    <div style={styles.modalInfoRow}>
                      <span style={styles.modalInfoLabel}>Gestor</span>
                      <strong style={styles.modalInfoValue}>{formatModalText(selectedGastoRow.gestor)}</strong>
                    </div>
                    <div style={styles.modalInfoRow}>
                      <span style={styles.modalInfoLabel}>Validador</span>
                      <strong style={styles.modalInfoValue}>{formatModalText(selectedGastoRow.validador)}</strong>
                    </div>
                    <div style={styles.modalInfoRow}>
                      <span style={styles.modalInfoLabel}>Usuario</span>
                      <strong style={styles.modalInfoValue}>{formatModalText(selectedGastoRow.usuario)}</strong>
                    </div>
                  </section>
                </div>

                <section style={styles.modalNarrativeGrid}>
                  <div style={styles.modalNarrativeBlock}>
                    <div style={styles.modalNarrativeTitle}>Detalle</div>
                    <div style={styles.modalPlainText}>{formatModalText(selectedGastoRow.detalle)}</div>
                  </div>
                  <div style={styles.modalNarrativeBlock}>
                    <div style={styles.modalNarrativeTitle}>Comentario</div>
                    <div style={styles.modalPlainText}>{formatModalText(selectedGastoRow.comentario)}</div>
                  </div>
                </section>
              </>
            </div>
          </div>
        ) : null}
        {isLevelDetailExpanded ? (
          <div style={styles.modalOverlay} onClick={handleCloseLevelDetail} role="presentation">
            <div
              style={styles.levelModalPanel}
              role="dialog"
              aria-modal="true"
              aria-labelledby="nivel-ampliado-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div style={styles.modalHeader}>
                <div>
                  <div id="nivel-ampliado-title" style={styles.modalTitle}>
                    Detalle del nivel actual
                  </div>
                  <div style={styles.modalSubtitle}>Vista ampliada del segmento seleccionado.</div>
                </div>
                <button type="button" style={styles.modalCloseButton} onClick={handleCloseLevelDetail}>
                  Cerrar
                </button>
              </div>

              <div style={styles.levelModalHero}>
                <div style={styles.levelModalHeroCard}>
                  <span style={styles.levelModalHeroLabel}>Periodo aplicado</span>
                  <strong style={styles.levelModalHeroValue}>
                    {appliedFechaInicio} al {appliedFechaFin}
                  </strong>
                </div>
                <div style={styles.levelModalHeroCard}>
                  <span style={styles.levelModalHeroLabel}>Total convertido PEN</span>
                  <strong style={styles.levelModalHeroValue}>{formatCurrency(totalConvertedToPen, "PEN")}</strong>
                </div>
              </div>

              <div style={styles.levelModalGrid}>
                {totalsByCurrency.map(({ currency, total }) => (
                  <div key={currency} style={styles.levelModalField}>
                    <span style={styles.levelModalFieldLabel}>{currency}</span>
                    <strong style={styles.levelModalFieldValue}>{formatCurrency(total, currency)}</strong>
                  </div>
                ))}
              </div>

              <div style={styles.levelModalTableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.sortableTh}>
                        <button type="button" style={styles.sortHeaderButton} onClick={() => handleLevelSortClick("nivel")}>
                          <span>Nivel</span>
                          {levelSortColumn === "nivel" ? <span style={styles.sortIndicator}>{levelSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                        </button>
                      </th>
                      <th style={styles.sortableTh}>
                        <button type="button" style={styles.sortHeaderButton} onClick={() => handleLevelSortClick("registros")}>
                          <span>Registros</span>
                          {levelSortColumn === "registros" ? <span style={styles.sortIndicator}>{levelSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                        </button>
                      </th>
                      {orderedVisibleCurrencies.map((currency) => (
                        <th key={currency} style={styles.sortableTh}>
                          <button type="button" style={styles.sortHeaderButton} onClick={() => handleLevelSortClick(currency)}>
                            <span>{currency}</span>
                            {levelSortColumn === currency ? <span style={styles.sortIndicator}>{levelSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                          </button>
                        </th>
                      ))}
                      <th style={styles.sortableTh}>
                        <button type="button" style={{ ...styles.sortHeaderButton, ...styles.accentSortHeaderButton }} onClick={() => handleLevelSortClick("montoPen")}>
                          <span>Monto en PEN</span>
                          {levelSortColumn === "montoPen" ? <span style={styles.sortIndicator}>{levelSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.length === 0 ? (
                      <tr>
                        <td colSpan={3 + orderedVisibleCurrencies.length} style={styles.emptyCell}>
                          No hay detalle para mostrar.
                        </td>
                      </tr>
                    ) : (
                      sortedChartData.map((item) => (
                        <tr key={`expanded-${item.label}`}>
                          <td style={styles.td}>
                            <button
                              type="button"
                              style={currentLevel === "tarea" ? styles.flatText : styles.linkButton}
                              onClick={() => handleChartClick(item)}
                              disabled={currentLevel === "tarea"}
                            >
                              {item.label}
                            </button>
                          </td>
                          <td style={styles.td}>{item.count}</td>
                          {orderedVisibleCurrencies.map((currency) => (
                            <td key={currency} style={styles.tdStrong}>
                              {item.amountsByCurrency[currency] != null
                                ? formatCurrency(item.amountsByCurrency[currency], currency)
                                : "-"}
                            </td>
                          ))}
                          <td style={{ ...styles.tdStrong, ...styles.accentTableCell }}>
                            {formatCurrency(
                              Object.entries(item.amountsByCurrency).reduce(
                                (accumulator, [currency, amount]) =>
                                  accumulator + convertToPen(amount, currency, appliedUsdExchangeRate, appliedDopExchangeRate),
                                0,
                              ),
                              "PEN",
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div style={styles.recordsFooterNote}>
                Registros seleccionados: <strong>{sortedRows.length}</strong>
              </div>
            </div>
          </div>
        ) : null}

      </div>
    </AppPage>
  );
}

function MetricCard({
  label,
  value,
  accent = false,
  period = false,
  subValue,
}: {
  label: string;
  value: string;
  accent?: boolean;
  period?: boolean;
  subValue?: string;
}) {
  return (
    <div style={period ? styles.metricCardPeriod : accent ? styles.metricCardAccent : styles.metricCard}>
      <span style={styles.metricLabel}>{label}</span>
      <strong style={period ? styles.metricValuePeriod : styles.metricValue}>{value}</strong>
      {subValue ? <span style={styles.metricSubValue}>{subValue}</span> : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    height: "100%",
    minHeight: 0,
    overflow: "hidden",
  },
  mainContent: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    overflowX: "hidden",
  },
  filtersRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 16,
    alignItems: "flex-end",
  },
  filterField: {
    minWidth: 180,
    display: "grid",
    gap: 6,
  },
  exchangeRateField: {
    minWidth: 150,
    maxWidth: 170,
    display: "grid",
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: 700,
    color: "#334155",
  },
  input: {
    width: "100%",
    minHeight: 42,
    borderRadius: 12,
    border: "1px solid #CBD5E1",
    padding: "10px 12px",
    fontSize: 14,
    background: "#FFFFFF",
    color: "#0F172A",
    boxSizing: "border-box",
  },
  actionsWrap: {
    display: "flex",
    alignItems: "flex-end",
  },
  compactCard: {
    marginBottom: 8,
    padding: 16,
  },
  mainCard: {
    flex: "0 0 auto",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    marginBottom: 0,
    padding: 16,
  },
  recordsSection: {
    display: "grid",
    gap: 8,
    flex: "0 0 auto",
    marginTop: "auto",
    position: "relative",
    zIndex: 1,
  },
  recordsHeaderButton: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    borderRadius: 16,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    boxShadow: "0 2px 8px rgba(23, 20, 58, 0.06)",
    padding: "16px 18px",
    cursor: "pointer",
    textAlign: "left",
  },
  recordsHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  recordsHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    background: "#EFF6FF",
    color: "#1D4ED8",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    fontWeight: 800,
    flexShrink: 0,
  },
  recordsHeaderTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: "#0F172A",
    lineHeight: 1.1,
  },
  recordsHeaderSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#64748B",
  },
  recordsHeaderRight: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 14,
    flexShrink: 0,
  },
  recordsHeaderChevron: {
    fontSize: 24,
    fontWeight: 700,
    color: "#0F172A",
    lineHeight: 1,
    flexShrink: 0,
  },
  tabBar: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 8,
  },
  tabButton: {
    minHeight: 40,
    borderRadius: 999,
    border: "1px solid #BFDBFE",
    background: "#EFF6FF",
    color: "#1D4ED8",
    fontWeight: 700,
    padding: "0 16px",
    cursor: "pointer",
  },
  tabButtonActive: {
    minHeight: 40,
    borderRadius: 999,
    border: "1px solid #1D4ED8",
    background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
    color: "#FFFFFF",
    fontWeight: 700,
    padding: "0 16px",
    cursor: "pointer",
    boxShadow: "0 10px 22px rgba(37, 99, 235, 0.18)",
  },
  primaryButton: {
    minHeight: 42,
    border: "none",
    borderRadius: 12,
    padding: "0 18px",
    background: "linear-gradient(135deg, #2563EB, #0F172A)",
    color: "#FFFFFF",
    fontWeight: 700,
    cursor: "pointer",
  },
  primaryButtonDisabled: {
    minHeight: 42,
    border: "none",
    borderRadius: 12,
    padding: "0 18px",
    background: "#94A3B8",
    color: "#FFFFFF",
    fontWeight: 700,
    cursor: "not-allowed",
  },
  secondaryButton: {
    minHeight: 38,
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    padding: "0 14px",
    background: "#FFFFFF",
    color: "#0F172A",
    fontWeight: 700,
    cursor: "pointer",
  },
  metricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(158px, 1fr))",
    gap: 10,
  },
  metricCard: {
    borderRadius: 18,
    border: "1px solid #DBEAFE",
    background: "linear-gradient(180deg, #FFFFFF, #EFF6FF)",
    padding: 14,
    display: "grid",
    gap: 6,
    boxShadow: "0 10px 30px rgba(37, 99, 235, 0.08)",
  },
  metricCardAccent: {
    borderRadius: 18,
    border: "1px solid #1D4ED8",
    background: "linear-gradient(135deg, #DBEAFE, #BFDBFE 55%, #93C5FD)",
    padding: 14,
    display: "grid",
    gap: 6,
    boxShadow: "0 14px 34px rgba(29, 78, 216, 0.18)",
  },
  metricCardPeriod: {
    borderRadius: 18,
    border: "1px solid #DBEAFE",
    background: "linear-gradient(180deg, #FFFFFF, #EFF6FF)",
    padding: 14,
    display: "grid",
    gap: 4,
    boxShadow: "0 10px 30px rgba(37, 99, 235, 0.08)",
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  metricValue: {
    fontSize: 20,
    color: "#0F172A",
    lineHeight: 1.1,
  },
  metricValuePeriod: {
    fontSize: 18,
    color: "#0F172A",
    lineHeight: 1.15,
    wordBreak: "break-word",
  },
  metricSubValue: {
    fontSize: 12,
    fontWeight: 700,
    color: "#2563EB",
    lineHeight: 1.1,
  },
  breadcrumbRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    minWidth: 0,
  },
  breadcrumbHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  breadcrumbButton: {
    borderRadius: 999,
    border: "1px solid #BFDBFE",
    background: "#EFF6FF",
    color: "#1D4ED8",
    fontWeight: 700,
    padding: "8px 14px",
    cursor: "pointer",
  },
  breadcrumbButtonActive: {
    borderRadius: 999,
    border: "1px solid #1D4ED8",
    background: "#2563EB",
    color: "#FFFFFF",
    fontWeight: 700,
    padding: "8px 14px",
    cursor: "pointer",
  },
  breadcrumbFinal: {
    borderRadius: 999,
    background: "#E2E8F0",
    color: "#0F172A",
    fontWeight: 700,
    padding: "8px 14px",
  },
  chartLayout: {
    display: "grid",
    gridTemplateColumns: "minmax(280px, 0.8fr) minmax(560px, 1.2fr)",
    gap: 12,
    alignItems: "stretch",
    minHeight: 0,
  },
  chartBox: {
    height: "100%",
    maxHeight: 300,
    minHeight: 300,
    boxSizing: "border-box",
    borderRadius: 20,
    border: "1px solid #E2E8F0",
    background: "radial-gradient(circle at top, rgba(37,99,235,0.08), transparent 55%), #FFFFFF",
    padding: 6,
    overflow: "hidden",
  },
  chartBoxInner: {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 0.95fr) minmax(220px, 1.05fr)",
    gap: 12,
    alignItems: "stretch",
    height: "100%",
    minHeight: 0,
  },
  pieWrap: {
    position: "relative",
    minWidth: 0,
    minHeight: 288,
    height: 288,
  },
  chartCenter: {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: "100%",
    height: "100%",
    display: "grid",
    placeItems: "center",
    pointerEvents: "none",
    textAlign: "center",
  },
  chartCenterValue: {
    fontSize: 18,
    fontWeight: 900,
    color: "#0F172A",
    lineHeight: 1.05,
    maxWidth: "82%",
    overflowWrap: "anywhere",
    textAlign: "center",
  },
  chartCenterLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: 700,
    color: "#64748B",
    textAlign: "center",
  },
  legendPanel: {
    display: "grid",
    gap: 6,
    alignContent: "start",
    minWidth: 0,
    maxHeight: 288,
    overflowY: "auto",
    overflowX: "hidden",
    paddingRight: 2,
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    background: "#FFFFFF",
    padding: "8px 10px",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
    minWidth: 0,
  },
  legendItemDisabled: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    background: "#F8FAFC",
    padding: "8px 10px",
    cursor: "default",
    textAlign: "left",
    opacity: 0.7,
    width: "100%",
    minWidth: 0,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 999,
    flexShrink: 0,
  },
  legendText: {
    flex: 1,
    fontSize: 13,
    fontWeight: 700,
    color: "#0F172A",
    lineHeight: 1.2,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  legendPercent: {
    marginLeft: "auto",
    flexShrink: 0,
    fontSize: 11,
    fontWeight: 700,
    color: "#475569",
    whiteSpace: "nowrap",
  },
  sidePanelTopRow: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },
  detailSection: {
    display: "grid",
    minWidth: 0,
  },
  detailPanel: {
    borderRadius: 18,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minWidth: 0,
    height: 300,
    minHeight: 300,
    maxHeight: 300,
    boxSizing: "border-box",
    overflowY: "auto",
    overflowX: "hidden",
  },
  detailRecordsToolbar: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    justifyContent: "flex-end",
    marginBottom: 10,
  },
  detailRecordsActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  selectionCountBadge: {
    borderRadius: 999,
    border: "1px solid #BFDBFE",
    background: "#EFF6FF",
    color: "#1D4ED8",
    fontWeight: 700,
    padding: "10px 14px",
    lineHeight: 1,
  },
  sideCard: {
    borderRadius: 18,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    padding: 16,
    display: "grid",
    gap: 6,
  },
  sideCardWide: {
    borderRadius: 18,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    padding: 12,
    display: "grid",
    gap: 6,
    minWidth: 260,
  },
  sideCardCompact: {
    borderRadius: 18,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    padding: "10px 12px",
    display: "grid",
    gap: 4,
    width: "fit-content",
    minWidth: 120,
    justifySelf: "end",
  },
  sideLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sideValue: {
    fontSize: 18,
    color: "#0F172A",
  },
  sideValueCompact: {
    fontSize: 16,
    color: "#0F172A",
    lineHeight: 1.1,
  },
  loadingBox: {
    padding: 24,
    borderRadius: 16,
    background: "#F8FAFC",
    color: "#334155",
    textAlign: "center",
  },
  emptyBox: {
    padding: 24,
    borderRadius: 16,
    background: "#FFF7ED",
    color: "#9A3412",
    textAlign: "center",
  },
  tableWrap: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    position: "relative",
    isolation: "isolate",
  },
  detailRecordsTableWrap: {
    overflowX: "auto",
    overflowY: "auto",
    borderRadius: 18,
    border: "1px solid #E2E8F0",
    maxHeight: "calc(100vh - 360px)",
    minHeight: 0,
    position: "relative",
    isolation: "isolate",
  },
  paginationBar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  paginationSummary: {
    fontSize: 13,
    color: "#475569",
    fontWeight: 600,
  },
  paginationActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
  },
  paginationLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: "#0F172A",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 520,
  },
  detailRecordsTable: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 1280,
    background: "#FFFFFF",
  },
  th: {
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: "1px solid #CBD5E1",
    color: "#475569",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sortableTh: {
    textAlign: "left",
    padding: 0,
    borderBottom: "1px solid #CBD5E1",
    color: "#475569",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    position: "sticky",
    top: 0,
    zIndex: 10,
    background: "#FFFFFF",
    boxShadow: "0 1px 0 #CBD5E1, 0 8px 12px rgba(255, 255, 255, 0.96)",
  },
  sortHeaderButton: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "8px 10px",
    border: "none",
    color: "#475569",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    cursor: "pointer",
    background: "#FFFFFF",
    position: "relative",
    zIndex: 11,
  },
  accentSortHeaderButton: {
    borderRadius: 12,
    background: "linear-gradient(135deg, #DBEAFE, #BFDBFE 55%, #93C5FD)",
    color: "#0F172A",
    zIndex: 12,
  },
  sortIndicator: {
    fontSize: 11,
    color: "#1D4ED8",
    flexShrink: 0,
  },
  thCheckbox: {
    textAlign: "center",
    padding: "8px 10px",
    borderBottom: "1px solid #CBD5E1",
    color: "#475569",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    width: 44,
  },
  td: {
    padding: "8px 10px",
    borderBottom: "1px solid #E2E8F0",
    color: "#0F172A",
  },
  tdCheckbox: {
    padding: "8px 10px",
    borderBottom: "1px solid #E2E8F0",
    color: "#0F172A",
    textAlign: "center",
    width: 44,
  },
  tdStrong: {
    padding: "8px 10px",
    borderBottom: "1px solid #E2E8F0",
    color: "#0F172A",
    fontWeight: 700,
  },
  accentTableCell: {
    background: "linear-gradient(135deg, #DBEAFE, #BFDBFE 55%, #93C5FD)",
    color: "#0F172A",
    fontWeight: 800,
    boxShadow: "inset 0 0 0 1px rgba(29, 78, 216, 0.12)",
  },
  emptyCell: {
    padding: 20,
    textAlign: "center",
    color: "#64748B",
  },
  linkButton: {
    border: "none",
    background: "transparent",
    padding: 0,
    color: "#2563EB",
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "left",
  },
  rowDetailButton: {
    border: "none",
    background: "transparent",
    padding: 0,
    color: "#2563EB",
    fontWeight: 800,
    cursor: "pointer",
    textAlign: "left",
    textDecoration: "underline",
    textUnderlineOffset: 2,
  },
  detailHeaderActions: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  expandSectionButton: {
    borderRadius: 999,
    border: "1px solid #93C5FD",
    background: "#EFF6FF",
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: 800,
    padding: "4px 10px",
    cursor: "pointer",
  },
  flatText: {
    border: "none",
    background: "transparent",
    padding: 0,
    color: "#0F172A",
    fontWeight: 700,
    textAlign: "left",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.56)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 60,
  },
  modalPanel: {
    width: "min(760px, 100%)",
    maxHeight: "88vh",
    overflowY: "auto",
    borderRadius: 10,
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    boxShadow: "0 26px 80px rgba(15, 23, 42, 0.32)",
    padding: 24,
    display: "grid",
    gap: 18,
  },
  modalHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  modalTitle: {
    fontSize: 30,
    fontWeight: 900,
    color: "#0F172A",
    lineHeight: 1.1,
  },
  modalSubtitle: {
    marginTop: 6,
    color: "#64748B",
    fontSize: 14,
  },
  modalCloseButton: {
    minHeight: 34,
    borderRadius: 8,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    fontWeight: 700,
    padding: "0 16px",
    cursor: "pointer",
  },
  modalGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 10,
  },
  modalSummaryStrip: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },
  modalSummaryCard: {
    borderRadius: 18,
    border: "1px solid #E2E8F0",
    background: "linear-gradient(180deg, #FFFFFF, #F8FAFC)",
    padding: 14,
    display: "grid",
    gap: 6,
  },
  modalSummaryCardAccent: {
    borderRadius: 18,
    border: "1px solid #1D4ED8",
    background: "linear-gradient(135deg, #DBEAFE, #BFDBFE 55%, #93C5FD)",
    padding: 14,
    display: "grid",
    gap: 6,
  },
  modalSummaryLabel: {
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#64748B",
  },
  modalSummaryLabelAccent: {
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#0F172A",
  },
  modalSummaryValue: {
    fontSize: 18,
    fontWeight: 800,
    color: "#0F172A",
    lineHeight: 1.15,
    wordBreak: "break-word",
  },
  modalSummaryValueAccent: {
    fontSize: 20,
    fontWeight: 900,
    color: "#0F172A",
    lineHeight: 1.15,
    wordBreak: "break-word",
  },
  modalFilterBand: {
    borderRadius: 18,
    border: "1px solid #DBEAFE",
    background: "#F8FBFF",
    padding: "12px 14px",
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  modalFilterBandLabel: {
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#64748B",
  },
  modalFilterBandValue: {
    fontSize: 15,
    fontWeight: 800,
    color: "#0F172A",
    wordBreak: "break-word",
  },
  modalField: {
    borderRadius: 16,
    border: "1px solid #E2E8F0",
    background: "linear-gradient(180deg, #FFFFFF, #F8FAFC)",
    padding: 14,
    display: "grid",
    gap: 8,
  },
  modalFieldAccent: {
    borderRadius: 16,
    border: "1px solid #1D4ED8",
    background: "linear-gradient(135deg, #DBEAFE, #BFDBFE 55%, #93C5FD)",
    padding: 14,
    display: "grid",
    gap: 8,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#64748B",
  },
  modalLabelAccent: {
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#0F172A",
  },
  modalValue: {
    fontSize: 15,
    fontWeight: 700,
    color: "#0F172A",
    wordBreak: "break-word",
  },
  modalValueAccent: {
    fontSize: 18,
    fontWeight: 800,
    color: "#0F172A",
  },
  modalSection: {
    display: "grid",
    gap: 8,
  },
  modalTextBox: {
    borderRadius: 16,
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
    padding: 14,
    color: "#0F172A",
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  modalSectionsGrid: {
    display: "grid",
    gap: 16,
  },
  modalSectionCard: {
    borderRadius: 20,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
    padding: 16,
    display: "grid",
    gap: 14,
  },
  modalSectionHeader: {
    display: "grid",
    gap: 4,
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: 800,
    color: "#0F172A",
    lineHeight: 1.2,
  },
  modalSectionSubtitle: {
    fontSize: 13,
    color: "#64748B",
  },
  modalCardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 10,
  },
  modalFieldCard: {
    borderRadius: 16,
    border: "1px solid #E2E8F0",
    background: "linear-gradient(180deg, #FFFFFF, #F8FAFC)",
    padding: 13,
    display: "grid",
    gap: 6,
  },
  modalFieldCardAccent: {
    borderRadius: 16,
    border: "1px solid #1D4ED8",
    background: "linear-gradient(135deg, #DBEAFE, #BFDBFE 55%, #93C5FD)",
    padding: 13,
    display: "grid",
    gap: 6,
  },
  modalFieldLabel: {
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#64748B",
  },
  modalFieldLabelAccent: {
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#0F172A",
  },
  modalFieldValue: {
    fontSize: 15,
    fontWeight: 800,
    color: "#0F172A",
    wordBreak: "break-word",
  },
  modalFieldValueAccent: {
    fontSize: 18,
    fontWeight: 900,
    color: "#0F172A",
    wordBreak: "break-word",
  },
  modalNarrativeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 18,
  },
  modalExecutiveGrid: {
    display: "grid",
    gridTemplateColumns: "240px minmax(0, 1fr)",
    gap: 18,
    alignItems: "start",
  },
  modalFinancePanel: {
    borderRadius: 12,
    background: "#FBFCFE",
    padding: 18,
    display: "grid",
    gap: 14,
  },
  modalFinanceTitle: {
    fontSize: 12,
    color: "#64748B",
  },
  modalAmountRows: {
    display: "grid",
    gap: 8,
  },
  modalAmountRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    fontSize: 13,
    color: "#0F172A",
  },
  modalAmountRowStrong: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    fontSize: 14,
    color: "#0F172A",
    fontWeight: 800,
  },
  modalAmountDivider: {
    height: 1,
    background: "#E2E8F0",
    margin: "6px 0",
  },
  modalConvertedTile: {
    borderRadius: 8,
    background: "#BFDBFE",
    color: "#0F172A",
    padding: "12px 14px",
    display: "grid",
    gap: 2,
  },
  modalConvertedTileLabel: {
    fontSize: 12,
    color: "#1D4ED8",
    fontWeight: 700,
  },
  modalConvertedTileValue: {
    fontSize: 18,
    fontWeight: 900,
  },
  modalInfoPanel: {
    display: "grid",
    gridTemplateColumns: "128px minmax(0, 1fr)",
    columnGap: 24,
    rowGap: 12,
    paddingTop: 6,
  },
  modalInfoRow: {
    display: "contents",
  },
  modalInfoLabel: {
    color: "#334155",
    fontSize: 13,
    lineHeight: 1.35,
  },
  modalInfoValue: {
    color: "#020617",
    fontSize: 13,
    fontWeight: 800,
    lineHeight: 1.35,
    wordBreak: "break-word",
  },
  modalInfoGap: {
    gridColumn: "1 / -1",
    height: 2,
  },
  modalNarrativeBlock: {
    display: "grid",
    gap: 8,
  },
  modalNarrativeTitle: {
    fontSize: 14,
    color: "#334155",
    fontWeight: 800,
  },
  modalPlainText: {
    color: "#020617",
    fontSize: 14,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  modalNarrativeBox: {
    borderRadius: 18,
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
    padding: 14,
    display: "grid",
    gap: 8,
  },
  modalNarrativeText: {
    minHeight: 92,
    borderRadius: 14,
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    padding: 12,
    color: "#0F172A",
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  modalLoadingBox: {
    borderRadius: 16,
    border: "1px solid #BFDBFE",
    background: "#EFF6FF",
    color: "#1D4ED8",
    padding: 16,
    fontWeight: 700,
  },
  modalErrorBox: {
    borderRadius: 16,
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C",
    padding: 16,
    fontWeight: 700,
  },
  levelModalPanel: {
    width: "min(980px, 100%)",
    maxHeight: "92vh",
    overflowY: "auto",
    borderRadius: 28,
    background: "#FFFFFF",
    border: "1px solid #BFDBFE",
    boxShadow: "0 30px 90px rgba(15, 23, 42, 0.4)",
    padding: 24,
    display: "grid",
    gap: 20,
  },
  levelModalHero: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  levelModalHeroCard: {
    borderRadius: 20,
    border: "1px solid #E2E8F0",
    background: "linear-gradient(180deg, #FFFFFF, #F8FAFC)",
    padding: 18,
    display: "grid",
    gap: 8,
  },
  levelModalHeroLabel: {
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#64748B",
  },
  levelModalHeroLabelAccent: {
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#0F172A",
  },
  levelModalHeroValue: {
    fontSize: 22,
    fontWeight: 800,
    color: "#0F172A",
    wordBreak: "break-word",
  },
  levelModalHeroValueAccent: {
    fontSize: 30,
    fontWeight: 900,
    color: "#0F172A",
  },
  levelModalGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },
  levelModalField: {
    borderRadius: 16,
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
    padding: 14,
    display: "grid",
    gap: 8,
  },
  levelModalFieldAccent: {
    borderRadius: 16,
    border: "1px solid #1D4ED8",
    background: "linear-gradient(135deg, #DBEAFE, #BFDBFE 55%, #93C5FD)",
    padding: 14,
    display: "grid",
    gap: 8,
  },
  levelModalFieldLabel: {
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#64748B",
  },
  levelModalFieldLabelAccent: {
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#0F172A",
  },
  levelModalFieldValue: {
    fontSize: 16,
    fontWeight: 800,
    color: "#0F172A",
  },
  levelModalFieldValueAccent: {
    fontSize: 18,
    fontWeight: 900,
    color: "#0F172A",
  },
  levelModalTableWrap: {
    borderRadius: 20,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    overflow: "auto",
    maxHeight: "48vh",
  },
  recordsFooterNote: {
    padding: "10px 14px",
    borderRadius: 14,
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    color: "#475569",
    fontSize: 13,
    fontWeight: 700,
    textAlign: "right",
  },
  facturaLink: {
    display: "inline-flex",
    width: "fit-content",
    color: "#0F4FB8",
    fontWeight: 700,
    textDecoration: "underline",
    fontSize: 13,
  },
};




