import { useEffect, useMemo, useState } from "react";
import {
  menuService,
  type MenuDto,
} from "../../features/seguridad/services/menuService";
import {
  rolesService,
  type RolDto,
} from "../../features/seguridad/services/rolesService";
import {
  perfilesService,
  type PerfilDto,
} from "../../features/seguridad/services/perfilesService";
import { getHttpErrorMessage } from "../../utils/httpError";

type RolOption = {
  id: number;
  nombre: string;
};

type MenuNode = {
  id: number;
  label: string;
  path?: string;
  parentId: number | null;
  orden: number;
  children: MenuNode[];
  acceso: number;
};

type MenuTreeItemProps = {
  node: MenuNode;
  selectedIds: Set<number>;
  expandedIds: Set<number>;
  onToggleSelected: (node: MenuNode, checked: boolean) => void;
  onToggleExpanded: (id: number) => void;
  onToggleAcceso: (node: MenuNode, checked: boolean) => void;
  level: number;
};

function getMenuAcceso(item: MenuDto): number {
  if (typeof item.acceso === "boolean") {
    return item.acceso ? 1 : 0;
  }

  if (typeof item.acceso === "number") {
    return item.acceso === 1 ? 1 : 0;
  }

  return 0;
}


function buildTree(items: MenuDto[]): MenuNode[] {
  const map = new Map<number, MenuNode>();
  const roots: MenuNode[] = [];

  items.forEach((item) => {
    // Depuración: mostrar el item recibido y el valor de acceso
    const accesoValue = getMenuAcceso(item);

    map.set(item.idMenu, {
      id: item.idMenu,
      label: item.nombreMenu,
      path: item.ruta ?? undefined,
      parentId: item.idMenuPadre ?? null,
      orden: item.ordenMenu,
      children: [],
      acceso: accesoValue,
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

  const sortRecursive = (nodes: MenuNode[]) => {
    nodes.sort((a, b) => a.label.localeCompare(b.label));
    nodes.forEach((node) => sortRecursive(node.children));
  };

  sortRecursive(roots);

  return roots;
}

function flattenTree(nodes: MenuNode[]): MenuNode[] {
  const result: MenuNode[] = [];

  const recorrer = (items: MenuNode[]) => {
    items.forEach((item) => {
      result.push(item);
      if (item.children.length > 0) {
        recorrer(item.children);
      }
    });
  };

  recorrer(nodes);
  return result;
}

function cloneDeep(nodes: MenuNode[]): MenuNode[] {
  return nodes.map((node) => ({
    ...node,
    children: cloneDeep(node.children),
  }));
}

function collectNodeAndChildrenIds(node: MenuNode): number[] {
  const ids: number[] = [node.id];

  node.children.forEach((child) => {
    ids.push(...collectNodeAndChildrenIds(child));
  });

  return ids;
}

function findParentChainIds(nodes: MenuNode[], targetId: number): number[] {
  const path: number[] = [];

  const buscar = (items: MenuNode[], parents: number[]): boolean => {
    for (const item of items) {
      if (item.id === targetId) {
        path.push(...parents);
        return true;
      }

      if (item.children.length > 0) {
        const found = buscar(item.children, [...parents, item.id]);
        if (found) return true;
      }
    }

    return false;
  };

  buscar(nodes, []);
  return path;
}

function MenuTreeItem({
  node,
  selectedIds,
  expandedIds,
  onToggleSelected,
  onToggleExpanded,
  level,
  onToggleAcceso,
}: MenuTreeItemProps) {
  const hasChildren = node.children.length > 0;
  const expanded = expandedIds.has(node.id);
  const checked = selectedIds.has(node.id);

  return (
    <div>
      <div
        style={{
          ...styles.treeItemRow,
          paddingLeft: `${level * 20}px`,
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggleExpanded(node.id)}
            style={styles.treeToggleBtn}
          >
            {expanded ? "-" : "+"}
          </button>
        ) : (
          <div style={styles.treeTogglePlaceholder} />
        )}

        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggleSelected(node, e.target.checked)}
        />

        <div style={styles.treeLabelBox}>
          <span style={styles.treeLabel}>
            {node.label}
            <input
              type="checkbox"
              style={{ marginLeft: 8 }}
              disabled={!checked || !node.path}
              checked={Boolean(node.acceso)}
              onChange={e => onToggleAcceso(node, e.target.checked)}
            />
          </span>
          {node.path ? <span style={styles.treePath}>{node.path}</span> : null}
        </div>
      </div>

      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <MenuTreeItem
              key={child.id}
              node={child}
              selectedIds={selectedIds}
              expandedIds={expandedIds}
              onToggleSelected={onToggleSelected}
              onToggleExpanded={onToggleExpanded}
              onToggleAcceso={onToggleAcceso}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PerfilRolMenuPage() {
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const [perfiles, setPerfiles] = useState<PerfilDto[]>([]);
  const [perfilId, setPerfilId] = useState<number | "">("");

  const [roles, setRoles] = useState<RolOption[]>([]);
  const [rolId, setRolId] = useState<number | "">("");

  const [menuBase, setMenuBase] = useState<MenuNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const totalAsignados = useMemo(() => selectedIds.size, [selectedIds]);

  useEffect(() => {
    void cargarDatosIniciales();
  }, []);

  const cargarDatosIniciales = async () => {
    try {
      setCargando(true);
      setError("");
      setMensaje("");

      const [perfilesResult, menuResult] = await Promise.allSettled([
        perfilesService.listarPerfiles(),
        menuService.obtenerCompleto(),
      ]);

      const perfilesData =
        perfilesResult.status === "fulfilled" ? perfilesResult.value : [];
      const menuData = menuResult.status === "fulfilled" ? menuResult.value : [];

      if (
        perfilesResult.status === "rejected" ||
        menuResult.status === "rejected"
      ) {
        setError("No se pudo cargar completamente perfiles y/o menú.");
      }

      const menuTree = buildTree(menuData);
      
      setPerfiles(perfilesData);
      setPerfilId("");
      setRoles([]);
      setRolId("");
      setMenuBase(menuTree);

      const allExpanded = new Set<number>();
      flattenTree(menuTree).forEach((node: MenuNode) => {
        if (node.children.length > 0) {
          allExpanded.add(node.id);
        }
      });
      setExpandedIds(allExpanded);
    } catch (err: unknown) {
      console.error(err);
      setError(getHttpErrorMessage(err, "No se pudieron cargar perfiles y menú."));
    } finally {
      setCargando(false);
    }
  };

  const cargarRolesPorPerfil = async (idPerfil: number) => {
    try {
      setCargando(true);
      setError("");
      setMensaje("");

      const rolesData = await rolesService.listarRolesPorPerfil(idPerfil);

      const rolesMapped: RolOption[] = rolesData.map((r: RolDto) => ({
        id: r.idRol,
        nombre: r.nombreRol,
      }));

      setRoles(rolesMapped);
      setRolId("");
      setSelectedIds(new Set());
    } catch (err: unknown) {
      console.error(err);
      setError(getHttpErrorMessage(err, "No se pudieron cargar los roles del perfil."));
      setRoles([]);
      setRolId("");
    } finally {
      setCargando(false);
    }
  };

  const handlePerfilChange = async (value: string) => {
    const idPerfil = value ? Number(value) : "";
    setPerfilId(idPerfil);

    if (idPerfil === "") {
      setRoles([]);
      setRolId("");
      setSelectedIds(new Set());
      return;
    }

    await cargarRolesPorPerfil(idPerfil);
  };

  // Fusiona los valores de acceso de los menús asignados en el árbol base
  function mergeAccesoToTree(nodes: MenuNode[], accesoMap: Map<number, number>): MenuNode[] {
    return nodes.map(node => {
      const newAcceso = accesoMap.has(node.id) ? accesoMap.get(node.id)! : 0;
      return {
        ...node,
        acceso: newAcceso,
        children: mergeAccesoToTree(node.children, accesoMap)
      };
    });
  }

  const cargarMenuAsignado = async (nuevoPerfilId: number, nuevoRolId: number) => {
    try {
      setCargando(true);
      setError("");
      setMensaje("");

      const asignados = await menuService.obtenerPorPerfilRol(nuevoPerfilId, nuevoRolId);
      const ids = new Set<number>(asignados.map((x: MenuDto) => x.idMenu));

      // Crear un Map para acceso por idMenu
      const accesoMap = new Map<number, number>();
      asignados.forEach(x => accesoMap.set(x.idMenu, Number(x.acceso)));

      // Actualizar el árbol base con los valores de acceso correctos
      setMenuBase(prev => mergeAccesoToTree(prev, accesoMap));

      setSelectedIds(ids);

      const expanded = new Set<number>(expandedIds);
      asignados.forEach((x: MenuDto) => {
        const parentChain = findParentChainIds(menuBase, x.idMenu);
        parentChain.forEach((id) => expanded.add(id));
      });
      setExpandedIds(expanded);
    } catch (err: unknown) {
      console.error(err);
      setError(getHttpErrorMessage(err, "No se pudo cargar el menú asignado al rol."));
      setSelectedIds(new Set());
    } finally {
      setCargando(false);
    }
  };

  const handleRolChange = async (value: string) => {
    const nuevoRolId = value ? Number(value) : "";
    setRolId(nuevoRolId);

    if (nuevoRolId === "") {
      setSelectedIds(new Set());
      return;
    }

    if (!perfilId) {
      setError("Debe seleccionar un perfil.");
      setSelectedIds(new Set());
      return;
    }

    await cargarMenuAsignado(Number(perfilId), nuevoRolId);
  };

  const recargar = async () => {
    const perfilActual = perfilId;
    const rolActual = rolId;

    await cargarDatosIniciales();

    if (!perfilActual || !rolActual) {
      return;
    }

    setPerfilId(perfilActual);
    await cargarRolesPorPerfil(Number(perfilActual));
    setRolId(rolActual);
    await cargarMenuAsignado(Number(perfilActual), Number(rolActual));
  };

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelected = (node: MenuNode, checked: boolean) => {
    const ids = collectNodeAndChildrenIds(node);
    const parentChain = findParentChainIds(menuBase, node.id);

    setSelectedIds((prev) => {
      const next = new Set(prev);

      if (checked) {
        ids.forEach((id) => next.add(id));
        parentChain.forEach((id) => next.add(id));
      } else {
        ids.forEach((id) => next.delete(id));
      }

      return next;
    });
  };

  const expandirTodo = () => {
    const next = new Set<number>();
    flattenTree(menuBase).forEach((node: MenuNode) => {
      if (node.children.length > 0) {
        next.add(node.id);
      }
    });
    setExpandedIds(next);
  };

  const colapsarTodo = () => {
    setExpandedIds(new Set());
  };

  const seleccionarTodo = () => {
    const next = new Set<number>();
    flattenTree(menuBase).forEach((node: MenuNode) => next.add(node.id));
    setSelectedIds(next);
  };

  const limpiarSeleccion = () => {
    setSelectedIds(new Set());
  };

  const guardarAsignacion = async () => {
    if (!perfilId) {
      setError("Debe seleccionar un perfil.");
      setMensaje("");
      return;
    }

    if (!rolId) {
      setError("Debe seleccionar un rol.");
      setMensaje("");
      return;
    }

    try {
      setGuardando(true);
      setError("");
      setMensaje("");

      // Construir el payload con idMenu y acceso
      const menusAsignados = getMenusAsignados();
      const payload = {
        idPerfil: Number(perfilId),
        idRol: Number(rolId),
        menus: menusAsignados // [{ idMenu, acceso }]
      };
      await menuService.guardarAsignacionMenuRol(payload);

      setMensaje("Asignación de menú guardada correctamente.");
    } catch (err: unknown) {
      console.error(err);
      setError(getHttpErrorMessage(err, "No se pudo guardar la asignación de menú."));
      setMensaje("");
    } finally {
      setGuardando(false);
    }
  };

    // menuVisual debe estar accesible en el scope de getMenusAsignados
  const menuVisual = useMemo(() => cloneDeep(menuBase), [menuBase]);

  // Devuelve los menús seleccionados con su campo acceso
  function getMenusAsignados() {
    // Busca el nodo en menuVisual para obtener el valor real de acceso
    const buscarNodo = (nodes: MenuNode[], id: number): MenuNode | undefined => {
      for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children.length > 0) {
          const found = buscarNodo(node.children, id);
          if (found) return found;
        }
      }
      return undefined;
    };
    return Array.from(selectedIds).map(idMenu => {
      const nodo = buscarNodo(menuVisual, idMenu);
      return { idMenu, acceso: !!(nodo && nodo.acceso) };
    });
  }

  // Cambia el valor de acceso en el árbol
  function handleToggleAcceso(target: MenuNode, checked: boolean) {
    const updateAcceso = (nodes: MenuNode[]): MenuNode[] =>
      nodes.map((node) =>
        node.id === target.id
          ? { ...node, acceso: checked ? 1 : 0 }
          : { ...node, children: updateAcceso(node.children) }
      );
    setMenuBase(updateAcceso(menuBase));
  }

  return (
    <div style={styles.page}>
      {/* Formulario y botón de nuevo nodo principal ocultos por requerimiento */}

      <div style={styles.filtersCard}>
        <div style={styles.filterInlineField}>
          <label style={styles.inlineLabel}>Perfil</label>
          <select
            value={perfilId}
            onChange={(e) => void handlePerfilChange(e.target.value)}
            style={styles.select}
            disabled={cargando}
          >
            <option value="">Seleccione</option>
            {perfiles.map((perfil) => (
              <option key={perfil.idPerfil} value={perfil.idPerfil}>
                {perfil.nombrePerfil}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.filterInlineField}>
          <label style={styles.inlineLabel}>Rol</label>
          <select
            value={rolId}
            onChange={(e) => void handleRolChange(e.target.value)}
            style={styles.select}
            disabled={!perfilId || cargando}
          >
            <option value="">Seleccione</option>
            {roles.map((rol) => (
              <option key={rol.id} value={rol.id}>
                {rol.nombre}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.buttonField}>
          <button
            type="button"
            onClick={() => void recargar()}
            style={styles.secondaryBtn}
            disabled={cargando}
          >
            Recargar
          </button>
        </div>

        <div style={styles.buttonField}>
          <button
            type="button"
            onClick={() => void guardarAsignacion()}
            disabled={!rolId || guardando || cargando}
            style={{
              ...styles.primaryBtn,
              opacity: !rolId || guardando || cargando ? 0.65 : 1,
              cursor: !rolId || guardando || cargando ? "not-allowed" : "pointer",
            }}
          >
            {guardando ? "Guardando..." : "Guardar asignación"}
          </button>
        </div>
      </div>

      {cargando ? <div style={styles.loadingCard}>Cargando información...</div> : null}
      {mensaje ? <div style={styles.successBox}>{mensaje}</div> : null}
      {error ? <div style={styles.errorBox}>{error}</div> : null}

      <div style={styles.treeCard}>
        <div style={styles.treeHeader}>
          <h2 style={styles.treeTitle}>Árbol de menú</h2>
          <div style={styles.treeHeaderActions}>
            <button
              type="button"
              onClick={expandirTodo}
              style={styles.actionBtn}
              title="Expandir todo"
              aria-label="Expandir todo"
            >
              +
            </button>
            <button
              type="button"
              onClick={colapsarTodo}
              style={styles.actionBtn}
              title="Colapsar todo"
              aria-label="Colapsar todo"
            >
              -
            </button>
            <button
              type="button"
              onClick={seleccionarTodo}
              style={styles.actionBtn}
              title="Seleccionar todo"
              aria-label="Seleccionar todo"
            >
              ✓
            </button>
            <button
              type="button"
              onClick={limpiarSeleccion}
              style={styles.actionBtn}
              title="Limpiar selección"
              aria-label="Limpiar selección"
            >
              ×
            </button>
            <div style={styles.totalText}>
              Total asignados: <span style={styles.totalValue}>{totalAsignados}</span>
            </div>
          </div>
        </div>

        {menuVisual.length === 0 ? (
          <div style={styles.emptyText}>No hay menús disponibles.</div>
        ) : (
          <div style={styles.treeContainer}>
            {menuVisual.map((node) => (
              <MenuTreeItem
                key={node.id}
                node={node}
                selectedIds={selectedIds}
                expandedIds={expandedIds}
                onToggleSelected={toggleSelected}
                onToggleExpanded={toggleExpanded}
                onToggleAcceso={handleToggleAcceso}
                level={0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    padding: 4,
    height: "100%",
    minHeight: 0,
    overflow: "hidden",
  },
  card: {
    background: "#FFFFFF",
    borderRadius: 16,
    border: "1px solid #E5E7EB",
    padding: 20,
    boxShadow: "0 8px 24px rgba(23,20,58,0.06)",
  },
  treeCard: {
    background: "#FFFFFF",
    borderRadius: 16,
    border: "1px solid #E5E7EB",
    padding: 20,
    boxShadow: "0 8px 24px rgba(23,20,58,0.06)",
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
  },
  title: {
    margin: 0,
    fontSize: 40,
    lineHeight: 1.1,
    fontWeight: 800,
    color: "#1E293B",
  },
  subtitle: {
    margin: "10px 0 0",
    fontSize: 26,
    color: "#475569",
  },
  filtersCard: {
    background: "#FFFFFF",
    borderRadius: 16,
    border: "1px solid #E5E7EB",
    padding: 16,
    boxShadow: "0 8px 24px rgba(23,20,58,0.04)",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    alignItems: "center",
  },
  filterInlineField: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  inlineLabel: {
    fontSize: 14,
    fontWeight: 700,
    color: "#334155",
    minWidth: 44,
    whiteSpace: "nowrap",
  },
  filterField: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
  },
  createGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    alignItems: "end",
  },
  createField: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
  },
  label: {
    fontSize: 14,
    fontWeight: 700,
    color: "#334155",
  },
  select: {
    width: "100%",
    minHeight: 40,
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    padding: "8px 10px",
    fontSize: 14,
    background: "#FFFFFF",
    color: "#0F172A",
  },
  buttonField: {
    display: "flex",
    alignItems: "center",
    minWidth: 0,
  },
  secondaryBtn: {
    width: "100%",
    minHeight: 40,
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    background: "#F8FAFC",
    color: "#334155",
    fontWeight: 700,
    cursor: "pointer",
  },
  primaryBtn: {
    width: "100%",
    minHeight: 40,
    borderRadius: 10,
    border: "none",
    background: "#17143A",
    color: "#FFFFFF",
    fontWeight: 700,
  },
  actionBtn: {
    width: 42,
    height: 34,
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#334155",
    fontWeight: 600,
    fontSize: 18,
    lineHeight: 1,
    padding: 0,
    cursor: "pointer",
  },
  totalText: {
    fontSize: 14,
    color: "#64748B",
    marginLeft: 8,
  },
  totalValue: {
    fontWeight: 800,
    color: "#0F172A",
  },
  loadingCard: {
    background: "#FFFFFF",
    borderRadius: 12,
    border: "1px solid #E5E7EB",
    padding: 14,
    color: "#64748B",
  },
  successBox: {
    borderRadius: 12,
    border: "1px solid #A7F3D0",
    background: "#ECFDF5",
    color: "#047857",
    padding: 12,
  },
  errorBox: {
    borderRadius: 12,
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C",
    padding: 12,
  },
  treeHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  treeHeaderActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginLeft: "auto",
  },
  treeTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    color: "#1E293B",
  },
  treeContainer: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
    paddingRight: 4,
  },
  emptyText: {
    fontSize: 14,
    color: "#64748B",
  },
  treeItemRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 0",
  },
  treeToggleBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#334155",
    fontSize: 14,
    cursor: "pointer",
  },
  treeTogglePlaceholder: {
    width: 28,
    height: 28,
  },
  treeLabelBox: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  treeLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "#0F172A",
  },
  treePath: {
    fontSize: 12,
    color: "#64748B",
  },
};

