import {
  calcularResumen,
  categoria,
  describirFiltros,
  etiquetaSite,
  formatFecha,
  formatMonto,
  formatMontoMoneda,
  periodoConsultado,
  formatPorcentaje,
  resumirPor,
  type Agrupacion,
  type FilaReporte,
  type FiltrosReporte,
} from "./responsableLogic";

export const EMPRESA = "CJ Telecom";
const TITULO = "Reporte Ejecutivo de Órdenes de Compra, Gastos y Pagos";
export const AZUL: [number, number, number] = [31, 111, 139];
export const GRIS: [number, number, number] = [241, 245, 249];

type Contexto = { filas: FilaReporte[]; filtros: FiltrosReporte; criterio: string };

const LEYENDA: Array<[string, string]> = [
  ["OC CON PAGO", "Orden de compra con planilla/gasto pagado asociado (misma OC y fila)."],
  ["OC SIN PAGO", "Orden de compra que aún no tiene pago asociado."],
  ["PLANILLA SIN OC ASOCIADA", "Gasto/planilla pagada sin detalle de OC vinculado."],
  ["COINCIDENCIA COMPLETA", "Cliente, proyecto, site y tipo de trabajo coinciden entre la OC y la planilla."],
  ["DIFERENCIA EN DATOS COMPLEMENTARIOS", "La OC y la planilla comparten OC/fila, pero difieren en cliente, proyecto, site o tipo de trabajo."],
  ["SIN PAGO ASOCIADO / SIN DETALLE OC ASOCIADO", "No existe la contraparte (pago u OC) para esa relación."],
];

const NOTA_MONTOS =
  "Gasto asociado = suma del subtotal de las planillas pagadas (estado 4) vinculadas a la OC por IdOc + Fila, en la moneda de la OC. " +
  "Saldo pendiente = subtotal de la OC menos el gasto asociado; un saldo negativo se informa como pagado en exceso. " +
  "Cada OC/fila se cuenta una sola vez aunque tenga varios gastos. Los totales se muestran por moneda, sin conversión.";

const HEAD_MONEDA = ["Moneda", "OC/fila", "Total OC", "Gasto asociado", "Saldo pendiente", "Pagado en exceso", "% pagado"];
const COLS_MONEDA = { 1: { halign: "right" as const }, 2: { halign: "right" as const }, 3: { halign: "right" as const }, 4: { halign: "right" as const }, 5: { halign: "right" as const }, 6: { halign: "right" as const } };

function bodyMoneda(resumen: ReturnType<typeof calcularResumen>) {
  return resumen.porMoneda.map((m) => [
    m.moneda,
    String(m.lineasOc),
    formatMonto(m.totalOc),
    formatMonto(m.gasto),
    formatMonto(m.saldoPendiente),
    formatMonto(m.excedente),
    formatPorcentaje(m.avance),
  ]);
}

const AGRUPACIONES_PDF: Array<{ agrupacion: Agrupacion; titulo: string; columna: string }> = [
  { agrupacion: "responsable", titulo: "Resumen por responsable", columna: "Responsable" },
  { agrupacion: "clienteProyecto", titulo: "Resumen por cliente y proyecto", columna: "Cliente / Proyecto" },
  { agrupacion: "site", titulo: "Resumen por site", columna: "Site" },
];

export async function cargarPdf(orientation: "landscape" | "portrait" = "landscape") {
  const [{ default: JsPdf }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new JsPdf({ orientation, unit: "mm", format: "a4" });
  return { doc, autoTable: autoTableModule.default };
}

export function marcaGeneracion() {
  const ahora = new Date();
  const dd = String(ahora.getDate()).padStart(2, "0");
  const mm = String(ahora.getMonth() + 1).padStart(2, "0");
  const hh = String(ahora.getHours()).padStart(2, "0");
  const mi = String(ahora.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${ahora.getFullYear()} ${hh}:${mi}`;
}

export function nombreArchivo(prefijo: string) {
  const ahora = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${prefijo}_${ahora.getFullYear()}${pad(ahora.getMonth() + 1)}${pad(ahora.getDate())}_${pad(ahora.getHours())}${pad(ahora.getMinutes())}.pdf`;
}

export type Doc = Awaited<ReturnType<typeof cargarPdf>>["doc"];
export type AutoTable = Awaited<ReturnType<typeof cargarPdf>>["autoTable"];

export function encabezadoPagina(doc: Doc, subtitulo: string, titulo: string = TITULO) {
  const ancho = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...AZUL);
  doc.text(titulo, 10, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(subtitulo, 10, 17);
  doc.text(`${EMPRESA} · Generado ${marcaGeneracion()}`, ancho - 10, 12, { align: "right" });
  doc.setDrawColor(...AZUL);
  doc.line(10, 19, ancho - 10, 19);
  doc.setTextColor(0, 0, 0);
}

export function numerarPaginas(doc: Doc) {
  const total = doc.getNumberOfPages();
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  for (let pagina = 1; pagina <= total; pagina += 1) {
    doc.setPage(pagina);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Página ${pagina} de ${total}`, ancho - 10, alto - 6, { align: "right" });
    doc.text(`${EMPRESA} · ${TITULO}`, 10, alto - 6);
  }
}

export function finTabla(doc: Doc, margen = 6) {
  const ultima = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  return (ultima?.finalY ?? 25) + margen;
}

export function asegurarEspacio(doc: Doc, y: number, necesario: number, subtitulo: string) {
  if (y + necesario > doc.internal.pageSize.getHeight() - 14) {
    doc.addPage();
    encabezadoPagina(doc, subtitulo);
    return 25;
  }
  return y;
}

export function tituloSeccion(doc: Doc, texto: string, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...AZUL);
  doc.text(texto, 10, y);
  doc.setTextColor(0, 0, 0);
  return y + 3;
}

function tablaKpis(doc: Doc, autoTable: AutoTable, ctx: Contexto, y: number) {
  const resumen = calcularResumen(ctx.filas);
  autoTable(doc, {
    startY: y,
    head: [["Indicador", "Valor"]],
    body: [
      ["Órdenes de compra (OC)", String(resumen.ocs)],
      ["OCs pagadas completas", String(resumen.ocsPagadas)],
      ["OCs con pago parcial", String(resumen.ocsParciales)],
      ["OCs sin pago", String(resumen.ocsSinPago)],
      ["OCs pagadas en exceso", String(resumen.ocsExceso)],
      ["Planillas sin OC asociada", String(resumen.planillasSinOc)],
      ["Pagos (planillas) asociados a OC", String(resumen.pagos - resumen.planillasSinOc)],
      ["OCs con más de un pago asociado", String(resumen.ocsConVariosPagos)],
    ],
    styles: { fontSize: 8.5, cellPadding: 1.6 },
    headStyles: { fillColor: AZUL, textColor: 255 },
    columnStyles: { 1: { halign: "right", cellWidth: 30 } },
    tableWidth: 110,
    margin: { left: 10 },
  });
  const yKpis = finTabla(doc, 0);

  autoTable(doc, {
    startY: y,
    head: [HEAD_MONEDA],
    body: bodyMoneda(resumen),
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: AZUL, textColor: 255 },
    columnStyles: COLS_MONEDA,
    margin: { left: 125 },
    tableWidth: 162,
  });
  return Math.max(yKpis, finTabla(doc, 0)) + 6;
}

function tablaGrupo(doc: Doc, autoTable: AutoTable, ctx: Contexto, y: number, agrupacion: Agrupacion, columna: string) {
  const filas = resumirPor(ctx.filas, agrupacion);
  const esResponsable = agrupacion === "responsable";
  autoTable(doc, {
    startY: y,
    head: [[columna, ...(esResponsable ? ["Documento"] : []), "OCs", "Pagadas", "Parciales", "Sin pago", "Planillas sin OC", "Subtotal OC", "Gasto asociado", "Saldo pendiente", "Exceso", "% pagado", "Estado", "Moneda"]],
    body: filas.map((r) => [
      r.grupo,
      ...(esResponsable ? [r.documento] : []),
      r.ocs,
      r.ocsPagadas,
      r.ocsParciales,
      r.ocsSinPago,
      r.planillasSinOc,
      formatMonto(r.subtotalOc),
      formatMonto(r.gasto),
      formatMonto(r.saldoPendiente),
      formatMonto(r.excedente),
      formatPorcentaje(r.avance),
      r.estado,
      r.moneda,
    ]),
    styles: { fontSize: 7, cellPadding: 1.2 },
    headStyles: { fillColor: AZUL, textColor: 255 },
    alternateRowStyles: { fillColor: GRIS },
    columnStyles: Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [i + (esResponsable ? 2 : 1), { halign: "right" as const }]),
    ),
    margin: { left: 10, right: 10 },
  });
  return finTabla(doc);
}

function notaPie(doc: Doc, y: number, subtitulo: string) {
  const ancho = doc.internal.pageSize.getWidth() - 20;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const lineas = doc.splitTextToSize(NOTA_MONTOS, ancho) as string[];
  const yFinal = asegurarEspacio(doc, y, lineas.length * 4 + 4, subtitulo);
  doc.text(lineas, 10, yFinal);
  doc.setTextColor(0, 0, 0);
  return yFinal + lineas.length * 4 + 2;
}

function leyenda(doc: Doc, autoTable: AutoTable, y: number, subtitulo: string) {
  const inicio = asegurarEspacio(doc, y, 50, subtitulo);
  const yTabla = tituloSeccion(doc, "Leyenda de clasificaciones y observaciones de vinculación", inicio);
  autoTable(doc, {
    startY: yTabla,
    head: [["Clasificación / observación", "Significado"]],
    body: LEYENDA,
    styles: { fontSize: 8, cellPadding: 1.4 },
    headStyles: { fillColor: AZUL, textColor: 255 },
    columnStyles: { 0: { cellWidth: 75, fontStyle: "bold" } },
    margin: { left: 10, right: 10 },
  });
  return finTabla(doc);
}

function descargar(doc: Doc, archivo: string) {
  numerarPaginas(doc);
  doc.save(archivo);
}

/** PDF gerencial: KPIs, resumen por responsable y por cliente/proyecto, y cuadro de clasificaciones. */
export async function exportarPdfResumen(ctx: Contexto) {
  const { doc, autoTable } = await cargarPdf();
  const subtitulo = `Resumen gerencial · ${periodoConsultado(ctx.filas, ctx.filtros)}`;
  encabezadoPagina(doc, subtitulo);

  let y = 25;
  doc.setFontSize(8.5);
  const filtros = describirFiltros(ctx.filtros, ctx.criterio, ctx.filas).join("  |  ");
  const lineasFiltros = doc.splitTextToSize(`Filtros aplicados: ${filtros}`, doc.internal.pageSize.getWidth() - 20) as string[];
  doc.text(lineasFiltros, 10, y);
  y += lineasFiltros.length * 4 + 3;

  y = tituloSeccion(doc, "Resumen de indicadores", y);
  y = tablaKpis(doc, autoTable, ctx, y);

  y = asegurarEspacio(doc, y, 30, subtitulo);
  y = tituloSeccion(doc, "Resumen por responsable", y);
  y = tablaGrupo(doc, autoTable, ctx, y, "responsable", "Responsable");

  const clientes = resumirPor(ctx.filas, "clienteProyecto");
  if (clientes.length > 0) {
    for (const { agrupacion, titulo, columna } of AGRUPACIONES_PDF.slice(1)) {
      y = asegurarEspacio(doc, y, 30, subtitulo);
      y = tituloSeccion(doc, titulo, y);
      y = tablaGrupo(doc, autoTable, ctx, y, agrupacion, columna);
    }
  }

  y = asegurarEspacio(doc, y, 30, subtitulo);
  y = tituloSeccion(doc, "Estado de pago de las OCs y planillas sin OC", y);
  const resumen = calcularResumen(ctx.filas);
  const montosEstado = (clave: "gasto" | "saldoPendiente" | "excedente") =>
    resumen.porMoneda.filter((m) => m[clave] > 0).map((m) => formatMontoMoneda(m[clave], m.moneda)).join(" / ") || "—";
  autoTable(doc, {
    startY: y,
    head: [["Clasificación", "Cantidad de OCs", "Monto"]],
    body: [
      ["PAGADAS COMPLETAS (sin saldo)", String(resumen.ocsPagadas), "Gasto asociado: " + montosEstado("gasto")],
      ["PAGO PARCIAL (queda saldo)", String(resumen.ocsParciales), "Saldo pendiente: " + montosEstado("saldoPendiente")],
      ["SIN PAGO", String(resumen.ocsSinPago), "Incluido en el saldo pendiente"],
      ["PAGADAS EN EXCESO", String(resumen.ocsExceso), "Exceso: " + montosEstado("excedente")],
      [
        "PLANILLA SIN OC ASOCIADA",
        String(resumen.planillasSinOc),
        resumen.gastoSinOc.map((g) => formatMontoMoneda(g.monto, g.moneda)).join(" / ") || "—",
      ],
    ],
    styles: { fontSize: 8.5, cellPadding: 1.6 },
    headStyles: { fillColor: AZUL, textColor: 255 },
    columnStyles: { 1: { halign: "right", cellWidth: 40 } },
    margin: { left: 10, right: 10 },
  });
  y = finTabla(doc);

  y = notaPie(doc, y, subtitulo);
  leyenda(doc, autoTable, y, subtitulo);
  descargar(doc, nombreArchivo("Reporte_Ejecutivo_OC_Resumen"));
}

type Seccion = { titulo: string; pagina: number };

const COLUMNAS_DETALLE = [
  "OC", "Fila", "OT", "Cliente / Proyecto / Site", "Fecha OC", "Detalle OC", "Cant.", "P. unit.", "Subtotal OC", "Mon.", "Pago", "F. depósito", "Serie", "Nro. operación", "Gasto (planilla)", "Saldo OC", "Estado de pago", "Observación",
];

function filaDetalle(fila: FilaReporte): Array<string | number> {
  return [
    fila.idOc ?? "—",
    fila.fila ?? "—",
    fila.ot || "—",
    [fila.cliente, fila.proyecto, fila.idSite ? etiquetaSite(fila) : fila.site].filter(Boolean).join(" / ") || "—",
    formatFecha(fila.fechaOc) || "—",
    fila.detalleOc || "—",
    fila.cantidad === null ? "—" : formatMonto(fila.cantidad),
    fila.precioUnitario === null ? "—" : formatMonto(fila.precioUnitario),
    fila.subtotalOc === null ? "—" : formatMonto(fila.subtotalOc),
    fila.tieneOc ? fila.monedaClave : "—",
    fila.correlativoPago ?? "—",
    formatFecha(fila.fechaDeposito) || "—",
    fila.seriePago || "—",
    fila.nroOperacionPago || "—",
    fila.subtotalGasto === null ? "—" : formatMonto(fila.subtotalGasto),
    fila.primeraDeOc ? formatMonto(fila.saldoOc) : "",
    fila.primeraDeOc ? fila.estadoPagoOc : "",
    fila.pagosDeLaOc > 1 ? `${fila.observacionVinculacion} (${fila.pagosDeLaOc} pagos)` : fila.observacionVinculacion,
  ];
}

function tablaDetalle(doc: Doc, autoTable: AutoTable, filas: FilaReporte[], y: number) {
  autoTable(doc, {
    startY: y,
    head: [COLUMNAS_DETALLE],
    body: filas.map(filaDetalle),
    styles: { fontSize: 7, cellPadding: 1.1, overflow: "linebreak" },
    headStyles: { fillColor: AZUL, textColor: 255 },
    alternateRowStyles: { fillColor: GRIS },
    columnStyles: {
      0: { cellWidth: 12 }, 1: { cellWidth: 8 }, 2: { cellWidth: 16 }, 3: { cellWidth: 30 }, 4: { cellWidth: 14 }, 5: { cellWidth: 26 },
      6: { halign: "right", cellWidth: 9 }, 7: { halign: "right", cellWidth: 13 }, 8: { halign: "right", cellWidth: 15 }, 9: { cellWidth: 8 },
      10: { cellWidth: 11 }, 11: { cellWidth: 14 }, 12: { cellWidth: 12 }, 13: { cellWidth: 16 }, 14: { halign: "right", cellWidth: 15 }, 15: { halign: "right", cellWidth: 15 }, 16: { cellWidth: 18 },
    },
    margin: { left: 10, right: 10 },
  });
  return finTabla(doc, 2);
}

/** Subtotales por moneda contando cada OC/fila una sola vez. */
function subtotalesPorMoneda(doc: Doc, autoTable: AutoTable, filas: FilaReporte[], y: number, titulo: string) {
  const resumen = calcularResumen(filas);
  if (resumen.porMoneda.length === 0) return y;
  autoTable(doc, {
    startY: y,
    head: [[titulo, ...HEAD_MONEDA.slice(1)]],
    body: bodyMoneda(resumen),
    styles: { fontSize: 7.5, cellPadding: 1.2 },
    headStyles: { fillColor: [100, 116, 139], textColor: 255 },
    columnStyles: COLS_MONEDA,
    margin: { left: 125 },
    tableWidth: 162,
  });
  return finTabla(doc);
}

/** PDF detallado: carátula, resumen, secciones por responsable, OC sin pago y planillas sin OC. */
export async function exportarPdfDetallado(ctx: Contexto) {
  const { doc, autoTable } = await cargarPdf();
  const subtitulo = `Detalle de trazabilidad · ${periodoConsultado(ctx.filas, ctx.filtros)}`;
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const resumen = calcularResumen(ctx.filas);

  // Carátula
  doc.setFillColor(...AZUL);
  doc.rect(0, 0, ancho, 46, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(TITULO, ancho / 2, 24, { align: "center", maxWidth: ancho - 30 });
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text("Informe detallado de trazabilidad OC – gasto/planilla – pago", ancho / 2, 36, { align: "center" });
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.text(`Empresa: ${EMPRESA}`, 14, 62);
  doc.text(`Generado: ${marcaGeneracion()}`, 14, 69);
  doc.text(`Periodo consultado: ${periodoConsultado(ctx.filas, ctx.filtros)}`, 14, 76);
  doc.setFont("helvetica", "bold");
  doc.text("Filtros aplicados", 14, 88);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const lineasFiltros = doc.splitTextToSize(describirFiltros(ctx.filtros, ctx.criterio, ctx.filas).map((p) => `• ${p}`).join("\n"), ancho - 28) as string[];
  doc.text(lineasFiltros, 14, 95);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`${ctx.filas.length} registros · ${resumen.ocs} OCs · ${resumen.pagos} pagos`, 14, alto - 16);

  // Índice y resumen ejecutivo (se completa al final con las páginas)
  doc.addPage();
  encabezadoPagina(doc, subtitulo);
  const responsablesConPago = Array.from(
    new Map(ctx.filas.filter((f) => categoria(f) === "conPago").map((f) => [f.responsableId, f.responsable])).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1], "es"));
  const hayConPago = responsablesConPago.length > 0;
  const hayPlanillasSinOc = ctx.filas.some((f) => categoria(f) === "planillaSinOc");
  const hayOcSinPago = ctx.filas.some((f) => categoria(f) === "sinPago");
  const totalIndice = responsablesConPago.length + (hayOcSinPago ? 1 : 0) + (hayPlanillasSinOc ? 1 : 0) + 1;
  let y = tituloSeccion(doc, "Índice", 25);
  const yIndice = y + 2;
  y = yIndice + totalIndice * 5 + 6;
  y = tituloSeccion(doc, "Resumen ejecutivo", y);
  y = tablaKpis(doc, autoTable, ctx, y);
  y = asegurarEspacio(doc, y, 30, subtitulo);
  y = tituloSeccion(doc, "Resumen por responsable", y);
  tablaGrupo(doc, autoTable, ctx, y, "responsable", "Responsable");

  const secciones: Seccion[] = [];

  // Secciones por responsable: OCs con pago asociado
  responsablesConPago.forEach(([responsableId, nombre]) => {
    const filas = ctx.filas.filter((f) => categoria(f) === "conPago" && f.responsableId === responsableId);
    doc.addPage();
    encabezadoPagina(doc, subtitulo);
    secciones.push({ titulo: `Responsable: ${nombre}`, pagina: doc.getNumberOfPages() });
    const documento = filas.find((f) => f.documento)?.documento;
    let yy = tituloSeccion(doc, `Responsable: ${nombre}${documento ? ` · Doc. ${documento}` : ""}`, 25);
    yy = tablaDetalle(doc, autoTable, filas, yy);
    yy = asegurarEspacio(doc, yy, 22, subtitulo);
    subtotalesPorMoneda(doc, autoTable, filas, yy, "Subtotal por moneda");
  });

  const seccionAparte = (titulo: string, filas: FilaReporte[], conSubtotal: boolean) => {
    doc.addPage();
    encabezadoPagina(doc, subtitulo);
    secciones.push({ titulo, pagina: doc.getNumberOfPages() });
    let yy = tituloSeccion(doc, titulo, 25);
    // Agrupadas por responsable dentro de la sección.
    const porResponsable = new Map<string, FilaReporte[]>();
    filas.forEach((f) => porResponsable.set(f.responsable, [...(porResponsable.get(f.responsable) ?? []), f]));
    Array.from(porResponsable.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "es"))
      .forEach(([nombre, grupo]) => {
        yy = asegurarEspacio(doc, yy, 28, subtitulo);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text(`Responsable: ${nombre}`, 10, yy + 2);
        yy = tablaDetalle(doc, autoTable, grupo, yy + 4);
        if (conSubtotal) {
          yy = asegurarEspacio(doc, yy, 22, subtitulo);
          yy = subtotalesPorMoneda(doc, autoTable, grupo, yy, "Subtotal por moneda");
        }
      });
    return yy;
  };

  if (hayOcSinPago) {
    const filas = ctx.filas.filter((f) => categoria(f) === "sinPago");
    const yy = seccionAparte("OC sin pago", filas, true);
    asegurarEspacio(doc, yy, 22, subtitulo);
  }
  if (hayPlanillasSinOc) {
    const filas = ctx.filas.filter((f) => categoria(f) === "planillaSinOc");
    seccionAparte("Planilla sin OC asociada", filas, false);
  }

  // Totales generales por moneda, notas y leyenda
  doc.addPage();
  encabezadoPagina(doc, subtitulo);
  secciones.push({ titulo: "Totales generales y leyenda", pagina: doc.getNumberOfPages() });
  let yf = tituloSeccion(doc, "Totales generales por moneda", 25);
  autoTable(doc, {
    startY: yf,
    head: [HEAD_MONEDA],
    body: bodyMoneda(resumen),
    styles: { fontSize: 9, cellPadding: 1.8 },
    headStyles: { fillColor: AZUL, textColor: 255 },
    columnStyles: COLS_MONEDA,
    margin: { left: 10, right: 10 },
  });
  yf = finTabla(doc);
  yf = notaPie(doc, yf, subtitulo);
  leyenda(doc, autoTable, yf, subtitulo);

  // Completar el índice con las páginas reales
  doc.setPage(2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  secciones.forEach((seccion, indice) => {
    doc.text(`${indice + 1}. ${seccion.titulo}`, 12, yIndice + indice * 5);
    doc.text(String(seccion.pagina), ancho - 12, yIndice + indice * 5, { align: "right" });
  });
  if (!hayConPago && secciones.length === 0) {
    doc.text("Sin registros.", 12, yIndice);
  }

  descargar(doc, nombreArchivo("Reporte_Ejecutivo_OC_Detallado"));
}
