import { useEffect, useMemo, useState } from "react";
import ConfirmDialog from "../../../../../components/base/ConfirmDialog";
import DataGridPro from "../../../../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../../../../components/datagrid/types";
import { FiltroOperativoLookup } from "../../../../../components/lookups/FiltroOperativoLookup";
import {
  listarCatalogosSolicitud,
  listarConsumiblesSolicitud,
  listarDisponiblesSolicitud,
  registrarSolicitudEquipos,
} from "../../../../../api/logisticaEquiposService";
import { listarUbigeos } from "../../../../../api/ubigeoService";
import type { FiltroOperativoItem, FiltroOperativoValue } from "../../../../../models/filtroOperativo";
import type { SolicitudCatalogo, SolicitudConsumible, SolicitudDisponible } from "../../../../../models/logisticaEquipos";
import type { UbigeoOption } from "../../../../../models/ubigeo";
import { getHttpErrorMessage } from "../../../../../utils/httpError";
import { estiloPestanas, ingresoStyles as styles } from "../ingreso/ingresoComun";

type Vista = "listado" | "consumible" | "adicional" | "resumen";
type Origen = "Listado" | "Consumible" | "Adicional";

type FilaDisponible = SolicitudDisponible & { cantSol: number };
type FilaConsumible = SolicitudConsumible & { cantSol: number };
/** Fila del Listado: líneas del mismo pedido y material agrupadas (como el sistema antiguo). */
type FilaGrupo = {
  clave: string;
  pedidoSap: string;
  codPap: string;
  nombreMaterial: string;
  unidadMedida: string;
  serie: string;
  cantPedido: number;
  utilizado: number;
  saldo: number;
  cantSol: number;
  idSite: string;
  nombreSite: string;
  nombreCliente: string;
  nombreProyecto: string;
  tipoTrabajo: string;
  lineas: SolicitudDisponible[];
};
/** Línea elegida para la solicitud (de cualquiera de las vistas). */
type Elegida = {
  clave: string;
  /** Línea de DetLogistica de origen; null = consumible que sale del stock disponible. */
  correlativo: string | null;
  codPap: string;
  material: string;
  serie: string;
  origen: string;
  fuente: Origen;
  idSite: string;
  correSite: number | null;
  cantidad: number;
};

const esAutoportante = (nombre?: string | null) => (nombre ?? "").toUpperCase().includes("AUTOPORTANTE");

/**
 * Pestaña "Solicitud". Primero se elige el sitio destino (filtro); recién entonces se habilita el resto, con las
 * vistas del formulario antiguo: Listado (equipos del site), Consumible, Adicional (equipos de otros sites) y Resumen.
 */
export default function SolicitudTab() {
  const [catalogos, setCatalogos] = useState<SolicitudCatalogo[]>([]);
  const [ubigeos, setUbigeos] = useState<UbigeoOption[]>([]);
  const [destino, setDestino] = useState<FiltroOperativoValue>({});
  const [vista, setVista] = useState<Vista>("listado");

  const [idSolicitante, setIdSolicitante] = useState<number | null>(null);
  const [formaEnvio, setFormaEnvio] = useState<number | null>(null);
  const [razonSocial, setRazonSocial] = useState<number | null>(null);
  const [ubigeo, setUbigeo] = useState("");
  const [direccion, setDireccion] = useState("");
  const [referencia, setReferencia] = useState("");
  const [entrega1, setEntrega1] = useState<number | null>(null);
  const [entrega2, setEntrega2] = useState<number | null>(null);

  const [listado, setListado] = useState<SolicitudDisponible[]>([]);
  const [consumibles, setConsumibles] = useState<SolicitudConsumible[]>([]);
  const [adicional, setAdicional] = useState<SolicitudDisponible[]>([]);
  const [textoConsumible, setTextoConsumible] = useState("");
  const [textoAdicional, setTextoAdicional] = useState("");
  const [elegidas, setElegidas] = useState<Record<string, Elegida>>({});
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [confirmar, setConfirmar] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listarCatalogosSolicitud(), listarUbigeos()])
      .then(([cat, ubi]) => {
        if (cancelled) return;
        setCatalogos(cat);
        setUbigeos(ubi);
      })
      .catch((err) => {
        if (!cancelled) setError(getHttpErrorMessage(err, "No se pudieron cargar los catálogos."));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const opciones = (tipo: SolicitudCatalogo["tipo"]) => catalogos.filter((c) => c.tipo === tipo);
  const sitio = destino.filtro;
  const tipoTrabajo = destino.tipoTrabajo?.tipoTrabajo ?? "";

  const cargarListado = async (f: FiltroOperativoItem) => {
    setCargando(true);
    try {
      setListado(
        await listarDisponiblesSolicitud({ idSite: f.idSite, correSite: f.correlativo, idCliente: f.idCliente, idProyecto: f.idProyecto }),
      );
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo consultar los equipos del site."));
    } finally {
      setCargando(false);
    }
  };

  const cargarConsumibles = async (texto?: string) => {
    setCargando(true);
    try {
      setConsumibles(await listarConsumiblesSolicitud(texto));
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo consultar los consumibles."));
    } finally {
      setCargando(false);
    }
  };

  const buscarAdicional = async () => {
    setError("");
    if (!textoAdicional.trim()) {
      setError("Escriba el código o nombre del material.");
      return;
    }
    setCargando(true);
    try {
      const data = await listarDisponiblesSolicitud({
        texto: textoAdicional,
        idSite: sitio?.idSite,
        correSite: sitio?.correlativo,
        idCliente: sitio?.idCliente,
        idProyecto: sitio?.idProyecto,
      });
      // Adicional = equipos que están en otros sites (los del propio site van en Listado).
      setAdicional(data.filter((d) => !d.mismoSite));
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo consultar."));
    } finally {
      setCargando(false);
    }
  };

  /** Al cambiar de sitio se descarta lo cargado y elegido, porque depende del destino. */
  const cambiarDestino = (valor: FiltroOperativoValue) => {
    const anterior = destino.filtro?.filtroKey;
    const nuevo = valor.filtro;
    setDestino(valor);
    if (anterior === nuevo?.filtroKey) return;
    setElegidas({});
    setListado([]);
    setAdicional([]);
    setConsumibles([]);
    setError("");
    setMensaje("");
    setVista("listado");
    if (nuevo) {
      void cargarListado(nuevo);
      void cargarConsumibles();
    }
  };

  const lista = useMemo(() => Object.values(elegidas), [elegidas]);
  const totalUnidades = lista.reduce((suma, e) => suma + e.cantidad, 0);
  const requiereAprobacion = lista.some(
    (e) => !sitio || e.correlativo === null || e.idSite !== sitio.idSite || e.correSite !== sitio.correlativo || esAutoportante(e.material),
  );

  const validarCantidad = (valor: unknown, maximo: number): number | null => {
    const cantidad = Number(valor);
    setError("");
    if (!Number.isInteger(cantidad) || cantidad < 0) {
      setError("Ingrese una cantidad entera (sin decimales) mayor o igual a cero.");
      return null;
    }
    if (cantidad > maximo) {
      setError(`La cantidad no puede superar el saldo (${maximo}).`);
      return null;
    }
    return cantidad;
  };

  const guardarElegida = (elegida: Elegida) =>
    setElegidas((actuales) => {
      const siguiente = { ...actuales };
      if (elegida.cantidad === 0) delete siguiente[elegida.clave];
      else siguiente[elegida.clave] = elegida;
      return siguiente;
    });

  const cambiarLinea = (fila: SolicitudDisponible, valor: unknown, fuente: Origen) => {
    const cantidad = validarCantidad(valor, fila.saldo);
    if (cantidad === null) return;
    guardarElegida({
      clave: fila.correlativo,
      correlativo: fila.correlativo,
      codPap: fila.codPap,
      material: fila.nombreMaterial ?? "",
      serie: fila.serie ?? "",
      origen: fila.nombreSite ?? fila.idSite ?? "",
      fuente,
      idSite: fila.idSite ?? "",
      correSite: fila.correSite ?? null,
      cantidad,
    });
  };

  const cambiarConsumible = (fila: SolicitudConsumible, valor: unknown) => {
    const cantidad = validarCantidad(valor, fila.disponible);
    if (cantidad === null) return;
    guardarElegida({
      clave: `C|${fila.codPap}`,
      correlativo: null,
      codPap: fila.codPap,
      material: fila.nombreMaterial ?? "",
      serie: "",
      origen: "Stock disponible",
      fuente: "Consumible",
      idSite: "",
      correSite: null,
      cantidad,
    });
  };

  const pedirConfirmacion = () => {
    setError("");
    setMensaje("");
    if (!sitio || !tipoTrabajo) return setError("Seleccione el sitio destino y el tipo de trabajo.");
    if (!idSolicitante) return setError("Debe seleccionar el solicitante.");
    if (!formaEnvio) return setError("Debe seleccionar el medio de envío.");
    if (!razonSocial) return setError("Debe seleccionar la razón social.");
    if (!ubigeo) return setError("Debe seleccionar el ubigeo.");
    if (!direccion.trim()) return setError("Debe ingresar la dirección de entrega.");
    if (!entrega1) return setError("Debe registrar al menos un responsable de entrega.");
    if (entrega2 && entrega2 === entrega1) return setError("Los responsables de entrega deben ser distintos.");
    if (lista.length === 0) return setError("No hay materiales con cantidad a solicitar.");
    setConfirmar(true);
  };

  const registrar = async () => {
    setConfirmar(false);
    if (!sitio || !idSolicitante || !formaEnvio || !razonSocial || !entrega1) return;
    setGuardando(true);
    try {
      const resultado = await registrarSolicitudEquipos({
        idCliente: sitio.idCliente,
        idProyecto: sitio.idProyecto,
        idSite: sitio.idSite,
        correSite: sitio.correlativo,
        tipoTrabajo,
        idSolicitante,
        formaEnvio,
        razonSocial,
        ubigeo,
        direccion: direccion.trim(),
        referencia: referencia.trim() || undefined,
        idConEntrega1: entrega1,
        idConEntrega2: entrega2,
        items: lista.map((e) => ({ correlativo: e.correlativo, codPap: e.codPap, cantidad: e.cantidad })),
      });
      const destinoTexto =
        resultado.idEstado === 9
          ? "Quedó pendiente de aprobación (pestaña x Aprobar)."
          : resultado.correoEnviado
            ? "Se envió el correo con el PDF."
            : `No se pudo enviar el correo: ${resultado.correoMensaje ?? "sin detalle"}.`;
      setMensaje(`Solicitud ${resultado.nroSolicitud} registrada. ${destinoTexto}`);
      setElegidas({});
      setAdicional([]);
      if (sitio) {
        void cargarListado(sitio);
        void cargarConsumibles();
      }
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo registrar la solicitud."));
    } finally {
      setGuardando(false);
    }
  };

  const gruposListado = useMemo<FilaGrupo[]>(() => {
    const grupos = new Map<string, FilaGrupo>();
    for (const d of listado) {
      const clave = `${d.pedidoSap ?? ""}|${d.codPap}`;
      let g = grupos.get(clave);
      if (!g) {
        g = {
          clave,
          pedidoSap: d.pedidoSap ?? "",
          codPap: d.codPap,
          nombreMaterial: d.nombreMaterial ?? "",
          unidadMedida: d.unidadMedida ?? "",
          serie: d.serie ?? "",
          cantPedido: 0,
          utilizado: 0,
          saldo: 0,
          cantSol: 0,
          idSite: d.idSite ?? "",
          nombreSite: d.nombreSite ?? "",
          nombreCliente: d.nombreCliente ?? "",
          nombreProyecto: d.nombreProyecto ?? "",
          tipoTrabajo: d.tipoTrabajo ?? "",
          lineas: [],
        };
        grupos.set(clave, g);
      } else if (g.serie !== (d.serie ?? "")) {
        g.serie = "(varias)";
      }
      g.cantPedido += d.cantSap;
      g.saldo += d.saldo;
      g.cantSol += elegidas[d.correlativo]?.cantidad ?? 0;
      g.lineas.push(d);
    }
    grupos.forEach((g) => {
      g.utilizado = g.cantPedido - g.saldo;
    });
    return Array.from(grupos.values());
  }, [listado, elegidas]);

  /** La cantidad pedida a un grupo se reparte entre sus líneas en orden (cada línea hasta su saldo). */
  const cambiarGrupo = (grupo: FilaGrupo, valor: unknown) => {
    const cantidad = validarCantidad(valor, grupo.saldo);
    if (cantidad === null) return;
    setElegidas((actuales) => {
      const siguiente = { ...actuales };
      let resto = cantidad;
      for (const fila of grupo.lineas) {
        delete siguiente[fila.correlativo];
        const toma = Math.min(resto, fila.saldo);
        if (toma <= 0) continue;
        resto -= toma;
        siguiente[fila.correlativo] = {
          clave: fila.correlativo,
          correlativo: fila.correlativo,
          codPap: fila.codPap,
          material: fila.nombreMaterial ?? "",
          serie: fila.serie ?? "",
          origen: fila.nombreSite ?? fila.idSite ?? "",
          fuente: "Listado",
          idSite: fila.idSite ?? "",
          correSite: fila.correSite ?? null,
          cantidad: toma,
        };
      }
      return siguiente;
    });
  };
  const filasAdicional = useMemo<FilaDisponible[]>(
    () => adicional.map((d) => ({ ...d, cantSol: elegidas[d.correlativo]?.cantidad ?? 0 })),
    [adicional, elegidas],
  );
  const filasConsumible = useMemo<FilaConsumible[]>(
    () => consumibles.map((c) => ({ ...c, cantSol: elegidas[`C|${c.codPap}`]?.cantidad ?? 0 })),
    [consumibles, elegidas],
  );

  const columnasLinea = useMemo<GridColumn<FilaDisponible>[]>(
    () => [
      {
        dataField: "cantSol",
        caption: "Cant. a solicitar",
        dataType: "number",
        width: 120,
        fixed: true,
        allowEditing: true,
        cellStyle: (v) => (Number(v) > 0 ? { fontWeight: 700, color: "#1F6F8B" } : { color: "#94A3B8" }),
      },
      { dataField: "saldo", caption: "Saldo", dataType: "number", width: 80 },
      { dataField: "codPap", caption: "Código", width: 110 },
      { dataField: "nombreMaterial", caption: "Material", width: 300 },
      { dataField: "unidadMedida", caption: "UM", width: 60 },
      { dataField: "serie", caption: "Serie", width: 140 },
      { dataField: "pedidoSap", caption: "Pedido SAP", width: 120 },
      { dataField: "idSite", caption: "Site origen", width: 100 },
      { dataField: "nombreSite", caption: "Desc. site origen", width: 200 },
      { dataField: "stockDisponible", caption: "Stock disp.", dataType: "number", width: 100 },
      { dataField: "nombreCliente", caption: "Cliente", width: 160 },
      { dataField: "nombreProyecto", caption: "Proyecto", width: 180 },
    ],
    [],
  );
  const columnasGrupo = useMemo<GridColumn<FilaGrupo>[]>(
    () => [
      {
        dataField: "cantSol",
        caption: "Cant. a solicitar",
        dataType: "number",
        width: 120,
        fixed: true,
        allowEditing: true,
        cellStyle: (v) => (Number(v) > 0 ? { fontWeight: 700, color: "#1F6F8B" } : { color: "#94A3B8" }),
      },
      { dataField: "pedidoSap", caption: "Pedido SAP", width: 120 },
      { dataField: "idSite", caption: "Site", width: 90 },
      { dataField: "nombreSite", caption: "Desc. site", width: 180 },
      { dataField: "codPap", caption: "Código", width: 110 },
      { dataField: "nombreMaterial", caption: "Material", width: 300 },
      { dataField: "unidadMedida", caption: "UM", width: 60 },
      { dataField: "cantPedido", caption: "Cant. pedido", dataType: "number", width: 110 },
      { dataField: "utilizado", caption: "Utilizado", dataType: "number", width: 90 },
      { dataField: "saldo", caption: "Saldo", dataType: "number", width: 90 },
      { dataField: "serie", caption: "Serie", width: 140 },
      { dataField: "nombreCliente", caption: "Cliente", width: 140 },
      { dataField: "nombreProyecto", caption: "Proyecto", width: 160 },
      { dataField: "tipoTrabajo", caption: "Trabajo", width: 110 },
    ],
    [],
  );
  const columnasConsumible = useMemo<GridColumn<FilaConsumible>[]>(
    () => [
      {
        dataField: "cantSol",
        caption: "Cant. a solicitar",
        dataType: "number",
        width: 120,
        fixed: true,
        allowEditing: true,
        cellStyle: (v) => (Number(v) > 0 ? { fontWeight: 700, color: "#1F6F8B" } : { color: "#94A3B8" }),
      },
      { dataField: "disponible", caption: "Disponible", dataType: "number", width: 100 },
      { dataField: "codPap", caption: "Código", width: 110 },
      { dataField: "nombreMaterial", caption: "Material", width: 360 },
      { dataField: "unidadMedida", caption: "UM", width: 60 },
    ],
    [],
  );
  const columnasResumen = useMemo<GridColumn<Elegida>[]>(
    () => [
      { dataField: "cantidad", caption: "Cantidad", dataType: "number", width: 90 },
      { dataField: "fuente", caption: "Vista", width: 100 },
      { dataField: "codPap", caption: "Código", width: 110 },
      { dataField: "material", caption: "Material", width: 300 },
      { dataField: "serie", caption: "Serie", width: 140 },
      { dataField: "origen", caption: "Origen", width: 220 },
    ],
    [],
  );

  const pestanas: { key: Vista; label: string }[] = [
    { key: "listado", label: "Listado" },
    { key: "consumible", label: "Consumible" },
    { key: "adicional", label: "Adicional" },
    { key: "resumen", label: `Resumen (${lista.length})` },
  ];

  const gridLineas = (filas: FilaDisponible[], fuente: Origen, vacio: string) => (
    <DataGridPro<FilaDisponible>
      dataSource={filas}
      columns={columnasLinea}
      keyExpr="correlativo"
      height="fill"
      loading={cargando}
      noDataText={vacio}
      stateStoringKey={`logistica-solicitud-${fuente.toLowerCase()}`}
      editing={{
        allowUpdating: true,
        onCellChanged: ({ key, field, value }) => {
          if (field !== "cantSol") return;
          const fila = filas.find((d) => d.correlativo === key);
          if (fila) cambiarLinea(fila, value, fuente);
        },
      }}
      showSearchPanel={false}
      rowAlternation={false}
      rowPadding="3px 8px"
      paging={{ pageSize: 100, pageSizes: [50, 100, 250] }}
    />
  );

  return (
    <div style={{ ...styles.root, overflow: "auto" }}>
      <div style={styles.panel}>
        <strong style={{ fontSize: 13 }}>Destino</strong>
        <div style={{ flex: 1, minWidth: 320 }}>
          <FiltroOperativoLookup value={destino} onChange={cambiarDestino} showOt={false} showTarea={false} />
        </div>
      </div>

      {!sitio ? (
        <div role="status" style={{ ...styles.panel, color: "#475569", fontSize: 13 }}>
          Seleccione el sitio destino (cliente - proyecto - site) para habilitar la solicitud.
        </div>
      ) : null}

      {error ? <div role="alert" style={styles.error}>{error}</div> : null}
      {mensaje ? <div role="status" style={styles.ok}>{mensaje}</div> : null}

      <div
        // Toda la solicitud permanece deshabilitada (sin foco ni clics) hasta elegir el sitio.
        inert={!sitio}
        aria-disabled={!sitio}
        style={{ ...styles.root, minHeight: 0, opacity: sitio ? 1 : 0.45 }}
      >
        <div role="tablist" aria-label="Vistas de la solicitud" style={estiloPestanas.tabs}>
          {pestanas.map((p) => (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={vista === p.key}
              onClick={() => setVista(p.key)}
              style={{ ...estiloPestanas.tab, ...(vista === p.key ? estiloPestanas.tabActive : null) }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {vista === "listado" ? (
          <>
            <div style={styles.toolbar}>
              <span style={styles.resumen}>
                Equipos del site agrupados por pedido y material: {gruposListado.length}. Escriba la cantidad en cada fila.
              </span>
              <button type="button" onClick={() => sitio && void cargarListado(sitio)} disabled={cargando || !sitio} style={styles.secondary}>
                Actualizar
              </button>
            </div>
            <div style={{ height: 380, display: "flex", flexDirection: "column" }}>
              <DataGridPro<FilaGrupo>
                dataSource={gruposListado}
                columns={columnasGrupo}
                keyExpr="clave"
                height="fill"
                loading={cargando}
                noDataText="El site no tiene equipos validados con saldo."
                stateStoringKey="logistica-solicitud-listado"
                editing={{
                  allowUpdating: true,
                  onCellChanged: ({ key, field, value }) => {
                    if (field !== "cantSol") return;
                    const grupo = gruposListado.find((g) => g.clave === key);
                    if (grupo) cambiarGrupo(grupo, value);
                  },
                }}
                showSearchPanel={false}
                rowAlternation={false}
                rowPadding="3px 8px"
                paging={{ pageSize: 100, pageSizes: [50, 100, 250] }}
              />
            </div>
          </>
        ) : null}

        {vista === "consumible" ? (
          <>
            <div style={styles.toolbar}>
              <input
                value={textoConsumible}
                onChange={(e) => setTextoConsumible(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void cargarConsumibles(textoConsumible);
                }}
                placeholder="Código o nombre del consumible"
                style={{ ...styles.input, minWidth: 260 }}
              />
              <button type="button" onClick={() => void cargarConsumibles(textoConsumible)} disabled={cargando} style={styles.secondary}>
                Buscar
              </button>
              <span style={styles.resumen}>Consumibles con stock: {consumibles.length}</span>
            </div>
            <div style={{ height: 380, display: "flex", flexDirection: "column" }}>
              <DataGridPro<FilaConsumible>
                dataSource={filasConsumible}
                columns={columnasConsumible}
                keyExpr="codPap"
                height="fill"
                loading={cargando}
                noDataText="No hay consumibles con stock disponible."
                stateStoringKey="logistica-solicitud-consumible"
                editing={{
                  allowUpdating: true,
                  onCellChanged: ({ key, field, value }) => {
                    if (field !== "cantSol") return;
                    const fila = consumibles.find((c) => c.codPap === key);
                    if (fila) cambiarConsumible(fila, value);
                  },
                }}
                showSearchPanel={false}
                rowAlternation={false}
                rowPadding="3px 8px"
                paging={{ pageSize: 100, pageSizes: [50, 100, 250] }}
              />
            </div>
          </>
        ) : null}

        {vista === "adicional" ? (
          <>
            <div style={styles.toolbar}>
              <input
                value={textoAdicional}
                onChange={(e) => setTextoAdicional(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void buscarAdicional();
                }}
                placeholder="Código o nombre del material"
                style={{ ...styles.input, minWidth: 260 }}
              />
              <button type="button" onClick={() => void buscarAdicional()} disabled={cargando} style={styles.secondary}>
                Buscar en otros sites
              </button>
              <span style={styles.resumen}>Equipos en otros sites: {adicional.length}. Pasan a aprobación.</span>
            </div>
            <div style={{ height: 380, display: "flex", flexDirection: "column" }}>
              {gridLineas(filasAdicional, "Adicional", "Busque un material para ver los equipos disponibles en otros sites.")}
            </div>
          </>
        ) : null}

        {vista === "resumen" ? (
          <>
            <div style={styles.panel}>
              <select value={idSolicitante ?? ""} onChange={(e) => setIdSolicitante(e.target.value ? Number(e.target.value) : null)} style={styles.input}>
                <option value="">Solicitante…</option>
                {opciones("SOLICITANTE").map((o) => (
                  <option key={o.id} value={o.id}>{o.nombre}</option>
                ))}
              </select>
              <select value={formaEnvio ?? ""} onChange={(e) => setFormaEnvio(e.target.value ? Number(e.target.value) : null)} style={styles.input}>
                <option value="">Medio de envío…</option>
                {opciones("FORMA_ENVIO").map((o) => (
                  <option key={o.id} value={o.id}>{o.nombre}</option>
                ))}
              </select>
              <select value={razonSocial ?? ""} onChange={(e) => setRazonSocial(e.target.value ? Number(e.target.value) : null)} style={styles.input}>
                <option value="">Razón social…</option>
                {opciones("ENTREGA").map((o) => (
                  <option key={o.id} value={o.id}>{o.nombre}</option>
                ))}
              </select>
              <select value={ubigeo} onChange={(e) => setUbigeo(e.target.value)} style={styles.input}>
                <option value="">Ubigeo…</option>
                {ubigeos.map((u) => (
                  <option key={u.idUbigeo} value={String(u.idUbigeo)}>{u.nombreUbigeo}</option>
                ))}
              </select>
              <input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Dirección de entrega" style={{ ...styles.input, minWidth: 260, flex: 1 }} />
              <input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Referencia" style={{ ...styles.input, minWidth: 200 }} />
              <select value={entrega1 ?? ""} onChange={(e) => setEntrega1(e.target.value ? Number(e.target.value) : null)} style={styles.input}>
                <option value="">Responsable de entrega 1…</option>
                {opciones("ENTREGA").map((o) => (
                  <option key={o.id} value={o.id}>{o.nombre}{o.documento ? ` (${o.documento})` : ""}</option>
                ))}
              </select>
              <select value={entrega2 ?? ""} onChange={(e) => setEntrega2(e.target.value ? Number(e.target.value) : null)} style={styles.input}>
                <option value="">Responsable de entrega 2 (opcional)…</option>
                {opciones("ENTREGA").map((o) => (
                  <option key={o.id} value={o.id}>{o.nombre}{o.documento ? ` (${o.documento})` : ""}</option>
                ))}
              </select>
            </div>

            <div style={styles.toolbar}>
              <strong style={{ fontSize: 13 }}>Resumen de la solicitud</strong>
              <span style={styles.resumen}>
                {lista.length} línea(s), {totalUnidades} unidad(es).{" "}
                {lista.length > 0 ? (requiereAprobacion ? "Pasará a x Aprobar." : "No requiere aprobación (va directo a despacho).") : ""}
              </span>
              <button type="button" onClick={pedirConfirmacion} disabled={guardando} style={styles.primary}>
                {guardando ? "Grabando…" : "Grabar solicitud"}
              </button>
            </div>
            <div style={{ height: 300, display: "flex", flexDirection: "column" }}>
              <DataGridPro<Elegida>
                dataSource={lista}
                columns={columnasResumen}
                keyExpr="clave"
                height="fill"
                noDataText="Aún no hay materiales con cantidad. Elíjalos en Listado, Consumible o Adicional."
                showSearchPanel={false}
                rowAlternation={false}
                rowPadding="3px 8px"
                paging={false}
              />
            </div>
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmar}
        title="Confirmar"
        message={`¿Desea realizar la solicitud de ${lista.length} línea(s) (${totalUnidades} unidad(es))?`}
        confirmLabel="Solicitar"
        onConfirm={() => void registrar()}
        onCancel={() => setConfirmar(false)}
      />
    </div>
  );
}
