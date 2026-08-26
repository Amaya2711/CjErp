import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  FileDown,
  FileText,
  Filter,
  HandCoins,
  Maximize2,
  Printer,
  ReceiptText,
  RotateCcw,
  Search,
  ShieldCheck,
  Minimize2,
  XCircle,
} from "lucide-react";
import AppPage from "../../../components/base/AppPage";
import {
  buildPlanillaConsultaEstadosRequest,
  consultarPlanillaEstados,
} from "../../../api/planillaConsultaService";
import type { PlanillaConsultaEstadosRequest, PlanillaConsultaParametro } from "../../../models/planillaConsulta";

type PagoTabKey = "aprobar" | "reaprobar" | "hormiga" | "observadas" | "resumen";
type DetailTabKey = "orden" | "resumen" | "historial" | "historial-oc";

type PagoEstado = Exclude<PagoTabKey, "resumen">;

type PagoRow = {
  id: number;
  correlativo: string;
  ot: string;
  fila?: string;
  idCliente?: number;
  idProyecto?: number;
  cliente: string;
  proyecto: string;
  siteId: string;
  site: string;
  tipoTrabajo: string;
  tarea: string;
  fecha: string;
  solicitante: string;
  responsable: string;
  validador: string;
  moneda: string;
  corSite?: string;
  montoOc2?: string;
  montoPlanillaPagado?: number;
  montoPlanillaPagadoDisplay?: string;
  conPagado?: number;
  conPagadoDisplay?: string;
  subOc?: number;
  adelaFic?: number;
  porcentajeFic?: number;
  subtotal: number;
  igv: number;
  total: number;
  estado: PagoEstado;
  diasEstado: number;
  observacion: string;
  detalle: string;
  idOc?: string;
  documento: string;
};

type TabTheme = {
  label: string;
  accent: string;
  soft: string;
  border: string;
  icon: React.ReactNode;
};

type FilterState = {
  cliente: string;
  proyecto: string;
  site: string;
  tipoTrabajo: string;
  tarea: string;
  solicitante: string;
  responsable: string;
  estado: string;
  correlativo: string;
  fechaDesde: string;
  fechaHasta: string;
  query: string;
};

type GroupRow = {
  key: string;
  label: string;
  rows: PagoRow[];
  total: number;
  subtotal: number;
  count: number;
  totalsByCurrency: Record<string, { subtotal: number; igv: number; total: number }>;
};

type ResumenOtDetalle = {
  ot: string;
  correlativo: string;
  idCliente?: number;
  idProyecto?: number;
  idSite?: string;
  fila?: string;
  cliente: string;
  proyecto: string;
  site: string;
  tipoTrabajo: string;
  moneda: string;
  montoOc: number;
  totalAcumuladoOt: number;
  disponible: number;
  porcentaje: number;
  porcentajeMontoBck?: number;
  subOc: number;
  montoPlanilla?: number;
  montoPlanillaPagado?: number;
  pagado?: number;
  disponibleOc?: number;
  porcentajeOc?: number;
  adelaFic: number;
  porcentajeFic: number;
  montoOcAdelanto: number;
  porcentajeOcAdelanto: number;
};

const TAB_ORDER: PagoTabKey[] = ["aprobar", "reaprobar", "hormiga", "observadas", "resumen"];

const TAB_ESTADOS: Record<Exclude<PagoTabKey, "resumen">, string> = {
  aprobar: "0",
  reaprobar: "6",
  hormiga: "10",
  observadas: "2",
};

const TAB_ESTADOS_CON_FECHA = Object.values(TAB_ESTADOS).join(",");

function createEmptyRowsByTab(): Record<PagoTabKey, PagoRow[]> {
  return {
    aprobar: [],
    reaprobar: [],
    hormiga: [],
    observadas: [],
    resumen: [],
  };
}

function groupRowsByEstado(rows: PagoRow[]): Record<PagoTabKey, PagoRow[]> {
  const grouped = createEmptyRowsByTab();

  for (const row of rows) {
    grouped[row.estado].push(row);
  }

  grouped.resumen = [...grouped.aprobar, ...grouped.reaprobar, ...grouped.hormiga, ...grouped.observadas];
  return grouped;
}

const TAB_THEME: Record<PagoTabKey, TabTheme> = {
  aprobar: {
    label: "Aprobar",
    accent: "#F59E0B",
    soft: "#FFFBEB",
    border: "#FCD34D",
    icon: <CheckCircle2 size={16} strokeWidth={2.2} />,
  },
  reaprobar: {
    label: "Re-aprobar",
    accent: "#2563EB",
    soft: "#EFF6FF",
    border: "#93C5FD",
    icon: <RotateCcw size={16} strokeWidth={2.2} />,
  },
  hormiga: {
    label: "Hormiga",
    accent: "#059669",
    soft: "#F0FDF4",
    border: "#86EFAC",
    icon: <HandCoins size={16} strokeWidth={2.2} />,
  },
  observadas: {
    label: "Observadas",
    accent: "#DC2626",
    soft: "#FEF2F2",
    border: "#FCA5A5",
    icon: <AlertTriangle size={16} strokeWidth={2.2} />,
  },
  resumen: {
    label: "Resumen",
    accent: "#7C3AED",
    soft: "#F5F3FF",
    border: "#C4B5FD",
    icon: <ShieldCheck size={16} strokeWidth={2.2} />,
  },
};

const PAYMENT_ROWS: PagoRow[] = [
  {
    id: 1,
    correlativo: "126249",
    ot: "OT-126249",
    cliente: "AMX",
    proyecto: "DENSIFICACION",
    siteId: "L11084",
    site: "NAT_PASAJE_39_RICARDO",
    tipoTrabajo: "TI - TI",
    tarea: "ENVIOS_RECOJOS",
    fecha: "2026-08-14",
    solicitante: "AGUILAR MENDOZA JESUS MIGUEL",
    responsable: "TORRES SANCHEZ R.",
    validador: "TORRES SANCHEZ R.",
    moneda: "Soles",
    subtotal: 9555.45,
    igv: 229.49,
    total: 10415.44,
    estado: "aprobar",
    diasEstado: 1,
    observacion: "Pendiente de aprobacion de primer nivel.",
    detalle: "Orden de pago con sustento completo y lista para validacion.",
    documento: "OC-126249",
  },
  {
    id: 2,
    correlativo: "126250",
    ot: "OT-126250",
    cliente: "AMX",
    proyecto: "DENSIFICACION",
    siteId: "L16447",
    site: "NAT_SOL_NACIENTE",
    tipoTrabajo: "TI - TI",
    tarea: "ENVIOS_RECOJOS",
    fecha: "2026-08-13",
    solicitante: "AGUILAR MENDOZA JESUS MIGUEL",
    responsable: "CASTILLO HINOSTROZA",
    validador: "CASTILLO HINOSTROZA",
    moneda: "Soles",
    subtotal: 1462.00,
    igv: 262.16,
    total: 1724.16,
    estado: "aprobar",
    diasEstado: 2,
    observacion: "En cola de aprobacion.",
    detalle: "Gasto operativo con evidencias asociadas a campo.",
    documento: "OC-126250",
  },
  {
    id: 3,
    correlativo: "126274",
    ot: "OT-126274",
    cliente: "SDP_INTEGRATEL",
    proyecto: "ROLL OUT",
    siteId: "L16039",
    site: "RINCONADA",
    tipoTrabajo: "OBRAS CIVILES",
    tarea: "CM_COMP_MATERIAL",
    fecha: "2026-08-08",
    solicitante: "EVELIN OLARTE BERROCAL",
    responsable: "PEDROZA SIERRA R.",
    validador: "PEDROZA SIERRA R.",
    moneda: "Soles",
    subtotal: 2200.0,
    igv: 396.0,
    total: 2596.0,
    estado: "reaprobar",
    diasEstado: 4,
    observacion: "Debe corregirse el detalle observacion anterior.",
    detalle: "Se modificaron cantidades y descripcion, requiere re-aprobacion.",
    documento: "OC-126274",
  },
  {
    id: 4,
    correlativo: "126275",
    ot: "OT-126275",
    cliente: "SDP_INTEGRATEL",
    proyecto: "ROLL OUT",
    siteId: "TA0338",
    site: "SANTA MARCOS",
    tipoTrabajo: "OBRAS CIVILES",
    tarea: "CM_COMP_MATERIAL",
    fecha: "2026-08-11",
    solicitante: "EVELIN OLARTE BERROCAL",
    responsable: "CMG CHAVEZ SAC",
    validador: "CMG CHAVEZ SAC",
    moneda: "Soles",
    subtotal: 4965.20,
    igv: 0,
    total: 4965.20,
    estado: "reaprobar",
    diasEstado: 5,
    observacion: "Pendiente de validacion adicional.",
    detalle: "Solicitud con respaldo incompleto para segunda revision.",
    documento: "OC-126275",
  },
  {
    id: 5,
    correlativo: "126278",
    ot: "OT-126278",
    cliente: "CJ TELECOM",
    proyecto: "MANTENIMIENTO",
    siteId: "100010",
    site: "ADMINISTRACION",
    tipoTrabajo: "ADMINISTRATIVO",
    tarea: "TALLER_ADECUACION",
    fecha: "2026-08-12",
    solicitante: "CLAUDIA ESCUDERO",
    responsable: "CONTRATISTAS GEN...",
    validador: "CONTRATISTAS GEN...",
    moneda: "Soles",
    subtotal: 5000.0,
    igv: 0,
    total: 5000.0,
    estado: "hormiga",
    diasEstado: 7,
    observacion: "Prioridad media-alta.",
    detalle: "Pago recurrente con continuidad operativa.",
    documento: "OC-126278",
  },
  {
    id: 6,
    correlativo: "126279",
    ot: "OT-126279",
    cliente: "AMX",
    proyecto: "PEX",
    siteId: "TJS180",
    site: "NAT_NUNBAMBA",
    tipoTrabajo: "PEXT",
    tarea: "REEMBOLSO_GASTOS",
    fecha: "2026-08-10",
    solicitante: "ELVIS SARAVIAS...",
    responsable: "SG NATCLAR S.A.C.",
    validador: "SG NATCLAR S.A.C.",
    moneda: "Soles",
    subtotal: 1412.46,
    igv: 0,
    total: 1412.46,
    estado: "observadas",
    diasEstado: 9,
    observacion: "Falta conformidad del responsable.",
    detalle: "Se devolvio el expediente para subsanar observaciones.",
    documento: "OC-126279",
  },
  {
    id: 7,
    correlativo: "126280",
    ot: "OT-126280",
    cliente: "SITES_DOMINICANA",
    proyecto: "MANTENIMIENTO",
    siteId: "D001309",
    site: "SANTA ROSA - BAN...",
    tipoTrabajo: "MANTENIMIENTO",
    tarea: "TALLER_ADECUACION",
    fecha: "2026-08-09",
    solicitante: "ELVIS SARAVIAS...",
    responsable: "KELLY ALESSANDRA ...",
    validador: "KELLY ALESSANDRA ...",
    moneda: "Soles",
    subtotal: 198.36,
    igv: 0,
    total: 198.36,
    estado: "observadas",
    diasEstado: 8,
    observacion: "Pendiente de regularizacion.",
    detalle: "Debe adjuntarse correccion documental.",
    documento: "OC-126280",
  },
  {
    id: 8,
    correlativo: "126281",
    ot: "OT-126281",
    cliente: "SDP",
    proyecto: "ROLL OUT",
    siteId: "LA3181",
    site: "CAHUIDE",
    tipoTrabajo: "OBRAS CIVILES",
    tarea: "ADICIONAL",
    fecha: "2026-08-07",
    solicitante: "JUAN CARLOS GUEVARA ESCRIBA",
    responsable: "MIGUEL RIVEROS",
    validador: "MIGUEL RIVEROS",
    moneda: "Soles",
    subtotal: 10000.0,
    igv: 0,
    total: 10000.0,
    estado: "aprobar",
    diasEstado: 3,
    observacion: "En revision para aprobacion final.",
    detalle: "Corresponde a expediente consolidado de la semana.",
    documento: "OC-126281",
  },
  {
    id: 9,
    correlativo: "126282",
    ot: "OT-126282",
    cliente: "SITES_DOMINICANA",
    proyecto: "MANTENIMIENTO",
    siteId: "D000051",
    site: "LA PERLA",
    tipoTrabajo: "MANTENIMIENTO",
    tarea: "TALLER_ADECUACION",
    fecha: "2026-08-05",
    solicitante: "ANGELLO ALDAIR CUENCA PILACA",
    responsable: "KELLY ALESSANDRA ...",
    validador: "KELLY ALESSANDRA ...",
    moneda: "Soles",
    subtotal: 90.82,
    igv: 0,
    total: 90.82,
    estado: "hormiga",
    diasEstado: 5,
    observacion: "Seguimiento con prioridad operativa.",
    detalle: "Orden de pago con control de detalle y trazabilidad.",
    documento: "OC-126282",
  },
  {
    id: 10,
    correlativo: "126283",
    ot: "OT-126283",
    cliente: "SITES_DOMINICANA",
    proyecto: "MANTENIMIENTO",
    siteId: "638",
    site: "PISANO",
    tipoTrabajo: "INGENIERIA",
    tarea: "TALLER_ADECUACION",
    fecha: "2026-08-04",
    solicitante: "ANGELLO ALDAIR CUENCA PILACA",
    responsable: "KELLY ALESSANDRA ...",
    validador: "KELLY ALESSANDRA ...",
    moneda: "Soles",
    subtotal: 198.36,
    igv: 0,
    total: 198.36,
    estado: "observadas",
    diasEstado: 11,
    observacion: "Falta adjuntar sustento corregido.",
    detalle: "Se encuentra a la espera de correcciones administrativas.",
    documento: "OC-126283",
  },
  {
    id: 11,
    correlativo: "126284",
    ot: "OT-126284",
    cliente: "SITES_DOMINICANA",
    proyecto: "MANTENIMIENTO",
    siteId: "D000219",
    site: "CEFUFA (LA CALET...)",
    tipoTrabajo: "MANTENIMIENTO",
    tarea: "TALLER_ADECUACION",
    fecha: "2026-08-04",
    solicitante: "ANGELLO ALDAIR CUENCA PILACA",
    responsable: "KELLY ALESSANDRA ...",
    validador: "KELLY ALESSANDRA ...",
    moneda: "Soles",
    subtotal: 90.82,
    igv: 0,
    total: 90.82,
    estado: "observadas",
    diasEstado: 11,
    observacion: "Requiere cambio de soporte.",
    detalle: "Correccion pendiente antes del reingreso al flujo.",
    documento: "OC-126284",
  },
  {
    id: 12,
    correlativo: "126285",
    ot: "OT-126285",
    cliente: "CJ TELECOM",
    proyecto: "MANTENIMIENTO",
    siteId: "D000041",
    site: "L & R COMERCIAL, ...",
    tipoTrabajo: "EVALUACION EST...",
    tarea: "TALLER_ADECUACION",
    fecha: "2026-08-04",
    solicitante: "ANGELLO ALDAIR CUENCA PILACA",
    responsable: "KELLY ALESSANDRA ...",
    validador: "KELLY ALESSANDRA ...",
    moneda: "Soles",
    subtotal: 91.20,
    igv: 0,
    total: 91.20,
    estado: "aprobar",
    diasEstado: 1,
    observacion: "Lista para aprobar.",
    detalle: "Expediente vigente con control completo de respaldo.",
    documento: "OC-126285",
  },
];

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDefaultFilterState(): FilterState {
  const fechaHasta = new Date();
  const fechaDesde = new Date(fechaHasta);
  fechaDesde.setDate(fechaDesde.getDate() - 8);

  return {
    cliente: "",
    proyecto: "",
    site: "",
    tipoTrabajo: "",
    tarea: "",
    solicitante: "",
    responsable: "",
    estado: "",
    correlativo: "",
    fechaDesde: formatDateInputValue(fechaDesde),
    fechaHasta: formatDateInputValue(fechaHasta),
    query: "",
  };
}

function formatMoney(value: number) {
  return value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getCurrencySymbol(currency: string) {
  const normalized = normalizeText(currency);

  if (normalized.includes("usd") || normalized.includes("dolar")) {
    return "$";
  }

  if (normalized.includes("eur") || normalized.includes("euro")) {
    return "â‚¬";
  }

  if (normalized.includes("peso dominicano") || normalized.includes("rd$") || normalized === "dop" || normalized.includes("dominicano")) {
    return "RD$";
  }

  return "S/";
}

function formatCurrency(value: number, currency: string) {
  return `${getCurrencySymbol(currency)} ${formatMoney(value)}`;
}

function formatPercent(value: number) {
  return Number.isFinite(value) ? `${value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : "0.00%";
}

function getConsumptionBarColor(percent: number) {
  if (!Number.isFinite(percent)) {
    return "#22C55E";
  }

  if (percent < 50) {
    return "#22C55E";
  }

  if (percent <= 70) {
    return "#EAB308";
  }

  return "#EF4444";
}

function getConsumptionPercent(total: number, disponible: number) {
  if (!Number.isFinite(total) || total <= 0) {
    return 0;
  }

  const safeDisponible = Number.isFinite(disponible) ? Math.max(disponible, 0) : 0;
  const percent = 1 - safeDisponible / total;
  return Math.max(0, Math.min(100, Math.round(percent * 100)));
}

function parseNumericValue(value?: string | number | null): number {
  if (value == null) {
    return 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const raw = String(value).trim();
  if (!raw) {
    return 0;
  }

  const normalized = raw.replace(/[^\d.,-]/g, "");
  if (!normalized) {
    return 0;
  }

  const stripped = normalized.replace(/^[^0-9-]+/, "");
  if (!stripped) {
    return 0;
  }

  const hasComma = stripped.includes(",");
  const hasDot = stripped.includes(".");
  let cleaned = stripped;

  if (hasComma && hasDot) {
    const lastComma = stripped.lastIndexOf(",");
    const lastDot = stripped.lastIndexOf(".");
    cleaned = lastComma > lastDot ? stripped.replace(/\./g, "").replace(",", ".") : stripped.replace(/,/g, "");
  } else if (hasComma) {
    const parts = stripped.split(",");
    cleaned = parts.length === 2 && parts[1].length <= 2 ? stripped.replace(",", ".") : stripped.replace(/,/g, "");
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString("es-PE");
}

function formatDateParam(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const direct = trimmed.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) {
    return direct;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return direct;
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toComparableDateKey(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const direct = trimmed.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) {
    return direct;
  }

  const dateMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dateMatch) {
    const [, first, second, year] = dateMatch;
    const firstNumber = Number(first);
    const secondNumber = Number(second);

    let day = firstNumber;
    let month = secondNumber;

    // Soportar tanto DD/MM/YYYY como MM/DD/YYYY.
    // Si uno de los dos componentes supera 12, la interpretación queda clara.
    if (firstNumber <= 12 && secondNumber > 12) {
      month = firstNumber;
      day = secondNumber;
    } else if (firstNumber > 12 && secondNumber <= 12) {
      day = firstNumber;
      month = secondNumber;
    }

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return direct;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matchesTextFilter(rowValue: string, filterValue: string) {
  const normalizedValue = normalizeText(rowValue);
  const normalizedFilter = normalizeText(filterValue);
  if (!normalizedFilter) {
    return true;
  }
  return normalizedValue.includes(normalizedFilter);
}

function matchesQuickSearch(row: PagoRow, query: string) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return true;
  }

  const tokens = normalizedQuery
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return true;
  }

  const haystack = normalizeText(
    [
      row.correlativo,
      row.ot,
      row.idOc,
      row.fila,
      row.documento,
      row.cliente,
      row.proyecto,
      row.siteId,
      row.corSite,
      row.site,
      row.tipoTrabajo,
      row.tarea,
      row.solicitante,
      row.responsable,
      row.validador,
      row.observacion,
      row.detalle,
      row.estado,
    ]
      .filter((value) => value !== null && value !== undefined && String(value).trim() !== "")
      .join(" ")
  );

  return tokens.every((token) => haystack.includes(token));
}

function normalizeRecordKey(key: string) {
  return normalizeText(key).replace(/[^a-z0-9]/g, "");
}

function getValidOtValue(value: string | null | undefined) {
  const normalized = normalizeText(value || "");
  if (!normalized || normalized === "0" || normalized === "-" || normalized === "null") {
    return "";
  }
  return String(value).trim();
}

function getValidOcValue(value: string | null | undefined) {
  const normalized = normalizeText(value || "");
  if (!normalized || normalized === "0" || normalized === "-" || normalized === "null") {
    return "";
  }
  return String(value).trim();
}

function findRecordValue(row: Record<string, unknown>, key: string) {
  if (Object.prototype.hasOwnProperty.call(row, key)) {
    return row[key];
  }

  const normalizedTarget = normalizeRecordKey(key);
  for (const [candidateKey, candidateValue] of Object.entries(row)) {
    if (normalizeRecordKey(candidateKey) === normalizedTarget) {
      return candidateValue;
    }
  }

  return undefined;
}

function getRecordString(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = findRecordValue(row, key);
    if (value != null && String(value).trim() !== "") {
      return String(value);
    }
  }
  return "";
}

function getRecordNumber(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = findRecordValue(row, key);
    if (value == null || value === "") {
      continue;
    }

    const parsed = Number(String(value).replace(/,/g, ""));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function mapPlanillaEstadoToPagoEstado(value: unknown, fallback: PagoEstado): PagoEstado {
  const normalized = String(value ?? "").trim();
  const numeric = Number(normalized);

  if (Number.isFinite(numeric)) {
    switch (numeric) {
      case 0:
        return "aprobar";
      case 6:
        return "reaprobar";
      case 10:
        return "hormiga";
      case 2:
        return "observadas";
      default:
        return fallback;
    }
  }

  const text = normalizeText(normalized);
  if (text.includes("reapro")) return "reaprobar";
  if (text.includes("horm")) return "hormiga";
  if (text.includes("observ")) return "observadas";
  if (text.includes("apro")) return "aprobar";
  return fallback;
}

function mapPlanillaConsultaRowToPagoRow(
  row: Record<string, unknown>,
  index: number,
  fallbackEstado: PagoEstado
): PagoRow {
  const correlativo = getRecordString(row, "CORRE", "Corre", "corre", "Correlativo", "correlativo") || String(index + 1);
  const subtotal = getRecordNumber(row, "Subtotal", "subtotal", "Monto", "monto") ?? 0;
  const igv = getRecordNumber(row, "IGV", "Igv", "igv") ?? 0;
  const total = getRecordNumber(row, "Total", "total", "TotalPagar", "totalPagar") ?? subtotal + igv;
  const estado = mapPlanillaEstadoToPagoEstado(
    getRecordNumber(row, "Estado", "estado") ?? getRecordString(row, "EstadoNombre", "estadoNombre"),
    fallbackEstado
  );

  return {
    id: getRecordNumber(row, "Id", "id", "CorrelativoPlanilla", "correlativoPlanilla") ?? index + 1,
    correlativo,
    ot: getRecordString(row, "OT", "ot", "OrdenTrabajo", "ordenTrabajo"),
    fila: getRecordString(row, "FILA", "Fila", "fila"),
    idCliente:
      getRecordNumber(
        row,
        "IdCliente",
        "idCliente",
        "ClienteId",
        "clienteId",
        "IdClienteCj",
        "idClienteCj",
        "ClienteCj",
        "clienteCj",
        "IdClienteImportar",
        "idClienteImportar"
      ) ?? undefined,
    idProyecto:
      getRecordNumber(
        row,
        "IdProyecto",
        "idProyecto",
        "ProyectoId",
        "proyectoId",
        "IdProyectoCj",
        "idProyectoCj",
        "ProyectoCj",
        "proyectoCj",
        "IdProyectoImportar",
        "idProyectoImportar"
      ) ?? undefined,
    cliente: getRecordString(row, "Cliente", "cliente", "NombreCliente", "nombreCliente"),
    proyecto: getRecordString(row, "Proyecto", "proyecto", "NombreProyecto", "nombreProyecto"),
    siteId: getRecordString(row, "SiteId", "siteId", "IdSite", "idSite"),
    site: getRecordString(row, "Site", "site", "NombreSite", "nombreSite"),
    tipoTrabajo: getRecordString(row, "TipoTrabajo", "tipoTrabajo", "Tipo_Trabajo", "tipo_trabajo"),
    tarea: getRecordString(row, "Tarea", "tarea", "DescTarea", "descTarea"),
    fecha: getRecordString(row, "Fecha", "fecha", "FecIngreso", "fecIngreso", "FechaIngreso", "fechaIngreso"),
    solicitante: getRecordString(row, "Solicitante", "solicitante", "NombreSolicitante", "nombreSolicitante"),
    responsable: getRecordString(row, "Responsable", "responsable", "NombreResponsable", "nombreResponsable"),
    validador: getRecordString(
      row,
      "Validador",
      "validador",
      "NombreValidador",
      "nombreValidador",
      "Aprobador",
      "aprobador",
      "NombreAprobador",
      "nombreAprobador"
    ),
    moneda: getRecordString(row, "Moneda", "moneda", "TipoMoneda", "tipoMoneda"),
    corSite: getRecordString(row, "CorSite", "COR_SITE", "Cor_Site", "corSite"),
    montoOc2: getRecordString(row, "MontoOc2", "montoOc2", "MontoOC2", "montoOC2"),
    montoPlanillaPagado:
      getRecordNumber(
        row,
        "MontoPlanilla",
        "montoPlanilla",
        "MontoPlanillaPagado",
        "montoPlanillaPagado",
        "ConPagado",
        "conPagado",
        "ConPagadoSoles",
        "conPagadoSoles"
      ) ?? undefined,
    montoPlanillaPagadoDisplay: getRecordString(
      row,
      "MontoPlanilla",
      "montoPlanilla",
      "MontoPlanillaPagado",
      "montoPlanillaPagado",
      "ConPagado",
      "conPagado",
      "ConPagadoSoles",
      "conPagadoSoles"
    ),
    conPagado: getRecordNumber(row, "MontoPlanilla", "montoPlanilla", "MontoPlanillaPagado", "montoPlanillaPagado", "ConPagado", "conPagado", "ConPagadoSoles", "conPagadoSoles") ?? undefined,
    conPagadoDisplay: getRecordString(row, "MontoPlanilla", "montoPlanilla", "MontoPlanillaPagado", "montoPlanillaPagado", "ConPagado", "conPagado", "ConPagadoSoles", "conPagadoSoles"),
    subOc: getRecordNumber(row, "SubOc", "SubTotalOc", "SubtotalOc", "SubtotalOC", "subOc") ?? undefined,
    adelaFic: getRecordNumber(row, "AdelaFic", "adelaFic") ?? undefined,
    porcentajeFic: getRecordNumber(row, "PorcentajeFic", "porcentajeFic") ?? undefined,
    subtotal: Number.isFinite(subtotal) ? subtotal : 0,
    igv: Number.isFinite(igv) ? igv : 0,
    total: Number.isFinite(total) ? total : 0,
    estado,
    diasEstado: getRecordNumber(row, "DiasEstado", "diasEstado") ?? 0,
    observacion: getRecordString(row, "Observacion", "observacion", "Comentario", "comentario"),
    detalle: getRecordString(row, "Detalle", "detalle"),
    idOc: getRecordString(row, "IdOc", "IdOC", "Idoc", "OC", "Oc"),
    documento: getRecordString(row, "Documento", "documento"),
  };
}

function buildResumenOtRequest(row: PagoRow): PlanillaConsultaEstadosRequest | null {
  const ot = getValidOtValue(row.ot);
  const correlativo = row.corSite?.trim();
  const idCliente = row.idCliente ?? 0;
  const idProyecto = row.idProyecto ?? 0;
  const idSite = row.siteId.trim();
  const tipoTrabajo = row.tipoTrabajo.trim();

  if (!ot || !correlativo || !idSite || !tipoTrabajo || idCliente <= 0 || idProyecto <= 0) {
    return null;
  }

  return {
    ...buildPlanillaConsultaEstadosRequest([
      { nombre: "OT", valor: ot, tipo: "string" },
      { nombre: "IdCliente", valor: String(Math.trunc(idCliente)), tipo: "int" },
      { nombre: "IdProyecto", valor: String(Math.trunc(idProyecto)), tipo: "int" },
      { nombre: "IdSite", valor: idSite, tipo: "string" },
      { nombre: "Correlativo", valor: correlativo, tipo: "int" },
      { nombre: "TipoTrabajo", valor: tipoTrabajo, tipo: "string" },
    ], {
      baseParams: {
        idCargo: null,
        idEmpleado: null,
      },
    }),
    consulta: "importar-resumen-ot",
  };
}

function getEstadoCodigoParaHistorial(row: PagoRow, activeTab: PagoTabKey): string {
  const estadoDesdeFila = TAB_ESTADOS[row.estado as Exclude<PagoTabKey, "resumen">] ?? "";
  const estadoDesdeTab = activeTab !== "resumen" ? TAB_ESTADOS[activeTab] : "";

  return estadoDesdeFila || estadoDesdeTab || "";
}

function buildHistorialRequest(row: PagoRow, activeTab: PagoTabKey): PlanillaConsultaEstadosRequest | null {
  const ot = getValidOtValue(row?.ot);
  const idSite = row?.siteId?.trim();
  const corSite = row?.corSite?.trim();
  const estados = getEstadoCodigoParaHistorial(row, activeTab);

  if (!ot || !idSite || !corSite || !estados) {
    return null;
  }

  return {
    parametros: [
      { nombre: "Estados", valor: estados, tipo: "string" },
      { nombre: "OT", valor: ot, tipo: "string" },
      { nombre: "IdSite", valor: idSite, tipo: "string" },
      { nombre: "CorSite", valor: corSite, tipo: "int" },
    ],
  };
}

function buildHistorialOcRequest(row: PagoRow): PlanillaConsultaEstadosRequest | null {
  const idoc = getValidOcValue(row?.idOc ?? row?.documento);
  const fila = row?.fila?.trim();

  if (!idoc || !fila) {
    return null;
  }

  return {
    parametros: [
      { nombre: "Estados", valor: "4", tipo: "string" },
      { nombre: "idoc", valor: idoc, tipo: "string" },
      { nombre: "fila", valor: fila, tipo: "string" },
    ],
  };
}

function mapResumenOtResponseRowToDetalle(
  row: Record<string, unknown>,
  fallback: PagoRow
): ResumenOtDetalle {
  const ot = getRecordString(row, "OT", "ot", "OrdenTrabajo", "ordenTrabajo") || fallback.ot || fallback.correlativo;
  const correlativo = getRecordString(row, "Correlativo", "correlativo", "CORRE", "Corre") || fallback.correlativo;
  const cliente = getRecordString(row, "Cliente", "cliente", "NombreCliente", "nombreCliente") || fallback.cliente;
  const proyecto = getRecordString(row, "Proyecto", "proyecto", "NombreProyecto", "nombreProyecto") || fallback.proyecto;
  const site = getRecordString(row, "Site", "site", "NombreSite", "nombreSite") || fallback.site;
  const tipoTrabajo =
    getRecordString(row, "TipoTrabajo", "tipoTrabajo", "Tipo_Trabajo", "tipo_trabajo") || fallback.tipoTrabajo;
  const moneda = getRecordString(row, "Moneda", "moneda", "TipoMoneda", "tipoMoneda") || fallback.moneda;

  const montoOc =
    getRecordNumber(
      row,
      "MontoOc",
      "MontoOC",
      "montoOc",
      "montoOC",
      "MontoOc2",
      "MontoOC2",
      "TotalOc",
      "totalOc",
      "MontoOt",
      "montoOt"
    ) ?? (parseNumericValue(fallback.montoOc2) || fallback.total);

  const montoPlanilla =
    getRecordNumber(
      row,
      "MontoPlanilla",
      "montoPlanilla",
      "MontoPlanillaPagado",
      "montoPlanillaPagado",
      "ConPagado",
      "conPagado"
    ) ?? 0;

  const montoPlanillaPagado =
    getRecordNumber(
      row,
      "MontoPlanillaPagado",
      "montoPlanillaPagado",
      "MontoPlanilla_Pagado",
      "montoPlanilla_Pagado"
    ) ?? montoPlanilla;

  const totalAcumuladoOt =
    getRecordNumber(
      row,
      "Monto_Bck",
      "monto_bck",
      "MontoBck",
      "montoBck",
      "TotalAcumuladoOt",
      "totalAcumuladoOt",
      "TotalAcumulado",
      "totalAcumulado",
      "ConPagado",
      "conPagado",
      "TotalPagar",
      "totalPagar",
      "Solicitado",
      "solicitado"
    ) ?? fallback.total;

  const disponible =
    getRecordNumber(
      row,
      "SaldoMontoBck",
      "saldoMontoBck",
      "SaldoMonto_Bck",
      "saldoMonto_Bck",
      "Disponible",
      "disponible",
      "Saldo",
      "saldo",
      "SaldoReferencial",
      "saldoReferencial"
    ) ??
    Math.max(montoOc - totalAcumuladoOt, 0);

  const porcentaje = getConsumptionPercent(montoOc, disponible);
  const porcentajeMontoBck =
    getRecordNumber(
      row,
      "PorcentajeMontoBck",
      "porcentajeMontoBck",
      "PorcentajeMonto_Bck",
      "porcentajeMonto_Bck",
      "Porcentaje_Monto_Bck",
      "porcentaje_Monto_Bck"
    ) ?? porcentaje;

  const subOc =
    getRecordNumber(
      row,
      "SubOc",
      "subOc",
      "SubTotalOc",
      "subTotalOc",
      "SubtotalOc",
      "subtotalOc",
      "SubtotalOC",
      "subtotalOC"
    ) ?? (fallback.subOc ?? 0);

  const adelaFic = getRecordNumber(row, "AdelaFic", "adelaFic", "AdelantoFic", "adelantoFic") ?? (fallback.adelaFic ?? 0);
  const porcentajeFic =
    getRecordNumber(row, "PorcentajeFic", "porcentajeFic") ??
    (montoOc > 0 ? (adelaFic / montoOc) * 100 : 0);
  const montoOcAdelanto =
    getRecordNumber(row, "MontoOcAdelanto", "montoOcAdelanto", "Adelantos", "adelantos") ?? adelaFic;
  const porcentajeOcAdelanto =
    getRecordNumber(row, "PorcentajeOcAdelanto", "porcentajeOcAdelanto") ??
    (montoOc > 0 ? (montoOcAdelanto / montoOc) * 100 : 0);

    return {
      ot,
      correlativo,
      idCliente: fallback.idCliente,
      idProyecto: fallback.idProyecto,
      idSite: fallback.siteId,
      fila: fallback.fila,
      cliente,
      proyecto,
      site,
      tipoTrabajo,
      moneda,
      montoOc,
      totalAcumuladoOt,
      disponible,
      porcentaje,
      subOc,
      montoPlanilla,
      montoPlanillaPagado,
      adelaFic,
      porcentajeFic,
      montoOcAdelanto,
      porcentajeOcAdelanto,
    };
}

function exportToExcel(fileName: string, headers: string[], rows: Array<Array<string | number>>) {
  const worksheetData = [headers, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Pagos");
  XLSX.writeFile(workbook, fileName, { compression: true });
}

function getStatusLabel(tab: Exclude<PagoTabKey, "resumen">) {
  return TAB_THEME[tab].label;
}

function getStateColor(tab: Exclude<PagoTabKey, "resumen">) {
  return TAB_THEME[tab];
}

export default function PagosV1Page() {
  const [activeTab, setActiveTab] = useState<PagoTabKey>("aprobar");
  const [detailTab, setDetailTab] = useState<DetailTabKey>("resumen");
  const [filters, setFilters] = useState<FilterState>(() => getDefaultFilterState());
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(() => getDefaultFilterState());
  const [rowsByTab, setRowsByTab] = useState<Record<PagoTabKey, PagoRow[]>>({
    aprobar: [],
    reaprobar: [],
    hormiga: [],
    observadas: [],
    resumen: [],
  });
  const [loadingData, setLoadingData] = useState(true);
  const [selectedId, setSelectedId] = useState<number>(0);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [isHistorialPopupOpen, setIsHistorialPopupOpen] = useState(false);
  const [isHistorialOcPopupOpen, setIsHistorialOcPopupOpen] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [resumenOtDetalle, setResumenOtDetalle] = useState<ResumenOtDetalle | null>(null);
  const [historialRows, setHistorialRows] = useState<PagoRow[]>([]);
  const [historialOcRows, setHistorialOcRows] = useState<PagoRow[]>([]);
  const resumenOtCacheRef = useRef<Map<string, ResumenOtDetalle>>(new Map());

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadingData(true);

      try {
        const fechaInicio = formatDateParam(appliedFilters.fechaDesde);
        const fechaFin = formatDateParam(appliedFilters.fechaHasta);
        const tieneFiltroFechas = Boolean(fechaInicio || fechaFin);

        let nextRowsByTab: Record<PagoTabKey, PagoRow[]>;

        if (tieneFiltroFechas) {
          const parametros: PlanillaConsultaParametro[] = [
            { nombre: "Estados", valor: TAB_ESTADOS_CON_FECHA, tipo: "string" },
          ];

          if (fechaInicio) {
            parametros.push({ nombre: "FechaInicio", valor: fechaInicio, tipo: "date" });
          }

          if (fechaFin) {
            parametros.push({ nombre: "FechaFin", valor: fechaFin, tipo: "date" });
          }

          const response = await consultarPlanillaEstados(
            buildPlanillaConsultaEstadosRequest(parametros, {
              baseParams: {
                idCargo: null,
                idEmpleado: null,
              },
            }),
            { timeoutMs: 120000 }
          );

          const rows = Array.isArray(response.rows) ? response.rows : [];
          const mappedRows = rows.map((row, index) =>
            mapPlanillaConsultaRowToPagoRow(row, index, mapPlanillaEstadoToPagoEstado(
              getRecordNumber(row, "Estado", "estado") ?? getRecordString(row, "EstadoNombre", "estadoNombre"),
              "aprobar"
            ))
          );
          nextRowsByTab = groupRowsByEstado(mappedRows);
        } else {
          const tabEntries: Array<[Exclude<PagoTabKey, "resumen">, string]> = [
            ["aprobar", TAB_ESTADOS.aprobar],
            ["reaprobar", TAB_ESTADOS.reaprobar],
            ["hormiga", TAB_ESTADOS.hormiga],
            ["observadas", TAB_ESTADOS.observadas],
          ];

          const loaded = await Promise.all(
            tabEntries.map(async ([tab, estado]) => {
              const parametros: PlanillaConsultaParametro[] = [
                { nombre: "Estados", valor: estado, tipo: "string" },
              ];

              const response = await consultarPlanillaEstados(
                buildPlanillaConsultaEstadosRequest(parametros, {
                  baseParams: {
                    idCargo: null,
                    idEmpleado: null,
                  },
                }),
                { timeoutMs: 120000 }
              );

              const rows = Array.isArray(response.rows) ? response.rows : [];
              return [tab, rows.map((row, index) => mapPlanillaConsultaRowToPagoRow(row, index, tab))] as const;
            })
          );

          if (cancelled) {
            return;
          }

          nextRowsByTab = loaded.reduce<Record<PagoTabKey, PagoRow[]>>(
            (acc, [tab, rows]) => {
              acc[tab] = rows;
              return acc;
            },
            createEmptyRowsByTab()
          );
        }

        if (cancelled) {
          return;
        }

        setRowsByTab(nextRowsByTab);
      } catch {
        if (!cancelled) {
          setMessage("No se pudieron cargar las Órdenes desde Planilla.");
        }
      } finally {
        if (!cancelled) {
          setLoadingData(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [appliedFilters.fechaDesde, appliedFilters.fechaHasta]);

  const activeRows = useMemo(
    () => (activeTab === "resumen" ? rowsByTab.resumen : rowsByTab[activeTab]),
    [activeTab, rowsByTab]
  );

  const filteredRows = useMemo(() => {
    return activeRows.filter((row) => {
      const rowDate = toComparableDateKey(row.fecha);
      const fechaDesde = formatDateParam(appliedFilters.fechaDesde);
      const fechaHasta = formatDateParam(appliedFilters.fechaHasta);

      return (
        matchesTextFilter(row.cliente, appliedFilters.cliente) &&
        matchesTextFilter(row.proyecto, appliedFilters.proyecto) &&
        matchesTextFilter(row.site, appliedFilters.site) &&
        matchesTextFilter(row.tipoTrabajo, appliedFilters.tipoTrabajo) &&
        matchesTextFilter(row.tarea, appliedFilters.tarea) &&
        matchesTextFilter(row.solicitante, appliedFilters.solicitante) &&
        matchesTextFilter(row.responsable, appliedFilters.responsable) &&
        matchesTextFilter(row.correlativo, appliedFilters.correlativo) &&
        (!appliedFilters.estado || row.estado === appliedFilters.estado) &&
        (!fechaDesde || rowDate >= fechaDesde) &&
        (!fechaHasta || rowDate <= fechaHasta) &&
        matchesQuickSearch(row, appliedFilters.query)
      );
    });
  }, [activeRows, appliedFilters]);

  const groupedRows = useMemo<GroupRow[]>(() => {
    const map = new Map<string, GroupRow>();

    filteredRows.forEach((row) => {
      const key = row.solicitante;
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: row.solicitante,
          rows: [],
          total: 0,
          subtotal: 0,
          count: 0,
          totalsByCurrency: {},
        });
      }

      const group = map.get(key)!;
      const currencyKey = (row.moneda || "Sin moneda").trim();
      if (!group.totalsByCurrency[currencyKey]) {
        group.totalsByCurrency[currencyKey] = { subtotal: 0, igv: 0, total: 0 };
      }

      group.rows.push(row);
      group.total += row.total;
      group.subtotal += row.subtotal;
      group.count += 1;
      group.totalsByCurrency[currencyKey].subtotal += row.subtotal;
      group.totalsByCurrency[currencyKey].igv += row.igv;
      group.totalsByCurrency[currencyKey].total += row.total;
    });

    return Array.from(map.values());
  }, [filteredRows]);

  const visibleRowIds = useMemo(() => {
    const ids: number[] = [];

    groupedRows.forEach((group) => {
      const isCollapsed = collapsedGroups[group.key] ?? false;
      if (isCollapsed) {
        return;
      }

      group.rows.forEach((row) => ids.push(row.id));
    });

    return ids;
  }, [groupedRows, collapsedGroups]);

  const allGroupsExpanded = useMemo(
    () => groupedRows.length > 0 && groupedRows.every((group) => !(collapsedGroups[group.key] ?? false)),
    [groupedRows, collapsedGroups]
  );

  const toggleAllGroups = () => {
    setCollapsedGroups((prev) => {
      const next = { ...prev };
      const shouldCollapse = groupedRows.some((group) => !(prev[group.key] ?? false));
      groupedRows.forEach((group) => {
        next[group.key] = shouldCollapse;
      });
      return next;
    });
  };

  const toggleGroupSelection = (groupIds: number[], checked: boolean) => {
    setCheckedIds((prev) => {
      if (checked) {
        return Array.from(new Set([...prev, ...groupIds]));
      }

      const idsToRemove = new Set(groupIds);
      return prev.filter((id) => !idsToRemove.has(id));
    });
  };

  const selectAllRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const visibleIds = new Set(filteredRows.map((row) => row.id));
    if (!visibleIds.has(selectedId)) {
      setSelectedId(filteredRows[0]?.id ?? 0);
    }
  }, [filteredRows, selectedId]);

  useEffect(() => {
    const visibleIds = new Set(visibleRowIds);
    setCheckedIds((prev) => prev.filter((id) => visibleIds.has(id)));
  }, [visibleRowIds]);

  useEffect(() => {
    if (!selectAllRef.current) {
      return;
    }

    const allChecked = visibleRowIds.length > 0 && visibleRowIds.every((id) => checkedIds.includes(id));
    const someChecked = visibleRowIds.some((id) => checkedIds.includes(id));

    selectAllRef.current.checked = allChecked;
    selectAllRef.current.indeterminate = !allChecked && someChecked;
  }, [checkedIds, visibleRowIds]);

  useEffect(() => {
    setCollapsedGroups((prev) => {
      const next = { ...prev };
      groupedRows.forEach((group) => {
        if (next[group.key] == null) {
          next[group.key] = false;
        }
      });
      return next;
    });
  }, [groupedRows]);

  const selectedRow = useMemo(
    () => filteredRows.find((row) => row.id === selectedId) ?? filteredRows[0] ?? null,
    [filteredRows, selectedId]
  );

  const filaActiva = selectedRow;

  const tabStats = useMemo(() => {
    const counts = {
      aprobar: rowsByTab.aprobar.length,
      reaprobar: rowsByTab.reaprobar.length,
      hormiga: rowsByTab.hormiga.length,
      observadas: rowsByTab.observadas.length,
      resumen: rowsByTab.resumen.length,
    };

    return counts;
  }, [rowsByTab]);

  const currentTheme = TAB_THEME[activeTab];
  const mapearDatosOc = useCallback(
    (row: PagoRow) => {
      const ot = getValidOtValue(row.ot);
      const oc = getValidOcValue(row.idOc ?? row.documento);
      const normalizedOt = ot ? normalizeRecordKey(ot) : "";
      const sameOtRows = ot
        ? filteredRows.filter((item) => getValidOtValue(item.ot) === ot || normalizeRecordKey(getValidOtValue(item.ot)) === normalizedOt)
        : [];
      const montoOcTexto = row.montoOc2?.trim() || "";
      const montoOc = ot ? (parseNumericValue(montoOcTexto) || row.total) : 0;
      const montoPlanillaPagadoCampo = parseNumericValue(
        row.montoPlanillaPagadoDisplay ?? row.montoPlanillaPagado ?? row.conPagadoDisplay ?? row.conPagado
      );
      const totalAcumuladoOt =
        ot
          ? montoPlanillaPagadoCampo > 0
            ? montoPlanillaPagadoCampo
            : sameOtRows.reduce((acc, item) => acc + item.total, 0)
          : 0;
      const subOc = Number.isFinite(row.subOc ?? NaN) ? Number(row.subOc ?? 0) : sameOtRows.reduce((acc, item) => acc + item.subtotal, 0);
      const adelaFic = Number.isFinite(row.adelaFic ?? NaN) ? Number(row.adelaFic ?? 0) : 0;
      const porcentajeFic = Number.isFinite(row.porcentajeFic ?? NaN)
        ? Number(row.porcentajeFic ?? 0)
        : ot && montoOc > 0
          ? (totalAcumuladoOt / montoOc) * 100
          : 0;
      const disponible = ot ? Math.max(montoOc - totalAcumuladoOt, 0) : 0;
      const porcentaje = ot ? getConsumptionPercent(montoOc, disponible) : 0;
      const solicitadoOc = oc ? (Number.isFinite(row.subtotal ?? NaN) ? Number(row.subtotal ?? 0) : row.subtotal) : 0;
      const pagadoOc = 0;
      const totalOc = oc ? subOc : 0;
      const disponibleOc = oc ? Math.max(totalOc - (pagadoOc + solicitadoOc), 0) : 0;
      const porcentajeOc = oc ? getConsumptionPercent(totalOc, disponibleOc) : 0;

      return {
        ...row,
        ot,
        sameOtRows,
        totalAcumuladoOt,
        montoOc,
        disponible,
        porcentaje,
        pagado: ot ? (montoPlanillaPagadoCampo > 0 ? montoPlanillaPagadoCampo : totalAcumuladoOt) : 0,
        pendiente: ot ? Math.max(montoOc - totalAcumuladoOt, 0) : 0,
        subOc: totalOc,
        montoPlanilla: montoPlanillaPagadoCampo > 0 ? montoPlanillaPagadoCampo : undefined,
        adelaFic,
        porcentajeFic,
        porcentajeMontoBck: undefined,
        solicitado: solicitadoOc,
        porcentajeOc,
        disponibleOc,
        montoOcAdelanto: oc ? adelaFic : 0,
        porcentajeOcAdelanto: oc && montoOc > 0 ? (adelaFic / montoOc) * 100 : 0,
        idSite: row.siteId,
      };
    },
    [filteredRows]
  );

  const detalleOcBase = useMemo(() => (filaActiva ? mapearDatosOc(filaActiva) : null), [filaActiva, mapearDatosOc]);
  const historialOtSeleccionada = getValidOtValue(filaActiva?.ot);
  const historialOcSeleccionada = getValidOcValue(filaActiva?.idOc ?? filaActiva?.documento);

  useEffect(() => {
    let cancelled = false;

    const cargarResumenOt = async () => {
      if (!filaActiva) {
        setResumenOtDetalle(null);
        return;
      }

      const request = buildResumenOtRequest(filaActiva);
      if (!request) {
        setResumenOtDetalle(null);
        return;
      }

      const cacheKey = [
        filaActiva.ot || filaActiva.correlativo || "",
        String(filaActiva.idCliente ?? ""),
        String(filaActiva.idProyecto ?? ""),
        filaActiva.siteId || "",
        filaActiva.correlativo || "",
        filaActiva.tipoTrabajo || "",
      ].join("|");

      const cached = resumenOtCacheRef.current.get(cacheKey);
      if (cached) {
        if (!cancelled) {
          setResumenOtDetalle(cached);
        }
        return;
      }

      try {
        const response = await consultarPlanillaEstados(request, { timeoutMs: 120000 });
        const row = Array.isArray(response.rows) && response.rows.length > 0 ? response.rows[0] : null;

        if (!row) {
          if (!cancelled) {
            setResumenOtDetalle(null);
          }
          return;
        }

        const mapped = mapResumenOtResponseRowToDetalle(row, filaActiva);
        resumenOtCacheRef.current.set(cacheKey, mapped);

        if (!cancelled) {
          setResumenOtDetalle(mapped);
        }
      } catch {
        if (!cancelled) {
          setResumenOtDetalle(null);
        }
      }
    };

    void cargarResumenOt();

    return () => {
      cancelled = true;
    };
  }, [filaActiva]);

  useEffect(() => {
    let cancelled = false;

    const loadHistorial = async () => {
      if (detailTab !== "historial") {
        return;
      }

      if (!filaActiva) {
        setHistorialRows([]);
        return;
      }

      const request = buildHistorialRequest(filaActiva, activeTab);
      if (!request) {
        setHistorialRows([]);
        return;
      }

      try {
        const response = await consultarPlanillaEstados(request, { timeoutMs: 120000 });
        if (cancelled) {
          return;
        }

        const rows = Array.isArray(response.rows) ? response.rows : [];
        setHistorialRows(rows.map((row, index) => mapPlanillaConsultaRowToPagoRow(row, index, filaActiva.estado)));
      } catch {
        if (!cancelled) {
          setHistorialRows([]);
        }
      }
    };

    void loadHistorial();

    return () => {
      cancelled = true;
    };
  }, [detailTab, filaActiva, activeTab]);

  useEffect(() => {
    let cancelled = false;

    const loadHistorialOc = async () => {
      if (!filaActiva) {
        setHistorialOcRows([]);
        return;
      }

      const request = buildHistorialOcRequest(filaActiva);
      if (!request) {
        setHistorialOcRows([]);
        return;
      }

      try {
        const response = await consultarPlanillaEstados(request, { timeoutMs: 120000 });
        if (cancelled) {
          return;
        }

        const rows = Array.isArray(response.rows) ? response.rows : [];
        setHistorialOcRows(rows.map((row, index) => mapPlanillaConsultaRowToPagoRow(row, index, filaActiva.estado)));
      } catch {
        if (!cancelled) {
          setHistorialOcRows([]);
        }
      }
    };

    void loadHistorialOc();

    return () => {
      cancelled = true;
    };
  }, [detailTab, filaActiva]);

  useEffect(() => {
    if (detailTab !== "historial") {
      setIsHistorialPopupOpen(false);
    }
  }, [detailTab]);

  useEffect(() => {
    if (detailTab !== "historial-oc") {
      setIsHistorialOcPopupOpen(false);
    }
  }, [detailTab]);

  const detalleOcActiva = useMemo(() => {
    if (!detalleOcBase) {
      return null;
    }

    if (!resumenOtDetalle) {
      return detalleOcBase;
    }

    return {
      ...detalleOcBase,
      ...resumenOtDetalle,
      ot: resumenOtDetalle.ot || detalleOcBase.ot,
      correlativo: resumenOtDetalle.correlativo || detalleOcBase.correlativo,
      idCliente: resumenOtDetalle.idCliente ?? detalleOcBase.idCliente,
      idProyecto: resumenOtDetalle.idProyecto ?? detalleOcBase.idProyecto,
      idSite: resumenOtDetalle.idSite || detalleOcBase.idSite,
      fila: resumenOtDetalle.fila || detalleOcBase.fila,
      cliente: resumenOtDetalle.cliente || detalleOcBase.cliente,
      proyecto: resumenOtDetalle.proyecto || detalleOcBase.proyecto,
      site: resumenOtDetalle.site || detalleOcBase.site,
      tipoTrabajo: resumenOtDetalle.tipoTrabajo || detalleOcBase.tipoTrabajo,
      moneda: resumenOtDetalle.moneda || detalleOcBase.moneda,
      porcentaje: getConsumptionPercent(
        parseNumericValue(resumenOtDetalle.montoOc ?? detalleOcBase.montoOc ?? 0),
        parseNumericValue(resumenOtDetalle.disponible ?? detalleOcBase.disponible ?? 0)
      ),
      pagado: resumenOtDetalle.montoPlanillaPagado ?? detalleOcBase.pagado,
      montoPlanilla: resumenOtDetalle.montoPlanilla ?? detalleOcBase.montoPlanilla,
      montoPlanillaPagado: resumenOtDetalle.montoPlanillaPagado ?? detalleOcBase.montoPlanillaPagado,
      totalAcumuladoOt: resumenOtDetalle.totalAcumuladoOt ?? detalleOcBase.totalAcumuladoOt,
      porcentajeMontoBck:
        resumenOtDetalle.porcentajeMontoBck ??
        getConsumptionPercent(
          parseNumericValue(resumenOtDetalle.montoOc ?? detalleOcBase.montoOc ?? 0),
          parseNumericValue(resumenOtDetalle.disponible ?? detalleOcBase.disponible ?? 0)
        ),
      porcentajeOc: getConsumptionPercent(
        parseNumericValue(resumenOtDetalle.subOc ?? detalleOcBase.subOc ?? 0),
        parseNumericValue(resumenOtDetalle.disponibleOc ?? detalleOcBase.disponibleOc ?? 0)
      ),
    };
  }, [detalleOcBase, resumenOtDetalle]);
  const resumenOcTitulo = detalleOcActiva?.ot || detalleOcActiva?.correlativo || filaActiva?.ot || filaActiva?.correlativo || "";
  const consumoOtPercent = detalleOcActiva
    ? Number.isFinite(detalleOcActiva.porcentajeMontoBck ?? NaN)
      ? Number(detalleOcActiva.porcentajeMontoBck ?? 0)
      : getConsumptionPercent(parseNumericValue(detalleOcActiva.montoOc), parseNumericValue(detalleOcActiva.disponible))
    : 0;
  const consumoOcPercent = detalleOcActiva
    ? getConsumptionPercent(parseNumericValue(detalleOcActiva.subOc), parseNumericValue(detalleOcActiva.disponibleOc ?? 0))
    : 0;
  const montoPlanillaPagadoOc = useMemo(() => {
    const rowConMontoPagado = historialOcRows.find((row) => Number.isFinite(row.montoPlanillaPagado ?? NaN));

    if (!rowConMontoPagado) {
      return 0;
    }

    return parseNumericValue(rowConMontoPagado.montoPlanillaPagado);
  }, [historialOcRows]);
  const pagadoOcAmount = Math.max(montoPlanillaPagadoOc, 0);
  const solicitadoOcAmount = Math.max(parseNumericValue(detalleOcActiva?.solicitado ?? 0), 0);
  const totalOcAmount = Math.max(parseNumericValue(detalleOcActiva?.subOc ?? 0), 0);
  const pagadoOcPercent = totalOcAmount > 0 ? Math.min((pagadoOcAmount / totalOcAmount) * 100, 100) : 0;
  const solicitadoOcPercent = totalOcAmount > 0 ? Math.min((solicitadoOcAmount / totalOcAmount) * 100, 100 - pagadoOcPercent) : 0;
  const disponibleOcPercent = Math.max(100 - pagadoOcPercent - solicitadoOcPercent, 0);

  const totalsByCurrency = useMemo(() => {
    return filteredRows.reduce<Record<string, { subtotal: number; igv: number; total: number }>>((acc, row) => {
      const key = (row.moneda || "Sin moneda").trim();
      if (!acc[key]) {
        acc[key] = { subtotal: 0, igv: 0, total: 0 };
      }
      acc[key].subtotal += row.subtotal;
      acc[key].igv += row.igv;
      acc[key].total += row.total;
      return acc;
    }, {});
  }, [filteredRows]);

  const selectedRows = useMemo(() => {
    if (!checkedIds.length) {
      return [] as PagoRow[];
    }

    const selectedSet = new Set(checkedIds);
    return filteredRows.filter((row) => selectedSet.has(row.id));
  }, [checkedIds, filteredRows]);

  const selectedTotalsByCurrency = useMemo(() => {
    return selectedRows.reduce<Record<string, { subtotal: number; igv: number; total: number }>>((acc, row) => {
      const key = (row.moneda || "Sin moneda").trim();
      if (!acc[key]) {
        acc[key] = { subtotal: 0, igv: 0, total: 0 };
      }
      acc[key].subtotal += row.subtotal;
      acc[key].igv += row.igv;
      acc[key].total += row.total;
      return acc;
    }, {});
  }, [selectedRows]);

  const summaryTotalsByCurrency = checkedIds.length > 0 ? selectedTotalsByCurrency : totalsByCurrency;
  const summaryRowCount = checkedIds.length > 0 ? selectedRows.length : filteredRows.length;
  const summaryLabel = checkedIds.length > 0 ? "Seleccionados" : "Mostrando";

  useEffect(() => {
    setDetailTab("resumen");
  }, [selectedId, activeTab]);

  const actionConfig = useMemo(() => {
    switch (activeTab) {
      case "aprobar":
        return {
          primary: { label: "Aprobar", icon: <CheckCircle2 size={18} />, color: "#1D4ED8", soft: "#EFF6FF", border: "#93C5FD" },
          secondary: { label: "Rechazar", icon: <XCircle size={18} />, color: "#DC2626", soft: "#FEF2F2", border: "#FCA5A5" },
          tertiary: { label: "Ver PDF", icon: <Printer size={18} />, color: "#334155", soft: "#FFFFFF", border: "#CBD5E1" },
          quaternary: { label: "Regularizar", icon: <ShieldCheck size={18} />, color: "#0F766E", soft: "#F0FDFA", border: "#5EEAD4" },
        };
      case "reaprobar":
        return {
          primary: { label: "Re-aprobar", icon: <RotateCcw size={18} />, color: "#1D4ED8", soft: "#EFF6FF", border: "#93C5FD" },
          secondary: { label: "Observar", icon: <Eye size={18} />, color: "#F59E0B", soft: "#FFFBEB", border: "#FCD34D" },
          tertiary: { label: "Rechazar", icon: <XCircle size={18} />, color: "#DC2626", soft: "#FEF2F2", border: "#FCA5A5" },
          quaternary: { label: "Ver PDF", icon: <Printer size={18} />, color: "#334155", soft: "#FFFFFF", border: "#CBD5E1" },
        };
      case "hormiga":
        return {
          primary: { label: "Hormiga", icon: <HandCoins size={18} />, color: "#B45309", soft: "#FFFBEB", border: "#FCD34D" },
          secondary: { label: "Re-aprobar", icon: <RotateCcw size={18} />, color: "#7C3AED", soft: "#F5F3FF", border: "#C4B5FD" },
          tertiary: { label: "Observadas", icon: <AlertTriangle size={18} />, color: "#DC2626", soft: "#FEF2F2", border: "#FCA5A5" },
          quaternary: { label: "Ver PDF", icon: <Printer size={18} />, color: "#334155", soft: "#FFFFFF", border: "#CBD5E1" },
        };
      case "observadas":
        return {
          primary: { label: "Regularizar", icon: <ShieldCheck size={18} />, color: "#0F766E", soft: "#F0FDFA", border: "#5EEAD4" },
          secondary: { label: "Ver observaciÃ³n", icon: <Eye size={18} />, color: "#F59E0B", soft: "#FFFBEB", border: "#FCD34D" },
          tertiary: { label: "Aprobar", icon: <CheckCircle2 size={18} />, color: "#2563EB", soft: "#EFF6FF", border: "#93C5FD" },
          quaternary: { label: "Ver PDF", icon: <Printer size={18} />, color: "#334155", soft: "#FFFFFF", border: "#CBD5E1" },
        };
      case "resumen":
      default:
        return {
          primary: { label: "Exportar", icon: <FileDown size={18} />, color: "#7C3AED", soft: "#F5F3FF", border: "#C4B5FD" },
          secondary: { label: "Ver detalle", icon: <Eye size={18} />, color: "#334155", soft: "#FFFFFF", border: "#CBD5E1" },
          tertiary: { label: "Aprobar", icon: <CheckCircle2 size={18} />, color: "#2563EB", soft: "#EFF6FF", border: "#93C5FD" },
          quaternary: { label: "Limpiar", icon: <Filter size={18} />, color: "#0F766E", soft: "#F0FDFA", border: "#5EEAD4" },
        };
    }
  }, [activeTab]);
  const showEstadoOc = activeTab === "resumen";
  const tableColSpan = showEstadoOc ? 18 : 17;

  const handleAction = (label: string) => {
    if (label === "Exportar") {
      handleExport();
      return;
    }
    if (label === "Limpiar") {
      const defaultFilters = getDefaultFilterState();
      setFilters(defaultFilters);
      setAppliedFilters(defaultFilters);
      setMessage("Filtros limpiados.");
      return;
    }
    if (label === "Ver detalle") {
      setDetailTab("orden");
      return;
    }
    if (label === "Ver observaciÃ³n") {
      setDetailTab("historial");
      return;
    }
    if (label === "Aprobar") {
      setActiveTab("aprobar");
      return;
    }
    if (label === "Re-aprobar") {
      setActiveTab("reaprobar");
      return;
    }
    if (label === "Hormiga") {
      setActiveTab("hormiga");
      return;
    }
    if (label === "Observadas") {
      setActiveTab("observadas");
      return;
    }
    setMessage(`${label} ejecutado en modo demo.`);
  };

  const handleApplyFilters = () => {
    setAppliedFilters(filters);
    setMessage("Filtros aplicados.");
  };

  const handleQuickSearchChange = (value: string) => {
    setFilters((prev) => ({ ...prev, query: value }));
    setAppliedFilters((prev) => ({ ...prev, query: value }));
  };

  function handleExport() {
    const rows = filteredRows.map((row) => [
      row.correlativo,
      row.ot,
      row.idOc || row.documento,
      row.fila ?? "",
      row.cliente,
      row.proyecto,
      row.siteId,
      row.site,
      row.tipoTrabajo,
      row.tarea,
      formatDate(row.fecha),
      row.solicitante,
      row.responsable,
      row.estado,
      row.moneda,
      formatMoney(row.subtotal),
      formatMoney(row.igv),
      formatMoney(row.total),
    ]);

    exportToExcel(
      `pagos_v1_${activeTab}_${new Date().toISOString().slice(0, 10)}.xlsx`,
        [
          "Correlativo",
          "OT",
          "OC",
          "Fila",
          "Cliente",
          "Proyecto",
        "Site ID",
        "Site",
        "Tipo Trabajo",
        "Tarea",
        "Fecha",
        "Solicitante",
        "Responsable",
        "Validador",
        "Estado",
        "Moneda",
        "Subtotal",
        "IGV",
        "Total",
      ],
      rows
    );
    setMessage("Exportación a Excel lista.");
  }

  function handleExportHistorial() {
    const rows = historialRows.map((row) => [
      row.correlativo,
      row.ot,
      row.idOc || row.documento,
      row.fila ?? "",
      row.responsable,
      row.validador || "-",
      formatMoney(row.subtotal),
      formatMoney(row.igv),
      formatMoney(row.total),
      formatDate(row.fecha),
      row.cliente,
      row.proyecto,
      row.siteId,
      row.corSite || "-",
      row.site,
      row.tipoTrabajo,
      row.tarea,
    ]);

    exportToExcel(
      `pagos_v1_historial_${historialOtSeleccionada || "ot"}_${new Date().toISOString().slice(0, 10)}.xlsx`,
      [
        "Correlativo",
        "OT",
        "OC",
        "Fila",
        "Responsable",
        "Validador",
        "Subtotal",
        "IGV",
        "Total",
        "Fecha",
        "Cliente",
        "Proyecto",
        "Site ID",
        "CorSite",
        "Site",
        "Tipo Trabajo",
        "Tarea",
      ],
      rows
    );
  }

  function handleExportHistorialOc() {
    const rows = historialOcRows.map((row) => [
      row.correlativo,
      row.ot,
      row.idOc || row.documento,
      row.fila ?? "",
      row.responsable,
      row.validador || "-",
      formatMoney(row.subtotal),
      formatMoney(row.igv),
      formatMoney(row.total),
      formatDate(row.fecha),
      row.cliente,
      row.proyecto,
      row.siteId,
      row.corSite || "-",
      row.site,
      row.tipoTrabajo,
      row.tarea,
    ]);

    exportToExcel(
      `pagos_v1_historial_oc_${historialOcSeleccionada || "oc"}_${new Date().toISOString().slice(0, 10)}.xlsx`,
      [
        "Correlativo",
        "OT",
        "OC",
        "Fila",
        "Responsable",
        "Validador",
        "Subtotal",
        "IGV",
        "Total",
        "Fecha",
        "Cliente",
        "Proyecto",
        "Site ID",
        "CorSite",
        "Site",
        "Tipo Trabajo",
        "Tarea",
      ],
      rows
    );
  }

  const groupedCountText = groupedRows.length === 1 ? "1 grupo" : `${groupedRows.length} grupos`;

  return (
    <AppPage title="Órdenes de Pago" fillHeight>
      <div style={styles.page}>
        <section
          style={{
            ...styles.hero,
            borderColor: currentTheme.border,
            background: currentTheme.soft,
          }}
        >
          <div style={styles.heroTopRow}>
            <div style={styles.heroTitleBlock}>
              <div style={{ ...styles.kicker, color: currentTheme.accent, background: currentTheme.soft, borderColor: currentTheme.border }}>
                <ReceiptText size={14} />
                <span>TESORERIA / PAGOS</span>
              </div>
              <div style={styles.heroTitleLine}>
                <div style={styles.heroIconBox}>
                  <ReceiptText size={22} strokeWidth={2.1} />
                </div>
                <div>
                  <h1 style={styles.title}>Órdenes de Pago</h1>
                </div>
              </div>
              <div style={styles.quickFiltersRow}>
                <div style={{ ...styles.quickSearchWrap, borderColor: currentTheme.border, background: "#FFFFFF" }}>
                  <Search size={16} color={currentTheme.accent} />
                  <input
                    type="text"
                    value={filters.query}
                    onChange={(event) => handleQuickSearchChange(event.target.value)}
                    placeholder="Búsqueda rápida por correlativo, responsable, cliente o proyecto"
                    style={styles.quickSearchInput}
                  />
                </div>

                <div style={styles.quickDateFilters}>
                  <div style={styles.quickDateField}>
                    <span style={styles.quickDateLabel}>Fecha inicio</span>
                    <input
                      type="date"
                      value={filters.fechaDesde}
                      onChange={(event) => setFilters((prev) => ({ ...prev, fechaDesde: event.target.value }))}
                      style={{ ...styles.quickDateInput, borderColor: currentTheme.border }}
                    />
                  </div>
                  <div style={styles.quickDateField}>
                    <span style={styles.quickDateLabel}>Fecha fin</span>
                    <input
                      type="date"
                      value={filters.fechaHasta}
                      onChange={(event) => setFilters((prev) => ({ ...prev, fechaHasta: event.target.value }))}
                      style={{ ...styles.quickDateInput, borderColor: currentTheme.border }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyFilters}
                    style={{
                      ...styles.applyFiltersButton,
                      borderColor: currentTheme.border,
                      background: currentTheme.accent,
                      color: "#FFFFFF",
                    }}
                  >
                    <Filter size={15} />
                    Aplicar filtros
                  </button>
                </div>
              </div>

            </div>

            <div style={styles.metricsStrip}>
              <KpiCard
                label="Aprobar"
                value={tabStats.aprobar}
                accent="#F59E0B"
                soft="#FFFBEB"
                border="#FCD34D"
                icon={<ReceiptText size={16} />}
                selected={activeTab === "aprobar"}
                onClick={() => setActiveTab("aprobar")}
              />
              <KpiCard
                label="Re-aprobar"
                value={tabStats.reaprobar}
                accent="#2563EB"
                soft="#EFF6FF"
                border="#93C5FD"
                icon={<RotateCcw size={16} />}
                selected={activeTab === "reaprobar"}
                onClick={() => setActiveTab("reaprobar")}
              />
              <KpiCard
                label="Hormiga"
                value={tabStats.hormiga}
                accent="#059669"
                soft="#F0FDF4"
                border="#86EFAC"
                icon={<HandCoins size={16} />}
                selected={activeTab === "hormiga"}
                onClick={() => setActiveTab("hormiga")}
              />
              <KpiCard
                label="Observadas"
                value={tabStats.observadas}
                accent="#DC2626"
                soft="#FEF2F2"
                border="#FCA5A5"
                icon={<AlertTriangle size={16} />}
                selected={activeTab === "observadas"}
                onClick={() => setActiveTab("observadas")}
              />
              <KpiCard
                label="Total Órdenes"
                value={tabStats.resumen}
                accent="#7C3AED"
                soft="#F5F3FF"
                border="#C4B5FD"
                icon={<ShieldCheck size={16} />}
                selected={activeTab === "resumen"}
                onClick={() => setActiveTab("resumen")}
              />
            </div>
          </div>
        </section>

          <section
          style={{
            ...styles.mainGrid,
            gridTemplateColumns: "minmax(0, 1fr) 580px",
          }}
        >
          <div style={styles.leftColumn}>
            <div style={styles.gridCard}>
           

            <div style={styles.gridScrollable}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={{ ...styles.th, width: 108, textAlign: "center" }}>
                      <div style={styles.headerSelectionTools}>
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          aria-label="Seleccionar todas las filas visibles"
                          onChange={(event) => {
                            const nextIds = event.target.checked ? visibleRowIds : [];
                            setCheckedIds(nextIds);
                          }}
                          onClick={(event) => event.stopPropagation()}
                          style={{ accentColor: currentTheme.accent }}
                        />
                        <button
                          type="button"
                          onClick={toggleAllGroups}
                          aria-label={allGroupsExpanded ? "Contraer todos los segmentos" : "Desplegar todos los segmentos"}
                          title={allGroupsExpanded ? "Contraer todos los segmentos" : "Desplegar todos los segmentos"}
                          style={{
                            ...styles.headerToggleAllButton,
                            borderColor: currentTheme.border,
                            color: currentTheme.accent,
                            background: currentTheme.soft,
                          }}
                        >
                          {allGroupsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>
                    </th>
                    <th style={{ ...styles.th, width: 94 }}>Correlativo</th>
                    <th style={{ ...styles.th, width: 88 }}>OT</th>
                    <th style={{ ...styles.th, width: 88 }}>OC</th>
                    <th style={{ ...styles.th, width: 72 }}>Fila</th>
                    <th style={{ ...styles.th, width: 90 }}>Responsable</th>
                    <th style={{ ...styles.th, width: 110 }}>Validador</th>
                    <th style={{ ...styles.th, width: 90 }}>Subtotal</th>
                    <th style={{ ...styles.th, width: 90 }}>IGV</th>
                    <th style={{ ...styles.th, width: 100 }}>Total</th>
                    <th style={{ ...styles.th, width: 80 }}>Fecha</th>
                    <th style={{ ...styles.th, width: 60 }}>Cliente</th>
                    <th style={{ ...styles.th, width: 20 }}>Proyecto</th>
                    <th style={{ ...styles.th, width: 60 }}>Site ID</th>
                    <th style={{ ...styles.th, width: 60 }}>CorSite</th>
                    <th style={{ ...styles.th, width: 20 }}>Site</th>
                    <th style={{ ...styles.th, width: 20 }}>Tipo trabajo</th>
                    <th style={{ ...styles.th, width: 20 }}>Tarea</th>
                    {showEstadoOc ? <th style={{ ...styles.th, width: 118 }}>Estado OC</th> : null}
                    <th style={{ ...styles.th, width: 60 }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingData ? (
                    <tr>
                      <td colSpan={tableColSpan} style={styles.emptyCell}>
                        Cargando Órdenes desde Planilla...
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={tableColSpan} style={styles.emptyCell}>
                        No se encontraron registros con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    groupedRows.map((group) => {
                      const isCollapsed = collapsedGroups[group.key] ?? false;
                      const groupRowIds = group.rows.map((row) => row.id);
                      const groupAllChecked = groupRowIds.length > 0 && groupRowIds.every((id) => checkedIds.includes(id));
                      const groupSomeChecked = groupRowIds.some((id) => checkedIds.includes(id));
                      const groupTheme = getStateColor(activeTab === "resumen" ? group.rows[0]?.estado ?? "aprobar" : activeTab);
                      return (
                        <React.Fragment key={group.key}>
                          <tr style={styles.groupRow}>
                            <td colSpan={tableColSpan} style={styles.groupCell}>
                              <div style={styles.groupBar}>
                                <input
                                  type="checkbox"
                                  aria-label={`Seleccionar registros del solicitante ${group.label}`}
                                  checked={groupAllChecked}
                                  ref={(el) => {
                                    if (el) {
                                      el.indeterminate = !groupAllChecked && groupSomeChecked;
                                    }
                                  }}
                                  onChange={(event) => toggleGroupSelection(groupRowIds, event.target.checked)}
                                  onClick={(event) => event.stopPropagation()}
                                  style={{ accentColor: groupTheme.accent }}
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCollapsedGroups((prev) => ({ ...prev, [group.key]: !isCollapsed }))
                                  }
                                  style={{
                                    ...styles.groupToggle,
                                    borderColor: groupTheme.border,
                                    background: groupTheme.soft,
                                    color: groupTheme.accent,
                                  }}
                                  aria-label={isCollapsed ? "Expandir grupo" : "Contraer grupo"}
                                >
                                  {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                                </button>
                                <strong style={styles.groupTitle}>Solicitante: {group.label}</strong>
                                <span style={styles.groupCount}>{group.count}</span>
                                <div style={styles.groupCurrencyStack}>
                                  {Object.entries(group.totalsByCurrency).map(([currency, amounts]) => (
                                    <div key={currency} style={styles.groupCurrencyLine}>
                                      <span style={styles.groupCurrencyLabel}>{currency}:</span>
                                      <strong>
                                        Subtotal {formatCurrency(amounts.subtotal, currency)} | IGV {formatCurrency(amounts.igv, currency)} | Total {formatCurrency(amounts.total, currency)}
                                      </strong>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>

                          {!isCollapsed &&
                            group.rows.map((row) => {
                              const rowTheme = getStateColor(row.estado);
                              const isSelected = row.id === selectedId;
                              const percent = row.subOc && row.subOc > 0 ? Math.round((row.subtotal / row.subOc) * 100) : 0;

                              return (
                                <tr
                                  key={row.id}
                                  onClick={() => setSelectedId(row.id)}
                                  style={{
                                    cursor: "pointer",
                                    background: isSelected ? "#EEF2FF" : "#FFFFFF",
                                  }}
                                >
                                  <td style={styles.td}>
                                    <input
                                      type="checkbox"
                                      checked={checkedIds.includes(row.id)}
                                      onChange={(event) => {
                                        event.stopPropagation();
                                        setCheckedIds((prev) =>
                                          event.target.checked
                                            ? Array.from(new Set([...prev, row.id]))
                                            : prev.filter((id) => id !== row.id)
                                        );
                                      }}
                                      onClick={(event) => event.stopPropagation()}
                                      style={{ accentColor: rowTheme.accent }}
                                    />
                                  </td>
                                  <td style={styles.td}>{row.correlativo}</td>
                                  <td style={styles.td}>{row.ot || "-"}</td>
                                  <td style={styles.td}>{row.idOc || row.documento || "-"}</td>
                                  <td style={styles.td}>{row.fila || "-"}</td>
                                  <td style={styles.td}>{row.responsable}</td>
                                  <td style={styles.td}>{row.validador || "-"}</td>
                                  <td style={{ ...styles.td, fontWeight: 900 }}>{formatCurrency(row.subtotal, row.moneda)}</td>
                                  <td style={styles.td}>{formatCurrency(row.igv, row.moneda)}</td>
                                  <td style={styles.td}>{formatCurrency(row.total, row.moneda)}</td>
                                  <td style={styles.td}>{formatDate(row.fecha)}</td>
                                  <td style={styles.td}>{row.cliente}</td>
                                  <td style={styles.td}>{row.proyecto}</td>
                                  <td style={styles.td}>{row.siteId}</td>
                                  <td style={styles.td}>{row.corSite || "-"}</td>
                                  <td style={styles.td}>{row.site}</td>
                                  <td style={styles.td}>{row.tipoTrabajo}</td>
                                  <td style={styles.td}>{row.tarea}</td>
                                  {showEstadoOc ? (
                                    <td style={styles.td}>
                                      <span
                                        style={{
                                          ...styles.stateBadge,
                                          color: rowTheme.accent,
                                          background: rowTheme.soft,
                                          borderColor: rowTheme.border,
                                        }}
                                      >
                                        {getStatusLabel(row.estado)}
                                      </span>
                                    </td>
                                  ) : null}
                                  <td style={styles.td}>{percent}%</td>
                                </tr>
                              );
                            })}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div style={styles.gridFooter}>
              <div style={styles.gridFooterText}>
                {summaryLabel} {summaryRowCount} registros de {rowsByTab.resumen.length}
              </div>
              <div style={styles.gridFooterTotals}>
                {Object.entries(summaryTotalsByCurrency).map(([currency, amounts]) => (
                    <span key={currency}>
                      {currency}:{" "}
                      <strong>
                        Subtotal {formatCurrency(amounts.subtotal, currency)} | IGV {formatCurrency(amounts.igv, currency)} | Total {formatCurrency(amounts.total, currency)}
                    </strong>
                  </span>
                ))}
                {checkedIds.length === 0 ? null : <span style={{ color: currentTheme.accent }}>Solo sobre registros seleccionados</span>}
              </div>
            </div>
            </div>

            <section style={styles.actionsBar}>
                <div style={styles.actionsCard}>
                      <div style={styles.actionsRow}>
                  <ActionButton config={actionConfig.primary} onClick={() => handleAction(actionConfig.primary.label)} />
                  <ActionButton config={actionConfig.secondary} onClick={() => handleAction(actionConfig.secondary.label)} />
                  {actionConfig.tertiary.label !== "Ver PDF" ? (
                    <ActionButton config={actionConfig.tertiary} onClick={() => handleAction(actionConfig.tertiary.label)} />
                  ) : null}
                  {actionConfig.quaternary.label !== "Ver PDF" ? (
                    <ActionButton config={actionConfig.quaternary} onClick={() => handleAction(actionConfig.quaternary.label)} />
                  ) : null}
                  <button type="button" style={{ ...styles.slimActionButton, borderColor: currentTheme.border, color: currentTheme.accent }} onClick={handleExport}>
                    <Download size={16} />
                    Exportar
                  </button>
                </div>
              </div>
            </section>
          </div>

          <aside style={styles.ocDataCard}>
            {filaActiva && detalleOcActiva ? (
              <>
                <div style={styles.ocDataHeader}>
                  <div>
                    <div style={{ ...styles.sectionKicker, color: currentTheme.accent }}>Detalles del registro</div>
                    <h2 style={styles.detailTitleSmall}>Orden de Pago N° {filaActiva.correlativo}</h2>
                  </div>
                  <span
                    style={{
                      ...styles.detailStatus,
                      color: currentTheme.accent,
                      background: currentTheme.soft,
                      borderColor: currentTheme.border,
                    }}
                  >
                    {getStatusLabel(filaActiva.estado)}
                  </span>
                </div>

                <div style={styles.detailTabs}>
                  {[ 
                    { key: 'orden' as DetailTabKey, label: 'Detalle' },
                    { key: 'resumen' as DetailTabKey, label: 'Resumen' },
                    { key: 'historial' as DetailTabKey, label: 'Historial OT' },
                    { key: 'historial-oc' as DetailTabKey, label: 'Historial OC' },
                  ].map((tab) => {
                    const isActive = detailTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setDetailTab(tab.key)}
                        style={{
                          ...styles.detailTabButton,
                          color: isActive ? currentTheme.accent : '#334155',
                          background: isActive ? currentTheme.soft : '#FFFFFF',
                          borderColor: isActive ? currentTheme.border : '#CBD5E1',
                          boxShadow: isActive ? '0 6px 16px rgba(37, 99, 235, 0.10)' : 'none',
                        }}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {detailTab === 'orden' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={styles.detailTitleRow}>
                     
                     
                    </div>
                    <div style={styles.noteCard}>
                      <div style={styles.noteTitle}>Comentario</div>
                      <p style={styles.noteText}>{filaActiva.detalle}</p>
                    </div>
                    <div style={styles.noteCard}>
                      <div style={styles.noteTitle}>ObservaciÃ³n</div>
                      <p style={styles.noteText}>{filaActiva.observacion}</p>
                    </div>
                  </div>
                ) : null}

                {detailTab === 'resumen' ? (
                  <>
                    <div style={styles.ocTopGrid}>
                      <InfoField label="Cliente" value={detalleOcActiva.cliente} />
                      <InfoField label="Proyecto" value={detalleOcActiva.proyecto} />
                      <InfoField label="Site" value={detalleOcActiva.site} />
                      <InfoField label="Tipo trabajo" value={detalleOcActiva.tipoTrabajo} />
                    </div>

                    <div style={styles.ocProgressPair}>
                      <div style={styles.ocProgressCard}>
                        <div style={styles.ocProgressTopRow}>
                          <div>
                            <div style={styles.ocConsumptionTitle}>
                              {detalleOcActiva.ot
                                ? `Consumo de la OT N° ${detalleOcActiva.ot}`
                                : "Consumo de la OT"}
                            </div>
                           
                          </div>
                          <div style={styles.ocProgressValue}>{formatPercent(consumoOtPercent)}</div>
                        </div>
                        <div style={styles.progressTrack}>
                          <div
                            style={{
                              ...styles.progressFill,
                              width: `${consumoOtPercent}%`,
                              background: getConsumptionBarColor(consumoOtPercent),
                            }}
                          />
                        </div>
                          <div style={styles.ocProgressFooter}>
                          <div style={styles.ocProgressFooterLine}>
                            <span>Pagado:</span>
                            <span>{formatCurrency(detalleOcActiva.montoPlanilla ?? detalleOcActiva.pagado, detalleOcActiva.moneda)}</span>
                          </div>
                          <div style={styles.ocProgressFooterLine}>
                            <span>Disponible:</span>
                            <span>{formatCurrency(detalleOcActiva.disponible, detalleOcActiva.moneda)}</span>
                          </div>
                          <div style={styles.ocProgressFooterLine}>
                            <span>Total OT:</span>
                            <span>{formatCurrency(detalleOcActiva.totalAcumuladoOt, detalleOcActiva.moneda)}</span>
                          </div>
                        </div>
                      </div>

                      <div style={styles.ocProgressCard}>
                        <div style={styles.ocProgressTopRow}>
                          <div>
                            <div style={styles.ocConsumptionTitle}>
                              Consumo de la OC N° {filaActiva.idOc || filaActiva.documento || '-'}
                            </div>
                            
                          </div>
                          <div style={styles.ocProgressValue}>{formatPercent(consumoOcPercent)}</div>
                        </div>
                        <div style={styles.progressTrack}>
                          <div style={styles.ocProgressSegments}>
                            <div
                              style={{
                                ...styles.ocProgressSegment,
                                width: `${pagadoOcPercent}%`,
                                background: "#2563EB",
                              }}
                              title={`Pagado: ${formatCurrency(montoPlanillaPagadoOc, detalleOcActiva.moneda)}`}
                            />
                            <div
                              style={{
                                ...styles.ocProgressSegment,
                                width: `${solicitadoOcPercent}%`,
                                background: "#F59E0B",
                              }}
                              title={`Solicitado: ${formatCurrency(detalleOcActiva.solicitado ?? 0, detalleOcActiva.moneda)}`}
                            />
                            <div
                              style={{
                                ...styles.ocProgressSegment,
                                width: `${disponibleOcPercent}%`,
                                background: "#E5E7EB",
                              }}
                              title={`Disponible OC: ${formatCurrency(detalleOcActiva.disponibleOc ?? 0, detalleOcActiva.moneda)}`}
                            />
                          </div>
                        </div>
                        <div style={styles.ocProgressFooter}>
                          <div style={styles.ocProgressFooterLine}>
                            <span>Solicitado:</span>
                            <span>{formatCurrency(detalleOcActiva.solicitado ?? 0, detalleOcActiva.moneda)}</span>
                          </div>
                          <div style={styles.ocProgressFooterLine}>
                            <span>Pagado:</span>
                            <span>{formatCurrency(montoPlanillaPagadoOc, detalleOcActiva.moneda)}</span>
                          </div>
                          <div style={styles.ocProgressFooterLine}>
                            <span>Disponible OC:</span>
                            <span>{formatCurrency(detalleOcActiva.disponibleOc ?? 0, detalleOcActiva.moneda)}</span>
                          </div>
                          <div style={styles.ocProgressFooterLine}>
                            <span>Total OC:</span>
                            <span>{formatCurrency(detalleOcActiva.subOc ?? 0, detalleOcActiva.moneda)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                  </>
                ) : null}

                {detailTab === 'historial' ? (
                  <div style={styles.historyPanel}>
                    <div style={styles.noteCard}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <div style={styles.noteTitle}>Historial de OT</div>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "4px 10px",
                              borderRadius: 999,
                              border: "1px solid #DBEAFE",
                              background: "#EFF6FF",
                              color: "#1D4ED8",
                              fontSize: 12,
                              fontWeight: 800,
                              whiteSpace: "nowrap",
                            }}
                          >
                            Registros: {historialRows.length}
                          </div>
                          <button
                            type="button"
                            onClick={handleExportHistorial}
                            style={{ ...styles.compactActionButton, borderColor: currentTheme.border, color: currentTheme.accent }}
                          >
                            <Download size={16} />
                            Exportar
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsHistorialPopupOpen(true)}
                            style={{ ...styles.compactActionButton, borderColor: currentTheme.border, color: currentTheme.accent }}
                            aria-label="Ampliar historial"
                            title="Ampliar historial"
                          >
                            <Maximize2 size={16} />
                            Ampliar
                          </button>
                        </div>
                      </div>
                      <p style={styles.noteText}>
                        Se muestran los mismos registros del grid principal filtrados por la OT seleccionada:
                        {historialOtSeleccionada ? (
                          <>
                            <strong> {historialOtSeleccionada}</strong>
                          </>
                        ) : null}
                      </p>
                    </div>

                    <div style={styles.gridScrollable}>
                      <table style={{ ...styles.table, minWidth: 1450, width: "max-content" }}>
                        <thead>
                          <tr>
                            <th style={{ ...styles.th, width: 94 }}>Correlativo</th>
                            <th style={{ ...styles.th, width: 88 }}>OT</th>
                            <th style={{ ...styles.th, width: 88 }}>OC</th>
                            <th style={{ ...styles.th, width: 72 }}>Fila</th>
                            <th style={{ ...styles.th, width: 90 }}>Responsable</th>
                            <th style={{ ...styles.th, width: 110 }}>Validador</th>
                            <th style={{ ...styles.th, width: 90 }}>Subtotal</th>
                            <th style={{ ...styles.th, width: 90 }}>IGV</th>
                            <th style={{ ...styles.th, width: 100 }}>Total</th>
                            <th style={{ ...styles.th, width: 80 }}>Fecha</th>
                            <th style={{ ...styles.th, width: 60 }}>Cliente</th>
                            <th style={{ ...styles.th, width: 90 }}>Proyecto</th>
                            <th style={{ ...styles.th, width: 60 }}>Site ID</th>
                            <th style={{ ...styles.th, width: 60 }}>CorSite</th>
                            <th style={{ ...styles.th, width: 90 }}>Site</th>
                            <th style={{ ...styles.th, width: 90 }}>Tipo trabajo</th>
                            <th style={{ ...styles.th, width: 90 }}>Tarea</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historialRows.length === 0 ? (
                            <tr>
                              <td colSpan={17} style={styles.emptyCell}>
                                No hay registros para la OT seleccionada.
                              </td>
                            </tr>
                          ) : (
                            historialRows.map((row) => (
                              <tr key={`hist-${row.id}`}>
                                <td style={styles.td}>{row.correlativo}</td>
                                <td style={styles.td}>{row.ot || '-'}</td>
                                <td style={styles.td}>{row.idOc || row.documento || '-'}</td>
                                <td style={styles.td}>{row.fila || '-'}</td>
                                <td style={styles.td}>{row.responsable}</td>
                                <td style={styles.td}>{row.validador || '-'}</td>
                                <td style={{ ...styles.td, fontWeight: 900 }}>{formatCurrency(row.subtotal, row.moneda)}</td>
                                <td style={styles.td}>{formatCurrency(row.igv, row.moneda)}</td>
                                <td style={styles.td}>{formatCurrency(row.total, row.moneda)}</td>
                                <td style={styles.td}>{formatDate(row.fecha)}</td>
                                <td style={styles.td}>{row.cliente}</td>
                                <td style={styles.td}>{row.proyecto}</td>
                                <td style={styles.td}>{row.siteId}</td>
                                <td style={styles.td}>{row.corSite || '-'}</td>
                                <td style={styles.td}>{row.site}</td>
                                <td style={styles.td}>{row.tipoTrabajo}</td>
                                <td style={styles.td}>{row.tarea}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {detailTab === 'historial-oc' ? (
                  <div style={styles.historyPanel}>
                    <div style={styles.noteCard}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <div style={styles.noteTitle}>Historial OC</div>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "4px 10px",
                              borderRadius: 999,
                              border: "1px solid #DBEAFE",
                              background: "#EFF6FF",
                              color: "#1D4ED8",
                              fontSize: 12,
                              fontWeight: 800,
                              whiteSpace: "nowrap",
                            }}
                          >
                            Registros: {historialOcRows.length}
                          </div>
                          <button
                            type="button"
                            onClick={handleExportHistorialOc}
                            style={{ ...styles.compactActionButton, borderColor: currentTheme.border, color: currentTheme.accent }}
                          >
                            <Download size={16} />
                            Exportar
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsHistorialOcPopupOpen(true)}
                            style={{ ...styles.compactActionButton, borderColor: currentTheme.border, color: currentTheme.accent }}
                            aria-label="Ampliar historial OC"
                            title="Ampliar historial OC"
                          >
                            <Maximize2 size={16} />
                            Ampliar
                          </button>
                        </div>
                      </div>
                      <p style={styles.noteText}>
                        Se muestran los mismos registros del grid principal filtrados por la OC seleccionada:
                        <strong> {historialOcSeleccionada || '-'}</strong>
                      </p>
                    </div>

                    <div style={styles.gridScrollable}>
                      <table style={{ ...styles.table, minWidth: 1450, width: "max-content" }}>
                        <thead>
                          <tr>
                            <th style={{ ...styles.th, width: 94 }}>Correlativo</th>
                            <th style={{ ...styles.th, width: 88 }}>OT</th>
                            <th style={{ ...styles.th, width: 88 }}>OC</th>
                            <th style={{ ...styles.th, width: 72 }}>Fila</th>
                            <th style={{ ...styles.th, width: 90 }}>Responsable</th>
                            <th style={{ ...styles.th, width: 110 }}>Validador</th>
                            <th style={{ ...styles.th, width: 90 }}>Subtotal</th>
                            <th style={{ ...styles.th, width: 90 }}>IGV</th>
                            <th style={{ ...styles.th, width: 100 }}>Total</th>
                            <th style={{ ...styles.th, width: 80 }}>Fecha</th>
                            <th style={{ ...styles.th, width: 60 }}>Cliente</th>
                            <th style={{ ...styles.th, width: 90 }}>Proyecto</th>
                            <th style={{ ...styles.th, width: 60 }}>Site ID</th>
                            <th style={{ ...styles.th, width: 60 }}>CorSite</th>
                            <th style={{ ...styles.th, width: 90 }}>Site</th>
                            <th style={{ ...styles.th, width: 90 }}>Tipo trabajo</th>
                            <th style={{ ...styles.th, width: 90 }}>Tarea</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historialOcRows.length === 0 ? (
                            <tr>
                              <td colSpan={17} style={styles.emptyCell}>
                                No hay registros para la OC seleccionada.
                              </td>
                            </tr>
                          ) : (
                            historialOcRows.map((row) => (
                              <tr key={`hist-oc-${row.id}`}>
                                <td style={styles.td}>{row.correlativo}</td>
                                <td style={styles.td}>{row.ot || '-'}</td>
                                <td style={styles.td}>{row.idOc || row.documento || '-'}</td>
                                <td style={styles.td}>{row.fila || '-'}</td>
                                <td style={styles.td}>{row.responsable}</td>
                                <td style={styles.td}>{row.validador || '-'}</td>
                                <td style={{ ...styles.td, fontWeight: 900 }}>{formatCurrency(row.subtotal, row.moneda)}</td>
                                <td style={styles.td}>{formatCurrency(row.igv, row.moneda)}</td>
                                <td style={styles.td}>{formatCurrency(row.total, row.moneda)}</td>
                                <td style={styles.td}>{formatDate(row.fecha)}</td>
                                <td style={styles.td}>{row.cliente}</td>
                                <td style={styles.td}>{row.proyecto}</td>
                                <td style={styles.td}>{row.siteId}</td>
                                <td style={styles.td}>{row.corSite || '-'}</td>
                                <td style={styles.td}>{row.site}</td>
                                <td style={styles.td}>{row.tipoTrabajo}</td>
                                <td style={styles.td}>{row.tarea}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div style={styles.emptyDetail}>
                <ReceiptText size={32} strokeWidth={1.8} />
                <strong>No hay detalle disponible</strong>
                <span>Selecciona una orden para ver sus pestañas de información.</span>
              </div>
            )}
          </aside>
        </section>
        {detailTab === "historial" && isHistorialPopupOpen ? (
          <div
            style={styles.popupOverlay}
            onClick={() => setIsHistorialPopupOpen(false)}
            role="presentation"
          >
            <div
              style={styles.popupCard}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Historial de OT"
            >
              <div style={styles.popupHeader}>
                <div>
                  <div style={{ ...styles.sectionKicker, color: currentTheme.accent }}>Historial de OT</div>
                  <h3 style={styles.popupTitle}>Orden de Pago N° {filaActiva?.correlativo || "-"}</h3>
                  <p style={styles.popupSubtitle}>
                    {historialOtSeleccionada
                      ? (
                        <>
                          Se muestran los mismos registros del grid principal filtrados por la OT seleccionada:{" "}
                          <strong>{historialOtSeleccionada}</strong>
                        </>
                      )
                      : "No hay una OT válida seleccionada para mostrar historial."}
                  </p>
                </div>
                <div style={styles.popupHeaderActions}>
                  <button
                    type="button"
                    onClick={handleExportHistorial}
                    style={{ ...styles.slimActionButton, borderColor: currentTheme.border, color: currentTheme.accent }}
                  >
                    <Download size={16} />
                    Exportar
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsHistorialPopupOpen(false)}
                    style={{ ...styles.slimActionButton, borderColor: currentTheme.border, color: "#EF4444" }}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
              <div style={styles.popupBody}>
                <div style={styles.gridScrollable}>
                  <table style={{ ...styles.table, minWidth: 1450, width: "max-content" }}>
                    <thead>
                      <tr>
                        <th style={{ ...styles.th, width: 94 }}>Correlativo</th>
                        <th style={{ ...styles.th, width: 88 }}>OT</th>
                        <th style={{ ...styles.th, width: 88 }}>OC</th>
                        <th style={{ ...styles.th, width: 72 }}>Fila</th>
                        <th style={{ ...styles.th, width: 90 }}>Responsable</th>
                        <th style={{ ...styles.th, width: 110 }}>Validador</th>
                        <th style={{ ...styles.th, width: 90 }}>Subtotal</th>
                        <th style={{ ...styles.th, width: 90 }}>IGV</th>
                        <th style={{ ...styles.th, width: 100 }}>Total</th>
                        <th style={{ ...styles.th, width: 80 }}>Fecha</th>
                        <th style={{ ...styles.th, width: 60 }}>Cliente</th>
                        <th style={{ ...styles.th, width: 90 }}>Proyecto</th>
                        <th style={{ ...styles.th, width: 60 }}>Site ID</th>
                        <th style={{ ...styles.th, width: 60 }}>CorSite</th>
                        <th style={{ ...styles.th, width: 90 }}>Site</th>
                        <th style={{ ...styles.th, width: 90 }}>Tipo trabajo</th>
                        <th style={{ ...styles.th, width: 90 }}>Tarea</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historialRows.length === 0 ? (
                        <tr>
                          <td colSpan={17} style={styles.emptyCell}>
                            No hay registros para la OT seleccionada.
                          </td>
                        </tr>
                      ) : (
                        historialRows.map((row) => (
                          <tr key={`popup-hist-${row.id}`}>
                            <td style={styles.td}>{row.correlativo}</td>
                            <td style={styles.td}>{row.ot || '-'}</td>
                            <td style={styles.td}>{row.idOc || row.documento || '-'}</td>
                            <td style={styles.td}>{row.fila || '-'}</td>
                            <td style={styles.td}>{row.responsable}</td>
                            <td style={styles.td}>{row.validador || '-'}</td>
                            <td style={{ ...styles.td, fontWeight: 900 }}>{formatCurrency(row.subtotal, row.moneda)}</td>
                            <td style={styles.td}>{formatCurrency(row.igv, row.moneda)}</td>
                            <td style={styles.td}>{formatCurrency(row.total, row.moneda)}</td>
                            <td style={styles.td}>{formatDate(row.fecha)}</td>
                            <td style={styles.td}>{row.cliente}</td>
                            <td style={styles.td}>{row.proyecto}</td>
                            <td style={styles.td}>{row.siteId}</td>
                            <td style={styles.td}>{row.corSite || '-'}</td>
                            <td style={styles.td}>{row.site}</td>
                            <td style={styles.td}>{row.tipoTrabajo}</td>
                            <td style={styles.td}>{row.tarea}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {detailTab === "historial-oc" && isHistorialOcPopupOpen ? (
          <div
            style={styles.popupOverlay}
            onClick={() => setIsHistorialOcPopupOpen(false)}
            role="presentation"
          >
            <div
              style={styles.popupCard}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Historial de OC"
            >
              <div style={styles.popupHeader}>
                <div>
                  <div style={{ ...styles.sectionKicker, color: currentTheme.accent }}>Historial OC</div>
                  <h3 style={styles.popupTitle}>Orden de Pago N° {filaActiva?.correlativo || "-"}</h3>
                  <p style={styles.popupSubtitle}>
                    Se muestran los mismos registros del grid principal filtrados por la OC seleccionada:{" "}
                    <strong>{historialOcSeleccionada || "-"}</strong>
                  </p>
                </div>
                <div style={styles.popupHeaderActions}>
                  <button
                    type="button"
                    onClick={handleExportHistorialOc}
                    style={{ ...styles.slimActionButton, borderColor: currentTheme.border, color: currentTheme.accent }}
                  >
                    <Download size={16} />
                    Exportar
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsHistorialOcPopupOpen(false)}
                    style={{ ...styles.slimActionButton, borderColor: currentTheme.border, color: "#EF4444" }}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
              <div style={styles.popupBody}>
                <div style={styles.gridScrollable}>
                  <table style={{ ...styles.table, minWidth: 1450, width: "max-content" }}>
                    <thead>
                      <tr>
                        <th style={{ ...styles.th, width: 94 }}>Correlativo</th>
                        <th style={{ ...styles.th, width: 88 }}>OT</th>
                        <th style={{ ...styles.th, width: 88 }}>OC</th>
                        <th style={{ ...styles.th, width: 72 }}>Fila</th>
                        <th style={{ ...styles.th, width: 90 }}>Responsable</th>
                        <th style={{ ...styles.th, width: 110 }}>Validador</th>
                        <th style={{ ...styles.th, width: 90 }}>Subtotal</th>
                        <th style={{ ...styles.th, width: 90 }}>IGV</th>
                        <th style={{ ...styles.th, width: 100 }}>Total</th>
                        <th style={{ ...styles.th, width: 80 }}>Fecha</th>
                        <th style={{ ...styles.th, width: 60 }}>Cliente</th>
                        <th style={{ ...styles.th, width: 90 }}>Proyecto</th>
                        <th style={{ ...styles.th, width: 60 }}>Site ID</th>
                        <th style={{ ...styles.th, width: 60 }}>CorSite</th>
                        <th style={{ ...styles.th, width: 90 }}>Site</th>
                        <th style={{ ...styles.th, width: 90 }}>Tipo trabajo</th>
                        <th style={{ ...styles.th, width: 90 }}>Tarea</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historialOcRows.length === 0 ? (
                        <tr>
                          <td colSpan={17} style={styles.emptyCell}>
                            No hay registros para la OC seleccionada.
                          </td>
                        </tr>
                      ) : (
                        historialOcRows.map((row) => (
                          <tr key={`popup-hist-oc-${row.id}`}>
                            <td style={styles.td}>{row.correlativo}</td>
                            <td style={styles.td}>{row.ot || '-'}</td>
                            <td style={styles.td}>{row.idOc || row.documento || '-'}</td>
                            <td style={styles.td}>{row.fila || '-'}</td>
                            <td style={styles.td}>{row.responsable}</td>
                            <td style={styles.td}>{row.validador || '-'}</td>
                            <td style={{ ...styles.td, fontWeight: 900 }}>{formatCurrency(row.subtotal, row.moneda)}</td>
                            <td style={styles.td}>{formatCurrency(row.igv, row.moneda)}</td>
                            <td style={styles.td}>{formatCurrency(row.total, row.moneda)}</td>
                            <td style={styles.td}>{formatDate(row.fecha)}</td>
                            <td style={styles.td}>{row.cliente}</td>
                            <td style={styles.td}>{row.proyecto}</td>
                            <td style={styles.td}>{row.siteId}</td>
                            <td style={styles.td}>{row.corSite || '-'}</td>
                            <td style={styles.td}>{row.site}</td>
                            <td style={styles.td}>{row.tipoTrabajo}</td>
                            <td style={styles.td}>{row.tarea}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppPage>
  );
}

function KpiCard({
  label,
  value,
  accent,
  soft,
  border,
  icon,
  selected = false,
  onClick,
}: {
  label: string;
  value: number;
  accent: string;
  soft: string;
  border: string;
  icon: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...styles.kpiCard,
        borderColor: selected ? accent : border,
        background: selected ? soft : "#FFFFFF",
        cursor: onClick ? "pointer" : "default",
        textAlign: "left",
        width: "100%",
        boxShadow: selected ? `0 10px 24px ${accent}22` : "none",
        transform: selected ? "translateY(-2px)" : "none",
        borderWidth: selected ? 2 : 1,
      }}
    >
      <div style={{ ...styles.kpiIcon, color: accent, background: soft, borderColor: border }}>
        {icon}
      </div>
      <div style={styles.kpiBody}>
        <div style={styles.kpiLabel}>{label}</div>
        <div style={{ ...styles.kpiValue, color: accent }}>{value}</div>
      </div>
    </button>
  );
}

function FilterField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  icon,
  isSelect = false,
  options = [],
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: React.HTMLInputTypeAttribute;
  icon?: React.ReactNode;
  isSelect?: boolean;
  options?: Array<{ value: string; label: string }>;
}) {
  return (
    <label style={styles.filterField}>
      <span style={styles.filterLabel}>{label}</span>
      <div style={styles.filterControl}>
        {icon ? <span style={styles.filterIcon}>{icon}</span> : null}
        {isSelect ? (
          <select value={value} onChange={(event) => onChange(event.target.value)} style={styles.filterInput}>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={type}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            style={styles.filterInput}
          />
        )}
      </div>
    </label>
  );
}

function ActionButton({
  config,
  onClick,
}: {
  config: { label: string; icon: React.ReactNode; color: string; soft: string; border: string };
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...styles.actionButton,
        color: config.color,
        borderColor: config.border,
        background: config.soft,
      }}
    >
      {config.icon}
      <span>{config.label}</span>
    </button>
  );
}

function AmountCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.amountCard}>
      <div style={styles.amountLabel}>{label}</div>
      <div style={styles.amountValue}>{value}</div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.infoField}>
      <div style={styles.infoLabel}>{label}</div>
      <div style={styles.infoValue}>{value}</div>
    </div>
  );
}

function HistoryItem({ title, date, detail }: { title: string; date: string; detail: string }) {
  return (
    <div style={styles.historyItem}>
      <div style={styles.historyDot} />
      <div style={styles.historyContent}>
        <div style={styles.historyTitle}>{title}</div>
        <div style={styles.historyDate}>{formatDate(date)}</div>
        <p style={styles.historyText}>{detail}</p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    flex: 1,
    minHeight: 0,
    height: "100%",
    overflow: "hidden",
  },
  hero: {
    border: "1px solid #E2E8F0",
    borderRadius: 18,
    padding: 10,
    boxShadow: "0 1px 6px rgba(15, 23, 42, 0.05)",
  },
  heroTopRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.45fr) minmax(0, 0.95fr)",
    gap: 10,
    alignItems: "start",
  },
  heroTitleBlock: {
    minWidth: 0,
  },
  heroTitleLine: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 2,
  },
  heroIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#1D4ED8",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  kicker: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: "1px solid",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.25,
    marginBottom: 4,
  },
  title: {
    margin: 0,
    fontSize: 26,
    lineHeight: 1.08,
    fontWeight: 900,
    color: "#0F172A",
  },
  subtitle: {
    margin: "6px 0 0",
    fontSize: 14,
    color: "#475569",
    maxWidth: 760,
  },
  quickSearchWrap: {
    marginTop: 4,
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "auto",
    maxWidth: 360,
    minWidth: 0,
    flex: "1 1 360px",
    border: "1px solid",
    borderRadius: 12,
    padding: "5px 10px",
    boxShadow: "0 1px 4px rgba(15, 23, 42, 0.05)",
  },
  quickFiltersRow: {
    marginTop: 4,
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
    flexWrap: "nowrap",
    width: "100%",
    minWidth: 0,
  },
  quickDateFilters: {
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
    flexWrap: "nowrap",
    justifyContent: "flex-start",
    minWidth: 0,
    flex: "0 0 auto",
  },
  quickDateField: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 120,
  },
  quickDateLabel: {
    fontSize: 11,
    fontWeight: 800,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: "0.02em",
  },
  quickDateInput: {
    height: 34,
    border: "1px solid",
    borderRadius: 10,
    padding: "0 10px",
    fontSize: 12,
    color: "#0F172A",
    background: "#FFFFFF",
    outline: "none",
    boxShadow: "0 1px 4px rgba(15, 23, 42, 0.05)",
  },
  applyFiltersButton: {
    height: 34,
    border: "1px solid",
    borderRadius: 10,
    padding: "0 9px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
    boxShadow: "0 1px 4px rgba(15, 23, 42, 0.08)",
    flexShrink: 0,
  },
  quickSearchInput: {
    border: "none",
    outline: "none",
    flex: 1,
    minWidth: 0,
    background: "transparent",
    fontSize: 13,
    color: "#0F172A",
  },
  tabsRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 10,
  },
  tabButton: {
    height: 38,
    minWidth: 122,
    borderRadius: 12,
    border: "1px solid",
    background: "#FFFFFF",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "0 14px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 13,
  },
  metricsStrip: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: 6,
  },
  kpiCard: {
    border: "1px solid",
    borderRadius: 16,
    padding: 9,
    display: "flex",
    gap: 10,
    alignItems: "center",
    minHeight: 72,
  },
  kpiIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    border: "1px solid",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  kpiBody: {
    minWidth: 0,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: 800,
    color: "#475569",
    marginBottom: 4,
    whiteSpace: "nowrap",
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: 900,
    lineHeight: 1,
  },
  controlsGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: 10,
    alignItems: "start",
  },
  actionsBar: {
    marginTop: 0,
  },
  filtersCard: {
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: 18,
    padding: 16,
    boxShadow: "0 1px 6px rgba(15, 23, 42, 0.05)",
  },
  filtersHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
    flexWrap: "wrap",
  },
  filtersHeaderActions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  sectionKicker: {
    fontSize: 11,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#6D28D9",
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 800,
    color: "#0F172A",
  },
  linkButton: {
    border: "none",
    background: "transparent",
    color: "#2563EB",
    fontWeight: 800,
    cursor: "pointer",
    padding: 0,
    marginTop: 3,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  },
  filtersCollapsedNotice: {
    border: "1px dashed #CBD5E1",
    borderRadius: 12,
    padding: "14px 16px",
    color: "#475569",
    background: "#F8FAFC",
    fontSize: 13,
    fontWeight: 600,
  },
  filtersGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
  },
  filterField: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: 800,
    color: "#334155",
  },
  filterControl: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid #CBD5E1",
    borderRadius: 12,
    padding: "0 10px",
    height: 40,
    background: "#FFFFFF",
  },
  filterIcon: {
    color: "#94A3B8",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  filterInput: {
    width: "100%",
    border: "none",
    outline: "none",
    fontSize: 14,
    color: "#0F172A",
    background: "transparent",
    minWidth: 0,
  },
  actionsCard: {
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: 18,
    padding: "8px 12px",
    boxShadow: "0 1px 6px rgba(15, 23, 42, 0.05)",
  },
  actionsRow: {
    display: "flex",
    gap: 10,
    marginTop: 0,
    alignItems: "center",
    flexWrap: "nowrap",
    overflowX: "auto",
    paddingBottom: 0,
  },
  actionButton: {
    height: 42,
    borderRadius: 12,
    border: "1px solid",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "0 12px",
    cursor: "pointer",
    fontWeight: 800,
  },
  slimActionButton: {
    height: 40,
    borderRadius: 12,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "0 12px",
    cursor: "pointer",
    color: "#334155",
    fontWeight: 800,
  },
  compactActionButton: {
    height: 28,
    borderRadius: 9,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: "0 8px",
    cursor: "pointer",
    color: "#334155",
    fontWeight: 800,
    fontSize: 11,
    lineHeight: 1,
  },
  notice: {
    marginTop: 12,
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    background: "#FAFAFB",
    padding: "10px 12px",
    fontSize: 12,
    color: "#475569",
    fontWeight: 600,
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 580px",
    gap: 0,
    minHeight: 0,
    flex: 1,
    alignItems: "start",
  },
  leftColumn: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
    minWidth: 0,
  },
  gridCard: {
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: 18,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    maxHeight: "calc(100vh - 420px)",
    overflow: "hidden",
    boxShadow: "0 1px 6px rgba(15, 23, 42, 0.05)",
  },
  gridHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 0,
    padding: "0px 0px",
    borderBottom: "1px solid #E2E8F0",
    flexWrap: "wrap",
  },
  gridHeaderTitleBlock: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    whiteSpace: "nowrap",
  },
  gridHeaderKicker: {
    fontSize: 11,
    fontWeight: 900,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  gridHeaderTitle: {
    fontSize: 16,
    fontWeight: 900,
    color: "#0F172A",
  },
  gridHeaderMeta: {
    display: "flex",
    gap: 2,
    flexWrap: "wrap",
    fontSize: 13,
    color: "#334155",
    fontWeight: 700,
  },
  gridScrollable: {
    flex: 1,
    minHeight: 0,
    maxWidth: "100%",
    maxHeight: "100%",
    overflowX: "scroll",
    overflowY: "scroll",
    overscrollBehavior: "contain",
    WebkitOverflowScrolling: "touch",
    scrollbarGutter: "stable both-edges",
  },
  table: {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
    minWidth: 920,
  },
  th: {
    position: "sticky",
    top: 0,
    zIndex: 4,
    background: "#F8FAFC",
    borderBottom: "1px solid #E2E8F0",
    padding: "1px 8px",
    textAlign: "left",
    fontSize: 12,
    fontWeight: 900,
    color: "#334155",
    whiteSpace: "nowrap",
  },
  headerSelectionTools: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: "100%",
  },
  headerToggleAllButton: {
    width: 24,
    height: 24,
    borderRadius: 8,
    border: "1px solid",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
    flexShrink: 0,
  },
  td: {
    borderBottom: "1px solid #E2E8F0",
    padding: "0px 8px",
    fontSize: 13,
    color: "#0F172A",
    verticalAlign: "top",
    whiteSpace: "nowrap",
  },
  emptyCell: {
    padding: 30,
    textAlign: "center",
    color: "#64748B",
    fontSize: 14,
  },
  groupRow: {
    background: "#FAFAFB",
  },
  groupCell: {
    padding: 0,
    borderBottom: "1px solid #E2E8F0",
  },
  groupBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    background: "#FFFFFF",
    borderBottom: "1px solid #EEF2F7",
    flexWrap: "wrap",
  },
  groupToggle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    border: "1px solid",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: 900,
    color: "#0F172A",
  },
  groupCount: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 24,
    height: 22,
    padding: "0 8px",
    borderRadius: 999,
    background: "#EEF2FF",
    color: "#4F46E5",
    fontSize: 12,
    fontWeight: 900,
  },
  groupAmount: {
    fontSize: 13,
    fontWeight: 900,
    color: "#2563EB",
  },
  groupCurrencyStack: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
    flex: "1 1 320px",
  },
  groupCurrencyLine: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "baseline",
    fontSize: 12,
    color: "#0F172A",
    fontWeight: 700,
  },
  groupCurrencyLabel: {
    fontWeight: 900,
    color: "#475569",
  },
  groupMeta: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700,
  },
  stateBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 800,
  },
  gridFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "14px 16px",
    borderTop: "1px solid #E2E8F0",
    background: "#FAFAFB",
    flexWrap: "wrap",
  },
  gridFooterText: {
    fontSize: 13,
    color: "#334155",
    fontWeight: 700,
  },
  gridFooterTotals: {
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
    fontSize: 13,
    color: "#334155",
    fontWeight: 700,
  },
  detailCard: {
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: 18,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    minHeight: 0,
    boxShadow: "0 1px 6px rgba(15, 23, 42, 0.05)",
  },
  detailHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },
  ocDataCard: {
    border: "1px solid #CBD5E1",
    borderRadius: 16,
    background: "#FFFFFF",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minHeight: 0,
    height: "auto",
    alignSelf: "start",
    overflow: "hidden",
  },
  ocDataHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  ocDataTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  ocDataTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 900,
    color: "#0F172A",
  },
  ocTopGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8,
  },
  ocProgressGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 170px) minmax(0, 1fr) minmax(0, 150px)",
    gap: 10,
    alignItems: "stretch",
  },
  ocMetricCard: {
    border: "1px solid #E2E8F0",
    borderRadius: 14,
    background: "#F8FAFC",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    minHeight: 84,
  },
  ocMetricsStrip: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  ocMetricLabel: {
    fontSize: 11,
    fontWeight: 900,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.35,
    marginBottom: 8,
  },
  ocConsumptionTitle: {
    fontSize: 14,
    fontWeight: 900,
    color: "#0F172A",
    lineHeight: 1.2,
    marginBottom: 4,
  },
  ocMetricValue: {
    fontSize: 20,
    fontWeight: 900,
    lineHeight: 1.1,
  },
  ocProgressCard: {
    border: "1px solid #E2E8F0",
    borderRadius: 14,
    background: "#FFFFFF",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  ocProgressPair: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: 3,
    marginTop: 2,
  },
  ocProgressTopRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "flex-start",
  },
  ocProgressSubtitle: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700,
    marginTop: 2,
  },
  ocProgressValue: {
    fontSize: 15,
    fontWeight: 900,
    color: "#0F172A",
    whiteSpace: "nowrap",
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    background: "#E5E7EB",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    background: "#2563EB",
  },
  ocProgressSegments: {
    display: "flex",
    height: "100%",
    width: "100%",
    overflow: "hidden",
    borderRadius: 999,
    background: "#E5E7EB",
  },
  ocProgressSegment: {
    height: "100%",
    flexShrink: 0,
  },
  ocProgressFooter: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 12,
    fontWeight: 800,
    color: "#334155",
  },
  ocProgressFooterLine: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
    textAlign: "right",
  },
  ocAvailabilityCard: {
    border: "1px solid #BBF7D0",
    borderRadius: 14,
    background: "#F0FDF4",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  ocAvailabilityValue: {
    fontSize: 20,
    fontWeight: 900,
    color: "#166534",
    lineHeight: 1.1,
  },
  ocAvailabilityNote: {
    marginTop: 8,
    fontSize: 12,
    color: "#166534",
    fontWeight: 700,
  },
  detailTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  detailTitleSmall: {
    margin: 0,
    fontSize: 24,
    lineHeight: 1.1,
    color: "#0F172A",
    fontWeight: 900,
  },
  detailHeaderTools: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  detailExpandButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: "1px solid",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
    flexShrink: 0,
  },
  detailStatus: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid",
    borderRadius: 999,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  detailSubtitle: {
    margin: "8px 0 0",
    fontSize: 13,
    color: "#475569",
    lineHeight: 1.45,
  },
  detailTabs: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  detailTabButton: {
    height: 36,
    borderRadius: 10,
    border: "1px solid",
    background: "#FFFFFF",
    padding: "0 14px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 800,
  },
  detailInfoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  infoField: {
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
    borderRadius: 12,
    padding: "10px 12px",
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: 900,
    color: "#64748B",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: 800,
    color: "#0F172A",
    lineHeight: 1.35,
    whiteSpace: "normal",
  },
  amountStrip: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
  },
  amountCard: {
    border: "1px solid #E2E8F0",
    borderRadius: 14,
    background: "#FFFFFF",
    padding: 12,
  },
  amountLabel: {
    fontSize: 11,
    fontWeight: 900,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  amountValue: {
    fontSize: 16,
    fontWeight: 900,
    color: "#0F172A",
  },
  noteCard: {
    border: "1px solid #E2E8F0",
    borderRadius: 14,
    background: "#FAFAFB",
    padding: 12,
  },
  noteTitle: {
    fontSize: 12,
    fontWeight: 900,
    color: "#334155",
    marginBottom: 6,
  },
  noteText: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.5,
    color: "#475569",
  },
  historyHeaderActions: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  historyPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minHeight: 0,
    flex: 1,
    maxHeight: "none",
    overflow: "hidden",
  },
  historyBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  historyItem: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    padding: 12,
    borderRadius: 14,
    border: "1px solid #E2E8F0",
    background: "#FAFAFB",
  },
  historyDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    background: "#2563EB",
    marginTop: 4,
    flexShrink: 0,
  },
  historyContent: {
    minWidth: 0,
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: 900,
    color: "#0F172A",
  },
  historyDate: {
    fontSize: 12,
    color: "#2563EB",
    fontWeight: 800,
    marginTop: 2,
  },
  historyText: {
    margin: "6px 0 0",
    fontSize: 13,
    lineHeight: 1.45,
    color: "#475569",
  },
  detailActionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
    marginTop: "auto",
  },
  emptyDetail: {
    minHeight: 360,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    color: "#64748B",
    textAlign: "center",
    border: "1px dashed #CBD5E1",
    borderRadius: 16,
    background: "#FAFAFB",
    padding: 24,
  },
  popupOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.42)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 70,
  },
  popupCard: {
    width: "min(1360px, calc(100vw - 32px))",
    maxHeight: "min(86vh, 920px)",
    background: "#FFFFFF",
    borderRadius: 18,
    border: "1px solid #DBEAFE",
    boxShadow: "0 30px 80px rgba(15, 23, 42, 0.28)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  popupHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    padding: "18px 18px 12px",
    borderBottom: "1px solid #E2E8F0",
    background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
  },
  popupHeaderActions: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  popupTitle: {
    margin: "4px 0 0",
    fontSize: 22,
    lineHeight: 1.15,
    color: "#0F172A",
    fontWeight: 900,
  },
  popupSubtitle: {
    margin: "6px 0 0",
    fontSize: 13,
    lineHeight: 1.45,
    color: "#475569",
  },
  popupBody: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    padding: 18,
    overflow: "hidden",
    background: "#FFFFFF",
  },
};






