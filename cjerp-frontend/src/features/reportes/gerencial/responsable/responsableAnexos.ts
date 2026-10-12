import { descargarOrdenCompraPdf } from "../../../../api/ordenCompraService";

/** Rectángulo clicable del informe (coordenadas de jsPDF en mm, origen arriba a la izquierda) que lleva al PDF de una OC. */
export type EnlaceAnexo = { pagina: number; x: number; y: number; ancho: number; alto: number; idOc: number };

export type PdfOc = { idOc: number; bytes: ArrayBuffer; paginas: number };

export type ResultadoDescarga = { disponibles: PdfOc[]; fallidas: number[] };

/** Descarga el PDF de cada OC con el mismo endpoint que usa oc_v2 y cuenta sus páginas. */
export async function descargarPdfsOc(ids: number[], onProgreso?: (hechas: number, total: number) => void): Promise<ResultadoDescarga> {
  const { PDFDocument } = await import("pdf-lib");
  const disponibles: PdfOc[] = [];
  const fallidas: number[] = [];
  let hechas = 0;

  const procesar = async (idOc: number) => {
    try {
      const blob = await descargarOrdenCompraPdf(idOc);
      if (!blob || blob.size === 0) throw new Error("PDF vacío");
      const bytes = await blob.arrayBuffer();
      const documento = await PDFDocument.load(bytes, { ignoreEncryption: true });
      disponibles.push({ idOc, bytes, paginas: documento.getPageCount() });
    } catch {
      fallidas.push(idOc);
    } finally {
      hechas += 1;
      onProgreso?.(hechas, ids.length);
    }
  };

  // Pocas descargas en paralelo para no saturar el servidor.
  const cola = [...ids];
  const trabajadores = Array.from({ length: Math.min(3, cola.length) }, async () => {
    while (cola.length > 0) {
      const siguiente = cola.shift();
      if (siguiente !== undefined) await procesar(siguiente);
    }
  });
  await Promise.all(trabajadores);

  disponibles.sort((a, b) => a.idOc - b.idOc);
  return { disponibles, fallidas: fallidas.sort((a, b) => a - b) };
}

const MM_A_PT = 72 / 25.4;

/**
 * Anexa los PDF de las OC al final del informe y convierte cada enlace en un salto a la primera página
 * de su OC, de modo que al hacer clic se abre el PDF correspondiente dentro del mismo archivo.
 */
export async function unirInformeConAnexos(informe: ArrayBuffer, anexos: PdfOc[], enlaces: EnlaceAnexo[]): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const base = await PDFDocument.load(informe);
  const paginasInforme = base.getPageCount();
  const inicioPorOc = new Map<number, number>();

  for (const anexo of anexos) {
    const origen = await PDFDocument.load(anexo.bytes, { ignoreEncryption: true });
    const copiadas = await base.copyPages(origen, origen.getPageIndices());
    inicioPorOc.set(anexo.idOc, base.getPageCount());
    copiadas.forEach((pagina) => base.addPage(pagina));
  }

  enlaces.forEach((enlace) => {
    const destino = inicioPorOc.get(enlace.idOc);
    if (destino === undefined || enlace.pagina < 1 || enlace.pagina > paginasInforme) return;
    const pagina = base.getPage(enlace.pagina - 1);
    const { height } = pagina.getSize();
    const x1 = enlace.x * MM_A_PT;
    const x2 = (enlace.x + enlace.ancho) * MM_A_PT;
    const yTop = height - enlace.y * MM_A_PT;
    const yBottom = height - (enlace.y + enlace.alto) * MM_A_PT;
    const anotacion = base.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x1, yBottom, x2, yTop],
      Border: [0, 0, 0],
      Dest: [base.getPage(destino).ref, "Fit"],
    });
    pagina.node.addAnnot(base.context.register(anotacion));
  });

  return base.save();
}
