import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { Search, RefreshCw, UserRound } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { obtenerFichaEmpleadoByName, type FichaEmpleadoRow } from "../../api/fichaService";
import { listarEmpleadosWup } from "../../api/empleadoService";
import type { EmpleadoCta } from "../../models/empleadoCta";
import { getAuthUser } from "../../utils/authStorage";
import { getHttpErrorMessage } from "../../utils/httpError";
import { SHAREPOINT_BASE_URL } from "../../utils/sharepoint";

const PHOTO_BASE_URL = `${SHAREPOINT_BASE_URL}APLICATIVOS%20EXTERNOS/FOTOS%5FEMPLEADO`;
const PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ""];

type FieldGroup = {
  title: string;
  items: Array<{ key: string; value: unknown }>;
};

function toText(value: unknown): string {
  if (value == null) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map((item) => toText(item)).filter(Boolean).join(", ");
  }

  if (typeof value === "boolean") {
    return value ? "Si" : "No";
  }

  return String(value).trim();
}

function formatLabel(key: string): string {
  const clean = key
    .replace(/^_+|_+$/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) {
    return key;
  }

  return clean.replace(/^./, (char) => char.toUpperCase());
}

function getFieldValue(row: FichaEmpleadoRow | null, ...keys: string[]): string {
  if (!row) {
    return "-";
  }

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = toText(row[key]);
      if (value) {
        return value;
      }
    }
  }

  const normalizedEntries = Object.entries(row).map(([key, value]) => [key.toLowerCase(), value] as const);

  for (const key of keys) {
    const found = normalizedEntries.find(([entryKey]) => entryKey === key.toLowerCase());
    if (found) {
      const value = toText(found[1]);
      if (value) {
        return value;
      }
    }
  }

  return "-";
}

function getFieldNumber(row: FichaEmpleadoRow | null, ...keys: string[]): number | null {
  const value = getFieldValue(row, ...keys);

  if (!value || value === "-") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matchesEmployeeSearch(label: string, query: string): boolean {
  const normalizedLabel = normalizeSearchText(label);
  const normalizedQuery = normalizeSearchText(query);
  return normalizedQuery.length === 0 || normalizedLabel.includes(normalizedQuery);
}

function isHiddenFichaField(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized === "nuevafechafinlaboral" ||
    normalized === "aprobacion1fecha" ||
    normalized === "aprobacion2fecha" ||
    normalized === "aprobacion3fecha"
  );
}

function isSummaryKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower.includes("idempleado") ||
    lower.includes("nombre") ||
    lower.includes("apellido") ||
    lower.includes("cargo") ||
    lower.includes("puesto") ||
    lower.includes("area") ||
    lower.includes("correo") ||
    lower.includes("email") ||
    lower.includes("telefono") ||
    lower.includes("celular") ||
    lower.includes("documento") ||
    lower.includes("dni") ||
    lower.includes("ruc")
  );
}

function classifyGroup(key: string): string {
  const lower = key.toLowerCase();

  if (
    lower.includes("telefono") ||
    lower.includes("correo") ||
    lower.includes("email") ||
    lower.includes("celular") ||
    lower.includes("direccion") ||
    lower.includes("domicilio")
  ) {
    return "Contacto";
  }

  if (
    lower.includes("cuenta") ||
    lower.includes("banco") ||
    lower.includes("cci") ||
    lower.includes("inter") ||
    lower.includes("nrocuenta")
  ) {
    return "Datos bancarios";
  }

  if (
    lower.includes("cargo") ||
    lower.includes("puesto") ||
    lower.includes("area") ||
    lower.includes("gerencia") ||
    lower.includes("departamento") ||
    lower.includes("sede") ||
    lower.includes("fechaingreso") ||
    lower.includes("fechaingreso") ||
    lower.includes("contrato") ||
    lower.includes("estado")
  ) {
    return "Datos laborales";
  }

  if (
    lower.includes("documento") ||
    lower.includes("dni") ||
    lower.includes("ruc") ||
    lower.includes("pasaporte")
  ) {
    return "Documentos";
  }

  if (isSummaryKey(key)) {
    return "Resumen";
  }

  return "Otros datos";
}

function buildPhotoCandidates(idEmpleado: number): string[] {
  const baseName = encodeURIComponent(String(idEmpleado));
  return PHOTO_EXTENSIONS.map((extension) => `${PHOTO_BASE_URL}/${baseName}${extension}`);
}

function EmployeePhoto({
  idEmpleado,
  nombreEmpleado,
}: {
  idEmpleado: number | null;
  nombreEmpleado: string;
}) {
  const candidates = useMemo(
    () => (idEmpleado && idEmpleado > 0 ? buildPhotoCandidates(idEmpleado) : []),
    [idEmpleado]
  );
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [idEmpleado]);

  const src = candidates[index];

  if (!src) {
    return (
      <div style={styles.photoPlaceholder}>
        <UserRound size={40} />
        <div style={styles.photoPlaceholderTitle}>Sin foto</div>
        <div style={styles.photoPlaceholderText}>{nombreEmpleado || `Empleado ${idEmpleado ?? "-"}`}</div>
      </div>
    );
  }

  return (
    <div style={styles.photoFrame}>
      <img
        key={src}
        src={src}
        alt={nombreEmpleado || `Empleado ${idEmpleado}`}
        style={styles.photo}
        onError={() => setIndex((current) => current + 1)}
      />
    </div>
  );
}

export default function FichaPage() {
  const authUser = getAuthUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [initialEmployeeId] = useState(() => {
    const fromQuery =
      (searchParams.get("nombreEmpleado") ?? "").trim() ||
      (searchParams.get("nombreempleado") ?? "").trim();
    const fromAuth =
      String(authUser?.nombreEmpleado ?? authUser?.empleado ?? authUser?.nombre ?? "").trim();

    return fromQuery || fromAuth;
  });

  const [employeeNameInput, setEmployeeNameInput] = useState(() => initialEmployeeId || "");
  const [rows, setRows] = useState<FichaEmpleadoRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeesError, setEmployeesError] = useState<string | null>(null);
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [highlightedEmployeeIdx, setHighlightedEmployeeIdx] = useState(-1);
  const [employeeOptions, setEmployeeOptions] = useState<EmpleadoCta[]>([]);
  const searchRequestIdRef = useRef(0);

  const ficha = rows[0] ?? null;
  const selectedEmployeeId = getFieldNumber(ficha, "IdEmpleado", "idEmpleado", "IdEmpleadoCj", "idEmpleadoCj");
  const nombreEmpleado = getFieldValue(ficha, "NombreEmpleado", "nombreEmpleado", "Nombre", "nombre");
  const cargoEmpleado = getFieldValue(ficha, "Cargo", "cargo", "Puesto", "puesto");
  const correoEmpleado = getFieldValue(ficha, "Correo", "correo", "Email", "email");
  const telefonoEmpleado = getFieldValue(ficha, "Telefono", "telefono", "Celular", "celular");
  const documentoEmpleado = getFieldValue(ficha, "NroDocumento", "nroDocumento", "Documento", "documento");
  const areaEmpleado = getFieldValue(ficha, "Area", "area", "Departamento", "departamento");
  const empresaEmpleado = getFieldValue(ficha, "Empresa", "empresa", "Responsable", "responsable");
  const clienteEmpleado = getFieldValue(ficha, "Cliente", "cliente", "SoValidador", "soValidador", "SolValidador", "solValidador");
  const ubicacionEmpleado = getFieldValue(ficha, "Ubicacion", "ubicacion", "TerValidador", "terValidador", "TercerValidador", "tercerValidador");
  const bancoEmpleado = getFieldValue(ficha, "NombreBanco", "nombreBanco", "Banco", "banco");
  const cuentaEmpleado = getFieldValue(ficha, "Cuenta", "cuenta");
  const cuentaInterEmpleado = getFieldValue(ficha, "CuentaInter", "cuentaInter", "CCI", "cci");

  const employeeMatches = useMemo(() => {
    const query = employeeNameInput.trim();

    return employeeOptions
      .filter((empleado) => {
        const label = empleado.nombreEmpleadoCJ || empleado.nombreEmpleado || String(empleado.idEmpleado);
        return matchesEmployeeSearch(label, query);
      })
      .slice(0, 10)
      .map((empleado) => {
        const label = empleado.nombreEmpleadoCJ || empleado.nombreEmpleado || String(empleado.idEmpleado);

        return {
          id: empleado.idEmpleado,
          label,
          detail: empleado.nroDocumento ? `ID ${empleado.idEmpleado} | ${empleado.nroDocumento}` : `ID ${empleado.idEmpleado}`,
        };
      });
  }, [employeeNameInput, employeeOptions]);

  const visibleFields = useMemo(() => {
    if (!ficha) {
      return [];
    }

    return Object.entries(ficha).filter(([key, value]) => {
      if (isHiddenFichaField(key)) {
        return false;
      }

      const text = toText(value);
      return text.length > 0;
    });
  }, [ficha]);

  const groups = useMemo<FieldGroup[]>(() => {
    const bucketMap = new Map<string, Array<{ key: string; value: unknown }>>();
    const hiddenFieldKeys = new Set([
      "empresa",
      "Empresa",
      "cliente",
      "Cliente",
      "ubicacion",
      "Ubicacion",
    ]);

    for (const [key, value] of visibleFields) {
      if (hiddenFieldKeys.has(key)) {
        continue;
      }

      const groupName = classifyGroup(key);
      const bucket = bucketMap.get(groupName) ?? [];
      bucket.push({ key, value });
      bucketMap.set(groupName, bucket);
    }

    const order = ["Resumen", "Datos laborales", "Contacto", "Datos bancarios", "Documentos", "Otros datos"];
    return order
      .map((title) => ({ title, items: bucketMap.get(title) ?? [] }))
      .filter((group) => group.items.length > 0);
  }, [visibleFields]);

  const loadFicha = async (value?: string) => {
    const normalizedValue = (value ?? employeeNameInput).trim();
    const requestId = ++searchRequestIdRef.current;

    if (!normalizedValue) {
      setError("Ingrese un NombreEmpleado valido.");
      setRows([]);
      setColumns([]);
      setTotalRows(0);
      setShowEmployeeDropdown(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await obtenerFichaEmpleadoByName(normalizedValue);

      if (requestId !== searchRequestIdRef.current) {
        return;
      }

      setRows(response.rows);
      setColumns(response.columns);
      setTotalRows(response.totalRows);
      setSearchParams({ nombreEmpleado: normalizedValue }, { replace: true });
      setShowEmployeeDropdown(false);
    } catch (err) {
      if (requestId !== searchRequestIdRef.current) {
        return;
      }

      setRows([]);
      setColumns([]);
      setTotalRows(0);
      setError(getHttpErrorMessage(err, "No se pudo obtener la ficha del empleado."));
    } finally {
      if (requestId !== searchRequestIdRef.current) {
        return;
      }

      setLoading(false);
    }
  };

  useEffect(() => {
    let activo = true;

    setEmployeesLoading(true);
    setEmployeesError(null);

    listarEmpleadosWup()
      .then((data) => {
        if (!activo) {
          return;
        }

        const validos = Array.isArray(data)
          ? data.filter((item) => item && item.idEmpleado > 0)
          : [];

        setEmployeeOptions(
          validos.sort((a, b) =>
            (a.nombreEmpleadoCJ || a.nombreEmpleado || "").localeCompare(
              b.nombreEmpleadoCJ || b.nombreEmpleado || "",
              "es",
              { sensitivity: "base" }
            )
          )
        );
      })
      .catch(() => {
        if (!activo) {
          return;
        }

        setEmployeeOptions([]);
        setEmployeesError("No se pudieron cargar las coincidencias de empleados.");
      })
      .finally(() => {
        if (!activo) {
          return;
        }

        setEmployeesLoading(false);
      });

    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    if (!initialEmployeeId) {
      return;
    }

    setEmployeeNameInput(initialEmployeeId);
    void loadFicha(initialEmployeeId);
    // Carga inicial para el nombre resuelto al entrar a la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEmployeeId]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadFicha();
  };

  const seleccionarEmpleado = (value: string) => {
    setEmployeeNameInput(value);
    setHighlightedEmployeeIdx(-1);
    setShowEmployeeDropdown(false);
    void loadFicha(value);
  };

  return (
    <section style={styles.page}>
      <div style={styles.hero}>
        <div style={styles.heroText}>
          <div style={styles.breadcrumb}>Recursos Humanos / Ficha</div>
          <h1 style={styles.title}>Ficha de empleado</h1>
          <p style={styles.subtitle}>
            
          </p>

          <form onSubmit={handleSubmit} style={styles.searchRow}>
            <label style={styles.searchField}>
              <span style={styles.searchLabel}>Empleado</span>
              <div style={styles.autocompleteWrap}>
                <input
                  value={employeeNameInput}
                  onChange={(event) => {
                    setEmployeeNameInput(event.target.value);
                    setShowEmployeeDropdown(true);
                    setHighlightedEmployeeIdx(-1);
                  }}
                  onFocus={() => {
                    if (employeeMatches.length > 0) {
                      setShowEmployeeDropdown(true);
                    }
                  }}
                  onBlur={() => {
                    window.setTimeout(() => setShowEmployeeDropdown(false), 150);
                  }}
                  onKeyDown={(event) => {
                    if (employeeMatches.length === 0) {
                      if (event.key === "Escape") {
                        setShowEmployeeDropdown(false);
                      }
                      return;
                    }

                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setHighlightedEmployeeIdx((current) => Math.min(current + 1, employeeMatches.length - 1));
                      setShowEmployeeDropdown(true);
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setHighlightedEmployeeIdx((current) => Math.max(current - 1, 0));
                      setShowEmployeeDropdown(true);
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      const selected =
                        highlightedEmployeeIdx >= 0
                          ? employeeMatches[highlightedEmployeeIdx]
                          : employeeMatches[0];

                      if (selected) {
                        seleccionarEmpleado(selected.label);
                      }
                    } else if (event.key === "Escape") {
                      setShowEmployeeDropdown(false);
                    }
                  }}
                  placeholder={employeesLoading ? "Cargando empleados..." : "Ingrese el nombre del empleado"}
                  style={styles.searchInput}
                  autoComplete="off"
                />
                {showEmployeeDropdown && employeeMatches.length > 0 ? (
                  <div style={styles.autocompleteDropdown}>
                    {employeeMatches.map((employee, index) => (
                      <button
                        key={`${employee.id}-${employee.label}`}
                        type="button"
                        style={{
                          ...styles.autocompleteOption,
                          background: index === highlightedEmployeeIdx ? "#E0F2FE" : "#FFFFFF",
                        }}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          seleccionarEmpleado(employee.label);
                        }}
                        onMouseEnter={() => setHighlightedEmployeeIdx(index)}
                      >
                        <span style={styles.autocompleteOptionLabel}>{employee.label}</span>
                        <span style={styles.autocompleteOptionDetail}>{employee.detail}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </label>
            <button type="submit" style={styles.primaryButton} disabled={loading}>
              <Search size={16} />
              {loading ? "Buscando..." : "Buscar ficha"}
            </button>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => {
                if (employeeNameInput.trim()) {
                  void loadFicha(employeeNameInput);
                }
              }}
              disabled={loading || !employeeNameInput.trim()}
            >
              <RefreshCw size={16} />
              Actualizar
            </button>
          </form>
        </div>

        <div style={styles.heroStats}>
          <div style={styles.heroStatRow}>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{empresaEmpleado}</div>
              <div style={styles.statLabel}>Empresa</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{clienteEmpleado}</div>
              <div style={styles.statLabel}>Cliente</div>
            </div>
          </div>
          <div style={styles.heroStatRow}>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{ubicacionEmpleado}</div>
              <div style={styles.statLabel}>Ubicacion</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{areaEmpleado}</div>
              <div style={styles.statLabel}>Area</div>
            </div>
          </div>
        </div>
      </div>

      {error ? <div style={styles.errorBanner}>{error}</div> : null}
      {employeesError ? <div style={styles.errorBanner}>{employeesError}</div> : null}

      <section style={styles.profileCard}>
        <div style={styles.profileHeader}>
          <EmployeePhoto idEmpleado={selectedEmployeeId} nombreEmpleado={nombreEmpleado} />

            <div style={styles.profileMain}>
              <div style={styles.profileBadge}>Ficha de empleado</div>
              <h2 style={styles.profileName}>{nombreEmpleado || `Empleado ${selectedEmployeeId ?? "-"}`}</h2>
              <p style={styles.profileMeta}>{cargoEmpleado || "Sin cargo"}</p>

              <div style={styles.quickFacts}>
              <div style={styles.quickFact}>
                <span style={styles.quickFactLabel}>Correo</span>
                <strong style={styles.quickFactValue}>{correoEmpleado}</strong>
              </div>
              <div style={styles.quickFact}>
                <span style={styles.quickFactLabel}>Telefono</span>
                <strong style={styles.quickFactValue}>{telefonoEmpleado}</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div style={styles.sectionStack}>
        <div style={styles.sectionRow}>
          {groups
            .filter((group) => group.title === "Otros datos")
            .map((group) => (
              <section key={group.title} style={styles.sectionCardHorizontal}>
                <div style={styles.sectionHeader}>
                  <h3 style={styles.sectionTitle}>{group.title}</h3>
                  <span style={styles.sectionCount}>{group.items.length} campos</span>
                </div>

                <div style={styles.fieldsGridHorizontal}>
                  {group.items.map((item) => (
                    <div key={item.key} style={styles.fieldCardHorizontal}>
                      <span style={styles.fieldLabel}>{formatLabel(item.key)}</span>
                      <div style={styles.fieldValue}>{toText(item.value) || "-"}</div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
        </div>
      </div>

      {!loading && !error && rows.length === 0 ? (
        <section style={styles.emptyState}>
          <UserRound size={42} />
          <h3 style={styles.emptyTitle}>Sin datos para mostrar</h3>
          <p style={styles.emptyText}>
            Ingrese un <code>NombreEmpleado</code> para consultar el store y cargar la ficha.
          </p>
        </section>
      ) : null}
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    display: "grid",
    gap: 20,
    padding: 20,
    background:
      "radial-gradient(circle at top left, rgba(227, 242, 253, 0.95), rgba(248, 250, 252, 1) 45%, #F8FAFC 100%)",
  },
  hero: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 20,
    alignItems: "stretch",
  },
  heroText: {
    background: "linear-gradient(135deg, #0F172A, #1E293B 70%, #334155)",
    color: "#F8FAFC",
    borderRadius: 24,
    padding: 24,
    boxShadow: "0 24px 60px rgba(15, 23, 42, 0.18)",
  },
  breadcrumb: {
    display: "inline-flex",
    alignItems: "center",
    width: "fit-content",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    background: "rgba(255,255,255,0.12)",
    color: "#BFDBFE",
    marginBottom: 12,
  },
  title: {
    margin: 0,
    fontSize: 40,
    lineHeight: 1.05,
    fontWeight: 900,
  },
  subtitle: {
    marginTop: 14,
    marginBottom: 18,
    color: "#CBD5E1",
    fontSize: 15,
    lineHeight: 1.65,
    maxWidth: 760,
  },
  searchRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "end",
  },
  searchField: {
    display: "grid",
    gap: 6,
    minWidth: 650,
    flex: "1 1 650px",
  },
  searchLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.35,
    textTransform: "uppercase",
    color: "#BFDBFE",
  },
  searchInput: {
    width: "100%",
    border: "1px solid rgba(148, 163, 184, 0.45)",
    borderRadius: 14,
    padding: "14px 16px",
    background: "rgba(255,255,255,0.96)",
    color: "#0F172A",
    fontSize: 16,
    fontWeight: 600,
    outline: "none",
  },
  autocompleteWrap: {
    position: "relative",
    width: "100%",
  },
  autocompleteDropdown: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "calc(100% + 8px)",
    zIndex: 20,
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: 16,
    boxShadow: "0 18px 36px rgba(15, 23, 42, 0.12)",
    overflow: "hidden",
    maxHeight: 320,
    overflowY: "auto",
  },
  autocompleteOption: {
    width: "100%",
    display: "grid",
    gap: 3,
    textAlign: "left",
    padding: "12px 14px",
    border: "none",
    background: "#FFFFFF",
    cursor: "pointer",
    borderBottom: "1px solid #F1F5F9",
  },
  autocompleteOptionLabel: {
    fontSize: 14,
    fontWeight: 800,
    color: "#0F172A",
  },
  autocompleteOptionDetail: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 600,
  },
  primaryButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    border: "none",
    borderRadius: 14,
    padding: "12px 16px",
    background: "#F59E0B",
    color: "#111827",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 12px 28px rgba(245, 158, 11, 0.24)",
  },
  secondaryButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 14,
    padding: "12px 16px",
    background: "rgba(255,255,255,0.08)",
    color: "#F8FAFC",
    fontWeight: 800,
    cursor: "pointer",
  },
  heroStats: {
    display: "grid",
    gap: 12,
  },
  heroStatRow: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },
  statCard: {
    background: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    border: "1px solid #E2E8F0",
    boxShadow: "0 14px 30px rgba(15, 23, 42, 0.06)",
  },
  statValue: {
    fontSize: 28,
    fontWeight: 900,
    color: "#0F172A",
  },
  statLabel: {
    marginTop: 4,
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  errorBanner: {
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    color: "#B91C1C",
    borderRadius: 16,
    padding: "12px 14px",
    fontWeight: 600,
  },
  profileCard: {
    background: "#FFFFFF",
    borderRadius: 24,
    padding: 22,
    border: "1px solid #E2E8F0",
    boxShadow: "0 18px 42px rgba(15, 23, 42, 0.08)",
  },
  profileHeader: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr)",
    gap: 20,
    alignItems: "center",
  },
  photoFrame: {
    width: 170,
    height: 210,
    borderRadius: 22,
    overflow: "hidden",
    border: "1px solid #E2E8F0",
    boxShadow: "0 16px 30px rgba(15,23,42,0.10)",
    background: "linear-gradient(180deg, #F8FAFC, #E2E8F0)",
  },
  photo: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  photoPlaceholder: {
    width: 170,
    height: 210,
    borderRadius: 22,
    display: "grid",
    placeItems: "center",
    alignContent: "center",
    gap: 8,
    border: "1px dashed #CBD5E1",
    color: "#64748B",
    background: "linear-gradient(180deg, #F8FAFC, #FFFFFF)",
  },
  photoPlaceholderTitle: {
    fontWeight: 800,
    color: "#0F172A",
  },
  photoPlaceholderText: {
    fontSize: 13,
    color: "#64748B",
  },
  profileMain: {
    display: "grid",
    gap: 10,
  },
  profileBadge: {
    display: "inline-flex",
    width: "fit-content",
    padding: "6px 10px",
    borderRadius: 999,
    background: "#DBEAFE",
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  profileName: {
    margin: 0,
    fontSize: 30,
    lineHeight: 1.1,
    fontWeight: 900,
    color: "#0F172A",
  },
  profileMeta: {
    margin: 0,
    fontSize: 15,
    color: "#475569",
    fontWeight: 600,
  },
  quickFacts: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    marginTop: 8,
  },
  quickFact: {
    borderRadius: 16,
    border: "1px solid #E2E8F0",
    padding: "12px 14px",
    background: "#F8FAFC",
  },
  quickFactLabel: {
    display: "block",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.35,
    color: "#64748B",
    fontWeight: 800,
    marginBottom: 4,
  },
  quickFactValue: {
    fontSize: 14,
    color: "#0F172A",
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },
  summaryCard: {
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: 20,
    padding: 18,
    boxShadow: "0 10px 26px rgba(15, 23, 42, 0.06)",
    minHeight: 92,
  },
  summaryLabel: {
    display: "block",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.35,
    textTransform: "uppercase",
    color: "#64748B",
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 16,
    lineHeight: 1.45,
    color: "#0F172A",
  },
  sectionCard: {
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: 24,
    padding: 22,
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
  },
  sectionCardHorizontal: {
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: 24,
    padding: 18,
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
    minWidth: 0,
    overflowX: "hidden",
  },
  sectionStack: {
    display: "grid",
    gap: 20,
  },
  sectionRow: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 16,
    alignItems: "start",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 900,
    color: "#0F172A",
  },
  sectionCount: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  fieldsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  fieldsGridHorizontal: {
    display: "grid",
    width: "100%",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    minWidth: 0,
  },
  fieldCard: {
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    borderRadius: 16,
    padding: "12px 14px",
  },
  fieldCardHorizontal: {
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    borderRadius: 16,
    padding: "10px 12px",
    minWidth: 0,
    width: "100%",
  },
  fieldLabel: {
    display: "block",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.35,
    textTransform: "uppercase",
    color: "#64748B",
    marginBottom: 6,
  },
  fieldValue: {
    fontSize: 14,
    color: "#0F172A",
    fontWeight: 600,
    lineHeight: 1.5,
    wordBreak: "break-word",
  },
  emptyState: {
    display: "grid",
    placeItems: "center",
    gap: 8,
    textAlign: "center",
    background: "#FFFFFF",
    border: "1px dashed #CBD5E1",
    borderRadius: 24,
    padding: 30,
    color: "#475569",
  },
  emptyTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 900,
    color: "#0F172A",
  },
  emptyText: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.6,
    maxWidth: 640,
  },
};
