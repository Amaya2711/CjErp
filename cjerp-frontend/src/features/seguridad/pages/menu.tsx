import { useEffect, useMemo, useState } from "react";
import AppCard from "../../../components/base/AppCard";
import AppStatusMessage from "../../../components/base/AppStatusMessage";
import {
  menuService,
} from "../services/menuService";
import { getHttpErrorMessage } from "../../../utils/httpError";
import { MenuTree } from "../components/MenuTree";
import {
  buildMenuTree,
  cloneMenuTree,
  collectMenuNodesByLevel,
  collectNodeAndChildrenIds,
  createExpandedMenuSet,
  findMenuNodeById,
  findParentChainIds,
  flattenMenuTree,
  type MenuNivel,
  type MenuTreeNode,
} from "../utils/menuTree";

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

  const [menuBase, setMenuBase] = useState<MenuTreeNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const nodosNivelPrincipal = useMemo(() => collectMenuNodesByLevel(menuBase, 0), [menuBase]);
  const nodosNivelSecundario = useMemo(() => collectMenuNodesByLevel(menuBase, 1), [menuBase]);

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

      const parentNode = findMenuNodeById(menuBase, Number(nuevoPadreId));
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

      const menuTree = buildMenuTree(menuData);
      const siguienteOrdenPrincipal =
        menuData
          .filter((menu) => menu.idMenuPadre == null)
          .reduce((max, menu) => Math.max(max, menu.ordenMenu || 0), 0) + 1;

      setNuevoOrdenMenu(siguienteOrdenPrincipal);
      setMenuBase(menuTree);

      setExpandedIds(createExpandedMenuSet(menuTree));
    } catch (err: unknown) {
      console.error(err);
      setError(getHttpErrorMessage(err, "No se pudo cargar el menú."));
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

  const toggleSelected = (node: MenuTreeNode, checked: boolean) => {
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
    flattenMenuTree(menuBase).forEach((node) => {
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
    flattenMenuTree(menuBase).forEach((node) => next.add(node.id));
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
    } catch (err: unknown) {
      console.error(err);
      setError(getHttpErrorMessage(err, "No se pudo crear el nodo."));
      setMensaje("");
    } finally {
      setCreandoNodo(false);
    }
  };

  const cerrarPanelCrearNodo = () => {
    setMostrarCrearNodo(false);
  };

  const menuVisual = useMemo(() => cloneMenuTree(menuBase), [menuBase]);

  return (
    <div style={styles.page}>
      {cargando ? <AppStatusMessage tone="info">Cargando información...</AppStatusMessage> : null}
      {mensaje ? <AppStatusMessage tone="success">{mensaje}</AppStatusMessage> : null}
      {error ? <AppStatusMessage tone="error">{error}</AppStatusMessage> : null}

      <AppCard style={styles.treeCard}>
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
            <MenuTree
              nodes={menuVisual}
              selectedIds={selectedIds}
              expandedIds={expandedIds}
              onToggleSelected={toggleSelected}
              onToggleExpanded={toggleExpanded}
            />
          </div>
        )}
      </AppCard>

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
