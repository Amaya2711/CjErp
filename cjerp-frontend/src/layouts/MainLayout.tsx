import { NavLink, Outlet, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import { menuData } from "../app/menu/menuData";

export default function MainLayout() {
  const navigate = useNavigate();

  const nombre = localStorage.getItem("usuarioNombre") || "";
  const idUsuario = localStorage.getItem("idUsuario") || "";

  // 🔹 SIEMPRE EN MAYÚSCULA
  const usuarioMostrar = (idUsuario || nombre).toUpperCase();

  const cerrarSesion = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("usuarioNombre");
    localStorage.removeItem("idUsuario");
    navigate("/");
  };

  return (
    <div style={styles.wrapper}>
      {/* HEADER */}
      <header style={styles.header}>
        <div style={styles.leftArea}>
          <img src={logo} alt="CJ Telecom" style={styles.logoImage} />

          <div>
            <div style={styles.systemSubTitle}>
              Portal de Aplicaciones
            </div>
          </div>
        </div>

        <div style={styles.rightArea}>
          <div style={styles.userBox}>
            <div style={styles.userName}>
              Usuario: {usuarioMostrar}
            </div>
          </div>

          <button style={styles.logoutButton} onClick={cerrarSesion}>
            Cerrar sesión
          </button>
        </div>
      </header>

      {/* MENÚ SUPERIOR */}
      <nav style={styles.topMenu}>
        {menuData.map((menu) => {
          const firstPath = menu.children?.[0]?.path || "#";

          return (
            <NavLink
              key={menu.label}
              to={firstPath}
              style={({ isActive }) => ({
                ...styles.topMenuLink,
                ...(isActive ? styles.topMenuLinkActive : {}),
              })}
            >
              {menu.label}
            </NavLink>
          );
        })}
      </nav>

      {/* CONTENIDO */}
      <main style={styles.mainContent}>
        <Outlet />
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: "100vh",
    width: "100%",
    background: "#F4F6F8",
    display: "flex",
    flexDirection: "column",
  },

  header: {
    height: 78,
    width: "100%",
    background: "#17143A",
    borderBottom: "2px solid #6E4CCB",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 24px",
    boxSizing: "border-box",
  },

  leftArea: {
    display: "flex",
    alignItems: "center",
    gap: 16,
  },

  logoImage: {
    height: 46,
    width: "auto",
    objectFit: "contain",
  },

  systemSubTitle: {
    fontSize: 12,
    color: "#C7C9D9",
  },

  rightArea: {
    display: "flex",
    alignItems: "center",
    gap: 16,
  },

  userBox: {
    textAlign: "right",
  },

  userName: {
    fontSize: 14,
    fontWeight: 600,
    color: "#FFFFFF",
  },

  logoutButton: {
    border: "none",
    background: "#F5A623",
    color: "#17143A",
    padding: "10px 16px",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 700,
  },

  topMenu: {
    width: "100%",
    minHeight: 52,
    background: "#FFFFFF",
    borderBottom: "1px solid #E5E7EB",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 18px",
    boxSizing: "border-box",
    overflowX: "auto",
  },

  topMenuLink: {
    textDecoration: "none",
    color: "#17143A",
    fontSize: 13,
    fontWeight: 700,
    padding: "10px 14px",
    borderRadius: 8,
    whiteSpace: "nowrap",
    transition: "all 0.2s ease",
  },

  topMenuLinkActive: {
    background: "#6E4CCB",
    color: "#FFFFFF",
  },

  mainContent: {
    flex: 1,
    width: "100%",
    padding: 24,
    boxSizing: "border-box",
  },
};