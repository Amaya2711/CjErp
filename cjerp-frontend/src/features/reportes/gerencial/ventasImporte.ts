import type { VentasSunatRegistroDto } from "../../../api/ventasSunatService";

/** Qué componentes del comprobante suman en el importe de ventas que muestra la pantalla. */
export type OpcionesImporte = { incluirIgv: boolean; incluirInafecto: boolean };

const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

// Los descuentos del SIRE (Dscto BI / Dscto IGV) vienen en negativo: se restan en valor absoluto.
export const afectoDe = (r: VentasSunatRegistroDto) => num(r.biGravada) - Math.abs(num(r.dsctoBi));
export const inafectoDe = (r: VentasSunatRegistroDto) => num(r.mtoInafecto);
export const igvDe = (r: VentasSunatRegistroDto) => num(r.igv) - Math.abs(num(r.dsctoIgv));

/** Importe de la venta = afecto (+ inafecto) (+ IGV), según las opciones elegidas. Ya viene en soles. */
export function importeVenta(r: VentasSunatRegistroDto, o: OpcionesImporte): number {
  return afectoDe(r) + (o.incluirInafecto ? inafectoDe(r) : 0) + (o.incluirIgv ? igvDe(r) : 0);
}

export function etiquetaImporte(o: OpcionesImporte): string {
  const base = o.incluirInafecto ? "afecto + inafecto" : "afecto";
  return o.incluirIgv ? `con IGV (${base} + IGV)` : `sin IGV (${base})`;
}

/** Cliente de la venta: el de la tabla Cliente y, si no hay, la razón social del comprobante. */
export const clienteDeVenta = (r: VentasSunatRegistroDto) => (r.nombreCliente || r.razonSocial || "Sin cliente").trim();
