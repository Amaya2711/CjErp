export const SHAREPOINT_BASE_URL = "https://cjtelecom.sharepoint.com/sites/CJ-PROYECTOS/";

export function buildSharePointUrl(pathOrUrl?: string | null): string {
  const raw = String(pathOrUrl ?? "").trim();

  if (!raw) {
    return "";
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  return `${SHAREPOINT_BASE_URL}${raw.replace(/^\/+/, "")}`;
}
