// Exporta a PDF lo que se está viendo en la pantalla Ventas vs Gastos: filtros activos, KPIs, gráficos (se capturan de la
// página) y tablas con los mismos datos filtrados. jspdf y jspdf-autotable se cargan solo al exportar.

export type PdfKpi = { etiqueta: string; valor: string };

export type PdfTabla = {
  titulo: string;
  columnas: string[];
  filas: string[][];
  /** Fila final de totales (opcional). */
  totales?: string[];
  /** Índices de columna con importes (se alinean a la derecha). */
  numericas?: number[];
};

export type PdfOpciones = {
  archivo: string;
  titulo: string;
  filtros: string[];
  kpis: PdfKpi[];
  /** Contenedor del que se capturan los gráficos visibles (recharts). */
  contenedorGraficos: HTMLElement | null;
  /** Aclaraciones de color o lectura que no están dentro del gráfico. */
  notas?: string[];
  tablas: PdfTabla[];
};

type Imagen = { data: string; ancho: number; alto: number };
type Leyenda = { color: string; texto: string };

const MARGEN = 12;

// Dibuja un <svg> en un canvas y lo devuelve como PNG (sin dependencias externas).
async function svgAImagen(svg: SVGSVGElement): Promise<Imagen | null> {
  const caja = svg.getBoundingClientRect();
  if (caja.width <= 0 || caja.height <= 0) return null;
  const clon = svg.cloneNode(true) as SVGSVGElement;
  clon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clon.setAttribute("width", String(caja.width));
  clon.setAttribute("height", String(caja.height));
  clon.setAttribute("style", "font-family: Arial, Helvetica, sans-serif; background: #ffffff");
  const xml = new XMLSerializer().serializeToString(clon);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

  const imagen = await new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
  if (!imagen) return null;

  const escala = 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(caja.width * escala);
  canvas.height = Math.round(caja.height * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(imagen, 0, 0, canvas.width, canvas.height);
  return { data: canvas.toDataURL("image/png"), ancho: caja.width, alto: caja.height };
}

// Título (h3 de la tarjeta que contiene el gráfico) y leyenda HTML de recharts, que no forma parte del svg.
function tituloYLeyenda(envoltorio: Element): { titulo: string; leyenda: Leyenda[] } {
  let nodo: Element | null = envoltorio;
  let titulo = "";
  for (let i = 0; nodo && i < 8 && !titulo; i += 1) {
    titulo = nodo.querySelector(":scope > h3, :scope > div > h3")?.textContent?.trim() ?? "";
    nodo = nodo.parentElement;
  }
  const leyenda: Leyenda[] = [];
  envoltorio.querySelectorAll(".recharts-legend-item").forEach((item) => {
    const texto = item.querySelector(".recharts-legend-item-text")?.textContent?.trim() ?? "";
    const trazo = item.querySelector("svg path, svg rect, svg line");
    const color = trazo?.getAttribute("fill") || trazo?.getAttribute("stroke") || "#64748B";
    if (texto) leyenda.push({ color, texto });
  });
  return { titulo, leyenda };
}

function colorRgb(color: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return [100, 116, 139];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export async function exportarPdf(opciones: PdfOpciones): Promise<void> {
  const [{ default: jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableModule.default;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const util = ancho - MARGEN * 2;
  let y = MARGEN;

  const asegurar = (necesario: number) => {
    if (y + necesario > alto - MARGEN) {
      doc.addPage();
      y = MARGEN;
    }
  };

  // Encabezado
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
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
    const lineas = doc.splitTextToSize(`Filtros: ${opciones.filtros.join("  ·  ")}`, util) as string[];
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
      doc.text(kpi.etiqueta, x + 3, y + 5);
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(kpi.valor, x + 3, y + 11.5);
    });
    y += 20;
  }

  // Gráficos visibles
  const envoltorios = opciones.contenedorGraficos ? Array.from(opciones.contenedorGraficos.querySelectorAll(".recharts-wrapper")) : [];
  for (const envoltorio of envoltorios) {
    const svg = envoltorio.querySelector("svg.recharts-surface") as SVGSVGElement | null;
    if (!svg) continue;
    const imagen = await svgAImagen(svg);
    if (!imagen) continue;
    const { titulo, leyenda } = tituloYLeyenda(envoltorio);

    // Tamaño: todo el ancho útil; si es muy alto se reduce para que quepa en una página.
    const maxAlto = alto - MARGEN * 2 - 14;
    let w = util;
    let h = (imagen.alto / imagen.ancho) * w;
    if (h > maxAlto) {
      h = maxAlto;
      w = (imagen.ancho / imagen.alto) * h;
    }
    asegurar(h + 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    if (titulo) doc.text(titulo, MARGEN, y + 3);
    y += 5;
    if (leyenda.length) {
      let x = MARGEN;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      for (const item of leyenda) {
        doc.setFillColor(...colorRgb(item.color));
        doc.rect(x, y - 2.2, 2.6, 2.6, "F");
        doc.setTextColor(71, 85, 105);
        doc.text(item.texto, x + 4, y);
        x += 8 + doc.getTextWidth(item.texto);
      }
      y += 3;
    }
    doc.addImage(imagen.data, "PNG", MARGEN, y, w, h);
    y += h + 6;
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
    y += 3;
  }

  // Tablas (los mismos datos filtrados que se ven en pantalla)
  for (const tabla of opciones.tablas) {
    asegurar(24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(tabla.titulo, MARGEN, y + 3);
    y += 5;
    const columnStyles: Record<number, { halign: "right" }> = {};
    for (const i of tabla.numericas ?? []) columnStyles[i] = { halign: "right" };
    autoTable(doc, {
      startY: y,
      margin: { left: MARGEN, right: MARGEN },
      head: [tabla.columnas],
      body: tabla.filas.length ? tabla.filas : [["Sin datos"]],
      foot: tabla.totales ? [tabla.totales] : undefined,
      showFoot: "lastPage",
      styles: { fontSize: 7.5, cellPadding: 1.4 },
      headStyles: { fillColor: [219, 234, 247], textColor: [31, 41, 55] },
      footStyles: { fillColor: [219, 234, 247], textColor: [31, 41, 55], fontStyle: "bold" },
      columnStyles,
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 8;
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
