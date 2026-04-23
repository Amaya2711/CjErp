type ErrorPayload = {
  message?: unknown;
  mensaje?: unknown;
};

type ErrorWithResponse = {
  response?: {
    data?: unknown;
  };
  message?: unknown;
};

export function getHttpErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null) {
    const candidate = error as ErrorWithResponse;
    const responseData = candidate.response?.data;

    if (typeof responseData === "string" && responseData.trim()) {
      return responseData;
    }

    if (typeof responseData === "object" && responseData !== null) {
      const payload = responseData as ErrorPayload;

      if (typeof payload.message === "string" && payload.message.trim()) {
        return payload.message;
      }

      if (typeof payload.mensaje === "string" && payload.mensaje.trim()) {
        return payload.mensaje;
      }
    }

    if (typeof candidate.message === "string" && candidate.message.trim()) {
      return candidate.message;
    }
  }

  return fallback;
}
