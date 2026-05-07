import { useMemo } from "react";
import DataGridBase, { type DataGridColumn } from "./DataGridBase";
import type { StoredProcedureGridColumnConfig } from "../../models/planillaConsulta";

type StoredProcedureGridProps = {
  rows: Array<Record<string, unknown>>;
  availableColumns?: string[];
  columnConfigs?: StoredProcedureGridColumnConfig[];
  loading?: boolean;
  loadingMessage?: string;
  emptyMessage?: string;
};

function formatHeader(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function toDisplayText(value: unknown): string {
  if (value == null) {
    return "";
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

export default function StoredProcedureGrid({
  rows,
  availableColumns,
  columnConfigs = [],
  loading = false,
  loadingMessage = "Cargando...",
  emptyMessage = "No hay datos disponibles.",
}: StoredProcedureGridProps) {
  const columns = useMemo<DataGridColumn<Record<string, unknown>>[]>(() => {
    const configMap = new Map(columnConfigs.map((column) => [column.key.toLowerCase(), column]));
    const sourceColumns =
      columnConfigs.length > 0
        ? columnConfigs.map((column) => column.key)
        : availableColumns && availableColumns.length > 0
        ? availableColumns
        : Array.from(
            rows.reduce((keys, row) => {
              Object.keys(row).forEach((key) => keys.add(key));
              return keys;
            }, new Set<string>())
          );

    return sourceColumns
      .map((key) => {
        const config = configMap.get(key.toLowerCase());
        if (config?.visible === false) {
          return null;
        }

        return {
          key,
          header: config?.header ?? formatHeader(key),
          align: config?.align ?? "left",
          render: (row: Record<string, unknown>) => {
            const value = row[key];
            return config?.render ? config.render(value, row) : toDisplayText(value);
          },
        } satisfies DataGridColumn<Record<string, unknown>>;
      })
      .filter(Boolean) as DataGridColumn<Record<string, unknown>>[];
  }, [availableColumns, columnConfigs, rows]);

  return (
    <DataGridBase
      columns={columns}
      rows={rows}
      loading={loading}
      loadingMessage={loadingMessage}
      emptyMessage={emptyMessage}
      getRowKey={(row) =>
        String(
          row.id ??
            row.Id ??
            row.ID ??
            JSON.stringify(row)
        )
      }
    />
  );
}
