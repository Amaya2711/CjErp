import { EMPRESA, cargarPdf, finTabla, marcaGeneracion, nombreArchivo, type AutoTable, type Doc } from "./responsablePdf";
import {
  analizarPorSitio,
  calcularKpis,
  mensajesClave,
  montoConSimbolo,
  responsablesAnalizados,
  type NivelMensaje,
  type OcAnalisis,
  type SitioAnalisis,
} from "./responsableAnalisis";
import type { EnlaceAnexo } from "./responsableAnexos";
import { formatFecha, formatMonto, formatPorcentaje, periodoConsultado, type FilaReporte, type FiltrosReporte } from "./responsableLogic";

type Rgb = [number, number, number];

// Paleta del diseño aprobado del informe.
const BLUE: Rgb = [31, 58, 95];
const BG: Rgb = [244, 246, 248];
const RED: Rgb = [198, 40, 40];
const DARK_RED: Rgb = [153, 27, 27];
const AMB: Rgb = [239, 143, 0];
const GRN: Rgb = [46, 125, 50];
const GRY: Rgb = [107, 114, 128];
const LINE: Rgb = [217, 222, 228];
const INK: Rgb = [31, 41, 51];
const WHITE: Rgb = [255, 255, 255];

const TITULO = "Informe Analítico de Órdenes de Compra, Gastos y Pagos";
const MARGEN = 15;
const ANCHO = 180;
const ALTO_PAGINA = 297;
const LIMITE_Y = ALTO_PAGINA - 17;

type ContextoIa = {
  filas: FilaReporte[];
  filtros: FiltrosReporte;
  criterio: string;
  /** OC cuyo PDF se anexará al informe (con su número de páginas) y OC cuyo PDF no se pudo descargar. */
  anexos?: Array<{ idOc: number; paginas: number }>;
  fallidas?: number[];
};

export type InformeGenerado = { buffer: ArrayBuffer; enlaces: EnlaceAnexo[]; nombre: string };

/** Contexto de enlaces: dónde está cada OC anexada y dónde se dibujó cada zona clicable. */
type ContextoEnlaces = { disponibles: Set<number>; enlaces: EnlaceAnexo[] };

const truncar = (texto: string, max: number) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);

function colorChip(etiqueta: string): Rgb {
  const e = etiqueta.toUpperCase();
  if (e === "URGENTE") return DARK_RED;
  if (["ALTO", "ALTA", "NO", "RECHAZADA", "SIN PAGO ROJO"].includes(e) || e.startsWith("VINCULAR")) return RED;
  if (["MEDIO", "MEDIA", "A VERIFICAR", "PAGO PARCIAL"].includes(e) || e.startsWith("EN ")) return AMB;
  if (["BAJO", "BAJA", "HECHO", "SÍ", "SI", "APROBADA", "PAGADO COMPLETO"].includes(e)) return GRN;
  if (e === "PAGADO EN EXCESO") return [124, 58, 237];
  return GRY;
}

/** Píldora de color con texto blanco; devuelve el ancho dibujado. */
function chip(doc: Doc, x: number, y: number, texto: string, color: Rgb, alto = 4.4, fuente = 6.3, anchoFijo?: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fuente);
  const ancho = anchoFijo ?? doc.getTextWidth(texto) + 4.5;
  doc.setFillColor(...color);
  doc.roundedRect(x, y, ancho, alto, alto / 2, alto / 2, "F");
  doc.setTextColor(...WHITE);
  doc.text(texto, x + ancho / 2, y + alto / 2 + fuente * 0.13, { align: "center" });
  doc.setTextColor(...INK);
  return ancho;
}

const ANCHO_PAISAJE = 267;
const ALTO_PAISAJE = 210;

class Pagina {
  y = 0;
  /** Primera página horizontal (todas las siguientes también lo son); 0 si no hay. */
  primeraPaisaje = 0;
  private ancho = ANCHO;
  private limiteY = LIMITE_Y;
  private readonly doc: Doc;
  private readonly cabecera: string;
  private readonly conCabecera = new Set<number>();

  constructor(doc: Doc, cabecera: string) {
    this.doc = doc;
    this.cabecera = cabecera;
  }

  nueva(orientacion: "portrait" | "landscape" = this.primeraPaisaje ? "landscape" : "portrait") {
    this.doc.addPage("a4", orientacion);
    if (orientacion === "landscape") {
      if (!this.primeraPaisaje) this.primeraPaisaje = this.doc.getNumberOfPages();
      this.ancho = ANCHO_PAISAJE;
      this.limiteY = ALTO_PAISAJE - 17;
    }
    this.dibujarCabecera();
    this.y = 17;
  }

  /** Dibuja la cabecera de la página actual una sola vez y sin que los textos se encimen. */
  dibujarCabecera() {
    const pagina = this.doc.getCurrentPageInfo().pageNumber;
    if (this.conCabecera.has(pagina)) return;
    this.conCabecera.add(pagina);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(7);
    this.doc.setTextColor(...GRY);
    const derecha = "Informe Analítico";
    const disponible = this.ancho - this.doc.getTextWidth(derecha) - 6;
    let izquierda = this.cabecera;
    while (izquierda.length > 4 && this.doc.getTextWidth(izquierda) > disponible) izquierda = `${izquierda.slice(0, -2)}…`;
    this.doc.text(izquierda, MARGEN, 10);
    this.doc.text(derecha, MARGEN + this.ancho, 10, { align: "right" });
    this.doc.setDrawColor(...LINE);
    this.doc.setLineWidth(0.3);
    this.doc.line(MARGEN, 12, MARGEN + this.ancho, 12);
    this.doc.setTextColor(...INK);
  }

  asegurar(alto: number) {
    if (this.y + alto > this.limiteY) this.nueva();
  }

  get anchoUtil() {
    return this.ancho;
  }

  titulo(texto: string, nota?: string) {
    this.asegurar(14);
    this.y += 4;
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(11);
    this.doc.setTextColor(...BLUE);
    this.doc.text(texto, MARGEN, this.y + 3);
    if (nota) {
      const anchoTexto = this.doc.getTextWidth(texto);
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(7.5);
      this.doc.setTextColor(...GRY);
      this.doc.text(`  ${nota}`, MARGEN + anchoTexto, this.y + 3);
    }
    this.doc.setTextColor(...INK);
    this.y += 7;
  }
}

function bandaTitulo(doc: Doc, y: number, lineas: string[]) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const envueltas = lineas.flatMap((l, i) => (doc.splitTextToSize(l, ANCHO - 12) as string[]).map((t) => ({ t, grande: i === 0 })));
  const alto = 15 + envueltas.length * 4.6;
  doc.setFillColor(...BLUE);
  doc.roundedRect(MARGEN, y, ANCHO, alto, 3, 3, "F");
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(TITULO, MARGEN + 6, y + 9);
  doc.setFont("helvetica", "normal");
  envueltas.forEach(({ t, grande }, i) => {
    doc.setFontSize(grande ? 9 : 8);
    doc.text(t, MARGEN + 6, y + 14.5 + i * 4.6);
  });
  doc.setTextColor(...INK);
  return y + alto;
}

function tarjetasKpi(doc: Doc, y: number, items: Array<{ etiqueta: string; valor: string; sub: string; color: Rgb }>) {
  const alto = 23;
  const gap = 3;
  const ancho = (ANCHO - gap * (items.length - 1)) / items.length;
  items.forEach((item, i) => {
    const x = MARGEN + i * (ancho + gap);
    doc.setFillColor(...BG);
    doc.roundedRect(x, y, ancho, alto, 2, 2, "F");
    doc.setFillColor(...item.color);
    doc.rect(x, y, 1.6, alto, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.3);
    doc.setTextColor(...GRY);
    doc.text(item.etiqueta, x + 4, y + 6);
    doc.setFontSize(14.5);
    doc.setTextColor(...item.color);
    doc.text(item.valor, x + 4, y + 13.5, { maxWidth: ancho - 5 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(...GRY);
    doc.text(truncar(item.sub, 34), x + 4, y + 20);
  });
  doc.setTextColor(...INK);
  return y + alto;
}

function filaMensaje(doc: Doc, y: number, nivel: NivelMensaje, titulo: string, detalle: string) {
  const alto = 11.5;
  const color = nivel === "INFO" ? GRY : colorChip(nivel);
  doc.setFillColor(...BG);
  doc.roundedRect(MARGEN, y, ANCHO, alto, 2, 2, "F");
  doc.setFillColor(...color);
  doc.circle(MARGEN + 6, y + alto / 2, 2.4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(truncar(titulo, 88), MARGEN + 12, y + 5.2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.3);
  doc.setTextColor(...GRY);
  doc.text(truncar(detalle, 120), MARGEN + 12, y + 9.4);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...color);
  doc.text(nivel, MARGEN + ANCHO - 4, y + 5.2, { align: "right" });
  doc.setTextColor(...INK);
  return y + alto;
}

function tarjetaOc(doc: Doc, y: number, oc: OcAnalisis, ancho: number) {
  const alto = 20;
  const colorAprobacion = colorChip(oc.estadoAprobacion);
  const rechazada = oc.estadoAprobacion === "RECHAZADA";
  doc.setFillColor(...WHITE);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGEN, y, ancho, alto, 2, 2, "FD");
  doc.setFillColor(...colorAprobacion);
  doc.rect(MARGEN, y, 1.6, alto, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BLUE);
  doc.text(`OC ${oc.idOc}`, MARGEN + 5, y + 6);
  const x = chip(doc, MARGEN + 26, y + 2.6, oc.estadoAprobacion, colorAprobacion);
  const colorPago = oc.estado === "SIN PAGO" ? (rechazada ? GRY : RED) : colorChip(oc.estado);
  chip(doc, MARGEN + 26 + x + 2, y + 2.6, oc.estado, colorPago);

  const lineas = oc.filas.split(",").filter((f) => f.trim()).length || 1;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.3);
  doc.setTextColor(...GRY);
  doc.text(truncar(`${oc.solicitante || "—"}  ·  F. ingreso ${formatFecha(oc.fechaOc) || "—"}  ·  ${lineas} línea(s) de detalle  ·  Filas ${oc.filas}`, 120), MARGEN + 5, y + 11.2);

  const pct = oc.monto > 0 ? Math.min(Math.max(oc.gasto / oc.monto, 0), 1) : 0;
  const bx = MARGEN + 5;
  const by = y + alto - 5.2;
  doc.setFillColor(...LINE);
  doc.roundedRect(bx, by, 100, 2.4, 1.2, 1.2, "F");
  if (pct > 0) {
    doc.setFillColor(...GRN);
    doc.roundedRect(bx, by, Math.max(100 * pct, 2.4), 2.4, 1.2, 1.2, "F");
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...GRY);
  doc.text(`${formatPorcentaje((oc.monto > 0 ? oc.gasto / oc.monto : 0) * 100)} pagado`, bx + 102.5, by + 2);

  const columnas: Array<[string, string, Rgb]> = [
    ["MONTO", formatMonto(oc.monto), INK],
    ["PAGADO", formatMonto(oc.gasto), GRN],
    ["SALDO", rechazada ? "n/a" : formatMonto(oc.saldo), rechazada ? GRY : AMB],
  ];
  [MARGEN + ancho - 44, MARGEN + ancho - 24, MARGEN + ancho - 4].forEach((xr, i) => {
    const [etiqueta, valor, color] = columnas[i];
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(...GRY);
    doc.text(etiqueta, xr, y + 6, { align: "right" });
    doc.setFontSize(8.3);
    doc.setTextColor(...color);
    doc.text(valor, xr, y + 11, { align: "right" });
  });
  doc.setTextColor(...INK);
  return y + alto;
}

type OpcionesTabla = { enlaceCol?: number; enlaces?: EnlaceAnexo[]; chipCols?: number[]; derecha?: number[]; anchos?: Record<number, number>; fontSize?: number; filaTotal?: boolean; rojoCol?: number };

function columnasTabla(opciones: OpcionesTabla) {
  const estilos: Record<number, { halign?: "right"; cellWidth?: number }> = {};
  (opciones.derecha ?? []).forEach((i) => {
    estilos[i] = { ...estilos[i], halign: "right" };
  });
  Object.entries(opciones.anchos ?? {}).forEach(([i, ancho]) => {
    estilos[Number(i)] = { ...estilos[Number(i)], cellWidth: ancho };
  });
  return estilos;
}

/** Tabla con el estilo del informe: cabecera azul, filas alternas y píldoras de color en las columnas indicadas. */
function tabla(doc: Doc, autoTable: AutoTable, pagina: Pagina, head: string[], body: string[][], opciones: OpcionesTabla = {}) {
  const chipCols = opciones.chipCols ?? [];
  autoTable(doc, {
    startY: pagina.y,
    head: [head],
    body,
    styles: { fontSize: opciones.fontSize ?? 8, cellPadding: 2, textColor: INK, lineColor: LINE, lineWidth: 0, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: BLUE, textColor: 255, fontSize: 7, fontStyle: "bold" },
    alternateRowStyles: { fillColor: BG },
    columnStyles: columnasTabla(opciones),
    margin: { left: MARGEN, right: MARGEN, top: 17, bottom: 17 },
    didDrawPage: () => pagina.dibujarCabecera(),
    // Sin saltos de línea dentro de las celdas de totales: el ancho de columna ya contempla el texto.
    didParseCell: (data: { section: string; column: { index: number }; row: { index: number }; cell: { raw: unknown; text: string[]; styles: { fontStyle?: string; fillColor?: unknown; textColor?: unknown } } }) => {
      if (data.section !== "body") return;
      if (chipCols.includes(data.column.index)) {
        data.cell.text = [];
      }
      if (opciones.filaTotal) {
        const etiquetas = (body[data.row.index] ?? []).slice(0, 2).map((c) => String(c));
        if (etiquetas.some((c) => c.startsWith("SUBTOTAL"))) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [226, 232, 240];
        } else if (etiquetas.some((c) => c.startsWith("TOTAL"))) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [203, 213, 225];
        }
      }
      if (opciones.enlaceCol === data.column.index && String(data.cell.raw).startsWith("Abrir")) {
        data.cell.styles.textColor = [26, 90, 190];
        data.cell.styles.fontStyle = "bold";
      }
      if (opciones.rojoCol === data.column.index && String(data.cell.raw).startsWith("RECHAZADA")) {
        data.cell.styles.textColor = RED;
        data.cell.styles.fontStyle = "bold";
      }
    },
    didDrawCell: (data: { section: string; column: { index: number }; row: { index: number }; cell: { raw: unknown; x: number; y: number; width: number; height: number } }) => {
      if (data.section === "body" && opciones.enlaces && opciones.enlaceCol === data.column.index && String(data.cell.raw).startsWith("Abrir")) {
        const idOc = Number(body[data.row.index]?.[0]);
        if (Number.isFinite(idOc)) {
          opciones.enlaces.push({ pagina: doc.getCurrentPageInfo().pageNumber, x: data.cell.x, y: data.cell.y, ancho: data.cell.width, alto: data.cell.height, idOc });
        }
      }
      if (data.section !== "body" || !chipCols.includes(data.column.index)) return;
      const etiqueta = String(data.cell.raw ?? "").trim();
      if (!etiqueta) return;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.3);
      const ancho = Math.min(doc.getTextWidth(etiqueta) + 4.5, data.cell.width - 1);
      chip(doc, data.cell.x + 1, data.cell.y + (data.cell.height - 4.4) / 2, etiqueta, colorChip(etiqueta), 4.4, 6.3, Math.max(ancho, 10));
    },
  });
  pagina.y = finTabla(doc, 3);
}

function vacio(doc: Doc, pagina: Pagina, texto: string) {
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRY);
  doc.text(texto, MARGEN + 2, pagina.y + 3);
  doc.setTextColor(...INK);
  pagina.y += 8;
}

type Subtotal = { moneda: string; ocs: number; vigente: number; pagadoConOc: number; saldo: number; pagosSinOc: number; pagadoSinOc: number };

/** Subtotal de un sitio por moneda. Las OC rechazadas no cuentan en el monto vigente ni en el saldo. */
function subtotalesDeSitio(sitio: SitioAnalisis): Subtotal[] {
  const porMoneda = new Map<string, Subtotal>();
  const obtener = (moneda: string) => {
    const clave = moneda || "—";
    let sub = porMoneda.get(clave);
    if (!sub) {
      sub = { moneda: clave, ocs: 0, vigente: 0, pagadoConOc: 0, saldo: 0, pagosSinOc: 0, pagadoSinOc: 0 };
      porMoneda.set(clave, sub);
    }
    return sub;
  };
  sitio.ocs.forEach((oc) => {
    const sub = obtener(oc.moneda);
    sub.ocs += 1;
    sub.pagadoConOc += oc.gasto;
    if (oc.estadoAprobacion !== "RECHAZADA") {
      sub.vigente += oc.monto;
      sub.saldo += Math.max(oc.saldo, 0);
    }
  });
  sitio.pagos
    .filter((p) => p.idOc === null)
    .forEach((p) => {
      const sub = obtener(p.moneda);
      sub.pagosSinOc += 1;
      sub.pagadoSinOc += p.monto;
    });
  return Array.from(porMoneda.values()).sort((a, b) => a.moneda.localeCompare(b.moneda, "es"));
}

const HEAD_SUBTOTAL = ["MONEDA", "OCs", "MONTO OC VIGENTE", "PAGADO CON OC", "SALDO PENDIENTE", "PAGOS SIN OC", "PAGADO SIN OC"];
const filaSubtotal = (sub: Subtotal) => [
  sub.moneda,
  String(sub.ocs),
  montoConSimbolo(sub.vigente, sub.moneda),
  montoConSimbolo(sub.pagadoConOc, sub.moneda),
  montoConSimbolo(sub.saldo, sub.moneda),
  String(sub.pagosSinOc),
  montoConSimbolo(sub.pagadoSinOc, sub.moneda),
];

/** Tabla consolidada: una fila por sitio y moneda, y total general por moneda. */
function tablaSubtotalesPorSitio(doc: Doc, autoTable: AutoTable, pagina: Pagina, sitios: SitioAnalisis[]) {
  const filas: string[][] = [];
  const general = new Map<string, Subtotal>();
  sitios.forEach((sitio) => {
    subtotalesDeSitio(sitio).forEach((sub) => {
      filas.push([sitio.etiqueta, ...filaSubtotal(sub)]);
      const total = general.get(sub.moneda) ?? { moneda: sub.moneda, ocs: 0, vigente: 0, pagadoConOc: 0, saldo: 0, pagosSinOc: 0, pagadoSinOc: 0 };
      total.ocs += sub.ocs;
      total.vigente += sub.vigente;
      total.pagadoConOc += sub.pagadoConOc;
      total.saldo += sub.saldo;
      total.pagosSinOc += sub.pagosSinOc;
      total.pagadoSinOc += sub.pagadoSinOc;
      general.set(sub.moneda, total);
    });
  });
  Array.from(general.values())
    .sort((a, b) => a.moneda.localeCompare(b.moneda, "es"))
    .forEach((total) => filas.push([`TOTAL GENERAL`, ...filaSubtotal(total)]));
  pagina.titulo("Subtotal por sitio y moneda");
  tabla(doc, autoTable, pagina, ["SITIO", ...HEAD_SUBTOTAL], filas, {
    fontSize: 7,
    filaTotal: true,
    derecha: [2, 3, 4, 5, 6, 7],
  });
}

/** Subtotal del sitio (se imprime al terminar las OC de cada sitio cuando hay más de uno). */
function bloqueSubtotalSitio(doc: Doc, autoTable: AutoTable, pagina: Pagina, sitio: SitioAnalisis) {
  pagina.asegurar(34);
  subtituloSeccion(doc, pagina, `Subtotal del sitio ${sitio.etiqueta}, por moneda`);
  tabla(doc, autoTable, pagina, HEAD_SUBTOTAL, subtotalesDeSitio(sitio).map(filaSubtotal), {
    fontSize: 7.5,
    derecha: [1, 2, 3, 4, 5, 6],
  });
}

/** Totales del resumen de OC, uno por moneda (nunca se suman monedas distintas). */
function totalesResumenOc(ocs: OcAnalisis[]) {
  const porMoneda = new Map<string, { moneda: string; monto: number; gasto: number; saldo: number }>();
  ocs.forEach((oc) => {
    const t = porMoneda.get(oc.moneda) ?? { moneda: oc.moneda, monto: 0, gasto: 0, saldo: 0 };
    t.monto += oc.monto;
    t.gasto += oc.gasto;
    t.saldo += oc.saldo;
    porMoneda.set(oc.moneda, t);
  });
  return Array.from(porMoneda.values()).sort((a, b) => a.moneda.localeCompare(b.moneda, "es"));
}

function filaMontos(t: { moneda: string; monto: number; gasto: number; saldo: number }) {
  return [
    montoConSimbolo(t.monto, t.moneda),
    montoConSimbolo(t.gasto, t.moneda),
    montoConSimbolo(t.saldo, t.moneda),
    formatPorcentaje(t.monto > 0 ? (t.gasto / t.monto) * 100 : 0),
  ];
}

/** Filas del "Resumen de OC": detalle, subtotal por sitio y moneda (solo con varios sitios) y total general por moneda. */
function filasResumenOc(lista: Array<{ sitio: SitioAnalisis; oc: OcAnalisis }>, multiSitio: boolean): string[][] {
  const filas: string[][] = [];
  const grupos = new Map<string, Array<{ sitio: SitioAnalisis; oc: OcAnalisis }>>();
  lista.forEach((item) => grupos.set(item.sitio.clave, [...(grupos.get(item.sitio.clave) ?? []), item]));

  grupos.forEach((items) => {
    items.forEach(({ sitio, oc }) => {
      filas.push([...(multiSitio ? [sitio.etiqueta] : []), String(oc.idOc), oc.estadoAprobacion, oc.estado, ...filaMontos({ moneda: oc.moneda, monto: oc.monto, gasto: oc.gasto, saldo: oc.saldo })]);
    });
    if (multiSitio) {
      totalesResumenOc(items.map(({ oc }) => oc)).forEach((t) => {
        filas.push([items[0].sitio.etiqueta, `SUBTOTAL ${t.moneda}`, "", "", ...filaMontos(t)]);
      });
    }
  });

  totalesResumenOc(lista.map(({ oc }) => oc)).forEach((t) => {
    filas.push(multiSitio ? ["", `TOTAL ${t.moneda}`, "", "", ...filaMontos(t)] : [`TOTAL ${t.moneda}`, "", "", ...filaMontos(t)]);
  });
  return filas;
}

function subtituloSeccion(doc: Doc, pagina: Pagina, texto: string, color: Rgb = BLUE) {
  pagina.asegurar(10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...color);
  doc.text(texto, MARGEN, pagina.y + 3);
  doc.setTextColor(...INK);
  pagina.y += 5.5;
}

/** Una OC completa: encabezado, detalle íntegro, aprobadores y, debajo, solo los pagos asociados a esa OC. */
function bloqueOc(doc: Doc, autoTable: AutoTable, pagina: Pagina, sitio: SitioAnalisis, oc: OcAnalisis, mostrarSitio: boolean, anexos: ContextoEnlaces) {
  pagina.asegurar(mostrarSitio ? 52 : 46);
  if (mostrarSitio) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...GRY);
    doc.text(`Sitio ${sitio.etiqueta}${sitio.cliente ? ` · ${sitio.cliente}` : ""}`, MARGEN, pagina.y + 3);
    doc.setTextColor(...INK);
    pagina.y += 5;
  }
  pagina.y = tarjetaOc(doc, pagina.y, oc, pagina.anchoUtil) + 3;

  // Detalle completo de la OC (cada línea de DetOrdenCompra, sin recortar).
  if (anexos.disponibles.has(oc.idOc)) {
    const etiqueta = "Ver PDF de la OC (anexo)";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(26, 90, 190);
    const ancho = doc.getTextWidth(etiqueta);
    const xEtiqueta = MARGEN + pagina.anchoUtil - ancho;
    doc.text(etiqueta, xEtiqueta, pagina.y + 3.4);
    doc.setDrawColor(26, 90, 190);
    doc.setLineWidth(0.2);
    doc.line(xEtiqueta, pagina.y + 4, xEtiqueta + ancho, pagina.y + 4);
    doc.setTextColor(...INK);
    anexos.enlaces.push({ pagina: doc.getCurrentPageInfo().pageNumber, x: xEtiqueta, y: pagina.y, ancho, alto: 5, idOc: oc.idOc });
  }
  subtituloSeccion(doc, pagina, "Detalle de la OC", GRY);
  const entradas = (oc.detalle || "—").split(" | ").map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.setTextColor(...INK);
  entradas.forEach((entrada, i) => {
    const partes = doc.splitTextToSize(`${entradas.length > 1 ? `${i + 1}. ` : ""}${entrada}`, pagina.anchoUtil - 8) as string[];
    partes.forEach((linea) => {
      pagina.asegurar(5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.8);
      doc.setTextColor(...INK);
      doc.text(linea, MARGEN + 3, pagina.y + 3);
      pagina.y += 3.8;
    });
  });
  pagina.y += 1.5;

  const aprobadores = oc.aprobadores.map((a) => `${a.nombre}${a.fecha ? ` (${formatFecha(a.fecha)})` : ""}`).join("   ·   ");
  const textoAprobacion =
    oc.estadoAprobacion === "RECHAZADA"
      ? `RECHAZADA${aprobadores ? `. Aprobadores previos: ${aprobadores}` : " - sin aprobadores"}`
      : `${oc.estadoAprobacion === "APROBADA" ? "Aprobada por" : `${oc.estadoAprobacion}. Aprobadores registrados:`} ${aprobadores || "—"}`;
  const lineasAprobacion = doc.splitTextToSize(`Aprobación: ${textoAprobacion}`, pagina.anchoUtil - 8) as string[];
  lineasAprobacion.forEach((linea) => {
    pagina.asegurar(5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.setTextColor(...(oc.estadoAprobacion === "RECHAZADA" ? RED : GRY));
    doc.text(linea, MARGEN + 3, pagina.y + 3);
    pagina.y += 3.8;
  });
  doc.setTextColor(...INK);
  pagina.y += 2;

  // Pagos asociados solo a esta OC.
  const pagos = sitio.pagos.filter((p) => p.idOc === oc.idOc);
  subtituloSeccion(doc, pagina, `Pagos asociados a la OC ${oc.idOc}`);
  if (pagos.length === 0) {
    vacio(doc, pagina, "Esta OC no tiene pagos asociados.");
  } else {
    const total = pagos.reduce((t, p) => t + p.monto, 0);
    tabla(
      doc,
      autoTable,
      pagina,
      ["PAGO", "FILA", "F. INGRESO", "F. DEPÓSITO", "SERIE", "NRO. OPERACIÓN", "SOLICITANTE", "RESPONSABLE", "PLANILLA.DETALLE", "MONTO"],
      [
        ...pagos.map((p) => [
          String(p.correlativo),
          p.fila === null ? "—" : String(p.fila),
          formatFecha(p.fechaIngreso) || "—",
          formatFecha(p.fechaDeposito) || "—",
          p.serie || "—",
          p.nroOperacion || "—",
          p.solicitante || "—",
          p.responsable || "—",
          (p.detalle || "—").replace(/\s+/g, " "),
          montoConSimbolo(p.monto, p.moneda),
        ]),
        ["TOTAL", "", "", "", "", "", "", "", "", montoConSimbolo(total, pagos[0].moneda)],
      ],
      {
        fontSize: 7,
        derecha: [9],
        filaTotal: true,
        anchos: { 0: 18, 1: 12, 2: 22, 3: 24, 4: 19, 5: 27, 6: 30, 7: 34, 9: 28 },
      },
    );
  }
  pagina.y += 4;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(MARGEN, pagina.y, MARGEN + pagina.anchoUtil, pagina.y);
  pagina.y += 4;
}

/** PDF analítico con el diseño aprobado: KPIs, lo más importante, estado de las OC, pagos sin OC, línea de tiempo, análisis y anexos. */
export async function generarInformePdf(ctx: ContextoIa): Promise<InformeGenerado> {
  const { doc, autoTable } = await cargarPdf("portrait");
  const anexosOc = new Map((ctx.anexos ?? []).map((a) => [a.idOc, a.paginas]));
  const contextoEnlaces: ContextoEnlaces = { disponibles: new Set(anexosOc.keys()), enlaces: [] };
  const sitios = analizarPorSitio(ctx.filas);
  const responsables = responsablesAnalizados(ctx.filas);
  const kpis = calcularKpis(sitios);
  const periodo = periodoConsultado(ctx.filas, ctx.filtros);
  const unSitio = sitios.length === 1 ? sitios[0] : null;
  const nombresResponsables = responsables.map((r) => r.nombre).join(" · ") || ctx.criterio;
  const multiSitio = sitios.length > 1;

  const cabecera = `${truncar(nombresResponsables, 70)}  ·  ${unSitio ? truncar(unSitio.etiqueta, 40) : `${sitios.length} sitios`}`;
  const pagina = new Pagina(doc, cabecera);

  // ---- Página 1: banda, KPIs, lo más importante, estado de las OC
  const lineasBanda = [
    unSitio ? `Sitio ${unSitio.etiqueta}${unSitio.cliente ? `  ·  Cliente ${unSitio.cliente}` : ""}${unSitio.proyecto ? `  ·  Proyecto ${unSitio.proyecto}` : ""}` : `${sitios.length} sitios analizados`,
    ...(responsables.length > 0
      ? responsables.map((r, i) => `${i === 0 ? (responsables.length > 1 ? "Responsables: " : "Responsable: ") : "                 "}${r.nombre}${r.documento ? ` · RUC/Doc ${r.documento}` : ""}`)
      : [`Responsable: ${ctx.criterio}`]),
    `${periodo}  ·  Generado: ${marcaGeneracion()}`,
  ];
  pagina.y = bandaTitulo(
    doc,
    17,
    lineasBanda,
  );
  pagina.y += 4;

  const simbolo = kpis.simbolo ? `${kpis.simbolo}` : kpis.moneda;
  pagina.y = tarjetasKpi(doc, pagina.y, [
    { etiqueta: `MONTO OC VIGENTE (${simbolo})`, valor: formatMonto(kpis.montoVigente), sub: `${kpis.ocsAprobadas} OC aprobadas · ${kpis.ocsVigentes} vigentes`, color: BLUE },
    { etiqueta: `PAGADO CON OC (${simbolo})`, valor: formatMonto(kpis.pagadoConOc), sub: `${kpis.pagosConOc} pago(s)`, color: GRN },
    { etiqueta: `SALDO PENDIENTE (${simbolo})`, valor: formatMonto(kpis.saldoPendiente), sub: "sobre OC vigentes", color: AMB },
    { etiqueta: `PAGADO SIN OC (${simbolo})`, valor: formatMonto(kpis.pagadoSinOc), sub: `${kpis.pagosSinOc} pago(s) sin vincular`, color: RED },
    { etiqueta: "% EJECUCIÓN", valor: formatPorcentaje(kpis.ejecucion), sub: "pagado con OC / vigente", color: BLUE },
  ]);
  if (kpis.otrasMonedas.length > 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(...GRY);
    doc.text(`Indicadores en ${kpis.moneda}. También hay datos en ${kpis.otrasMonedas.join(", ")} (ver tablas y anexos); no se convierten monedas.`, MARGEN, pagina.y + 4);
    doc.setTextColor(...INK);
    pagina.y += 6;
  }

  pagina.titulo("Lo más importante");
  const mensajes = mensajesClave(sitios, responsables[0]?.nombre ?? ctx.criterio).slice(0, 5);
  if (mensajes.length === 0) vacio(doc, pagina, "Sin hallazgos relevantes con los datos consultados.");
  mensajes.forEach((m) => {
    pagina.asegurar(14);
    pagina.y = filaMensaje(doc, pagina.y, m.nivel, m.titulo, m.detalle) + 2;
  });

  const totalOcs = sitios.reduce((t, s) => t + s.ocs.length, 0);
  const totalLineas = sitios.reduce((t, s) => t + s.ocs.reduce((n, o) => n + (o.filas.split(",").filter((f) => f.trim()).length || 1), 0), 0);
  pagina.titulo("Resumen de OC", `(${totalOcs} OC · ${totalLineas} líneas de detalle)`);
  const listaOcs = sitios
    .flatMap((sitio) => sitio.ocs.map((oc) => ({ sitio, oc })))
    .sort((a, b) => a.sitio.etiqueta.localeCompare(b.sitio.etiqueta, "es") || a.oc.idOc - b.oc.idOc);
  if (listaOcs.length === 0) {
    vacio(doc, pagina, "No hay OC en el resultado.");
  } else {
    const o = multiSitio ? 1 : 0;
    tabla(
      doc,
      autoTable,
      pagina,
      [...(multiSitio ? ["SITIO"] : []), "OC", "APROBACIÓN", "ESTADO DE PAGO", "MONTO", "PAGADO", "SALDO", "% PAGADO"],
      filasResumenOc(listaOcs, multiSitio),
      { chipCols: [o + 1, o + 2], derecha: [o + 3, o + 4, o + 5, o + 6], anchos: { [o + 1]: 26, [o + 2]: 32 }, fontSize: o ? 7 : 7.5, filaTotal: true },
    );
  }

  if (multiSitio) tablaSubtotalesPorSitio(doc, autoTable, pagina, sitios);

  // ---- Detalle por OC (hoja horizontal): cada OC con su detalle completo y sus pagos asociados
  pagina.nueva("landscape");
  pagina.titulo("Detalle por OC y pagos asociados");
  if (listaOcs.length === 0) vacio(doc, pagina, "No hay OC en el resultado.");
  listaOcs.forEach(({ sitio, oc }, indice) => {
    // Cada OC empieza en una página nueva para que su detalle y sus pagos no se mezclen con otra OC.
    if (indice > 0) pagina.nueva();
    const mostrar = multiSitio;
    bloqueOc(doc, autoTable, pagina, sitio, oc, mostrar, contextoEnlaces);
    const siguiente = listaOcs[indice + 1];
    if (multiSitio && (!siguiente || siguiente.sitio.clave !== sitio.clave)) bloqueSubtotalSitio(doc, autoTable, pagina, sitio);
  });

  // ---- Pagos sin OC
  pagina.nueva();
    const pagosSinOc = sitios.flatMap((s) => s.pagos.filter((p) => p.idOc === null).map((p) => ({ s, p })));
  pagina.titulo("Pagos sin OC asociada");
  if (pagosSinOc.length === 0) {
    vacio(doc, pagina, "No hay pagos sin OC asociada.");
  } else {
    const totalesSinOc = new Map<string, number>();
    pagosSinOc.forEach(({ p }) => totalesSinOc.set(p.moneda, (totalesSinOc.get(p.moneda) ?? 0) + p.monto));
    tabla(
      doc,
      autoTable,
      pagina,
      [...(multiSitio ? ["SITIO"] : []), "PAGO", "F. DEPÓSITO", "SERIE", "NRO. OPERACIÓN", "SOLICITANTE", "RESPONSABLE", "PLANILLA.DETALLE", "MONTO", "ACCIÓN SUGERIDA"],
      [
        ...pagosSinOc.map(({ s, p }) => [
          ...(multiSitio ? [s.etiqueta] : []),
          String(p.correlativo),
          formatFecha(p.fechaDeposito) || "—",
          p.serie || "—",
          p.nroOperacion || "—",
          p.solicitante || "—",
          p.responsable || "—",
          (p.detalle || "—").replace(/\s+/g, " "),
          montoConSimbolo(p.monto, p.moneda),
          "VINCULAR A OC O JUSTIFICAR",
        ]),
        ...Array.from(totalesSinOc, ([moneda, total]) => [...(multiSitio ? [""] : []), "TOTAL", "", "", "", "", "", "", montoConSimbolo(total, moneda), ""]),
      ],
      {
        chipCols: [multiSitio ? 9 : 8],
        derecha: [multiSitio ? 8 : 7],
        anchos: {
          ...(multiSitio ? ({ 0: 26 } as Record<number, number>) : {}),
          [multiSitio ? 1 : 0]: 16,
          [multiSitio ? 2 : 1]: 22,
          [multiSitio ? 3 : 2]: 18,
          [multiSitio ? 4 : 3]: 25,
          [multiSitio ? 5 : 4]: 30,
          [multiSitio ? 6 : 5]: 32,
          [multiSitio ? 8 : 7]: 26,
          [multiSitio ? 9 : 8]: 42,
        },
      },
    );
  }

  // ---- Anexo: índice de los PDF de las OC (el contenido de cada PDF se agrega al unir el archivo)
  if (ctx.anexos !== undefined && (listaOcs.length > 0)) {
    pagina.nueva();
    pagina.titulo("Anexo · PDF de las OC", "(clic en 'Abrir PDF' para ir al documento)");
    const sinPdf = new Set(ctx.fallidas ?? []);
    let siguientePagina = doc.getNumberOfPages() + 1;
    const filasAnexo = listaOcs.map(({ sitio, oc }) => {
      const paginas = anexosOc.get(oc.idOc);
      let ubicacion = "No disponible";
      let enlace = sinPdf.has(oc.idOc) ? "No se pudo descargar" : "—";
      if (paginas !== undefined) {
        ubicacion = paginas === 1 ? `Pág. ${siguientePagina}` : `Págs. ${siguientePagina}–${siguientePagina + paginas - 1}`;
        siguientePagina += paginas;
        enlace = "Abrir PDF";
      }
      return [String(oc.idOc), sitio.etiqueta, oc.estadoAprobacion, ubicacion, enlace];
    });
    tabla(doc, autoTable, pagina, ["OC", "SITIO", "APROBACIÓN", "UBICACIÓN EN ESTE ARCHIVO", "PDF"], filasAnexo, {
      fontSize: 8,
      enlaceCol: 4,
      enlaces: contextoEnlaces.enlaces,
      chipCols: [2],
      anchos: { 0: 24, 1: 70, 2: 36, 3: 50 },
    });
  }

  // Numeración de páginas y pie
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    const horizontal = pagina.primeraPaisaje > 0 && i >= pagina.primeraPaisaje;
    const anchoPie = horizontal ? ANCHO_PAISAJE : ANCHO;
    const altoPie = horizontal ? ALTO_PAISAJE : ALTO_PAGINA;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(MARGEN, altoPie - 13, MARGEN + anchoPie, altoPie - 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GRY);
    doc.text(`${EMPRESA}  ·  Informe Analítico de OC, Gastos y Pagos`, MARGEN, altoPie - 8.5);
    doc.text(`Página ${i} de ${total}`, MARGEN + anchoPie, altoPie - 8.5, { align: "right" });
  }

  return { buffer: doc.output("arraybuffer"), enlaces: contextoEnlaces.enlaces, nombre: nombreArchivo("Informe_Analitico_OC") };
}

/** Descarga el informe sin anexos. */
export async function exportarPdfIa(ctx: ContextoIa) {
  const informe = await generarInformePdf(ctx);
  const url = URL.createObjectURL(new Blob([informe.buffer], { type: "application/pdf" }));
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = informe.nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}
