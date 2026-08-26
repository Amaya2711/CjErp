export type ConciliacionBcpArchivoMuestra = {
  nombreArchivo: string;
  tipoContenido?: string;
  contenidoBase64?: string;
  tamanoBytes?: number;
  nombreHoja: string;
  numeroHoja: number;
  totalFilas: number;
  encabezados: string[];
  filas: string[][];
  filasMuestra: string[][];
  empresa?: string | null;
  cuenta?: string | null;
  moneda?: string | null;
  saldoContable?: string | null;
};

export type ConciliacionBcpAnalizarRequest = {
  archivos: ConciliacionBcpArchivoMuestra[];
  codigoBanco?: string | null;
};

export type ConciliacionBcpParametro = {
  nombre: string;
  tipo: string;
  esSalida: boolean;
  tieneDefault: boolean;
  esObligatorio: boolean;
};

export type ConciliacionBcpMapeo = {
  columnaOrigen: string;
  parametroDestino?: string | null;
  confianza: number;
  transformacion?: string | null;
  comentario?: string | null;
};

export type ConciliacionBcpArchivoAnalisis = {
  nombreArchivo: string;
  empresa?: string | null;
  cuenta?: string | null;
  moneda?: string | null;
  saldoContable?: string | null;
  idBanco?: number | null;
  codigoBanco?: string | null;
  idPlantillaBanco?: number | null;
  codigoPlantillaBanco?: string | null;
  nombreHoja: string;
  numeroHoja: number;
  totalFilas: number;
  filaCabecera?: number | null;
  filaDatos?: number | null;
  requiereRevision: boolean;
  observacion?: string | null;
  advertencias: string[];
  mapeos: ConciliacionBcpMapeo[];
  filasNormalizadas: Array<Record<string, unknown>>;
  debug?: {
    movimientosIaDetectados: number;
    filasNormalizadasFinales: number;
    motivoSinRegistros?: string | null;
  } | null;
};

export type ConciliacionBcpAnalizarResponse = {
  resumen?: string | null;
  puedeInsertar: boolean;
  motivosNoInsertables?: string[];
  parametrosProcedimiento: ConciliacionBcpParametro[];
  archivos: ConciliacionBcpArchivoAnalisis[];
  debug?: {
    promptAnalisis?: string | null;
    respuestaCrudaIa?: string | null;
    jsonInterpretadoIa?: string | null;
    archivosEnviados: Array<{
      nombreArchivo: string;
      tipoContenido?: string | null;
      tamanoBytes?: number | null;
      nombreHojaDetectadaCliente?: string | null;
      numeroHojaDetectadaCliente: number;
      totalFilasDetectadasCliente: number;
      encabezadosDetectadosCliente: string[];
      filasMuestraCliente: string[][];
    }>;
  } | null;
};

export type ConciliacionBcpInsertRequest = {
  filas: Array<Record<string, unknown>>;
  codigoBanco?: string | null;
};

export type ConciliacionBcpConciliarPlanillaRequest = {
  codigoBanco?: string | null;
  idCargo?: number | null;
  idEmpleado?: number | null;
  estados?: string | null;
  fechaInicio?: string | null;
  fechaFin?: string | null;
  idActivo?: number | null;
  idAreaFlujo?: number | null;
  idReferencia?: number | null;
  idCuentaContable?: number | null;
  esConciliado?: boolean | null;
};

export type ConciliacionBcpConciliarPlanillaRegistro = {
  idMovimientoBanco: number;
  idBanco?: number | null;
  codigoBanco?: string | null;
  empresa?: string | null;
  cuenta?: string | null;
  moneda?: string | null;
  fecha?: string | null;
  descripcionOperacion?: string | null;
  monto?: number | null;
  nroOperacion?: string | null;
  sucursalAgencia?: string | null;
  estadoConciliacion?: string | null;
  tipoMovimientoBanco?: string | null;
  idActivo?: boolean | null;
  idAreaFlujo?: number | null;
  idReferencia?: number | null;
  idCuentaContable?: number | null;
  idReglaContable?: number | null;
  esConciliado?: boolean | null;
  fechaConciliacion?: string | null;
  usuarioConciliacion?: string | null;
  observacionConciliacionMovimiento?: string | null;
  nombreAreaFlujo?: string | null;
  descripcionAreaFlujo?: string | null;
  codigoReferencia?: string | null;
  nombreReferencia?: string | null;
  descripcionReferencia?: string | null;
  codigoCuenta?: string | null;
  nombreCuenta?: string | null;
  cuentaContableTexto?: string | null;
  orden?: number | null;
  esPrincipal?: boolean | null;
  requiereComprobante?: boolean | null;
  aplicaConciliacion?: boolean | null;
  observacionReglaContable?: string | null;
  estadoConciliacionTexto?: string | null;
  estadoOperativoConciliacion?: string | null;
  resultadoConciliacion: string;
  tipoCoincidencia?: string | null;
  nroOperacionPlanilla?: string | null;
  cuentaPlanilla?: string | null;
  cuentaInterPlanilla?: string | null;
  clientePlanilla?: string | null;
  proyectoPlanilla?: string | null;
  sitePlanilla?: string | null;
  tipoTrabajoPlanilla?: string | null;
  tareaPlanilla?: string | null;
  responsablePlanilla?: string | null;
  comprobantePlanilla?: string | null;
  bancoPlanilla?: string | null;
  seriePlanilla?: string | null;
  detallePlanilla?: string | null;
  idOc?: string | null;
  correlativoPlanilla?: string | null;
  idRegistroPlanilla?: number | null;
  totalPlanillaBase?: number | null;
  totalPagar?: number | null;
  comentario?: string | null;
  observacionConciliacion?: string | null;
};

export type ConciliacionBcpActualizarComentarioRequest = {
  comentario?: string | null;
};

export type ConciliacionBcpActualizarClasificacionRequest = {
  idMovimientoBanco: number;
  idAreaFlujo: number;
  idReferencia: number;
  idCuentaContable: number;
  idReglaContable: number;
  observacionConciliacion?: string | null;
};

export type ConciliacionAreaFlujoOption = {
  idAreaFlujo: number;
  nombreAreaFlujo: string;
};

export type ConciliacionReferenciaOption = {
  idReferencia: number;
  codigoReferencia: string;
  nombreReferencia: string;
};

export type ConciliacionCuentaContableOption = {
  idCuentaContable: number;
  codigoCuenta: string;
  nombreCuenta: string;
  cuentaContableTexto: string;
};

export type ConciliacionReglaContableOption = {
  idReglaContable: number;
  idAreaFlujo: number;
  idReferencia: number;
  idCuentaContable: number;
  orden?: number | null;
  esPrincipal?: boolean | null;
  requiereComprobante?: boolean | null;
  aplicaConciliacion?: boolean | null;
  observacion?: string | null;
};

export type ConciliacionBcpClasificacionCombosResponse = {
  areasFlujo: ConciliacionAreaFlujoOption[];
  referencias: ConciliacionReferenciaOption[];
  cuentasContables: ConciliacionCuentaContableOption[];
  reglasContables: ConciliacionReglaContableOption[];
};

export type ConciliacionBcpConciliarPlanillaResponse = {
  resumen?: string | null;
  totalMovimientos: number;
  coincidenciasPorNroOperacion: number;
  coincidenciasPorCuenta: number;
  coincidenciasPorCuentaInter: number;
  sinCoincidencia: number;
  registros: ConciliacionBcpConciliarPlanillaRegistro[];
};

export type ConciliacionBcpExportRequest = {
  analisis: ConciliacionBcpAnalizarResponse;
};

export type ConciliacionBcpExportResumenArchivo = {
  archivoOrigen?: string | null;
  empresa?: string | null;
  cuenta?: string | null;
  moneda?: string | null;
  tipoCuenta?: string | null;
  saldoLiquido?: number | null;
  saldoNoDisponible?: number | null;
  saldoContable?: number | null;
  totalMovimientos: number;
  totalIngresos?: number | null;
  totalEgresos?: number | null;
  neto?: number | null;
};

export type ConciliacionBcpExportMovimiento = {
  idBanco?: number | null;
  codigoBanco?: string | null;
  idPlantillaBanco?: number | null;
  codigoPlantillaBanco?: string | null;
  empresa?: string | null;
  cuenta?: string | null;
  moneda?: string | null;
  fecha?: string | null;
  fechaValuta?: string | null;
  proveedor?: string | null;
  itemSistema?: string | null;
  descripcionOperacion?: string | null;
  referencia?: string | null;
  cdr?: string | null;
  modulo?: string | null;
  transaccion?: string | null;
  relacion?: string | null;
  monto?: number | null;
  sucursalAgencia?: string | null;
  nroOperacion?: string | null;
  numeroOperacion?: string | null;
  usuario?: string | null;
  archivoOrigen?: string | null;
};

export type ConciliacionBcpExportResponse = {
  nombreArchivo: string;
  archivosProcesados: number;
  totalMovimientos: number;
  totalIngresos: number;
  totalEgresos: number;
  neto: number;
  cantidadDuplicadosDetectados: number;
  insertable: boolean;
  resumenArchivos: ConciliacionBcpExportResumenArchivo[];
  movimientos: ConciliacionBcpExportMovimiento[];
};

export type ConciliacionBcpInsertResponse = {
  filasRecibidas: number;
  filasInsertadas: number;
  filasOmitidasDuplicadas: number;
  advertencias: string[];
  errores: string[];
};

export type ParsedConciliacionExcelFile = {
  id: string;
  file: File;
  nombreArchivo: string;
  nombreHoja: string;
  numeroHoja: number;
  rows: string[][];
  sampleRows: string[][];
  totalFilas: number;
  empresa?: string | null;
  cuenta?: string | null;
  moneda?: string | null;
  saldoContable?: string | null;
  clientError: string;
};
