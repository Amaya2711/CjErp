import React, { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, MapPinned, Route, Search, Waypoints } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { consultarSeguimientoEmpleado } from "../../../api/asistenciaService";
import { listarEmpleadosWup } from "../../../api/empleadoService";
import type { AsistenciaTrackingPunto, AsistenciaTrackingResponse } from "../../../models/asistencia";
import type { EmpleadoCta } from "../../../models/empleadoCta";
import { getHttpErrorMessage } from "../../../utils/httpError";

type MapsWindow = {
  maps: any;
};

type PointPosition = {
  lat: number;
  lng: number;
};

declare global {
  interface Window {
    google?: MapsWindow;
  }
}

const GOOGLE_SCRIPT_ID = "cj-google-maps-sdk";
const PERU_TZ = "America/Lima";
const DEFAULT_CENTER = { lat: -12.0464, lng: -77.0428 };

let googleMapsLoadPromise: Promise<void> | null = null;

function getPeruDateIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PERU_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseCoordinate(value: number | string | null | undefined) {
  if (value == null) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPositionKey(position: PointPosition) {
  return `${position.lat.toFixed(6)},${position.lng.toFixed(6)}`;
}

function parsePointTime(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatPointLabel(index: number) {
  return index + 1 < 10 ? String(index + 1) : String(index + 1);
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
  if (window.google?.maps) {
    return;
  }

  if (!googleMapsLoadPromise) {
    googleMapsLoadPromise = new Promise<void>((resolve, reject) => {
      const existing = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;

      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("No se pudo cargar Google Maps.")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.id = GOOGLE_SCRIPT_ID;
      script.async = true;
      script.defer = true;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&libraries=places`;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("No se pudo cargar Google Maps."));
      document.head.appendChild(script);
    });
  }

  return googleMapsLoadPromise;
}

function getPointPosition(point: AsistenciaTrackingPunto) {
  const lat = parseCoordinate(point.latPto);
  const lng = parseCoordinate(point.lonPto);

  if (lat == null || lng == null) {
    return null;
  }

  return { lat, lng };
}

function reverseGeocodePosition(geocoder: any, position: PointPosition) {
  return new Promise<string | null>((resolve) => {
    geocoder.geocode({ location: position }, (results: any[], status: string) => {
      if (status === "OK" && Array.isArray(results) && results.length > 0) {
        resolve(results[0]?.formatted_address ?? null);
        return;
      }

      resolve(null);
    });
  });
}

export default function SeguimientoEmpleadoPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const today = useMemo(() => getPeruDateIso(), []);
  const [idEmpleado, setIdEmpleado] = useState(searchParams.get("idEmpleado") ?? "");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [highlightedEmployeeIdx, setHighlightedEmployeeIdx] = useState<number>(-1);
  const [fechaAsistencia, setFechaAsistencia] = useState(searchParams.get("fechaAsistencia") ?? today);
  const [empleados, setEmpleados] = useState<EmpleadoCta[]>([]);
  const [empleadosLoading, setEmpleadosLoading] = useState(false);
  const [empleadosError, setEmpleadosError] = useState<string | null>(null);
  const [tracking, setTracking] = useState<AsistenciaTrackingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMap, setLoadingMap] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number>(-1);
  const [mapReady, setMapReady] = useState(false);
  const [resolvedLocations, setResolvedLocations] = useState<Record<string, string>>({});

  const mapWrapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const resolvedLocationsRef = useRef<Record<string, string>>({});
  const overlaysRef = useRef<{ markers: any[]; polyline: any | null; infoWindow: any | null }>({
    markers: [],
    polyline: null,
    infoWindow: null,
  });

  const points = useMemo(() => {
    const rows = tracking?.puntos ?? [];
    return [...rows].sort((a, b) => {
      const diff = parsePointTime(a.fechaHora) - parsePointTime(b.fechaHora);
      if (diff !== 0) {
        return diff;
      }

      return a.hora.localeCompare(b.hora, "es", { sensitivity: "base" });
    });
  }, [tracking]);

  const validPoints = useMemo(() => {
    return points
      .map((point, index) => ({
        point,
        index,
        position: getPointPosition(point),
      }))
      .filter(
        (
          item,
        ): item is {
          point: AsistenciaTrackingPunto;
          index: number;
          position: { lat: number; lng: number };
        } => item.position != null,
      );
  }, [points]);

  useEffect(() => {
    resolvedLocationsRef.current = resolvedLocations;
  }, [resolvedLocations]);

  const stats = useMemo(() => {
    const sources = new Map<string, number>();
    for (const point of points) {
      const source = point.source?.trim() || "Sin origen";
      sources.set(source, (sources.get(source) ?? 0) + 1);
    }

    return {
      total: points.length,
      valid: validPoints.length,
      first: points[0] ?? null,
      last: points[points.length - 1] ?? null,
      sources: [...sources.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [points, validPoints.length]);

  const selectedEmployee = useMemo(() => {
    const numericId = Number(idEmpleado);
    return empleados.find((item) => item.idEmpleado === numericId) ?? null;
  }, [empleados, idEmpleado]);

  const employeeOptions = useMemo(
    () =>
      [...empleados].sort((a, b) =>
        a.nombreEmpleado.localeCompare(b.nombreEmpleado, "es", { sensitivity: "base" })
      ),
    [empleados]
  );

  const filteredEmployees = useMemo(() => {
    const query = normalizeSearchText(employeeSearch);
    if (!query) {
      return employeeOptions;
    }

    return employeeOptions.filter((item) => {
      const label = normalizeSearchText(`${item.nombreEmpleado} ${item.nombreEmpleadoCJ || ""} ${item.idEmpleado}`);
      return label.includes(query);
    });
  }, [employeeOptions, employeeSearch]);

  useEffect(() => {
    let cancelled = false;

    setEmpleadosLoading(true);
    setEmpleadosError(null);

    void listarEmpleadosWup()
      .then((rows) => {
        if (!cancelled) {
          setEmpleados(rows);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setEmpleadosError(getHttpErrorMessage(error, "No se pudo cargar la lista de empleados."));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setEmpleadosLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedEmployee) {
      return;
    }

    setEmployeeSearch((current) => {
      const selectedName = selectedEmployee.nombreEmpleado || "";
      if (!current || current === String(selectedEmployee.idEmpleado) || current === selectedName) {
        return selectedName;
      }

      return current;
    });
  }, [selectedEmployee]);

  useEffect(() => {
    setHighlightedEmployeeIdx(filteredEmployees.length > 0 ? 0 : -1);
  }, [filteredEmployees.length, employeeSearch]);

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();

    if (!apiKey) {
      setMapError("Falta configurar VITE_GOOGLE_MAPS_API_KEY en el frontend.");
      return;
    }

    let cancelled = false;
    setLoadingMap(true);
    setMapError(null);

    loadGoogleMaps(apiKey)
      .then(() => {
        if (!cancelled) {
          setMapReady(true);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMapError(getHttpErrorMessage(error, "No se pudo cargar el mapa de Google."));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingMap(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapWrapRef.current || !window.google?.maps) {
      return;
    }

    const google = window.google.maps;
    const map = mapInstanceRef.current ?? new google.Map(mapWrapRef.current, {
      center: DEFAULT_CENTER,
      zoom: 13,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      clickableIcons: false,
      gestureHandling: "greedy",
      styles: [
        { elementType: "geometry", stylers: [{ color: "#0f172a" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#cbd5e1" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#0f172a" }] },
        { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#1e293b" }] },
        { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#334155" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0b1120" }] },
      ],
    });

    mapInstanceRef.current = map;

    overlaysRef.current.markers.forEach((marker) => marker.setMap(null));
    overlaysRef.current.markers = [];
    overlaysRef.current.polyline?.setMap(null);
    overlaysRef.current.polyline = null;

    if (validPoints.length === 0) {
      map.setCenter(DEFAULT_CENTER);
      map.setZoom(12);
      return;
    }

    const bounds = new google.LatLngBounds();
    const path = validPoints.map((item) => item.position);
    const polyline = new google.Polyline({
      path,
      geodesic: true,
      strokeColor: "#0ea5e9",
      strokeOpacity: 0.95,
      strokeWeight: 4,
      map,
    });
    overlaysRef.current.polyline = polyline;

    const infoWindow = overlaysRef.current.infoWindow ?? new google.InfoWindow();
    overlaysRef.current.infoWindow = infoWindow;

    validPoints.forEach((item, visibleIndex) => {
      const isFirst = visibleIndex === 0;
      const isLast = visibleIndex === validPoints.length - 1;
      const marker = new google.Marker({
        map,
        position: item.position,
        title: `${formatPointLabel(visibleIndex)}. ${item.point.hora || item.point.fechaHora || "Punto"}`,
        label: {
          text: formatPointLabel(visibleIndex),
          color: "#fff",
          fontWeight: "700",
        },
        icon: buildMarkerIcon(isFirst ? "#16a34a" : isLast ? "#ef4444" : "#2563eb"),
      });

      marker.addListener("click", () => {
        setSelectedPointIndex(item.index);
        const resolvedLocation = resolvedLocationsRef.current[formatPositionKey(item.position)] ?? "Buscando ubicacion...";
        infoWindow.setContent(`
          <div style="font-family: Arial, sans-serif; min-width: 220px;">
            <div style="font-weight: 700; font-size: 14px; margin-bottom: 6px;">${item.point.nombreEmpleado || "Empleado"}</div>
            <div style="font-size: 12px; margin-bottom: 3px;">${item.point.fechaAsistencia || ""} ${item.point.hora || ""}</div>
            <div style="font-size: 12px; margin-bottom: 3px;">Origen: ${item.point.source || "Sin origen"}</div>
            <div style="font-size: 12px; margin-bottom: 3px;">Lugar: ${resolvedLocation}</div>
            <div style="font-size: 12px;">Lat/Lon: ${item.position.lat.toFixed(6)}, ${item.position.lng.toFixed(6)}</div>
          </div>
        `);
        infoWindow.open({ map, anchor: marker });
      });

      overlaysRef.current.markers.push(marker);
      bounds.extend(item.position);
    });

    map.fitBounds(bounds);
    if (validPoints.length === 1) {
      map.setZoom(16);
    }
  }, [mapReady, validPoints]);

  useEffect(() => {
    if (!mapReady || validPoints.length === 0 || !window.google?.maps) {
      setResolvedLocations({});
      return;
    }

    let cancelled = false;
    const geocoder = new window.google.maps.Geocoder();
    const uniquePoints = new Map<string, PointPosition>();

    validPoints.forEach((item) => {
      const key = formatPositionKey(item.position);
      if (!uniquePoints.has(key)) {
        uniquePoints.set(key, item.position);
      }
    });

    void Promise.all(
      [...uniquePoints.entries()].map(async ([key, position]) => {
        const label = await reverseGeocodePosition(geocoder, position);
        return [key, label] as const;
      }),
    ).then((results) => {
      if (cancelled) {
        return;
      }

      setResolvedLocations((current) => {
        const next = { ...current };
        for (const [key, label] of results) {
          if (label) {
            next[key] = label;
          }
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [mapReady, validPoints]);

  useEffect(() => {
    if (!mapInstanceRef.current || selectedPointIndex < 0) {
      return;
    }

    const point = points[selectedPointIndex];
    const position = point ? getPointPosition(point) : null;
    if (!position) {
      return;
    }

    mapInstanceRef.current.panTo(position);
    mapInstanceRef.current.setZoom(Math.max(mapInstanceRef.current.getZoom?.() ?? 14, 15));
  }, [points, selectedPointIndex]);

  const handleLoadTracking = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const numericId = Number(idEmpleado);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      setPageError("Selecciona un empleado valido.");
      return;
    }

    if (!fechaAsistencia) {
      setPageError("Selecciona una fecha de asistencia.");
      return;
    }

    setLoading(true);
    setPageError(null);

    try {
      const data = await consultarSeguimientoEmpleado({
        idEmpleado: numericId,
        fechaAsistencia,
      });

      const ordered = {
        ...data,
        puntos: [...data.puntos].sort((a, b) => {
          const diff = parsePointTime(a.fechaHora) - parsePointTime(b.fechaHora);
          if (diff !== 0) {
            return diff;
          }

          return a.hora.localeCompare(b.hora, "es", { sensitivity: "base" });
        }),
      } satisfies AsistenciaTrackingResponse;

      setTracking(ordered);
      setSelectedPointIndex(ordered.puntos.length > 0 ? 0 : -1);
      setSearchParams({
        idEmpleado: String(numericId),
        fechaAsistencia,
      });
    } catch (error) {
      setTracking(null);
      setPageError(getHttpErrorMessage(error, "No se pudo consultar el seguimiento del empleado."));
    } finally {
      setLoading(false);
    }
  };

  const sourceTitle = stats.sources.length === 0 ? "Sin puntos" : `${stats.sources.length} origenes`;

  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div>
          <div style={styles.badge}>
            <Route size={14} />
            Seguimiento operacional
          </div>
          <h1 style={styles.title}>Seguimiento de empleado</h1>
          <p style={styles.subtitle}>
            Visualiza en Google Maps el recorrido registrado por un empleado en una fecha determinada.
          </p>
        </div>

        <div style={styles.heroCard}>
          <div style={styles.heroCardLabel}>Estado del mapa</div>
          <div style={styles.heroCardValue}>
            {loadingMap ? "Cargando Google Maps..." : mapReady ? "Mapa listo" : "Pendiente"}
          </div>
          <div style={styles.heroCardHint}>
            {mapError ?? "Define la clave en VITE_GOOGLE_MAPS_API_KEY para habilitar la visualizacion."}
          </div>
        </div>
      </div>

      <form onSubmit={handleLoadTracking} style={styles.filtersCard}>
        <div style={styles.field}>
          <label htmlFor="seguimiento-id" style={styles.label}>Empleado</label>
          <div style={styles.autocompleteWrap}>
            <input
              id="seguimiento-id"
              type="text"
              value={employeeSearch}
              onChange={(event) => {
                const nextValue = event.target.value;
                setEmployeeSearch(nextValue);
                setShowEmployeeDropdown(true);
                setIdEmpleado("");
              }}
              onFocus={() => {
                if (filteredEmployees.length > 0) {
                  setShowEmployeeDropdown(true);
                }
              }}
              onKeyDown={(event) => {
                if (!showEmployeeDropdown || filteredEmployees.length === 0) {
                  return;
                }

                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setHighlightedEmployeeIdx((current) => Math.min(current + 1, filteredEmployees.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setHighlightedEmployeeIdx((current) => Math.max(current - 1, 0));
                } else if (event.key === "Enter") {
                  if (highlightedEmployeeIdx >= 0 && highlightedEmployeeIdx < filteredEmployees.length) {
                    event.preventDefault();
                    const employee = filteredEmployees[highlightedEmployeeIdx];
                    setIdEmpleado(String(employee.idEmpleado));
                    setEmployeeSearch(employee.nombreEmpleado);
                    setShowEmployeeDropdown(false);
                  }
                } else if (event.key === "Escape") {
                  setShowEmployeeDropdown(false);
                }
              }}
              onBlur={() => {
                window.setTimeout(() => {
                  setShowEmployeeDropdown(false);

                  const exactMatch = employeeOptions.find(
                    (item) =>
                      normalizeSearchText(item.nombreEmpleado) === normalizeSearchText(employeeSearch) ||
                      normalizeSearchText(`${item.nombreEmpleado} ${item.nombreEmpleadoCJ || ""} ${item.idEmpleado}`) ===
                        normalizeSearchText(employeeSearch),
                  );

                  if (exactMatch) {
                    setIdEmpleado(String(exactMatch.idEmpleado));
                    setEmployeeSearch(exactMatch.nombreEmpleado);
                  }
                }, 120);
              }}
              placeholder={empleadosLoading ? "Cargando empleados..." : "Escribe el nombre del empleado"}
              style={styles.input}
              autoComplete="off"
              disabled={empleadosLoading}
            />

            {showEmployeeDropdown && employeeSearch.trim() && filteredEmployees.length > 0 ? (
              <div style={styles.autocompleteDropdown}>
                {filteredEmployees.slice(0, 8).map((empleado, index) => {
                  const active = index === highlightedEmployeeIdx;
                  return (
                    <button
                      key={empleado.idEmpleado}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setIdEmpleado(String(empleado.idEmpleado));
                        setEmployeeSearch(empleado.nombreEmpleado);
                        setShowEmployeeDropdown(false);
                      }}
                      onMouseEnter={() => setHighlightedEmployeeIdx(index)}
                      style={{
                        ...styles.autocompleteItem,
                        ...(active ? styles.autocompleteItemActive : {}),
                      }}
                    >
                      <div style={styles.autocompleteItemTitle}>{empleado.nombreEmpleado}</div>
                      <div style={styles.autocompleteItemMeta}>
                        ID {empleado.idEmpleado}
                        {empleado.nombreEmpleadoCJ ? ` · ${empleado.nombreEmpleadoCJ}` : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          {empleadosError ? <div style={styles.helperError}>{empleadosError}</div> : null}
        </div>

        <div style={styles.field}>
          <label htmlFor="seguimiento-fecha" style={styles.label}>
            <CalendarDays size={14} />
            Fecha asistencia
          </label>
          <input
            id="seguimiento-fecha"
            type="date"
            value={fechaAsistencia}
            onChange={(event) => setFechaAsistencia(event.target.value)}
            style={styles.input}
          />
        </div>

        <button type="submit" style={styles.primaryButton} disabled={loading}>
          <Search size={16} />
          {loading ? "Consultando..." : "Buscar recorrido"}
        </button>
      </form>

      {pageError ? <div style={styles.alertError}>{pageError}</div> : null}

      <div style={styles.kpiGrid}>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Puntos válidos</div>
          <div style={styles.kpiValue}>{stats.valid}</div>
          <div style={styles.kpiHint}>{stats.total} registros totales</div>
        </div>

        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Origenes</div>
          <div style={styles.kpiValue}>{sourceTitle}</div>
          <div style={styles.kpiHint}>
            {stats.sources.slice(0, 3).map(([source, count]) => `${source} (${count})`).join(" | ") || "Sin datos"}
          </div>
        </div>

        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Primer punto</div>
          <div style={styles.kpiValue}>{stats.first?.fechaHora || stats.first?.hora || "-"}</div>
          <div style={styles.kpiHint}>{selectedEmployee?.nombreEmpleado || stats.first?.source || "Sin origen"}</div>
        </div>

        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Ultimo punto</div>
          <div style={styles.kpiValue}>{stats.last?.fechaHora || stats.last?.hora || "-"}</div>
          <div style={styles.kpiHint}>{stats.last?.source || "Sin origen"}</div>
        </div>
      </div>

      <div style={styles.contentGrid}>
        <section style={styles.mapCard}>
          <div style={styles.sectionHeader}>
            <div>
              <div style={styles.sectionTitle}>Recorrido en mapa</div>
              <div style={styles.sectionSubtitle}>
                {tracking?.nombreEmpleado || selectedEmployee?.nombreEmpleado || "Empleado no cargado"} {tracking?.fechaAsistencia ? `- ${tracking.fechaAsistencia}` : ""}
              </div>
            </div>
            <div style={styles.sectionMeta}>
              <MapPinned size={15} />
              {stats.valid} puntos georreferenciados
            </div>
          </div>

          <div style={styles.mapWrap}>
            <div ref={mapWrapRef} style={styles.map} />
            {!mapReady ? (
              <div style={styles.mapOverlay}>
                {loadingMap ? "Cargando Google Maps..." : "Configura la clave de Google Maps para visualizar la ruta."}
              </div>
            ) : null}
            {mapError ? <div style={styles.mapError}>{mapError}</div> : null}
          </div>
        </section>

        <aside style={styles.summaryCard}>
          <div style={styles.summaryHeader}>
            <Waypoints size={18} />
            <div>
              <div style={styles.sectionTitle}>Detalle del recorrido</div>
              <div style={styles.sectionSubtitle}>{tracking?.nombreEmpleado || selectedEmployee?.nombreEmpleado || "Sin búsqueda realizada"}</div>
            </div>
          </div>

          <div style={styles.summaryBody}>
            {points.length === 0 ? (
              <div style={styles.emptyState}>Busca un empleado para revisar los puntos del día.</div>
            ) : (
              <div style={styles.pointList}>
                {points.map((point, index) => {
                  const position = getPointPosition(point);
                  const resolvedLocation = position ? resolvedLocations[formatPositionKey(position)] : null;
                  const active = index === selectedPointIndex;

                  return (
                    <button
                      key={`${point.fechaHora ?? point.hora}-${index}`}
                      type="button"
                      onClick={() => setSelectedPointIndex(index)}
                      style={{
                        ...styles.pointRow,
                        ...(active ? styles.pointRowActive : {}),
                      }}
                    >
                      <div style={styles.pointBadge}>{formatPointLabel(index)}</div>
                      <div style={styles.pointText}>
                        <div style={styles.pointTimeHighlighted}>
                          {point.fechaHora || point.hora || "Sin fecha y hora"}
                        </div>
                        <div style={styles.pointMeta}>
                          {point.source || "Sin origen"}
                        </div>
                        <div style={styles.pointMeta}>
                          {resolvedLocation || (position ? `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}` : "Coordenadas no validas")}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>

      <section style={styles.tableCard}>
        <div style={styles.sectionHeader}>
          <div>
            <div style={styles.sectionTitle}>Tabla de puntos</div>
            <div style={styles.sectionSubtitle}>Orden cronologico de marcaciones y puntos de tracking</div>
          </div>
          <div style={styles.sectionMeta}>
            <Route size={15} />
            {stats.total} filas
          </div>
        </div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>#</th>
                <th style={styles.th}>Hora</th>
                <th style={styles.th}>FechaHora</th>
                <th style={styles.th}>Origen</th>
                <th style={styles.th}>Latitud</th>
                <th style={styles.th}>Longitud</th>
              </tr>
            </thead>
            <tbody>
              {points.length === 0 ? (
                <tr>
                  <td style={styles.emptyCell} colSpan={6}>
                    No hay puntos para mostrar.
                  </td>
                </tr>
              ) : (
                points.map((point, index) => {
                  const isActive = index === selectedPointIndex;
                  return (
                    <tr
                      key={`${point.fechaHora ?? point.hora}-${index}`}
                      onClick={() => setSelectedPointIndex(index)}
                      style={isActive ? styles.activeRow : undefined}
                    >
                      <td style={styles.td}>{formatPointLabel(index)}</td>
                      <td style={styles.td}>{point.hora || "-"}</td>
                      <td style={styles.td}>{point.fechaHora || "-"}</td>
                      <td style={styles.td}>{point.source || "-"}</td>
                      <td style={styles.td}>{point.latPto?.toFixed(6) ?? "-"}</td>
                      <td style={styles.td}>{point.lonPto?.toFixed(6) ?? "-"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 24,
    display: "grid",
    gap: 20,
    background: "radial-gradient(circle at top left, #f8fafc 0%, #eef2ff 36%, #f8fafc 100%)",
    minHeight: "100vh",
  },
  hero: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 20,
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
    fontSize: 20,
    fontWeight: 800,
    marginTop: 8,
  },
  heroCardHint: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 1.5,
    color: "#cbd5e1",
  },
  filtersCard: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 16,
    padding: 18,
    borderRadius: 20,
    background: "#ffffff",
    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.08)",
    border: "1px solid #e2e8f0",
  },
  field: {
    display: "grid",
    gap: 8,
  },
  autocompleteWrap: {
    position: "relative",
    width: "100%",
  },
  label: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 700,
    color: "#334155",
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#f8fafc",
    color: "#0f172a",
    fontSize: 14,
    outline: "none",
  },
  helperError: {
    marginTop: 6,
    fontSize: 12,
    color: "#b91c1c",
    fontWeight: 600,
  },
  autocompleteDropdown: {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    right: 0,
    zIndex: 20,
    maxHeight: 260,
    overflowY: "auto",
    borderRadius: 14,
    border: "1px solid #dbe4f0",
    background: "#ffffff",
    boxShadow: "0 16px 30px rgba(15, 23, 42, 0.12)",
    padding: 6,
  },
  autocompleteItem: {
    width: "100%",
    textAlign: "left",
    border: "none",
    background: "transparent",
    borderRadius: 12,
    padding: "10px 12px",
    cursor: "pointer",
    display: "grid",
    gap: 2,
  },
  autocompleteItemActive: {
    background: "#eff6ff",
  },
  autocompleteItemTitle: {
    fontSize: 14,
    fontWeight: 800,
    color: "#0f172a",
  },
  autocompleteItemMeta: {
    fontSize: 12,
    color: "#64748b",
  },
  primaryButton: {
    alignSelf: "end",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "12px 16px",
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 12px 24px rgba(37, 99, 235, 0.22)",
  },
  alertError: {
    padding: "12px 14px",
    borderRadius: 14,
    background: "#fef2f2",
    color: "#b91c1c",
    border: "1px solid #fecaca",
    fontSize: 14,
    fontWeight: 600,
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 16,
  },
  kpiCard: {
    borderRadius: 18,
    padding: 18,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
  },
  kpiLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    color: "#64748b",
    marginBottom: 8,
    fontWeight: 700,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: 800,
    color: "#0f172a",
    lineHeight: 1.2,
  },
  kpiHint: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 8,
    lineHeight: 1.5,
  },
  contentGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.8fr) minmax(320px, 1fr)",
    gap: 18,
    alignItems: "start",
  },
  mapCard: {
    borderRadius: 24,
    padding: 18,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    boxShadow: "0 18px 36px rgba(15, 23, 42, 0.08)",
  },
  mapWrap: {
    position: "relative",
    marginTop: 16,
    borderRadius: 20,
    overflow: "hidden",
    minHeight: 620,
    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
  },
  map: {
    width: "100%",
    height: 620,
  },
  mapOverlay: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    background: "rgba(15, 23, 42, 0.55)",
    color: "#fff",
    fontWeight: 700,
    fontSize: 14,
    padding: 24,
    textAlign: "center",
  },
  mapError: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(254, 242, 242, 0.95)",
    color: "#b91c1c",
    border: "1px solid #fecaca",
    fontSize: 13,
    fontWeight: 600,
  },
  summaryCard: {
    borderRadius: 24,
    padding: 18,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    boxShadow: "0 18px 36px rgba(15, 23, 42, 0.08)",
  },
  summaryHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  summaryBody: {
    display: "grid",
    gap: 12,
  },
  emptyState: {
    padding: 18,
    borderRadius: 16,
    background: "#f8fafc",
    color: "#64748b",
    textAlign: "center",
    border: "1px dashed #cbd5e1",
  },
  pointList: {
    display: "grid",
    gap: 10,
    maxHeight: 590,
    overflowY: "auto",
    paddingRight: 4,
  },
  pointRow: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "42px minmax(0, 1fr)",
    gap: 12,
    alignItems: "start",
    textAlign: "left",
    borderRadius: 16,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    padding: 12,
    cursor: "pointer",
  },
  pointRowActive: {
    borderColor: "#2563eb",
    background: "#eff6ff",
    boxShadow: "0 0 0 3px rgba(37, 99, 235, 0.12)",
  },
  pointBadge: {
    width: 42,
    height: 42,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(135deg, #0f172a 0%, #2563eb 100%)",
    color: "#fff",
    fontWeight: 800,
    fontSize: 13,
  },
  pointText: {
    minWidth: 0,
  },
  pointTime: {
    fontWeight: 800,
    color: "#0f172a",
    marginBottom: 4,
  },
  pointTimeHighlighted: {
    fontWeight: 900,
    color: "#0f172a",
    background: "#fef3c7",
    border: "1px solid #f59e0b",
    borderRadius: 10,
    padding: "6px 10px",
    marginBottom: 6,
    display: "inline-block",
  },
  pointMeta: {
    fontSize: 12,
    color: "#64748b",
    lineHeight: 1.45,
    wordBreak: "break-word",
  },
  tableCard: {
    borderRadius: 24,
    padding: 18,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    boxShadow: "0 18px 36px rgba(15, 23, 42, 0.08)",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: "#0f172a",
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 4,
  },
  sectionMeta: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 999,
    background: "#eff6ff",
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: 700,
  },
  tableWrap: {
    marginTop: 16,
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    padding: "12px 10px",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#64748b",
    borderBottom: "1px solid #e2e8f0",
  },
  td: {
    padding: "12px 10px",
    borderBottom: "1px solid #f1f5f9",
    fontSize: 13,
    color: "#334155",
  },
  emptyCell: {
    padding: 20,
    textAlign: "center",
    color: "#64748b",
    fontSize: 14,
  },
  activeRow: {
    background: "#eff6ff",
  },
};
