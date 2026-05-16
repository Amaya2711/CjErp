import React, { useEffect, useMemo, useRef, useState } from "react";
import CrudToolbar, {
  matchesCrudToolbarSearch,
  type CrudToolbarSearchField,
} from "../../../components/base/CrudToolbar";
import { FiltroOperativoLookup } from "../../../components/lookups/FiltroOperativoLookup";
import {
  buscarLogisticaRecojo,
  insertarLogisticaRecojo,
} from "../../../api/logisticaRecojoService";
import { getConstanteOptionsPorCampo } from "../../../api/constantesService";
import { listarSolicitanteOptions } from "../../../api/solicitanteService";
import { listarUbigeos } from "../../../api/ubigeoService";
import { getAuthUser } from "../../../utils/authStorage";
import { getHttpErrorMessage } from "../../../utils/httpError";
import type { ConstanteOption } from "../../../models/constante";
import type { FiltroOperativoValue } from "../../../models/filtroOperativo";
import type {
  LogisticaRecojoBuscarRequest,
  LogisticaRecojoDto,
  LogisticaRecojoInsertRequest,
} from "../../../models/logisticaRecojo";
import type { UbigeoOption } from "../../../models/ubigeo";

type ColumnFilterDropdownProps = {
  header: { key: string; label: string };
  filtroColumnaMenuRef: React.RefObject<HTMLDivElement | null>;
  filtrosColumnas: Record<string, string[]>;
  setFiltrosColumnas: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  opcionesFiltroPorColumna: Record<string, string[]>;
  filtroBusqueda: string;
  setFiltroBusqueda: (value: string) => void;
};

type RecojoDraft = {
  idRecojo: number | null;
  filtroOperativo: FiltroOperativoValue;
  correlativo: string;
  solicitud: string;
  clave: string;
  idEmpresa: string;
  nroGuia: string;
  idUbigeo: string;
  detalleUbigeo: string;
  fechaSalida: string;
  fechaLlegada: string;
  observacion: string;
  idResponsable: string;
  fechaRecojo: string;
  rutaImagenGuia: string;
  idResponsableRecojo: string;
  esActivo: boolean;
};

type HeaderFilterState = {
  lookup: FiltroOperativoValue;
  solicitud: string;
  clave: string;
  nroGuia: string;
  idEmpresa: string;
  esActivo: "todos" | "activos" | "inactivos";
};

const createEmptyDraft = (): RecojoDraft => ({
  idRecojo: null,
  filtroOperativo: {},
  correlativo: "",
  solicitud: "",
  clave: "",
  idEmpresa: "",
  nroGuia: "",
  idUbigeo: "",
  detalleUbigeo: "",
  fechaSalida: new Date().toISOString().slice(0, 10),
  fechaLlegada: new Date().toISOString().slice(0, 10),
  observacion: "",
  idResponsable: "",
  fechaRecojo: new Date().toISOString().slice(0, 10),
  rutaImagenGuia: "",
  idResponsableRecojo: "",
  esActivo: true,
});

const createInitialFilters = (): HeaderFilterState => ({
  lookup: {},
  solicitud: "",
  clave: "",
  nroGuia: "",
  idEmpresa: "",
  esActivo: "activos",
});

const columns = [
  { key: "acciones", label: "Acciones", width: "110px" },
  { key: "idRecojo", label: "IdRecojo", width: "90px" },
  { key: "nombreCliente", label: "Cliente", width: "180px" },
  { key: "nombreProyecto", label: "Proyecto", width: "180px" },
  { key: "nombreSite", label: "Site", width: "180px" },
  { key: "solicitud", label: "Solicitud", width: "120px" },
  { key: "clave", label: "Clave", width: "120px" },
  { key: "agencia", label: "Agencia", width: "150px" },
  { key: "nroGuia", label: "Nro Guia", width: "120px" },
  { key: "nombreUbigeo", label: "Ubigeo", width: "150px" },
  { key: "detalleUbigeo", label: "Detalle Ubigeo", width: "220px" },
  { key: "fechaSalida", label: "Fecha salida", width: "120px" },
  { key: "fechaLlegada", label: "Fecha llegada", width: "120px" },
  { key: "responsable", label: "Responsable", width: "180px" },
  { key: "fechaRecojo", label: "Fecha recojo", width: "120px" },
  { key: "responsableOtro", label: "Responsable recojo", width: "180px" },
  { key: "fechaCreacion", label: "Fecha creacion", width: "140px" },
  { key: "esActivo", label: "Estado", width: "100px" },
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
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("es-PE");
}

function normalizeColumnValue(value: unknown) {
  return String(value ?? "").trim();
}

function matchesColumnFilterValue(value: unknown, selectedValues: string[]) {
  if (!selectedValues.length) return true;
  return selectedValues.includes(normalizeColumnValue(value));
}

function buildDraftFromRow(item: LogisticaRecojoDto): RecojoDraft {
  return {
    idRecojo: item.idRecojo,
    filtroOperativo: {
      filtro: item.idCliente && item.idProyecto && item.idSite
        ? {
            filtroKey: `${item.idCliente}|${item.idProyecto}|${item.idSite}|${item.correlativo}`,
            idCliente: item.idCliente,
            idProyecto: item.idProyecto,
            idSite: item.idSite,
            correlativo: item.correlativo,
            nroInterno: item.correlativo,
            nombreCliente: item.nombreCliente,
            nombreProyecto: item.nombreProyecto,
            nombreSite: item.nombreSite,
            tipoTrabajo: "",
            ot: "",
            fecAsignacion: null,
          }
        : undefined,
    },
    correlativo: String(item.correlativo || ""),
    solicitud: item.solicitud || "",
    clave: item.clave || "",
    idEmpresa: item.idEmpresa ? String(item.idEmpresa) : "",
    nroGuia: item.nroGuia || "",
    idUbigeo: item.idUbigeo ? String(item.idUbigeo) : "",
    detalleUbigeo: item.detalleUbigeo || "",
    fechaSalida: item.fechaSalida ? String(item.fechaSalida).slice(0, 10) : "",
    fechaLlegada: item.fechaLlegada ? String(item.fechaLlegada).slice(0, 10) : "",
    observacion: item.observacion || "",
    idResponsable: item.idResponsable ? String(item.idResponsable) : "",
    fechaRecojo: item.fechaRecojo ? String(item.fechaRecojo).slice(0, 10) : "",
    rutaImagenGuia: item.rutaImagenGuia || "",
    idResponsableRecojo: item.idResponsableRecojo ? String(item.idResponsableRecojo) : "",
    esActivo: item.esActivo,
  };
}

export default function RecojoPage() {
  const authUser = getAuthUser();
  const userName =
    authUser?.usuario ??
    authUser?.username ??
    authUser?.userName ??
    authUser?.nombreEmpleado ??
    authUser?.nombre ??
    "sistema";
  const userId = toNumber(authUser?.idEmpleado ?? authUser?.codEmp);
  const userCargoId = toNumber(authUser?.idCargo ?? authUser?.idrol);

  const [rows, setRows] = useState<LogisticaRecojoDto[]>([]);
  const [responsables, setResponsables] = useState<ConstanteOption[]>([]);
  const [agenciaOptions, setAgenciaOptions] = useState<ConstanteOption[]>([]);
  const [ubigeoOptions, setUbigeoOptions] = useState<UbigeoOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filters, setFilters] = useState<HeaderFilterState>(createInitialFilters);
  const [busqueda, setBusqueda] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [draft, setDraft] = useState<RecojoDraft>(createEmptyDraft);
  const [isEditMode, setIsEditMode] = useState(false);
  const [filtrosColumnas, setFiltrosColumnas] = useState<Record<string, string[]>>({});
  const [columnaFiltroAbierta, setColumnaFiltroAbierta] = useState<string | null>(null);
  const [filtroBusqueda, setFiltroBusqueda] = useState("");
  const filtroColumnaMenuRef = useRef<HTMLDivElement>(null);
  const lookupInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [responsableOptions, agencias, ubigeos] = await Promise.all([
          listarSolicitanteOptions({
            idCargo: userCargoId > 0 ? userCargoId : null,
            idEmpleado: userId > 0 ? userId : null,
          }),
          getConstanteOptionsPorCampo("AGENCIA"),
          listarUbigeos(),
        ]);
        setResponsables(responsableOptions);
        setAgenciaOptions(agencias);
        setUbigeoOptions(ubigeos);
      } catch (err) {
        setError(getHttpErrorMessage(err, "No se pudieron cargar los catalogos del formulario."));
      }
    };

    void loadInitialData();
  }, [userCargoId, userId]);

  useEffect(() => {
    const correlativo = draft.filtroOperativo.filtro?.correlativo;
    setDraft((prev) => ({
      ...prev,
      correlativo: correlativo ? String(correlativo) : "",
    }));
  }, [draft.filtroOperativo.filtro?.correlativo]);

  const loadData = async (request?: Partial<LogisticaRecojoBuscarRequest>) => {
    setLoading(true);
    setError("");

    try {
      const payload: LogisticaRecojoBuscarRequest = {
        idCliente: request?.idCliente ?? filters.lookup.filtro?.idCliente ?? null,
        idProyecto: request?.idProyecto ?? filters.lookup.filtro?.idProyecto ?? null,
        idSite: request?.idSite ?? filters.lookup.filtro?.idSite ?? null,
        correlativo: request?.correlativo ?? filters.lookup.filtro?.correlativo ?? null,
        solicitud: request?.solicitud ?? (filters.solicitud.trim() || null),
        clave: request?.clave ?? (filters.clave.trim() || null),
        idEmpresa: request?.idEmpresa ?? (toNumber(filters.idEmpresa) > 0 ? toNumber(filters.idEmpresa) : null),
        nroGuia: request?.nroGuia ?? (filters.nroGuia.trim() || null),
        esActivo:
          request?.esActivo ??
          (filters.esActivo === "todos" ? null : filters.esActivo === "activos"),
      };

      const data = await buscarLogisticaRecojo(payload);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo cargar la lista de recojos."));
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

  const searchFields = useMemo<CrudToolbarSearchField<LogisticaRecojoDto>[]>(
    () => [
      { key: "idRecojo", label: "IdRecojo", getValue: (item) => item.idRecojo },
      { key: "nombreCliente", label: "Cliente", getValue: (item) => item.nombreCliente },
      { key: "nombreProyecto", label: "Proyecto", getValue: (item) => item.nombreProyecto },
      { key: "nombreSite", label: "Site", getValue: (item) => item.nombreSite },
      { key: "solicitud", label: "Solicitud", getValue: (item) => item.solicitud },
      { key: "clave", label: "Clave", getValue: (item) => item.clave },
      { key: "agencia", label: "Agencia", getValue: (item) => item.agencia },
      { key: "nroGuia", label: "NroGuia", getValue: (item) => item.nroGuia },
      { key: "responsable", label: "Responsable", getValue: (item) => item.responsable },
      { key: "responsableOtro", label: "ResponsableOtro", getValue: (item) => item.responsableOtro },
    ],
    []
  );

  const getColumnValue = (item: LogisticaRecojoDto, key: string) => {
    switch (key) {
      case "fechaSalida":
      case "fechaLlegada":
      case "fechaRecojo":
      case "fechaCreacion":
        return formatDate((item as unknown as Record<string, string | null | undefined>)[key]);
      case "esActivo":
        return item.esActivo ? "Activo" : "Inactivo";
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

  const handleNuevo = () => {
    setDraft(createEmptyDraft());
    setIsEditMode(false);
    setMessage("");
    setPanelOpen(true);
    setTimeout(() => lookupInputRef.current?.focus(), 0);
  };

  const handleEditar = (row: LogisticaRecojoDto) => {
    setDraft(buildDraftFromRow(row));
    setIsEditMode(true);
    setMessage("");
    setPanelOpen(true);
  };

  const handleGuardar = async () => {
    setError("");
    setMessage("");

    if (isEditMode) {
      setMessage("El modo edicion queda preparado, pero no existe store update configurado para guardar cambios.");
      return;
    }

    const filtro = draft.filtroOperativo.filtro;

    if (!filtro?.idCliente) {
      setError("Cliente es obligatorio.");
      return;
    }

    if (!filtro?.idProyecto) {
      setError("Proyecto es obligatorio.");
      return;
    }

    if (!filtro?.idSite) {
      setError("Site es obligatorio.");
      return;
    }

    if (toNumber(draft.filtroOperativo.filtro?.correlativo) <= 0) {
      setError("Correlativo es obligatorio.");
      return;
    }

    setSaving(true);
    try {
      const payload: LogisticaRecojoInsertRequest = {
        idCliente: filtro.idCliente,
        idProyecto: filtro.idProyecto,
        idSite: filtro.idSite,
        correlativo: toNumber(draft.filtroOperativo.filtro?.correlativo),
        solicitud: draft.solicitud.trim(),
        clave: draft.clave.trim(),
        idEmpresa: toNumber(draft.idEmpresa) > 0 ? toNumber(draft.idEmpresa) : null,
        nroGuia: draft.nroGuia.trim(),
        idUbigeo: toNumber(draft.idUbigeo) > 0 ? toNumber(draft.idUbigeo) : null,
        detalleUbigeo: draft.detalleUbigeo.trim(),
        fechaSalida: draft.fechaSalida || null,
        fechaLlegada: draft.fechaLlegada || null,
        observacion: draft.observacion.trim(),
        idResponsable: toNumber(draft.idResponsable) > 0 ? toNumber(draft.idResponsable) : null,
        fechaRecojo: draft.fechaRecojo || null,
        rutaImagenGuia: draft.rutaImagenGuia.trim(),
        idResponsableRecojo: toNumber(draft.idResponsableRecojo) > 0 ? toNumber(draft.idResponsableRecojo) : null,
        usuarioCreacion: userName,
      };

      await insertarLogisticaRecojo(payload);
      setMessage("Recojo registrado correctamente.");
      setPanelOpen(false);
      setDraft(createEmptyDraft());
      await loadData();
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo guardar el recojo."));
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
            <h2 style={styles.sectionTitle}>Recojo logistico</h2>
            <p style={styles.sectionText}>Busqueda principal y registro de recojos usando el mismo patron de OC.</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" style={styles.secondaryButton} onClick={() => {
              setFilters(createInitialFilters());
              setBusqueda("");
              setFiltrosColumnas({});
              void loadData({
                idCliente: null,
                idProyecto: null,
                idSite: null,
                correlativo: null,
                solicitud: null,
                clave: null,
                idEmpresa: null,
                nroGuia: null,
                esActivo: null,
              });
            }}>
              Limpiar
            </button>
            <button type="button" style={styles.primaryButton} onClick={() => void loadData()}>
              Buscar
            </button>
            <button type="button" style={styles.primaryButton} onClick={handleNuevo}>
              Nuevo
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
          <Field label="Solicitud">
            <input
              value={filters.solicitud}
              onChange={(event) => setFilters((prev) => ({ ...prev, solicitud: event.target.value }))}
              style={styles.input}
            />
          </Field>
          <Field label="Clave">
            <input
              value={filters.clave}
              onChange={(event) => setFilters((prev) => ({ ...prev, clave: event.target.value }))}
              style={styles.input}
            />
          </Field>
          <Field label="Nro Guia">
            <input
              value={filters.nroGuia}
              onChange={(event) => setFilters((prev) => ({ ...prev, nroGuia: event.target.value }))}
              style={styles.input}
            />
          </Field>
          <Field label="IdEmpresa / Agencia">
            <input
              value={filters.idEmpresa}
              onChange={(event) => setFilters((prev) => ({ ...prev, idEmpresa: event.target.value }))}
              style={styles.input}
            />
          </Field>
          <Field label="Estado activo">
            <select
              value={filters.esActivo}
              onChange={(event) => setFilters((prev) => ({ ...prev, esActivo: event.target.value as HeaderFilterState["esActivo"] }))}
              style={styles.input}
            >
              <option value="todos">Todos</option>
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
            </select>
          </Field>
        </div>
      </section>

      <section style={styles.card}>
        <div style={styles.segmentHeader}>
          <div>
            <h3 style={styles.subTitle}>Cabecera</h3>
            <p style={styles.sectionText}>Grid principal con filtro por cabecera y accion de edicion.</p>
          </div>
          <div style={styles.counterPill}>
            {loading ? "Cargando..." : `${filteredRows.length} registro${filteredRows.length === 1 ? "" : "s"}`}
          </div>
        </div>

        <CrudToolbar
          searchPlaceholder="Buscar recojo..."
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
            <tbody>
              {!loading && filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} style={styles.emptyCell}>No hay datos para mostrar.</td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.idRecojo} style={styles.tr}>
                    <td style={styles.td}>
                      <button type="button" style={styles.smallActionButton} onClick={() => handleEditar(row)}>
                        Editar
                      </button>
                    </td>
                    {columns.filter((item) => item.key !== "acciones").map((column) => (
                      <td key={`${row.idRecojo}-${column.key}`} style={styles.td}>
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
                  {isEditMode ? `Editar recojo #${draft.idRecojo}` : "Nuevo recojo"}
                </h2>
                <p style={styles.sectionText}>
                  {isEditMode
                    ? "La pantalla de edicion queda preparada; el update no se ejecuta hasta tener store."
                    : "Registro de nuevos recojos logisticos."}
                </p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" style={styles.secondaryButton} onClick={() => setPanelOpen(false)}>
                  Cerrar
                </button>
                <button type="button" style={styles.primaryButton} onClick={() => void handleGuardar()} disabled={saving}>
                  {isEditMode ? "Actualizar" : saving ? "Guardando..." : "Guardar"}
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
                  El correlativo se toma automaticamente del filtro seleccionado.
                </span>
              </div>

              <div style={styles.formGrid}>
                <Field label="Solicitud">
                  <input
                    value={draft.solicitud}
                    onChange={(event) => setDraft((prev) => ({ ...prev, solicitud: event.target.value }))}
                    style={styles.input}
                  />
                </Field>
                <Field label="Clave">
                  <input
                    value={draft.clave}
                    onChange={(event) => setDraft((prev) => ({ ...prev, clave: event.target.value }))}
                    style={styles.input}
                  />
                </Field>
                <Field label="Agencia">
                  <select
                    value={draft.idEmpresa}
                    onChange={(event) => setDraft((prev) => ({ ...prev, idEmpresa: event.target.value }))}
                    style={styles.input}
                  >
                    <option value="">Seleccione...</option>
                    {agenciaOptions.map((option) => (
                      <option key={`${option.codigo}-${option.value}`} value={option.codigo || option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Nro Guia">
                  <input
                    value={draft.nroGuia}
                    onChange={(event) => setDraft((prev) => ({ ...prev, nroGuia: event.target.value }))}
                    style={styles.input}
                  />
                </Field>
                <Field label="Ubigeo">
                  <UbigeoTypeahead
                    options={ubigeoOptions}
                    selectedId={draft.idUbigeo}
                    onSelect={(value, label) =>
                      setDraft((prev) => ({
                        ...prev,
                        idUbigeo: value,
                        detalleUbigeo: prev.detalleUbigeo || label,
                      }))
                    }
                  />
                </Field>
                <Field label="Fecha salida">
                  <input
                    type="date"
                    value={draft.fechaSalida}
                    onChange={(event) => setDraft((prev) => ({ ...prev, fechaSalida: event.target.value }))}
                    style={styles.input}
                  />
                </Field>
                <Field label="Fecha llegada">
                  <input
                    type="date"
                    value={draft.fechaLlegada}
                    onChange={(event) => setDraft((prev) => ({ ...prev, fechaLlegada: event.target.value }))}
                    style={styles.input}
                  />
                </Field>
                <Field label="Responsable">
                  <ConstanteTypeahead
                    options={responsables}
                    selectedId={draft.idResponsable}
                    onSelect={(value) => setDraft((prev) => ({ ...prev, idResponsable: value }))}
                  />
                </Field>
                <Field label="Fecha recojo">
                  <input
                    type="date"
                    value={draft.fechaRecojo}
                    onChange={(event) => setDraft((prev) => ({ ...prev, fechaRecojo: event.target.value }))}
                    style={styles.input}
                  />
                </Field>
                <Field label="Responsable recojo">
                  <ConstanteTypeahead
                    options={responsables}
                    selectedId={draft.idResponsableRecojo}
                    onSelect={(value) => setDraft((prev) => ({ ...prev, idResponsableRecojo: value }))}
                  />
                </Field>
                <Field label="Ruta imagen guia">
                  <input
                    value={draft.rutaImagenGuia}
                    onChange={(event) => setDraft((prev) => ({ ...prev, rutaImagenGuia: event.target.value }))}
                    style={styles.input}
                  />
                </Field>
              </div>

              <Field label="Detalle ubigeo">
                <textarea
                  value={draft.detalleUbigeo}
                  onChange={(event) => setDraft((prev) => ({ ...prev, detalleUbigeo: event.target.value }))}
                  style={styles.textarea}
                />
              </Field>

              <Field label="Observacion">
                <textarea
                  value={draft.observacion}
                  onChange={(event) => setDraft((prev) => ({ ...prev, observacion: event.target.value }))}
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

const ConstanteTypeahead = React.memo(function ConstanteTypeahead({
  options,
  selectedId,
  onSelect,
}: {
  options: ConstanteOption[];
  selectedId: string;
  onSelect: (value: string) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);

  const selectedOption = useMemo(
    () => options.find((option) => String(option.codigo || option.value) === selectedId) ?? null,
    [options, selectedId]
  );

  useEffect(() => {
    setInputValue(selectedOption?.label ?? "");
  }, [selectedOption]);

  const filteredOptions = useMemo(() => {
    const query = inputValue.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => option.label.toLowerCase().includes(query));
  }, [inputValue, options]);

  const applySelection = (option: ConstanteOption) => {
    const value = String(option.codigo || option.value);
    onSelect(value);
    setInputValue(option.label);
    setShowDropdown(false);
    setHighlightedIdx(-1);
  };

  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        value={inputValue}
        onChange={(event) => {
          setInputValue(event.target.value);
          setShowDropdown(true);
          setHighlightedIdx(-1);
          if (selectedId) onSelect("");
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 120)}
        onKeyDown={(event) => {
          if (filteredOptions.length === 0) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setShowDropdown(true);
            setHighlightedIdx((idx) => Math.min(idx + 1, filteredOptions.length - 1));
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setShowDropdown(true);
            setHighlightedIdx((idx) => Math.max(idx - 1, 0));
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            const targetOption =
              highlightedIdx >= 0 ? filteredOptions[highlightedIdx] : filteredOptions[0];
            if (targetOption) {
              applySelection(targetOption);
            }
          }
        }}
        style={styles.input}
      />
      {showDropdown && filteredOptions.length > 0 ? (
        <div style={styles.typeaheadMenu}>
          {filteredOptions.map((option, idx) => (
            <div
              key={`constante-${option.codigo || option.value || idx}`}
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

const UbigeoTypeahead = React.memo(function UbigeoTypeahead({
  options,
  selectedId,
  onSelect,
}: {
  options: UbigeoOption[];
  selectedId: string;
  onSelect: (value: string, label: string) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);

  const selectedOption = useMemo(
    () => options.find((option) => String(option.idUbigeo) === selectedId) ?? null,
    [options, selectedId]
  );

  useEffect(() => {
    setInputValue(selectedOption?.nombreUbigeo ?? "");
  }, [selectedOption]);

  const filteredOptions = useMemo(() => {
    const query = inputValue.trim().toLowerCase();
    if (!query) return options.slice(0, 50);
    return options.filter((option) => option.nombreUbigeo.toLowerCase().includes(query)).slice(0, 50);
  }, [inputValue, options]);

  const applySelection = (option: UbigeoOption) => {
    onSelect(String(option.idUbigeo), option.nombreUbigeo);
    setInputValue(option.nombreUbigeo);
    setShowDropdown(false);
    setHighlightedIdx(-1);
  };

  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        value={inputValue}
        onChange={(event) => {
          setInputValue(event.target.value);
          setShowDropdown(true);
          setHighlightedIdx(-1);
          if (selectedId) onSelect("", "");
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 120)}
        onKeyDown={(event) => {
          if (filteredOptions.length === 0) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setShowDropdown(true);
            setHighlightedIdx((idx) => Math.min(idx + 1, filteredOptions.length - 1));
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setShowDropdown(true);
            setHighlightedIdx((idx) => Math.max(idx - 1, 0));
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            const targetOption =
              highlightedIdx >= 0 ? filteredOptions[highlightedIdx] : filteredOptions[0];
            if (targetOption) {
              applySelection(targetOption);
            }
          }
        }}
        style={styles.input}
      />
      {showDropdown && filteredOptions.length > 0 ? (
        <div style={styles.typeaheadMenu}>
          {filteredOptions.map((option, idx) => (
            <div
              key={`ubigeo-${option.idUbigeo}`}
              style={{
                ...styles.typeaheadItem,
                background: idx === highlightedIdx ? "#e6f7ff" : undefined,
              }}
              onMouseDown={() => applySelection(option)}
            >
              {option.nombreUbigeo}
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
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 2200,
    tableLayout: "fixed",
  },
  th: {
    position: "relative",
    textAlign: "left",
    padding: "7px 10px",
    borderBottom: "1px solid #E2E8F0",
    background: "#F8FAFC",
    fontSize: 12,
    color: "#334155",
    whiteSpace: "nowrap",
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
