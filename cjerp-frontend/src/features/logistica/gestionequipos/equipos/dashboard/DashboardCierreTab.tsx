import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import DataGridPro from "../../../../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../../../../components/datagrid/types";
import { FiltroOperativoLookup } from "../../../../../components/lookups/FiltroOperativoLookup";
import { consultarCampo } from "../../../../../api/logisticaEquiposService";
import type { FiltroOperativoValue } from "../../../../../models/filtroOperativo";
import type { CampoLinea } from "../../../../../models/logisticaEquipos";
import { getHttpErrorMessage } from "../../../../../utils/httpError";
import { ingresoStyles as styles } from "../ingreso/ingresoComun";
import {
  AZUL,
  BarrasHorizontales,
  RAMPA_ANTIGUEDAD,
  RANGOS,
  REJILLA,
  TEXTO_2,
  TOOLTIP_ESTILO,
  Tablero,
  Tarjeta,
  diasDesde,
  estilo,
  numero,
  rangoDe,
} from "./DashboardAprobarTab";

/** Etapas de la página Cierre y los estados (ESTADO_LOG) de cada una. Debe coincidir con las pestañas de cierre.tsx. */
export type EtapaCierre = "cruzar" | "cerrar" | "foliar";
export const ESTADOS_ETAPA: Record<EtapaCierre, string> = { cruzar: "14", cerrar: "21,7,22,23,24,25", foliar: "16" };
const NOMBRE_ETAPA: Record<EtapaCierre, string> = { cruzar: "x Cruzar", cerrar: "x Cerrar", foliar: "x Foliar" };
const ORDEN: EtapaCierre[] = ["cruzar", "cerrar", "foliar"];
const TODOS_LOS_ESTADOS = ORDEN.map((e) => ESTADOS_ETAPA[e]).join(",");

const etapaDe = (idEstado: number): EtapaCierre => (idEstado === 14 ? "cruzar" : idEstado === 16 ? "foliar" : "cerrar");

/** Cuenta líneas por una clave y devuelve las `top` mayores (con el nombre en `nombre` y el conteo en `solicitudes`, que la gráfica rotula con `serie`). */
function topPor(filas: CampoLinea[], clave: (f: CampoLinea) => string | null | undefined, top: number) {
  const mapa = new Map<string, number>();
  for (const f of filas) {
    const nombre = (clave(f) ?? "").trim() || "Sin dato";
    mapa.set(nombre, (mapa.get(nombre) ?? 0) + 1);
  }
  return [...mapa.entries()]
    .map(([nombre, solicitudes]) => ({ nombre, solicitudes }))
    .sort((x, y) => y.solicitudes - x.solicitudes)
    .slice(0, top);
}

type FilaAntigua = { nroSolicitud: string; etapa: EtapaCierre; etapaNombre: string; dias: number; lineas: number; unidades: number; proyecto: string; site: string };

/**
 * Dashboard de Cierre: resumen ejecutivo de las líneas en x Cruzar (14), x Cerrar (21, 7, 22, 23, 24, 25) y x Foliar (16).
 * Se calcula en pantalla con las mismas líneas de las pestañas (sp_Logistica_Campo_Consultar con @Estados).
 * El Nro. de solicitud abre la pestaña de su etapa filtrada por esa solicitud.
 */
export default function DashboardCierreTab({ onAbrirSolicitud }: { onAbrirSolicitud?: (nroSolicitud: string, etapa: EtapaCierre) => void }) {
  const [usaRelacion, setUsaRelacion] = useState(false);
  const [relacion, setRelacion] = useState<FiltroOperativoValue>({});
  const [lineas, setLineas] = useState<CampoLinea[] | null>(null);
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
      setLineas(await consultarCampo({ estados: TODOS_LOS_ESTADOS, idCliente: f?.idCliente, idProyecto: f?.idProyecto, idSite: f?.idSite, correSite: f?.correlativo }));
      setActualizado(new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }));
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo cargar el dashboard."));
    } finally {
      setCargando(false);
    }
  }, []);

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

  const lista = lineas ?? [];

  // Por etapa: líneas, solicitudes, unidades y la antigüedad máxima.
  const porEtapa = useMemo(
    () =>
      ORDEN.map((etapa) => {
        const filas = lista.filter((l) => etapaDe(l.idEstado) === etapa);
        const dias = filas.map((l) => diasDesde(l.fechaCreacion));
        return {
          etapa,
          nombre: NOMBRE_ETAPA[etapa],
          lineas: filas.length,
          solicitudes: new Set(filas.map((l) => l.nroSolicitud)).size,
          unidades: filas.reduce((s, l) => s + (l.cantSap ?? 0), 0),
          maxDias: dias.length ? Math.max(...dias) : 0,
        };
      }),
    [lista],
  );

  const totalSolicitudes = useMemo(() => new Set(lista.map((l) => l.nroSolicitud)).size, [lista]);
  const graficoEtapas = useMemo(() => porEtapa.map((e) => ({ nombre: e.nombre, solicitudes: e.lineas })), [porEtapa]);
  const porEstado = useMemo(() => topPor(lista, (l) => (l.nomEstado ? `${l.idEstado} - ${l.nomEstado}` : String(l.idEstado)), 8), [lista]);
  const porProyecto = useMemo(() => topPor(lista, (l) => l.nombreProyecto, 8), [lista]);

  const antiguedad = useMemo(() => {
    const cuenta = [0, 0, 0, 0];
    for (const l of lista) cuenta[rangoDe(diasDesde(l.fechaCreacion))] += 1;
    return RANGOS.map((rango, i) => ({ rango, lineas: cuenta[i] }));
  }, [lista]);

  // Una fila por solicitud: la etapa más temprana en la que tiene líneas y su antigüedad (la de la solicitud).
  const antiguas = useMemo<FilaAntigua[]>(() => {
    const mapa = new Map<string, FilaAntigua>();
    for (const l of lista) {
      const etapa = etapaDe(l.idEstado);
      const actual = mapa.get(l.nroSolicitud);
      if (!actual) {
        mapa.set(l.nroSolicitud, {
          nroSolicitud: l.nroSolicitud,
          etapa,
          etapaNombre: NOMBRE_ETAPA[etapa],
          dias: diasDesde(l.fechaCreacion),
          lineas: 1,
          unidades: l.cantSap ?? 0,
          proyecto: l.nombreProyecto ?? "",
          site: l.idSite ?? "",
        });
        continue;
      }
      actual.lineas += 1;
      actual.unidades += l.cantSap ?? 0;
      if (ORDEN.indexOf(etapa) < ORDEN.indexOf(actual.etapa)) {
        actual.etapa = etapa;
        actual.etapaNombre = NOMBRE_ETAPA[etapa];
      }
    }
    return [...mapa.values()].sort((a, b) => b.dias - a.dias).slice(0, 10);
  }, [lista]);

  const columnasAntiguas = useMemo<GridColumn<FilaAntigua>[]>(
    () => [
      {
        dataField: "nroSolicitud",
        caption: "Nro. solicitud",
        width: 110,
        // Clic: abre la pestaña de su etapa filtrada por esta solicitud.
        cellRender: (valor, fila) =>
          onAbrirSolicitud ? (
            <button
              type="button"
              title={`Ver en ${fila.etapaNombre}`}
              onClick={() => onAbrirSolicitud(String(valor), fila.etapa)}
              style={{ border: 0, background: "transparent", padding: 0, color: "#1F6F8B", textDecoration: "underline", cursor: "pointer", font: "inherit" }}
            >
              {String(valor)}
            </button>
          ) : (
            String(valor)
          ),
      },
      { dataField: "etapaNombre", caption: "Etapa", width: 90 },
      { dataField: "dias", caption: "Días", dataType: "number", width: 60, alignment: "right", cellStyle: () => ({ fontWeight: 700 }) },
      { dataField: "lineas", caption: "Líneas", dataType: "number", width: 70, alignment: "right" },
      { dataField: "unidades", caption: "Unidades", dataType: "number", width: 85, alignment: "right" },
      { dataField: "proyecto", caption: "Proyecto", width: 170 },
      { dataField: "site", caption: "Site", width: 90 },
    ],
    [onAbrirSolicitud],
  );

  const sinDatos = !cargando && lineas !== null && lineas.length === 0;

  return (
    <div style={estilo.root}>
      <div style={styles.panel}>
        <label style={styles.check}>
          <input type="checkbox" checked={usaRelacion} onChange={(e) => setUsaRelacion(e.target.checked)} />
          Cliente-proyecto-site
        </label>
        <style>{".dash-cierre-on input::placeholder, .dash-cierre-on input { color: #1E293B; opacity: 1; } .dash-cierre-on label { color: #1E293B; }"}</style>
        <div
          className={usaRelacion ? "dash-cierre-on" : undefined}
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
      {sinDatos ? <div style={estilo.vacio}>No hay líneas en x Cruzar, x Cerrar ni x Foliar para los filtros elegidos.</div> : null}

      {lineas && lineas.length > 0 ? (
        <>
          <div style={estilo.gridTarjetas}>
            {porEtapa.map((e) => (
              <Tarjeta
                key={e.etapa}
                etiqueta={e.nombre}
                valor={numero(e.lineas)}
                detalle={`${numero(e.solicitudes)} solicitud(es) · ${numero(e.unidades)} unid. · máx. ${numero(e.maxDias)} días`}
              />
            ))}
            <Tarjeta etiqueta="Total en cierre" valor={numero(lista.length)} detalle={`${numero(totalSolicitudes)} solicitud(es) en líneas`} />
          </div>

          <div style={estilo.gridGraficos}>
            <Tablero titulo="Líneas por etapa" subtitulo="x Cruzar, x Cerrar y x Foliar" descripcion={graficoEtapas.map((e) => `${e.nombre}: ${e.solicitudes}`).join("; ")}>
              <BarrasHorizontales datos={graficoEtapas} serie="Líneas" />
            </Tablero>

            <Tablero titulo="Líneas por estado" subtitulo="Estado actual de cada línea (los 8 mayores)" descripcion={porEstado.map((e) => `${e.nombre}: ${e.solicitudes}`).join("; ")}>
              <BarrasHorizontales datos={porEstado} serie="Líneas" />
            </Tablero>

            <Tablero titulo="Por antigüedad" subtitulo="Líneas en cierre, días desde la creación de la solicitud" descripcion={antiguedad.map((a) => `${a.rango}: ${a.lineas}`).join("; ")}>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={antiguedad} margin={{ top: 18, right: 8, bottom: 4, left: 8 }}>
                  <XAxis dataKey="rango" tickLine={false} axisLine={{ stroke: REJILLA }} tick={{ fontSize: 11, fill: TEXTO_2 }} interval={0} />
                  <YAxis hide />
                  <Tooltip cursor={{ fill: "rgba(42,120,214,0.08)" }} contentStyle={TOOLTIP_ESTILO} />
                  <Bar dataKey="lineas" name="Líneas" barSize={24} radius={[4, 4, 0, 0]} fill={AZUL}>
                    {antiguedad.map((a, i) => (
                      <Cell key={a.rango} fill={RAMPA_ANTIGUEDAD[i]} />
                    ))}
                    <LabelList dataKey="lineas" position="top" fill={TEXTO_2} fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Tablero>
          </div>

          <div style={estilo.gridTablas}>
            <Tablero titulo="Proyectos con más líneas en cierre" subtitulo="Los 8 mayores" descripcion={porProyecto.map((p) => `${p.nombre}: ${p.solicitudes}`).join("; ")}>
              <BarrasHorizontales datos={porProyecto} serie="Líneas" />
            </Tablero>
            <Tablero titulo="Solicitudes más antiguas en cierre" subtitulo="De mayor a menor antigüedad (las 10 primeras). Clic en el Nro. de solicitud para verla en su etapa.">
              <DataGridPro<FilaAntigua>
                dataSource={antiguas}
                columns={columnasAntiguas}
                keyExpr="nroSolicitud"
                height={300}
                noDataText="No hay solicitudes en cierre."
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
