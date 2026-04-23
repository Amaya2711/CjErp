import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../services/authService";
import { saveAuthUser } from "../../../utils/authStorage";
import { getHttpErrorMessage } from "../../../utils/httpError";
import logoEmpresa from "../../../assets/logo.png";

export default function LoginPage() {
  const navigate = useNavigate();

  const [idUsuario, setIdUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensaje("");

    if (!idUsuario.trim()) {
      setMensaje("Ingrese el usuario.");
      return;
    }

    if (!clave.trim()) {
      setMensaje("Ingrese la clave.");
      return;
    }

    try {
      setCargando(true);

      const response = await login({
        idUsuario: idUsuario.trim(),
        clave: clave.trim(),
      });

      if (!response || !response.token) {
        setMensaje("No se pudo iniciar sesión.");
        return;
      }

      saveAuthUser({
        token: response.token,
        usuario: response.idUsuario ?? "",
        nombre: response.nombreEmpleado ?? "",
        correo: response.correo ?? "",
        codEmp: String(response.codEmp ?? ""),
        codVal: String(response.codVal ?? ""),
        cuadrilla: String(response.cuadrilla ?? ""),
      });

      navigate("/admin/dashboardPage", { replace: true });
    } catch (error: unknown) {
      console.error("Error al iniciar sesión:", error);
      setMensaje(getHttpErrorMessage(error, "No se pudo iniciar sesión."));
    } finally {
      setCargando(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.wrapper}>
        <div style={styles.dock}>
          <img
            src={logoEmpresa}
            alt="Logo CJ Telecom"
            style={styles.logo}
          />
        </div>

        <div style={styles.card}>
          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.group}>
              <label htmlFor="idUsuario" style={styles.label}>
                Usuario
              </label>
              <input
                id="idUsuario"
                type="text"
                value={idUsuario}
                onChange={(e) => setIdUsuario(e.target.value)}
                placeholder="Ingrese su usuario"
                autoComplete="username"
                style={styles.input}
              />
            </div>

            <div style={styles.group}>
              <label htmlFor="clave" style={styles.label}>
                Clave
              </label>
              <input
                id="clave"
                type="password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                placeholder="Ingrese su clave"
                autoComplete="current-password"
                style={styles.input}
              />
            </div>

            {mensaje ? <div style={styles.error}>{mensaje}</div> : null}

            <button type="submit" disabled={cargando} style={styles.button}>
              {cargando ? "Ingresando..." : "Ingresar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f8fafc",
    padding: 24,
  },
  wrapper: {
    width: "100%",
    maxWidth: 420,
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },
  dock: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderBottom: "none",
    borderRadius: "16px 16px 0 0",
    padding: "8px 28px 6px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
  },
  card: {
    width: "100%",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderTop: "none",
    borderRadius: "0 0 16px 16px",
    padding: "12px 28px 28px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
    boxSizing: "border-box",
  },
  logo: {
    width: 180,
    height: "auto",
    borderRadius: 10,
    objectFit: "cover",
    flexShrink: 0,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  group: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: 600,
    color: "#334155",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    outline: "none",
    fontSize: 14,
    boxSizing: "border-box",
  },
  button: {
    border: "none",
    background: "#f5a623",
    color: "#17143a",
    padding: "10px 18px",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 14,
  },
  error: {
    marginTop: 4,
    color: "#b91c1c",
    fontSize: 14,
  },
};
