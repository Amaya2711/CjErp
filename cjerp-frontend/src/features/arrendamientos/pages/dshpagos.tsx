import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { obtenerDshPagosArrendamientos } from "../../../api/arrendamientosService";
import type {
  ArrendamientosDshPagosDetalle,
  ArrendamientosDshPagosInmueble,
  ArrendamientosDshPagosInquilino,
  ArrendamientosDshPagosPrincipal,
  ArrendamientosDshPagosResponse,
} from "../../../models/arrendamientos";

type TabKey = "principal" | "detalle";

type FilterState = {
  idInmueble: string;
  idInquilino: string;
};

const EMPTY_DSH_PAGOS: ArrendamientosDshPagosResponse = {
  idInmuebleSeleccionado: null,
  idInquilinoSeleccionado: null,
  inmuebles: [],
  inquilinos: [],
  kpi: {
    contratosActivos: 0,
    obligacionesPendientes: 0,
    saldoPendiente: 0,
    pagosAplicados: 0,
    ultimoPagoFecha: null,
    ultimoPagoImporte: 0,
    monedaBase: null,
  },
  principal: [],
  detalle: [],
};

export default function ArrendamientosDshPagosPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("principal");
  const [filters, setFilters] = useState<FilterState>({ idInmueble: "", idInquilino: "" });
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [data, setData] = useState<ArrendamientosDshPagosResponse>(EMPTY_DSH_PAGOS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const cargar = async () => {
      try {
        setLoading(true);
        const response = await obtenerDshPagosArrendamientos({
          idInmueble: parseNullableId(filters.idInmueble),
          idInquilino: parseNullableId(filters.idInquilino),
        });

        if (!alive) {
          return;
        }

        setData(response);
        setError(null);

        setFilters((current) => {
          const nextInmueble =
            response.idInmuebleSeleccionado != null
              ? String(response.idInmuebleSeleccionado)
              : current.idInmueble;
          const nextInquilino =
            response.idInquilinoSeleccionado != null
              ? String(response.idInquilinoSeleccionado)
              : current.idInquilino;

          if (nextInmueble === current.idInmueble && nextInquilino === current.idInquilino) {
            return current;
          }

          return {
            idInmueble: nextInmueble,
            idInquilino: nextInquilino,
          };
        });
      } catch (fetchError) {
        if (!alive) {
          return;
        }

        setData(EMPTY_DSH_PAGOS);
        setError(fetchError instanceof Error ? fetchError.message : "No se pudo cargar el dashboard de pagos.");
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    };

    void cargar();

    return () => {
      alive = false;
    };
  }, [filters.idInmueble, filters.idInquilino, refreshSeed]);

  const inmuebleOptions = data.inmuebles;
  const inquilinoOptions = data.inquilinos;
  const monedaBase = normalizeCurrency(data.kpi.monedaBase ?? "PEN");

  const selectedInmuebleLabel = useMemo(() => {
    if (!filters.idInmueble) {
      return "Todos los inmuebles";
    }

    const match = inmuebleOptions.find((item) => String(item.idInmueble) === filters.idInmueble);
    return match ? match.nombreInmueble ?? `Inmueble ${match.idInmueble}` : "Inmueble no encontrado";
  }, [filters.idInmueble, inmuebleOptions]);

  const selectedInquilinoLabel = useMemo(() => {
    if (!filters.idInquilino) {
      return "Sin inquilino";
    }

    const match = inquilinoOptions.find((item) => String(item.idInquilino) === filters.idInquilino);
    return match
      ? buildInquilinoLabel(match)
      : "Inquilino no encontrado";
  }, [filters.idInquilino, inquilinoOptions]);

  const kpiCards = useMemo(
    () => [
      {
        label: "Contratos activos",
        value: data.kpi.contratosActivos.toLocaleString("es-PE"),
        accent: "#0F766E",
        hint: selectedInquilinoLabel,
      },
      {
        label: "Obligaciones pendientes",
        value: data.kpi.obligacionesPendientes.toLocaleString("es-PE"),
        accent: "#B45309",
        hint: selectedInmuebleLabel,
      },
      {
        label: "Saldo pendiente",
        value: formatMoney(data.kpi.saldoPendiente, monedaBase),
        accent: "#1D4ED8",
        hint: "Saldo acumulado de las obligaciones activas",
      },
      {
        label: "Pagos aplicados",
        value: formatMoney(data.kpi.pagosAplicados, monedaBase),
        accent: "#7C3AED",
        hint: data.kpi.ultimoPagoFecha
          ? `Ultimo pago ${data.kpi.ultimoPagoFecha}`
          : "Sin pagos registrados",
      },
    ],
    [data.kpi, monedaBase, selectedInmuebleLabel, selectedInquilinoLabel]
  );

  const principalRows = data.principal;
  const detalleRows = data.detalle;

  return (
    <div style={styles.page}>
      <div style={styles.backgroundGlowA} />
      <div style={styles.backgroundGlowB} />

      <div style={styles.shell}>
        <header style={styles.hero}>
          <div>
            <p style={styles.eyebrow}>Arrendamientos</p>
            <h1 style={styles.title}>Dashboard de pagos</h1>
            <p style={styles.subtitle}>
              Vista nueva para filtros, KPI del inquilino seleccionado y detalle en pestañas independientes.
            </p>
          </div>

          <div style={styles.heroMeta}>
            <div style={styles.metaChip}>
              <span style={styles.metaLabel}>Inmueble</span>
              <strong style={styles.metaValue}>{selectedInmuebleLabel}</strong>
            </div>
            <div style={styles.metaChip}>
              <span style={styles.metaLabel}>Inquilino</span>
              <strong style={styles.metaValue}>{selectedInquilinoLabel}</strong>
            </div>
            <button type="button" onClick={() => setRefreshSeed((value) => value + 1)} style={styles.refreshButton}>
              Refrescar
            </button>
          </div>
        </header>

        <section style={styles.filtersCard}>
          <div style={styles.filtersGrid}>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Inmueble</span>
              <select
                value={filters.idInmueble}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    idInmueble: event.target.value,
                    idInquilino: "",
                  }))
                }
                style={styles.select}
              >
                <option value="">Todos</option>
                {inmuebleOptions.map((item) => (
                  <option key={item.idInmueble} value={String(item.idInmueble)}>
                    {item.nombreInmueble ?? `Inmueble ${item.idInmueble}`}
                  </option>
                ))}
              </select>
            </label>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>Inquilino</span>
              <select
                value={filters.idInquilino}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    idInquilino: event.target.value,
                  }))
                }
                style={styles.select}
              >
                <option value="">Seleccione</option>
                {inquilinoOptions.map((item) => (
                  <option key={`${item.idInquilino}-${item.idInmueble ?? "x"}`} value={String(item.idInquilino)}>
                    {buildInquilinoLabel(item)}
                  </option>
                ))}
              </select>
            </label>

            <div style={styles.filterInfo}>
              <span style={styles.filterInfoLabel}>Filtros activos</span>
              <strong style={styles.filterInfoValue}>
                {selectedInmuebleLabel} / {selectedInquilinoLabel}
              </strong>
            </div>
          </div>
        </section>

        <section style={styles.kpiGrid}>
          {kpiCards.map((card) => (
            <article key={card.label} style={{ ...styles.kpiCard, borderTopColor: card.accent }}>
              <span style={styles.kpiLabel}>{card.label}</span>
              <strong style={styles.kpiValue}>{card.value}</strong>
              <span style={styles.kpiHint}>{card.hint}</span>
            </article>
          ))}
        </section>

        <section style={styles.tabShell}>
          <div style={styles.tabBar}>
            <button
              type="button"
              onClick={() => setActiveTab("principal")}
              style={{
                ...styles.tabButton,
                ...(activeTab === "principal" ? styles.tabButtonActive : {}),
              }}
            >
              Principal
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("detalle")}
              style={{
                ...styles.tabButton,
                ...(activeTab === "detalle" ? styles.tabButtonActive : {}),
              }}
            >
              Detalle
            </button>
          </div>

          <div style={styles.tabBody}>
            {loading && (
              <div style={styles.stateBox}>
                <strong style={styles.stateTitle}>Cargando dashboard...</strong>
                <span style={styles.stateText}>Estamos consultando filtros, KPI y detalle de pagos.</span>
              </div>
            )}

            {!loading && error && (
              <div style={styles.stateBoxError}>
                <strong style={styles.stateTitle}>No se pudo cargar el dashboard</strong>
                <span style={styles.stateText}>{error}</span>
              </div>
            )}

            {!loading && !error && activeTab === "principal" && (
              <div style={styles.tableCard}>
                <div style={styles.tableHeader}>
                  <div>
                    <h2 style={styles.sectionTitle}>Principal</h2>
                    <p style={styles.sectionSubtitle}>
                      Resumen de contratos activos, obligaciones y saldos del inquilino seleccionado.
                    </p>
                  </div>
                  <span style={styles.counterBadge}>{principalRows.length} registros</span>
                </div>
                <div style={styles.tableScroll}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Contrato</th>
                        <th style={styles.th}>Inmueble</th>
                        <th style={styles.th}>Vigencia</th>
                        <th style={styles.thRight}>Obligado</th>
                        <th style={styles.thRight}>Pagado</th>
                        <th style={styles.thRight}>Saldo</th>
                        <th style={styles.th}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {principalRows.length === 0 ? (
                        <tr>
                          <td style={styles.emptyCell} colSpan={7}>
                            No hay contratos para el filtro actual.
                          </td>
                        </tr>
                      ) : (
                        principalRows.map((row) => (
                          <tr key={row.idContrato} style={styles.tr}>
                            <td style={styles.tdStrong}>
                              <div>{row.codigoContrato ?? `Contrato ${row.idContrato}`}</div>
                              <div style={styles.mutedText}>{row.nombreInquilino ?? "-"}</div>
                            </td>
                            <td style={styles.td}>{row.nombreInmueble ?? "-"}</td>
                            <td style={styles.td}>
                              <div>{row.fechaInicio ?? "-"}</div>
                              <div style={styles.mutedText}>hasta {row.fechaFin ?? "-"}</div>
                            </td>
                            <td style={styles.tdRight}>{formatMoney(row.totalObligado, row.moneda ?? monedaBase)}</td>
                            <td style={styles.tdRight}>{formatMoney(row.totalPagado, row.moneda ?? monedaBase)}</td>
                            <td style={styles.tdRight}>{formatMoney(row.saldoPendiente, row.moneda ?? monedaBase)}</td>
                            <td style={styles.td}>
                              <span style={getPillStyle(row.estadoContrato)}>{row.estadoContrato ?? "-"}</span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!loading && !error && activeTab === "detalle" && (
              <div style={styles.tableCard}>
                <div style={styles.tableHeader}>
                  <div>
                    <h2 style={styles.sectionTitle}>Detalle</h2>
                    <p style={styles.sectionSubtitle}>
                      Movimientos de obligaciones y pagos relacionados al inquilino seleccionado.
                    </p>
                  </div>
                  <span style={styles.counterBadge}>{detalleRows.length} movimientos</span>
                </div>
                <div style={styles.tableScroll}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Fecha</th>
                        <th style={styles.th}>Tipo</th>
                        <th style={styles.th}>Contrato</th>
                        <th style={styles.th}>Inmueble</th>
                        <th style={styles.th}>Concepto</th>
                        <th style={styles.th}>Periodo</th>
                        <th style={styles.th}>Estado</th>
                        <th style={styles.thRight}>Importe</th>
                        <th style={styles.thRight}>Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalleRows.length === 0 ? (
                        <tr>
                          <td style={styles.emptyCell} colSpan={9}>
                            No hay movimientos para el filtro actual.
                          </td>
                        </tr>
                      ) : (
                        detalleRows.map((row) => (
                          <tr key={`${row.tipoMovimiento}-${row.idMovimiento}`} style={styles.tr}>
                            <td style={styles.td}>{row.fecha ?? "-"}</td>
                            <td style={styles.td}>
                              <span style={getMovementStyle(row.tipoMovimiento)}>{row.tipoMovimiento ?? "-"}</span>
                            </td>
                            <td style={styles.tdStrong}>{row.codigoContrato ?? "-"}</td>
                            <td style={styles.td}>{row.nombreInmueble ?? "-"}</td>
                            <td style={styles.td}>{row.concepto ?? "-"}</td>
                            <td style={styles.td}>{row.periodo ?? "-"}</td>
                            <td style={styles.td}>
                              <span style={getPillStyle(row.estado)}>{row.estado ?? "-"}</span>
                            </td>
                            <td style={styles.tdRight}>{formatMoney(row.importe, row.moneda ?? monedaBase)}</td>
                            <td style={styles.tdRight}>{formatMoney(row.saldo, row.moneda ?? monedaBase)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function parseNullableId(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeCurrency(currency?: string | null): string {
  const normalized = (currency ?? "PEN").trim().toUpperCase();
  return normalized.length === 3 ? normalized : "PEN";
}

function formatMoney(amount: number, currency?: string | null): string {
  const normalizedCurrency = normalizeCurrency(currency);

  try {
    return new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: normalizedCurrency,
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

function buildInquilinoLabel(item: ArrendamientosDshPagosInquilino): string {
  const nombre = (item.nombreComercial ?? "").trim() || `Inquilino ${item.idInquilino}`;
  const inmueble = (item.nombreInmueble ?? "").trim();

  return inmueble ? `${nombre} · ${inmueble}` : nombre;
}

function getPillStyle(value?: string | null): CSSProperties {
  const text = (value ?? "").trim().toUpperCase();

  if (["ACTIVO", "VIGENTE", "APROBADO", "PENDIENTE"].includes(text)) {
    return { ...styles.pill, background: "#DCFCE7", color: "#166534" };
  }

  if (["PARCIAL", "VENCIDO", "RECHAZADO"].includes(text)) {
    return { ...styles.pill, background: "#FEF3C7", color: "#92400E" };
  }

  if (["ANULADO", "INACTIVO"].includes(text)) {
    return { ...styles.pill, background: "#FEE2E2", color: "#991B1B" };
  }

  return styles.pill;
}

function getMovementStyle(value?: string | null): CSSProperties {
  const text = (value ?? "").trim().toUpperCase();

  if (text === "PAGO") {
    return { ...styles.movementPill, background: "#E0F2FE", color: "#075985" };
  }

  return { ...styles.movementPill, background: "#F3E8FF", color: "#6B21A8" };
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "calc(100vh - 120px)",
    padding: "24px 24px 40px",
    position: "relative",
    overflow: "hidden",
    background:
      "linear-gradient(160deg, rgba(8,15,29,0.98) 0%, rgba(14,23,42,0.98) 52%, rgba(4,9,19,0.98) 100%)",
    color: "#E5E7EB",
  },
  shell: {
    position: "relative",
    zIndex: 1,
    maxWidth: 1480,
    margin: "0 auto",
    display: "grid",
    gap: 18,
  },
  backgroundGlowA: {
    position: "absolute",
    inset: "auto auto 14% 0",
    width: 320,
    height: 320,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(59,130,246,0.22), rgba(59,130,246,0))",
    filter: "blur(8px)",
    pointerEvents: "none",
  },
  backgroundGlowB: {
    position: "absolute",
    top: 32,
    right: 12,
    width: 380,
    height: 380,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(168,85,247,0.18), rgba(168,85,247,0))",
    filter: "blur(12px)",
    pointerEvents: "none",
  },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    gap: 20,
    alignItems: "flex-start",
    flexWrap: "wrap",
    padding: 24,
    borderRadius: 24,
    background: "rgba(15,23,42,0.78)",
    border: "1px solid rgba(148,163,184,0.16)",
    boxShadow: "0 24px 80px rgba(0,0,0,0.24)",
    backdropFilter: "blur(16px)",
  },
  eyebrow: {
    margin: 0,
    textTransform: "uppercase",
    letterSpacing: "0.24em",
    fontSize: 11,
    color: "#93C5FD",
    fontWeight: 800,
  },
  title: {
    margin: "8px 0 0",
    fontSize: 34,
    lineHeight: 1.05,
    fontWeight: 900,
    color: "#F8FAFC",
  },
  subtitle: {
    margin: "10px 0 0",
    maxWidth: 780,
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 1.6,
  },
  heroMeta: {
    display: "grid",
    gap: 10,
    minWidth: 0,
    flex: "1 1 280px",
  },
  metaChip: {
    padding: "12px 14px",
    borderRadius: 16,
    background: "rgba(30,41,59,0.88)",
    border: "1px solid rgba(148,163,184,0.16)",
  },
  metaLabel: {
    display: "block",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.18em",
    color: "#94A3B8",
    marginBottom: 4,
  },
  metaValue: {
    display: "block",
    fontSize: 14,
    lineHeight: 1.3,
    color: "#F8FAFC",
  },
  refreshButton: {
    border: "none",
    borderRadius: 16,
    padding: "12px 16px",
    background: "linear-gradient(135deg, #2563EB, #7C3AED)",
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 12px 28px rgba(37,99,235,0.28)",
  },
  filtersCard: {
    padding: 20,
    borderRadius: 24,
    background: "rgba(15,23,42,0.72)",
    border: "1px solid rgba(148,163,184,0.16)",
    backdropFilter: "blur(14px)",
  },
  filtersGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
    alignItems: "end",
  },
  field: {
    display: "grid",
    gap: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#CBD5E1",
  },
  select: {
    height: 44,
    borderRadius: 14,
    border: "1px solid rgba(148,163,184,0.22)",
    background: "rgba(15,23,42,0.96)",
    color: "#F8FAFC",
    padding: "0 14px",
    outline: "none",
    fontSize: 14,
  },
  filterInfo: {
    padding: "14px 16px",
    borderRadius: 18,
    background: "linear-gradient(135deg, rgba(37,99,235,0.16), rgba(124,58,237,0.16))",
    border: "1px solid rgba(96,165,250,0.18)",
  },
  filterInfoLabel: {
    display: "block",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.18em",
    color: "#93C5FD",
    marginBottom: 6,
    fontWeight: 800,
  },
  filterInfoValue: {
    display: "block",
    color: "#F8FAFC",
    fontSize: 14,
    lineHeight: 1.4,
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },
  kpiCard: {
    padding: 18,
    borderRadius: 20,
    background: "rgba(15,23,42,0.78)",
    border: "1px solid rgba(148,163,184,0.16)",
    borderTopWidth: 4,
    borderTopStyle: "solid",
    minHeight: 128,
    display: "grid",
    alignContent: "start",
    gap: 8,
  },
  kpiLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.16em",
    color: "#94A3B8",
    fontWeight: 800,
  },
  kpiValue: {
    fontSize: 28,
    lineHeight: 1.1,
    color: "#F8FAFC",
    fontWeight: 900,
  },
  kpiHint: {
    fontSize: 13,
    lineHeight: 1.5,
    color: "#CBD5E1",
  },
  tabShell: {
    borderRadius: 24,
    overflow: "hidden",
    border: "1px solid rgba(148,163,184,0.16)",
    background: "rgba(15,23,42,0.74)",
    backdropFilter: "blur(14px)",
    boxShadow: "0 16px 48px rgba(0,0,0,0.18)",
  },
  tabBar: {
    display: "flex",
    gap: 10,
    padding: 14,
    borderBottom: "1px solid rgba(148,163,184,0.14)",
  },
  tabButton: {
    border: "1px solid rgba(148,163,184,0.2)",
    background: "rgba(15,23,42,0.7)",
    color: "#CBD5E1",
    borderRadius: 999,
    padding: "10px 16px",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
  },
  tabButtonActive: {
    background: "linear-gradient(135deg, #2563EB, #7C3AED)",
    color: "#FFFFFF",
    borderColor: "transparent",
    boxShadow: "0 10px 24px rgba(37,99,235,0.22)",
  },
  tabBody: {
    padding: 18,
  },
  tableCard: {
    display: "grid",
    gap: 14,
  },
  tableHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    color: "#F8FAFC",
    fontWeight: 900,
  },
  sectionSubtitle: {
    margin: "6px 0 0",
    color: "#CBD5E1",
    fontSize: 13,
    lineHeight: 1.5,
  },
  counterBadge: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(37,99,235,0.14)",
    color: "#BFDBFE",
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid rgba(96,165,250,0.18)",
  },
  tableScroll: {
    overflowX: "auto",
    borderRadius: 18,
    border: "1px solid rgba(148,163,184,0.16)",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 1080,
    background: "rgba(2,6,23,0.35)",
  },
  th: {
    textAlign: "left",
    padding: "14px 14px",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "#94A3B8",
    background: "rgba(15,23,42,0.92)",
    position: "sticky",
    top: 0,
  },
  thRight: {
    textAlign: "right",
    padding: "14px 14px",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "#94A3B8",
    background: "rgba(15,23,42,0.92)",
    position: "sticky",
    top: 0,
  },
  tr: {
    borderTop: "1px solid rgba(148,163,184,0.12)",
  },
  td: {
    padding: "14px 14px",
    fontSize: 14,
    color: "#E5E7EB",
    verticalAlign: "top",
  },
  tdStrong: {
    padding: "14px 14px",
    fontSize: 14,
    color: "#F8FAFC",
    fontWeight: 800,
    verticalAlign: "top",
  },
  tdRight: {
    padding: "14px 14px",
    fontSize: 14,
    color: "#F8FAFC",
    textAlign: "right",
    verticalAlign: "top",
    whiteSpace: "nowrap",
  },
  emptyCell: {
    padding: "28px 14px",
    textAlign: "center",
    color: "#94A3B8",
    fontSize: 14,
  },
  mutedText: {
    marginTop: 4,
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: 500,
  },
  stateBox: {
    borderRadius: 18,
    border: "1px solid rgba(59,130,246,0.22)",
    background: "linear-gradient(135deg, rgba(30,64,175,0.24), rgba(15,23,42,0.72))",
    padding: 18,
    display: "grid",
    gap: 8,
  },
  stateBoxError: {
    borderRadius: 18,
    border: "1px solid rgba(248,113,113,0.24)",
    background: "linear-gradient(135deg, rgba(127,29,29,0.24), rgba(15,23,42,0.72))",
    padding: 18,
    display: "grid",
    gap: 8,
  },
  stateTitle: {
    fontSize: 16,
    color: "#F8FAFC",
    fontWeight: 900,
  },
  stateText: {
    fontSize: 14,
    color: "#CBD5E1",
    lineHeight: 1.5,
  },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    background: "#E2E8F0",
    color: "#0F172A",
  },
  movementPill: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
  },
};
