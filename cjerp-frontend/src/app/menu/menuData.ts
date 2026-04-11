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
    titulo: "Operaciones",
    subtitulo: "Gestión operativa y asignaciones",
    color: "#6E4CCB",
    tiles: [
      { label: "Capitalización / Cierre", path: "/operaciones/cierre" },
      { label: "Operaciones", path: "/operaciones" },
      { label: "Asignaciones", path: "/operaciones/asignaciones" },
    ],
  },
  {
    titulo: "Pagos",
    subtitulo: "Tesorería y flujo de pagos",
    color: "#E74C3C",
    tiles: [
      { label: "Depósitos", path: "/finanzas/deposito" },
      { label: "Aprobaciones", path: "/finanzas/aprobar" },
      { label: "Orden Compra", path: "/finanzas/orden-compra" },
      { label: "Gastos", path: "/finanzas/gastos" },
      { label: "Bien / Servicio", path: "/finanzas/bien-servicio" },
      { label: "Act. Factura", path: "/finanzas/act-factura" },
    ],
  },
  {
    titulo: "Logística",
    subtitulo: "Inventario, equipos y series",
    color: "#0EA5E9",
    tiles: [
      { label: "Inventario", path: "/logistica/inventario" },
      { label: "Cruce Series", path: "/logistica/cruce-series" },
      { label: "Solicitud equipos", path: "/logistica/solicitud" },
      { label: "Desmontado", path: "/logistica/desmontado" },
      { label: "Almacenes", path: "/logistica/almacenes" },
    ],
  },
  {
    titulo: "Administración",
    subtitulo: "Control administrativo",
    color: "#22C55E",
    tiles: [
      { label: "Asistencia", path: "/administracion/asistencia" },
      { label: "Vacaciones", path: "/administracion/vacaciones" },
      { label: "Descanso Médico", path: "/administracion/descanso" },
      { label: "Solicitud Administración", path: "/administracion/solicitud" },
      { label: "Marcación", path: "/administracion/marcacion" },
    ],
  },
  {
    titulo: "Seguridad",
    subtitulo: "Usuarios, perfiles, roles y permisos",
    color: "#F59E0B",
    tiles: [
      { label: "Usuarios", path: "/seguridad/usuarios" },
      { label: "Usuario Perfil", path: "/seguridad/usuario-perfil" },
      { label: "Perfiles", path: "/seguridad/perfiles" },
      { label: "Roles", path: "/seguridad/roles" },
      { label: "Menú", path: "/seguridad/menu" },
      { label: "Permisos", path: "/seguridad/permisos" },
    ],
  },
  {
    titulo: "Comercial",
    subtitulo: "Ventas y gestión comercial",
    color: "#8B5CF6",
    tiles: [
      { label: "Ventas", path: "/comercial/ventas" },
      { label: "Operaciones", path: "/comercial/operaciones" },
      { label: "Asignaciones", path: "/comercial/asignaciones" },
      { label: "Gestión comercial", path: "/comercial/gestion" },
    ],
  },
  {
    titulo: "Compras",
    subtitulo: "Solicitudes y proveedores",
    color: "#EF4444",
    tiles: [
      { label: "Solicitudes", path: "/compras/solicitudes" },
      { label: "Orden de compra", path: "/compras/orden" },
      { label: "Proveedores", path: "/compras/proveedores" },
    ],
  },
  {
    titulo: "Contabilidad",
    subtitulo: "Cierre y control contable",
    color: "#14B8A6",
    tiles: [
      { label: "Asientos contables", path: "/contabilidad/asientos" },
      { label: "Conciliaciones", path: "/contabilidad/conciliaciones" },
      { label: "Libros contables", path: "/contabilidad/libros" },
      { label: "Cierre contable", path: "/contabilidad/cierre" },
    ],
  },
];