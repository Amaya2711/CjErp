import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppSectionHeader from "../../../components/base/AppSectionHeader";

export default function ArrendamientosReportesPage() {
  return (
    <AppPage title="Arrendamientos / Reportes">
      <AppCard>
        <AppSectionHeader
          title="Reportes iniciales"
          description="Salida base para Excel y PDF sin apartarse del patron actual del ERP."
        />
        <p style={styles.text}>
          Aqui se conectaran los reportes operativos y gerenciales del modulo de arrendamientos.
        </p>
      </AppCard>
    </AppPage>
  );
}

const styles: Record<string, React.CSSProperties> = {
  text: {
    margin: 0,
    fontSize: 14,
    color: "#475569",
    lineHeight: 1.6,
  },
};
