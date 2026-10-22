import { useCallback, useEffect, useMemo, useState } from "react";
import ConfirmDialog from "../../../../../components/base/ConfirmDialog";
import DataGridPro from "../../../../../components/datagrid/DataGridPro";
import { consultarIngreso } from "../../../../../api/logisticaEquiposService";
import type {
  IngresoCambioEstado,
  IngresoCambioEstadoResultado,
  IngresoEtapa,
} from "../../../../../models/logisticaEquipos";
import { getHttpErrorMessage } from "../../../../../utils/httpError";
import BarraFiltros from "./BarraFiltros";
import {
  columnasEstado,
  construirConsulta,
  filtrosIniciales,
  ingresoStyles as styles,
  useCatalogosIngreso,
  type IngresoFila,
  type OpcionCatalogo,
} from "./ingresoComun";

type EstadoTabProps = {
  etapa: Extract<IngresoEtapa, "RECEPCION" | "VALIDACION">;
  /** Estados a los que puede pasar una línea desde esta etapa. */
  estadosDestino: number[];
  /** Estado que se aplica a las líneas marcadas cuando no se eligió otro. */
  estadoDefecto: number;
  etiquetaEstadoActual: string;
  verbo: string;
  grabar: (request: IngresoCambioEstado) => Promise<IngresoCambioEstadoResultado>;
  /** Solo validación: permite indicar la zona del almacén donde queda el pedido. */
  conZonaAlmacen?: boolean;
  /** Barra de filtros de cabecera (pedido, solicitud, fecha de guía, almacén) y botón Buscar. */
  mostrarFiltros?: boolean;
};

const ETIQUETAS_RESPALDO: Record<number, string> = {
  1: "RECEPCIONADO",
  2: "VALIDADO",
  4: "RECHAZADO",
  6: "OBSERVADO",
  8: "NO RECEPCIONADO",
};

const ESTADOS_EN_ROJO = new Set([4, 6, 8]);

/** Pestañas "x Recepcionar" y "x Validar": consulta de líneas pendientes y cambio de estado en lote. */
export default function EstadoTab({
  etapa,
  estadosDestino,
  estadoDefecto,
  etiquetaEstadoActual,
  verbo,
  grabar,
  conZonaAlmacen = false,
  mostrarFiltros = true,
}: EstadoTabProps) {
  const catalogos = useCatalogosIngreso();
  const [filtros, setFiltros] = useState(filtrosIniciales);
  const [filas, setFilas] = useState<IngresoFila[]>([]);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [usaZona, setUsaZona] = useState(false);
  const [idZona, setIdZona] = useState<number | null>(null);

  const lookupEstados = useMemo<OpcionCatalogo[]>(
    () =>
      estadosDestino.map((valor) => ({
        value: valor,
        label: catalogos.estados.find((e) => e.value === valor)?.label ?? ETIQUETAS_RESPALDO[valor] ?? String(valor),
      })),
    [catalogos.estados, estadosDestino],
  );
  const columnas = useMemo(() => columnasEstado(lookupEstados, etiquetaEstadoActual), [lookupEstados, etiquetaEstadoActual]);

  const buscar = useCallback(
    async (filtrosActuales = filtros) => {
      setCargando(true);
      setError("");
      try {
        const data = await consultarIngreso(construirConsulta(etapa, filtrosActuales));
        setFilas(data.map((fila) => ({ ...fila, estadoNuevo: null })));
        setSeleccion([]);
      } catch (err) {
        setError(getHttpErrorMessage(err, "No se pudo consultar."));
      } finally {
        setCargando(false);
      }
    },
    [etapa, filtros],
  );

  // Como en el formulario antiguo, al abrir la pestaña se cargan los pendientes.
  useEffect(() => {
    let cancelled = false;
    consultarIngreso(construirConsulta(etapa, filtrosIniciales()))
      .then((data) => {
        if (!cancelled) setFilas(data.map((fila) => ({ ...fila, estadoNuevo: null })));
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
  }, [etapa]);

  // Las líneas con estado elegido se consideran marcadas (igual que el formulario antiguo).
  const claves = useMemo(() => {
    const marcadas = new Set(seleccion);
    filas.forEach((f) => {
      if (f.estadoNuevo) marcadas.add(f.correlativo);
    });
    return marcadas;
  }, [filas, seleccion]);

  const items = useMemo(
    () =>
      filas
        .filter((f) => claves.has(f.correlativo))
        .map((f) => ({ correlativo: f.correlativo, idEstado: f.estadoNuevo ?? estadoDefecto })),
    [filas, claves, estadoDefecto],
  );
  const pedidosAfectados = useMemo(
    () => Array.from(new Set(filas.filter((f) => claves.has(f.correlativo)).map((f) => f.pedidoSap))),
    [filas, claves],
  );

  const pedirConfirmacion = () => {
    setError("");
    setMensaje("");
    if (items.length === 0) {
      setError("No existen registros seleccionados.");
      return;
    }
    if (etapa === "VALIDACION" && filas.some((f) => claves.has(f.correlativo) && (f.estadoNuevo ?? estadoDefecto) === 6 && !(f.serie ?? "").trim())) {
      setError("No se puede grabar la validación en estado 6 si el registro no tiene serie.");
      return;
    }
    setConfirmar(true);
  };

  const ejecutar = async () => {
    setConfirmar(false);
    setGuardando(true);
    try {
      const resultado = await grabar({ items, idZonaAlmacen: conZonaAlmacen && usaZona ? idZona : null });
      setMensaje(`Datos actualizados: ${resultado.actualizadas} registro(s); ${resultado.pedidosCompletos} pedido(s) completado(s).`);
      await buscar();
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo grabar."));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={styles.root}>
      {mostrarFiltros ? (
        <BarraFiltros
          filtros={filtros}
          onChange={setFiltros}
          ubicaciones={catalogos.ubicaciones}
          mostrarUbicacion
          cargando={cargando}
          onBuscar={() => void buscar()}
          resumen={`Son: ${filas.length}`}
        />
      ) : null}

      <div style={styles.toolbar}>
        {conZonaAlmacen ? (
          <>
            <label style={styles.check}>
              <input type="checkbox" checked={usaZona} onChange={(e) => setUsaZona(e.target.checked)} />
              Ubicar en zona del almacén
            </label>
            <select
              value={idZona ?? ""}
              disabled={!usaZona}
              onChange={(e) => setIdZona(e.target.value === "" ? null : Number(e.target.value))}
              style={styles.input}
            >
              <option value="">Seleccione…</option>
              {catalogos.zonasAlmacen.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <button type="button" onClick={pedirConfirmacion} disabled={guardando || cargando} style={styles.primary}>
          {guardando ? "Grabando…" : `Grabar (${verbo})`}
        </button>
        <span style={styles.resumen}>
          {mostrarFiltros ? "" : `Son: ${filas.length}. `}Marcados: {claves.size}. Para cambiar a otro estado, elíjalo en la columna Estado.
        </span>
      </div>

      {catalogos.error ? <div role="alert" style={styles.error}>{catalogos.error}</div> : null}
      {error ? <div role="alert" style={styles.error}>{error}</div> : null}
      {mensaje ? <div role="status" style={styles.ok}>{mensaje}</div> : null}

      <div style={styles.gridHost}>
        <DataGridPro<IngresoFila>
          dataSource={filas}
          columns={columnas}
          keyExpr="correlativo"
          height="fill"
          loading={cargando}
          noDataText="No hay registros pendientes para los filtros indicados."
          stateStoringKey={`logistica-ingreso-${etapa.toLowerCase()}`}
          selection="multiple"
          selectedKeys={Array.from(claves)}
          selectionDisabled={guardando}
          onSelectionChanged={(keys) => {
            setSeleccion(keys);
            // Al desmarcar una línea también se descarta el estado que se había elegido para ella.
            setFilas((actuales) =>
              actuales.some((f) => f.estadoNuevo && !keys.includes(f.correlativo))
                ? actuales.map((f) => (f.estadoNuevo && !keys.includes(f.correlativo) ? { ...f, estadoNuevo: null } : f))
                : actuales,
            );
          }}
          editing={{
            allowUpdating: true,
            onCellChanged: ({ key, field, value }) => {
              if (field !== "estadoNuevo") return;
              setFilas((actuales) =>
                actuales.map((fila) =>
                  fila.correlativo === key ? { ...fila, estadoNuevo: value === "" || value === null ? null : Number(value) } : fila,
                ),
              );
            },
          }}
          rowStyle={(fila) => (ESTADOS_EN_ROJO.has(fila.idEstado) ? { color: "#B91C1C", fontWeight: 600 } : undefined)}
          showSearchPanel={false}
          allowExport
          exportFileName={`ingreso_${etapa.toLowerCase()}`}
          autoExpandAll={false}
          rowAlternation={false}
          rowPadding="3px 8px"
          paging={{ pageSize: 100, pageSizes: [50, 100, 250, 500] }}
        />
      </div>

      <ConfirmDialog
        open={confirmar}
        title="Confirmar"
        message={`¿Desea actualizar los registros seleccionados? Pedidos: ${pedidosAfectados.join(", ")}. Registros: ${items.length}.`}
        confirmLabel="Actualizar"
        onConfirm={() => void ejecutar()}
        onCancel={() => setConfirmar(false)}
      />
    </div>
  );
}
