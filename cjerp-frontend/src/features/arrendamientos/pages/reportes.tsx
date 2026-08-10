import { useEffect, useMemo, useState } from "react";
import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppSectionHeader from "../../../components/base/AppSectionHeader";
import {
  listarArrendadoresArrendamientos,
  listarInquilinosArrendamientos,
  listarInmueblesArrendamientos,
  listarPagosDshResumenAnualArrendamientos,
} from "../../../api/arrendamientosService";
import type { ArrendamientosFila } from "../../../models/arrendamientos";

type FilterState = {
  idInmueble: string;
  idInquilino: string;
  idArrendador: string;
  anio: string;
};

type LookupRow = Pick<ArrendamientosFila, "id" | "codigo" | "nombre" | "detalle">;

const YEAR_OPTIONS = Array.from({ length: 11 }, (_, index) => 2025 + index);

export default function ArrendamientosReportesPage() {
  const [filters, setFilters] = useState<FilterState>({
    idInmueble: "",
    idInquilino: "",
    idArrendador: "",
    anio: "",
  });
  const [arrendadores, setArrendadores] = useState<LookupRow[]>([]);
  const [inquilinos, setInquilinos] = useState<LookupRow[]>([]);
  const [inmuebles, setInmuebles] = useState<LookupRow[]>([]);
  const [rows, setRows] = useState<ArrendamientosFila[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    void Promise.all([
      listarArrendadoresArrendamientos(),
      listarInquilinosArrendamientos(),
      listarInmueblesArrendamientos(),
    ])
      .then(([arrendadoresData, inquilinosData, inmueblesData]) => {
        if (!alive) return;
        setArrendadores(arrendadoresData);
        setInquilinos(inquilinosData);
        setInmuebles(inmueblesData);
      })
      .catch(() => {
        if (!alive) return;
        setArrendadores([]);
        setInquilinos([]);
        setInmuebles([]);
      });

    return () => {
      alive = false;
    };
  }, []);

  const consultar = async () => {
    try {
      setLoading(true);
      const response = await listarPagosDshResumenAnualArrendamientos({
        idInmueble: parseNullableId(filters.idInmueble),
        idInquilino: parseNullableId(filters.idInquilino),
        idArrendador: parseNullableId(filters.idArrendador),
        anioInicio: parseNullableId(filters.anio),
        anioFin: parseNullableId(filters.anio),
      });

      setRows(response);
      setError(null);
    } catch (fetchError) {
      setRows([]);
      setError(fetchError instanceof Error ? fetchError.message : "No se pudo cargar el resumen anual.");
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    const contrato = rows.reduce((total, row) => total + Number(row.importe ?? 0), 0);
    const pagado = rows.reduce((total, row) => total + Number(row.importeTransferido ?? 0), 0);
    const saldo = rows.reduce((total, row) => total + Number(row.saldo ?? 0), 0);

    return { contrato, pagado, saldo, registros: rows.length };
  }, [rows]);

  return (
    <AppPage title="Arrendamientos / Reportes">
      <AppCard>
        <AppSectionHeader
          title="Resumen anual de arrendamientos"
          description="Consulta el resumen anual del store con filtros de inmueble, inquilino, arrendador y año opcional."
        />

        <div style={styles.filtersGrid}>
          <label style={styles.field}>
            <span style={styles.label}>Arrendador</span>
            <select
              value={filters.idArrendador}
              onChange={(event) => setFilters((current) => ({ ...current, idArrendador: event.target.value }))}
              style={styles.select}
            >
              <option value="">Todos</option>
              {arrendadores.map((item) => (
                <option key={String(item.id ?? item.codigo ?? item.nombre)} value={String(item.id ?? "")}>
                  {formatLookupLabel(item, "Arrendador")}
                </option>
              ))}
            </select>
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Inmueble</span>
            <select
              value={filters.idInmueble}
              onChange={(event) => setFilters((current) => ({ ...current, idInmueble: event.target.value }))}
              style={styles.select}
            >
              <option value="">Todos</option>
              {inmuebles.map((item) => (
                <option key={String(item.id ?? item.codigo ?? item.nombre)} value={String(item.id ?? "")}>
                  {formatLookupLabel(item, "Inmueble")}
                </option>
              ))}
            </select>
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Inquilino</span>
            <select
              value={filters.idInquilino}
              onChange={(event) => setFilters((current) => ({ ...current, idInquilino: event.target.value }))}
              style={styles.select}
            >
              <option value="">Todos</option>
              {inquilinos.map((item) => (
                <option key={String(item.id ?? item.codigo ?? item.nombre)} value={String(item.id ?? "")}>
                  {formatLookupLabel(item, "Inquilino")}
                </option>
              ))}
            </select>
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Año</span>
            <select
              value={filters.anio}
              onChange={(event) => setFilters((current) => ({ ...current, anio: event.target.value }))}
              style={styles.select}
            >
              <option value="">Todos</option>
              {YEAR_OPTIONS.map((anio) => (
                <option key={anio} value={String(anio)}>
                  {anio}
                </option>
              ))}
            </select>
          </label>
          <div style={styles.consultarField}>
            <button type="button" style={styles.consultarButton} onClick={() => void consultar()}>
              Consultar
            </button>
          </div>
        </div>

        <section style={styles.summaryGrid}>
          <article style={styles.summaryCard}>
            <span style={styles.summaryLabel}>Contratos</span>
            <strong style={styles.summaryValue}>{summary.registros.toLocaleString("es-PE")}</strong>
          </article>
          <article style={styles.summaryCard}>
            <span style={styles.summaryLabel}>Contrato</span>
            <strong style={styles.summaryValue}>{formatMoney(summary.contrato)}</strong>
          </article>
          <article style={styles.summaryCard}>
            <span style={styles.summaryLabel}>Pagado</span>
            <strong style={styles.summaryValue}>{formatMoney(summary.pagado)}</strong>
          </article>
          <article style={styles.summaryCard}>
            <span style={styles.summaryLabel}>Saldo</span>
            <strong style={styles.summaryValue}>{formatMoney(summary.saldo)}</strong>
          </article>
        </section>

        {error ? <p style={styles.error}>{error}</p> : null}
        {loading ? <p style={styles.loading}>Cargando resumen anual...</p> : null}

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Periodo</th>
                <th style={styles.th}>Codigo</th>
                <th style={styles.th}>Nombre</th>
                <th style={styles.th}>Detalle</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Contrato</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Pagado</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Saldo</th>
                <th style={styles.th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.id ?? index}-${row.codigo ?? row.periodo ?? index}`}>
                  <td style={styles.td}>{row.periodo ?? "-"}</td>
                  <td style={styles.td}>{row.codigo ?? "-"}</td>
                  <td style={styles.td}>{row.nombre ?? "-"}</td>
                  <td style={styles.td}>{row.detalle ?? "-"}</td>
                  <td style={{ ...styles.td, ...styles.tdRight }}>{formatMoney(row.importe ?? 0, row.moneda)}</td>
                  <td style={{ ...styles.td, ...styles.tdRight }}>{formatMoney(row.importeTransferido ?? 0, row.moneda)}</td>
                  <td style={{ ...styles.td, ...styles.tdRight }}>{formatMoney(row.saldo ?? 0, row.moneda)}</td>
                  <td style={styles.td}>{row.estado ?? "-"}</td>
                </tr>
              ))}

              {!loading && rows.length === 0 ? (
                <tr>
                  <td style={styles.empty} colSpan={8}>
                    No se encontraron registros para el rango seleccionado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </AppCard>
    </AppPage>
  );
}

function parseNullableId(value: string): number | null {
  const text = value.trim();
  if (!text) return null;

  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatLookupLabel(item: LookupRow, fallback: string): string {
  const nombre = (item.nombre ?? "").trim();
  const codigo = (item.codigo ?? "").trim();
  const detalle = (item.detalle ?? "").trim();

  return [nombre || codigo || fallback, detalle].filter(Boolean).join(" - ");
}

function formatMoney(amount: number, currency?: string | null): string {
  const normalizedCurrency = (currency ?? "PEN").trim().toUpperCase();

  try {
    return new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: normalizedCurrency.length === 3 ? normalizedCurrency : "PEN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount ?? 0));
  } catch {
    return `${normalizedCurrency} ${Number(amount ?? 0).toLocaleString("es-PE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}

const styles: Record<string, React.CSSProperties> = {
  filtersGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginTop: 16,
    marginBottom: 20,
  },
  field: {
    display: "grid",
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: 700,
    color: "#475569",
  },
  select: {
    height: 42,
    borderRadius: 12,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    padding: "0 12px",
    fontSize: 14,
  },
  input: {
    height: 42,
    borderRadius: 12,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    padding: "0 12px",
    fontSize: 14,
  },
  consultarField: {
    display: "flex",
    alignItems: "end",
    gridColumn: "1 / -1",
    justifyContent: "flex-end",
  },
  consultarButton: {
    minWidth: 180,
    height: 46,
    borderRadius: 14,
    border: "1px solid #1D4ED8",
    padding: "0 22px",
    background: "linear-gradient(135deg, #2563EB, #7C3AED)",
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 10px 24px rgba(37,99,235,0.18)",
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginBottom: 16,
  },
  summaryCard: {
    border: "1px solid #E2E8F0",
    borderRadius: 16,
    padding: 16,
    background: "#F8FAFC",
    display: "grid",
    gap: 6,
  },
  summaryLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontWeight: 800,
    color: "#64748B",
  },
  summaryValue: {
    fontSize: 22,
    lineHeight: 1.1,
    color: "#0F172A",
    fontWeight: 900,
  },
  tableWrap: {
    overflowX: "auto",
    border: "1px solid #E2E8F0",
    borderRadius: 16,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 960,
    background: "#FFFFFF",
  },
  th: {
    textAlign: "left",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#64748B",
    padding: "12px 14px",
    borderBottom: "1px solid #E2E8F0",
    background: "#F8FAFC",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "12px 14px",
    borderBottom: "1px solid #E2E8F0",
    fontSize: 14,
    color: "#0F172A",
    whiteSpace: "nowrap",
  },
  tdRight: {
    textAlign: "right",
  },
  empty: {
    padding: 18,
    textAlign: "center",
    color: "#64748B",
    fontSize: 14,
  },
  loading: {
    margin: "0 0 12px",
    fontSize: 14,
    color: "#475569",
  },
  error: {
    margin: "0 0 12px",
    fontSize: 14,
    color: "#B91C1C",
  },
};
