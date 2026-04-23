import type React from "react";

type AppToolbarProps = {
  children: React.ReactNode;
  style?: React.CSSProperties;
};

export default function AppToolbar({ children, style }: AppToolbarProps) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        borderRadius: 16,
        padding: 16,
        boxShadow: "0 8px 24px rgba(23,20,58,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
