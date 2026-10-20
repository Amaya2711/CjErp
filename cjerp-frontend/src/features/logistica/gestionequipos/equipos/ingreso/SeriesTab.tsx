import { useCallback, useMemo, useRef, useState } from "react";
import ConfirmDialog from "../../../../../components/base/ConfirmDialog";
import DataGridPro from "../../../../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../../../../components/datagrid/types";
import { FiltroOperativoLookup } from "../../../../../components/lookups/FiltroOperativoLookup";
import {
  actualizarGuiaEquipos,
  actualizarSerieEquipo,
  consultarIngreso,
  importarSeriesEquipos,
} from "../../../../../api/logisticaEquiposService";
import type { FiltroOperativoValue } from "../../../../../models/filtroOperativo";
import type { IngresoLinea, IngresoSerieMasivaItem } from "../../../../../models/logisticaEquipos";
import { getHttpErrorMessage } from "../../../../../utils/httpError";
import { leerSeries } from "./ingresoExcel";
import BarraFiltros from "./BarraFiltros";
import { construirConsulta, filtrosIniciales, ingresoStyles as styles } from "./ingresoComun";

const fechaCorta = (valor: unknown) => String(valor ?? "").slice(0, 10);
const hoyIso = () => new Date().toISOString().slice(0, 10);

const COLUMNAS_SERIE: GridColumn<IngresoLinea>[] = [
  { dataField: "pedidoSap", caption: "Pedido SAP", width: 120, fixed: true },
  { dataField: "comentario", caption: "Comentario", width: 220, allowEditing: true },
  { dataField: "cantSap", caption: "Cantidad", dataType: "number", width: 90, format: { type: "fixedPoint", precision: 0 } },
  { dataField: "codPap", caption: "Código", width: 110 },
  { dataField: "nombreMaterial", caption: "Material", width: 300 },
  { dataField: "serie", caption: "Serie", width: 170, allowEditing: true },
  { dataField: "guia", caption: "Nro. guía", width: 120 },
  { dataField: "nombreCliente", caption: "Cliente", width: 160 },
  { dataField: "nombreProyecto", caption: "Proyecto", width: 180 },
  { dataField: "idSite", caption: "Site", width: 90 },
  { dataField: "nombreSite", caption: "Desc. site", width: 200 },
  { dataField: "idSolicitud", caption: "Id. solicitud", width: 110 },
  { dataField: "tipoTrabajo", caption: "Trabajo", width: 140 },
  { dataField: "nomEstado", caption: "Estado", width: 130 },
  { dataField: "fecIngreso", caption: "Fec. guía", width: 100, calculateCellValue: (r) => fechaCorta(r.fecIngreso) },
];

type FilaMasiva = IngresoSerieMasivaItem & { fila: number; indice: number; estado: string; mensaje: string };

const COLUMNAS_MASIVO: GridColumn<FilaMasiva>[] = [
  { dataField: "estado", caption: "Resultado", width: 100, fixed: true },
  { dataField: "mensaje", caption: "Mensaje", width: 320, fixed: true },
  { dataField: "fila", caption: "Fila Excel", dataType: "number", width: 90 },
  { dataField: "pedido", caption: "Pedido", width: 130 },
  { dataField: "codPap", caption: "COD.PAP", width: 120 },
  { dataField: "site", caption: "Site", width: 160 },
  { dataField: "serie", caption: "Serie", width: 200 },
];

type Modo = "individual" | "masivo";

/** Pestaña "Series": registro individual de series, actualización de guía y carga masiva desde Excel. */
export default function SeriesTab() {
  const [modo, setModo] = useState<Modo>("individual");
  return (
    <div style={styles.root}>
      <div role="tablist" aria-label="Modo de series" style={{ display: "inline-flex", border: "1px solid #CBD5E1", borderRadius: 8, overflow: "hidden", alignSelf: "flex-start" }}>
        {(["individual", "masivo"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={modo === m}
            onClick={() => setModo(m)}
            style={{
              border: 0,
              padding: "7px 16px",
              cursor: "pointer",
              fontSize: 13,
              background: modo === m ? "#1F6F8B" : "#fff",
              color: modo === m ? "#fff" : "#475569",
            }}
          >
            {m === "individual" ? "Individual" : "Masivo"}
          </button>
        ))}
      </div>
      {modo === "individual" ? <SerieIndividual /> : <SerieMasivo />}
    </div>
  );
}

function SerieIndividual() {
  const [filtros, setFiltros] = useState(filtrosIniciales);
  const [filas, setFilas] = useState<IngresoLinea[]>([]);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [guia, setGuia] = useState("");
  const [fecIngreso, setFecIngreso] = useState(hoyIso);
  const [reasignar, setReasignar] = useState(false);
  const [destino, setDestino] = useState<FiltroOperativoValue>({});
  const [confirmar, setConfirmar] = useState(false);

  const pedidosSeleccionados = useMemo(
    () => Array.from(new Set(filas.filter((f) => seleccion.includes(f.correlativo)).map((f) => f.pedidoSap))),
    [filas, seleccion],
  );

  const buscar = useCallback(async () => {
    setError("");
    setMensaje("");
    if (!filtros.usaPedidos && !filtros.usaFecha && !filtros.usaSolicitudes) {
      setError("Debe seleccionar un filtro de búsqueda: nro. de pedido, fecha o id. de solicitud.");
      return;
    }
    setCargando(true);
    try {
      setFilas(await consultarIngreso(construirConsulta("SERIE", filtros)));
      setSeleccion([]);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo consultar."));
    } finally {
      setCargando(false);
    }
  }, [filtros]);

  const editarCelda = async (key: string, field: string, valor: unknown) => {
    const anterior = filas.find((f) => f.correlativo === key);
    if (!anterior || (field !== "serie" && field !== "comentario")) return;
    const texto = String(valor ?? "").trim();
    setError("");
    setMensaje("");
    setFilas((actuales) => actuales.map((f) => (f.correlativo === key ? { ...f, [field]: texto } : f)));
    try {
      await actualizarSerieEquipo({
        correlativo: key,
        serie: field === "serie" ? texto : undefined,
        comentario: field === "comentario" ? texto : undefined,
      });
      setMensaje(field === "serie" ? `Serie registrada: ${texto || "(vacía)"}` : "Comentario registrado.");
    } catch (err) {
      setFilas((actuales) => actuales.map((f) => (f.correlativo === key ? { ...f, [field]: (anterior as Record<string, unknown>)[field] as string } : f)));
      setError(getHttpErrorMessage(err, "No se pudo guardar el cambio."));
    }
  };

  const pedirConfirmacion = () => {
    setError("");
    setMensaje("");
    if (!guia.trim()) {
      setError("Debe ingresar la guía.");
      return;
    }
    if (pedidosSeleccionados.length === 0) {
      setError("No existen registros seleccionados.");
      return;
    }
    if (reasignar && (!destino.filtro || !destino.tipoTrabajo)) {
      setError("Para reasignar seleccione cliente, proyecto, site y tipo de trabajo.");
      return;
    }
    setConfirmar(true);
  };

  const actualizarGuia = async () => {
    setConfirmar(false);
    setGuardando(true);
    try {
      const resultado = await actualizarGuiaEquipos({
        pedidos: pedidosSeleccionados,
        guia: guia.trim(),
        fecIngreso,
        reasignar,
        idCliente: reasignar ? destino.filtro?.idCliente : undefined,
        idProyecto: reasignar ? destino.filtro?.idProyecto : undefined,
        tipoTrabajo: reasignar ? destino.tipoTrabajo?.tipoTrabajo : undefined,
        idSite: reasignar ? destino.filtro?.idSite : undefined,
        correSite: reasignar ? destino.filtro?.correlativo : undefined,
      });
      setMensaje(`Datos actualizados: ${resultado.pedidosActualizados} pedido(s), ${resultado.lineasActualizadas} línea(s).`);
      await buscar();
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo actualizar la guía."));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <BarraFiltros filtros={filtros} onChange={setFiltros} ubicaciones={[]} cargando={cargando} onBuscar={() => void buscar()} resumen={`Son: ${filas.length}`} />

      <div style={styles.panel}>
        <label style={styles.check}>
          Guía
          <input value={guia} onChange={(e) => setGuia(e.target.value)} style={{ ...styles.input, width: 150 }} />
        </label>
        <label style={styles.check}>
          Fec. ingreso
          <input type="date" value={fecIngreso} onChange={(e) => setFecIngreso(e.target.value)} style={styles.input} />
        </label>
        <label style={styles.check}>
          <input type="checkbox" checked={reasignar} onChange={(e) => setReasignar(e.target.checked)} />
          Reasignar cliente / proyecto / site / trabajo
        </label>
        {reasignar ? (
          <FiltroOperativoLookup value={destino} onChange={setDestino} showOt={false} showTarea={false} />
        ) : null}
        <button type="button" onClick={pedirConfirmacion} disabled={guardando || cargando} style={styles.primary}>
          {guardando ? "Actualizando…" : "Actualizar guía"}
        </button>
        <span style={styles.resumen}>
          Marcados: {seleccion.length} · Edite Serie o Comentario directamente en la grilla.
        </span>
      </div>

      {error ? <div role="alert" style={styles.error}>{error}</div> : null}
      {mensaje ? <div role="status" style={styles.ok}>{mensaje}</div> : null}

      <div style={styles.gridHost}>
        <DataGridPro<IngresoLinea>
          dataSource={filas}
          columns={COLUMNAS_SERIE}
          keyExpr="correlativo"
          height="fill"
          loading={cargando}
          noDataText="Seleccione un filtro y presione Buscar."
          stateStoringKey="logistica-ingreso-serie"
          selection="multiple"
          onSelectionChanged={(keys) => setSeleccion(keys)}
          editing={{ allowUpdating: true, onCellChanged: ({ key, field, value }) => void editarCelda(key, field, value) }}
          showSearchPanel={false}
          allowExport
          exportFileName="ingreso_series"
          autoExpandAll={false}
          rowAlternation={false}
          rowPadding="3px 8px"
          paging={{ pageSize: 100, pageSizes: [50, 100, 250, 500] }}
        />
      </div>

      <ConfirmDialog
        open={confirmar}
        title={reasignar ? "Actualizar guía y reasignar" : "Actualizar guía"}
        message={
          reasignar
            ? `¿Desea actualizar los datos del cliente, proyecto, site y tipo de trabajo y la guía de ${pedidosSeleccionados.length} pedido(s)?`
            : `¿Desea actualizar los datos de la guía de ${pedidosSeleccionados.length} pedido(s)?`
        }
        confirmLabel="Actualizar"
        onConfirm={() => void actualizarGuia()}
        onCancel={() => setConfirmar(false)}
      />
    </>
  );
}

function SerieMasivo() {
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState("");
  const [filas, setFilas] = useState<FilaMasiva[]>([]);
  const [validado, setValidado] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [confirmar, setConfirmar] = useState(false);

  const cargarArchivo = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setMensaje("");
    setValidado(false);
    try {
      const series = await leerSeries(file);
      setArchivo(file.name);
      setFilas(series.map((s, indice) => ({ ...s, indice, estado: "", mensaje: "" })));
    } catch (err) {
      setFilas([]);
      setArchivo("");
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
    } finally {
      if (entrada.current) entrada.current.value = "";
    }
  };

  const procesar = async (soloValidar: boolean) => {
    setConfirmar(false);
    setTrabajando(true);
    setError("");
    setMensaje("");
    try {
      const resultado = await importarSeriesEquipos(
        filas.map((f) => ({ pedido: f.pedido, codPap: f.codPap, site: f.site, serie: f.serie })),
        soloValidar,
      );
      // La API numera las líneas por su posición en el arreglo enviado (1, 2, 3…).
      const porIndice = new Map(resultado.lineas.map((l) => [l.fila - 1, l]));
      setFilas((actuales) =>
        actuales.map((f) => {
          const r = porIndice.get(f.indice);
          return r ? { ...f, estado: r.estado, mensaje: r.mensaje ?? "" } : { ...f, estado: "OMITIDO", mensaje: "Material cód. 10: no lleva serie." };
        }),
      );
      const errores = resultado.lineas.filter((l) => l.estado === "ERROR").length;
      if (errores > 0) {
        setValidado(false);
        setError(`Hay ${errores} línea(s) con error; no se asignó ninguna serie.`);
      } else if (soloValidar) {
        setValidado(true);
        setMensaje("Validación correcta: puede asignar las series.");
      } else {
        setValidado(false);
        setMensaje(resultado.aplicado ? "Series actualizadas." : "No se aplicó ningún cambio.");
      }
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudieron procesar las series."));
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <>
      <div style={styles.toolbar}>
        <input ref={entrada} type="file" accept=".xlsx,.xls" hidden onChange={(e) => void cargarArchivo(e.target.files?.[0])} />
        <button type="button" onClick={() => entrada.current?.click()} disabled={trabajando} style={styles.secondary}>
          Cargar Excel (PEDIDO, COD.PAP, SITE, SERIE)
        </button>
        <button type="button" onClick={() => void procesar(true)} disabled={trabajando || filas.length === 0} style={styles.secondary}>
          Validar
        </button>
        <button type="button" onClick={() => setConfirmar(true)} disabled={trabajando || !validado} style={styles.primary}>
          {trabajando ? "Procesando…" : "Asignar series"}
        </button>
        <span style={styles.resumen}>{archivo ? `${archivo} · ${filas.length} serie(s)` : "Cargue la plantilla de series"}</span>
      </div>

      {error ? <div role="alert" style={styles.error}>{error}</div> : null}
      {mensaje ? <div role="status" style={styles.ok}>{mensaje}</div> : null}

      <div style={styles.gridHost}>
        <DataGridPro<FilaMasiva>
          dataSource={filas}
          columns={COLUMNAS_MASIVO}
          keyExpr={(fila) => String(fila.indice)}
          height="fill"
          noDataText="Cargue un archivo Excel para ver las series."
          showSearchPanel={false}
          allowExport
          exportFileName="series_carga"
          autoExpandAll={false}
          rowAlternation={false}
          rowPadding="3px 8px"
          paging={{ pageSize: 100, pageSizes: [50, 100, 250, 500] }}
          rowStyle={(fila) => (fila.estado === "ERROR" ? { color: "#B91C1C", fontWeight: 600 } : undefined)}
        />
      </div>

      <ConfirmDialog
        open={confirmar}
        title="Asignar series"
        message={`Se asignarán ${filas.length} serie(s) a las líneas sin serie de cada pedido y material. Las líneas cód. 40 que queden sin serie pasarán a "no recepcionado". ¿Continuar?`}
        confirmLabel="Asignar"
        onConfirm={() => void procesar(false)}
        onCancel={() => setConfirmar(false)}
      />
    </>
  );
}
