import { useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import DataGridPro from "../../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../../components/datagrid/types";
import {
  insertarOrdenCompra,
  type OrdenCompraInsertDetallePayload,
  type OrdenCompraInsertPayload,
} from "../../../api/ordenCompraService";
import { getAuthUser } from "../../../utils/authStorage";
import { getHttpErrorMessage } from "../../../utils/httpError";

/**
 * Carga masiva de órdenes de compra desde el Excel "Masivo_v1.xlsx".
 * Solo se leen las pestañas CabOrdenCompra (una fila por OC) y DetOrdenCompra
 * (FilaCabecera = número de fila real de su cabecera). Cada OC se graba con el
 * mismo endpoint de oc_v1 (POST /facturacionfinanciera/oc), por lo que se aplican
 * las mismas validaciones y el recálculo de totales del backend.
 */

const HOJA_CAB = "CabOrdenCompra";
const HOJA_DET = "DetOrdenCompra";

type Celda = unknown;
type FilaHoja = Celda[];

type DetalleCarga = {
  filaExcel: number;
  filaCabecera: number;
  cliente: string;
  proyecto: string;
  site: string;
  tipoTrabajo: string;
  tarea: string;
  detalle: string;
  cantidad: number;
  precioUnitario: number;
  importe: number;
  ot: string;
  idCliente: number;
  idProyecto: number;
  idSite: string;
  correlativo: number;
  idTarea: number;
  errores: string[];
};

type EstadoCarga = "pendiente" | "error" | "grabando" | "grabada" | "fallida";

type OrdenCarga = {
  filaExcel: number;
  moneda: string;
  solicitante: string;
  responsable: string;
  validador: string;
  gestor: string;
  comprobante: string;
  tipoPago: string;
  diasPago: number;
  observacion: string;
  idSolicitante: number;
  idValidador: number;
  idGestor: number;
  idResponsable: number;
  idMoneda: number;
  idComprobante: number;
  idFormaPago: number;
  detalles: DetalleCarga[];
  errores: string[];
  estado: EstadoCarga;
  idOcGenerado: number | null;
  mensaje: string;
};

type OrdenGridRow = {
  filaExcel: number;
  solicitante: string;
  responsable: string;
  moneda: string;
  comprobante: string;
  tipoPago: string;
  posiciones: number;
  subtotal: number;
  estado: string;
  idOc: number | null;
  mensaje: string;
};

type DetalleGridRow = {
  clave: string;
  filaCabecera: number;
  filaExcel: number;
  cliente: string;
  proyecto: string;
  site: string;
  tipoTrabajo: string;
  tarea: string;
  detalle: string;
  cantidad: number;
  precioUnitario: number;
  importe: number;
  mensaje: string;
};

const ESTADO_TEXTO: Record<EstadoCarga, string> = {
  pendiente: "Lista para grabar",
  error: "Con errores",
  grabando: "Grabando…",
  grabada: "Grabada",
  fallida: "No se pudo grabar",
};

function getLimaNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "00";
  return {
    fecha: `${part("year")}-${part("month")}-${part("day")}`,
    hora: `${part("hour")}:${part("minute")}:${part("second")}`,
  };
}

const texto = (valor: Celda): string => (valor === null || valor === undefined ? "" : String(valor).trim());

function numero(valor: Celda): number {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  const bruto = texto(valor).replace(/\s/g, "");
  // Texto pegado desde Excel en configuración regional con coma decimal ("1,24").
  const limpio = /^-?\d+,\d{1,2}$/.test(bruto) ? bruto.replace(",", ".") : bruto.replace(/,/g, "");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

const normalizar = (valor: string) =>
  valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();

/** Índice de columnas por nombre de encabezado (tolera tildes, espacios y mayúsculas). */
function mapaColumnas(encabezado: FilaHoja | undefined): Map<string, number> {
  const mapa = new Map<string, number>();
  (encabezado ?? []).forEach((celda, index) => {
    const clave = normalizar(texto(celda));
    if (clave && !mapa.has(clave)) mapa.set(clave, index);
  });
  return mapa;
}

function leer(fila: FilaHoja, mapa: Map<string, number>, ...nombres: string[]): Celda {
  for (const nombre of nombres) {
    const index = mapa.get(normalizar(nombre));
    if (index !== undefined && fila[index] !== undefined && texto(fila[index]) !== "") return fila[index];
  }
  return "";
}

/** "NOMBRE | 123" → 123. Es el formato de los desplegables de la plantilla. */
function idDesdeSeleccion(valor: string): number {
  const partes = valor.split("|");
  if (partes.length < 2) return 0;
  const n = Number(partes[partes.length - 1].trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** "SITE | TA2582 | Corr. 1" → { idSite, correlativo }. */
function siteDesdeSeleccion(valor: string): { idSite: string; correlativo: number } {
  const partes = valor.split("|").map((p) => p.trim());
  if (partes.length < 2) return { idSite: "", correlativo: 0 };
  const corr = /(\d+)\s*$/.exec(partes[2] ?? "");
  return { idSite: partes[1], correlativo: corr ? Number(corr[1]) : 0 };
}

type Catalogo = Map<string, number>;

/** Catálogo nombre→id desde la propia hoja de catálogo del Excel (respaldo si las columnas Id no traen valor). */
function catalogoDesdeHoja(filas: FilaHoja[] | undefined, columnaNombre = 1): Catalogo {
  const mapa: Catalogo = new Map();
  (filas ?? []).slice(1).forEach((fila) => {
    const id = numero(fila[0]);
    const nombre = texto(fila[columnaNombre]).toUpperCase();
    if (id > 0 && nombre && !mapa.has(nombre)) mapa.set(nombre, id);
  });
  return mapa;
}

const MONEDAS_BASE: Catalogo = new Map([
  ["SOLES", 1],
  ["DOLARES", 2],
  ["EUROS", 3],
  ["PESO DOMINICANO", 4],
  ["PESO COLOMBIANO", 5],
]);

const FORMAS_PAGO_BASE: Catalogo = new Map([
  ["CONTADO", 1],
  ["CREDITO", 2],
  ["LETRAS", 3],
]);

async function leerArchivo(file: File): Promise<OrdenCarga[]> {
  const XLSX = await import("xlsx");
  const libro = XLSX.read(await file.arrayBuffer(), { type: "array" });

  const hojaCab = libro.Sheets[HOJA_CAB];
  const hojaDet = libro.Sheets[HOJA_DET];
  if (!hojaCab || !hojaDet) {
    throw new Error(`El archivo debe contener las pestañas ${HOJA_CAB} y ${HOJA_DET}.`);
  }

  const filas = (hoja: ReturnType<typeof XLSX.utils.sheet_to_json>) => hoja as unknown as FilaHoja[];
  const aFilas = (nombre: string): FilaHoja[] | undefined => {
    const hoja = libro.Sheets[nombre];
    return hoja ? filas(XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "", raw: true })) : undefined;
  };

  return construirOrdenes(aFilas(HOJA_CAB) ?? [], aFilas(HOJA_DET) ?? [], aFilas);
}

/** Convierte texto pegado desde Excel (columnas separadas por tab, primera fila = encabezados) en filas de hoja. */
function filasDesdeTexto(entrada: string): FilaHoja[] {
  const filas: FilaHoja[] = [];
  let fila: string[] = [];
  let celda = "";
  let entreComillas = false;
  for (let i = 0; i < entrada.length; i += 1) {
    const c = entrada[i];
    if (entreComillas) {
      if (c === '"' && entrada[i + 1] === '"') {
        celda += '"';
        i += 1;
      } else if (c === '"') {
        entreComillas = false;
      } else {
        celda += c;
      }
    } else if (c === '"' && celda === "") {
      entreComillas = true;
    } else if (c === "\t") {
      fila.push(celda);
      celda = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && entrada[i + 1] === "\n") i += 1;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else {
      celda += c;
    }
  }
  if (celda !== "" || fila.length > 0) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas;
}

function leerTextoPegado(textoCab: string, textoDet: string): OrdenCarga[] {
  if (!textoCab.trim() || !textoDet.trim()) {
    throw new Error(`Pegue los datos de ${HOJA_CAB} y de ${HOJA_DET}, incluyendo la fila de encabezados.`);
  }
  // Sin hojas de catálogo: los IDs deben venir en las columnas Id* o en el formato "NOMBRE | id".
  return construirOrdenes(filasDesdeTexto(textoCab), filasDesdeTexto(textoDet), () => undefined);
}

function construirOrdenes(
  cab: FilaHoja[],
  det: FilaHoja[],
  aFilas: (nombre: string) => FilaHoja[] | undefined
): OrdenCarga[] {
  const mCab = mapaColumnas(cab[0]);
  const mDet = mapaColumnas(det[0]);

  const faltanCab = ["moneda", "solicitante", "responsable", "validador", "comprobante"].filter((c) => !mCab.has(c));
  const faltanDet = ["filacabecera", "detalle", "cantidad", "preciounitario"].filter((c) => !mDet.has(c));
  if (faltanCab.length > 0 || faltanDet.length > 0) {
    throw new Error(
      `Faltan columnas en la plantilla: ${[...faltanCab.map((c) => `${HOJA_CAB}.${c}`), ...faltanDet.map((c) => `${HOJA_DET}.${c}`)].join(", ")}.`
    );
  }

  const catClientes = catalogoDesdeHoja(aFilas("Cat_Clientes"));
  const catProyectos = catalogoDesdeHoja(aFilas("Cat_Proyectos"));
  const catTareas = catalogoDesdeHoja(aFilas("Cat_Tareas"));
  const catMonedas = new Map([...MONEDAS_BASE, ...catalogoDesdeHoja(aFilas("Cat_Monedas"))]);
  const catPago = new Map([...FORMAS_PAGO_BASE, ...catalogoDesdeHoja(aFilas("Cat_TipoPago"))]);
  const catComprobantes = catalogoDesdeHoja(aFilas("Cat_Comprobantes"));

  const ordenes = new Map<number, OrdenCarga>();

  cab.forEach((fila, index) => {
    if (index === 0) return;
    const filaExcel = index + 1;
    const campos = ["Moneda", "Solicitante", "Responsable", "Validador", "Gestor", "Comprobante", "Subtotal"];
    if (campos.every((c) => texto(leer(fila, mCab, c)) === "")) return;

    const moneda = texto(leer(fila, mCab, "Moneda"));
    const comprobante = texto(leer(fila, mCab, "Comprobante"));
    const tipoPago = texto(leer(fila, mCab, "Tipo de pago"));
    const solicitante = texto(leer(fila, mCab, "Solicitante"));
    const responsable = texto(leer(fila, mCab, "Responsable"));
    const validador = texto(leer(fila, mCab, "Validador"));
    const gestor = texto(leer(fila, mCab, "Gestor"));

    const idValidador = numero(leer(fila, mCab, "IdValidador")) || idDesdeSeleccion(validador);
    ordenes.set(filaExcel, {
      filaExcel,
      moneda,
      solicitante,
      responsable,
      validador,
      gestor,
      comprobante,
      tipoPago,
      diasPago: numero(leer(fila, mCab, "DiasPago")),
      observacion: texto(leer(fila, mCab, "Observación", "Observacion")),
      idSolicitante: numero(leer(fila, mCab, "IdSolicitante")) || idDesdeSeleccion(solicitante),
      idValidador,
      idGestor: numero(leer(fila, mCab, "IdGestor")) || idDesdeSeleccion(gestor) || idValidador,
      idResponsable: numero(leer(fila, mCab, "IdResponsable")) || idDesdeSeleccion(responsable),
      idMoneda: numero(leer(fila, mCab, "IdMoneda")) || catMonedas.get(moneda.toUpperCase()) || 0,
      idComprobante:
        numero(leer(fila, mCab, "IdComprobante")) ||
        idDesdeSeleccion(comprobante) ||
        catComprobantes.get(comprobante.toUpperCase()) ||
        0,
      idFormaPago: numero(leer(fila, mCab, "IdFormaPago")) || catPago.get(tipoPago.toUpperCase()) || 0,
      detalles: [],
      errores: [],
      estado: "pendiente",
      idOcGenerado: null,
      mensaje: "",
    });
  });

  if (ordenes.size === 0) {
    throw new Error(`La pestaña ${HOJA_CAB} no tiene órdenes de compra.`);
  }

  const primeraCabecera = Math.min(...ordenes.keys());
  let ultimaCabecera = 0;
  const huerfanos: string[] = [];

  det.forEach((fila, index) => {
    if (index === 0) return;
    const filaExcel = index + 1;
    const campos = ["Cliente", "Proyecto", "Site", "Detalle", "Cantidad", "PrecioUnitario"];
    if (campos.every((c) => texto(leer(fila, mDet, c)) === "")) return;

    // Si FilaCabecera viene vacía se asume la cabecera de la fila de detalle anterior (o la primera OC).
    const declarada = numero(leer(fila, mDet, "FilaCabecera"));
    const filaCabecera = declarada > 0 ? declarada : ultimaCabecera || primeraCabecera;
    ultimaCabecera = filaCabecera;

    const cliente = texto(leer(fila, mDet, "Cliente"));
    const proyecto = texto(leer(fila, mDet, "Proyecto"));
    const site = texto(leer(fila, mDet, "Site"));
    const tarea = texto(leer(fila, mDet, "Tarea"));
    const siteSel = siteDesdeSeleccion(site);
    const cantidad = numero(leer(fila, mDet, "Cantidad"));
    const precioUnitario = numero(leer(fila, mDet, "PrecioUnitario"));
    const importeExcel = numero(leer(fila, mDet, "Importe"));

    const item: DetalleCarga = {
      filaExcel,
      filaCabecera,
      cliente,
      proyecto,
      site,
      tipoTrabajo: texto(leer(fila, mDet, "TipoTrabajo", "Tipo de trabajo")),
      tarea,
      detalle: texto(leer(fila, mDet, "Detalle")),
      cantidad,
      precioUnitario,
      importe: importeExcel > 0 ? importeExcel : Math.round(cantidad * precioUnitario * 100) / 100,
      ot: texto(leer(fila, mDet, "OT")),
      idCliente: numero(leer(fila, mDet, "IdCliente")) || catClientes.get(cliente.toUpperCase()) || 0,
      idProyecto: numero(leer(fila, mDet, "IdProyecto")) || catProyectos.get(proyecto.toUpperCase()) || 0,
      idSite: texto(leer(fila, mDet, "IdSite")) || siteSel.idSite,
      correlativo: numero(leer(fila, mDet, "Correlativo")) || siteSel.correlativo,
      idTarea: numero(leer(fila, mDet, "IdTarea")) || catTareas.get(tarea.toUpperCase()) || 0,
      errores: [],
    };
    if (!item.tipoTrabajo) item.tipoTrabajo = texto(leer(fila, mDet, "Tipo de trabajo"));

    const orden = ordenes.get(filaCabecera);
    if (!orden) {
      huerfanos.push(`Detalle fila ${filaExcel}: FilaCabecera ${filaCabecera} no corresponde a una OC de ${HOJA_CAB}.`);
      return;
    }
    orden.detalles.push(item);
  });

  const lista = [...ordenes.values()];
  lista.forEach(validarOrden);
  if (huerfanos.length > 0 && lista[0]) lista[0].errores.push(...huerfanos);
  lista.forEach((o) => {
    if (o.errores.length > 0 || o.detalles.some((d) => d.errores.length > 0)) o.estado = "error";
  });
  return lista;
}

/** Mismas reglas que valida el backend en POST /facturacionfinanciera/oc. */
function validarOrden(orden: OrdenCarga) {
  const errores: string[] = [];
  if (orden.idSolicitante <= 0) errores.push("Solicitante no válido.");
  if (orden.idResponsable <= 0) errores.push("Responsable no válido.");
  if (orden.idValidador <= 0) errores.push("Validador no válido.");
  if (orden.idGestor <= 0) errores.push("Gestor no válido.");
  if (orden.idMoneda <= 0) errores.push("Moneda no válida.");
  if (orden.idComprobante <= 0) errores.push("Comprobante no válido.");
  if (orden.idFormaPago <= 0) errores.push("Tipo de pago no válido.");
  if (orden.detalles.length === 0) errores.push("No tiene posiciones en DetOrdenCompra.");
  orden.errores = errores;

  orden.detalles.forEach((d) => {
    if (d.idCliente <= 0 || d.idProyecto <= 0 || !d.idSite) d.errores.push("Falta cliente, proyecto o site.");
    if (!d.tipoTrabajo || d.idTarea <= 0) d.errores.push("Falta tipo de trabajo o tarea.");
    if (!d.detalle) d.errores.push("Falta el detalle.");
    if (d.cantidad <= 0) d.errores.push("Cantidad no válida.");
    if (d.precioUnitario <= 0) d.errores.push("Precio unitario no válido.");
  });
}

const subtotalOrden = (orden: OrdenCarga) =>
  Math.round(orden.detalles.reduce((acc, d) => acc + d.cantidad * d.precioUnitario, 0) * 100) / 100;

const estiloBoton = (primario: boolean, deshabilitado: boolean): CSSProperties => ({
  padding: "8px 16px",
  borderRadius: 6,
  border: primario ? "none" : "1px solid #cbd5e1",
  background: deshabilitado ? "#cbd5e1" : primario ? "#1d4ed8" : "#fff",
  color: primario ? "#fff" : "#0f172a",
  fontWeight: 600,
  cursor: deshabilitado ? "not-allowed" : "pointer",
});

const estiloKpi: CSSProperties = {
  padding: "8px 14px",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  background: "#fff",
  minWidth: 120,
};

export default function OcMasivoV1Page() {
  const authUser = getAuthUser();
  const userName =
    authUser?.usuario ??
    authUser?.username ??
    authUser?.userName ??
    authUser?.nombreEmpleado ??
    authUser?.nombre ??
    "sistema";

  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState("");
  const [ordenes, setOrdenes] = useState<OrdenCarga[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [vista, setVista] = useState<"ordenes" | "detalle">("ordenes");
  const [origen, setOrigen] = useState<"excel" | "pegar">("excel");
  const [pegadoCab, setPegadoCab] = useState("");
  const [pegadoDet, setPegadoDet] = useState("");

  const resumen = useMemo(() => {
    const total = ordenes.length;
    const listas = ordenes.filter((o) => o.estado === "pendiente" || o.estado === "fallida").length;
    const conErrores = ordenes.filter((o) => o.estado === "error").length;
    const grabadas = ordenes.filter((o) => o.estado === "grabada").length;
    const fallidas = ordenes.filter((o) => o.estado === "fallida").length;
    return { total, listas, conErrores, grabadas, fallidas };
  }, [ordenes]);

  const filasOrdenes = useMemo<OrdenGridRow[]>(
    () =>
      ordenes.map((o) => ({
        filaExcel: o.filaExcel,
        solicitante: o.solicitante,
        responsable: o.responsable,
        moneda: o.moneda,
        comprobante: o.comprobante,
        tipoPago: o.tipoPago,
        posiciones: o.detalles.length,
        subtotal: subtotalOrden(o),
        estado: ESTADO_TEXTO[o.estado],
        idOc: o.idOcGenerado,
        mensaje: [...o.errores, ...o.detalles.flatMap((d) => d.errores.map((e) => `Detalle fila ${d.filaExcel}: ${e}`))]
          .concat(o.mensaje ? [o.mensaje] : [])
          .join(" · "),
      })),
    [ordenes]
  );

  const filasDetalle = useMemo<DetalleGridRow[]>(
    () =>
      ordenes.flatMap((o) =>
        o.detalles.map((d) => ({
          clave: `${o.filaExcel}-${d.filaExcel}`,
          filaCabecera: o.filaExcel,
          filaExcel: d.filaExcel,
          cliente: d.cliente,
          proyecto: d.proyecto,
          site: d.site,
          tipoTrabajo: d.tipoTrabajo,
          tarea: d.tarea,
          detalle: d.detalle,
          cantidad: d.cantidad,
          precioUnitario: d.precioUnitario,
          importe: d.importe,
          mensaje: d.errores.join(" · "),
        }))
      ),
    [ordenes]
  );

  const columnasOrdenes = useMemo<GridColumn<OrdenGridRow>[]>(
    () => [
      { dataField: "filaExcel", caption: "Fila Excel", dataType: "number", width: 90, alignment: "center" },
      { dataField: "estado", caption: "Estado", width: 150 },
      { dataField: "idOc", caption: "N° OC", dataType: "number", width: 100, alignment: "center" },
      { dataField: "solicitante", caption: "Solicitante", minWidth: 220 },
      { dataField: "responsable", caption: "Responsable", minWidth: 220 },
      { dataField: "moneda", caption: "Moneda", width: 90 },
      { dataField: "comprobante", caption: "Comprobante", width: 130 },
      { dataField: "tipoPago", caption: "Tipo de pago", width: 110 },
      { dataField: "posiciones", caption: "Posiciones", dataType: "number", width: 100, alignment: "center" },
      { dataField: "subtotal", caption: "Subtotal", dataType: "number", width: 120, format: { type: "fixedPoint", precision: 2 } },
      { dataField: "mensaje", caption: "Mensaje", minWidth: 320 },
    ],
    []
  );

  const columnasDetalle = useMemo<GridColumn<DetalleGridRow>[]>(
    () => [
      { dataField: "filaCabecera", caption: "Cabecera (fila)", dataType: "number", width: 110, alignment: "center" },
      { dataField: "filaExcel", caption: "Fila Excel", dataType: "number", width: 90, alignment: "center" },
      { dataField: "cliente", caption: "Cliente", width: 120 },
      { dataField: "proyecto", caption: "Proyecto", width: 150 },
      { dataField: "site", caption: "Site", minWidth: 200 },
      { dataField: "tipoTrabajo", caption: "Tipo de trabajo", width: 120 },
      { dataField: "tarea", caption: "Tarea", width: 160 },
      { dataField: "detalle", caption: "Detalle", minWidth: 260 },
      { dataField: "cantidad", caption: "Cantidad", dataType: "number", width: 100, format: { type: "fixedPoint", precision: 2 } },
      { dataField: "precioUnitario", caption: "P. unitario", dataType: "number", width: 110, format: { type: "fixedPoint", precision: 2 } },
      { dataField: "importe", caption: "Importe", dataType: "number", width: 110, format: { type: "fixedPoint", precision: 2 } },
      { dataField: "mensaje", caption: "Mensaje", minWidth: 240 },
    ],
    []
  );

  const onArchivo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setInfo("");
    setOrdenes([]);
    setLeyendo(true);
    try {
      if (!/\.xlsx?$/i.test(file.name)) throw new Error("Solo se permiten archivos Excel (.xlsx / .xls).");
      const lista = await leerArchivo(file);
      setArchivo(file.name);
      setOrdenes(lista);
    } catch (err) {
      setArchivo("");
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo Excel.");
    } finally {
      setLeyendo(false);
    }
  };

  const validarPegado = () => {
    setError("");
    setInfo("");
    setOrdenes([]);
    try {
      const lista = leerTextoPegado(pegadoCab, pegadoDet);
      setArchivo("Datos pegados");
      setOrdenes(lista);
    } catch (err) {
      setArchivo("");
      setError(err instanceof Error ? err.message : "No se pudieron leer los datos pegados.");
    }
  };

  const actualizarOrden = (filaExcel: number, cambios: Partial<OrdenCarga>) =>
    setOrdenes((prev) => prev.map((o) => (o.filaExcel === filaExcel ? { ...o, ...cambios } : o)));

  const grabar = async () => {
    const porGrabar = ordenes.filter((o) => o.estado === "pendiente" || o.estado === "fallida");
    if (porGrabar.length === 0) return;
    if (!window.confirm(`Se grabarán ${porGrabar.length} orden(es) de compra. ¿Desea continuar?`)) return;

    setGrabando(true);
    setError("");
    setInfo("");
    let ok = 0;
    let fallos = 0;
    const creadas: number[] = [];

    // Secuencial: cada OC se confirma en el servidor antes de enviar la siguiente.
    for (const orden of porGrabar) {
      actualizarOrden(orden.filaExcel, { estado: "grabando", mensaje: "" });
      const limaNow = getLimaNow();
      const payload: OrdenCompraInsertPayload = {
        idSolicitante: orden.idSolicitante,
        idResponsable: orden.idResponsable,
        idWeb: 1,
        fechaOrden: limaNow.fecha,
        observacion: orden.observacion,
        usuarioCreacion: String(userName),
        fechaCreacion: limaNow.fecha,
        horaCreacion: limaNow.hora,
        idMoneda: orden.idMoneda,
        idComprobante: orden.idComprobante,
        idEstado: 1,
        idValidador: orden.idValidador,
        idGestor: orden.idGestor,
        idFormaPago: orden.idFormaPago,
        diasPago: orden.diasPago,
        peso: 0,
        detalle: orden.detalles.map<OrdenCompraInsertDetallePayload>((d) => ({
          fila: null,
          idCliente: d.idCliente,
          idProyecto: d.idProyecto,
          idSite: d.idSite,
          correlativo: d.correlativo,
          tipoTrabajo: d.tipoTrabajo,
          idTarea: d.idTarea,
          ot: d.ot,
          detalle: d.detalle,
          cantidad: d.cantidad,
          precioUnitario: d.precioUnitario,
          idComprobante: orden.idComprobante,
          imgOc: "",
          imgPresupuesto: "",
          peso: 0,
          idEstadoDetalle: 1,
        })),
      };

      try {
        const response = await insertarOrdenCompra(payload);
        ok += 1;
        creadas.push(response.idOc);
        actualizarOrden(orden.filaExcel, {
          estado: "grabada",
          idOcGenerado: response.idOc,
          mensaje: `Orden de compra N° ${response.idOc} creada correctamente.`,
        });
      } catch (err) {
        fallos += 1;
        actualizarOrden(orden.filaExcel, {
          estado: "fallida",
          mensaje: getHttpErrorMessage(err, "No se pudo grabar la orden de compra."),
        });
      }
    }

    setGrabando(false);
    const nroOc = creadas.length > 0 ? ` N° de OC creada(s): ${creadas.join(", ")}.` : "";
    if (fallos > 0) {
      setError(`Se grabaron ${ok} OC y ${fallos} fallaron.${nroOc} Corrija y vuelva a grabar solo las pendientes.`);
    } else {
      setInfo(`Se grabaron ${ok} orden(es) de compra correctamente.${nroOc}`);
    }
  };

  const limpiar = () => {
    setOrdenes([]);
    setArchivo("");
    setError("");
    setInfo("");
    setPegadoCab("");
    setPegadoDet("");
  };

  const hayPorGrabar = resumen.listas > 0;

  return (
    <div style={{ display: "grid", gap: 14, padding: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20 }}>Orden de compra · Carga masiva</h2>
        <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
          Cargue el Excel con las pestañas {HOJA_CAB} (una fila por OC) y {HOJA_DET} (FilaCabecera = fila de su cabecera),
          revise la validación y grabe las órdenes.
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" style={estiloBoton(origen === "excel", false)} onClick={() => setOrigen("excel")}>Cargar Excel</button>
        <button type="button" style={estiloBoton(origen === "pegar", false)} onClick={() => setOrigen("pegar")}>Pegar datos</button>
      </div>

      {origen === "pegar" ? (
        <div style={{ display: "grid", gap: 10, padding: 12, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff" }}>
          <div style={{ color: "#475569", fontSize: 13, lineHeight: 1.5 }}>
            En <b>Masivo_v1.xlsx</b> (no requiere macros) seleccione el rango con datos de cada pestaña,
            <b> incluida la fila de encabezados</b> y las columnas de IDs (<i>IdSolicitante, IdCliente, IdTarea…</i>), cópielo (Ctrl+C) y péguelo
            en su cuadro (Ctrl+V). En {HOJA_DET}, <b>FilaCabecera</b> es la fila de su cabecera: la primera OC pegada es la fila 2, la siguiente la 3, etc.
            Si queda vacía se asume la cabecera de la posición anterior.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 10 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>
              {HOJA_CAB}
              <textarea
                value={pegadoCab}
                onChange={(e) => setPegadoCab(e.target.value)}
                placeholder="Pegue aquí la cabecera (con encabezados)"
                wrap="off"
                style={{ height: 160, fontFamily: "monospace", fontSize: 12, padding: 8, border: "1px solid #cbd5e1", borderRadius: 6, resize: "vertical" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>
              {HOJA_DET}
              <textarea
                value={pegadoDet}
                onChange={(e) => setPegadoDet(e.target.value)}
                placeholder="Pegue aquí el detalle (con encabezados)"
                wrap="off"
                style={{ height: 160, fontFamily: "monospace", fontSize: 12, padding: 8, border: "1px solid #cbd5e1", borderRadius: 6, resize: "vertical" }}
              />
            </label>
          </div>
          <div>
            <button
              type="button"
              style={estiloBoton(true, grabando || (!pegadoCab.trim() && !pegadoDet.trim()))}
              disabled={grabando || (!pegadoCab.trim() && !pegadoDet.trim())}
              onClick={validarPegado}
            >
              Validar datos pegados
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={onArchivo} style={{ display: "none" }} />
        {origen === "excel" ? (
          <button type="button" style={estiloBoton(false, leyendo || grabando)} disabled={leyendo || grabando} onClick={() => inputRef.current?.click()}>
            {leyendo ? "Leyendo…" : "Seleccionar archivo Excel"}
          </button>
        ) : null}
        <button type="button" style={estiloBoton(true, !hayPorGrabar || grabando)} disabled={!hayPorGrabar || grabando} onClick={() => void grabar()}>
          {grabando ? "Grabando…" : `Grabar OC${hayPorGrabar ? ` (${resumen.listas})` : ""}`}
        </button>
        <button type="button" style={estiloBoton(false, ordenes.length === 0 || grabando)} disabled={ordenes.length === 0 || grabando} onClick={limpiar}>
          Limpiar
        </button>
        {archivo ? <span style={{ color: "#475569", fontSize: 13 }}>Archivo: {archivo}</span> : null}
      </div>

      {error ? (
        <div style={{ padding: "8px 12px", borderRadius: 6, background: "#fef2f2", color: "#b91c1c", fontSize: 13 }}>{error}</div>
      ) : null}
      {info ? (
        <div style={{ padding: "8px 12px", borderRadius: 6, background: "#f0fdf4", color: "#15803d", fontSize: 13 }}>{info}</div>
      ) : null}

      {ordenes.length > 0 ? (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={estiloKpi}><div style={{ fontSize: 12, color: "#64748b" }}>OC en el archivo</div><b>{resumen.total}</b></div>
            <div style={estiloKpi}><div style={{ fontSize: 12, color: "#64748b" }}>Listas para grabar</div><b>{resumen.listas}</b></div>
            <div style={estiloKpi}><div style={{ fontSize: 12, color: "#64748b" }}>Con errores</div><b style={{ color: resumen.conErrores ? "#b91c1c" : undefined }}>{resumen.conErrores}</b></div>
            <div style={estiloKpi}><div style={{ fontSize: 12, color: "#64748b" }}>Grabadas</div><b style={{ color: "#15803d" }}>{resumen.grabadas}</b></div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={estiloBoton(vista === "ordenes", false)} onClick={() => setVista("ordenes")}>Órdenes</button>
            <button type="button" style={estiloBoton(vista === "detalle", false)} onClick={() => setVista("detalle")}>Posiciones</button>
          </div>

          {vista === "ordenes" ? (
            <DataGridPro<OrdenGridRow>
              dataSource={filasOrdenes}
              columns={columnasOrdenes}
              keyExpr="filaExcel"
              height="60vh"
              noDataText="Sin órdenes."
              stateStoringKey="oc_masivo_v1_ordenes"
              showSearchPanel={false}
              allowExport={false}
              autoExpandAll={false}
              rowAlternation={false}
              rowPadding="4px 8px"
              paging={{ pageSize: 50, pageSizes: [20, 50, 100, 250] }}
            />
          ) : (
            <DataGridPro<DetalleGridRow>
              dataSource={filasDetalle}
              columns={columnasDetalle}
              keyExpr="clave"
              height="60vh"
              noDataText="Sin posiciones."
              stateStoringKey="oc_masivo_v1_detalle"
              showSearchPanel={false}
              allowExport={false}
              autoExpandAll={false}
              rowAlternation={false}
              rowPadding="4px 8px"
              paging={{ pageSize: 50, pageSizes: [20, 50, 100, 250] }}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
