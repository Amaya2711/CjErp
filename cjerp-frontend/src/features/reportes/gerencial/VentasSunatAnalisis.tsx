import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { VentasSunatRegistroDto } from "../../../api/ventasSunatService";

type Props = {
  registros: VentasSunatRegistroDto[];
  /** Selector de periodo (el mismo de la pestaña Historial). */
  selector?: ReactNode;
  periodoTexto: string;
};

type Metrica = "totalCp" | "biGravada" | "igv";

const METRICAS: { value: Metrica; label: string }[] = [
  { value: "totalCp", label: "Total CP" },
  { value: "biGravada", label: "Base imponible (BI gravada)" },
  { value: "igv", label: "IGV" },
];

const TIPOS_CP: Record<string, string> = {
  "01": "Factura",
  "03": "Boleta",
  "07": "Nota de crédito",
  "08": "Nota de débito",
};

const PALETA = ["#2563EB", "#059669", "#D97706", "#7C3AED", "#DC2626", "#0891B2", "#DB2777", "#65A30D", "#475569", "#EA580C"];
const SIN_EMPRESA = "Sin empresa";

const numero = (valor: number | null | undefined) => (typeof valor === "number" && Number.isFinite(valor) ? valor : 0);
const formatear = (valor: number) => valor.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compacto = (valor: number) => {
  const abs = Math.abs(valor);
  if (abs >= 1_000_000) return `${(valor / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(valor / 1_000).toFixed(0)}K`;
  return valor.toFixed(0);
};
const clienteDe = (r: VentasSunatRegistroDto) => (r.nombreCliente || r.razonSocial || "Sin cliente").trim();
const empresaDe = (r: VentasSunatRegistroDto) => (r.empresa ?? "").trim() || SIN_EMPRESA;
const tipoDe = (r: VentasSunatRegistroDto) => (r.tipoCp ?? "").trim() || "—";
const nombreTipo = (codigo: string) => (TIPOS_CP[codigo] ? `${codigo} - ${TIPOS_CP[codigo]}` : codigo);
// Recharts entrega el dato original de la barra en payload (o mezclado en el propio objeto).
const nombreDeBarra = (evento: unknown): string | undefined => {
  const e = evento as { nombre?: string; payload?: { nombre?: string } } | null;
  return e?.payload?.nombre ?? e?.nombre;
};
// Convierte el SVG de un grafico de Recharts en una imagen PNG (sin librerias adicionales) para incrustarla en el PDF.
async function svgAImagen(svg: SVGSVGElement, escala = 2): Promise<{ dataUrl: string; ancho: number; alto: number }> {
  const caja = svg.getBoundingClientRect();
  const ancho = Math.max(1, Math.round(caja.width));
  const alto = Math.max(1, Math.round(caja.height));
  const clon = svg.cloneNode(true) as SVGSVGElement;
  clon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clon.setAttribute("width", String(ancho));
  clon.setAttribute("height", String(alto));
  clon.setAttribute("viewBox", `0 0 ${ancho} ${alto}`);
  clon.style.fontFamily = "Arial, Helvetica, sans-serif";

  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clon)], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const imagen = new Image();
    await new Promise<void>((resolve, reject) => {
      imagen.onload = () => resolve();
      imagen.onerror = () => reject(new Error("No se pudo convertir un gráfico para el PDF."));
      imagen.src = url;
    });
    const lienzo = document.createElement("canvas");
    lienzo.width = ancho * escala;
    lienzo.height = alto * escala;
    const ctx = lienzo.getContext("2d");
    if (!ctx) throw new Error("No se pudo preparar el lienzo del PDF.");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    return { dataUrl: lienzo.toDataURL("image/png"), ancho, alto };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const dia = (r: VentasSunatRegistroDto) => (r.fechaEmision ?? "").slice(0, 10);

const styles: Record<string, CSSProperties> = {
  filtros: { display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" },
  campo: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#475569", fontWeight: 600 },
  select: { height: 34, padding: "0 8px", border: "1px solid #CBD5E1", borderRadius: 6, fontSize: 13, minWidth: 170, background: "#fff" },
  boton: { height: 34, padding: "0 14px", border: "1px solid #CBD5E1", borderRadius: 6, background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13 },
  kpis: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 },
  kpi: { border: "1px solid #D8E5F2", borderRadius: 14, padding: 14, background: "#fff" },
  kpiLabel: { fontSize: 12, color: "#64748B", fontWeight: 700, marginBottom: 6 },
  kpiValor: { fontSize: 20, fontWeight: 900, color: "#0F172A" },
  kpiSub: { fontSize: 11, color: "#64748B", marginTop: 4 },
  graficos: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 14 },
  tarjeta: { border: "1px solid #D8E5F2", borderRadius: 14, padding: 14, background: "#fff" },
  tarjetaTitulo: { fontSize: 13, fontWeight: 800, color: "#0F172A", marginBottom: 2 },
  tarjetaSub: { fontSize: 11, color: "#64748B", marginBottom: 8 },
  chips: { display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 },
  chip: { background: "#EDE9FE", color: "#5B21B6", borderRadius: 999, padding: "3px 10px", fontWeight: 700 },
  vacio: { padding: 24, textAlign: "center", color: "#64748B", fontSize: 13 },
};

// Lista desplegable con busqueda y casillas para elegir uno o varios elementos (sin seleccion = todos).
function SelectorMultiple({
  opciones,
  seleccion,
  onChange,
  singular,
  plural,
}: {
  opciones: string[];
  seleccion: string[];
  onChange: (valor: string[]) => void;
  singular: string;
  plural: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const contenedor = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrarAlHacerClicFuera = (evento: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(evento.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", cerrarAlHacerClicFuera);
    return () => document.removeEventListener("mousedown", cerrarAlHacerClicFuera);
  }, [abierto]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return texto ? opciones.filter((o) => o.toLowerCase().includes(texto)) : opciones;
  }, [opciones, busqueda]);

  const alternar = (opcion: string) =>
    onChange(seleccion.includes(opcion) ? seleccion.filter((c) => c !== opcion) : [...seleccion, opcion]);

  const resumen =
    seleccion.length === 0 ? "Todos" : seleccion.length === 1 ? seleccion[0] : `${seleccion.length} ${plural} seleccionados`;

  return (
    <div ref={contenedor} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        style={{ ...styles.select, minWidth: 260, maxWidth: 320, textAlign: "left", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {resumen} ▾
      </button>
      {abierto ? (
        <div
          style={{
            position: "absolute",
            zIndex: 20,
            top: 38,
            left: 0,
            width: 340,
            background: "#fff",
            border: "1px solid #CBD5E1",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(15,23,42,0.15)",
            padding: 8,
          }}
        >
          <input
            type="text"
            autoFocus
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={`Buscar ${singular}...`}
            style={{ ...styles.select, width: "100%", minWidth: 0, boxSizing: "border-box", marginBottom: 6 }}
          />
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <button type="button" style={{ ...styles.boton, height: 28, fontSize: 12 }} onClick={() => onChange(Array.from(new Set([...seleccion, ...visibles])))}>
              Marcar visibles
            </button>
            <button type="button" style={{ ...styles.boton, height: 28, fontSize: 12 }} onClick={() => onChange([])}>
              Quitar todos
            </button>
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {visibles.length === 0 ? (
              <div style={{ padding: 8, fontSize: 12, color: "#64748B" }}>Sin coincidencias.</div>
            ) : (
              visibles.map((opcion) => (
                <label key={opcion} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 6px", fontSize: 12, cursor: "pointer", fontWeight: 500, color: "#0F172A" }}>
                  <input type="checkbox" checked={seleccion.includes(opcion)} onChange={() => alternar(opcion)} />
                  <span>{opcion}</span>
                </label>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Tarjeta({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <div style={styles.tarjeta} data-grafico="" data-titulo={titulo} data-subtitulo={subtitulo ?? ""}>
      <div style={styles.tarjetaTitulo}>{titulo}</div>
      {subtitulo ? <div style={styles.tarjetaSub}>{subtitulo}</div> : null}
      {children}
    </div>
  );
}

function Kpi({ label, valor, sub, alerta }: { label: string; valor: string; sub?: string; alerta?: boolean }) {
  return (
    <div style={styles.kpi}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={{ ...styles.kpiValor, color: alerta ? "#B91C1C" : "#0F172A" }}>{valor}</div>
      {sub ? <div style={styles.kpiSub}>{sub}</div> : null}
    </div>
  );
}

export default function VentasSunatAnalisis({ registros, selector, periodoTexto }: Props) {
  const [empresasSel, setEmpresasSel] = useState<string[]>([]); // vacio = todas las empresas
  const [clientesSel, setClientesSel] = useState<string[]>([]); // vacio = todos los clientes
  const [moneda, setMoneda] = useState(""); // "" = todas; filtra por la moneda del comprobante (los importes siempre están en soles)
  const [tipo, setTipo] = useState("");
  const [metrica, setMetrica] = useState<Metrica>("totalCp");
  const [exportando, setExportando] = useState(false);
  const [errorPdf, setErrorPdf] = useState("");
  const refGraficos = useRef<HTMLDivElement | null>(null);

  const empresas = useMemo(() => Array.from(new Set(registros.map(empresaDe))).sort(), [registros]);
  const clientes = useMemo(() => Array.from(new Set(registros.map(clienteDe))).sort((a, b) => a.localeCompare(b)), [registros]);
  const monedas = useMemo(() => Array.from(new Set(registros.map((r) => (r.moneda ?? "").trim()).filter(Boolean))).sort(), [registros]);
  const tipos = useMemo(() => Array.from(new Set(registros.map(tipoDe))).sort(), [registros]);

  const filtrados = useMemo(
    () =>
      registros.filter(
        (r) =>
          (empresasSel.length === 0 || empresasSel.includes(empresaDe(r))) &&
          (clientesSel.length === 0 || clientesSel.includes(clienteDe(r))) &&
          (!moneda || (r.moneda ?? "").trim() === moneda) &&
          (!tipo || tipoDe(r) === tipo)
      ),
    [registros, empresasSel, clientesSel, moneda, tipo]
  );

  // Con "Todas" las monedas, los importes en dólares se expresan en soles con el tipo de cambio del propio comprobante
  // (solo para este análisis; el dato grabado no se modifica). Con una moneda elegida se muestra el importe original.
  // El Registro de Ventas SIRE ya entrega todos los importes en soles (también los comprobantes en USD): no se convierte.
  const convertir = (_r: VentasSunatRegistroDto, valor: number | null | undefined) => numero(valor);
  const simbolo = "S/";
  const etiquetaImporte = "Importes en soles (ya convertidos en el registro)";

  const valorMetrica = (r: VentasSunatRegistroDto) => convertir(r, r[metrica]);

  const kpis = useMemo(() => {
    const total = filtrados.reduce((acc, r) => acc + convertir(r, r.totalCp), 0);
    const bi = filtrados.reduce((acc, r) => acc + convertir(r, r.biGravada), 0);
    const igv = filtrados.reduce((acc, r) => acc + convertir(r, r.igv), 0);
    const notasCredito = filtrados.filter((r) => tipoDe(r) === "07");
    const montoNotas = notasCredito.reduce((acc, r) => acc + convertir(r, r.totalCp), 0);
    const clientesUnicos = new Set(filtrados.map(clienteDe)).size;
    const sinEmpresa = filtrados.filter((r) => empresaDe(r) === SIN_EMPRESA).length;
    return {
      total,
      bi,
      igv,
      comprobantes: filtrados.length,
      clientesUnicos,
      ticket: filtrados.length > 0 ? total / filtrados.length : 0,
      notas: notasCredito.length,
      montoNotas,
      sinEmpresa,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrados, moneda]);

  const agrupar = (clave: (r: VentasSunatRegistroDto) => string) => {
    const mapa = new Map<string, number>();
    filtrados.forEach((r) => mapa.set(clave(r), (mapa.get(clave(r)) ?? 0) + valorMetrica(r)));
    return Array.from(mapa, ([nombre, valor]) => ({ nombre, valor: Math.round(valor * 100) / 100 }));
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  const porDia = useMemo(
    () => agrupar(dia).filter((x) => x.nombre).sort((a, b) => a.nombre.localeCompare(b.nombre)).map((x) => ({ ...x, etiqueta: x.nombre.slice(8, 10) + "/" + x.nombre.slice(5, 7) })),
    [filtrados, metrica, moneda]
  );
  const porEmpresa = useMemo(() => agrupar(empresaDe).sort((a, b) => b.valor - a.valor), [filtrados, metrica, moneda]);
  const topClientes = useMemo(() => agrupar(clienteDe).sort((a, b) => b.valor - a.valor).slice(0, 10), [filtrados, metrica, moneda]);
  const porTipo = useMemo(() => agrupar(tipoDe).sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)), [filtrados, metrica, moneda]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const hayFiltros = Boolean(empresasSel.length > 0 || clientesSel.length > 0 || moneda || tipo);
  const limpiar = () => {
    setEmpresasSel([]);
    setClientesSel([]);
    setMoneda("");
    setTipo("");
  };
  const tooltipMonto = (valor: unknown) => `${simbolo} ${formatear(Number(valor) || 0)}`;
  const metricaTexto = METRICAS.find((m) => m.value === metrica)?.label ?? "";

  const kpiItems: { label: string; valor: string; sub?: string; alerta?: boolean }[] = [
    { label: "Total ventas (Total CP)", valor: `${simbolo} ${formatear(kpis.total)}`, sub: `${kpis.comprobantes} comprobantes` },
    { label: "Base imponible", valor: `${simbolo} ${formatear(kpis.bi)}`, sub: "BI gravada" },
    { label: "IGV", valor: `${simbolo} ${formatear(kpis.igv)}`, sub: kpis.bi ? `${((kpis.igv / kpis.bi) * 100).toFixed(1)}% de la BI` : undefined },
    { label: "Clientes", valor: String(kpis.clientesUnicos), sub: "clientes distintos" },
    { label: "Ticket promedio", valor: `${simbolo} ${formatear(kpis.ticket)}`, sub: "Total CP / comprobante" },
    { label: "Notas de crédito", valor: `${simbolo} ${formatear(kpis.montoNotas)}`, sub: `${kpis.notas} comprobantes`, alerta: kpis.notas > 0 },
    { label: "Sin empresa asignada", valor: String(kpis.sinEmpresa), sub: "RUC fuera de RELACION_VTA", alerta: kpis.sinEmpresa > 0 },
  ];

  // Exporta a PDF todo lo visualizado: filtros aplicados, KPIs y graficos con los filtros actuales.
  const exportarPdf = async () => {
    setExportando(true);
    setErrorPdf("");
    try {
      const { default: JsPdf } = await import("jspdf");
      const doc = new JsPdf({ unit: "mm", format: "a4" });
      const margen = 12;
      const ancho = 210 - margen * 2;
      const altoPagina = 297;
      let y = margen;

      const gris = [100, 116, 139] as const;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(15, 23, 42);
      doc.text("Ventas SUNAT - Análisis gerencial", margen, y + 5);
      y += 11;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...gris);
      doc.text(`Periodo ${periodoTexto}  |  Generado el ${new Date().toLocaleString("es-PE")}`, margen, y);
      y += 5;
      doc.text(`${filtrados.length} de ${registros.length} comprobantes  |  Gráficos medidos por: ${metricaTexto}`, margen, y);
      y += 5;

      const filtrosTexto = [
        `Empresas: ${empresasSel.length ? empresasSel.join(", ") : "Todas"}`,
        `Clientes: ${clientesSel.length ? clientesSel.join(", ") : "Todos"}`,
        `Moneda del comprobante: ${moneda || "Todas"}`,
        `Tipo de comprobante: ${tipo ? nombreTipo(tipo) : "Todos"}`,
        etiquetaImporte + ".",
      ].join("   |   ");
      doc.setTextColor(51, 65, 85);
      const lineasFiltros = doc.splitTextToSize(`Filtros aplicados: ${filtrosTexto}`, ancho) as string[];
      doc.text(lineasFiltros, margen, y);
      y += lineasFiltros.length * 4.2 + 3;

      // KPIs: 4 por fila
      const columnasKpi = 4;
      const huecoKpi = 3;
      const anchoKpi = (ancho - huecoKpi * (columnasKpi - 1)) / columnasKpi;
      const altoKpi = 19;
      kpiItems.forEach((k, indice) => {
        const col = indice % columnasKpi;
        const fila = Math.floor(indice / columnasKpi);
        const x = margen + col * (anchoKpi + huecoKpi);
        const yKpi = y + fila * (altoKpi + huecoKpi);
        doc.setDrawColor(216, 229, 242);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(x, yKpi, anchoKpi, altoKpi, 2, 2, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(...gris);
        doc.text(k.label, x + 2.5, yKpi + 5);
        doc.setFontSize(10.5);
        if (k.alerta) doc.setTextColor(185, 28, 28);
        else doc.setTextColor(15, 23, 42);
        doc.text(k.valor, x + 2.5, yKpi + 11.5, { maxWidth: anchoKpi - 4 });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(...gris);
        if (k.sub) doc.text(k.sub, x + 2.5, yKpi + 16, { maxWidth: anchoKpi - 4 });
      });
      y += Math.ceil(kpiItems.length / columnasKpi) * (altoKpi + huecoKpi) + 3;

      // Graficos: 2 por fila (los SVG visibles se convierten a imagen)
      const tarjetas = Array.from(refGraficos.current?.querySelectorAll<HTMLElement>("[data-grafico]") ?? []);
      if (tarjetas.length === 0) {
        doc.setFontSize(9);
        doc.setTextColor(...gris);
        doc.text("Ningún comprobante cumple los filtros seleccionados: no hay gráficos para exportar.", margen, y + 4);
      }
      const anchoGrafico = (ancho - 4) / 2;
      const imagenes = [] as { titulo: string; subtitulo: string; dataUrl: string; alto: number }[];
      for (const tarjeta of tarjetas) {
        const svg = tarjeta.querySelector<SVGSVGElement>("svg.recharts-surface");
        if (!svg) continue;
        const img = await svgAImagen(svg);
        imagenes.push({
          titulo: tarjeta.dataset.titulo ?? "",
          subtitulo: tarjeta.dataset.subtitulo ?? "",
          dataUrl: img.dataUrl,
          alto: (anchoGrafico - 4) * (img.alto / img.ancho),
        });
      }
      for (let i = 0; i < imagenes.length; i += 2) {
        const fila = imagenes.slice(i, i + 2);
        const altoFila = Math.max(...fila.map((g) => g.alto)) + 13;
        if (y + altoFila > altoPagina - 14) {
          doc.addPage();
          y = margen;
        }
        fila.forEach((g, col) => {
          const x = margen + col * (anchoGrafico + 4);
          doc.setDrawColor(216, 229, 242);
          doc.roundedRect(x, y, anchoGrafico, altoFila, 2, 2, "S");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.setTextColor(15, 23, 42);
          doc.text(g.titulo, x + 2, y + 5);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.5);
          doc.setTextColor(...gris);
          doc.text(doc.splitTextToSize(g.subtitulo, anchoGrafico - 4) as string[], x + 2, y + 8.5);
          doc.addImage(g.dataUrl, "PNG", x + 2, y + 11, anchoGrafico - 4, g.alto);
        });
        y += altoFila + 4;
      }

      const totalPaginas = doc.getNumberOfPages();
      for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
        doc.setPage(pagina);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...gris);
        doc.text(`Cj Telecom - Ventas SUNAT | Análisis | Página ${pagina} / ${totalPaginas}`, 105, altoPagina - 7, { align: "center" });
      }

      doc.save(`ventas_sunat_analisis_${periodoTexto.replace(/[^0-9A-Za-z-]/g, "")}.pdf`);
    } catch (err) {
      setErrorPdf(err instanceof Error ? err.message : "No se pudo generar el PDF.");
    } finally {
      setExportando(false);
    }
  };

  if (registros.length === 0) {
    return (
      <div style={{ display: "grid", gap: 14 }}>
        {selector}
        <div style={{ ...styles.tarjeta, ...styles.vacio }}>No hay datos para analizar: cargue un periodo para ver el análisis gerencial.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {selector}

      <div style={styles.filtros}>
        <div style={styles.campo}>
          Empresas
          <SelectorMultiple opciones={empresas} seleccion={empresasSel} onChange={setEmpresasSel} singular="empresa" plural="empresas" />
        </div>
        <div style={styles.campo}>
          Clientes
          <SelectorMultiple opciones={clientes} seleccion={clientesSel} onChange={setClientesSel} singular="cliente" plural="clientes" />
        </div>
        <label style={styles.campo}>
          Moneda del comprobante
          <select style={styles.select} value={moneda} onChange={(e) => setMoneda(e.target.value)}>
            <option value="">Todas</option>
            {monedas.map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
        </label>
        <label style={styles.campo}>
          Tipo de comprobante
          <select style={styles.select} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            {tipos.map((x) => (
              <option key={x} value={x}>{nombreTipo(x)}</option>
            ))}
          </select>
        </label>
        <label style={styles.campo}>
          Medir gráficos por
          <select style={styles.select} value={metrica} onChange={(e) => setMetrica(e.target.value as Metrica)}>
            {METRICAS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </label>
        {hayFiltros ? (
          <button type="button" style={styles.boton} onClick={limpiar}>
            Limpiar filtros
          </button>
        ) : null}
        <button type="button" style={{ ...styles.boton, background: "#1D4ED8", color: "#fff", border: "1px solid #1D4ED8" }} disabled={exportando} onClick={() => void exportarPdf()}>
          {exportando ? "Generando PDF..." : "Exportar PDF"}
        </button>
      </div>

      {errorPdf ? <div style={{ color: "#B91C1C", fontSize: 13, fontWeight: 700 }}>{errorPdf}</div> : null}

      <div style={styles.chips}>
        <span style={{ color: "#64748B" }}>
          Periodo {periodoTexto} · {filtrados.length} de {registros.length} comprobantes · {etiquetaImporte}.
        </span>
        {empresasSel.length > 0 ? (
          <span style={styles.chip} title={empresasSel.join("\n")}>
            {empresasSel.length === 1 ? `Empresa: ${empresasSel[0]}` : `Empresas: ${empresasSel.length} seleccionadas`}
          </span>
        ) : null}
        {clientesSel.length > 0 ? (
          <span style={styles.chip} title={clientesSel.join("\n")}>
            {clientesSel.length === 1 ? `Cliente: ${clientesSel[0]}` : `Clientes: ${clientesSel.length} seleccionados`}
          </span>
        ) : null}
        {tipo ? <span style={styles.chip}>Tipo: {nombreTipo(tipo)}</span> : null}
        <span style={{ color: "#64748B" }}>Tip: haga clic en una barra o sector de los gráficos para filtrar.</span>
      </div>

      <div style={styles.kpis}>
        {kpiItems.map((k) => (
          <Kpi key={k.label} label={k.label} valor={k.valor} sub={k.sub} alerta={k.alerta} />
        ))}
      </div>

      {filtrados.length === 0 ? (
        <div style={{ ...styles.tarjeta, ...styles.vacio }}>Ningún comprobante cumple los filtros seleccionados.</div>
      ) : (
        <div style={styles.graficos} ref={refGraficos}>
          <Tarjeta titulo="Evolución diaria" subtitulo={`${metricaTexto} por fecha de emisión`}>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={porDia} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="vsDia" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={compacto} width={48} />
                  <Tooltip formatter={tooltipMonto} labelFormatter={(l) => `Día ${l}`} />
                  <Area type="monotone" dataKey="valor" stroke="#2563EB" strokeWidth={2} fill="url(#vsDia)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Ventas por empresa" subtitulo={`${metricaTexto} · clic para sumar o quitar empresas del filtro`}>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={porEmpresa}
                    dataKey="valor"
                    nameKey="nombre"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={2}
                    label={(e: { name?: string; percent?: number }) => `${e.name ?? ""} ${((e.percent ?? 0) * 100).toFixed(0)}%`}
                    onClick={(e: { name?: string }) => {
                      const nombre = e?.name;
                      if (nombre) {
                        setEmpresasSel((actual) => (actual.includes(nombre) ? actual.filter((x) => x !== nombre) : [...actual, nombre]));
                      }
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    {porEmpresa.map((x, i) => (
                      <Cell key={x.nombre} fill={x.nombre === SIN_EMPRESA ? "#94A3B8" : PALETA[i % PALETA.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={tooltipMonto} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Top 10 clientes" subtitulo={`${metricaTexto} · clic para sumar o quitar clientes del filtro`}>
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topClientes} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={compacto} />
                  <YAxis type="category" dataKey="nombre" width={150} tick={{ fontSize: 10 }} tickFormatter={(v: string) => (v.length > 24 ? `${v.slice(0, 23)}…` : v)} />
                  <Tooltip formatter={tooltipMonto} />
                  <Bar
                    dataKey="valor"
                    radius={[0, 4, 4, 0]}
                    style={{ cursor: "pointer" }}
                    onClick={(e) => {
                      const nombre = nombreDeBarra(e);
                      if (nombre) {
                        setClientesSel((actual) => (actual.includes(nombre) ? actual.filter((c) => c !== nombre) : [...actual, nombre]));
                      }
                    }}
                  >
                    {topClientes.map((x, i) => (
                      <Cell key={x.nombre} fill={PALETA[i % PALETA.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Por tipo de comprobante" subtitulo={`${metricaTexto} · clic para filtrar por tipo`}>
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porTipo.map((x) => ({ ...x, etiqueta: nombreTipo(x.nombre) }))} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={compacto} width={48} />
                  <Tooltip formatter={tooltipMonto} />
                  <Bar
                    dataKey="valor"
                    radius={[4, 4, 0, 0]}
                    style={{ cursor: "pointer" }}
                    onClick={(e) => {
                      const nombre = nombreDeBarra(e);
                      if (nombre) setTipo(nombre === tipo ? "" : nombre);
                    }}
                  >
                    {porTipo.map((x) => (
                      <Cell key={x.nombre} fill={x.valor < 0 ? "#DC2626" : "#059669"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Tarjeta>
        </div>
      )}
    </div>
  );
}
