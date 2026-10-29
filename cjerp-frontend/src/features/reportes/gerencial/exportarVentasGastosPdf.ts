// Exporta a PDF lo que se está viendo en la pantalla Ventas vs Gastos: filtros activos, KPIs, gráficos y tablas con los mismos datos
// filtrados. Los gráficos se dibujan directamente con jsPDF a partir de los datos (no se captura la imagen de la pantalla), así
// salen nítidos y siempre coinciden con lo visible. jspdf y jspdf-autotable se cargan solo al exportar.

export type PdfKpi = { etiqueta: string; valor: string };

export type PdfTabla = {
  tipo: "tabla";
  titulo: string;
  columnas: string[];
  filas: string[][];
  /** Fila final de totales (opcional). */
  totales?: string[];
  /** Índices de columna con importes (se alinean a la derecha). */
  numericas?: number[];
};

/** Columnas agrupadas por categoría (p. ej. mes) con líneas de referencia y una línea opcional sobre un eje derecho. */
export type PdfGraficoColumnas = {
  tipo: "columnas";
  titulo: string;
  subtitulo?: string;
  categorias: string[];
  series: { nombre: string; color: string; valores: number[] }[];
  /** Línea sobre eje derecho (p. ej. margen %). Los nulos se omiten. */
  linea?: { nombre: string; color: string; valores: (number | null)[]; formato: (v: number) => string };
  referencia?: { valor: number; texto: string };
  formatoEje: (v: number) => string;
  /** Categorías que se pintan atenuadas (mes parcial o fuera de la selección). */
  atenuar?: boolean[];
};

/** Barras horizontales por elemento (clientes). Admite valores negativos. */
export type PdfGraficoBarrasH = {
  tipo: "barrasH";
  titulo: string;
  subtitulo?: string;
  leyenda?: { color: string; texto: string }[];
  items: { etiqueta: string; valor: number; color: string; texto: string; atenuar?: boolean }[];
};

/** Una barra segmentada (p. ej. gasto por moneda) con su leyenda. */
export type PdfGraficoApilada = {
  tipo: "apilada";
  titulo: string;
  subtitulo?: string;
  segmentos: { etiqueta: string; color: string; valor: number }[];
};

/** `nuevaPagina`: la sección empieza en una página nueva (si ya hay contenido en la actual). */
export type PdfSeccion = (PdfTabla | PdfGraficoColumnas | PdfGraficoBarrasH | PdfGraficoApilada) & { nuevaPagina?: boolean };

export type PdfOpciones = {
  archivo: string;
  titulo: string;
  filtros: string[];
  kpis: PdfKpi[];
  /** Aclaraciones de lectura (colores, criterios). */
  notas?: string[];
  /** Gráficos y tablas, en el orden en que se muestran en pantalla. */
  secciones: PdfSeccion[];
};

type Doc = import("jspdf").jsPDF;

const MARGEN = 12;
const GRIS = "#C4C4B8";

function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [100, 116, 139];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Mezcla el color con blanco (atenuado).
function aclarar(hex: string, factor = 0.62): [number, number, number] {
  const [r, g, b] = rgb(hex);
  return [Math.round(r + (255 - r) * factor), Math.round(g + (255 - g) * factor), Math.round(b + (255 - b) * factor)];
}

function recortar(doc: Doc, texto: string, ancho: number): string {
  if (doc.getTextWidth(texto) <= ancho) return texto;
  let t = texto;
  while (t.length > 1 && doc.getTextWidth(`${t}...`) > ancho) t = t.slice(0, -1);
  return `${t}...`;
}

function dibujarLeyenda(doc: Doc, items: { color: string; texto: string; linea?: boolean }[], x: number, y: number) {
  let cursor = x;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  for (const item of items) {
    doc.setFillColor(...rgb(item.color));
    doc.setDrawColor(...rgb(item.color));
    if (item.linea) {
      doc.setLineWidth(0.6);
      doc.line(cursor, y - 1, cursor + 4, y - 1);
      doc.setLineWidth(0.2);
    } else {
      doc.rect(cursor, y - 2.4, 2.8, 2.8, "F");
    }
    doc.setTextColor(71, 85, 105);
    doc.text(item.texto, cursor + 5, y);
    cursor += 9 + doc.getTextWidth(item.texto);
  }
}

// Devuelve el alto usado.
function dibujarColumnas(doc: Doc, g: PdfGraficoColumnas, x: number, y: number, w: number): number {
  const altoLeyenda = 6;
  const ph = 62;
  const ejeIzq = 26;
  const ejeDer = g.linea ? 16 : 2;
  const abajo = 8;
  const px = x + ejeIzq;
  const py = y + altoLeyenda + 2;
  const pw = w - ejeIzq - ejeDer;

  dibujarLeyenda(
    doc,
    [
      ...g.series.map((s) => ({ color: s.color, texto: s.nombre })),
      ...(g.linea ? [{ color: g.linea.color, texto: g.linea.nombre, linea: true }] : []),
    ],
    x,
    y + 3,
  );

  const valores = g.series.flatMap((s) => s.valores);
  let max = Math.max(0, ...valores, g.referencia?.valor ?? 0);
  const min = Math.min(0, ...valores);
  if (max === min) max = min + 1;
  max = max > 0 ? max * 1.08 : max;
  const yv = (v: number) => py + ph - ((v - min) / (max - min)) * ph;

  // Rejilla y eje izquierdo
  doc.setLineWidth(0.15);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  for (let i = 0; i <= 4; i += 1) {
    const val = min + ((max - min) * i) / 4;
    const yy = yv(val);
    doc.setDrawColor(226, 232, 240);
    doc.line(px, yy, px + pw, yy);
    doc.setTextColor(100, 116, 139);
    doc.text(g.formatoEje(val), px - 2, yy + 1.2, { align: "right" });
  }
  if (min < 0) {
    doc.setDrawColor(148, 163, 184);
    doc.line(px, yv(0), px + pw, yv(0));
  }

  // Columnas
  const n = Math.max(g.categorias.length, 1);
  const grupo = pw / n;
  const ancho = Math.min((grupo * 0.7) / Math.max(g.series.length, 1), 12);
  g.categorias.forEach((cat, i) => {
    const total = ancho * g.series.length;
    const x0 = px + i * grupo + (grupo - total) / 2;
    const atenuada = g.atenuar?.[i] === true;
    g.series.forEach((serie, k) => {
      const v = serie.valores[i] ?? 0;
      const yTop = yv(Math.max(v, 0));
      const yBase = yv(Math.min(v, 0));
      if (atenuada) doc.setFillColor(...aclarar(serie.color));
      else doc.setFillColor(...rgb(serie.color));
      doc.rect(x0 + k * ancho, yTop, ancho, Math.max(yBase - yTop, 0.2), "F");
    });
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(8);
    doc.text(cat, px + i * grupo + grupo / 2, py + ph + 4.5, { align: "center" });
  });

  // Referencia (promedio)
  if (g.referencia) {
    const yy = yv(g.referencia.valor);
    doc.setDrawColor(100, 116, 139);
    doc.setLineDashPattern([1.6, 1.4], 0);
    doc.line(px, yy, px + pw, yy);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(g.referencia.texto, px + pw - 1, yy - 1.2, { align: "right" });
  }

  // Línea sobre eje derecho
  if (g.linea) {
    const vals = g.linea.valores.filter((v): v is number => v != null);
    if (vals.length) {
      const lmin = Math.min(0, ...vals);
      let lmax = Math.max(0, ...vals);
      if (lmax === lmin) lmax = lmin + 1;
      const yl = (v: number) => py + ph - ((v - lmin) / (lmax - lmin)) * ph;
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      for (let i = 0; i <= 2; i += 1) {
        const val = lmin + ((lmax - lmin) * i) / 2;
        doc.text(g.linea.formato(val), px + pw + 2, yl(val) + 1.2);
      }
      doc.setDrawColor(...rgb(g.linea.color));
      doc.setFillColor(...rgb(g.linea.color));
      doc.setLineWidth(0.6);
      let previo: { x: number; y: number } | null = null;
      g.linea.valores.forEach((v, i) => {
        if (v == null) {
          previo = null;
          return;
        }
        const punto = { x: px + i * grupo + grupo / 2, y: yl(v) };
        if (previo) doc.line(previo.x, previo.y, punto.x, punto.y);
        previo = punto;
      });
      g.linea.valores.forEach((v, i) => {
        if (v != null) doc.circle(px + i * grupo + grupo / 2, yl(v), 0.9, "F");
      });
      doc.setLineWidth(0.2);
    }
  }

  return altoLeyenda + 2 + ph + abajo;
}

// Dibuja las barras horizontales fila por fila (cambia de página si hace falta). Devuelve la nueva Y.
function dibujarBarrasH(doc: Doc, g: PdfGraficoBarrasH, x: number, y: number, w: number, desde: (yActual: number, alto: number) => number): number {
  const etiquetaW = 62;
  const valorW = 44;
  const fila = 5.4;
  const valores = g.items.map((i) => i.valor);
  const min = Math.min(0, ...valores);
  const max = Math.max(0, ...valores);
  const rango = max - min || 1;
  const holgaNegativa = min < 0 ? 40 : 0;
  const ax = x + etiquetaW + holgaNegativa;
  const aw = w - etiquetaW - valorW - holgaNegativa;
  const cero = ax + (-min / rango) * aw;

  doc.setFontSize(8);
  for (const item of g.items) {
    y = desde(y, fila + 1);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(recortar(doc, item.etiqueta, etiquetaW - 3), x, y + 3.6);
    const ancho = (Math.abs(item.valor) / rango) * aw;
    const x0 = item.valor >= 0 ? cero : cero - ancho;
    if (item.atenuar) doc.setFillColor(...aclarar(item.color));
    else doc.setFillColor(...rgb(item.color));
    doc.rect(x0, y + 0.6, Math.max(ancho, 0.3), fila - 1.6, "F");
    doc.setTextColor(15, 23, 42);
    if (item.valor >= 0) doc.text(item.texto, x0 + ancho + 1.5, y + 3.6);
    else doc.text(item.texto, x0 - 1.5, y + 3.6, { align: "right" });
    if (min < 0) {
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.2);
      doc.line(cero, y, cero, y + fila);
    }
    y += fila;
  }
  return y;
}

function dibujarApilada(doc: Doc, g: PdfGraficoApilada, x: number, y: number, w: number): number {
  const total = g.segmentos.reduce((s, i) => s + Math.max(i.valor, 0), 0);
  let cursor = x;
  for (const seg of g.segmentos) {
    const ancho = total > 0 ? (Math.max(seg.valor, 0) / total) * w : 0;
    if (ancho <= 0) continue;
    doc.setFillColor(...rgb(seg.color));
    doc.rect(cursor, y, ancho, 8, "F");
    cursor += ancho;
  }
  y += 12;
  dibujarLeyenda(
    doc,
    g.segmentos.map((s) => ({ color: s.color, texto: `${s.etiqueta} ${total > 0 ? ((Math.max(s.valor, 0) / total) * 100).toFixed(1) : "0.0"}%` })),
    x,
    y,
  );
  return 8 + 4 + 5;
}

export async function exportarPdf(opciones: PdfOpciones): Promise<void> {
  const [{ default: jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableModule.default;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const util = ancho - MARGEN * 2;
  let y = MARGEN;

  // Garantiza espacio; si no cabe, pasa a una página nueva. Devuelve la Y vigente.
  const asegurar = (necesario: number): number => {
    if (y + necesario > alto - MARGEN) {
      doc.addPage();
      y = MARGEN;
    }
    return y;
  };

  // Pasa a una página nueva si desde `yActual` no caben `alto` mm; devuelve la Y donde seguir dibujando.
  const desde = (yActual: number, alto2: number): number => {
    if (yActual + alto2 > alto - MARGEN) {
      doc.addPage();
      return MARGEN;
    }
    return yActual;
  };

  // Encabezado
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text(opciones.titulo, MARGEN, y + 5);
  y += 10;
  const generado = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" }).format(new Date());
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generado: ${generado} (hora de Lima)`, MARGEN, y);
  y += 5;
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(9);
  if (opciones.filtros.length) {
    const lineas = doc.splitTextToSize(`Filtros: ${opciones.filtros.join("  |  ")}`, util) as string[];
    doc.text(lineas, MARGEN, y);
    y += lineas.length * 4.2 + 3;
  }

  // KPIs
  if (opciones.kpis.length) {
    const separacion = 4;
    const anchoKpi = (util - separacion * (opciones.kpis.length - 1)) / opciones.kpis.length;
    asegurar(18);
    opciones.kpis.forEach((kpi, i) => {
      const x = MARGEN + i * (anchoKpi + separacion);
      doc.setDrawColor(216, 229, 242);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x, y, anchoKpi, 15, 2, 2, "FD");
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 116, 139);
      doc.text(recortar(doc, kpi.etiqueta, anchoKpi - 6), x + 3, y + 5);
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(kpi.valor, x + 3, y + 11.5);
    });
    y += 20;
  }

  const titulo = (texto: string, subtitulo?: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(texto, MARGEN, y + 3);
    y += 5;
    if (subtitulo) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      const lineas = doc.splitTextToSize(subtitulo, util) as string[];
      doc.text(lineas, MARGEN, y + 2);
      y += lineas.length * 3.8 + 1;
    }
  };

  for (const seccion of opciones.secciones) {
    if (seccion.nuevaPagina && y > MARGEN) {
      doc.addPage();
      y = MARGEN;
    }
    if (seccion.tipo === "columnas") {
      asegurar(95);
      titulo(seccion.titulo, seccion.subtitulo);
      if (seccion.categorias.length === 0) {
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text("Sin datos para los filtros elegidos.", MARGEN, y + 4);
        y += 10;
      } else {
        y += dibujarColumnas(doc, seccion, MARGEN, y, util) + 4;
      }
    } else if (seccion.tipo === "barrasH") {
      asegurar(30);
      titulo(seccion.titulo, seccion.subtitulo);
      if (seccion.items.length === 0) {
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text("Sin datos para los filtros elegidos.", MARGEN, y + 4);
        y += 10;
      } else {
        if (seccion.leyenda?.length) {
          dibujarLeyenda(doc, seccion.leyenda, MARGEN, y + 3);
          y += 6;
        }
        y = dibujarBarrasH(doc, seccion, MARGEN, y, util, desde) + 5;
      }
    } else if (seccion.tipo === "apilada") {
      asegurar(34);
      titulo(seccion.titulo, seccion.subtitulo);
      y += dibujarApilada(doc, seccion, MARGEN, y, util) + 3;
    } else {
      asegurar(24);
      titulo(seccion.titulo);
      const numericas = new Set(seccion.numericas ?? []);
      autoTable(doc, {
        startY: y,
        margin: { left: MARGEN, right: MARGEN },
        head: [seccion.columnas],
        body: seccion.filas.length ? seccion.filas : [["Sin datos"]],
        foot: seccion.totales ? [seccion.totales] : undefined,
        showFoot: "lastPage",
        styles: { fontSize: 7.5, cellPadding: 1.4 },
        headStyles: { fillColor: [219, 234, 247], textColor: [31, 41, 55] },
        footStyles: { fillColor: [219, 234, 247], textColor: [31, 41, 55], fontStyle: "bold" },
        didParseCell: (data) => {
          if (numericas.has(data.column.index)) data.cell.styles.halign = "right";
        },
      });
      y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 8;
    }
  }

  if (opciones.notas?.length) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    for (const nota of opciones.notas) {
      const lineas = doc.splitTextToSize(nota, util) as string[];
      asegurar(lineas.length * 4 + 2);
      doc.text(lineas, MARGEN, y);
      y += lineas.length * 4 + 1;
    }
  }

  // Numeración
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p += 1) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Página ${p} de ${paginas}`, ancho - MARGEN, alto - 5, { align: "right" });
  }

  doc.save(opciones.archivo);
}

export const COLOR_GRIS_PDF = GRIS;
