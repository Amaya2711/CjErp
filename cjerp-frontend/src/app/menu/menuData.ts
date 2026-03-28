export const menuData = [
  {
    label: "Operaciones",
    children: [
      { label: "Capitalización/Cierre", path: "/operaciones/cierre" },
      { label: "Operaciones", path: "/operaciones" },
      { label: "Asignaciones", path: "/operaciones/asignaciones" },
    ],
  },
  {
    label: "Pagos",
    children: [
      { label: "Depósito", path: "/pagos/deposito" },
      { label: "Aprobar", path: "/pagos/aprobar" },
      { label: "Orden Compra", path: "/pagos/orden-compra" },
      { label: "Pagos", path: "/pagos" },
    ],
  },
  {
    label: "Logística",
    children: [
      { label: "Cruce Series", path: "/logistica/cruce-series" },
      { label: "Solicitud equipos", path: "/logistica/solicitud" },
      { label: "Desmontado", path: "/logistica/desmontado" },
    ],
  },
  {
    label: "Administración",
    children: [
      { label: "Asistencia", path: "/admin/asistencia" },
      { label: "Vacaciones", path: "/admin/vacaciones" },
      { label: "Descanso Médico", path: "/admin/descanso" },
      { label: "Solicitud Administración", path: "/admin/solicitud" },
      { label: "Marcación", path: "/admin/marcacion" },
    ],
  },
  {
    label: "Mantenimiento",
    children: [
      { label: "Consulta", path: "/mantenimiento/consulta" },
      { label: "Migrar", path: "/mantenimiento/migrar" },
      { label: "Mantenimiento", path: "/mantenimiento" },
    ],
  },
  {
    label: "Planta",
    children: [
      { label: "Principal", path: "/planta" },
      { label: "EPPS", path: "/planta/epps" },
    ],
  },
];