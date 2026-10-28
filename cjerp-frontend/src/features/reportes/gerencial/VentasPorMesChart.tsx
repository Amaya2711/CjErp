import { useMemo } from "react";
import type { CSSProperties } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { VentasSunatRegistroDto } from "../../../api/ventasSunatService";
import { afectoDe, igvDe, importeVenta, inafectoDe, type OpcionesImporte } from "./ventasImporte";

type Props = {
  anio: number;
  registros: VentasSunatRegistroDto[];
  importe: OpcionesImporte;
  etiqueta: string;
  /** Periodo (yyyyMM) seleccionado; al hacer clic en una barra se alterna. */
  seleccionado?: string | null;
  onSeleccionar?: (periodo: string | null) => void;
};

type Barra = { mes: string; periodo: string; afecto: number; inafecto: number; igv: number; total: number; monto: number; parcial: boolean };

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
const MESES_LARGO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"];
const COLOR = "#2878D8";
const COLOR_PARCIAL = "#A9C9EE";

const numero = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const fmt = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const millones = (v: number) => `S/ ${(v / 1_000_000).toFixed(2)} MM`;

const tarjeta: CSSProperties = { border: "1px solid #D8E5F2", borderRadius: 14, padding: 14, background: "#fff" };

type TooltipProps = { active?: boolean; payload?: { payload: Barra }[] };

function TooltipVentas({ active, payload }: TooltipProps) {
  const d = active ? payload?.[0]?.payload : undefined;
  if (!d) return null;
  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", boxShadow: "0 4px 16px rgba(15,23,42,.18)", fontSize: 12, lineHeight: 1.6 }}>
      <div style={{ color: "#475569" }}>{MESES_LARGO[Number(d.periodo.slice(4)) - 1]}</div>
      <div>Afecto: S/ {fmt(d.afecto)}</div>
      <div>Inafecto: S/ {fmt(d.inafecto)}</div>
      <div>IGV: S/ {fmt(d.igv)}</div>
      <div>Total comprobantes: S/ {fmt(d.total)}</div>
      <div style={{ fontWeight: 700 }}>Importe: S/ {fmt(d.monto)}</div>
    </div>
  );
}

// Barras de ventas por mes del año elegido. El mes en curso (si va al corte) se pinta claro y no entra en el promedio.
export default function VentasPorMesChart({ anio, registros, importe, etiqueta, seleccionado, onSeleccionar }: Props) {
  const { barras, promedio, mesParcial } = useMemo(() => {
    const hoy = new Date();
    const periodoActual = `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, "0")}`;
    const porPeriodo = new Map<string, Barra>();
    for (const r of registros) {
      const p = r.periodo ?? "";
      if (!p.startsWith(String(anio))) continue;
      const b = porPeriodo.get(p) ?? { mes: MESES[Number(p.slice(4)) - 1] ?? p, periodo: p, afecto: 0, inafecto: 0, igv: 0, total: 0, monto: 0, parcial: p === periodoActual };
      b.afecto += afectoDe(r);
      b.inafecto += inafectoDe(r);
      b.igv += igvDe(r);
      b.monto += importeVenta(r, importe);
      b.total += numero(r.totalCp);
      porPeriodo.set(p, b);
    }
    const lista = Array.from(porPeriodo.values()).sort((a, b) => a.periodo.localeCompare(b.periodo));
    const cerrados = lista.filter((b) => !b.parcial);
    return {
      barras: lista,
      promedio: cerrados.length ? cerrados.reduce((s, b) => s + b.monto, 0) / cerrados.length : 0,
      mesParcial: lista.find((b) => b.parcial),
    };
  }, [anio, registros, importe]);


  if (barras.length === 0) {
    return (
      <div style={tarjeta}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "#0F172A", margin: "0 0 4px" }}>Ventas por mes</h3>
        <div style={{ fontSize: 13, color: "#64748B" }}>Sin ventas para los filtros elegidos.</div>
      </div>
    );
  }

  return (
    <div style={tarjeta}>
      <h3 style={{ fontSize: 14, fontWeight: 800, color: "#0F172A", margin: "0 0 4px" }}>Ventas por mes</h3>
      <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>
        Ventas {etiqueta} por mes. Línea punteada: promedio de los meses cerrados
        {mesParcial ? `. ${MESES_LARGO[Number(mesParcial.periodo.slice(4)) - 1]} va al corte y aún no está cerrado.` : "."}
      </div>
      <div style={{ width: "100%", height: 320 }}>
        <ResponsiveContainer>
          <BarChart data={barras} margin={{ top: 20, right: 24, left: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#E2E8F0" />
            <XAxis dataKey="mes" tickLine={false} axisLine={{ stroke: "#CBD5E1" }} />
            <YAxis tickLine={false} axisLine={false} tickFormatter={(v: number) => millones(v)} width={90} />
            <Tooltip content={<TooltipVentas />} cursor={{ fill: "rgba(148,163,184,.15)" }} />
            {promedio > 0 ? (
              <ReferenceLine
                y={promedio}
                stroke="#64748B"
                strokeDasharray="5 4"
                label={{ value: `Promedio ${millones(promedio)}`, position: "insideTopRight", fontSize: 12, fill: "#0F172A" }}
              />
            ) : null}
            <Bar
              dataKey="monto"
              radius={[6, 6, 0, 0]}
              maxBarSize={64}
              cursor={onSeleccionar ? "pointer" : undefined}
              onClick={(d: unknown) => {
                const periodo = (d as { payload?: Barra }).payload?.periodo;
                if (periodo && onSeleccionar) onSeleccionar(periodo === seleccionado ? null : periodo);
              }}
            >
              {barras.map((b) => (
                <Cell key={b.periodo} fill={b.parcial ? COLOR_PARCIAL : COLOR} fillOpacity={seleccionado && seleccionado !== b.periodo ? 0.35 : 1} />
              ))}
              <LabelList dataKey="parcial" position="top" fontSize={12} fill="#64748B" formatter={(v: unknown) => (v ? "parcial" : "")} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
