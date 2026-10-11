import { EMPRESA, cargarPdf, finTabla, marcaGeneracion, nombreArchivo, type AutoTable, type Doc } from "./responsablePdf";
import {
  analizarPorSitio,
  calcularKpis,
  mensajesClave,
  montoConSimbolo,
  responsablesAnalizados,
  type AnalisisEstructurado,
  type NivelMensaje,
  type OcAnalisis,
  type PagoAnalisis,
  type SitioAnalisis,
} from "./responsableAnalisis";
import { fechaClave, formatFecha, formatMonto, formatPorcentaje, periodoConsultado, type FilaReporte, type FiltrosReporte } from "./responsableLogic";

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
const MAX_TARJETAS_OC = 40;
const MAX_EVENTOS_LINEA = 18;

type ContextoIa = {
  filas: FilaReporte[];
  filtros: FiltrosReporte;
  criterio: string;
  analisis: AnalisisEstructurado;
  /** true si lo redactó la IA; false si es el análisis automático de respaldo. */
  generadoPorIa: boolean;
};

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

function nivelDe(texto: string): string {
  const t = texto.toUpperCase();
  if (t === "ALTA") return "ALTO";
  if (t === "MEDIA") return "MEDIO";
  if (t === "BAJA") return "BAJO";
  return t;
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

class Pagina {
  y = 0;
  private readonly doc: Doc;
  private readonly cabecera: string;

  constructor(doc: Doc, cabecera: string) {
    this.doc = doc;
    this.cabecera = cabecera;
  }

  nueva() {
    this.doc.addPage();
    this.dibujarCabecera();
    this.y = 17;
  }

  dibujarCabecera() {
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(7);
    this.doc.setTextColor(...GRY);
    this.doc.text(this.cabecera, MARGEN, 10);
    this.doc.text("Informe Analítico con IA", MARGEN + ANCHO, 10, { align: "right" });
    this.doc.setDrawColor(...LINE);
    this.doc.setLineWidth(0.3);
    this.doc.line(MARGEN, 12, MARGEN + ANCHO, 12);
    this.doc.setTextColor(...INK);
  }

  asegurar(alto: number) {
    if (this.y + alto > LIMITE_Y) this.nueva();
  }

  titulo(texto: string, nota?: string) {
    this.asegurar(14);
    this.y += 4;
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(11);
    this.doc.setTextColor(...BLUE);
    this.doc.text(texto, MARGEN, this.y + 3);
    if (nota) {
      const ancho = this.doc.getTextWidth(texto);
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(7.5);
      this.doc.setTextColor(...GRY);
      this.doc.text(`  ${nota}`, MARGEN + ancho, this.y + 3);
    }
    this.doc.setTextColor(...INK);
    this.y += 7;
  }
}

function bandaTitulo(doc: Doc, y: number, lineas: string[], nota: string) {
  const alto = 30;
  doc.setFillColor(...BLUE);
  doc.roundedRect(MARGEN, y, ANCHO, alto, 3, 3, "F");
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(TITULO, MARGEN + 6, y + 9);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(truncar(lineas[0] ?? "", 110), MARGEN + 6, y + 14.5);
  doc.setFontSize(8);
  doc.text(truncar(lineas[1] ?? "", 125), MARGEN + 6, y + 20);
  doc.text(truncar(lineas[2] ?? "", 125), MARGEN + 6, y + 24.5);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.text(nota, MARGEN + ANCHO - 5, y + alto - 3, { align: "right" });
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

function tarjetaOc(doc: Doc, y: number, oc: OcAnalisis) {
  const alto = 26;
  const colorAprobacion = colorChip(oc.estadoAprobacion);
  const rechazada = oc.estadoAprobacion === "RECHAZADA";
  doc.setFillColor(...WHITE);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGEN, y, ANCHO, alto, 2, 2, "FD");
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
  doc.text(truncar(`${oc.solicitante || "—"}  ·  ${formatFecha(oc.fechaOc) || "—"}  ·  ${lineas} línea(s) de detalle`, 80), MARGEN + 5, y + 11.2);
  doc.setFontSize(7.6);
  doc.setTextColor(...INK);
  doc.text(truncar((oc.detalle || "—").replace(/\s+/g, " "), 92), MARGEN + 5, y + 16);

  const pct = oc.monto > 0 ? Math.min(Math.max(oc.gasto / oc.monto, 0), 1) : 0;
  const bx = MARGEN + 5;
  const by = y + alto - 6.2;
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
  [MARGEN + ANCHO - 44, MARGEN + ANCHO - 24, MARGEN + ANCHO - 4].forEach((xr, i) => {
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

type EventoLinea = { fecha: string; texto: string; color: Rgb; arriba: boolean };

function eventosLinea(sitios: SitioAnalisis[]): EventoLinea[] {
  const eventos: EventoLinea[] = [];
  sitios.forEach((sitio) => {
    sitio.ocs.forEach((oc) => {
      const emision = fechaClave(oc.fechaOc);
      const aprobacion = fechaClave([...oc.aprobadores].reverse().find((a) => a.fecha)?.fecha ?? "");
      if (!emision) return;
      if (oc.estadoAprobacion === "RECHAZADA") {
        eventos.push({ fecha: emision, texto: `OC ${oc.idOc} rechazada`, color: RED, arriba: true });
      } else if (oc.estadoAprobacion === "APROBADA" && aprobacion && aprobacion !== emision) {
        eventos.push({ fecha: emision, texto: `OC ${oc.idOc} emitida`, color: BLUE, arriba: true });
        eventos.push({ fecha: aprobacion, texto: `OC ${oc.idOc} aprobada (3/3)`, color: GRN, arriba: true });
      } else {
        eventos.push({ fecha: emision, texto: `OC ${oc.idOc} emitida${oc.estadoAprobacion === "APROBADA" ? " y aprobada" : ""}`, color: BLUE, arriba: true });
      }
    });
    sitio.pagos.forEach((pago) => {
      const deposito = fechaClave(pago.fechaDeposito);
      if (!deposito) return;
      eventos.push(
        pago.idOc === null
          ? { fecha: deposito, texto: `Pago ${pago.correlativo} sin OC · ${montoConSimbolo(pago.monto, pago.moneda)}`, color: RED, arriba: false }
          : {
              fecha: deposito,
              texto: `Pago ${pago.correlativo} · ${montoConSimbolo(pago.monto, pago.moneda)}${pago.diasOcDeposito !== null ? ` (${pago.diasOcDeposito} días desde OC)` : ""}`,
              color: GRN,
              arriba: false,
            },
      );
    });
  });
  eventos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (eventos.length <= MAX_EVENTOS_LINEA) return eventos;
  // Con muchos hechos se priorizan rechazos y pagos; el resto queda en las tablas.
  return eventos.filter((e) => e.color !== BLUE).slice(0, MAX_EVENTOS_LINEA);
}

function lineaDeTiempo(doc: Doc, y: number, eventos: EventoLinea[]) {
  const alto = 60;
  if (eventos.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...GRY);
    doc.text("Sin fechas para construir la línea de tiempo.", MARGEN + 2, y + 5);
    doc.setTextColor(...INK);
    return y + 10;
  }
  const dias = (clave: string) => Date.parse(`${clave}T00:00:00Z`) / 86_400_000;
  const d0 = dias(eventos[0].fecha);
  const d1 = Math.max(dias(eventos[eventos.length - 1].fecha), d0 + 1);
  const x0 = MARGEN + 8;
  const x1 = MARGEN + ANCHO - 8;
  const ay = y + alto / 2 - 3;
  const px = (clave: string) => x0 + ((dias(clave) - d0) / (d1 - d0)) * (x1 - x0);

  doc.setDrawColor(...GRY);
  doc.setLineWidth(1);
  doc.line(x0, ay, x1, ay);

  // Marcas de mes
  const inicio = new Date(d0 * 86_400_000);
  const fin = new Date(d1 * 86_400_000);
  const paso = (d1 - d0) / 30 > 14 ? 3 : 1;
  let marca = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 1));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  while (marca <= fin) {
    const clave = marca.toISOString().slice(0, 10);
    const x = px(clave);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.4);
    doc.line(x, ay - 2, x, ay + 2);
    doc.setTextColor(...GRY);
    doc.text(`01/${String(marca.getUTCMonth() + 1).padStart(2, "0")}`, x, ay + 5, { align: "center" });
    marca = new Date(Date.UTC(marca.getUTCFullYear(), marca.getUTCMonth() + paso, 1));
  }

  const mitad = (x0 + x1) / 2;
  const contador = { arriba: 0, abajo: 0 };
  eventos.forEach((evento) => {
    const x = px(evento.fecha);
    const nivel = (evento.arriba ? contador.arriba++ : contador.abajo++) % 3 + 1;
    const yl = evento.arriba ? ay - (3 + nivel * 6.5) : ay + (6 + nivel * 6.5);
    doc.setDrawColor(...evento.color);
    doc.setLineWidth(0.4);
    doc.line(x, ay, x, yl);
    doc.setFillColor(...evento.color);
    doc.circle(x, ay, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.6);
    doc.setTextColor(...evento.color);
    const ty = yl + (evento.arriba ? -0.8 : 2.8);
    if (x <= mitad) doc.text(evento.texto, x + 1.5, ty);
    else doc.text(evento.texto, x - 1.5, ty, { align: "right" });
  });

  // Leyenda
  let lx = MARGEN + 2;
  const ly = y + alto - 1.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  [
    [BLUE, "Emisión OC"],
    [GRN, "Aprobación / pago con OC"],
    [RED, "Rechazo / pago sin OC"],
  ].forEach(([color, texto]) => {
    doc.setFillColor(...(color as Rgb));
    doc.circle(lx, ly - 0.8, 1.1, "F");
    doc.setTextColor(...GRY);
    doc.text(texto as string, lx + 2, ly);
    lx += 42;
  });
  doc.setTextColor(...INK);
  return y + alto + 2;
}

type OpcionesTabla = { chipCols?: number[]; derecha?: number[]; anchos?: Record<number, number>; fontSize?: number; filaTotal?: boolean; rojoCol?: number };

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
    columnStyles: {
      ...Object.fromEntries((opciones.derecha ?? []).map((i) => [i, { halign: "right" as const }])),
      ...Object.fromEntries(Object.entries(opciones.anchos ?? {}).map(([i, w]) => [i, { cellWidth: w }])),
    },
    margin: { left: MARGEN, right: MARGEN, top: 17, bottom: 17 },
    didDrawPage: () => pagina.dibujarCabecera(),
    didParseCell: (data: { section: string; column: { index: number }; row: { index: number }; cell: { raw: unknown; text: string[]; styles: { fontStyle?: string; fillColor?: unknown; textColor?: unknown } } }) => {
      if (data.section !== "body") return;
      if (chipCols.includes(data.column.index)) {
        data.cell.text = [];
      }
      if (opciones.filaTotal && data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [253, 236, 234];
      }
      if (opciones.rojoCol === data.column.index && String(data.cell.raw).startsWith("RECHAZADA")) {
        data.cell.styles.textColor = RED;
        data.cell.styles.fontStyle = "bold";
      }
    },
    didDrawCell: (data: { section: string; column: { index: number }; cell: { raw: unknown; x: number; y: number; width: number; height: number } }) => {
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

/** PDF analítico con el diseño aprobado: KPIs, lo más importante, estado de las OC, pagos sin OC, línea de tiempo, análisis y anexos. */
export async function exportarPdfIa(ctx: ContextoIa) {
  const { doc, autoTable } = await cargarPdf("portrait");
  const sitios = analizarPorSitio(ctx.filas);
  const responsables = responsablesAnalizados(ctx.filas);
  const kpis = calcularKpis(sitios);
  const periodo = periodoConsultado(ctx.filas, ctx.filtros);
  const unSitio = sitios.length === 1 ? sitios[0] : null;
  const nombresResponsables = responsables.map((r) => r.nombre).join(" · ") || ctx.criterio;
  const multiSitio = sitios.length > 1;
  const multiResponsable = new Set(sitios.flatMap((s) => s.pagos.map((p) => p.responsable))).size > 1;

  const cabecera = `${truncar(nombresResponsables, 60)}  ·  ${unSitio ? truncar(unSitio.etiqueta, 40) : `${sitios.length} sitios`}  ·  ${truncar(periodo, 60)}`;
  const pagina = new Pagina(doc, cabecera);

  // ---- Página 1: banda, KPIs, lo más importante, estado de las OC
  const lineasBanda = [
    unSitio ? `Sitio ${unSitio.etiqueta}${unSitio.cliente ? `  ·  Cliente ${unSitio.cliente}` : ""}${unSitio.proyecto ? `  ·  Proyecto ${unSitio.proyecto}` : ""}` : `${sitios.length} sitios analizados`,
    `${responsables.length > 1 ? "Responsables" : "Responsable"}: ${responsables
      .map((r) => `${r.nombre}${r.documento ? ` · RUC/Doc ${r.documento}` : ""} · IdEmpleado ${r.id}`)
      .join("  |  ") || ctx.criterio}`,
    `${periodo}  ·  Generado: ${marcaGeneracion()}`,
  ];
  pagina.y = bandaTitulo(
    doc,
    17,
    lineasBanda,
    ctx.generadoPorIa ? "Análisis redactado por IA (OpenAI); los ítems A VERIFICAR son hipótesis." : "Análisis automático: el servicio de IA no estuvo disponible.",
  );
  pagina.y += 4;

  const simbolo = kpis.simbolo ? `${kpis.simbolo}` : kpis.moneda;
  pagina.y = tarjetasKpi(doc, pagina.y, [
    { etiqueta: `MONTO OC VIGENTE (${simbolo})`, valor: formatMonto(kpis.montoVigente), sub: `${kpis.ocsAprobadas} OC aprobadas · ${kpis.ocsVigentes} vigentes`, color: BLUE },
    { etiqueta: `PAGADO CON OC (${simbolo})`, valor: formatMonto(kpis.pagadoConOc), sub: `${kpis.pagosConOc} pago(s)`, color: GRN },
    { etiqueta: `SALDO PENDIENTE (${simbolo})`, valor: formatMonto(kpis.saldoPendiente), sub: kpis.ocsRechazadas ? `sin ${kpis.ocsRechazadas} OC rechazada(s)` : "sobre OC vigentes", color: AMB },
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
  pagina.titulo("Estado de las OC", `(${totalOcs} OC · ${totalLineas} líneas de detalle)`);
  const tarjetas = sitios
    .flatMap((s) => s.ocs.map((oc) => ({ sitio: s, oc })))
    .sort((a, b) => b.oc.monto - a.oc.monto)
    .slice(0, MAX_TARJETAS_OC)
    .sort((a, b) => a.sitio.etiqueta.localeCompare(b.sitio.etiqueta, "es") || a.oc.idOc - b.oc.idOc);
  if (tarjetas.length === 0) vacio(doc, pagina, "No hay OC en el resultado.");
  let sitioActual = "";
  tarjetas.forEach(({ sitio, oc }) => {
    if (multiSitio && sitio.clave !== sitioActual) {
      pagina.asegurar(36);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...BLUE);
      doc.text(`Sitio ${sitio.etiqueta}${sitio.cliente ? ` · ${sitio.cliente}` : ""}`, MARGEN, pagina.y + 3);
      doc.setTextColor(...INK);
      pagina.y += 5.5;
      sitioActual = sitio.clave;
    }
    pagina.asegurar(29);
    pagina.y = tarjetaOc(doc, pagina.y, oc) + 2.5;
  });
  if (totalOcs > tarjetas.length) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRY);
    doc.text(`Se muestran las ${tarjetas.length} OC de mayor monto; el Anexo B lista todas las OC (${totalOcs}).`, MARGEN, pagina.y + 3);
    doc.setTextColor(...INK);
    pagina.y += 6;
  }

  // ---- Página 2: pagos sin OC, línea de tiempo, análisis
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
      [...(multiSitio ? ["SITIO"] : []), "PAGO", "F. DEPÓSITO", "SOLICITANTE", "MONTO", "ACCIÓN SUGERIDA"],
      [
        ...pagosSinOc.map(({ s, p }) => [...(multiSitio ? [s.etiqueta] : []), String(p.correlativo), formatFecha(p.fechaDeposito) || "—", p.solicitante || "—", montoConSimbolo(p.monto, p.moneda), "VINCULAR A OC O JUSTIFICAR"]),
        ...Array.from(totalesSinOc, ([moneda, total]) => [...(multiSitio ? [""] : []), "TOTAL", "", "", montoConSimbolo(total, moneda), ""]),
      ],
      { chipCols: [multiSitio ? 5 : 4], derecha: [multiSitio ? 4 : 3], anchos: { [multiSitio ? 5 : 4]: 52 } },
    );
  }

  pagina.titulo(unSitio ? "Línea de tiempo del sitio" : "Línea de tiempo");
  pagina.asegurar(64);
  pagina.y = lineaDeTiempo(doc, pagina.y, eventosLinea(sitios));

  pagina.titulo("Análisis IA: conclusiones, riesgos y recomendaciones");
  const filasAnalisis: string[][] = [
    ...ctx.analisis.conclusiones.map((c) => ["Conclusión", "INFO", c.texto, c.tipo]),
    ...ctx.analisis.riesgos.map((r) => ["Riesgo", nivelDe(r.nivel), [r.tema, r.detalle].filter(Boolean).join(": "), r.tipo]),
    ...ctx.analisis.recomendaciones.map((r) => ["Recomendación", nivelDe(r.prioridad), r.accion, r.tipo]),
  ];
  if (filasAnalisis.length === 0) vacio(doc, pagina, "Sin análisis disponible.");
  else tabla(doc, autoTable, pagina, ["TIPO", "NIVEL", "TEXTO", "ETIQUETA"], filasAnalisis, { chipCols: [1, 3], anchos: { 0: 26, 1: 20, 3: 24 }, fontSize: 8 });

  // ---- Anexos
  pagina.nueva();
  pagina.titulo("Anexo A · Detalle de pagos (con y sin OC)");
  const pagos = sitios
    .flatMap((s) => s.pagos.map((p) => ({ s, p })))
    .sort((a, b) => a.p.fechaDeposito.localeCompare(b.p.fechaDeposito) || a.p.correlativo - b.p.correlativo);
  if (pagos.length === 0) {
    vacio(doc, pagina, "No hay pagos en el resultado.");
  } else {
    const totales = new Map<string, number>();
    pagos.forEach(({ p }) => totales.set(p.moneda, (totales.get(p.moneda) ?? 0) + p.monto));
    const colMonto = 5 + (multiSitio ? 1 : 0) + (multiResponsable ? 1 : 0);
    const colChip = colMonto + 1;
    tabla(
      doc,
      autoTable,
      pagina,
      [...(multiSitio ? ["SITIO"] : []), "PAGO", "OC / FILA", "F. INGRESO", "F. DEPÓSITO", "SOLICITANTE", ...(multiResponsable ? ["RESPONSABLE"] : []), "MONTO", "CON OC"],
      [
        ...pagos.map(({ s, p }: { s: SitioAnalisis; p: PagoAnalisis }) => [
          ...(multiSitio ? [s.etiqueta] : []),
          String(p.correlativo),
          p.idOc === null ? "-" : `${p.idOc}${p.fila === null ? "" : ` / ${p.fila}`}`,
          formatFecha(p.fechaIngreso) || "—",
          formatFecha(p.fechaDeposito) || "—",
          p.solicitante || "—",
          ...(multiResponsable ? [p.responsable || "—"] : []),
          montoConSimbolo(p.monto, p.moneda),
          p.idOc === null ? "NO" : "SÍ",
        ]),
        ...Array.from(totales, ([moneda, total]) => [...(multiSitio ? [""] : []), "TOTAL", "", "", "", "", ...(multiResponsable ? [""] : []), montoConSimbolo(total, moneda), ""]),
      ],
      { chipCols: [colChip], derecha: [colMonto], anchos: { [colChip]: 17 } },
    );
  }

  pagina.titulo("Anexo B · Descripción de OC y aprobadores");
  const todasOcs = sitios.flatMap((s) => s.ocs.map((oc) => ({ s, oc }))).sort((a, b) => a.s.etiqueta.localeCompare(b.s.etiqueta, "es") || a.oc.idOc - b.oc.idOc);
  if (todasOcs.length === 0) {
    vacio(doc, pagina, "No hay OC en el resultado.");
  } else {
    const colAprob = multiSitio ? 3 : 2;
    tabla(
      doc,
      autoTable,
      pagina,
      [...(multiSitio ? ["SITIO"] : []), "OC", "DESCRIPCIÓN COMPLETA", "APROBADORES Y FECHAS"],
      todasOcs.map(({ s, oc }) => {
        const aprobadores = oc.aprobadores.map((a) => `${a.nombre}${a.fecha ? ` ${formatFecha(a.fecha)}` : ""}`).join("\n");
        const estado =
          oc.estadoAprobacion === "APROBADA"
            ? aprobadores || "APROBADA"
            : oc.estadoAprobacion === "RECHAZADA"
              ? `RECHAZADA${aprobadores ? `\n${aprobadores}` : " - sin aprobadores"}`
              : `${oc.estadoAprobacion}${aprobadores ? `\n${aprobadores}` : ""}`;
        return [...(multiSitio ? [s.etiqueta] : []), String(oc.idOc), (oc.detalle || "—").replace(/\s+/g, " "), estado];
      }),
      { anchos: { [multiSitio ? 1 : 0]: 17, [colAprob]: 62 }, fontSize: 7.5, rojoCol: colAprob },
    );
  }

  // Numeración de páginas y pie
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(MARGEN, ALTO_PAGINA - 13, MARGEN + ANCHO, ALTO_PAGINA - 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GRY);
    doc.text(`${EMPRESA}  ·  Informe Analítico de OC, Gastos y Pagos`, MARGEN, ALTO_PAGINA - 8.5);
    doc.text(`Página ${i} de ${total}`, MARGEN + ANCHO, ALTO_PAGINA - 8.5, { align: "right" });
  }

  doc.save(nombreArchivo("Informe_Analitico_IA"));
}
