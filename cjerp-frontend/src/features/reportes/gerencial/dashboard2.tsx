import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import AppPage from "../../../components/base/AppPage";
import AppStatusMessage from "../../../components/base/AppStatusMessage";
import {
  buildPlanillaPagadosDashboardRequest,
  consultarPlanillaEstados,
} from "../../../api/planillaConsultaService";
import { getHttpErrorMessage } from "../../../utils/httpError";

type RawRow = Record<string, unknown>;

type DrillLevel = "cliente" | "proyecto" | "site" | "tarea";

type DrillRow = {
  id: string;
  fechaIngreso: string;
  cliente: string;
  proyecto: string;
  site: string;
  tarea: string;
  moneda: string;
  monto: number;
  subtotal: number;
  igv: number;
  totalPagar: number;
  detalle: string;
  comentario: string;
};

type ChartDatum = {
  label: string;
  rawLabel: string;
  count: number;
  amountsByCurrency: Record<string, number>;
};

const PIE_COLORS = [
  "#2563EB",
  "#14B8A6",
  "#22C55E",
  "#F59E0B",
  "#F97316",
  "#EF4444",
  "#A855F7",
  "#64748B",
];

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
  if (normalized.includes("DOP") || normalized.includes("PESO DOMINICANO") || normalized.includes("RD$")) return "DOP";
  if (normalized.includes("PEN") || normalized.includes("SOLES") || normalized.includes("S/")) return "PEN";
  return value.trim() || "Sin moneda";
}

function formatDisplayDate(value: string) {
  const text = value.trim();
  if (!text || text === "-") return "-";

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
    return text;
  }

  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00` : text;
  const parsed = new Date(isoDate);
  if (Number.isFinite(parsed.getTime())) {
    return parsed.toLocaleDateString("es-PE");
  }

  return text;
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

function convertToPen(value: number, currency: string, usdExchangeRate: number, dopExchangeRate: number) {
  if (currency === "USD") return value * usdExchangeRate;
  if (currency === "DOP") return value * dopExchangeRate;
  return value;
}

function parseExchangeRateInput(value: string) {
  const parsed = Number(value.replace(",", ".").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function buildDrillRow(row: RawRow): DrillRow {
  const fechaIngreso = formatDisplayDate(
    pickString(row, [
      "FechaDeposito",
      "fechadeposito",
      "fechaDeposito",
      "FecDeposito",
      "FecIngreso",
      "fecIngreso",
      "FechaIngreso",
      "fechaIngreso",
    ]),
  );

  const cliente = pickString(row, ["Cliente", "cliente", "NombreCliente", "nombreCliente"]) || "Sin cliente";
  const proyecto = pickString(row, ["Proyecto", "proyecto", "NombreProyecto", "nombreProyecto"]) || "Sin proyecto";
  const site = pickString(row, ["Site", "site", "NombreSite", "nombreSite", "siteNombre"]) || "Sin site";
  const tarea = pickString(row, ["Tarea", "tarea", "NombreTarea", "nombreTarea", "TipoTrabajo", "tipoTrabajo"]) || "Sin tarea";
  const moneda = normalizeMonedaLabel(
    pickString(row, ["Moneda", "moneda", "MonedaLabel", "monedaLabel", "TipoMoneda", "tipoMoneda"]),
  );

  const subtotal = pickNumber(row, ["Subtotal", "subtotal"]);
  const igv = pickNumber(row, ["IGV", "Igv", "igv"]);
  const total = pickNumber(row, ["Total", "total", "Monto", "monto"]);
  const totalPagar = pickNumber(row, ["TotalPagar", "totalPagar"]);
  const monto = subtotal || total || totalPagar || 0;

  return {
    id: pickString(row, ["Correlativo", "correlativo", "Corre", "corre", "Id", "id"]) || "-",
    fechaIngreso: fechaIngreso || "-",
    cliente,
    proyecto,
    site,
    tarea,
    moneda,
    monto,
    subtotal: subtotal || 0,
    igv: igv || 0,
    totalPagar: totalPagar || total || monto,
    detalle: pickString(row, ["Detalle", "detalle"]) || "-",
    comentario: pickString(row, ["Comentario", "comentario"]) || "-",
  };
}

function buildBreakdown(rows: DrillRow[], key: DrillLevel): ChartDatum[] {
  const map = new Map<string, ChartDatum>();

  for (const row of rows) {
    const rawLabel = row[key] || `Sin ${key}`;
    const currency = row.moneda || "Sin moneda";
    const current = map.get(rawLabel);

    if (current) {
      current.count += 1;
      current.amountsByCurrency[currency] = (current.amountsByCurrency[currency] ?? 0) + row.monto;
      continue;
    }

    map.set(rawLabel, {
      label: rawLabel,
      rawLabel,
      count: 1,
      amountsByCurrency: { [currency]: row.monto },
    });
  }

  return Array.from(map.values()).sort((left, right) => right.count - left.count);
}

function countUnique(rows: DrillRow[], key: keyof DrillRow) {
  return new Set(rows.map((row) => row[key]).filter(Boolean)).size;
}

export default function Dashboard2Page() {
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draftFechaInicio, setDraftFechaInicio] = useState(getYearStartInputValue());
  const [draftFechaFin, setDraftFechaFin] = useState(getMonthEndInputValue());
  const [draftSearchText, setDraftSearchText] = useState("");
  const [draftUsdExchangeRate, setDraftUsdExchangeRate] = useState(String(DEFAULT_EXCHANGE_RATES.USD));
  const [draftDopExchangeRate, setDraftDopExchangeRate] = useState(String(DEFAULT_EXCHANGE_RATES.DOP));
  const [appliedFechaInicio, setAppliedFechaInicio] = useState(getYearStartInputValue());
  const [appliedFechaFin, setAppliedFechaFin] = useState(getMonthEndInputValue());
  const [appliedSearchText, setAppliedSearchText] = useState("");
  const [appliedUsdExchangeRate, setAppliedUsdExchangeRate] = useState<number>(DEFAULT_EXCHANGE_RATES.USD);
  const [appliedDopExchangeRate, setAppliedDopExchangeRate] = useState<number>(DEFAULT_EXCHANGE_RATES.DOP);
  const [selectedLevel, setSelectedLevel] = useState<DrillLevel>("cliente");
  const isMountedRef = useRef(true);

  const loadRows = async (params?: { fechaInicio?: string; fechaFin?: string; searchText?: string }) => {
    const fechaInicio = params?.fechaInicio ?? draftFechaInicio;
    const fechaFin = params?.fechaFin ?? draftFechaFin;
    const searchText = params?.searchText ?? draftSearchText;

    setLoading(true);
    setError("");

    try {
      const response = await consultarPlanillaEstados(
        buildPlanillaPagadosDashboardRequest({
          fechaInicio,
          fechaFin,
          textoBusqueda: searchText,
        }),
        { timeoutMs: 120000 },
      );

      if (!isMountedRef.current) return;

      const detailRows = Array.isArray(response.rows) ? response.rows : [];
      if (response.limitExceeded) {
        setRawRows([]);
        setError(response.message?.trim() || "La consulta excedio el maximo permitido para el dashboard.");
        return;
      }

      setAppliedFechaInicio(fechaInicio);
      setAppliedFechaFin(fechaFin);
      setAppliedSearchText(searchText);
      setSelectedLevel("cliente");
      setRawRows(detailRows);
    } catch (err) {
      if (!isMountedRef.current) return;
      setRawRows([]);
      setError(getHttpErrorMessage(err, "No se pudo cargar el dashboard gerencial."));
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
  const chartData = useMemo(() => buildBreakdown(rows, selectedLevel), [rows, selectedLevel]);

  const totalsByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.moneda, (map.get(row.moneda) ?? 0) + row.monto);
    }

    return Array.from(map.entries())
      .map(([currency, total]) => ({ currency, total }))
      .sort((left, right) => left.currency.localeCompare(right.currency));
  }, [rows]);

  const totalConvertedToPen = useMemo(() => {
    return totalsByCurrency.reduce(
      (accumulator, item) => accumulator + convertToPen(item.total, item.currency, appliedUsdExchangeRate, appliedDopExchangeRate),
      0,
    );
  }, [appliedDopExchangeRate, appliedUsdExchangeRate, totalsByCurrency]);

  const detailCounts = useMemo(
    () => ({
      clientes: countUnique(rows, "cliente"),
      proyectos: countUnique(rows, "proyecto"),
      sites: countUnique(rows, "site"),
      tareas: countUnique(rows, "tarea"),
      registros: rows.length,
    }),
    [rows],
  );

  const summaryCards = useMemo(
    () => [
      {
        label: "Total general convertido a PEN",
        value: formatCurrency(totalConvertedToPen, "PEN"),
        tone: "blue",
      },
      {
        label: "Total PEN",
        value: formatCurrency(totalsByCurrency.find((item) => item.currency === "PEN")?.total ?? 0, "PEN"),
        tone: "neutral",
      },
      {
        label: "Total USD",
        value: formatCurrency(totalsByCurrency.find((item) => item.currency === "USD")?.total ?? 0, "USD"),
        tone: "green",
      },
      {
        label: "Total DOP",
        value: formatCurrency(totalsByCurrency.find((item) => item.currency === "DOP")?.total ?? 0, "DOP"),
        tone: "orange",
      },
    ],
    [totalConvertedToPen, totalsByCurrency],
  );

  const handleApplyFilters = async () => {
    const usdExchangeRate = parseExchangeRateInput(draftUsdExchangeRate);
    const dopExchangeRate = parseExchangeRateInput(draftDopExchangeRate);

    if (usdExchangeRate == null || dopExchangeRate == null) {
      setError("Ingrese tipos de cambio validos y mayores que cero para USD y DOP.");
      return;
    }

    setAppliedUsdExchangeRate(usdExchangeRate);
    setAppliedDopExchangeRate(dopExchangeRate);
    await loadRows({
      fechaInicio: draftFechaInicio,
      fechaFin: draftFechaFin,
      searchText: draftSearchText,
    });
  };

  const selectedLevelLabel =
    selectedLevel === "cliente" ? "Clientes" : selectedLevel === "proyecto" ? "Proyectos" : selectedLevel === "site" ? "Sites" : "Tareas";

  const sortedChartData = [...chartData].sort((left, right) => {
    const leftPen = Object.entries(left.amountsByCurrency).reduce(
      (accumulator, [currency, amount]) => accumulator + convertToPen(amount, currency, appliedUsdExchangeRate, appliedDopExchangeRate),
      0,
    );
    const rightPen = Object.entries(right.amountsByCurrency).reduce(
      (accumulator, [currency, amount]) => accumulator + convertToPen(amount, currency, appliedUsdExchangeRate, appliedDopExchangeRate),
      0,
    );

    return rightPen - leftPen;
  });

  const sortedRows = [...rows].sort((left, right) => right.monto - left.monto);

  return (
    <AppPage style={styles.page}>
      <div style={styles.heroCard}>
        <div style={styles.heroIcon}>
          <span style={styles.heroIconBars}>
            <span />
            <span />
            <span />
          </span>
        </div>
       
      </div>

      <div style={styles.filterCard}>
        <div style={styles.filterGrid}>
          <label style={styles.filterField}>
            <span style={styles.filterLabel}>Fecha inicio</span>
            <input
              type="date"
              value={draftFechaInicio}
              onChange={(event) => setDraftFechaInicio(event.target.value)}
              style={styles.input}
            />
          </label>
          <label style={styles.filterField}>
            <span style={styles.filterLabel}>Fecha fin</span>
            <input
              type="date"
              value={draftFechaFin}
              onChange={(event) => setDraftFechaFin(event.target.value)}
              style={styles.input}
            />
          </label>
          <label style={{ ...styles.filterField, flex: 1.2 }}>
            <span style={styles.filterLabel}>Busqueda</span>
            <input
              type="text"
              value={draftSearchText}
              onChange={(event) => setDraftSearchText(event.target.value)}
              placeholder="Cliente, proyecto, site o tarea..."
              style={styles.input}
            />
          </label>
          <label style={styles.filterField}>
            <span style={styles.filterLabel}>Tipo cambio USD</span>
            <input
              type="text"
              value={draftUsdExchangeRate}
              onChange={(event) => setDraftUsdExchangeRate(event.target.value)}
              style={styles.input}
            />
          </label>
          <label style={styles.filterField}>
            <span style={styles.filterLabel}>Tipo cambio DOP</span>
            <input
              type="text"
              value={draftDopExchangeRate}
              onChange={(event) => setDraftDopExchangeRate(event.target.value)}
              style={styles.input}
            />
          </label>
          <button type="button" style={styles.primaryButton} onClick={() => void handleApplyFilters()} disabled={loading}>
            Aplicar filtros
          </button>
        </div>
      </div>

      {error ? <AppStatusMessage tone="error">{error}</AppStatusMessage> : null}

      <div style={styles.kpiGrid}>
        {summaryCards.map((card) => (
          <div
            key={card.label}
            style={
              card.tone === "blue"
                ? styles.kpiCardPrimary
                : card.tone === "green"
                  ? styles.kpiCardGreen
                  : card.tone === "orange"
                    ? styles.kpiCardOrange
                    : styles.kpiCard
            }
          >
            <div style={styles.kpiLabel}>{card.label}</div>
            <div style={styles.kpiValue}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={styles.contentGrid}>
        <div style={styles.chartCard}>
          <div style={styles.sectionHeaderRow}>
            <div>
              <div style={styles.sectionTitle}>Gastos por cliente</div>
              <div style={styles.sectionSubtitle}>Distribucion del gasto convertido a soles</div>
            </div>
            <button type="button" style={styles.ghostButton} onClick={() => setSelectedLevel("cliente")}>
              Ver detalle completo
            </button>
          </div>

          <div style={styles.chartLayout}>
            <div style={styles.chartWrap}>
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={sortedChartData}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={78}
                    outerRadius={128}
                    paddingAngle={2}
                  >
                    {sortedChartData.map((item, index) => (
                      <Cell key={`${item.label}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} stroke="#FFFFFF" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `${Number(value ?? 0)} registro(s)`} />
                </PieChart>
              </ResponsiveContainer>
              <div style={styles.chartCenter}>
                <div style={styles.chartCenterValue}>{formatCurrency(totalConvertedToPen, "PEN")}</div>
                <div style={styles.chartCenterLabel}>Total general</div>
              </div>
            </div>

            <div style={styles.legendList}>
              {sortedChartData.map((item, index) => {
                const itemPen = Object.entries(item.amountsByCurrency).reduce(
                  (accumulator, [currency, amount]) =>
                    accumulator + convertToPen(amount, currency, appliedUsdExchangeRate, appliedDopExchangeRate),
                  0,
                );
                const percent = totalConvertedToPen > 0 ? (itemPen / totalConvertedToPen) * 100 : 0;

                return (
                  <div key={item.label} style={styles.legendRow}>
                    <div style={styles.legendNameWrap}>
                      <span style={{ ...styles.legendSwatch, backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                      <span style={styles.legendName}>{item.label}</span>
                    </div>
                    <div style={styles.legendValues}>
                      <span style={styles.legendAmount}>{formatCurrency(itemPen, "PEN")}</span>
                      <span style={styles.legendPercent}>{percent.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={styles.metricStrip}>
            <div style={styles.metricChip}>
              <div style={styles.metricChipLabel}>Clientes</div>
              <div style={styles.metricChipValue}>{detailCounts.clientes}</div>
            </div>
            <div style={styles.metricChip}>
              <div style={styles.metricChipLabel}>Proyectos</div>
              <div style={styles.metricChipValue}>{detailCounts.proyectos}</div>
            </div>
            <div style={styles.metricChip}>
              <div style={styles.metricChipLabel}>Sites</div>
              <div style={styles.metricChipValue}>{detailCounts.sites}</div>
            </div>
            <div style={styles.metricChip}>
              <div style={styles.metricChipLabel}>Tareas</div>
              <div style={styles.metricChipValue}>{detailCounts.tareas}</div>
            </div>
            <div style={styles.metricChip}>
              <div style={styles.metricChipLabel}>Registros</div>
              <div style={styles.metricChipValue}>{detailCounts.registros}</div>
            </div>
          </div>
        </div>

        <div style={styles.detailCard}>
          <div style={styles.sectionHeaderRow}>
            <div>
              <div style={styles.sectionTitle}>Detalle del nivel actual</div>
              <div style={styles.sectionSubtitle}>Haz clic en un nivel para ver su desglose</div>
            </div>
            <div style={styles.periodBadge}>
              <div style={styles.periodBadgeLabel}>Periodo aplicado</div>
              <div style={styles.periodBadgeValue}>
                {appliedFechaInicio} al {appliedFechaFin}
              </div>
            </div>
          </div>

          <div style={styles.levelTabs}>
            <button type="button" style={selectedLevel === "cliente" ? styles.levelTabActive : styles.levelTab} onClick={() => setSelectedLevel("cliente")}>
              Clientes
            </button>
            <button type="button" style={selectedLevel === "proyecto" ? styles.levelTabActive : styles.levelTab} onClick={() => setSelectedLevel("proyecto")}>
              Proyectos
            </button>
            <button type="button" style={selectedLevel === "site" ? styles.levelTabActive : styles.levelTab} onClick={() => setSelectedLevel("site")}>
              Sites
            </button>
            <button type="button" style={selectedLevel === "tarea" ? styles.levelTabActive : styles.levelTab} onClick={() => setSelectedLevel("tarea")}>
              Tareas
            </button>
          </div>

          <div style={styles.breakdownTableWrap}>
            <table style={styles.breakdownTable}>
              <thead>
                <tr>
                  <th style={styles.breakdownHeader}>Nivel</th>
                  <th style={styles.breakdownHeader}>Registros</th>
                  <th style={styles.breakdownHeader}>PEN</th>
                  <th style={styles.breakdownHeader}>USD</th>
                  <th style={styles.breakdownHeader}>DOP</th>
                  <th style={{ ...styles.breakdownHeader, ...styles.breakdownHeaderAccent }}>Monto en PEN</th>
                </tr>
              </thead>
              <tbody>
                {sortedChartData.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={styles.emptyCell}>
                      No hay datos para mostrar.
                    </td>
                  </tr>
                ) : (
                  sortedChartData.map((item) => {
                    const pen = item.amountsByCurrency.PEN ?? 0;
                    const usd = item.amountsByCurrency.USD ?? 0;
                    const dop = item.amountsByCurrency.DOP ?? 0;
                    const amountPen = Object.entries(item.amountsByCurrency).reduce(
                      (accumulator, [currency, amount]) =>
                        accumulator + convertToPen(amount, currency, appliedUsdExchangeRate, appliedDopExchangeRate),
                      0,
                    );

                    return (
                      <tr key={`detail-${item.label}`}>
                        <td style={styles.breakdownCellStrong}>{item.label}</td>
                        <td style={styles.breakdownCell}>{item.count}</td>
                        <td style={styles.breakdownCellStrong}>{formatCurrency(pen, "PEN")}</td>
                        <td style={styles.breakdownCellStrong}>{formatCurrency(usd, "USD")}</td>
                        <td style={styles.breakdownCellStrong}>{formatCurrency(dop, "DOP")}</td>
                        <td style={{ ...styles.breakdownCellStrong, ...styles.breakdownCellAccent }}>{formatCurrency(amountPen, "PEN")}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <details style={styles.recordsCard}>
        <summary style={styles.recordsSummary}>
          <div>
            <div style={styles.recordsSummaryTitle}>Detalle de registros</div>
            <div style={styles.recordsSummarySubtitle}>Consulta el detalle completo de los registros del nivel seleccionado</div>
          </div>
          <span style={styles.recordsSummaryChevron}>⌄</span>
        </summary>

        <div style={styles.recordsBody}>
          <div style={styles.recordsTableWrap}>
            <table style={styles.recordsTable}>
              <thead>
                <tr>
                  <th style={styles.recordsHeader}>Id</th>
                  <th style={styles.recordsHeader}>Fecha</th>
                  <th style={styles.recordsHeader}>Cliente</th>
                  <th style={styles.recordsHeader}>Proyecto</th>
                  <th style={styles.recordsHeader}>Site</th>
                  <th style={styles.recordsHeader}>Tarea</th>
                  <th style={styles.recordsHeader}>Moneda</th>
                  <th style={styles.recordsHeader}>Monto</th>
                  <th style={{ ...styles.recordsHeader, ...styles.breakdownHeaderAccent }}>Monto en PEN</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={styles.emptyCell}>
                      No hay registros para mostrar.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((row, index) => (
                    <tr key={`${row.id}-${index}`}>
                      <td style={styles.recordsCellStrong}>{row.id}</td>
                      <td style={styles.recordsCell}>{row.fechaIngreso}</td>
                      <td style={styles.recordsCell}>{row.cliente}</td>
                      <td style={styles.recordsCell}>{row.proyecto}</td>
                      <td style={styles.recordsCell}>{row.site}</td>
                      <td style={styles.recordsCell}>{row.tarea}</td>
                      <td style={styles.recordsCellStrong}>{row.moneda}</td>
                      <td style={styles.recordsCellStrong}>{formatCurrency(row.monto, row.moneda)}</td>
                      <td style={{ ...styles.recordsCellStrong, ...styles.breakdownCellAccent }}>
                        {formatCurrency(convertToPen(row.monto, row.moneda, appliedUsdExchangeRate, appliedDopExchangeRate), "PEN")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </AppPage>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "grid",
    gap: 18,
    background: "linear-gradient(180deg, #F8FAFF 0%, #F6F8FC 100%)",
  },
  heroCard: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 8px 0",
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 18,
    background: "linear-gradient(135deg, #EEF2FF, #DBEAFE)",
    display: "grid",
    placeItems: "center",
    boxShadow: "0 8px 24px rgba(37, 99, 235, 0.14)",
  },
  heroIconBars: {
    display: "flex",
    gap: 3,
    alignItems: "flex-end",
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: 800,
    color: "#0F172A",
    lineHeight: 1.05,
  },
  heroSubtitle: {
    color: "#475569",
    fontSize: 16,
    marginTop: 4,
  },
  filterCard: {
    borderRadius: 20,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.05)",
    padding: 18,
  },
  filterGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr)) auto",
    gap: 14,
    alignItems: "end",
  },
  filterField: {
    display: "grid",
    gap: 6,
  },
  filterLabel: {
    color: "#334155",
    fontSize: 14,
    fontWeight: 700,
  },
  input: {
    borderRadius: 12,
    border: "1px solid #D5DDEA",
    background: "#FFFFFF",
    padding: "12px 14px",
    fontSize: 16,
    color: "#0F172A",
    outline: "none",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
  },
  primaryButton: {
    minHeight: 48,
    border: "none",
    borderRadius: 12,
    background: "linear-gradient(135deg, #1D4ED8, #2563EB)",
    color: "#FFFFFF",
    fontWeight: 800,
    padding: "0 18px",
    cursor: "pointer",
    boxShadow: "0 14px 24px rgba(37, 99, 235, 0.18)",
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 14,
  },
  kpiCard: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 18,
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    padding: 18,
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
  },
  kpiCardPrimary: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 18,
    background: "linear-gradient(135deg, #0F4BD9, #1D4ED8 60%, #2563EB)",
    color: "#FFFFFF",
    border: "1px solid rgba(255,255,255,0.1)",
    padding: 18,
    boxShadow: "0 18px 32px rgba(29, 78, 216, 0.18)",
  },
  kpiCardGreen: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 18,
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    padding: 18,
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
  },
  kpiCardOrange: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 18,
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    padding: 18,
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
  },
  kpiLabel: {
    fontSize: 13,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "inherit",
    opacity: 0.95,
  },
  kpiValue: {
    marginTop: 10,
    fontSize: 28,
    fontWeight: 900,
    color: "inherit",
    lineHeight: 1.05,
  },
  contentGrid: {
    display: "grid",
    gridTemplateColumns: "1.1fr 1fr",
    gap: 14,
    alignItems: "start",
  },
  chartCard: {
    borderRadius: 18,
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.05)",
    padding: 18,
  },
  detailCard: {
    borderRadius: 18,
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.05)",
    padding: 18,
  },
  sectionHeaderRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: 800,
    color: "#0F172A",
    lineHeight: 1.05,
  },
  sectionSubtitle: {
    marginTop: 6,
    color: "#475569",
    fontSize: 15,
  },
  ghostButton: {
    minHeight: 42,
    borderRadius: 12,
    border: "1px solid #DBEAFE",
    background: "#EFF6FF",
    color: "#1D4ED8",
    fontWeight: 800,
    padding: "0 14px",
    cursor: "pointer",
  },
  chartLayout: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
    alignItems: "center",
  },
  chartWrap: {
    position: "relative",
    minHeight: 320,
    display: "grid",
    placeItems: "center",
  },
  chartCenter: {
    position: "absolute",
    inset: "50% auto auto 50%",
    transform: "translate(-50%, -50%)",
    textAlign: "center",
    pointerEvents: "none",
  },
  chartCenterValue: {
    fontSize: 28,
    fontWeight: 900,
    color: "#0F172A",
  },
  chartCenterLabel: {
    marginTop: 4,
    fontSize: 14,
    color: "#64748B",
    fontWeight: 700,
  },
  legendList: {
    display: "grid",
    gap: 12,
  },
  legendRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 14,
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
  },
  legendNameWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 999,
    flexShrink: 0,
  },
  legendName: {
    color: "#0F172A",
    fontWeight: 700,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  legendValues: {
    display: "grid",
    justifyItems: "end",
    gap: 2,
  },
  legendAmount: {
    color: "#0F172A",
    fontWeight: 800,
  },
  legendPercent: {
    color: "#64748B",
    fontSize: 13,
  },
  metricStrip: {
    marginTop: 16,
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: 10,
    borderRadius: 16,
    border: "1px solid #E2E8F0",
    background: "#FAFBFF",
    padding: 12,
  },
  metricChip: {
    display: "grid",
    gap: 4,
    justifyItems: "center",
    textAlign: "center",
    padding: "6px 4px",
  },
  metricChipLabel: {
    fontSize: 13,
    color: "#475569",
    fontWeight: 700,
  },
  metricChipValue: {
    fontSize: 17,
    color: "#0F172A",
    fontWeight: 900,
  },
  periodBadge: {
    minWidth: 240,
    borderRadius: 14,
    background: "#F8FAFF",
    border: "1px solid #DBEAFE",
    padding: "14px 16px",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.4)",
  },
  periodBadgeLabel: {
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  periodBadgeValue: {
    marginTop: 6,
    color: "#0F172A",
    fontSize: 18,
    fontWeight: 800,
  },
  levelTabs: {
    display: "flex",
    gap: 10,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  levelTab: {
    minHeight: 38,
    borderRadius: 10,
    border: "1px solid #D5DDEA",
    background: "#FFFFFF",
    color: "#0F172A",
    fontWeight: 800,
    padding: "0 14px",
    cursor: "pointer",
  },
  levelTabActive: {
    minHeight: 38,
    borderRadius: 10,
    border: "1px solid #1D4ED8",
    background: "#1D4ED8",
    color: "#FFFFFF",
    fontWeight: 800,
    padding: "0 14px",
    cursor: "pointer",
    boxShadow: "0 10px 18px rgba(29, 78, 216, 0.18)",
  },
  breakdownTableWrap: {
    borderRadius: 16,
    border: "1px solid #E2E8F0",
    overflow: "auto",
    maxHeight: 480,
  },
  breakdownTable: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 640,
  },
  breakdownHeader: {
    position: "sticky",
    top: 0,
    background: "#FFFFFF",
    textAlign: "left",
    padding: "14px 12px",
    borderBottom: "1px solid #E2E8F0",
    color: "#475569",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  breakdownHeaderAccent: {
    background: "linear-gradient(135deg, #DBEAFE, #BFDBFE 55%, #93C5FD)",
    color: "#0F172A",
  },
  breakdownCell: {
    padding: "12px",
    borderBottom: "1px solid #EEF2F7",
    color: "#0F172A",
  },
  breakdownCellStrong: {
    padding: "12px",
    borderBottom: "1px solid #EEF2F7",
    color: "#0F172A",
    fontWeight: 800,
  },
  breakdownCellAccent: {
    background: "linear-gradient(135deg, #DBEAFE, #BFDBFE 55%, #93C5FD)",
    color: "#0F172A",
  },
  emptyCell: {
    padding: 20,
    textAlign: "center",
    color: "#64748B",
  },
  recordsCard: {
    borderRadius: 18,
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.05)",
    padding: 0,
    overflow: "hidden",
  },
  recordsSummary: {
    listStyle: "none",
    cursor: "pointer",
    padding: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  recordsSummaryTitle: {
    fontSize: 22,
    fontWeight: 800,
    color: "#0F172A",
  },
  recordsSummarySubtitle: {
    marginTop: 4,
    color: "#64748B",
  },
  recordsSummaryChevron: {
    fontSize: 28,
    color: "#0F172A",
    lineHeight: 1,
  },
  recordsBody: {
    padding: "0 18px 18px",
  },
  recordsTableWrap: {
    borderRadius: 16,
    border: "1px solid #E2E8F0",
    overflow: "auto",
    maxHeight: 460,
  },
  recordsTable: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 860,
  },
  recordsHeader: {
    position: "sticky",
    top: 0,
    background: "#F8FAFC",
    textAlign: "left",
    padding: "12px 10px",
    borderBottom: "1px solid #E2E8F0",
    color: "#475569",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  recordsCell: {
    padding: "12px 10px",
    borderBottom: "1px solid #EEF2F7",
    color: "#0F172A",
  },
  recordsCellStrong: {
    padding: "12px 10px",
    borderBottom: "1px solid #EEF2F7",
    color: "#0F172A",
    fontWeight: 800,
  },
};
