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
};

export type ConciliacionBcpAnalizarRequest = {
  archivos: ConciliacionBcpArchivoMuestra[];
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
};

export type ConciliacionBcpConciliarPlanillaRequest = {
  idCargo?: number | null;
  idEmpleado?: number | null;
  estados?: string | null;
  fechaInicio?: string | null;
  fechaFin?: string | null;
  idActivo?: number | null;
};

export type ConciliacionBcpConciliarPlanillaRegistro = {
  idMovimientoBanco: number;
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
  detallePlanilla?: string | null;
  correlativoPlanilla?: string | null;
  idRegistroPlanilla?: number | null;
  totalPagar?: number | null;
  comentario?: string | null;
  observacionConciliacion?: string | null;
};

export type ConciliacionBcpActualizarComentarioRequest = {
  comentario?: string | null;
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
  empresa?: string | null;
  cuenta?: string | null;
  moneda?: string | null;
  fecha?: string | null;
  fechaValuta?: string | null;
  proveedor?: string | null;
  itemSistema?: string | null;
  descripcionOperacion?: string | null;
  monto?: number | null;
  sucursalAgencia?: string | null;
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
  clientError: string;
};
