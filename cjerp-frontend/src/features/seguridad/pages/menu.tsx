import { useEffect, useMemo, useState } from "react";
import {
  menuService,
  type MenuDto,
} from "../services/menuService";

type MenuNode = {
  id: number;
  label: string;
  path?: string;
  parentId: number | null;
  orden: number;
  children: MenuNode[];
};

type MenuNivel = 0 | 1 | 2;

type MenuTreeItemProps = {
  node: MenuNode;
  selectedIds: Set<number>;
  expandedIds: Set<number>;
  onToggleSelected: (node: MenuNode, checked: boolean) => void;
  onToggleExpanded: (id: number) => void;
  level: number;
};

function buildTree(items: MenuDto[]): MenuNode[] {
  const map = new Map<number, MenuNode>();
  const roots: MenuNode[] = [];

  items.forEach((item) => {
    map.set(item.idMenu, {
      id: item.idMenu,
      label: item.nombreMenu,
      path: item.ruta ?? undefined,
      parentId: item.idMenuPadre ?? null,
      orden: item.ordenMenu,
      children: [],
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

function findNodeById(nodes: MenuNode[], id: number): MenuNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }

    if (node.children.length > 0) {
      const found = findNodeById(node.children, id);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function collectNodesByLevel(
  nodes: MenuNode[],
  targetLevel: MenuNivel,
  currentLevel: MenuNivel = 0
): MenuNode[] {
  const result: MenuNode[] = [];

  for (const node of nodes) {
    if (currentLevel === targetLevel) {
      result.push(node);
    }

    if (node.children.length > 0 && currentLevel < 2) {
      result.push(
        ...collectNodesByLevel(
          node.children,
          targetLevel,
          (currentLevel + 1) as MenuNivel
        )
      );
    }
  }

  return result;
}

function MenuTreeItem({
  node,
  selectedIds,
  expandedIds,
  onToggleSelected,
  onToggleExpanded,
  level,
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
          <span style={styles.treeLabel}>{node.label}</span>
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
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SeguridadMenuPage() {
  const [cargando, setCargando] = useState(false);
  const [creandoNodo, setCreandoNodo] = useState(false);
  const [mostrarCrearNodo, setMostrarCrearNodo] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const [nuevoNombreMenu, setNuevoNombreMenu] = useState("");
  const [nuevoNivel, setNuevoNivel] = useState<MenuNivel>(0);
  const [nuevoPadreId, setNuevoPadreId] = useState<number | "">("");
  const [nuevaRuta, setNuevaRuta] = useState("");
  const [nuevoOrdenMenu, setNuevoOrdenMenu] = useState(0);

  const [menuBase, setMenuBase] = useState<MenuNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const nodosNivelPrincipal = useMemo(() => collectNodesByLevel(menuBase, 0), [menuBase]);
  const nodosNivelSecundario = useMemo(() => collectNodesByLevel(menuBase, 1), [menuBase]);

  const opcionesPadre = useMemo(() => {
    if (nuevoNivel === 1) {
      return nodosNivelPrincipal;
    }

    if (nuevoNivel === 2) {
      return nodosNivelSecundario;
    }

    return [];
  }, [nuevoNivel, nodosNivelPrincipal, nodosNivelSecundario]);

  const totalAsignados = useMemo(() => selectedIds.size, [selectedIds]);

  useEffect(() => {
    void cargarDatosIniciales();
  }, []);

  useEffect(() => {
    setNuevoPadreId("");
  }, [nuevoNivel]);

  useEffect(() => {
    const getSiguienteOrden = () => {
      if (nuevoNivel === 0) {
        const maxOrden = menuBase.reduce((max, node) => Math.max(max, node.orden || 0), 0);
        return maxOrden + 1;
      }

      if (!nuevoPadreId) {
        return 0;
      }

      const parentNode = findNodeById(menuBase, Number(nuevoPadreId));
      if (!parentNode) {
        return 0;
      }

      const maxOrden = parentNode.children.reduce(
        (max, child) => Math.max(max, child.orden || 0),
        0
      );
      return maxOrden + 1;
    };

    setNuevoOrdenMenu(getSiguienteOrden());
  }, [menuBase, nuevoNivel, nuevoPadreId]);

  const cargarDatosIniciales = async () => {
    try {
      setCargando(true);
      setError("");
      setMensaje("");

      const menuData = await menuService.obtenerCompleto();

      const menuTree = buildTree(menuData);
      const siguienteOrdenPrincipal =
        menuData
          .filter((menu) => menu.idMenuPadre == null)
          .reduce((max, menu) => Math.max(max, menu.ordenMenu || 0), 0) + 1;

      setNuevoOrdenMenu(siguienteOrdenPrincipal);
      setMenuBase(menuTree);

      const allExpanded = new Set<number>();
      flattenTree(menuTree).forEach((node: MenuNode) => {
        if (node.children.length > 0) {
          allExpanded.add(node.id);
        }
      });
      setExpandedIds(allExpanded);
    } catch (err) {
      console.error(err);
      setError("No se pudo cargar el menú.");
    } finally {
      setCargando(false);
    }
  };

  const recargar = async () => {
    await cargarDatosIniciales();
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

  const crearNodoMenu = async () => {
    const nombre = nuevoNombreMenu.trim();

    if (!nombre) {
      setError("Debe ingresar el nombre del menú.");
      setMensaje("");
      return;
    }

    if (nuevoNivel > 0 && !nuevoPadreId) {
      setError("Debe seleccionar el nodo padre.");
      setMensaje("");
      return;
    }

    try {
      setCreandoNodo(true);
      setError("");
      setMensaje("");

      await menuService.crearNodo({
        nombreMenu: nombre,
        idMenuPadre: nuevoNivel === 0 ? undefined : Number(nuevoPadreId),
        ruta: nuevaRuta.trim() || undefined,
        codigoMenu: nuevoNivel === 0 ? nombre.toUpperCase() : undefined,
        icono: undefined,
        ordenMenu: Number.isFinite(nuevoOrdenMenu) ? nuevoOrdenMenu : 0,
        esVisible: true,
        esActivo: true,
      });

      setNuevoNombreMenu("");
      setNuevaRuta("");

      await recargar();
      setMensaje("Nodo creado correctamente.");
    } catch (err) {
      console.error(err);
      const errorMessage =
        err instanceof Error && err.message
          ? err.message
          : "No se pudo crear el nodo.";
      setError(errorMessage);
      setMensaje("");
    } finally {
      setCreandoNodo(false);
    }
  };

  const cerrarPanelCrearNodo = () => {
    setMostrarCrearNodo(false);
  };

  const menuVisual = useMemo(() => cloneDeep(menuBase), [menuBase]);

  return (
    <div style={styles.page}>
      {cargando ? <div style={styles.loadingCard}>Cargando información...</div> : null}
      {mensaje ? <div style={styles.successBox}>{mensaje}</div> : null}
      {error ? <div style={styles.errorBox}>{error}</div> : null}

      <div style={styles.treeCard}>
        <div style={styles.treeHeader}>
          <h2 style={styles.treeTitle}>Árbol de menú</h2>
          <div style={{...styles.treeHeaderActions, flexWrap: 'wrap'}}>
            <button
              type="button"
              onClick={() => setMostrarCrearNodo(true)}
              style={{
                ...styles.actionBtn,
                background: '#1976d2',
                color: '#fff',
                fontWeight: 700,
                fontSize: 15,
                padding: '0 18px',
                marginRight: 12,
                minWidth: 110,
                order: -1,
                boxShadow: '0 2px 8px rgba(25,118,210,0.10)'
              }}
              title="Nuevo nodo"
              aria-label="Nuevo nodo"
            >
              + Nodo
            </button>
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
                level={0}
              />
            ))}
          </div>
        )}
      </div>

      {mostrarCrearNodo && (
        <div style={styles.overlay}>
          <div style={styles.sidePanel}>
            <div style={styles.sidePanelHeader}>
              <div>
                <h2 style={styles.sideTitle}>Nuevo nodo de menú</h2>
                <p style={styles.sideSubtitle}>
                  Complete la información del nodo.
                </p>
              </div>
              <button style={styles.closeButton} onClick={cerrarPanelCrearNodo}>
                ×
              </button>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Nivel</label>
              <select
                value={nuevoNivel}
                onChange={(e) => setNuevoNivel(Number(e.target.value) as MenuNivel)}
                style={styles.select}
                disabled={cargando || creandoNodo}
              >
                <option value={0}>Principal</option>
                <option value={1}>Secundario</option>
                <option value={2}>Tercer nivel</option>
              </select>
            </div>
            {nuevoNivel > 0 && (
              <div style={styles.formGroup}>
                <label style={styles.label}>Nodo padre</label>
                <select
                  value={nuevoPadreId}
                  onChange={(e) => setNuevoPadreId(e.target.value ? Number(e.target.value) : "")}
                  style={styles.select}
                  disabled={cargando || creandoNodo || opcionesPadre.length === 0}
                >
                  <option value="">Seleccione</option>
                  {opcionesPadre.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div style={styles.formGroup}>
              <label style={styles.label}>Nombre</label>
              <input
                type="text"
                value={nuevoNombreMenu}
                onChange={(e) => setNuevoNombreMenu(e.target.value)}
                style={styles.select}
                disabled={cargando || creandoNodo}
                placeholder="Ej. Seguridad"
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Ruta (opcional)</label>
              <input
                type="text"
                value={nuevaRuta}
                onChange={(e) => setNuevaRuta(e.target.value)}
                style={styles.select}
                disabled={cargando || creandoNodo}
                placeholder="Ej. /seguridad/usuarios"
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Orden</label>
              <input
                type="number"
                min={0}
                value={nuevoOrdenMenu}
                onChange={(e) => setNuevoOrdenMenu(Number(e.target.value) || 0)}
                style={styles.select}
                disabled={cargando || creandoNodo}
              />
            </div>
            <div style={styles.panelActions}>
              <button style={styles.secondaryBtn} onClick={cerrarPanelCrearNodo}>
                Cancelar
              </button>
              <button
                style={{
                  ...styles.primaryBtn,
                  opacity: creandoNodo || cargando || (nuevoNivel > 0 && !nuevoPadreId) ? 0.65 : 1,
                  cursor:
                    creandoNodo || cargando || (nuevoNivel > 0 && !nuevoPadreId)
                      ? "not-allowed"
                      : "pointer",
                }}
                onClick={() => void crearNodoMenu()}
                disabled={creandoNodo || cargando || (nuevoNivel > 0 && !nuevoPadreId)}
              >
                {creandoNodo ? "Creando..." : "Crear nodo"}
              </button>
            </div>
          </div>
        </div>
      )}
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
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.35)",
    display: "flex",
    justifyContent: "flex-end",
    zIndex: 1300,
  },
  sidePanel: {
    width: 420,
    maxWidth: "100%",
    height: "100%",
    background: "#FFFFFF",
    boxShadow: "-8px 0 24px rgba(0,0,0,0.12)",
    padding: 24,
    boxSizing: "border-box",
    overflowY: "auto",
  },
  sidePanelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 24,
  },
  sideTitle: {
    margin: 0,
    fontSize: 24,
    color: "#17143A",
  },
  sideSubtitle: {
    marginTop: 8,
    marginBottom: 0,
    color: "#6B7280",
    fontSize: 14,
  },
  closeButton: {
    border: "none",
    background: "#F3F4F6",
    color: "#17143A",
    width: 34,
    height: 34,
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 22,
    lineHeight: "22px",
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 18,
  },
  panelActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 28,
  },
};
