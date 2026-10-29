import { useCallback, useEffect, useState } from "react";
import ConfirmDialog from "../../../../../components/base/ConfirmDialog";
import DataGridPro from "../../../../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../../../../components/datagrid/types";
import { FiltroOperativoLookup } from "../../../../../components/lookups/FiltroOperativoLookup";
import {
  aprobarSolicitudesEquipos,
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

/** Pestaña "x Aprobar": solicitudes pendientes (estado 9); aprobar u observar en lote. */
export default function PorAprobarTab() {
  const [validadores, setValidadores] = useState<SolicitudCatalogo[]>([]);
  const [usaRelacion, setUsaRelacion] = useState(false);
  const [relacion, setRelacion] = useState<FiltroOperativoValue>({});
  const [filas, setFilas] = useState<SolicitudPorAprobar[]>([]);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [detalle, setDetalle] = useState<SolicitudDetalle[]>([]);
  const [nroDetalle, setNroDetalle] = useState("");
  const [idValidador, setIdValidador] = useState<number | null>(null);
  const [observacion, setObservacion] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [accion, setAccion] = useState<"APROBAR" | "OBSERVAR" | null>(null);

  const buscar = useCallback(async () => {
    const f = usaRelacion ? relacion.filtro : undefined;
    if (usaRelacion && !f) {
      setError("Seleccione la relación cliente-proyecto-site.");
      return;
    }
    setCargando(true);
    setError("");
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
  }, []);

  const verDetalle = async (fila: SolicitudPorAprobar) => {
    setNroDetalle(fila.nroSolicitud);
    try {
      setDetalle(await listarDetalleSolicitud(fila.nroSolicitud));
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo consultar el detalle."));
    }
  };

  const pedirConfirmacion = (tipo: "APROBAR" | "OBSERVAR") => {
    setError("");
    setMensaje("");
    if (seleccion.length === 0) return setError("No existen solicitudes seleccionadas.");
    if (tipo === "APROBAR" && !idValidador) return setError("Debe seleccionar el validador.");
    if (tipo === "OBSERVAR" && !observacion.trim()) return setError("Debe ingresar la observación.");
    setAccion(tipo);
  };

  const ejecutar = async () => {
    const tipo = accion;
    setAccion(null);
    if (!tipo) return;
    setGuardando(true);
    try {
      const resultado = await aprobarSolicitudesEquipos({
        solicitudes: seleccion,
        accion: tipo,
        idValidador,
        observacion: observacion.trim() || undefined,
      });
      const correo =
        tipo === "APROBAR"
          ? resultado.correoMensaje
            ? ` Correos enviados: ${resultado.correosEnviados}. ${resultado.correoMensaje}`
            : ` Correos enviados: ${resultado.correosEnviados}.`
          : "";
      setMensaje(`${tipo === "APROBAR" ? "Aprobadas" : "Observadas"}: ${resultado.procesadas} solicitud(es).${correo}`);
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
      <div style={styles.panel}>
        <label style={styles.check}>
          <input type="checkbox" checked={usaRelacion} onChange={(e) => setUsaRelacion(e.target.checked)} />
          Filtrar por cliente-proyecto-site
        </label>
        <div style={{ flex: 1, minWidth: 320, opacity: usaRelacion ? 1 : 0.5, pointerEvents: usaRelacion ? "auto" : "none" }}>
          <FiltroOperativoLookup value={relacion} onChange={setRelacion} showTrabajo={false} showOt={false} showTarea={false} />
        </div>
        <button type="button" onClick={() => void buscar()} disabled={cargando} style={styles.secondary}>
          {cargando ? "Buscando…" : "Buscar"}
        </button>
      </div>

      <div style={styles.toolbar}>
        <select value={idValidador ?? ""} onChange={(e) => setIdValidador(e.target.value ? Number(e.target.value) : null)} style={styles.input}>
          <option value="">Validador…</option>
          {validadores.map((v) => (
            <option key={v.id} value={v.id}>{v.nombre}</option>
          ))}
        </select>
        <input value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="Observación" style={{ ...styles.input, minWidth: 280, flex: 1 }} />
        <button type="button" onClick={() => pedirConfirmacion("APROBAR")} disabled={guardando || cargando} style={styles.primary}>Aprobar</button>
        <button type="button" onClick={() => pedirConfirmacion("OBSERVAR")} disabled={guardando || cargando} style={styles.secondary}>Observar</button>
        <span style={styles.resumen}>Son: {filas.length}. Marcadas: {seleccion.length}. Doble clic en una solicitud para ver su detalle.</span>
      </div>

      {error ? <div role="alert" style={styles.error}>{error}</div> : null}
      {mensaje ? <div role="status" style={styles.ok}>{mensaje}</div> : null}

      <div style={styles.gridHost}>
        <DataGridPro<SolicitudPorAprobar>
          dataSource={filas}
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
          allowExport
          exportFileName="solicitudes_por_aprobar"
          rowAlternation={false}
          rowPadding="3px 8px"
          paging={{ pageSize: 100, pageSizes: [50, 100, 250] }}
        />
      </div>

      <strong style={{ fontSize: 13 }}>{nroDetalle ? `Detalle de la solicitud ${nroDetalle}` : "Detalle"}</strong>
      <div style={{ height: 220, display: "flex", flexDirection: "column" }}>
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

      <ConfirmDialog
        open={accion !== null}
        title="Confirmar"
        message={`¿Desea ${accion === "APROBAR" ? "APROBAR" : "OBSERVAR"} las ${seleccion.length} solicitud(es) seleccionada(s)?`}
        confirmLabel={accion === "APROBAR" ? "Aprobar" : "Observar"}
        onConfirm={() => void ejecutar()}
        onCancel={() => setAccion(null)}
      />
    </div>
  );
}
