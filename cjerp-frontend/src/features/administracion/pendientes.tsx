import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CrudToolbar, {
  matchesCrudToolbarSearch,
  type CrudToolbarSearchField,
} from "../../components/base/CrudToolbar";
import {
  actualizarEmpleadoPendiente,
  buscarEmpleadoPendiente,
  insertarEmpleadoPendiente,
  subirAdjuntoEmpleadoPendiente,
} from "../../api/empleadoPendienteService";
import { listarSolicitanteOptions } from "../../api/solicitanteService";
import { getAuthUser } from "../../utils/authStorage";
import { getHttpErrorMessage } from "../../utils/httpError";
import { buildSharePointUrl } from "../../utils/sharepoint";
import type { ConstanteOption } from "../../models/constante";
import type {
  EmpleadoPendienteBuscarRequest,
  EmpleadoPendienteDto,
  EmpleadoPendienteInsertRequest,
  EmpleadoPendienteUpdateRequest,
} from "../../models/empleadoPendiente";

type ColumnFilterDropdownProps = {
  header: { key: string; label: string };
  filtroColumnaMenuRef: React.RefObject<HTMLDivElement | null>;
  filtrosColumnas: Record<string, string[]>;
  setFiltrosColumnas: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  opcionesFiltroPorColumna: Record<string, string[]>;
  filtroBusqueda: string;
  setFiltroBusqueda: (value: string) => void;
};

type HeaderFilterState = {
  idPendiente: string;
  idEmpleado: string;
  idResponsable: string;
  idEstado: string;
  fechaInicio: string;
  fechaFin: string;
};

type PendienteDraft = {
  idPendiente: number | null;
  idEmpleado: string;
  fechaInicio: string;
  fechaEstimacionTermino: string;
  fechaRealTermino: string;
  idEstado: string;
  comentario: string;
  observacion: string;
  idResponsable: string;
  ruta: string;
};

const columns = [
  { key: "acciones", label: "Acciones", width: "50px" },
  { key: "idPendiente", label: "Id", width: "30px" },
  { key: "nombreEmpleado", label: "Empleado", width: "100px" },
  { key: "fechaInicio", label: "Fecha inicio", width: "60px" },
  { key: "fechaEstimacionTermino", label: "F.est. término", width: "60px" },
  { key: "estado", label: "Estado", width: "40px" },
  { key: "responsable", label: "Responsable", width: "100px" },
  { key: "comentario", label: "Comentario", width: "260px" },
  { key: "ruta", label: "Ruta", width: "200px" },
] as const;

const today = new Date().toISOString().slice(0, 10);

const createInitialFilters = (): HeaderFilterState => ({
  idPendiente: "",
  idEmpleado: "",
  idResponsable: "",
  idEstado: "",
  fechaInicio: "",
  fechaFin: "",
});

const createEmptyDraft = (): PendienteDraft => ({
  idPendiente: null,
  idEmpleado: "",
  fechaInicio: today,
  fechaEstimacionTermino: today,
  fechaRealTermino: today,
  idEstado: "1",
  comentario: "",
  observacion: "",
  idResponsable: "",
  ruta: "",
});

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong style={{ fontSize: 11, color: "#17143A" }}>{header.label}</strong>
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
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
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

function toNumber(value: string | number | null | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("es-PE");
}

function normalizeColumnValue(value: unknown) {
  return String(value ?? "").trim();
}

function matchesColumnFilterValue(value: unknown, selectedValues: string[]) {
  if (!selectedValues.length) return true;
  return selectedValues.includes(normalizeColumnValue(value));
}

function normalizeOptionValue(option: ConstanteOption): string {
  return option.codigo || option.value || option.label;
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

  if (!normalizedQuery) {
    return true;
  }

  const compactLabel = normalizedLabel.replace(/\s+/g, "");
  const compactQuery = normalizedQuery.replace(/\s+/g, "");

  if (compactLabel.includes(compactQuery)) {
    return true;
  }

  return normalizedLabel.includes(normalizedQuery);
}

function buildDraftFromRow(item: EmpleadoPendienteDto): PendienteDraft {
  return {
    idPendiente: item.idPendiente,
    idEmpleado: String(item.idEmpleado),
    fechaInicio: item.fechaInicio ? String(item.fechaInicio).slice(0, 10) : "",
    fechaEstimacionTermino: item.fechaEstimacionTermino ? String(item.fechaEstimacionTermino).slice(0, 10) : "",
    fechaRealTermino: item.fechaRealTermino ? String(item.fechaRealTermino).slice(0, 10) : "",
    idEstado: item.idEstado ? String(item.idEstado) : "",
    comentario: item.comentario || "",
    observacion: item.observacion || "",
    idResponsable: item.idResponsable ? String(item.idResponsable) : "",
    ruta: item.ruta || "",
  };
}

function getRutaVisualizacion(ruta?: string | null) {
  return buildSharePointUrl(ruta);
}

export default function PendientesPage() {
  const authUser = getAuthUser();
  const userId = toNumber(authUser?.idEmpleado ?? authUser?.codEmp);
  const userEmployeeCode = String(authUser?.idEmpleado ?? authUser?.codEmp ?? "").trim();
  const userCargoId = toNumber(authUser?.idCargo ?? authUser?.idrol);
  const userName =
    authUser?.usuario ??
    authUser?.username ??
    authUser?.userName ??
    authUser?.nombreEmpleado ??
    authUser?.nombre ??
    "sistema";

  const [rows, setRows] = useState<EmpleadoPendienteDto[]>([]);
  const [empleadoOptions, setEmpleadoOptions] = useState<ConstanteOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filters, setFilters] = useState<HeaderFilterState>(createInitialFilters);
  const [draft, setDraft] = useState<PendienteDraft>(createEmptyDraft);
  const [busqueda, setBusqueda] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [filtrosColumnas, setFiltrosColumnas] = useState<Record<string, string[]>>({});
  const [columnaFiltroAbierta, setColumnaFiltroAbierta] = useState<string | null>(null);
  const [filtroBusqueda, setFiltroBusqueda] = useState("");
  const filtroColumnaMenuRef = useRef<HTMLDivElement>(null);
  const archivoRutaInputRef = useRef<HTMLInputElement | null>(null);
  const [rutaUploadLoading, setRutaUploadLoading] = useState(false);
  const [rutaUploadError, setRutaUploadError] = useState<string | null>(null);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const empleadosFiltrados = await listarSolicitanteOptions({
          idCargo: userCargoId > 0 ? userCargoId : null,
          idEmpleado: userId > 0 ? userId : null,
        });
        const empleados =
          empleadosFiltrados.length > 0
            ? empleadosFiltrados
            : await listarSolicitanteOptions({
                idCargo: null,
                idEmpleado: null,
              });

        setEmpleadoOptions(empleados);
      } catch (err) {
        setError(getHttpErrorMessage(err, "No se pudieron cargar los catálogos del formulario."));
      }
    };

    void loadOptions();
  }, [userCargoId, userId]);

  useEffect(() => {
    if (!columnaFiltroAbierta) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (filtroColumnaMenuRef.current && !filtroColumnaMenuRef.current.contains(event.target as Node)) {
        setColumnaFiltroAbierta(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [columnaFiltroAbierta]);

  const searchFields = useMemo<CrudToolbarSearchField<EmpleadoPendienteDto>[]>(
    () => [
      { key: "idPendiente", label: "Id", getValue: (item) => item.idPendiente },
      { key: "nombreEmpleado", label: "Empleado", getValue: (item) => item.nombreEmpleado },
      { key: "estado", label: "Estado", getValue: (item) => item.estado },
      { key: "responsable", label: "Responsable", getValue: (item) => item.responsable },
      { key: "comentario", label: "Comentario", getValue: (item) => item.comentario },
      { key: "ruta", label: "Ruta", getValue: (item) => item.ruta },
    ],
    []
  );

  const getColumnValue = (item: EmpleadoPendienteDto, key: string) => {
    switch (key) {
      case "fechaInicio":
        return formatDate(item.fechaInicio);
      case "fechaEstimacionTermino":
        return formatDate(item.fechaEstimacionTermino);
      case "fechaRealTermino":
        return formatDate(item.fechaRealTermino);
      case "fechaCreacion":
        return formatDate(item.fechaCreacion);
      default:
        return String((item as Record<string, unknown>)[key] ?? "");
    }
  };

  const filteredRows = useMemo(
    () =>
      rows
        .filter((item) => matchesCrudToolbarSearch(item, busqueda, searchFields))
        .filter((item) =>
          columns
            .filter((column) => column.key !== "acciones")
            .every((column) =>
              matchesColumnFilterValue(getColumnValue(item, column.key), filtrosColumnas[column.key] ?? [])
            )
        ),
    [busqueda, filtrosColumnas, rows, searchFields]
  );

  const opcionesFiltroPorColumna = useMemo(() => {
    const result: Record<string, string[]> = {};
    columns
      .filter((column) => column.key !== "acciones")
      .forEach((column) => {
        result[column.key] = Array.from(
          new Set(rows.map((item) => normalizeColumnValue(getColumnValue(item, column.key))))
        ).sort((left, right) => left.localeCompare(right, "es", { sensitivity: "base" }));
      });
    return result;
  }, [rows]);

  const loadData = async (request?: Partial<EmpleadoPendienteBuscarRequest>) => {
    setLoading(true);
    setError("");

    try {
      const payload: EmpleadoPendienteBuscarRequest = {
        idPendiente: request?.idPendiente ?? (toNumber(filters.idPendiente) > 0 ? toNumber(filters.idPendiente) : null),
        idEmpleado: request?.idEmpleado ?? (toNumber(filters.idEmpleado) > 0 ? toNumber(filters.idEmpleado) : null),
        idResponsable: request?.idResponsable ?? (toNumber(filters.idResponsable) > 0 ? toNumber(filters.idResponsable) : null),
        idEstado: request?.idEstado ?? (toNumber(filters.idEstado) > 0 ? toNumber(filters.idEstado) : null),
        fechaInicio: request?.fechaInicio ?? (filters.fechaInicio || null),
        fechaFin: request?.fechaFin ?? (filters.fechaFin || null),
      };

      const data = await buscarEmpleadoPendiente(payload);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
      setError(getHttpErrorMessage(err, "No se pudo cargar la lista de pendientes."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closePanel = () => {
    setDraft(createEmptyDraft());
    setIsEditMode(false);
    setRutaUploadLoading(false);
    setRutaUploadError(null);
    setPanelOpen(false);
  };

  const handleNuevo = () => {
    setDraft({
      ...createEmptyDraft(),
      idEmpleado: userId > 0 ? String(userId) : "",
    });
    setIsEditMode(false);
    setRutaUploadLoading(false);
    setRutaUploadError(null);
    setError("");
    setMessage("");
    setPanelOpen(true);
  };

  const handleEditar = (row: EmpleadoPendienteDto) => {
    setDraft(buildDraftFromRow(row));
    setIsEditMode(true);
    setRutaUploadLoading(false);
    setRutaUploadError(null);
    setError("");
    setMessage("");
    setPanelOpen(true);
  };

  const rutaDisplayPath = useMemo(() => getRutaVisualizacion(draft.ruta), [draft.ruta]);

  const procesarRutaSeleccionada = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setRutaUploadLoading(true);
    setRutaUploadError(null);

    try {
      const formData = new FormData();
      formData.append("archivo", file);

      if (draft.idPendiente && draft.idPendiente > 0) {
        formData.append("idPendiente", String(draft.idPendiente));
      }

      if (toNumber(draft.idEmpleado) > 0) {
        formData.append("idEmpleado", String(toNumber(draft.idEmpleado)));
      }

      formData.append("usuario", userEmployeeCode || String(userId || userName));

      const response = await subirAdjuntoEmpleadoPendiente(formData);
      setDraft((prev) => ({
        ...prev,
        ruta: response.fileUrl || response.storagePath || "",
      }));
    } catch (err) {
      setRutaUploadError(getHttpErrorMessage(err, "No se pudo cargar el archivo en SharePoint."));
    } finally {
      setRutaUploadLoading(false);
    }
  };

  const validateDraft = () => {
    if (toNumber(draft.idEmpleado) <= 0) {
      setError("Empleado es obligatorio.");
      return false;
    }

    if (!isEditMode && toNumber(draft.idResponsable) <= 0) {
      setError("Responsable es obligatorio para registrar un nuevo pendiente.");
      return false;
    }

    if (!draft.fechaInicio) {
      setError("Fecha inicio es obligatoria.");
      return false;
    }

    if (draft.fechaEstimacionTermino && draft.fechaInicio && draft.fechaEstimacionTermino < draft.fechaInicio) {
      setError("Fecha estimación término no puede ser menor a fecha inicio.");
      return false;
    }

    return true;
  };

  const handleGuardar = async () => {
    if (!validateDraft()) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      if (isEditMode) {
        const payload: EmpleadoPendienteUpdateRequest = {
          idPendiente: draft.idPendiente ?? 0,
          idEmpleado: toNumber(draft.idEmpleado),
          fechaInicio: draft.fechaInicio || null,
          fechaEstimacionTermino: draft.fechaEstimacionTermino || null,
          fechaRealTermino: draft.fechaRealTermino || null,
          idEstado: toNumber(draft.idEstado) > 0 ? toNumber(draft.idEstado) : null,
          comentario: draft.comentario.trim() || null,
          observacion: draft.observacion.trim() || null,
          idResponsable: toNumber(draft.idResponsable) > 0 ? toNumber(draft.idResponsable) : null,
          ruta: draft.ruta.trim() || null,
          usuarioModificacion: userName,
        };
        await actualizarEmpleadoPendiente(payload);
        setMessage("Pendiente actualizado correctamente.");
      } else {
        const payload: EmpleadoPendienteInsertRequest = {
          idEmpleado: userId,
          fechaInicio: draft.fechaInicio || null,
          fechaEstimacionTermino: draft.fechaEstimacionTermino || null,
          idEstado: toNumber(draft.idEstado) > 0 ? toNumber(draft.idEstado) : 1,
          comentario: draft.comentario.trim() || null,
          idResponsable: toNumber(draft.idResponsable) > 0 ? toNumber(draft.idResponsable) : null,
          ruta: draft.ruta.trim() || undefined,
          usuarioCreacion: userEmployeeCode || String(userId),
        };
        await insertarEmpleadoPendiente(payload);
        setMessage("Pendiente registrado correctamente.");
      }

      closePanel();
      await loadData();
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo guardar el pendiente."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.page}>
      <CrudToolbar
        searchValue={busqueda}
        onSearchChange={setBusqueda}
        searchPlaceholder="Buscar pendientes..."
        buttons={[
          {
            key: "actualizar",
            label: loading ? "Actualizando..." : "Refrescar",
            onClick: () => void loadData(),
            variant: "secondary",
            disabled: loading,
          },
          { key: "nuevo", label: "Nuevo", onClick: handleNuevo },
        ]}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={styles.toolbarTitle}>Pendientes administrativos</span>
          <span style={styles.toolbarCaption}>
            Búsqueda, registro y actualización sobre `dbo.EmpleadoPendiente`.
          </span>
        </div>
      </CrudToolbar>

      {!panelOpen && error ? <div style={styles.errorBanner}>{error}</div> : null}
      {message ? <div style={styles.successBanner}>{message}</div> : null}

        

      <section style={{ ...styles.card, ...styles.gridSection }}>
        <div style={styles.segmentHeader}>
          <div>
            <h3 style={styles.subTitle}>Pendientes registrados</h3>
            <p style={styles.sectionText}>Grid principal con filtro por cabecera y edición real por fila.</p>
          </div>
          <div style={styles.counterPill}>
            {loading ? "Cargando..." : `${filteredRows.length} registro${filteredRows.length === 1 ? "" : "s"}`}
          </div>
        </div>

        <div style={{ ...styles.tableWrap, ...styles.gridTableWrap }}>
          <table style={styles.table}>
            <colgroup>
              {columns.map((column) => (
                <col key={`header-${column.key}`} style={{ width: column.width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {columns.map((header) => (
                  <th key={header.key} style={{ ...styles.th, width: header.width }}>
                    <div style={styles.thContent}>
                      <span>{header.label}</span>
                      {header.key !== "acciones" ? (
                        <button
                          type="button"
                          style={styles.filterButton}
                          onClick={(event) => {
                            event.stopPropagation();
                            setColumnaFiltroAbierta((prev) => (prev === header.key ? null : header.key));
                            setFiltroBusqueda("");
                          }}
                        >
                          Filtrar
                        </button>
                      ) : null}
                    </div>
                    {columnaFiltroAbierta === header.key ? (
                      <ColumnFilterDropdown
                        header={header}
                        filtroColumnaMenuRef={filtroColumnaMenuRef}
                        filtrosColumnas={filtrosColumnas}
                        setFiltrosColumnas={setFiltrosColumnas}
                        opcionesFiltroPorColumna={opcionesFiltroPorColumna}
                        filtroBusqueda={filtroBusqueda}
                        setFiltroBusqueda={setFiltroBusqueda}
                      />
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
          </table>
          <div style={styles.tableBodyScroll}>
            <table style={styles.table}>
              <colgroup>
                {columns.map((column) => (
                  <col key={`body-${column.key}`} style={{ width: column.width }} />
                ))}
              </colgroup>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={columns.length} style={styles.emptyCell}>Cargando pendientes...</td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} style={styles.emptyCell}>No hay datos para mostrar.</td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.idPendiente} style={styles.tr}>
                      <td style={styles.td}>
                        <button type="button" style={styles.smallActionButton} onClick={() => handleEditar(row)}>
                          Editar
                        </button>
                      </td>
                      {columns
                        .filter((item) => item.key !== "acciones")
                        .map((column) => (
                          <td key={`${row.idPendiente}-${column.key}`} style={styles.td}>
                            {getColumnValue(row, column.key)}
                          </td>
                        ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {panelOpen ? (
        <div style={styles.sidePanelOverlay}>
          <section style={{ ...styles.card, ...styles.sidePanel }}>
            {error ? <div style={styles.errorBanner}>{error}</div> : null}
            <div style={styles.sectionHeader}>
              <div>
                <h2 style={styles.sectionTitle}>{isEditMode ? "Actualizar pendiente" : "Nuevo pendiente"}</h2>
                <p style={styles.sectionText}>
                  {isEditMode
                    ? "Edición real conectada a `sp_EmpleadoPendiente_Actualizar`."
                    : "Registro real conectado a `sp_EmpleadoPendiente_Insertar`."}
                </p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" style={styles.secondaryButton} onClick={closePanel}>
                  Cerrar
                </button>
                <button type="button" style={styles.primaryButton} onClick={() => void handleGuardar()} disabled={saving}>
                  {isEditMode ? (saving ? "Actualizando..." : "Refrescar") : (saving ? "Guardando..." : "Guardar")}
                </button>
              </div>
            </div>

            <div style={styles.innerSection}>
              <div style={styles.formGrid}>
                {isEditMode ? (
                  <Field label="Empleado">
                    <select
                      value={draft.idEmpleado}
                      onChange={(event) => setDraft((prev) => ({ ...prev, idEmpleado: event.target.value }))}
                      style={styles.input}
                    >
                      <option value="">Seleccione...</option>
                      {empleadoOptions.map((option) => (
                        <option key={`emp-${normalizeOptionValue(option)}`} value={normalizeOptionValue(option)}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
                <Field label="Responsable">
                  <SolicitanteTypeahead
                    options={empleadoOptions}
                    selectedValue={draft.idResponsable}
                    onSelect={(value) => setDraft((prev) => ({ ...prev, idResponsable: value }))}
                    placeholder="Seleccione..."
                  />
                </Field>
                {isEditMode ? (
                  <Field label="Id estado">
                    <input
                      value={draft.idEstado}
                      onChange={(event) => setDraft((prev) => ({ ...prev, idEstado: event.target.value }))}
                      style={styles.input}
                    />
                  </Field>
                ) : null}
                <Field label="Fecha inicio">
                  <input
                    type="date"
                    value={draft.fechaInicio}
                    onChange={(event) => setDraft((prev) => ({ ...prev, fechaInicio: event.target.value }))}
                    style={styles.input}
                  />
                </Field>
                <Field label="Fecha estimación término">
                  <input
                    type="date"
                    value={draft.fechaEstimacionTermino}
                    onChange={(event) => setDraft((prev) => ({ ...prev, fechaEstimacionTermino: event.target.value }))}
                    style={styles.input}
                  />
                </Field>
              </div>

              <Field label="Comentario">
                <textarea
                  value={draft.comentario}
                  onChange={(event) => setDraft((prev) => ({ ...prev, comentario: event.target.value }))}
                  style={styles.textarea}
                />
              </Field>

              <Field label="Ruta">
                <div style={styles.uploadFieldWrap}>
                  <div style={styles.uploadFileRow}>
                    <button
                      type="button"
                      style={{
                        ...styles.uploadIconButton,
                        cursor: rutaUploadLoading ? "wait" : "pointer",
                        opacity: rutaUploadLoading ? 0.7 : 1,
                      }}
                      title="Cargar archivo"
                      onClick={() => archivoRutaInputRef.current?.click()}
                      disabled={rutaUploadLoading}
                    >
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="4" y="3" width="16" height="18" rx="2" fill="#6E4CCB" />
                        <rect x="7" y="7" width="10" height="2" rx="1" fill="#fff" />
                        <rect x="7" y="11" width="10" height="2" rx="1" fill="#fff" />
                        <rect x="7" y="15" width="6" height="2" rx="1" fill="#fff" />
                      </svg>
                    </button>
                    <div
                      style={{
                        ...styles.uploadPathText,
                        color: rutaDisplayPath ? "#374151" : "#6B7280",
                        cursor: rutaDisplayPath ? "pointer" : "default",
                        textDecoration: rutaDisplayPath ? "underline" : "none",
                      }}
                      title={rutaDisplayPath || "Sin archivo cargado"}
                      onClick={() => {
                        if (rutaDisplayPath) {
                          window.open(rutaDisplayPath, "_blank", "noopener,noreferrer");
                        }
                      }}
                    >
                      {rutaUploadLoading
                        ? "Cargando archivo en SharePoint..."
                        : rutaDisplayPath || "Sin archivo cargado"}
                    </div>
                  </div>
                  {rutaUploadError ? <div style={styles.uploadErrorText}>{rutaUploadError}</div> : null}
                  <input
                    ref={archivoRutaInputRef}
                    type="file"
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                    style={{ display: "none" }}
                    onChange={procesarRutaSeleccionada}
                  />
                  <input
                    value={draft.ruta}
                    onChange={(event) => setDraft((prev) => ({ ...prev, ruta: event.target.value }))}
                    style={styles.input}
                    placeholder="Se mostrara la URL o ruta almacenada"
                  />
                </div>
              </Field>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>{children}</label>;
}

const SolicitanteTypeahead = React.memo(function SolicitanteTypeahead({
  options,
  selectedValue,
  onSelect,
  placeholder,
}: {
  options: ConstanteOption[];
  selectedValue: string;
  onSelect: (value: string) => void;
  placeholder?: string;
}) {
  const [inputValue, setInputValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);

  const selectedOption = useMemo(
    () => options.find((option) => normalizeOptionValue(option) === selectedValue) ?? null,
    [options, selectedValue]
  );

  useEffect(() => {
    setInputValue(selectedOption?.label ?? "");
  }, [selectedOption]);

  const filteredOptions = useMemo(() => {
    if (inputValue.trim() === "") {
      return options;
    }

    return options.filter((option) => matchesFlexibleSearch(option.label, inputValue));
  }, [inputValue, options]);

  const applySelection = useCallback((option: ConstanteOption) => {
    onSelect(normalizeOptionValue(option));
    setInputValue(option.label);
    setShowDropdown(false);
    setHighlightedIdx(-1);
  }, [onSelect]);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        type="text"
        value={inputValue}
        onChange={(event) => {
          setInputValue(event.target.value);
          setShowDropdown(true);
          setHighlightedIdx(-1);
        }}
        onFocus={() => {
          if (filteredOptions.length > 0) {
            setShowDropdown(true);
          }
        }}
        onBlur={() => setTimeout(() => setShowDropdown(false), 120)}
        onKeyDown={(event) => {
          if (filteredOptions.length === 0) return;

          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlightedIdx((idx) => Math.min(idx + 1, filteredOptions.length - 1));
            setShowDropdown(true);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlightedIdx((idx) => Math.max(idx - 1, 0));
            setShowDropdown(true);
          } else if (event.key === "Enter") {
            event.preventDefault();
            const option = highlightedIdx >= 0 ? filteredOptions[highlightedIdx] : filteredOptions[0];
            if (option) {
              applySelection(option);
            }
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        style={styles.input}
      />
      {showDropdown && filteredOptions.length > 0 ? (
        <div style={styles.typeaheadMenu}>
          {filteredOptions.map((option, idx) => (
            <div
              key={`solicitante-${normalizeOptionValue(option)}-${idx}`}
              style={{
                ...styles.typeaheadItem,
                background: idx === highlightedIdx ? "#e6f7ff" : undefined,
              }}
              onMouseDown={() => applySelection(option)}
            >
              {option.label}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
});

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    width: "100%",
    minHeight: "calc(100vh - 112px)",
  },
  toolbarTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#0F172A",
  },
  toolbarCaption: {
    fontSize: 12,
    color: "#64748B",
  },
  card: {
    background: "#FFFFFF",
    borderRadius: 18,
    padding: 12,
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  gridSection: {
    flex: 1,
    minHeight: 0,
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
    flexWrap: "wrap",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    color: "#0F172A",
  },
  sectionText: {
    margin: "4px 0 0",
    fontSize: 12,
    color: "#64748B",
  },
  subTitle: {
    margin: 0,
    fontSize: 16,
    color: "#0F172A",
  },
  segmentHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  counterPill: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "#F1F5F9",
    fontSize: 12,
    color: "#334155",
    fontWeight: 700,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
  },
  input: {
    width: "100%",
    height: 34,
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    padding: "0 10px",
    fontSize: 12,
    background: "#FFFFFF",
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    minHeight: 92,
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    padding: 8,
    fontSize: 12,
    resize: "vertical",
    boxSizing: "border-box",
  },
  primaryButton: {
    border: "none",
    background: "#5B43D6",
    color: "#FFFFFF",
    borderRadius: 10,
    padding: "10px 16px",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#334155",
    borderRadius: 10,
    padding: "10px 16px",
    fontWeight: 700,
    cursor: "pointer",
  },
  smallActionButton: {
    border: "1px solid #BFDBFE",
    background: "#EFF6FF",
    color: "#1D4ED8",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  },
  tableWrap: {
    overflowX: "auto",
    border: "1px solid #E2E8F0",
    borderRadius: 14,
  },
  gridTableWrap: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 2400,
    tableLayout: "fixed",
  },
  th: {
    position: "relative",
    textAlign: "left",
    padding: "4px 4px",
    borderBottom: "1px solid #E2E8F0",
    background: "#F8FAFC",
    fontSize: 12,
    color: "#334155",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "4px 4px",
    borderBottom: "1px solid #EDF2F7",
    fontSize: 12,
    color: "#0F172A",
    verticalAlign: "top",
  },
  tableBodyScroll: {
    width: "100%",
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
  },
  tr: {
    cursor: "default",
  },
  thContent: {
    display: "flex",
    alignItems: "center",
    gap: 2,
  },
  filterButton: {
    border: "1px solid #CBD5E1",
    borderRadius: 999,
    padding: "1px 4px",
    fontSize: 9,
    cursor: "pointer",
  },
  columnFilter: {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    width: 230,
    maxHeight: 280,
    overflow: "auto",
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    boxShadow: "0 10px 28px rgba(15, 23, 42, 0.14)",
    padding: 10,
    zIndex: 20,
  },
  columnFilterInput: {
    width: "100%",
    marginBottom: 8,
    padding: "6px 8px",
    fontSize: 11,
    border: "1px solid #E5E7EB",
    borderRadius: 8,
  },
  columnFilterItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 4px",
    fontSize: 11,
    color: "#374151",
    cursor: "pointer",
  },
  clearInlineButton: {
    border: "none",
    background: "transparent",
    color: "#4338CA",
    fontSize: 10,
    fontWeight: 700,
    cursor: "pointer",
  },
  errorBanner: {
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    color: "#B91C1C",
    borderRadius: 14,
    padding: 14,
    fontSize: 13,
    fontWeight: 700,
  },
  successBanner: {
    background: "#ECFDF5",
    border: "1px solid #A7F3D0",
    color: "#047857",
    borderRadius: 14,
    padding: 14,
    fontSize: 13,
    fontWeight: 700,
  },
  emptyCell: {
    padding: 24,
    textAlign: "center",
    color: "#64748B",
    fontSize: 13,
  },
  sidePanelOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.35)",
    display: "flex",
    justifyContent: "flex-end",
    zIndex: 3000,
  },
  sidePanel: {
    width: 980,
    maxWidth: "100%",
    height: "100%",
    borderRadius: 0,
    boxShadow: "-8px 0 24px rgba(0,0,0,0.12)",
    overflowY: "auto",
  },
  innerSection: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  uploadFieldWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  uploadFileRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  uploadIconButton: {
    background: "none",
    border: "none",
    padding: 0,
    display: "flex",
    alignItems: "center",
    height: 36,
  },
  uploadPathText: {
    minWidth: 0,
    fontSize: 11,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  uploadErrorText: {
    fontSize: 12,
    color: "#DC2626",
    fontWeight: 600,
  },
  typeaheadMenu: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    background: "#fff",
    border: "1px solid #ccc",
    zIndex: 1002,
    maxHeight: 180,
    overflowY: "auto",
  },
  typeaheadItem: {
    padding: 6,
    cursor: "pointer",
    fontSize: 11,
    lineHeight: 1.1,
  },
};
