export type ArrendamientosFila = {
  id?: number | null;
  codigo?: string | null;
  nombre?: string | null;
  detalle?: string | null;
  estado?: string | null;
  tipoPago?: string | null;
  conceptoPago?: string | null;
  moneda?: string | null;
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
