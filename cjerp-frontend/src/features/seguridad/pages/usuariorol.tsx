import { useMemo, useState } from "react";
import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import { menuService, type UsuarioPerfilRolDto } from "../services/menuService";
import { usuariosService, type UsuarioDto } from "../services/usuariosService";

export default function UsuarioRolPage() {
  const [usuarios, setUsuarios] = useState<UsuarioDto[]>([]);
  const [usuario, setUsuario] = useState("");
  const [relaciones, setRelaciones] = useState<UsuarioPerfilRolDto[]>([]);
  const [cargandoUsuarios, setCargandoUsuarios] = useState(false);
  const [cargandoRelaciones, setCargandoRelaciones] = useState(false);
  const [error, setError] = useState("");

  const usuariosFiltrados = useMemo(() => {
    const filtro = usuario.trim().toLowerCase();
    if (!filtro) return usuarios;
    return usuarios.filter((item) =>
      `${item.idUsuario} ${item.nombreEmpleado}`.toLowerCase().includes(filtro)
    );
  }, [usuario, usuarios]);

  const cargarUsuarios = async () => {
    setCargandoUsuarios(true);
    setError("");
    try {
      setUsuarios(await usuariosService.listarUsuarios());
    } catch {
      setError("No se pudieron cargar los usuarios.");
    } finally {
      setCargandoUsuarios(false);
    }
  };

  const consultar = async (idUsuario: string) => {
    const valor = idUsuario.trim();
    setUsuario(valor);
    setRelaciones([]);
    if (!valor) return;

    setCargandoRelaciones(true);
    setError("");
    try {
      setRelaciones(await menuService.obtenerPerfilRolPorUsuario(valor));
    } catch {
      setError("No se pudo consultar el perfil y rol del usuario.");
    } finally {
      setCargandoRelaciones(false);
    }
  };

  return (
    <AppPage title="Usuario y rol">
      <div style={{ display: "grid", gap: 16 }}>
        <AppCard>
          <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
            <label style={{ display: "grid", gap: 6, flex: "1 1 360px", color: "#172554", fontWeight: 700 }}>
              Usuario
              <input
                list="usuarios-rol-list"
                value={usuario}
                onChange={(event) => setUsuario(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void consultar(usuario);
                }}
                placeholder="Buscar por usuario o empleado"
                style={inputStyle}
              />
              <datalist id="usuarios-rol-list">
                {usuariosFiltrados.map((item) => (
                  <option key={item.idUsuario} value={item.idUsuario}>
                    {item.nombreEmpleado}
                  </option>
                ))}
              </datalist>
            </label>
            <button type="button" onClick={() => void cargarUsuarios()} style={secondaryButtonStyle}>
              {cargandoUsuarios ? "Cargando..." : "Cargar usuarios"}
            </button>
            <button type="button" onClick={() => void consultar(usuario)} style={primaryButtonStyle}>
              Consultar
            </button>
          </div>
          {error ? <p style={{ color: "#B91C1C", fontWeight: 700 }}>{error}</p> : null}
        </AppCard>

        <AppCard>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0, color: "#172554" }}>Perfil asignado</h2>
              <p style={{ color: "#64748B", margin: "6px 0 0" }}>
                {usuario ? `Relaciones activas de ${usuario}` : "Seleccione un usuario para consultar sus relaciones."}
              </p>
            </div>
            <strong style={{ color: "#2563EB" }}>{relaciones.length} relación(es)</strong>
          </div>
          <div style={{ overflowX: "auto", marginTop: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
              <thead>
                <tr style={{ background: "#EFF6FF", color: "#172554" }}>
                  <th style={cellStyle}>Usuario</th>
                  <th style={cellStyle}>Perfil</th>
                  <th style={cellStyle}>Rol</th>
                </tr>
              </thead>
              <tbody>
                {relaciones.map((item) => (
                  <tr key={`${item.idPerfil}-${item.idRol}`}>
                    <td style={cellStyle}>{item.idUsuario}</td>
                    <td style={cellStyle}>{item.nombrePerfil}</td>
                    <td style={cellStyle}>{item.nombreRol}</td>
                  </tr>
                ))}
                {!cargandoRelaciones && relaciones.length === 0 ? (
                  <tr><td colSpan={3} style={{ ...cellStyle, color: "#64748B" }}>No hay relaciones activas para mostrar.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {cargandoRelaciones ? <p style={{ color: "#2563EB" }}>Consultando relaciones...</p> : null}
        </AppCard>
      </div>
    </AppPage>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid #CBD5E1",
  borderRadius: 10,
  padding: "10px 12px",
  color: "#0F172A",
  background: "#FFFFFF",
};

const primaryButtonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 10,
  padding: "11px 16px",
  background: "#2563EB",
  color: "#FFFFFF",
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  background: "#FFFFFF",
  color: "#1D4ED8",
  border: "1px solid #93C5FD",
};

const cellStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 10px",
  borderBottom: "1px solid #E2E8F0",
};
