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
  consultarPeriodoVentasSunat,
  listarPeriodosVentasSunat,
  type VentasSunatPeriodoDto,
  type VentasSunatRegistroDto,
} from "../../../api/ventasSunatService";
import SelectorMultiple from "./VentasSunatSelectorMultiple";
import VentasSunatResumen from "./VentasSunatResumen";
import VentasPorMesChart from "./VentasPorMesChart";
import { clienteDeVenta, etiquetaImporte, importeVenta } from "./ventasImporte";
import VentasConcentracionChart from "./VentasConcentracionChart";
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

type GastoNormalizado = { periodo: string; monto: number; montoPen: number };

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
const EMPRESAS_POR_DEFECTO = ["CJ TELECOM"];
const SIN_EMPRESA = "Sin empresa";
const REQUEST_TIMEOUT_MS = 120000;
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
function normalizarGasto(row: RawRow, tc: Record<string, number>): GastoNormalizado | null {
  const periodo = periodoDeFecha(
    pick(row, ["FechaDeposito", "fechaDeposito", "fechadeposito", "FechaDepositoTexto", "FecDeposito", "fecDeposito"]) ||
      pick(row, ["FecIngreso", "fecIngreso", "FechaIngreso", "fechaIngreso"]),
  );
  if (!periodo) return null;
  const monto = numero(row.Subtotal ?? row.subtotal) || numero(row.TotalPagar ?? row.totalPagar) || numero(row.Total ?? row.total);
  const moneda = monedaDe(row);
  return { periodo, monto, montoPen: moneda === "PEN" ? monto : monto * (tc[moneda] ?? 1) };
}

// Una consulta por mes: evita topes de filas/timeouts del SP en rangos largos.
async function consultarGastosAnio(anio: number, tc: Record<string, number>, hastaMes: number) {
  const meses = Array.from({ length: hastaMes }, (_, i) => i + 1);
  const resultados: GastoNormalizado[] = [];
  let truncado = false;
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
      for (const row of Array.isArray(resp.rows) ? (resp.rows as RawRow[]) : []) {
        const g = normalizarGasto(row, tc);
        if (g) resultados.push(g);
      }
    }
  };
  await Promise.all([worker(), worker()]);
  return { gastos: resultados, truncado };
}

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
  const [anio, setAnio] = useState(anioActual);
  const [aniosConVentas, setAniosConVentas] = useState<number[]>([]);
  const [tcTexto, setTcTexto] = useState<Record<string, string>>({
    USD: String(TC_DEFECTO.USD),
    EUR: String(TC_DEFECTO.EUR),
    DOP: String(TC_DEFECTO.DOP),
    COP: String(TC_DEFECTO.COP),
  });
  const [periodos, setPeriodos] = useState<VentasSunatPeriodoDto[]>([]);
  const [ventas, setVentas] = useState<VentasSunatRegistroDto[]>([]);
  const [gastos, setGastos] = useState<GastoNormalizado[]>([]);
  const [catalogo, setCatalogo] = useState<{ id: string; ruc: string; nombre: string }[]>([]);
  const [empresasElegidas, setEmpresasElegidas] = useState<string[]>(EMPRESAS_POR_DEFECTO); // vacio = todas
  const [cargandoVentas, setCargandoVentas] = useState(false);
  const cacheVentas = useRef(new Map<string, VentasSunatRegistroDto[]>());
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  // Importe de ventas: una sola opción a la vez (por defecto sin IGV = solo afecto).
  const [modoImporte, setModoImporte] = useState<"sin" | "igv" | "inafecto">("sin");
  const incluirIgv = modoImporte === "igv";
  const importe = useMemo(() => ({ incluirIgv: modoImporte === "igv", incluirInafecto: modoImporte === "inafecto" }), [modoImporte]);
  const etiqueta = etiquetaImporte(importe);
  // Filtros cruzados de la pestaña Ventas: clic en una barra de mes o de cliente (otro clic la quita).
  const [mesSel, setMesSel] = useState<string | null>(null);
  const [clienteSel, setClienteSel] = useState<string | null>(null);
  const [tab, setTab] = useState<"comparativo" | "ventas">("comparativo");

  // Ventas del año (una consulta por periodo y RUC, con caché para no repetirlas: el servidor limita las peticiones).
  const cargarVentas = useCallback(async (anioSel: number, lista: VentasSunatPeriodoDto[], forzar: boolean) => {
    setCargandoVentas(true);
    try {
      const out: VentasSunatRegistroDto[] = [];
      for (const p of lista.filter((x) => x.periodo.startsWith(String(anioSel)))) {
        const clave = `${p.periodo}|${p.rucEmisor}`;
        let regs = forzar ? undefined : cacheVentas.current.get(clave);
        if (!regs) {
          regs = (await consultarPeriodoVentasSunat(p.periodo, p.rucEmisor)).registros;
          cacheVentas.current.set(clave, regs);
        }
        out.push(...regs);
      }
      setVentas(out);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudieron cargar las ventas."));
    } finally {
      setCargandoVentas(false);
    }
  }, []);

  // Periodos de ventas cargados (todos los RUC emisores).
  useEffect(() => {
    let activo = true;
    listarPeriodosVentasSunat()
      .then((lista) => {
        if (!activo) return;
        setPeriodos(lista);
        const anios = Array.from(new Set(lista.map((p) => Number(p.periodo.slice(0, 4))).filter(Boolean))).sort((a, b) => b - a);
        setAniosConVentas(anios);
        const inicial = anios.length && !anios.includes(anioActual) ? anios[0] : anioActual;
        setAnio(inicial);
        void cargarVentas(inicial, lista, false);
      })
      .catch((err) => activo && setError(getHttpErrorMessage(err, "No se pudo listar los periodos de ventas.")));
    return () => {
      activo = false;
    };
  }, [anioActual, cargarVentas]);

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
    setCargando(true);
    setError("");
    setAviso("");
    try {
      const tc: Record<string, number> = {};
      for (const k of Object.keys(TC_DEFECTO)) tc[k] = numero(tcTexto[k]) || TC_DEFECTO[k as keyof typeof TC_DEFECTO];

      const hastaMes = anio === anioActual ? new Date().getMonth() + 1 : 12;
      const [gastosAnio] = await Promise.all([consultarGastosAnio(anio, tc, hastaMes), cargarVentas(anio, periodos, true)]);

      setGastos(gastosAnio.gastos);
      if (gastosAnio.truncado) setAviso("Algún mes de gastos superó el límite de filas de la consulta: los totales pueden estar incompletos.");
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo cargar ventas vs gastos."));
    } finally {
      setCargando(false);
    }
  }, [anio, anioActual, periodos, tcTexto, cargarVentas]);

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

  const ventasFiltradas = useMemo(() => ventas.filter(coincideEmpresa), [ventas, coincideEmpresa]);

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
      if (!coincideEmpresa(r)) continue;
      if (!r.periodo) continue;
      // Venta neta = BI gravada - dscto BI + inafecto (el SIRE ya viene en soles).
      fila(r.periodo).ventas += importeVenta(r, importe);
    }
    for (const g of gastos) {
      const f = fila(g.periodo);
      f.gastos += g.montoPen;
      f.cantGastos += 1;
    }
    return Array.from(mapa.values())
      .filter((f) => f.periodo.startsWith(String(anio)))
      .map((f) => ({ ...f, resultado: f.ventas - f.gastos, ratio: f.ventas > 0 ? (f.gastos / f.ventas) * 100 : null }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));
  }, [ventas, gastos, coincideEmpresa, anio, importe]);

  const totales = useMemo(() => {
    const v = filas.reduce((s, f) => s + f.ventas, 0);
    const g = filas.reduce((s, f) => s + f.gastos, 0);
    return { ventas: v, gastos: g, resultado: v - g, ratio: v > 0 ? (g / v) * 100 : null };
  }, [filas]);

  const hayDatos = ventas.length > 0 || gastos.length > 0;
  const anios = aniosConVentas.includes(anio) ? aniosConVentas : [anio, ...aniosConVentas].sort((a, b) => b - a);

  return (
    <AppPage title="Ventas vs Gastos">
      <AppCard>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={styles.campo}>
            Año
            <select style={styles.select} value={anio} onChange={(e) => {
                const a = Number(e.target.value);
                setAnio(a);
                setMesSel(null);
                setClienteSel(null);
                void cargarVentas(a, periodos, false);
              }}>
              {anios.map((a) => (
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
            Importe de ventas
            <div style={{ display: "flex", gap: 14, alignItems: "center", height: 34, fontWeight: 500 }}>
              {([
                ["sin", "Sin IGV"],
                ["igv", "Con IGV"],
                ["inafecto", "Con inafecto"],
              ] as const).map(([valor, texto]) => (
                <label key={valor} style={{ display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}>
                  <input type="radio" name="importeVentas" checked={modoImporte === valor} onChange={() => setModoImporte(valor)} /> {texto}
                </label>
              ))}
            </div>
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
            {cargando ? "Cargando..." : "Consultar"}
          </button>
        </div>
        <div style={{ fontSize: 12, color: "#64748B", marginTop: 10 }}>
          Ventas: Registro de Ventas SIRE, importe {etiqueta}, ya en soles. Gastos: recibos pagados (estado 4) por fecha de depósito, subtotal sin IGV,
          convertido a soles con los tipos de cambio de esta pantalla solo para la comparación.
        </div>
      </AppCard>

      {error ? <AppStatusMessage tone="error">{error}</AppStatusMessage> : null}
      {aviso ? <AppStatusMessage tone="info">{aviso}</AppStatusMessage> : null}

      <div style={tabsStyle}>
        <button type="button" style={tab === "comparativo" ? tabActiveStyle : tabStyle} onClick={() => setTab("comparativo")}>
          Ventas vs Gastos
        </button>
        <button type="button" style={tab === "ventas" ? tabActiveStyle : tabStyle} onClick={() => setTab("ventas")}>
          Ventas
        </button>
      </div>

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
          coincideEmpresa={coincideEmpresa}
          registros={ventasDetalle}
          cargandoExterno={cargandoVentas}
        />
        </div>
      ) : null}

      {tab === "comparativo" ? (
      <div style={{ display: "grid", gap: 16 }}>
      {!hayDatos && !cargando ? (
        <div style={{ ...styles.tarjeta, color: "#64748B", fontSize: 13 }}>Elija el año y pulse «Consultar».</div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <div style={styles.tarjeta}>
              <div style={styles.kpiLabel}>Ventas {incluirIgv ? "(con IGV)" : "(sin IGV)"}</div>
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
