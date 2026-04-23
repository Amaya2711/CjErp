import type React from "react";

type SelectOption = {
  value: string | number;
  label: string;
};

type SelectBaseProps = {
  label?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
  style?: React.CSSProperties;
  selectStyle?: React.CSSProperties;
} & React.SelectHTMLAttributes<HTMLSelectElement>;

export default function SelectBase({
  label,
  error,
  options,
  placeholder = "Seleccione",
  style,
  selectStyle,
  ...props
}: SelectBaseProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0, ...style }}>
      {label ? <label style={styles.label}>{label}</label> : null}
      <select
        {...props}
        style={{
          ...styles.select,
          ...(error ? styles.selectError : undefined),
          ...selectStyle,
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={String(option.value)} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <div style={styles.errorText}>{error}</div> : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  label: {
    fontSize: 14,
    fontWeight: 700,
    color: "#334155",
  },
  select: {
    width: "100%",
    minHeight: 42,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    background: "#FFFFFF",
  },
  selectError: {
    borderColor: "#F87171",
  },
  errorText: {
    fontSize: 12,
    color: "#B91C1C",
    fontWeight: 600,
  },
};
