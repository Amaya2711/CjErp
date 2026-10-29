import { useMemo } from "react";
import type { CSSProperties } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { VentasSunatRegistroDto } from "../../../api/ventasSunatService";
import type { OpcionesImporte } from "./ventasImporte";
import { construirConcentracion } from "./ventasGastosDatos";

type Props = {
  anio: number;
  registros: VentasSunatRegistroDto[];
  importe: OpcionesImporte;
  /** Cliente seleccionado; al hacer clic en una barra se alterna. */
  seleccionado?: string | null;
  onSeleccionar?: (cliente: string | null) => void;
};

type Barra = { cliente: string; venta: number; participacion: number };

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

export default function VentasConcentracionChart({ anio, registros, importe, seleccionado, onSeleccionar }: Props) {
  const barras = useMemo<Barra[]>(() => construirConcentracion(anio, registros, importe), [anio, registros, importe]);

  if (barras.length === 0) {
    return (
      <div style={tarjeta}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "#0F172A", margin: "0 0 4px" }}>Concentración de la venta</h3>
        <div style={{ fontSize: 13, color: "#64748B" }}>Sin ventas para los filtros elegidos.</div>
      </div>
    );
  }

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
              <LabelList dataKey="participacion" content={(p) => etiquetaEnBarra(p, (v) => `${v.toFixed(1)}%`)} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
