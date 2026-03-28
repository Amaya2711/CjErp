import { useEffect, useState } from "react";
import { getCurrentUser } from "../features/auth/services/authService";

export default function DashboardPage() {
  const [usuario, setUsuario] = useState<any>(null);
  const [mensaje, setMensaje] = useState("Cargando datos...");

  useEffect(() => {
    const load = async () => {
      try {
        const response = await getCurrentUser();
        setUsuario(response.data);
        setMensaje("");
      } catch {
        setMensaje("No se pudo obtener el usuario autenticado.");
      }
    };

    load();
  }, []);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.heading}>Panel principal</h1>

        {mensaje && <p style={styles.message}>{mensaje}</p>}

        {usuario && (
          <div style={styles.info}>
            <p><strong>Nombre:</strong> {usuario.nombreEmpleado}</p>
            <p><strong>Correo:</strong> {usuario.correo}</p>
            <p><strong>Usuario:</strong> {usuario.idUsuario}</p>
            <p><strong>CodEmp:</strong> {usuario.codEmp}</p>
            <p><strong>CodVal:</strong> {usuario.codVal}</p>
            <p><strong>Cuadrilla:</strong> {usuario.cuadrilla}</p>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: "100%",
  },
  card: {
    background: "#FFFFFF",
    borderRadius: 14,
    padding: 24,
    boxShadow: "0 6px 20px rgba(23, 20, 58, 0.08)",
    borderTop: "4px solid #6E4CCB",
  },
  heading: {
    marginTop: 0,
    marginBottom: 20,
    color: "#17143A",
  },
  message: {
    color: "#6B7280",
  },
  info: {
    lineHeight: 1.8,
    color: "#374151",
  },
};