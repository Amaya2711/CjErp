import { useCallback, useEffect, useMemo, useState } from "react";
import ConfirmDialog from "../../../../../components/base/ConfirmDialog";
import DataGridPro from "../../../../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../../../../components/datagrid/types";
import { FiltroOperativoLookup } from "../../../../../components/lookups/FiltroOperativoLookup";
import { consultarCampo, grabarCampo, listarCatalogosSolicitud } from "../../../../../api/logisticaEquiposService";
import type { FiltroOperativoValue } from "../../../../../models/filtroOperativo";
import type { CampoLinea, SolicitudCatalogo } from "../../../../../models/logisticaEquipos";
import { getHttpErrorMessage } from "../../../../../utils/httpError";
import { ingresoStyles as styles } from "../ingreso/ingresoComun";

/** Fila de la grilla: la línea del servidor más lo que el usuario edita. */
type FilaCampo = CampoLinea & {
  clave: string;
  /** Cantidad conforme (por defecto, la enviada). */
  cantConforme: number;
  /** Estado elegido: vacío = 14 (x cruzar), 10 = observada. */
  estadoNuevo: number | null;
  obs: string;
};

const ESTADOS = [
  { value: 14, label: "CONFORME (x cruzar)" },
  { value: 10, label: "OBSERVADA" },
];

const hoyIso = () => new Date().toISOString().slice(0, 10);
const fechaCorta = (valor: unknown) => String(valor ?? "").slice(0, 10);
const aFila = (l: CampoLinea): FilaCampo => ({
  ...l,
  clave: `${l.nroSolicitud}|${l.posicion}`,
  cantConforme: l.cantSap,
  estadoNuevo: null,
  obs: l.observacion ?? "",
});

/** Pestaña "x Campo": conformidad de lo enviado a campo (estado 11 → 14 x cruzar, o 10 observada). */
export default function CampoTab() {
  const [responsables, setResponsables] = useState<SolicitudCatalogo[]>([]);
  const [usaSolicitudes, setUsaSolicitudes] = useState(false);
  const [solicitudes, setSolicitudes] = useState("");
  const [usaFecha, setUsaFecha] = useState(false);
  const [fechaIni, setFechaIni] = useState(hoyIso());
  const [fechaFin, setFechaFin] = useState(hoyIso());
  const [usaResponsable, setUsaResponsable] = useState(false);
  const [idResponsable, setIdResponsable] = useState<number | null>(null);
  const [usaRelacion, setUsaRelacion] = useState(false);
  const [relacion, setRelacion] = useState<FiltroOperativoValue>({});

  const [filas, setFilas] = useState<FilaCampo[]>([]);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [confirmar, setConfirmar] = useState(false);

  const buscar = useCallback(async () => {
    const f = usaRelacion ? relacion.filtro : undefined;
    if (usaRelacion && !f) {
      setError("Seleccione la relación cliente-proyecto-site.");
      return;
    }
    setCargando(true);
    setError("");
    try {
      const data = await consultarCampo({
        solicitudes: usaSolicitudes ? solicitudes.trim() : undefined,
        fechaIni: usaFecha ? fechaIni : undefined,
        fechaFin: usaFecha ? fechaFin : undefined,
        idRespCampo: usaResponsable ? idResponsable : undefined,
        idCliente: f?.idCliente,
        idProyecto: f?.idProyecto,
        idSite: f?.idSite,
        correSite: f?.correlativo,
      });
      setFilas(data.map(aFila));
      setSeleccion([]);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo consultar."));
    } finally {
      setCargando(false);
    }
  }, [usaSolicitudes, solicitudes, usaFecha, fechaIni, fechaFin, usaResponsable, idResponsable, usaRelacion, relacion]);

  // Como en el formulario antiguo, al abrir la pestaña se cargan las líneas pendientes.
  useEffect(() => {
    let cancelled = false;
    Promise.all([consultarCampo({}), listarCatalogosSolicitud()])
      .then(([data, cat]) => {
        if (cancelled) return;
        setFilas(data.map(aFila));
        setResponsables(cat.filter((c) => c.tipo === "SOLICITANTE"));
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

  // Una línea con estado o cantidad distinta a la enviada se considera marcada (como en el formulario antiguo).
  const claves = useMemo(() => {
    const marcadas = new Set(seleccion);
    filas.forEach((f) => {
      if (f.estadoNuevo || f.cantConforme !== f.cantSap) marcadas.add(f.clave);
    });
    return marcadas;
  }, [filas, seleccion]);

  const marcadas = useMemo(() => filas.filter((f) => claves.has(f.clave)), [filas, claves]);
  const esObservada = (f: FilaCampo) => f.estadoNuevo === 10 || f.cantConforme !== f.cantSap;

  const pedirConfirmacion = () => {
    setError("");
    setMensaje("");
    if (marcadas.length === 0) return setError("No existen registros seleccionados.");
    const invalida = marcadas.find((f) => !Number.isInteger(f.cantConforme) || f.cantConforme < 0 || f.cantConforme > f.cantSap);
    if (invalida) return setError(`Solicitud ${invalida.nroSolicitud}, posición ${invalida.posicion}: la cantidad conforme debe ser un entero entre 0 y ${invalida.cantSap}.`);
    const sinObs = marcadas.find((f) => esObservada(f) && !f.obs.trim());
    if (sinObs) return setError("Hay registros con estado OBSERVADA (o cantidad distinta) y no tienen detalle en Observación.");
    setConfirmar(true);
  };

  const ejecutar = async () => {
    setConfirmar(false);
    setGuardando(true);
    try {
      const resultado = await grabarCampo(
        marcadas.map((f) => ({
          nroSolicitud: f.nroSolicitud,
          posicion: f.posicion,
          correlativo: f.correlativo,
          idEstado: f.estadoNuevo,
          cantidad: f.cantConforme,
          observacion: f.obs.trim() || undefined,
        })),
      );
      setMensaje(`Datos actualizados: ${resultado.procesadas} registro(s); ${resultado.conDiferencia} observado(s).`);
      await buscar();
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo grabar."));
    } finally {
      setGuardando(false);
    }
  };

  const actualizar = (clave: string, cambios: Partial<FilaCampo>) =>
    setFilas((actuales) => actuales.map((f) => (f.clave === clave ? { ...f, ...cambios } : f)));

  const columnas = useMemo<GridColumn<FilaCampo>[]>(
    () => [
      { dataField: "estadoNuevo", caption: "Estado", width: 160, fixed: true, allowEditing: true, lookup: ESTADOS, cellStyle: (v) => (v ? { fontWeight: 700, color: "#1F6F8B" } : { color: "#94A3B8" }) },
      { dataField: "cantConforme", caption: "Cant. conforme", dataType: "number", width: 110, fixed: true, allowEditing: true },
      { dataField: "cantSap", caption: "Cant. enviada", dataType: "number", width: 100 },
      { dataField: "obs", caption: "Observación", width: 240, allowEditing: true },
      { dataField: "nroSolicitud", caption: "Nro. solicitud", width: 110 },
      { dataField: "posicion", caption: "Pos.", width: 60 },
      { dataField: "codPap", caption: "Código", width: 110 },
      { dataField: "nombreMaterial", caption: "Material", width: 300 },
      { dataField: "unidadMedida", caption: "UM", width: 60 },
      { dataField: "serie", caption: "Serie", width: 140 },
      { dataField: "pedidoSap", caption: "Pedido SAP", width: 120 },
      { dataField: "nombreCliente", caption: "Cliente", width: 160 },
      { dataField: "nombreProyecto", caption: "Proyecto", width: 180 },
      { dataField: "idSite", caption: "Site", width: 90 },
      { dataField: "nombreSite", caption: "Desc. site", width: 200 },
      { dataField: "tipoTrabajo", caption: "Trabajo", width: 140 },
      { dataField: "nomEstado", caption: "Est. actual", width: 120 },
      { dataField: "fechaCreacion", caption: "Fecha", width: 100, calculateCellValue: (r) => fechaCorta(r.fechaCreacion) },
    ],
    [],
  );

  return (
    <div style={styles.root}>
      <div style={styles.panel}>
        <label style={styles.check}>
          <input type="checkbox" checked={usaSolicitudes} onChange={(e) => setUsaSolicitudes(e.target.checked)} />
          Solicitud(es)
        </label>
        <input
          value={solicitudes}
          disabled={!usaSolicitudes}
          onChange={(e) => setSolicitudes(e.target.value)}
          placeholder="Ej.: 1001, 1002"
          style={{ ...styles.input, width: 160 }}
        />
        <label style={styles.check}>
          <input type="checkbox" checked={usaFecha} onChange={(e) => setUsaFecha(e.target.checked)} />
          Fecha de creación
        </label>
        <input type="date" value={fechaIni} disabled={!usaFecha} onChange={(e) => setFechaIni(e.target.value)} style={styles.input} />
        <input type="date" value={fechaFin} disabled={!usaFecha} onChange={(e) => setFechaFin(e.target.value)} style={styles.input} />
        <label style={styles.check}>
          <input type="checkbox" checked={usaResponsable} onChange={(e) => setUsaResponsable(e.target.checked)} />
          Responsable
        </label>
        <select
          value={idResponsable ?? ""}
          disabled={!usaResponsable}
          onChange={(e) => setIdResponsable(e.target.value ? Number(e.target.value) : null)}
          style={styles.input}
        >
          <option value="">Seleccione…</option>
          {responsables.map((r) => (
            <option key={r.id} value={r.id}>{r.nombre}</option>
          ))}
        </select>
      </div>

      <div style={styles.panel}>
        <label style={styles.check}>
          <input type="checkbox" checked={usaRelacion} onChange={(e) => setUsaRelacion(e.target.checked)} />
          Cliente-proyecto-site
        </label>
        <div style={{ flex: 1, minWidth: 320, opacity: usaRelacion ? 1 : 0.5, pointerEvents: usaRelacion ? "auto" : "none" }}>
          <FiltroOperativoLookup value={relacion} onChange={setRelacion} showTrabajo={false} showOt={false} showTarea={false} />
        </div>
        <button type="button" onClick={() => void buscar()} disabled={cargando} style={styles.secondary}>
          {cargando ? "Buscando…" : "Buscar"}
        </button>
        <button type="button" onClick={pedirConfirmacion} disabled={guardando || cargando} style={styles.primary}>
          {guardando ? "Grabando…" : "Grabar conformidad"}
        </button>
      </div>

      <div style={styles.toolbar}>
        <span style={styles.resumen}>
          Son: {filas.length}. Marcados: {claves.size}. Si cambia la cantidad conforme o elige OBSERVADA, indique la observación.
        </span>
      </div>

      {error ? <div role="alert" style={styles.error}>{error}</div> : null}
      {mensaje ? <div role="status" style={styles.ok}>{mensaje}</div> : null}

      <div style={styles.gridHost}>
        <DataGridPro<FilaCampo>
          dataSource={filas}
          columns={columnas}
          keyExpr="clave"
          height="fill"
          loading={cargando}
          noDataText="No hay líneas pendientes de conformidad en campo."
          stateStoringKey="logistica-campo"
          selection="multiple"
          selectedKeys={Array.from(claves)}
          selectionDisabled={guardando}
          onSelectionChanged={(keys) => {
            setSeleccion(keys);
            // Al desmarcar una línea se descartan los cambios que se le habían hecho.
            setFilas((actuales) =>
              actuales.map((f) =>
                !keys.includes(f.clave) && (f.estadoNuevo || f.cantConforme !== f.cantSap)
                  ? { ...f, estadoNuevo: null, cantConforme: f.cantSap }
                  : f,
              ),
            );
          }}
          editing={{
            allowUpdating: true,
            onCellChanged: ({ key, field, value }) => {
              if (field === "estadoNuevo") actualizar(String(key), { estadoNuevo: value === "" || value === null ? null : Number(value) });
              else if (field === "cantConforme") actualizar(String(key), { cantConforme: Number(value) });
              else if (field === "obs") actualizar(String(key), { obs: String(value ?? "") });
            },
          }}
          rowStyle={(f) => (esObservada(f) && claves.has(f.clave) ? { color: "#B45309", fontWeight: 600 } : undefined)}
          showSearchPanel={false}
          allowExport
          exportFileName="logistica_campo"
          rowAlternation={false}
          rowPadding="3px 8px"
          paging={{ pageSize: 100, pageSizes: [50, 100, 250, 500] }}
        />
      </div>

      <ConfirmDialog
        open={confirmar}
        title="Confirmar"
        message={`¿Desea dar CONFORMIDAD a los ${marcadas.length} registro(s) seleccionado(s)?`}
        confirmLabel="Grabar"
        onConfirm={() => void ejecutar()}
        onCancel={() => setConfirmar(false)}
      />
    </div>
  );
}
