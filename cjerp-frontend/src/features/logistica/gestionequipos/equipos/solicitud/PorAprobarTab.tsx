import { useCallback, useEffect, useRef, useState } from "react";
import ConfirmDialog from "../../../../../components/base/ConfirmDialog";
import DataGridPro from "../../../../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../../../../components/datagrid/types";
import { FiltroOperativoLookup } from "../../../../../components/lookups/FiltroOperativoLookup";
import {
  aprobarSolicitudesEquipos,
  rechazarSolicitudesEquipos,
  listarCatalogosSolicitud,
  listarDetalleSolicitud,
  listarSolicitudesPorAprobar,
} from "../../../../../api/logisticaEquiposService";
import type { FiltroOperativoValue } from "../../../../../models/filtroOperativo";
import type { SolicitudCatalogo, SolicitudDetalle, SolicitudPorAprobar } from "../../../../../models/logisticaEquipos";
import { getHttpErrorMessage } from "../../../../../utils/httpError";
import { ingresoStyles as styles } from "../ingreso/ingresoComun";

const fechaCorta = (valor: unknown) => String(valor ?? "").slice(0, 10);

const COLUMNAS: GridColumn<SolicitudPorAprobar>[] = [
  { dataField: "nroSolicitud", caption: "Nro. solicitud", width: 110 },
  { dataField: "fechaCreacion", caption: "Fecha", width: 100, calculateCellValue: (r) => fechaCorta(r.fechaCreacion) },
  { dataField: "lineas", caption: "Líneas", dataType: "number", width: 70 },
  { dataField: "cantidad", caption: "Unidades", dataType: "number", width: 90 },
  { dataField: "nombreCliente", caption: "Cliente", width: 160 },
  { dataField: "nombreProyecto", caption: "Proyecto", width: 180 },
  { dataField: "idSite", caption: "Site", width: 90 },
  { dataField: "nombreSite", caption: "Desc. site", width: 200 },
  { dataField: "tipoTrabajo", caption: "Trabajo", width: 140 },
  { dataField: "solicitante", caption: "Solicitante", width: 180, groupIndex: 0 },
  { dataField: "formaEnvio", caption: "Medio de envío", width: 130 },
  { dataField: "direccion", caption: "Dirección", width: 240 },
  { dataField: "referencia", caption: "Referencia", width: 200 },
  { dataField: "usuario", caption: "Usuario", width: 90 },
];

const COLUMNAS_DETALLE: GridColumn<SolicitudDetalle>[] = [
  { dataField: "posicion", caption: "Pos.", width: 60 },
  { dataField: "codPap", caption: "Código", width: 110 },
  { dataField: "nombreMaterial", caption: "Material", width: 300 },
  { dataField: "unidadMedida", caption: "UM", width: 60 },
  { dataField: "cantSap", caption: "Cantidad", dataType: "number", width: 90 },
  { dataField: "serie", caption: "Serie", width: 140 },
  { dataField: "pedidoSap", caption: "Pedido SAP", width: 120 },
  { dataField: "idSiteOrigen", caption: "Site origen", width: 100 },
  { dataField: "nombreSiteOrigen", caption: "Desc. site origen", width: 200 },
  { dataField: "nomEstado", caption: "Estado", width: 130 },
];

const claveDetalle = (fila: SolicitudDetalle) => `${fila.posicion ?? ""}|${fila.codPap ?? ""}|${fila.serie ?? ""}`;

/** Pestaña "x Aprobar": solicitudes pendientes (estado 9); aprobar u observar en lote. */
export default function PorAprobarTab({ solicitudInicial = "" }: { solicitudInicial?: string }) {
  const [validadores, setValidadores] = useState<SolicitudCatalogo[]>([]);
  const [usaRelacion, setUsaRelacion] = useState(false);
  const [relacion, setRelacion] = useState<FiltroOperativoValue>({});
  const [filas, setFilas] = useState<SolicitudPorAprobar[]>([]);
  // Con una solicitud heredada (clic en el Dashboard) la lista muestra solo esa solicitud hasta pulsar "Ver todas" o Buscar.
  const [soloSolicitud, setSoloSolicitud] = useState(solicitudInicial);
  const filasVisibles = soloSolicitud ? filas.filter((f) => String(f.nroSolicitud) === soloSolicitud) : filas;
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [detalle, setDetalle] = useState<SolicitudDetalle[]>([]);
  const [nroDetalle, setNroDetalle] = useState("");
  const [idValidador, setIdValidador] = useState<number | null>(null);
  const [observacion, setObservacion] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [accion, setAccion] = useState<"APROBAR" | "RECHAZAR" | null>(null);

  const buscar = useCallback(async () => {
    const f = usaRelacion ? relacion.filtro : undefined;
    if (usaRelacion && !f) {
      setError("Seleccione la relación cliente-proyecto-site.");
      return;
    }
    setCargando(true);
    setError("");
    setSoloSolicitud("");
    try {
      setFilas(
        await listarSolicitudesPorAprobar({ idCliente: f?.idCliente, idProyecto: f?.idProyecto, idSite: f?.idSite, correSite: f?.correlativo }),
      );
      setSeleccion([]);
      setDetalle([]);
      setNroDetalle("");
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo consultar."));
    } finally {
      setCargando(false);
    }
  }, [usaRelacion, relacion]);

  // Como en el formulario antiguo, al abrir la pestaña se cargan las solicitudes pendientes.
  useEffect(() => {
    let cancelled = false;
    Promise.all([listarCatalogosSolicitud(), listarSolicitudesPorAprobar({})])
      .then(([cat, data]) => {
        if (cancelled) return;
        setValidadores(cat.filter((c) => c.tipo === "VALIDADOR"));
        setFilas(data);
        // Si se llegó desde el Dashboard con una solicitud, se muestra su detalle.
        if (solicitudInicial) {
          setNroDetalle(solicitudInicial);
          listarDetalleSolicitud(solicitudInicial)
            .then((d) => {
              if (!cancelled) setDetalle(d);
            })
            .catch((err) => {
              if (!cancelled) setError(getHttpErrorMessage(err, "No se pudo consultar el detalle."));
            });
        }
      })
      .catch((err) => {
        if (!cancelled) setError(getHttpErrorMessage(err, "No se pudo consultar."));
      })
      .finally(() => {
        if (!cancelled) setCargando(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al elegir (o quitar) la relación cliente-proyecto-site, o al activar/desactivar el filtro, se filtra de inmediato.
  const claveFiltro = `${usaRelacion}|${usaRelacion ? relacion.filtro?.filtroKey ?? "" : ""}`;
  const ultimaClave = useRef("false|");
  useEffect(() => {
    if (claveFiltro === ultimaClave.current) return;
    ultimaClave.current = claveFiltro;
    if (usaRelacion && !relacion.filtro) return; // filtro activado pero sin relación elegida: espera la selección
    void buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveFiltro]);

  const verDetalle = async (fila: SolicitudPorAprobar) => {
    setNroDetalle(fila.nroSolicitud);
    try {
      setDetalle(await listarDetalleSolicitud(fila.nroSolicitud));
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo consultar el detalle."));
    }
  };

  const pedirConfirmacion = (tipo: "APROBAR" | "RECHAZAR") => {
    setError("");
    setMensaje("");
    if (seleccion.length === 0) return setError("No existen solicitudes seleccionadas.");
    if (tipo === "APROBAR" && !idValidador) return setError("Debe seleccionar el validador.");
    if (tipo === "RECHAZAR" && !observacion.trim()) return setError("Debe ingresar el motivo del rechazo en Observación.");
    setAccion(tipo);
  };

  const ejecutar = async () => {
    const tipo = accion;
    setAccion(null);
    if (!tipo) return;
    if (tipo === "APROBAR" && !idValidador) return setError("Debe seleccionar el validador.");
    setGuardando(true);
    try {
      if (tipo === "RECHAZAR") {
        const rechazo = await rechazarSolicitudesEquipos({ solicitudes: seleccion, observacion: observacion.trim() });
        setMensaje(`Rechazadas: ${rechazo.procesadas} solicitud(es). El stock volvió a Disponible.`);
        setObservacion("");
        await buscar();
        return;
      }
      const resultado = await aprobarSolicitudesEquipos({
        solicitudes: seleccion,
        accion: tipo,
        idValidador,
        observacion: observacion.trim() || undefined,
      });
      const correo = resultado.correoEnProceso
        ? " El correo con el PDF se está enviando en segundo plano."
        : resultado.correoMensaje
        ? ` Correos enviados: ${resultado.correosEnviados}. ${resultado.correoMensaje}`
        : ` Correos enviados: ${resultado.correosEnviados}.`;
      setMensaje(`Aprobadas: ${resultado.procesadas} solicitud(es).${correo}`);
      setObservacion("");
      await buscar();
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo grabar."));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={styles.root}>
      {/* Los dos segmentos van en la misma fila (se parten en dos filas solo si la pantalla es angosta). */}
      <div style={{ display: "flex", gap: 12, alignItems: "stretch", flexWrap: "wrap" }}>
      {/* Segmento 1: qué solicitudes ver (filtro y búsqueda). */}
      <div style={{ ...styles.panel, flex: "1 1 520px" }}>
        <label style={styles.check}>
          <input type="checkbox" checked={usaRelacion} onChange={(e) => setUsaRelacion(e.target.checked)} />
          Filtrar por cliente-proyecto-site
        </label>
        {/* Con el filtro activado, el texto "Seleccione..." se ve con formato de habilitado (no gris de deshabilitado). */}
        <style>{".aprobar-filtro-on input::placeholder, .aprobar-filtro-on input { color: #1E293B; opacity: 1; } .aprobar-filtro-on label { color: #1E293B; }"}</style>
        <div
          className={usaRelacion ? "aprobar-filtro-on" : undefined}
          style={{ flex: 1, minWidth: 320, opacity: usaRelacion ? 1 : 0.5, pointerEvents: usaRelacion ? "auto" : "none" }}
        >
          <FiltroOperativoLookup value={relacion} onChange={setRelacion} showTrabajo={false} showOt={false} showTarea={false} />
        </div>
        <button type="button" onClick={() => void buscar()} disabled={cargando} style={styles.secondary}>
          {cargando ? "Buscando…" : "Buscar"}
        </button>
      </div>

      {/* Segmento 2: decisión sobre las solicitudes marcadas (validador, observación, aprobar / rechazar). */}
      <div style={{ ...styles.panel, flex: "1 1 520px", background: "#EEF6F9", borderColor: "#1F6F8B", borderLeftWidth: 4 }}>
        <select value={idValidador ?? ""} onChange={(e) => setIdValidador(e.target.value ? Number(e.target.value) : null)} style={styles.input}>
          <option value="">Validador…</option>
          {validadores.map((v) => (
            <option key={v.id} value={v.id}>{v.nombre}</option>
          ))}
        </select>
        <input value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="Observación" style={{ ...styles.input, minWidth: 160, flex: 1 }} />
        <button
          type="button"
          onClick={() => pedirConfirmacion("APROBAR")}
          disabled={guardando || cargando || !idValidador}
          title={idValidador ? "Aprobar las solicitudes marcadas" : "Seleccione el validador para poder aprobar"}
          style={{ ...styles.primary, ...(!idValidador ? { opacity: 0.5, cursor: "not-allowed" } : null) }}
        >
          Aprobar
        </button>
        <button type="button" onClick={() => pedirConfirmacion("RECHAZAR")} disabled={guardando || cargando} style={styles.secondary}>Rechazar</button>
      </div>
      </div>

      <div style={styles.toolbar}>
        {soloSolicitud ? (
          <button type="button" onClick={() => setSoloSolicitud("")} style={styles.secondary} title="Quitar el filtro por solicitud">
            Solicitud {soloSolicitud} ✕ Ver todas
          </button>
        ) : null}
        <span style={styles.resumen}>Son: {filasVisibles.length}. Marcadas: {seleccion.length}. Doble clic en una solicitud para ver su detalle.</span>
      </div>

      {error ? <div role="alert" style={styles.error}>{error}</div> : null}
      {mensaje ? <div role="status" style={styles.ok}>{mensaje}</div> : null}

      {/* Cabecera a la izquierda y detalle de la solicitud a la derecha. */}
      <div style={{ flex: 1, minHeight: 320, display: "flex", gap: 12, alignItems: "stretch" }}>
      <div style={{ ...styles.gridHost, flex: "3 1 0", minWidth: 0 }}>
        <DataGridPro<SolicitudPorAprobar>
          dataSource={filasVisibles}
          columns={COLUMNAS}
          keyExpr="nroSolicitud"
          height="fill"
          loading={cargando}
          noDataText="No hay solicitudes pendientes de aprobación."
          stateStoringKey="logistica-solicitud-por-aprobar"
          selection="multiple"
          selectedKeys={seleccion}
          selectionDisabled={guardando}
          onSelectionChanged={setSeleccion}
          onRowDoubleClick={(fila) => void verDetalle(fila)}
          showSearchPanel={false}
          // Normalmente los grupos abren contraídos; con una sola solicitud se abre expandida.
          autoExpandAll={!!soloSolicitud}
          allowExport
          exportFileName="solicitudes_por_aprobar"
          rowAlternation={false}
          rowPadding="3px 8px"
          paging={{ pageSize: 100, pageSizes: [50, 100, 250] }}
        />
      </div>

      <div style={{ flex: "2 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      <strong style={{ fontSize: 13 }}>{nroDetalle ? `Detalle de la solicitud ${nroDetalle}` : "Detalle"}</strong>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <DataGridPro<SolicitudDetalle>
          dataSource={detalle}
          columns={COLUMNAS_DETALLE}
          keyExpr={claveDetalle}
          height="fill"
          noDataText="Haga doble clic en una solicitud para ver su detalle."
          showSearchPanel={false}
          rowAlternation={false}
          rowPadding="3px 8px"
          paging={false}
        />
      </div>
      </div>
      </div>

      <ConfirmDialog
        open={accion !== null}
        title="Confirmar"
        message={`¿Desea ${accion === "APROBAR" ? "APROBAR" : "RECHAZAR"} las ${seleccion.length} solicitud(es) seleccionada(s)?`}
        confirmLabel={accion === "APROBAR" ? "Aprobar" : "Rechazar"}
        onConfirm={() => void ejecutar()}
        onCancel={() => setAccion(null)}
      />
    </div>
  );
}
