export type LogisticaMaterial = {
  codPap: string;
  nombreMaterial?: string | null;
  unidadMedida?: string | null;
  codEstado?: number | null;
};

/** Saldos por bucket. Cada bucket = unidades pendientes de la siguiente etapa. */
export type LogisticaStock = {
  codPap: string;
  nombreMaterial?: string | null;
  unidadMedida?: string | null;
  stock: number;
  disponible: number;
  bloqueado: number;
  solicitado: number;
  aprobado: number;
  despachado: number;
  enviado: number;
  campo: number;
  cruce: number;
  cierre: number;
  excedente: number;
  folio: number;
  culminadas: number;
  recepcionado: number;
  validado: number;
  observada: number;
};

export type LogisticaStockDescuadre = {
  codPap: string;
  nombreMaterial?: string | null;
  bucket: string;
  enMaterialStock: number;
  enStockSaldo: number;
  diferencia: number;
  tipo: string;
};

// ---- Ingreso de equipos: Pedido, x Recepcionar, Series y x Validar ----

export type IngresoEtapa = "PEDIDO" | "RECEPCION" | "VALIDACION" | "SERIE";

export type IngresoCatalogo = { tipo: string; correlativo: number; nombre?: string | null };

/** Línea de DetLogistica con los nombres de material, cliente, proyecto, site y estado. */
export type IngresoLinea = {
  pedidoSap: string;
  idSolicitud?: string | null;
  region?: string | null;
  guia?: string | null;
  fecIngreso?: string | null;
  fechaCreacion?: string | null;
  idSite?: string | null;
  correSite?: number | null;
  tipoTrabajo?: string | null;
  observacion?: string | null;
  posicion?: string | null;
  serie?: string | null;
  codPap?: string | null;
  centro?: string | null;
  almacen?: string | null;
  lote?: string | null;
  correlativo: string;
  idEstado: number;
  idCliente?: number | null;
  idProyecto?: number | null;
  comentario?: string | null;
  nombreMaterial?: string | null;
  unidadMedida?: string | null;
  nombreCliente?: string | null;
  nombreProyecto?: string | null;
  nombreSite?: string | null;
  nomEstado?: string | null;
  cantSap: number;
  idUbicacion?: number | null;
  fecha?: string | null;
};

export type IngresoConsulta = {
  etapa: IngresoEtapa;
  pedidos?: string;
  solicitudes?: string;
  fechaIni?: string;
  fechaFin?: string;
  idUbicacion?: number | null;
};

export type IngresoCambioEstado = {
  items: Array<{ correlativo: string; idEstado: number | null }>;
  idZonaAlmacen?: number | null;
};

export type IngresoCambioEstadoResultado = { actualizadas: number; pedidosCompletos: number };

export type IngresoSerieMasivaItem = { pedido: string; codPap: string; site: string; serie: string };

export type IngresoGuia = {
  pedidos: string[];
  guia: string;
  fecIngreso: string;
  reasignar: boolean;
  idCliente?: number;
  idProyecto?: number;
  tipoTrabajo?: string;
  idSite?: string;
  correSite?: number;
};

export type IngresoGuiaResultado = { pedidosActualizados: number; lineasActualizadas: number };

/** Línea de la hoja PRINCIPAL del Excel de pedidos. */
export type PedidoItem = {
  fila: number;
  pedidoSap: string;
  idSolicitud: string;
  site: string;
  descSite: string;
  solicitante: string;
  codPap: string;
  descripcion: string;
  cantSolicitada: number;
  cantSap: number;
  centro: string;
  almOrigen: string;
  lote: string;
  obsSolic: string;
  region: string;
  oc: string;
  posicion: string;
  cliente: string;
  proyecto: string;
  tipoTrabajo: string;
  fecIngreso: string;
  guia: string;
};

export type IngresoLineaResultado = { fila: number; estado: "OK" | "OMITIDO" | "ERROR"; mensaje?: string | null };

export type IngresoCargaResultado = { aplicado: boolean; lineas: IngresoLineaResultado[] };

/** Línea de la hoja SECUNDARIO del Excel de pedidos (reasignación entre sites). */
export type SecundarioItem = {
  fila: number;
  idMaterial: string;
  idSolicitud: string;
  site: string;
  descSite: string;
  descripcion: string;
  cantidad: number;
  lote: string;
};
