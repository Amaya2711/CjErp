import type { CSSProperties, ReactNode } from "react";
import { crearTipoCambioArrendamientos, listarTiposCambioArrendamientos } from "../../../api/arrendamientosService";
import type { ArrendamientosFila } from "../../../models/arrendamientos";
import ArrendamientosCrudPage from "../components/ArrendamientosCrudPage";
import type { DataGridColumn } from "../../../components/base/DataGridBase";

type TipoCambioForm = {
  id: number | null;
  fechaTipoCambio: string;
  monedaOrigen: string;
  monedaDestino: string;
  compra: string;
  venta: string;
  fuente: string;
  esManual: boolean;
  activo: boolean;
  observacion: string;
};

const initialForm = (): TipoCambioForm => ({
  id: null,
  fechaTipoCambio: new Date().toISOString().slice(0, 10),
  monedaOrigen: "USD",
  monedaDestino: "PEN",
  compra: "",
  venta: "",
  fuente: "",
  esManual: false,
  activo: true,
  observacion: "",
});

const columns: DataGridColumn<ArrendamientosFila>[] = [
  { key: "codigo", header: "Par", render: (row) => row.codigo ?? "-" },
  { key: "nombre", header: "Fecha", render: (row) => row.nombre ?? "-" },
  { key: "detalle", header: "Detalle", render: (row) => row.detalle ?? "-" },
  { key: "estado", header: "Estado", render: (row) => row.estado ?? "-" },
  {
    key: "importe",
    header: "Promedio",
    align: "right",
    render: (row) =>
      (row.importe ?? 0).toLocaleString("es-PE", {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
      }),
  },
  { key: "observacion", header: "Observacion", render: (row) => row.observacion ?? "-" },
];

export default function ArrendamientosTiposCambioPage() {
  return (
    <ArrendamientosCrudPage<TipoCambioForm>
      title="Tipos de cambio"
      description="Registro diario de conversion para operaciones del modulo."
      searchHint="par, fecha, estado, observacion"
      loadRows={listarTiposCambioArrendamientos}
      columns={columns}
      initialForm={initialForm}
      mapRowToForm={(row) => ({
        id: row.id ?? null,
        fechaTipoCambio: row.fecha ?? new Date().toISOString().slice(0, 10),
        monedaOrigen: "USD",
        monedaDestino: "PEN",
        compra: "",
        venta: "",
        fuente: "",
        esManual: false,
        activo: (row.estado ?? "").toUpperCase() !== "INACTIVO",
        observacion: row.observacion ?? "",
      })}
      buildPayload={(form) => ({
        idTipoCambioDiario: form.id,
        fechaTipoCambio: form.fechaTipoCambio,
        monedaOrigen: form.monedaOrigen,
        monedaDestino: form.monedaDestino,
        compra: Number(form.compra || 0),
        venta: Number(form.venta || 0),
        fuente: form.fuente.trim() || null,
        esManual: form.esManual,
        activo: form.activo,
        observacion: form.observacion.trim() || null,
      })}
      saveForm={async (payload, mode) => {
        const result = await crearTipoCambioArrendamientos(payload);
        return { message: result.message || (mode === "nuevo" ? "Tipo de cambio guardado correctamente." : "Tipo de cambio actualizado correctamente.") };
      }}
      validateForm={(form) => {
        const errors: Record<string, string> = {};
        if (!form.fechaTipoCambio) errors.fechaTipoCambio = "Seleccione la fecha.";
        if (!form.monedaOrigen.trim()) errors.monedaOrigen = "Seleccione la moneda origen.";
        if (!form.monedaDestino.trim()) errors.monedaDestino = "Seleccione la moneda destino.";
        if (!form.compra || Number(form.compra) <= 0) errors.compra = "Ingrese la compra.";
        if (!form.venta || Number(form.venta) <= 0) errors.venta = "Ingrese la venta.";
        return errors;
      }}
      renderForm={(form, setForm, errors) => (
        <div style={styles.grid}>
          <Field label="Fecha" error={errors.fechaTipoCambio}>
            <input type="date" value={form.fechaTipoCambio} onChange={(e) => setForm((p) => ({ ...p, fechaTipoCambio: e.target.value }))} style={getFieldStyle(Boolean(errors.fechaTipoCambio))} />
          </Field>
          <Field label="Moneda origen" error={errors.monedaOrigen}>
            <select value={form.monedaOrigen} onChange={(e) => setForm((p) => ({ ...p, monedaOrigen: e.target.value }))} style={getFieldStyle(Boolean(errors.monedaOrigen))}>
              <option value="USD">USD</option>
              <option value="PEN">PEN</option>
            </select>
          </Field>
          <Field label="Moneda destino" error={errors.monedaDestino}>
            <select value={form.monedaDestino} onChange={(e) => setForm((p) => ({ ...p, monedaDestino: e.target.value }))} style={getFieldStyle(Boolean(errors.monedaDestino))}>
              <option value="PEN">PEN</option>
              <option value="USD">USD</option>
            </select>
          </Field>
          <Field label="Compra" error={errors.compra}>
            <input type="number" step="0.0001" value={form.compra} onChange={(e) => setForm((p) => ({ ...p, compra: e.target.value }))} style={getFieldStyle(Boolean(errors.compra))} />
          </Field>
          <Field label="Venta" error={errors.venta}>
            <input type="number" step="0.0001" value={form.venta} onChange={(e) => setForm((p) => ({ ...p, venta: e.target.value }))} style={getFieldStyle(Boolean(errors.venta))} />
          </Field>
          <Field label="Fuente">
            <input value={form.fuente} onChange={(e) => setForm((p) => ({ ...p, fuente: e.target.value }))} style={getFieldStyle(false)} />
          </Field>
          <Field label="Observacion" fullWidth>
            <textarea rows={4} value={form.observacion} onChange={(e) => setForm((p) => ({ ...p, observacion: e.target.value }))} style={{ ...getFieldStyle(false), resize: "vertical", minHeight: 100 }} />
          </Field>
          <Field label="Manual">
            <input type="checkbox" checked={form.esManual} onChange={(e) => setForm((p) => ({ ...p, esManual: e.target.checked }))} />
          </Field>
          <Field label="Activo">
            <input type="checkbox" checked={form.activo} onChange={(e) => setForm((p) => ({ ...p, activo: e.target.checked }))} />
          </Field>
        </div>
      )}
    />
  );
}

function Field({
  label,
  children,
  error,
  fullWidth = false,
}: {
  label: string;
  children: ReactNode;
  error?: string;
  fullWidth?: boolean;
}) {
  return (
    <label style={{ ...styles.field, ...(fullWidth ? styles.fullWidth : {}) }}>
      <span style={styles.label}>{label}</span>
      {children}
      {error ? <span style={styles.error}>{error}</span> : null}
    </label>
  );
}

function getFieldStyle(hasError: boolean): CSSProperties {
  return {
    width: "100%",
    borderRadius: 12,
    border: `1px solid ${hasError ? "#FCA5A5" : "#D6DCEB"}`,
    background: "#F8FAFC",
    color: "#0F172A",
    padding: "12px 14px",
    fontSize: 14,
    outline: "none",
  };
}

const styles: Record<string, CSSProperties> = {
  grid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 },
  field: { display: "flex", flexDirection: "column", gap: 8 },
  fullWidth: { gridColumn: "1 / -1" },
  label: { fontSize: 13, fontWeight: 700, color: "#334155" },
  error: { fontSize: 12, color: "#DC2626", fontWeight: 600 },
};
