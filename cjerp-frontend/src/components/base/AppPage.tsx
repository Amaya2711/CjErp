import React, { createContext, useContext, useEffect } from "react";

type PageTitleContextValue = {
  setPageTitle: (title: string | null) => void;
};

export const PageTitleContext = createContext<PageTitleContextValue>({
  setPageTitle: () => undefined,
});

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
  const { setPageTitle } = useContext(PageTitleContext);

  useEffect(() => {
    setPageTitle(title?.trim() ? title : null);

    return () => {
      setPageTitle(null);
    };
  }, [setPageTitle, title]);

  return (
    <div
      style={{
        padding: 24,
        ...(fillHeight
          ? {
              display: "flex",
              flexDirection: "column",
              height: "100%",
              minHeight: 0,
              overflow: "hidden",
            }
          : {
              minHeight: "calc(100vh - 120px)",
            }),
        ...style,
      }}
    >
      {actions && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            marginBottom: 18,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{actions}</div>
        </div>
      )}
      <div style={fillHeight ? { flex: 1, minHeight: 0 } : undefined}>{children}</div>
    </div>
  );
};

export default AppPage;
