import type { MenuDto } from "../services/menuService";

export type MenuNivel = 0 | 1 | 2;

export type MenuTreeNode = {
  id: number;
  label: string;
  path?: string;
  parentId: number | null;
  orden: number;
  children: MenuTreeNode[];
  acceso: number;
};

export function getMenuAcceso(item: MenuDto): number {
  if (typeof item.acceso === "boolean") {
    return item.acceso ? 1 : 0;
  }

  if (typeof item.acceso === "string") {
    return item.acceso === "1" || item.acceso.toLowerCase() === "true" ? 1 : 0;
  }

  if (typeof item.acceso === "number") {
    return item.acceso === 1 ? 1 : 0;
  }

  return 0;
}

export function buildMenuTree(items: MenuDto[]): MenuTreeNode[] {
  const map = new Map<number, MenuTreeNode>();
  const roots: MenuTreeNode[] = [];

  items.forEach((item) => {
    map.set(item.idMenu, {
      id: item.idMenu,
      label: item.nombreMenu,
      path: item.ruta ?? undefined,
      parentId: item.idMenuPadre ?? null,
      orden: item.ordenMenu,
      children: [],
      acceso: getMenuAcceso(item),
    });
  });

  items.forEach((item) => {
    const current = map.get(item.idMenu);
    if (!current) return;

    const parentId = item.idMenuPadre ?? null;

    if (parentId === null || !map.has(parentId)) {
      roots.push(current);
      return;
    }

    map.get(parentId)!.children.push(current);
  });

  const sortRecursive = (nodes: MenuTreeNode[]) => {
    nodes.sort((a, b) => a.label.localeCompare(b.label));
    nodes.forEach((node) => sortRecursive(node.children));
  };

  sortRecursive(roots);

  return roots;
}

export function flattenMenuTree(nodes: MenuTreeNode[]): MenuTreeNode[] {
  const result: MenuTreeNode[] = [];

  const walk = (items: MenuTreeNode[]) => {
    items.forEach((item) => {
      result.push(item);
      if (item.children.length > 0) {
        walk(item.children);
      }
    });
  };

  walk(nodes);
  return result;
}

export function cloneMenuTree(nodes: MenuTreeNode[]): MenuTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    children: cloneMenuTree(node.children),
  }));
}

export function collectNodeAndChildrenIds(node: MenuTreeNode): number[] {
  const ids: number[] = [node.id];

  node.children.forEach((child) => {
    ids.push(...collectNodeAndChildrenIds(child));
  });

  return ids;
}

export function findParentChainIds(nodes: MenuTreeNode[], targetId: number): number[] {
  const path: number[] = [];

  const find = (items: MenuTreeNode[], parents: number[]): boolean => {
    for (const item of items) {
      if (item.id === targetId) {
        path.push(...parents);
        return true;
      }

      if (item.children.length > 0) {
        const found = find(item.children, [...parents, item.id]);
        if (found) {
          return true;
        }
      }
    }

    return false;
  };

  find(nodes, []);
  return path;
}

export function findMenuNodeById(nodes: MenuTreeNode[], id: number): MenuTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }

    if (node.children.length > 0) {
      const found = findMenuNodeById(node.children, id);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

export function collectMenuNodesByLevel(
  nodes: MenuTreeNode[],
  targetLevel: MenuNivel,
  currentLevel: MenuNivel = 0
): MenuTreeNode[] {
  const result: MenuTreeNode[] = [];

  for (const node of nodes) {
    if (currentLevel === targetLevel) {
      result.push(node);
    }

    if (node.children.length > 0 && currentLevel < 2) {
      result.push(
        ...collectMenuNodesByLevel(
          node.children,
          targetLevel,
          (currentLevel + 1) as MenuNivel
        )
      );
    }
  }

  return result;
}

export function mergeMenuAccessToTree(
  nodes: MenuTreeNode[],
  accessMap: Map<number, number>
): MenuTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    acceso: accessMap.has(node.id) ? accessMap.get(node.id)! : 0,
    children: mergeMenuAccessToTree(node.children, accessMap),
  }));
}

export function createExpandedMenuSet(nodes: MenuTreeNode[]): Set<number> {
  const expanded = new Set<number>();

  flattenMenuTree(nodes).forEach((node) => {
    if (node.children.length > 0) {
      expanded.add(node.id);
    }
  });

  return expanded;
}
