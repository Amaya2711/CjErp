import type { CSSProperties, ReactNode } from "react";

export type GridDataType = "string" | "number" | "date" | "datetime" | "boolean";
export type SortOrder = "asc" | "desc";
export type SummaryType = "sum" | "count" | "avg" | "min" | "max";

export type GridFormat =
  | { type: "fixedPoint"; precision?: number }
  | { type: "currency"; currency?: string; precision?: number }
  | { type: "percent"; precision?: number }
  | { type: "date" }
  | { type: "datetime" };

export type GridLookupItem = { value: unknown; label: string };

export type GridColumn<T extends object = Record<string, unknown>> = {
  dataField: string;
  caption?: string;
  dataType?: GridDataType;
  width?: number;
  minWidth?: number;
  alignment?: "left" | "center" | "right";
  visible?: boolean;
  /** Ancla la columna a la izquierda al hacer scroll horizontal. */
  fixed?: boolean;
  allowSorting?: boolean;
  allowFiltering?: boolean;
  allowGrouping?: boolean;
  allowResizing?: boolean;
  allowEditing?: boolean;
  allowSearch?: boolean;
  /** Agrupación inicial (orden de los niveles). */
  groupIndex?: number;
  /** Orden inicial. */
  sortOrder?: SortOrder;
  format?: GridFormat | ((value: unknown) => string);
  /** Valores permitidos: se muestra la etiqueta y el editor es un select. */
  lookup?: GridLookupItem[];
  /** Columna calculada: se usa para mostrar, filtrar, ordenar, agrupar y resumir. */
  calculateCellValue?: (row: T) => unknown;
  /** Filtro de encabezado con lista de valores (por defecto: sí). */
  allowHeaderFilter?: boolean;
  cellRender?: (value: unknown, row: T) => ReactNode;
  cellStyle?: (value: unknown, row: T) => CSSProperties | undefined;
};

export type GridSort = { field: string; order: SortOrder };

export type GridSummaryItem = {
  column: string;
  type: SummaryType;
  /** Texto previo al valor (por defecto: Suma, Cant., Prom., Mín., Máx.). */
  label?: string;
  format?: GridFormat | ((value: number) => string);
};

export type GroupNode<T extends object> = {
  key: string;
  field: string;
  value: unknown;
  level: number;
  leaves: T[];
  children: GroupNode<T>[] | null;
};

export type DisplayItem<T extends object> =
  | { type: "group"; node: GroupNode<T> }
  | { type: "row"; row: T };

export type CellChangedEvent<T extends object> = {
  row: T;
  key: string;
  field: string;
  oldValue: unknown;
  value: unknown;
};
