export type ArrendamientosFila = {
  id?: number | null;
  codigo?: string | null;
  nombre?: string | null;
  detalle?: string | null;
  estado?: string | null;
  moneda?: string | null;
  importe?: number | null;
  saldo?: number | null;
  fecha?: string | null;
  fechaInicio?: string | null;
  fechaFin?: string | null;
  arrendador?: string | null;
  inquilino?: string | null;
  inmueble?: string | null;
  unidad?: string | null;
  concepto?: string | null;
  periodo?: string | null;
  responsable?: string | null;
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
