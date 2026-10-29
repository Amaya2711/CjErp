import { useMemo } from "react";
import { construirGastoPorMoneda } from "./ventasGastosDatos";
import type { CSSProperties } from "react";

type GastoMoneda = { periodo: string; moneda: string; monto: number; montoPen: number };

type Props = {
  anio: number;
  gastos: GastoMoneda[];
};

type Fila = { moneda: string; original: number; soles: number; porcentaje: number };

const COLORES: Record<string, string> = { PEN: "#2878D8", USD: "#EA6B33", DOP: "#1FA97A", EUR: "#8B5CF6", COP: "#CA8A04" };
const SIMBOLOS: Record<string, string> = { PEN: "S/", USD: "$", EUR: "€", DOP: "RD$", COP: "COL$" };

const fmt = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const abreviado = (v: number) => (Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)} MM` : Math.abs(v) >= 1_000 ? `${(v / 1_000).toFixed(1)}k` : fmt(v));

const celda: CSSProperties = { padding: "10px 8px", textAlign: "right", fontSize: 13, color: "#0F172A", whiteSpace: "nowrap" };
const cabecera: CSSProperties = { padding: "8px", textAlign: "right", fontSize: 12, fontWeight: 600, color: "#64748B", borderBottom: "1px solid #E2E8F0" };

// Gasto por moneda: monto original (moneda real del recibo) y su equivalente en soles con los tipos de cambio de la cabecera.
export default function CostosPorMoneda({ anio, gastos }: Props) {
  const filas = useMemo<Fila[]>(() => construirGastoPorMoneda(anio, gastos), [anio, gastos]);

  if (filas.length === 0) return null;

  return (
    <div style={{ border: "1px solid #D8E5F2", borderRadius: 14, padding: 14, background: "#fff" }}>
      <h3 style={{ fontSize: 14, fontWeight: 800, color: "#0F172A", margin: "0 0 4px" }}>Gasto por moneda</h3>
      <div style={{ fontSize: 12, color: "#64748B", marginBottom: 12 }}>Gastos pagados {anio} por moneda del recibo, convertidos al tipo de cambio de la cabecera.</div>

      <div style={{ display: "flex", gap: 2, height: 30, marginBottom: 12 }}>
        {filas.map((f) => (
          <div key={f.moneda} title={`${f.moneda} ${f.porcentaje.toFixed(1)}%`} style={{ flex: Math.max(f.porcentaje, 0.5), background: COLORES[f.moneda] ?? "#64748B", borderRadius: 4 }} />
        ))}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...cabecera, textAlign: "left" }}>Moneda</th>
            <th style={cabecera}>Monto original</th>
            <th style={cabecera}>En soles</th>
            <th style={cabecera}>%</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.moneda} style={{ borderBottom: "1px solid #EEF2F7" }}>
              <td style={{ ...celda, textAlign: "left", color: "#475569" }}>
                <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: COLORES[f.moneda] ?? "#64748B", marginRight: 8 }} />
                {f.moneda}
              </td>
              <td style={celda}>
                {SIMBOLOS[f.moneda] ?? f.moneda} {fmt(f.original)}
              </td>
              <td style={celda}>S/ {abreviado(f.soles)}</td>
              <td style={celda}>{f.porcentaje.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
