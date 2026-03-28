import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../services/authService";

export default function LoginPage() {
  const navigate = useNavigate();

  const [idUsuario, setIdUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [mensaje, setMensaje] = useState("");

  const handleSubmit = async (e: any) => {
    e.preventDefault();

    try {
      const result = await login({
        idUsuario,
        clave,
      });

      const token = result.data.token;

      localStorage.setItem("token", token);

      navigate("/dashboard");
    } catch (error: any) {
      setMensaje("Error en login");
    }
  };

  return (
    <div style={{ padding: 40 }}>
      <h2>Login ERP</h2>

      <form onSubmit={handleSubmit}>
        <input
          placeholder="Usuario"
          value={idUsuario}
          onChange={(e) => setIdUsuario(e.target.value)}
        />

        <br /><br />

        <input
          type="password"
          placeholder="Clave"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
        />

        <br /><br />

        <button type="submit">Ingresar</button>
      </form>

      <p>{mensaje}</p>
    </div>
  );
}