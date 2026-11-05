import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MotivoRechazoDialog from "./MotivoRechazoDialog";
import DataGridPro from "../../../../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../../../../components/datagrid/types";
import { FiltroOperativoLookup } from "../../../../../components/lookups/FiltroOperativoLookup";
import { listarDetalleSolicitud, listarHistorialSolicitudes, rechazarSolicitudesEquipos } from "../../../../../api/logisticaEquiposService";
import type { FiltroOperativoValue } from "../../../../../models/filtroOperativo";
import type { SolicitudDetalle, SolicitudHistorial } from "../../../../../models/logisticaEquipos";
import { getHttpErrorMessage } from "../../../../../utils/httpError";
import { ingresoStyles as styles } from "../ingreso/ingresoComun";

/** Estados que se pueden rechazar: 9 (x aprobar) y 3 (sin aprobación). El servidor lo vuelve a validar. */
const ESTADOS_RECHAZABLES = [9, 3];
/** Estado de una solicitud rechazada: su checkbox queda deshabilitado. */
const ESTADO_RECHAZADA = 6;
/** Fondo rojo suave para las filas rechazadas. */
const FONDO_RECHAZADA = { background: "#FEE2E2" };

const estiloPopup: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3100 },
  // resize: both permite arrastrar la esquina inferior derecha para ampliar o reducir el popup.
  card: { width: 1100, height: 560, minWidth: 600, minHeight: 320, maxWidth: "calc(100vw - 24px)", maxHeight: "calc(100vh - 24px)", boxSizing: "border-box", display: "flex", flexDirection: "column", overflow: "auto", resize: "both", background: "#FFFFFF", borderRadius: 16, padding: 20, boxShadow: "0 12px 28px rgba(0,0,0,0.16)" },
  cardAmpliada: { width: "calc(100vw - 24px)", height: "calc(100vh - 24px)", resize: "none" },
};

const fechaCorta = (valor: unknown) => String(valor ?? "").slice(0, 10);

/** Fecha de hoy menos `dias` días en formato yyyy-MM-dd (hora local). */
const fechaIso = (dias = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Estados de la solicitud conocidos (PV: el nombre que se muestra en la grilla sale de Constante ESTADO_LOG). */
const ESTADOS: { id: number; nombre: string }[] = [
  { id: 9, nombre: "9 · x Aprobar" },
  { id: 3, nombre: "3 · Sin aprobación" },
  { id: 4, nombre: "4 · Aprobada" },
  { id: 6, nombre: "6 · Observada" },
];

const COLUMNAS: GridColumn<SolicitudHistorial>[] = [
  { dataField: "nroSolicitud", caption: "Nro. solicitud", width: 110 },
  { dataField: "fechaCreacion", caption: "Fecha", width: 100, calculateCellValue: (r) => fechaCorta(r.fechaCreacion) },
  { dataField: "idEstado", caption: "Cód. estado", dataType: "number", width: 90 },
  { dataField: "nomEstado", caption: "Estado", width: 130 },
  { dataField: "lineas", caption: "Líneas", dataType: "number", width: 70 },
  { dataField: "cantidad", caption: "Unidades", dataType: "number", width: 90 },
  { dataField: "nombreCliente", caption: "Cliente", width: 160 },
  { dataField: "nombreProyecto", caption: "Proyecto", width: 180 },
  { dataField: "idSite", caption: "Site", width: 90 },
  { dataField: "nombreSite", caption: "Desc. site", width: 200 },
  { dataField: "tipoTrabajo", caption: "Trabajo", width: 140 },
  { dataField: "solicitante", caption: "Solicitante", width: 180 },
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

/** Pestaña "Historial": todas las solicitudes registradas (cualquier estado), con filtros. Solo consulta. */
export default function HistorialTab() {
  const [fechaIni, setFechaIni] = useState(() => fechaIso(30));
  const [fechaFin, setFechaFin] = useState(() => fechaIso());
  const [nro, setNro] = useState("");
  const [idEstado, setIdEstado] = useState("");
  const [solicitante, setSolicitante] = useState("");
  const [usaRelacion, setUsaRelacion] = useState(false);
  const [relacion, setRelacion] = useState<FiltroOperativoValue>({});
  const [filas, setFilas] = useState<SolicitudHistorial[]>([]);
  const [detalle, setDetalle] = useState<SolicitudDetalle[]>([]);
  const [nroDetalle, setNroDetalle] = useState("");
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [ampliado, setAmpliado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [consultado, setConsultado] = useState(false);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [confirmarRechazo, setConfirmarRechazo] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [posicionRechazo, setPosicionRechazo] = useState<SolicitudDetalle | null>(null);
  // Evita mostrar el detalle de una solicitud anterior si se hace doble clic en otra antes de que responda.
  const ultimoDetalle = useRef("");

  const buscar = useCallback(async () => {
    const f = usaRelacion ? relacion.filtro : undefined;
    if (usaRelacion && !f) return setError("Seleccione la relación cliente-proyecto-site.");
    const numero = nro.trim();
    if (!numero && fechaIni && fechaFin && fechaIni > fechaFin) return setError("La fecha inicial no puede ser mayor que la final.");
    setError("");
    setCargando(true);
    setSeleccion([]);
    setDetalle([]);
    setNroDetalle("");
    try {
      const datos = await listarHistorialSolicitudes({
        // Con número de solicitud se ignoran las fechas: se busca esa solicitud en todo el historial.
        fechaIni: numero ? undefined : fechaIni || undefined,
        fechaFin: numero ? undefined : fechaFin || undefined,
        nroSolicitud: numero || undefined,
        idEstado: idEstado ? Number(idEstado) : undefined,
        idCliente: f?.idCliente,
        idProyecto: f?.idProyecto,
        idSite: f?.idSite,
        correSite: f?.correlativo,
        solicitante: solicitante.trim() || undefined,
      });
      setFilas(datos);
      setConsultado(true);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo consultar el historial."));
    } finally {
      setCargando(false);
    }
  }, [usaRelacion, relacion, nro, fechaIni, fechaFin, idEstado, solicitante]);

  // Al abrir la pestaña se muestran los últimos 30 días.
  useEffect(() => {
    let cancelado = false;
    listarHistorialSolicitudes({ fechaIni: fechaIso(30), fechaFin: fechaIso() })
      .then((datos) => {
        if (cancelado) return;
        setFilas(datos);
        setConsultado(true);
      })
      .catch((err) => {
        if (!cancelado) setError(getHttpErrorMessage(err, "No se pudo consultar el historial."));
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const cerrarDetalle = () => {
    ultimoDetalle.current = "";
    setNroDetalle("");
    setDetalle([]);
    setAmpliado(false);
  };

  const verDetalle = async (fila: SolicitudHistorial) => {
    ultimoDetalle.current = fila.nroSolicitud;
    setNroDetalle(fila.nroSolicitud);
    setCargandoDetalle(true);
    try {
      const datos = await listarDetalleSolicitud(fila.nroSolicitud);
      if (ultimoDetalle.current === fila.nroSolicitud) setDetalle(datos);
    } catch (err) {
      if (ultimoDetalle.current === fila.nroSolicitud) {
        cerrarDetalle();
        setError(getHttpErrorMessage(err, "No se pudo consultar el detalle."));
      }
    } finally {
      if (ultimoDetalle.current === fila.nroSolicitud || ultimoDetalle.current === "") setCargandoDetalle(false);
    }
  };

  const pedirRechazo = () => {
    setError("");
    setMensaje("");
    if (seleccion.length === 0) return setError("No existen solicitudes seleccionadas.");
    const yaRechazadas = filas.filter((f) => seleccion.includes(f.nroSolicitud) && f.idEstado === 6);
    if (yaRechazadas.length > 0)
      return setError(`No se puede rechazar una solicitud que ya está rechazada: ${yaRechazadas.map((f) => f.nroSolicitud).join(", ")}.`);
    const noRechazables = filas.filter((f) => seleccion.includes(f.nroSolicitud) && !ESTADOS_RECHAZABLES.includes(f.idEstado));
    if (noRechazables.length > 0)
      return setError(`Solo se pueden rechazar solicitudes x aprobar (9) o sin aprobación (3). No aplica a: ${noRechazables.map((f) => f.nroSolicitud).join(", ")}.`);
    setConfirmarRechazo(true);
  };

  const rechazar = async (motivo: string) => {
    setProcesando(true);
    try {
      const resultado = await rechazarSolicitudesEquipos({ solicitudes: seleccion, observacion: motivo });
      setConfirmarRechazo(false);
      await buscar();
      setMensaje(`Rechazadas: ${resultado.procesadas} solicitud(es). El stock volvió a Disponible.`);
    } catch (err) {
      setConfirmarRechazo(false);
      setPosicionRechazo(null);
      setError(getHttpErrorMessage(err, "No se pudo rechazar."));
    } finally {
      setProcesando(false);
    }
  };

  const estadoSolicitudDetalle = filas.find((f) => f.nroSolicitud === nroDetalle)?.idEstado;

  const pedirRechazoPosicion = useCallback((fila: SolicitudDetalle) => {
    setError("");
    setMensaje("");
    if (fila.idEstado === 6 || estadoSolicitudDetalle === 6)
      return setError(`No se puede rechazar la posición ${fila.posicion}: ya está rechazada.`);
    setPosicionRechazo(fila);
  }, [estadoSolicitudDetalle]);

  /** Rechaza solo la posición elegida: la línea pasa a 6 y su stock vuelve a Disponible. */
  const rechazarPosicion = async (motivo: string) => {
    const fila = posicionRechazo;
    if (!fila || !nroDetalle) return;
    const nroActual = nroDetalle;
    setProcesando(true);
    try {
      await rechazarSolicitudesEquipos({ solicitudes: [nroActual], posicion: String(fila.posicion ?? ""), observacion: motivo });
      setPosicionRechazo(null);
      await buscar();
      const cabecera = filas.find((f) => f.nroSolicitud === nroActual);
      await verDetalle(cabecera ?? ({ nroSolicitud: nroActual } as SolicitudHistorial));
      setMensaje(`Posición ${fila.posicion} de la solicitud ${nroActual} rechazada. Su stock volvió a Disponible.`);
    } catch (err) {
      setConfirmarRechazo(false);
      setPosicionRechazo(null);
      setError(getHttpErrorMessage(err, "No se pudo rechazar la posición."));
    } finally {
      setProcesando(false);
    }
  };

  const columnasDetalle = useMemo<GridColumn<SolicitudDetalle>[]>(() => [
    ...COLUMNAS_DETALLE,
    {
      dataField: "accion",
      caption: "Acción",
      width: 100,
      allowSorting: false,
      cellRender: (_valor, fila) =>
        ESTADOS_RECHAZABLES.includes(fila.idEstado) || fila.idEstado === 6 ? (
          <button
            type="button"
            style={{ ...styles.secondary, padding: "1px 8px" }}
            disabled={procesando}
            title="Rechaza solo esta posición y devuelve su stock a Disponible."
            onClick={(e) => {
              e.stopPropagation();
              pedirRechazoPosicion(fila);
            }}
          >
            Rechazar
          </button>
        ) : null,
    },
  ], [procesando, pedirRechazoPosicion]);

  const limpiar = () => {
    setFechaIni(fechaIso(30));
    setFechaFin(fechaIso());
    setNro("");
    setIdEstado("");
    setSolicitante("");
    setUsaRelacion(false);
    setRelacion({});
  };

  const alEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") void buscar();
  };
  const totalUnidades = filas.reduce((suma, f) => suma + Number(f.cantidad ?? 0), 0);

  return (
    <div style={styles.root}>
      <div style={styles.panel}>
        <label style={styles.check}>
          Desde
          <input type="date" value={fechaIni} onChange={(e) => setFechaIni(e.target.value)} disabled={nro.trim() !== ""} style={styles.input} />
        </label>
        <label style={styles.check}>
          Hasta
          <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} disabled={nro.trim() !== ""} style={styles.input} />
        </label>
        <input
          value={nro}
          onChange={(e) => setNro(e.target.value)}
          onKeyDown={alEnter}
          placeholder="Nro. de solicitud"
          title="Con número de solicitud se ignoran las fechas."
          style={{ ...styles.input, width: 150 }}
        />
        <select value={idEstado} onChange={(e) => setIdEstado(e.target.value)} style={styles.input} aria-label="Estado">
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e.id} value={e.id}>{e.nombre}</option>
          ))}
        </select>
        <input value={solicitante} onChange={(e) => setSolicitante(e.target.value)} onKeyDown={alEnter} placeholder="Solicitante (nombre)" style={{ ...styles.input, width: 200 }} />
      </div>
      <div style={styles.panel}>
        <label style={styles.check}>
          <input type="checkbox" checked={usaRelacion} onChange={(e) => setUsaRelacion(e.target.checked)} />
          Filtrar por cliente-proyecto-site
        </label>
        <div style={{ flex: 1, minWidth: 320, opacity: usaRelacion ? 1 : 0.5, pointerEvents: usaRelacion ? "auto" : "none" }}>
          <FiltroOperativoLookup value={relacion} onChange={setRelacion} showTrabajo={false} showOt={false} showTarea={false} />
        </div>
        <button type="button" onClick={() => void buscar()} disabled={cargando} style={styles.primary}>
          {cargando ? "Buscando…" : "Buscar"}
        </button>
        <button type="button" onClick={limpiar} disabled={cargando} style={styles.secondary}>Limpiar</button>
        <button type="button" onClick={pedirRechazo} disabled={procesando || cargando} style={styles.secondary} title="Rechaza las solicitudes marcadas (x aprobar o sin aprobación) y devuelve el stock a Disponible.">
          {procesando ? "Rechazando…" : "Rechazar"}
        </button>
        <span style={styles.resumen}>
          {consultado ? `Solicitudes: ${filas.length}. Unidades: ${totalUnidades}. ` : ""}Marcadas: {seleccion.length}. Doble clic en una solicitud para ver su detalle.
        </span>
      </div>

      {error ? <div role="alert" style={styles.error}>{error}</div> : null}
      {mensaje ? <div role="status" style={styles.ok}>{mensaje}</div> : null}

      <div style={styles.gridHost}>
        <DataGridPro<SolicitudHistorial>
          dataSource={filas}
          columns={COLUMNAS}
          keyExpr="nroSolicitud"
          height="fill"
          loading={cargando}
          noDataText="No hay solicitudes con esos filtros."
          stateStoringKey="logistica-solicitud-historial"
          selection="multiple"
          selectedKeys={seleccion}
          selectionDisabled={procesando}
          isRowSelectable={(fila) => fila.idEstado !== ESTADO_RECHAZADA}
          rowStyle={(fila) => (fila.idEstado === ESTADO_RECHAZADA ? FONDO_RECHAZADA : undefined)}
          onSelectionChanged={setSeleccion}
          onRowDoubleClick={(fila) => void verDetalle(fila)}
          showSearchPanel={false}
          allowExport
          exportFileName="historial_solicitudes"
          rowAlternation={false}
          rowPadding="3px 8px"
          paging={{ pageSize: 100, pageSizes: [50, 100, 250] }}
        />
      </div>

      {nroDetalle ? (
        <div style={estiloPopup.overlay} role="dialog" aria-modal="true" aria-label={`Detalle de la solicitud ${nroDetalle}`} onClick={cerrarDetalle}>
          <div style={{ ...estiloPopup.card, ...(ampliado ? estiloPopup.cardAmpliada : null) }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: "#17143A" }}>Detalle de la solicitud {nroDetalle}</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" style={styles.secondary} onClick={() => setAmpliado((v) => !v)} title="También puede arrastrar la esquina inferior derecha para cambiar el tamaño.">
                  {ampliado ? "Restaurar" : "Ampliar"}
                </button>
                <button type="button" style={styles.secondary} onClick={cerrarDetalle}>Cerrar</button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <DataGridPro<SolicitudDetalle>
                dataSource={detalle}
                columns={columnasDetalle}
                rowStyle={(fila) => (fila.idEstado === ESTADO_RECHAZADA ? FONDO_RECHAZADA : undefined)}
                keyExpr={claveDetalle}
                height="fill"
                loading={cargandoDetalle}
                noDataText="La solicitud no tiene detalle."
                showSearchPanel={false}
                rowAlternation={false}
                rowPadding="3px 8px"
                paging={false}
              />
            </div>
          </div>
        </div>
      ) : null}

      <MotivoRechazoDialog
        open={posicionRechazo !== null}
        procesando={procesando}
        descripcion={`Posición ${posicionRechazo?.posicion ?? ""} (${posicionRechazo?.nombreMaterial ?? posicionRechazo?.codPap ?? ""}, cant. ${posicionRechazo?.cantSap ?? ""}) de la solicitud ${nroDetalle}. Su stock volverá a Disponible.`}
        onConfirm={(motivo) => void rechazarPosicion(motivo)}
        onCancel={() => setPosicionRechazo(null)}
      />

      <MotivoRechazoDialog
        open={confirmarRechazo}
        procesando={procesando}
        descripcion={`Se rechazarán ${seleccion.length} solicitud(es) seleccionada(s). El stock volverá a Disponible.`}
        onConfirm={(motivo) => void rechazar(motivo)}
        onCancel={() => setConfirmarRechazo(false)}
      />
    </div>
  );
}
