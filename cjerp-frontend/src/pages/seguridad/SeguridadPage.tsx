import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadDashboardMenus, type DashboardTile } from "../../features/dashboard/services/dashboardMenuService";
import { getAuthUser } from "../../utils/authStorage";

type SecurityModule = {
  titulo: string;
  descripcion: string;
  ruta: string;
  color: string;
};

export default function SeguridadPage() {
  const navigate = useNavigate();
  const authUser = getAuthUser();

  const [menuLoading, setMenuLoading] = useState(true);
  const [securityTiles, setSecurityTiles] = useState<DashboardTile[]>([]);

  useEffect(() => {
    let activo = true;

    const cargarMenuSeguridad = async () => {
      setMenuLoading(true);

      if (!authUser?.usuario) {
        if (activo) {
          setSecurityTiles([]);
          setMenuLoading(false);
        }
        return;
      }

      const grupos = await loadDashboardMenus(authUser.usuario);
      const seguridad = grupos.find(
        (grupo) => grupo.titulo.trim().toLowerCase() === "seguridad"
      );

      if (activo) {
        setSecurityTiles(seguridad?.tiles ?? []);
        setMenuLoading(false);
      }
    };

    void cargarMenuSeguridad();

    return () => {
      activo = false;
    };
  }, [authUser?.usuario]);

  const moduleConfigByPath: Record<string, { descripcion: string; color: string }> = {
    "/seguridad/usuarios": {
      descripcion: "Administración de usuarios del sistema.",
      color: "#6E4CCB",
    },
    "/seguridad/usuario-perfil": {
      descripcion: "Asignación de perfiles por usuario.",
      color: "#8B5CF6",
    },
    "/seguridad/perfiles": {
      descripcion: "Definición de perfiles funcionales por área.",
      color: "#3FA9F5",
    },
    "/seguridad/roles": {
      descripcion: "Gestión de roles y niveles de acceso.",
      color: "#F5A623",
    },
    "/seguridad/menu": {
      descripcion: "Configuración del árbol de menú del ERP.",
      color: "#10B981",
    },
    "/seguridad/permisos": {
      descripcion: "Asignación de accesos por perfil, rol y usuario.",
      color: "#EF4444",
    },
  };

  const modulos: SecurityModule[] = useMemo(
    () =>
      securityTiles.map((tile) => {
        const config = moduleConfigByPath[tile.path] || {
          descripcion: `Gestión de ${tile.label.toLowerCase()} del módulo de seguridad.`,
          color: "#64748B",
        };

        return {
          titulo: tile.label,
          descripcion: config.descripcion,
          ruta: tile.path,
          color: config.color,
        };
      }),
    [securityTiles]
  );

  const moduloPermisos = modulos.find((modulo) => modulo.ruta === "/seguridad/permisos");

  const indicadores = [
    { label: "Usuarios activos", value: "125" },
    { label: "Perfiles", value: "6" },
    { label: "Roles", value: "4" },
    { label: "Opciones de menú", value: "24" },
  ];

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Gestión de Seguridad</h1>
          <p style={styles.subtitle}>
            Administración centralizada de usuarios, perfiles, roles, menús y permisos del ERP.
          </p>
        </div>

        <div style={styles.headerActions}>
          {moduloPermisos ? (
            <button
              style={styles.primaryButton}
              onClick={() => navigate(moduloPermisos.ruta)}
            >
              Configurar permisos
            </button>
          ) : null}
        </div>
      </div>

      <div style={styles.metricsGrid}>
        {indicadores.map((item) => (
          <div key={item.label} style={styles.metricCard}>
            <div style={styles.metricValue}>{item.value}</div>
            <div style={styles.metricLabel}>{item.label}</div>
          </div>
        ))}
      </div>

      <div style={styles.contentGrid}>
        <div style={styles.mainPanel}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Módulos de seguridad</h2>
            <p style={styles.sectionText}>
              Selecciona el componente que deseas administrar.
            </p>
          </div>

          {menuLoading ? (
            <div style={styles.sideItem}>Cargando módulos de seguridad...</div>
          ) : modulos.length === 0 ? (
            <div style={styles.sideItem}>No tiene módulos de seguridad asignados.</div>
          ) : (
            <div style={styles.modulesGrid}>
              {modulos.map((modulo) => (
                <button
                  key={modulo.titulo}
                  style={{
                    ...styles.moduleCard,
                    borderTop: `5px solid ${modulo.color}`,
                  }}
                  onClick={() => navigate(modulo.ruta)}
                >
                  <div style={styles.moduleTitle}>{modulo.titulo}</div>
                  <div style={styles.moduleDescription}>{modulo.descripcion}</div>
                  <div style={styles.moduleLink}>Abrir módulo</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={styles.sidePanel}>
          <div style={styles.sideCard}>
            <h3 style={styles.sideTitle}>Resumen funcional</h3>
            <div style={styles.sideList}>
              <div style={styles.sideItem}>Usuarios asignados a perfiles</div>
              <div style={styles.sideItem}>Perfiles relacionados a roles</div>
              <div style={styles.sideItem}>Permisos por acción</div>
              <div style={styles.sideItem}>Excepciones por usuario</div>
              <div style={styles.sideItem}>Menú jerárquico hasta 3 niveles</div>
            </div>
          </div>

          <div style={styles.sideCard}>
            <h3 style={styles.sideTitle}>Accesos rápidos</h3>
            <div style={styles.quickActions}>
              {menuLoading ? (
                <div style={styles.sideItem}>Cargando accesos...</div>
              ) : modulos.length === 0 ? (
                <div style={styles.sideItem}>Sin accesos rápidos disponibles.</div>
              ) : (
                modulos.slice(0, 4).map((modulo) => (
                  <button
                    key={modulo.ruta}
                    style={styles.secondaryButton}
                    onClick={() => navigate(modulo.ruta)}
                  >
                    Ir a {modulo.titulo}
                  </button>
                ))
              )}
            </div>
          </div>

          <div style={styles.sideCard}>
            <h3 style={styles.sideTitle}>Auditoría</h3>
            <p style={styles.auditText}>
              Aquí luego podrás mostrar cambios recientes en perfiles, roles,
              accesos especiales y modificaciones del menú.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },

  header: {
    background: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 8px 24px rgba(23,20,58,0.08)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },

  title: {
    margin: 0,
    fontSize: 30,
    color: "#17143A",
    fontWeight: 700,
  },

  subtitle: {
    marginTop: 8,
    marginBottom: 0,
    color: "#6B7280",
    fontSize: 14,
  },

  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },

  primaryButton: {
    border: "none",
    background: "#6E4CCB",
    color: "#FFFFFF",
    padding: "12px 18px",
    borderRadius: 10,
    fontWeight: 700,
    cursor: "pointer",
  },

  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 16,
  },

  metricCard: {
    background: "#FFFFFF",
    borderRadius: 14,
    padding: 20,
    boxShadow: "0 6px 18px rgba(23,20,58,0.06)",
    borderLeft: "5px solid #6E4CCB",
  },

  metricValue: {
    fontSize: 28,
    fontWeight: 700,
    color: "#17143A",
  },

  metricLabel: {
    marginTop: 6,
    fontSize: 13,
    color: "#6B7280",
  },

  contentGrid: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr",
    gap: 20,
  },

  mainPanel: {
    background: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 8px 24px rgba(23,20,58,0.08)",
  },

  sectionHeader: {
    marginBottom: 20,
  },

  sectionTitle: {
    margin: 0,
    fontSize: 22,
    color: "#17143A",
  },

  sectionText: {
    marginTop: 8,
    color: "#6B7280",
    fontSize: 14,
  },

  modulesGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 18,
  },

  moduleCard: {
    border: "none",
    background: "#F9FAFB",
    borderRadius: 14,
    padding: 20,
    textAlign: "left",
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(23,20,58,0.05)",
  },

  moduleTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#17143A",
    marginBottom: 10,
  },

  moduleDescription: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 1.5,
    minHeight: 44,
  },

  moduleLink: {
    marginTop: 16,
    fontSize: 13,
    fontWeight: 700,
    color: "#17143A",
  },

  sidePanel: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },

  sideCard: {
    background: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 8px 24px rgba(23,20,58,0.08)",
  },

  sideTitle: {
    margin: 0,
    marginBottom: 14,
    fontSize: 18,
    color: "#17143A",
  },

  sideList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  sideItem: {
    padding: "10px 12px",
    background: "#F9FAFB",
    borderRadius: 10,
    color: "#374151",
    fontSize: 13,
  },

  quickActions: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  secondaryButton: {
    border: "1px solid #D1D5DB",
    background: "#FFFFFF",
    color: "#17143A",
    padding: "10px 14px",
    borderRadius: 10,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
  },

  auditText: {
    margin: 0,
    color: "#6B7280",
    lineHeight: 1.6,
    fontSize: 13,
  },
};