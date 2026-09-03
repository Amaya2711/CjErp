import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, ReactNode } from "react";
import * as XLSX from "xlsx";
import { analizarMigracionImport, aplicarMigracionImport } from "../../../api/migracionImportService";
import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppStatusMessage from "../../../components/base/AppStatusMessage";

type ValidationMode = "migrar" | "actualizar";

type HeaderRule = {
  label: string;
  aliases?: string[];
};

type LoadedWorkbook = {
  fileName: string;
  sheetNames: string[];
  sheetName: string;
  headers: string[];
  rows: string[][];
  sourceRowCount: number;
  duplicateGroups: MigracionImportGrupoDuplicadoDto[];
};

type MigracionImportRegistroDuplicadoDto = {
  filaOrigen: number;
  valores: string[];
};

type MigracionImportGrupoDuplicadoDto = {
  clave: string;
  cantidadRegistros: number;
  montoOcTotal: number;
  registros: MigracionImportRegistroDuplicadoDto[];
};

type ValidationIssue = {
  rowNumber: number;
  field: string;
  message: string;
};

type ValidationSummary = {
  mode: ValidationMode;
  fileName: string;
  sheetName: string;
  sheetNames: string[];
  sourceRowCount: number;
  totalRows: number;
  totalColumns: number;
  headers: string[];
  missingColumns: string[];
  extraColumns: string[];
  rowsWithIssues: number;
  totalIssues: number;
  issues: ValidationIssue[];
  duplicateGroups: MigracionImportGrupoDuplicadoDto[];
  previewRows: Array<{
    rowNumber: number;
    values: string[];
    issueCount: number;
  }>;
};

const MIGRAR_COLUMNS: HeaderRule[] = [
  { label: "OCPOS" },
  { label: "OT" },
  { label: "PAP" },
  { label: "CODIGO" },
  { label: "SITE" },
  { label: "TIPO_TRABAJO" },
  { label: "WORK" },
  { label: "PROYECTO" },
  { label: "PROYECTO2" },
  { label: "ZONA" },
  { label: "COORD" },
  { label: "FECHA_ASIG" },
  { label: "MES_ASIG" },
  { label: "AÃ‘O_ASIG", aliases: ["ANO_ASIG"] },
  { label: "ESTADO_OC" },
  { label: "NRO_OC" },
  { label: "POS" },
  { label: "FECHA" },
  { label: "MONTO_OC" },
  { label: "MONTO_LIQ" },
  { label: "LIQUIDACION_PAP" },
  { label: "EA_PAP" },
  { label: "FECHA_EA" },
  { label: "TIEMPO_EA" },
  { label: "ANTIG_EA" },
  { label: "CEN_FILE" },
  { label: "GIS" },
  { label: "ATP" },
  { label: "FOLIO" },
  { label: "EA" },
  { label: "ESTATUS_PAP" },
  { label: "FACTURADO" },
  { label: "MES_FAC" },
  { label: "ESTATUS_CJ" },
  { label: "MES_ACT" },
  { label: "FECHA_ACT" },
  { label: "GERENCIA" },
  { label: "GERENCIA2" },
  { label: "ESTUDIOS_ING" },
  { label: "PLANOS" },
  { label: "VALORIZACION" },
  { label: "OT_CW" },
  { label: "RNI" },
  { label: "PRE_PASIVO" },
  { label: "CAPITALIZACIÃ“N", aliases: ["CAPITALIZACION"] },
  { label: "CLIENTE" },
  { label: "AÃ‘O_OP.", aliases: ["ANO_OP."] },
  { label: "MONEDA" },
  { label: "ID_MONEDA", aliases: ["IDMONEDA"] },
  { label: "ESTATUS OT2", aliases: ["ESTATUS_OT2"] },
  { label: "ESTATUS OT", aliases: ["ESTATUS_OT"] },
  { label: "FOLIO." },
  { label: "STATUS_ATP" },
  { label: "GIS_PAP" },
  { label: "GIS_INTERNO" },
  { label: "ALTAS" },
  { label: "Responsable" },
  { label: "DEPARTAMENTO" },
  { label: "DÃAS_ACT", aliases: ["DIAS_ACT", "DIAS ON AIR"] },
  { label: "ANTG. ACT.", aliases: ["ANTG_ACT", "ANTG. ON AIR"] },
];

const ACTUALIZAR_COLUMNS: HeaderRule[] = [
  { label: "CLIENTE" },
  { label: "PROYECTO" },
  { label: "CODIGO" },
  { label: "SITE" },
  { label: "OT" },
  { label: "TIPO_TRABAJO" },
  { label: "AÃ‘O_OP.", aliases: ["ANO_OP."] },
  { label: "MONEDA" },
  { label: "ID_MONEDA", aliases: ["IDMONEDA"] },
  { label: "MONTO_BCK" },
  { label: "ATP" },
  { label: "ESTATUS_PAP" },
  { label: "ESTADO OC", aliases: ["ESTADO_OC"] },
  { label: "NRO_OC" },
  { label: "MONTO_OC" },
  { label: "MONTO_LIQ" },
  { label: "POS" },
  { label: "CEN_FILE" },
  { label: "GIS" },
  { label: "FOLIO" },
  { label: "FOLIO." },
  { label: "EA" },
  { label: "ESTATUS OT", aliases: ["ESTATUS_OT"] },
  { label: "ESTATUS OT2", aliases: ["ESTATUS_OT2"] },
  { label: "ZONA" },
  { label: "CAPITALIZACIÃ“N", aliases: ["CAPITALIZACION"] },
  { label: "ESTATUS_CJ" },
  { label: "FACTURADO" },
  { label: "PRE_PASIVO" },
  { label: "PROYECTO2" },
  { label: "DIAS ON AIR", aliases: ["DÃAS_ACT", "DIAS_ACT"] },
  { label: "ANTG. ON AIR", aliases: ["ANTG. ACT.", "ANTG_ACT"] },
  { label: "GERENCIA" },
];

const MIGRAR_REQUIRED_FIELDS: HeaderRule[] = [
  { label: "OCPOS" },
  { label: "OT" },
  { label: "PAP" },
  { label: "CODIGO" },
  { label: "SITE" },
  { label: "TIPO_TRABAJO" },
  { label: "WORK" },
  { label: "PROYECTO" },
  { label: "ZONA" },
  { label: "COORD" },
  { label: "FECHA_ASIG" },
  { label: "MES_ASIG" },
  { label: "AÃ‘O_ASIG", aliases: ["ANO_ASIG"] },
  { label: "ESTADO_OC" },
  { label: "NRO_OC" },
  { label: "POS" },
  { label: "FECHA" },
  { label: "MONTO_OC" },
  { label: "MONTO_LIQ" },
  { label: "LIQUIDACION_PAP" },
  { label: "EA_PAP" },
  { label: "FECHA_EA" },
  { label: "CEN_FILE" },
  { label: "GIS" },
  { label: "ATP" },
  { label: "FOLIO" },
  { label: "ESTATUS_PAP" },
  { label: "FACTURADO" },
  { label: "ESTATUS_CJ" },
  { label: "GERENCIA" },
  { label: "CLIENTE" },
  { label: "AÃ‘O_OP.", aliases: ["ANO_OP."] },
  { label: "MONEDA" },
  { label: "ID_MONEDA", aliases: ["IDMONEDA"] },
  { label: "MONTO_BCK" },
];

const ACTUALIZAR_REQUIRED_FIELDS: HeaderRule[] = [
  { label: "CLIENTE" },
  { label: "PROYECTO" },
  { label: "CODIGO" },
  { label: "SITE" },
  { label: "OT" },
  { label: "TIPO_TRABAJO" },
  { label: "AÃ‘O_OP.", aliases: ["ANO_OP."] },
  { label: "ATP" },
  { label: "ESTATUS_PAP" },
  { label: "ESTADO OC", aliases: ["ESTADO_OC"] },
  { label: "NRO_OC" },
  { label: "MONTO_OC" },
  { label: "MONTO_LIQ" },
  { label: "POS" },
  { label: "CEN_FILE" },
  { label: "GIS" },
  { label: "FOLIO" },
  { label: "FOLIO." },
  { label: "EA" },
  { label: "ESTATUS OT", aliases: ["ESTATUS_OT"] },
  { label: "ESTATUS OT2", aliases: ["ESTATUS_OT2"] },
  { label: "ZONA" },
  { label: "CAPITALIZACIÃ“N", aliases: ["CAPITALIZACION"] },
  { label: "ESTATUS_CJ" },
  { label: "FACTURADO" },
  { label: "PRE_PASIVO" },
  { label: "PROYECTO2" },
  { label: "DIAS ON AIR", aliases: ["DÃAS_ACT", "DIAS_ACT"] },
  { label: "ANTG. ON AIR", aliases: ["ANTG. ACT.", "ANTG_ACT"] },
  { label: "GERENCIA" },
];

const MODE_CONFIG: Record<
  ValidationMode,
  {
    label: string;
    description: string;
    sheetName: string;
    columns: HeaderRule[];
    requiredFields: HeaderRule[];
  }
> = {
  migrar: {
    label: "Migrar",
    description: "Valida el archivo base GENERAL que usa la carga masiva principal.",
    sheetName: "GENERAL",
    columns: MIGRAR_COLUMNS,
    requiredFields: MIGRAR_REQUIRED_FIELDS,
  },
  actualizar: {
    label: "Actualizar",
    description: "Valida la plantilla orientada a estatus, ATP y campos de seguimiento.",
    sheetName: "GENERAL",
    columns: ACTUALIZAR_COLUMNS,
    requiredFields: ACTUALIZAR_REQUIRED_FIELDS,
  },
};

const DUPLICATE_COLUMNS_TO_SHOW: HeaderRule[] = [
  { label: "CLIENTE" },
  { label: "PROYECTO" },
  { label: "CODIGO" },
  { label: "SITE" },
  { label: "OT" },
  { label: "TIPO_TRABAJO" },
  { label: "AÑO_OP.", aliases: ["ANO_OP."] },
  { label: "NRO_OC" },
  { label: "POS" },
  { label: "MONTO_OC" },
  { label: "MONEDA" },
];

const PREVIEW_ROWS = 10;
const MAX_ISSUE_SAMPLES = 30;

function repairMojibake(value: string) {
  if (!/[ÃƒÃ‚ï¿½]/.test(value)) {
    return value;
  }

  try {
    return decodeURIComponent(escape(value));
  } catch {
    return value;
  }
}

function normalizeHeader(value: string) {
  return repairMojibake(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeCellValue(value: unknown) {
  return repairMojibake(String(value ?? "")).trim();
}

function isEmptyCell(value: unknown) {
  return normalizeCellValue(value) === "";
}

function createHeaderIndex(headers: string[]) {
  const index = new Map<string, number>();

  headers.forEach((header, position) => {
    const normalized = normalizeHeader(header);
    if (!normalized || index.has(normalized)) {
      return;
    }

    index.set(normalized, position);
  });

  return index;
}

function getRuleKeys(rule: HeaderRule) {
  return [rule.label, ...(rule.aliases ?? [])].map(normalizeHeader).filter(Boolean);
}

function resolveHeaderIndex(index: Map<string, number>, rule: HeaderRule) {
  for (const key of getRuleKeys(rule)) {
    const match = index.get(key);
    if (match !== undefined) {
      return match;
    }
  }

  return -1;
}

function buildExpectedHeaderSet(rules: HeaderRule[]) {
  const expected = new Set<string>();
  rules.forEach((rule) => {
    getRuleKeys(rule).forEach((key) => expected.add(key));
  });
  return expected;
}

function extractRowValues(row: string[], headers: string[]) {
  return headers.map((header, index) => `${header}: ${normalizeCellValue(row[index] ?? "")}`);
}

function parseAmountValue(value: unknown) {
  const text = normalizeCellValue(value);
  if (!text) {
    return 0;
  }

  let cleaned = text.replace(/[^\d,.-]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    cleaned = cleaned.replace(",", ".");
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmountValue(value: number) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function consolidateWorkbookRows(headers: string[], rows: string[][]) {
  const index = createHeaderIndex(headers);
  const keyColumns = ["CLIENTE", "PROYECTO", "CODIGO", "SITE", "AÑO_OP.", "TIPO_TRABAJO"]
    .map((label) => headers[resolveHeaderIndex(index, { label })])
    .filter((header): header is string => Boolean(header));
  const keyIndexes = keyColumns
    .map((header) => headers.findIndex((item) => normalizeHeader(item) === normalizeHeader(header)))
    .filter((position) => position >= 0);
  const montoBckIndex = resolveHeaderIndex(index, { label: "MONTO_BCK" });

  if (keyIndexes.length < 6 || montoBckIndex === -1) {
    return rows;
  }

  const grouped = new Map<string, string[]>();

  rows.forEach((row) => {
    const key = keyIndexes.map((position) => normalizeCellValue(row[position] ?? "")).join("||");
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, [...row]);
      return;
    }

    existing[montoBckIndex] = formatAmountValue(
      parseAmountValue(existing[montoBckIndex]) + parseAmountValue(row[montoBckIndex])
    );

    row.forEach((value, columnIndex) => {
      if (columnIndex === montoBckIndex) {
        return;
      }

      if (isEmptyCell(existing[columnIndex]) && !isEmptyCell(value)) {
        existing[columnIndex] = value;
      }
    });
  });

  return Array.from(grouped.values());
}

function validateWorkbook(workbook: LoadedWorkbook, mode: ValidationMode): ValidationSummary {
  const config = MODE_CONFIG[mode];
  const index = createHeaderIndex(workbook.headers);
  const expectedHeaderSet = buildExpectedHeaderSet(config.columns);

  const missingColumns = config.columns
    .filter((rule) => resolveHeaderIndex(index, rule) === -1)
    .map((rule) => rule.label);

  const extraColumns = workbook.headers.filter((header) => !expectedHeaderSet.has(normalizeHeader(header)));

  const issues: ValidationIssue[] = [];
  const previewRows: ValidationSummary["previewRows"] = [];
  const issueByRow = new Map<number, number>();

  workbook.rows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2;
    let issueCount = 0;

    for (const rule of config.requiredFields) {
      const columnIndex = resolveHeaderIndex(index, rule);
      if (columnIndex === -1) {
        continue;
      }

      if (isEmptyCell(row[columnIndex])) {
        issueCount += 1;
        if (issues.length < MAX_ISSUE_SAMPLES) {
          issues.push({
            rowNumber,
            field: rule.label,
            message: "La celda estÃ¡ vacÃ­a.",
          });
        }
      }
    }

    if (issueCount > 0) {
      issueByRow.set(rowNumber, issueCount);
    }

    if (previewRows.length < PREVIEW_ROWS) {
      previewRows.push({
        rowNumber,
        values: extractRowValues(row, workbook.headers),
        issueCount,
      });
    }
  });

  const totalIssues = workbook.rows.reduce((accumulator, row) => {
    let rowIssues = 0;
    for (const rule of config.requiredFields) {
      const columnIndex = resolveHeaderIndex(index, rule);
      if (columnIndex === -1) {
        continue;
      }

      if (isEmptyCell(row[columnIndex])) {
        rowIssues += 1;
      }
    }
    return accumulator + rowIssues;
  }, 0);

  return {
    mode,
    fileName: workbook.fileName,
    sheetName: workbook.sheetName,
    sheetNames: workbook.sheetNames,
    sourceRowCount: workbook.sourceRowCount,
    totalRows: workbook.rows.length,
    totalColumns: workbook.headers.length,
    headers: workbook.headers,
    missingColumns,
    extraColumns,
    rowsWithIssues: issueByRow.size,
    totalIssues,
    issues,
    duplicateGroups: workbook.duplicateGroups,
    previewRows,
  };
}

function getSummaryLabel(value: number) {
  return value.toLocaleString("es-PE");
}

function SummaryCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn";
}) {
  const tones = {
    neutral: { background: "#FFFFFF", border: "#D8E5F2", label: "#64748B" },
    good: { background: "#ECFDF5", border: "#A7F3D0", label: "#047857" },
    warn: { background: "#FFFBEB", border: "#FDE68A", label: "#92400E" },
  } as const;

  const palette = tones[tone];

  return (
    <div
      style={{
        borderRadius: 16,
        padding: "10px 12px",
        background: palette.background,
        border: `1px solid ${palette.border}`,
      }}
    >
      <div style={{ fontSize: 12, color: palette.label, marginBottom: 4, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color: "#0F172A", lineHeight: 1.05 }}>{value}</div>
    </div>
  );
}

function ModeButton({
  active,
  label,
  description,
  onClick,
}: {
  active: boolean;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: "1 1 240px",
        borderRadius: 16,
        border: active ? "1px solid #0F766E" : "1px solid #D8E5F2",
        background: active ? "linear-gradient(180deg, #0F766E 0%, #0E7490 100%)" : "#FFFFFF",
        color: active ? "#FFFFFF" : "#0F172A",
        padding: "14px 16px",
        textAlign: "left",
        boxShadow: active ? "0 12px 24px rgba(15, 118, 110, 0.18)" : "none",
        cursor: "pointer",
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 12, lineHeight: 1.5, opacity: active ? 0.95 : 0.72 }}>{description}</div>
    </button>
  );
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const palette = {
    neutral: { background: "#EEF2FF", color: "#3730A3", border: "#C7D2FE" },
    good: { background: "#ECFDF5", color: "#047857", border: "#A7F3D0" },
    warn: { background: "#FFFBEB", color: "#92400E", border: "#FDE68A" },
    bad: { background: "#FEF2F2", color: "#B91C1C", border: "#FECACA" },
  } as const;

  const colors = palette[tone];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "5px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background: colors.background,
        color: colors.color,
        border: `1px solid ${colors.border}`,
      }}
    >
      {children}
    </span>
  );
}

function SectionToggleButton({
  expanded,
  onClick,
  expandedLabel,
  collapsedLabel,
}: {
  expanded: boolean;
  onClick: () => void;
  expandedLabel: string;
  collapsedLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "1px solid #C7D2FE",
        background: expanded ? "#EEF2FF" : "#FFFFFF",
        color: "#3730A3",
        borderRadius: 999,
        padding: "9px 14px",
        fontSize: 13,
        fontWeight: 800,
        cursor: "pointer",
        alignSelf: "flex-start",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span>{expanded ? "▴" : "▾"}</span>
      <span>{expanded ? expandedLabel : collapsedLabel}</span>
    </button>
  );
}

function SectionBlockHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: "#0F172A" }}>{title}</div>
        {subtitle ? <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.5 }}>{subtitle}</div> : null}
      </div>
      {action}
    </div>
  );
}

export default function MImportarPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<ValidationMode>("actualizar");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [applyMessage, setApplyMessage] = useState("");
  const [workbookData, setWorkbookData] = useState<LoadedWorkbook | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showDuplicateGroups, setShowDuplicateGroups] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const summary = useMemo(() => {
    if (!workbookData) {
      return null;
    }

    return validateWorkbook(workbookData, mode);
  }, [mode, workbookData]);

  const currentConfig = MODE_CONFIG[mode];

  const handleFile = async (file: File) => {
    setLoadError("");
    setApplyMessage("");
    setLoading(true);
    setSelectedFile(file);
    setShowDuplicateGroups(false);
    setShowPreview(false);

    try {
      if (!file.name.toLowerCase().endsWith(".xlsx")) {
        throw new Error("Solo se permiten archivos .xlsx.");
      }

      const response = await analizarMigracionImport(file);
      setWorkbookData({
        fileName: response.nombreArchivo || file.name,
        sheetNames: response.hojas,
        sheetName: response.nombreHoja,
        headers: response.encabezados,
        rows: response.filas.map((row) => row.map((value) => normalizeCellValue(value))),
        sourceRowCount: response.filasOrigen,
        duplicateGroups: response.duplicados,
      });
    } catch (error) {
      setWorkbookData(null);
      setLoadError(error instanceof Error ? error.message : "No se pudo leer el archivo Excel.");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await handleFile(file);
    }
    event.target.value = "";
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);

    const file = event.dataTransfer.files?.[0];
    if (file) {
      await handleFile(file);
    }
  };

  const clearFile = () => {
    setWorkbookData(null);
    setLoadError("");
    setApplyMessage("");
    setSelectedFile(null);
    setShowDuplicateGroups(false);
    setShowPreview(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleApply = async () => {
    if (!selectedFile) {
      setLoadError("Primero debes cargar un archivo Excel.");
      return;
    }

    setLoadError("");
    setApplying(true);

    try {
      const result = await aplicarMigracionImport(selectedFile, mode);
      setApplyMessage(
        mode === "migrar"
          ? `Store de INSERT ejecutado: ${result.filasInsertadas} filas insertadas y ${result.operacionesCjNuevas} operaciones nuevas.`
          : `Store de UPDATE ejecutado: ${result.filasActualizadas} filas actualizadas, ${result.filasNoEncontradas} no encontradas y ${result.operacionesCjNuevas} operaciones nuevas.`
      );
    } catch (error) {
      setApplyMessage("");
      setLoadError(error instanceof Error ? error.message : "No se pudo ejecutar el store de migracion.");
    } finally {
      setApplying(false);
    }
  };

  const hasSummary = Boolean(summary);
  const hasCriticalErrors = Boolean(summary && summary.missingColumns.length > 0);
  const duplicatedRowsCount = summary ? summary.sourceRowCount - summary.totalRows : 0;
  const duplicateHeaderIndex = useMemo(
    () => (summary ? createHeaderIndex(summary.headers) : new Map<string, number>()),
    [summary]
  );
  const getDuplicateCellValue = (values: string[], rule: HeaderRule) => {
    const columnIndex = resolveHeaderIndex(duplicateHeaderIndex, rule);
    return columnIndex >= 0 ? values[columnIndex] ?? "" : "";
  };
  const handleExportDuplicateGroups = () => {
    if (!summary || summary.duplicateGroups.length === 0) {
      return;
    }

    const exportRows = summary.duplicateGroups.flatMap((group) =>
      group.registros.map((record) => {
        const row: Record<string, string | number> = {
          "Grupo duplicado": group.clave,
          "Fila origen": record.filaOrigen,
        };

        DUPLICATE_COLUMNS_TO_SHOW.forEach((column) => {
          row[column.label] = getDuplicateCellValue(record.valores, column) || "";
        });

        return row;
      })
    );

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Duplicados");

    const fileBaseName = summary.fileName.replace(/\.[^.]+$/, "");
    XLSX.writeFile(workbook, `${fileBaseName}_duplicados.xlsx`);
  };

  return (
    <AppPage
      style={{
        background:
          "radial-gradient(circle at top left, rgba(15, 118, 110, 0.12), transparent 28%), linear-gradient(180deg, #F8FAFC 0%, #F0FDFA 100%)",
      }}
      fillHeight
    >
      <div style={{ display: "grid", gap: 18 }}>
        <AppCard
          style={{
            marginBottom: 0,
            border: "1px solid rgba(15, 118, 110, 0.12)",
            background: "linear-gradient(180deg, #FFFFFF 0%, #F8FFFE 100%)",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.8fr)", gap: 18 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                <Pill tone="good">Hoja GENERAL</Pill>
                <Pill tone="neutral">Validación Excel</Pill>
                <Pill tone={mode === "migrar" ? "good" : "warn"}>{currentConfig.label}</Pill>
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.1 }}>Importador de migración</h1>
                <p style={{ margin: "10px 0 0", fontSize: 14, color: "#475569", lineHeight: 1.6 }}>
                  Carga el archivo del sistema VB .NET 2019, revisa si la estructura coincide con el formato
                  esperado y detecta observaciones antes de mover los datos al proceso real.
                </p>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                <ModeButton
                  active={mode === "migrar"}
                  label="Migrar"
                  description="Usa la estructura completa del archivo GENERAL adjunto."
                  onClick={() => setMode("migrar")}
                />
                <ModeButton
                  active={mode === "actualizar"}
                  label="Actualizar"
                  description="Valida la plantilla orientada a estatus, ATP y campos de seguimiento."
                  onClick={() => setMode("actualizar")}
                />
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(170px, 0.55fr) minmax(0, 1.45fr)",
                gap: 8,
                alignItems: "stretch",
              }}
            >
              <div style={{ display: "grid", gap: 8 }}>
                <SummaryCard label="Filas leídas" value={getSummaryLabel(summary?.totalRows ?? 0)} tone="neutral" />
                <SummaryCard
                  label="Columnas detectadas"
                  value={getSummaryLabel(summary?.totalColumns ?? 0)}
                  tone="neutral"
                />
                <SummaryCard
                  label="Columnas faltantes"
                  value={getSummaryLabel(summary?.missingColumns.length ?? 0)}
                  tone={summary?.missingColumns.length ? "warn" : "good"}
                />
              </div>

              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                style={{
                  borderRadius: 18,
                  border: dragActive ? "1px solid #0F766E" : "1px dashed #94A3B8",
                  background: dragActive ? "rgba(15, 118, 110, 0.08)" : "linear-gradient(180deg, #F8FAFC 0%, #ECFEFF 100%)",
                  padding: 18,
                  minHeight: 220,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: 14,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>
                    Arrastra el Excel aquí
                  </div>
                  <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6 }}>
                    También puedes abrir el explorador y seleccionar el archivo manualmente. El importador
                    comprobará la hoja <strong>{currentConfig.sheetName}</strong>, los encabezados y las filas
                    con valores vacíos.
                  </div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx"
                    onChange={handleInputChange}
                    style={{ display: "none" }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading || applying}
                    style={{
                      padding: "11px 16px",
                      borderRadius: 12,
                      border: "none",
                      background: "#0F766E",
                      color: "#FFFFFF",
                      fontWeight: 800,
                      cursor: loading || applying ? "not-allowed" : "pointer",
                    }}
                  >
                    {loading ? "Leyendo..." : "Cargar Excel"}
                  </button>
                  <button
                    type="button"
                    onClick={handleApply}
                    disabled={!selectedFile || !hasSummary || hasCriticalErrors || loading || applying}
                    style={{
                      padding: "11px 16px",
                      borderRadius: 12,
                      border: "none",
                      background: !selectedFile || !hasSummary || hasCriticalErrors || loading || applying ? "#94A3B8" : "#1D4ED8",
                      color: "#FFFFFF",
                      fontWeight: 800,
                      cursor: !selectedFile || !hasSummary || hasCriticalErrors || loading || applying ? "not-allowed" : "pointer",
                    }}
                  >
                    {applying ? "Aplicando..." : "Ejecutar store"}
                  </button>
                  <button
                    type="button"
                    onClick={clearFile}
                    disabled={loading || applying}
                    style={{
                      padding: "11px 16px",
                      borderRadius: 12,
                      border: "1px solid #CBD5E1",
                      background: "#FFFFFF",
                      color: "#0F172A",
                      fontWeight: 800,
                      cursor: loading || applying ? "not-allowed" : "pointer",
                    }}
                  >
                    Limpiar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </AppCard>

        {loadError && (
          <AppStatusMessage tone="error" style={{ marginBottom: 0 }}>
            {loadError}
          </AppStatusMessage>
        )}

        {applyMessage && (
          <AppStatusMessage tone="success" style={{ marginBottom: 0 }}>
            {applyMessage}
          </AppStatusMessage>
        )}

        {!hasSummary && (
          <AppCard style={{ marginBottom: 0 }}>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#0F172A" }}>Guí­a rápida</div>
              <div style={{ color: "#475569", lineHeight: 1.7, fontSize: 14 }}>
                <div>1. Selecciona el modo que corresponda al archivo VB.</div>
                <div>2. Carga el Excel con la hoja <strong>GENERAL</strong>.</div>
                <div>3. Revisa las columnas faltantes, las diferencias y el detalle de filas observadas.</div>
              </div>
            </div>
          </AppCard>
        )}

            {summary && (
              <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: 10,
              }}
            >
            </div>

            <AppCard style={{ marginBottom: 0 }}>
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                  <Pill tone="neutral">{summary.fileName}</Pill>
                  <Pill tone="neutral">Hoja: {summary.sheetName}</Pill>
                  <Pill tone={summary.missingColumns.length ? "warn" : "good"}>
                    {summary.missingColumns.length ? "Estructura incompleta" : "Estructura válida"}
                  </Pill>
                </div>

                {summary.missingColumns.length > 0 && (
                  <AppStatusMessage tone="error">
                    Faltan columnas en el archivo: {summary.missingColumns.join(", ")}.
                  </AppStatusMessage>
                )}

                {duplicatedRowsCount > 0 && (
                  <AppStatusMessage tone="success">
                    Se consolidaron {duplicatedRowsCount} filas duplicadas usando la clave
                    cliente + proyecto + idsite + site + anogestion + tipo_trabajo y se sumó el campo MONTO_BCK.
                  </AppStatusMessage>
                )}
              </div>
            </AppCard>

            {summary.duplicateGroups.length > 0 && (
              <AppCard style={{ marginBottom: 0 }}>
                <div style={{ display: "grid", gap: 12 }}>
                  <SectionBlockHeader
                    title="Registros duplicados"
                    subtitle="Abre cada grupo para ver las filas originales que se consolidaron."
                    action={
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        <Pill tone={duplicatedRowsCount > 0 ? "warn" : "good"}>
                          {duplicatedRowsCount > 0
                            ? `${duplicatedRowsCount} duplicados consolidados`
                            : "Sin duplicados"}
                        </Pill>
                        <button
                          type="button"
                          onClick={handleExportDuplicateGroups}
                          disabled={!summary || summary.duplicateGroups.length === 0}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: "1px solid #CBD5E1",
                            background: !summary || summary.duplicateGroups.length === 0 ? "#E2E8F0" : "#0F766E",
                            color: "#FFFFFF",
                            fontWeight: 800,
                            cursor: !summary || summary.duplicateGroups.length === 0 ? "not-allowed" : "pointer",
                          }}
                        >
                          Exportar Excel
                        </button>
                        <SectionToggleButton
                          expanded={showDuplicateGroups}
                          onClick={() => setShowDuplicateGroups((current) => !current)}
                          expandedLabel="Contraer duplicados"
                          collapsedLabel="Expandir duplicados"
                        />
                      </div>
                    }
                  />

                  {showDuplicateGroups && (
                    <div style={{ display: "grid", gap: 12 }}>
                    {summary.duplicateGroups.map((group, groupIndex) => (
                      <details
                        key={`${group.clave}-${groupIndex}`}
                        open={groupIndex === 0}
                        style={{
                          border: "1px solid #D8E5F2",
                          borderRadius: 14,
                          background: "#FFFFFF",
                          padding: "12px 14px",
                        }}
                      >
                        <summary
                          style={{
                            cursor: "pointer",
                            display: "flex",
                            flexWrap: "wrap",
                            justifyContent: "space-between",
                            gap: 12,
                            alignItems: "center",
                            listStyle: "none",
                          }}
                        >
                          <div style={{ display: "grid", gap: 6 }}>
                            <div style={{ fontSize: 14, fontWeight: 900, color: "#0F172A" }}>{group.clave}</div>
                            <div style={{ fontSize: 12, color: "#64748B" }}>
                              {group.registros.length} filas originales encontradas en este grupo.
                            </div>
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            <Pill tone="warn">{group.cantidadRegistros} registros</Pill>
                            <Pill tone="neutral">
                              MONTO_OC total:{" "}
                              {group.montoOcTotal.toLocaleString("es-PE", {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 2,
                              })}
                            </Pill>
                          </div>
                        </summary>

                        <div style={{ overflowX: "auto", marginTop: 12 }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                            <thead>
                              <tr>
                                <th
                                  style={{
                                    textAlign: "left",
                                    padding: "10px 12px",
                                    fontSize: 12,
                                    color: "#475569",
                                    borderBottom: "1px solid #E2E8F0",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  Fila origen
                                </th>
                                {DUPLICATE_COLUMNS_TO_SHOW.map((column) => (
                                  <th
                                    key={column.label}
                                    style={{
                                      textAlign: "left",
                                      padding: "10px 12px",
                                      fontSize: 12,
                                      color: "#475569",
                                      borderBottom: "1px solid #E2E8F0",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {column.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {group.registros.map((record) => (
                                <tr key={`${group.clave}-${record.filaOrigen}`}>
                                  <td
                                    style={{
                                      padding: "10px 12px",
                                      borderBottom: "1px solid #F1F5F9",
                                      whiteSpace: "nowrap",
                                      fontWeight: 800,
                                    }}
                                  >
                                    {record.filaOrigen}
                                  </td>
                                  {DUPLICATE_COLUMNS_TO_SHOW.map((column) => (
                                    <td
                                      key={`${group.clave}-${record.filaOrigen}-${column.label}`}
                                      style={{
                                        padding: "10px 12px",
                                        borderBottom: "1px solid #F1F5F9",
                                        whiteSpace: "nowrap",
                                        color: "#0F172A",
                                      }}
                                      title={getDuplicateCellValue(record.valores, column)}
                                    >
                                      {getDuplicateCellValue(record.valores, column) || "-"}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    ))}
                    </div>
                  )}
                </div>
              </AppCard>
            )}

            <AppCard style={{ marginBottom: 0 }}>
              <div style={{ display: "grid", gap: 12 }}>
                <SectionBlockHeader
                  title="Vista previa"
                  subtitle={`Primeras ${summary.previewRows.length} filas del archivo para verificar que la lectura coincide con el formato.`}
                  action={
                    <SectionToggleButton
                      expanded={showPreview}
                      onClick={() => setShowPreview((current) => !current)}
                      expandedLabel="Contraer vista previa"
                      collapsedLabel="Expandir vista previa"
                    />
                  }
                />

                {showPreview && (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", minWidth: 1200, width: "100%" }}>
                      <thead>
                        <tr>
                          <th
                            style={{
                              position: "sticky",
                              left: 0,
                              background: "#F8FAFC",
                              zIndex: 1,
                              textAlign: "left",
                              padding: "10px 12px",
                              borderBottom: "1px solid #E2E8F0",
                              fontSize: 12,
                              color: "#475569",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Fila
                          </th>
                          <th
                            style={{
                              position: "sticky",
                              left: 70,
                              background: "#F8FAFC",
                              zIndex: 1,
                              textAlign: "left",
                              padding: "10px 12px",
                              borderBottom: "1px solid #E2E8F0",
                              fontSize: 12,
                              color: "#475569",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Estado
                          </th>
                          {summary.headers.map((header) => (
                            <th
                              key={header}
                              style={{
                                textAlign: "left",
                                padding: "10px 12px",
                                borderBottom: "1px solid #E2E8F0",
                                fontSize: 12,
                                color: "#475569",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {summary.previewRows.map((row) => (
                          <tr key={row.rowNumber}>
                            <td
                              style={{
                                position: "sticky",
                                left: 0,
                                background: "#FFFFFF",
                                padding: "10px 12px",
                                borderBottom: "1px solid #F1F5F9",
                                whiteSpace: "nowrap",
                                fontWeight: 800,
                              }}
                            >
                              {row.rowNumber}
                            </td>
                            <td
                              style={{
                                position: "sticky",
                                left: 70,
                                background: "#FFFFFF",
                                padding: "10px 12px",
                                borderBottom: "1px solid #F1F5F9",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {row.issueCount > 0 ? <Pill tone="warn">Con observaciones</Pill> : <Pill tone="good">OK</Pill>}
                            </td>
                            {row.values.map((value, index) => (
                              <td
                                key={`${row.rowNumber}-${index}`}
                                style={{
                                  padding: "10px 12px",
                                  borderBottom: "1px solid #F1F5F9",
                                  whiteSpace: "nowrap",
                                  color: "#0F172A",
                                }}
                                title={value}
                              >
                                {value || "-"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </AppCard>

          </>
        )}

        {hasSummary && hasCriticalErrors && (
          <AppStatusMessage tone="error" style={{ marginBottom: 0 }}>
            El archivo cargado tiene diferencias frente al formato esperado. Revisa las columnas faltantes antes de
            continuar.
          </AppStatusMessage>
        )}
      </div>
    </AppPage>
  );
}
