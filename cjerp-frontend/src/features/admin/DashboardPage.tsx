import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { menuService } from "../seguridad/services/menuService";
import { buildMenuTree } from "../../utils/buildMenuTree";
import { getMenuAccentByName, getMenuIconComponent } from "../../utils/menuIcons";
//import type { MenuDto } from "../../models/seguridad/menu.types";
import type { MenuDto as MenuModelDto } from "../../models/seguridad/menu.types";
import { getAuthUser } from "../../utils/authStorage";
import { obtenerIndicadorPendientes, RUTA_ALERTAS } from "../inicio/alertasPendientes";
import { obtenerFaltasMes } from "../../api/asistenciaService";
import { useAlertasConteos, type AlertaKpiKey } from "../inicio/useAlertasConteos";

const KPIS_ALERTAS: Array<{ key: AlertaKpiKey; label: string }> = [
  { key: "oc", label: "Órdenes de compra" },
  { key: "gastos", label: "Gastos" },
  { key: "vacaciones", label: "Vacaciones" },
  { key: "descanso", label: "Descanso médico" },
  { key: "adelanto", label: "Adelanto de sueldo" },
  { key: "prestamo", label: "Préstamo" },
];

type QuickLink = {
  id: number;
  titulo: string;
  descripcion: string;
};


//type MenuAccesoDto = MenuDto & { acceso?: boolean | number | string | null };
//type MenuAccesoDto = Omit<MenuModelDto, "acceso" | "esNodoPrincipal"> & {
  //<acceso>?: boolean | number | string | null;
  //esNodoPrincipal?: boolean;
//};
type MenuAccesoDto = {
  idMenu: number;
  idMenuPadre?: number | null;
  nombreMenu: string;
  ruta?: string | null;
  icono?: string | null;
  ordenMenu?: number | null;
  nivelMenu?: number | null;
  codigoMenu?: string | null;
  esVisible?: boolean;
  esActivo?: boolean;
  acceso?: boolean | number | string | null;
  esNodoPrincipal?: boolean;
};

const CLAUDEIA_RUTA = "/reportes/administrativo/claudeia";

function getSaludo() {
  const hour = new Date().getHours();

  if (hour < 12) return "Buenos días ";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function getInitials(text: string) {
  if (!text?.trim()) return "US";

  const parts = text.trim().split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

//function getAccesoValue(item: MenuAccesoDto): number {
//  const raw = item.acceso;
//
//  if (typeof raw === "boolean") {
//    return raw ? 1 : 0;
//  }
//
//  if (typeof raw === "string") {
//    return raw === "1" || raw.toLowerCase() === "true" ? 1 : 0;
//  }
//
//  if (typeof raw === "number") {
//    return raw === 1 ? 1 : 0;
//  }

//  return 0;
//}
function getAccesoValue(item: { acceso?: unknown }): number {
  const raw = item.acceso;

  if (typeof raw === "boolean") return raw ? 1 : 0;

  if (typeof raw === "number") return raw === 1 ? 1 : 0;

  if (typeof raw === "string") {
    const value = raw.trim().toLowerCase();
    return value === "1" || value === "true" ? 1 : 0;
  }

  return 0;
}

function getMenuRoute(item: MenuAccesoDto): string {
  return typeof item.ruta === "string" ? item.ruta.trim() : "";
}

function normalizarRuta(ruta: string): string {
  return ruta.toLowerCase().replace(/\/+$/, "");
}

function esRutaAlertas(ruta: string): boolean {
  return normalizarRuta(ruta) === RUTA_ALERTAS;
}

const RUTA_ASISTENCIA_EMPLEADO = "/reportes/rptasistenciaempleado";

function esRutaAsistenciaEmpleado(ruta: string): boolean {
  return normalizarRuta(ruta) === RUTA_ASISTENCIA_EMPLEADO;
}

function getShortcutIcon(nombreMenu: string) {
  return getMenuIconComponent({ nombreMenu });
}

function buildMenuBreadcrumb(item: MenuAccesoDto | undefined, menuById: Map<number, MenuAccesoDto>): string {
  if (!item) {
    return "";
  }

  const trail: string[] = [];
  const visited = new Set<number>();
  let current: MenuAccesoDto | undefined = item;

  while (current && !visited.has(current.idMenu)) {
    visited.add(current.idMenu);
    trail.push(current.nombreMenu);

    const parentId = current.idMenuPadre ?? null;
    if (parentId == null) {
      break;
    }

    current = menuById.get(parentId);
  }

  return trail.reverse().join(" / ");
}

function getPrimaryMenuAncestor(item: MenuAccesoDto | undefined, menuById: Map<number, MenuAccesoDto>): MenuAccesoDto | undefined {
  if (!item) {
    return undefined;
  }

  const visited = new Set<number>();
  let current: MenuAccesoDto | undefined = item;

  while (current && current.idMenuPadre != null && !visited.has(current.idMenu)) {
    visited.add(current.idMenu);
    const parent = menuById.get(current.idMenuPadre);
    if (!parent) {
      break;
    }
    current = parent;
  }

  return current;
}

function buildSidebarOrderMap(menu: MenuAccesoDto[]) {
  const tree = buildMenuTree(
    menu.map((item) => ({
      ...item,
      esActivo: item.esActivo ?? true,
      esVisible: item.esVisible ?? true,
      ordenMenu: Number(item.ordenMenu ?? 0),
      nivelMenu: Number(item.nivelMenu ?? 0),
      esNodoPrincipal: Boolean(item.esNodoPrincipal ?? false),
      acceso: Number(getAccesoValue(item)),
    }))
  );

  const orderMap = new Map<number, number>();
  let order = 0;
  type TreeNode = ReturnType<typeof buildMenuTree>[number];

  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      order += 1;
      orderMap.set(node.idMenu, order);
      if (node.hijos.length > 0) {
        walk(node.hijos);
      }
    }
  };

  walk(tree);
  return orderMap;
}


export default function DashboardPage() {
  const navigate = useNavigate();
  const authUser = getAuthUser();
  // const [fechaHora, setFechaHora] = useState(formatFechaHora(new Date()));
  const [accesosDirectos, setAccesosDirectos] = useState<MenuAccesoDto[]>([]);
  const [menuCompleto, setMenuCompleto] = useState<MenuAccesoDto[]>([]);
  const [accesosLoading, setAccesosLoading] = useState(true);

  // useEffect(() => {
  //   const timer = setInterval(() => {
  //     setFechaHora(formatFechaHora(new Date()));
  //   }, 60000);
  //
  //   return () => clearInterval(timer);
  // }, []);

  useEffect(() => {
    let active = true;

    async function cargarAccesos() {
      setAccesosLoading(true);
      try {
        const usuario = getAuthUser();
        if (!usuario?.usuario) {
          if (active) {
            setAccesosDirectos([]);
            setAccesosLoading(false);
          }
          return;
        }
        const menuRaw = await menuService.obtenerMenuDinamicoPorUsuario(usuario.usuario);
        //const menu: MenuAccesoDto[] = menuRaw.map((item) => ({
        //  ...item,
        //  acceso: getAccesoValue(item),
        //}));
        const menu: MenuAccesoDto[] = menuRaw.map((item) => ({
          ...item,
          acceso: getAccesoValue(item),
          esNodoPrincipal: Boolean((item as any).esNodoPrincipal ?? false),
        }));

        if (!active) {
          return;
        }

        setMenuCompleto(menu);
        setAccesosDirectos(
          menu.filter(
            (m) =>
              Number(m.acceso) === 1 &&
              getMenuRoute(m) !== "" &&
              getMenuRoute(m) !== CLAUDEIA_RUTA
          )
        );
      } catch (_error: unknown) {
        if (active) {
          setAccesosDirectos([]);
        }
      } finally {
        if (active) {
          setAccesosLoading(false);
        }
      }
    }

    void cargarAccesos();

    return () => {
      active = false;
    };
  }, []);

  // Si el usuario tiene el acceso directo /inicio/alertas, solo se consultan los totales (indicador 0/1) en segundo plano.
  const tieneAccesoAlertas = accesosDirectos.some((m) => esRutaAlertas(getMenuRoute(m)));
  const [alertasPendientes, setAlertasPendientes] = useState(0);

  useEffect(() => {
    if (!tieneAccesoAlertas) {
      setAlertasPendientes(0);
      return;
    }
    let active = true;
    obtenerIndicadorPendientes()
      .then((indicador) => {
        if (active) setAlertasPendientes(indicador);
      })
      .catch(() => {
        if (active) setAlertasPendientes(0);
      });
    return () => {
      active = false;
    };
  }, [tieneAccesoAlertas]);

  // Si tiene el acceso directo ASISTENCIA EMPLEADO, se ejecuta sp_Asistencia_ListarMes (empleado logueado):
  // con 1 o más registros en estado FALTA o INCOMPLETO el botón se muestra en rojo.
  const tieneAccesoAsistencia = accesosDirectos.some((m) => esRutaAsistenciaEmpleado(getMenuRoute(m)));
  const [faltasMes, setFaltasMes] = useState(0);

  useEffect(() => {
    if (!tieneAccesoAsistencia) {
      setFaltasMes(0);
      return;
    }
    let active = true;
    obtenerFaltasMes()
      .then((total) => {
        if (active) setFaltasMes(total);
      })
      .catch(() => {
        if (active) setFaltasMes(0);
      });
    return () => {
      active = false;
    };
  }, [tieneAccesoAsistencia]);

  const conteosAlertas = useAlertasConteos(tieneAccesoAlertas);
  // Los KPI en 0 (o aún sin cargar) no se muestran.
  const kpisAlertasVisibles = KPIS_ALERTAS.filter(({ key }) => (conteosAlertas[key] ?? 0) > 0);

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

    const idperfil =
      authUser?.idperfil ||
      "No disponible";

     const idrol =
      authUser?.idrol ||
      "No disponible";

    return {
      nombreEmpleado,
      usuarioLogin: String(usuarioLogin).toUpperCase(),
      correo,
      codEmp,
      idperfil,
      idrol
    };
  }, [authUser]);

  const accesosAgrupados = useMemo(() => {
    const menuPorId = new Map(menuCompleto.map((item) => [item.idMenu, item] as const));
    const ordenSidebar = buildSidebarOrderMap(menuCompleto);

    const getOrdenSidebar = (item?: MenuAccesoDto) => {
      if (!item) {
        return Number.MAX_SAFE_INTEGER;
      }

      return ordenSidebar.get(item.idMenu) ?? Number.MAX_SAFE_INTEGER;
    };

    const grupos = new Map<
      string,
      {
        id: string;
        titulo: string;
        icono?: MenuAccesoDto;
        rutaCompleta?: string;
        items: MenuAccesoDto[];
      }
    >();

    for (const item of accesosDirectos) {
      const parentId = item.idMenuPadre ?? 0;
      const groupKey = String(parentId);
      const parent = menuPorId.get(parentId);
      const principal = getPrimaryMenuAncestor(parent ?? item, menuPorId);

      if (!grupos.has(groupKey)) {
        grupos.set(groupKey, {
          id: groupKey,
          titulo: principal?.nombreMenu ?? parent?.nombreMenu ?? item.nombreMenu,
          icono: principal ?? parent ?? item,
          rutaCompleta: buildMenuBreadcrumb(item, menuPorId),
          items: [],
        });
      }

      grupos.get(groupKey)!.items.push(item);
    }

    return Array.from(grupos.values())
      .map((group) => ({
        ...group,
        path: group.icono ? buildMenuBreadcrumb(group.icono, menuPorId) : group.titulo,
        items: group.items.sort((a, b) => {
          const orderDiff = getOrdenSidebar(a) - getOrdenSidebar(b);
          if (orderDiff !== 0) return orderDiff;
          return a.nombreMenu.localeCompare(b.nombreMenu, "es", { sensitivity: "base" });
        }),
      }))
      .sort((a, b) => {
        const orderDiff = getOrdenSidebar(a.icono ?? a.items[0]) - getOrdenSidebar(b.icono ?? b.items[0]);
        if (orderDiff !== 0) return orderDiff;
        return a.titulo.localeCompare(b.titulo, "es", { sensitivity: "base" });
      });
  }, [accesosDirectos, menuCompleto]);

  const quickLinks: QuickLink[] = [
    {
      id: 4,
      titulo: "Cambio de contraseña",
      descripcion: "Gestiona tus credenciales de acceso.",
    },
    {
      id: 5,
      titulo: "Asistencia",
      descripcion: "Gestiona las fechas de asistencia en un periodo de tiempo.",
    },
    {
      id: 6,
      titulo: "Noticias",
      descripcion: "Reporte diario gerencial del rubro y la economía.",
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
          <div style={styles.heroBadgeValue}>{import.meta.env.DEV ? "Desarrollo" : "Productivo"}</div>
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "2fr 1fr",
        gap: 20,
        alignItems: "start"
      }}>
        {/* Columna izquierda: Accesos directos */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Accesos directos */}
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>Accesos directos</h2>
              <span style={styles.cardTag}>Frecuentes</span>
            </div>
            <div style={{ color: '#64748B', padding: 12 }}>
              {/* Accesos directos dinámicos agrupados por idMenuPadre */}
              {accesosLoading ? (
                <em>Cargando accesos directos...</em>
              ) : accesosDirectos.length === 0 ? (
                <em>No hay accesos directos configurados.</em>
              ) : (
                accesosAgrupados.map((group) => {
                  const GroupIcon = getShortcutIcon(group.titulo);
                  const accent = getMenuAccentByName(group.titulo);
                  const tooltipPath = group.rutaCompleta || group.path || group.titulo;

                  return (
                    <div
                      key={group.id}
                      style={{
                        ...styles.quickAccessGroup,
                        borderColor: accent.border,
                        background: accent.softBackground,
                      }}
                    >
                      <span
                        title={tooltipPath}
                        style={{
                          ...styles.quickAccessIcon,
                          borderColor: accent.border,
                          background: accent.background,
                          color: accent.color,
                        }}
                      >
                        <GroupIcon size={15} strokeWidth={2.2} />
                      </span>
                      <div style={styles.quickAccessButtons}>
                        {group.items.map((item) => {
                          const ruta = getMenuRoute(item);
                          const conPendientes =
                            (alertasPendientes > 0 && esRutaAlertas(ruta)) ||
                            (faltasMes > 0 && esRutaAsistenciaEmpleado(ruta));
                          const detallePendiente = esRutaAsistenciaEmpleado(ruta)
                            ? `Tiene ${faltasMes} registro(s) con FALTA o INCOMPLETO en el mes`
                            : "Tiene pendientes por atender";
                          return (
                            <button
                              key={item.idMenu}
                              title={conPendientes ? detallePendiente : undefined}
                              style={{
                                ...styles.quickButton,
                                borderColor: conPendientes ? "#DC2626" : accent.border,
                                color: conPendientes ? "#FFFFFF" : accent.color,
                                background: conPendientes ? "#DC2626" : "#FFFFFF",
                              }}
                              onClick={() => {
                                const route = getMenuRoute(item);
                                if (route) {
                                  navigate(route);
                                }
                              }}
                            >
                              {item.nombreMenu}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
        {/* Columna derecha: Avisos generales y Ayuda y orientación */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>Pendientes</h2>
              <span style={styles.cardTag}>Institucional</span>
            </div>
            {tieneAccesoAlertas && kpisAlertasVisibles.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 12 }}>
                {kpisAlertasVisibles.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    title="Pendiente de aprobación: ver detalle"
                    onClick={() => navigate(`${RUTA_ALERTAS}?tab=${key}`)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: 6,
                      padding: "10px 14px",
                      borderRadius: 14,
                      cursor: "pointer",
                      font: "inherit",
                      textAlign: "left",
                      border: "1px solid #FCA5A5",
                      background: "#FEF2F2",
                      color: "#B91C1C",
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{label}</span>
                    <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{conteosAlertas[key]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
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
                    <button
                      type="button"
                      style={styles.quickButton}
                      onClick={() => {
                        if (item.titulo === "Asistencia") {
                          navigate("/reportes/rptasistenciaempleado");
                        } else if (item.titulo === "Noticias") {
                          navigate("/inicio/noticias");
                        }
                      }}
                    >
                      Ver opción
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
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

  quickAccessLine: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },

  quickAccessGroup: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 8,
    padding: "5px 6px",
    borderRadius: 12,
    border: "1px solid transparent",
  },

  quickAccessButtons: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    flex: 1,
  },

  quickAccessIcon: {
    width: 28,
    height: 28,
    borderRadius: 999,
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#6D28D9",
    flexShrink: 0,
  },
};
