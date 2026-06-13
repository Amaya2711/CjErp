import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent } from "react";
import {
  Bot,
  Download,
  FileText,
  Maximize2,
  Loader2,
  MessageSquareText,
  Paperclip,
  Sparkles,
  Table2,
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
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppStatusMessage from "../../../components/base/AppStatusMessage";
import { consultarIaChat, getIaChatErrorMessage } from "./iachat/services/iaChatService";
import type {
  IaChatMessage,
  IaChatModuleCode,
  IaChatModuleInfo,
  IaChatImageAttachment,
  IaChatPresentationMode,
  IaChatResponse,
  IaChatChartType,
} from "./iachat/types";

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

function createConversationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `conv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

function normalizeNumericValue(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/,/g, "").trim();
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
    "question",
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
      Object.keys(row).find((key) => /categoria|grupo|estado|cliente|proyecto|responsable|site|sitio|mes|ot/i.test(key)) ??
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
    Object.keys(sampleRow).find((key) => /responsable|cliente|proyecto|site|sitio|estado|mes|ot/i.test(key)) ??
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

function buildFallbackChartConfig(rows: Array<Record<string, unknown> & { __category?: unknown; __value?: number }>) {
  return {
    chartType: "bar" as const,
    title: "Distribución ejecutiva",
    categoryField: "__category",
    valueField: "__value",
    rows: rows as Record<string, unknown>[],
  };
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
        <div style={styles.messageText}>{message.text}</div>
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
  const [showDetail, setShowDetail] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const rawRows = response.detailRows ?? [];
  const chartData = buildChartData(response);
  const chartExecutiveRows = buildExecutiveRowsFromChart(response);
  const executiveRows = response.responseType === "detail"
    ? aggregateDetailRows(rawRows)
    : chartExecutiveRows.length > 0
      ? chartExecutiveRows
      : normalizeExecutiveRows(rawRows);
  const detailColumns = buildDetailColumns(executiveRows);
  const numericSummary = summarizeNumericEntries(response.summary);
  const displayFilters = buildDisplayFilters(response);
  const topFiveRows = executiveRows.slice(0, 5);
  const executiveChartData = response.chart && chartData.length > 0
    ? chartData
    : response.responseType === "summary" || response.responseType === "detail"
      ? buildExecutiveChartData(topFiveRows)
      : chartData;
  const executiveChartConfig = response.chart && chartData.length > 0
    ? response.chart
    : executiveChartData.length > 0
      ? buildFallbackChartConfig(executiveChartData)
      : null;
  const shouldShowChart = executiveChartConfig !== null && executiveChartData.length > 0;
  const shouldShowExecutiveSummary = detailColumns.length > 0 && executiveRows.length > 0;
  const shouldShowTable = showDetail && rawRows.length > 0;
  const canExport = response.success && (
    rawRows.length > 0 ||
    executiveRows.length > 0 ||
    executiveChartData.length > 0 ||
    numericSummary.length > 0 ||
    displayFilters.length > 0 ||
    Boolean(response.answer)
  );

  const handleExport = () => {
    if (!canExport || isExporting) {
      return;
    }

    setIsExporting(true);

    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const fileLabel = response.module.toLowerCase();
      const reportLabel = response.responseType === "detail"
        ? "detalle"
        : response.responseType === "summary"
          ? "resumen"
          : response.responseType === "chart"
            ? "grafico"
            : "reporte";
      const generatedAt = new Date().toLocaleString("es-PE");

      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, 297, 22, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("IA Chat Administrativo - Reporte exportado", 14, 13);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Modulo: ${response.module}  |  Generado: ${generatedAt}`, 198, 13, { align: "right" });

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(`Tipo de respuesta: ${formatValue(response.responseType)}`, 14, 32);

      const summaryRows = buildKeyValueExportRows([
        ["Modulo", response.module],
        ["Tipo de respuesta", response.responseType],
        ["Total de filas", response.totalRows ?? ""],
        ["Generado el", generatedAt],
        ["Respuesta", response.answer],
      ]);

      let cursorY = 38;
      cursorY = addPdfSection(doc, "Resumen general", summaryRows, cursorY, {
        headStyleFill: [15, 118, 110],
      });

      if (displayFilters.length > 0) {
        cursorY = addPdfSection(
          doc,
          "Filtros interpretados",
          displayFilters.map((item) => ({
            Campo: item.label,
            Valor: normalizeExportValue(item.value),
          })),
          cursorY,
          { headStyleFill: [37, 99, 235] },
        );
      }

      if (numericSummary.length > 0) {
        cursorY = addPdfSection(
          doc,
          "Indicadores ejecutivos",
          numericSummary.map((item) => ({
            Campo: item.label,
            Valor: item.value,
          })),
          cursorY,
          { headStyleFill: [124, 58, 237] },
        );
      }

      if (shouldShowExecutiveSummary && executiveRows.length > 0) {
        cursorY = addPdfSection(
          doc,
          executiveRows.length > 5 ? `Cuadro ejecutivo - Top 5 de ${executiveRows.length}` : "Cuadro ejecutivo",
          toPdfRows(executiveRows.slice(0, 5)),
          cursorY,
          { headStyleFill: [15, 118, 110] },
        );
      }

      if (shouldShowChart) {
        const chartRows = executiveChartData.slice(0, 10).map((row) => flattenExportRecord(row));
        cursorY = addPdfSection(
          doc,
          "Distribucion del grafico",
          chartRows,
          cursorY,
          { headStyleFill: [245, 158, 11] },
        );
      }

      if (rawRows.length > 0) {
        cursorY = addPdfSection(
          doc,
          response.responseType === "detail" ? "Detalle completo" : "Detalle original",
          toPdfRows(rawRows.slice(0, 100)),
          cursorY,
          { headStyleFill: [100, 116, 139] },
        );
      }

      doc.save(`${fileLabel}-${reportLabel}-${Date.now()}.pdf`);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    setShowDetail(false);
  }, [response.answer, response.responseType, response.totalRows]);

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
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={!canExport || isExporting}
          style={{
            ...styles.exportButton,
            ...(canExport && !isExporting ? {} : styles.exportButtonDisabled),
          }}
        >
          <Download size={14} />
          {isExporting ? "Exportando..." : "Exportar reporte"}
        </button>
      </div>

      {displayFilters.length > 0 && (
        <div style={styles.sectionBox}>
          <div style={styles.sectionBoxTitle}>Filtros interpretados</div>
          <div style={styles.filterGrid}>
            {displayFilters.map((item) => (
              <div key={item.label} style={styles.filterItem}>
                <span style={styles.filterLabel}>{item.label}</span>
                <span style={styles.filterValue}>{formatValue(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
          columns={detailColumns}
          rows={topFiveRows}
          totalRows={executiveRows.length}
          detailOpen={showDetail}
          onToggleDetail={() => setShowDetail((current) => !current)}
          summary={response.summary}
        />
      )}

      {shouldShowTable && (
        <DetailTable
          columns={buildDetailColumns(rawRows)}
          rows={rawRows}
          title="Detalle completo"
        />
      )}
    </div>
  );
}

function ExecutiveSummaryBlock({
  columns,
  rows,
  totalRows,
  detailOpen,
  onToggleDetail,
  summary,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
  detailOpen: boolean;
  onToggleDetail: () => void;
  summary?: Record<string, unknown>;
}) {
  const hasMoreThanFive = totalRows > 5;
  const scorecards = buildExecutiveScorecards(columns, rows, totalRows, summary);
  const tableColumns = buildExecutiveTableColumns(columns, rows);

  return (
    <div style={styles.executiveCard}>
      <div style={styles.executiveHeader}>
        <div>
          <div style={styles.sectionBoxTitle}>Cuadro resumen</div>
          <div style={styles.executiveSubtitle}>
            {hasMoreThanFive
              ? `Mostrando top 5 de ${totalRows} registros agrupados.`
              : `Mostrando ${totalRows} registros agrupados.`}
          </div>
        </div>
        <div style={styles.executiveActions}>
          <div style={detailOpen ? styles.executiveModeDetail : styles.executiveModeExecutive}>
            {detailOpen ? "Detalle completo" : "Vista ejecutiva"}
          </div>
          <div style={styles.executiveBadge}>
            {hasMoreThanFive ? "Top 5" : "Completo"}
          </div>
          <button type="button" onClick={onToggleDetail} style={styles.detailToggleButton}>
            {detailOpen ? "Volver a ejecutivo" : "Abrir detalle"}
          </button>
        </div>
      </div>

      <div style={styles.executiveCardsGrid}>
        {scorecards.map((card, index) => (
          <div key={`exec-${index}`} style={styles.executiveRowCard}>
            <div style={styles.executiveRowTop}>
              <span style={styles.executiveRowIndex}>#{index + 1}</span>
              <span style={styles.executiveRowLabel}>
                {card.label}
              </span>
            </div>
            <div style={styles.executiveRowValue}>
              {formatValue(card.value)}
            </div>
            {card.subtitle && (
              <div style={styles.executiveRowSecondary}>
                {card.subtitle}
              </div>
            )}
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
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!isExpanded) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsExpanded(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isExpanded]);

  if (!chart) {
    return null;
  }

  return (
    <div style={styles.sectionBox}>
      <div style={styles.sectionBoxTitle}>
        <span>{chart.title}</span>
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          style={styles.expandButton}
        >
          <Maximize2 size={14} />
          Ampliar
        </button>
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

      {isExpanded && (
        <div style={styles.chartOverlay} onClick={() => setIsExpanded(false)} role="presentation">
          <div style={styles.chartModal} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <div style={styles.chartModalHeader}>
              <div>
                <div style={styles.chartModalTitle}>{chart.title}</div>
                <div style={styles.chartModalSubtitle}>
                  {getChartTitle(chart.chartType)}: {chart.categoryField} vs {chart.valueField}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                style={styles.closeButton}
              >
                <X size={16} />
                Cerrar
              </button>
            </div>

            <div style={styles.chartShellExpanded}>
              <ResponsiveContainer width="100%" height={560}>
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
                      outerRadius={180}
                      innerRadius={75}
                      paddingAngle={2}
                    >
                      {data.map((_, index) => (
                        <Cell key={`pie-expanded-cell-${index}`} fill={COLORS[index % COLORS.length]} />
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
          </div>
        </div>
      )}
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

  const primaryGroupField = columns.find((column) => /categoria|grupo|cliente|proyecto|responsable|site|sitio|estado|mes/i.test(column));
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
    /categoria|grupo|estado|cliente|proyecto|responsable|site|sitio|total|monto|subtotal|cantidad|registros|porcentaje|mes/i.test(column)
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

function buildExecutiveChartData(rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    return [];
  }

  const firstRow = rows[0];
  const keys = Object.keys(firstRow);
  const categoryKey =
    keys.find((key) => /estado|cliente|proyecto|responsable|site|sitio|mes/i.test(key)) ??
    keys.find((key) => !/total|monto|importe|valor|saldo|cantidad|subtotal/i.test(key)) ??
    keys[0];
  const valueKey =
    keys.find((key) => /total|monto|importe|valor|saldo|cantidad|subtotal|pagado|conpagado/i.test(key)) ??
    keys.find((key) => typeof firstRow[key] === "number") ??
    keys[1];

  return rows.map((row) => {
    const categoryValue = row[categoryKey];
    const rawValue = row[valueKey];
    const numericValue = typeof rawValue === "number" ? rawValue : Number(String(rawValue ?? "0").replace(/,/g, ""));

    return {
      ...row,
      __category: categoryValue ?? "Sin dato",
      __value: Number.isFinite(numericValue) ? numericValue : 0,
    };
  })
    .filter((row) => row.__category !== "Sin dato" || row.__value !== 0)
    .sort((left, right) => right.__value - left.__value);
}

export default function IaChatPage() {
  const [selectedModuleId, setSelectedModuleId] = useState<IaChatModuleCode>("GASTOS");
  const [threads, setThreads] = useState<Record<string, IaChatMessage[]>>({
    GASTOS: createInitialThread(MODULES[0]),
  });
  const [conversationIds, setConversationIds] = useState<Record<string, string>>({
    GASTOS: createConversationId(),
  });
  const [question, setQuestion] = useState("");
  const [attachment, setAttachment] = useState<IaChatImageAttachment | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [presentationMode, setPresentationMode] = useState<IaChatPresentationMode>("auto");
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

  const handleKeywordClick = (keyword: string) => {
    setQuestion((current) => (current.trim().length > 0 ? `${current} ${keyword}` : keyword));
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
    setThreads((current) => ({
      ...current,
      [selectedModule.id]: createInitialThread(selectedModule),
    }));
    setConversationIds((current) => ({
      ...current,
      [selectedModule.id]: createConversationId(),
    }));
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
      const response = await consultarIaChat({
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
      });

      if (!response) {
        throw new Error("El asistente no devolvio una respuesta valida.");
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
      actions={
        <div style={styles.pageActions}>
          <span style={styles.pageTag}>Reportes / Administrativo</span>
          <span style={styles.connectionPill}>
            <Sparkles size={14} />
            <span>{isEnabled ? "Conexion segura activa" : "Pendiente de configuracion"}</span>
          </span>
        </div>
      }
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
          <AppStatusMessage tone={isEnabled ? "success" : "info"} style={styles.statusBanner}>
            {isEnabled
              ? "Gastos esta habilitado con Claude + SQL Server y solo usa herramientas de lectura."
              : "Este modulo aun no esta habilitado. Selecciona Gastos para ejecutar consultas reales."}
          </AppStatusMessage>

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
                    <div style={styles.loadingText}>Claude esta interpretando la pregunta y validando la herramienta correcta.</div>
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
                <button
                  type="button"
                  onClick={triggerAttachmentPicker}
                  style={styles.attachButton}
                  disabled={loading || !isEnabled}
                >
                  <Paperclip size={16} />
                  Adjuntar archivo
                </button>

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
                      <div style={styles.attachmentPreviewTitle}>Imagen lista para Claude</div>
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
                      <div style={styles.attachmentPreviewTitle}>PDF listo para Claude</div>
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
                  onClick={() => {
                    const executiveDraft = question.trim().length > 0 ? question : "formato ejecutivo";
                    void sendQuestion("executive", executiveDraft);
                  }}
                  disabled={!isEnabled || loading}
                  style={{
                    ...styles.modeButton,
                    ...(presentationMode === "executive" ? styles.modeButtonActive : {}),
                    ...((!isEnabled || loading) ? styles.modeButtonDisabled : {}),
                  }}
                >
                  <WandSparkles size={16} />
                  Formato ejecutivo
                </button>

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

          <AppCard style={styles.footerCard}>
            <div style={styles.footerHeader}>
              <div style={styles.footerTitle}>
                <Table2 size={16} />
                Palabras clave sugeridas
              </div>
              <div style={styles.footerSubtitle}>
                {selectedModule.enabled ? "Usalas como guia para consultas frecuentes." : "Disponibles como referencia para la siguiente fase."}
              </div>
            </div>

            <div style={styles.keywordWrap}>
              {selectedModule.keywords.map((keyword) => (
                <button
                  key={keyword}
                  type="button"
                  onClick={() => handleKeywordClick(keyword)}
                  style={styles.keywordChip}
                >
                  {keyword}
                </button>
              ))}
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
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 12,
  },
  executiveRowCard: {
    borderRadius: 14,
    border: "1px solid #E2E8F0",
    background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
    padding: 12,
    boxShadow: "0 4px 18px rgba(15, 23, 42, 0.04)",
    minHeight: 108,
  },
  executiveRowTop: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  executiveRowIndex: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 999,
    background: "#0F766E",
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: 800,
    flexShrink: 0,
  },
  executiveRowLabel: {
    fontSize: 13,
    fontWeight: 800,
    color: "#1E293B",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  executiveRowValue: {
    fontSize: 18,
    fontWeight: 900,
    color: "#0F172A",
    lineHeight: 1.2,
    marginBottom: 4,
  },
  executiveRowSecondary: {
    fontSize: 12,
    color: "#475569",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
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
  footerCard: {
    border: "1px solid #E2E8F0",
    background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
  },
  footerHeader: {
    display: "grid",
    gap: 6,
    marginBottom: 14,
  },
  footerTitle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 800,
    color: "#0F172A",
  },
  footerSubtitle: {
    color: "#64748B",
    fontSize: 13,
  },
  keywordWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  },
  keywordChip: {
    padding: "10px 14px",
    borderRadius: 999,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    fontWeight: 700,
    cursor: "pointer",
    transition: "transform 120ms ease, box-shadow 120ms ease",
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
