import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  matchesCrudToolbarSearch,
  type CrudToolbarSearchField,
} from "../../../components/base/CrudToolbar";
import { FiltroOperativoLookup } from "../../../components/lookups/FiltroOperativoLookup";
import {
  aprobarOrdenCompra,
  asociarRecibosOrdenCompra,
  buscarOrdenCompraCabecera,
  buscarOrdenCompraDetalle,
  buscarMontoOcOrdenCompra,
  buscarRecibosAsociadosOrdenCompra,
  buscarRecibosSinAsociarOrdenCompra,
  descargarArchivoOrdenCompra,
  descargarOrdenCompraPdf,
  insertarOrdenCompra,
  rechazarOrdenCompraMasivo,
  subirArchivoOrdenCompra,
  type OrdenCompraCabeceraDto,
  type OrdenCompraDetalleDto,
  type OrdenCompraInsertPayload,
  type OrdenCompraMontoOcDto,
  type OrdenCompraReciboDto,
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
import { FileDown } from "lucide-react";
import { buildPlanillaConsultaEstadosRequest, consultarPlanillaEstados } from "../../../api/planillaConsultaService";

const OC_GASTOS_COLUMNAS_INICIALES = ["Corre", "IdOc", "Usuario", "Solicitante", "FecIngreso", "EstadoPla", "Detalle", "Comprobante", "Serie", "Moneda", "Subtotal", "Igv", "Total", "MontoRetencion", "TotalPagar", "Observacion", "Comentario", "Gestor", "Validador", "Ejecutor", "FechaDeposito", "IdSite", "Ot", "NroOperacion", "NombreProyecto", "Site", "Tipo_Trabajo", "Tarea", "Responsable", "Cliente", "PrecioUniOc", "CantOc", "TotalOc", "IdEstadoOc"];

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
  ocClienteArchivo: File | null;
  presupuestoArchivo: File | null;
  imgOc: string;
  imgPresupuesto: string;
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

type EstadoVista = "todos" | "pendientes" | "aprobadas" | "rechazadas";
type VistaOc = "registro" | "aprobacion" | "reporte";
type DetalleOcTab = "detalle" | "recibosAsociados" | "recibosSinAsociar" | "montoOc";
type ReporteFiltros = {
  solicitante: string;
  responsable: string;
  cliente: string;
  proyecto: string;
  site: string;
  estado: string;
  idOc: string;
  tipoOc: "con" | "todos";
  fechaDesde: string;
  fechaHasta: string;
};

const today = new Date().toISOString().slice(0, 10);
const archivoOcAccept = ".jpg,.jpeg,.png,.bmp,.gif,.pdf,.xls,.xlsx";

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
  ocClienteArchivo: null,
  presupuestoArchivo: null,
  imgOc: "",
  imgPresupuesto: "",
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
  { key: "idOc", label: "OC", width: "90px" },
    { key: "fecha", label: "Fecha", width: "120px" },
  { key: "responsable", label: "Responsable", width: "150px" },
  { key: "comprobante", label: "Tipo documento", width: "86px" },
  { key: "total", label: "Monto", width: "92px" },
  { key: "moneda", label: "Moneda", width: "75px" },
] as const;

const detalleColumns = [
  { key: "acciones", label: "Acciones", width: "120px" },
  { key: "fila", label: "Fila", width: "70px" },
  { key: "nombreCliente", label: "Cliente", width: "180px" },
  { key: "nombreProyecto", label: "Proyecto", width: "180px" },
  { key: "idSite", label: "Id Site", width: "100px" },
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
  { key: "adjuntos", label: "Adjuntos", width: "130px" },
] as const;

const reciboColumns = [
  { key: "seleccion", label: "", width: "44px" },
  { key: "correlativo", label: "Item", width: "80px" },
  { key: "fecIngreso", label: "Fecha", width: "95px" },
  { key: "subtotal", label: "Subtotal", width: "90px" },
  { key: "igv", label: "IGV", width: "80px" },
  { key: "total", label: "Total", width: "90px" },
  { key: "detalle", label: "Detalle", width: "260px" },
  { key: "comprobante", label: "Comprobante", width: "120px" },
  { key: "responsable", label: "Responsable", width: "180px" },
  { key: "nroDocumento", label: "Nro.Doc", width: "110px" },
  { key: "estado", label: "Estado", width: "110px" },
  { key: "tarea", label: "Tarea", width: "140px" },
] as const;

const montoOcColumns = [
  { key: "idOc", label: "IdOC", width: "80px" },
  { key: "idSite", label: "IdSite", width: "90px" },
  { key: "tipoTrabajo", label: "Tipo Trabajo", width: "130px" },
  { key: "montoOc", label: "Monto Cliente", width: "120px" },
  { key: "nombreSite", label: "Site", width: "150px" },
  { key: "pagadoFic", label: "Pagado Fic", width: "110px" },
  { key: "avanceFic", label: "Avance Fic", width: "100px" },
  { key: "detalle", label: "Detalle", width: "360px" },
  { key: "estado", label: "Estado", width: "120px" },
  { key: "fila", label: "Fila", width: "70px" },
  { key: "solicitante", label: "Solicitante", width: "180px" },
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

function formatPercent(value: number | null | undefined) {
  return `${(toNumber(value) * 100).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("es-PE");
}

function normalizeColumnValue(value: unknown) {
  return String(value ?? "").trim();
}

function matchesColumnFilterValue(value: unknown, selectedValues: string[]) {
  if (!selectedValues.length) return true;
  return selectedValues.includes(normalizeColumnValue(value));
}

function getUniqueSorted(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, "es", { sensitivity: "base" })
  );
}

function buildResumen(values: string[]) {
  const unique = getUniqueSorted(values);
  if (unique.length <= 2) return unique.join(" / ");
  return `${unique.slice(0, 2).join(" / ")} +${unique.length - 2}`;
}

function getNivelLabel(nivel: number) {
  if (nivel === 1) return "1Ò�a�ª validación";
  if (nivel === 2) return "2Ò�a�ª validación";
  if (nivel === 3) return "3Ò�a�ª validación";
  return `${nivel}Ò�a�ª validación`;
}

function buildCabeceraCardTitle(item: OrdenCompraCabeceraDto) {
  return item.comprobante?.trim() || "Orden de compra";
}

function getEstadoVista(item: OrdenCompraCabeceraDto): Exclude<EstadoVista, "todos"> {
  const estado = (item.estado ?? "").toLowerCase();
  if (item.idEstado === 6 || estado.includes("rechaz")) return "rechazadas";
  if (estado.includes("aprob")) return "aprobadas";
  return "pendientes";
}

function formatValidadorNivel(value: number | null | undefined) {
  return value && value > 0 ? `Registrado (${value})` : "Pendiente";
}

function getNivelPendiente(item: OrdenCompraCabeceraDto) {
  if (getEstadoVista(item) === "rechazadas") return 0;
  if (!item.idAprobador1 || item.idAprobador1 <= 0) return 1;
  if (!item.idAprobador2 || item.idAprobador2 <= 0) return 2;
  if (!item.idAprobador3 || item.idAprobador3 <= 0) return 3;
  return 4;
}

function distinctCabecerasPorOc(items: OrdenCompraCabeceraDto[]) {
  const porOc = new Map<number, OrdenCompraCabeceraDto>();

  items.forEach((item) => {
    if (!porOc.has(item.idOc)) {
      porOc.set(item.idOc, item);
    }
  });

  return Array.from(porOc.values());
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

function downloadBlob(blob: Blob, fileName: string) {
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

export default function OcV1Page() {
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
  const [detalleSeleccionado, setDetalleSeleccionado] = useState<OrdenCompraDetalleDto | null>(null);
  const [recibosAsociados, setRecibosAsociados] = useState<OrdenCompraReciboDto[]>([]);
  const [recibosSinAsociar, setRecibosSinAsociar] = useState<OrdenCompraReciboDto[]>([]);
  const [recibosLoading, setRecibosLoading] = useState(false);
  const [recibosSeleccionados, setRecibosSeleccionados] = useState<number[]>([]);
  const [asociandoRecibos, setAsociandoRecibos] = useState(false);
  const [montoOcRows, setMontoOcRows] = useState<OrdenCompraMontoOcDto[]>([]);
  const [montoOcLoading, setMontoOcLoading] = useState(false);
  const [reporteDetalles, setReporteDetalles] = useState<OrdenCompraDetalleDto[]>([]);
  const [reportePlanillaRows, setReportePlanillaRows] = useState<Record<string, unknown>[]>([]);
  const [reportePlanillaColumns, setReportePlanillaColumns] = useState<string[]>([]);
  const [reporteConsultado, setReporteConsultado] = useState(false);
  const [pdfExportingOc, setPdfExportingOc] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reporteLoading, setReporteLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedOcId, setSelectedOcId] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [draft, setDraft] = useState<OrdenCompraDraft>(createInitialDraft);
  const [detalleForm, setDetalleForm] = useState<OrdenCompraDraftDetalle>(createEmptyDetalle);
  const [editingDetalleId, setEditingDetalleId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [estadoVista, setEstadoVista] = useState<EstadoVista>("todos");
  const [vistaOc, setVistaOc] = useState<VistaOc>("aprobacion");
  const [reporteSubtab, setReporteSubtab] = useState<"listado" | "oc-gastos" | "resumen">("listado");
  const [nivelAprobacion, setNivelAprobacion] = useState<1 | 2 | 3>(1);
  const [filtroValidadorAprobacion, setFiltroValidadorAprobacion] = useState<string[]>([]);
  const [detalleOcTab, setDetalleOcTab] = useState<DetalleOcTab>("detalle");
  const [selectedOcIds, setSelectedOcIds] = useState<number[]>([]);
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
  const [detalleCompleto, setDetalleCompleto] = useState<string | null>(null);
  const [rechazoError, setRechazoError] = useState("");
  const [rechazando, setRechazando] = useState(false);
  const [idsOcRechazo, setIdsOcRechazo] = useState<number[]>([]);
  const [aprobando, setAprobando] = useState(false);
  const [reporteFiltros, setReporteFiltros] = useState<ReporteFiltros>({
    solicitante: "",
    responsable: "",
    cliente: "",
    proyecto: "",
    site: "",
    estado: "",
    idOc: "",
    tipoOc: "con",
    fechaDesde: "",
    fechaHasta: "",
  });
  const [responsablesReporteFiltro, setResponsablesReporteFiltro] = useState<string[]>([]);
  const [busquedaResponsableReporte, setBusquedaResponsableReporte] = useState("");
  const [solicitantesReporteFiltro, setSolicitantesReporteFiltro] = useState<string[]>([]);
  const [busquedaSolicitanteReporte, setBusquedaSolicitanteReporte] = useState("");
  const [sitesReporteFiltro, setSitesReporteFiltro] = useState<string[]>([]);
  const [busquedaSiteReporte, setBusquedaSiteReporte] = useState("");

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
        const [solicitantes, gestores, validadores, responsables] = await Promise.allSettled([
          listarSolicitanteOptions({
            idCargo: userCargoId > 0 ? userCargoId : null,
            idEmpleado: userId > 0 ? userId : null,
          }),
          listarGestorOptions(),
          listarValidadorOptions(),
          listarEmpleadosCta(),
        ]);
        if (solicitantes.status === "fulfilled") setSolicitanteOptions(solicitantes.value);
        if (gestores.status === "fulfilled") setGestorOptions(gestores.value);
        if (validadores.status === "fulfilled") setValidadorOptions(validadores.value);
        if (responsables.status === "fulfilled") setResponsableOptions(responsables.value);
      } catch (err) {
        console.warn("No se pudieron cargar los catálogos auxiliares.", err);
      }
    };

    void loadOptions();
  }, [userCargoId, userId]);

  const loadCabeceras = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await buscarOrdenCompraCabecera();
      const cabecerasUnicas = distinctCabecerasPorOc(Array.isArray(response) ? response : []);
      setCabeceras(cabecerasUnicas);
      if (selectedOcId) {
        const stillExists = cabecerasUnicas.some((item) => item.idOc === selectedOcId);
        if (!stillExists) {
          setSelectedOcId(null);
          setDetalles([]);
        }
      }
    } catch (err) {
      setError("No se pudo cargar la bandeja de órdenes de compra. Intente actualizar nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  const loadDetalles = async (idOc: number) => {
    setDetailLoading(true);
    setError("");
    try {
      const response = await buscarOrdenCompraDetalle({ idOc: String(idOc) });
      const rows = Array.isArray(response) ? response : [];
      setDetalles(rows);
      setDetalleSeleccionado(rows[0] ?? null);
    } catch (err) {
      // Es una carga secundaria del panel derecho; no debe mostrar un error
      // global si la OC ya cambi� o el usuario cambi� de pesta�a.
      console.warn("No se pudo cargar el detalle de la orden de compra.", err);
      setDetalles([]);
      setDetalleSeleccionado(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const loadRecibosOc = useCallback(async (idOc: number, fila?: number | null) => {
    setRecibosLoading(true);
    setRecibosSeleccionados([]);
    try {
      const params = { idOc, fila: fila ?? null };
      const [asociados, sinAsociar] = await Promise.all([
        buscarRecibosAsociadosOrdenCompra(params),
        buscarRecibosSinAsociarOrdenCompra(params),
      ]);
      setRecibosAsociados(Array.isArray(asociados) ? asociados : []);
      setRecibosSinAsociar(Array.isArray(sinAsociar) ? sinAsociar : []);
    } catch (err) {
      console.warn("No se pudo cargar los recibos de la orden de compra.", err);
      setRecibosAsociados([]);
      setRecibosSinAsociar([]);
    } finally {
      setRecibosLoading(false);
    }
  }, []);

  const loadMontoOc = useCallback(async (idOc: number, fila?: number | null) => {
    setMontoOcLoading(true);
    try {
      const data = await buscarMontoOcOrdenCompra({ idOc, fila: fila ?? null });
      setMontoOcRows(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn("No se pudo cargar el monto de la OC.", err);
      setMontoOcRows([]);
    } finally {
      setMontoOcLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedOcId) {
      void loadRecibosOc(selectedOcId, detalleSeleccionado?.fila ?? null);
      void loadMontoOc(selectedOcId, detalleSeleccionado?.fila ?? null);
    } else {
      setRecibosAsociados([]);
      setRecibosSinAsociar([]);
      setRecibosSeleccionados([]);
      setMontoOcRows([]);
    }
  }, [detalleSeleccionado?.fila, loadMontoOc, loadRecibosOc, selectedOcId]);

  const loadReporteDetalles = async () => {
    setReporteLoading(true);
    setReporteConsultado(true);
    setError("");
    try {
      if (reporteSubtab === "oc-gastos") {
        const responsableNombre = responsablesReporteFiltro[0] ?? "";
        const responsableId = responsableNombre
          ? cabeceras.find((item) => item.responsable === responsableNombre)?.idResponsable
          : undefined;
        const request = buildPlanillaConsultaEstadosRequest([
          { nombre: "Estados", valor: reporteFiltros.estado || "0,2,3,4,6", tipo: "string" },
          ...(reporteFiltros.fechaDesde ? [{ nombre: "FechaInicio", valor: reporteFiltros.fechaDesde, tipo: "date" as const }] : []),
          ...(reporteFiltros.fechaHasta ? [{ nombre: "FechaFin", valor: reporteFiltros.fechaHasta, tipo: "date" as const }] : []),
          ...(responsableId ? [{ nombre: "IdResponsable", valor: String(responsableId), tipo: "int" as const }] : []),
        ]);
        request.consulta = "analisis-gastos";
        const response = await consultarPlanillaEstados(request, { timeoutMs: 60000 });
        const rows = Array.isArray(response?.rows) ? response.rows : [];
        const rowsFiltradas = reporteFiltros.tipoOc === "con"
          ? rows.filter((row) => {
            const key = Object.keys(row).find((item) => item.toLowerCase() === "idoc");
            const value = key ? row[key] : null;
            return value !== null && value !== undefined && String(value).trim() !== "" && Number(value) !== 0;
          })
          : rows;
        setReportePlanillaRows(rowsFiltradas);
        const storeColumns = Array.isArray(response?.columns) ? response.columns : [];
        setReportePlanillaColumns(storeColumns.length ? OC_GASTOS_COLUMNAS_INICIALES.filter((column) => column === "TotalOc" || storeColumns.some((available) => available.toLowerCase() === column.toLowerCase())) : OC_GASTOS_COLUMNAS_INICIALES);
        return;
      }
      const response = await buscarOrdenCompraDetalle();
      setReporteDetalles(Array.isArray(response) ? response : []);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo cargar el detalle para el reporte de ordenes de compra."));
      setReporteDetalles([]);
    } finally {
      setReporteLoading(false);
    }
  };

  useEffect(() => {
    void loadCabeceras();
  }, []);

  useEffect(() => {
    const tieneFiltro = Object.values(reporteFiltros).some((value) => value.trim().length > 0);
    if (vistaOc === "reporte" && reporteSubtab !== "oc-gastos" && tieneFiltro && !reporteConsultado && !reporteLoading) {
      void loadReporteDetalles();
    }
  }, [reporteConsultado, reporteFiltros, reporteLoading, reporteSubtab, vistaOc]);

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
      { key: "validador", label: "Validador", getValue: (item) => item.validador ?? "" },
      { key: "validador2", label: "Validador 2", getValue: (item) => item.validador2 ?? "" },
      { key: "validador3", label: "Validador 3", getValue: (item) => item.validador3 ?? "" },
      { key: "nombreCliente", label: "Cliente", getValue: (item) => item.nombreCliente ?? "" },
      { key: "nombreProyecto", label: "Proyecto", getValue: (item) => item.nombreProyecto ?? "" },
      { key: "idSite", label: "Id Site", getValue: (item) => item.idSite ?? "" },
      { key: "nombreSite", label: "Site", getValue: (item) => item.nombreSite ?? "" },
      { key: "comprobante", label: "Comprobante", getValue: (item) => item.comprobante },
      { key: "moneda", label: "Moneda", getValue: (item) => item.moneda },
      { key: "subtotal", label: "Subtotal", getValue: (item) => item.subtotal },
      { key: "igv", label: "IGV", getValue: (item) => item.igv },
      { key: "total", label: "Total", getValue: (item) => item.total },
      { key: "idAprobador1", label: "1er validador", getValue: (item) => formatValidadorNivel(item.idAprobador1) },
      { key: "idAprobador2", label: "2do validador", getValue: (item) => formatValidadorNivel(item.idAprobador2) },
      { key: "idAprobador3", label: "3er validador", getValue: (item) => formatValidadorNivel(item.idAprobador3) },
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
      case "idAprobador1":
        return formatValidadorNivel(item.idAprobador1);
      case "idAprobador2":
        return formatValidadorNivel(item.idAprobador2);
      case "idAprobador3":
        return formatValidadorNivel(item.idAprobador3);
      default:
        return String((item as Record<string, unknown>)[key] ?? "");
    }
  };

  const cabecerasBaseFiltradas = useMemo(
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

  const cabecerasFiltradas = useMemo(
    () =>
      cabecerasBaseFiltradas.filter((item) =>
        estadoVista === "todos" ? true : getEstadoVista(item) === estadoVista
      ),
    [cabecerasBaseFiltradas, estadoVista]
  );

  const resumenCabeceras = useMemo(() => {
    const total = cabecerasBaseFiltradas.length;
    const pendientes = cabecerasBaseFiltradas.filter((item) => getEstadoVista(item) === "pendientes").length;
    const aprobadas = cabecerasBaseFiltradas.filter((item) => getEstadoVista(item) === "aprobadas").length;
    const rechazadas = cabecerasBaseFiltradas.filter((item) => getEstadoVista(item) === "rechazadas").length;
    const monto = cabecerasFiltradas.reduce((sum, item) => sum + toNumber(item.total), 0);
    return { total, pendientes, aprobadas, rechazadas, monto };
  }, [cabecerasBaseFiltradas, cabecerasFiltradas]);

  const validadorLabelById = useMemo(() => {
    const result = new Map<string, string>();
    validadorOptions.forEach((option) => {
      const key = normalizeOptionValue(option);
      if (key) {
        result.set(key, option.label);
      }
    });
    return result;
  }, [validadorOptions]);

  const getValidadorAgrupacion = useCallback((item: OrdenCompraCabeceraDto) => {
    const idValidador = item.idValidador ? String(item.idValidador) : "";
    const fallbackValidador = idValidador ? validadorLabelById.get(idValidador) ?? `Validador ${idValidador}` : "";

    if (nivelAprobacion === 2) {
      return item.validador2?.trim() || fallbackValidador || "Sin validador 2";
    }

    if (nivelAprobacion === 3) {
      return item.validador3?.trim() || fallbackValidador || "Sin validador 3";
    }

    return item.validador?.trim() || fallbackValidador || "Sin validador";
  }, [nivelAprobacion, validadorLabelById]);

  const conteoNiveles = useMemo(
    () => ({
      nivel1: cabecerasFiltradas.filter((item) => getNivelPendiente(item) === 1).length,
      nivel2: cabecerasFiltradas.filter((item) => getNivelPendiente(item) === 2).length,
      nivel3: cabecerasFiltradas.filter((item) => getNivelPendiente(item) === 3).length,
      cerradas: cabecerasFiltradas.filter((item) => getNivelPendiente(item) === 4).length,
    }),
    [cabecerasFiltradas]
  );

  const validadorFiltroOptions = useMemo(
    () => Array.from(
      new Set(
        cabecerasFiltradas
          .filter((item) => getNivelPendiente(item) === nivelAprobacion)
          .map((item) => getValidadorAgrupacion(item))
          .filter(Boolean)
      )
    ).sort((left, right) => left.localeCompare(right, "es", { sensitivity: "base" })),
    [cabecerasFiltradas, getValidadorAgrupacion, nivelAprobacion]
  );

  useEffect(() => {
    if (filtroValidadorAprobacion.some((validador) => !validadorFiltroOptions.includes(validador))) {
      setFiltroValidadorAprobacion((prev) => prev.filter((validador) => validadorFiltroOptions.includes(validador)));
    }
  }, [filtroValidadorAprobacion, validadorFiltroOptions]);

  const cabecerasBandeja = useMemo(
    () => cabecerasFiltradas
      .filter((item) => getNivelPendiente(item) === nivelAprobacion)
      .filter((item) => filtroValidadorAprobacion.length === 0 || filtroValidadorAprobacion.includes(getValidadorAgrupacion(item))),
    [cabecerasFiltradas, filtroValidadorAprobacion, getValidadorAgrupacion, nivelAprobacion]
  );

  const cabecerasBandejaIds = useMemo(
    () => cabecerasBandeja.map((item) => item.idOc),
    [cabecerasBandeja]
  );

  const seleccionadasEnBandeja = useMemo(
    () => selectedOcIds.filter((idOc) => cabecerasBandejaIds.includes(idOc)),
    [cabecerasBandejaIds, selectedOcIds]
  );

  const todasLasCabecerasVisiblesSeleccionadas =
    cabecerasBandejaIds.length > 0 && cabecerasBandejaIds.every((idOc) => selectedOcIds.includes(idOc));

  const cambiarNivelAprobacion = useCallback((nivel: 1 | 2 | 3) => {
    setNivelAprobacion(nivel);
    setFiltroValidadorAprobacion([]);
    // Al cambiar de nivel no conservar la OC ni la informaci�n del panel
    // derecho, ya que pertenece exclusivamente a la pesta�a anterior.
    setSelectedOcId(null);
    setSelectedOcIds([]);
    setDetalles([]);
    setDetalleSeleccionado(null);
    setRecibosAsociados([]);
    setRecibosSinAsociar([]);
    setRecibosSeleccionados([]);
    setMontoOcRows([]);
    setDetalleOcTab("detalle");
  }, []);

  const validadorFiltroLabel = nivelAprobacion === 1
    ? "Validadores"
    : nivelAprobacion === 2
      ? "2dos validadores"
      : "3ros validadores";

  const cabecerasBandejaAgrupadas = useMemo(() => {
    const grupos = new Map<string, OrdenCompraCabeceraDto[]>();
    cabecerasBandeja.forEach((item) => {
      const solicitante = item.solicitante?.trim() || "Sin solicitante";
      const validador = getValidadorAgrupacion(item);
      const key = `${solicitante}|||${validador}`;
      const actuales = grupos.get(key) ?? [];
      actuales.push(item);
      grupos.set(key, actuales);
    });

    return Array.from(grupos.entries())
      .map(([key, items]) => {
        const [solicitante, validador] = key.split("|||");
        return {
          solicitante,
          validador,
          items: items.sort((left, right) => left.idOc - right.idOc),
        };
      })
      .sort((left, right) => {
        const solicitanteCompare = left.solicitante.localeCompare(right.solicitante, "es", { sensitivity: "base" });
        if (solicitanteCompare !== 0) return solicitanteCompare;
        return left.validador.localeCompare(right.validador, "es", { sensitivity: "base" });
      });
  }, [cabecerasBandeja, getValidadorAgrupacion]);

  const opcionesFiltroPorColumna = useMemo(() => {
    const result: Record<string, string[]> = {};
    searchFields.forEach((field) => {
      result[field.key] = Array.from(
        new Set(cabeceras.map((item) => normalizeColumnValue(getCabeceraColumnValue(item, field.key))))
      ).sort((left, right) => left.localeCompare(right, "es", { sensitivity: "base" }));
    });
    return result;
  }, [cabeceras, searchFields]);

  const reporteRows = useMemo(() => {
    const tieneFiltro = Object.values(reporteFiltros).some((value) => value.trim().length > 0);
    if (!tieneFiltro || !reporteConsultado) return [];

    const detallePorOc = new Map<number, OrdenCompraDetalleDto[]>();
    reporteDetalles.forEach((detalle) => {
      if (!detalle.idOc) return;
      const actuales = detallePorOc.get(detalle.idOc) ?? [];
      actuales.push(detalle);
      detallePorOc.set(detalle.idOc, actuales);
    });

    return cabecerasFiltradas.map((cabecera) => {
      const detallesOc = detallePorOc.get(cabecera.idOc) ?? [];
      const clientes = getUniqueSorted([cabecera.nombreCliente ?? "", ...detallesOc.map((item) => item.nombreCliente ?? "")]);
      const proyectos = getUniqueSorted([cabecera.nombreProyecto ?? "", ...detallesOc.map((item) => item.nombreProyecto ?? "")]);
      const sites = getUniqueSorted([cabecera.nombreSite || cabecera.idSite || "", ...detallesOc.map((item) => item.nombreSite || item.idSite || "")]);

      return {
        ...cabecera,
        clientes,
        proyectos,
        sites,
        clienteResumen: buildResumen(clientes),
        proyectoResumen: buildResumen(proyectos),
        siteResumen: buildResumen(sites),
      };
    });
  }, [cabecerasFiltradas, reporteConsultado, reporteDetalles, reporteFiltros]);

  const reporteOptions = useMemo(() => ({
    solicitantes: getUniqueSorted(cabeceras.map((item) => item.solicitante)),
    responsables: getUniqueSorted(cabeceras.map((item) => item.responsable)),
    clientes: getUniqueSorted(cabeceras.map((item) => item.nombreCliente ?? "")),
    proyectos: getUniqueSorted(cabeceras.map((item) => item.nombreProyecto ?? "")),
    sites: getUniqueSorted(cabeceras.map((item) => item.nombreSite || item.idSite || "")),
    estados: getUniqueSorted(cabeceras.map((item) => item.estado)),
  }), [cabeceras]);

  const reporteRowsFiltradas = useMemo(() => {
    const idOcFiltro = reporteFiltros.idOc.trim();
    return reporteRows.filter((item) => {
      if (solicitantesReporteFiltro.length && !solicitantesReporteFiltro.includes(item.solicitante)) return false;
      if (responsablesReporteFiltro.length && !responsablesReporteFiltro.includes(item.responsable)) return false;
      if (reporteFiltros.cliente && !item.clientes.includes(reporteFiltros.cliente)) return false;
      if (reporteFiltros.proyecto && !item.proyectos.includes(reporteFiltros.proyecto)) return false;
      if (sitesReporteFiltro.length && !item.sites.some((site) => sitesReporteFiltro.includes(site))) return false;
      if (reporteFiltros.estado && item.estado !== reporteFiltros.estado) return false;
      if (idOcFiltro && !String(item.idOc).includes(idOcFiltro)) return false;
      const fechaItem = item.fecha ? item.fecha.slice(0, 10) : "";
      if (reporteFiltros.fechaDesde && (!fechaItem || fechaItem < reporteFiltros.fechaDesde)) return false;
      if (reporteFiltros.fechaHasta && (!fechaItem || fechaItem > reporteFiltros.fechaHasta)) return false;
      return true;
    });
  }, [reporteFiltros, reporteRows, responsablesReporteFiltro, solicitantesReporteFiltro, sitesReporteFiltro]);

  const exportReporteOcPdf = useCallback(async (item: (typeof reporteRows)[number]) => {
    setPdfExportingOc(item.idOc);
    setError("");

    try {
      const blob = await descargarOrdenCompraPdf(item.idOc);
      if (!blob || blob.size === 0) {
        throw new Error("El PDF generado no contiene datos.");
      }

      const year = item.fecha ? new Date(item.fecha).getFullYear() : new Date().getFullYear();
      downloadBlob(blob, `OC_${item.idOc}_${Number.isFinite(year) ? year : new Date().getFullYear()}.pdf`);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo exportar el PDF de la orden de compra."));
    } finally {
      setPdfExportingOc(null);
    }
  }, []);

  const selectedCabecera = useMemo(
    () => cabeceras.find((item) => item.idOc === selectedOcId) ?? null,
    [cabeceras, selectedOcId]
  );

  const detalleMontoResumen = useMemo(
    () => detalles.reduce(
      (acc, item) => ({
        subtotal: acc.subtotal + toNumber(item.subtotalD),
        igv: acc.igv + toNumber(item.igvD),
        total: acc.total + toNumber(item.totalD),
      }),
      { subtotal: 0, igv: 0, total: 0 }
    ),
    [detalles]
  );

  const isAccepted = (selectedCabecera?.estado ?? "").toLowerCase().includes("aprobado");

  useEffect(() => {
    setSelectedOcIds((prev) => prev.filter((idOc) => cabeceras.some((item) => item.idOc === idOc)));
  }, [cabeceras]);

  const toggleSeleccionOc = useCallback((idOc: number, checked: boolean) => {
    setSelectedOcIds((prev) => {
      if (checked) {
        return prev.includes(idOc) ? prev : [...prev, idOc];
      }
      return prev.filter((item) => item !== idOc);
    });
  }, []);

  const toggleSeleccionVisible = useCallback((checked: boolean) => {
    setSelectedOcIds((prev) => {
      if (checked) {
        return Array.from(new Set([...prev, ...cabecerasBandejaIds]));
      }
      return prev.filter((idOc) => !cabecerasBandejaIds.includes(idOc));
    });
  }, [cabecerasBandejaIds]);
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
      (detalleActual.filtroOperativo.tipoTrabajo?.tipoTrabajo || detalleActual.filtroOperativo.filtro?.tipoTrabajo) &&
      detalleActual.filtroOperativo.tarea?.correlativo &&
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
      setError("Cada posición debe tener cliente, proyecto, site, tipo de trabajo, tarea, comprobante, tipo de pago, moneda, cantidad y precio unitario.");
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
      setError("Debe registrar al menos una posiciÃ³n.");
      return false;
    }

    return true;
  };

  const saveDraft = async () => {
    if (!validateDraft()) {
      return;
    }

    const uploadDetalleArchivo = async (file: File | null, currentCode: string) => {
      if (!file) {
        return currentCode.trim();
      }

      const response = await subirArchivoOrdenCompra(file, "1");
      return response.codigo?.trim() ?? "";
    };

    setSaving(true);
    setError("");
    try {
      const detallesConArchivos = await Promise.all(
        draft.detalles.map(async (item) => ({
          ...item,
          imgOc: await uploadDetalleArchivo(item.ocClienteArchivo, item.imgOc),
          imgPresupuesto: await uploadDetalleArchivo(item.presupuestoArchivo, item.imgPresupuesto),
        }))
      );

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
      detalle: detallesConArchivos.map((item) => ({
        idCliente: Number(item.filtroOperativo.filtro?.idCliente ?? 0),
        idProyecto: Number(item.filtroOperativo.filtro?.idProyecto ?? 0),
        idSite: String(item.filtroOperativo.filtro?.idSite ?? ""),
        correlativo: Number(item.filtroOperativo.filtro?.correlativo ?? 0),
        tipoTrabajo: String(item.filtroOperativo.tipoTrabajo?.tipoTrabajo ?? item.filtroOperativo.filtro?.tipoTrabajo ?? ""),
        idTarea: Number(item.filtroOperativo.tarea?.correlativo ?? 0),
        ot: String(item.filtroOperativo.ot?.ot ?? item.filtroOperativo.filtro?.ot ?? ""),
        detalle: item.detalle.trim(),
        cantidad: toNumber(item.cantidad),
        precioUnitario: toNumber(item.precioUnitario),
        idComprobante: Number(item.comprobante || draft.comprobante || 0),
        imgOc: item.imgOc,
        imgPresupuesto: item.imgPresupuesto,
        peso: toNumber(item.peso),
      })),
    };

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
        idAprobador: userId > 0 ? userId : undefined,
      };
      console.log('[OC] Params enviados a rechazarOrdenCompraMasivo:', params);
      await rechazarOrdenCompraMasivo(params);

      const totalRechazadas = idsOcRechazo.length;
      cancelarRechazo();
      setSelectedOcId(null);
      setSelectedOcIds((prev) => prev.filter((idOc) => !idsOcRechazo.includes(idOc)));
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

  const aprobarOrdenSeleccionada = useCallback(async () => {
    const idsAprobar = seleccionadasEnBandeja.length > 0
      ? seleccionadasEnBandeja
      : selectedCabecera?.idOc
        ? [selectedCabecera.idOc]
        : [];

    if (idsAprobar.length === 0) {
      setError("Seleccione al menos una orden de compra para aprobar.");
      return;
    }

    try {
      setAprobando(true);
      setError("");
      setMessage("");
      await aprobarOrdenCompra({
        idsOc: idsAprobar,
        nivel: nivelAprobacion,
        idAprobador: userId > 0 ? userId : undefined,
        observacion: `Aprobacion desde OC v1 - nivel ${nivelAprobacion}`,
      });
      setSelectedOcIds((prev) => prev.filter((idOc) => !idsAprobar.includes(idOc)));
      setMessage(
        idsAprobar.length === 1
          ? `Orden de compra ${idsAprobar[0]} aprobada en nivel ${nivelAprobacion}.`
          : `${idsAprobar.length} ordenes de compra aprobadas en nivel ${nivelAprobacion}.`
      );
      await loadCabeceras();
      if (selectedCabecera?.idOc) {
        await loadDetalles(selectedCabecera.idOc);
      }
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo aprobar la orden de compra."));
    } finally {
      setAprobando(false);
    }
  }, [nivelAprobacion, seleccionadasEnBandeja, selectedCabecera?.idOc, userId]);

  const asociarRecibosSeleccionados = useCallback(async () => {
    if (!selectedOcId) {
      setError("Seleccione una orden de compra para asociar recibos.");
      return;
    }

    if (recibosSeleccionados.length === 0) {
      setError("Seleccione al menos un recibo sin asociar.");
      return;
    }

    setAsociandoRecibos(true);
    setError("");
    setMessage("");
    try {
      const result = await asociarRecibosOrdenCompra({
        idOc: selectedOcId,
        fila: detalleSeleccionado?.fila ?? null,
        nivel: nivelAprobacion,
        correlativos: recibosSeleccionados,
      });
      await loadRecibosOc(selectedOcId, detalleSeleccionado?.fila ?? null);
      setMessage(`${result.asociados} recibo(s) asociado(s) correctamente.`);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo asociar los recibos seleccionados."));
    } finally {
      setAsociandoRecibos(false);
    }
  }, [detalleSeleccionado?.fila, loadRecibosOc, nivelAprobacion, recibosSeleccionados, selectedOcId]);

  return (
    <div style={styles.page}>
      <section style={ocV1Styles.topbar}>
        <div style={ocV1Styles.crumbs}>Finanzas <b>/</b> Facturación financiera <b>/</b> <b>Ordenes de compra</b></div>
        <div style={ocV1Styles.titleRow}>
          <div>
            <h1 style={ocV1Styles.title}>Ordenes de compra <span style={ocV1Styles.docId}>{selectedCabecera ? `#OC-${selectedCabecera.idOc}` : "Bandeja"}</span></h1>
            <p style={ocV1Styles.subtitle}>Registro, aprobación por niveles, adjuntos y trazabilidad de OC.</p>
          </div>
          <div style={ocV1Styles.actions}>
            <button type="button" style={styles.secondaryButton} onClick={() => { setVistaOc("reporte"); setPanelOpen(false); }}>Reporte</button>
            <button type="button" style={styles.secondaryButton} onClick={() => exportToCsv(
              `ordenes_compra_${today}.csv`,
              cabeceraColumns.map((column) => column.label),
              cabecerasFiltradas.map((item) => [
                item.idOc,
                item.fecha ? new Date(item.fecha).toLocaleDateString("es-PE") : "",
                item.responsable,
                item.comprobante,
                formatMoney(item.total),
                item.moneda,
              ])
            )}>Exportar Excel</button>
            <button type="button" style={styles.primaryButton} onClick={openNuevo}>Nueva OC</button>
          </div>
        </div>
      </section>
      <div style={ocV1Styles.viewTabs}>
        <button type="button" style={{ ...ocV1Styles.viewTab, ...(vistaOc === "registro" ? ocV1Styles.viewTabActive : {}) }} onClick={() => { setVistaOc("registro"); openNuevo(); }}>Registro</button>
        <button type="button" style={{ ...ocV1Styles.viewTab, ...(vistaOc === "aprobacion" ? ocV1Styles.viewTabActive : {}) }} onClick={() => { setVistaOc("aprobacion"); setPanelOpen(false); }}>Bandeja de aprobación</button>
        <button type="button" style={{ ...ocV1Styles.viewTab, ...(vistaOc === "reporte" ? ocV1Styles.viewTabActive : {}) }} onClick={() => { setVistaOc("reporte"); setPanelOpen(false); }}>Seguimiento de pagos</button>
      </div>
      {vistaOc === "registro" ? (
        <section style={ocV1Styles.view}>
          <div style={styles.workspaceGrid}>
            <section style={{ ...styles.card, display: "none" }}>
              <div style={styles.sectionHeader}>
                <div>
                  <h2 style={styles.sectionTitle}>Registro de orden de compra</h2>
                  <p style={styles.sectionText}>Cree la cabecera, el beneficiario de pago, los adjuntos y los items.</p>
                </div>
                <button type="button" style={styles.primaryButton} onClick={openNuevo}>Nueva orden</button>
              </div>
              <div style={styles.detailResume}>
                <div><span style={styles.resumeLabel}>Flujo</span><strong>Solicitante / Gestor / Validador</strong></div>
                <div><span style={styles.resumeLabel}>Beneficiario</span><strong>Responsable, banco y cuentas</strong></div>
                <div><span style={styles.resumeLabel}>Adjuntos</span><strong>OC cliente y presupuesto</strong></div>
                <div><span style={styles.resumeLabel}>Detalle</span><strong>Cliente, proyecto, site, OT, tarea e importes</strong></div>
              </div>
            </section>
            <section style={{ ...styles.card, display: "none" }}>
              <div style={styles.sectionHeader}>
                <div>
                  <h2 style={styles.sectionTitle}>Resumen de registro</h2>
                  <p style={styles.sectionText}>Datos acumulados del borrador abierto.</p>
                </div>
              </div>
              <div style={styles.summaryBoard}>
                <SummaryCard label="Items" value={String(draft.detalles.length)} />
                <SummaryCard label="Subtotal" value={formatMoney(draftTotals.subtotal)} />
                <SummaryCard label="IGV" value={formatMoney(draftTotals.igv)} />
                <SummaryCard label="Total" value={formatMoney(draftTotals.total)} />
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {vistaOc === "aprobacion" ? (
      <>
      <div style={ocV1Styles.stageToolbar}>
        <div style={ocV1Styles.stageSwitch}>
          <button type="button" style={{ ...ocV1Styles.stageButton, ...(nivelAprobacion === 1 ? ocV1Styles.stageButtonActive : {}) }} onClick={() => cambiarNivelAprobacion(1)}>
            1ra validación <span style={ocV1Styles.stageCount}>{conteoNiveles.nivel1}</span>
          </button>
          <button type="button" style={{ ...ocV1Styles.stageButton, ...(nivelAprobacion === 2 ? ocV1Styles.stageButtonActive : {}) }} onClick={() => cambiarNivelAprobacion(2)}>
            2da validación <span style={ocV1Styles.stageCount}>{conteoNiveles.nivel2}</span>
          </button>
          <button type="button" style={{ ...ocV1Styles.stageButton, ...(nivelAprobacion === 3 ? ocV1Styles.stageButtonActive : {}) }} onClick={() => cambiarNivelAprobacion(3)}>
            3ra validación <span style={ocV1Styles.stageCount}>{conteoNiveles.nivel3}</span>
          </button>
        </div>
        <div style={ocV1Styles.stageSearchActions}>
          <ApprovalQuickSearch
            value={busqueda}
            onChange={setBusqueda}
            placeholder="Búsqueda rápida de OC, responsable, validador..."
          />
          <ApprovalValidatorMultiFilter
            label={validadorFiltroLabel}
            options={validadorFiltroOptions}
            selected={filtroValidadorAprobacion}
            onChange={setFiltroValidadorAprobacion}
          />
          <div style={styles.actionRow}>
            <button
              type="button"
              style={styles.rejectButton}
              disabled={rechazando || aprobando || (!selectedCabecera && seleccionadasEnBandeja.length === 0)}
              onClick={() => abrirRechazo(
                seleccionadasEnBandeja.length > 0
                  ? seleccionadasEnBandeja
                  : selectedCabecera?.idOc
                    ? [selectedCabecera.idOc]
                    : []
              )}
            >
              {seleccionadasEnBandeja.length > 1 ? `Rechazar ${seleccionadasEnBandeja.length}` : "Rechazar"}
            </button>
            <button
              type="button"
              style={styles.primaryButton}
              disabled={aprobando || rechazando || (!selectedCabecera && seleccionadasEnBandeja.length === 0)}
              onClick={aprobarOrdenSeleccionada}
            >
              {aprobando
                ? "Aprobando..."
                : seleccionadasEnBandeja.length > 1
                  ? `Aprobar ${seleccionadasEnBandeja.length} - nivel ${nivelAprobacion}`
                  : `Aprobar nivel ${nivelAprobacion}`}
            </button>
          </div>
        </div>
      </div>


      {/* Solo mostrar error general si NO estÒ�� �"Ò�a�¡ abierto el panel de nueva orden */}
      {!panelOpen && error ? <div style={styles.errorBanner}>{error}</div> : null}
      {message ? <div style={styles.successBanner}>{message}</div> : null}

      <div style={styles.workspaceGrid}>
      <section style={{ ...styles.card, ...styles.masterCard }}>
        
        <div style={styles.approvalListWrap}>
          <div style={styles.approvalSelectionBar}>
            <label style={styles.approvalCheckLabel}>
              <input
                type="checkbox"
                checked={todasLasCabecerasVisiblesSeleccionadas}
                disabled={cabecerasBandejaIds.length === 0}
                onChange={(event) => toggleSeleccionVisible(event.target.checked)}
              />
              <span>Seleccionar visibles</span>
            </label>
            <span style={styles.approvalSelectionCount}>
              {seleccionadasEnBandeja.length} seleccionada{seleccionadasEnBandeja.length === 1 ? "" : "s"}
            </span>
            {seleccionadasEnBandeja.length > 0 ? (
              <button type="button" style={styles.linkButton} onClick={() => setSelectedOcIds([])}>
                Limpiar
              </button>
            ) : null}
          </div>
          {loading ? (
            <div style={styles.approvalEmpty}>Cargando cabeceras...</div>
          ) : cabecerasBandejaAgrupadas.length === 0 ? (
            <div style={styles.approvalEmpty}>No hay ordenes pendientes para este nivel.</div>
          ) : (
            cabecerasBandejaAgrupadas.map((grupo) => (
              <div key={`grupo-${nivelAprobacion}-${grupo.solicitante}-${grupo.validador}`} style={styles.approvalGroup}>
                <div style={styles.approvalGroupHeader}>
                  <strong>{grupo.solicitante} - {grupo.validador}</strong>
                  <span>{grupo.items.length}</span>
                </div>
                {grupo.items.map((item) => {
                  const isChecked = selectedOcIds.includes(item.idOc);
                  return (
                  <div
                    key={item.idOc}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedOcId(item.idOc);
                      void loadDetalles(item.idOc);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedOcId(item.idOc);
                        void loadDetalles(item.idOc);
                      }
                    }}
                    style={{
                      ...styles.approvalCard,
                      ...(selectedOcId === item.idOc ? styles.approvalCardActive : {}),
                    }}
                  >
                    <div style={styles.approvalCardLine}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => toggleSeleccionOc(item.idOc, event.target.checked)}
                        style={styles.approvalCheckbox}
                        aria-label={`Seleccionar OC ${item.idOc}`}
                      />
                      <span style={styles.approvalOc}>OC-{item.idOc}</span>
                      <span style={styles.approvalCardMeta}>{item.fecha ? new Date(item.fecha).toLocaleDateString("es-PE") : "-"}</span>
                      <span style={styles.approvalCardMeta} title={item.responsable || ""}>{item.responsable || "-"}</span>
                      <span style={styles.approvalCardTitle} title={item.comprobante || ""}>{item.comprobante || "-"}</span>
                      <span style={styles.approvalAmount}>{formatMoney(item.total)}</span>
                      <span style={styles.approvalCardMeta}>{item.moneda || "-"}</span>
                    </div>
                  </div>
                )})}
              </div>
            ))
          )}
        </div>      </section>

      <section style={{ ...styles.card, ...styles.detailCard }}>
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
        <div style={styles.detailTabs}>
          {[
            { key: "detalle", label: "Detalle" },
            { key: "recibosAsociados", label: "Recibos asociados" },
            { key: "recibosSinAsociar", label: "Recibos sin asociar" },
            { key: "montoOc", label: "Monto de la OC" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              style={{
                ...styles.detailTab,
                ...(detalleOcTab === tab.key ? styles.detailTabActive : {}),
              }}
              onClick={() => setDetalleOcTab(tab.key as DetalleOcTab)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {detalleOcTab === "detalle" ? (
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
                  detalles.map((item) => {
                    const detalleActivo = detalleSeleccionado?.fila === item.fila;
                    return (
                    <tr
                      key={`${item.idOc}-${item.fila}-${item.idCliente}-${item.idProyecto}`}
                      style={{ ...styles.tr, ...(detalleActivo ? styles.trActive : {}) }}
                      onClick={() => setDetalleSeleccionado(item)}
                    >
                      <td style={styles.td}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button type="button" style={styles.smallActionButton} onClick={() => setMessage("La ediciÃ³n detallada queda habilitada desde el segmento Nueva orden.")}>Editar</button>
                        </div>
                      </td>
                      <td style={styles.td}>{item.fila ?? ""}</td>
                      <td style={styles.td}>{item.nombreCliente ?? ""}</td>
                      <td style={styles.td}>{item.nombreProyecto ?? ""}</td>
                      <td style={styles.td}>{item.idSite ?? ""}</td>
                      <td style={styles.td}>{item.nombreSite ?? ""}</td>
                      <td style={styles.td}>{item.tipoTrabajo ?? ""}</td>
                      <td style={styles.td}>{item.ot ?? ""}</td>
                      <td style={styles.td}>{item.tarea ?? ""}</td>
                      <td style={styles.td}>
                        <button
                          type="button"
                          style={styles.truncatedCellButton}
                          title={item.detalle ?? ""}
                          onClick={() => setDetalleCompleto(item.detalle ?? "")}
                        >
                          {item.detalle ?? ""}
                        </button>
                      </td>
                      <td style={styles.td}>{formatMoney(item.cantidad)}</td>
                      <td style={styles.td}>{formatMoney(item.precioUnitario)}</td>
                      <td style={styles.td}>{formatMoney(item.subtotalD)}</td>
                      <td style={styles.td}>{formatMoney(item.igvD)}</td>
                      <td style={styles.td}>{formatMoney(item.totalD)}</td>
                      <td style={styles.td}>
                        <ArchivoButton codigo={item.imgOc} label="Ver OC cliente" />
                        <ArchivoButton codigo={item.imgPresupuesto} label="Ver presupuesto" />
                      </td>
                    </tr>
                  )})
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {detalleOcTab === "recibosAsociados" ? (
          <div>
            <div style={styles.receiptToolbar}>
              <strong>Recibos asociados</strong>
              <span style={styles.counterPill}>{recibosLoading ? "Cargando..." : `${recibosAsociados.length} recibos`}</span>
            </div>
            <RecibosOrdenCompraTable
              rows={recibosAsociados}
              loading={recibosLoading}
              emptyText={selectedCabecera ? "No hay recibos asociados para la posición seleccionada." : "Seleccione una cabecera para visualizar los recibos asociados."}
              selectable={false}
              selectedIds={[]}
              onToggle={() => undefined}
              onDetalleClick={setDetalleCompleto}
            />
          </div>
        ) : null}

        {detalleOcTab === "recibosSinAsociar" ? (
          <div>
            <div style={styles.receiptToolbar}>
              <div>
                <strong>Recibos sin asociar</strong>
                <p style={{ ...styles.sectionText, margin: "2px 0 0" }}>
                  Se muestran recibos compatibles con la posición seleccionada.
                </p>
              </div>
              <div style={styles.actionRow}>
                <span style={styles.counterPill}>{recibosLoading ? "Cargando..." : `${recibosSinAsociar.length} recibos`}</span>
                <button
                  type="button"
                  style={styles.primaryButton}
                  disabled={asociandoRecibos || recibosSeleccionados.length === 0}
                  onClick={asociarRecibosSeleccionados}
                >
                  {asociandoRecibos ? "Asociando..." : `Asociar ${recibosSeleccionados.length || ""}`.trim()}
                </button>
              </div>
            </div>
            <RecibosOrdenCompraTable
              rows={recibosSinAsociar}
              loading={recibosLoading}
              emptyText={selectedCabecera ? "No hay recibos sin asociar para la posición seleccionada." : "Seleccione una cabecera para visualizar los recibos sin asociar."}
              selectable
              selectedIds={recibosSeleccionados}
              onToggle={(correlativo, checked) => setRecibosSeleccionados((prev) =>
                checked
                  ? Array.from(new Set([...prev, correlativo]))
                  : prev.filter((item) => item !== correlativo)
              )}
              onDetalleClick={setDetalleCompleto}
            />
          </div>
        ) : null}

        {detalleOcTab === "montoOc" ? (
          <div style={styles.detailTabPanel}>
            <div style={styles.tableWrap}>
              <table style={styles.montoOcTable}>
                <thead>
                  <tr>
                    {montoOcColumns.map((column) => (
                      <th key={column.key} style={{ ...styles.th, width: column.width }}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {montoOcLoading ? (
                    <tr><td style={styles.td} colSpan={montoOcColumns.length}>Cargando monto OC...</td></tr>
                  ) : montoOcRows.length === 0 ? (
                    <tr><td style={styles.td} colSpan={montoOcColumns.length}>Sin información de monto OC para la posición seleccionada.</td></tr>
                  ) : (
                    montoOcRows.map((item, index) => (
                      <tr key={`${item.idOc}-${item.idSite}-${item.fila}-${item.tipoTrabajo}-${index}`} style={styles.tr}>
                        <td style={styles.td}>{item.idOc ?? "-"}</td>
                        <td style={styles.td}>{item.idSite || "-"}</td>
                        <td style={styles.td} title={item.tipoTrabajo || ""}>{item.tipoTrabajo || "-"}</td>
                        <td style={styles.tdRight}>{formatMoney(item.montoOc)}</td>
                        <td style={styles.td} title={item.nombreSite || ""}>{item.nombreSite || "-"}</td>
                        <td style={styles.tdRight}>{formatMoney(item.pagadoFic)}</td>
                        <td style={styles.tdRight}>{formatPercent(item.avanceFic)}</td>
                        <td style={styles.td}>
                          <button
                            type="button"
                            style={styles.truncatedCellButton}
                            title={item.detalle || ""}
                            onClick={() => setDetalleCompleto(item.detalle || "")}
                          >
                            {item.detalle || "-"}
                          </button>
                        </td>
                        <td style={styles.td}>{item.estado || "-"}</td>
                        <td style={styles.tdRight}>{item.fila ?? "-"}</td>
                        <td style={styles.td} title={item.solicitante || ""}>{item.solicitante || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
      </div>
      </>
      ) : null}

      {vistaOc === "reporte" ? (
        <section style={ocV1Styles.view}>
          <nav style={{ display: "flex", gap: 6, marginBottom: 12, borderBottom: "1px solid #DDE3E1" }} aria-label="Vistas de reporte">
            {[{ key: "listado", label: "Listado" }, { key: "oc-gastos", label: "OC/Gastos" }, { key: "resumen", label: "Resumen" }].map((tab) => (
              <button key={tab.key} type="button" onClick={() => { setReporteSubtab(tab.key as typeof reporteSubtab); setReporteConsultado(false); }} style={{ ...ocV1Styles.viewTab, ...(reporteSubtab === tab.key ? ocV1Styles.viewTabActive : {}) }}>{tab.label}</button>
            ))}
          </nav>
          <div style={{ ...styles.card, display: reporteSubtab === "listado" || reporteSubtab === "oc-gastos" ? undefined : "none" }}>
            <div style={styles.sectionHeader}>
              <div>
                <h2 style={styles.sectionTitle}>Seguimiento de pagos</h2>
              </div>
              <span style={styles.counterPill}>
                {reporteLoading ? "Cargando detalle..." : reporteConsultado ? `${String(reporteSubtab) === "oc-gastos" ? reportePlanillaRows.length : reporteRowsFiltradas.length} registros` : "Seleccione filtros"}
              </span>
            </div>
            <div style={styles.reportFilters}>
              <Field>
                <Label>Nro OC</Label>
                <input
                  value={reporteFiltros.idOc}
                  onChange={(event) => setReporteFiltros((prev) => ({ ...prev, idOc: event.target.value }))}
                  placeholder="IdOC"
                  style={styles.input}
                />
              </Field>
              {reporteSubtab === "oc-gastos" && <Field>
                <Label>Órdenes de compra</Label>
                <select
                  value={reporteFiltros.tipoOc}
                  onChange={(event) => setReporteFiltros((prev) => ({ ...prev, tipoOc: event.target.value as ReporteFiltros["tipoOc"] }))}
                  style={styles.input}
                >
                  <option value="con">Con IdOc</option>
                  <option value="todos">Todos</option>
                </select>
              </Field>}
              <Field>
                <Label>Fecha desde</Label>
                <input
                  type="date"
                  value={reporteFiltros.fechaDesde}
                  onChange={(event) => setReporteFiltros((prev) => ({ ...prev, fechaDesde: event.target.value }))}
                  style={styles.input}
                />
              </Field>
              <Field>
                <Label>Fecha hasta</Label>
                <input
                  type="date"
                  value={reporteFiltros.fechaHasta}
                  onChange={(event) => setReporteFiltros((prev) => ({ ...prev, fechaHasta: event.target.value }))}
                  style={styles.input}
                />
              </Field>
              <Field><Label>Solicitante</Label><details style={{ position: "relative" }}><summary style={{ ...styles.input, display: "flex", alignItems: "center", cursor: "pointer" }}>Todos{solicitantesReporteFiltro.length > 0 && ` (${solicitantesReporteFiltro.length})`}</summary><div style={{ position: "absolute", zIndex: 20, top: "100%", left: 0, right: 0, maxHeight: 240, overflowY: "auto", padding: 8, background: "#fff", border: "1px solid #D1D5DB", borderRadius: 8 }}><input value={busquedaSolicitanteReporte} onChange={(e) => setBusquedaSolicitanteReporte(e.target.value)} placeholder="Escriba un solicitante..." style={styles.input} /><label style={{ display: "flex", gap: 6, padding: "6px 2px", fontSize: 12, fontWeight: 600 }}><input type="checkbox" onChange={(e) => { const disponibles = reporteOptions.solicitantes.filter((item) => item.toLocaleLowerCase().includes(busquedaSolicitanteReporte.toLocaleLowerCase())); const values = e.target.checked ? [...new Set([...solicitantesReporteFiltro, ...disponibles])] : solicitantesReporteFiltro.filter((v) => !disponibles.includes(v)); setSolicitantesReporteFiltro(values); setReporteFiltros((p) => ({ ...p, solicitante: values.join(",") })); }} />Marcar / desmarcar todos</label>{reporteOptions.solicitantes.filter((item) => item.toLocaleLowerCase().includes(busquedaSolicitanteReporte.toLocaleLowerCase())).map((item) => <label key={`rep-sol-${item}`} style={{ display: "flex", gap: 6, padding: "4px 2px", fontSize: 12 }}><input type="checkbox" checked={solicitantesReporteFiltro.includes(item)} onChange={(e) => { const values = e.target.checked ? [...solicitantesReporteFiltro, item] : solicitantesReporteFiltro.filter((v) => v !== item); setSolicitantesReporteFiltro(values); setReporteFiltros((p) => ({ ...p, solicitante: values.join(",") })); }} />{item}</label>)}</div></details></Field>
              <Field>
              <Label>Responsable</Label>
              <details className="oc-reporte-multi-filter" style={{ position: "relative", minWidth: 180 }}>
                <summary style={{ ...styles.input, display: "flex", alignItems: "center", cursor: "pointer" }}>Todos{responsablesReporteFiltro.length > 0 && ` (${responsablesReporteFiltro.length})`}</summary>
                <div className="oc-reporte-multi-options" style={{ position: "absolute", zIndex: 20, top: "100%", left: 0, right: 0, maxHeight: 240, overflowY: "auto", padding: 8, background: "#fff", border: "1px solid #D1D5DB", borderRadius: 8, boxShadow: "0 6px 16px rgba(15,23,42,.12)" }}>
                  <input value={busquedaResponsableReporte} onChange={(event) => setBusquedaResponsableReporte(event.target.value)} placeholder="Escriba un responsable..." style={styles.input} />
                  <label style={{ display: "flex", gap: 6, alignItems: "center", padding: "6px 2px", fontSize: 12, fontWeight: 600, borderBottom: "1px solid #E5E7EB" }}><input type="checkbox" checked={reporteOptions.responsables.filter((item) => item.toLocaleLowerCase().includes(busquedaResponsableReporte.toLocaleLowerCase())).every((item) => responsablesReporteFiltro.includes(item)) && reporteOptions.responsables.length > 0} onChange={(event) => { const disponibles = reporteOptions.responsables.filter((item) => item.toLocaleLowerCase().includes(busquedaResponsableReporte.toLocaleLowerCase())); const values = event.target.checked ? [...new Set([...responsablesReporteFiltro, ...disponibles])] : responsablesReporteFiltro.filter((value) => !disponibles.includes(value)); setResponsablesReporteFiltro(values); setReporteFiltros((prev) => ({ ...prev, responsable: values.join(",") })); }} />Marcar / desmarcar todos</label>
                  {reporteOptions.responsables.filter((item) => item.toLocaleLowerCase().includes(busquedaResponsableReporte.toLocaleLowerCase())).map((item) => <label key={`rep-res-${item}`} style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 2px", fontSize: 12 }}><input type="checkbox" checked={responsablesReporteFiltro.includes(item)} onChange={(event) => { const values = event.target.checked ? [...responsablesReporteFiltro, item] : responsablesReporteFiltro.filter((value) => value !== item); setResponsablesReporteFiltro(values); setReporteFiltros((prev) => ({ ...prev, responsable: values.join(",") })); }} />{item}</label>)}
                </div>
              </details>
              </Field>
              <Field>
                <Label>Cliente</Label>
                <select
                  value={reporteFiltros.cliente}
                  onChange={(event) => setReporteFiltros((prev) => ({ ...prev, cliente: event.target.value }))}
                  style={styles.input}
                >
                  <option value="">Todos</option>
                  {reporteOptions.clientes.map((item) => <option key={`rep-cli-${item}`} value={item}>{item}</option>)}
                </select>
              </Field>
              <Field>
                <Label>Proyecto</Label>
                <select
                  value={reporteFiltros.proyecto}
                  onChange={(event) => setReporteFiltros((prev) => ({ ...prev, proyecto: event.target.value }))}
                  style={styles.input}
                >
                  <option value="">Todos</option>
                  {reporteOptions.proyectos.map((item) => <option key={`rep-pro-${item}`} value={item}>{item}</option>)}
                </select>
              </Field>
              <Field><Label>Site</Label><details style={{ position: "relative" }}><summary style={{ ...styles.input, display: "flex", alignItems: "center", cursor: "pointer" }}>Todos{sitesReporteFiltro.length > 0 && ` (${sitesReporteFiltro.length})`}</summary><div style={{ position: "absolute", zIndex: 20, top: "100%", left: 0, right: 0, maxHeight: 240, overflowY: "auto", padding: 8, background: "#fff", border: "1px solid #D1D5DB", borderRadius: 8 }}><input value={busquedaSiteReporte} onChange={(e) => setBusquedaSiteReporte(e.target.value)} placeholder="Escriba un site..." style={styles.input} /><label style={{ display: "flex", gap: 6, padding: "6px 2px", fontSize: 12, fontWeight: 600 }}><input type="checkbox" onChange={(e) => { const disponibles = reporteOptions.sites.filter((item) => item.toLocaleLowerCase().includes(busquedaSiteReporte.toLocaleLowerCase())); const values = e.target.checked ? [...new Set([...sitesReporteFiltro, ...disponibles])] : sitesReporteFiltro.filter((v) => !disponibles.includes(v)); setSitesReporteFiltro(values); setReporteFiltros((p) => ({ ...p, site: values.join(",") })); }} />Marcar / desmarcar todos</label>{reporteOptions.sites.filter((item) => item.toLocaleLowerCase().includes(busquedaSiteReporte.toLocaleLowerCase())).map((item) => <label key={`rep-site-${item}`} style={{ display: "flex", gap: 6, padding: "4px 2px", fontSize: 12 }}><input type="checkbox" checked={sitesReporteFiltro.includes(item)} onChange={(e) => { const values = e.target.checked ? [...sitesReporteFiltro, item] : sitesReporteFiltro.filter((v) => v !== item); setSitesReporteFiltro(values); setReporteFiltros((p) => ({ ...p, site: values.join(",") })); }} />{item}</label>)}</div></details></Field>
              <Field>
                <Label>Estado</Label>
                <select
                  value={reporteFiltros.estado}
                  onChange={(event) => setReporteFiltros((prev) => ({ ...prev, estado: event.target.value }))}
                  style={styles.input}
                >
                  <option value="">Todos</option>
                  {reporteOptions.estados.map((item) => <option key={`rep-est-${item}`} value={item}>{item}</option>)}
                </select>
              </Field>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => {
                    setReporteFiltros({ solicitante: "", responsable: "", cliente: "", proyecto: "", site: "", estado: "", idOc: "", tipoOc: "con", fechaDesde: "", fechaHasta: "" }); setResponsablesReporteFiltro([]); setBusquedaResponsableReporte(""); setSolicitantesReporteFiltro([]); setBusquedaSolicitanteReporte(""); setSitesReporteFiltro([]); setBusquedaSiteReporte("");
                    setReporteDetalles([]);
                    setReporteConsultado(false);
                  }}
                >
                  Limpiar filtros
                </button>
                {reporteSubtab === "oc-gastos" && <button type="button" style={styles.primaryButton} disabled={reporteLoading} onClick={() => { setReportePlanillaRows([]); void loadReporteDetalles(); }}>Aplicar filtros</button>}
              </div>
            </div>
            <div style={String(reporteSubtab) === "oc-gastos" ? { ...styles.tableWrap, width: "100%", maxWidth: "100%", minWidth: 0 } : styles.tableWrap}>
              {String(reporteSubtab) === "oc-gastos" && <style>{`.oc-gastos-grid th:nth-child(n+35), .oc-gastos-grid td:nth-child(n+35) { display: none; }`}</style>}
              <table className={String(reporteSubtab) === "oc-gastos" ? "oc-gastos-grid" : undefined} style={String(reporteSubtab) === "oc-gastos" ? { ...styles.table, width: "max-content", minWidth: "100%" } : styles.table}>
                <thead>
                  <tr>
                    {String(reporteSubtab) === "oc-gastos" ? reportePlanillaColumns.map((column, index) => <th key={`pla-head-${column}`} style={{ ...styles.th, width: 110, minWidth: 80, maxWidth: 180, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...(index < 4 ? { position: "sticky", left: index * 110, zIndex: 3, background: "#fff" } : {}) }} title={column}>{column}</th>) : <th style={{ ...styles.th, width: 52 }} aria-label="Exportar PDF"></th>}
                    <th style={styles.th}>OC</th>
                    <th style={styles.th}>Fecha</th>
                    <th style={styles.th}>Solicitante</th>
                    <th style={styles.th}>Responsable</th>
                    <th style={styles.th}>Cliente</th>
                    <th style={styles.th}>Proyecto</th>
                    <th style={styles.th}>Site</th>
                    <th style={styles.th}>Comprobante</th>
                    <th style={styles.th}>Moneda</th>
                    <th style={styles.th}>Total</th>
                    <th style={styles.th}>Estado</th>
                    <th style={styles.th}>1ra validación</th>
                    <th style={styles.th}>2da validación</th>
                    <th style={styles.th}>3ra validación</th>
                  </tr>
                </thead>
                <tbody>
                  {String(reporteSubtab) === "oc-gastos" ? (reportePlanillaRows.length === 0 ? <tr><td style={styles.td} colSpan={Math.max(reportePlanillaColumns.length, 1)}>{!reporteConsultado ? "Seleccione al menos un filtro para consultar los gastos." : reporteLoading ? "Cargando datos..." : "No hay registros de Planilla."}</td></tr> : reportePlanillaRows.map((row, index) => { const read = (column: string) => { if (column.toLowerCase() === "totaloc") { const precio = Number(row[Object.keys(row).find((key) => key.toLowerCase() === "preciounioc") ?? ""] ?? 0); const cantidad = Number(row[Object.keys(row).find((key) => key.toLowerCase() === "cantoc") ?? ""] ?? 0); return precio && cantidad ? (precio * cantidad).toFixed(2) : "—"; } const found = Object.keys(row).find((key) => key.toLowerCase() === column.toLowerCase()); return String(found ? row[found] ?? "—" : "—"); }; return <tr key={`pla-${read("ID") || index}`} style={styles.tr}>{reportePlanillaColumns.map((column, columnIndex) => { const value = read(column); return <td key={`${index}-${column}`} style={{ ...styles.td, width: 110, minWidth: 80, maxWidth: 180, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer", ...(columnIndex < 4 ? { position: "sticky", left: columnIndex * 110, zIndex: 2, background: "#fff" } : {}) }} title={value} onClick={(event) => { const cell = event.currentTarget; if (cell.style.whiteSpace === "normal") cell.style.whiteSpace = "nowrap"; else if (cell.scrollWidth > cell.clientWidth) cell.style.whiteSpace = "normal"; }}>{value}</td>; })}</tr>; })) : String(reporteSubtab) !== "oc-gastos" && !reporteConsultado ? (
                    <tr>
                      <td style={styles.td} colSpan={15}>
                        Seleccione al menos un filtro para consultar la trazabilidad.
                      </td>
                    </tr>
                  ) : String(reporteSubtab) !== "oc-gastos" && reporteRowsFiltradas.length === 0 ? (
                    <tr>
                      <td style={styles.td} colSpan={15}>
                        {reporteLoading ? "Cargando datos del reporte..." : "No hay ordenes de compra para los filtros seleccionados."}
                      </td>
                    </tr>
                  ) : String(reporteSubtab) !== "oc-gastos" ? reporteRowsFiltradas.map((item) => (
                    <tr key={`rep-${item.idOc}`} style={styles.tr}>
                      <td style={styles.td}>
                        <button
                          type="button"
                          style={pdfExportingOc === item.idOc ? styles.pdfIconButtonDisabled : styles.pdfIconButton}
                          onClick={() => void exportReporteOcPdf(item)}
                          disabled={pdfExportingOc === item.idOc}
                          title="Exportar PDF de la OC"
                          aria-label={`Exportar PDF de la OC ${item.idOc}`}
                        >
                          <FileDown size={15} strokeWidth={2.3} />
                        </button>
                      </td>
                      <td style={styles.td}>{item.idOc}</td>
                      <td style={styles.td}>{formatDate(item.fecha)}</td>
                      <td style={styles.td}>{item.solicitante}</td>
                      <td style={styles.td}>{item.responsable}</td>
                      <td style={styles.td} title={item.clientes.join(" / ")}>{item.clienteResumen || "-"}</td>
                      <td style={styles.td} title={item.proyectos.join(" / ")}>{item.proyectoResumen || "-"}</td>
                      <td style={styles.td} title={item.sites.join(" / ")}>{item.siteResumen || "-"}</td>
                      <td style={styles.td}>{item.comprobante}</td>
                      <td style={styles.td}>{item.moneda}</td>
                      <td style={styles.td}>{formatMoney(item.total)}</td>
                      <td style={styles.td}>{item.estado}</td>
                      <td style={styles.td}><ValidationBadge value={item.idAprobador1} /></td>
                      <td style={styles.td}><ValidationBadge value={item.idAprobador2} /></td>
                      <td style={styles.td}><ValidationBadge value={item.idAprobador3} /></td>
                    </tr>
                  )) : null}
                </tbody>
              </table>
            </div>
          </div>
          {reporteSubtab === "resumen" && <div style={{ ...styles.card, padding: 32, textAlign: "center", color: "#607089" }}><h2 style={styles.sectionTitle}>Resumen</h2><p style={styles.sectionText}>Seleccione los filtros para consultar esta vista.</p></div>}
        </section>
      ) : null}

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

      {detalleCompleto !== null ? (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <h3 style={{ marginTop: 0, marginBottom: 12, color: "#17143A" }}>
              Detalle
            </h3>
            <div style={styles.detailFullText}>
              {detalleCompleto || "Sin detalle registrado."}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
              <button type="button" style={styles.secondaryButton} onClick={() => setDetalleCompleto(null)}>
                Cerrar
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

      {panelOpen && vistaOc === "registro" ? (
        <div>
          <div style={styles.registrationInline}>
            <section style={{ ...styles.card, ...styles.registrationPanel }}>
              {/* Mostrar error SOLO dentro del panel de nueva orden de compra */}
              {error ? <div style={styles.errorBanner}>{error}</div> : null}
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.sectionTitle}>Nueva orden de compra</h2>
              <p style={styles.sectionText}>Registre la cabecera y las posiciones antes de guardar.</p>
              <p style={{ ...styles.sectionText, fontSize: 12, color: "#475569" }}>
                El sistema registra auditoria automatica de cabecera y posiciones al guardar cambios.
              </p>
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


          {/* Nueva disposiciÒ�� �"Ò�a�³n de campos de cabecera */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 0 }}>
            <Field>
              <Label>Solicitante</Label>
              <SolicitanteTypeahead
                options={solicitanteOptions}
                selectedValue={draft.solicitante}
                onSelect={(value) => {
                  const solicitante = solicitanteOptions.find((option) => normalizeOptionValue(option) === value);
                  const responsableCj = solicitante?.responsableCj?.trim().toLowerCase();
                  const gestor = gestorOptions.find((option) => option.label.trim().toLowerCase() === responsableCj);
                  const validador = validadorOptions.find((option) => option.label.trim().toLowerCase() === responsableCj);
                  setDraft((prev) => ({
                    ...prev,
                    solicitante: value,
                    ...(gestor ? { gestor: normalizeOptionValue(gestor) } : {}),
                    ...(validador ? { validador: normalizeOptionValue(validador) } : {}),
                  }));
                }}
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

          {/* ObservaciÒ�� �"Ò�a�³n oculta, pero el valor se mantiene en draft.observacion */}
          <Field style={{ display: "none" }}>
            <Label>ObservaciÒ�� �"Ò�a�³n</Label>
            <textarea value={draft.observacion} readOnly style={styles.textarea} />
          </Field>


          <div style={styles.segmentHeader}>
            <h3 style={styles.subTitle}>Detalle de la orden de compra</h3>
            <span style={styles.sectionText}>
              {(() => {
                const responsable = responsableOptions.find(r => String(r.idEmpleado) === draft.responsable);
                if (!responsable) return "";
                // Concatenar informaciÒ�� �"Ò�a�³n relevante de la cuenta
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
                <input
                  type="checkbox"
                  checked={detalleForm.tieneOcCliente}
                  onChange={(event) => setDetalleForm((prev) => ({
                    ...prev,
                    tieneOcCliente: event.target.checked,
                    ocClienteArchivo: event.target.checked ? prev.ocClienteArchivo : null,
                    ocClienteNombre: event.target.checked ? prev.ocClienteNombre : "",
                    imgOc: event.target.checked ? prev.imgOc : "",
                  }))}
                />
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
                      accept={archivoOcAccept}
                      disabled={!detalleForm.tieneOcCliente}
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        setDetalleForm((prev) => ({
                          ...prev,
                          ocClienteArchivo: file,
                          ocClienteNombre: file?.name ?? "",
                          imgOc: file ? "" : prev.imgOc,
                        }));
                      }}
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
                  <input
                    type="checkbox"
                    checked={detalleForm.tienePresupuesto}
                    onChange={(event) => setDetalleForm((prev) => ({
                      ...prev,
                      tienePresupuesto: event.target.checked,
                      presupuestoArchivo: event.target.checked ? prev.presupuestoArchivo : null,
                      presupuestoNombre: event.target.checked ? prev.presupuestoNombre : "",
                      imgPresupuesto: event.target.checked ? prev.imgPresupuesto : "",
                    }))}
                  />
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
                        accept={archivoOcAccept}
                        disabled={!detalleForm.tienePresupuesto}
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          setDetalleForm((prev) => ({
                            ...prev,
                            presupuestoArchivo: file,
                            presupuestoNombre: file?.name ?? "",
                            imgPresupuesto: file ? "" : prev.imgPresupuesto,
                          }));
                        }}
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
                {editingDetalleId ? "Actualizar posiciÃ³n" : "Agregar"}
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
                        <td style={styles.td}>{[item.ocClienteNombre || item.imgOc ? "OC cliente" : "", item.presupuestoNombre || item.imgPresupuesto ? "Presupuesto" : ""].filter(Boolean).join(" / ")}</td>
                    <td style={styles.td}>{editingDetalleId === item.tempId ? "En ediciÃ³n" : "Pendiente"}</td>
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
            onDetalleClick={setDetalleCompleto}
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

function RecibosOrdenCompraTable({
  rows,
  loading,
  emptyText,
  selectable,
  selectedIds,
  onToggle,
  onDetalleClick,
}: {
  rows: OrdenCompraReciboDto[];
  loading: boolean;
  emptyText: string;
  selectable: boolean;
  selectedIds: number[];
  onToggle: (correlativo: number, checked: boolean) => void;
  onDetalleClick: (detalle: string) => void;
}) {
  return (
    <div style={styles.tableWrap}>
      <table style={styles.receiptTable}>
        <thead>
          <tr>
            {reciboColumns.map((column) => (
              <th key={column.key} style={{ ...styles.th, width: column.width }}>
                {column.key === "seleccion" && selectable ? "" : column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td style={styles.td} colSpan={reciboColumns.length}>Cargando recibos...</td></tr>
          ) : rows.length === 0 ? (
            <tr><td style={styles.td} colSpan={reciboColumns.length}>{emptyText}</td></tr>
          ) : (
            rows.map((item) => (
              <tr key={item.correlativo} style={styles.tr}>
                <td style={styles.td}>
                  {selectable ? (
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.correlativo)}
                      onChange={(event) => onToggle(item.correlativo, event.target.checked)}
                      aria-label={`Seleccionar recibo ${item.correlativo}`}
                    />
                  ) : null}
                </td>
                <td style={styles.td}>{item.correlativo}</td>
                <td style={styles.td}>{item.fecIngreso ? new Date(item.fecIngreso).toLocaleDateString("es-PE") : ""}</td>
                <td style={styles.td}>{formatMoney(item.subtotal)}</td>
                <td style={styles.td}>{formatMoney(item.igv)}</td>
                <td style={styles.td}>{formatMoney(item.total)}</td>
                <td style={styles.td}>
                  <button
                    type="button"
                    style={styles.truncatedCellButton}
                    title={item.detalle ?? ""}
                    onClick={() => onDetalleClick(item.detalle ?? "")}
                  >
                    {item.detalle ?? ""}
                  </button>
                </td>
                <td style={styles.td}>{item.comprobante ?? ""}</td>
                <td style={styles.td} title={item.responsable ?? ""}>{item.responsable ?? ""}</td>
                <td style={styles.td}>{item.nroDocumento ?? ""}</td>
                <td style={styles.td}>{item.estado ?? ""}</td>
                <td style={styles.td}>{item.tarea ?? ""}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Field({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 3, ...style }}>{children}</div>;
}

function ArchivoButton({ codigo, label }: { codigo?: string | null; label: string }) {
  const codigoLimpio = codigo?.trim();
  const [loading, setLoading] = useState(false);

  return (
    <button
      type="button"
      disabled={!codigoLimpio || loading}
      style={codigoLimpio ? styles.smallActionButton : styles.smallDisabledButton}
      onClick={async () => {
        if (!codigoLimpio) return;
        setLoading(true);
        try {
          const blob = await descargarArchivoOrdenCompra(codigoLimpio);
          const url = URL.createObjectURL(blob);
          window.open(url, "_blank", "noopener,noreferrer");
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? "Abriendo..." : label}
    </button>
  );
}

function AttachmentButton({ codigo, archivo, label }: { codigo?: string | null; archivo?: File | null; label: string }) {
  if (codigo) return <ArchivoButton codigo={codigo} label={label} />;
  return (
    <button
      type="button"
      style={styles.smallActionButton}
      title={label}
      aria-label={label}
      onClick={() => { if (archivo) window.open(URL.createObjectURL(archivo), "_blank", "noopener,noreferrer"); }}
    >
      📎
    </button>
  );
}

function ValidationBadge({ value }: { value?: number | null }) {
  const registrado = Boolean(value && value > 0);
  return (
    <span style={registrado ? styles.validationBadgeOk : styles.validationBadgePending}>
      {registrado ? `Registrado (${value})` : "Pendiente"}
    </span>
  );
}

function StepItem({ label, value, status }: { label: string; value: string; status: "done" | "current" | "open" }) {
  const dotStyle =
    status === "done"
      ? ocV1Styles.stepDotDone
      : status === "current"
        ? ocV1Styles.stepDotCurrent
        : ocV1Styles.stepDot;

  return (
    <div style={{ ...ocV1Styles.step, ...(status === "current" ? ocV1Styles.stepCurrent : {}) }}>
      <span style={dotStyle}>{value}</span>
      {label}
    </div>
  );
}

function OcHistoryFooter({ cabecera }: { cabecera: OrdenCompraCabeceraDto }) {
  const nivelPendiente = getNivelPendiente(cabecera);
  const cerrada = nivelPendiente >= 4 || (cabecera.estado ?? "").toLowerCase().includes("aprobado");

  return (
    <div style={ocV1Styles.historyFooter}>
      <div style={ocV1Styles.stepper}>
        <StepItem label="Registro" status="done" value="Ò¢�&�Sâ���" />
        <div style={ocV1Styles.stepLine} />
        <StepItem label="1ra validación" status={cabecera.idAprobador1 ? "done" : nivelPendiente === 1 ? "current" : "open"} value="1" />
        <div style={ocV1Styles.stepLine} />
        <StepItem label="2da validación" status={cabecera.idAprobador2 ? "done" : nivelPendiente === 2 ? "current" : "open"} value="2" />
        <div style={ocV1Styles.stepLine} />
        <StepItem label="3ra validación" status={cabecera.idAprobador3 ? "done" : nivelPendiente === 3 ? "current" : "open"} value="3" />
        <div style={ocV1Styles.stepLine} />
        <StepItem label="Cerrada" status={cerrada ? "done" : "open"} value="Ò¢�&�Sâ���" />
      </div>
    </div>
  );
}


type ApprovalValidatorMultiFilterProps = {
  label: string;
  options: string[];
  selected: string[];
  onChange: React.Dispatch<React.SetStateAction<string[]>>;
};

const ApprovalValidatorMultiFilter = React.memo(function ApprovalValidatorMultiFilter({
  label,
  options,
  selected,
  onChange,
}: ApprovalValidatorMultiFilterProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const visibleOptions = useMemo(
    () => options.filter((option) => option.toLowerCase().includes(filter.trim().toLowerCase())),
    [filter, options]
  );

  const caption = selected.length === 0
    ? `Todos los ${label.toLowerCase()}`
    : selected.length === 1
      ? selected[0]
      : `${selected.length} ${label.toLowerCase()}`;

  return (
    <div ref={ref} style={ocV1Styles.stageValidatorFilter}>
      <button type="button" style={ocV1Styles.stageValidatorFilterButton} onClick={() => setOpen((prev) => !prev)} title={caption}>
        <span style={ocV1Styles.stageValidatorFilterText}>{caption}</span>
        <span aria-hidden="true">��</span>
      </button>
      {open ? (
        <div style={ocV1Styles.stageValidatorDropdown}>
          <div style={ocV1Styles.stageValidatorDropdownHeader}>
            <strong>{label}</strong>
            <button type="button" style={styles.clearInlineButton} onClick={() => onChange([])}>Limpiar</button>
          </div>
          <input
            type="text"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Buscar opciÃ³n..."
            style={styles.columnFilterInput}
          />
          <label style={styles.columnFilterItem}>
            <input type="checkbox" checked={selected.length === 0} onChange={() => onChange([])} />
            <span>Todos</span>
          </label>
          <div style={ocV1Styles.stageValidatorOptions}>
            {visibleOptions.map((option) => {
              const checked = selected.includes(option);
              return (
                <label key={option} style={styles.columnFilterItem} title={option}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onChange((prev) => checked ? prev.filter((item) => item !== option) : [...prev, option])}
                  />
                  <span>{option}</span>
                </label>
              );
            })}
            {visibleOptions.length === 0 ? <div style={ocV1Styles.stageValidatorEmpty}>Sin opciones</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
});

const ApprovalQuickSearch = React.memo(function ApprovalQuickSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (inputRef.current && inputRef.current.value !== value) {
      inputRef.current.value = value;
    }
  }, [value]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    []
  );

  return (
    <input
      ref={inputRef}
      type="search"
      defaultValue={value}
      onChange={(event) => {
        const nextValue = event.currentTarget.value;
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
        }
        timerRef.current = window.setTimeout(() => {
          onChange(nextValue);
        }, 250);
      }}
      placeholder={placeholder}
      style={ocV1Styles.stageSearch}
    />
  );
});

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
  onDetalleClick,
}: {
  detalles: OrdenCompraDraftDetalle[];
  editingDetalleId: string | null;
  isAccepted: boolean;
  comprobanteOptions: ConstanteOption[];
  tipoPagoOptions: ConstanteOption[];
  monedaOptions: ConstanteOption[];
  onEdit: (item: OrdenCompraDraftDetalle) => void;
  onRemove: (tempId: string) => void;
  onDetalleClick: (detalle: string) => void;
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
            <th style={styles.th}>Adjuntos</th>
            <th style={styles.th}>Estado</th>
          </tr>
        </thead>
      </table>
      <div style={{ width: "100%", maxHeight: "50vh", overflow: "auto" }}>
        <table style={styles.table}>
          <tbody>
            {detalles.length === 0 ? (
              <tr>
                <td style={styles.td} colSpan={20}>No hay posiciones registradas.</td>
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
                        <button type="button" style={styles.smallActionButton} title="Editar posición" aria-label="Editar posición" onClick={() => onEdit(item)}>✎</button>
                        <button type="button" style={styles.smallDangerButton} title="Eliminar posición" aria-label="Eliminar posición" disabled={isAccepted} onClick={() => onRemove(item.tempId)}>🗑</button>
                      </div>
                    </td>
                    <td style={styles.td}>{index + 1}</td>
                    <td style={styles.td}><button type="button" style={styles.truncatedCellButton} title={item.filtroOperativo.filtro?.nombreCliente ?? ""} onClick={() => onDetalleClick(item.filtroOperativo.filtro?.nombreCliente ?? "")}>{item.filtroOperativo.filtro?.nombreCliente ?? ""}</button></td>
                    <td style={styles.td}><button type="button" style={styles.truncatedCellButton} title={item.filtroOperativo.filtro?.nombreProyecto ?? ""} onClick={() => onDetalleClick(item.filtroOperativo.filtro?.nombreProyecto ?? "")}>{item.filtroOperativo.filtro?.nombreProyecto ?? ""}</button></td>
                    <td style={styles.td}><button type="button" style={styles.truncatedCellButton} title={item.filtroOperativo.filtro?.nombreSite ?? ""} onClick={() => onDetalleClick(item.filtroOperativo.filtro?.nombreSite ?? "")}>{item.filtroOperativo.filtro?.nombreSite ?? ""}</button></td>
                    <td style={styles.td}><button type="button" style={styles.truncatedCellButton} title={item.filtroOperativo.tipoTrabajo?.tipoTrabajo ?? item.filtroOperativo.filtro?.tipoTrabajo ?? ""} onClick={() => onDetalleClick(item.filtroOperativo.tipoTrabajo?.tipoTrabajo ?? item.filtroOperativo.filtro?.tipoTrabajo ?? "")}>{item.filtroOperativo.tipoTrabajo?.tipoTrabajo ?? item.filtroOperativo.filtro?.tipoTrabajo ?? ""}</button></td>
                    <td style={styles.td}>{item.filtroOperativo.ot?.ot ?? item.filtroOperativo.filtro?.ot ?? ""}</td>
                    <td style={styles.td}><button type="button" style={styles.truncatedCellButton} title={item.filtroOperativo.tarea?.tarea ?? ""} onClick={() => onDetalleClick(item.filtroOperativo.tarea?.tarea ?? "")}>{item.filtroOperativo.tarea?.tarea ?? ""}</button></td>
                    <td style={styles.td}><button type="button" style={styles.truncatedCellButton} title={item.detalle ?? ""} onClick={() => onDetalleClick(item.detalle ?? "")}>{item.detalle || "-"}</button></td>
                    <td style={styles.td}>{getOptionLabel(comprobanteOptions, item.comprobante)}</td>
                    <td style={styles.td}>{getOptionLabel(tipoPagoOptions, item.formaPago)}</td>
                    <td style={styles.td}>{getOptionLabel(monedaOptions, item.moneda)}</td>
                    <td style={styles.td}>{item.diasPago}</td>
                    <td style={styles.td}>{formatMoney(toNumber(item.cantidad))}</td>
                    <td style={styles.td}>{formatMoney(toNumber(item.precioUnitario))}</td>
                    <td style={styles.td}>{formatMoney(subtotal)}</td>
                    <td style={styles.td}>{formatMoney(igv)}</td>
                    <td style={styles.td}>{formatMoney(total)}</td>
                    <td style={styles.td}>
                      <div style={{ display: "flex", gap: 6 }}>
                        {item.imgOc || item.ocClienteArchivo || item.ocClienteNombre ? <AttachmentButton codigo={item.imgOc} archivo={item.ocClienteArchivo} label="Ver OC cliente" /> : null}
                        {item.imgPresupuesto || item.presupuestoArchivo || item.presupuestoNombre ? <AttachmentButton codigo={item.imgPresupuesto} archivo={item.presupuestoArchivo} label="Ver presupuesto" /> : null}
                        {!item.imgOc && !item.ocClienteArchivo && !item.ocClienteNombre && !item.imgPresupuesto && !item.presupuestoArchivo && !item.presupuestoNombre ? "-" : null}
                      </div>
                    </td>
                    <td style={styles.td}>{editingDetalleId === item.tempId ? "En ediciÃ³n" : "Pendiente"}</td>
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

const ocV1Styles: Record<string, React.CSSProperties> = {
  topbar: {
    background: "#FFFFFF",
    border: "1px solid #DDE3E1",
    borderRadius: 6,
    padding: "16px 28px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    boxShadow: "0 8px 18px rgba(23, 33, 43, 0.04)",
  },
  crumbs: {
    color: "#7A8A97",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: ".04em",
    textTransform: "uppercase",
  },
  titleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 18,
    flexWrap: "wrap",
  },
  title: {
    margin: 0,
    color: "#17212B",
    fontSize: 20,
    lineHeight: 1.2,
    fontWeight: 700,
  },
  docId: {
    marginLeft: 10,
    color: "#7A8A97",
    fontSize: 13,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontWeight: 600,
  },
  subtitle: {
    margin: "4px 0 0",
    color: "#5B6B77",
    fontSize: 13,
  },
  actions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },
  historyFooter: {
    borderTop: "1px solid #E2E8F0",
    marginTop: 12,
    paddingTop: 12,
    overflowX: "auto",
  },
  stepper: {
    display: "flex",
    alignItems: "center",
    gap: 0,
    flexWrap: "wrap",
    paddingTop: 2,
  },
  step: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px 6px 0",
    color: "#7A8A97",
    fontSize: 12,
    fontWeight: 700,
  },
  stepCurrent: {
    color: "#17212B",
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "#EEF1F3",
    color: "#5B6B77",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 800,
  },
  stepDotDone: {
    background: "#DCEEE9",
    color: "#0E6E5C",
  },
  stepDotCurrent: {
    background: "#0E6E5C",
    color: "#FFFFFF",
  },
  stepLine: {
    width: 30,
    height: 1,
    background: "#C3CBC9",
    marginRight: 12,
  },
  viewTabs: {
    display: "flex",
    gap: 2,
    background: "#FFFFFF",
    border: "1px solid #DDE3E1",
    borderRadius: 6,
    padding: "0 16px",
    overflowX: "auto",
  },
  viewTab: {
    border: "none",
    background: "transparent",
    padding: "11px 16px",
    color: "#7A8A97",
    borderBottom: "2px solid transparent",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  viewTabActive: {
    color: "#0E6E5C",
    borderBottom: "2px solid #0E6E5C",
  },
  view: {
    display: "block",
    paddingTop: 2,
  },
  stageToolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    margin: "0 0 12px",
    flexWrap: "wrap",
  },
  stageSwitch: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    flex: "1 1 auto",
  },
  stageButton: {
    border: "1px solid #DDE3E1",
    background: "#FFFFFF",
    color: "#5B6B77",
    padding: "8px 12px",
    borderRadius: 6,
    fontWeight: 700,
    cursor: "pointer",
  },
  stageButtonActive: {
    background: "#E4F0EC",
    borderColor: "#0E6E5C",
    color: "#0E6E5C",
  },
  stageCount: {
    display: "inline-flex",
    marginLeft: 8,
    padding: "2px 7px",
    borderRadius: 999,
    background: "#FFFFFF",
    color: "inherit",
    fontSize: 11,
    fontWeight: 800,
  },
  stageSearchActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    flex: "0 0 auto",
    flexWrap: "nowrap",
    whiteSpace: "nowrap",
  },
  stageSearch: {
    width: 300,
    maxWidth: "300px",
    height: 36,
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    padding: "0 12px",
    fontSize: 12,
    color: "#0F172A",
    background: "#FFFFFF",
    boxSizing: "border-box",
    flex: "0 0 300px",
  },
  stageValidatorFilter: {
    position: "relative",
    width: 230,
    maxWidth: "230px",
    height: 36,
    flex: "0 0 230px",
  },
  stageValidatorFilterButton: {
    width: "100%",
    height: 36,
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    padding: "0 10px",
    fontSize: 12,
    color: "#0F172A",
    background: "#FFFFFF",
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    cursor: "pointer",
  },
  stageValidatorFilterText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  stageValidatorDropdown: {
    position: "absolute",
    top: "calc(100% + 4px)",
    right: 0,
    width: 310,
    maxWidth: "calc(100vw - 24px)",
    background: "#FFFFFF",
    border: "1px solid #D1D5DB",
    borderRadius: 10,
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.16)",
    padding: 10,
    zIndex: 30,
  },
  stageValidatorDropdownHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
    fontSize: 11,
    color: "#17143A",
  },
  stageValidatorOptions: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    maxHeight: 220,
    overflowY: "auto",
  },
  stageValidatorEmpty: {
    padding: "8px 4px",
    fontSize: 11,
    color: "#64748B",
  },
  metrics: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  metric: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 126,
    padding: "10px 13px",
    border: "1px solid #DDE3E1",
    borderRadius: 6,
    background: "#FFFFFF",
    color: "#5B6B77",
    fontSize: 11,
    textAlign: "left",
    cursor: "pointer",
  },
  metricActive: {
    border: "1px solid #0E6E5C",
    background: "#E4F0EC",
    color: "#0E6E5C",
    boxShadow: "0 8px 18px rgba(14, 110, 92, 0.10)",
  },
};
const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    width: "100%",
  },
  card: {
    background: "#FFFFFF",
    border: "1px solid #DDE3E1",
    borderRadius: 6,
    padding: 12,
    boxShadow: "0 8px 18px rgba(23, 33, 43, 0.04)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  workspaceGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(520px, 0.85fr) minmax(680px, 1.15fr)",
    gap: 8,
    alignItems: "start",
  },
  masterCard: {
    minWidth: 0,
  },
  detailCard: {
    minWidth: 0,
    position: "sticky",
    top: 12,
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
  detailFullText: {
    maxHeight: "55vh",
    overflowY: "auto",
    whiteSpace: "pre-wrap",
    lineHeight: 1.6,
    color: "#17212B",
    border: "1px solid #E5E7EB",
    borderRadius: 10,
    padding: 12,
    background: "#F8FAFC",
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
  registrationInline: {
    width: "100%",
    marginTop: 12,
  },
  registrationPanel: {
    position: "relative",
    width: "100%",
    maxHeight: "none",
    overflow: "visible",
  },
  innerSection: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
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
  approvalListWrap: {
    border: "1px solid #DDE3E1",
    borderRadius: 6,
    background: "#FFFFFF",
    maxHeight: "calc(100vh - 390px)",
    overflow: "auto",
    scrollbarGutter: "stable",
  },
  approvalSelectionBar: {
    display: "flex",
    minWidth: 760,
    alignItems: "center",
    gap: 8,
    padding: "10px 18px",
    borderBottom: "1px solid #DDE3E1",
    background: "#F8FAFC",
    color: "#334155",
    fontSize: 12,
    fontWeight: 700,
  },
  approvalCheckLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
  },
  approvalSelectionCount: {
    color: "#64748B",
    fontWeight: 700,
  },
  approvalListTitle: {
    padding: "14px 20px",
    borderBottom: "1px solid #DDE3E1",
    color: "#44546A",
    fontSize: 15,
    fontWeight: 800,
    background: "#FFFFFF",
  },
  approvalGroup: {
    borderBottom: "1px solid #DDE3E1",
    minWidth: 760,
  },
  approvalGroupHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    padding: "12px 18px",
    background: "#F2F4F3",
    color: "#00172D",
    fontSize: 14,
  },
  approvalCard: {
    display: "block",
    width: "100%",
    border: "none",
    borderBottom: "1px solid #E7ECEA",
    background: "#FFFFFF",
    padding: "12px 18px",
    textAlign: "left",
    cursor: "pointer",
    boxSizing: "border-box",
  },
  approvalCardActive: {
    background: "#E4F0EC",
    boxShadow: "inset 4px 0 0 #0E6E5C",
  },
  approvalCardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    marginBottom: 8,
  },
  approvalCardLine: {
    display: "grid",
    gridTemplateColumns: "20px 90px 110px minmax(150px, 0.8fr) 86px 92px 75px",
    alignItems: "center",
    columnGap: 4,
    rowGap: 8,
    minWidth: 730,
  },
  approvalCheckbox: {
    width: 16,
    height: 16,
    cursor: "pointer",
  },
  approvalOc: {
    color: "#7A8A97",
    fontSize: 13,
    letterSpacing: ".02em",
    whiteSpace: "nowrap",
  },
  approvalAmount: {
    color: "#00172D",
    fontSize: 15,
    fontWeight: 400,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    whiteSpace: "nowrap",
    textAlign: "left",
  },
  approvalCardTitle: {
    color: "#00172D",
    fontSize: 15,
    fontWeight: 400,
    lineHeight: 1.35,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  approvalCardMeta: {
    color: "#7A8A97",
    fontSize: 13,
    lineHeight: 1.35,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  approvalEmpty: {
    padding: 24,
    color: "#7A8A97",
    fontSize: 13,
    textAlign: "center",
  },
  linkButton: {
    border: "none",
    background: "transparent",
    color: "#0E6E5C",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    padding: 0,
  },
  tableWrap: {
    overflowX: "auto",
    border: "1px solid #DDE3E1",
    borderRadius: 6,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 1100,
    tableLayout: "fixed",
  },
  receiptTable: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 1350,
    tableLayout: "fixed",
  },
  montoOcTable: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 1350,
    tableLayout: "fixed",
  },
  th: {
    position: "relative",
    textAlign: "left",
    padding: "7px 10px",
    borderBottom: "1px solid #DDE3E1",
    background: "#F2F4F3",
    fontSize: 12,
    color: "#5B6B77",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "7px 10px",
    borderBottom: "1px solid #E7ECEA",
    fontSize: 12,
    color: "#17212B",
    verticalAlign: "middle",
  },
  tdRight: {
    padding: "7px 10px",
    borderBottom: "1px solid #E7ECEA",
    fontSize: 12,
    color: "#17212B",
    verticalAlign: "middle",
    textAlign: "right",
    whiteSpace: "nowrap",
  },
  truncatedCellButton: {
    display: "block",
    width: "100%",
    border: "none",
    background: "transparent",
    color: "#17212B",
    padding: 0,
    margin: 0,
    textAlign: "left",
    fontSize: 12,
    lineHeight: 1.35,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
  tr: {
    cursor: "pointer",
  },
  trActive: {
    background: "#E4F0EC",
    boxShadow: "inset 3px 0 0 #0E6E5C",
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
  detailTabs: {
    display: "flex",
    gap: 6,
    borderBottom: "1px solid #DDE3E1",
    marginBottom: 10,
    overflowX: "auto",
  },
  detailTab: {
    border: "none",
    background: "transparent",
    color: "#64748B",
    padding: "9px 12px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    borderBottom: "2px solid transparent",
    whiteSpace: "nowrap",
  },
  detailTabActive: {
    color: "#0E6E5C",
    borderBottom: "2px solid #0E6E5C",
  },
  detailTabPanel: {
    border: "1px solid #DDE3E1",
    borderRadius: 6,
    padding: 14,
    minHeight: 120,
    background: "#FFFFFF",
    color: "#0F172A",
  },
  amountSummaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 10,
  },
  amountSummaryItem: {
    border: "1px solid #DDE3E1",
    borderRadius: 8,
    padding: 12,
    background: "#F8FAFC",
    color: "#0F172A",
  },
  receiptToolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  detailResume: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
    padding: 12,
    border: "1px solid #DDE3E1",
    borderRadius: 6,
    background: "#F7F9F8",
    fontSize: 12,
  },
  resumeLabel: {
    display: "block",
    marginBottom: 3,
    color: "#64748B",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: ".03em",
  },
  validationFlow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 8,
  },
  validationStep: {
    border: "1px solid #DDE3E1",
    borderRadius: 6,
    padding: 10,
    background: "#FFFFFF",
  },
  actionRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    flexWrap: "nowrap",
  },
  validationBadgeOk: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 24,
    padding: "3px 9px",
    borderRadius: 999,
    background: "#DCFCE7",
    color: "#166534",
    fontSize: 11,
    fontWeight: 800,
  },
  validationBadgePending: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 24,
    padding: "3px 9px",
    borderRadius: 999,
    background: "#FEF3C7",
    color: "#92400E",
    fontSize: 11,
    fontWeight: 800,
  },
  formGrid: {
    display: "grid", 
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
  },
  reportFilters: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
    padding: 12,
    border: "1px solid #DDE3E1",
    borderRadius: 6,
    background: "#F7F9F8",
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
    background: "#0E6E5C",
    color: "#FFFFFF",
    borderRadius: 6,
    padding: "10px 16px",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #C3CBC9",
    background: "#FFFFFF",
    color: "#17212B",
    borderRadius: 6,
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
  pdfIconButton: {
    width: 30,
    height: 30,
    border: "1px solid #FCA5A5",
    background: "#FEF2F2",
    color: "#B91C1C",
    borderRadius: 8,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
  },
  pdfIconButtonDisabled: {
    width: 30,
    height: 30,
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
    color: "#94A3B8",
    borderRadius: 8,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "wait",
    padding: 0,
  },
  smallDisabledButton: {
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
    color: "#94A3B8",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 700,
    cursor: "not-allowed",
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
    background: "#B0362E",
    color: "#FFFFFF",
    borderRadius: 6,
    padding: "10px 16px",
    fontWeight: 700,
    cursor: "pointer",
  },
  segmentHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
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

































