import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppSectionHeader from "../../../components/base/AppSectionHeader";

export default function ArrendamientosAuditoriaPage() {
  return (
    <AppPage title="Arrendamientos / Auditoria">
      <AppCard>
        <AppSectionHeader
          title="Auditoria del modulo"
          description="Esta vista se apoyara en la tabla de auditoria ya existente en el ERP."
        />
        <p style={styles.text}>
          No se crea una auditoria paralela; se reutiliza el registro historico comun del sistema.
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
