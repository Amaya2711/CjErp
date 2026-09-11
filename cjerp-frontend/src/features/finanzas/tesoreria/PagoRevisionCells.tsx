import { useRef, useState } from "react";
import { Eye, LoaderCircle, Pencil, Save, X } from "lucide-react";
import { crearItemsTesoreria, descargarFacturaRevision, guardarRevisionTesoreria } from "../../../api/pagoTesoreriaService";
import type { PagoCatalogos, PagoOpcion, PagoRevisionPermisos, PagoRevisionRequest, PagoTesoreriaRow } from "../../../api/pagoTesoreriaService";
import { getHttpErrorMessage } from "../../../utils/httpError";
import { buildSharePointUrl } from "../../../utils/sharepoint";

export function FacturaLink({ referencia, correlativo }: { referencia: string | null; correlativo: number }) {
  const raw = referencia?.trim();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abrir = async () => {
    if (!raw) return;
    setError("");
    if (!/^\d+$/.test(raw)) {
      if (/^[a-z][a-z\d+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) {
        setError("Ruta de factura inválida."); return;
      }
      window.open(buildSharePointUrl(raw), "_blank", "noopener,noreferrer");
      return;
    }
    const tab = window.open("", "_blank");
    setLoading(true);
    try {
      const archivo = await descargarFacturaRevision(correlativo);
      const url = URL.createObjectURL(archivo);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      tab?.close();
      setError(getHttpErrorMessage(e, "No se pudo descargar la factura."));
    } finally { setLoading(false); }
  };
  return <span className="pt-view-factura">
    <button type="button" title={raw ? "Ver factura" : "Sin factura adjunta"}
      aria-label={raw ? `Ver factura del recibo ${correlativo}` : `El recibo ${correlativo} no tiene factura adjunta`}
      disabled={!raw || loading} onClick={() => void abrir()}>
      {loading ? <LoaderCircle className="pt-spin" size={16} /> : <Eye size={16} />}
    </button>
    {error && <small role="alert">{error}</small>}
  </span>;
}

export default function PagoRevisionCells({ row, catalogos, permisos, disabled, onEditing, onSaved }: {
  row: PagoTesoreriaRow;
  catalogos: PagoCatalogos;
  permisos: PagoRevisionPermisos;
  disabled: boolean;
  onEditing: (editing: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<PagoRevisionRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const label = (options: PagoOpcion[], id: number | null) => options.find(o => o.id === id)?.nombre ?? (id == null ? "Sin dato" : String(id));
  const edit = () => {
    setDraft({ item: crearItemsTesoreria([row])[0], idAnticipo: row.idAnticipo,
      nroOperacion: row.nroOperacion, idComprobante: row.idComprobante, idTipoPago: row.idTipoPago,
      imgFactura: row.imgFactura, estado: row.estado, confirmarCambioEstado: false });
    setError(""); onEditing(true);
  };
  const cancel = () => { setDraft(null); setError(""); onEditing(false); };
  const select = (field: "idAnticipo" | "idComprobante" | "idTipoPago" | "estado", title: string, options: PagoOpcion[], allowed = true) => {
    if (!draft || !allowed) return label(options, row[field]);
    const value = draft[field];
    return <select aria-label={`${title} del recibo ${row.correlativo}`} disabled={busy}
      value={value ?? ""} onChange={e => setDraft({ ...draft, [field]: Number(e.target.value), confirmarCambioEstado: false })}>
      {!options.some(o => o.id === value) && <option value={value ?? ""} disabled>{label(options, value)}</option>}
      {options.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
    </select>;
  };
  const save = async () => {
    if (!draft || submitting.current) return;
    if (draft.estado !== row.estado && !draft.confirmarCambioEstado) {
      setError("Confirme el cambio de estado antes de guardar."); return;
    }
    submitting.current = true; setBusy(true); setError("");
    try {
      await guardarRevisionTesoreria(draft);
      setDraft(null); onEditing(false);
      await onSaved();
    } catch (e) { setError(getHttpErrorMessage(e, "No se pudo guardar el recibo.")); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <>
    <td className="pt-revision-cell">{select("idAnticipo", "Anticipo", catalogos.anticipos)}</td>
    <td className="pt-revision-cell">{draft && permisos.puedeEditar
      ? <input aria-label={`NroOperacion del recibo ${row.correlativo}`} disabled={busy} maxLength={50}
          value={draft.nroOperacion ?? ""} onChange={e => setDraft({ ...draft, nroOperacion: e.target.value })} />
      : row.nroOperacion || "—"}</td>
    <td className="pt-revision-cell">{select("idComprobante", "Comprobante", catalogos.comprobantes)}</td>
    <td className="pt-revision-cell">{select("idTipoPago", "TipoPago", catalogos.tiposPago)}</td>
    <td className="pt-revision-actions">{draft ? <>
      <button type="button" className="pt-primary" title="Guardar cambios" aria-label={`Guardar cambios del recibo ${row.correlativo}`}
        disabled={busy} onClick={() => void save()}>{busy ? <LoaderCircle className="pt-spin" size={16} /> : <Save size={16} />}</button>
      <button type="button" title="Cancelar edición" aria-label={`Cancelar edición del recibo ${row.correlativo}`}
        disabled={busy} onClick={cancel}><X size={16} /></button>
    </> : <button type="button" title="Editar recibo" aria-label={`Editar recibo ${row.correlativo}`}
      disabled={disabled || !permisos.puedeEditar || !row.version} onClick={edit}><Pencil size={16} /></button>}
      {error && <p role="alert" className="pt-inline-alert">{error}</p>}
    </td>
  </>;
}
