import { useMemo, useRef, useState } from "react";
import ConfirmDialog from "../../../../../components/base/ConfirmDialog";
import DataGridPro from "../../../../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../../../../components/datagrid/types";
import { consultarIngreso, importarPedidoEquipos, importarSecundarioEquipos } from "../../../../../api/logisticaEquiposService";
import type { IngresoLinea, IngresoLineaResultado, PedidoItem, SecundarioItem } from "../../../../../models/logisticaEquipos";
import { getHttpErrorMessage } from "../../../../../utils/httpError";
import { leerPedidos, leerSecundario } from "./ingresoExcel";
import { ingresoStyles as styles } from "./ingresoComun";

type Resultado = { estado: string; mensaje: string };
type FilaPedido = PedidoItem & Resultado;
type FilaSecundario = SecundarioItem & Resultado;

const COLUMNAS_PREVIA: GridColumn<FilaPedido>[] = [
  { dataField: "estado", caption: "Resultado", width: 100, fixed: true },
  { dataField: "mensaje", caption: "Mensaje", width: 280, fixed: true },
  { dataField: "fila", caption: "Fila Excel", dataType: "number", width: 80 },
  { dataField: "pedidoSap", caption: "Pedido SAP", width: 120 },
  { dataField: "idSolicitud", caption: "Id. solicitud", width: 110 },
  { dataField: "site", caption: "Site", width: 90 },
  { dataField: "descSite", caption: "Desc. site", width: 200 },
  { dataField: "codPap", caption: "CODPAP", width: 110 },
  { dataField: "descripcion", caption: "Descripción", width: 280 },
  { dataField: "cantSolicitada", caption: "Cant. solicitada", dataType: "number", width: 110 },
  { dataField: "cantSap", caption: "Cant. pedido SAP", dataType: "number", width: 120 },
  { dataField: "centro", caption: "Centro origen", width: 100 },
  { dataField: "almOrigen", caption: "Alm. origen", width: 100 },
  { dataField: "lote", caption: "Lote", width: 100 },
  { dataField: "posicion", caption: "Posición", width: 80 },
  { dataField: "cliente", caption: "Cliente", width: 160 },
  { dataField: "proyecto", caption: "Proyecto", width: 180 },
  { dataField: "tipoTrabajo", caption: "Tipo trabajo", width: 130 },
  { dataField: "fecIngreso", caption: "Fec. ingreso", width: 100 },
  { dataField: "guia", caption: "Guía", width: 110 },
  { dataField: "solicitante", caption: "Solicitante", width: 160 },
  { dataField: "obsSolic", caption: "Obs. solicitud", width: 200 },
  { dataField: "region", caption: "Región", width: 100 },
  { dataField: "oc", caption: "OC", width: 100 },
];

const COLUMNAS_SECUNDARIO: GridColumn<FilaSecundario>[] = [
  { dataField: "estado", caption: "Resultado", width: 100, fixed: true },
  { dataField: "mensaje", caption: "Mensaje", width: 360, fixed: true },
  { dataField: "fila", caption: "Fila Excel", dataType: "number", width: 80 },
  { dataField: "idSolicitud", caption: "Id. solicitud", width: 120 },
  { dataField: "idMaterial", caption: "ID_MATERIAL", width: 120 },
  { dataField: "descripcion", caption: "Descripción", width: 300 },
  { dataField: "site", caption: "Site destino", width: 100 },
  { dataField: "descSite", caption: "Desc. site", width: 220 },
  { dataField: "cantidad", caption: "Cantidad", dataType: "number", width: 100 },
  { dataField: "lote", caption: "Lote", width: 100 },
];

const COLUMNAS_MIGRADO: GridColumn<IngresoLinea>[] = [
  { dataField: "pedidoSap", caption: "Pedido SAP", width: 120 },
  { dataField: "idSolicitud", caption: "Id. solicitud", width: 110 },
  { dataField: "idSite", caption: "Site", width: 90 },
  { dataField: "nombreSite", caption: "Desc. site", width: 200 },
  { dataField: "codPap", caption: "Código", width: 110 },
  { dataField: "nombreMaterial", caption: "Material", width: 280 },
  { dataField: "cantSap", caption: "Cantidad", dataType: "number", width: 90 },
  { dataField: "centro", caption: "Centro", width: 90 },
  { dataField: "almacen", caption: "Almacén", width: 90 },
  { dataField: "lote", caption: "Lote", width: 100 },
  { dataField: "serie", caption: "Serie", width: 120 },
  { dataField: "nomEstado", caption: "Estado", width: 130 },
  { dataField: "posicion", caption: "Posición", width: 80 },
  { dataField: "observacion", caption: "Observación", width: 220 },
];

type Hoja = "principal" | "secundario";
type Vista = "previa" | "migrado";

const estiloRow = (r: Resultado) =>
  r.estado === "ERROR" ? { color: "#B91C1C", fontWeight: 600 } : r.estado === "OMITIDO" ? { color: "#B45309" } : undefined;

const sinResultado = <T extends object>(item: T): T & Resultado => ({ ...item, estado: "", mensaje: "" });

/**
 * Pestaña "Pedido". Hoja PRINCIPAL: crea pedido, líneas y stock. Hoja SECUNDARIO: reasigna lo ya cargado entre sites.
 * Cada hoja se valida e importa por separado (primero PRINCIPAL, luego SECUNDARIO).
 */
export default function PedidoTab() {
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState("");
  const [principal, setPrincipal] = useState<FilaPedido[]>([]);
  const [secundario, setSecundario] = useState<FilaSecundario[]>([]);
  const [migrado, setMigrado] = useState<IngresoLinea[]>([]);
  const [hoja, setHoja] = useState<Hoja>("principal");
  const [vista, setVista] = useState<Vista>("previa");
  const [validado, setValidado] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [confirmar, setConfirmar] = useState(false);

  const filasActivas = hoja === "principal" ? principal : secundario;

  const resumen = useMemo(() => {
    const pedidos = new Set(principal.map((f) => f.pedidoSap).filter(Boolean));
    const solicitudes = new Set([...principal.map((f) => f.idSolicitud), ...secundario.map((f) => f.idSolicitud)].filter(Boolean));
    return {
      pedidos: Array.from(pedidos),
      solicitudes: Array.from(solicitudes),
      errores: filasActivas.filter((f) => f.estado === "ERROR").length,
      omitidas: filasActivas.filter((f) => f.estado === "OMITIDO").length,
    };
  }, [principal, secundario, filasActivas]);

  const aplicarResultados = (lineas: IngresoLineaResultado[]) => {
    const porFila = new Map(lineas.map((l) => [l.fila, l]));
    const aplicar = <T extends { fila: number } & Resultado>(actuales: T[]) =>
      actuales.map((f) => {
        const r = porFila.get(f.fila);
        return r ? { ...f, estado: r.estado, mensaje: r.mensaje ?? "" } : f;
      });
    if (hoja === "principal") setPrincipal(aplicar);
    else setSecundario(aplicar);
  };

  const cargarArchivo = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setMensaje("");
    setValidado(false);
    setMigrado([]);
    setVista("previa");
    try {
      const [hojaPrincipal, hojaSecundario] = await Promise.all([leerPedidos(file), leerSecundario(file)]);
      if (hojaPrincipal === null && hojaSecundario === null) {
        throw new Error("El archivo no contiene las hojas PRINCIPAL ni SECUNDARIO.");
      }
      setArchivo(file.name);
      setPrincipal((hojaPrincipal ?? []).map(sinResultado));
      setSecundario((hojaSecundario ?? []).map(sinResultado));
      setHoja(hojaPrincipal && hojaPrincipal.length > 0 ? "principal" : "secundario");
    } catch (err) {
      setPrincipal([]);
      setSecundario([]);
      setArchivo("");
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
    } finally {
      if (entrada.current) entrada.current.value = "";
    }
  };

  const cambiarHoja = (siguiente: Hoja) => {
    setHoja(siguiente);
    setValidado(false);
    setVista("previa");
    setError("");
    setMensaje("");
  };

  const enviar = async (soloValidar: boolean) => {
    if (hoja === "principal") {
      const items: PedidoItem[] = principal.map((f) => ({
        fila: f.fila,
        pedidoSap: f.pedidoSap,
        idSolicitud: f.idSolicitud,
        site: f.site,
        descSite: f.descSite,
        solicitante: f.solicitante,
        codPap: f.codPap,
        descripcion: f.descripcion,
        cantSolicitada: f.cantSolicitada,
        cantSap: f.cantSap,
        centro: f.centro,
        almOrigen: f.almOrigen,
        lote: f.lote,
        obsSolic: f.obsSolic,
        region: f.region,
        oc: f.oc,
        posicion: f.posicion,
        cliente: f.cliente,
        proyecto: f.proyecto,
        tipoTrabajo: f.tipoTrabajo,
        fecIngreso: f.fecIngreso,
        guia: f.guia,
      }));
      return importarPedidoEquipos(items, soloValidar);
    }
    const items: SecundarioItem[] = secundario.map((f) => ({
      fila: f.fila,
      idMaterial: f.idMaterial,
      idSolicitud: f.idSolicitud,
      site: f.site,
      descSite: f.descSite,
      descripcion: f.descripcion,
      cantidad: f.cantidad,
      lote: f.lote,
    }));
    return importarSecundarioEquipos(items, soloValidar);
  };

  const validar = async () => {
    setTrabajando(true);
    setError("");
    setMensaje("");
    try {
      const resultado = await enviar(true);
      aplicarResultados(resultado.lineas);
      const errores = resultado.lineas.filter((l) => l.estado === "ERROR").length;
      setValidado(errores === 0);
      setMensaje(errores === 0 ? "Validación correcta: la hoja puede importarse." : `Hay ${errores} línea(s) con error. Corrija el archivo y vuelva a cargarlo.`);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo validar el archivo."));
    } finally {
      setTrabajando(false);
    }
  };

  const importar = async () => {
    setConfirmar(false);
    setTrabajando(true);
    setError("");
    setMensaje("");
    try {
      const resultado = await enviar(false);
      aplicarResultados(resultado.lineas);
      if (!resultado.aplicado) {
        setValidado(false);
        setError("No se importó ningún dato: revise los mensajes de la grilla.");
        return;
      }
      const cargadas = resultado.lineas.filter((l) => l.estado === "OK").length;
      const omitidas = resultado.lineas.filter((l) => l.estado === "OMITIDO").length;
      setMensaje(
        hoja === "principal"
          ? `Datos migrados: ${cargadas} línea(s) cargada(s)${omitidas ? `, ${omitidas} omitida(s) por existir` : ""}.`
          : `Reasignación aplicada: ${cargadas} línea(s) del archivo${omitidas ? `, ${omitidas} omitida(s)` : ""}.`,
      );
      setValidado(false);
      setMigrado(
        await consultarIngreso(
          hoja === "principal" ? { etapa: "PEDIDO", pedidos: resumen.pedidos.join(",") } : { etapa: "PEDIDO", solicitudes: resumen.solicitudes.join(",") },
        ),
      );
      setVista("migrado");
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo importar el archivo."));
    } finally {
      setTrabajando(false);
    }
  };

  const tabs = (valores: readonly string[], activo: string, etiqueta: (v: string) => string, onSelect: (v: string) => void, desactivar?: (v: string) => boolean) => (
    <div role="tablist" style={{ display: "inline-flex", border: "1px solid #CBD5E1", borderRadius: 8, overflow: "hidden" }}>
      {valores.map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={activo === v}
          disabled={desactivar?.(v)}
          onClick={() => onSelect(v)}
          style={{
            border: 0,
            padding: "7px 14px",
            cursor: "pointer",
            fontSize: 13,
            background: activo === v ? "#1F6F8B" : "#fff",
            color: activo === v ? "#fff" : "#475569",
          }}
        >
          {etiqueta(v)}
        </button>
      ))}
    </div>
  );

  return (
    <div style={styles.root}>
      <div style={styles.toolbar}>
        <input ref={entrada} type="file" accept=".xlsx,.xls" hidden onChange={(e) => void cargarArchivo(e.target.files?.[0])} />
        <button type="button" onClick={() => entrada.current?.click()} disabled={trabajando} style={styles.secondary}>
          Cargar Excel
        </button>
        {tabs(
          ["principal", "secundario"],
          hoja,
          (v) => (v === "principal" ? `Principal (${principal.length})` : `Secundario (${secundario.length})`),
          (v) => cambiarHoja(v as Hoja),
        )}
        <button type="button" onClick={() => void validar()} disabled={trabajando || filasActivas.length === 0} style={styles.secondary}>
          Validar
        </button>
        <button type="button" onClick={() => setConfirmar(true)} disabled={trabajando || !validado} style={styles.primary}>
          {trabajando ? "Procesando…" : hoja === "principal" ? "Importar pedido" : "Reasignar sites"}
        </button>
        {tabs(
          ["previa", "migrado"],
          vista,
          (v) => (v === "previa" ? "Archivo" : "Datos migrados"),
          (v) => setVista(v as Vista),
          (v) => v === "migrado" && migrado.length === 0,
        )}
        <span style={styles.resumen}>
          {archivo ? `${archivo} · ${filasActivas.length} línea(s)` : "Cargue la plantilla de pedidos"}
          {resumen.errores ? ` · ${resumen.errores} con error` : ""}
        </span>
      </div>

      {hoja === "secundario" ? (
        <div style={{ ...styles.panel, fontSize: 12, color: "#475569" }}>
          Cód. 40: mueve esas unidades al site indicado. Cód. 10: reparte la cantidad entre sites (la suma por solicitud, material y lote debe ser igual a la existente).
          No modifica el stock. Importe primero la hoja PRINCIPAL si el pedido es nuevo.
        </div>
      ) : null}

      {error ? <div role="alert" style={styles.error}>{error}</div> : null}
      {mensaje ? <div role="status" style={styles.ok}>{mensaje}</div> : null}

      <div style={styles.gridHost}>
        {vista === "migrado" ? (
          <DataGridPro<IngresoLinea>
            dataSource={migrado}
            columns={COLUMNAS_MIGRADO}
            keyExpr="correlativo"
            height="fill"
            noDataText="Sin datos migrados."
            showSearchPanel={false}
            allowExport
            exportFileName="pedido_migrado"
            autoExpandAll={false}
            rowAlternation={false}
            rowPadding="3px 8px"
            paging={{ pageSize: 100, pageSizes: [50, 100, 250, 500] }}
          />
        ) : hoja === "principal" ? (
          <DataGridPro<FilaPedido>
            dataSource={principal}
            columns={COLUMNAS_PREVIA}
            keyExpr={(fila) => String(fila.fila)}
            height="fill"
            noDataText="Cargue un archivo Excel para ver las líneas del pedido."
            showSearchPanel={false}
            allowExport
            exportFileName="pedido_previa"
            autoExpandAll={false}
            rowAlternation={false}
            rowPadding="3px 8px"
            paging={{ pageSize: 100, pageSizes: [50, 100, 250, 500] }}
            rowStyle={estiloRow}
          />
        ) : (
          <DataGridPro<FilaSecundario>
            dataSource={secundario}
            columns={COLUMNAS_SECUNDARIO}
            keyExpr={(fila) => String(fila.fila)}
            height="fill"
            noDataText="El archivo no tiene líneas en la hoja SECUNDARIO."
            showSearchPanel={false}
            allowExport
            exportFileName="pedido_secundario"
            autoExpandAll={false}
            rowAlternation={false}
            rowPadding="3px 8px"
            paging={{ pageSize: 100, pageSizes: [50, 100, 250, 500] }}
            rowStyle={estiloRow}
          />
        )}
      </div>

      <ConfirmDialog
        open={confirmar}
        title={hoja === "principal" ? "Importar pedido" : "Reasignar sites"}
        message={
          hoja === "principal"
            ? `Se crearán las líneas de ${resumen.pedidos.length} pedido(s) (${principal.length - resumen.omitidas} línea(s) nuevas) y se sumará el stock a Disponible. ¿Continuar?`
            : `Se reasignarán ${secundario.length - resumen.omitidas} línea(s) entre sites. No se modifica el stock. ¿Continuar?`
        }
        confirmLabel={hoja === "principal" ? "Importar" : "Reasignar"}
        onConfirm={() => void importar()}
        onCancel={() => setConfirmar(false)}
      />
    </div>
  );
}
