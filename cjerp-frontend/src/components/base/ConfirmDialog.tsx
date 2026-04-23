import type React from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
  destructive = false,
}: ConfirmDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.dialog}>
        <h3 style={styles.title}>{title}</h3>
        <div style={styles.message}>{message}</div>
        <div style={styles.actions}>
          <button type="button" style={styles.cancelButton} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            style={{
              ...styles.confirmButton,
              ...(destructive ? styles.destructiveButton : undefined),
            }}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
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
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: 24,
  },
  dialog: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    background: "#FFFFFF",
    padding: 24,
    boxShadow: "0 12px 30px rgba(15,23,42,0.18)",
  },
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
    color: "#0F172A",
  },
  message: {
    marginTop: 12,
    fontSize: 14,
    color: "#475569",
    lineHeight: 1.5,
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 20,
  },
  cancelButton: {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    padding: "10px 16px",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 600,
  },
  confirmButton: {
    border: "none",
    background: "#1D4ED8",
    color: "#FFFFFF",
    padding: "10px 16px",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 700,
  },
  destructiveButton: {
    background: "#DC2626",
  },
};
