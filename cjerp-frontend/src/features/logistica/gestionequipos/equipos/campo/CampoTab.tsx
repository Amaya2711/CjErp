import { useCallback, useEffect, useMemo, useState } from "react";
import CampoBuscable, { type OpcionBuscable } from "../solicitud/CampoBuscable";
import ConfirmDialog from "../../../../../components/base/ConfirmDialog";
import DataGridPro from "../../../../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../../../../components/datagrid/types";
import { FiltroOperativoLookup } from "../../../../../components/lookups/FiltroOperativoLookup";
import { actualizarLineaCampo, consultarCampo, grabarCampo, listarCatalogosSolicitud } from "../../../../../api/logisticaEquiposService";
import type { FiltroOperativoValue } from "../../../../../models/filtroOperativo";
import type { CampoLinea, SolicitudCatalogo } from "../../../../../models/logisticaEquipos";
import { getHttpErrorMessage } from "../../../../../utils/httpError";
import { getConstantesPorCampo } from "../../../../../api/constantesService";
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

/** Estados de ESTADO_LOG que muestra esta pestaña. */
const ESTADOS_CAMPO = [10, 14, 19];

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
  // Estados: sp_Constante_ListarPorCampo @Campo='ESTADO_LOG', solo los códigos de esta pestaña.
  const [estadosCampo, setEstadosCampo] = useState<{ value: number; label: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    getConstantesPorCampo("ESTADO_LOG")
      .then((data) => {
        if (cancelled) return;
        const opciones = data
          .map((c) => ({ value: Number(c.correlativo ?? c.codigo), label: (c.valorIni ?? c.descripcion ?? "").trim() }))
          .filter((o) => ESTADOS_CAMPO.includes(o.value))
          .map((o) => ({ ...o, label: `${o.value} - ${o.label}` }))
          .sort((a, b) => a.value - b.value);
        setEstadosCampo(opciones);
      })
      .catch(() => {
        if (!cancelled) setEstadosCampo([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [responsables, setResponsables] = useState<SolicitudCatalogo[]>([]);
  // Responsable: campo con búsqueda por texto (se escribe parte del nombre y la lista se va filtrando).
  const opcionesResponsable = useMemo<OpcionBuscable[]>(() => responsables.map((r) => ({ id: String(r.id), etiqueta: r.nombre ?? String(r.id) })), [responsables]);
  const alResponsable = useCallback((id: string | null) => setIdResponsable(id === null ? null : Number(id)), []);
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
  const [confirmaCant, setConfirmaCant] = useState<{ clave: string; anterior: number; nueva: number } | null>(null);
  const [pideObs, setPideObs] = useState<{ clave: string; idEstado: number } | null>(null);
  const [obsTexto, setObsTexto] = useState("");

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
    const invalida = marcadas.find((f) => !Number.isFinite(f.cantConforme) || f.cantConforme < 0 || f.cantConforme > f.cantSap);
    if (invalida) return setError(`Solicitud ${invalida.nroSolicitud}, posición ${invalida.posicion}: la cantidad conforme debe estar entre 0 y ${invalida.cantSap}.`);
    const sinObs = marcadas.find((f) => esObservada(f) && !f.obs.trim());
    if (sinObs) return setError("Hay registros con estado OBSERVADA (o cantidad distinta) y no tienen detalle en Observación.");
    setConfirmar(true);
  };

  /** Guarda la cantidad real (DetSolicitud.CantSap) ya confirmada; la conforme pasa a ser la nueva (sin diferencia). */
  const grabarCantidadReal = async (clave: string, nueva: number) => {
    const fila = filas.find((f) => f.clave === clave);
    if (!fila) return;
    setError("");
    setMensaje("");
    setGuardando(true);
    try {
      await actualizarLineaCampo({ nroSolicitud: fila.nroSolicitud, posicion: fila.posicion, correlativo: fila.correlativo, campos: ["cantsap"], cantSap: nueva });
      actualizar(clave, { cantSap: nueva, cantConforme: nueva });
      setMensaje(`Solicitud ${fila.nroSolicitud}, posición ${fila.posicion}: cantidad real modificada de ${fila.cantSap} a ${nueva}.`);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo guardar la cantidad real."));
    } finally {
      setGuardando(false);
    }
  };

  /** Ejecuta el flujo de conformidad de UNA línea con el estado elegido; la observación viaja en la misma llamada. */
  const grabarEstado = async (fila: FilaCampo, idEstado: number, obs: string) => {
    if (!Number.isFinite(fila.cantConforme) || fila.cantConforme < 0 || fila.cantConforme > fila.cantSap) {
      actualizar(fila.clave, { estadoNuevo: null });
      return setError(`La cantidad conforme debe estar entre 0 y ${fila.cantSap}.`);
    }
    setGuardando(true);
    try {
      await actualizarLineaCampo({
        nroSolicitud: fila.nroSolicitud,
        posicion: fila.posicion,
        correlativo: fila.correlativo,
        campos: obs ? ["observacion", "estado"] : ["estado"],
        idEstado,
        cantidad: fila.cantConforme,
        observacion: obs || undefined,
      });
      setFilas((actuales) => actuales.filter((f) => f.clave !== fila.clave));
      setSeleccion((actuales) => actuales.filter((k) => k !== fila.clave));
      setMensaje(`Solicitud ${fila.nroSolicitud}, posición ${fila.posicion}: ${estadosCampo.find((e) => e.value === idEstado)?.label ?? idEstado}.`);
    } catch (err) {
      actualizar(fila.clave, { estadoNuevo: null });
      setError(getHttpErrorMessage(err, "No se pudo grabar el estado."));
    } finally {
      setGuardando(false);
    }
  };

  /**
   * Guarda al instante lo editado en una celda (por nro. solicitud + posición + correlativo): observación y serie
   * se actualizan en la línea; el estado ejecuta el flujo completo de conformidad (stock, kardex, cabecera) y la
   * línea sale de la bandeja (pasa a 14 x cruzar o 10 observada).
   */
  const guardarCelda = async (clave: string, campo: "observacion" | "serie" | "nroguia" | "cantsap" | "estado", valor: string | number | null) => {
    const fila = filas.find((f) => f.clave === clave);
    if (!fila) return;
    setError("");
    setMensaje("");
    const base = { nroSolicitud: fila.nroSolicitud, posicion: fila.posicion, correlativo: fila.correlativo };

    if (campo === "estado") {
      if (valor === null) return actualizar(clave, { estadoNuevo: null });
      const idEstado = Number(valor);
      const observada = idEstado === 10 || fila.cantConforme !== fila.cantSap;
      if (observada && !fila.obs.trim()) {
        // OBSERVADA exige detalle: se pide en un popup y, al aceptar, se graba junto con el estado.
        actualizar(clave, { estadoNuevo: null });
        setObsTexto("");
        setPideObs({ clave, idEstado });
        return;
      }
      await grabarEstado(fila, idEstado, fila.obs.trim());
      return;
    }

    if (campo === "cantsap") {
      // Cant. Real = DetSolicitud.CantSap: se guarda al instante; la cantidad conforme pasa a ser la nueva (sin diferencia).
      const nueva = Number(valor);
      if (valor === null || valor === "" || !Number.isFinite(nueva) || nueva < 0) {
        return setError(`Solicitud ${fila.nroSolicitud}, posición ${fila.posicion}: la cantidad real debe ser un número mayor o igual a 0 (admite decimales).`);
      }
      if (nueva === fila.cantSap) return;
      // Antes de guardar se pide confirmación mostrando el valor actual y el nuevo.
      setConfirmaCant({ clave, anterior: fila.cantSap, nueva });
      return;
    }

    const texto = String(valor ?? "");
    const anterior = campo === "observacion" ? fila.obs : campo === "nroguia" ? String(fila.nroGuia ?? "") : String(fila.serie ?? "");
    if (texto === anterior) return;
    const cambio = (v: string): Partial<FilaCampo> => (campo === "observacion" ? { obs: v } : campo === "nroguia" ? { nroGuia: v } : { serie: v });
    actualizar(clave, cambio(texto));
    try {
      await actualizarLineaCampo({ ...base, campos: [campo], [campo === "nroguia" ? "nroGuia" : campo]: texto.trim() });
      if (campo === "nroguia") {
        setMensaje(`Solicitud ${fila.nroSolicitud}, posición ${fila.posicion}: guía ${texto.trim() ? `modificada a ${texto.trim()}` : "eliminada"}.`);
      }
    } catch (err) {
      actualizar(clave, cambio(anterior));
      setError(getHttpErrorMessage(err, `No se pudo guardar ${campo === "serie" ? "la serie" : campo === "nroguia" ? "el número de guía" : "la observación"}.`));
    }
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

  const columnasBase = useMemo<GridColumn<FilaCampo>[]>(
    () => [
      { dataField: "nroSolicitud", caption: "Nro. solicitud", width: 110, fixed: true },
      { dataField: "estadoNuevo", caption: "Estado", width: 160, fixed: true, allowEditing: true, lookup: estadosCampo, cellStyle: (v) => (v ? { fontWeight: 700, color: "#1F6F8B" } : { color: "#94A3B8" }) },
      { dataField: "codPap", caption: "Código", width: 110 },
      { dataField: "nombreMaterial", caption: "Material", width: 300 },
      { dataField: "unidadMedida", caption: "UM", width: 60 },
      { dataField: "cantConforme", caption: "Cant. conforme", dataType: "number", width: 110, allowEditing: false },
      { dataField: "cantSap", caption: "Cant. Real", dataType: "number", width: 100, allowEditing: true },
      { dataField: "serie", caption: "Serie", width: 140, allowEditing: true },
      { dataField: "obs", caption: "Observación", width: 240, allowEditing: true },
      { dataField: "posicion", caption: "Pos.", width: 60 },
      { dataField: "pedidoSap", caption: "Pedido SAP", width: 120 },
      { dataField: "nroGuia", caption: "Nro. guía", width: 130, allowEditing: true },
      { dataField: "nombreCliente", caption: "Cliente", width: 160 },
      { dataField: "nombreProyecto", caption: "Proyecto", width: 180, groupIndex: 0 },
      { dataField: "idSite", caption: "Site", width: 90 },
      { dataField: "nombreSite", caption: "Desc. site", width: 200, groupIndex: 1 },
      { dataField: "tipoTrabajo", caption: "Trabajo", width: 140 },
      { dataField: "nomEstado", caption: "Est. actual", width: 120 },
      { dataField: "fechaCreacion", caption: "Fecha", width: 100, calculateCellValue: (r) => fechaCorta(r.fechaCreacion) },
    ],
    [estadosCampo],
  );

  // DataGridPro deja editable toda columna sin allowEditing:false: aquí se editan Estado, Observación, Serie, Nro. guía y Cant. Real.
  const columnas = useMemo<GridColumn<FilaCampo>[]>(
    () => columnasBase.map((c) => ({ ...c, allowEditing: c.dataField === "estadoNuevo" || c.dataField === "obs" || c.dataField === "serie" || c.dataField === "nroGuia" || c.dataField === "cantSap" })),
    [columnasBase],
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
        <CampoBuscable
          opciones={opcionesResponsable}
          value={idResponsable === null ? null : String(idResponsable)}
          onChange={alResponsable}
          placeholder="Escriba para buscar…"
          disabled={!usaResponsable}
          style={{ ...styles.input, minWidth: 260 }}
        />
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
          stateStoringKey="logistica-campo-v4"
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
            editOnClick: true,
            onCellChanged: ({ key, field, value }) => {
              if (field === "estadoNuevo") void guardarCelda(String(key), "estado", value === "" || value === null ? null : Number(value));
              else if (field === "cantConforme") actualizar(String(key), { cantConforme: Number(value) });
              else if (field === "obs") void guardarCelda(String(key), "observacion", String(value ?? ""));
              else if (field === "serie") void guardarCelda(String(key), "serie", String(value ?? ""));
              else if (field === "cantSap") void guardarCelda(String(key), "cantsap", value === "" || value === null ? null : Number(value));
              else if (field === "nroGuia") void guardarCelda(String(key), "nroguia", String(value ?? ""));
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
        open={confirmaCant !== null}
        title="Modificar cantidad real"
        message={
          confirmaCant ? (
            <>
              <div>¿Desea modificar la cantidad real?</div>
              <div style={{ marginTop: 10 }}>
                Valor actual: <strong>{confirmaCant.anterior}</strong>
              </div>
              <div>
                Valor nuevo: <strong>{confirmaCant.nueva}</strong>
              </div>
            </>
          ) : null
        }
        confirmLabel="Modificar"
        confirmDisabled={guardando}
        onConfirm={() => {
          const c = confirmaCant;
          setConfirmaCant(null);
          if (c) void grabarCantidadReal(c.clave, c.nueva);
        }}
        onCancel={() => setConfirmaCant(null)}
      />

      <ConfirmDialog
        open={pideObs !== null}
        title="Observación requerida"
        message={
          <>
            <div>Indique el detalle de la observación para registrar la línea como OBSERVADA.</div>
            <textarea
              autoFocus
              value={obsTexto}
              onChange={(e) => setObsTexto(e.target.value)}
              maxLength={500}
              rows={4}
              style={{ width: "100%", marginTop: 10, padding: 8, borderRadius: 8, border: "1px solid #CBD5E1", fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }}
            />
          </>
        }
        confirmLabel="Grabar"
        confirmDisabled={!obsTexto.trim() || guardando}
        onConfirm={() => {
          const pedido = pideObs;
          const fila = pedido ? filas.find((f) => f.clave === pedido.clave) : undefined;
          setPideObs(null);
          if (pedido && fila) void grabarEstado(fila, pedido.idEstado, obsTexto.trim());
        }}
        onCancel={() => setPideObs(null)}
      />

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
