import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppPage from "../../../components/base/AppPage";
import DataGridPro from "../../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../../components/datagrid/types";
import { descargarOrdenCompraPdf } from "../../../api/ordenCompraService";
import { buscarEmpleadosResponsables } from "../../../api/empleadoResponsableService";
import { consultarOrdenesPorResponsable, type ConsultaPorResponsable } from "../../../api/reporteResponsableService";
import { getHttpErrorMessage } from "../../../utils/httpError";
import {
  AGRUPACIONES,
  FILTROS_VACIOS,
  calcularResumen,
  categoria,
  filtrarFilas,
  formatFecha,
  formatMonto,
  formatMontoMoneda,
  formatPorcentaje,
  claveSite,
  etiquetaSite,
  opcionesDistintas,
  prepararFilas,
  resumirPor,
  type Agrupacion,
  type EstadoPagoOc,
  type FilaReporte,
  type FiltrosReporte,
  type ResumenGrupo,
  type VinculoFiltro,
} from "./responsable/responsableLogic";
import { exportarPdfIa } from "./responsable/responsableIaPdf";
import { calcularAlertas, responsablesAnalizados } from "./responsable/responsableAnalisis";

type ResponsableElegido = { id: number; nombre: string; documento: string };
type Vista = "resumen" | "detalle";
type ModoBusqueda = "responsables" | "documento";

const VINCULOS: Array<{ value: VinculoFiltro; label: string }> = [
  { value: "todos", label: "Todos" },
  { value: "conPago", label: "Con pago" },
  { value: "sinPago", label: "Sin pago" },
  { value: "planillaSinOc", label: "Planilla sin OC" },
];

const ESTADO_PAGO_ESTILO: Record<string, { color: string; fondo: string }> = {
  "PAGADO COMPLETO": { color: "#166534", fondo: "#DCFCE7" },
  "PAGO PARCIAL": { color: "#92400E", fondo: "#FEF3C7" },
  "SIN PAGO": { color: "#991B1B", fondo: "#FEE2E2" },
  "PAGADO EN EXCESO": { color: "#5B21B6", fondo: "#EDE9FE" },
  "SIN OC": { color: "#475569", fondo: "#F1F5F9" },
};

function EstadoPagoChip({ estado }: { estado: EstadoPagoOc | "SIN OC" }) {
  if (!estado) return <span>—</span>;
  const estilo = ESTADO_PAGO_ESTILO[estado];
  return <span style={{ ...styles.chip, color: estilo.color, background: estilo.fondo }}>{estado}</span>;
}

const CATEGORIA_ESTILO: Record<ReturnType<typeof categoria>, { color: string; fondo: string; etiqueta: string }> = {
  conPago: { color: "#166534", fondo: "#DCFCE7", etiqueta: "OC con pago" },
  sinPago: { color: "#92400E", fondo: "#FEF3C7", etiqueta: "OC sin pago" },
  planillaSinOc: { color: "#991B1B", fondo: "#FEE2E2", etiqueta: "Planilla sin OC" },
};

export default function ReporteResponsablePage() {
  const [modo, setModo] = useState<ModoBusqueda>("responsables");
  const [elegidos, setElegidos] = useState<ResponsableElegido[]>([]);
  const [textoResponsable, setTextoResponsable] = useState("");
  const [sugerencias, setSugerencias] = useState<ResponsableElegido[]>([]);
  const [buscandoSugerencias, setBuscandoSugerencias] = useState(false);
  const [documento, setDocumento] = useState("");

  const [filas, setFilas] = useState<FilaReporte[]>([]);
  const [criterioConsultado, setCriterioConsultado] = useState("");
  const [consultado, setConsultado] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosReporte>(FILTROS_VACIOS);
  const [vista, setVista] = useState<Vista>("resumen");
  const [agrupacion, setAgrupacion] = useState<Agrupacion>("responsable");
  const [cargando, setCargando] = useState(false);
  const [exportando, setExportando] = useState<"" | "ia">("");
  const [ocEnProceso, setOcEnProceso] = useState<number | null>(null);
  const [error, setError] = useState("");
  const consultaRef = useRef<AbortController | null>(null);

  // Autollenado de responsables: consulta el buscador existente de empleados responsables.
  useEffect(() => {
    const texto = textoResponsable.trim();
    if (modo !== "responsables" || texto.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setBuscandoSugerencias(true);
      buscarEmpleadosResponsables(texto, controller.signal)
        .then((data) => {
          const unicos = new Map<number, ResponsableElegido>();
          (Array.isArray(data) ? data : []).forEach((item) => {
            const id = Number(item.idEmpleado);
            if (Number.isFinite(id) && id > 0 && !unicos.has(id)) {
              unicos.set(id, { id, nombre: item.nombreEmpleado || item.nombre || `Empleado ${id}`, documento: item.nroDocumento ?? "" });
            }
          });
          setSugerencias(Array.from(unicos.values()).slice(0, 12));
        })
        .catch(() => {
          if (!controller.signal.aborted) setSugerencias([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setBuscandoSugerencias(false);
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [textoResponsable, modo]);

  const sugerenciasVisibles = textoResponsable.trim().length >= 2 && modo === "responsables"
    ? sugerencias.filter((item) => !elegidos.some((elegido) => elegido.id === item.id))
    : [];

  const agregarResponsable = (item: ResponsableElegido) => {
    setElegidos((prev) => (prev.some((p) => p.id === item.id) ? prev : [...prev, item]));
    setTextoResponsable("");
    setSugerencias([]);
  };

  const puedeBuscar = modo === "responsables" ? elegidos.length > 0 : documento.trim().length > 0;

  const buscar = useCallback(async () => {
    if (!puedeBuscar) {
      setError(modo === "responsables" ? "Seleccione al menos un responsable." : "Ingrese el número de documento.");
      return;
    }
    consultaRef.current?.abort();
    const controller = new AbortController();
    consultaRef.current = controller;

    const criterio: ConsultaPorResponsable =
      modo === "responsables"
        ? { modo: "responsables", idResponsables: elegidos.map((item) => item.id) }
        : { modo: "documento", nroDocumento: documento };

    setCargando(true);
    setError("");
    try {
      const rows = await consultarOrdenesPorResponsable(criterio, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const preparadas = prepararFilas(rows);
      setFilas(preparadas);
      const nombres = responsablesAnalizados(preparadas).map((r) => r.nombre).join(", ");
      setCriterioConsultado(
        modo === "responsables"
          ? elegidos.map((item) => item.nombre).join(", ")
          : `Documento ${documento.trim()}${nombres ? ` (${nombres})` : ""}`,
      );
      setConsultado(true);
    } catch (err) {
      if (!controller.signal.aborted) {
        setFilas([]);
        setConsultado(false);
        setError(getHttpErrorMessage(err, "No se pudo consultar el reporte por responsable."));
      }
    } finally {
      if (!controller.signal.aborted) setCargando(false);
    }
  }, [documento, elegidos, modo, puedeBuscar]);

  const limpiar = () => {
    consultaRef.current?.abort();
    setElegidos([]);
    setTextoResponsable("");
    setSugerencias([]);
    setDocumento("");
    setFiltros(FILTROS_VACIOS);
    setFilas([]);
    setConsultado(false);
    setError("");
    setCargando(false);
  };

  const filasFiltradas = useMemo(() => filtrarFilas(filas, filtros), [filas, filtros]);
  const resumen = useMemo(() => calcularResumen(filasFiltradas), [filasFiltradas]);
  const alertasUrgentes = useMemo(() => calcularAlertas(filasFiltradas).filter((alerta) => alerta.nivel === "URGENTE"), [filasFiltradas]);
  const responsablesIncluidos = useMemo(() => responsablesAnalizados(filas), [filas]);
  const resumenGrupos = useMemo(() => resumirPor(filasFiltradas, agrupacion), [filasFiltradas, agrupacion]);
  const etiquetaAgrupacion = AGRUPACIONES.find((item) => item.value === agrupacion)?.label ?? "Grupo";

  const opciones = useMemo(
    () => ({
      clientes: opcionesDistintas(filas, (f) => f.cliente),
      proyectos: opcionesDistintas(filas, (f) => f.proyecto),
      sites: Array.from(new Map(filas.filter((f) => f.idSite).map((f) => [claveSite(f), etiquetaSite(f)])).entries())
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, "es")),
      tiposTrabajo: opcionesDistintas(filas, (f) => f.tipoTrabajo),
      tiposRegistro: opcionesDistintas(filas, (f) => f.tipoRegistro),
      estados: opcionesDistintas(filas, (f) => f.estadoNombre),
      monedas: opcionesDistintas(filas, (f) => f.monedaClave),
    }),
    [filas],
  );

  const actualizar = <K extends keyof FiltrosReporte>(campo: K, valor: FiltrosReporte[K]) =>
    setFiltros((prev) => ({ ...prev, [campo]: valor }));

  const verOc = useCallback(async (idOc: number) => {
    // Mismo servicio y mismo flujo de visualización que oc_v2 (endpoint de PDF de la OC).
    const ventana = window.open("", "_blank");
    setOcEnProceso(idOc);
    setError("");
    try {
      const blob = await descargarOrdenCompraPdf(idOc);
      if (!blob || blob.size === 0) throw new Error("El PDF generado no contiene datos.");
      const url = URL.createObjectURL(blob);
      if (ventana) {
        ventana.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const enlace = document.createElement("a");
        enlace.href = url;
        enlace.download = `OC_${idOc}.pdf`;
        enlace.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    } catch (err) {
      ventana?.close();
      setError(getHttpErrorMessage(err, "No se pudo visualizar el PDF de la orden de compra."));
    } finally {
      setOcEnProceso(null);
    }
  }, []);

  const exportarIa = async () => {
    if (filasFiltradas.length === 0) {
      setError("No hay registros para exportar.");
      return;
    }
    setExportando("ia");
    setError("");
    try {
      await exportarPdfIa({ filas: filasFiltradas, filtros, criterio: criterioConsultado });
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo generar el PDF."));
    } finally {
      setExportando("");
    }
  };

  const columnasResumen: GridColumn<ResumenGrupo>[] = [
    { dataField: "grupo", caption: etiquetaAgrupacion, width: 280, fixed: true },
    ...(agrupacion === "responsable"
      ? ([{ dataField: "documento", caption: "Documento / RUC", width: 130 }] as GridColumn<ResumenGrupo>[])
      : []),
    { dataField: "ocs", caption: "OCs", dataType: "number", width: 70 },
    { dataField: "ocsPagadas", caption: "Pagadas", dataType: "number", width: 90 },
    { dataField: "ocsParciales", caption: "Parciales", dataType: "number", width: 90 },
    { dataField: "ocsSinPago", caption: "Sin pago", dataType: "number", width: 90 },
    { dataField: "planillasSinOc", caption: "Planillas sin OC", dataType: "number", width: 120 },
    { dataField: "subtotalOc", caption: "Monto OC", dataType: "number", width: 130, format: { type: "fixedPoint", precision: 2 } },
    { dataField: "gasto", caption: "Gasto asociado", dataType: "number", width: 130, format: { type: "fixedPoint", precision: 2 } },
    { dataField: "saldoPendiente", caption: "Saldo pendiente", dataType: "number", width: 130, format: { type: "fixedPoint", precision: 2 } },
    { dataField: "excedente", caption: "Pagado en exceso", dataType: "number", width: 130, format: { type: "fixedPoint", precision: 2 } },
    {
      dataField: "avance",
      caption: "% pagado",
      dataType: "number",
      width: 100,
      calculateCellValue: (fila) => Math.round(fila.avance * 10) / 10,
      format: (valor) => formatPorcentaje(Number(valor)),
    },
    { dataField: "estado", caption: "Estado", width: 150, cellRender: (_valor, fila) => <EstadoPagoChip estado={fila.estado} /> },
    { dataField: "moneda", caption: "Moneda", width: 80 },
  ];

  const columnasDetalle: GridColumn<FilaReporte>[] = [
    {
      dataField: "acciones",
      caption: "OC",
      width: 110,
      allowSorting: false,
      allowFiltering: false,
      allowGrouping: false,
      allowHeaderFilter: false,
      calculateCellValue: () => "",
      cellRender: (_valor, fila) =>
        fila.idOc !== null && fila.tieneOc ? (
          <button
            type="button"
            style={styles.botonVerOc}
            disabled={ocEnProceso === fila.idOc}
            onClick={(event) => {
              event.stopPropagation();
              void verOc(fila.idOc as number);
            }}
          >
            {ocEnProceso === fila.idOc ? "Abriendo…" : "Ver OC"}
          </button>
        ) : (
          <button type="button" style={{ ...styles.botonVerOc, ...styles.botonDeshabilitado }} disabled title="Sin OC asociada">
            Sin OC asociada
          </button>
        ),
    },
    { dataField: "responsable", caption: "Responsable", width: 220, groupIndex: 0, sortOrder: "asc" },
    {
      dataField: "tipoRegistro",
      caption: "Tipo de registro",
      width: 190,
      cellRender: (_valor, fila) => {
        const estilo = CATEGORIA_ESTILO[categoria(fila)];
        return <span style={{ ...styles.chip, color: estilo.color, background: estilo.fondo }}>{fila.tipoRegistro || estilo.etiqueta}</span>;
      },
    },
    { dataField: "observacionVinculacion", caption: "Observación de vinculación", width: 240 },
    { dataField: "responsableOc", caption: "Responsable OC", width: 200, calculateCellValue: (f) => f.responsableOc || "—" },
    { dataField: "responsablePlanilla", caption: "Responsable planilla", width: 200, calculateCellValue: (f) => f.responsablePlanilla || "—" },
    { dataField: "cliente", caption: "Cliente", width: 170, calculateCellValue: (f) => f.cliente || "—" },
    { dataField: "proyecto", caption: "Proyecto", width: 170, calculateCellValue: (f) => f.proyecto || "—" },
    { dataField: "site", caption: "Site", width: 170, calculateCellValue: (f) => f.site || "—" },
    { dataField: "idSite", caption: "IdSite", width: 100, calculateCellValue: (f) => f.idSite || "—" },
    { dataField: "correSite", caption: "CorreSite", width: 90, calculateCellValue: (f) => f.correSite ?? "—" },
    { dataField: "ot", caption: "OT", width: 110, calculateCellValue: (f) => f.ot || "—" },
    { dataField: "tipoTrabajo", caption: "Tipo de trabajo", width: 150, calculateCellValue: (f) => f.tipoTrabajo || "—" },
    { dataField: "idOc", caption: "Nro. OC", width: 90, calculateCellValue: (f) => f.idOc ?? "—" },
    { dataField: "fila", caption: "Fila", width: 60, calculateCellValue: (f) => f.fila ?? "—" },
    { dataField: "fechaOc", caption: "Fecha OC", width: 100, calculateCellValue: (f) => formatFecha(f.fechaOc) || "—" },
    { dataField: "detalleOc", caption: "Detalle OC", width: 260, calculateCellValue: (f) => f.detalleOc || "—" },
    { dataField: "cantidad", caption: "Cantidad", dataType: "number", width: 90, format: { type: "fixedPoint", precision: 2 } },
    { dataField: "precioUnitario", caption: "Precio unit.", dataType: "number", width: 110, format: { type: "fixedPoint", precision: 2 } },
    {
      dataField: "subtotalOc",
      caption: "Subtotal OC",
      dataType: "number",
      width: 120,
      format: { type: "fixedPoint", precision: 2 },
      cellStyle: (_valor, fila) => (fila.tieneOc && !fila.primeraDeOc ? { color: "#94A3B8" } : undefined),
    },
    { dataField: "monedaClave", caption: "Moneda", width: 80 },
    {
      dataField: "subtotalGasto",
      caption: "Gasto asociado (planilla)",
      dataType: "number",
      width: 150,
      format: { type: "fixedPoint", precision: 2 },
    },
    {
      dataField: "gastoDeLaOc",
      caption: "Gasto total de la OC/fila",
      dataType: "number",
      width: 160,
      format: { type: "fixedPoint", precision: 2 },
      cellStyle: (_valor, fila) => (fila.tieneOc && !fila.primeraDeOc ? { color: "#94A3B8" } : undefined),
    },
    {
      dataField: "saldoOc",
      caption: "Saldo pendiente OC",
      dataType: "number",
      width: 140,
      format: { type: "fixedPoint", precision: 2 },
      cellStyle: (_valor, fila) => ({
        ...(fila.tieneOc && !fila.primeraDeOc ? { color: "#94A3B8" } : null),
        ...(fila.saldoOc > 0.005 ? { fontWeight: 700, color: "#B45309" } : null),
      }),
    },
    {
      dataField: "estadoPagoOc",
      caption: "Estado de pago",
      width: 160,
      cellRender: (_valor, fila) => (fila.tieneOc ? <EstadoPagoChip estado={fila.estadoPagoOc} /> : <span>—</span>),
    },
    { dataField: "correlativoPago", caption: "Correlativo pago", width: 120, calculateCellValue: (f) => f.correlativoPago ?? "—" },
    {
      dataField: "pagosDeLaOc",
      caption: "Pagos de la OC",
      width: 130,
      calculateCellValue: (f) => (f.tieneOc ? (f.pagosDeLaOc > 1 ? `${f.pagosDeLaOc} pagos` : f.pagosDeLaOc === 1 ? "1 pago" : "Sin pago") : "—"),
      cellStyle: (_valor, fila) => (fila.pagosDeLaOc > 1 ? { color: "#B45309", fontWeight: 700 } : undefined),
    },
    { dataField: "fechaDeposito", caption: "Fecha depósito", width: 120, calculateCellValue: (f) => formatFecha(f.fechaDeposito) || "—" },
    { dataField: "seriePago", caption: "Serie", width: 100, calculateCellValue: (f) => f.seriePago || "—" },
    { dataField: "nroOperacionPago", caption: "Nro. operación", width: 130, calculateCellValue: (f) => f.nroOperacionPago || "—" },
    { dataField: "detallePago", caption: "Planilla.Detalle", width: 260, calculateCellValue: (f) => f.detallePago || "—" },
    { dataField: "estadoNombre", caption: "Estado planilla", width: 120, calculateCellValue: (f) => f.estadoNombre || "—" },
    { dataField: "tieneOc", caption: "Tiene OC", width: 90, calculateCellValue: (f) => (f.tieneOc ? "Sí" : "No") },
    { dataField: "tienePago", caption: "Tiene pago", width: 100, calculateCellValue: (f) => (f.tienePago ? "Sí" : "No") },
  ];

  return (
    <AppPage title="Reporte ejecutivo por responsable" fillHeight>
      <form
        style={styles.panel}
        aria-label="Filtros del reporte"
        onSubmit={(event) => {
          event.preventDefault();
          void buscar();
        }}
      >
        <div style={styles.fila}>
          <div role="tablist" aria-label="Criterio de búsqueda" style={styles.segmento}>
            {(["responsables", "documento"] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={modo === item}
                onClick={() => setModo(item)}
                style={{ ...styles.segmentoBoton, ...(modo === item ? styles.segmentoActivo : null) }}
              >
                {item === "responsables" ? "Por responsables" : "Por documento / RUC"}
              </button>
            ))}
          </div>

          {modo === "responsables" ? (
            <div style={{ ...styles.campo, flex: 1, minWidth: 320, position: "relative" }}>
              <span style={styles.etiqueta}>Responsables (uno o varios)</span>
              <div style={styles.chips}>
                {elegidos.map((item) => (
                  <span key={item.id} style={styles.chipResponsable}>
                    {item.nombre}
                    <button
                      type="button"
                      aria-label={`Quitar ${item.nombre}`}
                      onClick={() => setElegidos((prev) => prev.filter((p) => p.id !== item.id))}
                      style={styles.chipQuitar}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  value={textoResponsable}
                  onChange={(event) => setTextoResponsable(event.target.value)}
                  placeholder={elegidos.length ? "Agregar otro responsable…" : "Escriba para buscar responsables…"}
                  autoComplete="off"
                  style={styles.inputChips}
                />
              </div>
              {sugerenciasVisibles.length > 0 || buscandoSugerencias ? (
                <ul style={styles.sugerencias} role="listbox">
                  {buscandoSugerencias ? <li style={styles.sugerenciaInfo}>Buscando…</li> : null}
                  {sugerenciasVisibles.map((item) => (
                    <li key={item.id} role="option" aria-selected={false}>
                      <button type="button" style={styles.sugerencia} onClick={() => agregarResponsable(item)}>
                        {item.nombre}
                        {item.documento ? <span style={styles.sugerenciaDoc}> · {item.documento}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <label style={styles.campo}>
              <span style={styles.etiqueta}>Nro. documento / RUC del responsable</span>
              <input value={documento} onChange={(event) => setDocumento(event.target.value)} style={styles.control} inputMode="numeric" />
            </label>
          )}

          <button type="submit" style={styles.botonPrimario} disabled={cargando}>
            {cargando ? "Consultando…" : "Buscar"}
          </button>
          <button type="button" style={styles.botonSecundario} onClick={limpiar}>
            Limpiar filtros
          </button>
        </div>

        <div style={styles.fila}>
          <label style={styles.campo}>
            <span style={styles.etiqueta}>Fecha OC desde</span>
            <input type="date" value={filtros.fechaOcDesde} onChange={(e) => actualizar("fechaOcDesde", e.target.value)} style={styles.control} />
          </label>
          <label style={styles.campo}>
            <span style={styles.etiqueta}>Fecha OC hasta</span>
            <input type="date" value={filtros.fechaOcHasta} onChange={(e) => actualizar("fechaOcHasta", e.target.value)} style={styles.control} />
          </label>
          <label style={styles.campo}>
            <span style={styles.etiqueta}>Depósito desde</span>
            <input type="date" value={filtros.fechaDepDesde} onChange={(e) => actualizar("fechaDepDesde", e.target.value)} style={styles.control} />
          </label>
          <label style={styles.campo}>
            <span style={styles.etiqueta}>Depósito hasta</span>
            <input type="date" value={filtros.fechaDepHasta} onChange={(e) => actualizar("fechaDepHasta", e.target.value)} style={styles.control} />
          </label>
          <Selector etiqueta="Cliente" valor={filtros.cliente} opciones={opciones.clientes} onChange={(v) => actualizar("cliente", v)} />
          <Selector etiqueta="Proyecto" valor={filtros.proyecto} opciones={opciones.proyectos} onChange={(v) => actualizar("proyecto", v)} />
          <MultiSelector etiqueta="Site (uno o varios)" valores={filtros.site} opciones={opciones.sites} onChange={(v) => actualizar("site", v)} />
        </div>

        <div style={styles.fila}>
          <Selector etiqueta="Tipo de trabajo" valor={filtros.tipoTrabajo} opciones={opciones.tiposTrabajo} onChange={(v) => actualizar("tipoTrabajo", v)} />
          <Selector etiqueta="Tipo de registro" valor={filtros.tipoRegistro} opciones={opciones.tiposRegistro} onChange={(v) => actualizar("tipoRegistro", v)} />
          <Selector etiqueta="Estado de planilla" valor={filtros.estado} opciones={opciones.estados} onChange={(v) => actualizar("estado", v)} />
          <Selector etiqueta="Moneda" valor={filtros.moneda} opciones={opciones.monedas} onChange={(v) => actualizar("moneda", v)} />
          <label style={styles.campo}>
            <span style={styles.etiqueta}>Estado de vínculo</span>
            <select value={filtros.vinculo} onChange={(e) => actualizar("vinculo", e.target.value as VinculoFiltro)} style={styles.control}>
              {VINCULOS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            style={{ ...styles.botonPdf, background: "#7C3AED", color: "#fff" }}
            disabled={!consultado || exportando !== ""}
            title="Informe por OC con su detalle completo, aprobadores y pagos asociados"
            onClick={() => void exportarIa()}
          >
            {exportando === "ia" ? "Generando…" : "Exportar PDF"}
          </button>
        </div>
      </form>

      {error ? (
        <div role="alert" style={styles.error}>
          {error}
        </div>
      ) : null}

      {!consultado && !cargando ? (
        <div style={styles.vacio}>Seleccione uno o varios responsables (o un documento) y presione Buscar.</div>
      ) : (
        <>
          {alertasUrgentes.map((alerta) => (
            <div key={alerta.alerta} role="alert" style={styles.alertaUrgente}>
              <strong>{alerta.alerta}</strong> — {alerta.detalle}
            </div>
          ))}

          <div style={styles.responsables} aria-label="Responsables analizados">
            <span style={styles.etiqueta}>{responsablesIncluidos.length > 1 ? "Responsables incluidos en la consulta" : "Responsable analizado"}</span>
            {responsablesIncluidos.length === 0 ? (
              <span style={styles.kpiLinea}>Sin registros para {criterioConsultado}.</span>
            ) : (
              responsablesIncluidos.map((r) => (
                <span key={`${r.id}|${r.nombre}`} style={styles.chipResponsable}>
                  {r.nombre}
                  {r.documento ? ` · Doc. ${r.documento}` : ""} · Id {r.id}
                </span>
              ))
            )}
          </div>

          <div style={styles.kpis}>
            <Kpi titulo="OCs" valor={resumen.ocs} />
            <Kpi titulo="Pagadas completas" valor={resumen.ocsPagadas} color="#166534" />
            <Kpi titulo="Pago parcial" valor={resumen.ocsParciales} color="#92400E" />
            <Kpi titulo="Sin pago" valor={resumen.ocsSinPago} color="#991B1B" />
            <Kpi titulo="Pagadas en exceso" valor={resumen.ocsExceso} color="#5B21B6" />
            <Kpi titulo="Planillas sin OC" valor={resumen.planillasSinOc} color="#B45309" />
            {resumen.porMoneda.map((m) => (
              <div key={m.moneda} style={styles.kpiMoneda}>
                <div style={styles.kpiTitulo}>Totales en {m.moneda}</div>
                <div style={styles.kpiLinea}>
                  Monto OC: <strong>{formatMontoMoneda(m.totalOc, m.moneda)}</strong>
                </div>
                <div style={styles.kpiLinea}>
                  Gasto asociado: <strong>{formatMontoMoneda(m.gasto, m.moneda)}</strong> ({formatPorcentaje(m.avance)})
                </div>
                <div style={styles.kpiLinea}>
                  Saldo pendiente: <strong>{formatMontoMoneda(m.saldoPendiente, m.moneda)}</strong>
                </div>
                {m.excedente > 0.005 ? (
                  <div style={styles.kpiLinea}>
                    Pagado en exceso: <strong>{formatMontoMoneda(m.excedente, m.moneda)}</strong>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "6px 0" }}>
          <div role="tablist" aria-label="Vista del reporte" style={styles.segmento}>
            {(["resumen", "detalle"] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={vista === item}
                onClick={() => setVista(item)}
                style={{ ...styles.segmentoBoton, ...(vista === item ? styles.segmentoActivo : null) }}
              >
                {item === "resumen" ? "Vista gerencial" : "Trazabilidad detallada"}
              </button>
            ))}
          </div>
          {vista === "resumen" ? (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={styles.etiqueta}>Resumir por</span>
              <select value={agrupacion} onChange={(event) => setAgrupacion(event.target.value as Agrupacion)} style={styles.control}>
                {AGRUPACIONES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          </div>

          <div style={styles.gridHost}>
            {vista === "resumen" ? (
              <DataGridPro<ResumenGrupo>
                key={agrupacion}
                dataSource={resumenGrupos}
                columns={columnasResumen}
                keyExpr="clave"
                height="fill"
                loading={cargando}
                noDataText="Sin resultados para los filtros indicados."
                stateStoringKey="reporte-responsable-resumen"
                showSearchPanel={false}
                allowExport
                exportFileName="reporte_responsable_resumen"
                autoExpandAll={false}
                rowAlternation={false}
                rowPadding="3px 8px"
                paging={{ pageSize: 100, pageSizes: [50, 100, 250] }}
              />
            ) : (
              <DataGridPro<FilaReporte>
                dataSource={filasFiltradas}
                columns={columnasDetalle}
                keyExpr="id"
                height="fill"
                loading={cargando}
                noDataText="Sin resultados para los filtros indicados."
                stateStoringKey="reporte-responsable-detalle"
                showSearchPanel
                allowExport
                exportFileName="reporte_responsable_detalle"
                autoExpandAll={false}
                rowAlternation={false}
                rowPadding="3px 8px"
                paging={{ pageSize: 100, pageSizes: [50, 100, 250, 500] }}
              />
            )}
          </div>
          <p style={styles.nota}>
            Gasto asociado = suma del subtotal de las planillas pagadas vinculadas a la OC (IdOc + Fila), en la moneda de la OC. Saldo pendiente = monto de la OC menos el gasto
            asociado; un saldo negativo se muestra como pagado en exceso. Cada OC/fila se cuenta una sola vez aunque tenga varios gastos; los totales se separan por moneda, sin
            conversión.
          </p>
        </>
      )}
    </AppPage>
  );
}

function Selector({ etiqueta, valor, opciones, onChange }: { etiqueta: string; valor: string; opciones: string[]; onChange: (valor: string) => void }) {
  return (
    <label style={styles.campo}>
      <span style={styles.etiqueta}>{etiqueta}</span>
      <select value={valor} onChange={(event) => onChange(event.target.value)} style={{ ...styles.control, maxWidth: 220 }}>
        <option value="">Todos</option>
        {opciones.map((opcion) => (
          <option key={opcion} value={opcion}>
            {opcion}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Lista desplegable con casillas y búsqueda para elegir uno o varios valores. */
function MultiSelector({ etiqueta, valores, opciones, onChange }: { etiqueta: string; valores: string[]; opciones: Array<{ value: string; label: string }>; onChange: (valores: string[]) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const contenedor = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrarFuera = (event: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(event.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", cerrarFuera);
    return () => document.removeEventListener("mousedown", cerrarFuera);
  }, [abierto]);

  const visibles = opciones.filter((opcion) => opcion.label.toLowerCase().includes(busqueda.trim().toLowerCase()));
  const alternar = (opcion: string) =>
    onChange(valores.includes(opcion) ? valores.filter((valor) => valor !== opcion) : [...valores, opcion]);
  const resumen =
    valores.length === 0
      ? "Todos"
      : valores.length === 1
        ? opciones.find((opcion) => opcion.value === valores[0])?.label ?? valores[0]
        : `${valores.length} seleccionados`;

  return (
    <div style={{ ...styles.campo, position: "relative" }} ref={contenedor}>
      <span style={styles.etiqueta}>{etiqueta}</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => setAbierto((prev) => !prev)}
        style={{ ...styles.control, minWidth: 180, maxWidth: 240, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}
      >
        {resumen}
      </button>
      {abierto ? (
        <div style={styles.multiPanel}>
          <input
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            placeholder="Buscar…"
            autoFocus
            style={{ ...styles.control, width: "100%", boxSizing: "border-box", marginBottom: 6 }}
          />
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            <button type="button" style={styles.multiAccion} onClick={() => onChange(Array.from(new Set([...valores, ...visibles.map((opcion) => opcion.value)])))}>
              Marcar visibles
            </button>
            <button type="button" style={styles.multiAccion} onClick={() => onChange([])}>
              Quitar todos
            </button>
          </div>
          <div role="listbox" aria-multiselectable="true" style={{ maxHeight: 240, overflowY: "auto" }}>
            {visibles.length === 0 ? <div style={styles.sugerenciaInfo}>Sin coincidencias</div> : null}
            {visibles.map((opcion) => (
              <label key={opcion.value} style={styles.multiOpcion}>
                <input type="checkbox" checked={valores.includes(opcion.value)} onChange={() => alternar(opcion.value)} />
                <span>{opcion.label}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Kpi({ titulo, valor, color = "#0F172A" }: { titulo: string; valor: number; color?: string }) {
  return (
    <div style={styles.kpi}>
      <div style={styles.kpiTitulo}>{titulo}</div>
      <div style={{ ...styles.kpiValor, color }}>{formatMonto(valor).replace(/[.,]00$/, "")}</div>
    </div>
  );
}

const styles = {
  panel: { display: "flex", flexDirection: "column" as const, gap: 8, padding: "8px 12px", border: "1px solid #D8DEE8", borderRadius: 10, background: "#fff", marginBottom: 8 },
  fila: { display: "flex", alignItems: "flex-end", flexWrap: "wrap" as const, gap: 10 },
  campo: { display: "flex", flexDirection: "column" as const, gap: 3 },
  etiqueta: { fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase" as const },
  control: { height: 32, minWidth: 140, padding: "0 8px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 13, background: "#fff", color: "#0F172A" },
  chips: { display: "flex", flexWrap: "wrap" as const, alignItems: "center", gap: 6, minHeight: 32, padding: "2px 6px", border: "1px solid #CBD5E1", borderRadius: 8, background: "#fff" },
  chipResponsable: { display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 4px 2px 8px", borderRadius: 999, background: "#E0F2FE", color: "#075985", fontSize: 12 },
  chipQuitar: { border: 0, background: "transparent", cursor: "pointer", color: "#075985", fontSize: 15, lineHeight: 1 },
  inputChips: { flex: 1, minWidth: 180, border: 0, outline: "none", fontSize: 13, height: 26 },
  sugerencias: { position: "absolute" as const, top: "100%", left: 0, right: 0, zIndex: 20, margin: "2px 0 0", padding: 4, listStyle: "none", background: "#fff", border: "1px solid #CBD5E1", borderRadius: 8, boxShadow: "0 8px 24px rgba(15,23,42,.12)", maxHeight: 260, overflowY: "auto" as const },
  sugerencia: { display: "block", width: "100%", textAlign: "left" as const, border: 0, background: "transparent", padding: "6px 8px", cursor: "pointer", fontSize: 13, borderRadius: 6 },
  sugerenciaDoc: { color: "#64748B" },
  multiPanel: { position: "absolute" as const, top: "100%", left: 0, zIndex: 30, marginTop: 2, width: 280, padding: 8, background: "#fff", border: "1px solid #CBD5E1", borderRadius: 8, boxShadow: "0 8px 24px rgba(15,23,42,.12)" },
  multiAccion: { border: 0, background: "transparent", color: "#1D4ED8", cursor: "pointer", fontSize: 12, padding: 0 },
  multiOpcion: { display: "flex", alignItems: "center", gap: 6, padding: "3px 2px", fontSize: 13, cursor: "pointer" },
  sugerenciaInfo: { padding: "6px 8px", fontSize: 12, color: "#64748B" },
  segmento: { display: "inline-flex", border: "1px solid #CBD5E1", borderRadius: 8, overflow: "hidden" },
  segmentoBoton: { border: 0, background: "#fff", color: "#475569", padding: "7px 14px", cursor: "pointer", fontSize: 13 },
  segmentoActivo: { background: "#1F6F8B", color: "#fff", fontWeight: 600 },
  botonPrimario: { height: 32, padding: "0 18px", border: 0, borderRadius: 8, background: "#1F6F8B", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  botonSecundario: { height: 32, padding: "0 14px", border: "1px solid #CBD5E1", borderRadius: 8, background: "#fff", color: "#334155", fontSize: 13, cursor: "pointer" },
  botonPdf: { height: 32, padding: "0 14px", border: "1px solid #7C3AED", borderRadius: 8, background: "#F5F3FF", color: "#6D28D9", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  botonVerOc: { border: "1px solid #93C5FD", background: "#EFF6FF", color: "#1D4ED8", borderRadius: 6, padding: "2px 8px", fontSize: 12, cursor: "pointer" },
  botonDeshabilitado: { border: "1px solid #E5E7EB", background: "#F3F4F6", color: "#9CA3AF", cursor: "not-allowed" },
  chip: { display: "inline-block", padding: "1px 8px", borderRadius: 999, fontSize: 12, fontWeight: 600 },
  error: { background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 8 },
  vacio: { color: "#64748B", fontSize: 14, padding: 24, textAlign: "center" as const },
  alertaUrgente: { background: "#B91C1C", color: "#fff", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 8, lineHeight: 1.4 },
  responsables: { display: "flex", flexWrap: "wrap" as const, alignItems: "center", gap: 8, margin: "0 0 8px" },
  kpis: { display: "flex", flexWrap: "wrap" as const, gap: 10 },
  kpi: { minWidth: 130, padding: "8px 14px", border: "1px solid #D8DEE8", borderRadius: 10, background: "#fff" },
  kpiMoneda: { minWidth: 230, padding: "8px 14px", border: "1px solid #D8DEE8", borderRadius: 10, background: "#F8FAFC" },
  kpiTitulo: { fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase" as const },
  kpiValor: { fontSize: 22, fontWeight: 700 },
  kpiLinea: { fontSize: 12, color: "#334155" },
  gridHost: { flex: 1, minHeight: 280, display: "flex", flexDirection: "column" as const },
  nota: { fontSize: 11, color: "#64748B", margin: "6px 0 0" },
};
