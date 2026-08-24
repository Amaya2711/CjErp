import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Printer,
  ReceiptText,
  RotateCcw,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import AppPage from "../../../components/base/AppPage";
import {
  buildPlanillaConsultaEstadosRequest,
  consultarPlanillaEstados,
} from "../../../api/planillaConsultaService";
import type { PlanillaConsultaParametro } from "../../../models/planillaConsulta";

type PagoTabKey = "aprobar" | "reaprobar" | "hormiga" | "observadas" | "resumen";
type DetailTabKey = "resumen" | "historial";

type PagoEstado = Exclude<PagoTabKey, "resumen">;

type PagoRow = {
  id: number;
  correlativo: string;
  ot: string;
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
  montoOc2?: string;
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

const TAB_ORDER: PagoTabKey[] = ["aprobar", "reaprobar", "hormiga", "observadas", "resumen"];

const TAB_ESTADOS: Record<Exclude<PagoTabKey, "resumen">, string> = {
  aprobar: "0",
  reaprobar: "6",
  hormiga: "10",
  observadas: "2",
};

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
    accent: "#7C3AED",
    soft: "#F5F3FF",
    border: "#C4B5FD",
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
    accent: "#0F766E",
    soft: "#F0FDFA",
    border: "#5EEAD4",
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

const INITIAL_FILTERS: FilterState = {
  cliente: "",
  proyecto: "",
  site: "",
  tipoTrabajo: "",
  tarea: "",
  solicitante: "",
  responsable: "",
  estado: "",
  correlativo: "",
  fechaDesde: "",
  fechaHasta: "",
  query: "",
};

function formatMoney(value: number) {
  return value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getCurrencySymbol(currency: string) {
  const normalized = normalizeText(currency);

  if (normalized.includes("usd") || normalized.includes("dolar")) {
    return "$";
  }

  if (normalized.includes("eur") || normalized.includes("euro")) {
    return "€";
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

function normalizeRecordKey(key: string) {
  return normalizeText(key).replace(/[^a-z0-9]/g, "");
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
  const correlativo = getRecordString(row, "Correlativo", "correlativo", "Corre", "Id", "id") || String(index + 1);
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
    montoOc2: getRecordString(row, "MontoOc2", "montoOc2", "MontoOC2", "montoOC2"),
    conPagado: getRecordNumber(row, "ConPagado", "conPagado", "ConPagadoSoles", "conPagadoSoles") ?? undefined,
    conPagadoDisplay: getRecordString(row, "ConPagado", "conPagado", "ConPagadoSoles", "conPagadoSoles"),
    subOc: getRecordNumber(row, "SubOc", "subOc") ?? undefined,
    adelaFic: getRecordNumber(row, "AdelaFic", "adelaFic") ?? undefined,
    porcentajeFic: getRecordNumber(row, "PorcentajeFic", "porcentajeFic") ?? undefined,
    subtotal: Number.isFinite(subtotal) ? subtotal : 0,
    igv: Number.isFinite(igv) ? igv : 0,
    total: Number.isFinite(total) ? total : 0,
    estado,
    diasEstado: getRecordNumber(row, "DiasEstado", "diasEstado") ?? 0,
    observacion: getRecordString(row, "Observacion", "observacion", "Comentario", "comentario"),
    detalle: getRecordString(row, "Detalle", "detalle"),
    documento: getRecordString(row, "Documento", "documento", "OC", "Oc"),
  };
}

function exportToCsv(fileName: string, headers: string[], rows: Array<Array<string | number>>) {
  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
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
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadingData(true);

      try {
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
              buildPlanillaConsultaEstadosRequest(parametros),
              { timeoutMs: 120000 }
            );

            const rows = Array.isArray(response.rows) ? response.rows : [];
            return [tab, rows.map((row, index) => mapPlanillaConsultaRowToPagoRow(row, index, tab))] as const;
          })
        );

        if (cancelled) {
          return;
        }

        const nextRowsByTab = loaded.reduce<Record<PagoTabKey, PagoRow[]>>(
          (acc, [tab, rows]) => {
            acc[tab] = rows;
            return acc;
          },
          {
            aprobar: [],
            reaprobar: [],
            hormiga: [],
            observadas: [],
            resumen: [],
          }
        );

        nextRowsByTab.resumen = [
          ...nextRowsByTab.aprobar,
          ...nextRowsByTab.reaprobar,
          ...nextRowsByTab.hormiga,
          ...nextRowsByTab.observadas,
        ];

        setRowsByTab(nextRowsByTab);
      } catch {
        if (!cancelled) {
          setMessage("No se pudieron cargar las órdenes desde Planilla.");
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
  }, []);

  const activeRows = useMemo(
    () => (activeTab === "resumen" ? rowsByTab.resumen : rowsByTab[activeTab]),
    [activeTab, rowsByTab]
  );

  const filteredRows = useMemo(() => {
    return activeRows.filter((row) => {
      const rowDate = row.fecha.slice(0, 10);
      const query = normalizeText(filters.query);

      return (
        matchesTextFilter(row.cliente, filters.cliente) &&
        matchesTextFilter(row.proyecto, filters.proyecto) &&
        matchesTextFilter(row.site, filters.site) &&
        matchesTextFilter(row.tipoTrabajo, filters.tipoTrabajo) &&
        matchesTextFilter(row.tarea, filters.tarea) &&
        matchesTextFilter(row.solicitante, filters.solicitante) &&
        matchesTextFilter(row.responsable, filters.responsable) &&
        matchesTextFilter(row.correlativo, filters.correlativo) &&
        (!filters.estado || row.estado === filters.estado) &&
        (!filters.fechaDesde || rowDate >= filters.fechaDesde) &&
        (!filters.fechaHasta || rowDate <= filters.fechaHasta) &&
        (!query ||
          normalizeText(
            [
              row.correlativo,
              row.cliente,
              row.proyecto,
              row.siteId,
              row.site,
              row.tipoTrabajo,
              row.tarea,
              row.solicitante,
              row.responsable,
              row.validador,
              row.observacion,
              row.detalle,
              row.documento,
              row.estado,
            ].join(" ")
          ).includes(query))
      );
    });
  }, [activeRows, filters]);

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
  const otActivaKey = useMemo(() => {
    if (!filaActiva) {
      return "";
    }

    return normalizeRecordKey(filaActiva.ot || filaActiva.correlativo);
  }, [filaActiva]);

  const filasOtActiva = useMemo(() => {
    if (!otActivaKey) {
      return [];
    }

    return filteredRows.filter((row) => normalizeRecordKey(row.ot || row.correlativo) === otActivaKey);
  }, [filteredRows, otActivaKey]);

  const filaOtActiva = filasOtActiva[0] ?? filaActiva;

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
      const normalizedOt = normalizeRecordKey(row.ot || row.correlativo);
      const sameOtRows = filteredRows.filter((item) => normalizeRecordKey(item.ot || item.correlativo) === normalizedOt);
      const montoOcTexto = row.montoOc2?.trim() || "";
      const montoOc = parseNumericValue(montoOcTexto) || row.total;
      const conPagadoCampo = parseNumericValue(row.conPagadoDisplay ?? row.conPagado);
      const totalAcumuladoOt = conPagadoCampo > 0 ? conPagadoCampo : sameOtRows.reduce((acc, item) => acc + item.total, 0);
      const subOc = Number.isFinite(row.subOc ?? NaN) ? Number(row.subOc ?? 0) : sameOtRows.reduce((acc, item) => acc + item.subtotal, 0);
      const adelaFic = Number.isFinite(row.adelaFic ?? NaN) ? Number(row.adelaFic ?? 0) : 0;
      const porcentajeFic = Number.isFinite(row.porcentajeFic ?? NaN)
        ? Number(row.porcentajeFic ?? 0)
        : montoOc > 0
          ? (totalAcumuladoOt / montoOc) * 100
          : 0;
      const disponible = Math.max(montoOc - totalAcumuladoOt, 0);
      const porcentaje = montoOc > 0 ? Math.min(100, Math.round((totalAcumuladoOt / montoOc) * 100)) : 0;

      return {
        ...row,
        ot: row.ot || row.correlativo,
        sameOtRows,
        totalAcumuladoOt,
        montoOc,
        disponible,
        porcentaje,
        pagado: Math.max(totalAcumuladoOt - montoOc, 0),
        solicitado: totalAcumuladoOt,
        pendiente: Math.max(montoOc - totalAcumuladoOt, 0),
        subOc,
        adelaFic,
        porcentajeFic,
        montoOcAdelanto: adelaFic,
        porcentajeOcAdelanto: montoOc > 0 ? (adelaFic / montoOc) * 100 : 0,
      };
    },
    [filteredRows]
  );

  const detalleOcActiva = useMemo(() => (filaOtActiva ? mapearDatosOc(filaOtActiva) : null), [filaOtActiva, mapearDatosOc]);
  const ocSnapshot = detalleOcActiva;

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
  const tableColSpan = showEstadoOc ? 16 : 15;

  const handleAction = (label: string) => {
    if (label === "Exportar") {
      handleExport();
      return;
    }
    if (label === "Limpiar") {
      setFilters(INITIAL_FILTERS);
      setMessage("Filtros limpiados.");
      return;
    }
    if (label === "Ver detalle") {
      setDetailTab("resumen");
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

  function handleExport() {
    const rows = filteredRows.map((row) => [
      row.correlativo,
      row.ot,
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

    exportToCsv(
      `pagos_v1_${activeTab}_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Correlativo",
        "OT",
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
    setMessage("Exportacion lista.");
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
              <div style={{ ...styles.quickSearchWrap, borderColor: currentTheme.border, background: "#FFFFFF" }}>
                <Search size={16} color={currentTheme.accent} />
                <input
                  type="text"
                  value={filters.query}
                  onChange={(event) => setFilters((prev) => ({ ...prev, query: event.target.value }))}
                  placeholder="Búsqueda rápida por correlativo, responsable, cliente o proyecto"
                  style={styles.quickSearchInput}
                />
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

        <section style={styles.mainGrid}>
          <div style={styles.leftColumn}>
            <div style={styles.gridCard}>
            <div style={styles.gridHeader}>
              <div style={styles.gridHeaderTitleBlock}>
                <div style={styles.gridHeaderKicker}>Agrupado por:</div>
                <div style={styles.gridHeaderTitle}>Solicitante</div>
              </div>
              <div style={styles.gridHeaderMeta}>
                <span>{groupedCountText}</span>
                <span>Órdenes: <strong>{filteredRows.length}</strong></span>
              </div>
            </div>

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
                    <th style={{ ...styles.th, width: 90 }}>Responsable</th>
                    <th style={{ ...styles.th, width: 110 }}>Validador</th>
                    <th style={{ ...styles.th, width: 90 }}>Subtotal</th>
                    <th style={{ ...styles.th, width: 90 }}>IGV</th>
                    <th style={{ ...styles.th, width: 100 }}>Total</th>
                    <th style={{ ...styles.th, width: 80 }}>Fecha</th>
                    <th style={{ ...styles.th, width: 60 }}>Cliente</th>
                    <th style={{ ...styles.th, width: 20 }}>Proyecto</th>
                    <th style={{ ...styles.th, width: 60 }}>Site ID</th>
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
                        Cargando órdenes desde Planilla...
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
                              const percent = row.total > 0 ? Math.round((row.subtotal / row.total) * 100) : 0;

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
                                  <td style={styles.td}>{row.responsable}</td>
                                  <td style={styles.td}>{row.validador || "-"}</td>
                                  <td style={styles.td}>{formatCurrency(row.subtotal, row.moneda)}</td>
                                  <td style={styles.td}>{formatCurrency(row.igv, row.moneda)}</td>
                                  <td style={{ ...styles.td, fontWeight: 900 }}>{formatCurrency(row.total, row.moneda)}</td>
                                  <td style={styles.td}>{formatDate(row.fecha)}</td>
                                  <td style={styles.td}>{row.cliente}</td>
                                  <td style={styles.td}>{row.proyecto}</td>
                                  <td style={styles.td}>{row.siteId}</td>
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
                <div style={styles.sectionKicker}>Acciones - {TAB_THEME[activeTab].label}</div>
                <div style={styles.actionsRow}>
                  <ActionButton config={actionConfig.primary} onClick={() => handleAction(actionConfig.primary.label)} />
                  <ActionButton config={actionConfig.secondary} onClick={() => handleAction(actionConfig.secondary.label)} />
                  <ActionButton config={actionConfig.tertiary} onClick={() => handleAction(actionConfig.tertiary.label)} />
                  <ActionButton config={actionConfig.quaternary} onClick={() => handleAction(actionConfig.quaternary.label)} />
                  <button type="button" style={{ ...styles.slimActionButton, borderColor: currentTheme.border, color: currentTheme.accent }} onClick={handleExport}>
                    <Download size={16} />
                    Exportar
                  </button>
                  <button type="button" style={styles.slimActionButton} onClick={() => setDetailTab("historial")}>
                    <FileText size={16} />
                    Historial
                  </button>
                </div>
                {message ? <div style={styles.notice}>{message}</div> : null}
              </div>
            </section>
          </div>

          <aside style={styles.detailCard}>
            {filaActiva ? (
              <>
                <div style={styles.detailHeader}>
                  <div>
                    <div style={{ ...styles.sectionKicker, color: currentTheme.accent }}>Detalle de la orden seleccionada</div>
                    <div style={styles.detailTitleRow}>
                      <h2 style={styles.detailTitleSmall}>Orden de Pago N° {filaActiva.correlativo}</h2>
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
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                      <div style={styles.noteCard}>
                        <div style={styles.noteTitle}>Comentario</div>
                        <p style={styles.noteText}>{filaActiva.detalle}</p>
                      </div>
                      <div style={styles.noteCard}>
                        <div style={styles.noteTitle}>Observación</div>
                        <p style={styles.noteText}>{filaActiva.observacion}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div style={styles.emptyDetail}>
                <ReceiptText size={32} strokeWidth={1.8} />
                <strong>No hay registro seleccionado</strong>
                <span>Elige una fila del listado para revisar su detalle.</span>
              </div>
            )}
          </aside>

          <aside style={styles.ocDataCard}>
            {filaActiva && detalleOcActiva ? (
              <>
                <div style={styles.ocDataHeader}>
                  <div>
                    <div style={{ ...styles.sectionKicker, color: currentTheme.accent }}>Resumen financiero</div>
                    
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

                <div style={styles.ocTopGrid}>
                  <InfoField label="OT N°" value={detalleOcActiva.ot || detalleOcActiva.correlativo} />
                  <InfoField label="Cliente" value={detalleOcActiva.cliente} />
                  <InfoField label="Proyecto" value={detalleOcActiva.proyecto} />
                  <InfoField label="Site" value={detalleOcActiva.site} />
                  <InfoField label="Tipo trabajo" value={detalleOcActiva.tipoTrabajo} />
                  <InfoField label="Tarea" value={detalleOcActiva.tarea} />
                  <InfoField label="Fecha" value={formatDate(detalleOcActiva.fecha)} />
                  <InfoField label="Validador" value={detalleOcActiva.validador || "-"} />
                </div>

                <div style={styles.ocMetricsStrip}>
                  <div style={styles.ocMetricCard}>
                    <div style={styles.ocMetricLabel}>Monto Oc</div>
                    <div style={{ ...styles.ocMetricValue, color: currentTheme.accent }}>
                      {formatCurrency(detalleOcActiva.montoOc, detalleOcActiva.moneda)}
                    </div>
                  </div>
                  <div style={styles.ocMetricCard}>
                    <div style={styles.ocMetricLabel}>Total acumulado por sitio</div>
                    <div style={{ ...styles.ocMetricValue, color: currentTheme.accent }}>
                      {formatCurrency(detalleOcActiva.totalAcumuladoOt, detalleOcActiva.moneda)}
                    </div>
                  </div>
                  <div style={styles.ocMetricCard}>
                    <div style={styles.ocMetricLabel}>Porcentaje referenciado</div>
                    <div style={{ ...styles.ocMetricValue, color: currentTheme.accent }}>
                      {formatPercent(detalleOcActiva.porcentaje)}
                    </div>
                  </div>
                  <div style={styles.ocMetricCard}>
                    <div style={styles.ocMetricLabel}>Saldo referencial</div>
                    <div style={{ ...styles.ocMetricValue, color: currentTheme.accent }}>
                      {formatCurrency(detalleOcActiva.disponible, detalleOcActiva.moneda)}
                    </div>
                  </div>
                  <div style={styles.ocMetricCard}>
                    <div style={styles.ocMetricLabel}>Adelanto Fic</div>
                    <div style={{ ...styles.ocMetricValue, color: currentTheme.accent }}>
                      {formatCurrency(detalleOcActiva.adelaFic ?? 0, detalleOcActiva.moneda)}
                    </div>
                  </div>
                </div>

                <div style={styles.ocProgressCard}>
                  <div style={styles.ocProgressTopRow}>
                    <div>
                      <div style={styles.ocMetricLabel}>Consumo de la OT</div>
                      <div style={styles.ocProgressSubtitle}>Acumulado sobre el monto total de la OT</div>
                    </div>
                    <div style={styles.ocProgressValue}>{formatPercent(detalleOcActiva.porcentaje)}</div>
                  </div>
                  <div style={styles.progressTrack}>
                    <div
                      style={{
                        ...styles.progressFill,
                        width: `${detalleOcActiva.porcentaje}%`,
                        background: currentTheme.accent,
                      }}
                    />
                  </div>
                  <div style={styles.ocProgressFooter}>
                    <span>Disponible: {formatCurrency(detalleOcActiva.disponible, detalleOcActiva.moneda)}</span>
                    <span>Total OT: {formatCurrency(detalleOcActiva.totalAcumuladoOt, detalleOcActiva.moneda)}</span>
                  </div>
                </div>

                <div style={styles.detailInfoGrid}>
                  <InfoField
                    label="SubOc"
                    value={formatCurrency(detalleOcActiva.subOc ?? 0, detalleOcActiva.moneda)}
                  />
                  <InfoField
                    label="Adelanto Fic"
                    value={formatCurrency(detalleOcActiva.adelaFic ?? 0, detalleOcActiva.moneda)}
                  />
                  <InfoField
                    label="Pagado"
                    value={formatCurrency(detalleOcActiva.pagado, detalleOcActiva.moneda)}
                  />
                  <InfoField
                    label="Solicitado"
                    value={formatCurrency(detalleOcActiva.solicitado, detalleOcActiva.moneda)}
                  />
                  <InfoField
                    label="Pendiente"
                    value={formatCurrency(detalleOcActiva.pendiente, detalleOcActiva.moneda)}
                  />
                </div>
              </>
            ) : (
              <div style={styles.emptyDetail}>
                <ReceiptText size={32} strokeWidth={1.8} />
                <strong>No hay resumen disponible</strong>
                <span>Selecciona una orden para ver su información financiera.</span>
              </div>
            )}
          </aside>
        </section>
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
    height: "100%",
    minHeight: 0,
  },
  hero: {
    border: "1px solid #E2E8F0",
    borderRadius: 18,
    padding: 10,
    boxShadow: "0 1px 6px rgba(15, 23, 42, 0.05)",
  },
  heroTopRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
    gap: 6,
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
    width: "100%",
    maxWidth: 460,
    border: "1px solid",
    borderRadius: 12,
    padding: "5px 10px",
    boxShadow: "0 1px 4px rgba(15, 23, 42, 0.05)",
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
    marginTop: 2,
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
    padding: 16,
    boxShadow: "0 1px 6px rgba(15, 23, 42, 0.05)",
  },
  actionsRow: {
    display: "flex",
    gap: 10,
    marginTop: 12,
    alignItems: "center",
    flexWrap: "nowrap",
    overflowX: "auto",
    paddingBottom: 2,
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
    gridTemplateColumns: "minmax(0, 1fr) 260px 260px",
    gap: 0,
    minHeight: 0,
    flex: 1,
  },
  leftColumn: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
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
    overflow: "auto",
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
    zIndex: 2,
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
  ocProgressFooter: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    fontSize: 12,
    fontWeight: 800,
    color: "#334155",
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
};




