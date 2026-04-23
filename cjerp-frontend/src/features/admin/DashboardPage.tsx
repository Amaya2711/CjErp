import { useEffect, useMemo, useState } from "react";
import { menuService } from "../seguridad/services/menuService";
import type { MenuDto } from "../../models/seguridad/menu.types";
import { getAuthUser } from "../../utils/authStorage";
//import { getAuthUser } from "src/utils/authStorage";
type QuickLink = {
  id: number;
  titulo: string;
  descripcion: string;
};
type AvisoItem = {
  id: number;
  titulo: string;
  detalle: string;
  tipo: "info" | "warning" | "success";
};


// ...existing code...

// ...existing code...

// Extiende MenuDto para permitir el campo 'acceso' opcional
type MenuAccesoDto = MenuDto & { acceso?: boolean | number };

// ...existing code...

function getSaludo() {
  const hour = new Date().getHours();

  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function getInitials(text: string) {
  if (!text?.trim()) return "US";

  const parts = text.trim().split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}


export default function DashboardPage() {
  const authUser = getAuthUser();
  // const [fechaHora, setFechaHora] = useState(formatFechaHora(new Date()));
  const [accesosDirectos, setAccesosDirectos] = useState<MenuAccesoDto[]>([]);

  // useEffect(() => {
  //   const timer = setInterval(() => {
  //     setFechaHora(formatFechaHora(new Date()));
  //   }, 60000);
  //
  //   return () => clearInterval(timer);
  // }, []);

  useEffect(() => {
    async function cargarAccesos() {
      try {
        const usuario = getAuthUser();
        if (!usuario?.usuario) return;
        const menuRaw = await menuService.obtenerMenuDinamicoPorUsuario(usuario.usuario);
        // console.log("menuRaw", menuRaw);
        // Normaliza el campo 'Acceso' a 'acceso' para el frontend
        const menu: MenuAccesoDto[] = (menuRaw as any[]).map(item => {
          // Tomar el valor de Acceso del backend, si no existe, es 0
          let raw = typeof item.Acceso !== "undefined" ? item.Acceso : (typeof item.acceso !== "undefined" ? item.acceso : 0);
          // console.log(`Menu[${item.idMenu}]: nombreMenu=${item.nombreMenu}, acceso(raw)=${raw}`);
          let accesoNum = 0;
          if (typeof raw === "boolean") {
            accesoNum = raw ? 1 : 0;
          } else if (typeof raw === "string") {
            accesoNum = raw === "1" || raw.toLowerCase() === "true" ? 1 : 0;
          } else if (typeof raw === "number") {
            accesoNum = raw === 1 ? 1 : 0;
          } else {
            accesoNum = 0;
          }
          return {
            ...item,
            acceso: accesoNum
          };
        });
        // console.log("menu normalizado", menu);
        setAccesosDirectos(
          menu.filter(m =>
            m.acceso === 1 &&
            m.nivelMenu > 0 &&
            typeof m.ruta === "string" &&
            m.ruta.trim() !== ""
          )
        );
      } catch (e) {
        // console.error("Error al cargar accesos :", e);
        setAccesosDirectos([]);
      }
    }
    cargarAccesos();
  }, []);

  const usuario = useMemo(() => {
    const nombreEmpleado =
      authUser?.nombreEmpleado ||
      authUser?.nombre ||
      authUser?.empleado ||
      "Usuario del sistema";

    const usuarioLogin =
      authUser?.usuario ||
      authUser?.userName ||
      authUser?.username ||
      "SIN_USUARIO";

    const correo =
      authUser?.correo ||
      authUser?.email ||
      "No disponible";

    const codEmp =
      authUser?.codEmp ||
      authUser?.idEmpleado ||
      "No disponible";

    return {
      nombreEmpleado,
      usuarioLogin: String(usuarioLogin).toUpperCase(),
      correo,
      codEmp,
    };
  }, [authUser]);

  const avisos: AvisoItem[] = [
    {
      id: 1,
      titulo: "Comunicados",
      detalle:
        "Utiliza el menú lateral para acceder únicamente a los módulos habilitados según tu perfil.",
      tipo: "info",
    },
    {
      id: 2,
      titulo: "Encuestas",
      detalle:
        "Si no visualizas una opción necesaria para tu trabajo, solicita la autorización al administrador del sistema.",
      tipo: "warning",
    },
    {
      id: 3,
      titulo: "Estado del sistema",
      detalle:
        "La plataforma se encuentra operativa y disponible para navegación general.",
      tipo: "success",
    },
  ];

  const quickLinks: QuickLink[] = [
    {
      id: 2,
      titulo: "Mesa de ayuda",
      descripcion: "Reporta incidencias funcionales o técnicas.",
    },
    {
      id: 4,
      titulo: "Cambio de contraseña",
      descripcion: "Gestiona tus credenciales de acceso.",
    },
  ];



  return (
    <div style={styles.page}>
      <div style={styles.heroCard}>
        <div style={styles.heroLeft}>
          <div style={styles.avatarCircle}>
            {getInitials(usuario.nombreEmpleado)}
          </div>
          <div>
            <div style={styles.heroTitle}>
              {getSaludo()}, {usuario.usuarioLogin}
            </div>
            <div style={styles.heroSubtitle}>
              Bienvenido al portal corporativo de CJ.
            </div>
            {/* <div style={styles.heroDate}>{fechaHora}</div> */}
          </div>
        </div>
        <div style={styles.heroBadge}>
          <div style={styles.heroBadgeLabel}>Ambiente</div>
          <div style={styles.heroBadgeValue}>Desarrollo</div>
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "2fr 1fr",
        gap: 20,
        alignItems: "start"
      }}>
        {/* Columna izquierda: Accesos directos y Ayuda y orientación */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Accesos directos */}
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>Accesos directos</h2>
              <span style={styles.cardTag}>Frecuentes</span>
            </div>
            <div style={{ color: '#64748B', padding: 12 }}>
              {/* Accesos directos dinámicos agrupados por idMenuPadre */}
              {accesosDirectos.length === 0 ? (
                <em>No hay accesos directos configurados.</em>
              ) : (
                Object.entries(
                  accesosDirectos.reduce((acc, item) => {
                    const key = item.idMenuPadre ?? 'sinPadre';
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(item);
                    return acc;
                  }, {} as Record<string, MenuAccesoDto[]>)
                ).map(([idPadre, items]) => (
                  <div key={idPadre} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                    {items.map((item) => (
                      <button
                        key={item.idMenu}
                        style={styles.quickButton}
                        onClick={() => window.location.href = item.ruta || (item as any).RutaNivel3}
                      >
                        {item.nombreMenu}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
          {/* Ayuda y orientación debajo */}
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>Ayuda y orientación</h2>
              <span style={styles.cardTag}>Soporte</span>
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              {quickLinks.map((item) => (
                <div key={item.id} style={{ ...styles.noticeItem, minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
                    <div style={styles.noticeTitle}>{item.titulo}</div>
                    <div style={styles.noticeText}>{item.descripcion}</div>
                    <button type="button" style={styles.quickButton}>
                      Ver opción
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Avisos generales: columna central */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h2 style={styles.cardTitle}>Avisos generales</h2>
            <span style={styles.cardTag}>Institucional</span>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12
          }}>
            {avisos.map((aviso) => (
              <div
                key={aviso.id}
                style={{
                  ...styles.noticeItem,
                  borderLeft:
                    aviso.tipo === "info"
                      ? "4px solid #3B82F6"
                      : aviso.tipo === "warning"
                      ? "4px solid #F59E0B"
                      : "4px solid #10B981",
                }}
              >
                <div style={styles.noticeTitle}>{aviso.titulo}</div>
                <div style={styles.noticeText}>{aviso.detalle}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Columna derecha vacía para mantener alineación si se desea */}
        <div></div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
    width: "100%",
  },

  heroCard: {
    background: "linear-gradient(135deg, #17143A 0%, #241B5E 100%)",
    borderRadius: 20,
    padding: 24,
    color: "#FFFFFF",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 20,
    flexWrap: "wrap",
    boxShadow: "0 10px 30px rgba(23,20,58,0.18)",
  },

  heroLeft: {
    display: "flex",
    alignItems: "center",
    gap: 18,
    flexWrap: "wrap",
  },

  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.14)",
    border: "1px solid rgba(255,255,255,0.20)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: 1,
  },

  heroTitle: {
    fontSize: 28,
    fontWeight: 800,
    marginBottom: 6,
  },

  heroSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.84)",
    lineHeight: 1.6,
    maxWidth: 760,
  },

  heroDate: {
    marginTop: 10,
    fontSize: 13,
    color: "rgba(255,255,255,0.72)",
  },

  heroBadge: {
    minWidth: 160,
    background: "rgba(255,255,255,0.10)",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 16,
    padding: "14px 18px",
  },

  heroBadgeLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "rgba(255,255,255,0.72)",
    marginBottom: 6,
  },

  heroBadgeValue: {
    fontSize: 22,
    fontWeight: 800,
  },

  gridTop: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 20,
  },

  card: {
    background: "#FFFFFF",
    borderRadius: 18,
    padding: 22,
    border: "1px solid #E5E7EB",
    boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
  },

  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 18,
    flexWrap: "wrap",
  },

  cardTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
    color: "#0F172A",
  },

  cardTag: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "#F3F4F6",
    fontSize: 12,
    fontWeight: 700,
    color: "#475569",
  },

  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },

  infoItem: {
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    borderRadius: 14,
    padding: 14,
  },

  infoLabel: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontWeight: 700,
  },

  infoValue: {
    fontSize: 15,
    color: "#0F172A",
    fontWeight: 700,
    lineHeight: 1.4,
  },

  statusList: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },

  statusRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 14,
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
  },

  statusDot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    marginTop: 5,
    flexShrink: 0,
  },

  statusTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#0F172A",
  },

  statusText: {
    marginTop: 4,
    fontSize: 13,
    color: "#64748B",
  },

  noticeList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  noticeItem: {
    background: "#F8FAFC",
    borderRadius: 14,
    padding: 16,
    border: "1px solid #E2E8F0",
  },

  noticeTitle: {
    fontSize: 15,
    fontWeight: 800,
    color: "#0F172A",
    marginBottom: 6,
  },

  noticeText: {
    fontSize: 13,
    color: "#64748B",
    lineHeight: 1.6,
  },

  simpleList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  simpleListItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 12,
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    color: "#334155",
    fontSize: 14,
    fontWeight: 600,
  },

  simpleBullet: {
    color: "#6E4CCB",
    fontSize: 18,
    lineHeight: 1,
  },

  quickGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },

  quickCard: {
    borderRadius: 16,
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
    padding: "8px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },

  quickCardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  quickTitle: {
    fontSize: 16,
    fontWeight: 800,
    color: "#0F172A",
    flex: 1,
  },

  quickText: {
    fontSize: 13,
    color: "#64748B",
    lineHeight: 1.6,
  },

  quickButton: {
    flexShrink: 0,
    minHeight: 32,
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#1E293B",
    fontWeight: 700,
    cursor: "pointer",
    padding: "0 12px",
    fontSize: 13,
  },
};