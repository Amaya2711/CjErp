import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppSectionHeader from "../../../components/base/AppSectionHeader";

export default function ArrendamientosDocumentosPage() {
  return (
    <AppPage title="Arrendamientos / Documentos">
      <AppCard>
        <AppSectionHeader
          title="Documentos del modulo"
          description="Punto de entrada para contratos, vouchers, adendas y anexos almacenados en SharePoint."
        />
        <p style={styles.text}>
          Esta pagina queda preparada para enlazar el visor documental del modulo sin crear una
          segunda estrategia de administracion de archivos.
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
