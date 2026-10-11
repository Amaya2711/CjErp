import {
  calcularResumen,
  claveSite,
  describirFiltros,
  etiquetaSite,
  fechaClave,
  formatFecha,
  formatMonto,
  periodoConsultado,
  type EstadoPagoOc,
  type FilaReporte,
  type FiltrosReporte,
  type TotalMoneda,
} from "./responsableLogic";

export type OcAnalisis = {
  idOc: number;
  filas: string;
  fechaOc: string;
  solicitante: string;
  responsable: string;
  detalle: string;
  moneda: string;
  monto: number;
  gasto: number;
  saldo: number;
  estado: EstadoPagoOc;
  pagos: number;
  /** Estado de aprobación de la OC (CabOrdenCompra) y aprobadores registrados. */
  estadoAprobacion: string;
  aprobadores: Array<{ nivel: number; nombre: string; fecha: string }>;
};

export type PagoAnalisis = {
  correlativo: number;
  idOc: number | null;
  fila: number | null;
  fechaIngreso: string;
  fechaDeposito: string;
  solicitante: string;
  responsable: string;
  monto: number;
  moneda: string;
  estado: string;
  /** Días entre la fecha de la OC y el depósito (solo si hay OC y ambas fechas). */
  diasOcDeposito: number | null;
};

export type SitioAnalisis = {
  clave: string;
  etiqueta: string;
  idSite: string;
  correSite: number | null;
  cliente: string;
  proyecto: string;
  ocs: OcAnalisis[];
  pagos: PagoAnalisis[];
  totales: TotalMoneda[];
  primeraFechaOc: string;
  ultimaFechaDeposito: string;
  diasPromedio: number | null;
};

function aprobadoresDe(fila: FilaReporte | undefined) {
  if (!fila) return [];
  return [
    { nivel: 1, nombre: fila.aprobador1Oc, fecha: fila.fechaAprobador1Oc },
    { nivel: 2, nombre: fila.aprobador2Oc, fecha: fila.fechaAprobador2Oc },
    { nivel: 3, nombre: fila.aprobador3Oc, fecha: fila.fechaAprobador3Oc },
  ].filter((a) => a.nombre);
}

function diasEntre(desde: string, hasta: string) {
  const a = fechaClave(desde);
  const b = fechaClave(hasta);
  if (!a || !b) return null;
  const dias = Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
  return Number.isFinite(dias) ? dias : null;
}

/** Agrupa por sitio (IdSite + CorreSite): OCs por IdOc, pagos por correlativo, totales por moneda. */
export function analizarPorSitio(filas: FilaReporte[]): SitioAnalisis[] {
  const grupos = new Map<string, FilaReporte[]>();
  filas.forEach((fila) => {
    const clave = fila.idSite ? claveSite(fila) : "SIN SITE";
    grupos.set(clave, [...(grupos.get(clave) ?? []), fila]);
  });

  return Array.from(grupos.entries())
    .map(([clave, filasSitio]): SitioAnalisis => {
      const base = filasSitio[0];

      // OCs por IdOc (cada OC/fila una sola vez).
      const lineas = filasSitio.filter((f) => f.tieneOc && f.idOc !== null && f.primeraDeOc);
      const porOc = new Map<number, FilaReporte[]>();
      lineas.forEach((l) => porOc.set(l.idOc as number, [...(porOc.get(l.idOc as number) ?? []), l]));
      const ocs: OcAnalisis[] = Array.from(porOc.entries())
        .map(([idOc, ls]) => {
          const monto = ls.reduce((t, l) => t + (l.subtotalOc ?? 0), 0);
          const gasto = ls.reduce((t, l) => t + l.gastoDeLaOc, 0);
          const saldo = ls.reduce((t, l) => t + l.saldoOc, 0);
          const fechas = ls.map((l) => fechaClave(l.fechaOc)).filter(Boolean).sort();
          const estado: EstadoPagoOc =
            gasto <= 0.005 ? "SIN PAGO" : saldo > 0.005 ? "PAGO PARCIAL" : saldo < -0.005 ? "PAGADO EN EXCESO" : "PAGADO COMPLETO";
          return {
            idOc,
            filas: ls.map((l) => l.fila ?? "—").join(", "),
            fechaOc: fechas[0] ?? "",
            solicitante: ls.find((l) => l.solicitanteOc)?.solicitanteOc ?? "",
            responsable: ls[0].responsableOc || ls[0].responsable,
            detalle: ls.map((l) => l.detalleOc).filter(Boolean).join(" | "),
            moneda: ls[0].monedaClave,
            monto,
            gasto,
            saldo,
            estado,
            pagos: Math.max(...ls.map((l) => l.pagosDeLaOc)),
            estadoAprobacion: ls.find((l) => l.estadoAprobacionOc)?.estadoAprobacionOc ?? "SIN DATO",
            aprobadores: aprobadoresDe(ls.find((l) => l.estadoAprobacionOc)),
          };
        })
        .sort((a, b) => a.idOc - b.idOc);

      // Pagos por correlativo (Planilla).
      const vistos = new Set<number>();
      const pagos: PagoAnalisis[] = [];
      filasSitio.forEach((f) => {
        if (!f.tienePago || f.correlativoPago === null || vistos.has(f.correlativoPago)) return;
        vistos.add(f.correlativoPago);
        pagos.push({
          correlativo: f.correlativoPago,
          idOc: f.tieneOc ? f.idOc : null,
          fila: f.tieneOc ? f.fila : null,
          fechaIngreso: f.fechaIngresoPlanilla,
          fechaDeposito: f.fechaDeposito,
          solicitante: f.solicitantePlanilla,
          responsable: f.responsablePlanilla || f.responsable,
          monto: f.subtotalGasto ?? 0,
          moneda: f.monedaGasto || f.monedaClave,
          estado: f.estadoNombre,
          diasOcDeposito: f.tieneOc ? diasEntre(f.fechaOc, f.fechaDeposito) : null,
        });
      });
      pagos.sort((a, b) => fechaClave(a.fechaDeposito).localeCompare(fechaClave(b.fechaDeposito)) || a.correlativo - b.correlativo);

      const dias = pagos.map((p) => p.diasOcDeposito).filter((d): d is number => d !== null);
      const depositos = pagos.map((p) => fechaClave(p.fechaDeposito)).filter(Boolean).sort();
      const fechasOc = ocs.map((o) => o.fechaOc).filter(Boolean).sort();

      return {
        clave,
        etiqueta: base.idSite ? etiquetaSite(base) : "SIN SITE",
        idSite: base.idSite,
        correSite: base.correSite,
        cliente: base.cliente,
        proyecto: base.proyecto,
        ocs,
        pagos,
        totales: calcularResumen(filasSitio).porMoneda,
        primeraFechaOc: fechasOc[0] ?? "",
        ultimaFechaDeposito: depositos[depositos.length - 1] ?? "",
        diasPromedio: dias.length ? dias.reduce((t, d) => t + d, 0) / dias.length : null,
      };
    })
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"));
}

/** Contexto compacto para la IA: solo datos agregados y los casos más relevantes de cada sitio. */
export function construirContextoIa(filas: FilaReporte[], filtros: FiltrosReporte, criterio: string, limiteChars = 55_000) {
  const sitios = analizarPorSitio(filas);
  const resumen = calcularResumen(filas);
  const montoSitio = (s: SitioAnalisis) => s.totales.reduce((t, m) => t + m.totalOc, 0);
  const ordenados = [...sitios].sort((a, b) => montoSitio(b) - montoSitio(a));

  const armar = (maxSitios: number, maxItems: number) =>
    JSON.stringify({
      criterio,
      periodo: periodoConsultado(filas, filtros),
      filtros: describirFiltros(filtros, criterio, filas),
      totales: {
        ocs: resumen.ocs,
        pagadasCompletas: resumen.ocsPagadas,
        pagoParcial: resumen.ocsParciales,
        sinPago: resumen.ocsSinPago,
        pagadasEnExceso: resumen.ocsExceso,
        planillasSinOc: resumen.planillasSinOc,
        porMoneda: resumen.porMoneda.map((m) => ({ moneda: m.moneda, montoOc: m.totalOc, gasto: m.gasto, saldoPendiente: m.saldoPendiente, excedente: m.excedente, avancePct: Math.round(m.avance * 10) / 10 })),
      },
      kpis: (({ moneda, montoVigente, ocsAprobadas, ocsRechazadas, montoRechazadas, pagadoConOc, saldoPendiente, pagadoSinOc, pagosSinOc, ejecucion }) => ({
        moneda, montoOcVigenteSinRechazadas: montoVigente, ocsAprobadas, ocsRechazadas, montoOcRechazadas: montoRechazadas, pagadoConOc, saldoPendienteSinRechazadas: saldoPendiente, pagadoSinOc, pagosSinOc, ejecucionPct: Math.round(ejecucion * 10) / 10,
      }))(calcularKpis(sitios)),
      alertasUrgentes: calcularAlertas(filas).filter((a) => a.nivel === "URGENTE").map((a) => ({ alerta: a.alerta, detalle: a.detalle })),
      sitiosTotales: sitios.length,
      sitiosOmitidos: Math.max(0, sitios.length - maxSitios),
      sitios: ordenados.slice(0, maxSitios).map((s) => ({
        sitio: s.etiqueta,
        cliente: s.cliente,
        proyecto: s.proyecto,
        cantidadOcs: s.ocs.length,
        ocsSinPago: s.ocs.filter((o) => o.estado === "SIN PAGO").length,
        ocsParciales: s.ocs.filter((o) => o.estado === "PAGO PARCIAL").length,
        ocsEnExceso: s.ocs.filter((o) => o.estado === "PAGADO EN EXCESO").length,
        ocsNoAprobadas: s.ocs.filter((o) => o.estadoAprobacion !== "APROBADA").length,
        pagosSinOc: s.pagos.filter((p) => p.idOc === null).length,
        cantidadPagos: s.pagos.length,
        primeraFechaOc: s.primeraFechaOc,
        ultimaFechaDeposito: s.ultimaFechaDeposito,
        diasPromedioOcADeposito: s.diasPromedio === null ? null : Math.round(s.diasPromedio),
        montos: s.totales.map((m) => ({ moneda: m.moneda, montoOc: m.totalOc, gasto: m.gasto, saldo: m.saldoPendiente, exceso: m.excedente })),
        ocs: [...s.ocs]
          .sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo))
          .slice(0, maxItems)
          .map((o) => ({ idOc: o.idOc, aprobacion: o.estadoAprobacion, fechaOc: o.fechaOc, solicitante: o.solicitante, responsable: o.responsable, monto: o.monto, gasto: o.gasto, estado: o.estado, moneda: o.moneda })),
        pagos: s.pagos.slice(-maxItems).map((p) => ({ correlativo: p.correlativo, idOc: p.idOc, fechaIngreso: p.fechaIngreso, fechaDeposito: p.fechaDeposito, solicitante: p.solicitante, responsable: p.responsable, monto: p.monto, moneda: p.moneda })),
      })),
    });

  for (const [maxSitios, maxItems] of [[30, 12], [30, 6], [20, 4], [12, 3], [8, 2]]) {
    const texto = armar(maxSitios, maxItems);
    if (texto.length <= limiteChars) return texto;
  }
  return armar(5, 1);
}

export type AnalisisEstructurado = {
  conclusiones: Array<{ texto: string; tipo: string }>;
  riesgos: Array<{ nivel: string; tema: string; detalle: string; tipo: string }>;
  recomendaciones: Array<{ prioridad: string; accion: string; tipo: string }>;
};

/** Interpreta la respuesta de la IA (JSON). Devuelve null si no tiene la forma esperada. */
export function parsearAnalisisIa(texto: string): AnalisisEstructurado | null {
  const limpio = texto.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const inicio = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (inicio < 0 || fin <= inicio) return null;
  try {
    const data = JSON.parse(limpio.slice(inicio, fin + 1)) as Record<string, unknown>;
    const texto_ = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const lista = (v: unknown) => (Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []);
    const resultado: AnalisisEstructurado = {
      conclusiones: lista(data.conclusiones).map((i) => ({ texto: texto_(i.texto), tipo: texto_(i.tipo) || "HECHO" })).filter((i) => i.texto),
      riesgos: lista(data.riesgos)
        .map((i) => ({ nivel: texto_(i.nivel).toUpperCase() || "MEDIO", tema: texto_(i.tema), detalle: texto_(i.detalle), tipo: texto_(i.tipo) || "HECHO" }))
        .filter((i) => i.tema || i.detalle),
      recomendaciones: lista(data.recomendaciones)
        .map((i) => ({ prioridad: texto_(i.prioridad).toUpperCase() || "MEDIA", accion: texto_(i.accion), tipo: texto_(i.tipo) || "HECHO" }))
        .filter((i) => i.accion),
    };
    return resultado.conclusiones.length + resultado.riesgos.length + resultado.recomendaciones.length > 0 ? resultado : null;
  } catch {
    return null;
  }
}

export type Alerta = { alerta: string; cantidad: number; detalle: string; nivel: "URGENTE" | "ALTO" | "MEDIO" | "BAJO" };
const ORDEN_NIVEL: Record<Alerta["nivel"], number> = { URGENTE: 0, ALTO: 1, MEDIO: 2, BAJO: 3 };

const lista = (valores: Array<string | number>, max = 8) =>
  valores.length <= max ? valores.join(", ") : `${valores.slice(0, max).join(", ")} y ${valores.length - max} más`;

/** Alertas calculadas directamente de los datos (sin IA): siempre exactas. */
export function calcularAlertas(filas: FilaReporte[]): Alerta[] {
  const sitios = analizarPorSitio(filas);
  const ocs = sitios.flatMap((s) => s.ocs);
  const pagos = sitios.flatMap((s) => s.pagos);
  const alertas: Alerta[] = [];
  const sinPago = ocs.filter((o) => o.estado === "SIN PAGO");
  const rechazadas = ocs.filter((o) => o.estadoAprobacion === "RECHAZADA");
  const rechazadasConPago = rechazadas.filter((o) => o.pagos > 0 || o.gasto > 0.005);
  const noAprobadasConPago = ocs.filter((o) => o.estadoAprobacion !== "APROBADA" && o.estadoAprobacion !== "RECHAZADA" && o.gasto > 0.005);
  const noAprobadas = ocs.filter((o) => o.estadoAprobacion !== "APROBADA" && o.estadoAprobacion !== "RECHAZADA");
  const exceso = ocs.filter((o) => o.estado === "PAGADO EN EXCESO");
  const variosPagos = ocs.filter((o) => o.pagos > 1);
  const sinOc = pagos.filter((p) => p.idOc === null);

  if (noAprobadasConPago.length) alertas.push({ alerta: "OC con pagos que NO están aprobadas", cantidad: noAprobadasConPago.length, detalle: `OC ${lista(noAprobadasConPago.map((o) => o.idOc))}`, nivel: "ALTO" });
  if (rechazadasConPago.length) {
    const detalle = rechazadasConPago.map((o) => {
      const pagosOc = pagos.filter((p) => p.idOc === o.idOc);
      return `OC ${o.idOc}: pago(s) ${pagosOc.map((p) => `${p.correlativo} (${p.moneda} ${p.monto.toFixed(2)})`).join(", ") || "con gasto asociado"}`;
    });
    alertas.push({ alerta: "URGENTE: pagos realizados a OC RECHAZADAS", cantidad: rechazadasConPago.length, detalle: detalle.join(" | "), nivel: "URGENTE" });
  }
  if (rechazadas.length) alertas.push({ alerta: "OC rechazadas (su monto figura como saldo pendiente)", cantidad: rechazadas.length, detalle: `OC ${lista(rechazadas.map((o) => o.idOc))}`, nivel: "MEDIO" });
  if (sinOc.length) alertas.push({ alerta: "Pagos sin OC asociada", cantidad: sinOc.length, detalle: `Pagos ${lista(sinOc.map((p) => p.correlativo))}`, nivel: "ALTO" });
  if (exceso.length) alertas.push({ alerta: "OC pagadas en exceso", cantidad: exceso.length, detalle: `OC ${lista(exceso.map((o) => o.idOc))}`, nivel: "ALTO" });
  if (noAprobadas.length) alertas.push({ alerta: "OC aún no aprobadas", cantidad: noAprobadas.length, detalle: `OC ${lista(noAprobadas.map((o) => `${o.idOc} (${o.estadoAprobacion.toLowerCase()})`))}`, nivel: "MEDIO" });
  if (sinPago.length) alertas.push({ alerta: "OC sin ningún pago", cantidad: sinPago.length, detalle: `OC ${lista(sinPago.map((o) => o.idOc))}`, nivel: "MEDIO" });
  if (variosPagos.length) alertas.push({ alerta: "OC con más de un pago", cantidad: variosPagos.length, detalle: `OC ${lista(variosPagos.map((o) => o.idOc))}`, nivel: "BAJO" });
  const otraMoneda = filas.filter((f) => f.tieneOc && f.primeraDeOc && f.gastoOtraMoneda);
  if (otraMoneda.length) alertas.push({ alerta: "Gasto en moneda distinta a la de la OC (no comparable)", cantidad: otraMoneda.length, detalle: `OC ${lista(Array.from(new Set(otraMoneda.map((f) => f.idOc as number))))}`, nivel: "MEDIO" });
  return alertas.sort((a, b) => ORDEN_NIVEL[a.nivel] - ORDEN_NIVEL[b.nivel]);
}

/** Análisis automático (sin IA) para cuando el servicio de IA no está disponible o no devuelve el formato esperado. */
export function analisisBasico(filas: FilaReporte[]): AnalisisEstructurado {
  const resumen = calcularResumen(filas);
  const sitios = analizarPorSitio(filas);
  const conclusiones: AnalisisEstructurado["conclusiones"] = [
    {
      texto: `${resumen.ocs} OC en ${sitios.length} sitio(s): ${resumen.ocsPagadas} pagadas completas, ${resumen.ocsParciales} con pago parcial, ${resumen.ocsSinPago} sin pago.`,
      tipo: "HECHO",
    },
    ...resumen.porMoneda.map((m) => ({
      texto: `${m.moneda}: monto OC ${m.totalOc.toFixed(2)}, gasto asociado ${m.gasto.toFixed(2)} (${m.avance.toFixed(1)}%), saldo pendiente ${m.saldoPendiente.toFixed(2)}.`,
      tipo: "HECHO",
    })),
  ];
  const riesgos = calcularAlertas(filas).map((a) => ({ nivel: a.nivel, tema: a.alerta, detalle: `${a.cantidad}: ${a.detalle}`, tipo: "HECHO" }));
  const recomendaciones: AnalisisEstructurado["recomendaciones"] = riesgos.length
    ? [{ prioridad: "ALTA", accion: "Revisar las alertas del cuadro de riesgos y sustentar o regularizar cada caso.", tipo: "HECHO" }]
    : [];
  return { conclusiones, riesgos, recomendaciones };
}

export type ResponsableAnalizado = { id: string; nombre: string; documento: string; ocs: number; pagosConOc: number; pagosSinOc: number };

/** Responsables que aparecen en el resultado (OC y planillas); con búsqueda por documento pueden ser varios IdEmpleado/razones sociales. */
export function responsablesAnalizados(filas: FilaReporte[]): ResponsableAnalizado[] {
  const mapa = new Map<string, ResponsableAnalizado & { _ocs: Set<number>; _con: Set<number>; _sin: Set<number> }>();
  const obtener = (id: number | null, nombre: string, documento: string) => {
    const clave = `${id ?? ""}|${nombre}`;
    let r = mapa.get(clave);
    if (!r) {
      r = { id: id === null ? "—" : String(id), nombre: nombre || "SIN NOMBRE", documento, ocs: 0, pagosConOc: 0, pagosSinOc: 0, _ocs: new Set(), _con: new Set(), _sin: new Set() };
      mapa.set(clave, r);
    }
    return r;
  };
  filas.forEach((f) => {
    if (f.tieneOc && f.idOc !== null) obtener(f.idResponsableOc, f.responsableOc, f.documentoResponsableOc)._ocs.add(f.idOc);
    if (f.tienePago && f.correlativoPago !== null) {
      const r = obtener(f.idResponsablePlanilla, f.responsablePlanilla, f.documentoResponsablePlanilla);
      (f.tieneOc ? r._con : r._sin).add(f.correlativoPago);
    }
  });
  return Array.from(mapa.values())
    .map(({ _ocs, _con, _sin, ...r }) => ({ ...r, ocs: _ocs.size, pagosConOc: _con.size, pagosSinOc: _sin.size }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export type NivelMensaje = "URGENTE" | "ALTO" | "MEDIO" | "INFO";
export type MensajeClave = { nivel: NivelMensaje; titulo: string; detalle: string };

export type KpisInforme = {
  moneda: string;
  simbolo: string;
  montoVigente: number;
  ocsVigentes: number;
  ocsAprobadas: number;
  ocsRechazadas: number;
  montoRechazadas: number;
  pagadoConOc: number;
  pagosConOc: number;
  saldoPendiente: number;
  pagadoSinOc: number;
  pagosSinOc: number;
  ejecucion: number;
  otrasMonedas: string[];
};

export function simboloMoneda(moneda: string) {
  const m = moneda.trim().toUpperCase();
  if (m === "SOLES" || m === "PEN" || m === "S/") return "S/";
  if (m === "DOLARES" || m === "DÓLARES" || m === "USD") return "US$";
  if (m === "EUROS" || m === "EUR") return "EUR";
  return moneda && moneda !== "—" ? moneda : "";
}

export const montoConSimbolo = (monto: number, moneda: string) => {
  const simbolo = simboloMoneda(moneda);
  return `${simbolo ? `${simbolo} ` : ""}${formatMonto(monto)}`;
};

/** KPIs de la moneda principal. Las OC RECHAZADAS no generan deuda: se excluyen del monto vigente y del saldo. */
export function calcularKpis(sitios: SitioAnalisis[]): KpisInforme {
  const ocs = sitios.flatMap((s) => s.ocs);
  const pagos = sitios.flatMap((s) => s.pagos);
  const montoPorMoneda = new Map<string, number>();
  ocs.forEach((o) => montoPorMoneda.set(o.moneda, (montoPorMoneda.get(o.moneda) ?? 0) + o.monto));
  const moneda = Array.from(montoPorMoneda.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? pagos[0]?.moneda ?? "";
  const enMoneda = ocs.filter((o) => o.moneda === moneda);
  const vigentes = enMoneda.filter((o) => o.estadoAprobacion !== "RECHAZADA");
  const rechazadas = enMoneda.filter((o) => o.estadoAprobacion === "RECHAZADA");
  const montoVigente = vigentes.reduce((t, o) => t + o.monto, 0);
  const gastoVigente = vigentes.reduce((t, o) => t + o.gasto, 0);
  const pagosMoneda = pagos.filter((p) => (p.moneda || "—") === (moneda || "—"));
  const conOc = pagosMoneda.filter((p) => p.idOc !== null);
  const sinOc = pagosMoneda.filter((p) => p.idOc === null);
  const otras = Array.from(new Set([...ocs.map((o) => o.moneda), ...pagos.map((p) => p.moneda)].filter((m) => m && m !== moneda)));
  return {
    moneda,
    simbolo: simboloMoneda(moneda),
    montoVigente,
    ocsVigentes: vigentes.length,
    ocsAprobadas: vigentes.filter((o) => o.estadoAprobacion === "APROBADA").length,
    ocsRechazadas: rechazadas.length,
    montoRechazadas: rechazadas.reduce((t, o) => t + o.monto, 0),
    pagadoConOc: conOc.reduce((t, p) => t + p.monto, 0),
    pagosConOc: conOc.length,
    saldoPendiente: vigentes.reduce((t, o) => t + Math.max(o.saldo, 0), 0),
    pagadoSinOc: sinOc.reduce((t, p) => t + p.monto, 0),
    pagosSinOc: sinOc.length,
    ejecucion: montoVigente > 0 ? (gastoVigente / montoVigente) * 100 : 0,
    otrasMonedas: otras,
  };
}

/** Mensajes de "Lo más importante", calculados con los datos (no dependen de la IA). */
export function mensajesClave(sitios: SitioAnalisis[], responsable: string): MensajeClave[] {
  const ocs = sitios.flatMap((s) => s.ocs);
  const pagos = sitios.flatMap((s) => s.pagos);
  const mensajes: MensajeClave[] = [];
  const pagoTxt = (p: PagoAnalisis) => `${p.correlativo} (${montoConSimbolo(p.monto, p.moneda)})`;
  const ultimaAprobacion = (o: OcAnalisis) => formatFecha([...o.aprobadores].reverse().find((a) => a.fecha)?.fecha ?? "");

  const rechazadasConPago = ocs.filter((o) => o.estadoAprobacion === "RECHAZADA" && (o.pagos > 0 || o.gasto > 0.005));
  if (rechazadasConPago.length) {
    mensajes.push({
      nivel: "URGENTE",
      titulo: `${rechazadasConPago.length} OC RECHAZADA(S) tienen pagos realizados`,
      detalle: rechazadasConPago
        .map((o) => `OC ${o.idOc}: ${pagos.filter((p) => p.idOc === o.idOc).map(pagoTxt).join(", ") || "con gasto asociado"}`)
        .join(" | "),
    });
  }

  const sinOc = pagos.filter((p) => p.idOc === null);
  if (sinOc.length) {
    const total = sinOc.reduce((t, p) => t + p.monto, 0);
    const totalPagos = pagos.reduce((t, p) => t + p.monto, 0);
    const monedas = Array.from(new Set(sinOc.map((p) => p.moneda)));
    mensajes.push({
      nivel: "ALTO",
      titulo: `${sinOc.length} pago(s) por ${monedas.length === 1 ? montoConSimbolo(total, monedas[0]) : "varias monedas"} no tienen OC asociada`,
      detalle: `Pagos ${sinOc.slice(0, 6).map(pagoTxt).join(" y ")}${sinOc.length > 6 ? ` y ${sinOc.length - 6} más` : ""}.${
        monedas.length === 1 && totalPagos > 0 ? ` Equivalen al ${Math.round((total / totalPagos) * 100)}% de lo pagado a ${responsable}.` : ""
      }`,
    });
  }

  const aprobadasSinPago = ocs.filter((o) => o.estadoAprobacion === "APROBADA" && o.estado === "SIN PAGO");
  if (aprobadasSinPago.length) {
    const unica = aprobadasSinPago.length === 1 ? aprobadasSinPago[0] : null;
    mensajes.push({
      nivel: "MEDIO",
      titulo: unica
        ? `OC ${unica.idOc} aprobada (${montoConSimbolo(unica.monto, unica.moneda)}) aún sin pago`
        : `${aprobadasSinPago.length} OC aprobadas aún sin pago`,
      detalle: unica
        ? `Aprobada por los 3 niveles${ultimaAprobacion(unica) ? ` el ${ultimaAprobacion(unica)}` : ""}.`
        : `OC ${aprobadasSinPago.slice(0, 8).map((o) => `${o.idOc} (${montoConSimbolo(o.monto, o.moneda)})`).join(", ")}${aprobadasSinPago.length > 8 ? " y más" : ""}.`,
    });
  }

  const enProceso = ocs.filter((o) => o.estadoAprobacion !== "APROBADA" && o.estadoAprobacion !== "RECHAZADA");
  if (enProceso.length) {
    mensajes.push({
      nivel: "MEDIO",
      titulo: `${enProceso.length} OC en proceso de aprobación`,
      detalle: `OC ${enProceso.slice(0, 8).map((o) => `${o.idOc} (${o.estadoAprobacion.toLowerCase()})`).join(", ")}${enProceso.length > 8 ? " y más" : ""}.`,
    });
  }

  const rechazadas = ocs.filter((o) => o.estadoAprobacion === "RECHAZADA");
  if (rechazadas.length) {
    mensajes.push({
      nivel: "INFO",
      titulo:
        rechazadas.length === 1
          ? `OC ${rechazadas[0].idOc} rechazada (${montoConSimbolo(rechazadas[0].monto, rechazadas[0].moneda)}): excluida del saldo`
          : `${rechazadas.length} OC rechazadas: excluidas del saldo`,
      detalle: "No genera deuda. Verificar si el servicio se ejecutó igualmente.",
    });
  }
  return mensajes;
}
