import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { PagoTesoreriaRow } from "../../../api/pagoTesoreriaService";
import { getHttpErrorMessage } from "../../../utils/httpError";

/**
 * Nro. de operación editable en Rendición: se guarda al perder el foco o con Enter
 * (mismo comportamiento que en Revisión). `onSave` rechaza si el servidor no acepta el cambio.
 */
export default function RendicionOperacionCell({ row, disabled, onSave }: {
  row: PagoTesoreriaRow;
  disabled: boolean;
  onSave: (row: PagoTesoreriaRow, nroOperacion: string) => Promise<void>;
}) {
  const actual = row.nroOperacion ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const value = draft ?? actual;

  if (disabled || !row.version) return <>{actual || "—"}</>;

  const guardar = async () => {
    const nuevo = value.trim();
    if (busy || nuevo === actual.trim()) { setDraft(null); return; }
    if (!nuevo) {
      setError("Ingrese el número de operación.");
      setDraft(null);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave(row, nuevo);
      setDraft(null);
    } catch (e) {
      setError(getHttpErrorMessage(e, "No se pudo guardar la operación."));
      setDraft(null); // vuelve al valor vigente
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="pt-revision-cell">
      <input
        aria-label={`NroOperacion del recibo ${row.correlativo}`}
        disabled={busy}
        maxLength={50}
        value={value}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void guardar()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { setDraft(null); setError(""); }
        }}
      />
      {busy && <LoaderCircle className="pt-spin" size={14} />}
      {error && <p role="alert" className="pt-inline-alert">{error}</p>}
    </span>
  );
}
