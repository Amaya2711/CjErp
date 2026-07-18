import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppSectionHeader from "../../../components/base/AppSectionHeader";
import AppStatusMessage from "../../../components/base/AppStatusMessage";
import {
  buildPlanillaPagadosDashboardRequest,
  consultarPlanillaEstados,
} from "../../../api/planillaConsultaService";
import { getHttpErrorMessage } from "../../../utils/httpError";

type RawRow = Record<string, unknown>;

type DrillRow = {
  cliente: string;
  proyecto: string;
  site: string;
  tarea: string;
  moneda: string;
  monto: number;
};

type ChartDatum = {
  label: string;
  rawLabel: string;
  value: number;
  count: number;
  amountsByCurrency: Record<string, number>;
};

type DrillLevel = "cliente" | "proyecto" | "site" | "tarea";

type DrillPath = {
  cliente: string | null;
  proyecto: string | null;
  site: string | null;
};

const PIE_COLORS = [
  "#2563EB",
  "#0EA5E9",
  "#14B8A6",
  "#22C55E",
  "#F59E0B",
  "#F97316",
  "#EF4444",
  "#A855F7",
  "#EC4899",
  "#64748B",
];
const PAGE_SIZE = 5000;
const DEFAULT_EXCHANGE_RATES = {
  USD: 3.5,
  DOP: 0.058,
} as const;

function getYearStartInputValue() {
  const today = new Date();
  return `${today.getFullYear()}-01-01`;
}

function getMonthEndInputValue() {
  const today = new Date();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
}

function normalizeText(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const text = String(value).trim();
  if (!text) return 0;

  const direct = Number(text);
  if (Number.isFinite(direct)) return direct;

  const normalized = text.includes(",") && !text.includes(".") ? text.replace(",", ".") : text.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickString(row: RawRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function pickNumber(row: RawRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    const parsed = toNumber(value);
    if (parsed !== 0 || String(value ?? "").trim() === "0") {
      return parsed;
    }
  }
  return 0;
}

function normalizeMonedaLabel(value: string) {
  const normalized = normalizeText(value);
  if (normalized.includes("USD") || normalized.includes("DOLAR")) return "USD";
  if (normalized.includes("DOP") || normalized.includes("DOMINICAN") || normalized.includes("PESO DOMINICANO") || normalized.includes("RD$")) return "DOP";
  if (normalized.includes("PEN") || normalized.includes("SOLES") || normalized.includes("S/")) return "PEN";
  return value.trim() || "Sin moneda";
}

function buildDrillRow(row: RawRow): DrillRow {
  const cliente = pickString(row, ["Cliente", "cliente", "NombreCliente", "nombreCliente", "clienteNombre"]) || "Sin cliente";
  const proyecto = pickString(row, ["Proyecto", "proyecto", "NombreProyecto", "nombreProyecto"]) || "Sin proyecto";
  const site = pickString(row, ["Site", "site", "NombreSite", "nombreSite", "siteNombre"]) || "Sin site";
  const tarea = pickString(row, ["Tarea", "tarea", "NombreTarea", "nombreTarea", "TipoTrabajo", "tipoTrabajo"]) || "Sin tarea";
  const moneda = normalizeMonedaLabel(
    pickString(row, ["Moneda", "moneda", "MonedaLabel", "monedaLabel", "TipoMoneda", "tipoMoneda"]),
  );
  const subtotal = pickNumber(row, ["Subtotal", "subtotal"]);
  const total = pickNumber(row, ["Total", "total", "Monto", "monto"]);
  const subtotalSolesValue = row.SubtotalSoles ?? row.subtotalSoles;
  const subtotalSoles = subtotalSolesValue == null || subtotalSolesValue === "" ? null : toNumber(subtotalSolesValue);
  const monto = subtotal || total || subtotalSoles || 0;

  return {
    cliente,
    proyecto,
    site,
    tarea,
    moneda,
    monto,
  };
}

function buildBreakdown(rows: DrillRow[], key: DrillLevel): ChartDatum[] {
  const map = new Map<string, ChartDatum>();

  for (const row of rows) {
    const rawLabel = row[key] || `Sin ${key}`;
    const currency = row.moneda || "Sin moneda";
    const current = map.get(rawLabel);
    if (current) {
      current.value += 1;
      current.count += 1;
      current.amountsByCurrency[currency] = (current.amountsByCurrency[currency] ?? 0) + row.monto;
      continue;
    }

    map.set(rawLabel, {
      label: rawLabel,
      rawLabel,
      value: 1,
      count: 1,
      amountsByCurrency: {
        [currency]: row.monto,
      },
    });
  }

  return Array.from(map.values()).sort((a, b) => b.value - a.value);
}

function formatCurrency(value: number, currency = "PEN") {
  const normalizedCurrency = currency === "USD" || currency === "DOP" || currency === "PEN" ? currency : "PEN";
  const localeByCurrency: Record<string, string> = {
    PEN: "es-PE",
    USD: "en-US",
    DOP: "es-DO",
  };
  return new Intl.NumberFormat(localeByCurrency[normalizedCurrency] ?? "es-PE", {
    style: "currency",
    currency: normalizedCurrency,
    currencyDisplay: "symbol",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatExchangeRate(value: number) {
  return new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: value < 1 ? 3 : 1,
    maximumFractionDigits: value < 1 ? 3 : 1,
  }).format(value);
}

function getCurrentLevel(path: DrillPath): DrillLevel {
  if (!path.cliente) return "cliente";
  if (!path.proyecto) return "proyecto";
  if (!path.site) return "site";
  return "tarea";
}

function getLevelTitle(level: DrillLevel, path: DrillPath) {
  switch (level) {
    case "cliente":
      return "Gastos por cliente";
    case "proyecto":
      return `Proyectos de ${path.cliente}`;
    case "site":
      return `Sites de ${path.proyecto}`;
    case "tarea":
      return `Tareas de ${path.site}`;
    default:
      return "Dashboard";
  }
}

function getLevelDescription(level: DrillLevel) {
  switch (level) {
    case "cliente":
      return "Selecciona un cliente para ver el siguiente nivel.";
    case "proyecto":
      return "Haz clic en un proyecto para desglosar sus sites.";
    case "site":
      return "Haz clic en un site para revisar sus tareas.";
    case "tarea":
      return "Detalle final por tarea dentro del site seleccionado.";
    default:
      return "";
  }
}

function getNextPath(level: DrillLevel, path: DrillPath, label: string): DrillPath {
  if (level === "cliente") {
    return { cliente: label, proyecto: null, site: null };
  }
  if (level === "proyecto") {
    return { cliente: path.cliente, proyecto: label, site: null };
  }
  if (level === "site") {
    return { cliente: path.cliente, proyecto: path.proyecto, site: label };
  }
  return path;
}

export default function Dashboard1Page() {
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draftFechaInicio, setDraftFechaInicio] = useState(getYearStartInputValue());
  const [draftFechaFin, setDraftFechaFin] = useState(getMonthEndInputValue());
  const [draftSearchText, setDraftSearchText] = useState("");
  const [appliedFechaInicio, setAppliedFechaInicio] = useState(getYearStartInputValue());
  const [appliedFechaFin, setAppliedFechaFin] = useState(getMonthEndInputValue());
  const [appliedSearchText, setAppliedSearchText] = useState("");
  const [path, setPath] = useState<DrillPath>({ cliente: null, proyecto: null, site: null });
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const isMountedRef = useRef(true);
  const detailSectionRef = useRef<HTMLDivElement | null>(null);

  const loadRows = async (params?: { fechaInicio?: string; fechaFin?: string; searchText?: string; pageNumber?: number }) => {
    const fechaInicio = params?.fechaInicio ?? draftFechaInicio;
    const fechaFin = params?.fechaFin ?? draftFechaFin;
    const searchText = params?.searchText ?? draftSearchText;
    const targetPageNumber = params?.pageNumber ?? 1;

    setLoading(true);
    setError("");

    try {
      const response = await consultarPlanillaEstados(
        buildPlanillaPagadosDashboardRequest({
          fechaInicio,
          fechaFin,
          textoBusqueda: searchText,
          pageNumber: targetPageNumber,
          pageSize: PAGE_SIZE,
        }),
      );
      const detailRows = Array.isArray(response.rows) ? response.rows : [];

      if (!isMountedRef.current) return;

      if (response.limitExceeded) {
        setRawRows([]);
        setError(response.message?.trim() || "La consulta excedio el maximo permitido para el dashboard.");
        return;
      }

      setAppliedFechaInicio(fechaInicio);
      setAppliedFechaFin(fechaFin);
      setAppliedSearchText(searchText);
      setPath({ cliente: null, proyecto: null, site: null });
      setRawRows(detailRows);
      setPageNumber(response.pageNumber && response.pageNumber > 0 ? response.pageNumber : targetPageNumber);
      setPageSize(response.pageSize && response.pageSize > 0 ? response.pageSize : PAGE_SIZE);
      setTotalRows(response.totalRows ?? detailRows.length);
      setTotalPages(response.totalPages && response.totalPages > 0 ? response.totalPages : 1);
      setHasPreviousPage(Boolean(response.hasPreviousPage));
      setHasNextPage(Boolean(response.hasNextPage));
    } catch (err) {
      if (!isMountedRef.current) return;
      setRawRows([]);
      setTotalRows(0);
      setTotalPages(1);
      setHasPreviousPage(false);
      setHasNextPage(false);
      setError(getHttpErrorMessage(err, "No se pudo cargar el dashboard desde sp_Planilla_ConsultarPagados_Dsh."));
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    void loadRows({
      fechaInicio: getYearStartInputValue(),
      fechaFin: getMonthEndInputValue(),
      searchText: "",
    });

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const rows = useMemo(() => rawRows.map((row) => buildDrillRow(row)), [rawRows]);
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (path.cliente && row.cliente !== path.cliente) return false;
      if (path.proyecto && row.proyecto !== path.proyecto) return false;
      if (path.site && row.site !== path.site) return false;
      return true;
    });
  }, [path, rows]);

  const currentLevel = getCurrentLevel(path);
  const chartData = useMemo(() => buildBreakdown(filteredRows, currentLevel), [currentLevel, filteredRows]);
  const visibleCurrencies = useMemo(() => {
    const set = new Set<string>();
    for (const row of filteredRows) {
      set.add(row.moneda || "Sin moneda");
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [filteredRows]);
  const totalsByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of filteredRows) {
      map.set(row.moneda, (map.get(row.moneda) ?? 0) + row.monto);
    }
    return Array.from(map.entries())
      .map(([currency, total]) => ({ currency, total }))
      .sort((a, b) => a.currency.localeCompare(b.currency));
  }, [filteredRows]);
  const totalConvertedToPen = useMemo(() => {
    return totalsByCurrency.reduce((accumulator, item) => {
      if (item.currency === "USD") {
        return accumulator + item.total * DEFAULT_EXCHANGE_RATES.USD;
      }
      if (item.currency === "DOP") {
        return accumulator + item.total * DEFAULT_EXCHANGE_RATES.DOP;
      }
      return accumulator + item.total;
    }, 0);
  }, [totalsByCurrency]);
  const totalClientes = useMemo(() => new Set(rows.map((row) => row.cliente)).size, [rows]);
  const totalProyectos = useMemo(() => new Set(rows.map((row) => row.proyecto)).size, [rows]);
  const totalSites = useMemo(() => new Set(rows.map((row) => row.site)).size, [rows]);
  const totalTareas = useMemo(() => new Set(rows.map((row) => row.tarea)).size, [rows]);

  const handleApplyFilters = async () => {
    await loadRows({
      fechaInicio: draftFechaInicio,
      fechaFin: draftFechaFin,
      searchText: draftSearchText,
      pageNumber: 1,
    });
  };

  const handleChangePage = async (nextPageNumber: number) => {
    if (loading || nextPageNumber < 1 || nextPageNumber === pageNumber) {
      return;
    }

    await loadRows({
      fechaInicio: appliedFechaInicio,
      fechaFin: appliedFechaFin,
      searchText: appliedSearchText,
      pageNumber: nextPageNumber,
    });
  };

  const pageStart = totalRows === 0 ? 0 : (pageNumber - 1) * pageSize + 1;
  const pageEnd = totalRows === 0 ? 0 : Math.min(pageNumber * pageSize, totalRows);

  const handleChartClick = (datum: ChartDatum) => {
    if (currentLevel === "tarea") return;
    setPath((prev) => getNextPath(currentLevel, prev, datum.rawLabel));
  };

  const handleBreadcrumbReset = (level: "all" | "cliente" | "proyecto") => {
    if (level === "all") {
      setPath({ cliente: null, proyecto: null, site: null });
      return;
    }

    if (level === "cliente") {
      setPath((prev) => ({ cliente: prev.cliente, proyecto: null, site: null }));
      return;
    }

    setPath((prev) => ({ cliente: prev.cliente, proyecto: prev.proyecto, site: null }));
  };

  const handleGoToDetail = () => {
    detailSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <AppPage title="Reportes / Gerencial / Dashboard 1">
      <div style={styles.page}>
        <AppCard>
          <div style={styles.filtersRow}>
            <div style={styles.filterField}>
              <label style={styles.label}>Fecha inicio</label>
              <input type="date" value={draftFechaInicio} onChange={(event) => setDraftFechaInicio(event.target.value)} style={styles.input} />
            </div>
            <div style={styles.filterField}>
              <label style={styles.label}>Fecha fin</label>
              <input type="date" value={draftFechaFin} onChange={(event) => setDraftFechaFin(event.target.value)} style={styles.input} />
            </div>
            <div style={{ ...styles.filterField, flex: 1.5 }}>
              <label style={styles.label}>Búsqueda</label>
              <input
                type="text"
                value={draftSearchText}
                onChange={(event) => setDraftSearchText(event.target.value)}
                placeholder="Cliente, proyecto, site o tarea..."
                style={styles.input}
              />
            </div>
            <div style={styles.actionsWrap}>
              <button type="button" style={styles.primaryButton} onClick={() => void handleApplyFilters()} disabled={loading}>
                Actualizar
              </button>
              <button type="button" style={styles.secondaryButton} onClick={handleGoToDetail} disabled={loading}>
                Detalle
              </button>
            </div>
          </div>
        </AppCard>

        {error ? <AppStatusMessage tone="error">{error}</AppStatusMessage> : null}

        <div style={styles.exchangeRateRow}>
          <div style={styles.exchangeRateBadge}>
            <span style={styles.exchangeRateLabel}>Tipo cambio USD</span>
            <strong style={styles.exchangeRateValue}>{formatExchangeRate(DEFAULT_EXCHANGE_RATES.USD)}</strong>
          </div>
          <div style={styles.exchangeRateBadge}>
            <span style={styles.exchangeRateLabel}>Tipo cambio DOP</span>
            <strong style={styles.exchangeRateValue}>{formatExchangeRate(DEFAULT_EXCHANGE_RATES.DOP)}</strong>
          </div>
        </div>

        <div style={styles.metricGrid}>
          <MetricCard label="Total convertido PEN" value={formatCurrency(totalConvertedToPen, "PEN")} />
          {totalsByCurrency.map((item) => (
            <MetricCard key={item.currency} label={`Total ${item.currency}`} value={formatCurrency(item.total, item.currency)} />
          ))}
          <MetricCard label="Clientes" value={String(totalClientes)} />
          <MetricCard label="Proyectos" value={String(totalProyectos)} />
          <MetricCard label="Sites" value={String(totalSites)} />
          <MetricCard label="Tareas" value={String(totalTareas)} />
        </div>

        <AppCard>
          <AppSectionHeader title={getLevelTitle(currentLevel, path)} description={getLevelDescription(currentLevel)} />

          <div style={styles.breadcrumbRow}>
            <button type="button" style={path.cliente ? styles.breadcrumbButton : styles.breadcrumbButtonActive} onClick={() => handleBreadcrumbReset("all")}>
              Clientes
            </button>
            {path.cliente ? (
              <button type="button" style={path.proyecto ? styles.breadcrumbButton : styles.breadcrumbButtonActive} onClick={() => handleBreadcrumbReset("cliente")}>
                {path.cliente}
              </button>
            ) : null}
            {path.proyecto ? (
              <button type="button" style={path.site ? styles.breadcrumbButton : styles.breadcrumbButtonActive} onClick={() => handleBreadcrumbReset("proyecto")}>
                {path.proyecto}
              </button>
            ) : null}
            {path.site ? <span style={styles.breadcrumbFinal}>{path.site}</span> : null}
          </div>

          {loading ? (
            <div style={styles.loadingBox}>Cargando información del store...</div>
          ) : chartData.length === 0 ? (
            <div style={styles.emptyBox}>No se encontraron datos para el filtro seleccionado.</div>
          ) : (
            <div style={styles.chartLayout}>
              <div style={styles.chartBox}>
                <div style={styles.chartBoxInner}>
                  <div style={styles.pieWrap}>
                    <ResponsiveContainer width="100%" height={340}>
                      <PieChart>
                        <Pie
                          data={chartData}
                          dataKey="value"
                          nameKey="label"
                          innerRadius={56}
                          outerRadius={88}
                          cx="50%"
                          cy="50%"
                          paddingAngle={2}
                          onClick={(_, index) => {
                            const datum = chartData[index];
                            if (datum) handleChartClick(datum);
                          }}
                        >
                          {chartData.map((item, index) => (
                            <Cell
                              key={`${item.label}-${index}`}
                              fill={PIE_COLORS[index % PIE_COLORS.length]}
                              stroke="#ffffff"
                              strokeWidth={2}
                              cursor={currentLevel === "tarea" ? "default" : "pointer"}
                            />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => `${Number(value ?? 0)} registro(s)`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={styles.legendPanel}>
                    {chartData.map((item, index) => (
                      <button
                        key={`${item.label}-legend`}
                        type="button"
                        style={currentLevel === "tarea" ? styles.legendItemDisabled : styles.legendItem}
                        onClick={() => handleChartClick(item)}
                        disabled={currentLevel === "tarea"}
                      >
                        <span
                          style={{
                            ...styles.legendSwatch,
                            backgroundColor: PIE_COLORS[index % PIE_COLORS.length],
                          }}
                        />
                        <span style={styles.legendText}>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

                            <div style={styles.sidePanel}>
                <div style={styles.sidePanelTopRow}>
                  <div style={styles.sideCard}>
                    <div style={styles.sideLabel}>Periodo aplicado</div>
                    <strong style={styles.sideValue}>{appliedFechaInicio} al {appliedFechaFin}</strong>
                  </div>
                  <div style={styles.sideCard}>
                    <div style={styles.sideLabel}>Nivel actual</div>
                    <strong style={styles.sideValue}>{getLevelTitle(currentLevel, path)}</strong>
                  </div>
                  <div style={styles.sideCard}>
                    <div style={styles.sideLabel}>Elementos</div>
                    <strong style={styles.sideValue}>{chartData.length}</strong>
                  </div>
                </div>
                <div ref={detailSectionRef} style={styles.detailPanel}>
                  <AppSectionHeader title="Detalle del nivel actual" description="Puedes hacer clic en una fila para seguir navegando en la estructura del gasto." />
                  <div style={styles.paginationBar}>
                    <div style={styles.paginationSummary}>
                      {totalRows > 0
                        ? `Mostrando ${pageStart} - ${pageEnd} de ${totalRows} registro(s)`
                        : "Sin registros para mostrar"}
                    </div>
                    <div style={styles.paginationActions}>
                      <button
                        type="button"
                        style={styles.secondaryButton}
                        onClick={() => void handleChangePage(pageNumber - 1)}
                        disabled={loading || !hasPreviousPage}
                      >
                        Anterior
                      </button>
                      <span style={styles.paginationLabel}>Pagina {pageNumber} de {totalPages}</span>
                      <button
                        type="button"
                        style={styles.secondaryButton}
                        onClick={() => void handleChangePage(pageNumber + 1)}
                        disabled={loading || !hasNextPage}
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                  <div style={styles.tableWrap}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>Nivel</th>
                          <th style={styles.th}>Registros</th>
                          {visibleCurrencies.map((currency) => (
                            <th key={currency} style={styles.th}>{currency}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {chartData.length === 0 ? (
                          <tr>
                            <td colSpan={2 + visibleCurrencies.length} style={styles.emptyCell}>No hay detalle para mostrar.</td>
                          </tr>
                        ) : (
                          chartData.map((item) => (
                            <tr key={item.label}>
                              <td style={styles.td}>
                                <button
                                  type="button"
                                  style={currentLevel === "tarea" ? styles.flatText : styles.linkButton}
                                  onClick={() => handleChartClick(item)}
                                  disabled={currentLevel === "tarea"}
                                >
                                  {item.label}
                                </button>
                              </td>
                              <td style={styles.td}>{item.count}</td>
                              {visibleCurrencies.map((currency) => (
                                <td key={currency} style={styles.tdStrong}>
                                  {item.amountsByCurrency[currency] != null
                                    ? formatCurrency(item.amountsByCurrency[currency], currency)
                                    : "-"}
                                </td>
                              ))}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </AppCard>

      </div>
    </AppPage>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.metricCard}>
      <span style={styles.metricLabel}>{label}</span>
      <strong style={styles.metricValue}>{value}</strong>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "grid",
    gap: 16,
  },
  filtersRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 16,
    alignItems: "flex-end",
  },
  filterField: {
    minWidth: 180,
    display: "grid",
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: 700,
    color: "#334155",
  },
  input: {
    width: "100%",
    minHeight: 42,
    borderRadius: 12,
    border: "1px solid #CBD5E1",
    padding: "10px 12px",
    fontSize: 14,
    background: "#FFFFFF",
    color: "#0F172A",
    boxSizing: "border-box",
  },
  actionsWrap: {
    display: "flex",
    alignItems: "flex-end",
  },
  primaryButton: {
    minHeight: 42,
    border: "none",
    borderRadius: 12,
    padding: "0 18px",
    background: "linear-gradient(135deg, #2563EB, #0F172A)",
    color: "#FFFFFF",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    minHeight: 38,
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    padding: "0 14px",
    background: "#FFFFFF",
    color: "#0F172A",
    fontWeight: 700,
    cursor: "pointer",
  },
  exchangeRateRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
  },
  exchangeRateBadge: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    borderRadius: 999,
    border: "1px solid #BFDBFE",
    background: "linear-gradient(180deg, #FFFFFF, #EFF6FF)",
    padding: "10px 14px",
  },
  exchangeRateLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  exchangeRateValue: {
    fontSize: 16,
    color: "#0F172A",
  },
  metricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 12,
  },
  metricCard: {
    borderRadius: 18,
    border: "1px solid #DBEAFE",
    background: "linear-gradient(180deg, #FFFFFF, #EFF6FF)",
    padding: 16,
    display: "grid",
    gap: 8,
    boxShadow: "0 10px 30px rgba(37, 99, 235, 0.08)",
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  metricValue: {
    fontSize: 24,
    color: "#0F172A",
  },
  breadcrumbRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  breadcrumbButton: {
    borderRadius: 999,
    border: "1px solid #BFDBFE",
    background: "#EFF6FF",
    color: "#1D4ED8",
    fontWeight: 700,
    padding: "8px 14px",
    cursor: "pointer",
  },
  breadcrumbButtonActive: {
    borderRadius: 999,
    border: "1px solid #1D4ED8",
    background: "#2563EB",
    color: "#FFFFFF",
    fontWeight: 700,
    padding: "8px 14px",
    cursor: "pointer",
  },
  breadcrumbFinal: {
    borderRadius: 999,
    background: "#E2E8F0",
    color: "#0F172A",
    fontWeight: 700,
    padding: "8px 14px",
  },
  chartLayout: {
    display: "grid",
    gridTemplateColumns: "minmax(240px, 0.6fr) minmax(680px, 1.4fr)",
    gap: 20,
    alignItems: "start",
  },
  chartBox: {
    minHeight: 280,
    borderRadius: 20,
    border: "1px solid #E2E8F0",
    background: "radial-gradient(circle at top, rgba(37,99,235,0.08), transparent 55%), #FFFFFF",
    padding: 6,
  },
  chartBoxInner: {
    display: "grid",
    gridTemplateColumns: "minmax(180px, 1fr) minmax(220px, 240px)",
    gap: 12,
    alignItems: "start",
    minHeight: 260,
  },
  pieWrap: {
    minWidth: 0,
    minHeight: 248,
  },
  legendPanel: {
    display: "grid",
    gap: 6,
    alignContent: "start",
    minWidth: 0,
    maxHeight: 340,
    overflowX: "hidden",
    overflowY: "auto",
    paddingRight: 2,
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    background: "#FFFFFF",
    padding: "8px 10px",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
    minWidth: 0,
  },
  legendItemDisabled: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    background: "#F8FAFC",
    padding: "8px 10px",
    cursor: "default",
    textAlign: "left",
    opacity: 0.7,
    width: "100%",
    minWidth: 0,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 999,
    flexShrink: 0,
  },
  legendText: {
    fontSize: 13,
    fontWeight: 700,
    color: "#0F172A",
    lineHeight: 1.2,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  sidePanel: {
    display: "grid",
    gap: 12,
    minWidth: 0,
  },
  sidePanelTopRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12,
  },
  detailPanel: {
    borderRadius: 18,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    padding: 16,
    display: "grid",
    gap: 12,
    minWidth: 0,
  },
  sideCard: {
    borderRadius: 18,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    padding: 16,
    display: "grid",
    gap: 6,
  },
  sideLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sideValue: {
    fontSize: 18,
    color: "#0F172A",
  },
  loadingBox: {
    padding: 24,
    borderRadius: 16,
    background: "#F8FAFC",
    color: "#334155",
    textAlign: "center",
  },
  emptyBox: {
    padding: 24,
    borderRadius: 16,
    background: "#FFF7ED",
    color: "#9A3412",
    textAlign: "center",
  },
  tableWrap: {
    overflowX: "auto",
  },
  paginationBar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  paginationSummary: {
    fontSize: 13,
    color: "#475569",
    fontWeight: 600,
  },
  paginationActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
  },
  paginationLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: "#0F172A",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 520,
  },
  th: {
    textAlign: "left",
    padding: "12px 10px",
    borderBottom: "1px solid #CBD5E1",
    color: "#475569",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  td: {
    padding: "12px 10px",
    borderBottom: "1px solid #E2E8F0",
    color: "#0F172A",
  },
  tdStrong: {
    padding: "12px 10px",
    borderBottom: "1px solid #E2E8F0",
    color: "#0F172A",
    fontWeight: 700,
  },
  emptyCell: {
    padding: 20,
    textAlign: "center",
    color: "#64748B",
  },
  linkButton: {
    border: "none",
    background: "transparent",
    padding: 0,
    color: "#2563EB",
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "left",
  },
  flatText: {
    border: "none",
    background: "transparent",
    padding: 0,
    color: "#0F172A",
    fontWeight: 700,
    textAlign: "left",
  },
};

