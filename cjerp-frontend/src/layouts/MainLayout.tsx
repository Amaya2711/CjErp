import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import { PageTitleContext } from "../components/base/AppPage";
import { clearAuthUser, getAuthUser } from "../utils/authStorage";
import { logoutSession } from "../features/auth/services/logoutSession";
import {
  loadDashboardMenus,
  type DashboardGroup,
  type DashboardTile,
} from "../features/dashboard/services/dashboardMenuService";
import { getMenuAccentByName, getMenuIconComponent } from "../utils/menuIcons";

function tileMatchesPath(tile: DashboardTile, pathname: string): boolean {
  const tilePath = normalizeRoutePath(tile.path);

  if (!tilePath || tilePath === "#") {
    return false;
  }

  if (pathname === tilePath || pathname.startsWith(`${tilePath}/`)) {
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

function normalizeRoutePath(value: string): string {
  const path = value.trim();

  if (!path) {
    return "";
  }

  if (path === "#") {
    return path;
  }

  return path.startsWith("/") ? path : `/${path}`;
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
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  const logoutRef = useRef(false);
  const ingresosEgresosSidebarStateRef = useRef<{
    active: boolean;
    previousCollapsed: boolean;
  } | null>(null);
  const mapasiteSidebarStateRef = useRef<{
    active: boolean;
    previousCollapsed: boolean;
  } | null>(null);
  const dshPagosSidebarStateRef = useRef<{
    active: boolean;
    previousCollapsed: boolean;
  } | null>(null);
  const pagosV1SidebarStateRef = useRef<{
    active: boolean;
    previousCollapsed: boolean;
  } | null>(null);
  const conciliacionV1SidebarStateRef = useRef<{
    active: boolean;
    previousCollapsed: boolean;
  } | null>(null);

  const usuarioMostrar = (authUser?.usuario || "").toUpperCase();
  const empleadoMostrar = (authUser?.nombre || authUser?.nombreEmpleado || "").toUpperCase();
  const correoMostrar = (authUser?.correo || authUser?.email || "").toLowerCase();
  const codigoEmpleadoMostrar = (authUser?.codEmp || authUser?.idEmpleado || authUser?.empleado || "").toString();
  const codigoidperfil: number = Number(authUser?.idperfil ?? 0);
  const codigoidrol: number = Number(authUser?.idrol ?? 0);
  const isEmployeesPage =
    location.pathname.startsWith("/mantenimiento/empleados") ||
    location.pathname.startsWith("/mantenimiento/externo");
  const isMapaSitesPage = location.pathname.startsWith("/reportes/gerencial/mapasite");

  const iniciales = (empleadoMostrar || usuarioMostrar || "??")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("") || "??";

  const forceLogoutToLogin = () => {
    clearAuthUser();
    window.location.replace("/");
  };

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
        setMenuDashboard(grupos);
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

  useEffect(() => {
    const isIngresosEgresosPage =
      location.pathname.startsWith("/reportes/gerencial/ingresosegresos") ||
      location.pathname.startsWith("/reportes/gerencial/analisis") ||
      location.pathname.startsWith("/reportes/gerencial/analisisproyecto");

    if (isIngresosEgresosPage) {
      if (!ingresosEgresosSidebarStateRef.current?.active) {
        ingresosEgresosSidebarStateRef.current = {
          active: true,
          previousCollapsed: isSidebarCollapsed,
        };

        if (!isSidebarCollapsed) {
          setIsSidebarCollapsed(true);
        }
      }
      return;
    }

    const savedState = ingresosEgresosSidebarStateRef.current;
    if (savedState?.active) {
      ingresosEgresosSidebarStateRef.current = null;

      if (savedState.previousCollapsed !== isSidebarCollapsed) {
        setIsSidebarCollapsed(savedState.previousCollapsed);
      }
    }
  }, [isSidebarCollapsed, location.pathname]);

  useEffect(() => {
    const isDshPagosPage =
      location.pathname.startsWith("/arrendamientos/dshpagos") ||
      location.pathname.startsWith("/arrendamientos/pagosdsh");

    if (isDshPagosPage) {
      if (!dshPagosSidebarStateRef.current?.active) {
        dshPagosSidebarStateRef.current = {
          active: true,
          previousCollapsed: isSidebarCollapsed,
        };

        if (!isSidebarCollapsed) {
          setIsSidebarCollapsed(true);
        }
      }
      return;
    }

    const savedState = dshPagosSidebarStateRef.current;
    if (savedState?.active) {
      dshPagosSidebarStateRef.current = null;

      if (savedState.previousCollapsed !== isSidebarCollapsed) {
        setIsSidebarCollapsed(savedState.previousCollapsed);
      }
    }
  }, [isSidebarCollapsed, location.pathname]);

  useEffect(() => {
    const isMapaSitePage = location.pathname.startsWith("/reportes/gerencial/mapasite");

    if (isMapaSitePage) {
      if (!mapasiteSidebarStateRef.current?.active) {
        mapasiteSidebarStateRef.current = {
          active: true,
          previousCollapsed: isSidebarCollapsed,
        };

        if (!isSidebarCollapsed) {
          setIsSidebarCollapsed(true);
        }
      }
      return;
    }

    const savedState = mapasiteSidebarStateRef.current;
    if (savedState?.active) {
      mapasiteSidebarStateRef.current = null;

      if (savedState.previousCollapsed !== isSidebarCollapsed) {
        setIsSidebarCollapsed(savedState.previousCollapsed);
      }
    }
  }, [isSidebarCollapsed, location.pathname]);

  useEffect(() => {
    const isPagosV1Page =
      location.pathname.startsWith("/finanzas/tesoreria/pagos_v1") ||
      location.pathname.startsWith("/finanzas/tesoreria/pagos_dev");

    if (isPagosV1Page) {
      if (!pagosV1SidebarStateRef.current?.active) {
        pagosV1SidebarStateRef.current = {
          active: true,
          previousCollapsed: isSidebarCollapsed,
        };

        if (!isSidebarCollapsed) {
          setIsSidebarCollapsed(true);
        }
      }
      return;
    }

    const savedState = pagosV1SidebarStateRef.current;
    if (savedState?.active) {
      pagosV1SidebarStateRef.current = null;

      if (savedState.previousCollapsed !== isSidebarCollapsed) {
        setIsSidebarCollapsed(savedState.previousCollapsed);
      }
    }
  }, [isSidebarCollapsed, location.pathname]);

  useEffect(() => {
    const isConciliacionV1Page = location.pathname.startsWith("/finanzas/conciliacion_v1");

    if (isConciliacionV1Page) {
      if (!conciliacionV1SidebarStateRef.current?.active) {
        conciliacionV1SidebarStateRef.current = {
          active: true,
          previousCollapsed: isSidebarCollapsed,
        };

        if (!isSidebarCollapsed) {
          setIsSidebarCollapsed(true);
        }
      }
      return;
    }

    const savedState = conciliacionV1SidebarStateRef.current;
    if (savedState?.active) {
      conciliacionV1SidebarStateRef.current = null;

      if (savedState.previousCollapsed !== isSidebarCollapsed) {
        setIsSidebarCollapsed(savedState.previousCollapsed);
      }
    }
  }, [isSidebarCollapsed, location.pathname]);

  const cerrarSesion = async () => {
    if (logoutRef.current) {
      return;
    }

    logoutRef.current = true;

    try {
      await logoutSession({ redirectToLogin: false });
    } finally {
      forceLogoutToLogin();
    }
  };

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "authUser" && !event.newValue) {
        window.location.replace("/");
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const irDashboard = () => {
    navigate("/admin/DashboardPage");
  };

  const alternarMenu = () => {
    setIsSidebarCollapsed((prev) => !prev);
  };

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

  const renderTileNode = (tile: DashboardTile, nodeKey: string, depth: number) => {
    const hasChildren = (tile.children?.length ?? 0) > 0;
    const normalizedPath = normalizeRoutePath(tile.path);
    const isActive = tileMatchesPath({ ...tile, path: normalizedPath }, location.pathname);
    const isExpanded = expandedNodes[nodeKey] ?? isActive;

    return (
      <div key={nodeKey}>
        <div
          className="flex items-center gap-1.5 pr-1 mb-0.5"
          style={{ paddingLeft: 8 + depth * 14 }}
        >
          <NavLink
            to={normalizedPath || "#"}
            className={`flex-1 no-underline text-[12px] font-semibold rounded-md px-2 py-1.5 leading-tight transition-colors ${
              isActive
                ? "bg-brand-purple-light text-brand-dark"
                : "text-text-soft hover:bg-slate-50 hover:text-text-strong"
            }`}
          >
            {tile.label}
          </NavLink>

          {hasChildren && (
            <button
              type="button"
              className="w-[22px] h-[22px] rounded-md flex items-center justify-center text-text-muted font-bold text-xs hover:bg-slate-100"
              onClick={() => toggleNode(nodeKey)}
              aria-label={isExpanded ? "Contraer submenu" : "Expandir submenu"}
            >
              {isExpanded ? "\u2013" : "+"}
            </button>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div>
            {tile.children!.map((child, index) => renderTileNode(child, `${nodeKey}-${index}`, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <PageTitleContext.Provider value={{ setPageTitle }}>
      <div className="min-h-screen h-screen bg-bg-app flex flex-col overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 z-[1100] shadow-[0_4px_14px_rgba(23,20,58,0.08)]">
        <header className="h-14 bg-brand-dark text-white flex items-center px-4 box-border border-b-[3px] border-brand-purple gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={irDashboard}
              className="flex items-center gap-2.5 bg-transparent border-none cursor-pointer p-0"
            >
              <img src={logo} alt="CJ Telecom" className="h-9 w-auto object-contain block" />
            </button>
          </div>

          <div className="flex items-center gap-3 min-w-0 justify-end">
            {pageTitle ? (
              <div className="text-xl font-extrabold text-white/95 text-right truncate max-w-[34vw]">
                {pageTitle}
              </div>
            ) : null}
            <div className="w-8 h-8 rounded-full bg-brand-purple flex items-center justify-center text-xs font-bold flex-shrink-0">
              {iniciales}
            </div>
          </div>
        </header>
      </div>

      <div className="flex items-stretch flex-1 min-h-0 min-w-0 relative overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`sidebar-scroll bg-white box-border h-full overflow-hidden transition-[width,min-width,padding] duration-200 ease-in-out ${
            isSidebarCollapsed ? "w-11 min-w-11 p-2" : "w-80 min-w-[280px] max-w-[360px] p-3 pb-24"
          }`}
        >
          <div className={`flex items-center gap-2 mb-2.5 pb-1.5 bg-white ${isSidebarCollapsed ? "justify-center" : "justify-between"}`}>
            {!isSidebarCollapsed && (
              <button
                type="button"
                onClick={irDashboard}
                className="text-[13px] font-extrabold text-slate-700 bg-transparent border-none cursor-pointer p-0"
                aria-label="Ir al dashboard"
                title="Ir al dashboard"
              >
                Menu
              </button>
            )}
            <button
              type="button"
              onClick={alternarMenu}
              className="border-none bg-brand-orange text-brand-dark w-7 h-7 rounded-md cursor-pointer flex items-center justify-center"
              aria-label={isSidebarCollapsed ? "Abrir menu lateral" : "Cerrar menu lateral"}
              title={isSidebarCollapsed ? "Abrir menu" : "Cerrar menu"}
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 block" aria-hidden="true" focusable="false">
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
            <div className="sidebar-scroll overflow-y-scroll overflow-x-hidden pr-0.5" style={{ height: "calc(100% - 40px)" }}>
              {menuLoading ? (
                <div className="text-text-soft text-sm font-semibold px-2 py-2.5">Cargando menu...</div>
              ) : menuDashboard.length === 0 ? (
                <div className="text-text-soft text-sm font-semibold px-2 py-2.5">
                  Usuario no tiene opciones de menu configurado
                </div>
              ) : (
                menuDashboard.map((grupo, groupIndex) => {
                  const groupKey = `group-${groupIndex}`;
                  const groupIsActive = grupo.tiles.some((tile) => tileMatchesPath(tile, location.pathname));
                  const groupIsExpanded = expandedGroups[groupKey] ?? groupIsActive;
                  const GroupIcon = getSidebarPrimaryIcon(grupo.titulo);
                  const accent = getMenuAccentByName(grupo.titulo);

                  return (
                    <section
                      key={groupKey}
                      className="border rounded-xl mb-2"
                      style={{
                        borderColor: accent.border,
                        background: groupIsActive ? accent.background : accent.softBackground,
                      }}
                    >
                      <div className="flex items-center px-2 py-2 pl-2.5 gap-2">
                        <span
                          className="w-7 h-7 rounded-md border flex items-center justify-center flex-shrink-0"
                          style={
                            {
                              borderColor: accent.border,
                              background: accent.background,
                              color: accent.color,
                            }
                          }
                          title={grupo.titulo}
                          aria-hidden="true"
                        >
                          <GroupIcon size={16} strokeWidth={2.1} />
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleGroup(groupKey)}
                          className="flex-1 text-left bg-transparent border-none text-[13px] font-extrabold cursor-pointer py-1"
                          style={{ color: accent.color }}
                        >
                          {grupo.titulo}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleGroup(groupKey)}
                          className="w-[22px] h-[22px] rounded-md flex items-center justify-center font-bold text-xs hover:brightness-95"
                          style={{
                            border: `1px solid ${accent.border}`,
                            background: accent.softBackground,
                            color: accent.color,
                          }}
                          aria-label={groupIsExpanded ? "Contraer grupo" : "Expandir grupo"}
                        >
                          {groupIsExpanded ? "\u2013" : "+"}
                        </button>
                      </div>

                      {groupIsExpanded && (
                        <div className="border-t border-border-soft p-1.5 pb-2">
                          {grupo.tiles.map((tile, tileIndex) => renderTileNode(tile, `${groupKey}-${tileIndex}`, 0))}
                        </div>
                      )}
                    </section>
                  );
                })
              )}
            </div>
          )}
        </aside>

        <main
          className={`flex-1 min-w-0 w-0 h-full p-3 box-border overflow-x-hidden ${
        isEmployeesPage || location.pathname.startsWith("/finanzas/tesoreria/pagos_v1")
            || location.pathname.startsWith("/finanzas/tesoreria/pagos_dev")
              ? "overflow-y-hidden pb-3"
              : "overflow-y-auto pb-20"
          }`}
        >
          <Outlet />
        </main>
      </div>

      {/* Footer */}
      <footer className="fixed left-0 right-0 bottom-0 min-h-[44px] bg-brand-dark border-t-2 border-brand-purple text-slate-200 z-[1200] flex items-center">
        <div className="w-full flex justify-between items-center px-6 py-2.5 text-xs font-semibold box-border gap-3 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="text-sm font-bold">Usuario: {usuarioMostrar}</div>
            <div className="text-xs font-semibold opacity-90">
              Empleado: {empleadoMostrar || "NO DEFINIDO"} &nbsp;|&nbsp; Codigo:{" "}
              {`${codigoEmpleadoMostrar || "ND"} - ${codigoidperfil || "ND"} - ${codigoidrol || "ND"}`} &nbsp;|&nbsp;
              Correo: {correoMostrar || "NO DEFINIDO"}
            </div>
          </div>
          {isMapaSitesPage ? (
            <div className="text-center text-[11px] font-semibold opacity-90 leading-tight">
              Visualiza el resultado de <strong>sp_Site_Listar</strong> y{" "}
              <strong>sp_Asistencia_UltimoMovimientoEmpleado</strong> sobre el mapa del Peru.
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => void cerrarSesion()}
            className="border-none bg-brand-orange text-brand-dark px-2.5 py-1.5 rounded-md cursor-pointer font-extrabold text-[11px] hover:brightness-95"
          >
            Cerrar sesion
          </button>
        </div>
      </footer>
      </div>
    </PageTitleContext.Provider>
  );
}

function getSidebarPrimaryIcon(value: string) {
  return getMenuIconComponent({ nombreMenu: value });
}
