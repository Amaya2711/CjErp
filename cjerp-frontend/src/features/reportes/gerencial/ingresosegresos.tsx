import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import * as XLSX from "xlsx";
import AppPage from "../../../components/base/AppPage";
import AppCard from "../../../components/base/AppCard";
import AppSectionHeader from "../../../components/base/AppSectionHeader";
import AppStatusMessage from "../../../components/base/AppStatusMessage";
import {
  consultarMovimientosGastosIngresos,
  type MovimientoConsultaRequest,
} from "../../../api/movimientosConsultaService";
import { getHttpErrorMessage } from "../../../utils/httpError";

type RawRow = Record<string, unknown>;

type MovimientoTipo = "Ingreso" | "Egreso" | "Sin tipo";

type MovimientoRow = {
  id: string;
  fechaRaw: string;
  fechaLabel: string;
  fechaSort: number;
  tipo: MovimientoTipo;
  cliente: string;
  proyecto: string;
  site: string;
  tipoTrabajo: string;
  categoria: string;
  moneda: string;
  monto: number;
  totalPagar: number;
  egresos: number;
  detalle: string;
  comentario: string;
  documento: string;
  nroOperacion: string;
  responsable: string;
  raw: RawRow;
};

type SortColumn = "fecha" | "tipo" | "cliente" | "proyecto" | "site" | "categoria" | "moneda" | "monto" | "montoPen";
type SortDirection = "asc" | "desc";

type PieDatum = {
  label: string;
  rawLabel: string;
  count: number;
  amount: number;
};

type TipoIgvMode = "sin-igv" | "con-igv";
type ReportTab = "principal" | "ingresos" | "egresos";
type ExpenseDrillLevel = "cliente" | "proyecto" | "site" | "tipoTrabajo";
type ExpenseDrillPath = {
  cliente: string | null;
  proyecto: string | null;
  site: string | null;
  tipoTrabajo: string | null;
};

const PIE_COLORS = ["#2563EB", "#14B8A6", "#22C55E", "#F59E0B", "#F97316", "#EF4444", "#A855F7", "#64748B"];
const INCOME_GREEN_COLORS = ["#22C55E", "#16A34A", "#15803D", "#4ADE80", "#86EFAC", "#BBF7D0", "#166534", "#0F766E"];
const EXPENSE_RED_COLORS = ["#DC2626", "#B91C1C", "#991B1B", "#EF4444", "#F87171", "#FCA5A5", "#7F1D1D", "#450A0A"];
const TYPE_COLORS: Record<string, string> = {
  Ingreso: "#22C55E",
  Egreso: "#DC2626",
  "Sin tipo": "#64748B",
};
const DEFAULT_EXCHANGE_RATES = {
  USD: 3.5,
  DOP: 0.058,
} as const;

function getYearStartInputValue() {
  const today = new Date();
  return `${today.getFullYear()}-01-01`;
}

function getTodayInputValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
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

function parseDateLike(value: string): { label: string; sortValue: number } {
  const text = String(value ?? "").trim();
  if (!text || text === "-") {
    return { label: "-", sortValue: 0 };
  }

  const ddmmyyyy = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    const parsed = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return Number.isFinite(parsed.getTime())
      ? { label: parsed.toLocaleDateString("es-PE"), sortValue: parsed.getTime() }
      : { label: text, sortValue: 0 };
  }

  const isoCandidate = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00` : text;
  const parsed = new Date(isoCandidate);
  if (Number.isFinite(parsed.getTime())) {
    return { label: parsed.toLocaleDateString("es-PE"), sortValue: parsed.getTime() };
  }

  return { label: text, sortValue: 0 };
}

function normalizeMonedaLabel(value: string) {
  const normalized = normalizeText(value);
  if (normalized.includes("USD") || normalized.includes("DOLAR")) return "USD";
  if (normalized.includes("DOP") || normalized.includes("PESO DOMINICANO") || normalized.includes("RD$")) return "DOP";
  if (normalized.includes("PEN") || normalized.includes("SOLES") || normalized.includes("S/")) return "PEN";
  return value.trim() || "Sin moneda";
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

function formatAmountByCurrency(value: number, currency: string) {
  return formatCurrency(value, currency === "PEN" || currency === "USD" || currency === "DOP" ? currency : "PEN");
}

function convertAmountToPen(value: number, currency: string, usdRate: number, dopRate: number) {
  if (!Number.isFinite(value)) return 0;

  switch (currency) {
    case "USD":
      return value * usdRate;
    case "DOP":
      return value * dopRate;
    default:
      return value;
  }
}

function parseExchangeRateInput(value: string) {
  const parsed = Number(value.replace(",", ".").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getRowValue(row: RawRow, keys: string[]) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return row[key];
    }
  }

  const normalizedEntries = Object.entries(row).map(([entryKey, entryValue]) => [
    normalizeText(entryKey).replace(/[\s_-]/g, ""),
    entryValue,
  ] as const);

  for (const key of keys) {
    const normalizedKey = normalizeText(key).replace(/[\s_-]/g, "");
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
  let firstParsed = 0;

  for (const key of keys) {
    const value = getRowValue(row, [key]);
    const parsed = toNumber(value);
    if (String(value ?? "").trim() !== "") {
      firstParsed = parsed;
    }

    if (parsed !== 0) {
      return parsed;
    }
  }

  return firstParsed;
}

function resolveTipoMovimiento(row: RawRow, montoIngreso: number, montoGasto: number, montoMovimiento: number, montoFirmado: number) {
  const raw = pickString(row, [
    "Tipo",
    "tipo",
    "TipoMovimiento",
    "tipoMovimiento",
    "Movimiento",
    "movimiento",
    "Naturaleza",
    "naturaleza",
    "IngresoEgreso",
    "ingresoEgreso",
    "Clasificacion",
    "clasificacion",
  ]);
  const normalized = normalizeText(raw);

  if (normalized.includes("INGRES")) return "Ingreso" as const;
  if (normalized.includes("EGRES") || normalized.includes("GAST") || normalized.includes("SALID") || normalized.includes("PAGO")) {
    return "Egreso" as const;
  }

  if (montoIngreso > 0 && montoIngreso >= montoGasto) return "Ingreso" as const;
  if (montoGasto > 0 && montoGasto >= montoIngreso) return "Egreso" as const;
  if (montoMovimiento > 0 && montoFirmado < 0) return "Egreso" as const;
  if (montoMovimiento > 0) return "Ingreso" as const;
  if (montoFirmado < 0) return "Egreso" as const;
  if (montoFirmado > 0) return "Ingreso" as const;
  return "Sin tipo" as const;
}

function resolveMonedaCode(row: RawRow) {
  const raw = pickString(row, ["Moneda", "moneda", "MonedaLabel", "monedaLabel", "TipoMoneda", "tipoMoneda"]);
  const normalized = normalizeMonedaLabel(raw);

  if (normalized === "PEN" || normalized === "USD" || normalized === "DOP") {
    return normalized;
  }

  const idMoneda = pickNumber(row, ["IdMoneda", "idMoneda", "idmoneda"]);
  if (idMoneda === 1) return "PEN";
  if (idMoneda === 2) return "USD";
  if (idMoneda === 3 || idMoneda === 4) return "DOP";

  return normalized;
}

function buildMovimientoRow(row: RawRow): MovimientoRow {
  const fechaRaw = pickString(row, [
    "Fecha",
    "fecha",
    "FechaMovimiento",
    "fechaMovimiento",
    "FechaIngreso",
    "fechaIngreso",
    "FecIngreso",
    "fecIngreso",
    "FecMovimiento",
    "fecMovimiento",
    "FecDeposito",
    "fecDeposito",
  ]);
  const fechaParsed = parseDateLike(fechaRaw);
  const montoIngreso = toNumber(getRowValue(row, ["MontoIngreso", "montoIngreso", "MontoLiq", "montoLiq"]));
  const totalPagar = toNumber(getRowValue(row, ["TotalPagar", "totalPagar", "MontoGasto", "montoGasto", "Total", "total"]));
  const montoGasto = toNumber(getRowValue(row, ["Subtotal", "subtotal", "MontoGasto", "montoGasto", "Total", "total"]));
  const montoMovimiento = toNumber(getRowValue(row, ["MontoMovimiento", "montoMovimiento", "Importe", "importe", "Valor", "valor"]));
  const montoFirmado = toNumber(getRowValue(row, ["MontoFirmado", "montoFirmado", "Debe", "debe", "Haber", "haber"]));
  const monto = Math.max(Math.abs(montoIngreso), Math.abs(montoGasto), Math.abs(montoMovimiento), Math.abs(montoFirmado), 0);
  const tipo = resolveTipoMovimiento(row, montoIngreso, montoGasto, montoMovimiento, montoFirmado);

  return {
    id: pickString(row, ["Id", "id", "IdOrigen", "idOrigen", "Correlativo", "correlativo", "Nro", "nro", "Documento", "documento", "Referencia", "referencia"]) || "-",
    fechaRaw: fechaRaw || "-",
    fechaLabel: fechaParsed.label,
    fechaSort: fechaParsed.sortValue,
    tipo,
    cliente: pickString(row, ["Cliente", "cliente", "NombreCliente", "nombreCliente"]) || "Sin cliente",
    proyecto: pickString(row, ["Proyecto", "proyecto", "NombreProyecto", "nombreProyecto"]) || "Sin proyecto",
    site: pickString(row, ["Site", "site", "NombreSite", "nombreSite", "siteNombre"]) || "Sin site",
    tipoTrabajo:
      pickString(row, [
        "TipoTrabajo",
        "tipoTrabajo",
        "Tipo de trabajo",
        "Tipo_Trabajo",
        "TipoTrabajoNombre",
        "tipoTrabajoNombre",
      ]) || "Sin tipo de trabajo",
    categoria: pickString(row, ["Categoria", "categoria", "Concepto", "concepto", "Cuenta", "cuenta", "Glosa", "glosa", "TipoTrabajo", "tipoTrabajo"]) || "Sin categoria",
    moneda: resolveMonedaCode(row),
    monto,
    totalPagar,
    egresos: montoGasto,
    detalle: pickString(row, ["Detalle", "detalle", "Descripcion", "descripcion", "Observacion", "observacion"]) || "-",
    comentario: pickString(row, ["Comentario", "comentario", "Nota", "nota"]) || "-",
    documento: pickString(row, ["Documento", "documento", "Voucher", "voucher", "Serie", "serie", "Numero", "numero"]) || "-",
    nroOperacion:
      pickString(row, [
        "NroOperacion",
        "nroOperacion",
        "Nro Operacion",
        "nro operacion",
        "NumeroOperacion",
        "numeroOperacion",
      ]) || "-",
    responsable: pickString(row, ["Responsable", "responsable", "Usuario", "usuario", "CreadoPor", "creadoPor", "Solicitante", "solicitante"]) || "-",
    raw: row,
  };
}

function buildBreakdown(
  rows: MovimientoRow[],
  accessor: (row: MovimientoRow) => string,
  amountAccessor: (row: MovimientoRow) => number = (row) => row.monto,
): PieDatum[] {
  const map = new Map<string, PieDatum>();

  for (const row of rows) {
    const rawLabel = accessor(row) || "Sin dato";
    const amount = amountAccessor(row);
    const current = map.get(rawLabel);
    if (current) {
      current.count += 1;
      current.amount += amount;
      continue;
    }

    map.set(rawLabel, {
      rawLabel,
      label: rawLabel,
      count: 1,
      amount,
    });
  }

  return Array.from(map.values()).sort((a, b) => b.amount - a.amount || b.count - a.count);
}

function resolveIgvBaseAmount(row: MovimientoRow, mode: TipoIgvMode) {
  const subtotalAmount = row.egresos > 0 ? row.egresos : row.monto;
  const totalPagarAmount = row.totalPagar > 0 ? row.totalPagar : row.monto;

  return mode === "con-igv" ? totalPagarAmount : subtotalAmount;
}

function matchesExpenseDrillPath(row: MovimientoRow, path: ExpenseDrillPath) {
  return (
    (!path.cliente || row.cliente === path.cliente) &&
    (!path.proyecto || row.proyecto === path.proyecto) &&
    (!path.site || row.site === path.site) &&
    (!path.tipoTrabajo || row.tipoTrabajo === path.tipoTrabajo)
  );
}

function getExpenseDrillLevel(path: ExpenseDrillPath): ExpenseDrillLevel {
  if (!path.cliente) return "cliente";
  if (!path.proyecto) return "proyecto";
  if (!path.site) return "site";
  return "tipoTrabajo";
}

function getExpenseLevelTitle(level: ExpenseDrillLevel, path: ExpenseDrillPath) {
  switch (level) {
    case "cliente":
      return "Gastos por cliente";
    case "proyecto":
      return `Proyectos de ${path.cliente}`;
    case "site":
      return `Sites de ${path.proyecto}`;
    case "tipoTrabajo":
      return `Tipos de trabajo de ${path.site}`;
    default:
      return "Gastos";
  }
}

function getExpenseLevelDescription(level: ExpenseDrillLevel) {
  switch (level) {
    case "cliente":
      return "Selecciona un cliente para ver el siguiente nivel.";
    case "proyecto":
      return "Haz clic en un proyecto para ver sus sites.";
    case "site":
      return "Haz clic en un site para revisar sus tipos de trabajo.";
    case "tipoTrabajo":
      return "Detalle final por tipo de trabajo dentro del site seleccionado.";
    default:
      return "";
  }
}

function getNextExpensePath(level: ExpenseDrillLevel, path: ExpenseDrillPath, label: string): ExpenseDrillPath {
  if (level === "cliente") {
    return { cliente: label, proyecto: null, site: null, tipoTrabajo: null };
  }
  if (level === "proyecto") {
    return { cliente: path.cliente, proyecto: label, site: null, tipoTrabajo: null };
  }
  if (level === "site") {
    return { cliente: path.cliente, proyecto: path.proyecto, site: label, tipoTrabajo: null };
  }
  return { cliente: path.cliente, proyecto: path.proyecto, site: path.site, tipoTrabajo: label };
}

function getExpensePathBreadcrumb(path: ExpenseDrillPath) {
  return [path.cliente, path.proyecto, path.site, path.tipoTrabajo].filter(Boolean).join(" / ");
}

function getMonthTitle(dateText: string) {
  const parsed = new Date(`${dateText}T00:00:00`);
  if (!Number.isFinite(parsed.getTime())) {
    return dateText;
  }

  return parsed.toLocaleDateString("es-PE", { month: "long", year: "numeric" });
}

function formatExportNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function formatCompactSoles(value: number) {
  const absolute = Math.abs(value);
  if (!Number.isFinite(value) || absolute === 0) return "S/ 0";
  if (absolute >= 1_000_000) return `S/ ${(value / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `S/ ${(value / 1_000).toFixed(1)}K`;
  return formatCurrency(value, "PEN");
}

function formatPercentage(value: number) {
  if (!Number.isFinite(value)) return "0.0%";
  return `${value.toFixed(1)}%`;
}

export default function IngresosEgresosPage() {
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draftFechaInicio, setDraftFechaInicio] = useState(getYearStartInputValue());
  const [draftFechaFin, setDraftFechaFin] = useState(getTodayInputValue());
  const [draftSearchText, setDraftSearchText] = useState("");
  const [draftUsdExchangeRate, setDraftUsdExchangeRate] = useState(String(DEFAULT_EXCHANGE_RATES.USD));
  const [draftDopExchangeRate, setDraftDopExchangeRate] = useState(String(DEFAULT_EXCHANGE_RATES.DOP));
  const [appliedFechaInicio, setAppliedFechaInicio] = useState(getYearStartInputValue());
  const [appliedFechaFin, setAppliedFechaFin] = useState(getTodayInputValue());
  const [appliedSearchText, setAppliedSearchText] = useState("");
  const [appliedUsdExchangeRate, setAppliedUsdExchangeRate] = useState<number>(DEFAULT_EXCHANGE_RATES.USD);
  const [appliedDopExchangeRate, setAppliedDopExchangeRate] = useState<number>(DEFAULT_EXCHANGE_RATES.DOP);
  const [sortColumn, setSortColumn] = useState<SortColumn>("fecha");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [isDetailControllerCollapsed, setIsDetailControllerCollapsed] = useState(true);
  const [detailPage, setDetailPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState(50);
  const [loadProgress, setLoadProgress] = useState(0);
  const [tipoIgvMode, setTipoIgvMode] = useState<TipoIgvMode>("sin-igv");
  const [activeTab, setActiveTab] = useState<ReportTab>("principal");
  const [selectedExpenseDetailLevel, setSelectedExpenseDetailLevel] = useState<ExpenseDrillLevel | null>(null);
  const [selectedExpenseDetailLabel, setSelectedExpenseDetailLabel] = useState<string | null>(null);
  const [expenseDetailPage, setExpenseDetailPage] = useState(1);
  const [expenseDetailPageSize, setExpenseDetailPageSize] = useState(25);
  const [isExpenseDetailCollapsed, setIsExpenseDetailCollapsed] = useState(true);
  const [egresoDrillPath, setEgresoDrillPath] = useState<ExpenseDrillPath>({
    cliente: null,
    proyecto: null,
    site: null,
    tipoTrabajo: null,
  });
  const isMountedRef = useRef(true);
  const loadProgressTickerRef = useRef<number | null>(null);
  const loadProgressStartedAtRef = useRef<number>(0);

  const loadRows = async (overrides?: { fechaInicio?: string; fechaFin?: string; searchText?: string }) => {
    const fechaInicio = overrides?.fechaInicio ?? draftFechaInicio;
    const fechaFin = overrides?.fechaFin ?? draftFechaFin;
    const searchText = overrides?.searchText ?? draftSearchText;

    const request: MovimientoConsultaRequest = {
      consulta: "movimientos-gastos-ingresos",
      parametros: [
        { nombre: "FechaInicio", valor: fechaInicio, tipo: "date" },
        { nombre: "FechaFin", valor: fechaFin, tipo: "date" },
      ],
    };

    const textoBusqueda = searchText.trim();
    if (textoBusqueda) {
      request.parametros.push({ nombre: "TextoBusqueda", valor: textoBusqueda, tipo: "string" });
    }

    setLoading(true);
    setLoadProgress((current) => (current === 0 ? 8 : current));
    loadProgressStartedAtRef.current = Date.now();
    setError("");

    try {
      const response = await consultarMovimientosGastosIngresos(request, { timeoutMs: 120000 });

      if (!isMountedRef.current) return;

      if (response.limitExceeded) {
        setRawRows([]);
        setError(response.message?.trim() || "La consulta excedio el maximo permitido para la visualizacion de ingresos y egresos.");
        return;
      }

      setAppliedFechaInicio(fechaInicio);
      setAppliedFechaFin(fechaFin);
      setAppliedSearchText(textoBusqueda);
      setAppliedUsdExchangeRate(parseExchangeRateInput(draftUsdExchangeRate) ?? DEFAULT_EXCHANGE_RATES.USD);
      setAppliedDopExchangeRate(parseExchangeRateInput(draftDopExchangeRate) ?? DEFAULT_EXCHANGE_RATES.DOP);
      setRawRows(Array.isArray(response.rows) ? response.rows : []);
      setSortColumn("fecha");
      setSortDirection("desc");
    } catch (err) {
      if (!isMountedRef.current) return;
      setRawRows([]);
      setError(getHttpErrorMessage(err, "No se pudo cargar el dashboard de ingresos y egresos desde sp_Movimientos_Consulta_GastosIngresos."));
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!loading) {
      if (loadProgressTickerRef.current !== null) {
        window.clearInterval(loadProgressTickerRef.current);
        loadProgressTickerRef.current = null;
      }
      return undefined;
    }

    if (loadProgressTickerRef.current !== null) {
      window.clearInterval(loadProgressTickerRef.current);
      loadProgressTickerRef.current = null;
    }

    loadProgressTickerRef.current = window.setInterval(() => {
      const elapsedMs = Date.now() - loadProgressStartedAtRef.current;
      const target = elapsedMs < 1000 ? 45 : elapsedMs < 3000 ? 75 : 92;

      setLoadProgress((current) => {
        if (current >= target) {
          return current;
        }

        const step = elapsedMs < 1000 ? 6 : elapsedMs < 3000 ? 4 : 2;
        return Math.min(current + step, target);
      });
    }, 140);

    return () => {
      if (loadProgressTickerRef.current !== null) {
        window.clearInterval(loadProgressTickerRef.current);
        loadProgressTickerRef.current = null;
      }
    };
  }, [loading]);

  useEffect(() => {
    if (loading || loadProgress === 0) {
      return undefined;
    }

    const resetTimer = window.setTimeout(() => setLoadProgress(0), 360);
    return () => window.clearTimeout(resetTimer);
  }, [loading, loadProgress]);

  useEffect(() => {
    isMountedRef.current = true;
    void loadRows();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const storeRows = useMemo(() => rawRows.map((row) => buildMovimientoRow(row)), [rawRows]);
  const filteredRows = useMemo(() => {
    const searchText = normalizeText(appliedSearchText);
    const fromDate = appliedFechaInicio ? new Date(`${appliedFechaInicio}T00:00:00`).getTime() : 0;
    const toDate = appliedFechaFin ? new Date(`${appliedFechaFin}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;
    const fromYear = appliedFechaInicio ? new Date(`${appliedFechaInicio}T00:00:00`).getFullYear() : null;
    const toYear = appliedFechaFin ? new Date(`${appliedFechaFin}T00:00:00`).getFullYear() : null;

    return storeRows.filter((row) => {
      if (row.tipo === "Ingreso") {
        if (row.fechaSort) {
          const rowYear = new Date(row.fechaSort).getFullYear();
          if (fromYear !== null && rowYear < fromYear) return false;
          if (toYear !== null && rowYear > toYear) return false;
        }
      } else {
        if (row.fechaSort && row.fechaSort < fromDate) return false;
        if (row.fechaSort && row.fechaSort > toDate) return false;
      }

      if (searchText) {
        const haystack = normalizeText(
          [
            row.id,
            row.fechaRaw,
            row.fechaLabel,
            row.tipo,
            row.cliente,
            row.proyecto,
            row.site,
            row.categoria,
            row.moneda,
            String(row.monto),
            row.detalle,
            row.comentario,
            row.documento,
            row.nroOperacion,
            row.responsable,
          ].join(" "),
        );

        if (!haystack.includes(searchText)) {
          return false;
        }
      }

      return true;
    });
  }, [appliedFechaFin, appliedFechaInicio, appliedSearchText, storeRows]);
  const summaryRows = filteredRows;

  const sortedRows = useMemo(() => {
    const factor = sortDirection === "asc" ? 1 : -1;
    return [...filteredRows].sort((left, right) => {
      switch (sortColumn) {
        case "fecha":
          return (left.fechaSort - right.fechaSort) * factor;
      case "monto":
        return (left.monto - right.monto) * factor;
      case "montoPen":
        return (
          convertAmountToPen(left.monto, left.moneda, appliedUsdExchangeRate, appliedDopExchangeRate) -
          convertAmountToPen(right.monto, right.moneda, appliedUsdExchangeRate, appliedDopExchangeRate)
        ) * factor;
      default:
        return String(left[sortColumn]).localeCompare(String(right[sortColumn]), "es", { sensitivity: "base" }) * factor;
    }
  });
  }, [appliedDopExchangeRate, appliedUsdExchangeRate, filteredRows, sortColumn, sortDirection]);
  const totalDetailPages = useMemo(() => Math.max(1, Math.ceil(sortedRows.length / detailPageSize)), [detailPageSize, sortedRows.length]);
  const visibleDetailRows = useMemo(() => {
    const startIndex = (detailPage - 1) * detailPageSize;
    return sortedRows.slice(startIndex, startIndex + detailPageSize);
  }, [detailPage, detailPageSize, sortedRows]);

  useEffect(() => {
    setDetailPage((current) => Math.min(Math.max(1, current), totalDetailPages));
  }, [totalDetailPages]);

  const totalIngresos = useMemo(
    () =>
      summaryRows
        .filter((row) => row.tipo === "Ingreso")
        .reduce((sum, row) => sum + convertAmountToPen(row.monto, row.moneda, appliedUsdExchangeRate, appliedDopExchangeRate), 0),
    [appliedDopExchangeRate, appliedUsdExchangeRate, summaryRows],
  );
  const totalEgresos = useMemo(
    () =>
      summaryRows
        .filter((row) => row.tipo === "Egreso")
        .reduce((sum, row) => sum + convertAmountToPen(resolveIgvBaseAmount(row, tipoIgvMode), row.moneda, appliedUsdExchangeRate, appliedDopExchangeRate), 0),
    [appliedDopExchangeRate, appliedUsdExchangeRate, summaryRows, tipoIgvMode],
  );
  const saldo = totalIngresos - totalEgresos;
  const saldoPercentage = totalIngresos > 0 ? (() => {
    const percentage = (totalEgresos / totalIngresos) * 100;
    return percentage > 100 ? percentage - 100 : percentage;
  })() : 0;
  const saldoPercentageWithSign = saldo < 0 ? -saldoPercentage : saldoPercentage;
  const ingresoRows = useMemo(() => summaryRows.filter((row) => row.tipo === "Ingreso"), [summaryRows]);
  const egresoRows = useMemo(() => summaryRows.filter((row) => row.tipo === "Egreso"), [summaryRows]);
  const visibleIncomeRows = useMemo(() => ingresoRows.slice(0, 50), [ingresoRows]);
  const egresoDrillLevel = useMemo(() => getExpenseDrillLevel(egresoDrillPath), [egresoDrillPath]);
  const egresoDrillRows = useMemo(
    () => egresoRows.filter((row) => matchesExpenseDrillPath(row, egresoDrillPath)),
    [egresoDrillPath, egresoRows],
  );
  const expenseDetailFilteredRows = useMemo(() => {
    if (!selectedExpenseDetailLabel) {
      return egresoDrillRows;
    }

    const selectedLabel = normalizeText(selectedExpenseDetailLabel);
    const selectedLevel = selectedExpenseDetailLevel ?? egresoDrillLevel;

    switch (selectedLevel) {
      case "cliente":
        return egresoDrillRows.filter((row) => normalizeText(row.cliente) === selectedLabel);
      case "proyecto":
        return egresoDrillRows.filter((row) => normalizeText(row.proyecto) === selectedLabel);
      case "site":
        return egresoDrillRows.filter((row) => normalizeText(row.site) === selectedLabel);
      case "tipoTrabajo":
        return egresoDrillRows.filter((row) => normalizeText(row.tipoTrabajo) === selectedLabel);
      default:
        return egresoDrillRows;
    }
  }, [egresoDrillLevel, egresoDrillRows, selectedExpenseDetailLabel, selectedExpenseDetailLevel]);
  const totalExpenseDetailPages = Math.max(1, Math.ceil(expenseDetailFilteredRows.length / expenseDetailPageSize));
  const visibleExpenseDetailRows = useMemo(() => {
    const startIndex = (expenseDetailPage - 1) * expenseDetailPageSize;
    return expenseDetailFilteredRows.slice(startIndex, startIndex + expenseDetailPageSize);
  }, [expenseDetailFilteredRows, expenseDetailPage, expenseDetailPageSize]);
  const egresoDrillBreakdown = useMemo(() => {
    const accessor =
      egresoDrillLevel === "cliente"
        ? (row: MovimientoRow) => row.cliente
        : egresoDrillLevel === "proyecto"
          ? (row: MovimientoRow) => row.proyecto
          : egresoDrillLevel === "site"
            ? (row: MovimientoRow) => row.site
            : (row: MovimientoRow) => row.tipoTrabajo;

    return buildBreakdown(egresoDrillRows, accessor, (row) =>
      convertAmountToPen(resolveIgvBaseAmount(row, tipoIgvMode), row.moneda, appliedUsdExchangeRate, appliedDopExchangeRate),
    );
  }, [appliedDopExchangeRate, appliedUsdExchangeRate, egresoDrillLevel, egresoDrillRows, tipoIgvMode]);
  const egresoDrillCurrencyColumns = useMemo(() => {
    const currencyOrder = ["PEN", "USD", "DOP"];
    const seen = new Set<string>();

    for (const row of egresoDrillRows) {
      const currency = row.moneda || "PEN";
      seen.add(currency);
    }

    return Array.from(seen).sort((a, b) => {
      const orderA = currencyOrder.indexOf(a);
      const orderB = currencyOrder.indexOf(b);
      if (orderA !== -1 || orderB !== -1) {
        return (orderA === -1 ? currencyOrder.length : orderA) - (orderB === -1 ? currencyOrder.length : orderB);
      }
      return a.localeCompare(b);
    });
  }, [egresoDrillRows]);
  const egresoDrillCurrencyAmountsByLabel = useMemo(() => {
    const accessor =
      egresoDrillLevel === "cliente"
        ? (row: MovimientoRow) => row.cliente
        : egresoDrillLevel === "proyecto"
          ? (row: MovimientoRow) => row.proyecto
          : egresoDrillLevel === "site"
            ? (row: MovimientoRow) => row.site
            : (row: MovimientoRow) => row.tipoTrabajo;

    const groupedAmounts = new Map<string, Map<string, number>>();

    for (const row of egresoDrillRows) {
      const rawLabel = accessor(row) || "Sin dato";
      const currency = row.moneda || "PEN";
      const baseAmount = resolveIgvBaseAmount(row, tipoIgvMode);
      const currentCurrencyGroup = groupedAmounts.get(rawLabel) ?? new Map<string, number>();
      currentCurrencyGroup.set(currency, (currentCurrencyGroup.get(currency) ?? 0) + baseAmount);
      groupedAmounts.set(rawLabel, currentCurrencyGroup);
    }

    const formattedAmounts = new Map<string, Map<string, number>>();

    for (const [label, currencyGroup] of groupedAmounts.entries()) {
      formattedAmounts.set(label, currencyGroup);
    }

    return formattedAmounts;
  }, [egresoDrillLevel, egresoDrillRows, tipoIgvMode]);
  const egresoDrillPenTotal = useMemo(
    () =>
      egresoDrillRows.reduce(
        (sum, row) =>
          sum + convertAmountToPen(resolveIgvBaseAmount(row, tipoIgvMode), row.moneda, appliedUsdExchangeRate, appliedDopExchangeRate),
        0,
      ),
    [appliedDopExchangeRate, appliedUsdExchangeRate, egresoDrillRows, tipoIgvMode],
  );
  const egresoDrillBreadcrumb = useMemo(() => getExpensePathBreadcrumb(egresoDrillPath), [egresoDrillPath]);

  useEffect(() => {
    setExpenseDetailPage((current) => Math.min(Math.max(1, current), totalExpenseDetailPages));
  }, [totalExpenseDetailPages]);

  useEffect(() => {
    setExpenseDetailPage(1);
  }, [egresoDrillPath, selectedExpenseDetailLabel, selectedExpenseDetailLevel]);

  const breakdownByType = useMemo(
    () =>
      buildBreakdown(summaryRows, (row) => row.tipo, (row) => {
        const amountBase = tipoIgvMode === "con-igv" ? (row.totalPagar > 0 ? row.totalPagar : row.monto) : row.monto;
        return convertAmountToPen(amountBase, row.moneda, appliedUsdExchangeRate, appliedDopExchangeRate);
      }),
    [appliedDopExchangeRate, appliedUsdExchangeRate, summaryRows, tipoIgvMode],
  );
  const typeTotalIngresos = useMemo(
    () =>
      summaryRows
        .filter((row) => row.tipo === "Ingreso")
        .reduce((sum, row) => sum + convertAmountToPen(resolveIgvBaseAmount(row, tipoIgvMode), row.moneda, appliedUsdExchangeRate, appliedDopExchangeRate), 0),
    [appliedDopExchangeRate, appliedUsdExchangeRate, summaryRows, tipoIgvMode],
  );
  const typeTotalEgresos = useMemo(
    () =>
      summaryRows
        .filter((row) => row.tipo === "Egreso")
        .reduce((sum, row) => sum + convertAmountToPen(resolveIgvBaseAmount(row, tipoIgvMode), row.moneda, appliedUsdExchangeRate, appliedDopExchangeRate), 0),
    [appliedDopExchangeRate, appliedUsdExchangeRate, summaryRows, tipoIgvMode],
  );
  const typeSaldo = typeTotalIngresos - typeTotalEgresos;
  const typeEgresoPercentageBase = typeTotalIngresos > 0 ? (typeTotalEgresos / typeTotalIngresos) * 100 : 0;
  const typeEgresoPercentage = typeEgresoPercentageBase > 100 ? typeEgresoPercentageBase - 100 : typeEgresoPercentageBase;
  const typeIngresoPercentage = 100 - typeEgresoPercentage;
  const currencyAmountLabel = tipoIgvMode === "con-igv" ? "TotalPagar" : "Monto";
  const currencyPenLabel = tipoIgvMode === "con-igv" ? "TotalPagar en PEN" : "Monto en PEN";
  const breakdownByCurrency = useMemo(
    () => buildBreakdown(ingresoRows, (row) => row.moneda, (row) => resolveIgvBaseAmount(row, tipoIgvMode)),
    [ingresoRows, tipoIgvMode],
  );
  const breakdownByCurrencyEgresos = useMemo(
    () => buildBreakdown(egresoRows, (row) => row.moneda, (row) => resolveIgvBaseAmount(row, tipoIgvMode)),
    [egresoRows, tipoIgvMode],
  );
  const currencyIncomePenTotal = useMemo(
    () => breakdownByCurrency.reduce((sum, item) => sum + convertAmountToPen(item.amount, item.rawLabel, appliedUsdExchangeRate, appliedDopExchangeRate), 0),
    [appliedDopExchangeRate, appliedUsdExchangeRate, breakdownByCurrency],
  );
  const currencyEgresoPenTotal = useMemo(
    () => breakdownByCurrencyEgresos.reduce((sum, item) => sum + convertAmountToPen(item.amount, item.rawLabel, appliedUsdExchangeRate, appliedDopExchangeRate), 0),
    [appliedDopExchangeRate, appliedUsdExchangeRate, breakdownByCurrencyEgresos],
  );

  const kpiCards = [
    {
      label: "Movimientos",
      value: filteredRows.length,
      helper: `${appliedFechaInicio} a ${appliedFechaFin}`,
    },
    {
      label: "Ingresos",
      value: formatCurrency(totalIngresos, "PEN"),
      helper: "Total acumulado",
    },
    {
      label: "Egresos",
      value: formatCurrency(totalEgresos, "PEN"),
      helper: "Total acumulado",
    },
    {
      label: "Saldo",
      value: formatCurrency(saldo, "PEN"),
      helper: "Ingresos menos egresos",
    },
  ];

  const handleApplyFilters = () => {
    setDetailPage(1);
    void loadRows({
      fechaInicio: draftFechaInicio,
      fechaFin: draftFechaFin,
      searchText: draftSearchText,
    });
  };

  const handleExport = () => {
    const rowsToExport = sortedRows.map((row) => ({
      Id: row.id,
      Fecha: row.fechaLabel,
      Tipo: row.tipo,
      Cliente: row.cliente,
      Proyecto: row.proyecto,
      Site: row.site,
      Categoria: row.categoria,
      Moneda: row.moneda,
      Monto: formatExportNumber(row.monto),
      EGRESOS: formatExportNumber(row.tipo === "Egreso" ? row.egresos : 0),
      "Monto en PEN": formatExportNumber(
        convertAmountToPen(row.tipo === "Egreso" ? row.egresos : row.monto, row.moneda, appliedUsdExchangeRate, appliedDopExchangeRate),
      ),
      Detalle: row.detalle,
      Comentario: row.comentario,
      Documento: row.documento,
      NroOperacion: row.nroOperacion,
      Responsable: row.responsable,
    }));

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rowsToExport);
    XLSX.utils.book_append_sheet(workbook, sheet, "IngresosEgresos");
    XLSX.writeFile(workbook, "ingresos_egresos.xlsx");
  };

  const actions = (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <button style={styles.secondaryButton} type="button" onClick={handleApplyFilters} disabled={loading}>
        {loading ? "Cargando..." : "Aplicar filtros"}
      </button>
      <button style={styles.primaryButton} type="button" onClick={handleExport} disabled={!sortedRows.length}>
        Exportar Excel
      </button>
    </div>
  );

  return (
    <AppPage
      fillHeight
      style={{
        background:
          "radial-gradient(circle at top left, rgba(37,99,235,0.12), transparent 32%), radial-gradient(circle at top right, rgba(20,184,166,0.12), transparent 28%), linear-gradient(180deg, #F8FAFC 0%, #EEF2FF 100%)",
      }}
    >
      <AppCard
        style={{
          borderRadius: 18,
          background: "linear-gradient(135deg, #0F172A 0%, #1E293B 55%, #0F766E 100%)",
          color: "#FFFFFF",
          marginBottom: 18,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
          <div style={{ maxWidth: 760 }}>
            <div style={{ opacity: 0.82, fontSize: 12, fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase" }}>
              Reporte gerencial
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, marginTop: 8 }}>Ingresos y egresos por movimiento</div>
            <p style={{ margin: "10px 0 0", color: "rgba(255,255,255,0.82)", lineHeight: 1.5 }}>
              Visualizacion basada en el store <strong>sp_Movimientos_Consulta_GastosIngresos</strong>.
            </p>
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              minWidth: 0,
              alignItems: "stretch",
              flexWrap: "nowrap",
              overflowX: "auto",
              paddingBottom: 2,
            }}
          >
            <div style={styles.heroBadge}>Desde {getMonthTitle(appliedFechaInicio)}</div>
            <div style={styles.heroBadge}>Hasta {getMonthTitle(appliedFechaFin)}</div>
            <div style={styles.heroBadge}>Tipos: ingresos y egresos</div>
            <div style={styles.heroBadge}>
              TC USD {appliedUsdExchangeRate.toFixed(2)} | TC DOP {appliedDopExchangeRate.toFixed(4)}
            </div>
          </div>
        </div>
      </AppCard>

      {loading || loadProgress > 0 ? (
        <div style={{ ...styles.loadingProgressWrap, marginBottom: 14 }} aria-live="polite" aria-label="Progreso de carga">
          <div style={styles.loadingProgressText}>
            Cargando información...
            <span style={styles.loadingProgressPercent}>{loadProgress}%</span>
          </div>
          <div style={styles.loadingProgressTrack}>
            <div style={{ ...styles.loadingProgressBar, width: `${Math.max(8, loadProgress)}%` }} />
          </div>
        </div>
      ) : null}

      <AppCard style={{ borderRadius: 18, marginBottom: 18 }}>
        <AppSectionHeader
          title="Filtros"
          description="Ajusta el rango de fechas y el texto de busqueda antes de volver a consultar el store."
          actions={actions}
        />
        <div style={styles.filtersGrid}>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Fecha inicio</span>
            <input style={styles.input} type="date" value={draftFechaInicio} onChange={(event) => setDraftFechaInicio(event.target.value)} />
          </label>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Fecha fin</span>
            <input style={styles.input} type="date" value={draftFechaFin} onChange={(event) => setDraftFechaFin(event.target.value)} />
          </label>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Buscar</span>
            <input
              style={styles.input}
              type="text"
              value={draftSearchText}
              placeholder="cliente, proyecto, site, detalle..."
              onChange={(event) => setDraftSearchText(event.target.value)}
            />
          </label>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Tipo USD</span>
            <input
              style={styles.input}
              type="number"
              min="0"
              step="0.01"
              value={draftUsdExchangeRate}
              onChange={(event) => setDraftUsdExchangeRate(event.target.value)}
            />
          </label>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Tipo DOP</span>
            <input
              style={styles.input}
              type="number"
              min="0"
              step="0.0001"
              value={draftDopExchangeRate}
              onChange={(event) => setDraftDopExchangeRate(event.target.value)}
            />
          </label>
        </div>
      </AppCard>

      {error ? <AppStatusMessage tone="error" style={{ marginBottom: 18 }}>{error}</AppStatusMessage> : null}

      <div style={styles.kpiGrid}>
        {kpiCards.map((card) => (
          <AppCard key={card.label} style={styles.kpiCard}>
            <div style={styles.kpiLabel}>{card.label}</div>
            <div style={styles.kpiValue}>{card.value}</div>
            <div style={styles.kpiHelper}>{card.helper}</div>
          </AppCard>
        ))}
      </div>

      <div style={styles.tabsBar}>
        <button
          type="button"
          style={{ ...styles.tabButton, ...(activeTab === "principal" ? styles.tabButtonActive : {}) }}
          onClick={() => setActiveTab("principal")}
        >
          Principal
        </button>
        <button
          type="button"
          style={{ ...styles.tabButton, ...(activeTab === "ingresos" ? styles.tabButtonActive : {}) }}
          onClick={() => setActiveTab("ingresos")}
        >
          Ingresos
        </button>
        <button
          type="button"
          style={{ ...styles.tabButton, ...(activeTab === "egresos" ? styles.tabButtonActive : {}) }}
          onClick={() => setActiveTab("egresos")}
        >
          Egresos
        </button>
      </div>

      {activeTab === "principal" ? (
        <>
      <div style={styles.chartGrid}>
        <AppCard style={styles.chartCard}>
          <AppSectionHeader title="Distribucion por tipo" description="Composicion de ingresos y egresos en el rango filtrado." />
          <div style={styles.chartControls}>
            <label style={styles.igvToggleOption}>
              <input
                style={styles.igvToggleInput}
                type="radio"
                name="tipo-igv-mode"
                value="sin-igv"
                checked={tipoIgvMode === "sin-igv"}
                onChange={() => setTipoIgvMode("sin-igv")}
              />
              <span>Sin Igv</span>
            </label>
            <label style={styles.igvToggleOption}>
              <input
                style={styles.igvToggleInput}
                type="radio"
                name="tipo-igv-mode"
                value="con-igv"
                checked={tipoIgvMode === "con-igv"}
                onChange={() => setTipoIgvMode("con-igv")}
              />
              <span>Con Igv</span>
            </label>
          </div>
          <div style={{ height: 280 }}>
            <div style={styles.chartWrap}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={breakdownByType}
                    dataKey="amount"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={64}
                    outerRadius={110}
                    paddingAngle={3}
                  >
                    {breakdownByType.map((entry) => (
                      <Cell key={entry.rawLabel} fill={TYPE_COLORS[entry.rawLabel] ?? TYPE_COLORS["Sin tipo"]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(Number(value), "PEN")} />
                </PieChart>
              </ResponsiveContainer>
              <div style={styles.chartCenterOverlay}>
                <div style={styles.chartCenterValue}>{formatCompactSoles(typeSaldo)}</div>
                <div style={styles.chartCenterLabel}>Saldo</div>
              </div>
            </div>
          </div>
          <div style={styles.legendGrid}>
            {breakdownByType.map((item) => {
              const percentage = item.rawLabel === "Egreso" ? typeEgresoPercentage : typeIngresoPercentage;
              return (
                <div key={item.rawLabel} style={styles.legendItem}>
                  <span style={{ ...styles.legendDot, background: TYPE_COLORS[item.rawLabel] ?? TYPE_COLORS["Sin tipo"] }} />
                  <span style={styles.legendText}>{item.label}</span>
                  <span style={styles.legendValue}>{formatCurrency(item.amount, "PEN")}</span>
                  <span style={styles.legendPercentRight}>{formatPercentage(percentage)}</span>
                </div>
              );
            })}
          </div>
        </AppCard>

        <AppCard style={styles.chartCard}>
          <AppSectionHeader title="Distribucion por moneda" description="Resumen por moneda detectada en los ingresos filtrados." />
          <div style={{ height: 280 }}>
            <div style={styles.chartWrap}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={breakdownByCurrency}
                    dataKey="amount"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={64}
                    outerRadius={110}
                    paddingAngle={3}
                  >
                    {breakdownByCurrency.map((entry, index) => (
                      <Cell key={entry.rawLabel} fill={INCOME_GREEN_COLORS[index % INCOME_GREEN_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, _name, props) => formatAmountByCurrency(Number(value), String(props?.payload?.rawLabel ?? "PEN"))} />
                </PieChart>
              </ResponsiveContainer>
              <div style={styles.chartCenterOverlay}>
                <div style={styles.chartCenterValue}>{formatCompactSoles(currencyIncomePenTotal)}</div>
                <div style={styles.chartCenterLabel}>Total en PEN</div>
              </div>
            </div>
          </div>
          <div style={styles.legendGrid}>
            <div style={styles.legendHeaderCurrency}>
              <span />
              <span style={styles.legendHeaderText}>Moneda</span>
              <span style={{ ...styles.legendHeaderText, textAlign: "right" }}>{currencyAmountLabel}</span>
              <span style={{ ...styles.legendHeaderText, textAlign: "right" }}>{currencyPenLabel}</span>
            </div>
            {breakdownByCurrency.map((item, index) => (
              <div key={item.rawLabel} style={styles.legendItemCurrency}>
                <span style={{ ...styles.legendDot, background: INCOME_GREEN_COLORS[index % INCOME_GREEN_COLORS.length] }} />
                <span style={styles.legendText}>{item.label}</span>
                <span style={{ ...styles.legendValue, textAlign: "right" }}>{formatAmountByCurrency(item.amount, item.rawLabel)}</span>
                <span style={{ ...styles.legendValue, textAlign: "right" }}>
                  {formatCurrency(convertAmountToPen(item.amount, item.rawLabel, appliedUsdExchangeRate, appliedDopExchangeRate), "PEN")}
                </span>
              </div>
            ))}
          </div>
        </AppCard>

        <AppCard style={styles.chartCard}>
          <AppSectionHeader title="Distribucion por moneda" description="Resumen por moneda detectada en los egresos filtrados." />
          <div style={{ height: 280 }}>
            <div style={styles.chartWrap}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={breakdownByCurrencyEgresos}
                    dataKey="amount"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={64}
                    outerRadius={110}
                    paddingAngle={3}
                  >
                    {breakdownByCurrencyEgresos.map((entry, index) => (
                      <Cell key={entry.rawLabel} fill={EXPENSE_RED_COLORS[index % EXPENSE_RED_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, _name, props) => formatAmountByCurrency(Number(value), String(props?.payload?.rawLabel ?? "PEN"))} />
                </PieChart>
              </ResponsiveContainer>
              <div style={styles.chartCenterOverlay}>
                <div style={styles.chartCenterValue}>{formatCompactSoles(currencyEgresoPenTotal)}</div>
                <div style={styles.chartCenterLabel}>Total en PEN</div>
              </div>
            </div>
          </div>
          <div style={styles.legendGrid}>
            <div style={styles.legendHeaderCurrency}>
              <span />
              <span style={styles.legendHeaderText}>Moneda</span>
              <span style={{ ...styles.legendHeaderText, textAlign: "right" }}>{currencyAmountLabel}</span>
              <span style={{ ...styles.legendHeaderText, textAlign: "right" }}>{currencyPenLabel}</span>
            </div>
            {breakdownByCurrencyEgresos.map((item, index) => (
              <div key={item.rawLabel} style={styles.legendItemCurrency}>
                <span style={{ ...styles.legendDot, background: EXPENSE_RED_COLORS[index % EXPENSE_RED_COLORS.length] }} />
                <span style={styles.legendText}>{item.label}</span>
                <span style={{ ...styles.legendValue, textAlign: "right" }}>{formatAmountByCurrency(item.amount, item.rawLabel)}</span>
                <span style={{ ...styles.legendValue, textAlign: "right" }}>{formatCurrency(convertAmountToPen(item.amount, item.rawLabel, appliedUsdExchangeRate, appliedDopExchangeRate), "PEN")}</span>
              </div>
            ))}
          </div>
        </AppCard>
      </div>

      <AppCard style={{ borderRadius: 18, marginTop: 2, flex: 1, minHeight: 0 }}>
        <AppSectionHeader
          title={`Detalle de movimientos (${sortedRows.length})`}
          description={`Consulta ejecutada entre ${appliedFechaInicio} y ${appliedFechaFin} sobre sp_Movimientos_Consulta_GastosIngresos.`}
          actions={
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                style={styles.secondaryButton}
                type="button"
                onClick={() => setIsDetailControllerCollapsed((current) => !current)}
              >
                {isDetailControllerCollapsed ? "Expandir controlador" : "Comprimir controlador"}
              </button>
              {!isDetailControllerCollapsed ? (
                <>
                  <button style={styles.secondaryButton} type="button" onClick={handleApplyFilters} disabled={loading}>
                    Recargar
                  </button>
                  <button style={styles.primaryButton} type="button" onClick={handleExport} disabled={!sortedRows.length}>
                    Exportar
                  </button>
                </>
              ) : null}
            </div>
          }
        />

        {!isDetailControllerCollapsed ? (
          loading ? (
            <div style={styles.loadingProgressWrap} aria-live="polite" aria-label="Progreso de carga">
              <div style={styles.loadingProgressText}>
                Cargando información...
                <span style={styles.loadingProgressPercent}>{loadProgress}%</span>
              </div>
              <div style={styles.loadingProgressTrack}>
                <div style={{ ...styles.loadingProgressBar, width: `${Math.max(8, loadProgress)}%` }} />
              </div>
            </div>
          ) : sortedRows.length === 0 ? (
            <AppStatusMessage tone="info">No se encontraron movimientos con los filtros aplicados.</AppStatusMessage>
          ) : (
            <div style={styles.tableWrap}>
              <div style={styles.tablePager}>
                <div style={styles.tablePagerInfo}>
                  Mostrando {sortedRows.length === 0 ? 0 : (detailPage - 1) * detailPageSize + 1}-{Math.min(detailPage * detailPageSize, sortedRows.length)} de {sortedRows.length}
                </div>
                <div style={styles.tablePagerControls}>
                  <label style={styles.pageSizeLabel}>
                    Filas por pagina
                    <select
                      style={styles.pageSizeSelect}
                      value={detailPageSize}
                      onChange={(event) => {
                        setDetailPageSize(Number(event.target.value));
                        setDetailPage(1);
                      }}
                    >
                      {[25, 50, 100, 200].map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    style={styles.secondaryButton}
                    onClick={() => setDetailPage(1)}
                    disabled={detailPage === 1}
                  >
                    Primera
                  </button>
                  <button
                    type="button"
                    style={styles.secondaryButton}
                    onClick={() => setDetailPage((current) => Math.max(1, current - 1))}
                    disabled={detailPage === 1}
                  >
                    Anterior
                  </button>
                  <span style={styles.tablePagerPage}>
                    Pagina {detailPage} de {totalDetailPages}
                  </span>
                  <button
                    type="button"
                    style={styles.secondaryButton}
                    onClick={() => setDetailPage((current) => Math.min(totalDetailPages, current + 1))}
                    disabled={detailPage === totalDetailPages}
                  >
                    Siguiente
                  </button>
                  <button
                    type="button"
                    style={styles.secondaryButton}
                    onClick={() => setDetailPage(totalDetailPages)}
                    disabled={detailPage === totalDetailPages}
                  >
                    Ultima
                  </button>
                </div>
              </div>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {[
                      ["id", "Id"],
                      ["fecha", "Fecha"],
                      ["tipo", "Tipo"],
                      ["cliente", "Cliente"],
                      ["proyecto", "Proyecto"],
                      ["site", "Site"],
                      ["categoria", "Categoria"],
                      ["moneda", "Moneda"],
                      ["monto", "Monto"],
                      ["montoPen", "Monto en PEN"],
                      ].map(([column, label]) => (
                      <th key={column} style={styles.th}>
                        <button type="button" style={styles.thButton} onClick={() => {
                          setDetailPage(1);
                          setSortColumn(column as SortColumn);
                          setSortDirection((current) => (sortColumn === column && current === "asc" ? "desc" : "asc"));
                        }}>
                          {label}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleDetailRows.map((row) => (
                    <tr key={`${row.id}-${row.fechaRaw}-${row.documento}`}>
                      <td style={styles.tdStrong}>{row.id}</td>
                      <td style={styles.tdStrong}>{row.fechaLabel}</td>
                      <td style={styles.td}>{row.tipo}</td>
                      <td style={styles.td}>{row.cliente}</td>
                      <td style={styles.td}>{row.proyecto}</td>
                      <td style={styles.td}>{row.site}</td>
                      <td style={styles.td}>{row.categoria}</td>
                      <td style={styles.td}>{row.moneda}</td>
                      <td style={styles.tdStrong}>{formatCurrency(row.monto, row.moneda)}</td>
                      <td style={styles.tdStrong}>
                        {formatCurrency(
                          convertAmountToPen(row.monto, row.moneda, appliedUsdExchangeRate, appliedDopExchangeRate),
                          "PEN",
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </AppCard>
        </>
      ) : activeTab === "ingresos" ? (
        <AppCard style={{ borderRadius: 18, marginTop: 2 }}>
          <AppSectionHeader
            title={`Ingresos (${ingresoRows.length})`}
            description="Vista resumida de los movimientos clasificados como ingresos."
          />
          <div style={styles.chartGrid}>
            <AppCard style={styles.chartCard}>
              <AppSectionHeader title="Distribucion por moneda" description="Resumen por moneda de ingresos." />
              <div style={{ height: 280 }}>
                <div style={styles.chartWrap}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={breakdownByCurrency}
                        dataKey="amount"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        innerRadius={64}
                        outerRadius={110}
                        paddingAngle={3}
                      >
                        {breakdownByCurrency.map((entry, index) => (
                          <Cell key={entry.rawLabel} fill={INCOME_GREEN_COLORS[index % INCOME_GREEN_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value, _name, props) => formatAmountByCurrency(Number(value), String(props?.payload?.rawLabel ?? "PEN"))} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={styles.chartCenterOverlay}>
                    <div style={styles.chartCenterValue}>{formatCompactSoles(currencyIncomePenTotal)}</div>
                    <div style={styles.chartCenterLabel}>Total en PEN</div>
                  </div>
                </div>
              </div>
            </AppCard>
          </div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Fecha</th>
                  <th style={styles.th}>Cliente</th>
                  <th style={styles.th}>Proyecto</th>
                  <th style={styles.th}>Site</th>
                  <th style={styles.th}>Moneda</th>
                  <th style={styles.th}>Monto</th>
                  <th style={styles.th}>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {visibleIncomeRows.map((row) => (
                  <tr key={row.id}>
                    <td style={styles.td}>{row.fechaLabel}</td>
                    <td style={styles.td}>{row.cliente}</td>
                    <td style={styles.td}>{row.proyecto}</td>
                    <td style={styles.td}>{row.site}</td>
                    <td style={styles.td}>{row.moneda}</td>
                    <td style={styles.tdStrong}>{formatCurrency(row.monto, row.moneda)}</td>
                    <td style={styles.td}>{row.detalle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AppCard>
      ) : (
        <AppCard style={{ borderRadius: 18, marginTop: 2 }}>
          <AppSectionHeader
            title={`${getExpenseLevelTitle(egresoDrillLevel, egresoDrillPath)} (${egresoDrillRows.length})`}
            description={`${getExpenseLevelDescription(egresoDrillLevel)} ${egresoDrillBreadcrumb ? `Ruta activa: ${egresoDrillBreadcrumb}.` : ""}`.trim()}
          />
          <div style={styles.expenseBreadcrumbHeaderRow}>
            <div style={styles.expenseBreadcrumbRow}>
              <button
                type="button"
                style={!egresoDrillPath.cliente ? styles.expenseBreadcrumbButtonActive : styles.expenseBreadcrumbButton}
                onClick={() => {
                  setSelectedExpenseDetailLevel(null);
                  setSelectedExpenseDetailLabel(null);
                  setEgresoDrillPath({
                    cliente: null,
                    proyecto: null,
                    site: null,
                    tipoTrabajo: null,
                  });
                }}
              >
                Clientes
              </button>
              {egresoDrillPath.cliente ? (
                <button
                  type="button"
                  style={!egresoDrillPath.proyecto ? styles.expenseBreadcrumbButtonActive : styles.expenseBreadcrumbButton}
                  onClick={() => {
                    setSelectedExpenseDetailLevel(null);
                    setSelectedExpenseDetailLabel(null);
                    setEgresoDrillPath({
                      cliente: egresoDrillPath.cliente,
                      proyecto: null,
                      site: null,
                      tipoTrabajo: null,
                    });
                  }}
                >
                  {egresoDrillPath.cliente}
                </button>
              ) : null}
              {egresoDrillPath.proyecto ? (
                <button
                  type="button"
                  style={!egresoDrillPath.site ? styles.expenseBreadcrumbButtonActive : styles.expenseBreadcrumbButton}
                  onClick={() => {
                    setSelectedExpenseDetailLevel(null);
                    setSelectedExpenseDetailLabel(null);
                    setEgresoDrillPath({
                      cliente: egresoDrillPath.cliente,
                      proyecto: egresoDrillPath.proyecto,
                      site: null,
                      tipoTrabajo: null,
                    });
                  }}
                >
                  {egresoDrillPath.proyecto}
                </button>
              ) : null}
              {egresoDrillPath.site ? (
                <button
                  type="button"
                  style={!egresoDrillPath.tipoTrabajo ? styles.expenseBreadcrumbButtonActive : styles.expenseBreadcrumbButton}
                  onClick={() => {
                    setSelectedExpenseDetailLevel(null);
                    setSelectedExpenseDetailLabel(null);
                    setEgresoDrillPath({
                      cliente: egresoDrillPath.cliente,
                      proyecto: egresoDrillPath.proyecto,
                      site: egresoDrillPath.site,
                      tipoTrabajo: null,
                    });
                  }}
                >
                  {egresoDrillPath.site}
                </button>
              ) : null}
              {egresoDrillPath.tipoTrabajo ? <span style={styles.expenseBreadcrumbFinal}>{egresoDrillPath.tipoTrabajo}</span> : null}
            </div>
          </div>
          {egresoDrillRows.length === 0 ? (
            <AppStatusMessage tone="info">No hay egresos para mostrar con la ruta seleccionada.</AppStatusMessage>
          ) : (
            <>
              <div style={styles.drilldownGrid}>
                <AppCard style={styles.chartCard}>
                  <div style={styles.expenseChartLayout}>
                    <div style={styles.expensePieBox}>
                      <div style={styles.chartWrap}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={egresoDrillBreakdown}
                              dataKey="amount"
                              nameKey="label"
                              cx="50%"
                              cy="50%"
                              innerRadius={64}
                              outerRadius={110}
                              paddingAngle={3}
                            >
                              {egresoDrillBreakdown.map((entry, index) => (
                                <Cell key={entry.rawLabel} fill={EXPENSE_RED_COLORS[index % EXPENSE_RED_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => formatCurrency(Number(value), "PEN")} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div style={styles.chartCenterOverlay}>
                          <div style={styles.chartCenterValue}>{formatCompactSoles(egresoDrillPenTotal)}</div>
                          <div style={styles.chartCenterLabel}>Total en PEN</div>
                        </div>
                      </div>
                    </div>
                    <div style={styles.expenseLegendPanel}>
                      {egresoDrillBreakdown.map((item, index) => {
                        const nextPath = getNextExpensePath(egresoDrillLevel, egresoDrillPath, item.label);
                        return (
                          <button
                            key={`${item.rawLabel}-legend`}
                            type="button"
                            style={
                              (egresoDrillLevel === "cliente" && normalizeText(egresoDrillPath.cliente ?? "") === normalizeText(item.label)) ||
                              (egresoDrillLevel === "proyecto" && normalizeText(egresoDrillPath.proyecto ?? "") === normalizeText(item.label)) ||
                              (egresoDrillLevel === "site" && normalizeText(egresoDrillPath.site ?? "") === normalizeText(item.label)) ||
                            (egresoDrillLevel === "tipoTrabajo" && normalizeText(egresoDrillPath.tipoTrabajo ?? "") === normalizeText(item.label))
                                ? styles.expenseLegendItemSelected
                                : styles.expenseLegendItem
                            }
                            onClick={() => {
                              setSelectedExpenseDetailLevel(egresoDrillLevel);
                              setSelectedExpenseDetailLabel(item.label);
                              if (egresoDrillLevel === "tipoTrabajo") {
                                return;
                              }

                              setEgresoDrillPath(nextPath);
                            }}
                          >
                            <span
                              style={{
                                ...styles.expenseLegendSwatch,
                                backgroundColor: EXPENSE_RED_COLORS[index % EXPENSE_RED_COLORS.length],
                              }}
                            />
                            <span style={styles.expenseLegendText}>{item.label}</span>
                            <span style={styles.expenseLegendPercent}>
                              {egresoDrillPenTotal > 0 ? `${((item.amount / egresoDrillPenTotal) * 100).toFixed(1)}%` : "0.0%"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </AppCard>

                <AppCard style={styles.chartCard}>
                  <AppSectionHeader
                    title="Detalle del nivel"
                    description={
                      egresoDrillLevel === "tipoTrabajo"
                        ? "Haz clic en un tipo de trabajo para filtrar el detalle de registros."
                        : "Haz clic en una fila para bajar al siguiente nivel."
                    }
                  />
                  <div style={styles.detailPanel}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>Nivel</th>
                          <th style={styles.th}>Registros</th>
                          {egresoDrillCurrencyColumns.map((currency) => (
                            <th key={currency} style={styles.th}>
                              Monto {currency}
                            </th>
                          ))}
                          <th style={styles.th}>Monto en PEN</th>
                          <th style={styles.th}>Participacion</th>
                        </tr>
                      </thead>
                      <tbody>
                        {egresoDrillBreakdown.map((item) => {
                          const nextPath = getNextExpensePath(egresoDrillLevel, egresoDrillPath, item.label);
                          const isCurrentType = egresoDrillPath.tipoTrabajo === item.label;
                          const isSelectedDetailLabel = normalizeText(selectedExpenseDetailLabel ?? "") === normalizeText(item.label);
                          return (
                            <tr key={item.rawLabel}>
                              <td style={styles.tdStrong}>
                                <button
                                  type="button"
                                  style={
                                    isCurrentType || isSelectedDetailLabel
                                      ? styles.linkButtonSelected
                                      : styles.linkButton
                                  }
                                  onClick={() => {
                                    if (egresoDrillLevel === "tipoTrabajo") {
                                      setSelectedExpenseDetailLevel("tipoTrabajo");
                                      setSelectedExpenseDetailLabel((current) =>
                                        normalizeText(current ?? "") === normalizeText(item.label) ? null : item.label
                                      );
                                      return;
                                    }

                                    setSelectedExpenseDetailLevel(egresoDrillLevel);
                                    setSelectedExpenseDetailLabel(item.label);
                                    setEgresoDrillPath(nextPath);
                                  }}
                                >
                                  {item.label}
                                </button>
                                {isCurrentType ? <span style={styles.activeLevelTag}>Activo</span> : null}
                                {isSelectedDetailLabel ? <span style={styles.activeLevelTag}>Seleccionado</span> : null}
                              </td>
                              <td style={styles.td}>{item.count}</td>
                              {egresoDrillCurrencyColumns.map((currency) => (
                                <td key={`${item.rawLabel}-${currency}`} style={styles.tdStrong}>
                                  {egresoDrillCurrencyAmountsByLabel.get(item.rawLabel)?.get(currency)
                                    ? formatAmountByCurrency(
                                        egresoDrillCurrencyAmountsByLabel.get(item.rawLabel)?.get(currency) ?? 0,
                                        currency,
                                      )
                                    : "-"}
                                </td>
                              ))}
                              <td style={styles.tdStrong}>{formatCurrency(item.amount, "PEN")}</td>
                              <td style={styles.td}>{egresoDrillPenTotal > 0 ? `${((item.amount / egresoDrillPenTotal) * 100).toFixed(1)}%` : "0.0%"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </AppCard>
              </div>

              <div style={styles.tableWrap}>
                <AppSectionHeader
                  title={`Detalle de gastos (${expenseDetailFilteredRows.length})`}
                  description={`Registros filtrados por ${egresoDrillBreadcrumb || "todos los egresos"}.`}
                  actions={
                    <div style={styles.expenseDetailHeaderActions}>
                      <button
                        type="button"
                        style={styles.detailCollapseButton}
                        onClick={() => setIsExpenseDetailCollapsed((current) => !current)}
                      >
                        {isExpenseDetailCollapsed ? "Expandir" : "Comprimir"}
                      </button>
                      <div style={styles.detailRecordsPill}>Registros existentes: {expenseDetailFilteredRows.length}</div>
                      <button type="button" style={styles.detailExportButton} onClick={handleExport} disabled={!sortedRows.length}>
                        Exportar a Excel
                      </button>
                    </div>
                  }
                />
                {!isExpenseDetailCollapsed ? (
                  <>
                {selectedExpenseDetailLabel ? (
                  <div style={styles.expenseDetailFilterBar}>
                    <span style={styles.expenseDetailFilterLabel}>Filtro activo</span>
                    <strong style={styles.expenseDetailFilterValue}>{selectedExpenseDetailLabel}</strong>
                  </div>
                ) : null}
                <div style={styles.tablePager}>
                  <div style={styles.tablePagerInfo}>
                    Mostrando{" "}
                    {expenseDetailFilteredRows.length === 0
                      ? 0
                      : (expenseDetailPage - 1) * expenseDetailPageSize + 1}
                    -{Math.min(expenseDetailPage * expenseDetailPageSize, expenseDetailFilteredRows.length)} de{" "}
                    {expenseDetailFilteredRows.length}
                  </div>
                  <div style={styles.tablePagerControls}>
                    <label style={styles.pageSizeLabel}>
                      Filas por pagina
                      <select
                        style={styles.pageSizeSelect}
                        value={expenseDetailPageSize}
                        onChange={(event) => {
                          setExpenseDetailPageSize(Number(event.target.value));
                          setExpenseDetailPage(1);
                        }}
                      >
                        {[10, 25, 50, 100].map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      style={styles.secondaryButton}
                      onClick={() => setExpenseDetailPage(1)}
                      disabled={expenseDetailPage === 1}
                    >
                      Primera
                    </button>
                    <button
                      type="button"
                      style={styles.secondaryButton}
                      onClick={() => setExpenseDetailPage((current) => Math.max(1, current - 1))}
                      disabled={expenseDetailPage === 1}
                    >
                      Anterior
                    </button>
                    <span style={styles.tablePagerPage}>
                      Pagina {expenseDetailPage} de {totalExpenseDetailPages}
                    </span>
                    <button
                      type="button"
                      style={styles.secondaryButton}
                      onClick={() => setExpenseDetailPage((current) => Math.min(totalExpenseDetailPages, current + 1))}
                      disabled={expenseDetailPage === totalExpenseDetailPages}
                    >
                      Siguiente
                    </button>
                    <button
                      type="button"
                      style={styles.secondaryButton}
                      onClick={() => setExpenseDetailPage(totalExpenseDetailPages)}
                      disabled={expenseDetailPage === totalExpenseDetailPages}
                    >
                      Ultima
                    </button>
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Fecha</th>
                        <th style={styles.th}>Cliente</th>
                        <th style={styles.th}>Proyecto</th>
                        <th style={styles.th}>Site</th>
                        <th style={styles.th}>Tipo trabajo</th>
                        <th style={styles.th}>Moneda</th>
                        <th style={styles.th}>Monto</th>
                        <th style={styles.th}>Total pagar</th>
                        <th style={styles.th}>Nro. operación</th>
                        <th style={styles.th}>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleExpenseDetailRows.map((row) => (
                        <tr key={row.id}>
                          <td style={styles.td}>{row.fechaLabel}</td>
                          <td style={styles.td}>{row.cliente}</td>
                          <td style={styles.td}>{row.proyecto}</td>
                          <td style={styles.td}>{row.site}</td>
                          <td style={styles.td}>{row.tipoTrabajo}</td>
                          <td style={styles.td}>{row.moneda}</td>
                          <td style={styles.tdStrong}>{formatCurrency(row.monto, row.moneda)}</td>
                          <td style={styles.tdStrong}>{formatCurrency(row.totalPagar || row.monto, row.moneda)}</td>
                          <td style={styles.td}>{row.nroOperacion}</td>
                          <td style={styles.td}>{row.detalle}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                  </>
                ) : null}
              </div>
            </>
          )}
        </AppCard>
      )}
    </AppPage>
  );
}

const styles: Record<string, React.CSSProperties> = {
  filtersGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
  },
  field: {
    display: "grid",
    gap: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: 800,
    color: "#475569",
  },
  input: {
    minHeight: 40,
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    padding: "0 12px",
    color: "#0F172A",
    outline: "none",
  },
  primaryButton: {
    minHeight: 40,
    borderRadius: 10,
    border: "1px solid #1D4ED8",
    background: "linear-gradient(135deg, #1D4ED8, #0F172A)",
    color: "#FFFFFF",
    padding: "0 14px",
    fontWeight: 800,
    cursor: "pointer",
  },
  secondaryButton: {
    minHeight: 40,
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    padding: "0 14px",
    fontWeight: 800,
    cursor: "pointer",
  },
  heroBadge: {
    borderRadius: 999,
    padding: "10px 14px",
    background: "rgba(255,255,255,0.12)",
    color: "#FFFFFF",
    border: "1px solid rgba(255,255,255,0.18)",
    fontSize: 13,
    fontWeight: 700,
    textAlign: "center",
    backdropFilter: "blur(8px)",
    whiteSpace: "nowrap",
    flex: "0 0 auto",
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 14,
    marginBottom: 18,
  },
  tabsBar: {
    display: "flex",
    gap: 10,
    padding: 10,
    borderRadius: 16,
    background: "#E2E8F0",
    marginBottom: 18,
    flexWrap: "wrap",
  },
  tabButton: {
    minHeight: 40,
    borderRadius: 12,
    border: "1px solid #D6DCE7",
    background: "rgba(255,255,255,0.65)",
    color: "#334155",
    padding: "0 16px",
    fontWeight: 800,
    cursor: "pointer",
  },
  tabButtonActive: {
    background: "linear-gradient(135deg, #1D4ED8 0%, #0F172A 100%)",
    color: "#FFFFFF",
    border: "1px solid #1D4ED8",
    boxShadow: "0 10px 20px rgba(29,78,216,0.22)",
  },
  kpiCard: {
    borderRadius: 18,
    marginBottom: 0,
    border: "1px solid #E2E8F0",
    boxShadow: "0 12px 28px rgba(15,23,42,0.06)",
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: 800,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  kpiValue: {
    marginTop: 8,
    fontSize: 26,
    fontWeight: 900,
    color: "#0F172A",
  },
  kpiHelper: {
    marginTop: 8,
    color: "#64748B",
    fontSize: 13,
  },
  chartGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 0.75fr) minmax(320px, 1fr) minmax(320px, 1fr)",
    gap: 14,
    marginBottom: 18,
  },
  drilldownGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(240px, 0.72fr) minmax(420px, 1.28fr)",
    gap: 14,
    marginBottom: 18,
  },
  chartCard: {
    borderRadius: 18,
    marginBottom: 0,
    border: "1px solid #E2E8F0",
    boxShadow: "0 12px 28px rgba(15,23,42,0.06)",
    minWidth: 0,
  },
  chartControls: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    margin: "4px 0 2px",
    paddingLeft: 2,
  },
  chartControlsLabel: {
    fontSize: 12,
    fontWeight: 800,
    color: "#475569",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  igvToggleOption: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    color: "#0F172A",
    cursor: "pointer",
    userSelect: "none",
  },
  igvToggleInput: {
    margin: 0,
    cursor: "pointer",
  },
  chartWrap: {
    width: "100%",
    height: 240,
    minWidth: 0,
    minHeight: 240,
    position: "relative",
  },
  expenseBreadcrumbHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 14,
  },
  expenseBreadcrumbRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
  },
  expenseBreadcrumbActions: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },
  expenseBreadcrumbButton: {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    borderRadius: 999,
    padding: "9px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    lineHeight: 1,
    whiteSpace: "nowrap",
  },
  expenseBreadcrumbButtonActive: {
    border: "1px solid #BFDBFE",
    background: "#EFF6FF",
    color: "#1D4ED8",
    borderRadius: 999,
    padding: "9px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    lineHeight: 1,
    whiteSpace: "nowrap",
  },
  expenseBreadcrumbFinal: {
    borderRadius: 999,
    border: "1px solid #BFDBFE",
    background: "#DBEAFE",
    color: "#1D4ED8",
    padding: "9px 14px",
    fontSize: 13,
    fontWeight: 800,
    lineHeight: 1,
    whiteSpace: "nowrap",
  },
  expenseChartLayout: {
    display: "grid",
    gridTemplateColumns: "minmax(200px, 0.62fr) minmax(240px, 0.38fr)",
    gap: 20,
    alignItems: "start",
    overflowX: "auto",
  },
  expensePieBox: {
    minWidth: 0,
  },
  expenseLegendPanel: {
    display: "grid",
    gap: 6,
    alignContent: "start",
    minWidth: 0,
    maxHeight: 288,
    overflowY: "auto",
    overflowX: "hidden",
    paddingLeft: 8,
    paddingRight: 2,
  },
  expenseLegendItem: {
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
  expenseLegendItemSelected: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: "1px solid #1D4ED8",
    borderRadius: 12,
    background: "#EFF6FF",
    padding: "8px 10px",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
    minWidth: 0,
    boxShadow: "0 0 0 1px rgba(29,78,216,0.08)",
  },
  expenseLegendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 999,
    flexShrink: 0,
  },
  expenseLegendText: {
    flex: 1,
    fontSize: 13,
    fontWeight: 700,
    color: "#0F172A",
    lineHeight: 1.2,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  expenseLegendPercent: {
    marginLeft: "auto",
    flexShrink: 0,
    fontSize: 11,
    fontWeight: 700,
    color: "#475569",
    whiteSpace: "nowrap",
  },
  expenseDetailFilterBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    border: "1px solid #BFDBFE",
    background: "#EFF6FF",
    borderRadius: 12,
    padding: "8px 12px",
    marginBottom: 10,
  },
  expenseDetailFilterLabel: {
    fontSize: 12,
    fontWeight: 800,
    color: "#1D4ED8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  expenseDetailFilterValue: {
    fontSize: 13,
    fontWeight: 800,
    color: "#0F172A",
  },
  expenseDetailHeaderActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  detailCollapseButton: {
    minHeight: 36,
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    padding: "0 14px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  detailRecordsPill: {
    minHeight: 36,
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    border: "1px solid #BFDBFE",
    background: "#EFF6FF",
    color: "#1D4ED8",
    padding: "0 14px",
    fontSize: 13,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  detailExportButton: {
    minHeight: 36,
    borderRadius: 10,
    border: "1px solid #94A3B8",
    background: "#94A3B8",
    color: "#FFFFFF",
    padding: "0 14px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  expenseDetailClearButton: {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    borderRadius: 999,
    padding: "7px 12px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    lineHeight: 1,
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
    overflowX: "auto",
  },
  chartCenterOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    textAlign: "center",
  },
  chartCenterValue: {
    fontSize: 22,
    fontWeight: 900,
    color: "#0F172A",
    lineHeight: 1.05,
    letterSpacing: "-0.02em",
  },
  chartCenterLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: 700,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  linkButton: {
    border: "none",
    background: "transparent",
    color: "#2563EB",
    padding: 0,
    fontWeight: 800,
    cursor: "pointer",
    textAlign: "left",
  },
  linkButtonSelected: {
    border: "none",
    background: "transparent",
    color: "#1D4ED8",
    padding: 0,
    fontWeight: 900,
    cursor: "pointer",
    textAlign: "left",
    textDecoration: "underline",
    textUnderlineOffset: 2,
  },
  activeLevelTag: {
    display: "inline-flex",
    alignItems: "center",
    marginLeft: 8,
    padding: "2px 8px",
    borderRadius: 999,
    background: "#DBEAFE",
    color: "#1D4ED8",
    fontSize: 10,
    fontWeight: 800,
    verticalAlign: "middle",
  },
  chartCenterPercent: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: 800,
    color: "#2563EB",
    lineHeight: 1.05,
  },
  chartCenterPercentLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: 700,
    color: "#64748B",
    lineHeight: 1.05,
  },
  legendGrid: {
    display: "grid",
    gap: 10,
    marginTop: 12,
  },
  legendItem: {
    display: "grid",
    gridTemplateColumns: "16px minmax(72px, 1fr) minmax(130px, auto) minmax(60px, auto)",
    alignItems: "center",
    columnGap: 12,
    rowGap: 10,
  },
  legendItemCurrency: {
    display: "grid",
    gridTemplateColumns: "16px minmax(72px, 1fr) minmax(170px, auto) minmax(170px, auto)",
    alignItems: "center",
    columnGap: 28,
    rowGap: 10,
  },
  legendItemWide: {
    display: "grid",
    gridTemplateColumns: "16px minmax(72px, 1fr) minmax(120px, auto) minmax(120px, auto) minmax(145px, auto) minmax(145px, auto)",
    alignItems: "center",
    columnGap: 10,
    rowGap: 10,
  },
  legendHeader: {
    display: "grid",
    gridTemplateColumns: "16px minmax(72px, 1fr) minmax(155px, auto) minmax(155px, auto)",
    columnGap: 18,
    alignItems: "center",
    paddingBottom: 4,
    marginBottom: 2,
    borderBottom: "1px solid #E2E8F0",
  },
  legendHeaderCurrency: {
    display: "grid",
    gridTemplateColumns: "16px minmax(72px, 1fr) minmax(170px, auto) minmax(170px, auto)",
    columnGap: 28,
    alignItems: "center",
    paddingBottom: 4,
    marginBottom: 2,
    borderBottom: "1px solid #E2E8F0",
  },
  legendHeaderWide: {
    display: "grid",
    gridTemplateColumns: "16px minmax(72px, 1fr) minmax(120px, auto) minmax(120px, auto) minmax(145px, auto) minmax(145px, auto)",
    columnGap: 10,
    alignItems: "center",
    paddingBottom: 4,
    marginBottom: 2,
    borderBottom: "1px solid #E2E8F0",
  },
  legendHeaderText: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    display: "inline-block",
  },
  legendText: {
    color: "#0F172A",
    fontWeight: 700,
    minWidth: 0,
  },
  legendValue: {
    color: "#334155",
    fontWeight: 800,
    whiteSpace: "nowrap",
    justifySelf: "end",
  },
  legendPercentRight: {
    color: "#64748B",
    fontWeight: 800,
    whiteSpace: "nowrap",
    justifySelf: "end",
    fontSize: 14,
  },
  loadingBox: {
    padding: 24,
    textAlign: "center",
    color: "#475569",
    fontWeight: 700,
  },
  loadingProgressWrap: {
    display: "grid",
    gap: 6,
    padding: "0 6px 2px",
  },
  loadingProgressText: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    fontSize: 12,
    fontWeight: 700,
    color: "#475569",
  },
  loadingProgressPercent: {
    color: "#1D4ED8",
    fontWeight: 800,
  },
  loadingProgressTrack: {
    width: "100%",
    height: 8,
    borderRadius: 999,
    background: "#E2E8F0",
    overflow: "hidden",
    border: "1px solid #DBEAFE",
  },
  loadingProgressBar: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #2563EB, #14B8A6)",
    transition: "width 180ms ease-out",
  },
  tablePager: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 14px",
    borderBottom: "1px solid #E2E8F0",
    background: "#F8FAFC",
    flexWrap: "wrap",
  },
  tablePagerInfo: {
    color: "#475569",
    fontSize: 13,
    fontWeight: 700,
  },
  tablePagerControls: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  pageSizeLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "#475569",
    fontSize: 13,
    fontWeight: 700,
  },
  pageSizeSelect: {
    minHeight: 36,
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    padding: "0 10px",
    fontWeight: 700,
  },
  tablePagerPage: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: 800,
    padding: "0 4px",
  },
  tableWrap: {
    overflow: "auto",
    border: "1px solid #E2E8F0",
    borderRadius: 14,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 1100,
  },
  th: {
    position: "sticky",
    top: 0,
    background: "#F8FAFC",
    borderBottom: "1px solid #E2E8F0",
    textAlign: "left",
    padding: 0,
    zIndex: 30,
    backgroundClip: "padding-box",
    boxShadow: "0 2px 0 #E2E8F0",
  },
  thButton: {
    width: "100%",
    padding: "10px 8px",
    background: "transparent",
    border: "none",
    color: "#475569",
    fontSize: 10,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    cursor: "pointer",
    textAlign: "left",
  },
  td: {
    padding: "10px 10px",
    borderBottom: "1px solid #EEF2F7",
    background: "#FFFFFF",
    color: "#0F172A",
    fontSize: 13,
    whiteSpace: "nowrap",
    position: "relative",
    zIndex: 1,
  },
  tdStrong: {
    padding: "10px 10px",
    borderBottom: "1px solid #EEF2F7",
    background: "#FFFFFF",
    color: "#0F172A",
    fontSize: 13,
    fontWeight: 800,
    whiteSpace: "nowrap",
    position: "relative",
    zIndex: 1,
  },
};
