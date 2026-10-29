import { useMemo } from "react";
import { construirCostosCliente } from "./ventasGastosDatos";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type CostoCliente = { clave: string; nroDocumento: string; nombreCliente: string; costo: number; conVenta: boolean };

type Props = {
  anio: number;
  filas: CostoCliente[];
  /** Cliente seleccionado (clave); al hacer clic en una barra se alterna. */
  seleccionado?: string | null;
  onSeleccionar?: (clave: string | null) => void;
};

type Barra = { clave: string; etiqueta: string; nroDocumento: string; costo: number; conVenta: boolean | null };

const COLOR_CON_VENTA = "#2878D8";
const COLOR_SIN_VENTA = "#EA6B33";
const COLOR_OTROS = "#C4C4B8";

const fmt = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const abreviado = (v: number) => (Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)} MM` : Math.abs(v) >= 1_000 ? `${(v / 1_000).toFixed(1)}k` : fmt(v));

type TooltipProps = { active?: boolean; payload?: { payload: Barra }[] };

function TooltipCosto({ active, payload }: TooltipProps) {
  const d = active ? payload?.[0]?.payload : undefined;
  if (!d) return null;
  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", boxShadow: "0 4px 16px rgba(15,23,42,.18)", fontSize: 12, lineHeight: 1.6 }}>
      <div style={{ fontWeight: 700 }}>{d.etiqueta}</div>
      {d.nroDocumento ? <div>RUC/DNI: {d.nroDocumento}</div> : null}
      <div>Gasto: S/ {fmt(d.costo)}</div>
      {d.conVenta === null ? null : <div>{d.conVenta ? "Cliente con venta" : "Sin venta asignada"}</div>}
    </div>
  );
}

const leyenda = (color: string, texto: string) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 16 }}>
    <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: "inline-block" }} />
    {texto}
  </span>
);

// Gasto (soles) por cliente (RUC/DNI + nombre). Azul = el cliente tiene ventas en el año; naranja = sin venta asignada.
// Texto de la barra: dentro (blanco, pegado al extremo) si cabe; si es muy corta, justo a su derecha.
function etiquetaEnBarra(props: unknown, texto: (v: number) => string) {
  const p = props as { x?: number; y?: number; width?: number; height?: number; value?: number };
  if (p.x == null || p.y == null || p.width == null || p.height == null || p.value == null) return null;
  const t = texto(Number(p.value));
  const cabe = p.width >= t.length * 6.6 + 12;
  return (
    <text x={cabe ? p.x + p.width - 6 : p.x + p.width + 6} y={p.y + p.height / 2} dy={4} fontSize={12} fontWeight={cabe ? 600 : 400} fill={cabe ? "#fff" : "#0F172A"} textAnchor={cabe ? "end" : "start"}>
      {t}
    </text>
  );
}

export default function CostosPorClienteChart({ anio, filas, seleccionado, onSeleccionar }: Props) {
  const barras = useMemo<Barra[]>(() => construirCostosCliente(filas), [filas]);

  if (barras.length === 0) return null;

  return (
    <div style={{ border: "1px solid #D8E5F2", borderRadius: 14, padding: 14, background: "#fff" }}>
      <h3 style={{ fontSize: 14, fontWeight: 800, color: "#0F172A", margin: "0 0 4px" }}>Gasto por RUC / cliente</h3>
      <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>Gastos pagados {anio} en soles convertidos. El color indica si el cliente tiene venta asociada.</div>
      <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>
        {leyenda(COLOR_CON_VENTA, "Cliente con venta")}
        {leyenda(COLOR_SIN_VENTA, "Sin venta asignada")}
      </div>
      <div style={{ width: "100%", height: 40 + barras.length * 24 }}>
        <ResponsiveContainer>
          <BarChart data={barras} layout="vertical" margin={{ top: 0, right: 80, left: 8, bottom: 0 }} barCategoryGap={4}>
            <XAxis type="number" hide domain={[0, "dataMax"]} />
            <YAxis
              type="category"
              dataKey="etiqueta"
              width={190}
              tickLine={false}
              axisLine={false}
              interval={0}
              tick={{ fontSize: 12, fill: "#64748B" }}
              tickFormatter={(v: string) => (v.length > 28 ? `${v.slice(0, 27)}…` : v)}
            />
            <Tooltip content={<TooltipCosto />} cursor={{ fill: "rgba(148,163,184,.12)" }} />
            <Bar
              dataKey="costo"
              radius={[0, 5, 5, 0]}
              cursor={onSeleccionar ? "pointer" : undefined}
              onClick={(d: unknown) => {
                const clave = (d as { payload?: Barra }).payload?.clave;
                // "Otros (n)" agrupa varios clientes: no es seleccionable.
                if (!clave || !onSeleccionar) return;
                onSeleccionar(clave === seleccionado ? null : clave);
              }}
            >
              {barras.map((b) => (
                <Cell
                  key={`${b.nroDocumento}|${b.etiqueta}`}
                  fill={b.conVenta === null ? COLOR_OTROS : b.conVenta ? COLOR_CON_VENTA : COLOR_SIN_VENTA}
                  fillOpacity={seleccionado && seleccionado !== b.clave ? 0.35 : 1}
                />
              ))}
              <LabelList dataKey="costo" content={(p) => etiquetaEnBarra(p, (v) => `S/ ${abreviado(v)}`)} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
