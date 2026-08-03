import { Link } from "react-router-dom";
import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppSectionHeader from "../../../components/base/AppSectionHeader";

const pages = [
  { label: "Arrendadores", path: "/arrendamientos/arrendadores", note: "Maestra de propietarios y arrendadores." },
  { label: "Inquilinos", path: "/arrendamientos/inquilinos", note: "Maestra de arrendatarios y clientes del contrato." },
  { label: "Inmuebles", path: "/arrendamientos/inmuebles", note: "Edificios, locales y activos inmobiliarios." },
  { label: "Unidades", path: "/arrendamientos/unidades", note: "Pisos, locales y areas asociadas." },
  { label: "Tipos de cambio", path: "/arrendamientos/tipos-cambio", note: "Tipo de cambio diario del modulo." },
];

export default function ArrendamientosMaestrosPage() {
  return (
    <AppPage title="Arrendamientos / Maestros">
      <AppCard style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <AppSectionHeader
          title="Maestros del modulo"
          description="Entrada unica para las entidades base del modulo de arrendamientos."
        />
        <div style={styles.grid}>
          {pages.map((page) => (
            <Link key={page.path} to={page.path} style={styles.linkCard}>
              <strong style={styles.linkTitle}>{page.label}</strong>
              <span style={styles.linkText}>{page.note}</span>
            </Link>
          ))}
        </div>
      </AppCard>
    </AppPage>
  );
}

const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },
  linkCard: {
    borderRadius: 16,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    padding: 16,
    textDecoration: "none",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    color: "#0F172A",
  },
  linkTitle: {
    fontSize: 15,
  },
  linkText: {
    fontSize: 13,
    color: "#64748B",
    lineHeight: 1.5,
  },
};
