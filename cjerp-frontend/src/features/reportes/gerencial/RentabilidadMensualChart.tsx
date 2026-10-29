import { construirPuntosMensuales } from "./ventasGastosDatos";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type RentabilidadMes = { periodo: string; ventas: number; costos: number };

type Props = {
  anio: number;
  datos: RentabilidadMes[];
  /** Cliente al que se acota el gráfico (si lo hay). */
  cliente?: string | null;
  /** Vista ampliada (la pantalla le da todo el ancho). */
  expandido?: boolean;
  onAlternarExpandir?: () => void;
};

type Punto = { mes: string; periodo: string; ventas: number; costos: number; utilidad: number; margen: number | null; parcial: boolean };

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
const COLOR_VENTAS = "#2878D8";
const COLOR_COSTOS = "#EA6B33";
const COLOR_MARGEN = "#1FA97A";

const fmt = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const millones = (v: number) => `S/ ${(v / 1_000_000).toFixed(2)} MM`;

type TooltipProps = { active?: boolean; payload?: { payload: Punto }[] };

function TooltipMes({ active, payload }: TooltipProps) {
  const d = active ? payload?.[0]?.payload : undefined;
  if (!d) return null;
  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", boxShadow: "0 4px 16px rgba(15,23,42,.18)", fontSize: 12, lineHeight: 1.6 }}>
      <div style={{ fontWeight: 700 }}>
        {MESES[Number(d.periodo.slice(4)) - 1]} {d.periodo.slice(0, 4)}
        {d.parcial ? " (al corte)" : ""}
      </div>
      <div>Ventas: S/ {fmt(d.ventas)}</div>
      <div>Costos: S/ {fmt(d.costos)}</div>
      <div style={{ fontWeight: 700 }}>Utilidad: S/ {fmt(d.utilidad)}</div>
      <div>Margen: {d.margen == null ? "sin ventas" : `${d.margen.toFixed(1)}%`}</div>
    </div>
  );
}

// Evolución mensual: barras de ventas y costos (soles) y línea del margen % (utilidad / ventas) en el eje derecho.
export default function RentabilidadMensualChart({ anio, datos, cliente, expandido = false, onAlternarExpandir }: Props) {
  const puntos = construirPuntosMensuales(anio, datos);

  return (
    <div style={{ border: "1px solid #D8E5F2", borderRadius: 14, padding: 14, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "#0F172A", margin: 0 }}>Evolución mensual de la rentabilidad</h3>
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
        Ventas y costos por mes (S/) y margen % sobre ventas {anio}
        {cliente ? ` · Cliente: ${cliente}` : ""}.
      </div>
      {puntos.length === 0 ? (
        <div style={{ fontSize: 13, color: "#64748B" }}>Sin datos para los filtros elegidos.</div>
      ) : (
        <div style={{ width: "100%", height: expandido ? 560 : 320 }}>
          <ResponsiveContainer>
            <ComposedChart data={puntos} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="mes" tickLine={false} axisLine={{ stroke: "#CBD5E1" }} />
              <YAxis yAxisId="monto" tickLine={false} axisLine={false} width={90} tickFormatter={(v: number) => millones(v)} />
              <YAxis yAxisId="margen" orientation="right" tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
              <Tooltip content={<TooltipMes />} cursor={{ fill: "rgba(148,163,184,.12)" }} />
              <Legend />
              <ReferenceLine yAxisId="margen" y={0} stroke="#94A3B8" strokeDasharray="4 3" />
              <Bar yAxisId="monto" dataKey="ventas" name="Ventas" fill={COLOR_VENTAS} radius={[4, 4, 0, 0]} maxBarSize={36} />
              <Bar yAxisId="monto" dataKey="costos" name="Costos" fill={COLOR_COSTOS} radius={[4, 4, 0, 0]} maxBarSize={36} />
              <Line yAxisId="margen" type="monotone" dataKey="margen" name="Margen %" stroke={COLOR_MARGEN} strokeWidth={2} dot connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
