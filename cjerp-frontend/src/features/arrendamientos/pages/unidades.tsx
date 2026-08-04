import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { listarInmueblesArrendamientos, listarUnidadesArrendamientos, crearUnidadArrendamientos } from "../../../api/arrendamientosService";
import type { ArrendamientosFila } from "../../../models/arrendamientos";
import ArrendamientosCrudPage from "../components/ArrendamientosCrudPage";
import type { DataGridColumn } from "../../../components/base/DataGridBase";

type UnidadForm = {
  id: number | null;
  idInmueble: string;
  codigo: string;
  nombre: string;
  tipoUnidad: string;
  piso: string;
  areaM2: string;
  estado: string;
  observacion: string;
};

const initialForm = (): UnidadForm => ({
  id: null,
  idInmueble: "",
  codigo: generarCodigoUnidad(),
  nombre: "",
  tipoUnidad: "GENERAL",
  piso: "",
  areaM2: "",
  estado: "ACTIVO",
  observacion: "",
});

const columns: DataGridColumn<ArrendamientosFila>[] = [
  { key: "codigo", header: "Codigo", render: (row) => row.codigo ?? "-" },
  { key: "nombre", header: "Unidad", render: (row) => row.nombre ?? "-" },
  { key: "detalle", header: "Tipo", render: (row) => row.detalle ?? "-" },
  { key: "inmueble", header: "Inmueble", render: (row) => row.inmueble ?? "-" },
  { key: "unidad", header: "Nivel", render: (row) => row.unidad ?? "-" },
  { key: "estado", header: "Estado", render: (row) => row.estado ?? "-" },
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

export default function ArrendamientosUnidadesPage() {
  const [inmuebles, setInmuebles] = useState<ArrendamientosFila[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listarInmueblesArrendamientos()
      .then((data) => {
        if (!cancelled) setInmuebles(data);
      })
      .catch(() => {
        if (!cancelled) setInmuebles([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const inmuebleOptions = useMemo(
    () =>
      [...inmuebles].sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? "", "es", { sensitivity: "base" })),
    [inmuebles]
  );

  return (
    <ArrendamientosCrudPage<UnidadForm>
      title="Unidades"
      description="Consulta de pisos, locales y unidades arrendables."
      searchHint="codigo, unidad, inmueble, estado"
      loadRows={listarUnidadesArrendamientos}
      columns={columns}
      initialForm={initialForm}
      mapRowToForm={(row) => ({
        id: row.id ?? null,
        idInmueble: "",
        codigo: row.codigo ?? "",
        nombre: row.nombre ?? "",
        tipoUnidad: row.detalle ?? "GENERAL",
        piso: row.unidad ?? "",
        areaM2: "",
        estado: row.estado ?? "ACTIVO",
        observacion: row.observacion ?? "",
      })}
      buildPayload={(form) => ({
        id: form.id,
        idInmueble: form.idInmueble ? Number(form.idInmueble) : 0,
        codigo: form.codigo.trim(),
        nombre: form.nombre.trim(),
        tipoUnidad: form.tipoUnidad.trim(),
        piso: form.piso.trim() || null,
        areaM2: form.areaM2 ? Number(form.areaM2) : null,
        estado: form.estado.trim() || "ACTIVO",
        observacion: form.observacion.trim() || null,
      })}
      saveForm={async (payload, mode) => {
        const result = await crearUnidadArrendamientos(payload);
        return { message: result.message || (mode === "nuevo" ? "Unidad creada correctamente." : "Unidad actualizada correctamente.") };
      }}
      validateForm={(form) => {
        const errors: Record<string, string> = {};
        if (!form.idInmueble) errors.idInmueble = "Seleccione el inmueble.";
        if (!form.nombre.trim()) errors.nombre = "Ingrese el nombre.";
        if (!form.estado.trim()) errors.estado = "Ingrese el estado.";
        return errors;
      }}
      renderForm={(form, setForm, errors) => (
        <div style={styles.grid}>
          <Field label="Inmueble" error={errors.idInmueble}>
            <select value={form.idInmueble} onChange={(e) => setForm((p) => ({ ...p, idInmueble: e.target.value }))} style={getFieldStyle(Boolean(errors.idInmueble))}>
              <option value="">Seleccione...</option>
              {inmuebleOptions.map((item) => (
                <option key={item.id ?? item.codigo} value={item.id ?? ""}>{item.nombre ?? item.codigo}</option>
              ))}
            </select>
          </Field>
          <Field label="Codigo" helperText="Se genera automaticamente al crear el registro.">
            <input value={form.codigo} readOnly style={getFieldStyle(false)} />
          </Field>
          <Field label="Nombre" error={errors.nombre}>
            <input value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} style={getFieldStyle(Boolean(errors.nombre))} />
          </Field>
          <Field label="Piso / nivel">
            <input value={form.piso} onChange={(e) => setForm((p) => ({ ...p, piso: e.target.value }))} style={getFieldStyle(false)} />
          </Field>
          <Field label="Area m2">
            <input type="number" step="0.01" value={form.areaM2} onChange={(e) => setForm((p) => ({ ...p, areaM2: e.target.value }))} style={getFieldStyle(false)} />
          </Field>
          <Field label="Estado" error={errors.estado}>
            <select value={form.estado} onChange={(e) => setForm((p) => ({ ...p, estado: e.target.value }))} style={getFieldStyle(Boolean(errors.estado))}>
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

function generarCodigoUnidad() {
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
  return `UNI-${stamp}-${suffix}`;
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
