export type ImportarConsultaDshParametroTipo =
  | "string"
  | "int"
  | "decimal"
  | "bool"
  | "date"
  | "datetime";

export type ImportarConsultaDshParametro = {
  nombre: string;
  valor: string;
  tipo: ImportarConsultaDshParametroTipo;
};

export type ImportarConsultaDshRequest = {
  parametros: ImportarConsultaDshParametro[];
  maxRows?: number;
  consulta?: string;
  pageNumber?: number;
  pageSize?: number;
};

export type ImportarConsultaDshResponse = {
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
