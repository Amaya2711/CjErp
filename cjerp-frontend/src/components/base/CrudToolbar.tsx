import type React from "react";
import AppToolbar from "./AppToolbar";

export type CrudToolbarButton = {
  key: string;
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  visible?: boolean;
  icon?: React.ReactNode;
  title?: string;
  iconOnly?: boolean;
};

export type CrudToolbarSearchField<T> = {
  key: string;
  label: string;
  getValue: (item: T) => unknown;
};

type CrudToolbarProps = {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  searchFieldsHint?: string;
  buttons?: CrudToolbarButton[];
  children?: React.ReactNode;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
};

function normalizeToolbarSearchValue(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function matchesCrudToolbarSearch<T>(
  item: T,
  query: string,
  fields: CrudToolbarSearchField<T>[]
): boolean {
  const normalizedQuery = normalizeToolbarSearchValue(query);

  if (!normalizedQuery) {
    return true;
  }

  // Permitir múltiples palabras separadas por espacio
  const words = normalizedQuery.split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  // Solo mostrar si TODAS las palabras están presentes en algún campo (AND)
  return words.every((word) =>
    fields.some((field) => {
      const rawValue = field.getValue(item);
      const normalizedValue = normalizeToolbarSearchValue(rawValue);
      return normalizedValue.includes(word);
    })
  );
}

function getButtonStyles(
  variant: CrudToolbarButton["variant"] = "primary"
): React.CSSProperties {
  if (variant === "secondary") {
    return {
      border: "1px solid #D1D5DB",
      background: "#FFFFFF",
      color: "#374151",
    };
  }

  if (variant === "danger") {
    return {
      border: "1px solid #FECACA",
      background: "#FEF2F2",
      color: "#B91C1C",
    };
  }

  return {
    border: "none",
    background: "#6E4CCB",
    color: "#FFFFFF",
  };
}

export default function CrudToolbar({
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Buscar...",
  searchFieldsHint,
  buttons = [],
  children,
  style,
  inputStyle,
}: CrudToolbarProps) {
  const visibleButtons = buttons.filter((button) => button.visible !== false);

  return (
    <AppToolbar
      style={{
        flexWrap: "wrap",
        alignItems: "center",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          flex: "1 1 320px",
          minWidth: 240,
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        {onSearchChange ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              flex: "1 1 420px",
              minWidth: 280,
            }}
          >
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              style={{
                width: "100%",
                minWidth: 0,
                maxWidth: 680,
                padding: "14px 18px",
                border: "1px solid #E5E7EB",
                borderRadius: 10,
                fontSize: 18,
                outline: "none",
                background: "#F8FAFC",
                ...inputStyle,
              }}
            />
            {searchFieldsHint ? (
              <span style={{ fontSize: 11, color: "#6B7280" }}>
                Buscar por: {searchFieldsHint}
              </span>
            ) : null}
          </div>
        ) : null}

        {children}
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "flex-end",
          gap: 8,
          marginLeft: "auto",
        }}
      >
        {visibleButtons.map((button) => (
          <button
            key={button.key}
            type="button"
            onClick={button.onClick}
            disabled={button.disabled}
            title={button.title || button.label}
            aria-label={button.title || button.label}
            style={{
              padding: button.iconOnly ? "10px" : "10px 16px",
              borderRadius: 10,
              fontWeight: 700,
              cursor: button.disabled ? "not-allowed" : "pointer",
              opacity: button.disabled ? 0.6 : 1,
              minWidth: button.iconOnly ? 42 : undefined,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              ...getButtonStyles(button.variant),
            }}
          >
            {button.iconOnly ? (button.icon ?? button.label) : <>{button.icon}{button.label}</>}
          </button>
        ))}
      </div>
    </AppToolbar>
  );
}
