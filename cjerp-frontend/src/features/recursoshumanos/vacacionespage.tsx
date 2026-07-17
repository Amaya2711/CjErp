import { useEffect, useMemo, useState } from "react";
import AppPage from "../../components/base/AppPage";
import AppSectionHeader from "../../components/base/AppSectionHeader";
import DataGridBase, { type DataGridColumn } from "../../components/base/DataGridBase";
import SidePanelForm from "../../components/base/SidePanelForm";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { listarEmpleadosWup } from "../../api/empleadoService";
import type { EmpleadoCta } from "../../models/empleadoCta";
import {
  aprobarVacacion,
  crearVacacion,
  listarMovimientosVacaciones,
  listarVacaciones,
  rechazarVacacion,
  type VacacionMovimientoListItem,
} from "../../api/vacacionesService";
import {
  listarContratosResumen,
  obtenerContratoEmpleado,
  type ContratoEmpleadoDetalle,
  type ContratoEmpleadoResponse,
} from "../../api/contratosService";

type VacacionRegistro = {
  rowKey: string;
  idEmpleadoCj: number;
  idActivo: string;
  nombreEmpleado: string;
  estado: number;
  estadoLabel: string;
  fechaInicio: string;
  fechaFin: string;
  usuario: string;
  fechaCreacion: string;
  fechaAprob: string;
  idResponsableCj?: number;
  idSegundoVacaciones?: number;
  idTerceroVacaciones?: number;
  primerValidador: string;
  segundoValidador: string;
  tercerValidador: string;
  saldoVacaciones: number | null;
};

type VacacionResumenRegistro = {
  rowKey: string;
  idEmpleadoCj: number;
  nombreEmpleado: string;
  empresa: string;
  cliente: string;
  saldoVacaciones: number;
  registrosPendientes: number;
};

type VacacionMovimientoRegistro = {
  rowKey: string;
  idVacacionMovimiento: number;
  idEmpleado: number;
  nombreEmpleado: string;
  nroDocumento: string;
  idPeriodo: number;
  anio: number | null;
  idSolicitud: number | null;
  fechaMovimiento: string;
  tipoMovimiento: string;
  cantidadDias: number;
  estado: string;
  referencia: string;
  observacion: string;
  idMovimientoOrigen: number | null;
  usuarioCreacion: string;
  fechaCreacion: string;
};

type EstadoTab = "todos" | "97" | "98" | "99" | "resumen" | "movimientos";

type ResumenEmpleadoItem = {
  idEmpleadoCj: number;
  nombreEmpleado: string;
  empresa: string;
  cliente: string;
  saldoVacaciones: number;
  registrosPendientes: number;
};

type ResumenClienteItem = {
  empresa: string;
  empleados: ResumenEmpleadoItem[];
  saldoPendienteTotal: number;
};

type SolicitudFormState = {
  idEmpleadoCj: string;
  fechaInicio: string;
  fechaFin: string;
};

type SolicitudFormErrors = Partial<Record<keyof SolicitudFormState, string>>;

const RESUMEN_PIE_COLORS = [
  "#2563EB",
  "#7C3AED",
  "#0EA5E9",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#14B8A6",
  "#8B5CF6",
  "#F97316",
  "#22C55E",
];

const ESTADO_TABS: Array<{ key: EstadoTab; label: string; estado?: number }> = [
  { key: "todos", label: "Todas" },
  { key: "97", label: "1ra validación", estado: 97 },
  { key: "98", label: "2da validación", estado: 98 },
  { key: "99", label: "3ra validación", estado: 99 },
  { key: "resumen", label: "Resumen" },
  { key: "movimientos", label: "Movimientos" },
];

const EMPTY_FORM: SolicitudFormState = {
  idEmpleadoCj: "",
  fechaInicio: "",
  fechaFin: "",
};

function normalizeDateForInput(value?: string | null): string {
  const text = (value ?? "").trim();
  if (!text) {
    return "";
  }

  const datePart = text.split(/[ T]/)[0]?.trim() ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return datePart;
  }

  const slashMatch = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return "";
}

function formatDateDisplay(value?: string | null): string {
  const normalized = normalizeDateForInput(value);
  if (!normalized) {
    return "-";
  }

  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
}

function formatDateForRequest(value?: string | null): string {
  return normalizeDateForInput(value);
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  if (!text) {
    return null;
  }

  const direct = Number(text);
  if (Number.isFinite(direct)) {
    return direct;
  }

  const normalized = text.includes(",") && !text.includes(".")
    ? text.replace(",", ".")
    : text.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function findValue(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return row[key];
    }
  }

  const lowerMap = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    lowerMap.set(key.toLowerCase(), value);
  }

  for (const key of keys) {
    const match = lowerMap.get(key.toLowerCase());
    if (match !== undefined) {
      return match;
    }
  }

  return undefined;
}

function getString(row: Record<string, unknown>, ...keys: string[]): string {
  const value = findValue(row, ...keys);
  return value == null ? "" : String(value).trim();
}

function normalizeRowKeyValue(value: unknown): string {
  if (value == null) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value).trim().replace(/\s+/g, " ").toUpperCase();
}

function buildResumenRowKey(row: Record<string, unknown>): string {
  const preferredKeys = [
    "IdVacacionMovimiento",
    "idVacacionMovimiento",
    "IdSolicitud",
    "idSolicitud",
    "IdPeriodo",
    "idPeriodo",
    "IdEmpleadoCj",
    "idEmpleadoCj",
    "IdEmpleado",
    "idEmpleado",
    "FechaInicio",
    "fechaInicio",
    "FechaFin",
    "fechaFin",
    "Anio",
    "anio",
    "Estado",
    "estado",
    "Empresa",
    "empresa",
    "Cliente",
    "cliente",
  ];

  const preferred = preferredKeys
    .map((key) => {
      const value = findValue(row, key);
      return `${key}:${normalizeRowKeyValue(value)}`;
    })
    .filter((part) => !part.endsWith(":"));

  if (preferred.length > 0) {
    return preferred.join("|");
  }

  return Object.entries(row)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${normalizeRowKeyValue(value)}`)
    .join("|");
}

function getNumber(row: Record<string, unknown>, ...keys: string[]): number | null {
  return parseNumber(findValue(row, ...keys));
}

function mapVacacionRow(row: Record<string, unknown>, index: number): VacacionRegistro {
  return {
    rowKey: `${getString(row, "IdSolicitud", "idSolicitud", "IdEmpleadoCj", "idEmpleadoCj", "FechaCreacion", "fechaCreacion")}-${index}`,
    idEmpleadoCj: getNumber(row, "IdEmpleadoCj", "idEmpleadoCj", "Id", "id") ?? index + 1,
    idActivo: getString(row, "IdActivo", "idActivo"),
    nombreEmpleado: getString(row, "NombreEmpleado", "nombreEmpleado"),
    estado: getNumber(row, "IdEstado", "idEstado", "Estado", "estado") ?? 0,
    estadoLabel: getString(row, "Estado", "estado"),
    fechaInicio: getString(row, "FechaInicio", "fechaInicio"),
    fechaFin: getString(row, "FechaFin", "fechaFin"),
    usuario: getString(row, "Usuario", "usuario"),
    fechaCreacion: getString(row, "FechaCreacion", "fechaCreacion"),
    fechaAprob: getString(row, "FechaAprob", "fechaAprob"),
    idResponsableCj: getNumber(row, "IdResponsableCj", "idResponsableCj") ?? undefined,
    idSegundoVacaciones: getNumber(row, "IdSegundoVacaciones", "idSegundoVacaciones") ?? undefined,
    idTerceroVacaciones: getNumber(row, "IdTerceroVacaciones", "idTerceroVacaciones") ?? undefined,
    primerValidador: getString(row, "PrimerValidador", "primerValidador"),
    segundoValidador: getString(row, "SegundoValidador", "segundoValidador"),
    tercerValidador: getString(row, "TercerValidador", "tercerValidador"),
    saldoVacaciones: getNumber(row, "SaldoVacaciones", "saldoVacaciones"),
  };
}

function mapVacacionResumenRow(row: Record<string, unknown>): VacacionResumenRegistro {
  const idEmpleadoCj =
    getNumber(row, "IdEmpleadoCj", "idEmpleadoCj", "IdEmpleado", "idEmpleado") ?? 0;

  return {
    rowKey: buildResumenRowKey(row),
    idEmpleadoCj,
    nombreEmpleado: getString(row, "NombreEmpleado", "nombreEmpleado") || `Empleado ${idEmpleadoCj}`,
    empresa: getString(row, "Empresa", "empresa") || "Sin empresa",
    cliente: getString(row, "Cliente", "cliente") || "Sin cliente",
    saldoVacaciones: getNumber(
      row,
      "SaldoVacaciones",
      "saldoVacaciones",
      "SaldoPendiente",
      "saldoPendiente",
      "Saldo",
      "saldo"
    ) ?? 0,
    registrosPendientes:
      getNumber(
        row,
        "Registros",
        "registros",
        "CantidadRegistros",
        "cantidadRegistros",
        "TotalRegistros",
        "totalRegistros"
      ) ?? 1,
  };
}

function mapVacacionMovimientoRow(item: VacacionMovimientoListItem, index: number): VacacionMovimientoRegistro {
  return {
    rowKey: `${item.idVacacionMovimiento || index}-${item.idEmpleado || 0}-${item.fechaMovimiento || ""}`,
    idVacacionMovimiento: Number(item.idVacacionMovimiento) || index + 1,
    idEmpleado: Number(item.idEmpleado) || 0,
    nombreEmpleado: String(item.nombreEmpleado ?? "").trim(),
    nroDocumento: String(item.nroDocumento ?? "").trim(),
    idPeriodo: Number(item.idPeriodo) || 0,
    anio: item.anio == null ? null : Number(item.anio),
    idSolicitud: item.idSolicitud == null ? null : Number(item.idSolicitud),
    fechaMovimiento: String(item.fechaMovimiento ?? "").trim(),
    tipoMovimiento: String(item.tipoMovimiento ?? "").trim(),
    cantidadDias: Number(item.cantidadDias ?? 0) || 0,
    estado: String(item.estado ?? "").trim(),
    referencia: String(item.referencia ?? "").trim(),
    observacion: String(item.observacion ?? "").trim(),
    idMovimientoOrigen: item.idMovimientoOrigen == null ? null : Number(item.idMovimientoOrigen),
    usuarioCreacion: String(item.usuarioCreacion ?? "").trim(),
    fechaCreacion: String(item.fechaCreacion ?? "").trim(),
  };
}

function mapLegacyVacacionToMovimiento(
  row: VacacionRegistro,
  index: number
): VacacionMovimientoRegistro {
  const fechaBase = row.fechaAprob || row.fechaCreacion || row.fechaInicio;
  const dias = getVacacionDias(row.fechaInicio, row.fechaFin);
  const activo = row.idActivo.trim().toUpperCase() === "ACTIVO";

  return {
    rowKey: `legacy-${row.rowKey}-${index}`,
    idVacacionMovimiento: index + 1,
    idEmpleado: row.idEmpleadoCj,
    nombreEmpleado: row.nombreEmpleado,
    nroDocumento: "",
    idPeriodo: 0,
    anio: null,
    idSolicitud: null,
    fechaMovimiento: fechaBase,
    tipoMovimiento: "VACACION LEGACY",
    cantidadDias: dias,
    estado: activo || isVacacionAprobada(row) ? "APLICADO" : "PENDIENTE",
    referencia: `${formatDateDisplay(row.fechaInicio)} al ${formatDateDisplay(row.fechaFin)}`,
    observacion: `Registro legacy de vacaciones. Estado legacy: ${row.estadoLabel || row.estado}.`,
    idMovimientoOrigen: null,
    usuarioCreacion: row.usuario || "-",
    fechaCreacion: row.fechaCreacion,
  };
}

function getDaysBetween(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diff = end.getTime() - start.getTime();
  if (Number.isNaN(diff) || diff < 0) {
    return 0;
  }

  return Math.floor(diff / 86400000) + 1;
}

function getVacacionDias(fechaInicio: string, fechaFin: string): number {
  const start = normalizeDateForInput(fechaInicio);
  const end = normalizeDateForInput(fechaFin);

  if (!start || !end) {
    return 0;
  }

  return getDaysBetween(start, end);
}

function normalizeSearchText(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function detectCompanyChange(contrato: ContratoEmpleadoResponse | null): boolean {
  if (!contrato) {
    return false;
  }

  const companyKeys = contrato.historial
    .map((item) => item.idEmpRel)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);

  return new Set(companyKeys).size > 1;
}

function resolveEstadoBadge(estado: number, estadoLabel: string) {
  const label = estadoLabel || `Estado ${estado}`;

  if (estado === 97) {
    return { label, background: "#EEF2FF", color: "#3730A3" };
  }

  if (estado === 98) {
    return { label, background: "#ECFDF5", color: "#047857" };
  }

  if (estado === 99) {
    return { label, background: "#FEF3C7", color: "#B45309" };
  }

  return { label, background: "#F1F5F9", color: "#334155" };
}

function getHttpMessage(error: unknown, fallback: string): string {
  const response = (error as { response?: { data?: { message?: string; detail?: string; data?: { message?: string } } } }).response;
  return (
    response?.data?.message ||
    response?.data?.detail ||
    response?.data?.data?.message ||
    (error instanceof Error ? error.message : fallback)
  );
}

function isVacacionPendiente(row: VacacionRegistro): boolean {
  return [97, 98, 99].includes(row.estado);
}

function isVacacionAprobada(row: VacacionRegistro): boolean {
  return row.estado === 99 || Boolean(row.fechaAprob?.trim());
}

export default function VacacionesPage() {
  const [rows, setRows] = useState<VacacionRegistro[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<EmpleadoCta[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<EstadoTab>("97");
  const [searchEmployee, setSearchEmployee] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState<SolicitudFormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<SolicitudFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [selectedEmployeeContrato, setSelectedEmployeeContrato] = useState<ContratoEmpleadoResponse | null>(null);
  const [selectedEmployeeLoading, setSelectedEmployeeLoading] = useState(false);
  const [selectedEmployeeSaldo, setSelectedEmployeeSaldo] = useState<number | null>(null);
  const [selectedEmployeeSaldoLoading, setSelectedEmployeeSaldoLoading] = useState(false);
  const [resumenTotales, setResumenTotales] = useState<VacacionResumenRegistro[]>([]);
  const [resumenTotalesLoading, setResumenTotalesLoading] = useState(false);
  const [resumenContratos, setResumenContratos] = useState<Record<number, ContratoEmpleadoDetalle>>({});
  const [resumenLoading, setResumenLoading] = useState(false);
  const [resumenDetalleRows, setResumenDetalleRows] = useState<VacacionRegistro[]>([]);
  const [resumenDetalleLoading, setResumenDetalleLoading] = useState(false);
  const [selectedResumenEmpresa, setSelectedResumenEmpresa] = useState<string>("");
  const [selectedResumenEmpleadoId, setSelectedResumenEmpleadoId] = useState<number | null>(null);
  const [searchResumenEmpleado, setSearchResumenEmpleado] = useState("");
  const [movimientoRows, setMovimientoRows] = useState<VacacionMovimientoRegistro[]>([]);
  const [movimientoLoading, setMovimientoLoading] = useState(false);
  const [movimientoEmpleadoId, setMovimientoEmpleadoId] = useState<string>("");
  const [movimientoEmpleadoSearch, setMovimientoEmpleadoSearch] = useState("");
  const [movimientoFechaDesde, setMovimientoFechaDesde] = useState("");
  const [movimientoFechaHasta, setMovimientoFechaHasta] = useState("");
  const [movimientoEstadoFiltro, setMovimientoEstadoFiltro] = useState("");

  const activeEstado = useMemo(() => {
    const tab = ESTADO_TABS.find((item) => item.key === activeTab);
    return tab?.estado;
  }, [activeTab]);

  const selectedEmployee = useMemo(
    () => employees.find((item) => Number(item.idEmpleado) === Number(form.idEmpleadoCj)) ?? null,
    [employees, form.idEmpleadoCj]
  );

  const resumenActivos = useMemo(() => {
    return employees.filter((item) => Number(item.idEmpleado) > 0);
  }, [employees]);

  const resumenTotalesPorEmpleado = useMemo(() => {
    const grouped = new Map<
      number,
      { saldo: number; registros: number; empresa: string; cliente: string; nombreEmpleado: string }
    >();
    const seenRecords = new Set<string>();

    for (const item of resumenTotales) {
      const idEmpleado = Number(item.idEmpleadoCj);
      if (!Number.isFinite(idEmpleado) || idEmpleado <= 0) {
        continue;
      }

      if (seenRecords.has(item.rowKey)) {
        continue;
      }
      seenRecords.add(item.rowKey);

      const current = grouped.get(idEmpleado) ?? {
        saldo: 0,
        registros: 0,
        empresa: item.empresa,
        cliente: item.cliente,
        nombreEmpleado: item.nombreEmpleado,
      };
      if (current.registros === 0) {
        current.saldo = Number(item.saldoVacaciones ?? 0) || 0;
      }
      current.registros += 1;
      current.empresa = current.empresa || item.empresa;
      current.cliente = current.cliente || item.cliente;
      current.nombreEmpleado = current.nombreEmpleado || item.nombreEmpleado;
      grouped.set(idEmpleado, current);
    }

    return grouped;
  }, [resumenTotales]);

  const companyChanged = useMemo(
    () => detectCompanyChange(selectedEmployeeContrato),
    [selectedEmployeeContrato]
  );

  const effectiveSaldo = useMemo(() => {
    if (companyChanged) {
      return 0;
    }

    return selectedEmployeeSaldo;
  }, [companyChanged, selectedEmployeeSaldo]);

  const actionsDisabled = activeTab === "todos";

  const requestedDays = useMemo(() => {
    if (!form.fechaInicio || !form.fechaFin) {
      return 0;
    }

    return getDaysBetween(form.fechaInicio, form.fechaFin);
  }, [form.fechaInicio, form.fechaFin]);

  const selectedMovimientoEmployee = useMemo(
    () => employees.find((item) => String(item.idEmpleado) === movimientoEmpleadoId) ?? null,
    [employees, movimientoEmpleadoId]
  );

  const movimientoEmployeesFiltered = useMemo(() => {
    const query = normalizeSearchText(movimientoEmpleadoSearch);

    if (!query) {
      return employees;
    }

    return employees.filter((item) => {
      const nombre = normalizeSearchText(item.nombreEmpleado);
      const documento = normalizeSearchText(item.nroDocumento);
      return nombre.includes(query) || documento.includes(query);
    });
  }, [employees, movimientoEmpleadoSearch]);

  const movimientoResumen = useMemo(() => {
    return movimientoRows.reduce(
      (acc, item) => {
        acc.total += 1;
        acc.dias += Number(item.cantidadDias) || 0;
        return acc;
      },
      { total: 0, dias: 0 }
    );
  }, [movimientoRows]);

  const filteredRows = useMemo(() => {
    const employeeQuery = searchEmployee.trim().toLowerCase();

    return rows.filter((item) => {
      if (activeEstado && item.estado !== activeEstado) {
        return false;
      }

      if (employeeQuery && !item.nombreEmpleado.toLowerCase().includes(employeeQuery)) {
        return false;
      }

      const start = normalizeDateForInput(item.fechaInicio);
      const end = normalizeDateForInput(item.fechaFin);

      if (dateStart && start && start < dateStart) {
        return false;
      }

      if (dateEnd && end && end > dateEnd) {
        return false;
      }

      return true;
    });
  }, [activeEstado, dateEnd, dateStart, rows, searchEmployee]);

  const summary = useMemo(() => {
    return {
      total: rows.length,
      primer: rows.filter((item) => item.estado === 97).length,
      segundo: rows.filter((item) => item.estado === 98).length,
      tercero: rows.filter((item) => item.estado === 99).length,
    };
  }, [rows]);

  const resumenClientes = useMemo<ResumenClienteItem[]>(() => {
    const grouped = new Map<string, ResumenClienteItem>();

    for (const employee of resumenActivos) {
      const idEmpleado = Number(employee.idEmpleado);
      const contrato = resumenContratos[idEmpleado];
      const resumenTotal = resumenTotalesPorEmpleado.get(idEmpleado);
      const empresa = (contrato?.empresa || resumenTotal?.empresa || "Sin empresa").trim() || "Sin empresa";
      const cliente = (contrato?.cliente || resumenTotal?.cliente || "Sin cliente").trim() || "Sin cliente";
      const nombreEmpleado = (employee.nombreEmpleado || contrato?.nombreEmpleado || `Empleado ${idEmpleado}`).trim();
      const saldoPendiente = resumenTotal?.saldo ?? 0;
      const registrosPendientes = resumenTotal?.registros ?? 0;

      if (saldoPendiente <= 0) {
        continue;
      }

      const current: ResumenClienteItem = grouped.get(empresa) ?? {
        empresa,
        empleados: [],
        saldoPendienteTotal: 0,
      };

      const empleado = current.empleados.find((entry) => entry.idEmpleadoCj === idEmpleado);
      if (empleado) {
        empleado.registrosPendientes = registrosPendientes;
        empleado.saldoVacaciones = saldoPendiente;
      } else {
        current.empleados.push({
          idEmpleadoCj: idEmpleado,
          nombreEmpleado,
          empresa,
          cliente,
          saldoVacaciones: saldoPendiente,
          registrosPendientes,
        });
      }

      current.saldoPendienteTotal += saldoPendiente;
      grouped.set(empresa, current);
    }

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        empleados: [...group.empleados].sort((a, b) => b.saldoVacaciones - a.saldoVacaciones || a.nombreEmpleado.localeCompare(b.nombreEmpleado)),
      }))
      .sort((a, b) => b.saldoPendienteTotal - a.saldoPendienteTotal || a.empresa.localeCompare(b.empresa));
  }, [resumenActivos, resumenContratos, resumenTotalesPorEmpleado]);

  const resumenEmpresas = useMemo<ResumenClienteItem[]>(() => {
    const grouped = new Map<string, ResumenClienteItem>();

    for (const employee of resumenActivos) {
      const idEmpleado = Number(employee.idEmpleado);
      const contrato = resumenContratos[idEmpleado];
      const resumenTotal = resumenTotalesPorEmpleado.get(idEmpleado);
      const empresa = (contrato?.empresa || resumenTotal?.empresa || "Sin empresa").trim() || "Sin empresa";
      const cliente = (contrato?.cliente || resumenTotal?.cliente || "Sin cliente").trim() || "Sin cliente";
      const nombreEmpleado = (employee.nombreEmpleado || contrato?.nombreEmpleado || `Empleado ${idEmpleado}`).trim();
      const saldoPendiente = resumenTotal?.saldo ?? 0;
      const registrosPendientes = resumenTotal?.registros ?? 0;

      const current: ResumenClienteItem = grouped.get(empresa) ?? {
        empresa,
        empleados: [],
        saldoPendienteTotal: 0,
      };

      if (saldoPendiente > 0) {
        current.empleados.push({
          idEmpleadoCj: idEmpleado,
          nombreEmpleado,
          empresa,
          cliente,
          saldoVacaciones: saldoPendiente,
          registrosPendientes,
        });
        current.saldoPendienteTotal += saldoPendiente;
      }

      grouped.set(empresa, current);
    }

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        empleados: [...group.empleados].sort((a, b) => b.saldoVacaciones - a.saldoVacaciones || a.nombreEmpleado.localeCompare(b.nombreEmpleado)),
      }))
      .sort((a, b) => b.saldoPendienteTotal - a.saldoPendienteTotal || a.empresa.localeCompare(b.empresa));
  }, [resumenActivos, resumenContratos, resumenTotalesPorEmpleado]);

  const resumenPieData = useMemo(() => {
    return resumenEmpresas
      .filter((item) => item.saldoPendienteTotal > 0)
      .map((item) => ({
        name: item.empresa,
        value: Number(item.saldoPendienteTotal) || 0,
      }))
      .filter((item) => item.value > 0);
  }, [resumenEmpresas]);

  const resumenPieTotal = useMemo(() => {
    return resumenPieData.reduce((sum, item) => sum + item.value, 0);
  }, [resumenPieData]);

  const resumenEmpresaSeleccionada = useMemo(() => {
    if (selectedResumenEmpresa === "Todos") {
      return null;
    }

    if (!selectedResumenEmpresa) {
      return null;
    }

    return resumenEmpresas.find((item) => item.empresa === selectedResumenEmpresa) ?? null;
  }, [resumenEmpresas, selectedResumenEmpresa]);

  const resumenEmpleadosEmpresaSeleccionada = useMemo(() => {
    if (selectedResumenEmpresa === "Todos") {
      return resumenEmpresas
        .flatMap((empresa) => empresa.empleados)
        .slice()
        .sort((a, b) => b.saldoVacaciones - a.saldoVacaciones || a.nombreEmpleado.localeCompare(b.nombreEmpleado));
    }

    if (!resumenEmpresaSeleccionada) {
      return [];
    }

    return resumenEmpresaSeleccionada.empleados;
  }, [resumenEmpresaSeleccionada]);

  const resumenSaldoPendienteSeleccionado = useMemo(() => {
    if (selectedResumenEmpresa === "Todos") {
      return resumenEmpresas.reduce((total, empresa) => total + empresa.saldoPendienteTotal, 0);
    }

    return resumenEmpresaSeleccionada?.saldoPendienteTotal ?? 0;
  }, [resumenEmpresas, resumenEmpresaSeleccionada, selectedResumenEmpresa]);

  const resumenEmpleadosFiltrados = useMemo(() => {
    const query = normalizeSearchText(searchResumenEmpleado);

    if (!query) {
      return resumenEmpleadosEmpresaSeleccionada;
    }

    return resumenEmpleadosEmpresaSeleccionada.filter((empleado) =>
      normalizeSearchText(empleado.nombreEmpleado).includes(query)
    );
  }, [resumenEmpleadosEmpresaSeleccionada, searchResumenEmpleado]);

  const selectedResumenEmpleado = useMemo(() => {
    if (selectedResumenEmpleadoId == null) {
      return null;
    }

    return resumenActivos.find((item) => Number(item.idEmpleado) === selectedResumenEmpleadoId) ?? null;
  }, [resumenActivos, selectedResumenEmpleadoId]);

  const selectedResumenContrato = useMemo(() => {
    if (selectedResumenEmpleadoId == null) {
      return null;
    }

    return resumenContratos[selectedResumenEmpleadoId] ?? null;
  }, [resumenContratos, selectedResumenEmpleadoId]);

  const resumenDetalle = useMemo(() => {
    return resumenDetalleRows
      .filter((item) => item.idActivo.toUpperCase() === "ACTIVO")
      .slice()
      .sort((a, b) => normalizeDateForInput(b.fechaInicio).localeCompare(normalizeDateForInput(a.fechaInicio)));
  }, [resumenDetalleRows]);

  const resumenTotalDiasAprobadas = useMemo(() => {
    return resumenDetalle.reduce((sum, item) => sum + getVacacionDias(item.fechaInicio, item.fechaFin), 0);
  }, [resumenDetalle]);

  const maxPendientesResumen = useMemo(() => {
    return resumenClientes.reduce((max, cliente) => {
      const localMax = cliente.empleados.reduce((innerMax, empleado) => Math.max(innerMax, empleado.saldoVacaciones), 0);
      return Math.max(max, localMax);
    }, 0);
  }, [resumenClientes]);

  useEffect(() => {
    void loadEmployees();
  }, []);

  useEffect(() => {
    void loadRows();
  }, [activeEstado]);

  useEffect(() => {
    if (activeTab !== "resumen") {
      setResumenDetalleRows([]);
      return;
    }

    const nombreEmpleadoSeleccionado =
      selectedResumenEmpleado?.nombreEmpleado?.trim() ||
      selectedResumenContrato?.nombreEmpleado?.trim() ||
      "";

    if (!nombreEmpleadoSeleccionado) {
      setResumenDetalleRows([]);
      return;
    }

    let cancelled = false;

    async function loadResumenDetalle() {
      setResumenDetalleLoading(true);
      try {
        const response = await listarVacaciones({
          consulta: "vacaciones",
          nombreEmpleado: nombreEmpleadoSeleccionado,
          maxRows: 500,
        });

        if (cancelled) {
          return;
        }

        const mapped = Array.isArray(response.rows)
          ? response.rows.map((row, index) => mapVacacionRow(row, index))
          : [];

        setResumenDetalleRows(mapped);
      } catch (loadError) {
        if (!cancelled) {
          setError(getHttpMessage(loadError, "No se pudo cargar el detalle de vacaciones del empleado."));
          setResumenDetalleRows([]);
        }
      } finally {
        if (!cancelled) {
          setResumenDetalleLoading(false);
        }
      }
    }

    void loadResumenDetalle();

    return () => {
      cancelled = true;
    };
  }, [activeTab, selectedResumenContrato?.nombreEmpleado, selectedResumenEmpleado?.nombreEmpleado]);

  useEffect(() => {
    if (activeTab !== "resumen") {
      return;
    }

    let cancelled = false;

    async function loadResumenTotals() {
      setResumenTotalesLoading(true);
      try {
        const response = await listarVacaciones({
          consulta: "vacaciones-total",
          maxRows: 5000,
        });

        if (cancelled) {
          return;
        }

        const mapped = Array.isArray(response.rows)
          ? response.rows.map((row) => mapVacacionResumenRow(row))
          : [];

        setResumenTotales(mapped);
      } catch (loadError) {
        if (!cancelled) {
          setError(getHttpMessage(loadError, "No se pudo cargar el resumen total de vacaciones."));
        }
      } finally {
        if (!cancelled) {
          setResumenTotalesLoading(false);
        }
      }
    }

    async function loadResumenContracts() {
      setResumenLoading(true);
      try {
        const resumen = await listarContratosResumen();
        if (cancelled) {
          return;
        }

        const next: Record<number, ContratoEmpleadoDetalle> = {};
        for (const item of resumen) {
          const idEmpleado = Number(item.idEmpleado);
          if (Number.isFinite(idEmpleado) && idEmpleado > 0) {
            next[idEmpleado] = item;
          }
        }

        setResumenContratos(next);
      } catch (loadError) {
        if (!cancelled) {
          setError(getHttpMessage(loadError, "No se pudo cargar el resumen por empleado."));
        }
      } finally {
        if (!cancelled) {
          setResumenLoading(false);
        }
      }
    }

    void loadResumenTotals();
    void loadResumenContracts();

    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "resumen") {
      return;
    }

    if (resumenEmpresas.length === 0) {
      setSelectedResumenEmpresa("");
      setSelectedResumenEmpleadoId(null);
      return;
    }

    if (!selectedResumenEmpresa || (!resumenEmpresas.some((item) => item.empresa === selectedResumenEmpresa) && selectedResumenEmpresa !== "Todos")) {
      setSelectedResumenEmpresa("Todos");
      return;
    }

    const employeesOfCompany =
      selectedResumenEmpresa === "Todos"
        ? resumenEmpresas.flatMap((empresa) => empresa.empleados)
        : resumenEmpresaSeleccionada?.empleados ?? [];
    if (selectedResumenEmpleadoId != null && employeesOfCompany.some((item) => item.idEmpleadoCj === selectedResumenEmpleadoId)) {
      return;
    }

    setSelectedResumenEmpleadoId(employeesOfCompany[0]?.idEmpleadoCj ?? null);
  }, [activeTab, resumenEmpresas, resumenEmpresaSeleccionada, selectedResumenEmpresa, selectedResumenEmpleadoId]);

  useEffect(() => {
    if (activeTab !== "resumen") {
      return;
    }

    if (resumenEmpleadosFiltrados.length === 0) {
      return;
    }

    if (
      selectedResumenEmpleadoId != null &&
      resumenEmpleadosFiltrados.some((item) => item.idEmpleadoCj === selectedResumenEmpleadoId)
    ) {
      return;
    }

    setSelectedResumenEmpleadoId(resumenEmpleadosFiltrados[0]?.idEmpleadoCj ?? null);
  }, [activeTab, resumenEmpleadosFiltrados, selectedResumenEmpleadoId]);

  useEffect(() => {
    if (activeTab !== "movimientos") {
      setMovimientoRows([]);
      return;
    }

    let cancelled = false;

    async function loadMovimientos() {
      setMovimientoLoading(true);
      setError(null);

      try {
        const [response, legacyResponse] = await Promise.all([
          listarMovimientosVacaciones({
            idEmpleado: movimientoEmpleadoId ? Number(movimientoEmpleadoId) : undefined,
            fechaDesde: movimientoFechaDesde || undefined,
            fechaHasta: movimientoFechaHasta || undefined,
            estado: movimientoEstadoFiltro || undefined,
          }),
          listarVacaciones({
            consulta: "vacaciones",
            nombreEmpleado: selectedMovimientoEmployee?.nombreEmpleado?.trim() || undefined,
            fechaInicio: movimientoFechaDesde || undefined,
            fechaFin: movimientoFechaHasta || undefined,
            maxRows: 500,
          }),
        ]);

        if (cancelled) {
          return;
        }

        const mappedNew = Array.isArray(response.data)
          ? response.data.map((item, index) => mapVacacionMovimientoRow(item, index))
          : [];

        const mappedLegacy =
          Array.isArray(legacyResponse.rows)
            ? legacyResponse.rows
                .map((row, index) => mapVacacionRow(row, index))
                .filter((row) =>
                  (!movimientoEmpleadoId || Number(row.idEmpleadoCj) === Number(movimientoEmpleadoId)) &&
                  (!movimientoEstadoFiltro || movimientoEstadoFiltro === "APLICADO"
                    ? (row.idActivo.trim().toUpperCase() === "ACTIVO" || isVacacionAprobada(row))
                    : false)
                )
                .map((row, index) => mapLegacyVacacionToMovimiento(row, index))
            : [];

        const finalRows = mappedNew.length > 0 ? mappedNew : mappedLegacy;

        setMovimientoRows(finalRows);
      } catch (loadError) {
        if (!cancelled) {
          setError(getHttpMessage(loadError, "No se pudo cargar el detalle de movimientos vacacionales."));
          setMovimientoRows([]);
        }
      } finally {
        if (!cancelled) {
          setMovimientoLoading(false);
        }
      }
    }

    void loadMovimientos();

    return () => {
      cancelled = true;
    };
  }, [activeTab, movimientoEmpleadoId, movimientoEstadoFiltro, movimientoFechaDesde, movimientoFechaHasta]);

  useEffect(() => {
    if (!form.idEmpleadoCj) {
      setSelectedEmployeeContrato(null);
      setSelectedEmployeeSaldo(null);
      return;
    }

    void loadEmployeeContext(Number(form.idEmpleadoCj));
  }, [form.idEmpleadoCj]);

  useEffect(() => {
    if (!movimientoEmpleadoId) {
      return;
    }

    if (selectedMovimientoEmployee?.nombreEmpleado) {
      setMovimientoEmpleadoSearch(selectedMovimientoEmployee.nombreEmpleado);
    }
  }, [movimientoEmpleadoId, selectedMovimientoEmployee]);

  async function loadEmployees() {
    setEmployeesLoading(true);
    try {
      const response = await listarEmpleadosWup();
      setEmployees(Array.isArray(response) ? response : []);
    } catch (loadError) {
      setError(getHttpMessage(loadError, "No se pudo cargar la lista de empleados."));
    } finally {
      setEmployeesLoading(false);
    }
  }

  async function loadRows() {
    setLoading(true);
    setError(null);

    try {
      const response = await listarVacaciones({
        maxRows: 5000,
      });

      const mapped = Array.isArray(response.rows)
        ? response.rows.map((row, index) => mapVacacionRow(row, index))
        : [];

      setRows(mapped);
    } catch (loadError) {
      setError(getHttpMessage(loadError, "No se pudo cargar la bandeja de vacaciones."));
    } finally {
      setLoading(false);
    }
  }

  async function loadEmployeeContext(idEmpleado: number) {
    setSelectedEmployeeLoading(true);
    setSelectedEmployeeSaldoLoading(true);

    try {
      const [contrato, vacacionesResponse] = await Promise.all([
        obtenerContratoEmpleado(idEmpleado),
        listarVacaciones({
          nombreEmpleado: selectedEmployee?.nombreEmpleado ?? employees.find((item) => item.idEmpleado === idEmpleado)?.nombreEmpleado ?? "",
          maxRows: 200,
        }),
      ]);

      setSelectedEmployeeContrato(contrato);

      const match = Array.isArray(vacacionesResponse.rows)
        ? vacacionesResponse.rows
            .map((row, index) => mapVacacionRow(row, index))
            .find((row) => Number(row.idEmpleadoCj) === idEmpleado)
        : undefined;

      setSelectedEmployeeSaldo(match?.saldoVacaciones ?? null);
    } catch (loadError) {
      setSelectedEmployeeContrato(null);
      setSelectedEmployeeSaldo(null);
      setError(getHttpMessage(loadError, "No se pudo obtener el contexto del empleado."));
    } finally {
      setSelectedEmployeeLoading(false);
      setSelectedEmployeeSaldoLoading(false);
    }
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setSelectedEmployeeContrato(null);
    setSelectedEmployeeSaldo(null);
  }

  function openPanel() {
    resetForm();
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
    resetForm();
  }

  async function submitSolicitud() {
    const nextErrors: SolicitudFormErrors = {};

    if (!form.idEmpleadoCj) {
      nextErrors.idEmpleadoCj = "Seleccione el empleado.";
    }

    if (!form.fechaInicio) {
      nextErrors.fechaInicio = "Seleccione la fecha de inicio.";
    }

    if (!form.fechaFin) {
      nextErrors.fechaFin = "Seleccione la fecha fin.";
    }

    if (form.fechaInicio && form.fechaFin && form.fechaFin < form.fechaInicio) {
      nextErrors.fechaFin = "La fecha fin no puede ser menor que la fecha inicio.";
    }

    if (companyChanged) {
      setFormErrors(nextErrors);
      setError("El empleado registra cambio de empresa. El saldo vacacional debe iniciar en 0 luego de la liquidación.");
      return;
    }

    if (effectiveSaldo != null && requestedDays > 0 && requestedDays > effectiveSaldo) {
      setFormErrors(nextErrors);
      setError(`Los días solicitados (${requestedDays}) superan el saldo disponible (${effectiveSaldo}).`);
      return;
    }

    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors);
      setError("Revise los campos obligatorios antes de guardar.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await crearVacacion({
        idEmpleadoCj: Number(form.idEmpleadoCj),
        fechaInicio: form.fechaInicio,
        fechaFin: form.fechaFin,
        idEstado: 97,
      });

      closePanel();
      await loadRows();
    } catch (submitError) {
      setError(getHttpMessage(submitError, "No se pudo registrar la solicitud de vacaciones."));
    } finally {
      setSaving(false);
    }
  }

  async function approveRow(row: VacacionRegistro) {
    const fechaInicio = formatDateForRequest(row.fechaInicio);
    const fechaFin = formatDateForRequest(row.fechaFin);

    if (!row.idEmpleadoCj || !fechaInicio || !fechaFin) {
      window.alert("No se pudo identificar el registro seleccionado.");
      return;
    }

    try {
      await aprobarVacacion({
        idEmpleadoCj: row.idEmpleadoCj,
        fechaInicio,
        fechaFin,
        idEstadoActual: row.estado,
      });

      await loadRows();
      window.alert("Validación registrada correctamente.");
    } catch (approveError) {
      window.alert(getHttpMessage(approveError, "No se pudo aprobar el registro."));
    }
  }

  async function rejectRow(row: VacacionRegistro) {
    const fechaInicio = formatDateForRequest(row.fechaInicio);
    const fechaFin = formatDateForRequest(row.fechaFin);

    if (!row.idEmpleadoCj || !fechaInicio || !fechaFin) {
      window.alert("No se pudo identificar el registro seleccionado.");
      return;
    }

    const confirmed = window.confirm(
      `¿Desea rechazar las vacaciones de ${row.nombreEmpleado || row.idEmpleadoCj} del ${formatDateDisplay(fechaInicio)} al ${formatDateDisplay(fechaFin)}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      await rechazarVacacion({
        idEmpleadoCj: row.idEmpleadoCj,
        fechaInicio,
        fechaFin,
      });

      await loadRows();
      window.alert("Registro rechazado correctamente.");
    } catch (rejectError) {
      window.alert(getHttpMessage(rejectError, "No se pudo rechazar el registro."));
    }
  }

  const movimientoColumns = useMemo<DataGridColumn<VacacionMovimientoRegistro>[]>(() => [
    {
      key: "empleado",
      header: "Empleado",
      render: (row) => (
        <div>
          <div style={{ fontWeight: 700, color: "#0F172A" }}>{row.nombreEmpleado || `Empleado ${row.idEmpleado}`}</div>
          <div style={{ fontSize: 12, color: "#64748B" }}>
            ID {row.idEmpleado} {row.nroDocumento ? `· DOC ${row.nroDocumento}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "movimiento",
      header: "Movimiento",
      render: (row) => (
        <div>
          <div style={{ fontWeight: 700 }}>{row.tipoMovimiento || "-"}</div>
          <div style={{ fontSize: 12, color: "#64748B" }}>
            {formatDateDisplay(row.fechaMovimiento)} {row.fechaCreacion ? `· ${formatDateDisplay(row.fechaCreacion)}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "estado",
      header: "Estado",
      render: (row) => (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "6px 10px",
            borderRadius: 999,
            background: row.estado.toUpperCase() === "ANULADO" ? "#FEF2F2" : "#EFF6FF",
            color: row.estado.toUpperCase() === "ANULADO" ? "#B91C1C" : "#1D4ED8",
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          {row.estado || "-"}
        </span>
      ),
    },
    {
      key: "dias",
      header: "Días",
      align: "right",
      render: (row) => <strong>{row.cantidadDias.toFixed(2)}</strong>,
    },
    {
      key: "periodo",
      header: "Periodo",
      render: (row) => (
        <div>
          <div>{row.anio ?? "-"}</div>
          <div style={{ fontSize: 12, color: "#64748B" }}>Periodo {row.idPeriodo || "-"}</div>
        </div>
      ),
    },
    {
      key: "relacion",
      header: "Relación",
      render: (row) => (
        <div style={{ display: "grid", gap: 4, fontSize: 12 }}>
          <span><strong>Solicitud:</strong> {row.idSolicitud ?? "-"}</span>
          <span><strong>Origen:</strong> {row.idMovimientoOrigen ?? "-"}</span>
          <span><strong>Ref:</strong> {row.referencia || "-"}</span>
        </div>
      ),
    },
    {
      key: "detalle",
      header: "Detalle",
      render: (row) => (
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontSize: 12, color: "#334155" }}>{row.observacion || "-"}</div>
          <div style={{ fontSize: 12, color: "#64748B" }}>Usuario: {row.usuarioCreacion || "-"}</div>
        </div>
      ),
    },
  ], []);

  function renderMovimientosView() {
    return (
      <div style={{ display: "grid", gap: 18 }}>
        <div style={resumenPanelStyle}>
          <div style={resumenHeaderStyle}>
            <div>
              <div style={resumenTitleStyle}>Detalle de movimientos vacacionales</div>
              <div style={resumenSubtitleStyle}>
                Use esta vista para validar los movimientos generados por empleado, incluyendo días, estado, solicitud relacionada y observaciones.
              </div>
            </div>
            <div style={resumenLegendStyle}>
              <span style={resumenLegendDotStyle} />
              {movimientoResumen.total} movimiento(s)
            </div>
          </div>

          <div style={filtersGridStyle}>
            <label style={fieldBlockStyle}>
              <span style={labelStyle}>Empleado</span>
              <input
                type="text"
                value={movimientoEmpleadoSearch}
                onChange={(event) => {
                  const value = event.target.value;
                  setMovimientoEmpleadoSearch(value);

                  const exactMatch = employees.find(
                    (item) => item.nombreEmpleado.trim().toLowerCase() === value.trim().toLowerCase()
                  );

                  setMovimientoEmpleadoId(exactMatch ? String(exactMatch.idEmpleado) : "");
                }}
                onBlur={() => {
                  if (!movimientoEmpleadoSearch.trim()) {
                    setMovimientoEmpleadoId("");
                    return;
                  }

                  const exactMatch = employees.find(
                    (item) => item.nombreEmpleado.trim().toLowerCase() === movimientoEmpleadoSearch.trim().toLowerCase()
                  );

                  if (exactMatch) {
                    setMovimientoEmpleadoId(String(exactMatch.idEmpleado));
                    setMovimientoEmpleadoSearch(exactMatch.nombreEmpleado);
                  }
                }}
                list="movimientos-empleados-autocomplete"
                placeholder="Escriba nombre o documento"
                style={inputStyle}
              />
              <datalist id="movimientos-empleados-autocomplete">
                {movimientoEmployeesFiltered.map((employee) => (
                  <option
                    key={employee.idEmpleado}
                    value={employee.nombreEmpleado}
                  />
                ))}
              </datalist>
            </label>

            <label style={fieldBlockStyle}>
              <span style={labelStyle}>Fecha desde</span>
              <input type="date" value={movimientoFechaDesde} onChange={(event) => setMovimientoFechaDesde(event.target.value)} style={inputStyle} />
            </label>

            <label style={fieldBlockStyle}>
              <span style={labelStyle}>Fecha hasta</span>
              <input type="date" value={movimientoFechaHasta} onChange={(event) => setMovimientoFechaHasta(event.target.value)} style={inputStyle} />
            </label>

            <label style={fieldBlockStyle}>
              <span style={labelStyle}>Estado</span>
              <select
                value={movimientoEstadoFiltro}
                onChange={(event) => setMovimientoEstadoFiltro(event.target.value)}
                style={inputStyle}
              >
                <option value="">Todos</option>
                <option value="APLICADO">APLICADO</option>
                <option value="ANULADO">ANULADO</option>
              </select>
            </label>
          </div>

          <div style={resumenEmployeeInfoGridStyle}>
            <InfoItem label="Empleado seleccionado" value={selectedMovimientoEmployee?.nombreEmpleado || "Todos"} />
            <InfoItem label="Documento" value={selectedMovimientoEmployee?.nroDocumento || "-"} />
            <InfoItem label="Movimientos" value={String(movimientoResumen.total)} />
            <InfoItem label="Días impactados" value={`${movimientoResumen.dias.toFixed(2)} día(s)`} />
          </div>

          <DataGridBase
            columns={movimientoColumns}
            rows={movimientoRows}
            loading={movimientoLoading}
            loadingMessage="Cargando movimientos vacacionales..."
            emptyMessage="No se encontraron movimientos para los filtros seleccionados."
            getRowKey={(row) => row.rowKey}
          />
        </div>
      </div>
    );
  }

  function renderResumenView() {
    const nombreEmpleadoResumen =
      selectedResumenEmpleado?.nombreEmpleado ||
      selectedResumenContrato?.nombreEmpleado ||
      "Seleccione un empleado";
    const empresaResumen = selectedResumenContrato?.empresa || "-";
    const clienteResumen = selectedResumenContrato?.cliente || "-";
    const empleadosEmpresa = resumenEmpleadosEmpresaSeleccionada;
    const saldoEmpresa = resumenEmpresaSeleccionada?.saldoPendienteTotal ?? 0;
    const handleCompanyPieClick = (_: unknown, index: number) => {
      const target = resumenPieData[index];
      if (!target) {
        return;
      }

      setSelectedResumenEmpresa(target.name);
      const nextCompany = resumenEmpresas.find((item) => item.empresa === target.name);
      setSelectedResumenEmpleadoId(nextCompany?.empleados[0]?.idEmpleadoCj ?? null);
    };

    return (
      <div style={resumenLayoutStyle}>
        <section style={resumenPanelStyle}>
          <div style={resumenHeaderStyle}>
            <div>
              <div style={resumenTitleStyle}>Resumen por empresa</div>
              <div style={resumenSubtitleStyle}>
                Seleccione una empresa para ver el saldo pendiente total y la relacion de empleados con SALDO mayor a 0.
              </div>
            </div>
            <div style={resumenLegendStyle}>
              <span style={resumenLegendDotStyle} />
              Saldo pendiente
            </div>
          </div>

          <div style={resumenCompanyDistributionGridStyle}>
          <div style={resumenPieCardStyle}>
            <div style={resumenPieCardHeaderStyle}>
              <div>
                <div style={resumenPieCardTitleStyle}>Distribucion por empresa</div>
                <div style={resumenPieCardSubtitleStyle}>
                  El tamano de cada porcion refleja el saldo total de vacaciones por empresa.
                </div>
              </div>
              <div style={resumenPieCardMetaStyle}>{resumenPieData.length} empresa(s)</div>
            </div>

            {resumenPieData.length === 0 ? (
              <div style={resumenEmptyStyle}>No hay datos suficientes para mostrar el grafico.</div>
            ) : (
              <div style={resumenPieChartWrapStyle}>
                <ResponsiveContainer width="100%" height={360}>
                  <PieChart>
                    <Pie
                      data={resumenPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={120}
                      innerRadius={68}
                      paddingAngle={2}
                      stroke="#FFFFFF"
                      strokeWidth={2}
                      onClick={handleCompanyPieClick}
                    >
                      {resumenPieData.map((entry, index) => (
                        <Cell
                          key={`${entry.name}-${index}`}
                          fill={RESUMEN_PIE_COLORS[index % RESUMEN_PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => `${Number(value ?? 0).toFixed(2)} días`}
                    />
                    <Legend
                      verticalAlign="bottom"
                      align="center"
                      height={42}
                      wrapperStyle={{ fontSize: 12, fontWeight: 700, color: "#334155" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {resumenTotalesLoading || resumenLoading ? (
            <div style={mutedTextStyle}>
              {resumenTotalesLoading ? "Cargando resumen total de vacaciones..." : "Cargando contratos del resumen..."}
            </div>
          ) : null}

          {resumenEmpresas.length === 0 ? (
            <div style={resumenEmptyStyle}>No se encontraron empleados con saldo pendiente.</div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              <div style={resumenEmpresaSelectorRowStyle}>
                <label style={fieldBlockStyle}>
                  <span style={labelStyle}>Empresa</span>
                  <select
                    value={selectedResumenEmpresa}
                    onChange={(event) => {
                      const empresa = event.target.value;
                      setSelectedResumenEmpresa(empresa);
                      const nextEmployees =
                        empresa === "Todos"
                          ? resumenEmpresas.flatMap((item) => item.empleados)
                          : resumenEmpresas.find((item) => item.empresa === empresa)?.empleados ?? [];
                      setSelectedResumenEmpleadoId(nextEmployees[0]?.idEmpleadoCj ?? null);
                    }}
                    style={inputStyle}
                  >
                    <option value="Todos">TODOS</option>
                    {resumenEmpresas.map((empresa) => (
                      <option key={empresa.empresa} value={empresa.empresa}>
                        {empresa.empresa.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </label>

                <div style={resumenEmpresaTotalCardStyle}>
                  <div style={resumenEmpresaTotalLabelStyle}>Saldo pendiente total</div>
                  <div style={resumenEmpresaTotalValueStyle}>{resumenSaldoPendienteSeleccionado.toFixed(2)} días</div>
                  <div style={resumenEmpresaTotalMetaStyle}>{empleadosEmpresa.length} empleado(s) con saldo &gt; 0</div>
                </div>
              </div>

              <label style={fieldBlockStyle}>
                <span style={labelStyle}>Buscar empleado</span>
                <input
                  type="text"
                  value={searchResumenEmpleado}
                  onChange={(event) => setSearchResumenEmpleado(event.target.value)}
                  placeholder="Escriba el nombre del empleado"
                  style={inputStyle}
                />
              </label>

              {resumenEmpleadosFiltrados.length === 0 ? (
                <div style={resumenEmptyStyle}>No hay empleados con saldo pendiente en la empresa seleccionada.</div>
              ) : (
                <div style={resumenBarsListStyle}>
                  {resumenEmpleadosFiltrados.map((empleado) => {
                    const percentage = maxPendientesResumen > 0 ? Math.max(8, (empleado.saldoVacaciones / maxPendientesResumen) * 100) : 8;
                    const isSelected = selectedResumenEmpleadoId === empleado.idEmpleadoCj;

                    return (
                      <button
                        key={`${resumenEmpresaSeleccionada?.empresa ?? 'empresa'}-${empleado.idEmpleadoCj}`}
                        type="button"
                        onClick={() => setSelectedResumenEmpleadoId(empleado.idEmpleadoCj)}
                        style={{
                          ...resumenBarRowButtonStyle,
                          borderColor: isSelected ? '#1D4ED8' : '#E2E8F0',
                          background: isSelected ? '#EFF6FF' : '#FFFFFF',
                          boxShadow: isSelected ? '0 12px 24px rgba(29,78,216,0.10)' : 'none',
                        }}
                      >
                        <div style={resumenBarLabelCellStyle}>
                          <div style={resumenEmployeeNameStyle}>{empleado.nombreEmpleado.toUpperCase()}</div>
                          <div style={resumenEmployeeMetaStyle}>{empleado.empresa.toUpperCase()}</div>
                        </div>

                        <div style={resumenBarTrackStyle} aria-hidden="true">
                          <div
                            style={{
                              ...resumenBarFillStyle,
                              width: `${percentage}%`,
                            }}
                          />
                        </div>

                        <div style={resumenBarCountStyle}>
                          <div>{empleado.saldoVacaciones.toFixed(2)}</div>
                          <div style={resumenBarMetaCountStyle}>{empleado.registrosPendientes} reg.</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          </div>
        </section>

        <section style={resumenPanelStyle}>
          <div style={resumenHeaderStyle}>
            <div>
              <div style={resumenTitleStyle}>Detalle de vacaciones aprobadas</div>
              <div style={resumenSubtitleStyle}>
                Se filtra al elegir un empleado desde el cuadro de barras.
              </div>
            </div>
          </div>

          <div style={resumenEmployeeInfoGridStyle}>
            <InfoItem label="Empleado" value={nombreEmpleadoResumen.toUpperCase()} />
            <InfoItem label="Empresa" value={empresaResumen.toUpperCase()} />
            <InfoItem label="Cliente" value={clienteResumen.toUpperCase()} />
            <InfoItem label="Vacaciones aprobadas" value={`${resumenTotalDiasAprobadas}`} />
          </div>

          {resumenDetalleLoading ? (
            <div style={mutedTextStyle}>Cargando detalle de vacaciones del empleado seleccionado...</div>
          ) : null}

          {resumenDetalle.length === 0 ? (
            <div style={resumenEmptyStyle}>No hay vacaciones aprobadas para el empleado seleccionado.</div>
          ) : (
            <div style={resumenTableWrapStyle}>
              <table style={resumenTableStyle}>
                <thead>
                  <tr>
                    <th style={resumenThStyle}>Fecha inicio</th>
                    <th style={resumenThStyle}>Fecha fin</th>
                    <th style={resumenThStyle}>Días</th>
                  </tr>
                </thead>
                <tbody>
                  {resumenDetalle.map((item) => {
                    const contrato = resumenContratos[item.idEmpleadoCj];
                    const diasVacaciones = getVacacionDias(item.fechaInicio, item.fechaFin);
                    return (
                      <tr key={item.rowKey}>
                        <td style={resumenTdStyle}>{formatDateDisplay(item.fechaInicio)}</td>
                        <td style={resumenTdStyle}>{formatDateDisplay(item.fechaFin)}</td>
                        <td style={resumenTdStyle}>{diasVacaciones}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  }

  const columns = useMemo<DataGridColumn<VacacionRegistro>[]>(
    () => [
      {
        key: "empleado",
        header: "Empleado",
        render: (row) => (
          <div>
            <div style={{ fontWeight: 700, color: "#0F172A" }}>{row.nombreEmpleado || `Empleado ${row.idEmpleadoCj}`}</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>ID {row.idEmpleadoCj}</div>
          </div>
        ),
      },
      {
        key: "fechas",
        header: "Rango",
        render: (row) => (
          <div>
            <div>{formatDateDisplay(row.fechaInicio)}</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>{formatDateDisplay(row.fechaFin)}</div>
          </div>
        ),
      },
      {
        key: "estado",
        header: "Estado",
        render: (row) => {
          const badge = resolveEstadoBadge(row.estado, row.estadoLabel);
          return (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "6px 10px",
                borderRadius: 999,
                background: badge.background,
                color: badge.color,
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              {badge.label}
            </span>
          );
        },
      },
      {
        key: "validadores",
        header: "Validadores",
        render: (row) => (
          <div style={{ display: "grid", gap: 4, fontSize: 12 }}>
            <span><strong>1:</strong> {row.primerValidador || "-"}</span>
            <span><strong>2:</strong> {row.segundoValidador || "-"}</span>
            <span><strong>3:</strong> {row.tercerValidador || "-"}</span>
          </div>
        ),
      },
      {
        key: "saldo",
        header: "Saldo",
        align: "right",
        render: (row) => (
          <span style={{ fontWeight: 700 }}>
            {row.saldoVacaciones == null ? "-" : row.saldoVacaciones.toFixed(2)}
          </span>
        ),
      },
      {
        key: "acciones",
        header: "Acciones",
        align: "center",
        render: (row) => (
          <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <button
              type="button"
              onClick={actionsDisabled ? undefined : () => void approveRow(row)}
              disabled={actionsDisabled}
              style={actionButton(
                "#ECFDF5",
                "#047857",
                "#A7F3D0",
                actionsDisabled
              )}
            >
              Aprobar
            </button>
            <button
              type="button"
              onClick={actionsDisabled ? undefined : () => void rejectRow(row)}
              disabled={actionsDisabled}
              style={actionButton(
                "#FEF2F2",
                "#B91C1C",
                "#FECACA",
                actionsDisabled
              )}
            >
              Rechazar
            </button>
          </div>
        ),
      },
    ],
    [actionsDisabled]
  );

  return (
    <AppPage
      title="Vacaciones Administrativo"
      actions={
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={() => void loadRows()} style={primaryButton("#FFFFFF", "#1D4ED8", "#BFDBFE")}>
            Actualizar
          </button>
          <button type="button" onClick={openPanel} style={primaryButton("#1D4ED8", "#FFFFFF", "#1D4ED8")}>
            Nueva solicitud
          </button>
        </div>
      }
    >
      <div style={panelCardStyle}>
        <div style={summaryGridStyle}>
          <SummaryCard label="Total" value={summary.total} color="#1D4ED8" />
          <SummaryCard label="1ra validación" value={summary.primer} color="#4338CA" />
          <SummaryCard label="2da validación" value={summary.segundo} color="#047857" />
          <SummaryCard label="3ra validación" value={summary.tercero} color="#B45309" />
        </div>

        <div style={tabsRowStyle}>
          {ESTADO_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              style={{
                ...tabButtonStyle,
                background: activeTab === tab.key ? "#1D4ED8" : "#EFF6FF",
                color: activeTab === tab.key ? "#FFFFFF" : "#1D4ED8",
                borderColor: activeTab === tab.key ? "#1D4ED8" : "#BFDBFE",
              }}
            >
              <span style={tabLabelStyle}>{tab.label}</span>
              {tab.key === "97" ? <span style={tabCountBadgeStyle}>{summary.primer}</span> : null}
              {tab.key === "98" ? <span style={tabCountBadgeStyle}>{summary.segundo}</span> : null}
              {tab.key === "99" ? <span style={tabCountBadgeStyle}>{summary.tercero}</span> : null}
            </button>
          ))}
        </div>

        {error ? (
          <div style={errorBannerStyle}>{error}</div>
        ) : null}

        {activeTab === "resumen" ? (
          renderResumenView()
        ) : activeTab === "movimientos" ? (
          renderMovimientosView()
        ) : (
          <>
            <div style={filtersGridStyle}>
              <label style={fieldBlockStyle}>
                <span style={labelStyle}>Empleado</span>
                <input
                  type="text"
                  value={searchEmployee}
                  onChange={(event) => setSearchEmployee(event.target.value)}
                  placeholder="Buscar por nombre"
                  style={inputStyle}
                />
              </label>

              <label style={fieldBlockStyle}>
                <span style={labelStyle}>Fecha inicio desde</span>
                <input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} style={inputStyle} />
              </label>

              <label style={fieldBlockStyle}>
                <span style={labelStyle}>Fecha inicio hasta</span>
                <input type="date" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} style={inputStyle} />
              </label>
            </div>

            <DataGridBase
              columns={columns}
              rows={filteredRows}
              loading={loading}
              loadingMessage="Cargando bandeja de vacaciones..."
              emptyMessage="No se encontraron registros para los filtros actuales."
              getRowKey={(row) => row.rowKey}
            />
          </>
        )}
      </div>

      <SidePanelForm
        open={panelOpen}
        onClose={closePanel}
        title="Nueva solicitud de vacaciones"
        subtitle="El flujo inicia en 1ra validación y mantiene la cadena de 3 aprobaciones."
        maxWidth={760}
        footer={
          <>
            <button type="button" onClick={closePanel} style={primaryButton("#FFFFFF", "#334155", "#CBD5E1")}>
              Cancelar
            </button>
            <button type="button" onClick={() => void submitSolicitud()} disabled={saving} style={primaryButton("#1D4ED8", "#FFFFFF", "#1D4ED8", saving)}>
              {saving ? "Guardando..." : "Guardar solicitud"}
            </button>
          </>
        }
      >
        <div style={panelFieldsGridStyle}>
          <label style={fieldBlockStyle}>
            <span style={labelStyle}>Empleado</span>
            <select
              value={form.idEmpleadoCj}
              onChange={(event) => setForm((prev) => ({ ...prev, idEmpleadoCj: event.target.value }))}
              style={inputStyle}
              disabled={employeesLoading || saving}
            >
              <option value="">{employeesLoading ? "Cargando empleados..." : "Seleccione un empleado"}</option>
              {employees.map((employee) => (
                <option key={employee.idEmpleado} value={employee.idEmpleado}>
                  {employee.nombreEmpleado}
                </option>
              ))}
            </select>
            {formErrors.idEmpleadoCj ? <span style={fieldErrorStyle}>{formErrors.idEmpleadoCj}</span> : null}
          </label>

          <label style={fieldBlockStyle}>
            <span style={labelStyle}>Fecha inicio</span>
            <input
              type="date"
              value={form.fechaInicio}
              onChange={(event) => setForm((prev) => ({ ...prev, fechaInicio: event.target.value }))}
              style={inputStyle}
              disabled={saving}
            />
            {formErrors.fechaInicio ? <span style={fieldErrorStyle}>{formErrors.fechaInicio}</span> : null}
          </label>

          <label style={fieldBlockStyle}>
            <span style={labelStyle}>Fecha fin</span>
            <input
              type="date"
              value={form.fechaFin}
              onChange={(event) => setForm((prev) => ({ ...prev, fechaFin: event.target.value }))}
              style={inputStyle}
              disabled={saving}
            />
            {formErrors.fechaFin ? <span style={fieldErrorStyle}>{formErrors.fechaFin}</span> : null}
          </label>
        </div>

        <div style={infoCardStyle}>
          <AppSectionHeader title="Contexto laboral" description="Se usa para informar la cadena de validación y detectar cambio de empresa." />

          {selectedEmployeeLoading ? (
            <span style={mutedTextStyle}>Cargando información del empleado...</span>
          ) : selectedEmployee ? (
            <div style={contextGridStyle}>
              <InfoItem label="Empleado" value={selectedEmployee.nombreEmpleado} />
              <InfoItem label="Documento" value={selectedEmployee.nroDocumento || "-"} />
              <InfoItem label="Empresa actual" value={selectedEmployeeContrato?.empleado?.empresa || "-"} />
              <InfoItem label="Fecha inicio laboral" value={formatDateDisplay(selectedEmployeeContrato?.empleado?.fechaIniLaboral)} />
              <InfoItem label="Solicitado" value={requestedDays > 0 ? `${requestedDays} día(s)` : "-"} />
              <InfoItem
                label="Saldo de referencia"
                value={
                  selectedEmployeeSaldoLoading
                    ? "Cargando..."
                    : effectiveSaldo == null
                      ? "No disponible"
                      : `${effectiveSaldo.toFixed(2)} día(s)`
                }
              />
            </div>
          ) : (
            <span style={mutedTextStyle}>Seleccione un empleado para ver el contexto laboral.</span>
          )}

          {companyChanged ? (
            <div style={warningBannerStyle}>
              Se detectó cambio de empresa en el historial laboral. Por regla del negocio, las vacaciones deben reiniciarse en 0 después de la liquidación de beneficios.
            </div>
          ) : null}
        </div>
      </SidePanelForm>
    </AppPage>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        border: "1px solid #E2E8F0",
        borderRadius: 18,
        padding: 18,
        background: "#FFFFFF",
        boxShadow: "0 10px 30px rgba(15,23,42,0.05)",
      }}
    >
      <div style={{ fontSize: 13, color: "#64748B", marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{value}</div>
    </div>
  );
}

function actionButton(
  background: string,
  color: string,
  borderColor: string,
  disabled = false
): React.CSSProperties {
  return {
    border: `1px solid ${disabled ? "#CBD5E1" : borderColor}`,
    background: disabled ? "#F8FAFC" : background,
    color: disabled ? "#94A3B8" : color,
    padding: "8px 12px",
    borderRadius: 10,
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 700,
    fontSize: 12,
    opacity: disabled ? 0.55 : 1,
  };
}

function primaryButton(
  background: string,
  color: string,
  borderColor: string,
  disabled = false
): React.CSSProperties {
  return {
    border: `1px solid ${borderColor}`,
    background: disabled ? "#CBD5E1" : background,
    color: disabled ? "#FFFFFF" : color,
    padding: "10px 16px",
    borderRadius: 12,
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 700,
  };
}

const panelCardStyle: React.CSSProperties = {
  background: "linear-gradient(180deg, #F8FBFF 0%, #FFFFFF 100%)",
  border: "1px solid #DBEAFE",
  borderRadius: 24,
  padding: 24,
  boxShadow: "0 24px 60px rgba(15,23,42,0.06)",
};

const summaryGridStyle: React.CSSProperties = {
  display: "none",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 16,
  marginBottom: 22,
};

const tabsRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 18,
};

const tabButtonStyle: React.CSSProperties = {
  border: "1px solid #BFDBFE",
  borderRadius: 999,
  padding: "10px 16px",
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const tabLabelStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
};

const tabCountBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 26,
  padding: "2px 8px",
  borderRadius: 999,
  background: "rgba(29, 78, 216, 0.12)",
  color: "#1D4ED8",
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1,
};

const filtersGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
  marginBottom: 18,
};

const panelFieldsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 14,
};

const fieldBlockStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#334155",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 44,
  borderRadius: 12,
  border: "1px solid #CBD5E1",
  padding: "0 12px",
  fontSize: 14,
  color: "#0F172A",
  boxSizing: "border-box",
  background: "#FFFFFF",
};

const errorBannerStyle: React.CSSProperties = {
  marginBottom: 16,
  padding: 14,
  borderRadius: 14,
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#991B1B",
  fontWeight: 600,
};

const infoCardStyle: React.CSSProperties = {
  border: "1px solid #E2E8F0",
  borderRadius: 20,
  padding: 18,
  background: "#F8FAFC",
};

const contextGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 14,
};

const mutedTextStyle: React.CSSProperties = {
  color: "#64748B",
  fontSize: 14,
};

const warningBannerStyle: React.CSSProperties = {
  marginTop: 16,
  padding: 14,
  borderRadius: 14,
  border: "1px solid #FCD34D",
  background: "#FFFBEB",
  color: "#92400E",
  fontWeight: 600,
  lineHeight: 1.5,
};

const fieldErrorStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#DC2626",
  fontWeight: 600,
};

const resumenLayoutStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(360px, 0.9fr)",
  gap: 18,
  alignItems: "start",
};

const resumenCompanyDistributionGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(420px, 0.95fr)",
  gap: 18,
  alignItems: "start",
};

const resumenPanelStyle: React.CSSProperties = {
  border: "1px solid #C7D2FE",
  borderRadius: 22,
  background: "#FFFFFF",
  padding: 18,
  boxShadow: "0 18px 40px rgba(15,23,42,0.05)",
};

const resumenHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  marginBottom: 16,
};

const resumenTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  color: "#0F172A",
  marginBottom: 6,
};

const resumenSubtitleStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#64748B",
  lineHeight: 1.5,
};

const resumenLegendStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  fontWeight: 700,
  color: "#1D4ED8",
  whiteSpace: "nowrap",
};

const resumenLegendDotStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999,
  background: "#1D4ED8",
  display: "inline-block",
};

const resumenPieCardStyle: React.CSSProperties = {
  border: "1px solid #DBEAFE",
  borderRadius: 20,
  background: "linear-gradient(180deg, #F8FBFF 0%, #FFFFFF 100%)",
  padding: 18,
  marginBottom: 16,
  boxShadow: "0 12px 30px rgba(37,99,235,0.06)",
};

const resumenPieCardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 14,
};

const resumenPieCardTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  color: "#0F172A",
  marginBottom: 4,
};

const resumenPieCardSubtitleStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  lineHeight: 1.4,
};

const resumenPieCardMetaStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#1D4ED8",
  whiteSpace: "nowrap",
};

const resumenPieChartWrapStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 360,
};

const resumenEmptyStyle: React.CSSProperties = {
  border: "1px dashed #CBD5E1",
  borderRadius: 16,
  background: "#F8FAFC",
  color: "#64748B",
  fontSize: 14,
  padding: 18,
};

const resumenClientsListStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
};

const resumenEmpresaSelectorRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 320px) minmax(180px, 240px)",
  gap: 16,
  alignItems: "stretch",
};

const resumenEmpresaTotalCardStyle: React.CSSProperties = {
  border: "1px solid #BFDBFE",
  borderRadius: 14,
  background: "linear-gradient(180deg, #EFF6FF 0%, #FFFFFF 100%)",
  padding: 10,
  display: "grid",
  alignContent: "center",
  gap: 4,
  width: "100%",
  maxWidth: 240,
  justifySelf: "end",
};

const resumenEmpresaTotalLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: 0.2,
};

const resumenEmpresaTotalValueStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  color: "#1D4ED8",
  lineHeight: 1.1,
};

const resumenEmpresaTotalMetaStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#334155",
};

const resumenClientCardStyle: React.CSSProperties = {
  border: "1px solid #E2E8F0",
  borderRadius: 18,
  padding: 16,
  background: "#F8FAFC",
};

const resumenClientHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
};

const resumenClientTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: "#1E293B",
  letterSpacing: 0.5,
};

const resumenClientCountStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#475569",
  whiteSpace: "nowrap",
};

const resumenBarsListStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const resumenBarRowButtonStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(170px, 250px) minmax(0, 1fr) 44px",
  gap: 12,
  alignItems: "center",
  width: "100%",
  textAlign: "left",
  borderRadius: 14,
  border: "1px solid #E2E8F0",
  padding: "12px 14px",
  cursor: "pointer",
};

const resumenBarLabelCellStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  textAlign: "right",
};

const resumenEmployeeNameStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#0F172A",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const resumenEmployeeMetaStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#64748B",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const resumenBarTrackStyle: React.CSSProperties = {
  height: 18,
  borderRadius: 999,
  background: "#E2E8F0",
  overflow: "hidden",
};

const resumenBarFillStyle: React.CSSProperties = {
  height: "100%",
  borderRadius: 999,
  background: "linear-gradient(90deg, #60A5FA 0%, #2563EB 100%)",
};

const resumenBarCountStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: "#1D4ED8",
  textAlign: "right",
};

const resumenBarMetaCountStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#64748B",
  marginTop: 2,
};

const resumenEmployeeInfoGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 14,
  marginBottom: 16,
};

const resumenTableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
  border: "1px solid #E2E8F0",
  borderRadius: 16,
  background: "#FFFFFF",
};

const resumenTableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 520,
};

const resumenThStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 14px",
  fontSize: 12,
  fontWeight: 800,
  color: "#334155",
  background: "#F8FAFC",
  borderBottom: "1px solid #E2E8F0",
  textTransform: "uppercase",
};

const resumenTdStyle: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 13,
  color: "#0F172A",
  borderBottom: "1px solid #E2E8F0",
};
