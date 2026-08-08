export type ArrendamientosFila = {
  id?: number | null;
  codigo?: string | null;
  nombre?: string | null;
  detalle?: string | null;
  estado?: string | null;
  tipoPago?: string | null;
  conceptoPago?: string | null;
  moneda?: string | null;
  monedaOperacion?: string | null;
  monedaAlquiler?: string | null;
  monedaMantenimiento?: string | null;
  monedaCochera?: string | null;
  monedaGarantia?: string | null;
  importe?: number | null;
  importeAlquiler?: number | null;
  importeMantenimiento?: number | null;
  importeCochera?: number | null;
  importeTransferido?: number | null;
  comisionBancaria?: number | null;
  itf?: number | null;
  importeTotalCargado?: number | null;
  importeOriginal?: number | null;
  importeConvertido?: number | null;
  diferenciaCambio?: number | null;
  tipoCambio?: number | null;
  saldo?: number | null;
  fecha?: string | null;
  fechaContabilizacion?: string | null;
  fechaInicio?: string | null;
  fechaFin?: string | null;
  arrendador?: string | null;
  inquilino?: string | null;
  inmueble?: string | null;
  unidad?: string | null;
  concepto?: string | null;
  periodo?: string | null;
  responsable?: string | null;
  cuentaOrigen?: string | null;
  cuentaDestino?: string | null;
  banco?: string | null;
  tipoTransferencia?: string | null;
  conceptoBanco?: string | null;
  voucherNombre?: string | null;
  voucherExtension?: string | null;
  voucherTamanoBytes?: number | null;
  voucherRuta?: string | null;
  voucherUrl?: string | null;
  observacion?: string | null;
  tipo?: string | null;
};

export type ArrendamientosDashboard = {
  arrendadoresActivos: number;
  inquilinosActivos: number;
  contratosVigentes: number;
  obligacionesPendientes: number;
  totalPendientePEN: number;
  totalPendienteUSD: number;
  pagosMesPEN: number;
  pagosMesUSD: number;
};

export type ArrendamientosCommandResult = {
  success: boolean;
  message: string;
  id?: number | null;
  idSecundario?: number | null;
  idVersion?: number | null;
};

export type ArrendamientosEstadoCuentaFiltro = {
  idContrato?: number | null;
  idInquilino?: number | null;
  idConcepto?: number | null;
};

export type ArrendamientosDshPagosFiltro = {
  idInmueble?: number | null;
  idInquilino?: number | null;
};

export type ArrendamientosDshPagosInmueble = {
  idInmueble: number;
  nombreInmueble?: string | null;
};

export type ArrendamientosDshPagosInquilino = {
  idInquilino: number;
  nombreComercial?: string | null;
  idInmueble?: number | null;
  nombreInmueble?: string | null;
};

export type ArrendamientosDshPagosKpi = {
  contratosActivos: number;
  obligacionesPendientes: number;
  saldoPendiente: number;
  pagosAplicados: number;
  ultimoPagoFecha?: string | null;
  ultimoPagoImporte: number;
  monedaBase?: string | null;
};

export type ArrendamientosDshPagosPrincipal = {
  idContrato: number;
  codigoContrato?: string | null;
  nombreInmueble?: string | null;
  nombreInquilino?: string | null;
  estadoContrato?: string | null;
  fechaInicio?: string | null;
  fechaFin?: string | null;
  moneda?: string | null;
  importeAlquiler: number;
  importeMantenimiento: number;
  importeCochera: number;
  totalObligado: number;
  saldoPendiente: number;
  totalPagado: number;
  ultimoPagoFecha?: string | null;
  ultimoPagoImporte: number;
};

export type ArrendamientosDshPagosDetalle = {
  idMovimiento: number;
  tipoMovimiento?: string | null;
  codigoContrato?: string | null;
  nombreInmueble?: string | null;
  nombreInquilino?: string | null;
  concepto?: string | null;
  periodo?: string | null;
  estado?: string | null;
  fecha?: string | null;
  moneda?: string | null;
  importe: number;
  saldo: number;
  observacion?: string | null;
};

export type ArrendamientosDshPagosResponse = {
  idInmuebleSeleccionado?: number | null;
  idInquilinoSeleccionado?: number | null;
  inmuebles: ArrendamientosDshPagosInmueble[];
  inquilinos: ArrendamientosDshPagosInquilino[];
  kpi: ArrendamientosDshPagosKpi;
  principal: ArrendamientosDshPagosPrincipal[];
  detalle: ArrendamientosDshPagosDetalle[];
};
