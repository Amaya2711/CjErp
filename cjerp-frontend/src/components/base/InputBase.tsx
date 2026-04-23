import type React from "react";

type InputBaseProps = {
  label?: string;
  error?: string;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
} & React.InputHTMLAttributes<HTMLInputElement>;

export default function InputBase({
  label,
  error,
  style,
  inputStyle,
  ...props
}: InputBaseProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0, ...style }}>
      {label ? <label style={styles.label}>{label}</label> : null}
      <input
        {...props}
        style={{
          ...styles.input,
          ...(error ? styles.inputError : undefined),
          ...inputStyle,
        }}
      />
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
  input: {
    width: "100%",
    minHeight: 42,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  },
  inputError: {
    borderColor: "#F87171",
  },
  errorText: {
    fontSize: 12,
    color: "#B91C1C",
    fontWeight: 600,
  },
};
