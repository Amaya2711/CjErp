export type DashboardTile = {
  label: string;
  path: string;
  badge?: string;
};

export type DashboardGroup = {
  titulo: string;
  subtitulo?: string;
  color: string;
  tiles: DashboardTile[];
};

export const menuDashboard: DashboardGroup[] = [
  {
    titulo: "Gestion",
    subtitulo: "Operaciones",
    color: "#6E4CCB",
    tiles: [
      { label: "Capitalizacion / Cierre", path: "/operaciones/cierre" },
      { label: "Operaciones", path: "/operaciones" },
      { label: "Asignaciones", path: "/operaciones/asignaciones" },
    ],
  },
  {
    titulo: "Finanzas",
    subtitulo: "Tesoreria y pagos",
    color: "#E74C3C",
    tiles: [
      { label: "Depositos", path: "/finanzas/deposito" },
      { label: "Aprobaciones", path: "/finanzas/aprobar" },
      { label: "Orden Compra", path: "/finanzas/orden-compra" },
    ],
  },
  {
    titulo: "Logistica",
    subtitulo: "Inventario y control",
    color: "#0EA5E9",
    tiles: [
      { label: "Inventario", path: "/logistica/inventario" },
      { label: "Cruce Series", path: "/logistica/cruce-series" },
    ],
  },
  {
    titulo: "Administracion",
    subtitulo: "Control administrativo",
    color: "#22C55E",
    tiles: [
      { label: "Asistencia", path: "/administracion/asistencia" },
      { label: "Pendientes", path: "/administracion/pendientes" },
      { label: "Vacaciones", path: "/administracion/vacaciones" },
    ],
  },
  {
    titulo: "Seguridad",
    subtitulo: "Usuarios y permisos",
    color: "#F59E0B",
    tiles: [
      { label: "Usuarios", path: "/seguridad/usuarios" },
      { label: "Usuario Perfil", path: "/seguridad/usuario-perfil" },
      { label: "Perfiles", path: "/seguridad/perfiles" },
      { label: "Roles", path: "/seguridad/roles" },
      { label: "Menu", path: "/seguridad/menu" },
      { label: "Permisos", path: "/seguridad/permisos" },
    ],
  },
  {
    titulo: "Reportes",
    subtitulo: "Reportes y analitica",
    color: "#38BDF8",
    tiles: [
      { label: "Reporte asistencia", path: "/reportes/rptasistencia" },
    ],
  },
];
