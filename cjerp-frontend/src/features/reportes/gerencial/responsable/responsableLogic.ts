import type { RptResponsableRow } from "../../../../api/reporteResponsableService";

export type VinculoFiltro = "todos" | "conPago" | "sinPago" | "planillaSinOc";
export type Agrupacion = "responsable" | "cliente" | "proyecto" | "site" | "clienteProyecto";

export const AGRUPACIONES: Array<{ value: Agrupacion; label: string }> = [
  { value: "responsable", label: "Responsable" },
  { value: "cliente", label: "Cliente" },
  { value: "proyecto", label: "Proyecto" },
  { value: "site", label: "Site" },
  { value: "clienteProyecto", label: "Cliente / Proyecto" },
];

export type FiltrosReporte = {
  fechaOcDesde: string;
  fechaOcHasta: string;
  fechaDepDesde: string;
  fechaDepHasta: string;
  cliente: string;
  proyecto: string;
  site: string[];
  tipoTrabajo: string[];
  tipoRegistro: string;
  estado: string;
  moneda: string;
  vinculo: VinculoFiltro;
  /** Retira del análisis las OC (todas sus filas) sin ningún gasto/pago asociado. */
  omitirOcSinGastos: boolean;
};

export const FILTROS_VACIOS: FiltrosReporte = {
  fechaOcDesde: "",
  fechaOcHasta: "",
  fechaDepDesde: "",
  fechaDepHasta: "",
  cliente: "",
  proyecto: "",
  site: [],
  tipoTrabajo: [],
  tipoRegistro: "",
  estado: "",
  moneda: "",
  vinculo: "todos",
  omitirOcSinGastos: false,
};

export type EstadoPagoOc = "PAGADO COMPLETO" | "PAGO PARCIAL" | "SIN PAGO" | "PAGADO EN EXCESO" | "";

/** Fila del store enriquecida con las claves de cálculo (sin duplicar montos de OC). */
export type FilaReporte = RptResponsableRow & {
  id: number;
  responsableId: string;
  responsable: string;
  documento: string;
  monedaClave: string;
  estadoNombre: string;
  /** IdOc|Fila: granularidad del importe de la OC. */
  ocKey: string;
  /** Primera fila de su OC/fila; el subtotal de la OC solo se suma en ella. */
  primeraDeOc: boolean;
  pagosDeLaOc: number;
  /** Suma de los gastos asociados a la OC/fila en la moneda de la OC (cada gasto una sola vez). */
  gastoDeLaOc: number;
  /** Algún gasto asociado está en una moneda distinta a la de la OC (no se convierte). */
  gastoOtraMoneda: boolean;
  /** Subtotal de la OC/fila menos el gasto asociado (negativo = pagado en exceso). */
  saldoOc: number;
  estadoPagoOc: EstadoPagoOc;
};

export const SIN_MONEDA = "—";

/** Un site se identifica por IdSite + CorreSite (la llave es compuesta). */
export function claveSite(fila: Pick<FilaReporte, "idSite" | "correSite">) {
  return `${fila.idSite}|${fila.correSite ?? ""}`;
}

export function etiquetaSite(fila: Pick<FilaReporte, "idSite" | "correSite" | "site">) {
  const codigo = `${fila.idSite || "—"}-${fila.correSite ?? "—"}`;
  return fila.site ? `${fila.site} [${codigo}]` : `SIN SITE [${codigo}]`;
}
const TOLERANCIA = 0.005;

/** Nombres de estado de Planilla confirmados en el sistema; el store solo entrega pagadas (4). */
const ESTADOS_PLANILLA: Record<string, string> = { "4": "PAGADO" };

export function nombreEstadoPlanilla(codigo: string) {
  const limpio = codigo.trim();
  if (!limpio) return "—";
  return ESTADOS_PLANILLA[limpio] ?? `Estado ${limpio}`;
}

/** dd/MM/yyyy sin desfase de zona horaria. */
export function formatFecha(valor: string) {
  const texto = (valor ?? "").trim();
  if (!texto) return "";
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const parsed = new Date(texto);
  if (Number.isNaN(parsed.getTime())) return texto;
  const dd = String(parsed.getDate()).padStart(2, "0");
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${parsed.getFullYear()}`;
}

export function fechaClave(valor: string) {
  const iso = (valor ?? "").trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : "";
}

export function formatMonto(valor: number) {
  return valor.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatMontoMoneda(valor: number, moneda: string) {
  return moneda && moneda !== SIN_MONEDA ? `${moneda} ${formatMonto(valor)}` : formatMonto(valor);
}

export function formatPorcentaje(valor: number) {
  return `${valor.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;
}

function mismaMoneda(gasto: string, oc: string) {
  return !gasto || !oc || gasto.trim().toLowerCase() === oc.trim().toLowerCase();
}

function estadoPago(subtotal: number, gasto: number): EstadoPagoOc {
  if (gasto <= TOLERANCIA) return "SIN PAGO";
  const saldo = subtotal - gasto;
  if (Math.abs(saldo) <= TOLERANCIA) return "PAGADO COMPLETO";
  return saldo > 0 ? "PAGO PARCIAL" : "PAGADO EN EXCESO";
}

export function prepararFilas(rows: RptResponsableRow[]): FilaReporte[] {
  // Gastos por OC/fila: cada correlativo cuenta una sola vez aunque el store repita la fila.
  const gastosPorOc = new Map<string, Map<number, { monto: number; moneda: string }>>();
  rows.forEach((row) => {
    if (!row.tieneOc || row.idOc === null || !row.tienePago || row.correlativoPago === null) return;
    const key = `${row.idOc}|${row.fila ?? ""}`;
    const gastos = gastosPorOc.get(key) ?? new Map<number, { monto: number; moneda: string }>();
    gastos.set(row.correlativoPago, { monto: row.subtotalGasto ?? 0, moneda: row.monedaGasto });
    gastosPorOc.set(key, gastos);
  });

  const subtotalPorOc = new Map<string, number>();
  const monedaPorOc = new Map<string, string>();
  rows.forEach((row) => {
    if (!row.tieneOc) return;
    const key = `${row.idOc ?? ""}|${row.fila ?? ""}`;
    if (!subtotalPorOc.has(key)) {
      subtotalPorOc.set(key, row.subtotalOc ?? 0);
      monedaPorOc.set(key, row.moneda);
    }
  });

  const vistas = new Set<string>();
  return rows.map((row, index) => {
    const ocKey = row.tieneOc ? `${row.idOc ?? ""}|${row.fila ?? ""}` : "";
    const primeraDeOc = Boolean(ocKey) && !vistas.has(ocKey);
    if (ocKey) vistas.add(ocKey);

    // Responsable: el de la OC; en planillas sin OC, el de la planilla.
    const usaOc = row.tieneOc && (row.responsableOc || row.idResponsableOc !== null);
    const responsableId = usaOc ? String(row.idResponsableOc ?? "") : String(row.idResponsablePlanilla ?? "");
    const responsable = (usaOc ? row.responsableOc : row.responsablePlanilla) || row.responsableOc || row.responsablePlanilla || "SIN RESPONSABLE";
    const documento = (usaOc ? row.documentoResponsableOc : row.documentoResponsablePlanilla) || row.documentoResponsableOc || row.documentoResponsablePlanilla;

    const gastos = ocKey ? Array.from(gastosPorOc.get(ocKey)?.values() ?? []) : [];
    const monedaOc = ocKey ? monedaPorOc.get(ocKey) ?? "" : "";
    const gastoDeLaOc = gastos.filter((g) => mismaMoneda(g.moneda, monedaOc)).reduce((total, g) => total + g.monto, 0);
    const subtotalOc = ocKey ? subtotalPorOc.get(ocKey) ?? 0 : 0;

    return {
      ...row,
      id: index,
      responsableId: responsableId || responsable,
      responsable,
      documento,
      monedaClave: row.tieneOc ? row.moneda || SIN_MONEDA : row.monedaGasto || SIN_MONEDA,
      estadoNombre: row.tienePago ? nombreEstadoPlanilla(row.estadoPlanilla) : "",
      ocKey,
      primeraDeOc,
      pagosDeLaOc: gastos.length,
      gastoDeLaOc,
      gastoOtraMoneda: gastos.some((g) => !mismaMoneda(g.moneda, monedaOc)),
      saldoOc: ocKey ? subtotalOc - gastoDeLaOc : 0,
      estadoPagoOc: ocKey ? estadoPago(subtotalOc, gastoDeLaOc) : "",
    };
  });
}

/**
 * Con filtro por sitio, los pagos (planillas) de otro sitio no deben contarse aunque la OC compartida pertenezca al sitio elegido.
 * Esos pagos se retiran de las filas antes de calcular gastos/saldos; la línea de la OC se conserva sin ese pago.
 */
export function limitarPagosPorSite(rows: RptResponsableRow[], sites: string[]): RptResponsableRow[] {
  if (sites.length === 0) return rows;
  const ids = new Set(sites.map((clave) => clave.split("|")[0].trim().toUpperCase()));
  const ajena = (row: RptResponsableRow) => row.tienePago && Boolean(row.idSitePlanilla) && !ids.has(row.idSitePlanilla.trim().toUpperCase());
  const lineaOc = (row: RptResponsableRow) => `${row.idOc ?? ""}|${row.fila ?? ""}`;

  const lineasConservadas = new Set<string>();
  rows.forEach((row) => {
    if (row.tieneOc && !ajena(row)) lineasConservadas.add(lineaOc(row));
  });

  const resultado: RptResponsableRow[] = [];
  rows.forEach((row) => {
    if (!ajena(row)) {
      resultado.push(row);
      return;
    }
    if (!row.tieneOc) return;
    const clave = lineaOc(row);
    if (lineasConservadas.has(clave)) return;
    lineasConservadas.add(clave);
    resultado.push({
      ...row,
      tienePago: false,
      correlativoPago: null,
      subtotalGasto: null,
      monedaGasto: "",
      fechaIngresoPlanilla: "",
      seriePago: "",
      nroOperacionPago: "",
      detallePago: "",
      solicitantePlanilla: "",
      fechaDeposito: "",
      estadoPlanilla: "",
      idSitePlanilla: "",
    });
  });
  return resultado;
}

/**
 * Las OC RECHAZADAS no forman parte del reporte: se retiran todas sus filas (OC, importes y pagos vinculados).
 * Devuelve cuántas se retiraron, y cuántas de ellas tenían pagos registrados, para poder avisarlo en pantalla.
 */
export function excluirOcRechazadas(filas: FilaReporte[]) {
  const rechazadas = new Set<number>();
  const conPago = new Set<number>();
  filas.forEach((f) => {
    if (!f.tieneOc || f.idOc === null) return;
    if (f.estadoAprobacionOc === "RECHAZADA") rechazadas.add(f.idOc);
    if (f.tienePago) conPago.add(f.idOc);
  });
  return {
    filas: filas.filter((f) => !(f.tieneOc && f.idOc !== null && rechazadas.has(f.idOc))),
    excluidas: rechazadas.size,
    excluidasConPagos: Array.from(rechazadas).filter((id) => conPago.has(id)).length,
  };
}

export function categoria(fila: FilaReporte): Exclude<VinculoFiltro, "todos"> {
  if (!fila.tieneOc) return "planillaSinOc";
  return fila.tienePago ? "conPago" : "sinPago";
}

export function filtrarFilas(filas: FilaReporte[], f: FiltrosReporte) {
  const enRango = (valor: string, desde: string, hasta: string) => {
    if (!desde && !hasta) return true;
    const clave = fechaClave(valor);
    if (!clave) return false;
    return (!desde || clave >= desde) && (!hasta || clave <= hasta);
  };

  // OC con al menos un gasto asociado (se evalúa sobre todas las filas de la consulta, antes de otros filtros).
  const ocConGastos = new Set<number>();
  if (f.omitirOcSinGastos) {
    filas.forEach((fila) => {
      if (fila.tieneOc && fila.idOc !== null && fila.tienePago) ocConGastos.add(fila.idOc);
    });
  }

  return filas.filter(
    (fila) =>
      (!f.omitirOcSinGastos || !fila.tieneOc || fila.idOc === null || ocConGastos.has(fila.idOc)) &&
      enRango(fila.fechaOc, f.fechaOcDesde, f.fechaOcHasta) &&
      enRango(fila.fechaDeposito, f.fechaDepDesde, f.fechaDepHasta) &&
      (!f.cliente || fila.cliente === f.cliente) &&
      (!f.proyecto || fila.proyecto === f.proyecto) &&
      (f.site.length === 0 || f.site.includes(claveSite(fila))) &&
      (f.tipoTrabajo.length === 0 || f.tipoTrabajo.includes(fila.tipoTrabajo)) &&
      (!f.tipoRegistro || fila.tipoRegistro === f.tipoRegistro) &&
      (!f.estado || fila.estadoNombre === f.estado) &&
      (!f.moneda || fila.monedaClave === f.moneda) &&
      (f.vinculo === "todos" || categoria(fila) === f.vinculo),
  );
}

/** OC/fila única (primera fila del store) con su gasto asociado ya calculado. */
function lineasUnicas(filas: FilaReporte[]) {
  return filas.filter((fila) => fila.tieneOc && fila.idOc !== null && fila.primeraDeOc);
}

/** Planillas pagadas sin OC, una vez por correlativo. */
function planillasSinOcUnicas(filas: FilaReporte[]) {
  const vistas = new Set<number>();
  return filas.filter((fila) => {
    if (fila.tieneOc || !fila.tienePago || fila.correlativoPago === null || vistas.has(fila.correlativoPago)) return false;
    vistas.add(fila.correlativoPago);
    return true;
  });
}

export type TotalMoneda = {
  moneda: string;
  lineasOc: number;
  totalOc: number;
  gasto: number;
  saldoPendiente: number;
  excedente: number;
  avance: number;
};

export type ResumenGeneral = {
  ocs: number;
  ocsPagadas: number;
  ocsParciales: number;
  ocsSinPago: number;
  ocsExceso: number;
  lineasOc: number;
  planillasSinOc: number;
  gastoSinOc: Array<{ moneda: string; monto: number }>;
  pagos: number;
  ocsConVariosPagos: number;
  lineasGastoOtraMoneda: number;
  porMoneda: TotalMoneda[];
};

/** Estado de pago de cada OC (por IdOc): pagada si todas sus filas lo están; sin pago si ninguna tiene gasto. */
function estadoPorOc(lineas: FilaReporte[]) {
  const porOc = new Map<number, FilaReporte[]>();
  lineas.forEach((l) => porOc.set(l.idOc as number, [...(porOc.get(l.idOc as number) ?? []), l]));
  return Array.from(porOc.entries()).map(([idOc, filas]) => {
    const conGasto = filas.filter((l) => l.gastoDeLaOc > TOLERANCIA).length;
    const saldo = filas.reduce((t, l) => t + Math.max(l.saldoOc, 0), 0);
    const exceso = filas.some((l) => l.saldoOc < -TOLERANCIA);
    const estado: EstadoPagoOc =
      conGasto === 0 ? "SIN PAGO" : saldo > TOLERANCIA ? "PAGO PARCIAL" : exceso ? "PAGADO EN EXCESO" : "PAGADO COMPLETO";
    return { idOc, estado };
  });
}

/** Calcula KPIs contando cada OC/fila una sola vez, aunque tenga varios gastos asociados. */
export function calcularResumen(filas: FilaReporte[]): ResumenGeneral {
  const lineas = lineasUnicas(filas);
  const estados = estadoPorOc(lineas);
  const sinOc = planillasSinOcUnicas(filas);
  const pagos = new Set<number>();
  filas.forEach((f) => {
    if (f.tienePago && f.correlativoPago !== null) pagos.add(f.correlativoPago);
  });

  const porMoneda = new Map<string, TotalMoneda>();
  lineas.forEach((linea) => {
    const total =
      porMoneda.get(linea.monedaClave) ??
      { moneda: linea.monedaClave, lineasOc: 0, totalOc: 0, gasto: 0, saldoPendiente: 0, excedente: 0, avance: 0 };
    total.lineasOc += 1;
    total.totalOc += linea.subtotalOc ?? 0;
    total.gasto += linea.gastoDeLaOc;
    if (linea.saldoOc > TOLERANCIA) total.saldoPendiente += linea.saldoOc;
    else if (linea.saldoOc < -TOLERANCIA) total.excedente += -linea.saldoOc;
    porMoneda.set(linea.monedaClave, total);
  });
  porMoneda.forEach((total) => {
    total.avance = total.totalOc > 0 ? (total.gasto / total.totalOc) * 100 : 0;
  });

  const gastoSinOc = new Map<string, number>();
  sinOc.forEach((f) => gastoSinOc.set(f.monedaClave, (gastoSinOc.get(f.monedaClave) ?? 0) + (f.subtotalGasto ?? 0)));

  return {
    ocs: estados.length,
    ocsPagadas: estados.filter((e) => e.estado === "PAGADO COMPLETO").length,
    ocsParciales: estados.filter((e) => e.estado === "PAGO PARCIAL").length,
    ocsSinPago: estados.filter((e) => e.estado === "SIN PAGO").length,
    ocsExceso: estados.filter((e) => e.estado === "PAGADO EN EXCESO").length,
    lineasOc: lineas.length,
    planillasSinOc: sinOc.length,
    gastoSinOc: Array.from(gastoSinOc, ([moneda, monto]) => ({ moneda, monto })),
    pagos: pagos.size,
    ocsConVariosPagos: new Set(lineas.filter((l) => l.pagosDeLaOc > 1).map((l) => l.idOc)).size,
    lineasGastoOtraMoneda: lineas.filter((l) => l.gastoOtraMoneda).length,
    porMoneda: Array.from(porMoneda.values()).sort((a, b) => a.moneda.localeCompare(b.moneda, "es")),
  };
}

function etiquetaGrupo(fila: FilaReporte, agrupacion: Agrupacion) {
  switch (agrupacion) {
    case "cliente":
      return fila.cliente || "SIN CLIENTE";
    case "proyecto":
      return fila.proyecto || "SIN PROYECTO";
    case "site":
      return etiquetaSite(fila);
    case "clienteProyecto":
      return `${fila.cliente || "SIN CLIENTE"} / ${fila.proyecto || "SIN PROYECTO"}`;
    default:
      return fila.responsable;
  }
}

export type ResumenGrupo = {
  clave: string;
  grupo: string;
  documento: string;
  moneda: string;
  ocs: number;
  pagos: number;
  ocsPagadas: number;
  ocsParciales: number;
  ocsSinPago: number;
  planillasSinOc: number;
  subtotalOc: number;
  gasto: number;
  saldoPendiente: number;
  excedente: number;
  avance: number;
  estado: EstadoPagoOc | "SIN OC";
};

/** Una fila por grupo y moneda; las planillas sin OC van en la fila sin moneda de OC. */
export function resumirPor(filas: FilaReporte[], agrupacion: Agrupacion): ResumenGrupo[] {
  type Acumulado = ResumenGrupo & { _lineasPorOc: Map<number, FilaReporte[]>; _pagos: Set<number> };
  const grupos = new Map<string, Acumulado>();
  const obtener = (fila: FilaReporte, moneda: string) => {
    const grupo = etiquetaGrupo(fila, agrupacion);
    const clave = `${agrupacion === "responsable" ? fila.responsableId : grupo}|${moneda}`;
    let acumulado = grupos.get(clave);
    if (!acumulado) {
      acumulado = {
        clave,
        grupo,
        documento: agrupacion === "responsable" ? fila.documento : "",
        moneda,
        ocs: 0,
        pagos: 0,
        ocsPagadas: 0,
        ocsParciales: 0,
        ocsSinPago: 0,
        planillasSinOc: 0,
        subtotalOc: 0,
        gasto: 0,
        saldoPendiente: 0,
        excedente: 0,
        avance: 0,
        estado: "SIN OC",
        _lineasPorOc: new Map(),
        _pagos: new Set(),
      };
      grupos.set(clave, acumulado);
    }
    return acumulado;
  };

  lineasUnicas(filas).forEach((linea) => {
    const acumulado = obtener(linea, linea.monedaClave);
    acumulado._lineasPorOc.set(linea.idOc as number, [...(acumulado._lineasPorOc.get(linea.idOc as number) ?? []), linea]);
    acumulado.subtotalOc += linea.subtotalOc ?? 0;
    acumulado.gasto += linea.gastoDeLaOc;
    if (linea.saldoOc > TOLERANCIA) acumulado.saldoPendiente += linea.saldoOc;
    else if (linea.saldoOc < -TOLERANCIA) acumulado.excedente += -linea.saldoOc;
  });
  filas.forEach((fila) => {
    if (fila.tieneOc && fila.tienePago && fila.correlativoPago !== null) {
      obtener(fila, fila.monedaClave)._pagos.add(fila.correlativoPago);
    }
  });
  planillasSinOcUnicas(filas).forEach((fila) => {
    obtener(fila, SIN_MONEDA).planillasSinOc += 1;
  });

  return Array.from(grupos.values())
    .map(({ _lineasPorOc, _pagos, ...rest }) => {
      const estados = estadoPorOc(Array.from(_lineasPorOc.values()).flat());
      const avance = rest.subtotalOc > 0 ? (rest.gasto / rest.subtotalOc) * 100 : 0;
      const estado: ResumenGrupo["estado"] =
        estados.length === 0
          ? "SIN OC"
          : rest.saldoPendiente <= TOLERANCIA && rest.gasto > TOLERANCIA
            ? rest.excedente > TOLERANCIA
              ? "PAGADO EN EXCESO"
              : "PAGADO COMPLETO"
            : rest.gasto <= TOLERANCIA
              ? "SIN PAGO"
              : "PAGO PARCIAL";
      return {
        ...rest,
        ocs: estados.length,
        pagos: _pagos.size,
        ocsPagadas: estados.filter((e) => e.estado === "PAGADO COMPLETO").length,
        ocsParciales: estados.filter((e) => e.estado === "PAGO PARCIAL").length,
        ocsSinPago: estados.filter((e) => e.estado === "SIN PAGO").length,
        avance,
        estado,
      };
    })
    .sort((a, b) => a.grupo.localeCompare(b.grupo, "es") || a.moneda.localeCompare(b.moneda, "es"));
}

export function opcionesDistintas(filas: FilaReporte[], campo: (fila: FilaReporte) => string) {
  return Array.from(new Set(filas.map(campo).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es"));
}

export function describirFiltros(f: FiltrosReporte, criterio: string, filas: FilaReporte[] = []) {
  const partes: string[] = [`Responsables: ${criterio}`];
  const rango = (etiqueta: string, desde: string, hasta: string) => {
    if (desde || hasta) partes.push(`${etiqueta}: ${desde ? formatFecha(desde) : "inicio"} al ${hasta ? formatFecha(hasta) : "hoy"}`);
  };
  rango("Fecha OC", f.fechaOcDesde, f.fechaOcHasta);
  rango("Fecha depósito", f.fechaDepDesde, f.fechaDepHasta);
  if (f.cliente) partes.push(`Cliente: ${f.cliente}`);
  if (f.proyecto) partes.push(`Proyecto: ${f.proyecto}`);
  if (f.site.length > 0) {
    const etiquetas = new Map(filas.map((fila) => [claveSite(fila), etiquetaSite(fila)]));
    partes.push(`Site: ${f.site.map((clave) => etiquetas.get(clave) ?? clave.replace("|", "-")).join(", ")}`);
  }
  if (f.tipoTrabajo.length > 0) partes.push(`Tipo de trabajo: ${f.tipoTrabajo.join(", ")}`);
  if (f.tipoRegistro) partes.push(`Tipo de registro: ${f.tipoRegistro}`);
  if (f.estado) partes.push(`Estado de planilla: ${f.estado}`);
  if (f.moneda) partes.push(`Moneda: ${f.moneda}`);
  if (f.vinculo !== "todos") {
    partes.push(`Vínculo: ${f.vinculo === "conPago" ? "Con pago" : f.vinculo === "sinPago" ? "Sin pago" : "Planilla sin OC"}`);
  }
  if (f.omitirOcSinGastos) partes.push("Se omiten las OC sin gastos asociados");
  return partes;
}

export function periodoConsultado(filas: FilaReporte[], f: FiltrosReporte) {
  if (f.fechaOcDesde || f.fechaOcHasta) {
    return `OC del ${f.fechaOcDesde ? formatFecha(f.fechaOcDesde) : "inicio"} al ${f.fechaOcHasta ? formatFecha(f.fechaOcHasta) : "hoy"}`;
  }
  const claves = filas.map((fila) => fechaClave(fila.fechaOc)).filter(Boolean).sort();
  return claves.length ? `OC emitidas entre el ${formatFecha(claves[0])} y el ${formatFecha(claves[claves.length - 1])} (rango de los datos, sin filtro de fecha)` : "Sin fechas de OC en el resultado";
}
