import React, { useEffect, useRef, useState } from "react";

// Filtro multiselección con buscador, compartido por Seguimiento de pagos (OC/Gastos) y el Resumen gerencial.
const inputBase: React.CSSProperties = {
  width: "100%",
  height: 34,
  borderRadius: 8,
  border: "1px solid #D1D5DB",
  padding: "0 10px",
  fontSize: 12,
  background: "#FFFFFF",
  boxSizing: "border-box",
};

// Los filtros multiselección muestran solo el resumen (aspecto de combo con flecha);
// el único campo de texto es el buscador dentro de la lista desplegable.
export const multiFiltroResumenStyle: React.CSSProperties = {
  ...inputBase,
  display: "flex",
  alignItems: "center",
  cursor: "pointer",
  userSelect: "none",
  paddingRight: 24,
  background: "#fff url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M0 0l5 6 5-6z' fill='%23475569'/></svg>\") no-repeat right 8px center",
};

export type MultiFiltroBuscableProps = {
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (values: string[]) => void;
  query: string;
  onQuery: (value: string) => void;
  placeholder?: string;
  allowSelectAll?: boolean;
};

// Filtro multiselección: el propio cuadro es el buscador y la lista muestra las coincidencias.
export function MultiFiltroBuscable({ options, selected, onChange, query, onQuery, placeholder, allowSelectAll = true }: MultiFiltroBuscableProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) { setOpen(false); onQuery(""); }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, onQuery]);
  const needle = query.toLocaleLowerCase();
  const visibles = options.filter((item) => item.label.toLocaleLowerCase().includes(needle));
  const todosMarcados = visibles.length > 0 && visibles.every((item) => selected.includes(item.value));
  return (
    <div ref={rootRef} style={{ position: "relative", minWidth: 180 }}>
      <input
        value={open ? query : selected.length ? `${selected.length} seleccionado${selected.length === 1 ? "" : "s"}` : ""}
        placeholder={open ? placeholder : "Todos"}
        onFocus={() => setOpen(true)}
        onChange={(event) => { setOpen(true); onQuery(event.target.value); }}
        onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); onQuery(""); event.currentTarget.blur(); } }}
        style={{ ...multiFiltroResumenStyle, cursor: "text", userSelect: "auto" }}
      />
      {open ? (
        <div style={{ position: "absolute", zIndex: 20, top: "100%", left: 0, right: 0, maxHeight: 240, overflowY: "auto", padding: 8, background: "#fff", border: "1px solid #D1D5DB", borderRadius: 8, boxShadow: "0 6px 16px rgba(15,23,42,.12)" }}>
          {allowSelectAll ? (
            <label style={{ display: "flex", gap: 6, alignItems: "center", padding: "6px 2px", fontSize: 12, fontWeight: 600, borderBottom: "1px solid #E5E7EB" }}>
              <input
                type="checkbox"
                checked={todosMarcados}
                onChange={(event) => {
                  const valores = visibles.map((item) => item.value);
                  onChange(event.target.checked ? [...new Set([...selected, ...valores])] : selected.filter((value) => !valores.includes(value)));
                }}
              />
              Marcar / desmarcar todos
            </label>
          ) : null}
          {visibles.length === 0 ? <div style={{ padding: "6px 2px", fontSize: 12, color: "#64748B" }}>Sin coincidencias</div> : null}
          {visibles.map((item) => (
            <label key={item.value} style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 2px", fontSize: 12 }}>
              <input
                type="checkbox"
                checked={selected.includes(item.value)}
                onChange={(event) => onChange(event.target.checked ? [...new Set([...selected, item.value])] : selected.filter((value) => value !== item.value))}
              />
              {item.label}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
