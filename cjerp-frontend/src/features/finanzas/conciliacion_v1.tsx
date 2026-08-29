import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Cell, Label, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { API_BASE_URL } from "../../api/httpClient";
import httpClient from "../../api/httpClient";
import {
  actualizarClasificacionMovimientoConciliacionV1,
  actualizarComentarioMovimientoConciliacionV1,
  analizarConciliacionBcp,
  conciliarPlanillaConciliacionBcp,
  conciliarPlanillaConciliacionV1,
  exportarAnalisisConciliacionBcp,
  insertarConciliacionBcp,
  obtenerCombosClasificacionConciliacionBcp,
} from "../../api/conciliacionService";
import {
  actualizarPlanillaNroOperacion,
  consultarPlanillaEstados,
} from "../../api/planillaConsultaService";
import { getAuthUser } from "../../utils/authStorage";
import type {
  ConciliacionBcpAnalizarResponse,
  ConciliacionBcpArchivoAnalisis,
  ConciliacionBcpClasificacionCombosResponse,
  ConciliacionBcpConciliarPlanillaResponse,
  ConciliacionBcpConciliarPlanillaRegistro,
  ConciliacionBcpExportResponse,
  ConciliacionCuentaContableOption,
  ConciliacionReferenciaOption,
  ConciliacionReglaContableOption,
  ParsedConciliacionExcelFile,
} from "../../models/conciliacionBcp";
import type { PlanillaConsultaParametro } from "../../models/planillaConsulta";
import { getHttpErrorMessage } from "../../utils/httpError";
import { ArrowUpDown, ChevronDown, ChevronRight, Eye, FileDown, Maximize2, Minimize2, Search } from "lucide-react";

const MAX_FILE_SIZE_BYTES = 15_000_000;
type ConciliacionSortKey =
  | "fecha"
  | "codigoBanco"
  | "empresa"
  | "cuenta"
  | "moneda"
  | "monto"
  | "totalPagar"
  | "diferencia"
  | "nroOperacion"
  | "descripcionOperacion"
  | "comentario"
  | "resultadoConciliacion"
  | "tipoCoincidencia"
  | "nroOperacionPlanilla"
  | "cuentaPlanilla"
  | "cuentaInterPlanilla"
  | "clientePlanilla"
  | "proyectoPlanilla"
  | "sitePlanilla"
  | "tipoTrabajoPlanilla"
  | "tareaPlanilla"
  | "responsablePlanilla"
  | "comprobantePlanilla"
  | "areaFlujo"
  | "referencia"
  | "cuentaContable"
  | "conciliado"
  | "estadoConciliacionTexto"
  | "estadoOperativoConciliacion"
  | "fechaConciliacion"
  | "usuarioConciliacion"
  | "observacionConciliacionMovimiento"
  | "bancoPlanilla"
  | "seriePlanilla"
  | "detallePlanilla"
  | "idOc"
  | "correlativoPlanilla";

type ConciliacionSortDirection = "asc" | "desc";
type ConciliacionSortState = {
  key: ConciliacionSortKey;
  direction: ConciliacionSortDirection;
};

type ConciliacionFilterValue = string | string[];
type ConciliacionFilterState = Record<ConciliacionSortKey, ConciliacionFilterValue>;
type ConciliacionResultadoResumen = {
  resultado: string;
  totalPagar: number;
  cantidad: number;
};
type ConciliacionMonedaResumen = {
  moneda: string;
  totalPagar: number;
  cantidad: number;
  resultados: ConciliacionResultadoResumen[];
};
type ConciliacionExecutiveSelection = {
  moneda: string | null;
  resultado: string | null;
};
type ConciliacionExecutiveChartLevel = "bancoMovimiento" | "resultado" | "cuentaContable";
type ConciliacionExecutiveChartPath = {
  bancoMovimiento: string | null;
  resultado: string | null;
};
type ConciliacionExecutiveChartDatum = {
  label: string;
  rawLabel: string;
  value: number;
  count: number;
};
type ConciliacionPlanillaTab = "revision" | "ejecutivo" | "detalle" | "gastos";
type ConciliacionRevisionFilters = {
  cuentaContable: string;
  areaFlujo: string;
  referencia: string;
  empresa: string;
  banco: string;
  system: string;
  cliente: string;
  periodo: string;
};
type ConciliacionRevisionResumen = {
  resumen: string;
  saldoMn: number;
  saldoMe: number;
  saldoMeConvertido: number;
  totalMn: number;
};
type PlanillaGastoConciliacionRow = Record<string, unknown>;
type PlanillaGastoColumnDef = {
  key: string;
  label: string;
  render: (row: PlanillaGastoConciliacionRow) => React.ReactNode;
};

type ConciliacionClasificacionForm = {
  idMovimientoBanco: number;
  idAreaFlujo: string;
  idReferencia: string;
  idCuentaContable: string;
  idReglaContable: string;
  observacionConciliacion: string;
};

type ConciliacionMontoDiferenciaForm = {
  idMovimientoBanco: number;
  montoOriginal: number;
  montoDiferencia: string;
  moneda: string | null;
  nroOperacionPlanilla: string | null;
  fecha: string | null;
};

const DETAIL_STICKY_COLUMN_KEYS: ConciliacionSortKey[] = [
  "fecha",
  "codigoBanco",
  "empresa",
  "cuenta",
  "moneda",
  "monto",
  "totalPagar",
];

const DETAIL_STICKY_COLUMN_WIDTHS: Partial<Record<ConciliacionSortKey, number>> = {
  fecha: 120,
  codigoBanco: 150,
  empresa: 220,
  cuenta: 170,
  moneda: 100,
  monto: 130,
  totalPagar: 140,
};

function getConciliacionDetailStickyLeftOffset(key: ConciliacionSortKey): number {
  const index = DETAIL_STICKY_COLUMN_KEYS.indexOf(key);
  if (index < 0) {
    return 0;
  }

  return DETAIL_STICKY_COLUMN_KEYS.slice(0, index).reduce((sum, currentKey) => sum + (DETAIL_STICKY_COLUMN_WIDTHS[currentKey] ?? 0), 0);
}

function getConciliacionDetailStickyColumnStyle(
  key: ConciliacionSortKey,
  role: "header" | "filter" | "body",
): React.CSSProperties {
  if (!DETAIL_STICKY_COLUMN_KEYS.includes(key)) {
    return {};
  }

  const width = DETAIL_STICKY_COLUMN_WIDTHS[key];
  const baseBackground = role === "header" ? "#F8FAFC" : "#FFFFFF";

  return {
    position: "sticky",
    left: getConciliacionDetailStickyLeftOffset(key),
    minWidth: width,
    width,
    maxWidth: width,
    background: baseBackground,
    zIndex: role === "header" ? 26 : role === "filter" ? 25 : 24,
    boxShadow: "2px 0 0 rgba(226, 232, 240, 0.95)",
  };
}

const DEFAULT_CONCILIACION_FILTERS: ConciliacionFilterState = {
  fecha: "",
  codigoBanco: "",
  empresa: "",
  cuenta: "",
  moneda: "",
  monto: "",
  totalPagar: "",
  diferencia: "",
  nroOperacion: "",
  descripcionOperacion: "",
  comentario: "",
  resultadoConciliacion: [],
  tipoCoincidencia: "",
  nroOperacionPlanilla: "",
  cuentaPlanilla: "",
  cuentaInterPlanilla: "",
  clientePlanilla: "",
  proyectoPlanilla: "",
  sitePlanilla: "",
  tipoTrabajoPlanilla: "",
  tareaPlanilla: "",
  responsablePlanilla: "",
  comprobantePlanilla: "",
  areaFlujo: "",
  referencia: "",
  cuentaContable: "",
  conciliado: "",
  estadoConciliacionTexto: "",
  estadoOperativoConciliacion: "",
  fechaConciliacion: "",
  usuarioConciliacion: "",
  observacionConciliacionMovimiento: "",
  bancoPlanilla: "",
  seriePlanilla: "",
  detallePlanilla: "",
  idOc: "",
  correlativoPlanilla: "",
};
const EXECUTIVE_PIE_COLORS = [
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
const EMPTY_CONCILIACION_FILTER_VALUE = "__EMPTY__";
const DEFAULT_CONCILIACION_REVISION_FILTERS: ConciliacionRevisionFilters = {
  cuentaContable: "",
  areaFlujo: "",
  referencia: "",
  empresa: "",
  banco: "",
  system: "",
  cliente: "",
  periodo: "",
};

const DEFAULT_TIPO_CAMBIO_DIARIO = 3.5;

const DETAIL_CONCILIACION_SEARCH_KEYS: ConciliacionSortKey[] = [
  "fecha",
  "codigoBanco",
  "empresa",
  "cuenta",
  "moneda",
  "monto",
  "totalPagar",
  "diferencia",
  "nroOperacion",
  "descripcionOperacion",
  "comentario",
  "resultadoConciliacion",
  "tipoCoincidencia",
  "nroOperacionPlanilla",
  "cuentaPlanilla",
  "cuentaInterPlanilla",
  "clientePlanilla",
  "proyectoPlanilla",
  "sitePlanilla",
  "tipoTrabajoPlanilla",
  "tareaPlanilla",
  "responsablePlanilla",
  "comprobantePlanilla",
  "areaFlujo",
  "referencia",
  "cuentaContable",
  "conciliado",
  "estadoConciliacionTexto",
  "estadoOperativoConciliacion",
  "fechaConciliacion",
  "usuarioConciliacion",
  "observacionConciliacionMovimiento",
  "bancoPlanilla",
  "seriePlanilla",
  "detallePlanilla",
  "idOc",
  "correlativoPlanilla",
];

const BANCO_OPTIONS = [
  { code: "BCP", label: "BCP", idBanco: 1 },
  { code: "SCOTIABANK", label: "Scotiabank", idBanco: 2 },
] as const;

function getBancoSeleccionadoId(codigo: string): number {
  return BANCO_OPTIONS.find((option) => option.code === codigo)?.idBanco ?? 0;
}

const MOVIMIENTOS_ORDENADOS_COLUMNS = [
  "Empresa",
  "Cuenta",
  "Moneda",
  "Fecha",
  "FechaValuta",
  "Proveedor",
  "ItemSistema",
  "DescripcionOperacion",
  "Referencia",
  "CDR",
  "Modulo",
  "Transaccion",
  "Relacion",
  "Monto",
  "SucursalAgencia",
  "NroOperacion",
  "Usuario",
  "ArchivoOrigen",
  "UsuarioImportacion",
  "IdActivo",
  "EsNroOperacionValido",
  "TipoMovimientoBanco",
  "EstadoConciliacion",
] as const;

function createSelectionId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(16).slice(2)}`;
}

function validateSelectedFile(file: File): string {
  const lowerName = file.name.toLowerCase();

  if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls") && !lowerName.endsWith(".csv")) {
    return "Solo se permiten archivos Excel (.xlsx, .xls) o CSV.";
  }

  if (file.size <= 0) {
    return "El archivo esta vacio.";
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `El archivo supera el tamano maximo permitido de ${MAX_FILE_SIZE_BYTES.toLocaleString("es-PE")} bytes.`;
  }

  return "";
}

function normalizeCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return String(value).trim();
}

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function isRowEmpty(row: string[]) {
  return row.every((cell) => !String(cell ?? "").trim());
}

function formatNumber(value: number): string {
  return value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normalizeTotalPagarForComparison(value?: number | null): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return value > 0 ? -Math.abs(value) : value;
}

function getPlanillaAmountForComparison(row: ConciliacionBcpConciliarPlanillaRegistro): number | null {
  return normalizeTotalPagarForComparison(row.totalPagar);
}

function getConciliacionPlanillaAggregationKey(row: ConciliacionBcpConciliarPlanillaRegistro): string {
  const tipoCoincidencia = row.tipoCoincidencia?.trim();
  const nroOperacionPlanilla = row.nroOperacionPlanilla?.trim();
  if (tipoCoincidencia || nroOperacionPlanilla) {
    return [
      `tipoCoincidencia:${normalizeText(tipoCoincidencia ?? "")}`,
      `nroOperacionPlanilla:${normalizeText(nroOperacionPlanilla ?? "")}`,
    ].join("|");
  }

  const idRegistroPlanilla = row.idRegistroPlanilla?.toString().trim();
  if (idRegistroPlanilla) {
    return `idRegistroPlanilla:${idRegistroPlanilla}`;
  }

  const correlativoPlanilla = row.correlativoPlanilla?.trim();
  if (correlativoPlanilla) {
    return `correlativoPlanilla:${normalizeText(correlativoPlanilla)}`;
  }

  return `movimiento:${row.idMovimientoBanco}`;
}

function getConciliacionRowsForSummary(rows: ConciliacionBcpConciliarPlanillaRegistro[]): ConciliacionBcpConciliarPlanillaRegistro[] {
  const rowsByKey = new Map<string, ConciliacionBcpConciliarPlanillaRegistro>();

  rows.forEach((row) => {
    const key = getConciliacionPlanillaAggregationKey(row);
    const current = rowsByKey.get(key);

    if (!current) {
      rowsByKey.set(key, row);
      return;
    }

    const currentAmount = getPlanillaAmountForComparison(current);
    const newAmount = getPlanillaAmountForComparison(row);

    if (currentAmount == null && newAmount != null) {
      rowsByKey.set(key, row);
    }
  });

  return Array.from(rowsByKey.values());
}

function calculateMontoDiferencia(
  monto?: number | null,
  totalPagar?: number | null
): number | null {
  if (monto === null || monto === undefined || totalPagar === null || totalPagar === undefined) {
    return null;
  }

  return monto - totalPagar;
}

function parseNumericValue(value?: string | number | null): number {
  if (value === null || value === undefined) {
    return Number.NaN;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }

  const normalized = value.toString().replace(/,/g, "").trim();
  if (!normalized) {
    return Number.NaN;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function roundCurrencyValue(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getConciliacionMontoDiferenciaValue(row: ConciliacionBcpConciliarPlanillaRegistro): number | null {
  if (row.diferenciaAjustada !== undefined && row.diferenciaAjustada !== null) {
    return row.diferenciaAjustada;
  }

  return calculateMontoDiferencia(row.monto, getPlanillaAmountForComparison(row));
}

function normalizeComentarioValue(value?: string | null): string {
  return value?.trim() ?? "";
}

function getResultadoChartColor(resultado: string): string {
  const normalized = resultado.trim().toUpperCase();

  if (normalized.includes("NRO OPERACION")) {
    return "#0F766E";
  }

  if (normalized.includes("CUENTA INTER")) {
    return "#0369A1";
  }

  if (normalized.includes("CUENTA")) {
    return "#7C3AED";
  }

  if (normalized.includes("SIN COINCIDENCIA")) {
    return "#DC2626";
  }

  if (normalized.includes("ACTUALIZADO")) {
    return "#4F46E5";
  }

  return "#475569";
}

function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

function normalizeText(value?: string | null): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function resolveTipoMonedaPlanilla(moneda?: string | null): string {
  const normalized = normalizeText(moneda);

  if (!normalized) {
    return "0";
  }

  if (/^\d+$/.test(normalized)) {
    return normalized;
  }

  if (
    normalized.includes("SOLES") ||
    normalized === "SOL" ||
    normalized === "PEN" ||
    normalized === "MN"
  ) {
    return "1";
  }

  if (
    normalized.includes("DOLAR") ||
    normalized === "USD" ||
    normalized === "ME" ||
    normalized.includes("DOL")
  ) {
    return "2";
  }

  return "0";
}

function isScotiabankBankCode(codigoBanco?: string | null): boolean {
  return normalizeText(codigoBanco).includes("SCOTIABANK");
}

function joinNonEmptyCells(cells: string[] | undefined, startIndex = 0): string {
  return (cells ?? [])
    .slice(startIndex)
    .map((cell) => normalizeCellValue(cell))
    .filter(Boolean)
    .join(" ")
    .trim();
}

function extractScotiabankCompany(matrix: string[][]): string {
  return normalizeCellValue(matrix[2]?.[0]);
}

function extractScotiabankCuenta(matrix: string[][]): string {
  const accountRow = matrix[3] ?? [];
  const combined = joinNonEmptyCells(accountRow, 1) || joinNonEmptyCells(accountRow);

  if (!combined) {
    return "";
  }

  return combined.replace(/^CUENTA\s+CORRIENTE\s*/i, "").trim();
}

function extractScotiabankMonedaFromSaldoContable(matrix: string[][]): string {
  const saldoRow = joinNonEmptyCells(matrix[4] ?? []);

  if (!saldoRow) {
    return "";
  }

  if (saldoRow.includes("S/")) {
    return "Soles";
  }

  if (saldoRow.includes("$")) {
    return "Dólares";
  }

  return "";
}

function getConciliacionExecutivePieLevelLabel(level: ConciliacionExecutiveChartLevel): string {
  switch (level) {
    case "bancoMovimiento":
      return "Banco movimiento";
    case "resultado":
      return "Resultado";
    case "cuentaContable":
      return "Cuenta contable";
    default:
      return "Banco movimiento";
  }
}

function getConciliacionExecutivePieLabel(
  row: ConciliacionBcpConciliarPlanillaRegistro,
  level: ConciliacionExecutiveChartLevel
): string {
  switch (level) {
    case "bancoMovimiento":
      return row.codigoBanco?.trim() || row.empresa?.trim() || "Sin banco movimiento";
    case "resultado":
      return row.resultadoConciliacion?.trim() || "Sin resultado";
    case "cuentaContable":
      return row.cuentaContableTexto?.trim() || (row.esConciliado ? "Sin cuenta contable" : "PENDIENTE");
    default:
      return "Sin clasificar";
  }
}
function getReferenciaLabel(row: ConciliacionBcpConciliarPlanillaRegistro): string {
  return row.codigoReferencia?.trim() || row.nombreReferencia?.trim() || "";
}

function getConciliadoLabel(row: ConciliacionBcpConciliarPlanillaRegistro): string {
  if (row.estadoOperativoConciliacion?.trim()) {
    return row.estadoOperativoConciliacion.trim();
  }

  if ((row.nombreAreaFlujo ?? "").trim().toUpperCase() === "NO CONSIDERAR") {
    return "NO CONSIDERAR";
  }

  if (row.aplicaConciliacion === false) {
    return "NO APLICA";
  }

  return row.esConciliado ? "CONCILIADO" : "PENDIENTE";
}

function isConciliacionDetalleActionEnabled(row: ConciliacionBcpConciliarPlanillaRegistro): boolean {
  const resultado = normalizeText(getConciliacionDisplayValue(row, "resultadoConciliacion"));
  const diferencia = getConciliacionMontoDiferenciaValue(row);
  return resultado === "SIN COINCIDENCIA" && diferencia !== null;
}

function getClasificacionBadgeStyle(status: string): React.CSSProperties {
  const normalized = status.trim().toUpperCase();

  if (normalized === "CONCILIADO") {
    return styles.statusBadgeSuccess;
  }

  if (normalized === "NO CONSIDERAR") {
    return styles.statusBadgeMuted;
  }

  if (normalized === "NO APLICA") {
    return styles.statusBadgeInfo;
  }

  return styles.statusBadgePending;
}

function getReglaContableLabel(rule: ConciliacionReglaContableOption): string {
  const chunks = [
    `Regla ${rule.idReglaContable}`,
    typeof rule.orden === "number" ? `Orden ${rule.orden}` : "",
    rule.esPrincipal ? "Principal" : "",
    rule.requiereComprobante ? "Req. comp." : "",
    rule.aplicaConciliacion === false ? "No aplica" : "",
    rule.observacion?.trim() ?? "",
  ].filter(Boolean);

  return chunks.join(" | ");
}

function getCuentaContableLabel(
  row: ConciliacionBcpConciliarPlanillaRegistro,
  cuentasContables?: ConciliacionCuentaContableOption[]
): string {
  const cuentaContableResuelta = cuentasContables?.find((item) => item.idCuentaContable === row.idCuentaContable);
  const codigoCuenta = cuentaContableResuelta?.codigoCuenta?.trim() || row.codigoCuenta?.trim() || "";
  const nombreCuenta = cuentaContableResuelta?.nombreCuenta?.trim() || row.nombreCuenta?.trim() || "";
  const cuentaContableTexto =
    cuentaContableResuelta?.cuentaContableTexto?.trim() ||
    row.cuentaContableTexto?.trim() ||
    [codigoCuenta, nombreCuenta].filter(Boolean).join(" - ").trim();

  if (cuentaContableTexto) {
    return cuentaContableTexto;
  }

  if (row.idCuentaContable != null) {
    return String(row.idCuentaContable);
  }

  return row.esConciliado ? "" : "PENDIENTE";
}

function getConciliacionDisplayValue(row: ConciliacionBcpConciliarPlanillaRegistro, key: ConciliacionSortKey): string {
  switch (key) {
    case "fecha":
      return formatDateValue(row.fecha);
    case "codigoBanco":
      return row.codigoBanco || "";
    case "empresa":
      return row.empresa || "";
    case "cuenta":
      return row.cuenta || "";
    case "moneda":
      return row.moneda || "";
    case "monto":
      return row.monto != null ? formatNumber(row.monto) : "";
    case "totalPagar": {
      const totalPagar = getPlanillaAmountForComparison(row);
      return totalPagar != null ? formatNumber(totalPagar) : "";
    }
    case "diferencia": {
      const diferencia = getConciliacionMontoDiferenciaValue(row);
      return diferencia != null ? formatNumber(diferencia) : "";
    }
    case "nroOperacion":
      return row.nroOperacion || "";
    case "descripcionOperacion":
      return row.descripcionOperacion || "";
    case "comentario":
      return row.comentario || "";
    case "resultadoConciliacion":
      return row.resultadoConciliacion || "";
    case "tipoCoincidencia":
      return row.tipoCoincidencia || "";
    case "nroOperacionPlanilla":
      return row.nroOperacionPlanilla || "";
    case "cuentaPlanilla":
      return row.cuentaPlanilla || "";
    case "cuentaInterPlanilla":
      return row.cuentaInterPlanilla || "";
    case "clientePlanilla":
      return row.clientePlanilla || "";
    case "proyectoPlanilla":
      return row.proyectoPlanilla || "";
    case "sitePlanilla":
      return row.sitePlanilla || "";
    case "tipoTrabajoPlanilla":
      return row.tipoTrabajoPlanilla || "";
    case "tareaPlanilla":
      return row.tareaPlanilla || "";
    case "responsablePlanilla":
      return row.responsablePlanilla || "";
    case "comprobantePlanilla":
      return row.comprobantePlanilla || "";
    case "areaFlujo":
      return row.nombreAreaFlujo || (row.esConciliado ? "" : "PENDIENTE");
    case "referencia":
      return getReferenciaLabel(row) || (row.esConciliado ? "" : "PENDIENTE");
    case "cuentaContable":
      return getCuentaContableLabel(row);
    case "conciliado":
      return getConciliadoLabel(row);
    case "estadoConciliacionTexto":
      return row.estadoConciliacionTexto || getConciliadoLabel(row);
    case "estadoOperativoConciliacion":
      return row.estadoOperativoConciliacion || getConciliadoLabel(row);
    case "fechaConciliacion":
      return formatDateValue(row.fechaConciliacion);
    case "usuarioConciliacion":
      return row.usuarioConciliacion || "";
    case "observacionConciliacionMovimiento":
      return row.observacionConciliacionMovimiento || "";
    case "bancoPlanilla":
      return row.bancoPlanilla || "";
    case "seriePlanilla":
      return row.seriePlanilla || "";
    case "detallePlanilla":
      return row.detallePlanilla || "";
    case "idOc":
      return row.idOc || "";
    case "correlativoPlanilla":
      return row.correlativoPlanilla || "";
    default:
      return "";
  }
}

function matchesConciliacionFilter(
  row: ConciliacionBcpConciliarPlanillaRegistro,
  filters: ConciliacionFilterState
) {
  return (Object.keys(filters) as ConciliacionSortKey[]).every((key) => {
    const displayValue = getConciliacionDisplayValue(row, key).trim().toLowerCase();

    if (Array.isArray(filters[key])) {
      const selectedValues = filters[key].map((item) => item.trim().toLowerCase()).filter(Boolean);
      if (selectedValues.length === 0) {
        return true;
      }

      return selectedValues.some((selectedValue) => {
        if (selectedValue === EMPTY_CONCILIACION_FILTER_VALUE.toLowerCase()) {
          return displayValue === "";
        }

        return displayValue === selectedValue;
      });
    }

    const filterValue = filters[key].trim().toLowerCase();
    if (!filterValue) {
      return true;
    }

    if (filterValue === EMPTY_CONCILIACION_FILTER_VALUE.toLowerCase()) {
      return displayValue === "";
    }

    if (key === "descripcionOperacion") {
      return displayValue.includes(filterValue);
    }

    return displayValue === filterValue;
  });
}

function getConciliacionFilterOptionValue(displayValue: string) {
  return displayValue === "" ? EMPTY_CONCILIACION_FILTER_VALUE : displayValue;
}

function isConciliacionMovimientoActivo(row: ConciliacionBcpConciliarPlanillaRegistro): boolean {
  return row.idActivo !== false && row.idActivo !== null && row.idActivo !== undefined;
}

function getConciliacionDetalleSearchText(row: ConciliacionBcpConciliarPlanillaRegistro) {
  return DETAIL_CONCILIACION_SEARCH_KEYS.map((key) => getConciliacionDisplayValue(row, key))
    .join(" ")
    .toLowerCase();
}

function getConciliacionSortValue(row: ConciliacionBcpConciliarPlanillaRegistro, key: ConciliacionSortKey): string | number | null {
  switch (key) {
    case "fecha": {
      const date = row.fecha ? new Date(row.fecha) : null;
      return date && !Number.isNaN(date.getTime()) ? date.getTime() : null;
    }
    case "codigoBanco":
      return row.codigoBanco?.trim().toLowerCase() ?? "";
    case "monto":
      return row.monto ?? null;
    case "totalPagar":
      return getPlanillaAmountForComparison(row);
    case "diferencia":
      return getConciliacionMontoDiferenciaValue(row);
    case "empresa":
      return row.empresa?.trim().toLowerCase() ?? "";
    case "cuenta":
      return row.cuenta?.trim().toLowerCase() ?? "";
    case "moneda":
      return row.moneda?.trim().toLowerCase() ?? "";
    case "nroOperacion":
      return row.nroOperacion?.trim().toLowerCase() ?? "";
    case "descripcionOperacion":
      return row.descripcionOperacion?.trim().toLowerCase() ?? "";
    case "comentario":
      return row.comentario?.trim().toLowerCase() ?? "";
    case "resultadoConciliacion":
      return row.resultadoConciliacion?.trim().toLowerCase() ?? "";
    case "tipoCoincidencia":
      return row.tipoCoincidencia?.trim().toLowerCase() ?? "";
    case "nroOperacionPlanilla":
      return row.nroOperacionPlanilla?.trim().toLowerCase() ?? "";
    case "cuentaPlanilla":
      return row.cuentaPlanilla?.trim().toLowerCase() ?? "";
    case "cuentaInterPlanilla":
      return row.cuentaInterPlanilla?.trim().toLowerCase() ?? "";
    case "clientePlanilla":
      return row.clientePlanilla?.trim().toLowerCase() ?? "";
    case "proyectoPlanilla":
      return row.proyectoPlanilla?.trim().toLowerCase() ?? "";
    case "sitePlanilla":
      return row.sitePlanilla?.trim().toLowerCase() ?? "";
    case "tipoTrabajoPlanilla":
      return row.tipoTrabajoPlanilla?.trim().toLowerCase() ?? "";
    case "tareaPlanilla":
      return row.tareaPlanilla?.trim().toLowerCase() ?? "";
    case "responsablePlanilla":
      return row.responsablePlanilla?.trim().toLowerCase() ?? "";
    case "comprobantePlanilla":
      return row.comprobantePlanilla?.trim().toLowerCase() ?? "";
    case "areaFlujo":
      return row.nombreAreaFlujo?.trim().toLowerCase() ?? "";
    case "referencia":
      return getReferenciaLabel(row).trim().toLowerCase();
    case "cuentaContable":
      return row.cuentaContableTexto?.trim().toLowerCase() ?? "";
    case "conciliado":
      return getConciliadoLabel(row).trim().toLowerCase();
    case "estadoConciliacionTexto":
      return (row.estadoConciliacionTexto ?? getConciliadoLabel(row)).trim().toLowerCase();
    case "estadoOperativoConciliacion":
      return (row.estadoOperativoConciliacion ?? getConciliadoLabel(row)).trim().toLowerCase();
    case "fechaConciliacion": {
      const date = row.fechaConciliacion ? new Date(row.fechaConciliacion) : null;
      return date && !Number.isNaN(date.getTime()) ? date.getTime() : null;
    }
    case "usuarioConciliacion":
      return row.usuarioConciliacion?.trim().toLowerCase() ?? "";
    case "observacionConciliacionMovimiento":
      return row.observacionConciliacionMovimiento?.trim().toLowerCase() ?? "";
    case "bancoPlanilla":
      return row.bancoPlanilla?.trim().toLowerCase() ?? "";
    case "seriePlanilla":
      return row.seriePlanilla?.trim().toLowerCase() ?? "";
    case "detallePlanilla":
      return row.detallePlanilla?.trim().toLowerCase() ?? "";
    case "idOc":
      return row.idOc?.trim().toLowerCase() ?? "";
    case "correlativoPlanilla":
      return row.correlativoPlanilla?.trim().toLowerCase() ?? "";
    default:
      return "";
  }
}

function compareConciliacionValues(
  leftValue: string | number | null,
  rightValue: string | number | null,
  direction: ConciliacionSortDirection
) {
  const leftEmpty = leftValue === null || leftValue === "";
  const rightEmpty = rightValue === null || rightValue === "";

  if (leftEmpty && rightEmpty) {
    return 0;
  }

  if (leftEmpty) {
    return 1;
  }

  if (rightEmpty) {
    return -1;
  }

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return direction === "asc" ? leftValue - rightValue : rightValue - leftValue;
  }

  const leftText = String(leftValue);
  const rightText = String(rightValue);
  return direction === "asc"
    ? leftText.localeCompare(rightText, "es", { numeric: true, sensitivity: "base" })
    : rightText.localeCompare(leftText, "es", { numeric: true, sensitivity: "base" });
}

function findPreferredWorksheetName(sheetNames: string[]): string {
  const preferred = sheetNames.find((sheetName) => normalizeHeader(sheetName) === normalizeHeader("Movimientos Ordenados"));
  return preferred ?? sheetNames[0] ?? "";
}

function buildPreviewText(values: string[]) {
  return values.filter(Boolean).slice(0, 8).join(", ");
}

function buildPreviewTextFromRow(values: unknown[] | undefined) {
  return buildPreviewText((values ?? []).map((value) => normalizeCellValue(value)));
}

function buildOrderedMovementRow(row: Record<string, unknown>) {
  return MOVIMIENTOS_ORDENADOS_COLUMNS.map((column) => {
    if (column === "NroOperacion") {
      return row.NroOperacion ?? row.nroOperacion ?? row.numeroOperacion ?? row.NumeroOperacion ?? row["Nº operación"] ?? row["Operación - NÃºmero"] ?? "";
    }

    return row[column] ?? "";
  });
}

function buildExportOrderedMovementRow(row: ConciliacionBcpExportResponse["movimientos"][number]) {
  return [
    row.empresa ?? "",
    row.cuenta ?? "",
    row.moneda ?? "",
    row.fecha ?? "",
    row.fechaValuta ?? "",
    row.proveedor ?? "",
    row.itemSistema ?? "",
    row.descripcionOperacion ?? "",
    row.referencia ?? "",
    getScotiabankSegmentForExport(row, "cdr", 0, 3),
    getScotiabankSegmentForExport(row, "modulo", 3, 3),
    getScotiabankSegmentForExport(row, "transaccion", 6, 3),
    getScotiabankSegmentForExport(row, "relacion", 9, 4),
    row.monto ?? "",
    row.sucursalAgencia ?? "",
    row.nroOperacion ?? row.numeroOperacion ?? "",
    row.usuario ?? "",
  ];
}

function getPreviewCellValue(row: Record<string, unknown>, column: string) {
  if (column === "NroOperacion") {
    return row.NroOperacion ?? row.nroOperacion ?? row.numeroOperacion ?? row.NumeroOperacion ?? row["NÃ‚Âº operaciÃƒÂ³n"] ?? row["OperaciÃƒÂ³n - NÃƒÂºmero"] ?? "";
  }

  return (
    row[column] ??
    row[column.toLowerCase()] ??
    row[column.charAt(0).toLowerCase() + column.slice(1)] ??
    row[column.toUpperCase()] ??
    ""
  );
}

function getRecordTextValue(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = normalizeCellValue(value);
  return normalized.length > 0 ? normalized : null;
}

function getRecordNumberValue(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatScotiabankCodeSegment(value: unknown, length: number): string {
  const text = normalizeCellValue(value);
  if (!text) {
    return "";
  }

  if (!/^\d+$/.test(text)) {
    return text;
  }

  return text.padStart(length, "0");
}

function getScotiabankSegmentForExport(
  row: ConciliacionBcpExportResponse["movimientos"][number],
  field: "cdr" | "modulo" | "transaccion" | "relacion",
  startIndex: number,
  length: number,
): string {
  const directValue = formatScotiabankCodeSegment(row[field], length);
  if (directValue) {
    return directValue;
  }

  const nroOperacion =
    row.nroOperacion ?? row.numeroOperacion ?? "";
  const nroOperacionText = normalizeCellValue(nroOperacion);
  if (!/^\d+$/.test(nroOperacionText) || nroOperacionText.length < startIndex + length) {
    return "";
  }

  return nroOperacionText.slice(startIndex, startIndex + length);
}

function extractScotiabankSegmentFromOperationNumber(
  nroOperacion: string | null,
  startIndex: number,
  length: number,
): string | null {
  if (!nroOperacion) {
    return null;
  }

  const normalized = nroOperacion.trim();
  if (!/^\d+$/.test(normalized) || normalized.length < startIndex + length) {
    return null;
  }

  const segment = normalized.slice(startIndex, startIndex + length);
  return segment.length === length ? segment : null;
}

function buildExportResponseFromAnalysisData(analysis: ConciliacionBcpAnalizarResponse): ConciliacionBcpExportResponse {
  const movimientos = getAnalysisRows(analysis.archivos).map((row) => {
    const rowRecord = row as Record<string, unknown>;
    const nroOperacion =
      getRecordTextValue(rowRecord, "nroOperacion") ??
      getRecordTextValue(rowRecord, "numeroOperacion") ??
      getRecordTextValue(rowRecord, "NroOperacion");

    return {
      idBanco: getRecordNumberValue(rowRecord, "idBanco"),
      codigoBanco: getRecordTextValue(rowRecord, "codigoBanco"),
      idPlantillaBanco: getRecordNumberValue(rowRecord, "idPlantillaBanco"),
      codigoPlantillaBanco: getRecordTextValue(rowRecord, "codigoPlantillaBanco"),
      empresa: getRecordTextValue(rowRecord, "empresa") ?? getRecordTextValue(rowRecord, "Empresa"),
      cuenta: getRecordTextValue(rowRecord, "cuenta") ?? getRecordTextValue(rowRecord, "Cuenta"),
      moneda: getRecordTextValue(rowRecord, "moneda") ?? getRecordTextValue(rowRecord, "Moneda"),
      fecha: getRecordTextValue(rowRecord, "fecha") ?? getRecordTextValue(rowRecord, "Fecha"),
      fechaValuta: getRecordTextValue(rowRecord, "fechaValuta") ?? getRecordTextValue(rowRecord, "FechaValuta"),
      proveedor: getRecordTextValue(rowRecord, "proveedor") ?? getRecordTextValue(rowRecord, "Proveedor"),
      itemSistema: getRecordTextValue(rowRecord, "itemSistema") ?? getRecordTextValue(rowRecord, "ItemSistema"),
      descripcionOperacion:
        getRecordTextValue(rowRecord, "descripcionOperacion") ?? getRecordTextValue(rowRecord, "DescripcionOperacion"),
      referencia: getRecordTextValue(rowRecord, "referencia") ?? getRecordTextValue(rowRecord, "Referencia"),
      cdr:
        getRecordTextValue(rowRecord, "cdr") ??
        getRecordTextValue(rowRecord, "CDR") ??
        extractScotiabankSegmentFromOperationNumber(nroOperacion, 0, 3),
      modulo:
        getRecordTextValue(rowRecord, "modulo") ??
        getRecordTextValue(rowRecord, "Modulo") ??
        extractScotiabankSegmentFromOperationNumber(nroOperacion, 3, 3),
      transaccion:
        getRecordTextValue(rowRecord, "transaccion") ??
        getRecordTextValue(rowRecord, "Transaccion") ??
        extractScotiabankSegmentFromOperationNumber(nroOperacion, 6, 3),
      relacion:
        getRecordTextValue(rowRecord, "relacion") ??
        getRecordTextValue(rowRecord, "Relacion") ??
        extractScotiabankSegmentFromOperationNumber(nroOperacion, 9, 4),
      monto: getRecordNumberValue(rowRecord, "monto") ?? getRecordNumberValue(rowRecord, "Monto"),
      sucursalAgencia:
        getRecordTextValue(rowRecord, "sucursalAgencia") ?? getRecordTextValue(rowRecord, "SucursalAgencia"),
      nroOperacion,
      usuario: getRecordTextValue(rowRecord, "usuario") ?? getRecordTextValue(rowRecord, "Usuario"),
      archivoOrigen: getRecordTextValue(rowRecord, "archivoOrigen") ?? getRecordTextValue(rowRecord, "ArchivoOrigen"),
    };
  });

  const resumenArchivos = (analysis.archivos ?? []).map((item) => {
    const rows = item.filasNormalizadas ?? [];
    const ingresos = rows.reduce((accumulator, row) => {
      const rowRecord = row as Record<string, unknown>;
      const monto = getRecordNumberValue(rowRecord, "monto") ?? getRecordNumberValue(rowRecord, "Monto") ?? 0;
      return monto > 0 ? accumulator + monto : accumulator;
    }, 0);
    const egresos = rows.reduce((accumulator, row) => {
      const rowRecord = row as Record<string, unknown>;
      const monto = getRecordNumberValue(rowRecord, "monto") ?? getRecordNumberValue(rowRecord, "Monto") ?? 0;
      return monto < 0 ? accumulator + monto : accumulator;
    }, 0);
    const firstRow = (rows[0] ?? {}) as Record<string, unknown>;

    return {
      archivoOrigen: item.nombreArchivo,
      empresa: getRecordTextValue(firstRow, "empresa") ?? getRecordTextValue(firstRow, "Empresa") ?? "",
      cuenta: getRecordTextValue(firstRow, "cuenta") ?? getRecordTextValue(firstRow, "Cuenta") ?? "",
      moneda: getRecordTextValue(firstRow, "moneda") ?? getRecordTextValue(firstRow, "Moneda") ?? "",
      tipoCuenta: null,
      totalMovimientos: rows.length,
      totalIngresos: ingresos,
      totalEgresos: egresos,
      neto: ingresos + egresos,
    };
  });

  const totalIngresos = resumenArchivos.reduce((accumulator, item) => accumulator + (item.totalIngresos ?? 0), 0);
  const totalEgresos = resumenArchivos.reduce((accumulator, item) => accumulator + (item.totalEgresos ?? 0), 0);

  return {
    nombreArchivo: "movimientos_consolidados_ordenados_por_operacion.xlsx",
    archivosProcesados: analysis.archivos.length,
    totalMovimientos: movimientos.length,
    totalIngresos,
    totalEgresos,
    neto: totalIngresos + totalEgresos,
    cantidadDuplicadosDetectados: 0,
    insertable: analysis.puedeInsertar,
    resumenArchivos,
    movimientos,
  };
}

function buildExportWorkbook(XLSX: typeof import("xlsx"), exportResponse: ConciliacionBcpExportResponse) {
  const workbook = XLSX.utils.book_new();

  const resumenRows = [
    ["Archivos procesados", exportResponse.archivosProcesados],
    ["Total de movimientos", exportResponse.totalMovimientos],
    ["Total de ingresos", exportResponse.totalIngresos],
    ["Total de egresos", exportResponse.totalEgresos],
    ["Neto", exportResponse.neto],
    ["Cantidad de duplicados detectados", exportResponse.cantidadDuplicadosDetectados],
    ["Estado insertable", exportResponse.insertable ? "Si" : "No"],
    [],
    [
      "Archivo origen",
      "Empresa",
      "Cuenta",
      "Moneda",
      "Tipo de cuenta",
      "Total movimientos",
      "Total ingresos",
      "Total egresos",
      "Neto",
    ],
    ...exportResponse.resumenArchivos.map((item) => [
      item.archivoOrigen ?? "",
      item.empresa ?? "",
      item.cuenta ?? "",
      item.moneda ?? "",
      item.tipoCuenta ?? "",
      item.totalMovimientos ?? 0,
      item.totalIngresos ?? 0,
      item.totalEgresos ?? 0,
      item.neto ?? 0,
    ]),
  ];

  const resumenSheet = XLSX.utils.aoa_to_sheet(resumenRows);
  resumenSheet["!autofilter"] = { ref: "A9:I9" };
  resumenSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(workbook, resumenSheet, "Resumen");

  const movimientosRows = [
    [...MOVIMIENTOS_ORDENADOS_COLUMNS],
    ...exportResponse.movimientos.map((row) => buildExportOrderedMovementRow(row)),
  ];

  const movimientosSheet = XLSX.utils.aoa_to_sheet(movimientosRows);
  const movimientosLastColumn = XLSX.utils.encode_col(MOVIMIENTOS_ORDENADOS_COLUMNS.length - 1);
  movimientosSheet["!autofilter"] = { ref: `A1:${movimientosLastColumn}1` };
  movimientosSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(workbook, movimientosSheet, "Movimientos ordenados");

  return { XLSX, workbook };
}

function getAnalysisRows(analysisFiles: ConciliacionBcpArchivoAnalisis[]) {
  return analysisFiles.flatMap((item) => item.filasNormalizadas ?? []);
}

function buildInsertBlockedMessage(analysis: ConciliacionBcpAnalizarResponse): string {
  const explicitReasons = (analysis.motivosNoInsertables ?? []).map((item) => item.trim()).filter(Boolean);

  if (explicitReasons.length > 0) {
    return `Carga no habilitada: ${explicitReasons.join(" | ")}`;
  }

  const filesInReview = analysis.archivos.filter((item) => item.requiereRevision);
  const filesWithoutRows = filesInReview.filter((item) => (item.filasNormalizadas?.length ?? 0) === 0);

  if (filesWithoutRows.length > 0) {
    const names = filesWithoutRows.map((item) => item.nombreArchivo).join(", ");
    return `Carga no habilitada: ${filesWithoutRows.length} archivo(s) no generaron movimientos vÃ¡lidos para insertar (${names}).`;
  }

  if (filesInReview.length > 0) {
    const names = filesInReview.map((item) => item.nombreArchivo).join(", ");
    return `Carga no habilitada: ${filesInReview.length} archivo(s) requieren revisión antes de insertar (${names}).`;
  }

  return "Carga no habilitada: el anÃ¡lisis actual no cumple las condiciones para insertar.";
}

function formatDateValue(value?: string | null): string {
  if (!value) {
    return "";
  }

  const trimmedValue = value.trim();
  const isoDateMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (isoDateMatch) {
    const year = Number(isoDateMatch[1]);
    const month = Number(isoDateMatch[2]) - 1;
    const day = Number(isoDateMatch[3]);
    const localDate = new Date(year, month, day);
    if (!Number.isNaN(localDate.getTime())) {
      return `${String(day).padStart(2, "0")}/${String(month + 1).padStart(2, "0")}/${year}`;
    }
  }

  const date = new Date(trimmedValue);
  if (Number.isNaN(date.getTime())) {
    return trimmedValue;
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function normalizeIsoDateValue(value: string): string {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return "";
  }

  const isoDateMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateMatch) {
    return trimmedValue;
  }

  const slashDateMatch = trimmedValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashDateMatch) {
    const [, first, second, year] = slashDateMatch;
    const firstNumber = Number(first);
    const secondNumber = Number(second);

    if (firstNumber > 12 && secondNumber <= 12) {
      return `${year}-${second}-${first}`;
    }

    if (secondNumber > 12 && firstNumber <= 12) {
      return `${year}-${first}-${second}`;
    }

    return `${year}-${second}-${first}`;
  }

  const parsedDate = new Date(trimmedValue);
  if (!Number.isNaN(parsedDate.getTime())) {
    const year = parsedDate.getFullYear();
    const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
    const day = String(parsedDate.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return trimmedValue;
}

function normalizePlanillaGastoKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function normalizePlanillaGastoSearchValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getPlanillaGastoFieldValue(row: PlanillaGastoConciliacionRow, ...keys: string[]): unknown {
  const normalizedEntries = Object.entries(row).map(([entryKey, entryValue]) => ({
    key: normalizePlanillaGastoKey(entryKey),
    value: entryValue,
  }));

  for (const key of keys) {
    const directValue = row[key];
    if (directValue !== null && directValue !== undefined) {
      if (!(typeof directValue === "string" && !directValue.trim())) {
        return directValue;
      }
    }

    const normalizedKey = normalizePlanillaGastoKey(key);
    const normalizedEntry = normalizedEntries.find((entry) => entry.key === normalizedKey);

    if (!normalizedEntry) {
      continue;
    }

    if (normalizedEntry.value === null || normalizedEntry.value === undefined) {
      continue;
    }

    if (typeof normalizedEntry.value === "string" && !normalizedEntry.value.trim()) {
      continue;
    }

    return normalizedEntry.value;
  }

  return "";
}

function getPlanillaGastoText(row: PlanillaGastoConciliacionRow, ...keys: string[]): string {
  const value = getPlanillaGastoFieldValue(row, ...keys);
  return value === null || value === undefined ? "" : String(value).trim();
}

function getPlanillaGastoDate(row: PlanillaGastoConciliacionRow, ...keys: string[]): string {
  return formatDateValue(getPlanillaGastoText(row, ...keys));
}

function getPlanillaGastoNumber(row: PlanillaGastoConciliacionRow, ...keys: string[]): string {
  const value = getPlanillaGastoFieldValue(row, ...keys);
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return formatNumber(value);
  }

  const normalized = String(value).replace(/\s+/g, "").replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? formatNumber(parsed) : String(value).trim();
}

function getPlanillaGastoRowId(row: PlanillaGastoConciliacionRow): string {
  return getPlanillaGastoText(row, "corre", "Corre", "correlativo", "Correlativo", "id", "Id");
}

function getPlanillaGastoNroOperacion(row: PlanillaGastoConciliacionRow): string {
  return getPlanillaGastoText(row, "nrooperacion", "NroOperacion", "nroOperacion", "NumeroOperacion", "numeroOperacion");
}

function getPlanillaGastoRenderKey(row: PlanillaGastoConciliacionRow, rowIndex: number): string {
  const rowId = getPlanillaGastoRowId(row);
  return `gastos-${rowIndex}-${rowId || "sin-id"}`;
}

function getPlanillaGastoSearchText(row: PlanillaGastoConciliacionRow): string {
  const preferredKeys = [
    "corre",
    "cliente",
    "nombreproyecto",
    "site",
    "tipo_trabajo",
    "tipoTrabajo",
    "TipoTrabajo",
    "Tipo_Trabajo",
    "nrooperacion",
    "NroOperacion",
    "banco",
    "comprobante",
    "moneda",
    "subtotal",
    "igv",
    "total",
    "totalpagar",
    "solicitante",
    "responsable",
    "serie",
    "fechadeposito",
    "fechaDeposito",
    "FechaDeposito",
    "detalle",
  ];

  const searchParts = preferredKeys
    .map((key) => getPlanillaGastoText(row, key))
    .filter(Boolean);

  if (searchParts.length > 0) {
    return normalizePlanillaGastoSearchValue(searchParts.join(" "));
  }

  return normalizePlanillaGastoSearchValue(
    Object.values(row)
      .map((value) => (value === null || value === undefined ? "" : String(value)))
      .join(" ")
  );
}

const GASTOS_PLANILLA_COLUMNS: PlanillaGastoColumnDef[] = [
  { key: "corre", label: "corre", render: (row) => getPlanillaGastoText(row, "corre", "Corre") },
  { key: "cliente", label: "cliente", render: (row) => getPlanillaGastoText(row, "cliente", "Cliente") },
  { key: "nombreproyecto", label: "nombreproyecto", render: (row) => getPlanillaGastoText(row, "nombreproyecto", "NombreProyecto") },
  { key: "site", label: "site", render: (row) => getPlanillaGastoText(row, "site", "Site") },
  { key: "tipo_trabajo", label: "tipo_trabajo", render: (row) => getPlanillaGastoText(row, "tipo_trabajo", "tipoTrabajo", "TipoTrabajo", "Tipo_Trabajo") },
  { key: "nrooperacion", label: "nrooperacion", render: (row) => getPlanillaGastoText(row, "nrooperacion", "NroOperacion") },
  { key: "banco", label: "banco", render: (row) => getPlanillaGastoText(row, "banco", "Banco") },
  { key: "comprobante", label: "comprobante", render: (row) => getPlanillaGastoText(row, "comprobante", "Comprobante") },
  { key: "moneda", label: "moneda", render: (row) => getPlanillaGastoText(row, "moneda", "Moneda") },
  { key: "subtotal", label: "subtotal", render: (row) => getPlanillaGastoNumber(row, "subtotal", "Subtotal") },
  { key: "igv", label: "igv", render: (row) => getPlanillaGastoNumber(row, "igv", "IGV") },
  { key: "total", label: "total", render: (row) => getPlanillaGastoNumber(row, "total", "Total") },
  { key: "totalpagar", label: "totalpagar", render: (row) => getPlanillaGastoNumber(row, "totalpagar", "TotalPagar") },
  { key: "solicitante", label: "solicitante", render: (row) => getPlanillaGastoText(row, "solicitante", "Solicitante") },
  { key: "responsable", label: "responsable", render: (row) => getPlanillaGastoText(row, "responsable", "Responsable") },
  { key: "serie", label: "serie", render: (row) => getPlanillaGastoText(row, "serie", "Serie") },
  {
    key: "fechadeposito",
    label: "fechadeposito",
    render: (row) => getPlanillaGastoDate(row, "fechadeposito", "fechaDeposito", "FechaDeposito"),
  },
  { key: "detalle", label: "detalle", render: (row) => getPlanillaGastoText(row, "detalle", "Detalle") },
];

function isMonedaMn(value?: string | null): boolean {
  const moneda = (value ?? "").trim().toUpperCase();
  return moneda === "MN" || moneda === "PEN" || moneda === "SOLES" || moneda === "SOL";
}

function getRevisionSystemLabel(row: ConciliacionBcpConciliarPlanillaRegistro): string {
  return row.idRegistroPlanilla || row.tipoCoincidencia ? "SISTEMA" : "NO CARGADO";
}

function getRevisionPeriodoLabel(value?: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getRevisionResumenLabel(
  row: ConciliacionBcpConciliarPlanillaRegistro,
  cuentasContables?: ConciliacionCuentaContableOption[]
): string {
  const cuentaContable = getCuentaContableLabel(row, cuentasContables);

  if (!cuentaContable) {
    return "(sin cuenta contable)";
  }

  return cuentaContable;
}

function getRevisionResumenSortOrder(label: string): number {
  const normalized = normalizeText(label);

  if (normalized === "SINCUENTACONTABLE") {
    return 999;
  }

  return 0;
}

function getDistinctSortedValues(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, "es", { sensitivity: "base", numeric: true })
  );
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";

  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function parseExcelFile(file: File, codigoBanco?: string | null): Promise<ParsedConciliacionExcelFile> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = findPreferredWorksheetName(workbook.SheetNames);

  if (!sheetName) {
    return {
      id: createSelectionId(file),
      file,
      nombreArchivo: file.name,
      nombreHoja: "",
      numeroHoja: 1,
      rows: [],
      sampleRows: [],
      totalFilas: 0,
      clientError: "El archivo no contiene hojas de calculo.",
    };
  }

  const worksheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: "",
    blankrows: true,
    // Leer el valor formateado evita perder ceros a la izquierda en bancos como Scotiabank.
    raw: false,
  });

  const normalizedRows = matrix
    .map((row) => (Array.isArray(row) ? row.map(normalizeCellValue) : []))
    .filter((row) => row.length > 0 && !isRowEmpty(row as string[]))
    .map((row) => row as string[]);

  const esScotiabank = isScotiabankBankCode(codigoBanco);
  const empresa = esScotiabank ? extractScotiabankCompany(matrix.map((row) => (Array.isArray(row) ? row.map(normalizeCellValue) : []))) : "";
  const cuenta = esScotiabank ? extractScotiabankCuenta(matrix.map((row) => (Array.isArray(row) ? row.map(normalizeCellValue) : []))) : "";
  const moneda = esScotiabank ? extractScotiabankMonedaFromSaldoContable(matrix.map((row) => (Array.isArray(row) ? row.map(normalizeCellValue) : []))) : "";
  const saldoContable = esScotiabank ? joinNonEmptyCells(matrix[4] as string[] | undefined) : "";
  const totalFilas = normalizedRows.length > 0 ? normalizedRows.length - 1 : 0;
  const sampleRows = normalizedRows.slice(0, 8);

  return {
    id: createSelectionId(file),
    file,
    nombreArchivo: file.name,
    nombreHoja: sheetName,
    numeroHoja: Math.max(workbook.SheetNames.indexOf(sheetName) + 1, 1),
    rows: normalizedRows,
    sampleRows,
    totalFilas,
    empresa,
    cuenta,
    moneda,
    saldoContable,
    clientError: normalizedRows.length === 0 ? "La hoja seleccionada no contiene filas utilidades." : "",
  };
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.summaryCard}>
      <span style={styles.summaryLabel}>{label}</span>
      <strong style={styles.summaryValue}>{value}</strong>
    </div>
  );
}

export default function ConciliacionBcpPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectExcelButtonRef = useRef<HTMLButtonElement | null>(null);
  const analyzeButtonRef = useRef<HTMLButtonElement | null>(null);
  const resultadoFilterDropdownRef = useRef<HTMLDivElement | null>(null);
  const detalleHeaderScrollRef = useRef<HTMLDivElement | null>(null);
  const detalleTableScrollRef = useRef<HTMLDivElement | null>(null);
  const detalleScrollSyncRef = useRef<"header" | "table" | null>(null);
  const [files, setFiles] = useState<ParsedConciliacionExcelFile[]>([]);
  const [analysis, setAnalysis] = useState<ConciliacionBcpAnalizarResponse | null>(null);
  const [loadingParse, setLoadingParse] = useState(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [loadingInsert, setLoadingInsert] = useState(false);
  const [loadingConciliacion, setLoadingConciliacion] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [codigoBanco, setCodigoBanco] = useState("BCP");
  const [isAnalysisExpanded, setIsAnalysisExpanded] = useState(false);
  const [isConciliacionExpanded, setIsConciliacionExpanded] = useState(false);
  const [isFilesExpanded, setIsFilesExpanded] = useState(false);
  const [showExportAnalysisButton, setShowExportAnalysisButton] = useState(true);
  const [conciliacionSort, setConciliacionSort] = useState<ConciliacionSortState | null>(null);
  const [conciliacionFiltros, setConciliacionFiltros] = useState({
    idCargo: "5",
    idEmpleado: "1160",
    estados: "4",
    fechaInicio: "",
    fechaFin: "",
    idActivo: "1",
    idAreaFlujo: "",
    idReferencia: "",
    idCuentaContable: "",
    esConciliado: "",
  });
  const [conciliacionGridFilters, setConciliacionGridFilters] = useState<ConciliacionFilterState>(
    DEFAULT_CONCILIACION_FILTERS
  );
  const [conciliacionExecutiveSelection, setConciliacionExecutiveSelection] = useState<ConciliacionExecutiveSelection>({
    moneda: null,
    resultado: null,
  });
  const [conciliacionExecutivePieLevel, setConciliacionExecutivePieLevel] = useState<ConciliacionExecutiveChartLevel>("bancoMovimiento");
  const [conciliacionExecutivePiePath, setConciliacionExecutivePiePath] = useState<ConciliacionExecutiveChartPath>({
    bancoMovimiento: null,
    resultado: null,
  });
  const [conciliacionPlanilla, setConciliacionPlanilla] = useState<ConciliacionBcpConciliarPlanillaResponse | null>(null);
  const [comentarioDrafts, setComentarioDrafts] = useState<Record<number, string>>({});
  const [comentarioSavingIds, setComentarioSavingIds] = useState<Record<number, boolean>>({});
  const [areaFlujoDrafts, setAreaFlujoDrafts] = useState<Record<number, string>>({});
  const [areaFlujoSavingIds, setAreaFlujoSavingIds] = useState<Record<number, boolean>>({});
  const [referenciaDrafts, setReferenciaDrafts] = useState<Record<number, string>>({});
  const [referenciaSavingIds, setReferenciaSavingIds] = useState<Record<number, boolean>>({});
  const [cuentaContableDrafts, setCuentaContableDrafts] = useState<Record<number, string>>({});
  const [cuentaContableSavingIds, setCuentaContableSavingIds] = useState<Record<number, boolean>>({});
  const [gastosPlanillaRows, setGastosPlanillaRows] = useState<PlanillaGastoConciliacionRow[]>([]);
  const [gastosPlanillaLoading, setGastosPlanillaLoading] = useState(false);
  const [gastosPlanillaError, setGastosPlanillaError] = useState("");
  const [gastosPlanillaMessage, setGastosPlanillaMessage] = useState("");
  const [gastosPlanillaDrafts, setGastosPlanillaDrafts] = useState<Record<string, string>>({});
  const [gastosPlanillaSavingIds, setGastosPlanillaSavingIds] = useState<Record<string, boolean>>({});
  const [gastosPlanillaQuickSearch, setGastosPlanillaQuickSearch] = useState("");
  const [detalleQuickSearch, setDetalleQuickSearch] = useState("");
  const [revisionFilters, setRevisionFilters] = useState<ConciliacionRevisionFilters>(
    DEFAULT_CONCILIACION_REVISION_FILTERS
  );
  const [revisionTipoCambioDiario, setRevisionTipoCambioDiario] = useState<number>(DEFAULT_TIPO_CAMBIO_DIARIO);
  const [conciliacionPlanillaTab, setConciliacionPlanillaTab] = useState<ConciliacionPlanillaTab>("revision");
  const [isResultadoFilterOpen, setIsResultadoFilterOpen] = useState(false);
  const [clasificacionCombos, setClasificacionCombos] = useState<ConciliacionBcpClasificacionCombosResponse | null>(null);
  const [clasificacionCombosLoading, setClasificacionCombosLoading] = useState(false);
  const [clasificacionModal, setClasificacionModal] = useState<ConciliacionClasificacionForm | null>(null);
  const [clasificacionSaving, setClasificacionSaving] = useState(false);
  const [montoDiferenciaModal, setMontoDiferenciaModal] = useState<ConciliacionMontoDiferenciaForm | null>(null);
  const [montoDiferenciaSaving, setMontoDiferenciaSaving] = useState(false);
  const [montoDiferenciaError, setMontoDiferenciaError] = useState("");
  const [detalleScrollContentWidth, setDetalleScrollContentWidth] = useState(0);
  const [detalleExpandedPopupOpen, setDetalleExpandedPopupOpen] = useState(false);
  const authUser = getAuthUser();

  const fechaDepositoInicioGastos = useMemo(() => conciliacionFiltros.fechaInicio.trim(), [conciliacionFiltros.fechaInicio]);
  const fechaDepositoFinGastos = useMemo(() => conciliacionFiltros.fechaFin.trim(), [conciliacionFiltros.fechaFin]);
  const gastosPlanillaVisibleRows = useMemo(() => {
    const quickSearch = normalizePlanillaGastoSearchValue(gastosPlanillaQuickSearch);

    if (!quickSearch) {
      return gastosPlanillaRows;
    }

    const tokens = quickSearch.split(" ").filter(Boolean);

    return gastosPlanillaRows.filter((row) => {
      const rowSearchText = getPlanillaGastoSearchText(row);
      return tokens.every((token) => rowSearchText.includes(token));
    });
  }, [gastosPlanillaRows, gastosPlanillaQuickSearch]);

  const gastosPlanillaCountText = useMemo(() => {
    const totalRows = gastosPlanillaRows.length;
    const visibleRows = gastosPlanillaVisibleRows.length;

    if (!gastosPlanillaQuickSearch.trim()) {
      return `Registros: ${visibleRows}`;
    }

    return `Registros: ${visibleRows} de ${totalRows}`;
  }, [gastosPlanillaQuickSearch, gastosPlanillaRows.length, gastosPlanillaVisibleRows.length]);

  const gastosPlanillaMessageText = useMemo(() => {
    if (!gastosPlanillaMessage) {
      return "";
    }

    if (!gastosPlanillaQuickSearch.trim()) {
      return gastosPlanillaMessage;
    }

    return `${gastosPlanillaMessage} | Mostrando ${gastosPlanillaVisibleRows.length} de ${gastosPlanillaRows.length} por búsqueda rápida.`;
  }, [
    gastosPlanillaMessage,
    gastosPlanillaQuickSearch,
    gastosPlanillaVisibleRows.length,
    gastosPlanillaRows.length,
  ]);

  const guardarNroOperacionGasto = async (row: PlanillaGastoConciliacionRow, nextValue?: string) => {
    const rowId = getPlanillaGastoRowId(row);
    const correlativo = Number(rowId);

    if (!Number.isFinite(correlativo) || correlativo <= 0) {
      setGastosPlanillaError("No se pudo identificar el correlativo del registro para actualizar el numero de operacion.");
      return;
    }

    const originalValue = getPlanillaGastoNroOperacion(row);
    const draftValue = nextValue ?? gastosPlanillaDrafts[rowId] ?? originalValue;
    const normalizedNextValue = draftValue.trim();

    if (normalizedNextValue === originalValue.trim()) {
      setGastosPlanillaDrafts((current) => {
        const next = { ...current };
        delete next[rowId];
        return next;
      });
      return;
    }

    setGastosPlanillaSavingIds((current) => ({ ...current, [rowId]: true }));
    setGastosPlanillaError("");

    try {
      await actualizarPlanillaNroOperacion(correlativo, normalizedNextValue, { timeoutMs: 120000 });

      setGastosPlanillaRows((currentRows) =>
        currentRows.map((currentRow) => {
          if (getPlanillaGastoRowId(currentRow) !== rowId) {
            return currentRow;
          }

          return {
            ...currentRow,
            NroOperacion: normalizedNextValue,
            nroOperacion: normalizedNextValue,
            numeroOperacion: normalizedNextValue,
          };
        })
      );

      setGastosPlanillaDrafts((current) => {
        const next = { ...current };
        delete next[rowId];
        return next;
      });

      setGastosPlanillaMessage(`Numero de operacion actualizado para el correlativo ${rowId}.`);
    } catch (gastosUpdateError) {
      setGastosPlanillaError(getHttpErrorMessage(gastosUpdateError, "No se pudo actualizar el numero de operacion."));
    } finally {
      setGastosPlanillaSavingIds((current) => {
        const next = { ...current };
        delete next[rowId];
        return next;
      });
    }
  };

  useEffect(() => {
    return () => {
      setDragActive(false);
    };
  }, []);

  useEffect(() => {
    if (!isResultadoFilterOpen) {
      return;
    }

    const handleDocumentClick = (event: MouseEvent) => {
      if (!resultadoFilterDropdownRef.current?.contains(event.target as Node)) {
        setIsResultadoFilterOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [isResultadoFilterOpen]);

  useEffect(() => {
    if (conciliacionPlanillaTab !== "detalle") {
      setDetalleExpandedPopupOpen(false);
    }
  }, [conciliacionPlanillaTab]);

  useEffect(() => {
    if (!detalleExpandedPopupOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [detalleExpandedPopupOpen]);

  useEffect(() => {
    let cancelled = false;

    const loadCombos = async () => {
      setClasificacionCombosLoading(true);

      try {
        const response = await obtenerCombosClasificacionConciliacionBcp();
        if (!cancelled) {
          setClasificacionCombos(response);
        }
      } catch (comboError) {
        if (!cancelled) {
          setError((current) => current || getHttpErrorMessage(comboError, "No se pudieron cargar los combos de clasificacion."));
        }
      } finally {
        if (!cancelled) {
          setClasificacionCombosLoading(false);
        }
      }
    };

    void loadCombos();

    return () => {
      cancelled = true;
    };
  }, []);

  const hasClientInvalidFiles = useMemo(
    () => files.some((item) => Boolean(item.clientError)),
    [files]
  );

  const totalRows = useMemo(
    () => files.reduce((accumulator, item) => accumulator + Math.max(item.totalFilas, 0), 0),
    [files]
  );

  const hasAnalysis = Boolean(analysis?.archivos?.length);
  const canAnalyze = files.length > 0 && !loadingParse && !loadingAnalysis && !loadingInsert;
  const canAttemptInsert =
    hasAnalysis &&
    getAnalysisRows(analysis?.archivos ?? []).length > 0 &&
    !hasClientInvalidFiles &&
    !loadingAnalysis &&
    !loadingInsert;
  const tieneRangoFechasConciliacion =
    conciliacionFiltros.fechaInicio.trim().length > 0 && conciliacionFiltros.fechaFin.trim().length > 0;
  const canConciliar = !loadingConciliacion && !loadingAnalysis && !loadingInsert;

  const cargarGastosPlanilla = async (cancelToken?: { cancelled: boolean }) => {
    const fechaInicio = fechaDepositoInicioGastos;
    const fechaFin = fechaDepositoFinGastos;

    if (!fechaInicio || !fechaFin) {
      if (!cancelToken?.cancelled) {
        setGastosPlanillaRows([]);
        setGastosPlanillaError("");
        setGastosPlanillaMessage("Selecciona Fecha inicio y Fecha fin para consultar los gastos.");
      }
      return;
    }

    if (!cancelToken?.cancelled) {
      setGastosPlanillaLoading(true);
      setGastosPlanillaError("");
      setGastosPlanillaMessage("");
      setGastosPlanillaQuickSearch("");
    }

    try {
      const fechaInicioIso = normalizeIsoDateValue(fechaInicio);
      const fechaFinIso = normalizeIsoDateValue(fechaFin);
      const request: { consulta: string; parametros: PlanillaConsultaParametro[] } = {
        consulta: "gastos",
        parametros: [
          { nombre: "Estados", valor: "4", tipo: "string" },
          { nombre: "FechaInicio", valor: fechaInicioIso, tipo: "date" },
          { nombre: "FechaFin", valor: fechaFinIso, tipo: "date" },
        ],
      };

      console.log("[Conciliacion_v1] Ejecutando sp_Planilla_Consulta_Estados (consulta directa)", {
        estados: "4",
        filtroFechaDeposito: {
          desde: fechaInicio,
          hasta: fechaFin,
        },
        filtroFechaDepositoIso: {
          desde: fechaInicioIso,
          hasta: fechaFinIso,
        },
        consulta: request.consulta,
        parametros: request.parametros,
      });

      const response = await consultarPlanillaEstados(request, { timeoutMs: 120000 });

      if (cancelToken?.cancelled) {
        return;
      }

      const rows = Array.isArray(response.rows) ? response.rows : [];
      console.log("[Conciliacion_v1] Respuesta sp_Planilla_Consulta_Estados", {
        registros: rows.length,
        mensaje: response.message ?? "",
        columnas: Array.isArray(response.columns) ? response.columns.length : 0,
      });

      if (rows.length === 0) {
        console.error("[Conciliacion_v1] sp_Planilla_Consulta_Estados devolvio 0 registros", {
          motivo: "No hubo coincidencias para los filtros enviados",
          estados: "4",
          filtroFechaDeposito: {
            desde: fechaInicio,
            hasta: fechaFin,
          },
          filtroFechaDepositoIso: {
            desde: fechaInicioIso,
            hasta: fechaFinIso,
          },
          consulta: request.consulta,
          parametros: request.parametros,
        });
      }

      setGastosPlanillaRows(rows);
      setGastosPlanillaMessage(
        response.message?.trim() ||
          (rows.length > 0
            ? `Se encontraron ${rows.length} registro(s).`
            : "No se encontraron gastos para el rango de fechas seleccionado.")
      );
    } catch (gastosError) {
      if (!cancelToken?.cancelled) {
        console.error("[Conciliacion_v1] Error al consultar sp_Planilla_Consulta_Estados", gastosError);
        setGastosPlanillaRows([]);
        setGastosPlanillaMessage("");
        setGastosPlanillaError(getHttpErrorMessage(gastosError, "No se pudo consultar el store de gastos."));
      }
    } finally {
      if (!cancelToken?.cancelled) {
        setGastosPlanillaLoading(false);
      }
    }
  };

  useLayoutEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      if (canAnalyze) {
        analyzeButtonRef.current?.focus();
        return;
      }

      selectExcelButtonRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [canAnalyze]);

  const sortedConciliacionRegistros = useMemo(() => {
    const registros = [...(conciliacionPlanilla?.registros ?? [])];

    if (!conciliacionSort) {
      return registros;
    }

    return registros.sort((left, right) => {
      const compare = compareConciliacionValues(
        getConciliacionSortValue(left, conciliacionSort.key),
        getConciliacionSortValue(right, conciliacionSort.key),
        conciliacionSort.direction
      );

      if (compare !== 0) {
        return compare;
      }

      return left.idMovimientoBanco - right.idMovimientoBanco;
    });
  }, [conciliacionPlanilla?.registros, conciliacionSort]);

  const filteredConciliacionRegistros = useMemo(() => {
    return sortedConciliacionRegistros.filter((row) => matchesConciliacionFilter(row, conciliacionGridFilters));
  }, [sortedConciliacionRegistros, conciliacionGridFilters]);
  const executiveFilteredConciliacionRegistros = useMemo(() => {
    return filteredConciliacionRegistros.filter((row) => {
      if (conciliacionExecutiveSelection.moneda) {
        const moneda = row.moneda?.trim() || "Sin moneda";
        if (moneda !== conciliacionExecutiveSelection.moneda) {
          return false;
        }
      }

      if (conciliacionExecutiveSelection.resultado) {
        const resultado = row.resultadoConciliacion?.trim() || "Sin resultado";
        if (resultado !== conciliacionExecutiveSelection.resultado) {
          return false;
        }
      }

      return true;
    });
  }, [filteredConciliacionRegistros, conciliacionExecutiveSelection]);
  const detalleTablaRegistros = useMemo(() => {
    const quickSearch = normalizePlanillaGastoSearchValue(detalleQuickSearch);

    if (!quickSearch) {
      return executiveFilteredConciliacionRegistros;
    }

    const tokens = quickSearch.split(" ").filter(Boolean);

    return executiveFilteredConciliacionRegistros.filter((row) => {
      const rowSearchText = getConciliacionDetalleSearchText(row);
      return tokens.every((token) => rowSearchText.includes(token));
    });
  }, [executiveFilteredConciliacionRegistros, detalleQuickSearch]);
  const detalleTablaTitulo = "Detalle";
  const detalleTablaDescripcion = "Filtra por cualquier valor visible en la tabla principal.";

  useEffect(() => {
    if (conciliacionPlanillaTab !== "detalle") {
      detalleScrollSyncRef.current = null;
      return;
    }

    const header = detalleHeaderScrollRef.current;
    const table = detalleTableScrollRef.current;
    if (!header || !table) {
      return;
    }

    const syncScroll = (source: "header" | "table") => {
      if (detalleScrollSyncRef.current === source) {
        detalleScrollSyncRef.current = null;
        return;
      }

      const sourceNode = source === "header" ? header : table;
      const targetNode = source === "header" ? table : header;
      detalleScrollSyncRef.current = source;
      targetNode.scrollLeft = sourceNode.scrollLeft;
    };

    const handleHeaderScroll = () => syncScroll("header");
    const handleTableScroll = () => syncScroll("table");

    header.addEventListener("scroll", handleHeaderScroll, { passive: true });
    table.addEventListener("scroll", handleTableScroll, { passive: true });

    header.scrollLeft = table.scrollLeft;

    return () => {
      header.removeEventListener("scroll", handleHeaderScroll);
      table.removeEventListener("scroll", handleTableScroll);
    };
  }, [conciliacionPlanillaTab, detalleTablaRegistros.length]);

  useLayoutEffect(() => {
    if (conciliacionPlanillaTab !== "detalle") {
      setDetalleScrollContentWidth(0);
      return;
    }

    const tableWrap = detalleTableScrollRef.current;
    if (!tableWrap) {
      return;
    }

    let frameId = 0;

    const updateWidth = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        const nextWidth = Math.max(tableWrap.scrollWidth, tableWrap.clientWidth, 1);
        setDetalleScrollContentWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
      });
    };

    updateWidth();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            updateWidth();
          });

    resizeObserver?.observe(tableWrap);
    const tableNode = tableWrap.querySelector("table");
    if (tableNode) {
      resizeObserver?.observe(tableNode);
    }

    window.addEventListener("resize", updateWidth);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, [conciliacionPlanillaTab, detalleTablaRegistros.length]);
  const totalConciliacionRegistros = conciliacionPlanilla?.registros.length ?? 0;
  const conciliacionResumenEjecutivo = useMemo(() => {
    const byMoneda = new Map<string, { totalPagar: number; cantidad: number; resultados: Map<string, ConciliacionResultadoResumen> }>();
    let registrosConTotalPagar = 0;
    let registrosSinTotalPagar = 0;
    const summaryRows = getConciliacionRowsForSummary(filteredConciliacionRegistros);

    summaryRows.forEach((row) => {
      const totalPagar = getPlanillaAmountForComparison(row);
      if (totalPagar == null) {
        registrosSinTotalPagar += 1;
        return;
      }

      registrosConTotalPagar += 1;
      const moneda = row.moneda?.trim() || "Sin moneda";
      const resultado = row.resultadoConciliacion?.trim() || "Sin resultado";
      const monedaEntry =
        byMoneda.get(moneda) ??
        {
          totalPagar: 0,
          cantidad: 0,
          resultados: new Map<string, ConciliacionResultadoResumen>(),
        };

      monedaEntry.totalPagar += totalPagar;
      monedaEntry.cantidad += 1;

      const resultadoEntry =
        monedaEntry.resultados.get(resultado) ??
        {
          resultado,
          totalPagar: 0,
          cantidad: 0,
        };

      resultadoEntry.totalPagar += totalPagar;
      resultadoEntry.cantidad += 1;

      monedaEntry.resultados.set(resultado, resultadoEntry);
      byMoneda.set(moneda, monedaEntry);
    });

    const monedas = Array.from(byMoneda.entries())
      .map(([moneda, value]): ConciliacionMonedaResumen => ({
        moneda,
        totalPagar: value.totalPagar,
        cantidad: value.cantidad,
        resultados: Array.from(value.resultados.values()).sort((left, right) => Math.abs(right.totalPagar) - Math.abs(left.totalPagar)),
      }))
      .sort((left, right) => left.moneda.localeCompare(right.moneda, "es", { sensitivity: "base" }));

    return {
      monedas,
      registrosConTotalPagar,
      registrosSinTotalPagar,
    };
  }, [filteredConciliacionRegistros]);
  const conciliacionResumenGraficoEjecutivo = useMemo(() => {
    const normalizedBankPath = normalizeText(conciliacionExecutivePiePath.bancoMovimiento);
    const normalizedResultPath = normalizeText(conciliacionExecutivePiePath.resultado);

    const visibleRows = filteredConciliacionRegistros.filter((row) => {
      if (normalizedBankPath && normalizeText(getConciliacionExecutivePieLabel(row, "bancoMovimiento")) !== normalizedBankPath) {
        return false;
      }

      if (normalizedResultPath && normalizeText(getConciliacionExecutivePieLabel(row, "resultado")) !== normalizedResultPath) {
        return false;
      }

      return true;
    });

    const summaryRows = getConciliacionRowsForSummary(visibleRows);

    const rowsWithTotal = summaryRows.filter((row) => getPlanillaAmountForComparison(row) !== null);
    const rowsWithoutTotal = summaryRows.filter((row) => getPlanillaAmountForComparison(row) === null);
    const rowsSinCoincidencia = summaryRows.filter((row) => {
      const resultado = row.resultadoConciliacion?.trim() || "Sin resultado";
      return normalizeText(resultado).includes("SIN COINCIDENCIA");
    });

    const grouped = new Map<string, ConciliacionExecutiveChartDatum>();

    summaryRows.forEach((row) => {
      const rawLabel = getConciliacionExecutivePieLabel(row, conciliacionExecutivePieLevel);
      const label = rawLabel.trim() || "Sin clasificar";
      const totalPagar = Math.abs(getPlanillaAmountForComparison(row) ?? row.monto ?? 0);

      const current =
        grouped.get(label) ??
        {
          label,
          rawLabel: label,
          value: 0,
          count: 0,
        };

      current.value += totalPagar;
      current.count += 1;
      grouped.set(label, current);
    });

    const chartData = Array.from(grouped.values()).sort((left, right) => {
      const compare = Math.abs(right.value) - Math.abs(left.value);
      if (compare !== 0) {
        return compare;
      }

      return left.label.localeCompare(right.label, "es", { sensitivity: "base" });
    });

    const totalValue = chartData.reduce((accumulator, item) => accumulator + item.value, 0);

    return {
      chartData,
      totalValue,
      rowsWithTotal: rowsWithTotal.length,
      rowsWithoutTotal: rowsWithoutTotal.length,
      rowsSinCoincidencia: rowsSinCoincidencia.length,
      visibleRows: summaryRows.length,
    };
  }, [filteredConciliacionRegistros, conciliacionExecutivePieLevel, conciliacionExecutivePiePath]);

  const revisionFilterOptions = useMemo(() => {
    const registros = conciliacionPlanilla?.registros ?? [];

    return {
      cuentaContable: getDistinctSortedValues(registros.map((row) => getCuentaContableLabel(row, clasificacionCombos?.cuentasContables))),
      areaFlujo: getDistinctSortedValues(registros.map((row) => row.nombreAreaFlujo?.trim() ?? "")),
      referencia: getDistinctSortedValues(registros.map((row) => getReferenciaLabel(row).trim())),
      empresa: getDistinctSortedValues(registros.map((row) => row.empresa?.trim() ?? "")),
      banco: getDistinctSortedValues(registros.map((row) => row.codigoBanco?.trim() ?? "")),
      system: getDistinctSortedValues(registros.map((row) => getRevisionSystemLabel(row))),
      cliente: getDistinctSortedValues(registros.map((row) => row.clientePlanilla?.trim() ?? "")),
      periodo: getDistinctSortedValues(registros.map((row) => getRevisionPeriodoLabel(row.fecha))),
    };
  }, [clasificacionCombos?.cuentasContables, conciliacionPlanilla?.registros]);
  const revisionFilteredRows = useMemo(() => {
    const registros = conciliacionPlanilla?.registros ?? [];

    return registros.filter((row) => {
      const cuentaContableLabel = getCuentaContableLabel(row, clasificacionCombos?.cuentasContables);
      const matchesCuentaContable =
        !revisionFilters.cuentaContable || cuentaContableLabel === revisionFilters.cuentaContable;
      const matchesAreaFlujo =
        !revisionFilters.areaFlujo || (row.nombreAreaFlujo?.trim() ?? "") === revisionFilters.areaFlujo;
      const matchesReferencia =
        !revisionFilters.referencia || getReferenciaLabel(row).trim() === revisionFilters.referencia;
      const matchesEmpresa = !revisionFilters.empresa || (row.empresa?.trim() ?? "") === revisionFilters.empresa;
      const matchesBanco = !revisionFilters.banco || (row.codigoBanco?.trim() ?? "") === revisionFilters.banco;
      const matchesSystem = !revisionFilters.system || getRevisionSystemLabel(row) === revisionFilters.system;
      const matchesCliente = !revisionFilters.cliente || (row.clientePlanilla?.trim() ?? "") === revisionFilters.cliente;
      const matchesPeriodo = !revisionFilters.periodo || getRevisionPeriodoLabel(row.fecha) === revisionFilters.periodo;

      return (
        matchesCuentaContable &&
        matchesAreaFlujo &&
        matchesReferencia &&
        matchesEmpresa &&
        matchesBanco &&
        matchesSystem &&
        matchesCliente &&
        matchesPeriodo
      );
    });
  }, [clasificacionCombos?.cuentasContables, conciliacionPlanilla?.registros, revisionFilters]);
  const revisionResumenRows = useMemo(() => {
    const grouped = new Map<string, ConciliacionRevisionResumen>();
    const tipoCambio = Number.isFinite(revisionTipoCambioDiario) && revisionTipoCambioDiario > 0 ? revisionTipoCambioDiario : DEFAULT_TIPO_CAMBIO_DIARIO;

    revisionFilteredRows.forEach((row) => {
      const resumen = getRevisionResumenLabel(row, clasificacionCombos?.cuentasContables);
      const current =
        grouped.get(resumen) ??
        {
          resumen,
          saldoMn: 0,
          saldoMe: 0,
          saldoMeConvertido: 0,
          totalMn: 0,
        };
      const monto = row.monto ?? 0;

      if (isMonedaMn(row.moneda)) {
        current.saldoMn += monto;
      } else {
        current.saldoMe += monto;
        current.saldoMeConvertido += monto * tipoCambio;
      }

      current.totalMn = current.saldoMn + current.saldoMeConvertido;
      grouped.set(resumen, current);
    });

    return Array.from(grouped.values()).sort((left, right) => {
      const leftOrder = getRevisionResumenSortOrder(left.resumen);
      const rightOrder = getRevisionResumenSortOrder(right.resumen);

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return left.resumen.localeCompare(right.resumen, "es", { sensitivity: "base", numeric: true });
    });
  }, [revisionFilteredRows, revisionTipoCambioDiario, clasificacionCombos?.cuentasContables]);
  const revisionResumenTotals = useMemo(() => {
    return revisionResumenRows.reduce(
      (accumulator, item) => ({
        saldoMn: accumulator.saldoMn + item.saldoMn,
        saldoMe: accumulator.saldoMe + item.saldoMe,
        saldoMeConvertido: accumulator.saldoMeConvertido + item.saldoMeConvertido,
        totalMn: accumulator.totalMn + item.totalMn,
      }),
      { saldoMn: 0, saldoMe: 0, saldoMeConvertido: 0, totalMn: 0 }
    );
  }, [revisionResumenRows]);
  const executiveSelectionLabel = conciliacionExecutiveSelection.resultado
    ? `${conciliacionExecutiveSelection.moneda ?? "Sin moneda"} | ${conciliacionExecutiveSelection.resultado}`
    : conciliacionExecutiveSelection.moneda;

  const conciliacionFilterOptions = useMemo(() => {
    const keys: ConciliacionSortKey[] = [
      "fecha",
      "codigoBanco",
      "empresa",
      "cuenta",
      "moneda",
      "monto",
      "totalPagar",
      "diferencia",
      "nroOperacion",
      "descripcionOperacion",
      "comentario",
      "resultadoConciliacion",
      "tipoCoincidencia",
      "nroOperacionPlanilla",
      "cuentaPlanilla",
      "cuentaInterPlanilla",
      "clientePlanilla",
      "proyectoPlanilla",
      "sitePlanilla",
      "tipoTrabajoPlanilla",
      "tareaPlanilla",
      "responsablePlanilla",
      "comprobantePlanilla",
      "areaFlujo",
      "referencia",
      "cuentaContable",
      "conciliado",
      "estadoConciliacionTexto",
      "estadoOperativoConciliacion",
      "fechaConciliacion",
      "usuarioConciliacion",
      "observacionConciliacionMovimiento",
      "bancoPlanilla",
      "seriePlanilla",
      "detallePlanilla",
      "correlativoPlanilla",
    ];

    return keys.reduce((accumulator, key) => {
      const values = new Set<string>();

      sortedConciliacionRegistros.forEach((row) => {
        const displayValue = getConciliacionDisplayValue(row, key);
        values.add(getConciliacionFilterOptionValue(displayValue));
      });

      accumulator[key] = Array.from(values).sort((left, right) => {
        if (left === EMPTY_CONCILIACION_FILTER_VALUE) {
          return -1;
        }

        if (right === EMPTY_CONCILIACION_FILTER_VALUE) {
          return 1;
        }

        return left.localeCompare(right, "es", { numeric: true, sensitivity: "base" });
      });

      return accumulator;
    }, {} as Record<ConciliacionSortKey, string[]>);
  }, [sortedConciliacionRegistros]);
  const resultadoConciliacionSelectedFilters = Array.isArray(conciliacionGridFilters.resultadoConciliacion)
    ? conciliacionGridFilters.resultadoConciliacion
    : [];
  const resultadoConciliacionFilterLabel =
    resultadoConciliacionSelectedFilters.length === 0
      ? "Todos"
      : resultadoConciliacionSelectedFilters.length === 1
        ? resultadoConciliacionSelectedFilters[0] === EMPTY_CONCILIACION_FILTER_VALUE
          ? "(VacÃ­o)"
          : resultadoConciliacionSelectedFilters[0]
        : `${resultadoConciliacionSelectedFilters.length} seleccionados`;

  const referenciasClasificacionDisponibles = useMemo(() => {
    const referencias = clasificacionCombos?.referencias ?? [];

    if (!clasificacionModal?.idAreaFlujo) {
      return referencias;
    }

    const referenciasValidas = new Set(
      (clasificacionCombos?.reglasContables ?? [])
        .filter((rule) => String(rule.idAreaFlujo) === clasificacionModal.idAreaFlujo)
        .map((rule) => rule.idReferencia)
    );

    return referencias.filter((item) => referenciasValidas.has(item.idReferencia));
  }, [clasificacionCombos?.referencias, clasificacionCombos?.reglasContables, clasificacionModal?.idAreaFlujo]);

  const cuentasClasificacionDisponibles = useMemo(() => {
    const cuentas = clasificacionCombos?.cuentasContables ?? [];
    const reglas = clasificacionCombos?.reglasContables ?? [];

    if (!clasificacionModal?.idAreaFlujo && !clasificacionModal?.idReferencia) {
      return cuentas;
    }

    const cuentasValidas = new Set(
      reglas
        .filter((rule) => {
          if (clasificacionModal?.idAreaFlujo && String(rule.idAreaFlujo) !== clasificacionModal.idAreaFlujo) {
            return false;
          }

          if (clasificacionModal?.idReferencia && String(rule.idReferencia) !== clasificacionModal.idReferencia) {
            return false;
          }

          return true;
        })
        .map((rule) => rule.idCuentaContable)
    );

    return cuentas.filter((item) => cuentasValidas.has(item.idCuentaContable));
  }, [
    clasificacionCombos?.cuentasContables,
    clasificacionCombos?.reglasContables,
    clasificacionModal?.idAreaFlujo,
    clasificacionModal?.idReferencia,
  ]);

  const reglasClasificacionDisponibles = useMemo(() => {
    if (!clasificacionModal) {
      return [] as ConciliacionReglaContableOption[];
    }

    return (clasificacionCombos?.reglasContables ?? []).filter((rule) => {
      if (clasificacionModal.idAreaFlujo && String(rule.idAreaFlujo) !== clasificacionModal.idAreaFlujo) {
        return false;
      }

      if (clasificacionModal.idReferencia && String(rule.idReferencia) !== clasificacionModal.idReferencia) {
        return false;
      }

      if (clasificacionModal.idCuentaContable && String(rule.idCuentaContable) !== clasificacionModal.idCuentaContable) {
        return false;
      }

      return true;
    });
  }, [clasificacionCombos?.reglasContables, clasificacionModal]);

  useEffect(() => {
    if (!clasificacionModal) {
      return;
    }

    if (reglasClasificacionDisponibles.length === 1) {
      const unicaRegla = String(reglasClasificacionDisponibles[0].idReglaContable);
      if (clasificacionModal.idReglaContable !== unicaRegla) {
        setClasificacionModal((current) =>
          current
            ? {
                ...current,
                idReglaContable: unicaRegla,
              }
            : current
        );
      }
      return;
    }

    if (
      clasificacionModal.idReglaContable &&
      !reglasClasificacionDisponibles.some((rule) => String(rule.idReglaContable) === clasificacionModal.idReglaContable)
    ) {
      setClasificacionModal((current) =>
        current
          ? {
              ...current,
              idReglaContable: "",
            }
          : current
      );
    }
  }, [clasificacionModal, reglasClasificacionDisponibles]);

  const handleSortConciliacion = (key: ConciliacionSortKey) => {
    setConciliacionSort((current) => {
      if (current?.key === key) {
        return {
          key,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }

      return {
        key,
        direction: "asc",
      };
    });
  };

  const handleConciliacionFilterChange = (key: ConciliacionSortKey, value: string) => {
    setConciliacionGridFilters((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleResultadoConciliacionFilterToggle = (value: string) => {
    setConciliacionGridFilters((current) => {
      const currentValues = Array.isArray(current.resultadoConciliacion) ? current.resultadoConciliacion : [];
      const exists = currentValues.includes(value);

      return {
        ...current,
        resultadoConciliacion: exists
          ? currentValues.filter((item) => item !== value)
          : [...currentValues, value],
      };
    });
  };

  const handleClearConciliacionFilters = () => {
    setConciliacionGridFilters(DEFAULT_CONCILIACION_FILTERS);
    setConciliacionExecutiveSelection({ moneda: null, resultado: null });
    setIsResultadoFilterOpen(false);
    setDetalleQuickSearch("");
  };

  const handleSelectConciliacionPlanillaTab = (tab: ConciliacionPlanillaTab) => {
    setConciliacionPlanillaTab(tab);

    if (tab === "gastos") {
      setGastosPlanillaQuickSearch("");
    }
  };

  const toggleDetalleExpandedPopup = () => {
    setDetalleExpandedPopupOpen((current) => !current);
  };

  useEffect(() => {
    if (conciliacionPlanillaTab !== "gastos") {
      return;
    }

    const cancelToken = { cancelled: false };
    void cargarGastosPlanilla(cancelToken);

    return () => {
      cancelToken.cancelled = true;
    };
  }, [conciliacionPlanillaTab, fechaDepositoInicioGastos, fechaDepositoFinGastos]);

  const resolveClasificacionInlineSelection = (
    row: ConciliacionBcpConciliarPlanillaRegistro,
    nextIdAreaFlujo: number,
    nextIdReferencia?: number | null
  ) => {
    const areasFlujo = clasificacionCombos?.areasFlujo ?? [];
    const referencias = clasificacionCombos?.referencias ?? [];
    const cuentasContables = clasificacionCombos?.cuentasContables ?? [];
    const reglasContables = clasificacionCombos?.reglasContables ?? [];

    if (areasFlujo.length === 0 || referencias.length === 0 || cuentasContables.length === 0 || reglasContables.length === 0) {
      return null;
    }

    const reglasPorArea = reglasContables.filter((rule) => rule.idAreaFlujo === nextIdAreaFlujo);
    if (reglasPorArea.length === 0) {
      return null;
    }

    const referenciasValidas = new Set(reglasPorArea.map((rule) => rule.idReferencia));
    const referenciaSeleccionada = nextIdReferencia && referenciasValidas.has(nextIdReferencia)
      ? nextIdReferencia
      : row.idReferencia && referenciasValidas.has(row.idReferencia)
        ? row.idReferencia
        : referencias.find((item) => referenciasValidas.has(item.idReferencia))?.idReferencia ?? null;

    if (!referenciaSeleccionada) {
      return null;
    }

    const reglasPorAreaYReferencia = reglasPorArea.filter((rule) => rule.idReferencia === referenciaSeleccionada);
    if (reglasPorAreaYReferencia.length === 0) {
      return null;
    }

    const cuentasValidas = new Set(reglasPorAreaYReferencia.map((rule) => rule.idCuentaContable));
    const cuentaSeleccionada =
      row.idCuentaContable && reglasPorAreaYReferencia.some((rule) => rule.idCuentaContable === row.idCuentaContable)
        ? row.idCuentaContable
        : cuentasContables.find((item) => cuentasValidas.has(item.idCuentaContable))?.idCuentaContable ?? null;

    if (!cuentaSeleccionada) {
      return null;
    }

    const reglasFinales = reglasPorAreaYReferencia.filter((rule) => rule.idCuentaContable === cuentaSeleccionada);
    const reglaSeleccionada =
      row.idReglaContable && reglasFinales.some((rule) => rule.idReglaContable === row.idReglaContable)
        ? row.idReglaContable
        : reglasFinales[0]?.idReglaContable ?? null;

    if (!reglaSeleccionada) {
      return null;
    }

    return {
      idAreaFlujo: nextIdAreaFlujo,
      idReferencia: referenciaSeleccionada,
      idCuentaContable: cuentaSeleccionada,
      idReglaContable: reglaSeleccionada,
    };
  };

  const getReferenciasClasificacionInlineDisponibles = (idAreaFlujo?: number | null) => {
    if (!idAreaFlujo) {
      return [] as ConciliacionReferenciaOption[];
    }

    const referencias = clasificacionCombos?.referencias ?? [];
    const reglas = clasificacionCombos?.reglasContables ?? [];
    const referenciasValidas = new Set(
      reglas.filter((rule) => rule.idAreaFlujo === idAreaFlujo).map((rule) => rule.idReferencia)
    );

    return referencias.filter((item) => referenciasValidas.has(item.idReferencia));
  };

  const getCuentasClasificacionInlineDisponibles = (
    idAreaFlujo?: number | null,
    idReferencia?: number | null
  ) => {
    if (!idAreaFlujo || !idReferencia) {
      return [] as ConciliacionCuentaContableOption[];
    }

    const cuentas = clasificacionCombos?.cuentasContables ?? [];
    const reglas = clasificacionCombos?.reglasContables ?? [];
    const cuentasValidas = new Set(
      reglas
        .filter((rule) => rule.idAreaFlujo === idAreaFlujo && rule.idReferencia === idReferencia)
        .map((rule) => rule.idCuentaContable)
    );

    return cuentas.filter((item) => cuentasValidas.has(item.idCuentaContable));
  };

  const handleAreaFlujoInlineChange = async (row: ConciliacionBcpConciliarPlanillaRegistro, value: string) => {
    if (!isConciliacionMovimientoActivo(row)) {
      setError("El movimiento bancario no existe o no se encuentra activo.");
      return;
    }

    const nextIdAreaFlujo = Number(value);
    const currentValue = row.idAreaFlujo ? String(row.idAreaFlujo) : "";

    if (!value || value === currentValue || Number.isNaN(nextIdAreaFlujo) || nextIdAreaFlujo <= 0) {
      setAreaFlujoDrafts((current) => {
        if (!current[row.idMovimientoBanco]) {
          return current;
        }

        const next = { ...current };
        delete next[row.idMovimientoBanco];
        return next;
      });
      return;
    }

    const resolvedSelection = resolveClasificacionInlineSelection(row, nextIdAreaFlujo);
    if (!resolvedSelection) {
      setError("No se pudo resolver una clasificacion valida para el Area Flujo seleccionado.");
      return;
    }

    setAreaFlujoDrafts((current) => ({
      ...current,
      [row.idMovimientoBanco]: value,
    }));
    setAreaFlujoSavingIds((current) => ({
      ...current,
      [row.idMovimientoBanco]: true,
    }));
    setError("");
    setMessage("");

    try {
      const updated = await actualizarClasificacionMovimientoConciliacionV1({
        idMovimientoBanco: row.idMovimientoBanco,
        idAreaFlujo: resolvedSelection.idAreaFlujo,
        idReferencia: resolvedSelection.idReferencia,
        idCuentaContable: resolvedSelection.idCuentaContable,
        idReglaContable: resolvedSelection.idReglaContable,
        observacionConciliacion: row.observacionConciliacionMovimiento?.trim() || null,
      });

      setConciliacionPlanilla((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          registros: current.registros.map((item) =>
            item.idMovimientoBanco === updated.idMovimientoBanco ? { ...item, ...updated } : item
          ),
        };
      });

      setMessage("Area Flujo actualizada correctamente.");
    } catch (updateError) {
      setError(getHttpErrorMessage(updateError, "No se pudo actualizar el Area Flujo del movimiento."));
    } finally {
      setAreaFlujoDrafts((current) => {
        if (!current[row.idMovimientoBanco]) {
          return current;
        }

        const next = { ...current };
        delete next[row.idMovimientoBanco];
        return next;
      });

      setAreaFlujoSavingIds((current) => ({
        ...current,
        [row.idMovimientoBanco]: false,
      }));

      setReferenciaDrafts((current) => {
        if (!current[row.idMovimientoBanco]) {
          return current;
        }

        const next = { ...current };
        delete next[row.idMovimientoBanco];
        return next;
      });

      setCuentaContableDrafts((current) => {
        if (!current[row.idMovimientoBanco]) {
          return current;
        }

        const next = { ...current };
        delete next[row.idMovimientoBanco];
        return next;
      });
    }
  };

  const handleReferenciaInlineChange = async (row: ConciliacionBcpConciliarPlanillaRegistro, value: string) => {
    if (!isConciliacionMovimientoActivo(row)) {
      setError("El movimiento bancario no existe o no se encuentra activo.");
      return;
    }

    const nextIdReferencia = Number(value);
    const currentValue = row.idReferencia ? String(row.idReferencia) : "";

    if (!row.idAreaFlujo || !value || value === currentValue || Number.isNaN(nextIdReferencia) || nextIdReferencia <= 0) {
      setReferenciaDrafts((current) => {
        if (!current[row.idMovimientoBanco]) {
          return current;
        }

        const next = { ...current };
        delete next[row.idMovimientoBanco];
        return next;
      });
      return;
    }

    const resolvedSelection = resolveClasificacionInlineSelection(row, row.idAreaFlujo, nextIdReferencia);
    if (!resolvedSelection) {
      setError("No se pudo resolver una clasificacion valida para la Referencia seleccionada.");
      return;
    }

    setReferenciaDrafts((current) => ({
      ...current,
      [row.idMovimientoBanco]: value,
    }));
    setReferenciaSavingIds((current) => ({
      ...current,
      [row.idMovimientoBanco]: true,
    }));
    setError("");
    setMessage("");

    try {
      const updated = await actualizarClasificacionMovimientoConciliacionV1({
        idMovimientoBanco: row.idMovimientoBanco,
        idAreaFlujo: resolvedSelection.idAreaFlujo,
        idReferencia: resolvedSelection.idReferencia,
        idCuentaContable: resolvedSelection.idCuentaContable,
        idReglaContable: resolvedSelection.idReglaContable,
        observacionConciliacion: row.observacionConciliacionMovimiento?.trim() || null,
      });

      setConciliacionPlanilla((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          registros: current.registros.map((item) =>
            item.idMovimientoBanco === updated.idMovimientoBanco ? { ...item, ...updated } : item
          ),
        };
      });

      setMessage("Referencia actualizada correctamente.");
    } catch (updateError) {
      setError(getHttpErrorMessage(updateError, "No se pudo actualizar la Referencia del movimiento."));
    } finally {
      setReferenciaDrafts((current) => {
        if (!current[row.idMovimientoBanco]) {
          return current;
        }

        const next = { ...current };
        delete next[row.idMovimientoBanco];
        return next;
      });

      setReferenciaSavingIds((current) => ({
        ...current,
        [row.idMovimientoBanco]: false,
      }));

      setCuentaContableDrafts((current) => {
        if (!current[row.idMovimientoBanco]) {
          return current;
        }

        const next = { ...current };
        delete next[row.idMovimientoBanco];
        return next;
      });
    }
  };

  const handleCuentaContableInlineChange = async (row: ConciliacionBcpConciliarPlanillaRegistro, value: string) => {
    if (!isConciliacionMovimientoActivo(row)) {
      setError("El movimiento bancario no existe o no se encuentra activo.");
      return;
    }

    const nextIdCuentaContable = Number(value);
    const currentValue = row.idCuentaContable ? String(row.idCuentaContable) : "";

    if (
      !row.idAreaFlujo ||
      !row.idReferencia ||
      !value ||
      value === currentValue ||
      Number.isNaN(nextIdCuentaContable) ||
      nextIdCuentaContable <= 0
    ) {
      setCuentaContableDrafts((current) => {
        if (!current[row.idMovimientoBanco]) {
          return current;
        }

        const next = { ...current };
        delete next[row.idMovimientoBanco];
        return next;
      });
      return;
    }

    const resolvedSelection = resolveClasificacionInlineSelection(row, row.idAreaFlujo, row.idReferencia);
    if (!resolvedSelection || resolvedSelection.idCuentaContable !== nextIdCuentaContable) {
      const reglasContables = clasificacionCombos?.reglasContables ?? [];
      const reglasPermitidas = reglasContables.filter(
        (rule) =>
          rule.idAreaFlujo === row.idAreaFlujo &&
          rule.idReferencia === row.idReferencia &&
          rule.idCuentaContable === nextIdCuentaContable
      );

      if (reglasPermitidas.length === 0) {
        setError("No se pudo resolver una clasificacion valida para la Cuenta Contable seleccionada.");
        return;
      }

      const resolvedByCuenta = resolveClasificacionInlineSelection(row, row.idAreaFlujo, row.idReferencia);
      if (!resolvedByCuenta || resolvedByCuenta.idCuentaContable !== nextIdCuentaContable) {
        const reglaSeleccionada = reglasPermitidas[0];
        const finalSelection = {
          idAreaFlujo: row.idAreaFlujo,
          idReferencia: row.idReferencia,
          idCuentaContable: nextIdCuentaContable,
          idReglaContable: reglaSeleccionada.idReglaContable,
        };

        setCuentaContableDrafts((current) => ({
          ...current,
          [row.idMovimientoBanco]: value,
        }));
        setCuentaContableSavingIds((current) => ({
          ...current,
          [row.idMovimientoBanco]: true,
        }));
        setError("");
        setMessage("");

        try {
          const updated = await actualizarClasificacionMovimientoConciliacionV1({
            idMovimientoBanco: row.idMovimientoBanco,
            idAreaFlujo: finalSelection.idAreaFlujo,
            idReferencia: finalSelection.idReferencia,
            idCuentaContable: finalSelection.idCuentaContable,
            idReglaContable: finalSelection.idReglaContable,
            observacionConciliacion: row.observacionConciliacionMovimiento?.trim() || null,
          });

          setConciliacionPlanilla((current) => {
            if (!current) {
              return current;
            }

            return {
              ...current,
              registros: current.registros.map((item) =>
                item.idMovimientoBanco === updated.idMovimientoBanco ? { ...item, ...updated } : item
              ),
            };
          });

          setMessage("Cuenta Contable actualizada correctamente.");
        } catch (updateError) {
          setError(getHttpErrorMessage(updateError, "No se pudo actualizar la Cuenta Contable del movimiento."));
        } finally {
          setCuentaContableDrafts((current) => {
            if (!current[row.idMovimientoBanco]) {
              return current;
            }

            const next = { ...current };
            delete next[row.idMovimientoBanco];
            return next;
          });

          setCuentaContableSavingIds((current) => ({
            ...current,
            [row.idMovimientoBanco]: false,
          }));
        }

        return;
      }
    }

    if (!resolvedSelection) {
      return;
    }

    setCuentaContableDrafts((current) => ({
      ...current,
      [row.idMovimientoBanco]: value,
    }));
    setCuentaContableSavingIds((current) => ({
      ...current,
      [row.idMovimientoBanco]: true,
    }));
    setError("");
    setMessage("");

    try {
      const updated = await actualizarClasificacionMovimientoConciliacionV1({
        idMovimientoBanco: row.idMovimientoBanco,
        idAreaFlujo: row.idAreaFlujo,
        idReferencia: row.idReferencia,
        idCuentaContable: nextIdCuentaContable,
        idReglaContable: resolvedSelection.idReglaContable,
        observacionConciliacion: row.observacionConciliacionMovimiento?.trim() || null,
      });

      setConciliacionPlanilla((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          registros: current.registros.map((item) =>
            item.idMovimientoBanco === updated.idMovimientoBanco ? { ...item, ...updated } : item
          ),
        };
      });

      setMessage("Cuenta Contable actualizada correctamente.");
    } catch (updateError) {
      setError(getHttpErrorMessage(updateError, "No se pudo actualizar la Cuenta Contable del movimiento."));
    } finally {
      setCuentaContableDrafts((current) => {
        if (!current[row.idMovimientoBanco]) {
          return current;
        }

        const next = { ...current };
        delete next[row.idMovimientoBanco];
        return next;
      });

      setCuentaContableSavingIds((current) => ({
        ...current,
        [row.idMovimientoBanco]: false,
      }));
    }
  };

  const closeClasificacionModal = () => {
    if (!clasificacionSaving) {
      setClasificacionModal(null);
    }
  };

  const closeMontoDiferenciaModal = () => {
    if (!montoDiferenciaSaving) {
      setMontoDiferenciaModal(null);
      setMontoDiferenciaError("");
    }
  };

  const openClasificacionModal = (row: ConciliacionBcpConciliarPlanillaRegistro) => {
    setClasificacionModal({
      idMovimientoBanco: row.idMovimientoBanco,
      idAreaFlujo: row.idAreaFlujo ? String(row.idAreaFlujo) : "",
      idReferencia: row.idReferencia ? String(row.idReferencia) : "",
      idCuentaContable: row.idCuentaContable ? String(row.idCuentaContable) : "",
      idReglaContable: row.idReglaContable ? String(row.idReglaContable) : "",
      observacionConciliacion: row.observacionConciliacionMovimiento?.trim() || "",
    });
  };

  const openMontoDiferenciaModal = (row: ConciliacionBcpConciliarPlanillaRegistro) => {
    const diferenciaActual = getConciliacionMontoDiferenciaValue(row);

    setMontoDiferenciaModal({
      idMovimientoBanco: row.idMovimientoBanco,
      montoOriginal: diferenciaActual ?? 0,
      montoDiferencia: diferenciaActual != null ? formatNumber(diferenciaActual) : "",
      moneda: row.moneda ?? null,
      nroOperacionPlanilla: row.nroOperacionPlanilla ?? null,
      fecha: row.fecha ?? null,
    });
    setMontoDiferenciaError("");
  };

  const handleMontoDiferenciaChange = (value: string) => {
    setMontoDiferenciaModal((current) => {
      if (!current) {
        return current;
      }

      const nextNumericValue = parseNumericValue(value);
      const originalRounded = roundCurrencyValue(current.montoOriginal);
      const nextRounded = roundCurrencyValue(nextNumericValue);

      if (Number.isFinite(nextNumericValue) && nextRounded > originalRounded) {
        setMontoDiferenciaError(
          `El monto ingresado no puede ser mayor a la diferencia original (${formatNumber(originalRounded)}).`
        );
      } else {
        setMontoDiferenciaError("");
      }

      return { ...current, montoDiferencia: value };
    });
  };

  const handleGuardarMontoDiferencia = async () => {
    if (!montoDiferenciaModal) {
      return;
    }

    const nextMonto = parseNumericValue(montoDiferenciaModal.montoDiferencia);
    if (!Number.isFinite(nextMonto)) {
      setMontoDiferenciaError("Ingresa un monto de diferencia valido.");
      return;
    }

    if (roundCurrencyValue(nextMonto) > roundCurrencyValue(montoDiferenciaModal.montoOriginal)) {
      setMontoDiferenciaError("El monto de diferencia solo puede reducirse, no incrementarse.");
      return;
    }

    const shouldSave = window.confirm("¿Desea crear registro para compensar valor?");
    if (!shouldSave) {
      return;
    }

    setMontoDiferenciaSaving(true);
    setMontoDiferenciaError("");

    try {
      const moneda = resolveTipoMonedaPlanilla(montoDiferenciaModal.moneda);
      if (moneda === "0") {
        setMontoDiferenciaError("No se pudo determinar la moneda del registro seleccionado.");
        return;
      }

      if (!montoDiferenciaModal.nroOperacionPlanilla?.trim()) {
        setMontoDiferenciaError("No se pudo obtener el NroOperacionPlanilla del registro seleccionado.");
        return;
      }

      const fechaEmision = normalizeIsoDateValue(montoDiferenciaModal.fecha ?? "");
      if (!fechaEmision) {
        setMontoDiferenciaError("No se pudo obtener la fecha del registro seleccionado.");
        return;
      }

      const usuarioAccion =
        authUser?.usuario?.trim() ||
        authUser?.userName?.trim() ||
        authUser?.username?.trim() ||
        authUser?.nombre?.trim() ||
        authUser?.nombreEmpleado?.trim() ||
        "SYSTEM";

      const payload = {
        filtroOperativoKey: "COMPENSACION_MANUAL_MONTOS",
        responsable: "0",
        idBancoCta: 0,
        idProyecto: 29,
        idSite: "100010",
        correSite: 1,
        idTarea: 0,
        idCliente: 1,
        cuenta: ".",
        cuentaNumero: ".",
        cuentaInter: ".",
        nombreCta: ".",
        ruc: ".",
        tipoPago: "0",
        tipoPagoLabel: "0",
        monto: nextMonto,
        subtotal: nextMonto,
        total: nextMonto,
        igv: 0,
        idRendicion: 0,
        detalle: "Compensacion manual de montos minimos",
        comentario: "Compensacion manual de montos minimos",
        fechaVencimiento: "",
        fecIngreso: "",
        fechaEmision,
        solicitante: "0",
        solicitanteLabel: "0",
        gestor: "0",
        gestorLabel: "0",
        validador: "0",
        validadorLabel: "0",
        moneda,
        monedaLabel: montoDiferenciaModal.moneda ?? "",
        bien: "0",
        bienLabel: "0",
        comprobante: "0",
        comprobanteLabel: "0",
        serie: ".",
        facturaUrl: "",
        facturaPath: "",
        tipoTrabajo: "ADMINISTRATIVO",
        siteNombre: "ADMINISTRACIÓN",
        usuario: usuarioAccion,
        ot: montoDiferenciaModal.nroOperacionPlanilla.trim(),
        tipoCambio: 3.5,
        idUsuarioFactura: undefined,
      };

      await httpClient.post("/tesoreria/gastos", payload);

      setConciliacionPlanilla((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          registros: current.registros.map((item) =>
            item.idMovimientoBanco === montoDiferenciaModal.idMovimientoBanco
              ? { ...item, diferenciaAjustada: nextMonto }
              : item
          ),
        };
      });

      setMessage("Registro de compensación creado correctamente.");
      setMontoDiferenciaModal(null);
    } catch (error) {
      setMontoDiferenciaError(getHttpErrorMessage(error, "No se pudo crear el registro de compensación."));
    } finally {
      setMontoDiferenciaSaving(false);
    }
  };

  const handleClasificacionFieldChange = (
    key: keyof Omit<ConciliacionClasificacionForm, "idMovimientoBanco">,
    value: string
  ) => {
    setClasificacionModal((current) => {
      if (!current) {
        return current;
      }

      if (key === "idAreaFlujo") {
        return { ...current, idAreaFlujo: value, idReferencia: "", idCuentaContable: "", idReglaContable: "" };
      }

      if (key === "idReferencia") {
        return { ...current, idReferencia: value, idCuentaContable: "", idReglaContable: "" };
      }

      if (key === "idCuentaContable") {
        return { ...current, idCuentaContable: value, idReglaContable: "" };
      }

      return { ...current, [key]: value };
    });
  };

  const loadConciliacionPlanilla = async (options?: { preserveMessage?: boolean }) => {
    const response = await conciliarPlanillaConciliacionBcp({
      codigoBanco,
      idCargo: Number(conciliacionFiltros.idCargo),
      idEmpleado: Number(conciliacionFiltros.idEmpleado),
      estados: conciliacionFiltros.estados,
      fechaInicio: conciliacionFiltros.fechaInicio || null,
      fechaFin: conciliacionFiltros.fechaFin || null,
      idActivo: conciliacionFiltros.idActivo ? Number(conciliacionFiltros.idActivo) : null,
      idAreaFlujo: conciliacionFiltros.idAreaFlujo ? Number(conciliacionFiltros.idAreaFlujo) : null,
      idReferencia: conciliacionFiltros.idReferencia ? Number(conciliacionFiltros.idReferencia) : null,
      idCuentaContable: conciliacionFiltros.idCuentaContable ? Number(conciliacionFiltros.idCuentaContable) : null,
      esConciliado:
        conciliacionFiltros.esConciliado === ""
          ? null
          : conciliacionFiltros.esConciliado === "1"
            ? true
            : false,
    });

    setConciliacionPlanilla(response);
    setIsConciliacionExpanded(false);
    setConciliacionPlanillaTab("revision");
    setConciliacionSort(null);
    setConciliacionGridFilters(DEFAULT_CONCILIACION_FILTERS);
    setRevisionFilters(DEFAULT_CONCILIACION_REVISION_FILTERS);

    if (!options?.preserveMessage) {
      setMessage(response.resumen || "Conciliacion ejecutada correctamente.");
    }

    return response;
  };

  const loadConciliacionPlanillaV1 = async (options?: { preserveMessage?: boolean }) => {
    const response = await conciliarPlanillaConciliacionV1({
      codigoBanco,
      idCargo: Number(conciliacionFiltros.idCargo),
      idEmpleado: Number(conciliacionFiltros.idEmpleado),
      estados: conciliacionFiltros.estados,
      fechaInicio: conciliacionFiltros.fechaInicio || null,
      fechaFin: conciliacionFiltros.fechaFin || null,
      idActivo: conciliacionFiltros.idActivo ? Number(conciliacionFiltros.idActivo) : null,
      idAreaFlujo: conciliacionFiltros.idAreaFlujo ? Number(conciliacionFiltros.idAreaFlujo) : null,
      idReferencia: conciliacionFiltros.idReferencia ? Number(conciliacionFiltros.idReferencia) : null,
      idCuentaContable: conciliacionFiltros.idCuentaContable ? Number(conciliacionFiltros.idCuentaContable) : null,
      esConciliado:
        conciliacionFiltros.esConciliado === ""
          ? null
          : conciliacionFiltros.esConciliado === "1"
            ? true
            : conciliacionFiltros.esConciliado === "0"
              ? false
              : null,
    });

    setConciliacionPlanilla(response);

    if (!options?.preserveMessage) {
      setMessage(response.resumen || "Conciliacion_v1 ejecutada correctamente.");
    }

    return response;
  };

  const handleGuardarClasificacion = async () => {
    if (!clasificacionModal) {
      return;
    }

    const rowInactiva = conciliacionPlanilla?.registros.find((item) => item.idMovimientoBanco === clasificacionModal.idMovimientoBanco);
    if (rowInactiva && !isConciliacionMovimientoActivo(rowInactiva)) {
      setError("El movimiento bancario no existe o no se encuentra activo.");
      return;
    }

    if (
      !clasificacionModal.idAreaFlujo ||
      !clasificacionModal.idReferencia ||
      !clasificacionModal.idCuentaContable ||
      !clasificacionModal.idReglaContable
    ) {
      setError("Completa Area Flujo, Referencia, Cuenta Contable y Regla Contable antes de guardar.");
      setMessage("");
      return;
    }

    setClasificacionSaving(true);
    setError("");
    setMessage("");

    try {
      const updated = await actualizarClasificacionMovimientoConciliacionV1({
        idMovimientoBanco: clasificacionModal.idMovimientoBanco,
        idAreaFlujo: Number(clasificacionModal.idAreaFlujo),
        idReferencia: Number(clasificacionModal.idReferencia),
        idCuentaContable: Number(clasificacionModal.idCuentaContable),
        idReglaContable: Number(clasificacionModal.idReglaContable),
        observacionConciliacion: clasificacionModal.observacionConciliacion.trim() || null,
      });

      await loadConciliacionPlanilla({ preserveMessage: true });

      setConciliacionPlanilla((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          registros: current.registros.map((item) =>
            item.idMovimientoBanco === updated.idMovimientoBanco ? { ...item, ...updated } : item
          ),
        };
      });

      setClasificacionModal(null);
      setMessage("Clasificacion contable actualizada correctamente.");
    } catch (updateError) {
      setError(getHttpErrorMessage(updateError, "No se pudo actualizar la clasificacion contable del movimiento."));
    } finally {
      setClasificacionSaving(false);
    }
  };

  const handleExecutiveCurrencyClick = (moneda: string) => {
    setConciliacionExecutiveSelection((current) =>
      current.moneda === moneda && current.resultado === null
        ? { moneda: null, resultado: null }
        : { moneda, resultado: null }
    );
  };

  const handleExecutiveResultClick = (moneda: string, resultado: string) => {
    setConciliacionExecutiveSelection((current) =>
      current.moneda === moneda && current.resultado === resultado
        ? { moneda: null, resultado: null }
        : { moneda, resultado }
    );
  };

  const handleConciliacionExecutivePieItemClick = (item: ConciliacionExecutiveChartDatum) => {
    if (conciliacionExecutivePieLevel === "bancoMovimiento") {
      setConciliacionExecutivePiePath({
        bancoMovimiento: item.rawLabel,
        resultado: null,
      });
      setConciliacionExecutivePieLevel("resultado");
      return;
    }

    if (conciliacionExecutivePieLevel === "resultado") {
      setConciliacionExecutivePiePath((current) => ({
        ...current,
        resultado: item.rawLabel,
      }));
      setConciliacionExecutivePieLevel("cuentaContable");
    }
  };

  const handleConciliacionExecutivePieReset = () => {
    setConciliacionExecutivePieLevel("bancoMovimiento");
    setConciliacionExecutivePiePath({
      bancoMovimiento: null,
      resultado: null,
    });
  };

  const handleConciliacionExecutivePieBackToBank = () => {
    if (!conciliacionExecutivePiePath.bancoMovimiento) {
      return;
    }

    setConciliacionExecutivePieLevel("resultado");
    setConciliacionExecutivePiePath((current) => ({
      bancoMovimiento: current.bancoMovimiento,
      resultado: null,
    }));
  };


  const handleComentarioDraftChange = (idMovimientoBanco: number, value: string) => {
    setComentarioDrafts((current) => ({
      ...current,
      [idMovimientoBanco]: value,
    }));
  };

  const handleComentarioBlur = async (row: ConciliacionBcpConciliarPlanillaRegistro) => {
    const draftValue = comentarioDrafts[row.idMovimientoBanco] ?? row.comentario ?? "";
    const comentarioAnterior = normalizeComentarioValue(row.comentario);
    const comentarioNuevo = normalizeComentarioValue(draftValue);

    if (comentarioAnterior === comentarioNuevo) {
      if (draftValue !== (row.comentario ?? "")) {
        setComentarioDrafts((current) => ({
          ...current,
          [row.idMovimientoBanco]: row.comentario ?? "",
        }));
      }
      return;
    }

    setComentarioSavingIds((current) => ({
      ...current,
      [row.idMovimientoBanco]: true,
    }));

    try {
      const updated = await actualizarComentarioMovimientoConciliacionV1(row.idMovimientoBanco, {
        comentario: comentarioNuevo || null,
      });

      setConciliacionPlanilla((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          registros: current.registros.map((item) =>
            item.idMovimientoBanco === row.idMovimientoBanco
              ? {
                  ...item,
                  comentario: updated.comentario ?? null,
                }
              : item
          ),
        };
      });

      setComentarioDrafts((current) => ({
        ...current,
        [row.idMovimientoBanco]: updated.comentario ?? "",
      }));
      setMessage("Comentario actualizado correctamente.");
      setError("");
    } catch (updateError) {
      setError(getHttpErrorMessage(updateError, "No se pudo actualizar el comentario del movimiento."));
      setMessage("");
      setComentarioDrafts((current) => ({
        ...current,
        [row.idMovimientoBanco]: row.comentario ?? "",
      }));
    } finally {
      setComentarioSavingIds((current) => ({
        ...current,
        [row.idMovimientoBanco]: false,
      }));
    }
  };

  const handleReplaceFiles = async (incomingFiles: FileList | File[]) => {
    setLoadingParse(true);
    setError("");
    setMessage("");
    setAnalysis(null);
    setShowExportAnalysisButton(true);

    try {
      const parsedFiles = await Promise.all(
        Array.from(incomingFiles).map(async (file) => {
          const clientError = validateSelectedFile(file);
          if (clientError) {
            return {
              id: createSelectionId(file),
              file,
              nombreArchivo: file.name,
              nombreHoja: "",
              numeroHoja: 1,
              rows: [],
              sampleRows: [],
              totalFilas: 0,
              clientError,
            };
          }

          try {
            return await parseExcelFile(file, codigoBanco);
          } catch (parseError) {
            return {
              id: createSelectionId(file),
              file,
              nombreArchivo: file.name,
              nombreHoja: "",
              numeroHoja: 1,
              rows: [],
              sampleRows: [],
              totalFilas: 0,
              clientError: getHttpErrorMessage(parseError, "No se pudo leer el archivo Excel."),
            };
          }
        })
      );

      setFiles(parsedFiles);
    } finally {
      setLoadingParse(false);
    }
  };

  const executeInsert = async (sourceAnalysis: ConciliacionBcpAnalizarResponse) => {
    const filas = getAnalysisRows(sourceAnalysis.archivos);

    if (filas.length === 0) {
      throw new Error("No se generaron filas normalizadas para insertar.");
    }

    const response = await insertarConciliacionBcp({ filas, codigoBanco });
    const advertencias = response.advertencias?.length
      ? ` ${response.advertencias.join(" ")}`
      : "";
    const inserted = response.filasInsertadas ?? 0;
    const received = response.filasRecibidas ?? 0;
    const omitted = response.filasOmitidasDuplicadas ?? 0;

    return inserted === 0 && omitted > 0
      ? `Carga no aplicada: los ${received} registro(s) fueron omitidos por control de duplicados.${advertencias}`
      : `Resultado de carga: ${inserted} de ${received} registro(s) insertados. ${omitted} omitido(s) por control de duplicados.${advertencias}`;
  };

  const handleAnalyze = async () => {
    if (files.length === 0 || hasClientInvalidFiles) {
      setError("Selecciona archivos validos antes de analizar.");
      return;
    }

    setLoadingAnalysis(true);
    setError("");
    setMessage("");
    setShowExportAnalysisButton(false);

    try {
      const archivos = await Promise.all(
        files.map(async (file) => {
          const sampleRows = file.sampleRows.slice(0, 8);
          const headers = sampleRows[0] ?? [];

          return {
            nombreArchivo: file.nombreArchivo,
            tipoContenido: file.file.type || "application/octet-stream",
            contenidoBase64: await fileToBase64(file.file),
            tamanoBytes: file.file.size,
            nombreHoja: file.nombreHoja,
            numeroHoja: file.numeroHoja,
            totalFilas: file.totalFilas,
            encabezados: headers,
            filas: file.rows,
            filasMuestra: sampleRows,
            empresa: file.empresa ?? null,
            cuenta: file.cuenta ?? null,
            moneda: file.moneda ?? null,
            saldoContable: file.saldoContable ?? null,
          };
        })
      );

      const request = { archivos };

      const response = await analizarConciliacionBcp({ ...request, codigoBanco });
      setAnalysis(response);
      setConciliacionPlanilla(null);

      // Genera la descarga apenas termina el anÃ¡lisis, igual que el flujo de Scotiabank.
      await handleExportAnalysis(response);

      if (response.puedeInsertar) {
        try {
          const insertMessage = await executeInsert(response);
          setMessage(insertMessage);
        } catch (insertError) {
          setError(getHttpErrorMessage(insertError, "No se pudo insertar la conciliacion BCP."));
        }
      } else {
        setMessage(response.resumen || "Analisis de conciliacion completado.");
      }
    } catch (analysisError) {
      setAnalysis(null);
      setError(getHttpErrorMessage(analysisError, "No se pudo analizar la conciliacion BCP."));
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const handleExportAnalysis = async (analysisToExport = analysis) => {
    if (!analysisToExport?.archivos?.length) {
      setError("Primero debes analizar los archivos.");
      return;
    }

    setError("");
    setMessage("");

    try {
      const XLSX = await import("xlsx");

      let exportResponse: ConciliacionBcpExportResponse;

      try {
        const apiResponse = await exportarAnalisisConciliacionBcp({ analisis: analysisToExport });
        exportResponse =
          apiResponse?.movimientos?.length > 0 || apiResponse?.resumenArchivos?.length > 0
            ? apiResponse
            : buildExportResponseFromAnalysisData(analysisToExport);
      } catch (exportError) {
        console.warn("[ConciliacionBcp] Export remoto falló, se usarÃ¡ el respaldo local.", exportError);
        exportResponse = buildExportResponseFromAnalysisData(analysisToExport);
      }

      const { workbook } = buildExportWorkbook(XLSX, exportResponse);
      XLSX.writeFile(workbook, exportResponse.nombreArchivo || "movimientos_consolidados_ordenados_por_operacion.xlsx");
      setMessage("Se genero el Excel final correctamente.");
    } catch (exportError) {
      setError(getHttpErrorMessage(exportError, "No se pudo exportar el analisis a Excel."));
    }
  };

  const handleInsert = async () => {
    if (!analysis?.archivos?.length) {
      setError("Primero debes analizar los archivos.");
      return;
    }

    if (!analysis.puedeInsertar) {
      setError(buildInsertBlockedMessage(analysis));
      return;
    }

    setLoadingInsert(true);
    setError("");
    setMessage("");

    try {
      setMessage(await executeInsert(analysis));
    } catch (insertError) {
      setError(getHttpErrorMessage(insertError, "No se pudo insertar la conciliacion BCP."));
    } finally {
      setLoadingInsert(false);
    }
  };

  const handleConciliarPlanilla = async () => {
    if (!conciliacionFiltros.idCargo.trim() || !conciliacionFiltros.idEmpleado.trim() || !conciliacionFiltros.estados.trim()) {
      setError("Completa IdCargo, IdEmpleado y Estados antes de ejecutar la conciliacion.");
      return;
    }

    if (!tieneRangoFechasConciliacion) {
      setError("Completa Fecha Inicio y Fecha Fin antes de ejecutar la conciliacion.");
      return;
    }

    setLoadingConciliacion(true);
    setError("");
    setMessage("");

    try {
      const response = await loadConciliacionPlanilla();

      if ((response.registros?.length ?? 0) > 0) {
        await handleExportConciliacionPlanilla(response);
        return;
      }

      if (analysis?.archivos?.length) {
        await handleExportConciliacionPlanillaFromAnalysis(analysis);
        setMessage(
          "No se encontraron movimientos en MovimientosConciliacion para el rango seleccionado. Se exportó el análisis cargado como respaldo."
        );
        return;
      }

      await handleExportConciliacionPlanilla(response);
    } catch (conciliacionError) {
      setConciliacionPlanilla(null);
      setError(getHttpErrorMessage(conciliacionError, "No se pudo ejecutar la conciliacion con planilla."));
    } finally {
      setLoadingConciliacion(false);
    }
  };

  const buildConciliacionPlanillaExportRows = (rows: ConciliacionBcpConciliarPlanillaRegistro[]) =>
    rows.map((row) => ({
      Fecha: formatDateValue(row.fecha),
      BancoMovimiento: row.codigoBanco || "",
      Empresa: row.empresa || "",
      Cuenta: row.cuenta || "",
      Moneda: row.moneda || "",
      Monto: row.monto ?? "",
      TotalPagar: getPlanillaAmountForComparison(row) ?? "",
      Diferencia: calculateMontoDiferencia(row.monto, getPlanillaAmountForComparison(row)) ?? "",
      NroOperacion: row.nroOperacion || "",
      DescripcionOperacion: row.descripcionOperacion || "",
      Comentario: row.comentario || "",
      ResultadoConciliacion: row.resultadoConciliacion || "",
      TipoCoincidencia: row.tipoCoincidencia || "",
      NroOperacionPlanilla: row.nroOperacionPlanilla || "",
      CuentaPlanilla: row.cuentaPlanilla || "",
      CuentaInterPlanilla: row.cuentaInterPlanilla || "",
      Cliente: row.clientePlanilla || "",
      Proyecto: row.proyectoPlanilla || "",
      Site: row.sitePlanilla || "",
      Tipo_Trabajo: row.tipoTrabajoPlanilla || "",
      Tarea: row.tareaPlanilla || "",
      Responsable: row.responsablePlanilla || "",
      AreaFlujo:
        clasificacionCombos?.areasFlujo.find((option) => option.idAreaFlujo === row.idAreaFlujo)?.nombreAreaFlujo?.trim() ||
        row.nombreAreaFlujo?.trim() ||
        (row.esConciliado ? "" : "PENDIENTE"),
      Referencia:
        clasificacionCombos?.referencias.find((option) => option.idReferencia === row.idReferencia)
          ? `${clasificacionCombos.referencias.find((option) => option.idReferencia === row.idReferencia)?.codigoReferencia?.trim() || ""}${clasificacionCombos.referencias.find((option) => option.idReferencia === row.idReferencia)?.nombreReferencia?.trim() ? ` - ${clasificacionCombos.referencias.find((option) => option.idReferencia === row.idReferencia)?.nombreReferencia?.trim()}` : ""}`.trim()
          : getReferenciaLabel(row) || (row.esConciliado ? "" : "PENDIENTE"),
      CuentaContable:
        getCuentaContableLabel(row, clasificacionCombos?.cuentasContables) || (row.esConciliado ? "" : "PENDIENTE"),
      Conciliado: getConciliadoLabel(row),
      EstadoConciliacionTexto: row.estadoConciliacionTexto || "",
      EstadoOperativoConciliacion: row.estadoOperativoConciliacion || "",
      FechaConciliacion: formatDateValue(row.fechaConciliacion),
      UsuarioConciliacion: row.usuarioConciliacion || "",
      ObservacionConciliacionMovimiento: row.observacionConciliacionMovimiento || "",
      Comprobante: row.comprobantePlanilla || "",
      Banco: row.bancoPlanilla || "",
      Serie: row.seriePlanilla || "",
      Detalle: row.detallePlanilla || "",
      OC: row.idOc || "",
      Correlativo: row.correlativoPlanilla || "",
    }));

  const handleExportConciliacionPlanilla = async (
    sourceConciliacionPlanilla: ConciliacionBcpConciliarPlanillaResponse | null = conciliacionPlanilla
  ) => {
    if (!sourceConciliacionPlanilla) {
      return;
    }

    const XLSX = await import("xlsx");
    const exportRows = buildConciliacionPlanillaExportRows(sourceConciliacionPlanilla.registros);

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "ConciliacionPlanilla");
    XLSX.writeFile(
      workbook,
      `conciliacion_planilla_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  const handleExportDetalle = async () => {
    if (detalleTablaRegistros.length === 0) {
      setError("No hay registros visibles en la pestaña Detalle para exportar.");
      return;
    }

    try {
      const XLSX = await import("xlsx");
      const exportRows = buildConciliacionPlanillaExportRows(detalleTablaRegistros);
      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Detalle");
      XLSX.writeFile(
        workbook,
        `conciliacion_detalle_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
    } catch (exportError) {
      setError(getHttpErrorMessage(exportError, "No se pudo exportar el detalle de conciliacion."));
    }
  };

  const handleExportRevisionResumen = async () => {
    if (revisionResumenRows.length === 0) {
      setError("No hay resumenes visibles en la pestaña Reporte revision para exportar.");
      return;
    }

    try {
      const XLSX = await import("xlsx");
      const exportRows = [
        ...revisionResumenRows.map((item) => ({
          Resumen: item.resumen,
          "Saldo MN": item.saldoMn,
          "Saldo ME": item.saldoMe,
          "ME - CON": item.saldoMeConvertido,
          "Total MN": item.totalMn,
        })),
        {
          Resumen: "TOTAL",
          "Saldo MN": revisionResumenTotals.saldoMn,
          "Saldo ME": revisionResumenTotals.saldoMe,
          "ME - CON": revisionResumenTotals.saldoMeConvertido,
          "Total MN": revisionResumenTotals.totalMn,
        },
      ];

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte revision");
      XLSX.writeFile(
        workbook,
        `conciliacion_reporte_revision_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
    } catch (exportError) {
      setError(getHttpErrorMessage(exportError, "No se pudo exportar el reporte revision."));
    }
  };

  const handleConciliarPlanillaV1 = async () => {
    if (!conciliacionFiltros.idCargo.trim() || !conciliacionFiltros.idEmpleado.trim() || !conciliacionFiltros.estados.trim()) {
      setError("Completa IdCargo, IdEmpleado y Estados antes de ejecutar la conciliacion_v1.");
      return;
    }

    if (!tieneRangoFechasConciliacion) {
      setError("Completa Fecha Inicio y Fecha Fin antes de ejecutar la conciliacion_v1.");
      return;
    }

    setLoadingConciliacion(true);
    setError("");
    setMessage("");

    try {
      await loadConciliacionPlanillaV1();
    } catch (conciliacionError) {
      setConciliacionPlanilla(null);
      setError(getHttpErrorMessage(conciliacionError, "No se pudo ejecutar la conciliacion_v1 con planilla."));
    } finally {
      setLoadingConciliacion(false);
    }
  };

  const handleExportConciliacionPlanillaFromAnalysis = async (
    analysisToExport: ConciliacionBcpAnalizarResponse | null = analysis
  ) => {
    if (!analysisToExport?.archivos?.length) {
      return;
    }

    const XLSX = await import("xlsx");
    const exportResponse = buildExportResponseFromAnalysisData(analysisToExport);
    const { workbook } = buildExportWorkbook(XLSX, exportResponse);

    XLSX.writeFile(
      workbook,
      `conciliacion_planilla_respaldo_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  const handleClear = () => {
    setFiles([]);
    setAnalysis(null);
    setConciliacionPlanilla(null);
    setIsConciliacionExpanded(false);
    setConciliacionPlanillaTab("revision");
    setConciliacionSort(null);
    setConciliacionGridFilters(DEFAULT_CONCILIACION_FILTERS);
    setRevisionFilters(DEFAULT_CONCILIACION_REVISION_FILTERS);
    setGastosPlanillaRows([]);
    setGastosPlanillaLoading(false);
    setGastosPlanillaError("");
    setGastosPlanillaMessage("");
    setGastosPlanillaQuickSearch("");
    setError("");
    setMessage("");
    setDragActive(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const resumenAnalisis = analysis?.archivos ?? [];

  const renderSortHeader = (label: string, key: ConciliacionSortKey) => {
    const isActive = conciliacionSort?.key === key;
    const direction = isActive ? conciliacionSort?.direction : null;

    return (
      <button type="button" style={styles.sortHeaderButton} onClick={() => handleSortConciliacion(key)}>
        <span>{label}</span>
        <span style={styles.sortHeaderIcon}>
          {!isActive ? (
            <ArrowUpDown size={12} />
          ) : (
            <ChevronDown size={12} style={direction === "asc" ? { transform: "rotate(180deg)" } : undefined} />
          )}
        </span>
      </button>
    );
  };

  const isFriendlyDuplicateWarning =
    error.toLowerCase().includes("no se permite el registro para evitar registros duplicados") ||
    error.toLowerCase().includes("evitar registros duplicados");

  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div>
          <p style={styles.kicker}>Finanzas / Conciliacion {codigoBanco}</p>
          <h1 style={styles.title}>Carga, analiza y graba movimientos bancarios</h1>
          <p style={styles.subtitle}>
            Sube uno o varios archivos Excel, deja que ChatGPT reconozca la estructura.
          </p>
        </div>
        <div style={styles.heroStats}>
          <SummaryCard label="Archivos" value={String(files.length)} />
          <SummaryCard label="Filas" value={String(totalRows)} />
          <SummaryCard label="Analizadas" value={String(resumenAnalisis.length)} />
          <SummaryCard label="Insertables" value={analysis?.puedeInsertar ? "Si" : "No"} />
        </div>
      </div>

        <div style={styles.card}>
          <div style={styles.toolbarRow}>
            <div style={styles.toolbarActionsGroup}>
              <label style={{ ...styles.fieldGroup, minWidth: 180 }}>
                <span style={styles.fieldLabel}>Banco</span>
                <select
                  value={codigoBanco}
                  onChange={(event) => setCodigoBanco(event.target.value)}
                  style={styles.input}
                >
                  {BANCO_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                ref={selectExcelButtonRef}
                type="button"
                style={styles.primaryButton}
                onClick={() => fileInputRef.current?.click()}
              >
                Seleccionar Excel
              </button>
              <button
                ref={analyzeButtonRef}
                type="button"
                style={!canAnalyze ? { ...styles.secondaryButton, ...styles.secondaryButtonDisabled } : styles.secondaryButton}
                onClick={() => void handleAnalyze()}
                disabled={!canAnalyze}
              >
                {loadingParse || loadingAnalysis ? "Analizando..." : "Analizar estructura"}
              </button>
              {analysis?.archivos?.length && showExportAnalysisButton ? (
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => void handleExportAnalysis()}
                  title="Exportar analisis a Excel"
                  aria-label="Exportar analisis a Excel"
                >
                  <FileDown size={16} strokeWidth={2.25} />
                  <span>Exportar Excel</span>
                </button>
              ) : null}
                <button
                  type="button"
                  style={{ ...styles.secondaryButton, ...styles.secondaryButtonDisabled }}
                  onClick={() => void loadConciliacionPlanilla()}
                  disabled
                >
                  {loadingConciliacion ? "Conciliando..." : "Conciliacion"}
                </button>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => void handleConciliarPlanillaV1()}
                disabled={!canConciliar}
                title="Conciliacion sobre MovimientosConciliacion"
              >
                {loadingConciliacion ? "Conciliando..." : "Conciliacion_v1"}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              multiple
              style={{ display: "none" }}
              onChange={(event) => {
                if (event.target.files?.length) {
                  void handleReplaceFiles(event.target.files);
                }
              }}
            />
            <div style={styles.toolbarDates}>
              <label style={styles.fieldGroup}>
                <span style={styles.fieldLabel}>Fecha inicio</span>
                <input
                  type="date"
                  value={conciliacionFiltros.fechaInicio}
                  onChange={(event) => setConciliacionFiltros((current) => ({ ...current, fechaInicio: event.target.value }))}
                  style={styles.input}
                />
              </label>
              <label style={styles.fieldGroup}>
                <span style={styles.fieldLabel}>Fecha fin</span>
                <input
                  type="date"
                  value={conciliacionFiltros.fechaFin}
                  onChange={(event) => setConciliacionFiltros((current) => ({ ...current, fechaFin: event.target.value }))}
                  style={styles.input}
                />
              </label>
            </div>
          </div>

        {error ? (
          <div style={isFriendlyDuplicateWarning ? styles.warningBanner : styles.errorBanner}>{error}</div>
        ) : null}
        {message ? <div style={styles.successBanner}>{message}</div> : null}

        {files.length === 0 ? (
          <div style={styles.emptyBanner}>No hay archivos seleccionados.</div>
        ) : (
          <div style={styles.cardSectionCompact}>
            <div style={styles.sectionHeaderCompact}>
              <div>
                <div style={styles.sectionTitleCompact}>Archivos adjuntos</div>
                <div style={styles.sectionTextCompact}>
                  {files.length} archivo(s) cargado(s). Expande este bloque para revisar el detalle de cada Excel.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFilesExpanded((current) => !current)}
                style={styles.collapseToggleButton}
                title={isFilesExpanded ? "Contraer archivos adjuntos" : "Expandir archivos adjuntos"}
                aria-label={isFilesExpanded ? "Contraer archivos adjuntos" : "Expandir archivos adjuntos"}
              >
                {isFilesExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                {isFilesExpanded ? "Contraer" : "Expandir"}
              </button>
            </div>

            {isFilesExpanded ? (
              <div style={styles.fileList}>
                {files.map((file) => {
              const analysisFile = analysis?.archivos.find((item) => item.nombreArchivo === file.nombreArchivo);
              const hasWarnings = Boolean(analysisFile?.advertencias?.length);

              return (
                <div key={file.id} style={styles.fileCard}>
                  <div style={styles.fileHeader}>
                    <div>
                      <strong style={styles.fileName}>{file.nombreArchivo}</strong>
                      <div style={styles.fileMeta}>
                        Hoja: {file.nombreHoja || "(sin hoja)"} | Filas: {formatNumber(file.totalFilas)}
                      </div>
                    </div>
                    <div style={styles.fileBadges}>
                      <span style={file.clientError ? styles.badgeError : styles.badgeOk}>
                        {file.clientError ? "Error" : "Listo"}
                      </span>
                      {analysisFile ? (
                        <span style={analysisFile.requiereRevision ? styles.badgeWarn : styles.badgeOk}>
                          {analysisFile.requiereRevision ? "Revisar" : "Validado"}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {file.clientError ? <div style={styles.inlineError}>{file.clientError}</div> : null}

                  <div style={styles.previewBlock}>
                    <div style={styles.previewTitle}>Vista previa</div>
                    <div style={styles.previewText}>
                      Empresa: {analysisFile?.empresa || file.empresa || "(sin empresa)"}
                    </div>
                    <div style={styles.previewText}>
                      Cuenta: {analysisFile?.cuenta || file.cuenta || "(sin cuenta)"}
                    </div>
                    <div style={styles.previewText}>
                      Moneda: {analysisFile?.moneda || file.moneda || "(sin moneda)"}
                    </div>
                    <div style={styles.previewText}>
                      {buildPreviewTextFromRow(file.rows[0]) || "Sin encabezados detectados"}
                    </div>
                    <div style={styles.previewText}>
                      {buildPreviewText(file.sampleRows[1] ?? []) || "Sin datos de ejemplo"}
                    </div>
                  </div>

                  {analysisFile ? (
                    <>
                      <div style={styles.analysisBlock}>
                        <div style={styles.analysisMeta}>
                          Cabecera: {analysisFile.filaCabecera ?? 1} | Datos: {analysisFile.filaDatos ?? 2} |{" "}
                          Requiere revision: {analysisFile.requiereRevision ? "Si" : "No"} | Filas normalizadas:{" "}
                          {analysisFile.filasNormalizadas?.length ?? 0}
                        </div>
                        {analysisFile.observacion ? (
                          <div style={styles.analysisNote}>{analysisFile.observacion}</div>
                        ) : null}
                        {analysisFile.debug?.motivoSinRegistros ? (
                          <div style={styles.inlineError}>{analysisFile.debug.motivoSinRegistros}</div>
                        ) : null}
                        {hasWarnings ? (
                          <ul style={styles.warningList}>
                            {analysisFile.advertencias.map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>

                      {analysisFile.filasNormalizadas?.length ? (
                        <div style={styles.mappingTableWrap}>
                          <table style={styles.mappingTable}>
                            <thead>
                              <tr>
                                {MOVIMIENTOS_ORDENADOS_COLUMNS.slice(0, 16).map((column) => (
                                  <th key={column} style={styles.th}>
                                    {column}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {analysisFile.filasNormalizadas.slice(0, 5).map((row, rowIndex) => (
                                <tr key={`${analysisFile.nombreArchivo}-preview-${rowIndex}`}>
                                  {MOVIMIENTOS_ORDENADOS_COLUMNS.slice(0, 16).map((column) => (
                                    <td key={`${analysisFile.nombreArchivo}-${rowIndex}-${column}`} style={styles.td}>
                                      {String(getPreviewCellValue(row as Record<string, unknown>, column))}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}

                      <div style={styles.mappingTableWrap}>
                        <table style={styles.mappingTable}>
                          <thead>
                            <tr>
                              <th style={styles.th}>Columna Excel</th>
                              <th style={styles.th}>Parametro SQL</th>
                              <th style={styles.th}>Confianza</th>
                              <th style={styles.th}>Transformacion</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analysisFile.mapeos.length > 0 ? (
                              analysisFile.mapeos.map((mapeo) => (
                                <tr key={`${mapeo.columnaOrigen}-${mapeo.parametroDestino ?? "sin-mapeo"}`}>
                                  <td style={styles.td}>{mapeo.columnaOrigen}</td>
                                  <td style={styles.td}>{mapeo.parametroDestino || "Sin mapeo"}</td>
                                  <td style={styles.td}>{Math.round((mapeo.confianza || 0) * 100)}%</td>
                                  <td style={styles.td}>{mapeo.transformacion || ""}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td style={styles.td} colSpan={4}>
                                  No se detectaron mapeos automÃ¡ticos.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <div style={styles.helperText}>
                      Aun no se ha ejecutado el analisis IA para este archivo.
                    </div>
                  )}
                </div>
              );
                })}
              </div>
            ) : (
              <div style={styles.helperText}>
                El detalle de los Excel esta contraido. Usa <strong>Expandir</strong> para revisarlo.
              </div>
            )}
          </div>
        )}
      </div>

      {analysis ? (
        <div style={styles.card}>
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.sectionTitle}>Resultado IA</h2>
              <p style={styles.sectionText}>
                La validacion y el consolidado se obtienen con ChatGPT antes de insertar en
                `MovimientosConciliacion`.
              </p>
            </div>
            <div style={styles.sectionActions}>
              {showExportAnalysisButton ? (
                <button
                  type="button"
                  style={styles.iconActionButton}
                  onClick={() => void handleExportAnalysis()}
                  title="Exportar analisis a Excel"
                  aria-label="Exportar analisis a Excel"
                  disabled={!analysis?.archivos?.length}
                >
                  <FileDown size={18} strokeWidth={2.25} />
                </button>
              ) : null}
              <button
                type="button"
                style={styles.collapseToggleButton}
                onClick={() => setIsAnalysisExpanded((current) => !current)}
                aria-label={isAnalysisExpanded ? "Ocultar resultado IA" : "Expandir resultado IA"}
                title={isAnalysisExpanded ? "Ocultar resultado IA" : "Expandir resultado IA"}
              >
                {isAnalysisExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span>{isAnalysisExpanded ? "Ocultar" : "Expandir"}</span>
              </button>
            </div>
          </div>

          {isAnalysisExpanded ? (
            <>
              <div style={styles.summaryBoard}>
                <SummaryCard label="Puede insertar" value={analysis.puedeInsertar ? "Si" : "No"} />
                <SummaryCard label="Param. proc." value={String(analysis.parametrosProcedimiento.length)} />
                <SummaryCard label="Archivos" value={String(analysis.archivos.length)} />
                <SummaryCard label="Con revision" value={String(analysis.archivos.filter((item) => item.requiereRevision).length)} />
              </div>

              <div style={styles.summaryBoard}>
                <SummaryCard label="Filas ordenadas" value={String(getAnalysisRows(analysis.archivos).length)} />
                <SummaryCard
                  label="Exportables"
                  value={getAnalysisRows(analysis.archivos).length > 0 ? "Si" : "No"}
                />
                <SummaryCard
                  label="Hoja objetivo"
                  value="Mov. ordenados"
                />
                <SummaryCard
                  label="Origen"
                  value="ChatGPT"
                />
              </div>

              {!analysis.puedeInsertar && (analysis.motivosNoInsertables?.length ?? 0) > 0 ? (
                <div style={styles.inlineError}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Motivos de bloqueo para insertar</div>
                  <ul style={styles.warningList}>
                    {analysis.motivosNoInsertables!.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div style={styles.previewBlock}>
                <div style={styles.previewTitle}>Conexion activa</div>
                <div style={styles.previewText}>API: {API_BASE_URL}</div>
                {analysis.archivos.map((archivo) => (
                  <div key={`estado-${archivo.nombreArchivo}`} style={styles.previewText}>
                    {archivo.nombreArchivo} | puedeInsertar: {analysis.puedeInsertar ? "Si" : "No"} | filasNormalizadas:{" "}
                    {archivo.filasNormalizadas?.length ?? 0} | requiereRevision: {archivo.requiereRevision ? "Si" : "No"}
                  </div>
                ))}
              </div>

              {analysis.parametrosProcedimiento.length > 0 ? (
                <div style={styles.mappingTableWrap}>
                  <table style={styles.mappingTable}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Parametro</th>
                        <th style={styles.th}>Tipo</th>
                        <th style={styles.th}>Obligatorio</th>
                        <th style={styles.th}>Default</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.parametrosProcedimiento.map((parametro) => (
                        <tr key={parametro.nombre}>
                          <td style={styles.td}>{parametro.nombre}</td>
                          <td style={styles.td}>{parametro.tipo}</td>
                          <td style={styles.td}>{parametro.esObligatorio ? "Si" : "No"}</td>
                          <td style={styles.td}>{parametro.tieneDefault ? "Si" : "No"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {analysis.debug ? (
                <div style={styles.previewBlock}>
                  <div style={styles.previewTitle}>Diagnostico IA</div>
                  {analysis.debug.archivosEnviados.map((archivo) => (
                    <div key={`debug-${archivo.nombreArchivo}`} style={styles.previewText}>
                      {archivo.nombreArchivo} | {archivo.tipoContenido || "sin mime"} | {archivo.tamanoBytes || 0} bytes | hoja cliente:{" "}
                      {archivo.nombreHojaDetectadaCliente || "(sin hoja)"} | filas cliente: {archivo.totalFilasDetectadasCliente}
                    </div>
                  ))}
                  {analysis.debug.promptAnalisis ? (
                    <pre style={styles.debugPre}>{analysis.debug.promptAnalisis}</pre>
                  ) : null}
                  {analysis.debug.jsonInterpretadoIa ? (
                    <pre style={styles.debugPre}>{analysis.debug.jsonInterpretadoIa}</pre>
                  ) : null}
                  {analysis.debug.respuestaCrudaIa ? (
                    <pre style={styles.debugPre}>{analysis.debug.respuestaCrudaIa}</pre>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {conciliacionPlanilla ? (
        <div style={styles.card}>
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.sectionTitle}>Conciliacion Planilla</h2>
              <p style={styles.sectionText}>
                Comparacion entre `MovimientosConciliacion` y `sp_Planilla_Consulta_Estados`, manteniendo la base de conciliacion como origen principal.
              </p>
            </div>
            <div style={styles.sectionActions}>
              <button
                type="button"
                onClick={() => setIsConciliacionExpanded((current) => !current)}
                style={styles.collapseToggleButton}
                title={isConciliacionExpanded ? "Contraer conciliacion planilla" : "Expandir conciliacion planilla"}
                aria-label={isConciliacionExpanded ? "Contraer conciliacion planilla" : "Expandir conciliacion planilla"}
              >
                {isConciliacionExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                {isConciliacionExpanded ? "Contraer" : "Expandir"}
              </button>
              <button
                type="button"
                onClick={() => void handleExportConciliacionPlanilla()}
                style={styles.iconActionButton}
                title="Exportar conciliacion planilla a Excel"
                aria-label="Exportar conciliacion planilla a Excel"
              >
                <FileDown size={18} strokeWidth={2.25} />
              </button>
            </div>
          </div>

          {isConciliacionExpanded ? (
            <>
              <div style={styles.conciliacionSummaryBoard}>
            <SummaryCard label="Movimientos" value={String(conciliacionPlanilla.totalMovimientos)} />
            <SummaryCard label="Por Nro Op." value={String(conciliacionPlanilla.coincidenciasPorNroOperacion)} />
            <SummaryCard label="Por Cuenta" value={String(conciliacionPlanilla.coincidenciasPorCuenta)} />
            <SummaryCard label="Por Cta Inter" value={String(conciliacionPlanilla.coincidenciasPorCuentaInter)} />
            <SummaryCard label="Sin coincid." value={String(conciliacionPlanilla.sinCoincidencia)} />
          </div>

              <div style={styles.planillaTabs}>
                <button
                  type="button"
                  style={{
                    ...styles.planillaTabButton,
                    ...(conciliacionPlanillaTab === "revision" ? styles.planillaTabButtonActive : null),
                  }}
                  onClick={() => handleSelectConciliacionPlanillaTab("revision")}
                >
                  Reporte revision
                </button>
                <button
                  type="button"
                  style={{
                    ...styles.planillaTabButton,
                    ...(conciliacionPlanillaTab === "ejecutivo" ? styles.planillaTabButtonActive : null),
                  }}
                  onClick={() => handleSelectConciliacionPlanillaTab("ejecutivo")}
                >
                  Resumen grafico ejecutivo
                </button>
                <button
                  type="button"
                  style={{
                    ...styles.planillaTabButton,
                    ...(conciliacionPlanillaTab === "detalle" ? styles.planillaTabButtonActive : null),
                  }}
                  onClick={() => handleSelectConciliacionPlanillaTab("detalle")}
                >
                  Detalle
                </button>
                <button
                  type="button"
                  style={{
                    ...styles.planillaTabButton,
                    ...(conciliacionPlanillaTab === "gastos" ? styles.planillaTabButtonActive : null),
                  }}
                  onClick={() => handleSelectConciliacionPlanillaTab("gastos")}
                >
                  Gastos
                </button>
              </div>

              {conciliacionPlanillaTab === "revision" ? (
                <div style={styles.revisionBoard}>
                  <div style={styles.revisionHeader}>
                    <div>
                      <div style={styles.revisionTitle}>Reporte revision</div>
                      <div style={styles.revisionText}>
                        Resumen relacionado con conciliacion planilla, agrupado por cuenta contable y filtrable por las dimensiones principales.
                      </div>
                    </div>
                    <div style={styles.revisionHeaderActions}>
                      <div style={styles.revisionMeta}>
                        Registros visibles: {revisionFilteredRows.length} | Resumenes: {revisionResumenRows.length}
                      </div>
                      <button
                        type="button"
                        style={styles.iconActionButton}
                        onClick={() => void handleExportRevisionResumen()}
                        aria-label="Exportar reporte revision a Excel"
                        title="Exportar reporte revision a Excel"
                      >
                        <FileDown size={16} />
                      </button>
                    </div>
                  </div>

                  <div style={styles.revisionFilterGrid}>
                    {(
                      [
                        ["cuentaContable", "CUENTA CONTABLE"],
                        ["areaFlujo", "AREA_FLUJO"],
                        ["empresa", "EMPRESA"],
                        ["banco", "BANCO MOVIMIENTO"],
                        ["system", "SYSTEM"],
                        ["cliente", "CLIENTE"],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key} style={styles.revisionFilterCard}>
                        <div style={styles.revisionFilterLabel}>{label}</div>
                        <select
                          value={revisionFilters[key]}
                          onChange={(event) =>
                            setRevisionFilters((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                          style={styles.revisionFilterSelect}
                        >
                          <option value="">Todos</option>
                          {revisionFilterOptions[key].map((option) => (
                            <option key={`${key}-${option}`} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                    <div style={styles.revisionFilterCard}>
                      <div style={styles.revisionFilterLabel}>TIPO CAMBIO DIARIO</div>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={revisionTipoCambioDiario}
                        onChange={(event) => {
                          const parsed = Number(event.target.value);
                          setRevisionTipoCambioDiario(Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIPO_CAMBIO_DIARIO);
                        }}
                        style={styles.revisionFilterInput}
                      />
                    </div>
                  </div>

                  <div style={styles.revisionTableWrap}>
                    <table style={styles.revisionTable}>
                      <colgroup>
                        <col style={styles.revisionColResumen} />
                        <col style={styles.revisionColNumeric} />
                        <col style={styles.revisionColNumeric} />
                        <col style={styles.revisionColNumeric} />
                        <col style={styles.revisionColNumeric} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th style={styles.th}>RESUMEN</th>
                          <th style={styles.thRight}>SALDO MN</th>
                          <th style={styles.thRight}>SALDO ME</th>
                          <th style={styles.thRight}>ME - CON</th>
                          <th style={styles.thRight}>TOTAL MN</th>
                        </tr>
                      </thead>
                      <tbody>
                        {revisionResumenRows.length > 0 ? (
                          <>
                            {revisionResumenRows.map((item) => (
                              <tr key={item.resumen}>
                                <td style={styles.td}>{item.resumen}</td>
                                <td style={styles.tdNumeric}>{formatNumber(item.saldoMn)}</td>
                                <td style={styles.tdNumeric}>{formatNumber(item.saldoMe)}</td>
                                <td style={styles.tdNumericStrong}>{formatNumber(item.saldoMeConvertido)}</td>
                                <td style={styles.tdNumericStrong}>{formatNumber(item.totalMn)}</td>
                              </tr>
                            ))}
                            <tr style={styles.revisionTotalRow}>
                              <td style={styles.tdStrong}>TOTAL</td>
                              <td style={styles.tdNumericStrong}>{formatNumber(revisionResumenTotals.saldoMn)}</td>
                              <td style={styles.tdNumericStrong}>{formatNumber(revisionResumenTotals.saldoMe)}</td>
                              <td style={styles.tdNumericStrong}>{formatNumber(revisionResumenTotals.saldoMeConvertido)}</td>
                              <td style={styles.tdNumericStrong}>{formatNumber(revisionResumenTotals.totalMn)}</td>
                            </tr>
                          </>
                        ) : (
                          <tr>
                            <td style={styles.td} colSpan={5}>
                              No hay datos para el reporte con los filtros actuales.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : conciliacionPlanillaTab === "ejecutivo" ? (
                <div style={styles.executiveBoard}>
                  <div style={styles.executiveBoardHeader}>
                    <div>
                      <div style={styles.executiveBoardTitle}>Resumen grafico ejecutivo</div>
                      <div style={styles.executiveBoardText}>
                        TotalPagar agrupado por moneda y resultado sobre los registros visibles en la tabla.
                      </div>
                    </div>
                    <div style={styles.executiveBoardMeta}>
                      Con TotalPagar: {conciliacionResumenEjecutivo.registrosConTotalPagar} | Sin TotalPagar:{" "}
                      {conciliacionResumenEjecutivo.registrosSinTotalPagar}
                    </div>
                  </div>

                  {conciliacionResumenGraficoEjecutivo.chartData.length > 0 ? (
                    <div style={styles.executivePieBoard}>
                      <div style={styles.executivePieHeader}>
                        <div>
                          <div style={styles.executivePieTitle}>Torta dinamica ejecutiva</div>
                        <div style={styles.executivePieText}>
                            Agrupa los registros visibles por {getConciliacionExecutivePieLevelLabel(conciliacionExecutivePieLevel).toLowerCase()} y permite bajar desde banco movimiento, resultado y cuenta contable.
                          </div>
                        </div>
                        <div style={styles.executivePieMeta}>
                          Con importe: {conciliacionResumenGraficoEjecutivo.rowsWithTotal} | Sin importe: {conciliacionResumenGraficoEjecutivo.rowsWithoutTotal} |
                          Sin coincidencia: {conciliacionResumenGraficoEjecutivo.rowsSinCoincidencia} |
                          Visible: {conciliacionResumenGraficoEjecutivo.visibleRows}
                        </div>
                      </div>

                      <div style={styles.executivePieTrail}>
                        <button type="button" style={styles.executivePieTrailButton} onClick={handleConciliacionExecutivePieReset}>
                          Banco movimiento
                        </button>
                        {conciliacionExecutivePiePath.bancoMovimiento ? (
                          <button type="button" style={styles.executivePieTrailButton} onClick={handleConciliacionExecutivePieBackToBank}>
                            {conciliacionExecutivePiePath.bancoMovimiento}
                          </button>
                        ) : null}
                        <span style={styles.executivePieTrailText}>
                          {getConciliacionExecutivePieLevelLabel(conciliacionExecutivePieLevel)}
                        </span>
                      </div>

                      <div style={styles.executivePieLayout}>
                        <div style={styles.executivePieChartCard}>
                          <div style={styles.executivePieChartWrap}>
                            <ResponsiveContainer width="100%" height={300}>
                              <PieChart>
                                <Pie
                                  data={conciliacionResumenGraficoEjecutivo.chartData}
                                  dataKey="value"
                                  nameKey="label"
                                  innerRadius={62}
                                  outerRadius={96}
                                  paddingAngle={2}
                                  onClick={(_, index) => {
                                    const datum = conciliacionResumenGraficoEjecutivo.chartData[index];
                                    if (datum) {
                                      handleConciliacionExecutivePieItemClick(datum);
                                    }
                                  }}
                                >
                                  {conciliacionResumenGraficoEjecutivo.chartData.map((item, index) => (
                                    <Cell
                                      key={`${item.label}-${index}`}
                                      fill={EXECUTIVE_PIE_COLORS[index % EXECUTIVE_PIE_COLORS.length]}
                                      stroke="#FFFFFF"
                                      strokeWidth={2}
                                      cursor={conciliacionExecutivePieLevel === "cuentaContable" ? "default" : "pointer"}
                                    />
                                  ))}
                                  <Label
                                    position="center"
                                    content={({ viewBox }) => {
                                      const centerBox = viewBox as { cx?: number; cy?: number } | undefined;
                                      const cx = typeof centerBox?.cx === "number" ? centerBox.cx : 0;
                                      const cy = typeof centerBox?.cy === "number" ? centerBox.cy : 0;

                                      return (
                                        <g>
                                          <text
                                            x={cx}
                                            y={cy - 6}
                                            textAnchor="middle"
                                            dominantBaseline="middle"
                                            style={{
                                              fontSize: 18,
                                              fontWeight: 900,
                                              fill: "#0F172A",
                                            }}
                                          >
                                            {formatNumber(conciliacionResumenGraficoEjecutivo.totalValue)}
                                          </text>
                                          <text
                                            x={cx}
                                            y={cy + 16}
                                            textAnchor="middle"
                                            dominantBaseline="middle"
                                            style={{
                                              fontSize: 12,
                                              fontWeight: 700,
                                              fill: "#64748B",
                                            }}
                                          >
                                            {getConciliacionExecutivePieLevelLabel(conciliacionExecutivePieLevel)}
                                          </text>
                                        </g>
                                      );
                                    }}
                                  />
                                </Pie>
                                <Tooltip
                                  formatter={(value, label) => [formatNumber(Number(value ?? 0)), String(label ?? "")]}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        <div style={styles.executivePieLegend}>
                          {conciliacionResumenGraficoEjecutivo.chartData.map((item, index) => (
                            <button
                              key={`${item.label}-legend`}
                              type="button"
                              style={styles.executivePieLegendItem}
                              onClick={() => handleConciliacionExecutivePieItemClick(item)}
                            >
                              <span
                                style={{
                                  ...styles.executivePieSwatch,
                                  backgroundColor: EXECUTIVE_PIE_COLORS[index % EXECUTIVE_PIE_COLORS.length],
                                }}
                              />
                              <span style={styles.executivePieLegendInfo}>
                                <span style={styles.executivePieLegendLabel}>{item.label}</span>
                                <span style={styles.executivePieLegendFoot}>{item.count} registro(s)</span>
                              </span>
                              <span style={styles.executivePieLegendRight}>
                                <span style={styles.executivePieLegendValue}>{formatNumber(item.value)}</span>
                                <span style={styles.executivePieLegendPercent}>
                                  {formatPercentage(
                                    conciliacionResumenGraficoEjecutivo.totalValue > 0
                                      ? (item.value / conciliacionResumenGraficoEjecutivo.totalValue) * 100
                                      : 0
                                  )}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={styles.helperText}>
                      No hay registros visibles con TotalPagar para construir la torta ejecutiva.
                    </div>
                  )}

                  {conciliacionResumenEjecutivo.monedas.length > 0 ? (
                    <div style={styles.executiveCurrencyGrid}>
                      {conciliacionResumenEjecutivo.monedas.map((monedaResumen) => {
                        const maxAbs = Math.max(...monedaResumen.resultados.map((item) => Math.abs(item.totalPagar)), 1);

                        return (
                          <div
                            key={monedaResumen.moneda}
                            onClick={() => handleExecutiveCurrencyClick(monedaResumen.moneda)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                handleExecutiveCurrencyClick(monedaResumen.moneda);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                            style={{
                              ...styles.executiveCurrencyCard,
                              ...(conciliacionExecutiveSelection.moneda === monedaResumen.moneda &&
                              conciliacionExecutiveSelection.resultado === null
                                ? styles.executiveCurrencyCardActive
                                : null),
                            }}
                          >
                            <div style={styles.executiveCurrencyHeader}>
                              <div>
                                <div style={styles.executiveCurrencyBadge}>{monedaResumen.moneda}</div>
                                <div style={styles.executiveCurrencyTotal}>{formatNumber(monedaResumen.totalPagar)}</div>
                              </div>
                              <div style={styles.executiveCurrencyCount}>{monedaResumen.cantidad} registro(s)</div>
                            </div>

                            <div style={styles.executiveBars}>
                              {monedaResumen.resultados.map((resultadoResumen) => (
                                <button
                                  key={`${monedaResumen.moneda}-${resultadoResumen.resultado}`}
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleExecutiveResultClick(monedaResumen.moneda, resultadoResumen.resultado);
                                  }}
                                  style={{
                                    ...styles.executiveBarButton,
                                    ...(conciliacionExecutiveSelection.moneda === monedaResumen.moneda &&
                                    conciliacionExecutiveSelection.resultado === resultadoResumen.resultado
                                      ? styles.executiveBarButtonActive
                                      : null),
                                  }}
                                >
                                  <div style={styles.executiveBarRow}>
                                    <div style={styles.executiveBarHeader}>
                                      <span style={styles.executiveBarLabel}>{resultadoResumen.resultado}</span>
                                      <span style={styles.executiveBarValue}>{formatNumber(resultadoResumen.totalPagar)}</span>
                                    </div>
                                    <div style={styles.executiveBarTrack}>
                                      <div
                                        style={{
                                          ...styles.executiveBarFill,
                                          width: `${Math.max((Math.abs(resultadoResumen.totalPagar) / maxAbs) * 100, 6)}%`,
                                          background: getResultadoChartColor(resultadoResumen.resultado),
                                        }}
                                      />
                                    </div>
                                    <div style={styles.executiveBarFoot}>{resultadoResumen.cantidad} registro(s)</div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={styles.helperText}>
                      No hay registros visibles con `TotalPagar` para construir el resumen grafico.
                    </div>
                  )}
                </div>
              ) : conciliacionPlanillaTab === "detalle" ? (
                <>
                  <div style={styles.mappingTableWrap}>
                    <div style={styles.gridToolbar}>
                      <div style={styles.gridToolbarInfo}>
                        <div style={styles.gridToolbarText}>
                          {detalleTablaDescripcion}
                        </div>
                        <div style={styles.gridToolbarCount}>
                          Registros: {detalleTablaRegistros.length} de {executiveFilteredConciliacionRegistros.length}
                          {executiveSelectionLabel ? ` | Ejecutivo: ${executiveSelectionLabel}` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                        <button type="button" style={styles.gridToolbarButton} onClick={handleClearConciliacionFilters}>
                          Limpiar filtros
                        </button>
                        <button
                          type="button"
                          style={{
                            ...styles.gridToolbarButton,
                            opacity: detalleTablaRegistros.length === 0 ? 0.6 : 1,
                            cursor: detalleTablaRegistros.length === 0 ? "not-allowed" : "pointer",
                          }}
                          onClick={() => void handleExportDetalle()}
                          disabled={detalleTablaRegistros.length === 0}
                        >
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <FileDown size={14} />
                            Exportar
                          </span>
                        </button>
                        <button
                          type="button"
                          style={styles.gridToolbarButton}
                          onClick={toggleDetalleExpandedPopup}
                          aria-label={detalleExpandedPopupOpen ? "Contraer detalle" : "Expandir detalle"}
                        >
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            {detalleExpandedPopupOpen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                            {detalleExpandedPopupOpen ? "Contraer" : "Expandir"}
                          </span>
                        </button>
                      </div>
                    </div>
                    <div style={styles.gastosSearchWrap}>
                      <input
                        type="text"
                        value={detalleQuickSearch}
                        onChange={(event) => setDetalleQuickSearch(event.target.value)}
                        placeholder="Busqueda rapida por cualquier columna visible del grid"
                        style={styles.gastosSearchInput}
                      />
                    </div>
                    <div
                      ref={detalleHeaderScrollRef}
                      className="employee-horizontal-scroll"
                      style={styles.detailScrollHeader}
                      aria-hidden="true"
                    >
                      <div
                        style={{
                          ...styles.detailScrollSpacer,
                          width: detalleScrollContentWidth || "100%",
                        }}
                      />
                    </div>
                    <div ref={detalleTableScrollRef} className="employee-grid-scroll" style={styles.detailTableScroll}>
            <table style={styles.mappingTable}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh, ...getConciliacionDetailStickyColumnStyle("fecha", "header") }}>{renderSortHeader("Fecha", "fecha")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh, ...getConciliacionDetailStickyColumnStyle("codigoBanco", "header") }}>{renderSortHeader("Banco Movimiento", "codigoBanco")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh, ...getConciliacionDetailStickyColumnStyle("empresa", "header") }}>{renderSortHeader("Empresa", "empresa")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh, ...getConciliacionDetailStickyColumnStyle("cuenta", "header") }}>{renderSortHeader("Cuenta", "cuenta")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh, ...getConciliacionDetailStickyColumnStyle("moneda", "header") }}>{renderSortHeader("Moneda", "moneda")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh, ...getConciliacionDetailStickyColumnStyle("monto", "header") }}>{renderSortHeader("Monto", "monto")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh, ...getConciliacionDetailStickyColumnStyle("totalPagar", "header") }}>{renderSortHeader("TotalPagar", "totalPagar")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Diferencia", "diferencia")}</th>
                  <th style={{ ...styles.th, ...styles.detailActionHeaderTh }} />
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("NroOperacion", "nroOperacion")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("DescripcionOperacion", "descripcionOperacion")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Comentario", "comentario")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Resultado", "resultadoConciliacion")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Tipo", "tipoCoincidencia")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("NroOperacionPlanilla", "nroOperacionPlanilla")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("CuentaPlanilla", "cuentaPlanilla")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("CuentaInterPlanilla", "cuentaInterPlanilla")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Cliente", "clientePlanilla")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Proyecto", "proyectoPlanilla")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Site", "sitePlanilla")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Tipo_Trabajo", "tipoTrabajoPlanilla")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Tarea", "tareaPlanilla")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Responsable", "responsablePlanilla")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Comprobante", "comprobantePlanilla")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Area Flujo", "areaFlujo")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Referencia", "referencia")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Cuenta Contable", "cuentaContable")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Conciliado", "conciliado")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Estado Conciliacion", "estadoConciliacionTexto")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Estado Operativo", "estadoOperativoConciliacion")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Fecha Conciliacion", "fechaConciliacion")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Usuario Conciliacion", "usuarioConciliacion")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Obs. Conciliacion", "observacionConciliacionMovimiento")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Banco", "bancoPlanilla")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Serie", "seriePlanilla")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Detalle", "detallePlanilla")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("OC", "idOc")}</th>
                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Correlativo", "correlativoPlanilla")}</th>
                </tr>
                <tr>
                  {(
                    [
                      "fecha",
                      "codigoBanco",
                      "empresa",
                      "cuenta",
                      "moneda",
                      "monto",
                      "totalPagar",
                      "diferencia",
                      "nroOperacion",
                      "descripcionOperacion",
                      "comentario",
                      "resultadoConciliacion",
                      "tipoCoincidencia",
                      "nroOperacionPlanilla",
                      "cuentaPlanilla",
                      "cuentaInterPlanilla",
                      "clientePlanilla",
                      "proyectoPlanilla",
                      "sitePlanilla",
                      "tipoTrabajoPlanilla",
                      "tareaPlanilla",
                      "responsablePlanilla",
                      "comprobantePlanilla",
                      "areaFlujo",
                      "referencia",
                      "cuentaContable",
                      "conciliado",
                      "estadoConciliacionTexto",
                      "estadoOperativoConciliacion",
                      "fechaConciliacion",
                      "usuarioConciliacion",
                      "observacionConciliacionMovimiento",
                      "bancoPlanilla",
                      "seriePlanilla",
                      "detallePlanilla",
                      "correlativoPlanilla",
                      "__detalleAccion",
                    ] as Array<ConciliacionSortKey | "__detalleAccion">
                   ).map((key) => (
                    <th
                      key={`filter-${key}`}
                      style={
                        key === "__detalleAccion"
                          ? { ...styles.filterTh, ...styles.detailActionFilterTh }
                          : { ...styles.filterTh, ...styles.detailStickyFilterTh, ...getConciliacionDetailStickyColumnStyle(key, "filter") }
                      }
                    >
                      {key === "__detalleAccion" ? null : key === "resultadoConciliacion" ? (
                        <div ref={resultadoFilterDropdownRef} style={styles.multiFilterWrap}>
                          <button
                            type="button"
                            style={styles.multiFilterButton}
                            onClick={() => setIsResultadoFilterOpen((current) => !current)}
                            aria-label="Filtrar por resultado"
                          >
                            <span style={styles.multiFilterButtonText}>{resultadoConciliacionFilterLabel}</span>
                            <ChevronDown size={14} />
                          </button>
                          {isResultadoFilterOpen ? (
                            <div style={styles.multiFilterDropdown}>
                              {conciliacionFilterOptions[key].map((optionValue) => {
                                const checked = resultadoConciliacionSelectedFilters.includes(optionValue);
                                return (
                                  <label key={`${key}-${optionValue}`} style={styles.multiFilterOption}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => handleResultadoConciliacionFilterToggle(optionValue)}
                                    />
                                    <span>{optionValue === EMPTY_CONCILIACION_FILTER_VALUE ? "(VacÃ­o)" : optionValue}</span>
                                  </label>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      ) : key === "descripcionOperacion" ? (
                        <input
                          type="text"
                          value={Array.isArray(conciliacionGridFilters[key]) ? "" : conciliacionGridFilters[key]}
                          onChange={(event) => handleConciliacionFilterChange(key, event.target.value)}
                          style={styles.filterInput}
                          placeholder="Buscar..."
                          aria-label="Filtrar por descripcion operacion"
                        />
                      ) : (
                        <select
                          value={Array.isArray(conciliacionGridFilters[key]) ? "" : conciliacionGridFilters[key]}
                          onChange={(event) => handleConciliacionFilterChange(key, event.target.value)}
                          style={styles.filterSelect}
                          aria-label={`Filtrar por ${key}`}
                        >
                          <option value="">Todos</option>
                          {conciliacionFilterOptions[key].map((optionValue) => (
                            <option key={`${key}-${optionValue}`} value={optionValue}>
                              {optionValue === EMPTY_CONCILIACION_FILTER_VALUE ? "(VacÃ­o)" : optionValue}
                            </option>
                          ))}
                        </select>
                      )}
                    </th>
                  ))}
                  <th style={{ ...styles.filterTh, ...styles.detailStickyFilterTh }} />
                </tr>
              </thead>
              <tbody>
                {detalleTablaRegistros.length > 0 ? (
                  detalleTablaRegistros.map((row) => (
                    <tr key={`conciliacion-${row.idMovimientoBanco}`}>
                      <td style={{ ...styles.td, ...getConciliacionDetailStickyColumnStyle("fecha", "body") }}>{getConciliacionDisplayValue(row, "fecha")}</td>
                      <td style={{ ...styles.td, ...getConciliacionDetailStickyColumnStyle("codigoBanco", "body") }}>{getConciliacionDisplayValue(row, "codigoBanco")}</td>
                      <td style={{ ...styles.td, ...getConciliacionDetailStickyColumnStyle("empresa", "body") }}>{getConciliacionDisplayValue(row, "empresa")}</td>
                      <td style={{ ...styles.td, ...getConciliacionDetailStickyColumnStyle("cuenta", "body") }}>{getConciliacionDisplayValue(row, "cuenta")}</td>
                      <td style={{ ...styles.td, ...getConciliacionDetailStickyColumnStyle("moneda", "body") }}>{getConciliacionDisplayValue(row, "moneda")}</td>
                      <td style={{ ...styles.td, ...getConciliacionDetailStickyColumnStyle("monto", "body") }}>{getConciliacionDisplayValue(row, "monto")}</td>
                      <td style={{ ...styles.td, ...getConciliacionDetailStickyColumnStyle("totalPagar", "body") }}>
                        {getConciliacionDisplayValue(row, "totalPagar")}
                      </td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "diferencia")}</td>
                      <td style={{ ...styles.td, ...styles.detailActionCell }}>
                        {(() => {
                          const habilitarDetalle = isConciliacionDetalleActionEnabled(row);
                          return (
                        <button
                          type="button"
                          style={habilitarDetalle ? styles.detailRowActionButton : styles.detailRowActionButtonDisabled}
                          onClick={() => openMontoDiferenciaModal(row)}
                          aria-label={`Ajustar monto de diferencia del movimiento ${row.idMovimientoBanco}`}
                          title="Ajustar monto de diferencia"
                          disabled={!habilitarDetalle}
                        >
                          <Eye size={13} />
                        </button>
                          );
                        })()}
                      </td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "nroOperacion")}</td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "descripcionOperacion")}</td>
                      <td style={styles.td}>
                        <div style={styles.commentCellWrap}>
                          <textarea
                            value={comentarioDrafts[row.idMovimientoBanco] ?? row.comentario ?? ""}
                            onChange={(event) => handleComentarioDraftChange(row.idMovimientoBanco, event.target.value)}
                            onBlur={() => void handleComentarioBlur(row)}
                            style={styles.commentCellTextarea}
                            rows={2}
                            placeholder="Agregar comentario"
                            disabled={Boolean(comentarioSavingIds[row.idMovimientoBanco])}
                          />
                          {comentarioSavingIds[row.idMovimientoBanco] ? (
                            <span style={styles.commentCellStatus}>Guardando...</span>
                          ) : null}
                        </div>
                      </td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "resultadoConciliacion")}</td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "tipoCoincidencia")}</td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "nroOperacionPlanilla")}</td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "cuentaPlanilla")}</td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "cuentaInterPlanilla")}</td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "clientePlanilla")}</td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "proyectoPlanilla")}</td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "sitePlanilla")}</td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "tipoTrabajoPlanilla")}</td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "tareaPlanilla")}</td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "responsablePlanilla")}</td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "comprobantePlanilla")}</td>
                      <td style={styles.td}>
                        <div style={styles.inlineEditableCellWrap}>
                          <select
                            value={areaFlujoDrafts[row.idMovimientoBanco] ?? (row.idAreaFlujo ? String(row.idAreaFlujo) : "")}
                            onChange={(event) => void handleAreaFlujoInlineChange(row, event.target.value)}
                            style={styles.inlineEditableSelect}
                            disabled={
                              clasificacionCombosLoading ||
                              Boolean(areaFlujoSavingIds[row.idMovimientoBanco]) ||
                              !isConciliacionMovimientoActivo(row)
                            }
                            aria-label={`Editar Area Flujo del movimiento ${row.idMovimientoBanco}`}
                          >
                            <option value="">{row.nombreAreaFlujo || "PENDIENTE"}</option>
                            {(clasificacionCombos?.areasFlujo ?? []).map((option) => (
                              <option key={option.idAreaFlujo} value={String(option.idAreaFlujo)}>
                                {option.nombreAreaFlujo}
                              </option>
                            ))}
                          </select>
                            {areaFlujoSavingIds[row.idMovimientoBanco] ? (
                              <span style={styles.inlineEditableStatus}>Guardando...</span>
                            ) : null}
                        </div>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.inlineEditableCellWrap}>
                          <select
                            value={referenciaDrafts[row.idMovimientoBanco] ?? (row.idReferencia ? String(row.idReferencia) : "")}
                            onChange={(event) => void handleReferenciaInlineChange(row, event.target.value)}
                            style={styles.inlineEditableSelect}
                            disabled={
                              clasificacionCombosLoading ||
                              Boolean(referenciaSavingIds[row.idMovimientoBanco]) ||
                              !isConciliacionMovimientoActivo(row) ||
                              !row.idAreaFlujo ||
                              getReferenciasClasificacionInlineDisponibles(row.idAreaFlujo).length === 0
                            }
                            aria-label={`Editar Referencia del movimiento ${row.idMovimientoBanco}`}
                          >
                            <option value="">{getReferenciaLabel(row) || "PENDIENTE"}</option>
                            {getReferenciasClasificacionInlineDisponibles(row.idAreaFlujo).map((option) => (
                              <option key={option.idReferencia} value={String(option.idReferencia)}>
                                {option.codigoReferencia} - {option.nombreReferencia}
                              </option>
                            ))}
                          </select>
                          {referenciaSavingIds[row.idMovimientoBanco] ? (
                            <span style={styles.inlineEditableStatus}>Guardando...</span>
                          ) : !row.idAreaFlujo ? (
                            <span style={styles.inlineEditableStatus}>Depende de Area Flujo</span>
                          ) : null}
                        </div>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.inlineEditableCellWrap}>
                          <select
                            value={
                              cuentaContableDrafts[row.idMovimientoBanco] ??
                              (row.idCuentaContable ? String(row.idCuentaContable) : "")
                            }
                            onChange={(event) => void handleCuentaContableInlineChange(row, event.target.value)}
                            style={styles.inlineEditableSelect}
                            disabled={
                              clasificacionCombosLoading ||
                              Boolean(cuentaContableSavingIds[row.idMovimientoBanco]) ||
                              !isConciliacionMovimientoActivo(row) ||
                              !row.idAreaFlujo ||
                              !row.idReferencia ||
                              getCuentasClasificacionInlineDisponibles(row.idAreaFlujo, row.idReferencia).length === 0
                            }
                            aria-label={`Editar Cuenta Contable del movimiento ${row.idMovimientoBanco}`}
                          >
                            <option value="">{row.cuentaContableTexto || "PENDIENTE"}</option>
                            {getCuentasClasificacionInlineDisponibles(row.idAreaFlujo, row.idReferencia).map((option) => (
                              <option key={option.idCuentaContable} value={String(option.idCuentaContable)}>
                                {option.cuentaContableTexto}
                              </option>
                            ))}
                          </select>
                          {cuentaContableSavingIds[row.idMovimientoBanco] ? (
                            <span style={styles.inlineEditableStatus}>Guardando...</span>
                          ) : !row.idAreaFlujo || !row.idReferencia ? (
                            <span style={styles.inlineEditableStatus}>Depende de Area Flujo y Referencia</span>
                          ) : null}
                        </div>
                      </td>
                      <td style={styles.td}>
                        <span style={{ ...styles.statusBadge, ...getClasificacionBadgeStyle(getConciliadoLabel(row)) }}>
                          {getConciliadoLabel(row)}
                        </span>
                      </td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "estadoConciliacionTexto") || "PENDIENTE"}</td>
                      <td style={styles.td}>
                        {getConciliacionDisplayValue(row, "estadoOperativoConciliacion") ? (
                          <span
                            style={{
                              ...styles.statusBadge,
                              ...getClasificacionBadgeStyle(getConciliacionDisplayValue(row, "estadoOperativoConciliacion")),
                            }}
                          >
                            {getConciliacionDisplayValue(row, "estadoOperativoConciliacion")}
                          </span>
                        ) : (
                          "PENDIENTE"
                        )}
                      </td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "fechaConciliacion")}</td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "usuarioConciliacion")}</td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "observacionConciliacionMovimiento")}</td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "bancoPlanilla")}</td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "seriePlanilla")}</td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "detallePlanilla")}</td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "idOc")}</td>
                      <td
                        style={{
                          ...styles.td,
                          whiteSpace: "normal",
                          wordBreak: "break-word",
                          minWidth: 180,
                        }}
                        title={getConciliacionDisplayValue(row, "correlativoPlanilla")}
                      >
                        {getConciliacionDisplayValue(row, "correlativoPlanilla")}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td style={styles.td} colSpan={36}>
                      {detalleQuickSearch.trim()
                        ? "No se encontraron movimientos que coincidan con la búsqueda."
                        : "No se encontraron movimientos para los filtros ingresados."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
                    </div>
          </div>
                {detalleExpandedPopupOpen ? (
                  <div style={styles.detailPopupOverlay} onClick={() => setDetalleExpandedPopupOpen(false)}>
                    <div style={styles.detailPopupCard} onClick={(event) => event.stopPropagation()}>
                      <div style={styles.detailPopupHeader}>
                        <div style={styles.detailPopupHeaderLeft}>
                          <h3 style={styles.detailPopupHeaderTitle}>Detalle expandido</h3>
                          <p style={styles.detailPopupHeaderText}>Búsqueda rápida y grid completo en pantalla completa.</p>
                        </div>
                        <button type="button" style={styles.gridToolbarButton} onClick={toggleDetalleExpandedPopup}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <Minimize2 size={14} />
                            Contraer
                          </span>
                        </button>
                      </div>

                      <div style={styles.detailPopupBody}>
                        <div style={styles.detailPopupToolbar}>
                          <div style={styles.detailPopupSearchWrap}>
                            <div style={{ position: "relative" }}>
                              <Search
                                size={14}
                                style={{
                                  position: "absolute",
                                  left: 12,
                                  top: "50%",
                                  transform: "translateY(-50%)",
                                  color: "#94A3B8",
                                }}
                              />
                              <input
                                type="text"
                                value={detalleQuickSearch}
                                onChange={(event) => setDetalleQuickSearch(event.target.value)}
                                placeholder="Busqueda rapida por cualquier columna visible del grid"
                                style={{
                                  ...styles.gastosSearchInput,
                                  paddingLeft: 34,
                                }}
                              />
                            </div>
                          </div>
                          <div style={styles.gridToolbarCount}>
                            Registros: {detalleTablaRegistros.length} de {executiveFilteredConciliacionRegistros.length}
                            {executiveSelectionLabel ? ` | Ejecutivo: ${executiveSelectionLabel}` : ""}
                          </div>
                        </div>

                        <div style={styles.detailPopupTableWrap}>
                          <div className="employee-grid-scroll" style={styles.detailPopupTableScroll}>
                            <table style={styles.mappingTable}>
                              <thead>
                                <tr>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh, ...getConciliacionDetailStickyColumnStyle("fecha", "header") }}>{renderSortHeader("Fecha", "fecha")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh, ...getConciliacionDetailStickyColumnStyle("codigoBanco", "header") }}>{renderSortHeader("Banco Movimiento", "codigoBanco")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh, ...getConciliacionDetailStickyColumnStyle("empresa", "header") }}>{renderSortHeader("Empresa", "empresa")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh, ...getConciliacionDetailStickyColumnStyle("cuenta", "header") }}>{renderSortHeader("Cuenta", "cuenta")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh, ...getConciliacionDetailStickyColumnStyle("moneda", "header") }}>{renderSortHeader("Moneda", "moneda")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh, ...getConciliacionDetailStickyColumnStyle("monto", "header") }}>{renderSortHeader("Monto", "monto")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh, ...getConciliacionDetailStickyColumnStyle("totalPagar", "header") }}>{renderSortHeader("TotalPagar", "totalPagar")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Diferencia", "diferencia")}</th>
                                  <th style={{ ...styles.th, ...styles.detailActionHeaderTh }} />
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("NroOperacion", "nroOperacion")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("DescripcionOperacion", "descripcionOperacion")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Comentario", "comentario")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Resultado", "resultadoConciliacion")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Tipo", "tipoCoincidencia")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("NroOperacionPlanilla", "nroOperacionPlanilla")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("CuentaPlanilla", "cuentaPlanilla")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("CuentaInterPlanilla", "cuentaInterPlanilla")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Cliente", "clientePlanilla")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Proyecto", "proyectoPlanilla")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Site", "sitePlanilla")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Tipo_Trabajo", "tipoTrabajoPlanilla")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Tarea", "tareaPlanilla")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Responsable", "responsablePlanilla")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Comprobante", "comprobantePlanilla")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Area Flujo", "areaFlujo")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Referencia", "referencia")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Cuenta Contable", "cuentaContable")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Conciliado", "conciliado")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Estado Conciliacion", "estadoConciliacionTexto")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Estado Operativo", "estadoOperativoConciliacion")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Fecha Conciliacion", "fechaConciliacion")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Usuario Conciliacion", "usuarioConciliacion")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Obs. Conciliacion", "observacionConciliacionMovimiento")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Banco", "bancoPlanilla")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Serie", "seriePlanilla")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Detalle", "detallePlanilla")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("OC", "idOc")}</th>
                                  <th style={{ ...styles.th, ...styles.detailStickyHeaderTh }}>{renderSortHeader("Correlativo", "correlativoPlanilla")}</th>
                                </tr>
                                <tr>
                                  {(
                                    [
                                      "fecha",
                                      "codigoBanco",
                                      "empresa",
                                      "cuenta",
                                      "moneda",
                                      "monto",
                                      "totalPagar",
                                      "diferencia",
                                      "__detalleAccion",
                                      "nroOperacion",
                                      "descripcionOperacion",
                                      "comentario",
                                      "resultadoConciliacion",
                                      "tipoCoincidencia",
                                      "nroOperacionPlanilla",
                                      "cuentaPlanilla",
                                      "cuentaInterPlanilla",
                                      "clientePlanilla",
                                      "proyectoPlanilla",
                                      "sitePlanilla",
                                      "tipoTrabajoPlanilla",
                                      "tareaPlanilla",
                                      "responsablePlanilla",
                                      "comprobantePlanilla",
                                      "areaFlujo",
                                      "referencia",
                                      "cuentaContable",
                                      "conciliado",
                                      "estadoConciliacionTexto",
                                      "estadoOperativoConciliacion",
                                      "fechaConciliacion",
                                      "usuarioConciliacion",
                                      "observacionConciliacionMovimiento",
                                      "bancoPlanilla",
                                      "seriePlanilla",
                                      "detallePlanilla",
                                      "correlativoPlanilla",
                                    ] as Array<ConciliacionSortKey | "__detalleAccion">
                                  ).map((key) => (
                                    <th
                                      key={`popup-filter-${key}`}
                                      style={
                                        key === "__detalleAccion"
                                          ? { ...styles.filterTh, ...styles.detailActionFilterTh }
                                          : { ...styles.filterTh, ...styles.detailStickyFilterTh, ...getConciliacionDetailStickyColumnStyle(key, "filter") }
                                      }
                                    >
                                      {key === "__detalleAccion" ? null : key === "resultadoConciliacion" ? (
                                        <div ref={resultadoFilterDropdownRef} style={styles.multiFilterWrap}>
                                          <button
                                            type="button"
                                            style={styles.multiFilterButton}
                                            onClick={() => setIsResultadoFilterOpen((current) => !current)}
                                            aria-label="Filtrar por resultado"
                                          >
                                            <span style={styles.multiFilterButtonText}>{resultadoConciliacionFilterLabel}</span>
                                            <ChevronDown size={14} />
                                          </button>
                                          {isResultadoFilterOpen ? (
                                            <div style={styles.multiFilterDropdown}>
                                              {conciliacionFilterOptions[key].map((optionValue) => {
                                                const checked = resultadoConciliacionSelectedFilters.includes(optionValue);
                                                return (
                                                  <label key={`popup-${key}-${optionValue}`} style={styles.multiFilterOption}>
                                                    <input
                                                      type="checkbox"
                                                      checked={checked}
                                                      onChange={() => handleResultadoConciliacionFilterToggle(optionValue)}
                                                    />
                                                    <span>{optionValue === EMPTY_CONCILIACION_FILTER_VALUE ? "(VacÃ­o)" : optionValue}</span>
                                                  </label>
                                                );
                                              })}
                                            </div>
                                          ) : null}
                                        </div>
                                      ) : key === "descripcionOperacion" ? (
                                        <input
                                          type="text"
                                          value={Array.isArray(conciliacionGridFilters[key]) ? "" : conciliacionGridFilters[key]}
                                          onChange={(event) => handleConciliacionFilterChange(key, event.target.value)}
                                          style={styles.filterInput}
                                          placeholder="Buscar..."
                                          aria-label="Filtrar por descripcion operacion"
                                        />
                                      ) : (
                                        <select
                                          value={Array.isArray(conciliacionGridFilters[key]) ? "" : conciliacionGridFilters[key]}
                                          onChange={(event) => handleConciliacionFilterChange(key, event.target.value)}
                                          style={styles.filterSelect}
                                          aria-label={`Filtrar por ${key}`}
                                        >
                                          <option value="">Todos</option>
                                          {conciliacionFilterOptions[key].map((optionValue) => (
                                            <option key={`popup-${key}-${optionValue}`} value={optionValue}>
                                              {optionValue === EMPTY_CONCILIACION_FILTER_VALUE ? "(VacÃ­o)" : optionValue}
                                            </option>
                                          ))}
                                        </select>
                                      )}
                                    </th>
                                  ))}
                                  <th style={{ ...styles.filterTh, ...styles.detailStickyFilterTh }} />
                                </tr>
                              </thead>
                              <tbody>
                                {detalleTablaRegistros.length > 0 ? (
                                  detalleTablaRegistros.map((row) => (
                                    <tr key={`popup-conciliacion-${row.idMovimientoBanco}`}>
                                      <td style={{ ...styles.td, ...getConciliacionDetailStickyColumnStyle("fecha", "body") }}>{getConciliacionDisplayValue(row, "fecha")}</td>
                                      <td style={{ ...styles.td, ...getConciliacionDetailStickyColumnStyle("codigoBanco", "body") }}>{getConciliacionDisplayValue(row, "codigoBanco")}</td>
                                      <td style={{ ...styles.td, ...getConciliacionDetailStickyColumnStyle("empresa", "body") }}>{getConciliacionDisplayValue(row, "empresa")}</td>
                                      <td style={{ ...styles.td, ...getConciliacionDetailStickyColumnStyle("cuenta", "body") }}>{getConciliacionDisplayValue(row, "cuenta")}</td>
                                      <td style={{ ...styles.td, ...getConciliacionDetailStickyColumnStyle("moneda", "body") }}>{getConciliacionDisplayValue(row, "moneda")}</td>
                                      <td style={{ ...styles.td, ...getConciliacionDetailStickyColumnStyle("monto", "body") }}>{getConciliacionDisplayValue(row, "monto")}</td>
                                      <td style={{ ...styles.td, ...getConciliacionDetailStickyColumnStyle("totalPagar", "body") }}>{getConciliacionDisplayValue(row, "totalPagar")}</td>
                                      <td style={styles.td}>{getConciliacionDisplayValue(row, "diferencia")}</td>
                                      <td style={{ ...styles.td, ...styles.detailActionCell }}>
                                        {(() => {
                                          const habilitarDetalle = isConciliacionDetalleActionEnabled(row);
                                          return (
                                            <button
                                              type="button"
                                              style={habilitarDetalle ? styles.detailRowActionButton : styles.detailRowActionButtonDisabled}
                                              onClick={() => openMontoDiferenciaModal(row)}
                                              aria-label={`Ajustar monto de diferencia del movimiento ${row.idMovimientoBanco}`}
                                              title="Ajustar monto de diferencia"
                                              disabled={!habilitarDetalle}
                                            >
                                              <Eye size={13} />
                                            </button>
                                          );
                                        })()}
                                      </td>
                                      <td style={styles.td}>{getConciliacionDisplayValue(row, "nroOperacion")}</td>
                                      <td style={styles.td}>{getConciliacionDisplayValue(row, "descripcionOperacion")}</td>
                                      <td style={styles.td}>
                                        <div style={styles.commentCellWrap}>
                                          <textarea
                                            value={comentarioDrafts[row.idMovimientoBanco] ?? row.comentario ?? ""}
                                            onChange={(event) => handleComentarioDraftChange(row.idMovimientoBanco, event.target.value)}
                                            onBlur={() => void handleComentarioBlur(row)}
                                            style={styles.commentCellTextarea}
                                            rows={2}
                                            placeholder="Agregar comentario"
                                            disabled={Boolean(comentarioSavingIds[row.idMovimientoBanco])}
                                          />
                                          {comentarioSavingIds[row.idMovimientoBanco] ? (
                                            <span style={styles.commentCellStatus}>Guardando...</span>
                                          ) : null}
                                        </div>
                                      </td>
                                      <td style={styles.td}>{getConciliacionDisplayValue(row, "resultadoConciliacion")}</td>
                                      <td style={styles.td}>{getConciliacionDisplayValue(row, "tipoCoincidencia")}</td>
                                      <td style={styles.td}>{getConciliacionDisplayValue(row, "nroOperacionPlanilla")}</td>
                                      <td style={styles.td}>{getConciliacionDisplayValue(row, "cuentaPlanilla")}</td>
                                      <td style={styles.td}>{getConciliacionDisplayValue(row, "cuentaInterPlanilla")}</td>
                                      <td style={styles.td}>{getConciliacionDisplayValue(row, "clientePlanilla")}</td>
                                      <td style={styles.td}>{getConciliacionDisplayValue(row, "proyectoPlanilla")}</td>
                                      <td style={styles.td}>{getConciliacionDisplayValue(row, "sitePlanilla")}</td>
                                      <td style={styles.td}>{getConciliacionDisplayValue(row, "tipoTrabajoPlanilla")}</td>
                                      <td style={styles.td}>{getConciliacionDisplayValue(row, "tareaPlanilla")}</td>
                                      <td style={styles.td}>{getConciliacionDisplayValue(row, "responsablePlanilla")}</td>
                                      <td style={styles.td}>{getConciliacionDisplayValue(row, "comprobantePlanilla")}</td>
                                      <td style={styles.td}>
                                        <div style={styles.inlineEditableCellWrap}>
                                          <select
                                            value={areaFlujoDrafts[row.idMovimientoBanco] ?? (row.idAreaFlujo ? String(row.idAreaFlujo) : "")}
                                            onChange={(event) => void handleAreaFlujoInlineChange(row, event.target.value)}
                                            style={styles.inlineEditableSelect}
                                            disabled={
                                              clasificacionCombosLoading ||
                                              Boolean(areaFlujoSavingIds[row.idMovimientoBanco]) ||
                                              !isConciliacionMovimientoActivo(row)
                                            }
                                            aria-label={`Editar Area Flujo del movimiento ${row.idMovimientoBanco}`}
                                          >
                                            <option value="">{row.nombreAreaFlujo || "PENDIENTE"}</option>
                                            {(clasificacionCombos?.areasFlujo ?? []).map((option) => (
                                              <option key={`popup-area-${option.idAreaFlujo}`} value={String(option.idAreaFlujo)}>
                                                {option.nombreAreaFlujo}
                                              </option>
                                            ))}
                                          </select>
                                          {areaFlujoSavingIds[row.idMovimientoBanco] ? <span style={styles.inlineEditableStatus}>Guardando...</span> : null}
                                        </div>
                                      </td>
                                      <td style={styles.td}>
                                        <div style={styles.inlineEditableCellWrap}>
                                          <select
                                            value={referenciaDrafts[row.idMovimientoBanco] ?? (row.idReferencia ? String(row.idReferencia) : "")}
                                            onChange={(event) => void handleReferenciaInlineChange(row, event.target.value)}
                                            style={styles.inlineEditableSelect}
                                            disabled={
                                              clasificacionCombosLoading ||
                                              Boolean(referenciaSavingIds[row.idMovimientoBanco]) ||
                                              !isConciliacionMovimientoActivo(row) ||
                                              !row.idAreaFlujo ||
                                              getReferenciasClasificacionInlineDisponibles(row.idAreaFlujo).length === 0
                                            }
                                            aria-label={`Editar Referencia del movimiento ${row.idMovimientoBanco}`}
                                          >
                                            <option value="">{getReferenciaLabel(row) || "PENDIENTE"}</option>
                                            {getReferenciasClasificacionInlineDisponibles(row.idAreaFlujo).map((option) => (
                                              <option key={`popup-ref-${option.idReferencia}`} value={String(option.idReferencia)}>
                                                {option.codigoReferencia} - {option.nombreReferencia}
                                              </option>
                                            ))}
                                          </select>
                                          {referenciaSavingIds[row.idMovimientoBanco] ? (
                                            <span style={styles.inlineEditableStatus}>Guardando...</span>
                                          ) : !row.idAreaFlujo ? (
                                            <span style={styles.inlineEditableStatus}>Depende de Area Flujo</span>
                                          ) : null}
                                        </div>
                                      </td>
                                      <td style={styles.td}>
                                        <div style={styles.inlineEditableCellWrap}>
                                          <select
                                            value={
                                              cuentaContableDrafts[row.idMovimientoBanco] ??
                                              (row.idCuentaContable ? String(row.idCuentaContable) : "")
                                            }
                                            onChange={(event) => void handleCuentaContableInlineChange(row, event.target.value)}
                                            style={styles.inlineEditableSelect}
                                            disabled={
                                              clasificacionCombosLoading ||
                                              Boolean(cuentaContableSavingIds[row.idMovimientoBanco]) ||
                                              !isConciliacionMovimientoActivo(row) ||
                                              !row.idAreaFlujo ||
                                              !row.idReferencia ||
                                              getCuentasClasificacionInlineDisponibles(row.idAreaFlujo, row.idReferencia).length === 0
                                            }
                                            aria-label={`Editar Cuenta Contable del movimiento ${row.idMovimientoBanco}`}
                                          >
                                            <option value="">{row.cuentaContableTexto || "PENDIENTE"}</option>
                                            {getCuentasClasificacionInlineDisponibles(row.idAreaFlujo, row.idReferencia).map((option) => (
                                              <option key={`popup-cuenta-${option.idCuentaContable}`} value={String(option.idCuentaContable)}>
                                                {option.cuentaContableTexto}
                                              </option>
                                            ))}
                                          </select>
                                          {cuentaContableSavingIds[row.idMovimientoBanco] ? (
                                            <span style={styles.inlineEditableStatus}>Guardando...</span>
                                          ) : !row.idAreaFlujo || !row.idReferencia ? (
                                            <span style={styles.inlineEditableStatus}>Depende de Area Flujo y Referencia</span>
                                          ) : null}
                                        </div>
                                      </td>
                                      <td style={styles.td}>
                                        <span style={{ ...styles.statusBadge, ...getClasificacionBadgeStyle(getConciliadoLabel(row)) }}>
                                          {getConciliadoLabel(row)}
                                        </span>
                                      </td>
                                      <td style={styles.td}>{getConciliacionDisplayValue(row, "estadoConciliacionTexto") || "PENDIENTE"}</td>
                                      <td style={styles.td}>
                                        {getConciliacionDisplayValue(row, "estadoOperativoConciliacion") ? (
                                          <span
                                            style={{
                                              ...styles.statusBadge,
                                              ...getClasificacionBadgeStyle(getConciliacionDisplayValue(row, "estadoOperativoConciliacion")),
                                            }}
                                          >
                                            {getConciliacionDisplayValue(row, "estadoOperativoConciliacion")}
                                          </span>
                                        ) : (
                                          "PENDIENTE"
                                        )}
                                      </td>
                                      <td style={styles.td}>{getConciliacionDisplayValue(row, "fechaConciliacion")}</td>
                                      <td style={styles.td}>{getConciliacionDisplayValue(row, "usuarioConciliacion")}</td>
                                      <td style={styles.td}>{getConciliacionDisplayValue(row, "observacionConciliacionMovimiento")}</td>
                                      <td style={styles.td}>{getConciliacionDisplayValue(row, "bancoPlanilla")}</td>
                                      <td style={styles.td}>{getConciliacionDisplayValue(row, "seriePlanilla")}</td>
                                      <td style={styles.td}>{getConciliacionDisplayValue(row, "detallePlanilla")}</td>
                                      <td style={styles.td}>{getConciliacionDisplayValue(row, "idOc")}</td>
                                      <td
                                        style={{
                                          ...styles.td,
                                          whiteSpace: "normal",
                                          wordBreak: "break-word",
                                          minWidth: 180,
                                        }}
                                        title={getConciliacionDisplayValue(row, "correlativoPlanilla")}
                                      >
                                        {getConciliacionDisplayValue(row, "correlativoPlanilla")}
                                      </td>
                                    </tr>
                                  ))
                                ) : (
                                  <tr>
                                    <td style={styles.td} colSpan={35}>
                                      {detalleQuickSearch.trim()
                                        ? "No se encontraron movimientos que coincidan con la búsqueda."
                                        : "No se encontraron movimientos para los filtros ingresados."}
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
                </>
              ) : (
                <div style={styles.helperText}>
                  La pestaña solicitada no esta disponible.
                </div>
              )}
              {conciliacionPlanillaTab === "gastos" ? (
                <div style={styles.mappingTableWrap}>
                  <div style={styles.gridToolbar}>
                    <div style={styles.gridToolbarInfo}>
                      <div style={styles.gridToolbarText}>
                        Consulta directa del store `sp_Planilla_Consulta_Estados` con `Estados = 4` y `FechaDeposito` entre la fecha inicio y fecha fin.
                      </div>
                      <div style={styles.gridToolbarCount}>
                        {gastosPlanillaCountText}
                        {fechaDepositoInicioGastos && fechaDepositoFinGastos
                          ? ` | Rango: ${formatDateValue(fechaDepositoInicioGastos)} al ${formatDateValue(fechaDepositoFinGastos)}`
                          : ""}
                      </div>
                    </div>
                    <button type="button" style={styles.gridToolbarButton} onClick={() => void cargarGastosPlanilla()}>
                      Actualizar
                    </button>
                  </div>
                  <div style={styles.gastosSearchWrap}>
                    <input
                      type="text"
                      value={gastosPlanillaQuickSearch}
                      onChange={(event) => setGastosPlanillaQuickSearch(event.target.value)}
                      placeholder="Busqueda rapida por empleado, estado, cliente, area, ubicacion o comentario"
                      style={styles.gastosSearchInput}
                    />
                  </div>

                  {gastosPlanillaError ? <div style={styles.errorBanner}>{gastosPlanillaError}</div> : null}
                  {gastosPlanillaMessageText ? <div style={styles.successBanner}>{gastosPlanillaMessageText}</div> : null}

                  <div ref={detalleTableScrollRef} className="employee-grid-scroll" style={styles.detailTableScroll}>
                    <table style={styles.mappingTable}>
                      <thead>
                        <tr>
                          {GASTOS_PLANILLA_COLUMNS.map((column) => (
                            <th key={column.key} style={styles.th}>
                              {column.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody key={`gastos-planilla-${gastosPlanillaQuickSearch.trim().toLowerCase()}-${gastosPlanillaVisibleRows.length}`}>
                        {gastosPlanillaLoading ? (
                          <tr>
                            <td style={styles.td} colSpan={GASTOS_PLANILLA_COLUMNS.length}>
                              Cargando gastos...
                            </td>
                          </tr>
                        ) : gastosPlanillaVisibleRows.length > 0 ? (
                          gastosPlanillaVisibleRows.map((row, rowIndex) => {
                            const rowId = getPlanillaGastoRowId(row);
                            const rowKey = getPlanillaGastoRenderKey(row, rowIndex);
                            const nroOperacionValue = gastosPlanillaDrafts[rowId] ?? getPlanillaGastoNroOperacion(row);
                            const isSaving = Boolean(gastosPlanillaSavingIds[rowId]);

                            return (
                              <tr key={rowKey}>
                                {GASTOS_PLANILLA_COLUMNS.map((column) => (
                                  <td key={`${column.key}-${rowKey}`} style={styles.td}>
                                    {column.key === "nrooperacion" ? (
                                      <input
                                        type="text"
                                        value={nroOperacionValue}
                                        disabled={isSaving}
                                        onChange={(event) =>
                                          setGastosPlanillaDrafts((current) => ({
                                            ...current,
                                            [rowId]: event.target.value,
                                          }))
                                        }
                                        onBlur={() => void guardarNroOperacionGasto(row)}
                                        onKeyDown={(event) => {
                                          if (event.key === "Enter") {
                                            event.preventDefault();
                                            void guardarNroOperacionGasto(row, nroOperacionValue);
                                          }
                                        }}
                                        style={styles.gastosEditableInput}
                                      />
                                    ) : (
                                      column.render(row)
                                    )}
                                  </td>
                                ))}
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td style={styles.td} colSpan={GASTOS_PLANILLA_COLUMNS.length}>
                              {gastosPlanillaQuickSearch.trim()
                                ? "No se encontraron registros que coincidan con la búsqueda."
                                : fechaDepositoInicioGastos && fechaDepositoFinGastos
                                ? "No se encontraron gastos para el rango de fechas seleccionado."
                                : "Selecciona Fecha inicio y Fecha fin para consultar los gastos."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
          </>
          ) : (
            <div style={styles.helperText}>
              La conciliacion planilla esta contraida. Usa <strong>Expandir</strong> para ver el detalle.
            </div>
          )}
        </div>
      ) : null}

      {montoDiferenciaModal ? (
        <div style={styles.modalOverlay} onClick={closeMontoDiferenciaModal}>
          <div style={{ ...styles.modalCard, width: "min(520px, calc(100vw - 40px))" }} onClick={(event) => event.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={styles.modalTitle}>Monto diferencia</h3>
                <p style={styles.modalText}>Edita el monto solo si necesitas disminuirlo.</p>
              </div>
              <button type="button" style={styles.modalCloseButton} onClick={closeMontoDiferenciaModal} disabled={montoDiferenciaSaving}>
                Cerrar
              </button>
            </div>

            <label style={styles.fieldGroup}>
              <span style={styles.fieldLabel}>Monto diferencia</span>
              <input
                type="text"
                inputMode="decimal"
                value={montoDiferenciaModal.montoDiferencia}
                onChange={(event) => handleMontoDiferenciaChange(event.target.value)}
                style={styles.input}
                placeholder="0.00"
                disabled={montoDiferenciaSaving}
              />
            </label>

            <div style={styles.modalHelperRow}>
              <span style={styles.modalHelperText}>
                El valor no puede ser mayor al monto original: {formatNumber(montoDiferenciaModal.montoOriginal)}
              </span>
            </div>

            {montoDiferenciaError ? (
              <div style={styles.modalErrorText}>{montoDiferenciaError}</div>
            ) : (
              <div style={styles.modalHelperText}>La diferencia solo se puede reducir.</div>
            )}

            <div style={styles.modalActions}>
              <button type="button" style={styles.secondaryButton} onClick={closeMontoDiferenciaModal} disabled={montoDiferenciaSaving}>
                Cancelar
              </button>
              <button type="button" style={styles.primaryButton} onClick={() => void handleGuardarMontoDiferencia()} disabled={montoDiferenciaSaving}>
                {montoDiferenciaSaving ? "Guardando..." : "Aceptar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    padding: 16,
  },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "stretch",
    gap: 16,
    background: "linear-gradient(135deg, #0F172A 0%, #1E293B 45%, #0F766E 100%)",
    color: "#FFFFFF",
    borderRadius: 18,
    padding: 24,
    boxShadow: "0 18px 40px rgba(15, 23, 42, 0.18)",
  },
  kicker: {
    margin: 0,
    fontSize: 12,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#A7F3D0",
    fontWeight: 800,
  },
  title: {
    margin: "10px 0 0",
    fontSize: 28,
    lineHeight: 1.15,
    fontWeight: 900,
  },
  subtitle: {
    margin: "10px 0 0",
    fontSize: 14,
    lineHeight: 1.6,
    color: "#D1FAE5",
    maxWidth: 760,
  },
  heroStats: {
    minWidth: 520,
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 10,
  },
  card: {
    background: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.08)",
  },
  cardSectionCompact: {
    marginTop: 12,
    border: "1px solid #E2E8F0",
    borderRadius: 14,
    padding: 14,
    background: "#FFFFFF",
  },
  sectionHeaderCompact: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  sectionTitleCompact: {
    fontSize: 14,
    fontWeight: 900,
    color: "#0F172A",
  },
  sectionTextCompact: {
    marginTop: 4,
    fontSize: 12,
    color: "#64748B",
    lineHeight: 1.5,
  },
  toolbarRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "flex-end",
    marginBottom: 14,
  },
  toolbarActionsGroup: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: 10,
  },
  toolbarDates: {
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  filterPanel: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    marginBottom: 14,
  },
  dropRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: 14,
    marginBottom: 14,
  },
  fieldGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#334155",
  },
  input: {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 13,
    outline: "none",
  },
  primaryButton: {
    border: "1px solid #0F766E",
    background: "#0F766E",
    color: "#FFFFFF",
    borderRadius: 12,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #CBD5E1",
    background: "#F8FAFC",
    color: "#0F172A",
    borderRadius: 12,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  secondaryButtonDisabled: {
    background: "#E5E7EB",
    color: "#94A3B8",
    border: "1px solid #D1D5DB",
    cursor: "not-allowed",
    opacity: 0.85,
    boxShadow: "none",
  },
  iconActionButton: {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F766E",
    borderRadius: 12,
    width: 40,
    height: 40,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
    boxShadow: "0 8px 20px rgba(15, 23, 42, 0.08)",
  },
  dropZone: {
    border: "1.5px dashed #94A3B8",
    borderRadius: 16,
    padding: 20,
    background: "#F8FAFC",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 120,
    marginBottom: 14,
  },
  dropZoneInline: {
    flex: "1 1 420px",
    border: "1.5px dashed #94A3B8",
    borderRadius: 16,
    padding: 20,
    background: "#F8FAFC",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 120,
  },
  dropZoneActive: {
    border: "1.5px dashed #0F766E",
    background: "#ECFDF5",
  },
  dropHint: {
    fontSize: 12,
    color: "#475569",
    textAlign: "center",
    maxWidth: 700,
    lineHeight: 1.5,
  },
  errorBanner: {
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    color: "#991B1B",
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 12,
  },
  successBanner: {
    background: "#ECFDF5",
    border: "1px solid #A7F3D0",
    color: "#065F46",
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 12,
  },
  warningBanner: {
    background: "#FFFBEB",
    border: "1px solid #FCD34D",
    color: "#92400E",
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 12,
  },
  fileList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  emptyBanner: {
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
    borderRadius: 12,
    padding: 16,
    color: "#64748B",
    fontSize: 13,
  },
  fileCard: {
    border: "1px solid #E2E8F0",
    borderRadius: 14,
    padding: 14,
    background: "#FFFFFF",
  },
  fileHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },
  fileName: {
    fontSize: 14,
    color: "#0F172A",
  },
  fileMeta: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 4,
  },
  fileBadges: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  badgeOk: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 10px",
    borderRadius: 999,
    background: "#DCFCE7",
    color: "#166534",
    fontSize: 11,
    fontWeight: 800,
  },
  badgeWarn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 10px",
    borderRadius: 999,
    background: "#FEF3C7",
    color: "#92400E",
    fontSize: 11,
    fontWeight: 800,
  },
  badgeError: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 10px",
    borderRadius: 999,
    background: "#FEE2E2",
    color: "#991B1B",
    fontSize: 11,
    fontWeight: 800,
  },
  inlineError: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    background: "#FEF2F2",
    color: "#991B1B",
    fontSize: 12,
    fontWeight: 700,
  },
  previewBlock: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 6,
  },
  previewTitle: {
    fontSize: 11,
    color: "#0F766E",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  previewText: {
    fontSize: 12,
    color: "#334155",
    background: "#F8FAFC",
    borderRadius: 10,
    padding: 10,
    border: "1px solid #E2E8F0",
  },
  analysisBlock: {
    marginTop: 12,
    borderTop: "1px solid #E2E8F0",
    paddingTop: 12,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  analysisMeta: {
    fontSize: 12,
    fontWeight: 700,
    color: "#0F172A",
  },
  analysisNote: {
    fontSize: 12,
    color: "#475569",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 900,
    color: "#0F172A",
  },
  sectionText: {
    margin: "6px 0 0",
    fontSize: 13,
    color: "#475569",
    lineHeight: 1.5,
  },
  sectionActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  collapseToggleButton: {
    border: "1px solid #CBD5E1",
    background: "#F8FAFC",
    color: "#0F172A",
    borderRadius: 10,
    padding: "8px 12px",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 800,
    flexShrink: 0,
  },
  summaryBoard: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 10,
    marginBottom: 12,
  },
  conciliacionSummaryBoard: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: 10,
    marginBottom: 12,
  },
  executiveBoard: {
    marginBottom: 12,
    border: "1px solid #E2E8F0",
    borderRadius: 14,
    padding: 14,
    background: "linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)",
  },
  executiveBoardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  executiveBoardTitle: {
    fontSize: 14,
    fontWeight: 900,
    color: "#0F172A",
  },
  executiveBoardText: {
    marginTop: 4,
    fontSize: 12,
    color: "#64748B",
    lineHeight: 1.5,
  },
  executiveBoardMeta: {
    fontSize: 12,
    color: "#0F766E",
    fontWeight: 800,
  },
  executiveCurrencyGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 12,
  },
  executiveCurrencyCard: {
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    padding: 12,
    background: "#FFFFFF",
    boxShadow: "0 8px 20px rgba(15, 23, 42, 0.05)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    width: "100%",
    textAlign: "left",
    cursor: "pointer",
  },
  executiveCurrencyCardActive: {
    border: "1px solid #0F766E",
    boxShadow: "0 10px 24px rgba(15, 118, 110, 0.18)",
    background: "#F0FDFA",
  },
  executiveCurrencyHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  executiveCurrencyBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 10px",
    borderRadius: 999,
    background: "#DBEAFE",
    color: "#1D4ED8",
    fontSize: 11,
    fontWeight: 800,
    marginBottom: 8,
  },
  executiveCurrencyTotal: {
    fontSize: 20,
    fontWeight: 900,
    color: "#0F172A",
  },
  executiveCurrencyCount: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700,
  },
  executiveBars: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  executiveBarRow: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
  },
  executiveBarButton: {
    border: "1px solid transparent",
    borderRadius: 10,
    background: "#F8FAFC",
    padding: 8,
    cursor: "pointer",
    textAlign: "left",
  },
  executiveBarButtonActive: {
    border: "1px solid #0F766E",
    background: "#ECFDF5",
  },
  executiveBarHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "baseline",
  },
  executiveBarLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#334155",
    lineHeight: 1.4,
  },
  executiveBarValue: {
    fontSize: 12,
    fontWeight: 900,
    color: "#0F172A",
    whiteSpace: "nowrap",
  },
  executiveBarTrack: {
    width: "100%",
    height: 10,
    borderRadius: 999,
    background: "#E2E8F0",
    overflow: "hidden",
  },
  executiveBarFill: {
    height: "100%",
    borderRadius: 999,
    minWidth: 6,
  },
  executiveBarFoot: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: 700,
  },
  executivePieBoard: {
    marginBottom: 12,
    border: "1px solid #E2E8F0",
    borderRadius: 14,
    padding: 14,
    background: "linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)",
  },
  executivePieHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  executivePieTitle: {
    fontSize: 14,
    fontWeight: 900,
    color: "#0F172A",
  },
  executivePieText: {
    marginTop: 4,
    fontSize: 12,
    color: "#64748B",
    lineHeight: 1.5,
  },
  executivePieMeta: {
    fontSize: 12,
    color: "#0F766E",
    fontWeight: 800,
    textAlign: "right",
  },
  executivePieTrail: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 12,
  },
  executivePieTrailButton: {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  executivePieTrailText: {
    fontSize: 12,
    color: "#475569",
    fontWeight: 700,
  },
  executivePieLayout: {
    display: "grid",
    gridTemplateColumns: "minmax(320px, 1.2fr) minmax(280px, 0.8fr)",
    gap: 12,
    alignItems: "stretch",
  },
  executivePieChartCard: {
    border: "1px solid #E2E8F0",
    borderRadius: 14,
    background: "#FFFFFF",
    minHeight: 320,
    padding: 12,
  },
  executivePieChartWrap: {
    width: "100%",
    height: 300,
  },
  executivePieLegend: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  executivePieLegendItem: {
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    background: "#FFFFFF",
    padding: 10,
    display: "flex",
    alignItems: "center",
    gap: 10,
    textAlign: "left",
    cursor: "pointer",
    width: "100%",
  },
  executivePieLegendItemActive: {
    border: "1px solid #0F766E",
    background: "#ECFDF5",
  },
  executivePieSwatch: {
    width: 12,
    height: 12,
    borderRadius: 999,
    flexShrink: 0,
    border: "1px solid rgba(255,255,255,0.75)",
  },
  executivePieLegendInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
    flex: 1,
  },
  executivePieLegendLabel: {
    fontSize: 12,
    fontWeight: 800,
    color: "#0F172A",
    lineHeight: 1.35,
    wordBreak: "break-word",
  },
  executivePieLegendFoot: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: 700,
  },
  executivePieLegendRight: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 2,
    flexShrink: 0,
  },
  executivePieLegendValue: {
    fontSize: 12,
    color: "#0F172A",
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  executivePieLegendPercent: {
    fontSize: 11,
    color: "#475569",
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  debugPre: {
    margin: 0,
    padding: 12,
    borderRadius: 10,
    background: "#0F172A",
    color: "#E2E8F0",
    fontSize: 11,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    maxHeight: 320,
    overflow: "auto",
  },
  warningList: {
    margin: 0,
    paddingLeft: 18,
    color: "#92400E",
    fontSize: 12,
    lineHeight: 1.5,
  },
  helperText: {
    marginTop: 8,
    padding: "12px 14px",
    borderRadius: 12,
    background: "#F8FAFC",
    border: "1px dashed #CBD5E1",
    color: "#475569",
    fontSize: 13,
  },
  mappingTableWrap: {
    marginTop: 12,
    overflow: "visible",
    border: "1px solid #E2E8F0",
    borderRadius: 12,
  },
  gridToolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px 0",
  },
  gridToolbarInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  gridToolbarText: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 600,
  },
  gridToolbarCount: {
    fontSize: 12,
    color: "#0F766E",
    fontWeight: 800,
  },
  gridToolbarButton: {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    borderRadius: 10,
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 800,
    flexShrink: 0,
  },
  gastosSearchWrap: {
    padding: "12px 12px 0",
  },
  gastosSearchInput: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    padding: "10px 12px",
    fontSize: 13,
    color: "#0F172A",
    outline: "none",
  },
  gastosEditableInput: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 8,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    padding: "6px 8px",
    fontSize: 12,
    color: "#0F172A",
    outline: "none",
  },
  detailScrollHeader: {
    overflowX: "auto",
    overflowY: "hidden",
    borderTop: "1px solid #E2E8F0",
    borderBottom: "1px solid #E2E8F0",
    background: "#F8FAFC",
  },
  detailScrollSpacer: {
    minWidth: 1380,
    width: "100%",
    height: 1,
  },
  detailTableScroll: {
    overflowX: "auto",
    overflowY: "scroll",
    flex: 1,
    minHeight: 0,
    maxHeight: "calc(100vh - 430px)",
    position: "relative",
    scrollbarGutter: "stable",
  },
  detailActionHeaderTh: {
    minWidth: 56,
    width: 56,
    maxWidth: 56,
    textAlign: "center",
  },
  detailActionFilterTh: {
    minWidth: 56,
    width: 56,
    maxWidth: 56,
  },
  detailActionCell: {
    minWidth: 56,
    width: 56,
    maxWidth: 56,
    textAlign: "center",
  },
  detailRowActionButton: {
    border: "1px solid #93C5FD",
    background: "#EFF6FF",
    color: "#2563EB",
    borderRadius: 999,
    width: 28,
    height: 28,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
    flexShrink: 0,
  },
  detailRowActionButtonDisabled: {
    border: "1px solid #CBD5E1",
    background: "#F8FAFC",
    color: "#94A3B8",
    borderRadius: 999,
    width: 28,
    height: 28,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "not-allowed",
    padding: 0,
    flexShrink: 0,
    opacity: 0.7,
  },
  gridActionButton: {
    border: "1px solid #0F766E",
    background: "#ECFDF5",
    color: "#0F766E",
    borderRadius: 10,
    padding: "8px 10px",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  revisionTable: {
    width: "100%",
    minWidth: 760,
    borderCollapse: "collapse",
    tableLayout: "fixed",
    background: "#FFFFFF",
  },
  revisionColResumen: {
    width: "42%",
  },
  revisionColNumeric: {
    width: "19.333%",
  },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    background: "#F8FAFC",
    borderBottom: "1px solid #E2E8F0",
    fontSize: 11,
    color: "#334155",
    fontWeight: 800,
  },
  thRight: {
    textAlign: "right",
    padding: "10px 12px",
    background: "#F8FAFC",
    borderBottom: "1px solid #E2E8F0",
    fontSize: 11,
    color: "#334155",
    fontWeight: 800,
  },
  detailStickyHeaderTh: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    boxShadow: "0 2px 0 rgba(226, 232, 240, 0.95)",
  },
  sortHeaderButton: {
    width: "100%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    border: 0,
    padding: 0,
    background: "transparent",
    color: "inherit",
    font: "inherit",
    fontWeight: 800,
    textAlign: "left",
    cursor: "pointer",
  },
  sortHeaderIcon: {
    display: "inline-flex",
    alignItems: "center",
    color: "#64748B",
    flexShrink: 0,
  },
  filterTh: {
    padding: "8px 10px 10px",
    background: "#FFFFFF",
    borderBottom: "1px solid #E2E8F0",
  },
  detailStickyFilterTh: {
    position: "sticky",
    top: 42,
    zIndex: 19,
    boxShadow: "0 2px 0 rgba(226, 232, 240, 0.95)",
  },
  filterInput: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 8,
    border: "1px solid #CBD5E1",
    background: "#F8FAFC",
    padding: "6px 8px",
    fontSize: 12,
    color: "#0F172A",
    outline: "none",
  },
  filterSelect: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 8,
    border: "1px solid #CBD5E1",
    background: "#F8FAFC",
    padding: "6px 8px",
    fontSize: 12,
    color: "#0F172A",
    outline: "none",
    cursor: "pointer",
  },
  multiFilterWrap: {
    position: "relative",
  },
  multiFilterButton: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 8,
    border: "1px solid #CBD5E1",
    background: "#F8FAFC",
    padding: "6px 8px",
    fontSize: 12,
    color: "#0F172A",
    outline: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  multiFilterButtonText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  multiFilterDropdown: {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    minWidth: "100%",
    maxHeight: 220,
    overflowY: "auto",
    background: "#FFFFFF",
    border: "1px solid #CBD5E1",
    borderRadius: 10,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.14)",
    padding: 8,
    zIndex: 20,
  },
  multiFilterOption: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 4px",
    fontSize: 12,
    color: "#0F172A",
    cursor: "pointer",
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid #F1F5F9",
    fontSize: 12,
    color: "#0F172A",
    verticalAlign: "top",
  },
  tdStrong: {
    padding: "10px 12px",
    borderBottom: "1px solid #F1F5F9",
    fontSize: 12,
    color: "#0F172A",
    fontWeight: 800,
    verticalAlign: "top",
  },
  tdNumeric: {
    padding: "10px 12px",
    borderBottom: "1px solid #F1F5F9",
    fontSize: 12,
    color: "#0F172A",
    verticalAlign: "top",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  },
  tdNumericStrong: {
    padding: "10px 12px",
    borderBottom: "1px solid #F1F5F9",
    fontSize: 12,
    color: "#0F172A",
    verticalAlign: "top",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 800,
  },
  revisionBoard: {
    marginTop: 18,
    marginBottom: 18,
    background: "linear-gradient(180deg, #F8FCFF 0%, #FFFFFF 100%)",
    border: "1px solid #D9EAF5",
    borderRadius: 18,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  planillaTabs: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    marginTop: 18,
    marginBottom: 14,
    padding: 6,
    borderRadius: 14,
    background: "#E2E8F0",
  },
  planillaTabButton: {
    border: "1px solid transparent",
    background: "transparent",
    color: "#334155",
    borderRadius: 10,
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  planillaTabButtonActive: {
    background: "#FFFFFF",
    color: "#0F172A",
    border: "1px solid #CBD5E1",
    boxShadow: "0 6px 16px rgba(15, 23, 42, 0.08)",
  },
  revisionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
  },
  revisionTitle: {
    fontSize: 18,
    fontWeight: 900,
    color: "#0F172A",
  },
  revisionText: {
    marginTop: 4,
    fontSize: 12,
    color: "#475569",
    lineHeight: 1.5,
  },
  revisionMeta: {
    fontSize: 12,
    fontWeight: 800,
    color: "#0F766E",
  },
  revisionHeaderActions: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  revisionFilterGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },
  revisionFilterCard: {
    border: "1px solid #C8E1F0",
    borderRadius: 14,
    background: "#FFFFFF",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
  },
  revisionFilterLabel: {
    fontSize: 11,
    fontWeight: 900,
    color: "#0F172A",
    letterSpacing: "0.04em",
  },
  revisionFilterSelect: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 10,
    border: "1px solid #93C5DD",
    background: "#E0F2FE",
    padding: "8px 10px",
    fontSize: 12,
    color: "#0F172A",
    outline: "none",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  revisionFilterInput: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 10,
    border: "1px solid #93C5DD",
    background: "#E0F2FE",
    padding: "8px 10px",
    fontSize: 12,
    color: "#0F172A",
    outline: "none",
    fontFamily: "inherit",
  },
  revisionTableWrap: {
    overflowX: "auto",
    borderRadius: 14,
    border: "1px solid #D9EAF5",
    background: "#FFFFFF",
  },
  revisionTotalRow: {
    background: "#E0F2FE",
  },
  commentCellWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 220,
  },
  inlineEditableCellWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 220,
  },
  commentCellTextarea: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 8,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    padding: "8px 10px",
    fontSize: 12,
    color: "#0F172A",
    resize: "vertical",
    outline: "none",
    fontFamily: "inherit",
  },
  inlineEditableSelect: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 8,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    padding: "8px 10px",
    fontSize: 12,
    color: "#0F172A",
    outline: "none",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  inlineEditableStatus: {
    fontSize: 11,
    color: "#0F766E",
    fontWeight: 700,
  },
  commentCellStatus: {
    fontSize: 11,
    color: "#0F766E",
    fontWeight: 700,
  },
  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  statusBadgeSuccess: {
    background: "#DCFCE7",
    color: "#166534",
  },
  statusBadgePending: {
    background: "#FEF3C7",
    color: "#92400E",
  },
  statusBadgeMuted: {
    background: "#E2E8F0",
    color: "#334155",
  },
  statusBadgeInfo: {
    background: "#DBEAFE",
    color: "#1D4ED8",
  },
  summaryCard: {
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  summaryLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  summaryValue: {
    fontSize: 18,
    color: "#0F172A",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.52)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 1300,
  },
  modalCard: {
    width: "min(860px, 100%)",
    background: "#FFFFFF",
    borderRadius: 18,
    padding: 20,
    boxShadow: "0 20px 50px rgba(15, 23, 42, 0.25)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  modalTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 900,
    color: "#0F172A",
  },
  modalText: {
    margin: "6px 0 0",
    fontSize: 13,
    color: "#64748B",
  },
  modalCloseButton: {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    borderRadius: 10,
    padding: "8px 12px",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 800,
  },
  modalFormGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  modalTextarea: {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    padding: "10px 12px",
    fontSize: 13,
    color: "#0F172A",
    resize: "vertical",
    outline: "none",
    fontFamily: "inherit",
  },
  modalHelperRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },
  modalHelperText: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700,
  },
  modalErrorText: {
    fontSize: 12,
    color: "#B91C1C",
    fontWeight: 800,
    background: "#FEF2F2",
    border: "1px solid #FCA5A5",
    borderRadius: 10,
    padding: "10px 12px",
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  },
  detailPopupOverlay: {
    position: "fixed",
    top: "calc(56px + 12px)",
    left: 12,
    right: 12,
    bottom: "calc(44px + 12px)",
    background: "rgba(15, 23, 42, 0.56)",
    zIndex: 1190,
    boxSizing: "border-box",
  },
  detailPopupCard: {
    width: "100%",
    height: "100%",
    background: "#FFFFFF",
    borderRadius: 18,
    boxShadow: "0 24px 60px rgba(15, 23, 42, 0.28)",
    border: "1px solid #E2E8F0",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
  },
  detailPopupHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "14px 16px",
    borderBottom: "1px solid #E2E8F0",
    background: "#F8FAFC",
    flexShrink: 0,
  },
  detailPopupHeaderLeft: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  },
  detailPopupHeaderTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 900,
    color: "#0F172A",
  },
  detailPopupHeaderText: {
    margin: 0,
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700,
  },
  detailPopupBody: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: 16,
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  detailPopupToolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  detailPopupSearchWrap: {
    flex: 1,
    minWidth: 280,
  },
  detailPopupTableWrap: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    border: "1px solid #E2E8F0",
    borderRadius: 14,
  },
  detailPopupTableScroll: {
    overflowX: "auto",
    overflowY: "auto",
    height: "100%",
    minHeight: 0,
    position: "relative",
    scrollbarGutter: "stable",
  },
};

