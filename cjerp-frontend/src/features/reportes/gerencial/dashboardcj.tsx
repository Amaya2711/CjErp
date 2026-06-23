import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import * as XLSX from "xlsx";
import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppSectionHeader from "../../../components/base/AppSectionHeader";
import AppStatusMessage from "../../../components/base/AppStatusMessage";
import { getHttpErrorMessage } from "../../../utils/httpError";
import { consultarIaChat } from "../administrativo/iachat/services/iaChatService";
import type { IaChatRequest } from "../administrativo/iachat/types";

type RawRow = Record<string, unknown>;

type DashboardRow = {
  raw: RawRow;
  index: number;
  cliente: string;
  proyecto: string;
  site: string;
  idSite: string;
  ot: string;
  fechaRaw: string;
  fechaLabel: string;
  mesLabel: string;
  mesKey: string;
  responsable: string;
  solicitante: string;
  estado: string;
  moneda: string;
  subtotal: number;
  igv: number;
  total: number;
  subtotalSoles: number | null;
  ventas: number;
  conPagado: number;
  conPagadoSoles: number;
  totalPagadoHistoricoSoles: number;
  saldoOcSitio: number;
  subOc: number;
  subPlanilla: number;
  adelaFic: number;
  diferenciaFic: number;
  porcentajeFic: number;
  tipoPago: string;
  comprobante: string;
  bien: string;
  detalle: string;
  comentario: string;
  tipoCambio: number;
  gastoSoles: number;
  gastoMonedaOriginal: number;
  ventaSoles: number;
};

type ExecutiveGroup = {
  key: string;
  cliente: string;
  proyecto: string;
  site: string;
  idSite: string;
  ot: string;
  ventaUnica: number;
  gastoAcumulado: number;
  saldo: number;
  porcentajeConsumo: number | null;
  semaforo: "Verde" | "Amarillo" | "Rojo" | "Gris";
  responsablePrincipal: string;
  solicitantePrincipal: string;
  cantidadGastos: number;
  monedaConteo: string[];
  rows: DashboardRow[];
};

type DimensionKey =
  | "cliente"
  | "proyecto"
  | "site"
  | "idSite"
  | "ot"
  | "responsable"
  | "solicitante"
  | "estado"
  | "moneda"
  | "mes";

type FilterState = Record<DimensionKey, string[]>;

const DASHBOARD_QUESTION =
  "Muéstrame el detalle completo de gastos del módulo GASTOS para un dashboard gerencial, con todas las filas y columnas disponibles.";

function buildSearchQuestion(fechaInicio: string, fechaFin: string, searchText: string) {
  const parts = [
    "Ejecuta el store sp_IA_Planilla_Buscar del modulo GASTOS.",
    `fecha inicio ${formatDateForSearch(fechaInicio)}`,
    `fecha fin ${formatDateForSearch(fechaFin)}`,
  ];

  const cleanedSearch = searchText.trim();
  if (cleanedSearch) {
    parts.push(`texto busqueda ${cleanedSearch}`);
  }

  parts.push("coincidir todas");
  return parts.join(" ");
}

const EMPTY_FILTERS: FilterState = {
  cliente: [],
  proyecto: [],
  site: [],
  idSite: [],
  ot: [],
  responsable: [],
  solicitante: [],
  estado: [],
  moneda: [],
  mes: [],
};

function getTodayInputValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function getMonthStartInputValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
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

function normalizeText(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function toNumber(value: unknown): number {
  if (value == null) {
    return 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const text = String(value).trim();
  if (!text) {
    return 0;
  }

  const direct = Number(text);
  if (Number.isFinite(direct)) {
    return direct;
  }

  const normalized = text.includes(",") && !text.includes(".") ? text.replace(",", ".") : text.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
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

function buildDateFromParts(year: number, month: number, day: number) {
  if (![year, month, day].every(Number.isFinite)) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function parseDashboardDate(value: string) {
  if (!value) return null;

  const trimmed = value.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(trimmed);
  if (isoMatch) {
    return buildDateFromParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[T\s].*)?$/.exec(trimmed);
  if (slashMatch) {
    const monthFirst = buildDateFromParts(Number(slashMatch[3]), Number(slashMatch[1]), Number(slashMatch[2]));
    if (monthFirst) {
      return monthFirst;
    }

    return buildDateFromParts(Number(slashMatch[3]), Number(slashMatch[2]), Number(slashMatch[1]));
  }

  const dashMatch = /^(\d{1,2})-(\d{1,2})-(\d{4})(?:[T\s].*)?$/.exec(trimmed);
  if (dashMatch) {
    const monthFirst = buildDateFromParts(Number(dashMatch[3]), Number(dashMatch[1]), Number(dashMatch[2]));
    if (monthFirst) {
      return monthFirst;
    }

    return buildDateFromParts(Number(dashMatch[3]), Number(dashMatch[2]), Number(dashMatch[1]));
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function formatDateParts(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatShortDate(value: string) {
  const parsed = parseDashboardDate(value);
  if (!parsed) {
    return value ? value.trim() : "";
  }

  return `${String(parsed.getDate()).padStart(2, "0")}/${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function formatDateLabel(value: string) {
  const parsed = parseDashboardDate(value);
  if (!parsed) {
    return value ? value.trim() : "";
  }

  return formatDateParts(parsed);
}

function formatDateForSearch(value: string) {
  const parsed = parseDashboardDate(value);
  if (!parsed) {
    return value.trim();
  }

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function formatDecimal(value: number, digits = 2) {
  return value.toLocaleString("es-PE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatCurrencyValue(value: number) {
  return formatDecimal(value, 2);
}

function formatPercentValue(value: number | null) {
  if (value == null || !Number.isFinite(value)) {
    return "-";
  }

  return `${formatDecimal(value, 2)}%`;
}

function getSelectedLabel(filters: FilterState, key: DimensionKey) {
  return filters[key].length ? filters[key].join(", ") : "Todos";
}

function isSelected(value: string, selected: string[]) {
  if (selected.length === 0) {
    return true;
  }

  const normalized = normalizeText(value);
  return selected.some((item) => normalizeText(item) === normalized);
}

function getSemaforo(porcentaje: number | null, venta: number) {
  if (!venta || !Number.isFinite(venta)) {
    return "Gris" as const;
  }

  if (porcentaje == null) {
    return "Gris" as const;
  }

  if (porcentaje >= 100) return "Rojo" as const;
  if (porcentaje >= 80) return "Amarillo" as const;
  return "Verde" as const;
}

function getSemaforoStyle(semaforo: ExecutiveGroup["semaforo"]) {
  switch (semaforo) {
    case "Verde":
      return { background: "#DCFCE7", color: "#166534", border: "1px solid #86EFAC" };
    case "Amarillo":
      return { background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" };
    case "Rojo":
      return { background: "#FEE2E2", color: "#991B1B", border: "1px solid #FCA5A5" };
    default:
      return { background: "#E2E8F0", color: "#334155", border: "1px solid #CBD5E1" };
  }
}

function normalizeMonedaLabel(value: string) {
  const normalized = normalizeText(value);
  if (normalized.includes("USD") || normalized.includes("DOLAR")) return "USD";
  if (normalized.includes("PEN") || normalized.includes("SOLES") || normalized.includes("S/")) return "PEN";
  return value.trim() || "Sin moneda";
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildDashboardRow(row: RawRow, index: number): DashboardRow {
  const cliente = pickString(row, ["Cliente", "cliente", "NombreCliente", "nombreCliente", "clienteNombre"]);
  const proyecto = pickString(row, ["Proyecto", "proyecto", "NombreProyecto", "nombreProyecto"]);
  const site = pickString(row, ["Site", "site", "NombreSite", "nombreSite", "siteNombre"]);
  const idSite = pickString(row, ["IdSite", "idSite", "IDSITE", "id_site"]);
  const ot = pickString(row, ["OT", "Ot", "ot"]);
  const fechaRaw = pickString(row, ["Fecha", "fecha", "FecIngreso", "fecIngreso", "FechaEmision", "fechaEmision"]);
  const parsedDate = parseDashboardDate(fechaRaw);
  const fechaLabel = parsedDate ? formatDateLabel(fechaRaw) : (fechaRaw || "");
  const mesLabel = parsedDate ? formatMonthLabel(parsedDate) : "Sin fecha";
  const mesKey = parsedDate ? getMonthKey(parsedDate) : "sin-fecha";
  const responsable = pickString(row, ["Responsable", "responsable", "NomResponsable", "nomResponsable"]);
  const solicitante = pickString(row, ["Solicitante", "solicitante", "SolicitanteLabel", "solicitanteLabel"]);
  const estado = pickString(row, ["Estado", "estado", "EstadoNombre", "estadoNombre", "NombreEstado", "nombreEstado"]);
  const moneda = normalizeMonedaLabel(
    pickString(row, ["Moneda", "moneda", "MonedaLabel", "monedaLabel", "TipoMoneda", "tipoMoneda"])
  );
  const subtotal = pickNumber(row, ["Subtotal", "subtotal"]);
  const igv = pickNumber(row, ["Igv", "IGV", "igv"]);
  const total = pickNumber(row, ["Total", "total", "Monto", "monto"]);
  const subtotalSolesValue = row.SubtotalSoles ?? row.subtotalSoles;
  const subtotalSoles =
    subtotalSolesValue == null || subtotalSolesValue === ""
      ? null
      : toNumber(subtotalSolesValue);
  const ventas = pickNumber(row, ["Ventas", "ventas"]);
  const conPagado = pickNumber(row, ["ConPagado", "conPagado"]);
  const conPagadoSoles = pickNumber(row, ["ConPagadoSoles", "conPagadoSoles"]);
  const totalPagadoHistoricoSoles = pickNumber(row, ["TotalPagadoHistoricoSoles", "totalPagadoHistoricoSoles"]);
  const saldoOcSitio = pickNumber(row, ["SaldoOcSitio", "saldoOcSitio"]);
  const subOc = pickNumber(row, ["SubOc", "subOc"]);
  const subPlanilla = pickNumber(row, ["SubPlanilla", "subPlanilla"]);
  const adelaFic = pickNumber(row, ["AdelaFic", "adelaFic"]);
  const diferenciaFic = pickNumber(row, ["DiferenciaFic", "diferenciaFic"]);
  const porcentajeFic = pickNumber(row, ["PorcentajeFic", "porcentajeFic"]);
  const tipoPago = pickString(row, ["TipoPago", "tipoPago"]);
  const comprobante = pickString(row, ["Comprobante", "comprobante"]);
  const bien = pickString(row, ["Bien", "bien"]);
  const detalle = pickString(row, ["Detalle", "detalle"]);
  const comentario = pickString(row, ["Comentario", "comentario", "Observacion", "observacion"]);
  const tipoCambio = pickNumber(row, ["TipoCambio", "tipoCambio"]);

  const gastoBase = subtotalSoles != null && Number.isFinite(subtotalSoles)
    ? subtotalSoles
    : moneda === "USD"
      ? (subtotal || total) * (tipoCambio > 0 ? tipoCambio : 1)
      : subtotal || total;

  const ventaSoles = ventas > 0
    ? (moneda === "USD" ? ventas * (tipoCambio > 0 ? tipoCambio : 1) : ventas)
    : 0;

  return {
    raw: row,
    index,
    cliente,
    proyecto,
    site,
    idSite,
    ot,
    fechaRaw,
    fechaLabel,
    mesLabel,
    mesKey,
    responsable,
    solicitante,
    estado,
    moneda,
    subtotal,
    igv,
    total,
    subtotalSoles,
    ventas,
    conPagado,
    conPagadoSoles,
    totalPagadoHistoricoSoles,
    saldoOcSitio,
    subOc,
    subPlanilla,
    adelaFic,
    diferenciaFic,
    porcentajeFic,
    tipoPago,
    comprobante,
    bien,
    detalle,
    comentario,
    tipoCambio,
    gastoSoles: gastoBase || 0,
    gastoMonedaOriginal: total || subtotal || 0,
    ventaSoles,
  };
}

function buildLabelCountMap(rows: DashboardRow[], selector: (row: DashboardRow) => string) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const label = selector(row).trim();
    if (!label) return;
    map.set(label, (map.get(label) ?? 0) + 1);
  });
  return map;
}

function buildAmountMap(rows: DashboardRow[], selector: (row: DashboardRow) => string, amountSelector: (row: DashboardRow) => number) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const label = selector(row).trim();
    if (!label) return;
    map.set(label, (map.get(label) ?? 0) + amountSelector(row));
  });
  return map;
}

function buildMonthlyMap(rows: DashboardRow[], amountSelector: (row: DashboardRow) => number) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const label = row.mesLabel;
    map.set(label, (map.get(label) ?? 0) + amountSelector(row));
  });
  return map;
}

function buildExecutiveGroups(rows: DashboardRow[]) {
  const map = new Map<string, ExecutiveGroup & { saleCandidates: number[] }>();

  rows.forEach((row) => {
    const key = `${row.idSite}||${row.ot}`.trim();
    if (!map.has(key)) {
      map.set(key, {
        key,
        cliente: row.cliente,
        proyecto: row.proyecto,
        site: row.site,
        idSite: row.idSite,
        ot: row.ot,
        ventaUnica: 0,
        gastoAcumulado: 0,
        saldo: 0,
        porcentajeConsumo: null,
        semaforo: "Gris",
        responsablePrincipal: row.responsable,
        solicitantePrincipal: row.solicitante,
        cantidadGastos: 0,
        monedaConteo: [],
        rows: [],
        saleCandidates: [],
      });
    }

    const group = map.get(key)!;
    group.rows.push(row);
    group.cantidadGastos += 1;
    group.gastoAcumulado += row.gastoSoles;
    if (!group.cliente) group.cliente = row.cliente;
    if (!group.proyecto) group.proyecto = row.proyecto;
    if (!group.site) group.site = row.site;
    if (!group.idSite) group.idSite = row.idSite;
    if (!group.ot) group.ot = row.ot;
    if (!group.responsablePrincipal) group.responsablePrincipal = row.responsable;
    if (!group.solicitantePrincipal) group.solicitantePrincipal = row.solicitante;
    if (row.moneda && !group.monedaConteo.includes(row.moneda)) {
      group.monedaConteo.push(row.moneda);
    }
    if (row.ventaSoles > 0) {
      group.saleCandidates.push(row.ventaSoles);
    }
  });

  return Array.from(map.values()).map((group) => {
    const ventaUnica = group.saleCandidates.length ? Math.max(...group.saleCandidates) : 0;
    const saldo = ventaUnica - group.gastoAcumulado;
    const porcentajeConsumo = ventaUnica > 0 ? (group.gastoAcumulado / ventaUnica) * 100 : null;
    const semaforo = getSemaforo(porcentajeConsumo, ventaUnica);
    return {
      key: group.key,
      cliente: group.cliente,
      proyecto: group.proyecto,
      site: group.site,
      idSite: group.idSite,
      ot: group.ot,
      ventaUnica,
      gastoAcumulado: group.gastoAcumulado,
      saldo,
      porcentajeConsumo,
      semaforo,
      responsablePrincipal: group.responsablePrincipal,
      solicitantePrincipal: group.solicitantePrincipal,
      cantidadGastos: group.cantidadGastos,
      monedaConteo: group.monedaConteo,
      rows: group.rows,
    } satisfies ExecutiveGroup;
  });
}

function sortMapByAmount(map: Map<string, number>) {
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, "es"));
}

function sortMapByMonth(map: Map<string, number>) {
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => {
      if (left.label === "Sin fecha") return 1;
      if (right.label === "Sin fecha") return -1;
      return left.label.localeCompare(right.label, "es", { numeric: true });
    });
}

function filterRows(rows: DashboardRow[], filters: FilterState, fechaInicio: string, fechaFin: string) {
  const start = parseDashboardDate(fechaInicio);
  const end = parseDashboardDate(fechaFin);

  return rows.filter((row) => {
    const parsedDate = parseDashboardDate(row.fechaRaw);

    if (start && end && parsedDate) {
      const current = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
      const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      if (current < startDate || current > endDate) {
        return false;
      }
    } else if (start && end && !parsedDate) {
      return false;
    }

    const checks: Array<[string, string[], string]> = [
      [row.cliente, filters.cliente, "cliente"],
      [row.proyecto, filters.proyecto, "proyecto"],
      [row.site, filters.site, "site"],
      [row.idSite, filters.idSite, "idSite"],
      [row.ot, filters.ot, "ot"],
      [row.responsable, filters.responsable, "responsable"],
      [row.solicitante, filters.solicitante, "solicitante"],
      [row.estado, filters.estado, "estado"],
      [row.moneda, filters.moneda, "moneda"],
    ];

    for (const [value, selected] of checks) {
      if (!isSelected(value, selected)) {
        return false;
      }
    }

    if (filters.mes.length > 0) {
      if (!filters.mes.some((item) => normalizeText(item) === normalizeText(row.mesLabel))) {
        return false;
      }
    }

    return true;
  });
}

function getTopValue(map: Map<string, number>) {
  const entries = sortMapByAmount(map);
  return entries[0] ?? null;
}

function filterByGroup(rows: DashboardRow[], key: string) {
  return rows.filter((row) => `${row.idSite}||${row.ot}` === key);
}

function buildInsightText(
  groups: ExecutiveGroup[],
  amountByClient: Map<string, number>,
  amountByProject: Map<string, number>,
  amountBySite: Map<string, number>,
  amountByResponsable: Map<string, number>,
  amountBySolicitante: Map<string, number>,
  amountByMonth: Map<string, number>
) {
  const topClient = getTopValue(amountByClient);
  const topProject = getTopValue(amountByProject);
  const topSite = getTopValue(amountBySite);
  const topResponsable = getTopValue(amountByResponsable);
  const topSolicitante = getTopValue(amountBySolicitante);
  const alerts = groups.filter((group) => group.semaforo === "Rojo");
  const warnings = groups.filter((group) => group.semaforo === "Amarillo");
  const monthly = sortMapByMonth(amountByMonth);
  const firstTrend = monthly[0]?.label ?? "-";
  const lastTrend = monthly[monthly.length - 1]?.label ?? "-";

  return [
    topClient ? `El cliente con mayor gasto es ${topClient.label} con ${formatCurrencyValue(topClient.value)}.` : "No hay cliente dominante en el filtro actual.",
    topProject ? `El proyecto con mayor gasto es ${topProject.label} con ${formatCurrencyValue(topProject.value)}.` : "No hay proyecto dominante en el filtro actual.",
    topSite ? `El site con mayor gasto es ${topSite.label} con ${formatCurrencyValue(topSite.value)}.` : "No hay site dominante en el filtro actual.",
    topResponsable ? `El responsable con mayor gasto es ${topResponsable.label}.` : "No hay responsable dominante en el filtro actual.",
    topSolicitante ? `El solicitante con mayor gasto es ${topSolicitante.label}.` : "No hay solicitante dominante en el filtro actual.",
    alerts.length > 0
      ? `${alerts.length} OT o site se encuentran en alerta por sobreconsumo.`
      : "No se identifican OT o sites en alerta por sobreconsumo.",
    warnings.length > 0
      ? `${warnings.length} OT o site se encuentran en zona de precaucion.`
      : "No se identifican OT o sites en zona de precaucion.",
    monthly.length > 1 ? `La tendencia mensual se revisa entre ${firstTrend} y ${lastTrend}.` : "No hay una serie mensual suficiente para analizar tendencia.",
  ];
}

function buildRecommendations(
  groups: ExecutiveGroup[],
  filteredRows: DashboardRow[],
  amountByClient: Map<string, number>,
  amountByProject: Map<string, number>
) {
  const alerts = groups.filter((group) => group.semaforo === "Rojo").length;
  const warnings = groups.filter((group) => group.semaforo === "Amarillo").length;
  const sinVenta = groups.filter((group) => group.semaforo === "Gris").length;
  const mixedCurrencies = new Set(filteredRows.map((row) => row.moneda)).size > 1;
  const topClient = getTopValue(amountByClient);
  const topProject = getTopValue(amountByProject);

  const recommendations = [
    alerts > 0
      ? "Revisar antes de aprobar nuevos gastos en las OT con sobreconsumo."
      : "Mantener monitoreo preventivo sobre los consumos cercanos al limite.",
    sinVenta > 0
      ? "Validar la asociacion comercial en los registros sin venta identificada."
      : "No se observan registros sin venta en el filtro actual.",
    warnings > 0
      ? "Aplicar control preventivo en las OT que superan el 80% de consumo."
      : "El consumo agregado permanece fuera de zona de precaucion.",
    mixedCurrencies
      ? "Separar el analisis por moneda o validar equivalencia en soles para una lectura consistente."
      : "La lectura monetaria es homogena en el filtro activo.",
  ];

  if (topClient) {
    recommendations.push(`Dar seguimiento especifico al cliente ${topClient.label}.`);
  }

  if (topProject) {
    recommendations.push(`Revisar presupuesto, OC o valorizacion del proyecto ${topProject.label}.`);
  }

  return recommendations;
}

function MetricCard({
  label,
  value,
  subtitle,
  tone = "slate",
  onClick,
}: {
  label: string;
  value: string;
  subtitle?: string;
  tone?: "slate" | "blue" | "green" | "amber" | "red";
  onClick?: () => void;
}) {
  const palette: Record<string, React.CSSProperties> = {
    slate: { background: "linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 100%)", color: "#0F172A" },
    blue: { background: "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)", color: "#1E3A8A" },
    green: { background: "linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)", color: "#065F46" },
    amber: { background: "linear-gradient(135deg, #FFFBEB 0%, #FDE68A 100%)", color: "#92400E" },
    red: { background: "linear-gradient(135deg, #FEF2F2 0%, #FECACA 100%)", color: "#991B1B" },
  };

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "1px solid rgba(148, 163, 184, 0.22)",
        borderRadius: 18,
        padding: 18,
        textAlign: "left",
        width: "100%",
        cursor: onClick ? "pointer" : "default",
        boxShadow: "0 16px 40px rgba(15, 23, 42, 0.06)",
        ...palette[tone],
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.85 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 900, marginTop: 8 }}>{value}</div>
      {subtitle ? <div style={{ fontSize: 12, marginTop: 8, opacity: 0.85 }}>{subtitle}</div> : null}
    </button>
  );
}

function FilterPill({
  label,
  value,
  onRemove,
}: {
  label: string;
  value: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      style={{
        border: "1px solid #94A3B8",
        borderRadius: 999,
        background: "#FFFFFF",
        color: "#0F172A",
        padding: "8px 12px",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label}: {value} x
    </button>
  );
}

function RankedBarChart({
  title,
  data,
  onItemClick,
  activeItem,
  formatValue = formatCurrencyValue,
}: {
  title: string;
  data: Array<{ label: string; value: number }>;
  onItemClick?: (label: string) => void;
  activeItem?: string;
  formatValue?: (value: number) => string;
}) {
  const max = Math.max(...data.map((item) => item.value), 0);

  return (
    <AppCard style={{ borderRadius: 22, background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)" }}>
      <AppSectionHeader title={title} description="Haz clic sobre una barra para filtrar el dashboard." />
      <div style={{ display: "grid", gap: 10 }}>
        {data.length === 0 ? (
          <div style={{ color: "#64748B", fontSize: 13 }}>No hay datos para mostrar.</div>
        ) : (
          data.map((item) => {
            const width = max > 0 ? Math.max(8, (item.value / max) * 100) : 8;
            const isActive = activeItem && normalizeText(activeItem) === normalizeText(item.label);
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => onItemClick?.(item.label)}
                style={{
                  border: isActive ? "1px solid #0F766E" : "1px solid #E2E8F0",
                  borderRadius: 14,
                  background: isActive ? "#ECFEFF" : "#FFFFFF",
                  padding: 10,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                  <strong style={{ fontSize: 13, color: "#0F172A" }}>{item.label}</strong>
                  <span style={{ fontSize: 12, color: "#475569", fontWeight: 700 }}>{formatValue(item.value)}</span>
                </div>
                <div style={{ height: 12, borderRadius: 999, background: "#E2E8F0", overflow: "hidden" }}>
                  <div style={{ width: `${width}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #0F766E 0%, #14B8A6 100%)" }} />
                </div>
              </button>
            );
          })
        )}
      </div>
    </AppCard>
  );
}

function ComparisonChart({
  title,
  data,
  onItemClick,
  activeItem,
}: {
  title: string;
  data: Array<{ label: string; gastos: number; ventas: number }>;
  onItemClick?: (label: string) => void;
  activeItem?: string;
}) {
  const max = Math.max(...data.flatMap((item) => [item.gastos, item.ventas]), 0);

  return (
    <AppCard style={{ borderRadius: 22, background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)" }}>
      <AppSectionHeader title={title} description="Comparacion entre gastos y ventas por periodo." />
      <div style={{ display: "grid", gap: 10 }}>
        {data.map((item) => {
          const gastosWidth = max > 0 ? Math.max(8, (item.gastos / max) * 100) : 8;
          const ventasWidth = max > 0 ? Math.max(8, (item.ventas / max) * 100) : 8;
          const isActive = activeItem && normalizeText(activeItem) === normalizeText(item.label);
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => onItemClick?.(item.label)}
              style={{
                border: isActive ? "1px solid #1D4ED8" : "1px solid #E2E8F0",
                borderRadius: 16,
                background: isActive ? "#EFF6FF" : "#FFFFFF",
                padding: 12,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                <strong style={{ fontSize: 13 }}>{item.label}</strong>
                <span style={{ fontSize: 12, color: "#475569", fontWeight: 700 }}>
                  G: {formatCurrencyValue(item.gastos)} | V: {formatCurrencyValue(item.ventas)}
                </span>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ height: 10, borderRadius: 999, background: "#E2E8F0", overflow: "hidden" }}>
                  <div style={{ width: `${gastosWidth}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #B91C1C 0%, #F97316 100%)" }} />
                </div>
                <div style={{ height: 10, borderRadius: 999, background: "#E2E8F0", overflow: "hidden" }}>
                  <div style={{ width: `${ventasWidth}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #1D4ED8 0%, #38BDF8 100%)" }} />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </AppCard>
  );
}

function ExecutiveTable({
  groups,
  onFilter,
  title = "Tabla ejecutiva por IdSite + OT",
  description = "Cada fila permite filtrar el analisis por cliente, proyecto, site, OT, responsable o solicitante.",
}: {
  groups: ExecutiveGroup[];
  onFilter: (key: DimensionKey, value: string) => void;
  title?: string;
  description?: string;
}) {
  return (
    <AppCard style={{ borderRadius: 24 }}>
      <AppSectionHeader
        title={title}
        description={description}
      />
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1200 }}>
          <thead>
            <tr>
              {[
                "Cliente",
                "Proyecto",
                "Site",
                "IdSite",
                "OT",
                "Venta unica",
                "Gasto acumulado",
                "Saldo",
                "% Consumo",
                "Semaforo",
                "Responsable",
                "Solicitante",
                "Gastos",
              ].map((header) => (
                <th key={header} style={{ textAlign: "left", fontSize: 12, color: "#334155", padding: "12px 10px", borderBottom: "1px solid #E2E8F0" }}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={13} style={{ padding: 18, color: "#64748B" }}>
                  No existen gastos para los filtros seleccionados.
                </td>
              </tr>
            ) : (
              groups.map((group) => {
                const style = getSemaforoStyle(group.semaforo);
                return (
                  <tr key={group.key} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: 10 }}>
                      <button type="button" onClick={() => onFilter("cliente", group.cliente)} style={linkCellStyle}>{group.cliente || "-"}</button>
                    </td>
                    <td style={{ padding: 10 }}>
                      <button type="button" onClick={() => onFilter("proyecto", group.proyecto)} style={linkCellStyle}>{group.proyecto || "-"}</button>
                    </td>
                    <td style={{ padding: 10 }}>
                      <button type="button" onClick={() => onFilter("site", group.site)} style={linkCellStyle}>{group.site || "-"}</button>
                    </td>
                    <td style={{ padding: 10 }}>
                      <button type="button" onClick={() => onFilter("idSite", group.idSite)} style={linkCellStyle}>{group.idSite || "-"}</button>
                    </td>
                    <td style={{ padding: 10 }}>
                      <button type="button" onClick={() => onFilter("ot", group.ot)} style={linkCellStyle}>{group.ot || "-"}</button>
                    </td>
                    <td style={tdStyle}>{formatCurrencyValue(group.ventaUnica)}</td>
                    <td style={tdStyle}>{formatCurrencyValue(group.gastoAcumulado)}</td>
                    <td style={tdStyle}>{formatCurrencyValue(group.saldo)}</td>
                    <td style={tdStyle}>{formatPercentValue(group.porcentajeConsumo)}</td>
                    <td style={tdStyle}>
                      <span style={{ ...style, borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 800 }}>
                        {group.semaforo}
                      </span>
                    </td>
                    <td style={{ padding: 10 }}>
                      <button type="button" onClick={() => onFilter("responsable", group.responsablePrincipal)} style={linkCellStyle}>
                        {group.responsablePrincipal || "-"}
                      </button>
                    </td>
                    <td style={{ padding: 10 }}>
                      <button type="button" onClick={() => onFilter("solicitante", group.solicitantePrincipal)} style={linkCellStyle}>
                        {group.solicitantePrincipal || "-"}
                      </button>
                    </td>
                    <td style={tdStyle}>{group.cantidadGastos}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </AppCard>
  );
}

function IncomeTable({
  groups,
  onFilter,
}: {
  groups: ExecutiveGroup[];
  onFilter: (key: DimensionKey, value: string) => void;
}) {
  return (
    <AppCard style={{ borderRadius: 24 }}>
      <AppSectionHeader
        title="Ingresos unicos"
        description="Fuente del KPI Ventas unicas. Se muestra una sola vez por cada IdSite + OT."
      />
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr>
              {["Cliente", "Proyecto", "Site", "IdSite", "OT", "Venta unica"].map((header) => (
                <th key={header} style={{ textAlign: "left", fontSize: 12, color: "#334155", padding: "12px 10px", borderBottom: "1px solid #E2E8F0" }}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 18, color: "#64748B" }}>
                  No existen ingresos para los filtros seleccionados.
                </td>
              </tr>
            ) : (
              groups.map((group) => (
                <tr key={group.key} style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={{ padding: 10 }}>
                    <button type="button" onClick={() => onFilter("cliente", group.cliente)} style={linkCellStyle}>{group.cliente || "-"}</button>
                  </td>
                  <td style={{ padding: 10 }}>
                    <button type="button" onClick={() => onFilter("proyecto", group.proyecto)} style={linkCellStyle}>{group.proyecto || "-"}</button>
                  </td>
                  <td style={{ padding: 10 }}>
                    <button type="button" onClick={() => onFilter("site", group.site)} style={linkCellStyle}>{group.site || "-"}</button>
                  </td>
                  <td style={{ padding: 10 }}>
                    <button type="button" onClick={() => onFilter("idSite", group.idSite)} style={linkCellStyle}>{group.idSite || "-"}</button>
                  </td>
                  <td style={{ padding: 10 }}>
                    <button type="button" onClick={() => onFilter("ot", group.ot)} style={linkCellStyle}>{group.ot || "-"}</button>
                  </td>
                  <td style={tdStyle}>{formatCurrencyValue(group.ventaUnica)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AppCard>
  );
}

function DetailTable({
  rows,
  onFilter,
}: {
  rows: DashboardRow[];
  onFilter: (key: DimensionKey, value: string) => void;
}) {
  return (
    <AppCard style={{ borderRadius: 24 }}>
      <AppSectionHeader
        title="Tabla de detalle"
        description="Detalle individual de los gastos filtrados. Haz clic en cualquier campo relevante para refinar el dashboard."
      />
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1400 }}>
          <thead>
            <tr>
              {[
                "Fecha",
                "Cliente",
                "Proyecto",
                "Site",
                "OT",
                "Responsable",
                "Solicitante",
                "Estado",
                "Moneda",
                "Subtotal",
                "SubtotalSoles",
                "Total",
                "Detalle",
                "Comentario",
              ].map((header) => (
                <th key={header} style={{ textAlign: "left", fontSize: 12, color: "#334155", padding: "12px 10px", borderBottom: "1px solid #E2E8F0" }}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={14} style={{ padding: 18, color: "#64748B" }}>
                  No existen gastos para los filtros seleccionados.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={`${row.index}-${row.idSite}-${row.ot}`} style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={tdStyle}>{row.fechaLabel || "-"}</td>
                  <td style={{ padding: 10 }}><button type="button" onClick={() => onFilter("cliente", row.cliente)} style={linkCellStyle}>{row.cliente || "-"}</button></td>
                  <td style={{ padding: 10 }}><button type="button" onClick={() => onFilter("proyecto", row.proyecto)} style={linkCellStyle}>{row.proyecto || "-"}</button></td>
                  <td style={{ padding: 10 }}><button type="button" onClick={() => onFilter("site", row.site)} style={linkCellStyle}>{row.site || "-"}</button></td>
                  <td style={{ padding: 10 }}><button type="button" onClick={() => onFilter("ot", row.ot)} style={linkCellStyle}>{row.ot || "-"}</button></td>
                  <td style={{ padding: 10 }}><button type="button" onClick={() => onFilter("responsable", row.responsable)} style={linkCellStyle}>{row.responsable || "-"}</button></td>
                  <td style={{ padding: 10 }}><button type="button" onClick={() => onFilter("solicitante", row.solicitante)} style={linkCellStyle}>{row.solicitante || "-"}</button></td>
                  <td style={tdStyle}>{row.estado || "-"}</td>
                  <td style={tdStyle}>{row.moneda || "-"}</td>
                  <td style={tdStyle}>{formatCurrencyValue(row.subtotal)}</td>
                  <td style={tdStyle}>{row.subtotalSoles == null ? "-" : formatCurrencyValue(row.subtotalSoles)}</td>
                  <td style={tdStyle}>{formatCurrencyValue(row.total)}</td>
                  <td style={tdStyle}>{row.detalle || "-"}</td>
                  <td style={tdStyle}>{row.comentario || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AppCard>
  );
}

const tdStyle: React.CSSProperties = {
  padding: 10,
  fontSize: 13,
  color: "#0F172A",
  verticalAlign: "top",
};

const linkCellStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  padding: 0,
  margin: 0,
  color: "#0F766E",
  fontWeight: 800,
  cursor: "pointer",
  textAlign: "left",
};

export default function DashboardCjPage() {
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [draftFechaInicio, setDraftFechaInicio] = useState(getYearStartInputValue());
  const [draftFechaFin, setDraftFechaFin] = useState(getMonthEndInputValue());
  const [draftSearchText, setDraftSearchText] = useState("");
  const [appliedFechaInicio, setAppliedFechaInicio] = useState(getYearStartInputValue());
  const [appliedFechaFin, setAppliedFechaFin] = useState(getMonthEndInputValue());
  const [appliedSearchText, setAppliedSearchText] = useState("");
  const [showExecutiveTable, setShowExecutiveTable] = useState(false);
  const [showIncomeTable, setShowIncomeTable] = useState(false);
  const [showDetailTable, setShowDetailTable] = useState(false);
  const isMountedRef = useRef(true);

  const runStoreSearch = async (params?: { fechaInicio?: string; fechaFin?: string; searchText?: string }) => {
    const fechaInicioValue = params?.fechaInicio ?? draftFechaInicio;
    const fechaFinValue = params?.fechaFin ?? draftFechaFin;
    const searchTextValue = params?.searchText ?? draftSearchText;

    setLoading(true);
    setError("");

    try {
      const request: IaChatRequest = {
        module: "GASTOS",
        question: buildSearchQuestion(fechaInicioValue, fechaFinValue, searchTextValue),
        conversationId: null,
        presentationMode: "detail",
      };

      const response = await consultarIaChat(request);
      const detailRows = Array.isArray(response.detailRows) ? response.detailRows : [];

      if (!isMountedRef.current) {
        return;
      }

      setAppliedFechaInicio(fechaInicioValue);
      setAppliedFechaFin(fechaFinValue);
      setAppliedSearchText(searchTextValue);

      if (response.success) {
        setRawRows(detailRows);
        setError("");
        return;
      }

      setRawRows([]);
      setError(
        response.errorMessage?.trim() ||
          "El backend no devolvio detalle util desde IA Chat / sp_IA_Planilla_Buscar."
      );
    } catch (err: unknown) {
      if (!isMountedRef.current) {
        return;
      }
      setError(getHttpErrorMessage(err, "No se pudo cargar el dashboard gerencial."));
      setRawRows([]);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    void runStoreSearch({
      fechaInicio: getYearStartInputValue(),
      fechaFin: getMonthEndInputValue(),
      searchText: "",
    });
    return () => {
      isMountedRef.current = false;
    };
    // runStoreSearch deliberately stays outside the dependency list so the dashboard loads only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => rawRows.map((row, index) => buildDashboardRow(row, index)), [rawRows]);

  const filteredRows = useMemo(() => {
    return filterRows(rows, filters, appliedFechaInicio, appliedFechaFin);
  }, [appliedFechaFin, appliedFechaInicio, filters, rows]);

  const executiveGroups = useMemo(() => buildExecutiveGroups(filteredRows), [filteredRows]);

  const amountByClient = useMemo(() => buildAmountMap(filteredRows, (row) => row.cliente, (row) => row.gastoSoles), [filteredRows]);
  const amountByProject = useMemo(() => buildAmountMap(filteredRows, (row) => row.proyecto, (row) => row.gastoSoles), [filteredRows]);
  const amountBySite = useMemo(() => buildAmountMap(filteredRows, (row) => row.site, (row) => row.gastoSoles), [filteredRows]);
  const amountByResponsable = useMemo(() => buildAmountMap(filteredRows, (row) => row.responsable, (row) => row.gastoSoles), [filteredRows]);
  const amountBySolicitante = useMemo(() => buildAmountMap(filteredRows, (row) => row.solicitante, (row) => row.gastoSoles), [filteredRows]);
  const amountByEstado = useMemo(() => buildAmountMap(filteredRows, (row) => row.estado || "Sin estado", (row) => row.gastoSoles), [filteredRows]);
  const amountByMoneda = useMemo(() => buildAmountMap(filteredRows, (row) => row.moneda, (row) => row.gastoSoles), [filteredRows]);
  const amountByMonth = useMemo(() => buildMonthlyMap(filteredRows, (row) => row.gastoSoles), [filteredRows]);

  const topClients = useMemo(() => sortMapByAmount(amountByClient).slice(0, 8), [amountByClient]);
  const topProjects = useMemo(() => sortMapByAmount(amountByProject).slice(0, 8), [amountByProject]);
  const topSites = useMemo(() => sortMapByAmount(amountBySite).slice(0, 8), [amountBySite]);
  const topResponsables = useMemo(() => sortMapByAmount(amountByResponsable).slice(0, 8), [amountByResponsable]);
  const topSolicitantes = useMemo(() => sortMapByAmount(amountBySolicitante).slice(0, 8), [amountBySolicitante]);
  const topConsumption = useMemo(
    () =>
      [...executiveGroups]
        .sort((left, right) => (right.porcentajeConsumo ?? -1) - (left.porcentajeConsumo ?? -1))
        .slice(0, 8)
        .map((group) => ({
          label: `${group.idSite || "-"} / ${group.ot || "-"}`,
          value: group.porcentajeConsumo ?? 0,
        })),
    [executiveGroups]
  );
  const topDeviation = useMemo(
    () =>
      [...executiveGroups]
        .sort((left, right) => Math.abs(right.saldo) - Math.abs(left.saldo))
        .slice(0, 8)
        .map((group) => ({
          label: `${group.idSite || "-"} / ${group.ot || "-"}`,
          value: Math.abs(group.saldo),
        })),
    [executiveGroups]
  );

  const incomeRows = useMemo(
    () => [...executiveGroups].sort((left, right) => right.ventaUnica - left.ventaUnica),
    [executiveGroups]
  );

  const totals = useMemo(() => {
    const totalGastosSoles = filteredRows.reduce((sum, row) => sum + row.gastoSoles, 0);
    const totalGastosDolares = filteredRows
      .filter((row) => row.moneda === "USD")
      .reduce((sum, row) => sum + row.gastoMonedaOriginal, 0);
    const tipoCambioConsumo = 3.8;
    const totalVentas = executiveGroups.reduce((sum, group) => sum + group.ventaUnica, 0);
    const totalVentasNormalized = totalVentas;
    const totalDiferencia = totalVentasNormalized - totalGastosSoles;
    const totalGastosParaConsumo = totalGastosSoles + totalGastosDolares * tipoCambioConsumo;
    const porcentajeConsumoGlobal = totalVentasNormalized > 0 ? (totalGastosParaConsumo / totalVentasNormalized) * 100 : null;
    const margenDisponible = totalVentasNormalized - totalGastosSoles;
    const sinVenta = executiveGroups.filter((group) => group.semaforo === "Gris").length;
    const alertas = executiveGroups.filter((group) => group.semaforo === "Rojo").length;
    const clientes = new Set(filteredRows.map((row) => row.cliente).filter(Boolean)).size;
    const proyectos = new Set(filteredRows.map((row) => row.proyecto).filter(Boolean)).size;
    const sites = new Set(filteredRows.map((row) => row.site).filter(Boolean)).size;
    const ots = new Set(filteredRows.map((row) => `${row.idSite}||${row.ot}`).filter(Boolean)).size;
    const promedio = filteredRows.length ? totalGastosSoles / filteredRows.length : 0;

    return {
      totalGastosSoles,
      totalGastosDolares,
      totalVentas,
      totalDiferencia,
      porcentajeConsumoGlobal,
      margenDisponible,
      sinVenta,
      alertas,
      clientes,
      proyectos,
      sites,
      ots,
      promedio,
    };
  }, [executiveGroups, filteredRows]);

  const activeFilters = useMemo(() => {
    const items: Array<{ key: DimensionKey; label: string; value: string }> = [];
    (Object.keys(filters) as DimensionKey[]).forEach((key) => {
      filters[key].forEach((value) => {
        items.push({ key, label: key, value });
      });
    });

    if (appliedFechaInicio || appliedFechaFin) {
      items.push({
        key: "mes",
        label: "Fecha",
        value: `${formatDateLabel(appliedFechaInicio)} - ${formatDateLabel(appliedFechaFin)}`,
      });
    }

    if (appliedSearchText.trim()) {
      items.push({ key: "moneda", label: "Busqueda", value: appliedSearchText.trim() });
    }

    return items;
  }, [appliedFechaFin, appliedFechaInicio, appliedSearchText, filters]);

  const insights = useMemo(
    () =>
      buildInsightText(
        executiveGroups,
        amountByClient,
        amountByProject,
        amountBySite,
        amountByResponsable,
        amountBySolicitante,
        amountByMonth
      ),
    [amountByClient, amountByMonth, amountByProject, amountByResponsable, amountBySite, amountBySolicitante, executiveGroups]
  );

  const recommendations = useMemo(
    () => buildRecommendations(executiveGroups, filteredRows, amountByClient, amountByProject),
    [amountByClient, amountByProject, executiveGroups, filteredRows]
  );

  const noData = !loading && filteredRows.length === 0;

  const toggleFilter = (key: DimensionKey, value: string) => {
    if (!value.trim()) return;

    setFilters((prev) => {
      const current = prev[key];
      const normalized = normalizeText(value);
      const exists = current.some((item) => normalizeText(item) === normalized);
      return {
        ...prev,
        [key]: exists ? current.filter((item) => normalizeText(item) !== normalized) : [...current, value],
      };
    });
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setDraftFechaInicio(getYearStartInputValue());
    setDraftFechaFin(getMonthEndInputValue());
    setDraftSearchText("");
    setShowExecutiveTable(false);
    setShowDetailTable(false);
    void runStoreSearch({
      fechaInicio: getYearStartInputValue(),
      fechaFin: getMonthEndInputValue(),
      searchText: "",
    });
  };

  const exportToExcel = () => {
    const workbook = XLSX.utils.book_new();

    const resumenRows = [
      ["Total de gastos (S/)", totals.totalGastosSoles],
      ["Total de gastos USD", totals.totalGastosDolares],
      ["Total de ventas unicas", totals.totalVentas],
      ["Diferencia ventas - gastos", totals.totalDiferencia],
      ["Porcentaje consumo", totals.porcentajeConsumoGlobal ?? 0],
      ["Margen disponible", totals.margenDisponible],
      ["Registros de gasto", filteredRows.length],
      ["Clientes", totals.clientes],
      ["Proyectos", totals.proyectos],
      ["Sites", totals.sites],
      ["OTs", totals.ots],
      ["Gastos sin venta", totals.sinVenta],
      ["Alertas por sobreconsumo", totals.alertas],
      ["Promedio por registro", totals.promedio],
    ].map(([concepto, valor]) => ({ Concepto: concepto, Valor: valor }));

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(resumenRows), "Resumen");
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        incomeRows.map((group) => ({
          Cliente: group.cliente,
          Proyecto: group.proyecto,
          Site: group.site,
          IdSite: group.idSite,
          OT: group.ot,
          VentaUnica: group.ventaUnica,
        }))
      ),
      "IngresosUnicos"
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        executiveGroups.map((group) => ({
          Cliente: group.cliente,
          Proyecto: group.proyecto,
          Site: group.site,
          IdSite: group.idSite,
          OT: group.ot,
          VentaUnica: group.ventaUnica,
          GastoAcumulado: group.gastoAcumulado,
          Saldo: group.saldo,
          PorcentajeConsumo: group.porcentajeConsumo ?? "",
          Semaforo: group.semaforo,
          ResponsablePrincipal: group.responsablePrincipal,
          SolicitantePrincipal: group.solicitantePrincipal,
          CantidadGastos: group.cantidadGastos,
        }))
      ),
      "Ejecutivo"
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        filteredRows.map((row) => ({
          Fecha: row.fechaLabel,
          Cliente: row.cliente,
          Proyecto: row.proyecto,
          Site: row.site,
          IdSite: row.idSite,
          OT: row.ot,
          Responsable: row.responsable,
          Solicitante: row.solicitante,
          Estado: row.estado,
          Moneda: row.moneda,
          Subtotal: row.subtotal,
          SubtotalSoles: row.subtotalSoles ?? "",
          Total: row.total,
          Detalle: row.detalle,
          Comentario: row.comentario,
        }))
      ),
      "Detalle"
    );

    XLSX.writeFile(workbook, `dashboard_cj_${appliedFechaInicio}_${appliedFechaFin}.xlsx`);
  };

  const exportDetailToExcel = () => {
    const workbook = XLSX.utils.book_new();

    const detailRows = filteredRows.map((row) => ({
      Fecha: row.fechaLabel,
      Cliente: row.cliente,
      Proyecto: row.proyecto,
      Site: row.site,
      IdSite: row.idSite,
      OT: row.ot,
      Responsable: row.responsable,
      Solicitante: row.solicitante,
      Estado: row.estado,
      Moneda: row.moneda,
      Subtotal: row.subtotal,
      SubtotalSoles: row.subtotalSoles ?? "",
      Total: row.total,
      Detalle: row.detalle,
      Comentario: row.comentario,
    }));

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailRows), "Detalle");
    XLSX.writeFile(workbook, `dashboard_cj_detalle_${appliedFechaInicio}_${appliedFechaFin}.xlsx`);
  };

  const renderTopBar = () => (
    <div style={{ display: "grid", gap: 16, marginBottom: 18 }}>
      <div
        style={{
          borderRadius: 26,
          padding: 24,
          background: "linear-gradient(135deg, #0F172A 0%, #134E4A 55%, #0EA5A4 100%)",
          color: "#FFFFFF",
          boxShadow: "0 24px 60px rgba(15, 23, 42, 0.18)",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
          <div>
            
            <h1 style={{ margin: "10px 0 8px", fontSize: 30, fontWeight: 900 }}>Dashboard</h1>
            <div style={{ fontSize: 14, opacity: 0.9 }}>
              Fecha de generacion: {new Date().toLocaleDateString("es-PE")} | Filtros acumulativos y graficos interactivos.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={clearFilters} style={headerButtonStyle}>Limpiar filtros</button>
            <button type="button" onClick={exportToExcel} style={headerButtonStyle}>Exportar Excel</button>
          </div>
        </div>

        <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 13, whiteSpace: "nowrap" }}>Filtros activos:</strong>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {activeFilters.length === 0 ? (
              <span style={{ fontSize: 13, opacity: 0.92, whiteSpace: "nowrap" }}>Sin filtros adicionales.</span>
            ) : (
              activeFilters.map((item, index) => (
                <FilterPill
                  key={`${item.key}-${item.value}-${index}`}
                  label={item.label}
                  value={item.value}
                  onRemove={() => {
                    if (item.label === "Fecha") {
                      const defaultStart = getYearStartInputValue();
                      const defaultEnd = getMonthEndInputValue();
                      setDraftFechaInicio(defaultStart);
                      setDraftFechaFin(defaultEnd);
                      void runStoreSearch({
                        fechaInicio: defaultStart,
                        fechaFin: defaultEnd,
                        searchText: appliedSearchText,
                      });
                      return;
                    }

                    if (item.label === "Busqueda") {
                      setDraftSearchText("");
                      void runStoreSearch({
                        fechaInicio: appliedFechaInicio,
                        fechaFin: appliedFechaFin,
                        searchText: "",
                      });
                      return;
                    }

                    setFilters((prev) => ({
                      ...prev,
                      [item.key]: prev[item.key].filter((entry) => normalizeText(entry) !== normalizeText(item.value)),
                    }));
                  }}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const executiveRows = useMemo(() => [...executiveGroups].sort((left, right) => right.gastoAcumulado - left.gastoAcumulado), [executiveGroups]);

  return (
    <AppPage
     
    >
      {renderTopBar()}

      {error ? (
        <AppStatusMessage tone="error" style={{ marginBottom: 16 }}>
          {error}
        </AppStatusMessage>
      ) : null}

      {loading ? (
        <AppStatusMessage tone="info" style={{ marginBottom: 16 }}>
          Cargando dashboard gerencial...
        </AppStatusMessage>
      ) : null}

      <AppCard style={{ borderRadius: 24, marginBottom: 18 }}>
       
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", alignItems: "center" }}>
          <div style={filterFieldStyle}>
            <label style={filterLabelStyle}>Fecha inicio</label>
            <input type="date" value={draftFechaInicio} onChange={(event) => setDraftFechaInicio(event.target.value)} style={inputStyle} />
          </div>
          <div style={filterFieldStyle}>
            <label style={filterLabelStyle}>Fecha fin</label>
            <input type="date" value={draftFechaFin} onChange={(event) => setDraftFechaFin(event.target.value)} style={inputStyle} />
          </div>
          <div style={filterFieldStyle}>
            <label style={filterLabelStyle}>Busqueda general</label>
            <input
              type="text"
              value={draftSearchText}
              onChange={(event) => setDraftSearchText(event.target.value)}
              placeholder="Cliente, proyecto, site, OT..."
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", minWidth: 0 }}>
            <button
              type="button"
              onClick={() => void runStoreSearch()}
              style={searchButtonStyle}
              disabled={loading}
            >
              {loading ? "Buscando..." : "BUSCAR"}
            </button>
          </div>
        </div>
      </AppCard>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 18 }}>
        <MetricCard label="Total gastos" value={formatCurrencyValue(totals.totalGastosSoles)} tone="blue" />
        <MetricCard label="Total gastos USD" value={formatCurrencyValue(totals.totalGastosDolares)} tone="amber" />
        <MetricCard label="Ventas unicas" value={formatCurrencyValue(totals.totalVentas)} tone="green" />
        <MetricCard label="% Consumo" value={formatPercentValue(totals.porcentajeConsumoGlobal)} tone="slate" />
        <MetricCard label="Margen disponible" value={formatCurrencyValue(totals.margenDisponible)} tone="green" />
        <MetricCard label="Registros" value={String(filteredRows.length)} />
        <MetricCard label="Clientes" value={String(totals.clientes)} />
        <MetricCard label="Proyectos" value={String(totals.proyectos)} />
        <MetricCard label="Sites" value={String(totals.sites)} />
        <MetricCard label="OTs" value={String(totals.ots)} />
        <MetricCard label="Alertas" value={String(totals.alertas)} tone="red" />
        <MetricCard label="Gasto en alerta" value={String(executiveGroups.filter((group) => group.semaforo === "Rojo").length)} tone="red" />
      </div>

      {noData ? (
        <AppStatusMessage tone="info" style={{ marginBottom: 18 }}>
          No existen gastos para los filtros seleccionados.
        </AppStatusMessage>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18, marginBottom: 18 }}>
        <RankedBarChart title="Top clientes por gasto" data={topClients} onItemClick={(value) => toggleFilter("cliente", value)} activeItem={filters.cliente[0]} />
        <RankedBarChart title="Top proyectos por gasto" data={topProjects} onItemClick={(value) => toggleFilter("proyecto", value)} activeItem={filters.proyecto[0]} />
        <RankedBarChart title="Top sites por gasto" data={topSites} onItemClick={(value) => toggleFilter("site", value)} activeItem={filters.site[0]} />
        <RankedBarChart title="Top responsables por gasto" data={topResponsables} onItemClick={(value) => toggleFilter("responsable", value)} activeItem={filters.responsable[0]} />
        <RankedBarChart title="Top solicitantes por gasto" data={topSolicitantes} onItemClick={(value) => toggleFilter("solicitante", value)} activeItem={filters.solicitante[0]} />
        <RankedBarChart title="Distribucion por estado" data={sortMapByAmount(amountByEstado)} onItemClick={(value) => toggleFilter("estado", value)} activeItem={filters.estado[0]} />
        <RankedBarChart title="Distribucion por moneda" data={sortMapByAmount(amountByMoneda)} onItemClick={(value) => toggleFilter("moneda", value)} activeItem={filters.moneda[0]} />
        <RankedBarChart title="Evolucion mensual de gastos" data={sortMapByMonth(amountByMonth)} onItemClick={(value) => toggleFilter("mes", value)} activeItem={filters.mes[0]} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 18, marginBottom: 18 }}>
        <RankedBarChart
          title="Consumo de venta por IdSite + OT"
          data={topConsumption}
          onItemClick={(value) => {
            const [idSite, ot] = value.split(" / ");
            toggleFilter("idSite", idSite);
            toggleFilter("ot", ot);
          }}
        />
        <RankedBarChart
          title="Mayores desviaciones venta vs gasto"
          data={topDeviation}
          onItemClick={(value) => {
            const [idSite, ot] = value.split(" / ");
            toggleFilter("idSite", idSite);
            toggleFilter("ot", ot);
          }}
        />
      </div>

      <AppCard style={{ borderRadius: 24, marginBottom: 18 }}>
        <AppSectionHeader
          title="Listado de ingresos"
          description="Base utilizada para calcular el KPI Ventas unicas. Cada fila consolida una combinacion IdSite + OT y muestra una sola venta por grupo."
          actions={
            <button type="button" onClick={() => setShowIncomeTable((prev) => !prev)} style={detailToggleButtonStyle}>
              {showIncomeTable ? "Ocultar ingresos" : `Mostrar ingresos (${incomeRows.length})`}
            </button>
          }
        />
        {showIncomeTable ? (
          <IncomeTable groups={incomeRows} onFilter={toggleFilter} />
        ) : null}
      </AppCard>

      <AppCard style={{ borderRadius: 24, marginBottom: 18 }}>
        <AppSectionHeader
          title="Tabla ejecutiva por IdSite + OT"
          description="La tabla permanece oculta hasta que la solicites. Resume ventas, gastos y semaforo por OT."
          actions={
            <button type="button" onClick={() => setShowExecutiveTable((prev) => !prev)} style={detailToggleButtonStyle}>
              {showExecutiveTable ? "Ocultar tabla ejecutiva" : `Mostrar tabla ejecutiva (${executiveRows.length})`}
            </button>
          }
        />
        {showExecutiveTable ? <ExecutiveTable groups={executiveRows} onFilter={toggleFilter} /> : null}
      </AppCard>

      <div style={{ height: 18 }} />

      {filteredRows.length > 0 ? (
        <AppCard style={{ borderRadius: 24, marginBottom: 18 }}>
        <AppSectionHeader
          title="Detalle de gastos"
          description="La tabla de detalle permanece oculta hasta que la solicites."
          actions={
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setShowDetailTable((prev) => !prev)} style={detailToggleButtonStyle}>
                {showDetailTable ? "Ocultar detalle" : `Mostrar detalle (${filteredRows.length})`}
              </button>
              <button
                type="button"
                onClick={exportDetailToExcel}
                style={iconButtonStyle}
                aria-label="Exportar detalle a Excel"
                title="Exportar detalle a Excel"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3v10" />
                  <path d="M8 9l4 4 4-4" />
                  <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                </svg>
              </button>
            </div>
          }
        />
          {showDetailTable ? <DetailTable rows={filteredRows} onFilter={toggleFilter} /> : null}
        </AppCard>
      ) : null}



      <AppCard style={{ borderRadius: 24, marginBottom: 18 }}>
        <AppSectionHeader
          title="Resumen ejecutivo"
          description="Conclusiones automáticas calculadas solo sobre la informacion filtrada."
        />
        <div style={{ display: "grid", gap: 10 }}>
          {insights.map((item) => (
            <div key={item} style={{ padding: 12, borderRadius: 14, background: "#F8FAFC", border: "1px solid #E2E8F0", fontSize: 13, color: "#0F172A" }}>
              {item}
            </div>
          ))}
        </div>
      </AppCard>

    </AppPage>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  borderRadius: 12,
  border: "1px solid #CBD5E1",
  padding: "10px 12px",
  fontSize: 14,
  background: "#FFFFFF",
};

const filterFieldStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  minWidth: 0,
};

const filterLabelStyle: React.CSSProperties = {
  flex: "0 0 110px",
  fontSize: 13,
  fontWeight: 800,
  color: "#334155",
  whiteSpace: "nowrap",
};

const headerButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.35)",
  borderRadius: 12,
  padding: "10px 14px",
  background: "rgba(255,255,255,0.10)",
  color: "#FFFFFF",
  fontWeight: 800,
  cursor: "pointer",
};

const searchButtonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 12,
  padding: "11px 18px",
  background: "linear-gradient(135deg, #0F766E 0%, #14B8A6 100%)",
  color: "#FFFFFF",
  fontWeight: 900,
  letterSpacing: 0.4,
  cursor: "pointer",
  boxShadow: "0 10px 24px rgba(15, 118, 110, 0.22)",
};

const detailToggleButtonStyle: React.CSSProperties = {
  border: "1px solid #CBD5E1",
  borderRadius: 12,
  padding: "10px 14px",
  background: "#FFFFFF",
  color: "#0F172A",
  fontWeight: 800,
  cursor: "pointer",
};

const iconButtonStyle: React.CSSProperties = {
  width: 42,
  height: 42,
  border: "1px solid #CBD5E1",
  borderRadius: 12,
  background: "#FFFFFF",
  color: "#0F172A",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};
