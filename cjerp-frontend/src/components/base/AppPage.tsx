import React from "react";

interface AppPageProps {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
  fillHeight?: boolean;
}

/**
 * Layout base de página con título, acciones y contenido.
 * Usar en todas las páginas principales.
 */
const AppPage: React.FC<AppPageProps> = ({ title, actions, children, style, fillHeight = false }) => {
  return (
    <div
      style={{
        padding: 24,
        minHeight: "calc(100vh - 120px)",
        ...(fillHeight
          ? {
              display: "flex",
              flexDirection: "column",
            }
          : {}),
        ...style,
      }}
    >
      {(title || actions) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{title}</h1>
          {actions && <div>{actions}</div>}
        </div>
      )}
      <div style={fillHeight ? { flex: 1, minHeight: 0 } : undefined}>{children}</div>
    </div>
  );
};

export default AppPage;
