import React, { useEffect, useState } from "react";
import AppStatusMessage from "./AppStatusMessage";

type AppRuntimeGuardProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryProps = {
  children: React.ReactNode;
  onError: (error: Error) => void;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

function formatErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message || "Se produjo un error inesperado.";
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Se produjo un error inesperado.";
  }
}

class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
    console.error("[AppErrorBoundary]", error);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}

function AppCrashFallback({ message }: { message: string }) {
  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.title}>La aplicacion encontro un error</div>
        <AppStatusMessage tone="error" style={styles.message}>
          {message}
        </AppStatusMessage>
        <p style={styles.text}>
          Puedes recargar la pagina para intentar recuperar la sesion. Si el problema vuelve a aparecer, guarda la
          hora exacta y avisa para revisarlo con logs o con el backend.
        </p>
        <div style={styles.actions}>
          <button type="button" style={styles.primaryButton} onClick={() => window.location.reload()}>
            Recargar pagina
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AppRuntimeGuard({ children }: AppRuntimeGuardProps) {
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      const message = formatErrorMessage(event.error ?? event.message);
      console.error("[window.onerror]", event.error ?? event.message, event);
      setRuntimeError(message);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const message = formatErrorMessage(event.reason);
      console.error("[unhandledrejection]", event.reason);
      setRuntimeError(message);
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  if (runtimeError) {
    return <AppCrashFallback message={runtimeError} />;
  }

  return (
    <AppErrorBoundary
      onError={(error) => {
        setRuntimeError(error.message || "Se produjo un error inesperado.");
      }}
    >
      {children}
    </AppErrorBoundary>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 24,
    background:
      "radial-gradient(circle at top left, rgba(37,99,235,0.10), transparent 36%), radial-gradient(circle at top right, rgba(20,184,166,0.10), transparent 30%), linear-gradient(180deg, #F8FAFC 0%, #EEF2FF 100%)",
  },
  card: {
    width: "min(760px, 100%)",
    borderRadius: 18,
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    boxShadow: "0 20px 40px rgba(15, 23, 42, 0.12)",
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 900,
    color: "#0F172A",
    marginBottom: 14,
  },
  message: {
    marginBottom: 14,
  },
  text: {
    margin: 0,
    color: "#475569",
    fontSize: 14,
    lineHeight: 1.6,
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: 18,
  },
  primaryButton: {
    minHeight: 40,
    borderRadius: 10,
    border: "1px solid #1D4ED8",
    background: "linear-gradient(135deg, #1D4ED8, #0F172A)",
    color: "#FFFFFF",
    padding: "0 16px",
    fontWeight: 800,
    cursor: "pointer",
  },
};
