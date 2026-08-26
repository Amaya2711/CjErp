import { useMemo, useState } from "react";
import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppSectionHeader from "../../../components/base/AppSectionHeader";
import AppStatusMessage from "../../../components/base/AppStatusMessage";
import CrudToolbar, {
  matchesCrudToolbarSearch,
  type CrudToolbarSearchField,
} from "../../../components/base/CrudToolbar";
import StoredProcedureGrid from "../../../components/base/StoredProcedureGrid";
import {
  buildPlanillaConsultaEstadosBaseParams,
  buildPlanillaConsultaEstadosRequest,
  consultarPlanillaEstados,
} from "../../../api/planillaConsultaService";
import type {
  PlanillaConsultaParametro,
  PlanillaConsultaParametroTipo,
  StoredProcedureGridColumnConfig,
} from "../../../models/planillaConsulta";
import { getHttpErrorMessage } from "../../../utils/httpError";

type ParametroEditable = PlanillaConsultaParametro & {
  id: string;
};

const PARAMETRO_TIPO_OPTIONS: Array<{
  value: PlanillaConsultaParametroTipo;
  label: string;
}> = [
  { value: "string", label: "Texto" },
  { value: "int", label: "Entero" },
  { value: "decimal", label: "Decimal" },
  { value: "bool", label: "Booleano" },
  { value: "date", label: "Fecha" },
  { value: "datetime", label: "Fecha y hora" },
];

const DEFAULT_HIDDEN_COLUMNS: string[] = [];

function createParametroEditable(): ParametroEditable {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    nombre: "",
    valor: "",
    tipo: "string",
  };
}

function createBaseParametrosEditables(): ParametroEditable[] {
  return buildPlanillaConsultaEstadosBaseParams().map((parametro, index) => ({
    id: `base-${index}-${parametro.nombre.toLowerCase()}`,
    ...parametro,
  }));
}

function normalizeColumnKey(value: string): string {
  return value.trim().toLowerCase();
}

function buildColumnConfigs(
  columns: string[],
  hiddenColumns: string[]
): StoredProcedureGridColumnConfig[] {
  const hiddenSet = new Set(hiddenColumns.map(normalizeColumnKey));

  return columns.map((column) => ({
    key: column,
    visible: !hiddenSet.has(normalizeColumnKey(column)),
  }));
}

export default function CierreContablePage() {
  const [parametros, setParametros] = useState<ParametroEditable[]>([
    ...createBaseParametrosEditables(),
    createParametroEditable(),
  ]);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(DEFAULT_HIDDEN_COLUMNS);
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const columnConfigs = useMemo(
    () => buildColumnConfigs(columns, hiddenColumns),
    [columns, hiddenColumns]
  );

  const visibleColumns = useMemo(
    () => columnConfigs.filter((column) => column.visible !== false).map((column) => column.key),
    [columnConfigs]
  );

  const searchFields = useMemo<CrudToolbarSearchField<Record<string, unknown>>[]>(
    () =>
      visibleColumns.map((column) => ({
        key: column,
        label: column,
        getValue: (row) => row[column],
      })),
    [visibleColumns]
  );

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesCrudToolbarSearch(row, busqueda, searchFields)),
    [rows, busqueda, searchFields]
  );

  const actualizarParametro = (
    id: string,
    field: keyof PlanillaConsultaParametro,
    value: string
  ) => {
    setParametros((prev) =>
      prev.map((parametro) =>
        parametro.id === id
          ? {
              ...parametro,
              [field]: value,
            }
          : parametro
      )
    );
  };

  const agregarParametro = () => {
    setParametros((prev) => [...prev, createParametroEditable()]);
  };

  const eliminarParametro = (id: string) => {
    setParametros((prev) => (prev.length > 1 ? prev.filter((parametro) => parametro.id !== id) : prev));
  };

  const toggleColumnVisibility = (column: string) => {
    setHiddenColumns((prev) => {
      const normalized = normalizeColumnKey(column);
      const exists = prev.some((item) => normalizeColumnKey(item) === normalized);

      if (exists) {
        return prev.filter((item) => normalizeColumnKey(item) !== normalized);
      }

      return [...prev, column];
    });
  };

  const consultar = async () => {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await consultarPlanillaEstados({
        ...buildPlanillaConsultaEstadosRequest(
          parametros
            .filter((parametro) => parametro.nombre.trim())
            .map(({ nombre, valor, tipo }) => ({
              nombre: nombre.trim(),
              valor: (valor ?? "").trim(),
              tipo,
            }))
        ),
      });

      setColumns(response.columns ?? []);
      setRows(response.rows ?? []);
      setMessage("Consulta ejecutada correctamente.");
    } catch (err: unknown) {
      setError(getHttpErrorMessage(err, "No se pudo consultar sp_Planilla_Consulta_Estados."));
      setRows([]);
      setColumns([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppPage title="Cierre Contable">
      <AppCard>
        <AppSectionHeader
          title="Consulta de estados"
          description="Ejecuta sp_Planilla_Consulta_Estados enviando los parametros necesarios para la consulta."
        />

        <div style={styles.parametrosGrid}>
          {parametros.map((parametro, index) => (
            <div key={parametro.id} style={styles.parametroRow}>
              <input
                type="text"
                value={parametro.nombre}
                onChange={(event) => actualizarParametro(parametro.id, "nombre", event.target.value)}
                placeholder={`Parametro ${index + 1}`}
                style={styles.input}
              />

              <select
                value={parametro.tipo}
                onChange={(event) => actualizarParametro(parametro.id, "tipo", event.target.value)}
                style={styles.input}
              >
                {PARAMETRO_TIPO_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={parametro.valor ?? ""}
                onChange={(event) => actualizarParametro(parametro.id, "valor", event.target.value)}
                placeholder="Valor"
                style={styles.input}
              />

              <button
                type="button"
                onClick={() => eliminarParametro(parametro.id)}
                style={styles.deleteButton}
                disabled={parametros.length <= 1 || parametro.id.startsWith("base-")}
              >
                Quitar
              </button>
            </div>
          ))}
        </div>

        <div style={styles.parametrosActions}>
          <button type="button" onClick={agregarParametro} style={styles.secondaryButton}>
            Agregar parametro
          </button>
          <button type="button" onClick={consultar} style={styles.primaryButton} disabled={loading}>
            {loading ? "Consultando..." : "Consultar"}
          </button>
        </div>
      </AppCard>

      {message ? <AppStatusMessage tone="success">{message}</AppStatusMessage> : null}
      {error ? <AppStatusMessage tone="error">{error}</AppStatusMessage> : null}

      <CrudToolbar
        searchValue={busqueda}
        onSearchChange={setBusqueda}
        searchPlaceholder="Buscar en resultados..."
        searchFieldsHint={visibleColumns.join(", ")}
      />

      <AppCard>
        <AppSectionHeader
          title="Columnas visibles"
          description="Selecciona las columnas que deben mostrarse en el grid de esta pagina."
        />

        {columns.length === 0 ? (
          <div style={styles.emptyInfo}>Ejecuta primero la consulta para obtener las columnas disponibles.</div>
        ) : (
          <div style={styles.columnsGrid}>
            {columns.map((column) => {
              const checked = !hiddenColumns.some(
                (item) => normalizeColumnKey(item) === normalizeColumnKey(column)
              );

              return (
                <label key={column} style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleColumnVisibility(column)}
                  />
                  {column}
                </label>
              );
            })}
          </div>
        )}
      </AppCard>

      <AppCard>
        <AppSectionHeader
          title="Resultado"
          description="El grid muestra solo las columnas marcadas como visibles."
        />

        <StoredProcedureGrid
          rows={filteredRows}
          availableColumns={columns}
          columnConfigs={columnConfigs}
          loading={loading}
          loadingMessage="Consultando estados..."
          emptyMessage="No hay datos para mostrar."
        />
      </AppCard>
    </AppPage>
  );
}

const styles: Record<string, React.CSSProperties> = {
  parametrosGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  parametroRow: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 2fr auto",
    gap: 10,
    alignItems: "center",
  },
  input: {
    width: "100%",
    height: 42,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #D1D5DB",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    background: "#FFFFFF",
  },
  parametrosActions: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 16,
    flexWrap: "wrap",
  },
  primaryButton: {
    border: "none",
    background: "#6E4CCB",
    color: "#FFFFFF",
    padding: "10px 16px",
    borderRadius: 10,
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #D1D5DB",
    background: "#FFFFFF",
    color: "#17143A",
    padding: "10px 16px",
    borderRadius: 10,
    fontWeight: 600,
    cursor: "pointer",
  },
  deleteButton: {
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C",
    padding: "10px 12px",
    borderRadius: 10,
    fontWeight: 600,
    cursor: "pointer",
  },
  columnsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    color: "#374151",
  },
  emptyInfo: {
    fontSize: 14,
    color: "#6B7280",
  },
};
