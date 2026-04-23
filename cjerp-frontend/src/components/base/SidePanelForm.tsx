import type React from "react";

type SidePanelFormProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export default function SidePanelForm({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
}: SidePanelFormProps) {
  if (!open) {
    return null;
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>{title}</h2>
            {subtitle ? <p style={styles.subtitle}>{subtitle}</p> : null}
          </div>
          <button type="button" style={styles.closeButton} onClick={onClose}>
            x
          </button>
        </div>

        <div style={styles.content}>{children}</div>
        {footer ? <div style={styles.footer}>{footer}</div> : null}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.45)",
    display: "flex",
    justifyContent: "flex-end",
    zIndex: 1000,
  },
  panel: {
    width: "100%",
    maxWidth: 460,
    height: "100%",
    background: "#FFFFFF",
    boxShadow: "-8px 0 24px rgba(15,23,42,0.18)",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    padding: 20,
    borderBottom: "1px solid #E5E7EB",
  },
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
    color: "#0F172A",
  },
  subtitle: {
    margin: "6px 0 0",
    fontSize: 14,
    color: "#64748B",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    cursor: "pointer",
    fontWeight: 700,
  },
  content: {
    flex: 1,
    overflowY: "auto",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 12,
    padding: 20,
    borderTop: "1px solid #E5E7EB",
  },
};
