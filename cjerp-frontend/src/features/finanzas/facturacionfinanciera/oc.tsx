import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CrudToolbar, {
  matchesCrudToolbarSearch,
  type CrudToolbarSearchField,
} from "../../../components/base/CrudToolbar";
import { FiltroOperativoLookup } from "../../../components/lookups/FiltroOperativoLookup";
import {
  buscarOrdenCompraCabecera,
  buscarOrdenCompraDetalle,
  insertarOrdenCompra,
  rechazarOrdenCompraMasivo,
  type OrdenCompraCabeceraDto,
  type OrdenCompraDetalleDto,
  type OrdenCompraInsertPayload,
} from "../../../api/ordenCompraService";
import { useConstantesPorCampo } from "../../../hooks/useConstantesPorCampo";
import { listarSolicitanteOptions } from "../../../api/solicitanteService";
import { listarGestorOptions } from "../../../api/gestorService";
import { listarValidadorOptions } from "../../../api/validadorService";
import { listarEmpleadosCta } from "../../../api/empleadoService";
import { getAuthUser } from "../../../utils/authStorage";
import type { ConstanteOption } from "../../../models/constante";
import type { EmpleadoCta } from "../../../models/empleadoCta";
import type { FiltroOperativoValue } from "../../../models/filtroOperativo";
import { getHttpErrorMessage } from "../../../utils/httpError";

type ColumnFilterDropdownProps = {
  header: { key: string; label: string };
  filtroColumnaMenuRef: React.RefObject<HTMLDivElement | null>;
  filtrosColumnas: Record<string, string[]>;
  setFiltrosColumnas: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  opcionesFiltroPorColumna: Record<string, string[]>;
  filtroBusqueda: string;
  setFiltroBusqueda: (value: string) => void;
};

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
    (opcion || "(Vacío)").toLowerCase().includes(filtroBusqueda.toLowerCase())
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
        placeholder="Buscar opción..."
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
              <span>{opcion || "(Vacío)"}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

type OrdenCompraDraftDetalle = {
  tempId: string;
  filtroOperativo: FiltroOperativoValue;
  detalle: string;
  comprobante: string;
  formaPago: string;
  moneda: string;
  diasPago: string;
  cantidad: string;
  precioUnitario: string;
  peso: string;
  tieneOcCliente: boolean;
  tienePresupuesto: boolean;
  ocClienteNombre: string;
  presupuestoNombre: string;
};

type OrdenCompraDraft = {
  fechaOrden: string;
  solicitante: string;
  gestor: string;
  validador: string;
  responsable: string;
  observacion: string;
  moneda: string;
  comprobante: string;
  formaPago: string;
  diasPago: string;
  detalles: OrdenCompraDraftDetalle[];
};

const today = new Date().toISOString().slice(0, 10);

const createEmptyDetalle = (): OrdenCompraDraftDetalle => ({
  tempId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  filtroOperativo: {},
  detalle: "",
  comprobante: "",
  formaPago: "",
  moneda: "",
  diasPago: "",
  cantidad: "",
  precioUnitario: "",
  peso: "",
  tieneOcCliente: false,
  tienePresupuesto: false,
  ocClienteNombre: "",
  presupuestoNombre: "",
});

const createInitialDraft = (): OrdenCompraDraft => ({
  fechaOrden: today,
  solicitante: "",
  gestor: "",
  validador: "",
  responsable: "",
  observacion: "",
  moneda: "",
  comprobante: "",
  formaPago: "",
  diasPago: "",
  detalles: [],
});

const cabeceraColumns = [
  { key: "acciones", label: "Acciones", width: "120px" },
  { key: "idOc", label: "OC", width: "90px" },
  { key: "fecha", label: "Fecha", width: "120px" },
  { key: "solicitante", label: "Solicitante", width: "220px" },
  { key: "responsable", label: "Responsable", width: "220px" },
  { key: "comprobante", label: "Comprobante", width: "140px" },
  { key: "moneda", label: "Moneda", width: "100px" },
  { key: "subtotal", label: "Subtotal", width: "120px" },
  { key: "igv", label: "IGV", width: "120px" },
  { key: "total", label: "Total", width: "120px" },
  { key: "estado", label: "Estado", width: "170px" },
] as const;

const detalleColumns = [
  { key: "acciones", label: "Acciones", width: "120px" },
  { key: "fila", label: "Fila", width: "70px" },
  { key: "nombreCliente", label: "Cliente", width: "180px" },
  { key: "nombreProyecto", label: "Proyecto", width: "180px" },
  { key: "nombreSite", label: "Site", width: "180px" },
  { key: "tipoTrabajo", label: "Tipo trabajo", width: "140px" },
  { key: "ot", label: "OT", width: "110px" },
  { key: "tarea", label: "Tarea", width: "140px" },
  { key: "detalle", label: "Detalle", width: "260px" },
  { key: "cantidad", label: "Cantidad", width: "80px" },
  { key: "precioUnitario", label: "Precio unit.", width: "80px" },
  { key: "subtotalD", label: "Subtotal", width: "80px" },
  { key: "igvD", label: "IGV", width: "80px" },
  { key: "totalD", label: "Total", width: "80px" },
  { key: "estado", label: "Estado", width: "150px" },
] as const;

function normalizeOptionValue(option: ConstanteOption): string {
  return option.codigo || option.value || option.label;
}

function getOptionLabel(options: ConstanteOption[], value: string) {
  return options.find((option) => normalizeOptionValue(option) === value)?.label ?? value;
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

function resolveBufferedValue(bufferValue: string, stateValue: string) {
  return bufferValue !== "" ? bufferValue : stateValue;
}

function toNumber(value: string | number | null | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toPositiveNumber(...values: Array<string | number | null | undefined>): number {
  for (const value of values) {
    if (value == null) continue;
    const parsed = Number(String(value).trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
}

function formatMoney(value: number | null | undefined) {
  return toNumber(value).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normalizeColumnValue(value: unknown) {
  return String(value ?? "").trim();
}

function matchesColumnFilterValue(value: unknown, selectedValues: string[]) {
  if (!selectedValues.length) return true;
  return selectedValues.includes(normalizeColumnValue(value));
}

function exportToCsv(fileName: string, headers: string[], rows: Array<Array<string | number>>) {
  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 0);
}

export default function OcPage() {
  const authUser = getAuthUser();
  const userId = toPositiveNumber(authUser?.idEmpleado, authUser?.codEmp);
  const userCargoId = toPositiveNumber(authUser?.idCargo, authUser?.idrol);
  const userName =
    authUser?.usuario ??
    authUser?.username ??
    authUser?.userName ??
    authUser?.nombreEmpleado ??
    authUser?.nombre ??
    "sistema";

  const [cabeceras, setCabeceras] = useState<OrdenCompraCabeceraDto[]>([]);
  const [detalles, setDetalles] = useState<OrdenCompraDetalleDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedOcId, setSelectedOcId] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [draft, setDraft] = useState<OrdenCompraDraft>(createInitialDraft);
  const [detalleForm, setDetalleForm] = useState<OrdenCompraDraftDetalle>(createEmptyDetalle);
  const [editingDetalleId, setEditingDetalleId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtrosColumnas, setFiltrosColumnas] = useState<Record<string, string[]>>({});
  const [columnaFiltroAbierta, setColumnaFiltroAbierta] = useState<string | null>(null);
  const [filtroBusqueda, setFiltroBusqueda] = useState("");
  const filtroColumnaMenuRef = useRef<HTMLDivElement>(null);
  // Ref para el input del filtro del lookup
  const filtroInputRef = useRef<HTMLInputElement | null>(null);
  const diasPagoInputRef = useRef("");
  const detalleInputRef = useRef("");
  const cantidadInputRef = useRef("");
  const precioUnitarioInputRef = useRef("");
  const pesoInputRef = useRef("");
  const [solicitanteOptions, setSolicitanteOptions] = useState<ConstanteOption[]>([]);
  const [gestorOptions, setGestorOptions] = useState<ConstanteOption[]>([]);
  const [validadorOptions, setValidadorOptions] = useState<ConstanteOption[]>([]);
  const [responsableOptions, setResponsableOptions] = useState<EmpleadoCta[]>([]);
  const [mostrarConfirmacionRechazo, setMostrarConfirmacionRechazo] = useState(false);
  const [mostrarMotivoRechazo, setMostrarMotivoRechazo] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [rechazoError, setRechazoError] = useState("");
  const [rechazando, setRechazando] = useState(false);
  const [idsOcRechazo, setIdsOcRechazo] = useState<number[]>([]);

  const camposConstantes = useMemo(
    () => ["tipo_moneda", "tipo_comprobante", "tipo_pago"],
    []
  );
  const { constantesPorCampo } = useConstantesPorCampo(camposConstantes);
  const monedaOptions = constantesPorCampo.tipo_moneda ?? [];
  const comprobanteOptions = constantesPorCampo.tipo_comprobante ?? [];
  const tipoPagoOptions = constantesPorCampo.tipo_pago ?? [];

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [solicitantes, gestores, validadores, responsables] = await Promise.all([
          listarSolicitanteOptions({
            idCargo: userCargoId > 0 ? userCargoId : null,
            idEmpleado: userId > 0 ? userId : null,
          }),
          listarGestorOptions(),
          listarValidadorOptions(),
          listarEmpleadosCta(),
        ]);
        setSolicitanteOptions(solicitantes);
        setGestorOptions(gestores);
        setValidadorOptions(validadores);
        setResponsableOptions(responsables);
      } catch (err) {
        setError(getHttpErrorMessage(err, "No se pudieron cargar los catálogos de la orden de compra."));
      }
    };

    void loadOptions();
  }, [userCargoId, userId]);

  const loadCabeceras = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await buscarOrdenCompraCabecera();
      setCabeceras(Array.isArray(response) ? response : []);
      if (selectedOcId) {
        const stillExists = (response ?? []).some((item) => item.idOc === selectedOcId);
        if (!stillExists) {
          setSelectedOcId(null);
          setDetalles([]);
        }
      }
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo cargar la cabecera de órdenes de compra."));
    } finally {
      setLoading(false);
    }
  };

  const loadDetalles = async (idOc: number) => {
    setDetailLoading(true);
    setError("");
    try {
      const response = await buscarOrdenCompraDetalle({ idOc: String(idOc) });
      setDetalles(Array.isArray(response) ? response : []);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo cargar el detalle de la orden de compra."));
      setDetalles([]);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadCabeceras();
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

  const searchFields = useMemo<CrudToolbarSearchField<OrdenCompraCabeceraDto>[]>(
    () => [
      { key: "idOc", label: "OC", getValue: (item) => item.idOc },
      { key: "fecha", label: "Fecha", getValue: (item) => item.fecha ?? "" },
      { key: "solicitante", label: "Solicitante", getValue: (item) => item.solicitante },
      { key: "responsable", label: "Responsable", getValue: (item) => item.responsable },
      { key: "comprobante", label: "Comprobante", getValue: (item) => item.comprobante },
      { key: "moneda", label: "Moneda", getValue: (item) => item.moneda },
      { key: "subtotal", label: "Subtotal", getValue: (item) => item.subtotal },
      { key: "igv", label: "IGV", getValue: (item) => item.igv },
      { key: "total", label: "Total", getValue: (item) => item.total },
      { key: "estado", label: "Estado", getValue: (item) => item.estado },
    ],
    []
  );

  const getCabeceraColumnValue = (item: OrdenCompraCabeceraDto, key: string) => {
    switch (key) {
      case "fecha":
        return item.fecha ? new Date(item.fecha).toLocaleDateString("es-PE") : "";
      case "subtotal":
      case "igv":
      case "total":
        return formatMoney(item[key]);
      default:
        return String((item as Record<string, unknown>)[key] ?? "");
    }
  };

  const cabecerasFiltradas = useMemo(
    () =>
      cabeceras
        .filter((item) => matchesCrudToolbarSearch(item, busqueda, searchFields))
        .filter((item) =>
          searchFields.every((field) =>
            matchesColumnFilterValue(getCabeceraColumnValue(item, field.key), filtrosColumnas[field.key] ?? [])
          )
        ),
    [busqueda, cabeceras, filtrosColumnas, searchFields]
  );

  const opcionesFiltroPorColumna = useMemo(() => {
    const result: Record<string, string[]> = {};
    searchFields.forEach((field) => {
      result[field.key] = Array.from(
        new Set(cabeceras.map((item) => normalizeColumnValue(getCabeceraColumnValue(item, field.key))))
      ).sort((left, right) => left.localeCompare(right, "es", { sensitivity: "base" }));
    });
    return result;
  }, [cabeceras, searchFields]);

  const selectedCabecera = useMemo(
    () => cabeceras.find((item) => item.idOc === selectedOcId) ?? null,
    [cabeceras, selectedOcId]
  );

  const isAccepted = (selectedCabecera?.estado ?? "").toLowerCase().includes("aprobado");
  const draftTotals = useMemo(() => {
    let subtotal = 0;
    let igv = 0;
    let total = 0;
    let peso = 0;
    draft.detalles.forEach((item) => {
      const sub = toNumber(item.cantidad) * toNumber(item.precioUnitario);
      const comprobanteUpper = (item.comprobante || "").toString().toUpperCase();
      const isFactura = comprobanteUpper === "2" || comprobanteUpper === "6";
      const igvItem = isFactura ? sub * 0.18 : 0;
      subtotal += sub;
      igv += igvItem;
      total += sub + igvItem;
      peso += toNumber(item.peso);
    });
    return { subtotal, igv, total, peso };
  }, [draft.detalles]);

  const handleFiltroOperativoChange = useCallback((value: FiltroOperativoValue) => {
    setDetalleForm((prev) => ({ ...prev, filtroOperativo: value }));
  }, []);

  const handleDetalleInputChange = useCallback((value: string) => {
    detalleInputRef.current = value;
  }, []);

  const handleDiasPagoInputChange = useCallback((value: string) => {
    diasPagoInputRef.current = value;
  }, []);

  const handleCantidadInputChange = useCallback((value: string) => {
    cantidadInputRef.current = value;
  }, []);

  const handlePrecioUnitarioInputChange = useCallback((value: string) => {
    precioUnitarioInputRef.current = value;
  }, []);

  const handlePesoInputChange = useCallback((value: string) => {
    pesoInputRef.current = value;
  }, []);

  const syncDraftBuffer = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      diasPago: resolveBufferedValue(diasPagoInputRef.current, prev.diasPago),
    }));
  }, []);

  const syncDetalleBuffer = useCallback(() => {
    setDetalleForm((prev) => ({
      ...prev,
      detalle: resolveBufferedValue(detalleInputRef.current, prev.detalle),
      cantidad: resolveBufferedValue(cantidadInputRef.current, prev.cantidad),
      precioUnitario: resolveBufferedValue(precioUnitarioInputRef.current, prev.precioUnitario),
      peso: resolveBufferedValue(pesoInputRef.current, prev.peso),
    }));
  }, []);

  const openNuevo = () => {
    const solicitanteDefault = userId > 0 ? String(userId) : "";
    const gestorDefault = gestorOptions[0] ? normalizeOptionValue(gestorOptions[0]) : "";
    const validadorDefault = validadorOptions[0] ? normalizeOptionValue(validadorOptions[0]) : "";
    const responsableDefault =
      responsableOptions.find((item) => item.idEmpleado === userId)?.idEmpleado ??
      responsableOptions[0]?.idEmpleado ??
      "";

    setDraft({
      ...createInitialDraft(),
      fechaOrden: today, // Siempre la fecha actual
      solicitante: solicitanteDefault,
      gestor: gestorDefault,
      validador: validadorDefault,
      responsable: responsableDefault ? String(responsableDefault) : "",
    });
    diasPagoInputRef.current = "";
    setDetalleForm(createEmptyDetalle());
    detalleInputRef.current = "";
    cantidadInputRef.current = "";
    precioUnitarioInputRef.current = "";
    pesoInputRef.current = "";
    setEditingDetalleId(null);
    setMessage("");
    setError("");
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setDraft(createInitialDraft());
    diasPagoInputRef.current = "";
    setDetalleForm(createEmptyDetalle());
    detalleInputRef.current = "";
    cantidadInputRef.current = "";
    precioUnitarioInputRef.current = "";
    pesoInputRef.current = "";
    setEditingDetalleId(null);
  };

  const validateDetalleForm = (detalleActual: OrdenCompraDraftDetalle) => {
    return (
      detalleActual.filtroOperativo.filtro?.idCliente &&
      detalleActual.filtroOperativo.filtro?.idProyecto &&
      detalleActual.filtroOperativo.filtro?.idSite &&
      detalleActual.detalle.trim() &&
      draft.comprobante &&
      draft.formaPago &&
      draft.moneda &&
      toNumber(detalleActual.cantidad) > 0 &&
      toNumber(detalleActual.precioUnitario) > 0
    );
  };

  const upsertDetalle = () => {
    const nextItem = {
      ...detalleForm,
      detalle: resolveBufferedValue(detalleInputRef.current, detalleForm.detalle),
      cantidad: resolveBufferedValue(cantidadInputRef.current, detalleForm.cantidad),
      precioUnitario: resolveBufferedValue(precioUnitarioInputRef.current, detalleForm.precioUnitario),
      peso: resolveBufferedValue(pesoInputRef.current, detalleForm.peso),
      comprobante: draft.comprobante,
      formaPago: draft.formaPago,
      moneda: draft.moneda,
      diasPago: resolveBufferedValue(diasPagoInputRef.current, draft.diasPago),
    };

    if (!validateDetalleForm(nextItem)) {
      setError("Cada posicion debe tener cliente, proyecto, site, detalle, comprobante, tipo de pago, moneda, cantidad y precio unitario.");
      return;
    }

    setError("");
    setDraft((prev) => {
      if (editingDetalleId) {
        return {
          ...prev,
          detalles: prev.detalles.map((item) => (item.tempId === editingDetalleId ? nextItem : item)),
        };
      }

      return {
        ...prev,
        detalles: [...prev.detalles, nextItem],
      };
    });
    setDetalleForm(createEmptyDetalle());
    detalleInputRef.current = "";
    cantidadInputRef.current = "";
    precioUnitarioInputRef.current = "";
    pesoInputRef.current = "";
    setEditingDetalleId(null);
    // Enfocar el input del filtro del lookup
    setTimeout(() => {
      filtroInputRef.current?.focus();
    }, 0);
  };

  const editDetalle = useCallback((item: OrdenCompraDraftDetalle) => {
    setDetalleForm({ ...item, filtroOperativo: { ...item.filtroOperativo } });
    detalleInputRef.current = item.detalle;
    cantidadInputRef.current = item.cantidad;
    precioUnitarioInputRef.current = item.precioUnitario;
    pesoInputRef.current = item.peso;
    diasPagoInputRef.current = item.diasPago;
    setDraft((prev) => ({
      ...prev,
      comprobante: item.comprobante,
      formaPago: item.formaPago,
      moneda: item.moneda,
      diasPago: item.diasPago,
    }));
    setEditingDetalleId(item.tempId);
  }, []);

  const removeDetalle = useCallback((tempId: string) => {
    if (isAccepted) return;
    setDraft((prev) => ({ ...prev, detalles: prev.detalles.filter((item) => item.tempId !== tempId) }));
    if (editingDetalleId === tempId) {
      setDetalleForm(createEmptyDetalle());
      detalleInputRef.current = "";
      cantidadInputRef.current = "";
      precioUnitarioInputRef.current = "";
      pesoInputRef.current = "";
      setEditingDetalleId(null);
    }
  }, [editingDetalleId, isAccepted]);

  const validateDraft = () => {
    if (!draft.solicitante || !draft.gestor || !draft.validador || !draft.responsable) {
      setError("Complete solicitante, gestor, validador y responsable.");
      return false;
    }

    if (!draft.moneda || !draft.comprobante || !draft.formaPago) {
      setError("Complete moneda, comprobante y tipo de pago.");
      return false;
    }

    if (draft.detalles.length === 0) {
      setError("Debe registrar al menos una posición.");
      return false;
    }

    return true;
  };

  const saveDraft = async () => {
    if (!validateDraft()) {
      return;
    }

    const payload: OrdenCompraInsertPayload = {
      idSolicitante: Number(draft.solicitante),
      idResponsable: Number(draft.responsable),
      idWeb: 1,
      fechaOrden: draft.fechaOrden,
      observacion: draft.observacion.trim(),
      usuarioCreacion: userName,
      fechaCreacion: today,
      horaCreacion: new Date().toTimeString().slice(0, 8),
      idMoneda: Number(draft.moneda),
      idComprobante: Number(draft.comprobante),
      idEstado: 1,
      idValidador: Number(draft.validador),
      idGestor: Number(draft.gestor),
      idFormaPago: Number(draft.formaPago),
      diasPago: Number(resolveBufferedValue(diasPagoInputRef.current, draft.diasPago) || 0),
      peso: draftTotals.peso,
      detalle: draft.detalles.map((item) => ({
        idCliente: Number(item.filtroOperativo.filtro?.idCliente ?? 0),
        idProyecto: Number(item.filtroOperativo.filtro?.idProyecto ?? 0),
        idSite: String(item.filtroOperativo.filtro?.idSite ?? ""),
        detalle: item.detalle.trim(),
        cantidad: toNumber(item.cantidad),
        precioUnitario: toNumber(item.precioUnitario),
      })),
    };

    setSaving(true);
    setError("");
    try {
      console.log("[OrdenCompra][Insertar] payload", payload);
      const response = await insertarOrdenCompra(payload);
      setMessage(`Orden de compra ${response.idOc} creada correctamente.`);
      closePanel();
      await loadCabeceras();
      if (response.idOc) {
        setSelectedOcId(response.idOc);
        await loadDetalles(response.idOc);
      }
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo registrar la orden de compra."));
    } finally {
      setSaving(false);
    }
  };

  const abrirRechazo = useCallback((idsOc: number[]) => {
    const idsValidos = Array.from(new Set(idsOc.filter((id) => id > 0)));
    if (idsValidos.length === 0) {
      setError("Seleccione al menos una orden de compra para rechazar.");
      setRechazoError("Seleccione al menos una orden de compra para rechazar.");
      return;
    }

    setError("");
    setRechazoError("");
    setIdsOcRechazo(idsValidos);
    setMostrarConfirmacionRechazo(false);
    setMostrarMotivoRechazo(true);
    setMotivoRechazo("");
  }, []);

  const cancelarRechazo = useCallback(() => {
    setMostrarConfirmacionRechazo(false);
    setMostrarMotivoRechazo(false);
    setMotivoRechazo("");
    setRechazoError("");
    setIdsOcRechazo([]);
  }, []);

  const abrirPopupMotivoRechazo = useCallback(() => {
    setMostrarConfirmacionRechazo(false);
    setMostrarMotivoRechazo(true);
    setMotivoRechazo("");
    setRechazoError("");
  }, []);

  const rechazarOrdenesCompra = useCallback(async () => {
    if (idsOcRechazo.length === 0) {
      setRechazoError("Seleccione al menos una orden de compra para rechazar.");
      return;
    }

    if (!motivoRechazo.trim()) {
      setRechazoError("Debe ingresar el motivo del rechazo.");
      return;
    }

    try {
      setRechazando(true);
      setRechazoError("");
      setError("");
      setMessage("");

      const params = {
        idsOc: idsOcRechazo,
        observacion: motivoRechazo.trim(),
        idRechazador: userId > 0 ? userId : undefined,
      };
      console.log('[OC] Params enviados a rechazarOrdenCompraMasivo:', params);
      await rechazarOrdenCompraMasivo(params);

      const totalRechazadas = idsOcRechazo.length;
      cancelarRechazo();
      setSelectedOcId(null);
      setDetalles([]);
      setMessage(
        totalRechazadas === 1
          ? "Orden de compra rechazada correctamente."
          : `${totalRechazadas} ordenes de compra rechazadas correctamente.`
      );
      await loadCabeceras();
    } catch (err) {
      setRechazoError(getHttpErrorMessage(err, "No se pudo rechazar la orden de compra."));
    } finally {
      setRechazando(false);
    }
  }, [cancelarRechazo, idsOcRechazo, motivoRechazo, userId]);

  return (
    <div style={styles.page}>
      <CrudToolbar
        searchValue={busqueda}
        onSearchChange={setBusqueda}
        searchPlaceholder="Buscar orden de compra..."
        buttons={[
          { key: "nuevo", label: "Nuevo", onClick: openNuevo },
          {
            key: "exportar",
            label: "Exportar",
            onClick: () =>
              exportToCsv(
                `ordenes_compra_${today}.csv`,
                cabeceraColumns.filter((column) => column.key !== "acciones").map((column) => column.label),
                cabecerasFiltradas.map((item) => [
                  item.idOc,
                  item.fecha ? new Date(item.fecha).toLocaleDateString("es-PE") : "",
                  item.solicitante,
                  item.responsable,
                  item.comprobante,
                  item.moneda,
                  formatMoney(item.subtotal),
                  formatMoney(item.igv),
                  formatMoney(item.total),
                  item.estado,
                ])
              ),
          },
        ]}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={styles.toolbarTitle}>Buscar orden de compra</span>
          <span style={styles.toolbarCaption}>Cabecera con filtro por columna y selección de detalle.</span>
        </div>
      </CrudToolbar>


      {/* Solo mostrar error general si NO está abierto el panel de nueva orden */}
      {!panelOpen && error ? <div style={styles.errorBanner}>{error}</div> : null}
      {message ? <div style={styles.successBanner}>{message}</div> : null}

      <section style={styles.card}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Cabecera</h2>
            <p style={styles.sectionText}>Seleccione una orden para consultar sus posiciones.</p>
          </div>
          <span style={styles.counterPill}>{loading ? "Cargando..." : `${cabecerasFiltradas.length} registros`}</span>
        </div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <colgroup>
              {cabeceraColumns.map((column) => (
                <col key={`head-col-${column.key}`} style={{ width: column.width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {cabeceraColumns.map((header) => (
                  <th key={header.key} style={{ ...styles.th, width: header.width }}>
                    <div style={styles.thContent}>
                      <span>{header.label}</span>
                      {header.key !== "acciones" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setColumnaFiltroAbierta((prev) => (prev === header.key ? null : header.key));
                              setFiltroBusqueda("");
                            }}
                            style={{
                              ...styles.filterButton,
                              background: (filtrosColumnas[header.key] ?? []).length ? "#EEF2FF" : "#FFFFFF",
                            }}
                          >
                            Filtrar
                          </button>
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
                        </>
                      ) : null}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
          </table>
          <div style={{ width: "100%", maxHeight: "60vh", overflow: "auto" }}>
            <table style={styles.table}>
              <colgroup>
                {cabeceraColumns.map((column) => (
                  <col key={`body-col-${column.key}`} style={{ width: column.width }} />
                ))}
              </colgroup>
              <tbody>
                {cabecerasFiltradas.map((item) => (
                  <tr
                    key={item.idOc}
                    onClick={() => {
                      setSelectedOcId(item.idOc);
                      void loadDetalles(item.idOc);
                    }}
                    style={{
                      ...styles.tr,
                      background: selectedOcId === item.idOc ? "#EEF2FF" : "#FFFFFF",
                    }}
                  >
                    <td style={styles.td} onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        style={styles.smallDangerButton}
                        onClick={() => abrirRechazo([item.idOc])}
                      >
                        Rechazar
                      </button>
                    </td>
                    <td style={styles.td}>{item.idOc}</td>
                    <td style={styles.td}>{item.fecha ? new Date(item.fecha).toLocaleDateString("es-PE") : ""}</td>
                    <td style={styles.td}>{item.solicitante}</td>
                    <td style={styles.td}>{item.responsable}</td>
                    <td style={styles.td}>{item.comprobante}</td>
                    <td style={styles.td}>{item.moneda}</td>
                    <td style={styles.td}>{formatMoney(item.subtotal)}</td>
                    <td style={styles.td}>{formatMoney(item.igv)}</td>
                    <td style={styles.td}>{formatMoney(item.total)}</td>
                    <td style={styles.td}>{item.estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {mostrarConfirmacionRechazo && idsOcRechazo.length > 0 ? (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCardSmall}>
            <h3 style={{ marginTop: 0, marginBottom: 12, color: "#17143A" }}>
              Confirmar rechazo
            </h3>
            <p style={{ marginTop: 0, color: "#4B5563", lineHeight: 1.6 }}>
              {idsOcRechazo.length === 1
                ? <>Desea rechazar la OC <strong>{idsOcRechazo[0]}</strong>?</>
                : <>Desea rechazar las <strong>{idsOcRechazo.length}</strong> ordenes de compra seleccionadas?</>}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
              <button type="button" style={styles.secondaryButton} onClick={cancelarRechazo}>
                Cancelar
              </button>
              <button type="button" style={styles.rejectButton} onClick={abrirPopupMotivoRechazo}>
                Rechazar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {mostrarMotivoRechazo && idsOcRechazo.length > 0 ? (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <h3 style={{ marginTop: 0, marginBottom: 12, color: "#17143A" }}>
              Motivo del rechazo
            </h3>
            <p style={{ marginTop: 0, color: "#4B5563", lineHeight: 1.6 }}>
              Ingrese la observacion que se enviara al rechazo del registro seleccionado.
            </p>
            <textarea
              value={motivoRechazo}
              onChange={(event) => {
                setMotivoRechazo(event.target.value);
                if (rechazoError) {
                  setRechazoError("");
                }
              }}
              placeholder="Ingrese el motivo del rechazo"
              rows={5}
              style={styles.textarea}
            />
            {rechazoError ? <div style={{ ...styles.errorBanner, marginTop: 12 }}>{rechazoError}</div> : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
              <button type="button" style={styles.secondaryButton} onClick={cancelarRechazo} disabled={rechazando}>
                Cancelar
              </button>
              <button type="button" style={styles.rejectButton} onClick={rechazarOrdenesCompra} disabled={rechazando}>
                {rechazando ? "Rechazando..." : "Rechazar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {false ? (
      <section style={styles.card}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Detalle</h2>
            <p style={styles.sectionText}>
              {selectedCabecera?.idOc
                ? `OC ${selectedCabecera?.idOc} seleccionada.`
                : "Seleccione una cabecera para ver las posiciones."}
            </p>
          </div>
          {selectedCabecera ? (
            <div style={styles.summaryInline}>
              <span>Subtotal: {formatMoney(selectedCabecera?.subtotal)}</span>
              <span>IGV: {formatMoney(selectedCabecera?.igv)}</span>
              <span>Total: {formatMoney(selectedCabecera?.total)}</span>
            </div>
          ) : null}
        </div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {detalleColumns.map((column) => (
                  <th key={column.key} style={{ ...styles.th, width: column.width }}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detailLoading ? (
                <tr><td style={styles.td} colSpan={detalleColumns.length}>Cargando detalle...</td></tr>
              ) : detalles.length === 0 ? (
                <tr><td style={styles.td} colSpan={detalleColumns.length}>Sin posiciones para mostrar.</td></tr>
              ) : (
                detalles.map((item) => (
                  <tr key={`${item.idOc}-${item.fila}-${item.idCliente}-${item.idProyecto}`} style={styles.tr}>
                    <td style={styles.td}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" style={styles.smallActionButton} onClick={() => setMessage("La edición detallada queda habilitada desde el segmento Nueva orden.")}>Editar</button>
                        <button type="button" style={styles.smallDangerButton} onClick={() => setMessage("La acción Rechazar requiere un procedimiento backend adicional para OC.")}>Rechazar</button>
                      </div>
                    </td>
                    <td style={styles.td}>{item.fila ?? ""}</td>
                    <td style={styles.td}>{item.nombreCliente ?? ""}</td>
                    <td style={styles.td}>{item.nombreProyecto ?? ""}</td>
                    <td style={styles.td}>{item.nombreSite ?? ""}</td>
                    <td style={styles.td}>{item.tipoTrabajo ?? ""}</td>
                    <td style={styles.td}>{item.ot ?? ""}</td>
                    <td style={styles.td}>{item.tarea ?? ""}</td>
                    <td style={styles.td}>{item.detalle ?? ""}</td>
                    <td style={styles.td}>{formatMoney(item.cantidad)}</td>
                    <td style={styles.td}>{formatMoney(item.precioUnitario)}</td>
                    <td style={styles.td}>{formatMoney(item.subtotalD)}</td>
                    <td style={styles.td}>{formatMoney(item.igvD)}</td>
                    <td style={styles.td}>{formatMoney(item.totalD)}</td>
                    <td style={styles.td}>{item.estado ?? ""}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {panelOpen ? (
        <div>
          <div style={styles.sidePanelOverlay}>
            <section style={{ ...styles.card, ...styles.sidePanel }}>
              {/* Mostrar error SOLO dentro del panel de nueva orden de compra */}
              {error ? <div style={styles.errorBanner}>{error}</div> : null}
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.sectionTitle}>Nueva orden de compra</h2>
              <p style={styles.sectionText}></p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <div style={{ display: "flex", gap: 12 }}>
                <SummaryCard label="Subtotal" value={formatMoney(draftTotals.subtotal)} />
                <SummaryCard label="IGV" value={formatMoney(draftTotals.igv)} />
                <SummaryCard label="Total" value={formatMoney(draftTotals.total)} />
                <SummaryCard label="Peso" value={formatMoney(draftTotals.peso)} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={closePanel} style={styles.secondaryButton}>Cerrar</button>
                <button type="button" onClick={saveDraft} disabled={saving} style={styles.primaryButton}>
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          </div>


          {/* Nueva disposición de campos de cabecera */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 0 }}>
            <Field>
              <Label>Solicitante</Label>
              <SolicitanteTypeahead
                options={solicitanteOptions}
                selectedValue={draft.solicitante}
                onSelect={(value) => setDraft((prev) => ({ ...prev, solicitante: value }))}
                placeholder="Seleccione..."
              />
            </Field>
            <Field>
              <Label>Gestor</Label>
              <select value={draft.gestor} onChange={(event) => setDraft((prev) => ({ ...prev, gestor: event.target.value }))} style={styles.input}>
                <option value="">Seleccione...</option>
                {gestorOptions.map((option) => (
                  <option key={`ges-${normalizeOptionValue(option)}`} value={normalizeOptionValue(option)}>{option.label}</option>
                ))}
              </select>
            </Field>
            <Field>
              <Label>Validador</Label>
              <select value={draft.validador} onChange={(event) => setDraft((prev) => ({ ...prev, validador: event.target.value }))} style={styles.input}>
                <option value="">Seleccione...</option>
                {validadorOptions.map((option) => (
                  <option key={`val-${normalizeOptionValue(option)}`} value={normalizeOptionValue(option)}>{option.label}</option>
                ))}
              </select>
            </Field>
            <Field style={{ position: "relative" }}>
              <Label>Responsable</Label>
              <ResponsableTypeahead
                options={responsableOptions}
                selectedId={draft.responsable}
                onSelect={(id) => setDraft((prev) => ({ ...prev, responsable: id }))}
                placeholder="Seleccione..."
              />
            </Field>
          </div>

          {/* Observación oculta, pero el valor se mantiene en draft.observacion */}
          <Field style={{ display: "none" }}>
            <Label>Observación</Label>
            <textarea value={draft.observacion} readOnly style={styles.textarea} />
          </Field>


          <div style={styles.segmentHeader}>
            <h3 style={styles.subTitle}>Detalle de la orden de compra</h3>
            <span style={styles.sectionText}>
              {(() => {
                const responsable = responsableOptions.find(r => String(r.idEmpleado) === draft.responsable);
                if (!responsable) return "";
                // Concatenar información relevante de la cuenta
                let info = `Banco: ${responsable.nombreBanco || ""}`;
                if (responsable.cuenta) info += `, Cta: ${responsable.cuenta}`;
                if (responsable.cuentaInter) info += `, CCI: ${responsable.cuentaInter}`;
                if (responsable.nroDocumento) info += `, Nro Doc: ${responsable.nroDocumento}`;
                return info;
              })()}
            </span>
          </div>


          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 0 }}>
            <div style={{ flex: 3, minWidth: 0 }}>
              <MemoFiltroOperativoLookup value={detalleForm.filtroOperativo} onChange={handleFiltroOperativoChange} filtroInputRef={filtroInputRef} />
            </div>
            <Field style={{ flex: 1, minWidth: 220, marginTop: 0 }}>
              <Label>Detalle</Label>
              <BufferedTextArea
                value={detalleForm.detalle}
                onBlur={syncDetalleBuffer}
                onValueChange={handleDetalleInputChange}
                style={{ ...styles.textarea, minHeight: 60, height: 60, resize: 'vertical', width: '100%' }}
              />
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginTop: 6 }}>
            <Field>
              <Label>Comprobante</Label>
              <select value={draft.comprobante} onChange={(event) => setDraft((prev) => ({ ...prev, comprobante: event.target.value }))} style={styles.input}>
                <option value="">Seleccione...</option>
                {comprobanteOptions.map((option) => (
                  <option key={`comp-${normalizeOptionValue(option)}`} value={normalizeOptionValue(option)}>{option.label}</option>
                ))}
              </select>
            </Field>
            <Field>
              <Label>Tipo de pago</Label>
              <select value={draft.formaPago} onChange={(event) => setDraft((prev) => ({ ...prev, formaPago: event.target.value }))} style={styles.input}>
                <option value="">Seleccione...</option>
                {tipoPagoOptions.map((option) => (
                  <option key={`pago-${normalizeOptionValue(option)}`} value={normalizeOptionValue(option)}>{option.label}</option>
                ))}
              </select>
            </Field>
            <Field>
              <Label>Moneda</Label>
              <select value={draft.moneda} onChange={(event) => setDraft((prev) => ({ ...prev, moneda: event.target.value }))} style={styles.input}>
                <option value="">Seleccione...</option>
                {monedaOptions.map((option) => (
                  <option key={`mon-${normalizeOptionValue(option)}`} value={normalizeOptionValue(option)}>{option.label}</option>
                ))}
              </select>
            </Field>
            <Field>
              <Label>Dias de pago</Label>
              <BufferedNumberInput
                type="number"
                min="0"
                value={draft.diasPago}
                onBlur={syncDraftBuffer}
                onValueChange={handleDiasPagoInputChange}
                style={styles.input}
              />
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr) auto", gap: 4, alignItems: "start", marginTop: 0 }}>
            <Field>
              <Label>Cantidad</Label>
              <BufferedNumberInput
                type="number"
                min="0"
                step="0.01"
                value={detalleForm.cantidad}
                onBlur={syncDetalleBuffer}
                onValueChange={handleCantidadInputChange}
                style={styles.input2}
              />
            </Field>
            <Field>
              <Label>Precio unitario</Label>
              <BufferedNumberInput
                type="number"
                min="0"
                step="0.01"
                value={detalleForm.precioUnitario}
                onBlur={syncDetalleBuffer}
                onValueChange={handlePrecioUnitarioInputChange}
                style={styles.input2}
              />
            </Field>
            <Field>
              <Label>Subtotal</Label>
              <input type="text" readOnly value={formatMoney(toNumber(cantidadInputRef.current) * toNumber(precioUnitarioInputRef.current))} style={{ ...styles.input2, background: "#F8FAFC" }} />
            </Field>
            <Field>
              <Label>IGV</Label>
              {(() => {
                const subtotal = toNumber(cantidadInputRef.current) * toNumber(precioUnitarioInputRef.current);
                const comprobanteUpper = (draft.comprobante || "").toString().toUpperCase();
                const isFactura = comprobanteUpper === "FACTURA" || comprobanteUpper === "RENDICION FACTURA";
                const igv = isFactura ? subtotal * 0.18 : 0;
                //console.log(isFactura, subtotal, igv);
                return (
                  <input type="text" readOnly value={formatMoney(igv)} style={{ ...styles.input2, background: "#F8FAFC" }} />
                );
              })()}
            </Field>
            <Field>
              <Label>Peso</Label>
              <BufferedNumberInput
                type="number"
                min="0"
                step="0.01"
                value={detalleForm.peso}
                onBlur={syncDetalleBuffer}
                onValueChange={handlePesoInputChange}
                style={styles.input2}
              />
            </Field>
            {/* OC cliente */}
            <Field style={{ minWidth: 180, maxWidth: 300, width: '100%' }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Label>OC cliente</Label>
                <input type="checkbox" checked={detalleForm.tieneOcCliente} onChange={(event) => setDetalleForm((prev) => ({ ...prev, tieneOcCliente: event.target.checked }))} />
              </div>
              <div style={{ ...styles.fileBox, minWidth: 180, maxWidth: 220, width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label htmlFor="ocClienteFileInput" style={{ display: 'inline-flex', alignItems: 'center', cursor: detalleForm.tieneOcCliente ? 'pointer' : 'not-allowed', opacity: detalleForm.tieneOcCliente ? 1 : 0.5 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', background: '#E0E7FF', color: '#4338CA', fontSize: 20, border: '1px solid #CBD5E1' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24"><path fill="currentColor" d="M16.5 6.5l-1.71-1.79A.996.996 0 0 0 14 4H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-.26-.1-.52-.29-.71L16.5 6.5zM12 17c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm0-6.5A2.5 2.5 0 1 0 14.5 13 2.5 2.5 0 0 0 12 10.5z"/></svg>
                    </span>
                    <input
                      id="ocClienteFileInput"
                      type="file"
                      accept="image/*"
                      disabled={!detalleForm.tieneOcCliente}
                      onChange={(event) => setDetalleForm((prev) => ({ ...prev, ocClienteNombre: event.target.files?.[0]?.name ?? "" }))}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {detalleForm.ocClienteNombre ? (
                    <span style={styles.fileName}>{detalleForm.ocClienteNombre}</span>
                  ) : null}
                </div>
              </div>
            </Field>
            {/* Presupuesto */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, minWidth: 180, maxWidth: 300, width: '100%' }}>
              <Field style={{ flex: 1, marginBottom: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Label>Presupuesto</Label>
                  <input type="checkbox" checked={detalleForm.tienePresupuesto} onChange={(event) => setDetalleForm((prev) => ({ ...prev, tienePresupuesto: event.target.checked }))} />
                </div>
                <div style={{ ...styles.fileBox, minWidth: 0, maxWidth: '100%', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label htmlFor="presupuestoFileInput" style={{ display: 'inline-flex', alignItems: 'center', cursor: detalleForm.tienePresupuesto ? 'pointer' : 'not-allowed', opacity: detalleForm.tienePresupuesto ? 1 : 0.5 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', background: '#E0E7FF', color: '#4338CA', fontSize: 20, border: '1px solid #CBD5E1' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24"><path fill="currentColor" d="M16.5 6.5l-1.71-1.79A.996.996 0 0 0 14 4H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-.26-.1-.52-.29-.71L16.5 6.5zM12 17c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm0-6.5A2.5 2.5 0 1 0 14.5 13 2.5 2.5 0 0 0 12 10.5z"/></svg>
                      </span>
                      <input
                        id="presupuestoFileInput"
                        type="file"
                        accept="image/*"
                        disabled={!detalleForm.tienePresupuesto}
                        onChange={(event) => setDetalleForm((prev) => ({ ...prev, presupuestoNombre: event.target.files?.[0]?.name ?? "" }))}
                        style={{ display: 'none' }}
                      />
                    </label>
                    {detalleForm.presupuestoNombre ? (
                      <span style={styles.fileName}>{detalleForm.presupuestoNombre}</span>
                    ) : null}
                  </div>
                </div>
              </Field>
              <button type="button" onClick={upsertDetalle} style={styles.primaryButton}>
                {editingDetalleId ? "Actualizar posición" : "Agregar"}
              </button>
            </div>
          </div>

                  

          {false ? (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Acciones</th>
                  <th style={styles.th}>Fila</th>
                  <th style={styles.th}>Cliente</th>
                  <th style={styles.th}>Proyecto</th>
                  <th style={styles.th}>Site</th>
                  <th style={styles.th}>Tipo trabajo</th>
                  <th style={styles.th}>OT</th>
                  <th style={styles.th}>Tarea</th>
                  <th style={styles.th}>Detalle</th>
                  <th style={styles.th}>Comprobante</th>
                  <th style={styles.th}>Tipo de pago</th>
                  <th style={styles.th}>Moneda</th>
                  <th style={styles.th}>Dias de pago</th>
                  <th style={styles.th}>Cantidad</th>
                  <th style={styles.th}>Precio unit.</th>
                  <th style={styles.th}>Subtotal</th>
                  <th style={styles.th}>IGV</th>
                  <th style={styles.th}>Total</th>
                  <th style={styles.th}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {draft.detalles.length === 0 ? (
                  <tr>
                    <td style={styles.td} colSpan={19}>No hay posiciones registradas.</td>
                  </tr>
                ) : (
                  draft.detalles.map((item, index) => {
                    const subtotal = toNumber(item.cantidad) * toNumber(item.precioUnitario);
                    const igv = subtotal * 0.18;
                    const total = subtotal + igv;

                    return (
                      <tr key={`top-${item.tempId}`} style={styles.tr}>
                        <td style={styles.td}>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button type="button" style={styles.smallActionButton} onClick={() => editDetalle(item)}>Editar</button>
                            <button type="button" style={styles.smallDangerButton} disabled={isAccepted} onClick={() => removeDetalle(item.tempId)}>Rechazar</button>
                          </div>
                        </td>
                        <td style={styles.td}>{index + 1}</td>
                        <td style={styles.td}>{item.filtroOperativo.filtro?.nombreCliente ?? ""}</td>
                        <td style={styles.td}>{item.filtroOperativo.filtro?.nombreProyecto ?? ""}</td>
                        <td style={styles.td}>{item.filtroOperativo.filtro?.nombreSite ?? ""}</td>
                        <td style={styles.td}>{item.filtroOperativo.tipoTrabajo?.tipoTrabajo ?? item.filtroOperativo.filtro?.tipoTrabajo ?? ""}</td>
                        <td style={styles.td}>{item.filtroOperativo.ot?.ot ?? item.filtroOperativo.filtro?.ot ?? ""}</td>
                        <td style={styles.td}>{item.filtroOperativo.tarea?.tarea ?? ""}</td>
                        <td style={styles.td}>{item.detalle}</td>
                        <td style={styles.td}>{getOptionLabel(comprobanteOptions, item.comprobante)}</td>
                        <td style={styles.td}>{getOptionLabel(tipoPagoOptions, item.formaPago)}</td>
                        <td style={styles.td}>{getOptionLabel(monedaOptions, item.moneda)}</td>
                        <td style={styles.td}>{item.diasPago}</td>
                        <td style={styles.td}>{formatMoney(toNumber(item.cantidad))}</td>
                        <td style={styles.td}>{formatMoney(toNumber(item.precioUnitario))}</td>
                        <td style={styles.td}>{formatMoney(subtotal)}</td>
                        <td style={styles.td}>{formatMoney(igv)}</td>
                        <td style={styles.td}>{formatMoney(total)}</td>
                        <td style={styles.td}>{editingDetalleId === item.tempId ? "En edición" : "Pendiente"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          ) : null}
          <DraftDetalleTable
            detalles={draft.detalles}
            editingDetalleId={editingDetalleId}
            isAccepted={isAccepted}
            comprobanteOptions={comprobanteOptions}
            tipoPagoOptions={tipoPagoOptions}
            monedaOptions={monedaOptions}
            onEdit={editDetalle}
            onRemove={removeDetalle}
          />

          {/* Resumen de montos movido a la cabecera */}

          {/* Segmento duplicado eliminado */}

          {false ? (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Acciones</th>
                  <th style={styles.th}>Fila</th>
                  <th style={styles.th}>Cliente</th>
                  <th style={styles.th}>Proyecto</th>
                  <th style={styles.th}>Site</th>
                  <th style={styles.th}>Trabajo</th>
                  <th style={styles.th}>OT</th>
                  <th style={styles.th}>Tarea</th>
                  <th style={styles.th}>Detalle</th>
                  <th style={styles.th}>Cantidad</th>
                  <th style={styles.th}>Precio unit.</th>
                  <th style={styles.th}>Subtotal</th>
                  <th style={styles.th}>IGV</th>
                  <th style={styles.th}>Total</th>
                  <th style={styles.th}>Peso</th>
                  <th style={styles.th}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {draft.detalles.length === 0 ? (
                  <tr><td style={styles.td} colSpan={12}>No hay posiciones registradas.</td></tr>
                ) : (
                  draft.detalles.map((item) => (
                    <tr key={item.tempId} style={styles.tr}>
                      <td style={styles.td}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button type="button" style={styles.smallActionButton} onClick={() => editDetalle(item)}>Editar</button>
                          <button type="button" style={styles.smallDangerButton} disabled={isAccepted} onClick={() => removeDetalle(item.tempId)}>Rechazar</button>
                        </div>
                      </td>
                      <td style={styles.td}>{item.filtroOperativo.filtro?.nombreCliente ?? ""}</td>
                      <td style={styles.td}>{item.filtroOperativo.filtro?.nombreProyecto ?? ""}</td>
                      <td style={styles.td}>{item.filtroOperativo.filtro?.nombreSite ?? ""}</td>
                      <td style={styles.td}>{item.filtroOperativo.tipoTrabajo?.tipoTrabajo ?? item.filtroOperativo.filtro?.tipoTrabajo ?? ""}</td>
                      <td style={styles.td}>{item.filtroOperativo.ot?.ot ?? item.filtroOperativo.filtro?.ot ?? ""}</td>
                      <td style={styles.td}>{item.filtroOperativo.tarea?.tarea ?? ""}</td>
                      <td style={styles.td}>{item.detalle}</td>
                      <td style={styles.td}>{formatMoney(toNumber(item.cantidad))}</td>
                      <td style={styles.td}>{formatMoney(toNumber(item.precioUnitario))}</td>
                      <td style={styles.td}>{formatMoney(toNumber(item.cantidad) * toNumber(item.precioUnitario))}</td>
                      <td style={styles.td}>{formatMoney(toNumber(item.peso))}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          ) : null}

          {/* Grid duplicado eliminado */}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 3, ...style }}>{children}</div>;
}

const BufferedTextArea = React.memo(function BufferedTextArea({
  value,
  onValueChange,
  onBlur,
  style,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onBlur?: () => void;
  style?: React.CSSProperties;
}) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
    onValueChange(value);
  }, [value]);

  return (
    <textarea
      value={localValue}
      onBlur={onBlur}
      onChange={(event) => {
        const nextValue = event.target.value;
        setLocalValue(nextValue);
        onValueChange(nextValue);
      }}
      style={style}
    />
  );
});

const BufferedNumberInput = React.memo(function BufferedNumberInput({
  value,
  onValueChange,
  onBlur,
  style,
  ...props
}: {
  value: string;
  onValueChange: (value: string) => void;
  onBlur?: () => void;
  style?: React.CSSProperties;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "style">) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
    onValueChange(value);
  }, [value]);

  return (
    <input
      {...props}
      value={localValue}
      onBlur={onBlur}
      onChange={(event) => {
        const nextValue = event.target.value;
        setLocalValue(nextValue);
        onValueChange(nextValue);
      }}
      style={style}
    />
  );
});

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
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid #ccc",
            zIndex: 1002,
            maxHeight: 180,
            overflowY: "auto",
          }}
        >
          {filteredOptions.map((option, idx) => (
            <div
              key={`solicitante-${normalizeOptionValue(option)}-${idx}`}
              style={{
                padding: 6,
                cursor: "pointer",
                background: idx === highlightedIdx ? "#e6f7ff" : undefined,
                fontSize: 11,
                lineHeight: 1.1,
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

const ResponsableTypeahead = React.memo(function ResponsableTypeahead({
  options,
  selectedId,
  onSelect,
  placeholder,
}: {
  options: EmpleadoCta[];
  selectedId: string;
  onSelect: (value: string) => void;
  placeholder?: string;
}) {
  const [inputValue, setInputValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);

  const selectedOption = useMemo(
    () => options.find((emp) => String(emp.idEmpleado) === selectedId) ?? null,
    [options, selectedId]
  );

  useEffect(() => {
    setInputValue(selectedOption?.nombreEmpleado ?? "");
  }, [selectedOption]);

  const filteredOptions = useMemo(() => {
    const query = inputValue.trim().toLowerCase();
    if (!query) return options;
    return options.filter((emp) => emp.nombreEmpleado.toLowerCase().includes(query));
  }, [inputValue, options]);

  const applySelection = useCallback((emp: EmpleadoCta) => {
    onSelect(String(emp.idEmpleado));
    setInputValue(emp.nombreEmpleado);
    setShowDropdown(false);
    setHighlightedIdx(-1);
  }, [onSelect]);

  return (
    <>
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
        placeholder={placeholder}
        autoComplete="off"
        style={{
          width: "100%",
          height: 42,
          borderRadius: 10,
          border: "1px solid #D1D5DB",
          padding: "0 12px",
          fontSize: 11,
          boxSizing: "border-box",
        }}
      />
      {showDropdown && filteredOptions.length > 0 ? (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid #ccc",
            zIndex: 1002,
            maxHeight: 180,
            overflowY: "auto",
          }}
        >
          {filteredOptions.map((emp, idx) => (
            <div
              key={`responsable-${emp.idEmpleado || emp.nombreEmpleado || idx}-${idx}`}
              style={{
                padding: 4,
                cursor: "pointer",
                background: idx === highlightedIdx ? "#e6f7ff" : undefined,
                fontSize: 11,
                lineHeight: 1.1,
                fontFamily: "inherit",
                color: "#17143A",
                fontWeight: 500,
              }}
              onMouseDown={() => applySelection(emp)}
            >
              {emp.nombreEmpleado}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
});

const MemoFiltroOperativoLookup = React.memo(function MemoFiltroOperativoLookup({
  value,
  onChange,
  filtroInputRef,
}: {
  value: FiltroOperativoValue;
  onChange: (value: FiltroOperativoValue) => void;
  filtroInputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return <FiltroOperativoLookup value={value} onChange={onChange} filtroInputRef={filtroInputRef} />;
});

const DraftDetalleTable = React.memo(function DraftDetalleTable({
  detalles,
  editingDetalleId,
  isAccepted,
  comprobanteOptions,
  tipoPagoOptions,
  monedaOptions,
  onEdit,
  onRemove,
}: {
  detalles: OrdenCompraDraftDetalle[];
  editingDetalleId: string | null;
  isAccepted: boolean;
  comprobanteOptions: ConstanteOption[];
  tipoPagoOptions: ConstanteOption[];
  monedaOptions: ConstanteOption[];
  onEdit: (item: OrdenCompraDraftDetalle) => void;
  onRemove: (tempId: string) => void;
}) {
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Acciones</th>
            <th style={styles.th}>Fila</th>
            <th style={styles.th}>Cliente</th>
            <th style={styles.th}>Proyecto</th>
            <th style={styles.th}>Site</th>
            <th style={styles.th}>Tipo trabajo</th>
            <th style={styles.th}>OT</th>
            <th style={styles.th}>Tarea</th>
            <th style={styles.th}>Detalle</th>
            <th style={styles.th}>Comprobante</th>
            <th style={styles.th}>Tipo de pago</th>
            <th style={styles.th}>Moneda</th>
            <th style={styles.th}>Dias de pago</th>
            <th style={styles.th}>Cantidad</th>
            <th style={styles.th}>Precio unit.</th>
            <th style={styles.th}>Subtotal</th>
            <th style={styles.th}>IGV</th>
            <th style={styles.th}>Total</th>
            <th style={styles.th}>Estado</th>
          </tr>
        </thead>
      </table>
      <div style={{ width: "100%", maxHeight: "50vh", overflow: "auto" }}>
        <table style={styles.table}>
          <tbody>
            {detalles.length === 0 ? (
              <tr>
                <td style={styles.td} colSpan={19}>No hay posiciones registradas.</td>
              </tr>
            ) : (
              detalles.map((item, index) => {
                  const subtotal = toNumber(item.cantidad) * toNumber(item.precioUnitario);
                  // Calcular IGV solo si comprobante es FACTURA o RENDICION FACTURA
                  const comprobanteUpper = (item.comprobante || "").toString().toUpperCase();
                  const isFactura = comprobanteUpper === "2" || comprobanteUpper === "6";
                  const igv = isFactura ? subtotal * 0.18 : 0;
                  const total = subtotal + igv;

                return (
                  <tr key={`top-${item.tempId}`} style={styles.tr}>
                    <td style={styles.td}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" style={styles.smallActionButton} onClick={() => onEdit(item)}>Editar</button>
                        <button type="button" style={styles.smallDangerButton} disabled={isAccepted} onClick={() => onRemove(item.tempId)}>Rechazar</button>
                      </div>
                    </td>
                    <td style={styles.td}>{index + 1}</td>
                    <td style={styles.td}>{item.filtroOperativo.filtro?.nombreCliente ?? ""}</td>
                    <td style={styles.td}>{item.filtroOperativo.filtro?.nombreProyecto ?? ""}</td>
                    <td style={styles.td}>{item.filtroOperativo.filtro?.nombreSite ?? ""}</td>
                    <td style={styles.td}>{item.filtroOperativo.tipoTrabajo?.tipoTrabajo ?? item.filtroOperativo.filtro?.tipoTrabajo ?? ""}</td>
                    <td style={styles.td}>{item.filtroOperativo.ot?.ot ?? item.filtroOperativo.filtro?.ot ?? ""}</td>
                    <td style={styles.td}>{item.filtroOperativo.tarea?.tarea ?? ""}</td>
                    <td style={styles.td}>{item.detalle}</td>
                    <td style={styles.td}>{getOptionLabel(comprobanteOptions, item.comprobante)}</td>
                    <td style={styles.td}>{getOptionLabel(tipoPagoOptions, item.formaPago)}</td>
                    <td style={styles.td}>{getOptionLabel(monedaOptions, item.moneda)}</td>
                    <td style={styles.td}>{item.diasPago}</td>
                    <td style={styles.td}>{formatMoney(toNumber(item.cantidad))}</td>
                    <td style={styles.td}>{formatMoney(toNumber(item.precioUnitario))}</td>
                    <td style={styles.td}>{formatMoney(subtotal)}</td>
                    <td style={styles.td}>{formatMoney(igv)}</td>
                    <td style={styles.td}>{formatMoney(total)}</td>
                    <td style={styles.td}>{editingDetalleId === item.tempId ? "En edición" : "Pendiente"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>{children}</label>;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.summaryCard}>
      <span style={styles.summaryLabel}>{label}</span>
      <strong style={styles.summaryValue}>{value}</strong>
    </div>
  );
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
  sidePanelOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.35)",
    display: "flex",
    justifyContent: "flex-end",
    zIndex: 3000,
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3101,
  },
  modalCard: {
    width: 480,
    maxWidth: "calc(100% - 24px)",
    background: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 12px 28px rgba(0,0,0,0.16)",
  },
  modalCardSmall: {
    width: 420,
    maxWidth: "calc(100% - 24px)",
    background: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 12px 28px rgba(0,0,0,0.16)",
  },
  sidePanel: {
    width: 1200,
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
  toolbarTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: "#17143A",
  },
  toolbarCaption: {
    fontSize: 12,
    color: "#64748B",
  },
  counterPill: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "#F1F5F9",
    fontSize: 12,
    color: "#334155",
    fontWeight: 700,
  },
  tableWrap: {
    overflowX: "auto",
    border: "1px solid #E2E8F0",
    borderRadius: 14,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 1100,
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
  summaryInline: {
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
    fontSize: 12,
    fontWeight: 700,
    color: "#334155",
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
  input2: {
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
    minHeight: 52,
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    padding: 8,
    fontSize: 12,
    resize: "vertical",
    boxSizing: "border-box",
  },
  primaryButton: {
    border: "none",
    background: "#1D4ED8",
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
  smallDangerButton: {
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  },
  rejectButton: {
    border: "none",
    background: "#DC2626",
    color: "#FFFFFF",
    borderRadius: 10,
    padding: "10px 16px",
    fontWeight: 700,
    cursor: "pointer",
  },
  segmentHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  subTitle: {
    margin: 0,
    fontSize: 16,
    color: "#0F172A",
  },
  detailActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  },
  summaryBoard: {
    display: "grid",
    gridTemplateColumns: `
        90px   /* Cantidad */
        110px  /* Precio */
        100px  /* Subtotal */
        100px  /* IGV */
        100px  /* Peso */
        220px  /* OC cliente */
        260px  /* Presupuesto */
      `,
  gap: 6,
  alignItems: "start",
  marginTop: 0
    //gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    //gap: 12,
  },
  summaryCard: {
    background: "linear-gradient(135deg, #E0F2FE 0%, #F8FAFC 100%)",
    borderRadius: 12,
    padding: 10,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  summaryLabel: {
    fontSize: 12,
    color: "#475569",
  },
  summaryValue: {
    fontSize: 22,
    color: "#0F172A",
  },
  fileBox: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    border: "1px dashed #CBD5E1",
    borderRadius: 10,
    padding: 6,
  },
  checkLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    color: "#334155",
  },
  fileName: {
    fontSize: 11,
    color: "#64748B",
  },
};


