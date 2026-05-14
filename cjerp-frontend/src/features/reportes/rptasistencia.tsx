import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  matchesCrudToolbarSearch,
  type CrudToolbarSearchField,
} from "../../components/base/CrudToolbar";
import { buscarAsistencia, exportarAsistenciaEmpleadoPdf } from "../../api/asistenciaService";
import type { AsistenciaReporteItem, AsistenciaReportePdfItem } from "../../models/asistencia";
import { getHttpErrorMessage } from "../../utils/httpError";

type SelectFilterKey =
  | "estado"
  | "nombreEmpleado"
  | "empresa"
  | "cliente"
  | "area"
  | "ubicacion"
  | "estadoAct"
  | "estadoMarcacionTexto"
  | "origenMarcacion";

type SortKey =
  | "fecha"
  | "nombreEmpleado"
  | "estado"
  | "empresa"
  | "cliente"
  | "area"
  | "ubicacion"
  | "estadoAct"
  | "estadoMarcacionTexto"
  | "origenMarcacion"
  | "hora"
  | "salida"
  | "tiempoHoras"
  | "totalHoras"
  | "comentario";

type SortState = {
  key: SortKey;
  direction: "asc" | "desc";
};

type TableColumn = {
  key: SortKey;
  label: string;
  width: string;
  align?: "left" | "right" | "center";
};

type KPI = {
  label: string;
  value: string;
  tone: "blue" | "green" | "amber" | "red" | "slate";
};

type DetailDrilldown = {
  fecha: string | null;
  estadoMarcacion: string | null;
  origenMarcacion: string | null;
  nombreEmpleado: string | null;
  area: string | null;
};

type StateDateCell = {
  state: string;
  value: number;
  totalHoras: number;
};

type EmployeeDateCell = {
  fecha: string;
  totalHoras: number;
  estadoMarcacionTexto: string;
};

type EmployeeDateRow = {
  employee: string;
  responsable: string;
  ubicacion: string;
  total: number;
  totalHorasFaltaIncompleto: number;
  totalHorasLaborales: number;
  diferenciaHoras: number;
  estadoValidacionHoras: string;
  fechas: EmployeeDateCell[];
};

type EmployeeGridFilters = {
  employee: string;
  responsable: string;
  estadoValidacionHoras: string;
  diferenciaOperator: "" | "lt" | "gt" | "eq";
  diferenciaValue: string;
};

type CuadrosDetailSortKey =
  | "fecha"
  | "nombreEmpleado"
  | "area"
  | "estadoMarcacionTexto";

const ALL_OPTION = "__ALL__";
const OBSERVATION_HOURS_THRESHOLD = 9.6;
const MISSING_OR_INCOMPLETE_HOURS = 9.6;
const PRESENT_STATES = new Set(["PRESENTE", "ASISTIO", "OK"]);
const TARDINESS_STATES = new Set(["TARDANZA", "TARDE"]);
const CRITICAL_STATES = new Set(["SIN MARCAR", "SIN SALIDA", "SIN ENTRADA", "FALTA"]);
const SOFT_STATES = new Set(["VACACIONES", "DOMINGO", "SABADO", "SÁBADO"]);

const tableColumns: TableColumn[] = [
  { key: "fecha", label: "Fecha", width: "110px" },
  { key: "nombreEmpleado", label: "Nombre empleado", width: "250px" },
  { key: "estadoMarcacionTexto", label: "Estado marcacion", width: "170px" },
  { key: "hora", label: "Hora entrada", width: "110px", align: "center" },
  { key: "salida", label: "Hora salida", width: "110px", align: "center" },
  { key: "totalHoras", label: "TotalHoras", width: "110px", align: "right" },
  { key: "empresa", label: "Empresa", width: "180px" },
  { key: "cliente", label: "Cliente", width: "190px" },
  { key: "area", label: "Area", width: "160px" },
  { key: "ubicacion", label: "Ubicacion", width: "170px" },
  { key: "estadoAct", label: "Estado activo/baja", width: "150px" },
  { key: "comentario", label: "Comentario", width: "260px" },
];

const chartPalette = ["#2563EB", "#059669", "#F59E0B", "#DC2626", "#7C3AED", "#0EA5E9"];

type StateVisual = {
  strong: string;
  soft: string;
  gradient: string;
  text: string;
};

const STATE_VISUALS: Record<string, StateVisual> = {
  FALTA: {
    strong: "#E35D5D",
    soft: "#F28B8B",
    gradient: "linear-gradient(135deg, #F6B1B1 0%, #EA7373 100%)",
    text: "#7F1D1D",
  },
  PRESENTE: {
    strong: "#E4BF45",
    soft: "#EACF71",
    gradient: "linear-gradient(135deg, #F7E6A1 0%, #E9C95D 100%)",
    text: "#78350F",
  },
  ASISTIO: {
    strong: "#E4BF45",
    soft: "#EACF71",
    gradient: "linear-gradient(135deg, #F7E6A1 0%, #E9C95D 100%)",
    text: "#78350F",
  },
  OK: {
    strong: "#E4BF45",
    soft: "#EACF71",
    gradient: "linear-gradient(135deg, #F7E6A1 0%, #E9C95D 100%)",
    text: "#78350F",
  },
  DOMINGO: {
    strong: "#8ED94A",
    soft: "#A9E46D",
    gradient: "linear-gradient(135deg, #C6F28F 0%, #9DE159 100%)",
    text: "#365314",
  },
  SABADO: {
    strong: "#59D48A",
    soft: "#72DD9B",
    gradient: "linear-gradient(135deg, #92E7B3 0%, #66DA94 100%)",
    text: "#14532D",
  },
  FERIADO: {
    strong: "#5CC6D8",
    soft: "#7ED5E3",
    gradient: "linear-gradient(135deg, #9FE4EE 0%, #65CBDE 100%)",
    text: "#164E63",
  },
  COMPENSACION: {
    strong: "#3CC7C9",
    soft: "#74DCDD",
    gradient: "linear-gradient(135deg, #A6ECEC 0%, #52D0D2 100%)",
    text: "#134E4A",
  },
  "SIN MARCAR": {
    strong: "#E35D5D",
    soft: "#F28B8B",
    gradient: "linear-gradient(135deg, #F6B1B1 0%, #EA7373 100%)",
    text: "#7F1D1D",
  },
  "SIN SALIDA": {
    strong: "#F08A24",
    soft: "#F7A95C",
    gradient: "linear-gradient(135deg, #F9C88D 0%, #F39A38 100%)",
    text: "#7C2D12",
  },
  "SIN ENTRADA": {
    strong: "#F08A24",
    soft: "#F7A95C",
    gradient: "linear-gradient(135deg, #F9C88D 0%, #F39A38 100%)",
    text: "#7C2D12",
  },
  INCOMPLETO: {
    strong: "#F08A24",
    soft: "#F7A95C",
    gradient: "linear-gradient(135deg, #F9C88D 0%, #F39A38 100%)",
    text: "#7C2D12",
  },
  TARDANZA: {
    strong: "#A855F7",
    soft: "#C084FC",
    gradient: "linear-gradient(135deg, #DEC1FB 0%, #B16AF8 100%)",
    text: "#581C87",
  },
  TARDE: {
    strong: "#A855F7",
    soft: "#C084FC",
    gradient: "linear-gradient(135deg, #DEC1FB 0%, #B16AF8 100%)",
    text: "#581C87",
  },
  VACACIONES: {
    strong: "#0EA5A4",
    soft: "#2DD4BF",
    gradient: "linear-gradient(135deg, #99F6E4 0%, #34D399 100%)",
    text: "#134E4A",
  },
  CORRECTO: {
    strong: "#16A34A",
    soft: "#4ADE80",
    gradient: "linear-gradient(135deg, #BBF7D0 0%, #4ADE80 100%)",
    text: "#14532D",
  },
};

function getIndexedFallbackColor(index: number) {
  const hue = (index * 47) % 360;
  return {
    strong: `hsl(${hue} 72% 52%)`,
    soft: `hsl(${hue} 58% 64%)`,
    gradient: `linear-gradient(135deg, hsl(${hue} 88% 86%) 0%, hsl(${hue} 72% 68%) 100%)`,
    text: "#0F172A",
  };
}

function getStateVisual(state: string, index = 0): StateVisual {
  const normalized = normalizeText(state);
  return STATE_VISUALS[normalized] ?? getIndexedFallbackColor(index);
}

function toInputDate(date: Date) {
  // Devuelve la fecha en formato YYYY-MM-DD en zona horaria de Perú
  const lima = new Date(date.toLocaleString("en-US", { timeZone: "America/Lima" }));
  const year = lima.getFullYear();
  const month = String(lima.getMonth() + 1).padStart(2, "0");
  const day = String(lima.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toApiDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function normalizeText(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function formatDateLabel(value: string) {
  if (!value) return "";
  if (value.includes("/")) return value;

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return `${day}/${month}/${year}`;
  }

  // Forzar zona horaria de Perú
  const parsed = new Date(new Date(value).toLocaleString("en-US", { timeZone: "America/Lima" }));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-PE");
}

function formatShortDateLabel(value: string) {
  const normalized = formatDateLabel(value);
  const parts = normalized.split("/");
  if (parts.length !== 3) {
    return normalized;
  }

  const [day, month] = parts;
  return `${day}-${month}`;
}

function parseInputDate(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return null;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDateRangeLabels(startValue: string, endValue: string) {
  const start = parseInputDate(startValue);
  const end = parseInputDate(endValue);

  if (!start || !end || start > end) {
    return [];
  }

  const labels: string[] = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const day = String(cursor.getDate()).padStart(2, "0");
    const month = String(cursor.getMonth() + 1).padStart(2, "0");
    const year = cursor.getFullYear();
    labels.push(`${day}/${month}/${year}`);
    cursor.setDate(cursor.getDate() + 1);
  }

  return labels;
}

function parseDisplayDate(value: string) {
  if (!value) return null;

  const normalized = formatDateLabel(value);
  const parts = normalized.split("/");
  if (parts.length !== 3) {
    return null;
  }

  const [day, month, year] = parts;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDayNameLabel(value: string) {
  const parsed = parseDisplayDate(value);
  if (!parsed) {
    return "";
  }

  return parsed.toLocaleDateString("es-PE", { weekday: "long" });
}

function isWithinSelectedRange(value: string, startValue: string, endValue: string) {
  const current = parseDisplayDate(value);
  const start = parseInputDate(startValue);
  const end = parseInputDate(endValue);

  if (!current || !start || !end) {
    return true;
  }

  return current >= start && current <= end;
}

function parseDurationToSeconds(value?: string | null) {
  if (!value) return null;
  const text = String(value).trim();
  const parts = text.split(":");
  if (parts.length !== 3) return null;

  const [hours, minutes, seconds] = parts.map((part) => Number(part));
  if (![hours, minutes, seconds].every(Number.isFinite)) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function formatDurationFromSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0000:00:00";
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  return `${String(hours).padStart(4, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatDecimal(value: number, digits = 2) {
  return value.toLocaleString("es-PE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function buildTiempoHorasDisplay(item: AsistenciaReporteItem) {
  const workedSeconds = parseDurationToSeconds(item.tiempoTrabajado);
  if (workedSeconds != null) {
    const adjusted = workedSeconds - 3600;
    if (adjusted <= 0) {
      return item.estadoMarcacionTexto || item.estado || "0000:00:00";
    }
    return formatDurationFromSeconds(adjusted);
  }

  if (item.tiempoHoras) {
    return item.tiempoHoras;
  }

  return item.estadoMarcacionTexto || item.estado || "0000:00:00";
}

function getRowTone(item: AsistenciaReporteItem) {
  const state = normalizeText(item.estadoMarcacionTexto || item.estado);

  if (state === "ASISTENCIA" && item.totalHoras < OBSERVATION_HOURS_THRESHOLD) {
    return "#FEF2F2";
  }
  if (PRESENT_STATES.has(state)) {
    return "#ECFDF5";
  }
  if (TARDINESS_STATES.has(state)) {
    return "#FFF7ED";
  }
  if (CRITICAL_STATES.has(state)) {
    return "#FEF2F2";
  }
  if (SOFT_STATES.has(state)) {
    return "#EFF6FF";
  }
  return "#FFFFFF";
}

function buildSelectOptions(rows: AsistenciaReporteItem[], selector: (item: AsistenciaReporteItem) => string) {
  return [ALL_OPTION, ...Array.from(new Set(rows.map(selector).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es"))];
}

function matchesMultiSelect(value: string, selectedValues: string[]) {
  if (selectedValues.length === 0 || selectedValues.includes(ALL_OPTION)) {
    return true;
  }

  return selectedValues.includes(value);
}

function getSortValue(item: AsistenciaReporteItem, key: SortKey) {
  switch (key) {
    case "totalHoras":
      return item.totalHoras;
    case "tiempoHoras":
      return buildTiempoHorasDisplay(item);
    default:
      return item[key];
  }
}

function compareValues(left: unknown, right: unknown) {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left ?? "").localeCompare(String(right ?? ""), "es", { sensitivity: "base" });
}

function matchesKeywordFilter(value: string, query: string) {
  const normalizedValue = normalizeText(value);
  const tokens = normalizeText(query)
    .split(/[+\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return true;
  }

  return tokens.every((token) => normalizedValue.includes(token));
}

function getExportRows(rows: AsistenciaReporteItem[]) {
  return rows.map((item) => ({
    Fecha: formatDateLabel(item.fecha),
    NombreEmpleado: item.nombreEmpleado,
    Responsable: item.responsable,
    Estado: item.estado,
    Empresa: item.empresa,
    Cliente: item.cliente,
    Area: item.area,
    Ubicacion: item.ubicacion,
    EstadoActivo: item.estadoAct,
    EstadoMarcacion: item.estadoMarcacionTexto,
    OrigenMarcacion: item.origenMarcacion,
    HoraEntrada: item.hora,
    HoraSalida: item.salida,
    TiempoHoras: buildTiempoHorasDisplay(item),
    TotalHoras: Number(formatDecimal(item.totalHoras, 2).replace(/,/g, "")),
    Comentario: item.comentario,
  }));
}

function buildEmployeeDateCellDisplay(cell?: EmployeeDateCell) {
  const hours = `${formatDecimal(cell?.totalHoras ?? 0, 2)} h`;
  if (!cell?.estadoMarcacionTexto) {
    return hours;
  }

  return `${hours} | ${cell.estadoMarcacionTexto}`;
}

export default function RptAsistenciaPage() {
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [fechaInicio, setFechaInicio] = useState(toInputDate(startOfMonth));
  const [fechaFin, setFechaFin] = useState(toInputDate(today));
  const [rows, setRows] = useState<AsistenciaReporteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [activeTab, setActiveTab] = useState<"cuadros" | "detalle" | "empleado">("cuadros");
  const [detailDrilldown, setDetailDrilldown] = useState<DetailDrilldown>({
    fecha: null,
    estadoMarcacion: null,
    origenMarcacion: null,
    nombreEmpleado: null,
    area: null,
  });
  const [sortState, setSortState] = useState<SortState>({ key: "fecha", direction: "desc" });
  const [frontendFilters, setFrontendFilters] = useState<Record<SelectFilterKey, string>>({
    estado: ALL_OPTION,
    nombreEmpleado: ALL_OPTION,
    empresa: ALL_OPTION,
    cliente: ALL_OPTION,
    area: ALL_OPTION,
    ubicacion: ALL_OPTION,
    estadoAct: "ACTIVO",
    estadoMarcacionTexto: ALL_OPTION,
    origenMarcacion: ALL_OPTION,
  });
  const [selectedEstadoMarcacion, setSelectedEstadoMarcacion] = useState<string[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [selectedEstados, setSelectedEstados] = useState<string[]>([]);
  const [cuadrosViewMode, setCuadrosViewMode] = useState<"fechaEstado" | "evolucionDiaria">("fechaEstado");
  const [cuadrosDetailFilter, setCuadrosDetailFilter] = useState<{ area: string | null; estadoMarcacion: string | null }>({
    area: null,
    estadoMarcacion: null,
  });
  const [cuadrosDetailSort, setCuadrosDetailSort] = useState<{ key: CuadrosDetailSortKey; direction: "asc" | "desc" }>({
    key: "fecha",
    direction: "asc",
  });
  const [employeeGridFilters, setEmployeeGridFilters] = useState<EmployeeGridFilters>({
    employee: "",
    responsable: "",
    estadoValidacionHoras: ALL_OPTION,
    diferenciaOperator: "",
    diferenciaValue: "",
  });
  const [employeeGridSort, setEmployeeGridSort] = useState<{ key: "responsable" | "total" | "otros" | "diferencia"; direction: "asc" | "desc" }>({
    key: "total",
    direction: "desc",
  });
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const deferredSearch = useDeferredValue(busqueda);

  const searchFields = useMemo<CrudToolbarSearchField<AsistenciaReporteItem>[]>(
    () => [
      { key: "nombreEmpleado", label: "Nombre empleado", getValue: (item) => item.nombreEmpleado },
      { key: "responsable", label: "Responsable", getValue: (item) => item.responsable },
      { key: "estado", label: "Estado", getValue: (item) => item.estado },
      { key: "empresa", label: "Empresa", getValue: (item) => item.empresa },
      { key: "cliente", label: "Cliente", getValue: (item) => item.cliente },
      { key: "area", label: "Area", getValue: (item) => item.area },
      { key: "ubicacion", label: "Ubicacion", getValue: (item) => item.ubicacion },
      { key: "estadoMarcacionTexto", label: "Estado marcacion", getValue: (item) => item.estadoMarcacionTexto },
      { key: "origenMarcacion", label: "Origen marcacion", getValue: (item) => item.origenMarcacion },
      { key: "comentario", label: "Comentario", getValue: (item) => item.comentario },
    ],
    []
  );

  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      const data = await buscarAsistencia({
        fechaInicio: toApiDate(fechaInicio),
        fechaFin: toApiDate(fechaFin),
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo cargar el reporte de asistencia."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [fechaFin, fechaInicio]);

  const filterOptions = useMemo(
    () => ({
      nombreEmpleado: buildSelectOptions(rows, (item) => item.nombreEmpleado),
      estado: buildSelectOptions(rows, (item) => item.estado),
      empresa: buildSelectOptions(rows, (item) => item.empresa),
      cliente: buildSelectOptions(rows, (item) => item.cliente),
      area: buildSelectOptions(rows, (item) => item.area),
      ubicacion: buildSelectOptions(rows, (item) => item.ubicacion),
      estadoAct: buildSelectOptions(rows, (item) => item.estadoAct),
      estadoMarcacionTexto: buildSelectOptions(rows, (item) => item.estadoMarcacionTexto),
      origenMarcacion: buildSelectOptions(rows, (item) => item.origenMarcacion),
    }),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const base = rows
      .filter((item) => matchesCrudToolbarSearch(item, deferredSearch, searchFields))
      .filter((item) => isWithinSelectedRange(item.fecha, fechaInicio, fechaFin))
      .filter((item) => (
        (frontendFilters.nombreEmpleado === ALL_OPTION || item.nombreEmpleado === frontendFilters.nombreEmpleado) &&
        matchesMultiSelect(item.estado, selectedEstados) &&
        (frontendFilters.empresa === ALL_OPTION || item.empresa === frontendFilters.empresa) &&
        (frontendFilters.cliente === ALL_OPTION || item.cliente === frontendFilters.cliente) &&
        matchesMultiSelect(item.area, selectedAreas) &&
        (frontendFilters.ubicacion === ALL_OPTION || item.ubicacion === frontendFilters.ubicacion) &&
        (frontendFilters.estadoAct === ALL_OPTION || item.estadoAct === frontendFilters.estadoAct) &&
        matchesMultiSelect(item.estadoMarcacionTexto, selectedEstadoMarcacion) &&
        (frontendFilters.origenMarcacion === ALL_OPTION || item.origenMarcacion === frontendFilters.origenMarcacion)
      ));

    return [...base].sort((left, right) => {
      const compared = compareValues(getSortValue(left, sortState.key), getSortValue(right, sortState.key));
      return sortState.direction === "asc" ? compared : -compared;
    });
  }, [deferredSearch, fechaFin, fechaInicio, frontendFilters, rows, searchFields, selectedAreas, selectedEstados, selectedEstadoMarcacion, sortState]);

  const detailRows = useMemo(() => {
    const base = filteredRows.filter((item) => (
      (!detailDrilldown.fecha || formatDateLabel(item.fecha) === detailDrilldown.fecha) &&
      (!detailDrilldown.nombreEmpleado || item.nombreEmpleado === detailDrilldown.nombreEmpleado) &&
      (!detailDrilldown.area || item.area === detailDrilldown.area) &&
      (!detailDrilldown.estadoMarcacion || (item.estadoMarcacionTexto || item.estado) === detailDrilldown.estadoMarcacion) &&
      (!detailDrilldown.origenMarcacion || item.origenMarcacion === detailDrilldown.origenMarcacion)
    ));

    const shouldSortByTotalHoras =
      normalizeText(detailDrilldown.estadoMarcacion) === "ASISTENCIA" ||
      selectedEstadoMarcacion.some((item) => normalizeText(item) === "ASISTENCIA") ||
      normalizeText(frontendFilters.estado) === "ASISTENCIA";

    if (!shouldSortByTotalHoras) {
      return base;
    }

    return [...base].sort((left, right) => {
      const compared = left.totalHoras - right.totalHoras;
      if (compared !== 0) {
        return compared;
      }

      return compareValues(left.nombreEmpleado, right.nombreEmpleado);
    });
  }, [detailDrilldown, filteredRows, frontendFilters]);

  const totals = useMemo(() => {
    const totalRegistros = filteredRows.length;
    const presentes = filteredRows.filter((item) => PRESENT_STATES.has(normalizeText(item.estadoMarcacionTexto || item.estado))).length;
    const tardanzas = filteredRows.filter((item) => TARDINESS_STATES.has(normalizeText(item.estadoMarcacionTexto || item.estado))).length;
    const sinMarcar = filteredRows.filter((item) => normalizeText(item.estadoMarcacionTexto || item.estado) === "SIN MARCAR").length;
    const sinSalida = filteredRows.filter((item) => normalizeText(item.estadoMarcacionTexto || item.estado) === "SIN SALIDA").length;
    const totalHoras = filteredRows.reduce((sum, item) => sum + item.totalHoras, 0);
    const empleados = new Set(filteredRows.map((item) => item.idEmpleado ?? item.nombreEmpleado).filter(Boolean)).size;
    const promedioHoras = empleados > 0 ? totalHoras / empleados : 0;
    const porcentajeAsistencia = totalRegistros > 0 ? ((presentes + tardanzas) / totalRegistros) * 100 : 0;

    return {
      totalRegistros,
      presentes,
      tardanzas,
      sinMarcar,
      sinSalida,
      totalHoras,
      promedioHoras,
      porcentajeAsistencia,
    };
  }, [filteredRows]);

  const kpis: KPI[] = useMemo(() => [
    { label: "Total registros", value: String(totals.totalRegistros), tone: "blue" },
    { label: "Presentes", value: String(totals.presentes), tone: "green" },
    { label: "Tardanzas", value: String(totals.tardanzas), tone: "amber" },
    { label: "Sin marcar", value: String(totals.sinMarcar), tone: "red" },
    { label: "Sin salida", value: String(totals.sinSalida), tone: "red" },
    { label: "Total horas", value: formatDecimal(totals.totalHoras, 2), tone: "blue" },
    { label: "Promedio horas/empleado", value: formatDecimal(totals.promedioHoras, 2), tone: "slate" },
    { label: "% asistencia", value: `${formatDecimal(totals.porcentajeAsistencia, 2)}%`, tone: "green" },
  ], [totals]);

  const chartEstadoMarcacion = useMemo(() => {
    const grouped = new Map<string, number>();
    filteredRows.forEach((item) => {
      const key = item.estadoMarcacionTexto || "Sin clasificar";
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    });

    return Array.from(grouped.entries()).map(([name, value]) => ({ name, value }));
  }, [filteredRows]);

  const chartOrigen = useMemo(() => {
    const grouped = new Map<string, number>();
    filteredRows.forEach((item) => {
      const key = item.origenMarcacion || "Sin origen";
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    });

    return Array.from(grouped.entries()).map(([name, value]) => ({ name, value }));
  }, [filteredRows]);

  const chartDiario = useMemo(() => {
    const grouped = new Map<string, number>();
    filteredRows.forEach((item) => {
      const key = formatDateLabel(item.fecha);
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    });

    return Array.from(grouped.entries()).map(([fecha, total]) => ({ fecha, total }));
  }, [filteredRows]);

  const chartEstadoPorDia = useMemo(() => {
    // Solo fechas presentes en los datos filtrados
    const fechasPresentes = Array.from(
      new Set(filteredRows.map((item) => formatDateLabel(item.fecha)))
    ).sort((a, b) => a.localeCompare(b, "es"));

    // Solo estados presentes en los datos filtrados
    const states = Array.from(
      new Set(filteredRows.map((item) => item.estadoMarcacionTexto || item.estado).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "es"));

    // Agrupar por fecha y estado
    const grouped = new Map<string, Map<string, { value: number; totalHoras: number }>>();
    fechasPresentes.forEach((fecha) => {
      grouped.set(fecha, new Map<string, { value: number; totalHoras: number }>());
    });

    filteredRows.forEach((item) => {
      const fecha = formatDateLabel(item.fecha);
      const estado = item.estadoMarcacionTexto || item.estado || "Sin clasificar";
      if (!grouped.has(fecha)) grouped.set(fecha, new Map<string, { value: number; totalHoras: number }>());
      const dayMap = grouped.get(fecha)!;
      const current = dayMap.get(estado) ?? { value: 0, totalHoras: 0 };
      dayMap.set(estado, {
        value: current.value + 1,
        totalHoras: current.totalHoras + item.totalHoras,
      });
    });

    const rows = Array.from(grouped.entries()).map(([fecha, values]) => {
      const total = Array.from(values.values()).reduce((sum, value) => sum + value.value, 0);
      return {
        fecha,
        total,
        estados: states.map((state) => ({
          state,
          value: values.get(state)?.value ?? 0,
          totalHoras: values.get(state)?.totalHoras ?? 0,
        })),
      };
    });


    return { states, rows };
  }, [filteredRows]);
  // <-- Coma agregada aquí si es necesario

  const chartAreaPorEstado = useMemo(() => {
    const states = Array.from(
      new Set(filteredRows.map((item) => item.estadoMarcacionTexto || item.estado).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "es"));

    const grouped = new Map<string, Map<string, number>>();

    filteredRows.forEach((item) => {
      const area = item.area || "Sin area";
      const estado = item.estadoMarcacionTexto || item.estado || "Sin clasificar";

      if (!grouped.has(area)) {
        grouped.set(area, new Map<string, number>());
      }

      const areaMap = grouped.get(area)!;
      areaMap.set(estado, (areaMap.get(estado) ?? 0) + 1);
    });

    const rows = Array.from(grouped.entries())
      .map(([area, values]) => ({
        area,
        total: Array.from(values.values()).reduce((sum, value) => sum + value, 0),
        estados: states
          .map((state) => ({
            state,
            value: values.get(state) ?? 0,
          }))
          .filter((item) => item.value > 0),
      }))
      .sort((left, right) => {
        if (right.total !== left.total) {
          return right.total - left.total;
        }

        return left.area.localeCompare(right.area, "es");
      });

    return { states, rows };
  }, [filteredRows]);

  const cuadroDetalleRows = useMemo(() => {
    const base = filteredRows
      .map((item, index) => ({
        key: `${item.idEmpleado ?? item.nombreEmpleado}-${item.fecha}-${index}`,
        fecha: formatDateLabel(item.fecha),
        nombreEmpleado: item.nombreEmpleado,
        area: item.area || "Sin area",
        estadoMarcacionTexto: item.estadoMarcacionTexto || item.estado || "Sin clasificar",
      }))
      .filter((item) => (
        (!cuadrosDetailFilter.area || item.area === cuadrosDetailFilter.area) &&
        (!cuadrosDetailFilter.estadoMarcacion || item.estadoMarcacionTexto === cuadrosDetailFilter.estadoMarcacion)
      ));

    return [...base].sort((left, right) => {
      const compared = cuadrosDetailSort.key === "fecha"
        ? compareValues(parseDisplayDate(left.fecha)?.getTime() ?? 0, parseDisplayDate(right.fecha)?.getTime() ?? 0)
        : compareValues(left[cuadrosDetailSort.key], right[cuadrosDetailSort.key]);

      return cuadrosDetailSort.direction === "asc" ? compared : -compared;
    });
  }, [cuadrosDetailFilter, cuadrosDetailSort, filteredRows]);

  const chartEmpleadoPorDia = useMemo(() => {
    const fechas = getDateRangeLabels(fechaInicio, fechaFin);
    const employees = Array.from(
      new Set(filteredRows.map((item) => item.nombreEmpleado).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "es"));

    const grouped = new Map<string, Map<string, number>>();
    const groupedStates = new Map<string, Map<string, Set<string>>>();
    const employeeLocations = new Map<string, Set<string>>();
    const employeeResponsables = new Map<string, Set<string>>();
    const employeeLaborHours = new Map<string, number>();
    const employeeValidationStates = new Map<string, Set<string>>();
    employees.forEach((employee) => {
      grouped.set(employee, new Map<string, number>());
      groupedStates.set(employee, new Map<string, Set<string>>());
      employeeLocations.set(employee, new Set<string>());
      employeeResponsables.set(employee, new Set<string>());
      employeeLaborHours.set(employee, 0);
      employeeValidationStates.set(employee, new Set<string>());
    });

    filteredRows.forEach((item) => {
      const employee = item.nombreEmpleado || "Sin empleado";
      const fecha = formatDateLabel(item.fecha);
      if (!grouped.has(employee)) {
        grouped.set(employee, new Map<string, number>());
      }
      if (!groupedStates.has(employee)) {
        groupedStates.set(employee, new Map<string, Set<string>>());
      }

      const employeeMap = grouped.get(employee)!;
      employeeMap.set(fecha, (employeeMap.get(fecha) ?? 0) + item.totalHoras);
      const employeeStatesMap = groupedStates.get(employee)!;
      if (!employeeStatesMap.has(fecha)) {
        employeeStatesMap.set(fecha, new Set<string>());
      }
      const estadoMarcacion = item.estadoMarcacionTexto || item.estado;
      if (estadoMarcacion) {
        employeeStatesMap.get(fecha)!.add(estadoMarcacion);
      }

      if (!employeeLocations.has(employee)) {
        employeeLocations.set(employee, new Set<string>());
      }
      if (item.ubicacion) {
        employeeLocations.get(employee)!.add(item.ubicacion);
      }
      if (!employeeResponsables.has(employee)) {
        employeeResponsables.set(employee, new Set<string>());
      }
      if (item.responsable) {
        employeeResponsables.get(employee)!.add(item.responsable);
      }
      employeeLaborHours.set(employee, Math.max(employeeLaborHours.get(employee) ?? 0, item.totalHorasLaborales));
      if (!employeeValidationStates.has(employee)) {
        employeeValidationStates.set(employee, new Set<string>());
      }
      if (item.estadoValidacionHoras) {
        employeeValidationStates.get(employee)!.add(item.estadoValidacionHoras);
      }
    });

    const rows = employees.map((employee) => {
      const values = grouped.get(employee) ?? new Map<string, number>();
      const stateValues = groupedStates.get(employee) ?? new Map<string, Set<string>>();
      const ubicaciones = Array.from(employeeLocations.get(employee) ?? []).sort((a, b) => a.localeCompare(b, "es"));
      const responsables = Array.from(employeeResponsables.get(employee) ?? []).sort((a, b) => a.localeCompare(b, "es"));
      const validationStates = Array.from(employeeValidationStates.get(employee) ?? []).sort((a, b) => a.localeCompare(b, "es"));
      const fechasDetalle = fechas.map((fecha) => ({
        fecha,
        totalHoras: values.get(fecha) ?? 0,
        estadoMarcacionTexto: Array.from(stateValues.get(fecha) ?? []).sort((a, b) => a.localeCompare(b, "es")).join(", "),
      }));
      const totalHorasRango = fechasDetalle.reduce((sum, item) => sum + item.totalHoras, 0);
      const totalHorasFaltaIncompleto = fechasDetalle.reduce((sum, item) => {
        const states = item.estadoMarcacionTexto
          .split(",")
          .map((state) => normalizeText(state))
          .filter(Boolean);

        return states.some((state) => state === "FALTA" || state === "INCOMPLETO")
          ? sum + MISSING_OR_INCOMPLETE_HOURS
          : sum;
      }, 0);

      return {
        employee,
        responsable: responsables.join(", "),
        ubicacion: ubicaciones.join(", "),
        total: totalHorasRango,
        totalHorasFaltaIncompleto,
        totalHorasLaborales: employeeLaborHours.get(employee) ?? 0,
        diferenciaHoras: (totalHorasRango + totalHorasFaltaIncompleto) - (employeeLaborHours.get(employee) ?? 0),
        estadoValidacionHoras: validationStates.join(", "),
        fechas: fechasDetalle,
      };
    });

    return { fechas, rows };
  }, [fechaFin, fechaInicio, filteredRows]);

  const employeeGridValidationOptions = useMemo(
    () => [ALL_OPTION, ...Array.from(new Set(chartEmpleadoPorDia.rows.map((item) => item.estadoValidacionHoras).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es"))],
    [chartEmpleadoPorDia.rows]
  );

  const filteredEmployeeGridRows = useMemo(() => {
    const employeeQuery = employeeGridFilters.employee;
    const responsableQuery = employeeGridFilters.responsable;
    const differenceFilterValue = Number(employeeGridFilters.diferenciaValue);

    return [...chartEmpleadoPorDia.rows.filter((item) => {
      const matchesEmployee = !employeeQuery.trim() ||
        matchesKeywordFilter(item.employee, employeeQuery) ||
        matchesKeywordFilter(item.ubicacion, employeeQuery);
      const matchesResponsable = !responsableQuery.trim() ||
        matchesKeywordFilter(item.responsable, responsableQuery);
      const matchesValidation =
        employeeGridFilters.estadoValidacionHoras === ALL_OPTION ||
        item.estadoValidacionHoras === employeeGridFilters.estadoValidacionHoras;
      const matchesDifference =
        !employeeGridFilters.diferenciaOperator ||
        !employeeGridFilters.diferenciaValue.trim() ||
        !Number.isFinite(differenceFilterValue)
          ? true
          : employeeGridFilters.diferenciaOperator === "lt"
            ? item.diferenciaHoras < differenceFilterValue
            : employeeGridFilters.diferenciaOperator === "gt"
              ? item.diferenciaHoras > differenceFilterValue
              : item.diferenciaHoras === differenceFilterValue;

      return matchesEmployee && matchesResponsable && matchesValidation && matchesDifference;
    })].sort((left, right) => {
      const compared = employeeGridSort.key === "diferencia"
        ? left.diferenciaHoras - right.diferenciaHoras
        : employeeGridSort.key === "otros"
          ? left.totalHorasFaltaIncompleto - right.totalHorasFaltaIncompleto
          : employeeGridSort.key === "responsable"
            ? left.responsable.localeCompare(right.responsable, "es", { sensitivity: "base" })
            : left.total - right.total;
      if (compared !== 0) {
        return employeeGridSort.direction === "asc" ? compared : -compared;
      }

      return left.employee.localeCompare(right.employee, "es");
    });
  }, [chartEmpleadoPorDia.rows, employeeGridFilters, employeeGridSort]);

  const activeFilterCount = useMemo(
    () =>
      Object.values(frontendFilters).filter((value) => value !== ALL_OPTION).length +
      (selectedAreas.length > 0 ? 1 : 0) +
      (selectedEstados.length > 0 ? 1 : 0) +
      (selectedEstadoMarcacion.length > 0 ? 1 : 0) +
      (employeeGridFilters.responsable.trim() ? 1 : 0) +
      ((employeeGridFilters.diferenciaOperator && employeeGridFilters.diferenciaValue.trim()) ? 1 : 0),
    [frontendFilters, selectedAreas, selectedEstados, selectedEstadoMarcacion, employeeGridFilters.responsable, employeeGridFilters.diferenciaOperator, employeeGridFilters.diferenciaValue]
  );

  const primaryFilterCount = 5;

  const isExcelExportDisabled = useMemo(() => {
    if (activeTab === "cuadros") {
      return chartEstadoPorDia.rows.length === 0 || chartEstadoPorDia.states.length === 0;
    }
    if (activeTab === "detalle") {
      return detailRows.length === 0;
    }
    if (activeTab === "empleado") {
      return filteredEmployeeGridRows.length === 0;
    }
    return true;
  }, [activeTab, chartEstadoPorDia.rows.length, chartEstadoPorDia.states.length, detailRows.length, filteredEmployeeGridRows.length]);

  const isPdfExportDisabled = useMemo(() => {
    if (activeTab === "cuadros") {
      return chartEstadoPorDia.rows.length === 0 || chartEstadoPorDia.states.length === 0;
    }
    if (activeTab === "detalle") {
      return detailRows.length === 0;
    }
    if (activeTab === "empleado") {
      return filteredEmployeeGridRows.length === 0;
    }
    return true;
  }, [activeTab, chartEstadoPorDia.rows.length, chartEstadoPorDia.states.length, detailRows.length, filteredEmployeeGridRows.length]);

  const resetFrontendFilters = () => {
    setFrontendFilters({
      estado: ALL_OPTION,
      nombreEmpleado: ALL_OPTION,
      empresa: ALL_OPTION,
      cliente: ALL_OPTION,
      area: ALL_OPTION,
      ubicacion: ALL_OPTION,
      estadoAct: "ACTIVO",
      estadoMarcacionTexto: ALL_OPTION,
      origenMarcacion: ALL_OPTION,
    });
    setSelectedAreas([]);
    setSelectedEstados([]);
    setSelectedEstadoMarcacion([]);
    setCuadrosDetailFilter({ area: null, estadoMarcacion: null });
    setCuadrosDetailSort({ key: "fecha", direction: "asc" });
    setBusqueda("");
    setShowAdvancedFilters(false);
    setEmployeeGridFilters({
      employee: "",
      responsable: "",
      estadoValidacionHoras: ALL_OPTION,
      diferenciaOperator: "",
      diferenciaValue: "",
    });
    setEmployeeGridSort({ key: "total", direction: "desc" });
    setDetailDrilldown({
      fecha: null,
      estadoMarcacion: null,
      origenMarcacion: null,
      nombreEmpleado: null,
      area: null,
    });
  };

  const clearDetailDrilldown = () => {
    setDetailDrilldown({
      fecha: null,
      estadoMarcacion: null,
      origenMarcacion: null,
      nombreEmpleado: null,
      area: null,
    });
  };

  const handleStateDateCellClick = (fecha: string, estadoMarcacion: string) => {
    setDetailDrilldown((prev) => {
      const isSameSelection = prev.fecha === fecha && prev.estadoMarcacion === estadoMarcacion;
      return {
        ...prev,
        fecha: isSameSelection ? null : fecha,
        estadoMarcacion: isSameSelection ? null : estadoMarcacion,
        nombreEmpleado: null,
      };
    });
    setActiveTab("detalle");
  };

  const handleEmployeeDateCellClick = (nombreEmpleado: string, fecha: string) => {
    setDetailDrilldown((prev) => {
      const isSameSelection = prev.fecha === fecha && prev.nombreEmpleado === nombreEmpleado;
      return {
        ...prev,
        fecha: isSameSelection ? null : fecha,
        nombreEmpleado: isSameSelection ? null : nombreEmpleado,
        estadoMarcacion: isSameSelection ? prev.estadoMarcacion : null,
        origenMarcacion: isSameSelection ? prev.origenMarcacion : null,
      };
    });
    setActiveTab("detalle");
  };

  const handleOrigenClick = (origenMarcacion: string) => {
    setDetailDrilldown((prev) => ({
      ...prev,
      origenMarcacion: prev.origenMarcacion === origenMarcacion ? null : origenMarcacion,
    }));
    setActiveTab("detalle");
  };

  const handleAreaStateClick = (area: string, estadoMarcacion: string) => {
    setCuadrosDetailFilter({ area, estadoMarcacion });
    setDetailDrilldown((prev) => ({
      ...prev,
      area,
      estadoMarcacion,
      fecha: null,
      origenMarcacion: null,
      nombreEmpleado: null,
    }));
    setActiveTab("detalle");
  };

  const handleCuadrosAreaClick = (area: string) => {
    setCuadrosDetailFilter((prev) => ({
      area: prev.area === area ? null : area,
      estadoMarcacion: null,
    }));
  };

  const toggleSort = (key: SortKey) => {
    setSortState((prev) => (
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    ));
  };

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();

    if (activeTab === "cuadros") {
      const estadoRows = chartEstadoPorDia.states.map((state) => {
        const row: Record<string, string> = {
          "Estado / Fecha": state,
        };

        chartEstadoPorDia.rows.forEach((item) => {
          const cell = item.estados.find((entry) => entry.state === state);
          const value = cell?.value ?? 0;
          const totalHoras = cell?.totalHoras ?? 0;
          row[item.fecha] = `${value} | ${formatDecimal(totalHoras, 2)} h`;
        });

        return row;
      });

      const worksheet = XLSX.utils.json_to_sheet(estadoRows);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Fecha x estado");
    } else if (activeTab === "empleado") {
      const employeeRows = filteredEmployeeGridRows.map((item) => {
        const row: Record<string, string | number> = {
          Empleado: item.employee,
          Responsable: item.responsable || "Sin responsable",
          Ubicacion: item.ubicacion || "Sin ubicacion",
          "Total horas": Number(formatDecimal(item.total, 2).replace(/,/g, "")),
          "Hrs Lab.": Number(formatDecimal(item.totalHorasLaborales, 2).replace(/,/g, "")),
          "Estado valid.": item.estadoValidacionHoras || "Sin validacion",
        };

        chartEmpleadoPorDia.fechas.forEach((fecha) => {
          const cell = item.fechas.find((entry) => entry.fecha === fecha);
          row[fecha] = buildEmployeeDateCellDisplay(cell);
        });
        return row;
      });

      const worksheet = XLSX.utils.json_to_sheet(employeeRows);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Fecha x empleado");
    } else if (activeTab === "detalle") {
      const worksheet = XLSX.utils.json_to_sheet(getExportRows(detailRows));
      XLSX.utils.book_append_sheet(workbook, worksheet, "Detalle de asistencia");
    } else {
      return;
    }

    XLSX.writeFile(workbook, `reporte_asistencia_${toApiDate(fechaInicio).replaceAll("/", "")}_${toApiDate(fechaFin).replaceAll("/", "")}.xlsx`);
  };

  const exportPdf = async () => {
    if (activeTab === "empleado") {
      const employeeInfoByEmployeeAndDate = new Map(
        filteredRows
          .filter((item) => item.nombreEmpleado)
          .map((item) => [
            `${item.nombreEmpleado}__${formatDateLabel(item.fecha)}`,
            {
              idEmpleado: item.idEmpleado,
              hora: item.hora,
              salida: item.salida,
            },
          ])
      );

      const pdfItems: AsistenciaReportePdfItem[] = filteredEmployeeGridRows.flatMap((row) =>
        row.fechas.map((cell) => {
          const employeeInfo = employeeInfoByEmployeeAndDate.get(`${row.employee}__${cell.fecha}`);

          return {
          fecha: cell.fecha,
          hora: employeeInfo?.hora ?? "",
          nombreEmpleado: row.employee,
          ubicacion: row.ubicacion,
          idEmpleado: employeeInfo?.idEmpleado ?? null,
          salida: employeeInfo?.salida ?? "",
          estadoMarcacionTexto: cell.estadoMarcacionTexto,
          totalHoras: cell.totalHoras,
          totalHorasEmpleado: row.total,
          totalHorasLaborales: row.totalHorasLaborales,
          estadoValidacionHoras: row.estadoValidacionHoras,
          };
        })
      );

      const pdfBlob = await exportarAsistenciaEmpleadoPdf({
        fechaInicio: toApiDate(fechaInicio),
        fechaFin: toApiDate(fechaFin),
        destinatario: "Reporte x Empleado",
        items: pdfItems,
      });

      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `reporte_asistencia_${toApiDate(fechaInicio).replaceAll("/", "")}_${toApiDate(fechaFin).replaceAll("/", "")}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return;
    }

    const [{ jsPDF }, autoTableModule] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Reporte Gerencial de Asistencia", 14, 16);
    doc.setFontSize(10);
    doc.text(`Rango: ${toApiDate(fechaInicio)} - ${toApiDate(fechaFin)}`, 14, 23);

    if (activeTab === "cuadros") {
      autoTableModule.default(doc, {
        startY: 30,
        head: [[
          "Estado / Fecha",
          ...chartEstadoPorDia.rows.map((item) => item.fecha),
        ]],
        body: chartEstadoPorDia.states.map((state) => [
          state,
          ...chartEstadoPorDia.rows.map((item) => {
            const cell = item.estados.find((entry) => entry.state === state);
            const value = cell?.value ?? 0;
            const totalHoras = cell?.totalHoras ?? 0;
            return `${value} | ${formatDecimal(totalHoras, 2)} h`;
          }),
        ]),
        styles: {
          fontSize: 6,
          cellPadding: 1.5,
          overflow: "linebreak",
        },
        headStyles: {
          fillColor: [37, 99, 235],
        },
      });
    } else if (activeTab === "detalle") {
      autoTableModule.default(doc, {
        startY: 30,
        head: [[
          "Fecha",
          "Nombre empleado",
          "Estado",
          "Empresa",
          "Cliente",
          "Area",
          "Ubicacion",
          "Estado activo/baja",
          "Estado marcacion",
          "Origen marcacion",
          "Hora entrada",
          "Hora salida",
          "TiempoHoras",
          "TotalHoras",
          "Comentario",
        ]],
        body: detailRows.map((item) => [
          formatDateLabel(item.fecha),
          item.nombreEmpleado,
          item.estado,
          item.empresa,
          item.cliente,
          item.area,
          item.ubicacion,
          item.estadoAct,
          item.estadoMarcacionTexto,
          item.origenMarcacion,
          item.hora,
          item.salida,
          buildTiempoHorasDisplay(item),
          formatDecimal(item.totalHoras, 2),
          item.comentario,
        ]),
        styles: {
          fontSize: 7,
          cellPadding: 2,
          overflow: "linebreak",
        },
        headStyles: {
          fillColor: [37, 99, 235],
        },
      });
    } else {
      return;
    }

    doc.save(`reporte_asistencia_${toApiDate(fechaInicio).replaceAll("/", "")}_${toApiDate(fechaFin).replaceAll("/", "")}.pdf`);
  };

  return (
    <div style={styles.page}>
      <section style={styles.compactHeader}>
        <div style={styles.headerSearchWrap}>
          <input
            type="text"
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            placeholder="Busqueda rapida por empleado, estado, cliente, area, ubicacion o comentario"
            style={styles.headerSearchInput}
          />
        </div>
        <div style={styles.headerTitleWrap}>
          <span style={styles.eyebrow}>Reporte Gerencial</span>
          <h1 style={styles.compactTitle}>Analisis de asistencia</h1>
        </div>
        <div style={styles.headerActions}>
          <button type="button" style={styles.headerPrimaryButton} onClick={() => void loadData()} disabled={loading}>
            {loading ? "Cargando..." : "Actualizar"}
          </button>
          <button type="button" style={styles.headerSecondaryButton} onClick={resetFrontendFilters}>
            Limpiar filtros
          </button>
          <button type="button" style={styles.headerPrimaryButton} onClick={() => void exportExcel()} disabled={isExcelExportDisabled}>
            Exportar Excel
          </button>
          <button type="button" style={styles.headerSecondaryButton} onClick={() => void exportPdf()} disabled={isPdfExportDisabled}>
            Exportar PDF
          </button>
        </div>
      </section>

      <section style={styles.segmentedTabs}>
        <button
          type="button"
          style={activeTab === "cuadros" ? { ...styles.segmentedTabButton, ...styles.segmentedTabButtonActive } : styles.segmentedTabButton}
          onClick={() => setActiveTab("cuadros")}
        >
          Cuadros
        </button>
        <button
          type="button"
          style={activeTab === "detalle" ? { ...styles.segmentedTabButton, ...styles.segmentedTabButtonActive } : styles.segmentedTabButton}
          onClick={() => setActiveTab("detalle")}
        >
          Detalle
        </button>
        <button
          type="button"
          style={activeTab === "empleado" ? { ...styles.segmentedTabButton, ...styles.segmentedTabButtonActive } : styles.segmentedTabButton}
          onClick={() => setActiveTab("empleado")}
        >
          x Empleado
        </button>
      </section>

      <section style={styles.filterCardCompact}>
        <div style={styles.filterGridCompact}>
          <Field label="Fecha inicio">
            <input type="date" value={fechaInicio} onChange={(event) => setFechaInicio(event.target.value)} style={styles.input} />
          </Field>
          <Field label="Fecha fin">
            <input type="date" value={fechaFin} onChange={(event) => setFechaFin(event.target.value)} style={styles.input} />
          </Field>
          <SelectField
            label="Nombre empleado"
            value={frontendFilters.nombreEmpleado}
            options={filterOptions.nombreEmpleado}
            onChange={(value) => setFrontendFilters((prev) => ({ ...prev, nombreEmpleado: value }))}
          />
          <SelectField
            label="Ubicacion"
            value={frontendFilters.ubicacion}
            options={filterOptions.ubicacion}
            onChange={(value) => setFrontendFilters((prev) => ({ ...prev, ubicacion: value }))}
          />
          <SelectField
            label="Estado activo"
            value={frontendFilters.estadoAct}
            options={filterOptions.estadoAct}
            onChange={(value) => setFrontendFilters((prev) => ({ ...prev, estadoAct: value }))}
          />
          <div style={styles.filterToggleWrap}>
            <span style={styles.filterMetaText}>
              {showAdvancedFilters ? `${Math.max(activeFilterCount - primaryFilterCount, 0)} filtros avanzados activos` : `${activeFilterCount} filtros activos`}
            </span>
            <button
              type="button"
              style={styles.moreFiltersButton}
              onClick={() => setShowAdvancedFilters((prev) => !prev)}
            >
              {showAdvancedFilters ? "Menos filtros" : "Mas filtros"}
            </button>
          </div>
        </div>

        {showAdvancedFilters ? (
          <div style={styles.filterGridAdvanced}>
            <SelectField
              label="Empresa"
              value={frontendFilters.empresa}
              options={filterOptions.empresa}
              onChange={(value) => setFrontendFilters((prev) => ({ ...prev, empresa: value }))}
            />
            <SelectField
              label="Cliente"
              value={frontendFilters.cliente}
              options={filterOptions.cliente}
              onChange={(value) => setFrontendFilters((prev) => ({ ...prev, cliente: value }))}
            />
            <MultiSelectField
              label="Area"
              values={selectedAreas}
              options={filterOptions.area.filter((option) => option !== ALL_OPTION)}
              onChange={setSelectedAreas}
            />
            <MultiSelectField
              label="Estado marcacion"
              values={selectedEstadoMarcacion}
              options={filterOptions.estadoMarcacionTexto.filter((option) => option !== ALL_OPTION)}
              onChange={setSelectedEstadoMarcacion}
            />
            <SelectField
              label="Origen marcacion"
              value={frontendFilters.origenMarcacion}
              options={filterOptions.origenMarcacion}
              onChange={(value) => setFrontendFilters((prev) => ({ ...prev, origenMarcacion: value }))}
            />
          </div>
        ) : null}
      </section>

      {error ? <div style={styles.errorBanner}>{error}</div> : null}

      {activeTab === "cuadros" ? (
        <>
          <section style={styles.stateSummaryRow}>
            {chartEstadoMarcacion.map((item, index) => {
              const isActive = selectedEstadoMarcacion.includes(item.name);
              const stateVisual = getStateVisual(item.name, index);
              return (
                <button
                  key={item.name}
                  type="button"
                  style={{
                    ...styles.stateSummaryButton,
                    background: stateVisual.gradient,
                    color: stateVisual.text,
                    ...(isActive ? styles.stateSummaryButtonActive : null),
                  }}
                  onClick={() =>
                    setSelectedEstadoMarcacion((prev) =>
                      prev.includes(item.name)
                        ? prev.filter((value) => value !== item.name)
                        : [...prev, item.name]
                    )
                  }
                  title={`Filtrar por estado de marcacion: ${item.name}`}
                >
                  <span style={styles.stateSummaryLabel}>{item.name}</span>
                  <span style={styles.stateSummaryValue}>{item.value}</span>
                </button>
              );
            })}
          </section>
          <section style={styles.chartGrid}>
            <div style={{ gridColumn: "1 / 2" }}>
              <div style={styles.cuadrosLeftColumn}>
                <ChartCard title="Origen de marcacion" subtitle="Participacion por origen">
                  <SimpleDonut
                    data={chartOrigen}
                    selectedName={detailDrilldown.origenMarcacion}
                    onSelect={handleOrigenClick}
                  />
                </ChartCard>
                <div style={styles.cuadrosRadioPanel}>
                  <label style={styles.cuadrosRadioOption}>
                    <input
                      type="radio"
                      name="cuadros-view-mode"
                      checked={cuadrosViewMode === "fechaEstado"}
                      onChange={() => setCuadrosViewMode("fechaEstado")}
                    />
                    <span>Fecha por estado</span>
                  </label>
                  <label style={styles.cuadrosRadioOption}>
                    <input
                      type="radio"
                      name="cuadros-view-mode"
                      checked={cuadrosViewMode === "evolucionDiaria"}
                      onChange={() => setCuadrosViewMode("evolucionDiaria")}
                    />
                    <span>Evolucion diaria</span>
                  </label>
                </div>
              </div>
            </div>
            <div style={{ gridColumn: "2 / 3" }}>
              <div style={styles.areaSectionGrid}>
                <ChartCard
                  title="Area x estado de marcacion"
                  subtitle="Cantidades agrupadas por area y diferenciadas por estado segun los filtros actuales"
                >
                <SimpleAreaStateBars
                  data={chartAreaPorEstado.rows}
                  states={chartAreaPorEstado.states}
                  onSelect={handleAreaStateClick}
                  onAreaSelect={handleCuadrosAreaClick}
                />
                </ChartCard>
                <ChartCard
                  title="Detalle filtrado"
                  subtitle="Fecha, empleado, area y estado segun los filtros activos"
                >
                  <div style={{ ...styles.counterPill, alignSelf: "flex-start", marginBottom: 10 }}>
                    {cuadroDetalleRows.length} registro{cuadroDetalleRows.length === 1 ? "" : "s"}
                  </div>
                  <SimpleCuadrosDetailGrid
                    data={cuadroDetalleRows}
                    sortKey={cuadrosDetailSort.key}
                    sortDirection={cuadrosDetailSort.direction}
                    onToggleSort={(key) =>
                      setCuadrosDetailSort((prev) => ({
                        key,
                        direction: prev.key === key ? (prev.direction === "asc" ? "desc" : "asc") : "asc",
                      }))
                    }
                  />
                </ChartCard>
              </div>
            </div>
            {cuadrosViewMode === "fechaEstado" ? (
              <div style={{ gridColumn: "1 / -1" }}>
                <ChartCard title="Fecha x estado de marcacion por dia" subtitle="Fechas en eje X y estados de marcacion en eje Y">
                  <SimpleStateDateGrid
                    data={chartEstadoPorDia.rows}
                    states={chartEstadoPorDia.states}
                    selectedFecha={detailDrilldown.fecha}
                    selectedEstado={detailDrilldown.estadoMarcacion}
                    onSelect={handleStateDateCellClick}
                  />
                </ChartCard>
              </div>
            ) : (
              <div style={{ gridColumn: "1 / -1" }}>
                <ChartCard
                  title="Evolucion diaria por estado de marcacion"
                  subtitle="Cantidad de registros por EstadoMarcacionTexto en el tiempo"
                >
                  <SimpleStateEvolutionChart
                    data={chartEstadoPorDia.rows}
                    states={chartEstadoPorDia.states}
                  />
                </ChartCard>
              </div>
            )}
          </section>
        </>
      ) : null}

      {activeTab === "detalle" ? (
        <section style={styles.tableCard}>
          <div style={styles.filterHeader}>
            <div>
              <h2 style={styles.sectionTitle}>Detalle de asistencia</h2>
              <p style={styles.sectionText}>Tabla con ordenamiento, scroll y resaltado por estado.</p>
              <div style={{ margin: "8px 0", fontWeight: 500, color: "#2563EB" }}>
                Detalle filtrado: {detailRows.length} registro{detailRows.length === 1 ? "" : "s"}
              </div>
              {detailDrilldown.fecha || detailDrilldown.nombreEmpleado || detailDrilldown.estadoMarcacion || detailDrilldown.origenMarcacion ? (
                <div style={styles.drilldownBar}>
                  {detailDrilldown.fecha ? <span style={styles.drilldownPill}>Fecha: {detailDrilldown.fecha}</span> : null}
                  {detailDrilldown.nombreEmpleado ? <span style={styles.drilldownPill}>Empleado: {detailDrilldown.nombreEmpleado}</span> : null}
                  {detailDrilldown.area ? <span style={styles.drilldownPill}>Area: {detailDrilldown.area}</span> : null}
                  {detailDrilldown.estadoMarcacion ? <span style={styles.drilldownPill}>Estado: {detailDrilldown.estadoMarcacion}</span> : null}
                  {detailDrilldown.origenMarcacion ? <span style={styles.drilldownPill}>Origen: {detailDrilldown.origenMarcacion}</span> : null}
                  <button type="button" style={styles.clearDrilldownButton} onClick={clearDetailDrilldown}>
                    Limpiar seleccion
                  </button>
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                title="Ir a Cuadros"
                style={{ ...styles.iconButton, marginRight: 4 }}
                onClick={() => setActiveTab("cuadros")}
              >
                <span style={{ display: "inline-block", verticalAlign: "middle" }}>
                  {/* Icono flecha izquierda */}
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M13 16L7 10L13 4" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              </button>
              <div style={styles.counterPill}>{loading ? "Cargando..." : `${detailRows.length} filas`}</div>
              <button
                type="button"
                title="Ir a x Empleado"
                style={{ ...styles.iconButton, marginLeft: 4 }}
                onClick={() => setActiveTab("empleado")}
              >
                <span style={{ display: "inline-block", verticalAlign: "middle" }}>
                  {/* Icono flecha derecha */}
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M7 4L13 10L7 16" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              </button>
            </div>
          </div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <colgroup>
                {tableColumns.map((column) => (
                  <col key={column.key} style={{ width: column.width }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {tableColumns.map((column) => (
                    <th
                      key={column.key}
                      style={{ ...styles.th, textAlign: column.align ?? "left" }}
                      onClick={() => toggleSort(column.key)}
                    >
                      <div style={styles.thContent}>
                        <span>{column.label}</span>
                        <span style={styles.sortPill}>
                          {sortState.key === column.key ? (sortState.direction === "asc" ? "ASC" : "DESC") : "ORD"}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td style={styles.emptyCell} colSpan={tableColumns.length}>Cargando reporte de asistencia...</td>
                  </tr>
                ) : detailRows.length === 0 ? (
                  <tr>
                    <td style={styles.emptyCell} colSpan={tableColumns.length}>
                      {rows.length === 0 ? "No hay datos para el rango seleccionado." : "No hay registros que coincidan con los filtros actuales o la seleccion de cuadros."}
                    </td>
                  </tr>
                ) : (
                  detailRows.map((item, index) => (
                    <tr key={`${item.idEmpleado ?? item.nombreEmpleado}-${item.fecha}-${index}`} style={{ ...styles.tr, background: getRowTone(item) }}>
                      <td style={styles.td}>{formatDateLabel(item.fecha)}</td>
                      <td style={styles.td}>{item.nombreEmpleado}</td>
                      <td style={styles.td}>{item.estadoMarcacionTexto}</td>
                      <td style={{ ...styles.td, textAlign: "center" }}>{item.hora}</td>
                      <td style={{ ...styles.td, textAlign: "center" }}>{item.salida}</td>
                      <td style={{ ...styles.td, textAlign: "right" }}>{formatDecimal(item.totalHoras, 2)}</td>
                      <td style={styles.td}>{item.empresa}</td>
                      <td style={styles.td}>{item.cliente}</td>
                      <td style={styles.td}>{item.area}</td>
                      <td style={styles.td}>{item.ubicacion}</td>
                      <td style={styles.td}>{item.estadoAct}</td>
                      <td style={styles.td}>{item.comentario}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === "empleado" && (
        <section style={{ ...styles.tableCard, ...styles.employeeGridSection }}>
          <div style={styles.filterHeader}>
            <div>
              <h2 style={styles.sectionTitle}>Fecha x empleado</h2>
              <p style={styles.sectionText}>Vista compacta por empleado con filtros en cabecera.</p>
            </div>
            <div style={styles.counterPill}>{filteredEmployeeGridRows.length} filas</div>
          </div>
          <ChartCard
            title=""
            subtitle=""
            style={styles.employeeGridChartCard}
          >
            <SimpleEmployeeDateGrid
              data={filteredEmployeeGridRows}
              fechas={chartEmpleadoPorDia.fechas}
              employeeFilter={employeeGridFilters.employee}
              onEmployeeFilterChange={(value) => setEmployeeGridFilters((prev) => ({ ...prev, employee: value }))}
              responsableFilter={employeeGridFilters.responsable}
              onResponsableFilterChange={(value) => setEmployeeGridFilters((prev) => ({ ...prev, responsable: value }))}
              validationFilter={employeeGridFilters.estadoValidacionHoras}
              validationOptions={employeeGridValidationOptions}
              onValidationFilterChange={(value) => setEmployeeGridFilters((prev) => ({ ...prev, estadoValidacionHoras: value }))}
              differenceOperator={employeeGridFilters.diferenciaOperator}
              differenceValue={employeeGridFilters.diferenciaValue}
              onDifferenceOperatorChange={(value) => setEmployeeGridFilters((prev) => ({ ...prev, diferenciaOperator: value }))}
              onDifferenceValueChange={(value) => setEmployeeGridFilters((prev) => ({ ...prev, diferenciaValue: value }))}
              sortKey={employeeGridSort.key}
              sortDirection={employeeGridSort.direction}
              onToggleSort={(key) =>
                setEmployeeGridSort((prev) => ({
                  key,
                  direction: prev.key === key ? (prev.direction === "asc" ? "desc" : "asc") : "desc",
                }))
              }
              onCellSelect={handleEmployeeDateCellClick}
            />
          </ChartCard>
        </section>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)} style={styles.input}>
        {options.map((option) => (
          <option key={`${label}-${option}`} value={option}>
            {option === ALL_OPTION ? "Todos" : option}
          </option>
        ))}
      </select>
    </Field>
  );
}

function MultiSelectField({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
}) {
  const summary = values.length === 0
    ? "Todos"
    : values.length === 1
      ? values[0]
      : `${values.length} seleccionados`;

  return (
    <Field label={label}>
      <details style={styles.multiSelectWrap}>
        <summary style={styles.multiSelectSummary}>{summary}</summary>
        <div style={styles.multiSelectPanel}>
          <label style={styles.multiSelectOption}>
            <input
              type="checkbox"
              checked={values.length === 0}
              onChange={() => onChange([])}
            />
            <span>Todos</span>
          </label>
          {options.map((option) => {
            const checked = values.includes(option);
            return (
              <label key={`${label}-${option}`} style={styles.multiSelectOption}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    onChange(
                      checked
                        ? values.filter((item) => item !== option)
                        : [...values, option]
                    );
                  }}
                />
                <span>{option}</span>
              </label>
            );
          })}
        </div>
      </details>
    </Field>
  );
}

function ChartCard({
  title,
  subtitle,
  style,
  children,
}: {
  title: string;
  subtitle: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <article style={{ ...styles.chartCard, ...style }}>
      {title || subtitle ? (
        <div style={{ marginBottom: 10 }}>
          {title ? <h3 style={styles.chartTitle}>{title}</h3> : null}
          {subtitle ? <p style={styles.chartSubtitle}>{subtitle}</p> : null}
        </div>
      ) : null}
      {children}
    </article>
  );
}

function SimpleVerticalBars({
  data,
  colorMode,
}: {
  data: Array<{ name: string; value: number }>;
  colorMode?: "palette";
}) {
  const max = Math.max(...data.map((item) => item.value), 1);

  return (
    <div style={styles.simpleChartWrap}>
      {data.length === 0 ? (
        <div style={styles.emptyMiniState}>Sin datos para graficar.</div>
      ) : (
        <div style={styles.verticalBars}>
          {data.map((item, index) => (
            <div key={item.name} style={styles.verticalBarItem}>
              <div style={styles.verticalBarValue}>{item.value}</div>
              <div style={styles.verticalBarTrack}>
                <div
                  style={{
                    ...styles.verticalBarFill,
                    height: `${(item.value / max) * 100}%`,
                    background: colorMode === "palette" ? chartPalette[index % chartPalette.length] : "#2563EB",
                  }}
                />
              </div>
              <div style={styles.verticalBarLabel}>{item.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SimpleTrendBars({ data }: { data: Array<{ fecha: string; total: number }> }) {
  const max = Math.max(...data.map((item) => item.total), 1);

  return (
    <div style={styles.simpleChartWrap}>
      {data.length === 0 ? (
        <div style={styles.emptyMiniState}>Sin datos para graficar.</div>
      ) : (
        <div style={styles.trendBars}>
          {data.map((item) => (
            <div key={item.fecha} style={styles.trendBarItem}>
              <div style={styles.trendBarTrack}>
                <div
                  style={{
                    ...styles.trendBarFill,
                    height: `${(item.total / max) * 100}%`,
                  }}
                />
              </div>
              <div style={styles.trendBarLabel}>{item.fecha}</div>
              <div style={styles.trendBarValue}>{item.total}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SimpleDailyStateMatrix({
  data,
  states,
}: {
  data: Array<{ fecha: string; total: number; estados: Array<{ state: string; value: number }> }>;
  states: string[];
}) {
  const max = Math.max(
    ...data.flatMap((item) => item.estados.map((estado) => estado.value)),
    1
  );

  return (
    <div style={styles.matrixWrap}>
      {data.length === 0 ? (
        <div style={styles.emptyMiniState}>Sin datos para graficar.</div>
      ) : (
        <>
          <div style={styles.matrixLegend}>
            {states.map((state, index) => (
              <div key={state} style={styles.legendRow}>
                <span
                  style={{
                    ...styles.legendDot,
                    background: getStateVisual(state, index).strong,
                  }}
                />
                <span style={styles.legendLabel}>{state}</span>
              </div>
            ))}
          </div>
          <div style={styles.matrixRows}>
            {data.map((item) => (
              <div key={item.fecha} style={styles.matrixRow}>
                <div style={styles.matrixDate}>
                  <strong>{item.fecha}</strong>
                  <span>{item.total} registros</span>
                </div>
                <div style={styles.matrixCells}>
                  {item.estados.map((estado, index) => (
                    <div key={`${item.fecha}-${estado.state}`} style={styles.matrixCell}>
                      <div style={styles.matrixCellHeader}>
                        <span
                          style={{
                            ...styles.legendDot,
                            width: 10,
                            height: 10,
                            background: getStateVisual(estado.state, index).strong,
                          }}
                        />
                        <span style={styles.matrixCellLabel}>{estado.state}</span>
                      </div>
                      <div style={styles.matrixCellTrack}>
                        <div
                          style={{
                            ...styles.matrixCellFill,
                            width: `${(estado.value / max) * 100}%`,
                            background: getStateVisual(estado.state, index).strong,
                          }}
                        />
                      </div>
                      <strong style={styles.matrixCellValue}>{estado.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SimpleStateDateGrid({
  data,
  states,
  selectedFecha,
  selectedEstado,
  onSelect,
}: {
  data: Array<{ fecha: string; total: number; estados: StateDateCell[] }>;
  states: string[];
  selectedFecha?: string | null;
  selectedEstado?: string | null;
  onSelect?: (fecha: string, estado: string) => void;
}) {
  const max = Math.max(
    ...data.flatMap((item) => item.estados.map((estado) => estado.value)),
    1
  );

  // Mejorar contraste y legibilidad de celdas (igual que grid empleado)
  const getCellStyle = (value: number, state: string) => {
    const stateVisual = getStateVisual(state);
    if (value <= 0) {
      return {
        background: "#FFFFFF",
        color: "#64748B",
        border: "1px solid #E5E7EB"
      };
    }
    return {
      background: stateVisual.strong,
      color: stateVisual.text,
      border: "1px solid #E5E7EB"
    };
  } 

  return (
    <div style={styles.stateDateGridWrap}>
      {data.length === 0 || states.length === 0 ? (
        <div style={styles.emptyMiniState}>Sin datos para graficar.</div>
      ) : (
        <div style={styles.stateDateGridScroller}>
          <div
            style={{
              ...styles.stateDateGrid,
              gridTemplateColumns: `180px repeat(${data.length}, minmax(68px, 1fr))`,
            }}
          >
            <div style={{ ...styles.stateDateGridHeader, ...styles.stateDateGridCorner }}>
              Estado / Fecha
            </div>
            {data.map((item) => (
              <div key={`head-${item.fecha}`} style={styles.stateDateGridHeader}>
                {item.fecha}
              </div>
            ))}

            {states.map((state) => (
              <React.Fragment key={state}>
                <div style={styles.stateDateGridRowLabel}>{state}</div>
                {data.map((item) => {
                  const cell = item.estados.find((entry) => entry.state === state) ?? {
                    state,
                    value: 0,
                    totalHoras: 0,
                  };
                  const value = cell.value;
                  const isSelected = selectedFecha === item.fecha && selectedEstado === state;
                  const cellStyle = getCellStyle(value, state);
                  return (
                    <button
                      type="button"
                      key={`${state}-${item.fecha}`}
                      style={{
                        ...styles.stateDateGridCell,
                        ...cellStyle,
                        boxShadow: isSelected ? "inset 0 0 0 3px #0F172A" : "none",
                        cursor: onSelect ? "pointer" : "default",
                        transition: "background 0.2s, color 0.2s"
                      }}
                      title={`${state} | ${item.fecha}: ${value} registros | ${formatDecimal(cell.totalHoras, 2)} horas`}
                      onClick={() => onSelect?.(item.fecha, state)}
                    >
                      <span style={styles.stateDateGridCellCount}>{value}</span>
                      <span style={styles.stateDateGridCellHours}>
                        {cell.totalHoras > 0 ? `${formatDecimal(cell.totalHoras, 2)} h` : "0.00 h"}
                      </span>
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SimpleEmployeeDateGrid({
  data,
  fechas,
  employeeFilter,
  onEmployeeFilterChange,
  responsableFilter,
  onResponsableFilterChange,
  validationFilter,
  validationOptions,
  onValidationFilterChange,
  differenceOperator,
  differenceValue,
  onDifferenceOperatorChange,
  onDifferenceValueChange,
  sortKey,
  sortDirection,
  onToggleSort,
  onCellSelect,
}: {
  data: EmployeeDateRow[];
  fechas: string[];
  employeeFilter: string;
  onEmployeeFilterChange: (value: string) => void;
  responsableFilter: string;
  onResponsableFilterChange: (value: string) => void;
  validationFilter: string;
  validationOptions: string[];
  onValidationFilterChange: (value: string) => void;
  differenceOperator: "" | "lt" | "gt" | "eq";
  differenceValue: string;
  onDifferenceOperatorChange: (value: "" | "lt" | "gt" | "eq") => void;
  onDifferenceValueChange: (value: string) => void;
  sortKey: "responsable" | "total" | "otros" | "diferencia";
  sortDirection: "asc" | "desc";
  onToggleSort: (key: "responsable" | "total" | "otros" | "diferencia") => void;
  onCellSelect?: (nombreEmpleado: string, fecha: string) => void;
}) {
  const max = Math.max(
    ...data.flatMap((item) => item.fechas.map((fecha) => fecha.totalHoras)),
    1
  );

  // Sin color de fondo si estado es CORRECTO, si no: verde >=9.6, amarillo >0 y <9.6, blanco si 0 o menos
  const getCellStyle = (value: number, estadoMarcacionTexto?: string) => {
    const estado = normalizeText(estadoMarcacionTexto);
    if (estado === "FALTA" || estado === "INCOMPLETO") {
      return {
        background: "#fee2e2", // rojo muy tenue
        color: "#991B1B",
        border: "1px solid #fef2f2"
      };
    }
    if (estado === "CORRECTO") {
      return {
        background: "#fff",
        color: "#166534",
        border: "1px solid #E5E7EB"
      };
    }
    if (value >= 9.6) {
      return {
        background: "#dcfce7",
        color: "#166534",
        border: "1px solid #bbf7d0"
      };
    } else if (value > 0) {
      return {
        background: "#fef9c3",
        color: "#a16207",
        border: "1px solid #fde047"
      };
    } else {
      return {
        background: "#fff",
        color: "#64748B",
        border: "1px solid #E5E7EB"
      };
    }
  };

  const getDifferenceTone = (difference: number) => {
    if (difference < 0) {
      return {
        rowBackground: "#FEF2F2",
        rowText: "#991B1B",
        accentBackground: "#FEE2E2",
        accentText: "#991B1B",
      };
    }

    // Blanco si diferencia >= 0
    return {
      rowBackground: "#FFFFFF",
      rowText: "#166534",
      accentBackground: "#FFFFFF",
      accentText: "#166534",
    };
  };

  return (
    <div style={styles.stateDateGridWrap}>
      {fechas.length === 0 ? (
        <div style={styles.emptyMiniState}>Sin datos para graficar.</div>
      ) : (
        <div style={styles.stateDateGridScroller}>
          <div
            style={{
              ...styles.stateDateGrid,
              gridTemplateColumns: `220px 180px 110px 100px 100px 140px 150px repeat(${fechas.length}, minmax(88px, 1fr))`,
            }}
          >
            <div style={{ ...styles.stateDateGridHeader, ...styles.stateDateGridCorner }}>
              <div style={styles.employeeGridHeaderStack}>
                <span>Empleado / Fecha</span>
                <input
                  type="text"
                  value={employeeFilter}
                  onChange={(event) => onEmployeeFilterChange(event.target.value)}
                  placeholder="Filtrar empleado"
                  style={styles.employeeGridHeaderInput}
                />
              </div>
            </div>
            <div style={styles.stateDateGridHeader}>
              <div style={styles.employeeGridHeaderStack}>
                <button
                  type="button"
                  style={styles.employeeGridSortButton}
                  onClick={() => onToggleSort("responsable")}
                >
                  <span>Responsable</span>
                  <span style={styles.employeeGridSortPill}>
                    {sortKey === "responsable" ? (sortDirection === "asc" ? "ASC" : "DESC") : "ORD"}
                  </span>
                </button>
                <input
                  type="text"
                  value={responsableFilter}
                  onChange={(event) => onResponsableFilterChange(event.target.value)}
                  placeholder="Filtrar responsable"
                  style={styles.employeeGridHeaderInput}
                />
              </div>
            </div>
            <div style={styles.stateDateGridHeader}>
              <button
                type="button"
                style={styles.employeeGridSortButton}
                onClick={() => onToggleSort("total")}
              >
                <span>Total horas</span>
                <span style={styles.employeeGridSortPill}>
                  {sortKey === "total" ? (sortDirection === "asc" ? "ASC" : "DESC") : "ORD"}
                </span>
              </button>
            </div>
            <div style={styles.stateDateGridHeader}>
              <button
                type="button"
                style={styles.employeeGridSortButton}
                onClick={() => onToggleSort("otros")}
              >
                <span>Hrs Otros</span>
                <span style={styles.employeeGridSortPill}>
                  {sortKey === "otros" ? (sortDirection === "asc" ? "ASC" : "DESC") : "ORD"}
                </span>
              </button>
            </div>
            <div style={styles.stateDateGridHeader}>
              Hrs Lab.
            </div>
            <div style={styles.stateDateGridHeader}>
              <div style={styles.employeeGridHeaderStack}>
                <button
                  type="button"
                  style={styles.employeeGridSortButton}
                  onClick={() => onToggleSort("diferencia")}
                >
                  <span>Diferencia</span>
                  <span style={styles.employeeGridSortPill}>
                    {sortKey === "diferencia" ? (sortDirection === "asc" ? "ASC" : "DESC") : "ORD"}
                  </span>
                </button>
                <select
                  value={differenceOperator}
                  onChange={e => {
                    const val = e.target.value as "" | "lt" | "gt" | "eq";
                    onDifferenceOperatorChange(val);
                    if (val === "") onDifferenceValueChange("0");
                  }}
                  style={styles.employeeGridHeaderSelect}
                >
                  <option value="">Sin filtro</option>
                  <option value="lt">Menor a</option>
                  <option value="gt">Mayor a</option>
                  <option value="eq">Igual a</option>
                </select>
                {differenceOperator !== "" && (
                  <input
                    type="number"
                    step="0.01"
                    value={differenceValue}
                    onChange={event => onDifferenceValueChange(event.target.value)}
                    placeholder="Nro"
                    style={styles.employeeGridHeaderInput}
                  />
                )}
              </div>
            </div>
            <div style={styles.stateDateGridHeader}>
              <div style={styles.employeeGridHeaderStack}>
                <span>Estado valid.</span>
                <select
                  value={validationFilter}
                  onChange={(event) => onValidationFilterChange(event.target.value)}
                  style={styles.employeeGridHeaderSelect}
                >
                  {validationOptions.map((option) => (
                    <option key={option} value={option}>
                      {option === ALL_OPTION ? "Todos" : option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {fechas.map((fecha) => (
              <div key={`head-employee-${fecha}`} style={styles.stateDateGridHeader}>
                <div style={styles.employeeGridDateHeader}>
                  <span>{fecha}</span>
                  <span style={styles.employeeGridDateSubheader}>{getDayNameLabel(fecha)}</span>
                </div>
              </div>
            ))}

            {data.length === 0 ? (
              <div style={styles.employeeGridEmptyRow}>
                No hay filas que coincidan con los filtros actuales.
              </div>
            ) : data.map((item) => (
              <React.Fragment key={item.employee}>
                {(() => {
                  const differenceTone = getDifferenceTone(item.diferenciaHoras);
                  return (
                    <>
                <div style={{
                  ...styles.stateDateGridRowLabel,
                  ...styles.employeeGridRowLabel,
                  background: differenceTone.rowBackground,
                  color: differenceTone.rowText,
                }}>
                  <span style={styles.employeeGridRowName}>{item.employee}</span>
                  <span style={styles.employeeGridRowMeta}>{item.ubicacion || "Sin ubicacion"}</span>
                </div>
                <div
                  style={{
                    ...styles.stateDateGridCell,
                    ...styles.employeeGridValidationCell,
                    background: differenceTone.rowBackground,
                    color: differenceTone.rowText,
                  }}
                  title={`${item.employee}: ${item.responsable || "Sin responsable"}`}
                >
                  <span style={styles.employeeGridValidationText}>
                    {item.responsable || "Sin responsable"}
                  </span>
                </div>
                <div
                  style={{
                    ...styles.stateDateGridCell,
                    ...styles.employeeGridTotalCell,
                    background: differenceTone.rowBackground,
                    color: differenceTone.rowText,
                  }}
                  title={`${item.employee}: ${formatDecimal(item.total, 2)} horas totales`}
                >
                  <span style={styles.stateDateGridCellCount}>
                    {item.total > 0 ? formatDecimal(item.total, 2) : "0.00"}
                  </span>
                  <span style={styles.stateDateGridCellHours}>h</span>
                </div>
                <div
                  style={{
                    ...styles.stateDateGridCell,
                    ...styles.employeeGridTotalCell,
                    background: item.totalHorasFaltaIncompleto > 0 ? "#FEF3C7" : "#F8FAFC",
                    color: item.totalHorasFaltaIncompleto > 0 ? "#92400E" : "#94A3B8",
                  }}
                  title={`${item.employee}: ${formatDecimal(item.totalHorasFaltaIncompleto, 2)} horas por FALTA/INCOMPLETO`}
                >
                  <span style={styles.stateDateGridCellCount}>
                    {item.totalHorasFaltaIncompleto > 0 ? formatDecimal(item.totalHorasFaltaIncompleto, 2) : "0.00"}
                  </span>
                  <span style={styles.stateDateGridCellHours}>h</span>
                </div>
                <div
                  style={{
                    ...styles.stateDateGridCell,
                    ...styles.employeeGridTotalCell,
                    background: differenceTone.rowBackground,
                    color: differenceTone.rowText,
                  }}
                  title={`${item.employee}: ${formatDecimal(item.totalHorasLaborales, 2)} horas laborales`}
                >
                  <span style={styles.stateDateGridCellCount}>
                    {item.totalHorasLaborales > 0 ? formatDecimal(item.totalHorasLaborales, 2) : "0.00"}
                  </span>
                  <span style={styles.stateDateGridCellHours}>h</span>
                </div>
                <div
                  style={{
                    ...styles.stateDateGridCell,
                    ...styles.employeeGridTotalCell,
                    background: differenceTone.accentBackground,
                    color: differenceTone.accentText,
                  }}
                  title={`${item.employee}: ${formatDecimal(item.diferenciaHoras, 2)} horas de diferencia`}
                >
                  <span style={styles.stateDateGridCellCount}>
                    {formatDecimal(item.diferenciaHoras, 2)}
                  </span>
                  <span style={styles.stateDateGridCellHours}>h</span>
                </div>
                <div
                  style={{
                    ...styles.stateDateGridCell,
                    ...styles.employeeGridValidationCell,
                    background: differenceTone.rowBackground,
                    color: differenceTone.rowText,
                  }}
                  title={`${item.employee}: ${item.estadoValidacionHoras || "Sin validacion"}`}
                >
                  <span style={styles.employeeGridValidationText}>
                    {item.estadoValidacionHoras || "Sin validacion"}
                  </span>
                </div>
                {item.fechas.map((cell) => {
                  const value = cell.totalHoras;
                  const cellStyle = getCellStyle(value, cell.estadoMarcacionTexto);
                  return (
                    <button
                      type="button"
                      key={`${item.employee}-${cell.fecha}`}
                      style={{
                        ...styles.stateDateGridCell,
                        ...cellStyle,
                        cursor: onCellSelect ? "pointer" : "default",
                        transition: "background 0.2s, color 0.2s"
                      }}
                      title={`${item.employee} | ${cell.fecha}: ${formatDecimal(cell.totalHoras, 2)} horas${cell.estadoMarcacionTexto ? ` | ${cell.estadoMarcacionTexto}` : ""}`}
                      onClick={() => onCellSelect?.(item.employee, cell.fecha)}
                    >
                      <span style={styles.stateDateGridCellCount}>
                        {value > 0 ? formatDecimal(cell.totalHoras, 2) : "0.00"}
                      </span>
                      <span style={styles.stateDateGridCellHours}>h</span>
                      <span style={styles.employeeGridCellState}>
                        {cell.estadoMarcacionTexto || "-"}
                      </span>
                    </button>
                  );
                })}
                    </>
                  );
                })()}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SimpleStateEvolutionChart({
  data,
  states,
}: {
  data: Array<{ fecha: string; total: number; estados: StateDateCell[] }>;
  states: string[];
}) {
  const filteredStates = states.filter((state) => {
    const normalized = normalizeText(state);
    return normalized !== "SABADO" && normalized !== "DOMINGO" && normalized !== "FERIADO";
  });
  const chartWidth = 1120;
  const chartHeight = 320;
  const paddingLeft = 20;
  const paddingRight = 0;
  const paddingTop = 18;
  const paddingBottom = 42;
  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;
  const maxValue = Math.max(
    ...data.flatMap((item) =>
      item.estados
        .filter((estado) => filteredStates.includes(estado.state))
        .map((estado) => estado.value)
    ),
    1
  );
  const ySteps = 5;

  if (data.length === 0 || filteredStates.length === 0) {
    return <div style={styles.emptyMiniState}>Sin datos para graficar.</div>;
  }

  const xForIndex = (index: number) =>
    paddingLeft + ((data.length === 1 ? 0.5 : index / (data.length - 1)) * innerWidth);
  const yForValue = (value: number) =>
    paddingTop + innerHeight - ((value / maxValue) * innerHeight);

  return (
    <div style={styles.stateEvolutionWrap}>
      <div style={styles.stateEvolutionLegend}>
        {filteredStates.map((state, index) => (
          <div key={state} style={styles.legendRow}>
            <span
              style={{
                ...styles.stateEvolutionLegendLine,
                background: getStateVisual(state, index).strong,
              }}
            />
            <span style={styles.legendLabel}>{state}</span>
          </div>
        ))}
      </div>
      <div style={styles.stateEvolutionScroller}>
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          style={styles.stateEvolutionSvg}
          aria-label="Evolucion diaria por estado de marcacion"
        >
          {Array.from({ length: ySteps + 1 }).map((_, step) => {
            const value = (maxValue / ySteps) * step;
            const y = yForValue(value);
            return (
              <g key={`grid-${step}`}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={chartWidth - paddingRight}
                  y2={y}
                  stroke="#E2E8F0"
                  strokeDasharray="4 4"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  style={styles.stateEvolutionAxisText}
                >
                  {Math.round(value)}
                </text>
              </g>
            );
          })}

          {data.map((item, index) => (
            <g key={`x-${item.fecha}`}>
              <text
                x={xForIndex(index)}
                y={chartHeight - 22}
                textAnchor="middle"
                style={styles.stateEvolutionAxisText}
              >
                {formatShortDateLabel(item.fecha)}
              </text>
              <text
                x={xForIndex(index)}
                y={chartHeight - 8}
                textAnchor="middle"
                style={styles.stateEvolutionAxisSubtext}
              >
                {getDayNameLabel(item.fecha)}
              </text>
            </g>
          ))}

          {filteredStates.map((state, stateIndex) => {
            const points = data.map((item, index) => {
              const value = item.estados.find((estado) => estado.state === state)?.value ?? 0;
              return {
                x: xForIndex(index),
                y: yForValue(value),
                value,
                key: item.fecha,
              };
            });

            const path = points
              .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
              .join(" ");

            return (
              <g key={`series-${state}`}>
                <path
                  d={path}
                  fill="none"
                  stroke={getStateVisual(state, stateIndex).strong}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {points.map((point) => (
                  <g key={`${state}-${point.key}`}>
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={3.5}
                      fill={getStateVisual(state, stateIndex).strong}
                    />
                    <text
                      x={point.x}
                      y={point.y - 10}
                      textAnchor="middle"
                      style={styles.stateEvolutionPointLabel}
                    >
                      {point.value}
                    </text>
                    <title>{`${state} | ${point.key}: ${point.value}`}</title>
                  </g>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function SimpleDonut({
  data,
  selectedName,
  onSelect,
}: {
  data: Array<{ name: string; value: number }>;
  selectedName?: string | null;
  onSelect?: (name: string) => void;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  const gradient = data.length
    ? (() => {
        let current = 0;
        const slices = data.map((item, index) => {
          const start = current;
          const percentage = total > 0 ? (item.value / total) * 100 : 0;
          current += percentage;
          return `${chartPalette[index % chartPalette.length]} ${start}% ${current}%`;
        });
        return `conic-gradient(${slices.join(", ")})`;
      })()
    : "#E5E7EB";

  return (
    <div style={styles.donutLayout}>
      <div style={{ ...styles.donutChart, background: gradient }}>
        <div style={styles.donutInner}>
          <strong style={{ fontSize: 24, color: "#0F172A" }}>{total}</strong>
          <span style={{ fontSize: 11, color: "#64748B" }}>registros</span>
        </div>
      </div>
      <div style={styles.donutLegend}>
        {data.length === 0 ? (
          <div style={styles.emptyMiniState}>Sin datos para graficar.</div>
        ) : (
          data.map((item, index) => (
            <button
              key={item.name}
              type="button"
              style={{
                ...styles.donutLegendButton,
                ...(selectedName === item.name ? styles.donutLegendButtonActive : null),
              }}
              onClick={() => onSelect?.(item.name)}
              title={`Filtrar detalle por origen: ${item.name}`}
            >
              <span
                style={{
                  ...styles.legendDot,
                  background: chartPalette[index % chartPalette.length],
                }}
              />
              <span style={styles.legendLabel}>{item.name}</span>
              <strong style={styles.legendValue}>{item.value}</strong>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function SimpleAreaStateBars({
  data,
  states,
  onSelect,
  onAreaSelect,
}: {
  data: Array<{ area: string; total: number; estados: Array<{ state: string; value: number }> }>;
  states: string[];
  onSelect?: (area: string, estadoMarcacion: string) => void;
  onAreaSelect?: (area: string) => void;
}) {
  return (
    <div style={styles.locationStateWrap}>
      {data.length === 0 ? (
        <div style={styles.emptyMiniState}>Sin datos para graficar.</div>
      ) : (
        <>
	          <div style={styles.locationStateLegend}>
	            {states.map((state, index) => (
	              <div key={state} style={styles.legendRow}>
	                <span
	                  style={{
	                    ...styles.legendDot,
	                    background: getStateVisual(state, index).strong,
	                  }}
	                />
	                <span style={styles.legendLabel}>{state}</span>
	              </div>
	            ))}
          </div>
          <div style={styles.locationStateRows}>
            {data.map((item) => (
              <div key={item.area} style={styles.locationStateRow}>
                <div style={styles.locationStateChartRow}>
                  <button
                    type="button"
                    style={styles.locationStateAreaButton}
                    onClick={() => onAreaSelect?.(item.area)}
                    title={`Filtrar detalle por area: ${item.area}`}
                  >
                    {item.area}
                  </button>
                  <div style={styles.locationStateTrack}>
                    {item.estados.map((estado) => {
                      const colorIndex = states.indexOf(estado.state);
                      const stateVisual = getStateVisual(estado.state, colorIndex >= 0 ? colorIndex : 0);
                      const width = item.total > 0 ? `${(estado.value / item.total) * 100}%` : "0%";
                      return (
                        <button
                          type="button"
                          key={`${item.area}-bar-${estado.state}`}
	                          style={{
	                            ...styles.locationStateSegment,
	                            width,
	                            background: stateVisual.strong,
	                            cursor: onSelect ? "pointer" : "default",
                          }}
                          title={`${item.area} | ${estado.state}: ${estado.value}`}
                          onClick={() => onSelect?.(item.area, estado.state)}
                        >
                          <span style={styles.locationStateSegmentValue}>{estado.value}</span>
                        </button>
                      );
                    })}
                  </div>
                  <strong style={styles.locationStateTotal}>{item.total}</strong>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SimpleCuadrosDetailGrid({
  data,
  sortKey,
  sortDirection,
  onToggleSort,
}: {
  data: Array<{
    key: string;
    fecha: string;
    nombreEmpleado: string;
    area: string;
    estadoMarcacionTexto: string;
  }>;
  sortKey: CuadrosDetailSortKey;
  sortDirection: "asc" | "desc";
  onToggleSort: (key: CuadrosDetailSortKey) => void;
}) {
  const renderSortPill = (key: CuadrosDetailSortKey) =>
    sortKey === key ? (sortDirection === "asc" ? "ASC" : "DESC") : "ORD";

  return (
    <div style={styles.cuadrosDetailWrap}>
      {data.length === 0 ? (
        <div style={styles.emptyMiniState}>Sin registros para mostrar.</div>
      ) : (
        <div style={styles.cuadrosDetailScroller}>
          <table style={styles.cuadrosDetailTable}>
            <thead>
              <tr>
                <th style={styles.cuadrosDetailTh} onClick={() => onToggleSort("fecha")}>
                  <div style={styles.cuadrosDetailThContent}><span>Fecha</span><span style={styles.cuadrosDetailSortPill}>{renderSortPill("fecha")}</span></div>
                </th>
                <th style={styles.cuadrosDetailTh} onClick={() => onToggleSort("nombreEmpleado")}>
                  <div style={styles.cuadrosDetailThContent}><span>Nombre empleado</span><span style={styles.cuadrosDetailSortPill}>{renderSortPill("nombreEmpleado")}</span></div>
                </th>
                <th style={styles.cuadrosDetailTh} onClick={() => onToggleSort("area")}>
                  <div style={styles.cuadrosDetailThContent}><span>Area</span><span style={styles.cuadrosDetailSortPill}>{renderSortPill("area")}</span></div>
                </th>
                <th style={styles.cuadrosDetailTh} onClick={() => onToggleSort("estadoMarcacionTexto")}>
                  <div style={styles.cuadrosDetailThContent}><span>Estado marcacion</span><span style={styles.cuadrosDetailSortPill}>{renderSortPill("estadoMarcacionTexto")}</span></div>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.key}>
                  <td style={styles.cuadrosDetailTd}>{item.fecha}</td>
                  <td style={styles.cuadrosDetailTd}>{item.nombreEmpleado}</td>
                  <td style={styles.cuadrosDetailTd}>{item.area}</td>
                  <td style={styles.cuadrosDetailTd}>{item.estadoMarcacionTexto}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const kpiToneStyles: Record<KPI["tone"], React.CSSProperties> = {
  blue: { background: "linear-gradient(135deg, #DBEAFE 0%, #EFF6FF 100%)" },
  green: { background: "linear-gradient(135deg, #DCFCE7 0%, #F0FDF4 100%)" },
  amber: { background: "linear-gradient(135deg, #FEF3C7 0%, #FFF7ED 100%)" },
  red: { background: "linear-gradient(135deg, #FEE2E2 0%, #FEF2F2 100%)" },
  slate: { background: "linear-gradient(135deg, #E2E8F0 0%, #F8FAFC 100%)" },
};

const styles: Record<string, React.CSSProperties> = {
    iconButton: {
      border: "1px solid #E0E7EF",
      background: "linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)",
      color: "#334155",
      borderRadius: 10,
      height: 32,
      padding: "0 12px",
      fontSize: 12,
      fontWeight: 3700,
      cursor: "pointer",
      transition: "background 0.2s, border 0.2s, color 0.2s",
      boxShadow: "0 2px 8px rgba(15, 23, 42, 0.03)",
    },
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minWidth: 0,
    overflow: "hidden",
    paddingBottom: 10,
  },
  compactHeader: {
    background: "linear-gradient(135deg, #FFFDF7 0%, #F8FAFC 100%)",
    border: "1px solid #E5E7EB",
    borderRadius: 14,
    padding: "10px 14px",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
    display: "grid",
    gridTemplateColumns: "minmax(240px, 1fr) auto minmax(360px, auto)",
    gap: 10,
    alignItems: "center",
  },
  headerSearchWrap: {
    display: "flex",
    alignItems: "center",
    minWidth: 0,
  },
  headerSearchInput: {
    width: "100%",
    height: 32,
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    padding: "4px 10px",
    fontSize: 12,
    background: "#FFFFFF",
    boxSizing: "border-box",
  },
  headerTitleWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
    gap: 1,
  },
  compactTitle: {
    margin: 0,
    fontSize: 17,
    lineHeight: 1.1,
    color: "#0F172A",
    whiteSpace: "nowrap",
  },
  headerActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    flexWrap: "wrap",
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: 800,
    color: "#0F766E",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  headerPrimaryButton: {
    border: "none",
    background: "linear-gradient(135deg, #6E4CCB 0%, #7C3AED 100%)",
    color: "#FFFFFF",
    borderRadius: 10,
    height: 32,
    padding: "0 12px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  headerSecondaryButton: {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#334155",
    borderRadius: 10,
    height: 32,
    padding: "0 12px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  filterCardCompact: {
    background: "#FFFFFF",
    borderRadius: 14,
    border: "1px solid #E2E8F0",
    padding: "10px 14px",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  segmentedTabs: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    alignItems: "center",
  },
  segmentedTabButton: {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#334155",
    borderRadius: 999,
    height: 30,
    padding: "0 14px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(15, 23, 42, 0.04)",
  },
  segmentedTabButtonActive: {
    border: "1px solid #C4B5FD",
    background: "linear-gradient(135deg, #6E4CCB 0%, #8B5CF6 100%)",
    color: "#FFFFFF",
  },
  filterHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 18,
    color: "#0F172A",
  },
  sectionText: {
    margin: "2px 0 0",
    color: "#64748B",
    fontSize: 11,
  },
  filterGridCompact: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 8,
    alignItems: "end",
  },
  filterGridAdvanced: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 8,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#334155",
  },
  input: {
    width: "100%",
    height: 32,
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    padding: "4px 8px",
    fontSize: 12,
    background: "#FFFFFF",
    boxSizing: "border-box",
  },
  multiSelectWrap: {
    position: "relative",
  },
  multiSelectSummary: {
    width: "100%",
    height: 32,
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    padding: "7px 10px",
    fontSize: 12,
    background: "#FFFFFF",
    boxSizing: "border-box",
    cursor: "pointer",
    listStyle: "none",
    color: "#0F172A",
  },
  multiSelectPanel: {
    position: "absolute",
    top: 36,
    left: 0,
    right: 0,
    zIndex: 20,
    maxHeight: 220,
    overflowY: "auto",
    border: "1px solid #CBD5E1",
    borderRadius: 10,
    background: "#FFFFFF",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.12)",
    padding: 8,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  multiSelectOption: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    color: "#334155",
  },
  filterToggleWrap: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 32,
  },
  filterMetaText: {
    fontSize: 11,
    color: "#64748B",
    whiteSpace: "nowrap",
  },
  moreFiltersButton: {
    border: "1px solid #C4B5FD",
    background: "#F5F3FF",
    color: "#6D28D9",
    borderRadius: 10,
    height: 30,
    padding: "0 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  counterPill: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "#F1F5F9",
    color: "#334155",
    fontWeight: 700,
    fontSize: 11,
  },
  errorBanner: {
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    color: "#B91C1C",
    borderRadius: 16,
    padding: 14,
    fontSize: 13,
    fontWeight: 700,
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
  },
  kpiCard: {
    borderRadius: 14,
    padding: "10px 14px",
    boxShadow: "0 10px 20px rgba(15, 23, 42, 0.05)",
    border: "1px solid rgba(255,255,255,0.7)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minHeight: 78,
  },
  kpiLabel: {
    fontSize: 12,
    color: "#475569",
    fontWeight: 700,
  },
  kpiValue: {
    fontSize: 24,
    color: "#0F172A",
    lineHeight: 1.1,
  },
  chartGrid: {
    display: "grid",
    gridTemplateColumns: "20% 80%",
    gap: 16,
    alignItems: "stretch",
  },
  chartCard: {
    background: "#FFFFFF",
    borderRadius: 14,
    border: "1px solid #E2E8F0",
    padding: "10px 14px",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
    minWidth: 0,
    overflow: "hidden",
  },
  areaSectionGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.6fr) minmax(300px, 0.75fr)",
    gap: 16,
    alignItems: "stretch",
  },
  cuadrosLeftColumn: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    height: "100%",
  },
  cuadrosRadioPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "12px 14px",
    border: "1px solid #E2E8F0",
    borderRadius: 14,
    background: "#FFFFFF",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
  },
  cuadrosRadioOption: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 700,
    color: "#334155",
    cursor: "pointer",
  },
  stateSummaryRow: {
    display: "flex",
    gap: 12,
    flexWrap: "nowrap",
    overflowX: "auto",
    overflowY: "hidden",
    paddingBottom: 4,
  },
  chartTitle: {
    margin: 0,
    fontSize: 18,
    color: "#0F172A",
  },
  chartSubtitle: {
    margin: "4px 0 0",
    fontSize: 12,
    color: "#64748B",
  },
  simpleChartWrap: {
    minHeight: 280,
    display: "flex",
    alignItems: "stretch",
    justifyContent: "center",
  },
  emptyMiniState: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    color: "#64748B",
    fontSize: 13,
  },
  stateSummaryButton: {
    minWidth: 132,
    flex: "0 0 auto",
    border: "1px solid rgba(148, 163, 184, 0.28)",
    color: "#334155",
    borderRadius: 12,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 8px rgba(15, 23, 42, 0.06)",
    cursor: "pointer",
  },
  stateSummaryButtonActive: {
    boxShadow: "0 0 0 2px rgba(37, 99, 235, 0.22), 0 6px 16px rgba(37, 99, 235, 0.12)",
    transform: "translateY(-1px)",
  },
  stateSummaryLabel: {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 2,
    textAlign: "center",
  },
  stateSummaryValue: {
    fontSize: 22,
    fontWeight: 800,
    lineHeight: 1.1,
  },
  verticalBars: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(72px, 1fr))",
    gap: 12,
    alignItems: "end",
  },
  verticalBarItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  verticalBarTrack: {
    height: 170,
    width: 36,
    background: "#E5E7EB",
    borderRadius: 999,
    display: "flex",
    alignItems: "flex-end",
    overflow: "hidden",
  },
  verticalBarFill: {
    width: "100%",
    borderRadius: 999,
    minHeight: 6,
  },
  verticalBarLabel: {
    fontSize: 11,
    color: "#475569",
    textAlign: "center",
    wordBreak: "break-word",
  },
  verticalBarValue: {
    fontSize: 12,
    fontWeight: 700,
    color: "#0F172A",
  },
  trendBars: {
    width: "100%",
    minHeight: 280,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(48px, 1fr))",
    gap: 10,
    alignItems: "end",
  },
  trendBarItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
  },
  trendBarTrack: {
    height: 180,
    width: 26,
    background: "#DCFCE7",
    borderRadius: 999,
    display: "flex",
    alignItems: "flex-end",
    overflow: "hidden",
  },
  trendBarFill: {
    width: "100%",
    borderRadius: 999,
    minHeight: 6,
    background: "#059669",
  },
  trendBarLabel: {
    fontSize: 10,
    color: "#475569",
    textAlign: "center",
    writingMode: "vertical-rl",
    transform: "rotate(180deg)",
    minHeight: 84,
  },
  trendBarValue: {
    fontSize: 11,
    fontWeight: 700,
    color: "#0F172A",
  },
  donutLayout: {
    minHeight: 230,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    maxWidth: "100%",
    overflow: "hidden",
    gap: 12,
  },
  donutChart: {
    width: 148,
    height: 148,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    justifySelf: "center",
  },
  donutInner: {
    width: 88,
    height: 88,
    borderRadius: "50%",
    background: "#FFFFFF",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "inset 0 0 0 1px #E5E7EB",
  },
  donutLegend: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    maxWidth: "100%",
    paddingBottom: 2,
  },
  donutLegendButton: {
    display: "grid",
    gridTemplateColumns: "12px 1fr auto",
    gap: 10,
    alignItems: "center",
    border: "1px solid transparent",
    borderRadius: 10,
    background: "#FFFFFF",
    padding: "8px 10px",
    textAlign: "left",
    cursor: "pointer",
  },
  donutLegendButtonActive: {
    background: "#EFF6FF",
    border: "1px solid #93C5FD",
    boxShadow: "0 0 0 1px rgba(37, 99, 235, 0.12)",
  },
  matrixWrap: {
    minHeight: 280,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  matrixLegend: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  },
  matrixRows: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    maxHeight: 320,
    overflow: "auto",
    paddingRight: 4,
  },
  matrixRow: {
    border: "1px solid #E2E8F0",
    borderRadius: 14,
    padding: 12,
    background: "#F8FAFC",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  matrixDate: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
    fontSize: 12,
    color: "#334155",
  },
  matrixCells: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 10,
  },
  matrixCell: {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    padding: 10,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  matrixCellHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  matrixCellLabel: {
    fontSize: 11,
    color: "#334155",
    fontWeight: 600,
  },
  matrixCellTrack: {
    height: 10,
    background: "#E5E7EB",
    borderRadius: 999,
    overflow: "hidden",
  },
  matrixCellFill: {
    height: "100%",
    borderRadius: 999,
    minWidth: 4,
  },
  matrixCellValue: {
    fontSize: 12,
    color: "#0F172A",
  },
  locationStateWrap: {
    minHeight: 280,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  locationStateLegend: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  },
  locationStateRows: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    maxHeight: 248,
    overflowY: "auto",
    paddingRight: 4,
  },
  locationStateRow: {
    padding: "6px 0",
  },
  locationStateChartRow: {
    display: "grid",
    gridTemplateColumns: "180px minmax(280px, 1fr) 40px",
    gap: 12,
    alignItems: "center",
  },
  locationStateAreaLabel: {
    fontSize: 13,
    color: "#0F172A",
    lineHeight: 1.2,
  },
  locationStateAreaButton: {
    border: "none",
    background: "transparent",
    padding: 0,
    margin: 0,
    textAlign: "left",
    fontSize: 13,
    fontWeight: 700,
    color: "#0F172A",
    lineHeight: 1.2,
    cursor: "pointer",
  },
  locationStateTrack: {
    width: "100%",
    height: 28,
    display: "flex",
    overflow: "hidden",
    borderRadius: 8,
    background: "#E2E8F0",
  },
  locationStateSegment: {
    height: "100%",
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: 800,
    lineHeight: 1,
    overflow: "hidden",
    whiteSpace: "nowrap",
    border: "none",
    padding: 0,
    appearance: "none",
  },
  locationStateSegmentValue: {
    padding: "0 4px",
    textShadow: "0 1px 1px rgba(15, 23, 42, 0.25)",
  },
  locationStateTotal: {
    fontSize: 13,
    color: "#0F172A",
    textAlign: "right",
  },
  stateEvolutionWrap: {
    minHeight: 320,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  stateEvolutionLegend: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  },
  stateEvolutionScroller: {
    overflowX: "auto",
    overflowY: "hidden",
    paddingBottom: 4,
  },
  stateEvolutionSvg: {
    width: "100%",
    minWidth: 980,
    height: 320,
    display: "block",
  },
  stateEvolutionLegendLine: {
    width: 18,
    height: 3,
    borderRadius: 999,
    display: "inline-block",
    marginTop: 4,
  },
  stateEvolutionAxisText: {
    fontSize: 11,
    fill: "#64748B",
    fontWeight: 600,
  },
  stateEvolutionAxisSubtext: {
    fontSize: 10,
    fill: "#94A3B8",
    fontWeight: 600,
    textTransform: "capitalize",
  },
  stateEvolutionPointLabel: {
    fontSize: 10,
    fill: "#334155",
    fontWeight: 700,
  },
  cuadrosDetailWrap: {
    minHeight: 280,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  cuadrosDetailScroller: {
    flex: 1,
    maxHeight: 312,
    overflow: "auto",
    border: "1px solid #E2E8F0",
    borderRadius: 12,
  },
  cuadrosDetailTable: {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
    tableLayout: "fixed",
    background: "#FFFFFF",
  },
  cuadrosDetailTh: {
    position: "sticky",
    top: 0,
    zIndex: 1,
    background: "#F8FAFC",
    borderBottom: "1px solid #E2E8F0",
    padding: "10px 8px",
    fontSize: 11,
    fontWeight: 800,
    color: "#0F172A",
    textAlign: "left",
    cursor: "pointer",
  },
  cuadrosDetailThContent: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cuadrosDetailSortPill: {
    fontSize: 10,
    fontWeight: 800,
    color: "#2563EB",
    background: "#DBEAFE",
    padding: "3px 6px",
    borderRadius: 999,
  },
  cuadrosDetailTd: {
    borderBottom: "1px solid #E2E8F0",
    padding: "8px",
    fontSize: 11,
    color: "#334155",
    verticalAlign: "top",
    wordBreak: "break-word",
  },
  stateDateGridWrap: {
    minHeight: 280,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    width: "100%",
  },
  stateDateGridScroller: {
    overflowX: "auto",
    overflowY: "auto",
    flex: 1,
    height: "100%",
    minHeight: 200,
    border: "1px solid #E2E8F0",
    borderRadius: 14,
  },
  stateDateGrid: {
    display: "grid",
    alignItems: "stretch",
    minWidth: "max-content",
  },
  stateDateGridHeader: {
    position: "sticky",
    top: 0,
    zIndex: 1,
    padding: "10px 8px",
    background: "#E2E8F0",
    borderRight: "1px solid #CBD5E1",
    borderBottom: "1px solid #CBD5E1",
    fontSize: 11,
    fontWeight: 800,
    color: "#0F172A",
    textAlign: "center",
  },
  stateDateGridCorner: {
    left: 0,
    zIndex: 2,
  },
  stateDateGridRowLabel: {
    position: "sticky",
    left: 0,
    zIndex: 1,
    padding: "10px 12px",
    background: "#F8FAFC",
    borderRight: "1px solid #E2E8F0",
    borderBottom: "1px solid #E2E8F0",
    fontSize: 11,
    fontWeight: 700,
    color: "#334155",
    display: "flex",
    alignItems: "center",
  },
  employeeGridRowLabel: {
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 4,
  },
  employeeGridRowName: {
    fontSize: 11,
    fontWeight: 800,
    color: "inherit",
    lineHeight: 1.15,
  },
  employeeGridRowMeta: {
    fontSize: 10,
    fontWeight: 600,
    color: "inherit",
    opacity: 0.9,
    lineHeight: 1.15,
  },
  employeeGridTotalCell: {
    borderRight: "1px solid #CBD5E1",
  },
  employeeGridValidationCell: {
    borderRight: "1px solid #CBD5E1",
    alignItems: "flex-start",
    justifyContent: "center",
    textAlign: "left",
    padding: "8px 10px",
  },
  employeeGridValidationText: {
    fontSize: 10,
    fontWeight: 700,
    color: "inherit",
    lineHeight: 1.2,
    wordBreak: "break-word",
  },
  employeeGridHeaderStack: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    alignItems: "stretch",
  },
  employeeGridDateHeader: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    lineHeight: 1.1,
  },
  employeeGridDateSubheader: {
    fontSize: 9,
    fontWeight: 600,
    color: "#64748B",
    textTransform: "capitalize",
  },
  employeeGridHeaderInput: {
    width: "100%",
    minWidth: 0,
    height: 28,
    borderRadius: 8,
    border: "1px solid #BFDBFE",
    padding: "4px 8px",
    fontSize: 11,
    color: "#0F172A",
    background: "#FFFFFF",
    outline: "none",
  },
  employeeGridHeaderSelect: {
    width: "100%",
    minWidth: 0,
    height: 28,
    borderRadius: 8,
    border: "1px solid #BFDBFE",
    padding: "4px 8px",
    fontSize: 11,
    color: "#0F172A",
    background: "#FFFFFF",
    outline: "none",
  },
  employeeGridSortButton: {
    width: "100%",
    border: "none",
    background: "transparent",
    color: "#0F172A",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontSize: 11,
    fontWeight: 800,
    cursor: "pointer",
    padding: 0,
  },
  employeeGridSortPill: {
    fontSize: 10,
    fontWeight: 800,
    color: "#2563EB",
    background: "#DBEAFE",
    padding: "3px 6px",
    borderRadius: 999,
  },
  stateDateGridCell: {
    minHeight: 54,
    padding: "8px 6px",
    border: "none",
    borderRight: "1px solid #E2E8F0",
    borderBottom: "1px solid #E2E8F0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    fontSize: 12,
    fontWeight: 800,
    appearance: "none",
  },
  stateDateGridCellCount: {
    fontSize: 13,
    fontWeight: 800,
    lineHeight: 1.1,
  },
  stateDateGridCellHours: {
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1.1,
    opacity: 0.92,
  },
  employeeGridCellState: {
    fontSize: 9,
    fontWeight: 700,
    lineHeight: 1.15,
    textAlign: "center",
    opacity: 0.95,
    wordBreak: "break-word",
  },
  employeeGridEmptyRow: {
    gridColumn: "1 / -1",
    minHeight: 72,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px 20px",
    background: "#FFFFFF",
    borderBottom: "1px solid #E2E8F0",
    color: "#64748B",
    fontSize: 13,
    fontWeight: 600,
  },
  legendRow: {
    display: "grid",
    gridTemplateColumns: "12px 1fr",
    gap: 10,
    alignItems: "center",
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
  },
  legendLabel: {
    fontSize: 12,
    color: "#334155",
  },
  legendValue: {
    fontSize: 12,
    color: "#0F172A",
  },
  drilldownBar: {
    marginTop: 12,
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  drilldownPill: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 30,
    padding: "4px 12px",
    borderRadius: 999,
    background: "#EFF6FF",
    border: "1px solid #BFDBFE",
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: 700,
  },
  clearDrilldownButton: {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#334155",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  tableCard: {
    background: "#FFFFFF",
    borderRadius: 14,
    border: "1px solid #E2E8F0",
    padding: "10px 14px",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    height: "calc(100vh - 240px)", // Ajusta este valor según el alto de header, filtros, etc.
    minHeight: 320,
    maxHeight: "100vh",
  },
  employeeGridSection: {
    height: "calc(100vh - 240px)",
    minHeight: 320,
    maxHeight: "100vh",
    overflow: "hidden",
    minWidth: 0,
  },
  employeeGridChartCard: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },
  tableWrap: {
    overflow: "auto",
    border: "1px solid #E2E8F0",
    borderRadius: 16,
    maxHeight: "70vh",
  },
  table: {
    width: "100%",
    minWidth: 2200,
    borderCollapse: "collapse",
    tableLayout: "fixed",
  },
  th: {
    position: "sticky",
    top: 0,
    zIndex: 1,
    padding: "10px 12px",
    background: "#F8FAFC",
    borderBottom: "1px solid #E2E8F0",
    fontSize: 12,
    color: "#334155",
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
  thContent: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sortPill: {
    fontSize: 10,
    fontWeight: 800,
    color: "#2563EB",
    background: "#DBEAFE",
    padding: "3px 6px",
    borderRadius: 999,
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid #E5E7EB",
    fontSize: 12,
    color: "#0F172A",
    verticalAlign: "top",
    wordBreak: "break-word",
  },
  tr: {
    transition: "background 160ms ease",
  },
  emptyCell: {
    padding: 24,
    textAlign: "center",
    color: "#64748B",
    fontSize: 13,
  },
};
