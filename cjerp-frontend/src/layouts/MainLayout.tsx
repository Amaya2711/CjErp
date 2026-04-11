import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import { clearAuthUser, getAuthUser } from "../utils/authStorage";
import {
  loadDashboardMenus,
  type DashboardGroup,
  type DashboardTile,
} from "../features/dashboard/services/dashboardMenuService";

function tileMatchesPath(tile: DashboardTile, pathname: string): boolean {
  if (pathname.startsWith(tile.path)) {
    return true;
  }

  return tile.children?.some((child) => tileMatchesPath(child, pathname)) ?? false;
}

function formatPathLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/Page$/i, "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function findTileLabelPath(
  tiles: DashboardTile[],
  pathname: string,
  ancestors: string[] = []
): string[] | null {
  for (const tile of tiles) {
    if (!tileMatchesPath(tile, pathname)) {
      continue;
    }

    const currentPath = [...ancestors, tile.label];
    const nestedPath = tile.children
      ? findTileLabelPath(tile.children, pathname, currentPath)
      : null;

    return nestedPath ?? currentPath;
  }

  return null;
}

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const authUser = getAuthUser();
  const [menuDashboard, setMenuDashboard] = useState<DashboardGroup[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const collapseDirection: "left" | "right" = "left";

  const usuarioMostrar = (authUser?.usuario || "").toUpperCase();
  const empleadoMostrar = (authUser?.nombre || "").toUpperCase();

  useEffect(() => {
    let activo = true;

    const cargarMenu = async () => {
      setMenuLoading(true);

      if (!authUser?.usuario) {
        if (activo) {
          setMenuDashboard([]);
          setMenuLoading(false);
        }
        return;
      }

      const grupos = await loadDashboardMenus(authUser.usuario);

      if (activo) {
        setMenuDashboard(grupos.filter((grupo) => grupo.tiles.length > 0));
        setMenuLoading(false);
      }
    };

    void cargarMenu();

    return () => {
      activo = false;
    };
  }, [authUser?.usuario]);

  useEffect(() => {
    if (menuDashboard.length === 0) {
      return;
    }

    const nextExpandedGroups: Record<string, boolean> = {};
    const nextExpandedNodes: Record<string, boolean> = {};

    const markActiveBranch = (tile: DashboardTile, key: string) => {
      if (tileMatchesPath(tile, location.pathname) && tile.children?.length) {
        nextExpandedNodes[key] = true;
      }

      tile.children?.forEach((child, index) => {
        markActiveBranch(child, `${key}-${index}`);
      });
    };

    menuDashboard.forEach((group, groupIndex) => {
      const groupKey = `group-${groupIndex}`;
      if (group.tiles.some((tile) => tileMatchesPath(tile, location.pathname))) {
        nextExpandedGroups[groupKey] = true;
      }

      group.tiles.forEach((tile, tileIndex) => {
        markActiveBranch(tile, `${groupKey}-${tileIndex}`);
      });
    });

    setExpandedGroups((prev) => ({ ...prev, ...nextExpandedGroups }));
    setExpandedNodes((prev) => ({ ...prev, ...nextExpandedNodes }));
  }, [menuDashboard, location.pathname]);

  const cerrarSesion = () => {
    clearAuthUser();
    navigate("/");
  };

  const irDashboard = () => {
    navigate("/dashboard");
  };

  const alternarMenu = () => {
    setIsSidebarCollapsed((prev) => !prev);
  };

  const getHeaderLabel = (): string => {
    if (location.pathname.startsWith("/dashboard")) {
      return "Portal de Aplicaciones";
    }

    for (const group of menuDashboard) {
      const labelPath = findTileLabelPath(group.tiles, location.pathname);
      if (labelPath) {
        return [group.titulo, ...labelPath].join(" / ");
      }
    }

    const segments = location.pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      return segments.map(formatPathLabel).join(" / ");
    }

    return "Portal de Aplicaciones";
  };

  const headerLabel = getHeaderLabel();

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupKey]: !(prev[groupKey] ?? false),
    }));
  };

  const toggleNode = (nodeKey: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeKey]: !(prev[nodeKey] ?? false),
    }));
  };

  const renderTileNode = (
    tile: DashboardTile,
    nodeKey: string,
    depth: number
  ) => {
    const hasChildren = (tile.children?.length ?? 0) > 0;
    const isActive = tileMatchesPath(tile, location.pathname);
    const isExpanded = expandedNodes[nodeKey] ?? isActive;

    return (
      <div key={nodeKey}>
        <div
          style={{
            ...styles.sideNodeRow,
            paddingLeft: 14 + depth * 14,
          }}
        >
          <NavLink
            to={tile.path}
            style={{
              ...styles.sideNodeLink,
              ...(isActive ? styles.sideNodeLinkActive : {}),
            }}
          >
            <span>{tile.label}</span>
          </NavLink>

          {hasChildren && (
            <button
              type="button"
              style={styles.sideExpandButton}
              onClick={() => toggleNode(nodeKey)}
              aria-label={isExpanded ? "Contraer submenu" : "Expandir submenu"}
            >
              {isExpanded ? "v" : ">"}
            </button>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div>
            {tile.children!.map((child, index) =>
              renderTileNode(child, `${nodeKey}-${index}`, depth + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.pageHeader}>
        <header style={styles.header}>
          <div style={styles.brandBox} onClick={irDashboard}>
            <img src={logo} alt="CJ Telecom" style={styles.logo} />
          </div>

          <div style={styles.headerPortalLabel}>{headerLabel}</div>
        </header>
      </div>

      <div style={styles.bodyContent}>
        <aside
          className="sidebar-scroll"
          style={{
            ...styles.sidebar,
            ...(isSidebarCollapsed
              ? collapseDirection === "left"
                ? styles.sidebarCollapsedLeft
                : styles.sidebarCollapsedRight
              : {}),
          }}
        >
          <div
            style={{
              ...styles.sidebarHeaderRow,
              ...(isSidebarCollapsed ? styles.sidebarHeaderRowCollapsed : {}),
            }}
          >
            {!isSidebarCollapsed && <span style={styles.sidebarHeaderTitle}>Menu</span>}
            <button
              type="button"
              style={styles.footerMenuButton}
              onClick={alternarMenu}
              aria-label={isSidebarCollapsed ? "Abrir menu lateral" : "Cerrar menu lateral"}
              title={isSidebarCollapsed ? "Abrir menu" : "Cerrar menu"}
            >
              <svg
                viewBox="0 0 24 24"
                style={styles.menuToggleIcon}
                aria-hidden="true"
                focusable="false"
              >
                {isSidebarCollapsed ? (
                  <path
                    d="M4 6h8v2H4V6zm0 5h8v2H4v-2zm0 5h8v2H4v-2zm9.5-5 4-4 1.4 1.4L16.3 11H21v2h-4.7l2.6 2.6L17.5 17l-4-4z"
                    fill="currentColor"
                  />
                ) : (
                  <path
                    d="M12 6h8v2h-8V6zm0 5h8v2h-8v-2zm0 5h8v2h-8v-2zm-1.5-5-4-4-1.4 1.4L7.7 11H3v2h4.7l-2.6 2.6L6.5 17l4-4z"
                    fill="currentColor"
                  />
                )}
              </svg>
            </button>
          </div>

          {!isSidebarCollapsed && (
            <div className="sidebar-scroll" style={styles.sidebarScrollArea}>
              {menuLoading ? (
                <div style={styles.sideEmpty}>Cargando menu...</div>
              ) : menuDashboard.length === 0 ? (
                <div style={styles.sideEmpty}>Usuario no tiene opciones de menu configurado</div>
              ) : (
                menuDashboard.map((grupo, groupIndex) => {
                  const groupKey = `group-${groupIndex}`;
                  const groupIsActive = grupo.tiles.some((tile) =>
                    tileMatchesPath(tile, location.pathname)
                  );
                  const groupIsExpanded = expandedGroups[groupKey] ?? groupIsActive;

                  return (
                    <section key={groupKey} style={styles.sideGroup}>
                      <div style={styles.sideGroupHeader}>
                        <button
                          type="button"
                          style={{
                            ...styles.sideGroupButton,
                            ...(groupIsActive ? styles.sideGroupButtonActive : {}),
                          }}
                          onClick={() => toggleGroup(groupKey)}
                        >
                          {grupo.titulo}
                        </button>
                        <button
                          type="button"
                          style={styles.sideExpandButton}
                          onClick={() => toggleGroup(groupKey)}
                          aria-label={groupIsExpanded ? "Contraer grupo" : "Expandir grupo"}
                        >
                          {groupIsExpanded ? "v" : ">"}
                        </button>
                      </div>

                      {groupIsExpanded && (
                        <div style={styles.sideGroupBody}>
                          {grupo.tiles.map((tile, tileIndex) =>
                            renderTileNode(tile, `${groupKey}-${tileIndex}`, 0)
                          )}
                        </div>
                      )}
                    </section>
                  );
                })
              )}
            </div>
          )}
        </aside>

        <main style={styles.main}>
          <Outlet />
        </main>
      </div>

      <footer style={styles.footer}>
        <div style={styles.footerContent}>
          <div style={styles.footerRightGroup}>
            <div style={styles.footerUserInfoBox}>
              <div style={styles.userLabel}>Usuario: {usuarioMostrar}</div>
              <div style={styles.employeeLabel}>
                Empleado: {empleadoMostrar || "NO DEFINIDO"}
              </div>
            </div>
            <button style={styles.footerLogoutButton} onClick={cerrarSesion}>
              Cerrar sesión
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: "100vh",
    height: "100vh",
    background: "#F3F5F9",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  pageHeader: {
    position: "sticky",
    top: 0,
    zIndex: 1100,
    boxShadow: "0 4px 14px rgba(23,20,58,0.08)",
  },
  header: {
    height: 56,
    background: "#17143A",
    color: "#FFFFFF",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 14px",
    boxSizing: "border-box",
    borderBottom: "3px solid #6E4CCB",
  },
  brandBox: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
  },
  logo: {
    height: 38,
    width: "auto",
    objectFit: "contain",
    display: "block",
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: 800,
    lineHeight: 1.1,
  },
  brandSubtitle: {
    fontSize: 12,
    fontWeight: 700,
    opacity: 0.95,
    marginTop: 0,
  },
  headerPortalLabel: {
    fontSize: 18,
    fontWeight: 800,
    textAlign: "right",
    color: "#FFFFFF",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 18,
  },
  userInfoBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 2,
  },
  userLabel: {
    fontSize: 14,
    fontWeight: 700,
  },
  employeeLabel: {
    fontSize: 12,
    fontWeight: 600,
    opacity: 0.9,
  },
  logoutButton: {
    border: "none",
    background: "#F5A623",
    color: "#17143A",
    padding: "12px 18px",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 14,
  },
  bodyContent: {
    display: "flex",
    alignItems: "stretch",
    flex: 1,
    minHeight: 0,
    position: "relative",
    overflow: "hidden",
  },
  sidebar: {
    width: 320,
    minWidth: 280,
    maxWidth: 360,
    background: "#FFFFFF",
    padding: "12px 10px 90px 10px",
    boxSizing: "border-box",
    height: "100%",
    overflow: "hidden",
    overscrollBehavior: "contain",
    transform: "translateX(0)",
    transition:
      "width 0.24s ease, min-width 0.24s ease, padding 0.24s ease, transform 0.24s ease, opacity 0.2s ease",
  },
  sidebarCollapsedLeft: {
    width: 44,
    minWidth: 44,
    maxWidth: 44,
    padding: "8px 6px",
    overflow: "hidden",
    transform: "translateX(0)",
    opacity: 1,
  },
  sidebarCollapsedRight: {
    width: 44,
    minWidth: 44,
    maxWidth: 44,
    padding: "8px 6px",
    overflow: "hidden",
    transform: "translateX(0)",
    opacity: 1,
  },
  sidebarHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
    background: "#FFFFFF",
    paddingBottom: 6,
  },
  sidebarHeaderRowCollapsed: {
    justifyContent: "center",
    marginBottom: 0,
  },
  sidebarHeaderTitle: {
    fontSize: 13,
    fontWeight: 800,
    color: "#374151",
  },
  sidebarScrollArea: {
    height: "calc(100% - 40px)",
    overflowY: "scroll",
    overflowX: "hidden",
    scrollbarWidth: "thin",
    scrollbarColor: "#9CA3AF #F3F4F6",
    scrollbarGutter: "stable",
    overscrollBehavior: "contain",
    paddingRight: 2,
  },
  sideGroup: {
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    marginBottom: 8,
    background: "#FAFBFF",
  },
  sideGroupHeader: {
    display: "flex",
    alignItems: "center",
    padding: "8px 8px 8px 10px",
    gap: 8,
  },
  sideGroupButton: {
    flex: 1,
    border: "none",
    background: "transparent",
    textAlign: "left",
    fontSize: 13,
    fontWeight: 800,
    color: "#1F2937",
    cursor: "pointer",
    padding: "4px 0",
  },
  sideGroupButtonActive: {
    color: "#4C1D95",
  },
  sideGroupBody: {
    borderTop: "1px solid #E5E7EB",
    padding: "6px 6px 8px 6px",
  },
  sideNodeRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    paddingRight: 4,
    marginBottom: 2,
  },
  sideNodeLink: {
    flex: 1,
    textDecoration: "none",
    color: "#374151",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 8,
    padding: "7px 8px",
    lineHeight: 1.2,
  },
  sideNodeLinkActive: {
    background: "#E0E7FF",
    color: "#1E3A8A",
  },
  sideExpandButton: {
    border: "none",
    background: "transparent",
    color: "#6B7280",
    fontWeight: 800,
    fontSize: 12,
    cursor: "pointer",
    width: 22,
    height: 22,
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  sideEmpty: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: 600,
    padding: "10px 8px",
  },
  main: {
    flex: 1,
    height: "100%",
    padding: 12,
    paddingBottom: 82,
    boxSizing: "border-box",
    overflow: "auto",
    overscrollBehavior: "contain",
  },
  footer: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 44,
    background: "#17143A",
    borderTop: "2px solid #6E4CCB",
    color: "#E5E7EB",
    zIndex: 1200,
    display: "flex",
    alignItems: "center",
  },
  footerContent: {
    width: "100%",
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    padding: "10px 24px",
    fontSize: 12,
    fontWeight: 600,
    boxSizing: "border-box",
    gap: 12,
    flexWrap: "wrap",
  },
  footerRightGroup: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginLeft: "auto",
  },
  footerUserInfoBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 2,
  },
  footerLogoutButton: {
    border: "none",
    background: "#F5A623",
    color: "#17143A",
    padding: "6px 10px",
    borderRadius: 7,
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 11,
  },
  footerMenuButton: {
    border: "none",
    background: "#F5A623",
    color: "#17143A",
    width: 28,
    height: 28,
    padding: 0,
    borderRadius: 7,
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 11,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  menuToggleIcon: {
    width: 14,
    height: 14,
    display: "block",
  },
};