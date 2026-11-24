import { useState } from "react";
import CargaDatosPanel from "./CargaDatosPanel";
import DetraccionesRecibidasPanel from "./DetraccionesRecibidasPanel";
import IngresosPendientesPanel from "./IngresosPendientesPanel";

const TABS = [
  { key: "PENDIENTES", label: "Ingresos pendientes" },
  { key: "CARGA", label: "Carga de datos" },
  { key: "DETRACCIONES", label: "Detracciones" },
] as const;

/** Contenedor de la pestaña INGRESO (portal CxC) con sus sub-pestañas. */
export default function IngresoPortalPanel() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("PENDIENTES");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              cursor: "pointer",
              background: tab === item.key ? "#1e3a8a" : "#fff",
              color: tab === item.key ? "#fff" : "#0f172a",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div style={{ display: tab === "PENDIENTES" ? "block" : "none" }}>
        <IngresosPendientesPanel />
      </div>
      <div style={{ display: tab === "DETRACCIONES" ? "block" : "none" }}>
        <DetraccionesRecibidasPanel activo={tab === "DETRACCIONES"} />
      </div>
      <div style={{ display: tab === "CARGA" ? "block" : "none" }}>
        <CargaDatosPanel />
      </div>
    </div>
  );
}
