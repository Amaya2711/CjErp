import type {
  DisplayItem,
  GridColumn,
  GridDataType,
  GridFormat,
  GridSummaryItem,
  GroupNode,
  SortOrder,
} from "./types";

const LOCALE = "es-PE";

export function getValue(row: object, field: string): unknown {
  return (row as Record<string, unknown>)[field];
}

/** Valor de la celda: usa `calculateCellValue` si la columna lo define. */
export function getCellValue<T extends object>(row: T, column: GridColumn<T> | undefined, field: string): unknown {
  return column?.calculateCellValue ? column.calculateCellValue(row) : getValue(row, field);
}

export function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" sin desfase de zona horaria para cadenas ISO. */
export function toDateKey(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  const text = String(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(text);
  return toDateKey(Number.isNaN(parsed.getTime()) ? null : parsed);
}

function toTime(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  const ms = Date.parse(String(value));
  return Number.isNaN(ms) ? null : ms;
}

const numberFormatCache = new Map<string, Intl.NumberFormat>();

function cachedNumberFormat(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const cacheKey = JSON.stringify(options);
  let formatter = numberFormatCache.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, options);
    numberFormatCache.set(cacheKey, formatter);
  }
  return formatter;
}

function formatNumber(value: number, format: GridFormat | undefined): string {
  const precision =
    format && "precision" in format && format.precision != null ? format.precision : undefined;
  const digits = (fallbackMax: number) => ({
    minimumFractionDigits: precision ?? 0,
    maximumFractionDigits: precision ?? fallbackMax,
  });
  if (format?.type === "currency") {
    return cachedNumberFormat({
      style: "currency",
      currency: format.currency ?? "PEN",
      ...digits(2),
      ...(precision == null ? { minimumFractionDigits: 2 } : null),
    }).format(value);
  }
  if (format?.type === "percent") {
    return cachedNumberFormat({ style: "percent", ...digits(0) }).format(value);
  }
  if (format?.type === "fixedPoint") {
    return cachedNumberFormat(digits(2)).format(value);
  }
  return cachedNumberFormat({ maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: unknown, withTime: boolean): string {
  if (!withTime) {
    const key = toDateKey(value);
    if (!key) return String(value ?? "");
    const [y, m, d] = key.split("-");
    return `${d}/${m}/${y}`;
  }
  const ms = toTime(value);
  if (ms == null) return String(value ?? "");
  const date = new Date(ms);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatValue<T extends object>(column: GridColumn<T>, value: unknown): string {
  if (value == null || value === "") return "";
  if (column.lookup) {
    const item = column.lookup.find((entry) => entry.value === value || String(entry.value) === String(value));
    if (item) return item.label;
  }
  if (typeof column.format === "function") return column.format(value);

  const format = column.format;
  const type: GridDataType = column.dataType ?? "string";

  if (format?.type === "date") return formatDate(value, false);
  if (format?.type === "datetime") return formatDate(value, true);
  if (type === "date") return formatDate(value, false);
  if (type === "datetime") return formatDate(value, true);
  if (type === "boolean") return value ? "Sí" : "No";
  if (type === "number" || format) {
    const n = toNumber(value);
    if (n != null) return formatNumber(n, format);
  }
  return String(value);
}

export function compareValues(a: unknown, b: unknown, type: GridDataType = "string"): number {
  const aEmpty = a == null || a === "";
  const bEmpty = b == null || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return -1;
  if (bEmpty) return 1;

  if (type === "number") return (toNumber(a) ?? 0) - (toNumber(b) ?? 0);
  if (type === "date" || type === "datetime") return (toTime(a) ?? 0) - (toTime(b) ?? 0);
  if (type === "boolean") return Number(Boolean(a)) - Number(Boolean(b));
  return String(a).localeCompare(String(b), "es", { numeric: true, sensitivity: "base" });
}

/**
 * Filtro de la fila de filtros. Números: acepta operadores (>, <, >=, <=, =, <>).
 * Fechas: coincidencia exacta del día. Booleanos: "true"/"false". Texto: contiene.
 */
export function matchesFilter<T extends object>(
  value: unknown,
  column: GridColumn<T>,
  filterText: string
): boolean {
  const text = filterText.trim();
  if (!text) return true;
  const type = column.dataType ?? "string";

  if (type === "boolean") {
    if (text === "true") return Boolean(value) === true;
    if (text === "false") return Boolean(value) === false;
    return true;
  }

  if (type === "date" || type === "datetime") {
    return toDateKey(value) === text;
  }

  if (type === "number" && !column.lookup) {
    const match = /^(<>|>=|<=|=|>|<)?\s*(-?\d+(?:[.,]\d+)?)$/.exec(text);
    if (match) {
      const target = Number(match[2].replace(",", "."));
      const n = toNumber(value);
      if (n == null) return false;
      switch (match[1]) {
        case ">": return n > target;
        case "<": return n < target;
        case ">=": return n >= target;
        case "<=": return n <= target;
        case "<>": return n !== target;
        default: return n === target;
      }
    }
  }

  return normalizeText(formatValue(column, value)).includes(normalizeText(text));
}

export function buildGroupTree<T extends object>(
  rows: T[],
  fields: string[],
  columns: Map<string, GridColumn<T>>,
  groupOrder: Map<string, SortOrder>,
  level = 0,
  parentKey = ""
): GroupNode<T>[] {
  const field = fields[level];
  const column = columns.get(field);
  const buckets = new Map<string, GroupNode<T>>();

  for (const row of rows) {
    const value = getCellValue(row, column, field);
    const type = column?.dataType;
    const bucketKey =
      value == null || value === ""
        ? "∅"
        : type === "date" || type === "datetime"
        ? toDateKey(value) ?? String(value)
        : String(value);
    let node = buckets.get(bucketKey);
    if (!node) {
      node = { key: `${parentKey}/${field}=${bucketKey}`, field, value, level, leaves: [], children: null };
      buckets.set(bucketKey, node);
    }
    node.leaves.push(row);
  }

  const direction = groupOrder.get(field) === "desc" ? -1 : 1;
  const nodes = [...buckets.values()].sort(
    (a, b) => direction * compareValues(a.value, b.value, column?.dataType)
  );

  if (level + 1 < fields.length) {
    for (const node of nodes) {
      node.children = buildGroupTree(node.leaves, fields, columns, groupOrder, level + 1, node.key);
    }
  }
  return nodes;
}

export function flattenGroups<T extends object>(
  nodes: GroupNode<T>[],
  collapsed: Set<string>,
  out: DisplayItem<T>[] = []
): DisplayItem<T>[] {
  for (const node of nodes) {
    out.push({ type: "group", node });
    if (collapsed.has(node.key)) continue;
    if (node.children) flattenGroups(node.children, collapsed, out);
    else for (const row of node.leaves) out.push({ type: "row", row });
  }
  return out;
}

export function collectGroupKeys<T extends object>(nodes: GroupNode<T>[], out: string[] = []): string[] {
  for (const node of nodes) {
    out.push(node.key);
    if (node.children) collectGroupKeys(node.children, out);
  }
  return out;
}

const SUMMARY_LABEL = {
  sum: "Suma",
  count: "Cant.",
  avg: "Prom.",
  min: "Mín.",
  max: "Máx.",
} as const;

export function computeSummary<T extends object>(
  rows: T[],
  item: GridSummaryItem,
  column?: GridColumn<T>
): number | null {
  if (item.type === "count") return rows.length;
  const numbers: number[] = [];
  for (const row of rows) {
    const n = toNumber(getCellValue(row, column, item.column));
    if (n != null) numbers.push(n);
  }
  if (numbers.length === 0) return null;
  switch (item.type) {
    case "sum": return numbers.reduce((acc, n) => acc + n, 0);
    case "avg": return numbers.reduce((acc, n) => acc + n, 0) / numbers.length;
    case "min": return Math.min(...numbers);
    default: return Math.max(...numbers);
  }
}

export function formatSummary<T extends object>(
  rows: T[],
  item: GridSummaryItem,
  column?: GridColumn<T>
): string {
  const value = computeSummary(rows, item, column);
  const label = item.label ?? SUMMARY_LABEL[item.type];
  if (value == null) return `${label}: -`;
  const text =
    typeof item.format === "function"
      ? item.format(value)
      : item.format || item.type === "count"
      ? item.type === "count"
        ? String(value)
        : formatNumber(value, item.format)
      : column?.format && typeof column.format !== "function"
      ? formatNumber(value, column.format)
      : formatNumber(value, undefined);
  return `${label}: ${text}`;
}
