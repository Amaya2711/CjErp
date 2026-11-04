import { useState, type ReactNode } from "react";
import AppPage from "../../../../components/base/AppPage";
import { AccionesPaginaContext } from "./accionesPagina";

export type EtapaTab = {
  key: string;
  label: string;
  /** Contenido de la etapa; si falta, la pestaña se muestra deshabilitada (pendiente de construir). */
  content?: ReactNode;
  /** La etapa publica sus botones de acción principales en el pie de la página (ver AccionesPaginaContext). */
  conAcciones?: boolean;
};

type EtapasPageProps = {
  title: string;
  etapas: EtapaTab[];
};

/** Contenedor de pestañas por etapa del flujo de logística de equipos (equivale a FrmLogistic_v1). */
export default function EtapasPage({ title, etapas }: EtapasPageProps) {
  const [tab, setTab] = useState(() => etapas.find((etapa) => etapa.content)?.key ?? etapas[0]?.key ?? "");
  const activa = etapas.find((etapa) => etapa.key === tab);
  const [slotAcciones, setSlotAcciones] = useState<HTMLElement | null>(null);

  return (
    <AppPage
      title={title}
      fillHeight
      style={{ paddingTop: 6 }}
    >
      {/* Columna de alto completo: las grillas con height="fill" ocupan el alto de la página. */}
      <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div role="tablist" aria-label={title} style={styles.tabs}>
        {etapas.map((etapa) => {
          const disponible = Boolean(etapa.content);
          return (
            <button
              key={etapa.key}
              type="button"
              role="tab"
              aria-selected={tab === etapa.key}
              disabled={!disponible}
              title={disponible ? undefined : "Etapa pendiente de construir"}
              onClick={() => setTab(etapa.key)}
              style={{
                ...styles.tab,
                ...(tab === etapa.key ? styles.tabActive : null),
                ...(disponible ? null : styles.tabDisabled),
              }}
            >
              {etapa.label}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <AccionesPaginaContext.Provider value={activa?.conAcciones ? slotAcciones : null}>
          {activa?.content ?? <div style={styles.empty}>Etapa pendiente de construir.</div>}
        </AccionesPaginaContext.Provider>
      </div>

      {/* Pie de página: aquí se publican (portal) los botones de acción principales de la etapa activa. */}
      {activa?.conAcciones ? (
        <>
          <style>{".etapas-acciones-pie:empty{display:none}"}</style>
          <div ref={setSlotAcciones} className="etapas-acciones-pie" style={styles.pie} />
        </>
      ) : null}
      </div>
    </AppPage>
  );
}

const styles = {
  tabs: { display: "flex", gap: 2, borderBottom: "1px solid #d8dee8", marginBottom: 14, flexWrap: "wrap" as const },
  tab: {
    background: "transparent",
    color: "#40566d",
    border: 0,
    borderBottom: "3px solid transparent",
    padding: "9px 14px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
  tabActive: { color: "#1f6f8b", borderBottom: "3px solid #1f6f8b" },
  tabDisabled: { color: "#94a3b8", cursor: "not-allowed", fontWeight: 400 },
  pie: { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, paddingTop: 10, marginTop: 8, borderTop: "1px solid #d8dee8" },
  empty: { color: "#64748b", fontSize: 13, padding: 16 },
};
