import { useMemo } from "react";
import { construirRentabilidadCliente } from "./ventasGastosDatos";
import { Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type RentabilidadCliente = {
  clave: string;
  nroDocumento: string;
  nombreCliente: string;
  ventas: number;
  costos: number;
  utilidad: number;
  margen: number | null;
};

type Props = {
  anio: number;
  filas: RentabilidadCliente[];
  /** Cliente seleccionado (clave); al hacer clic en una barra se alterna. */
  seleccionado?: string | null;
  onSeleccionar?: (clave: string | null) => void;
  /** Vista ampliada (la pantalla le da todo el ancho). */
  expandido?: boolean;
  onAlternarExpandir?: () => void;
};

const COLOR_UTILIDAD = "#1FA97A";
const COLOR_PERDIDA = "#D9534F";

const fmt = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const abreviado = (v: number) => {
  const a = Math.abs(v);
  const texto = a >= 1_000_000 ? `${(a / 1_000_000).toFixed(2)} MM` : a >= 1_000 ? `${(a / 1_000).toFixed(1)}k` : fmt(a);
  return `${v < 0 ? "-" : ""}S/ ${texto}`;
};

type TooltipProps = { active?: boolean; payload?: { payload: RentabilidadCliente }[] };

function TooltipRentabilidad({ active, payload }: TooltipProps) {
  const d = active ? payload?.[0]?.payload : undefined;
  if (!d) return null;
  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", boxShadow: "0 4px 16px rgba(15,23,42,.18)", fontSize: 12, lineHeight: 1.6 }}>
      <div style={{ fontWeight: 700 }}>{d.nombreCliente}</div>
      {d.nroDocumento ? <div>RUC/DNI: {d.nroDocumento}</div> : null}
      <div>Ventas: S/ {fmt(d.ventas)}</div>
      <div>Costos: S/ {fmt(d.costos)}</div>
      <div style={{ fontWeight: 700, color: d.utilidad < 0 ? COLOR_PERDIDA : COLOR_UTILIDAD }}>Utilidad: S/ {fmt(d.utilidad)}</div>
      <div>Margen: {d.margen == null ? "sin ventas" : `${d.margen.toFixed(1)}%`}</div>
    </div>
  );
}

// Etiqueta al extremo de cada barra (a la derecha si es utilidad, a la izquierda si es pérdida): importe y margen.
function etiquetaBarra(props: unknown, filas: RentabilidadCliente[]) {
  const p = props as { x?: number; y?: number; width?: number; height?: number; index?: number };
  const fila = p.index != null ? filas[p.index] : undefined;
  if (!fila || p.x == null || p.y == null || p.width == null || p.height == null) return null;
  const negativa = fila.utilidad < 0;
  // En barras negativas recharts entrega width < 0 con x en el extremo izquierdo o derecho según versión: se normaliza.
  const izquierda = Math.min(p.x, p.x + p.width);
  const derecha = Math.max(p.x, p.x + p.width);
  const texto = `${abreviado(fila.utilidad)}${fila.margen == null ? "" : ` · ${fila.margen.toFixed(1)}%`}`;
  return (
    <text x={negativa ? izquierda - 6 : derecha + 6} y={p.y + p.height / 2} dy={4} fontSize={12} fill="#0F172A" textAnchor={negativa ? "end" : "start"}>
      {texto}
    </text>
  );
}

// Vista gerencial: utilidad (ventas - costos) por cliente, de mayor a menor; verde = utilidad, rojo = pérdida.
export default function RentabilidadClienteChart({ anio, filas, seleccionado, onSeleccionar, expandido = false, onAlternarExpandir }: Props) {
  const barras = useMemo<RentabilidadCliente[]>(() => construirRentabilidadCliente(filas), [filas]);

  const omitidos = filas.filter((f) => f.ventas !== 0 || f.costos !== 0).length - barras.length;
  if (barras.length === 0) return null;

  const dominio: [number, number] = [Math.min(0, ...barras.map((b) => b.utilidad)), Math.max(0, ...barras.map((b) => b.utilidad))];

  return (
    <div style={{ border: "1px solid #D8E5F2", borderRadius: 14, padding: 14, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "#0F172A", margin: 0 }}>Rentabilidad por cliente (gerencial)</h3>
        <button
          type="button"
          onClick={onAlternarExpandir}
          aria-pressed={expandido}
          title={expandido ? "Contraer" : "Expandir"}
          style={{ border: "1px solid #CBD5E1", background: "#fff", borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 600, color: "#334155", cursor: "pointer", whiteSpace: "nowrap" }}
        >
          {expandido ? "⤡ Contraer" : "⤢ Expandir"}
        </button>
      </div>
      <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>
        Utilidad {anio} = ventas - costos, en soles, con el margen sobre ventas. Se muestran los {barras.length} clientes de mayor impacto
        {omitidos > 0 ? ` (${omitidos} más en la grilla)` : ""}.
      </div>
      <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 16 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: COLOR_UTILIDAD, display: "inline-block" }} />
          Utilidad
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: COLOR_PERDIDA, display: "inline-block" }} />
          Pérdida
        </span>
      </div>
      <div style={{ width: "100%", height: 40 + barras.length * (expandido ? 36 : 26) }}>
        <ResponsiveContainer>
          <BarChart data={barras} layout="vertical" margin={{ top: 0, right: 150, left: 8, bottom: 0 }} barCategoryGap={4}>
            <XAxis type="number" hide domain={dominio} />
            <YAxis
              type="category"
              dataKey="nombreCliente"
              width={190}
              tickLine={false}
              axisLine={false}
              interval={0}
              tick={{ fontSize: 12, fill: "#64748B" }}
              tickFormatter={(v: string) => (v.length > 28 ? `${v.slice(0, 27)}…` : v)}
            />
            <Tooltip content={<TooltipRentabilidad />} cursor={{ fill: "rgba(148,163,184,.12)" }} />
            <ReferenceLine x={0} stroke="#94A3B8" />
            <Bar
              dataKey="utilidad"
              radius={3}
              cursor={onSeleccionar ? "pointer" : undefined}
              onClick={(d: unknown) => {
                const clave = (d as { payload?: RentabilidadCliente }).payload?.clave;
                if (clave && onSeleccionar) onSeleccionar(clave === seleccionado ? null : clave);
              }}
            >
              {barras.map((b) => (
                <Cell key={b.clave} fill={b.utilidad < 0 ? COLOR_PERDIDA : COLOR_UTILIDAD} fillOpacity={seleccionado && seleccionado !== b.clave ? 0.35 : 1} />
              ))}
              <LabelList dataKey="utilidad" content={(p) => etiquetaBarra(p, barras)} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
