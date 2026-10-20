import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Download } from "lucide-react";

// Cuadro ejecutivo del resumen calculado en SQL (modo RESUMEN de sp_IA_Planilla_Buscar):
//  - una tarjeta por moneda (registros y subtotal en la moneda original; el equivalente en soles es referencial),
//  - una tabla por la primera dimension pedida (cliente, proyecto, fecha, mes...) con una columna por moneda.
// Nunca suma monedas distintas en una sola cifra.

type Row = Record<string, unknown>;

type SqlSummaryBlockProps = {
  dimensions: string[];
  groups: Row[];
  totals: Row[];
  filters?: { label: string; value: string }[];
};

const DIMENSION_LABELS: Record<string, string> = {
  CLIENTE: "Cliente",
  PROYECTO: "Proyecto",
  RESPONSABLE: "Responsable",
  SOLICITANTE: "Solicitante",
  SITE: "Site",
  ESTADO: "Estado",
  MONEDA: "Moneda",
  BIEN: "Bien",
  COMPROBANTE: "Comprobante",
  TIPOPAGO: "Tipo de pago",
  TIPOTRABAJO: "Tipo de trabajo",
  FECHA: "Fecha",
  MES: "Mes",
  COINCIDENCIA: "Coincidencia",
  ROL: "Rol",
};

// Nombre de la columna en las filas del store (alias de @Whitelist).
const DIMENSION_COLUMNS: Record<string, string> = {
  CLIENTE: "Cliente",
  PROYECTO: "Proyecto",
  RESPONSABLE: "Responsable",
  SOLICITANTE: "Solicitante",
  SITE: "Site",
  ESTADO: "Estado",
  MONEDA: "Moneda",
  BIEN: "Bien",
  COMPROBANTE: "Comprobante",
  TIPOPAGO: "TipoPago",
  TIPOTRABAJO: "TipoTrabajo",
  FECHA: "Fecha",
  MES: "Mes",
  COINCIDENCIA: "Coincidencia",
  ROL: "Rol",
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  SOLES: "S/",
  DOLARES: "US$",
  "PESO DOMINICANO": "RD$",
  EUROS: "EUR ",
  "PESO COLOMBIANO": "COL$",
};

const TOP_ROWS = 10;
const GROUP_LIMIT_HINT = 200;

const numberFormat = new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const integerFormat = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toLabel(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value).trim();
  return text || "Sin dato";
}

function formatMoney(currency: string, value: number): string {
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()] ?? "";
  return `${symbol} ${numberFormat.format(value)}`.trim();
}

type PivotRow = {
  key: string;
  labels: string[];
  byCurrency: Record<string, { registros: number; subtotal: number }>;
  registros: number;
  soles: number;
};

function buildPivot(groups: Row[], rowDimensions: string[]): PivotRow[] {
  const rows = new Map<string, PivotRow>();

  for (const group of groups) {
    const labels = rowDimensions.map((dimension) => toLabel(group[DIMENSION_COLUMNS[dimension] ?? dimension]));
    const key = labels.join(" · ");
    const currency = toLabel(group["Moneda"]);
    const entry = rows.get(key) ?? { key, labels, byCurrency: {}, registros: 0, soles: 0 };

    const registros = toNumber(group["Registros"]);
    const current = entry.byCurrency[currency] ?? { registros: 0, subtotal: 0 };
    current.registros += registros;
    current.subtotal += toNumber(group["SubtotalMonedaOriginal"]);
    entry.byCurrency[currency] = current;
    entry.registros += registros;
    entry.soles += toNumber(group["SubtotalSolesEquivalente"]);
    rows.set(key, entry);
  }

  const chronological = rowDimensions[0] === "FECHA" || rowDimensions[0] === "MES";

  return Array.from(rows.values()).sort((a, b) =>
    chronological ? a.key.localeCompare(b.key) : b.soles - a.soles || a.key.localeCompare(b.key)
  );
}

export function SqlSummaryBlock({ dimensions, groups, totals, filters = [] }: SqlSummaryBlockProps) {
  const [showAll, setShowAll] = useState(false);
  const [exporting, setExporting] = useState(false);

  const rowDimensions = useMemo(
    () => dimensions.filter((dimension) => dimension !== "MONEDA").flatMap((dimension) => (dimension === "COINCIDENCIA" ? ["ROL", "COINCIDENCIA"] : [dimension])),
    [dimensions]
  );

  const currencyTotals = useMemo(
    () =>
      totals
        .map((total) => ({
          moneda: toLabel(total["Moneda"]),
          registros: toNumber(total["Registros"]),
          subtotal: toNumber(total["SubtotalMonedaOriginal"]),
          igv: toNumber(total["IgvMonedaOriginal"]),
          total: toNumber(total["TotalMonedaOriginal"]),
          soles: toNumber(total["SubtotalSolesEquivalente"]),
          sinTipoCambio: toNumber(total["FilasSinTipoCambio"]),
        }))
        .sort((a, b) => b.soles - a.soles),
    [totals]
  );

  const currencies = useMemo(() => currencyTotals.map((item) => item.moneda), [currencyTotals]);
  const pivot = useMemo(() => buildPivot(groups, rowDimensions), [groups, rowDimensions]);
  const totalRegistros = currencyTotals.reduce((sum, item) => sum + item.registros, 0);
  const hasForeignCurrency = currencies.some((currency) => currency.toUpperCase() !== "SOLES");
  const visibleRows = showAll ? pivot : pivot.slice(0, TOP_ROWS);
  const dimensionTitle = rowDimensions.map((dimension) => DIMENSION_LABELS[dimension] ?? dimension).join(" y ");
  const truncated = groups.length >= GROUP_LIMIT_HINT;

  const handleExport = async () => {
    setExporting(true);

    try {
      const XLSX = await import("xlsx");
      const header = [
        ...rowDimensions.map((dimension) => DIMENSION_LABELS[dimension] ?? dimension),
        ...currencies.map((currency) => `Subtotal ${currency}`),
        "Registros",
        ...(hasForeignCurrency ? ["Equivalente en soles (referencial)"] : []),
      ];
      const body = pivot.map((row) => [
        ...row.labels,
        ...currencies.map((currency) => row.byCurrency[currency]?.subtotal ?? 0),
        row.registros,
        ...(hasForeignCurrency ? [row.soles] : []),
      ]);
      const totalRow = [
        ...rowDimensions.map((_, index) => (index === 0 ? "TOTAL" : "")),
        ...currencies.map((currency) => currencyTotals.find((item) => item.moneda === currency)?.subtotal ?? 0),
        totalRegistros,
        ...(hasForeignCurrency ? [currencyTotals.reduce((sum, item) => sum + item.soles, 0)] : []),
      ];

      const worksheet = XLSX.utils.aoa_to_sheet([header, ...body, totalRow]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Resumen");
      XLSX.writeFile(workbook, `resumen-gastos-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={styles.shell}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>
            Resumen ejecutivo{dimensionTitle ? ` por ${dimensionTitle.toLowerCase()}` : ""} y moneda
          </div>
          <div style={styles.subtitle}>
            {integerFormat.format(totalRegistros)} registros analizados en el 100 % del universo filtrado
          </div>
        </div>
        {pivot.length > 0 && (
          <button type="button" onClick={() => void handleExport()} disabled={exporting} style={styles.exportButton}>
            <Download size={14} />
            {exporting ? "Exportando..." : "Exportar Excel"}
          </button>
        )}
      </div>

      {filters.length > 0 && (
        <div style={styles.chips}>
          {filters.map((filter) => (
            <span key={`${filter.label}-${filter.value}`} style={styles.chip}>
              {filter.label}: {filter.value}
            </span>
          ))}
        </div>
      )}

      <div style={styles.cards}>
        {currencyTotals.map((item) => (
          <div key={item.moneda} style={styles.card}>
            <div style={styles.cardLabel}>{item.moneda}</div>
            <div style={styles.cardValue}>{formatMoney(item.moneda, item.subtotal)}</div>
            <div style={styles.cardMeta}>
              {integerFormat.format(item.registros)} registros · IGV {formatMoney(item.moneda, item.igv)}
            </div>
            {item.moneda.toUpperCase() !== "SOLES" && (
              <div style={styles.cardReference}>
                Equivalente referencial: {formatMoney("SOLES", item.soles)}
              </div>
            )}
            {item.sinTipoCambio > 0 && (
              <div style={styles.cardWarning}>{item.sinTipoCambio} filas sin tipo de cambio</div>
            )}
          </div>
        ))}
      </div>

      {rowDimensions.length > 0 && pivot.length > 0 && (
        <div style={styles.tableShell}>
          <div style={styles.tableHeader}>
            <div style={styles.tableTitle}>Por {dimensionTitle.toLowerCase()}</div>
            {pivot.length > TOP_ROWS && (
              <button type="button" onClick={() => setShowAll((current) => !current)} style={styles.linkButton}>
                {showAll ? "Ver solo los primeros 10" : `Ver todos (${pivot.length})`}
              </button>
            )}
          </div>

          <div style={styles.tableScroll}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {rowDimensions.map((dimension) => (
                    <th key={dimension} style={styles.th}>
                      {DIMENSION_LABELS[dimension] ?? dimension}
                    </th>
                  ))}
                  {currencies.map((currency) => (
                    <th key={currency} style={{ ...styles.th, ...styles.thNumber }}>
                      {currency}
                    </th>
                  ))}
                  <th style={{ ...styles.th, ...styles.thNumber }}>Registros</th>
                  {hasForeignCurrency && (
                    <th style={{ ...styles.th, ...styles.thNumber }} title="Referencial: no se suma entre monedas">
                      Eq. en soles
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.key}>
                    {row.labels.map((label, index) => (
                      <td key={`${row.key}-${index}`} style={styles.td}>
                        {label}
                      </td>
                    ))}
                    {currencies.map((currency) => (
                      <td key={currency} style={{ ...styles.td, ...styles.tdNumber }}>
                        {row.byCurrency[currency] ? formatMoney(currency, row.byCurrency[currency].subtotal) : "-"}
                      </td>
                    ))}
                    <td style={{ ...styles.td, ...styles.tdNumber }}>{integerFormat.format(row.registros)}</td>
                    {hasForeignCurrency && (
                      <td style={{ ...styles.td, ...styles.tdNumber, ...styles.tdMuted }}>
                        {formatMoney("SOLES", row.soles)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  {rowDimensions.map((dimension, index) => (
                    <td key={dimension} style={{ ...styles.td, ...styles.tfoot }}>
                      {index === 0 ? "TOTAL" : ""}
                    </td>
                  ))}
                  {currencies.map((currency) => {
                    const total = currencyTotals.find((item) => item.moneda === currency);
                    return (
                      <td key={currency} style={{ ...styles.td, ...styles.tdNumber, ...styles.tfoot }}>
                        {total ? formatMoney(currency, total.subtotal) : "-"}
                      </td>
                    );
                  })}
                  <td style={{ ...styles.td, ...styles.tdNumber, ...styles.tfoot }}>
                    {integerFormat.format(totalRegistros)}
                  </td>
                  {hasForeignCurrency && <td style={{ ...styles.td, ...styles.tfoot }} />}
                </tr>
              </tfoot>
            </table>
          </div>

          {truncated && (
            <div style={styles.note}>
              Se muestran los {GROUP_LIMIT_HINT} grupos principales; los totales por moneda incluyen todo el universo.
            </div>
          )}
          {dimensions.includes("COINCIDENCIA") && (
            <div style={styles.note}>
              Busqueda por nombre: cada fila es un nombre que coincidio con alguna de las palabras buscadas (la columna Rol indica si
              fue como solicitante o responsable; un registro puede aparecer en ambos roles). &quot;Otro campo&quot; agrupa las
              coincidencias en detalle, cliente, site, etc.
            </div>
          )}
          {hasForeignCurrency && (
            <div style={styles.note}>
              Cada importe va en su moneda; el equivalente en soles es solo referencial y no se suma entre monedas.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    marginTop: 12,
    padding: 16,
    borderRadius: 18,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    color: "#0F172A",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  title: { fontSize: 16, fontWeight: 800 },
  subtitle: { fontSize: 12, color: "#64748B", marginTop: 2 },
  exportButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    borderRadius: 12,
    border: "1px solid #0F766E",
    background: "#F0FDFA",
    color: "#0F766E",
    fontWeight: 800,
    fontSize: 12,
    cursor: "pointer",
  },
  chips: { display: "flex", gap: 8, flexWrap: "wrap" },
  chip: {
    padding: "4px 10px",
    borderRadius: 999,
    background: "#F1F5F9",
    border: "1px solid #E2E8F0",
    fontSize: 12,
    fontWeight: 700,
    color: "#334155",
  },
  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  card: {
    padding: 14,
    borderRadius: 16,
    border: "1px solid #CCFBF1",
    background: "linear-gradient(135deg, #F0FDFA 0%, #EFF6FF 100%)",
  },
  cardLabel: { fontSize: 12, fontWeight: 800, color: "#0F766E", letterSpacing: 0.4 },
  cardValue: { fontSize: 22, fontWeight: 800, marginTop: 4 },
  cardMeta: { fontSize: 12, color: "#475569", marginTop: 4 },
  cardReference: { fontSize: 12, color: "#64748B", marginTop: 6 },
  cardWarning: { fontSize: 12, color: "#B45309", fontWeight: 700, marginTop: 6 },
  tableShell: { border: "1px solid #E2E8F0", borderRadius: 16, overflow: "hidden" },
  tableHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    background: "#F8FAFC",
    borderBottom: "1px solid #E2E8F0",
  },
  tableTitle: { fontSize: 13, fontWeight: 800 },
  linkButton: {
    border: "none",
    background: "transparent",
    color: "#2563EB",
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
  },
  tableScroll: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 520 },
  th: {
    textAlign: "left",
    padding: "10px 14px",
    background: "#F1F5F9",
    color: "#334155",
    fontWeight: 800,
    fontSize: 12,
    whiteSpace: "nowrap",
    borderBottom: "1px solid #E2E8F0",
  },
  thNumber: { textAlign: "right" },
  td: { padding: "9px 14px", borderBottom: "1px solid #F1F5F9", whiteSpace: "nowrap" },
  tdNumber: { textAlign: "right", fontVariantNumeric: "tabular-nums" },
  tdMuted: { color: "#64748B" },
  tfoot: { fontWeight: 800, background: "#F8FAFC", borderTop: "2px solid #CBD5E1" },
  note: { padding: "8px 14px", fontSize: 12, color: "#64748B", borderTop: "1px solid #F1F5F9" },
};
