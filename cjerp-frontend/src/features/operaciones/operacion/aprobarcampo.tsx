import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ClipboardList } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import CrudToolbar, {
  matchesCrudToolbarSearch,
  type CrudToolbarSearchField,
} from "../../../components/base/CrudToolbar";
import SidePanelForm from "../../../components/base/SidePanelForm";
import {
  actualizarAprobarCampo,
  aprobarIngresoAprobarCampo,
  aprobarSalidaAprobarCampo,
  crearAprobarCampo,
  listarAprobarCampo,
  obtenerAprobarCampoDetalle,
  rechazarAprobarCampo,
} from "../../../api/aprobarCampoService";
import { consultarAuditoriaCambios } from "../../../api/auditoriaCambiosService";
import type {
  AprobarCampoAccionRequest,
  AprobarCampoClave,
  AprobarCampoFiltro,
  AprobarCampoGuardarRequest,
  AprobarCampoRow,
} from "../../../models/aprobarCampo";
import type { AuditoriaCambioItem } from "../../../models/auditoria";
import { getAuthUser } from "../../../utils/authStorage";
import { getHttpErrorMessage } from "../../../utils/httpError";

type SortState = {
  key: string;
  direction: "asc" | "desc";
};

type Draft = {
  idAsistencia?: number;
  idEmpleado: string;
  fechaAsistencia: string;
  responsable: string;
  empleado: string;
  estado: string;
  ingreso: string;
  salida: string;
  observacion: string;
  latitud: string;
  longitud: string;
  latitudSalida: string;
  longitudSalida: string;
  imagen: string;
  imagenSalida: string;
};

type FilterState = {
  responsable: string;
  empleado: string;
  estado: string;
  fechaDesde: string;
  fechaHasta: string;
};

type ActionModalState =
  | { type: "aprobar-ingreso" | "aprobar-salida" | "rechazar"; row: AprobarCampoRow }
  | null;

type MediaViewerState =
  | { type: "image"; title: string; url: string }
  | { type: "map"; title: string; lat: string; lng: string }
  | null;

type ResponsableResumenItem = {
  responsable: string;
  cantidad: number;
};

type AprobarCampoNavigationState = {
  initialFilters?: Partial<FilterState>;
  returnToAsistencia?: boolean;
  returnState?: Record<string, unknown>;
  sourceLabel?: string;
};

type ColumnFilterDropdownProps = {
  header: { key: string; label: string };
  filtroColumnaMenuRef: React.RefObject<HTMLDivElement | null>;
  filtrosColumnas: Record<string, string[]>;
  setFiltrosColumnas: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  opcionesFiltroPorColumna: Record<string, string[]>;
  filtroBusqueda: string;
  setFiltroBusqueda: (value: string) => void;
};

const visibleColumns = [
  { key: "responsable", label: "Responsable", width: "180px" },
  { key: "nombreempleado", label: "Empleado", width: "200px" },
  { key: "estado", label: "Estado", width: "140px" },
  { key: "fechaasistencia", label: "Fecha", width: "140px" },
  { key: "hora", label: "Ingreso", width: "130px" },
  { key: "horasalida", label: "Salida", width: "130px" },
  { key: "comentario", label: "Comentario", width: "240px" },
] as const;

const actionColumnWidth = "160px";

// Estilos para botones deshabilitados
const disabledButtonStyle = {
  opacity: 0.5,
  cursor: "not-allowed" as const,
  pointerEvents: "none" as const,
};

const initialFilters: FilterState = {
  responsable: "",
  empleado: "",
  estado: "",
  fechaDesde: "",
  fechaHasta: "",
};

const createEmptyDraft = (): Draft => ({
  idEmpleado: "",
  fechaAsistencia: "",
  responsable: "",
  empleado: "",
  estado: "",
  ingreso: "",
  salida: "",
  observacion: "",
  latitud: "",
  longitud: "",
  latitudSalida: "",
  longitudSalida: "",
  imagen: "",
  imagenSalida: "",
});

function formatHeader(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function getValorIngreso(row: AprobarCampoRow) {
  const val = toText(row.ingreso || row.hora);
  return val && val !== "-" ? val : "";
}

function getValorSalida(row: AprobarCampoRow) {
  const val = toText(row.salida || row.horasalida);
  return val && val !== "-" ? val : "";
}

function getIngresoCoordinates(row: AprobarCampoRow) {
  const lat = toText(
    row.latitud ||
      (row as Record<string, unknown>).latitudIngreso ||
      (row as Record<string, unknown>).latitudentrada
  );
  const lng = toText(
    row.longitud ||
      (row as Record<string, unknown>).longitudIngreso ||
      (row as Record<string, unknown>).longitudentrada
  );

  row.latitud = lat;
  row.longitud = lng;

  return { lat, lng };
}

function getSalidaCoordinates(row: AprobarCampoRow) {
  const lat = toText(
    (row as Record<string, unknown>).latitudsalida ||
      row.latitudSalida ||
      (row as Record<string, unknown>).latitudSalidaRuta
  );
  const lng = toText(
    (row as Record<string, unknown>).longitudsalida ||
      row.longitudSalida ||
      (row as Record<string, unknown>).longitudSalidaRuta
  );

  (row as Record<string, unknown>).latitudsalida = lat;
  (row as Record<string, unknown>).longitudsalida = lng;
  row.latitudSalida = lat;
  row.longitudSalida = lng;

  return { lat, lng };
}

function getIngresoImage(row: AprobarCampoRow) {
  return toText(
    row.imagen ||
      (row as Record<string, unknown>).imgFactura ||
      (row as Record<string, unknown>).imagenIngreso
  );
}

function getSalidaImage(row: AprobarCampoRow) {
  return toText(
    (row as Record<string, unknown>).imagensalida ||
      row.imagenSalida ||
      (row as Record<string, unknown>).imagenSalidaRuta
  );
}

function normalizeColumnValue(value: unknown) {
  return String(value ?? "").trim();
}

function matchesColumnFilterValue(value: unknown, selectedValues: string[]) {
  if (!selectedValues.length) return true;
  return selectedValues.includes(normalizeColumnValue(value));
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("es-PE");
}

function formatDateTime(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("es-PE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  }

  if (value.includes("T")) {
    const compact = value.split("T")[1];
    return compact.slice(0, 5);
  }

  return value.length >= 5 ? value.slice(0, 5) : value;
}

function normalizeDateInput(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  return "";
}

function normalizeDateTimeLocalInput(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  return value.replace(" ", "T").slice(0, 16);
}

function buildRowKey(row: AprobarCampoRow) {
  const idAsistencia = row.idAsistencia ?? row.id;
  if (idAsistencia != null) {
    return String(idAsistencia);
  }

  return `${toText(row.idEmpleado ?? row.idempleado)}|${normalizeDateInput(toText(row.fechaAsistencia ?? row.fechaasistencia))}`;
}

function buildNavigationMatchKey(row: AprobarCampoRow) {
  return [
    toText(row.idEmpleado ?? row.idempleado),
    normalizeDateInput(toText(row.fechaAsistencia ?? row.fechaasistencia)),
    formatTime(toText(row.hora ?? row.ingreso)),
    formatTime(toText(row.horasalida ?? row.horaSalida ?? row.salida)),
    toText(row.responsable).toUpperCase(),
    toText(row.empleado || row.nombreempleado || row.nombreEmpleado).toUpperCase(),
  ].join("|");
}

function buildNavigationMatchKeyLoose(row: AprobarCampoRow) {
  return [
    toText(row.idEmpleado ?? row.idempleado),
    normalizeDateInput(toText(row.fechaAsistencia ?? row.fechaasistencia)),
    toText(row.responsable).toUpperCase(),
    toText(row.empleado || row.nombreempleado || row.nombreEmpleado).toUpperCase(),
  ].join("|");
}

function buildClaveFromRow(row: AprobarCampoRow): AprobarCampoClave {
  const idAsistenciaRaw = row.idAsistencia ?? row.id;
  const idAsistencia =
    idAsistenciaRaw != null && String(idAsistenciaRaw).trim() !== ""
      ? Number(idAsistenciaRaw)
      : undefined;

  const idEmpleadoSource = row.idEmpleado ?? row.idempleado;
  const idEmpleado = idEmpleadoSource != null ? Number(idEmpleadoSource) : undefined;

  return {
    idAsistencia: Number.isFinite(idAsistencia) ? idAsistencia : undefined,
    idEmpleado: Number.isFinite(idEmpleado) ? idEmpleado : undefined,
    fechaAsistencia: normalizeDateInput(toText(row.fechaasistencia ?? row.fechaAsistencia)),
  };
}

function buildDraftFromRow(row: AprobarCampoRow): Draft {
  return {
    idAsistencia: row.idAsistencia != null ? Number(row.idAsistencia) : row.id != null ? Number(row.id) : undefined,
    idEmpleado: toText(row.idEmpleado ?? row.idempleado),
    fechaAsistencia: normalizeDateInput(toText(row.fechaasistencia ?? row.fechaAsistencia)),
    responsable: toText(row.responsable),
    empleado: toText(row.empleado || row.nombreempleado || row.nombreEmpleado),
    estado: toText(row.estado),
    ingreso: normalizeDateTimeLocalInput(toText(row.ingreso || row.hora)),
    salida: normalizeDateTimeLocalInput(toText(row.salida || row.horasalida)),
    observacion: toText(row.observacion),
    latitud: toText(row.latitud),
    longitud: toText(row.longitud),
    latitudSalida: toText(row.latitudSalida || row.latitudsalida),
    longitudSalida: toText(row.longitudSalida || row.longitudsalida),
    imagen: toText(row.imagen),
    imagenSalida: toText(row.imagenSalida || row.imagensalida),
  };
}

function toSaveDateTime(value: string) {
  if (!value.trim()) return undefined;
  return value.replace("T", " ");
}

function buildSavePayload(draft: Draft, usuarioAccion: string): AprobarCampoGuardarRequest {
  return {
    idAsistencia: draft.idAsistencia,
    idEmpleado: Number(draft.idEmpleado),
    fechaAsistencia: draft.fechaAsistencia,
    responsable: draft.responsable.trim() || undefined,
    empleado: draft.empleado.trim() || undefined,
    estado: draft.estado.trim() || undefined,
    ingreso: toSaveDateTime(draft.ingreso),
    salida: toSaveDateTime(draft.salida),
    observacion: draft.observacion.trim() || undefined,
    latitud: draft.latitud.trim() || undefined,
    longitud: draft.longitud.trim() || undefined,
    latitudSalida: draft.latitudSalida.trim() || undefined,
    longitudSalida: draft.longitudSalida.trim() || undefined,
    imagen: draft.imagen.trim() || undefined,
    imagenSalida: draft.imagenSalida.trim() || undefined,
    usuarioAccion,
  };
}

function hasCoordinates(lat?: string, lng?: string) {
  return Boolean(lat?.trim() && lng?.trim());
}

function ColumnFilterDropdown({
  header,
  filtroColumnaMenuRef,
  filtrosColumnas,
  setFiltrosColumnas,
  opcionesFiltroPorColumna,
  filtroBusqueda,
  setFiltroBusqueda,
}: ColumnFilterDropdownProps) {
  const opciones = (opcionesFiltroPorColumna[header.key] ?? []).filter((opcion) =>
    (opcion || "(Vacio)").toLowerCase().includes(filtroBusqueda.toLowerCase())
  );

  return (
    <div
      ref={filtroColumnaMenuRef}
      onClick={(event) => event.stopPropagation()}
      style={styles.columnFilter}
    >
      <div style={styles.columnFilterHeader}>
        <strong style={styles.columnFilterTitle}>{header.label}</strong>
        <button
          type="button"
          onClick={() => setFiltrosColumnas((prev) => ({ ...prev, [header.key]: [] }))}
          style={styles.clearInlineButton}
        >
          Limpiar
        </button>
      </div>
      <input
        type="text"
        placeholder="Buscar opcion..."
        value={filtroBusqueda}
        onChange={(event) => setFiltroBusqueda(event.target.value)}
        style={styles.columnFilterInput}
      />
      <label style={styles.columnFilterItem}>
        <input
          type="checkbox"
          checked={(filtrosColumnas[header.key] ?? []).length === 0}
          onChange={() => setFiltrosColumnas((prev) => ({ ...prev, [header.key]: [] }))}
        />
        <span>(Todas)</span>
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 220, overflowY: "auto" }}>
        {opciones.map((opcion) => {
          const seleccionadas = filtrosColumnas[header.key] ?? [];
          const checked = seleccionadas.includes(opcion);
          return (
            <label key={`${header.key}-${opcion}`} style={styles.columnFilterItem}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  setFiltrosColumnas((prev) => {
                    const actuales = prev[header.key] ?? [];
                    return {
                      ...prev,
                      [header.key]: checked
                        ? actuales.filter((item) => item !== opcion)
                        : [...actuales, opcion],
                    };
                  })
                }
              />
              <span>{opcion || "(Vacio)"}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default function AprobarCampoPage() {
    // Estado para el checkbox 'Incluido día actual'
    const [incluirDiaActual, setIncluirDiaActual] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const authUser = getAuthUser();
  const usuarioAccion =
    String(
      authUser?.usuario ??
        authUser?.userName ??
        authUser?.username ??
        authUser?.nombre ??
        authUser?.nombreEmpleado ??
        "sistema"
    ).trim() || "sistema";

  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<AprobarCampoRow[]>([]);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<"create" | "edit">("create");
  const [draft, setDraft] = useState<Draft>(createEmptyDraft());
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [historyRows, setHistoryRows] = useState<AuditoriaCambioItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [actionModal, setActionModal] = useState<ActionModalState>(null);
  const [actionComment, setActionComment] = useState("");
  const [actionError, setActionError] = useState("");
  const [mediaViewer, setMediaViewer] = useState<MediaViewerState>(null);
  const [responsablesModalOpen, setResponsablesModalOpen] = useState(false);
  const [responsablesResumenRows, setResponsablesResumenRows] = useState<AprobarCampoRow[]>([]);
  const [responsablesResumenLoading, setResponsablesResumenLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [openColumnFilterKey, setOpenColumnFilterKey] = useState<string | null>(null);
  const [columnFilterSearch, setColumnFilterSearch] = useState("");
  const [filtrosColumnas, setFiltrosColumnas] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState<SortState | null>(null);
  const filtroColumnaMenuRef = useRef<HTMLDivElement | null>(null);
  const sortableColumns = ["responsable", "nombreempleado", "estado", "fechaasistencia", "hora", "horasalida"];

  const navigationState = (location.state as AprobarCampoNavigationState | null) ?? null;
  const [showInitialNavigationBanner, setShowInitialNavigationBanner] = useState(
    Boolean(navigationState?.sourceLabel)
  );
  const [canReturnToAsistencia, setCanReturnToAsistencia] = useState(navigationState?.returnToAsistencia === true);
  const hasInitialNavigationFilters = Boolean(navigationState?.initialFilters);

  const searchFields = useMemo<CrudToolbarSearchField<AprobarCampoRow>[]>(() => {
    const preferredKeys = ["responsable", "nombreempleado", "empleado", "estado", "comentario", "observacion", "fechaasistencia"];

    const fields = preferredKeys.map((key) => ({
      key,
      label: formatHeader(key),
      getValue: (item: AprobarCampoRow) => item[key],
    }));

    availableColumns.forEach((column) => {
      if (fields.some((item) => item.key === column)) return;
      fields.push({
        key: column,
        label: formatHeader(column),
        getValue: (item: AprobarCampoRow) => item[column],
      });
    });

    return fields;
  }, [availableColumns]);

  // (Eliminada la declaración duplicada de loadRows)

  const loadHistory = async (idRegistro: string) => {
    if (!idRegistro) {
      setHistoryRows([]);
      return;
    }

    setHistoryLoading(true);
    try {
      const data = await consultarAuditoriaCambios({
        modulo: "Operaciones",
        entidad: "AprobarCampo",
        idRegistro,
        top: 30,
      });
      setHistoryRows(Array.isArray(data) ? data : []);
    } catch {
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (hasInitialNavigationFilters) {
      const nextFilters = { ...initialFilters, ...(navigationState?.initialFilters ?? {}) };
      setFilters(nextFilters);
      void loadRows(nextFilters);
      return;
    }

    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInitialNavigationFilters]);

  // Recargar datos cuando cambia el checkbox de día actual
  useEffect(() => {
    // Solo recargar si ya se cargaron datos previamente (evita doble carga inicial)
    if (rows.length > 0) {
      void loadRows();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incluirDiaActual]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        openColumnFilterKey &&
        filtroColumnaMenuRef.current &&
        !filtroColumnaMenuRef.current.contains(event.target as Node)
      ) {
        setOpenColumnFilterKey(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openColumnFilterKey]);

  const opcionesFiltroPorColumna = useMemo(() => {
    const options: Record<string, string[]> = {};

    visibleColumns.forEach((column) => {
      options[column.key] = Array.from(
        new Set(rows.map((row) => normalizeColumnValue(row[column.key])).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b, "es"));
    });

    return options;
  }, [rows]);

  const filteredRows = useMemo(() => {
    let result = rows
      .filter((row) => matchesCrudToolbarSearch(row, search, searchFields))
      .filter((row) =>
        visibleColumns.every((column) =>
          matchesColumnFilterValue(row[column.key], filtrosColumnas[column.key] ?? [])
        )
      );
    // Si el checkbox está desmarcado, filtrar el día actual
    if (!incluirDiaActual) {
      const hoy = new Date();
      // Obtener solo la parte de fecha (YYYY-MM-DD) en zona local
      const hoyStr = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0');
      result = result.filter((row) => {
        const fechaRaw = toText(row.fechaasistencia ?? row.fechaAsistencia);
        // Normalizar a formato YYYY-MM-DD
        let fechaSolo = '';
        if (fechaRaw.length >= 10) {
          // Si ya está en formato YYYY-MM-DD
          if (/^\d{4}-\d{2}-\d{2}$/.test(fechaRaw.slice(0, 10))) {
            fechaSolo = fechaRaw.slice(0, 10);
          } else {
            // Intentar parsear como fecha
            const d = new Date(fechaRaw);
            if (!isNaN(d.getTime())) {
              fechaSolo = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            }
          }
        }
        return fechaSolo !== hoyStr;
      });
    }
    if (sort && sortableColumns.includes(sort.key)) {
      result = [...result].sort((a, b) => {
        const aValue = toText(a[sort.key]);
        const bValue = toText(b[sort.key]);
        if (sort.key === 'fechaasistencia' || sort.key === 'hora' || sort.key === 'horasalida') {
          // Ordenar por fecha/hora/salida
          const aDate = new Date(aValue);
          const bDate = new Date(bValue);
          if (aDate < bDate) return sort.direction === 'asc' ? -1 : 1;
          if (aDate > bDate) return sort.direction === 'asc' ? 1 : -1;
          return 0;
        }
        if (aValue < bValue) return sort.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sort.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [filtrosColumnas, rows, search, searchFields, sort, incluirDiaActual]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [currentPage, filteredRows, pageSize, totalPages]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // Total: siempre la cantidad de registros cargados (sin filtros)
  // Filtrados: solo los visibles tras aplicar filtros
  // Guardar el total original de registros cargados (sin filtros)
  const [totalRows, setTotalRows] = useState(0);
  // Solo actualizar el total cuando se cargan datos nuevos desde la API (no por filtros)
  const loadRows = async (override?: Partial<FilterState>) => {
    const nextFilters = { ...filters, ...override };
    const payload: AprobarCampoFiltro = {
      responsable: nextFilters.responsable.trim() || undefined,
      empleado: nextFilters.empleado.trim() || undefined,
      estado: nextFilters.estado.trim() || undefined,
      fechaDesde: nextFilters.fechaDesde || undefined,
      fechaHasta: nextFilters.fechaHasta || undefined,
    };

    setLoading(true);
    setError("");

    try {
      const data = await listarAprobarCampo(payload);
      const nextRows = Array.isArray(data.rows) ? data.rows : [];
      setRows(nextRows);
      setAvailableColumns(Array.isArray(data.columns) ? data.columns : []);
      setCurrentPage(1);
      // Actualizar el total solo cuando se cargan datos nuevos
      setTotalRows(nextRows.length);
    } catch (err) {
      setRows([]);
      setAvailableColumns([]);
      setError(getHttpErrorMessage(err, "No se pudo cargar la aprobación de campo."));
      setTotalRows(0);
    } finally {
      setLoading(false);
    }
  };

  // Elimina el useEffect anterior de setTotalRows

  const stats = useMemo(() => {
    const visibles = filteredRows.length;
    const pendientes = rows.filter((row) => toText(row.estado).toLowerCase().includes("pend")).length;
    return { total: totalRows, visibles, pendientes };
  }, [filteredRows.length, rows, totalRows]);

  const faltaAprobarSelected =
    filters.estado.trim().toUpperCase() === "FALTA APROBAR";

  const responsablesResumen = useMemo<ResponsableResumenItem[]>(() => {
    const counts = new Map<string, number>();

    responsablesResumenRows.forEach((row) => {
      const responsable = toText(row.responsable) || "(Sin responsable)";
      counts.set(responsable, (counts.get(responsable) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([responsable, cantidad]) => ({ responsable, cantidad }))
      .sort((a, b) => {
        if (b.cantidad !== a.cantidad) {
          return b.cantidad - a.cantidad;
        }

        return a.responsable.localeCompare(b.responsable, "es");
      });
  }, [responsablesResumenRows]);

  const openCreatePanel = () => {
    setPanelMode("create");
    setDraft(createEmptyDraft());
    setDraftErrors({});
    setSelectedRecordId("");
    setHistoryRows([]);
    setPanelOpen(true);
  };

  const openEditPanel = async (row: AprobarCampoRow) => {
    const clave = buildClaveFromRow(row);
    const selectedId = buildRowKey(row);

    setPanelMode("edit");
    setPanelOpen(true);
    setDraft(buildDraftFromRow(row));
    setDraftErrors({});
    setSelectedRecordId(selectedId);
    void loadHistory(selectedId);

    try {
      const detail = await obtenerAprobarCampoDetalle(clave);
      setDraft(buildDraftFromRow(detail));
    } catch {
      // Se conserva el row actual como respaldo visual.
    }
  };

  const validateDraft = () => {
    const nextErrors: Record<string, string> = {};

    if (!draft.idEmpleado.trim() || Number.isNaN(Number(draft.idEmpleado)) || Number(draft.idEmpleado) <= 0) {
      nextErrors.idEmpleado = "IdEmpleado es obligatorio.";
    }

    if (!draft.fechaAsistencia.trim()) {
      nextErrors.fechaAsistencia = "FechaAsistencia es obligatoria.";
    }

    setDraftErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateDraft()) return;

    setSaving(true);
    setError("");

    try {
      const payload = buildSavePayload(draft, usuarioAccion);
      const response =
        panelMode === "create"
          ? await crearAprobarCampo(payload)
          : await actualizarAprobarCampo(payload);

      await loadRows();
      setPanelOpen(false);

      const resultingId =
        response.idRegistro ||
        `${payload.idEmpleado ?? ""}|${payload.fechaAsistencia}`;

      if (resultingId) {
        setSelectedRecordId(resultingId);
      }
    } catch (err) {
      setError(
        getHttpErrorMessage(
          err,
          panelMode === "create"
            ? "No se pudo registrar la aprobación de campo."
            : "No se pudo actualizar la aprobación de campo."
        )
      );
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAction = (type: "aprobar-ingreso" | "aprobar-salida" | "rechazar", row: AprobarCampoRow) => {
    setActionModal({ type, row });
    setActionComment(toText(row.observacion));
    setActionError("");
  };

  const handleConfirmAction = async () => {
    if (!actionModal) return;

    if (!actionComment.trim()) {
      setActionError("Debe ingresar una observación.");
      return;
    }

    const payload: AprobarCampoAccionRequest = {
      ...buildClaveFromRow(actionModal.row),
      observacion: actionComment.trim(),
      usuarioAccion,
    };

    setSaving(true);
    setActionError("");

    try {
      if (actionModal.type === "aprobar-ingreso") {
        await aprobarIngresoAprobarCampo(payload);
      } else if (actionModal.type === "aprobar-salida") {
        await aprobarSalidaAprobarCampo(payload);
      } else {
        await rechazarAprobarCampo(payload);
      }

      await loadRows();
      setActionModal(null);
      setActionComment("");

      const idRegistro = buildRowKey(actionModal.row);
      if (panelOpen && selectedRecordId === idRegistro) {
        void loadHistory(idRegistro);
      }
    } catch (err) {
      setActionError(getHttpErrorMessage(err, "No se pudo ejecutar la acción."));
    } finally {
      setSaving(false);
    }
  };

  const handleOpenMap = (title: string, lat: string, lng: string) => {
    if (!hasCoordinates(lat, lng)) return;
    setMediaViewer({ type: "map", title, lat, lng });
  };

  const toggleFaltaAprobarFilter = async () => {
    const nextEstado = faltaAprobarSelected ? "" : "FALTA APROBAR";
    const nextFilters = {
      ...filters,
      estado: nextEstado,
    };

    setFilters(nextFilters);
    await loadRows(nextFilters);
  };

  const loadResponsablesResumen = async () => {
    setResponsablesResumenLoading(true);
    try {
      const data = await listarAprobarCampo();
      let rowsResumen = Array.isArray(data.rows) ? data.rows : [];
      if (!incluirDiaActual) {
        const hoy = new Date();
        const hoyStr = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0');
        rowsResumen = rowsResumen.filter((row) => {
          const fechaRaw = toText(row.fechaasistencia ?? row.fechaAsistencia);
          let fechaSolo = '';
          if (fechaRaw.length >= 10) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(fechaRaw.slice(0, 10))) {
              fechaSolo = fechaRaw.slice(0, 10);
            } else {
              const d = new Date(fechaRaw);
              if (!isNaN(d.getTime())) {
                fechaSolo = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
              }
            }
          }
          return fechaSolo !== hoyStr;
        });
      }
      setResponsablesResumenRows(rowsResumen);
    } catch {
      setResponsablesResumenRows([]);
    } finally {
      setResponsablesResumenLoading(false);
    }
  };

  const handleSelectResponsableResumen = async (responsable: string) => {
    const nextFilters = {
      ...initialFilters,
      responsable: responsable === "(Sin responsable)" ? "" : responsable,
    };

    setResponsablesModalOpen(false);
    setSearch("");
    setFiltrosColumnas({});
    setFilters(nextFilters);
    // Al igual que Limpiar filtros, recarga los datos y actualiza el total
    await loadRows(nextFilters);
  };

  useEffect(() => {
    if (!responsablesModalOpen) {
      return;
    }

    void loadResponsablesResumen();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [responsablesModalOpen]);

  const SHAREPOINT_PREFIX = "https://cjtelecom.sharepoint.com/sites/CJ-PROYECTOS/APLICATIVOS%20EXTERNOS/ASISTENCIA/";
  const handleOpenImage = (title: string, url: string) => {
    if (!url.trim()) return;
    // Si la url ya es absoluta (empieza con http), no anteponer el prefijo
    const finalUrl = url.startsWith("http") ? url : SHAREPOINT_PREFIX + url;
    setMediaViewer({ type: "image", title, url: finalUrl });
  };

  const startItem = filteredRows.length === 0 ? 0 : (Math.min(currentPage, totalPages) - 1) * pageSize + 1;
  const endItem = Math.min(Math.min(currentPage, totalPages) * pageSize, filteredRows.length);

  return (
    <section style={styles.page}>
      
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ minWidth: 420, flex: 1, maxWidth: 700 }}>
            <CrudToolbar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Buscar responsable, empleado, estado, comentario u observacion..."
              searchFieldsHint="Responsable, empleado, estado, fecha, comentario, observacion y columnas cargadas"
              buttons={[]}
              style={{ fontSize: 16, padding: "16px 18px", minHeight: 54 }}
            />
          </div>
          <button
            type="button"
            style={styles.primaryButton}
            onClick={openCreatePanel}
          >
            Nuevo
          </button>
          <button
            type="button"
            style={canReturnToAsistencia ? styles.secondaryButton : styles.disabledSecondaryButton}
            onClick={() => {
              if (!canReturnToAsistencia) {
                return;
              }
              navigate("/reportes/rptasistencia", {
                state: navigationState?.returnState ?? { returnFromAprobarCampo: true },
              });
            }}
            disabled={!canReturnToAsistencia}
            title={
              canReturnToAsistencia
                ? "Regresar a Asistencia"
                : "Disponible solo cuando se abre desde Asistencia"
            }
          >
            Regresar a Asistencia
          </button>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={async () => {
              setSearch("");
              setFilters(initialFilters);
              setFiltrosColumnas({});
              setShowInitialNavigationBanner(false);
              setCanReturnToAsistencia(false);
              await loadRows(initialFilters);
            }}
          >
            Limpiar filtros
          </button>
         
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={() => {
              setResponsablesModalOpen(true);
              setResponsablesResumenRows([]);
            }}
          >
            Resumen responsables
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none', fontSize: 15 }}>
            <input
              type="checkbox"
              checked={incluirDiaActual}
              onChange={(e) => setIncluirDiaActual(e.target.checked)}
            />
            Incluido día actual
          </label>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <StatCard label="Total" value={String(stats.total)} />
          <StatCard label="Filtrados" value={String(stats.visibles)} />
        </div>
      </div>
      <div style={{ ...styles.card, paddingTop: 10 }}>

        {error ? <div style={styles.errorBanner}>{error}</div> : null}
        {showInitialNavigationBanner ? (
          <div style={styles.prefillBanner}>
            Mostrando data inicial recibida desde {navigationState?.sourceLabel || "la pantalla anterior"}.
          </div>
        ) : null}

        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, minWidth: actionColumnWidth }}>Acciones</th>
                {visibleColumns.map((column) => (
                  <th key={column.key} style={{ ...styles.th, minWidth: column.width }}>
                    <div style={styles.thContent}>
                      <span>{column.label}</span>
                      {sortableColumns.includes(column.key) && (
                        <button
                          type="button"
                          style={{ ...styles.filterButton, marginLeft: 4, padding: '4px 6px' }}
                          title={sort?.key === column.key ? (sort.direction === 'asc' ? 'Orden ascendente' : 'Orden descendente') : 'Ordenar'}
                          onClick={() => {
                            setSort((prev) => {
                              if (!prev || prev.key !== column.key) return { key: column.key, direction: 'asc' };
                              if (prev.direction === 'asc') return { key: column.key, direction: 'desc' };
                              return null; // Quitar orden
                            });
                          }}
                        >
                          {sort?.key === column.key ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
                        </button>
                      )}
                      <button
                        type="button"
                        style={styles.filterButton}
                        onClick={() => {
                          setOpenColumnFilterKey((prev) => (prev === column.key ? null : column.key));
                          setColumnFilterSearch("");
                        }}
                      >
                        Filtrar
                      </button>
                    </div>
                    {openColumnFilterKey === column.key ? (
                      <ColumnFilterDropdown
                        header={{ key: column.key, label: column.label }}
                        filtroColumnaMenuRef={filtroColumnaMenuRef}
                        filtrosColumnas={filtrosColumnas}
                        setFiltrosColumnas={setFiltrosColumnas}
                        opcionesFiltroPorColumna={opcionesFiltroPorColumna}
                        filtroBusqueda={columnFilterSearch}
                        setFiltroBusqueda={setColumnFilterSearch}
                      />
                    ) : null}
                  </th>
                ))}
                <th style={{ ...styles.th, minWidth: "110px" }}>Mapa ingreso</th>
                <th style={{ ...styles.th, minWidth: "110px" }}>Mapa salida</th>
                <th style={{ ...styles.th, minWidth: "110px" }}>Imagen</th>
                <th style={{ ...styles.th, minWidth: "130px" }}>Imagen salida</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={visibleColumns.length + 5} style={styles.emptyCell}>
                    Cargando aprobaciones de campo...
                  </td>
                </tr>
              ) : pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length + 5} style={styles.emptyCell}>
                    No hay registros para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                pagedRows.map((row) => (
                  <tr key={buildRowKey(row)}>
                    <td style={styles.td}>
                      <div style={styles.rowActions}>
                        {/* Botón Editar eliminado por requerimiento */}
                        <button
                          type="button"
                          style={{
                            ...styles.successTinyButton,
                            // Deshabilitar si el botón de mapa ingreso está inactivo
                            ...(getValorIngreso(row) && hasCoordinates(getIngresoCoordinates(row).lat, getIngresoCoordinates(row).lng) ? {} : disabledButtonStyle),
                          }}
                          onClick={() => handleOpenAction("aprobar-ingreso", row)}
                          disabled={!(getValorIngreso(row) && hasCoordinates(getIngresoCoordinates(row).lat, getIngresoCoordinates(row).lng))}
                          title="Aprobar ingreso"
                        >
                          <span role="img" aria-label="Aprobar ingreso">✅</span>
                        </button>
                        <button
                          type="button"
                          style={{
                            ...styles.successTinyButton,
                            // Deshabilitar si el botón de mapa salida está inactivo
                            ...(getValorSalida(row) && hasCoordinates(getSalidaCoordinates(row).lat, getSalidaCoordinates(row).lng) ? {} : disabledButtonStyle),
                          }}
                          onClick={() => handleOpenAction("aprobar-salida", row)}
                          disabled={!(getValorSalida(row) && hasCoordinates(getSalidaCoordinates(row).lat, getSalidaCoordinates(row).lng))}
                          title="Aprobar salida"
                        >
                          <span role="img" aria-label="Aprobar salida">🕒</span>
                        </button>
                        <button
                          type="button"
                          style={styles.dangerTinyButton}
                          onClick={() => handleOpenAction("rechazar", row)}
                          title="Rechazar"
                        >
                          <span role="img" aria-label="Rechazar">❌</span>
                        </button>
                      </div>
                    </td>
                    {visibleColumns.map((column) => {
                      const value = row[column.key];
                      const displayValue =
                        column.key === "fechaasistencia"
                          ? formatDate(toText(value))
                          : column.key === "hora" || column.key === "horasalida"
                          ? formatTime(toText(value))
                          : toText(value);

                      return (
                        <td key={column.key} style={styles.td}>
                          <span title={toText(value)}>{displayValue || "-"}</span>
                        </td>
                      );
                    })}
                    <td style={styles.td}>
                      <button
                        type="button"
                        style={{
                          ...styles.linkButton,
                          ...((getValorIngreso(row) && hasCoordinates(getIngresoCoordinates(row).lat, getIngresoCoordinates(row).lng)) ? {} : disabledButtonStyle),
                        }}
                        disabled={!getValorIngreso(row) || !hasCoordinates(getIngresoCoordinates(row).lat, getIngresoCoordinates(row).lng)}
                        onClick={() => handleOpenMap("Ubicación de ingreso", toText(row.latitud), toText(row.longitud))}
                      >
                        Ver mapa
                      </button>
                    </td>
                    <td style={styles.td}>
                      <button
                        type="button"
                        style={{
                          ...styles.linkButton,
                          ...((getValorSalida(row) && hasCoordinates(getSalidaCoordinates(row).lat, getSalidaCoordinates(row).lng)) ? {} : disabledButtonStyle),
                        }}
                        disabled={!getValorSalida(row) || !hasCoordinates(getSalidaCoordinates(row).lat, getSalidaCoordinates(row).lng)}
                        onClick={() =>
                          handleOpenMap("Ubicación de salida", toText(row.latitudsalida || row.latitudSalida), toText(row.longitudsalida || row.longitudSalida))
                        }
                      >
                        Ver mapa
                      </button>
                    </td>
                    <td style={styles.td}>
                      <button
                        type="button"
                        style={{
                          ...styles.linkButton,
                          ...((getValorIngreso(row) && getIngresoImage(row)) ? {} : disabledButtonStyle),
                        }}
                        disabled={!getValorIngreso(row) || !getIngresoImage(row)}
                        onClick={() => handleOpenImage("Imagen de ingreso", getIngresoImage(row))}
                      >
                        Ver imagen
                      </button>
                    </td>
                    <td style={styles.td}>
                      <button
                        type="button"
                        style={{
                          ...styles.linkButton,
                          ...((getValorSalida(row) && getSalidaImage(row)) ? {} : disabledButtonStyle),
                        }}
                        disabled={!getValorSalida(row) || !getSalidaImage(row)}
                        onClick={() => handleOpenImage("Imagen de salida", getSalidaImage(row))}
                      >
                        Ver imagen
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={styles.paginationBar}>
          <div style={styles.paginationSummary}>
            Mostrando {startItem}-{endItem} de {filteredRows.length} registros
          </div>
          <div style={styles.paginationControls}>
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setCurrentPage(1);
              }}
              style={styles.select}
            >
              {[10, 20, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size} por página
                </option>
              ))}
            </select>
            <button
              type="button"
              style={styles.secondaryButton}
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            >
              Anterior
            </button>
            <span style={styles.pageNumber}>
              Página {Math.min(currentPage, totalPages)} de {totalPages}
            </span>
            <button
              type="button"
              style={styles.secondaryButton}
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      <SidePanelForm
        open={panelOpen}
        title={panelMode === "create" ? "Nuevo registro" : "Editar registro"}
        subtitle={
          panelMode === "create"
            ? "Registra una nueva marcación o corrección manual."
            : "Gestiona la marcación y revisa su historial de modificaciones."
        }
        onClose={() => setPanelOpen(false)}
        footer={
          <>
            <button type="button" style={styles.secondaryButton} onClick={() => setPanelOpen(false)}>
              Cerrar
            </button>
            <button type="button" style={styles.primaryButton} onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </>
        }
      >
        {error ? <div style={styles.errorBanner}>{error}</div> : null}

        <div style={styles.formGrid}>
          <Field label="IdEmpleado" error={draftErrors.idEmpleado}>
            <input
              value={draft.idEmpleado}
              onChange={(event) => setDraft((prev) => ({ ...prev, idEmpleado: event.target.value }))}
              style={styles.input}
            />
          </Field>
          <Field label="FechaAsistencia" error={draftErrors.fechaAsistencia}>
            <input
              type="date"
              value={draft.fechaAsistencia}
              onChange={(event) => setDraft((prev) => ({ ...prev, fechaAsistencia: event.target.value }))}
              style={styles.input}
            />
          </Field>
          <Field label="Responsable">
            <input
              value={draft.responsable}
              onChange={(event) => setDraft((prev) => ({ ...prev, responsable: event.target.value }))}
              style={styles.input}
            />
          </Field>
          <Field label="Empleado">
            <input
              value={draft.empleado}
              onChange={(event) => setDraft((prev) => ({ ...prev, empleado: event.target.value }))}
              style={styles.input}
            />
          </Field>
          <Field label="Estado">
            <input
              value={draft.estado}
              onChange={(event) => setDraft((prev) => ({ ...prev, estado: event.target.value }))}
              style={styles.input}
            />
          </Field>
          <Field label="Ingreso">
            <input
              type="datetime-local"
              value={draft.ingreso}
              onChange={(event) => setDraft((prev) => ({ ...prev, ingreso: event.target.value }))}
              style={styles.input}
            />
          </Field>
          <Field label="Salida">
            <input
              type="datetime-local"
              value={draft.salida}
              onChange={(event) => setDraft((prev) => ({ ...prev, salida: event.target.value }))}
              style={styles.input}
            />
          </Field>
          <Field label="Latitud ingreso">
            <input
              value={draft.latitud}
              onChange={(event) => setDraft((prev) => ({ ...prev, latitud: event.target.value }))}
              style={styles.input}
            />
          </Field>
          <Field label="Longitud ingreso">
            <input
              value={draft.longitud}
              onChange={(event) => setDraft((prev) => ({ ...prev, longitud: event.target.value }))}
              style={styles.input}
            />
          </Field>
          <Field label="Latitud salida">
            <input
              value={draft.latitudSalida}
              onChange={(event) => setDraft((prev) => ({ ...prev, latitudSalida: event.target.value }))}
              style={styles.input}
            />
          </Field>
          <Field label="Longitud salida">
            <input
              value={draft.longitudSalida}
              onChange={(event) => setDraft((prev) => ({ ...prev, longitudSalida: event.target.value }))}
              style={styles.input}
            />
          </Field>
          <Field label="Ruta imagen ingreso">
            <input
              value={draft.imagen}
              onChange={(event) => setDraft((prev) => ({ ...prev, imagen: event.target.value }))}
              style={styles.input}
            />
          </Field>
          <Field label="Ruta imagen salida">
            <input
              value={draft.imagenSalida}
              onChange={(event) => setDraft((prev) => ({ ...prev, imagenSalida: event.target.value }))}
              style={styles.input}
            />
          </Field>
        </div>

        <Field label="Observacion">
          <textarea
            value={draft.observacion}
            onChange={(event) => setDraft((prev) => ({ ...prev, observacion: event.target.value }))}
            style={{ ...styles.input, minHeight: 100, resize: "vertical" }}
          />
        </Field>

        {panelMode === "edit" ? (
          <div style={styles.historyCard}>
            <div style={styles.historyHeader}>
              <div>
                <h3 style={styles.historyTitle}>Modificaciones</h3>
                <p style={styles.historyText}>
                  Historial reciente registrado en auditoría para este registro.
                </p>
              </div>
              <a
                href="/mantenimiento/modificaciones"
                style={styles.historyLink}
                target="_blank"
                rel="noreferrer"
              >
                Abrir monitor
              </a>
            </div>

            {historyLoading ? (
              <div style={styles.historyEmpty}>Cargando historial...</div>
            ) : historyRows.length === 0 ? (
              <div style={styles.historyEmpty}>No hay modificaciones registradas aún.</div>
            ) : (
              <div style={styles.historyList}>
                {historyRows.map((item) => (
                  <div key={item.idAuditoria} style={styles.historyItem}>
                    <div style={styles.historyItemTop}>
                      <span style={styles.historyPill}>{item.accion}</span>
                      <span style={styles.historyDate}>{formatDateTime(item.fechaAccion)}</span>
                    </div>
                    <div style={styles.historyField}>{item.campo}</div>
                    <div style={styles.historyValues}>
                      <span>Antes: {item.valorAnterior || "-"}</span>
                      <span>Ahora: {item.valorNuevo || "-"}</span>
                    </div>
                    <div style={styles.historyUser}>
                      {item.usuarioAccion}
                      {item.observacion ? ` | ${item.observacion}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <div style={styles.hiddenColumnsCard}>
          <h3 style={styles.historyTitle}>Columnas cargadas</h3>
          <p style={styles.historyText}>
            El store expone {availableColumns.length} columnas. En el grid se muestran las principales y el resto queda disponible para búsqueda, detalle y auditoría.
          </p>
          <div style={styles.columnsBadgeWrap}>
            {availableColumns.map((column) => (
              <span key={column} style={styles.columnBadge}>
                {formatHeader(column)}
              </span>
            ))}
          </div>
        </div>
      </SidePanelForm>

      {actionModal ? (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <h3 style={styles.modalTitle}>
              {actionModal.type === "aprobar-ingreso"
                ? "Aprobar ingreso"
                : actionModal.type === "aprobar-salida"
                ? "Aprobar salida"
                : "Rechazar registro"}
            </h3>
            <p style={styles.modalText}>Ingresa la observación obligatoria para registrar la acción.</p>
            <textarea
              value={actionComment}
              onChange={(event) => setActionComment(event.target.value)}
              style={{ ...styles.input, minHeight: 110, resize: "vertical" }}
            />
            {actionError ? <div style={styles.errorBanner}>{actionError}</div> : null}
            <div style={styles.modalActions}>
              <button type="button" style={styles.secondaryButton} onClick={() => setActionModal(null)}>
                Cancelar
              </button>
              <button type="button" style={styles.primaryButton} onClick={() => void handleConfirmAction()} disabled={saving}>
                {saving ? "Procesando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {mediaViewer ? (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalCard, maxWidth: 860 }}>
            <div style={styles.historyHeader}>
              <h3 style={styles.modalTitle}>{mediaViewer.title}</h3>
              <button type="button" style={styles.secondaryButton} onClick={() => setMediaViewer(null)}>
                Cerrar
              </button>
            </div>

            {mediaViewer.type === "map" ? (
              <iframe
                title={mediaViewer.title}
                src={`https://maps.google.com/maps?q=${encodeURIComponent(
                  `${mediaViewer.lat},${mediaViewer.lng}`
                )}&z=16&output=embed`}
                style={styles.mapFrame}
              />
            ) : (
              <div style={styles.imageViewer}>
                <img src={mediaViewer.url} alt={mediaViewer.title} style={styles.imagePreview} />
                <a href={mediaViewer.url} target="_blank" rel="noreferrer" style={styles.historyLink}>
                  Abrir recurso
                </a>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {responsablesModalOpen ? (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalCard, ...styles.resumenModalCard, maxWidth: 640 }}>
            <div style={styles.historyHeader}>
              <div>
                <h3 style={styles.modalTitle}>Faltantes por aprobar</h3>
                <p style={styles.modalText}>
                  Responsables ordenados de mayor a menor según la cantidad de registros pendientes.
                </p>
                {/* Botón Enviar reporte SIEMPRE visible debajo del título */}
                <button
                  type="button"
                  style={styles.primaryButton}
                  disabled={!faltaAprobarSelected}
                  onClick={() => {
                    // Acción de envío de reporte aquí
                    alert('Reporte enviado');
                  }}
                >
                  Enviar reporte
                </button>
              </div>
              <div style={styles.modalHeaderActions}>
                {faltaAprobarSelected ? (
                  <button
                    type="button"
                    style={styles.iconOnlyButton}
                    title="Ir a Aprobar Campo"
                    aria-label="Ir a Aprobar Campo"
                    onClick={() => {
                      setResponsablesModalOpen(false);
                      navigate("/operaciones/operacion/aprobarcampo");
                    }}
                  >
                    <ClipboardList size={18} />
                    <ArrowUpRight size={14} />
                  </button>
                ) : null}
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => setResponsablesModalOpen(false)}
                >
                  Cerrar
                </button>
              </div>
            // ---
            // ¿Cómo agregar más estados para habilitar el botón?
            // Cambia la condición de 'faltaAprobarSelected' por:
            // const estadosReporte = ["FALTA APROBAR", "OTRO_ESTADO", ...];
            // const puedeEnviarReporte = estadosReporte.includes(filters.estado.trim().toUpperCase());
            // Y usa 'puedeEnviarReporte' en lugar de 'faltaAprobarSelected' en el botón.
            </div>

            {responsablesResumenLoading ? (
              <div style={styles.historyEmpty}>Cargando resumen de responsables...</div>
            ) : responsablesResumen.length === 0 ? (
              <div style={styles.historyEmpty}>No hay responsables disponibles en la consulta actual.</div>
            ) : (
              <div style={styles.resumenList}>
                <div style={styles.resumenHeader}>
                  <span>Responsable</span>
                  <span>Cantidad de faltantes por aprobar</span>
                </div>
                {responsablesResumen.map((item) => (
                  <button
                    key={`${item.responsable}-${item.cantidad}`}
                    type="button"
                    style={styles.resumenRowButton}
                    onClick={() => void handleSelectResponsableResumen(item.responsable)}
                  >
                    <span style={styles.resumenResponsable}>{item.responsable}</span>
                    <span style={styles.resumenCantidad}>{item.cantidad}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      {children}
      {error ? <span style={styles.errorText}>{error}</span> : null}
    </label>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.statCard}>
      <span style={styles.statLabel}>{label}</span>
      <strong style={styles.statValue}>{value}</strong>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
    padding: 24,
    background: "linear-gradient(180deg, #F8FBFF 0%, #EEF4FF 100%)",
  },
  heroCard: {
    display: "flex",
    justifyContent: "space-between",
    gap: 18,
    padding: 24,
    borderRadius: 20,
    background: "linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%)",
    color: "#FFFFFF",
    boxShadow: "0 20px 45px rgba(15, 23, 42, 0.18)",
  },
  heroTitle: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
  },
  heroText: {
    margin: "10px 0 0",
    maxWidth: 760,
    lineHeight: 1.5,
    color: "rgba(255,255,255,0.88)",
  },
  heroBadge: {
    alignSelf: "flex-start",
    padding: "10px 14px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.14)",
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
  },
  statCard: {
    padding: 18,
    borderRadius: 18,
    background: "#FFFFFF",
    boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
    border: "1px solid #E2E8F0",
  },
  statLabel: {
    display: "block",
    fontSize: 13,
    color: "#64748B",
    marginBottom: 6,
  },
  statValue: {
    fontSize: 28,
    color: "#0F172A",
  },
  card: {
    background: "#FFFFFF",
    borderRadius: 20,
    border: "1px solid #E2E8F0",
    boxShadow: "0 12px 32px rgba(15,23,42,0.07)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    minHeight: 0,
    maxHeight: "calc(100vh - 210px)",
    overflow: "hidden",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },
  cardTitle: {
    margin: 0,
    fontSize: 20,
    color: "#0F172A",
  },
  cardText: {
    margin: "6px 0 0",
    color: "#64748B",
    fontSize: 14,
  },
  actionsRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  stateButton: {
    border: "1px solid #CBD5E1",
    borderRadius: 12,
    background: "#F8FAFC",
    color: "#334155",
    fontWeight: 800,
    padding: "10px 16px",
    cursor: "pointer",
  },
  stateButtonActive: {
    border: "1px solid #1D4ED8",
    borderRadius: 12,
    background: "#DBEAFE",
    color: "#1D4ED8",
    fontWeight: 800,
    padding: "10px 16px",
    cursor: "pointer",
    boxShadow: "inset 0 0 0 1px rgba(29,78,216,0.18)",
  },
  primaryButton: {
    border: "none",
    borderRadius: 12,
    background: "#1D4ED8",
    color: "#FFFFFF",
    fontWeight: 700,
    padding: "10px 16px",
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #CBD5E1",
    borderRadius: 12,
    background: "#FFFFFF",
    color: "#334155",
    fontWeight: 700,
    padding: "10px 16px",
    cursor: "pointer",
  },
  disabledSecondaryButton: {
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    background: "#F8FAFC",
    color: "#94A3B8",
    fontWeight: 700,
    padding: "10px 16px",
    cursor: "not-allowed",
    opacity: 0.85,
  },
  successTinyButton: {
    border: "1px solid #BBF7D0",
    borderRadius: 10,
    background: "#F0FDF4",
    color: "#166534",
    fontWeight: 700,
    padding: "8px 10px",
    cursor: "pointer",
    fontSize: 12,
  },
  secondaryTinyButton: {
    border: "1px solid #BFDBFE",
    borderRadius: 10,
    background: "#EFF6FF",
    color: "#1D4ED8",
    fontWeight: 700,
    padding: "8px 10px",
    cursor: "pointer",
    fontSize: 12,
  },
  dangerTinyButton: {
    border: "1px solid #FECACA",
    borderRadius: 10,
    background: "#FEF2F2",
    color: "#B91C1C",
    fontWeight: 700,
    padding: "8px 10px",
    cursor: "pointer",
    fontSize: 12,
  },
  filtersGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 700,
    color: "#334155",
  },
  input: {
    width: "100%",
    border: "1px solid #CBD5E1",
    borderRadius: 12,
    padding: "10px 12px",
    background: "#FFFFFF",
    fontSize: 14,
    color: "#0F172A",
    outline: "none",
    boxSizing: "border-box",
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 12,
  },
  errorBanner: {
    borderRadius: 12,
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    color: "#B91C1C",
    padding: "12px 14px",
    fontSize: 14,
  },
  prefillBanner: {
    borderRadius: 12,
    background: "#EFF6FF",
    border: "1px solid #BFDBFE",
    color: "#1D4ED8",
    padding: "12px 14px",
    fontSize: 14,
    fontWeight: 600,
  },
  tableWrapper: {
    width: "100%",
    flex: 1,
    minHeight: 0,
    overflowX: "auto",
    overflowY: "auto",
    borderRadius: 16,
    border: "1px solid #E2E8F0",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    background: "#FFFFFF",
  },
  th: {
    position: "sticky",
    top: 0,
    zIndex: 2,
    padding: "14px 12px",
    background: "#F8FAFC",
    borderBottom: "1px solid #E2E8F0",
    textAlign: "left",
    color: "#334155",
    fontSize: 13,
    fontWeight: 800,
    verticalAlign: "top",
  },
  thContent: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  td: {
    padding: "14px 12px",
    borderBottom: "1px solid #F1F5F9",
    fontSize: 12,
    color: "#334155",
    verticalAlign: "top",
  },
  emptyCell: {
    padding: 28,
    textAlign: "center",
    color: "#64748B",
  },
  filterButton: {
    border: "1px solid #CBD5E1",
    borderRadius: 999,
    background: "#FFFFFF",
    color: "#475569",
    fontSize: 11,
    fontWeight: 700,
    padding: "5px 8px",
    cursor: "pointer",
  },
  columnFilter: {
    position: "absolute",
    top: "calc(100% - 6px)",
    right: 8,
    width: 240,
    background: "#FFFFFF",
    border: "1px solid #CBD5E1",
    borderRadius: 14,
    boxShadow: "0 16px 35px rgba(15,23,42,0.16)",
    padding: 12,
    zIndex: 20,
  },
  columnFilterHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  columnFilterTitle: {
    fontSize: 12,
    color: "#0F172A",
  },
  clearInlineButton: {
    border: "none",
    background: "transparent",
    color: "#1D4ED8",
    fontSize: 12,
    cursor: "pointer",
    fontWeight: 700,
  },
  columnFilterInput: {
    width: "100%",
    border: "1px solid #CBD5E1",
    borderRadius: 10,
    padding: "8px 10px",
    marginBottom: 8,
    boxSizing: "border-box",
  },
  columnFilterItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "#334155",
    padding: "4px 0",
  },
  rowActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
  },
  linkButton: {
    border: "none",
    background: "transparent",
    color: "#1D4ED8",
    cursor: "pointer",
    padding: 0,
    fontWeight: 700,
    textDecoration: "underline",
  },
  paginationBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
    flexShrink: 0,
  },
  paginationSummary: {
    color: "#64748B",
    fontSize: 13,
  },
  paginationControls: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  pageNumber: {
    color: "#334155",
    fontWeight: 700,
    fontSize: 13,
  },
  select: {
    border: "1px solid #CBD5E1",
    borderRadius: 12,
    padding: "10px 12px",
    background: "#FFFFFF",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
  },
  historyCard: {
    border: "1px solid #E2E8F0",
    borderRadius: 16,
    padding: 16,
    background: "#F8FAFC",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  historyHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  historyTitle: {
    margin: 0,
    fontSize: 17,
    color: "#0F172A",
  },
  historyText: {
    margin: "4px 0 0",
    fontSize: 13,
    color: "#64748B",
  },
  historyLink: {
    color: "#1D4ED8",
    fontWeight: 700,
    textDecoration: "none",
  },
  historyEmpty: {
    borderRadius: 12,
    background: "#FFFFFF",
    border: "1px dashed #CBD5E1",
    color: "#64748B",
    padding: 14,
    fontSize: 13,
  },
  historyList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  historyItem: {
    borderRadius: 14,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  historyItemTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },
  historyPill: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 8px",
    borderRadius: 999,
    background: "#DBEAFE",
    color: "#1D4ED8",
    fontWeight: 700,
    fontSize: 11,
  },
  historyDate: {
    color: "#64748B",
    fontSize: 12,
  },
  historyField: {
    color: "#0F172A",
    fontWeight: 700,
    fontSize: 13,
  },
  historyValues: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    color: "#334155",
    fontSize: 13,
  },
  historyUser: {
    color: "#64748B",
    fontSize: 12,
  },
  hiddenColumnsCard: {
    border: "1px solid #E2E8F0",
    borderRadius: 16,
    padding: 16,
    background: "#FFFFFF",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  columnsBadgeWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  columnBadge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    background: "#EFF6FF",
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: 700,
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.52)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 1100,
  },
  modalCard: {
    width: "100%",
    maxWidth: 560,
    background: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    boxShadow: "0 20px 45px rgba(15,23,42,0.22)",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  modalTitle: {
    margin: 0,
    color: "#0F172A",
    fontSize: 22,
  },
  modalText: {
    margin: 0,
    color: "#64748B",
    fontSize: 14,
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  },
  modalHeaderActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  iconOnlyButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    border: "1px solid #BFDBFE",
    background: "#EFF6FF",
    color: "#1D4ED8",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    cursor: "pointer",
  },
  mapFrame: {
    width: "100%",
    minHeight: 420,
    border: "1px solid #CBD5E1",
    borderRadius: 16,
  },
  imageViewer: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  resumenList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    overflowY: "auto",
    maxHeight: "calc(85vh - 140px)",
    paddingRight: 4,
  },
  resumenModalCard: {
    maxHeight: "85vh",
    overflow: "hidden",
  },
  resumenHeader: {
    display: "grid",
    gridTemplateColumns: "1fr 220px",
    gap: 12,
    padding: "0 12px",
    color: "#64748B",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  resumenRowButton: {
    display: "grid",
    gridTemplateColumns: "1fr 220px",
    gap: 12,
    alignItems: "center",
    width: "100%",
    textAlign: "left",
    border: "1px solid #DBEAFE",
    borderRadius: 14,
    background: "#F8FBFF",
    color: "#0F172A",
    padding: "14px 12px",
    cursor: "pointer",
  },
  resumenResponsable: {
    fontWeight: 700,
  },
  resumenCantidad: {
    justifySelf: "end",
    minWidth: 48,
    textAlign: "center",
    padding: "6px 10px",
    borderRadius: 999,
    background: "#DBEAFE",
    color: "#1D4ED8",
    fontWeight: 800,
  },
  imagePreview: {
    width: "100%",
    maxHeight: 520,
    objectFit: "contain",
    borderRadius: 16,
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
  },
};
