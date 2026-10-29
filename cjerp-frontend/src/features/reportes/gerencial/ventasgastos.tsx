import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppStatusMessage from "../../../components/base/AppStatusMessage";
import DataGridPro from "../../../components/datagrid/DataGridPro";
import type { GridColumn, GridFormat } from "../../../components/datagrid/types";
import {
  buildPlanillaPagadosDashboardRequest,
  consultarPlanillaEstados,
} from "../../../api/planillaConsultaService";
import {
  consultarAnioVentasSunat,
  consultarPeriodoVentasSunat,
  listarClientesVentasSunat,
  type VentasSunatClienteDto,
  listarPeriodosVentasSunat,
  type VentasSunatPeriodoDto,
  type VentasSunatRegistroDto,
} from "../../../api/ventasSunatService";
import SelectorMultiple from "./VentasSunatSelectorMultiple";
import VentasSunatResumen from "./VentasSunatResumen";
import VentasPorMesChart from "./VentasPorMesChart";
import { afectoDe, clienteDeVenta, etiquetaImporte, igvDe, importeVenta, inafectoDe } from "./ventasImporte";
import VentasConcentracionChart from "./VentasConcentracionChart";
import CostosPorMoneda from "./CostosPorMoneda";
import CostosPorClienteChart from "./CostosPorClienteChart";
import RentabilidadClienteChart from "./RentabilidadClienteChart";
import { exportarPdf, type PdfSeccion, type PdfTabla } from "./exportarVentasGastosPdf";
import {
  construirConcentracion,
  construirCostosCliente,
  construirGastoPorMoneda,
  construirPuntosMensuales,
  construirRentabilidadCliente,
  construirVentasPorMes,
  type RentabilidadMesDato,
} from "./ventasGastosDatos";
import RentabilidadMensualChart from "./RentabilidadMensualChart";
import { getConstantesPorCampo } from "../../../api/constantesService";
import { getHttpErrorMessage } from "../../../utils/httpError";

type RawRow = Record<string, unknown>;

type FilaMes = {
  periodo: string;
  mes: string;
  ventas: number;
  gastos: number;
  resultado: number;
  ratio: number | null;
  cantGastos: number;
};

// Gasto agrupado (periodo, cliente, moneda): montos en la moneda real del recibo. Es lo que se guarda en caché.
type GastoBase = { periodo: string; monto: number; totalPagar: number; moneda: Moneda; idCliente: number; cliente: string; n: number };
// Con el equivalente en soles según los tipos de cambio de la pantalla (se recalcula al cambiarlos, sin volver a consultar).
type GastoNormalizado = GastoBase & { montoPen: number; totalPagarPen: number };

type FilaRentabilidad = {
  clave: string;
  nroDocumento: string;
  nombreCliente: string;
  ventas: number;
  costos: number;
  utilidad: number;
  margen: number | null;
};

type FilaCosto = {
  clave: string;
  nroDocumento: string;
  nombreCliente: string;
  cantidad: number;
  // Suma en la moneda real del recibo (sin convertir).
  PEN: number;
  USD: number;
  EUR: number;
  DOP: number;
  COP: number;
  // Equivalente total en soles con los tipos de cambio de la cabecera.
  costo: number;
  participacion: number;
  // El cliente tiene ventas en el año (por IdCliente o por RUC/DNI).
  conVenta: boolean;
};

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
const EMPRESAS_POR_DEFECTO = ["CJ TELECOM"];
// Años disponibles en el filtro de cabecera.
const ANIOS = [2024, 2025, 2026, 2027, 2028, 2029, 2030];
// Los gastos (Planilla) se registran siempre a nombre de CJ TELECOM (IdEmpresa 1): con otra empresa elegida los costos son 0.
const ID_EMPRESA_GASTOS = "1";
const SIN_EMPRESA = "Sin empresa";
const REQUEST_TIMEOUT_MS = 120000;
const VENTAS_CACHE_MS = 10 * 60 * 1000; // las ventas cargadas cambian poco: se reutilizan al volver a la pantalla
const VENTAS_CONCURRENCIA = 3;

// Caché a nivel de módulo (sobrevive a la navegación entre pantallas).
let cacheClientes: VentasSunatClienteDto[] | null = null;
// Gastos ya consultados por año y tipos de cambio (la consulta de gastos es lenta).
type GastosCargados = { t: number; gastos: GastoBase[]; truncado: boolean; sinFecha: number };
const cacheGastos = new Map<number, GastosCargados>();
const GASTOS_CONCURRENCIA = 4; // meses consultados a la vez (el servidor limita a 120 peticiones por minuto)
const PREFIJO_CACHE_GASTOS = "ventasgastos_gastos_v1_";
// Años cerrados casi no cambian: duran más en caché; el año en curso se refresca antes.
const ttlGastos = (anio: number) => (anio < new Date().getFullYear() ? 6 * 60 * 60 * 1000 : 15 * 60 * 1000);

function leerCacheGastos(anio: number): GastosCargados | null {
  try {
    const crudo = localStorage.getItem(`${PREFIJO_CACHE_GASTOS}${anio}`);
    if (!crudo) return null;
    const dato = JSON.parse(crudo) as GastosCargados;
    return Date.now() - dato.t < ttlGastos(anio) ? dato : null;
  } catch {
    return null;
  }
}

function guardarCacheGastos(anio: number, dato: GastosCargados) {
  try {
    localStorage.setItem(`${PREFIJO_CACHE_GASTOS}${anio}`, JSON.stringify(dato));
  } catch {
    // Sin espacio o sin almacenamiento: la pantalla funciona igual, solo sin caché persistente.
  }
}
const cacheVentasAnio = new Map<number, { t: number; registros: VentasSunatRegistroDto[] }>();
const MONTO: GridFormat = { type: "fixedPoint", precision: 2 };
const PORCENTAJE: GridFormat = { type: "fixedPoint", precision: 1 };

// Tipos de cambio por defecto (editables en pantalla). Solo se usan para el equivalente en soles de los gastos.
const TC_DEFECTO = { USD: 3.5, EUR: 4, DOP: 0.058, COP: 0.0009 };
type Moneda = keyof typeof TC_DEFECTO | "PEN";

const tabsStyle: CSSProperties = { display: "flex", gap: 4, borderBottom: "1px solid #E5E7EB" };
const tabStyle: CSSProperties = {
  padding: "8px 18px",
  border: "none",
  background: "transparent",
  color: "#475569",
  fontWeight: 600,
  cursor: "pointer",
  borderBottom: "2px solid transparent",
};
const tabActiveStyle: CSSProperties = { ...tabStyle, color: "#6D28D9", fontWeight: 700, borderBottom: "2px solid #6D28D9" };

const styles: Record<string, CSSProperties> = {
  campo: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#475569", fontWeight: 600 },
  input: { height: 34, padding: "0 8px", border: "1px solid #CBD5E1", borderRadius: 6, fontSize: 13, width: 90, background: "#fff" },
  select: { height: 34, padding: "0 8px", border: "1px solid #CBD5E1", borderRadius: 6, fontSize: 13, minWidth: 100, background: "#fff" },
  boton: { height: 34, padding: "0 16px", border: "1px solid #2563EB", borderRadius: 6, background: "#2563EB", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  titulo: { fontSize: 14, fontWeight: 800, color: "#0F172A", margin: "0 0 8px" },
  tarjeta: { border: "1px solid #D8E5F2", borderRadius: 14, padding: 14, background: "#fff" },
  chip: { padding: "4px 10px", borderRadius: 999, border: "1px solid #BAE6FD", background: "#E0F2FE", color: "#0C4A6E", fontWeight: 600 },
  kpiLabel: { fontSize: 12, color: "#64748B", fontWeight: 700 },
  kpiValor: { fontSize: 22, fontWeight: 800, color: "#0F172A", marginTop: 4 },
};

const numero = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const t = String(v ?? "").trim();
  if (!t) return 0;
  const directo = Number(t);
  if (Number.isFinite(directo)) return directo;
  const n = Number(t.includes(",") && !t.includes(".") ? t.replace(",", ".") : t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const fmt = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (n: number) => String(n).padStart(2, "0");
const nombreMes = (periodo: string) => `${MESES[Number(periodo.slice(4)) - 1] ?? periodo.slice(4)} ${periodo.slice(0, 4)}`;
// Nombre comparable: sin tildes, símbolos ni sufijo societario (SAC, SA, SRL, EIRL).
const claveNombre = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, "")
    .replace(/\b(SAC|SA|SRL|EIRL|SAA)\b/g, "")
    .replace(/\s+/g, "");
// Nro de documento comparable (RUC o DNI): sin espacios ni guiones. Es la llave que relaciona ventas y costos de un cliente.
const normDoc = (v: string | null | undefined) => String(v ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
// Clave de cliente para unir ventas y costos: RUC/DNI y, si no hay, IdCliente o nombre.
// Clientes que se quitan de ventas, costos y rentabilidad mientras esté marcada la casilla de exclusión del filtro de clientes.
const CLIENTES_EXCLUIDOS_DEFECTO = ["PLANILLA", "CJ TELECOM"];
const CLIENTE_FINANCIERO = "FINANCIERO"; // se quita con su propia casilla (SIN FINANCIERO)
const claveNombreCliente = (n: string) =>
  n.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const CLAVES_EXCLUIDAS_DEFECTO = CLIENTES_EXCLUIDOS_DEFECTO.map(claveNombreCliente);
const CLAVE_FINANCIERO = claveNombreCliente(CLIENTE_FINANCIERO);

const claveClienteRentabilidad = (doc: string, idCliente: number, nombre: string) => (doc ? `d:${doc}` : idCliente > 0 ? `i:${idCliente}` : `n:${nombre}`);
const empresaDe = (r: VentasSunatRegistroDto) => (r.empresa ?? "").trim() || SIN_EMPRESA;

function pick(row: RawRow, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v == null) continue;
    const t = String(v).trim();
    if (t) return t;
  }
  return "";
}

// yyyy-MM-dd[...] o dd/MM/yyyy -> yyyyMM ("" si no se reconoce).
function periodoDeFecha(valor: string): string {
  const iso = /^(\d{4})-(\d{2})-\d{2}/.exec(valor);
  if (iso) return `${iso[1]}${iso[2]}`;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(valor);
  if (dmy) return `${dmy[3]}${pad(Number(dmy[2]))}`;
  return "";
}

function monedaDe(row: RawRow): Moneda {
  const t = pick(row, ["Moneda", "moneda", "MonedaLabel", "monedaLabel", "TipoMoneda", "tipoMoneda", "MonedaDescripcion", "monedaDescripcion"])
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
  if (t === "2" || t.includes("USD") || t.includes("DOLAR")) return "USD";
  if (t === "3" || t.includes("EUR")) return "EUR";
  if (t === "4" || t.includes("DOP") || t.includes("DOMINICAN")) return "DOP";
  if (t === "5" || t.includes("COP") || t.includes("COLOMB")) return "COP";
  return "PEN";
}

// Gasto = Subtotal (sin IGV) en la moneda real del recibo. Pagados (estado 4) se ubican por fecha de depósito.
function normalizarGasto(row: RawRow): GastoBase | null {
  // El año/mes del gasto es siempre el de la fecha de depósito (sin respaldo en otras fechas).
  const periodo = periodoDeFecha(
    pick(row, ["FechaDeposito", "fechaDeposito", "fechadeposito", "FechaDepositoTexto", "fechaDepositoTexto", "FecDeposito", "fecDeposito"]),
  );
  if (!periodo) return null;
  // Subtotal (sin IGV) y Total a pagar (con IGV), ambos en la moneda real del recibo.
  const monto = numero(row.Subtotal ?? row.subtotal) || numero(row.TotalPagar ?? row.totalPagar) || numero(row.Total ?? row.total);
  const totalPagar = numero(row.TotalPagar ?? row.totalPagar) || numero(row.Total ?? row.total) || monto;
  return {
    periodo,
    monto,
    totalPagar,
    moneda: monedaDe(row),
    idCliente: numero(row.IdCliente ?? row.idCliente),
    cliente: pick(row, ["Cliente", "cliente", "NombreCliente", "nombreCliente", "clienteNombre"]) || "Sin cliente",
    n: 1,
  };
}

// Junta los gastos del mismo periodo, cliente y moneda: la pantalla solo necesita esos totales (menos memoria y caché más pequeña).
function agruparGastos(lista: GastoBase[]): GastoBase[] {
  const mapa = new Map<string, GastoBase>();
  for (const g of lista) {
    const clave = `${g.periodo}|${g.idCliente}|${g.cliente}|${g.moneda}`;
    const actual = mapa.get(clave);
    if (actual) {
      actual.monto += g.monto;
      actual.totalPagar += g.totalPagar;
      actual.n += g.n;
    } else {
      mapa.set(clave, { ...g });
    }
  }
  return Array.from(mapa.values());
}

// Una consulta por mes (evita topes de filas y timeouts del SP) con varios meses a la vez. Cada mes que llega se informa en
// `alLlegarMes` para que la pantalla se vaya llenando sin esperar al último.
async function consultarGastosAnio(anio: number, hastaMes: number, alLlegarMes?: (parcial: GastoBase[], hechos: number) => void) {
  const meses = Array.from({ length: hastaMes }, (_, i) => i + 1);
  let acumulado: GastoBase[] = [];
  let truncado = false;
  let sinFecha = 0;
  let hechos = 0;
  const cola = [...meses];
  const worker = async () => {
    while (cola.length) {
      const m = cola.shift() as number;
      const ultimo = new Date(anio, m, 0).getDate();
      const resp = await consultarPlanillaEstados(
        buildPlanillaPagadosDashboardRequest({ fechaInicio: `${anio}-${pad(m)}-01`, fechaFin: `${anio}-${pad(m)}-${pad(ultimo)}` }),
        { timeoutMs: REQUEST_TIMEOUT_MS },
      );
      if (resp.limitExceeded) truncado = true;
      const delMes: GastoBase[] = [];
      for (const row of Array.isArray(resp.rows) ? (resp.rows as RawRow[]) : []) {
        const g = normalizarGasto(row);
        if (g) delMes.push(g);
        else sinFecha += 1;
      }
      acumulado = agruparGastos([...acumulado, ...agruparGastos(delMes)]);
      hechos += 1;
      alLlegarMes?.(acumulado, hechos);
    }
  };
  await Promise.all(Array.from({ length: Math.min(GASTOS_CONCURRENCIA, Math.max(hastaMes, 1)) }, worker));
  return { gastos: acumulado, truncado, sinFecha };
}

const columnaMoneda = (dataField: keyof FilaCosto, caption: string): GridColumn<FilaCosto> => ({
  dataField,
  caption,
  dataType: "number",
  format: MONTO,
  alignment: "right",
  width: 150,
});

const columnasRentabilidad: GridColumn<FilaRentabilidad>[] = [
  { dataField: "nroDocumento", caption: "NRO DOCUMENTO (RUC/DNI)", width: 190 },
  { dataField: "nombreCliente", caption: "NOMBRE CLIENTE", minWidth: 280 },
  { dataField: "ventas", caption: "Ventas (S/)", dataType: "number", format: MONTO, alignment: "right", width: 160 },
  { dataField: "costos", caption: "Costos (S/)", dataType: "number", format: MONTO, alignment: "right", width: 160 },
  {
    dataField: "utilidad",
    caption: "Utilidad (S/)",
    dataType: "number",
    format: MONTO,
    alignment: "right",
    width: 160,
    cellStyle: (v) => ({ color: numero(v) < 0 ? "#B91C1C" : "#047857", fontWeight: 700 }),
  },
  {
    dataField: "margen",
    caption: "Margen %",
    dataType: "number",
    format: PORCENTAJE,
    alignment: "right",
    width: 120,
    cellStyle: (v) => (v == null ? undefined : { color: numero(v) < 0 ? "#B91C1C" : "#047857", fontWeight: 700 }),
  },
];

const summaryRentabilidad = {
  totalItems: [
    { column: "ventas", type: "sum" as const },
    { column: "costos", type: "sum" as const },
    { column: "utilidad", type: "sum" as const },
  ],
};

const columnasCostos: GridColumn<FilaCosto>[] = [
  { dataField: "nroDocumento", caption: "NRO DOCUMENTO (RUC/DNI)", width: 190 },
  { dataField: "nombreCliente", caption: "NOMBRE CLIENTE", minWidth: 280 },
  { dataField: "cantidad", caption: "N° gastos", dataType: "number", alignment: "right", width: 100 },
  columnaMoneda("PEN", "Soles (S/)"),
  columnaMoneda("USD", "Dólares (US$)"),
  columnaMoneda("EUR", "Euros (€)"),
  columnaMoneda("DOP", "Peso dominicano"),
  columnaMoneda("COP", "Peso colombiano"),
  { ...columnaMoneda("costo", "Total en soles (S/)"), width: 170 },
  { dataField: "participacion", caption: "Participación %", dataType: "number", format: PORCENTAJE, alignment: "right", width: 140 },
];

const summaryCostos = {
  totalItems: [
    { column: "cantidad", type: "sum" as const },
    { column: "PEN", type: "sum" as const },
    { column: "USD", type: "sum" as const },
    { column: "EUR", type: "sum" as const },
    { column: "DOP", type: "sum" as const },
    { column: "COP", type: "sum" as const },
    { column: "costo", type: "sum" as const },
  ],
};

const columnas: GridColumn<FilaMes>[] = [
  { dataField: "mes", caption: "MES", minWidth: 140 },
  { dataField: "ventas", caption: "Ventas", dataType: "number", format: MONTO, alignment: "right", width: 160 },
  { dataField: "gastos", caption: "Gastos pagados (S/)", dataType: "number", format: MONTO, alignment: "right", width: 170 },
  {
    dataField: "resultado",
    caption: "Ventas - Gastos",
    dataType: "number",
    format: MONTO,
    alignment: "right",
    width: 160,
    cellStyle: (v) => ({ color: numero(v) < 0 ? "#B91C1C" : "#047857", fontWeight: 700 }),
  },
  { dataField: "ratio", caption: "Gastos / Ventas %", dataType: "number", format: PORCENTAJE, alignment: "right", width: 150 },
  { dataField: "cantGastos", caption: "N° gastos", dataType: "number", alignment: "right", width: 100 },
];

const summary = {
  totalItems: [
    { column: "ventas", type: "sum" as const },
    { column: "gastos", type: "sum" as const },
    { column: "resultado", type: "sum" as const },
    { column: "cantGastos", type: "sum" as const },
  ],
};

export default function VentasGastosPage() {
  const anioActual = new Date().getFullYear();
  const [anio, setAnio] = useState(Math.min(Math.max(anioActual, ANIOS[0]), ANIOS[ANIOS.length - 1]));
  const [tcTexto, setTcTexto] = useState<Record<string, string>>({
    USD: String(TC_DEFECTO.USD),
    EUR: String(TC_DEFECTO.EUR),
    DOP: String(TC_DEFECTO.DOP),
    COP: String(TC_DEFECTO.COP),
  });
  const [periodos, setPeriodos] = useState<VentasSunatPeriodoDto[]>([]);
  const [ventas, setVentas] = useState<VentasSunatRegistroDto[]>([]);
  const [gastos, setGastos] = useState<GastoBase[]>([]);
  const [progresoGastos, setProgresoGastos] = useState<{ hechos: number; total: number } | null>(null);
  const [catalogo, setCatalogo] = useState<{ id: string; ruc: string; nombre: string }[]>([]);
  const [empresasElegidas, setEmpresasElegidas] = useState<string[]>(EMPRESAS_POR_DEFECTO); // vacio = todas
  const [cargandoVentas, setCargandoVentas] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  // Importe de ventas: con IGV (afecto + inafecto + IGV) o inafecto (solo afecto, por defecto).
  const [modoImporte, setModoImporte] = useState<"igv" | "inafecto">("inafecto");
  const incluirIgv = modoImporte === "igv";
  const importe = useMemo(
    () => ({ incluirIgv: modoImporte === "igv", incluirInafecto: modoImporte === "igv" }),
    [modoImporte],
  );
  const etiqueta = etiquetaImporte(importe);
  // Filtros cruzados de la pestaña Ventas: clic en una barra de mes o de cliente (otro clic la quita).
  const [moneda, setMoneda] = useState(""); // "" = todas; moneda del comprobante (los importes siempre están en soles)
  const [mesSel, setMesSel] = useState<string | null>(null);
  const [clienteSel, setClienteSel] = useState<string | null>(null);
  const [tab, setTab] = useState<"comparativo" | "ventas" | "costos" | "rentabilidad">("rentabilidad");
  // Filtro de rentabilidad por cliente: ambas (por defecto), solo positiva (utilidad > 0) o solo negativa (utilidad < 0).
  const [rentabilidadSel, setRentabilidadSel] = useState<string[]>([]); // vacío o ambas marcadas = ambos
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(true); // expande o contrae la cabecera de filtros para ganar espacio
  const [graficosExpandidos, setGraficosExpandidos] = useState(false); // al ampliar, los dos gráficos de Rentabilidad pasan a una sola columna: uno sobre otro, cada uno a todo el ancho
  const [clienteRentSel, setClienteRentSel] = useState<string | null>(null); // clave del cliente elegido en el gráfico de rentabilidad
  // Clientes desmarcados (claves normalizadas): los clientes nuevos entran marcados salvo los excluidos por defecto.
  const [clientesDesmarcados, setClientesDesmarcados] = useState<string[]>([]);
  const [excluirClientes, setExcluirClientes] = useState(true);
  const [sinFinanciero, setSinFinanciero] = useState(true);
  const [clienteCostoSel, setClienteCostoSel] = useState<string | null>(null); // clave del cliente elegido en el gráfico de costos
  const [clientes, setClientes] = useState<VentasSunatClienteDto[]>(cacheClientes ?? []);
  const [cargandoClientes, setCargandoClientes] = useState(false);

  // Clientes (NroDocumento + NombreCliente) para Costos y Rentabilidad; se piden una sola vez al entrar a la pantalla.
  const clientesPedidos = useRef(false);
  const cargarClientes = useCallback(() => {
    if (cacheClientes || clientesPedidos.current) return;
    clientesPedidos.current = true;
    setCargandoClientes(true);
    listarClientesVentasSunat()
      .then((lista) => {
        cacheClientes = lista;
        setClientes(lista);
      })
      .catch((err) => {
        clientesPedidos.current = false;
        setError(getHttpErrorMessage(err, "No se pudo cargar el listado de clientes."));
      })
      .finally(() => setCargandoClientes(false));
  }, []);

  const abrirTabConClientes = useCallback(
    (destino: "costos" | "rentabilidad") => {
      setTab(destino);
      cargarClientes();
    },
    [cargarClientes],
  );

  // Ventas del año: una sola llamada (sp_VentasSunat_ListarAnio) con caché; si el SP aún no existe en la BD,
  // se consulta periodo por periodo con pocas peticiones simultáneas (el servidor limita las peticiones).
  const cargarVentas = useCallback(async (anioSel: number, lista: VentasSunatPeriodoDto[], forzar: boolean) => {
    const enCache = cacheVentasAnio.get(anioSel);
    if (!forzar && enCache && Date.now() - enCache.t < VENTAS_CACHE_MS) {
      setVentas(enCache.registros);
      return;
    }
    setCargandoVentas(true);
    try {
      let registros: VentasSunatRegistroDto[];
      try {
        registros = await consultarAnioVentasSunat(anioSel);
      } catch {
        const pendientes = lista.filter((x) => x.periodo.startsWith(String(anioSel)));
        const partes: VentasSunatRegistroDto[][] = new Array(pendientes.length);
        let siguiente = 0;
        const worker = async () => {
          while (siguiente < pendientes.length) {
            const i = siguiente++;
            partes[i] = (await consultarPeriodoVentasSunat(pendientes[i].periodo, pendientes[i].rucEmisor)).registros;
          }
        };
        await Promise.all(Array.from({ length: Math.min(VENTAS_CONCURRENCIA, pendientes.length) }, worker));
        registros = partes.flat();
      }
      cacheVentasAnio.set(anioSel, { t: Date.now(), registros });
      setVentas(registros);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudieron cargar las ventas."));
    } finally {
      setCargandoVentas(false);
    }
  }, []);

  // Gastos pagados del año (se cargan al entrar a la pantalla y al cambiar de año; "Consultar" los vuelve a pedir).
  const solicitudGastos = useRef(0);
  const cargarGastos = useCallback(
    async (anioSel: number, forzar: boolean) => {
      const id = ++solicitudGastos.current;
      const aplicar = (r: { gastos: GastoBase[]; truncado: boolean; sinFecha: number }) => {
        setGastos(r.gastos);
        const avisos: string[] = [];
        if (r.truncado) avisos.push("Algún mes de gastos superó el límite de filas de la consulta: los totales pueden estar incompletos.");
        if (r.sinFecha > 0) avisos.push(`${r.sinFecha} gastos pagados no tienen fecha de depósito y no se incluyen.`);
        setAviso(avisos.join(" "));
      };

      // Caché en memoria y luego en el navegador: al volver a entrar a la pantalla los gastos aparecen al instante.
      if (!forzar) {
        const guardado = cacheGastos.get(anioSel) ?? leerCacheGastos(anioSel);
        if (guardado && Date.now() - guardado.t < ttlGastos(anioSel)) {
          cacheGastos.set(anioSel, guardado);
          setProgresoGastos(null);
          setCargando(false);
          aplicar(guardado);
          return;
        }
      }

      setCargando(true);
      setAviso("");
      // Año pasado: los 12 meses; año en curso: hasta el mes actual; año futuro: sin consulta de gastos.
      const hastaMes = anioSel < anioActual ? 12 : anioSel === anioActual ? new Date().getMonth() + 1 : 0;
      setProgresoGastos({ hechos: 0, total: hastaMes });
      try {
        const r = await consultarGastosAnio(anioSel, hastaMes, (parcial, hechos) => {
          if (id !== solicitudGastos.current) return;
          setGastos(parcial);
          setProgresoGastos({ hechos, total: hastaMes });
        });
        const entrada: GastosCargados = { t: Date.now(), ...r };
        cacheGastos.set(anioSel, entrada);
        guardarCacheGastos(anioSel, entrada);
        if (id === solicitudGastos.current) aplicar(r);
      } catch (err) {
        if (id === solicitudGastos.current) setError(getHttpErrorMessage(err, "No se pudieron cargar los gastos."));
      } finally {
        if (id === solicitudGastos.current) {
          setCargando(false);
          setProgresoGastos(null);
        }
      }
    },
    [anioActual],
  );

  // Periodos de ventas cargados (todos los RUC emisores).
  useEffect(() => {
    let activo = true;
    listarPeriodosVentasSunat()
      .then((lista) => {
        if (!activo) return;
        setPeriodos(lista);
        const inicial = Math.min(Math.max(anioActual, ANIOS[0]), ANIOS[ANIOS.length - 1]);
        setAnio(inicial);
        void cargarVentas(inicial, lista, false);
        void cargarGastos(inicial, false);
        cargarClientes();
      })
      .catch((err) => activo && setError(getHttpErrorMessage(err, "No se pudo listar los periodos de ventas.")));
    return () => {
      activo = false;
    };
  }, [anioActual, cargarVentas, cargarGastos, cargarClientes]);

  // Catálogo de empresas (Constante EMPRESA_cj; nombre en ValorIni). Se descartan las marcadas inactivas (ValorFin = 0).
  useEffect(() => {
    let activo = true;
    getConstantesPorCampo("EMPRESA_cj")
      .then((lista) => {
        if (!activo) return;
        const items = lista
          .filter((c) => String(c.valorFin ?? "").trim() !== "0")
          .map((c) => ({ id: String(c.correlativo ?? c.codigo ?? "").trim(), ruc: String(c.adicional ?? "").trim(), nombre: String(c.valorIni ?? "").trim() || String(c.descripcion ?? "").trim() }))
          .filter((c) => c.nombre);
        setCatalogo(items.sort((x, y) => x.nombre.localeCompare(y.nombre)));
      })
      .catch((err) => activo && setError(getHttpErrorMessage(err, "No se pudo cargar el listado de empresas.")));
    return () => {
      activo = false;
    };
  }, []);

  const cargar = useCallback(async () => {
    setError("");
    await Promise.all([cargarGastos(anio, true), cargarVentas(anio, periodos, false)]);
  }, [anio, periodos, cargarGastos, cargarVentas]);

  // Empresas activas del catálogo (+ "Sin empresa" si hay ventas sin empresa asignada).
  const empresas = useMemo(() => {
    const nombres = catalogo.map((c) => c.nombre);
    if (ventas.some((r) => !(r.empresa ?? "").trim() && r.idEmpresa == null)) nombres.push(SIN_EMPRESA);
    return Array.from(new Set(nombres));
  }, [catalogo, ventas]);
  const empresasSel = useMemo(() => empresasElegidas.filter((e) => empresas.includes(e)), [empresasElegidas, empresas]);

  // La venta pertenece a la empresa elegida por RUC emisor (Constante.Adicional), por IdEmpresa (Correlativo) o, si no, por nombre.
  const coincideEmpresa = useCallback(
    (r: VentasSunatRegistroDto) => {
      if (empresasSel.length === 0) return true;
      const elegidas = catalogo.filter((c) => empresasSel.includes(c.nombre));
      const ruc = (r.rucEmisor ?? "").trim();
      if (ruc && elegidas.some((c) => c.ruc && c.ruc === ruc)) return true;
      if (r.idEmpresa != null && elegidas.some((c) => c.id === String(r.idEmpresa))) return true;
      if (empresasSel.includes(empresaDe(r))) return true;
      // Último recurso: el nombre del catálogo y el de la venta difieren por sufijos ("MCJ PYDEX S.A.C" / "MCJ PYDEX", "CJ TELECOM" / "TELECOM").
      const nombreVenta = claveNombre(empresaDe(r));
      return nombreVenta.length > 0 && elegidas.some((c) => {
        const n = claveNombre(c.nombre);
        return n.length > 0 && (n.includes(nombreVenta) || nombreVenta.includes(n));
      });
    },
    [empresasSel, catalogo],
  );

  const clienteActivo = useCallback(
    (nombre: string) => {
      const k = claveNombreCliente(nombre);
      return !clientesDesmarcados.includes(k) && !(excluirClientes && CLAVES_EXCLUIDAS_DEFECTO.includes(k)) && !(sinFinanciero && k === CLAVE_FINANCIERO);
    },
    [clientesDesmarcados, excluirClientes, sinFinanciero],
  );
  // Nombre del cliente de un gasto: el de dbo.Cliente y, si falta, el que trae el recibo.
  const clientePorId = useMemo(() => new Map(clientes.map((c) => [c.idCliente, c])), [clientes]);
  const nombreClienteGasto = useCallback(
    (g: { idCliente: number; cliente: string }) => {
      const maestro = g.idCliente > 0 ? clientePorId.get(g.idCliente) : undefined;
      return (maestro?.nombreCliente ?? "").trim() || g.cliente;
    },
    [clientePorId],
  );

  const monedas = useMemo(() => Array.from(new Set(ventas.map((r) => (r.moneda ?? "").trim()).filter(Boolean))).sort(), [ventas]);
  // Filtros de cabecera aplicados a las ventas: empresa y moneda del comprobante.
  const coincideVenta = useCallback(
    (r: VentasSunatRegistroDto) => coincideEmpresa(r) && (!moneda || (r.moneda ?? "").trim() === moneda) && clienteActivo(clienteDeVenta(r)),
    [coincideEmpresa, moneda, clienteActivo],
  );
  const ventasFiltradas = useMemo(() => ventas.filter(coincideVenta), [ventas, coincideVenta]);

  const ventasParaMes = useMemo(() => (clienteSel ? ventasFiltradas.filter((r) => clienteDeVenta(r) === clienteSel) : ventasFiltradas), [ventasFiltradas, clienteSel]);
  const ventasParaCliente = useMemo(() => (mesSel ? ventasFiltradas.filter((r) => r.periodo === mesSel) : ventasFiltradas), [ventasFiltradas, mesSel]);
  const ventasDetalle = useMemo(
    () => ventasFiltradas.filter((r) => (!mesSel || r.periodo === mesSel) && (!clienteSel || clienteDeVenta(r) === clienteSel)),
    [ventasFiltradas, mesSel, clienteSel],
  );

  // KPIs de ventas: promedio sobre meses cerrados (el mes en curso va al corte) y proyección = promedio x 12.
  const kpisVentas = useMemo(() => {
    const hoy = new Date();
    const periodoActual = `${hoy.getFullYear()}${pad(hoy.getMonth() + 1)}`;
    const porPeriodo = new Map<string, number>();
    for (const r of ventasFiltradas) {
      const p = r.periodo ?? "";
      if (p.startsWith(String(anio))) porPeriodo.set(p, (porPeriodo.get(p) ?? 0) + importeVenta(r, importe));
    }
    const total = Array.from(porPeriodo.values()).reduce((a, b) => a + b, 0);
    const cerrados = Array.from(porPeriodo.entries()).filter(([p]) => p !== periodoActual).map(([, v]) => v);
    const promedio = cerrados.length ? cerrados.reduce((a, b) => a + b, 0) / cerrados.length : 0;
    return { total, promedio, proyeccion: promedio * 12, mesesCerrados: cerrados.length };
  }, [ventasFiltradas, anio, importe]);

  // Opciones del filtro de clientes: los del año en ventas (de las empresas/moneda elegidas) y en gastos.
  const opcionesClientes = useMemo(() => {
    const mapa = new Map<string, string>();
    const agregar = (n: string) => {
      const k = claveNombreCliente(n);
      if (k && !mapa.has(k)) mapa.set(k, n.trim());
    };
    for (const r of ventas) if ((r.periodo ?? "").startsWith(String(anio)) && coincideEmpresa(r)) agregar(clienteDeVenta(r));
    for (const g of gastos) if (g.periodo.startsWith(String(anio))) agregar(nombreClienteGasto(g));
    if (excluirClientes) for (const k of CLAVES_EXCLUIDAS_DEFECTO) mapa.delete(k);
    if (sinFinanciero) mapa.delete(CLAVE_FINANCIERO);
    return Array.from(mapa.values()).sort((a, b) => a.localeCompare(b));
  }, [ventas, gastos, anio, coincideEmpresa, nombreClienteGasto, excluirClientes, sinFinanciero]);
  const clientesMarcados = useMemo(() => opcionesClientes.filter(clienteActivo), [opcionesClientes, clienteActivo]);

  // Gastos para Costos y Rentabilidad: Inafecto usa el SUBTOTAL; Con IGV usa el TOTAL A PAGAR (monto original y en soles).
  // Empresa dueña de los gastos (EMPRESA_cj con Correlativo 1). Si el catálogo aún no cargó, no se anula nada.
  const empresaGastos = useMemo(() => catalogo.find((c) => c.id === ID_EMPRESA_GASTOS)?.nombre ?? null, [catalogo]);
  // Sin empresa elegida = todas (incluye la de los gastos). Con una selección, solo cuenta si incluye a la empresa de los gastos.
  const gastosAplican = empresaGastos == null || empresasSel.length === 0 || empresasSel.includes(empresaGastos);

  // Equivalente en soles con los tipos de cambio de la cabecera: cambiarlos recalcula al instante, sin consultar de nuevo.
  const gastosConv = useMemo<GastoNormalizado[]>(() => {
    if (!gastosAplican) return [];
    const tc: Record<string, number> = {};
    for (const k of Object.keys(TC_DEFECTO)) tc[k] = numero(tcTexto[k]) || TC_DEFECTO[k as keyof typeof TC_DEFECTO];
    return gastos.filter((g) => clienteActivo(nombreClienteGasto(g))).map((g) => {
      const factor = g.moneda === "PEN" ? 1 : (tc[g.moneda] ?? 1);
      return { ...g, montoPen: g.monto * factor, totalPagarPen: g.totalPagar * factor };
    });
  }, [gastos, tcTexto, gastosAplican, clienteActivo, nombreClienteGasto]);

  const gastosCosto = useMemo(
    () => (incluirIgv ? gastosConv.map((g) => ({ ...g, monto: g.totalPagar, montoPen: g.totalPagarPen })) : gastosConv),
    [gastosConv, incluirIgv],
  );

  // KPIs de costos (en soles): total del año, promedio de los meses cerrados (el mes en curso va al corte) y proyección = promedio x 12.
  const kpisCostos = useMemo(() => {
    const hoy = new Date();
    const periodoActual = `${hoy.getFullYear()}${pad(hoy.getMonth() + 1)}`;
    const porPeriodo = new Map<string, number>();
    for (const g of gastosCosto) {
      if (g.periodo.startsWith(String(anio))) porPeriodo.set(g.periodo, (porPeriodo.get(g.periodo) ?? 0) + g.montoPen);
    }
    const total = Array.from(porPeriodo.values()).reduce((a, b) => a + b, 0);
    const cerrados = Array.from(porPeriodo.entries()).filter(([p]) => p !== periodoActual).map(([, v]) => v);
    const promedio = cerrados.length ? cerrados.reduce((a, b) => a + b, 0) / cerrados.length : 0;
    return { total, promedio, proyeccion: promedio * 12, mesesCerrados: cerrados.length };
  }, [gastosCosto, anio]);

  // IdCliente -> nro de documento: el de dbo.Cliente y, si falta, el que traen las ventas del mismo cliente.
  const docPorCliente = useMemo(() => {
    const mapa = new Map<number, string>();
    for (const c of clientes) {
      const doc = normDoc(c.nroDocumento);
      if (doc) mapa.set(c.idCliente, doc);
    }
    for (const r of ventas) {
      const doc = normDoc(r.nroDocIdentidad);
      if (r.idCliente != null && doc && !mapa.has(r.idCliente)) mapa.set(r.idCliente, doc);
    }
    return mapa;
  }, [clientes, ventas]);

  // Rentabilidad por cliente = ventas (importe elegido) - costos (gastos pagados en soles), unidos por RUC/DNI y, si no hay, por IdCliente o nombre.
  const filasRentabilidad = useMemo<FilaRentabilidad[]>(() => {
    const porId = new Map(clientes.map((c) => [c.idCliente, c]));
    const mapa = new Map<string, FilaRentabilidad>();
    const fila = (doc: string, idCliente: number, nombre: string) => {
      const clave = claveClienteRentabilidad(doc, idCliente, nombre);
      let f = mapa.get(clave);
      if (!f) {
        f = { clave, nroDocumento: doc, nombreCliente: nombre, ventas: 0, costos: 0, utilidad: 0, margen: null };
        mapa.set(clave, f);
      }
      return f;
    };
    for (const r of ventasFiltradas) {
      if (!(r.periodo ?? "").startsWith(String(anio))) continue;
      const doc = normDoc(r.nroDocIdentidad) || (r.idCliente != null ? docPorCliente.get(r.idCliente) ?? "" : "");
      fila(doc, r.idCliente ?? 0, clienteDeVenta(r)).ventas += importeVenta(r, importe);
    }
    for (const g of gastosCosto) {
      if (!g.periodo.startsWith(String(anio))) continue;
      const maestro = g.idCliente > 0 ? porId.get(g.idCliente) : undefined;
      const doc = g.idCliente > 0 ? docPorCliente.get(g.idCliente) ?? "" : "";
      fila(doc, g.idCliente, (maestro?.nombreCliente ?? "").trim() || g.cliente).costos += g.montoPen;
    }
    return Array.from(mapa.values())
      .map((f) => ({ ...f, utilidad: f.ventas - f.costos, margen: f.ventas > 0 ? ((f.ventas - f.costos) / f.ventas) * 100 : null }))
      .sort((a, b) => b.ventas - a.ventas || b.costos - a.costos);
  }, [ventasFiltradas, gastosCosto, clientes, docPorCliente, anio, importe]);

  // Clientes que cumplen el filtro de rentabilidad (ambas / positiva / negativa) de la cabecera.
  const filasRentabilidadVista = useMemo(
    () => {
      const positiva = rentabilidadSel.includes("Positiva");
      const negativa = rentabilidadSel.includes("Negativa");
      if (positiva === negativa) return filasRentabilidad; // ninguna o ambas marcadas
      return filasRentabilidad.filter((f) => (positiva ? f.utilidad > 0 : f.utilidad < 0));
    },
    [filasRentabilidad, rentabilidadSel],
  );

  // Evolución mensual (ventas, costos) con la misma clave de cliente de la grilla; si hay un cliente elegido, solo ese.
  const datosMensualesRent = useMemo<RentabilidadMesDato[]>(() => {
    const visibles = new Set(filasRentabilidadVista.map((f) => f.clave));
    const porId = new Map(clientes.map((c) => [c.idCliente, c]));
    const mapa = new Map<string, RentabilidadMesDato>();
    const mes = (periodo: string) => {
      let m = mapa.get(periodo);
      if (!m) {
        m = { periodo, ventas: 0, costos: 0 };
        mapa.set(periodo, m);
      }
      return m;
    };
    for (const r of ventasFiltradas) {
      const periodo = r.periodo ?? "";
      if (!periodo.startsWith(String(anio))) continue;
      const doc = normDoc(r.nroDocIdentidad) || (r.idCliente != null ? docPorCliente.get(r.idCliente) ?? "" : "");
      const claveVenta = claveClienteRentabilidad(doc, r.idCliente ?? 0, clienteDeVenta(r));
      if (!visibles.has(claveVenta) || (clienteRentSel && claveVenta !== clienteRentSel)) continue;
      mes(periodo).ventas += importeVenta(r, importe);
    }
    for (const g of gastosCosto) {
      if (!g.periodo.startsWith(String(anio))) continue;
      const maestro = g.idCliente > 0 ? porId.get(g.idCliente) : undefined;
      const doc = g.idCliente > 0 ? docPorCliente.get(g.idCliente) ?? "" : "";
      const nombre = (maestro?.nombreCliente ?? "").trim() || g.cliente;
      const claveGastoCliente = claveClienteRentabilidad(doc, g.idCliente, nombre);
      if (!visibles.has(claveGastoCliente) || (clienteRentSel && claveGastoCliente !== clienteRentSel)) continue;
      mes(g.periodo).costos += g.montoPen;
    }
    return Array.from(mapa.values());
  }, [ventasFiltradas, gastosCosto, clientes, docPorCliente, anio, importe, clienteRentSel, filasRentabilidadVista]);

  const totalesRentabilidad = useMemo(() => {
    const ventasT = filasRentabilidadVista.reduce((s, f) => s + f.ventas, 0);
    const costosT = filasRentabilidadVista.reduce((s, f) => s + f.costos, 0);
    return { ventas: ventasT, costos: costosT, utilidad: ventasT - costosT, margen: ventasT > 0 ? ((ventasT - costosT) / ventasT) * 100 : null };
  }, [filasRentabilidadVista]);

  // Misma clave de cliente que usa filasCostos (IdCliente, o el nombre cuando el gasto no trae IdCliente).
  const claveGasto = useCallback(
    (g: GastoNormalizado) => {
      if (g.idCliente > 0) return String(g.idCliente);
      return `n:${g.cliente}`;
    },
    [],
  );
  const gastosParaMoneda = useMemo(
    () => (clienteCostoSel ? gastosCosto.filter((g) => claveGasto(g) === clienteCostoSel) : gastosCosto),
    [gastosCosto, clienteCostoSel, claveGasto],
  );

  // Costos = gastos pagados (soles) agrupados por cliente: NroDocumento (RUC/DNI) y NombreCliente de dbo.Cliente.
  const filasCostos = useMemo<FilaCosto[]>(() => {
    const porId = new Map(clientes.map((c) => [c.idCliente, c]));
    const conVentaDoc = new Set<string>();
    for (const r of ventas) {
      if (!(r.periodo ?? "").startsWith(String(anio))) continue;
      const doc = normDoc(r.nroDocIdentidad) || (r.idCliente != null ? docPorCliente.get(r.idCliente) ?? "" : "");
      if (doc) conVentaDoc.add(doc);
    }
    const mapa = new Map<string, FilaCosto>();
    for (const g of gastosCosto) {
      if (!g.periodo.startsWith(String(anio))) continue;
      const maestro = g.idCliente > 0 ? porId.get(g.idCliente) : undefined;
      const nombre = (maestro?.nombreCliente ?? "").trim() || g.cliente;
      const clave = g.idCliente > 0 ? String(g.idCliente) : `n:${nombre}`;
      const fila = mapa.get(clave) ?? { clave, nroDocumento: (maestro?.nroDocumento ?? "").trim() || (g.idCliente > 0 ? docPorCliente.get(g.idCliente) ?? "" : ""), nombreCliente: nombre, cantidad: 0, PEN: 0, USD: 0, EUR: 0, DOP: 0, COP: 0, costo: 0, participacion: 0, conVenta: false };
      fila.conVenta = fila.conVenta || (fila.nroDocumento !== "" && conVentaDoc.has(normDoc(fila.nroDocumento)));
      fila.cantidad += g.n;
      fila[g.moneda] += g.monto;
      fila.costo += g.montoPen;
      mapa.set(clave, fila);
    }
    const lista = Array.from(mapa.values());
    const total = lista.reduce((s, f) => s + f.costo, 0);
    return lista.map((f) => ({ ...f, participacion: total > 0 ? (f.costo / total) * 100 : 0 })).sort((a, b) => b.costo - a.costo);
  }, [gastosCosto, clientes, ventas, docPorCliente, anio]);

  const filas = useMemo<FilaMes[]>(() => {
    const mapa = new Map<string, FilaMes>();
    const fila = (periodo: string) => {
      let f = mapa.get(periodo);
      if (!f) {
        f = { periodo, mes: nombreMes(periodo), ventas: 0, gastos: 0, resultado: 0, ratio: null, cantGastos: 0 };
        mapa.set(periodo, f);
      }
      return f;
    };
    for (const r of ventas) {
      if (!coincideVenta(r)) continue;
      if (!r.periodo) continue;
      // Venta neta = BI gravada - dscto BI + inafecto (el SIRE ya viene en soles).
      fila(r.periodo).ventas += importeVenta(r, importe);
    }
    for (const g of gastosConv) {
      const f = fila(g.periodo);
      f.gastos += g.montoPen;
      f.cantGastos += g.n;
    }
    return Array.from(mapa.values())
      .filter((f) => f.periodo.startsWith(String(anio)))
      .map((f) => ({ ...f, resultado: f.ventas - f.gastos, ratio: f.ventas > 0 ? (f.gastos / f.ventas) * 100 : null }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));
  }, [ventas, gastosConv, coincideVenta, anio, importe]);

  const totales = useMemo(() => {
    const v = filas.reduce((s, f) => s + f.ventas, 0);
    const g = filas.reduce((s, f) => s + f.gastos, 0);
    return { ventas: v, gastos: g, resultado: v - g, ratio: v > 0 ? (g / v) * 100 : null };
  }, [filas]);

  // Exporta a PDF la pestaña activa con los filtros aplicados: KPIs, gráficos y tablas con los mismos datos que se ven en pantalla.
  const exportarPestanaPdf = async () => {
    setExportandoPdf(true);
    try {
      const soles = (v: number) => `S/ ${fmt(v)}`;
      const abrev = (v: number) => {
        const a = Math.abs(v);
        const t = a >= 1_000_000 ? `${(a / 1_000_000).toFixed(2)} MM` : a >= 1_000 ? `${(a / 1_000).toFixed(1)}k` : fmt(a);
        return `${v < 0 ? "-" : ""}S/ ${t}`;
      };
      const margenTxt = (m: number | null) => (m == null ? "-" : `${m.toFixed(1)}%`);
      const filtros: string[] = [
        `Año: ${anio}`,
        `Empresa: ${empresasSel.length ? empresasSel.join(", ") : "Todas"}`,
        `Clientes: ${clientesMarcados.length === opcionesClientes.length ? "Todos" : `${clientesMarcados.length} de ${opcionesClientes.length} (excluidos: ${opcionesClientes.filter((c) => !clienteActivo(c)).join(", ")})`}${excluirClientes ? `; sin ${CLIENTES_EXCLUIDOS_DEFECTO.join(", ")}` : ""}${sinFinanciero ? `; sin ${CLIENTE_FINANCIERO}` : ""}`,
        `Moneda del comprobante: ${moneda || "Todas"}`,
        `Importe de ventas: ${etiqueta}`,
      ];
      const nombreEn = (lista: { clave: string; nombreCliente: string }[], clave: string | null) => lista.find((f) => f.clave === clave)?.nombreCliente ?? clave ?? "";
      const tcTxt = `Tipos de cambio a S/: ${Object.keys(TC_DEFECTO).map((k) => `${k} ${tcTexto[k]}`).join(", ")}`;
      const secciones: PdfSeccion[] = [];
      let titulo = "Ventas vs Gastos";
      let kpis: { etiqueta: string; valor: string }[] = [];
      const notas: string[] = [];
      if ((tab === "rentabilidad" || tab === "costos") && !gastosAplican) notas.push(`Los gastos pertenecen a ${empresaGastos}: con la empresa elegida los costos son 0.`);
      const AZUL = "#2878D8";
      const NARANJA = "#EA6B33";
      const VERDE = "#1FA97A";
      const ROJO = "#D9534F";
      const GRIS_CLARO = "#C4C4B8";

      if (tab === "rentabilidad") {
        titulo = `Rentabilidad por cliente ${anio}`;
        filtros.push(`Rentabilidad: ${rentabilidadSel.length === 1 ? rentabilidadSel[0] : "Ambos"}`, tcTxt);
        if (clienteRentSel) filtros.push(`Cliente: ${nombreEn(filasRentabilidad, clienteRentSel)}`);
        kpis = [
          { etiqueta: `Ventas ${anio}`, valor: soles(totalesRentabilidad.ventas) },
          { etiqueta: `Costos ${anio}`, valor: soles(totalesRentabilidad.costos) },
          { etiqueta: "Utilidad", valor: soles(totalesRentabilidad.utilidad) },
          { etiqueta: "Margen", valor: margenTxt(totalesRentabilidad.margen) },
        ];
        const puntos = construirPuntosMensuales(anio, datosMensualesRent);
        secciones.push({
          tipo: "columnas",
          titulo: "Evolución mensual de la rentabilidad",
          subtitulo: `Ventas y costos por mes (S/) y margen % sobre ventas ${anio}${clienteRentSel ? ` - Cliente: ${nombreEn(filasRentabilidad, clienteRentSel)}` : ""}.`,
          categorias: puntos.map((p) => p.mes),
          series: [
            { nombre: "Ventas", color: AZUL, valores: puntos.map((p) => p.ventas) },
            { nombre: "Costos", color: NARANJA, valores: puntos.map((p) => p.costos) },
          ],
          linea: { nombre: "Margen %", color: VERDE, valores: puntos.map((p) => p.margen), formato: (v) => `${v.toFixed(0)}%` },
          formatoEje: abrev,
        });
        const barras = construirRentabilidadCliente(filasRentabilidadVista);
        secciones.push({
          tipo: "barrasH",
          nuevaPagina: true, // página 2: rentabilidad por cliente (gerencial)
          titulo: "Rentabilidad por cliente (gerencial)",
          subtitulo: `Utilidad ${anio} = ventas - costos, en soles, con el margen sobre ventas. Se muestran los ${barras.length} clientes de mayor impacto.`,
          leyenda: [
            { color: VERDE, texto: "Utilidad" },
            { color: ROJO, texto: "Pérdida" },
          ],
          items: barras.map((b) => ({
            etiqueta: b.nombreCliente,
            valor: b.utilidad,
            color: b.utilidad < 0 ? ROJO : VERDE,
            texto: `${abrev(b.utilidad)}${b.margen == null ? "" : ` | ${b.margen.toFixed(1)}%`}`,
            atenuar: clienteRentSel != null && clienteRentSel !== b.clave,
          })),
        });
        const filas = clienteRentSel ? filasRentabilidadVista.filter((f) => f.clave === clienteRentSel) : filasRentabilidadVista;
        const v = filas.reduce((a, f) => a + f.ventas, 0);
        const c = filas.reduce((a, f) => a + f.costos, 0);
        secciones.push({
          tipo: "tabla",
          nuevaPagina: true, // página 3: detalle de rentabilidad por cliente
          titulo: `Rentabilidad por cliente ${anio}`,
          columnas: ["Nro documento (RUC/DNI)", "Nombre cliente", "Ventas (S/)", "Costos (S/)", "Utilidad (S/)", "Margen %"],
          filas: filas.map((f) => [f.nroDocumento, f.nombreCliente, fmt(f.ventas), fmt(f.costos), fmt(f.utilidad), margenTxt(f.margen)]),
          totales: ["", "Total", fmt(v), fmt(c), fmt(v - c), margenTxt(v > 0 ? ((v - c) / v) * 100 : null)],
          numericas: [2, 3, 4, 5],
        });
      } else if (tab === "ventas") {
        titulo = `Ventas ${anio}`;
        if (mesSel) filtros.push(`Mes: ${nombreMes(mesSel)}`);
        if (clienteSel) filtros.push(`Cliente: ${clienteSel}`);
        kpis = [
          { etiqueta: `Total ventas ${anio}`, valor: soles(kpisVentas.total) },
          { etiqueta: `Promedio mensual (${kpisVentas.mesesCerrados} meses cerrados)`, valor: soles(kpisVentas.promedio) },
          { etiqueta: "Proyección anual", valor: soles(kpisVentas.proyeccion) },
        ];
        const porMes = construirVentasPorMes(anio, ventasParaMes, importe);
        secciones.push({
          tipo: "columnas",
          titulo: "Ventas por mes",
          subtitulo: `Ventas ${etiqueta} por mes. Línea punteada: promedio de los meses cerrados${porMes.mesParcial ? "; el mes en curso va al corte (color claro)" : ""}.`,
          categorias: porMes.barras.map((b) => b.mes),
          series: [{ nombre: "Ventas", color: AZUL, valores: porMes.barras.map((b) => b.monto) }],
          referencia: porMes.promedio > 0 ? { valor: porMes.promedio, texto: `Promedio ${abrev(porMes.promedio)}` } : undefined,
          formatoEje: abrev,
          atenuar: porMes.barras.map((b) => b.parcial || (mesSel != null && mesSel !== b.periodo)),
        });
        const conc = construirConcentracion(anio, ventasParaCliente, importe);
        secciones.push({
          tipo: "barrasH",
          titulo: "Concentración de la venta",
          subtitulo: `Participación de cada cliente en la venta del periodo (${anio}). Azul: los 3 principales.`,
          items: conc.map((b, i) => ({
            etiqueta: b.cliente,
            valor: b.venta,
            color: clienteSel ? (b.cliente === clienteSel ? AZUL : GRIS_CLARO) : i < 3 ? AZUL : GRIS_CLARO,
            texto: `${b.participacion.toFixed(1)}%`,
          })),
        });
        type Suma = { nombre: string; afecto: number; inafecto: number; igv: number; total: number };
        const agrupar = (clave: (r: VentasSunatRegistroDto) => string, nombre: (c: string) => string): [string, Suma][] => {
          const mapa = new Map<string, Suma>();
          for (const r of ventasDetalle) {
            const k = clave(r);
            const f = mapa.get(k) ?? { nombre: nombre(k), afecto: 0, inafecto: 0, igv: 0, total: 0 };
            f.afecto += afectoDe(r);
            f.inafecto += inafectoDe(r);
            f.igv += igvDe(r);
            f.total += numero(r.totalCp);
            mapa.set(k, f);
          }
          return Array.from(mapa.entries());
        };
        const tablaSumas = (tituloTabla: string, primera: string, entradas: [string, Suma][]): PdfTabla => {
          const t = entradas.reduce((a, [, f]) => ({ afecto: a.afecto + f.afecto, inafecto: a.inafecto + f.inafecto, igv: a.igv + f.igv, total: a.total + f.total }), { afecto: 0, inafecto: 0, igv: 0, total: 0 });
          return {
            tipo: "tabla",
            titulo: tituloTabla,
            columnas: [primera, "Suma de Afecto", "Suma de Inafecto", "Suma de IGV e IPM", "Suma de Total"],
            filas: entradas.map(([, f]) => [f.nombre, fmt(f.afecto), fmt(f.inafecto), fmt(f.igv), fmt(f.total)]),
            totales: ["Total", fmt(t.afecto), fmt(t.inafecto), fmt(t.igv), fmt(t.total)],
            numericas: [1, 2, 3, 4],
          };
        };
        secciones.push(
          tablaSumas("Ventas por periodo", "PERIODO", agrupar((r) => r.periodo ?? "", (c) => (c.length === 6 ? nombreMes(c) : c)).filter(([k]) => k).sort((a, b) => a[0].localeCompare(b[0]))),
          tablaSumas("Ventas por empresa", "EMPRESA", agrupar(empresaDe, (c) => c).sort((a, b) => b[1].total - a[1].total)),
          tablaSumas("Ventas por cliente", "CLIENTES", agrupar(clienteDeVenta, (c) => c).sort((a, b) => b[1].total - a[1].total)),
        );
      } else if (tab === "costos") {
        titulo = `Costos ${anio}`;
        filtros.push(`Costos según: ${incluirIgv ? "total a pagar (con IGV)" : "subtotal (sin IGV)"}`, tcTxt);
        if (clienteCostoSel) filtros.push(`Cliente (gasto por moneda): ${nombreEn(filasCostos, clienteCostoSel)}`);
        kpis = [
          { etiqueta: `Total costos ${anio} (S/)`, valor: soles(kpisCostos.total) },
          { etiqueta: `Promedio mensual (${kpisCostos.mesesCerrados} meses cerrados)`, valor: soles(kpisCostos.promedio) },
          { etiqueta: "Proyección anual", valor: soles(kpisCostos.proyeccion) },
        ];
        const barras = construirCostosCliente(filasCostos);
        secciones.push({
          tipo: "barrasH",
          titulo: "Gasto por RUC / cliente",
          subtitulo: `Gastos pagados ${anio} en soles convertidos. El color indica si el cliente tiene venta asociada.`,
          leyenda: [
            { color: AZUL, texto: "Cliente con venta" },
            { color: NARANJA, texto: "Sin venta asignada" },
          ],
          items: barras.map((b) => ({
            etiqueta: b.etiqueta,
            valor: b.costo,
            color: b.conVenta === null ? GRIS_CLARO : b.conVenta ? AZUL : NARANJA,
            texto: abrev(b.costo),
            atenuar: clienteCostoSel != null && clienteCostoSel !== b.clave,
          })),
        });
        const COLOR_MONEDA: Record<string, string> = { PEN: AZUL, USD: NARANJA, DOP: VERDE, EUR: "#8B5CF6", COP: "#CA8A04" };
        const SIMBOLO: Record<string, string> = { PEN: "S/", USD: "$", EUR: "EUR", DOP: "RD$", COP: "COL$" };
        const porMoneda = construirGastoPorMoneda(anio, gastosParaMoneda);
        secciones.push({
          tipo: "apilada",
          titulo: "Gasto por moneda",
          subtitulo: `Gastos pagados ${anio} por moneda del recibo, convertidos al tipo de cambio de la cabecera${clienteCostoSel ? ` - Cliente: ${nombreEn(filasCostos, clienteCostoSel)}` : ""}.`,
          segmentos: porMoneda.map((m) => ({ etiqueta: m.moneda, color: COLOR_MONEDA[m.moneda] ?? "#64748B", valor: m.soles })),
        });
        secciones.push({
          tipo: "tabla",
          titulo: "Detalle por moneda",
          columnas: ["Moneda", "Monto original", "En soles (S/)", "%"],
          filas: porMoneda.map((m) => [m.moneda, `${SIMBOLO[m.moneda] ?? m.moneda} ${fmt(m.original)}`, fmt(m.soles), `${m.porcentaje.toFixed(1)}%`]),
          numericas: [1, 2, 3],
        });
        const tot = (campo: "PEN" | "USD" | "EUR" | "DOP" | "COP" | "costo" | "cantidad") => filasCostos.reduce((a, f) => a + f[campo], 0);
        secciones.push({
          tipo: "tabla",
          titulo: `Costos por cliente ${anio}`,
          columnas: ["Nro documento (RUC/DNI)", "Nombre cliente", "N° gastos", "Soles (S/)", "Dólares (US$)", "Euros", "Peso dominicano", "Peso colombiano", "Total en soles (S/)", "Participación %"],
          filas: filasCostos.map((f) => [f.nroDocumento, f.nombreCliente, String(f.cantidad), fmt(f.PEN), fmt(f.USD), fmt(f.EUR), fmt(f.DOP), fmt(f.COP), fmt(f.costo), `${f.participacion.toFixed(1)}%`]),
          totales: ["", "Total", String(tot("cantidad")), fmt(tot("PEN")), fmt(tot("USD")), fmt(tot("EUR")), fmt(tot("DOP")), fmt(tot("COP")), fmt(tot("costo")), ""],
          numericas: [2, 3, 4, 5, 6, 7, 8, 9],
        });
      } else {
        return;
      }

      await exportarPdf({ archivo: `ventas-vs-gastos-${tab}-${anio}.pdf`, titulo, filtros, kpis, notas, secciones });
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo generar el PDF."));
    } finally {
      setExportandoPdf(false);
    }
  };

  const hayDatos = ventas.length > 0 || gastos.length > 0;

  return (
    <AppPage title="Ventas vs Gastos">
      <AppCard>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: filtrosAbiertos ? 12 : 0 }}>
          <button
            type="button"
            style={{ ...styles.chip, cursor: "pointer", background: "#fff", fontSize: 12 }}
            aria-expanded={filtrosAbiertos}
            onClick={() => setFiltrosAbiertos((v) => !v)}
          >
            {filtrosAbiertos ? "▲ Ocultar filtros" : "▼ Mostrar filtros"}
          </button>
          {filtrosAbiertos ? null : (
            <span style={{ fontSize: 12, color: "#475569" }}>
              Año {anio} · Empresa: {empresasSel.length ? empresasSel.join(", ") : "Todas"} · Clientes: {clientesMarcados.length}/{opcionesClientes.length} · Moneda: {moneda || "Todas"} · Importe: {incluirIgv ? "Con IGV" : "Inafecto"} · Rentabilidad:{" "}
              {rentabilidadSel.length === 1 ? rentabilidadSel[0] : "Ambos"}
            </span>
          )}
        </div>
        {filtrosAbiertos ? (
          <>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={styles.campo}>
            Año
            <select style={styles.select} value={anio} onChange={(e) => {
                const a = Number(e.target.value);
                setAnio(a);
                setGastos([]);
                void cargarGastos(a, false);
                setClienteCostoSel(null);
                setClienteRentSel(null);
                setMesSel(null);
                setClienteSel(null);
                void cargarVentas(a, periodos, false);
              }}>
              {ANIOS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <div style={styles.campo}>
            Empresa (ventas)
            <SelectorMultiple opciones={empresas} seleccion={empresasSel} onChange={(v) => {
                setEmpresasElegidas(v);
                setMesSel(null);
                setClienteSel(null);
              }}
              singular="empresa" plural="empresas" />
          </div>
          <div style={styles.campo}>
            <span style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              Clientes
              <label style={{ display: "flex", gap: 4, alignItems: "center", cursor: "pointer", fontWeight: 500, fontSize: 12 }} title={CLIENTES_EXCLUIDOS_DEFECTO.join(", ")}>
                <input
                  type="checkbox"
                  checked={excluirClientes}
                  onChange={(e) => {
                    setExcluirClientes(e.target.checked);
                    setMesSel(null);
                    setClienteSel(null);
                    setClienteCostoSel(null);
                    setClienteRentSel(null);
                  }}
                />
                Quitar
              </label>
              <label style={{ display: "flex", gap: 4, alignItems: "center", cursor: "pointer", fontWeight: 500, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={sinFinanciero}
                  onChange={(e) => {
                    setSinFinanciero(e.target.checked);
                    setMesSel(null);
                    setClienteSel(null);
                    setClienteCostoSel(null);
                    setClienteRentSel(null);
                  }}
                />
                SIN FINANCIERO
              </label>
            </span>
            <SelectorMultiple
              opciones={opcionesClientes}
              seleccion={clientesMarcados}
              onChange={(v) => {
                const marcados = new Set(v.map(claveNombreCliente));
                const visibles = new Set(opcionesClientes.map(claveNombreCliente));
                setClientesDesmarcados((prev) => [...prev.filter((k) => !visibles.has(k)), ...Array.from(visibles).filter((k) => !marcados.has(k))]);
                setMesSel(null);
                setClienteSel(null);
                setClienteCostoSel(null);
                setClienteRentSel(null);
              }}
              singular="cliente"
              plural="clientes"
              textoTodos="Ningún cliente"
            />
          </div>
          <label style={styles.campo}>
            Moneda del comprobante
            <select style={styles.select} value={moneda} onChange={(e) => setMoneda(e.target.value)}>
              <option value="">Todas</option>
              {monedas.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <div style={styles.campo}>
            Importe de ventas
            <div style={{ display: "flex", gap: 14, alignItems: "center", height: 34, fontWeight: 500 }}>
              {([
                ["igv", "Con IGV"],
                ["inafecto", "Inafecto"],
              ] as const).map(([valor, texto]) => (
                <label key={valor} style={{ display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}>
                  <input type="radio" name="importeVentas" checked={modoImporte === valor} onChange={() => setModoImporte(valor)} /> {texto}
                </label>
              ))}
            </div>
          </div>
          <div style={styles.campo}>
            Rentabilidad
            <SelectorMultiple
              opciones={["Positiva", "Negativa"]}
              seleccion={rentabilidadSel}
              onChange={(v) => {
                setRentabilidadSel(v);
                setClienteRentSel(null);
              }}
              singular="rentabilidad"
              plural="rentabilidades"
              textoTodos="Ambos"
            />
          </div>
          {Object.keys(TC_DEFECTO).map((k) => (
            <label key={k} style={styles.campo}>
              TC {k} → S/
              <input
                style={styles.input}
                inputMode="decimal"
                value={tcTexto[k]}
                onChange={(e) => setTcTexto((prev) => ({ ...prev, [k]: e.target.value }))}
              />
            </label>
          ))}
          <button type="button" style={{ ...styles.boton, opacity: cargando ? 0.6 : 1 }} disabled={cargando} onClick={() => void cargar()}>
            {cargando ? (progresoGastos && progresoGastos.total > 0 ? `Cargando gastos ${progresoGastos.hechos}/${progresoGastos.total}...` : "Cargando...") : "Consultar"}
          </button>
        </div>
        <div style={{ fontSize: 12, color: "#64748B", marginTop: 10 }}>
          Ventas: Registro de Ventas SIRE, importe {etiqueta}, ya en soles. Gastos: recibos pagados (estado 4) por fecha de depósito, subtotal sin IGV,
          convertido a soles con los tipos de cambio de esta pantalla solo para la comparación.
        </div>
          </>
        ) : null}
      </AppCard>

      {error ? <AppStatusMessage tone="error">{error}</AppStatusMessage> : null}
      {aviso ? <AppStatusMessage tone="info">{aviso}</AppStatusMessage> : null}

      <div style={tabsStyle}>
        {/* Pestaña "Ventas vs Gastos" oculta por ahora: su contenido y cálculos se conservan (tab "comparativo"). */}
        <button type="button" style={tab === "rentabilidad" ? tabActiveStyle : tabStyle} onClick={() => abrirTabConClientes("rentabilidad")}>
          Rentabilidad
        </button>
        <button type="button" style={tab === "ventas" ? tabActiveStyle : tabStyle} onClick={() => setTab("ventas")}>
          Ventas
        </button>
        <button type="button" style={tab === "costos" ? tabActiveStyle : tabStyle} onClick={() => abrirTabConClientes("costos")}>
          Costos
        </button>
        <button
          type="button"
          style={{ ...styles.boton, marginLeft: "auto", alignSelf: "center", opacity: exportandoPdf ? 0.6 : 1 }}
          disabled={exportandoPdf || tab === "comparativo"}
          onClick={() => void exportarPestanaPdf()}
        >
          {exportandoPdf ? "Generando PDF..." : "Exportar PDF"}
        </button>
      </div>

      <div>
      {tab === "ventas" ? (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <div style={styles.tarjeta}>
              <div style={styles.kpiLabel}>Total ventas {anio}</div>
              <div style={styles.kpiValor}>S/ {fmt(kpisVentas.total)}</div>
            </div>
            <div style={styles.tarjeta}>
              <div style={styles.kpiLabel}>Promedio mensual</div>
              <div style={styles.kpiValor}>S/ {fmt(kpisVentas.promedio)}</div>
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{kpisVentas.mesesCerrados} meses cerrados</div>
            </div>
            <div style={styles.tarjeta}>
              <div style={styles.kpiLabel}>Proyección anual</div>
              <div style={styles.kpiValor}>S/ {fmt(kpisVentas.proyeccion)}</div>
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Promedio mensual x 12</div>
            </div>
          </div>
          {mesSel || clienteSel ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12, color: "#334155" }}>
              <strong>Filtrado por:</strong>
              {mesSel ? <span style={styles.chip}>Mes: {nombreMes(mesSel)}</span> : null}
              {clienteSel ? <span style={styles.chip}>Cliente: {clienteSel}</span> : null}
              <button
                type="button"
                style={{ ...styles.chip, cursor: "pointer", background: "#fff" }}
                onClick={() => {
                  setMesSel(null);
                  setClienteSel(null);
                }}
              >
                Quitar filtros
              </button>
            </div>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(480px, 1fr))", gap: 16, alignItems: "start" }}>
            <VentasPorMesChart anio={anio} registros={ventasParaMes} importe={importe} etiqueta={etiqueta} seleccionado={mesSel} onSeleccionar={setMesSel} />
            <VentasConcentracionChart anio={anio} registros={ventasParaCliente} importe={importe} seleccionado={clienteSel} onSeleccionar={setClienteSel} />
          </div>
        <VentasSunatResumen
          periodos={periodos}
          coincideEmpresa={coincideVenta}
          registros={ventasDetalle}
          cargandoExterno={cargandoVentas}
        />
        </div>
      ) : null}

      {(tab === "rentabilidad" || tab === "costos") && !gastosAplican ? (
        <AppStatusMessage tone="info">
          Los gastos pertenecen a {empresaGastos}. Con la empresa elegida ({empresasSel.join(", ")}) los costos son 0.
        </AppStatusMessage>
      ) : null}

      {tab === "rentabilidad" ? (
        <div style={{ display: "grid", gap: 16 }}>
          {gastos.length === 0 && !cargando ? (
            <div style={{ ...styles.tarjeta, color: "#64748B", fontSize: 13 }}>Pulse «Consultar» para cargar los costos (gastos pagados); mientras tanto solo se ven las ventas.</div>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <div style={styles.tarjeta}>
              <div style={styles.kpiLabel}>Ventas {anio}</div>
              <div style={styles.kpiValor}>S/ {fmt(totalesRentabilidad.ventas)}</div>
            </div>
            <div style={styles.tarjeta}>
              <div style={styles.kpiLabel}>Costos {anio}</div>
              <div style={styles.kpiValor}>S/ {fmt(totalesRentabilidad.costos)}</div>
            </div>
            <div style={styles.tarjeta}>
              <div style={styles.kpiLabel}>Utilidad</div>
              <div style={{ ...styles.kpiValor, color: totalesRentabilidad.utilidad < 0 ? "#B91C1C" : "#047857" }}>S/ {fmt(totalesRentabilidad.utilidad)}</div>
            </div>
            <div style={styles.tarjeta}>
              <div style={styles.kpiLabel}>Margen</div>
              <div style={styles.kpiValor}>{totalesRentabilidad.margen == null ? "-" : `${totalesRentabilidad.margen.toFixed(1)}%`}</div>
            </div>
          </div>
          {clienteRentSel ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12, color: "#334155" }}>
              <strong>Filtrado por:</strong>
              <span style={styles.chip}>Cliente: {filasRentabilidad.find((f) => f.clave === clienteRentSel)?.nombreCliente ?? clienteRentSel}</span>
              <button type="button" style={{ ...styles.chip, cursor: "pointer", background: "#fff" }} onClick={() => setClienteRentSel(null)}>
                Quitar filtro
              </button>
            </div>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: graficosExpandidos ? "1fr" : "repeat(auto-fit, minmax(480px, 1fr))", gap: 16, alignItems: "start" }}>
            <div>
              <RentabilidadMensualChart
                anio={anio}
                datos={datosMensualesRent}
                cliente={clienteRentSel ? filasRentabilidad.find((f) => f.clave === clienteRentSel)?.nombreCliente : null}
                expandido={graficosExpandidos}
                onAlternarExpandir={() => setGraficosExpandidos((v) => !v)}
              />
            </div>
            <div>
              <RentabilidadClienteChart
                anio={anio}
                filas={filasRentabilidadVista}
                seleccionado={clienteRentSel}
                onSeleccionar={setClienteRentSel}
                expandido={graficosExpandidos}
                onAlternarExpandir={() => setGraficosExpandidos((v) => !v)}
              />
            </div>
          </div>
          <div style={styles.tarjeta}>
            <h3 style={styles.titulo}>Rentabilidad por cliente {anio}</h3>
            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>
              Ventas ({etiqueta}, con los filtros de empresa y moneda de la cabecera) menos costos (gastos pagados en soles, sin filtro de empresa; Inafecto usa el subtotal y Con IGV el total a pagar). Se unen por RUC/DNI del cliente.
              Margen = utilidad / ventas.
            </div>
            <DataGridPro<FilaRentabilidad>
              dataSource={clienteRentSel ? filasRentabilidadVista.filter((f) => f.clave === clienteRentSel) : filasRentabilidadVista}
              columns={columnasRentabilidad}
              keyExpr="clave"
              height="65vh"
              loading={cargando || cargandoClientes || cargandoVentas}
              noDataText="Sin datos."
              stateStoringKey="ventasgastos_rentabilidad"
              showSearchPanel
              exportFileName="rentabilidad_por_cliente"
              paging={{ pageSize: 100, pageSizes: [50, 100, 250, 500] }}
              summary={summaryRentabilidad}
            />
          </div>
        </div>
      ) : null}

      {tab === "costos" ? (
        gastos.length === 0 && !cargando ? (
          <div style={{ ...styles.tarjeta, color: "#64748B", fontSize: 13 }}>Elija el año y pulse «Consultar» para cargar los costos (gastos pagados).</div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <div style={styles.tarjeta}>
              <div style={styles.kpiLabel}>Total costos {anio} (S/)</div>
              <div style={styles.kpiValor}>S/ {fmt(kpisCostos.total)}</div>
            </div>
            <div style={styles.tarjeta}>
              <div style={styles.kpiLabel}>Promedio mensual</div>
              <div style={styles.kpiValor}>S/ {fmt(kpisCostos.promedio)}</div>
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{kpisCostos.mesesCerrados} meses cerrados</div>
            </div>
            <div style={styles.tarjeta}>
              <div style={styles.kpiLabel}>Proyección anual</div>
              <div style={styles.kpiValor}>S/ {fmt(kpisCostos.proyeccion)}</div>
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Promedio mensual x 12</div>
            </div>
          </div>
          {clienteCostoSel ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12, color: "#334155" }}>
              <strong>Filtrado por:</strong>
              <span style={styles.chip}>
                Cliente: {filasCostos.find((f) => f.clave === clienteCostoSel)?.nombreCliente ?? clienteCostoSel}
              </span>
              <button type="button" style={{ ...styles.chip, cursor: "pointer", background: "#fff" }} onClick={() => setClienteCostoSel(null)}>
                Quitar filtro
              </button>
            </div>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(480px, 1fr))", gap: 16, alignItems: "start" }}>
            <CostosPorClienteChart anio={anio} filas={filasCostos} seleccionado={clienteCostoSel} onSeleccionar={setClienteCostoSel} />
            <CostosPorMoneda anio={anio} gastos={gastosParaMoneda} />
          </div>
          <div style={styles.tarjeta}>
            <h3 style={styles.titulo}>Costos por cliente {anio}</h3>
            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>
              Gastos pagados (estado 4, {incluirIgv ? "total a pagar, con IGV" : "subtotal, sin IGV"}) por fecha de depósito, agrupados por cliente. Una columna por moneda con el monto real del recibo (sin convertir) y un total en soles con los tipos de cambio de la cabecera. No dependen del filtro de empresa.
            </div>
            <DataGridPro<FilaCosto>
              dataSource={filasCostos}
              columns={columnasCostos}
              keyExpr="clave"
              height="65vh"
              loading={cargando || cargandoClientes}
              noDataText="Sin datos."
              stateStoringKey="ventasgastos_costos"
              showSearchPanel
              exportFileName="costos_por_cliente"
              paging={{ pageSize: 100, pageSizes: [50, 100, 250, 500] }}
              summary={summaryCostos}
            />
          </div>
          </div>
        )
      ) : null}

      </div>

      {tab === "comparativo" ? (
      <div style={{ display: "grid", gap: 16 }}>
      {!hayDatos && !cargando ? (
        <div style={{ ...styles.tarjeta, color: "#64748B", fontSize: 13 }}>Elija el año y pulse «Consultar».</div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <div style={styles.tarjeta}>
              <div style={styles.kpiLabel}>Ventas {incluirIgv ? "(con IGV)" : "(inafecto)"}</div>
              <div style={styles.kpiValor}>S/ {fmt(totales.ventas)}</div>
            </div>
            <div style={styles.tarjeta}>
              <div style={styles.kpiLabel}>Gastos pagados</div>
              <div style={styles.kpiValor}>S/ {fmt(totales.gastos)}</div>
            </div>
            <div style={styles.tarjeta}>
              <div style={styles.kpiLabel}>Ventas - Gastos</div>
              <div style={{ ...styles.kpiValor, color: totales.resultado < 0 ? "#B91C1C" : "#047857" }}>S/ {fmt(totales.resultado)}</div>
            </div>
            <div style={styles.tarjeta}>
              <div style={styles.kpiLabel}>Gastos / Ventas</div>
              <div style={styles.kpiValor}>{totales.ratio == null ? "-" : `${totales.ratio.toFixed(1)}%`}</div>
            </div>
          </div>

          <div style={styles.tarjeta}>
            <h3 style={styles.titulo}>Ventas vs gastos por mes</h3>
            <div style={{ width: "100%", height: 340 }}>
              <ResponsiveContainer>
                <ComposedChart data={filas.map((f) => ({ ...f, mes: nombreMes(f.periodo).slice(0, 3) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="mes" />
                  <YAxis tickFormatter={(v: number) => `${(v / 1000).toLocaleString("es-PE")}k`} />
                  <Tooltip formatter={(v) => `S/ ${fmt(numero(v))}`} />
                  <Legend />
                  <Bar dataKey="ventas" name="Ventas" fill="#2563EB" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="gastos" name="Gastos" fill="#F97316" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="resultado" name="Ventas - Gastos" stroke="#14B8A6" strokeWidth={2} dot />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={styles.tarjeta}>
            <h3 style={styles.titulo}>Detalle mensual</h3>
            <DataGridPro<FilaMes>
              dataSource={filas}
              columns={columnas}
              keyExpr="periodo"
              height={Math.min(160 + filas.length * 34, 520)}
              loading={cargando}
              noDataText="Sin datos."
              stateStoringKey="ventasgastos_mensual"
              exportFileName="ventas_vs_gastos"
              paging={false}
              summary={summary}
            />
          </div>
        </div>
      )}
      </div>
      ) : null}
    </AppPage>
  );
}
