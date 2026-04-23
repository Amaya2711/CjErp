import type React from "react";
import type { MenuTreeNode } from "../utils/menuTree";

type MenuTreeProps = {
  nodes: MenuTreeNode[];
  selectedIds: Set<number>;
  expandedIds: Set<number>;
  onToggleSelected: (node: MenuTreeNode, checked: boolean) => void;
  onToggleExpanded: (id: number) => void;
  onToggleAcceso?: (node: MenuTreeNode, checked: boolean) => void;
  level?: number;
};

type MenuTreeItemProps = {
  node: MenuTreeNode;
  selectedIds: Set<number>;
  expandedIds: Set<number>;
  onToggleSelected: (node: MenuTreeNode, checked: boolean) => void;
  onToggleExpanded: (id: number) => void;
  onToggleAcceso?: (node: MenuTreeNode, checked: boolean) => void;
  level: number;
};

function MenuTreeItem({
  node,
  selectedIds,
  expandedIds,
  onToggleSelected,
  onToggleExpanded,
  onToggleAcceso,
  level,
}: MenuTreeItemProps) {
  const hasChildren = node.children.length > 0;
  const expanded = expandedIds.has(node.id);
  const checked = selectedIds.has(node.id);
  const showAccessToggle = Boolean(onToggleAcceso && node.path);

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
          onChange={(event) => onToggleSelected(node, event.target.checked)}
        />

        <div style={styles.treeLabelBox}>
          <span style={styles.treeLabel}>
            {node.label}
            {showAccessToggle ? (
              <input
                type="checkbox"
                style={styles.accessCheckbox}
                disabled={!checked}
                checked={Boolean(node.acceso)}
                onChange={(event) => onToggleAcceso?.(node, event.target.checked)}
              />
            ) : null}
          </span>
          {node.path ? <span style={styles.treePath}>{node.path}</span> : null}
        </div>
      </div>

      {hasChildren && expanded ? (
        <MenuTree
          nodes={node.children}
          selectedIds={selectedIds}
          expandedIds={expandedIds}
          onToggleSelected={onToggleSelected}
          onToggleExpanded={onToggleExpanded}
          onToggleAcceso={onToggleAcceso}
          level={level + 1}
        />
      ) : null}
    </div>
  );
}

export function MenuTree({
  nodes,
  selectedIds,
  expandedIds,
  onToggleSelected,
  onToggleExpanded,
  onToggleAcceso,
  level = 0,
}: MenuTreeProps) {
  return (
    <div>
      {nodes.map((node) => (
        <MenuTreeItem
          key={node.id}
          node={node}
          selectedIds={selectedIds}
          expandedIds={expandedIds}
          onToggleSelected={onToggleSelected}
          onToggleExpanded={onToggleExpanded}
          onToggleAcceso={onToggleAcceso}
          level={level}
        />
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  treeItemRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minHeight: 38,
  },
  treeToggleBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    fontWeight: 700,
    cursor: "pointer",
  },
  treeTogglePlaceholder: {
    width: 28,
    height: 28,
  },
  treeLabelBox: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  treeLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "#0F172A",
    fontSize: 14,
    fontWeight: 600,
  },
  treePath: {
    color: "#64748B",
    fontSize: 12,
  },
  accessCheckbox: {
    marginLeft: 8,
  },
};
