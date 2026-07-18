import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppSectionHeader from "../../../components/base/AppSectionHeader";
import AppStatusMessage from "../../../components/base/AppStatusMessage";
import {
  buildPlanillaPagadosDashboardRequest,
  consultarPlanillaEstados,
} from "../../../api/planillaConsultaService";
import { getHttpErrorMessage } from "../../../utils/httpError";

type RawRow = Record<string, unknown>;

type DrillRow = {
  id: string;
  fechaIngreso: string;
  fechaEmision: string;
  fechaVencimiento: string;
  cliente: string;
  proyecto: string;
  site: string;
  ot: string;
  tarea: string;
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

function normalizeExchangeRateInput(value: string) {
  return value.replace(",", ".").replace(/[^\d.]/g, "");
}

function parseExchangeRateInput(value: string) {
  const parsed = Number(value.replace(",", ".").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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

function parseDisplayDateTime(value: string) {
  const text = value.trim();
  if (!text || text === "-") return Number.NaN;

  const ddmmyyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/;
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

function buildDrillRow(row: RawRow): DrillRow {
  const id = pickString(row, ["Correlativo", "correlativo", "Corre", "corre", "Id", "id"]);
  const fechaIngreso = formatDisplayDate(
    pickString(row, [
      "FechaDeposito",
      "fechadeposito",
      "fechaDeposito",
      "FechaDepositoTexto",
      "fechaDepositoTexto",
      "FecDeposito",
      "fecDeposito",
      "FecIngreso",
      "fecIngreso",
      "FechaIngreso",
      "fechaIngreso",
    ]),
  );
  const fechaEmision = formatDisplayDate(
    pickString(row, [
      "FechaEmision",
      "fechaEmision",
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
  const ot = pickString(row, ["OT", "Ot", "ot"]);
  const tarea = pickString(row, ["Tarea", "tarea", "NombreTarea", "nombreTarea", "TipoTrabajo", "tipoTrabajo"]) || "Sin tarea";
  const tipoPago = pickString(row, ["TipoPago", "tipoPago", "IdTipoPago", "idTipoPago", "TipoPagoLabel", "tipoPagoLabel"]);
  const responsable = pickString(row, ["Responsable", "responsable", "ResponsableLabel", "responsableLabel"]);
  const detalle = pickString(row, ["Detalle", "detalle"]);
  const comentario = pickString(row, ["Comentario", "comentario"]);
  const cuenta = pickString(row, ["Cuenta", "cuenta"]);
  const cuentaInter = pickString(row, ["CuentaInter", "cuentaInter"]);
  const banco = pickString(row, ["Banco", "banco"]);
  const nroOperacion = pickString(row, ["NroOperacion", "nroOperacion"]);
  const solicitante = pickString(row, ["Solicitante", "solicitante"]);
  const gestor = pickString(row, ["Gestor", "gEstor", "gestor"]);
  const validador = pickString(row, ["Validador", "validador"]);
  const bien = pickString(row, ["Bien", "bien"]);
  const comprobante = pickString(row, ["Comprobante", "comprobante"]);
  const serie = pickString(row, ["Serie", "serie"]);
  const rendicion = pickString(row, ["IdRendicion", "idRendicion", "Rendicion", "rendicion"]);
  const facturaUrl = pickString(row, ["RutaFacturaUrl", "rutaFacturaUrl", "FacturaUrl", "facturaUrl", "imgFactura"]);
  const facturaPath = pickString(row, ["RutaFacturaEnviada", "rutaFacturaEnviada", "RutaFacturaOriginal", "rutaFacturaOriginal", "FacturaPath", "facturaPath"]);
  const estado = pickString(row, ["Estado", "estado"]);
  const estadoLabel = pickString(row, ["NombreEstado", "nombreEstado", "EstadoLabel", "estadoLabel"]);
  const idSuministroProvisional = pickString(row, ["idprovisional", "IdSuministroProvisional", "idSuministroProvisional"]);
  const usuario = pickString(row, ["Usuario", "usuario"]);
  const tipoTrabajo = pickString(row, ["Tipo_Trabajo", "TipoTrabajo", "tipoTrabajo"]);
  const siteNombre = pickString(row, ["Site", "SiteNombre", "siteNombre"]);
  const filtroOperativo = [cliente, proyecto, siteNombre || site, tipoTrabajo, tarea].filter(Boolean).join(" - ");
  const moneda = normalizeMonedaLabel(
    pickString(row, ["Moneda", "moneda", "MonedaLabel", "monedaLabel", "TipoMoneda", "tipoMoneda"]),
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
    fechaIngreso: fechaIngreso || "-",
    fechaEmision: fechaEmision || "-",
    fechaVencimiento: fechaVencimiento || "-",
    cliente,
    proyecto,
    site,
    ot: ot || "-",
    tarea,
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

function buildBreakdown(rows: DrillRow[], key: DrillLevel): ChartDatum[] {
  const map = new Map<string, ChartDatum>();

  for (const row of rows) {
    const rawLabel = row[key] || `Sin ${key}`;
    const currency = row.moneda || "Sin moneda";
    const current = map.get(rawLabel);
    if (current) {
      current.value += 1;
      current.count += 1;
      current.amountsByCurrency[currency] = (current.amountsByCurrency[currency] ?? 0) + row.monto;
      continue;
    }

    map.set(rawLabel, {
      label: rawLabel,
      rawLabel,
      value: 1,
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

export default function Dashboard1Page() {
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draftFechaInicio, setDraftFechaInicio] = useState(getYearStartInputValue());
  const [draftFechaFin, setDraftFechaFin] = useState(getMonthEndInputValue());
  const [draftSearchText, setDraftSearchText] = useState("");
  const [draftUsdExchangeRate, setDraftUsdExchangeRate] = useState(String(DEFAULT_EXCHANGE_RATES.USD));
  const [draftDopExchangeRate, setDraftDopExchangeRate] = useState(String(DEFAULT_EXCHANGE_RATES.DOP));
  const [appliedFechaInicio, setAppliedFechaInicio] = useState(getYearStartInputValue());
  const [appliedFechaFin, setAppliedFechaFin] = useState(getMonthEndInputValue());
  const [appliedSearchText, setAppliedSearchText] = useState("");
  const [appliedUsdExchangeRate, setAppliedUsdExchangeRate] = useState<number>(DEFAULT_EXCHANGE_RATES.USD);
  const [appliedDopExchangeRate, setAppliedDopExchangeRate] = useState<number>(DEFAULT_EXCHANGE_RATES.DOP);
  const [path, setPath] = useState<DrillPath>({ cliente: null, proyecto: null, site: null });
  const [totalRows, setTotalRows] = useState(0);
  const [activeTab, setActiveTab] = useState<"resumen" | "detalle">("resumen");
  const [detailSortColumn, setDetailSortColumn] = useState<DetailSortColumn>("fecha");
  const [detailSortDirection, setDetailSortDirection] = useState<"asc" | "desc">("asc");
  const [levelSortColumn, setLevelSortColumn] = useState<LevelSortColumn>("nivel");
  const [levelSortDirection, setLevelSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedGastoRow, setSelectedGastoRow] = useState<DrillRow | null>(null);
  const [selectedLevelItem, setSelectedLevelItem] = useState<ChartDatum | null>(null);
  const isMountedRef = useRef(true);

  const loadRows = async (params?: { fechaInicio?: string; fechaFin?: string; searchText?: string }) => {
    const fechaInicio = params?.fechaInicio ?? draftFechaInicio;
    const fechaFin = params?.fechaFin ?? draftFechaFin;
    const searchText = params?.searchText ?? draftSearchText;

    setLoading(true);
    setError("");

    try {
      const response = await consultarPlanillaEstados(
        buildPlanillaPagadosDashboardRequest({
          fechaInicio,
          fechaFin,
          textoBusqueda: searchText,
        }),
        { timeoutMs: 120000 },
      );
      const detailRows = Array.isArray(response.rows) ? response.rows : [];

      if (!isMountedRef.current) return;

      if (response.limitExceeded) {
        setRawRows([]);
        setError(response.message?.trim() || "La consulta excedio el maximo permitido para el dashboard.");
        return;
      }

      setAppliedFechaInicio(fechaInicio);
      setAppliedFechaFin(fechaFin);
      setAppliedSearchText(searchText);
      setPath({ cliente: null, proyecto: null, site: null });
      setActiveTab("resumen");
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
      searchText: "",
    });

    return () => {
      isMountedRef.current = false;
    };
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
  const chartData = useMemo(() => buildBreakdown(filteredRows, currentLevel), [currentLevel, filteredRows]);
  const visibleCurrencies = useMemo(() => {
    const set = new Set<string>();
    for (const row of filteredRows) {
      set.add(row.moneda || "Sin moneda");
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [filteredRows]);
  const totalsByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of filteredRows) {
      map.set(row.moneda, (map.get(row.moneda) ?? 0) + row.monto);
    }
    return Array.from(map.entries())
      .map(([currency, total]) => ({ currency, total }))
      .sort((a, b) => a.currency.localeCompare(b.currency));
  }, [filteredRows]);
  const totalConvertedToPen = useMemo(() => {
    return totalsByCurrency.reduce((accumulator, item) => {
      return accumulator + convertToPen(item.total, item.currency, appliedUsdExchangeRate, appliedDopExchangeRate);
    }, 0);
  }, [appliedDopExchangeRate, appliedUsdExchangeRate, totalsByCurrency]);
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
            return parseDisplayDateTime(left.fechaIngreso);
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
            return parseDisplayDateTime(right.fechaIngreso);
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

  const handleDetailSortClick = (column: DetailSortColumn) => {
    if (detailSortColumn === column) {
      setDetailSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setDetailSortColumn(column);
    setDetailSortDirection("asc");
  };

  const handleApplyFilters = async () => {
    const usdExchangeRate = parseExchangeRateInput(draftUsdExchangeRate);
    const dopExchangeRate = parseExchangeRateInput(draftDopExchangeRate);

    if (usdExchangeRate == null || dopExchangeRate == null) {
      setError("Ingrese tipos de cambio validos y mayores que cero para USD y DOP.");
      return;
    }

    setAppliedUsdExchangeRate(usdExchangeRate);
    setAppliedDopExchangeRate(dopExchangeRate);

    await loadRows({
      fechaInicio: draftFechaInicio,
      fechaFin: draftFechaFin,
      searchText: draftSearchText,
    });
  };

  const handleChartClick = (datum: ChartDatum) => {
    if (currentLevel === "tarea") return;
    setPath((prev) => getNextPath(currentLevel, prev, datum.rawLabel));
  };

  const handleOpenLevelItem = (item: ChartDatum) => {
    setSelectedLevelItem(item);
  };

  const handleCloseLevelItem = () => {
    setSelectedLevelItem(null);
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
      Fecha: row.fechaIngreso,
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
  };

  const handleCloseRowDetails = () => {
    setSelectedGastoRow(null);
  };

  return (
    <AppPage title="">
      <div style={styles.page}>
        <AppCard>
          <div style={styles.filtersRow}>
            <div style={styles.filterField}>
              <label style={styles.label}>Fecha inicio</label>
              <input type="date" value={draftFechaInicio} onChange={(event) => setDraftFechaInicio(event.target.value)} style={styles.input} />
            </div>
            <div style={styles.filterField}>
              <label style={styles.label}>Fecha fin</label>
              <input type="date" value={draftFechaFin} onChange={(event) => setDraftFechaFin(event.target.value)} style={styles.input} />
            </div>
            <div style={{ ...styles.filterField, flex: 1.5 }}>
              <label style={styles.label}>Búsqueda</label>
              <input
                type="text"
                value={draftSearchText}
                onChange={(event) => setDraftSearchText(event.target.value)}
                placeholder="Cliente, proyecto, site o tarea..."
                style={styles.input}
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
          <MetricCard label="Total DOP" value={formatCurrency(totalsByCurrency.find((item) => item.currency === "DOP")?.total ?? 0, "DOP")} />
          <MetricCard label="Total PEN" value={formatCurrency(totalsByCurrency.find((item) => item.currency === "PEN")?.total ?? 0, "PEN")} />
          <MetricCard label="Total USD" value={formatCurrency(totalsByCurrency.find((item) => item.currency === "USD")?.total ?? 0, "USD")} />
        </div>

        <div style={styles.tabBar}>
          <button type="button" style={activeTab === "resumen" ? styles.tabButtonActive : styles.tabButton} onClick={() => setActiveTab("resumen")}>
            Resumen
          </button>
          <button type="button" style={activeTab === "detalle" ? styles.tabButtonActive : styles.tabButton} onClick={() => setActiveTab("detalle")}>
            Detalle de registros
          </button>
        </div>

        {activeTab === "resumen" ? (
          <>
        <AppCard>
          <AppSectionHeader title={getLevelTitle(currentLevel, path)} description={getLevelDescription(currentLevel)} />

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

          {loading ? (
            <div style={styles.loadingBox}>Cargando informaciÃ³n del store...</div>
          ) : chartData.length === 0 ? (
            <div style={styles.emptyBox}>No se encontraron datos para el filtro seleccionado.</div>
          ) : (
            <div style={styles.chartLayout}>
              <div style={styles.chartBox}>
                <div style={styles.chartBoxInner}>
                  <div style={styles.pieWrap}>
                    <ResponsiveContainer width="100%" height={340}>
                      <PieChart>
                        <Pie
                          data={chartData}
                          dataKey="value"
                          nameKey="label"
                          innerRadius={56}
                          outerRadius={88}
                          cx="50%"
                          cy="50%"
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
                        </Pie>
                        <Tooltip formatter={(value) => `${Number(value ?? 0)} registro(s)`} />
                      </PieChart>
                    </ResponsiveContainer>
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
                      </button>
                    ))}
                  </div>
                </div>
              </div>

                <div style={styles.detailPanel}>
                  <div style={styles.detailHeaderRow}>
                    <div style={styles.detailHeaderTitle}>
                      <AppSectionHeader title="Detalle del nivel actual" description="Puedes hacer clic en una fila para seguir navegando en la estructura del gasto." />
                    </div>
                    <div style={styles.sidePanelTopRow}>
                      <div style={styles.sideCardWide}>
                        <div style={styles.sideLabel}>Periodo aplicado</div>
                        <strong style={styles.sideValue}>{appliedFechaInicio} al {appliedFechaFin}</strong>
                      </div>
                      <div style={styles.sideCardCompact}>
                        <div style={styles.sideLabel}>Elementos</div>
                        <strong style={styles.sideValueCompact}>{chartData.length}</strong>
                      </div>
                    </div>
                  </div>
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
                          {visibleCurrencies.map((currency) => (
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
                            <td colSpan={3 + visibleCurrencies.length} style={styles.emptyCell}>No hay detalle para mostrar.</td>
                          </tr>
                        ) : (
                          sortedChartData.map((item) => (
                            <tr key={item.label}>
                              <td style={styles.td}>
                                <div style={styles.levelItemCell}>
                                  <button
                                    type="button"
                                    style={currentLevel === "tarea" ? styles.flatText : styles.linkButton}
                                    onClick={() => handleChartClick(item)}
                                    disabled={currentLevel === "tarea"}
                                  >
                                    {item.label}
                                  </button>
                                  <button
                                    type="button"
                                    style={styles.expandLevelButton}
                                    onClick={() => handleOpenLevelItem(item)}
                                  >
                                    Ampliar
                                  </button>
                                </div>
                              </td>
                              <td style={styles.td}>{item.count}</td>
                              {visibleCurrencies.map((currency) => (
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
          )}
        </AppCard>

          </>
        ) : (
          <AppCard>
            <div style={styles.detailRecordsToolbar}>
              <div style={styles.detailHeaderTitle}>
                <AppSectionHeader title="Detalle de registros seleccionados" description="Los registros mostrados corresponden al filtro y nivel actual seleccionado." />
              </div>
              <div style={styles.detailRecordsActions}>
                <div style={styles.selectionCountBadge}>
                  Registros existentes: <strong>{filteredRows.length}</strong>
                </div>
                <button type="button" style={filteredRows.length > 0 && !loading ? styles.primaryButton : styles.primaryButtonDisabled} onClick={() => void handleExportVisibleToExcel()} disabled={filteredRows.length === 0 || loading}>
                  Exportar a Excel
                </button>
              </div>
            </div>
            <div style={styles.detailRecordsTableWrap}>
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
                    sortedRows.map((row, index) => (
                      <tr key={`${row.id}-${index}`}>
                        <td style={styles.tdStrong}>
                          <button type="button" style={styles.rowDetailButton} onClick={() => handleOpenRowDetails(row)}>
                            {row.id}
                          </button>
                        </td>
                        <td style={styles.td}>{row.fechaIngreso}</td>
                        <td style={styles.td}>{row.cliente}</td>
                        <td style={styles.td}>{row.proyecto}</td>
                        <td style={styles.td}>{row.site}</td>
                        <td style={styles.td}>{row.tarea}</td>
                        <td style={styles.tdStrong}>{row.moneda}</td>
                        <td style={styles.tdStrong}>{formatCurrency(row.monto, row.moneda)}</td>
                        <td style={styles.tdStrong}>{formatCurrency(convertToPen(row.monto, row.moneda, appliedUsdExchangeRate, appliedDopExchangeRate), "PEN")}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </AppCard>
        )}

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
                  <div style={styles.modalSubtitle}>Detalle del registro seleccionado desde la tabla principal.</div>
                </div>
                <button type="button" style={styles.modalCloseButton} onClick={handleCloseRowDetails}>
                  Cerrar
                </button>
              </div>
              <>
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
                <div style={styles.modalGrid}>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Id / Correlativo</span>
                    <strong style={styles.modalValue}>{selectedGastoRow.id}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Filtro</span>
                    <strong style={styles.modalValue}>{selectedGastoRow.filtroOperativo}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Trabajo</span>
                    <strong style={styles.modalValue}>{selectedGastoRow.tipoTrabajo}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>OT</span>
                    <strong style={styles.modalValue}>{selectedGastoRow.ot}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Tarea</span>
                    <strong style={styles.modalValue}>{selectedGastoRow.tarea}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Responsable</span>
                    <strong style={styles.modalValue}>{selectedGastoRow.responsable}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Suministro vigente</span>
                    <strong style={styles.modalValue}>{selectedGastoRow.idSuministroProvisional}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Cuenta</span>
                    <strong style={styles.modalValue}>{selectedGastoRow.cuenta}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Cuenta inter</span>
                    <strong style={styles.modalValue}>{selectedGastoRow.cuentaInter}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Banco</span>
                    <strong style={styles.modalValue}>{selectedGastoRow.banco}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Nro. operación</span>
                    <strong style={styles.modalValue}>{selectedGastoRow.nroOperacion}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Fecha deposito</span>
                    <strong style={styles.modalValue}>{selectedGastoRow.fechaIngreso}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Fecha emision</span>
                    <strong style={styles.modalValue}>{selectedGastoRow.fechaEmision}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Fecha vencimiento</span>
                    <strong style={styles.modalValue}>{selectedGastoRow.fechaVencimiento}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Bien</span>
                    <strong style={styles.modalValue}>{selectedGastoRow.bien}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Comprobante</span>
                    <strong style={styles.modalValue}>{selectedGastoRow.comprobante}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Serie</span>
                    <strong style={styles.modalValue}>{selectedGastoRow.serie}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Rendición</span>
                    <strong style={styles.modalValue}>{selectedGastoRow.rendicion}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Tipo de pago</span>
                    <strong style={styles.modalValue}>{selectedGastoRow.tipoPago}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Subtotal</span>
                    <strong style={styles.modalValue}>{formatCurrency(selectedGastoRow.subtotal, selectedGastoRow.moneda)}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>IGV</span>
                    <strong style={styles.modalValue}>{formatCurrency(selectedGastoRow.igv, selectedGastoRow.moneda)}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Total</span>
                    <strong style={styles.modalValue}>{formatCurrency(selectedGastoRow.totalPagar || selectedGastoRow.monto, selectedGastoRow.moneda)}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Moneda</span>
                    <strong style={styles.modalValue}>{selectedGastoRow.moneda}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Solicitante</span>
                    <strong style={styles.modalValue}>{selectedGastoRow.solicitante}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Gestor</span>
                    <strong style={styles.modalValue}>{selectedGastoRow.gestor}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Validador</span>
                    <strong style={styles.modalValue}>{selectedGastoRow.validador}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Estado</span>
                    <strong style={styles.modalValue}>{selectedGastoRow.estadoLabel || selectedGastoRow.estado}</strong>
                  </div>
                  <div style={styles.modalField}>
                    <span style={styles.modalLabel}>Usuario</span>
                    <strong style={styles.modalValue}>{selectedGastoRow.usuario}</strong>
                  </div>
                  <div style={styles.modalFieldAccent}>
                    <span style={styles.modalLabelAccent}>Total convertido PEN</span>
                    <strong style={styles.modalValueAccent}>
                      {formatCurrency(convertToPen(selectedGastoRow.monto, selectedGastoRow.moneda, appliedUsdExchangeRate, appliedDopExchangeRate), "PEN")}
                    </strong>
                  </div>
                </div>

                <div style={styles.modalSection}>
                  <span style={styles.modalLabel}>Detalle</span>
                  <div style={styles.modalTextBox}>{selectedGastoRow.detalle}</div>
                </div>

                <div style={styles.modalSection}>
                  <span style={styles.modalLabel}>Comentario</span>
                  <div style={styles.modalTextBox}>{selectedGastoRow.comentario}</div>
                </div>
              </>
            </div>
          </div>
        ) : null}

        {selectedLevelItem ? (
          <div style={styles.modalOverlay} onClick={handleCloseLevelItem} role="presentation">
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
                    Opción ampliada
                  </div>
                  <div style={styles.modalSubtitle}>{selectedLevelItem.label}</div>
                </div>
                <button type="button" style={styles.modalCloseButton} onClick={handleCloseLevelItem}>
                  Cerrar
                </button>
              </div>

              <div style={styles.levelModalHero}>
                <div style={styles.levelModalHeroCard}>
                  <span style={styles.levelModalHeroLabel}>Nivel</span>
                  <strong style={styles.levelModalHeroValue}>{selectedLevelItem.label}</strong>
                </div>
                <div style={styles.levelModalHeroAccent}>
                  <span style={styles.levelModalHeroLabelAccent}>Registros</span>
                  <strong style={styles.levelModalHeroValueAccent}>{selectedLevelItem.count}</strong>
                </div>
                <div style={styles.levelModalHeroCard}>
                  <span style={styles.levelModalHeroLabel}>Total convertido PEN</span>
                  <strong style={styles.levelModalHeroValue}>
                    {formatCurrency(
                      Object.entries(selectedLevelItem.amountsByCurrency).reduce(
                        (accumulator, [currency, amount]) =>
                          accumulator + convertToPen(amount, currency, appliedUsdExchangeRate, appliedDopExchangeRate),
                        0,
                      ),
                      "PEN",
                    )}
                  </strong>
                </div>
              </div>

              <div style={styles.levelModalGrid}>
                {Object.entries(selectedLevelItem.amountsByCurrency)
                  .sort(([leftCurrency], [rightCurrency]) => leftCurrency.localeCompare(rightCurrency))
                  .map(([currency, amount]) => (
                    <div key={`${selectedLevelItem.label}-${currency}`} style={styles.levelModalField}>
                      <span style={styles.levelModalFieldLabel}>{currency}</span>
                      <strong style={styles.levelModalFieldValue}>{formatCurrency(amount, currency)}</strong>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        ) : null}

      </div>
    </AppPage>
  );
}

function MetricCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={accent ? styles.metricCardAccent : styles.metricCard}>
      <span style={styles.metricLabel}>{label}</span>
      <strong style={styles.metricValue}>{value}</strong>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "grid",
    gap: 16,
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
  tabBar: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 12,
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
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 12,
  },
  metricCard: {
    borderRadius: 18,
    border: "1px solid #DBEAFE",
    background: "linear-gradient(180deg, #FFFFFF, #EFF6FF)",
    padding: 16,
    display: "grid",
    gap: 8,
    boxShadow: "0 10px 30px rgba(37, 99, 235, 0.08)",
  },
  metricCardAccent: {
    borderRadius: 18,
    border: "1px solid #1D4ED8",
    background: "linear-gradient(135deg, #DBEAFE, #BFDBFE 55%, #93C5FD)",
    padding: 16,
    display: "grid",
    gap: 8,
    boxShadow: "0 14px 34px rgba(29, 78, 216, 0.18)",
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  metricValue: {
    fontSize: 24,
    color: "#0F172A",
  },
  breadcrumbRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
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
    gridTemplateColumns: "minmax(240px, 0.6fr) minmax(680px, 1.4fr)",
    gap: 20,
    alignItems: "start",
  },
  chartBox: {
    minHeight: 280,
    borderRadius: 20,
    border: "1px solid #E2E8F0",
    background: "radial-gradient(circle at top, rgba(37,99,235,0.08), transparent 55%), #FFFFFF",
    padding: 6,
  },
  chartBoxInner: {
    display: "grid",
    gridTemplateColumns: "minmax(180px, 1fr) minmax(220px, 240px)",
    gap: 12,
    alignItems: "start",
    minHeight: 260,
  },
  pieWrap: {
    minWidth: 0,
    minHeight: 248,
  },
  legendPanel: {
    display: "grid",
    gap: 6,
    alignContent: "start",
    minWidth: 0,
    maxHeight: 340,
    overflowX: "hidden",
    overflowY: "auto",
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
    fontSize: 13,
    fontWeight: 700,
    color: "#0F172A",
    lineHeight: 1.2,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  sidePanelTopRow: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },
  detailHeaderRow: {
    display: "grid",
    gridTemplateColumns: "minmax(280px, 1.2fr) minmax(420px, 1fr)",
    gap: 16,
    alignItems: "start",
  },
  detailHeaderTitle: {
    minWidth: 0,
  },
  detailPanel: {
    borderRadius: 18,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    padding: 16,
    display: "grid",
    gap: 12,
    minWidth: 0,
  },
  detailRecordsToolbar: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(240px, 320px)",
    gap: 16,
    alignItems: "start",
    marginBottom: 14,
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
    padding: 16,
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
    overflowX: "auto",
  },
  detailRecordsTableWrap: {
    overflowX: "auto",
    overflowY: "auto",
    borderRadius: 18,
    border: "1px solid #E2E8F0",
    maxHeight: "calc(100vh - 360px)",
    minHeight: 0,
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
    padding: "12px 10px",
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
    zIndex: 2,
    background: "#FFFFFF",
  },
  sortHeaderButton: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "12px 10px",
    border: "none",
    color: "#475569",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    cursor: "pointer",
    background: "#FFFFFF",
  },
  accentSortHeaderButton: {
    borderRadius: 12,
    background: "linear-gradient(135deg, #DBEAFE, #BFDBFE 55%, #93C5FD)",
    color: "#0F172A",
  },
  sortIndicator: {
    fontSize: 11,
    color: "#1D4ED8",
    flexShrink: 0,
  },
  thCheckbox: {
    textAlign: "center",
    padding: "12px 10px",
    borderBottom: "1px solid #CBD5E1",
    color: "#475569",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    width: 44,
  },
  td: {
    padding: "12px 10px",
    borderBottom: "1px solid #E2E8F0",
    color: "#0F172A",
  },
  tdCheckbox: {
    padding: "12px 10px",
    borderBottom: "1px solid #E2E8F0",
    color: "#0F172A",
    textAlign: "center",
    width: 44,
  },
  tdStrong: {
    padding: "12px 10px",
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
  levelItemCell: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 8,
  },
  expandLevelButton: {
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
    width: "min(1120px, 100%)",
    maxHeight: "90vh",
    overflowY: "auto",
    borderRadius: 24,
    background: "#FFFFFF",
    border: "1px solid #DBEAFE",
    boxShadow: "0 24px 80px rgba(15, 23, 42, 0.35)",
    padding: 20,
    display: "grid",
    gap: 16,
  },
  modalHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  modalTitle: {
    fontSize: 28,
    fontWeight: 800,
    color: "#0F172A",
    lineHeight: 1.1,
  },
  modalSubtitle: {
    marginTop: 6,
    color: "#64748B",
    fontSize: 14,
  },
  modalCloseButton: {
    minHeight: 40,
    borderRadius: 12,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    fontWeight: 700,
    padding: "0 14px",
    cursor: "pointer",
  },
  modalGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  modalField: {
    borderRadius: 16,
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
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
  levelModalHeroAccent: {
    borderRadius: 20,
    border: "1px solid #1D4ED8",
    background: "linear-gradient(135deg, #DBEAFE, #BFDBFE 55%, #93C5FD)",
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
  levelModalFieldLabel: {
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#64748B",
  },
  levelModalFieldValue: {
    fontSize: 16,
    fontWeight: 800,
    color: "#0F172A",
  },
  facturaLink: {
    display: "inline-flex",
    width: "fit-content",
    marginBottom: 8,
    color: "#6D28D9",
    fontWeight: 700,
    textDecoration: "underline",
  },
};


