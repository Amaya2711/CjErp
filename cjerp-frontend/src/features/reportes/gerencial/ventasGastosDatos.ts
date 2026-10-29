// Datos de los gráficos de Ventas vs Gastos. Los usan los componentes de la pantalla y el PDF, para que ambos muestren exactamente lo mismo.
import type { VentasSunatRegistroDto } from "../../../api/ventasSunatService";
import { afectoDe, clienteDeVenta, igvDe, importeVenta, inafectoDe, type OpcionesImporte } from "./ventasImporte";

export const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
const MESES = MESES_CORTOS;
const MAX_CLIENTES = 25;
const MAX_CLIENTES_VENTA = 20;
const numero = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export type BarraMes = { mes: string; periodo: string; afecto: number; inafecto: number; igv: number; total: number; monto: number; parcial: boolean };
export type BarraConcentracion = { cliente: string; venta: number; participacion: number };
export type CostoCliente = { clave: string; nroDocumento: string; nombreCliente: string; costo: number; conVenta: boolean };
export type BarraCostoCliente = { clave: string; etiqueta: string; nroDocumento: string; costo: number; conVenta: boolean | null };
export type RentabilidadClienteDato = { clave: string; nroDocumento: string; nombreCliente: string; ventas: number; costos: number; utilidad: number; margen: number | null };
export type RentabilidadMesDato = { periodo: string; ventas: number; costos: number };
export type PuntoMensual = { mes: string; periodo: string; ventas: number; costos: number; utilidad: number; margen: number | null; parcial: boolean };
export type GastoMonedaDato = { periodo: string; moneda: string; monto: number; montoPen: number };
export type FilaMoneda = { moneda: string; original: number; soles: number; porcentaje: number };

export function construirVentasPorMes(anio: number, registros: VentasSunatRegistroDto[], importe: OpcionesImporte) {
    const hoy = new Date();
    const periodoActual = `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, "0")}`;
    const porPeriodo = new Map<string, BarraMes>();
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
}

export function construirConcentracion(anio: number, registros: VentasSunatRegistroDto[], importe: OpcionesImporte) {
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
    const visibles = ordenados.slice(0, MAX_CLIENTES_VENTA);
    const resto = ordenados.slice(MAX_CLIENTES_VENTA);
    if (resto.length) visibles.push({ cliente: `Otros (${resto.length})`, venta: resto.reduce((s, c) => s + c.venta, 0) });
    return visibles.map((c) => ({ ...c, participacion: (c.venta / total) * 100 }));
}

export function construirCostosCliente(filas: CostoCliente[]) {
    const ordenadas = [...filas].filter((f) => f.costo > 0).sort((a, b) => b.costo - a.costo);
    const visibles: BarraCostoCliente[] = ordenadas.slice(0, MAX_CLIENTES).map((f) => ({ clave: f.clave, etiqueta: f.nombreCliente, nroDocumento: f.nroDocumento, costo: f.costo, conVenta: f.conVenta }));
    const resto = ordenadas.slice(MAX_CLIENTES);
    if (resto.length) visibles.push({ clave: "", etiqueta: `Otros (${resto.length})`, nroDocumento: "", costo: resto.reduce((s, f) => s + f.costo, 0), conVenta: null });
    return visibles;
}

export function construirRentabilidadCliente(filas: RentabilidadClienteDato[]): RentabilidadClienteDato[] {
    const relevantes = filas.filter((f) => f.ventas !== 0 || f.costos !== 0);
    // Los de mayor impacto (en valor absoluto) y luego ordenados de mejor a peor utilidad.
    return [...relevantes]
      .sort((a, b) => Math.abs(b.utilidad) - Math.abs(a.utilidad))
      .slice(0, MAX_CLIENTES)
      .sort((a, b) => b.utilidad - a.utilidad);
}

export function construirPuntosMensuales(anio: number, datos: RentabilidadMesDato[]): PuntoMensual[] {
  const hoy = new Date();
  const periodoActual = `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  return [...datos]
    .filter((d) => d.periodo.startsWith(String(anio)))
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .map((d) => ({
      mes: MESES[Number(d.periodo.slice(4)) - 1] ?? d.periodo,
      periodo: d.periodo,
      ventas: d.ventas,
      costos: d.costos,
      utilidad: d.ventas - d.costos,
      margen: d.ventas > 0 ? ((d.ventas - d.costos) / d.ventas) * 100 : null,
      parcial: d.periodo === periodoActual,
    }));
}

export function construirGastoPorMoneda(anio: number, gastos: GastoMonedaDato[]): FilaMoneda[] {
    const mapa = new Map<string, FilaMoneda>();
    for (const g of gastos) {
      if (!g.periodo.startsWith(String(anio))) continue;
      const f = mapa.get(g.moneda) ?? { moneda: g.moneda, original: 0, soles: 0, porcentaje: 0 };
      f.original += g.monto;
      f.soles += g.montoPen;
      mapa.set(g.moneda, f);
    }
    const lista = Array.from(mapa.values()).sort((a, b) => b.soles - a.soles);
    const total = lista.reduce((s, f) => s + f.soles, 0);
    return lista.map((f) => ({ ...f, porcentaje: total > 0 ? (f.soles / total) * 100 : 0 }));
}
