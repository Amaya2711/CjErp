import { useEffect, useState } from "react";
import type React from "react";

type Props = {
  open: boolean;
  descripcion: React.ReactNode;
  procesando?: boolean;
  onConfirm: (motivo: string) => void;
  onCancel: () => void;
};

/** Popup "Motivo del rechazo" (mismo aspecto que el de órdenes de compra): el motivo es obligatorio. */
export default function MotivoRechazoDialog({ open, descripcion, procesando = false, onConfirm, onCancel }: Props) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setMotivo("");
      setError("");
    }
  }, [open]);

  if (!open) return null;

  const confirmar = () => {
    if (!motivo.trim()) return setError("Debe ingresar el motivo del rechazo.");
    onConfirm(motivo.trim());
  };

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-label="Motivo del rechazo">
      <div style={styles.card}>
        <h3 style={{ marginTop: 0, marginBottom: 12, color: "#17143A" }}>Motivo del rechazo</h3>
        <p style={{ marginTop: 0, color: "#4B5563", lineHeight: 1.6 }}>{descripcion}</p>
        <textarea
          autoFocus
          value={motivo}
          onChange={(e) => {
            setMotivo(e.target.value);
            if (error) setError("");
          }}
          placeholder="Ingrese el motivo del rechazo"
          rows={5}
          maxLength={500}
          style={styles.textarea}
        />
        {error ? <div role="alert" style={styles.error}>{error}</div> : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
          <button type="button" style={styles.cancel} onClick={onCancel} disabled={procesando}>Cancelar</button>
          <button type="button" style={styles.reject} onClick={confirmar} disabled={procesando}>
            {procesando ? "Rechazando..." : "Rechazar"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3101 },
  card: { width: 480, maxWidth: "calc(100% - 24px)", background: "#FFFFFF", borderRadius: 16, padding: 24, boxShadow: "0 12px 28px rgba(0,0,0,0.16)" },
  textarea: { width: "100%", boxSizing: "border-box", border: "1px solid #CBD5E1", borderRadius: 10, padding: 10, fontSize: 14, fontFamily: "inherit", resize: "vertical" },
  error: { marginTop: 12, padding: "8px 12px", borderRadius: 8, background: "#FEE2E2", color: "#991B1B", fontSize: 13 },
  cancel: { border: "1px solid #CBD5E1", background: "#FFFFFF", color: "#0F172A", padding: "10px 16px", borderRadius: 10, cursor: "pointer", fontWeight: 600 },
  reject: { border: "none", background: "#DC2626", color: "#FFFFFF", padding: "10px 16px", borderRadius: 10, cursor: "pointer", fontWeight: 700 },
};
