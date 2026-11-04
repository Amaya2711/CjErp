import { Trash2 } from "lucide-react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ConfirmDialog from "../../../../../components/base/ConfirmDialog";
import DataGridPro from "../../../../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../../../../components/datagrid/types";
import { FiltroOperativoLookup } from "../../../../../components/lookups/FiltroOperativoLookup";
import {
  listarCatalogosSolicitud,
  listarConsumiblesSolicitud,
  listarDisponiblesSolicitud,
  previsualizarSolicitudEquipos,
  registrarSolicitudEquipos,
} from "../../../../../api/logisticaEquiposService";
import { listarUbigeos } from "../../../../../api/ubigeoService";
import type { FiltroOperativoItem, FiltroOperativoValue } from "../../../../../models/filtroOperativo";
import type { SolicitudCatalogo, SolicitudConsumible, SolicitudDisponible } from "../../../../../models/logisticaEquipos";
import type { UbigeoOption } from "../../../../../models/ubigeo";
import { getAuthUser } from "../../../../../utils/authStorage";
import { getHttpErrorMessage } from "../../../../../utils/httpError";
import { AccionesPaginaContext } from "../accionesPagina";
import EntregaDialog from "./EntregaDialog";
import CampoBuscable, { type OpcionBuscable } from "./CampoBuscable";
import { ingresoStyles as styles } from "../ingreso/ingresoComun";

type Origen = "Listado" | "Consumible" | "Adicional";

type FilaDisponible = SolicitudDisponible & { cantSol: number };
type FilaConsumible = SolicitudConsumible & { cantSol: number };
/** Línea elegida para la solicitud (de cualquiera de las vistas). */
type FilaUnica = {
  clave: string;
  fuente: Origen;
  codPap: string;
  nombreMaterial: string;
  unidadMedida: string;
  serie: string;
  origen: string;
  disponible: number;
  estado: string;
  cantSol: number;
  /** 0 = Listado, 1 = Consumible, 2 = Adicional: el Listado siempre va primero. */
  prioridad: number;
  // Datos de la línea de origen (vacíos en los consumibles).
  pedidoSap?: string | null;
  idSite?: string | null;
  region?: string | null;
  cantSap?: number;
  utilizado?: number;
  saldoLinea?: number;
  stockDisponible?: number;
  cantBloq?: number;
  nroGuia?: string | null;
  nombreCliente?: string | null;
  nombreProyecto?: string | null;
  tipoTrabajo?: string | null;
  idSolicitud?: string | null;
  nroEnvio?: number | null;
};
type Elegida = {
  clave: string;
  /** Línea de DetLogistica de origen; null = consumible que sale del stock disponible. */
  correlativo: string | null;
  codPap: string;
  material: string;
  unidadMedida?: string;
  pedidoSap?: string | null;
  serie: string;
  origen: string;
  fuente: Origen;
  idSite: string;
  correSite: number | null;
  cantidad: number;
};

/** Palabras del texto buscado (sin importar el orden): "tubo abra" encuentra TUBO ABRAZADERA y ABRAZADERA TUBO. */
const palabrasDe = (texto: string) => texto.toUpperCase().split(/\s+/).filter(Boolean);

/** Stock libre de un material: su stock menos lo elegido (sin grabar) en las demás líneas del mismo material. */
const libreDe = (reservado: Map<string, number>, codPap: string, stock: number, propia: number) =>
  stock - ((reservado.get(codPap) ?? 0) - propia);

/** Palabras de un nombre sin tildes ni mayúsculas y en orden alfabético ("PEREZ JUAN" = "Juan Pérez"). */
const claveNombre = (nombre?: string | null) =>
  (nombre ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");

/** Solicitante del catálogo que corresponde al usuario conectado (PV: se compara por nombre; el catálogo no trae el IdEmpleadoCj). */
const solicitanteDelUsuario = (catalogo: SolicitudCatalogo[]): SolicitudCatalogo | null => {
  const usuario = getAuthUser();
  const clave = claveNombre(usuario?.nombreEmpleado ?? usuario?.empleado ?? usuario?.nombre);
  if (!clave) return null;
  const coincidencias = catalogo.filter((c) => c.tipo === "SOLICITANTE" && claveNombre(c.nombre) === clave);
  return coincidencias.length === 1 ? coincidencias[0] : null;
};

const insignia = { borderRadius: 999, padding: "3px 10px", fontSize: 12, whiteSpace: "nowrap" as const };

/** Código del ubigeo que se graba en la solicitud: el original de dbo.Ubigeo.CodUbigeo (texto); respaldo: el entero. */
const codigoUbigeo = (u: UbigeoOption) => (u.codUbigeo?.trim() ? u.codUbigeo.trim() : String(u.idUbigeo));

const esAutoportante = (nombre?: string | null) => (nombre ?? "").toUpperCase().includes("AUTOPORTANTE");

/**
 * Pestaña "Solicitud". Primero se elige el sitio destino (filtro); recién entonces se habilita el resto, con las
 * pantalla única "Pedido único": busca por nombre en equipos del site, consumibles y equipos de otros sites, muestra lo
 * seleccionado a la par y graba la solicitud con los datos de entrega.
 */
export default function SolicitudTab() {
  const slotAcciones = useContext(AccionesPaginaContext);
  const [entregaAbierta, setEntregaAbierta] = useState(false);
  const [errorEntrega, setErrorEntrega] = useState("");
  const [catalogos, setCatalogos] = useState<SolicitudCatalogo[]>([]);
  const [ubigeos, setUbigeos] = useState<UbigeoOption[]>([]);
  const [destino, setDestino] = useState<FiltroOperativoValue>({});
  const [textoUnico, setTextoUnico] = useState("");

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
  const [elegidas, setElegidas] = useState<Record<string, Elegida>>({});
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  /** Muestra el Listado del site aunque no se haya tipeado nada (a demanda). Con texto, el Listado siempre se filtra y se muestra. */
  const [verListado, setVerListado] = useState(true);
  const [avisoAdicional, setAvisoAdicional] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([listarCatalogosSolicitud(), listarUbigeos()])
      .then(([cat, ubi]) => {
        if (cancelled) return;
        setCatalogos(cat);
        setUbigeos(ubi);
        // Solicitante por defecto: el del usuario conectado (se reconoce por su nombre; si no está en la lista, se elige a mano).
        const propio = solicitanteDelUsuario(cat);
        if (propio) {
          setIdSolicitante((actual) => actual ?? propio.id);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(getHttpErrorMessage(err, "No se pudieron cargar los catálogos."));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const opciones = (tipo: SolicitudCatalogo["tipo"]) => catalogos.filter((c) => c.tipo === tipo);
  const opcionesEntrega = useMemo<OpcionBuscable[]>(
    () =>
      catalogos
        .filter((c) => c.tipo === "ENTREGA")
        .map((c) => ({ id: String(c.id), etiqueta: `${c.nombre ?? ""}${c.documento ? ` (${c.documento})` : ""}` })),
    [catalogos],
  );
  const opcionesSolicitante = useMemo<OpcionBuscable[]>(
    () => catalogos.filter((c) => c.tipo === "SOLICITANTE").map((c) => ({ id: String(c.id), etiqueta: c.nombre ?? "" })),
    [catalogos],
  );
  // Si el catálogo de ubigeos llega con el mismo código en todas las filas (columna no reconocida), no se puede elegir ninguno.
  const ubigeosSinCodigo = useMemo(() => ubigeos.length > 1 && new Set(ubigeos.map(codigoUbigeo)).size < ubigeos.length, [ubigeos]);
  const opcionesUbigeo = useMemo<OpcionBuscable[]>(
    () => ubigeos.map((u) => ({ id: codigoUbigeo(u), etiqueta: u.nombreUbigeo })),
    [ubigeos],
  );
  const sitio = destino.filtro;
  const tipoTrabajo = destino.tipoTrabajo?.tipoTrabajo ?? "";

  /** Cada consulta cancela la anterior de su tipo: una búsqueda vieja ya no sigue en el servidor ni muestra su error. */
  const enCurso = useRef<Record<string, AbortController | undefined>>({});
  const ejecutarUltima = async <T,>(
    clave: string,
    tarea: (signal: AbortSignal) => Promise<T>,
    alResolver: (r: T) => void,
    mensajeError: string,
    /** Si se informa, el error se entrega aquí (aviso discreto) en lugar del mensaje rojo de la página. */
    alFallar?: (mensaje: string) => void,
  ) => {
    enCurso.current[clave]?.abort();
    const control = new AbortController();
    enCurso.current[clave] = control;
    setCargando(true);
    try {
      const resultado = await tarea(control.signal);
      if (!control.signal.aborted) alResolver(resultado);
    } catch (err) {
      if (!control.signal.aborted) {
        // Se antepone qué consulta falló: un "timeout of …ms exceeded" suelto parecía un error de otra acción (p. ej. de grabar).
        const detalle = getHttpErrorMessage(err, "");
        const texto = detalle ? `${mensajeError} ${detalle}` : mensajeError;
        if (alFallar) alFallar(texto);
        else setError(texto);
      }
    } finally {
      if (enCurso.current[clave] === control) {
        enCurso.current[clave] = undefined;
        if (Object.values(enCurso.current).every((c) => !c)) setCargando(false);
      }
    }
  };

  const cargarListado = (f: FiltroOperativoItem) =>
    ejecutarUltima(
      "listado",
      (signal) => listarDisponiblesSolicitud({ idSite: f.idSite, correSite: f.correlativo, idCliente: f.idCliente, idProyecto: f.idProyecto, signal }),
      setListado,
      "No se pudo consultar los equipos del site.",
    );

  const cargarConsumibles = (texto?: string) =>
    ejecutarUltima("consumibles", (signal) => listarConsumiblesSolicitud(texto, signal), setConsumibles, "No se pudo consultar los consumibles.");

  const buscarAdicional = (textoBusqueda: string) =>
    ejecutarUltima(
      "adicional",
      (signal) =>
        listarDisponiblesSolicitud({
          texto: textoBusqueda,
          idSite: sitio?.idSite,
          correSite: sitio?.correlativo,
          idCliente: sitio?.idCliente,
          idProyecto: sitio?.idProyecto,
          signal,
        }),
      // Adicional = equipos que están en otros sites (los del propio site van en Listado).
      (data) => {
        setAvisoAdicional("");
        setAdicional(data.filter((d) => !d.mismoSite));
      },
      "No se pudo consultar.",
      // La búsqueda en otros sites es opcional y puede tardar: su fallo no debe tapar el resto de la pantalla.
      () => setAvisoAdicional("Otros sites (Adicional): la consulta tardó demasiado. Pulse Buscar para reintentar o afine el texto."),
    );

  /** Al cambiar de sitio se descarta lo cargado y elegido, porque depende del destino. */
  const cambiarDestino = (valor: FiltroOperativoValue) => {
    const anterior = destino.filtro?.filtroKey;
    const nuevo = valor.filtro;
    setDestino(valor);
    if (anterior === nuevo?.filtroKey) return;
    enCurso.current.adicional?.abort();
    setAvisoAdicional("");
    setElegidas({});
    setListado([]);
    setAdicional([]);
    setConsumibles([]);
    setError("");
    setMensaje("");
    setTextoUnico("");
    if (nuevo) {
      void cargarListado(nuevo);
      void cargarConsumibles();
    }
  };

  const lista = useMemo(() => Object.values(elegidas), [elegidas]);
  /** Unidades ya elegidas en esta solicitud por material (aún sin grabar): se descuentan del stock que se muestra y se permite pedir. */
  const reservadoPorCod = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const e of lista) mapa.set(e.codPap, (mapa.get(e.codPap) ?? 0) + e.cantidad);
    return mapa;
  }, [lista]);
  /** Stock que queda libre para una línea: el stock del material menos lo elegido en las demás líneas del mismo material. */
  const stockLibre = (codPap: string, stock: number, propia: number) => libreDe(reservadoPorCod, codPap, stock, propia);

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
    if (fuente === "Listado" && fila.idEstado !== 2) {
      setError("Solo se pueden solicitar equipos en estado 2 (validado).");
      return;
    }
    // Tope efectivo: lo que queda de la línea y el stock disponible del material (como el sistema antiguo).
    const cantidad = validarCantidad(
      valor,
      Math.max(0, Math.min(fila.saldo, stockLibre(fila.codPap, fila.stockDisponible, elegidas[fila.correlativo]?.cantidad ?? 0))),
    );
    if (cantidad === null) return;
    guardarElegida({
      clave: fila.correlativo,
      correlativo: fila.correlativo,
      codPap: fila.codPap,
      material: fila.nombreMaterial ?? "",
      unidadMedida: fila.unidadMedida ?? "",
      pedidoSap: fila.pedidoSap,
      serie: fila.serie ?? "",
      origen: fila.nombreSite ?? fila.idSite ?? "",
      fuente,
      idSite: fila.idSite ?? "",
      correSite: fila.correSite ?? null,
      cantidad,
    });
  };

  const cambiarConsumible = (fila: SolicitudConsumible, valor: unknown) => {
    const cantidad = validarCantidad(
      valor,
      Math.max(0, stockLibre(fila.codPap, fila.disponible, elegidas[`C|${fila.codPap}`]?.cantidad ?? 0)),
    );
    if (cantidad === null) return;
    guardarElegida({
      clave: `C|${fila.codPap}`,
      correlativo: null,
      codPap: fila.codPap,
      material: fila.nombreMaterial ?? "",
      unidadMedida: fila.unidadMedida ?? "",
      serie: "",
      origen: "Stock disponible",
      fuente: "Consumible",
      idSite: "",
      correSite: null,
      cantidad,
    });
  };

  /** Los datos de entrega se editan en un popup: si falta alguno al grabar, se abre con el motivo. */
  const pedirEntrega = (motivo: string) => {
    setErrorEntrega(motivo);
    setEntregaAbierta(true);
  };
  const entregaCompleta = Boolean(
    formaEnvio && razonSocial && ubigeo && direccion.trim() && entrega1 && !(entrega2 && entrega2 === entrega1),
  );

  const pedirConfirmacion = () => {
    setError("");
    setMensaje("");
    if (!sitio || !tipoTrabajo) return setError("Seleccione el sitio destino y el tipo de trabajo.");
    if (lista.length === 0) return setError("Debe haber al menos un material en \"Materiales seleccionados\".");
    if (!idSolicitante) return setError("Debe seleccionar el solicitante.");
    if (!formaEnvio) return pedirEntrega("Debe seleccionar el medio de envío.");
    if (!razonSocial) return pedirEntrega("Debe seleccionar la razón social.");
    if (!ubigeo) return pedirEntrega("Debe seleccionar el ubigeo.");
    if (!direccion.trim()) return pedirEntrega("Debe ingresar la dirección de entrega.");
    if (!entrega1) return pedirEntrega("Debe registrar al menos un responsable de entrega.");
    if (entrega2 && entrega2 === entrega1) return pedirEntrega("Los responsables de entrega deben ser distintos.");
    setErrorEntrega("");
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
          : resultado.correoEnProceso
            ? "El correo con el PDF se está enviando en segundo plano."
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

  const filasListado = useMemo<FilaDisponible[]>(
    () => listado.map((d) => ({ ...d, cantSol: elegidas[d.correlativo]?.cantidad ?? 0 })),
    [listado, elegidas],
  );
  const filasAdicional = useMemo<FilaDisponible[]>(
    () => adicional.map((d) => ({ ...d, cantSol: elegidas[d.correlativo]?.cantidad ?? 0 })),
    [adicional, elegidas],
  );
  const filasConsumible = useMemo<FilaConsumible[]>(
    () => consumibles.map((c) => ({ ...c, cantSol: elegidas[`C|${c.codPap}`]?.cantidad ?? 0 })),
    [consumibles, elegidas],
  );

  /** Pedido único: busca en consumibles y en otros sites (el listado del site se filtra en pantalla). */
  const buscarUnico = async () => {
    // Los SP buscan la frase completa; se les envía la palabra más larga y aquí se exigen todas las palabras.
    const texto = palabrasDe(textoUnico).sort((a, b) => b.length - a.length)[0] ?? "";
    setError("");
    if (texto.length < 3) {
      // Con menos de 3 letras no se consulta al servidor (es costoso); solo se filtra lo ya cargado.
      enCurso.current.adicional?.abort();
      setAdicional([]);
      return;
    }
    setAvisoAdicional("");
    await Promise.all([cargarConsumibles(texto), buscarAdicional(texto)]);
  };

  const filasUnicas = useMemo<FilaUnica[]>(() => {
    const palabras = palabrasDe(textoUnico);
    const texto = textoUnico.trim();
    // Sin texto se muestra por defecto el Listado del site (sus equipos); al tipear el material se suman Consumible y Adicional.
    const sinTexto = texto.length < 2;
    const coincide = (campos: string) => {
      const base = campos.toUpperCase();
      return palabras.every((p) => base.includes(p));
    };
    const coincideLinea = (d: SolicitudDisponible) => coincide(`${d.codPap} ${d.nombreMaterial ?? ""} ${d.serie ?? ""}`);
    const deLinea = (d: FilaDisponible, fuente: Origen): FilaUnica => ({
      clave: d.correlativo,
      fuente,
      codPap: d.codPap,
      nombreMaterial: d.nombreMaterial ?? "",
      unidadMedida: d.unidadMedida ?? "",
      serie: d.serie ?? "",
      origen: d.nombreSite ?? d.idSite ?? "",
      disponible: Math.max(0, Math.min(d.saldo, libreDe(reservadoPorCod, d.codPap, d.stockDisponible, d.cantSol))),
      estado: d.nomEstado ?? "",
      cantSol: d.cantSol,
      prioridad: fuente === "Listado" ? 0 : 2,
      pedidoSap: d.pedidoSap,
      idSite: d.idSite,
      region: d.region,
      cantSap: d.cantSap,
      utilizado: d.utilizado,
      saldoLinea: d.saldo,
      stockDisponible: d.stockDisponible - (reservadoPorCod.get(d.codPap) ?? 0),
      cantBloq: d.cantBloq,
      nroGuia: d.nroGuia,
      nombreCliente: d.nombreCliente,
      nombreProyecto: d.nombreProyecto,
      tipoTrabajo: d.tipoTrabajo,
      idSolicitud: d.idSolicitud,
      nroEnvio: d.nroEnvio,
    });
    if (sinTexto) return verListado ? filasListado.map((d) => deLinea(d, "Listado")) : [];
    return [
      ...filasListado.filter(coincideLinea).map((d) => deLinea(d, "Listado")),
      ...filasConsumible.filter((c) => coincide(`${c.codPap} ${c.nombreMaterial ?? ""}`)).map<FilaUnica>((c) => ({
        clave: `C|${c.codPap}`,
        fuente: "Consumible",
        codPap: c.codPap,
        nombreMaterial: c.nombreMaterial ?? "",
        unidadMedida: c.unidadMedida ?? "",
        serie: "",
        origen: "Stock disponible",
        disponible: Math.max(0, libreDe(reservadoPorCod, c.codPap, c.disponible, c.cantSol)),
        estado: "",
        cantSol: c.cantSol,
        prioridad: 1,
        stockDisponible: c.disponible - (reservadoPorCod.get(c.codPap) ?? 0),
      })),
      ...filasAdicional.filter(coincideLinea).map((d) => deLinea(d, "Adicional")),
    ];
  }, [filasListado, filasConsumible, filasAdicional, textoUnico, reservadoPorCod, verListado]);

  // Búsqueda automática al tipear (sin Enter): consumibles y otros sites; el listado del site se filtra en pantalla.
  useEffect(() => {
    const texto = textoUnico.trim();
    if (!sitio || texto.length < 2) return;
    const espera = window.setTimeout(() => void buscarUnico(), 700);
    return () => window.clearTimeout(espera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textoUnico, sitio?.filtroKey]);

  /** Coincidencias por origen del pedido (las mismas filas que muestra la grilla). */
  const contadores = useMemo(() => {
    const cuenta = (fuente: Origen) => filasUnicas.filter((f) => f.fuente === fuente).length;
    return [
      { etiqueta: "Listado", cantidad: cuenta("Listado"), fondo: "#D1FAE5", color: "#065F46", ayuda: "Equipos del site" },
      { etiqueta: "Consumible", cantidad: cuenta("Consumible"), fondo: "#DBEAFE", color: "#1E40AF", ayuda: "Consumibles con stock" },
      { etiqueta: "Adicional", cantidad: cuenta("Adicional"), fondo: "#FEF3C7", color: "#92400E", ayuda: "Equipos de otros sites (pasan a aprobación)" },
    ];
  }, [filasUnicas]);

  const columnasUnico = useMemo<GridColumn<FilaUnica>[]>(
    () => [
      // Oculta: ordena por defecto Listado → Consumible → Adicional.
      { dataField: "prioridad", caption: "Prioridad", dataType: "number", visible: false, sortOrder: "asc", allowGrouping: false, allowEditing: false },
      {
        dataField: "cantSol",
        caption: "Cant. a solicitar",
        dataType: "number",
        width: 120,
        fixed: true,
        allowEditing: true,
        cellStyle: (v) => (Number(v) > 0 ? { fontWeight: 700, color: "#1F6F8B" } : { color: "#94A3B8" }),
      },
      { dataField: "fuente", caption: "Origen del pedido", width: 120, allowEditing: false },
      { dataField: "disponible", caption: "Máx. solicitable", dataType: "number", width: 110, allowEditing: false },
      { dataField: "codPap", caption: "Código", width: 110, allowEditing: false },
      { dataField: "nombreMaterial", caption: "Material", width: 320, allowEditing: false },
      { dataField: "unidadMedida", caption: "UM", width: 60, allowEditing: false },
      { dataField: "serie", caption: "Serie", width: 140, allowEditing: false },
      { dataField: "origen", caption: "Site origen", width: 200, allowEditing: false },
      { dataField: "estado", caption: "Estado", width: 140, allowEditing: false },
      { dataField: "pedidoSap", caption: "Pedido SAP", width: 120, allowEditing: false },
      { dataField: "idSite", caption: "Site", width: 90, allowEditing: false },
      { dataField: "region", caption: "Región", width: 90, allowEditing: false },
      { dataField: "cantSap", caption: "Cant. pedido", dataType: "number", width: 100, allowEditing: false },
      { dataField: "utilizado", caption: "Utilizado", dataType: "number", width: 90, allowEditing: false },
      { dataField: "saldoLinea", caption: "Saldo línea", dataType: "number", width: 100, allowEditing: false },
      {
        dataField: "stockDisponible",
        allowEditing: false,
        caption: "Saldo (stock)",
        dataType: "number",
        width: 100,
        cellStyle: (v) => (Number(v) < 0 ? { background: "#FED7AA" } : v !== null && v !== undefined && Number(v) === 0 ? { background: "#F0E68C" } : {}),
      },
      { dataField: "cantBloq", caption: "Cant. bloq.", dataType: "number", width: 100, allowEditing: false },
      { dataField: "nroGuia", caption: "NroGuia", width: 110, allowEditing: false },
      { dataField: "nombreCliente", caption: "Cliente", width: 140, allowEditing: false },
      { dataField: "nombreProyecto", caption: "Proyecto", width: 160, allowEditing: false },
      { dataField: "tipoTrabajo", caption: "Trabajo", width: 110, allowEditing: false },
      { dataField: "idSolicitud", caption: "IdSolicitud", width: 120, allowEditing: false },
      { dataField: "nroEnvio", caption: "NroEnvio", dataType: "number", width: 90, allowEditing: false },
    ],
    [],
  );

  const quitarElegida = (clave: string) =>
    setElegidas((actuales) => {
      const siguiente = { ...actuales };
      delete siguiente[clave];
      return siguiente;
    });

  const columnasResumen = useMemo<GridColumn<Elegida>[]>(
    () => [
      {
        dataField: "clave",
        caption: "",
        width: 44,
        alignment: "center",
        fixed: true,
        allowSorting: false,
        allowFiltering: false,
        allowHeaderFilter: false,
        allowGrouping: false,
        allowEditing: false,
        cellRender: (_v, fila) => (
          <button
            type="button"
            title="Quitar esta línea de la solicitud"
            aria-label={`Quitar ${fila.material}`}
            onClick={(e) => {
              e.stopPropagation();
              quitarElegida(fila.clave);
            }}
            style={{ background: "transparent", color: "#B91C1C", border: 0, padding: 2, cursor: "pointer", display: "inline-flex", alignItems: "center" }}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        ),
      },
      { dataField: "cantidad", caption: "Cantidad", dataType: "number", width: 90 },
      { dataField: "fuente", caption: "Origen del pedido", width: 120 },
      { dataField: "codPap", caption: "Código", width: 110 },
      { dataField: "material", caption: "Material", width: 300 },
      { dataField: "serie", caption: "Serie", width: 140 },
      { dataField: "origen", caption: "Origen", width: 220 },
    ],
    [],
  );

  const nombreDe = (opciones: OpcionBuscable[], id: string | number | null) =>
    id === null || id === "" ? "" : (opciones.find((o) => o.id === String(id))?.etiqueta ?? "");
  // Datos en 2 columnas de 4 filas (se llenan por columna).
  const referenciaEntrega: { rotulo: string; valor: string }[] = [
    { rotulo: "Medio de envío", valor: opciones("FORMA_ENVIO").find((o) => o.id === formaEnvio)?.nombre ?? "" },
    { rotulo: "Razón social", valor: nombreDe(opcionesEntrega, razonSocial) },
    { rotulo: "Ubigeo", valor: nombreDe(opcionesUbigeo, ubigeo) },
    { rotulo: "Dirección", valor: direccion.trim() },
    { rotulo: "Referencia", valor: referencia.trim() },
    { rotulo: "Responsable 1", valor: nombreDe(opcionesEntrega, entrega1) },
    { rotulo: "Responsable 2", valor: nombreDe(opcionesEntrega, entrega2) },
  ];

  // Vista previa del PDF (marca de agua "SIN VALIDEZ") de lo que se va a grabar; no registra nada.
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const [generandoPrevia, setGenerandoPrevia] = useState(false);
  const cerrarVistaPrevia = () => {
    if (vistaPrevia) URL.revokeObjectURL(vistaPrevia);
    setVistaPrevia(null);
  };
  const contacto = (id: number | null) =>
    id === null ? undefined : catalogos.find((c) => c.tipo === "ENTREGA" && c.id === id);
  const previsualizar = async () => {
    if (!sitio) return;
    setError("");
    setGenerandoPrevia(true);
    try {
      const pdf = await previsualizarSolicitudEquipos({
        cabecera: {
          idSite: sitio.idSite,
          nombreSite: sitio.nombreSite,
          nombreCliente: sitio.nombreCliente,
          nombreProyecto: sitio.nombreProyecto,
          tipoTrabajo,
          solicitante: nombreDe(opcionesSolicitante, idSolicitante),
          formaEnvio: opciones("FORMA_ENVIO").find((o) => o.id === formaEnvio)?.nombre ?? "",
          razonSocial: nombreDe(opcionesEntrega, razonSocial),
          ubigeo: nombreDe(opcionesUbigeo, ubigeo),
          direccion: direccion.trim(),
          referencia: referencia.trim(),
          entrega1: contacto(entrega1)?.nombre ?? "",
          entrega2: contacto(entrega2)?.nombre ?? "",
          entrega1Documento: contacto(entrega1)?.documento ?? "",
          entrega1Telefono: contacto(entrega1)?.telefono ?? "",
          entrega2Documento: contacto(entrega2)?.documento ?? "",
          entrega2Telefono: contacto(entrega2)?.telefono ?? "",
        },
        detalle: lista.map((e) => ({
          pedidoSap: e.pedidoSap ?? "",
          codPap: e.codPap,
          nombreMaterial: e.material,
          unidadMedida: e.unidadMedida ?? "",
          cantSap: e.cantidad,
          serie: e.serie,
          nombreSiteOrigen: e.origen,
        })),
      });
      if (vistaPrevia) URL.revokeObjectURL(vistaPrevia);
      setVistaPrevia(URL.createObjectURL(new Blob([pdf], { type: "application/pdf" })));
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo generar la vista previa."));
    } finally {
      setGenerandoPrevia(false);
    }
  };

  const botonVistaPrevia = (
    <button
      type="button"
      onClick={() => void previsualizar()}
      disabled={generandoPrevia || !sitio || lista.length === 0}
      title={!sitio ? "Seleccione el sitio destino." : lista.length === 0 ? "No hay materiales seleccionados." : "Ver el PDF antes de grabar (sin validez)"}
      style={styles.secondary}
    >
      {generandoPrevia ? "Generando…" : "Vista previa"}
    </button>
  );

  const botonGrabar = (
    <button
      type="button"
      onClick={pedirConfirmacion}
      disabled={guardando}
      title="Valida los datos y pide confirmación antes de grabar."
      style={styles.primary}
    >
      {guardando ? "Grabando…" : "Grabar solicitud"}
    </button>
  );

  return (
    <div style={{ ...styles.root, overflow: "auto" }}>
      {/* Acción de la página: va en el encabezado (si la página lo ofrece); si no, en línea. */}
      {slotAcciones ? createPortal(<>{botonVistaPrevia}{botonGrabar}</>, slotAcciones) : <>{botonVistaPrevia}{botonGrabar}</>}

      <div style={{ display: "flex", gap: 12, alignItems: "stretch", flexWrap: "wrap" }}>
        <div style={{ ...styles.panel, flex: "1 1 420px", minWidth: 0 }}>
          <strong style={{ fontSize: 13 }}>Destino</strong>
          <div style={{ flex: 1, minWidth: 320 }}>
            <FiltroOperativoLookup value={destino} onChange={cambiarDestino} showOt={false} showTarea={false} />
          </div>
        </div>
        <div
          // El solicitante también espera a que se elija el sitio; por defecto es el empleado del usuario conectado.
          inert={!sitio}
          aria-disabled={!sitio}
          style={{ ...styles.panel, flex: "0 1 auto", opacity: sitio ? 1 : 0.45 }}
        >
          <strong style={{ fontSize: 13 }}>Solicitante</strong>
          <CampoBuscable
            opciones={opcionesSolicitante}
            value={idSolicitante === null ? null : String(idSolicitante)}
            onChange={(id) => setIdSolicitante(id === null ? null : Number(id))}
            placeholder="Digite el nombre del solicitante…"
            style={{ ...styles.input, minWidth: 260 }}
          />
        </div>
        <div
          // Los datos de entrega también esperan a que se elija el sitio.
          inert={!sitio}
          aria-disabled={!sitio}
          style={{ ...styles.panel, flex: "2 1 460px", minWidth: 0, opacity: sitio ? 1 : 0.45, alignItems: "flex-start", gap: 16, flexWrap: "nowrap" }}
        >
          {/* 1.ª columna: título y estado */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "0 0 150px" }}>
            <strong style={{ fontSize: 13 }}>Datos de entrega</strong>
            <span style={{ fontSize: 12, fontWeight: 600, color: entregaCompleta ? "#047857" : "#B45309" }}>
              {entregaCompleta ? "Completos" : "Incompletos"}
            </span>
            <button type="button" onClick={() => setEntregaAbierta(true)} style={styles.secondary}>
              {entregaCompleta ? "Ver / editar" : "Completar"}
            </button>
          </div>
          {/* 2.ª y 3.ª columnas: datos registrados (4 filas por columna) */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gridTemplateRows: "repeat(4, auto)",
              gridAutoFlow: "column",
              columnGap: 16,
              fontSize: 12,
              color: "#334155",
              lineHeight: 1.5,
            }}
          >
            {referenciaEntrega.map((r) => (
              <div key={r.rotulo} style={{ overflowWrap: "anywhere" }}>
                <span style={{ color: "#64748B" }}>{r.rotulo}:</span> {r.valor || "—"}
              </div>
            ))}
          </div>
        </div>
      </div>

      {entregaAbierta ? (
        <EntregaDialog
          inicial={{ formaEnvio, razonSocial, ubigeo, direccion, referencia, entrega1, entrega2 }}
          formasEnvio={opciones("FORMA_ENVIO")}
          opcionesEntrega={opcionesEntrega}
          opcionesUbigeo={opcionesUbigeo}
          error={errorEntrega}
          aviso={ubigeosSinCodigo ? "El catálogo de ubigeos no trae códigos distintos por fila; no se puede elegir el ubigeo. Avise a Sistemas." : undefined}
          onAceptar={(d) => {
            setFormaEnvio(d.formaEnvio);
            setRazonSocial(d.razonSocial);
            setUbigeo(d.ubigeo);
            setDireccion(d.direccion);
            setReferencia(d.referencia);
            setEntrega1(d.entrega1);
            setEntrega2(d.entrega2);
            setEntregaAbierta(false);
            setErrorEntrega("");
          }}
        />
      ) : null}

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
        {(
          <div style={{ display: "flex", gap: 12, alignItems: "stretch", flexWrap: "wrap", flex: 1, minHeight: 0 }}>
            <section style={{ flex: "3 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }} aria-label="Materiales a solicitar">
            <div style={styles.toolbar}>
              <input
                value={textoUnico}
                onChange={(e) => setTextoUnico(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void buscarUnico();
                }}
                placeholder="Tipee el nombre, código o serie del material…"
                autoFocus
                style={{ ...styles.input, minWidth: 280 }}
              />
              <button type="button" onClick={() => void buscarUnico()} style={styles.secondary}>
                Buscar
              </button>
              <label style={styles.check} title="Muestra u oculta los equipos del Listado del site cuando no se ha tipeado un material.">
                <input type="checkbox" checked={verListado} onChange={(e) => setVerListado(e.target.checked)} />
                Mostrar Listado
              </label>
              {textoUnico.trim().length < 2 && filasUnicas.length === 0 ? (
                <span style={styles.resumen}>
                  {cargando ? "Cargando el Listado del site…" : "Sin equipos en Listado. Tipee el material (mín. 2 letras) para buscar consumibles y otros sites."}
                </span>
              ) : (
                <div role="status" aria-label="Coincidencias por origen" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: "auto" }}>
                  {contadores.map((c) => (
                    <span key={c.etiqueta} style={{ ...insignia, background: c.fondo, color: c.color }} title={c.ayuda}>
                      {c.etiqueta}: <strong>{c.cantidad}</strong>
                    </span>
                  ))}
                  <span style={{ ...insignia, background: "#E2E8F0", color: "#0F172A" }}>
                    Total: <strong>{filasUnicas.length}</strong>
                  </span>
                  {cargando ? <span style={styles.resumen}>Buscando en otros sites…</span> : null}
                  {avisoAdicional && !cargando ? <span style={{ fontSize: 12, color: "#B45309" }}>{avisoAdicional}</span> : null}
                </div>
              )}
            </div>
            <div style={{ flex: 1, minHeight: 240, display: "flex", flexDirection: "column" }}>
              <DataGridPro<FilaUnica>
                dataSource={filasUnicas}
                columns={columnasUnico}
                keyExpr="clave"
                height="fill"
                // Con filas ya encontradas (p. ej. Listado) se muestran; la búsqueda en otros sites puede seguir en curso.
                loading={cargando && filasUnicas.length === 0}
                noDataText={textoUnico.trim().length < 2 ? verListado ? "El site no tiene equipos en Listado. Tipee el material a solicitar." : "Tipee el material a solicitar o marque \"Mostrar Listado\"." : "Sin coincidencias."}
                stateStoringKey="logistica-solicitud-unico-v3"
                // Filas cuyo origen es Listado (equipos del site): verde tenue; el foco se marca un poco más oscuro.
                rowBackground={(fila, enfocada) => (fila.fuente === "Listado" ? (enfocada ? "#D1FAE5" : "#ECFDF5") : undefined)}
                editing={{
                  allowUpdating: true,
                  editOnClick: true,
                  onCellChanged: ({ key, field, value }) => {
                    if (field !== "cantSol") return;
                    const fila = filasUnicas.find((f) => f.clave === key);
                    if (!fila) return;
                    if (fila.fuente === "Consumible") {
                      const c = consumibles.find((x) => `C|${x.codPap}` === key);
                      if (c) cambiarConsumible(c, value);
                    } else {
                      const d = (fila.fuente === "Listado" ? listado : adicional).find((x) => x.correlativo === key);
                      if (d) cambiarLinea(d, value, fila.fuente);
                    }
                  },
                }}
                showSearchPanel={false}
                rowAlternation={false}
                rowPadding="3px 8px"
                paging={{ pageSize: 100, pageSizes: [50, 100, 250] }}
              />
            </div>
            </section>

            <section
              style={{ flex: "2 1 380px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}
              aria-label="Materiales seleccionados"
            >
              <div style={styles.toolbar}>
                <strong style={{ fontSize: 13 }}>Materiales seleccionados</strong>
                <span style={styles.resumen}>
                  {lista.length} línea(s), {totalUnidades} unidad(es).{" "}
                  {lista.length > 0 ? (requiereAprobacion ? "Pasará a x Aprobar." : "Va directo a despacho.") : ""}
                </span>
              </div>
              <div style={{ flex: 1, minHeight: 240, display: "flex", flexDirection: "column" }}>
                <DataGridPro<Elegida>
                  dataSource={lista}
                  columns={columnasResumen}
                  keyExpr="clave"
                  height="fill"
                  noDataText="Aún no hay materiales seleccionados."
                  showSearchPanel={false}
                  rowAlternation={false}
                  rowPadding="3px 8px"
                  rowBackground={(fila) => (fila.fuente === "Listado" ? "#ECFDF5" : undefined)}
                  paging={false}
                />
              </div>
            </section>
          </div>
        )}
      </div>

      {vistaPrevia ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }} role="presentation">
          <div role="dialog" aria-modal="true" aria-label="Vista previa de la solicitud" style={{ width: "100%", maxWidth: 900, height: "92vh", background: "#fff", borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 10, boxShadow: "0 12px 30px rgba(15,23,42,0.18)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <strong style={{ fontSize: 15 }}>Vista previa de la solicitud (sin validez)</strong>
              <button type="button" onClick={cerrarVistaPrevia} style={styles.primary}>Cerrar</button>
            </div>
            <iframe title="Vista previa de la solicitud" src={vistaPrevia} style={{ flex: 1, border: "1px solid #CBD5E1", borderRadius: 8 }} />
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmar}
        title="Grabar solicitud"
        message={`¿Desea grabar la solicitud de ${lista.length} línea(s) (${totalUnidades} unidad(es))? Se descontará el stock y se enviará el correo.`}
        confirmLabel="Grabar"
        onConfirm={() => void registrar()}
        onCancel={() => setConfirmar(false)}
      />
    </div>
  );
}
