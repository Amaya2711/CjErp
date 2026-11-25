import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import DataGridPro from "../../../../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../../../../components/datagrid/types";
import { FiltroOperativoLookup } from "../../../../../components/lookups/FiltroOperativoLookup";
import { listarSolicitudesPorAprobar } from "../../../../../api/logisticaEquiposService";
import type { FiltroOperativoValue } from "../../../../../models/filtroOperativo";
import type { SolicitudPorAprobar } from "../../../../../models/logisticaEquipos";
import { getHttpErrorMessage } from "../../../../../utils/httpError";
import { ingresoStyles as styles } from "../ingreso/ingresoComun";

// Una sola tonalidad (azul) para magnitud; la antigüedad usa la rampa ordinal del mismo tono (claro → oscuro = más antiguo).
export const AZUL = "#2a78d6";
export const RAMPA_ANTIGUEDAD = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab"];
export const RANGOS = ["0-3 días", "4-7 días", "8-15 días", "Más de 15 días"];
export const TEXTO = "#0F172A";
export const TEXTO_2 = "#475569";
export const TEXTO_3 = "#64748B";
export const REJILLA = "#E2E8F0";
const TOP = 8;

export const TOOLTIP_ESTILO: CSSProperties = { borderRadius: 8, border: `1px solid ${REJILLA}`, fontSize: 12, padding: "6px 10px" };
export const numero = (valor: number) => valor.toLocaleString("es-PE");

/** Días desde la fecha de creación (yyyy-MM-dd) hasta hoy, sin pasar por UTC. */
export function diasDesde(fecha?: string | null) {
  const texto = String(fecha ?? "").slice(0, 10);
  const [a, m, d] = texto.split("-").map(Number);
  if (!a || !m || !d) return 0;
  const hoy = new Date();
  const base = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.max(0, Math.round((base - Date.UTC(a, m - 1, d)) / 86400000));
}

export const rangoDe = (dias: number) => (dias <= 3 ? 0 : dias <= 7 ? 1 : dias <= 15 ? 2 : 3);

/** Cuenta solicitudes por una clave y devuelve las `TOP` mayores. */
function topPor(filas: SolicitudPorAprobar[], clave: (f: SolicitudPorAprobar) => string | null | undefined) {
  const mapa = new Map<string, number>();
  for (const f of filas) {
    const nombre = (clave(f) ?? "").trim() || "Sin dato";
    mapa.set(nombre, (mapa.get(nombre) ?? 0) + 1);
  }
  return [...mapa.entries()]
    .map(([nombre, solicitudes]) => ({ nombre, solicitudes }))
    .sort((x, y) => y.solicitudes - x.solicitudes)
    .slice(0, TOP);
}

type FilaAntigua = { nroSolicitud: string; dias: number; lineas: number; unidades: number; solicitante: string; proyecto: string; site: string };

/**
 * Dashboard de x Aprobar: resumen ejecutivo de las solicitudes pendientes de aprobación (estado 9).
 * Se calcula en pantalla con las mismas solicitudes de la pestaña x Aprobar (sp_Logistica_Solicitud_PorAprobar).
 * El Nro. de solicitud abre su detalle en x Aprobar.
 */
export default function DashboardAprobarTab({ onAbrirSolicitud }: { onAbrirSolicitud?: (nroSolicitud: string) => void }) {
  const [usaRelacion, setUsaRelacion] = useState(false);
  const [relacion, setRelacion] = useState<FiltroOperativoValue>({});
  const [filas, setFilas] = useState<SolicitudPorAprobar[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [actualizado, setActualizado] = useState("");

  const consultar = useCallback(async (relacionActiva: boolean, valor: FiltroOperativoValue) => {
    const f = relacionActiva ? valor.filtro : undefined;
    if (relacionActiva && !f) {
      setError("Seleccione la relación cliente-proyecto-site.");
      return;
    }
    setCargando(true);
    setError("");
    try {
      setFilas(await listarSolicitudesPorAprobar({ idCliente: f?.idCliente, idProyecto: f?.idProyecto, idSite: f?.idSite, correSite: f?.correlativo }));
      setActualizado(new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }));
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo cargar el dashboard."));
    } finally {
      setCargando(false);
    }
  }, []);

  // Al abrir la pestaña se muestra el panorama general (sin filtros).
  useEffect(() => {
    void consultar(false, {});
  }, [consultar]);

  // Al elegir (o quitar) la relación cliente-proyecto-site, o al activar/desactivar el filtro, se actualiza de inmediato.
  const claveFiltro = `${usaRelacion}|${usaRelacion ? relacion.filtro?.filtroKey ?? "" : ""}`;
  const ultimaClave = useRef("false|");
  useEffect(() => {
    if (claveFiltro === ultimaClave.current) return;
    ultimaClave.current = claveFiltro;
    if (usaRelacion && !relacion.filtro) return;
    void consultar(usaRelacion, relacion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveFiltro]);

  const resumen = useMemo(() => {
    const lista = filas ?? [];
    const dias = lista.map((f) => diasDesde(f.fechaCreacion));
    return {
      solicitudes: lista.length,
      lineas: lista.reduce((s, f) => s + (f.lineas ?? 0), 0),
      unidades: lista.reduce((s, f) => s + (f.cantidad ?? 0), 0),
      maxDias: dias.length ? Math.max(...dias) : 0,
      promDias: dias.length ? dias.reduce((s, d) => s + d, 0) / dias.length : 0,
      solicitantes: new Set(lista.map((f) => f.solicitante ?? "")).size,
    };
  }, [filas]);

  const antiguedad = useMemo(() => {
    const cuenta = [0, 0, 0, 0];
    for (const f of filas ?? []) cuenta[rangoDe(diasDesde(f.fechaCreacion))] += 1;
    return RANGOS.map((rango, i) => ({ rango, solicitudes: cuenta[i] }));
  }, [filas]);

  const porSolicitante = useMemo(() => topPor(filas ?? [], (f) => f.solicitante), [filas]);
  const porProyecto = useMemo(() => topPor(filas ?? [], (f) => f.nombreProyecto), [filas]);

  const antiguas = useMemo<FilaAntigua[]>(
    () =>
      (filas ?? [])
        .map((f) => ({
          nroSolicitud: f.nroSolicitud,
          dias: diasDesde(f.fechaCreacion),
          lineas: f.lineas ?? 0,
          unidades: f.cantidad ?? 0,
          solicitante: f.solicitante ?? "",
          proyecto: f.nombreProyecto ?? "",
          site: f.idSite ?? "",
        }))
        .sort((a, b) => b.dias - a.dias)
        .slice(0, 10),
    [filas],
  );

  const columnasAntiguas = useMemo<GridColumn<FilaAntigua>[]>(
    () => [
      {
        dataField: "nroSolicitud",
        caption: "Nro. solicitud",
        width: 110,
        // Clic: abre x Aprobar con el detalle de esta solicitud.
        cellRender: (valor) =>
          onAbrirSolicitud ? (
            <button
              type="button"
              title="Ver el detalle en x Aprobar"
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
      { dataField: "unidades", caption: "Unidades", dataType: "number", width: 85, alignment: "right" },
      { dataField: "solicitante", caption: "Solicitante", width: 190 },
      { dataField: "proyecto", caption: "Proyecto", width: 170 },
      { dataField: "site", caption: "Site", width: 90 },
    ],
    [onAbrirSolicitud],
  );

  const sinDatos = !cargando && filas !== null && filas.length === 0;

  return (
    <div style={estilo.root}>
      <div style={styles.panel}>
        <label style={styles.check}>
          <input type="checkbox" checked={usaRelacion} onChange={(e) => setUsaRelacion(e.target.checked)} />
          Cliente-proyecto-site
        </label>
        <style>{".dash-aprobar-on input::placeholder, .dash-aprobar-on input { color: #1E293B; opacity: 1; } .dash-aprobar-on label { color: #1E293B; }"}</style>
        <div
          className={usaRelacion ? "dash-aprobar-on" : undefined}
          style={{ flex: 1, minWidth: 320, opacity: usaRelacion ? 1 : 0.5, pointerEvents: usaRelacion ? "auto" : "none" }}
        >
          <FiltroOperativoLookup value={relacion} onChange={setRelacion} showTrabajo={false} showOt={false} showTarea={false} />
        </div>
        <button type="button" onClick={() => void consultar(usaRelacion, relacion)} disabled={cargando} style={styles.secondary}>
          {cargando ? "Actualizando…" : "Actualizar"}
        </button>
        {actualizado ? <span style={styles.resumen}>Datos de las {actualizado}</span> : null}
      </div>

      {error ? <div role="alert" style={styles.error}>{error}</div> : null}
      {sinDatos ? <div style={estilo.vacio}>No hay solicitudes pendientes de aprobación para los filtros elegidos.</div> : null}

      {filas && filas.length > 0 ? (
        <>
          <div style={estilo.gridTarjetas}>
            <Tarjeta etiqueta="Por aprobar" valor={numero(resumen.solicitudes)} detalle={`${numero(resumen.solicitantes)} solicitante(s)`} />
            <Tarjeta etiqueta="Líneas" valor={numero(resumen.lineas)} detalle={`${(resumen.lineas / resumen.solicitudes).toFixed(1)} por solicitud`} />
            <Tarjeta etiqueta="Unidades" valor={numero(resumen.unidades)} detalle="Cantidad total a despachar" />
            <Tarjeta etiqueta="Antigüedad máx." valor={`${numero(resumen.maxDias)} días`} detalle={`Promedio ${resumen.promDias.toFixed(1)} días`} />
          </div>

          <div style={estilo.gridGraficos}>
            <Tablero titulo="Por antigüedad" subtitulo="Solicitudes por aprobar, días desde la creación" descripcion={antiguedad.map((a) => `${a.rango}: ${a.solicitudes}`).join("; ")}>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={antiguedad} margin={{ top: 18, right: 8, bottom: 4, left: 8 }}>
                  <XAxis dataKey="rango" tickLine={false} axisLine={{ stroke: REJILLA }} tick={{ fontSize: 11, fill: TEXTO_2 }} interval={0} />
                  <YAxis hide />
                  <Tooltip cursor={{ fill: "rgba(42,120,214,0.08)" }} contentStyle={TOOLTIP_ESTILO} />
                  <Bar dataKey="solicitudes" name="Solicitudes" barSize={24} radius={[4, 4, 0, 0]}>
                    {antiguedad.map((a, i) => (
                      <Cell key={a.rango} fill={RAMPA_ANTIGUEDAD[i]} />
                    ))}
                    <LabelList dataKey="solicitudes" position="top" fill={TEXTO_2} fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Tablero>

            <Tablero titulo="Por solicitante" subtitulo={`Solicitudes por aprobar (los ${TOP} mayores)`} descripcion={porSolicitante.map((a) => `${a.nombre}: ${a.solicitudes}`).join("; ")}>
              <BarrasHorizontales datos={porSolicitante} />
            </Tablero>

            <Tablero titulo="Por proyecto" subtitulo={`Solicitudes por aprobar (los ${TOP} mayores)`} descripcion={porProyecto.map((a) => `${a.nombre}: ${a.solicitudes}`).join("; ")}>
              <BarrasHorizontales datos={porProyecto} />
            </Tablero>
          </div>

          <Tablero titulo="Solicitudes por aprobar más antiguas" subtitulo="De mayor a menor antigüedad (las 10 primeras). Clic en el Nro. de solicitud para ver su detalle.">
            <DataGridPro<FilaAntigua>
              dataSource={antiguas}
              columns={columnasAntiguas}
              keyExpr="nroSolicitud"
              height={300}
              noDataText="No hay solicitudes por aprobar."
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
        </>
      ) : cargando ? (
        <div style={estilo.vacio}>Cargando dashboard…</div>
      ) : null}
    </div>
  );
}

export function BarrasHorizontales({ datos, serie = "Solicitudes" }: { datos: { nombre: string; solicitudes: number }[]; serie?: string }) {
  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="nombre" width={130} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: TEXTO_2 }} tickFormatter={(v: string) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)} />
        <Tooltip cursor={{ fill: "rgba(42,120,214,0.08)" }} contentStyle={TOOLTIP_ESTILO} />
        <Bar dataKey="solicitudes" name={serie} fill={AZUL} barSize={16} radius={[0, 4, 4, 0]}>
          <LabelList dataKey="solicitudes" position="right" fill={TEXTO_2} fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Tarjeta({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle: string }) {
  return (
    <div style={estilo.tarjeta}>
      <div style={{ fontSize: 12, color: TEXTO_3, fontWeight: 600 }}>{etiqueta}</div>
      <div style={{ fontSize: 30, lineHeight: 1.15, fontWeight: 800, color: TEXTO, marginTop: 2 }}>{valor}</div>
      <div style={{ fontSize: 12, color: TEXTO_2, marginTop: 2 }}>{detalle}</div>
    </div>
  );
}

export function Tablero({ titulo, subtitulo, descripcion, children }: { titulo: string; subtitulo: string; descripcion?: string; children: ReactNode }) {
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

export const estilo: Record<string, CSSProperties> = {
  root: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, gap: 12, overflowY: "auto", paddingBottom: 8 },
  gridTarjetas: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 },
  gridGraficos: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 },
  gridTablas: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: 12 },
  tarjeta: { border: `1px solid ${REJILLA}`, borderRadius: 10, padding: "10px 14px", background: "#FFFFFF" },
  tablero: { border: `1px solid ${REJILLA}`, borderRadius: 10, padding: "10px 12px", background: "#FFFFFF", minWidth: 0 },
  vacio: { color: TEXTO_3, fontSize: 13, padding: "8px 2px" },
};
