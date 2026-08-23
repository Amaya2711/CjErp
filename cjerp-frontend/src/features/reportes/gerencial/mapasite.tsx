import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import {
  Building2,
  Camera,
  ChevronDown,
  ChevronUp,
  Clock3,
  Layers3,
  MapPinned,
  Maximize2,
  Minimize2,
  Search,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import AppPage from "../../../components/base/AppPage";
import AppCard from "../../../components/base/AppCard";
import AppStatusMessage from "../../../components/base/AppStatusMessage";
import { consultarMapaPersonal, consultarMapaSite, type MapaSiteRow } from "../../../api/mapasiteService";
import { getHttpErrorMessage } from "../../../utils/httpError";
import { SHAREPOINT_BASE_URL } from "../../../utils/sharepoint";

type MapsWindow = {
  maps: any;
};

type PointPosition = {
  lat: number;
  lng: number;
};

type RouteSummary = {
  originName: string;
  destinationName: string;
  distanceText: string;
  durationText: string;
  etaText: string;
};

type ViewMode = "operativa" | "gerencial";
type MapTab = "cobertura" | "sitios" | "personal" | "rutas" | "calor";

type MapDiagnostics = {
  bootstrapReady: boolean;
  tilesReady: boolean;
  mapCardHeight: number | null;
  containerWidth: number;
  containerHeight: number;
  status: string;
};

type DepartmentInsight = {
  department: string;
  siteCount: number;
  personalCount: number;
  totalCount: number;
  sharePercent: number;
  sampleSite: string;
  samplePersonal: string;
  color: string;
};

type NearestEmployeeRoute = {
  key: string;
  nombre: string;
  departamento: string;
  cargo: string;
  idEmpleado: string;
  ubicacion: string;
  position: PointPosition;
  straightDistanceKm: number;
  routeDistanceKm: number;
  routeDistanceText: string;
  routeDurationText: string;
  etaText: string;
  routeAvailable: boolean;
  routeError?: string;
};

type PhotoPreviewMode = "street" | "satellite" | "photo";

type PhotoViewerState = {
  title: string;
  url: string;
  sourcePath: string;
} | null;

const GOOGLE_SCRIPT_ID = "cj-google-maps-sdk";
const PERU_CENTER = { lat: -9.19, lng: -76.25 };
const PERU_ZOOM = 5;
const PERU_VIEW_BOUNDS = {
  south: -18.6,
  west: -83.0,
  north: 1.0,
  east: -67.6,
};
const PERSONAL_SITE_RADIUS_KM = 15;
const DEPARTMENT_SWATCHES = ["#1d4ed8", "#0f766e", "#7c3aed", "#ca8a04", "#dc2626", "#0f172a"];
const visualOrderCollator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

let googleMapsLoadPromise: Promise<void> | null = null;
const rowLookupCache = new WeakMap<object, Map<string, unknown>>();

declare global {
  interface Window {
    google?: MapsWindow;
    gm_authFailure?: () => void;
    __openMapasitePhoto?: (sourcePath: string, title: string) => void;
  }
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeLookupKey(value: string) {
  return normalizeText(value).replace(/[\s_-]/g, "");
}

function compareVisualText(a: string, b: string) {
  return visualOrderCollator.compare(a || "", b || "");
}

function compareVisualPointKind(kind: "sitio" | "personal") {
  return kind === "sitio" ? 0 : 1;
}

function getNormalizedRowLookup(row: MapaSiteRow) {
  const cached = rowLookupCache.get(row);
  if (cached) {
    return cached;
  }

  const lookup = new Map<string, unknown>();

  for (const [entryKey, entryValue] of Object.entries(row)) {
    const normalizedKey = normalizeLookupKey(entryKey);
    if (!normalizedKey || lookup.has(normalizedKey)) {
      continue;
    }

    lookup.set(normalizedKey, entryValue);
  }

  rowLookupCache.set(row, lookup);
  return lookup;
}

function getRowValue(row: MapaSiteRow, keys: string[]) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return row[key];
    }
  }

  const normalizedEntries = getNormalizedRowLookup(row);

  for (const key of keys) {
    const normalizedKey = normalizeLookupKey(key);
    const match = normalizedEntries.get(normalizedKey);
    if (match !== undefined) {
      return match;
    }
  }

  return undefined;
}

function getText(row: MapaSiteRow, keys: string[]) {
  for (const key of keys) {
    const value = getRowValue(row, [key]);
    if (value == null) {
      continue;
    }

    const text = String(value).trim();
    if (text) {
      return text;
    }
  }

  return "";
}

function parseCoordinate(value: unknown) {
  if (value == null) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function getDistanceKm(a: PointPosition, b: PointPosition) {
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const haversine =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function isNearAnySite(personalPosition: PointPosition, sitePositions: PointPosition[]) {
  if (sitePositions.length === 0) {
    return false;
  }

  return sitePositions.some((sitePosition) => getDistanceKm(personalPosition, sitePosition) <= PERSONAL_SITE_RADIUS_KM);
}

function formatArrivalTime(minutesFromNow: number) {
  const arrival = new Date(Date.now() + Math.max(0, minutesFromNow) * 60 * 1000);
  return arrival.toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDurationText(durationMillis: number) {
  const totalSeconds = Math.max(0, Math.round(durationMillis / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [] as string[];

  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? "hora" : "horas"}`);
  }

  if (minutes > 0 || hours > 0) {
    parts.push(`${minutes} ${minutes === 1 ? "minuto" : "minutos"}`);
  }

  parts.push(`${seconds} ${seconds === 1 ? "segundo" : "segundos"}`);

  return parts.join(" ");
}

function parseDurationMinutes(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  if (text.includes("sin tiempo") || text.includes("ruta no disponible")) {
    return null;
  }

  if (text.includes("menos de 1 minuto")) {
    return 1;
  }

  const hourMatch = text.match(/(\d+)\s*(hora|horas|h)/);
  const minuteMatch = text.match(/(\d+)\s*(minuto|minutos|min|m)/);
  const secondMatch = text.match(/(\d+)\s*(segundo|segundos|s)/);

  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
  const seconds = secondMatch ? Number(secondMatch[1]) : 0;

  if (hours === 0 && minutes === 0 && seconds === 0) {
    const fallback = Number(text.replace(/[^0-9.,]/g, "").replace(",", "."));
    return Number.isFinite(fallback) ? Math.max(1, Math.round(fallback)) : null;
  }

  return Math.max(1, Math.round(hours * 60 + minutes + seconds / 60));
}

function getPosition(row: MapaSiteRow) {
  const lat = parseCoordinate(
    getRowValue(row, ["Latitud", "latitud", "Lat", "lat", "Latitude", "latitude"]),
  );
  const lng = parseCoordinate(
    getRowValue(row, ["Longitud", "longitud", "Lon", "lon", "Lng", "lng", "Longitude", "longitude"]),
  );

  if (lat == null || lng == null) {
    return null;
  }

  return { lat, lng };
}

function formatPositionKey(position: PointPosition) {
  return `${position.lat.toFixed(6)},${position.lng.toFixed(6)}`;
}

function getSiteKey(row: MapaSiteRow) {
  const idSite = getText(row, ["IdSite", "idSite", "idsite", "Codigo", "codigo", "Id", "id"]);
  if (idSite) {
    return `id:${normalizeText(idSite)}`;
  }

  const siteName = getSiteName(row);
  const department = getDepartment(row);
  const position = getPosition(row);

  if (position) {
    return `pos:${formatPositionKey(position)}|site:${normalizeText(siteName)}|dep:${normalizeText(department)}`;
  }

  return `site:${normalizeText(siteName)}|dep:${normalizeText(department)}`;
}

function getPersonalName(row: MapaSiteRow) {
  return getText(row, [
    "NombreEmpleado",
    "nombreEmpleado",
    "nombreempleado",
    "Empleado",
    "empleado",
    "NombreCompleto",
    "nombreCompleto",
    "NombresApellidos",
    "nombresApellidos",
    "Nombres",
    "nombres",
    "Apellidos",
    "apellidos",
  ]) || "Sin empleado";
}

function getPersonalDepartment(row: MapaSiteRow) {
  return (
    getText(row, [
      "NombreDepartamento",
      "nombreDepartamento",
      "DepartamentoPersonal",
      "departamentoPersonal",
      "Departamento",
      "departamento",
      "Area",
      "area",
      "Sede",
      "sede",
    ]) || "Sin departamento"
  );
}

function getPersonalType(row: MapaSiteRow) {
  const ubicacion = normalizeText(getPersonalUbicacion(row));
  const ubicacionCompacta = ubicacion.replace(/\s+/g, "");

  if (
    ubicacion.includes("2*1") ||
    ubicacion.includes("2x1") ||
    ubicacion.includes("2'1") ||
    ubicacion.includes("2-1") ||
    /\b2\s*['x\-]?\s*1\b/.test(ubicacion) ||
    ubicacionCompacta.includes("21")
  ) {
    return "2x1";
  }

  if (ubicacion.includes("campo")) {
    return "campo";
  }

  return "otro";
}

function getPersonalUbicacion(row: MapaSiteRow) {
  return getText(row, ["UBICACION", "Ubicacion", "ubicacion"]);
}

function formatDateAsistencia(value: string | null | undefined) {
  if (!value) {
    return "Sin fecha";
  }

  const normalized = value.trim();
  const compactDate = normalized.match(/^(\d{2}\/\d{2}\/\d{4})/);
  if (compactDate) {
    return compactDate[1];
  }

  const dateOnly = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function buildPersonalInfoHtml(item: any) {
  const photoPath = getPointImagePath(item);
  const photoTitle = `${item.nombre || "Empleado"} - Imagen final`;

  return `
    <div style="font-family: Arial, sans-serif; min-width: 220px;">
      <div style="font-weight: 700; font-size: 14px; margin-bottom: 6px;">${item.nombre}</div>
      <div style="font-size: 12px; margin-bottom: 3px;">Codigo: ${item.idEmpleado || "-"}</div>
      <div style="font-size: 14px; margin: 6px 0 4px; font-weight: 700;">Fecha Asistencia: ${formatDateAsistencia(item.fechaAsistencia)}</div>
      <div style="font-size: 12px; margin-bottom: 3px;">Ubicacion: ${item.ubicacion || "-"}</div>
      <div style="font-size: 12px;">Lat/Lon: ${item.position.lat.toFixed(6)}, ${item.position.lng.toFixed(6)}</div>
      <div style="margin-top: 10px;">
        <button
          type="button"
          data-mapasite-photo-button="1"
          data-photo-path="${photoPath.replace(/"/g, "&quot;")}"
          data-photo-title="${photoTitle.replace(/"/g, "&quot;")}"
          style="
            border: 1px solid #c4b5fd;
            background: #7c3aed;
            color: #ffffff;
            border-radius: 10px;
            padding: 8px 12px;
            font-size: 12px;
            font-weight: 800;
            cursor: pointer;
          "
        >
          Foto
        </button>
      </div>
    </div>
  `;
}

function getPersonalPosition(row: MapaSiteRow) {
  const lat = parseCoordinate(
    getRowValue(row, ["LatitudFinal", "latitudFinal", "Latitudfinal", "latitudfinal", "Latitud_Final", "latitud_final"]),
  );
  const lng = parseCoordinate(
    getRowValue(row, ["LongitudFinal", "longitudFinal", "Longitudfinal", "longitudfinal", "Longitud_Final", "longitud_final"]),
  );

  if (lat == null || lng == null) {
    return null;
  }

  return { lat, lng };
}

function getPersonalKey(row: MapaSiteRow) {
  const idEmpleado = getText(row, ["IdEmpleado", "idEmpleado", "idempleado", "Id", "id", "Codigo", "codigo"]);
  if (idEmpleado) {
    return `id:${normalizeText(idEmpleado)}`;
  }

  const name = getPersonalName(row);
  const department = getPersonalDepartment(row);
  const position = getPersonalPosition(row);

  if (position) {
    return `pos:${formatPositionKey(position)}|name:${normalizeText(name)}|dep:${normalizeText(department)}`;
  }

  return `name:${normalizeText(name)}|dep:${normalizeText(department)}`;
}


function buildMarkerIcon(color: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
      <path fill="${color}" d="M18 2.5c-5.79 0-10.5 4.71-10.5 10.5 0 7.9 10.5 20.5 10.5 20.5S28.5 20.9 28.5 13c0-5.79-4.71-10.5-10.5-10.5z"/>
      <circle cx="18" cy="13" r="4.7" fill="#fff"/>
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new window.google!.maps.Size(36, 36),
    anchor: new window.google!.maps.Point(18, 34),
  };
}

async function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps && typeof window.google.maps.importLibrary === "function") {
    console.info("[mapasite] Google Maps ya estaba disponible con importLibrary.");
    return;
  }

  if (!googleMapsLoadPromise) {
    googleMapsLoadPromise = new Promise<void>((resolve, reject) => {
      const g = window as typeof window & { google?: any };
      const c = "google";
      const l = "importLibrary";
      const q = "__ib__";
      const m = document;
      const b = window as typeof window & { google?: any };
      const a = m.createElement("script");
      const e = new URLSearchParams();
      const r = new Set<string>();
      const googleNamespace = (b[c] ||= {});
      const mapsNamespace = (googleNamespace.maps ||= {});

      if (typeof mapsNamespace[l] !== "function") {
        const u = () =>
          (googleMapsLoadPromise ||= new Promise<void>((innerResolve, innerReject) => {
            e.set("libraries", [...r].join(","));
            for (const key of Object.keys({ key: apiKey, v: "weekly" })) {
              const value = key === "key" ? apiKey : "weekly";
              e.set(key, value);
            }
            e.set("callback", `${c}.maps.${q}`);
            a.id = GOOGLE_SCRIPT_ID;
            a.async = true;
            a.nonce = (m.querySelector("script[nonce]") as HTMLScriptElement | null)?.nonce || "";
            a.src = `https://maps.${c}apis.com/maps/api/js?${e.toString()}`;
            mapsNamespace[q] = () => innerResolve();
            a.onerror = () => {
              console.error("[mapasite] Error al cargar el bootstrap moderno de Google Maps.");
              googleMapsLoadPromise = null;
              innerReject(new Error("No se pudo cargar Google Maps."));
            };
            m.head.append(a);
          }));

        mapsNamespace[l] = ((f: string, ...n: unknown[]) => {
          r.add(f);
          return u().then(() => mapsNamespace[l](f, ...n));
        }) as any;
      }

      void Promise.all([
        mapsNamespace[l]("maps"),
        mapsNamespace[l]("marker"),
      ])
        .then(() => {
          console.info("[mapasite] Bootstrap moderno de Google Maps cargado correctamente.");
          resolve();
        })
        .catch((error) => {
          googleMapsLoadPromise = null;
          reject(error instanceof Error ? error : new Error("No se pudo cargar Google Maps."));
        });
    });
  }

  return googleMapsLoadPromise;
}

function getDepartment(row: MapaSiteRow) {
  return getText(row, ["Departamento", "departamento", "NombreDepartamento", "nombreDepartamento", "Depto", "depto", "Area", "area"]) || "Sin departamento";
}

function getSiteName(row: MapaSiteRow) {
  return getText(row, ["NombreSite", "nombreSite", "nombresite", "NombreSitio", "nombreSitio", "Site", "site"]) || "Sin sitio";
}

function getClientName(row: MapaSiteRow) {
  return getText(row, ["NombreCliente", "nombreCliente", "Cliente", "cliente"]) || "Sin cliente";
}

function getProjectName(row: MapaSiteRow) {
  return getText(row, ["NombreProyecto", "nombreProyecto", "Proyecto", "proyecto"]) || "Sin proyecto";
}

function getPointLocationLabel(point: any) {
  if (!point) {
    return "Sin ubicacion";
  }

  if (point.kind === "sitio") {
    return point.direccion || point.referencia || `${point.position.lat.toFixed(6)}, ${point.position.lng.toFixed(6)}`;
  }

  return point.origen || point.fechaHora || `${point.position.lat.toFixed(6)}, ${point.position.lng.toFixed(6)}`;
}

function getPointImagePath(point: any) {
  if (!point) {
    return "";
  }

  const source = (point.row ?? point.sourceRow ?? point.item ?? point) as MapaSiteRow;
  return getText(source, ["IMAGENFINAL", "ImagenFinal", "imagenFinal", "imagenfinal"]);
}

function encodeSharePointPath(path: string) {
  return path
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function getPointImageUrlFromPath(raw: string) {
  if (!raw) {
    return "";
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  const trimmed = raw.replace(/^\/+/, "");
  const sharePointPath = trimmed.includes("/")
    ? trimmed
    : `APLICATIVOS EXTERNOS/ASISTENCIA/${trimmed}`;
  return `${SHAREPOINT_BASE_URL}${encodeSharePointPath(sharePointPath)}`;
}

function getPointImageUrl(point: any) {
  return getPointImageUrlFromPath(getPointImagePath(point));
}

function buildSiteInfoHtml(item: any) {
  const locationLabel = item.direccion || item.referencia || "Ubicacion no resuelta";
  const photoPath = getPointImagePath(item);
  const photoTitle = `${item.nombreSite || "Foto"} - Imagen final`;

  return `
    <div style="font-family: Arial, sans-serif; min-width: 250px; max-width: 320px;">
      <div style="font-weight: 700; font-size: 14px; margin-bottom: 6px;">${item.nombreSite}</div>
      <div style="font-size: 12px; margin-bottom: 3px;"><strong>Departamento:</strong> ${item.departamento}</div>
      <div style="font-size: 12px; margin-bottom: 3px;"><strong>Cliente:</strong> ${item.cliente}</div>
      <div style="font-size: 12px; margin-bottom: 3px;"><strong>Proyecto:</strong> ${item.proyecto}</div>
      <div style="font-size: 12px; margin-bottom: 3px;"><strong>Codigo:</strong> ${item.idSite || "-"}</div>
      <div style="font-size: 12px; margin-bottom: 3px;"><strong>Ubicacion:</strong> ${locationLabel}</div>
      <div style="font-size: 12px; margin-bottom: 3px;"><strong>Provincia:</strong> ${item.provincia || "-"}</div>
      <div style="font-size: 12px; margin-bottom: 3px;"><strong>Distrito:</strong> ${item.distrito || "-"}</div>
      <div style="font-size: 12px;">Lat/Lon: ${item.position.lat.toFixed(6)}, ${item.position.lng.toFixed(6)}</div>
    </div>
  `;
}

function getPointDisplayName(point: any) {
  if (!point) {
    return "";
  }

  if (point.kind === "sitio") {
    return point.nombreSite || "Sin sitio";
  }

  return point.nombre || point.nombreEmpleado || "Sin empleado";
}

function getPersonalMarkerGlyph(value: string) {
  const parts = value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const glyph = parts.slice(0, 2).map((part) => part[0]).join("");
  return (glyph || "P").toUpperCase().slice(0, 2);
}

function getRecordKind(row: MapaSiteRow) {
  const typeText = normalizeText(
    getText(row, [
      "TipoRegistro",
      "tipoRegistro",
      "Tipo",
      "tipo",
      "Categoria",
      "categoria",
      "Clase",
      "clase",
      "Origen",
      "origen",
      "Grupo",
      "grupo",
    ]),
  );

  if (typeText.includes("personal") || typeText.includes("empleado") || typeText.includes("colaborador")) {
    return "personal";
  }

  const personalLabel = getText(row, ["NombrePersonal", "nombrePersonal", "Personal", "personal", "Empleado", "empleado"]);
  if (personalLabel) {
    return "personal";
  }

  return "sitio";
}

export default function MapaSitePage() {
  const [siteRows, setSiteRows] = useState<MapaSiteRow[]>([]);
  const [personalRows, setPersonalRows] = useState<MapaSiteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPersonal, setLoadingPersonal] = useState(false);
  const [loadingMap, setLoadingMap] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapTilesReady, setMapTilesReady] = useState(false);
  const [mapDiagnostics, setMapDiagnostics] = useState<MapDiagnostics>({
    bootstrapReady: false,
    tilesReady: false,
    mapCardHeight: null,
    containerWidth: 0,
    containerHeight: 0,
    status: "Esperando inicialización",
  });
  const [pageError, setPageError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [nombreSitioFilter, setNombreSitioFilter] = useState("");
  const [departamentoFilters, setDepartamentoFilters] = useState<string[]>([]);
  const [clienteFilter, setClienteFilter] = useState("");
  const [proyectoFilter, setProyectoFilter] = useState("");
  const [appliedNombreSitioFilter, setAppliedNombreSitioFilter] = useState("");
  const [appliedDepartamentoFilters, setAppliedDepartamentoFilters] = useState<string[]>([]);
  const [appliedClienteFilter, setAppliedClienteFilter] = useState("");
  const [appliedProyectoFilter, setAppliedProyectoFilter] = useState("");
  const [mostrarSitios, setMostrarSitios] = useState(true);
  const [mostrarPersonal, setMostrarPersonal] = useState(false);
  const [activeMapTab, setActiveMapTab] = useState<MapTab>("cobertura");
  const [personalTypeFilter, setPersonalTypeFilter] = useState<"all" | "campo" | "2x1">("all");
  const [departamentoExpanded, setDepartamentoExpanded] = useState(false);
  const [departmentInsightsExpanded, setDepartmentInsightsExpanded] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("operativa");
  const [routeOrigin, setRouteOrigin] = useState<any | null>(null);
  const [routeDestinationSite, setRouteDestinationSite] = useState<any | null>(null);
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [routePopupOpen, setRoutePopupOpen] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [nearestEmployees, setNearestEmployees] = useState<NearestEmployeeRoute[]>([]);
  const [nearestEmployeesLoading, setNearestEmployeesLoading] = useState(false);
  const [nearestEmployeesExpanded, setNearestEmployeesExpanded] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [seguimientoExpanded, setSeguimientoExpanded] = useState(false);
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);
  const [photoPreviewPoint, setPhotoPreviewPoint] = useState<any | null>(null);
  const [photoPreviewMode, setPhotoPreviewMode] = useState<PhotoPreviewMode>("street");
  const [photoPreviewExpanded, setPhotoPreviewExpanded] = useState(false);
  const [photoPreviewLoading, setPhotoPreviewLoading] = useState(false);
  const [photoPreviewError, setPhotoPreviewError] = useState<string | null>(null);
  const [photoViewer, setPhotoViewer] = useState<PhotoViewerState>(null);
  const [photoViewerLoading, setPhotoViewerLoading] = useState(false);
  const [photoViewerError, setPhotoViewerError] = useState<string | null>(null);
  const [mapCardHeight, setMapCardHeight] = useState<number | null>(null);
  const [mapRetryToken, setMapRetryToken] = useState(0);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1440,
  );
  const isGerencialView = viewMode === "gerencial";
  const isCompactLayout = viewportWidth < 1280;
  const isMapExpanded = mapExpanded && !isCompactLayout;

  const pageRef = useRef<HTMLDivElement | null>(null);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const pageErrorRef = useRef<HTMLDivElement | null>(null);
  const mapWrapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const markerRecordsRef = useRef<Array<{ item: any; marker: any }>>([]);
  const infoWindowRef = useRef<any>(null);
  const photoPreviewStreetViewRef = useRef<HTMLDivElement | null>(null);
  const photoPreviewMapRef = useRef<HTMLDivElement | null>(null);
  const photoPreviewMapInstanceRef = useRef<any>(null);
  const photoPreviewMapMarkerRef = useRef<any>(null);
  const photoPreviewPanoramaRef = useRef<any>(null);
  const routePolylinesRef = useRef<any[]>([]);
  const routeOriginRef = useRef<any | null>(null);
  const recenterPeruRef = useRef(false);

  const clearPhotoPreviewMapMarker = () => {
    const marker = photoPreviewMapMarkerRef.current as any;
    if (!marker) {
      return;
    }

    if (typeof marker.setMap === "function") {
      marker.setMap(null);
    } else if ("map" in marker) {
      marker.map = null;
    }

    photoPreviewMapMarkerRef.current = null;
  };

  const clearRouteOverlay = () => {
    routePolylinesRef.current.forEach((polyline) => {
      if (typeof polyline?.setMap === "function") {
        polyline.setMap(null);
      }
    });
    routePolylinesRef.current = [];
    setRouteSummary(null);
    setRoutePopupOpen(false);
    setRouteLoading(false);
  };

  const clearRouteSelection = () => {
    setRouteOrigin(null);
    setRouteDestinationSite(null);
    clearRouteOverlay();
  };

  const closePhotoPreview = () => {
    setPhotoPreviewOpen(false);
    setPhotoPreviewPoint(null);
    setPhotoPreviewLoading(false);
    setPhotoPreviewError(null);
    setPhotoPreviewMode("street");
    setPhotoPreviewExpanded(false);

    if (photoPreviewPanoramaRef.current?.setVisible) {
      photoPreviewPanoramaRef.current.setVisible(false);
    }

    photoPreviewPanoramaRef.current = null;
    clearPhotoPreviewMapMarker();
    photoPreviewMapInstanceRef.current = null;
    setPhotoViewer(null);
    setPhotoViewerLoading(false);
    setPhotoViewerError(null);
  };

  const openPhotoViewer = (sourcePath: string, title: string) => {
    const imageUrl = getPointImageUrlFromPath(sourcePath);
    setPhotoViewer({
      title: title || "Foto",
      url: imageUrl,
      sourcePath,
    });
    setPhotoPreviewMode("photo");

    if (!imageUrl) {
      setPhotoViewerLoading(false);
      setPhotoViewerError("El punto no tiene IMAGENFINAL.");
      return;
    }

    setPhotoViewerLoading(true);
    setPhotoViewerError(null);
  };

  const wireInfoWindowPhotoButton = (infoWindow: any) => {
    if (!window.google?.maps || !infoWindow) {
      return;
    }

    window.google.maps.event.addListenerOnce(infoWindow, "domready", () => {
      const buttons = document.querySelectorAll<HTMLButtonElement>('[data-mapasite-photo-button="1"]');
      buttons.forEach((button) => {
        if (button.dataset.mapasitePhotoBound === "1") {
          return;
        }

        button.dataset.mapasitePhotoBound = "1";
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          window.__openMapasitePhoto?.(button.dataset.photoPath ?? "", button.dataset.photoTitle ?? "Foto");
        });
      });
    });
  };

  useEffect(() => {
    if (!photoPreviewOpen || !photoPreviewPoint?.position || !window.google?.maps) {
      return;
    }

    const mapsApi = window.google.maps;

    if (photoPreviewMode === "street" && photoPreviewPanoramaRef.current) {
      window.requestAnimationFrame(() => {
        mapsApi.event.trigger(photoPreviewPanoramaRef.current, "resize");
      });
      return;
    }

    if (photoPreviewMode === "satellite" && photoPreviewMapInstanceRef.current) {
      window.requestAnimationFrame(() => {
        mapsApi.event.trigger(photoPreviewMapInstanceRef.current, "resize");
      });
    }
  }, [photoPreviewExpanded, photoPreviewMode, photoPreviewOpen, photoPreviewPoint]);

  useEffect(() => {
    window.__openMapasitePhoto = (sourcePath: string, title: string) => {
      openPhotoViewer(sourcePath, title);
    };

    return () => {
      if (window.__openMapasitePhoto) {
        delete window.__openMapasitePhoto;
      }
    };
  }, []);

  const openNativeLocationView = (point: any) => {
    if (!point?.position) {
      return;
    }

    setPhotoPreviewPoint(point);
    setPhotoPreviewMode("street");
    setPhotoPreviewError(null);
    setPhotoPreviewOpen(true);

    if (mapInstanceRef.current) {
      mapInstanceRef.current.panTo(point.position);
      mapInstanceRef.current.setZoom(Math.max(mapInstanceRef.current.getZoom?.() ?? 7, 17));
    }
  };

  const retryMapLoad = () => {
    setMapReady(false);
    setMapTilesReady(false);
    setMapDiagnostics({
      bootstrapReady: false,
      tilesReady: false,
      mapCardHeight: null,
      containerWidth: 0,
      containerHeight: 0,
      status: "Reintentando carga",
    });
    setMapError(null);
    setLoadingMap(true);
    setMapRetryToken((current) => current + 1);
  };

  useEffect(() => {
    const updateViewportWidth = () => {
      setViewportWidth(window.innerWidth);
    };

    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);

    return () => {
      window.removeEventListener("resize", updateViewportWidth);
    };
  }, []);

  const openRouteCalculation = () => {
    if (routeSummary) {
      setRoutePopupOpen(true);
      return;
    }

    if (routeOrigin && routeDestinationSite) {
      void calculateRoute(routeOrigin, routeDestinationSite);
    }
  };

  const requestRouteDetails = async (originPoint: any, destinationPoint: any) => {
    if (!window.google?.maps) {
      throw new Error("Google Maps no esta disponible.");
    }

    const mapsApi = window.google.maps;
    const routesLibrary = (await mapsApi.importLibrary("routes")) as any;
    const Route = routesLibrary.Route;

    const response = await Route.computeRoutes({
      origin: originPoint.position,
      destination: destinationPoint.position,
      travelMode: mapsApi.TravelMode.DRIVING,
      fields: ["durationMillis", "distanceMeters", "path", "legs", "viewport"],
    });

    const route = response.routes?.[0];
    if (!route) {
      throw new Error("No se pudo calcular la ruta.");
    }

    const leg = route.legs?.[0];
    const durationMillis = route.durationMillis ?? leg?.durationMillis ?? 0;
    const durationMinutes = Math.max(1, Math.round(durationMillis / 1000 / 60));

    return {
      summary: {
        originName: getPointDisplayName(originPoint),
        destinationName: getPointDisplayName(destinationPoint),
        distanceText:
          route.distanceMeters != null
            ? `${(route.distanceMeters / 1000).toFixed(route.distanceMeters >= 10000 ? 0 : 1)} km`
            : leg?.distance?.text ?? "Sin distancia",
        distanceKm: route.distanceMeters != null ? route.distanceMeters / 1000 : null,
        durationText: durationMillis > 0 ? formatDurationText(durationMillis) : leg?.duration?.text ?? "Sin tiempo",
        etaText: formatArrivalTime(durationMinutes),
      },
      route,
    };
  };

  const calculateRoute = async (originPoint: any, destinationPoint: any) => {
    if (!window.google?.maps || !mapInstanceRef.current) {
      return;
    }

    routePolylinesRef.current.forEach((polyline) => {
      if (typeof polyline?.setMap === "function") {
        polyline.setMap(null);
      }
    });
    routePolylinesRef.current = [];

    setRouteLoading(true);
    setMapError(null);

    try {
      const { route, summary } = await requestRouteDetails(originPoint, destinationPoint);

      const polylines = await route.createPolylines({
        polylineOptions: {
          strokeColor: "#7c3aed",
          strokeOpacity: 0.9,
          strokeWeight: 5,
        },
      });
      routePolylinesRef.current = polylines;
      polylines.forEach((polyline: any) => {
        if (typeof polyline?.setMap === "function") {
          polyline.setMap(mapInstanceRef.current);
        }
      });

      setRouteSummary(summary);
      setRoutePopupOpen(true);

      if (route.viewport) {
        mapInstanceRef.current.fitBounds(route.viewport);
      } else if (route.path?.length) {
        const bounds = new window.google!.maps.LatLngBounds();
        route.path.forEach((point: any) => bounds.extend(point));
        mapInstanceRef.current.fitBounds(bounds);
      }
    } catch (error) {
      setRouteSummary(null);
      setRoutePopupOpen(false);
      setMapError(getHttpErrorMessage(error, "No se pudo calcular la ruta."));
    } finally {
      setRouteLoading(false);
    }
  };

  useEffect(() => {
    routeOriginRef.current = routeOrigin;
  }, [routeOrigin]);

  useEffect(() => {
    if (!routeOrigin || !routeDestinationSite) {
      return;
    }

    void calculateRoute(routeOrigin, routeDestinationSite);
  }, [routeOrigin, routeDestinationSite]);

  const loadSites = async (overrides?: {
    nombreSite?: string;
    departamento?: string;
    cliente?: string;
    proyecto?: string;
  }) => {
    setLoading(true);
    setPageError(null);

    try {
      const resolveDepartamentoQuery = (values: string[]) => {
        if (values.length === 0 || values.length === departamentos.length) {
          return undefined;
        }

        return values.join("|");
      };

      const departamentoQuery = overrides?.departamento ?? resolveDepartamentoQuery(appliedDepartamentoFilters);
      const clienteQuery = overrides?.cliente ?? (appliedClienteFilter.trim() || undefined);
      const proyectoQuery = overrides?.proyecto ?? (appliedProyectoFilter.trim() || undefined);
      const nombreSiteQuery = overrides?.nombreSite ?? (appliedNombreSitioFilter.trim() || undefined);

      const data = await consultarMapaSite({
        nombreSite: nombreSiteQuery,
        departamento: departamentoQuery,
        cliente: clienteQuery,
        proyecto: proyectoQuery,
      });

      setSiteRows(data);
    } catch (error) {
      setPageError(getHttpErrorMessage(error, "No se pudo cargar el listado de sitios."));
    } finally {
      setLoading(false);
    }
  };

  const loadPersonal = async () => {
    setLoadingPersonal(true);
    setMapError(null);

    try {
      const data = await consultarMapaPersonal();
      setPersonalRows(data);
    } catch (error) {
      setMapError(getHttpErrorMessage(error, "No se pudo cargar el listado de personal."));
    } finally {
      setLoadingPersonal(false);
    }
  };

  useEffect(() => {
    void loadSites();
  }, [mapRetryToken]);

  useEffect(() => {
    if (mostrarPersonal) {
      if (personalRows.length === 0) {
        void loadPersonal();
      }
      return;
    }

    setPersonalTypeFilter("all");
  }, [mostrarPersonal]);

  useEffect(() => {
    if (activeMapTab === "sitios") {
      setMostrarSitios(true);
      setMostrarPersonal(false);
      return;
    }

    if (activeMapTab === "personal") {
      setMostrarSitios(false);
      setMostrarPersonal(true);
      if (personalRows.length === 0) {
        void loadPersonal();
      }
      return;
    }

    setMostrarSitios(true);
    setMostrarPersonal(true);
    if (personalRows.length === 0) {
      void loadPersonal();
    }
  }, [activeMapTab, personalRows.length]);

  useLayoutEffect(() => {
    const updateMapHeight = () => {
      const pageNode = pageRef.current;
      const heroNode = heroRef.current;

      if (!pageNode || !heroNode) {
        return;
      }

      const pageTop = pageNode.getBoundingClientRect().top;
      const viewportHeight = window.innerHeight;
      const heroHeight = heroNode.getBoundingClientRect().height;
      const errorHeight = pageErrorRef.current?.getBoundingClientRect().height ?? 0;
      const spacing = pageError ? 36 : 18;
      const availableHeight = viewportHeight - pageTop;
      const nextHeight = Math.max(420, Math.floor(availableHeight - heroHeight - errorHeight - spacing));

      setMapCardHeight(nextHeight);
    };

    updateMapHeight();

    const resizeObserver = new ResizeObserver(() => {
      updateMapHeight();
    });

    if (pageRef.current) {
      resizeObserver.observe(pageRef.current);
    }

    if (heroRef.current) {
      resizeObserver.observe(heroRef.current);
    }

    if (pageErrorRef.current) {
      resizeObserver.observe(pageErrorRef.current);
    }

    window.addEventListener("resize", updateMapHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateMapHeight);
    };
  }, [pageError]);

  useEffect(() => {
    const mapWrap = mapWrapRef.current;
    if (!mapWrap) {
      return;
    }

    const updateDiagnostics = () => {
      const rect = mapWrap.getBoundingClientRect();
      setMapDiagnostics({
        bootstrapReady: mapReady,
        tilesReady: mapTilesReady,
        mapCardHeight,
        containerWidth: Math.round(rect.width),
        containerHeight: Math.round(rect.height),
        status:
          rect.width <= 0 || rect.height <= 0
            ? "Contenedor sin dimensiones visibles"
            : mapTilesReady
            ? "Tiles cargados"
            : loadingMap
            ? "Esperando tiles de Google Maps"
            : "Bootstrap listo",
      });
    };

    updateDiagnostics();

    const observer = new ResizeObserver(() => {
      updateDiagnostics();
    });

    observer.observe(mapWrap);

    return () => {
      observer.disconnect();
    };
  }, [loadingMap, mapCardHeight, mapReady, mapTilesReady]);

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
    const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID?.trim();

    if (!apiKey) {
      setMapError("Falta configurar VITE_GOOGLE_MAPS_API_KEY en el frontend.");
      return;
    }

    if (!mapId) {
      console.warn(
        "[mapasite] Falta VITE_GOOGLE_MAPS_MAP_ID. Se usara DEMO_MAP_ID para mantener el flujo moderno, pero conviene configurar un Map ID real.",
      );
    }

    let cancelled = false;
    window.gm_authFailure = () => {
      if (!cancelled) {
        setMapReady(false);
        setMapTilesReady(false);
        setMapError(
          "Google Maps rechazo la autenticacion. Revisa la API key, la facturacion y las restricciones de referrer en Google Cloud.",
        );
        setLoadingMap(false);
        setMapDiagnostics((current) => ({
          ...current,
          bootstrapReady: false,
          tilesReady: false,
          status: "Autenticación rechazada",
        }));
      }
    };
    setLoadingMap(true);
    setMapError(null);

    loadGoogleMaps(apiKey)
      .then(() => {
        if (!cancelled) {
          setMapReady(true);
          setMapDiagnostics((current) => ({
            ...current,
            bootstrapReady: true,
            status: "Bootstrap moderno cargado",
          }));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMapError(getHttpErrorMessage(error, "No se pudo cargar Google Maps."));
          setMapDiagnostics((current) => ({
            ...current,
            bootstrapReady: false,
            tilesReady: false,
            status: "Error al cargar bootstrap",
          }));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingMap(false);
        }
      });

    return () => {
      cancelled = true;
      delete window.gm_authFailure;
    };
  }, []);

  const departamentos = useMemo(() => {
    const values = new Set<string>();
    for (const row of siteRows) {
      values.add(getDepartment(row));
    }
    return [...values].sort(compareVisualText);
  }, [siteRows]);

  const clientes = useMemo(() => {
    const values = new Set<string>();
    for (const row of siteRows) {
      values.add(getClientName(row));
    }
    return [...values].sort(compareVisualText);
  }, [siteRows]);

  const proyectos = useMemo(() => {
    const values = new Set<string>();
    for (const row of siteRows) {
      values.add(getProjectName(row));
    }
    return [...values].sort(compareVisualText);
  }, [siteRows]);

  const departamentoSummary = useMemo(() => {
    if (appliedDepartamentoFilters.length === 0 || appliedDepartamentoFilters.length === departamentos.length) {
      return "Todos los departamentos";
    }

    if (appliedDepartamentoFilters.length === 1) {
      return appliedDepartamentoFilters[0];
    }

    return `${appliedDepartamentoFilters.length} departamentos seleccionados`;
  }, [appliedDepartamentoFilters, departamentos.length]);

  const filteredRows = useMemo(() => {
    const clientQuery = normalizeText(clienteFilter);
    const projectQuery = normalizeText(proyectoFilter);
    const departmentQueries = departamentoFilters.map((item) => normalizeText(item)).filter(Boolean);

    if (!mostrarSitios) {
      return [];
    }

    return siteRows.filter((row) => {
      const client = getClientName(row);
      const project = getProjectName(row);
      const department = getDepartment(row);

      const matchesClient = !clientQuery || normalizeText(client).includes(clientQuery);
      const matchesProject = !projectQuery || normalizeText(project).includes(projectQuery);
      const matchesDepartment =
        departmentQueries.length === 0 ||
        departmentQueries.some((query) => normalizeText(department).includes(query));

      return matchesClient && matchesProject && matchesDepartment;
    });
  }, [siteRows, appliedClienteFilter, appliedDepartamentoFilters, appliedProyectoFilter, mostrarSitios]);

  const visibleSites = useMemo(
    () =>
      (() => {
        const seen = new Set<string>();

        return filteredRows
          .map((row, index) => {
            const position = getPosition(row);
            const siteKey = getSiteKey(row);
            return {
              kind: "sitio" as const,
              row,
              index,
              siteKey,
              position,
              nombreSite: getSiteName(row),
              departamento: getDepartment(row),
              cliente: getClientName(row),
              proyecto: getProjectName(row),
              idSite: getText(row, ["IdSite", "idSite", "idsite", "Codigo", "codigo", "Id", "id"]),
              provincia: getText(row, ["Provincia", "provincia", "NombreProvincia", "nombreProvincia"]),
              distrito: getText(row, ["Distrito", "distrito", "NombreDistrito", "nombreDistrito"]),
              direccion: getText(row, ["Direccion", "direccion", "DireccionCompleta", "direccionCompleta"]),
              referencia: getText(row, ["Referencia", "referencia", "Localizacion", "localizacion", "Ubicacion", "ubicacion"]),
            };
          })
          .filter((item): item is NonNullable<typeof item> & { position: PointPosition } => item.position != null)
          .filter((item) => {
            if (seen.has(item.siteKey)) {
              return false;
            }

            seen.add(item.siteKey);
            return true;
          });
      })(),
    [filteredRows],
  ).sort((a, b) => {
    const departmentCompare = compareVisualText(a.departamento, b.departamento);
    if (departmentCompare !== 0) {
      return departmentCompare;
    }

    const nameCompare = compareVisualText(a.nombreSite, b.nombreSite);
    if (nameCompare !== 0) {
      return nameCompare;
    }

    return compareVisualText(a.idSite, b.idSite);
  });

  const visibleSitePositions = useMemo(
    () => visibleSites.map((item) => item.position),
    [visibleSites],
  );

  const visiblePersonal = useMemo(
    () => {
      if (!mostrarPersonal) {
        return [];
      }

      const seen = new Set<string>();

      return personalRows
        .filter((row) => personalTypeFilter === "all" || getPersonalType(row) === personalTypeFilter)
        .filter((row) => {
          if (appliedDepartamentoFilters.length === 0) {
            return true;
          }

          const personalPosition = getPersonalPosition(row);
          if (!personalPosition) {
            return false;
          }

          return isNearAnySite(personalPosition, visibleSitePositions);
        })
        .map((row, index) => {
          const position = getPersonalPosition(row);
          const name = getPersonalName(row);
          return {
            kind: "personal" as const,
            row,
            index,
            key: getPersonalKey(row),
            position,
            nombre: name,
            departamento: getPersonalDepartment(row),
            cliente: getText(row, ["Cliente", "cliente", "NombreCliente", "nombreCliente"]),
            proyecto: getText(row, ["Proyecto", "proyecto", "NombreProyecto", "nombreProyecto"]),
            idEmpleado: getText(row, ["IdEmpleado", "idEmpleado", "idempleado", "Id", "id", "Codigo", "codigo"]),
            cargo: getText(row, ["Cargo", "cargo", "Puesto", "puesto"]),
            fechaAsistencia: getText(row, ["FechaAsistencia", "fechaAsistencia", "Fecha", "fecha"]),
            origen: getText(row, ["OrigenMarcacion", "origenMarcacion", "Origen", "origen"]),
            ubicacion: getPersonalUbicacion(row),
            fechaHora: getText(row, ["FechaHora", "fechaHora", "FechaMovimiento", "fechaMovimiento", "Fecha", "fecha"]),
            hora: getText(row, ["Hora", "hora", "HoraMovimiento", "horaMovimiento"]),
          };
        })
        .filter((item): item is NonNullable<typeof item> & { position: PointPosition } => item.position != null)
        .filter((item) => {
          if (seen.has(item.key)) {
            return false;
          }

          seen.add(item.key);
          return true;
        });
    },
    [appliedDepartamentoFilters, mostrarPersonal, personalRows, personalTypeFilter, visibleSitePositions],
  ).sort((a, b) => {
    const departmentCompare = compareVisualText(a.departamento, b.departamento);
    if (departmentCompare !== 0) {
      return departmentCompare;
    }

    const nameCompare = compareVisualText(a.nombre, b.nombre);
    if (nameCompare !== 0) {
      return nameCompare;
    }

    return compareVisualText(a.idEmpleado, b.idEmpleado);
  });

  const insightPersonal = useMemo(() => {
    if (!mostrarPersonal) {
      return [];
    }

    const seen = new Set<string>();
    const departmentQueries = appliedDepartamentoFilters.map((item) => normalizeText(item)).filter(Boolean);

    return personalRows
      .filter((row) => personalTypeFilter === "all" || getPersonalType(row) === personalTypeFilter)
      .filter((row) => {
        if (departmentQueries.length === 0) {
          return true;
        }

        const department = getPersonalDepartment(row);
        return departmentQueries.some((query) => normalizeText(department).includes(query));
      })
      .map((row, index) => {
        const position = getPersonalPosition(row);
        const name = getPersonalName(row);
        return {
          kind: "personal" as const,
          row,
          index,
          key: getPersonalKey(row),
          position,
          nombre: name,
          departamento: getPersonalDepartment(row),
          cliente: getText(row, ["Cliente", "cliente", "NombreCliente", "nombreCliente"]),
          proyecto: getText(row, ["Proyecto", "proyecto", "NombreProyecto", "nombreProyecto"]),
          idEmpleado: getText(row, ["IdEmpleado", "idEmpleado", "idempleado", "Id", "id", "Codigo", "codigo"]),
          cargo: getText(row, ["Cargo", "cargo", "Puesto", "puesto"]),
          fechaAsistencia: getText(row, ["FechaAsistencia", "fechaAsistencia", "Fecha", "fecha"]),
          origen: getText(row, ["OrigenMarcacion", "origenMarcacion", "Origen", "origen"]),
          ubicacion: getPersonalUbicacion(row),
          fechaHora: getText(row, ["FechaHora", "fechaHora", "FechaMovimiento", "fechaMovimiento", "Fecha", "fecha"]),
          hora: getText(row, ["Hora", "hora", "HoraMovimiento", "horaMovimiento"]),
        };
      })
      .filter((item): item is NonNullable<typeof item> & { position: PointPosition } => item.position != null)
      .filter((item) => {
        if (seen.has(item.key)) {
          return false;
        }

        seen.add(item.key);
        return true;
      });
  }, [appliedDepartamentoFilters, mostrarPersonal, personalRows, personalTypeFilter]);

  const visibleDepartments = useMemo(() => {
    const values = new Set<string>();

    for (const item of visibleSites) {
      values.add(item.departamento);
    }

    for (const item of visiblePersonal) {
      values.add(item.departamento);
    }

    return values;
  }, [visiblePersonal, visibleSites]);

  const nearestEmployeeCandidates = useMemo(() => {
    if (!routeDestinationSite?.position) {
      return [];
    }

    const seen = new Set<string>();

    return personalRows
      .filter((row) => personalTypeFilter === "all" || getPersonalType(row) === personalTypeFilter)
      .map((row) => {
        const position = getPersonalPosition(row);
        if (!position) {
          return null;
        }

        const key = getPersonalKey(row);
        if (seen.has(key)) {
          return null;
        }

        seen.add(key);

        return {
          key,
          nombre: getPersonalName(row),
          departamento: getPersonalDepartment(row),
          cargo: getText(row, ["Cargo", "cargo", "Puesto", "puesto"]),
          idEmpleado: getText(row, ["IdEmpleado", "idEmpleado", "idempleado", "Id", "id", "Codigo", "codigo"]),
          ubicacion: getPersonalUbicacion(row),
          position,
          straightDistanceKm: getDistanceKm(position, routeDestinationSite.position),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item != null)
      .sort((a, b) => a.straightDistanceKm - b.straightDistanceKm)
      .slice(0, 5);
  }, [personalRows, personalTypeFilter, routeDestinationSite]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!routeDestinationSite?.position) {
        setNearestEmployees([]);
        setNearestEmployeesLoading(false);
        return;
      }

      if (nearestEmployeeCandidates.length === 0) {
        setNearestEmployees([]);
        setNearestEmployeesLoading(false);
        return;
      }

      setNearestEmployeesLoading(true);

      try {
        const nextItems = await Promise.all(
          nearestEmployeeCandidates.map(async (candidate) => {
            try {
              const { summary } = await requestRouteDetails(candidate, routeDestinationSite);
              return {
                ...candidate,
                routeDistanceKm: summary.distanceKm ?? candidate.straightDistanceKm,
                routeDistanceText: summary.distanceText,
                routeDurationText: summary.durationText,
                etaText: summary.etaText,
                routeAvailable: true,
              } satisfies NearestEmployeeRoute;
            } catch (error) {
              return {
                ...candidate,
                routeDistanceKm: candidate.straightDistanceKm,
                routeDistanceText: `${candidate.straightDistanceKm.toFixed(1)} km`,
                routeDurationText: "Ruta no disponible",
                etaText: "Sin ETA",
                routeAvailable: false,
                routeError: getHttpErrorMessage(error, "No se pudo calcular la ruta."),
              } satisfies NearestEmployeeRoute;
            }
          }),
        );

        if (!cancelled) {
          setNearestEmployees(nextItems.sort((a, b) => a.routeDistanceKm - b.routeDistanceKm));
        }
      } finally {
        if (!cancelled) {
          setNearestEmployeesLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [nearestEmployeeCandidates, routeDestinationSite]);

  const visiblePoints = useMemo(() => {
    const merged = [...visibleSites, ...visiblePersonal];
    const seen = new Set<string>();

    return merged
      .sort((a, b) => {
        const departmentCompare = compareVisualText(a.departamento, b.departamento);
        if (departmentCompare !== 0) {
          return departmentCompare;
        }

        const kindCompare = compareVisualPointKind(a.kind) - compareVisualPointKind(b.kind);
        if (kindCompare !== 0) {
          return kindCompare;
        }

        const titleA = a.kind === "sitio" ? a.nombreSite : a.nombre;
        const titleB = b.kind === "sitio" ? b.nombreSite : b.nombre;
        const titleCompare = compareVisualText(titleA, titleB);
        if (titleCompare !== 0) {
          return titleCompare;
        }

        const codeA = a.kind === "sitio" ? a.idSite : a.idEmpleado;
        const codeB = b.kind === "sitio" ? b.idSite : b.idEmpleado;
        return compareVisualText(codeA, codeB);
      })
      .filter((item) => {
      if (seen.has(item.kind === "sitio" ? `site:${item.siteKey}` : `personal:${item.key}`)) {
        return false;
      }

      seen.add(item.kind === "sitio" ? `site:${item.siteKey}` : `personal:${item.key}`);
      return true;
    });
  }, [visiblePersonal, visibleSites]);

  const stats = useMemo(() => {
    const uniqueSites = new Set(siteRows.map((row) => getSiteKey(row))).size;
    const uniquePersonal = new Set(personalRows.map((row) => getPersonalKey(row))).size;
    const uniqueVisible = visiblePoints.length;
    const departments = new Set(siteRows.map((row) => getDepartment(row))).size;

    return {
      totalSites: uniqueSites,
      totalPersonal: uniquePersonal,
      filtered: uniqueVisible,
      withLocation: uniqueVisible,
      departments,
      visibleDepartments: visibleDepartments.size,
    };
  }, [personalRows, siteRows, visibleDepartments.size, visiblePoints.length]);

  const departmentInsights = useMemo(() => {
    const grouped = new Map<
      string,
      {
        department: string;
        siteCount: number;
        personalCount: number;
        sampleSite: string;
        samplePersonal: string;
      }
    >();

    const register = (departmentRaw: string, kind: "site" | "personal", label: string) => {
      const department = departmentRaw || "Sin departamento";
      const current = grouped.get(department) ?? {
        department,
        siteCount: 0,
        personalCount: 0,
        sampleSite: "",
        samplePersonal: "",
      };

      if (kind === "site") {
        current.siteCount += 1;
        if (!current.sampleSite) {
          current.sampleSite = label;
        }
      } else {
        current.personalCount += 1;
        if (!current.samplePersonal) {
          current.samplePersonal = label;
        }
      }

      grouped.set(department, current);
    };

    visibleSites.forEach((item) => register(item.departamento, "site", item.nombreSite));
    insightPersonal.forEach((item) => register(item.departamento, "personal", item.nombre));

    const totalCount = visibleSites.length + visiblePersonal.length;

    return [...grouped.values()]
      .sort((a, b) => {
        if (b.siteCount + b.personalCount !== a.siteCount + a.personalCount) {
          return b.siteCount + b.personalCount - (a.siteCount + a.personalCount);
        }

        return a.department.localeCompare(b.department, "es", { sensitivity: "base" });
      })
      .map((item, index) => {
        const total = item.siteCount + item.personalCount;
        return {
          ...item,
          totalCount: total,
          sharePercent: totalCount > 0 ? (total / totalCount) * 100 : 0,
          color: DEPARTMENT_SWATCHES[index % DEPARTMENT_SWATCHES.length],
        } satisfies DepartmentInsight;
      });
  }, [insightPersonal, visibleSites]);

  const gerencialSummary = useMemo(() => {
    if (departmentInsights.length === 0) {
      return "Sin datos departamentales";
    }

    const top = departmentInsights[0];
    return `${top.department} concentra ${top.totalCount} puntos visibles`;
  }, [departmentInsights]);

  useEffect(() => {
    if (visiblePoints.length === 0) {
      setSelectedIndex(-1);
      return;
    }

    setSelectedIndex((current) => {
      if (current < 0) {
        return 0;
      }

      return Math.min(current, visiblePoints.length - 1);
    });
  }, [visiblePoints.length]);

  useEffect(() => {
    if (!mapReady || !mapCardHeight || !mapWrapRef.current || !window.google?.maps) {
      return;
    }

    const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID?.trim() || "DEMO_MAP_ID";
    let cancelled = false;
    let mapLoadTimeout: number | null = null;
    let cleanupEffect = () => {};

    void (async () => {
      const mapsApi = window.google!.maps;
      for (let attempt = 0; attempt < 6 && typeof mapsApi.importLibrary !== "function"; attempt += 1) {
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      }

      if (typeof mapsApi.importLibrary !== "function") {
        setMapReady(false);
        setMapError("Google Maps no expuso importLibrary. El mapa moderno no pudo inicializarse.");
        setLoadingMap(false);
        setMapDiagnostics((current) => ({
          ...current,
          bootstrapReady: false,
          tilesReady: false,
          status: "importLibrary no disponible",
        }));
        return;
      }

      const mapsLibrary = (await mapsApi.importLibrary("maps")) as any;
      const markerLibrary = (await mapsApi.importLibrary("marker")) as any;
      const MapClass: any = mapsLibrary.Map ?? mapsApi.Map;
      const InfoWindowClass: any = mapsLibrary.InfoWindow ?? mapsApi.InfoWindow;
      const AdvancedMarkerElement: any = markerLibrary.AdvancedMarkerElement ?? null;
      const PinElement: any = markerLibrary.PinElement ?? null;

      if (cancelled) {
        return;
      }

      const mapWrap = mapWrapRef.current;
      if (!mapWrap) {
        setMapError("No se encontro el contenedor del mapa.");
        setLoadingMap(false);
        setMapDiagnostics((current) => ({
          ...current,
          status: "Contenedor no encontrado",
        }));
        return;
      }

      let containerRect = mapWrap.getBoundingClientRect();
      for (let attempt = 0; attempt < 20 && (containerRect.width <= 0 || containerRect.height <= 0); attempt += 1) {
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        containerRect = mapWrap.getBoundingClientRect();
      }

      if (containerRect.width <= 0 || containerRect.height <= 0) {
        setMapError("El contenedor del mapa no tiene dimensiones visibles.");
        setLoadingMap(false);
        setMapDiagnostics((current) => ({
          ...current,
          containerWidth: Math.round(containerRect.width),
          containerHeight: Math.round(containerRect.height),
          status: "Contenedor sin tamaño",
        }));
        return;
      }

      const map =
        mapInstanceRef.current ??
        new MapClass(mapWrap, {
          center: PERU_CENTER,
          zoom: PERU_ZOOM,
          mapId,
          mapTypeControl: true,
          streetViewControl: true,
          fullscreenControl: true,
          zoomControl: true,
          rotateControl: true,
          mapTypeControlOptions: {
            position: mapsApi.ControlPosition.TOP_RIGHT,
          },
          streetViewControlOptions: {
            position: mapsApi.ControlPosition.RIGHT_BOTTOM,
          },
          clickableIcons: false,
          gestureHandling: "greedy",
        });

      mapInstanceRef.current = map;
      setMapTilesReady(false);
      setMapDiagnostics((current) => ({
        ...current,
        bootstrapReady: true,
        tilesReady: false,
        mapCardHeight,
        containerWidth: Math.round(containerRect.width),
        containerHeight: Math.round(containerRect.height),
        status: "Mapa creado, esperando tiles",
      }));

      console.info("[mapasite] Estado del contenedor del mapa:", {
        width: Math.round(containerRect.width),
        height: Math.round(containerRect.height),
        visiblePoints: visiblePoints.length,
        mapId,
      });

      const tilesLoadedListener = map.addListener?.("tilesloaded", () => {
        console.info("[mapasite] Google Maps termino de cargar tiles.");
        setMapTilesReady(true);
        setMapDiagnostics((current) => ({
          ...current,
          tilesReady: true,
          status: "Tiles cargados",
        }));
        if (mapLoadTimeout != null) {
          window.clearTimeout(mapLoadTimeout);
          mapLoadTimeout = null;
        }
      });

      const idleListener = map.addListener?.("idle", () => {
        console.info("[mapasite] Google Maps quedo en estado idle.");
      });

      mapLoadTimeout = window.setTimeout(() => {
        const mapDiv = map.getDiv?.();
        const mapDivRect = mapDiv?.getBoundingClientRect?.();
        console.warn("[mapasite] Tiempo de espera del mapa superado.", {
          mapWidth: Math.round(mapDivRect?.width ?? 0),
          mapHeight: Math.round(mapDivRect?.height ?? 0),
          containerWidth: Math.round(containerRect.width),
          containerHeight: Math.round(containerRect.height),
        });
      }, 6000);

      markersRef.current.forEach((marker) => {
        if (typeof marker?.setMap === "function") {
          marker.setMap(null);
          return;
        }

        if ("map" in marker) {
          marker.map = null;
        }
      });
      markersRef.current = [];
      markerRecordsRef.current = [];

      if (visiblePoints.length === 0) {
        map.setCenter(PERU_CENTER);
        map.setZoom(PERU_ZOOM);
        setMapTilesReady(true);
        setMapDiagnostics((current) => ({
          ...current,
          tilesReady: true,
          status: "Sin puntos visibles",
        }));
        if (mapLoadTimeout != null) {
          window.clearTimeout(mapLoadTimeout);
          mapLoadTimeout = null;
        }
        return;
      }

      const infoWindow = infoWindowRef.current ?? new InfoWindowClass();
      infoWindowRef.current = infoWindow;

      visiblePoints.forEach((item, visibleIndex) => {
        const isSite = item.kind === "sitio";
        const isPersonal = !isSite;
        const pinColor = isSite ? "#2563eb" : activeMapTab === "personal" ? "#7c3aed" : "#f97316";
        const title = isSite ? item.nombreSite : `${item.nombre}${item.departamento ? ` - ${item.departamento}` : ""}`;
        const marker = new AdvancedMarkerElement({
          map,
          position: item.position,
          title,
          gmpClickable: true,
        });

        if (PinElement) {
          const pin = new PinElement({
            glyphText: isSite ? String(visibleIndex + 1) : getPersonalMarkerGlyph(item.nombre),
            background: pinColor,
            glyphColor: "#ffffff",
            borderColor: isSite ? "#1e3a8a" : activeMapTab === "personal" ? "#5b21b6" : "#c2410c",
            scale: isPersonal ? 1.08 : 1,
          });

          marker.append(pin);
        }

        marker.addEventListener("gmp-click", () => {
          setSelectedIndex(visibleIndex);
          if (!isSite) {
            setRouteOrigin(item);
            openNativeLocationView(item);
            infoWindow.setContent(buildPersonalInfoHtml(item));
            infoWindow.open({ map, anchor: marker });
            wireInfoWindowPhotoButton(infoWindow);
            return;
          }

          setRouteDestinationSite(item);
          infoWindow.setContent(buildSiteInfoHtml(item));
          infoWindow.open({ map, anchor: marker });
          wireInfoWindowPhotoButton(infoWindow);
        });

        markerRecordsRef.current.push({ item, marker });
        markersRef.current.push(marker);
      });

      if (recenterPeruRef.current) {
        map.setCenter(PERU_CENTER);
        map.setZoom(PERU_ZOOM);
        recenterPeruRef.current = false;
      }

      map.setCenter(PERU_CENTER);
      map.setZoom(PERU_ZOOM);
      window.requestAnimationFrame(() => {
        window.google?.maps?.event.trigger(map, "resize");
      });

      cleanupEffect = () => {
        if (mapLoadTimeout != null) {
          window.clearTimeout(mapLoadTimeout);
        }
        tilesLoadedListener?.remove?.();
        idleListener?.remove?.();
      };
    })().catch((error: unknown) => {
      if (!cancelled) {
        setMapError(getHttpErrorMessage(error, "No se pudo inicializar el mapa."));
      }
    });

    return () => {
      cancelled = true;
      cleanupEffect();
    };
  }, [activeMapTab, mapReady, mapCardHeight, visiblePoints]);

  useEffect(() => {
    if (!mapInstanceRef.current || selectedIndex < 0) {
      return;
    }

    const selectedPoint = visiblePoints[selectedIndex];
    if (!selectedPoint) {
      return;
    }

    mapInstanceRef.current.panTo(selectedPoint.position);
    mapInstanceRef.current.setZoom(Math.max(mapInstanceRef.current.getZoom?.() ?? 7, 8));

    if (selectedPoint.kind !== "sitio" || routeOriginRef.current || !window.google?.maps) {
      return;
    }

    const record = markerRecordsRef.current[selectedIndex];
    const infoWindow = infoWindowRef.current ?? new window.google.maps.InfoWindow();
    infoWindowRef.current = infoWindow;

    if (record?.marker) {
      infoWindow.setContent(buildSiteInfoHtml(selectedPoint));
      infoWindow.open({ map: mapInstanceRef.current, anchor: record.marker });
      wireInfoWindowPhotoButton(infoWindow);
    }
  }, [selectedIndex, visiblePoints]);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !window.google?.maps) {
      return;
    }

    window.google.maps.event.trigger(mapInstanceRef.current, "resize");
  }, [mapReady, mapCardHeight]);

  useEffect(() => {
    if (!photoPreviewOpen || !photoPreviewPoint?.position) {
      return;
    }

    let cancelled = false;
    let cleanup = () => {};

    if (photoPreviewMode === "photo") {
      if (photoPreviewPanoramaRef.current?.setVisible) {
        photoPreviewPanoramaRef.current.setVisible(false);
      }

      photoPreviewPanoramaRef.current = null;
      clearPhotoPreviewMapMarker();
      photoPreviewMapInstanceRef.current = null;
      setPhotoPreviewLoading(false);
      return;
    }

    const mapsApi = window.google?.maps;
    const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID?.trim() || "DEMO_MAP_ID";
    const streetViewContainer = photoPreviewStreetViewRef.current;
    const satelliteContainer = photoPreviewMapRef.current;

    if (!mapsApi) {
      setPhotoPreviewLoading(false);
      setPhotoPreviewError("Google Maps no termino de cargar para esta vista previa.");
      return;
    }

    if (photoPreviewMode !== "street") {
      if (photoPreviewPanoramaRef.current?.setVisible) {
        photoPreviewPanoramaRef.current.setVisible(false);
      }
      photoPreviewPanoramaRef.current = null;
      if (!satelliteContainer) {
        setPhotoPreviewLoading(false);
        setPhotoPreviewError("No se encontró el contenedor de la vista satelital.");
        return;
      }

      setPhotoPreviewLoading(true);
      setPhotoPreviewError(null);

          const map = photoPreviewMapInstanceRef.current ?? new mapsApi.Map(satelliteContainer, {
            center: photoPreviewPoint.position,
            zoom: 18,
            mapId,
            mapTypeId: "satellite",
            disableDefaultUI: false,
            clickableIcons: false,
        gestureHandling: "auto",
        draggable: true,
        scrollwheel: true,
        keyboardShortcuts: true,
        zoomControl: true,
        fullscreenControl: true,
        mapTypeControl: false,
        streetViewControl: false,
      });

      map.setCenter(photoPreviewPoint.position);
      map.setZoom(18);
      map.setMapTypeId("satellite");
      photoPreviewMapInstanceRef.current = map;

      clearPhotoPreviewMapMarker();

      void mapsApi.importLibrary("marker")
        .then((markerLibrary: any) => {
          if (cancelled) {
            return;
          }

          const AdvancedMarkerElement = markerLibrary?.AdvancedMarkerElement;
          const PinElement = markerLibrary?.PinElement;

          if (AdvancedMarkerElement) {
            const marker = new AdvancedMarkerElement({
              map,
              position: photoPreviewPoint.position,
              title: getPointDisplayName(photoPreviewPoint),
              gmpClickable: false,
            });

            if (PinElement) {
              marker.append(
                new PinElement({
                  background: "#7c3aed",
                  borderColor: "#5b21b6",
                  glyphColor: "#ffffff",
                }),
              );
            }

            photoPreviewMapMarkerRef.current = marker;
          }

          const idleListener = mapsApi.event.addListenerOnce(map, "idle", () => {
            if (!cancelled) {
              setPhotoPreviewLoading(false);
            }
          });

          cleanup = () => {
            idleListener.remove?.();
          };
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setPhotoPreviewLoading(false);
            setPhotoPreviewError("No se pudo cargar la vista satelital.");
            console.error("[mapasite] Error al cargar la vista satelital.", error);
          }
        });

      return () => {
        cancelled = true;
        cleanup();
      };
    }

    if (!streetViewContainer) {
      setPhotoPreviewLoading(false);
      setPhotoPreviewError("No se encontró el contenedor de la vista Street View.");
      return;
    }

    setPhotoPreviewLoading(true);
    setPhotoPreviewError(null);

    clearPhotoPreviewMapMarker();
    photoPreviewMapInstanceRef.current = null;

    if (photoPreviewPanoramaRef.current?.setVisible) {
      photoPreviewPanoramaRef.current.setVisible(false);
    }
    photoPreviewPanoramaRef.current = null;

    const streetViewService = new mapsApi.StreetViewService();
    streetViewService.getPanorama(
      {
        location: photoPreviewPoint.position,
        radius: 150,
      },
      (data: any, status: string) => {
        if (cancelled) {
          return;
        }

        if (status === "OK" && data?.location?.pano) {
          const panorama = new mapsApi.StreetViewPanorama(streetViewContainer, {
            pano: data.location.pano,
            visible: true,
            addressControl: false,
            linksControl: false,
            panControl: false,
            zoomControl: true,
            fullscreenControl: false,
            motionTracking: false,
            showRoadLabels: false,
          });

          photoPreviewPanoramaRef.current = panorama;
          setPhotoPreviewLoading(false);
          return;
        }

        setPhotoPreviewError("No hay Street View en este punto. Usa la vista satelital.");
        setPhotoPreviewLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [photoPreviewMode, photoPreviewOpen, photoPreviewPoint]);

  const selectedPoint = selectedIndex >= 0 ? visiblePoints[selectedIndex] : null;
  const focusedSite = useMemo(() => {
    const selectedSite = routeDestinationSite?.kind === "sitio" ? routeDestinationSite : null;
    if (selectedSite) {
      return selectedSite;
    }

    if (selectedPoint?.kind === "sitio") {
      return selectedPoint;
    }

    return visiblePoints.find((point) => point.kind === "sitio") ?? null;
  }, [routeDestinationSite, selectedPoint, visiblePoints]);
  const photoPreviewImagePath = getPointImagePath(photoPreviewPoint);
  const photoPreviewImageUrl = getPointImageUrl(photoPreviewPoint);
  const dashboardCards = useMemo(() => {
    const durationSamples = nearestEmployees
      .map((item) => parseDurationMinutes(item.routeDurationText) ?? parseDurationMinutes(item.etaText))
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    const averageMinutes = durationSamples.length
      ? Math.round(durationSamples.reduce((total, value) => total + value, 0) / durationSamples.length)
      : null;

    const nearbyPersonalCount = focusedSite
      ? visiblePersonal.filter((item) => getDistanceKm(item.position, focusedSite.position) <= PERSONAL_SITE_RADIUS_KM).length
      : 0;

    const uncoveredPersonalCount = Math.max(0, stats.totalPersonal - nearbyPersonalCount);

    return [
      {
        label: "Sitios",
        value: stats.totalSites,
        hint: "Total registrados",
        icon: MapPinned,
        tone: "violet",
      },
      {
        label: "Personal localizado",
        value: stats.totalPersonal,
        hint: "Con ubicación válida",
        icon: Building2,
        tone: "blue",
      },
      {
        label: "Departamentos",
        value: stats.departments,
        hint: "Con presencia activa",
        icon: Layers3,
        tone: "indigo",
      },
      {
        label: "Cobertura cercana",
        value: nearbyPersonalCount,
        hint: "Dentro del radio del sitio",
        icon: Search,
        tone: "green",
      },
      {
        label: "Sin cobertura",
        value: uncoveredPersonalCount,
        hint: "Fuera del radio del sitio",
        icon: TriangleAlert,
        tone: "rose",
      },
      {
        label: "ETA promedio",
        value: averageMinutes != null ? `${averageMinutes} min` : "Sin cálculo",
        hint: focusedSite ? "Tiempo estimado" : "Selecciona un sitio",
        icon: Clock3,
        tone: "orange",
      },
    ];
  }, [focusedSite, nearestEmployees, stats.departments, stats.totalPersonal, stats.totalSites, visiblePersonal]);

  return (
    <AppPage
      title="Mapa de sitios del Peru"
      fillHeight
      style={{
        background: "radial-gradient(circle at top left, #f8fafc 0%, #eef2ff 34%, #f8fafc 100%)",
      }}
    >
      <div ref={pageRef} style={styles.page}>
        <div ref={heroRef} style={styles.hero}>
        </div>

        {pageError ? (
          <div ref={pageErrorRef}>
            <AppStatusMessage tone="error">{pageError}</AppStatusMessage>
          </div>
        ) : null}

        <AppCard style={styles.filtersCard}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedNombreSitioFilter(nombreSitioFilter.trim());
              setAppliedDepartamentoFilters(departamentoFilters);
              setAppliedClienteFilter(clienteFilter.trim());
              setAppliedProyectoFilter(proyectoFilter.trim());
              recenterPeruRef.current = true;
              const departamentoQuery =
                departamentoFilters.length === 0 || departamentoFilters.length === departamentos.length
                  ? ""
                  : departamentoFilters.join("|");
              void loadSites({
                nombreSite: nombreSitioFilter.trim() || "",
                departamento: departamentoQuery,
                cliente: clienteFilter.trim() || "",
                proyecto: proyectoFilter.trim() || "",
              });
            }}
          >
            <div style={styles.filtersStrip}>
              <label style={styles.filterField}>
                <span style={styles.label}>Departamento</span>
                <button
                  type="button"
                  onClick={() => setDepartamentoExpanded((current) => !current)}
                  style={styles.compactSelect}
                  aria-expanded={departamentoExpanded}
                >
                  <span style={styles.compactSelectText}>{departamentoSummary}</span>
                  {departamentoExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {departamentoExpanded ? (
                  <div style={styles.checkboxGroup}>
                    <label key="__todos_departamentos__" style={styles.checkboxItem}>
                      <input
                        type="checkbox"
                        checked={departamentoFilters.length === departamentos.length && departamentos.length > 0}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setDepartamentoFilters(departamentos);
                          } else {
                            setDepartamentoFilters([]);
                          }
                        }}
                        style={styles.checkboxInput}
                      />
                      <span style={styles.checkboxText}>Todos</span>
                    </label>
                    {departamentos.map((item) => {
                      const checked = departamentoFilters.includes(item);
                      return (
                        <label key={item} style={styles.checkboxItem}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              const nextValue = event.target.checked
                                ? departamentoFilters.filter((value) => value !== item).concat(item)
                                : departamentoFilters.filter((value) => value !== item);
                              setDepartamentoFilters(nextValue);
                            }}
                            style={styles.checkboxInput}
                          />
                          <span style={styles.checkboxText}>{item}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : null}
              </label>

              <label style={styles.filterField}>
                <span style={styles.label}>Cliente</span>
                <select value={clienteFilter} onChange={(event) => setClienteFilter(event.target.value)} style={styles.input}>
                  <option value="">Todos los clientes</option>
                  {clientes.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label style={styles.filterField}>
                <span style={styles.label}>Proyecto</span>
                <select value={proyectoFilter} onChange={(event) => setProyectoFilter(event.target.value)} style={styles.input}>
                  <option value="">Todos los proyectos</option>
                  {proyectos.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label style={styles.filterField}>
                <span style={styles.label}>Tipo de personal</span>
                <select
                  value={personalTypeFilter}
                  onChange={(event) => setPersonalTypeFilter(event.target.value as "all" | "campo" | "2x1")}
                  style={styles.input}
                >
                  <option value="all">Todos los tipos</option>
                  <option value="campo">CAMPO</option>
                  <option value="2x1">2X1</option>
                </select>
              </label>

              <label style={{ ...styles.filterField, minWidth: 260 }}>
                <span style={styles.label}>Buscar sitio</span>
                <div style={styles.inputWrap}>
                  <Search size={15} style={styles.inputIcon} />
                  <input
                    value={nombreSitioFilter}
                    onChange={(event) => setNombreSitioFilter(event.target.value)}
                    placeholder="Buscar por nombre o código..."
                    style={styles.input}
                  />
                </div>
              </label>

              <div style={styles.filterActions}>
                <button
                  type="button"
                  style={styles.secondaryActionButton}
                  onClick={() => {
                    setNombreSitioFilter("");
                    setClienteFilter("");
                    setProyectoFilter("");
                    setPersonalTypeFilter("all");
                    setDepartamentoFilters([]);
                    setAppliedDepartamentoFilters([]);
                    setAppliedNombreSitioFilter("");
                    setAppliedClienteFilter("");
                    setAppliedProyectoFilter("");
                    setDepartamentoExpanded(false);
                    recenterPeruRef.current = true;
                    void loadSites({
                      nombreSite: "",
                      departamento: "",
                      cliente: "",
                      proyecto: "",
                    });
                  }}
                >
                  Limpiar
                </button>
                <button type="submit" style={styles.searchButton} disabled={loading}>
                  <Search size={15} />
                  {loading ? "Buscando..." : "Aplicar filtros"}
                </button>
              </div>
            </div>
          </form>
        </AppCard>

        <div
          style={{
            ...styles.contentGridModern,
            position: "relative",
            gridTemplateColumns: isCompactLayout
              ? "minmax(0, 1fr)"
              : "260px minmax(0, 1.7fr) minmax(250px, 0.6fr)",
          }}
        >
          {!isMapExpanded ? (
          <AppCard
            style={{
              ...styles.leftRailCard,
              position: "relative",
              zIndex: 1,
              order: isCompactLayout ? 2 : 0,
            }}
          >
            <div style={styles.sectionHeader}>
              <div>
                <div style={styles.sectionTitle}>KPI</div>
                <div style={styles.sectionSubtitle}>Resumen ejecutivo lateral.</div>
              </div>
              <div style={styles.sectionMeta}>
                <Layers3 size={15} />
                {isGerencialView ? "Gerencial" : "Operativo"}
              </div>
            </div>

            <div style={styles.metricsGrid}>
              {dashboardCards.map((item) => {
                const Icon = item.icon as React.ComponentType<{ size?: number }>;
                const iconStyle = item.tone === "violet"
                  ? styles.metricIconViolet
                  : item.tone === "blue"
                  ? styles.metricIconBlue
                  : item.tone === "indigo"
                  ? styles.metricIconIndigo
                  : item.tone === "green"
                  ? styles.metricIconGreen
                  : item.tone === "rose"
                  ? styles.metricIconRose
                  : styles.metricIconOrange;

                return (
                  <div key={item.label} style={styles.metricCard}>
                    <div style={{ ...styles.metricIcon, ...iconStyle }}>
                      <Icon size={18} />
                    </div>
                    <div style={styles.metricCopy}>
                      <div style={styles.metricLabel}>{item.label}</div>
                      <div style={styles.metricValue}>{item.value}</div>
                      <div style={styles.metricHint}>{item.hint}</div>
                    </div>
                  </div>
                );
              })}
            </div>

          </AppCard>
          ) : null}

          <AppCard
            style={{
              ...styles.mapCardModern,
              height: mapCardHeight ? `${mapCardHeight}px` : "100%",
              position: "relative",
              zIndex: isMapExpanded ? 4 : 0,
              gridColumn: isMapExpanded ? "1 / 3" : "2 / 3",
              gridRow: 1,
              order: isCompactLayout ? 1 : 0,
            }}
          >
            <div style={styles.mapHeaderRow}>
              <div style={styles.mapTabs}>
                <div style={styles.mapPreviewCard}>
                  <div style={styles.mapPhotoDockHeader}>
                    <div>
                      <div style={styles.mapPhotoDockKicker}>Vista del punto</div>
                      <div style={styles.mapPhotoDockTitle}>
                        {photoPreviewPoint?.position
                          ? getPointDisplayName(photoPreviewPoint)
                          : "Selecciona un sitio o empleado para ver Street View o Satélite"}
                      </div>
                    </div>
                    <div style={styles.mapPreviewCardActions}>
                      <button
                        type="button"
                        style={styles.mapPhotoDockClose}
                        onClick={() => setPhotoPreviewExpanded((current) => !current)}
                        aria-pressed={photoPreviewExpanded}
                      >
                        {photoPreviewExpanded ? "Reducir" : "Ampliar"}
                      </button>
                      <button type="button" style={styles.mapPhotoDockClose} onClick={closePhotoPreview}>
                        Limpiar
                      </button>
                    </div>
                  </div>

                  <div style={styles.photoPreviewModeRow}>
                    <button
                      type="button"
                      style={photoPreviewMode === "street" ? styles.photoPreviewModeActive : styles.photoPreviewModeButton}
                      onClick={() => setPhotoPreviewMode("street")}
                      disabled={!photoPreviewPoint?.position}
                    >
                      Street View
                    </button>
                    <button
                      type="button"
                      style={photoPreviewMode === "satellite" ? styles.photoPreviewModeActive : styles.photoPreviewModeButton}
                      onClick={() => setPhotoPreviewMode("satellite")}
                      disabled={!photoPreviewPoint?.position}
                    >
                      Satélite
                    </button>
                  </div>

                  <div
                    style={{
                      ...styles.mapPhotoDockFrame,
                      ...(photoPreviewExpanded ? styles.mapPhotoDockFrameExpanded : {}),
                      minHeight: photoPreviewExpanded ? 220 : 150,
                    }}
                  >
                    {photoPreviewPoint?.position ? (
                      photoPreviewMode === "street" ? (
                        <div
                          ref={photoPreviewStreetViewRef}
                          style={{
                            ...styles.photoPreviewStreetView,
                            height: "100%",
                            minHeight: photoPreviewExpanded ? 220 : 150,
                          }}
                        />
                      ) : photoPreviewMode === "satellite" ? (
                        <>
                          <div
                            ref={photoPreviewMapRef}
                            style={{
                              ...styles.photoPreviewImage,
                              height: "100%",
                              minHeight: photoPreviewExpanded ? 220 : 150,
                            }}
                          />
                          <div style={styles.photoPreviewCenterPin} aria-hidden="true">
                            <div style={styles.photoPreviewCenterPinDot} />
                            <div style={styles.photoPreviewCenterPinStem} />
                          </div>
                        </>
                      ) : (
                        <div style={styles.photoPreviewPhotoNotice}>
                          <div style={styles.mapPreviewEmptyTitle}>Visor de fotos</div>
                          <div style={styles.mapPreviewEmptyText}>La imagen se abre en un visor independiente.</div>
                        </div>
                      )
                    ) : (
                      <div style={styles.mapPreviewEmptyState}>
                        <div style={styles.mapPreviewEmptyTitle}>Visor siempre visible</div>
                        <div style={styles.mapPreviewEmptyText}>
                          Aquí aparecerá la vista Street View o Satélite cuando selecciones un punto.
                        </div>
                      </div>
                    )}
                    {photoPreviewLoading ? <div style={styles.photoPreviewOverlay}>Cargando vista...</div> : null}
                    {photoPreviewError ? <div style={styles.photoPreviewOverlay}>{photoPreviewError}</div> : null}
                  </div>
                </div>
              </div>
              <div style={styles.mapHeaderActions}>
                <div style={styles.mapHeaderPill}>
                  <MapPinned size={14} />
                  {focusedSite ? getPointDisplayName(focusedSite) : `${stats.filtered} puntos visibles`}
                </div>
                <button
                  type="button"
                  style={styles.mapExpandButton}
                  onClick={() => setMapExpanded((current) => !current)}
                  aria-pressed={isMapExpanded}
                  aria-label={isMapExpanded ? "Reducir mapa" : "Expandir mapa"}
                >
                  {isMapExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  <span>{isMapExpanded ? "Reducir mapa" : "Expandir mapa"}</span>
                </button>
              </div>
            </div>

            <div style={isMapExpanded ? { ...styles.mapWrap, ...styles.mapWrapExpanded } : styles.mapWrap}>
              <div ref={mapWrapRef} style={styles.map} />
              <div
                style={{
                  ...styles.mapPhotoDock,
                  ...(photoPreviewExpanded ? styles.mapPhotoDockExpanded : {}),
                }}
              >
                <div style={styles.mapPhotoDockHeader}>
                  <div>
                    <div style={styles.mapPhotoDockKicker}>Vista del punto</div>
                    <div style={styles.mapPhotoDockTitle}>
                      {photoPreviewPoint?.position
                        ? getPointDisplayName(photoPreviewPoint)
                        : "Selecciona un sitio o empleado para ver Street View o Satélite"}
                    </div>
                  </div>
                  <div style={styles.mapPhotoDockHeaderActions}>
                    <button
                      type="button"
                      style={styles.mapPhotoDockClose}
                      onClick={() => setPhotoPreviewExpanded((current) => !current)}
                      aria-pressed={photoPreviewExpanded}
                    >
                      {photoPreviewExpanded ? "Reducir" : "Ampliar"}
                    </button>
                    <button type="button" style={styles.mapPhotoDockClose} onClick={closePhotoPreview}>
                      Limpiar
                    </button>
                  </div>
                </div>

                <div style={styles.photoPreviewModeRow}>
                  <button
                    type="button"
                    style={photoPreviewMode === "street" ? styles.photoPreviewModeActive : styles.photoPreviewModeButton}
                    onClick={() => setPhotoPreviewMode("street")}
                    disabled={!photoPreviewPoint?.position}
                  >
                    Street View
                  </button>
                  <button
                    type="button"
                    style={photoPreviewMode === "satellite" ? styles.photoPreviewModeActive : styles.photoPreviewModeButton}
                    onClick={() => setPhotoPreviewMode("satellite")}
                    disabled={!photoPreviewPoint?.position}
                  >
                    Satélite
                  </button>
                </div>

                <div
                  style={{
                    ...styles.mapPhotoDockFrame,
                    ...(photoPreviewExpanded ? styles.mapPhotoDockFrameExpanded : {}),
                    minHeight: photoPreviewExpanded ? 220 : 150,
                  }}
                >
                  {photoPreviewPoint?.position ? (
                    photoPreviewMode === "street" ? (
                      <div
                        ref={photoPreviewStreetViewRef}
                        style={{
                          ...styles.photoPreviewStreetView,
                          height: "100%",
                          minHeight: photoPreviewExpanded ? 220 : 150,
                        }}
                      />
                      ) : photoPreviewMode === "satellite" ? (
                        <>
                          <div
                            ref={photoPreviewMapRef}
                            style={{
                              ...styles.photoPreviewImage,
                            height: "100%",
                            minHeight: photoPreviewExpanded ? 220 : 150,
                          }}
                        />
                          <div style={styles.photoPreviewCenterPin} aria-hidden="true">
                            <div style={styles.photoPreviewCenterPinDot} />
                            <div style={styles.photoPreviewCenterPinStem} />
                          </div>
                        </>
                      ) : (
                        <div style={styles.photoPreviewPhotoNotice}>
                          <div style={styles.mapPreviewEmptyTitle}>Visor de fotos</div>
                          <div style={styles.mapPreviewEmptyText}>La imagen se abrirá en un visor independiente.</div>
                        </div>
                      )
                    ) : (
                    <div style={styles.mapPreviewEmptyState}>
                      <div style={styles.mapPreviewEmptyTitle}>Visor siempre visible</div>
                      <div style={styles.mapPreviewEmptyText}>
                        Aquí aparecerá la vista Street View o Satélite cuando selecciones un punto.
                      </div>
                    </div>
                  )}
                  {photoPreviewLoading ? <div style={styles.photoPreviewOverlay}>Cargando vista...</div> : null}
                  {photoPreviewError ? <div style={styles.photoPreviewOverlay}>{photoPreviewError}</div> : null}
                </div>
              </div>
              {!mapTilesReady ? (
                <div style={styles.mapOverlay}>
                  <div style={styles.mapOverlayContent}>
                    <div style={styles.mapOverlayTitle}>
                      {loadingMap ? "Cargando Google Maps..." : "No se pudo visualizar el mapa"}
                    </div>
                    <div style={styles.mapOverlayText}>
                      {mapError ?? "Verifica la clave de Google Maps, la facturación y las restricciones de dominio."}
                    </div>
                    {!loadingMap ? (
                      <button type="button" style={styles.mapRetryButton} onClick={retryMapLoad}>
                        Reintentar carga
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {mapError ? <div style={styles.mapError}>{mapError}</div> : null}
              {false && photoPreviewPoint?.position ? (
                <div
                  style={{
                    ...styles.mapPhotoDock,
                    ...(photoPreviewExpanded ? styles.mapPhotoDockExpanded : {}),
                  }}
                >
                  <div style={styles.mapPhotoDockHeader}>
                    <div>
                      <div style={styles.mapPhotoDockKicker}>Vista del punto</div>
                      <div style={styles.mapPhotoDockTitle}>{getPointDisplayName(photoPreviewPoint)}</div>
                    </div>
                    <div style={styles.mapPhotoDockHeaderActions}>
                      <button
                        type="button"
                        style={styles.mapPhotoDockClose}
                        onClick={() => setPhotoPreviewExpanded((current) => !current)}
                      >
                        {photoPreviewExpanded ? "Reducir" : "Ampliar"}
                      </button>
                      <button type="button" style={styles.mapPhotoDockClose} onClick={closePhotoPreview}>
                        Cerrar
                      </button>
                    </div>
                  </div>

                  <div style={styles.photoPreviewModeRow}>
                    <button
                      type="button"
                      style={photoPreviewMode === "street" ? styles.photoPreviewModeActive : styles.photoPreviewModeButton}
                      onClick={() => setPhotoPreviewMode("street")}
                    >
                      Street View
                    </button>
                    <button
                      type="button"
                      style={photoPreviewMode === "satellite" ? styles.photoPreviewModeActive : styles.photoPreviewModeButton}
                      onClick={() => setPhotoPreviewMode("satellite")}
                    >
                      Satélite
                    </button>
                  </div>

                  <div
                    style={{
                      ...styles.mapPhotoDockFrame,
                      ...(photoPreviewExpanded ? styles.mapPhotoDockFrameExpanded : {}),
                    }}
                  >
                    {photoPreviewMode === "street" ? (
                      <div
                        ref={photoPreviewStreetViewRef}
                        style={{
                          ...styles.photoPreviewStreetView,
                          ...(photoPreviewExpanded ? styles.photoPreviewStreetViewExpanded : {}),
                        }}
                      />
                    ) : (
                      <>
                        <div
                          ref={photoPreviewMapRef}
                          style={{
                            ...styles.photoPreviewImage,
                            ...(photoPreviewExpanded ? styles.photoPreviewImageExpanded : {}),
                          }}
                        />
                        <div style={styles.photoPreviewCenterPin} aria-hidden="true">
                          <div style={styles.photoPreviewCenterPinDot} />
                          <div style={styles.photoPreviewCenterPinStem} />
                        </div>
                      </>
                    )}
                    {photoPreviewLoading ? <div style={styles.photoPreviewOverlay}>Cargando vista...</div> : null}
                    {photoPreviewError ? <div style={styles.photoPreviewOverlay}>{photoPreviewError}</div> : null}
                  </div>
                </div>
              ) : null}
            </div>
          </AppCard>

          <div style={styles.sideRail}>
            <AppCard style={styles.siteDetailCard}>
              <div style={styles.siteDetailHeader}>
                <div>
                  <div style={styles.siteDetailKicker}>Sitio</div>
                  <div style={styles.siteDetailTitle}>{focusedSite ? getPointDisplayName(focusedSite) : "Sin sitio seleccionado"}</div>
                </div>
                <div style={styles.siteDetailHeaderActions}>
                  <div style={styles.siteDetailTag}>{isGerencialView ? "Gerencial" : "Operativo"}</div>
                  {focusedSite ? (
                    <button
                      type="button"
                      style={styles.routeMenuButtonPrimary}
                      onClick={() => {
                        setRouteDestinationSite(focusedSite);
                        if (routeOrigin) {
                          setRoutePopupOpen(true);
                          void calculateRoute(routeOrigin, focusedSite);
                        }
                      }}
                    >
                      Ver ruta
                    </button>
                  ) : null}
                </div>
              </div>

              {focusedSite ? (
                <>
                  <div style={styles.siteDetailGrid}>
                    <div style={styles.siteDetailItem}>
                      <span style={styles.siteDetailLabel}>Cliente</span>
                      <strong style={styles.siteDetailValue}>{focusedSite.cliente ?? "Sin cliente"}</strong>
                    </div>
                    <div style={styles.siteDetailItem}>
                      <span style={styles.siteDetailLabel}>Proyecto</span>
                      <strong style={styles.siteDetailValue}>{focusedSite.proyecto ?? "Sin proyecto"}</strong>
                    </div>
                    <div style={styles.siteDetailItem}>
                      <span style={styles.siteDetailLabel}>Departamento</span>
                      <strong style={styles.siteDetailValue}>{focusedSite.departamento ?? "Sin departamento"}</strong>
                    </div>
                    <div style={styles.siteDetailItem}>
                      <span style={styles.siteDetailLabel}>Ubicación</span>
                      <strong style={styles.siteDetailValue}>{getPointLocationLabel(focusedSite)}</strong>
                    </div>
                  </div>

                </>
              ) : (
                <AppStatusMessage tone="info">Selecciona un punto en el mapa para ver sus detalles y las rutas cercanas.</AppStatusMessage>
              )}
            </AppCard>

            <AppCard style={styles.nearestCard}>
              <div style={styles.sectionHeader}>
                <div>
                  <div style={styles.sectionTitle}>Personal más cercano</div>
                  <div style={styles.sectionSubtitle}>Selecciona un sitio para calcular distancia, ETA y ruta.</div>
                </div>
                <div style={styles.nearestHeaderActions}>
                  <div style={styles.sectionMeta}>
                    <Building2 size={15} />
                    {routeDestinationSite ? `${nearestEmployees.length} calculados` : "Sin sitio"}
                  </div>
                  <button
                    type="button"
                    style={styles.nearestToggleButton}
                    onClick={() => setNearestEmployeesExpanded((current) => !current)}
                    aria-expanded={nearestEmployeesExpanded}
                    aria-label={nearestEmployeesExpanded ? "Contraer personal más cercano" : "Expandir personal más cercano"}
                  >
                    {nearestEmployeesExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    <span>{nearestEmployeesExpanded ? "Contraer" : "Expandir"}</span>
                  </button>
                </div>
              </div>

              {nearestEmployeesExpanded && <div style={styles.nearestCardBody}>
                  {!routeDestinationSite ? (
                    <AppStatusMessage tone="info">Selecciona un sitio para ver el personal más cercano.</AppStatusMessage>
                  ) : nearestEmployeesLoading ? (
                    <AppStatusMessage tone="info">Calculando rutas y tiempos...</AppStatusMessage>
                  ) : nearestEmployees.length === 0 ? (
                    <AppStatusMessage tone="info">No hay personal con ubicación válida para el sitio seleccionado.</AppStatusMessage>
                  ) : (
                    <div style={styles.nearestEmployeeList}>
                      {nearestEmployees.map((item, index) => (
                        <div key={item.key} style={styles.nearestEmployeeItem}>
                          <div style={styles.nearestEmployeeHeader}>
                            <div style={styles.nearestEmployeeMain}>
                              <div style={styles.nearestEmployeeRank}>{index + 1}</div>
                              <div style={styles.nearestEmployeeText}>
                                <div style={styles.nearestEmployeeName}>{item.nombre}</div>
                                {item.departamento && normalizeText(item.departamento) !== "sin departamento" ? (
                                  <div style={styles.nearestEmployeeMeta}>{item.departamento}</div>
                                ) : null}
                                {item.cargo && normalizeText(item.cargo) !== "sin cargo" ? (
                                  <div style={styles.nearestEmployeeMeta}>{item.cargo}</div>
                                ) : null}
                              </div>
                            </div>
                            <div style={styles.routeMenuActions}>
                              <div style={styles.nearestEmployeeTag}>{item.routeAvailable ? "Ruta" : "Estimado"}</div>
                              <button
                                type="button"
                                style={styles.routeMenuButtonPrimary}
                                onClick={() => {
                                  setRouteOrigin(item);
                                  setRoutePopupOpen(false);
                                }}
                              >
                                Ver ruta
                              </button>
                            </div>
                          </div>

                          <div style={styles.nearestEmployeeStats}>
                          <div style={styles.nearestEmployeeStat}>
                            <span style={styles.nearestEmployeeStatLabel}>Distancia</span>
                            <strong style={styles.nearestEmployeeStatValue}>{item.routeDistanceText}</strong>
                          </div>
                          <div style={styles.nearestEmployeeStat}>
                            <span style={styles.nearestEmployeeStatLabel}>ETA</span>
                            <strong style={styles.nearestEmployeeStatValue}>{item.etaText}</strong>
                          </div>
                          <div style={styles.nearestEmployeeStat}>
                            <span style={styles.nearestEmployeeStatLabel}>Ruta</span>
                            <strong style={styles.nearestEmployeeStatValue}>{item.routeAvailable ? "Calculada" : "Estimacion"}</strong>
                          </div>
                          </div>

                        {item.routeError ? <span style={styles.nearestEmployeeError}>{item.routeError}</span> : null}
                        </div>
                      ))}
                  </div>
                  )}
                </div>
              }
            </AppCard>

            <AppCard style={styles.listCard}>
              <div style={styles.sectionHeader}>
                <div>
                  <div style={styles.sectionTitle}>{isGerencialView ? "Cobertura" : "Seguimiento"}</div>
                  <div style={styles.sectionSubtitle}>
                    {isGerencialView
                      ? "Sitios y personal visibles con su ubicacion resuelta."
                      : "Sitios y personal visibles con su ubicacion resuelta."}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSeguimientoExpanded((current) => !current)}
                  style={styles.sectionToggle}
                  aria-expanded={seguimientoExpanded}
                  aria-controls="seguimiento-body"
                >
                  {seguimientoExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  {seguimientoExpanded ? "Contraer" : "Expandir"}
                </button>
              </div>

              {seguimientoExpanded ? (
                <div id="seguimiento-body" style={styles.listBody}>
                  {loading || loadingPersonal ? (
                    <AppStatusMessage tone="info">Cargando puntos...</AppStatusMessage>
                  ) : visiblePoints.length === 0 ? (
                    <AppStatusMessage tone="info">No hay puntos con localizacion para los filtros actuales.</AppStatusMessage>
                  ) : (
                    <div style={styles.siteList}>
                      {visiblePoints.map((item, index) => {
                        const active = index === selectedIndex;
                        const key = formatPositionKey(item.position);
                        const isSite = item.kind === "sitio";
                        const locationLabel = isSite
                          ? item.direccion || item.referencia || `${item.position.lat.toFixed(6)}, ${item.position.lng.toFixed(6)}`
                          : item.origen || item.fechaHora || `${item.position.lat.toFixed(6)}, ${item.position.lng.toFixed(6)}`;

                          return (
                            <button
                              key={
                                isSite
                                  ? `${item.idSite || item.nombreSite}-${key}-${index}`
                                : `${item.idEmpleado || item.nombre}-${key}-${index}`
                              }
                              type="button"
                              onClick={() => {
                                setSelectedIndex(index);
                                if (item.kind === "sitio") {
                                  setRouteDestinationSite(item);
                                } else {
                                  setRouteOrigin(item);
                                }
                              }}
                              style={{
                                ...styles.siteRow,
                                ...(active ? styles.siteRowActive : {}),
                              }}
                            >
                            <div style={styles.siteBadge}>{index + 1}</div>
                            <div style={styles.siteText}>
                              <div style={styles.siteTitle}>{isSite ? item.nombreSite : item.nombre}</div>
                          <div style={styles.siteMeta}>{item.departamento}</div>
                          {isSite ? (
                            <>
                              <div style={styles.siteMeta}>{item.cliente}</div>
                              <div style={styles.siteMeta}>{item.proyecto}</div>
                              <div style={styles.siteMeta}>{item.idSite || "Sin codigo"}</div>
                            </>
                          ) : (
                            <>
                              <div style={styles.siteMeta}>{item.cargo || "Sin cargo"}</div>
                              <div style={styles.siteMeta}>{item.idEmpleado || "Sin codigo"}</div>
                              <div style={styles.siteMeta}>{item.ubicacion || "Sin ubicacion"}</div>
                            </>
                          )}
                              <div style={styles.siteMeta}>{locationLabel}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </AppCard>
          </div>
        </div>
      </div>
      {photoViewer ? (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalCard, maxWidth: 860 }}>
            <div style={styles.historyHeader}>
              <h3 style={styles.modalTitle}>{photoViewer.title}</h3>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => {
                  setPhotoViewer(null);
                  setPhotoViewerLoading(false);
                  setPhotoViewerError(null);
                }}
              >
                Cerrar
              </button>
            </div>

            <div style={styles.imageViewer}>
              {photoViewerError ? (
                <div style={styles.photoViewerErrorBox}>
                  <div style={styles.mapPreviewEmptyTitle}>{photoViewerError}</div>
                  <div style={styles.mapPreviewEmptyText}>
                    Abre el recurso directamente para validar si SharePoint lo expone sin vista previa.
                  </div>
                </div>
              ) : (
                <img
                  src={photoViewer.url}
                  alt={photoViewer.title}
                  style={styles.imagePreview}
                  onLoad={() => setPhotoViewerLoading(false)}
                  onError={() => {
                    setPhotoViewerLoading(false);
                    setPhotoViewerError("No se pudo cargar la imagen de IMAGENFINAL.");
                  }}
                />
              )}
              {photoViewerLoading && !photoViewerError ? <div style={styles.photoViewerLoading}>Cargando imagen...</div> : null}
              <a href={photoViewer.url} target="_blank" rel="noreferrer" style={styles.historyLink}>
                Abrir recurso
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </AppPage>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
    height: "100%",
    minHeight: 0,
    overflow: "hidden",
  },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    gap: 20,
    alignItems: "flex-start",
  },
  heroCopy: {
    display: "grid",
    gap: 4,
    minWidth: 0,
  },
  heroCrumbs: {
    flexShrink: 0,
    alignSelf: "flex-start",
    fontSize: 12,
    fontWeight: 700,
    color: "#64748b",
    whiteSpace: "nowrap",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px",
    borderRadius: 999,
    background: "#dbeafe",
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.2,
    marginBottom: 12,
  },
  title: {
    margin: 0,
    fontSize: 32,
    fontWeight: 800,
    color: "#0f172a",
    lineHeight: 1.05,
  },
  subtitle: {
    margin: "10px 0 0",
    color: "#475569",
    maxWidth: 760,
    fontSize: 15,
    lineHeight: 1.6,
  },
  heroCard: {
    minWidth: 280,
    borderRadius: 20,
    padding: 18,
    background: "rgba(15, 23, 42, 0.96)",
    color: "#e2e8f0",
    boxShadow: "0 18px 42px rgba(15, 23, 42, 0.22)",
  },
  heroCardLabel: {
    fontSize: 12,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  heroCardValue: {
    marginTop: 8,
    fontSize: 22,
    fontWeight: 800,
  },
  heroCardHint: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 1.5,
    color: "#cbd5e1",
  },
  viewModeSwitch: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8,
    marginTop: 14,
  },
  viewModeButton: {
    borderRadius: 12,
    border: "1px solid rgba(148, 163, 184, 0.4)",
    background: "rgba(15, 23, 42, 0.35)",
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: 800,
    padding: "10px 12px",
    cursor: "pointer",
    transition: "all 140ms ease",
  },
  viewModeButtonActive: {
    background: "linear-gradient(135deg, #38bdf8 0%, #1d4ed8 100%)",
    border: "1px solid transparent",
    color: "#fff",
    boxShadow: "0 10px 24px rgba(29, 78, 216, 0.28)",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 14,
  },
  statsCard: {
    marginBottom: 0,
    border: "1px solid #e2e8f0",
    background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%)",
  },
  nearestCard: {
    marginBottom: 0,
    border: "1px solid #c7d2fe",
    background: "linear-gradient(180deg, rgba(238,242,255,0.95) 0%, rgba(255,255,255,0.98) 100%)",
  },
  departmentCard: {
    marginBottom: 0,
    border: "1px solid #bae6fd",
    background: "linear-gradient(180deg, rgba(240,249,255,0.98) 0%, rgba(255,255,255,0.98) 100%)",
  },
  departmentCardBody: {
    marginTop: 2,
    maxHeight: 360,
    overflowY: "auto",
    overflowX: "hidden",
    paddingRight: 4,
  },
  departmentList: {
    display: "grid",
    gap: 10,
  },
  departmentItem: {
    borderRadius: 16,
    border: "1px solid #bae6fd",
    background: "#fff",
    padding: 12,
    display: "grid",
    gap: 10,
  },
  departmentItemHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  departmentItemMain: {
    display: "flex",
    gap: 10,
    minWidth: 0,
  },
  departmentSwatch: {
    width: 14,
    height: 14,
    borderRadius: 999,
    marginTop: 3,
    flexShrink: 0,
    boxShadow: "0 0 0 4px rgba(148, 163, 184, 0.12)",
  },
  departmentItemText: {
    display: "grid",
    gap: 3,
    minWidth: 0,
  },
  departmentName: {
    fontSize: 14,
    fontWeight: 800,
    color: "#0f172a",
    lineHeight: 1.35,
    wordBreak: "break-word",
  },
  departmentMeta: {
    fontSize: 12,
    color: "#475569",
    lineHeight: 1.3,
    wordBreak: "break-word",
  },
  departmentBadge: {
    flexShrink: 0,
    borderRadius: 999,
    background: "#dbeafe",
    color: "#1d4ed8",
    fontSize: 11,
    fontWeight: 800,
    padding: "6px 10px",
  },
  departmentStats: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 8,
  },
  departmentStat: {
    borderRadius: 12,
    border: "1px solid #dbeafe",
    background: "#f8fbff",
    padding: "8px 10px",
    display: "grid",
    gap: 4,
  },
  departmentStatLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#64748b",
    fontWeight: 700,
  },
  departmentStatValue: {
    fontSize: 13,
    color: "#0f172a",
    fontWeight: 800,
    lineHeight: 1.3,
  },
  departmentBarTrack: {
    height: 8,
    borderRadius: 999,
    background: "#e2e8f0",
    overflow: "hidden",
  },
  departmentBarFill: {
    height: "100%",
    borderRadius: 999,
  },
  nearestCardBody: {
    marginTop: 2,
    maxHeight: 360,
    overflowY: "auto",
    overflowX: "hidden",
    paddingRight: 4,
  },
  nearestHeaderActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  nearestToggleButton: {
    border: "1px solid #c4b5fd",
    borderRadius: 999,
    padding: "6px 10px",
    background: "#fff",
    color: "#5b21b6",
    fontSize: 12,
    fontWeight: 800,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
  },
  nearestEmployeeList: {
    display: "grid",
    gap: 10,
  },
  nearestEmployeeItem: {
    borderRadius: 16,
    border: "1px solid #c7d2fe",
    background: "#fff",
    padding: 12,
    display: "grid",
    gap: 10,
  },
  nearestEmployeeHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  nearestEmployeeMain: {
    display: "flex",
    gap: 10,
    minWidth: 0,
  },
  nearestEmployeeRank: {
    width: 30,
    height: 30,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(135deg, #1d4ed8 0%, #4f46e5 100%)",
    color: "#fff",
    fontWeight: 800,
    fontSize: 13,
    flexShrink: 0,
  },
  nearestEmployeeText: {
    display: "grid",
    gap: 3,
    minWidth: 0,
  },
  nearestEmployeeName: {
    fontSize: 14,
    fontWeight: 800,
    color: "#0f172a",
    lineHeight: 1.35,
    wordBreak: "break-word",
  },
  nearestEmployeeMeta: {
    fontSize: 12,
    color: "#64748b",
    lineHeight: 1.3,
    wordBreak: "break-word",
  },
  nearestEmployeeTag: {
    flexShrink: 0,
    borderRadius: 999,
    background: "#dbeafe",
    color: "#1d4ed8",
    fontSize: 11,
    fontWeight: 800,
    padding: "6px 10px",
  },
  nearestEmployeeStats: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 8,
  },
  nearestEmployeeStat: {
    borderRadius: 12,
    border: "1px solid #dbeafe",
    background: "#f8fbff",
    padding: "8px 10px",
    display: "grid",
    gap: 4,
  },
  nearestEmployeeStatLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#64748b",
    fontWeight: 700,
  },
  nearestEmployeeStatValue: {
    fontSize: 13,
    color: "#0f172a",
    fontWeight: 800,
    lineHeight: 1.3,
  },
  nearestEmployeeStatAction: {
    borderRadius: 12,
    border: "1px solid #dbeafe",
    background: "#f8fbff",
    padding: "8px 10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  nearestEmployeeActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  nearestEmployeeError: {
    fontSize: 12,
    color: "#b91c1c",
    fontWeight: 600,
    lineHeight: 1.35,
  },
  statBox: {
    borderRadius: 14,
    border: "1px solid #e2e8f0",
    background: "#fff",
    padding: 14,
  },
  statLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    color: "#64748b",
    marginBottom: 8,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 800,
    color: "#0f172a",
  },
  statHint: {
    marginTop: 6,
    fontSize: 13,
    color: "#64748b",
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(1, minmax(0, 1fr))",
    gap: 12,
  },
  metricCard: {
    borderRadius: 18,
    border: "1px solid #e2e8f0",
    background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%)",
    padding: 14,
    gridTemplateColumns: "auto 1fr",
    alignItems: "center",
    display: "grid",
    gap: 10,
    minHeight: 90,
  },
  metricIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    color: "#1d4ed8",
    background: "#dbeafe",
  },
  metricIconViolet: {
    color: "#6d28d9",
    background: "#ede9fe",
  },
  metricIconBlue: {
    color: "#2563eb",
    background: "#dbeafe",
  },
  metricIconIndigo: {
    color: "#4338ca",
    background: "#e0e7ff",
  },
  metricIconGreen: {
    color: "#16a34a",
    background: "#dcfce7",
  },
  metricIconRose: {
    color: "#dc2626",
    background: "#fee2e2",
  },
  metricIconOrange: {
    color: "#f97316",
    background: "#ffedd5",
  },
  metricCopy: {
    display: "grid",
    gap: 3,
    minWidth: 0,
  },
  metricLabel: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  metricValue: {
    fontSize: 26,
    fontWeight: 800,
    color: "#0f172a",
    lineHeight: 1,
  },
  metricHint: {
    fontSize: 12,
    color: "#475569",
    lineHeight: 1.35,
  },
  filtersStrip: {
    display: "grid",
    gridTemplateColumns: "1.1fr 1fr 1fr 1fr 1.2fr auto",
    gap: 12,
    alignItems: "end",
  },
  filterField: {
    display: "grid",
    gap: 8,
    minWidth: 0,
    position: "relative",
  },
  filterActions: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
  },
  secondaryActionButton: {
    borderRadius: 12,
    border: "1px solid #c7d2fe",
    background: "#fff",
    color: "#5b21b6",
    padding: "12px 16px",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
  },
  contentGridModern: {
    display: "grid",
    gridTemplateColumns: "260px minmax(0, 1.7fr) minmax(250px, 0.6fr)",
    gap: 14,
    alignItems: "start",
    minHeight: 0,
  },
  leftRailCard: {
    marginBottom: 0,
    border: "1px solid #e2e8f0",
    background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  mapDiagnosticCard: {
    borderRadius: 16,
    border: "1px solid #dbeafe",
    background: "#f8fbff",
    padding: 12,
    display: "grid",
    gap: 10,
  },
  mapDiagnosticHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  mapDiagnosticGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8,
  },
  mapDiagnosticItem: {
    borderRadius: 12,
    border: "1px solid #dbeafe",
    background: "#fff",
    padding: 10,
    display: "grid",
    gap: 4,
  },
  mapDiagnosticLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#64748b",
    fontWeight: 700,
  },
  mapDiagnosticValue: {
    fontSize: 13,
    color: "#0f172a",
    fontWeight: 800,
    lineHeight: 1.35,
    wordBreak: "break-word",
  },
  mapCardModern: {
    marginBottom: 0,
    border: "1px solid #e2e8f0",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    minWidth: 0,
    minHeight: 720,
    paddingBottom: 0,
  },
  mapHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  mapTabs: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "stretch",
    minWidth: 0,
  },
  mapPreviewCard: {
    display: "none",
    gap: 8,
    flex: "1 1 320px",
    minWidth: 260,
    maxWidth: 420,
    padding: 10,
    borderRadius: 16,
    border: "1px solid #dbe4f0",
    background: "#fff",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
  },
  mapPreviewCardActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  mapTabButton: {
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    color: "#64748b",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 800,
    padding: "8px 12px",
    borderRadius: 999,
    transition: "background 0.18s ease, color 0.18s ease, border-color 0.18s ease, transform 0.18s ease",
  },
  mapTabButtonActive: {
    color: "#6d28d9",
    background: "#ede9fe",
    border: "1px solid #c4b5fd",
    transform: "translateY(-1px)",
  },
  mapHeaderPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 999,
    background: "#eff6ff",
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  mapHeaderActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginLeft: "auto",
  },
  mapExpandButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid #c4b5fd",
    background: "#ffffff",
    color: "#6d28d9",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(109, 40, 217, 0.08)",
  },
  mapLegend: {
    position: "absolute",
    left: 14,
    top: 14,
    zIndex: 2,
    background: "#fff",
    borderRadius: 14,
    border: "1px solid #e2e8f0",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.08)",
    padding: 12,
    display: "grid",
    gap: 8,
    minWidth: 160,
  },
  mapPhotoDock: {
    position: "absolute",
    left: 14,
    top: 14,
    zIndex: 3,
    width: "min(320px, calc(100% - 28px))",
    borderRadius: 16,
    border: "1px solid rgba(199, 210, 254, 0.95)",
    background: "rgba(255, 255, 255, 0.96)",
    boxShadow: "0 16px 32px rgba(15, 23, 42, 0.18)",
    padding: 10,
    display: "grid",
    gap: 8,
    backdropFilter: "blur(10px)",
  },
  mapPhotoDockExpanded: {
    position: "absolute",
    left: 14,
    top: 14,
    width: "min(420px, calc(100% - 28px))",
    height: "min(44vh, calc(100% - 28px))",
    maxWidth: "none",
    borderRadius: 18,
    zIndex: 4,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",
    gap: 10,
    overflow: "hidden",
  },
  mapPhotoDockExpandedOverlay: {
    boxShadow: "0 24px 60px rgba(15, 23, 42, 0.32)",
  },
  mapPhotoDockHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  mapPhotoDockHeaderActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  mapPhotoDockKicker: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: "#7c3aed",
    fontWeight: 800,
    lineHeight: 1.2,
  },
  mapPhotoDockTitle: {
    fontSize: 13,
    fontWeight: 800,
    color: "#0f172a",
    lineHeight: 1.25,
    maxWidth: 190,
    wordBreak: "break-word",
  },
  mapPhotoDockClose: {
    borderRadius: 999,
    border: "1px solid #c4b5fd",
    background: "#fff",
    color: "#6d28d9",
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 800,
    cursor: "pointer",
    flexShrink: 0,
  },
  mapPhotoDockFrame: {
    position: "relative",
    borderRadius: 14,
    overflow: "hidden",
    border: "1px solid #dbe4f0",
    background: "#0f172a",
    minHeight: 180,
  },
  mapPhotoDockFrameExpanded: {
    flex: 1,
    minHeight: 0,
    height: "auto",
    overflow: "hidden",
  },
  mapPreviewEmptyState: {
    minHeight: 150,
    height: "100%",
    display: "grid",
    placeItems: "center",
    gap: 8,
    padding: 16,
    textAlign: "center",
    color: "#cbd5e1",
    background: "linear-gradient(180deg, #0f172a 0%, #111827 100%)",
  },
  mapPreviewEmptyTitle: {
    fontSize: 13,
    fontWeight: 800,
    color: "#fff",
    lineHeight: 1.25,
  },
  mapPreviewEmptyText: {
    fontSize: 12,
    fontWeight: 600,
    color: "#cbd5e1",
    lineHeight: 1.45,
    maxWidth: 260,
  },
  mapPhotoDockSurface: {
    width: "100%",
    height: 180,
  },
  mapPhotoDockError: {
    fontSize: 11,
    color: "#b91c1c",
    fontWeight: 600,
    lineHeight: 1.35,
  },
  legendTitle: {
    fontSize: 12,
    fontWeight: 800,
    color: "#0f172a",
    marginBottom: 2,
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    color: "#475569",
    fontWeight: 600,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    flexShrink: 0,
  },
  sideRail: {
    display: "grid",
    gap: 14,
    minHeight: 0,
  },
  siteDetailCard: {
    marginBottom: 0,
    border: "1px solid #e2e8f0",
    background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
  },
  siteDetailHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  siteDetailHeaderActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  siteDetailKicker: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "#64748b",
    fontWeight: 800,
    marginBottom: 4,
  },
  siteDetailTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: "#0f172a",
    lineHeight: 1.2,
  },
  siteDetailTag: {
    flexShrink: 0,
    borderRadius: 999,
    background: "#dcfce7",
    color: "#166534",
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 800,
  },
  siteDetailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  siteDetailItem: {
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid #e2e8f0",
    background: "#fff",
    display: "grid",
    gap: 4,
  },
  siteDetailLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#64748b",
    fontWeight: 700,
  },
  siteDetailValue: {
    fontSize: 13,
    color: "#0f172a",
    fontWeight: 800,
    lineHeight: 1.35,
    wordBreak: "break-word",
  },
  siteActionRow: {
    display: "flex",
    gap: 10,
    marginTop: 12,
    flexWrap: "wrap",
  },
  filtersCard: {
    marginBottom: 0,
    border: "1px solid #e2e8f0",
  },
  routePlannerCard: {
    borderRadius: 18,
    border: "1px solid #c7d2fe",
    background: "linear-gradient(180deg, #eef2ff 0%, #ffffff 100%)",
    padding: 12,
    marginBottom: 12,
  },
  routePlannerHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 8,
  },
  routePlannerTitle: {
    fontSize: 14,
    fontWeight: 800,
    color: "#0f172a",
  },
  routePlannerSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: "#64748b",
    lineHeight: 1.35,
  },
  routePlannerInlineRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
    marginBottom: 0,
  },
  routePlannerInlineFields: {
    flex: 1,
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8,
    minWidth: 0,
  },
  routePlannerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  routePlannerHeaderActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
    flexShrink: 0,
  },
  routePlannerBox: {
    borderRadius: 14,
    border: "1px solid #dbe4f0",
    background: "#fff",
    padding: 10,
    minWidth: 0,
  },
  routePlannerLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#64748b",
    marginBottom: 6,
    fontWeight: 700,
  },
  routePlannerValue: {
    fontSize: 13,
    fontWeight: 800,
    color: "#1e293b",
    wordBreak: "break-word",
    lineHeight: 1.25,
  },
  filtersHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 18,
    marginBottom: 16,
  },
  filtersMeta: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 700,
    color: "#1d4ed8",
    padding: "6px 10px",
    borderRadius: 999,
    background: "#eff6ff",
  },
  filtersGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14,
  },
  typeFilters: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
    marginTop: 14,
  },
  typeOption: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    border: "1px solid #cbd5e1",
    background: "#f8fafc",
    padding: "12px 14px",
    cursor: "pointer",
  },
  typeCheckbox: {
    width: 18,
    height: 18,
    marginTop: 2,
    accentColor: "#1d4ed8",
    cursor: "pointer",
  },
  typeCopy: {
    display: "grid",
    gap: 4,
    minWidth: 0,
  },
  typeTitle: {
    fontSize: 13,
    fontWeight: 800,
    color: "#0f172a",
    lineHeight: 1.3,
  },
  typeHint: {
    fontSize: 12,
    color: "#64748b",
    lineHeight: 1.35,
  },
  filtersActions: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: 14,
  },
  field: {
    display: "grid",
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: 700,
    color: "#1f2937",
  },
  inputWrap: {
    position: "relative",
  },
  inputIcon: {
    position: "absolute",
    left: 12,
    top: "50%",
    transform: "translateY(-50%)",
    color: "#94a3b8",
    pointerEvents: "none",
  },
  input: {
    width: "100%",
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    padding: "12px 14px",
    background: "#fff",
    color: "#0f172a",
    fontSize: 14,
    outline: "none",
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.03) inset",
  },
  compactSelect: {
    width: "100%",
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    padding: "12px 14px",
    background: "#fff",
    color: "#0f172a",
    fontSize: 14,
    outline: "none",
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.03) inset",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    cursor: "pointer",
    textAlign: "left",
  },
  compactSelectText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  checkboxGroup: {
    position: "absolute",
    left: 0,
    top: "calc(100% + 8px)",
    zIndex: 30,
    width: "min(340px, 100%)",
    display: "grid",
    gap: 8,
    padding: 12,
    maxHeight: 280,
    overflowY: "auto",
    paddingRight: 10,
    borderRadius: 16,
    border: "1px solid #dbe4f0",
    background: "#fff",
    boxShadow: "0 18px 36px rgba(15, 23, 42, 0.12)",
  },
  checkboxItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #dbe4f0",
    background: "#f8fbff",
  },
  checkboxInput: {
    width: 16,
    height: 16,
    accentColor: "#1d4ed8",
    flexShrink: 0,
  },
  checkboxText: {
    fontSize: 14,
    color: "#0f172a",
    fontWeight: 600,
    lineHeight: 1.35,
  },
  helperText: {
    fontSize: 12,
    color: "#64748b",
    lineHeight: 1.4,
  },
  routeMenu: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    padding: "12px 14px",
    marginBottom: 14,
    borderRadius: 14,
    border: "1px solid #ddd6fe",
    background: "linear-gradient(180deg, #faf5ff 0%, #f3e8ff 100%)",
  },
  routeMenuText: {
    display: "grid",
    gap: 4,
    fontSize: 13,
    color: "#4c1d95",
  },
  routeMenuActions: {
    display: "flex",
    gap: 8,
    flexShrink: 0,
  },
  routeMenuButtonPrimary: {
    border: "none",
    borderRadius: 10,
    padding: "10px 14px",
    background: "linear-gradient(135deg, #6d28d9 0%, #7c3aed 100%)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  routeMenuButtonGhost: {
    border: "1px solid #c4b5fd",
    borderRadius: 10,
    padding: "10px 14px",
    background: "#fff",
    color: "#5b21b6",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  routeOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.42)",
    backdropFilter: "blur(4px)",
    display: "grid",
    placeItems: "center",
    zIndex: 60,
    padding: 20,
  },
  routeDialog: {
    width: "min(720px, 100%)",
    borderRadius: 20,
    border: "1px solid #ddd6fe",
    background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
    boxShadow: "0 28px 80px rgba(15, 23, 42, 0.35)",
    padding: 18,
  },
  routeDialogHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 14,
  },
  routeDialogKicker: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    color: "#7c3aed",
    fontWeight: 800,
    marginBottom: 4,
  },
  routeDialogTitle: {
    fontSize: 20,
    fontWeight: 800,
    color: "#0f172a",
  },
  routeDialogBody: {
    marginBottom: 16,
  },
  routeDetailsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },
  routeDetailBox: {
    borderRadius: 14,
    border: "1px solid #e2e8f0",
    background: "#fff",
    padding: 14,
  },
  routeDetailLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#64748b",
    marginBottom: 6,
  },
  routeDetailValue: {
    fontSize: 15,
    fontWeight: 800,
    color: "#0f172a",
    lineHeight: 1.35,
  },
  routeDialogActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
  },
  photoPreviewModeRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  photoPreviewModeButton: {
    borderRadius: 999,
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#334155",
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  photoPreviewModeActive: {
    borderRadius: 999,
    border: "1px solid #c4b5fd",
    background: "linear-gradient(135deg, #6d28d9 0%, #7c3aed 100%)",
    color: "#fff",
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  photoPreviewFrame: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 18,
    border: "1px solid #cbd5e1",
    background: "#0f172a",
    minHeight: 360,
  },
  photoPreviewStreetView: {
    width: "100%",
    height: 360,
  },
  photoPreviewStreetViewExpanded: {
    height: "100%",
    minHeight: 220,
  },
  photoPreviewImage: {
    display: "block",
    width: "100%",
    height: 360,
    objectFit: "cover",
    background: "#e2e8f0",
  },
  photoPreviewImageExpanded: {
    height: "100%",
    minHeight: 220,
  },
  photoPreviewImageShell: {
    position: "relative",
    width: "100%",
    height: "100%",
    minHeight: 150,
    overflow: "hidden",
    background: "#0f172a",
  },
  photoPreviewPhotoViewer: {
    width: "100%",
    height: "100%",
    minHeight: 150,
    display: "grid",
    gridTemplateRows: "1fr auto",
    gap: 8,
    padding: 10,
    boxSizing: "border-box",
    background: "linear-gradient(180deg, #111827 0%, #0f172a 100%)",
  },
  photoPreviewPhotoStage: {
    position: "relative",
    width: "100%",
    minHeight: 0,
    overflow: "hidden",
    borderRadius: 12,
    background: "#1f2937",
    display: "grid",
    placeItems: "center",
  },
  photoPreviewPhotoImage: {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "contain",
    background: "#1f2937",
  },
  photoPreviewPhotoEmpty: {
    width: "100%",
    height: "100%",
    minHeight: 150,
    display: "grid",
    placeItems: "center",
    gap: 8,
    padding: 16,
    textAlign: "center",
    color: "#e2e8f0",
    background: "linear-gradient(180deg, #374151 0%, #1f2937 100%)",
  },
  photoPreviewPhotoNotice: {
    width: "100%",
    height: "100%",
    minHeight: 150,
    display: "grid",
    placeItems: "center",
    gap: 8,
    padding: 16,
    textAlign: "center",
    color: "#e2e8f0",
    background: "linear-gradient(180deg, #374151 0%, #1f2937 100%)",
  },
  photoPreviewPath: {
    padding: "6px 10px",
    borderRadius: 10,
    background: "rgba(255, 255, 255, 0.08)",
    color: "#cbd5e1",
    fontSize: 11,
    lineHeight: 1.35,
    wordBreak: "break-all",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.52)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 1100,
  },
  modalCard: {
    width: "100%",
    maxWidth: 560,
    background: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    boxShadow: "0 20px 45px rgba(15,23,42,0.22)",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  modalTitle: {
    margin: 0,
    color: "#0F172A",
    fontSize: 22,
  },
  historyHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  imageViewer: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  imagePreview: {
    width: "100%",
    maxHeight: 520,
    objectFit: "contain",
    borderRadius: 16,
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
  },
  historyLink: {
    color: "#1D4ED8",
    fontWeight: 700,
    textDecoration: "underline",
    alignSelf: "flex-start",
  },
  photoViewerLoading: {
    alignSelf: "flex-start",
    color: "#64748B",
    fontSize: 13,
  },
  photoViewerErrorBox: {
    display: "grid",
    gap: 6,
    padding: 16,
    borderRadius: 16,
    border: "1px solid #FECACA",
    background: "#FEF2F2",
  },
  photoPreviewCenterPin: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    pointerEvents: "none",
  },
  photoPreviewCenterPinDot: {
    width: 18,
    height: 18,
    borderRadius: "999px",
    background: "#7c3aed",
    border: "3px solid #fff",
    boxShadow: "0 8px 18px rgba(124, 58, 237, 0.35)",
    transform: "translateY(-12px)",
  },
  photoPreviewCenterPinStem: {
    width: 4,
    height: 28,
    borderRadius: 999,
    background: "linear-gradient(180deg, #7c3aed 0%, #c4b5fd 100%)",
    transform: "translateY(-6px)",
    marginTop: -2,
  },
  photoPreviewOverlay: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    background: "rgba(15, 23, 42, 0.38)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: "0.02em",
    backdropFilter: "blur(2px)",
  },
  searchButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    border: "none",
    borderRadius: 12,
    background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)",
    color: "#fff",
    padding: "12px 18px",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 12px 30px rgba(29, 78, 216, 0.28)",
  },
  contentGrid: {
    display: "grid",
    gridTemplateColumns: "1.45fr 0.95fr",
    gap: 16,
    alignItems: "start",
    flex: 1,
    minHeight: 0,
  },
  mapCard: {
    marginBottom: 0,
    border: "1px solid #e2e8f0",
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 720,
  },
  listCard: {
    marginBottom: 0,
    border: "1px solid #e2e8f0",
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  rightColumn: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    minHeight: 0,
    overflow: "hidden",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: "#0f172a",
  },
  sectionSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#64748b",
    lineHeight: 1.5,
  },
  sectionMeta: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    color: "#1d4ed8",
    fontWeight: 700,
    padding: "6px 10px",
    borderRadius: 999,
    background: "#eff6ff",
  },
  pointDetailCard: {
    marginBottom: 14,
    borderRadius: 18,
    border: "1px solid #bfdbfe",
    background: "linear-gradient(180deg, #eff6ff 0%, #ffffff 100%)",
    boxShadow: "0 10px 28px rgba(37, 99, 235, 0.08)",
    padding: 14,
  },
  pointDetailHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
  pointDetailKicker: {
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "#2563eb",
    marginBottom: 4,
  },
  pointDetailTitle: {
    fontSize: 16,
    fontWeight: 800,
    color: "#0f172a",
    lineHeight: 1.2,
  },
  pointDetailTag: {
    flexShrink: 0,
    padding: "6px 10px",
    borderRadius: 999,
    background: "#dbeafe",
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: 700,
  },
  pointDetailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  pointDetailItem: {
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid #dbeafe",
    background: "rgba(255, 255, 255, 0.9)",
  },
  pointDetailLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#64748b",
    marginBottom: 4,
    fontWeight: 700,
  },
  pointDetailValue: {
    fontSize: 13,
    color: "#0f172a",
    fontWeight: 700,
    lineHeight: 1.35,
    wordBreak: "break-word",
  },
  mapWrap: {
    position: "relative",
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    borderRadius: 18,
    overflow: "hidden",
    border: "1px solid #cbd5e1",
    background: "#0f172a",
  },
  mapWrapExpanded: {
    position: "relative",
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    borderRadius: 18,
    overflow: "hidden",
    border: "1px solid #cbd5e1",
    background: "#0f172a",
  },
  map: {
    width: "100%",
    height: "100%",
    minHeight: 0,
  },
  mapOverlay: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    background: "rgba(15, 23, 42, 0.84)",
    color: "#e2e8f0",
    fontWeight: 700,
    fontSize: 14,
    textAlign: "center",
    padding: 20,
  },
  mapOverlayContent: {
    display: "grid",
    gap: 10,
    justifyItems: "center",
    maxWidth: 420,
  },
  mapOverlayTitle: {
    fontSize: 16,
    fontWeight: 800,
    color: "#fff",
  },
  mapOverlayText: {
    fontSize: 13,
    lineHeight: 1.55,
    color: "#cbd5e1",
  },
  mapRetryButton: {
    border: "none",
    borderRadius: 12,
    padding: "10px 14px",
    background: "linear-gradient(135deg, #38bdf8 0%, #1d4ed8 100%)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 12px 28px rgba(29, 78, 216, 0.28)",
  },
  mapError: {
    position: "absolute",
    left: 16,
    bottom: 16,
    maxWidth: 360,
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(254, 242, 242, 0.95)",
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: 700,
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.12)",
  },
  listBody: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflowX: "hidden",
    overflowY: "auto",
  },
  siteList: {
    display: "grid",
    gap: 10,
    minHeight: 0,
    paddingRight: 4,
  },
  siteRow: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    width: "100%",
    textAlign: "left",
    borderRadius: 16,
    border: "1px solid #cbd5e1",
    background: "#fff",
    padding: 12,
    cursor: "pointer",
    transition: "transform 120ms ease, border-color 120ms ease, box-shadow 120ms ease",
  },
  siteRowActive: {
    borderColor: "#2563eb",
    boxShadow: "0 10px 30px rgba(37, 99, 235, 0.14)",
    transform: "translateY(-1px)",
  },
  siteBadge: {
    minWidth: 32,
    height: 32,
    borderRadius: 999,
    background: "linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%)",
    color: "#fff",
    display: "grid",
    placeItems: "center",
    fontSize: 13,
    fontWeight: 800,
  },
  siteText: {
    display: "grid",
    gap: 4,
    minWidth: 0,
  },
  siteTitle: {
    fontSize: 14,
    fontWeight: 800,
    color: "#0f172a",
    lineHeight: 1.35,
  },
  siteMeta: {
    fontSize: 12,
    color: "#64748b",
    lineHeight: 1.35,
    wordBreak: "break-word",
  },
};



