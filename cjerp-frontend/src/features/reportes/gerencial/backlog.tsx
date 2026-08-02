import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import * as XLSX from "xlsx";
import AppPage from "../../../components/base/AppPage";
import AppCard from "../../../components/base/AppCard";
import AppStatusMessage from "../../../components/base/AppStatusMessage";
import { consultarImportarConsultaDsh } from "../../../api/importarConsultaService";
import { getHttpErrorMessage } from "../../../utils/httpError";

type RawRow = Record<string, unknown>;

type DrillLevel = "cliente" | "proyecto" | "site" | "tarea";

type DrillPath = {
  cliente: string | null;
  proyecto: string | null;
  site: string | null;
};

type DrillRow = {
  id: string;
  fechaIngreso: string;
  anoGestion: string;
  cliente: string;
  proyecto: string;
  site: string;
  tarea: string;
  idMoneda: number | null;
  moneda: string;
  monto: number;
  subtotal: number;
  igv: number;
  totalPagar: number;
  detalle: string;
  comentario: string;
};

type ImportarConsultaDshRow = {
  idCliente: string;
  nombreCliente: string;
  idProyecto: string;
  nombreProyecto: string;
  idSite: string;
  correlativo: string;
  nombreSite: string;
  tipoTrabajo: string;
  idMoneda: number | null;
  moneda: string;
  ot: string;
  mes: string;
  ano: string;
  nroOc: string;
  montoOc: number;
  montoBck: number;
  montoLiq: number;
  statusPap: string;
  statusCj: string;
  facturado: string;
  anoGestion: string;
  atp: string;
  prePasivo: string;
  proyecto2: string;
  gerencia: string;
};

type ChartDatum = {
  label: string;
  rawLabel: string;
  count: number;
  totalAmount: number;
  amountsByCurrency: Record<string, number>;
  trabajoTerminadoPen?: number;
};

type DetailSortColumn =
  | "cliente"
  | "proyecto"
  | "site"
  | "tipoTrabajo"
  | "ot"
  | "mes"
  | "ano"
  | "nroOc"
  | "montoBck"
  | "montoLiq"
  | "statusPap"
  | "statusCj"
  | "anoGestion"
  | "atp"
  | "prePasivo"
  | "proyecto2"
  | "gerencia"
  | "trabajoTerminado";

type LevelSortColumn = "nivel" | "registros" | "montoPen" | "trabajoTerminado" | "avance" | `currency:${string}`;
type SortDirection = "asc" | "desc";

const PIE_COLORS = [
  "#2563EB",
  "#14B8A6",
  "#22C55E",
  "#F59E0B",
  "#F97316",
  "#EF4444",
  "#A855F7",
  "#64748B",
];

const DEFAULT_EXCHANGE_RATES = {
  USD: 3.5,
  DOP: 0.058,
} as const;

function getYearInputValue() {
  const today = new Date();
  return String(today.getFullYear());
}

function parseYearInputValue(value: string) {
  const text = value.trim();
  if (!text) return null;

  const direct = Number(text);
  if (Number.isFinite(direct)) {
    return Math.trunc(direct);
  }

  const match = text.match(/\b(19|20)\d{2}\b/);
  if (!match) return null;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
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

function normalizeRowKey(key: string) {
  return normalizeText(key).replace(/[\s_-]/g, "");
}

function getRowValue(row: RawRow, keys: string[]) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return row[key];
    }
  }

  const normalizedEntries = Object.entries(row).map(([entryKey, value]) => [normalizeRowKey(entryKey), value] as const);

  for (const key of keys) {
    const normalizedKey = normalizeRowKey(key);
    const match = normalizedEntries.find(([entryKey]) => entryKey === normalizedKey);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

function pickString(row: RawRow, keys: string[]) {
  for (const key of keys) {
    const value = getRowValue(row, [key]);
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function pickNumber(row: RawRow, keys: string[]) {
  for (const key of keys) {
    const value = getRowValue(row, [key]);
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
  if (normalized.includes("DOP") || normalized.includes("PESO DOMINICANO") || normalized.includes("RD$")) return "DOP";
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

function formatPercent(value: number) {
  return `${Math.max(0, value).toFixed(1)}%`;
}

function getLevelAdvancePercent(item: ChartDatum) {
  return item.totalAmount > 0 ? ((item.trabajoTerminadoPen ?? 0) / item.totalAmount) * 100 : 0;
}

function getLevelSortValue(item: ChartDatum, column: LevelSortColumn) {
  if (column === "nivel") return item.label;
  if (column === "registros") return item.count;
  if (column === "montoPen") return item.totalAmount;
  if (column === "trabajoTerminado") return item.trabajoTerminadoPen ?? 0;
  if (column === "avance") return getLevelAdvancePercent(item);
  if (column.startsWith("currency:")) {
    const currency = column.slice("currency:".length);
    return item.amountsByCurrency[currency] ?? 0;
  }

  return item.totalAmount;
}

function convertToPen(value: number, currency: string, usdExchangeRate: number, dopExchangeRate: number) {
  if (currency === "USD") return value * usdExchangeRate;
  if (currency === "DOP") return value * dopExchangeRate;
  return value;
}

export function calculateBacklogContractedTotalPen(
  rows: Array<{ montoBck: number; moneda: string }>,
  usdExchangeRate: number,
  dopExchangeRate: number,
) {
  const totalsByCurrency = new Map<string, number>();

  for (const row of rows) {
    const currency = normalizeCurrencyForPenConversion(row.moneda || "PEN");
    totalsByCurrency.set(currency, (totalsByCurrency.get(currency) ?? 0) + row.montoBck);
  }

  return Array.from(totalsByCurrency.entries()).reduce(
    (accumulator, [currency, total]) => accumulator + convertToPen(total, currency, usdExchangeRate, dopExchangeRate),
    0,
  );
}

function normalizeCurrencyForPenConversion(currency: string) {
  const normalized = currency.trim().toUpperCase();

  if (!normalized || normalized === "PEN" || normalized === "S/" || normalized.includes("SOLES") || normalized.includes("SOL")) {
    return "PEN";
  }

  if (normalized === "USD" || normalized.includes("DOLAR") || normalized.includes("DÓLAR")) {
    return "USD";
  }

  if (normalized === "DOP" || normalized.includes("PESO DOMINICANO") || normalized.includes("DOMINICANO")) {
    return "DOP";
  }

  return normalized;
}

function isTrabajoTerminadoStatus(status: string) {
  const normalized = status.trim().toUpperCase();
  return normalized === "ON AIR" || normalized === "TERMINADO";
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("es-PE", {
    maximumFractionDigits: 0,
  }).format(value);
}

function normalizeFlagValue(value: string) {
  return normalizeText(value).replace(/[^A-Z0-9]/g, "");
}

function isFacturadoValue(value: string) {
  const normalized = normalizeFlagValue(value);
  return ["OK", "SI", "YES", "TRUE", "1", "X"].includes(normalized);
}

function parseExchangeRateInput(value: string) {
  const parsed = Number(value.replace(",", ".").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveCurrencyCode(row: RawRow) {
  const idMoneda = pickNumber(row, ["IdMoneda", "idMoneda", "idmoneda", "TipoMoneda", "tipoMoneda"]);
  const rawLabel = pickString(row, ["MONEDA", "Moneda", "moneda", "MonedaLabel", "monedaLabel", "TipoMonedaLabel", "tipoMonedaLabel"]);
  const label = normalizeMonedaLabel(rawLabel);

  if (label === "PEN" || label === "USD" || label === "DOP") {
    return { code: label, idMoneda: idMoneda > 0 ? idMoneda : null, label };
  }

  if (idMoneda === 1) {
    return { code: "PEN", idMoneda, label: "PEN" };
  }

  if (idMoneda === 2) {
    return { code: "USD", idMoneda, label: "USD" };
  }

  if (idMoneda === 3) {
    return { code: "DOP", idMoneda, label: "DOP" };
  }

  if (rawLabel.trim()) {
    return {
      code: label,
      idMoneda: idMoneda > 0 ? idMoneda : null,
      label,
    };
  }

  const fallbackLabel = resolveCurrencyLabelFromId(idMoneda > 0 ? idMoneda : null);

  return {
    code: fallbackLabel,
    idMoneda: idMoneda > 0 ? idMoneda : null,
    label: fallbackLabel,
  };
}

function resolveCurrencyLabelFromId(idMoneda: number | null) {
  if (idMoneda === 1) return "PEN";
  if (idMoneda === 2) return "USD";
  if (idMoneda === 3) return "DOP";
  if (idMoneda === 4) return "DOP";
  if (idMoneda != null && idMoneda > 0) return `Moneda ${idMoneda}`;
  return "Sin moneda";
}

function formatCurrencyKpiValue(value: number, currency: string) {
  if (currency === "PEN" || currency === "USD" || currency === "DOP") {
    return formatCurrency(value, currency);
  }

  return new Intl.NumberFormat("es-PE", {
    maximumFractionDigits: 2,
  }).format(value);
}

function buildDrillRow(row: RawRow): DrillRow {
  const fechaIngreso = formatDisplayDate(
    pickString(row, [
      "FechaDeposito",
      "fechadeposito",
      "fechaDeposito",
      "FecDeposito",
      "FecIngreso",
      "fecIngreso",
      "FechaIngreso",
      "fechaIngreso",
    ]),
  );

  const cliente = pickString(row, ["Cliente", "cliente", "NombreCliente", "nombreCliente"]) || "Sin cliente";
  const proyecto = pickString(row, ["Proyecto", "proyecto", "NombreProyecto", "nombreProyecto"]) || "Sin proyecto";
  const site = pickString(row, ["Site", "site", "NombreSite", "nombreSite", "siteNombre"]) || "Sin site";
  const tarea = pickString(row, ["Tarea", "tarea", "NombreTarea", "nombreTarea", "TipoTrabajo", "tipoTrabajo"]) || "Sin tarea";
  const anoGestion = pickString(row, ["AnoGestion", "anoGestion", "Ano", "ano"]) || "Sin año";
  const currency = resolveCurrencyCode(row);

  const subtotal = pickNumber(row, ["Subtotal", "subtotal"]);
  const igv = pickNumber(row, ["IGV", "Igv", "igv"]);
  const montoOc = pickNumber(row, ["MontoOc", "montoOc", "MontoOC", "montoOC"]);
  const total = pickNumber(row, ["Total", "total", "Monto", "monto"]);
  const totalPagar = pickNumber(row, ["TotalPagar", "totalPagar"]);
  const monto = montoOc || subtotal || total || totalPagar || 0;

  return {
    id: pickString(row, ["Correlativo", "correlativo", "Corre", "corre", "Id", "id"]) || "-",
    fechaIngreso: fechaIngreso || "-",
    anoGestion,
    cliente,
    proyecto,
    site,
    tarea,
    idMoneda: currency.idMoneda,
    moneda: currency.label,
    monto,
    subtotal: subtotal || 0,
    igv: igv || 0,
    totalPagar: totalPagar || montoOc || total || monto,
    detalle: pickString(row, ["Detalle", "detalle"]) || "-",
    comentario: pickString(row, ["Comentario", "comentario"]) || "-",
  };
}

function buildDashboard3ExcelRows(rows: ImportarConsultaDshRow[]) {
  return rows.map((row) => ({
    Cliente: row.nombreCliente,
    Proyecto: row.nombreProyecto,
    Site: row.nombreSite,
    "Tipo Trabajo": row.tipoTrabajo,
    OT: row.ot || "",
    Mes: row.mes || "",
    Año: row.ano || "",
    "Nro Oc": row.nroOc || "",
    "Monto BCK": row.montoBck,
    "Monto Liq": row.montoLiq,
    "STATUS PAP": row.statusPap || "",
    "Status CJ": row.statusCj || "",
    Facturado: row.facturado || "",
    "Año Gestion": row.anoGestion || "",
    ATP: row.atp || "",
    "Pre Pasivo": row.prePasivo || "",
    "Proyecto 2": row.proyecto2 || "",
    Gerencia: row.gerencia || "",
  }));
}

export function buildImportarConsultaDshRow(row: RawRow): ImportarConsultaDshRow {
  const currency = resolveCurrencyCode(row);
  const montoBck = pickNumber(row, ["monto_bck"]);

  return {
    idCliente: pickString(row, ["IdCliente", "idCliente"]),
    nombreCliente: pickString(row, ["NombreCliente", "nombreCliente"]) || "Sin cliente",
    idProyecto: pickString(row, ["IdProyecto", "idProyecto"]),
    nombreProyecto: pickString(row, ["NombreProyecto", "nombreProyecto"]) || "Sin proyecto",
    idSite: pickString(row, ["IdSite", "idSite"]),
    correlativo: pickString(row, ["Correlativo", "correlativo"]),
    nombreSite: pickString(row, ["NombreSite", "nombreSite"]) || "Sin site",
    tipoTrabajo: pickString(row, ["TipoTrabajo", "tipoTrabajo"]) || "Sin tipo",
    idMoneda: currency.idMoneda,
    moneda: currency.label,
    ot: pickString(row, ["OT", "Ot", "ot"]),
    mes: pickString(row, ["Mes", "mes"]),
    ano: pickString(row, ["Ano", "ano"]),
    nroOc: pickString(row, ["Nro_Oc", "nro_Oc", "NroOc", "nroOc"]),
    montoOc: pickNumber(row, ["MontoOc", "montoOc"]),
    montoBck,
    montoLiq: pickNumber(row, ["MontoLiq", "montoLiq"]),
    statusPap: pickString(row, ["STATUS_PAP", "Status_Pap", "statusPap"]),
    statusCj: pickString(row, ["Status_cj", "Status_Cj", "STATUS_CJ", "statusCj"]),
    facturado: pickString(row, ["FACTURADO", "Facturado", "facturado", "STATUS_FACT", "Status_Fact", "statusFact"]),
    anoGestion: pickString(row, ["AnoGestion", "anoGestion"]),
    atp: pickString(row, ["ATP", "atp"]),
    prePasivo: pickString(row, ["PrePasivo", "prePasivo"]),
    proyecto2: pickString(row, ["Proyecto2", "proyecto2"]),
    gerencia: pickString(row, ["GERENCIA", "Gerencia", "gerencia"]),
  };
}

function buildStoreBreakdown(rows: ImportarConsultaDshRow[], key: DrillLevel): ChartDatum[] {
  const map = new Map<string, ChartDatum>();

  for (const row of rows) {
    const rawLabel =
      key === "cliente"
        ? row.nombreCliente
        : key === "proyecto"
          ? row.nombreProyecto
          : key === "site"
            ? row.nombreSite
            : row.tipoTrabajo;
    const currency = row.moneda || "Sin moneda";
    const amount = row.montoBck;
    const current = map.get(rawLabel);

    if (current) {
      current.count += 1;
      current.totalAmount += amount;
      current.amountsByCurrency[currency] = (current.amountsByCurrency[currency] ?? 0) + amount;
      continue;
    }

    map.set(rawLabel, {
      label: rawLabel,
      rawLabel,
      count: 1,
      totalAmount: amount,
      amountsByCurrency: { [currency]: amount },
    });
  }

  return Array.from(map.values()).sort((left, right) => right.totalAmount - left.totalAmount);
}

function countUniqueStore(rows: ImportarConsultaDshRow[], key: keyof ImportarConsultaDshRow) {
  return new Set(rows.map((row) => row[key]).filter(Boolean)).size;
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
      return "Backlog por cliente";
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
      return "Selecciona un cliente para ver proyectos, sites y tipo de trabajo.";
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

function compareSortValues(left: string | number, right: string | number, direction: SortDirection) {
  const factor = direction === "asc" ? 1 : -1;

  if (typeof left === "number" && typeof right === "number") {
    return (left - right) * factor;
  }

  return String(left).localeCompare(String(right), "es", { sensitivity: "base" }) * factor;
}

type BacklogPageProps = {
  showHero?: boolean;
  showFilters?: boolean;
  showCurrentLevelHeader?: boolean;
  showAppliedPeriodCard?: boolean;
  onContractedBacklogTotalChange?: (value: number) => void;
  useExternalData?: boolean;
  externalStoreRows?: ImportarConsultaDshRow[] | null;
  appliedFechaInicio?: string;
  appliedFechaFin?: string;
  appliedSearchText?: string;
  appliedUsdExchangeRate?: number;
  appliedDopExchangeRate?: number;
};

export default function BacklogPage({
  showHero = true,
  showFilters = true,
  showCurrentLevelHeader = true,
  showAppliedPeriodCard = true,
  onContractedBacklogTotalChange,
  useExternalData = false,
  externalStoreRows,
  appliedFechaInicio: externalAppliedFechaInicio,
  appliedFechaFin: externalAppliedFechaFin,
  appliedSearchText: externalAppliedSearchText,
  appliedUsdExchangeRate: externalAppliedUsdExchangeRate,
  appliedDopExchangeRate: externalAppliedDopExchangeRate,
}: BacklogPageProps) {
  const [storeRows, setStoreRows] = useState<ImportarConsultaDshRow[]>(externalStoreRows ?? []);
  const [loading, setLoading] = useState(useExternalData ? externalStoreRows == null : true);
  const [error, setError] = useState("");
  const [draftAnoInicio, setDraftAnoInicio] = useState(getYearInputValue());
  const [draftAnoFin, setDraftAnoFin] = useState(getYearInputValue());
  const [draftSearchText, setDraftSearchText] = useState("");
  const [draftUsdExchangeRate, setDraftUsdExchangeRate] = useState(String(DEFAULT_EXCHANGE_RATES.USD));
  const [draftDopExchangeRate, setDraftDopExchangeRate] = useState(String(DEFAULT_EXCHANGE_RATES.DOP));
  const [appliedAnoInicio, setAppliedAnoInicio] = useState(getYearInputValue());
  const [appliedAnoFin, setAppliedAnoFin] = useState(getYearInputValue());
  const [appliedSearchText, setAppliedSearchText] = useState("");
  const [appliedUsdExchangeRate, setAppliedUsdExchangeRate] = useState<number>(DEFAULT_EXCHANGE_RATES.USD);
  const [appliedDopExchangeRate, setAppliedDopExchangeRate] = useState<number>(DEFAULT_EXCHANGE_RATES.DOP);
  const [path, setPath] = useState<DrillPath>({ cliente: null, proyecto: null, site: null });
  const [levelSortColumn, setLevelSortColumn] = useState<LevelSortColumn>("montoPen");
  const [levelSortDirection, setLevelSortDirection] = useState<SortDirection>("desc");
  const [detailSortColumn, setDetailSortColumn] = useState<DetailSortColumn>("montoBck");
  const [detailSortDirection, setDetailSortDirection] = useState<SortDirection>("desc");
  const [selectedSummaryKpi, setSelectedSummaryKpi] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const effectiveFechaInicio = externalAppliedFechaInicio ?? appliedAnoInicio;
  const effectiveFechaFin = externalAppliedFechaFin ?? appliedAnoFin;
  const effectiveSearchText = externalAppliedSearchText ?? appliedSearchText;
  const effectiveUsdExchangeRate = externalAppliedUsdExchangeRate ?? appliedUsdExchangeRate;
  const effectiveDopExchangeRate = externalAppliedDopExchangeRate ?? appliedDopExchangeRate;

  const loadRows = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await consultarImportarConsultaDsh(
        {
          consulta: "importar-consulta-dsh",
          parametros: [],
        },
        { timeoutMs: 120000 },
      );

      if (!isMountedRef.current) return;

      const detailRows = Array.isArray(response.rows) ? response.rows : [];
      if (response.limitExceeded) {
        setStoreRows([]);
        setError(response.message?.trim() || "La consulta excedio el maximo permitido para el dashboard.");
        return;
      }

      setAppliedAnoInicio(draftAnoInicio);
      setAppliedAnoFin(draftAnoFin);
      setAppliedSearchText(draftSearchText);
      setPath({ cliente: null, proyecto: null, site: null });
      setStoreRows(detailRows.map((row) => buildImportarConsultaDshRow(row)));
    } catch (err) {
      if (!isMountedRef.current) return;
      setStoreRows([]);
      setError(getHttpErrorMessage(err, "No se pudo cargar el dashboard 3."));
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;

    if (useExternalData) {
      if (externalStoreRows != null) {
        setStoreRows(externalStoreRows);
        setLoading(false);
      } else {
        setLoading(true);
      }
      return () => {
        isMountedRef.current = false;
      };
    }

    void loadRows();

    return () => {
      isMountedRef.current = false;
    };
  }, [externalStoreRows, useExternalData]);
  const filteredStoreRows = useMemo(() => {
    const yearStart = parseYearInputValue(effectiveFechaInicio);
    const yearEnd = parseYearInputValue(effectiveFechaFin);
    const searchText = normalizeText(effectiveSearchText);

    return storeRows.filter((row) => {
      const rowYear = parseYearInputValue(row.anoGestion);

      if (yearStart != null && rowYear != null && rowYear < yearStart) {
        return false;
      }

      if (yearEnd != null && rowYear != null && rowYear > yearEnd) {
        return false;
      }

      if (searchText) {
        const haystack = normalizeText(
          [
            row.idCliente,
            row.nombreCliente,
            row.idProyecto,
            row.nombreProyecto,
            row.idSite,
            row.correlativo,
            row.nombreSite,
            row.tipoTrabajo,
            row.ot,
            row.mes,
            row.ano,
            row.nroOc,
            String(row.montoBck),
            String(row.montoLiq),
            row.facturado,
            row.statusPap,
            row.statusCj,
            row.anoGestion,
            row.atp,
            row.prePasivo,
            row.proyecto2,
            row.gerencia,
          ].join(" "),
        );

        if (!haystack.includes(searchText)) {
          return false;
        }
      }

      return true;
    });
  }, [effectiveFechaFin, effectiveFechaInicio, effectiveSearchText, storeRows]);
  const currentLevel = getCurrentLevel(path);

  const navigableRows = useMemo(() => {
    return filteredStoreRows.filter((row) => {
      if (path.cliente && normalizeText(row.nombreCliente) !== normalizeText(path.cliente)) {
        return false;
      }
      if (path.proyecto && normalizeText(row.nombreProyecto) !== normalizeText(path.proyecto)) {
        return false;
      }
      if (path.site && normalizeText(row.nombreSite) !== normalizeText(path.site)) {
        return false;
      }
      return true;
    });
  }, [filteredStoreRows, path]);

  const chartData = useMemo(() => buildStoreBreakdown(navigableRows, currentLevel), [currentLevel, navigableRows]);

  const workFinishedByLevel = useMemo(() => {
    const map = new Map<string, number>();

    for (const row of navigableRows) {
      if (!isTrabajoTerminadoStatus(row.statusCj)) {
        continue;
      }

      const levelKey =
        currentLevel === "cliente"
          ? row.nombreCliente || "Sin cliente"
          : currentLevel === "proyecto"
            ? row.nombreProyecto || "Sin proyecto"
            : currentLevel === "site"
              ? row.nombreSite || "Sin site"
              : row.tipoTrabajo || "Sin tipo";
      const normalizedKey = normalizeText(levelKey);
      const currency = normalizeCurrencyForPenConversion(row.moneda || "PEN");
      const amountPen = convertToPen(row.montoBck, currency, effectiveUsdExchangeRate, effectiveDopExchangeRate);

      map.set(normalizedKey, (map.get(normalizedKey) ?? 0) + amountPen);
    }

    return map;
  }, [currentLevel, effectiveDopExchangeRate, effectiveUsdExchangeRate, navigableRows]);

  const chartDataWithTrabajoTerminado = useMemo(
    () =>
      chartData.map((item) => {
        const levelKey = normalizeText(item.rawLabel);

        return {
          ...item,
          trabajoTerminadoPen: workFinishedByLevel.get(levelKey) ?? 0,
        };
      }),
    [chartData, workFinishedByLevel],
  );

  const detailCurrencyColumns = useMemo(() => {
    const preferredOrder = ["PEN", "USD", "DOP"];
    const currencies = new Set<string>();

    for (const item of chartDataWithTrabajoTerminado) {
      Object.keys(item.amountsByCurrency).forEach((currency) => {
        currencies.add(currency || "Sin moneda");
      });
    }

    return Array.from(currencies).sort((left, right) => {
      const leftIndex = preferredOrder.indexOf(left);
      const rightIndex = preferredOrder.indexOf(right);

      if (leftIndex !== -1 || rightIndex !== -1) {
        if (leftIndex === -1) return 1;
        if (rightIndex === -1) return -1;
        return leftIndex - rightIndex;
      }

      return left.localeCompare(right, "es", { sensitivity: "base" });
    });
  }, [chartDataWithTrabajoTerminado]);

  const chartTotalsByCurrency = useMemo(() => {
    const map = new Map<string, number>();

    for (const row of navigableRows) {
      const currency = row.moneda || "Sin moneda";
      map.set(currency, (map.get(currency) ?? 0) + row.montoBck);
    }

    return Array.from(map.entries()).map(([currency, total]) => ({ currency, total }));
  }, [navigableRows]);

  const chartTotalConvertedToPen = useMemo(() => {
    return chartTotalsByCurrency.reduce((accumulator, item) => {
        return accumulator + convertToPen(item.total, item.currency, effectiveUsdExchangeRate, effectiveDopExchangeRate);
      }, 0);
  }, [chartTotalsByCurrency, effectiveDopExchangeRate, effectiveUsdExchangeRate]);

  const kpiTotalConvertedToPen = useMemo(() => {
    return calculateBacklogContractedTotalPen(navigableRows, appliedUsdExchangeRate, appliedDopExchangeRate);
  }, [appliedDopExchangeRate, appliedUsdExchangeRate, navigableRows]);

  const kpiTotalsByCurrency = useMemo(() => {
    const map = new Map<string, number>();

    for (const row of navigableRows) {
      const currency = row.moneda || "Sin moneda";
      map.set(currency, (map.get(currency) ?? 0) + row.montoBck);
    }

    return Array.from(map.entries()).map(([currency, total]) => ({ currency, total }));
  }, [navigableRows]);

  const workFinishedConvertedToPen = useMemo(() => {
    return Array.from(workFinishedByLevel.values()).reduce((accumulator, amount) => accumulator + amount, 0);
  }, [workFinishedByLevel]);

  const advancePercent = useMemo(() => {
    return kpiTotalConvertedToPen > 0 ? (workFinishedConvertedToPen / kpiTotalConvertedToPen) * 100 : 0;
  }, [kpiTotalConvertedToPen, workFinishedConvertedToPen]);

  const pendingExecuteConvertedToPen = useMemo(() => {
    return Math.max(0, kpiTotalConvertedToPen - workFinishedConvertedToPen);
  }, [kpiTotalConvertedToPen, workFinishedConvertedToPen]);

  const facturadoConvertedToPen = useMemo(() => {
    return navigableRows.reduce((accumulator, row) => {
      if (!isFacturadoValue(row.facturado)) {
        return accumulator;
      }

      const currency = normalizeCurrencyForPenConversion(row.moneda || "PEN");
      return accumulator + convertToPen(row.montoBck, currency, effectiveUsdExchangeRate, effectiveDopExchangeRate);
    }, 0);
  }, [effectiveDopExchangeRate, effectiveUsdExchangeRate, navigableRows]);

  const pendingFacturarConvertedToPen = useMemo(() => {
    return Math.max(0, workFinishedConvertedToPen - facturadoConvertedToPen);
  }, [facturadoConvertedToPen, workFinishedConvertedToPen]);

  const orderedTotalsByCurrency = useMemo(() => {
    const preferredOrder = ["PEN", "USD", "DOP"];

    return [...kpiTotalsByCurrency].sort((left, right) => {
      const leftIndex = preferredOrder.indexOf(left.currency);
      const rightIndex = preferredOrder.indexOf(right.currency);

      if (leftIndex !== -1 || rightIndex !== -1) {
        if (leftIndex === -1) return 1;
        if (rightIndex === -1) return -1;
        return leftIndex - rightIndex;
      }

      return left.currency.localeCompare(right.currency, "es", { sensitivity: "base" });
    });
  }, [kpiTotalsByCurrency]);

  useEffect(() => {
    onContractedBacklogTotalChange?.(kpiTotalConvertedToPen);
  }, [kpiTotalConvertedToPen, onContractedBacklogTotalChange]);

  const summaryCards = useMemo(
    () => [
      {
        label: "Contratado (backlog)",
        value: formatCurrency(kpiTotalConvertedToPen, "PEN"),
        tone: "blue",
      },
      {
        label: "% avance",
        value: formatPercent(advancePercent),
        tone: "orange",
      },
      {
        label: "Trabajo terminado",
        value: formatCurrency(workFinishedConvertedToPen, "PEN"),
        tone: "green",
      },
      {
        label: "Pend.Ejecutar",
        value: formatCurrency(pendingExecuteConvertedToPen, "PEN"),
        tone: "cream",
      },
      {
        label: "Facturado",
        value: formatCurrency(facturadoConvertedToPen, "PEN"),
        tone: "violet",
      },
      {
        label: "Pend.Facturar",
        value: formatCurrency(pendingFacturarConvertedToPen, "PEN"),
        tone: "cream",
      },
      ...orderedTotalsByCurrency.map((item, index) => ({
        label:
          item.currency === "PEN"
            ? "Total PEN"
            : item.currency === "USD"
              ? "Total USD"
              : item.currency === "DOP"
                ? "Total DOP"
                : `Total ${item.currency}`,
        value: formatCurrencyKpiValue(item.total, item.currency),
        tone: ["neutral", "green", "orange", "violet", "slate"][index % 5],
      })),
    ],
    [
      facturadoConvertedToPen,
      advancePercent,
      kpiTotalConvertedToPen,
      orderedTotalsByCurrency,
      pendingExecuteConvertedToPen,
      pendingFacturarConvertedToPen,
      workFinishedConvertedToPen,
    ],
  );

  const summaryCardsToRender = useMemo(
    () => summaryCards.filter((card) => card.label !== "Total PEN" && card.label !== "Total DOP"),
    [summaryCards],
  );

  const contractedSummaryCard = useMemo(
    () => summaryCardsToRender.find((card) => card.label === "Contratado (backlog)") ?? null,
    [summaryCardsToRender],
  );

  const otherSummaryCards = useMemo(
    () => summaryCardsToRender.filter((card) => card.label !== "Contratado (backlog)"),
    [summaryCardsToRender],
  );

  const showCurrencyTotals = selectedSummaryKpi === "Contratado (backlog)";

  const stackedCurrencyCards = useMemo(
    () => (showCurrencyTotals ? orderedTotalsByCurrency.filter((item) => item.currency === "PEN" || item.currency === "DOP") : []),
    [orderedTotalsByCurrency, showCurrencyTotals],
  );

  const appliedPeriodCard = useMemo(
    () => ({
      label: "Año aplicado",
      value: `${effectiveFechaInicio} al ${effectiveFechaFin}`,
    }),
    [effectiveFechaFin, effectiveFechaInicio],
  );

  const handleApplyFilters = async () => {
    const usdExchangeRate = parseExchangeRateInput(draftUsdExchangeRate);
    const dopExchangeRate = parseExchangeRateInput(draftDopExchangeRate);

    if (usdExchangeRate == null || dopExchangeRate == null) {
      setError("Ingrese tipos de cambio validos y mayores que cero para USD y DOP.");
      return;
    }

    setAppliedUsdExchangeRate(usdExchangeRate);
    setAppliedDopExchangeRate(dopExchangeRate);
    setAppliedAnoInicio(draftAnoInicio);
    setAppliedAnoFin(draftAnoFin);
    setAppliedSearchText(draftSearchText);
    await loadRows();
  };

  const sortedChartData = useMemo(() => {
    const items = [...chartDataWithTrabajoTerminado];
    items.sort((left, right) => {
      return compareSortValues(getLevelSortValue(left, levelSortColumn), getLevelSortValue(right, levelSortColumn), levelSortDirection);
    });

    return items;
  }, [chartDataWithTrabajoTerminado, levelSortColumn, levelSortDirection]);

  const sortedRows = useMemo(() => {
    const items = [...navigableRows];

    items.sort((left, right) => {
      switch (detailSortColumn) {
        case "cliente":
          return compareSortValues(left.nombreCliente, right.nombreCliente, detailSortDirection);
        case "proyecto":
          return compareSortValues(left.nombreProyecto, right.nombreProyecto, detailSortDirection);
        case "site":
          return compareSortValues(left.nombreSite, right.nombreSite, detailSortDirection);
        case "tipoTrabajo":
          return compareSortValues(left.tipoTrabajo, right.tipoTrabajo, detailSortDirection);
        case "ot":
          return compareSortValues(left.ot, right.ot, detailSortDirection);
        case "mes":
          return compareSortValues(left.mes, right.mes, detailSortDirection);
        case "ano":
          return compareSortValues(left.ano, right.ano, detailSortDirection);
        case "nroOc":
          return compareSortValues(left.nroOc, right.nroOc, detailSortDirection);
        case "montoBck":
          return compareSortValues(left.montoBck, right.montoBck, detailSortDirection);
        case "montoLiq":
          return compareSortValues(left.montoLiq, right.montoLiq, detailSortDirection);
        case "statusPap":
          return compareSortValues(left.statusPap, right.statusPap, detailSortDirection);
        case "statusCj":
          return compareSortValues(left.statusCj, right.statusCj, detailSortDirection);
        case "anoGestion":
          return compareSortValues(left.anoGestion, right.anoGestion, detailSortDirection);
        case "atp":
          return compareSortValues(left.atp, right.atp, detailSortDirection);
        case "prePasivo":
          return compareSortValues(left.prePasivo, right.prePasivo, detailSortDirection);
        case "proyecto2":
          return compareSortValues(left.proyecto2, right.proyecto2, detailSortDirection);
        case "gerencia":
          return compareSortValues(left.gerencia, right.gerencia, detailSortDirection);
        default:
          return 0;
      }
    });

    return items;
  }, [detailSortColumn, detailSortDirection, navigableRows]);

  const handleChartClick = (datum: ChartDatum) => {
    if (currentLevel === "tarea") {
      return;
    }

    setPath((previousPath) => getNextPath(currentLevel, previousPath, datum.rawLabel));
  };

  const handleBreadcrumbReset = (level: "all" | "cliente" | "proyecto") => {
    if (level === "all") {
      setPath({ cliente: null, proyecto: null, site: null });
      return;
    }

    if (level === "cliente") {
      setPath((previousPath) => ({ cliente: previousPath.cliente, proyecto: null, site: null }));
      return;
    }

    setPath((previousPath) => ({ cliente: previousPath.cliente, proyecto: previousPath.proyecto, site: null }));
  };

  const handleLevelSortClick = (column: LevelSortColumn) => {
    if (levelSortColumn === column) {
      setLevelSortDirection((previous) => (previous === "asc" ? "desc" : "asc"));
      return;
    }

    setLevelSortColumn(column);
    setLevelSortDirection(
      column === "montoPen" || column === "trabajoTerminado" || column === "avance" || column.startsWith("currency:")
        ? "desc"
        : "asc",
    );
  };

  const handleDetailSortClick = (column: DetailSortColumn) => {
    if (detailSortColumn === column) {
      setDetailSortDirection((previous) => (previous === "asc" ? "desc" : "asc"));
      return;
    }

    setDetailSortColumn(column);
    setDetailSortDirection(column === "montoBck" || column === "montoLiq" ? "desc" : "asc");
  };

  const handleExportRecords = () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(buildDashboard3ExcelRows(sortedRows));
    XLSX.utils.book_append_sheet(workbook, worksheet, "Detalle registros");
    XLSX.writeFile(workbook, `backlog_detalle_registros_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <AppPage title="" style={{ padding: 12 }} fillHeight>
      <div style={styles.page}>
        <div style={styles.mainContent}>
          {showHero ? (
            <div style={styles.heroCard}>
              <div style={styles.heroIcon}>
                <div style={styles.heroIconBars}>
                  <span style={{ width: 8, height: 14, borderRadius: 4, background: "#2563EB" }} />
                  <span style={{ width: 8, height: 20, borderRadius: 4, background: "#14B8A6" }} />
                  <span style={{ width: 8, height: 10, borderRadius: 4, background: "#F59E0B" }} />
                </div>
              </div>
              <div>
                <div style={styles.heroTitle}>Reporte de Backlog</div>
                <div style={styles.heroSubtitle}>Backlog gerencial sobre sp_Importar_ConsultaDsh</div>
              </div>
            </div>
          ) : null}
      {showFilters ? (
        <AppCard style={styles.compactCard}>
          <div style={styles.filterGrid}>
          <label style={styles.filterField}>
            <span style={styles.filterLabel}>Año inicio</span>
            <input
              type="number"
              min={1900}
              max={2100}
              value={draftAnoInicio}
              onChange={(event) => setDraftAnoInicio(event.target.value)}
              style={styles.input}
            />
          </label>
          <label style={styles.filterField}>
            <span style={styles.filterLabel}>Año fin</span>
            <input
              type="number"
              min={1900}
              max={2100}
              value={draftAnoFin}
              onChange={(event) => setDraftAnoFin(event.target.value)}
              style={styles.input}
            />
          </label>
          <label style={{ ...styles.filterField, flex: 1.2 }}>
            <span style={styles.filterLabel}>Busqueda</span>
            <input
              type="text"
              value={draftSearchText}
              onChange={(event) => setDraftSearchText(event.target.value)}
              placeholder="Cliente, proyecto, site o tarea..."
              style={styles.input}
            />
          </label>
          <label style={styles.filterField}>
            <span style={styles.filterLabel}>Tipo cambio USD</span>
            <input
              type="text"
              value={draftUsdExchangeRate}
              onChange={(event) => setDraftUsdExchangeRate(event.target.value)}
              style={styles.input}
            />
          </label>
          <label style={styles.filterField}>
            <span style={styles.filterLabel}>Tipo cambio DOP</span>
            <input
              type="text"
              value={draftDopExchangeRate}
              onChange={(event) => setDraftDopExchangeRate(event.target.value)}
              style={styles.input}
            />
          </label>
          <button type="button" style={styles.primaryButton} onClick={() => void handleApplyFilters()} disabled={loading}>
            Aplicar filtros
          </button>
          </div>
        </AppCard>
      ) : null}

      {error ? <AppStatusMessage tone="error">{error}</AppStatusMessage> : null}

      <div style={styles.kpiGrid}>
        {contractedSummaryCard ? (
          <div style={styles.kpiContractedGroup}>
            <button
              type="button"
              onClick={() =>
                setSelectedSummaryKpi((currentSelected) =>
                  currentSelected === contractedSummaryCard.label ? null : contractedSummaryCard.label,
                )
              }
              style={
                {
                  ...(contractedSummaryCard.tone === "blue"
                    ? styles.kpiCardPrimary
                    : contractedSummaryCard.tone === "green"
                      ? styles.kpiCardGreen
                      : contractedSummaryCard.tone === "orange"
                        ? styles.kpiCardOrange
                        : contractedSummaryCard.tone === "cream"
                          ? styles.kpiCardCream
                          : styles.kpiCard),
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  appearance: "none",
                  WebkitAppearance: "none",
                  outline: selectedSummaryKpi === contractedSummaryCard.label ? "2px solid rgba(37, 99, 235, 0.32)" : "none",
                  boxShadow:
                    selectedSummaryKpi === contractedSummaryCard.label
                      ? "0 0 0 1px rgba(37, 99, 235, 0.18), 0 18px 32px rgba(29, 78, 216, 0.16)"
                      : undefined,
                } as React.CSSProperties
              }
            >
              <div style={styles.kpiLabel}>{contractedSummaryCard.label}</div>
              <div style={styles.kpiValue}>{contractedSummaryCard.value}</div>
            </button>

            {stackedCurrencyCards.length > 0 ? (
              <div style={styles.kpiCurrencyStackCard}>
                {stackedCurrencyCards.map((item) => (
                  <div key={item.currency} style={styles.kpiCurrencyStackItem}>
                    <div style={styles.kpiCurrencyStackLabel}>{item.currency === "PEN" ? "Total PEN" : "Total DOP"}</div>
                    <div style={styles.kpiCurrencyStackValue}>{formatCurrencyKpiValue(item.total, item.currency)}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {otherSummaryCards.map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={() => setSelectedSummaryKpi(card.label)}
            style={
              {
                ...(card.tone === "blue"
                  ? styles.kpiCardPrimary
                  : card.tone === "green"
                    ? styles.kpiCardGreen
                    : card.tone === "orange"
                      ? styles.kpiCardOrange
                      : card.tone === "cream"
                        ? styles.kpiCardCream
                        : styles.kpiCard),
                cursor: "pointer",
                textAlign: "left",
                width: "100%",
                appearance: "none",
                WebkitAppearance: "none",
                outline: selectedSummaryKpi === card.label ? "2px solid rgba(37, 99, 235, 0.32)" : "none",
                boxShadow:
                  selectedSummaryKpi === card.label
                    ? "0 0 0 1px rgba(37, 99, 235, 0.18), 0 18px 32px rgba(29, 78, 216, 0.16)"
                    : undefined,
              } as React.CSSProperties
            }
          >
            <div style={styles.kpiLabel}>{card.label}</div>
            <div style={styles.kpiValue}>{card.value}</div>
          </button>
        ))}
        {showAppliedPeriodCard ? (
          <div style={styles.kpiPeriodCard}>
            <div style={styles.kpiPeriodLabel}>{appliedPeriodCard.label}</div>
            <div style={styles.kpiPeriodValue}>{appliedPeriodCard.value}</div>
          </div>
        ) : null}
      </div>

      <div style={styles.contentGrid}>
        <div style={styles.chartCard}>
          <div style={styles.sectionHeaderRow}>
            <div>
              <div style={styles.sectionTitle}>{getLevelTitle(currentLevel, path)}</div>
              {showCurrentLevelHeader ? <div style={styles.sectionSubtitle}>{getLevelDescription(currentLevel)}</div> : null}
            </div>
          </div>

          <div style={styles.breadcrumbRow}>
              <button
                type="button"
                style={path.cliente ? styles.breadcrumbButton : styles.breadcrumbButtonActive}
                onClick={() => handleBreadcrumbReset("all")}
              >
                Clientes
              </button>
              {path.cliente ? (
                <button
                  type="button"
                  style={path.proyecto ? styles.breadcrumbButton : styles.breadcrumbButtonActive}
                  onClick={() => handleBreadcrumbReset("cliente")}
                >
                  Proyectos
                </button>
              ) : null}
              {path.proyecto ? (
                <button
                  type="button"
                  style={path.site ? styles.breadcrumbButton : styles.breadcrumbButtonActive}
                  onClick={() => handleBreadcrumbReset("proyecto")}
                >
                  Sites
                </button>
              ) : null}
              {path.site ? <span style={styles.breadcrumbFinal}>{path.site}</span> : null}
          </div>

          <div style={styles.chartLayout}>
            <div style={styles.chartWrap}>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={sortedChartData}
                    dataKey="totalAmount"
                    nameKey="label"
                    innerRadius={56}
                    outerRadius={88}
                    paddingAngle={2}
                  >
                    {sortedChartData.map((item, index) => (
                      <Cell
                        key={`${item.label}-${index}`}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                        stroke="#FFFFFF"
                        strokeWidth={2}
                        cursor={currentLevel === "tarea" ? "default" : "pointer"}
                        onClick={() => handleChartClick(item)}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(Number(value ?? 0), "PEN")} />
                </PieChart>
              </ResponsiveContainer>
              <div style={styles.chartCenter}>
                  <div style={styles.chartCenterValue}>{formatCompactSoles(chartTotalConvertedToPen)}</div>
                <div style={styles.chartCenterLabel}>Total general</div>
              </div>
            </div>

            <div style={styles.legendList}>
              {sortedChartData.map((item, index) => {
                const itemPen = Object.entries(item.amountsByCurrency).reduce(
                  (accumulator, [currency, amount]) =>
                    accumulator + convertToPen(amount, currency, appliedUsdExchangeRate, appliedDopExchangeRate),
                  0,
                );
                const percent = chartTotalConvertedToPen > 0 ? (itemPen / chartTotalConvertedToPen) * 100 : 0;

                return (
                  <button
                    key={item.label}
                    type="button"
                    style={currentLevel === "tarea" ? styles.legendItemDisabled : styles.legendItem}
                    onClick={() => handleChartClick(item)}
                    disabled={currentLevel === "tarea"}
                  >
                    <div style={styles.legendNameWrap}>
                      <span style={{ ...styles.legendSwatch, backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                      <span style={styles.legendName}>{item.label}</span>
                    </div>
                    <div style={styles.legendValues}>
                      <span style={styles.legendAmount}>{formatCurrency(itemPen, "PEN")}</span>
                      <span style={styles.legendPercent}>{percent.toFixed(1)}%</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        <div style={styles.detailCard}>
          {showCurrentLevelHeader ? (
            <div style={styles.sectionHeaderRow}>
              <div>
                <div style={styles.sectionTitle}>Detalle del nivel actual</div>
                <div style={styles.recordsCountText}>Registros encontrados en el nivel actual: {sortedRows.length}</div>
              </div>
            </div>
          ) : null}

          <div style={styles.breakdownTableWrap}>
            <table style={styles.breakdownTable}>
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
                  {detailCurrencyColumns.map((currency) => (
                    <th key={currency} style={styles.sortableTh}>
                      <button
                        type="button"
                        style={styles.sortHeaderButton}
                        onClick={() => handleLevelSortClick(`currency:${currency}`)}
                      >
                        <span>{currency}</span>
                        {levelSortColumn === `currency:${currency}` ? (
                          <span style={styles.sortIndicator}>{levelSortDirection === "asc" ? "▲" : "▼"}</span>
                        ) : null}
                      </button>
                    </th>
                  ))}
                  <th style={{ ...styles.sortableTh, ...styles.breakdownHeaderSuccess }}>
                    <button type="button" style={{ ...styles.sortHeaderButton, ...styles.sortHeaderButtonAccent }} onClick={() => handleLevelSortClick("montoPen")}>
                      <span>Contratado</span>
                      {levelSortColumn === "montoPen" ? <span style={styles.sortIndicator}>{levelSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                    </button>
                  </th>
                  <th style={{ ...styles.sortableTh, ...styles.breakdownHeaderAccent }}>
                    <button type="button" style={{ ...styles.sortHeaderButton, ...styles.sortHeaderButtonAccent }} onClick={() => handleLevelSortClick("trabajoTerminado")}>
                      <span>Trabajo terminado</span>
                      {levelSortColumn === "trabajoTerminado" ? <span style={styles.sortIndicator}>{levelSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                    </button>
                  </th>
                  <th style={{ ...styles.sortableTh, ...styles.breakdownHeaderPercent }}>
                    <button type="button" style={styles.sortHeaderButton} onClick={() => handleLevelSortClick("avance")}>
                      <span>% Avance</span>
                      {levelSortColumn === "avance" ? <span style={styles.sortIndicator}>{levelSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedChartData.length === 0 ? (
                  <tr>
                    <td colSpan={5 + detailCurrencyColumns.length} style={styles.emptyCell}>
                      No hay datos para mostrar.
                    </td>
                  </tr>
                ) : (
                  sortedChartData.map((item) => {
                    const amountPen = Object.entries(item.amountsByCurrency).reduce(
                      (accumulator, [currency, amount]) =>
                        accumulator + convertToPen(amount, currency, appliedUsdExchangeRate, appliedDopExchangeRate),
                      0,
                    );

                    return (
                      <tr key={`detail-${item.label}`}>
                        <td style={styles.breakdownCellStrong}>{item.label}</td>
                        <td style={styles.breakdownCell}>{item.count}</td>
                        {detailCurrencyColumns.map((currency) => {
                          const currencyAmount = item.amountsByCurrency[currency] ?? 0;

                          return (
                            <td key={`${item.label}-${currency}`} style={styles.breakdownCell}>
                              {formatCurrencyKpiValue(currencyAmount, currency)}
                            </td>
                          );
                        })}
                        <td style={{ ...styles.breakdownCell, ...styles.breakdownCellAccent }}>{formatCurrency(amountPen, "PEN")}</td>
                        <td style={{ ...styles.breakdownCell, ...styles.breakdownCellSuccess }}>{formatCurrency(item.trabajoTerminadoPen ?? 0, "PEN")}</td>
                        <td style={{ ...styles.breakdownCell, ...styles.breakdownCellPercent }}>{formatPercent(getLevelAdvancePercent(item))}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <details style={styles.recordsCard}>
        <summary style={styles.recordsSummary}>
          <div style={styles.recordsSummaryTextWrap}>
            <div style={styles.recordsSummaryTitle}>Detalle de registros</div>
          </div>
          <div style={styles.recordsSummaryActions}>
            <div style={styles.recordsCountPill}>Registros existentes: {sortedRows.length}</div>
            <button type="button" style={styles.recordsExportButton} onClick={handleExportRecords} disabled={sortedRows.length === 0}>
              Exportar a Excel
            </button>
            <span style={styles.recordsSummaryChevron}>⌄</span>
          </div>
        </summary>

        <div style={styles.recordsBody}>
          <div style={styles.recordsTableWrap}>
              <table style={styles.recordsTable}>
                <thead>
                  <tr>
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
                      <button type="button" style={styles.sortHeaderButton} onClick={() => handleDetailSortClick("tipoTrabajo")}>
                        <span>Tipo Trabajo</span>
                        {detailSortColumn === "tipoTrabajo" ? <span style={styles.sortIndicator}>{detailSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                      </button>
                    </th>
                    <th style={styles.sortableTh}>
                      <button type="button" style={styles.sortHeaderButton} onClick={() => handleDetailSortClick("ot")}>
                        <span>OT</span>
                        {detailSortColumn === "ot" ? <span style={styles.sortIndicator}>{detailSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                      </button>
                    </th>
                    <th style={styles.sortableTh}>
                      <button type="button" style={styles.sortHeaderButton} onClick={() => handleDetailSortClick("mes")}>
                        <span>Mes</span>
                        {detailSortColumn === "mes" ? <span style={styles.sortIndicator}>{detailSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                      </button>
                    </th>
                    <th style={styles.sortableTh}>
                      <button type="button" style={styles.sortHeaderButton} onClick={() => handleDetailSortClick("ano")}>
                        <span>Año</span>
                        {detailSortColumn === "ano" ? <span style={styles.sortIndicator}>{detailSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                      </button>
                    </th>
                    <th style={styles.sortableTh}>
                      <button type="button" style={styles.sortHeaderButton} onClick={() => handleDetailSortClick("nroOc")}>
                        <span>Nro Oc</span>
                        {detailSortColumn === "nroOc" ? <span style={styles.sortIndicator}>{detailSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                      </button>
                    </th>
                    <th style={styles.sortableTh}>
                      <button type="button" style={styles.sortHeaderButton} onClick={() => handleDetailSortClick("montoBck")}>
                        <span>Monto BCK</span>
                        {detailSortColumn === "montoBck" ? <span style={styles.sortIndicator}>{detailSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                      </button>
                    </th>
                    <th style={styles.sortableTh}>
                      <button type="button" style={styles.sortHeaderButton} onClick={() => handleDetailSortClick("montoLiq")}>
                        <span>Monto Liq</span>
                        {detailSortColumn === "montoLiq" ? <span style={styles.sortIndicator}>{detailSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                      </button>
                    </th>
                    <th style={styles.sortableTh}>
                      <button type="button" style={styles.sortHeaderButton} onClick={() => handleDetailSortClick("statusPap")}>
                        <span>STATUS PAP</span>
                        {detailSortColumn === "statusPap" ? <span style={styles.sortIndicator}>{detailSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                      </button>
                    </th>
                    <th style={styles.sortableTh}>
                      <button type="button" style={styles.sortHeaderButton} onClick={() => handleDetailSortClick("statusCj")}>
                        <span>Status CJ</span>
                        {detailSortColumn === "statusCj" ? <span style={styles.sortIndicator}>{detailSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                      </button>
                    </th>
                    <th style={styles.sortableTh}>
                      <button type="button" style={styles.sortHeaderButton} onClick={() => handleDetailSortClick("anoGestion")}>
                        <span>Año Gestion</span>
                        {detailSortColumn === "anoGestion" ? <span style={styles.sortIndicator}>{detailSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                      </button>
                    </th>
                    <th style={styles.sortableTh}>
                      <button type="button" style={styles.sortHeaderButton} onClick={() => handleDetailSortClick("atp")}>
                        <span>ATP</span>
                        {detailSortColumn === "atp" ? <span style={styles.sortIndicator}>{detailSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                      </button>
                    </th>
                    <th style={styles.sortableTh}>
                      <button type="button" style={styles.sortHeaderButton} onClick={() => handleDetailSortClick("prePasivo")}>
                        <span>Pre Pasivo</span>
                        {detailSortColumn === "prePasivo" ? <span style={styles.sortIndicator}>{detailSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                      </button>
                    </th>
                    <th style={styles.sortableTh}>
                      <button type="button" style={styles.sortHeaderButton} onClick={() => handleDetailSortClick("proyecto2")}>
                        <span>Proyecto 2</span>
                        {detailSortColumn === "proyecto2" ? <span style={styles.sortIndicator}>{detailSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                      </button>
                    </th>
                    <th style={styles.sortableTh}>
                      <button type="button" style={styles.sortHeaderButton} onClick={() => handleDetailSortClick("gerencia")}>
                        <span>Gerencia</span>
                        {detailSortColumn === "gerencia" ? <span style={styles.sortIndicator}>{detailSortDirection === "asc" ? "▲" : "▼"}</span> : null}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.length === 0 ? (
                    <tr>
                      <td colSpan={17} style={styles.emptyCell}>
                        No hay registros para mostrar.
                      </td>
                    </tr>
                  ) : (
                    sortedRows.map((row, index) => (
                      <tr key={`${row.idCliente}-${row.correlativo}-${index}`}>
                        <td style={styles.recordsCell}>{row.nombreCliente}</td>
                        <td style={styles.recordsCell}>{row.nombreProyecto}</td>
                        <td style={styles.recordsCell}>{row.nombreSite}</td>
                        <td style={styles.recordsCell}>{row.tipoTrabajo}</td>
                        <td style={styles.recordsCell}>{row.ot || "-"}</td>
                        <td style={styles.recordsCell}>{row.mes || "-"}</td>
                        <td style={styles.recordsCell}>{row.ano || "-"}</td>
                        <td style={styles.recordsCell}>{row.nroOc || "-"}</td>
                        <td style={styles.recordsCellStrong}>{formatCurrency(row.montoBck, "PEN")}</td>
                        <td style={styles.recordsCellStrong}>{formatCurrency(row.montoLiq, "PEN")}</td>
                        <td style={styles.recordsCell}>{row.statusPap || "-"}</td>
                        <td style={styles.recordsCell}>{row.statusCj || "-"}</td>
                        <td style={styles.recordsCell}>{row.anoGestion || "-"}</td>
                        <td style={styles.recordsCell}>{row.atp || "-"}</td>
                        <td style={styles.recordsCell}>{row.prePasivo || "-"}</td>
                        <td style={styles.recordsCell}>{row.proyecto2 || "-"}</td>
                        <td style={styles.recordsCell}>{row.gerencia || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
          </div>
        </div>
      </details>
        </div>
      </div>
    </AppPage>
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
    background: "linear-gradient(180deg, #F8FAFF 0%, #F6F8FC 100%)",
  },
  mainContent: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  heroCard: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 6px 0",
  },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    background: "linear-gradient(135deg, #EEF2FF, #DBEAFE)",
    display: "grid",
    placeItems: "center",
    boxShadow: "0 6px 18px rgba(37, 99, 235, 0.12)",
  },
  heroIconBars: {
    display: "flex",
    gap: 3,
    alignItems: "flex-end",
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: 800,
    color: "#0F172A",
    lineHeight: 1.05,
  },
  heroSubtitle: {
    color: "#475569",
    fontSize: 13,
    marginTop: 2,
  },
  filterCard: {
    borderRadius: 20,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.05)",
    padding: 14,
  },
  compactCard: {
    marginBottom: 8,
    padding: 16,
  },
  filterGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr)) auto",
    gap: 10,
    alignItems: "end",
  },
  filterHeaderRow: {
    display: "flex",
    justifyContent: "flex-end",
    marginBottom: 10,
  },
  filterField: {
    display: "grid",
    gap: 4,
  },
  filterLabel: {
    color: "#334155",
    fontSize: 11,
    fontWeight: 700,
  },
  input: {
    width: "100%",
    minHeight: 42,
    borderRadius: 12,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    padding: "10px 12px",
    fontSize: 14,
    color: "#0F172A",
    boxSizing: "border-box",
  },
  primaryButton: {
    minHeight: 42,
    border: "none",
    borderRadius: 12,
    background: "linear-gradient(135deg, #2563EB, #0F172A)",
    color: "#FFFFFF",
    fontWeight: 700,
    padding: "0 18px",
    cursor: "pointer",
    boxShadow: "0 14px 24px rgba(37, 99, 235, 0.18)",
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 10,
  },
  kpiCard: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 18,
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    padding: 14,
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
  },
  kpiCardPrimary: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 18,
    background: "linear-gradient(135deg, #0F4BD9, #1D4ED8 60%, #2563EB)",
    color: "#FFFFFF",
    border: "1px solid rgba(255,255,255,0.1)",
    padding: 14,
    boxShadow: "0 18px 32px rgba(29, 78, 216, 0.18)",
  },
  kpiCardGreen: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 18,
    background: "#EAF8F1",
    border: "1px solid #A9E3C1",
    padding: 14,
    boxShadow: "0 10px 24px rgba(34, 197, 94, 0.08)",
  },
  kpiCardOrange: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 18,
    background: "#FFF6E8",
    border: "1px solid #F3C98B",
    padding: 14,
    boxShadow: "0 10px 24px rgba(245, 158, 11, 0.08)",
  },
  kpiCardCream: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 18,
    background: "#FFF7EA",
    border: "1px solid #F1D7A6",
    padding: 14,
    boxShadow: "0 10px 24px rgba(245, 158, 11, 0.06)",
  },
  kpiContractedGroup: {
    display: "grid",
    gridColumn: "span 2",
    gridTemplateColumns: "minmax(220px, 1.4fr) minmax(160px, 0.9fr)",
    gap: 10,
    alignItems: "stretch",
    minWidth: 0,
  },
  kpiCurrencyStackCard: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 18,
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    padding: 10,
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
    display: "grid",
    gap: 8,
    minWidth: 0,
  },
  kpiCurrencyStackItem: {
    borderRadius: 14,
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
    padding: "8px 10px",
    display: "grid",
    gap: 4,
  },
  kpiCurrencyStackLabel: {
    fontSize: 10,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#475569",
  },
  kpiCurrencyStackValue: {
    fontSize: 16,
    fontWeight: 900,
    color: "#0F172A",
    lineHeight: 1.05,
  },
  kpiPeriodCard: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 18,
    background: "#FFFFFF",
    border: "1px solid #D6E4FF",
    padding: 14,
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
    display: "grid",
    alignContent: "center",
    gap: 6,
  },
  kpiPeriodLabel: {
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#1D4ED8",
  },
  kpiPeriodValue: {
    fontSize: 18,
    fontWeight: 900,
    color: "#0F172A",
    lineHeight: 1.05,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "inherit",
    opacity: 0.95,
  },
  kpiValue: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: 900,
    color: "inherit",
    lineHeight: 1.05,
  },
  contentGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 0.78fr) minmax(0, 1.22fr)",
    gap: 10,
    alignItems: "start",
    minHeight: 0,
  },
  chartCard: {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    borderRadius: 18,
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)",
    padding: 10,
  },
  detailCard: {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    borderRadius: 18,
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)",
    padding: 16,
  },
  sectionHeaderRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: "#0F172A",
    lineHeight: 1.05,
  },
  sectionSubtitle: {
    marginTop: 6,
    color: "#475569",
    fontSize: 13,
  },
  recordsCountText: {
    marginTop: 6,
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: 700,
  },
  ghostButton: {
    minHeight: 40,
    borderRadius: 12,
    border: "1px solid #DBEAFE",
    background: "#EFF6FF",
    color: "#1D4ED8",
    fontWeight: 700,
    padding: "0 12px",
    cursor: "pointer",
  },
  chartLayout: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 0.72fr) minmax(0, 1.28fr)",
    gap: 10,
    alignItems: "center",
    minHeight: 0,
    flex: 1,
  },
  chartWrap: {
    position: "relative",
    minHeight: 180,
    display: "grid",
    placeItems: "center",
  },
  chartCenter: {
    position: "absolute",
    inset: "50% auto auto 50%",
    transform: "translate(-50%, -50%)",
    textAlign: "center",
    pointerEvents: "none",
  },
  chartCenterValue: {
    fontSize: 20,
    fontWeight: 900,
    color: "#0F172A",
  },
  chartCenterLabel: {
    marginTop: 4,
    fontSize: 11,
    color: "#64748B",
    fontWeight: 700,
  },
  legendList: {
    display: "grid",
    gap: 8,
    maxHeight: 190,
    overflowY: "auto",
    paddingRight: 4,
    scrollbarGutter: "stable",
  },
  legendRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "8px 10px",
    borderRadius: 14,
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
  },
  legendNameWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 999,
    flexShrink: 0,
  },
  legendName: {
    color: "#0F172A",
    fontWeight: 700,
    fontSize: 14,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  legendValues: {
    display: "grid",
    justifyItems: "end",
    gap: 2,
  },
  legendAmount: {
    color: "#0F172A",
    fontWeight: 800,
    fontSize: 14,
  },
  legendPercent: {
    color: "#64748B",
    fontSize: 12,
  },
  sortableTh: {
    position: "sticky",
    top: 0,
    background: "#FFFFFF",
    textAlign: "left",
    padding: 0,
    borderBottom: "1px solid #E2E8F0",
    color: "#475569",
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    zIndex: 1,
  },
  sortHeaderButton: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 10px",
    border: "none",
    background: "transparent",
    color: "inherit",
    font: "inherit",
    fontWeight: 800,
    cursor: "pointer",
  },
  sortHeaderButtonAccent: {
    color: "#0F172A",
    fontWeight: 900,
  },
  sortIndicator: {
    fontSize: 11,
    color: "#1D4ED8",
    flexShrink: 0,
  },
  periodBadge: {
    display: "none",
  },
  filterPeriodBadge: {
    minWidth: 200,
    borderRadius: 14,
    background: "#F8FAFF",
    border: "1px solid #DBEAFE",
    padding: "10px 12px",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.4)",
  },
  periodBadgeLabel: {
    color: "#1D4ED8",
    fontSize: 11,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  periodBadgeValue: {
    marginTop: 6,
    color: "#0F172A",
    fontSize: 14,
    fontWeight: 800,
  },
  breadcrumbHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  breadcrumbRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },
  breadcrumbButton: {
    borderRadius: 999,
    border: "1px solid #D5DDEA",
    background: "#FFFFFF",
    color: "#0F172A",
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
  levelTabs: {
    display: "flex",
    gap: 10,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  levelTab: {
    minHeight: 40,
    borderRadius: 10,
    border: "1px solid #D5DDEA",
    background: "#FFFFFF",
    color: "#0F172A",
    fontWeight: 700,
    padding: "0 16px",
    cursor: "pointer",
  },
  levelTabActive: {
    minHeight: 40,
    borderRadius: 10,
    border: "1px solid #1D4ED8",
    background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
    color: "#FFFFFF",
    fontWeight: 700,
    padding: "0 16px",
    cursor: "pointer",
    boxShadow: "0 10px 20px rgba(37, 99, 235, 0.18)",
  },
  breakdownTableWrap: {
    borderRadius: 16,
    border: "1px solid #E2E8F0",
    overflow: "auto",
    maxHeight: 340,
    minHeight: 0,
    scrollbarGutter: "stable",
  },
  breakdownTable: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 640,
    fontSize: 13,
  },
  breakdownHeader: {
    position: "sticky",
    top: 0,
    background: "#FFFFFF",
    textAlign: "left",
    padding: "10px 10px",
    borderBottom: "1px solid #E2E8F0",
    color: "#475569",
    fontSize: 10,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  breakdownHeaderAccent: {
    background: "linear-gradient(135deg, #DBEAFE, #BFDBFE 55%, #93C5FD)",
    color: "#0F172A",
  },
  breakdownHeaderSuccess: {
    background: "linear-gradient(135deg, #E8F8EE, #D2F2DE 55%, #B9EBC9)",
    color: "#0F172A",
  },
  breakdownCell: {
    padding: "10px",
    borderBottom: "1px solid #EEF2F7",
    color: "#0F172A",
  },
  breakdownCellStrong: {
    padding: "10px",
    borderBottom: "1px solid #EEF2F7",
    color: "#0F172A",
    fontWeight: 800,
  },
  breakdownCellAccent: {
    background: "linear-gradient(135deg, #DBEAFE, #BFDBFE 55%, #93C5FD)",
    color: "#0F172A",
  },
  breakdownCellSuccess: {
    background: "linear-gradient(135deg, #E8F8EE, #D2F2DE 55%, #B9EBC9)",
    color: "#0F172A",
  },
  breakdownHeaderPercent: {
    background: "linear-gradient(135deg, #FFF7E6, #FDECCB 55%, #F8DFA3)",
    color: "#0F172A",
  },
  breakdownCellPercent: {
    background: "linear-gradient(135deg, #FFF7E6, #FDECCB 55%, #F8DFA3)",
    color: "#0F172A",
    fontWeight: 700,
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    background: "#FFFFFF",
    padding: "6px 8px",
    cursor: "pointer",
    minWidth: 0,
  },
  legendItemDisabled: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    background: "#F8FAFC",
    padding: "6px 8px",
    cursor: "default",
    opacity: 0.75,
    minWidth: 0,
  },
  emptyCell: {
    padding: 20,
    textAlign: "center",
    color: "#64748B",
  },
  recordsCard: {
    borderRadius: 18,
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.05)",
    padding: 0,
    overflow: "hidden",
  },
  recordsSummary: {
    listStyle: "none",
    cursor: "pointer",
    padding: "10px 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  recordsSummaryTextWrap: {
    display: "grid",
    gap: 2,
    minWidth: 0,
    flex: 1,
  },
  recordsSummaryActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  recordsSummaryTitle: {
    fontSize: 14,
    fontWeight: 800,
    color: "#0F172A",
  },
  recordsSummarySubtitle: {
    marginTop: 0,
    color: "#64748B",
    fontSize: 11,
  },
  recordsSummaryChevron: {
    fontSize: 18,
    color: "#0F172A",
    lineHeight: 1,
  },
  recordsCountPill: {
    borderRadius: 999,
    border: "1px solid #BFDBFE",
    background: "#EFF6FF",
    color: "#1D4ED8",
    fontWeight: 700,
    padding: "6px 12px",
    lineHeight: 1,
    whiteSpace: "nowrap",
  },
  recordsExportButton: {
    minHeight: 34,
    borderRadius: 10,
    border: "1px solid #0F2F77",
    background: "linear-gradient(135deg, #1E40AF, #0F172A)",
    color: "#FFFFFF",
    fontWeight: 700,
    padding: "0 14px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: "0 8px 18px rgba(15, 23, 42, 0.14)",
  },
  recordsBody: {
    padding: "0 16px 16px",
  },
  recordsTableWrap: {
    borderRadius: 16,
    border: "1px solid #E2E8F0",
    overflow: "auto",
    maxHeight: 280,
    scrollbarGutter: "stable",
  },
  recordsTable: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 860,
  },
  recordsHeader: {
    position: "sticky",
    top: 0,
    background: "#F8FAFC",
    textAlign: "left",
    padding: "10px 8px",
    borderBottom: "1px solid #E2E8F0",
    color: "#475569",
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  recordsCell: {
    padding: "10px 8px",
    borderBottom: "1px solid #EEF2F7",
    color: "#0F172A",
  },
  recordsCellStrong: {
    padding: "10px 8px",
    borderBottom: "1px solid #EEF2F7",
    color: "#0F172A",
    fontWeight: 800,
  },
};
