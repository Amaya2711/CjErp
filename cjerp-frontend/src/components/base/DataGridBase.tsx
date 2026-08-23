import React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export type DataGridColumn<T> = {
  key: string;
  header: string;
  align?: "left" | "center" | "right";
  sortable?: boolean;
  render: (row: T) => React.ReactNode;
};

type DataGridBaseProps<T> = {
  columns: DataGridColumn<T>[];
  rows: T[];
  emptyMessage?: string;
  loading?: boolean;
  loadingMessage?: string;
  getRowKey: (row: T) => string | number;
  rowActions?: (row: T) => React.ReactNode;
  actionsHeader?: string;
  actionsAlign?: "left" | "center" | "right";
  rowActionsPosition?: number;
  sortKey?: string;
  sortDirection?: "asc" | "desc";
  onSortChange?: (key: string) => void;
  maxHeight?: number | string;
};

export default function DataGridBase<T>({
  columns,
  rows,
  emptyMessage = "No hay datos disponibles.",
  loading = false,
  loadingMessage = "Cargando...",
  getRowKey,
  rowActions,
  actionsHeader = "Acciones",
  actionsAlign = "center",
  rowActionsPosition,
  sortKey,
  sortDirection,
  onSortChange,
  maxHeight,
}: DataGridBaseProps<T>) {
  const columnCount = Math.max(columns.length + (rowActions ? 1 : 0), 1);
  const actionIndex = rowActions ? Math.min(Math.max(rowActionsPosition ?? columns.length, 0), columns.length) : -1;

  const renderActionHeader = () =>
    rowActions ? (
      <th
        style={{
          ...styles.th,
          textAlign: actionsAlign,
          width: 120,
        }}
      >
        {actionsHeader}
      </th>
    ) : null;

  const renderActionCell = (row: T) =>
    rowActions ? (
      <td style={{ ...styles.td, textAlign: actionsAlign }}>
        {rowActions(row)}
      </td>
    ) : null;

  return (
    <div
      style={{
        ...styles.wrapper,
        ...(maxHeight != null ? { maxHeight, overflowY: "auto" } : null),
      }}
    >
      <table style={styles.table}>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <React.Fragment key={column.key}>
                {index === actionIndex ? renderActionHeader() : null}
                <th
                  style={{
                    ...styles.th,
                    textAlign: column.align ?? "left",
                    cursor: onSortChange && column.sortable ? "pointer" : "default",
                  }}
                  onClick={
                    onSortChange && column.sortable
                      ? () => onSortChange(column.key)
                      : undefined
                  }
                >
                  <span style={styles.headerContent}>
                    <span>{column.header}</span>
                    {onSortChange && column.sortable ? (
                      sortKey === column.key ? (
                        sortDirection === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                      ) : (
                        <ArrowUpDown size={14} />
                      )
                    ) : null}
                  </span>
                </th>
              </React.Fragment>
            ))}
            {actionIndex === columns.length ? renderActionHeader() : null}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columnCount} style={styles.emptyCell}>
                {loadingMessage}
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columnCount} style={styles.emptyCell}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={getRowKey(row)}>
                {columns.map((column, index) => (
                  <React.Fragment key={column.key}>
                    {index === actionIndex ? renderActionCell(row) : null}
                    <td
                      style={{
                        ...styles.td,
                        textAlign: column.align ?? "left",
                      }}
                    >
                      {column.render(row)}
                    </td>
                  </React.Fragment>
                ))}
                {actionIndex === columns.length ? renderActionCell(row) : null}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    width: "100%",
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    position: "sticky",
    top: 0,
    zIndex: 2,
    padding: "14px 12px",
    fontSize: 13,
    color: "#374151",
    borderBottom: "1px solid #E5E7EB",
    background: "#F8FAFC",
  },
  headerContent: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  },
  td: {
    padding: "14px 12px",
    borderBottom: "1px solid #F1F5F9",
    fontSize: 14,
    color: "#334155",
  },
  emptyCell: {
    padding: 24,
    textAlign: "center",
    color: "#64748B",
    fontSize: 14,
  },
};
