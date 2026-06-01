export function parseJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const normalized = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = window.atob(normalized);
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getJwtExpiration(token: string): Date | null {
  const payload = parseJwtPayload(token);
  const exp = payload?.exp;

  if (typeof exp !== "number") {
    return null;
  }

  return new Date(exp * 1000);
}

export function isJwtExpired(token: string, now = Date.now()): boolean {
  const expiration = getJwtExpiration(token);
  return !expiration || expiration.getTime() <= now;
}
