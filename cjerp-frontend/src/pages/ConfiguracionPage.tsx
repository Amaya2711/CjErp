import MainLayout from "../layouts/MainLayout";

export default function ConfiguracionPage() {
  return (
    <MainLayout>
      <div style={styles.card}>
        <h1 style={styles.title}>Configuración</h1>
        <p style={styles.text}>
          Aquí irán parámetros generales, roles, permisos y opciones del sistema.
        </p>
      </div>
    </MainLayout>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "#fff",
    borderRadius: 12,
    padding: 24,
    boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
  },
  title: {
    marginTop: 0,
    marginBottom: 12,
  },
  text: {
    color: "#4b5563",
  },
};