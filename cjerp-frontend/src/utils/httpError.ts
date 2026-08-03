type ErrorPayload = {
  message?: unknown;
  mensaje?: unknown;
  detail?: unknown;
  error?: unknown;
  title?: unknown;
};

type ErrorWithResponse = {
  response?: {
    data?: unknown;
  };
  message?: unknown;
};

function isDuplicateProtectionMessage(value: string): boolean {
  const normalized = value.toLowerCase();

  return (
    normalized.includes("duplicate key row") ||
    normalized.includes("registro duplicado") ||
    normalized.includes("evitar registros duplicados") ||
    normalized.includes("no se permite el registro")
  );
}

function normalizeFriendlyErrorMessage(value: string): string {
  if (isDuplicateProtectionMessage(value)) {
    return "No se permite el registro para evitar registros duplicados.";
  }

  return value;
}

export function getHttpErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null) {
    const candidate = error as ErrorWithResponse;
    const responseData = candidate.response?.data;

    if (typeof responseData === "string" && responseData.trim()) {
      return normalizeFriendlyErrorMessage(responseData.trim());
    }

    if (typeof responseData === "object" && responseData !== null) {
      const payload = responseData as ErrorPayload;

      if (
        typeof payload.message === "string" &&
        payload.message.trim() &&
        typeof payload.detail === "string" &&
        payload.detail.trim()
      ) {
        return normalizeFriendlyErrorMessage(`${payload.message} | ${payload.detail}`);
      }

      if (typeof payload.message === "string" && payload.message.trim()) {
        return normalizeFriendlyErrorMessage(payload.message);
      }

      if (typeof payload.mensaje === "string" && payload.mensaje.trim()) {
        return normalizeFriendlyErrorMessage(payload.mensaje);
      }

      if (typeof payload.detail === "string" && payload.detail.trim()) {
        return normalizeFriendlyErrorMessage(payload.detail);
      }

      if (typeof payload.error === "string" && payload.error.trim()) {
        return normalizeFriendlyErrorMessage(payload.error);
      }

      if (typeof payload.title === "string" && payload.title.trim()) {
        return normalizeFriendlyErrorMessage(payload.title);
      }
    }

    if (typeof candidate.message === "string" && candidate.message.trim()) {
      return normalizeFriendlyErrorMessage(candidate.message);
    }
  }

  return fallback;
}
