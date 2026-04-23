import type React from "react";

type ToolbarFiltroProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
};

export default function ToolbarFiltro({ children, style }: ToolbarFiltroProps) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        borderRadius: 16,
        border: "1px solid #E5E7EB",
        padding: 16,
        boxShadow: "0 8px 24px rgba(23,20,58,0.04)",
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "center",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
