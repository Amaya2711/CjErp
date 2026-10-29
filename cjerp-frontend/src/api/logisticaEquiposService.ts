import httpClient from "./httpClient";
import type {
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
  SolicitudCatalogo,
  SolicitudConsumible,
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
}) {
  return await httpClient.get<SolicitudDisponible[]>("/logistica/equipos/solicitud/disponibles", {
    params: {
      texto: params.texto?.trim() || undefined,
      idSite: params.idSite || undefined,
      correSite: params.correSite,
      idCliente: params.idCliente,
      idProyecto: params.idProyecto,
    },
  });
}

export async function listarConsumiblesSolicitud(texto?: string) {
  return await httpClient.get<SolicitudConsumible[]>("/logistica/equipos/solicitud/consumibles", {
    params: { texto: texto?.trim() || undefined },
  });
}

export async function registrarSolicitudEquipos(request: SolicitudRegistrar) {
  return await httpClient.post<SolicitudRegistrarResultado>("/logistica/equipos/solicitud/registrar", request, { timeout: 120000 });
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

export async function aprobarSolicitudesEquipos(request: SolicitudAprobar) {
  return await httpClient.post<SolicitudAprobarResultado>("/logistica/equipos/solicitud/aprobar", request, { timeout: 120000 });
}
