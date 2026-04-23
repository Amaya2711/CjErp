import type React from "react";

type AppSectionHeaderProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
};

export default function AppSectionHeader({
  title,
  description,
  actions,
}: AppSectionHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: 16,
      }}
    >
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0F172A" }}>
          {title}
        </h2>
        {description ? (
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "#64748B" }}>
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </div>
  );
}
