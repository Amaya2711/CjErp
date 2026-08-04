import type { CSSProperties, ReactNode } from "react";
import { crearInmuebleArrendamientos, listarInmueblesArrendamientos } from "../../../api/arrendamientosService";
import type { ArrendamientosFila } from "../../../models/arrendamientos";
import ArrendamientosCrudPage from "../components/ArrendamientosCrudPage";
import type { DataGridColumn } from "../../../components/base/DataGridBase";

type InmuebleForm = {
  id: number | null;
  codigo: string;
  nombre: string;
  tipoInmueble: string;
  direccion: string;
  ubigeo: string;
  referencia: string;
  estado: string;
  observacion: string;
};

const initialForm = (): InmuebleForm => ({
  id: null,
  codigo: generarCodigoInmueble(),
  nombre: "",
  tipoInmueble: "GENERAL",
  direccion: "",
  ubigeo: "",
  referencia: "",
  estado: "ACTIVO",
  observacion: "",
});

const columns: DataGridColumn<ArrendamientosFila>[] = [
  { key: "codigo", header: "Codigo", render: (row) => row.codigo ?? "-" },
  { key: "nombre", header: "Inmueble", render: (row) => row.nombre ?? "-" },
  { key: "detalle", header: "Tipo", render: (row) => row.detalle ?? "-" },
  { key: "inmueble", header: "Direccion", render: (row) => row.inmueble ?? "-" },
  { key: "estado", header: "Estado", render: (row) => row.estado ?? "-" },
  { key: "observacion", header: "Observacion", render: (row) => row.observacion ?? "-" },
];

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

export default function ArrendamientosInmueblesPage() {
  return (
    <ArrendamientosCrudPage<InmuebleForm>
      title="Inmuebles"
      description="Consulta de edificios, locales y activos inmobiliarios."
      searchHint="codigo, nombre, direccion"
      loadRows={listarInmueblesArrendamientos}
      columns={columns}
      initialForm={initialForm}
      mapRowToForm={(row) => ({
        id: row.id ?? null,
        codigo: row.codigo ?? "",
        nombre: row.nombre ?? "",
        tipoInmueble: row.detalle ?? "GENERAL",
        direccion: row.inmueble ?? "",
        ubigeo: "",
        referencia: "",
        estado: row.estado ?? "ACTIVO",
        observacion: row.observacion ?? "",
      })}
      buildPayload={(form) => ({
        id: form.id,
        codigo: form.codigo.trim(),
        nombre: form.nombre.trim(),
        tipoInmueble: form.tipoInmueble.trim(),
        direccion: form.direccion.trim(),
        ubigeo: form.ubigeo.trim() || null,
        referencia: form.referencia.trim() || null,
        estado: form.estado.trim() || "ACTIVO",
        observacion: form.observacion.trim() || null,
      })}
      saveForm={async (payload, mode) => {
        const result = await crearInmuebleArrendamientos(payload);
        return { message: result.message || (mode === "nuevo" ? "Inmueble creado correctamente." : "Inmueble actualizado correctamente.") };
      }}
      validateForm={(form) => {
        const errors: Record<string, string> = {};
        if (!form.nombre.trim()) errors.nombre = "Ingrese el nombre.";
        if (!form.direccion.trim()) errors.direccion = "Ingrese la direccion.";
        if (!form.estado.trim()) errors.estado = "Ingrese el estado.";
        return errors;
      }}
      renderForm={(form, setForm, errors, mode) => (
        <div style={styles.grid}>
          <Field label="Codigo" helperText="Se genera automaticamente al crear el registro.">
            <input value={form.codigo} readOnly style={getFieldStyle(false)} />
          </Field>
          <Field label="Nombre" error={errors.nombre}>
            <input value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} style={getFieldStyle(Boolean(errors.nombre))} />
          </Field>
          <Field label="Direccion" error={errors.direccion} fullWidth>
            <input value={form.direccion} onChange={(e) => setForm((p) => ({ ...p, direccion: e.target.value }))} style={getFieldStyle(Boolean(errors.direccion))} />
          </Field>
          <Field label="Ubigeo">
            <input value={form.ubigeo} onChange={(e) => setForm((p) => ({ ...p, ubigeo: e.target.value }))} style={getFieldStyle(false)} />
          </Field>
          <Field label="Referencia">
            <input value={form.referencia} onChange={(e) => setForm((p) => ({ ...p, referencia: e.target.value }))} style={getFieldStyle(false)} />
          </Field>
          <Field label="Estado" error={errors.estado}>
            <select
              value={form.estado}
              onChange={(e) => setForm((p) => ({ ...p, estado: e.target.value }))}
              style={getFieldStyle(Boolean(errors.estado))}
              disabled={mode === "nuevo"}
            >
              <option value="ACTIVO">ACTIVO</option>
              <option value="INACTIVO">INACTIVO</option>
            </select>
          </Field>
          <Field label="Observacion" fullWidth>
            <textarea rows={4} value={form.observacion} onChange={(e) => setForm((p) => ({ ...p, observacion: e.target.value }))} style={{ ...getFieldStyle(false), resize: "vertical", minHeight: 100 }} />
          </Field>
        </div>
      )}
    />
  );
}

function generarCodigoInmueble() {
  const now = new Date();
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
  const suffix = pad(Math.floor(Math.random() * 1000), 3);
  return `INM-${stamp}-${suffix}`;
}

function Field({
  label,
  children,
  error,
  fullWidth = false,
  helperText,
}: {
  label: string;
  children: ReactNode;
  error?: string;
  fullWidth?: boolean;
  helperText?: string;
}) {
  return (
    <label style={{ ...styles.field, ...(fullWidth ? styles.fullWidth : {}) }}>
      <span style={styles.label}>{label}</span>
      {children}
      {helperText ? <span style={styles.helper}>{helperText}</span> : null}
      {error ? <span style={styles.error}>{error}</span> : null}
    </label>
  );
}

const styles: Record<string, CSSProperties> = {
  grid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 },
  field: { display: "flex", flexDirection: "column", gap: 8 },
  fullWidth: { gridColumn: "1 / -1" },
  label: { fontSize: 13, fontWeight: 700, color: "#334155" },
  helper: { fontSize: 12, color: "#64748B", fontWeight: 500 },
  error: { fontSize: 12, color: "#DC2626", fontWeight: 600 },
};
