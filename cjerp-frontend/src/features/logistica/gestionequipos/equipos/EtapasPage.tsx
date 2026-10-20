import { useState, type ReactNode } from "react";
import AppPage from "../../../../components/base/AppPage";

export type EtapaTab = {
  key: string;
  label: string;
  /** Contenido de la etapa; si falta, la pestaña se muestra deshabilitada (pendiente de construir). */
  content?: ReactNode;
};

type EtapasPageProps = {
  title: string;
  etapas: EtapaTab[];
};

/** Contenedor de pestañas por etapa del flujo de logística de equipos (equivale a FrmLogistic_v1). */
export default function EtapasPage({ title, etapas }: EtapasPageProps) {
  const [tab, setTab] = useState(() => etapas.find((etapa) => etapa.content)?.key ?? etapas[0]?.key ?? "");
  const activa = etapas.find((etapa) => etapa.key === tab);

  return (
    <AppPage title={title} fillHeight>
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

      {activa?.content ?? <div style={styles.empty}>Etapa pendiente de construir.</div>}
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
  empty: { color: "#64748b", fontSize: 13, padding: 16 },
};
