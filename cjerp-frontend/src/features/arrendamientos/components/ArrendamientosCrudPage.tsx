import { useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Download, Pencil, Plus, RefreshCw } from "lucide-react";
import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppSectionHeader from "../../../components/base/AppSectionHeader";
import AppStatusMessage from "../../../components/base/AppStatusMessage";
import CrudToolbar, { matchesCrudToolbarSearch, type CrudToolbarSearchField } from "../../../components/base/CrudToolbar";
import DataGridBase, { type DataGridColumn } from "../../../components/base/DataGridBase";
import SidePanelForm from "../../../components/base/SidePanelForm";
import type { ArrendamientosFila } from "../../../models/arrendamientos";

type CrudMode = "nuevo" | "editar";

type SaveResult = {
  message?: string;
  success?: boolean;
};

type ArrendamientosCrudPageProps<TForm extends { id?: number | null }> = {
  title: string;
  description: string;
  searchHint?: string;
  loadRows: () => Promise<ArrendamientosFila[]>;
  columns: DataGridColumn<ArrendamientosFila>[];
  initialForm: () => TForm;
  mapRowToForm: (row: ArrendamientosFila) => TForm;
  buildSearchFields?: CrudToolbarSearchField<ArrendamientosFila>[];
  buildPayload: (form: TForm, mode: CrudMode) => unknown;
  saveForm: (payload: unknown, mode: CrudMode) => Promise<SaveResult | void>;
  validateForm: (form: TForm) => Record<string, string>;
  renderForm: (
    form: TForm,
    setForm: Dispatch<SetStateAction<TForm>>,
    errors: Record<string, string>,
    mode: CrudMode
  ) => ReactNode;
  emptyMessage?: string;
  panelTitle?: string;
  panelSubtitle?: string;
  exportFileName?: string;
  showSearchHint?: boolean;
  rowActionsPosition?: number;
  toolbarExtras?: ReactNode;
  renderRowActions?: (
    row: ArrendamientosFila,
    helpers: {
      abrirEdicion: (row: ArrendamientosFila) => void;
      recargar: () => Promise<void>;
      notificarExito: (mensaje: string) => void;
      notificarError: (mensaje: string) => void;
    }
  ) => ReactNode;
};

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

// ROLLBACK-MARKER: ARRRENDAMIENTOS CRUD PAGE START
export default function ArrendamientosCrudPage<TForm extends { id?: number | null }>({
  title,
  description,
  searchHint,
  loadRows,
  columns,
  initialForm,
  mapRowToForm,
  buildSearchFields = [],
  buildPayload,
  saveForm,
  validateForm,
  renderForm,
  emptyMessage = "No hay registros para mostrar.",
  panelTitle,
  panelSubtitle,
  exportFileName,
  showSearchHint = true,
  rowActionsPosition,
  toolbarExtras,
  renderRowActions,
}: ArrendamientosCrudPageProps<TForm>) {
  const [rows, setRows] = useState<ArrendamientosFila[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<CrudMode>("nuevo");
  const [form, setForm] = useState<TForm>(initialForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const filteredRows = useMemo(() => {
    if (!buildSearchFields.length) {
      return rows.filter((row) => matchesFallbackSearch(row, search));
    }

    return rows.filter((row) => matchesCrudToolbarSearch(row, search, buildSearchFields));
  }, [rows, search, buildSearchFields]);

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
  }, [loadRows]);

  const abrirNuevo = () => {
    setMode("nuevo");
    setForm(initialForm());
    setFormErrors({});
    setPanelOpen(true);
    setSuccess(null);
    setError(null);
  };

  const abrirEdicion = (row: ArrendamientosFila) => {
    setMode("editar");
    setForm(mapRowToForm(row));
    setFormErrors({});
    setPanelOpen(true);
    setSuccess(null);
    setError(null);
  };

  const guardar = async () => {
    const nextErrors = validateForm(form);
    setFormErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const payload = buildPayload(form, mode);
      const result = await saveForm(payload, mode);

      if (result?.message) {
        setSuccess(result.message);
      } else {
        setSuccess(mode === "nuevo" ? "Registro guardado correctamente." : "Registro actualizado correctamente.");
      }

      setPanelOpen(false);
      setForm(initialForm());
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la informacion.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppPage
      title={title}
      fillHeight
      actions={
        <div style={styles.actionsRow}>
          {toolbarExtras ? <div style={styles.toolbarExtras}>{toolbarExtras}</div> : null}
          <button type="button" style={styles.secondaryButton} onClick={abrirNuevo}>
            <Plus size={16} />
            Nuevo
          </button>
          <button type="button" style={styles.secondaryButton} onClick={() => void cargar()}>
            <RefreshCw size={16} />
            Recargar
          </button>
          <button
            type="button"
            style={styles.primaryButton}
            onClick={() => exportCsv(exportFileName ?? `${title.toLowerCase().replaceAll(" ", "-")}.csv`, filteredRows, columns)}
            disabled={filteredRows.length === 0}
          >
            <Download size={16} />
            Exportar
          </button>
        </div>
      }
    >
      <AppCard style={{ display: "flex", flexDirection: "column", gap: 18, flex: 1, minHeight: 0 }}>
        <AppSectionHeader
          title={title}
          description={description}
          actions={<span style={styles.summary}>{`Registros: ${filteredRows.length}`}</span>}
        />

        {success ? <AppStatusMessage tone="success">{success}</AppStatusMessage> : null}
        {error ? <AppStatusMessage tone="error">{error}</AppStatusMessage> : null}

        <CrudToolbar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={`Buscar ${title.toLowerCase()}...`}
          searchFieldsHint={showSearchHint ? searchHint : undefined}
        />

        <DataGridBase
          rows={filteredRows}
          columns={columns}
          loading={loading}
          emptyMessage={emptyMessage}
          getRowKey={(row) => row.id ?? `${row.codigo ?? "fila"}-${row.fecha ?? ""}`}
          rowActionsPosition={rowActionsPosition}
          rowActions={(row) => (
            <div style={styles.rowActionsCell}>
              <button type="button" style={styles.editButton} onClick={() => abrirEdicion(row)} title="Editar">
                <Pencil size={16} />
              </button>
              {renderRowActions
                ? renderRowActions(row, {
                    abrirEdicion,
                    recargar: cargar,
                    notificarExito: setSuccess,
                    notificarError: setError,
                  })
                : null}
            </div>
          )}
        />
      </AppCard>

      <SidePanelForm
        open={panelOpen}
        title={panelTitle ?? (mode === "nuevo" ? `Nuevo ${title}` : `Editar ${title}`)}
        subtitle={panelSubtitle ?? description}
        onClose={() => {
          setPanelOpen(false);
          setFormErrors({});
        }}
        maxWidth={920}
        footer={
          <>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => {
                setPanelOpen(false);
                setFormErrors({});
              }}
              disabled={saving}
            >
              Cancelar
            </button>
            <button type="button" style={styles.primaryButton} onClick={() => void guardar()} disabled={saving}>
              {saving ? "Guardando..." : mode === "nuevo" ? "Guardar" : "Actualizar"}
            </button>
          </>
        }
      >
        {renderForm(form, setForm, formErrors, mode)}
      </SidePanelForm>
    </AppPage>
  );
}
// ROLLBACK-MARKER: ARRRENDAMIENTOS CRUD PAGE END

const styles: Record<string, React.CSSProperties> = {
  actionsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  toolbarExtras: {
    display: "inline-flex",
    alignItems: "center",
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  primaryButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
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
    justifyContent: "center",
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
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    border: "1px solid #BFDBFE",
    background: "#EFF6FF",
    color: "#1D4ED8",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  rowActionsCell: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flexWrap: "wrap",
  },
};
