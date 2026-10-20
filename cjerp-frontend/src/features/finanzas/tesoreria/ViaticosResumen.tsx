import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FiltroOperativoLookup } from "../../../components/lookups/FiltroOperativoLookup";
import type { FiltroOperativoValue } from "../../../models/filtroOperativo";

/** Fila mínima que necesita el resumen. Los montos están en la moneda REAL del recibo (sin convertir). */
export type ViaticoResumenRow = {
  id: number;
  idTarea: number | null;
  fecha: string; // YYYY-MM-DD (fecha de ingreso)
  estado: string;
  moneda: string;
  monto: number;
  cliente: string;
  proyecto: string;
  site: string;
  tipoTrabajo: string;
  solicitante: string;
  responsable: string;
};

type Props = {
  /** Trae los recibos del rango; el filtro por IdTarea se aplica aquí. */
  cargar: (fechaInicio: string, fechaFin: string) => Promise<ViaticoResumenRow[]>;
  /** Todos los solicitantes existentes (catálogo). */
  solicitantesCatalogo: string[];
  /** Todos los responsables existentes (catálogo). */
  responsablesCatalogo: string[];
  /** Fecha actual (YYYY-MM-DD, America/Lima). */
  hoy: string;
  /** Tarea que se resume (VIATICO = 93). */
  idTarea: number;
};

const COLORS = ["#4F46E5", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#14B8A6", "#EC4899", "#64748B", "#84CC16"];
const SIN_DATO = "(Sin dato)";

const cardStyle: CSSProperties = {
  background: "#FFFFFF",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 8px 24px rgba(23,20,58,0.08)",
};
const inputStyle: CSSProperties = {
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
};

function simboloMoneda(moneda: string): string {
  const m = moneda.toUpperCase();
  if (m.includes("SOL") || m === "1" || m === "PEN") return "S/";
  if (m.includes("DOL") || m.includes("USD") || m === "2") return "$";
  if (m.includes("EUR") || m === "3") return "€";
  return moneda ? `${moneda} ` : "";
}

function fmt(value: number, moneda: string): string {
  return `${simboloMoneda(moneda)} ${value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
}

function fmtCorto(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toFixed(0);
}

function primerDiaMes(hoy: string): string {
  return `${hoy.slice(0, 7)}-01`;
}

type Grupo = { nombre: string; cantidad: number; total: number };

function agrupar(rows: ViaticoResumenRow[], key: (row: ViaticoResumenRow) => string): Grupo[] {
  const map = new Map<string, Grupo>();
  for (const row of rows) {
    const nombre = key(row).trim() || SIN_DATO;
    const actual = map.get(nombre) ?? { nombre, cantidad: 0, total: 0 };
    actual.cantidad += 1;
    actual.total += row.monto;
    map.set(nombre, actual);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

function Kpi({ label, value, hint, color }: { label: string; value: string; hint?: string; color: string }) {
  return (
    <div style={{ ...cardStyle, padding: 14, borderTop: `4px solid ${color}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "#17143A", marginTop: 4 }}>{value}</div>
      {hint ? <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{hint}</div> : null}
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section style={cardStyle}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#17143A" }}>{title}</div>
      {subtitle ? <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8 }}>{subtitle}</div> : <div style={{ height: 8 }} />}
      {children}
    </section>
  );
}

function RankingBar({ data, moneda, color }: { data: Grupo[]; moneda: string; color: string }) {
  const top = data.slice(0, 10);
  if (top.length === 0) return <Vacio />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, top.length * 30)}>
      <BarChart data={top} layout="vertical" margin={{ left: 10, right: 24 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tickFormatter={fmtCorto} fontSize={11} />
        <YAxis type="category" dataKey="nombre" width={150} fontSize={11} tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)} />
        <Tooltip formatter={(value) => fmt(Number(value), moneda)} />
        <Bar dataKey="total" name="Total" fill={color} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function MultiAutocomplete({
  options,
  selected,
  onChange,
  placeholder,
}: {
  options: string[];
  selected: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const contenedorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const cerrar = (event: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(event.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, []);

  const sugerencias = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return options.filter((o) => !selected.includes(o) && (!q || o.toLowerCase().includes(q))).slice(0, 50);
  }, [options, selected, texto]);

  const agregar = (valor: string) => {
    onChange([...selected, valor]);
    setTexto("");
    setActivo(0);
  };

  return (
    <div ref={contenedorRef} style={{ position: "relative" }}>
      <div
        style={{ ...inputStyle, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", padding: "3px 6px", background: "#FFFFFF" }}
        onClick={() => setAbierto(true)}
      >
        {selected.map((valor) => (
          <span key={valor} style={{ background: "#EEF2FF", color: "#3730A3", borderRadius: 999, padding: "2px 4px 2px 8px", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
            {valor}
            <button
              type="button"
              aria-label={`Quitar ${valor}`}
              onClick={(event) => {
                event.stopPropagation();
                onChange(selected.filter((item) => item !== valor));
              }}
              style={{ border: "none", background: "transparent", cursor: "pointer", color: "#3730A3", fontWeight: 800, padding: "0 4px" }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={texto}
          placeholder={selected.length === 0 ? placeholder : ""}
          onFocus={() => setAbierto(true)}
          onChange={(e) => {
            setTexto(e.target.value);
            setAbierto(true);
            setActivo(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActivo((i) => Math.min(i + 1, sugerencias.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActivo((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && abierto && sugerencias[activo]) {
              e.preventDefault();
              agregar(sugerencias[activo]);
            } else if (e.key === "Backspace" && !texto && selected.length > 0) {
              onChange(selected.slice(0, -1));
            } else if (e.key === "Escape") {
              setAbierto(false);
            }
          }}
          style={{ border: "none", outline: "none", fontSize: 12, flex: 1, minWidth: 120, padding: "4px 2px" }}
        />
        {selected.length > 0 ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onChange([]);
            }}
            style={{ border: "none", background: "transparent", cursor: "pointer", color: "#475569", fontSize: 11, fontWeight: 700 }}
          >
            Limpiar
          </button>
        ) : null}
      </div>
      {abierto && sugerencias.length > 0 ? (
        <div style={{ position: "absolute", zIndex: 20, top: "100%", left: 0, right: 0, marginTop: 2, maxHeight: 220, overflow: "auto", background: "#FFFFFF", border: "1px solid #CBD5E1", borderRadius: 8, boxShadow: "0 8px 24px rgba(15,23,42,0.15)" }}>
          {sugerencias.map((opcion, index) => (
            <div
              key={opcion}
              onMouseDown={(event) => {
                event.preventDefault();
                agregar(opcion);
              }}
              onMouseEnter={() => setActivo(index)}
              style={{ padding: "6px 10px", fontSize: 12, cursor: "pointer", background: index === activo ? "#E0E7FF" : "#FFFFFF", color: "#0F172A" }}
            >
              {opcion}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Vacio() {
  return <div style={{ padding: 24, textAlign: "center", color: "#64748B", fontSize: 12 }}>Sin datos para mostrar.</div>;
}

export default function ViaticosResumen({ cargar, solicitantesCatalogo, responsablesCatalogo, hoy, idTarea }: Props) {
  const [fechaInicio, setFechaInicio] = useState(() => primerDiaMes(hoy));
  const [fechaFin, setFechaFin] = useState(hoy);
  const [rows, setRows] = useState<ViaticoResumenRow[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consultado, setConsultado] = useState(false);
  const [rangoAplicado, setRangoAplicado] = useState({ inicio: primerDiaMes(hoy), fin: hoy });
  const [monedaSel, setMonedaSel] = useState("");
  const [solicitantesSel, setSolicitantesSel] = useState<string[]>([]);
  const [responsablesSel, setResponsablesSel] = useState<string[]>([]);
  const [filtroOperativo, setFiltroOperativo] = useState<FiltroOperativoValue>({});

  const consultar = useCallback(async () => {
    if (!fechaInicio || !fechaFin || fechaInicio > fechaFin) {
      setError("Indique un rango de fechas válido.");
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const data = await cargar(fechaInicio, fechaFin);
      setRows(data.filter((row) => Number(row.idTarea) === idTarea));
      setRangoAplicado({ inicio: fechaInicio, fin: fechaFin });
      setConsultado(true);
    } catch {
      setError("No se pudo cargar el resumen de viáticos.");
      setRows([]);
    } finally {
      setCargando(false);
    }
  }, [cargar, fechaInicio, fechaFin, idTarea]);

  // Primera carga al abrir la pestaña (mes en curso).
  // El ref evita la doble carga del montaje doble de React.StrictMode (desarrollo).
  const cargaInicialRef = useRef(false);
  useEffect(() => {
    if (cargaInicialRef.current) return;
    cargaInicialRef.current = true;
    void consultar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cliente - Proyecto - Site seleccionado (vacío = todos).
  const rowsPorSite = useMemo(() => {
    const f = filtroOperativo.filtro;
    if (!f) return rows;
    const igual = (a: string, b?: string) => a.trim().toLowerCase() === (b ?? "").trim().toLowerCase();
    return rows.filter(
      (r) => igual(r.cliente, f.nombreCliente) && igual(r.proyecto, f.nombreProyecto) && igual(r.site, f.nombreSite)
    );
  }, [rows, filtroOperativo.filtro]);

  // Sin filtros (sitio ni fechas distintas de las iniciales): todo el catálogo de solicitantes.
  // Con algún filtro: solo los solicitantes de los registros que cumplen esos filtros.
  const hayFiltros =
    Boolean(filtroOperativo.filtro) || rangoAplicado.inicio !== primerDiaMes(hoy) || rangoAplicado.fin !== hoy;
  const solicitanteOpciones = useMemo(() => {
    const base = hayFiltros ? rowsPorSite.map((r) => r.solicitante.trim() || SIN_DATO) : solicitantesCatalogo;
    return Array.from(new Set(base.map((v) => v.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [hayFiltros, rowsPorSite, solicitantesCatalogo]);

  // Si un filtro previo deja fuera a un solicitante ya elegido, se descarta.
  useEffect(() => {
    setSolicitantesSel((prev) => {
      const validos = prev.filter((v) => solicitanteOpciones.includes(v));
      return validos.length === prev.length ? prev : validos;
    });
  }, [solicitanteOpciones]);

  // Los filtros se encadenan: la lista de responsables depende también de los solicitantes elegidos.
  const rowsPorSolicitante = useMemo(() => {
    if (solicitantesSel.length === 0) return rowsPorSite;
    const sel = new Set(solicitantesSel);
    return rowsPorSite.filter((r) => sel.has(r.solicitante.trim() || SIN_DATO));
  }, [rowsPorSite, solicitantesSel]);

  const hayFiltrosResponsable = hayFiltros || solicitantesSel.length > 0;
  const responsableOpciones = useMemo(() => {
    const base = hayFiltrosResponsable ? rowsPorSolicitante.map((r) => r.responsable.trim() || SIN_DATO) : responsablesCatalogo;
    return Array.from(new Set(base.map((v) => v.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [hayFiltrosResponsable, rowsPorSolicitante, responsablesCatalogo]);

  useEffect(() => {
    setResponsablesSel((prev) => {
      const validos = prev.filter((v) => responsableOpciones.includes(v));
      return validos.length === prev.length ? prev : validos;
    });
  }, [responsableOpciones]);

  const rowsFiltradas = useMemo(() => {
    if (responsablesSel.length === 0) return rowsPorSolicitante;
    const sel = new Set(responsablesSel);
    return rowsPorSolicitante.filter((r) => sel.has(r.responsable.trim() || SIN_DATO));
  }, [rowsPorSolicitante, responsablesSel]);

  const monedas = useMemo(() => agrupar(rowsFiltradas, (r) => r.moneda).map((g) => g.nombre), [rows]);
  const moneda = monedas.includes(monedaSel) ? monedaSel : monedas.find((m) => /SOL/i.test(m)) ?? monedas[0] ?? "";
  const rowsMoneda = useMemo(() => rowsFiltradas.filter((r) => (r.moneda.trim() || SIN_DATO) === moneda), [rowsFiltradas, moneda]);

  const total = rowsMoneda.reduce((acc, r) => acc + r.monto, 0);
  const promedio = rowsMoneda.length ? total / rowsMoneda.length : 0;
  const maximo = rowsMoneda.reduce((acc, r) => Math.max(acc, r.monto), 0);
  const solicitantes = new Set(rowsMoneda.map((r) => r.solicitante.trim()).filter(Boolean)).size;

  const porEstado = useMemo(() => agrupar(rowsMoneda, (r) => r.estado), [rowsMoneda]);
  const porResponsable = useMemo(() => agrupar(rowsMoneda, (r) => r.responsable), [rowsMoneda]);
  const responsables = new Set(rowsMoneda.map((r) => r.responsable.trim()).filter(Boolean)).size;
  const porSolicitante = useMemo(() => agrupar(rowsMoneda, (r) => r.solicitante), [rowsMoneda]);
  const porCliente = useMemo(() => agrupar(rowsMoneda, (r) => r.cliente), [rowsMoneda]);
  const porProyecto = useMemo(() => agrupar(rowsMoneda, (r) => r.proyecto), [rowsMoneda]);
  const porSite = useMemo(() => agrupar(rowsMoneda, (r) => r.site), [rowsMoneda]);
  const porTipoTrabajo = useMemo(() => agrupar(rowsMoneda, (r) => r.tipoTrabajo), [rowsMoneda]);

  const porMes = useMemo(() => {
    const map = new Map<string, Grupo>();
    for (const row of rowsMoneda) {
      const mes = row.fecha ? row.fecha.slice(0, 7) : SIN_DATO;
      const actual = map.get(mes) ?? { nombre: mes, cantidad: 0, total: 0 };
      actual.cantidad += 1;
      actual.total += row.monto;
      map.set(mes, actual);
    }
    return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [rowsMoneda]);

  const porDia = useMemo(() => {
    const map = new Map<string, Grupo>();
    for (const row of rowsMoneda) {
      if (!row.fecha) continue;
      const actual = map.get(row.fecha) ?? { nombre: row.fecha, cantidad: 0, total: 0 };
      actual.cantidad += 1;
      actual.total += row.monto;
      map.set(row.fecha, actual);
    }
    return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [rowsMoneda]);

  const topMontos = useMemo(() => [...rowsMoneda].sort((a, b) => b.monto - a.monto).slice(0, 10), [rowsMoneda]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...cardStyle, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: 4, flex: "2 1 520px", minWidth: 520 }}>
          Cliente - Proyecto - Site
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <FiltroOperativoLookup
                value={filtroOperativo}
                onChange={setFiltroOperativo}
                showTrabajo={false}
                showOt={false}
                showTarea={false}
                fontSize={12}
              />
            </div>
            {filtroOperativo.filtro ? (
              <button
                type="button"
                onClick={() => setFiltroOperativo({})}
                style={{ border: "1px solid #CBD5E1", borderRadius: 8, background: "#FFFFFF", color: "#475569", fontSize: 11, fontWeight: 700, padding: "6px 10px", cursor: "pointer" }}
              >
                Limpiar
              </button>
            ) : null}
          </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: 4, minWidth: 260, flex: "1 1 300px" }}>
          Solicitante
          <MultiAutocomplete options={solicitanteOpciones} selected={solicitantesSel} onChange={setSolicitantesSel} placeholder="Escriba para buscar..." />
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: 4, minWidth: 260, flex: "1 1 300px" }}>
          Responsable
          <MultiAutocomplete options={responsableOpciones} selected={responsablesSel} onChange={setResponsablesSel} placeholder="Escriba para buscar..." />
        </div>
        <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: 4 }}>
          Fecha inicio
          <input type="date" value={fechaInicio} max={fechaFin} onChange={(e) => setFechaInicio(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: 4 }}>
          Fecha fin
          <input type="date" value={fechaFin} min={fechaInicio} onChange={(e) => setFechaFin(e.target.value)} style={inputStyle} />
        </label>
        {monedas.length > 1 ? (
          <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: 4 }}>
            Moneda
            <select value={moneda} onChange={(e) => setMonedaSel(e.target.value)} style={inputStyle}>
              {monedas.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          onClick={() => void consultar()}
          disabled={cargando}
          style={{ border: "none", borderRadius: 8, background: "#4F46E5", color: "#FFFFFF", fontWeight: 800, fontSize: 12, padding: "8px 18px", cursor: cargando ? "not-allowed" : "pointer" }}
        >
          {cargando ? "Cargando..." : "Actualizar"}
        </button>
      </div>

      {error ? (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", padding: 12, borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{error}</div>
      ) : null}

      {consultado && rowsFiltradas.length === 0 && !cargando && !error ? (
        <div style={{ ...cardStyle }}><Vacio /></div>
      ) : null}

      {rowsFiltradas.length > 0 ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <Kpi label="Viáticos" value={rowsMoneda.length.toLocaleString("es-PE")} hint={`${rowsFiltradas.length.toLocaleString("es-PE")} en todas las monedas`} color="#4F46E5" />
            <Kpi label="Monto total" value={fmt(total, moneda)} color="#10B981" />
            <Kpi label="Promedio por viático" value={fmt(promedio, moneda)} color="#0EA5E9" />
            <Kpi label="Viático mayor" value={fmt(maximo, moneda)} color="#F59E0B" />
            <Kpi label="Responsables" value={responsables.toLocaleString("es-PE")} hint={responsables ? `${fmt(total / responsables, moneda)} por responsable` : undefined} color="#EC4899" />
            <Kpi label="Solicitantes" value={solicitantes.toLocaleString("es-PE")} hint={solicitantes ? `${fmt(total / solicitantes, moneda)} por solicitante` : undefined} color="#8B5CF6" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 12 }}>
            <Panel title="Evolución mensual" subtitle="Monto total y cantidad por mes de ingreso">
              {porMes.length === 0 ? <Vacio /> : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={porMes} margin={{ left: 4, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="nombre" fontSize={11} />
                    <YAxis yAxisId="m" tickFormatter={fmtCorto} fontSize={11} />
                    <YAxis yAxisId="c" orientation="right" allowDecimals={false} fontSize={11} />
                    <Tooltip formatter={(value, name) => (name === "Monto" ? fmt(Number(value), moneda) : value)} />
                    <Legend />
                    <Line yAxisId="m" type="monotone" dataKey="total" name="Monto" stroke="#4F46E5" strokeWidth={2} />
                    <Line yAxisId="c" type="monotone" dataKey="cantidad" name="Cantidad" stroke="#F59E0B" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="Distribución por estado" subtitle="Monto total por estado del recibo">
              {porEstado.length === 0 ? <Vacio /> : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={porEstado} dataKey="total" nameKey="nombre" innerRadius={55} outerRadius={95} paddingAngle={2}>
                      {porEstado.map((g, i) => (
                        <Cell key={g.nombre} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, _n, item) => [`${fmt(Number(value), moneda)} · ${(item?.payload as Grupo | undefined)?.cantidad ?? 0} reg.`, (item?.payload as Grupo | undefined)?.nombre]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="Top solicitantes" subtitle="Quienes más viáticos solicitan (monto)">
              <RankingBar data={porSolicitante} moneda={moneda} color="#4F46E5" />
            </Panel>

            <Panel title="Top responsables" subtitle="Quienes más viáticos reciben (monto)">
              <RankingBar data={porResponsable} moneda={moneda} color="#EC4899" />
            </Panel>

            <Panel title="Top clientes" subtitle="Monto de viáticos por cliente">
              <RankingBar data={porCliente} moneda={moneda} color="#0EA5E9" />
            </Panel>

            <Panel title="Top proyectos" subtitle="Monto de viáticos por proyecto">
              <RankingBar data={porProyecto} moneda={moneda} color="#10B981" />
            </Panel>

            <Panel title="Top sites" subtitle="Monto de viáticos por site">
              <RankingBar data={porSite} moneda={moneda} color="#F59E0B" />
            </Panel>

            <Panel title="Por tipo de trabajo" subtitle="Monto de viáticos por tipo de trabajo">
              <RankingBar data={porTipoTrabajo} moneda={moneda} color="#8B5CF6" />
            </Panel>

            <Panel title="Movimiento diario" subtitle="Monto por día (detecta picos de gasto)">
              {porDia.length === 0 ? <Vacio /> : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={porDia} margin={{ left: 4, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="nombre" fontSize={10} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tickFormatter={fmtCorto} fontSize={11} />
                    <Tooltip formatter={(value) => fmt(Number(value), moneda)} />
                    <Bar dataKey="total" name="Monto" fill="#14B8A6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 12 }}>
            <Panel title="Cuadro por responsable" subtitle="Cantidad y sumatoria de los registros por moneda">
              <TablaPersonas rows={rowsFiltradas} monedas={monedas} campo="responsable" titulo="Responsable" />
            </Panel>
            <Panel title="Cuadro por solicitante" subtitle="Cantidad y sumatoria de los registros por moneda">
              <TablaPersonas rows={rowsFiltradas} monedas={monedas} campo="solicitante" titulo="Solicitante" />
            </Panel>
            <Panel title="10 viáticos de mayor monto" subtitle="Para revisar montos atípicos">
              <div style={{ overflow: "auto", maxHeight: 380 }}>
                <table style={tablaStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Id</th>
                      <th style={thStyle}>Fecha</th>
                      <th style={thStyle}>Responsable</th>
                      <th style={thStyle}>Proyecto</th>
                      <th style={thStyle}>Estado</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topMontos.map((r) => (
                      <tr key={r.id}>
                        <td style={tdStyle}>{r.id}</td>
                        <td style={tdStyle}>{r.fecha}</td>
                        <td style={tdStyle}>{r.responsable || SIN_DATO}</td>
                        <td style={tdStyle}>{r.proyecto || SIN_DATO}</td>
                        <td style={tdStyle}>{r.estado || SIN_DATO}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>{fmt(r.monto, moneda)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  );
}

const tablaStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const thStyle: CSSProperties = { textAlign: "left", padding: "6px 8px", borderBottom: "2px solid #E2E8F0", color: "#475569", position: "sticky", top: 0, background: "#FFFFFF" };
const tdStyle: CSSProperties = { padding: "6px 8px", borderBottom: "1px solid #F1F5F9", color: "#0F172A" };

function TablaPersonas({
  rows,
  monedas,
  campo,
  titulo,
}: {
  rows: ViaticoResumenRow[];
  monedas: string[];
  campo: "responsable" | "solicitante";
  titulo: string;
}) {
  if (rows.length === 0) return <Vacio />;

  const porResp = new Map<string, { cantidad: number; totales: Map<string, number> }>();
  const general = new Map<string, number>();
  for (const row of rows) {
    const nombre = row[campo].trim() || SIN_DATO;
    const mon = row.moneda.trim() || SIN_DATO;
    const actual = porResp.get(nombre) ?? { cantidad: 0, totales: new Map<string, number>() };
    actual.cantidad += 1;
    actual.totales.set(mon, (actual.totales.get(mon) ?? 0) + row.monto);
    porResp.set(nombre, actual);
    general.set(mon, (general.get(mon) ?? 0) + row.monto);
  }
  // Orden: más registros primero (no se mezclan monedas para ordenar).
  const filas = [...porResp.entries()].sort((a, b) => b[1].cantidad - a[1].cantidad || a[0].localeCompare(b[0]));

  return (
    <div style={{ overflow: "auto", maxHeight: 380 }}>
      <table style={tablaStyle}>
        <thead>
          <tr>
            <th style={thStyle}>{titulo}</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Cant.</th>
            {monedas.map((m) => (
              <th key={m} style={{ ...thStyle, textAlign: "right" }}>Total {m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map(([nombre, g]) => (
            <tr key={nombre}>
              <td style={tdStyle}>{nombre}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{g.cantidad}</td>
              {monedas.map((m) => (
                <td key={m} style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>
                  {g.totales.has(m) ? fmt(g.totales.get(m) ?? 0, m) : "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ ...tdStyle, fontWeight: 800, borderTop: "2px solid #E2E8F0" }}>Total general</td>
            <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800, borderTop: "2px solid #E2E8F0" }}>{rows.length}</td>
            {monedas.map((m) => (
              <td key={m} style={{ ...tdStyle, textAlign: "right", fontWeight: 800, borderTop: "2px solid #E2E8F0" }}>
                {fmt(general.get(m) ?? 0, m)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
