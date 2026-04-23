import type React from "react";

type StatusTone = "info" | "success" | "error";

type AppStatusMessageProps = {
  children: React.ReactNode;
  tone?: StatusTone;
  style?: React.CSSProperties;
};

const toneStyles: Record<StatusTone, React.CSSProperties> = {
  info: {
    border: "1px solid #E5E7EB",
    background: "#FFFFFF",
    color: "#475569",
  },
  success: {
    border: "1px solid #A7F3D0",
    background: "#ECFDF5",
    color: "#047857",
  },
  error: {
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C",
  },
};

export default function AppStatusMessage({
  children,
  tone = "info",
  style,
}: AppStatusMessageProps) {
  return (
    <div
      style={{
        borderRadius: 12,
        padding: 12,
        fontSize: 13,
        fontWeight: 700,
        ...toneStyles[tone],
        ...style,
      }}
    >
      {children}
    </div>
  );
}
