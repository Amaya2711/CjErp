import type { IngresoSerieMasivaItem, PedidoItem, SecundarioItem } from "../../../../../models/logisticaEquipos";

type Celda = string | number | boolean | Date | null | undefined;
type FilaCruda = Record<string, Celda>;

/** Clave de comparación de encabezados: sin tildes, espacios ni signos ("Región" = "REGION", "COD.PAP" = "codpap"). */
const clave = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

async function leerHoja(archivo: File, nombreHoja: string): Promise<FilaCruda[]> {
  const filas = await leerHojaOpcional(archivo, nombreHoja);
  if (filas === null) throw new Error(`El archivo no contiene la hoja ${nombreHoja}.`);
  return filas;
}

/** Devuelve null si la hoja no existe. */
async function leerHojaOpcional(archivo: File, nombreHoja: string): Promise<FilaCruda[] | null> {
  const XLSX = await import("xlsx");
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array", cellDates: true });
  const nombre = libro.SheetNames.find((n) => n.trim().toUpperCase() === nombreHoja.toUpperCase());
  if (!nombre) return null;
  return XLSX.utils.sheet_to_json<FilaCruda>(libro.Sheets[nombre], { defval: "", raw: true });
}

function indexar(fila: FilaCruda): Map<string, Celda> {
  const mapa = new Map<string, Celda>();
  Object.entries(fila).forEach(([columna, valor]) => mapa.set(clave(columna), valor));
  return mapa;
}

const texto = (valor: Celda) => (valor === null || valor === undefined ? "" : valor instanceof Date ? "" : String(valor).trim());

const numero = (valor: Celda) => {
  if (typeof valor === "number") return valor;
  const convertido = Number(String(valor ?? "").replace(",", ".").trim());
  return Number.isFinite(convertido) ? convertido : 0;
};

const fechaIso = (valor: Celda) => {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    // Las fechas de Excel llegan a medianoche local: se usan los componentes locales para no correr un día.
    const mes = String(valor.getMonth() + 1).padStart(2, "0");
    const dia = String(valor.getDate()).padStart(2, "0");
    return `${valor.getFullYear()}-${mes}-${dia}`;
  }
  const t = texto(valor);
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : "";
};

const ENCABEZADOS_PEDIDO = ["pedidosap", "codpap", "site", "cantsolicitada"];

/** Lee la hoja PRINCIPAL de la plantilla de pedidos (mismos encabezados que el formulario antiguo). Null si no existe. */
export async function leerPedidos(archivo: File): Promise<PedidoItem[] | null> {
  const filas = await leerHojaOpcional(archivo, "PRINCIPAL");
  if (filas === null) return null;
  if (filas.length === 0) throw new Error("La hoja PRINCIPAL no tiene registros.");

  const primera = indexar(filas[0]);
  const faltan = ENCABEZADOS_PEDIDO.filter((e) => !primera.has(e));
  if (faltan.length > 0) {
    throw new Error("La hoja PRINCIPAL no tiene las columnas esperadas (Pedido SAP, CODPAP, Site, Cant Solicitada...).");
  }

  return filas
    .map((cruda, indice) => {
      const f = indexar(cruda);
      const valor = (...nombres: string[]) => nombres.map((n) => f.get(n)).find((v) => v !== undefined);
      return {
        fila: indice + 2,
        pedidoSap: texto(valor("pedidosap")),
        idSolicitud: texto(valor("idsolicitud")),
        site: texto(valor("site")),
        descSite: texto(valor("descsite")),
        solicitante: texto(valor("solicitante")),
        codPap: texto(valor("codpap")),
        descripcion: texto(valor("descripcion")),
        cantSolicitada: numero(valor("cantsolicitada")),
        cantSap: numero(valor("cantpedidosap")),
        centro: texto(valor("centroorigen")),
        almOrigen: texto(valor("almorigen")),
        lote: texto(valor("lote")),
        obsSolic: texto(valor("obssolic")),
        region: texto(valor("region")),
        oc: texto(valor("oc")),
        posicion: texto(valor("posicion")),
        cliente: texto(valor("cliente")),
        proyecto: texto(valor("proyecto")),
        tipoTrabajo: texto(valor("tipotrabajo")),
        fecIngreso: fechaIso(valor("fecingreso")),
        guia: texto(valor("guia")),
      } satisfies PedidoItem;
    })
    .filter((p) => p.pedidoSap || p.codPap || p.site);
}

/** Lee la hoja PRINCIPAL de la plantilla de series (PEDIDO, COD.PAP, SITE, SERIE). */
export async function leerSeries(archivo: File): Promise<Array<IngresoSerieMasivaItem & { fila: number }>> {
  const filas = await leerHoja(archivo, "PRINCIPAL");
  if (filas.length === 0) throw new Error("La hoja PRINCIPAL no tiene registros.");

  const primera = indexar(filas[0]);
  if (!["pedido", "codpap", "serie"].every((e) => primera.has(e))) {
    throw new Error("La hoja PRINCIPAL debe tener las columnas PEDIDO, COD.PAP, SITE y SERIE.");
  }

  return filas
    .map((cruda, indice) => {
      const f = indexar(cruda);
      return {
        fila: indice + 2,
        pedido: texto(f.get("pedido")),
        codPap: texto(f.get("codpap")),
        site: texto(f.get("site")),
        serie: texto(f.get("serie")),
      };
    })
    .filter((s) => s.pedido || s.codPap || s.serie);
}

/** Lee la hoja SECUNDARIO de la plantilla de pedidos (reasignación entre sites). Null si no existe. */
export async function leerSecundario(archivo: File): Promise<SecundarioItem[] | null> {
  const filas = await leerHojaOpcional(archivo, "SECUNDARIO");
  if (filas === null) return null;
  if (filas.length === 0) return [];

  const primera = indexar(filas[0]);
  if (!["idmaterial", "idsolicitud", "site", "cantidad"].every((e) => primera.has(e))) {
    throw new Error("La hoja SECUNDARIO debe tener las columnas ID_MATERIAL, IdSolicitud, Site, Desc Site, CANTIDAD y LOTE.");
  }

  return filas
    .map((cruda, indice) => {
      const f = indexar(cruda);
      return {
        fila: indice + 2,
        idMaterial: texto(f.get("idmaterial")),
        idSolicitud: texto(f.get("idsolicitud")),
        site: texto(f.get("site")),
        descSite: texto(f.get("descsite")),
        descripcion: texto(f.get("descripcion")),
        cantidad: numero(f.get("cantidad")),
        lote: texto(f.get("lote")),
      } satisfies SecundarioItem;
    })
    .filter((s) => s.idMaterial || s.idSolicitud || s.site);
}
