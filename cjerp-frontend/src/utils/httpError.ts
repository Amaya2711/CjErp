type ErrorPayload = {
  message?: unknown;
  mensaje?: unknown;
  detail?: unknown;
  error?: unknown;
  errorMessage?: unknown;
  title?: unknown;
  Error?: unknown;
  ErrorMessage?: unknown;
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

  const normalized = value.toLowerCase();
  if (
    normalized.includes("the operation has timed out") ||
    normalized.includes("operation has timed out") ||
    normalized.includes("tiempo de espera")
  ) {
    return "La operacion excedio el tiempo de espera.";
  }

  return value;
}

function extractErrorPayloadMessage(payload: ErrorPayload): string | undefined {
  if (
    typeof payload.message === "string" &&
    payload.message.trim() &&
    typeof payload.detail === "string" &&
    payload.detail.trim()
  ) {
    return `${payload.message.trim()} | ${payload.detail.trim()}`;
  }

  const candidates = [
    payload.message,
    payload.mensaje,
    payload.detail,
    payload.error,
    payload.errorMessage,
    payload.title,
    payload.Error,
    payload.ErrorMessage,
  ];

  const firstMessage = candidates.find(
    (item) => typeof item === "string" && item.trim()
  ) as string | undefined;

  return firstMessage?.trim();
}

export function getHttpErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null) {
    const candidate = error as ErrorWithResponse;
    const responseData = candidate.response?.data;

    if (typeof responseData === "string" && responseData.trim()) {
      const trimmed = responseData.trim();

      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed) as unknown;
          if (typeof parsed === "string" && parsed.trim()) {
            return normalizeFriendlyErrorMessage(parsed.trim());
          }

          if (typeof parsed === "object" && parsed !== null) {
            const payload = parsed as ErrorPayload;
            const extracted = extractErrorPayloadMessage(payload);

            if (extracted) {
              return normalizeFriendlyErrorMessage(extracted);
            }
          }
        } catch {
          // Si el texto parece JSON pero no se puede parsear, seguimos con el texto plano.
        }
      }

      return normalizeFriendlyErrorMessage(trimmed);
    }

    if (typeof responseData === "object" && responseData !== null) {
      const payload = responseData as ErrorPayload;
      const extracted = extractErrorPayloadMessage(payload);

      if (extracted) {
        return normalizeFriendlyErrorMessage(extracted);
      }
    }

    if (typeof candidate.message === "string" && candidate.message.trim()) {
      return normalizeFriendlyErrorMessage(candidate.message);
    }
  }

  return fallback;
}
