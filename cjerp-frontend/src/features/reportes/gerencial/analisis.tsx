import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsLeft, ChevronsRight } from "lucide-react";
import AppPage from "../../../components/base/AppPage";
import AppCard from "../../../components/base/AppCard";
import AppSectionHeader from "../../../components/base/AppSectionHeader";
import AppStatusMessage from "../../../components/base/AppStatusMessage";
import { FiltroOperativoLookup } from "../../../components/lookups/FiltroOperativoLookup";
import { consultarMovimientosGastosIngresos, type MovimientoConsultaRequest } from "../../../api/movimientosConsultaService";
import type { FiltroOperativoValue } from "../../../models/filtroOperativo";
import { getHttpErrorMessage } from "../../../utils/httpError";

type RawRow = Record<string, unknown>;
type MovementType = "Ingreso" | "Egreso" | "Sin tipo";
type LevelKey = "cliente" | "proyecto" | "site";

type MovementRow = {
  fechaRaw: string;
  fechaSort: number;
  tipo: MovementType;
  cliente: string;
  proyecto: string;
  site: string;
  moneda: string;
  monto: number;
  subtotal: number;
  totalPagar: number;
  detalle: string;
};

type RankingRow = {
  label: string;
  cliente?: string;
  proyecto?: string;
  count: number;
  ingresosPen: number;
  egresosPen: number;
  netoPen: number;
};

type DetailSortColumn = "fecha" | "tipo" | "cliente" | "proyecto" | "site" | "moneda" | "monto" | "montoPen";

type ProjectCatalogRow = {
  idCliente: number;
  nombreCliente: string;
  idProyecto: number;
  nombreProyecto: string;
};

type PieEntry = {
  label: string;
  value: number;
  signedValue: number;
  color: string;
};

const DEFAULT_EXCHANGE_RATES = {
  USD: 3.5,
  DOP: 0.058,
} as const;
const PIE_COLORS = ["#2563EB", "#14B8A6", "#22C55E", "#F59E0B", "#F97316", "#EF4444", "#A855F7", "#64748B"];

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

function parseDateLike(value: string) {
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
  return Number.isFinite(parsed.getTime())
    ? { label: parsed.toLocaleDateString("es-PE"), sortValue: parsed.getTime() }
    : { label: text, sortValue: 0 };
}

function normalizeMonedaLabel(value: string) {
  const normalized = normalizeText(value);
  if (normalized.includes("USD") || normalized.includes("DOLAR")) return "USD";
  if (normalized.includes("DOP") || normalized.includes("PESO DOMINICANO") || normalized.includes("RD$")) return "DOP";
  if (normalized.includes("PEN") || normalized.includes("SOLES") || normalized.includes("S/")) return "PEN";
  return value.trim() || "Sin moneda";
}

function resolveMonedaCode(row: RawRow) {
  const raw = pickString(row, ["Moneda", "moneda", "MonedaLabel", "monedaLabel", "TipoMoneda", "tipoMoneda"]);
  const normalized = normalizeMonedaLabel(raw);

  if (normalized === "PEN" || normalized === "USD" || normalized === "DOP") {
    return normalized;
  }

  const idMoneda = toNumber(getRowValue(row, ["IdMoneda", "idMoneda", "idmoneda"]));
  if (idMoneda === 1) return "PEN";
  if (idMoneda === 2) return "USD";
  if (idMoneda === 3 || idMoneda === 4) return "DOP";

  return normalized;
}

function resolveMovementType(row: RawRow, amountIn: number, amountOut: number, movementAmount: number, signedAmount: number) {
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
  if (amountIn > 0 && amountIn >= amountOut) return "Ingreso" as const;
  if (amountOut > 0 && amountOut >= amountIn) return "Egreso" as const;
  if (movementAmount > 0 && signedAmount < 0) return "Egreso" as const;
  if (movementAmount > 0) return "Ingreso" as const;
  if (signedAmount < 0) return "Egreso" as const;
  if (signedAmount > 0) return "Ingreso" as const;
  return "Sin tipo" as const;
}

function buildMovementRow(row: RawRow): MovementRow {
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
  ]);
  const parsedDate = parseDateLike(fechaRaw);
  const amountIn = toNumber(getRowValue(row, ["MontoIngreso", "montoIngreso", "MontoLiq", "montoLiq"]));
  const subtotal = toNumber(getRowValue(row, ["Subtotal", "subtotal", "MontoGasto", "montoGasto", "Total", "total"]));
  const totalPagar = toNumber(getRowValue(row, ["TotalPagar", "totalPagar", "MontoGasto", "montoGasto", "Total", "total"]));
  const movementAmount = toNumber(getRowValue(row, ["MontoMovimiento", "montoMovimiento", "Importe", "importe", "Valor", "valor"]));
  const signedAmount = toNumber(getRowValue(row, ["MontoFirmado", "montoFirmado", "Debe", "debe", "Haber", "haber"]));

  return {
    fechaRaw: fechaRaw || "-",
    fechaSort: parsedDate.sortValue,
    tipo: resolveMovementType(row, amountIn, subtotal, movementAmount, signedAmount),
    cliente: pickString(row, ["Cliente", "cliente", "NombreCliente", "nombreCliente"]) || "Sin cliente",
    proyecto: pickString(row, ["Proyecto", "proyecto", "NombreProyecto", "nombreProyecto"]) || "Sin proyecto",
    site: pickString(row, ["Site", "site", "NombreSite", "nombreSite", "siteNombre"]) || "Sin site",
    moneda: resolveMonedaCode(row),
    monto: Math.max(Math.abs(amountIn), Math.abs(subtotal), Math.abs(movementAmount), Math.abs(signedAmount), 0),
    subtotal,
    totalPagar,
    detalle:
      pickString(row, ["Detalle", "detalle", "Descripcion", "descripcion", "Observacion", "observacion", "Comentario", "comentario", "Glosa", "glosa"]) ||
      "-",
  };
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

function convertAmountToPen(value: number, currency: string, usdRate: number, dopRate: number) {
  if (!Number.isFinite(value)) return 0;

  if (currency === "USD") return value * usdRate;
  if (currency === "DOP") return value * dopRate;
  return value;
}

function resolveEgresoBaseAmount(row: MovementRow) {
  return row.subtotal > 0 ? row.subtotal : row.totalPagar > 0 ? row.totalPagar : row.monto;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0.0%";
  return `${value.toFixed(1)}%`;
}

function formatCompactSoles(value: number) {
  if (!Number.isFinite(value)) return "S/ 0.0";

  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `S/ ${(value / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `S/ ${(value / 1_000).toFixed(1)}K`;
  return formatCurrency(value, "PEN");
}

function getLevelLabel(level: LevelKey) {
  if (level === "cliente") return "Clientes";
  if (level === "proyecto") return "Proyectos";
  return "Sites";
}

function getLevelValue(row: MovementRow, level: LevelKey) {
  if (level === "cliente") return row.cliente;
  if (level === "proyecto") return row.proyecto;
  return row.site;
}

function aggregateByLevel(rows: MovementRow[], level: LevelKey, usdRate: number, dopRate: number) {
  const map = new Map<string, RankingRow>();

  for (const row of rows) {
    const label = getLevelValue(row, level) || "Sin dato";
    const current =
      map.get(label) ?? {
        label,
        count: 0,
        ingresosPen: 0,
        egresosPen: 0,
        netoPen: 0,
      };

    if (level === "proyecto" && !current.cliente) {
      current.cliente = row.cliente;
    }

    if (level === "site") {
      if (!current.cliente) current.cliente = row.cliente;
      if (!current.proyecto) current.proyecto = row.proyecto;
    }

    current.count += 1;

    if (row.tipo === "Ingreso") {
      current.ingresosPen += convertAmountToPen(row.monto, row.moneda, usdRate, dopRate);
    } else if (row.tipo === "Egreso") {
      current.egresosPen += convertAmountToPen(resolveEgresoBaseAmount(row), row.moneda, usdRate, dopRate);
    }

    current.netoPen = current.ingresosPen - current.egresosPen;
    map.set(label, current);
  }

  return Array.from(map.values()).sort((left, right) => right.netoPen - left.netoPen || right.count - left.count);
}

function sumBy(rows: MovementRow[], predicate: (row: MovementRow) => boolean, amountFn: (row: MovementRow) => number) {
  return rows.reduce((accumulator, row) => (predicate(row) ? accumulator + amountFn(row) : accumulator), 0);
}

function sanitizeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

async function exportRowsToExcel(rows: Record<string, unknown>[], sheetName: string, fileName: string) {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
    XLSX.writeFile(workbook, fileName);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const worker = new Worker(new URL("./analisisExport.worker.ts", import.meta.url), { type: "module" });

    worker.onmessage = (event: MessageEvent<{ ok: boolean; fileName?: string; buffer?: ArrayBuffer; error?: string }>) => {
      const { ok, buffer, error } = event.data;
      worker.terminate();

      if (!ok || !buffer) {
        reject(new Error(error || "No fue posible generar el archivo Excel."));
        return;
      }

      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      resolve();
    };

    worker.onerror = (event) => {
      worker.terminate();
      reject(event.error ?? new Error("No fue posible generar el archivo Excel."));
    };

    worker.postMessage({ rows, sheetName, fileName });
  });
}

export default function AnalisisPage() {
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draftFechaInicio, setDraftFechaInicio] = useState(getYearStartInputValue());
  const [draftFechaFin, setDraftFechaFin] = useState(getTodayInputValue());
  const [draftUsdExchangeRate, setDraftUsdExchangeRate] = useState(String(DEFAULT_EXCHANGE_RATES.USD));
  const [draftDopExchangeRate, setDraftDopExchangeRate] = useState(String(DEFAULT_EXCHANGE_RATES.DOP));
  const [appliedFechaInicio, setAppliedFechaInicio] = useState(getYearStartInputValue());
  const [appliedFechaFin, setAppliedFechaFin] = useState(getTodayInputValue());
  const [appliedUsdExchangeRate, setAppliedUsdExchangeRate] = useState<number>(DEFAULT_EXCHANGE_RATES.USD);
  const [appliedDopExchangeRate, setAppliedDopExchangeRate] = useState<number>(DEFAULT_EXCHANGE_RATES.DOP);
  const [draftLookupValue, setDraftLookupValue] = useState<FiltroOperativoValue>({});
  const [appliedLookupValue, setAppliedLookupValue] = useState<FiltroOperativoValue>({});
  const [selectedCliente, setSelectedCliente] = useState("");
  const [selectedProyecto, setSelectedProyecto] = useState("");
  const [selectedSite, setSelectedSite] = useState("");
  const [winnerScopeLevel, setWinnerScopeLevel] = useState<LevelKey>("cliente");
  const [masterClientes, setMasterClientes] = useState<string[]>([]);
  const [masterProyectos, setMasterProyectos] = useState<ProjectCatalogRow[]>([]);
  const [detailPage, setDetailPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState(25);
  const [detailSortColumn, setDetailSortColumn] = useState<DetailSortColumn>("fecha");
  const [detailSortDirection, setDetailSortDirection] = useState<"asc" | "desc">("desc");
  const [isDetailCollapsed, setIsDetailCollapsed] = useState(true);
  const isMountedRef = useRef(true);
  const loadRef = useRef(0);

  const loadRows = async (overrides?: { fechaInicio?: string; fechaFin?: string; resetSelection?: boolean }) => {
    const fechaInicio = overrides?.fechaInicio ?? draftFechaInicio;
    const fechaFin = overrides?.fechaFin ?? draftFechaFin;
    const resetSelection = overrides?.resetSelection ?? true;
    const usdRate = Number(draftUsdExchangeRate.replace(",", "."));
    const dopRate = Number(draftDopExchangeRate.replace(",", "."));
    const safeUsdRate = Number.isFinite(usdRate) && usdRate > 0 ? usdRate : DEFAULT_EXCHANGE_RATES.USD;
    const safeDopRate = Number.isFinite(dopRate) && dopRate > 0 ? dopRate : DEFAULT_EXCHANGE_RATES.DOP;

    const request: MovimientoConsultaRequest = {
      consulta: "movimientos-gastos-ingresos",
      parametros: [
        { nombre: "FechaInicio", valor: fechaInicio, tipo: "date" },
        { nombre: "FechaFin", valor: fechaFin, tipo: "date" },
      ],
    };

    loadRef.current += 1;
    const requestId = loadRef.current;
    setLoading(true);
    setError("");

    try {
      const response = await consultarMovimientosGastosIngresos(request, { timeoutMs: 120000 });
      if (!isMountedRef.current || requestId !== loadRef.current) return;

      if (response.limitExceeded) {
        setRawRows([]);
        setError(response.message?.trim() || "La consulta excedio el maximo permitido para el analisis.");
        return;
      }

      setAppliedFechaInicio(fechaInicio);
      setAppliedFechaFin(fechaFin);
      setAppliedUsdExchangeRate(safeUsdRate);
      setAppliedDopExchangeRate(safeDopRate);
      setRawRows(Array.isArray(response.rows) ? response.rows : []);
      if (resetSelection) {
        setSelectedCliente("");
        setSelectedProyecto("");
        setSelectedSite("");
      }
    } catch (err) {
      if (!isMountedRef.current || requestId !== loadRef.current) return;
      setRawRows([]);
      setError(getHttpErrorMessage(err, "No se pudo cargar el analisis gerencial."));
    } finally {
      if (isMountedRef.current && requestId === loadRef.current) {
        setLoading(false);
      }
    }
  };

  const loadClientCatalog = async () => {
    try {
      const response = await consultarMovimientosGastosIngresos(
        {
          consulta: "clientes-activos",
          parametros: [],
        },
        { timeoutMs: 120000 },
      );

      if (!isMountedRef.current) return;

      const clientes = Array.from(
        new Set(
          (response.rows ?? [])
            .map((row) => pickString(row, ["NombreCliente", "nombreCliente", "Cliente", "cliente"]))
            .filter(Boolean),
        ),
      ).sort((left, right) => left.localeCompare(right, "es", { sensitivity: "base" }));

      setMasterClientes(clientes);
    } catch {
      if (isMountedRef.current) {
        setMasterClientes([]);
      }
    }
  };

  const loadProjectCatalog = async () => {
    try {
      const response = await consultarMovimientosGastosIngresos(
        {
          consulta: "proyectos-activos",
          parametros: [],
        },
        { timeoutMs: 120000 },
      );

      if (!isMountedRef.current) return;

      const proyectos = (response.rows ?? [])
        .map((row) => ({
          idCliente: toNumber(getRowValue(row, ["IdCliente", "idCliente"])),
          nombreCliente: pickString(row, ["NombreCliente", "nombreCliente", "Cliente", "cliente"]),
          idProyecto: toNumber(getRowValue(row, ["IdProyecto", "idProyecto"])),
          nombreProyecto: pickString(row, ["NombreProyecto", "nombreProyecto", "Proyecto", "proyecto"]),
        }))
        .filter((row) => row.idProyecto > 0 && row.nombreProyecto.trim().length > 0);

      setMasterProyectos(proyectos);
    } catch {
      if (isMountedRef.current) {
        setMasterProyectos([]);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const movements = useMemo(() => rawRows.map((row) => buildMovementRow(row)), [rawRows]);
  const siteCatalogByName = useMemo(() => {
    const map = new Map<string, { cliente: string; proyecto: string }>();

    for (const row of movements) {
      const key = normalizeText(row.site);
      if (!key || map.has(key)) continue;
      map.set(key, {
        cliente: row.cliente,
        proyecto: row.proyecto,
      });
    }

    return map;
  }, [movements]);
  const appliedLookupFiltro = appliedLookupValue?.filtro;
  const dateFilteredMovements = useMemo(() => {
    const fromDate = appliedFechaInicio ? new Date(`${appliedFechaInicio}T00:00:00`).getTime() : 0;
    const toDate = appliedFechaFin ? new Date(`${appliedFechaFin}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;

    return movements.filter((row) => {
      if (row.fechaSort && row.fechaSort < fromDate) return false;
      if (row.fechaSort && row.fechaSort > toDate) return false;
      return true;
    });
  }, [appliedFechaFin, appliedFechaInicio, movements]);
  const scopeSelection = useMemo(() => {
    const matches = (rowValue: string, filterValue: string) => {
      const rowText = normalizeText(rowValue);
      const filterText = normalizeText(filterValue);
      if (!filterText) return true;
      return rowText === filterText || rowText.includes(filterText) || filterText.includes(rowText);
    };
    const lookupCliente = appliedLookupFiltro?.nombreCliente ?? "";
    const lookupProyecto = appliedLookupFiltro?.nombreProyecto ?? "";
    const lookupSite = appliedLookupFiltro?.nombreSite ?? "";
    const selectedRows = dateFilteredMovements.filter((row) => {
      if (winnerScopeLevel !== "proyecto" && lookupCliente && !matches(row.cliente, lookupCliente)) return false;
      if (lookupProyecto && !matches(row.proyecto, lookupProyecto)) return false;
      if (lookupSite && !matches(row.site, lookupSite)) return false;
      if (winnerScopeLevel === "cliente" && selectedCliente && row.cliente !== selectedCliente) return false;
      if (winnerScopeLevel !== "site" && selectedProyecto && row.proyecto !== selectedProyecto) return false;
      if (selectedSite && row.site !== selectedSite) return false;
      return true;
    });

    return {
      rows: selectedRows,
    };
  }, [appliedLookupFiltro, dateFilteredMovements, selectedCliente, selectedProyecto, selectedSite, winnerScopeLevel]);
  const activeLevel: LevelKey = useMemo(() => {
    if (winnerScopeLevel === "site") return "site";
    if (winnerScopeLevel === "proyecto") {
      return selectedProyecto ? "site" : "proyecto";
    }

    if (selectedSite) return "site";
    if (selectedProyecto) return "site";
    if (selectedCliente) return "proyecto";
    return "cliente";
  }, [selectedCliente, selectedProyecto, selectedSite, winnerScopeLevel]);
  const currentLevelLabel = getLevelLabel(activeLevel);
  const scopedMovements = scopeSelection.rows;

  const totalIngresos = useMemo(
    () => sumBy(scopedMovements, (row) => row.tipo === "Ingreso", (row) => convertAmountToPen(row.monto, row.moneda, appliedUsdExchangeRate, appliedDopExchangeRate)),
    [appliedDopExchangeRate, appliedUsdExchangeRate, scopedMovements],
  );
  const totalEgresos = useMemo(
    () =>
      sumBy(
        scopedMovements,
        (row) => row.tipo === "Egreso",
        (row) => convertAmountToPen(resolveEgresoBaseAmount(row), row.moneda, appliedUsdExchangeRate, appliedDopExchangeRate),
      ),
    [appliedDopExchangeRate, appliedUsdExchangeRate, scopedMovements],
  );
  const saldo = totalIngresos - totalEgresos;
  const avance = totalIngresos > 0 ? (totalEgresos / totalIngresos) * 100 : 0;
  const selectedRanking = useMemo(
    () => aggregateByLevel(scopedMovements, activeLevel, appliedUsdExchangeRate, appliedDopExchangeRate),
    [activeLevel, appliedDopExchangeRate, appliedUsdExchangeRate, scopedMovements],
  );
  const detailSortedRows = useMemo(() => {
    const factor = detailSortDirection === "asc" ? 1 : -1;

    return [...scopedMovements].sort((left, right) => {
      switch (detailSortColumn) {
        case "fecha":
          return (left.fechaSort - right.fechaSort) * factor;
        case "monto":
          return (left.monto - right.monto) * factor;
        case "montoPen":
          return (
            convertAmountToPen(resolveEgresoBaseAmount(left), left.moneda, appliedUsdExchangeRate, appliedDopExchangeRate) -
            convertAmountToPen(resolveEgresoBaseAmount(right), right.moneda, appliedUsdExchangeRate, appliedDopExchangeRate)
          ) * factor;
        default:
          return String(left[detailSortColumn]).localeCompare(String(right[detailSortColumn]), "es", {
            sensitivity: "base",
          }) * factor;
      }
    });
  }, [appliedDopExchangeRate, appliedUsdExchangeRate, detailSortColumn, detailSortDirection, scopedMovements]);
  const totalDetailPages = Math.max(1, Math.ceil(detailSortedRows.length / detailPageSize));
  const visibleDetailRows = useMemo(() => {
    const startIndex = (detailPage - 1) * detailPageSize;
    return detailSortedRows.slice(startIndex, startIndex + detailPageSize);
  }, [detailPage, detailPageSize, detailSortedRows]);

  useEffect(() => {
    setDetailPage((current) => Math.min(Math.max(1, current), totalDetailPages));
  }, [totalDetailPages]);

  const displayRanking = useMemo(() => {
    const byLabel = new Map<string, RankingRow>();
    for (const item of selectedRanking) {
      byLabel.set(normalizeText(item.label), item);
    }

    if (activeLevel === "cliente") {
      const sourceClients =
        masterClientes.length > 0 ? masterClientes : Array.from(new Set(movements.map((row) => row.cliente).filter(Boolean)));

      for (const cliente of sourceClients) {
        const normalizedCliente = normalizeText(cliente);
        if (!byLabel.has(normalizedCliente)) {
          byLabel.set(normalizedCliente, {
            label: cliente,
            count: 0,
            ingresosPen: 0,
            egresosPen: 0,
            netoPen: 0,
          });
        }
      }
    } else if (activeLevel === "proyecto") {
      const sourceProjects =
        masterProyectos.length > 0
          ? masterProyectos.map((row) => ({
              nombreProyecto: row.nombreProyecto,
              nombreCliente: row.nombreCliente,
            }))
          : Array.from(
              new Map(
                movements.map((row) => [
                  normalizeText(row.proyecto),
                  { nombreProyecto: row.proyecto, nombreCliente: row.cliente },
                ]),
              ).values(),
            );

      for (const proyecto of sourceProjects) {
        const normalizedProyecto = normalizeText(proyecto.nombreProyecto);
        const existing = byLabel.get(normalizedProyecto);
        if (existing) {
          existing.cliente = existing.cliente || proyecto.nombreCliente;
          continue;
        }

        byLabel.set(normalizedProyecto, {
          label: proyecto.nombreProyecto,
          cliente: proyecto.nombreCliente,
          count: 0,
          ingresosPen: 0,
          egresosPen: 0,
          netoPen: 0,
        });
      }
    } else {
      const siteSourceRows = winnerScopeLevel === "site" ? movements : scopedMovements;
      const sourceSites = siteSourceRows.length > 0 ? Array.from(new Set(siteSourceRows.map((row) => row.site).filter(Boolean))) : [];

      for (const site of sourceSites) {
        const normalizedSite = normalizeText(site);
        const siteMatch = siteCatalogByName.get(normalizedSite);
        if (!byLabel.has(normalizedSite)) {
          byLabel.set(normalizedSite, {
            label: site,
            cliente: siteMatch?.cliente,
            proyecto: siteMatch?.proyecto,
            count: 0,
            ingresosPen: 0,
            egresosPen: 0,
            netoPen: 0,
          });
        }
      }
    }

    const rows = Array.from(byLabel.values()).sort((left, right) => left.netoPen - right.netoPen || left.count - right.count || left.label.localeCompare(right.label, "es", { sensitivity: "base" }));

    if (activeLevel === "site" && winnerScopeLevel === "site") {
      const topLosses = [...rows]
        .filter((row) => row.netoPen < 0)
        .sort((left, right) => left.netoPen - right.netoPen || right.count - left.count || left.label.localeCompare(right.label, "es", { sensitivity: "base" }))
        .slice(0, 5);
      const topGains = [...rows]
        .filter((row) => row.netoPen > 0)
        .sort((left, right) => right.netoPen - left.netoPen || right.count - left.count || left.label.localeCompare(right.label, "es", { sensitivity: "base" }))
        .slice(0, 5);

      return [...topLosses, ...topGains];
    }

    return rows;
  }, [activeLevel, masterClientes, masterProyectos, movements, selectedCliente, selectedRanking, selectedProyecto, siteCatalogByName, winnerScopeLevel]);

  const topIngresos = useMemo(
    () => [...displayRanking].sort((left, right) => right.ingresosPen - left.ingresosPen).slice(0, 10),
    [displayRanking],
  );
  const topEgresos = useMemo(
    () => [...displayRanking].sort((left, right) => right.egresosPen - left.egresosPen).slice(0, 10),
    [displayRanking],
  );
  const topNeto = useMemo(
    () => [...displayRanking].sort((left, right) => right.netoPen - left.netoPen).slice(0, 10),
    [displayRanking],
  );

  const winnerRanking = useMemo(
    () => aggregateByLevel(scopedMovements, winnerScopeLevel, appliedUsdExchangeRate, appliedDopExchangeRate),
    [appliedDopExchangeRate, appliedUsdExchangeRate, scopedMovements, winnerScopeLevel],
  );
  const topWinner = winnerRanking[0] ?? null;
  const topLoser = [...displayRanking].sort((left, right) => left.netoPen - right.netoPen)[0] ?? null;
  const rankingPieData = useMemo<PieEntry[]>(() => {
    const source = [...displayRanking];

    return source
      .map((item, index) => ({
        label: item.label,
        value: Math.abs(item.netoPen),
        signedValue: item.netoPen,
        color: PIE_COLORS[index % PIE_COLORS.length],
      }))
      .filter((item) => item.value > 0);
  }, [activeLevel, displayRanking]);

  const clienteOptions = useMemo(() => {
    const source = masterClientes.length > 0 ? [...masterClientes] : Array.from(new Set(movements.map((row) => row.cliente).filter(Boolean)));
    return source.sort((left, right) =>
      left.localeCompare(right, "es", { sensitivity: "base" }),
    );
  }, [masterClientes, movements]);
  const proyectoOptions = useMemo(() => {
    const source =
      masterProyectos.length > 0
        ? masterProyectos.map((row) => row.nombreProyecto)
        : movements.map((row) => row.proyecto);

    return Array.from(new Set(source.filter(Boolean))).sort((left, right) =>
      left.localeCompare(right, "es", { sensitivity: "base" }),
    );
  }, [masterProyectos, movements]);
  const siteOptions = useMemo(() => {
    return Array.from(new Set(movements.map((row) => row.site).filter(Boolean))).sort((left, right) =>
      left.localeCompare(right, "es", { sensitivity: "base" }),
    );
  }, [movements]);

  const scopeDescription = useMemo(() => {
    if (activeLevel === "cliente") {
      return "";
    }

    if (activeLevel === "proyecto") {
      return selectedProyecto ? `Ranking, detalle y movimientos del proyecto ${selectedProyecto}.` : "";
    }

    if (winnerScopeLevel === "site") {
      return selectedSite ? `Ranking, detalle y movimientos del site ${selectedSite}.` : "";
    }

    return selectedSite
      ? `Ranking, detalle y movimientos del site ${selectedSite}.`
      : "";
  }, [activeLevel, selectedCliente, selectedProyecto, selectedSite, winnerScopeLevel]);

  const resolveSiteOwner = (siteName: string) => {
    const normalizedSite = normalizeText(siteName);
    const siteMatch = movements.find((row) => normalizeText(row.site) === normalizedSite);

    return {
      cliente: siteMatch?.cliente || "",
      proyecto: siteMatch?.proyecto || "",
    };
  };

  const handleRankingSelection = (label: string) => {
    if (activeLevel === "cliente") {
      setSelectedCliente(label);
      setSelectedProyecto("");
      setSelectedSite("");
      return;
    }

    if (activeLevel === "proyecto") {
      setSelectedProyecto(label);
      setSelectedSite("");
      return;
    }

    const resolvedSiteOwner = resolveSiteOwner(label);
    if (resolvedSiteOwner.cliente) {
      setSelectedCliente(resolvedSiteOwner.cliente);
    }
    if (resolvedSiteOwner.proyecto) {
      setSelectedProyecto(resolvedSiteOwner.proyecto);
    }
    setSelectedSite(label);
  };

  const handleApplyFilters = () => {
    setAppliedLookupValue(draftLookupValue);
    setDetailPage(1);
    if (draftLookupValue?.filtro) {
      setSelectedCliente(draftLookupValue.filtro.nombreCliente ?? "");
      setSelectedProyecto(draftLookupValue.filtro.nombreProyecto ?? "");
      setSelectedSite(draftLookupValue.filtro.nombreSite ?? "");
    } else {
      setSelectedCliente("");
      setSelectedProyecto("");
      setSelectedSite("");
    }
    void loadRows({
      fechaInicio: draftFechaInicio,
      fechaFin: draftFechaFin,
      resetSelection: false,
    });
  };

  const handleExportRanking = async () => {
    if (displayRanking.length === 0) return;

    const levelLabel = currentLevelLabel.toLowerCase();
    const exportRows = displayRanking.map((row) => ({
      Nivel: row.label,
      ...(activeLevel === "proyecto" ? { Cliente: row.cliente || "-" } : {}),
      ...(activeLevel === "site" ? { Cliente: row.cliente || "-", Proyecto: row.proyecto || "-" } : {}),
      Ingresos: formatCurrency(row.ingresosPen, "PEN"),
      Egresos: formatCurrency(row.egresosPen, "PEN"),
      Neto: formatCurrency(row.netoPen, "PEN"),
      Registros: row.count,
    }));

    await exportRowsToExcel(
      exportRows,
      `detalle_${levelLabel}`,
      `analisis_detalle_${sanitizeFileName(levelLabel)}_${appliedFechaInicio}_${appliedFechaFin}.xlsx`,
    );
  };

  const handleExportVisibleMovements = async () => {
    if (detailSortedRows.length === 0) return;

    const exportRows = detailSortedRows.map((row, index) => ({
      Item: index + 1,
      Fecha: row.fechaRaw || "-",
      Tipo: row.tipo,
      ...(activeLevel === "proyecto" ? { Cliente: row.cliente } : {}),
      Proyecto: row.proyecto,
      Site: row.site,
      Moneda: row.moneda,
      Monto: formatCurrency(resolveEgresoBaseAmount(row), row.moneda),
      "Monto en PEN": formatCurrency(
        convertAmountToPen(resolveEgresoBaseAmount(row), row.moneda, appliedUsdExchangeRate, appliedDopExchangeRate),
        "PEN",
      ),
      Detalle: row.detalle,
    }));

    await exportRowsToExcel(
      exportRows,
      "movimientos",
      `analisis_movimientos_${sanitizeFileName(currentLevelLabel)}_${appliedFechaInicio}_${appliedFechaFin}.xlsx`,
    );
  };

  return (
    <AppPage
      fillHeight
      style={{
        paddingTop: 10,
        background:
          "radial-gradient(circle at top left, rgba(37,99,235,0.12), transparent 32%), radial-gradient(circle at top right, rgba(20,184,166,0.12), transparent 28%), linear-gradient(180deg, #F8FAFC 0%, #EEF2FF 100%)",
      }}
    >
      <AppCard style={{ borderRadius: 18, marginBottom: 8 }}>
        <div style={styles.filtersGrid}>
          <label style={styles.field}>
            <span style={styles.label}>Fecha inicio</span>
            <input style={styles.input} type="date" value={draftFechaInicio} onChange={(event) => setDraftFechaInicio(event.target.value)} />
          </label>
          <label style={styles.field}>
            <span style={styles.label}>Fecha fin</span>
            <input style={styles.input} type="date" value={draftFechaFin} onChange={(event) => setDraftFechaFin(event.target.value)} />
          </label>
          <div style={{ ...styles.field, minWidth: 280 }}>
            <span style={styles.label}>Búsqueda</span>
            <FiltroOperativoLookup
              value={draftLookupValue}
              onChange={setDraftLookupValue}
              showTrabajo={false}
              showOt={false}
              showTarea={false}
            />
          </div>
          <label style={styles.field}>
            <span style={styles.label}>Tipo USD</span>
            <input style={styles.input} value={draftUsdExchangeRate} onChange={(event) => setDraftUsdExchangeRate(event.target.value)} />
          </label>
          <label style={styles.field}>
            <span style={styles.label}>Tipo DOP</span>
            <input style={styles.input} value={draftDopExchangeRate} onChange={(event) => setDraftDopExchangeRate(event.target.value)} />
          </label>
          <div style={styles.actions}>
            <button style={styles.secondaryButton} type="button" onClick={handleApplyFilters} disabled={loading}>
              {loading ? "Cargando..." : "Aplicar filtros"}
            </button>
          </div>
        </div>
      </AppCard>

      {error ? (
        <AppStatusMessage tone="error" style={{ marginBottom: 8 }}>
          {error}
        </AppStatusMessage>
      ) : null}

      <div style={styles.kpiGrid}>
        <AppCard style={{ ...styles.kpiCard, background: "linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)" }}>
          <div style={styles.kpiLabel}>Ingresos totales</div>
          <div style={{ ...styles.kpiValue, color: "#166534" }}>{formatCurrency(totalIngresos, "PEN")}</div>
          <div style={styles.kpiHelper}>Convertido a soles</div>
        </AppCard>
        <AppCard style={{ ...styles.kpiCard, background: "linear-gradient(135deg, #FEF2F2 0%, #FECACA 100%)" }}>
          <div style={styles.kpiLabel}>Egresos totales</div>
          <div style={{ ...styles.kpiValue, color: "#991B1B" }}>{formatCurrency(totalEgresos, "PEN")}</div>
          <div style={styles.kpiHelper}>Convertido a soles</div>
        </AppCard>
        <AppCard
          style={{
            ...styles.kpiCard,
            background: saldo >= 0 ? "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)" : "linear-gradient(135deg, #FEF2F2 0%, #FECACA 100%)",
          }}
        >
          <div style={styles.kpiLabel}>Saldo neto</div>
          <div style={{ ...styles.kpiValue, color: saldo >= 0 ? "#1E3A8A" : "#7F1D1D" }}>{formatCurrency(saldo, "PEN")}</div>
          <div style={styles.kpiHelper}>Ingresos menos egresos</div>
        </AppCard>
        <AppCard style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Avance egresos / ingresos</div>
          <div style={{ ...styles.kpiValue, color: "#92400E" }}>{formatPercent(avance)}</div>
          <div style={styles.kpiHelper}>Referencia gerencial</div>
        </AppCard>
      </div>

      {loading ? (
        <AppCard style={{ borderRadius: 18, minHeight: 240, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={styles.loadingBox}>
            <div style={styles.loadingText}>Cargando analisis gerencial...</div>
          </div>
        </AppCard>
      ) : displayRanking.length === 0 ? (
        <AppCard style={{ borderRadius: 18, minHeight: 240, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AppStatusMessage tone="info">No se encontraron registros para los filtros aplicados.</AppStatusMessage>
        </AppCard>
      ) : (
        <>
          <div style={styles.kpiGrid}>
            <AppCard style={styles.winnerScopeCard}>
                <div style={styles.winnerScopeRow}>
                  <div>
                    <div style={styles.kpiLabel}>Criterio de seleccion</div>
                  </div>
                  <div style={styles.winnerScopeActions}>
                  {(["cliente", "proyecto", "site"] as LevelKey[]).map((level) => (
                    <button
                      key={level}
                      type="button"
                      style={winnerScopeLevel === level ? styles.kpiPillButtonActive : styles.kpiPillButton}
                      onClick={() => {
                        startTransition(() => {
                          setWinnerScopeLevel(level);
                          setDetailPage(1);

                          if (level === "cliente") {
                            setSelectedCliente("");
                            setSelectedProyecto("");
                            setSelectedSite("");
                            return;
                          }

                          if (level === "proyecto") {
                            setSelectedCliente("");
                            setSelectedProyecto("");
                            setSelectedSite("");
                            return;
                          }
                        });
                      }}
                      aria-pressed={winnerScopeLevel === level}
                    >
                      {level === "cliente" ? "Por cliente" : level === "proyecto" ? "Por proyecto" : "Por site"}
                    </button>
                  ))}
                </div>
              </div>
            </AppCard>
            <AppCard style={styles.highlightCard}>
              <div style={styles.kpiLabel}>Quien gana mas</div>
              <div style={styles.highlightTitle}>{topWinner?.label ?? "-"}</div>
              <div style={{ ...styles.kpiValue, color: "#166534" }}>{formatCurrency(topWinner?.netoPen ?? 0, "PEN")}</div>
            </AppCard>
            <AppCard style={styles.highlightCard}>
              <div style={styles.kpiLabel}>Quien pierde mas</div>
              <div style={styles.highlightTitle}>{topLoser?.label ?? "-"}</div>
              <div style={{ ...styles.kpiValue, color: "#991B1B" }}>{formatCurrency(topLoser?.netoPen ?? 0, "PEN")}</div>
            </AppCard>
          </div>

          <div style={styles.analysisGrid}>
            <AppCard style={styles.analysisChartCard}>
              <AppSectionHeader
                title={`Ranking por ${currentLevelLabel.toLowerCase()}`}
                description={scopeDescription}
              />
              <div style={styles.chartBreadcrumb}>
                <span style={styles.chartBreadcrumbLabel}>Ruta</span>
                <div style={styles.chartBreadcrumbTrail}>
                  {winnerScopeLevel === "cliente" ? (
                    <button
                      type="button"
                      style={!selectedCliente ? styles.chartBreadcrumbButtonActive : styles.chartBreadcrumbButton}
                      onClick={() => {
                        setSelectedCliente("");
                        setSelectedProyecto("");
                        setSelectedSite("");
                      }}
                    >
                      Cliente
                    </button>
                  ) : winnerScopeLevel === "proyecto" ? (
                    <button
                      type="button"
                      style={!selectedProyecto ? styles.chartBreadcrumbButtonActive : styles.chartBreadcrumbButton}
                      onClick={() => {
                        setSelectedProyecto("");
                        setSelectedSite("");
                      }}
                    >
                      Proyecto
                    </button>
                  ) : (
                    <button
                      type="button"
                      style={!selectedSite ? styles.chartBreadcrumbButtonActive : styles.chartBreadcrumbButton}
                      onClick={() => {
                        setSelectedSite("");
                      }}
                    >
                      Site
                    </button>
                  )}
                  {winnerScopeLevel === "cliente" && selectedCliente ? <ChevronRight size={14} strokeWidth={2.2} color="#94A3B8" /> : null}
                  {winnerScopeLevel === "cliente" && selectedCliente ? (
                    <button
                      type="button"
                      style={!selectedProyecto ? styles.chartBreadcrumbButtonActive : styles.chartBreadcrumbButton}
                      onClick={() => {
                        setSelectedProyecto("");
                        setSelectedSite("");
                      }}
                    >
                      {selectedCliente}
                    </button>
                  ) : null}
                  {winnerScopeLevel === "cliente" && selectedProyecto ? <ChevronRight size={14} strokeWidth={2.2} color="#94A3B8" /> : null}
                  {winnerScopeLevel === "cliente" && selectedProyecto ? (
                    <button
                      type="button"
                      style={!selectedSite ? styles.chartBreadcrumbButtonActive : styles.chartBreadcrumbButton}
                      onClick={() => {
                        setSelectedSite("");
                      }}
                    >
                      {selectedProyecto}
                    </button>
                  ) : null}
                  {winnerScopeLevel === "proyecto" && selectedProyecto ? <ChevronRight size={14} strokeWidth={2.2} color="#94A3B8" /> : null}
                  {winnerScopeLevel === "proyecto" && selectedProyecto ? (
                    <button
                      type="button"
                      style={!selectedSite ? styles.chartBreadcrumbButtonActive : styles.chartBreadcrumbButton}
                      onClick={() => {
                        setSelectedSite("");
                      }}
                    >
                      {selectedProyecto}
                    </button>
                  ) : null}
                  {selectedSite ? <ChevronRight size={14} strokeWidth={2.2} color="#94A3B8" /> : null}
                  {selectedSite ? <span style={styles.chartBreadcrumbFinal}>{selectedSite}</span> : null}
                </div>
              </div>
              <div style={styles.chartLegendLayout}>
                <div style={styles.chartPane}>
                  <div style={styles.chartWrap}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={rankingPieData} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={64} outerRadius={110} paddingAngle={3}>
                          {rankingPieData.map((entry) => (
                            <Cell
                              key={entry.label}
                              fill={entry.color}
                              style={{ cursor: "pointer" }}
                              onClick={() => handleRankingSelection(entry.label)}
                            />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatCurrency(Number(value), "PEN")} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={styles.chartCenterOverlay}>
                      <div style={styles.chartCenterValue}>{formatCompactSoles(saldo)}</div>
                      <div style={styles.chartCenterLabel}>Saldo</div>
                    </div>
                  </div>
                </div>
                <div style={styles.legendPane}>
                  <div style={styles.legendGrid}>
                    {rankingPieData.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        style={
                          (activeLevel === "cliente" && normalizeText(selectedCliente) === normalizeText(item.label)) ||
                          (activeLevel === "proyecto" && normalizeText(selectedProyecto) === normalizeText(item.label)) ||
                          (activeLevel === "site" && normalizeText(selectedSite) === normalizeText(item.label))
                            ? styles.legendItemSelected
                            : styles.legendItem
                        }
                        onClick={() => handleRankingSelection(item.label)}
                      >
                        <span style={{ ...styles.legendDot, background: item.color }} />
                        <span style={styles.legendText}>{item.label}</span>
                    <span style={styles.legendValue}>{formatCurrency(item.signedValue, "PEN")}</span>
                  </button>
                ))}
              </div>
                </div>
              </div>
              {winnerScopeLevel === "site" ? (
                <div style={styles.siteFootnote}>
                  Se muestran los 5 clientes con mayor perdida y ganancia neta.
                </div>
              ) : null}
            </AppCard>

          <AppCard style={styles.analysisTableCard}>
              <div style={styles.sectionHeaderWithAction}>
                <AppSectionHeader title={`Detalle por ${currentLevelLabel.toLowerCase()}`} />
                <button
                  type="button"
                  style={styles.exportButton}
                  onClick={handleExportRanking}
                  disabled={displayRanking.length === 0}
                  title={`Exportar detalle por ${currentLevelLabel.toLowerCase()}`}
                  aria-label={`Exportar detalle por ${currentLevelLabel.toLowerCase()}`}
                >
                  Exportar
                </button>
              </div>
              <RankingTable
                rows={displayRanking}
                kind="neto"
                showClient={activeLevel === "proyecto" || activeLevel === "site"}
                showProject={activeLevel === "site"}
                onRowClick={(row) => {
                  handleRankingSelection(row.label);
                }}
              />
            </AppCard>
          </div>

          <AppCard style={{ borderRadius: 18, marginTop: 10, padding: 12 }}>
            <div style={styles.detailHeaderCompact}>
              <h2 style={styles.detailHeaderTitle}>{`Detalle de movimientos (${detailSortedRows.length})`}</h2>
              <div style={styles.detailHeaderActions}>
                <button
                  type="button"
                  style={styles.exportButton}
                  onClick={handleExportVisibleMovements}
                  disabled={visibleDetailRows.length === 0}
                  title="Exportar"
                  aria-label="Exportar"
                >
                  Exportar
                </button>
                <button
                  type="button"
                  style={styles.detailCollapseButton}
                  onClick={() => setIsDetailCollapsed((current) => !current)}
                  aria-label={isDetailCollapsed ? "Expandir detalle de movimientos" : "Comprimir detalle de movimientos"}
                  title={isDetailCollapsed ? "Expandir detalle de movimientos" : "Comprimir detalle de movimientos"}
                >
                  {isDetailCollapsed ? <ChevronDown size={16} strokeWidth={2.4} /> : <ChevronUp size={16} strokeWidth={2.4} />}
                </button>
              </div>
            </div>

            {isDetailCollapsed ? null : !detailSortedRows.length ? (
              <AppStatusMessage tone="info">No se encontraron movimientos con los filtros aplicados.</AppStatusMessage>
            ) : (
              <div style={styles.detailTableWrap}>
                <div style={styles.detailTablePager}>
                  <div style={styles.tablePagerInfo}>
                    Mostrando {detailSortedRows.length === 0 ? 0 : (detailPage - 1) * detailPageSize + 1}-
                    {Math.min(detailPage * detailPageSize, detailSortedRows.length)} de {detailSortedRows.length}
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
                        {[25, 50, 100].map((size) => (
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
                      aria-label="Primera pagina"
                      title="Primera pagina"
                    >
                      <ChevronsLeft size={16} />
                    </button>
                    <button
                      type="button"
                      style={styles.secondaryButton}
                      onClick={() => setDetailPage((current) => Math.max(1, current - 1))}
                      disabled={detailPage === 1}
                      aria-label="Pagina anterior"
                      title="Pagina anterior"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span style={styles.tablePagerPage}>
                      Pagina {detailPage} de {totalDetailPages}
                    </span>
                    <button
                      type="button"
                      style={styles.secondaryButton}
                      onClick={() => setDetailPage((current) => Math.min(totalDetailPages, current + 1))}
                      disabled={detailPage === totalDetailPages}
                      aria-label="Pagina siguiente"
                      title="Pagina siguiente"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <button
                      type="button"
                      style={styles.secondaryButton}
                      onClick={() => setDetailPage(totalDetailPages)}
                      disabled={detailPage === totalDetailPages}
                      aria-label="Ultima pagina"
                      title="Ultima pagina"
                    >
                      <ChevronsRight size={16} />
                    </button>
                  </div>
                </div>
                <div style={styles.tableWrap}>
                  <div style={styles.tableScroll}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          {[
                            ["fecha", "Fecha"],
                            ["tipo", "Tipo"],
                            ...(activeLevel === "proyecto" ? ([["cliente", "Cliente"]] as Array<[string, string]>) : []),
                            ["proyecto", "Proyecto"],
                            ["site", "Site"],
                            ["moneda", "Moneda"],
                            ["monto", "Monto"],
                            ["montoPen", "Monto en PEN"],
                            ["detalle", "Detalle"],
                          ].map(([column, label]) => {
                            const isActive = detailSortColumn === column;
                            const icon = isActive ? (detailSortDirection === "asc" ? "Ã¢â€“Â²" : "Ã¢â€“Â¼") : "";
                            return (
                              <th key={column} style={styles.th}>
                                <button
                                  type="button"
                                  style={styles.thButton}
                                  onClick={() => {
                                    setDetailPage(1);
                                    setDetailSortColumn((current) => {
                                      if (current === column) {
                                        setDetailSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
                                        return current;
                                      }
                                      setDetailSortDirection("asc");
                                      return column as DetailSortColumn;
                                    });
                                  }}
                                >
                                  {label} {icon}
                                </button>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleDetailRows.map((row, index) => (
                          <tr key={`${row.fechaRaw}-${row.cliente}-${row.proyecto}-${row.site}-${index}`}>
                            <td style={styles.tdStrong}>{row.fechaRaw || "-"}</td>
                            <td style={styles.td}>{row.tipo}</td>
                            {activeLevel === "proyecto" ? <td style={styles.td}>{row.cliente}</td> : null}
                            <td style={styles.td}>{row.proyecto}</td>
                            <td style={styles.td}>{row.site}</td>
                            <td style={styles.td}>{row.moneda}</td>
                            <td style={styles.tdStrong}>{formatCurrency(resolveEgresoBaseAmount(row), row.moneda)}</td>
                            <td style={styles.tdStrong}>
                              {formatCurrency(convertAmountToPen(resolveEgresoBaseAmount(row), row.moneda, appliedUsdExchangeRate, appliedDopExchangeRate), "PEN")}
                            </td>
                            <td style={styles.td}>{row.detalle}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </AppCard>
        </>
      )}
    </AppPage>
  );
}

function RankingTable({
  rows,
  kind = "neto",
  onRowClick,
  showClient = false,
  showProject = false,
}: {
  rows: RankingRow[];
  kind?: "ingreso" | "egreso" | "neto";
  onRowClick?: (row: RankingRow) => void;
  showClient?: boolean;
  showProject?: boolean;
}) {
  return (
    <div style={styles.tableWrap}>
      <div style={styles.tableScroll}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Nivel</th>
              {showClient ? <th style={styles.th}>Cliente</th> : null}
              {showProject ? <th style={styles.th}>Proyecto</th> : null}
              <th style={styles.thRight}>Ingresos</th>
              <th style={styles.thRight}>Egresos</th>
              <th style={styles.thRight}>{kind === "ingreso" ? "Ingresos" : kind === "egreso" ? "Egresos" : "Neto"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const mainValue = kind === "ingreso" ? row.ingresosPen : kind === "egreso" ? row.egresosPen : row.netoPen;
              return (
                <tr
                  key={row.label}
                  style={onRowClick ? styles.clickableRow : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  <td style={styles.tdStrong}>{row.label}</td>
                  {showClient ? <td style={styles.td}>{row.cliente || "-"}</td> : null}
                  {showProject ? <td style={styles.td}>{row.proyecto || "-"}</td> : null}
                  <td style={styles.tdRight}>{formatCurrency(row.ingresosPen, "PEN")}</td>
                  <td style={styles.tdRight}>{formatCurrency(row.egresosPen, "PEN")}</td>
                  <td style={{ ...styles.tdRight, fontWeight: 700, color: mainValue >= 0 ? "#14532D" : "#7F1D1D" }}>
                    {formatCurrency(mainValue, "PEN")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  filtersGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(160px, 1fr) minmax(160px, 1fr) minmax(280px, 1.6fr) minmax(120px, 0.7fr) minmax(120px, 0.7fr) auto",
    gap: 8,
    alignItems: "end",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: 700,
    color: "#334155",
  },
  input: {
    height: 40,
    borderRadius: 12,
    border: "1px solid #CBD5E1",
    padding: "0 12px",
    outline: "none",
    fontSize: 14,
    background: "#fff",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
  },
  secondaryButton: {
    height: 40,
    borderRadius: 12,
    border: "1px solid #C7D2FE",
    background: "linear-gradient(135deg, #FFFFFF 0%, #EFF6FF 100%)",
    color: "#1D4ED8",
    fontWeight: 700,
    padding: "0 16px",
    cursor: "pointer",
  },
  exportButton: {
    height: 40,
    borderRadius: 12,
    border: "1px solid #2563EB",
    background: "linear-gradient(135deg, #1D4ED8 0%, #2563EB 100%)",
    color: "#fff",
    fontWeight: 800,
    padding: "0 16px",
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(37,99,235,0.18)",
  },
  selectionBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  selectionButton: {
    borderRadius: 999,
    border: "1px solid #BFDBFE",
    background: "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)",
    color: "#1D4ED8",
    padding: "8px 16px",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 1px 0 rgba(255,255,255,0.8) inset",
  },
  selectionButtonActive: {
    borderRadius: 999,
    border: "1px solid #2563EB",
    background: "linear-gradient(135deg, #1D4ED8 0%, #2563EB 100%)",
    color: "#fff",
    padding: "8px 16px",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(37,99,235,0.18)",
  },
  selectionFinal: {
    fontWeight: 800,
    color: "#0F172A",
    padding: "8px 2px",
  },
    kpiGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      gap: 10,
      marginBottom: 2,
      alignItems: "stretch",
    },
    kpiCard: {
      borderRadius: 18,
      padding: "8px 16px",
      minHeight: 80,
    },
  highlightCard: {
    borderRadius: 18,
    padding: "8px 12px",
    minHeight: 78,
    height: "100%",
    marginBottom: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },
  winnerScopeCard: {
    borderRadius: 18,
    padding: "8px 12px",
    minHeight: 78,
    height: "100%",
    marginBottom: 0,
    display: "flex",
    alignItems: "center",
  },
  winnerScopeRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    width: "100%",
  },
  winnerScopeActions: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap",
  },
  kpiPillButton: {
    borderRadius: 999,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#334155",
    fontSize: 10,
    fontWeight: 800,
    padding: "3px 9px",
    cursor: "pointer",
  },
  kpiPillButtonActive: {
    borderRadius: 999,
    border: "1px solid #2563EB",
    background: "linear-gradient(135deg, #1D4ED8 0%, #2563EB 100%)",
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: 800,
    padding: "3px 9px",
    cursor: "pointer",
    boxShadow: "0 6px 14px rgba(37,99,235,0.18)",
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: 800,
    color: "#64748B",
      textTransform: "uppercase",
      letterSpacing: 0.4,
      marginBottom: 2,
    },
    kpiValue: {
      fontSize: 21,
      fontWeight: 800,
      lineHeight: 1,
    },
    kpiHelper: {
      marginTop: 0,
      fontSize: 11,
      color: "#64748B",
    },
    highlightTitle: {
      fontSize: 15,
      fontWeight: 800,
      color: "#0F172A",
      marginBottom: 0,
      minHeight: 18,
      lineHeight: 1,
    },
  tabs: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  tab: {
    borderRadius: 12,
    border: "1px solid #CBD5E1",
    padding: "10px 16px",
    background: "#F8FAFC",
    color: "#334155",
    fontWeight: 700,
    cursor: "pointer",
  },
  tabActive: {
    background: "linear-gradient(135deg, #1D4ED8 0%, #2563EB 100%)",
    color: "#fff",
    borderColor: "#1D4ED8",
  },
    analysisGrid: {
      display: "grid",
      gridTemplateColumns: "minmax(0, 0.95fr) minmax(0, 1.25fr)",
      gap: 6,
      marginTop: 0,
    },
  analysisChartCard: {
    borderRadius: 18,
    padding: 10,
  },
  analysisTableCard: {
    borderRadius: 18,
    padding: 10,
  },
  sectionHeaderWithAction: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 8,
  },
  detailHeaderCompact: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 10,
  },
  detailHeaderActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  detailHeaderTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    color: "#0F172A",
  },
  detailCollapseButton: {
    width: 36,
    minHeight: 36,
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    padding: 0,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 1px 0 rgba(255,255,255,0.9) inset",
  },
  detailTableWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minWidth: 0,
  },
  detailTablePager: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  tablePagerInfo: {
    fontSize: 13,
    fontWeight: 700,
    color: "#334155",
  },
  tablePagerControls: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  pageSizeLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 700,
    color: "#334155",
  },
  pageSizeSelect: {
    height: 36,
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    background: "#fff",
    padding: "0 10px",
    fontSize: 13,
    outline: "none",
  },
  tablePagerPage: {
    fontSize: 13,
    fontWeight: 800,
    color: "#475569",
    whiteSpace: "nowrap",
  },
  chartBreadcrumb: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 10,
    marginBottom: 8,
    padding: "10px 12px",
    borderRadius: 14,
    background: "linear-gradient(135deg, #F8FAFF 0%, #EEF2FF 100%)",
    border: "1px solid #E2E8F0",
  },
  chartBreadcrumbLabel: {
    fontSize: 12,
    fontWeight: 800,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chartBreadcrumbTrail: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    minWidth: 0,
  },
  chartBreadcrumbButton: {
    borderRadius: 999,
    border: "1px solid #BFDBFE",
    background: "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)",
    color: "#1D4ED8",
    padding: "6px 12px",
    fontWeight: 800,
    cursor: "pointer",
  },
  chartBreadcrumbButtonActive: {
    borderRadius: 999,
    border: "1px solid #2563EB",
    background: "linear-gradient(135deg, #1D4ED8 0%, #2563EB 100%)",
    color: "#fff",
    padding: "6px 12px",
    fontWeight: 800,
    cursor: "pointer",
  },
  chartBreadcrumbFinal: {
    fontWeight: 800,
    color: "#0F172A",
    padding: "6px 2px",
  },
  chartWrap: {
    position: "relative",
    width: "100%",
    height: "100%",
  },
  chartLegendLayout: {
    display: "flex",
    alignItems: "stretch",
    gap: 12,
    marginTop: 8,
    flexWrap: "wrap",
  },
  chartPane: {
    flex: "1 1 320px",
    minWidth: 280,
    height: 220,
  },
  legendPane: {
    flex: "1 1 360px",
    minWidth: 300,
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
    fontWeight: 800,
    color: "#0F172A",
    lineHeight: 1.05,
  },
  chartCenterLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.3,
    color: "#64748B",
    textTransform: "uppercase",
  },
  legendGrid: {
    display: "grid",
    gap: 8,
    marginTop: 0,
    maxHeight: 220,
    overflowY: "auto",
    paddingRight: 4,
  },
  legendItem: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "16px minmax(0, 1fr) auto",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    border: "1px solid #E2E8F0",
    padding: "10px 12px",
    background: "#fff",
    textAlign: "left",
    cursor: "pointer",
  },
  legendItemSelected: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "16px minmax(0, 1fr) auto",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    border: "1px solid #BFDBFE",
    padding: "10px 12px",
    background: "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)",
    textAlign: "left",
    cursor: "pointer",
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    flex: "0 0 auto",
  },
  legendText: {
    fontWeight: 700,
    color: "#0F172A",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  legendValue: {
    fontWeight: 800,
    color: "#0F172A",
    whiteSpace: "nowrap",
  },
  siteFootnote: {
    marginTop: 10,
    paddingTop: 8,
    borderTop: "1px dashed #CBD5E1",
    fontSize: 12,
    fontWeight: 700,
    color: "#475569",
  },
  tableWrap: {
    overflowX: "auto",
  },
  tableScroll: {
    maxHeight: 300,
    overflowY: "auto",
    overflowX: "hidden",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    textAlign: "left",
    padding: "10px 8px",
    borderBottom: "1px solid #E2E8F0",
    color: "#334155",
    fontSize: 12,
    fontWeight: 800,
  },
  thRight: {
    textAlign: "right",
    padding: "10px 8px",
    borderBottom: "1px solid #E2E8F0",
    color: "#334155",
    fontSize: 12,
    fontWeight: 800,
  } as React.CSSProperties,
  thButton: {
    border: "none",
    background: "transparent",
    padding: 0,
    font: "inherit",
    fontWeight: 800,
    color: "inherit",
    cursor: "pointer",
  },
  tdStrong: {
    padding: "10px 8px",
    borderBottom: "1px solid #F1F5F9",
    fontWeight: 700,
    color: "#0F172A",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "10px 8px",
    borderBottom: "1px solid #F1F5F9",
    color: "#0F172A",
    whiteSpace: "nowrap",
  },
  tdRight: {
    padding: "10px 8px",
    borderBottom: "1px solid #F1F5F9",
    textAlign: "right",
    whiteSpace: "nowrap",
  },
  clickableRow: {
    cursor: "pointer",
  },
  loadingBox: {
    padding: 24,
    color: "#1D4ED8",
    fontWeight: 700,
  },
  loadingText: {
    fontSize: 16,
  },
};
