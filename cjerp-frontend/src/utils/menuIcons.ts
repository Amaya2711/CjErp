import {
  Banknote,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarRange,
  ClipboardList,
  Database,
  FileSearch,
  FileText,
  FolderKanban,
  Home,
  Landmark,
  LayoutDashboard,
  ListChecks,
  MapPinned,
  Menu as MenuIcon,
  Route,
  Search,
  Settings,
  Shield,
  ShoppingCart,
  Truck,
  Users,
  UsersRound,
  Wrench,
  Boxes,
} from "lucide-react";

export function normalizeMenuKey(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function getMenuIconComponent(item: {
  icono?: string | null;
  codigoMenu?: string | null;
  nombreMenu?: string | null;
}) {
  const iconKey = normalizeMenuKey(item.icono);
  const menuKey = normalizeMenuKey(item.codigoMenu || item.nombreMenu);
  const key = iconKey || menuKey;

  if (key.includes("INICIO") || key.includes("HOME") || key.includes("DASHBOARD")) return Home;
  if (key.includes("SEGURIDAD") || key.includes("USUARIO") || key.includes("ROL") || key.includes("PERFIL")) return Shield;
  if (key.includes("RECURSOHUMANO") || key.includes("PERSONAL") || key.includes("EMPLEADO") || key.includes("RRHH")) return UsersRound;
  if (key.includes("COMPR")) return ShoppingCart;
  if (key.includes("FINANZ")) return Banknote;
  if (key.includes("LOGISTIC") || key.includes("ALMAC") || key.includes("INVENT")) return Boxes;
  if (key.includes("PLANTA")) return Building2;
  if (key.includes("MANTEN")) return Wrench;
  if (key.includes("REPORTE") || key.includes("INFORME") || key.includes("GERENC") || key.includes("ANALISIS")) return BarChart3;
  if (key.includes("OPERAC")) return BriefcaseBusiness;
  if (key.includes("ADMIN")) return Settings;
  if (key.includes("ARRIEN")) return Landmark;
  if (key.includes("MAPA") || key.includes("SITE")) return MapPinned;
  if (key.includes("ASIST")) return CalendarRange;
  if (key.includes("SQL") || key.includes("MONITOR")) return Database;
  if (key.includes("BUSQUEDA") || key.includes("CONSULTA")) return FileSearch;
  if (key.includes("MENU")) return MenuIcon;
  if (key.includes("TAREA") || key.includes("LISTA")) return ListChecks;
  if (key.includes("TRABAJO") || key.includes("PROYECT")) return FolderKanban;
  if (key.includes("RUTA")) return Route;
  if (key.includes("VENTA") || key.includes("COMERCIAL")) return Users;
  if (key.includes("CAMPO") || key.includes("FORM")) return ClipboardList;
  if (key.includes("DOC") || key.includes("ARCHIV")) return FileText;
  if (key.includes("MOVI") || key.includes("DESPACH")) return Truck;
  if (key.includes("BUSCAR")) return Search;

  return LayoutDashboard;
}

type MenuAccent = {
  border: string;
  background: string;
  color: string;
  softBackground: string;
};

const accentPalette: MenuAccent[] = [
  {
    border: "#F2C5C5",
    background: "#FFF7F7",
    color: "#7C4A4A",
    softBackground: "#FFFCFC",
  },
  {
    border: "#C9DDB9",
    background: "#F8FBF4",
    color: "#5D7050",
    softBackground: "#FCFDF8",
  },
  {
    border: "#C8DDF2",
    background: "#F7FAFE",
    color: "#4F6478",
    softBackground: "#FCFEFF",
  },
  {
    border: "#F2E1AF",
    background: "#FFFCF4",
    color: "#7A6A3C",
    softBackground: "#FFFEFB",
  },
  {
    border: "#E7C7C0",
    background: "#FFF9F8",
    color: "#7A5B55",
    softBackground: "#FFFCFC",
  },
  {
    border: "#C7D0E6",
    background: "#F8FAFE",
    color: "#506074",
    softBackground: "#FCFDFF",
  },
  {
    border: "#D9E6C9",
    background: "#FAFCF5",
    color: "#607052",
    softBackground: "#FDFEFA",
  },
  {
    border: "#D6C9F0",
    background: "#FBF9FF",
    color: "#615478",
    softBackground: "#FDFBFF",
  },
  {
    border: "#D7D7D7",
    background: "#FBFBFB",
    color: "#59606A",
    softBackground: "#FEFEFE",
  },
  {
    border: "#E0D2B8",
    background: "#FEFBF4",
    color: "#6F654D",
    softBackground: "#FFFDF8",
  },
  {
    border: "#CFC7BB",
    background: "#FCFBF9",
    color: "#635D53",
    softBackground: "#FEFDFC",
  },
  {
    border: "#C8D9C9",
    background: "#F7FBF8",
    color: "#56655A",
    softBackground: "#FCFDFC",
  },
  {
    border: "#E2D3D3",
    background: "#FEF9F9",
    color: "#6C5757",
    softBackground: "#FFFCFC",
  },
  {
    border: "#D7E0EE",
    background: "#F7FAFE",
    color: "#526277",
    softBackground: "#FCFDFF",
  },
];

function hashMenuKey(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function getMenuAccentByName(nombreMenu: string | null | undefined): MenuAccent {
  const key = normalizeMenuKey(nombreMenu);
  const hash = key ? hashMenuKey(key) : 0;
  return accentPalette[hash % accentPalette.length];
}
