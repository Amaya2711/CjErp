import React, { useEffect, useMemo, useState } from "react";
import { Ban, Pencil, Plus } from "lucide-react";
import CrudToolbar, {
  matchesCrudToolbarSearch,
  type CrudToolbarSearchField,
} from "../../../components/base/CrudToolbar";
import SidePanelForm from "../../../components/base/SidePanelForm";
import DataGridPro from "../../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../../components/datagrid/types";
import {
  actualizarCheque,
  crearCheque,
  obtenerAdjuntoCheque,
  listarCheques,
  obtenerCheque,
  rechazarCheque,
  subirImagenCheque,
} from "../../../api/chequeService";
import { listarEmpleadosCta, listarEmpleadosPorCargo } from "../../../api/empleadoService";
import { useConstantesPorCampo } from "../../../hooks/useConstantesPorCampo";
import type { ConstanteOption } from "../../../models/constante";
import type { EmpleadoCta } from "../../../models/empleadoCta";
import type { ChequeGuardarRequest, ChequeRow } from "../../../models/cheque";
import { getAuthUser } from "../../../utils/authStorage";
import { getHttpErrorMessage } from "../../../utils/httpError";
import { compressImageForUpload } from "../../../utils/imageCompression";

/** Fila plana del grid de cheques: cada columna trae su valor listo para ordenar, filtrar y agrupar. */
type ChequeGridRow = {
  cheque: ChequeRow;
  idCheque: number;
  fechaCheque: string;
  nroCheque: string;
  empleado: string;
  banco: string;
  importe: number;
  moneda: string;
  estado: string;
  comentario: string;
  ruta: string;
  fechaCreacion: string;
  fechaModificacion: string;
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
  comentario: string;
  ruta: string;
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
  sourceUrl: string;
  mimeType: string;
} | null;

function normalizeOptionValue(option: ConstanteOption): string {
  // ChequeEmpleado persiste los Ids de Constante. Para tipo_moneda el campo
  // `value` contiene el texto (por ejemplo, "SOLES"), que Number convierte en
  // cero al armar el payload; el identificador válido es `codigo`.
  return String(option.codigo || option.value || option.valor || "").trim();
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

function formatMoney(value?: number | null) {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return amount.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getTodayInputDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveDefaultMonedaId(options: ConstanteOption[]) {
  const normalizeText = (value?: string | null) => String(value ?? "").trim().toLowerCase();

  const solesOption = options.find((option) => {
    const label = normalizeText(option.label);
    const codigo = normalizeText(option.codigo);
    const valor = normalizeText(option.valor);
    return (
      label.includes("soles") ||
      label === "sol" ||
      codigo.includes("sol") ||
      valor === "soles"
    );
  });

  return solesOption ? normalizeOptionValue(solesOption) : "";
}

function resolveDefaultEstadoId(options: ConstanteOption[]) {
  const normalizeText = (value?: string | null) => String(value ?? "").trim().toLowerCase();

  const generatedOption = options.find((option) => {
    const label = normalizeText(option.label);
    const codigo = normalizeText(option.codigo);
    const valor = normalizeText(option.valor);
    return label.includes("generado") || codigo.includes("generado") || valor === "generado";
  });

  return generatedOption ? normalizeOptionValue(generatedOption) : "";
}

function buildInitialForm(defaultMonedaId = "", defaultEstadoId = ""): FormState {
  return {
    idCheque: null,
    idEmpleado: "",
    idBanco: "",
    fechaCheque: getTodayInputDate(),
    nroCheque: "",
    importe: "",
    idMoneda: defaultMonedaId,
    idEstado: defaultEstadoId,
    comentario: "",
    ruta: "",
  };
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
    comentario: row.comentario ?? "",
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
    comentario: form.comentario.trim() || null,
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

function isEstadoAnulado(options: ConstanteOption[], idEstado: number) {
  const estadoLabel = getConstanteLabel(options, idEstado).trim().toLowerCase();
  return estadoLabel.includes("anulad");
}

function isEstadoAnuladoOption(option: ConstanteOption) {
  return String(option.label ?? "")
    .trim()
    .toLowerCase()
    .includes("anulad");
}

function getPageTitle() {
  return "Tesoreria / Cheques";
}

export default function TesoreriaChequesPage() {
  const [rows, setRows] = useState<ChequeRow[]>([]);
  const [empleados, setEmpleados] = useState<EmpleadoCta[]>([]);
  const [empleadosCargo, setEmpleadosCargo] = useState<EmpleadoCta[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelLoading, setPanelLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(() => buildInitialForm());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<RejectModalState>(null);
  const [imageViewer, setImageViewer] = useState<ImageViewerState>(null);
  const [showPanelImagePreview, setShowPanelImagePreview] = useState(false);
  const [panelImagePreviewUrl, setPanelImagePreviewUrl] = useState("");
  const [panelImagePreviewMimeType, setPanelImagePreviewMimeType] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadImageError, setUploadImageError] = useState<string | null>(null);
  const archivoRutaInputRef = React.useRef<HTMLInputElement | null>(null);

  const camposConstantes = useMemo(
    () => ["tipo_moneda", "estado_cheque", "banco"],
    []
  );
  const { constantesPorCampo } = useConstantesPorCampo(camposConstantes);
  const monedaOptions = constantesPorCampo.tipo_moneda ?? [];
  const defaultMonedaId = useMemo(() => resolveDefaultMonedaId(monedaOptions), [monedaOptions]);
  const estadoOptions = constantesPorCampo.estado_cheque ?? [];
  const bancoOptions = constantesPorCampo.banco ?? [];
  const estadoEditOptions = useMemo(
    () => estadoOptions.filter((option) => !isEstadoAnuladoOption(option)),
    [estadoOptions]
  );
  const defaultEstadoId = useMemo(() => resolveDefaultEstadoId(estadoOptions), [estadoOptions]);

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

  const empleadosCargoUnicos = useMemo(() => {
    const map = new Map<number, EmpleadoCta>();
    empleadosCargo.forEach((item) => {
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
  }, [empleadosCargo]);

  const bancosUnicos = useMemo(() => {
    const map = new Map<number, { id: number; nombre: string }>();
    bancoOptions.forEach((option) => {
      const id = Number(option.codigo);
      const nombre = id === 0 ? " " : (option.label || option.valor || "").trim();
      if (Number.isFinite(id) && (id === 0 || nombre) && !map.has(id)) {
        map.set(id, { id, nombre });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [bancoOptions]);

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
      const data = await listarCheques();
      setRows(data);
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
        const [empleadosCuentaData, empleadosCargoData] = await Promise.all([
          listarEmpleadosCta(),
          listarEmpleadosPorCargo(30),
        ]);
        if (!cancelled) {
          setEmpleados(empleadosCuentaData);
          setEmpleadosCargo(empleadosCargoData);
        }
      } catch {
        if (!cancelled) {
          setEmpleados([]);
          setEmpleadosCargo([]);
        }
      }
    };

    void loadCatalogs();

    return () => {
      cancelled = true;
    };
  }, []);

  const empleadosPanelOptions = useMemo(() => {
    const map = new Map<number, EmpleadoCta>();

    empleadosCargoUnicos.forEach((item) => {
      map.set(item.idEmpleado, item);
    });

    const selectedId = toNumber(form.idEmpleado);
    if (selectedId > 0 && !map.has(selectedId)) {
      const selectedEmpleado = empleadosUnicos.find((item) => item.idEmpleado === selectedId);
      if (selectedEmpleado) {
        map.set(selectedEmpleado.idEmpleado, selectedEmpleado);
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      (a.nombreEmpleadoCJ || a.nombreEmpleado || "").localeCompare(
        b.nombreEmpleadoCJ || b.nombreEmpleado || "",
        "es"
      )
    );
  }, [empleadosCargoUnicos, empleadosUnicos, form.idEmpleado]);

  const searchFields = useMemo<CrudToolbarSearchField<ChequeRow>[]>(() => {
    return [
      { key: "nroCheque", label: "Nro cheque", getValue: (item) => item.nroCheque },
      { key: "fechaCheque", label: "Fecha cheque", getValue: (item) => item.fechaCheque },
      {
        key: "empleado",
        label: "Empleado",
        getValue: (item) =>
          item.nombreEmpleado ||
          employeeById.get(item.idEmpleado)?.nombreEmpleadoCJ ||
          employeeById.get(item.idEmpleado)?.nombreEmpleado ||
          item.idEmpleado,
      },
      {
        key: "banco",
        label: "Banco",
        // El idBanco del cheque es la fuente de verdad. NombreBanco puede venir
        // desfasado desde el listado, mientras que el catálogo ya refleja el banco
        // que se muestra en el formulario de edición.
        getValue: (item) => bankById.get(item.idBanco) || item.nombreBanco || item.idBanco,
      },
      { key: "importe", label: "Importe", getValue: (item) => item.importe },
      {
        key: "moneda",
        label: "Moneda",
        getValue: (item) => item.nombreMoneda || getConstanteLabel(monedaOptions, item.idMoneda),
      },
      {
        key: "estado",
        label: "Estado",
        getValue: (item) => item.nombreEstado || getConstanteLabel(estadoOptions, item.idEstado),
      },
      { key: "comentario", label: "Comentario", getValue: (item) => item.comentario },
      { key: "ruta", label: "Ruta", getValue: (item) => item.ruta },
    ];
  }, [bankById, employeeById, estadoOptions, monedaOptions]);

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesCrudToolbarSearch(row, search, searchFields)),
    [rows, search, searchFields]
  );

  const gridRows = useMemo<ChequeGridRow[]>(
    () =>
      filteredRows.map((row) => {
        const empleado = employeeById.get(row.idEmpleado);
        return {
          cheque: row,
          idCheque: row.idCheque,
          fechaCheque: row.fechaCheque || "",
          nroCheque: row.nroCheque || "",
          empleado: row.nombreEmpleado || empleado?.nombreEmpleadoCJ || empleado?.nombreEmpleado || String(row.idEmpleado ?? ""),
          banco: bankById.get(row.idBanco) || row.nombreBanco || String(row.idBanco ?? ""),
          importe: Number(row.importe) || 0,
          moneda: row.nombreMoneda || getConstanteLabel(monedaOptions, row.idMoneda),
          estado: row.nombreEstado || getConstanteLabel(estadoOptions, row.idEstado),
          comentario: row.comentario?.trim() || "",
          ruta: row.ruta || "",
          fechaCreacion: row.fechaCreacion || "",
          fechaModificacion: row.fechaModificacion || "",
        };
      }),
    [filteredRows, employeeById, bankById, monedaOptions, estadoOptions]
  );

  const gridColumns: GridColumn<ChequeGridRow>[] = [
    {
      dataField: "acciones",
      caption: "Acciones",
      width: 110,
      alignment: "center",
      fixed: true,
      allowSorting: false,
      allowFiltering: false,
      allowGrouping: false,
      allowHeaderFilter: false,
      allowSearch: false,
      allowResizing: false,
      calculateCellValue: () => "",
      cellRender: (_value, gridRow) => {
        const row = gridRow.cheque;
        const accionesDeshabilitadas = row.idEstado === 0;
        const rechazoDeshabilitado = accionesDeshabilitadas || row.idEstado === -1;
        return (
          <div style={styles.actionRow}>
            <button
              type="button"
              style={accionesDeshabilitadas ? { ...styles.editButton, ...styles.disabledActionButton } : styles.editButton}
              title="Editar cheque"
              onClick={(event) => {
                event.stopPropagation();
                void openEditPanel(row.idCheque);
              }}
              disabled={accionesDeshabilitadas}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              style={rechazoDeshabilitado ? { ...styles.rejectButton, ...styles.disabledActionButton } : styles.rejectButton}
              title="Rechazar cheque"
              onClick={(event) => {
                event.stopPropagation();
                setRejectModal({ row, observacion: "", error: null, submitting: false });
              }}
              disabled={rechazoDeshabilitado}
            >
              <Ban size={14} />
            </button>
          </div>
        );
      },
    },
    { dataField: "fechaCheque", caption: "Fecha cheque", dataType: "date", width: 120, sortOrder: "desc" },
    { dataField: "nroCheque", caption: "Nro cheque", width: 130 },
    { dataField: "empleado", caption: "Empleado", width: 240 },
    { dataField: "banco", caption: "Banco", width: 170 },
    { dataField: "importe", caption: "Importe", dataType: "number", width: 120, format: { type: "fixedPoint", precision: 2 } },
    { dataField: "moneda", caption: "Moneda", width: 100 },
    { dataField: "estado", caption: "Estado", width: 110 },
    { dataField: "comentario", caption: "Comentario", width: 240 },
    {
      dataField: "ruta",
      caption: "Ruta",
      width: 130,
      allowGrouping: false,
      cellRender: (_value, gridRow) =>
        gridRow.ruta ? (
          <button
            type="button"
            style={styles.linkButton}
            title={gridRow.ruta}
            onClick={(event) => {
              event.stopPropagation();
              void abrirVistaImagen(gridRow.ruta, `Cheque ${gridRow.nroCheque || gridRow.idCheque}`);
            }}
          >
            Ver imagen
          </button>
        ) : (
          "-"
        ),
    },
    { dataField: "fechaCreacion", caption: "F. creacion", dataType: "datetime", width: 150 },
    { dataField: "fechaModificacion", caption: "F. modificacion", dataType: "datetime", width: 150 },
  ];

  const stats = useMemo(
    () => ({
      total: rows.length,
      visibles: filteredRows.length,
      anulados: filteredRows.filter((row) => isEstadoAnulado(estadoOptions, row.idEstado)).length,
      monto: filteredRows.reduce(
        (acc, row) =>
          isEstadoAnulado(estadoOptions, row.idEstado) ? acc : acc + (row.importe || 0),
        0
      ),
    }),
    [estadoOptions, filteredRows, rows.length]
  );

  const openCreatePanel = () => {
    setMessage(null);
    setFormError(null);
    setUploadImageError(null);
    setShowPanelImagePreview(false);
    setForm(buildInitialForm(defaultMonedaId, defaultEstadoId));
    setPanelOpen(true);
  };

  const openEditPanel = async (idCheque: number) => {
    try {
      setPanelLoading(true);
      setMessage(null);
      setFormError(null);
      setUploadImageError(null);
      setShowPanelImagePreview(false);
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
    if (!form.idMoneda || toNumber(form.idMoneda) <= 0) return "Seleccione la moneda.";
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
      setShowPanelImagePreview(false);
      setForm(buildInitialForm(defaultMonedaId, defaultEstadoId));
      await loadRows();
    } catch (err: unknown) {
      setFormError(getHttpErrorMessage(err, "No se pudo guardar el cheque."));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!panelOpen || form.idCheque || form.idMoneda || !defaultMonedaId) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      idMoneda: defaultMonedaId,
    }));
  }, [defaultMonedaId, form.idCheque, form.idMoneda, panelOpen]);

  useEffect(() => {
    if (!panelOpen || form.idCheque || form.idEstado || !defaultEstadoId) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      idEstado: defaultEstadoId,
    }));
  }, [defaultEstadoId, form.idCheque, form.idEstado, panelOpen]);

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

  const getRutaVisualizacion = (ruta?: string | null) => String(ruta ?? "").trim();

  const isPreviewMimeType = (mimeType?: string | null) => {
    const normalized = String(mimeType ?? "").trim().toLowerCase();
    return (
      normalized.startsWith("image/") ||
      normalized === "application/pdf" ||
      normalized === "application/x-pdf"
    );
  };

  const cerrarVistaImagen = () => {
    setImageViewer((current) => {
      if (current?.url?.startsWith("blob:")) {
        URL.revokeObjectURL(current.url);
      }

      return null;
    });
  };

  const abrirAdjuntoEnNuevaPestana = () => {
    if (!imageViewer?.url) {
      return;
    }

    const targetUrl =
      imageViewer.sourceUrl && /^https?:\/\//i.test(imageViewer.sourceUrl)
        ? imageViewer.sourceUrl
        : imageViewer.url;

    const link = document.createElement("a");
    link.href = targetUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const descargarAdjunto = () => {
    if (!imageViewer?.url) {
      return;
    }

    const link = document.createElement("a");
    link.href = imageViewer.url;
    link.download = "adjunto";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const abrirVistaImagen = async (ruta?: string | null, title = "Imagen adjunta") => {
    const raw = getRutaVisualizacion(ruta);
    if (!raw) {
      return;
    }

    try {
      const blob = await obtenerAdjuntoCheque(raw);
      const objectUrl = URL.createObjectURL(blob);
      const mimeType = blob.type || "";

      setImageViewer((current) => {
        if (current?.url?.startsWith("blob:")) {
          URL.revokeObjectURL(current.url);
        }

        return { title, url: objectUrl, sourceUrl: raw, mimeType };
      });
    } catch (err: unknown) {
      setError(getHttpErrorMessage(err, "No se pudo cargar el adjunto del cheque."));
    }
  };

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";

    if (!showPanelImagePreview || !form.ruta.trim()) {
      setPanelImagePreviewUrl((current) => {
        if (current.startsWith("blob:")) {
          URL.revokeObjectURL(current);
        }

        return "";
      });
      setPanelImagePreviewMimeType("");

      return () => {
        cancelled = true;
      };
    }

    const loadPanelPreview = async () => {
      try {
        const blob = await obtenerAdjuntoCheque(form.ruta);
        if (cancelled) {
          return;
        }

        objectUrl = URL.createObjectURL(blob);
        const mimeType = blob.type || "";
        setPanelImagePreviewUrl((current) => {
          if (current.startsWith("blob:")) {
            URL.revokeObjectURL(current);
          }

          return objectUrl;
        });
        setPanelImagePreviewMimeType(mimeType);
      } catch {
        if (!cancelled) {
          setPanelImagePreviewUrl((current) => {
            if (current.startsWith("blob:")) {
              URL.revokeObjectURL(current);
            }

            return "";
          });
          setPanelImagePreviewMimeType("");
        }
      }
    };

    void loadPanelPreview();

    return () => {
      cancelled = true;

      if (objectUrl.startsWith("blob:")) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [form.ruta, showPanelImagePreview]);

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
      const optimizedFile = file.type.startsWith("image/")
        ? await compressImageForUpload(file)
        : file;
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
        ruta: response.storagePath || response.fileUrl || "",
      }));
      setShowPanelImagePreview(false);
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
          <StatCard label="Anulados" value={String(stats.anulados)} />
        </div>
      </div>

      <CrudToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar empleado, banco, numero de cheque, comentario, ruta o estado..."
        searchFieldsHint="Empleado, banco, numero de cheque, fecha, importe, moneda, estado, comentario y ruta"
        buttons={[
          {
            key: "nuevo",
            label: "Nuevo",
            onClick: openCreatePanel,
            icon: <Plus size={16} />,
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
        <DataGridPro<ChequeGridRow>
          dataSource={gridRows}
          columns={gridColumns}
          keyExpr="idCheque"
          height="65vh"
          loading={loading}
          noDataText="No hay registros para los filtros seleccionados."
          stateStoringKey="cheques"
          showSearchPanel={false}
          allowExport={false}
          autoExpandAll={false}
          rowAlternation={false}
          rowPadding="4px 8px"
          paging={{ pageSize: 50, pageSizes: [20, 50, 100, 250] }}
        />
      </section>

      <SidePanelForm
        open={panelOpen}
        title={form.idCheque ? "Editar cheque" : "Nuevo cheque"}
        maxWidth={920}
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
                setShowPanelImagePreview(false);
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
          <Field label="Empleado" style={styles.formGridWideSpan}>
            <select
              value={form.idEmpleado}
              onChange={(event) => handleEmpleadoChange(event.target.value)}
              style={styles.input}
            >
              <option value="">Seleccione</option>
              {empleadosPanelOptions.map((item) => (
                <option key={`emp-${item.idEmpleado}`} value={item.idEmpleado}>
                  {item.nombreEmpleadoCJ || item.nombreEmpleado}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Banco" style={styles.formGridWideSpan}>
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
                disabled={false}
              >
                <option value="">Seleccione</option>
                {(form.idCheque ? estadoEditOptions : estadoOptions).map((option) => (
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
                readOnly={false}
              />
            )}
          </Field>

          <Field label="Ruta" style={styles.formGridFullSpan}>
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
                    onClick={() => setShowPanelImagePreview((prev) => !prev)}
                  >
                    {showPanelImagePreview ? "Ocultar imagen" : "Ver imagen"}
                  </button>
                ) : null}
              </div>
              <input
                ref={archivoRutaInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.bmp,.pdf,.doc,.docx,.xls,.xlsx,.txt"
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
              {showPanelImagePreview && panelImagePreviewUrl ? (
                <div style={styles.panelImagePreviewCard}>
                  {isPreviewMimeType(panelImagePreviewMimeType) ? (
                    panelImagePreviewMimeType.startsWith("image/") ? (
                      <img
                        src={panelImagePreviewUrl}
                        alt="Adjunto del cheque"
                        style={styles.panelImagePreview}
                      />
                    ) : (
                      <iframe
                        src={panelImagePreviewUrl}
                        title="Adjunto del cheque"
                        style={styles.panelAdjuntoPreview}
                      />
                    )
                  ) : (
                    <div style={styles.panelAdjuntoNoPreview}>
                      <strong>Adjunto cargado.</strong>
                      <span>
                        Este tipo de archivo no se previsualiza aquí. Puedes abrirlo o descargarlo.
                      </span>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </Field>

          <Field label="Comentario" style={styles.formGridFullSpan}>
            <textarea
              value={form.comentario}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, comentario: event.target.value }))
              }
              rows={4}
              style={styles.textarea}
              placeholder="Ingrese un comentario adicional"
            />
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
        <div style={styles.modalOverlay} onClick={cerrarVistaImagen}>
          <div style={styles.imageViewerCard} onClick={(event) => event.stopPropagation()}>
            <div style={styles.imageViewerHeader}>
              <h3 style={styles.modalTitle}>{imageViewer.title}</h3>
              <div style={styles.modalHeaderActions}>
                <button type="button" style={styles.secondaryButton} onClick={abrirAdjuntoEnNuevaPestana}>
                  Abrir
                </button>
                <button type="button" style={styles.secondaryButton} onClick={descargarAdjunto}>
                  Descargar
                </button>
                <button type="button" style={styles.secondaryButton} onClick={cerrarVistaImagen}>
                  Cerrar
                </button>
              </div>
            </div>
            <div style={styles.imageViewerBody}>
              {isPreviewMimeType(imageViewer.mimeType) ? (
                imageViewer.mimeType.startsWith("image/") ? (
                  <img
                    src={imageViewer.url}
                    alt={imageViewer.title}
                    style={styles.imagePreview}
                  />
                ) : (
                  <iframe
                    src={imageViewer.url}
                    title={imageViewer.title}
                    style={styles.imagePreview}
                  />
                )
              ) : (
                <div style={styles.noPreviewMessage}>
                  <p style={styles.noPreviewTitle}>No hay vista previa para este tipo de archivo.</p>
                  <p style={styles.noPreviewText}>
                    Usa <strong>Abrir</strong> o <strong>Descargar</strong> para revisar el adjunto.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
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
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <label style={{ ...styles.fieldGroup, ...style }}>
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
  disabledActionButton: {
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
    color: "#94A3B8",
    cursor: "not-allowed",
    opacity: 0.7,
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
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 16,
    alignItems: "start",
  },
  formGridWideSpan: {
    gridColumn: "span 2",
  },
  formGridFullSpan: {
    gridColumn: "1 / -1",
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
    flexWrap: "wrap",
  },
  modalHeaderActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  imageViewerBody: {
    overflow: "auto",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  panelImagePreviewCard: {
    marginTop: 8,
    borderRadius: 18,
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
    padding: 16,
    display: "flex",
    justifyContent: "center",
    overflow: "hidden",
  },
  panelImagePreview: {
    maxWidth: "100%",
    maxHeight: 320,
    objectFit: "contain",
    borderRadius: 12,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
  },
  panelAdjuntoPreview: {
    width: "100%",
    minHeight: 280,
    border: "1px solid #CBD5E1",
    borderRadius: 12,
    background: "#FFFFFF",
  },
  panelAdjuntoNoPreview: {
    width: "100%",
    minHeight: 160,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    color: "#475569",
    textAlign: "center",
    padding: 16,
  },
  imagePreview: {
    width: "100%",
    maxWidth: "100%",
    height: "75vh",
    objectFit: "contain",
    borderRadius: 16,
    border: "1px solid #E5E7EB",
    background: "#FFFFFF",
  },
  noPreviewMessage: {
    width: "100%",
    minHeight: 260,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    padding: 24,
    textAlign: "center",
    color: "#334155",
  },
  noPreviewTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    color: "#0F172A",
  },
  noPreviewText: {
    margin: 0,
    fontSize: 14,
    color: "#475569",
  },
};
