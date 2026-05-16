import React, { useEffect, useMemo, useRef, useState } from "react";
import CrudToolbar, {
  matchesCrudToolbarSearch,
  type CrudToolbarSearchField,
} from "../../../components/base/CrudToolbar";
import { FiltroOperativoLookup } from "../../../components/lookups/FiltroOperativoLookup";
import {
  actualizarLogisticaSuministro,
  buscarLogisticaSuministro,
  insertarLogisticaSuministro,
  uploadImagenLogisticaSuministro,
} from "../../../api/logisticaSuministroService";
import { listarSolicitanteOptions } from "../../../api/solicitanteService";
import { useConstantesPorCampo } from "../../../hooks/useConstantesPorCampo";
import type { ConstanteOption } from "../../../models/constante";
import type { FiltroOperativoValue } from "../../../models/filtroOperativo";
import type {
  LogisticaSuministroBuscarRequest,
  LogisticaSuministroDto,
  LogisticaSuministroInsertRequest,
  LogisticaSuministroUpdateRequest,
} from "../../../models/logisticaSuministro";
import { getAuthUser } from "../../../utils/authStorage";
import { getHttpErrorMessage } from "../../../utils/httpError";
import { compressImageForUpload } from "../../../utils/imageCompression";

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
  tipoTrabajo: string;
};

type SuministroDraft = {
  filtroOperativo: FiltroOperativoValue;
  correlativo: string;
  tipoTrabajo: string;
  nombreCliente: string;
  nombreProyecto: string;
  nombreSite: string;
  fechaInicio: string;
  idAprobador: string;
  comentario: string;
  monto: string;
  idMoneda: string;
  imagenUrl: string;
  imagenPath: string;
  esActivo: boolean | null;
  usuarioCreacion: string;
  fechaCreacion: string;
  usuarioActualizacion: string;
  fechaActualizacion: string;
};

const SHAREPOINT_URL = "https://cjtelecom.sharepoint.com/sites/CJ-PROYECTOS/";

const createInitialFilters = (): HeaderFilterState => ({
  lookup: {},
  correlativo: "",
  tipoTrabajo: "",
});

function getTodayDateInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const createEmptyDraft = (): SuministroDraft => {
  const today = getTodayDateInputValue();
  return {
    filtroOperativo: {},
    correlativo: "",
    tipoTrabajo: "",
    nombreCliente: "",
    nombreProyecto: "",
    nombreSite: "",
    fechaInicio: today,
    idAprobador: "",
    comentario: "",
    monto: "",
    idMoneda: "",
    imagenUrl: "",
    imagenPath: "",
    esActivo: null,
    usuarioCreacion: "",
    fechaCreacion: today,
    usuarioActualizacion: "",
    fechaActualizacion: today,
  };
};

const columns = [
  { key: "acciones", label: "Acciones", width: "110px" },
  { key: "idProvisional", label: "IdProvisional", width: "110px" },
  { key: "nombreCliente", label: "Cliente", width: "190px" },
  { key: "nombreProyecto", label: "Proyecto", width: "190px" },
  { key: "nombreSite", label: "Site", width: "190px" },
  { key: "tipoTrabajo", label: "Tipo trabajo", width: "180px" },
  { key: "fechaInicio", label: "Fecha inicio", width: "140px" },
  { key: "aprobador", label: "Aprobador", width: "220px" },
  { key: "imgSustento", label: "ImgSustento", width: "220px" },
  { key: "comentario", label: "Comentario", width: "220px" },
  { key: "monto", label: "Monto", width: "120px" },
  { key: "moneda", label: "Moneda", width: "120px" },
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

function toPositiveNumber(...values: Array<string | number | null | undefined>) {
  for (const value of values) {
    if (value == null) continue;
    const parsed = Number(String(value).trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString("es-PE");
}

function normalizeDateForInput(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value).slice(0, 10);
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeColumnValue(value: unknown) {
  return String(value ?? "").trim();
}

function matchesColumnFilterValue(value: unknown, selectedValues: string[]) {
  if (!selectedValues.length) return true;
  return selectedValues.includes(normalizeColumnValue(value));
}

function getConstanteStoredValue(option: ConstanteOption) {
  return option.codigo || option.value || option.valor || option.label;
}

function findConstanteOption(options: ConstanteOption[], selectedValue?: string | null) {
  const normalized = selectedValue?.trim();
  if (!normalized) return undefined;

  return options.find((option) =>
    [option.codigo, option.value, option.valor, option.label].some((value) => value?.trim() === normalized)
  );
}

function getConstanteLabel(options: ConstanteOption[], selectedValue?: string | null) {
  return findConstanteOption(options, selectedValue)?.label ?? "";
}

function getImageDisplayPath(path?: string | null, url?: string | null) {
  const resolved = url?.trim() || path?.trim() || "";
  if (!resolved) return "";
  if (resolved.startsWith("http")) return resolved;
  return `${SHAREPOINT_URL}${resolved.replace(/^\/+/, "")}`;
}

function buildDraftFromRow(item: LogisticaSuministroDto): SuministroDraft {
  return {
    filtroOperativo: {
      filtro:
        item.idCliente && item.idProyecto && item.idSite && item.correlativo != null
          ? {
              filtroKey: `${item.idCliente}|${item.idProyecto}|${item.idSite}|${item.correlativo ?? 0}`,
              idCliente: item.idCliente,
              idProyecto: item.idProyecto,
              idSite: item.idSite,
              correlativo: item.correlativo,
              nroInterno: item.correlativo,
              nombreCliente: item.nombreCliente || "",
              nombreProyecto: item.nombreProyecto || "",
              nombreSite: item.nombreSite || "",
              tipoTrabajo: item.tipoTrabajo || "",
              ot: item.ot || "",
              fecAsignacion: null,
            }
          : undefined,
      tipoTrabajo: item.tipoTrabajo ? { tipoTrabajo: item.tipoTrabajo } : undefined,
      ot: item.ot ? { ot: item.ot, fecAsignacion: null } : undefined,
      tarea:
        item.idTarea != null
          ? { correlativo: item.idTarea, tarea: item.tarea || "" }
          : item.tarea
            ? { correlativo: 0, tarea: item.tarea }
            : undefined,
    },
    correlativo: item.correlativo ? String(item.correlativo) : "",
    tipoTrabajo: item.tipoTrabajo || "",
    nombreCliente: item.nombreCliente || "",
    nombreProyecto: item.nombreProyecto || "",
    nombreSite: item.nombreSite || "",
    fechaInicio: normalizeDateForInput(item.fechaInicio) || getTodayDateInputValue(),
    idAprobador: item.idAprobador ? String(item.idAprobador) : "",
    comentario: item.comentario || "",
    monto: item.monto != null ? String(item.monto) : "",
    idMoneda: item.idMoneda != null ? String(item.idMoneda) : item.moneda || "",
    imagenUrl: item.imagenUrl || "",
    imagenPath: item.imagenPath || "",
    esActivo: item.esActivo ?? null,
    usuarioCreacion: item.usuarioCreacion || "",
    fechaCreacion: normalizeDateForInput(item.fechaCreacion) || getTodayDateInputValue(),
    usuarioActualizacion: item.usuarioActualizacion || "",
    fechaActualizacion: normalizeDateForInput(item.fechaActualizacion) || getTodayDateInputValue(),
  };
}

export default function SuministroPage() {
  const authUser = getAuthUser();
  const idCargo = toPositiveNumber(authUser?.idCargo, authUser?.idrol);
  const idEmpleado = toPositiveNumber(authUser?.idEmpleado, authUser?.codEmp);

  const [rows, setRows] = useState<LogisticaSuministroDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filters, setFilters] = useState<HeaderFilterState>(createInitialFilters);
  const [busqueda, setBusqueda] = useState("");
  const [draft, setDraft] = useState<SuministroDraft>(createEmptyDraft);
  const [panelOpen, setPanelOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [filtrosColumnas, setFiltrosColumnas] = useState<Record<string, string[]>>({});
  const [columnaFiltroAbierta, setColumnaFiltroAbierta] = useState<string | null>(null);
  const [filtroBusqueda, setFiltroBusqueda] = useState("");
  const [aprobadorOptions, setAprobadorOptions] = useState<ConstanteOption[]>([]);
  const [aprobadorLoading, setAprobadorLoading] = useState(false);
  const [aprobadorError, setAprobadorError] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState("");
  const [showImageViewer, setShowImageViewer] = useState(false);
  const filtroColumnaMenuRef = useRef<HTMLDivElement>(null);
  const lookupInputRef = useRef<HTMLInputElement | null>(null);
  const imagenInputRef = useRef<HTMLInputElement | null>(null);

  const { constantesPorCampo } = useConstantesPorCampo(["tipo_moneda"]);
  const monedaOptions = constantesPorCampo.tipo_moneda ?? [];
  const imageDisplayPath = getImageDisplayPath(draft.imagenPath, draft.imagenUrl);

  useEffect(() => {
    let activo = true;

    setAprobadorLoading(true);
    setAprobadorError("");

    listarSolicitanteOptions({
      idCargo: idCargo > 0 ? idCargo : null,
      idEmpleado: idEmpleado > 0 ? idEmpleado : null,
    })
      .then((data) => {
        if (!activo) return;
        setAprobadorOptions(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!activo) return;
        setAprobadorOptions([]);
        setAprobadorError("No se pudo cargar el combo de aprobadores.");
      })
      .finally(() => {
        if (!activo) return;
        setAprobadorLoading(false);
      });

    return () => {
      activo = false;
    };
  }, [idCargo, idEmpleado]);

  useEffect(() => {
    const filtro = draft.filtroOperativo.filtro;
    if (!filtro) return;

    setDraft((prev) => ({
      ...prev,
      correlativo: filtro.correlativo ? String(filtro.correlativo) : prev.correlativo,
      nombreCliente: filtro.nombreCliente || "",
      nombreProyecto: filtro.nombreProyecto || "",
      nombreSite: filtro.nombreSite || "",
      tipoTrabajo: prev.tipoTrabajo || filtro.tipoTrabajo || "",
    }));
  }, [draft.filtroOperativo.filtro]);

  const loadData = async (request?: Partial<LogisticaSuministroBuscarRequest>) => {
    setLoading(true);
    setError("");

    try {
      const payload: LogisticaSuministroBuscarRequest = {
        idProvisional: request?.idProvisional ?? null,
        idCliente: request?.idCliente ?? filters.lookup.filtro?.idCliente ?? null,
        idProyecto: request?.idProyecto ?? filters.lookup.filtro?.idProyecto ?? null,
      };

      const data = await buscarLogisticaSuministro(payload);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo cargar la lista de suministros."));
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

  const searchFields = useMemo<CrudToolbarSearchField<LogisticaSuministroDto>[]>(
    () => [
      { key: "idProvisional", label: "IdProvisional", getValue: (item) => item.idSuministroProvisional },
      { key: "nombreCliente", label: "Cliente", getValue: (item) => item.nombreCliente },
      { key: "nombreProyecto", label: "Proyecto", getValue: (item) => item.nombreProyecto },
      { key: "nombreSite", label: "Site", getValue: (item) => item.nombreSite },
      { key: "tipoTrabajo", label: "TipoTrabajo", getValue: (item) => item.tipoTrabajo },
      { key: "fechaInicio", label: "FechaInicio", getValue: (item) => item.fechaInicio },
      { key: "aprobador", label: "Aprobador", getValue: (item) => item.aprobador },
      { key: "imgSustento", label: "ImgSustento", getValue: (item) => item.imagenPath || item.imagenUrl },
      { key: "comentario", label: "Comentario", getValue: (item) => item.comentario },
      { key: "monto", label: "Monto", getValue: (item) => item.monto },
      { key: "moneda", label: "Moneda", getValue: (item) => item.moneda },
    ],
    []
  );

  const getColumnValue = (item: LogisticaSuministroDto, key: string) => {
    switch (key) {
      case "idProvisional":
        return String(item.idSuministroProvisional ?? item.idSuministro ?? "");
      case "fechaInicio":
      case "fechaCreacion":
      case "fechaActualizacion":
      case "fechaEliminacion":
        return formatDate((item as Record<string, string | null | undefined>)[key]);
      case "imgSustento":
        return getImageDisplayPath(item.imagenPath, item.imagenUrl);
      case "monto":
        return item.monto == null ? "" : String(item.monto);
      case "esActivo":
        return item.esActivo == null ? "" : item.esActivo ? "Activo" : "Inactivo";
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
    setPanelOpen(true);
    setMessage("");
    setImageUploadError("");
    setShowImageViewer(false);
    setTimeout(() => lookupInputRef.current?.focus(), 0);
  };

  const handleEditar = (row: LogisticaSuministroDto) => {
    setDraft(buildDraftFromRow(row));
    setIsEditMode(true);
    setPanelOpen(true);
    setMessage("");
    setImageUploadError("");
    setShowImageViewer(false);
  };

  const handleImageSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setUploadingImage(true);
    setImageUploadError("");

    try {
      const optimizedFile = await compressImageForUpload(file);
      const response = await uploadImagenLogisticaSuministro(optimizedFile, {
        correlativo: draft.correlativo,
        idSite: draft.filtroOperativo.filtro?.idSite,
        comentario: draft.comentario,
      });

      setDraft((prev) => ({
        ...prev,
        imagenUrl: response.fileUrl || "",
        imagenPath: response.storagePath || response.fileUrl || "",
      }));
    } catch (err) {
      setImageUploadError(getHttpErrorMessage(err, "No se pudo cargar la imagen en SharePoint."));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleGuardar = async () => {
    setError("");
    setMessage("");

    const filtro = draft.filtroOperativo.filtro;
    const correlativo = toNumber(draft.correlativo || filtro?.correlativo);
    const monto = draft.monto.trim() ? Number(draft.monto) : null;

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

    if (draft.monto.trim() && (!Number.isFinite(monto) || (monto ?? 0) < 0)) {
      setError("Monto invalido.");
      return;
    }

    setSaving(true);
    try {
      const resolvedTipoTrabajo =
        draft.tipoTrabajo.trim() || draft.filtroOperativo.tipoTrabajo?.tipoTrabajo?.trim() || null;
      const resolvedOt = draft.filtroOperativo.ot?.ot?.trim() || null;
      const resolvedIdTarea =
        draft.filtroOperativo.tarea?.correlativo && draft.filtroOperativo.tarea.correlativo > 0
          ? draft.filtroOperativo.tarea.correlativo
          : null;
      const resolvedIdMoneda = toNumber(draft.idMoneda) > 0 ? toNumber(draft.idMoneda) : null;

      if (isEditMode) {
        const updatePayload: LogisticaSuministroUpdateRequest = {
          idCliente: filtro.idCliente,
          idProyecto: filtro.idProyecto,
          idSite: filtro.idSite,
          correlativo: correlativo > 0 ? correlativo : null,
          tipoTrabajo: resolvedTipoTrabajo,
          ot: resolvedOt,
          idTarea: resolvedIdTarea,
          fechaInicio: draft.fechaInicio || null,
          idAprobador: toNumber(draft.idAprobador) > 0 ? toNumber(draft.idAprobador) : null,
          comentario: draft.comentario.trim() || null,
          monto,
          idMoneda: resolvedIdMoneda,
          imagenUrl: draft.imagenUrl || null,
          imagenPath: draft.imagenPath || null,
        };

        await actualizarLogisticaSuministro(updatePayload);
        setMessage("Suministro actualizado correctamente.");
      } else {
        const insertPayload: LogisticaSuministroInsertRequest = {
          idCliente: filtro.idCliente,
          idProyecto: filtro.idProyecto,
          idSite: filtro.idSite,
          correlativo: correlativo > 0 ? correlativo : null,
          tipoTrabajo: resolvedTipoTrabajo,
          ot: resolvedOt,
          idTarea: resolvedIdTarea,
          fechaInicio: draft.fechaInicio || null,
          idAprobador: toNumber(draft.idAprobador) > 0 ? toNumber(draft.idAprobador) : null,
          comentario: draft.comentario.trim() || null,
          monto,
          idMoneda: resolvedIdMoneda,
          imagenUrl: draft.imagenUrl || null,
          imagenPath: draft.imagenPath || null,
        };

        await insertarLogisticaSuministro(insertPayload);
        setMessage("Suministro registrado correctamente.");
      }

      setPanelOpen(false);
      setDraft(createEmptyDraft());
      await loadData();
    } catch (err) {
      setError(getHttpErrorMessage(err, isEditMode
        ? "No se pudo actualizar el suministro."
        : "No se pudo registrar el suministro."));
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
            <h2 style={styles.sectionTitle}>Suministro logistico</h2>
            <p style={styles.sectionText}>
              Consulta, alta y actualizacion de suministro provisional siguiendo el patron operativo actual.
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
                void loadData({
                  idProvisional: null,
                  idCliente: null,
                  idProyecto: null,
                });
              }}
            >
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

        {/* Filtros eliminados por requerimiento */}
      </section>

      <section style={styles.card}>
        <div style={styles.segmentHeader}>
          <div>
            <h3 style={styles.subTitle}>Suministros encontrados</h3>
            <p style={styles.sectionText}>Listado principal con filtros por columna y acceso directo a edicion.</p>
          </div>
          <div style={styles.counterPill}>{filteredRows.length} registros</div>
        </div>

        <CrudToolbar
          searchPlaceholder="Buscar suministro..."
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
              {loading ? (
                <tr>
                  <td colSpan={columns.length} style={styles.emptyCell}>Cargando suministros...</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} style={styles.emptyCell}>No hay datos para mostrar.</td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={`${row.idSuministro ?? row.correlativo ?? "sin-id"}-${row.idSite ?? "sin-site"}`} style={styles.tr}>
                    <td style={styles.td}>
                      <button type="button" style={styles.smallActionButton} onClick={() => handleEditar(row)}>
                        Editar
                      </button>
                    </td>
                    {columns.filter((item) => item.key !== "acciones").map((column) => (
                      <td key={`${row.correlativo ?? "sin-correlativo"}-${column.key}`} style={styles.td}>
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
                  {isEditMode ? `Editar suministro #${draft.correlativo || "-"}` : "Nuevo suministro"}
                </h2>
                <p style={styles.sectionText}>
                  {isEditMode
                    ? "Actualizacion del suministro provisional con el store dedicado."
                    : "Registro de nuevo suministro provisional para el cliente."}
                </p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" style={styles.secondaryButton} onClick={() => setPanelOpen(false)}>
                  Cerrar
                </button>
                <button type="button" style={styles.primaryButton} onClick={() => void handleGuardar()} disabled={saving}>
                  {isEditMode ? (saving ? "Actualizando..." : "Actualizar") : saving ? "Guardando..." : "Guardar"}
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
              </div>

              <div style={styles.formGrid}>
                <Field label="Fecha inicio">
                  <input
                    type="date"
                    value={draft.fechaInicio}
                    onChange={(event) => setDraft((prev) => ({ ...prev, fechaInicio: event.target.value }))}
                    style={styles.input}
                  />
                </Field>
                <Field label="IdAprobador">
                  <select
                    value={draft.idAprobador}
                    onChange={(event) => setDraft((prev) => ({ ...prev, idAprobador: event.target.value }))}
                    style={styles.input}
                    disabled={aprobadorLoading}
                  >
                    <option value="">{aprobadorLoading ? "Cargando..." : "Seleccione"}</option>
                    {aprobadorOptions.map((option, index) => (
                      <option key={`aprobador-${getConstanteStoredValue(option)}-${index}`} value={getConstanteStoredValue(option)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Monto">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.monto}
                    onChange={(event) => setDraft((prev) => ({ ...prev, monto: event.target.value }))}
                    style={styles.input}
                  />
                </Field>
                <Field label="IdMoneda">
                  <select
                    value={draft.idMoneda}
                    onChange={(event) => setDraft((prev) => ({ ...prev, idMoneda: event.target.value }))}
                    style={styles.input}
                  >
                    <option value="">{monedaOptions.length === 0 ? "Cargando..." : "Seleccione"}</option>
                    {monedaOptions.map((option, index) => (
                      <option key={`moneda-${getConstanteStoredValue(option)}-${index}`} value={getConstanteStoredValue(option)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Comentario">
                  <textarea
                    value={draft.comentario}
                    onChange={(event) => setDraft((prev) => ({ ...prev, comentario: event.target.value }))}
                    style={styles.textarea}
                    rows={4}
                  />
                </Field>
                <Field label="Imagen">
                  <div style={styles.uploadWrap}>
                    <input
                      ref={imagenInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(event) => void handleImageSelected(event)}
                      style={{ display: "none" }}
                    />
                    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                      <button
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: uploadingImage ? "wait" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          height: 36,
                          opacity: uploadingImage ? 0.7 : 1,
                        }}
                        title="Cargar imagen"
                        type="button"
                        disabled={uploadingImage}
                        onClick={() => imagenInputRef.current?.click()}
                      >
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <rect x="4" y="3" width="16" height="18" rx="2" fill="#6E4CCB"/>
                          <rect x="7" y="7" width="10" height="2" rx="1" fill="#fff"/>
                          <rect x="7" y="11" width="10" height="2" rx="1" fill="#fff"/>
                          <rect x="7" y="15" width="6" height="2" rx="1" fill="#fff"/>
                        </svg>
                      </button>
                      <div
                        style={{
                          minWidth: 0,
                          fontSize: 11,
                          color: imageDisplayPath ? "#374151" : "#6B7280",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          cursor: imageDisplayPath ? "pointer" : "default",
                          textDecoration: imageDisplayPath ? "underline" : "none",
                        }}
                        title={imageDisplayPath || "Sin factura cargada"}
                        onClick={() => {
                          if (imageDisplayPath) setShowImageViewer(true);
                        }}
                      >
                        {uploadingImage
                          ? "Cargando imagen en SharePoint..."
                          : imageDisplayPath || "Sin factura cargada"}
                      </div>
                    </div>
                    {showImageViewer && imageDisplayPath ? (
                      <div
                        style={styles.viewerOverlay}
                        onClick={() => setShowImageViewer(false)}
                      >
                        <div
                          style={styles.viewerCard}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            style={styles.viewerCloseButton}
                            onClick={() => setShowImageViewer(false)}
                            title="Cerrar"
                          >
                            x
                          </button>
                          <img src={imageDisplayPath} alt="Imagen adjunta" style={styles.viewerImage} />
                        </div>
                      </div>
                    ) : null}
                    {imageUploadError ? <span style={styles.errorText}>{imageUploadError}</span> : null}
                  </div>
                </Field>
              </div>

              {aprobadorError ? <span style={styles.errorText}>{aprobadorError}</span> : null}
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
  textarea: {
    width: "100%",
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    padding: "10px",
    fontSize: 12,
    background: "#FFFFFF",
    boxSizing: "border-box",
    resize: "vertical",
    minHeight: 88,
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
    minWidth: 1650,
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
    width: 920,
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
  uploadWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
  },
  errorText: {
    fontSize: 12,
    color: "#DC2626",
    fontWeight: 600,
  },
  viewerOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.60)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4000,
  },
  viewerCard: {
    background: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    maxWidth: "90vw",
    maxHeight: "90vh",
    boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerCloseButton: {
    position: "absolute",
    top: 8,
    right: 8,
    background: "#F3F4F6",
    border: "none",
    borderRadius: 6,
    width: 32,
    height: 32,
    fontSize: 20,
    fontWeight: 700,
    color: "#17143A",
    cursor: "pointer",
    zIndex: 2,
  },
  viewerImage: {
    maxWidth: "80vw",
    maxHeight: "80vh",
    borderRadius: 8,
    boxShadow: "0 2px 12px rgba(0,0,0,0.10)",
  },
};
