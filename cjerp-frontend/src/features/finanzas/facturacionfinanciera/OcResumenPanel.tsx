import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { OrdenCompraCabeceraDto } from "../../../api/ordenCompraService";
import { buildPlanillaConsultaEstadosRequest, consultarPlanillaEstados } from "../../../api/planillaConsultaService";
import { getHttpErrorMessage } from "../../../utils/httpError";
import { FiltroOperativoLookup } from "../../../components/lookups/FiltroOperativoLookup";
import { MultiFiltroBuscable } from "./MultiFiltroBuscable";
import type { FiltroOperativoValue } from "../../../models/filtroOperativo";
import { cargarPdf, encabezadoPagina, marcaGeneracion, nombreArchivo, EMPRESA } from "../../reportes/gerencial/responsable/responsablePdf";

// Resumen gerencial de órdenes de compra (pestaña Resumen de Seguimiento de pagos).
// Cabeceras: ya cargadas por la pantalla. Ejecución (gastado vs monto de la OC): consulta "analisis-gastos"
// (sp_OrdenCompra_Consulta_Estados), la misma del reporte OC/Gastos. Los montos nunca mezclan monedas.

type Props = {
  active: boolean;
  cabeceras: OrdenCompraCabeceraDto[];
  cabecerasListas: boolean;
  /** 0 rechazada · 1, 2, 3 = nivel de validación pendiente · 4 aprobada. */
  nivelDe: (item: OrdenCompraCabeceraDto) => number;
};

type Fila = Record<string, unknown>;
type OcEjecucion = {
  idOc: number;
  moneda: string;
  oc: number;
  gastado: number;
  conPlanilla: boolean;
  rechazada: boolean;
  motivos: string[];
};
type Dimension = "cliente" | "proyecto" | "solicitante" | "responsable";
type AlertaTab = "validadores" | "sobreconsumo" | "agotadas" | "sinGasto" | "responsable";
type TablaDatos = { titulo: string; columnas: string[]; filas: string[][]; vacio: string; alertaDesde?: number[] };
type KpiDatos = { color: string; label: string; valor: string; detalle: string; detalle2?: string };

const COLORS = {
  verde: "#0E6E5C",
  azul: "#2563EB",
  ambar: "#D97706",
  rojo: "#DC2626",
  gris: "#94A3B8",
  tinta: "#0F172A",
  suave: "#64748B",
  borde: "#E5EAF0",
};
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const DIAS_SIN_GASTO = 30;

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const normMoneda = (value: unknown) => String(value ?? "").trim().toUpperCase() || "SIN MONEDA";
const fmt = (value: number) => value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCorto = (value: number) =>
  Math.abs(value) >= 1_000_000 ? `${(value / 1_000_000).toFixed(2)} M`
    : Math.abs(value) >= 1_000 ? `${(value / 1_000).toFixed(1)} K`
      : value.toFixed(0);
const trunc = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);
const texto = (value: string | null | undefined, vacio: string) => value?.trim() || vacio;
const nombreSolicitante = (item: OrdenCompraCabeceraDto) => texto(item.solicitanteCabecera || item.solicitante, "Sin solicitante");
const nombreResponsable = (item: OrdenCompraCabeceraDto) => texto(item.responsable, "Sin responsable");
const diasDesde = (fecha?: string | null) => {
  if (!fecha) return 0;
  const time = new Date(fecha).getTime();
  return Number.isFinite(time) ? Math.max(0, Math.floor((Date.now() - time) / 86_400_000)) : 0;
};
const montosTexto = (map: Map<string, number>) =>
  Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([moneda, total]) => `${moneda} ${fmtCorto(total)}`)
    .join(" · ") || "—";
const sumar = (map: Map<string, number>, moneda: string, valor: number) => map.set(moneda, (map.get(moneda) ?? 0) + valor);

// Convierte el gráfico (SVG de recharts) de un contenedor en PNG para incluirlo en el PDF.
async function svgAPng(contenedor: HTMLElement | null): Promise<{ data: string; w: number; h: number } | null> {
  const svg = contenedor?.querySelector("svg") as SVGSVGElement | null;
  if (!svg) return null;
  const caja = svg.getBoundingClientRect();
  const w = Math.round(caja.width);
  const h = Math.round(caja.height);
  if (w < 10 || h < 10) return null;
  const clon = svg.cloneNode(true) as SVGSVGElement;
  clon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clon.setAttribute("width", String(w));
  clon.setAttribute("height", String(h));
  clon.setAttribute("font-family", "Helvetica, Arial, sans-serif");
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clon)], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const imagen = await new Promise<HTMLImageElement>((resolve, reject) => {
      const item = new Image();
      item.onload = () => resolve(item);
      item.onerror = () => reject(new Error("No se pudo convertir el gráfico."));
      item.src = url;
    });
    const escala = 2;
    const canvas = document.createElement("canvas");
    canvas.width = w * escala;
    canvas.height = h * escala;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imagen, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL("image/png"), w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function getValor(row: Fila, ...names: string[]): unknown {
  for (const name of names) {
    const key = Object.keys(row).find((item) => item.toLowerCase() === name.toLowerCase());
    if (key !== undefined && row[key] !== null && row[key] !== undefined) return row[key];
  }
  return undefined;
}

// Una fila por posición de OC (la consulta puede repetirla por cuentas bancarias del responsable).
function agregarEjecucion(rows: Fila[]): OcEjecucion[] {
  const posiciones = new Set<string>();
  const porOc = new Map<number, OcEjecucion>();
  rows.forEach((row, index) => {
    const idOc = num(getValor(row, "IdOc"));
    if (!idOc) return;
    const clave = `${idOc}|${getValor(row, "Fila") ?? `r${index}`}`;
    if (posiciones.has(clave)) return;
    posiciones.add(clave);

    const actual = porOc.get(idOc) ?? {
      idOc,
      moneda: normMoneda(getValor(row, "MonedaOc", "Moneda")),
      oc: 0,
      gastado: 0,
      conPlanilla: false,
      rechazada: false,
      motivos: [],
    };
    actual.oc += num(getValor(row, "SubtotalOc"));
    const gastado = num(getValor(row, "SubtotalPlanilla"));
    actual.gastado += gastado;
    if (gastado > 0 || num(getValor(row, "TienePlanilla")) > 0) actual.conPlanilla = true;
    const estadoOc = String(getValor(row, "EstadoOc") ?? "").toUpperCase();
    if (estadoOc.includes("RECHAZ") || num(getValor(row, "IdEstadoOc")) === 6) actual.rechazada = true;
    const validacion = String(getValor(row, "ValidacionResponsable") ?? "").toUpperCase();
    if ((validacion.includes("DIFERENTE") || validacion.includes("VARIOS")) && !actual.motivos.includes(validacion)) {
      actual.motivos.push(validacion);
    }
    porOc.set(idOc, actual);
  });
  return Array.from(porOc.values());
}

export default function OcResumenPanel({ active, cabeceras, cabecerasListas, nivelDe }: Props) {
  const [desde, setDesde] = useState(`${new Date().getFullYear()}-01-01`);
  const [hasta, setHasta] = useState("");
  const [monedaElegida, setMonedaElegida] = useState("");
  const [dimension, setDimension] = useState<Dimension>("cliente");
  const [alertaTab, setAlertaTab] = useState<AlertaTab>("validadores");
  const [solicitantes, setSolicitantes] = useState<string[]>([]);
  const [busquedaSolicitante, setBusquedaSolicitante] = useState("");
  const [responsables, setResponsables] = useState<string[]>([]);
  const [busquedaResponsable, setBusquedaResponsable] = useState("");
  const [filasInfo, setFilasInfo] = useState<{ key: string; rows: Fila[] } | null>(null);
  // Filtro por cliente / proyecto / site (lookup operativo existente).
  const [filtroOperativo, setFiltroOperativo] = useState<FiltroOperativoValue>({});
  const filtroSel = filtroOperativo.filtro;
  const idClienteFiltro = filtroSel?.idCliente ? Number(filtroSel.idCliente) : 0;
  const idProyectoFiltro = filtroSel?.idProyecto ? Number(filtroSel.idProyecto) : 0;
  const idSiteFiltro = filtroSel?.idSite ? String(filtroSel.idSite).trim() : "";
  const filtroActivo = idClienteFiltro > 0 || idProyectoFiltro > 0 || idSiteFiltro !== "";
  const etiquetaFiltro = [filtroSel?.nombreCliente, filtroSel?.nombreProyecto, filtroSel?.idSite, filtroSel?.nombreSite].filter(Boolean).join(" - ");
  // Las filas de ejecución solo valen para la consulta (período + filtro) que las generó.
  const claveConsulta = `${desde}|${hasta}|${idClienteFiltro}|${idProyectoFiltro}|${idSiteFiltro}`;
  const filas = filasInfo && filasInfo.key === claveConsulta ? filasInfo.rows : null;
  const [filasLoading, setFilasLoading] = useState(false);
  const [filasError, setFilasError] = useState("");
  const [refrescar, setRefrescar] = useState(0);
  const [exportando, setExportando] = useState(false);
  const refMes = useRef<HTMLDivElement>(null);
  const refEstado = useRef<HTMLDivElement>(null);
  const refTop = useRef<HTMLDivElement>(null);
  const refConsumo = useRef<HTMLDivElement>(null);

  // Ejecución (gastado vs OC): se consulta al abrir la pestaña y al cambiar el período.
  useEffect(() => {
    if (!active) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setFilasLoading(true);
      setFilasError("");
      try {
        const request = buildPlanillaConsultaEstadosRequest([
          ...(desde ? [{ nombre: "FechaInicio", valor: desde, tipo: "date" as const }] : []),
          ...(hasta ? [{ nombre: "FechaFin", valor: hasta, tipo: "date" as const }] : []),
          ...(idClienteFiltro > 0 ? [{ nombre: "IdCliente", valor: String(idClienteFiltro), tipo: "int" as const }] : []),
          ...(idProyectoFiltro > 0 ? [{ nombre: "IdProyecto", valor: String(idProyectoFiltro), tipo: "string" as const }] : []),
          ...(idSiteFiltro ? [{ nombre: "IdSite", valor: idSiteFiltro, tipo: "string" as const }] : []),
        ]);
        request.consulta = "analisis-gastos";
        const response = await consultarPlanillaEstados(request, { timeoutMs: 90000, signal: controller.signal });
        if (controller.signal.aborted) return;
        setFilasInfo({ key: claveConsulta, rows: Array.isArray(response?.rows) ? (response.rows as Fila[]) : [] });
      } catch (err) {
        if (controller.signal.aborted) return;
        setFilasInfo(null);
        setFilasError(getHttpErrorMessage(err, "No se pudo calcular la ejecución de las órdenes de compra."));
      } finally {
        if (!controller.signal.aborted) setFilasLoading(false);
      }
    }, 400);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [active, claveConsulta, desde, hasta, idClienteFiltro, idProyectoFiltro, idSiteFiltro, refrescar]);

  // Con filtro activo, las OC válidas son las que tienen alguna posición del cliente/proyecto/site elegido
  // (lo informa la misma consulta de ejecución). Mientras esa consulta no responde no se muestra ninguna.
  const idsFiltrados = useMemo(
    () => (filtroActivo ? new Set((filas ?? []).map((row) => num(getValor(row, "IdOc"))).filter((id) => id > 0)) : null),
    [filas, filtroActivo]
  );
  const cabecerasBase = useMemo(
    () => cabeceras.filter((item) => {
      if (idsFiltrados && !idsFiltrados.has(item.idOc)) return false;
      const fecha = item.fecha?.slice(0, 10) ?? "";
      if (desde && (!fecha || fecha < desde)) return false;
      if (hasta && (!fecha || fecha > hasta)) return false;
      return true;
    }),
    [cabeceras, desde, hasta, idsFiltrados]
  );

  // Opciones en cascada: cada lista solo muestra a quienes tienen OC con lo elegido en el otro filtro,
  // para que no se pueda armar una combinación sin resultados.
  const respValidos = useMemo(() => {
    const nombres = new Set(cabecerasBase.map(nombreResponsable));
    return responsables.filter((nombre) => nombres.has(nombre));
  }, [cabecerasBase, responsables]);
  const solValidos = useMemo(() => {
    const nombres = new Set(cabecerasBase.map(nombreSolicitante));
    return solicitantes.filter((nombre) => nombres.has(nombre));
  }, [cabecerasBase, solicitantes]);

  // Solicitantes disponibles según el período, el filtro operativo y los responsables elegidos (con cuántas OC tiene cada uno).
  const solicitanteOpciones = useMemo(() => {
    const cuentas = new Map<string, number>();
    cabecerasBase.forEach((item) => {
      if (respValidos.length > 0 && !respValidos.includes(nombreResponsable(item))) return;
      const nombre = nombreSolicitante(item);
      cuentas.set(nombre, (cuentas.get(nombre) ?? 0) + 1);
    });
    return Array.from(cuentas.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "es", { sensitivity: "base" }))
      .map(([nombre, cantidad]) => ({ nombre, cantidad }));
  }, [cabecerasBase, respValidos]);
  // Los solicitantes elegidos que dejan de existir al cambiar período o filtro se ignoran.
  const solicitantesActivos = useMemo(
    () => solicitantes.filter((nombre) => solicitanteOpciones.some((item) => item.nombre === nombre)),
    [solicitanteOpciones, solicitantes]
  );
  const hayFiltroSolicitante = solicitantesActivos.length > 0;

  // Responsables disponibles según el período, el filtro operativo y los solicitantes elegidos (con cuántas OC tiene cada uno).
  const responsableOpciones = useMemo(() => {
    const cuentas = new Map<string, number>();
    cabecerasBase.forEach((item) => {
      if (solValidos.length > 0 && !solValidos.includes(nombreSolicitante(item))) return;
      const nombre = nombreResponsable(item);
      cuentas.set(nombre, (cuentas.get(nombre) ?? 0) + 1);
    });
    return Array.from(cuentas.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "es", { sensitivity: "base" }))
      .map(([nombre, cantidad]) => ({ nombre, cantidad }));
  }, [cabecerasBase, solValidos]);
  const responsablesActivos = useMemo(
    () => responsables.filter((nombre) => responsableOpciones.some((item) => item.nombre === nombre)),
    [responsableOpciones, responsables]
  );
  const hayFiltroResponsable = responsablesActivos.length > 0;
  const hayFiltroPersona = hayFiltroSolicitante || hayFiltroResponsable;

  const cabecerasPeriodo = useMemo(
    () => cabecerasBase.filter((item) =>
      (!hayFiltroSolicitante || solicitantesActivos.includes(nombreSolicitante(item)))
      && (!hayFiltroResponsable || responsablesActivos.includes(nombreResponsable(item)))),
    [cabecerasBase, hayFiltroResponsable, hayFiltroSolicitante, responsablesActivos, solicitantesActivos]
  );
  const cabeceraPorOc = useMemo(() => new Map(cabeceras.map((item) => [item.idOc, item])), [cabeceras]);

  const monedas = useMemo(() => {
    const totales = new Map<string, number>();
    cabecerasPeriodo.forEach((item) => sumar(totales, normMoneda(item.moneda), Number(item.subtotal) || 0));
    return Array.from(totales.entries()).sort((a, b) => b[1] - a[1]).map(([moneda]) => moneda);
  }, [cabecerasPeriodo]);
  const moneda = monedaElegida && monedas.includes(monedaElegida)
    ? monedaElegida
    : monedas.includes("SOLES") ? "SOLES" : monedas[0] ?? "";

  // ---- Cabeceras: embudo de aprobación ----
  const embudo = useMemo(() => {
    const base = () => ({ cantidad: 0, montos: new Map<string, number>() });
    const resultado = { emitidas: base(), validacion: base(), aprobadas: base(), rechazadas: base(), n1: 0, n2: 0, n3: 0 };
    cabecerasPeriodo.forEach((item) => {
      const nivel = nivelDe(item);
      const m = normMoneda(item.moneda);
      const monto = Number(item.subtotal) || 0;
      const sumarEn = (grupo: ReturnType<typeof base>) => { grupo.cantidad += 1; sumar(grupo.montos, m, monto); };
      sumarEn(resultado.emitidas);
      if (nivel === 0) sumarEn(resultado.rechazadas);
      else if (nivel === 4) sumarEn(resultado.aprobadas);
      else {
        sumarEn(resultado.validacion);
        if (nivel === 1) resultado.n1 += 1;
        else if (nivel === 2) resultado.n2 += 1;
        else resultado.n3 += 1;
      }
    });
    return resultado;
  }, [cabecerasPeriodo, nivelDe]);

  // ---- Ejecución: gastado vs monto de la OC (sin rechazadas) ----
  const ejecucion = useMemo(() => {
    if (!filas) return null;
    const idsSolicitante = hayFiltroPersona ? new Set(cabecerasPeriodo.map((item) => item.idOc)) : null;
    return agregarEjecucion(filas).filter((item) => !item.rechazada && (!idsSolicitante || idsSolicitante.has(item.idOc)));
  }, [filas, hayFiltroPersona, cabecerasPeriodo]);
  const ejecucionMoneda = useMemo(() => (ejecucion ?? []).filter((item) => item.moneda === moneda), [ejecucion, moneda]);
  const avance = useMemo(() => {
    const totalOc = ejecucionMoneda.reduce((acc, item) => acc + item.oc, 0);
    const gastado = ejecucionMoneda.reduce((acc, item) => acc + item.gastado, 0);
    const saldo = ejecucionMoneda.reduce((acc, item) => acc + Math.max(0, item.oc - item.gastado), 0);
    return { totalOc, gastado, saldo, pct: totalOc > 0 ? (gastado / totalOc) * 100 : 0 };
  }, [ejecucionMoneda]);
  const sinGastoTotal = useMemo(() => (ejecucion ?? []).filter((item) => !item.conPlanilla).length, [ejecucion]);

  // ---- Gráficos ----
  const porMes = useMemo(() => {
    const meses = new Map<string, { monto: number; cantidad: number }>();
    cabecerasPeriodo
      .filter((item) => nivelDe(item) !== 0 && normMoneda(item.moneda) === moneda && item.fecha)
      .forEach((item) => {
        const clave = item.fecha!.slice(0, 7);
        const actual = meses.get(clave) ?? { monto: 0, cantidad: 0 };
        actual.monto += Number(item.subtotal) || 0;
        actual.cantidad += 1;
        meses.set(clave, actual);
      });
    return Array.from(meses.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([clave, valor]) => ({ mes: `${MESES[Number(clave.slice(5, 7)) - 1] ?? clave} ${clave.slice(2, 4)}`, ...valor }));
  }, [cabecerasPeriodo, moneda, nivelDe]);

  const porEstado = useMemo(() => [
    { name: "1ra validación", value: embudo.n1, color: COLORS.ambar },
    { name: "2da validación", value: embudo.n2, color: "#F59E0B" },
    { name: "3ra validación", value: embudo.n3, color: "#FBBF24" },
    { name: "Aprobadas", value: embudo.aprobadas.cantidad, color: COLORS.verde },
    { name: "Rechazadas", value: embudo.rechazadas.cantidad, color: COLORS.rojo },
  ].filter((item) => item.value > 0), [embudo]);

  const topDimension = useMemo(() => {
    const acumulado = new Map<string, number>();
    cabecerasPeriodo
      .filter((item) => nivelDe(item) !== 0 && normMoneda(item.moneda) === moneda)
      .forEach((item) => {
        const nombre = dimension === "cliente" ? texto(item.nombreCliente, "Sin cliente")
          : dimension === "proyecto" ? texto(item.nombreProyecto, "Sin proyecto")
            : dimension === "solicitante" ? texto(item.solicitanteCabecera || item.solicitante, "Sin solicitante")
              : texto(item.responsable, "Sin responsable");
        acumulado.set(nombre, (acumulado.get(nombre) ?? 0) + (Number(item.subtotal) || 0));
      });
    return Array.from(acumulado.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name: trunc(name, 28), completo: name, value }));
  }, [cabecerasPeriodo, dimension, moneda, nivelDe]);

  const rangosConsumo = useMemo(() => {
    const rangos = [
      { name: "Sin gasto", value: 0, color: COLORS.gris },
      { name: "1–50 %", value: 0, color: "#60A5FA" },
      { name: "51–90 %", value: 0, color: COLORS.azul },
      { name: "91–100 %", value: 0, color: COLORS.ambar },
      { name: "Más de 100 %", value: 0, color: COLORS.rojo },
    ];
    ejecucionMoneda.forEach((item) => {
      const pct = item.oc > 0 ? (item.gastado / item.oc) * 100 : 0;
      if (item.gastado <= 0) rangos[0].value += 1;
      else if (pct <= 50) rangos[1].value += 1;
      else if (pct <= 90) rangos[2].value += 1;
      else if (pct <= 100.0001) rangos[3].value += 1;
      else rangos[4].value += 1;
    });
    return rangos;
  }, [ejecucionMoneda]);

  // ---- Alertas ----
  const pendientesValidador = useMemo(() => {
    const grupos = new Map<string, { nivel: number; validador: string; cantidad: number; monto: number; d7: number; d15: number; d30: number; maxDias: number }>();
    cabecerasPeriodo.forEach((item) => {
      const nivel = nivelDe(item);
      if (nivel < 1 || nivel > 3) return;
      const validador = nivel === 1 ? texto(item.validadorCabecera || item.validador, "Sin validador")
        : nivel === 2 ? texto(item.validador2, "Sin validador 2")
          : texto(item.validador3, "Sin validador 3");
      const clave = `${nivel}|${validador}`;
      const actual = grupos.get(clave) ?? { nivel, validador, cantidad: 0, monto: 0, d7: 0, d15: 0, d30: 0, maxDias: 0 };
      const dias = diasDesde(item.fecha);
      actual.cantidad += 1;
      if (normMoneda(item.moneda) === moneda) actual.monto += Number(item.subtotal) || 0;
      if (dias > 7) actual.d7 += 1;
      if (dias > 15) actual.d15 += 1;
      if (dias > 30) actual.d30 += 1;
      actual.maxDias = Math.max(actual.maxDias, dias);
      grupos.set(clave, actual);
    });
    return Array.from(grupos.values()).sort((a, b) => b.d30 - a.d30 || b.maxDias - a.maxDias || b.cantidad - a.cantidad);
  }, [cabecerasPeriodo, moneda, nivelDe]);

  const descripcionOc = (idOc: number) => {
    const cab = cabeceraPorOc.get(idOc);
    return {
      cliente: texto(cab?.nombreCliente, "-"),
      proyecto: texto(cab?.nombreProyecto, "-"),
      responsable: texto(cab?.responsable, "-"),
      fecha: cab?.fecha,
      nivel: cab ? nivelDe(cab) : -1,
    };
  };

  const sobreconsumo = useMemo(
    () => ejecucionMoneda.filter((item) => item.oc > 0 && item.gastado > item.oc + 0.01)
      .sort((a, b) => (b.gastado - b.oc) - (a.gastado - a.oc)),
    [ejecucionMoneda]
  );
  const casiAgotadas = useMemo(
    () => ejecucionMoneda.filter((item) => item.oc > 0 && item.gastado / item.oc >= 0.9 && item.gastado <= item.oc + 0.01)
      .sort((a, b) => b.gastado / b.oc - a.gastado / a.oc),
    [ejecucionMoneda]
  );
  const aprobadasSinGasto = useMemo(
    () => ejecucionMoneda
      .filter((item) => !item.conPlanilla && descripcionOc(item.idOc).nivel === 4 && diasDesde(descripcionOc(item.idOc).fecha) >= DIAS_SIN_GASTO)
      .sort((a, b) => diasDesde(descripcionOc(b.idOc).fecha) - diasDesde(descripcionOc(a.idOc).fecha)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- descripcionOc depende de cabeceraPorOc y nivelDe
    [ejecucionMoneda, cabeceraPorOc, nivelDe]
  );
  const responsableDistinto = useMemo(() => (ejecucion ?? []).filter((item) => item.motivos.length > 0), [ejecucion]);

  const cargandoCabeceras = !cabecerasListas;
  const ejecucionPendiente = ejecucion === null;
  const contar = (n: number) => (ejecucionPendiente ? "…" : String(n));

  // Tarjetas: las usan la pantalla y el PDF.
  const kpis: KpiDatos[] = [
    { color: COLORS.azul, label: "OC emitidas", valor: String(embudo.emitidas.cantidad), detalle: montosTexto(embudo.emitidas.montos) },
    {
      color: COLORS.ambar,
      label: "En validación",
      valor: String(embudo.validacion.cantidad),
      detalle: `1ra ${embudo.n1} · 2da ${embudo.n2} · 3ra ${embudo.n3}`,
      detalle2: montosTexto(embudo.validacion.montos),
    },
    { color: COLORS.verde, label: "Aprobadas", valor: String(embudo.aprobadas.cantidad), detalle: montosTexto(embudo.aprobadas.montos) },
    {
      color: COLORS.rojo,
      label: "Rechazadas",
      valor: String(embudo.rechazadas.cantidad),
      detalle: embudo.emitidas.cantidad > 0 ? `${((embudo.rechazadas.cantidad / embudo.emitidas.cantidad) * 100).toFixed(1)} % de las emitidas` : "—",
    },
    {
      color: COLORS.verde,
      label: `Avance de ejecución · ${moneda || "—"}`,
      valor: ejecucionPendiente ? "…" : `${avance.pct.toFixed(1)} %`,
      detalle: ejecucionPendiente ? "Calculando ejecución..." : `Gastado ${fmtCorto(avance.gastado)} de ${fmtCorto(avance.totalOc)}`,
    },
    {
      color: COLORS.azul,
      label: `Saldo por ejecutar · ${moneda || "—"}`,
      valor: ejecucionPendiente ? "…" : fmtCorto(avance.saldo),
      detalle: ejecucionPendiente ? "Calculando ejecución..." : `${sinGastoTotal} OC sin ningún gasto`,
    },
  ];

  // Tablas de alertas: las usan la pantalla (una a la vez) y el PDF (todas).
  const filasEjecucion = (items: OcEjecucion[], extra: (item: OcEjecucion) => string) =>
    items.map((item) => [
      `OC-${item.idOc}`,
      descripcionOc(item.idOc).cliente,
      descripcionOc(item.idOc).proyecto,
      fmt(item.oc),
      fmt(item.gastado),
      item.oc > 0 ? `${((item.gastado / item.oc) * 100).toFixed(1)} %` : "—",
      extra(item),
    ]);
  const columnasEjecucion = (extra: string) => ["OC", "Cliente", "Proyecto", `Monto OC ${moneda}`, "Gastado", "Consumo", extra];
  const vacioEjecucion = (mensaje: string) => (ejecucionPendiente ? "Calculando ejecución..." : mensaje);
  const tablas: Record<AlertaTab, TablaDatos> = {
    validadores: {
      titulo: "Pendientes por validador",
      vacio: "No hay órdenes pendientes de validación en el período.",
      columnas: ["Nivel", "Validador", "OC pendientes", `Monto ${moneda}`, "> 7 días", "> 15 días", "> 30 días", "Más antigua"],
      filas: pendientesValidador.map((item) => [
        ["", "1ra", "2da", "3ra"][item.nivel] ?? String(item.nivel),
        item.validador,
        String(item.cantidad),
        fmt(item.monto),
        item.d7 > 0 ? String(item.d7) : "—",
        item.d15 > 0 ? String(item.d15) : "—",
        item.d30 > 0 ? String(item.d30) : "—",
        `${item.maxDias} d`,
      ]),
      alertaDesde: [5, 6, 7],
    },
    sobreconsumo: {
      titulo: "Órdenes con sobreconsumo",
      vacio: vacioEjecucion("No hay órdenes con gastos por encima de su monto."),
      columnas: columnasEjecucion("Exceso"),
      filas: filasEjecucion(sobreconsumo, (item) => fmt(item.gastado - item.oc)),
    },
    agotadas: {
      titulo: "Órdenes casi agotadas (90 % o más)",
      vacio: vacioEjecucion("No hay órdenes con 90 % o más de consumo."),
      columnas: columnasEjecucion("Saldo"),
      filas: filasEjecucion(casiAgotadas, (item) => fmt(Math.max(0, item.oc - item.gastado))),
    },
    sinGasto: {
      titulo: `Órdenes aprobadas sin gasto (${DIAS_SIN_GASTO} días o más)`,
      vacio: vacioEjecucion(`No hay órdenes aprobadas sin gastos desde hace ${DIAS_SIN_GASTO} días o más.`),
      columnas: columnasEjecucion("Días desde creación"),
      filas: filasEjecucion(aprobadasSinGasto, (item) => `${diasDesde(descripcionOc(item.idOc).fecha)} d`),
    },
    responsable: {
      titulo: "Responsable del gasto distinto al de la OC",
      vacio: vacioEjecucion("Los gastos coinciden con el responsable de cada OC."),
      columnas: ["OC", "Cliente", "Responsable de la OC", "Motivo"],
      filas: responsableDistinto.map((item) => [
        `OC-${item.idOc}`,
        descripcionOc(item.idOc).cliente,
        descripcionOc(item.idOc).responsable,
        item.motivos.join(" · "),
      ]),
    },
  };
  const ETIQUETAS_TAB: Record<AlertaTab, string> = {
    validadores: "Pendientes por validador",
    sobreconsumo: "Sobreconsumo",
    agotadas: "Casi agotadas",
    sinGasto: "Aprobadas sin gasto",
    responsable: "Responsable distinto",
  };
  const cantidadTab = (key: AlertaTab) => (key === "validadores" ? String(tablas.validadores.filas.length) : contar(tablas[key].filas.length));

  const exportarPdf = async () => {
    setExportando(true);
    try {
      const [{ doc, autoTable }, imgMes, imgEstado, imgTop, imgConsumo] = await Promise.all([
        cargarPdf("landscape"),
        svgAPng(refMes.current),
        svgAPng(refEstado.current),
        svgAPng(refTop.current),
        svgAPng(refConsumo.current),
      ]);
      const titulo = "Resumen gerencial de órdenes de compra";
      const subtitulo = `Período: ${desde || "inicio"} a ${hasta || "hoy"} · Moneda: ${moneda || "—"}${filtroActivo ? ` · Filtro: ${etiquetaFiltro}` : ""}${hayFiltroSolicitante ? ` · Solicitante: ${solicitantesActivos.length <= 3 ? solicitantesActivos.join(", ") : `${solicitantesActivos.length} seleccionados`}` : ""}${hayFiltroResponsable ? ` · Responsable: ${responsablesActivos.length <= 3 ? responsablesActivos.join(", ") : `${responsablesActivos.length} seleccionados`}` : ""}`;
      const ancho = doc.internal.pageSize.getWidth();
      const rgb = (hex: string): [number, number, number] => [
        parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16),
      ];

      // Página 1: tarjetas y primeros gráficos
      encabezadoPagina(doc, subtitulo, titulo);
      const margen = 10;
      const gap = 6;
      const cardW = (ancho - margen * 2 - gap * 2) / 3;
      const cardH = 30;
      kpis.forEach((kpi, index) => {
        const x = margen + (index % 3) * (cardW + gap);
        const y = 25 + Math.floor(index / 3) * (cardH + gap);
        doc.setDrawColor(...rgb(COLORS.borde));
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(x, y, cardW, cardH, 2, 2, "FD");
        doc.setFillColor(...rgb(kpi.color));
        doc.rect(x, y, cardW, 1.4, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(...rgb(COLORS.suave));
        doc.text(kpi.label.toUpperCase(), x + 4, y + 7);
        doc.setFontSize(20);
        doc.setTextColor(...rgb(COLORS.tinta));
        doc.text(kpi.valor, x + 4, y + 17);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...rgb(COLORS.suave));
        const lineas = doc.splitTextToSize([kpi.detalle, kpi.detalle2].filter(Boolean).join("  |  "), cardW - 8) as string[];
        doc.text(lineas.slice(0, 2), x + 4, y + 22.5);
      });

      const caja = (img: Awaited<ReturnType<typeof svgAPng>>, x: number, y: number, w: number, h: number, tituloCaja: string) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...rgb(COLORS.tinta));
        doc.text(tituloCaja, x, y);
        if (!img) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(...rgb(COLORS.suave));
          doc.text("Sin datos para el período y la moneda elegidos.", x, y + 8);
          return;
        }
        const escala = Math.min(w / img.w, (h - 4) / img.h);
        doc.addImage(img.data, "PNG", x, y + 2, img.w * escala, img.h * escala);
      };
      const mitad = (ancho - margen * 2 - gap) / 2;
      const yGraficos = 25 + 2 * (cardH + gap) + 6;
      caja(imgMes, margen, yGraficos, mitad, 80, `Monto creado por mes · ${moneda || "—"}`);
      caja(imgEstado, margen + mitad + gap, yGraficos, mitad * 0.55, 80, "Órdenes por estado");
      let yLeyenda = yGraficos + 14;
      porEstado.forEach((item) => {
        doc.setFillColor(...rgb(item.color));
        doc.rect(margen + mitad + gap + mitad * 0.6, yLeyenda - 2.6, 3, 3, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...rgb(COLORS.tinta));
        doc.text(`${item.name}: ${item.value}`, margen + mitad + gap + mitad * 0.6 + 5, yLeyenda);
        yLeyenda += 6;
      });

      // Página 2: top y consumo
      doc.addPage();
      encabezadoPagina(doc, subtitulo, titulo);
      caja(imgTop, margen, 28, mitad, 150, `Top 10 por ${dimension} · ${moneda || "—"}`);
      caja(imgConsumo, margen + mitad + gap, 28, mitad, 80, `Consumo de las OC (cantidad de OC) · ${moneda || "—"}`);

      // Páginas siguientes: una por alerta
      (Object.keys(tablas) as AlertaTab[]).forEach((key, index) => {
        const tabla = tablas[key];
        doc.addPage();
        encabezadoPagina(doc, subtitulo, titulo);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...rgb(COLORS.tinta));
        doc.text(`${index + 1}. ${tabla.titulo} (${cantidadTab(key)})`, margen, 28);
        if (tabla.filas.length === 0) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(...rgb(COLORS.suave));
          doc.text(tabla.vacio, margen, 36);
          return;
        }
        autoTable(doc, {
          startY: 32,
          head: [tabla.columnas],
          body: tabla.filas.slice(0, 40),
          styles: { fontSize: 8, cellPadding: 1.8, textColor: rgb(COLORS.tinta) },
          headStyles: { fillColor: rgb(COLORS.verde), textColor: 255 },
          alternateRowStyles: { fillColor: [247, 249, 250] },
          margin: { top: 24, left: margen, right: margen },
          didDrawPage: () => encabezadoPagina(doc, subtitulo, titulo),
        });
        if (tabla.filas.length > 40) {
          const y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 32) + 5;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(...rgb(COLORS.suave));
          doc.text(`Se muestran las 40 primeras de ${tabla.filas.length}.`, margen, y);
        }
      });

      // Pie de página
      const total = doc.getNumberOfPages();
      const alto = doc.internal.pageSize.getHeight();
      for (let pagina = 1; pagina <= total; pagina += 1) {
        doc.setPage(pagina);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(`${EMPRESA} · ${titulo} · ${marcaGeneracion()}`, margen, alto - 6);
        doc.text(`Página ${pagina} de ${total}`, ancho - margen, alto - 6, { align: "right" });
      }
      doc.save(nombreArchivo("resumen_ordenes_compra"));
    } catch (err) {
      setFilasError(getHttpErrorMessage(err, "No se pudo generar el PDF del resumen."));
    } finally {
      setExportando(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Encabezado y filtros */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, color: COLORS.tinta }}>Resumen gerencial de órdenes de compra</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: COLORS.suave }}>
            Los montos se muestran por moneda y no se mezclan. Las rechazadas no cuentan en ejecución ni en gráficos.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={etiqueta}>
            <span>Creadas desde</span>
            <input type="date" value={desde} max={hasta || undefined} onChange={(event) => setDesde(event.target.value)} style={campo} />
          </label>
          <label style={etiqueta}>
            <span>Hasta</span>
            <input type="date" value={hasta} min={desde || undefined} onChange={(event) => setHasta(event.target.value)} style={campo} />
          </label>
          <label style={etiqueta}>
            <span>Moneda de gráficos y alertas</span>
            <select value={moneda} onChange={(event) => setMonedaElegida(event.target.value)} style={{ ...campo, minWidth: 130 }}>
              {monedas.length === 0 ? <option value="">—</option> : null}
              {monedas.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label style={etiqueta}>
            <span>Solicitante</span>
            <div style={{ width: 250 }}>
              <MultiFiltroBuscable
                options={solicitanteOpciones.map((item) => ({ value: item.nombre, label: `${item.nombre} (${item.cantidad})` }))}
                selected={solicitantesActivos}
                onChange={setSolicitantes}
                query={busquedaSolicitante}
                onQuery={setBusquedaSolicitante}
                placeholder="Escriba para filtrar..."
                allowSelectAll
              />
            </div>
          </label>
          <label style={etiqueta}>
            <span>Responsable</span>
            <div style={{ width: 250 }}>
              <MultiFiltroBuscable
                options={responsableOpciones.map((item) => ({ value: item.nombre, label: `${item.nombre} (${item.cantidad})` }))}
                selected={responsablesActivos}
                onChange={setResponsables}
                query={busquedaResponsable}
                onQuery={setBusquedaResponsable}
                placeholder="Escriba para filtrar..."
                allowSelectAll
              />
            </div>
          </label>
          <button type="button" style={botonSecundario} onClick={() => setRefrescar((value) => value + 1)} disabled={filasLoading}>
            {filasLoading ? "Calculando..." : "Actualizar"}
          </button>
          <button
            type="button"
            style={{ ...botonPrimario, opacity: cargandoCabeceras || filasLoading || exportando ? 0.6 : 1 }}
            onClick={() => void exportarPdf()}
            disabled={cargandoCabeceras || filasLoading || exportando || monedas.length === 0}
            title={filasLoading ? "Espere a que termine de calcular la ejecución" : "Descargar el resumen en PDF"}
          >
            {exportando ? "Generando PDF..." : "Exportar PDF"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "#FFFFFF", border: `1px solid ${COLORS.borde}`, borderRadius: 12, padding: "6px 14px" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: COLORS.suave }}>Cliente / proyecto / site</span>
        <FiltroOperativoLookup value={filtroOperativo} onChange={setFiltroOperativo} showTrabajo={false} showOt={false} showTarea={false} fontSize={12} />
        {filtroActivo ? (
          <button type="button" style={{ ...botonSecundario, height: 30, padding: "0 12px" }} onClick={() => setFiltroOperativo({})}>
            Quitar filtro
          </button>
        ) : null}
      </div>

      {cargandoCabeceras ? <div style={avisoStyle}>Cargando órdenes de compra...</div> : null}
      {filasError ? <div style={{ ...avisoStyle, background: "#FEF2F2", color: "#991B1B", borderColor: "#FECACA" }}>{filasError}</div> : null}
      {!cargandoCabeceras && monedas.length === 0 ? (
        <div style={avisoStyle}>
          {filtroActivo && filas === null && !filasError ? "Aplicando filtro..." : "No hay órdenes de compra para el período y el filtro seleccionados."}
        </div>
      ) : null}

      {/* Indicadores */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
        {kpis.map((kpi) => <Kpi key={kpi.label} {...kpi} />)}
      </div>

      {/* Gráficos */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 12 }}>
        <Tarjeta titulo={`Monto creado por mes · ${moneda || "—"}`}>
          {porMes.length === 0 ? <Vacio /> : (
            <div ref={refMes}><ResponsiveContainer width="100%" height={250}>
              <BarChart data={porMes} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.borde} vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: COLORS.suave }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(value) => fmtCorto(Number(value))} tick={{ fontSize: 11, fill: COLORS.suave }} axisLine={false} tickLine={false} width={52} />
                <Tooltip
                  formatter={(value, _name, item) => [`${moneda} ${fmt(Number(value))} · ${(item?.payload as { cantidad?: number } | undefined)?.cantidad ?? 0} OC`, "Monto"]}
                  cursor={{ fill: "#F1F5F9" }}
                />
                <Bar dataKey="monto" fill={COLORS.verde} radius={[6, 6, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer></div>
          )}
        </Tarjeta>

        <Tarjeta titulo="Órdenes por estado">
          {porEstado.length === 0 ? <Vacio /> : (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div ref={refEstado} style={{ width: 210, height: 210 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={porEstado} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={2} stroke="none">
                      {porEstado.map((item) => <Cell key={item.name} fill={item.color} />)}
                    </Pie>
                    <Tooltip formatter={(value, name) => [`${value} OC`, String(name)]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 160 }}>
                {porEstado.map((item) => (
                  <div key={item.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: COLORS.tinta }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: item.color }} />
                    <span style={{ flex: 1 }}>{item.name}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Tarjeta>

        <Tarjeta
          titulo={`Top 10 por monto · ${moneda || "—"}`}
          acciones={(
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {([["cliente", "Cliente"], ["proyecto", "Proyecto"], ["solicitante", "Solicitante"], ["responsable", "Responsable"]] as Array<[Dimension, string]>).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setDimension(key)} style={pill(dimension === key)}>{label}</button>
              ))}
            </div>
          )}
        >
          {topDimension.length === 0 ? <Vacio /> : (
            <div ref={refTop}><ResponsiveContainer width="100%" height={Math.max(220, topDimension.length * 28 + 20)}>
              <BarChart data={topDimension} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.borde} horizontal={false} />
                <XAxis type="number" tickFormatter={(value) => fmtCorto(Number(value))} tick={{ fontSize: 11, fill: COLORS.suave }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11, fill: COLORS.tinta }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value) => [`${moneda} ${fmt(Number(value))}`, "Monto"]}
                  labelFormatter={(_label, payload) => (payload?.[0]?.payload as { completo?: string } | undefined)?.completo ?? ""}
                  cursor={{ fill: "#F1F5F9" }}
                />
                <Bar dataKey="value" fill={COLORS.azul} radius={[0, 6, 6, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer></div>
          )}
        </Tarjeta>

        <Tarjeta titulo={`Consumo de las OC (cantidad de OC) · ${moneda || "—"}`}>
          {ejecucionPendiente ? <Vacio texto={filasLoading ? "Calculando ejecución..." : "Sin datos de ejecución."} /> : ejecucionMoneda.length === 0 ? <Vacio /> : (
            <div ref={refConsumo}><ResponsiveContainer width="100%" height={250}>
              <BarChart data={rangosConsumo} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.borde} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: COLORS.suave }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: COLORS.suave }} axisLine={false} tickLine={false} width={36} />
                <Tooltip formatter={(value) => [`${value} OC`, "Cantidad"]} cursor={{ fill: "#F1F5F9" }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={52}>
                  {rangosConsumo.map((item) => <Cell key={item.name} fill={item.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer></div>
          )}
        </Tarjeta>
      </div>

      {/* Alertas de gestión */}
      <Tarjeta
        titulo="Alertas de gestión"
        acciones={(
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {(Object.keys(tablas) as AlertaTab[]).map((key) => (
              <button key={key} type="button" onClick={() => setAlertaTab(key)} style={pill(alertaTab === key)}>
                {`${ETIQUETAS_TAB[key]} (${cantidadTab(key)})`}
              </button>
            ))}
          </div>
        )}
      >
        <TablaAlerta vacio={tablas[alertaTab].vacio} columnas={tablas[alertaTab].columnas} filas={tablas[alertaTab].filas} alertaDesde={tablas[alertaTab].alertaDesde} />
      </Tarjeta>
    </div>
  );
}

// ---------- Componentes de presentación ----------

function Kpi({ color, label, valor, detalle, detalle2 }: { color: string; label: string; valor: string; detalle: string; detalle2?: string }) {
  return (
    <div style={{ background: "#FFFFFF", border: `1px solid ${COLORS.borde}`, borderTop: `3px solid ${color}`, borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4, boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: COLORS.suave }}>{label}</span>
      <strong style={{ fontSize: 30, lineHeight: 1.1, fontWeight: 800, color: COLORS.tinta }}>{valor}</strong>
      <span style={{ fontSize: 12, color: COLORS.suave }}>{detalle}</span>
      {detalle2 ? <span style={{ fontSize: 12, color: COLORS.suave }}>{detalle2}</span> : null}
    </div>
  );
}

function Tarjeta({ titulo, acciones, children }: { titulo: string; acciones?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={{ background: "#FFFFFF", border: `1px solid ${COLORS.borde}`, borderRadius: 14, padding: 16, boxShadow: "0 1px 2px rgba(15,23,42,0.04)", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: COLORS.tinta }}>{titulo}</h3>
        {acciones}
      </div>
      {children}
    </section>
  );
}

function Vacio({ texto: mensaje = "Sin datos para el período y la moneda elegidos." }: { texto?: string }) {
  return <div style={{ padding: "36px 8px", textAlign: "center", fontSize: 13, color: COLORS.suave }}>{mensaje}</div>;
}

function TablaAlerta({ columnas, filas, vacio, alertaDesde = [] }: { columnas: string[]; filas: string[][]; vacio: string; alertaDesde?: number[] }) {
  const LIMITE = 15;
  if (filas.length === 0) return <Vacio texto={vacio} />;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            {columnas.map((columna) => (
              <th key={columna} style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: COLORS.suave, borderBottom: `1px solid ${COLORS.borde}`, whiteSpace: "nowrap" }}>{columna}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.slice(0, LIMITE).map((fila, index) => (
            <tr key={`${fila[0]}-${fila[1]}-${index}`}>
              {fila.map((celda, columna) => (
                <td key={columna} style={{ padding: "8px 10px", borderBottom: `1px solid ${COLORS.borde}`, color: alertaDesde.includes(columna) && celda !== "—" ? COLORS.rojo : COLORS.tinta, fontWeight: alertaDesde.includes(columna) && celda !== "—" ? 700 : 400, whiteSpace: columna >= 2 ? "nowrap" : "normal" }}>{celda}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {filas.length > LIMITE ? <p style={{ margin: "8px 10px 0", fontSize: 12, color: COLORS.suave }}>Se muestran las {LIMITE} primeras de {filas.length}.</p> : null}
    </div>
  );
}

const etiqueta: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 3, fontSize: 11, fontWeight: 700, color: COLORS.suave };
const campo: React.CSSProperties = { height: 34, border: `1px solid ${COLORS.borde}`, borderRadius: 8, padding: "0 10px", fontSize: 13, background: "#FFFFFF", color: COLORS.tinta };
const botonPrimario: React.CSSProperties = { height: 34, border: "none", background: COLORS.verde, color: "#FFFFFF", borderRadius: 8, padding: "0 16px", fontWeight: 700, cursor: "pointer" };
const botonSecundario: React.CSSProperties = { height: 34, border: `1px solid ${COLORS.verde}`, background: "#FFFFFF", color: COLORS.verde, borderRadius: 8, padding: "0 16px", fontWeight: 700, cursor: "pointer" };
const avisoStyle: React.CSSProperties = { padding: "10px 14px", borderRadius: 10, border: "1px solid #BFDBFE", background: "#EFF6FF", color: "#1E40AF", fontSize: 13 };
const pill = (activo: boolean): React.CSSProperties => ({
  border: `1px solid ${activo ? COLORS.verde : COLORS.borde}`,
  background: activo ? COLORS.verde : "#FFFFFF",
  color: activo ? "#FFFFFF" : COLORS.suave,
  borderRadius: 999,
  padding: "5px 12px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
});
