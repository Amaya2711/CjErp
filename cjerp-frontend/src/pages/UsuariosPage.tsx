import MainLayout from "../layouts/MainLayout";

export default function UsuariosPage() {
  return (
    <MainLayout>
      <div style={styles.card}>
        <h1 style={styles.title}>Usuarios</h1>
        <p style={styles.text}>
          Aquí irá el mantenimiento de usuarios del ERP.
        </p>

        <div style={styles.box}>
          <p><strong>Próximo paso:</strong> listar usuarios desde el backend.</p>
        </div>
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
  box: {
    marginTop: 20,
    padding: 16,
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
  },
};