import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

const styles: Record<string, CSSProperties> = {
  select: { height: 34, padding: "0 8px", border: "1px solid #CBD5E1", borderRadius: 6, fontSize: 13, minWidth: 170, background: "#fff" },
  boton: { height: 34, padding: "0 14px", border: "1px solid #CBD5E1", borderRadius: 6, background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13 },
};

// Lista desplegable con busqueda y casillas para elegir uno o varios elementos (sin seleccion = todos).
export default function SelectorMultiple({
  opciones,
  seleccion,
  onChange,
  singular,
  plural,
}: {
  opciones: string[];
  seleccion: string[];
  onChange: (valor: string[]) => void;
  singular: string;
  plural: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const contenedor = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrarAlHacerClicFuera = (evento: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(evento.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", cerrarAlHacerClicFuera);
    return () => document.removeEventListener("mousedown", cerrarAlHacerClicFuera);
  }, [abierto]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return texto ? opciones.filter((o) => o.toLowerCase().includes(texto)) : opciones;
  }, [opciones, busqueda]);

  const alternar = (opcion: string) =>
    onChange(seleccion.includes(opcion) ? seleccion.filter((c) => c !== opcion) : [...seleccion, opcion]);

  const resumen =
    seleccion.length === 0 ? "Todos" : seleccion.length === 1 ? seleccion[0] : `${seleccion.length} ${plural} seleccionados`;

  return (
    <div ref={contenedor} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        style={{ ...styles.select, minWidth: 260, maxWidth: 320, textAlign: "left", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {resumen} ▾
      </button>
      {abierto ? (
        <div
          style={{
            position: "absolute",
            zIndex: 20,
            top: 38,
            left: 0,
            width: 340,
            background: "#fff",
            border: "1px solid #CBD5E1",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(15,23,42,0.15)",
            padding: 8,
          }}
        >
          <input
            type="text"
            autoFocus
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={`Buscar ${singular}...`}
            style={{ ...styles.select, width: "100%", minWidth: 0, boxSizing: "border-box", marginBottom: 6 }}
          />
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <button type="button" style={{ ...styles.boton, height: 28, fontSize: 12 }} onClick={() => onChange(Array.from(new Set([...seleccion, ...visibles])))}>
              Marcar visibles
            </button>
            <button type="button" style={{ ...styles.boton, height: 28, fontSize: 12 }} onClick={() => onChange([])}>
              Quitar todos
            </button>
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {visibles.length === 0 ? (
              <div style={{ padding: 8, fontSize: 12, color: "#64748B" }}>Sin coincidencias.</div>
            ) : (
              visibles.map((opcion) => (
                <label key={opcion} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 6px", fontSize: 12, cursor: "pointer", fontWeight: 500, color: "#0F172A" }}>
                  <input type="checkbox" checked={seleccion.includes(opcion)} onChange={() => alternar(opcion)} />
                  <span>{opcion}</span>
                </label>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
