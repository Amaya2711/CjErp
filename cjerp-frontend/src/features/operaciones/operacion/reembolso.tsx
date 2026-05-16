import React, { useEffect, useMemo, useRef, useState } from "react";
import CrudToolbar, {
  matchesCrudToolbarSearch,
  type CrudToolbarSearchField,
} from "../../../components/base/CrudToolbar";
import { FiltroOperativoLookup } from "../../../components/lookups/FiltroOperativoLookup";
import {
  actualizarLogisticaReembolso,
  buscarLogisticaReembolso,
} from "../../../api/logisticaReembolsoService";
import { getAuthUser } from "../../../utils/authStorage";
import { getHttpErrorMessage } from "../../../utils/httpError";
import type { FiltroOperativoValue } from "../../../models/filtroOperativo";
import type {
  LogisticaReembolsoBuscarRequest,
  LogisticaReembolsoDto,
  LogisticaReembolsoUpdateRequest,
} from "../../../models/logisticaReembolso";

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
  lookup: FiltroOperativoValue;
  correlativo: string;
};

type ReembolsoDraft = {
  correlativo: string;
  filtroOperativo: FiltroOperativoValue;
  nombreCliente: string;
  nombreProyecto: string;
  nombreSite: string;
  responsable: string;
  solicitante: string;
  detalle: string;
  comentario: string;
  monto: string;
  subtotal: string;
  igv: string;
  total: string;
  moneda: string;
  estado: string;
  fechaEmision: string;
  fechaDeposito: string;
  fechaVencimiento: string;
  usuario: string;
};

const createInitialFilters = (): HeaderFilterState => ({
  lookup: {},
  correlativo: "",
});

const createEmptyDraft = (): ReembolsoDraft => ({
  correlativo: "",
  filtroOperativo: {},
  nombreCliente: "",
  nombreProyecto: "",
  nombreSite: "",
  responsable: "",
  solicitante: "",
  detalle: "",
  comentario: "",
  monto: "",
  subtotal: "",
  igv: "",
  total: "",
  moneda: "",
  estado: "",
  fechaEmision: "",
  fechaDeposito: "",
  fechaVencimiento: "",
  usuario: "",
});

const columns = [
  { key: "acciones", label: "Acciones", width: "110px" },
  { key: "correlativo", label: "Correlativo", width: "110px" },
  { key: "nombreCliente", label: "Cliente", width: "180px" },
  { key: "nombreProyecto", label: "Proyecto", width: "180px" },
  { key: "nombreSite", label: "Site", width: "180px" },
  { key: "responsable", label: "Responsable", width: "180px" },
  { key: "solicitante", label: "Solicitante", width: "180px" },
  { key: "detalle", label: "Detalle", width: "220px" },
  { key: "moneda", label: "Moneda", width: "100px" },
  { key: "monto", label: "Monto", width: "110px" },
  { key: "subtotal", label: "Subtotal", width: "110px" },
  { key: "igv", label: "IGV", width: "100px" },
  { key: "total", label: "Total", width: "110px" },
  { key: "estado", label: "Estado", width: "130px" },
  { key: "fechaEmision", label: "Fecha emision", width: "120px" },
  { key: "fechaDeposito", label: "Fecha deposito", width: "120px" },
  { key: "fechaVencimiento", label: "Fecha vencimiento", width: "130px" },
  { key: "usuario", label: "Usuario", width: "150px" },
] as const;

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
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString("es-PE");
}

function formatAmount(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return "";
  return Number(value).toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeColumnValue(value: unknown) {
  return String(value ?? "").trim();
}

function matchesColumnFilterValue(value: unknown, selectedValues: string[]) {
  if (!selectedValues.length) return true;
  return selectedValues.includes(normalizeColumnValue(value));
}

function buildDraftFromRow(item: LogisticaReembolsoDto): ReembolsoDraft {
  return {
    correlativo: item.correlativo ? String(item.correlativo) : "",
    filtroOperativo: {
      filtro:
        item.idCliente && item.idProyecto && item.idSite
          ? {
              filtroKey: `${item.idCliente}|${item.idProyecto}|${item.idSite}|${item.correlativo}`,
              idCliente: item.idCliente,
              idProyecto: item.idProyecto,
              idSite: item.idSite,
              correlativo: item.correlativo,
              nroInterno: item.correlativo,
              nombreCliente: item.nombreCliente || "",
              nombreProyecto: item.nombreProyecto || "",
              nombreSite: item.nombreSite || "",
              tipoTrabajo: "",
              ot: "",
              fecAsignacion: null,
            }
          : undefined,
    },
    nombreCliente: item.nombreCliente || "",
    nombreProyecto: item.nombreProyecto || "",
    nombreSite: item.nombreSite || "",
    responsable: item.responsable || "",
    solicitante: item.solicitante || "",
    detalle: item.detalle || "",
    comentario: item.comentario || "",
    monto: item.monto != null ? String(item.monto) : "",
    subtotal: item.subtotal != null ? String(item.subtotal) : "",
    igv: item.igv != null ? String(item.igv) : "",
    total: item.total != null ? String(item.total) : "",
    moneda: item.moneda || "",
    estado: item.estado || "",
    fechaEmision: item.fechaEmision ? String(item.fechaEmision).slice(0, 10) : "",
    fechaDeposito: item.fechaDeposito ? String(item.fechaDeposito).slice(0, 10) : "",
    fechaVencimiento: item.fechaVencimiento ? String(item.fechaVencimiento).slice(0, 10) : "",
    usuario: item.usuario || "",
  };
}

export default function ReembolsoPage() {
  const authUser = getAuthUser();
  const userName =
    authUser?.usuario ??
    authUser?.username ??
    authUser?.userName ??
    authUser?.nombreEmpleado ??
    authUser?.nombre ??
    "sistema";

  const [rows, setRows] = useState<LogisticaReembolsoDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filters, setFilters] = useState<HeaderFilterState>(createInitialFilters);
  const [busqueda, setBusqueda] = useState("");
  const [draft, setDraft] = useState<ReembolsoDraft>(createEmptyDraft);
  const [panelOpen, setPanelOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [filtrosColumnas, setFiltrosColumnas] = useState<Record<string, string[]>>({});
  const [columnaFiltroAbierta, setColumnaFiltroAbierta] = useState<string | null>(null);
  const [filtroBusqueda, setFiltroBusqueda] = useState("");
  const filtroColumnaMenuRef = useRef<HTMLDivElement>(null);
  const lookupInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const correlativo = draft.filtroOperativo.filtro?.correlativo;
    if (!correlativo) return;
    setDraft((prev) => ({
      ...prev,
      correlativo: String(correlativo),
    }));
  }, [draft.filtroOperativo.filtro?.correlativo]);

  const loadData = async (request?: Partial<LogisticaReembolsoBuscarRequest>) => {
    setLoading(true);
    setError("");

    try {
      const payload: LogisticaReembolsoBuscarRequest = {
        correlativo:
          request?.correlativo ??
          (toNumber(filters.correlativo) > 0
            ? toNumber(filters.correlativo)
            : filters.lookup.filtro?.correlativo ?? null),
      };

      const data = await buscarLogisticaReembolso(payload);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo cargar la lista de reembolsos."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const searchFields = useMemo<CrudToolbarSearchField<LogisticaReembolsoDto>[]>(
    () => [
      { key: "correlativo", label: "Correlativo", getValue: (item) => item.correlativo },
      { key: "nombreCliente", label: "Cliente", getValue: (item) => item.nombreCliente },
      { key: "nombreProyecto", label: "Proyecto", getValue: (item) => item.nombreProyecto },
      { key: "nombreSite", label: "Site", getValue: (item) => item.nombreSite },
      { key: "responsable", label: "Responsable", getValue: (item) => item.responsable },
      { key: "solicitante", label: "Solicitante", getValue: (item) => item.solicitante },
      { key: "detalle", label: "Detalle", getValue: (item) => item.detalle },
      { key: "moneda", label: "Moneda", getValue: (item) => item.moneda },
      { key: "estado", label: "Estado", getValue: (item) => item.estado },
      { key: "fechaDeposito", label: "FechaDeposito", getValue: (item) => item.fechaDeposito },
      { key: "usuario", label: "Usuario", getValue: (item) => item.usuario },
    ],
    []
  );

  const getColumnValue = (item: LogisticaReembolsoDto, key: string) => {
    switch (key) {
      case "monto":
      case "subtotal":
      case "igv":
      case "total":
        return formatAmount((item as unknown as Record<string, number | null | undefined>)[key]);
      case "fechaEmision":
      case "fechaDeposito":
      case "fechaVencimiento":
      case "fechaCreacion":
        return formatDate((item as unknown as Record<string, string | null | undefined>)[key]);
      default:
        return String((item as Record<string, unknown>)[key] ?? "");
    }
  };

  const filteredRows = useMemo(
    () =>
      rows
        .filter((item) => matchesCrudToolbarSearch(item, busqueda, searchFields))
        .filter((item) =>
          searchFields.every((field) =>
            matchesColumnFilterValue(getColumnValue(item, field.key), filtrosColumnas[field.key] ?? [])
          )
        ),
    [busqueda, filtrosColumnas, rows, searchFields]
  );

  const opcionesFiltroPorColumna = useMemo(() => {
    const result: Record<string, string[]> = {};
    searchFields.forEach((field) => {
      result[field.key] = Array.from(
        new Set(rows.map((item) => normalizeColumnValue(getColumnValue(item, field.key))))
      ).sort((left, right) => left.localeCompare(right, "es", { sensitivity: "base" }));
    });
    return result;
  }, [rows, searchFields]);

  const handleActualizar = () => {
    setDraft(createEmptyDraft());
    setIsEditMode(false);
    setPanelOpen(true);
    setMessage("");
    setTimeout(() => lookupInputRef.current?.focus(), 0);
  };

  const handleEditar = (row: LogisticaReembolsoDto) => {
    setDraft(buildDraftFromRow(row));
    setIsEditMode(true);
    setPanelOpen(true);
    setMessage("");
  };

  const handleGuardar = async () => {
    setError("");
    setMessage("");

    const correlativo = toNumber(draft.correlativo || draft.filtroOperativo.filtro?.correlativo);

    if (correlativo <= 0) {
      setError("Correlativo es obligatorio.");
      return;
    }

    setSaving(true);
    try {
      const payload: LogisticaReembolsoUpdateRequest = {
        correlativo,
        usuarioActualizacion: userName,
        observacion: draft.comentario.trim() || null,
      };

      await actualizarLogisticaReembolso(payload);
      setMessage("Reembolso actualizado correctamente.");
      setPanelOpen(false);
      await loadData({ correlativo });
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo actualizar el reembolso."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.page}>
      {error ? <div style={styles.errorBanner}>{error}</div> : null}
      {message ? <div style={styles.successBanner}>{message}</div> : null}

      <section style={styles.card}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Reembolso</h2>
            <p style={styles.sectionText}>
              Consulta y preparacion de actualizacion de reembolso siguiendo el patron de OC.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => {
                setFilters(createInitialFilters());
                setBusqueda("");
                setFiltrosColumnas({});
                void loadData({ correlativo: null });
              }}
            >
              Limpiar
            </button>
            <button type="button" style={styles.primaryButton} onClick={() => void loadData()}>
              Buscar
            </button>
            <button type="button" style={styles.primaryButton} onClick={handleActualizar}>
              Actualizar
            </button>
          </div>
        </div>

        <div style={styles.formGrid}>
          <div style={{ gridColumn: "span 2" }}>
            <Label>Cliente / Proyecto / Site</Label>
            <FiltroOperativoLookup
              value={filters.lookup}
              onChange={(value) => setFilters((prev) => ({ ...prev, lookup: value }))}
            />
          </div>
          <Field label="Correlativo">
            <input
              value={filters.correlativo}
              onChange={(event) => setFilters((prev) => ({ ...prev, correlativo: event.target.value }))}
              style={styles.input}
            />
          </Field>
        </div>
      </section>

      <section style={styles.card}>
        <div style={styles.segmentHeader}>
          <div>
            <h3 style={styles.subTitle}>Reembolsos encontrados</h3>
            <p style={styles.sectionText}>Listado principal con filtros por columna y acceso a edicion.</p>
          </div>
          <div style={styles.counterPill}>{filteredRows.length} registros</div>
        </div>

        <CrudToolbar
          searchPlaceholder="Buscar reembolso..."
          searchValue={busqueda}
          onSearchChange={setBusqueda}
        />

        <div style={styles.tableWrap}>
          <table style={styles.table}>
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
                    {columnaFiltroAbierta === header.key && header.key !== "acciones" ? (
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
            <tbody>
              {!loading && filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} style={styles.emptyCell}>No hay datos para mostrar.</td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={`${row.correlativo}-${row.idSite || "sin-site"}`} style={styles.tr}>
                    <td style={styles.td}>
                      <button type="button" style={styles.smallActionButton} onClick={() => handleEditar(row)}>
                        Editar
                      </button>
                    </td>
                    {columns.filter((item) => item.key !== "acciones").map((column) => (
                      <td key={`${row.correlativo}-${column.key}`} style={styles.td}>
                        {getColumnValue(row, column.key)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {panelOpen ? (
        <div style={styles.sidePanelOverlay}>
          <div style={{ ...styles.card, ...styles.sidePanel }}>
            <div style={styles.sectionHeader}>
              <div>
                <h2 style={styles.sectionTitle}>
                  {isEditMode ? `Editar reembolso #${draft.correlativo}` : "Actualizar reembolso"}
                </h2>
                <p style={styles.sectionText}>
                  {isEditMode
                    ? "La pantalla queda lista para update real cuando el store de actualizacion este disponible."
                    : "Seleccione el filtro operativo o el correlativo para preparar la actualizacion."}
                </p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" style={styles.secondaryButton} onClick={() => setPanelOpen(false)}>
                  Cerrar
                </button>
                <button type="button" style={styles.primaryButton} onClick={() => void handleGuardar()} disabled={saving}>
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>

            <div style={styles.innerSection}>
              <div style={{ gridColumn: "span 2" }}>
                <Label>Cliente / Proyecto / Site</Label>
                <FiltroOperativoLookup
                  value={draft.filtroOperativo}
                  onChange={(value) => setDraft((prev) => ({ ...prev, filtroOperativo: value }))}
                  filtroInputRef={lookupInputRef}
                />
                <span style={styles.helperText}>
                  Si selecciona un filtro operativo, el correlativo se completa automaticamente.
                </span>
              </div>

              <div style={styles.formGrid}>
                <Field label="Correlativo *">
                  <input
                    value={draft.correlativo}
                    onChange={(event) => setDraft((prev) => ({ ...prev, correlativo: event.target.value }))}
                    style={styles.input}
                  />
                </Field>
                <Field label="Cliente">
                  <input value={draft.nombreCliente} readOnly style={styles.readOnlyInput} />
                </Field>
                <Field label="Proyecto">
                  <input value={draft.nombreProyecto} readOnly style={styles.readOnlyInput} />
                </Field>
                <Field label="Site">
                  <input value={draft.nombreSite} readOnly style={styles.readOnlyInput} />
                </Field>
                <Field label="Responsable">
                  <input value={draft.responsable} readOnly style={styles.readOnlyInput} />
                </Field>
                <Field label="Solicitante">
                  <input value={draft.solicitante} readOnly style={styles.readOnlyInput} />
                </Field>
                <Field label="Moneda">
                  <input value={draft.moneda} readOnly style={styles.readOnlyInput} />
                </Field>
                <Field label="Estado">
                  <input value={draft.estado} readOnly style={styles.readOnlyInput} />
                </Field>
                <Field label="Monto">
                  <input value={draft.monto} readOnly style={styles.readOnlyInput} />
                </Field>
                <Field label="Subtotal">
                  <input value={draft.subtotal} readOnly style={styles.readOnlyInput} />
                </Field>
                <Field label="IGV">
                  <input value={draft.igv} readOnly style={styles.readOnlyInput} />
                </Field>
                <Field label="Total">
                  <input value={draft.total} readOnly style={styles.readOnlyInput} />
                </Field>
                <Field label="Fecha emision">
                  <input type="date" value={draft.fechaEmision} readOnly style={styles.readOnlyInput} />
                </Field>
                <Field label="Fecha deposito">
                  <input type="date" value={draft.fechaDeposito} readOnly style={styles.readOnlyInput} />
                </Field>
                <Field label="Fecha vencimiento">
                  <input type="date" value={draft.fechaVencimiento} readOnly style={styles.readOnlyInput} />
                </Field>
                <Field label="Usuario">
                  <input value={draft.usuario} readOnly style={styles.readOnlyInput} />
                </Field>
              </div>

              <Field label="Detalle">
                <textarea value={draft.detalle} readOnly style={styles.textareaReadOnly} />
              </Field>

              <Field label="Comentario / Observacion">
                <textarea
                  value={draft.comentario}
                  onChange={(event) => setDraft((prev) => ({ ...prev, comentario: event.target.value }))}
                  style={styles.textarea}
                />
              </Field>
            </div>
          </div>
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

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    width: "100%",
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
  readOnlyInput: {
    width: "100%",
    height: 34,
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    padding: "0 10px",
    fontSize: 12,
    background: "#F8FAFC",
    color: "#475569",
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    minHeight: 72,
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    padding: 8,
    fontSize: 12,
    resize: "vertical",
    boxSizing: "border-box",
  },
  textareaReadOnly: {
    width: "100%",
    minHeight: 72,
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    padding: 8,
    fontSize: 12,
    resize: "vertical",
    boxSizing: "border-box",
    background: "#F8FAFC",
    color: "#475569",
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
    overflowX: "scroll",
    overflowY: "scroll",
    border: "1px solid #E2E8F0",
    borderRadius: 14,
    maxHeight: 420,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 2100,
    tableLayout: "fixed",
  },
  th: {
    position: "sticky",
    top: 0,
    textAlign: "left",
    padding: "7px 10px",
    borderBottom: "1px solid #E2E8F0",
    background: "#F8FAFC",
    fontSize: 12,
    color: "#334155",
    whiteSpace: "nowrap",
    zIndex: 5,
  },
  td: {
    padding: "7px 10px",
    borderBottom: "1px solid #EDF2F7",
    fontSize: 12,
    color: "#0F172A",
    verticalAlign: "top",
  },
  tr: {
    cursor: "pointer",
  },
  thContent: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  filterButton: {
    border: "1px solid #CBD5E1",
    borderRadius: 999,
    padding: "3px 8px",
    fontSize: 10,
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
  helperText: {
    display: "inline-block",
    marginTop: 6,
    fontSize: 11,
    color: "#64748B",
  },
};
