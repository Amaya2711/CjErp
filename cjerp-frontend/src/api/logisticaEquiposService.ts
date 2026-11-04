import httpClient from "./httpClient";
import type {
  SolicitudHistorial,
  SolicitudHistorialConsulta,
  CampoConsulta,
  CampoGrabarResultado,
  CampoItem,
  CampoLinea,
  IngresoCambioEstado,
  IngresoCambioEstadoResultado,
  IngresoCargaResultado,
  IngresoCatalogo,
  IngresoConsulta,
  IngresoGuia,
  IngresoGuiaResultado,
  IngresoLinea,
  IngresoSerieMasivaItem,
  LogisticaMaterial,
  LogisticaStock,
  LogisticaStockDescuadre,
  PedidoItem,
  SecundarioItem,
  SolicitudAprobar,
  SolicitudAprobarResultado,
  SolicitudRechazar,
  SolicitudCatalogo,
  SolicitudConsumible,
  SolicitudPrevisualizar,
  SolicitudDetalle,
  SolicitudDisponible,
  SolicitudPorAprobar,
  SolicitudPorAprobarConsulta,
  SolicitudRegistrar,
  SolicitudRegistrarResultado,
} from "../models/logisticaEquipos";

export async function listarMaterialesLogistica(texto?: string, soloActivos = true) {
  return await httpClient.get<LogisticaMaterial[]>("/logistica/equipos/materiales", {
    params: { texto: texto?.trim() || undefined, soloActivos },
  });
}

export async function consultarStockLogistica(texto?: string, soloConSaldo = true) {
  return await httpClient.get<LogisticaStock[]>("/logistica/equipos/stock", {
    params: { texto: texto?.trim() || undefined, soloConSaldo },
  });
}

export async function consultarDescuadresStock() {
  return await httpClient.get<LogisticaStockDescuadre[]>("/logistica/equipos/stock/descuadres");
}

// ---- Ingreso de equipos: Pedido, x Recepcionar, Series y x Validar ----

export async function listarCatalogosIngreso() {
  return await httpClient.get<IngresoCatalogo[]>("/logistica/equipos/ingreso/catalogos");
}

export async function consultarIngreso(consulta: IngresoConsulta) {
  return await httpClient.post<IngresoLinea[]>("/logistica/equipos/ingreso/consultar", consulta);
}

export async function recepcionarEquipos(request: IngresoCambioEstado) {
  return await httpClient.post<IngresoCambioEstadoResultado>("/logistica/equipos/ingreso/recepcionar", request);
}

export async function validarEquipos(request: IngresoCambioEstado) {
  return await httpClient.post<IngresoCambioEstadoResultado>("/logistica/equipos/ingreso/validar", request);
}

export async function actualizarSerieEquipo(request: { correlativo: string; serie?: string; comentario?: string }) {
  return await httpClient.post<Record<string, never>>("/logistica/equipos/ingreso/serie", request);
}

export async function importarSeriesEquipos(items: IngresoSerieMasivaItem[], soloValidar: boolean) {
  return await httpClient.post<IngresoCargaResultado>("/logistica/equipos/ingreso/series/importar", { items, soloValidar }, { timeout: 120000 });
}

export async function actualizarGuiaEquipos(request: IngresoGuia) {
  return await httpClient.post<IngresoGuiaResultado>("/logistica/equipos/ingreso/guia", request);
}

export async function importarPedidoEquipos(items: PedidoItem[], soloValidar: boolean) {
  return await httpClient.post<IngresoCargaResultado>("/logistica/equipos/pedidos/importar", { items, soloValidar }, { timeout: 300000 });
}

export async function importarSecundarioEquipos(items: SecundarioItem[], soloValidar: boolean) {
  return await httpClient.post<IngresoCargaResultado>("/logistica/equipos/pedidos/importar-secundario", { items, soloValidar }, { timeout: 300000 });
}

// ---- Solicitud y x Aprobar ----

export async function listarCatalogosSolicitud() {
  return await httpClient.get<SolicitudCatalogo[]>("/logistica/equipos/solicitud/catalogos");
}

export async function listarDisponiblesSolicitud(params: {
  texto?: string;
  idSite?: string;
  correSite?: number;
  idCliente?: number;
  idProyecto?: number;
  /** Permite cancelar la consulta (por ejemplo, al escribir otra búsqueda). */
  signal?: AbortSignal;
}) {
  // El backend permite 120 s (commandTimeout); el límite global de 30 s cortaba la búsqueda en otros sites.
  return await httpClient.get<SolicitudDisponible[]>("/logistica/equipos/solicitud/disponibles", {
    timeout: 120000,
    signal: params.signal,
    params: {
      texto: params.texto?.trim() || undefined,
      idSite: params.idSite || undefined,
      correSite: params.correSite,
      idCliente: params.idCliente,
      idProyecto: params.idProyecto,
    },
  });
}

export async function listarConsumiblesSolicitud(texto?: string, signal?: AbortSignal) {
  return await httpClient.get<SolicitudConsumible[]>("/logistica/equipos/solicitud/consumibles", {
    signal,
    params: { texto: texto?.trim() || undefined },
  });
}

/** PDF de vista previa (marca de agua "SIN VALIDEZ") de la solicitud que se quiere grabar. No registra nada. */
export async function previsualizarSolicitudEquipos(request: SolicitudPrevisualizar) {
  return await httpClient.post<Blob>("/logistica/equipos/solicitud/previsualizar", request, { responseType: "blob", timeout: 60000 });
}

export async function registrarSolicitudEquipos(request: SolicitudRegistrar) {
  return await httpClient.post<SolicitudRegistrarResultado>("/logistica/equipos/solicitud/registrar", request, { timeout: 120000 });
}

export async function listarHistorialSolicitudes(consulta: SolicitudHistorialConsulta) {
  return await httpClient.post<SolicitudHistorial[]>("/logistica/equipos/solicitud/historial", consulta, { timeout: 120000 });
}

export async function listarSolicitudesPorAprobar(consulta: SolicitudPorAprobarConsulta) {
  return await httpClient.post<SolicitudPorAprobar[]>("/logistica/equipos/solicitud/por-aprobar", consulta);
}

export async function listarDetalleSolicitud(nroSolicitud: string) {
  return await httpClient.get<SolicitudDetalle[]>(`/logistica/equipos/solicitud/${encodeURIComponent(nroSolicitud)}/detalle`);
}

// ---- x Campo ----

export async function consultarCampo(consulta: CampoConsulta) {
  return await httpClient.post<CampoLinea[]>("/logistica/equipos/campo/consultar", consulta);
}

export async function grabarCampo(items: CampoItem[]) {
  return await httpClient.post<CampoGrabarResultado>("/logistica/equipos/campo/grabar", { items }, { timeout: 120000 });
}

export async function rechazarSolicitudesEquipos(request: SolicitudRechazar) {
  return await httpClient.post<SolicitudAprobarResultado>("/logistica/equipos/solicitud/rechazar", request, { timeout: 120000 });
}

export async function aprobarSolicitudesEquipos(request: SolicitudAprobar) {
  return await httpClient.post<SolicitudAprobarResultado>("/logistica/equipos/solicitud/aprobar", request, { timeout: 120000 });
}
