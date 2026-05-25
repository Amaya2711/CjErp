import { useEffect, useMemo, useState } from "react";
import DataGridBase, { type DataGridColumn } from "../../../components/base/DataGridBase";
import { consultarAuditoriaCambios } from "../../../api/auditoriaCambiosService";
import type { AuditoriaCambioFiltro, AuditoriaCambioItem } from "../../../models/auditoria";
import { getHttpErrorMessage } from "../../../utils/httpError";

type FilterState = {
  modulo: string;
  entidad: string;
  idRegistro: string;
  usuarioAccion: string;
  fechaDesde: string;
  fechaHasta: string;
  top: string;
};

const initialFilters: FilterState = {
  modulo: "",
  entidad: "",
  idRegistro: "",
  usuarioAccion: "",
  fechaDesde: "",
  fechaHasta: "",
  top: "300",
};

function formatDateTime(value?: string | null) {
  if (!value) return "";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("es-PE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateText(value?: string | null, max = 90) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

export default function ModificacionesPage() {
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [rows, setRows] = useState<AuditoriaCambioItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadData = async (override?: Partial<FilterState>) => {
    const nextFilters = { ...filters, ...override };
    const payload: AuditoriaCambioFiltro = {
      modulo: nextFilters.modulo.trim() || undefined,
      entidad: nextFilters.entidad.trim() || undefined,
      idRegistro: nextFilters.idRegistro.trim() || undefined,
      usuarioAccion: nextFilters.usuarioAccion.trim() || undefined,
      fechaDesde: nextFilters.fechaDesde || undefined,
      fechaHasta: nextFilters.fechaHasta || undefined,
      top: Number(nextFilters.top) > 0 ? Number(nextFilters.top) : 300,
    };

    setLoading(true);
    setError("");

    try {
      const data = await consultarAuditoriaCambios(payload);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
      setError(getHttpErrorMessage(err, "No se pudo cargar el monitor de modificaciones."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const inserts = rows.filter((item) => item.accion === "INSERT").length;
    const updates = rows.filter((item) => item.accion === "UPDATE").length;
    const users = new Set(rows.map((item) => item.usuarioAccion).filter(Boolean)).size;

    return { total, inserts, updates, users };
  }, [rows]);

  const columns = useMemo<DataGridColumn<AuditoriaCambioItem>[]>(() => [
    {
      key: "fechaAccion",
      header: "Fecha",
      render: (row) => formatDateTime(row.fechaAccion),
    },
    {
      key: "modulo",
      header: "Modulo",
      render: (row) => row.modulo,
    },
    {
      key: "entidad",
      header: "Entidad",
      render: (row) => row.entidad,
    },
    {
      key: "idRegistro",
      header: "Registro",
      render: (row) => row.idRegistro,
    },
    {
      key: "accion",
      header: "Accion",
      align: "center",
      render: (row) => (
        <span
          style={{
            ...styles.actionPill,
            background: row.accion === "INSERT" ? "#DCFCE7" : "#DBEAFE",
            color: row.accion === "INSERT" ? "#166534" : "#1D4ED8",
          }}
        >
          {row.accion}
        </span>
      ),
    },
    {
      key: "campo",
      header: "Campo",
      render: (row) => row.campo,
    },
    {
      key: "valorAnterior",
      header: "Valor anterior",
      render: (row) => (
        <span title={row.valorAnterior ?? ""}>{truncateText(row.valorAnterior)}</span>
      ),
    },
    {
      key: "valorNuevo",
      header: "Valor nuevo",
      render: (row) => (
        <span title={row.valorNuevo ?? ""}>{truncateText(row.valorNuevo)}</span>
      ),
    },
    {
      key: "usuarioAccion",
      header: "Usuario",
      render: (row) => row.usuarioAccion,
    },
    {
      key: "observacion",
      header: "Observacion",
      render: (row) => (
        <span title={row.observacion ?? ""}>{truncateText(row.observacion)}</span>
      ),
    },
  ], []);

  return (
    <section style={styles.page}>
      <div style={styles.heroCard}>
        <div>
          <h1 style={styles.heroTitle}>Monitor de modificaciones</h1>
          <p style={styles.heroText}>
            Consulta la tabla <strong>AuditoriaCambios</strong> para revisar qué se modificó,
            quién lo hizo y cuándo ocurrió.
          </p>
        </div>
        <div style={styles.heroBadge}>Auditoria central</div>
      </div>

      <div style={styles.statsGrid}>
        <StatCard label="Registros" value={String(stats.total)} />
        <StatCard label="Inserciones" value={String(stats.inserts)} />
        <StatCard label="Actualizaciones" value={String(stats.updates)} />
        <StatCard label="Usuarios" value={String(stats.users)} />
      </div>

      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h2 style={styles.cardTitle}>Filtros</h2>
            <p style={styles.cardText}>Refina el monitoreo por módulo, entidad, usuario y fecha.</p>
          </div>
          <div style={styles.actionsRow}>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => {
                setFilters(initialFilters);
                void loadData(initialFilters);
              }}
            >
              Limpiar
            </button>
            <button
              type="button"
              style={styles.primaryButton}
              onClick={() => void loadData()}
            >
              Buscar
            </button>
          </div>
        </div>

        <div style={styles.filtersGrid}>
          <Field label="Modulo">
            <input
              value={filters.modulo}
              onChange={(event) => setFilters((prev) => ({ ...prev, modulo: event.target.value }))}
              style={styles.input}
            />
          </Field>
          <Field label="Entidad">
            <input
              value={filters.entidad}
              onChange={(event) => setFilters((prev) => ({ ...prev, entidad: event.target.value }))}
              style={styles.input}
            />
          </Field>
          <Field label="Id registro">
            <input
              value={filters.idRegistro}
              onChange={(event) => setFilters((prev) => ({ ...prev, idRegistro: event.target.value }))}
              style={styles.input}
            />
          </Field>
          <Field label="Usuario">
            <input
              value={filters.usuarioAccion}
              onChange={(event) => setFilters((prev) => ({ ...prev, usuarioAccion: event.target.value }))}
              style={styles.input}
            />
          </Field>
          <Field label="Fecha desde">
            <input
              type="date"
              value={filters.fechaDesde}
              onChange={(event) => setFilters((prev) => ({ ...prev, fechaDesde: event.target.value }))}
              style={styles.input}
            />
          </Field>
          <Field label="Fecha hasta">
            <input
              type="date"
              value={filters.fechaHasta}
              onChange={(event) => setFilters((prev) => ({ ...prev, fechaHasta: event.target.value }))}
              style={styles.input}
            />
          </Field>
          <Field label="Top">
            <input
              type="number"
              min="1"
              max="1000"
              value={filters.top}
              onChange={(event) => setFilters((prev) => ({ ...prev, top: event.target.value }))}
              style={styles.input}
            />
          </Field>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h2 style={styles.cardTitle}>Resultados</h2>
            <p style={styles.cardText}>Últimos cambios registrados en la auditoría.</p>
          </div>
          <span style={styles.counterPill}>{rows.length} filas</span>
        </div>

        {error ? <div style={styles.errorBanner}>{error}</div> : null}

        <DataGridBase
          columns={columns}
          rows={rows}
          loading={loading}
          loadingMessage="Cargando monitor de modificaciones..."
          emptyMessage="No hay cambios registrados para los filtros seleccionados."
          getRowKey={(row) => row.idAuditoria}
        />
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <article style={styles.statCard}>
      <span style={styles.statLabel}>{label}</span>
      <strong style={styles.statValue}>{value}</strong>
    </article>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  heroCard: {
    background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
    color: "#FFFFFF",
    borderRadius: 18,
    padding: 24,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  heroTitle: {
    margin: 0,
    fontSize: 30,
    fontWeight: 800,
  },
  heroText: {
    marginTop: 10,
    marginBottom: 0,
    color: "rgba(255,255,255,0.84)",
    fontSize: 14,
    maxWidth: 760,
    lineHeight: 1.6,
  },
  heroBadge: {
    borderRadius: 999,
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.18)",
    padding: "10px 14px",
    fontSize: 12,
    fontWeight: 700,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 14,
  },
  statCard: {
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: 16,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  statLabel: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700,
    textTransform: "uppercase",
  },
  statValue: {
    fontSize: 28,
    color: "#0F172A",
  },
  card: {
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: 18,
    padding: 20,
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 16,
  },
  cardTitle: {
    margin: 0,
    fontSize: 22,
    color: "#0F172A",
    fontWeight: 800,
  },
  cardText: {
    marginTop: 6,
    marginBottom: 0,
    color: "#64748B",
    fontSize: 13,
  },
  actionsRow: {
    display: "flex",
    gap: 10,
  },
  filtersGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: "#334155",
  },
  input: {
    width: "100%",
    minHeight: 42,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  },
  primaryButton: {
    border: "none",
    borderRadius: 10,
    background: "#2563EB",
    color: "#FFFFFF",
    fontWeight: 700,
    padding: "11px 16px",
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #CBD5E1",
    borderRadius: 10,
    background: "#FFFFFF",
    color: "#334155",
    fontWeight: 700,
    padding: "11px 16px",
    cursor: "pointer",
  },
  counterPill: {
    borderRadius: 999,
    background: "#EFF6FF",
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: 800,
    padding: "8px 12px",
  },
  errorBanner: {
    marginBottom: 12,
    borderRadius: 12,
    background: "#FEF2F2",
    color: "#B91C1C",
    border: "1px solid #FECACA",
    padding: "12px 14px",
    fontSize: 13,
    fontWeight: 700,
  },
  actionPill: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 72,
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 800,
  },
};
