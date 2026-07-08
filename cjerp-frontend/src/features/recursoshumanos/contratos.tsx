import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { Ban, CalendarClock, RefreshCw, Save, Search, UserRound } from "lucide-react";
import { listarEmpleadosWup } from "../../api/empleadoService";
import {
  desactivarHistorialContrato,
  obtenerContratoEmpleado,
  renovarContratoEmpleado,
  type ContratoEmpleadoHistorial,
} from "../../api/contratosService";
import type { EmpleadoCta } from "../../models/empleadoCta";
import { getHttpErrorMessage } from "../../utils/httpError";
import { SHAREPOINT_BASE_URL } from "../../utils/sharepoint";

const PHOTO_BASE_URL = `${SHAREPOINT_BASE_URL}APLICATIVOS%20EXTERNOS/FOTOS%5FEMPLEADO`;
const PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ""];

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatDateLabel(value?: string | null) {
  if (!value) return "-";
  const trimmed = value.trim();
  if (!trimmed) return "-";
  const datePart = trimmed.includes(" ") ? trimmed.split(" ")[0] : trimmed;
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!isoMatch) {
    return trimmed;
  }

  return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
}

function toInputDate(value?: string | null) {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const datePart = trimmed.includes(" ") ? trimmed.split(" ")[0] : trimmed;
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : "";
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

export default function ContratosPage() {
  const [employees, setEmployees] = useState<EmpleadoCta[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number>(0);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof obtenerContratoEmpleado>> | null>(null);
  const [newEndDate, setNewEndDate] = useState("");
  const [observation, setObservation] = useState("");

  useEffect(() => {
    let active = true;

    const loadEmployees = async () => {
      setLoadingEmployees(true);
      setError("");

      try {
        const rows = await listarEmpleadosWup();
        if (!active) return;
        setEmployees(rows);
      } catch (err) {
        if (!active) return;
        setError(getHttpErrorMessage(err, "No se pudo cargar la lista de empleados."));
      } finally {
        if (active) {
          setLoadingEmployees(false);
        }
      }
    };

    void loadEmployees();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (selectedEmployeeId <= 0) {
      setDetail(null);
      setNewEndDate("");
      setObservation("");
      return;
    }

    let active = true;

    const loadDetail = async () => {
      setLoadingDetail(true);
      setError("");
      setSuccess("");

      try {
        const response = await obtenerContratoEmpleado(selectedEmployeeId);
        if (!active) return;
        setDetail(response);
        setNewEndDate(toInputDate(response.empleado?.fechaFinLaboral));
        setObservation("");
      } catch (err) {
        if (!active) return;
        setError(getHttpErrorMessage(err, "No se pudo cargar el contrato del empleado."));
      } finally {
        if (active) {
          setLoadingDetail(false);
        }
      }
    };

    void loadDetail();
    return () => {
      active = false;
    };
  }, [selectedEmployeeId]);

  const filteredEmployees = useMemo(() => {
    const query = normalizeText(employeeSearch);
    return employees
      .filter((item) => !query || normalizeText(item.nombreEmpleado).includes(query))
      .sort((a, b) => a.nombreEmpleado.localeCompare(b.nombreEmpleado, "es"));
  }, [employeeSearch, employees]);

  const employee = detail?.empleado ?? null;
  const history = detail?.historial ?? [];

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!employee || employee.idEmpleado <= 0) {
      setError("Debe seleccionar un empleado.");
      setSuccess("");
      return;
    }

    if (!newEndDate) {
      setError("Debe ingresar la nueva fecha fin de contrato.");
      setSuccess("");
      return;
    }

    if (employee.fechaIniLaboral && newEndDate < toInputDate(employee.fechaIniLaboral)) {
      setError("La nueva fecha fin no puede ser menor que la fecha de inicio laboral.");
      setSuccess("");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await renovarContratoEmpleado({
        idEmpleado: employee.idEmpleado,
        nuevaFechaFinLaboral: newEndDate,
        motivoMovimiento: "RENOVACION",
        observacion: observation.trim(),
      });

      const refreshed = await obtenerContratoEmpleado(employee.idEmpleado);
      setDetail(refreshed);
      setNewEndDate(toInputDate(refreshed.empleado?.fechaFinLaboral));
      setObservation("");
      setSuccess("La vigencia del contrato fue actualizada y el historial se registro correctamente.");
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo actualizar la vigencia del contrato."));
      setSuccess("");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivateHistory = async (item: ContratoEmpleadoHistorial) => {
    if (!item.idHistorialLaboral) {
      return;
    }

    if (item.idActivo === false) {
      setError("El registro ya está desactivado.");
      setSuccess("");
      return;
    }

    setDeactivatingId(item.idHistorialLaboral);
    setError("");
    setSuccess("");

    try {
      await desactivarHistorialContrato(item.idHistorialLaboral);
      const refreshed = await obtenerContratoEmpleado(employee!.idEmpleado);
      setDetail(refreshed);
      setSuccess("El registro del historial fue desactivado correctamente.");
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo desactivar el registro del historial."));
    } finally {
      setDeactivatingId(null);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.breadcrumb}>Recursos Humanos / Contratos</div>
          <h1 style={styles.title}>Renovacion de contratos</h1>
          <p style={styles.subtitle}>
            Actualiza la fecha de vigencia en <code>EmpleadoCj</code> y registra el historial de renovaciones.
          </p>
        </div>
        <div style={styles.headerIconWrap}>
          <CalendarClock size={28} />
        </div>
      </div>

      <section style={styles.panel}>
        <div style={styles.searchRow}>
          <label style={styles.fieldBlock}>
            <span style={styles.label}>Buscar empleado</span>
            <div style={styles.inputWithIcon}>
              <Search size={16} />
              <input
                value={employeeSearch}
                onChange={(event) => setEmployeeSearch(event.target.value)}
                placeholder="Escriba el nombre del empleado"
                style={styles.input}
              />
            </div>
          </label>

          <label style={styles.fieldBlock}>
            <span style={styles.label}>Empleado</span>
            <select
              value={selectedEmployeeId || ""}
              onChange={(event) => setSelectedEmployeeId(Number(event.target.value) || 0)}
              style={styles.select}
              disabled={loadingEmployees}
            >
              <option value="">Seleccione un empleado</option>
              {filteredEmployees.map((item) => (
                <option key={item.idEmpleado} value={item.idEmpleado}>
                  {item.nombreEmpleado}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            style={styles.refreshButton}
            onClick={() => {
              if (employee?.idEmpleado) {
                setSelectedEmployeeId(employee.idEmpleado);
              }
            }}
            disabled={loadingDetail || selectedEmployeeId <= 0}
          >
            <RefreshCw size={16} />
            Recargar
          </button>
        </div>

        {error ? <div style={styles.errorBox}>{error}</div> : null}
        {success ? <div style={styles.successBox}>{success}</div> : null}

        {loadingDetail ? (
          <div style={styles.emptyState}>Cargando contrato del empleado...</div>
        ) : !employee ? (
          <div style={styles.emptyState}>Seleccione un empleado para consultar su vigencia contractual.</div>
        ) : (
          <>
            <div style={styles.topSectionGrid}>
              <div style={styles.profileCard}>
                <div style={styles.profileHeader}>
                  <EmployeePhoto idEmpleado={employee.idEmpleado} nombreEmpleado={employee.nombreEmpleado} />

                  <div style={styles.profileMain}>
                    <h2 style={styles.profileName}>{employee.nombreEmpleado || `Empleado ${employee.idEmpleado}`}</h2>
                    <p style={styles.profileMeta}>
                      {employee.empresa || "Sin empresa"}
                      {employee.cliente ? ` | ${employee.cliente}` : ""}
                      {employee.area ? ` | ${employee.area}` : ""}
                      {employee.ubicacion ? ` | ${employee.ubicacion}` : ""}
                    </p>
                    <p style={styles.profileContact}>
                      {employee.correo || "Sin correo"}
                      {employee.telefono ? ` | ${employee.telefono}` : ""}
                      {employee.nroDocumento ? ` | ${employee.nroDocumento}` : ""}
                    </p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmit} style={styles.formCard}>
                <div style={styles.formStack}>
                  <div style={styles.datePairRow}>
                    <label style={styles.fieldBlock}>
                      <span style={styles.label}>Fecha inicio laboral</span>
                      <input value={toInputDate(employee.fechaIniLaboral)} readOnly style={styles.inputReadOnly} />
                    </label>

                    <label style={styles.fieldBlock}>
                      <span style={styles.label}>Fecha fin actual</span>
                      <input value={toInputDate(employee.fechaFinLaboral)} readOnly style={styles.inputReadOnly} />
                    </label>
                    <label style={styles.fieldBlock}>
                      <span style={styles.label}>Nueva fecha fin</span>
                      <input
                        type="date"
                        value={newEndDate}
                        onChange={(event) => setNewEndDate(event.target.value)}
                        style={styles.inputDate}
                        disabled={saving}
                      />
                    </label>
                  </div>

                  <label style={styles.fieldBlock}>
                    <span style={styles.label}>Observacion</span>
                    <textarea
                      value={observation}
                      onChange={(event) => setObservation(event.target.value)}
                      rows={4}
                      style={styles.textarea}
                      placeholder="Detalle de la renovacion o ampliacion del contrato"
                      disabled={saving}
                    />
                  </label>
                </div>

                <div style={styles.formActions}>
                  <button type="submit" style={styles.primaryButton} disabled={saving}>
                    <Save size={16} />
                    {saving ? "Guardando..." : "Actualizar vigencia"}
                  </button>
                </div>
              </form>
            </div>

            <div style={styles.historyPanel}>
              <div style={styles.historyHeader}>
                <h2 style={styles.historyTitle}>Historial contractual</h2>
                <span style={styles.historyCount}>{history.length} registro(s)</span>
              </div>

              {history.length === 0 ? (
                <div style={styles.emptyState}>No hay historial registrado para este empleado.</div>
              ) : (
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Movimiento</th>
                        <th style={styles.th}>Inicio</th>
                        <th style={styles.th}>Fin</th>
                        <th style={styles.th}>Baja</th>
                        <th style={styles.th}>Observacion</th>
                        <th style={styles.th}>Usuario</th>
                        <th style={styles.th}>Fecha registro</th>
                        <th style={styles.th}>Accion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((item) => (
                        <HistoryRow
                          key={item.idHistorialLaboral}
                          item={item}
                          onDeactivate={handleDeactivateHistory}
                          deactivatingId={deactivatingId}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function HistoryRow({
  item,
  onDeactivate,
  deactivatingId,
}: {
  item: ContratoEmpleadoHistorial;
  onDeactivate: (item: ContratoEmpleadoHistorial) => Promise<void>;
  deactivatingId: number | null;
}) {
  const inactive = item.idActivo === false;
  return (
    <tr style={inactive ? styles.historyRowInactive : undefined}>
      <td style={styles.td}>{item.tipoMovimiento || "-"}</td>
      <td style={styles.td}>{formatDateLabel(item.fechaIniLaboral)}</td>
      <td style={styles.td}>{formatDateLabel(item.fechaFinLaboral)}</td>
      <td style={styles.td}>{formatDateLabel(item.fechaBaja)}</td>
      <td style={styles.td}>{item.observacion || item.motivoMovimiento || "-"}</td>
      <td style={styles.td}>{item.usuarioCre || "-"}</td>
      <td style={styles.td}>{item.fechaCreacion ? item.fechaCreacion.replace("T", " ") : "-"}</td>
      <td style={styles.td}>
        {inactive ? (
          <span style={styles.inactiveTag}>Desactivado</span>
        ) : (
          <button
            type="button"
            style={styles.dangerButton}
            onClick={() => void onDeactivate(item)}
            disabled={deactivatingId === item.idHistorialLaboral}
          >
            <Ban size={14} />
            {deactivatingId === item.idHistorialLaboral ? "Desactivando..." : "Desactivar"}
          </button>
        )}
      </td>
    </tr>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    padding: 24,
    background: "#f5f7fb",
    minHeight: "100%",
    color: "#0f172a",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 20,
  },
  breadcrumb: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#475569",
    marginBottom: 8,
  },
  title: {
    margin: 0,
    fontSize: 30,
    lineHeight: 1.1,
    color: "#17143a",
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 0,
    color: "#475569",
    maxWidth: 760,
  },
  headerIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)",
    color: "#3730a3",
    flexShrink: 0,
  },
  panel: {
    background: "#ffffff",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    padding: 20,
    boxShadow: "0 16px 40px rgba(15, 23, 42, 0.06)",
  },
  profileCard: {
    background: "#FFFFFF",
    borderRadius: 24,
    padding: 22,
    border: "1px solid #E2E8F0",
    boxShadow: "0 18px 42px rgba(15, 23, 42, 0.08)",
    marginBottom: 18,
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
    lineHeight: 1.5,
  },
  profileContact: {
    margin: 0,
    fontSize: 14,
    color: "#334155",
    fontWeight: 700,
    lineHeight: 1.4,
  },
  searchRow: {
    display: "grid",
    gridTemplateColumns: "minmax(240px, 1fr) minmax(280px, 1fr) auto",
    gap: 14,
    alignItems: "end",
    marginBottom: 18,
  },
  fieldBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
  },
  label: {
    fontSize: 13,
    fontWeight: 700,
    color: "#334155",
  },
  inputWithIcon: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "0 12px",
    background: "#fff",
    color: "#64748b",
    height: 44,
  },
  input: {
    border: "none",
    outline: "none",
    width: "100%",
    fontSize: 14,
    color: "#0f172a",
    background: "transparent",
  },
  select: {
    height: 44,
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    padding: "0 12px",
    fontSize: 14,
    color: "#0f172a",
    background: "#fff",
  },
  refreshButton: {
    height: 44,
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "0 14px",
    cursor: "pointer",
    fontWeight: 700,
  },
  errorBox: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#b91c1c",
    borderRadius: 10,
    padding: "12px 14px",
    marginBottom: 16,
  },
  successBox: {
    background: "#f0fdf4",
    border: "1px solid #86efac",
    color: "#166534",
    borderRadius: 10,
    padding: "12px 14px",
    marginBottom: 16,
  },
  emptyState: {
    borderRadius: 12,
    border: "1px dashed #cbd5e1",
    padding: 28,
    textAlign: "center",
    color: "#64748b",
    background: "#f8fafc",
  },
  topSectionGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.6fr) minmax(320px, 0.9fr)",
    gap: 18,
    alignItems: "start",
    marginBottom: 18,
  },
  historyRowInactive: {
    background: "#fef2f2",
  },
  formCard: {
    borderRadius: 12,
    border: "1px solid #dbeafe",
    background: "#f8fbff",
    padding: 18,
  },
  formStack: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 14,
  },
  datePairRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 14,
  },
  inputReadOnly: {
    height: 44,
    borderRadius: 10,
    border: "1px solid #d1d5db",
    padding: "0 12px",
    background: "#f8fafc",
    color: "#475569",
  },
  inputDate: {
    height: 44,
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    padding: "0 12px",
    background: "#fff",
    color: "#0f172a",
  },
  textarea: {
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    padding: 12,
    resize: "vertical",
    fontFamily: "inherit",
    fontSize: 14,
    color: "#0f172a",
  },
  formActions: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: 16,
  },
  primaryButton: {
    height: 44,
    borderRadius: 10,
    border: "none",
    background: "#2563eb",
    color: "#fff",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "0 18px",
    cursor: "pointer",
    fontWeight: 700,
  },
  historyPanel: {
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    background: "#fff",
    overflow: "hidden",
  },
  historyHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "16px 18px",
    borderBottom: "1px solid #e2e8f0",
    background: "#f8fafc",
  },
  historyTitle: {
    margin: 0,
    fontSize: 18,
    color: "#17143a",
  },
  historyCount: {
    fontSize: 13,
    fontWeight: 700,
    color: "#475569",
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 880,
  },
  th: {
    textAlign: "left",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#475569",
    padding: "12px 14px",
    borderBottom: "1px solid #e2e8f0",
    background: "#f8fafc",
  },
  td: {
    padding: "12px 14px",
    borderBottom: "1px solid #eef2f7",
    fontSize: 14,
    color: "#0f172a",
    verticalAlign: "top",
  },
  dangerButton: {
    minHeight: 34,
    borderRadius: 10,
    border: "1px solid #fecaca",
    background: "#fff1f2",
    color: "#be123c",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "0 12px",
    cursor: "pointer",
    fontWeight: 700,
  },
  inactiveTag: {
    display: "inline-flex",
    padding: "4px 10px",
    borderRadius: 999,
    background: "#fee2e2",
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase" as const,
    letterSpacing: 0.3,
  },
};
