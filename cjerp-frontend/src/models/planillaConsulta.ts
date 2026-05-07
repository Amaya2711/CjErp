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
  valor: string;
  tipo: PlanillaConsultaParametroTipo;
};

export type PlanillaConsultaEstadosRequest = {
  parametros: PlanillaConsultaParametro[];
};

export type PlanillaConsultaEstadosResponse = {
  columns: string[];
  rows: Array<Record<string, unknown>>;
};

export type StoredProcedureGridColumnConfig = {
  key: string;
  header?: string;
  visible?: boolean;
  align?: "left" | "center" | "right";
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
};
