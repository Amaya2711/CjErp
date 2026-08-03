import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppSectionHeader from "../../../components/base/AppSectionHeader";
import CrudToolbar, {
  matchesCrudToolbarSearch,
  type CrudToolbarSearchField,
} from "../../../components/base/CrudToolbar";
import DataGridBase, { type DataGridColumn } from "../../../components/base/DataGridBase";
import type { ArrendamientosFila } from "../../../models/arrendamientos";

type ArrendamientosListPageProps = {
  title: string;
  description: string;
  searchHint?: string;
  loadRows: () => Promise<ArrendamientosFila[]>;
  columns: DataGridColumn<ArrendamientosFila>[];
  searchFields?: CrudToolbarSearchField<ArrendamientosFila>[];
  emptyMessage?: string;
};

function formatValue(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return "0.00";
  return Number(value).toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function matchesFallbackSearch(row: ArrendamientosFila, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const text = Object.values(row)
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");

  return text.includes(normalizedQuery);
}

function exportCsv(fileName: string, rows: ArrendamientosFila[], columns: DataGridColumn<ArrendamientosFila>[]) {
  const header = columns.map((column) => `"${column.header.replaceAll('"', '""')}"`).join(",");
  const body = rows.map((row) =>
    columns
      .map((column) => {
        const rendered = column.render(row);
        const text = typeof rendered === "string" || typeof rendered === "number" ? String(rendered) : "";
        return `"${text.replaceAll('"', '""')}"`;
      })
      .join(",")
  );

  const blob = new Blob([`\uFEFF${[header, ...body].join("\n")}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ROLLBACK-MARKER: ARRRENDAMIENTOS FRONT LIST PAGE START
export default function ArrendamientosListPage({
  title,
  description,
  searchHint,
  loadRows,
  columns,
  searchFields = [],
  emptyMessage,
}: ArrendamientosListPageProps) {
  const [rows, setRows] = useState<ArrendamientosFila[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    if (!searchFields.length) return rows.filter((row) => matchesFallbackSearch(row, search));
    return rows.filter((row) => matchesCrudToolbarSearch(row, search, searchFields));
  }, [rows, search, searchFields]);

  const stats = useMemo(
    () => ({
      total: rows.length,
      filtrados: filteredRows.length,
      monto: filteredRows.reduce((acc, row) => acc + (row.importe ?? 0), 0),
      saldo: filteredRows.reduce((acc, row) => acc + (row.saldo ?? 0), 0),
    }),
    [filteredRows, rows.length]
  );

  const cargar = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await loadRows();
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la informacion.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, []);

  return (
    <AppPage
      title={title}
      fillHeight
      actions={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={styles.secondaryButton} onClick={() => void cargar()}>
            <RefreshCw size={16} />
            Recargar
          </button>
          <button
            type="button"
            style={styles.primaryButton}
            onClick={() => exportCsv(`${title.toLowerCase().replaceAll(" ", "-")}.csv`, filteredRows, columns)}
            disabled={filteredRows.length === 0}
          >
            <Download size={16} />
            Exportar
          </button>
        </div>
      }
    >
      <AppCard style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <AppSectionHeader
          title={title}
          description={description}
          actions={<span style={styles.summary}>{`Total: ${stats.total} | Filtrados: ${stats.filtrados}`}</span>}
        />

        <CrudToolbar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={`Buscar ${title.toLowerCase()}...`}
          searchFieldsHint={searchHint}
        />

        {error ? <div style={styles.errorBanner}>{error}</div> : null}

        <DataGridBase
          rows={filteredRows}
          columns={columns}
          loading={loading}
          emptyMessage={emptyMessage ?? "No hay registros para mostrar."}
          getRowKey={(row) => row.id ?? `${row.codigo ?? "fila"}-${row.fecha ?? ""}`}
        />

        <div style={styles.footerRow}>
          <span style={styles.footerText}>{`Monto visible: S/ ${formatValue(stats.monto)}`}</span>
          <span style={styles.footerText}>{`Saldo visible: S/ ${formatValue(stats.saldo)}`}</span>
        </div>
      </AppCard>
    </AppPage>
  );
}
// ROLLBACK-MARKER: ARRRENDAMIENTOS FRONT LIST PAGE END

const styles: Record<string, React.CSSProperties> = {
  primaryButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    border: "none",
    borderRadius: 10,
    background: "#3559E0",
    color: "#FFFFFF",
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  secondaryButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid #CBD5E1",
    borderRadius: 10,
    background: "#FFFFFF",
    color: "#334155",
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  summary: {
    fontSize: 13,
    color: "#475569",
    fontWeight: 700,
  },
  footerRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  footerText: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: 700,
  },
  errorBanner: {
    borderRadius: 12,
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C",
    padding: "12px 14px",
    fontWeight: 700,
  },
};
