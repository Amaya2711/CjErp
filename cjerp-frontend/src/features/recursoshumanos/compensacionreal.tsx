import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  actualizarCompensacion,
  crearCompensacion,
  eliminarCompensacion,
  listarCompensaciones,
  listarSaldosCompensacion,
  obtenerCompensacion,
  obtenerSaldoCompensacion,
  procesarCompensacion,
} from "../../api/compensacionService";
import { listarEmpleadosWup } from "../../api/empleadoService";
import CrudToolbar from "../../components/base/CrudToolbar";
import { useCrudForm } from "../../hooks/useCrudForm";
import type {
  CompensacionAccion,
  CompensacionGuardarRequest,
  CompensacionRow,
  CompensacionSaldo,
  ProcesarCompensacionRequest,
} from "../../models/compensacion";
import type { EmpleadoCta } from "../../models/empleadoCta";
import { getAuthUser } from "../../utils/authStorage";
import { getHttpErrorMessage } from "../../utils/httpError";

const LIMA_TIME_ZONE = "America/Lima";
const limaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: LIMA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatDateInputInLima(date: Date) {
  const parts = limaDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function getTodayInputDate() {
  return formatDateInputInLima(new Date());
}

function parseDateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day));
}

function calculateInclusiveDays(startDate: string, endDate: string) {
  if (!startDate || !endDate) return 0;

  const start = parseDateOnly(toDateInput(startDate));
  const end = parseDateOnly(toDateInput(endDate));
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
  return diff > 0 ? diff : 0;
}

function buildInitialForm(): CompensacionGuardarRequest {
  const today = getTodayInputDate();
  return {
    id: undefined,
    idEmpleadoCj: null,
    idEstado: 97,
    fecha: today,
    idActivo: 1,
    idAutorizado: null,
    fechaAutorizado: "",
    fechaInicio: today,
    fechaFin: today,
    fechaPre: "",
    fechaPrimera: "",
    idPre: null,
    idPrimera: null,
    idGestor: null,
    usuario: "",
    idRechazo: null,
    fechaRechazo: "",
    pagada: false,
    comentario: "",
    tipoCompensacion: "COMPENSACION",
    cantidadDias: 1,
    idSaldoCompensacion: null,
    idMovimiento: null,
    procesadoSaldo: false,
  };
}

const initialForm: CompensacionGuardarRequest = buildInitialForm();
const SHOW_EDIT_BUTTON = false;
const MAX_COMMENT_LENGTH = 500;
const DEFAULT_HIDDEN_ESTADOS = new Set([-1, 9]);

type ActivoFilter = "activos" | "todos" | "inactivos";
type ActiveTab = "solicitudes" | "resumen";
type SortDirection = "asc" | "desc";
type SortColumn =
  | "id"
  | "empleado"
  | "primer"
  | "segundo"
  | "inicio"
  | "fin"
  | "estado"
  | "base"
  | "ganados"
  | "tomados"
  | "pendientes"
  | "disponibles"
  | "uso"
  | "acciones";
type SummarySortColumn =
  | "empleado"
  | "base"
  | "ganados"
  | "tomados"
  | "pendientes"
  | "disponibles";

type EmployeeOption = {
  value: string;
  label: string;
};

type ProcesarDialogState = {
  accion: CompensacionAccion;
  item: CompensacionRow;
};

function toDateInput(value: string) {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return formatDateInputInLima(parsed);
  }

  return value.slice(0, 10);
}

function formatDateCell(value?: string) {
  const normalized = toDateInput(value ?? "");
  if (!normalized) return "-";
  const [yyyy, mm, dd] = normalized.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function formatDecimal(value: number, digits = 2) {
  return new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);
}

function getAccionLabel(accion: CompensacionAccion) {
  switch (accion) {
    case "PRIMER_APROBADOR":
      return "1er aprobador";
    case "SEGUNDO_APROBADOR":
      return "2do aprobador";
    case "RECHAZAR":
      return "Rechazar";
    default:
      return accion;
  }
}

function getCantidadDiasProceso(item: CompensacionRow) {
  const cantidadRango = calculateInclusiveDays(
    toDateInput(item.fechaInicio),
    toDateInput(item.fechaFin)
  );

  if (cantidadRango > 0) {
    return cantidadRango;
  }

  const cantidadDias = Number(item.cantidadDias ?? 0);
  return cantidadDias > 0 ? cantidadDias : 0;
}

function toNumber(value: string | number | null | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeSearchText(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function matchesFlexibleSearch(label: string, query: string): boolean {
  const normalizedLabel = normalizeSearchText(label);
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) return true;

  return (
    normalizedLabel.includes(normalizedQuery) ||
    normalizedLabel.replace(/\s+/g, "").includes(normalizedQuery.replace(/\s+/g, ""))
  );
}

function mapRowToForm(item: CompensacionRow): CompensacionGuardarRequest {
  const fechaInicio = toDateInput(item.fechaInicio);
  const fechaFin = toDateInput(item.fechaFin);

  return {
    id: item.idEmpleadoCompensacion,
    idEmpleadoCj: item.idEmpleadoCj,
    idEstado: item.idEstado,
    fecha: toDateInput(item.fecha),
    idActivo: item.idActivo,
    idAutorizado: item.idAutorizado,
    fechaAutorizado: toDateInput(item.fechaAutorizado),
    fechaInicio,
    fechaFin,
    fechaPre: toDateInput(item.fechaPre),
    fechaPrimera: toDateInput(item.fechaPrimera),
    idPre: item.idPre,
    idPrimera: item.idPrimera,
    idGestor: item.idGestor,
    usuario: item.usuario,
    idRechazo: item.idRechazo,
    fechaRechazo: toDateInput(item.fechaRechazo),
    pagada: item.pagada,
    comentario: item.comentario,
    tipoCompensacion: item.tipoCompensacion,
    cantidadDias: calculateInclusiveDays(fechaInicio, fechaFin),
    idSaldoCompensacion: item.idSaldoCompensacion,
    idMovimiento: item.idMovimiento,
    procesadoSaldo: item.procesadoSaldo,
  };
}

function getEmpleadoLabel(employeeById: Map<number, EmpleadoCta>, item: CompensacionRow) {
  if (item.nombreEmpleado) return item.nombreEmpleado;
  if (!item.idEmpleadoCj) return "-";
  const empleado = employeeById.get(item.idEmpleadoCj);
  return empleado?.nombreEmpleadoCJ || empleado?.nombreEmpleado || String(item.idEmpleadoCj);
}

function Field({
  label,
  children,
  required = false,
  fullWidth = false,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <label
      style={{
        ...styles.field,
        gridColumn: fullWidth ? "1 / -1" : undefined,
      }}
    >
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "amber" | "green" | "slate";
}) {
  const tones: Record<string, React.CSSProperties> = {
    blue: { borderColor: "#BFDBFE", background: "#EFF6FF", color: "#1D4ED8" },
    amber: { borderColor: "#FDE68A", background: "#FFFBEB", color: "#B45309" },
    green: { borderColor: "#BBF7D0", background: "#F0FDF4", color: "#15803D" },
    slate: { borderColor: "#CBD5E1", background: "#F8FAFC", color: "#334155" },
  };

  return (
    <div style={{ ...styles.statCard, ...tones[tone] }}>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "slate" | "amber" | "blue";
}) {
  const tones: Record<string, React.CSSProperties> = {
    green: { background: "#DCFCE7", color: "#166534" },
    slate: { background: "#E2E8F0", color: "#334155" },
    amber: { background: "#FEF3C7", color: "#92400E" },
    blue: { background: "#DBEAFE", color: "#1D4ED8" },
  };

  return <span style={{ ...styles.pill, ...tones[tone] }}>{label}</span>;
}

function EmployeeTypeahead({
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  allowEmpty = false,
  emptyLabel = "Sin resultados",
}: {
  value: string;
  options: EmployeeOption[];
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  );
  const [query, setQuery] = useState(selectedOption?.label ?? "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(selectedOption?.label ?? "");
  }, [selectedOption]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery(selectedOption?.label ?? "");
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open, selectedOption]);

  const filteredOptions = useMemo(
    () => options.filter((option) => matchesFlexibleSearch(option.label, query)).slice(0, 100),
    [options, query]
  );

  return (
    <div ref={rootRef} style={styles.typeaheadWrap}>
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (event.target.value.trim() === "" && allowEmpty) {
            onChange("");
          }
        }}
        style={styles.input}
      />
      {open ? (
        <div style={styles.typeaheadMenu}>
          {allowEmpty ? (
            <button
              type="button"
              style={styles.typeaheadItem}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange("");
                setQuery("");
                setOpen(false);
              }}
            >
              Todos
            </button>
          ) : null}
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button
                key={`${option.value}-${option.label}`}
                type="button"
                style={styles.typeaheadItem}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.value);
                  setQuery(option.label);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            ))
          ) : (
            <div style={styles.typeaheadEmpty}>{emptyLabel}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function CompensacionRealPage() {
  const authUser = getAuthUser();
  const currentEmployeeId = toNumber(authUser?.idEmpleado ?? authUser?.codEmp);
  const currentRoleCode = toNumber(authUser?.idrol ?? authUser?.idCargo);
  const isAdminRole = currentRoleCode === 4;

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("solicitudes");
  const [employeeFilter, setEmployeeFilter] = useState<string>("");
  const [dateFromFilter, setDateFromFilter] = useState<string>("");
  const [dateToFilter, setDateToFilter] = useState<string>("");
  const [estadoFilter, setEstadoFilter] = useState<string[]>([]);
  const [estadoFilterInicializado, setEstadoFilterInicializado] = useState(false);
  const [activeFilter, setActiveFilter] = useState<ActivoFilter>("activos");
  const [empleados, setEmpleados] = useState<EmpleadoCta[]>([]);
  const [empleadosLoading, setEmpleadosLoading] = useState(false);
  const [empleadosError, setEmpleadosError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saldos, setSaldos] = useState<CompensacionSaldo[]>([]);
  const [saldosLoading, setSaldosLoading] = useState(false);
  const [saldosError, setSaldosError] = useState<string | null>(null);
  const [saldoInfo, setSaldoInfo] = useState<CompensacionSaldo | null>(null);
  const [saldoLoading, setSaldoLoading] = useState(false);
  const [saldoError, setSaldoError] = useState<string | null>(null);
  const [procesarDialog, setProcesarDialog] = useState<ProcesarDialogState | null>(null);
  const [procesarComentario, setProcesarComentario] = useState("");
  const [procesarError, setProcesarError] = useState("");
  const [procesandoAccion, setProcesandoAccion] = useState(false);
  const [estadoDropdownOpen, setEstadoDropdownOpen] = useState(false);
  const estadoDropdownRef = useRef<HTMLDivElement | null>(null);
  const [sortConfig, setSortConfig] = useState<{
    column: SortColumn;
    direction: SortDirection;
  }>({
    column: "estado",
    direction: "asc",
  });
  const [summarySortConfig, setSummarySortConfig] = useState<{
    column: SummarySortColumn;
    direction: SortDirection;
  }>({
    column: "empleado",
    direction: "asc",
  });

  const api = useMemo(
    () => ({
      list: () => listarCompensaciones({ incluirInactivos: true }),
      create: (payload: CompensacionGuardarRequest) => crearCompensacion(payload),
      update: (id: number, payload: CompensacionGuardarRequest) =>
        actualizarCompensacion(id, payload),
      remove: (id: number) => eliminarCompensacion(id),
    }),
    []
  );

  const {
    items,
    form,
    setForm,
    setError,
    setMessage,
    loading,
    saving,
    error,
    message,
    panelOpen,
    setPanelOpen,
    mode,
    setMode,
    idToDelete,
    setIdToDelete,
    handleSave,
    handleDelete,
    load,
  } = useCrudForm<CompensacionRow, CompensacionGuardarRequest>(api, initialForm);

  const currentUserName =
    authUser?.usuario ??
    authUser?.userName ??
    authUser?.username ??
    authUser?.nombre ??
    "sistema";

  useEffect(() => {
    let cancelled = false;

    const loadEmpleados = async () => {
      try {
        setEmpleadosLoading(true);
        setEmpleadosError(null);
        const data = await listarEmpleadosWup();
        if (!cancelled) {
          setEmpleados(Array.isArray(data) ? data : []);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setEmpleadosError(getHttpErrorMessage(err, "No se pudieron cargar los empleados."));
        }
      } finally {
        if (!cancelled) {
          setEmpleadosLoading(false);
        }
      }
    };

    void loadEmpleados();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadSaldos = async () => {
      try {
        setSaldosLoading(true);
        setSaldosError(null);
        const data = await listarSaldosCompensacion();
        if (!cancelled) {
          setSaldos(Array.isArray(data) ? data : []);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setSaldos([]);
          setSaldosError(getHttpErrorMessage(err, "No se pudieron cargar los saldos de compensacion."));
        }
      } finally {
        if (!cancelled) {
          setSaldosLoading(false);
        }
      }
    };

    void loadSaldos();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const employeeId = Number(form.idEmpleadoCj ?? 0);
    if (!panelOpen || employeeId <= 0) {
      setSaldoInfo(null);
      setSaldoError(null);
      setSaldoLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const loadSaldo = async () => {
      try {
        setSaldoLoading(true);
        setSaldoError(null);
        const data = await obtenerSaldoCompensacion(employeeId);
        if (!cancelled) {
          setSaldoInfo(data);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setSaldoInfo(null);
          setSaldoError(getHttpErrorMessage(err, "No se pudo validar los dias pendientes del empleado."));
        }
      } finally {
        if (!cancelled) {
          setSaldoLoading(false);
        }
      }
    };

    void loadSaldo();

    return () => {
      cancelled = true;
    };
  }, [form.idEmpleadoCj, panelOpen]);

  const employeeById = useMemo(() => {
    const map = new Map<number, EmpleadoCta>();
    empleados.forEach((item) => {
      if (item.idEmpleado > 0) {
        map.set(item.idEmpleado, item);
      }
    });
    return map;
  }, [empleados]);

  const employeeOptions = useMemo(() => {
    return Array.from(
      new Map(
        empleados
          .filter((item) => item.idEmpleado > 0)
          .map((item) => [
            item.idEmpleado,
            {
              value: String(item.idEmpleado),
              label: item.nombreEmpleadoCJ || item.nombreEmpleado || String(item.idEmpleado),
            },
          ])
      ).values()
    )
      .sort((a, b) =>
        a.label.localeCompare(
          b.label,
          "es"
        )
      );
  }, [empleados]);

  const estadoOptions = useMemo(() => {
    const uniqueEstados = new Set(
      items.map((item) => String(item.estado || item.idEstado || "-").trim() || "-")
    );

    return [...uniqueEstados].sort((a, b) =>
      a.localeCompare(b, "es", {
        sensitivity: "base",
        numeric: true,
      })
    );
  }, [items]);

  const defaultEstadoSelections = useMemo(() => {
    const visibles = new Set<string>();

    items.forEach((item) => {
      const estadoLabel = String(item.estado || item.idEstado || "-").trim() || "-";
      const estadoId = Number(item.idEstado ?? 0);
      if (!DEFAULT_HIDDEN_ESTADOS.has(estadoId)) {
        visibles.add(estadoLabel);
      }
    });

    return estadoOptions.filter((estado) => visibles.has(estado));
  }, [estadoOptions, items]);

  useEffect(() => {
    if (estadoFilterInicializado || estadoOptions.length === 0) {
      return;
    }

    setEstadoFilter(defaultEstadoSelections);
    setEstadoFilterInicializado(true);
  }, [defaultEstadoSelections, estadoFilterInicializado, estadoOptions]);

  useEffect(() => {
    if (!estadoDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!estadoDropdownRef.current) return;
      if (!estadoDropdownRef.current.contains(event.target as Node)) {
        setEstadoDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [estadoDropdownOpen]);

  const estadoFilterLabel = useMemo(() => {
    if (estadoOptions.length > 0 && estadoFilter.length === estadoOptions.length) return "Todos";
    if (estadoFilter.length === 0) return "Ninguno";
    if (estadoFilter.length === 1) return estadoFilter[0];
    return `${estadoFilter.length} seleccionados`;
  }, [estadoFilter, estadoOptions]);

  const toggleEstadoSelection = (estado: string) => {
    setEstadoFilter((current) =>
      current.includes(estado)
        ? current.filter((item) => item !== estado)
        : [...current, estado]
    );
  };

  const filteredItems = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    return items.filter((item) => {
      const searchableValues = [
        item.idEmpleadoCompensacion,
        getEmpleadoLabel(employeeById, item),
        item.primer,
        item.segundo,
        item.estado,
        item.activo,
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");

      const matchesSearch = !searchTerm || searchableValues.includes(searchTerm);
      const matchesEmployee =
        isAdminRole || !employeeFilter || String(item.idEmpleadoCj ?? "") === employeeFilter;
      const itemStartDate = toDateInput(item.fechaInicio || item.fecha || "");
      const itemEndDate = toDateInput(item.fechaFin || item.fechaInicio || item.fecha || "");
      const matchesDateFrom =
        !dateFromFilter || (itemStartDate !== "" && itemStartDate >= dateFromFilter);
      const matchesDateTo =
        !dateToFilter || (itemEndDate !== "" && itemEndDate <= dateToFilter);
      const estadoValue = String(item.estado || item.idEstado || "-").trim() || "-";
      const matchesEstado =
        estadoFilter.length === 0 || estadoFilter.includes(estadoValue);
      const isActive = (item.idActivo ?? 1) === 1;
      const matchesActive =
        activeFilter === "todos"
          ? true
          : activeFilter === "activos"
            ? isActive
            : !isActive;

      return (
        matchesSearch &&
        matchesEmployee &&
        matchesDateFrom &&
        matchesDateTo &&
        matchesEstado &&
        matchesActive
      );
    });
  }, [activeFilter, dateFromFilter, dateToFilter, employeeById, employeeFilter, estadoFilter, isAdminRole, items, search]);

  const stats = useMemo(() => {
    const totalBase = saldos.reduce((sum, item) => sum + item.diasBase, 0);
    const totalGanados = saldos.reduce((sum, item) => sum + item.diasGanados, 0);
    const totalTomados = saldos.reduce((sum, item) => sum + item.diasTomados, 0);
    const totalPendientes = saldos.reduce((sum, item) => sum + item.diasPendientes, 0);
    const totalDisponibles = totalBase + totalGanados - totalTomados;
    const promedioUso =
      filteredItems.length > 0
        ? filteredItems.reduce((sum, item) => sum + item.porcentajeUso, 0) / filteredItems.length
        : 0;

    return {
      total: filteredItems.length,
      totalBase,
      totalGanados,
      totalPendientes,
      totalDisponibles,
      promedioUso,
    };
  }, [filteredItems, saldos]);

  const filteredSaldos = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    return saldos.filter((item) => {
      const matchesEmployee =
        isAdminRole || !employeeFilter || String(item.idEmpleadoCj ?? "") === employeeFilter;
      const searchableValues = [
        item.idEmpleadoCj,
        item.nombreEmpleado,
        item.diasBase,
        item.diasGanados,
        item.diasTomados,
        item.diasPendientes,
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");
      const matchesSearch = !searchTerm || searchableValues.includes(searchTerm);

      return matchesEmployee && matchesSearch;
    });
  }, [employeeFilter, isAdminRole, saldos, search]);

  const resumenTotales = useMemo(() => {
    const totalBase = filteredSaldos.reduce((sum, item) => sum + item.diasBase, 0);
    const totalGanados = filteredSaldos.reduce((sum, item) => sum + item.diasGanados, 0);
    const totalTomados = filteredSaldos.reduce((sum, item) => sum + item.diasTomados, 0);
    const totalPendientes = filteredSaldos.reduce((sum, item) => sum + item.diasPendientes, 0);
    const totalDisponibles = filteredSaldos.reduce(
      (sum, item) => sum + (item.diasBase + item.diasGanados - item.diasTomados),
      0
    );

    return {
      totalBase,
      totalGanados,
      totalTomados,
      totalPendientes,
      totalDisponibles,
    };
  }, [filteredSaldos]);

  const resumenVisualItems = useMemo(() => {
    const totalPendientes = filteredSaldos.reduce((sum, item) => sum + item.diasPendientes, 0);

    return [...filteredSaldos]
      .sort((a, b) => b.diasPendientes - a.diasPendientes)
      .map((item) => ({
        ...item,
        diasDisponibles: item.diasBase + item.diasGanados - item.diasTomados,
        pendingPercent:
          totalPendientes > 0 ? (item.diasPendientes / totalPendientes) * 100 : 0,
      }));
  }, [filteredSaldos]);

  const sortedSummarySaldos = useMemo(() => {
    const getSummarySortValue = (item: CompensacionSaldo): string | number => {
      switch (summarySortConfig.column) {
        case "empleado":
          return String(item.nombreEmpleado || "").toLowerCase();
        case "base":
          return item.diasBase;
        case "ganados":
          return item.diasGanados;
        case "tomados":
          return item.diasTomados;
        case "pendientes":
          return item.diasPendientes;
        case "disponibles":
          return item.diasBase + item.diasGanados - item.diasTomados;
        default:
          return "";
      }
    };

    return [...filteredSaldos].sort((a, b) => {
      const left = getSummarySortValue(a);
      const right = getSummarySortValue(b);

      let result = 0;
      if (typeof left === "number" && typeof right === "number") {
        result = left - right;
      } else {
        result = String(left).localeCompare(String(right), "es", {
          sensitivity: "base",
          numeric: true,
        });
      }

      return summarySortConfig.direction === "asc" ? result : -result;
    });
  }, [filteredSaldos, summarySortConfig]);

  const sortedItems = useMemo(() => {
    const getEstadoLabel = (item: CompensacionRow) =>
      String(item.estado || item.idEstado || "").toLowerCase();

    const getOrderDateValue = (item: CompensacionRow) => {
      const value = toDateInput(item.fechaInicio || item.fecha || "");
      return value ? Date.parse(value) || 0 : 0;
    };

    const getSortValue = (item: CompensacionRow): string | number => {
      switch (sortConfig.column) {
        case "id":
          return item.idEmpleadoCj ?? -1;
        case "empleado":
          return getEmpleadoLabel(employeeById, item).toLowerCase();
        case "primer":
          return (item.primer || "").toLowerCase();
        case "segundo":
          return (item.segundo || "").toLowerCase();
        case "inicio": {
          const value = toDateInput(item.fechaInicio || "");
          return value ? Date.parse(value) || 0 : 0;
        }
        case "fin": {
          const value = toDateInput(item.fechaFin || "");
          return value ? Date.parse(value) || 0 : 0;
        }
        case "estado":
          return String(item.estado || item.idEstado || "").toLowerCase();
        case "base":
          return item.diasBase;
        case "ganados":
          return item.diasGanados;
        case "tomados":
          return item.diasTomados;
        case "pendientes":
          return item.diasPendientes;
        case "disponibles":
          return item.diasBase + item.diasGanados - item.diasTomados;
        case "uso":
          return item.porcentajeUso;
        case "acciones":
          return item.idEmpleadoCompensacion;
        default:
          return "";
      }
    };

    return [...filteredItems].sort((a, b) => {
      const leftEstado9 = (a.idEstado ?? 0) === 9;
      const rightEstado9 = (b.idEstado ?? 0) === 9;

      // Siempre enviar al final los registros con IdEstado = 9.
      if (leftEstado9 !== rightEstado9) {
        return leftEstado9 ? 1 : -1;
      }

      // Dentro de IdEstado = 9, ordenar por fecha.
      if (leftEstado9 && rightEstado9) {
        return getOrderDateValue(a) - getOrderDateValue(b);
      }

      // Para el resto, ordenar primero por nombre de estado.
      const estadoCompare = getEstadoLabel(a).localeCompare(getEstadoLabel(b), "es", {
        sensitivity: "base",
        numeric: true,
      });
      if (estadoCompare !== 0) {
        return estadoCompare;
      }

      const left = getSortValue(a);
      const right = getSortValue(b);

      let result = 0;
      if (typeof left === "number" && typeof right === "number") {
        result = left - right;
      } else {
        result = String(left).localeCompare(String(right), "es", {
          sensitivity: "base",
          numeric: true,
        });
      }

      return sortConfig.direction === "asc" ? result : -result;
    });
  }, [employeeById, filteredItems, sortConfig]);

  const toggleSort = (column: SortColumn) => {
    setSortConfig((current) => {
      if (current.column === column) {
        return {
          column,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }

      return {
        column,
        direction: "asc",
      };
    });
  };

  const getSortIndicator = (column: SortColumn) => {
    if (sortConfig.column !== column) return "<>";
    return sortConfig.direction === "asc" ? "^" : "v";
  };

  const toggleSummarySort = (column: SummarySortColumn) => {
    setSummarySortConfig((current) => {
      if (current.column === column) {
        return {
          column,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }

      return {
        column,
        direction: "asc",
      };
    });
  };

  const getSummarySortIndicator = (column: SummarySortColumn) => {
    if (summarySortConfig.column !== column) return "<>";
    return summarySortConfig.direction === "asc" ? "^" : "v";
  };

  const recargarSaldos = async () => {
    try {
      setSaldosLoading(true);
      setSaldosError(null);
      const data = await listarSaldosCompensacion();
      setSaldos(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setSaldos([]);
      setSaldosError(getHttpErrorMessage(err, "No se pudieron cargar los saldos de compensacion."));
    } finally {
      setSaldosLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setMode("nuevo");
    setForm(buildInitialForm());
    setPanelOpen(true);
  };

  const handleOpenEdit = (item: CompensacionRow) => {
    try {
      if (Number(item.idEstado ?? 0) === 9) {
        return;
      }
      setMode("editar");
      setForm(mapRowToForm(item));
      setPanelOpen(true);
    } catch (err: unknown) {
      window.alert(getHttpErrorMessage(err, "No se pudo cargar la compensación."));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleClosePanel = () => {
    if (saving || detailLoading) return;
    setPanelOpen(false);
  };

  const handleOpenProcesar = async (accion: CompensacionAccion, item: CompensacionRow) => {
    try {
      setDetailLoading(true);
      setError("");
      setMessage("");
      setProcesarError("");

      const detalle =
        item.idEmpleadoCompensacion > 0
          ? await obtenerCompensacion(item.idEmpleadoCompensacion)
          : item;

      setProcesarComentario((detalle.comentario ?? "").slice(0, MAX_COMMENT_LENGTH));
      setProcesarDialog({ accion, item: detalle });
    } catch (err: unknown) {
      setProcesarError(getHttpErrorMessage(err, "No se pudo cargar la compensacion."));
      setError(getHttpErrorMessage(err, "No se pudo cargar la compensacion."));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCloseProcesar = () => {
    if (procesandoAccion) return;
    setProcesarDialog(null);
    setProcesarComentario("");
    setProcesarError("");
  };

  const handleConfirmarProcesar = async () => {
    if (!procesarDialog || procesandoAccion) {
      return;
    }

    const comentarioLimpio = procesarComentario.trim();
    if (procesarDialog.accion === "RECHAZAR" && !comentarioLimpio) {
      setProcesarError("Debe ingresar un comentario o motivo de rechazo antes de continuar.");
      return;
    }

    if (comentarioLimpio.length > MAX_COMMENT_LENGTH) {
      setProcesarError("El comentario no puede superar los 500 caracteres.");
      return;
    }

    const payload: ProcesarCompensacionRequest = {
      idEmpleadoCj: Number(procesarDialog.item.idEmpleadoCj ?? 0),
      fechaInicio: toDateInput(procesarDialog.item.fechaInicio),
      fechaFin: toDateInput(procesarDialog.item.fechaFin),
      accion: procesarDialog.accion,
      comentario: comentarioLimpio || undefined,
      usuario: currentUserName,
      idEmpleadoAccion: currentEmployeeId > 0 ? currentEmployeeId : undefined,
    };

    try {
      setProcesandoAccion(true);
      setProcesarError("");
      setError("");
      setMessage("");
      const response = await procesarCompensacion(payload);
      setMessage(response.mensaje || "Compensacion procesada correctamente.");
      setProcesarDialog(null);
      setProcesarComentario("");
      setProcesarError("");
      await Promise.all([load(), recargarSaldos()]);
    } catch (err: unknown) {
      setProcesarError(getHttpErrorMessage(err, "Error al procesar la compensacion."));
    } finally {
      setProcesandoAccion(false);
    }
  };

  const cantidadDiasSolicitada = Number(form.cantidadDias ?? 0);
  const diasPendientesDisponibles = Number(saldoInfo?.diasPendientes ?? 0);
  const hasCantidadDias = Number.isFinite(cantidadDiasSolicitada) && cantidadDiasSolicitada > 0;
  const hasSaldoDisponible = diasPendientesDisponibles > 0;
  const hasSufficientSaldo = hasCantidadDias && hasSaldoDisponible && cantidadDiasSolicitada <= diasPendientesDisponibles;
  const saldoValidationMessage =
    hasCantidadDias && !saldoLoading && Number(form.idEmpleadoCj ?? 0) > 0 && !hasSufficientSaldo
      ? "No se tiene suficientes dias a compensar.."
      : "";
  const disableSaveButton =
    saving || detailLoading || saldoLoading || Boolean(saldoError) || Boolean(saldoValidationMessage);
  const procesarComentarioLimpio = procesarComentario.trim();
  const comentarioInvalido =
    procesarDialog?.accion === "RECHAZAR" && !procesarComentarioLimpio;
  const comentarioExcedeLimite = procesarComentarioLimpio.length > MAX_COMMENT_LENGTH;
  const disableProcesarButton =
    procesandoAccion || Boolean(comentarioInvalido) || comentarioExcedeLimite;

  return (
    <div style={styles.page}>
      
      <CrudToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por empleado, responsables, estado o activo..."
        searchFieldsHint="id, empleado, primer responsable, segundo responsable, estado y activo"
        inputStyle={{
          maxWidth: 460,
        }}
        buttons={[
          {
            key: "nuevo",
            label: "Nuevo",
            onClick: handleOpenCreate,
            disabled: saving || detailLoading,
          },
        ]}
      >
        <div style={styles.toolbarFilters}>
          {!isAdminRole ? (
            <label style={styles.toolbarField}>
              <span>Empleado</span>
              <EmployeeTypeahead
                value={employeeFilter}
                options={employeeOptions}
                onChange={setEmployeeFilter}
                placeholder="Todos"
                disabled={empleadosLoading}
                allowEmpty
                emptyLabel="No hay empleados WUP"
              />
            </label>
          ) : null}
          <label style={styles.toolbarField}>
            <span>Fecha desde</span>
            <input
              type="date"
              value={dateFromFilter}
              onChange={(event) => setDateFromFilter(event.target.value)}
              style={styles.toolbarSelect}
            />
          </label>
          <label style={styles.toolbarField}>
            <span>Fecha hasta</span>
            <input
              type="date"
              value={dateToFilter}
              onChange={(event) => setDateToFilter(event.target.value)}
              style={styles.toolbarSelect}
            />
          </label>
          <label style={styles.toolbarField}>
            <span>Estado visual</span>
            <select
              value={activeFilter}
              onChange={(event) => setActiveFilter(event.target.value as ActivoFilter)}
              style={styles.toolbarSelect}
            >
              <option value="activos">Solo activos</option>
              <option value="todos">Todos</option>
              <option value="inactivos">Solo inactivos</option>
            </select>
          </label>
          <label style={styles.toolbarField}>
            <span>Estado</span>
            <div style={styles.multiSelectWrap} ref={estadoDropdownRef}>
              <button
                type="button"
                style={styles.multiSelectTrigger}
                onClick={() => setEstadoDropdownOpen((current) => !current)}
              >
                <span>{estadoFilterLabel}</span>
                <span style={styles.multiSelectChevron}>
                  {estadoDropdownOpen ? "^" : "v"}
                </span>
              </button>
              {estadoDropdownOpen ? (
                <div style={styles.multiSelectMenu}>
                  <label style={styles.multiSelectOption}>
                    <input
                      type="checkbox"
                      checked={estadoOptions.length > 0 && estadoFilter.length === estadoOptions.length}
                      onChange={() => setEstadoFilter(estadoOptions)}
                    />
                    <span>Todos</span>
                  </label>
                  {estadoOptions.map((estado) => (
                    <label key={estado} style={styles.multiSelectOption}>
                      <input
                        type="checkbox"
                        checked={estadoFilter.includes(estado)}
                        onChange={() => toggleEstadoSelection(estado)}
                      />
                      <span>{estado}</span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          </label>
        </div>
      </CrudToolbar>

      {error && !panelOpen ? <div style={styles.errorBox}>{error}</div> : null}
      {message ? <div style={styles.successBox}>{message}</div> : null}
      {empleadosError ? <div style={styles.warningBox}>{empleadosError}</div> : null}
      {saldosError ? <div style={styles.warningBox}>{saldosError}</div> : null}


      <div style={styles.tabBar}>
        <button
          type="button"
          style={{
            ...styles.tabButton,
            ...(activeTab === "solicitudes" ? styles.tabButtonActive : {}),
          }}
          onClick={() => setActiveTab("solicitudes")}
        >
          Listado de compensaciones solicitadas
        </button>
        <button
          type="button"
          style={{
            ...styles.tabButton,
            ...(activeTab === "resumen" ? styles.tabButtonActive : {}),
          }}
          onClick={() => setActiveTab("resumen")}
        >
          Resumen de compensaciones pendientes
        </button>
      </div>

      {activeTab === "solicitudes" ? (
        <div style={styles.tableCard}>
          <div style={styles.cardHeader}>
            <div>
              <strong>Listado de compensaciones solicitadas</strong>
              <div style={styles.cardMeta}>
                {filteredItems.length} registro{filteredItems.length === 1 ? "" : "s"} visibles
              </div>
            </div>
            {loading || detailLoading || empleadosLoading ? (
              <span style={styles.badge}>Cargando...</span>
            ) : null}
          </div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.stickyIdTh}>
                    <button type="button" style={styles.sortButton} onClick={() => toggleSort("id")}>
                      Id <span style={styles.sortIcon}>{getSortIndicator("id")}</span>
                    </button>
                  </th>
                  <th style={styles.stickyEmpleadoTh}>
                    <button
                      type="button"
                      style={styles.sortButton}
                      onClick={() => toggleSort("empleado")}
                    >
                      Empleado <span style={styles.sortIcon}>{getSortIndicator("empleado")}</span>
                    </button>
                  </th>
                  <th style={styles.th}>
                    <button
                      type="button"
                      style={styles.sortButton}
                      onClick={() => toggleSort("primer")}
                    >
                      Primer <span style={styles.sortIcon}>{getSortIndicator("primer")}</span>
                    </button>
                  </th>
                  <th style={styles.th}>
                    <button
                      type="button"
                      style={styles.sortButton}
                      onClick={() => toggleSort("segundo")}
                    >
                      Segundo <span style={styles.sortIcon}>{getSortIndicator("segundo")}</span>
                    </button>
                  </th>
                  <th style={styles.th}>
                    <button
                      type="button"
                      style={styles.sortButton}
                      onClick={() => toggleSort("inicio")}
                    >
                      Inicio <span style={styles.sortIcon}>{getSortIndicator("inicio")}</span>
                    </button>
                  </th>
                  <th style={styles.th}>
                    <button type="button" style={styles.sortButton} onClick={() => toggleSort("fin")}>
                      Fin <span style={styles.sortIcon}>{getSortIndicator("fin")}</span>
                    </button>
                  </th>
                  <th style={styles.th}>
                    <button
                      type="button"
                      style={styles.sortButton}
                      onClick={() => toggleSort("estado")}
                    >
                      Estado <span style={styles.sortIcon}>{getSortIndicator("estado")}</span>
                    </button>
                  </th>
                  <th style={styles.th}>
                    <button
                      type="button"
                      style={styles.sortButton}
                      onClick={() => toggleSort("base")}
                    >
                      DiasBase <span style={styles.sortIcon}>{getSortIndicator("base")}</span>
                    </button>
                  </th>
                  <th style={styles.th}>
                    <button
                      type="button"
                      style={styles.sortButton}
                      onClick={() => toggleSort("ganados")}
                    >
                      Ganados <span style={styles.sortIcon}>{getSortIndicator("ganados")}</span>
                    </button>
                  </th>
                  <th style={styles.th}>
                    <button
                      type="button"
                      style={styles.sortButton}
                      onClick={() => toggleSort("tomados")}
                    >
                      Tomados <span style={styles.sortIcon}>{getSortIndicator("tomados")}</span>
                    </button>
                  </th>
                  <th style={styles.th}>
                    <button
                      type="button"
                      style={styles.sortButton}
                      onClick={() => toggleSort("pendientes")}
                    >
                      Pendientes <span style={styles.sortIcon}>{getSortIndicator("pendientes")}</span>
                    </button>
                  </th>
                  <th style={styles.th}>
                    <button
                      type="button"
                      style={styles.sortButton}
                      onClick={() => toggleSort("acciones")}
                    >
                      Acciones <span style={styles.sortIcon}>{getSortIndicator("acciones")}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={12} style={styles.emptyCell}>
                      Cargando registros...
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={styles.emptyCell}>
                      No hay registros para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  sortedItems.map((item) => {
                    const itemEstado = Number(item.idEstado ?? 0);
                    const isEstadoInvalidoRechazo = itemEstado === -1;
                    const isEstadoBloqueado = itemEstado === 9;
                    const isEstadoRechazado = itemEstado === 22;
                    const canUseFirstApproverByEstado = itemEstado === 97;
                    const canUseSecondApproverByEstado = itemEstado === 98;
                    const hasRoleOverride = currentRoleCode === 5 || currentRoleCode === 4;
                    const isFirstApproverOwner =
                      currentEmployeeId > 0 && toNumber(item.idResponsableCj) === currentEmployeeId;
                    const isSecondApproverOwner =
                      currentEmployeeId > 0 && toNumber(item.idSegundoVacaciones) === currentEmployeeId;
                    const disableFirstApproverButton =
                      saving ||
                      detailLoading ||
                      isEstadoBloqueado ||
                      isEstadoRechazado ||
                      !canUseFirstApproverByEstado ||
                      (!hasRoleOverride && !isFirstApproverOwner);
                    const disableSecondApproverButton =
                      saving ||
                      detailLoading ||
                      isEstadoBloqueado ||
                      isEstadoRechazado ||
                      !canUseSecondApproverByEstado ||
                      (!hasRoleOverride && !isSecondApproverOwner);
                    const disableEditButton =
                      saving ||
                      detailLoading ||
                      isEstadoBloqueado ||
                      isEstadoRechazado;
                    const disableRejectButton =
                      disableEditButton || isEstadoInvalidoRechazo;

                    return (
                      <tr
                        key={
                          item.idEmpleadoCompensacion > 0
                            ? `${item.idEmpleadoCompensacion}-${item.idEmpleadoCj ?? "sin-empleado"}-${item.fechaInicio ?? ""}-${item.fechaFin ?? ""}-${item.usuario ?? ""}`
                            : `${item.idEmpleadoCj ?? "sin-empleado"}-${item.fechaInicio ?? ""}-${item.fechaFin ?? ""}-${item.usuario ?? ""}`
                        }
                      >
                      <td style={styles.stickyIdTd}>{item.idEmpleadoCj ?? "-"}</td>
                      <td style={styles.stickyEmpleadoTd}>
                        <div style={styles.cellPrimary}>{getEmpleadoLabel(employeeById, item)}</div>
                      </td>
                      <td style={styles.td}>{item.primer || "-"}</td>
                      <td style={styles.td}>{item.segundo || "-"}</td>
                      <td style={styles.td}>{formatDateCell(item.fechaInicio)}</td>
                      <td style={styles.td}>{formatDateCell(item.fechaFin)}</td>
                      <td style={styles.td}>{item.estado || item.idEstado || "-"}</td>
                      <td style={styles.td}>{formatDecimal(item.diasBase)}</td>
                      <td style={styles.td}>{formatDecimal(item.diasGanados)}</td>
                      <td style={styles.td}>{formatDecimal(item.diasTomados)}</td>
                      <td style={styles.td}>{formatDecimal(item.diasPendientes)}</td>
                      <td style={styles.td}>
                        <div style={styles.actions}>
                          <button
                            type="button"
                            style={{
                              ...styles.secondaryButton,
                              ...(disableFirstApproverButton ? styles.secondaryButtonDisabled : {}),
                            }}
                            onClick={() => handleOpenProcesar("PRIMER_APROBADOR", item)}
                            disabled={disableFirstApproverButton}
                          >
                            1er aprobador
                          </button>
                          <button
                            type="button"
                            style={{
                              ...styles.secondaryButton,
                              ...(disableSecondApproverButton ? styles.secondaryButtonDisabled : {}),
                            }}
                            onClick={() => handleOpenProcesar("SEGUNDO_APROBADOR", item)}
                            disabled={disableSecondApproverButton}
                          >
                            2do aprobador
                          </button>
                          {SHOW_EDIT_BUTTON ? (
                            <button
                              type="button"
                              style={{
                                ...styles.secondaryButton,
                                ...(disableEditButton ? styles.secondaryButtonDisabled : {}),
                              }}
                              onClick={() => handleOpenEdit(item)}
                              disabled={disableEditButton}
                            >
                              Editar
                            </button>
                          ) : null}
                          <button
                            type="button"
                            style={{
                              ...styles.dangerButton,
                              ...(disableRejectButton ? styles.secondaryButtonDisabled : {}),
                            }}
                            onClick={() => handleOpenProcesar("RECHAZAR", item)}
                            disabled={disableRejectButton}
                          >
                            Rechazar
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={styles.tableCard}>
          <div style={styles.cardHeader}>
            <div>
              <strong>Resumen de compensaciones pendientes</strong>
              <div style={styles.cardMeta}>
                {filteredSaldos.length} empleado{filteredSaldos.length === 1 ? "" : "s"} en resumen
              </div>
            </div>
            {saldosLoading ? <span style={styles.badge}>Cargando...</span> : null}
          </div>

          <div style={styles.summaryVisualGrid}>
            <div style={styles.summaryVisualCard}>
              <div style={styles.summaryVisualHeader}>
                <strong style={styles.summaryVisualTitle}>Lectura rapida del resumen</strong>
                <span style={styles.summaryVisualCaption}>
                  Totales visibles segun los filtros aplicados
                </span>
              </div>

              <div style={styles.summaryLegend}>
                <div style={styles.summaryLegendItem}>
                  <span style={{ ...styles.summaryLegendSwatch, background: "#CBD5E1" }} />
                  <div>
                    <div style={styles.summaryLegendLabel}>Dias base</div>
                    <div style={styles.summaryLegendValue}>
                      {formatDecimal(resumenTotales.totalBase)}
                    </div>
                  </div>
                </div>

                <div style={styles.summaryLegendItem}>
                  <span style={{ ...styles.summaryLegendSwatch, background: "#F59E0B" }} />
                  <div>
                    <div style={styles.summaryLegendLabel}>Dias ganados</div>
                    <div style={styles.summaryLegendValue}>
                      {formatDecimal(resumenTotales.totalGanados)}
                    </div>
                  </div>
                </div>

                <div style={styles.summaryLegendItem}>
                  <span style={{ ...styles.summaryLegendSwatch, background: "#EF4444" }} />
                  <div>
                    <div style={styles.summaryLegendLabel}>Dias tomados</div>
                    <div style={styles.summaryLegendValue}>
                      {formatDecimal(resumenTotales.totalTomados)}
                    </div>
                  </div>
                </div>

                <div style={styles.summaryLegendItem}>
                  <span style={{ ...styles.summaryLegendSwatch, background: "#10B981" }} />
                  <div>
                    <div style={styles.summaryLegendLabel}>Dias pendientes</div>
                    <div style={styles.summaryLegendValue}>
                      {formatDecimal(resumenTotales.totalPendientes)}
                    </div>
                  </div>
                </div>

                <div style={styles.summaryLegendItem}>
                  <span style={{ ...styles.summaryLegendSwatch, background: "#4F46E5" }} />
                  <div>
                    <div style={styles.summaryLegendLabel}>Dias disponibles</div>
                    <div style={styles.summaryLegendValue}>
                      {formatDecimal(resumenTotales.totalDisponibles)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={styles.summaryParallelGrid}>
            <div style={styles.summaryVisualCard}>
              <div style={styles.summaryVisualHeader}>
                <strong style={styles.summaryVisualTitle}>
                  Participacion de empleados sobre el total pendiente
                </strong>
                <span style={styles.summaryVisualCaption}>
                  Cada barra muestra cuantos dias pendientes concentra cada empleado
                  respecto del total visible en el resumen
                </span>
              </div>

              <div style={styles.summaryBars}>
                {resumenVisualItems.length === 0 ? (
                  <div style={styles.summaryBarsEmpty}>
                    No hay datos suficientes para construir el cuadro visual.
                  </div>
                ) : (
                  resumenVisualItems.map((item) => (
                    <div
                      key={`visual-${item.idEmpleadoCj ?? item.nombreEmpleado}`}
                      style={styles.summaryBarRow}
                    >
                      <div style={styles.summaryBarHeader}>
                        <div style={styles.summaryBarLabel}>
                          {item.nombreEmpleado || `Empleado ${item.idEmpleadoCj ?? "-"}`}
                        </div>
                        <div style={styles.summaryBarValue}>
                          {formatDecimal(item.diasPendientes)} d pendientes
                        </div>
                      </div>
                      <div style={styles.summaryBarTrack}>
                        <div
                          style={{
                            ...styles.summaryBarFill,
                            width: `${Math.max(item.pendingPercent, 2)}%`,
                          }}
                        />
                      </div>
                      <div style={styles.summaryBarFoot}>
                        <span>Participacion: {formatDecimal(item.pendingPercent)}%</span>
                        <span>Disponibles: {formatDecimal(item.diasDisponibles)}</span>
                        <span>Tomados: {formatDecimal(item.diasTomados)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          <div style={styles.summaryTableCard}>
            <div style={styles.summarySortBar}>
              <span style={styles.summarySortLabel}>Ordenar detalle por:</span>
              <button
                type="button"
                style={styles.summarySortButton}
                onClick={() => toggleSummarySort("empleado")}
              >
                Empleado <span style={styles.sortIcon}>{getSummarySortIndicator("empleado")}</span>
              </button>
              <button
                type="button"
                style={styles.summarySortButton}
                onClick={() => toggleSummarySort("base")}
              >
                Dias base <span style={styles.sortIcon}>{getSummarySortIndicator("base")}</span>
              </button>
              <button
                type="button"
                style={styles.summarySortButton}
                onClick={() => toggleSummarySort("ganados")}
              >
                Dias ganados <span style={styles.sortIcon}>{getSummarySortIndicator("ganados")}</span>
              </button>
              <button
                type="button"
                style={styles.summarySortButton}
                onClick={() => toggleSummarySort("tomados")}
              >
                Dias tomados <span style={styles.sortIcon}>{getSummarySortIndicator("tomados")}</span>
              </button>
              <button
                type="button"
                style={styles.summarySortButton}
                onClick={() => toggleSummarySort("pendientes")}
              >
                Dias pendientes <span style={styles.sortIcon}>{getSummarySortIndicator("pendientes")}</span>
              </button>
              <button
                type="button"
                style={styles.summarySortButton}
                onClick={() => toggleSummarySort("disponibles")}
              >
                Dias disponibles <span style={styles.sortIcon}>{getSummarySortIndicator("disponibles")}</span>
              </button>
            </div>
            <div style={styles.summaryTableWrap}>
            <table style={styles.summaryTable}>
              <thead>
                <tr>
                  <th style={styles.th}>Id empleado</th>
                  <th style={styles.th}>
                    <button
                      type="button"
                      style={styles.sortButton}
                      onClick={() => toggleSummarySort("empleado")}
                    >
                      Empleado <span style={styles.sortIcon}>{getSummarySortIndicator("empleado")}</span>
                    </button>
                  </th>
                  <th style={styles.th}>Días base</th>
                  <th style={styles.th}>Días ganados</th>
                  <th style={styles.th}>Días tomados</th>
                  <th style={styles.th}>Días pendientes</th>
                  <th style={styles.th}>Días disponibles</th>
                </tr>
              </thead>
              <tbody>
                {saldosLoading ? (
                  <tr>
                    <td colSpan={7} style={styles.emptyCell}>
                      Cargando resumen...
                    </td>
                  </tr>
                ) : filteredSaldos.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={styles.emptyCell}>
                      No hay saldos para los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  sortedSummarySaldos.map((item) => (
                    <tr key={`saldo-${item.idEmpleadoCj ?? item.nombreEmpleado}`}>
                      <td style={styles.td}>{item.idEmpleadoCj ?? "-"}</td>
                      <td style={styles.td}>
                        <div style={styles.cellPrimary}>{item.nombreEmpleado || "-"}</div>
                      </td>
                      <td style={styles.td}>{formatDecimal(item.diasBase)}</td>
                      <td style={styles.td}>{formatDecimal(item.diasGanados)}</td>
                      <td style={styles.td}>{formatDecimal(item.diasTomados)}</td>
                      <td style={styles.td}>{formatDecimal(item.diasPendientes)}</td>
                      <td style={styles.td}>
                        {formatDecimal(item.diasBase + item.diasGanados - item.diasTomados)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </div>
          </div>
        </div>
      )}

      {panelOpen ? (
        <div style={styles.overlay}>
          <div style={styles.panelCard}>
            <div style={styles.cardHeader}>
              <div>
                <strong>{mode === "editar" ? "Editar compensación" : "Nueva compensación"}</strong>
                <div style={styles.cardMeta}>
                  Completa los campos principales del registro.
                </div>
              </div>
            </div>

            <div style={styles.formGrid}>
              {error ? (
                <div style={{ ...styles.errorBox, gridColumn: "1 / -1", marginBottom: 0 }}>
                  {error}
                </div>
              ) : null}

              <Field label="Empleado" required>
                <EmployeeTypeahead
                  value={form.idEmpleadoCj != null ? String(form.idEmpleadoCj) : ""}
                  options={employeeOptions}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      idEmpleadoCj: value ? Number(value) : null,
                    }))
                  }
                  placeholder="Seleccione un empleado"
                  disabled={saving || detailLoading || empleadosLoading}
                  emptyLabel="No hay empleados WUP"
                />
                <div style={styles.fieldHelpText}>
                  {saldoLoading
                    ? "Validando dias pendientes..."
                    : `Dias pendientes: ${formatDecimal(diasPendientesDisponibles)}`}
                </div>
                {saldoError ? <div style={styles.fieldError}>{saldoError}</div> : null}
              </Field>

              <div style={styles.dateAndDaysRow}>
                <Field label="Fecha inicio">
                  <input
                    type="date"
                    value={form.fechaInicio}
                    onChange={(event) => {
                      setError("");
                      setForm((current) => ({
                        ...current,
                        fechaInicio: event.target.value,
                        cantidadDias: calculateInclusiveDays(event.target.value, current.fechaFin),
                      }));
                    }}
                    style={styles.input}
                  />
                </Field>

                <Field label="Fecha fin">
                  <input
                    type="date"
                    value={form.fechaFin}
                    onChange={(event) => {
                      setError("");
                      setForm((current) => ({
                        ...current,
                        fechaFin: event.target.value,
                        cantidadDias: calculateInclusiveDays(current.fechaInicio, event.target.value),
                      }));
                    }}
                    style={styles.input}
                  />
                </Field>

                <Field label="Cantidad días">
                  <input
                    type="number"
                    value={form.cantidadDias}
                    min={0}
                    step="0.5"
                    readOnly
                    style={styles.input}
                  />
                  {saldoValidationMessage ? (
                    <div style={styles.fieldError}>{saldoValidationMessage}</div>
                  ) : null}
                </Field>
              </div>

              

              <Field label="Comentario" fullWidth>
                <textarea
                  value={form.comentario}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      comentario: event.target.value,
                    }))
                  }
                  style={styles.textarea}
                />
              </Field>

              <div style={styles.formActions}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={handleClosePanel}
                  disabled={saving || detailLoading}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  style={{
                    ...styles.primaryButton,
                    ...(disableSaveButton ? styles.primaryButtonDisabled : {}),
                  }}
                  onClick={() => void handleSave()}
                  disabled={disableSaveButton}
                >
                  {saving ? "Guardando..." : mode === "editar" ? "Actualizar" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {procesarDialog ? (
        <div style={styles.overlay}>
          <div style={styles.processCard}>
            <div style={styles.cardHeader}>
              <div>
                <strong>{getAccionLabel(procesarDialog.accion)}</strong>
                <div style={styles.cardMeta}>Confirma la accion y registra un comentario si aplica.</div>
              </div>
            </div>

            <div style={styles.processBody}>
              <div style={styles.processSummaryGrid}>
                <div style={styles.processSummaryItem}>
                  <span style={styles.processSummaryLabel}>Accion</span>
                  <strong>{getAccionLabel(procesarDialog.accion)}</strong>
                </div>
                <div style={styles.processSummaryItem}>
                  <span style={styles.processSummaryLabel}>Empleado</span>
                  <strong>{getEmpleadoLabel(employeeById, procesarDialog.item)}</strong>
                </div>
                <div style={styles.processSummaryItem}>
                  <span style={styles.processSummaryLabel}>Fecha inicial</span>
                  <strong>{formatDateCell(procesarDialog.item.fechaInicio)}</strong>
                </div>
                <div style={styles.processSummaryItem}>
                  <span style={styles.processSummaryLabel}>Fecha final</span>
                  <strong>{formatDateCell(procesarDialog.item.fechaFin)}</strong>
                </div>
                <div style={styles.processSummaryItem}>
                  <span style={styles.processSummaryLabel}>Cantidad de dias</span>
                  <strong>{formatDecimal(getCantidadDiasProceso(procesarDialog.item))}</strong>
                </div>
              </div>

              {procesarError ? <div style={styles.errorBox}>{procesarError}</div> : null}

              <Field label="Comentario" fullWidth>
                <textarea
                  value={procesarComentario}
                  onChange={(event) => {
                    setProcesarError("");
                    setProcesarComentario(event.target.value.slice(0, MAX_COMMENT_LENGTH));
                  }}
                  maxLength={MAX_COMMENT_LENGTH}
                  rows={4}
                  placeholder={
                    procesarDialog.accion === "RECHAZAR"
                      ? "Ingrese obligatoriamente el motivo del rechazo"
                      : "Ingrese un comentario opcional"
                  }
                  style={styles.textarea}
                />
                <div style={styles.processCommentMeta}>
                  <span>
                    {procesarDialog.accion === "RECHAZAR"
                      ? "Comentario obligatorio"
                      : "Comentario opcional"}
                  </span>
                  <span>{procesarComentario.length} / 500 caracteres</span>
                </div>
              </Field>

              <div style={styles.formActions}>
                <button
                  type="button"
                  style={{
                    ...styles.secondaryButton,
                    ...(procesandoAccion ? styles.secondaryButtonDisabled : {}),
                  }}
                  onClick={handleCloseProcesar}
                  disabled={procesandoAccion}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  style={{
                    ...styles.primaryButton,
                    ...(disableProcesarButton ? styles.primaryButtonDisabled : {}),
                  }}
                  onClick={() => void handleConfirmarProcesar()}
                  disabled={disableProcesarButton}
                >
                  {procesandoAccion ? "Confirmando..." : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {idToDelete ? (
        <div style={styles.overlay}>
          <div style={styles.deleteCard}>
            <h3 style={styles.deleteTitle}>Confirmar eliminación</h3>
            <p style={styles.deleteText}>
              Se aplicará un borrado lógico sobre el registro <strong>{idToDelete}</strong>.
            </p>
            <div style={styles.formActions}>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => setIdToDelete(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                style={styles.dangerFillButton}
                onClick={() =>
                  void handleDelete(idToDelete).then(() => setIdToDelete(null))
                }
              >
                Eliminar
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
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 18,
    height: "100%",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
    boxSizing: "border-box",
  },
  hero: {
    display: "grid",
    gap: 8,
    padding: "24px 28px",
    borderRadius: 24,
    background:
      "linear-gradient(135deg, rgba(23,20,58,0.98) 0%, rgba(55,48,163,0.94) 45%, rgba(14,165,233,0.88) 100%)",
    color: "#FFFFFF",
    boxShadow: "0 18px 50px rgba(30, 41, 59, 0.18)",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    opacity: 0.82,
  },
  title: {
    margin: 0,
    fontSize: 34,
    lineHeight: 1.05,
  },
  subtitle: {
    margin: 0,
    maxWidth: 920,
    color: "rgba(255,255,255,0.86)",
    lineHeight: 1.6,
    fontSize: 14,
  },
  toolbarFilters: {
    display: "flex",
    gap: 12,
    flexWrap: "nowrap",
    alignItems: "flex-end",
    justifyContent: "flex-start",
    flex: "0 1 auto",
    minWidth: 0,
    width: "auto",
    maxWidth: "100%",
  },
  toolbarField: {
    display: "grid",
    gap: 6,
    minWidth: 190,
    flex: "0 0 190px",
    fontSize: 11,
    fontWeight: 700,
    color: "#334155",
  },
  toolbarSelect: {
    width: "100%",
    height: 42,
    borderRadius: 10,
    border: "1px solid #D1D5DB",
    padding: "0 12px",
    fontSize: 12,
    background: "#FFFFFF",
    boxSizing: "border-box",
  },
  multiSelectWrap: {
    position: "relative",
    width: "100%",
  },
  multiSelectTrigger: {
    width: "100%",
    minHeight: 42,
    borderRadius: 10,
    border: "1px solid #D1D5DB",
    background: "#FFFFFF",
    fontSize: 12,
    color: "#0F172A",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "0 12px",
    cursor: "pointer",
    textAlign: "left",
  },
  multiSelectChevron: {
    color: "#64748B",
    fontSize: 11,
  },
  multiSelectMenu: {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    right: 0,
    maxHeight: 220,
    overflowY: "auto",
    border: "1px solid #CBD5E1",
    borderRadius: 10,
    background: "#FFFFFF",
    boxShadow: "0 14px 28px rgba(15, 23, 42, 0.14)",
    padding: 8,
    zIndex: 20,
    display: "grid",
    gap: 4,
  },
  multiSelectOption: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    color: "#0F172A",
    padding: "4px 2px",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
    flexShrink: 0,
  },
  statCard: {
    border: "1px solid",
    borderRadius: 18,
    padding: "14px 16px",
    display: "grid",
    gap: 8,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: 700,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 800,
    lineHeight: 1,
  },
  summaryText: {
    color: "#334155",
    fontSize: 13,
    minWidth: 0,
    flexShrink: 0,
  },
  tabBar: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  tabButton: {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#334155",
    padding: "10px 16px",
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
  },
  tabButtonActive: {
    border: "1px solid #4F46E5",
    background: "#EEF2FF",
    color: "#3730A3",
  },
  tableCard: {
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: 22,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    flex: 1,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    minHeight: 0,
    boxSizing: "border-box",
    boxShadow: "0 18px 44px rgba(15, 23, 42, 0.06)",
  },
  panelCard: {
    width: 900,
    maxWidth: "100%",
    maxHeight: "90vh",
    overflow: "auto",
    background: "#FFFFFF",
    borderRadius: 22,
    boxShadow: "0 18px 54px rgba(15, 23, 42, 0.24)",
  },
  processCard: {
    width: 720,
    maxWidth: "100%",
    background: "#FFFFFF",
    borderRadius: 22,
    boxShadow: "0 18px 54px rgba(15, 23, 42, 0.24)",
    overflow: "hidden",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    padding: "18px 20px",
    borderBottom: "1px solid #E2E8F0",
    color: "#0F172A",
  },
  cardMeta: {
    marginTop: 4,
    fontSize: 11,
    color: "#64748B",
  },
  infoCard: {
    margin: "16px 20px 0",
    padding: "14px 16px",
    borderRadius: 16,
    border: "1px solid #BFDBFE",
    background: "#EFF6FF",
    display: "grid",
    gap: 6,
  },
  infoTitle: {
    color: "#1E3A8A",
    fontSize: 13,
  },
  infoText: {
    color: "#334155",
    fontSize: 12,
    lineHeight: 1.5,
  },
  summaryVisualGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: 16,
    padding: "16px 20px 0",
  },
  summaryParallelGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(320px, 0.95fr) minmax(0, 1.05fr)",
    gap: 16,
    padding: "16px 20px 20px",
    minHeight: 0,
    alignItems: "stretch",
  },
  summaryVisualCard: {
    border: "1px solid #E2E8F0",
    borderRadius: 18,
    background:
      "linear-gradient(180deg, rgba(248,250,252,0.96) 0%, rgba(255,255,255,1) 100%)",
    padding: 16,
    display: "grid",
    gap: 14,
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
  },
  summaryVisualHeader: {
    display: "grid",
    gap: 4,
  },
  summaryVisualTitle: {
    color: "#0F172A",
    fontSize: 13,
  },
  summaryVisualCaption: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 1.45,
  },
  summaryLegend: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
  },
  summaryLegendItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: "1px solid #E2E8F0",
    borderRadius: 14,
    background: "#FFFFFF",
    padding: "12px 12px",
  },
  summaryLegendSwatch: {
    width: 12,
    height: 42,
    borderRadius: 999,
    flexShrink: 0,
  },
  summaryLegendLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: 700,
  },
  summaryLegendValue: {
    marginTop: 3,
    color: "#0F172A",
    fontSize: 18,
    fontWeight: 800,
    lineHeight: 1,
  },
  summaryBars: {
    display: "grid",
    gap: 12,
    maxHeight: 320,
    overflowY: "auto",
    paddingRight: 4,
  },
  summaryBarsEmpty: {
    border: "1px dashed #CBD5E1",
    borderRadius: 14,
    padding: 18,
    textAlign: "center",
    color: "#64748B",
    fontSize: 12,
    background: "#F8FAFC",
  },
  summaryBarRow: {
    display: "grid",
    gap: 6,
  },
  summaryBarHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryBarLabel: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: 700,
  },
  summaryBarValue: {
    color: "#047857",
    fontSize: 11,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  summaryBarTrack: {
    width: "100%",
    height: 12,
    borderRadius: 999,
    background: "#E2E8F0",
    overflow: "hidden",
  },
  summaryBarFill: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #34D399 0%, #10B981 60%, #059669 100%)",
  },
  summaryBarFoot: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
    color: "#64748B",
    fontSize: 11,
  },
  summaryTableCard: {
    border: "1px solid #E2E8F0",
    borderRadius: 18,
    background: "#FFFFFF",
    overflow: "hidden",
    minWidth: 0,
    minHeight: 0,
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
  },
  summarySortBar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    padding: "12px 14px",
    borderBottom: "1px solid #E2E8F0",
    background: "#F8FAFC",
  },
  summarySortLabel: {
    color: "#475569",
    fontSize: 11,
    fontWeight: 800,
  },
  summarySortButton: {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    padding: "7px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  },
  summaryTableWrap: {
    display: "block",
    overflow: "auto",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    minHeight: 0,
    maxHeight: 420,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "7px 10px",
    borderRadius: 999,
    background: "#EEF2FF",
    color: "#4338CA",
    fontSize: 11,
    fontWeight: 700,
  },
  tableWrap: {
    display: "block",
    flex: 1,
    overflow: "auto",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    minHeight: 0,
  },
  table: {
    width: "max-content",
    maxWidth: "none",
    borderCollapse: "collapse",
    minWidth: 1480,
  },
  summaryTable: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 920,
  },
  th: {
    position: "sticky",
    top: 0,
    background: "#F8FAFC",
    color: "#334155",
    textAlign: "left",
    padding: "12px 14px",
    fontSize: 11,
    fontWeight: 800,
    borderBottom: "1px solid #E2E8F0",
    zIndex: 1,
  },
  stickyIdTh: {
    position: "sticky",
    top: 0,
    left: 0,
    minWidth: 50,
    background: "#F8FAFC",
    color: "#334155",
    textAlign: "left",
    padding: "10px 10px",
    fontSize: 11,
    fontWeight: 800,
    borderBottom: "1px solid #E2E8F0",
    boxShadow: "1px 0 0 #E2E8F0",
    zIndex: 4,
  },
  stickyEmpleadoTh: {
    position: "sticky",
    top: 0,
    left: 82,
    minWidth: 220,
    background: "#F8FAFC",
    color: "#334155",
    textAlign: "left",
    padding: "12px 14px",
    fontSize: 11,
    fontWeight: 800,
    borderBottom: "1px solid #E2E8F0",
    boxShadow: "1px 0 0 #E2E8F0",
    zIndex: 4,
  },
  sortButton: {
    border: "none",
    background: "transparent",
    padding: 0,
    margin: 0,
    font: "inherit",
    color: "inherit",
    fontWeight: 800,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
  },
  sortIcon: {
    fontSize: 10,
    lineHeight: 1,
    color: "#64748B",
    minWidth: 14,
    textAlign: "center",
  },
  td: {
    padding: "12px 14px",
    fontSize: 12,
    color: "#0F172A",
    borderBottom: "1px solid #E2E8F0",
    verticalAlign: "top",
  },
  stickyIdTd: {
    position: "sticky",
    left: 0,
    minWidth: 82,
    padding: "12px 10px",
    fontSize: 12,
    color: "#0F172A",
    borderBottom: "1px solid #E2E8F0",
    verticalAlign: "top",
    background: "#FFFFFF",
    boxShadow: "1px 0 0 #E2E8F0",
    zIndex: 2,
  },
  stickyEmpleadoTd: {
    position: "sticky",
    left: 82,
    minWidth: 220,
    padding: "12px 14px",
    fontSize: 12,
    color: "#0F172A",
    borderBottom: "1px solid #E2E8F0",
    verticalAlign: "top",
    background: "#FFFFFF",
    boxShadow: "1px 0 0 #E2E8F0",
    zIndex: 2,
  },
  cellPrimary: {
    fontWeight: 700,
    color: "#0F172A",
  },
  cellSecondary: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 11,
  },
  emptyCell: {
    textAlign: "center",
    padding: 28,
    color: "#64748B",
    fontSize: 13,
  },
  actions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 54,
    padding: "5px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3000,
    padding: 16,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14,
    padding: 20,
  },
  processBody: {
    display: "grid",
    gap: 16,
    padding: 20,
  },
  processSummaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },
  processSummaryItem: {
    display: "grid",
    gap: 4,
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
    color: "#0F172A",
    fontSize: 12,
  },
  processSummaryLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: 700,
  },
  dateAndDaysRow: {
    gridColumn: "1 / -1",
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 14,
  },
  field: {
    display: "grid",
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    color: "#334155",
  },
  fieldHelpText: {
    fontSize: 11,
    fontWeight: 600,
    color: "#64748B",
  },
  fieldError: {
    fontSize: 11,
    fontWeight: 700,
    color: "#B91C1C",
  },
  processCommentMeta: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    color: "#64748B",
    fontSize: 11,
    fontWeight: 600,
  },
  typeaheadWrap: {
    position: "relative",
  },
  input: {
    height: 42,
    borderRadius: 10,
    border: "1px solid #D1D5DB",
    padding: "0 12px",
    fontSize: 12,
    background: "#FFFFFF",
    color: "#0F172A",
    boxSizing: "border-box",
  },
  typeaheadMenu: {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    right: 0,
    maxHeight: 240,
    overflowY: "auto",
    border: "1px solid #CBD5E1",
    borderRadius: 12,
    background: "#FFFFFF",
    boxShadow: "0 14px 28px rgba(15, 23, 42, 0.14)",
    padding: 6,
    zIndex: 40,
    display: "grid",
    gap: 4,
  },
  typeaheadItem: {
    border: "none",
    background: "#FFFFFF",
    color: "#0F172A",
    textAlign: "left",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 12,
    cursor: "pointer",
  },
  typeaheadEmpty: {
    padding: "10px 12px",
    fontSize: 12,
    color: "#64748B",
  },
  textarea: {
    width: "100%",
    borderRadius: 12,
    border: "1px solid #D1D5DB",
    padding: 12,
    fontSize: 12,
    background: "#FFFFFF",
    color: "#0F172A",
    boxSizing: "border-box",
    resize: "vertical",
    minHeight: 118,
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minHeight: 42,
    fontSize: 12,
    color: "#0F172A",
  },
  formActions: {
    gridColumn: "1 / -1",
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 4,
  },
  primaryButton: {
    border: "none",
    background: "#4F46E5",
    color: "#FFFFFF",
    padding: "10px 16px",
    borderRadius: 10,
    fontWeight: 800,
    cursor: "pointer",
  },
  primaryButtonDisabled: {
    background: "#C7D2FE",
    color: "#EEF2FF",
    cursor: "not-allowed",
    opacity: 0.8,
  },
  secondaryButton: {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    padding: "10px 16px",
    borderRadius: 10,
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButtonDisabled: {
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
    color: "#94A3B8",
    cursor: "not-allowed",
    opacity: 0.75,
  },
  dangerButton: {
    border: "1px solid #FCA5A5",
    background: "#FFFFFF",
    color: "#B91C1C",
    padding: "10px 16px",
    borderRadius: 10,
    fontWeight: 700,
    cursor: "pointer",
  },
  dangerFillButton: {
    border: "none",
    background: "#DC2626",
    color: "#FFFFFF",
    padding: "10px 16px",
    borderRadius: 10,
    fontWeight: 800,
    cursor: "pointer",
  },
  errorBox: {
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C",
    borderRadius: 14,
    padding: "12px 14px",
  },
  successBox: {
    border: "1px solid #BBF7D0",
    background: "#F0FDF4",
    color: "#166534",
    borderRadius: 14,
    padding: "12px 14px",
  },
  warningBox: {
    border: "1px solid #FDE68A",
    background: "#FFFBEB",
    color: "#92400E",
    borderRadius: 14,
    padding: "12px 14px",
  },
  deleteCard: {
    width: 420,
    maxWidth: "100%",
    background: "#FFFFFF",
    borderRadius: 18,
    padding: 24,
    boxShadow: "0 18px 54px rgba(15, 23, 42, 0.24)",
  },
  deleteTitle: {
    margin: 0,
    color: "#0F172A",
  },
  deleteText: {
    color: "#475569",
    lineHeight: 1.6,
    marginTop: 12,
    marginBottom: 0,
  },
};
