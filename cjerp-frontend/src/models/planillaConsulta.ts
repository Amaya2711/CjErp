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

export type StoredProcedureGridColumnConfig = {
  key: string;
  header?: string;
  visible?: boolean;
  align?: "left" | "center" | "right";
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
};
