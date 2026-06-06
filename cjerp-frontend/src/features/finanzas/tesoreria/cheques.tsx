import React, { useEffect, useMemo, useState } from "react";
import { Ban, Pencil, Plus } from "lucide-react";
import CrudToolbar, {
  matchesCrudToolbarSearch,
  type CrudToolbarSearchField,
} from "../../../components/base/CrudToolbar";
import SidePanelForm from "../../../components/base/SidePanelForm";
import {
  actualizarCheque,
  crearCheque,
  listarCheques,
  obtenerCheque,
  rechazarCheque,
  subirImagenCheque,
} from "../../../api/chequeService";
import { listarEmpleadosCta } from "../../../api/empleadoService";
import { useConstantesPorCampo } from "../../../hooks/useConstantesPorCampo";
import type { ConstanteOption } from "../../../models/constante";
import type { EmpleadoCta } from "../../../models/empleadoCta";
import type { ChequeGuardarRequest, ChequeRow } from "../../../models/cheque";
import { getAuthUser } from "../../../utils/authStorage";
import { getHttpErrorMessage } from "../../../utils/httpError";
import { compressImageForUpload } from "../../../utils/imageCompression";
import { buildSharePointUrl } from "../../../utils/sharepoint";

type SortKey =
  | "fechaCheque"
  | "nroCheque"
  | "empleado"
  | "banco"
  | "importe"
  | "moneda"
  | "estado";

type SortState = {
  key: SortKey;
  direction: "asc" | "desc";
};

type FormState = {
  idCheque: number | null;
  idEmpleado: string;
  idBanco: string;
  fechaCheque: string;
  nroCheque: string;
  importe: string;
  idMoneda: string;
  idEstado: string;
  ruta: string;
};

type FilterState = {
  idEmpleado: string;
  idEstado: string;
};

type RejectModalState = {
  row: ChequeRow;
  observacion: string;
  error: string | null;
  submitting: boolean;
} | null;

type ImageViewerState = {
  title: string;
  url: string;
} | null;

const initialForm: FormState = {
  idCheque: null,
  idEmpleado: "",
  idBanco: "",
  fechaCheque: "",
  nroCheque: "",
  importe: "",
  idMoneda: "",
  idEstado: "",
  ruta: "",
};

const initialFilters: FilterState = {
  idEmpleado: "",
  idEstado: "",
};

function normalizeOptionValue(option: ConstanteOption): string {
  return String(option.value || option.valor || option.codigo || "").trim();
}

function findConstanteOption(options: ConstanteOption[], selectedValue?: string | null) {
  const normalized = String(selectedValue ?? "").trim();
  if (!normalized) return undefined;

  return options.find((option) => {
    const stored = normalizeOptionValue(option);
    return stored === normalized || option.codigo === normalized || option.label === normalized;
  });
}

function getConstanteLabel(options: ConstanteOption[], value?: string | number | null) {
  const match = findConstanteOption(options, value == null ? "" : String(value));
  return match?.label ?? String(value ?? "");
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-PE");
}

function formatDateTime(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("es-PE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value?: number | null) {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return amount.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildFormFromRow(row: ChequeRow): FormState {
  return {
    idCheque: row.idCheque,
    idEmpleado: row.idEmpleado ? String(row.idEmpleado) : "",
    idBanco: row.idBanco ? String(row.idBanco) : "",
    fechaCheque: row.fechaCheque ? String(row.fechaCheque).slice(0, 10) : "",
    nroCheque: row.nroCheque ?? "",
    importe: row.importe != null ? String(row.importe) : "",
    idMoneda: row.idMoneda ? String(row.idMoneda) : "",
    idEstado: row.idEstado != null ? String(row.idEstado) : "",
    ruta: row.ruta ?? "",
  };
}

function resolveUserName() {
  const user = getAuthUser();
  return (
    user?.usuario ||
    user?.userName ||
    user?.username ||
    user?.nombre ||
    user?.nombreEmpleado ||
    "sistema"
  );
}

function buildPayload(form: FormState): ChequeGuardarRequest {
  return {
    idCheque: form.idCheque,
    idEmpleado: toNumber(form.idEmpleado),
    idBanco: toNumber(form.idBanco),
    fechaCheque: form.fechaCheque,
    nroCheque: form.nroCheque.trim(),
    importe: Number(form.importe),
    idMoneda: toNumber(form.idMoneda),
    idEstado: toNumber(form.idEstado),
    ruta: form.ruta.trim() || null,
    usuarioAccion: resolveUserName(),
  };
}

function resolveRejectStateId(options: ConstanteOption[]) {
  const explicitMatch = options.find((option) =>
    option.label.toLowerCase().includes("rechaz")
  );

  if (explicitMatch) {
    return toNumber(normalizeOptionValue(explicitMatch));
  }

  return 0;
}

function getPageTitle() {
  return "Tesoreria / Cheques";
}

export default function TesoreriaChequesPage() {
  const [rows, setRows] = useState<ChequeRow[]>([]);
  const [empleados, setEmpleados] = useState<EmpleadoCta[]>([]);
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "fechaCheque", direction: "desc" });
  const [loading, setLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelLoading, setPanelLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<RejectModalState>(null);
  const [imageViewer, setImageViewer] = useState<ImageViewerState>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadImageError, setUploadImageError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const archivoRutaInputRef = React.useRef<HTMLInputElement | null>(null);

  const camposConstantes = useMemo(
    () => ["tipo_moneda", "estado_cheque", "tipo_estado"],
    []
  );
  const { constantesPorCampo } = useConstantesPorCampo(camposConstantes);
  const monedaOptions = constantesPorCampo.tipo_moneda ?? [];
  const estadoOptions =
    constantesPorCampo.estado_cheque?.length
      ? constantesPorCampo.estado_cheque
      : constantesPorCampo.tipo_estado ?? [];

  const empleadosUnicos = useMemo(() => {
    const map = new Map<number, EmpleadoCta>();
    empleados.forEach((item) => {
      if (!map.has(item.idEmpleado)) {
        map.set(item.idEmpleado, item);
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      (a.nombreEmpleadoCJ || a.nombreEmpleado || "").localeCompare(
        b.nombreEmpleadoCJ || b.nombreEmpleado || "",
        "es"
      )
    );
  }, [empleados]);

  const bancosUnicos = useMemo(() => {
    const map = new Map<number, { id: number; nombre: string }>();
    empleados.forEach((item) => {
      if (item.idBancoCta != null && !map.has(item.idBancoCta)) {
        map.set(item.idBancoCta, {
          id: item.idBancoCta,
          nombre: item.nombreBanco || `Banco ${item.idBancoCta}`,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [empleados]);

  const employeeById = useMemo(() => {
    const map = new Map<number, EmpleadoCta>();
    empleadosUnicos.forEach((item) => {
      map.set(item.idEmpleado, item);
    });
    return map;
  }, [empleadosUnicos]);

  const bankById = useMemo(() => {
    const map = new Map<number, string>();
    bancosUnicos.forEach((item) => {
      map.set(item.id, item.nombre);
    });
    return map;
  }, [bancosUnicos]);

  const loadRows = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listarCheques({
        idEmpleado: filters.idEmpleado ? toNumber(filters.idEmpleado) : undefined,
        idEstado: filters.idEstado ? toNumber(filters.idEstado) : undefined,
      });
      setRows(data);
      setCurrentPage(1);
    } catch (err: unknown) {
      setError(getHttpErrorMessage(err, "No se pudo cargar la lista de cheques."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadCatalogs = async () => {
      try {
        const data = await listarEmpleadosCta();
        if (!cancelled) {
          setEmpleados(data);
        }
      } catch {
        if (!cancelled) {
          setEmpleados([]);
        }
      }
    };

    void loadCatalogs();

    return () => {
      cancelled = true;
    };
  }, []);

  const searchFields = useMemo<CrudToolbarSearchField<ChequeRow>[]>(() => {
    return [
      { key: "nroCheque", label: "Nro cheque", getValue: (item) => item.nroCheque },
      { key: "fechaCheque", label: "Fecha cheque", getValue: (item) => item.fechaCheque },
      {
        key: "empleado",
        label: "Empleado",
        getValue: (item) =>
          employeeById.get(item.idEmpleado)?.nombreEmpleadoCJ ||
          employeeById.get(item.idEmpleado)?.nombreEmpleado ||
          item.idEmpleado,
      },
      {
        key: "banco",
        label: "Banco",
        getValue: (item) => bankById.get(item.idBanco) || item.idBanco,
      },
      { key: "importe", label: "Importe", getValue: (item) => item.importe },
      {
        key: "moneda",
        label: "Moneda",
        getValue: (item) => getConstanteLabel(monedaOptions, item.idMoneda),
      },
      {
        key: "estado",
        label: "Estado",
        getValue: (item) => getConstanteLabel(estadoOptions, item.idEstado),
      },
      { key: "ruta", label: "Ruta", getValue: (item) => item.ruta },
    ];
  }, [bankById, employeeById, estadoOptions, monedaOptions]);

  const filteredRows = useMemo(() => {
    const data = rows.filter((row) => matchesCrudToolbarSearch(row, search, searchFields));

    data.sort((a, b) => {
      const getValue = (row: ChequeRow) => {
        switch (sort.key) {
          case "fechaCheque":
            return row.fechaCheque || "";
          case "nroCheque":
            return row.nroCheque || "";
          case "empleado":
            return (
              employeeById.get(row.idEmpleado)?.nombreEmpleadoCJ ||
              employeeById.get(row.idEmpleado)?.nombreEmpleado ||
              ""
            );
          case "banco":
            return bankById.get(row.idBanco) || "";
          case "importe":
            return row.importe || 0;
          case "moneda":
            return getConstanteLabel(monedaOptions, row.idMoneda);
          case "estado":
            return getConstanteLabel(estadoOptions, row.idEstado);
          default:
            return "";
        }
      };

      const left = getValue(a);
      const right = getValue(b);

      if (typeof left === "number" && typeof right === "number") {
        return sort.direction === "asc" ? left - right : right - left;
      }

      const result = String(left).localeCompare(String(right), "es", {
        numeric: true,
        sensitivity: "base",
      });
      return sort.direction === "asc" ? result : -result;
    });

    return data;
  }, [rows, search, searchFields, sort, employeeById, bankById, monedaOptions, estadoOptions]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedRows = filteredRows.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize
  );

  const stats = useMemo(
    () => ({
      total: rows.length,
      visibles: filteredRows.length,
      monto: filteredRows.reduce((acc, row) => acc + (row.importe || 0), 0),
    }),
    [filteredRows, rows.length]
  );

  const openCreatePanel = () => {
    setMessage(null);
    setFormError(null);
    setUploadImageError(null);
    setForm(initialForm);
    setPanelOpen(true);
  };

  const openEditPanel = async (idCheque: number) => {
    try {
      setPanelLoading(true);
      setMessage(null);
      setFormError(null);
      setUploadImageError(null);
      const row = await obtenerCheque(idCheque);
      setForm(buildFormFromRow(row));
      setPanelOpen(true);
    } catch (err: unknown) {
      setError(getHttpErrorMessage(err, "No se pudo cargar el cheque seleccionado."));
    } finally {
      setPanelLoading(false);
    }
  };

  const handleEmpleadoChange = (idEmpleado: string) => {
    const empleado = employeeById.get(toNumber(idEmpleado));
    setForm((prev) => ({
      ...prev,
      idEmpleado,
      idBanco:
        prev.idCheque && prev.idBanco
          ? prev.idBanco
          : empleado?.idBancoCta != null
            ? String(empleado.idBancoCta)
            : prev.idBanco,
    }));
  };

  const validateForm = () => {
    if (!form.idEmpleado) return "Seleccione el empleado.";
    if (!form.idBanco) return "Seleccione el banco.";
    if (!form.fechaCheque) return "Ingrese la fecha del cheque.";
    if (!form.nroCheque.trim()) return "Ingrese el numero de cheque.";
    if (!form.importe || Number(form.importe) <= 0) return "Ingrese un importe valido.";
    if (!form.idMoneda) return "Seleccione la moneda.";
    if (!form.idEstado && form.idEstado !== "0") return "Seleccione el estado.";
    return null;
  };

  const handleSave = async () => {
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    try {
      setSaving(true);
      setFormError(null);
      setError(null);

      const payload = buildPayload(form);
      if (form.idCheque) {
        await actualizarCheque(form.idCheque, payload);
        setMessage("Cheque actualizado correctamente.");
      } else {
        await crearCheque(payload);
        setMessage("Cheque registrado correctamente.");
      }

      setPanelOpen(false);
      setForm(initialForm);
      await loadRows();
    } catch (err: unknown) {
      setFormError(getHttpErrorMessage(err, "No se pudo guardar el cheque."));
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;

    if (!rejectModal.observacion.trim()) {
      setRejectModal((prev) =>
        prev ? { ...prev, error: "Ingrese la observacion del rechazo." } : prev
      );
      return;
    }

    try {
      setRejectModal((prev) => (prev ? { ...prev, submitting: true, error: null } : prev));
      setError(null);

      await rechazarCheque(rejectModal.row.idCheque, {
        idEstadoRechazado: resolveRejectStateId(estadoOptions),
        observacion: rejectModal.observacion.trim(),
        usuarioAccion: resolveUserName(),
      });

      setRejectModal(null);
      setMessage("Cheque rechazado correctamente.");
      await loadRows();
    } catch (err: unknown) {
      setRejectModal((prev) =>
        prev
          ? {
              ...prev,
              submitting: false,
              error: getHttpErrorMessage(err, "No se pudo rechazar el cheque."),
            }
          : prev
      );
    }
  };

  const getRutaVisualizacion = (ruta?: string | null) => {
    return buildSharePointUrl(ruta);
  };

  const abrirVistaImagen = (ruta?: string | null, title = "Imagen adjunta") => {
    const finalUrl = getRutaVisualizacion(ruta);
    if (!finalUrl) {
      return;
    }

    setImageViewer({ title, url: finalUrl });
  };

  const procesarRutaSeleccionada = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setUploadingImage(true);
    setUploadImageError(null);

    try {
      const optimizedFile = await compressImageForUpload(file);
      const formData = new FormData();
      formData.append("archivo", optimizedFile);

      if (form.idCheque) {
        formData.append("idCheque", String(form.idCheque));
      }

      if (form.nroCheque.trim()) {
        formData.append("nroCheque", form.nroCheque.trim());
      }

      if (form.idEmpleado) {
        formData.append("idEmpleado", form.idEmpleado);
      }

      const response = await subirImagenCheque(formData);
      setForm((prev) => ({
        ...prev,
        ruta: response.fileUrl || response.storagePath || "",
      }));
    } catch (err: unknown) {
      setUploadImageError(getHttpErrorMessage(err, "No se pudo cargar la imagen en SharePoint."));
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <section style={styles.page}>
      <div style={styles.headerBlock}>
        <div>
          <div style={styles.breadcrumb}>{getPageTitle()}</div>
          <h1 style={styles.title}>Cheques</h1>
          <p style={styles.subtitle}>
            Registro y seguimiento de cheques con auditoria automatica en creacion, edicion y rechazo.
          </p>
        </div>
        <div style={styles.statsRow}>
          <StatCard label="Total" value={String(stats.total)} />
          <StatCard label="Filtrados" value={String(stats.visibles)} />
          <StatCard label="Importe" value={formatMoney(stats.monto)} />
        </div>
      </div>

      <CrudToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar empleado, banco, numero de cheque, ruta o estado..."
        searchFieldsHint="Empleado, banco, numero de cheque, fecha, importe, moneda, estado y ruta"
        buttons={[
          {
            key: "nuevo",
            label: "Nuevo",
            onClick: openCreatePanel,
            icon: <Plus size={16} />,
          },
          {
            key: "limpiar",
            label: "Limpiar filtros",
            onClick: () => {
              setFilters(initialFilters);
              setSearch("");
              setCurrentPage(1);
            },
            variant: "secondary",
          },
          {
            key: "consultar",
            label: "Consultar",
            onClick: () => void loadRows(),
            variant: "secondary",
          },
        ]}
      >
        <div style={styles.toolbarCaptionWrap}>
          <span style={styles.toolbarTitle}>Consulta de cheques</span>
          <span style={styles.toolbarCaption}>
            Formato alineado al flujo de aprobar campo con acciones directas y panel lateral.
          </span>
        </div>
      </CrudToolbar>

      {error ? <div style={styles.errorBanner}>{error}</div> : null}
      {message ? <div style={styles.successBanner}>{message}</div> : null}

      <section style={styles.card}>
        <div style={styles.filterRow}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Empleado</label>
            <select
              value={filters.idEmpleado}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, idEmpleado: event.target.value }))
              }
              style={styles.input}
            >
              <option value="">Todos</option>
              {empleadosUnicos.map((item) => (
                <option key={`filter-emp-${item.idEmpleado}`} value={item.idEmpleado}>
                  {item.nombreEmpleadoCJ || item.nombreEmpleado}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Estado</label>
            <select
              value={filters.idEstado}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, idEstado: event.target.value }))
              }
              style={styles.input}
            >
              <option value="">Todos</option>
              {estadoOptions.map((option) => (
                <option
                  key={`filter-state-${normalizeOptionValue(option)}-${option.label}`}
                  value={normalizeOptionValue(option)}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, minWidth: 140 }}>Acciones</th>
                <SortableHeader label="Fecha cheque" sortKey="fechaCheque" sort={sort} setSort={setSort} />
                <SortableHeader label="Nro cheque" sortKey="nroCheque" sort={sort} setSort={setSort} />
                <SortableHeader label="Empleado" sortKey="empleado" sort={sort} setSort={setSort} />
                <SortableHeader label="Banco" sortKey="banco" sort={sort} setSort={setSort} />
                <SortableHeader label="Importe" sortKey="importe" sort={sort} setSort={setSort} />
                <SortableHeader label="Moneda" sortKey="moneda" sort={sort} setSort={setSort} />
                <SortableHeader label="Estado" sortKey="estado" sort={sort} setSort={setSort} />
                <th style={{ ...styles.th, minWidth: 220 }}>Ruta</th>
                <th style={{ ...styles.th, minWidth: 160 }}>F. creacion</th>
                <th style={{ ...styles.th, minWidth: 160 }}>F. modificacion</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td style={styles.emptyCell} colSpan={11}>
                    Cargando cheques...
                  </td>
                </tr>
              ) : pagedRows.length === 0 ? (
                <tr>
                  <td style={styles.emptyCell} colSpan={11}>
                    No hay registros para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                pagedRows.map((row) => {
                  const empleado = employeeById.get(row.idEmpleado);
                  return (
                    <tr key={row.idCheque}>
                      <td style={styles.td}>
                        <div style={styles.actionRow}>
                          <button
                            type="button"
                            style={styles.editButton}
                            title="Editar cheque"
                            onClick={() => void openEditPanel(row.idCheque)}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            style={styles.rejectButton}
                            title="Rechazar cheque"
                            onClick={() =>
                              setRejectModal({
                                row,
                                observacion: "",
                                error: null,
                                submitting: false,
                              })
                            }
                          >
                            <Ban size={14} />
                          </button>
                        </div>
                      </td>
                      <td style={styles.td}>{formatDate(row.fechaCheque)}</td>
                      <td style={styles.td}>{row.nroCheque}</td>
                      <td style={styles.td}>
                        {empleado?.nombreEmpleadoCJ || empleado?.nombreEmpleado || row.idEmpleado}
                      </td>
                      <td style={styles.td}>{bankById.get(row.idBanco) || row.idBanco}</td>
                      <td style={styles.td}>{formatMoney(row.importe)}</td>
                      <td style={styles.td}>{getConstanteLabel(monedaOptions, row.idMoneda)}</td>
                      <td style={styles.td}>{getConstanteLabel(estadoOptions, row.idEstado)}</td>
                      <td style={styles.td} title={row.ruta ?? ""}>
                        {row.ruta ? (
                          <button
                            type="button"
                            style={styles.linkButton}
                            onClick={() =>
                              abrirVistaImagen(row.ruta, `Cheque ${row.nroCheque || row.idCheque}`)
                            }
                          >
                            Ver imagen
                          </button>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td style={styles.td}>{formatDateTime(row.fechaCreacion)}</td>
                      <td style={styles.td}>{formatDateTime(row.fechaModificacion)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div style={styles.footerRow}>
          <span style={styles.footerText}>
            Mostrando {pagedRows.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1}-
            {Math.min(safeCurrentPage * pageSize, filteredRows.length)} de {filteredRows.length} registros
          </span>
          <div style={styles.paginationRow}>
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setCurrentPage(1);
              }}
              style={styles.pageSizeSelect}
            >
              <option value={10}>10 por pagina</option>
              <option value={20}>20 por pagina</option>
              <option value={50}>50 por pagina</option>
            </select>
            <button
              type="button"
              style={styles.paginationButton}
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            >
              Anterior
            </button>
            <span style={styles.footerText}>
              Pagina {safeCurrentPage} de {totalPages}
            </span>
            <button
              type="button"
              style={styles.paginationButton}
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Siguiente
            </button>
          </div>
        </div>
      </section>

      <SidePanelForm
        open={panelOpen}
        title={form.idCheque ? "Editar cheque" : "Nuevo cheque"}
        subtitle={
          form.idCheque
            ? "Actualice los campos del cheque. La auditoria registrara los cambios."
            : "Complete los datos para registrar un nuevo cheque."
        }
        onClose={() => {
          if (saving || panelLoading) return;
          setPanelOpen(false);
          setFormError(null);
        }}
        footer={
          <>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => {
                setPanelOpen(false);
                setFormError(null);
              }}
              disabled={saving || panelLoading}
            >
              Cancelar
            </button>
            <button
              type="button"
              style={styles.primaryButton}
              onClick={() => void handleSave()}
              disabled={saving || panelLoading}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </>
        }
      >
        {panelLoading ? <div style={styles.panelLoading}>Cargando cheque...</div> : null}
        {formError ? <div style={styles.errorBanner}>{formError}</div> : null}
        {uploadImageError ? <div style={styles.errorBanner}>{uploadImageError}</div> : null}

        <div style={styles.formGrid}>
          <Field label="Empleado">
            <select
              value={form.idEmpleado}
              onChange={(event) => handleEmpleadoChange(event.target.value)}
              style={styles.input}
            >
              <option value="">Seleccione</option>
              {empleadosUnicos.map((item) => (
                <option key={`emp-${item.idEmpleado}`} value={item.idEmpleado}>
                  {item.nombreEmpleadoCJ || item.nombreEmpleado}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Banco">
            <select
              value={form.idBanco}
              onChange={(event) => setForm((prev) => ({ ...prev, idBanco: event.target.value }))}
              style={styles.input}
            >
              <option value="">Seleccione</option>
              {bancosUnicos.map((item) => (
                <option key={`bank-${item.id}`} value={item.id}>
                  {item.nombre}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Fecha cheque">
            <input
              type="date"
              value={form.fechaCheque}
              onChange={(event) => setForm((prev) => ({ ...prev, fechaCheque: event.target.value }))}
              style={styles.input}
            />
          </Field>

          <Field label="Nro cheque">
            <input
              type="text"
              value={form.nroCheque}
              onChange={(event) => setForm((prev) => ({ ...prev, nroCheque: event.target.value }))}
              style={styles.input}
              maxLength={20}
            />
          </Field>

          <Field label="Importe">
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.importe}
              onChange={(event) => setForm((prev) => ({ ...prev, importe: event.target.value }))}
              style={styles.input}
            />
          </Field>

          <Field label="Moneda">
            {monedaOptions.length > 0 ? (
              <select
                value={form.idMoneda}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, idMoneda: event.target.value }))
                }
                style={styles.input}
              >
                <option value="">Seleccione</option>
                {monedaOptions.map((option) => (
                  <option
                    key={`moneda-${normalizeOptionValue(option)}-${option.label}`}
                    value={normalizeOptionValue(option)}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                min="0"
                value={form.idMoneda}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, idMoneda: event.target.value }))
                }
                style={styles.input}
                placeholder="Id moneda"
              />
            )}
          </Field>

          <Field label="Estado">
            {estadoOptions.length > 0 ? (
              <select
                value={form.idEstado}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, idEstado: event.target.value }))
                }
                style={styles.input}
              >
                <option value="">Seleccione</option>
                {estadoOptions.map((option) => (
                  <option
                    key={`estado-${normalizeOptionValue(option)}-${option.label}`}
                    value={normalizeOptionValue(option)}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                min="0"
                value={form.idEstado}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, idEstado: event.target.value }))
                }
                style={styles.input}
                placeholder="Id estado"
              />
            )}
          </Field>

          <Field label="Ruta">
            <div style={styles.uploadField}>
              <div style={styles.uploadRow}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => archivoRutaInputRef.current?.click()}
                  disabled={uploadingImage}
                >
                  {uploadingImage ? "Cargando..." : "Cargar imagen"}
                </button>
                {form.ruta ? (
                  <button
                    type="button"
                    style={styles.linkButton}
                    onClick={() => abrirVistaImagen(form.ruta, "Imagen adjunta del cheque")}
                  >
                    Ver imagen
                  </button>
                ) : null}
              </div>
              <input
                ref={archivoRutaInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={procesarRutaSeleccionada}
              />
              <input
                type="text"
                value={form.ruta}
                readOnly
                style={{ ...styles.input, background: "#F8FAFC" }}
                placeholder="Se mostrara la URL o ruta almacenada"
              />
            </div>
          </Field>
        </div>
      </SidePanelForm>

      {rejectModal ? (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <h3 style={styles.modalTitle}>Rechazar cheque</h3>
            <p style={styles.modalText}>
              Registre la observacion del rechazo para el cheque {rejectModal.row.nroCheque}.
            </p>
            <textarea
              value={rejectModal.observacion}
              onChange={(event) =>
                setRejectModal((prev) =>
                  prev ? { ...prev, observacion: event.target.value, error: null } : prev
                )
              }
              rows={4}
              style={styles.textarea}
              placeholder="Detalle del rechazo"
            />
            {rejectModal.error ? <div style={styles.errorBanner}>{rejectModal.error}</div> : null}
            <div style={styles.modalActions}>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => setRejectModal(null)}
                disabled={rejectModal.submitting}
              >
                Cancelar
              </button>
              <button
                type="button"
                style={styles.rejectConfirmButton}
                onClick={() => void handleReject()}
                disabled={rejectModal.submitting}
              >
                {rejectModal.submitting ? "Rechazando..." : "Confirmar rechazo"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {imageViewer ? (
        <div style={styles.modalOverlay} onClick={() => setImageViewer(null)}>
          <div style={styles.imageViewerCard} onClick={(event) => event.stopPropagation()}>
            <div style={styles.imageViewerHeader}>
              <h3 style={styles.modalTitle}>{imageViewer.title}</h3>
              <button type="button" style={styles.secondaryButton} onClick={() => setImageViewer(null)}>
                Cerrar
              </button>
            </div>
            <div style={styles.imageViewerBody}>
              <img
                src={imageViewer.url}
                alt={imageViewer.title}
                style={styles.imagePreview}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SortableHeader({
  label,
  sortKey,
  sort,
  setSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  setSort: React.Dispatch<React.SetStateAction<SortState>>;
}) {
  const isActive = sort.key === sortKey;
  const glyph = isActive ? (sort.direction === "asc" ? "▲" : "▼") : "↕";

  return (
    <th style={{ ...styles.th, minWidth: 140 }}>
      <button
        type="button"
        style={styles.sortButton}
        onClick={() =>
          setSort((prev) =>
            prev.key === sortKey
              ? { key: sortKey, direction: prev.direction === "asc" ? "desc" : "asc" }
              : { key: sortKey, direction: "asc" }
          )
        }
      >
        <span>{label}</span>
        <span>{glyph}</span>
      </button>
    </th>
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={styles.fieldGroup}>
      <span style={styles.label}>{label}</span>
      {children}
    </label>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
    padding: 18,
    background: "#F8FAFC",
    minHeight: "100%",
  },
  headerBlock: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  breadcrumb: {
    fontSize: 12,
    fontWeight: 700,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    margin: "6px 0 4px",
    fontSize: 28,
    lineHeight: 1.1,
    color: "#17143A",
  },
  subtitle: {
    margin: 0,
    color: "#64748B",
    fontSize: 14,
    maxWidth: 760,
  },
  toolbarCaptionWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  toolbarTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#17143A",
  },
  toolbarCaption: {
    fontSize: 12,
    color: "#64748B",
  },
  statsRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
  },
  statCard: {
    minWidth: 120,
    borderRadius: 18,
    padding: "14px 16px",
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.05)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  statLabel: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700,
  },
  statValue: {
    fontSize: 24,
    color: "#17143A",
  },
  card: {
    background: "#FFFFFF",
    borderRadius: 24,
    border: "1px solid #E2E8F0",
    boxShadow: "0 16px 34px rgba(15, 23, 42, 0.06)",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },
  filterRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
  },
  fieldGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: 700,
    color: "#334155",
  },
  input: {
    width: "100%",
    border: "1px solid #CBD5E1",
    borderRadius: 12,
    padding: "12px 14px",
    background: "#FFFFFF",
    fontSize: 14,
    color: "#0F172A",
    outline: "none",
  },
  tableWrap: {
    overflowX: "auto",
    border: "1px solid #E5E7EB",
    borderRadius: 18,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 1240,
  },
  th: {
    background: "#F8FAFC",
    borderBottom: "1px solid #E5E7EB",
    color: "#334155",
    fontSize: 12,
    fontWeight: 800,
    textAlign: "left",
    padding: "12px 14px",
  },
  td: {
    borderBottom: "1px solid #F1F5F9",
    color: "#0F172A",
    fontSize: 13,
    padding: "12px 14px",
    verticalAlign: "top",
  },
  emptyCell: {
    padding: 32,
    textAlign: "center",
    color: "#64748B",
    fontWeight: 600,
  },
  sortButton: {
    width: "100%",
    border: "none",
    background: "transparent",
    padding: 0,
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center",
    fontWeight: 800,
    color: "#334155",
    cursor: "pointer",
  },
  actionRow: {
    display: "flex",
    gap: 8,
  },
  editButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: "1px solid #BFDBFE",
    background: "#EFF6FF",
    color: "#1D4ED8",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  rejectButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  footerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  footerText: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: 600,
  },
  paginationRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  pageSizeSelect: {
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    padding: "10px 12px",
    background: "#FFFFFF",
  },
  paginationButton: {
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  primaryButton: {
    borderRadius: 12,
    border: "none",
    background: "#3559E0",
    color: "#FFFFFF",
    padding: "12px 18px",
    fontWeight: 800,
    cursor: "pointer",
  },
  secondaryButton: {
    borderRadius: 12,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#334155",
    padding: "12px 18px",
    fontWeight: 700,
    cursor: "pointer",
  },
  rejectConfirmButton: {
    borderRadius: 12,
    border: "none",
    background: "#DC2626",
    color: "#FFFFFF",
    padding: "12px 18px",
    fontWeight: 800,
    cursor: "pointer",
  },
  panelLoading: {
    color: "#64748B",
    fontWeight: 600,
  },
  uploadField: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  uploadRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 16,
  },
  successBanner: {
    borderRadius: 14,
    border: "1px solid #BBF7D0",
    background: "#F0FDF4",
    color: "#166534",
    padding: "14px 16px",
    fontWeight: 700,
  },
  errorBanner: {
    borderRadius: 14,
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C",
    padding: "14px 16px",
    fontWeight: 700,
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 1001,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    background: "#FFFFFF",
    borderRadius: 22,
    padding: 24,
    boxShadow: "0 24px 48px rgba(15, 23, 42, 0.18)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  modalTitle: {
    margin: 0,
    color: "#17143A",
    fontSize: 24,
  },
  modalText: {
    margin: 0,
    color: "#64748B",
    fontSize: 14,
  },
  textarea: {
    width: "100%",
    minHeight: 120,
    resize: "vertical",
    borderRadius: 14,
    border: "1px solid #CBD5E1",
    padding: 14,
    fontSize: 14,
    outline: "none",
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 12,
  },
  linkButton: {
    border: "none",
    background: "transparent",
    color: "#1D4ED8",
    padding: 0,
    fontWeight: 700,
    cursor: "pointer",
    textDecoration: "underline",
    textAlign: "left",
  },
  imageViewerCard: {
    width: "100%",
    maxWidth: 980,
    maxHeight: "90vh",
    background: "#FFFFFF",
    borderRadius: 22,
    padding: 20,
    boxShadow: "0 24px 48px rgba(15, 23, 42, 0.18)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  imageViewerHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  imageViewerBody: {
    overflow: "auto",
    display: "flex",
    justifyContent: "center",
  },
  imagePreview: {
    maxWidth: "100%",
    maxHeight: "75vh",
    objectFit: "contain",
    borderRadius: 16,
    border: "1px solid #E5E7EB",
  },
};
