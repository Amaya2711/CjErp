import { menuService, type MenuDto } from "../../seguridad/services/menuService";

export type DashboardTile = {
  label: string;
  path: string;
  children?: DashboardTile[];
};

export type DashboardGroup = {
  titulo: string;
  tiles: DashboardTile[];
};

type MenuNode = {
  idMenu: number;
  idMenuPadre: number | null;
  nombreMenu: string;
  ruta?: string | null;
  nivelMenu?: number | null;
  ordenMenu?: number | null;
  children: MenuNode[];
};

function buildMenuTree(items: MenuDto[]): MenuNode[] {
  const map = new Map<number, MenuNode>();
  const roots: MenuNode[] = [];

  for (const item of items) {
    map.set(item.idMenu, {
      idMenu: item.idMenu,
      idMenuPadre: item.idMenuPadre ?? null,
      nombreMenu: item.nombreMenu,
      ruta: item.ruta ?? null,
      nivelMenu: item.nivelMenu ?? 0,
      ordenMenu: item.ordenMenu ?? 0,
      children: [],
    });
  }

  for (const item of items) {
    const current = map.get(item.idMenu);
    if (!current) continue;

    const parentId = item.idMenuPadre ?? null;

    if (parentId === null || !map.has(parentId)) {
      roots.push(current);
    } else {
      map.get(parentId)!.children.push(current);
    }
  }

  const ordenar = (nodes: MenuNode[]) => {
    nodes.sort((a, b) => (a.ordenMenu ?? 0) - (b.ordenMenu ?? 0));
    nodes.forEach((n) => ordenar(n.children));
  };

  ordenar(roots);

  return roots;
}

function mapNodeToTile(node: MenuNode): DashboardTile | null {
  const children = node.children
    .map(mapNodeToTile)
    .filter((x): x is DashboardTile => x !== null);

  const hasPath = !!node.ruta && node.ruta.trim() !== "";

  // Si no tiene ruta ni hijos útiles, no pinta nada
  if (!hasPath && children.length === 0) {
    return null;
  }

  return {
    label: node.nombreMenu,
    path: hasPath ? node.ruta!.trim() : "#",
    children: children.length > 0 ? children : undefined,
  };
}

export async function loadDashboardMenus(idUsuario: string): Promise<DashboardGroup[]> {
  const menus = await menuService.obtenerMenuDinamicoPorUsuario(idUsuario);

  //console.log("[dashboardMenuService] menus planos:", menus);

  if (!Array.isArray(menus) || menus.length === 0) {
    return [];
  }

  const tree = buildMenuTree(menus);

 //console.log("[dashboardMenuService] tree:", tree);

  const groups: DashboardGroup[] = tree
    .map((root) => {
      // Si el root tiene hijos, el grupo se arma con sus hijos
      if (root.children.length > 0) {
        const tiles = root.children
          .map(mapNodeToTile)
          .filter((x): x is DashboardTile => x !== null);

        return {
          titulo: root.nombreMenu,
          tiles,
        };
      }

      // Si el root no tiene hijos pero sí tiene ruta, lo mostramos como grupo con una sola opción
      const selfTile = mapNodeToTile(root);

      return {
        titulo: root.nombreMenu,
        tiles: selfTile ? [selfTile] : [],
      };
    })
    .filter((group) => group.tiles.length > 0);

  //console.log("[dashboardMenuService] groups:", groups);

  return groups;
}