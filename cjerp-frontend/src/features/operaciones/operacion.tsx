import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { MapPinned } from "lucide-react";

export default function OperacionPage() {
  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div>
          <div style={styles.kicker}>Operaciones</div>
          <h1 style={styles.title}>Operacion</h1>
          <p style={styles.subtitle}>
            Accede a los flujos operativos disponibles, incluido el seguimiento georreferenciado de empleados.
          </p>
        </div>
      </div>

      <div style={styles.grid}>
        <Link to="/operaciones/operacion/seguimientoempleado" style={styles.card}>
          <div style={styles.cardIcon}>
            <MapPinned size={22} />
          </div>
          <div style={styles.cardTitle}>Seguimiento empleado</div>
          <div style={styles.cardText}>
            Consulta el recorrido de un empleado en Google Maps usando su Id y la fecha de asistencia.
          </div>
        </Link>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    padding: 24,
  },
  hero: {
    marginBottom: 20,
  },
  kicker: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    background: "#e0f2fe",
    color: "#0369a1",
    fontSize: 12,
    fontWeight: 800,
    marginBottom: 10,
  },
  title: {
    margin: 0,
    fontSize: 30,
    fontWeight: 800,
    color: "#0f172a",
  },
  subtitle: {
    margin: "10px 0 0",
    maxWidth: 720,
    color: "#475569",
    lineHeight: 1.6,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 320px))",
    gap: 16,
  },
  card: {
    display: "grid",
    gap: 12,
    padding: 18,
    borderRadius: 18,
    border: "1px solid #e2e8f0",
    background: "#ffffff",
    textDecoration: "none",
    boxShadow: "0 12px 24px rgba(15, 23, 42, 0.06)",
    color: "inherit",
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    background: "#dbeafe",
    color: "#1d4ed8",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: "#0f172a",
  },
  cardText: {
    color: "#475569",
    lineHeight: 1.6,
    fontSize: 14,
  },
};
