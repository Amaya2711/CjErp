import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL } from "../../api/httpClient";
import {
  actualizarClasificacionMovimientoConciliacionBcp,
  actualizarComentarioMovimientoConciliacionBcp,
  analizarConciliacionBcp,
  conciliarPlanillaConciliacionBcp,
  exportarAnalisisConciliacionBcp,
  insertarConciliacionBcp,
  obtenerCombosClasificacionConciliacionBcp,
} from "../../api/conciliacionService";
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
import { getHttpErrorMessage } from "../../utils/httpError";
import { ArrowUpDown, ChevronDown, ChevronRight, FileDown } from "lucide-react";

const MAX_FILE_SIZE_BYTES = 15_000_000;
type ConciliacionSortKey =
  | "fecha"
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
type ConciliacionPlanillaTab = "revision" | "ejecutivo" | "detalle";
type ConciliacionRevisionFilters = {
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
  totalMn: number;
};

type ConciliacionClasificacionForm = {
  idMovimientoBanco: number;
  idAreaFlujo: string;
  idReferencia: string;
  idCuentaContable: string;
  idReglaContable: string;
  observacionConciliacion: string;
};

const DEFAULT_CONCILIACION_FILTERS: ConciliacionFilterState = {
  fecha: "",
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
  correlativoPlanilla: "",
};
const EMPTY_CONCILIACION_FILTER_VALUE = "__EMPTY__";
const DEFAULT_CONCILIACION_REVISION_FILTERS: ConciliacionRevisionFilters = {
  areaFlujo: "",
  referencia: "",
  empresa: "",
  banco: "",
  system: "",
  cliente: "",
  periodo: "",
};

const BANCO_OPTIONS = [
  { code: "BCP", label: "BCP" },
  { code: "SCOTIABANK", label: "Scotiabank" },
] as const;

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

function calculateMontoDiferencia(monto?: number | null, totalPagar?: number | null): number | null {
  if (monto === null || monto === undefined || totalPagar === null || totalPagar === undefined) {
    return null;
  }

  return monto - totalPagar;
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

function getConciliacionDisplayValue(row: ConciliacionBcpConciliarPlanillaRegistro, key: ConciliacionSortKey): string {
  switch (key) {
    case "fecha":
      return formatDateValue(row.fecha);
    case "empresa":
      return row.empresa || "";
    case "cuenta":
      return row.cuenta || "";
    case "moneda":
      return row.moneda || "";
    case "monto":
      return row.monto != null ? formatNumber(row.monto) : "";
    case "totalPagar": {
      const totalPagar = normalizeTotalPagarForComparison(row.totalPagar);
      return totalPagar != null ? formatNumber(totalPagar) : "";
    }
    case "diferencia": {
      const totalPagar = normalizeTotalPagarForComparison(row.totalPagar);
      const diferencia = calculateMontoDiferencia(row.monto, totalPagar);
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
      return row.cuentaContableTexto || (row.esConciliado ? "" : "PENDIENTE");
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

function getConciliacionSortValue(row: ConciliacionBcpConciliarPlanillaRegistro, key: ConciliacionSortKey): string | number | null {
  switch (key) {
    case "fecha": {
      const date = row.fecha ? new Date(row.fecha) : null;
      return date && !Number.isNaN(date.getTime()) ? date.getTime() : null;
    }
    case "monto":
      return row.monto ?? null;
    case "totalPagar":
      return normalizeTotalPagarForComparison(row.totalPagar);
    case "diferencia":
      return calculateMontoDiferencia(row.monto, normalizeTotalPagarForComparison(row.totalPagar));
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
      return row.NroOperacion ?? row.nroOperacion ?? row.numeroOperacion ?? row.NumeroOperacion ?? row["Nº operación"] ?? row["Operación - Número"] ?? "";
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
    return row.NroOperacion ?? row.nroOperacion ?? row.numeroOperacion ?? row.NumeroOperacion ?? row["NÂº operaciÃ³n"] ?? row["OperaciÃ³n - NÃºmero"] ?? "";
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
    return `Carga no habilitada: ${filesWithoutRows.length} archivo(s) no generaron movimientos válidos para insertar (${names}).`;
  }

  if (filesInReview.length > 0) {
    const names = filesInReview.map((item) => item.nombreArchivo).join(", ");
    return `Carga no habilitada: ${filesInReview.length} archivo(s) requieren revisión antes de insertar (${names}).`;
  }

  return "Carga no habilitada: el análisis actual no cumple las condiciones para insertar.";
}

function formatDateValue(value?: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

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

function getRevisionResumenLabel(row: ConciliacionBcpConciliarPlanillaRegistro): string {
  if (row.cuentaContableTexto?.trim()) {
    return row.cuentaContableTexto.trim();
  }

  return "SIN CUENTA CONTABLE";
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

async function parseExcelFile(file: File): Promise<ParsedConciliacionExcelFile> {
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
    blankrows: false,
    // Leer el valor formateado evita perder ceros a la izquierda en bancos como Scotiabank.
    raw: false,
  });

  const normalizedRows = matrix
    .map((row) => (Array.isArray(row) ? row.map(normalizeCellValue) : []))
    .filter((row) => row.length > 0 && !isRowEmpty(row as string[]))
    .map((row) => row as string[]);

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
  const [conciliacionPlanilla, setConciliacionPlanilla] = useState<ConciliacionBcpConciliarPlanillaResponse | null>(null);
  const [comentarioDrafts, setComentarioDrafts] = useState<Record<number, string>>({});
  const [comentarioSavingIds, setComentarioSavingIds] = useState<Record<number, boolean>>({});
  const [areaFlujoDrafts, setAreaFlujoDrafts] = useState<Record<number, string>>({});
  const [areaFlujoSavingIds, setAreaFlujoSavingIds] = useState<Record<number, boolean>>({});
  const [referenciaDrafts, setReferenciaDrafts] = useState<Record<number, string>>({});
  const [referenciaSavingIds, setReferenciaSavingIds] = useState<Record<number, boolean>>({});
  const [cuentaContableDrafts, setCuentaContableDrafts] = useState<Record<number, string>>({});
  const [cuentaContableSavingIds, setCuentaContableSavingIds] = useState<Record<number, boolean>>({});
  const [revisionFilters, setRevisionFilters] = useState<ConciliacionRevisionFilters>(
    DEFAULT_CONCILIACION_REVISION_FILTERS
  );
  const [conciliacionPlanillaTab, setConciliacionPlanillaTab] = useState<ConciliacionPlanillaTab>("revision");
  const [isResultadoFilterOpen, setIsResultadoFilterOpen] = useState(false);
  const [clasificacionCombos, setClasificacionCombos] = useState<ConciliacionBcpClasificacionCombosResponse | null>(null);
  const [clasificacionCombosLoading, setClasificacionCombosLoading] = useState(false);
  const [clasificacionModal, setClasificacionModal] = useState<ConciliacionClasificacionForm | null>(null);
  const [clasificacionSaving, setClasificacionSaving] = useState(false);

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
  const totalConciliacionRegistros = conciliacionPlanilla?.registros.length ?? 0;
  const conciliacionResumenEjecutivo = useMemo(() => {
    const byMoneda = new Map<string, { totalPagar: number; cantidad: number; resultados: Map<string, ConciliacionResultadoResumen> }>();
    let registrosConTotalPagar = 0;
    let registrosSinTotalPagar = 0;

    filteredConciliacionRegistros.forEach((row) => {
      const totalPagar = normalizeTotalPagarForComparison(row.totalPagar);
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
  const revisionFilterOptions = useMemo(() => {
    const registros = conciliacionPlanilla?.registros ?? [];

    return {
      areaFlujo: getDistinctSortedValues(registros.map((row) => row.nombreAreaFlujo?.trim() ?? "")),
      referencia: getDistinctSortedValues(registros.map((row) => getReferenciaLabel(row).trim())),
      empresa: getDistinctSortedValues(registros.map((row) => row.empresa?.trim() ?? "")),
      banco: getDistinctSortedValues(registros.map((row) => row.bancoPlanilla?.trim() ?? "")),
      system: getDistinctSortedValues(registros.map((row) => getRevisionSystemLabel(row))),
      cliente: getDistinctSortedValues(registros.map((row) => row.clientePlanilla?.trim() ?? "")),
      periodo: getDistinctSortedValues(registros.map((row) => getRevisionPeriodoLabel(row.fecha))),
    };
  }, [conciliacionPlanilla?.registros]);
  const revisionFilteredRows = useMemo(() => {
    const registros = conciliacionPlanilla?.registros ?? [];

    return registros.filter((row) => {
      const matchesAreaFlujo =
        !revisionFilters.areaFlujo || (row.nombreAreaFlujo?.trim() ?? "") === revisionFilters.areaFlujo;
      const matchesReferencia =
        !revisionFilters.referencia || getReferenciaLabel(row).trim() === revisionFilters.referencia;
      const matchesEmpresa = !revisionFilters.empresa || (row.empresa?.trim() ?? "") === revisionFilters.empresa;
      const matchesBanco = !revisionFilters.banco || (row.bancoPlanilla?.trim() ?? "") === revisionFilters.banco;
      const matchesSystem = !revisionFilters.system || getRevisionSystemLabel(row) === revisionFilters.system;
      const matchesCliente = !revisionFilters.cliente || (row.clientePlanilla?.trim() ?? "") === revisionFilters.cliente;
      const matchesPeriodo = !revisionFilters.periodo || getRevisionPeriodoLabel(row.fecha) === revisionFilters.periodo;

      return (
        matchesAreaFlujo &&
        matchesReferencia &&
        matchesEmpresa &&
        matchesBanco &&
        matchesSystem &&
        matchesCliente &&
        matchesPeriodo
      );
    });
  }, [conciliacionPlanilla?.registros, revisionFilters]);
  const revisionResumenRows = useMemo(() => {
    const grouped = new Map<string, ConciliacionRevisionResumen>();

    revisionFilteredRows.forEach((row) => {
      const resumen = getRevisionResumenLabel(row);
      const current =
        grouped.get(resumen) ??
        {
          resumen,
          saldoMn: 0,
          saldoMe: 0,
          totalMn: 0,
        };
      const monto = row.monto ?? 0;

      if (isMonedaMn(row.moneda)) {
        current.saldoMn += monto;
      } else {
        current.saldoMe += monto;
      }

      current.totalMn += monto;
      grouped.set(resumen, current);
    });

    return Array.from(grouped.values()).sort((left, right) =>
      left.resumen.localeCompare(right.resumen, "es", { sensitivity: "base", numeric: true })
    );
  }, [revisionFilteredRows]);
  const revisionResumenTotals = useMemo(() => {
    return revisionResumenRows.reduce(
      (accumulator, item) => ({
        saldoMn: accumulator.saldoMn + item.saldoMn,
        saldoMe: accumulator.saldoMe + item.saldoMe,
        totalMn: accumulator.totalMn + item.totalMn,
      }),
      { saldoMn: 0, saldoMe: 0, totalMn: 0 }
    );
  }, [revisionResumenRows]);
  const executiveSelectionLabel = conciliacionExecutiveSelection.resultado
    ? `${conciliacionExecutiveSelection.moneda ?? "Sin moneda"} | ${conciliacionExecutiveSelection.resultado}`
    : conciliacionExecutiveSelection.moneda;

  const conciliacionFilterOptions = useMemo(() => {
    const keys: ConciliacionSortKey[] = [
      "fecha",
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
          ? "(Vacío)"
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
  };

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
      const updated = await actualizarClasificacionMovimientoConciliacionBcp({
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
      const updated = await actualizarClasificacionMovimientoConciliacionBcp({
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
          const updated = await actualizarClasificacionMovimientoConciliacionBcp({
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
      const updated = await actualizarClasificacionMovimientoConciliacionBcp({
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

  const handleGuardarClasificacion = async () => {
    if (!clasificacionModal) {
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
      const updated = await actualizarClasificacionMovimientoConciliacionBcp({
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
      const updated = await actualizarComentarioMovimientoConciliacionBcp(row.idMovimientoBanco, {
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
            return await parseExcelFile(file);
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
          };
        })
      );

      const request = { archivos };

      const response = await analizarConciliacionBcp({ ...request, codigoBanco });
      setAnalysis(response);
      setConciliacionPlanilla(null);

      // Genera la descarga apenas termina el análisis, igual que el flujo de Scotiabank.
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
        console.warn("[ConciliacionBcp] Export remoto falló, se usará el respaldo local.", exportError);
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
      await handleExportConciliacionPlanilla(response);
    } catch (conciliacionError) {
      setConciliacionPlanilla(null);
      setError(getHttpErrorMessage(conciliacionError, "No se pudo ejecutar la conciliacion con planilla."));
    } finally {
      setLoadingConciliacion(false);
    }
  };

  const handleExportConciliacionPlanilla = async (
    sourceConciliacionPlanilla: ConciliacionBcpConciliarPlanillaResponse | null = conciliacionPlanilla
  ) => {
    if (!sourceConciliacionPlanilla) {
      return;
    }

    const XLSX = await import("xlsx");
    const exportRows = sourceConciliacionPlanilla.registros.map((row) => ({
      Fecha: formatDateValue(row.fecha),
      Empresa: row.empresa || "",
      Cuenta: row.cuenta || "",
      Moneda: row.moneda || "",
      Monto: row.monto ?? "",
      TotalPagar: normalizeTotalPagarForComparison(row.totalPagar) ?? "",
      Diferencia: calculateMontoDiferencia(row.monto, normalizeTotalPagarForComparison(row.totalPagar)) ?? "",
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
      AreaFlujo: row.nombreAreaFlujo || "",
      Referencia: getReferenciaLabel(row),
      CuentaContable: row.cuentaContableTexto || "",
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
      Correlativo: row.correlativoPlanilla || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "ConciliacionPlanilla");
    XLSX.writeFile(
      workbook,
      `conciliacion_planilla_${new Date().toISOString().slice(0, 10)}.xlsx`
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
                style={styles.secondaryButton}
                onClick={() => void handleConciliarPlanilla()}
                disabled={!canConciliar}
              >
                {loadingConciliacion ? "Conciliando..." : "Conciliacion"}
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

        {error ? <div style={styles.errorBanner}>{error}</div> : null}
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
                                  No se detectaron mapeos automáticos.
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
                `MovimientosBcp`.
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
                Comparacion entre `MovimientosBcp` y `sp_Planilla_Consulta_Estados`, manteniendo la base bancaria como origen principal.
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
                  onClick={() => setConciliacionPlanillaTab("revision")}
                >
                  Reporte revision
                </button>
                <button
                  type="button"
                  style={{
                    ...styles.planillaTabButton,
                    ...(conciliacionPlanillaTab === "ejecutivo" ? styles.planillaTabButtonActive : null),
                  }}
                  onClick={() => setConciliacionPlanillaTab("ejecutivo")}
                >
                  Resumen grafico ejecutivo
                </button>
                <button
                  type="button"
                  style={{
                    ...styles.planillaTabButton,
                    ...(conciliacionPlanillaTab === "detalle" ? styles.planillaTabButtonActive : null),
                  }}
                  onClick={() => setConciliacionPlanillaTab("detalle")}
                >
                  Detalle
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
                    <div style={styles.revisionMeta}>
                      Registros visibles: {revisionFilteredRows.length} | Resumenes: {revisionResumenRows.length}
                    </div>
                  </div>

                  <div style={styles.revisionFilterGrid}>
                    {(
                      [
                        ["areaFlujo", "AREA_FLUJO"],
                        ["referencia", "REFERENCIA"],
                        ["empresa", "EMPRESA"],
                        ["banco", "BANCO"],
                        ["system", "SYSTEM"],
                        ["cliente", "CLIENTE"],
                        ["periodo", "FECHA"],
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
                  </div>

                  <div style={styles.revisionTableWrap}>
                    <table style={styles.mappingTable}>
                      <thead>
                        <tr>
                          <th style={styles.th}>RESUMEN</th>
                          <th style={styles.th}>SALDO MN</th>
                          <th style={styles.th}>SALDO ME</th>
                          <th style={styles.th}>TOTAL MN</th>
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
                                <td style={styles.tdNumericStrong}>{formatNumber(item.totalMn)}</td>
                              </tr>
                            ))}
                            <tr style={styles.revisionTotalRow}>
                              <td style={styles.tdStrong}>TOTAL</td>
                              <td style={styles.tdNumericStrong}>{formatNumber(revisionResumenTotals.saldoMn)}</td>
                              <td style={styles.tdNumericStrong}>{formatNumber(revisionResumenTotals.saldoMe)}</td>
                              <td style={styles.tdNumericStrong}>{formatNumber(revisionResumenTotals.totalMn)}</td>
                            </tr>
                          </>
                        ) : (
                          <tr>
                            <td style={styles.td} colSpan={4}>
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
              ) : (
                <>
                  <div style={styles.mappingTableWrap}>
                    <div style={styles.gridToolbar}>
                      <div style={styles.gridToolbarInfo}>
                        <div style={styles.gridToolbarText}>
                          Filtra por cualquier valor visible en la tabla principal.
                        </div>
                        <div style={styles.gridToolbarCount}>
                          Registros: {executiveFilteredConciliacionRegistros.length} de {totalConciliacionRegistros}
                          {executiveSelectionLabel ? ` | Ejecutivo: ${executiveSelectionLabel}` : ""}
                        </div>
                      </div>
                      <button type="button" style={styles.gridToolbarButton} onClick={handleClearConciliacionFilters}>
                        Limpiar filtros
                      </button>
                    </div>
            <table style={styles.mappingTable}>
              <thead>
                <tr>
                  <th style={styles.th}>{renderSortHeader("Fecha", "fecha")}</th>
                  <th style={styles.th}>{renderSortHeader("Empresa", "empresa")}</th>
                  <th style={styles.th}>{renderSortHeader("Cuenta", "cuenta")}</th>
                  <th style={styles.th}>{renderSortHeader("Moneda", "moneda")}</th>
                  <th style={styles.th}>{renderSortHeader("Monto", "monto")}</th>
                  <th style={styles.th}>{renderSortHeader("TotalPagar", "totalPagar")}</th>
                  <th style={styles.th}>{renderSortHeader("Diferencia", "diferencia")}</th>
                  <th style={styles.th}>{renderSortHeader("NroOperacion", "nroOperacion")}</th>
                  <th style={styles.th}>{renderSortHeader("DescripcionOperacion", "descripcionOperacion")}</th>
                  <th style={styles.th}>{renderSortHeader("Comentario", "comentario")}</th>
                  <th style={styles.th}>{renderSortHeader("Resultado", "resultadoConciliacion")}</th>
                  <th style={styles.th}>{renderSortHeader("Tipo", "tipoCoincidencia")}</th>
                  <th style={styles.th}>{renderSortHeader("NroOperacionPlanilla", "nroOperacionPlanilla")}</th>
                  <th style={styles.th}>{renderSortHeader("CuentaPlanilla", "cuentaPlanilla")}</th>
                  <th style={styles.th}>{renderSortHeader("CuentaInterPlanilla", "cuentaInterPlanilla")}</th>
                  <th style={styles.th}>{renderSortHeader("Cliente", "clientePlanilla")}</th>
                  <th style={styles.th}>{renderSortHeader("Proyecto", "proyectoPlanilla")}</th>
                  <th style={styles.th}>{renderSortHeader("Site", "sitePlanilla")}</th>
                  <th style={styles.th}>{renderSortHeader("Tipo_Trabajo", "tipoTrabajoPlanilla")}</th>
                  <th style={styles.th}>{renderSortHeader("Tarea", "tareaPlanilla")}</th>
                  <th style={styles.th}>{renderSortHeader("Responsable", "responsablePlanilla")}</th>
                  <th style={styles.th}>{renderSortHeader("Comprobante", "comprobantePlanilla")}</th>
                  <th style={styles.th}>{renderSortHeader("Area Flujo", "areaFlujo")}</th>
                  <th style={styles.th}>{renderSortHeader("Referencia", "referencia")}</th>
                  <th style={styles.th}>{renderSortHeader("Cuenta Contable", "cuentaContable")}</th>
                  <th style={styles.th}>{renderSortHeader("Conciliado", "conciliado")}</th>
                  <th style={styles.th}>{renderSortHeader("Estado Conciliacion", "estadoConciliacionTexto")}</th>
                  <th style={styles.th}>{renderSortHeader("Estado Operativo", "estadoOperativoConciliacion")}</th>
                  <th style={styles.th}>{renderSortHeader("Fecha Conciliacion", "fechaConciliacion")}</th>
                  <th style={styles.th}>{renderSortHeader("Usuario Conciliacion", "usuarioConciliacion")}</th>
                  <th style={styles.th}>{renderSortHeader("Obs. Conciliacion", "observacionConciliacionMovimiento")}</th>
                  <th style={styles.th}>{renderSortHeader("Banco", "bancoPlanilla")}</th>
                  <th style={styles.th}>{renderSortHeader("Serie", "seriePlanilla")}</th>
                  <th style={styles.th}>{renderSortHeader("Detalle", "detallePlanilla")}</th>
                  <th style={styles.th}>{renderSortHeader("Correlativo", "correlativoPlanilla")}</th>
                </tr>
                <tr>
                  {(
                    [
                      "fecha",
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
                    ] as ConciliacionSortKey[]
                  ).map((key) => (
                    <th key={`filter-${key}`} style={styles.filterTh}>
                      {key === "resultadoConciliacion" ? (
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
                                    <span>{optionValue === EMPTY_CONCILIACION_FILTER_VALUE ? "(Vacío)" : optionValue}</span>
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
                              {optionValue === EMPTY_CONCILIACION_FILTER_VALUE ? "(Vacío)" : optionValue}
                            </option>
                          ))}
                        </select>
                      )}
                    </th>
                  ))}
                  <th style={styles.filterTh} />
                </tr>
              </thead>
              <tbody>
                {executiveFilteredConciliacionRegistros.length > 0 ? (
                  executiveFilteredConciliacionRegistros.map((row) => (
                    <tr key={`conciliacion-${row.idMovimientoBanco}`}>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "fecha")}</td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "empresa")}</td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "cuenta")}</td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "moneda")}</td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "monto")}</td>
                      <td style={styles.td}>
                        {getConciliacionDisplayValue(row, "totalPagar")}
                      </td>
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "diferencia")}</td>
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
                            disabled={clasificacionCombosLoading || Boolean(areaFlujoSavingIds[row.idMovimientoBanco])}
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
                      <td style={styles.td}>{getConciliacionDisplayValue(row, "correlativoPlanilla")}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td style={styles.td} colSpan={35}>
                      No se encontraron movimientos para los filtros ingresados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
                </>
              )}
            </>
          ) : (
            <div style={styles.helperText}>
              La conciliacion planilla esta contraida. Usa <strong>Expandir</strong> para ver el detalle.
            </div>
          )}
        </div>
      ) : null}

      {clasificacionModal ? (
        <div style={styles.modalOverlay} onClick={closeClasificacionModal}>
          <div style={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={styles.modalTitle}>Clasificacion contable</h3>
                <p style={styles.modalText}>Movimiento BCP #{clasificacionModal.idMovimientoBanco}</p>
              </div>
              <button type="button" style={styles.modalCloseButton} onClick={closeClasificacionModal} disabled={clasificacionSaving}>
                Cerrar
              </button>
            </div>

            <div style={styles.modalFormGrid}>
              <label style={styles.fieldGroup}>
                <span style={styles.fieldLabel}>Area Flujo</span>
                <select
                  value={clasificacionModal.idAreaFlujo}
                  onChange={(event) => handleClasificacionFieldChange("idAreaFlujo", event.target.value)}
                  style={styles.input}
                  disabled={clasificacionSaving || clasificacionCombosLoading}
                >
                  <option value="">Selecciona</option>
                  {(clasificacionCombos?.areasFlujo ?? []).map((option) => (
                    <option key={option.idAreaFlujo} value={String(option.idAreaFlujo)}>
                      {option.nombreAreaFlujo}
                    </option>
                  ))}
                </select>
              </label>

              <label style={styles.fieldGroup}>
                <span style={styles.fieldLabel}>Referencia</span>
                <select
                  value={clasificacionModal.idReferencia}
                  onChange={(event) => handleClasificacionFieldChange("idReferencia", event.target.value)}
                  style={styles.input}
                  disabled={clasificacionSaving || clasificacionCombosLoading}
                >
                  <option value="">Selecciona</option>
                  {referenciasClasificacionDisponibles.map((option) => (
                    <option key={option.idReferencia} value={String(option.idReferencia)}>
                      {option.codigoReferencia} - {option.nombreReferencia}
                    </option>
                  ))}
                </select>
              </label>

              <label style={styles.fieldGroup}>
                <span style={styles.fieldLabel}>Cuenta Contable</span>
                <select
                  value={clasificacionModal.idCuentaContable}
                  onChange={(event) => handleClasificacionFieldChange("idCuentaContable", event.target.value)}
                  style={styles.input}
                  disabled={clasificacionSaving || clasificacionCombosLoading}
                >
                  <option value="">Selecciona</option>
                  {cuentasClasificacionDisponibles.map((option) => (
                    <option key={option.idCuentaContable} value={String(option.idCuentaContable)}>
                      {option.cuentaContableTexto}
                    </option>
                  ))}
                </select>
              </label>

              <label style={styles.fieldGroup}>
                <span style={styles.fieldLabel}>Regla Contable</span>
                <select
                  value={clasificacionModal.idReglaContable}
                  onChange={(event) => handleClasificacionFieldChange("idReglaContable", event.target.value)}
                  style={styles.input}
                  disabled={clasificacionSaving || clasificacionCombosLoading}
                >
                  <option value="">Selecciona</option>
                  {reglasClasificacionDisponibles.map((rule) => (
                    <option key={rule.idReglaContable} value={String(rule.idReglaContable)}>
                      {getReglaContableLabel(rule)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label style={styles.fieldGroup}>
              <span style={styles.fieldLabel}>Observacion Conciliacion</span>
              <textarea
                value={clasificacionModal.observacionConciliacion}
                onChange={(event) => handleClasificacionFieldChange("observacionConciliacion", event.target.value)}
                style={styles.modalTextarea}
                rows={4}
                placeholder="Comentario interno de clasificacion"
                disabled={clasificacionSaving}
              />
            </label>

            <div style={styles.modalHelperRow}>
              <span style={styles.modalHelperText}>
                Reglas disponibles: {reglasClasificacionDisponibles.length}
              </span>
              <span style={styles.modalHelperText}>
                {clasificacionCombosLoading ? "Cargando combos..." : "La regla se autoselecciona si solo existe una opcion valida."}
              </span>
            </div>

            <div style={styles.modalActions}>
              <button type="button" style={styles.secondaryButton} onClick={closeClasificacionModal} disabled={clasificacionSaving}>
                Cancelar
              </button>
              <button type="button" style={styles.primaryButton} onClick={() => void handleGuardarClasificacion()} disabled={clasificacionSaving}>
                {clasificacionSaving ? "Guardando..." : "Guardar clasificacion"}
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
    overflowX: "auto",
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
  mappingTable: {
    width: "100%",
    borderCollapse: "collapse",
    background: "#FFFFFF",
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
    zIndex: 100,
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
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  },
};
