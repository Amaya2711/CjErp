import { useState } from "react";
import CargaDetraccionesPanel from "./CargaDetraccionesPanel";
import CargaSirePanel from "./CargaSirePanel";

const TABS = [
  { key: "SIRE", label: "SIRE" },
  { key: "DETRACCIONES", label: "Detracciones" },
] as const;

/** Carga de datos del portal CxC: sub-pestañas SIRE | Detracciones. */
export default function CargaDatosPanel() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("SIRE");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            style={{
              padding: "5px 12px",
              borderRadius: 8,
              border: "1px solid #94a3b8",
              cursor: "pointer",
              background: tab === item.key ? "#e0e7ff" : "#fff",
              color: tab === item.key ? "#1e3a8a" : "#334155",
              fontWeight: tab === item.key ? 600 : 400,
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div style={{ display: tab === "SIRE" ? "block" : "none" }}>
        <CargaSirePanel />
      </div>
      <div style={{ display: tab === "DETRACCIONES" ? "block" : "none" }}>
        <CargaDetraccionesPanel />
      </div>
    </div>
  );
}
