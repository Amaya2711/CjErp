import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileDown,
  Filter,
  HandCoins,
  Maximize2,
  Printer,
  Pencil,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Minimize2,
  XCircle,
} from "lucide-react";
import AppPage from "../../../components/base/AppPage";
import {
  buildPlanillaConsultaEstadosRequest,
  aprobarPlanillaMasiva,
  consultarPlanillaEstados,
  rechazarPlanilla,
} from "../../../api/planillaConsultaService";
import type {
  AprobacionResultadoDto,
  PlanillaConsultaEstadosRequest,
  PlanillaConsultaParametro,
} from "../../../models/planillaConsulta";
import { getHttpErrorMessage } from "../../../utils/httpError";
import { getAuthUser, hasFullPageActionAccess } from "../../../utils/authStorage";
import { type OrdenCompraConsumoDto } from "../../../api/ordenCompraService";
import {
  seguridadPermisosAccionesService,
  type PermisoAccionDto,
} from "../../seguridad/services/seguridadPermisosAccionesService";
import GastosPage, { type GastoEditorRequest } from "./gastos";
import DataGridPro from "../../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../../components/datagrid/types";

type PagoTabKey = "aprobar" | "reaprobar" | "hormiga" | "observadas" | "resumen";
type DetailTabKey = "orden" | "resumen" | "con-pagado" | "historial" | "historial-oc";

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
  atp: string;
  statusPap: string;
  fecha: string;
  solicitante: string;
  responsable: string;
  validador: string;
  tipoMoneda?: number;
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
  disponibleOc?: number;
  totalSubtotalPorMoneda?: number;
  totalMontoBckPorMoneda?: number;
  totalMontoVisiblePorMoneda?: number;
  totalPagadoConvertidoSoles?: number;
  subtotal: number;
  igv: number;
  total: number;
  estado: PagoEstado;
  // Código/descripcion originales de Planilla. `estado` enruta únicamente
  // las bandejas operativas; Total órdenes debe conservar todos los estados.
  estadoCodigo?: string;
  estadoNombre?: string;
  diasEstado: number;
  observacion: string;
  detalle: string;
  idOc?: string;
  idEstadoOc?: number;
  estadoOcSemaforo?: string;
  documento: string;
  planillaRow?: Record<string, unknown>;
};

type TabTheme = {
  label: string;
  accent: string;
  soft: string;
  border: string;
  icon: React.ReactNode;
};

const COLORES_ESTADO_OC: Record<string, string> = {
  R: "#D32F2F",
  A: "#2E7D32",
  "3": "#1976D2",
  "2": "#FBC02D",
  "1": "#F57C00",
  P: "#FFFFFF",
};

type RechazoModalState = {
  rows: PagoRow[];
  observacion: string;
  submitting: boolean;
  error: string | null;
};

type ObservacionModalState = {
  rows: PagoRow[];
  observacion: string;
  submitting: boolean;
  error: string | null;
};

type RegularizarConfirmState = {
  rowsCount: number;
};

type AprobarConfirmState = {
  rowsCount: number;
  codEstado: number;
  titulo: string;
  mensaje: string;
};

type FilterState = {
  cliente: string;
  proyecto: string;
  site: string;
  tipoTrabajo: string;
  tarea: string;
  solicitante: string[];
  responsable: string[];
  validador: string[];
  moneda: string[];
  estado: string[];
  correlativo: string;
  fechaDesde: string;
  fechaHasta: string;
  query: string;
};

type PagoSortColumn = keyof Pick<PagoRow, "correlativo" | "ot" | "idOc" | "fila" | "solicitante" | "responsable" | "validador" | "subtotal" | "igv" | "total" | "fecha" | "cliente" | "proyecto" | "siteId" | "corSite" | "site" | "tipoTrabajo" | "tarea" | "atp" | "statusPap" | "moneda" | "detalle">;

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
  montoPlanillaSoles?: number;
  montoPlanillaDolares?: number;
  montoPagadoOc?: number;
  subtotalCabOrdenCompra?: number;
  pagado?: number;
  disponibleOc?: number;
  porcentajeOc?: number;
  adelaFic: number;
  porcentajeFic: number;
  montoOcAdelanto: number;
  porcentajeOcAdelanto: number;
};

const TAB_ORDER: PagoTabKey[] = ["aprobar", "reaprobar", "hormiga", "observadas", "resumen"];

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
    if (["0", "6", "10", "2", "7"].includes(row.estadoCodigo ?? "")) {
      grouped[row.estado].push(row);
    }
  }

  grouped.resumen = rows;
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

const TAB_ACTION_KEYS: Record<PagoEstado, string> = {
  aprobar: "tab.aprobar",
  reaprobar: "tab.reaprobar",
  hormiga: "tab.hormiga",
  observadas: "tab.observadas",
};

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
    solicitante: [],
    responsable: [],
    validador: [],
    moneda: [],
    estado: [],
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

    // Planilla entrega estas fechas con formato MM/DD/YYYY.
    const month = firstNumber;
    const day = secondNumber;

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
      row.detalle,
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
      case 7: // Observada administrativa: se agrupa con las observadas.
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

function getQuickIdOcOnly(filters: FilterState): number | null {
  const idOcText = filters.query.trim();
  const idOc = Number(idOcText);
  const hasAdditionalFilter = Boolean(
    filters.correlativo.trim() ||
    filters.solicitante.length ||
    filters.responsable.length ||
    filters.validador.length ||
    filters.moneda.length
  );

  if (!/^\d+$/.test(idOcText) || !Number.isSafeInteger(idOc) || idOc <= 0 || hasAdditionalFilter) {
    return null;
  }

  return idOc;
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
  const estadoOriginal = getRecordNumber(row, "Estado", "estado") ?? getRecordString(row, "EstadoNombre", "estadoNombre");
  const estadoCodigo = String(estadoOriginal ?? "").trim();
  const estadoNombre = getRecordString(row, "NombreEstado", "nombreEstado", "EstadoNombre", "estadoNombre") || estadoCodigo || "Sin estado";
  const estado = mapPlanillaEstadoToPagoEstado(estadoOriginal, fallbackEstado);

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
    tipoMoneda: getRecordNumber(row, "TipoMoneda", "tipoMoneda", "IdMoneda", "idMoneda") ?? undefined,
    moneda:
      getRecordString(row, "Moneda", "moneda", "NombreMoneda", "nombreMoneda", "MonedaLabel", "monedaLabel") ||
      getRecordString(row, "TipoMoneda", "tipoMoneda") ||
      "",
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
    totalSubtotalPorMoneda: getRecordNumber(row, "TotalSubtotalPorMoneda", "totalSubtotalPorMoneda") ?? undefined,
    totalMontoBckPorMoneda: getRecordNumber(row, "TotalMontoBckPorMoneda", "totalMontoBckPorMoneda") ?? undefined,
    totalMontoVisiblePorMoneda: getRecordNumber(row, "TotalMontoVisiblePorMoneda", "totalMontoVisiblePorMoneda") ?? undefined,
    totalPagadoConvertidoSoles: getRecordNumber(
      row,
      "TotalpagadoConvertidoSoles",
      "totalpagadoConvertidoSoles",
      "TotalPagadoConvertidoSoles",
      "totalPagadoConvertidoSoles"
    ) ?? undefined,
    atp: getRecordString(row, "Atp", "ATP", "atp"),
    statusPap: getRecordString(row, "status_Pap", "Status_Pap", "StatusPap", "statusPap"),
    subtotal: Number.isFinite(subtotal) ? subtotal : 0,
    igv: Number.isFinite(igv) ? igv : 0,
    total: Number.isFinite(total) ? total : 0,
    estado,
    estadoCodigo,
    estadoNombre,
    diasEstado: getRecordNumber(row, "DiasEstado", "diasEstado") ?? 0,
    observacion: getRecordString(row, "Observacion", "observacion", "Comentario", "comentario"),
    detalle: getRecordString(row, "Detalle", "detalle"),
    idOc: getRecordString(row, "IdOc", "IdOC", "Idoc", "OC", "Oc"),
    idEstadoOc: getRecordNumber(row, "IdEstadoOc", "idEstadoOc") ?? undefined,
    estadoOcSemaforo: getRecordString(row, "EstadoOcSemaforo", "estadoOcSemaforo", "EstadoOCSemaforo"),
    documento: getRecordString(row, "Documento", "documento"),
    planillaRow: row,
  };
}

function matchesMultiTextFilter(rowValue: string, selectedValues: string[]) {
  if (selectedValues.length === 0) {
    return true;
  }

  const normalizedValue = normalizeText(rowValue);
  return selectedValues.some((value) => normalizedValue === normalizeText(value));
}

function buildPagosV1PlanillaRequest(
  parametros: PlanillaConsultaParametro[],
  consulta = "pagos-v1"
): PlanillaConsultaEstadosRequest {
  return {
    ...buildPlanillaConsultaEstadosRequest(parametros, {
      baseParams: { idCargo: null, idEmpleado: null },
    }),
    consulta,
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

  const parametros: PlanillaConsultaParametro[] = [
      { nombre: "IdCliente", valor: String(Math.trunc(idCliente)), tipo: "int" },
      { nombre: "IdProyecto", valor: String(Math.trunc(idProyecto)), tipo: "int" },
      { nombre: "IdSite", valor: idSite, tipo: "string" },
      { nombre: "CorreSite", valor: correlativo, tipo: "int" },
      { nombre: "TipoTrabajo", valor: tipoTrabajo, tipo: "string" },
    ];

  // La OT es un criterio exclusivo de AMX (cliente 2). Para los demás
  // clientes el resumen se identifica con cliente, proyecto, site,
  // correlativo y tipo de trabajo.
  if (ot && idCliente === 2) {
    parametros.unshift({ nombre: "OT", valor: ot, tipo: "string" });
  }

  return buildPagosV1PlanillaRequest(parametros, "planilla-ot-resumen");
}

function buildHistorialOtRequest(row: PagoRow): PlanillaConsultaEstadosRequest | null {
  const ot = getValidOtValue(row?.ot);
  const idCliente = row?.idCliente ?? 0;
  const idProyecto = row?.idProyecto ?? 0;
  const idSite = row?.siteId?.trim();
  const tipoTrabajo = row?.tipoTrabajo?.trim();

  if (idCliente <= 0 || idProyecto <= 0 || !idSite || !tipoTrabajo) {
    return null;
  }

  const parametros: PlanillaConsultaParametro[] = [
    { nombre: "Estados", valor: "4", tipo: "string" },
    { nombre: "IdCliente", valor: String(Math.trunc(idCliente)), tipo: "int" },
    { nombre: "IdProyecto", valor: String(Math.trunc(idProyecto)), tipo: "int" },
    { nombre: "IdSite", valor: idSite, tipo: "string" },
    { nombre: "TipoTrabajo", valor: tipoTrabajo, tipo: "string" },
  ];

  if (ot) {
    parametros.splice(1, 0, { nombre: "OT", valor: ot, tipo: "string" });
  }

  return buildPagosV1PlanillaRequest(parametros);
}

function buildHistorialOcRequest(row: PagoRow): PlanillaConsultaEstadosRequest | null {
  const idoc = getValidOcValue(row?.idOc ?? row?.documento);
  const fila = row?.fila?.trim();

  if (!idoc || !fila) {
    return null;
  }

  return buildPagosV1PlanillaRequest([
      { nombre: "Estados", valor: "4", tipo: "string" },
      { nombre: "IdOc", valor: idoc, tipo: "string" },
      { nombre: "Fila", valor: fila, tipo: "string" },
    ]);
}

function buildConPagadoRequest(row: PagoRow, idEmpleado: number): PlanillaConsultaEstadosRequest | null {
  const idCliente = row.idCliente ?? 0;
  const idProyecto = row.idProyecto ?? 0;
  const idSite = row.siteId?.trim();
  const corSite = row.corSite?.trim();
  const tipoTrabajo = row.tipoTrabajo?.trim();

  if (idEmpleado <= 0 || idCliente <= 0 || idProyecto <= 0 || !idSite || !corSite || !tipoTrabajo) {
    return null;
  }

  return buildPagosV1PlanillaRequest([
    { nombre: "IdEmpleado", valor: String(Math.trunc(idEmpleado)), tipo: "int" },
    { nombre: "IdCliente", valor: String(Math.trunc(idCliente)), tipo: "int" },
    { nombre: "IdProyecto", valor: String(Math.trunc(idProyecto)), tipo: "int" },
    { nombre: "IdSite", valor: idSite, tipo: "string" },
    { nombre: "CorSite", valor: corSite, tipo: "int" },
    { nombre: "TipoTrabajo", valor: tipoTrabajo, tipo: "string" },
  ]);
}

function buildHistorialOtCacheKey(row: PagoRow): string {
  return [
    getValidOtValue(row.ot),
    String(row.idCliente ?? ""),
    String(row.idProyecto ?? ""),
    row.siteId?.trim() ?? "",
    row.tipoTrabajo?.trim() ?? "",
  ].join("|");
}

function buildResumenOcRequest(row: PagoRow): PlanillaConsultaEstadosRequest | null {
  const idOc = getValidOcValue(row.idOc ?? row.documento);
  const idCliente = row.idCliente ?? 0;
  const idProyecto = row.idProyecto ?? 0;
  const idSite = row.siteId?.trim();
  const correSite = row.corSite?.trim();
  const tipoTrabajo = row.tipoTrabajo?.trim();

  if (!idOc || idCliente <= 0 || idProyecto <= 0 || !idSite || !correSite || !tipoTrabajo) {
    return null;
  }

  return buildPagosV1PlanillaRequest([
    { nombre: "IdOc", valor: idOc, tipo: "int" },
    { nombre: "IdCliente", valor: String(Math.trunc(idCliente)), tipo: "int" },
    { nombre: "IdProyecto", valor: String(Math.trunc(idProyecto)), tipo: "int" },
    { nombre: "IdSite", valor: idSite, tipo: "string" },
    { nombre: "CorreSite", valor: correSite, tipo: "int" },
    { nombre: "TipoTrabajo", valor: tipoTrabajo, tipo: "string" },
  ], "planilla-oc-resumen");
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
      "montoOt",
      "TotalMontoBckPorMoneda",
      "totalMontoBckPorMoneda"
    ) ?? (parseNumericValue(fallback.montoOc2) || fallback.total);

  const montoPlanilla =
    getRecordNumber(
      row,
      "MontoPlanilla",
      "montoPlanilla",
      "MontoPlanillaPagado",
      "montoPlanillaPagado",
      "ConPagado",
      "conPagado",
      "TotalSubtotalPorMoneda",
      "totalSubtotalPorMoneda"
    ) ?? 0;

  const montoPlanillaPagado =
    getRecordNumber(
      row,
      "MontoPlanillaPagado",
      "montoPlanillaPagado",
      "MontoPlanilla_Pagado",
      "montoPlanilla_Pagado"
    ) ?? montoPlanilla;

  const montoPlanillaSoles = getRecordNumber(
    row,
    "MontoPlanillaSoles",
    "montoPlanillaSoles"
  ) ?? undefined;
  const montoPlanillaDolares = getRecordNumber(
    row,
    "MontoPlanillaDolares",
    "montoPlanillaDolares",
    "MontoPlanillaUsd",
    "montoPlanillaUsd"
  ) ?? undefined;

  // El pago de la OC proviene exclusivamente de MontoPagadoOc.
  // No se reemplaza por MontoPlanilla: son indicadores distintos.
  const montoPagadoOc = getRecordNumber(
    row,
    "MontoPagadoOc",
    "MontoPagadoOC",
    "montoPagadoOc"
  ) ?? 0;
  const subtotalCabOrdenCompra =
    getRecordNumber(row, "SubtotalCabOrdenCompra", "SubTotalCabOrdenCompra", "subtotalCabOrdenCompra") ?? 0;

  const totalAcumuladoOt =
    getRecordNumber(
      row,
      "TotalMontoBckPorMoneda",
      "totalMontoBckPorMoneda",
      "Monto_Bck",
      "monto_bck",
      "MontoBck",
      "montoBck",
      "TotalSubtotalPorMoneda",
      "totalSubtotalPorMoneda"
    ) ?? 0;

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

  const porcentaje = getConsumptionPercent(totalAcumuladoOt, disponible);
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

  const disponibleOc =
    getRecordNumber(
      row,
      "SaldoOCDisponible",
      "saldoOCDisponible",
      "SaldoOcDisponible",
      "saldoOcDisponible"
    ) ?? fallback.disponibleOc;

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
      disponibleOc,
      montoPlanilla,
      montoPlanillaPagado,
      montoPlanillaSoles,
      montoPlanillaDolares,
      montoPagadoOc,
      subtotalCabOrdenCompra,
      adelaFic,
      porcentajeFic,
      montoOcAdelanto,
      porcentajeOcAdelanto,
    };
}

function exportToExcel(fileName: string, headers: string[], rows: Array<Array<string | number>>) {
  const worksheetData = [headers, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  worksheet["!autofilter"] = { ref: `A1:${XLSX.utils.encode_cell({ r: 0, c: Math.max(headers.length - 1, 0) })}` };
  worksheet["!cols"] = headers.map((header) => ({ wch: Math.min(Math.max(header.length + 3, 12), 28) }));
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

export default function PagosV2Page() {
  const [activeTab, setActiveTab] = useState<PagoTabKey>("aprobar");
  const [detailTab, setDetailTab] = useState<DetailTabKey>("resumen");
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(() => getDefaultFilterState());
  const [historialSortConfig, setHistorialSortConfig] = useState<{ column: PagoSortColumn; direction: "asc" | "desc" } | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(() => getDefaultFilterState());
  const [rowsByTab, setRowsByTab] = useState<Record<PagoTabKey, PagoRow[]>>({
    aprobar: [],
    reaprobar: [],
    hormiga: [],
    observadas: [],
    resumen: [],
  });
  const [kpiCounts, setKpiCounts] = useState<Record<PagoTabKey, number>>({
    aprobar: 0,
    reaprobar: 0,
    hormiga: 0,
    observadas: 0,
    resumen: 0,
  });
  const [loadingData, setLoadingData] = useState(true);
  const [tabPermissions, setTabPermissions] = useState<Record<string, boolean>>({});
  const [, setLoadingStage] = useState<string>("Iniciando carga...");
  const [selectedId, setSelectedId] = useState<number>(0);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [kpiRefreshTick, setKpiRefreshTick] = useState(0);
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [isHistorialPopupOpen, setIsHistorialPopupOpen] = useState(false);
  const [historialPopupView, setHistorialPopupView] = useState<"listado" | "resumen">("listado");
  const [historialSolicitanteSeleccionado, setHistorialSolicitanteSeleccionado] = useState("");
  const [isHistorialOcPopupOpen, setIsHistorialOcPopupOpen] = useState(false);
  const [isConPagadoPopupOpen, setIsConPagadoPopupOpen] = useState(false);
  const [detallePopup, setDetallePopup] = useState<{ correlativo: string; detalle: string } | null>(null);
  const [message, setMessage] = useState<string>("");
  const [gastoEditorRequest, setGastoEditorRequest] = useState<GastoEditorRequest | null>(null);
  const [rechazoModal, setRechazoModal] = useState<RechazoModalState | null>(null);
  const [observacionModal, setObservacionModal] = useState<ObservacionModalState | null>(null);
  const [aprobarConfirm, setAprobarConfirm] = useState<AprobarConfirmState | null>(null);
  const [regularizarConfirm, setRegularizarConfirm] = useState<RegularizarConfirmState | null>(null);
  const [resumenOtDetalle, setResumenOtDetalle] = useState<ResumenOtDetalle | null>(null);
  const [resumenOtMonedas, setResumenOtMonedas] = useState<ResumenOtDetalle[]>([]);
  const [resumenOtLoading, setResumenOtLoading] = useState(false);
  const [tipoCambioUsd, setTipoCambioUsd] = useState("3.50");
  const [tipoCambioEur, setTipoCambioEur] = useState("3.80");
  const [tipoCambioDop, setTipoCambioDop] = useState("0.057");
  const [tipoCambioCop, setTipoCambioCop] = useState("0.0010");
  const [consumoOc, setConsumoOc] = useState<OrdenCompraConsumoDto | null>(null);
  const [historialRows, setHistorialRows] = useState<PagoRow[]>([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [historialResponsable, setHistorialResponsable] = useState("");
  const [historialOcRows, setHistorialOcRows] = useState<PagoRow[]>([]);
  const [historialOcLoading, setHistorialOcLoading] = useState(false);
  const [conPagadoRows, setConPagadoRows] = useState<PagoRow[]>([]);
  const [conPagadoLoading, setConPagadoLoading] = useState(false);
  const resumenOtCacheRef = useRef<Map<string, ResumenOtDetalle[]>>(new Map());
  const historialOtCacheRef = useRef<Map<string, PagoRow[]>>(new Map());
  const historialOcCacheRef = useRef<Map<string, PagoRow[]>>(new Map());
  const tabRowsCacheRef = useRef<Map<string, PagoRow[]>>(new Map());
  const preferredDetailTabRef = useRef<DetailTabKey | null>(null);
  const previousCheckedIdsRef = useRef<number[]>([]);
  const loadTimeoutMs = 15000;

  useEffect(() => {
    const authUser = getAuthUser();
    if (hasFullPageActionAccess(authUser)) {
      setTabPermissions(
        Object.values(TAB_ACTION_KEYS).reduce<Record<string, boolean>>((result, actionKey) => {
          result[actionKey] = true;
          return result;
        }, {})
      );
      return;
    }

    // SegPermisoAccion referencia EmpleadoCj (el código mostrado en sesión),
    // mientras algunas sesiones también incluyen un IdEmpleado alterno.
    const employeeIds = [...new Set([authUser?.codEmp, authUser?.idEmpleado]
      .map((value) => Number(value ?? 0))
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.trunc(value)))];
    let cancelled = false;

    const loadTabPermissions = async () => {
      if (employeeIds.length === 0) {
        return;
      }

      try {
        const permissionSets = await Promise.all(
          employeeIds.map((idEmpleado) =>
            seguridadPermisosAccionesService.listar({
              rutaPagina: "/finanzas/tesoreria/pagos_v1",
              idEmpleado,
              tipoElemento: "tab",
            })
          )
        );

        if (cancelled) {
          return;
        }

        const allowed = permissionSets.flat().reduce<Record<string, boolean>>((result, permiso: PermisoAccionDto) => {
          const key = permiso.claveAccion?.trim().toLowerCase();
          if (key) {
            result[key] = Boolean(result[key] || (permiso.esActivo && permiso.puedeVer && permiso.puedeEjecutar));
          }
          return result;
        }, {});

        setTabPermissions(allowed);
      } catch {
        if (!cancelled) {
          setTabPermissions({});
        }
      }
    };

    void loadTabPermissions();

    return () => {
      cancelled = true;
    };
  }, []);

  const canUseTab = useCallback(
    (tab: PagoEstado) => Boolean(tabPermissions[TAB_ACTION_KEYS[tab]]),
    [tabPermissions]
  );

  const pushLoadTrace = useCallback((entry: string) => {
    // No exponer trazas de consultas ni tiempos de carga en consola.
    void entry;
  }, []);

  const runTrackedRequest = useCallback(
    async <T,>(label: string, runner: () => Promise<T>, signal?: AbortSignal) => {
      const startedAt = performance.now();
      let timeoutTriggered = false;

      const timeoutId = window.setTimeout(() => {
        if (signal?.aborted) {
          return;
        }
        timeoutTriggered = true;
        const message = `${label}: sigue en curso después de ${Math.round(loadTimeoutMs / 1000)}s`;
        setLoadingStage(message);
        pushLoadTrace(message);
      }, loadTimeoutMs);

      try {
        return await runner();
      } finally {
        window.clearTimeout(timeoutId);
        if (signal?.aborted) {
          return;
        }
        const elapsedMs = Math.round(performance.now() - startedAt);
        pushLoadTrace(
          timeoutTriggered
            ? `${label}: finalizó en ${elapsedMs} ms luego del aviso de demora`
            : `${label}: ${elapsedMs} ms`
        );
      }
    },
    [pushLoadTrace]
  );

  // Los indicadores se consultan sin descargar las filas del grid. Cada
  // pestaña solicitará sus registros recién cuando el usuario la active.
  useEffect(() => {
    const controller = new AbortController();
    const loadKpis = async () => {
      const parametros: PlanillaConsultaParametro[] = [];
      const fechaInicio = formatDateParam(appliedFilters.fechaDesde);
      const fechaFin = formatDateParam(appliedFilters.fechaHasta);
      if (fechaInicio) parametros.push({ nombre: "FechaInicio", valor: fechaInicio, tipo: "date" });
      if (fechaFin) parametros.push({ nombre: "FechaFin", valor: fechaFin, tipo: "date" });

      const cargarKpisDesdeConsultaPrincipal = async () => {
        const estadosKpi: Array<[Exclude<PagoTabKey, "resumen">, string]> = [
          ["aprobar", "0"],
          ["reaprobar", "6"],
          ["hormiga", "10"],
          ["observadas", "2,7"],
        ];
        const resultados = await Promise.all(
          estadosKpi.map(async ([tab, estado]) => {
            const response = await consultarPlanillaEstados(
              {
                ...buildPagosV1PlanillaRequest([
                  ...parametros,
                  { nombre: "Estados", valor: estado, tipo: "string" },
                ]),
                // Solo se requiere TotalRows; evita transferir la grilla completa.
                maxRows: 1,
              },
              { timeoutMs: 120000, signal: controller.signal },
            );
            return [tab, Number(response.totalRows) || 0] as const;
          }),
        );
        const next = { aprobar: 0, reaprobar: 0, hormiga: 0, observadas: 0, resumen: 0 };
        for (const [tab, total] of resultados) {
          next[tab] = total;
          next.resumen += total;
        }
        return next;
      };

      try {
        const response = await consultarPlanillaEstados(
          buildPagosV1PlanillaRequest(parametros, "pagos-v1-resumen"),
          { timeoutMs: 120000, signal: controller.signal }
        );
        if (controller.signal.aborted) return;

        const next = { aprobar: 0, reaprobar: 0, hormiga: 0, observadas: 0, resumen: 0 };
        let tieneResumenCompatible = false;
        for (const row of response.rows ?? []) {
          const count = getRecordNumber(row, "Cantidad", "cantidad", "Total", "total", "Conteo", "conteo") ?? 0;
          const estado = getRecordNumber(row, "Estado", "estado", "IdEstado", "idEstado");
          tieneResumenCompatible ||= estado != null;
          if (estado === 0) next.aprobar = count;
          if (estado === 6) next.reaprobar = count;
          if (estado === 10) next.hormiga = count;
          if (estado === 2) next.observadas = count;
          next.resumen += count;
        }
        if (tieneResumenCompatible) {
          // El resumen solo agrupa los estados 0, 2, 6 y 10: el estado 7 (observada
          // administrativa) se cuenta aparte y se suma a Observadas.
          try {
            const respuesta7 = await consultarPlanillaEstados(
              {
                ...buildPagosV1PlanillaRequest([...parametros, { nombre: "Estados", valor: "7", tipo: "string" }]),
                maxRows: 1,
              },
              { timeoutMs: 120000, signal: controller.signal },
            );
            const total7 = Number(respuesta7.totalRows) || 0;
            next.observadas += total7;
            next.resumen += total7;
          } catch {
            if (controller.signal.aborted) return;
          }
        }
        if (controller.signal.aborted) return;
        setKpiCounts(tieneResumenCompatible ? next : await cargarKpisDesdeConsultaPrincipal());
      } catch {
        if (!controller.signal.aborted) {
          try {
            setKpiCounts(await cargarKpisDesdeConsultaPrincipal());
          } catch {
            if (!controller.signal.aborted) {
              setKpiCounts({ aprobar: 0, reaprobar: 0, hormiga: 0, observadas: 0, resumen: 0 });
            }
          }
        }
      }
    };
    void loadKpis();
    return () => controller.abort();
  }, [appliedFilters.fechaDesde, appliedFilters.fechaHasta, refreshTick, kpiRefreshTick]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const load = async (signal: AbortSignal) => {
      const cacheKey = [
        activeTab,
        appliedFilters.fechaDesde,
          appliedFilters.fechaHasta,
          appliedFilters.query,
          appliedFilters.correlativo,
          appliedFilters.solicitante.join(","),
          appliedFilters.responsable.join(","),
          appliedFilters.validador.join(","),
          appliedFilters.moneda.join(","),
          appliedFilters.estado.join(","),
          refreshTick,
      ].join("|");
      const cachedRows = tabRowsCacheRef.current.get(cacheKey);
      if (cachedRows) {
        setRowsByTab((previous) => ({ ...previous, [activeTab]: cachedRows }));
        return;
      }

      setLoadingData(true);
      setLoadingStage("Preparando consulta de órdenes...");
      const loadStart = performance.now();

      try {
        if (signal.aborted) {
          return;
        }

        const fechaInicio = formatDateParam(appliedFilters.fechaDesde);
        const fechaFin = formatDateParam(appliedFilters.fechaHasta);
        const textoBusqueda = appliedFilters.query.trim();
        const correlativo = appliedFilters.correlativo.trim();
        const correlativoNumero = Number(correlativo);
        const buscarPorCorrelativo = Number.isInteger(correlativoNumero) && correlativoNumero > 0;
        const buscarEnTotal = Boolean(textoBusqueda) || buscarPorCorrelativo;
        const tieneFiltroFechas = Boolean(fechaInicio || fechaFin);
        const quickIdOcOnly = getQuickIdOcOnly(appliedFilters);

        let nextRowsByTab: Record<PagoTabKey, PagoRow[]>;
        setLoadingStage(
          quickIdOcOnly
            ? "Consultando orden de compra..."
            : tieneFiltroFechas
            ? "Consultando órdenes por rango de fechas..."
            : "Consultando órdenes consolidadas por estados..."
        );

        const parametros: PlanillaConsultaParametro[] = [];
        if (quickIdOcOnly) {
          // Una búsqueda aislada por IdOC no debe heredar estado ni fechas.
          parametros.push({ nombre: "IdOc", valor: String(quickIdOcOnly), tipo: "int" });
        } else {
          const estadoActivo = activeTab === "aprobar" ? "0"
            : activeTab === "reaprobar" ? "6"
            : activeTab === "hormiga" ? "10"
            : "2,7"; // Observadas: estados 2 (observada) y 7 (observada administrativa)
          // Total Órdenes muestra todos los estados salvo que el usuario haya
          // elegido explícitamente uno o más estados en su filtro.
          if (activeTab !== "resumen") {
            parametros.push({ nombre: "Estados", valor: estadoActivo, tipo: "string" });
          } else if (appliedFilters.estado.length > 0) {
            parametros.push({ nombre: "Estados", valor: appliedFilters.estado.join(","), tipo: "string" });
          }
          // Los tipos de cambio se toman de los filtros principales y se
          // envían únicamente cuando contienen un valor válido.
          [
            ["TipoCambioUSD", tipoCambioUsd],
            ["TipoCambioEUR", tipoCambioEur],
            ["TipoCambioDOP", tipoCambioDop],
            ["TipoCambioCOP", tipoCambioCop],
          ].forEach(([nombre, valor]) => {
            const tipoCambioFiltro = parseNumericValue(valor);
            if (tipoCambioFiltro > 0) {
              parametros.push({ nombre, valor: String(tipoCambioFiltro), tipo: "decimal" });
            }
          });

          if (buscarPorCorrelativo) {
            parametros.push({ nombre: "Correlativo", valor: String(correlativoNumero), tipo: "int" });
          }

          // El correlativo identifica un registro puntual; las fechas no
          // deben limitarlo. El estado sí se conserva según la pestaña,
          // salvo en Total Órdenes (resumen), que no envía @Estados.
          if (fechaInicio && !buscarPorCorrelativo) {
            parametros.push({ nombre: "FechaInicio", valor: fechaInicio, tipo: "date" });
          }

          if (fechaFin && !buscarPorCorrelativo) {
            parametros.push({ nombre: "FechaFin", valor: fechaFin, tipo: "date" });
          }
        }

        // La búsqueda rápida se aplica localmente. Así OT y OC no dependen de
        // qué campos contemple la versión instalada del store de Planilla.

        const requestBuildStart = performance.now();
        const request = buildPagosV1PlanillaRequest(parametros);
        pushLoadTrace(`Armado de request: ${(performance.now() - requestBuildStart).toFixed(0)} ms`);
        setLoadingStage("Enviando consulta a la API...");

        const response = await runTrackedRequest(
          buscarEnTotal ? "Búsqueda global en Planilla" : tieneFiltroFechas ? "Consulta por fechas" : "Consulta consolidada",
          () => consultarPlanillaEstados(request, { timeoutMs: 120000, signal }),
          signal
        );

        if (signal.aborted || cancelled) {
          return;
        }

        if (!response) {
          return;
        }

        pushLoadTrace(`Respuesta API: ${Array.isArray(response.rows) ? response.rows.length : 0} registros`);

        const mapStart = performance.now();
        const rows = Array.isArray(response.rows) ? response.rows : [];
        const mappedRows = rows.map((row, index) =>
          mapPlanillaConsultaRowToPagoRow(
            row,
            index,
            mapPlanillaEstadoToPagoEstado(
              getRecordNumber(row, "Estado", "estado") ?? getRecordString(row, "EstadoNombre", "estadoNombre"),
              "aprobar"
            )
          )
        );
        pushLoadTrace(`Mapeo de registros: ${(performance.now() - mapStart).toFixed(0)} ms`);

        const groupStart = performance.now();
        nextRowsByTab = quickIdOcOnly
          ? { aprobar: [], reaprobar: [], hormiga: [], observadas: [], resumen: [], [activeTab]: mappedRows }
          : groupRowsByEstado(mappedRows);
        pushLoadTrace(`Agrupación de registros: ${(performance.now() - groupStart).toFixed(0)} ms`);

        if (cancelled) {
          return;
        }

        pushLoadTrace(`Carga total: ${(performance.now() - loadStart).toFixed(0)} ms`);
        setRowsByTab((previous) => ({
          ...previous,
          [activeTab]: nextRowsByTab[activeTab],
        }));
        tabRowsCacheRef.current.set(cacheKey, nextRowsByTab[activeTab]);
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) {
          setMessage("No se pudieron cargar las Órdenes desde Planilla.");
          // No exponer errores ni detalles de consultas de órdenes en consola.
        }
      } finally {
        if (!cancelled && !controller.signal.aborted) {
          setLoadingStage("");
          setLoadingData(false);
        }
      }
    };

    void load(controller.signal);

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeTab, appliedFilters, refreshTick, runTrackedRequest]);

  const activeRows = useMemo(
    () => (activeTab === "resumen" ? rowsByTab.resumen : rowsByTab[activeTab]),
    [activeTab, rowsByTab]
  );

  const matchesAppliedFilters = useCallback(
    (row: PagoRow, includeDateFilters: boolean) => {
      const fechaDesde = includeDateFilters ? formatDateParam(appliedFilters.fechaDesde) : "";
      const fechaHasta = includeDateFilters ? formatDateParam(appliedFilters.fechaHasta) : "";
      const buscarEnTotal = Boolean(appliedFilters.query.trim());
      const correlativo = appliedFilters.correlativo.trim();
      const correlativoNumero = Number(correlativo);
      const buscarPorCorrelativo = Number.isInteger(correlativoNumero) && correlativoNumero > 0;
      const rowDate = toComparableDateKey(row.fecha);

      // La bandeja ya está limitada al estado de la pestaña activa. Para una
      // búsqueda por correlativo no se deben volver a aplicar fechas ni los
      // demás filtros manuales sobre el resultado puntual.
      if (buscarPorCorrelativo) {
        return String(row.correlativo).trim() === String(correlativoNumero);
      }

      return (
        matchesTextFilter(row.cliente, appliedFilters.cliente) &&
        matchesTextFilter(row.proyecto, appliedFilters.proyecto) &&
        matchesTextFilter(row.site, appliedFilters.site) &&
        matchesTextFilter(row.tipoTrabajo, appliedFilters.tipoTrabajo) &&
        matchesTextFilter(row.tarea, appliedFilters.tarea) &&
        matchesMultiTextFilter(row.solicitante, appliedFilters.solicitante) &&
        matchesMultiTextFilter(row.responsable, appliedFilters.responsable) &&
        matchesMultiTextFilter(row.validador, appliedFilters.validador) &&
        matchesMultiTextFilter(row.moneda, appliedFilters.moneda) &&
        (activeTab !== "resumen" || appliedFilters.estado.length === 0 || appliedFilters.estado.includes(row.estadoCodigo ?? "")) &&
        matchesTextFilter(row.correlativo, appliedFilters.correlativo) &&
        (buscarEnTotal || !fechaDesde || rowDate >= fechaDesde) &&
        (buscarEnTotal || !fechaHasta || rowDate <= fechaHasta)
      );
    },
    [activeTab, appliedFilters]
  );

  const quickIdOcOnly = useMemo(() => getQuickIdOcOnly(appliedFilters), [appliedFilters]);

  const filteredRows = useMemo(() => {
    return activeRows.filter(
      (row) =>
        (quickIdOcOnly || matchesAppliedFilters(row, activeTab === "aprobar")) &&
        matchesQuickSearch(row, filters.query)
    );
  }, [activeRows, activeTab, filters.query, matchesAppliedFilters, quickIdOcOnly]);

  // Filas que realmente se ven tras los filtros de la grilla (fila de filtros,
  // filtro de encabezado y búsqueda). Selección, totales y export trabajan sobre ellas.
  const [gridRows, setGridRows] = useState<PagoRow[] | null>(null);
  const visibleRows = useMemo(() => {
    if (!gridRows) return filteredRows;
    const current = new Map(filteredRows.map((row) => [row.id, row]));
    return gridRows.flatMap((row) => {
      const match = current.get(row.id);
      return match ? [match] : [];
    });
  }, [gridRows, filteredRows]);
  const visibleRowIds = useMemo(() => visibleRows.map((row) => row.id), [visibleRows]);

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


  const selectedRow = useMemo(
    () => filteredRows.find((row) => row.id === selectedId) ?? filteredRows[0] ?? null,
    [filteredRows, selectedId]
  );

  const filaActiva = selectedRow;

  const tabStats = kpiCounts;

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
      const saldoOCDisponible = getRecordNumber(row, "SaldoOCDisponible", "saldoOCDisponible", "SaldoOcDisponible", "saldoOcDisponible");
      // El límite total de la OT se obtiene del monto de respaldo de su moneda.
      // TotalSubtotalPorMoneda corresponde al subtotal solicitado, no al Total OT.
      const totalMontoBckPorMoneda = row.totalMontoBckPorMoneda;
      const totalAcumuladoOt =
        ot
          ? totalMontoBckPorMoneda != null
            ? parseNumericValue(totalMontoBckPorMoneda)
            : montoPlanillaPagadoCampo > 0
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
      const disponibleOc = oc ? (saldoOCDisponible ?? Math.max(totalOc - (pagadoOc + solicitadoOc), 0)) : 0;
      const porcentajeOc = oc ? getConsumptionPercent(totalOc, disponibleOc) : 0;

      return {
        ...row,
        ot,
        sameOtRows,
        totalAcumuladoOt,
        montoOc,
        disponible,
        porcentaje,
        pagado: ot ? parseNumericValue(row.montoPlanillaPagado ?? row.montoPlanillaPagadoDisplay ?? 0) : 0,
        pendiente: ot ? Math.max(montoOc - totalAcumuladoOt, 0) : 0,
        subOc: totalOc,
        adelaFic,
        porcentajeFic,
        porcentajeMontoBck: undefined,
        solicitado: solicitadoOc,
        porcentajeOc,
        disponibleOc,
        montoPagadoOc: 0,
        subtotalCabOrdenCompra: 0,
        montoPlanilla: undefined as number | undefined,
        montoPlanillaSoles: undefined as number | undefined,
        montoPlanillaDolares: undefined as number | undefined,
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
  const historialResponsableOptions = useMemo(
    () =>
      Array.from(
        new Set(historialRows.map((row) => row.responsable.trim()).filter(Boolean))
      ).sort((left, right) => left.localeCompare(right, "es")),
    [historialRows]
  );
  const historialRowsFiltrados = useMemo(
    () => {
      const criterio = normalizeText(historialResponsable);

      return criterio
        ? historialRows.filter((row) => normalizeText(row.responsable).includes(criterio))
        : historialRows;
    },
    [historialResponsable, historialRows]
  );
  const historialRowsOrdenados = useMemo(() => {
    if (!historialSortConfig) return historialRowsFiltrados;

    return [...historialRowsFiltrados].sort((left, right) => {
      const leftValue = left[historialSortConfig.column] ?? "";
      const rightValue = right[historialSortConfig.column] ?? "";
      const result = typeof leftValue === "number" && typeof rightValue === "number"
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), "es", { numeric: true });
      return historialSortConfig.direction === "asc" ? result : -result;
    });
  }, [historialRowsFiltrados, historialSortConfig]);
  const historialPopupRowsFiltrados = useMemo(() => {
    const solicitanteSeleccionado = normalizeText(historialSolicitanteSeleccionado);

    return solicitanteSeleccionado
      ? historialRowsFiltrados.filter((row) => normalizeText(row.solicitante).includes(solicitanteSeleccionado))
      : historialRowsFiltrados;
  }, [historialRowsFiltrados, historialSolicitanteSeleccionado]);
  const historialPopupRowsOrdenados = useMemo(() => {
    if (!historialSortConfig) return historialPopupRowsFiltrados;

    return [...historialPopupRowsFiltrados].sort((left, right) => {
      const leftValue = left[historialSortConfig.column] ?? "";
      const rightValue = right[historialSortConfig.column] ?? "";
      const result = typeof leftValue === "number" && typeof rightValue === "number"
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), "es", { numeric: true });
      return historialSortConfig.direction === "asc" ? result : -result;
    });
  }, [historialPopupRowsFiltrados, historialSortConfig]);
  const historialTotalesPorMoneda = useMemo(() => {
    const totals = new Map<string, number>();

    historialRowsFiltrados.forEach((row) => {
      const moneda = row.moneda?.trim() || "SIN MONEDA";
      totals.set(moneda, (totals.get(moneda) ?? 0) + (Number(row.subtotal) || 0));
    });

    return Array.from(totals, ([moneda, total]) => ({ moneda, total }));
  }, [historialRowsFiltrados]);
  const historialSolicitudesPorMoneda = useMemo(() => {
    const totalsByCurrency = new Map<string, Map<string, number>>();

    historialRowsFiltrados.forEach((row) => {
      const moneda = row.moneda?.trim() || "SIN MONEDA";
      const solicitante = row.solicitante?.trim() || "SIN SOLICITANTE";
      const totalSolicitado = Number(row.subtotal) || 0;
      const totalsBySolicitante = totalsByCurrency.get(moneda) ?? new Map<string, number>();

      totalsBySolicitante.set(solicitante, (totalsBySolicitante.get(solicitante) ?? 0) + totalSolicitado);
      totalsByCurrency.set(moneda, totalsBySolicitante);
    });

    return Array.from(totalsByCurrency, ([moneda, totalsBySolicitante]) => ({
      moneda,
      items: Array.from(totalsBySolicitante, ([solicitante, total]) => ({ solicitante, total }))
        .sort((left, right) => right.total - left.total || left.solicitante.localeCompare(right.solicitante, "es")),
    }));
  }, [historialRowsFiltrados]);

  useEffect(() => {
    setHistorialResponsable("");
    setHistorialSortConfig(null);
    setHistorialSolicitanteSeleccionado("");
  }, [historialOtSeleccionada]);

  useEffect(() => {
    // El grid selecciona su primera fila al terminar de cargar. No consultar
    // consumo de OC hasta que el usuario abra el panel de detalle: hacerlo
    // aquí agregaba una llamada pesada a la carga inicial sin mostrar nada.
    if (!isDetailPanelOpen || detailTab !== "resumen" || !filaActiva) {
      setConsumoOc(null);
      return;
    }

    const request = buildResumenOcRequest(filaActiva);
    if (!request) {
      setConsumoOc(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setConsumoOc(null);

    void consultarPlanillaEstados(request, { timeoutMs: 120000, signal: controller.signal })
      .then((response) => {
        if (!cancelled && !controller.signal.aborted) {
          const row = Array.isArray(response.rows) ? response.rows[0] : null;
          setConsumoOc(row ? {
            idOc: Number(filaActiva.idOc ?? filaActiva.documento) || 0,
            fila: Number(filaActiva.fila) || null,
            pagadoOc: getRecordNumber(row, "TotalSubPlanillaMoneda", "totalSubPlanillaMoneda") ?? 0,
            totalOc: getRecordNumber(row, "TotalOCMoneda", "totalOCMoneda") ?? 0,
          } : null);
        }
      })
      .catch(() => {
        if (!cancelled && !controller.signal.aborted) {
          setConsumoOc(null);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isDetailPanelOpen, detailTab, filaActiva?.id, filaActiva?.idOc, filaActiva?.documento, filaActiva?.idCliente, filaActiva?.idProyecto, filaActiva?.siteId, filaActiva?.corSite, filaActiva?.tipoTrabajo]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const cargarResumenOt = async (signal: AbortSignal) => {
      // En Resumen, Pagado y Disponible se calculan inmediatamente desde la
      // fila seleccionada. Esta consulta solo aporta el desglose por moneda
      // para "Detalle de conversión", sin sobrescribir dichos importes.
      const isResumen = detailTab === "resumen";
      if (!isDetailPanelOpen) {
        setResumenOtLoading(false);
        return;
      }
      if (!isResumen && detailTab !== "con-pagado") {
        return;
      }

      if (!filaActiva) {
        setResumenOtDetalle(null);
        setResumenOtMonedas([]);
        return;
      }

      const request = buildResumenOtRequest(filaActiva);
      if (!request) {
        setResumenOtDetalle(null);
        setResumenOtMonedas([]);
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
        if (!cancelled && !signal.aborted) {
          setResumenOtDetalle(isResumen ? null : cached[0] ?? null);
          setResumenOtMonedas(cached);
          setResumenOtLoading(false);
        }
        return;
      }

      setResumenOtLoading(true);
      setResumenOtDetalle(null);
      setResumenOtMonedas([]);

      try {
        const response = await consultarPlanillaEstados(request, { timeoutMs: 120000, signal });
        if (cancelled || signal.aborted) {
          return;
        }

        const responseRows = Array.isArray(response.rows) ? response.rows : [];
        if (responseRows.length === 0) {
          setResumenOtDetalle(null);
          setResumenOtMonedas([]);
          return;
        }

        const mappedRows = Array.from(
          responseRows
            .map((item) => mapResumenOtResponseRowToDetalle(item, filaActiva))
            .reduce((byCurrency, item) => {
              const currencyKey = normalizeText(item.moneda || "Sin moneda");
              // El store puede repetir el acumulado de una moneda por cada
              // registro base. Para el resumen se muestra una sola vez.
              if (!byCurrency.has(currencyKey)) {
                byCurrency.set(currencyKey, item);
              }
              return byCurrency;
            }, new Map<string, ResumenOtDetalle>())
            .values()
        );
        const mapped = mappedRows[0];
        resumenOtCacheRef.current.set(cacheKey, mappedRows);
        setResumenOtDetalle(isResumen ? null : mapped);
        setResumenOtMonedas(mappedRows);
      } catch (error) {
        if (!cancelled && !signal.aborted) {
          setResumenOtDetalle(null);
          setResumenOtMonedas([]);
          // No exponer errores ni detalles de consultas de OT en consola.
        }
      } finally {
        if (!cancelled && !signal.aborted) {
          setResumenOtLoading(false);
        }
      }
    };

    void cargarResumenOt(controller.signal);

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    isDetailPanelOpen,
    detailTab,
    filaActiva?.id,
    filaActiva?.ot,
    filaActiva?.idCliente,
    filaActiva?.idProyecto,
    filaActiva?.siteId,
    filaActiva?.corSite,
    filaActiva?.tipoTrabajo,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const loadHistorial = async (signal: AbortSignal) => {
      // El historial se consulta únicamente al abrir su pestaña. El resumen
      // obtiene Pagado directamente de TotalSubtotalPorMoneda de la fila.
      if (!isDetailPanelOpen || detailTab !== "historial") {
        setHistorialLoading(false);
        return;
      }

      if (!filaActiva) {
        setHistorialRows([]);
        setHistorialLoading(false);
        return;
      }

      const request = buildHistorialOtRequest(filaActiva);
      if (!request) {
        setHistorialRows([]);
        setHistorialLoading(false);
        return;
      }

      const cacheKey = buildHistorialOtCacheKey(filaActiva);
      const cachedRows = historialOtCacheRef.current.get(cacheKey);
      if (cachedRows) {
        setHistorialRows(cachedRows);
        setHistorialLoading(false);
        return;
      }

      setHistorialLoading(true);
      setHistorialRows([]);

      try {
        const response = await consultarPlanillaEstados(request, { timeoutMs: 120000, signal });
        if (cancelled || signal.aborted) {
          return;
        }

        const rows = Array.isArray(response.rows) ? response.rows : [];
        const mappedRows = rows.map((row, index) => mapPlanillaConsultaRowToPagoRow(row, index, filaActiva.estado));
        historialOtCacheRef.current.set(cacheKey, mappedRows);
        setHistorialRows(mappedRows);
      } catch (error) {
        if (!cancelled && !signal.aborted) {
          setHistorialRows([]);
          // No exponer errores ni detalles de consultas de historial en consola.
        }
      } finally {
        if (!cancelled && !signal.aborted) {
          setHistorialLoading(false);
        }
      }
    };

    void loadHistorial(controller.signal);

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    isDetailPanelOpen,
    detailTab,
    filaActiva?.id,
    filaActiva?.idCliente,
    filaActiva?.idProyecto,
    filaActiva?.siteId,
    filaActiva?.tipoTrabajo,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const loadConPagado = async (signal: AbortSignal) => {
      if (!isDetailPanelOpen || detailTab !== "con-pagado") {
        setConPagadoLoading(false);
        return;
      }

      if (!filaActiva) {
        setConPagadoRows([]);
        setConPagadoLoading(false);
        return;
      }

      const idEmpleado = getRecordNumber(
        filaActiva.planillaRow ?? {},
        "IDEMPLEADOSOLICITANTE",
        "IdEmpleadoSolicitante",
        "idEmpleadoSolicitante"
      ) ?? 0;
      const request = buildConPagadoRequest(filaActiva, Math.trunc(idEmpleado));

      if (!request) {
        setConPagadoRows([]);
        setConPagadoLoading(false);
        return;
      }

      setConPagadoLoading(true);
      setConPagadoRows([]);

      try {
        const response = await consultarPlanillaEstados(request, { timeoutMs: 120000, signal });
        if (cancelled || signal.aborted) {
          return;
        }

        const rows = Array.isArray(response.rows) ? response.rows : [];
        setConPagadoRows(rows.map((row, index) => mapPlanillaConsultaRowToPagoRow(row, index, filaActiva.estado)));
      } catch {
        if (!cancelled && !signal.aborted) {
          setConPagadoRows([]);
        }
      } finally {
        if (!cancelled && !signal.aborted) {
          setConPagadoLoading(false);
        }
      }
    };

    void loadConPagado(controller.signal);

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    isDetailPanelOpen,
    detailTab,
    filaActiva?.id,
    filaActiva?.idCliente,
    filaActiva?.idProyecto,
    filaActiva?.siteId,
    filaActiva?.corSite,
    filaActiva?.tipoTrabajo,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const loadHistorialOc = async (signal: AbortSignal) => {
      // El resumen de consumo usa su consulta dedicada. Este listado pesado
      // únicamente se necesita cuando el usuario abre Historial OC.
      if (!isDetailPanelOpen || detailTab !== "historial-oc") {
        setHistorialOcLoading(false);
        return;
      }

      if (!filaActiva) {
        setHistorialOcRows([]);
        setHistorialOcLoading(false);
        return;
      }

      const request = buildHistorialOcRequest(filaActiva);
      if (!request) {
        setHistorialOcRows([]);
        setHistorialOcLoading(false);
        return;
      }

      const cacheKey = [
        filaActiva.idOc || filaActiva.documento || "",
        filaActiva.fila || "",
        filaActiva.estado || "",
      ].join("|");

      const cachedRows = historialOcCacheRef.current.get(cacheKey);
      if (cachedRows) {
        if (!cancelled && !signal.aborted) {
          setHistorialOcRows(cachedRows);
          setHistorialOcLoading(false);
        }
        return;
      }

      setHistorialOcLoading(true);
      setHistorialOcRows([]);

      try {
        const response = await consultarPlanillaEstados(request, { timeoutMs: 120000, signal });
        if (cancelled || signal.aborted) {
          return;
        }

        const rows = Array.isArray(response.rows) ? response.rows : [];
        const mappedRows = rows.map((row, index) => mapPlanillaConsultaRowToPagoRow(row, index, filaActiva.estado));
        historialOcCacheRef.current.set(cacheKey, mappedRows);
        setHistorialOcRows(mappedRows);
      } catch (error) {
        if (!cancelled && !signal.aborted) {
          setHistorialOcRows([]);
          // No exponer errores ni detalles de consultas de historial en consola.
        }
      } finally {
        if (!cancelled && !signal.aborted) {
          setHistorialOcLoading(false);
        }
      }
    };

    void loadHistorialOc(controller.signal);

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    isDetailPanelOpen,
    detailTab,
    filaActiva?.id,
    filaActiva?.idOc,
    filaActiva?.documento,
    filaActiva?.fila,
    filaActiva?.estado,
  ]);

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
        parseNumericValue(resumenOtDetalle.totalAcumuladoOt ?? detalleOcBase.totalAcumuladoOt ?? 0),
        parseNumericValue(resumenOtDetalle.disponible ?? detalleOcBase.disponible ?? 0)
      ),
      pagado: detalleOcBase.pagado,
      montoPlanillaPagado: resumenOtDetalle.montoPlanillaPagado ?? detalleOcBase.montoPlanillaPagado,
      montoPlanillaSoles: resumenOtDetalle.montoPlanillaSoles,
      montoPlanillaDolares: resumenOtDetalle.montoPlanillaDolares,
      montoPagadoOc: parseNumericValue(resumenOtDetalle.montoPagadoOc ?? 0),
      totalAcumuladoOt: resumenOtDetalle.totalAcumuladoOt ?? detalleOcBase.totalAcumuladoOt,
      porcentajeMontoBck:
        resumenOtDetalle.porcentajeMontoBck ??
        getConsumptionPercent(
          parseNumericValue(resumenOtDetalle.totalAcumuladoOt ?? detalleOcBase.totalAcumuladoOt ?? 0),
          parseNumericValue(resumenOtDetalle.disponible ?? detalleOcBase.disponible ?? 0)
        ),
      porcentajeOc: getConsumptionPercent(
        parseNumericValue(resumenOtDetalle.subOc ?? detalleOcBase.subOc ?? 0),
        parseNumericValue(resumenOtDetalle.disponibleOc ?? detalleOcBase.disponibleOc ?? 0)
      ),
    };
  }, [detalleOcBase, resumenOtDetalle]);
  const conPagadoResumenPorMoneda = useMemo(() => {
    const subtotales = new Map<string, { moneda: string; subtotal: number }>();

    for (const row of conPagadoRows) {
      const moneda = row.moneda || "Sin moneda";
      const key = normalizeText(moneda);
      const current = subtotales.get(key) ?? { moneda, subtotal: 0 };
      current.subtotal += parseNumericValue(row.subtotal);
      subtotales.set(key, current);
    }

    return Array.from(subtotales.entries()).map(([key, item]) => {
      const resumenMoneda = resumenOtMonedas.find(
        (resumen) => normalizeText(resumen.moneda || "Sin moneda") === key
      );
      const totalOt = Math.max(
        parseNumericValue(
          resumenMoneda?.totalAcumuladoOt ??
            (resumenOtMonedas.length <= 1 ? detalleOcActiva?.totalAcumuladoOt : 0) ??
            0
        ),
        0
      );
      const pagadoOt = Math.max(
        parseNumericValue(
          resumenMoneda?.montoPlanilla ??
            (resumenOtMonedas.length <= 1 ? detalleOcActiva?.montoPlanilla : 0) ??
            0
        ),
        0
      );
      const pagadoPorcentaje = totalOt > 0 ? Math.min((pagadoOt / totalOt) * 100, 100) : 0;
      const porcentaje = totalOt > 0
        ? Math.min((item.subtotal / totalOt) * 100, Math.max(100 - pagadoPorcentaje, 0))
        : 0;

      return { ...item, totalOt, pagadoOt, pagadoPorcentaje, porcentaje };
    });
  }, [conPagadoRows, detalleOcActiva?.montoPlanilla, detalleOcActiva?.totalAcumuladoOt, resumenOtMonedas]);
  const resumenOcTitulo = detalleOcActiva?.ot || detalleOcActiva?.correlativo || filaActiva?.ot || filaActiva?.correlativo || "";
  const tipoCambioLocal = Math.max(parseNumericValue(tipoCambioUsd), 0);
  const montoPlanillaOriginalOt = parseNumericValue(filaActiva?.totalSubtotalPorMoneda ?? 0);
  // El total pagado es el subtotal acumulado por moneda enviado por el store.
  // No depende del historial ni de consultas adicionales al seleccionar la fila.
  const montoPlanillaPagadoOt = Math.max(montoPlanillaOriginalOt, 0);
  const consumoOtLoading = false;
  // En Resumen, el Total OT corresponde al monto disponible para la OT,
  // no al monto de respaldo previo a la aplicación del porcentaje.
  const totalOtLocal = Math.max(parseNumericValue(detalleOcActiva?.totalMontoVisiblePorMoneda ?? 0), 0);
  const disponibleOtLocal = totalOtLocal - montoPlanillaPagadoOt;
  const consumoOtPercent = getConsumptionPercent(totalOtLocal, disponibleOtLocal);
  const totalDetalleConversionSoles = resumenOtMonedas.reduce((total, resumen) => {
    const montoNativo = parseNumericValue(resumen.montoPlanilla ?? 0);
    const monedaNormalizada = normalizeText(resumen.moneda);
    const esDolar = monedaNormalizada.includes("dolar") || monedaNormalizada.includes("usd");
    return total + (esDolar ? montoNativo * tipoCambioLocal : montoNativo);
  }, 0);
  const disponibleDetalleConversionSoles = totalOtLocal - totalDetalleConversionSoles;
  const tieneOtValida = Boolean(getValidOtValue(filaActiva?.ot));
  const estadoOcSeleccionado = filaActiva?.planillaRow
    ? getRecordString(
        filaActiva.planillaRow,
        "EstadoOC",
        "EstadoOc",
        "Estado_Oc",
        "Estado OC",
        "EstadoOrdenCompra",
        "NombreEstado"
      )
    : "";
  const estadosOrigenSeleccionado = filaActiva?.planillaRow
    ? Object.entries(filaActiva.planillaRow)
        .filter(([key]) => normalizeText(key).includes("estado"))
        .map(([, value]) => String(value ?? ""))
        .join(" ")
    : "";
  const estadoSeleccionadoOt = normalizeText(
    [filaActiva?.estadoNombre, filaActiva?.estadoCodigo, estadoOcSeleccionado, estadosOrigenSeleccionado]
      .filter(Boolean)
      .join(" ")
  );
  const esPagadoORechazadoOt =
    estadoSeleccionadoOt.includes("pagado") ||
    estadoSeleccionadoOt.includes("rechaz") ||
    /(^|\s)4(\s|$)/.test(estadoSeleccionadoOt) ||
    /(^|\s)2(\s|$)/.test(estadoSeleccionadoOt) ||
    filaActiva?.estadoCodigo === "4" ||
    filaActiva?.estadoCodigo === "2";
  const solicitadoOtAmount = esPagadoORechazadoOt ? 0 : Math.max(parseNumericValue(filaActiva?.subtotal ?? 0), 0);
  const montoPlanillaPagadoOc = parseNumericValue(consumoOc?.pagadoOc ?? detalleOcActiva?.montoPagadoOc ?? 0);
  const pagadoOcAmount = Math.max(montoPlanillaPagadoOc, 0);
  const solicitadoOcAmount = esPagadoORechazadoOt
    ? 0
    : Math.max(parseNumericValue(filaActiva?.subtotal ?? 0), 0);
  const totalOcAmount = Math.max(parseNumericValue(consumoOc?.totalOc ?? detalleOcActiva?.subtotalCabOrdenCompra ?? 0), 0);
  // El disponible de la OC no depende de un valor enviado por el store:
  // se obtiene de su total menos lo solicitado y lo ya pagado.
  const disponibleOcAmount = totalOcAmount - (solicitadoOcAmount + pagadoOcAmount);
  const consumoOcPercent = getConsumptionPercent(totalOcAmount, disponibleOcAmount);
  const pagadoOcPercent = totalOcAmount > 0 ? Math.min((pagadoOcAmount / totalOcAmount) * 100, 100) : 0;
  const solicitadoOcPercent = totalOcAmount > 0 ? Math.min((solicitadoOcAmount / totalOcAmount) * 100, 100 - pagadoOcPercent) : 0;
  const disponibleOcPercent = Math.max(100 - pagadoOcPercent - solicitadoOcPercent, 0);

  const totalsByCurrency = useMemo(() => {
    return visibleRows.reduce<Record<string, { subtotal: number; igv: number; total: number }>>((acc, row) => {
      const key = (row.moneda || "Sin moneda").trim();
      if (!acc[key]) {
        acc[key] = { subtotal: 0, igv: 0, total: 0 };
      }
      acc[key].subtotal += row.subtotal;
      acc[key].igv += row.igv;
      acc[key].total += row.total;
      return acc;
    }, {});
  }, [visibleRows]);

  // Rango de fechas de los registros que se están viendo (leyenda de la pestaña Aprobar).
  const rangoFechasVisibles = useMemo(() => {
    const keys = visibleRows
      .map((row) => toComparableDateKey(row.fecha))
      .filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key))
      .sort();
    if (keys.length === 0) {
      return null;
    }

    const toDisplay = (key: string) => key.split("-").reverse().join("/");
    return { desde: toDisplay(keys[0]), hasta: toDisplay(keys[keys.length - 1]) };
  }, [visibleRows]);

  const selectedRows = useMemo(() => {
    if (!checkedIds.length) {
      return [] as PagoRow[];
    }

    const selectedSet = new Set(checkedIds);
    return visibleRows.filter((row) => selectedSet.has(row.id));
  }, [checkedIds, visibleRows]);

  useEffect(() => {
    const previousIds = new Set(previousCheckedIdsRef.current);
    const rejectedOcRow = filteredRows.find(
      (row) => checkedIds.includes(row.id) && !previousIds.has(row.id) && row.idEstadoOc === 6
    );

    if (rejectedOcRow) {
      setMessage(
        `Información: la OC ${rejectedOcRow.idOc || "asociada"} está rechazada. Verifique esta condición antes de cambiar el estado del registro.`
      );
    }

    previousCheckedIdsRef.current = checkedIds;
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
  const summaryRowCount = checkedIds.length > 0 ? selectedRows.length : visibleRows.length;
  const summaryLabel = checkedIds.length > 0 ? "Seleccionados" : "Mostrando";

  useEffect(() => {
    const preferredTab = preferredDetailTabRef.current;
    preferredDetailTabRef.current = null;
    setDetailTab(preferredTab ?? "resumen");
  }, [selectedId, activeTab]);

  useEffect(() => {
    setResumenOtDetalle(null);
    setResumenOtLoading(false);
    setHistorialRows([]);
  }, [selectedId]);

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
          primary: { label: "Aprobar", icon: <CheckCircle2 size={18} />, color: "#1D4ED8", soft: "#EFF6FF", border: "#93C5FD" },
          secondary: { label: "Rechazar", icon: <XCircle size={18} />, color: "#DC2626", soft: "#FEF2F2", border: "#FCA5A5" },
          tertiary: { label: "Observar", icon: <AlertTriangle size={18} />, color: "#DC2626", soft: "#FEF2F2", border: "#FCA5A5" },
          quaternary: { label: "Ver PDF", icon: <Printer size={18} />, color: "#334155", soft: "#FFFFFF", border: "#CBD5E1" },
        };
      case "observadas":
        return {
          primary: { label: "Aprobar", icon: <CheckCircle2 size={18} />, color: "#2563EB", soft: "#EFF6FF", border: "#93C5FD" },
          secondary: { label: "Rechazar", icon: <XCircle size={18} />, color: "#DC2626", soft: "#FEF2F2", border: "#FCA5A5" },
          tertiary: { label: "Ver PDF", icon: <Printer size={18} />, color: "#334155", soft: "#FFFFFF", border: "#CBD5E1" },
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
  const isResumenTab = activeTab === "resumen";
  // El estado propio de Planilla sólo se expone en Total Órdenes; las demás
  // pestañas ya representan un estado operativo específico.
  const showEstadoPlanilla = activeTab === "resumen";
  const showTotalSitio = canUseTab("reaprobar");
  const toggleDetailForRow = (row: PagoRow) => {
    setSelectedId(row.id);
    setHistorialOcRows([]);
    setIsDetailPanelOpen((prev) => {
      const next = !prev;
      if (next) {
        setDetailTab("resumen");
      }
      return next;
    });
  };

  const openDetailForRow = (row: PagoRow) => {
    setSelectedId(row.id);
    setHistorialOcRows([]);
    setIsDetailPanelOpen(true);
    setDetailTab("resumen");
  };

  const openHistorialOtForRow = (row: PagoRow) => {
    preferredDetailTabRef.current = "historial";
    setSelectedId(row.id);
    setHistorialOcRows([]);
    setIsDetailPanelOpen(true);
    setDetailTab("historial");
  };

  const handleAction = (label: string) => {
    if (label === "Exportar") {
      handleExport();
      return;
    }

    if (checkedIds.length === 0) {
      setMessage("No exiten registros seleccionados");
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
      setIsDetailPanelOpen(true);
      setDetailTab("resumen");
      return;
    }
    if (label === "Ver observaciÃ³n") {
      setDetailTab("historial");
      return;
    }
    if (label === "Observar") {
      openObservacionModal(selectedRows);
      return;
    }
    if (label === "Aprobar") {
      setAprobarConfirm({
        rowsCount: selectedRows.length,
        codEstado: activeTab === "hormiga" ? 1 : 10,
        titulo: "Aprobar",
        mensaje: `¿Desea aprobar ${selectedRows.length} registro(s) seleccionado(s)?`,
      });
      return;
    }
    if (label === "Regularizar") {
      setRegularizarConfirm({ rowsCount: selectedRows.length });
      return;
    }
    if (label === "Re-aprobar") {
      setAprobarConfirm({
        rowsCount: selectedRows.length,
        // El SP interpreta 6 como segunda aprobación y realiza la
        // transición interna hacia el estado final 1.
        codEstado: 6,
        titulo: "Re-aprobar",
        mensaje: `¿Desea re-aprobar ${selectedRows.length} registro(s) seleccionado(s)?`,
      });
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
    if (label === "Rechazar") {
      openRechazoModal(selectedRows);
      return;
    }
    setMessage(`${label} ejecutado en modo demo.`);
  };

  const openRechazoModal = (rows: PagoRow[]) => {
    setRechazoModal({
      rows,
      observacion: "",
      submitting: false,
      error: null,
    });
  };

  const openObservacionModal = (rows: PagoRow[]) => {
    setObservacionModal({
      rows,
      observacion: "",
      submitting: false,
      error: null,
    });
  };

  const handleReloadWithExchangeRates = () => {
    setRefreshTick((current) => current + 1);
    setMessage("Actualizando todos los grids con los tipos de cambio ingresados...");
  };

  const abrirGasto = (row: PagoRow, modo: "ver" | "editar") => {
    const correlativo = Math.trunc(Number(row.correlativo));
    if (!Number.isFinite(correlativo) || correlativo <= 0) {
      setMessage("No se pudo identificar el correlativo del gasto.");
      return;
    }

    setGastoEditorRequest({ correlativo, mode: modo, planillaRow: row.planillaRow });
  };

  useEffect(() => {
    if (!gastoEditorRequest) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      setGastoEditorRequest(null);
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [gastoEditorRequest]);

  useEffect(() => {
    if (!detallePopup) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDetallePopup(null);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [detallePopup]);

  useEffect(() => {
    if (!isHistorialPopupOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (detallePopup) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setIsHistorialPopupOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [detallePopup, isHistorialPopupOpen]);

  const resetDetailStateAfterMutation = () => {
    resumenOtCacheRef.current.clear();
    historialOtCacheRef.current.clear();
    historialOcCacheRef.current.clear();
    setResumenOtDetalle(null);
    setHistorialRows([]);
    setHistorialOcRows([]);
    setHistorialLoading(false);
    setHistorialOcLoading(false);
  };

  const reloadAfterMutation = () => {
    // Las pestañas se cargan bajo demanda; no se deben reconstruir desde
    // Resumen porque aún puede no haberse consultado.
    tabRowsCacheRef.current.clear();
    setRefreshTick((current) => current + 1);
  };

  const refreshAfterApproval = (
    detalle: AprobacionResultadoDto[],
    procesados: number | undefined,
  ) => {
    const correlativosProcesados = new Set(
      detalle
        .filter((resultado) => resultado.exito && Number.isFinite(resultado.correlativo))
        .map((resultado) => Math.trunc(resultado.correlativo)),
    );

    // La respuesta del SP identifica exactamente los registros modificados.
    // Así se conserva la bandeja actual y se retiran solo sus filas ya
    // procesadas. Si el SP no devuelve el detalle completo, se mantiene la
    // recarga total como salvaguarda de consistencia.
    if (
      correlativosProcesados.size === 0 ||
      procesados === undefined ||
      correlativosProcesados.size !== procesados
    ) {
      reloadAfterMutation();
      return;
    }

    // Las otras bandejas pueden contener el estado destino; se invalidan para
    // que se consulten al abrirlas, sin bloquear al usuario recargando la
    // pestaña que acaba de procesar.
    tabRowsCacheRef.current.clear();
    setRowsByTab((previous) => ({
      ...previous,
      [activeTab]: previous[activeTab].filter(
        (row) => !correlativosProcesados.has(Math.trunc(Number(row.correlativo))),
      ),
    }));
    setKpiRefreshTick((current) => current + 1);
  };

  const resumirNoProcesados = (resultados: AprobacionResultadoDto[]) => {
    const noProcesados = resultados.filter((resultado) => !resultado.exito);
    if (!noProcesados.length) return "";
    const detalle = noProcesados
      .slice(0, 5)
      .map((resultado) => `${resultado.correlativo}: ${resultado.mensaje || "no procesado por el procedimiento"}`)
      .join(" · ");
    const restantes = noProcesados.length > 5 ? ` · y ${noProcesados.length - 5} más` : "";
    return ` Motivos: ${detalle}${restantes}.`;
  };

  const handleAprobarSeleccionados = async (
    idRegularizar: number = 0,
    omitirConfirmacion: boolean = false,
    codEstado: number = 10
  ) => {
    if (activeTab !== "aprobar" && activeTab !== "reaprobar" && activeTab !== "hormiga" && activeTab !== "observadas") {
      return;
    }

    if (selectedRows.length === 0) {
      setMessage("Seleccione al menos un registro para aprobar.");
      return;
    }

    if (!omitirConfirmacion) {
      const confirmacion = window.confirm(
        `¿Desea aprobar ${selectedRows.length} registro(s) seleccionado(s)?`
      );

      if (!confirmacion) {
        setMessage("Aprobación cancelada.");
        return;
      }
    }

    try {
      const response = await aprobarPlanillaMasiva(
        {
          codEstado,
          observacion: null,
          idRegularizar: Math.trunc(idRegularizar),
          registros: selectedRows.map((row) => ({
            correlativo: Math.trunc(Number(row.correlativo)),
            idSite: row.siteId,
            tipoMoneda: Math.trunc(Number(row.tipoMoneda ?? 0)),
          })),
        },
        { timeoutMs: 120000 }
      );

      const resumen = response?.resumen;
      const mensajes: string[] = [];

      if (resumen?.procesados != null) {
        mensajes.push(`${resumen.procesados} de ${selectedRows.length} registro(s) procesado(s).`);
      }

      if (resumen?.enviadosSegundaAprobacion && resumen.enviadosSegundaAprobacion > 0) {
        mensajes.push(`${resumen.enviadosSegundaAprobacion} registro(s) fueron enviados a segunda aprobación.`);
      }

      if (resumen?.noProcesados && resumen.noProcesados > 0) {
        mensajes.push(`${resumen.noProcesados} registro(s) no pudieron ser procesados.${resumirNoProcesados(response?.detalle ?? [])}`);
      }

      if (mensajes.length === 0) {
        mensajes.push("Operación realizada correctamente.");
      }

      resetDetailStateAfterMutation();
      setCheckedIds([]);
      setSelectedId(0);
      setMessage(mensajes.join(" "));
      refreshAfterApproval(response?.detalle ?? [], resumen?.procesados);
    } catch (error) {
      setMessage(getHttpErrorMessage(error, "No se pudo completar la aprobación."));
    }
  };

  const handleRechazarSeleccionados = async () => {
    if (!rechazoModal) {
      return;
    }

    const observacion = rechazoModal.observacion.trim();
    if (!observacion) {
      setRechazoModal((prev) =>
        prev ? { ...prev, error: "Debe ingresar una observación para rechazar." } : prev
      );
      return;
    }

    if (rechazoModal.rows.length === 0) {
      setRechazoModal((prev) =>
        prev ? { ...prev, error: "Seleccione al menos un registro para rechazar." } : prev
      );
      return;
    }

    try {
      setRechazoModal((prev) => (prev ? { ...prev, submitting: true, error: null } : prev));

      for (const row of rechazoModal.rows) {
        await rechazarPlanilla(
          {
            correlativo: Math.trunc(Number(row.correlativo)),
            idSite: row.siteId,
            observacion,
          },
          { timeoutMs: 120000 }
        );
      }

      const total = rechazoModal.rows.length;
      resetDetailStateAfterMutation();
      setCheckedIds([]);
      setSelectedId(0);
      setRechazoModal(null);
      setMessage(
        total === 1
          ? "1 registro rechazado correctamente."
          : `${total} registros rechazados correctamente.`
      );
      reloadAfterMutation();
    } catch (error) {
      setRechazoModal((prev) =>
        prev
          ? {
              ...prev,
              submitting: false,
              error: getHttpErrorMessage(error, "No se pudo rechazar el registro."),
            }
          : prev
      );
    }
  };

  const handleCancelarRechazo = () => {
    setRechazoModal(null);
  };

  const handleObservarSeleccionados = async () => {
    if (!observacionModal) {
      return;
    }

    const observacion = observacionModal.observacion.trim();
    if (!observacion) {
      setObservacionModal((prev) =>
        prev ? { ...prev, error: "Debe ingresar una observación para observar." } : prev
      );
      return;
    }

    if (observacionModal.rows.length === 0) {
      setObservacionModal((prev) =>
        prev ? { ...prev, error: "Seleccione al menos un registro para observar." } : prev
      );
      return;
    }

    try {
      setObservacionModal((prev) => (prev ? { ...prev, submitting: true, error: null } : prev));

      const response = await aprobarPlanillaMasiva(
        {
          codEstado: 2,
          observacion,
          idRegularizar: 0,
          registros: observacionModal.rows.map((row) => ({
            correlativo: Math.trunc(Number(row.correlativo)),
            idSite: row.siteId,
            tipoMoneda: Math.trunc(Number(row.tipoMoneda ?? 0)),
          })),
        },
        { timeoutMs: 120000 }
      );

      const total = observacionModal.rows.length;
      resetDetailStateAfterMutation();
      setCheckedIds([]);
      setSelectedId(0);
      setObservacionModal(null);
      setMessage(
        total === 1
          ? "1 registro observado correctamente."
          : `${total} registros observados correctamente.`
      );
      reloadAfterMutation();
    } catch (error) {
      setObservacionModal((prev) =>
        prev
          ? {
              ...prev,
              submitting: false,
              error: getHttpErrorMessage(error, "No se pudo observar el registro."),
            }
          : prev
      );
    }
  };

  const handleCancelarObservacion = () => {
    setObservacionModal(null);
  };

  const handleConfirmarAprobacion = async () => {
    if (!aprobarConfirm) {
      return;
    }

    const { codEstado } = aprobarConfirm;
    setAprobarConfirm(null);
    await handleAprobarSeleccionados(0, true, codEstado);
  };

  const handleCancelarAprobacion = () => {
    setAprobarConfirm(null);
  };

  const handleConfirmarRegularizacion = async () => {
    if (!regularizarConfirm) {
      return;
    }

    setRegularizarConfirm(null);
    await handleAprobarSeleccionados(1, true);
  };

  const handleCancelarRegularizacion = () => {
    setRegularizarConfirm(null);
  };

  function handleExport() {
    // Mantener el Excel en la misma secuencia de columnas que la grilla.
    // Las columnas que son barras visuales se exportan como su porcentaje.
    const headers = [
      "Correlativo",
      "Fecha",
      "Cliente",
      "Proyecto",
      "Site",
      "Tipo trabajo",
      "Tarea",
      "Responsable",
      "OC",
      "Estado OC",
      "Subtotal",
      "IGV",
      "Total",
      "Moneda",
      "Detalle",
      "Total Gastado",
      ...(showTotalSitio ? ["Total Sitio"] : []),
      "Total Visible",
      "% Avance",
      "Avance",
      ...(showTotalSitio ? ["Sub Ficticio", "% Ficticio", "Avance ficticio"] : []),
      ...(showEstadoPlanilla ? ["Estado planilla"] : []),
      "Validador",
      "OT",
      "ATP",
      "Status PAP",
    ];
    const rows = visibleRows.map((row) => {
      const estadoOc = row.estadoOcSemaforo?.trim().toUpperCase() ?? "";
      const estadoOcDisplay = estadoOc === "P" ? "-" : estadoOc;
      const totalGastado = row.totalPagadoConvertidoSoles ?? 0;
      const totalSitio = row.totalMontoBckPorMoneda ?? 0;
      const totalVisible = row.totalMontoVisiblePorMoneda ?? 0;
      const porcentajeAvance = totalVisible > 0 ? (totalGastado / totalVisible) * 100 : 0;
      const subFicticio = totalGastado + row.subtotal;
      const porcentajeFicticio = totalVisible > 0 ? (subFicticio / totalVisible) * 100 : 0;

      return [
        row.correlativo,
        formatDate(row.fecha),
        row.cliente,
        row.proyecto,
        row.site,
        row.tipoTrabajo,
        row.tarea,
        row.responsable,
        String(row.idOc || row.documento || "-").trim().toUpperCase() === "S/O"
          ? "-"
          : row.idOc || row.documento || "-",
        estadoOcDisplay || "-",
        row.subtotal,
        row.igv,
        row.total,
        row.moneda || "-",
        row.detalle?.trim() || "-",
        totalGastado,
        ...(showTotalSitio ? [totalSitio] : []),
        totalVisible,
        porcentajeAvance,
        porcentajeAvance,
        ...(showTotalSitio ? [subFicticio, porcentajeFicticio, porcentajeFicticio] : []),
        ...(showEstadoPlanilla ? [row.estadoNombre || getStatusLabel(row.estado)] : []),
        row.validador || "-",
        row.ot || "-",
        row.atp || "-",
        row.statusPap || "-",
      ];
    });

    exportToExcel(
      `pagos_v2_${activeTab}_${new Date().toISOString().slice(0, 10)}.xlsx`,
      headers,
      rows
    );
    setMessage(`Exportación a Excel lista: ${rows.length} registros y todas sus columnas.`);
  }

  function handleExportHistorial() {
    const rows = historialRowsFiltrados.map((row) => [
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
      row.siteId,
      row.corSite || "-",
      row.tarea,
      row.cliente,
      row.proyecto,
      row.site,
      row.tipoTrabajo,
    ]);

    exportToExcel(
      `pagos_v2_historial_${historialOtSeleccionada || "ot"}_${new Date().toISOString().slice(0, 10)}.xlsx`,
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
        "Site ID",
        "CorSite",
        "Tarea",
        "Cliente",
        "Proyecto",
        "Site",
        "Tipo Trabajo",
        "Detalle",
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
      row.detalle,
    ]);

    exportToExcel(
      `pagos_v2_historial_oc_${historialOcSeleccionada || "oc"}_${new Date().toISOString().slice(0, 10)}.xlsx`,
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
        "Detalle",
      ],
      rows
    );
  }

  const handleHistorialSortColumn = (column: PagoSortColumn) => {
    setHistorialSortConfig((current) =>
      current?.column === column
        ? { column, direction: current.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "asc" }
    );
  };

  const linkStyle: React.CSSProperties = { color: "#2563EB", cursor: "pointer", textDecoration: "underline" };
  const avanceColor = (percent: number) => (percent > 70 ? "#DC2626" : percent >= 50 ? "#CA8A04" : "#16A34A");
  const calcSubFicticio = (row: PagoRow) => (row.totalPagadoConvertidoSoles ?? 0) + row.subtotal;
  const calcFicticio = (row: PagoRow) => {
    const visible = row.totalMontoVisiblePorMoneda ?? 0;
    return visible > 0 ? (calcSubFicticio(row) / visible) * 100 : 0;
  };
  const barCell = (percent: number) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 16 }}>
      <div title={formatPercent(percent)} style={{ width: 112, height: 8, borderRadius: 999, background: "#E2E8F0", overflow: "hidden" }}>
        <div style={{ width: `${Math.max(0, Math.min(percent, 100))}%`, height: "100%", borderRadius: "inherit", background: avanceColor(percent) }} />
      </div>
    </div>
  );

  const mainColumns: GridColumn<PagoRow>[] = [
    {
      dataField: "correlativo",
      caption: "Correlativo",
      width: 110,
      fixed: true,
      cellRender: (_v, row) => (
        <span
          title="Visualizar gasto"
          style={linkStyle}
          onClick={(event) => {
            event.stopPropagation();
            abrirGasto(row, "ver");
          }}
        >
          {row.correlativo}
        </span>
      ),
    },
    { dataField: "fecha", caption: "Fecha", dataType: "date", width: 100, calculateCellValue: (row) => toComparableDateKey(row.fecha) },
    { dataField: "solicitante", caption: "Solicitante", width: 170, groupIndex: 0, sortOrder: "asc" },
    { dataField: "cliente", caption: "Cliente", width: 110 },
    { dataField: "proyecto", caption: "Proyecto", width: 130 },
    { dataField: "site", caption: "Site", width: 170 },
    { dataField: "tipoTrabajo", caption: "Tipo trabajo", width: 120 },
    { dataField: "tarea", caption: "Tarea", width: 130, calculateCellValue: (row) => row.tarea || "-" },
    { dataField: "responsable", caption: "Responsable", width: 150 },
    {
      dataField: "idOc",
      caption: "OC",
      width: 90,
      calculateCellValue: (row) => {
        const oc = String(row.idOc || row.documento || "").trim();
        return !oc || oc.toUpperCase() === "S/O" ? "-" : oc;
      },
      cellRender: (value, row) => (
        <span
          title={String(value)}
          style={linkStyle}
          onClick={(event) => {
            event.stopPropagation();
            toggleDetailForRow(row);
          }}
        >
          {String(value)}
        </span>
      ),
    },
    {
      dataField: "estadoOcSemaforo",
      caption: "Estado OC",
      width: 90,
      alignment: "center",
      calculateCellValue: (row) => {
        const code = row.estadoOcSemaforo?.trim().toUpperCase() ?? "";
        return (code === "P" ? "-" : code) || "-";
      },
      cellStyle: (_v, row) => {
        const code = row.estadoOcSemaforo?.trim().toUpperCase() ?? "";
        const color = COLORES_ESTADO_OC[code];
        return {
          background: color ?? "#FFFFFF",
          color: ["2", "P"].includes(code) ? "#1F2937" : color ? "#FFFFFF" : undefined,
          fontWeight: 800,
        };
      },
    },
    { dataField: "subtotal", caption: "Subtotal", dataType: "number", width: 130, cellStyle: () => ({ fontWeight: 900 }), cellRender: (_v, row) => formatCurrency(row.subtotal, row.moneda) },
    { dataField: "igv", caption: "IGV", dataType: "number", width: 100, cellRender: (_v, row) => formatCurrency(row.igv, row.moneda) },
    { dataField: "total", caption: "Total", dataType: "number", width: 120, cellRender: (_v, row) => formatCurrency(row.total, row.moneda) },
    { dataField: "moneda", caption: "Moneda", width: 90, calculateCellValue: (row) => row.moneda || "-" },
    {
      dataField: "detalle",
      caption: "Detalle",
      width: 200,
      calculateCellValue: (row) => row.detalle?.trim() || "-",
      cellRender: (value, row) => (
        <span
          title={String(value)}
          style={linkStyle}
          onClick={(event) => {
            event.stopPropagation();
            setDetallePopup({ correlativo: row.correlativo, detalle: String(value) });
          }}
        >
          {String(value)}
        </span>
      ),
    },
    {
      dataField: "totalGastado",
      caption: "Total Gastado",
      dataType: "number",
      width: 160,
      calculateCellValue: (row) => row.totalPagadoConvertidoSoles ?? 0,
      cellRender: (value, row) => (
        <span
          title="Ver detalle de la orden"
          style={linkStyle}
          onClick={(event) => {
            event.stopPropagation();
            openHistorialOtForRow(row);
          }}
        >
          {formatCurrency(Number(value), "SOLES")}
        </span>
      ),
    },
    {
      dataField: "totalSitio",
      caption: "Total Sitio",
      dataType: "number",
      width: 170,
      visible: showTotalSitio,
      calculateCellValue: (row) => row.totalMontoBckPorMoneda ?? 0,
      cellRender: (value, row) => formatCurrency(Number(value), row.moneda),
    },
    {
      dataField: "totalVisible",
      caption: "Total Visible",
      dataType: "number",
      width: 170,
      calculateCellValue: (row) => row.totalMontoVisiblePorMoneda ?? 0,
      cellRender: (value, row) => formatCurrency(Number(value), row.moneda),
    },
    {
      dataField: "subFicticio",
      caption: "Sub Ficticio",
      dataType: "number",
      width: 170,
      visible: showTotalSitio,
      calculateCellValue: calcSubFicticio,
      cellRender: (value) => formatCurrency(Number(value), "SOLES"),
    },
    {
      dataField: "pctFicticio",
      caption: "% Ficticio",
      dataType: "number",
      width: 100,
      visible: showTotalSitio,
      calculateCellValue: calcFicticio,
      cellRender: (value) => <span style={{ color: avanceColor(Number(value)) }}>{formatPercent(Number(value))}</span>,
    },
    {
      dataField: "avanceFicticio",
      caption: "Avance ficticio",
      width: 140,
      visible: showTotalSitio,
      allowFiltering: false,
      allowHeaderFilter: false,
      calculateCellValue: calcFicticio,
      cellRender: (value) => barCell(Number(value)),
    },
    {
      dataField: "estadoNombre",
      caption: "Estado planilla",
      width: 130,
      visible: showEstadoPlanilla,
      calculateCellValue: (row) => row.estadoNombre || getStatusLabel(row.estado),
      cellRender: (value, row) => {
        const rowTheme = getStateColor(row.estado);
        return (
          <span style={{ ...styles.stateBadge, color: rowTheme.accent, background: rowTheme.soft, borderColor: rowTheme.border }}>
            {String(value)}
          </span>
        );
      },
    },
    { dataField: "validador", caption: "Validador", width: 130, calculateCellValue: (row) => row.validador || "-" },
    { dataField: "ot", caption: "OT", width: 100, calculateCellValue: (row) => row.ot || "-" },
    { dataField: "atp", caption: "ATP", width: 120, calculateCellValue: (row) => row.atp || "-" },
    { dataField: "statusPap", caption: "Status PAP", width: 130, calculateCellValue: (row) => row.statusPap || "-" },
    {
      dataField: "acciones",
      caption: "Acciones",
      width: 150,
      alignment: "center",
      allowSorting: false,
      allowFiltering: false,
      allowGrouping: false,
      allowHeaderFilter: false,
      allowSearch: false,
      calculateCellValue: () => "",
      cellRender: (_v, row) => {
        const accionesHabilitadas = !["99", "3", "4", "5", "8"].includes(row.estadoCodigo ?? "");
        const actionStyle = (enabled: boolean, color: string, background: string, border: string): React.CSSProperties => ({
          ...styles.compactActionButton,
          width: 24,
          height: 24,
          padding: 0,
          color: enabled ? color : "#9CA3AF",
          background: enabled ? background : "#F3F4F6",
          borderColor: enabled ? border : "#E5E7EB",
          opacity: enabled ? 1 : 0.65,
          cursor: enabled ? "pointer" : "not-allowed",
        });
        return (
          <div style={{ display: "flex", justifyContent: "center", gap: 4 }}>
            <button type="button" title="Visualizar gasto" aria-label={`Visualizar gasto ${row.correlativo}`} onClick={(event) => { event.stopPropagation(); abrirGasto(row, "ver"); }} style={actionStyle(true, "#2563EB", "#EFF6FF", "#93C5FD")}>
              <Eye size={14} />
            </button>
            <button type="button" title="Ver detalle de la orden" aria-label={`Ver detalle de la orden ${row.idOc || row.documento || ""}`} onClick={(event) => { event.stopPropagation(); openDetailForRow(row); }} style={actionStyle(true, "#0F766E", "#F0FDFA", "#99F6E4")}>
              <ReceiptText size={14} />
            </button>
            <button type="button" title={accionesHabilitadas ? "Modificar gasto" : "Modificar no disponible para el estado actual"} aria-label={`Modificar gasto ${row.correlativo}`} disabled={!accionesHabilitadas} onClick={(event) => { event.stopPropagation(); if (accionesHabilitadas) abrirGasto(row, "editar"); }} style={actionStyle(accionesHabilitadas, "#3730A3", "#EEF2FF", "#C7D2FE")}>
              <Pencil size={14} />
            </button>
            <button type="button" title={accionesHabilitadas ? "Rechazar gasto" : "Rechazar no disponible para el estado actual"} aria-label={`Rechazar gasto ${row.correlativo}`} disabled={!accionesHabilitadas} onClick={(event) => { event.stopPropagation(); if (accionesHabilitadas) openRechazoModal([row]); }} style={actionStyle(accionesHabilitadas, "#B91C1C", "#FEF2F2", "#FECACA")}>
              <Trash2 size={14} />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <AppPage title="Pagos" fillHeight style={{ padding: "4px 8px 0" }}>
      <div style={styles.page}>
        <style>{`
          .pagos-v1-selected-row > td {
            border-top: 2px solid #2563EB !important;
            border-bottom: 2px solid #2563EB !important;
          }
          .pagos-v1-selected-row > td:first-child {
            border-left: 2px solid #2563EB !important;
          }
          .pagos-v1-selected-row > td:last-child {
            border-right: 2px solid #2563EB !important;
          }
          .pagos-v1-main-grid .pagos-v1-data-row > td {
            font-size: 15px !important;
          }
        `}</style>
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
              {activeTab === "aprobar" && rangoFechasVisibles ? (
                <div style={styles.rangoFechasLeyenda} role="status">
                  Registros del <strong>{rangoFechasVisibles.desde}</strong> al <strong>{rangoFechasVisibles.hasta}</strong>
                </div>
              ) : null}

            </div>

            <div style={styles.metricsStrip}>
              <KpiCard
                label="Aprobar"
                value={tabStats.aprobar}
                accent="#F59E0B"
                soft="#FFFBEB"
                border="#FCD34D"
                icon={<ReceiptText size={14} />}
                selected={activeTab === "aprobar"}
                disabled={!canUseTab("aprobar")}
                onClick={() => canUseTab("aprobar") && setActiveTab("aprobar")}
              />
              <KpiCard
                label="Re-aprobar"
                value={tabStats.reaprobar}
                accent="#2563EB"
                soft="#EFF6FF"
                border="#93C5FD"
                icon={<RotateCcw size={14} />}
                selected={activeTab === "reaprobar"}
                disabled={!canUseTab("reaprobar")}
                onClick={() => canUseTab("reaprobar") && setActiveTab("reaprobar")}
              />
              <KpiCard
                label="Hormiga"
                value={tabStats.hormiga}
                accent="#059669"
                soft="#F0FDF4"
                border="#86EFAC"
                icon={<HandCoins size={14} />}
                selected={activeTab === "hormiga"}
                disabled={!canUseTab("hormiga")}
                onClick={() => canUseTab("hormiga") && setActiveTab("hormiga")}
              />
              <KpiCard
                label="Observadas"
                value={tabStats.observadas}
                accent="#DC2626"
                soft="#FEF2F2"
                border="#FCA5A5"
                icon={<AlertTriangle size={14} />}
                selected={activeTab === "observadas"}
                disabled={!canUseTab("observadas")}
                onClick={() => canUseTab("observadas") && setActiveTab("observadas")}
              />
              <KpiCard
                label="Total Órdenes"
                value={tabStats.resumen}
                accent="#7C3AED"
                soft="#F5F3FF"
                border="#C4B5FD"
                icon={<ShieldCheck size={14} />}
                selected={activeTab === "resumen"}
                onClick={() => setActiveTab("resumen")}
              />
            </div>
          </div>
        </section>
        {message ? (
          <div
            role="status"
            style={{
              margin: "10px 0",
              padding: "10px 14px",
              border: `1px solid ${currentTheme.border}`,
              borderRadius: 10,
              background: "#FFFFFF",
              color: "#334155",
              fontSize: 13,
              lineHeight: 1.45,
            }}
          >
            {message}
          </div>
        ) : null}

          <section
            style={{
              ...styles.mainGrid,
              gridTemplateColumns: isDetailPanelOpen ? "minmax(0, 1fr) 580px" : "minmax(0, 1fr)",
            }}
          >
          <div style={styles.leftColumn}>
            <div style={styles.gridCard}>
            <DataGridPro<PagoRow>
              key={activeTab}
              className="pagos-v1-main-grid"
              dataSource={filteredRows}
              onVisibleRowsChange={setGridRows}
              keyExpr="id"
              columns={mainColumns}
              height="fill"
              loading={loadingData}
              noDataText="No se encontraron registros con los filtros seleccionados."
              stateStoringKey={`pagos-v2-${activeTab}`}
              selection="multiple"
              selectedKeys={checkedIds.map(String)}
              onSelectionChanged={(keys) => setCheckedIds(keys.map(Number))}
              focusedRowKey={String(selectedId)}
              onRowClick={(row) => setSelectedId(row.id)}
              autoExpandAll={false}
              paging={{ pageSize: 100, pageSizes: [50, 100, 250, 500] }}
              exportFileName={`pagos_v2_${activeTab}`}
              allowExport={false}
              rowAlternation={false}
              rowPadding="2px 8px"
              rowClassName={(row) => `pagos-v1-data-row${row.id === selectedId ? " pagos-v1-selected-row" : ""}`}
              rowBackground={(row, focused) => {
                const exceeded = (row.totalSubtotalPorMoneda ?? 0) > (row.totalMontoBckPorMoneda ?? 0);
                if (exceeded) return focused ? "#FECACA" : "#FFF1F2";
                return focused ? "#DBEAFE" : "#FFFFFF";
              }}
              rowStyle={(row) => (row.idEstadoOc === 6 ? { color: "#B91C1C" } : undefined)}
              groupSummaryRender={({ rows }) => {
                const totals = rows.reduce<Record<string, { subtotal: number; igv: number; total: number }>>((acc, row) => {
                  const key = (row.moneda || "Sin moneda").trim();
                  acc[key] ??= { subtotal: 0, igv: 0, total: 0 };
                  acc[key].subtotal += row.subtotal;
                  acc[key].igv += row.igv;
                  acc[key].total += row.total;
                  return acc;
                }, {});
                return (
                  <span style={{ marginLeft: 12, fontSize: 12, color: "#475569" }}>
                    {Object.entries(totals).map(([currency, amounts]) => (
                      <span key={currency} style={{ marginRight: 12 }}>
                        {currency}: <strong>Subtotal {formatCurrency(amounts.subtotal, currency)} | IGV {formatCurrency(amounts.igv, currency)} | Total {formatCurrency(amounts.total, currency)}</strong>
                      </span>
                    ))}
                  </span>
                );
              }}
            />

            <div style={styles.gridFooter}>
              <div style={styles.gridFooterText}>
                {summaryLabel} {summaryRowCount} registros de {activeRows.length} en {TAB_THEME[activeTab].label}
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

          </div>

          {isDetailPanelOpen ? (
          <aside style={styles.ocDataCard}>
            {filaActiva && detalleOcActiva ? (
              <>
                <div style={styles.ocDataHeader}>
                  <div>
                    <div style={{ ...styles.sectionKicker, color: currentTheme.accent }}>Detalles del registro</div>
                    <h2 style={styles.detailTitleSmall}>Orden de Pago N° {filaActiva.correlativo}</h2>
                  </div>
                  <div style={styles.detailHeaderTools}>
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
                    <button
                      type="button"
                      onClick={() => setIsDetailPanelOpen(false)}
                      style={{
                        ...styles.detailExpandButton,
                        color: currentTheme.accent,
                        background: "#FFFFFF",
                        borderColor: currentTheme.border,
                      }}
                      aria-label="Contraer detalle"
                      title="Contraer detalle"
                    >
                      <Minimize2 size={16} />
                    </button>
                  </div>
                </div>

                <div style={styles.detailTabs}>
                  {[ 
                    { key: 'orden' as DetailTabKey, label: 'Detalle' },
                    { key: 'resumen' as DetailTabKey, label: 'Resumen' },
                    { key: 'historial' as DetailTabKey, label: 'Historial Sitio' },
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
                      <div style={styles.noteTitle}>Detalle</div>
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
                    {resumenOtLoading ? (
                      <div
                        style={{
                          ...styles.noteCard,
                          borderColor: "#BFDBFE",
                          background: "#EFF6FF",
                          color: "#1D4ED8",
                          marginBottom: 10,
                        }}
                      >
                        <div style={styles.noteTitle}>Cargando resumen</div>
                        <p style={styles.noteText}>
                          Se está consultando el resumen de la OT seleccionada sin recargar el resto de la pantalla.
                        </p>
                      </div>
                    ) : null}
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
                              {tieneOtValida && detalleOcActiva.ot
                                ? `Consumo de la OT N° ${detalleOcActiva.ot}`
                                : "Consumo de la OT"}
                            </div>
                           
                          </div>
                          <div style={styles.ocProgressValue}>{tieneOtValida ? (consumoOtLoading ? "Cargando..." : formatPercent(consumoOtPercent)) : "-"}</div>
                        </div>
                        <div style={styles.progressTrack}>
                          <div
                            style={{
                              ...styles.progressFill,
                              width: `${tieneOtValida && !consumoOtLoading ? consumoOtPercent : 0}%`,
                              background: getConsumptionBarColor(consumoOtPercent),
                            }}
                          />
                        </div>
                          <div style={styles.ocProgressFooter}>
                          <div style={styles.ocProgressFooterLine}>
                            <span>Solicitado:</span>
                            <span>{tieneOtValida ? formatCurrency(solicitadoOtAmount, detalleOcActiva.moneda) : "-"}</span>
                          </div>
                          {tieneOtValida && resumenOtMonedas.length > 0 ? (
                            <div style={styles.otConversionDetail}>
                              <span style={styles.otConversionTitle}>Detalle de conversión</span>
                              {resumenOtMonedas.length > 1 ? resumenOtMonedas.map((resumen, index) => {
                                const montoNativo = parseNumericValue(resumen.montoPlanilla ?? 0);
                                const esDolar = normalizeText(resumen.moneda).includes("dolar") ||
                                  normalizeText(resumen.moneda).includes("usd");

                                return (
                                  <div key={`${resumen.moneda}-${index}`}>
                                    <div style={styles.ocProgressFooterLine}>
                                      <span>{esDolar ? "US$ — pagos nativos en dólares" : "S/ — pagos nativos en soles"}</span>
                                      <span>{formatCurrency(montoNativo, resumen.moneda)}</span>
                                    </div>
                                    {esDolar ? (
                                      <div style={styles.ocProgressFooterLine}>
                                        <span>Equivalente en soles (TC {formatMoney(tipoCambioLocal)}):</span>
                                        <span>{formatCurrency(montoNativo * tipoCambioLocal, "SOLES")}</span>
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              }) : null}
                              <div
                                style={{
                                  ...styles.ocProgressFooterLine,
                                  marginTop: 6,
                                  paddingTop: 6,
                                  borderTop: "1px solid #CBD5E1",
                                  fontWeight: 900,
                                }}
                              >
                                <span>Pagado convertido a soles:</span>
                                <span>{formatCurrency(totalDetalleConversionSoles, "SOLES")}</span>
                              </div>
                              <div style={styles.ocProgressFooterLine}>
                                <span>Total OT:</span>
                                <span>{formatCurrency(totalOtLocal, "SOLES")}</span>
                              </div>
                              <div style={styles.ocProgressFooterLine}>
                                <span>Disponible convertido a soles:</span>
                                <span>{formatCurrency(disponibleDetalleConversionSoles, "SOLES")}</span>
                              </div>
                            </div>
                          ) : null}
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
                              title={`Disponible OC: ${formatCurrency(disponibleOcAmount, detalleOcActiva.moneda)}`}
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
                            <span>{formatCurrency(disponibleOcAmount, detalleOcActiva.moneda)}</span>
                          </div>
                          <div style={styles.ocProgressFooterLine}>
                            <span>Total OC:</span>
                            <span>{formatCurrency(totalOcAmount, detalleOcActiva.moneda)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                  </>
                ) : null}

                {detailTab === 'con-pagado' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={styles.ocTopGrid}>
                      <InfoField label="Cliente" value={filaActiva.cliente} />
                      <InfoField label="Proyecto" value={filaActiva.proyecto} />
                      <InfoField label="Site" value={filaActiva.site} />
                      <InfoField label="Tipo trabajo" value={filaActiva.tipoTrabajo} />
                    </div>
                    <div style={styles.noteCard}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <div style={styles.noteTitle}>Con Pagado</div>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>
                            Registros: {conPagadoRows.length}
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsConPagadoPopupOpen(true)}
                            style={{ ...styles.compactActionButton, borderColor: currentTheme.border, color: currentTheme.accent }}
                            title="Ampliar Con Pagado"
                          >
                            <Maximize2 size={16} />
                            Ampliar
                          </button>
                        </div>
                      </div>
                      <p style={styles.noteText}>
                        Registros del cliente seleccionado para el proyecto, site y tipo de trabajo de la orden.
                      </p>
                      {conPagadoResumenPorMoneda.length > 0 ? (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                            marginBottom: 14,
                            padding: 12,
                            border: "1px solid #DBEAFE",
                            borderRadius: 10,
                            background: "#F8FBFF",
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 900, color: "#1E3A8A" }}>
                            Subtotal acumulado vs. Total OT
                          </div>
                          {conPagadoResumenPorMoneda.map((item) => (
                            <div key={item.moneda} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11, fontWeight: 800, color: "#334155" }}>
                                <span>{item.moneda}</span>
                                <span>Pagado: {formatPercent(item.pagadoPorcentaje)} · Solicitante: {formatPercent(item.porcentaje)}</span>
                              </div>
                              <div style={styles.progressTrack}>
                                <div style={styles.ocProgressSegments}>
                                  <div
                                    style={{ ...styles.ocProgressSegment, width: `${item.pagadoPorcentaje}%`, background: "#2563EB" }}
                                    title={`Pagado OT: ${formatCurrency(item.pagadoOt, item.moneda)}`}
                                  />
                                  <div
                                    style={{
                                      ...styles.ocProgressSegment,
                                      width: `${item.porcentaje}%`,
                                      background: "#F59E0B",
                                    }}
                                    title={`Subtotal solicitante: ${formatCurrency(item.subtotal, item.moneda)}`}
                                  />
                                </div>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 11, color: "#475569" }}>
                                <span>Subtotal solicitante: {formatCurrency(item.subtotal, item.moneda)}</span>
                                <span>Pagado OT: {formatCurrency(item.pagadoOt, item.moneda)}</span>
                                <span>Total OT: {item.totalOt > 0 ? formatCurrency(item.totalOt, item.moneda) : "-"}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {conPagadoLoading ? (
                        <p style={styles.noteText}>Cargando registros...</p>
                      ) : (
                        <div style={styles.gridScrollable}>
                          <table style={{ ...styles.table, minWidth: 1110, width: "max-content" }}>
                            <thead>
                              <tr>
                                <th style={styles.th}>Correlativo</th>
                                <th style={styles.th}>Cliente</th>
                                <th style={styles.th}>Proyecto</th>
                                <th style={styles.th}>Site ID</th>
                                <th style={styles.th}>Site</th>
                                <th style={styles.th}>Tipo trabajo</th>
                                <th style={styles.th}>Tarea</th>
                                <th style={styles.th}>Subtotal</th>
                                <th style={styles.th}>Moneda</th>
                                <th style={styles.th}>Solicitante</th>
                              </tr>
                            </thead>
                            <tbody>
                              {conPagadoRows.length === 0 ? (
                                <tr>
                                  <td colSpan={10} style={styles.emptyCell}>No hay registros para los criterios seleccionados.</td>
                                </tr>
                              ) : (
                                conPagadoRows.map((row, index) => (
                                  <tr key={`con-pagado-${row.id}-${index}`}>
                                    <td style={styles.td}>{row.correlativo || "-"}</td>
                                    <td style={styles.td}>{row.cliente || "-"}</td>
                                    <td style={styles.td}>{row.proyecto || "-"}</td>
                                    <td style={styles.td}>{row.siteId || "-"}</td>
                                    <td style={styles.td}>{row.site || "-"}</td>
                                    <td style={styles.td}>{row.tipoTrabajo || "-"}</td>
                                    <td style={styles.td}>{row.tarea || "-"}</td>
                                    <td style={{ ...styles.td, fontWeight: 800 }}>{formatCurrency(row.subtotal, row.moneda)}</td>
                                    <td style={styles.td}>{row.moneda || "-"}</td>
                                    <td style={styles.td}>{row.solicitante || "-"}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}

                {detailTab === 'historial' ? (
                  <div style={styles.historyPanel}>
                    <div style={styles.noteCard}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <div style={styles.noteTitle}>Historial Sitio</div>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <input
                            type="search"
                            value={historialResponsable}
                            onChange={(event) => setHistorialResponsable(event.target.value)}
                            aria-label="Filtrar historial de sitio por responsable"
                            placeholder="Buscar responsable..."
                            list="historial-ot-responsables"
                            style={{ ...styles.quickDateInput, minWidth: 180, height: 30, fontSize: 11 }}
                          />
                          <datalist id="historial-ot-responsables">
                            {historialResponsableOptions.map((responsable) => (
                              <option key={responsable} value={responsable}>{responsable}</option>
                            ))}
                          </datalist>
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
                            Registros: {historialRowsFiltrados.length}
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
                            onClick={() => {
                              setHistorialPopupView("listado");
                              setIsHistorialPopupOpen(true);
                            }}
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
                        Se muestran los registros pagados del mismo cliente, proyecto, site y tipo de trabajo.
                      </p>
                    </div>

                    {historialLoading ? (
                      <div
                        style={{
                          ...styles.noteCard,
                          borderColor: "#BFDBFE",
                          background: "#EFF6FF",
                          color: "#1D4ED8",
                          marginBottom: 10,
                        }}
                      >
                        <div style={styles.noteTitle}>Cargando historial Sitio</div>
                          <p style={styles.noteText}>Se está consultando el historial del cliente, proyecto, site y tipo de trabajo seleccionados.</p>
                      </div>
                    ) : null}

                    <div style={styles.gridScrollable}>
                      <table style={{ ...styles.table, minWidth: 1700, width: "max-content" }}>
                        <thead onClick={(event) => {
                          const column = (event.target as HTMLElement).closest<HTMLElement>("th")?.dataset.historialSort as PagoSortColumn | undefined;
                          if (column) handleHistorialSortColumn(column);
                        }}>
                          <tr>
                            <th data-historial-sort="correlativo" style={{ ...styles.th, width: 94, cursor: "pointer" }}>Correlativo</th>
                            <th data-historial-sort="fecha" style={{ ...styles.th, width: 80, cursor: "pointer" }}>Fecha</th>
                            <th data-historial-sort="cliente" style={{ ...styles.th, width: 60, cursor: "pointer" }}>Cliente</th>
                            <th data-historial-sort="proyecto" style={{ ...styles.th, width: 90, cursor: "pointer" }}>Proyecto</th>
                            <th data-historial-sort="site" style={{ ...styles.th, width: 140, cursor: "pointer" }}>Site</th>
                            <th data-historial-sort="tipoTrabajo" style={{ ...styles.th, width: 90, cursor: "pointer" }}>Tipo trabajo</th>
                            <th data-historial-sort="tarea" style={{ ...styles.th, width: 130, cursor: "pointer" }}>Tarea</th>
                            <th data-historial-sort="idOc" style={{ ...styles.th, width: 88, cursor: "pointer" }}>OC</th>
                            <th data-historial-sort="subtotal" style={{ ...styles.th, width: 90, cursor: "pointer" }}>Subtotal</th>
                            <th data-historial-sort="igv" style={{ ...styles.th, width: 90, cursor: "pointer" }}>IGV</th>
                            <th data-historial-sort="total" style={{ ...styles.th, width: 100, cursor: "pointer" }}>Total</th>
                            <th data-historial-sort="moneda" style={{ ...styles.th, width: 80, cursor: "pointer" }}>Moneda</th>
                            <th data-historial-sort="solicitante" style={{ ...styles.th, width: 150, cursor: "pointer" }}>Solicitante</th>
                            <th data-historial-sort="responsable" style={{ ...styles.th, width: 110, cursor: "pointer" }}>Responsable</th>
                            <th data-historial-sort="detalle" style={{ ...styles.th, width: 260, cursor: "pointer" }}>Detalle</th>
                            <th data-historial-sort="validador" style={{ ...styles.th, width: 110, cursor: "pointer" }}>Validador</th>
                            <th data-historial-sort="ot" style={{ ...styles.th, width: 88, cursor: "pointer" }}>OT</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historialRowsFiltrados.length === 0 ? (
                            <tr>
                              <td colSpan={17} style={styles.emptyCell}>
                                No hay registros para el cliente, proyecto, site y tipo de trabajo seleccionados.
                              </td>
                            </tr>
                          ) : (
                            historialRowsOrdenados.map((row) => (
                              <tr key={`hist-${row.id}`}>
                                <td style={styles.td}>{row.correlativo}</td>
                                <td style={styles.td}>{formatDate(row.fecha)}</td>
                                <td style={styles.td}>{row.cliente}</td>
                                <td style={styles.td}>{row.proyecto}</td>
                                <td style={styles.td}>{row.site}</td>
                                <td style={styles.td}>{row.tipoTrabajo}</td>
                                <td style={styles.td}>{row.tarea || '-'}</td>
                                <td style={styles.td}>{row.idOc || row.documento || '-'}</td>
                                <td style={{ ...styles.td, fontWeight: 900 }}>{formatCurrency(row.subtotal, row.moneda)}</td>
                                <td style={styles.td}>{formatCurrency(row.igv, row.moneda)}</td>
                                <td style={styles.td}>{formatCurrency(row.total, row.moneda)}</td>
                                <td style={styles.td}>{row.moneda || '-'}</td>
                                <td style={styles.td}>{row.solicitante || '-'}</td>
                                <td style={styles.td}>{row.responsable}</td>
                                <td
                                  title="Ver detalle completo"
                                  onClick={() => setDetallePopup({ correlativo: row.correlativo, detalle: row.detalle?.trim() || "-" })}
                                  style={{ ...styles.td, cursor: "pointer", color: "#2563EB", textDecoration: "underline" }}
                                >
                                  <span style={{ display: "block", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {row.detalle?.trim() || '-'}
                                  </span>
                                </td>
                                <td style={styles.td}>{row.validador || '-'}</td>
                                <td style={styles.td}>{row.ot || '-'}</td>
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

                    {historialOcLoading ? (
                      <div
                        style={{
                          ...styles.noteCard,
                          borderColor: "#BFDBFE",
                          background: "#EFF6FF",
                          color: "#1D4ED8",
                          marginBottom: 10,
                        }}
                      >
                        <div style={styles.noteTitle}>Cargando historial OC</div>
                        <p style={styles.noteText}>Se está consultando la historia filtrada de la OC seleccionada.</p>
                      </div>
                    ) : null}

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
                            <th style={{ ...styles.th, width: 260 }}>Detalle</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historialOcRows.length === 0 ? (
                            <tr>
                              <td colSpan={18} style={styles.emptyCell}>
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
                                <td style={styles.td}>{row.detalle || '-'}</td>
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
          ) : null}
        </section>
        <section style={styles.actionsBar}>
            <div style={styles.actionsCard}>
                  <div style={styles.actionsRow}>
              {isResumenTab ? (
                <button
                  type="button"
                  style={{ ...styles.slimActionButton, borderColor: currentTheme.border, color: currentTheme.accent }}
                  onClick={handleExport}
                >
                  <Download size={16} />
                  Exportar
                </button>
              ) : (
                <>
                  <ActionButton config={actionConfig.primary} onClick={() => handleAction(actionConfig.primary.label)} />
                  <ActionButton config={actionConfig.secondary} onClick={() => handleAction(actionConfig.secondary.label)} />
                  {actionConfig.tertiary.label !== "Ver PDF" ? (
                    <ActionButton config={actionConfig.tertiary} onClick={() => handleAction(actionConfig.tertiary.label)} />
                  ) : null}
                  {actionConfig.quaternary.label !== "Ver PDF" ? (
                    <ActionButton config={actionConfig.quaternary} onClick={() => handleAction(actionConfig.quaternary.label)} />
                  ) : null}
                  <button
                    type="button"
                    style={{ ...styles.slimActionButton, borderColor: currentTheme.border, color: currentTheme.accent }}
                    onClick={handleExport}
                  >
                    <Download size={16} />
                    Exportar
                  </button>
                </>
              )}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "nowrap", marginLeft: "auto", paddingLeft: 16 }}>
              {[
                { parametro: "USD", etiqueta: "TC S/ por US$", valor: tipoCambioUsd, setValor: setTipoCambioUsd },
                { parametro: "EUR", etiqueta: "TC S/ por EUR", valor: tipoCambioEur, setValor: setTipoCambioEur },
                { parametro: "DOP", etiqueta: "TC S/ por DOP", valor: tipoCambioDop, setValor: setTipoCambioDop },
                { parametro: "COP", etiqueta: "TC S/ por COP", valor: tipoCambioCop, setValor: setTipoCambioCop },
              ].map(({ parametro, etiqueta, valor, setValor }) => (
                <label key={parametro} style={styles.tipoCambioField}>
                  <span style={styles.tipoCambioLabel}>{etiqueta}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    inputMode="decimal"
                    value={valor}
                    onChange={(event) => setValor(event.target.value)}
                    style={styles.tipoCambioInput}
                    aria-label={etiqueta}
                  />
                </label>
              ))}
              <button
                type="button"
                onClick={handleReloadWithExchangeRates}
                disabled={loadingData}
                title="Recargar todos los grids con los tipos de cambio ingresados"
                style={{
                  ...styles.applyFiltersButton,
                  height: 34,
                  borderColor: currentTheme.border,
                  background: currentTheme.accent,
                  color: "#FFFFFF",
                  opacity: loadingData ? 0.65 : 1,
                  cursor: loadingData ? "wait" : "pointer",
                }}
              >
                <RotateCcw size={15} />
                Actualizar montos
              </button>
            </div>
            </div>
          </div>
        </section>
        {detallePopup ? (
          <div
            style={{ ...styles.popupOverlay, zIndex: 3100 }}
            onClick={() => setDetallePopup(null)}
            role="presentation"
          >
            <div
              style={{ ...styles.popupCard, width: "min(680px, calc(var(--app-vw) - 32px))", height: "auto", maxHeight: "min(560px, calc(var(--app-vh) - 32px))" }}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={`Detalle de la orden ${detallePopup.correlativo}`}
            >
              <div style={styles.popupHeader}>
                <div>
                  <div style={{ ...styles.sectionKicker, color: currentTheme.accent }}>Detalle completo</div>
                  <h3 style={styles.popupTitle}>Orden de Pago N° {detallePopup.correlativo}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDetallePopup(null)}
                  style={{ ...styles.slimActionButton, borderColor: currentTheme.border, color: "#EF4444" }}
                >
                  Cerrar
                </button>
              </div>
              <div style={{ ...styles.popupBody, overflowY: "auto", whiteSpace: "pre-wrap", lineHeight: 1.55, color: "#1E293B" }}>
                {detallePopup.detalle}
              </div>
            </div>
          </div>
        ) : null}
        {detailTab === "con-pagado" && isConPagadoPopupOpen ? (
          <div
            style={styles.popupOverlay}
            onClick={() => setIsConPagadoPopupOpen(false)}
            role="presentation"
          >
            <div
              style={styles.popupCard}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Con Pagado"
            >
              <div style={styles.popupHeader}>
                <div>
                  <div style={{ ...styles.sectionKicker, color: currentTheme.accent }}>Con Pagado</div>
                  <h3 style={styles.popupTitle}>Orden de Pago N° {filaActiva?.correlativo || "-"}</h3>
                  <p style={styles.popupSubtitle}>Subtotal del solicitante y pagos acumulados frente al Total OT.</p>
                </div>
                <div style={styles.popupHeaderActions}>
                  <button
                    type="button"
                    onClick={() => setIsConPagadoPopupOpen(false)}
                    style={{ ...styles.slimActionButton, borderColor: currentTheme.border, color: "#EF4444" }}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
              <div style={styles.popupBody}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
                  {conPagadoResumenPorMoneda.map((item) => (
                    <div key={`popup-bar-${item.moneda}`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontWeight: 900, fontSize: 13 }}>
                        <span>{item.moneda}</span>
                        <span>Pagado: {formatPercent(item.pagadoPorcentaje)} · Solicitante: {formatPercent(item.porcentaje)}</span>
                      </div>
                      <div style={styles.progressTrack}>
                        <div style={styles.ocProgressSegments}>
                          <div style={{ ...styles.ocProgressSegment, width: `${item.pagadoPorcentaje}%`, background: "#2563EB" }} />
                          <div style={{ ...styles.ocProgressSegment, width: `${item.porcentaje}%`, background: "#F59E0B" }} />
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", fontSize: 12, color: "#475569" }}>
                        <span>Subtotal solicitante: {formatCurrency(item.subtotal, item.moneda)}</span>
                        <span>Pagado OT: {formatCurrency(item.pagadoOt, item.moneda)}</span>
                        <span>Total OT: {item.totalOt > 0 ? formatCurrency(item.totalOt, item.moneda) : "-"}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={styles.gridScrollable}>
                  <table style={{ ...styles.table, minWidth: 1230, width: "max-content" }}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Correlativo</th>
                        <th style={styles.th}>Cliente</th>
                        <th style={styles.th}>Proyecto</th>
                        <th style={styles.th}>Site ID</th>
                        <th style={styles.th}>Site</th>
                        <th style={styles.th}>Tipo trabajo</th>
                        <th style={styles.th}>Tarea</th>
                        <th style={styles.th}>Subtotal</th>
                        <th style={styles.th}>Moneda</th>
                        <th style={styles.th}>Solicitante</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conPagadoRows.length === 0 ? (
                        <tr><td colSpan={10} style={styles.emptyCell}>No hay registros para los criterios seleccionados.</td></tr>
                      ) : conPagadoRows.map((row, index) => (
                        <tr key={`popup-con-pagado-${row.id}-${index}`}>
                          <td style={styles.td}>{row.correlativo || "-"}</td>
                          <td style={styles.td}>{row.cliente || "-"}</td>
                          <td style={styles.td}>{row.proyecto || "-"}</td>
                          <td style={styles.td}>{row.siteId || "-"}</td>
                          <td style={styles.td}>{row.site || "-"}</td>
                          <td style={styles.td}>{row.tipoTrabajo || "-"}</td>
                          <td style={styles.td}>{row.tarea || "-"}</td>
                          <td style={{ ...styles.td, fontWeight: 800 }}>{formatCurrency(row.subtotal, row.moneda)}</td>
                          <td style={styles.td}>{row.moneda || "-"}</td>
                          <td style={styles.td}>{row.solicitante || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : null}
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
              aria-label="Historial Sitio"
            >
              <div style={styles.popupHeader}>
                <div>
                  <div style={{ ...styles.sectionKicker, color: currentTheme.accent }}>Historial Sitio</div>
                  <h3 style={styles.popupTitle}>Orden de Pago N° {filaActiva?.correlativo || "-"}</h3>
                  <p style={styles.popupSubtitle}>
                    Se muestran los registros pagados del mismo cliente, proyecto, site y tipo de trabajo.
                  </p>
                </div>
                <div style={styles.popupHeaderActions}>
                  <input
                    type="search"
                    value={historialResponsable}
                    onChange={(event) => setHistorialResponsable(event.target.value)}
                    aria-label="Filtrar historial de sitio por responsable"
                    placeholder="Buscar responsable..."
                    list="historial-ot-responsables"
                    style={{ ...styles.quickDateInput, minWidth: 180, height: 34, fontSize: 12 }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setHistorialResponsable("");
                      setHistorialSolicitanteSeleccionado("");
                    }}
                    disabled={!historialResponsable && !historialSolicitanteSeleccionado}
                    aria-label="Limpiar filtros del historial"
                    title="Limpiar filtros"
                    style={{
                      ...styles.slimActionButton,
                      minWidth: 34,
                      width: 34,
                      height: 34,
                      padding: 0,
                      justifyContent: "center",
                      borderColor: "#CBD5E1",
                      color: "#475569",
                      opacity: !historialResponsable && !historialSolicitanteSeleccionado ? 0.45 : 1,
                    }}
                  >
                    <RotateCcw size={16} />
                  </button>
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
                {historialTotalesPorMoneda.length > 0 ? (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                    {historialTotalesPorMoneda.map(({ moneda, total }) => (
                      <div
                        key={moneda}
                        style={{
                          minWidth: 150,
                          padding: "10px 12px",
                          border: "1px solid #DBEAFE",
                          borderRadius: 10,
                          background: "#F8FBFF",
                        }}
                      >
                        <div style={{ fontSize: 10, fontWeight: 800, color: "#64748B", textTransform: "uppercase" }}>{moneda}</div>
                        <div style={{ marginTop: 3, fontSize: 16, fontWeight: 800, color: "#0F172A" }}>{formatCurrency(total, moneda)}</div>
                      </div>
                    ))}
                    {historialSolicitanteSeleccionado ? (
                      <div
                        title={historialSolicitanteSeleccionado}
                        style={{
                          minWidth: 180,
                          maxWidth: 280,
                          padding: "10px 12px",
                          border: "1px solid #BFDBFE",
                          borderRadius: 10,
                          background: "#EFF6FF",
                        }}
                      >
                        <div style={{ fontSize: 10, fontWeight: 800, color: "#1D4ED8", textTransform: "uppercase" }}>Solicitante seleccionado</div>
                        <div style={{ marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: 800, color: "#0F172A" }}>
                          {historialSolicitanteSeleccionado}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: 8, marginBottom: 14, borderBottom: "1px solid #E2E8F0" }}>
                  {[
                    { key: "listado" as const, label: "Listado" },
                    { key: "resumen" as const, label: "Resumen por solicitante" },
                  ].map((tab) => {
                    const isActive = historialPopupView === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setHistorialPopupView(tab.key)}
                        style={{
                          border: "none",
                          borderBottom: `3px solid ${isActive ? currentTheme.accent : "transparent"}`,
                          background: "transparent",
                          padding: "8px 12px",
                          color: isActive ? currentTheme.accent : "#64748B",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
                {historialPopupView === "resumen" ? (
                  historialSolicitudesPorMoneda.length === 0 ? (
                    <div style={styles.emptyCell}>No hay solicitudes para resumir.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 18 }}>
                      {historialSolicitudesPorMoneda.map(({ moneda, items }) => {
                        const mayorSolicitud = items[0]?.total || 0;

                        return (
                          <section key={moneda} style={{ border: "1px solid #DBEAFE", borderRadius: 12, padding: 16, background: "#F8FBFF" }}>
                            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
                              <strong style={{ color: "#0F172A", fontSize: 14 }}>{moneda}</strong>
                              <span style={{ color: "#64748B", fontSize: 11 }}>Solicitado por solicitante</span>
                            </div>
                            <div style={{ display: "grid", gap: 10 }}>
                              {items.map(({ solicitante, total }) => {
                                const porcentaje = mayorSolicitud > 0 ? Math.max(2, (total / mayorSolicitud) * 100) : 0;

                                return (
                                  <button
                                    key={solicitante}
                                    type="button"
                                    onClick={() => {
                                      setHistorialSolicitanteSeleccionado(solicitante);
                                      setHistorialPopupView("listado");
                                    }}
                                    title={`Ver registros de ${solicitante}`}
                                    style={{ display: "grid", gridTemplateColumns: "minmax(180px, 0.9fr) minmax(220px, 2fr) auto", alignItems: "center", gap: 12, width: "100%", border: "none", borderRadius: 8, padding: "5px 6px", background: "transparent", cursor: "pointer", textAlign: "left" }}
                                  >
                                    <span title={solicitante} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#334155", fontSize: 12, fontWeight: 700 }}>
                                      {solicitante}
                                    </span>
                                    <div style={{ height: 12, borderRadius: 999, overflow: "hidden", background: "#E2E8F0" }}>
                                      <div style={{ width: `${porcentaje}%`, height: "100%", borderRadius: "inherit", background: currentTheme.accent }} />
                                    </div>
                                    <strong style={{ minWidth: 112, textAlign: "right", color: "#0F172A", fontSize: 12 }}>
                                      {formatCurrency(total, moneda)}
                                    </strong>
                                  </button>
                                );
                              })}
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  )
                ) : (
                <div style={styles.gridScrollable}>
                  <table style={{ ...styles.table, minWidth: 1820, width: "max-content" }}>
                    <thead onClick={(event) => {
                      const column = (event.target as HTMLElement).closest<HTMLElement>("th")?.dataset.historialSort as PagoSortColumn | undefined;
                      if (column) handleHistorialSortColumn(column);
                    }}>
                      <tr>
                        <th data-historial-sort="correlativo" style={{ ...styles.th, width: 94, cursor: "pointer" }}>Correlativo</th>
                        <th data-historial-sort="fecha" style={{ ...styles.th, width: 80, cursor: "pointer" }}>Fecha</th>
                        <th data-historial-sort="cliente" style={{ ...styles.th, width: 60, cursor: "pointer" }}>Cliente</th>
                        <th data-historial-sort="proyecto" style={{ ...styles.th, width: 90, cursor: "pointer" }}>Proyecto</th>
                        <th data-historial-sort="site" style={{ ...styles.th, width: 140, cursor: "pointer" }}>Site</th>
                        <th data-historial-sort="tipoTrabajo" style={{ ...styles.th, width: 90, cursor: "pointer" }}>Tipo trabajo</th>
                        <th data-historial-sort="tarea" style={{ ...styles.th, width: 130, cursor: "pointer" }}>Tarea</th>
                        <th data-historial-sort="idOc" style={{ ...styles.th, width: 88, cursor: "pointer" }}>OC</th>
                        <th data-historial-sort="subtotal" style={{ ...styles.th, width: 90, cursor: "pointer" }}>Subtotal</th>
                        <th data-historial-sort="igv" style={{ ...styles.th, width: 90, cursor: "pointer" }}>IGV</th>
                        <th data-historial-sort="total" style={{ ...styles.th, width: 100, cursor: "pointer" }}>Total</th>
                        <th data-historial-sort="moneda" style={{ ...styles.th, width: 80, cursor: "pointer" }}>Moneda</th>
                        <th data-historial-sort="solicitante" style={{ ...styles.th, width: 150, cursor: "pointer" }}>Solicitante</th>
                        <th data-historial-sort="responsable" style={{ ...styles.th, width: 110, cursor: "pointer" }}>Responsable</th>
                        <th data-historial-sort="detalle" style={{ ...styles.th, width: 260, cursor: "pointer" }}>Detalle</th>
                        <th data-historial-sort="validador" style={{ ...styles.th, width: 110, cursor: "pointer" }}>Validador</th>
                        <th data-historial-sort="ot" style={{ ...styles.th, width: 88, cursor: "pointer" }}>OT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historialPopupRowsFiltrados.length === 0 ? (
                        <tr>
                          <td colSpan={17} style={styles.emptyCell}>
                            {historialSolicitanteSeleccionado
                              ? "No hay registros para el solicitante seleccionado."
                              : "No hay registros para el cliente, proyecto, site y tipo de trabajo seleccionados."}
                          </td>
                        </tr>
                      ) : (
                        historialPopupRowsOrdenados.map((row) => (
                          <tr key={`popup-hist-${row.id}`}>
                            <td style={styles.td}>{row.correlativo}</td>
                            <td style={styles.td}>{formatDate(row.fecha)}</td>
                            <td style={styles.td}>{row.cliente}</td>
                            <td style={styles.td}>{row.proyecto}</td>
                            <td style={styles.td}>{row.site}</td>
                            <td style={styles.td}>{row.tipoTrabajo}</td>
                            <td style={styles.td}>{row.tarea || '-'}</td>
                            <td style={styles.td}>{row.idOc || row.documento || '-'}</td>
                            <td style={{ ...styles.td, fontWeight: 900 }}>{formatCurrency(row.subtotal, row.moneda)}</td>
                            <td style={styles.td}>{formatCurrency(row.igv, row.moneda)}</td>
                            <td style={styles.td}>{formatCurrency(row.total, row.moneda)}</td>
                            <td style={styles.td}>{row.moneda || '-'}</td>
                            <td style={styles.td}>{row.solicitante || '-'}</td>
                            <td style={styles.td}>{row.responsable}</td>
                            <td
                              title="Ver detalle completo"
                              onClick={() => setDetallePopup({ correlativo: row.correlativo, detalle: row.detalle?.trim() || "-" })}
                              style={{ ...styles.td, cursor: "pointer", color: "#2563EB", textDecoration: "underline" }}
                            >
                              <span style={{ display: "block", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {row.detalle?.trim() || '-'}
                              </span>
                            </td>
                            <td style={styles.td}>{row.validador || '-'}</td>
                            <td style={styles.td}>{row.ot || '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
        {gastoEditorRequest ? (
          <GastosPage
            editorRequest={gastoEditorRequest}
            onEditorClose={() => setGastoEditorRequest(null)}
            onEditorUpdated={() => {
              reloadAfterMutation();
              setMessage("Gasto actualizado correctamente.");
            }}
          />
        ) : null}
        {rechazoModal ? (
          <div
            style={styles.rejectModalOverlay}
            onClick={() => {
              if (!rechazoModal.submitting) {
                handleCancelarRechazo();
              }
            }}
            role="presentation"
          >
            <div
              style={styles.rejectModalCard}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Rechazar registros"
            >
              <div style={styles.popupHeader}>
                <div>
                  <div style={{ ...styles.sectionKicker, color: "#DC2626" }}>Rechazar registros</div>
                  <h3 style={styles.popupTitle}>
                    {rechazoModal.rows.length} registro(s) seleccionado(s)
                  </h3>
                  <p style={styles.popupSubtitle}>
                    Ingrese una observación obligatoria para continuar con el rechazo.
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <textarea
                  value={rechazoModal.observacion}
                  onChange={(event) =>
                    setRechazoModal((prev) =>
                      prev
                        ? { ...prev, observacion: event.target.value, error: null }
                        : prev
                    )
                  }
                  rows={4}
                  placeholder="Escriba la observación del rechazo"
                  style={styles.rejectModalTextarea}
                  disabled={rechazoModal.submitting}
                />
                {rechazoModal.error ? <div style={styles.errorBanner}>{rechazoModal.error}</div> : null}
              </div>

              <div style={styles.rejectModalActions}>
                <button
                  type="button"
                  style={{ ...styles.slimActionButton, borderColor: "#FCA5A5", color: "#B91C1C" }}
                  onClick={() => void handleRechazarSeleccionados()}
                  disabled={rechazoModal.submitting}
                >
                  Rechazar
                </button>
                <button
                  type="button"
                  style={{ ...styles.slimActionButton, borderColor: "#93C5FD", color: "#1D4ED8" }}
                  onClick={handleCancelarRechazo}
                  disabled={rechazoModal.submitting}
                >
                  {rechazoModal.submitting ? "Procesando..." : "Cancelar"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {observacionModal ? (
          <div
            style={styles.rejectModalOverlay}
            onClick={() => {
              if (!observacionModal.submitting) {
                handleCancelarObservacion();
              }
            }}
            role="presentation"
          >
            <div
              style={styles.rejectModalCard}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Observar registros"
            >
              <div style={styles.popupHeader}>
                <div>
                  <div style={{ ...styles.sectionKicker, color: "#F59E0B" }}>Observar registros</div>
                  <h3 style={styles.popupTitle}>
                    {observacionModal.rows.length} registro(s) seleccionado(s)
                  </h3>
                  <p style={styles.popupSubtitle}>
                    Ingrese una observación obligatoria para continuar con la observación.
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <textarea
                  value={observacionModal.observacion}
                  onChange={(event) =>
                    setObservacionModal((prev) =>
                      prev
                        ? { ...prev, observacion: event.target.value, error: null }
                        : prev
                    )
                  }
                  rows={4}
                  placeholder="Escriba la observación"
                  style={styles.rejectModalTextarea}
                  disabled={observacionModal.submitting}
                />
                {observacionModal.error ? <div style={styles.errorBanner}>{observacionModal.error}</div> : null}
              </div>

              <div style={styles.rejectModalActions}>
                <button
                  type="button"
                  style={{ ...styles.slimActionButton, borderColor: "#FCD34D", color: "#B45309" }}
                  onClick={() => void handleObservarSeleccionados()}
                  disabled={observacionModal.submitting}
                >
                  Observar
                </button>
                <button
                  type="button"
                  style={{ ...styles.slimActionButton, borderColor: "#93C5FD", color: "#1D4ED8" }}
                  onClick={handleCancelarObservacion}
                  disabled={observacionModal.submitting}
                >
                  {observacionModal.submitting ? "Procesando..." : "Cancelar"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {aprobarConfirm ? (
          <div
            style={styles.rejectModalOverlay}
            onClick={() => {
              handleCancelarAprobacion();
            }}
            role="presentation"
          >
            <div
              style={styles.rejectModalCard}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={aprobarConfirm.titulo}
            >
              <div style={styles.popupHeader}>
                <div>
                  <div style={{ ...styles.sectionKicker, color: "#1D4ED8" }}>{aprobarConfirm.titulo}</div>
                  <h3 style={styles.popupTitle}>Confirmación requerida</h3>
                  <p style={styles.popupSubtitle}>{aprobarConfirm.mensaje}</p>
                </div>
              </div>

              <div style={styles.rejectModalActions}>
                <button
                  type="button"
                  style={{ ...styles.slimActionButton, borderColor: "#93C5FD", color: "#1D4ED8" }}
                  onClick={() => void handleConfirmarAprobacion()}
                >
                  Sí
                </button>
                <button
                  type="button"
                  style={{ ...styles.slimActionButton, borderColor: "#CBD5E1", color: "#334155" }}
                  onClick={handleCancelarAprobacion}
                >
                  No
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {regularizarConfirm ? (
          <div
            style={styles.rejectModalOverlay}
            onClick={() => {
              handleCancelarRegularizacion();
            }}
            role="presentation"
          >
            <div
              style={styles.rejectModalCard}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Confirmar regularizacion"
            >
              <div style={styles.popupHeader}>
                <div>
                  <div style={{ ...styles.sectionKicker, color: "#B45309" }}>Regularizar</div>
                  <h3 style={styles.popupTitle}>Confirmación requerida</h3>
                  <p style={styles.popupSubtitle}>
                    Este proceso solo REGULARIZA pago, no va generar un DEPOSITO. ¿Continua?
                  </p>
                </div>
              </div>

              <div style={styles.rejectModalActions}>
                <button
                  type="button"
                  style={{ ...styles.slimActionButton, borderColor: "#93C5FD", color: "#1D4ED8" }}
                  onClick={() => void handleConfirmarRegularizacion()}
                >
                  Sí
                </button>
                <button
                  type="button"
                  style={{ ...styles.slimActionButton, borderColor: "#CBD5E1", color: "#334155" }}
                  onClick={handleCancelarRegularizacion}
                >
                  No
                </button>
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
                        <th style={{ ...styles.th, width: 260 }}>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historialOcRows.length === 0 ? (
                        <tr>
                          <td colSpan={18} style={styles.emptyCell}>
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
                            <td style={styles.td}>{row.detalle || '-'}</td>
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
  disabled = false,
  onClick,
}: {
  label: string;
  value: number;
  accent: string;
  soft: string;
  border: string;
  icon: React.ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles.kpiCard,
        borderColor: selected ? accent : border,
        background: selected ? soft : "#FFFFFF",
        cursor: disabled ? "not-allowed" : onClick ? "pointer" : "default",
        opacity: disabled ? 0.58 : 1,
        textAlign: "left",
        width: "100%",
        boxShadow: selected ? `0 4px 12px ${accent}22` : "none",
        transform: selected ? "translateY(-1px)" : "none",
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
    overflowX: "hidden",
    overflowY: "auto",
    scrollbarGutter: "stable",
    paddingBottom: 0,
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
  rangoFechasLeyenda: {
    marginTop: 2,
    fontSize: 12,
    color: "#475569",
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
  tipoCambioField: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 60,
  },
  tipoCambioLabel: {
    fontSize: 10,
    fontWeight: 800,
    color: "#475569",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  tipoCambioInput: {
    width: "100%",
    border: "1px solid #93C5FD",
    borderRadius: 8,
    background: "#FFFFFF",
    color: "#0F172A",
    fontSize: 14,
    fontWeight: 800,
    padding: "6px 8px",
    outline: "none",
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
    minWidth: 300,
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
    flexWrap: "wrap",
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
  multiFilter: {
    position: "relative",
    minWidth: 188,
  },
  multiFilterSummary: {
    height: 34,
    boxSizing: "border-box",
    border: "1px solid",
    borderRadius: 10,
    padding: "9px 10px",
    background: "#FFFFFF",
    color: "#0F172A",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
    boxShadow: "0 1px 4px rgba(15, 23, 42, 0.05)",
  },
  multiFilterOptions: {
    position: "absolute",
    zIndex: 30,
    top: 40,
    left: 0,
    width: 270,
    maxHeight: 280,
    overflowY: "auto",
    padding: 8,
    border: "1px solid #CBD5E1",
    borderRadius: 10,
    background: "#FFFFFF",
    boxShadow: "0 12px 24px rgba(15, 23, 42, 0.16)",
  },
  multiFilterSearch: {
    width: "100%",
    height: 30,
    boxSizing: "border-box",
    marginBottom: 6,
    border: "1px solid",
    borderRadius: 7,
    padding: "0 8px",
    outline: "none",
    fontSize: 12,
  },
  multiFilterOption: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    minHeight: 28,
    cursor: "pointer",
    color: "#334155",
    fontSize: 12,
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
    borderRadius: 12,
    padding: "4px 8px",
    display: "flex",
    gap: 8,
    alignItems: "center",
    minHeight: 44,
  },
  kpiIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
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
    fontSize: 10,
    fontWeight: 800,
    color: "#475569",
    marginBottom: 1,
    whiteSpace: "nowrap",
  },
  kpiValue: {
    fontSize: 18,
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
    position: "relative",
    flexShrink: 0,
    zIndex: 1,
    marginTop: 0,
  },
  fixedHorizontalScrollbar: {
    flex: "0 0 16px",
    width: "100%",
    height: 16,
    overflowX: "scroll",
    overflowY: "hidden",
    scrollbarGutter: "stable",
    background: "rgba(255, 255, 255, 0.96)",
    borderBottom: "1px solid #E2E8F0",
    transition: "opacity 120ms ease",
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
    gridTemplateRows: "minmax(0, 1fr)",
    minHeight: 0,
    flex: 1,
    alignItems: "stretch",
    position: "relative",
  },
  leftColumn: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
    minWidth: 0,
    minHeight: 0,
  },
  gridCard: {
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: 18,
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 260,
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
    // La barra horizontal se expone en la cabecera mediante fixedHorizontalScrollbar.
    overflowX: "hidden",
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
    background: "#FAFAFB",
  },
  groupBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    background: "#FAFAFB",
    borderBottom: "1px solid #EEF2F7",
    flexWrap: "wrap",
    width: "100%",
    minWidth: "100%",
    boxSizing: "border-box",
    justifyContent: "flex-start",
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
    flex: "0 1 640px",
    marginLeft: "auto",
    alignItems: "flex-end",
    textAlign: "right",
  },
  groupCurrencyLine: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "baseline",
    justifyContent: "flex-end",
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
    maxHeight: "calc(var(--app-vh) - 178px)",
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
  otConversionDetail: {
    borderTop: "1px solid #E2E8F0",
    marginTop: 4,
    paddingTop: 8,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    color: "#475569",
  },
  otConversionTitle: {
    fontSize: 11,
    fontWeight: 900,
    color: "#64748B",
    textTransform: "uppercase",
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
    // El detalle de Planilla conserva saltos de línea (CRLF). HTML los
    // colapsa por defecto; esta regla mantiene la presentación del sistema anterior.
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
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
    height: "100%",
    maxHeight: "100%",
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
    // Debe quedar sobre la barra superior de la aplicación; de lo contrario
    // la cabecera del modal y sus acciones quedan parcialmente ocultas.
    zIndex: 3000,
  },
  popupCard: {
    width: "min(1360px, calc(var(--app-vw) - 32px))",
    height: "min(900px, calc(var(--app-vh) - 32px))",
    maxHeight: "calc(var(--app-vh) - 32px)",
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
    flexShrink: 0,
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
  rejectModalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.48)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 90,
  },
  rejectModalCard: {
    width: "min(680px, calc(var(--app-vw) - 32px))",
    background: "#FFFFFF",
    borderRadius: 18,
    border: "1px solid #FCA5A5",
    boxShadow: "0 30px 80px rgba(15, 23, 42, 0.28)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  rejectModalTextarea: {
    width: "100%",
    minHeight: 128,
    resize: "vertical",
    borderRadius: 12,
    border: "1px solid #CBD5E1",
    padding: "12px 14px",
    fontSize: 14,
    color: "#0F172A",
    background: "#FFFFFF",
    outline: "none",
    boxSizing: "border-box",
  },
  rejectModalActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    padding: "0 18px 18px",
    flexWrap: "wrap",
  },
  errorBanner: {
    border: "1px solid #FCA5A5",
    background: "#FEF2F2",
    color: "#B91C1C",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 700,
  },
};




