import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Banknote,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  Filter,
  History,
  Landmark,
  LoaderCircle,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import AppPage from "../../../components/base/AppPage";
import {
  listarPagosTesoreria,
  obtenerCatalogosPago,
  obtenerCuentasPago,
  registrarPagosTesoreria,
  crearItemsTesoreria,
} from "../../../api/pagoTesoreriaService";
import type {
  PagoCatalogos,
  PagoOpcion,
  PagoTesoreriaRequest,
  PagoTesoreriaRow,
  PagoRevisionPermisos,
} from "../../../api/pagoTesoreriaService";
import { getHttpErrorMessage } from "../../../utils/httpError";
import "./pagartesoreria.css";
import PagoEtapaForm, { PagoEtapaActions } from "./PagoEtapaForm";
import PagoRevisionCells, { FacturaLink } from "./PagoRevisionCells";

const hoy = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const money = (value: number | null | undefined) =>
  new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
const fecha = (value: string | null) =>
  value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
const key = (r: PagoTesoreriaRow) => `${r.correlativo}:${r.idSite}`;
const sum = (
  rows: PagoTesoreriaRow[],
  field: "totalPagar" | "total" | "montoRetencion" = "totalPagar",
) => rows.reduce((s, r) => s + Math.round((r[field] ?? 0) * 100), 0) / 100;
const emptyCatalogos: PagoCatalogos = {
  anticipos: [],
  estados: [],
  ejecutores: [],
  bancos: [],
  transferencias: [],
  monedas: [],
  retenciones: [],
  comprobantes: [],
  tiposPago: [],
  rendiciones: [],
};
const tabs = [
  { estado: 1, label: "Revisión", icon: ShieldCheck },
  { estado: 9, label: "Contabilidad", icon: ReceiptText },
  { estado: 5, label: "Administrativo", icon: Landmark },
  { estado: 8, label: "Programado", icon: Wallet },
  { estado: 4, label: "Rendición", icon: History },
  { estado: 2, label: "Observada", icon: Eye },
  { estado: 99, label: "Reporte", icon: BarChart3 },
];
const REPORT_STATES = [1, 9, 8, 5, 4, 2];
const initialForm = () => ({
  idEjecutor: "",
  idTransferencia: "",
  idBanco: "",
  idMoneda2: "",
  fechaDeposito: hoy(),
  cheque: "",
  nroOperacion: "",
  comentario: "",
});

function SelectField({
  label,
  value,
  options,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  options: PagoOpcion[];
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="pt-field">
      <span>
        {label}
        {required && " *"}
      </span>
      <select
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Seleccionar</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function PagarTesoreriaPage() {
  const [estado, setEstado] = useState(1);
  const esPago = estado === 5 || estado === 8;
  // Se conserva el flujo de registro para una futura habilitación, pero no se
  // encuentra disponible en Programado ni Administrativo por el momento.
  const registroPagoDisponible = false;
  const esReporte = estado === 99;
  const [rows, setRows] = useState<PagoTesoreriaRow[]>([]);
  const [catalogos, setCatalogos] = useState(emptyCatalogos);
  const [puedePagar, setPuedePagar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [success, setSuccess] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [cliente, setCliente] = useState("");
  const [moneda, setMoneda] = useState("");
  const [comprobantesFiltro, setComprobantesFiltro] = useState<string[]>([]);
  const [bancosCtaFiltro, setBancosCtaFiltro] = useState<number[]>([]);
  const [responsablesFiltro, setResponsablesFiltro] = useState<string[]>([]);
  const [busquedaResponsable, setBusquedaResponsable] = useState("");
  const [solicitantesFiltro, setSolicitantesFiltro] = useState<string[]>([]);
  const [busquedaSolicitante, setBusquedaSolicitante] = useState("");
  const [rendicion, setRendicion] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [groupBy, setGroupBy] = useState<"comprobante" | "proyecto-site" | "responsable" | "banco">("comprobante");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [form, setForm] = useState(initialForm);
  const [operationSaving, setSaving] = useState(false);
  const [editingRevision, setEditingRevision] = useState(false);
  const [registroPagoAbierto, setRegistroPagoAbierto] = useState(false);
  const saving = operationSaving || editingRevision;
  const [permisosRevision, setPermisosRevision] = useState<PagoRevisionPermisos>({
    puedeEditar: false, puedeEditarOperacion: false, puedeEditarEstado: false,
  });
  const columnCount = estado === 1 ? 21 : estado === 9 ? 16 : 15;
  const [confirmation, setConfirmation] = useState<PagoTesoreriaRequest | null>(
    null,
  );
  const [detail, setDetail] = useState<PagoTesoreriaRow | null>(null);
  const [cuentas, setCuentas] = useState<
    {
      cuenta: string | null;
      cuentaInter: string | null;
      nombreCta: string | null;
      banco: string | null;
    }[]
  >([]);
  const [cuentasError, setCuentasError] = useState("");
  const [cuentasLoading, setCuentasLoading] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const detailDialog = useRef<HTMLDialogElement>(null);
  const fetchRef = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  const selectAll = useRef<HTMLInputElement>(null);

  const loadCatalogos = useCallback(async (signal?: AbortSignal) => {
    setCatalogError("");
    try {
      const result = await obtenerCatalogosPago(signal);
      if (!signal?.aborted) {
        setCatalogos({ ...emptyCatalogos, ...result.catalogos });
        setPuedePagar(result.puedePagar);
        setPermisosRevision(result.permisosRevision ?? {
          puedeEditar: false, puedeEditarOperacion: false, puedeEditarEstado: false,
        });
        if (!result.permisosRevision) {
          setCatalogError("La API en ejecución todavía no incluye la edición de Revisión. Reinicie y recompile el backend; después pulse Reintentar catálogos.");
        } else if (!result.permisosRevision.puedeEditar) {
          setCatalogError("La edición de Revisión está deshabilitada porque el usuario no tiene un empleado asociado válido. Revise su vinculación en Seguridad / Usuarios.");
        }
      }
    } catch (e) {
      if (!signal?.aborted) {
        setPuedePagar(false);
        setCatalogError(
          getHttpErrorMessage(
            e,
            "No se pudieron cargar los catálogos. Verifique el permiso de acceso a esta página.",
          ),
        );
      }
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void loadCatalogos(controller.signal);
    return () => controller.abort();
  }, [loadCatalogos]);

  const load = useCallback(
    async (status: number, start: string, end: string) => {
      fetchRef.current?.abort();
      const controller = new AbortController();
      fetchRef.current = controller;
      setSelected(new Set());
      setExpanded(new Set());
      setRows([]);
      setError("");
      setLoading(true);
      try {
        const result = status === 99
          ? (await Promise.all(REPORT_STATES.map((reportState) =>
              listarPagosTesoreria(
                reportState,
                reportState === 4 ? `${hoy().slice(0, 7)}-01` : "",
                reportState === 4 ? hoy() : "",
                controller.signal)))).flat()
          : await listarPagosTesoreria(status, start, end, controller.signal);
        if (!controller.signal.aborted) setRows(result);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            getHttpErrorMessage(e, "No se pudieron cargar los recibos."),
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [],
  );
  useEffect(() => {
    void load(1, "", "");
    return () => fetchRef.current?.abort();
  }, [load]);
  useEffect(() => {
    if (confirmation) dialog.current?.showModal();
    else dialog.current?.close();
  }, [confirmation]);
  useEffect(() => {
    if (!detail) {
      detailDialog.current?.close();
      return;
    }
    detailDialog.current?.showModal();
    const controller = new AbortController();
    setCuentas([]);
    setCuentasError("");
    setCuentasLoading(true);
    if (!detail.idResponsable) {
      setCuentasLoading(false);
      return () => controller.abort();
    }
    obtenerCuentasPago(detail.idResponsable, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setCuentas(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setCuentasError(
            getHttpErrorMessage(e, "No se pudieron consultar las cuentas."),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setCuentasLoading(false);
      });
    return () => controller.abort();
  }, [detail]);

  const visibleRows = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return rows.filter(
      (r) =>
        (!responsablesFiltro.length || responsablesFiltro.includes(r.responsable ?? "")) &&
        (!solicitantesFiltro.length || solicitantesFiltro.includes(r.solicitante ?? "")) &&
        (!rendicion || String(r.idRendicion) === rendicion) &&
        (!cliente || r.cliente === cliente) &&
        (!moneda || String(r.tipoMoneda) === moneda) &&
        (!comprobantesFiltro.length || comprobantesFiltro.includes(r.comprobante ?? "")) &&
        (!bancosCtaFiltro.length || (r.idBancoCta != null && bancosCtaFiltro.includes(r.idBancoCta))) &&
        (!search ||
          [
            r.correlativo,
            r.responsable,
            r.solicitante,
            r.cliente,
            r.proyecto,
            r.site,
            r.idSite,
            r.ot,
            r.detalle,
            r.nroOperacion,
          ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(search)),
    );
  }, [
    rows,
    query,
    cliente,
    moneda,
    comprobantesFiltro,
    bancosCtaFiltro,
    responsablesFiltro,
    solicitantesFiltro,
    rendicion,
  ]);
  const selectedRows = useMemo(
    () => visibleRows.filter((r) => selected.has(key(r))),
    [visibleRows, selected],
  );
  const selectedCurrencies = new Set(selectedRows.map((r) => r.tipoMoneda));
  const totals = useMemo(
    () =>
      [...new Set(visibleRows.map((r) => r.tipoMoneda))].map((id) => ({
        id,
        nombre:
          visibleRows.find((r) => r.tipoMoneda === id)?.moneda ||
          `Moneda ${id}`,
        total: sum(visibleRows.filter((r) => r.tipoMoneda === id)),
      })),
    [visibleRows],
  );
  const reportMetrics = useMemo(() => {
    const stages = [
      { label: "Revisión", states: [1] },
      { label: "Contabilidad", states: [9] },
      { label: "Programado", states: [8] },
      { label: "Administrativo", states: [5] },
      { label: "Rendición", states: [4] },
      { label: "Observadas", states: [2, 7] },
    ];
    return stages.map((stage) => {
      const items = rows.filter((row) => stage.states.includes(row.estado));
      const currencies = [...new Set(items.map((item) => item.tipoMoneda))].map((currencyId) => ({
        name: items.find((item) => item.tipoMoneda === currencyId)?.moneda || `Moneda ${currencyId}`,
        amount: sum(items.filter((item) => item.tipoMoneda === currencyId)),
      }));
      return { ...stage, count: items.length, currencies };
    });
  }, [rows]);
  const reportMaxCount = Math.max(1, ...reportMetrics.map((metric) => metric.count));
  const groups = useMemo(() => {
    const result = new Map<string, PagoTesoreriaRow[]>();
    for (const r of visibleRows) {
      const groupLabel = groupBy === "proyecto-site"
        ? `${r.proyecto || "Sin proyecto"} · ${r.idSite || "Sin site"}${r.site ? ` · ${r.site}` : ""}`
        : groupBy === "responsable"
          ? r.responsable || "Sin responsable"
          : groupBy === "banco"
            ? `${r.idBancoCta ?? "Sin banco"} · ${r.idBancoCta == null ? "Sin banco" : catalogos.bancos.find((b) => b.id === r.idBancoCta)?.nombre || "Banco no encontrado"}`
            : `${estado === 5 ? "" : `${r.revisionPm?.trim() || "Sin revisión"} · `}${r.comprobante || "Sin comprobante"}`;
      const label = `${groupLabel} · ${r.moneda || `Moneda ${r.tipoMoneda}`}`;
      const id = `${r.tipoMoneda}:${label}`;
      const group = result.get(id);
      if (group) group.push(r);
      else result.set(id, [r]);
    }
    return [...result].map(([id, items]) => ({
      id,
      label: id.slice(id.indexOf(":") + 1),
      items,
    }));
  }, [visibleRows, estado, groupBy, catalogos.bancos]);
  const selectable = visibleRows.filter(
    (r) => r.correlativo > 0 && r.idSite && r.version,
  );
  useEffect(() => {
    if (selectAll.current)
      selectAll.current.indeterminate =
        selectedRows.length > 0 && selectedRows.length < selectable.length;
  }, [selectedRows.length, selectable.length]);
  const changeFilter = (setter: (v: string) => void, value: string) => {
    setter(value);
    setSelected(new Set());
  };
  const copiarDatoCuenta = async (value: string | null, label: string) => {
    const text = value?.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setError("");
      setSuccess(`${label} copiada al portapapeles.`);
    } catch {
      setError(`No se pudo copiar la ${label.toLowerCase()}.`);
    }
  };
  const toggleRows = (items: PagoTesoreriaRow[], checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of items) {
        if (checked && r.correlativo > 0 && r.idSite && r.version)
          next.add(key(r));
        else next.delete(key(r));
      }
      return next;
    });
  const changeTab = (next: number) => {
    if (saving) return;
    const start = next === 4 ? `${hoy().slice(0, 7)}-01` : "";
    const end = next === 4 ? hoy() : "";
    setEstado(next);
    setDesde(start);
    setHasta(end);
    setQuery("");
    setCliente("");
    setMoneda("");
    setComprobantesFiltro([]);
    setBancosCtaFiltro([]);
    setResponsablesFiltro([]);
    setBusquedaResponsable("");
    setSolicitantesFiltro([]);
    setBusquedaSolicitante("");
    setRendicion("");
    setForm(initialForm());
    setRegistroPagoAbierto(false);
    setExpanded(new Set());
    setSuccess("");
    void load(next, start, end);
  };
  useEffect(() => {
    if (!editingRevision) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [editingRevision]);
  const refreshRevision = async () => {
    setSaving(true);
    setSuccess("Cambios del recibo guardados correctamente.");
    setError("");
    setSelected(new Set());
    try {
      const result = await listarPagosTesoreria(1, desde, hasta);
      setRows(result);
      setExpanded(new Set());
    } catch (e) {
      setRows([]);
      setError(getHttpErrorMessage(e, "El recibo se guardó, pero no se pudo actualizar la lista. Pulse Consultar."));
    } finally { setSaving(false); }
  };
  const medio =
    catalogos.transferencias
      .find((o) => String(o.id) === form.idTransferencia)
      ?.nombre.toUpperCase() || "";
  const isCheque = medio.includes("CHEQUE");
  const isEfectivo = medio.includes("EFECTIVO");
  const datosRegistroPagoCompletos = Boolean(
    form.idEjecutor &&
      form.idTransferencia &&
      form.idBanco &&
      form.idMoneda2 &&
      form.fechaDeposito &&
      form.fechaDeposito <= hoy() &&
      (isCheque ? form.cheque.trim() : isEfectivo || form.nroOperacion.trim()),
  );
  const datosCuentaProgramacionCompletos =
    selectedRows.length > 0 &&
    selectedRows.every((row) =>
      row.idBancoCta != null &&
      Boolean(row.cuenta?.trim()) &&
      Boolean(row.cuentaInter?.trim()) &&
      Boolean(row.nombreCta?.trim()),
    );
  const review = () => {
    setError("");
    setSuccess("");
    if (!registroPagoDisponible) {
      setError("El registro de pago no está habilitado en esta etapa.");
      return;
    }
    if (!esPago || selectedRows.some((r) => r.totalPagar <= 0)) {
      setError(
        "Solo se pueden pagar recibos de Administrativo o Programado con importe neto positivo.",
      );
      return;
    }
    if (!selectedRows.length || selectedRows.length > 500) {
      setError("Seleccione entre 1 y 500 recibos para registrar el lote.");
      return;
    }
    if (
      selectedCurrencies.size !== 1 ||
      selectedRows.some((r) => r.tipoMoneda !== Number(form.idMoneda2))
    ) {
      setError(
        "La moneda del pago debe coincidir con todos los recibos seleccionados. Registre cada moneda en un lote separado.",
      );
      return;
    }
    if (form.fechaDeposito > hoy()) {
      setError("La fecha de depósito no puede ser futura.");
      return;
    }
    setConfirmation({
      estadoOrigen: estado,
      idEjecutor: Number(form.idEjecutor),
      idTransferencia: Number(form.idTransferencia),
      idBanco: Number(form.idBanco),
      idMoneda2: Number(form.idMoneda2),
      fechaDeposito: form.fechaDeposito,
      cheque: form.cheque.trim(),
      nroOperacion: form.nroOperacion.trim(),
      comentario: form.comentario.trim(),
      items: crearItemsTesoreria(selectedRows),
    });
  };
  const save = async () => {
    if (!confirmation || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    const request = confirmation;
    try {
      const result = await registrarPagosTesoreria(request);
      setConfirmation(null);
      setForm((prev) => ({
        ...prev,
        cheque: "",
        nroOperacion: "",
        comentario: "",
      }));
      await load(estado, desde, hasta);
      setSuccess(
        `${result.procesados} recibo(s) registrado(s) como pagados. Puede consultarlos en Rendición.`,
      );
    } catch (e) {
      setConfirmation(null);
      await load(estado, desde, hasta);
      setError(
        getHttpErrorMessage(
          e,
          "No se pudo confirmar el pago. Revise la lista actualizada y el historial antes de volver a intentarlo.",
        ),
      );
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };
  const exportar = () => {
    const sheet = XLSX.utils.json_to_sheet(
      visibleRows.map((r) => ({
        Recibo: r.correlativo,
        ot: r.ot,
        responsable: r.responsable,
        cliente: r.cliente,
        proyecto: r.proyecto,
        site: r.site,
        comprobante: r.comprobante,
        moneda: r.moneda,
        total: r.total,
        Retención: r.montoRetencion,
        "Total a pagar": r.totalPagar,
        "Fecha de depósito": fecha(r.fechaDeposito),
        Operación: r.nroOperacion,
      })),
    );
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Recibos");
    XLSX.writeFile(book, `tesoreria-${estado}-${hoy()}.xlsx`);
  };

  return (
    <AppPage title="Pagos de tesorería" fillHeight>
      <div className="pt-page">
        <header className="pt-hero">
          <div className="pt-heading">
            <span className="pt-kicker">
              <ReceiptText size={14} /> FINANZAS / TESORERÍA
            </span>
            <h1>
              <span className="pt-icon">
                <Banknote size={25} />
              </span>
              Pagos de tesorería
            </h1>
            <p>
              Gestiona la revisión, contabilidad, pago y rendición de los
              recibos.
            </p>
          </div>
          <div className="pt-metrics">
            <div>
              <span>Recibos en consulta</span>
              <strong>{loading ? "—" : visibleRows.length}</strong>
            </div>
            {totals.map((t) => (
              <div key={t.id}>
                <span>
                  {estado === 4 ? "Pagado" : "Por pagar"} · {t.nombre}
                </span>
                <strong>{money(t.total)}</strong>
              </div>
            ))}
          </div>
        </header>
        <nav className="pt-tabs" aria-label="Estado de los pagos">
          {tabs.map((tab) => (
            <button
              key={tab.estado}
              type="button"
              aria-current={estado === tab.estado ? "page" : undefined}
              disabled={saving}
              className={estado === tab.estado ? "active" : ""}
              onClick={() => changeTab(tab.estado)}
            >
              <tab.icon size={17} />
              {tab.label}
              {estado === tab.estado && <span>{rows.length}</span>}
            </button>
          ))}
        </nav>
        {!esReporte && <form
          className="pt-filters"
          onSubmit={(e) => {
            e.preventDefault();
            if (desde && hasta && desde > hasta) {
              setError("La fecha inicial no puede superar la final.");
              return;
            }
            void load(estado, desde, hasta);
          }}
        >
          <fieldset disabled={saving}>
            <label className="pt-search">
              <Search size={17} />
              <input
                aria-label="Buscar recibos"
                placeholder="Recibo, OT, responsable, proyecto u operación…"
                value={query}
                onChange={(e) => changeFilter(setQuery, e.target.value)}
              />
            </label>
            <label className="pt-field">
              <span>{estado === 4 ? "Depósito desde" : "Ingreso desde"}</span>
              <input
                type="date"
                required={estado === 4}
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
              />
            </label>
            <label className="pt-field">
              <span>Hasta</span>
              <input
                type="date"
                required={estado === 4}
                value={hasta}
                min={desde || undefined}
                onChange={(e) => setHasta(e.target.value)}
              />
            </label>
            <button className="pt-primary" type="submit" disabled={loading}>
              <Filter size={15} />
              Consultar
            </button>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setCliente("");
                setMoneda("");
                setComprobantesFiltro([]);
                setBancosCtaFiltro([]);
                setResponsablesFiltro([]);
                setBusquedaResponsable("");
                setSolicitantesFiltro([]);
                setBusquedaSolicitante("");
                setRendicion("");
                setSelected(new Set());
                void load(estado, desde, hasta);
                void loadCatalogos();
              }}
              disabled={loading}
              title="Actualizar recibos y catálogos"
            >
              <RefreshCw size={16} />
            </button>
          </fieldset>
        </form>}
        {catalogError && (
          <div className="pt-alert" role="alert">
            {catalogError}
            <button onClick={() => void loadCatalogos()}>
              Reintentar catálogos
            </button>
          </div>
        )}
        {error && (
          <div className="pt-alert" role="alert">
            {error}
            <button
              aria-label="Cerrar mensaje de error"
              onClick={() => setError("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {success && (
          <div className="pt-success" role="status">
            <CheckCircle2 size={18} />
            {success}
          </div>
        )}
        <div className={`pt-workspace${estado === 1 || (esPago && !registroPagoAbierto) ? " pt-workspace-review" : ""}`}>
          <section className="pt-list">
            {esReporte && (
              <div className="pt-report" aria-label="Reporte de tesorería">
                {loading ? (
                  <div className="pt-report-loading" role="status">
                    <LoaderCircle className="pt-spin" size={24} />
                    <span>Cargando reporte…</span>
                  </div>
                ) : <>
                <div className="pt-report-heading">
                  <div>
                    <h2>Reporte de tesorería</h2>
                    <p>Consolidado de los recibos en todas las etapas del flujo.</p>
                  </div>
                  <span>Actualizado al {fecha(hoy())}</span>
                </div>
                <div className="pt-report-summary">
                <div className="pt-report-kpis">
                  {reportMetrics.map((metric) => (
                    <div key={metric.label}>
                      <span>{metric.label}</span>
                      <strong>{metric.count} registros</strong>
                      <div className="pt-report-currencies">
                        {metric.currencies.length ? metric.currencies.map((currency) => (
                          <small key={currency.name}>{currency.name}: <b>{money(currency.amount)}</b></small>
                        )) : <small>Sin registros</small>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-report-chart">
                  <div className="pt-report-chart-title">Registros por etapa</div>
                  {reportMetrics.map((metric) => (
                    <div className="pt-report-bar" key={metric.label}>
                      <span>{metric.label}</span>
                      <div><i style={{ width: `${(metric.count / reportMaxCount) * 100}%` }} /></div>
                      <strong>{metric.count}</strong>
                      <small>registros</small>
                    </div>
                  ))}
                </div>
                </div>
                </>}
              </div>
            )}
            {!esReporte && <div className="pt-list-toolbar">
              <div>
                <h2>
                  {tabs.find((t) => t.estado === estado)?.label} · Recibos
                </h2>
                <span>
                  {selectedRows.length} seleccionados · {visibleRows.length}{" "}
                  visibles
                </span>
              </div>
              <button
                disabled={!visibleRows.length || saving}
                onClick={exportar}
              >
                <Download size={15} />
                Excel
              </button>
            </div>}
            {!esReporte && <>
            <fieldset className="pt-local-filters" disabled={saving}>
              <select
                aria-label="Filtrar por cliente"
                value={cliente}
                onChange={(e) => changeFilter(setCliente, e.target.value)}
              >
                <option value="">Todos los clientes</option>
                {[...new Set(rows.map((r) => r.cliente).filter(Boolean))]
                  .sort()
                  .map((c) => (
                    <option key={c} value={c!}>
                      {c}
                    </option>
                  ))}
              </select>
              <select
                aria-label="Filtrar por moneda"
                value={moneda}
                onChange={(e) => changeFilter(setMoneda, e.target.value)}
              >
                <option value="">Todas las monedas</option>
                {[...new Set(rows.map((r) => r.tipoMoneda))].map((id) => (
                  <option key={id} value={id}>
                    {rows.find((r) => r.tipoMoneda === id)?.moneda || id}
                  </option>
                ))}
              </select>
              <details className="pt-comprobante-filter">
                <summary>
                  Todos los comprobantes
                  {comprobantesFiltro.length > 0 && ` (${comprobantesFiltro.length})`}
                </summary>
                <div className="pt-comprobante-options" aria-label="Filtrar por comprobante">
                  {[...new Set(rows.map((r) => r.comprobante).filter(Boolean))]
                    .sort((a, b) => a!.localeCompare(b!))
                    .map((item) => (
                      <label key={item}>
                        <input
                          type="checkbox"
                          checked={comprobantesFiltro.includes(item!)}
                          onChange={(e) => {
                            setComprobantesFiltro((current) => e.target.checked
                              ? [...current, item!]
                              : current.filter((value) => value !== item));
                            setSelected(new Set());
                          }}
                        />
                        {item}
                      </label>
                    ))}
                </div>
              </details>
              <details className="pt-comprobante-filter">
                <summary>
                  Todos los bancos de cuenta
                  {bancosCtaFiltro.length > 0 && ` (${bancosCtaFiltro.length})`}
                </summary>
                <div className="pt-comprobante-options" aria-label="Filtrar por IdBancoCta">
                  {[...new Set(rows.map((r) => r.idBancoCta).filter((id): id is number => id != null))]
                    .sort((a, b) => a - b)
                    .map((id) => (
                      <label key={id}>
                        <input
                          type="checkbox"
                          checked={bancosCtaFiltro.includes(id)}
                          onChange={(e) => {
                            setBancosCtaFiltro((current) => e.target.checked
                              ? [...current, id]
                              : current.filter((value) => value !== id));
                            setSelected(new Set());
                          }}
                        />
                        {id} · {catalogos.bancos.find((b) => b.id === id)?.nombre || "Banco no encontrado"}
                      </label>
                    ))}
                </div>
              </details>
              <details className="pt-comprobante-filter">
                <summary>
                  Todos los responsables
                  {responsablesFiltro.length > 0 && ` (${responsablesFiltro.length})`}
                </summary>
                <div className="pt-comprobante-options" aria-label="Filtrar por responsable">
                  <input
                    className="pt-filter-search"
                    type="search"
                    placeholder="Escriba un responsable"
                    value={busquedaResponsable}
                    onChange={(e) => setBusquedaResponsable(e.target.value)}
                  />
                  {[...new Set(rows.map((r) => r.responsable).filter(Boolean))]
                    .filter((item) => item!.toLocaleLowerCase().includes(busquedaResponsable.trim().toLocaleLowerCase()))
                    .sort((a, b) => a!.localeCompare(b!))
                    .map((item) => (
                      <label key={item}>
                        <input
                          type="checkbox"
                          checked={responsablesFiltro.includes(item!)}
                          onChange={(e) => {
                            setResponsablesFiltro((current) => e.target.checked
                              ? [...current, item!]
                              : current.filter((value) => value !== item));
                            setSelected(new Set());
                          }}
                        />
                        {item}
                      </label>
                    ))}
                </div>
              </details>
              <details className="pt-comprobante-filter">
                <summary>
                  Todos los solicitantes
                  {solicitantesFiltro.length > 0 && ` (${solicitantesFiltro.length})`}
                </summary>
                <div className="pt-comprobante-options" aria-label="Filtrar por solicitante">
                  <input
                    className="pt-filter-search"
                    type="search"
                    placeholder="Escriba un solicitante"
                    value={busquedaSolicitante}
                    onChange={(e) => setBusquedaSolicitante(e.target.value)}
                  />
                  {[...new Set(rows.map((r) => r.solicitante).filter(Boolean))]
                    .filter((item) => item!.toLocaleLowerCase().includes(busquedaSolicitante.trim().toLocaleLowerCase()))
                    .sort((a, b) => a!.localeCompare(b!))
                    .map((item) => (
                      <label key={item}>
                        <input
                          type="checkbox"
                          checked={solicitantesFiltro.includes(item!)}
                          onChange={(e) => {
                            setSolicitantesFiltro((current) => e.target.checked
                              ? [...current, item!]
                              : current.filter((value) => value !== item));
                            setSelected(new Set());
                          }}
                        />
                        {item}
                      </label>
                    ))}
                </div>
              </details>
              {estado === 4 && (
                <select
                  aria-label="Filtrar por rendición"
                  value={rendicion}
                  onChange={(e) => changeFilter(setRendicion, e.target.value)}
                >
                  <option value="">Todas las rendiciones</option>
                  {catalogos.rendiciones.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nombre}
                    </option>
                  ))}
                </select>
              )}
              <select
                aria-label="Agrupar recibos"
                value={groupBy}
                onChange={(e) => {
                  setGroupBy(e.target.value as typeof groupBy);
                  setExpanded(new Set());
                }}
              >
                <option value="comprobante">Agrupar por comprobante</option>
                <option value="proyecto-site">Agrupar por PROYECTO/SITE</option>
                <option value="responsable">Agrupar por responsable</option>
                <option value="banco">Agrupar por banco</option>
              </select>
            </fieldset>
            <div className="pt-table-wrap" aria-busy={loading}>
              <table className="pt-table">
                <thead>
                  <tr>
                    <th>
                      {
                        <input
                          ref={selectAll}
                          type="checkbox"
                          aria-label="Seleccionar todos los recibos filtrados"
                          disabled={
                            saving ||
                            loading ||
                            !puedePagar ||
                            !selectable.length
                          }
                          checked={
                            selectable.length > 0 &&
                            selectedRows.length === selectable.length
                          }
                          onChange={(e) =>
                            toggleRows(selectable, e.target.checked)
                          }
                        />
                      }
                    </th>
                    <th>Recibo / OT</th>
                    <th>Responsable / Solicitante</th>
                    <th>Proyecto / Site</th>
                    <th>Site + Detalle</th>
                    <th>Fecha</th>
                    {(estado === 1 || estado === 9) && (
                      <th title="RevisionPmAprobar: revisión de la aprobación previa">Revisión de aprobación</th>
                    )}
                    <th className="numeric">Total</th>
                    <th className="numeric">Retención</th>
                    <th className="numeric">
                      {estado === 4 ? "Pagado" : "A pagar"}
                    </th>
                    <th>Detalle</th>
                    <th>View factura</th>
                    <th>IdBancoCta</th>
                    <th>Cuenta</th>
                    <th>CuentaInter</th>
                    <th>NombreCta</th>
                    {estado === 1 && <>
                      <th>Anticipo</th><th>NroOperacion</th><th>Comprobante</th><th>TipoPago</th>
                      <th className="pt-revision-actions">Edición</th>
                    </>}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={columnCount}>
                        <div className="pt-empty">
                          <LoaderCircle className="pt-spin" size={28} />
                          <strong>Cargando recibos…</strong>
                        </div>
                      </td>
                    </tr>
                  ) : !visibleRows.length ? (
                    <tr>
                      <td colSpan={columnCount}>
                        <div className="pt-empty">
                          <ReceiptText size={36} />
                          <strong>
                            {error
                              ? "No se pudo completar la consulta"
                              : rows.length
                                ? "No hay coincidencias con los filtros"
                                : estado === 4
                                  ? "No hay pagos en este período"
                                  : "No hay recibos pendientes en esta consulta"}
                          </strong>
                          <span>
                            {error
                              ? "Vuelva a consultar para actualizar los datos."
                              : "Puedes cambiar los filtros o actualizar la consulta."}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    groups.map((g) => (
                      <Fragment key={g.id}>
                        <tr className="pt-group">
                          <td>
                            {
                              <input
                                type="checkbox"
                                aria-label={`Seleccionar ${g.label}`}
                                disabled={saving || !puedePagar}
                                checked={
                                  g.items.some(
                                    (r) =>
                                      r.correlativo > 0 &&
                                      r.idSite &&
                                      r.version,
                                  ) &&
                                  g.items
                                    .filter(
                                      (r) =>
                                        r.correlativo > 0 &&
                                        r.idSite &&
                                        r.version,
                                    )
                                    .every((r) => selected.has(key(r)))
                                }
                                onChange={(e) =>
                                  toggleRows(g.items, e.target.checked)
                                }
                              />
                            }
                          </td>
                          <td colSpan={estado === 1 || estado === 9 ? 8 : 7}>
                            <button
                              disabled={saving}
                              onClick={() =>
                                setExpanded((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(g.id)) next.delete(g.id);
                                  else next.add(g.id);
                                  return next;
                                })
                              }
                              aria-expanded={expanded.has(g.id)}
                            >
                              {!expanded.has(g.id) ? (
                                <ChevronRight size={16} />
                              ) : (
                                <ChevronDown size={16} />
                              )}
                              {g.label}
                              <span>{g.items.length} recibos</span>
                            </button>
                          </td>
                          <td className="numeric">{money(sum(g.items))}</td>
                          <td colSpan={estado === 1 ? 11 : 7} />
                        </tr>
                        {expanded.has(g.id) &&
                          g.items.map((r) => (
                            <tr
                              key={key(r)}
                              className={selected.has(key(r)) ? "selected" : ""}
                            >
                              <td>
                                {
                                  <input
                                    type="checkbox"
                                    aria-label={`Seleccionar recibo ${r.correlativo}`}
                                    checked={selected.has(key(r))}
                                    disabled={
                                      saving ||
                                      !puedePagar ||
                                      !r.version ||
                                      !r.idSite ||
                                      !(r.correlativo > 0)
                                    }
                                    onChange={(e) =>
                                      toggleRows([r], e.target.checked)
                                    }
                                  />
                                }
                              </td>
                              <td>
                                <button
                                  className="pt-link"
                                  onClick={() => setDetail(r)}
                                >
                                  {r.correlativo}
                                </button>
                                <small>OT {r.ot || "—"}</small>
                              </td>
                              <td>
                                <strong>
                                  {r.responsable || "Sin responsable"}
                                </strong>
                                <small>{r.solicitante || "—"}</small>
                                {estado === 4 && (
                                  <small>
                                    Rendición: {r.rendicion || "Sin estado"}
                                  </small>
                                )}
                                {estado === 9 && (
                                  <small>
                                    Revisión: {r.revisionPm || "—"} ·{" "}
                                    {fecha(r.fechaRevision)}
                                  </small>
                                )}
                                {estado === 2 && (
                                  <small title={r.observacion || undefined}>
                                    {r.estado === 7
                                      ? "Observado administrativo"
                                      : "Observado de aprobación"}
                                    : {r.observacion || "Sin motivo"}
                                  </small>
                                )}
                              </td>
                              <td>
                                <strong>{r.proyecto || "—"}</strong>
                                <small>
                                  {r.site || r.idSite} · {r.cliente}
                                </small>
                              </td>
                              <td>
                                <button
                                  className="pt-copy-value pt-copy-truncate"
                                  onClick={() => void copiarDatoCuenta(
                                    [r.idSite, r.site, r.detalle].filter(Boolean).join(" / "),
                                    "Site y detalle",
                                  )}
                                  title="Copiar Site y detalle completos"
                                >
                                  {[r.idSite, r.site, r.detalle].filter(Boolean).join(" / ") || "—"}
                                </button>
                              </td>
                              <td>
                                {fecha(
                                  estado === 4 ? r.fechaDeposito : r.fecha,
                                )}
                              </td>
                              {(estado === 1 || estado === 9) && (
                                <td>
                                  <strong>{r.revisionPmAprobar?.trim() || "Sin registro"}</strong>
                                  <small>{fecha(r.fechaRevisionAprobar)}</small>
                                </td>
                              )}
                              <td className="numeric">{money(r.total)}</td>
                              <td className="numeric">
                                {money(r.montoRetencion)}
                              </td>
                              <td className="numeric pt-amount">
                                {money(r.totalPagar)}
                                <small>{r.moneda}</small>
                              </td>
                              <td>
                                <button
                                  title="Ver detalle y cuentas"
                                  aria-label={`Ver detalle del recibo ${r.correlativo}`}
                                  onClick={() => setDetail(r)}
                                >
                                  <Eye size={16} />
                                </button>
                              </td>
                              <td><FacturaLink referencia={r.imgFactura} correlativo={r.correlativo} /></td>
                              <td>
                                {r.idBancoCta == null
                                  ? "â€”"
                                  : `${r.idBancoCta} · ${catalogos.bancos.find((b) => b.id === r.idBancoCta)?.nombre || "Banco no encontrado"}`}
                              </td>
                              <td>
                                {r.cuenta ? (
                                  <button
                                    className="pt-copy-value"
                                    onClick={() => void copiarDatoCuenta(r.cuenta, "Cuenta")}
                                    title="Copiar cuenta"
                                  >
                                    {r.cuenta}
                                  </button>
                                ) : "â€”"}
                              </td>
                              <td>
                                {r.cuentaInter ? (
                                  <button
                                    className="pt-copy-value"
                                    onClick={() => void copiarDatoCuenta(r.cuentaInter, "CuentaInter")}
                                    title="Copiar cuenta interbancaria"
                                  >
                                    {r.cuentaInter}
                                  </button>
                                ) : "â€”"}
                              </td>
                              <td>{r.nombreCta || "â€”"}</td>
                              {estado === 1 && <PagoRevisionCells row={r} catalogos={catalogos}
                                permisos={permisosRevision} disabled={saving || loading || !puedePagar}
                                onEditing={setEditingRevision} onSaved={refreshRevision} />}
                            </tr>
                          ))}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <footer className="pt-table-footer">
              <span>Importes en la moneda original del recibo</span>
              {selectedRows.length > 0 && (
                <button
                  disabled={saving}
                  onClick={() => setSelected(new Set())}
                >
                  Limpiar selección
                </button>
              )}
            </footer>
            {!esReporte && <div className="pt-grid-actions" role="group" aria-label={`Acciones de ${tabs.find(t => t.estado === estado)?.label}`}>
              {esPago && (
                <button className="pt-primary" type="button"
                  disabled={saving || loading}
                  onClick={() => setRegistroPagoAbierto(true)}>
                  Registrar pago
                </button>
              )}
              <PagoEtapaActions estado={estado} formId={`pt-stage-${estado}`}
                disabled={saving || loading || !puedePagar || !selectedRows.length || selectedRows.length > 500}
                programarDisabled={estado === 5 && !datosCuentaProgramacionCompletos} />
            </div>}
            </>}
            {estado === 1 && (
              <PagoEtapaForm
                key={estado}
                formId={`pt-stage-${estado}`}
                estado={estado}
                rows={selectedRows}
                catalogos={catalogos}
                disabled={saving || loading || !puedePagar}
                onBusy={setSaving}
                onRefresh={() => load(estado, desde, hasta)}
                onMessage={(message, isError) => isError ? setError(message) : setSuccess(message)}
              />
            )}
            {esPago && !registroPagoAbierto && (
              <PagoEtapaForm
                formId={`pt-stage-${estado}`}
                estado={estado}
                rows={selectedRows}
                catalogos={catalogos}
                disabled={saving || loading || !puedePagar}
                onBusy={setSaving}
                onRefresh={() => load(estado, desde, hasta)}
                onMessage={(message, isError) => isError ? setError(message) : setSuccess(message)}
                programarListo={datosCuentaProgramacionCompletos}
                ocultarFormulario
              />
            )}
          </section>
          {estado !== 1 && !esReporte && (!esPago || registroPagoAbierto) && (
            <aside className="pt-payment">
              {!esPago && (
                <PagoEtapaForm
                  formId={`pt-stage-${estado}`}
                  key={estado}
                  estado={estado}
                  rows={selectedRows}
                  catalogos={catalogos}
                  disabled={saving || loading || !puedePagar}
                  onBusy={setSaving}
                  onRefresh={() => load(estado, desde, hasta)}
                  onMessage={(message, isError) =>
                    isError ? setError(message) : setSuccess(message)
                  }
                />
              )}
              {esPago && (
                <>
                  {!registroPagoAbierto && (
                    <button
                      type="button"
                      className="pt-register-payment-toggle"
                      onClick={() => setRegistroPagoAbierto(true)}
                    >
                      Registrar pago
                    </button>
                  )}
                  {registroPagoAbierto && (
                  <section className="pt-payment-register">
                  <div className="pt-payment-title">
                    <span className="pt-icon">
                      <Landmark size={21} />
                    </span>
                    <div>
                      <h2>Registrar pago</h2>
                      <span>Completa los datos del lote</span>
                    </div>
                    <button
                      type="button"
                      className="pt-register-payment-hide"
                      onClick={() => setRegistroPagoAbierto(false)}
                    >
                      Ocultar
                    </button>
                  </div>
                  <div className="pt-payment-register-content">
                  <div className="pt-selection">
                    <span>{selectedRows.length} recibos seleccionados</span>
                    {[...selectedCurrencies].map((id) => (
                      <strong key={id}>
                        {selectedRows.find((r) => r.tipoMoneda === id)?.moneda}{" "}
                        {money(
                          sum(selectedRows.filter((r) => r.tipoMoneda === id)),
                        )}
                      </strong>
                    ))}
                    {!selectedRows.length && <strong>0.00</strong>}
                    {selectedCurrencies.size === 1 && (
                      <small>
                        Total {money(sum(selectedRows, "total"))} · Retención{" "}
                        {money(sum(selectedRows, "montoRetencion"))}
                      </small>
                    )}
                  </div>
                  {selectedCurrencies.size > 1 && (
                    <p className="pt-inline-alert">
                      Selecciona recibos de una sola moneda para continuar.
                    </p>
                  )}
                  {!puedePagar && !catalogError && (
                    <p className="pt-inline-alert">
                      Se requiere acceso a esta página en Seguridad / Menú para
                      registrar pagos.
                    </p>
                  )}
                  <form
                    id="pt-register-payment"
                    onSubmit={(e) => {
                      e.preventDefault();
                      review();
                    }}
                  >
                    <fieldset disabled={saving || !puedePagar || loading}>
                      <SelectField
                        label="Ejecutor"
                        required
                        value={form.idEjecutor}
                        options={catalogos.ejecutores}
                        onChange={(v) =>
                          setForm((p) => ({ ...p, idEjecutor: v }))
                        }
                      />
                      <SelectField
                        label="Medio de pago"
                        required
                        value={form.idTransferencia}
                        options={catalogos.transferencias}
                        onChange={(v) =>
                          setForm((p) => ({
                            ...p,
                            idTransferencia: v,
                            cheque: "",
                            nroOperacion: "",
                          }))
                        }
                      />
                      <div className="pt-form-grid">
                        <SelectField
                          label="Banco de origen"
                          required
                          value={form.idBanco}
                          options={catalogos.bancos}
                          onChange={(v) =>
                            setForm((p) => ({ ...p, idBanco: v }))
                          }
                        />
                        <SelectField
                          label="Moneda del pago"
                          required
                          value={form.idMoneda2}
                          options={catalogos.monedas}
                          onChange={(v) =>
                            setForm((p) => ({ ...p, idMoneda2: v }))
                          }
                        />
                      </div>
                      <label className="pt-field">
                        <span>Fecha de depósito *</span>
                        <input
                          type="date"
                          required
                          max={hoy()}
                          value={form.fechaDeposito}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              fechaDeposito: e.target.value,
                            }))
                          }
                        />
                      </label>
                      {isCheque && (
                        <label className="pt-field">
                          <span>Número de cheque *</span>
                          <input
                            required
                            maxLength={50}
                            value={form.cheque}
                            onChange={(e) =>
                              setForm((p) => ({ ...p, cheque: e.target.value }))
                            }
                            placeholder="N.º de cheque"
                          />
                        </label>
                      )}
                      <label className="pt-field">
                        <span>
                          Número de operación
                          {!isCheque && !isEfectivo ? " *" : " (opcional)"}
                        </span>
                        <input
                          required={!isCheque && !isEfectivo}
                          maxLength={50}
                          value={form.nroOperacion}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              nroOperacion: e.target.value,
                            }))
                          }
                          placeholder="Referencia bancaria"
                        />
                      </label>
                      <label className="pt-field">
                        <span>Comentario (opcional)</span>
                        <textarea
                          rows={2}
                          maxLength={500}
                          value={form.comentario}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              comentario: e.target.value,
                            }))
                          }
                          placeholder="Observaciones del pago"
                        />
                      </label>
                    </fieldset>
                  </form>
                  <p className="pt-footnote">
                    Los datos se aplicarán a todos los recibos seleccionados.
                  </p>
                  </div>
                  </section>
                  )}
                  <div key={estado} className="pt-other-actions">
                    <h3>
                      Otras acciones de{" "}
                      {estado === 5 ? "Administrativo" : "Programado"}
                    </h3>
                    <PagoEtapaForm
                      formId={`pt-stage-${estado}`}
                      key={estado}
                      estado={estado}
                      rows={selectedRows}
                      catalogos={catalogos}
                      disabled={saving || loading || !puedePagar}
                      onBusy={setSaving}
                      onRefresh={() => load(estado, desde, hasta)}
                      onMessage={(message, isError) =>
                        isError ? setError(message) : setSuccess(message)
                      }
                      programarListo={datosCuentaProgramacionCompletos}
                      onProgramarIncompleto={() => setRegistroPagoAbierto(true)}
                    />
                  </div>
                </>
              )}
            </aside>
          )}
        </div>
        <dialog
          ref={dialog}
          className="pt-dialog"
          onCancel={(e) => {
            e.preventDefault();
            if (!saving) setConfirmation(null);
          }}
          aria-labelledby="pt-confirm-title"
        >
          <div className="pt-dialog-heading">
            <h2 id="pt-confirm-title">Confirmar registro de pago</h2>
            <button
              disabled={saving}
              aria-label="Cerrar confirmación"
              onClick={() => setConfirmation(null)}
            >
              <X size={19} />
            </button>
          </div>
          {confirmation && (
            <>
              <p>
                Se registrarán{" "}
                <strong>{confirmation.items.length} recibos</strong> como
                pagados.
              </p>
              <div className="pt-confirm-total">
                {
                  catalogos.monedas.find((o) => o.id === confirmation.idMoneda2)
                    ?.nombre
                }{" "}
                {money(
                  confirmation.items.reduce(
                    (s, i) => s + Math.round(i.totalPagar * 100),
                    0,
                  ) / 100,
                )}
              </div>
              <dl className="pt-detail-grid">
                <div>
                  <dt>Ejecutor</dt>
                  <dd>
                    {
                      catalogos.ejecutores.find(
                        (o) => o.id === confirmation.idEjecutor,
                      )?.nombre
                    }
                  </dd>
                </div>
                <div>
                  <dt>Banco de origen</dt>
                  <dd>
                    {
                      catalogos.bancos.find(
                        (o) => o.id === confirmation.idBanco,
                      )?.nombre
                    }
                  </dd>
                </div>
                <div>
                  <dt>Medio de pago</dt>
                  <dd>
                    {
                      catalogos.transferencias.find(
                        (o) => o.id === confirmation.idTransferencia,
                      )?.nombre
                    }
                  </dd>
                </div>
                <div>
                  <dt>Fecha de depósito</dt>
                  <dd>{fecha(confirmation.fechaDeposito)}</dd>
                </div>
                <div>
                  <dt>Cheque / Operación</dt>
                  <dd>
                    {confirmation.cheque || "—"} /{" "}
                    {confirmation.nroOperacion || "—"}
                  </dd>
                </div>
                <div>
                  <dt>Recibos</dt>
                  <dd>
                    {confirmation.items.map((i) => i.correlativo).join(", ")}
                  </dd>
                </div>
              </dl>
              <div className="pt-dialog-actions">
                <button disabled={saving} onClick={() => setConfirmation(null)}>
                  Volver a revisar
                </button>
                <button
                  className="pt-primary"
                  disabled={saving}
                  onClick={() => void save()}
                >
                  {saving ? "Registrando…" : "Confirmar pago"}
                </button>
              </div>
            </>
          )}
        </dialog>
        <dialog
          ref={detailDialog}
          className="pt-dialog pt-detail-dialog"
          onCancel={(e) => {
            e.preventDefault();
            setDetail(null);
          }}
          aria-labelledby="pt-detail-title"
        >
          <div className="pt-dialog-heading">
            <h2 id="pt-detail-title">Recibo {detail?.correlativo}</h2>
            <button aria-label="Cerrar detalle" onClick={() => setDetail(null)}>
              <X size={19} />
            </button>
          </div>
          {detail && (
            <>
              <span className="pt-badge">
                {detail.estado === 7
                  ? "Observada administrativa"
                  : tabs.find((t) => t.estado === detail.estado)?.label}
              </span>
              <dl className="pt-detail-grid">
                {[
                  ["Responsable", detail.responsable],
                  ["Solicitante", detail.solicitante],
                  ["Cliente", detail.cliente],
                  ["Proyecto", detail.proyecto],
                  ["Site", `${detail.idSite} · ${detail.site || ""}`],
                  ["OT", detail.ot],
                  ["Tipo de trabajo", detail.tipoTrabajo],
                  ["Tarea", detail.tarea],
                  ["Comprobante", detail.comprobante],
                  ["Serie", detail.serie],
                  ["RUC", detail.ruc],
                  ["Fecha de emisión", fecha(detail.fecEmision)],
                  ["Rendición", detail.rendicion],
                  ["Turno de revisión", detail.revisionPm],
                  ["Revisión de aprobación", detail.revisionPmAprobar],
                  ["Fecha de revisión de aprobación", fecha(detail.fechaRevisionAprobar)],
                  ["Fecha de revisión", fecha(detail.fechaRevision)],
                  ["Ingreso", fecha(detail.fecha)],
                  ["Depósito", fecha(detail.fechaDeposito)],
                  ["Banco del pago", detail.banco],
                  [
                    "IdBancoCta",
                    detail.idBancoCta == null
                      ? null
                      : `${detail.idBancoCta} · ${catalogos.bancos.find((b) => b.id === detail.idBancoCta)?.nombre || "Banco no encontrado"}`,
                  ],
                  ["Cuenta", detail.cuenta],
                  ["CuentaInter", detail.cuentaInter],
                  ["NombreCta", detail.nombreCta],
                  [
                    "Operación / Cheque",
                    `${detail.nroOperacion || "—"} / ${detail.cheque || "—"}`,
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value || "—"}</dd>
                  </div>
                ))}
              </dl>
              <h3>Detalle del recibo</h3>
              {detail.observacion && (
                <div className="pt-inline-alert">
                  <strong>Observación</strong>
                  <p className="pt-preserve">{detail.observacion}</p>
                </div>
              )}
              <FacturaLink referencia={detail.imgFactura} correlativo={detail.correlativo} />
              <p className="pt-preserve">{detail.detalle || "Sin detalle"}</p>
              {detail.comentarioAdicional && (
                <p className="pt-preserve">{detail.comentarioAdicional}</p>
              )}
              <div className="pt-selection">
                <span>
                  Total {money(detail.total)} · Retención{" "}
                  {money(detail.montoRetencion)}
                </span>
                <strong>
                  {detail.moneda} {money(detail.totalPagar)}
                </strong>
              </div>
              <h3>Cuentas del responsable</h3>
              {cuentasLoading ? (
                <p>Cargando cuentas…</p>
              ) : cuentasError ? (
                <p role="alert">{cuentasError}</p>
              ) : !cuentas.length ? (
                <p>No hay cuentas registradas para este responsable.</p>
              ) : (
                cuentas.map((c, i) => (
                  <div
                    className="pt-account"
                    key={`${c.cuenta}:${c.cuentaInter}:${i}`}
                  >
                    <span>
                      Banco / Titular{" "}
                      <strong>
                        {c.banco || "—"} · {c.nombreCta || "—"}
                      </strong>
                    </span>
                    <span>
                      Cuenta <strong>{c.cuenta || "—"}</strong>
                    </span>
                    <span>
                      CCI <strong>{c.cuentaInter || "—"}</strong>
                    </span>
                  </div>
                ))
              )}
            </>
          )}
        </dialog>
      </div>
    </AppPage>
  );
}
