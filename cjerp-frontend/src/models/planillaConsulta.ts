import type React from "react";

export type PlanillaConsultaParametroTipo =
  | "string"
  | "int"
  | "decimal"
  | "bool"
  | "date"
  | "datetime";

export type PlanillaConsultaParametro = {
  nombre: string;
  valor: string | null;
  tipo: PlanillaConsultaParametroTipo;
};

export type PlanillaConsultaEstadosRequest = {
  parametros: PlanillaConsultaParametro[];
  maxRows?: number;
  consulta?: string;
  pageNumber?: number;
  pageSize?: number;
};

export type PlanillaConsultaEstadosResponse = {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  totalRows?: number;
  pageNumber?: number;
  pageSize?: number;
  totalPages?: number;
  hasPreviousPage?: boolean;
  hasNextPage?: boolean;
  maxRowsAllowed?: number | null;
  limitExceeded?: boolean;
  message?: string | null;
};

export type PlanillaAprobacionMasivaRegistroRequest = {
  correlativo: number;
  idSite: string;
  tipoMoneda: number;
};

export type PlanillaAprobacionMasivaRequest = {
  codEstado: number;
  observacion?: string | null;
  idRegularizar: number;
  registros: PlanillaAprobacionMasivaRegistroRequest[];
};

export type PlanillaRechazoRequest = {
  correlativo: number;
  idSite: string;
  observacion: string;
  idAprobador?: number;
};

export type AprobacionResultadoDto = {
  exito: boolean;
  correlativo: number;
  idSite: string;
  tipoMoneda: number;
  moneda?: string | null;
  total: number;
  idResponsable?: number | null;
  estadoAnterior?: number | null;
  estadoSolicitado: number;
  estadoAplicado: number;
  requiereSegundaAprobacion: boolean;
  limiteSegundaAprobacion?: number | null;
  mensaje?: string | null;
};

export type AprobacionResumenDto = {
  totalSeleccionados: number;
  procesados: number;
  noProcesados: number;
  enviadosSegundaAprobacion: number;
  aprobados: number;
  primeraAprobacion: number;
  observados: number;
  rechazados: number;
};

export type PlanillaAprobacionMasivaResponse = {
  detalle: AprobacionResultadoDto[];
  resumen: AprobacionResumenDto | null;
};

export type StoredProcedureGridColumnConfig = {
  key: string;
  header?: string;
  visible?: boolean;
  align?: "left" | "center" | "right";
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
};
