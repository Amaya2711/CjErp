import { useEffect, useRef, useState } from "react";
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

const borradorDesde = (row: PagoTesoreriaRow): PagoRevisionRequest => ({
  item: crearItemsTesoreria([row])[0], idAnticipo: row.idAnticipo,
  nroOperacion: row.nroOperacion, idComprobante: row.idComprobante, idTipoPago: row.idTipoPago,
  imgFactura: row.imgFactura, estado: row.estado, confirmarCambioEstado: false,
});

/** Valores ya guardados de un recibo; `version` es la nueva huella para encadenar ediciones sin recargar. */
export type PagoRevisionGuardado = Pick<PagoTesoreriaRow, "idAnticipo" | "nroOperacion" | "idComprobante" | "idTipoPago" | "estado"> & { version?: string };

/**
 * Celdas editables de Revisión. La fila entra en edición cuando el padre pone `editing` en true
 * (el lápiz activa todas las filas seleccionadas). Cada cambio se guarda al instante: los combos al
 * cambiar y el Nro. de operación al salir del campo o con Enter. El padre actualiza la fila en
 * memoria con `onSaved`, sin recargar la lista ni mostrar mensajes.
 */
export default function PagoRevisionCells({ row, catalogos, permisos, disabled, editing, onStartEdit, onStopEdit, onSaved }: {
  row: PagoTesoreriaRow;
  catalogos: PagoCatalogos;
  permisos: PagoRevisionPermisos;
  disabled: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onSaved: (guardado: PagoRevisionGuardado) => void;
}) {
  const [draft, setDraft] = useState<PagoRevisionRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const label = (options: PagoOpcion[], id: number | null) => options.find(o => o.id === id)?.nombre ?? (id == null ? "Sin dato" : String(id));
  // Al entrar en edición se parte de los valores actuales del recibo; al salir se descarta el borrador.
  useEffect(() => {
    if (editing) { setDraft(actual => actual ?? borradorDesde(row)); setError(""); }
    else { setDraft(null); setError(""); }
  }, [editing]);
  const active = editing ? draft : null;
  // Guarda el borrador. La versión del recibo se toma de la fila actual para encadenar guardados.
  const persist = async (next: PagoRevisionRequest, closeAfter: boolean) => {
    if (submitting.current) return;
    if (next.estado !== row.estado && !next.confirmarCambioEstado) {
      setError("Confirme el cambio de estado antes de guardar."); return;
    }
    submitting.current = true; setBusy(true); setError("");
    try {
      const respuesta = await guardarRevisionTesoreria({ ...next, item: crearItemsTesoreria([row])[0] });
      onSaved({ idAnticipo: next.idAnticipo, nroOperacion: next.nroOperacion ?? "", idComprobante: next.idComprobante,
        idTipoPago: next.idTipoPago, estado: next.estado, version: respuesta?.version });
      if (closeAfter) { setDraft(null); onStopEdit(); }
    } catch (e) {
      setError(getHttpErrorMessage(e, "No se pudo guardar el recibo."));
      setDraft(borradorDesde(row)); // vuelve al valor que sigue vigente
    } finally { submitting.current = false; setBusy(false); }
  };
  const select = (field: "idAnticipo" | "idComprobante" | "idTipoPago" | "estado", title: string, options: PagoOpcion[], allowed = true) => {
    if (!active || !allowed) return label(options, row[field]);
    const value = active[field];
    return <select aria-label={`${title} del recibo ${row.correlativo}`} disabled={busy}
      value={value ?? ""} onChange={e => {
        const next = { ...active, [field]: Number(e.target.value), confirmarCambioEstado: false };
        setDraft(next);
        if (next[field] !== row[field]) void persist(next, false);
      }}>
      {!options.some(o => o.id === value) && <option value={value ?? ""} disabled>{label(options, value)}</option>}
      {options.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
    </select>;
  };
  const guardarOperacion = () => {
    if (active && (active.nroOperacion ?? "") !== (row.nroOperacion ?? "")) void persist(active, false);
  };
  return <>
    <td className="pt-revision-cell">{select("idAnticipo", "Anticipo", catalogos.anticipos)}</td>
    <td className="pt-revision-cell">{active && permisos.puedeEditar
      ? <input aria-label={`NroOperacion del recibo ${row.correlativo}`} disabled={busy} maxLength={50}
          value={active.nroOperacion ?? ""} onChange={e => setDraft({ ...active, nroOperacion: e.target.value })}
          onBlur={guardarOperacion} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      : row.nroOperacion || "—"}</td>
    <td className="pt-revision-cell">{select("idComprobante", "Comprobante", catalogos.comprobantes)}</td>
    <td className="pt-revision-cell">{select("idTipoPago", "TipoPago", catalogos.tiposPago)}</td>
    <td className="pt-revision-actions">{active ? <>
      <button type="button" className="pt-primary" title="Guardar y cerrar edición" aria-label={`Guardar cambios del recibo ${row.correlativo}`}
        disabled={busy} onClick={() => void persist(active, true)}>{busy ? <LoaderCircle className="pt-spin" size={16} /> : <Save size={16} />}</button>
      <button type="button" title="Cerrar edición" aria-label={`Cerrar edición del recibo ${row.correlativo}`}
        disabled={busy} onMouseDown={e => e.preventDefault()} onClick={onStopEdit}><X size={16} /></button>
    </> : <button type="button" title="Editar recibo (si hay recibos seleccionados, se editan todos)" aria-label={`Editar recibo ${row.correlativo}`}
      disabled={disabled || !permisos.puedeEditar || !row.version} onClick={onStartEdit}><Pencil size={16} /></button>}
      {error && <p role="alert" className="pt-inline-alert">{error}</p>}
    </td>
  </>;
}
