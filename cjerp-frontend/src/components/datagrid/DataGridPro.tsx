import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Download,
  Filter,
  FilterX,
  GripVertical,
  Search,
  X,
} from "lucide-react";
import {
  buildGroupTree,
  collectGroupKeys,
  compareValues,
  flattenGroups,
  formatSummary,
  formatValue,
  getCellValue,
  getValue,
  matchesFilter,
  normalizeText,
  toDateKey,
} from "./gridEngine";
import type {
  CellChangedEvent,
  DisplayItem,
  GridColumn,
  GridSort,
  GridSummaryItem,
  SortOrder,
} from "./types";

export type DataGridProProps<T extends object> = {
  dataSource: T[];
  columns: GridColumn<T>[];
  /** Campo único de cada fila (obligatorio para selección, edición y detalle). */
  keyExpr: string | ((row: T) => string);
  /** Alto máximo del área de filas; `"fill"` ocupa todo el alto disponible del contenedor (flex). */
  height?: number | string;
  loading?: boolean;
  noDataText?: string;
  showFilterRow?: boolean;
  showSearchPanel?: boolean;
  showGroupPanel?: boolean;
  showColumnChooser?: boolean;
  allowColumnResizing?: boolean;
  allowColumnReordering?: boolean;
  allowExport?: boolean;
  exportFileName?: string;
  rowAlternation?: boolean;
  /** `false` desactiva la paginación. */
  paging?: false | { pageSize?: number; pageSizes?: number[] };
  selection?: "none" | "single" | "multiple";
  onSelectionChanged?: (keys: string[], rows: T[]) => void;
  editing?: {
    allowUpdating?: boolean;
    onCellChanged?: (event: CellChangedEvent<T>) => void;
  };
  summary?: { totalItems?: GridSummaryItem[]; groupItems?: GridSummaryItem[] };
  masterDetail?: (row: T) => React.ReactNode;
  /** Si se indica, orden/ancho/visibilidad/agrupación/orden se guardan en localStorage. */
  stateStoringKey?: string;
  toolbarExtra?: React.ReactNode;
  onRowClick?: (row: T) => void;
  onRowDoubleClick?: (row: T) => void;
  rowStyle?: (row: T) => React.CSSProperties | undefined;
  /** Clase CSS del contenedor raíz. */
  className?: string;
  /** Selección controlada (claves de `keyExpr`). Si se omite, la grilla la administra. */
  selectedKeys?: string[];
  /** Fila enfocada controlada. Si se omite, la grilla la administra. */
  focusedRowKey?: string | null;
  /** `false`: los grupos inician contraídos. */
  autoExpandAll?: boolean;
  /** Fondo propio de la fila; si devuelve valor, reemplaza el calculado. */
  rowBackground?: (row: T, focused: boolean) => string | undefined;
  rowClassName?: (row: T, focused: boolean) => string | undefined;
  /** Contenido extra al final del encabezado de cada grupo (p. ej. totales por moneda). */
  /**
   * Notifica las filas que pasan los filtros, la búsqueda y los filtros de encabezado
   * (ordenadas, antes de paginar y sin importar si su grupo está contraído).
   * Solo se dispara cuando cambia el conjunto o el orden de filas.
   */
  onVisibleRowsChange?: (rows: T[]) => void;
  /** Filas que pueden marcarse (por defecto todas). Las demás muestran el checkbox deshabilitado. */
  isRowSelectable?: (row: T) => boolean;
  /** Deshabilita todos los checkboxes (p. ej. mientras se guarda). */
  selectionDisabled?: boolean;
  /** Agrupación controlada por la página; al cambiar, la grilla la aplica y contrae los grupos. */
  groupFields?: string[];
  /** Relleno de las celdas de datos (CSS), p. ej. "2px 8px" para filas compactas. */
  rowPadding?: string;
  groupSummaryRender?: (group: { field: string; value: unknown; rows: T[] }) => React.ReactNode;
};

type PersistedState = {
  order?: string[];
  widths?: Record<string, number>;
  hidden?: string[];
  groups?: string[];
  sort?: GridSort[];
  pageSize?: number;
};

const DEFAULT_WIDTH = 140;
const SELECT_WIDTH = 40;
const DETAIL_WIDTH = 36;
const HEADER_HEIGHT = 40;
const FILTER_HEIGHT = 38;
const DEFAULT_PAGE_SIZES = [10, 25, 50, 100];

function loadState(key?: string): PersistedState {
  if (!key) return {};
  try {
    const raw = window.localStorage.getItem(`datagrid:${key}`);
    return raw ? (JSON.parse(raw) as PersistedState) : {};
  } catch {
    return {};
  }
}

function saveState(key: string | undefined, state: PersistedState) {
  if (!key) return;
  try {
    window.localStorage.setItem(`datagrid:${key}`, JSON.stringify(state));
  } catch {
    /* almacenamiento no disponible */
  }
}

export default function DataGridPro<T extends object>({
  dataSource,
  columns,
  keyExpr,
  height = 520,
  loading = false,
  noDataText = "No hay datos disponibles.",
  showFilterRow = true,
  showSearchPanel = true,
  showGroupPanel = true,
  showColumnChooser = true,
  allowColumnResizing = true,
  allowColumnReordering = true,
  allowExport = true,
  exportFileName = "export",
  rowAlternation = true,
  paging = {},
  selection = "none",
  onSelectionChanged,
  editing,
  summary,
  masterDetail,
  stateStoringKey,
  toolbarExtra,
  onRowClick,
  onRowDoubleClick,
  rowStyle,
  className,
  selectedKeys,
  focusedRowKey,
  autoExpandAll = true,
  rowBackground,
  rowClassName,
  groupSummaryRender,
  rowPadding,
  onVisibleRowsChange,
  isRowSelectable,
  selectionDisabled = false,
  groupFields,
}: DataGridProProps<T>) {
  const colMap = useMemo(() => new Map(columns.map((c) => [c.dataField, c])), [columns]);
  const pagingEnabled = paging !== false;
  const pageSizes = (paging !== false && paging.pageSizes) || DEFAULT_PAGE_SIZES;

  const [initial] = useState(() => loadState(stateStoringKey));
  const [order, setOrder] = useState<string[]>(initial.order ?? columns.map((c) => c.dataField));
  const [widths, setWidths] = useState<Record<string, number>>(initial.widths ?? {});
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(initial.hidden ?? columns.filter((c) => c.visible === false).map((c) => c.dataField))
  );
  const [groups, setGroups] = useState<string[]>(
    () =>
      initial.groups ??
      columns
        .filter((c) => c.groupIndex != null)
        .sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0))
        .map((c) => c.dataField)
  );
  const [sort, setSort] = useState<GridSort[]>(
    () =>
      initial.sort ??
      columns.filter((c) => c.sortOrder).map((c) => ({ field: c.dataField, order: c.sortOrder as SortOrder }))
  );
  const [pageSize, setPageSize] = useState<number>(
    initial.pageSize ?? (paging !== false ? paging.pageSize : undefined) ?? 25
  );
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [headerFilters, setHeaderFilters] = useState<Record<string, string[]>>({});
  const [headerFilterOpen, setHeaderFilterOpen] = useState<{ field: string; top: number; left: number } | null>(null);
  const [toggledGroups, setToggledGroups] = useState<Set<string>>(new Set());
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const selected = useMemo(
    () => (selectedKeys ? new Set(selectedKeys) : internalSelected),
    [selectedKeys, internalSelected]
  );
  const [expandedDetail, setExpandedDetail] = useState<Set<string>>(new Set());
  const [internalFocusedKey, setInternalFocusedKey] = useState<string | null>(null);
  const focusedKey = focusedRowKey !== undefined ? focusedRowKey : internalFocusedKey;
  const [editingCell, setEditingCell] = useState<{ key: string; field: string } | null>(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [dropGroupHover, setDropGroupHover] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dragField = useRef<string | null>(null);
  const resizing = useRef<{ field: string; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    saveState(stateStoringKey, {
      order,
      widths,
      hidden: [...hidden],
      groups,
      sort,
      pageSize,
    });
  }, [stateStoringKey, order, widths, hidden, groups, sort, pageSize]);

  const groupFieldsKey = groupFields?.join("|");
  const [appliedGroupFieldsKey, setAppliedGroupFieldsKey] = useState<string | undefined>(undefined);
  if (groupFieldsKey !== appliedGroupFieldsKey) {
    // Agrupación controlada: se aplica al cambiar la prop (ajuste de estado durante el render).
    setAppliedGroupFieldsKey(groupFieldsKey);
    if (groupFieldsKey !== undefined) {
      setGroups(groupFieldsKey ? groupFieldsKey.split("|") : []);
      setToggledGroups(new Set());
      setPage(0);
    }
  }

  const orderedFields = useMemo(() => {
    const known = order.filter((f) => colMap.has(f));
    const missing = columns.map((c) => c.dataField).filter((f) => !known.includes(f));
    return [...known, ...missing];
  }, [order, columns, colMap]);

  const visibleCols = useMemo(() => {
    const list = orderedFields
      .filter((f) => !hidden.has(f) && !groups.includes(f))
      .map((f) => colMap.get(f) as GridColumn<T>);
    return [...list.filter((c) => c.fixed), ...list.filter((c) => !c.fixed)];
  }, [orderedFields, hidden, groups, colMap]);

  const widthOf = useCallback(
    (c: GridColumn<T>) => Math.max(widths[c.dataField] ?? c.width ?? DEFAULT_WIDTH, c.minWidth ?? 50),
    [widths]
  );

  const getKey = useCallback(
    (row: T) => (typeof keyExpr === "function" ? keyExpr(row) : String(getValue(row, keyExpr))),
    [keyExpr]
  );

  // ---------- Pipeline de datos: filtro → búsqueda → orden → agrupación ----------
  const filtered = useMemo(() => {
    const active = Object.entries(filters).filter(([, v]) => v.trim() !== "");
    const headerActive = Object.entries(headerFilters).map(
      ([field, values]) => [field, new Set(values)] as const
    );
    const query = normalizeText(search.trim());
    const searchCols = orderedFields
      .filter((f) => !hidden.has(f))
      .map((f) => colMap.get(f) as GridColumn<T>)
      .filter((c) => c.allowSearch !== false);
    return dataSource.filter((row) => {
      for (const [field, text] of active) {
        const col = colMap.get(field);
        if (col && !matchesFilter(getCellValue(row, col, field), col, text)) return false;
      }
      for (const [field, allowed] of headerActive) {
        const col = colMap.get(field);
        if (col && !allowed.has(formatValue(col, getCellValue(row, col, field)))) return false;
      }
      if (query) {
        return searchCols.some((c) =>
          normalizeText(formatValue(c, getCellValue(row, c, c.dataField))).includes(query)
        );
      }
      return true;
    });
  }, [dataSource, filters, headerFilters, search, orderedFields, hidden, colMap]);

  const sorted = useMemo(() => {
    if (sort.length === 0) return filtered;
    return [...filtered].sort((a, b) => {
      for (const s of sort) {
        const col = colMap.get(s.field);
        const result = compareValues(getCellValue(a, col, s.field), getCellValue(b, col, s.field), col?.dataType);
        if (result !== 0) return s.order === "asc" ? result : -result;
      }
      return 0;
    });
  }, [filtered, sort, colMap]);

  const lastVisibleRows = useRef<T[] | null>(null);
  useEffect(() => {
    const previous = lastVisibleRows.current;
    if (previous && previous.length === sorted.length && previous.every((row, i) => row === sorted[i])) return;
    lastVisibleRows.current = sorted;
    onVisibleRowsChange?.(sorted);
  }, [sorted, onVisibleRowsChange]);

  const tree = useMemo(() => {
    if (groups.length === 0) return null;
    const groupOrder = new Map(sort.map((s) => [s.field, s.order]));
    return buildGroupTree(sorted, groups, colMap, groupOrder);
  }, [sorted, groups, sort, colMap]);

  const collapsed = useMemo(() => {
    if (autoExpandAll) return toggledGroups;
    if (!tree) return new Set<string>();
    return new Set(collectGroupKeys(tree).filter((key) => !toggledGroups.has(key)));
  }, [autoExpandAll, toggledGroups, tree]);

  const items = useMemo<DisplayItem<T>[]>(
    () => (tree ? flattenGroups(tree, collapsed) : sorted.map((row) => ({ type: "row", row }))),
    [tree, sorted, collapsed]
  );

  const totalPages = pagingEnabled ? Math.max(1, Math.ceil(items.length / pageSize)) : 1;
  const currentPage = Math.min(page, totalPages - 1);
  const pageItems = pagingEnabled
    ? items.slice(currentPage * pageSize, currentPage * pageSize + pageSize)
    : items;

  // ---------- Selección ----------
  const emitSelection = (next: Set<string>) => {
    setInternalSelected(next);
    onSelectionChanged?.(
      [...next],
      dataSource.filter((row) => next.has(getKey(row)))
    );
  };

  const rowSelectable = (row: T) => !selectionDisabled && (isRowSelectable ? isRowSelectable(row) : true);

  const toggleSelect = (row: T) => {
    if (!rowSelectable(row)) return;
    const key = getKey(row);
    if (selection === "single") {
      emitSelection(selected.has(key) ? new Set() : new Set([key]));
      return;
    }
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    emitSelection(next);
  };

  const selectableFiltered = useMemo(
    () => filtered.filter((row) => !isRowSelectable || isRowSelectable(row)),
    [filtered, isRowSelectable]
  );
  const allFilteredSelected =
    selectableFiltered.length > 0 && selectableFiltered.every((row) => selected.has(getKey(row)));
  const someFilteredSelected = selectableFiltered.some((row) => selected.has(getKey(row)));

  const toggleSelectAll = () => {
    if (selectionDisabled) return;
    const next = new Set(selected);
    if (allFilteredSelected) selectableFiltered.forEach((row) => next.delete(getKey(row)));
    else selectableFiltered.forEach((row) => next.add(getKey(row)));
    emitSelection(next);
  };

  // ---------- Orden / filtros / agrupación ----------
  const toggleSort = (field: string, multi: boolean) => {
    setSort((prev) => {
      const current = prev.find((s) => s.field === field);
      const others = multi ? prev.filter((s) => s.field !== field) : [];
      if (!current) return [...others, { field, order: "asc" }];
      if (current.order === "asc") return [...others, { field, order: "desc" }];
      return others;
    });
  };

  const setFilter = (field: string, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
    setPage(0);
  };

  const hasActiveFilters =
    search.trim() !== "" ||
    Object.values(filters).some((v) => v.trim() !== "") ||
    Object.keys(headerFilters).length > 0;

  const clearFilters = () => {
    setFilters({});
    setHeaderFilters({});
    setSearchInput("");
    setSearch("");
    setPage(0);
  };

  const addGroup = (field: string) => {
    const col = colMap.get(field);
    if (!col || col.allowGrouping === false || groups.includes(field)) return;
    setGroups((prev) => [...prev, field]);
    setToggledGroups(new Set());
    setPage(0);
  };

  const removeGroup = (field: string) => {
    setGroups((prev) => prev.filter((f) => f !== field));
    setToggledGroups(new Set());
  };

  const toggleGroup = (key: string) =>
    setToggledGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // ---------- Reordenar columnas por arrastre ----------
  const moveColumn = (from: string, to: string) => {
    if (from === to) return;
    const list = orderedFields.filter((f) => f !== from);
    const index = list.indexOf(to);
    list.splice(index < 0 ? list.length : index, 0, from);
    setOrder(list);
  };

  // ---------- Redimensionar columnas ----------
  const startResize = (event: React.MouseEvent, col: GridColumn<T>) => {
    event.preventDefault();
    event.stopPropagation();
    resizing.current = { field: col.dataField, startX: event.clientX, startWidth: widthOf(col) };
    const onMove = (e: MouseEvent) => {
      const state = resizing.current;
      if (!state) return;
      const width = Math.max(col.minWidth ?? 50, state.startWidth + e.clientX - state.startX);
      setWidths((prev) => ({ ...prev, [state.field]: width }));
    };
    const onUp = () => {
      resizing.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ---------- Exportar a Excel ----------
  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const exportCols = orderedFields
      .filter((f) => !hidden.has(f))
      .map((f) => colMap.get(f) as GridColumn<T>);
    const data = sorted.map((row) =>
      Object.fromEntries(
        exportCols.map((c) => {
          const value = getCellValue(row, c, c.dataField);
          const type = c.dataType ?? "string";
          const cell =
            type === "number" && !c.lookup && typeof value === "number" ? value : formatValue(c, value);
          return [c.caption ?? c.dataField, cell];
        })
      )
    );
    const sheet = XLSX.utils.json_to_sheet(data);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Datos");
    XLSX.writeFile(book, `${exportFileName}.xlsx`);
  };

  // ---------- Edición ----------
  const canEdit = (col: GridColumn<T>) =>
    Boolean(editing?.allowUpdating) && col.allowEditing !== false && !col.calculateCellValue;

  const commitEdit = (row: T, col: GridColumn<T>, value: unknown) => {
    setEditingCell(null);
    const oldValue = getCellValue(row, col, col.dataField);
    if (oldValue === value) return;
    editing?.onCellChanged?.({ row, key: getKey(row), field: col.dataField, oldValue, value });
  };

  // ---------- Layout ----------
  const extrasLeft = (selection !== "none" ? SELECT_WIDTH : 0) + (masterDetail ? DETAIL_WIDTH : 0);
  const fixedOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    let left = extrasLeft;
    for (const c of visibleCols) {
      if (!c.fixed) break;
      offsets.set(c.dataField, left);
      left += widthOf(c);
    }
    return offsets;
  }, [visibleCols, extrasLeft, widthOf]);

  const tableWidth = visibleCols.reduce((acc, c) => acc + widthOf(c), 0) + extrasLeft;
  const colSpanAll = visibleCols.length + (selection !== "none" ? 1 : 0) + (masterDetail ? 1 : 0);
  const totalItems = summary?.totalItems ?? [];
  const groupItems = summary?.groupItems ?? [];

  const tdStyle: React.CSSProperties = rowPadding ? { ...styles.td, padding: rowPadding } : styles.td;

  const alignOf = (c: GridColumn<T>) =>
    c.alignment ?? (c.dataType === "number" ? "right" : c.dataType === "boolean" ? "center" : "left");

  const stickyStyle = (c: GridColumn<T>, background: string): React.CSSProperties => {
    const left = fixedOffsets.get(c.dataField);
    return left == null ? {} : { position: "sticky", left, zIndex: 1, background };
  };

  const renderGroupLabel = (item: Extract<DisplayItem<T>, { type: "group" }>) => {
    const { node } = item;
    const col = colMap.get(node.field);
    const valueText = col ? formatValue(col, node.value) : String(node.value ?? "");
    const parts = groupItems.map((gi) => formatSummary(node.leaves, gi, colMap.get(gi.column)));
    const captionOf = (gi: GridSummaryItem) => colMap.get(gi.column)?.caption ?? gi.column;
    return (
      <>
        <strong>{col?.caption ?? node.field}:</strong> {valueText || "(vacío)"}{" "}
        <span style={styles.groupCount}>({node.leaves.length})</span>
        {parts.length > 0 ? (
          <span style={styles.groupSummary}>
            {" "}
            — {groupItems.map((gi, i) => `${captionOf(gi)} ${parts[i]}`).join(" · ")}
          </span>
        ) : null}
        {groupSummaryRender
          ? groupSummaryRender({ field: node.field, value: node.value, rows: node.leaves })
          : null}
      </>
    );
  };

  const toggleGroupSelection = (leaves: T[], checked: boolean) => {
    if (selectionDisabled) return;
    const next = new Set(selected);
    leaves
      .filter((row) => !isRowSelectable || isRowSelectable(row))
      .forEach((row) => (checked ? next.add(getKey(row)) : next.delete(getKey(row))));
    emitSelection(next);
  };

  const renderCell = (row: T, col: GridColumn<T>) => {
    const key = getKey(row);
    const value = getCellValue(row, col, col.dataField);
    if (editingCell && editingCell.key === key && editingCell.field === col.dataField) {
      return (
        <CellEditor
          col={col}
          value={value}
          onCommit={(v) => commitEdit(row, col, v)}
          onCancel={() => setEditingCell(null)}
        />
      );
    }
    if (col.cellRender) return col.cellRender(value, row);
    if (col.dataType === "boolean") {
      return <input type="checkbox" checked={Boolean(value)} readOnly disabled style={{ margin: 0 }} />;
    }
    return formatValue(col, value);
  };

  return (
    <div className={className} style={height === "fill" ? { ...styles.root, flex: 1, minHeight: 0 } : styles.root}>
      {/* Panel de agrupación y barra de herramientas */}
      <div style={styles.toolbar}>
        {showGroupPanel ? (
          <div
            style={{ ...styles.groupPanel, ...(dropGroupHover ? styles.groupPanelHover : null) }}
            onDragOver={(e) => {
              if (dragField.current) {
                e.preventDefault();
                setDropGroupHover(true);
              }
            }}
            onDragLeave={() => setDropGroupHover(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDropGroupHover(false);
              if (dragField.current) addGroup(dragField.current);
              dragField.current = null;
            }}
          >
            {groups.length === 0 ? (
              <span style={styles.groupPlaceholder}>
                Arrastre un encabezado de columna aquí para agrupar
              </span>
            ) : (
              groups.map((field) => {
                const col = colMap.get(field);
                const current = sort.find((s) => s.field === field);
                return (
                  <span key={field} style={styles.chip}>
                    <button
                      type="button"
                      style={styles.chipButton}
                      onClick={() => toggleSort(field, false)}
                      title="Cambiar orden del grupo"
                    >
                      {col?.caption ?? field}
                      {current ? (
                        current.order === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                      ) : null}
                    </button>
                    <button
                      type="button"
                      style={styles.chipButton}
                      onClick={() => removeGroup(field)}
                      title="Quitar agrupación"
                    >
                      <X size={12} />
                    </button>
                  </span>
                );
              })
            )}
          </div>
        ) : (
          <div style={{ flex: 1 }} />
        )}

        {groups.length > 0 && tree ? (
          <>
            <button type="button" style={styles.toolButton} onClick={() => setToggledGroups(autoExpandAll ? new Set() : new Set(collectGroupKeys(tree)))}>
              Expandir
            </button>
            <button
              type="button"
              style={styles.toolButton}
              onClick={() => setToggledGroups(autoExpandAll ? new Set(collectGroupKeys(tree)) : new Set())}
            >
              Contraer
            </button>
          </>
        ) : null}

        {toolbarExtra}

        {hasActiveFilters ? (
          <button type="button" style={styles.toolButton} onClick={clearFilters} title="Limpiar filtros">
            <FilterX size={14} /> Limpiar
          </button>
        ) : null}

        {allowExport ? (
          <button type="button" style={styles.toolButton} onClick={() => void exportExcel()} title="Exportar a Excel">
            <Download size={14} /> Excel
          </button>
        ) : null}

        {showColumnChooser ? (
          <div style={{ position: "relative" }}>
            <button
              type="button"
              style={styles.toolButton}
              onClick={() => setChooserOpen((v) => !v)}
              title="Selector de columnas"
            >
              <Columns3 size={14} /> Columnas <ChevronDown size={12} />
            </button>
            {chooserOpen ? (
              <div style={styles.chooser}>
                {orderedFields.map((field) => {
                  const col = colMap.get(field) as GridColumn<T>;
                  return (
                    <label key={field} style={styles.chooserItem}>
                      <input
                        type="checkbox"
                        checked={!hidden.has(field)}
                        onChange={() =>
                          setHidden((prev) => {
                            const next = new Set(prev);
                            if (next.has(field)) next.delete(field);
                            else next.add(field);
                            return next;
                          })
                        }
                      />
                      {col.caption ?? field}
                    </label>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        {showSearchPanel ? (
          <div style={styles.searchBox}>
            <Search size={14} color="#64748B" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar..."
              style={styles.searchInput}
            />
          </div>
        ) : null}
      </div>

      {/* Tabla */}
      <div style={height === "fill" ? { ...styles.scroll, flex: 1, minHeight: 0 } : { ...styles.scroll, maxHeight: height }}>
        <table style={{ ...styles.table, width: tableWidth, minWidth: "100%" }}>
          <colgroup>
            {selection !== "none" ? <col style={{ width: SELECT_WIDTH }} /> : null}
            {masterDetail ? <col style={{ width: DETAIL_WIDTH }} /> : null}
            {visibleCols.map((c) => (
              <col key={c.dataField} style={{ width: widthOf(c) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {selection !== "none" ? (
                <th style={{ ...styles.th, ...styles.stickyHead, left: 0, zIndex: 4, textAlign: "center" }}>
                  {selection === "multiple" ? (
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      disabled={selectionDisabled || selectableFiltered.length === 0}
                      ref={(el) => {
                        if (el) el.indeterminate = !allFilteredSelected && someFilteredSelected;
                      }}
                      onChange={toggleSelectAll}
                    />
                  ) : null}
                </th>
              ) : null}
              {masterDetail ? (
                <th style={{ ...styles.th, ...styles.stickyHead, left: selection !== "none" ? SELECT_WIDTH : 0, zIndex: 4 }} />
              ) : null}
              {visibleCols.map((c) => {
                const sortState = sort.find((s) => s.field === c.dataField);
                const sortable = c.allowSorting !== false;
                const draggable = allowColumnReordering || (showGroupPanel && c.allowGrouping !== false);
                return (
                  <th
                    key={c.dataField}
                    draggable={draggable}
                    onDragStart={(e) => {
                      dragField.current = c.dataField;
                      e.dataTransfer.setData("text/plain", c.dataField);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      dragField.current = null;
                      setDropTarget(null);
                    }}
                    onDragOver={(e) => {
                      if (allowColumnReordering && dragField.current && dragField.current !== c.dataField) {
                        e.preventDefault();
                        setDropTarget(c.dataField);
                      }
                    }}
                    onDragLeave={() => setDropTarget((t) => (t === c.dataField ? null : t))}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (allowColumnReordering && dragField.current) moveColumn(dragField.current, c.dataField);
                      dragField.current = null;
                      setDropTarget(null);
                    }}
                    onClick={(e) => sortable && toggleSort(c.dataField, e.shiftKey || e.ctrlKey)}
                    style={{
                      ...styles.th,
                      ...styles.stickyHead,
                      ...(fixedOffsets.has(c.dataField)
                        ? { left: fixedOffsets.get(c.dataField), zIndex: 4 }
                        : null),
                      textAlign: alignOf(c),
                      cursor: sortable ? "pointer" : "default",
                      ...(dropTarget === c.dataField ? { boxShadow: "inset 3px 0 0 #2563EB" } : null),
                    }}
                    title={sortable ? "Clic: ordenar · Mayús/Ctrl+clic: orden múltiple" : undefined}
                  >
                    <span style={styles.headerContent}>
                      {draggable ? <GripVertical size={12} color="#94A3B8" /> : null}
                      <span style={styles.headerText}>{c.caption ?? c.dataField}</span>
                      {c.allowHeaderFilter !== false ? (
                        <button
                          type="button"
                          draggable={false}
                          title="Filtrar por valores"
                          style={{
                            ...styles.headerFilterButton,
                            color: headerFilters[c.dataField] ? "#2563EB" : "#94A3B8",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            setHeaderFilterOpen({
                              field: c.dataField,
                              top: rect.bottom + 4,
                              left: Math.max(8, Math.min(rect.left, window.innerWidth - 268)),
                            });
                          }}
                        >
                          <Filter size={12} fill={headerFilters[c.dataField] ? "currentColor" : "none"} />
                        </button>
                      ) : null}
                      {sortState ? (
                        <span style={styles.sortBadge}>
                          {sortState.order === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
                          {sort.length > 1 ? sort.findIndex((s) => s.field === c.dataField) + 1 : null}
                        </span>
                      ) : null}
                    </span>
                    {allowColumnResizing && c.allowResizing !== false ? (
                      <span
                        style={styles.resizer}
                        onMouseDown={(e) => startResize(e, c)}
                        onClick={(e) => e.stopPropagation()}
                        draggable={false}
                      />
                    ) : null}
                  </th>
                );
              })}
            </tr>
            {showFilterRow ? (
              <tr>
                {selection !== "none" ? (
                  <th style={{ ...styles.thFilter, left: 0, zIndex: 4 }} />
                ) : null}
                {masterDetail ? (
                  <th style={{ ...styles.thFilter, left: selection !== "none" ? SELECT_WIDTH : 0, zIndex: 4 }} />
                ) : null}
                {visibleCols.map((c) => (
                  <th
                    key={c.dataField}
                    style={{
                      ...styles.thFilter,
                      ...(fixedOffsets.has(c.dataField)
                        ? { left: fixedOffsets.get(c.dataField), zIndex: 4 }
                        : null),
                    }}
                  >
                    {c.allowFiltering === false ? null : (
                      <FilterCell col={c} value={filters[c.dataField] ?? ""} onChange={(v) => setFilter(c.dataField, v)} />
                    )}
                  </th>
                ))}
              </tr>
            ) : null}
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colSpanAll} style={styles.emptyCell}>Cargando...</td>
              </tr>
            ) : pageItems.length === 0 ? (
              <tr>
                <td colSpan={colSpanAll} style={styles.emptyCell}>{noDataText}</td>
              </tr>
            ) : (
              pageItems.map((item, index) => {
                if (item.type === "group") {
                  const isCollapsed = collapsed.has(item.node.key);
                  return (
                    <tr
                      key={`g:${item.node.key}`}
                      style={styles.groupRow}
                      onClick={() => toggleGroup(item.node.key)}
                    >
                      <td colSpan={colSpanAll} style={{ ...tdStyle, paddingLeft: 10 + item.node.level * 22 }}>
                        <span style={styles.groupToggle}>
                          {selection === "multiple" ? (
                            <input
                              type="checkbox"
                              disabled={selectionDisabled || !item.node.leaves.some((row) => !isRowSelectable || isRowSelectable(row))}
                              checked={(() => {
                                const own = item.node.leaves.filter((row) => !isRowSelectable || isRowSelectable(row));
                                return own.length > 0 && own.every((row) => selected.has(getKey(row)));
                              })()}
                              ref={(el) => {
                                if (el) {
                                  const own = item.node.leaves.filter((row) => !isRowSelectable || isRowSelectable(row));
                                  const all = own.length > 0 && own.every((row) => selected.has(getKey(row)));
                                  const some = own.some((row) => selected.has(getKey(row)));
                                  el.indeterminate = !all && some;
                                }
                              }}
                              onChange={(e) => toggleGroupSelection(item.node.leaves, e.target.checked)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : null}
                          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          {renderGroupLabel(item)}
                        </span>
                      </td>
                    </tr>
                  );
                }

                const row = item.row;
                const key = getKey(row);
                const isSelected = selected.has(key);
                const isFocused = focusedKey === key;
                const background =
                  rowBackground?.(row, isFocused) ??
                  (isSelected
                    ? "#DBEAFE"
                    : isFocused
                    ? "#EFF6FF"
                    : rowAlternation && index % 2 === 1
                    ? "#F8FAFC"
                    : "#FFFFFF");
                const detailOpen = expandedDetail.has(key);

                return (
                  <React.Fragment key={`r:${key}`}>
                    <tr
                      className={rowClassName?.(row, isFocused)}
                      style={{ background, ...rowStyle?.(row) }}
                      onClick={() => {
                        setInternalFocusedKey(key);
                        onRowClick?.(row);
                      }}
                      onDoubleClick={() => onRowDoubleClick?.(row)}
                    >
                      {selection !== "none" ? (
                        <td style={{ ...tdStyle, position: "sticky", left: 0, zIndex: 1, background, textAlign: "center" }}>
                          <input type="checkbox" checked={isSelected} disabled={!rowSelectable(row)} onChange={() => toggleSelect(row)} onClick={(e) => e.stopPropagation()} />
                        </td>
                      ) : null}
                      {masterDetail ? (
                        <td
                          style={{ ...styles.td, position: "sticky", left: selection !== "none" ? SELECT_WIDTH : 0, zIndex: 1, background, textAlign: "center", padding: 0 }}
                        >
                          <button
                            type="button"
                            style={styles.iconButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedDetail((prev) => {
                                const next = new Set(prev);
                                if (next.has(key)) next.delete(key);
                                else next.add(key);
                                return next;
                              });
                            }}
                          >
                            {detailOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </td>
                      ) : null}
                      {visibleCols.map((c) => (
                        <td
                          key={c.dataField}
                          style={{
                            ...tdStyle,
                            ...stickyStyle(c, background),
                            textAlign: alignOf(c),
                            ...c.cellStyle?.(getCellValue(row, c, c.dataField), row),
                          }}
                          onDoubleClick={() => {
                            if (canEdit(c)) setEditingCell({ key, field: c.dataField });
                          }}
                        >
                          {renderCell(row, c)}
                        </td>
                      ))}
                    </tr>
                    {masterDetail && detailOpen ? (
                      <tr>
                        <td colSpan={colSpanAll} style={styles.detailCell}>
                          {masterDetail(row)}
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })
            )}
          </tbody>

          {totalItems.length > 0 ? (
            <tfoot>
              <tr>
                {selection !== "none" ? <td style={styles.tfootCell} /> : null}
                {masterDetail ? <td style={styles.tfootCell} /> : null}
                {visibleCols.map((c) => (
                  <td key={c.dataField} style={{ ...styles.tfootCell, textAlign: alignOf(c) }}>
                    {totalItems
                      .filter((item) => item.column === c.dataField)
                      .map((item, i) => (
                        <div key={i}>{formatSummary(filtered, item, c)}</div>
                      ))}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {headerFilterOpen && colMap.get(headerFilterOpen.field) ? (
        <HeaderFilterPopover
          col={colMap.get(headerFilterOpen.field) as GridColumn<T>}
          rows={dataSource}
          position={headerFilterOpen}
          selected={headerFilters[headerFilterOpen.field]}
          onClose={() => setHeaderFilterOpen(null)}
          onApply={(values) => {
            const field = headerFilterOpen.field;
            setHeaderFilters((prev) => {
              const next = { ...prev };
              if (values) next[field] = values;
              else delete next[field];
              return next;
            });
            setPage(0);
            setHeaderFilterOpen(null);
          }}
        />
      ) : null}

      {/* Paginador */}
      <div style={styles.pager}>
        <span style={styles.pagerInfo}>
          {filtered.length === dataSource.length
            ? `${dataSource.length} registros`
            : `${filtered.length} de ${dataSource.length} registros`}
          {selected.size > 0 ? ` · ${selected.size} seleccionados` : ""}
        </span>
        {pagingEnabled ? (
          <>
            <span style={{ flex: 1 }} />
            <label style={styles.pagerInfo}>
              Filas:{" "}
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(0);
                }}
                style={styles.pageSelect}
              >
                {pageSizes.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </label>
            <span style={styles.pagerInfo}>
              Página {currentPage + 1} de {totalPages}
            </span>
            <button type="button" style={styles.iconButton} disabled={currentPage === 0} onClick={() => setPage(0)}>
              <ChevronsLeft size={16} />
            </button>
            <button type="button" style={styles.iconButton} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
              <ChevronLeft size={16} />
            </button>
            <button type="button" style={styles.iconButton} disabled={currentPage >= totalPages - 1} onClick={() => setPage(currentPage + 1)}>
              <ChevronRight size={16} />
            </button>
            <button type="button" style={styles.iconButton} disabled={currentPage >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>
              <ChevronsRight size={16} />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Celda de la fila de filtros
// ---------------------------------------------------------------------------
function FilterCell<T extends object>({
  col,
  value,
  onChange,
}: {
  col: GridColumn<T>;
  value: string;
  onChange: (value: string) => void;
}) {
  const type = col.dataType ?? "string";
  if (type === "boolean" || col.lookup) {
    const options = col.lookup
      ? col.lookup.map((item) => ({ value: item.label, label: item.label }))
      : [
          { value: "true", label: "Sí" },
          { value: "false", label: "No" },
        ];
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} style={styles.filterInput}>
        <option value="">(Todos)</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }
  return (
    <input
      type={type === "date" || type === "datetime" ? "date" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={type === "number" ? ">= 100" : "Filtrar..."}
      style={styles.filterInput}
    />
  );
}

// ---------------------------------------------------------------------------
// Filtro de encabezado: lista de valores distintos con casillas
// ---------------------------------------------------------------------------
const MAX_HEADER_FILTER_VALUES = 500;

function HeaderFilterPopover<T extends object>({
  col,
  rows,
  position,
  selected,
  onApply,
  onClose,
}: {
  col: GridColumn<T>;
  rows: T[];
  position: { top: number; left: number };
  /** Valores actualmente permitidos; `undefined` = sin filtro. */
  selected?: string[];
  onApply: (values: string[] | null) => void;
  onClose: () => void;
}) {
  const options = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const text = formatValue(col, getCellValue(row, col, col.dataField));
      counts.set(text, (counts.get(text) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort(([a], [b]) => compareValues(a, b, col.dataType === "number" ? "number" : "string"))
      .map(([text, count]) => ({ text, count }));
  }, [rows, col]);

  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(selected ?? options.map((o) => o.text))
  );
  const [query, setQuery] = useState("");

  const visible = options
    .filter((o) => normalizeText(o.text).includes(normalizeText(query.trim())))
    .slice(0, MAX_HEADER_FILTER_VALUES);
  const allVisibleChecked = visible.length > 0 && visible.every((o) => checked.has(o.text));

  const toggleVisible = () =>
    setChecked((prev) => {
      const next = new Set(prev);
      visible.forEach((o) => (allVisibleChecked ? next.delete(o.text) : next.add(o.text)));
      return next;
    });

  return (
    <>
      <div style={styles.backdrop} onClick={onClose} />
      <div style={{ ...styles.popover, top: position.top, left: position.left }}>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar valor..."
          style={{ ...styles.filterInput, height: 30, marginBottom: 6 }}
        />
        <label style={styles.chooserItem}>
          <input type="checkbox" checked={allVisibleChecked} onChange={toggleVisible} />
          <strong>(Seleccionar todo)</strong>
        </label>
        <div style={styles.popoverList}>
          {visible.map((o) => (
            <label key={o.text} style={styles.chooserItem}>
              <input
                type="checkbox"
                checked={checked.has(o.text)}
                onChange={() =>
                  setChecked((prev) => {
                    const next = new Set(prev);
                    if (next.has(o.text)) next.delete(o.text);
                    else next.add(o.text);
                    return next;
                  })
                }
              />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                {o.text || "(Vacío)"}
              </span>
              <span style={styles.groupCount}>{o.count}</span>
            </label>
          ))}
          {options.length > MAX_HEADER_FILTER_VALUES && !query ? (
            <div style={styles.groupPlaceholder}>Mostrando los primeros {MAX_HEADER_FILTER_VALUES}. Use la búsqueda.</div>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 8 }}>
          <button type="button" style={styles.toolButton} onClick={() => onApply(null)}>
            Limpiar
          </button>
          <button
            type="button"
            style={{ ...styles.toolButton, background: "#2563EB", color: "#FFFFFF", borderColor: "#2563EB" }}
            onClick={() => onApply(checked.size >= options.length ? null : [...checked])}
          >
            Aceptar
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Editor de celda (doble clic)
// ---------------------------------------------------------------------------
function CellEditor<T extends object>({
  col,
  value,
  onCommit,
  onCancel,
}: {
  col: GridColumn<T>;
  value: unknown;
  onCommit: (value: unknown) => void;
  onCancel: () => void;
}) {
  const type = col.dataType ?? "string";
  const finished = useRef(false);
  const [draft, setDraft] = useState<string>(() =>
    value == null ? "" : type === "date" || type === "datetime" ? toDateKey(value) ?? "" : String(value)
  );

  const finish = (result: unknown) => {
    if (finished.current) return;
    finished.current = true;
    onCommit(result);
  };

  const parse = (text: string): unknown => {
    if (type === "number") {
      if (text.trim() === "") return null;
      const n = Number(text.replace(",", "."));
      return Number.isFinite(n) ? n : value;
    }
    if (type === "date" || type === "datetime") return text || null;
    return text;
  };

  if (type === "boolean") {
    return (
      <input
        type="checkbox"
        autoFocus
        defaultChecked={Boolean(value)}
        onChange={(e) => finish(e.target.checked)}
        onBlur={() => {
          if (!finished.current) onCancel();
        }}
      />
    );
  }

  if (col.lookup) {
    return (
      <select
        autoFocus
        defaultValue={value == null ? "" : String(value)}
        style={styles.filterInput}
        onChange={(e) => {
          const item = col.lookup?.find((entry) => String(entry.value) === e.target.value);
          finish(item ? item.value : e.target.value);
        }}
        onBlur={() => {
          if (!finished.current) onCancel();
        }}
      >
        {col.lookup.map((entry) => (
          <option key={String(entry.value)} value={String(entry.value)}>{entry.label}</option>
        ))}
      </select>
    );
  }

  return (
    <input
      autoFocus
      type={type === "number" ? "number" : type === "date" || type === "datetime" ? "date" : "text"}
      value={draft}
      step={type === "number" ? "any" : undefined}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish(parse(draft))}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(parse(draft));
        if (e.key === "Escape") {
          finished.current = true;
          onCancel();
        }
      }}
      style={{ ...styles.filterInput, textAlign: type === "number" ? "right" : "left" }}
    />
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    border: "1px solid #E5E7EB",
    borderRadius: 8,
    background: "#FFFFFF",
    overflow: "visible",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    padding: 8,
    borderBottom: "1px solid #E5E7EB",
    background: "#FFFFFF",
  },
  groupPanel: {
    flex: 1,
    minWidth: 220,
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    minHeight: 32,
    padding: "2px 8px",
    border: "1px dashed #CBD5E1",
    borderRadius: 6,
    background: "#F8FAFC",
  },
  groupPanelHover: { borderColor: "#2563EB", background: "#EFF6FF" },
  groupPlaceholder: { fontSize: 12, color: "#94A3B8" },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    padding: "2px 4px 2px 8px",
    borderRadius: 999,
    background: "#DBEAFE",
    color: "#1E3A8A",
    fontSize: 12,
  },
  chipButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: 2,
    border: "none",
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
    fontSize: 12,
  },
  toolButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    border: "1px solid #CBD5E1",
    borderRadius: 6,
    background: "#FFFFFF",
    color: "#334155",
    cursor: "pointer",
    fontSize: 12,
  },
  chooser: {
    position: "absolute",
    top: "calc(100% + 4px)",
    right: 0,
    zIndex: 20,
    minWidth: 200,
    maxHeight: 320,
    overflowY: "auto",
    padding: 8,
    border: "1px solid #E5E7EB",
    borderRadius: 8,
    background: "#FFFFFF",
    boxShadow: "0 8px 24px rgba(15,23,42,0.15)",
  },
  chooserItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 6px",
    fontSize: 13,
    color: "#334155",
    cursor: "pointer",
  },
  headerFilterButton: {
    display: "inline-flex",
    padding: 2,
    border: "none",
    background: "transparent",
    cursor: "pointer",
  },
  backdrop: { position: "fixed", inset: 0, zIndex: 40 },
  popover: {
    position: "fixed",
    zIndex: 41,
    width: 260,
    padding: 10,
    border: "1px solid #E5E7EB",
    borderRadius: 8,
    background: "#FFFFFF",
    boxShadow: "0 8px 24px rgba(15,23,42,0.18)",
  },
  popoverList: { maxHeight: 240, overflowY: "auto", borderTop: "1px solid #F1F5F9", marginTop: 4 },
  searchBox: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    border: "1px solid #CBD5E1",
    borderRadius: 6,
    background: "#FFFFFF",
  },
  searchInput: { border: "none", outline: "none", fontSize: 13, width: 160, background: "transparent" },
  scroll: { overflow: "auto", width: "100%" },
  table: { borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" },
  th: {
    position: "relative",
    height: HEADER_HEIGHT,
    padding: "0 10px",
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
    borderBottom: "1px solid #E5E7EB",
    borderRight: "1px solid #EEF2F6",
    background: "#F8FAFC",
    userSelect: "none",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  stickyHead: { position: "sticky", top: 0, zIndex: 3 },
  thFilter: {
    position: "sticky",
    top: HEADER_HEIGHT,
    zIndex: 3,
    height: FILTER_HEIGHT,
    padding: "4px 6px",
    background: "#FFFFFF",
    borderBottom: "1px solid #E5E7EB",
    borderRight: "1px solid #EEF2F6",
  },
  headerContent: { display: "inline-flex", alignItems: "center", gap: 6, maxWidth: "100%" },
  headerText: { overflow: "hidden", textOverflow: "ellipsis" },
  sortBadge: { display: "inline-flex", alignItems: "center", gap: 2, color: "#2563EB", fontSize: 11 },
  resizer: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 6,
    height: "100%",
    cursor: "col-resize",
  },
  filterInput: {
    width: "100%",
    boxSizing: "border-box",
    height: 26,
    padding: "0 6px",
    border: "1px solid #E2E8F0",
    borderRadius: 4,
    fontSize: 12,
    background: "#FFFFFF",
  },
  td: {
    padding: "8px 10px",
    fontSize: 13,
    color: "#334155",
    borderBottom: "1px solid #F1F5F9",
    borderRight: "1px solid #F8FAFC",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  groupRow: { background: "#EEF2F7", cursor: "pointer" },
  groupToggle: { display: "inline-flex", alignItems: "center", gap: 6, color: "#1E293B" },
  groupCount: { color: "#64748B" },
  groupSummary: { color: "#475569", fontSize: 12 },
  detailCell: { padding: 12, background: "#F8FAFC", borderBottom: "1px solid #E5E7EB" },
  tfootCell: {
    position: "sticky",
    bottom: 0,
    zIndex: 2,
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 600,
    color: "#1E293B",
    background: "#F1F5F9",
    borderTop: "1px solid #E5E7EB",
    whiteSpace: "nowrap",
  },
  emptyCell: { padding: 24, textAlign: "center", color: "#64748B", fontSize: 14 },
  pager: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    padding: "8px 12px",
    borderTop: "1px solid #E5E7EB",
    background: "#FFFFFF",
  },
  pagerInfo: { fontSize: 12, color: "#64748B" },
  pageSelect: { fontSize: 12, padding: "2px 4px", border: "1px solid #CBD5E1", borderRadius: 4 },
  iconButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    border: "none",
    background: "transparent",
    color: "#334155",
    cursor: "pointer",
    borderRadius: 4,
  },
};
