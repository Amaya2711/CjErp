import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import DataGridPro from "../../../../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../../../../components/datagrid/types";
import { FiltroOperativoLookup } from "../../../../../components/lookups/FiltroOperativoLookup";
import { consultarDashboardEquipos } from "../../../../../api/logisticaEquiposService";
import type { FiltroOperativoValue } from "../../../../../models/filtroOperativo";
import type { DashboardEquipos, DashboardEquiposAntigua, DashboardEquiposProyecto } from "../../../../../models/logisticaEquipos";
import { getHttpErrorMessage } from "../../../../../utils/httpError";
import { ingresoStyles as styles } from "../ingreso/ingresoComun";

// Colores: una sola tonalidad (azul) para magnitud; la antigüedad usa la rampa ordinal del mismo tono (validada: claro → oscuro = más antiguo).
const AZUL = "#2a78d6";
const RAMPA_ANTIGUEDAD = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab"];
const RANGOS_ANTIGUEDAD = ["0-3 días", "4-7 días", "8-15 días", "Más de 15 días"];
const TEXTO = "#0F172A";
const TEXTO_2 = "#475569";
const TEXTO_3 = "#64748B";
const REJILLA = "#E2E8F0";
const MAX_ESTADOS = 7;

const TOOLTIP_ESTILO: CSSProperties = { borderRadius: 8, border: `1px solid ${REJILLA}`, fontSize: 12, padding: "6px 10px" };

const numero = (valor: number) => valor.toLocaleString("es-PE");
const porcentaje = (parte: number, total: number) => (total > 0 ? `${((parte / total) * 100).toFixed(1)}%` : "0%");

/** Fecha local en formato yyyy-MM-dd (sin pasar por UTC, para no correr el día). */
const fechaIso = (fecha: Date) =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;

/** Los últimos 30 días (hoy incluido) con 0 en los días sin solicitudes, para que la línea no salte días. */
function serieUltimos30Dias(tendencia: DashboardEquipos["tendencia"]) {
  const porDia = new Map(tendencia.map((t) => [String(t.fecha).slice(0, 10), t.solicitudes]));
  const hoy = new Date();
  return Array.from({ length: 30 }, (_, i) => {
    const dia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (29 - i));
    const iso = fechaIso(dia);
    return { iso, dia: `${iso.slice(8, 10)}/${iso.slice(5, 7)}`, solicitudes: porDia.get(iso) ?? 0 };
  });
}

type FilaProyecto = DashboardEquiposProyecto & { clave: string };
type FilaAntigua = DashboardEquiposAntigua & { clave: string };

/** Pestaña "Dashboard": resumen ejecutivo y compacto de lo registrado en Solicitud y x Campo (todas las solicitudes, cualquier estado). */
export default function DashboardTab({ onAbrirSolicitud }: { onAbrirSolicitud?: (nroSolicitud: string) => void }) {
  const [usaRelacion, setUsaRelacion] = useState(false);
  const [relacion, setRelacion] = useState<FiltroOperativoValue>({});
  const [datos, setDatos] = useState<DashboardEquipos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [actualizado, setActualizado] = useState("");

  const actualizar = useCallback(async () => {
    const f = usaRelacion ? relacion.filtro : undefined;
    if (usaRelacion && !f) {
      setError("Seleccione la relación cliente-proyecto-site.");
      return;
    }
    setCargando(true);
    setError("");
    try {
      const data = await consultarDashboardEquipos({
        idCliente: f?.idCliente,
        idProyecto: f?.idProyecto,
        idSite: f?.idSite,
        correSite: f?.correlativo,
      });
      setDatos(data);
      setActualizado(new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }));
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo cargar el dashboard."));
    } finally {
      setCargando(false);
    }
  }, [usaRelacion, relacion]);

  // Al abrir la pestaña se muestra el panorama general (sin filtros).
  useEffect(() => {
    let cancelled = false;
    consultarDashboardEquipos({})
      .then((data) => {
        if (cancelled) return;
        setDatos(data);
        setActualizado(new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }));
      })
      .catch((err) => {
        if (!cancelled) setError(getHttpErrorMessage(err, "No se pudo cargar el dashboard."));
      })
      .finally(() => {
        if (!cancelled) setCargando(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const resumen = datos?.resumen;

  // Estados: los de mayor volumen; el resto se agrupa en "Otros".
  const estados = useMemo(() => {
    const lista = (datos?.estados ?? []).map((e) => ({ nombre: e.estado, lineas: e.lineas }));
    if (lista.length <= MAX_ESTADOS + 1) return lista;
    const otros = lista.slice(MAX_ESTADOS).reduce((suma, e) => suma + e.lineas, 0);
    return [...lista.slice(0, MAX_ESTADOS), { nombre: "Otros", lineas: otros }];
  }, [datos]);

  // Antigüedad: siempre los 4 rangos, aunque alguno no tenga líneas.
  const antiguedad = useMemo(() => {
    const porRango = new Map((datos?.antiguedad ?? []).map((a) => [a.rango, a.lineas]));
    return RANGOS_ANTIGUEDAD.map((rango) => ({ rango, lineas: porRango.get(rango) ?? 0 }));
  }, [datos]);

  const tendencia = useMemo(() => serieUltimos30Dias(datos?.tendencia ?? []), [datos]);
  const totalTendencia = useMemo(() => tendencia.reduce((suma, t) => suma + t.solicitudes, 0), [tendencia]);

  const filasProyecto = useMemo<FilaProyecto[]>(() => (datos?.proyectos ?? []).map((p) => ({ ...p, clave: p.proyecto })), [datos]);
  const filasAntiguas = useMemo<FilaAntigua[]>(() => (datos?.antiguas ?? []).map((a) => ({ ...a, clave: a.nroSolicitud })), [datos]);

  const columnasProyecto = useMemo<GridColumn<FilaProyecto>[]>(
    () => [
      { dataField: "proyecto", caption: "Proyecto", width: 230 },
      { dataField: "pendientes", caption: "Pend. campo", dataType: "number", width: 100, alignment: "right" },
      { dataField: "observadas", caption: "Observadas", dataType: "number", width: 100, alignment: "right" },
      { dataField: "total", caption: "Total líneas", dataType: "number", width: 100, alignment: "right" },
    ],
    [],
  );
  const columnasAntiguas = useMemo<GridColumn<FilaAntigua>[]>(
    () => [
      {
        dataField: "nroSolicitud",
        caption: "Nro. solicitud",
        width: 110,
        // Clic: abre la pestaña x Campo filtrada por esta solicitud.
        cellRender: (valor) =>
          onAbrirSolicitud ? (
            <button
              type="button"
              title="Ver en x Campo"
              onClick={() => onAbrirSolicitud(String(valor))}
              style={{ border: 0, background: "transparent", padding: 0, color: "#1F6F8B", textDecoration: "underline", cursor: "pointer", font: "inherit" }}
            >
              {String(valor)}
            </button>
          ) : (
            String(valor)
          ),
      },
      { dataField: "dias", caption: "Días", dataType: "number", width: 60, alignment: "right", cellStyle: () => ({ fontWeight: 700 }) },
      { dataField: "lineas", caption: "Líneas", dataType: "number", width: 70, alignment: "right" },
      { dataField: "proyecto", caption: "Proyecto", width: 170 },
      { dataField: "site", caption: "Site", width: 150 },
    ],
    [onAbrirSolicitud],
  );

  const sinDatos = !cargando && resumen !== undefined && resumen.lineas === 0;

  return (
    <div style={estilo.root}>
      <div style={styles.panel}>
        <label style={styles.check}>
          <input type="checkbox" checked={usaRelacion} onChange={(e) => setUsaRelacion(e.target.checked)} />
          Cliente-proyecto-site
        </label>
        <div style={{ flex: 1, minWidth: 320, opacity: usaRelacion ? 1 : 0.5, pointerEvents: usaRelacion ? "auto" : "none" }}>
          <FiltroOperativoLookup value={relacion} onChange={setRelacion} showTrabajo={false} showOt={false} showTarea={false} />
        </div>
        <button type="button" onClick={() => void actualizar()} disabled={cargando} style={styles.secondary}>
          {cargando ? "Actualizando…" : "Actualizar"}
        </button>
        {actualizado ? <span style={styles.resumen}>Datos de las {actualizado}</span> : null}
      </div>

      {error ? <div role="alert" style={styles.error}>{error}</div> : null}
      {sinDatos ? <div style={estilo.vacio}>No hay solicitudes para los filtros elegidos.</div> : null}

      {resumen ? (
        <>
          <div style={estilo.gridTarjetas}>
            <Tarjeta etiqueta="Solicitudes" valor={numero(resumen.solicitudes)} detalle={`${numero(resumen.lineas)} líneas en total`} />
            <Tarjeta
              etiqueta="Pendientes en campo"
              valor={numero(resumen.lineasPendientes)}
              detalle={`${numero(resumen.solicitudesPendientes)} solicitud(es) · ${porcentaje(resumen.lineasPendientes, resumen.lineas)} de las líneas`}
            />
            <Tarjeta
              etiqueta="Observadas"
              valor={numero(resumen.lineasObservadas)}
              detalle={`${numero(resumen.solicitudesObservadas)} solicitud(es) · ${porcentaje(resumen.lineasObservadas, resumen.lineas)} de las líneas`}
            />
            <Tarjeta
              etiqueta="Antigüedad máx. pendiente"
              valor={`${numero(resumen.diasMaxPendiente ?? 0)} días`}
              detalle={`Promedio ${(resumen.diasPromPendiente ?? 0).toFixed(1)} días`}
            />
          </div>

          <div style={estilo.gridGraficos}>
            <Tablero
              titulo="Líneas por estado"
              subtitulo="Todas las solicitudes, cualquier estado"
              descripcion={estados.map((e) => `${e.nombre}: ${e.lineas}`).join("; ")}
            >
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={estados} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="nombre" width={118} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: TEXTO_2 }} />
                  <Tooltip cursor={{ fill: "rgba(42,120,214,0.08)" }} contentStyle={TOOLTIP_ESTILO} />
                  <Bar dataKey="lineas" name="Líneas" fill={AZUL} barSize={16} radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="lineas" position="right" fill={TEXTO_2} fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Tablero>

            <Tablero
              titulo="Pendientes en campo por antigüedad"
              subtitulo="Líneas en estado 11, días desde la creación de la solicitud"
              descripcion={antiguedad.map((a) => `${a.rango}: ${a.lineas}`).join("; ")}
            >
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={antiguedad} margin={{ top: 18, right: 8, bottom: 4, left: 8 }}>
                  <XAxis dataKey="rango" tickLine={false} axisLine={{ stroke: REJILLA }} tick={{ fontSize: 11, fill: TEXTO_2 }} interval={0} />
                  <YAxis hide />
                  <Tooltip cursor={{ fill: "rgba(42,120,214,0.08)" }} contentStyle={TOOLTIP_ESTILO} />
                  <Bar dataKey="lineas" name="Líneas" barSize={24} radius={[4, 4, 0, 0]}>
                    {antiguedad.map((a, i) => (
                      <Cell key={a.rango} fill={RAMPA_ANTIGUEDAD[i]} />
                    ))}
                    <LabelList dataKey="lineas" position="top" fill={TEXTO_2} fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Tablero>

            <Tablero
              titulo="Solicitudes creadas por día"
              subtitulo={`Últimos 30 días · ${numero(totalTendencia)} solicitud(es)`}
              descripcion={`${numero(totalTendencia)} solicitudes creadas en los últimos 30 días`}
            >
              <ResponsiveContainer width="100%" height={210}>
                <LineChart data={tendencia} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                  <CartesianGrid vertical={false} stroke={REJILLA} />
                  <XAxis dataKey="dia" tickLine={false} axisLine={{ stroke: REJILLA }} tick={{ fontSize: 11, fill: TEXTO_2 }} interval={6} />
                  <YAxis width={30} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: TEXTO_2 }} />
                  <Tooltip contentStyle={TOOLTIP_ESTILO} labelFormatter={(dia) => `Día ${dia}`} />
                  <Line
                    type="monotone"
                    dataKey="solicitudes"
                    name="Solicitudes"
                    stroke={AZUL}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={false}
                    activeDot={{ r: 4, fill: AZUL, stroke: "#FFFFFF", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Tablero>
          </div>

          <div style={estilo.gridTablas}>
            <Tablero titulo="Proyectos con más pendientes" subtitulo="Líneas pendientes de campo u observadas (los 8 mayores)">
              <DataGridPro<FilaProyecto>
                dataSource={filasProyecto}
                columns={columnasProyecto}
                keyExpr="clave"
                height={250}
                noDataText="Sin líneas pendientes ni observadas."
                showFilterRow={false}
                showSearchPanel={false}
                showGroupPanel={false}
                showColumnChooser={false}
                allowExport={false}
                rowAlternation={false}
                rowPadding="3px 8px"
                paging={false}
              />
            </Tablero>
            <Tablero titulo="Solicitudes pendientes más antiguas" subtitulo="Pendientes de campo, de mayor a menor antigüedad (las 8 primeras)">
              <DataGridPro<FilaAntigua>
                dataSource={filasAntiguas}
                columns={columnasAntiguas}
                keyExpr="clave"
                height={250}
                noDataText="No hay solicitudes pendientes de campo."
                showFilterRow={false}
                showSearchPanel={false}
                showGroupPanel={false}
                showColumnChooser={false}
                allowExport={false}
                rowAlternation={false}
                rowPadding="3px 8px"
                paging={false}
              />
            </Tablero>
          </div>
        </>
      ) : cargando ? (
        <div style={estilo.vacio}>Cargando dashboard…</div>
      ) : null}
    </div>
  );
}

/** Tarjeta de cifra: etiqueta, cifra principal y una línea de contexto. */
function Tarjeta({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle: string }) {
  return (
    <div style={estilo.tarjeta}>
      <div style={{ fontSize: 12, color: TEXTO_3, fontWeight: 600 }}>{etiqueta}</div>
      <div style={{ fontSize: 30, lineHeight: 1.15, fontWeight: 800, color: TEXTO, marginTop: 2 }}>{valor}</div>
      <div style={{ fontSize: 12, color: TEXTO_2, marginTop: 2 }}>{detalle}</div>
    </div>
  );
}

/** Recuadro con título para un gráfico o una tabla; `descripcion` es el resumen en texto para lectores de pantalla. */
function Tablero({ titulo, subtitulo, descripcion, children }: { titulo: string; subtitulo: string; descripcion?: string; children: ReactNode }) {
  return (
    <section style={estilo.tablero} aria-label={titulo}>
      <div style={{ fontSize: 13, fontWeight: 700, color: TEXTO }}>{titulo}</div>
      <div style={{ fontSize: 11, color: TEXTO_3, marginBottom: 6 }}>{subtitulo}</div>
      <div role={descripcion ? "img" : undefined} aria-label={descripcion ? `${titulo}. ${descripcion}` : undefined}>
        {children}
      </div>
    </section>
  );
}

const estilo: Record<string, CSSProperties> = {
  root: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, gap: 12, overflowY: "auto", paddingBottom: 8 },
  gridTarjetas: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 },
  gridGraficos: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 },
  gridTablas: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: 12 },
  tarjeta: { border: `1px solid ${REJILLA}`, borderRadius: 10, padding: "10px 14px", background: "#FFFFFF" },
  tablero: { border: `1px solid ${REJILLA}`, borderRadius: 10, padding: "10px 12px", background: "#FFFFFF", minWidth: 0 },
  vacio: { color: TEXTO_3, fontSize: 13, padding: "8px 2px" },
};
