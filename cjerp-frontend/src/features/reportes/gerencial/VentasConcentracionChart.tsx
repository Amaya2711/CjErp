import { useMemo } from "react";
import type { CSSProperties } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { VentasSunatRegistroDto } from "../../../api/ventasSunatService";
import { clienteDeVenta, importeVenta, type OpcionesImporte } from "./ventasImporte";

type Props = {
  anio: number;
  registros: VentasSunatRegistroDto[];
  importe: OpcionesImporte;
  /** Cliente seleccionado; al hacer clic en una barra se alterna. */
  seleccionado?: string | null;
  onSeleccionar?: (cliente: string | null) => void;
};

type Barra = { cliente: string; venta: number; participacion: number };

const MAX_CLIENTES = 20;
const TOP_DESTACADOS = 3;
const COLOR = "#2878D8";
const COLOR_RESTO = "#C4C4B8";

const fmt = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const tarjeta: CSSProperties = { border: "1px solid #D8E5F2", borderRadius: 14, padding: 14, background: "#fff" };

type TooltipProps = { active?: boolean; payload?: { payload: Barra }[] };

function TooltipConcentracion({ active, payload }: TooltipProps) {
  const d = active ? payload?.[0]?.payload : undefined;
  if (!d) return null;
  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", boxShadow: "0 4px 16px rgba(15,23,42,.18)", fontSize: 12, lineHeight: 1.6 }}>
      <div style={{ fontWeight: 700 }}>{d.cliente}</div>
      <div>Venta: S/ {fmt(d.venta)}</div>
      <div>Participación: {d.participacion.toFixed(1)}%</div>
    </div>
  );
}

// Participación de cada cliente en la venta (importe elegido en la cabecera) del año elegido. Los 3 primeros se destacan.
export default function VentasConcentracionChart({ anio, registros, importe, seleccionado, onSeleccionar }: Props) {
  const barras = useMemo<Barra[]>(() => {
    const porCliente = new Map<string, number>();
    for (const r of registros) {
      if (!(r.periodo ?? "").startsWith(String(anio))) continue;
      const k = clienteDeVenta(r);
      porCliente.set(k, (porCliente.get(k) ?? 0) + importeVenta(r, importe));
    }
    // Clientes con venta neta negativa (notas de crédito) no participan de la concentración.
    const ordenados = Array.from(porCliente, ([cliente, venta]) => ({ cliente, venta })).filter((c) => c.venta > 0).sort((a, b) => b.venta - a.venta);
    const total = ordenados.reduce((s, c) => s + c.venta, 0);
    if (total <= 0) return [];
    const visibles = ordenados.slice(0, MAX_CLIENTES);
    const resto = ordenados.slice(MAX_CLIENTES);
    if (resto.length) visibles.push({ cliente: `Otros (${resto.length})`, venta: resto.reduce((s, c) => s + c.venta, 0) });
    return visibles.map((c) => ({ ...c, participacion: (c.venta / total) * 100 }));
  }, [anio, registros, importe]);

  if (barras.length === 0) return null;

  return (
    <div style={tarjeta}>
      <h3 style={{ fontSize: 14, fontWeight: 800, color: "#0F172A", margin: "0 0 4px" }}>Concentración de la venta</h3>
      <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>Participación de cada cliente en la venta del periodo ({anio}).</div>
      <div style={{ width: "100%", height: 40 + barras.length * 26 }}>
        <ResponsiveContainer>
          <BarChart data={barras} layout="vertical" margin={{ top: 0, right: 56, left: 8, bottom: 0 }} barCategoryGap={5}>
            <XAxis type="number" hide domain={[0, "dataMax"]} />
            <YAxis
              type="category"
              dataKey="cliente"
              width={190}
              tickLine={false}
              axisLine={false}
              interval={0}
              tick={{ fontSize: 12, fill: "#64748B" }}
              tickFormatter={(v: string) => (v.length > 28 ? `${v.slice(0, 27)}…` : v)}
            />
            <Tooltip content={<TooltipConcentracion />} cursor={{ fill: "rgba(148,163,184,.12)" }} />
            <Bar
              dataKey="venta"
              radius={[0, 5, 5, 0]}
              cursor={onSeleccionar ? "pointer" : undefined}
              onClick={(d: unknown) => {
                const cliente = (d as { payload?: Barra }).payload?.cliente;
                // "Otros (n)" agrupa varios clientes: no es seleccionable.
                if (!cliente || !onSeleccionar || cliente.startsWith("Otros (")) return;
                onSeleccionar(cliente === seleccionado ? null : cliente);
              }}
            >
              {barras.map((b, i) => (
                <Cell key={b.cliente} fill={seleccionado ? (b.cliente === seleccionado ? COLOR : COLOR_RESTO) : i < TOP_DESTACADOS ? COLOR : COLOR_RESTO} />
              ))}
              <LabelList
                dataKey="participacion"
                position="right"
                fontSize={12}
                fill="#0F172A"
                formatter={(v: unknown) => `${Number(v).toFixed(1)}%`}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
