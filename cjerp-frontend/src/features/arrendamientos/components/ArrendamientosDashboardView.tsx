import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppSectionHeader from "../../../components/base/AppSectionHeader";
import type { ArrendamientosDashboard } from "../../../models/arrendamientos";

type Props = {
  dashboard: ArrendamientosDashboard;
  loading: boolean;
  onRefresh: () => void;
};

// ROLLBACK-MARKER: ARRRENDAMIENTOS FRONT DASHBOARD START
export default function ArrendamientosDashboardView({ dashboard, loading, onRefresh }: Props) {
  const tiles = [
    { label: "Arrendadores", value: dashboard.arrendadoresActivos },
    { label: "Inquilinos", value: dashboard.inquilinosActivos },
    { label: "Contratos", value: dashboard.contratosVigentes },
    { label: "Obligaciones", value: dashboard.obligacionesPendientes },
    { label: "Pendiente PEN", value: dashboard.totalPendientePEN },
    { label: "Pendiente USD", value: dashboard.totalPendienteUSD },
    { label: "Pagos mes PEN", value: dashboard.pagosMesPEN },
    { label: "Pagos mes USD", value: dashboard.pagosMesUSD },
  ];

  return (
    <AppPage
      title="Arrendamientos"
      actions={
        <button type="button" style={styles.button} onClick={onRefresh}>
          {loading ? "Actualizando..." : "Actualizar"}
        </button>
      }
    >
      <AppCard style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <AppSectionHeader
          title="Dashboard de arrendamientos"
          description="Vista ejecutiva del modulo, reutilizando el stack real del ERP y la tabla de auditoria ya existente."
        />

        <div style={styles.grid}>
          {tiles.map((tile) => (
            <div key={tile.label} style={styles.card}>
              <span style={styles.label}>{tile.label}</span>
              <strong style={styles.value}>
                {typeof tile.value === "number"
                  ? tile.value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : tile.value}
              </strong>
            </div>
          ))}
        </div>
      </AppCard>
    </AppPage>
  );
}
// ROLLBACK-MARKER: ARRRENDAMIENTOS FRONT DASHBOARD END

const styles: Record<string, React.CSSProperties> = {
  button: {
    border: "none",
    borderRadius: 10,
    background: "#3559E0",
    color: "#FFFFFF",
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 14,
  },
  card: {
    borderRadius: 16,
    border: "1px solid #E2E8F0",
    background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  label: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  value: {
    fontSize: 22,
    color: "#0F172A",
  },
};
