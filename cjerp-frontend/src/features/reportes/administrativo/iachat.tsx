import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent } from "react";
import {
  Bot,
  Download,
  FileText,
  Loader2,
  MessageSquareText,
  Paperclip,
  Sparkles,
  Trash2,
  X,
  WandSparkles,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppStatusMessage from "../../../components/base/AppStatusMessage";
import {
  consultarIaChat,
  exportarDashboardIaChat,
  getIaChatErrorMessage,
} from "./iachat/services/iaChatService";
import type {
  IaChatMessage,
  IaChatModuleCode,
  IaChatModuleInfo,
  IaChatImageAttachment,
  IaChatPresentationMode,
  IaChatRequest,
  IaChatResponse,
  IaChatChartType,
} from "./iachat/types";

declare global {
  interface Window {
    __IA_CHAT_REPORT_DATA__?: ReturnType<typeof buildDashboardStructuredData>;
  }
}

const MODULES: IaChatModuleInfo[] = [
  {
    id: "GASTOS",
    name: "Gastos",
    description: "Consulta segura de planilla, OC, saldos y agrupaciones.",
    keywords: ["pendientes", "combustible", "sitios", "responsable", "comprobante", "moneda", "subtotal", "bien"],
    enabled: true,
    statusLabel: "Habilitado",
  },
  {
    id: "ASISTENCIA",
    name: "Asistencia",
    description: "Pendientes de configuracion para marcaciones y turnos.",
    keywords: ["faltas", "tardanzas", "turnos", "ingresos", "salidas"],
    enabled: false,
    statusLabel: "Proximamente",
  },
  {
    id: "LOGISTICO",
    name: "Logistico",
    description: "Pendiente de configuracion para trazabilidad y almacenes.",
    keywords: ["inventario", "movimientos", "almacen", "equipos", "entradas"],
    enabled: false,
    statusLabel: "Pendiente",
  },
  {
    id: "COMPRAS",
    name: "Compras",
    description: "Pendiente de configuracion para solicitudes y OC.",
    keywords: ["orden de compra", "proveedores", "solicitudes", "aprobaciones", "montos"],
    enabled: false,
    statusLabel: "Pendiente",
  },
  {
    id: "RRHH",
    name: "RRHH",
    description: "Pendiente de configuracion para personal y compensaciones.",
    keywords: ["vacaciones", "personal", "legajo", "roles", "asistencia"],
    enabled: false,
    statusLabel: "Pendiente",
  },
  {
    id: "VENTAS",
    name: "Ventas",
    description: "Pendiente de configuracion para ventas y cobranzas.",
    keywords: ["facturacion", "cobranzas", "clientes", "ranking", "periodo"],
    enabled: false,
    statusLabel: "Pendiente",
  },
];

const GASTOS_INITIAL_MESSAGE: IaChatMessage = {
  id: "welcome-gastos",
  role: "assistant",
  title: "Gastos - Asistente seguro",
  text: "Escribe una consulta en lenguaje natural. Yo resolvere si conviene detalle, resumen o grafico sin exponer SQL libre.",
  tone: "info",
};

const PENDING_MESSAGE = (module: IaChatModuleInfo): IaChatMessage => ({
  id: `pending-${module.id}`,
  role: "assistant",
  title: `${module.name} - Proximamente`,
  text: "Este modulo todavia no esta habilitado. Por ahora solo puedes usar Gastos.",
  tone: "info",
});

const COLORS = ["#0F766E", "#2563EB", "#F59E0B", "#7C3AED", "#DC2626", "#16A34A", "#334155"];
const IA_CHAT_SESSION_STORAGE_KEY = "iachat.gastos.session.v1";

type IaChatSessionState = {
  selectedModuleId?: IaChatModuleCode;
  threads?: Record<string, IaChatMessage[]>;
  conversationIds?: Record<string, string>;
  presentationMode?: IaChatPresentationMode;
};

function createConversationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `conv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readIaChatSessionState(): IaChatSessionState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(IA_CHAT_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as IaChatSessionState;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeIaChatSessionState(state: IaChatSessionState) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(IA_CHAT_SESSION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignoramos errores de almacenamiento local para no afectar la UX del chat.
  }
}

function clearIaChatSessionState() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(IA_CHAT_SESSION_STORAGE_KEY);
  } catch {
    // No-op
  }
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "number") {
    return new Intl.NumberFormat("es-PE", {
      maximumFractionDigits: 2,
    }).format(value);
  }

  if (typeof value === "boolean") {
    return value ? "Si" : "No";
  }

  if (value instanceof Date) {
    return value.toLocaleString("es-PE");
  }

  return String(value);
}

function normalizeExportValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeExportValue(item))
      .filter((item) => item !== null)
      .map((item) => String(item))
      .join(", ");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function flattenExportRecord(
  value: unknown,
  prefix = "",
  output: Record<string, string | number | boolean | null> = {},
) {
  if (value === null || value === undefined || value === "") {
    if (prefix) {
      output[prefix] = null;
    }

    return output;
  }

  if (value instanceof Date || typeof value !== "object" || Array.isArray(value)) {
    if (prefix) {
      output[prefix] = normalizeExportValue(value);
    }

    return output;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith("__")) {
      continue;
    }

    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (child !== null && typeof child === "object" && !(child instanceof Date) && !Array.isArray(child)) {
      flattenExportRecord(child, nextKey, output);
    } else {
      output[nextKey] = normalizeExportValue(child);
    }
  }

  return output;
}

function buildExportRows(rows: Record<string, unknown>[]) {
  return rows.map((row) => flattenExportRecord(row));
}

function buildKeyValueExportRows(entries: Array<[string, unknown]>) {
  return entries.map(([field, value]) => ({
    Campo: field,
    Valor: normalizeExportValue(value),
  }));
}

function formatSqlString(value: string | null | undefined) {
  if (!value?.trim()) {
    return "NULL";
  }

  return `'${value.replace(/'/g, "''")}'`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractNamedFilterPreview(question: string, label: string) {
  const normalized = normalizeQuestion(question);
  const pattern = new RegExp(
    String.raw`\b(?:para\s+el\s+|para\s+la\s+|del\s+|de\s+el\s+|de\s+la\s+)?${escapeRegExp(label)}(?:\s+de)?\s+(?<value>.+?)(?=\b(?:para|durante|desde|hasta|de fecha|en fecha|en el periodo|periodo|mes|ano|anio|cliente|proyecto|responsable|solicitante|site|sitio|ot)\b|$)`,
    "i",
  );

  const match = normalized.match(pattern);
  const value = match?.groups?.value?.trim().replace(/\s{2,}/g, " ");
  return value ? value : null;
}

function formatSqlBit(value: boolean) {
  return value ? "1" : "0";
}

function formatSqlValue(value: string | null | undefined) {
  if (value === null || value === undefined) {
    return "NULL";
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return "NULL";
  }

  return `'${trimmed.replace(/'/g, "''")}'`;
}

function formatSqlDate(value: Date | null) {
  if (!value) {
    return "NULL";
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `'${year}${month}${day}'`;
}

function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeQuestion(value: string) {
  return stripDiacritics(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeFilterValue(value: string | null | undefined) {
  return normalizeQuestion(String(value ?? "")).replace(/\s+/g, " ").trim();
}

function extractStateFilters(question: string) {
  const normalized = normalizeQuestion(question);
  const states: string[] = [];

  const rules: Array<[RegExp, string]> = [
    [/\b(aprobado|aprobada|aprobados|aprobadas)\b/g, "APROBADO"],
    [/\b(pendiente|pendientes)\b/g, "PENDIENTE"],
    [/\b(observado|observada|observados|observadas)\b/g, "OBSERVADO"],
    [/\b(rechazado|rechazada|rechazados|rechazadas)\b/g, "RECHAZADO"],
    [/\b(pagado|pagada|pagados|pagadas)\b/g, "PAGADO"],
  ];

  for (const [pattern, mappedValue] of rules) {
    if (pattern.test(normalized)) {
      states.push(mappedValue);
    }
  }

  return states;
}

function inferDateRangeFromQuestion(question: string) {
  const normalized = normalizeQuestion(question);

  const monthMatch = normalized.match(
    /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|setiembre|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(19\d{2}|20\d{2})\b/,
  );

  if (monthMatch) {
    const monthMap: Record<string, number> = {
      enero: 0,
      febrero: 1,
      marzo: 2,
      abril: 3,
      mayo: 4,
      junio: 5,
      julio: 6,
      agosto: 7,
      setiembre: 8,
      septiembre: 8,
      octubre: 9,
      noviembre: 10,
      diciembre: 11,
    };

    const year = Number(monthMatch[2]);
    const monthIndex = monthMap[monthMatch[1]];
    const start = new Date(year, monthIndex, 1);
    const end = new Date(year, monthIndex + 1, 0);

    return { start, end, normalized };
  }

  const yearMatch = normalized.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    return { start, end, normalized };
  }

  return {
    start: null,
    end: null,
    normalized,
  };
}

function extractProjectFromQuestion(question: string) {
  const normalized = normalizeQuestion(question);
  const projectMatch = normalized.match(
    /\bproyecto\s+(?<value>.+?)(?=\b(?:para|durante|desde|hasta|de fecha|en fecha|en el periodo|en el periodo|periodo|periodo|mes|ano|año|de|del|en)\b|$)/i,
  );

  if (!projectMatch?.groups?.value) {
    return null;
  }

  const value = projectMatch.groups.value
    .replace(/\b(de fecha|en fecha|en el periodo|durante|desde|hasta|para|periodo|periodo|mes|ano|año)\b.*$/i, "")
    .trim()
    .replace(/\s{2,}/g, " ");

  return value ? value.toUpperCase() : null;
}

function extractTextSearchFromQuestion(question: string) {
  const normalized = normalizeQuestion(question);
  const withoutDates = normalized
    .replace(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|setiembre|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(19\d{2}|20\d{2})\b/g, " ")
    .replace(/\b(19\d{2}|20\d{2})\b/g, " ");

  const cleaned = withoutDates
    .replace(/\b(proyecto|cliente|proveedor|responsable|solicitante|site|sitio|ot|orden|ordenes|gasto|gastos|planilla|registro|registros|cuanto|cuantos|cuanta|cuantas|quiero|saber|mostrar|consultar|buscar|de|del|para|por|con|en|el|la|los|las|periodo|periodo|mes|ano|año|tiene|tengo|hay|del)\b/g, " ")
    .replace(/\b(en el periodo|durante|desde|hasta|de fecha|en fecha)\b/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!cleaned) {
    return null;
  }

  return cleaned
    .split(" ")
    .filter((token) => token.length > 1)
    .slice(0, 4)
    .join(" ");
}

function shouldUseExactMatch(question: string) {
  const normalized = normalizeQuestion(question);
  return /\b(coincidencia exacta|coincidir todas|todos los terminos|todos los términos|términos exactos|terminos exactos)\b/i.test(normalized);
}

function parseFrontendGastosQuestion(question: string) {
  const dateRange = inferDateRangeFromQuestion(question);
  const project = extractProjectFromQuestion(question);
  const textSearch = extractTextSearchFromQuestion(question);

  return {
    start: dateRange.start,
    end: dateRange.end,
    searchText: textSearch,
    project,
    coincideTodas: shouldUseExactMatch(question),
  };
}

function buildFrontendStorePreview(request: IaChatRequest) {
  const parsed = parseFrontendGastosQuestionForPreview(request.question);

  return [
    "EXEC dbo.sp_IA_Planilla_Buscar",
    `    @FechaInicio     = ${formatSqlDate(parsed.start)},`,
    `    @FechaFin        = ${formatSqlDate(parsed.end)},`,
    `    @TextoBusqueda   = ${formatSqlValue(parsed.searchText)},`,
    `    @Estados         = ${formatSqlValue(parsed.estados)},`,
    "    @IdSite          = NULL,",
    `    @Site            = ${formatSqlValue(parsed.site)},`,
    "    @CorreSite       = NULL,",
    `    @Cliente         = ${formatSqlValue(parsed.cliente)},`,
    `    @Proyecto        = ${formatSqlValue(parsed.project)},`,
    `    @Responsable     = ${formatSqlValue(parsed.responsable)},`,
    `    @Solicitante     = ${formatSqlValue(parsed.solicitante)},`,
    `    @Ot              = ${formatSqlValue(parsed.ot)},`,
    `    @CoincidirTodas  = ${formatSqlBit(parsed.coincideTodas)},`,
    `    @IncluirEstado99 = ${formatSqlBit(true)},`,
    "    @Pagina          = 1,",
    "    @TamanoPagina    = 20000,",
    "    @TipoCambio      = 3.8;",
  ].join("\n");
}

function sanitizePdfFileName(fileName: string | null | undefined) {
  const baseName = (fileName ?? "").trim() || `gastos-reporte-dashboard-${Date.now()}.pdf`;
  const normalized = baseName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-");
  return normalized.toLowerCase().endsWith(".pdf") ? normalized : `${normalized}.pdf`;
}

function dashboardFallbackRuntime() {
  const reportData = ((window as Window & { __IA_CHAT_REPORT_DATA__?: any }).__IA_CHAT_REPORT_DATA__ || {}) as any;
  const fallbackSections = [
    {
      title: "Distribución mensual",
      labels: ["distribucion mensual", "evolucion mensual", "comportamiento mensual", "gasto mensual", "gastos mensuales"],
      rows: Array.isArray(reportData.monthChartRows) ? reportData.monthChartRows : [],
      labelKey: "label",
      amountKey: "amount",
    },
    {
      title: "Por proyecto",
      labels: ["por proyecto", "proyecto principal", "concentracion por proyecto", "principales concentraciones por cliente / proyecto", "principales proyectos"],
      rows: Array.isArray(reportData.projectChartRows) ? reportData.projectChartRows : [],
      labelKey: "label",
      amountKey: "amount",
    },
    {
      title: "Top solicitantes",
      labels: ["top solicitantes", "solicitante principal", "por solicitante", "participacion por solicitante"],
      rows: Array.isArray(reportData.solicitanteChartRows) ? reportData.solicitanteChartRows : [],
      labelKey: "label",
      amountKey: "amount",
    },
    {
      title: "Top sites",
      labels: ["top sites", "site principal", "por site", "sitios principales"],
      rows: Array.isArray(reportData.siteChartRows) ? reportData.siteChartRows : [],
      labelKey: "label",
      amountKey: "amount",
    },
    {
      title: "Desglose por moneda",
      labels: ["desglose por moneda", "por moneda", "participacion por moneda", "moneda principal"],
      rows: Array.isArray(reportData.currencyTotals) ? reportData.currencyTotals : [],
      labelKey: "Moneda",
      amountKey: "Monto",
    },
  ];

  function normalizeText(value: any) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function toNumber(value: any) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }

    const raw = String(value || "").trim();
    if (!raw) {
      return 0;
    }

    let cleaned = raw.replace(/[^\d,.-]/g, "");
    const hasDot = cleaned.includes(".");
    const hasComma = cleaned.includes(",");

    if (hasDot && hasComma) {
      cleaned = cleaned.replace(/,/g, "");
    } else if (hasComma && !hasDot) {
      const pieces = cleaned.split(",");
      cleaned = pieces.length === 2 && pieces[1].length !== 3 ? pieces.join(".") : pieces.join("");
    }

    cleaned = cleaned.replace(/(?!^)-/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatMoney(value: any) {
    return new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: "PEN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  }

  function getAmountText(row: any, amountKey: string, amountNumber: number) {
    if (amountKey === "Monto" && typeof row.Monto === "string") {
      return String(row.Monto);
    }

    if (amountKey === "amount" && typeof row.amount === "string") {
      return String(row.amount);
    }

    return formatMoney(amountNumber);
  }

  function createCard(title: string, rows: any[], labelKey: string, amountKey: string) {
    const wrapper = document.createElement("section");
    wrapper.setAttribute("data-iachat-fallback-chart", "true");
    wrapper.style.cssText = [
      "margin: 14px 0 4px",
      "padding: 14px 14px 10px",
      "border: 1px solid rgba(148, 163, 184, 0.28)",
      "border-radius: 18px",
      "background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.96))",
      "box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06)",
      "overflow: hidden",
    ].join(";");

    const header = document.createElement("div");
    header.style.cssText = "display:flex;flex-direction:column;gap:4px;margin-bottom:10px;";

    const titleEl = document.createElement("div");
    titleEl.textContent = title;
    titleEl.style.cssText = "font-size:12px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#475569;";
    header.appendChild(titleEl);

    const subtitleEl = document.createElement("div");
    subtitleEl.textContent = rows.length > 0
      ? rows.length + " agrupaciones detectadas"
      : "Sin datos suficientes para el gráfico";
    subtitleEl.style.cssText = "font-size:12px;color:#64748b;";
    header.appendChild(subtitleEl);

    wrapper.appendChild(header);

    const chartArea = document.createElement("div");
    chartArea.style.cssText = "display:flex;flex-direction:column;gap:10px;";

    const items = rows.slice(0, 6).map((row: any) => {
      const typedRow = row as Record<string, unknown>;
      const rawAmount = typedRow[amountKey];
      const participationValue = typeof typedRow.participation === "number"
        ? Number(typedRow.participation)
        : typeof typedRow.Participacion === "string"
          ? toNumber(typedRow.Participacion)
          : null;

      return {
        label: String(typedRow[labelKey] ?? "Sin dato"),
        amount: toNumber(rawAmount),
        amountText: getAmountText(typedRow, amountKey, toNumber(rawAmount)),
        participation: participationValue,
      };
    });

    const maxAmount = Math.max(...items.map((item) => item.amount), 1);
    const accent = title === "Distribución mensual"
      ? "#2563EB"
      : title === "Por proyecto"
        ? "#0F766E"
        : title === "Top solicitantes"
          ? "#7C3AED"
          : title === "Top sites"
            ? "#F59E0B"
            : "#DC2626";

    if (items.length > 0) {
      const bars = document.createElement("div");
      bars.style.cssText = "display:flex;flex-direction:column;gap:8px;";

      for (const item of items) {
        const row = document.createElement("div");
        row.style.cssText = "display:grid;grid-template-columns:minmax(110px,1.2fr) minmax(0,2.6fr) auto;gap:10px;align-items:center;";

        const label = document.createElement("div");
        label.textContent = item.label;
        label.style.cssText = "font-size:12px;font-weight:700;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

        const track = document.createElement("div");
        track.style.cssText = "height:12px;background:#e2e8f0;border-radius:999px;overflow:hidden;position:relative;";

        const fill = document.createElement("div");
        const ratio = maxAmount > 0 ? Math.max(6, (item.amount / maxAmount) * 100) : 6;
        fill.style.cssText = "height:100%;width:" + ratio + "%;background:" + accent + ";border-radius:999px;";
        track.appendChild(fill);

        const amount = document.createElement("div");
        amount.textContent = item.participation !== null
          ? item.amountText + " • " + item.participation.toFixed(2) + "%"
          : item.amountText;
        amount.style.cssText = "font-size:12px;font-weight:700;color:#0f172a;white-space:nowrap;";

        row.appendChild(label);
        row.appendChild(track);
        row.appendChild(amount);
        bars.appendChild(row);
      }

      chartArea.appendChild(bars);
    }

    const table = document.createElement("table");
    table.style.cssText = "width:100%;border-collapse:collapse;margin-top:4px;font-size:12px;";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const headerText of ["Categoría", "Monto", "%"]) {
      const th = document.createElement("th");
      th.textContent = headerText;
      th.style.cssText = "text-align:left;padding:6px 8px;background:#f8fafc;color:#64748b;border-bottom:1px solid #e2e8f0;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;";
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const item of items) {
      const tr = document.createElement("tr");
      const labelCell = document.createElement("td");
      labelCell.textContent = item.label;
      labelCell.style.cssText = "padding:6px 8px;border-bottom:1px solid #eef2f7;color:#1e293b;";
      const amountCell = document.createElement("td");
      amountCell.textContent = item.amountText;
      amountCell.style.cssText = "padding:6px 8px;border-bottom:1px solid #eef2f7;font-weight:700;color:#1d4ed8;";
      const pctCell = document.createElement("td");
      pctCell.textContent = item.participation !== null ? item.participation.toFixed(2) + "%" : "—";
      pctCell.style.cssText = "padding:6px 8px;border-bottom:1px solid #eef2f7;color:#475569;";
      tr.appendChild(labelCell);
      tr.appendChild(amountCell);
      tr.appendChild(pctCell);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    chartArea.appendChild(table);

    wrapper.appendChild(chartArea);
    return wrapper;
  }

  function getCanvasAlpha(canvas: any) {
    try {
      const context = canvas.getContext("2d");
      if (!context || canvas.width <= 0 || canvas.height <= 0) {
        return 0;
      }

      const sample = context.getImageData(
        Math.max(0, Math.floor(canvas.width / 2) - 1),
        Math.max(0, Math.floor(canvas.height / 2) - 1),
        1,
        1,
      ).data;
      return sample[3];
    } catch {
      return 0;
    }
  }

  function findHeading(labels: string[]) {
    const selectors = "h1,h2,h3,h4,h5,h6,p,div,span,strong";
    const nodes = Array.from(document.querySelectorAll(selectors));
    return nodes.find((node: any) => {
      const text = normalizeText(node.textContent);
      return labels.some((label) => text.includes(label));
    }) || null;
  }

  function findCardContainer(node: any) {
    let current = node instanceof Element ? node : node && node.parentElement ? node.parentElement : null;
    while (current && current !== document.body) {
      const rect = current.getBoundingClientRect();
      if (rect.width > 220 && rect.height > 140 && (current.querySelector("table") || current.querySelector("canvas") || current.children.length > 1)) {
        return current;
      }
      current = current.parentElement;
    }

    return node instanceof Element ? node.parentElement : document.body;
  }

  function injectFallback(section: any) {
    const heading = findHeading(section.labels);
    if (!heading) {
      return;
    }

    const card = findCardContainer(heading);
    if (!card) {
      return;
    }

    const canvases = Array.from(card.querySelectorAll("canvas")) as HTMLCanvasElement[];
    let hasVisibleCanvas = false;

    for (const canvas of canvases) {
      const alpha = getCanvasAlpha(canvas);
      if (alpha > 0) {
        hasVisibleCanvas = true;
      } else {
        canvas.remove();
      }
    }

    if (hasVisibleCanvas || card.querySelector("[data-iachat-fallback-chart]")) {
      return;
    }

    const fallback = createCard(section.title, section.rows, section.labelKey, section.amountKey);
    const table = card.querySelector("table");
    if (table && table.parentElement) {
      table.parentElement.insertBefore(fallback, table);
    } else {
      card.appendChild(fallback);
    }
  }

  function run() {
    for (const section of fallbackSections) {
      injectFallback(section);
    }
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(run, 1200);
  } else {
    window.addEventListener("load", () => setTimeout(run, 1200), { once: true });
  }
}

function injectDashboardFallbacksIntoHtml(
  htmlContent: string,
  dashboardData: ReturnType<typeof buildDashboardStructuredData>,
) {
  const dataJson = JSON.stringify(dashboardData).replace(/</g, "\\u003c");
  const injection = `<script>window.__IA_CHAT_REPORT_DATA__ = ${dataJson};</script><script>(${dashboardFallbackRuntime.toString()})();</script>`;
  return /<\/body>\s*$/i.test(htmlContent)
    ? htmlContent.replace(/<\/body>\s*$/i, `${injection}</body>`)
    : `${htmlContent}${injection}`;
}

async function waitForDashboardRender(frame: HTMLIFrameElement) {
  const maxAttempts = 30;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const frameDocument = frame.contentDocument;
    const frameWindow = frame.contentWindow;
    const body = frameDocument?.body;

    if (body && body.scrollHeight > 120) {
      const canvases = Array.from(frameDocument.querySelectorAll("canvas"));
      const hasRenderedCanvas = canvases.length === 0 || canvases.some((canvas) => {
        const context = canvas.getContext("2d");
        if (!context) {
          return false;
        }

        const sample = context.getImageData(
          Math.max(0, Math.floor(canvas.width / 2) - 1),
          Math.max(0, Math.floor(canvas.height / 2) - 1),
          1,
          1,
        ).data;
        return sample[3] > 0;
      });

      if (hasRenderedCanvas) {
        return;
      }
    }

    await new Promise((resolve) => frameWindow?.setTimeout(resolve, 250) ?? window.setTimeout(resolve, 250));
  }
}

function getReportRootElement(frameDocument: Document) {
  return (
    frameDocument.querySelector<HTMLElement>("#report-root, #claude-report-root, [data-report-root], main, article") ??
    frameDocument.body.firstElementChild as HTMLElement | null ??
    frameDocument.body
  );
}

async function exportDashboardHtmlAsPdf(htmlContent: string, fileName: string, viewportWidth?: number) {
  const sourceFrame = document.createElement("iframe");
  sourceFrame.style.position = "fixed";
  sourceFrame.style.right = "-10000px";
  sourceFrame.style.bottom = "0";
  sourceFrame.style.width = `${Math.max(980, Math.round(viewportWidth ?? 1440))}px`;
  sourceFrame.style.height = "2200px";
  sourceFrame.style.border = "0";
  sourceFrame.style.opacity = "0";
  sourceFrame.style.pointerEvents = "none";

  try {
    await new Promise<void>((resolve, reject) => {
      sourceFrame.onload = () => resolve();
      sourceFrame.onerror = () => reject(new Error("No se pudo renderizar el dashboard para exportarlo."));
      sourceFrame.srcdoc = htmlContent;
      document.body.appendChild(sourceFrame);
    });

    await waitForDashboardRender(sourceFrame);

    const frameDocument = sourceFrame.contentDocument;
    const frameWindow = sourceFrame.contentWindow;
    if (!frameDocument?.body || !frameWindow) {
      throw new Error("No se pudo obtener el contenido del dashboard generado.");
    }

    if (frameDocument.fonts?.ready) {
      await frameDocument.fonts.ready.catch(() => undefined);
    }

    const exportRoot = getReportRootElement(frameDocument);
    if (!exportRoot) {
      throw new Error("No se pudo identificar el contenedor principal del dashboard generado.");
    }

    const canvas = await html2canvas(exportRoot, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      scrollY: -frameWindow.scrollY,
      windowWidth: Math.max(exportRoot.scrollWidth, frameDocument.documentElement.scrollWidth, Math.round(viewportWidth ?? 1440)),
      windowHeight: Math.max(exportRoot.scrollHeight, frameDocument.documentElement.scrollHeight, 2200),
    });

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
      compress: true,
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const marginX = 6;
    const marginY = 6;
    const printableWidth = pageWidth - marginX * 2;
    const printableHeight = pageHeight - marginY * 2;
    const imageData = canvas.toDataURL("image/png", 1.0);
    const imageWidth = canvas.width;
    const imageHeight = canvas.height;
    const imageHeightMm = (imageHeight * printableWidth) / imageWidth;
    pdf.addImage(imageData, "PNG", marginX, marginY, printableWidth, imageHeightMm, undefined, "FAST");

    let remainingHeight = imageHeightMm - printableHeight;
    let offset = printableHeight;

    while (remainingHeight > 0) {
      pdf.addPage();
      pdf.addImage(imageData, "PNG", marginX, marginY - offset, printableWidth, imageHeightMm, undefined, "FAST");
      offset += printableHeight;
      remainingHeight -= printableHeight;
    }

    pdf.save(sanitizePdfFileName(fileName));
  } finally {
    sourceFrame.remove();
  }
}

function getDashboardQuestion(response: IaChatResponse) {
  const interpretedQuestion = response.interpretedFilters?.question;
  if (typeof interpretedQuestion === "string" && interpretedQuestion.trim()) {
    return interpretedQuestion.trim();
  }

  return "Generar reporte ejecutivo del resultado actual";
}

function buildDashboardStructuredData(response: IaChatResponse) {
  const report = buildExecutiveWeeklyReportData(response);
  const filters = buildDisplayFilters(response).map((item) => ({
    campo: item.label,
    valor: item.value,
  }));

  return {
    module: response.module,
    responseType: response.responseType,
    totalRows: response.totalRows ?? response.detailRows?.length ?? 0,
    metric: report.metric,
    currency: report.currency,
    hasMultipleCurrencies: report.hasMultipleCurrencies,
    period: report.period,
    filters,
    summaryRows: report.summaryRows,
    kpiRows: report.kpiRows,
    monthTable: report.monthTable,
    projectTable: report.projectTable,
    solicitanteTable: report.solicitanteTable,
    siteTable: report.siteTable,
    currencyTable: report.currencyTable,
    currencyTotals: report.currencyTotals,
    semaphoreTable: report.semaphoreTable,
    executiveReading: report.executiveReading,
    conclusion: report.conclusion,
    recommendations: report.recommendations,
    monthChartRows: report.monthChartRows,
    projectChartRows: report.projectChartRows,
    solicitanteChartRows: report.solicitanteChartRows,
    siteChartRows: report.siteChartRows,
  };
}

  function toPdfRows(rows: Record<string, unknown>[]) {
    return rows.map((row) => flattenExportRecord(row));
  }

function addPdfSection(
  doc: jsPDF,
  title: string,
  rows: Record<string, unknown>[],
  startY: number,
  options?: {
    titleFontSize?: number;
    headStyleFill?: [number, number, number];
  },
) {
  const tableRows = rows.length > 0 ? rows : [{ Campo: "Sin registros", Valor: "-" }];
  const columns = Object.keys(tableRows[0] ?? {});

  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(options?.titleFontSize ?? 12);
  doc.text(title, 14, startY);

  autoTable(doc, {
    startY: startY + 4,
    head: [columns],
    body: tableRows.map((row) => columns.map((column) => formatValue(row[column]))),
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 2.8,
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: options?.headStyleFill ?? [15, 118, 110],
      textColor: 255,
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 14, right: 14 },
    theme: "striped",
  });

  return ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? startY + 18) + 10;
}

function addPdfTextBlock(
  doc: jsPDF,
  title: string,
  text: string,
  startY: number,
  options?: { accentColor?: [number, number, number] },
) {
  const accent = options?.accentColor ?? [15, 118, 110];
  doc.setDrawColor(...accent);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, startY, 269, 8, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(title, 18, startY + 5.5);

  const paragraphs = text
    .split(/\n{2,}/)
    .map((item) => item.replace(/\*\*/g, "").replace(/^#+\s*/gm, "").trim())
    .filter(Boolean);

  let cursorY = startY + 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);

  for (const paragraph of paragraphs) {
    const lines = doc.splitTextToSize(paragraph, 265);
    doc.text(lines, 16, cursorY);
    cursorY += lines.length * 5 + 3;

    if (cursorY > 188) {
      doc.addPage();
      cursorY = 18;
    }
  }

  return cursorY + 4;
}

function getPdfPageSize(doc: jsPDF) {
  return {
    width: doc.internal.pageSize.getWidth(),
    height: doc.internal.pageSize.getHeight(),
  };
}

function drawPdfHeader(doc: jsPDF, module: string, generatedAt: string, reportLabel: string) {
  const { width } = getPdfPageSize(doc);
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, width, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Reporte Ejecutivo Semanal", 14, 13);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Modulo: ${module}  |  Generado: ${generatedAt}`, width - 14, 13, { align: "right" });

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(reportLabel, 14, 32);
}

function ensurePdfSpace(doc: jsPDF, cursorY: number, neededHeight: number, headerDrawer: () => void) {
  const { height } = getPdfPageSize(doc);
  if (cursorY + neededHeight <= height - 14) {
    return cursorY;
  }

  doc.addPage();
  headerDrawer();
  return 38;
}

function drawWrappedText(doc: jsPDF, text: string, x: number, y: number, width: number, lineHeight = 4.2) {
  const lines = doc.splitTextToSize(text, width);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function addPdfKpiCards(
  doc: jsPDF,
  rows: Array<{ Indicador: string; Resultado: string }>,
  startY: number,
  headerDrawer: () => void,
) {
  let cursorY = ensurePdfSpace(doc, startY, 48, headerDrawer);
  const { width } = getPdfPageSize(doc);
  const marginX = 14;
  const gap = 6;
  const columns = 3;
  const cardWidth = (width - marginX * 2 - gap * (columns - 1)) / columns;
  const cardHeight = 22;
  const palette: Array<[number, number, number]> = [
    [15, 118, 110],
    [37, 99, 235],
    [245, 158, 11],
    [124, 58, 237],
    [220, 38, 38],
  ];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text("2. Indicadores principales", marginX, cursorY);
  cursorY += 6;

  rows.slice(0, 5).forEach((row, index) => {
    const column = index % columns;
    const rowIndex = Math.floor(index / columns);
    const x = marginX + column * (cardWidth + gap);
    const y = cursorY + rowIndex * (cardHeight + gap);
    const accent = palette[index % palette.length];

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...accent);
    doc.roundedRect(x, y, cardWidth, cardHeight, 3, 3, "FD");

    doc.setFillColor(...accent);
    doc.roundedRect(x, y, cardWidth, 4, 3, 3, "F");

    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(row.Indicador.toUpperCase(), x + 3, y + 8);

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    const valueLines = doc.splitTextToSize(row.Resultado, cardWidth - 6);
    doc.text(valueLines, x + 3, y + 15);
  });

  return cursorY + Math.ceil(Math.min(rows.length, 5) / columns) * (cardHeight + gap) + 2;
}

function addPdfVerticalBarChart(
  doc: jsPDF,
  title: string,
  rows: Array<{ label: string; amount: number }>,
  currency: string,
  startY: number,
  headerDrawer: () => void,
) {
  let cursorY = ensurePdfSpace(doc, startY, 88, headerDrawer);
  const marginX = 14;
  const chartWidth = 180;
  const chartHeight = 52;
  const chartX = marginX;
  const chartY = cursorY + 8;
  const maxAmount = Math.max(...rows.map((item) => item.amount), 0);
  const barGap = 6;
  const usableBars = Math.max(rows.length, 1);
  const barWidth = Math.max((chartWidth - barGap * (usableBars - 1)) / usableBars, 10);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(title, marginX, cursorY);

  doc.setDrawColor(203, 213, 225);
  doc.line(chartX, chartY + chartHeight, chartX + chartWidth, chartY + chartHeight);
  doc.line(chartX, chartY, chartX, chartY + chartHeight);

  rows.forEach((item, index) => {
    const x = chartX + index * (barWidth + barGap);
    const barHeight = maxAmount > 0 ? (item.amount / maxAmount) * (chartHeight - 6) : 0;
    const y = chartY + chartHeight - barHeight;

    doc.setFillColor(37, 99, 235);
    doc.roundedRect(x, y, barWidth, Math.max(barHeight, 1), 1.5, 1.5, "F");

    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const label = item.label.length > 10 ? `${item.label.slice(0, 10)}...` : item.label;
    doc.text(label, x + barWidth / 2, chartY + chartHeight + 5, { align: "center" });
  });

  const top = rows.slice().sort((a, b) => b.amount - a.amount)[0];
  let sideY = chartY + 3;
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Lectura ejecutiva", 205, sideY);
  sideY += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  sideY = drawWrappedText(
    doc,
    top
      ? `${top.label} concentra el mayor monto del periodo con ${formatMoneyByCurrency(top.amount, currency)}.`
      : "No hay datos suficientes para graficar esta vista.",
    205,
    sideY,
    74,
  );

  return Math.max(chartY + chartHeight + 14, sideY + 4);
}

function addPdfHorizontalBarChart(
  doc: jsPDF,
  title: string,
  rows: Array<{ label: string; amount: number; participation: number }>,
  currency: string,
  startY: number,
  headerDrawer: () => void,
) {
  const visibleRows = rows.slice(0, 5);
  let cursorY = ensurePdfSpace(doc, startY, 72, headerDrawer);
  const marginX = 14;
  const barX = 70;
  const barMaxWidth = 125;
  const maxAmount = Math.max(...visibleRows.map((item) => item.amount), 0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(title, marginX, cursorY);
  cursorY += 8;

  visibleRows.forEach((item, index) => {
    const y = cursorY + index * 11;
    const width = maxAmount > 0 ? (item.amount / maxAmount) * barMaxWidth : 0;

    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(item.label.length > 28 ? `${item.label.slice(0, 28)}...` : item.label, marginX, y + 4);

    doc.setFillColor(226, 232, 240);
    doc.roundedRect(barX, y, barMaxWidth, 5, 1.5, 1.5, "F");
    doc.setFillColor(15, 118, 110);
    doc.roundedRect(barX, y, Math.max(width, 1), 5, 1.5, 1.5, "F");

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "normal");
    doc.text(formatMoneyByCurrency(item.amount, currency), barX + barMaxWidth + 6, y + 4);
    doc.text(`${item.participation.toFixed(2)}%`, 276, y + 4, { align: "right" });
  });

  return cursorY + visibleRows.length * 11 + 2;
}

function addPdfTopSitesVisual(
  doc: jsPDF,
  rows: Array<{ label: string; amount: number }>,
  currency: string,
  startY: number,
  headerDrawer: () => void,
) {
  const visibleRows = rows.slice(0, 5);
  let cursorY = ensurePdfSpace(doc, startY, 64, headerDrawer);
  const marginX = 14;
  const cardWidth = 52;
  const gap = 5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text("Top 5 sites", marginX, cursorY);
  cursorY += 7;

  visibleRows.forEach((item, index) => {
    const x = marginX + index * (cardWidth + gap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(148, 163, 184);
    doc.roundedRect(x, cursorY, cardWidth, 24, 3, 3, "FD");

    doc.setFillColor(15, 118, 110);
    doc.circle(x + 6, cursorY + 6, 3.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(String(index + 1), x + 6, cursorY + 6.9, { align: "center" });

    doc.setTextColor(51, 65, 85);
    doc.setFontSize(7.5);
    doc.text(item.label.length > 18 ? `${item.label.slice(0, 18)}...` : item.label, x + 11, cursorY + 6.7);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    const amountLines = doc.splitTextToSize(formatMoneyByCurrency(item.amount, currency), cardWidth - 6);
    doc.text(amountLines, x + 3, cursorY + 15);
  });

  return cursorY + 30;
}

function addPdfSemaphoreVisual(
  doc: jsPDF,
  rows: Array<{ Indicador: string; Estado: string; Comentario: string }>,
  startY: number,
  headerDrawer: () => void,
) {
  let cursorY = ensurePdfSpace(doc, startY, 68, headerDrawer);
  const marginX = 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text("4. Semaforo ejecutivo", marginX, cursorY);

  autoTable(doc, {
    startY: cursorY + 4,
    head: [["Indicador", "Estado", "Comentario"]],
    body: rows.map((row) => [row.Indicador, row.Estado, row.Comentario]),
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 2.5,
      valign: "middle",
    },
    headStyles: {
      fillColor: [220, 38, 38],
      textColor: 255,
      fontStyle: "bold",
    },
    didParseCell(data) {
      if (data.section !== "body" || data.column.index !== 1) {
        return;
      }

      const value = String(data.cell.raw ?? "").toLowerCase();
      if (value.includes("verde")) {
        data.cell.styles.fillColor = [220, 252, 231];
        data.cell.styles.textColor = [22, 101, 52];
        data.cell.styles.fontStyle = "bold";
      } else if (value.includes("amarillo")) {
        data.cell.styles.fillColor = [254, 249, 195];
        data.cell.styles.textColor = [133, 77, 14];
        data.cell.styles.fontStyle = "bold";
      } else if (value.includes("rojo")) {
        data.cell.styles.fillColor = [254, 226, 226];
        data.cell.styles.textColor = [153, 27, 27];
        data.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: 14, right: 14 },
    theme: "striped",
  });

  return ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? cursorY + 18) + 8;
}

function resolvePeriodLabel(filters: Array<{ label: string; value: unknown }>) {
  const fechaInicio = filters.find((item) => item.label.toLowerCase() === "fechainicio")?.value;
  const fechaFin = filters.find((item) => item.label.toLowerCase() === "fechafin")?.value;

  if (!fechaInicio && !fechaFin) {
    return "No especificado";
  }

  return `${formatValue(fechaInicio)} al ${formatValue(fechaFin)}`;
}

function parseReportDate(value: unknown) {
  if (!value) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const parsed = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const parsed = new Date(Number(slashMatch[3]), Number(slashMatch[2]) - 1, Number(slashMatch[1]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("es-PE", { month: "long", year: "numeric" });
}

function normalizeStateLabel(value: unknown) {
  return String(value ?? "Sin estado").trim() || "Sin estado";
}

function normalizeCurrencyLabel(value: unknown) {
  const normalized = normalizeQuestion(String(value ?? ""));
  if (normalized.includes("usd") || normalized.includes("dolar") || normalized.includes("dólar") || normalized.includes("us$")) {
    return "USD";
  }

  return "PEN";
}

function formatMoneyByCurrency(value: number, currency: string) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return currency === "USD"
    ? `US$ ${safeValue.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `S/ ${safeValue.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function detectReportMetric(response: IaChatResponse) {
  const question = String(response.interpretedFilters?.question ?? "").toLowerCase();
  const answer = String(response.answer ?? "").toLowerCase();
  const wantsVentas = question.includes("venta") || answer.includes("venta");

  return wantsVentas ? "ventas" : "gastos";
}

function resolveMetricAmountField(metric: "ventas" | "gastos") {
  return metric === "ventas" ? "Ventas" : "Subtotal";
}

function normalizeRowsForMetric(rows: Record<string, unknown>[], metric: "ventas" | "gastos") {
  if (metric !== "ventas") {
    return rows;
  }

  const grouped = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const ot = String(resolveFieldValue(row, ["Ot", "OT"]) ?? "").trim();
    const site = String(resolveFieldValue(row, ["Site", "Sitio", "site", "sitio"]) ?? "").trim();
    const fallbackKey = String(resolveFieldValue(row, ["IdPlanilla", "IDPLANILLA"]) ?? crypto.randomUUID?.() ?? Math.random());
    const key = ot || site ? `${ot}||${site}` : fallbackKey;

    if (!grouped.has(key)) {
      grouped.set(key, row);
      continue;
    }

    const current = grouped.get(key)!;
    const currentVentas = resolveNumericField(current, ["Ventas", "ventas"]);
    const nextVentas = resolveNumericField(row, ["Ventas", "ventas"]);
    if (nextVentas > currentVentas) {
      grouped.set(key, row);
    }
  }

  return Array.from(grouped.values());
}

function resolveReportAmount(row: Record<string, unknown>, metric: "ventas" | "gastos") {
  const amountField = resolveMetricAmountField(metric);
  return resolveNumericField(row, [amountField, amountField.toLowerCase()]);
}

function buildTopRowsByField(
  rows: Record<string, unknown>[],
  metric: "ventas" | "gastos",
  fields: string[],
  limit = 5,
  includeRanking = false,
  splitByCurrency = false,
) {
  const grouped = new Map<string, { label: string; amount: number; count: number; currency?: string }>();

  for (const row of rows) {
    const label = formatValue(resolveFieldValue(row, fields));
    const normalizedLabel = label === "-" ? "Sin dato" : label;
    const currency = splitByCurrency
      ? normalizeCurrencyLabel(resolveFieldValue(row, ["Moneda"]))
      : undefined;
    const key = `${normalizedLabel}||${currency ?? ""}`;
    const amount = resolveReportAmount(row, metric);
    const current = grouped.get(key) ?? { label: normalizedLabel, amount: 0, count: 0, currency };
    current.amount += amount;
    current.count += 1;
    grouped.set(key, current);
  }

  const total = Array.from(grouped.values()).reduce((acc, item) => acc + item.amount, 0);

  return Array.from(grouped.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit)
    .map((item, index) => ({
      ...(includeRanking ? { Ranking: index + 1 } : {}),
      label: item.currency ? `${item.label} (${item.currency})` : item.label,
      currency: item.currency ?? null,
      amount: item.amount,
      count: item.count,
      participation: total > 0 ? (item.amount / total) * 100 : 0,
    }));
}

function buildMonthlyRows(
  rows: Record<string, unknown>[],
  metric: "ventas" | "gastos",
  splitByCurrency = false,
) {
  const grouped = new Map<string, { month: string; amount: number; currency?: string }>();

  for (const row of rows) {
    const date = parseReportDate(resolveFieldValue(row, ["Fecha", "FECHA", "FechaIngresoTexto"]));
    if (!date) {
      continue;
    }

    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const currency = splitByCurrency ? normalizeCurrencyLabel(resolveFieldValue(row, ["Moneda"])) : undefined;
    const compositeKey = splitByCurrency ? `${key}||${currency ?? ""}` : key;
    const current = grouped.get(compositeKey) ?? { month: monthLabel(date), amount: 0, currency };
    current.amount += resolveReportAmount(row, metric);
    grouped.set(compositeKey, current);
  }

  return Array.from(grouped.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, value]) => value);
}

function buildExecutiveWeeklyReportData(response: IaChatResponse) {
  const rawRows = response.detailRows ?? [];
  const metric = detectReportMetric(response);
  const metricRows = normalizeRowsForMetric(rawRows, metric);
  const filters = buildDisplayFilters(response);
  const period = resolvePeriodLabel(filters);
  const currencies = buildTopRowsByField(metricRows, metric, ["Moneda"], 10);
  const hasMultipleCurrencies = currencies.length > 1;
  const primaryCurrency = currencies[0]?.label ? normalizeCurrencyLabel(currencies[0].label) : "PEN";
  const totalAmount = metricRows.reduce((acc, row) => acc + resolveReportAmount(row, metric), 0);
  const totalRecords = metricRows.length;
  const baseRecords = rawRows.length;
  const statusRows = buildTopRowsByField(rawRows, metric, ["Estado"], 20);
  const totalPagado = statusRows
    .filter((item) => normalizeQuestion(item.label).includes("pagado"))
    .reduce((acc, item) => acc + item.count, 0);
  const paidPercent = baseRecords > 0 ? (totalPagado / baseRecords) * 100 : 0;
  const monthRows = buildMonthlyRows(metricRows, metric, hasMultipleCurrencies);
  const projectRows = buildTopRowsByField(metricRows, metric, ["Proyecto"], 8, false, hasMultipleCurrencies);
  const solicitanteRows = buildTopRowsByField(metricRows, metric, ["Solicitante"], 8, false, hasMultipleCurrencies);
  const siteRows = buildTopRowsByField(metricRows, metric, ["Site", "Sitio"], 5, true, hasMultipleCurrencies);
  const clientRows = buildTopRowsByField(metricRows, metric, ["Cliente"], 5, false, hasMultipleCurrencies);
  const responsibleRows = buildTopRowsByField(metricRows, metric, ["Responsable"], 5, false, hasMultipleCurrencies);

  const topMonth = monthRows.slice().sort((a, b) => b.amount - a.amount)[0];
  const topProject = projectRows[0];
  const topSolicitante = solicitanteRows[0];
  const topSite = siteRows[0];
  const topClient = clientRows[0];
  const topResponsable = responsibleRows[0];
  const topStatus = statusRows[0];
  const currenciesLabel = currencies.length > 0
    ? currencies.map((item) => item.label).join(", ")
    : "Sin moneda";
  const currencyTotalsLabel = currencies.length > 0
    ? currencies.map((item) => `${item.label}: ${formatMoneyByCurrency(item.amount, item.label)}`).join(" | ")
    : "Sin moneda";

  const concentrationProject = topProject?.participation ?? 0;
  const concentrationSolicitante = topSolicitante?.participation ?? 0;
  const concentrationMonth = topMonth && totalAmount > 0 ? (topMonth.amount / totalAmount) * 100 : 0;
  const hasRiskStates = statusRows.some((item) => {
    const state = normalizeQuestion(item.label);
    return state.includes("rechaz") || state.includes("observ") || state.includes("pend");
  });
  const hasNegative = metricRows.some((row) => resolveReportAmount(row, metric) < 0);

  const buildSemaphore = (share: number, comment: string) => ({
    state: hasNegative ? "Rojo" : share >= 60 ? "Rojo" : share >= 40 ? "Amarillo" : "Verde",
    comment,
  });

  const semaphore = [
    {
      indicator: "Estado de registros",
      state: hasRiskStates ? (paidPercent >= 80 ? "Amarillo" : "Rojo") : "Verde",
      comment: topStatus
        ? `Predomina ${topStatus.label} con ${topStatus.count} registros.`
        : "No hay estado disponible para evaluar.",
    },
    {
      indicator: "Concentración mensual",
      ...buildSemaphore(
        concentrationMonth,
        topMonth ? `${topMonth.month} concentra ${formatMoneyByCurrency(topMonth.amount, topMonth.currency ?? primaryCurrency)}.` : "Sin distribución mensual suficiente.",
      ),
    },
    {
      indicator: "Concentración por proyecto",
      ...buildSemaphore(concentrationProject, topProject ? `${topProject.label} concentra ${topProject.participation.toFixed(2)}% del total.` : "Sin proyecto principal identificado."),
    },
    {
      indicator: "Concentración por solicitante",
      ...buildSemaphore(concentrationSolicitante, topSolicitante ? `${topSolicitante.label} concentra ${topSolicitante.participation.toFixed(2)}% del total.` : "Sin solicitante principal identificado."),
    },
    {
      indicator: "Seguimiento operativo",
      state: hasNegative || hasRiskStates ? "Amarillo" : "Verde",
      comment: hasNegative
        ? "Existen montos negativos que requieren validación."
        : hasRiskStates
          ? "Se recomienda seguimiento a estados no pagados."
          : "El comportamiento operativo luce controlado con la información disponible.",
    },
  ];

  const primarySubject = topResponsable?.label || topClient?.label || topProject?.label || "Selección actual";
  const summaryRows = buildKeyValueExportRows([
    ["Responsable / cliente / proyecto analizado", primarySubject],
    ["Periodo evaluado", period],
    ["Total general", hasMultipleCurrencies ? "No consolidado por mezcla de monedas" : formatMoneyByCurrency(totalAmount, primaryCurrency)],
    ["Cantidad de registros", totalRecords],
    ["Estado principal", topStatus?.label ?? "Sin estado"],
    ["Monedas identificadas", currenciesLabel],
    ...(hasMultipleCurrencies
      ? currencies.map((item) => [item.label, formatMoneyByCurrency(item.amount, item.label)] as [string, string])
      : []),
    ...(hasMultipleCurrencies ? [["Desglose por moneda", currencyTotalsLabel] as [string, string]] : []),
    ["Cobertura del análisis", metric === "ventas"
      ? `${baseRecords} filas fuente y ${totalRecords} operaciones únicas OT + Site`
      : `${totalRecords} registros analizados`],
  ]);

  const kpiRows = [
    {
      Indicador: "Total analizado",
      Resultado: hasMultipleCurrencies
        ? "No consolidado por mezcla de monedas"
        : formatMoneyByCurrency(totalAmount, primaryCurrency),
    },
    { Indicador: "Total registros", Resultado: String(totalRecords) },
    { Indicador: "% pagado", Resultado: `${paidPercent.toFixed(2)}%` },
    {
      Indicador: "Desglose por moneda",
      Resultado: currencies.length > 0
        ? currencies.map((item) => `${item.label}: ${formatMoneyByCurrency(item.amount, item.label)}`).join(" | ")
        : "Sin dato",
    },
    {
      Indicador: "Mes con mayor monto",
      Resultado: topMonth ? `${topMonth.month} (${formatMoneyByCurrency(topMonth.amount, topMonth.currency ?? primaryCurrency)})` : "Sin dato",
    },
    { Indicador: "Proyecto principal", Resultado: topProject ? topProject.label : "Sin dato" },
    { Indicador: "Solicitante principal", Resultado: topSolicitante ? topSolicitante.label : "Sin dato" },
    { Indicador: "Site principal", Resultado: topSite ? topSite.label : "Sin dato" },
  ];

  const monthTable = monthRows.map((item) => ({
    Mes: item.month,
    ...(hasMultipleCurrencies ? { Moneda: item.currency ?? primaryCurrency } : {}),
    Monto: formatMoneyByCurrency(item.amount, item.currency ?? primaryCurrency),
  }));

  const projectTable = projectRows.map((item) => ({
    Proyecto: item.label,
    ...(hasMultipleCurrencies ? { Moneda: item.currency ?? primaryCurrency } : {}),
    Monto: formatMoneyByCurrency(item.amount, item.currency ?? primaryCurrency),
    Participación: `${item.participation.toFixed(2)}%`,
  }));

  const solicitanteTable = solicitanteRows.map((item) => ({
    Solicitante: item.label,
    ...(hasMultipleCurrencies ? { Moneda: item.currency ?? primaryCurrency } : {}),
    Monto: formatMoneyByCurrency(item.amount, item.currency ?? primaryCurrency),
    Participación: `${item.participation.toFixed(2)}%`,
  }));

  const siteTable = siteRows.map((item) => ({
    Ranking: item.Ranking,
    Site: item.label,
    ...(hasMultipleCurrencies ? { Moneda: item.currency ?? primaryCurrency } : {}),
    Monto: formatMoneyByCurrency(item.amount, item.currency ?? primaryCurrency),
  }));

  const currencyTable = currencies.map((item) => ({
    Moneda: item.label,
    Monto: formatMoneyByCurrency(item.amount, item.label === "DOLARES" || item.label === "USD" ? "USD" : item.label),
    Participación: `${item.participation.toFixed(2)}%`,
  }));

  const semaphoreTable = semaphore.map((item) => ({
    Indicador: item.indicator,
    Estado: item.state,
    Comentario: item.comment,
  }));

  const executiveReading = [
    hasMultipleCurrencies
      ? `La data mezcla monedas, por lo que el analisis se separa en: ${currencyTotalsLabel}.`
      : null,
    topMonth ? `El mes con mayor concentración es ${topMonth.month}, con ${formatMoneyByCurrency(topMonth.amount, topMonth.currency ?? primaryCurrency)}.` : null,
    topProject ? `El proyecto principal es ${topProject.label}, con una participación de ${topProject.participation.toFixed(2)}% del total analizado.` : null,
    topSolicitante ? `El solicitante con mayor participación es ${topSolicitante.label}, lo que sugiere un punto prioritario de seguimiento.` : null,
    topSite ? `El site de mayor impacto es ${topSite.label}, que concentra ${formatMoneyByCurrency(topSite.amount, topSite.currency ?? primaryCurrency)}.` : null,
  ].filter(Boolean).join(" ");

  const conclusion = topProject
    ? `La gestión se concentra principalmente en ${topProject.label}. Conviene monitorear semanalmente su evolución y validar el comportamiento de ${topSolicitante?.label ?? "los solicitantes principales"} para sostener control gerencial.`
    : "La información disponible permite un seguimiento general, pero se recomienda profundizar el análisis por proyecto o responsable para una lectura gerencial más precisa.";

  const recommendations = [
    topProject ? `Dar seguimiento semanal al proyecto ${topProject.label} por su mayor participación.` : null,
    topSolicitante ? `Revisar la concentración económica del solicitante ${topSolicitante.label}.` : null,
    topSite ? `Monitorear el impacto operativo del site ${topSite.label}.` : null,
    hasRiskStates ? "Revisar los registros no pagados o con estados de seguimiento antes del próximo corte." : "Mantener el control de estados para sostener el nivel de pago observado.",
    metric === "ventas"
      ? "Validar la continuidad comercial comparando ventas contra gasto o rentabilidad cuando corresponda."
      : "Separar el análisis por cliente, proyecto o estado para reforzar la toma de decisiones.",
  ].filter((item): item is string => Boolean(item)).slice(0, 5);

  return {
    metric,
    currency: primaryCurrency,
    hasMultipleCurrencies,
    currencyTotals: currencies.map((item) => ({
      Moneda: item.label,
      Monto: formatMoneyByCurrency(item.amount, item.label),
      Registros: item.count,
      Participacion: `${item.participation.toFixed(2)}%`,
    })),
    period,
    summaryRows,
    kpiRows,
    monthTable,
    projectTable,
    solicitanteTable,
    siteTable,
    currencyTable,
    semaphoreTable,
    executiveReading,
    conclusion,
    recommendations,
    monthChartRows: monthRows.map((item) => ({ label: item.month, amount: item.amount })),
    projectChartRows: projectRows.map((item) => ({ label: item.label, amount: item.amount, participation: item.participation })),
    solicitanteChartRows: solicitanteRows.map((item) => ({ label: item.label, amount: item.amount, participation: item.participation })),
    siteChartRows: siteRows.map((item) => ({ label: item.label, amount: item.amount })),
    annexRows: detailSourceRowsFromRaw(metricRows),
  };
}

function detailSourceRowsFromRaw(rows: Record<string, unknown>[]) {
  return buildDetailedGridRows(rows);
}

function getModuleBadgeStyles(enabled: boolean): CSSProperties {
  return enabled
    ? {
        background: "#ECFDF5",
        color: "#166534",
        border: "1px solid #A7F3D0",
      }
    : {
        background: "#FFF7ED",
        color: "#9A3412",
        border: "1px solid #FED7AA",
      };
}

function createInitialThread(module: IaChatModuleInfo): IaChatMessage[] {
  return [module.enabled ? GASTOS_INITIAL_MESSAGE : PENDING_MESSAGE(module)];
}

function buildDetailColumns(rows?: Record<string, unknown>[]) {
  if (!rows || rows.length === 0) {
    return [];
  }

  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key.startsWith("__")) {
        continue;
      }
      if (!columns.includes(key)) {
        columns.push(key);
      }
    }
  }

  return columns;
}

const DETAIL_GRID_COLUMNS = [
  "IdPlanilla",
  "Fecha",
  "Detalle",
  "Comentario",
  "Estado",
  "Cliente",
  "Proyecto",
  "IdSite",
  "Site",
  "Ot",
  "Ventas",
  "Responsable",
  "Solicitante",
  "Bien",
  "Comprobante",
  "TipoPago",
  "Moneda",
  "Subtotal",
  "Igv",
  "Total",
  "IdOc",
] as const;

function buildDetailedGridRows(rows: Record<string, unknown>[]) {
  return rows.map((row) => ({
    IdPlanilla: getCaseInsensitiveValue(row, "IdPlanilla") ?? getCaseInsensitiveValue(row, "IDPLANILLA") ?? null,
    Fecha: getCaseInsensitiveValue(row, "Fecha") ?? getCaseInsensitiveValue(row, "FECHA") ?? getCaseInsensitiveValue(row, "FechaIngresoTexto") ?? null,
    Detalle: getCaseInsensitiveValue(row, "Detalle") ?? null,
    Comentario: getCaseInsensitiveValue(row, "Comentario") ?? null,
    Estado: getCaseInsensitiveValue(row, "Estado") ?? null,
    Cliente: getCaseInsensitiveValue(row, "Cliente") ?? null,
    Proyecto: getCaseInsensitiveValue(row, "Proyecto") ?? null,
    IdSite: getCaseInsensitiveValue(row, "IdSite") ?? null,
    Site: getCaseInsensitiveValue(row, "Site") ?? getCaseInsensitiveValue(row, "Sitio") ?? null,
    Ot: getCaseInsensitiveValue(row, "Ot") ?? getCaseInsensitiveValue(row, "OT") ?? null,
    Ventas: getCaseInsensitiveValue(row, "Ventas") ?? null,
    Responsable: getCaseInsensitiveValue(row, "Responsable") ?? null,
    Solicitante: getCaseInsensitiveValue(row, "Solicitante") ?? null,
    Bien: getCaseInsensitiveValue(row, "Bien") ?? null,
    Comprobante: getCaseInsensitiveValue(row, "Comprobante") ?? null,
    TipoPago: getCaseInsensitiveValue(row, "TipoPago") ?? null,
    Moneda: getCaseInsensitiveValue(row, "Moneda") ?? null,
    Subtotal: getCaseInsensitiveValue(row, "Subtotal") ?? getCaseInsensitiveValue(row, "SubTotal") ?? null,
    Igv: getCaseInsensitiveValue(row, "Igv") ?? getCaseInsensitiveValue(row, "IGV") ?? null,
    Total: getCaseInsensitiveValue(row, "Total") ?? null,
    IdOc: getCaseInsensitiveValue(row, "IdOc") ?? getCaseInsensitiveValue(row, "IDOC") ?? null,
  }));
}

function summarizeNumericEntries(summary?: Record<string, unknown>) {
  if (!summary) {
    return [];
  }

  return Object.entries(summary)
    .filter(([, value]) => typeof value === "number")
    .slice(0, 6)
    .map(([label, value]) => ({
      label,
      value: value as number,
    }));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function resolveFieldValue(row: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = getCaseInsensitiveValue(row, field);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
}

function resolveNumericField(row: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = getCaseInsensitiveValue(row, field);
    if (value === undefined || value === null || value === "") {
      continue;
    }

    const numericValue = normalizeNumericValue(value);
    if (numericValue !== 0 || value === 0 || value === "0" || value === "0.00") {
      return numericValue;
    }
  }

  return 0;
}

function buildSiteExecutiveCards(rows: Record<string, unknown>[], metric: "ventas" | "gastos") {
  const grouped = new Map<
    string,
    {
      key: string;
      cliente: string;
      proyecto: string;
      site: string;
      amount: number;
      amountLabel: string;
      totalAcumulado: number;
      saldoReferencial: number;
      usedPercent: number;
    }
  >();

  const amountField = resolveMetricAmountField(metric);
  const amountLabel = metric === "ventas" ? "Ventas" : "Subtotal";

  for (const row of rows) {
    const cliente = formatValue(resolveFieldValue(row, ["Cliente", "cliente"])) || "Sin cliente";
    const proyecto = formatValue(resolveFieldValue(row, ["Proyecto", "proyecto"])) || "Sin proyecto";
    const site = formatValue(resolveFieldValue(row, ["Site", "Sitio", "site", "sitio"])) || "Sin sitio";
    const key = `${cliente}||${proyecto}||${site}`;
    const amount = resolveNumericField(row, [amountField, amountField.toLowerCase()]);
    const totalAcumulado = resolveNumericField(row, ["ConPagadoSoles", "ConPagado", "Con Pagado", "conPagado", "con_pagado"]);

    const current = grouped.get(key) ?? {
      key,
      cliente,
      proyecto,
      site,
      amount: 0,
      amountLabel,
      totalAcumulado: 0,
      saldoReferencial: 0,
      usedPercent: 0,
    };

    current.amount += amount;
    current.totalAcumulado += totalAcumulado;
    current.saldoReferencial = current.amount - current.totalAcumulado;
    current.usedPercent = current.amount > 0 ? (current.totalAcumulado / current.amount) * 100 : 0;
    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .sort((left, right) => {
      const clienteCompare = left.cliente.localeCompare(right.cliente, "es", { sensitivity: "base" });
      if (clienteCompare !== 0) return clienteCompare;

      const proyectoCompare = left.proyecto.localeCompare(right.proyecto, "es", { sensitivity: "base" });
      if (proyectoCompare !== 0) return proyectoCompare;

      return left.site.localeCompare(right.site, "es", { sensitivity: "base" });
    })
    .map((item) => ({
      ...item,
      usedPercent: Math.max(0, Math.min(100, item.usedPercent)),
    }));
}

function buildSiteExecutiveCardsFromSummary(summary?: Record<string, unknown>) {
  const rawCards = summary?.executiveCards;
  if (!Array.isArray(rawCards)) {
    return [];
  }

  return rawCards
    .filter((card): card is Record<string, unknown> => Boolean(card) && typeof card === "object")
    .map((card) => ({
      key: formatValue(card.key ?? `${formatValue(card.cliente)}||${formatValue(card.proyecto)}||${formatValue(card.site)}`),
      cliente: formatValue(card.cliente ?? "Sin cliente"),
      proyecto: formatValue(card.proyecto ?? "Sin proyecto"),
      site: formatValue(card.site ?? "Sin sitio"),
      amount: normalizeNumericValue(card.amount ?? card.montoOc),
      amountLabel: formatValue(card.amountLabel ?? "Subtotal"),
      totalAcumulado: normalizeNumericValue(card.totalAcumulado),
      saldoReferencial: normalizeNumericValue(card.saldoReferencial),
      usedPercent: Math.max(0, Math.min(100, normalizeNumericValue(card.usedPercent))),
    }));
}

function buildExecutiveRowsFromSiteCards(cards: ReturnType<typeof buildSiteExecutiveCards>, metric: "ventas" | "gastos") {
  const amountLabel = metric === "ventas" ? "Ventas" : "Subtotal";
  return cards.map((card) => ({
    Cliente: card.cliente,
    Proyecto: card.proyecto,
    Site: card.site,
    [amountLabel]: card.amount,
    "Total acumulado del sitio": card.totalAcumulado,
    "Saldo referencial despues del sitio": card.saldoReferencial,
    "Uso %": `${card.usedPercent.toFixed(2)}%`,
  }));
}

function normalizeNumericValue(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/s\/\.\s*/gi, "").replace(/\$/g, "").replace(/,/g, "").trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function getCaseInsensitiveValue(row: Record<string, unknown>, field: string) {
  const exact = row[field];
  if (exact !== undefined) {
    return exact;
  }

  const matchedKey = Object.keys(row).find((key) => key.toLowerCase() === field.toLowerCase());
  return matchedKey ? row[matchedKey] : undefined;
}

function buildChartData(response: IaChatResponse) {
  if (!response.chart) {
    return [];
  }

  return response.chart.rows.map((row) => {
    const categoryValue = getCaseInsensitiveValue(row, response.chart!.categoryField);
    const numericValue = normalizeNumericValue(getCaseInsensitiveValue(row, response.chart!.valueField));

    return {
      ...row,
      __category: categoryValue ?? "Sin dato",
      __value: Number.isFinite(numericValue) ? numericValue : 0,
    };
  }).filter((row) => row.__category !== "Sin dato" || row.__value !== 0);
}

function buildExecutiveRowsFromChart(response: IaChatResponse) {
  if (!response.chart) {
    return [];
  }

  const categoryLabel = response.chart.categoryField;
  const valueLabel = response.chart.valueField;

  return response.chart.rows.map((row) => {
    const categoryValue = getCaseInsensitiveValue(row, categoryLabel);
    const numericValue = normalizeNumericValue(getCaseInsensitiveValue(row, valueLabel));
    const countKey = Object.keys(row).find((key) => /cantidad|registros|count|nro/i.test(key));
    const percentageKey = Object.keys(row).find((key) => /porcentaje|pct|%/i.test(key));

    return {
      [categoryLabel]: categoryValue ?? "Sin dato",
      [valueLabel]: numericValue,
      ...(countKey ? { [countKey]: row[countKey] } : {}),
      ...(percentageKey ? { [percentageKey]: row[percentageKey] } : {}),
      __category: formatValue(categoryValue ?? "Sin dato"),
      __value: numericValue,
      __raw: row,
    };
  }).filter((row) => row.__category !== "Sin dato" || row.__value !== 0);
}

function buildDisplayFilters(response: IaChatResponse) {
  const source = response.interpretedFilters;
  if (!source || typeof source !== "object") {
    return [];
  }

  const hiddenKeys = new Set([
    "module",
    "conversationId",
    "currentDateTime",
    "timeZone",
    "toolName",
    "responseType",
    "routingMode",
    "analysisIntent",
    "question",
    "followUpIntent",
    "reusedLastResult",
  ]);

  const filters: Array<{ label: string; value: unknown }> = [];

  for (const [key, value] of Object.entries(source)) {
    if (hiddenKeys.has(key)) {
      continue;
    }

    if (key === "toolParameters" && value && typeof value === "object" && !Array.isArray(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
        if (nestedValue === null || nestedValue === undefined || nestedValue === "" || nestedValue === false) {
          continue;
        }

        filters.push({
          label: nestedKey,
          value: nestedValue,
        });
      }

      continue;
    }

    if (value === null || value === undefined || value === "" || value === false) {
      continue;
    }

    filters.push({
      label: key,
      value,
    });
  }

  return filters;
}

function normalizeExecutiveRows(rows: Record<string, unknown>[]) {
  const normalizedRows = rows.map((row) => {
    const groupKey =
      Object.keys(row).find((key) => /categoria|grupo|estado|cliente|proyecto|responsable|solicitante|site|sitio|mes|ot/i.test(key)) ??
      Object.keys(row)[0];
    const countKey =
      Object.keys(row).find((key) => /cantidad|registros|count|nro/i.test(key)) ??
      Object.keys(row).find((key) => typeof row[key] === "number");
    const totalKey =
      Object.keys(row).find((key) => /total|monto|importe|valor|saldo|subtotal|pagado|conpagado|subtotalsoles|totalsoles/i.test(key)) ??
      Object.keys(row).find((key) => typeof row[key] === "number" && key !== countKey);
    const percentageKey =
      Object.keys(row).find((key) => /porcentaje|pct|%/i.test(key));

    return {
      Categoria: formatValue(row[groupKey]),
      Registros: countKey ? row[countKey] : null,
      Monto: totalKey ? row[totalKey] : null,
      Porcentaje: percentageKey ? row[percentageKey] : null,
      __category: formatValue(row[groupKey]),
      __value: totalKey ? Number(String(row[totalKey] ?? 0).replace(/,/g, "")) || 0 : 0,
      __raw: row,
    };
  });

  return normalizedRows;
}

function aggregateDetailRows(rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    return [];
  }

  const preferredGroupKeys = [
    "Responsable",
    "Solicitante",
    "Cliente",
    "Proyecto",
    "Site",
    "Sitio",
    "Estado",
    "Mes",
    "Ot",
  ];

  const sampleRow = rows[0];
  const groupKey =
    preferredGroupKeys.find((candidate) => Object.keys(sampleRow).some((key) => key.toLowerCase() === candidate.toLowerCase())) ??
    Object.keys(sampleRow).find((key) => /responsable|solicitante|cliente|proyecto|site|sitio|estado|mes|ot/i.test(key)) ??
    Object.keys(sampleRow)[0];

  const amountKey =
    Object.keys(sampleRow).find((key) => /total|monto|importe|valor|saldo|subtotal|pagado|conpagado|suboc|subplanilla/i.test(key)) ??
    Object.keys(sampleRow).find((key) => typeof sampleRow[key] === "number" && key !== groupKey);

  const groups = new Map<string, { label: string; count: number; amount: number }>();

  for (const row of rows) {
    const label = formatValue(row[groupKey]);
    const current = groups.get(label) ?? { label, count: 0, amount: 0 };
    current.count += 1;

    if (amountKey) {
      const rawValue = row[amountKey];
      const numericValue = typeof rawValue === "number" ? rawValue : Number(String(rawValue ?? 0).replace(/,/g, ""));
      if (Number.isFinite(numericValue)) {
        current.amount += numericValue;
      }
    }

    groups.set(label, current);
  }

  const totalAmount = Array.from(groups.values()).reduce((acc, item) => acc + item.amount, 0);

  return Array.from(groups.values())
    .map((item) => ({
      Categoria: item.label,
      Registros: item.count,
      Monto: amountKey ? item.amount : item.count,
      Porcentaje: totalAmount > 0 ? `${Math.round((item.amount / totalAmount) * 100)}%` : "-",
      __category: item.label,
      __value: amountKey ? item.amount : item.count,
    }))
    .sort((a, b) => Number(b.__value) - Number(a.__value));
}

function getChartTitle(chartType: IaChatChartType) {
  return chartType === "pie"
    ? "Distribucion"
    : chartType === "line"
      ? "Tendencia"
      : "Comparacion";
}

function MessageBubble({ message }: { message: IaChatMessage }) {
  const isAssistant = message.role === "assistant";

  return (
    <div
      style={{
        ...styles.messageRow,
        ...(isAssistant ? styles.messageRowAssistant : styles.messageRowUser),
      }}
    >
      {isAssistant && (
        <div style={{ ...styles.avatar, ...styles.avatarAssistant }}>
          <Bot size={16} />
        </div>
      )}

      <div
        style={{
          ...styles.messageBubble,
          ...(isAssistant ? styles.assistantBubble : styles.userBubble),
          ...(message.tone === "error" ? styles.errorBubble : {}),
        }}
      >
        {message.title && <div style={styles.messageTitle}>{message.title}</div>}
        {isAssistant && message.tone !== "error" ? (
          <div style={styles.assistantNarrativeCard}>
            <div style={styles.assistantNarrativeLabel}>Resumen contextual</div>
            <div style={styles.assistantNarrativeText}>{message.text}</div>
          </div>
        ) : (
          <div style={styles.messageText}>{message.text}</div>
        )}
        {message.response?.success && <StructuredResponseBlock response={message.response} />}
      </div>

      {!isAssistant && (
        <div style={{ ...styles.avatar, ...styles.avatarUser }}>
          <MessageSquareText size={16} />
        </div>
      )}
    </div>
  );
}

function StructuredResponseBlock({ response }: { response: IaChatResponse }) {
  const [showExecutive, setShowExecutive] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showDetailedGrid, setShowDetailedGrid] = useState(false);
  const [reportPreviewHtml, setReportPreviewHtml] = useState<string | null>(null);
  const [reportPreviewTitle, setReportPreviewTitle] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isExportingReportPdf, setIsExportingReportPdf] = useState(false);
  const [isExportingDetailExcel, setIsExportingDetailExcel] = useState(false);
  const autoExportKeyRef = useRef<string | null>(null);
  const reportPreviewRef = useRef<HTMLDivElement | null>(null);
  const rawRows = response.detailRows ?? [];
  const reportMetric = detectReportMetric(response);
  const detailedGridRows = buildDetailedGridRows(rawRows);
  const summaryExecutiveCards = buildSiteExecutiveCardsFromSummary(response.summary).map((card) => ({
    ...card,
    amountLabel: card.amountLabel || (reportMetric === "ventas" ? "Ventas" : "Subtotal"),
  }));
  const followUpIntent = typeof response.interpretedFilters?.followUpIntent === "string"
    ? response.interpretedFilters.followUpIntent
    : null;
  const isNoResultsSample = Boolean(response.interpretedFilters?.noResultsSample);
  const chartData = buildChartData(response);
  const chartExecutiveRows = buildExecutiveRowsFromChart(response);
  const executiveRows = response.responseType === "detail"
    ? summaryExecutiveCards.length > 0
      ? buildExecutiveRowsFromSiteCards(summaryExecutiveCards as ReturnType<typeof buildSiteExecutiveCards>, reportMetric)
      : aggregateDetailRows(rawRows)
    : chartExecutiveRows.length > 0
      ? chartExecutiveRows
      : normalizeExecutiveRows(rawRows);
  const siteExecutiveCards = summaryExecutiveCards.length > 0 ? summaryExecutiveCards : buildSiteExecutiveCards(rawRows, reportMetric);
  const detailColumns = buildDetailColumns(executiveRows);
  const numericSummary = summarizeNumericEntries(response.summary);
  const displayFilters = buildDisplayFilters(response);
  const executiveChartData = response.chart && chartData.length > 0 ? chartData : [];
  const executiveChartConfig = response.chart && chartData.length > 0 ? response.chart : null;
  const shouldShowChart = executiveChartConfig !== null && executiveChartData.length > 0;
  const shouldShowExecutiveSummary = showExecutive && siteExecutiveCards.length > 0 && !isNoResultsSample;
  const shouldShowTable = (showDetail && rawRows.length > 0) || (isNoResultsSample && rawRows.length > 0);
  const shouldShowDetailedGrid = showDetailedGrid && detailedGridRows.length > 0 && !isNoResultsSample;
  const canShowDetailedGrid = detailedGridRows.length > 0 && !isNoResultsSample;
  const executiveRecordCount = typeof response.totalRows === "number" ? response.totalRows : rawRows.length;
  const canExport = response.success && (
    rawRows.length > 0 ||
    executiveRows.length > 0 ||
    executiveChartData.length > 0 ||
    numericSummary.length > 0 ||
    displayFilters.length > 0 ||
    Boolean(response.answer)
  );

  const handleReportPreview = async () => {
    if (!canExport || isGeneratingReport) {
      return;
    }

    setIsGeneratingReport(true);

    try {
      const dashboardData = buildDashboardStructuredData(response);
      const exportResponse = await exportarDashboardIaChat({
        module: response.module,
        question: getDashboardQuestion(response),
        contextualSummary: response.answer,
        structuredDataJson: JSON.stringify(dashboardData),
        conversationId:
          typeof response.interpretedFilters?.conversationId === "string"
            ? response.interpretedFilters.conversationId
            : null,
        responseType: response.responseType,
      });

      if (!exportResponse.success || !exportResponse.htmlContent) {
        throw new Error(exportResponse.errorMessage || "No fue posible generar el dashboard ejecutivo.");
      }

      setReportPreviewHtml(injectDashboardFallbacksIntoHtml(exportResponse.htmlContent, dashboardData));
      setReportPreviewTitle(
        exportResponse.fileName?.trim()
          ? exportResponse.fileName.trim().replace(/\.(pdf|html?)$/i, "")
          : "Reporte gerencial generado por Claude",
      );
    } catch (error) {
      window.alert(getIaChatErrorMessage(error));
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleReportPdfExport = async () => {
    if (!reportPreviewHtml || isExportingReportPdf) {
      return;
    }

    setIsExportingReportPdf(true);

    try {
      const previewIframe = reportPreviewRef.current?.querySelector("iframe") as HTMLIFrameElement | null;
      const previewWidth = previewIframe?.getBoundingClientRect().width ?? reportPreviewRef.current?.getBoundingClientRect().width ?? 1440;
      const fileName = sanitizePdfFileName(
        `${reportPreviewTitle?.trim() ? reportPreviewTitle.trim() : `reporte-gerencial-${response.module.toLowerCase()}`}.pdf`,
      );
      await exportDashboardHtmlAsPdf(reportPreviewHtml, fileName, previewWidth);
    } catch (error) {
      window.alert(getIaChatErrorMessage(error));
    } finally {
      setIsExportingReportPdf(false);
    }
  };

  const handleDetailExcelExport = async () => {
    if (detailedGridRows.length === 0 || isExportingDetailExcel) {
      return;
    }

    setIsExportingDetailExcel(true);

    try {
      const XLSX = await import("xlsx");
      const exportRows = detailedGridRows.map((row) => {
        const ordered: Record<string, unknown> = {};
        for (const column of DETAIL_GRID_COLUMNS) {
          ordered[column] = row[column] ?? null;
        }
        return ordered;
      });

      const worksheet = XLSX.utils.json_to_sheet(exportRows, {
        header: [...DETAIL_GRID_COLUMNS],
      });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Detalle");
      XLSX.writeFile(workbook, `iachat_detalle_${response.module.toLowerCase()}_${Date.now()}.xlsx`);
    } finally {
      setIsExportingDetailExcel(false);
    }
  };

  useEffect(() => {
    setShowDetail(false);
    setShowExecutive(false);
    setShowDetailedGrid(false);
    setReportPreviewHtml(null);
    setReportPreviewTitle(null);
    autoExportKeyRef.current = null;
  }, [response.answer, response.responseType, response.totalRows]);

  useEffect(() => {
    if (followUpIntent !== "export_report" && followUpIntent !== "view_executive") {
      return;
    }

    if (followUpIntent !== "export_report") {
      setShowExecutive(true);
      return;
    }

    const exportKey = `${response.responseType ?? "response"}|${response.totalRows ?? 0}|${response.answer}`;
    if (autoExportKeyRef.current === exportKey) {
      return;
    }

    autoExportKeyRef.current = exportKey;
    void handleReportPreview();
  }, [followUpIntent, response.answer, response.responseType, response.totalRows]);

  useEffect(() => {
    if (!reportPreviewHtml || !reportPreviewRef.current) {
      return;
    }

    reportPreviewRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [reportPreviewHtml]);

  return (
    <div style={styles.responseStack}>
      <div style={styles.responseMeta}>
        <div style={styles.responseMetaChips}>
          <span style={styles.metaChip}>
            {response.responseType === "detail"
              ? "Detalle"
              : response.responseType === "summary"
                ? "Resumen"
                : response.responseType === "chart"
                  ? "Grafico"
                  : "Respuesta"}
          </span>
          {typeof response.totalRows === "number" && (
            <span style={styles.metaChip}>Filas: {response.totalRows}</span>
          )}
          {isNoResultsSample && (
            <span style={styles.metaChip}>Muestra top 5</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void handleReportPreview()}
          disabled={!canExport || isGeneratingReport}
          style={{
            ...styles.executiveFormatButton,
            ...(!canExport || isGeneratingReport ? styles.executiveFormatButtonDisabled : {}),
          }}
        >
          <Sparkles size={14} />
          {isGeneratingReport ? "Generando formato..." : "Ver formato ejecutivo"}
        </button>
        <button
          type="button"
          onClick={() => setShowDetailedGrid((current) => !current)}
          disabled={!canShowDetailedGrid}
          style={{
            ...styles.detailToggleButton,
            ...(!canShowDetailedGrid ? styles.executiveFormatButtonDisabled : {}),
          }}
        >
          {showDetailedGrid ? "Ocultar detalle" : "Mostrar detalle"}
        </button>
      </div>

      {numericSummary.length > 0 && (
        <div style={styles.kpiGrid}>
          {numericSummary.map((item) => (
            <div key={item.label} style={styles.kpiCard}>
              <div style={styles.kpiLabel}>{item.label}</div>
              <div style={styles.kpiValue}>{formatValue(item.value)}</div>
            </div>
          ))}
        </div>
      )}

      {shouldShowChart && (
        <ExecutiveChartBlock
          chart={executiveChartConfig}
          data={executiveChartData}
        />
      )}

      {shouldShowExecutiveSummary && (
        <ExecutiveSummaryBlock
          cards={siteExecutiveCards}
          columns={detailColumns}
          rows={executiveRows}
          totalRows={executiveRecordCount}
          detailOpen={showDetail}
          metric={reportMetric}
          onToggleDetail={() => setShowDetail((current) => !current)}
        />
      )}

      {shouldShowTable && (
        <>
          {isNoResultsSample && (
            <div style={{ marginTop: 8, marginBottom: 8, color: "#0F766E", fontSize: 13, fontWeight: 600 }}>
              Consulta no obtiene resultados, validar la informacion solicitada. Se adjunta muestra de los campos que pueden utilizar en su consulta.
            </div>
          )}
          <DetailTable
            columns={buildDetailColumns(rawRows)}
            rows={rawRows}
            title={isNoResultsSample ? "Muestra de campos disponibles (top 5)" : "Detalle completo"}
          />
        </>
      )}

      {shouldShowDetailedGrid && (
        <div style={styles.detailGridWrapper}>
          <div style={styles.detailGridHeader}>
            <div style={styles.sectionBoxTitle}>Detalle para exportar</div>
            <button
              type="button"
              onClick={() => void handleDetailExcelExport()}
              disabled={isExportingDetailExcel}
              style={{
                ...styles.exportButton,
                ...(isExportingDetailExcel ? styles.exportButtonDisabled : {}),
              }}
            >
              <Download size={14} />
              {isExportingDetailExcel ? "Exportando Excel..." : "Exportar Excel"}
            </button>
          </div>
          <DetailTable
            columns={[...DETAIL_GRID_COLUMNS]}
            rows={detailedGridRows}
            title="Detalle completo de registros"
          />
        </div>
      )}

      {reportPreviewHtml && (
        <div ref={reportPreviewRef} style={styles.reportPreviewWrapper}>
          <div style={styles.reportPreviewHeader}>
            <div>
              <div style={styles.sectionBoxTitle}>Reporte gerencial</div>
              <div style={styles.reportPreviewSubtitle}>
                {reportPreviewTitle ?? "Vista previa generada por Claude"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleReportPdfExport()}
              disabled={!reportPreviewHtml || isExportingReportPdf}
              style={{
                ...styles.exportButton,
                ...(!reportPreviewHtml || isExportingReportPdf ? styles.exportButtonDisabled : {}),
              }}
            >
              <Download size={14} />
              {isExportingReportPdf ? "Exportando PDF..." : "Exportar PDF"}
            </button>
            <button
              type="button"
              onClick={() => {
                setReportPreviewHtml(null);
                setReportPreviewTitle(null);
              }}
              style={styles.reportPreviewCloseButton}
            >
              <X size={14} />
              Cerrar vista previa
            </button>
          </div>
          <div style={styles.reportPreviewFrameShell}>
            <iframe
              title="Reporte gerencial Claude"
              srcDoc={reportPreviewHtml}
              sandbox="allow-scripts allow-same-origin"
              style={styles.reportPreviewFrame}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ExecutiveSummaryBlock({
  cards,
  columns,
  rows,
  totalRows,
  detailOpen,
  metric,
  onToggleDetail,
}: {
  cards: ReturnType<typeof buildSiteExecutiveCards>;
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
  detailOpen: boolean;
  metric: "ventas" | "gastos";
  onToggleDetail: () => void;
}) {
  const hasMoreThanFive = totalRows > 5;
  const scorecards = cards;
  const tableColumns = buildExecutiveTableColumns(columns, rows);

  return (
    <div style={styles.executiveCard}>
      <div style={styles.executiveHeader}>
        <div>
          <div style={styles.sectionBoxTitle}>Cuadro ejecutivo</div>
          <div style={styles.executiveSubtitle}>
            {hasMoreThanFive
              ? `Mostrando ${scorecards.length} cuadros agrupados desde ${totalRows} registros.`
              : `Mostrando ${scorecards.length} cuadros agrupados.`}
          </div>
        </div>
        <div style={styles.executiveActions}>
          <div style={detailOpen ? styles.executiveModeDetail : styles.executiveModeExecutive}>
            {detailOpen ? "Detalle completo" : "Vista ejecutiva"}
          </div>
          <div style={styles.executiveBadge}>
            {scorecards.length > 5 ? "Top 5" : "Completo"}
          </div>
          <button type="button" onClick={onToggleDetail} style={styles.detailToggleButton}>
            {detailOpen ? "Volver a ejecutivo" : "Abrir detalle"}
          </button>
        </div>
      </div>

      <div style={styles.executiveCardsGrid}>
        {scorecards.map((card) => (
          <div key={card.key} style={styles.siteExecutiveCard}>
            <div style={styles.siteExecutiveHeader}>
              <div style={styles.siteExecutiveField}>
                <div style={styles.siteExecutiveFieldLabel}>Cliente</div>
                <div style={styles.siteExecutiveFieldValue}>{card.cliente}</div>
              </div>
              <div style={styles.siteExecutiveField}>
                <div style={styles.siteExecutiveFieldLabel}>Proyecto</div>
                <div style={styles.siteExecutiveFieldValue}>{card.proyecto}</div>
              </div>
              <div style={styles.siteExecutiveField}>
                <div style={styles.siteExecutiveFieldLabel}>Site</div>
                <div style={styles.siteExecutiveFieldValue}>{card.site}</div>
              </div>
            </div>

            <div style={styles.siteExecutiveMetrics}>
              <div style={styles.siteExecutiveMetric}>
                <div style={styles.siteExecutiveMetricLabel}>{card.amountLabel ?? (metric === "ventas" ? "Ventas" : "Subtotal")}</div>
                <div style={styles.siteExecutiveMetricValue}>{formatCurrency(card.amount)}</div>
              </div>
              <div style={styles.siteExecutiveMetric}>
                <div style={styles.siteExecutiveMetricLabel}>Total acumulado del sitio</div>
                <div style={styles.siteExecutiveMetricValue}>{formatCurrency(card.totalAcumulado)}</div>
              </div>
            </div>

            <div style={styles.siteExecutiveProgressBlock}>
              <div style={styles.siteExecutiveProgressTrack}>
                <div
                  style={{
                    ...styles.siteExecutiveProgressFill,
                    width: `${Math.max(0, Math.min(100, card.usedPercent))}%`,
                  }}
                />
              </div>
              <div style={styles.siteExecutiveProgressRow}>
                <span style={styles.siteExecutiveProgressPercent}>{card.usedPercent.toFixed(2)}%</span>
                <span style={styles.siteExecutiveProgressState}>{card.saldoReferencial > 0 ? "Disponible" : "Sin saldo"}</span>
              </div>
            </div>

            <div style={styles.siteExecutiveBadge}>{card.saldoReferencial > 0 ? "Disponible" : "Agotado"}</div>

            <div style={styles.siteExecutiveSaldoBlock}>
              <div style={styles.siteExecutiveSaldoLabel}>Saldo referencial despues del sitio</div>
              <div style={styles.siteExecutiveSaldoValue}>{formatCurrency(card.saldoReferencial)}</div>
            </div>
          </div>
        ))}
      </div>

      <SummaryTable
        columns={tableColumns}
        rows={rows}
        totalRows={totalRows}
      />
    </div>
  );
}

function SummaryTable({
  columns,
  rows,
  totalRows,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
}) {
  const tableRows = rows.slice(0, 5);
  const hasMoreThanFive = totalRows > 5;
  const tableMinWidth = Math.max(720, columns.length * 180);

  return (
    <div style={styles.summaryTableShell}>
      <div style={styles.summaryTableHeader}>
        <div style={styles.sectionBoxTitle}>
          Tabla resumen
        </div>
        {hasMoreThanFive && <div style={styles.summaryTableBadge}>Top 5</div>}
      </div>
      <div style={styles.tableScroll}>
        <table style={{ ...styles.table, minWidth: tableMinWidth }}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} style={styles.tableHead}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {columns.map((column) => (
                  <td key={`${rowIndex}-${column}`} style={styles.tableCell} title={formatValue(row[column])}>
                    {formatValue(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DetailTable({
  columns,
  rows,
  title,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  title: string;
}) {
  if (columns.length === 0 || rows.length === 0) {
    return null;
  }

  const tableMinWidth = Math.max(720, columns.length * 180);

  return (
    <div style={styles.tableShell}>
      <div style={styles.sectionBoxTitle}>{title}</div>
      <div style={styles.tableScroll}>
        <table style={{ ...styles.table, minWidth: tableMinWidth }}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} style={styles.tableHead}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`detail-row-${rowIndex}`}>
                {columns.map((column) => (
                  <td key={`${rowIndex}-${column}`} style={styles.tableCell} title={formatValue(row[column])}>
                    {formatValue(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExecutiveChartBlock({
  chart,
  data,
}: {
  chart: {
    chartType: IaChatChartType;
    title: string;
    categoryField: string;
    valueField: string;
  } | null;
  data: Array<Record<string, unknown> & { __category: unknown; __value: number }>;
}) {
  if (!chart) {
    return null;
  }

  return (
    <div style={styles.sectionBox}>
      <div style={styles.sectionBoxTitle}>
        {chart.title.trim().length > 0 && <span>{chart.title}</span>}
      </div>
      <div style={styles.chartShell}>
        <ResponsiveContainer width="100%" height={320}>
          {chart.chartType === "line" ? (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="__category" stroke="#64748B" tick={{ fontSize: 12 }} />
              <YAxis stroke="#64748B" tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="__value" stroke="#0F766E" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          ) : chart.chartType === "pie" ? (
            <PieChart>
              <Tooltip />
              <Legend />
              <Pie
                data={data}
                dataKey="__value"
                nameKey="__category"
                outerRadius={110}
                innerRadius={45}
                paddingAngle={2}
              >
                {data.map((_, index) => (
                  <Cell key={`pie-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="__category" stroke="#64748B" tick={{ fontSize: 12 }} />
              <YAxis stroke="#64748B" tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="__value" fill="#2563EB" radius={[8, 8, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <div style={styles.chartHint}>
        {`${getChartTitle(chart.chartType)}: ${chart.categoryField} vs ${chart.valueField}`}
      </div>
    </div>
  );
}

function buildExecutiveScorecards(
  columns: string[],
  rows: Record<string, unknown>[],
  totalRows: number,
  summary?: Record<string, unknown>,
) {
  const summaryNumber = (keys: string[]) => {
    if (!summary) {
      return null;
    }

    for (const key of keys) {
      const match = Object.keys(summary).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
      if (!match) {
        continue;
      }

      const rawValue = summary[match];
      const numericValue = typeof rawValue === "number"
        ? rawValue
        : Number(String(rawValue ?? "0").replace(/,/g, ""));

      if (Number.isFinite(numericValue)) {
        return numericValue;
      }
    }

    return null;
  };

  const total = summaryNumber(["totalSoles", "totalSubtotalSoles", "subtotalSoles", "total"]);
  const subtotal = summaryNumber(["totalSubtotalSoles", "subtotalSoles"]);
  const recordCount = summaryNumber(["cantidadRegistros", "totalRegistros"]) ?? totalRows;
  const clients = summaryNumber(["cantidadClientes"]);
  const projects = summaryNumber(["cantidadProyectos"]);
  const sites = summaryNumber(["cantidadSitios"]);

  const primaryGroupField = columns.find((column) => /categoria|grupo|cliente|proyecto|responsable|solicitante|site|sitio|estado|mes/i.test(column));
  const topLabel = primaryGroupField ? formatValue(rows[0]?.[primaryGroupField]) : "Agrupado";
  const topCount = rows[0] ? (rows[0].Registros ?? rows[0].Cantidad ?? rows[0].count ?? rows[0].Count ?? 0) : 0;
  const topAmount = rows[0] ? (rows[0].Monto ?? rows[0].Total ?? rows[0].total ?? rows[0].Valor ?? 0) : 0;

  return [
    {
      label: "Total con IGV",
      value: total ?? recordCount,
      subtitle: `${recordCount} registros procesados`,
    },
    {
      label: "Subtotal",
      value: subtotal ?? "-",
      subtitle: "Sin IGV",
    },
    {
      label: "Cobertura",
      value: [clients, projects, sites].filter((item) => item !== null).length > 0
        ? `${clients ?? 0} clientes · ${projects ?? 0} proyectos · ${sites ?? 0} sitios`
        : `${rows.length} grupos`,
      subtitle: "Alcance operativo",
    },
    {
      label: topLabel,
      value: topAmount || topCount || rows.length,
      subtitle: topCount ? `${topCount} registros · top 1` : "Primer grupo destacado",
    },
  ];
}

function buildExecutiveTableColumns(columns: string[], rows?: Record<string, unknown>[]) {
  const preferredOrder = columns.filter((column) =>
    /categoria|grupo|estado|cliente|proyecto|responsable|solicitante|site|sitio|total|monto|subtotal|cantidad|registros|porcentaje|mes/i.test(column)
  );

  if (preferredOrder.length > 0) {
    return preferredOrder.slice(0, 4);
  }

  const fallbackExecutiveColumns = rows && rows.length > 0
    ? Object.keys(rows[0]).filter((column) => /categoria|registros|monto|porcentaje/i.test(column))
    : [];

  if (fallbackExecutiveColumns.length > 0) {
    return fallbackExecutiveColumns.slice(0, 4);
  }

  return columns.slice(0, Math.min(columns.length, 4));
}

export default function IaChatPage() {
  const sessionState = readIaChatSessionState();
  const [selectedModuleId, setSelectedModuleId] = useState<IaChatModuleCode>(
    sessionState?.selectedModuleId ?? "GASTOS"
  );
  const [threads, setThreads] = useState<Record<string, IaChatMessage[]>>(
    sessionState?.threads ?? {
      GASTOS: createInitialThread(MODULES[0]),
    }
  );
  const [conversationIds, setConversationIds] = useState<Record<string, string>>(
    sessionState?.conversationIds ?? {
      GASTOS: createConversationId(),
    }
  );
  const [question, setQuestion] = useState("");
  const [attachment, setAttachment] = useState<IaChatImageAttachment | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [presentationMode, setPresentationMode] = useState<IaChatPresentationMode>(
    sessionState?.presentationMode ?? "auto"
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const selectedModule = useMemo(
    () => MODULES.find((module) => module.id === selectedModuleId) ?? MODULES[0],
    [selectedModuleId]
  );

  const currentMessages = threads[selectedModule.id] ?? createInitialThread(selectedModule);
  const isEnabled = selectedModule.enabled;
  const canSend = isEnabled && !loading && question.trim().length > 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [currentMessages, loading, selectedModuleId]);

  useEffect(() => {
    return () => {
      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    };
  }, [attachment?.previewUrl]);

  useEffect(() => {
    if (!threads[selectedModule.id]) {
      setThreads((current) => ({
        ...current,
        [selectedModule.id]: createInitialThread(selectedModule),
      }));
    }

    if (!conversationIds[selectedModule.id]) {
      setConversationIds((current) => ({
        ...current,
        [selectedModule.id]: createConversationId(),
      }));
    }
  }, [selectedModule, conversationIds, threads]);

  const updateCurrentThread = (updater: (messages: IaChatMessage[]) => IaChatMessage[]) => {
    setThreads((current) => ({
      ...current,
      [selectedModule.id]: updater(current[selectedModule.id] ?? createInitialThread(selectedModule)),
    }));
  };

  useEffect(() => {
    writeIaChatSessionState({
      selectedModuleId,
      threads,
      conversationIds,
      presentationMode,
    });
  }, [selectedModuleId, threads, conversationIds, presentationMode]);

  const handleModuleChange = (module: IaChatModuleInfo) => {
    setSelectedModuleId(module.id);
    setErrorMessage(null);
    setQuestion("");
    setAttachment(null);

    setThreads((current) => {
      if (current[module.id]) {
        return current;
      }

      return {
        ...current,
        [module.id]: createInitialThread(module),
      };
    });

    setConversationIds((current) => {
      if (current[module.id]) {
        return current;
      }

      return {
        ...current,
        [module.id]: createConversationId(),
      };
    });
  };

  const triggerAttachmentPicker = () => {
    fileInputRef.current?.click();
  };

  const handleAttachmentChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";

    if (!isImage && !isPdf) {
      setErrorMessage("Solo se permiten archivos PNG, JPG, JPEG, WEBP o PDF.");
      return;
    }

    const previewUrl = isImage ? URL.createObjectURL(file) : null;

    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result ?? "");
        resolve(result.includes(",") ? result.split(",")[1] : result);
      };
      reader.onerror = () => reject(new Error("No se pudo leer el archivo adjunto."));
      reader.readAsDataURL(file);
    }).catch((readError) => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      throw readError;
    });

    setAttachment({
      fileName: file.name,
      mimeType: file.type,
      base64Data,
      previewUrl,
    });
    setErrorMessage(null);
  };

  const removeAttachment = () => {
    if (attachment?.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
    setAttachment(null);
  };

  const clearConversation = () => {
    setErrorMessage(null);
    setAttachment(null);
    setThreads((current) => {
      const next = {
        ...current,
        [selectedModule.id]: createInitialThread(selectedModule),
      };
      writeIaChatSessionState({
        selectedModuleId,
        threads: next,
        conversationIds,
        presentationMode,
      });
      return next;
    });
    setConversationIds((current) => {
      const next = {
        ...current,
        [selectedModule.id]: createConversationId(),
      };
      writeIaChatSessionState({
        selectedModuleId,
        threads,
        conversationIds: next,
        presentationMode,
      });
      return next;
    });
  };

  const sendQuestion = async (modeOverride?: IaChatPresentationMode, questionOverride?: string) => {
    const trimmedQuestion = (questionOverride ?? question).trim();
    const effectiveMode = modeOverride ?? presentationMode;

    if (!isEnabled) {
      updateCurrentThread((messages) => [
        ...messages,
        {
          id: `pending-${Date.now()}`,
          role: "assistant",
          title: `${selectedModule.name} - Proximamente`,
          text: "Este modulo todavia no esta habilitado. Solo Gastos responde consultas por ahora.",
          tone: "info",
        },
      ]);
      return;
    }

    if (!trimmedQuestion || loading) {
      return;
    }

    const userMessage: IaChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: trimmedQuestion,
    };

    updateCurrentThread((messages) => [...messages, userMessage]);
    setLoading(true);
    setErrorMessage(null);
    setQuestion("");
    setPresentationMode(modeOverride ?? presentationMode);

    try {
      const requestPayload: IaChatRequest = {
        module: selectedModule.id,
        question: trimmedQuestion,
        conversationId: conversationIds[selectedModule.id] ?? null,
        presentationMode: effectiveMode,
        attachment: attachment
          ? {
              fileName: attachment.fileName,
              mimeType: attachment.mimeType,
              base64Data: attachment.base64Data,
            }
          : null,
      };

      console.log("[IA Chat] API Payload", {
        ...requestPayload,
        attachment: requestPayload.attachment
          ? {
              fileName: requestPayload.attachment.fileName,
              mimeType: requestPayload.attachment.mimeType,
              hasBase64Data: Boolean(requestPayload.attachment.base64Data),
            }
          : null,
      });
      console.log(
        "[IA Chat] SQL Preview estimado (frontend, antes del parseo backend)\n%s",
        buildFrontendStorePreview(requestPayload),
      );

      const response = await consultarIaChat(requestPayload);

      if (!response) {
        throw new Error("El asistente no devolvio una respuesta valida.");
      }

      console.log("[IA Chat] Response", response);
      const executedSqlPreview = response.interpretedFilters?.executedSqlPreview;
      if (typeof executedSqlPreview === "string" && executedSqlPreview.trim()) {
        console.log("[IA Chat] SQL Real ejecutado por backend\n%s", executedSqlPreview);
      }

      const assistantMessage: IaChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        title: response.success
          ? response.responseType === "conversation"
            ? "Respuesta"
            : response.responseType === "detail"
              ? "Detalle"
              : response.responseType === "summary"
                ? "Resumen"
                : "Grafico"
          : "No se pudo completar la consulta",
        text: response.success
          ? response.answer
          : response.errorMessage || response.answer || "No fue posible completar la consulta.",
        response,
        tone: response.success ? "success" : "error",
      };

      if (!response.success) {
        setErrorMessage(response.errorMessage || response.answer || "No fue posible completar la consulta.");
      }

      updateCurrentThread((messages) => [...messages, assistantMessage]);
    } catch (error) {
      const friendlyMessage = getIaChatErrorMessage(error);
      setErrorMessage(friendlyMessage);
      updateCurrentThread((messages) => [
        ...messages,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          title: "No se pudo completar la consulta",
          text: friendlyMessage,
          tone: "error",
        },
      ]);
    } finally {
      setLoading(false);
      setPresentationMode("auto");
    }
  };

  return (
    <AppPage
      title="IA Chat Administrativo"
      
      style={styles.page}
    >
      <div style={styles.shell}>
        <AppCard style={styles.sidebarCard}>
          <div style={styles.sidebarHeader}>
            <div style={styles.assistantIcon}>
              <WandSparkles size={20} />
            </div>
            <div>
              <h2 style={styles.sidebarTitle}>Asistente del ERP</h2>
              <p style={styles.sidebarSubtitle}>Selecciona un modulo y conversa con filtros seguros.</p>
            </div>
          </div>

          <div style={styles.moduleList}>
            {MODULES.map((module) => {
              const selected = module.id === selectedModule.id;

              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => handleModuleChange(module)}
                  style={{
                    ...styles.moduleButton,
                    ...(selected ? styles.moduleButtonActive : {}),
                  }}
                >
                  <div style={styles.moduleIcon}>{module.name.slice(0, 1)}</div>
                  <div style={styles.moduleInfo}>
                    <div style={styles.moduleTopRow}>
                      <span style={styles.moduleName}>{module.name}</span>
                      <span style={{ ...styles.moduleBadge, ...getModuleBadgeStyles(module.enabled) }}>
                        {module.statusLabel}
                      </span>
                    </div>
                    <span style={styles.moduleDescription}>{module.description}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </AppCard>

        <div style={styles.chatColumn}>
          
          {errorMessage && (
            <AppStatusMessage tone="error" style={styles.errorBanner}>
              {errorMessage}
            </AppStatusMessage>
          )}

          <AppCard style={styles.chatCard}>
            <div style={styles.toolbar}>
              <span style={styles.moduleChip}>Modulo: {selectedModule.name}</span>

              <div style={styles.toolbarRight}>
                <button type="button" onClick={clearConversation} style={styles.secondaryButton}>
                  <Trash2 size={16} />
                  Limpiar conversacion
                </button>
              </div>
            </div>

            <div style={styles.messagesPane}>
              {currentMessages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {loading && (
                <div style={styles.loadingRow}>
                  <div style={styles.avatarAssistant}>
                    <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                  </div>
                  <div style={styles.loadingBubble}>
                    <div style={styles.loadingTitle}>Analizando tu consulta...</div>
                    <div style={styles.loadingText}>IA esta interpretando la pregunta y validando la herramienta correcta.</div>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div style={styles.composer}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                style={{ display: "none" }}
                onChange={(event) => void handleAttachmentChange(event)}
                disabled={loading || !isEnabled}
              />

              <div style={styles.composerTools}>
                {attachment && (
                  <div style={styles.attachmentChip}>
                    <span style={styles.attachmentChipLabel}>{attachment.fileName ?? "Imagen adjunta"}</span>
                    <button
                      type="button"
                      onClick={removeAttachment}
                      style={styles.attachmentRemoveButton}
                      aria-label="Quitar imagen adjunta"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>

                {attachment?.previewUrl && (
                  <div style={styles.attachmentPreview}>
                    <img
                      src={attachment.previewUrl}
                      alt={attachment.fileName ?? "Imagen adjunta"}
                      style={styles.attachmentPreviewImage}
                    />
                    <div style={styles.attachmentPreviewMeta}>
                      <div style={styles.attachmentPreviewTitle}>Imagen lista para IA</div>
                      <div style={styles.attachmentPreviewText}>
                        {attachment.fileName ?? "Sin nombre"} · {attachment.mimeType}
                      </div>
                    </div>
                  </div>
                )}

                {!attachment?.previewUrl && attachment && (
                  <div style={styles.attachmentPreview}>
                    <div style={styles.attachmentFileIcon}>
                      <FileText size={28} />
                    </div>
                    <div style={styles.attachmentPreviewMeta}>
                      <div style={styles.attachmentPreviewTitle}>PDF listo para IA</div>
                      <div style={styles.attachmentPreviewText}>
                        {attachment.fileName ?? "Sin nombre"} · {attachment.mimeType}
                      </div>
                    </div>
                  </div>
                )}

              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendQuestion();
                  }
                }}
                rows={4}
                style={{
                  ...styles.composerInput,
                  ...(isEnabled ? {} : styles.composerDisabled),
                }}
                placeholder={
                  isEnabled
                    ? "Escribe tu consulta sobre Gastos..."
                    : "Selecciona Gastos para escribir una consulta."
                }
                disabled={loading || !isEnabled}
              />

              <div style={styles.composerActionRow}>
                <button
                  type="button"
                  onClick={() => void sendQuestion()}
                  disabled={!canSend}
                  style={{
                    ...styles.sendButton,
                    ...(canSend ? {} : styles.sendButtonDisabled),
                  }}
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                      Enviando
                    </>
                  ) : (
                    <>
                      <MessageSquareText size={16} />
                      Enviar
                    </>
                  )}
                </button>
              </div>
            </div>
          </AppCard>
        </div>
      </div>
    </AppPage>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    padding: 20,
    background:
      "radial-gradient(circle at top left, rgba(15,118,110,0.12), transparent 28%), radial-gradient(circle at top right, rgba(37,99,235,0.10), transparent 25%), linear-gradient(180deg, #F8FAFC 0%, #EEF2FF 100%)",
  },
  pageActions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  pageTag: {
    padding: "8px 14px",
    borderRadius: 999,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    fontWeight: 700,
    fontSize: 13,
  },
  connectionPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 14px",
    borderRadius: 999,
    background: "#ECFDF5",
    border: "1px solid #BBF7D0",
    color: "#166534",
    fontWeight: 800,
    fontSize: 13,
  },
  shell: {
    display: "grid",
    gridTemplateColumns: "320px minmax(0, 1fr)",
    gap: 18,
  },
  sidebarCard: {
    position: "sticky",
    top: 20,
    alignSelf: "start",
    border: "1px solid #E2E8F0",
    background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
  },
  sidebarHeader: {
    display: "flex",
    gap: 14,
    alignItems: "center",
    marginBottom: 18,
  },
  assistantIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    background: "linear-gradient(135deg, #0F766E 0%, #2563EB 100%)",
    color: "#FFFFFF",
    display: "grid",
    placeItems: "center",
    boxShadow: "0 12px 24px rgba(15,118,110,0.22)",
  },
  sidebarTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
    color: "#0F172A",
  },
  sidebarSubtitle: {
    margin: "4px 0 0",
    fontSize: 13,
    color: "#475569",
    lineHeight: 1.5,
  },
  moduleList: {
    display: "grid",
    gap: 12,
  },
  moduleButton: {
    width: "100%",
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    padding: 14,
    borderRadius: 18,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    cursor: "pointer",
    textAlign: "left",
    transition: "transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease",
  },
  moduleButtonActive: {
    borderColor: "#0F766E",
    boxShadow: "0 16px 28px rgba(15,118,110,0.10)",
    transform: "translateY(-1px)",
  },
  moduleIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    background: "linear-gradient(135deg, #0F172A 0%, #334155 100%)",
    color: "#FFFFFF",
    display: "grid",
    placeItems: "center",
    fontWeight: 800,
    flexShrink: 0,
  },
  moduleInfo: {
    minWidth: 0,
    display: "grid",
    gap: 6,
    flex: 1,
  },
  moduleTopRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  moduleName: {
    fontWeight: 800,
    color: "#0F172A",
  },
  moduleBadge: {
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
  },
  moduleDescription: {
    fontSize: 12,
    color: "#475569",
    lineHeight: 1.45,
  },
  chatColumn: {
    display: "grid",
    gap: 16,
  },
  statusBanner: {
    borderRadius: 18,
    padding: 14,
  },
  errorBanner: {
    borderRadius: 18,
    padding: 14,
  },
  chatCard: {
    border: "1px solid #E2E8F0",
    background: "linear-gradient(180deg, #FFFFFF 0%, #FAFBFF 100%)",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
    flexWrap: "wrap",
  },
  toolbarRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  responseQuickActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 10,
  },
  moduleChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 999,
    background: "#0F172A",
    color: "#FFFFFF",
    fontWeight: 700,
    fontSize: 12,
  },
  secondaryButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    fontWeight: 700,
    cursor: "pointer",
  },
  messagesPane: {
    display: "grid",
    gap: 14,
    maxHeight: "62vh",
    overflowY: "auto",
    paddingRight: 6,
    marginBottom: 14,
  },
  messageRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
  },
  messageRowAssistant: {
    justifyContent: "flex-start",
  },
  messageRowUser: {
    justifyContent: "flex-end",
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  avatarAssistant: {
    background: "#0F766E",
    color: "#FFFFFF",
  },
  avatarUser: {
    background: "#2563EB",
    color: "#FFFFFF",
  },
  assistantBubble: {
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
  },
  userBubble: {
    background: "linear-gradient(135deg, #0F766E 0%, #0EA5E9 100%)",
    border: "1px solid rgba(15,118,110,0.2)",
    color: "#FFFFFF",
  },
  errorBubble: {
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    color: "#991B1B",
  },
  messageBubble: {
    maxWidth: "min(860px, 88%)",
    borderRadius: 20,
    padding: 16,
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
  },
  messageTitle: {
    fontWeight: 800,
    marginBottom: 8,
    color: "inherit",
  },
  messageText: {
    whiteSpace: "pre-wrap",
    lineHeight: 1.6,
    color: "inherit",
    fontSize: 14,
  },
  assistantNarrativeCard: {
    borderRadius: 16,
    border: "1px solid #D1FAE5",
    background: "linear-gradient(180deg, #F0FDF4 0%, #FFFFFF 100%)",
    padding: "12px 14px",
    marginBottom: 12,
    boxShadow: "0 8px 18px rgba(15,118,110,0.08)",
  },
  assistantNarrativeLabel: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#0F766E",
    marginBottom: 6,
  },
  assistantNarrativeText: {
    whiteSpace: "pre-wrap",
    lineHeight: 1.7,
    color: "#0F172A",
    fontSize: 14,
  },
  responseStack: {
    marginTop: 14,
    display: "grid",
    gap: 12,
  },
  responseMeta: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  responseMetaChips: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  exportActions: {
    display: "inline-flex",
    alignItems: "center",
  },
  metaChip: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "#FFFFFF",
    color: "#334155",
    border: "1px solid #E2E8F0",
    fontSize: 12,
    fontWeight: 700,
  },
  exportButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid #0EA5E9",
    background: "linear-gradient(135deg, #0F766E 0%, #0EA5E9 100%)",
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 10px 18px rgba(15, 118, 110, 0.16)",
    whiteSpace: "nowrap",
  },
  exportButtonDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
    boxShadow: "none",
  },
  executiveFormatButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid #0F766E",
    background: "#FFFFFF",
    color: "#0F766E",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  executiveFormatButtonDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
  },
  exportFormatPanel: {
    borderRadius: 16,
    border: "1px solid #DBEAFE",
    background: "linear-gradient(180deg, #F8FBFF 0%, #FFFFFF 100%)",
    padding: 14,
    display: "grid",
    gap: 12,
  },
  exportFormatPanelTitle: {
    fontSize: 13,
    fontWeight: 800,
    color: "#1E3A8A",
  },
  exportFormatGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
  },
  exportFormatCard: {
    textAlign: "left",
    borderRadius: 14,
    border: "1px solid #BFDBFE",
    background: "#FFFFFF",
    padding: 12,
    cursor: "pointer",
    display: "grid",
    gap: 8,
  },
  exportFormatCardActive: {
    borderColor: "#0F766E",
    boxShadow: "0 10px 18px rgba(15,118,110,0.10)",
  },
  exportFormatCardTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    justifyContent: "space-between",
    fontWeight: 800,
    color: "#0F172A",
    fontSize: 13,
  },
  exportFormatRecommended: {
    padding: "3px 8px",
    borderRadius: 999,
    background: "#ECFDF5",
    border: "1px solid #A7F3D0",
    color: "#166534",
    fontSize: 10,
    fontWeight: 800,
  },
  exportFormatCardText: {
    fontSize: 12,
    lineHeight: 1.5,
    color: "#475569",
  },
  sectionBox: {
    borderRadius: 18,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    padding: 14,
  },
  sectionBoxTitle: {
    fontWeight: 800,
    color: "#0F172A",
    marginBottom: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  filterGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
  },
  filterItem: {
    borderRadius: 14,
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
    padding: 10,
  },
  filterLabel: {
    display: "block",
    fontSize: 11,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: 6,
    fontWeight: 800,
  },
  filterValue: {
    fontSize: 13,
    color: "#0F172A",
    fontWeight: 700,
    wordBreak: "break-word",
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 10,
  },
  kpiCard: {
    borderRadius: 16,
    border: "1px solid #E2E8F0",
    background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
    padding: 14,
  },
  kpiLabel: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 8,
    fontWeight: 700,
  },
  kpiValue: {
    fontSize: 20,
    color: "#0F172A",
    fontWeight: 900,
  },
  tableShell: {
    borderRadius: 18,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    padding: 14,
    maxHeight: "42vh",
    overflow: "hidden",
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr)",
    gap: 10,
  },
  detailGridWrapper: {
    display: "grid",
    gap: 8,
  },
  detailGridHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  reportPreviewWrapper: {
    display: "grid",
    gap: 10,
    borderRadius: 18,
    border: "1px solid #C7E9FF",
    background: "linear-gradient(180deg, #F8FCFF 0%, #FFFFFF 100%)",
    padding: 14,
    boxShadow: "0 10px 24px rgba(15, 118, 110, 0.06)",
  },
  reportPreviewHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  reportPreviewSubtitle: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700,
    marginTop: 4,
  },
  reportPreviewCloseButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  reportPreviewFrameShell: {
    borderRadius: 16,
    border: "1px solid #D6EAF8",
    overflow: "hidden",
    background: "#FFFFFF",
    minHeight: "72vh",
  },
  reportPreviewFrame: {
    width: "100%",
    height: "72vh",
    border: "0",
    display: "block",
    background: "#FFFFFF",
  },
  executiveCard: {
    borderRadius: 18,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    padding: 14,
    maxHeight: "42vh",
    overflow: "hidden",
    display: "grid",
    gridTemplateRows: "auto auto minmax(0, 1fr)",
    gap: 12,
  },
  executiveHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  executiveActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  executiveSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700,
  },
  executiveBadge: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #CBD5E1",
    background: "#F8FAFC",
    color: "#0F172A",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  executiveModeExecutive: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #A7F3D0",
    background: "#ECFDF5",
    color: "#166534",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  executiveModeDetail: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #BFDBFE",
    background: "#EFF6FF",
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  detailToggleButton: {
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  executiveCardsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
    gap: 12,
    maxHeight: "34vh",
    overflow: "auto",
    paddingRight: 4,
  },
  siteExecutiveCard: {
    borderRadius: 14,
    border: "1px solid #E2E8F0",
    background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
    padding: 14,
    boxShadow: "0 4px 18px rgba(15, 23, 42, 0.04)",
    display: "grid",
    gap: 12,
    minHeight: 240,
  },
  siteExecutiveHeader: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  siteExecutiveField: {
    display: "grid",
    gap: 2,
  },
  siteExecutiveFieldLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#64748B",
    fontWeight: 800,
  },
  siteExecutiveFieldValue: {
    fontSize: 16,
    fontWeight: 900,
    color: "#0F172A",
    lineHeight: 1.15,
    wordBreak: "break-word",
  },
  siteExecutiveMetrics: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: 12,
  },
  siteExecutiveMetric: {
    borderRadius: 12,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    padding: 12,
  },
  siteExecutiveMetricLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "#64748B",
    marginBottom: 6,
    fontWeight: 800,
  },
  siteExecutiveMetricValue: {
    fontSize: 20,
    fontWeight: 900,
    color: "#0F172A",
    lineHeight: 1.1,
  },
  siteExecutiveProgressBlock: {
    display: "grid",
    gap: 8,
  },
  siteExecutiveProgressTrack: {
    width: "100%",
    height: 10,
    borderRadius: 999,
    background: "#E2E8F0",
    overflow: "hidden",
  },
  siteExecutiveProgressFill: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #22C55E 0%, #16A34A 100%)",
  },
  siteExecutiveProgressRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    fontSize: 12,
    fontWeight: 800,
    color: "#334155",
  },
  siteExecutiveProgressPercent: {
    color: "#0F172A",
  },
  siteExecutiveProgressState: {
    color: "#475569",
    textAlign: "right",
  },
  siteExecutiveBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "fit-content",
    minWidth: 140,
    padding: "10px 14px",
    borderRadius: 999,
    background: "#D1FAE5",
    color: "#166534",
    fontSize: 13,
    fontWeight: 900,
  },
  siteExecutiveSaldoBlock: {
    borderRadius: 12,
    background: "#F1F5F9",
    border: "1px solid #E2E8F0",
    padding: 12,
  },
  siteExecutiveSaldoLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "#64748B",
    marginBottom: 6,
    fontWeight: 800,
  },
  siteExecutiveSaldoValue: {
    fontSize: 22,
    fontWeight: 900,
    color: "#0F172A",
  },
  tableScroll: {
    overflow: "auto",
    maxHeight: "34vh",
    borderRadius: 14,
    border: "1px solid #E2E8F0",
  },
  table: {
    width: "max-content",
    borderCollapse: "collapse",
    tableLayout: "auto",
  },
  tableHead: {
    textAlign: "left",
    padding: "10px 12px",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#475569",
    borderBottom: "1px solid #E2E8F0",
    background: "#F8FAFC",
    whiteSpace: "nowrap",
  },
  tableCell: {
    padding: "10px 12px",
    borderBottom: "1px solid #E2E8F0",
    color: "#0F172A",
    fontSize: 13,
    verticalAlign: "top",
    maxWidth: 220,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  chartShell: {
    width: "100%",
    height: 320,
  },
  chartShellExpanded: {
    width: "100%",
    height: "100%",
    minHeight: 560,
  },
  chartHint: {
    marginTop: 8,
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700,
  },
  expandButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  chartOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.65)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 60,
  },
  chartModal: {
    width: "min(1200px, 96vw)",
    height: "min(760px, 92vh)",
    background: "#FFFFFF",
    borderRadius: 24,
    border: "1px solid #E2E8F0",
    boxShadow: "0 30px 70px rgba(15, 23, 42, 0.35)",
    padding: 18,
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: 16,
  },
  chartModalHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  chartModalTitle: {
    fontSize: 18,
    fontWeight: 900,
    color: "#0F172A",
    marginBottom: 6,
  },
  chartModalSubtitle: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: 700,
  },
  closeButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  composer: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gridTemplateRows: "auto auto",
    gap: 12,
    alignItems: "stretch",
  },
  composerTools: {
    gridColumn: "1 / -1",
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  attachButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    fontWeight: 800,
    cursor: "pointer",
  },
  attachmentChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid #BAE6FD",
    background: "#ECFEFF",
    color: "#0F172A",
    fontWeight: 700,
    maxWidth: "100%",
  },
  attachmentChipLabel: {
    maxWidth: 260,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  attachmentRemoveButton: {
    width: 24,
    height: 24,
    borderRadius: 999,
    border: "none",
    background: "#E0F2FE",
    color: "#0F172A",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    flexShrink: 0,
  },
  attachmentPreview: {
    gridColumn: "1 / -1",
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
  },
  attachmentPreviewImage: {
    width: 72,
    height: 72,
    borderRadius: 12,
    objectFit: "cover",
    border: "1px solid #CBD5E1",
    flexShrink: 0,
  },
  attachmentFileIcon: {
    width: 72,
    height: 72,
    borderRadius: 12,
    border: "1px solid #CBD5E1",
    background: "linear-gradient(180deg, #F8FAFC 0%, #E2E8F0 100%)",
    color: "#0F172A",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  attachmentPreviewMeta: {
    display: "grid",
    gap: 4,
    minWidth: 0,
  },
  attachmentPreviewTitle: {
    fontWeight: 800,
    color: "#0F172A",
  },
  attachmentPreviewText: {
    fontSize: 12,
    color: "#475569",
    wordBreak: "break-word",
  },
  composerInput: {
    gridColumn: "1 / 2",
    width: "100%",
    minHeight: 112,
    borderRadius: 18,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    padding: 14,
    fontSize: 14,
    color: "#0F172A",
    resize: "vertical",
    outline: "none",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
  },
  composerActionRow: {
    gridColumn: "1 / -1",
    display: "flex",
    alignItems: "stretch",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  modeButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 52,
    padding: "0 16px",
    borderRadius: 16,
    border: "1px solid #0F766E",
    background: "#F0FDFA",
    color: "#0F766E",
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
  },
  modeButtonActive: {
    background: "linear-gradient(135deg, #0F766E 0%, #2563EB 100%)",
    color: "#FFFFFF",
    borderColor: "transparent",
    boxShadow: "0 14px 24px rgba(15,118,110,0.18)",
  },
  modeButtonDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
    boxShadow: "none",
  },
  composerDisabled: {
    background: "#F8FAFC",
    color: "#94A3B8",
  },
  sendButton: {
    gridColumn: "2 / 3",
    minWidth: 140,
    borderRadius: 18,
    border: "none",
    background: "linear-gradient(135deg, #0F766E 0%, #2563EB 100%)",
    color: "#FFFFFF",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "0 18px",
    boxShadow: "0 14px 24px rgba(15,118,110,0.18)",
  },
  sendButtonDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
    boxShadow: "none",
  },
  loadingRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
  },
  loadingBubble: {
    borderRadius: 20,
    padding: 16,
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
    maxWidth: "min(860px, 88%)",
  },
  loadingTitle: {
    fontWeight: 800,
    color: "#0F172A",
    marginBottom: 6,
  },
  loadingText: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 1.55,
  },
};

function parseFrontendGastosQuestionForPreview(question: string) {
  const normalized = normalizeQuestion(question);
  const currentYear = new Date().getFullYear();

  const quarterMatch = normalized.match(
    /\b(?:(primer|segundo|tercer|cuarto|1er|2do|3er|4to)\s+)?trimestre(?:\s+(?:de\s+)?)?(20\d{2}|19\d{2})?\b/,
  );

  const monthMatch = normalized.match(
    /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|setiembre|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(19\d{2}|20\d{2})?\b/,
  );

  let start: Date | null = null;
  let end: Date | null = null;

  if (quarterMatch) {
    const quarterLabel = quarterMatch[1];
    const year = Number(quarterMatch[2] || currentYear);
    const quarterMap: Record<string, number> = {
      primer: 1,
      "1er": 1,
      segundo: 2,
      "2do": 2,
      tercer: 3,
      "3er": 3,
      cuarto: 4,
      "4to": 4,
    };
    const quarter = quarterMap[quarterLabel ?? ""] ?? 0;
    if (quarter > 0) {
      const firstMonth = (quarter - 1) * 3;
      start = new Date(year, firstMonth, 1);
      end = new Date(year, firstMonth + 3, 0);
    }
  } else if (monthMatch) {
    const monthMap: Record<string, number> = {
      enero: 0,
      febrero: 1,
      marzo: 2,
      abril: 3,
      mayo: 4,
      junio: 5,
      julio: 6,
      agosto: 7,
      setiembre: 8,
      septiembre: 8,
      octubre: 9,
      noviembre: 10,
      diciembre: 11,
    };

    const year = Number(monthMatch[2] || currentYear);
    const monthIndex = monthMap[monthMatch[1]];
    start = new Date(year, monthIndex, 1);
    end = new Date(year, monthIndex + 1, 0);
  } else {
    const yearMatch = normalized.match(/\b(19\d{2}|20\d{2})\b/);
    const year = Number(yearMatch?.[1] || currentYear);
    start = new Date(year, 0, 1);
    end = new Date(year, 11, 31);
  }

  const workingText = normalized;

  const projectMatch = workingText.match(
    /\bproyecto\s+(?<value>.+?)(?=\b(?:para|durante|desde|hasta|de fecha|en fecha|en el periodo|periodo|mes|ano|anio|de|del|en)\b|$)/i,
  );

  const project = projectMatch?.groups?.value
    ? projectMatch.groups.value
        .replace(/\b(de fecha|en fecha|en el periodo|durante|desde|hasta|para|periodo|mes|ano|anio)\b.*$/i, "")
        .trim()
        .replace(/\s{2,}/g, " ")
        .toUpperCase() || null
    : null;

  const cliente = extractNamedFilterPreview(workingText, "cliente");
  const solicitante = extractNamedFilterPreview(workingText, "solicitante");
  const responsable = extractNamedFilterPreview(workingText, "responsable");
  const site = extractNamedFilterPreview(workingText, "site") ?? extractNamedFilterPreview(workingText, "sitio");
  const ot = extractNamedFilterPreview(workingText, "ot");
  const estados = extractStateFilters(workingText);
  const removableFilters = [project, cliente, solicitante, responsable, site, ot, ...estados].filter(
    (value): value is string => Boolean(value && value.trim()),
  );

  const searchSource = removableFilters.reduce((current, filterValue) => {
    return current.replace(new RegExp(`\\b${escapeRegExp(normalizeFilterValue(filterValue))}\\b`, "gi"), " ");
  }, workingText);

  const searchText = searchSource
    .replace(/\b(proyecto|cliente|responsable|solicitante|site|sitio|ot|orden|ordenes|gasto|gastos|planilla|registro|registros|cuanto|cuantos|cuanta|cuantas|quiero|saber|mostrar|consultar|buscar|de|del|para|por|con|en|el|la|los|las|periodo|mes|ano|anio|tiene|tengo|hay|aprobado|aprobada|aprobados|aprobadas|pendiente|pendientes|observado|observada|observados|observadas|rechazado|rechazada|rechazados|rechazadas|pagado|pagada|pagados|pagadas)\b/g, " ")
    .replace(/\b(en el periodo|durante|desde|hasta|de fecha|en fecha)\b/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .split(/\b(?:en el periodo|durante|desde|hasta|de fecha|en fecha|para|en)\b/i)[0]
    .trim()
    .split(" ")
    .filter((token) => token.length > 1)
    .slice(0, 4)
    .join(" ");

  return {
    start,
    end,
    project,
    cliente,
    solicitante,
    responsable,
    site,
    ot,
    estados: estados.length > 0 ? estados.join(", ") : null,
    searchText: searchText || null,
    coincideTodas: /\b(coincidencia exacta|coincidir todas|todos los terminos|terminos exactos)\b/i.test(normalized),
  };
}
