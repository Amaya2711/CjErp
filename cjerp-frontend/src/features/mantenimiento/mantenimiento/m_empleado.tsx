import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, RotateCcw, Search } from "lucide-react";
import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppStatusMessage from "../../../components/base/AppStatusMessage";
import { empleadosCrudService, type EmpleadoCrudItem } from "../../../api/empleadosCrudService";
import { getHttpErrorMessage } from "../../../utils/httpError";

type ExcelRow = Record<string, unknown>;

type GridColumn = {
  key: string;
  label: string;
  width: number;
  sticky?: boolean;
};

type EditableDateColumn = "fechaIngreso" | "fechaIniLaboral";

type EditingCellState = {
  rowId: number;
  columnKey: EditableDateColumn;
};

type SortDirection = "asc" | "desc";

type SortState = {
  key: string;
  direction: SortDirection;
};

type ColumnFiltersState = Record<string, string>;

const EDITABLE_DATE_COLUMNS = new Set<EditableDateColumn>(["fechaIngreso", "fechaIniLaboral"]);

const GRID_COLUMNS: GridColumn[] = [
  { key: "idEmpleado", label: "Id", width: 72, sticky: true },
  { key: "nombreEmpleado", label: "Empleado", width: 220, sticky: true },
  { key: "tipoDoc", label: "Tipo Doc", width: 80 },
  { key: "nroDocumento", label: "Documento", width: 110 },
  { key: "sexo", label: "Sexo", width: 86 },
  { key: "empresa", label: "Empresa", width: 130 },
  { key: "cliente", label: "Cliente", width: 130 },
  { key: "area", label: "Area", width: 120 },
  { key: "ubicacion", label: "Ubicacion", width: 130 },
  { key: "fechaIngreso", label: "Fecha Ingreso", width: 120 },
  { key: "fechaIniLaboral", label: "Inicio", width: 110 },
  { key: "fechaFinLaboral", label: "Fin", width: 110 },
  { key: "responsable", label: "Responsable", width: 190 },
  { key: "soValidador", label: "2do Validador", width: 190 },
  { key: "terValidador", label: "3er Validador", width: 190 },
  { key: "telefono", label: "Telefono", width: 120 },
  { key: "correo", label: "Correo", width: 230 },
  { key: "direccion", label: "Direccion", width: 320 },
  { key: "cargoPrint", label: "Cargo", width: 170 },
  { key: "estado", label: "Estado", width: 100 },
];

const NON_FILTERABLE_COLUMN_KEYS = new Set([
  "idEmpleado",
  "sexo",
  "telefono",
  "correo",
  "direccion",
  "estado",
  "fechaIngreso",
  "fechaIniLaboral",
  "fechaFinLaboral",
]);

const FILTERABLE_COLUMNS = GRID_COLUMNS.filter((column) => !NON_FILTERABLE_COLUMN_KEYS.has(column.key));
const SECONDARY_FILTER_COLUMN_KEYS = new Set(["tipoDoc", "soValidador", "terValidador", "cargoPrint"]);
const PRIMARY_FILTER_COLUMNS = FILTERABLE_COLUMNS.filter((column) => !SECONDARY_FILTER_COLUMN_KEYS.has(column.key));
const SECONDARY_FILTER_COLUMNS = FILTERABLE_COLUMNS.filter((column) => SECONDARY_FILTER_COLUMN_KEYS.has(column.key));

function normalizeText(value: unknown): string {
  if (value == null) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean).join(", ");
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).trim();
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function toExcelRow(item: EmpleadoCrudItem): ExcelRow {
  return {
    idEmpleado: item.idEmpleado,
    nombreEmpleado: item.nombreEmpleado,
    tipoDoc: item.tipoDoc,
    idSexo: item.idSexo,
    nroDocumento: item.nroDocumento,
    sexo: item.sexo,
    idDocumento: item.idDocumento,
    cliente: item.cliente,
    idClienteCj: item.idClienteCj,
    area: item.area,
    idAreaCj: item.idAreaCj,
    ubicacion: item.ubicacion,
    idUbicacionCj: item.idUbicacionCj,
    fechaIngreso: item.fechaIngreso,
    fechaIniLaboral: item.fechaIniLaboral,
    fechaFinLaboral: item.fechaFinLaboral,
    responsable: item.responsable,
    idResponsableCj: item.idResponsableCj,
    soValidador: item.soValidador,
    idSegundoVacaciones: item.idSegundoVacaciones,
    terValidador: item.terValidador,
    idTerceroVacaciones: item.idTerceroVacaciones,
    empresa: item.empresa,
    idEmpresaCj: item.idEmpresaCj,
    telefono: item.telefono,
    correo: item.correo,
    direccion: item.direccion,
    cargoPrint: item.cargoPrint,
    estado: item.estado,
    idEstado: item.idEstado,
  };
}

function toNumberOrNull(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateInputValue(value: unknown): string {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }

  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    return match[1];
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function isEditableDateColumn(key: string): key is EditableDateColumn {
  return EDITABLE_DATE_COLUMNS.has(key as EditableDateColumn);
}

function buildEmpleadoSavePayload(row: ExcelRow, overrides: Partial<Record<EditableDateColumn, string>> = {}) {
  return {
    nombreEmpleado: normalizeText(row.nombreEmpleado),
    sexo: normalizeText(row.sexo) || null,
    idSexo: toNumberOrNull(row.idSexo),
    idDocumento: toNumberOrNull(row.idDocumento),
    nroDocumento: normalizeText(row.nroDocumento) || null,
    telefono: normalizeText(row.telefono) || null,
    correo: normalizeText(row.correo) || null,
    direccion: normalizeText(row.direccion) || null,
    fechaIngreso: (overrides.fechaIngreso ?? toDateInputValue(row.fechaIngreso)) || null,
    fechaIniLaboral: (overrides.fechaIniLaboral ?? toDateInputValue(row.fechaIniLaboral)) || null,
    fechaFinLaboral: toDateInputValue(row.fechaFinLaboral) || null,
    idEmpresaCj: toNumberOrNull(row.idEmpresaCj),
    idClienteCj: toNumberOrNull(row.idClienteCj),
    idAreaCj: toNumberOrNull(row.idAreaCj),
    idUbicacionCj: toNumberOrNull(row.idUbicacionCj),
    idResponsableCj: toNumberOrNull(row.idResponsableCj),
    idSegundoVacaciones: toNumberOrNull(row.idSegundoVacaciones),
    idTerceroVacaciones: toNumberOrNull(row.idTerceroVacaciones),
  };
}

function rowMatchesQuery(row: ExcelRow, query: string): boolean {
  if (!query) {
    return true;
  }

  return GRID_COLUMNS.some((column) => {
    const value = normalizeSearchText(normalizeText(row[column.key]));
    return value.includes(query);
  });
}

function formatCell(value: unknown): string {
  const text = normalizeText(value);
  return text || "-";
}

function formatDateCell(value: unknown): string {
  const text = normalizeText(value);

  if (!text) {
    return "-";
  }

  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : text;
}

function getSortValue(value: unknown, columnKey: string): string | number {
  const text = normalizeText(value);

  if (!text) {
    return "";
  }

  if (columnKey.toLowerCase().includes("fecha")) {
    const parsedDate = Date.parse(toDateInputValue(text));
    return Number.isNaN(parsedDate) ? text.toLowerCase() : parsedDate;
  }

  const numericValue = Number(text);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  return text.toLowerCase();
}

function createEmptyColumnFilters(): ColumnFiltersState {
  return FILTERABLE_COLUMNS.reduce<ColumnFiltersState>((acc, column) => {
    acc[column.key] = "";
    return acc;
  }, {});
}

export default function MantenimientoEmpleadoPage() {
  const [rows, setRows] = useState<ExcelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [searchText, setSearchText] = useState("");
  const [editingCell, setEditingCell] = useState<EditingCellState | null>(null);
  const [hoveredCell, setHoveredCell] = useState<EditingCellState | null>(null);
  const [draftDateValue, setDraftDateValue] = useState("");
  const [savingCell, setSavingCell] = useState<EditingCellState | null>(null);
  const [sortState, setSortState] = useState<SortState | null>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(() => createEmptyColumnFilters());
  const [showSecondaryFilters, setShowSecondaryFilters] = useState(false);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const bottomScrollRef = useRef<HTMLDivElement | null>(null);
  const successTimerRef = useRef<number | null>(null);

  const showTemporarySuccess = (message: string, durationMs = 3000) => {
    if (successTimerRef.current !== null) {
      window.clearTimeout(successTimerRef.current);
    }

    setSuccess(message);
    successTimerRef.current = window.setTimeout(() => {
      setSuccess("");
      successTimerRef.current = null;
    }, durationMs);
  };

  const loadData = async () => {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await empleadosCrudService.listar();
      const nextRows = Array.isArray(response) ? response.map(toExcelRow) : [];
      setRows(nextRows);
      showTemporarySuccess(`Se cargaron ${nextRows.length} registros del mantenimiento de empleados.`);
    } catch (err) {
      setRows([]);
      setError(getHttpErrorMessage(err, "No se pudo cargar el listado de empleados."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filteredRows = useMemo(() => {
    const normalizedQuery = normalizeSearchText(searchText);
    return rows.filter((row) => {
      if (!rowMatchesQuery(row, normalizedQuery)) {
        return false;
      }

      return FILTERABLE_COLUMNS.every((column) => {
        const filterValue = normalizeSearchText(columnFilters[column.key] ?? "");
        if (!filterValue) {
          return true;
        }

        const cellValue = normalizeSearchText(normalizeText(row[column.key]));
        return cellValue.includes(filterValue);
      });
    });
  }, [columnFilters, rows, searchText]);

  const sortedRows = useMemo(() => {
    if (!sortState) {
      return filteredRows;
    }

    return [...filteredRows].sort((leftRow, rightRow) => {
      const leftValue = getSortValue(leftRow[sortState.key], sortState.key);
      const rightValue = getSortValue(rightRow[sortState.key], sortState.key);

      if (leftValue === rightValue) {
        return 0;
      }

      const comparison =
        typeof leftValue === "number" && typeof rightValue === "number"
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue), "es", { sensitivity: "base", numeric: true });

      return sortState.direction === "asc" ? comparison : -comparison;
    });
  }, [filteredRows, sortState]);

  const contentWidth = useMemo(() => {
    const baseWidth = GRID_COLUMNS.reduce((total, column) => total + column.width, 0);
    return Math.max(baseWidth, 1400);
  }, []);

  const stickyOffsets = useMemo(() => {
    let offset = 0;
    return GRID_COLUMNS.map((column) => {
      if (!column.sticky) {
        return null;
      }

      const current = offset;
      offset += column.width;
      return current;
    });
  }, []);

  const handleSortColumn = (columnKey: string) => {
    setSortState((current) => {
      if (current?.key === columnKey) {
        return {
          key: columnKey,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }

      return {
        key: columnKey,
        direction: "asc",
      };
    });
  };

  const clearColumnFilters = () => {
    setColumnFilters(createEmptyColumnFilters());
  };

  const hasActiveColumnFilters = useMemo(
    () => GRID_COLUMNS.some((column) => normalizeSearchText(columnFilters[column.key] ?? "") !== ""),
    [columnFilters],
  );

  const saveDateCell = async (row: ExcelRow, columnKey: EditableDateColumn, nextValue: string) => {
    const previousValue = toDateInputValue(row[columnKey]);
    const normalizedNextValue = nextValue.trim();

    setEditingCell(null);
    setHoveredCell(null);

    if (previousValue === normalizedNextValue) {
      return;
    }

    setSavingCell({ rowId: Number(row.idEmpleado), columnKey });
    setError("");

    try {
      const payload = buildEmpleadoSavePayload(row, {
        [columnKey]: normalizedNextValue,
      });
      const updated = await empleadosCrudService.actualizar(Number(row.idEmpleado), payload);
      const updatedRow = toExcelRow(updated);

      setRows((currentRows) =>
        currentRows.map((currentRow) =>
          Number(currentRow.idEmpleado) === Number(row.idEmpleado) ? { ...currentRow, ...updatedRow } : currentRow,
        ),
      );
      showTemporarySuccess(
        `Se actualizó ${columnKey === "fechaIngreso" ? "Fecha Ingreso" : "Inicio"} del empleado ${normalizeText(row.nombreEmpleado)}.`,
      );
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo actualizar la fecha del empleado."));
    } finally {
      setSavingCell(null);
    }
  };

  useEffect(() => {
    const topEl = topScrollRef.current;
    const tableEl = tableWrapRef.current;
    const bottomEl = bottomScrollRef.current;

    if (!topEl || !tableEl || !bottomEl) {
      return;
    }

    let syncingFromTop = false;
    let syncingFromTable = false;
    let syncingFromBottom = false;

    const syncFromTop = () => {
      if (syncingFromTable || syncingFromBottom) return;
      syncingFromTop = true;
      tableEl.scrollLeft = topEl.scrollLeft;
      bottomEl.scrollLeft = topEl.scrollLeft;
      requestAnimationFrame(() => {
        syncingFromTop = false;
      });
    };

    const syncFromTable = () => {
      if (syncingFromTop || syncingFromBottom) return;
      syncingFromTable = true;
      topEl.scrollLeft = tableEl.scrollLeft;
      bottomEl.scrollLeft = tableEl.scrollLeft;
      requestAnimationFrame(() => {
        syncingFromTable = false;
      });
    };

    const syncFromBottom = () => {
      if (syncingFromTop || syncingFromTable) return;
      syncingFromBottom = true;
      tableEl.scrollLeft = bottomEl.scrollLeft;
      topEl.scrollLeft = bottomEl.scrollLeft;
      requestAnimationFrame(() => {
        syncingFromBottom = false;
      });
    };

    topEl.addEventListener("scroll", syncFromTop, { passive: true });
    tableEl.addEventListener("scroll", syncFromTable, { passive: true });
    bottomEl.addEventListener("scroll", syncFromBottom, { passive: true });
    topEl.scrollLeft = tableEl.scrollLeft;
    bottomEl.scrollLeft = tableEl.scrollLeft;

    return () => {
      topEl.removeEventListener("scroll", syncFromTop);
      tableEl.removeEventListener("scroll", syncFromTable);
      bottomEl.removeEventListener("scroll", syncFromBottom);
    };
  }, [sortedRows.length]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current !== null) {
        window.clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  return (
    <AppPage
      title="Mantenimiento de empleado"
      fillHeight
      style={{ height: "100%", minHeight: 0, overflow: "hidden", boxSizing: "border-box" }}
    >
      <div style={styles.page}>
        <AppCard style={{ marginBottom: 0 }}>
          <div style={styles.headerRow}>
            <div />
          </div>

          <div style={styles.toolbar}>
            <label style={styles.searchField}>
              <span style={styles.label}>Busqueda</span>
              <div style={styles.searchBox}>
                <Search size={16} />
                <input
                  type="text"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Buscar por cualquier columna..."
                  style={styles.searchInput}
                />
              </div>
            </label>

            <button type="button" style={styles.secondaryButton} onClick={() => setSearchText("")}>
              <RotateCcw size={16} />
              Limpiar
            </button>

            <button type="button" style={styles.primaryButton} onClick={() => void loadData()} disabled={loading}>
              <RotateCcw size={16} />
              {loading ? "Actualizando..." : "Actualizar"}
            </button>
          </div>
        </AppCard>

        <AppCard style={{ ...styles.filterCard, marginBottom: 0 }}>
          <div style={styles.filterHeader}>
            <div>
              <h3 style={styles.filterTitle}>Filtros por columna</h3>
              <p style={styles.filterSubtitle}>Filtra la información ya cargada sin volver a consultar el store.</p>
            </div>
            <div style={styles.filterActions}>
              <div style={styles.filterBadge}>{hasActiveColumnFilters ? "Filtros activos" : "Sin filtros"}</div>
              <button
                type="button"
                onClick={() => setShowSecondaryFilters((current) => !current)}
                style={styles.secondaryButton}
                aria-label={showSecondaryFilters ? "Ocultar filtros secundarios" : "Ver filtros secundarios"}
                title={showSecondaryFilters ? "Ocultar filtros secundarios" : "Ver filtros secundarios"}
              >
                <Eye size={16} />
              </button>
              <button type="button" onClick={clearColumnFilters} style={styles.secondaryButton} disabled={!hasActiveColumnFilters}>
                <RotateCcw size={16} />
                Limpiar filtros
              </button>
            </div>
          </div>

          <div style={styles.filterGrid}>
            {PRIMARY_FILTER_COLUMNS.map((column) => {
              const isDateFilter = column.key.toLowerCase().includes("fecha");

              return (
                <label key={column.key} style={styles.filterField}>
                  <span style={styles.filterLabel}>{column.label}</span>
                  <input
                    type={isDateFilter ? "date" : "text"}
                    value={columnFilters[column.key] ?? ""}
                    onChange={(event) =>
                      setColumnFilters((current) => ({
                        ...current,
                        [column.key]: event.target.value,
                      }))
                    }
                    placeholder={isDateFilter ? "Filtrar fecha" : `Filtrar ${column.label.toLowerCase()}`}
                    style={styles.filterInput}
                  />
                </label>
              );
            })}
          </div>

          {showSecondaryFilters ? (
            <div style={styles.secondaryFilterSection}>
              <div style={styles.secondaryFilterHeader}>
                <h4 style={styles.secondaryFilterTitle}>Filtros secundarios</h4>
                <span style={styles.secondaryFilterHint}>Tipo Doc, 2do Validador, 3er Validador y Cargo</span>
              </div>
              <div style={styles.filterGrid}>
                {SECONDARY_FILTER_COLUMNS.map((column) => {
                  const isDateFilter = column.key.toLowerCase().includes("fecha");

                  return (
                    <label key={column.key} style={styles.filterField}>
                      <span style={styles.filterLabel}>{column.label}</span>
                      <input
                        type={isDateFilter ? "date" : "text"}
                        value={columnFilters[column.key] ?? ""}
                        onChange={(event) =>
                          setColumnFilters((current) => ({
                            ...current,
                            [column.key]: event.target.value,
                          }))
                        }
                        placeholder={isDateFilter ? "Filtrar fecha" : `Filtrar ${column.label.toLowerCase()}`}
                        style={styles.filterInput}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
        </AppCard>

        {loading ? <AppStatusMessage tone="info">Cargando listado de empleados...</AppStatusMessage> : null}
        {success ? <AppStatusMessage tone="success">{success}</AppStatusMessage> : null}
        {error ? <AppStatusMessage tone="error">{error}</AppStatusMessage> : null}

        <AppCard style={{ minHeight: 0, flex: 1, display: "flex", flexDirection: "column", marginBottom: 0 }}>
          <div style={styles.tableShell}>
            <div ref={topScrollRef} className="employee-horizontal-scroll" style={styles.topScrollBar} aria-hidden="true">
              <div style={{ ...styles.bottomScrollSpacer, width: contentWidth }} />
            </div>

            <div ref={tableWrapRef} className="employee-grid-scroll" style={styles.tableWrap}>
              <table style={{ ...styles.table, width: contentWidth }}>
                <thead>
                  <tr>
                    {GRID_COLUMNS.map((column, columnIndex) => {
                      const isSorted = sortState?.key === column.key;

                      return (
                        <th
                          key={column.key}
                          style={{
                            ...styles.th,
                            width: column.width,
                            minWidth: column.width,
                            maxWidth: column.width,
                            ...(column.sticky
                              ? {
                                  ...styles.stickyTh,
                                  left: stickyOffsets[columnIndex] ?? 0,
                                }
                              : {}),
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => handleSortColumn(column.key)}
                            style={styles.headerButton}
                            aria-label={`Ordenar por ${column.label}`}
                          >
                            <span style={styles.headerLabel}>{column.label}</span>
                            {isSorted ? (
                              sortState.direction === "asc" ? (
                                <ArrowUp size={14} />
                              ) : (
                                <ArrowDown size={14} />
                              )
                            ) : (
                              <ArrowUpDown size={14} />
                            )}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.length === 0 ? (
                    <tr>
                      <td colSpan={GRID_COLUMNS.length} style={styles.emptyCell}>
                        No se encontraron registros.
                      </td>
                    </tr>
                  ) : (
                    sortedRows.map((row, rowIndex) => (
                      <tr key={`${rowIndex}-${normalizeText(row.idEmpleado)}`} style={rowIndex % 2 === 0 ? styles.rowEven : styles.rowOdd}>
                        {GRID_COLUMNS.map((column, columnIndex) => {
                          const rowId = Number(row.idEmpleado);
                          const isEditableDate = isEditableDateColumn(column.key);
                          const isActiveCell =
                            isEditableDate &&
                            ((editingCell?.rowId === rowId && editingCell.columnKey === column.key) ||
                              (hoveredCell?.rowId === rowId && hoveredCell.columnKey === column.key));
                          const isSaving = savingCell?.rowId === rowId && savingCell.columnKey === column.key;

                          return (
                            <td
                              key={`${rowIndex}-${column.key}`}
                              title={formatCell(row[column.key])}
                              onMouseEnter={
                                isEditableDate
                                  ? () =>
                                      setHoveredCell({
                                        rowId,
                                        columnKey: column.key as EditableDateColumn,
                                      })
                                  : undefined
                              }
                              onMouseLeave={
                                isEditableDate
                                  ? () =>
                                      setHoveredCell((current) =>
                                        current?.rowId === rowId && current.columnKey === column.key ? null : current,
                                      )
                                  : undefined
                              }
                              style={{
                                ...styles.td,
                                width: column.width,
                                minWidth: column.width,
                                maxWidth: column.width,
                                ...(isEditableDate ? styles.dateCell : {}),
                                ...(column.sticky
                                  ? {
                                      ...styles.stickyTd,
                                      left: stickyOffsets[columnIndex] ?? 0,
                                      background: rowIndex % 2 === 0 ? "#FFFFFF" : "#FAFCFF",
                                    }
                                  : {}),
                              }}
                            >
                              {isActiveCell ? (
                                <input
                                  autoFocus={editingCell?.rowId === rowId && editingCell.columnKey === column.key}
                                  type="date"
                                  value={editingCell?.rowId === rowId && editingCell.columnKey === column.key ? draftDateValue : toDateInputValue(row[column.key])}
                                  onFocus={() => {
                                    setEditingCell({ rowId, columnKey: column.key as EditableDateColumn });
                                    setDraftDateValue(toDateInputValue(row[column.key]));
                                  }}
                                  onChange={(event) => {
                                    setEditingCell({ rowId, columnKey: column.key as EditableDateColumn });
                                    setDraftDateValue(event.target.value);
                                  }}
                                  onBlur={(event) => {
                                    void saveDateCell(row, column.key as EditableDateColumn, event.target.value);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Escape") {
                                      setEditingCell(null);
                                      setHoveredCell(null);
                                      setDraftDateValue("");
                                    }
                                  }}
                                  disabled={isSaving}
                                  style={styles.inlineDateInput}
                                />
                              ) : isEditableDate ? (
                                formatDateCell(row[column.key])
                              ) : (
                                formatCell(row[column.key])
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div ref={bottomScrollRef} className="employee-horizontal-scroll" style={styles.bottomScrollBar} aria-hidden="true">
              <div style={{ ...styles.bottomScrollSpacer, width: contentWidth }} />
            </div>
          </div>
        </AppCard>
      </div>
    </AppPage>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minHeight: 0,
  },
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 16,
  },
  summaryBadge: {
    borderRadius: 999,
    padding: "8px 14px",
    background: "#EFF6FF",
    color: "#1D4ED8",
    fontSize: 13,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  toolbar: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto auto",
    gap: 12,
    alignItems: "end",
  },
  searchField: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
  },
  label: {
    fontSize: 12,
    fontWeight: 800,
    color: "#334155",
  },
  searchBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid #CBD5E1",
    borderRadius: 12,
    padding: "0 12px",
    background: "#FFFFFF",
    minHeight: 44,
  },
  searchInput: {
    border: "none",
    outline: "none",
    width: "100%",
    fontSize: 14,
    color: "#0F172A",
    background: "transparent",
  },
  primaryButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    border: "none",
    borderRadius: 12,
    padding: "12px 18px",
    background: "linear-gradient(180deg, #1D4ED8 0%, #0F172A 100%)",
    color: "#FFFFFF",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
    boxShadow: "0 10px 22px rgba(15,23,42,0.14)",
    minHeight: 44,
  },
  secondaryButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    border: "1px solid #CBD5E1",
    borderRadius: 12,
    padding: "12px 18px",
    background: "#FFFFFF",
    color: "#0F172A",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    minHeight: 44,
  },
  filterCard: {
    border: "1px solid #E2E8F0",
    background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
  },
  filterHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 14,
  },
  filterTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    color: "#0F172A",
  },
  filterSubtitle: {
    margin: "4px 0 0",
    fontSize: 13,
    color: "#64748B",
  },
  filterActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  filterBadge: {
    borderRadius: 999,
    padding: "8px 12px",
    background: "#EFF6FF",
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  filterGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 12,
  },
  secondaryFilterSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTop: "1px solid #E2E8F0",
  },
  secondaryFilterHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  secondaryFilterTitle: {
    margin: 0,
    fontSize: 13,
    fontWeight: 800,
    color: "#0F172A",
  },
  secondaryFilterHint: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 600,
  },
  filterField: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: 800,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  filterInput: {
    border: "1px solid #CBD5E1",
    borderRadius: 12,
    minHeight: 40,
    padding: "0 12px",
    background: "#FFFFFF",
    fontSize: 14,
    color: "#0F172A",
    outline: "none",
    width: "100%",
  },
  tableShell: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    gap: 12,
  },
  topScrollBar: {
    width: "100%",
    overflowX: "auto",
    overflowY: "hidden",
    height: 18,
    position: "sticky",
    top: 0,
    zIndex: 3,
    background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
    border: "1px solid #E2E8F0",
    borderRadius: 10,
    scrollbarWidth: "thin",
    scrollbarColor: "#94A3B8 #E2E8F0",
  },
  tableWrap: {
    width: "100%",
    overflowX: "auto",
    overflowY: "scroll",
    borderRadius: 14,
    border: "1px solid #E2E8F0",
    flex: 1,
    minHeight: 0,
    maxHeight: "calc(100vh - 430px)",
    scrollbarGutter: "stable",
  },
  table: {
    minWidth: 1200,
    borderCollapse: "collapse",
    background: "#FFFFFF",
  },
  th: {
    position: "sticky",
    top: 0,
    zIndex: 2,
    textAlign: "left",
    padding: 0,
    fontSize: 12,
    fontWeight: 800,
    color: "#334155",
    background: "#F8FAFC",
    borderBottom: "1px solid #E2E8F0",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  stickyTh: {
    position: "sticky",
    zIndex: 5,
    background: "#F8FAFC",
    boxShadow: "2px 0 0 #E2E8F0",
  },
  headerButton: {
    width: "100%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "12px 14px",
    border: "none",
    background: "transparent",
    color: "inherit",
    font: "inherit",
    fontWeight: 800,
    cursor: "pointer",
    textAlign: "left",
  },
  headerLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "10px 14px",
    borderBottom: "1px solid #EEF2F7",
    fontSize: 13,
    color: "#0F172A",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  dateCell: {
    padding: 0,
  },
  inlineDateInput: {
    width: "100%",
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: 13,
    fontWeight: 700,
    color: "#0F172A",
    padding: "10px 14px",
    boxSizing: "border-box",
  },
  stickyTd: {
    position: "sticky",
    zIndex: 4,
    boxShadow: "2px 0 0 rgba(226,232,240,0.9)",
  },
  rowEven: {
    background: "#FFFFFF",
  },
  rowOdd: {
    background: "#FAFCFF",
  },
  emptyCell: {
    padding: 18,
    textAlign: "center",
    color: "#64748B",
    fontSize: 13,
  },
  bottomScrollBar: {
    width: "100%",
    overflowX: "auto",
    overflowY: "hidden",
    height: 18,
    marginTop: 6,
    background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
    border: "1px solid #E2E8F0",
    borderRadius: 10,
    scrollbarWidth: "thin",
    scrollbarColor: "#94A3B8 #E2E8F0",
  },
  bottomScrollSpacer: {
    height: 1,
  },
};



