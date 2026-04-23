import type React from "react";

export type DataGridColumn<T> = {
  key: string;
  header: string;
  align?: "left" | "center" | "right";
  render: (row: T) => React.ReactNode;
};

type DataGridBaseProps<T> = {
  columns: DataGridColumn<T>[];
  rows: T[];
  emptyMessage?: string;
  loading?: boolean;
  loadingMessage?: string;
  getRowKey: (row: T) => string | number;
};

export default function DataGridBase<T>({
  columns,
  rows,
  emptyMessage = "No hay datos disponibles.",
  loading = false,
  loadingMessage = "Cargando...",
  getRowKey,
}: DataGridBaseProps<T>) {
  return (
    <div style={styles.wrapper}>
      <table style={styles.table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                style={{
                  ...styles.th,
                  textAlign: column.align ?? "left",
                }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} style={styles.emptyCell}>
                {loadingMessage}
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={styles.emptyCell}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={getRowKey(row)}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    style={{
                      ...styles.td,
                      textAlign: column.align ?? "left",
                    }}
                  >
                    {column.render(row)}
                  </td>
                ))}
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
    padding: "14px 12px",
    fontSize: 13,
    color: "#374151",
    borderBottom: "1px solid #E5E7EB",
    background: "#F8FAFC",
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
