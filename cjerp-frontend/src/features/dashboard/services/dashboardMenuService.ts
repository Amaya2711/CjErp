import type { MenuDto } from "../../../models/seguridad/menu.types";
import { menuService } from "../../seguridad/services/menuService";
import { getCategoryConfig } from "../config/categoryConfig";

/**
 * Dashboard representation of a menu group
 */
export interface DashboardGroup {
  titulo: string;
  subtitulo?: string;
  color: string;
  tiles: DashboardTile[];
  codigoMenu?: string;
  ordenMenu?: number;
}

/**
 * Dashboard tile (action/menu item within a group)
 */
export interface DashboardTile {
  label: string;
  path: string;
  badge?: string;
  ordenMenu?: number;
  children?: DashboardTile[];
}

/**
 * Transform MenuDto[] into DashboardGroup[]
 * Groups menus by their parent (nivel 0 = categories, nivel 1+ = tiles)
 *
 * Expected hierarchy:
 * - NivelMenu 0: Categories (Gestión, Finanzas, etc.)
 *   - NivelMenu 1+: Modules/Actions (Operaciones, Depósitos, etc.)
 */
export function transformMenusToDashboard(menus: MenuDto[]): DashboardGroup[] {
  // Group menus by their parent (IdMenuPadre)
  // Category menus have IdMenuPadre = null or NivelMenu = 0
  const categoryMap = new Map<number | string, MenuDto>();
  const moduleMap = new Map<number | string, MenuDto[]>();

  // Separate categories from modules, filtering by acceso
  menus.forEach((menu) => {
    // Categories are nivel 0 or have no parent
    if (menu.nivelMenu === 0 || menu.idMenuPadre == null) {
      categoryMap.set(menu.idMenu, menu);
    } else {
      // Modules belong to a parent
      const parentId = menu.idMenuPadre || "uncategorized";
      if (!moduleMap.has(parentId)) {
        moduleMap.set(parentId, []);
      }
      moduleMap.get(parentId)!.push(menu);
    }
  });

  const getSortedChildren = (parentId: number | string): MenuDto[] => {
    return [...(moduleMap.get(parentId) || [])].sort((a, b) => {
      const orderA = a.ordenMenu || 0;
      const orderB = b.ordenMenu || 0;
      if (orderA !== orderB) {
        return orderA - orderB;
      }

      return a.idMenu - b.idMenu;
    });
  };

  const findFirstRouteDescendant = (parentId: number | string): string | null => {
    const children = getSortedChildren(parentId);

    for (const child of children) {
      if (child.ruta) {
        return child.ruta;
      }

      const nestedRoute = findFirstRouteDescendant(child.idMenu);
      if (nestedRoute) {
        return nestedRoute;
      }
    }

    return null;
  };

  const buildTileChildren = (parentId: number | string): DashboardTile[] => {
    return getSortedChildren(parentId)
      .map((child) => ({
        label: child.nombreMenu.trim(),
        path: child.ruta || findFirstRouteDescendant(child.idMenu) || "#",
        badge: child.nombreMenu.charAt(0).toUpperCase(),
        ordenMenu: child.ordenMenu ?? 0,
      }))
      .filter((tile) => tile.path !== "#")
      .sort((a, b) => {
        const orderA = a.ordenMenu ?? 0;
        const orderB = b.ordenMenu ?? 0;
        if (orderA !== orderB) {
          return orderA - orderB;
        }

        return a.label.localeCompare(b.label, "es", { sensitivity: "base" });
      });
  };

  // Build dashboard groups from categories
  const groups: DashboardGroup[] = [];

  categoryMap.forEach((category) => {
    const categoryModules = getSortedChildren(category.idMenu);

    // Dashboard rule:
    // - If IdMenuNivel2 is null in SP row, MenuNivel3 arrives as direct child with route.
    // - Otherwise, show MenuNivel2 (direct child) and navigate using first descendant route.
    const tiles: DashboardTile[] = categoryModules
      .map((module) => ({
        label: module.nombreMenu.trim(),
        path: module.ruta || findFirstRouteDescendant(module.idMenu) || "#",
        badge: module.nombreMenu.charAt(0).toUpperCase(),
        ordenMenu: module.ordenMenu ?? 0,
        children: buildTileChildren(module.idMenu),
      }))
      .filter((tile) => tile.path !== "#")
      .sort((a, b) => {
        const orderA = a.ordenMenu ?? 0;
        const orderB = b.ordenMenu ?? 0;
        if (orderA !== orderB) {
          return orderA - orderB;
        }

        return a.label.localeCompare(b.label, "es", { sensitivity: "base" });
      });

    // Only add group if it has tiles
    if (tiles.length > 0) {
      const categoryKey = category.codigoMenu || category.nombreMenu;
      const config = getCategoryConfig(categoryKey);
      groups.push({
        titulo: category.nombreMenu,
        subtitulo: config.subtitle,
        color: config.color,
        tiles,
        codigoMenu: categoryKey || undefined,
        ordenMenu: category.ordenMenu ?? undefined,
      });
    }
  });

  // Sort groups by SegMenu.OrdenMenu and fallback to configured order
  groups.sort((a, b) => {
    const orderA = a.ordenMenu ?? getCategoryConfig(a.codigoMenu || a.titulo).order;
    const orderB = b.ordenMenu ?? getCategoryConfig(b.codigoMenu || b.titulo).order;
    return orderA - orderB;
  });

  return groups;
}

/**
 * Load dashboard menus for a specific user
 * Calls backend API to get user's permitted menus
 * Transforms them into dashboard UI structure
 */
export async function loadDashboardMenus(
  idUsuario: string
): Promise<DashboardGroup[]> {
  try {
    const menus = await menuService.obtenerMenuDinamicoPorUsuario(idUsuario);
    return transformMenusToDashboard(menus);
  } catch (error) {
    // console.error("Error loading dashboard menus for user:", idUsuario, error);
    // Return empty array or default groups on error
    return [];
  }
}

/**
 * Load all dashboard menus (admin view)
 * For development/testing when user info not available
 */
export async function loadAllDashboardMenus(): Promise<DashboardGroup[]> {
  try {
    const menus = await menuService.obtenerCompleto();
    return transformMenusToDashboard(menus);
  } catch (error) {
    // console.error("Error loading all dashboard menus:", error);
    return [];
  }
}
