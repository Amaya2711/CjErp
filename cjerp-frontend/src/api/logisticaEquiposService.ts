import httpClient from "./httpClient";
import type {
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
