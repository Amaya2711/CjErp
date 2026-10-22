import { useMemo, useRef, useState } from "react";
import ConfirmDialog from "../../../../../components/base/ConfirmDialog";
import DataGridPro from "../../../../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../../../../components/datagrid/types";
import { consultarIngreso, importarPedidoEquipos, importarSecundarioEquipos } from "../../../../../api/logisticaEquiposService";
import type { IngresoLinea, IngresoLineaResultado, PedidoItem, SecundarioItem } from "../../../../../models/logisticaEquipos";
import { getHttpErrorMessage } from "../../../../../utils/httpError";
import { leerPedidos, leerSecundario } from "./ingresoExcel";
import { estiloPestanas, ingresoStyles as styles } from "./ingresoComun";

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

const aItemsPedido = (filas: FilaPedido[]): PedidoItem[] =>
  filas.map((f) => ({
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

const aItemsSecundario = (filas: FilaSecundario[]): SecundarioItem[] =>
  filas.map((f) => ({
    fila: f.fila,
    idMaterial: f.idMaterial,
    idSolicitud: f.idSolicitud,
    site: f.site,
    descSite: f.descSite,
    descripcion: f.descripcion,
    cantidad: f.cantidad,
    lote: f.lote,
  }));

const conResultados = <T extends { fila: number } & Resultado>(filas: T[], lineas: IngresoLineaResultado[]): T[] => {
  const porFila = new Map(lineas.map((l) => [l.fila, l]));
  return filas.map((f) => {
    const r = porFila.get(f.fila);
    return r ? { ...f, estado: r.estado, mensaje: r.mensaje ?? "" } : f;
  });
};

const contar = (filas: Resultado[], estado: string) => filas.filter((f) => f.estado === estado).length;

const texto = (valor: unknown) => String(valor ?? "").trim();

/**
 * Valida las dos hojas como lo hacía "Cargar" en el formulario antiguo (FrmLogistic_v1):
 *  - PRINCIPAL: lote, site, cliente, proyecto y relación cliente-proyecto-site (servidor, sin grabar).
 *  - SECUNDARIO: cada ID_MATERIAL debe existir en la lista PRINCIPAL del mismo archivo (local).
 *  - SECUNDARIO contra la BD solo se puede validar si el pedido PRINCIPAL ya estaba cargado; si es nuevo,
 *    sus líneas aún no existen y se valida completa al importar, después de la hoja PRINCIPAL.
 */
async function validarHojas(pri: FilaPedido[], sec: FilaSecundario[]) {
  let p = pri.map(sinResultado);
  let s = sec.map(sinResultado);

  if (p.length > 0) {
    const r = await importarPedidoEquipos(aItemsPedido(p), true);
    p = conResultados(p, r.lineas);
  }

  const codigos = new Set(p.map((f) => texto(f.codPap)));
  s = s.map((f) =>
    codigos.has(texto(f.idMaterial))
      ? f
      : { ...f, estado: "ERROR", mensaje: `No existe el material ${texto(f.idMaterial)} dentro de la lista de la hoja PRINCIPAL.` },
  );

  if (s.length > 0) {
    const principalPendiente = p.some((f) => f.estado === "OK");
    if (!principalPendiente && contar(s, "ERROR") === 0) {
      const r = await importarSecundarioEquipos(aItemsSecundario(s), true);
      s = conResultados(s, r.lineas);
    } else if (principalPendiente) {
      s = s.map((f) => (f.estado === "" ? { ...f, mensaje: "Se valida por completo al importar, después de la hoja PRINCIPAL." } : f));
    }
  }

  return { p, s, errP: contar(p, "ERROR"), errS: contar(s, "ERROR") };
}

/**
 * Pestaña "Pedido" (equivale a XtabPedido de FrmLogistic_v1).
 * - Cargar Excel lee las hojas PRINCIPAL y SECUNDARIO y valida ambas (el importar solo se habilita sin errores en ninguna).
 * - Importar pedido: PRINCIPAL crea pedido, líneas y stock; luego SECUNDARIO reasigna sites. Con la pestaña PRINCIPAL activa,
 *   si todo el pedido ya existía no se continúa con SECUNDARIO ("los datos ya existen"); con SECUNDARIO activa siempre se aplica.
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

  const resumen = useMemo(() => {
    const pedidos = new Set(principal.map((f) => f.pedidoSap).filter(Boolean));
    const solicitudes = new Set([...principal.map((f) => f.idSolicitud), ...secundario.map((f) => f.idSolicitud)].filter(Boolean));
    return {
      pedidos: Array.from(pedidos),
      solicitudes: Array.from(solicitudes),
      errPrincipal: contar(principal, "ERROR"),
      errSecundario: contar(secundario, "ERROR"),
      nuevas: contar(principal, "OK"),
    };
  }, [principal, secundario]);

  const ejecutarValidacion = async (pri: FilaPedido[], sec: FilaSecundario[]) => {
    setTrabajando(true);
    setError("");
    setMensaje("");
    setValidado(false);
    try {
      const { p, s, errP, errS } = await validarHojas(pri, sec);
      setPrincipal(p);
      setSecundario(s);
      if (errP + errS === 0) {
        setValidado(true);
        setMensaje("Validación correcta: el archivo puede importarse.");
      } else {
        if (errP === 0 && errS > 0) setHoja("secundario");
        if (errP > 0) setHoja("principal");
        setMensaje(`Hay ${errP} línea(s) con error en PRINCIPAL y ${errS} en SECUNDARIO. Corrija el archivo y vuelva a cargarlo.`);
      }
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo validar el archivo."));
    } finally {
      setTrabajando(false);
    }
  };

  const cargarArchivo = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setMensaje("");
    setValidado(false);
    setMigrado([]);
    setVista("previa");
    let pri: FilaPedido[] = [];
    let sec: FilaSecundario[] = [];
    try {
      const [hojaPrincipal, hojaSecundario] = await Promise.all([leerPedidos(file), leerSecundario(file)]);
      if (hojaPrincipal === null && hojaSecundario === null) {
        throw new Error("El archivo no contiene las hojas PRINCIPAL ni SECUNDARIO.");
      }
      pri = (hojaPrincipal ?? []).map(sinResultado);
      sec = (hojaSecundario ?? []).map(sinResultado);
      setArchivo(file.name);
      setPrincipal(pri);
      setSecundario(sec);
      setHoja(pri.length > 0 ? "principal" : "secundario");
    } catch (err) {
      setPrincipal([]);
      setSecundario([]);
      setArchivo("");
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
      return;
    } finally {
      if (entrada.current) entrada.current.value = "";
    }
    await ejecutarValidacion(pri, sec);
  };

  const cambiarHoja = (siguiente: Hoja) => {
    setHoja(siguiente);
    setVista("previa");
  };

  const cargarMigrado = async (pri: FilaPedido[], sec: FilaSecundario[]) => {
    const pedidos = Array.from(new Set(pri.map((f) => f.pedidoSap).filter(Boolean)));
    const solicitudes = Array.from(new Set([...pri.map((f) => f.idSolicitud), ...sec.map((f) => f.idSolicitud)].filter(Boolean)));
    setMigrado(
      await consultarIngreso(pedidos.length > 0 ? { etapa: "PEDIDO", pedidos: pedidos.join(",") } : { etapa: "PEDIDO", solicitudes: solicitudes.join(",") }),
    );
    setVista("migrado");
  };

  const importar = async () => {
    setConfirmar(false);
    setTrabajando(true);
    setError("");
    setMensaje("");
    let pri = principal;
    let sec = secundario;
    const partes: string[] = [];
    try {
      let principalAplicado = false;

      if (pri.length > 0) {
        const r = await importarPedidoEquipos(aItemsPedido(pri), false);
        pri = conResultados(pri, r.lineas);
        setPrincipal(pri);
        if (contar(pri, "ERROR") > 0) {
          setValidado(false);
          setHoja("principal");
          setError("La hoja PRINCIPAL tiene errores: no se importó ningún dato. Revise los mensajes de la grilla.");
          return;
        }
        principalAplicado = r.aplicado;
        if (principalAplicado) {
          const omitidas = contar(pri, "OMITIDO");
          partes.push(`PRINCIPAL: ${contar(pri, "OK")} línea(s) cargada(s)${omitidas ? `, ${omitidas} omitida(s) por existir` : ""}`);
        }
      }

      // Regla del formulario antiguo: con la pestaña PRINCIPAL activa, si el pedido ya existía no se sigue con SECUNDARIO.
      if (hoja === "principal" && pri.length > 0 && !principalAplicado) {
        setValidado(false);
        setMensaje("Los datos ya existen en la BD. No se copian nuevamente.");
        await cargarMigrado(pri, sec);
        return;
      }

      if (sec.length > 0) {
        const r = await importarSecundarioEquipos(aItemsSecundario(sec), false);
        sec = conResultados(sec, r.lineas);
        setSecundario(sec);
        if (contar(sec, "ERROR") > 0) {
          setValidado(false);
          setHoja("secundario");
          setError(
            `${principalAplicado ? "La hoja PRINCIPAL ya se importó, pero " : ""}la hoja SECUNDARIO tiene errores y no se reasignó ningún site. Revise los mensajes de la grilla.`,
          );
          if (principalAplicado) await cargarMigrado(pri, sec);
          return;
        }
        if (r.aplicado) {
          const omitidas = contar(sec, "OMITIDO");
          partes.push(`SECUNDARIO: ${contar(sec, "OK")} línea(s) reasignada(s)${omitidas ? `, ${omitidas} omitida(s)` : ""}`);
        }
      }

      setValidado(false);
      setMensaje(partes.length > 0 ? `Datos migrados. ${partes.join(" · ")}.` : "No había datos nuevos para importar.");
      await cargarMigrado(pri, sec);
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

  const etiquetaHoja = (nombre: string, total: number, errores: number) => `${nombre} (${total})${errores ? ` · ${errores} con error` : ""}`;

  return (
    <div style={styles.root}>
      <div role="tablist" aria-label="Hoja del archivo" style={estiloPestanas.tabs}>
        {(["principal", "secundario"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={hoja === v}
            onClick={() => cambiarHoja(v)}
            style={{ ...estiloPestanas.tab, ...(hoja === v ? estiloPestanas.tabActive : null) }}
          >
            {v === "principal"
              ? etiquetaHoja("Principal", principal.length, resumen.errPrincipal)
              : etiquetaHoja("Secundario", secundario.length, resumen.errSecundario)}
          </button>
        ))}
      </div>

      <div style={styles.toolbar}>
        <input ref={entrada} type="file" accept=".xlsx,.xls" hidden onChange={(e) => void cargarArchivo(e.target.files?.[0])} />
        <button type="button" onClick={() => entrada.current?.click()} disabled={trabajando} style={styles.secondary}>
          Cargar Excel
        </button>
        <button type="button" onClick={() => setConfirmar(true)} disabled={trabajando || !validado} style={styles.primary}>
          {trabajando ? "Procesando…" : "Importar pedido"}
        </button>
        {tabs(
          ["previa", "migrado"],
          vista,
          (v) => (v === "previa" ? "Archivo" : "Datos migrados"),
          (v) => setVista(v as Vista),
          (v) => v === "migrado" && migrado.length === 0,
        )}
        <span style={styles.resumen}>{archivo ? `${archivo} · Principal ${principal.length} · Secundario ${secundario.length}` : "Cargue la plantilla de pedidos"}</span>
      </div>

      {hoja === "secundario" ? (
        <div style={{ ...styles.panel, fontSize: 12, color: "#475569" }}>
          Cód. 40: mueve esas unidades al site indicado. Cód. 10: reparte la cantidad entre sites (la suma por solicitud, material y lote debe ser igual a la existente).
          No modifica el stock. Cada material debe existir en la hoja PRINCIPAL. Al importar se procesa primero PRINCIPAL y luego SECUNDARIO.
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
        title="Importar pedido"
        message={`Se importarán ${resumen.nuevas} línea(s) nuevas de ${resumen.pedidos.length} pedido(s) (hoja PRINCIPAL, suma stock a Disponible)${
          secundario.length > 0 ? ` y luego se reasignarán ${secundario.length} línea(s) entre sites (hoja SECUNDARIO, no modifica el stock)` : ""
        }. ¿Continuar?`}
        confirmLabel="Importar"
        onConfirm={() => void importar()}
        onCancel={() => setConfirmar(false)}
      />
    </div>
  );
}
