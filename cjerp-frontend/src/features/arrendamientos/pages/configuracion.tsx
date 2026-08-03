import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppSectionHeader from "../../../components/base/AppSectionHeader";

export default function ArrendamientosConfiguracionPage() {
  return (
    <AppPage title="Arrendamientos / Configuracion">
      <AppCard>
        <AppSectionHeader
          title="Configuracion"
          description="Parametros funcionales, estados criticos y reglas del modulo."
        />
        <p style={styles.text}>
          Esta pagina queda lista para concentrar parametros de negocio y opciones transversales.
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
