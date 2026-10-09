import { useRef, useState, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { crearItemsTesoreria, guardarRevisionTesoreria } from "../../../api/pagoTesoreriaService";
import type {
  PagoCatalogos,
  PagoOpcion,
  PagoRevisionPermisos,
  PagoRevisionRequest,
  PagoTesoreriaRow,
} from "../../../api/pagoTesoreriaService";
import { getHttpErrorMessage } from "../../../utils/httpError";
import { borradorDesde, type PagoRevisionGuardado } from "./PagoRevisionCells";

type CampoSelect = "idAnticipo" | "idComprobante" | "idTipoPago";

type Params = {
  catalogos: PagoCatalogos;
  permisos: PagoRevisionPermisos;
  rowKey: (row: PagoTesoreriaRow) => string;
  /** Bloquea la edición (p. ej. mientras otra operación está guardando). */
  disabled: boolean;
  onSaved: (row: PagoTesoreriaRow, guardado: PagoRevisionGuardado) => void;
};

type Borrador = { version: string; value: PagoRevisionRequest };

/**
 * Edición de Revisión directamente en las celdas de `DataGridPro`: Anticipo, Comprobante y TipoPago
 * se guardan al cambiar el combo; el Nro. de operación, al salir del campo o con Enter. No hay botón
 * Guardar ni modo edición: los campos están siempre activos para quien tenga permiso. El padre actualiza
 * la fila en memoria con `onSaved` (sin recargar la lista).
 *
 * Un borrador solo vale mientras la fila conserve la versión con la que se creó: al guardar o recargar,
 * la fila trae una versión nueva y el borrador se descarta solo.
 */
export function usePagoRevisionEditor({ catalogos, permisos, rowKey, disabled, onSaved }: Params) {
  const [drafts, setDrafts] = useState<Record<string, Borrador>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submitting = useRef<Set<string>>(new Set());

  const label = (options: PagoOpcion[], id: number | null) =>
    options.find((o) => o.id === id)?.nombre ?? (id == null ? "Sin dato" : String(id));

  const editable = (row: PagoTesoreriaRow) => permisos.puedeEditar && Boolean(row.version) && !disabled;
  const setError = (key: string, message: string) => setErrors((prev) => ({ ...prev, [key]: message }));
  const setBusyKey = (key: string, value: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
  const draftOf = (row: PagoTesoreriaRow): PagoRevisionRequest => {
    const stored = drafts[rowKey(row)];
    return stored && stored.version === row.version ? stored.value : borradorDesde(row);
  };
  const setDraft = (row: PagoTesoreriaRow, value: PagoRevisionRequest) =>
    setDrafts((prev) => ({ ...prev, [rowKey(row)]: { version: row.version, value } }));

  const persist = async (row: PagoTesoreriaRow, next: PagoRevisionRequest) => {
    const key = rowKey(row);
    if (submitting.current.has(key)) return;
    if (next.estado !== row.estado && !next.confirmarCambioEstado) {
      setError(key, "Confirme el cambio de estado antes de guardar.");
      return;
    }
    submitting.current.add(key);
    setBusyKey(key, true);
    setError(key, "");
    try {
      const respuesta = await guardarRevisionTesoreria({ ...next, item: crearItemsTesoreria([row])[0] });
      onSaved(row, {
        idAnticipo: next.idAnticipo,
        nroOperacion: next.nroOperacion ?? "",
        idComprobante: next.idComprobante,
        idTipoPago: next.idTipoPago,
        estado: next.estado,
        version: respuesta?.version,
      });
    } catch (e) {
      setError(key, getHttpErrorMessage(e, "No se pudo guardar el recibo."));
      setDraft(row, borradorDesde(row)); // vuelve al valor que sigue vigente
    } finally {
      submitting.current.delete(key);
      setBusyKey(key, false);
    }
  };

  const errorMessage = (row: PagoTesoreriaRow): ReactNode =>
    errors[rowKey(row)] ? (
      <p role="alert" className="pt-inline-alert">
        {errors[rowKey(row)]}
      </p>
    ) : null;

  const select = (row: PagoTesoreriaRow, field: CampoSelect, title: string, options: PagoOpcion[]): ReactNode => {
    if (!editable(row)) return label(options, row[field]);
    const active = draftOf(row);
    const value = active[field];
    const isBusy = busy.has(rowKey(row));
    return (
      <span className="pt-revision-cell">
        <select
          aria-label={`${title} del recibo ${row.correlativo}`}
          disabled={isBusy}
          value={value ?? ""}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const next = { ...active, [field]: Number(e.target.value), confirmarCambioEstado: false };
            setDraft(row, next);
            if (next[field] !== row[field]) void persist(row, next);
          }}
        >
          {!options.some((o) => o.id === value) && (
            <option value={value ?? ""} disabled>
              {label(options, value)}
            </option>
          )}
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
        </select>
        {isBusy && <LoaderCircle className="pt-spin" size={14} />}
        {errorMessage(row)}
      </span>
    );
  };

  return {
    anticipo: (row: PagoTesoreriaRow) => select(row, "idAnticipo", "Anticipo", catalogos.anticipos),
    comprobante: (row: PagoTesoreriaRow) => select(row, "idComprobante", "Comprobante", catalogos.comprobantes),
    tipoPago: (row: PagoTesoreriaRow) => select(row, "idTipoPago", "TipoPago", catalogos.tiposPago),
    operacion: (row: PagoTesoreriaRow): ReactNode => {
      if (!editable(row)) return row.nroOperacion || "—";
      const active = draftOf(row);
      return (
        <span className="pt-revision-cell">
          <input
            aria-label={`NroOperacion del recibo ${row.correlativo}`}
            disabled={busy.has(rowKey(row))}
            maxLength={50}
            value={active.nroOperacion ?? ""}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(row, { ...active, nroOperacion: e.target.value })}
            onBlur={() => {
              if ((active.nroOperacion ?? "") !== (row.nroOperacion ?? "")) void persist(row, active);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          {errorMessage(row)}
        </span>
      );
    },
  };
}
