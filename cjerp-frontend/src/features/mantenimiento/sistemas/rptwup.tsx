import {
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from "react";
import type React from "react";
import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppStatusMessage from "../../../components/base/AppStatusMessage";
import DataGridBase, {
  type DataGridColumn,
} from "../../../components/base/DataGridBase";
import { reportesWhatsappService } from "../../../api/reportesWhatsappService";
import type {
  ReporteWhatsappConfiguracion,
  ReporteWhatsappDashboard,
  ReporteWhatsappLog,
} from "../../../models/reportesWhatsapp";
import { getHttpErrorMessage } from "../../../utils/httpError";

const POLLING_RUNNING_MS = 5000;
const POLLING_IDLE_MS = 20000;

const formInicial: ReporteWhatsappConfiguracion = {
  horaEjecucion: "07:00",
  cantidadEmpleadosPorBloque: 10,
  delaySegundosEntreBloques: 30,
  activo: false,
};

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("es-PE");
}

function formatSeconds(value?: number | null) {
  if (!value || value <= 0) {
    return "0s";
  }

  if (value < 60) {
    return `${value}s`;
  }

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}m ${seconds}s`;
}

function getEstadoTone(estado: string) {
  const normalized = estado.toUpperCase();

  if (normalized === "ENVIADO") return styles.statusSuccess;
  if (normalized.startsWith("ERROR")) return styles.statusError;
  if (normalized.startsWith("OMITIDO")) return styles.statusWarning;
  if (normalized === "DUPLICADO_OMITIDO") return styles.statusInfo;
  return styles.statusNeutral;
}

export default function RptWupPage() {
  const [dashboard, setDashboard] = useState<ReporteWhatsappDashboard | null>(null);
  const [form, setForm] = useState<ReporteWhatsappConfiguracion>(formInicial);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningAction, setRunningAction] = useState<"" | "save" | "run" | "retry" | "reschedule">("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const progress = useMemo(() => {
    const total = dashboard?.runtime.totalEmpleados ?? 0;
    const processed = dashboard?.runtime.empleadosProcesados ?? 0;
    return total <= 0 ? 0 : Math.min(100, Math.round((processed * 100) / total));
  }, [dashboard]);

  const loadDashboard = useEffectEvent(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      const response = await reportesWhatsappService.obtenerDashboard(200);
      startTransition(() => {
        setDashboard(response);
        setForm((current) => {
          if (saving || runningAction === "save") {
            return current;
          }

          return {
            horaEjecucion: response.configuracion.horaEjecucion || "07:00",
            cantidadEmpleadosPorBloque: response.configuracion.cantidadEmpleadosPorBloque || 10,
            delaySegundosEntreBloques: response.configuracion.delaySegundosEntreBloques || 30,
            activo: !!response.configuracion.activo,
            usuarioModificacion: response.configuracion.usuarioModificacion,
            fechaModificacion: response.configuracion.fechaModificacion,
            usaRespaldoAppSettings: response.configuracion.usaRespaldoAppSettings,
          };
        });
      });
      setError("");
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo cargar el dashboard de reportes WUP."));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  });

  useEffect(() => {
    void loadDashboard(false);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadDashboard(true);
    }, dashboard?.runtime.isRunning ? POLLING_RUNNING_MS : POLLING_IDLE_MS);

    return () => window.clearInterval(interval);
  }, [dashboard?.runtime.isRunning, loadDashboard]);

  const columns = useMemo<DataGridColumn<ReporteWhatsappLog>[]>(
    () => [
      {
        key: "estadoEnvio",
        header: "Estado",
        render: (row) => (
          <span style={{ ...styles.statusBadge, ...getEstadoTone(row.estadoEnvio) }}>
            {row.estadoEnvio}
          </span>
        ),
      },
      {
        key: "empleado",
        header: "Empleado",
        render: (row) => (
          <div style={styles.logEmployeeCell}>
            <strong>{row.nombreEmpleado || row.usuario}</strong>
            <span>ID {row.idEmpleado}</span>
          </div>
        ),
      },
      { key: "telefono", header: "Teléfono", render: (row) => row.telefono || "-" },
      { key: "bloque", header: "Bloque", align: "center", render: (row) => row.numeroBloque ?? "-" },
      {
        key: "duracion",
        header: "Duración",
        align: "right",
        render: (row) => (row.duracionEnvioSegundos != null ? `${row.duracionEnvioSegundos.toFixed(2)}s` : "-"),
      },
      {
        key: "origen",
        header: "Origen",
        render: (row) => `${row.origenEjecucion} / ${row.usuarioEjecucion || "-"}`,
      },
      {
        key: "fechaEnvio",
        header: "Fecha envío",
        render: (row) => formatDateTime(row.fechaEnvio || row.fechaProceso),
      },
      {
        key: "mensajeError",
        header: "Detalle",
        render: (row) => row.mensajeError || "Sin observaciones.",
      },
    ],
    []
  );

  const validar = () => {
    const nextErrors: Record<string, string> = {};

    if (!form.horaEjecucion.trim()) {
      nextErrors.horaEjecucion = "La hora es obligatoria.";
    }

    if (!/^\d{2}:\d{2}$/.test(form.horaEjecucion.trim())) {
      nextErrors.horaEjecucion = "Use formato HH:mm.";
    }

    if (form.cantidadEmpleadosPorBloque < 1) {
      nextErrors.cantidadEmpleadosPorBloque = "Debe ser mayor o igual a 1.";
    }

    if (form.cantidadEmpleadosPorBloque > 50) {
      nextErrors.cantidadEmpleadosPorBloque = "El máximo recomendado es 50.";
    }

    if (form.delaySegundosEntreBloques < 10) {
      nextErrors.delaySegundosEntreBloques = "Debe ser mayor o igual a 10.";
    }

    if (form.delaySegundosEntreBloques > 600) {
      nextErrors.delaySegundosEntreBloques = "El máximo recomendado es 600.";
    }

    setErrores(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const guardarConfiguracion = async () => {
    if (!validar()) {
      return;
    }

    setRunningAction("save");
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await reportesWhatsappService.actualizarConfiguracion(form);
      setSuccess("Configuración guardada y job reprogramado correctamente.");
      await loadDashboard(true);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo guardar la configuración."));
    } finally {
      setSaving(false);
      setRunningAction("");
    }
  };

  const ejecutarAccion = async (action: "run" | "retry" | "reschedule") => {
    setRunningAction(action);
    setError("");
    setSuccess("");

    try {
      if (action === "run") {
        const response = await reportesWhatsappService.ejecutarAhora();
        setSuccess(response.message || "Proceso manual encolado.");
      }

      if (action === "retry") {
        const response = await reportesWhatsappService.reintentarFallidos();
        setSuccess(response.message || "Reintento encolado.");
      }

      if (action === "reschedule") {
        await reportesWhatsappService.reprogramarJob();
        setSuccess("Job reprogramado correctamente.");
      }

      await loadDashboard(true);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo ejecutar la acción solicitada."));
    } finally {
      setRunningAction("");
    }
  };

  return (
    <AppPage title="Reportes automáticos WUP" style={styles.page}>
      {loading ? <AppStatusMessage tone="info">Cargando configuración y monitoreo...</AppStatusMessage> : null}
      {success ? <AppStatusMessage tone="success">{success}</AppStatusMessage> : null}
      {error ? <AppStatusMessage tone="error">{error}</AppStatusMessage> : null}

      {!dashboard?.puedeAdministrar ? (
        <AppCard>
          <div style={styles.lockedBox}>
            Esta página requiere el acceso administrativo del módulo de reportes WhatsApp.
          </div>
        </AppCard>
      ) : (
        <>
          <div style={styles.topGrid}>
            <AppCard style={styles.heroCard}>
              <div style={styles.heroHeader}>
                <div>
                  <div style={styles.eyebrow}>Automatización WUP</div>
                  <h2 style={styles.heroTitle}>Control operativo del envío de reportes</h2>
                  <p style={styles.heroText}>
                    Período actual: <strong>{dashboard?.periodoActual.etiquetaPeriodo || "-"}</strong>
                  </p>
                </div>

                <div style={styles.heroActions}>
                  <button
                    type="button"
                    style={styles.primaryButton}
                    onClick={() => void ejecutarAccion("run")}
                    disabled={runningAction !== "" || dashboard?.runtime.isRunning}
                  >
                    Ejecutar ahora
                  </button>
                  <button
                    type="button"
                    style={styles.secondaryButton}
                    onClick={() => void ejecutarAccion("retry")}
                    disabled={runningAction !== "" || dashboard?.runtime.isRunning}
                  >
                    Reintentar fallidos
                  </button>
                  <button
                    type="button"
                    style={styles.secondaryButton}
                    onClick={() => void ejecutarAccion("reschedule")}
                    disabled={runningAction !== ""}
                  >
                    Reprogramar job
                  </button>
                </div>
              </div>

              <div style={styles.progressPanel}>
                <div style={styles.progressHeader}>
                  <div>
                    <div style={styles.progressTitle}>Ejecución actual</div>
                    <div style={styles.progressMeta}>
                      {dashboard?.runtime.isRunning ? dashboard.runtime.mensaje : "Sin ejecución activa."}
                    </div>
                  </div>
                  <strong style={styles.progressValue}>{progress}%</strong>
                </div>

                <div style={styles.progressBarTrack}>
                  <div style={{ ...styles.progressBarFill, width: `${progress}%` }} />
                </div>

                <div style={styles.progressStats}>
                  <span>Procesados: {dashboard?.runtime.empleadosProcesados ?? 0} / {dashboard?.runtime.totalEmpleados ?? 0}</span>
                  <span>Bloque: {dashboard?.runtime.bloqueActual ?? 0} / {dashboard?.runtime.totalBloques ?? 0}</span>
                  <span>Restante: {formatSeconds(dashboard?.runtime.segundosRestantesEstimados)}</span>
                </div>

                <div style={styles.progressStats}>
                  <span>Empleado actual: {dashboard?.runtime.empleadoActualNombre || "-"}</span>
                  <span>Espera bloque: {formatSeconds(dashboard?.runtime.segundosEsperaBloqueActual)}</span>
                  <span>Inicio: {formatDateTime(dashboard?.runtime.fechaInicio)}</span>
                </div>
              </div>
            </AppCard>

            <AppCard style={styles.configCard}>
              <h3 style={styles.cardTitle}>Configuración dinámica</h3>
              <div style={styles.formGrid}>
                <div style={styles.field}>
                  <label style={styles.label}>Hora de ejecución</label>
                  <input
                    type="time"
                    value={form.horaEjecucion}
                    onChange={(event) => setForm((prev) => ({ ...prev, horaEjecucion: event.target.value }))}
                    style={styles.input}
                  />
                  {errores.horaEjecucion ? <span style={styles.errorText}>{errores.horaEjecucion}</span> : null}
                </div>

                <div style={styles.field}>
                  <label style={styles.label}>Empleados por bloque</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={form.cantidadEmpleadosPorBloque}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        cantidadEmpleadosPorBloque: Number(event.target.value || 0),
                      }))
                    }
                    style={styles.input}
                  />
                  {errores.cantidadEmpleadosPorBloque ? (
                    <span style={styles.errorText}>{errores.cantidadEmpleadosPorBloque}</span>
                  ) : null}
                </div>

                <div style={styles.field}>
                  <label style={styles.label}>Espera entre bloques</label>
                  <input
                    type="number"
                    min={10}
                    max={600}
                    value={form.delaySegundosEntreBloques}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        delaySegundosEntreBloques: Number(event.target.value || 0),
                      }))
                    }
                    style={styles.input}
                  />
                  {errores.delaySegundosEntreBloques ? (
                    <span style={styles.errorText}>{errores.delaySegundosEntreBloques}</span>
                  ) : null}
                </div>

                <div style={styles.switchField}>
                  <label style={styles.switchRow}>
                    <input
                      type="checkbox"
                      checked={form.activo}
                      onChange={(event) => setForm((prev) => ({ ...prev, activo: event.target.checked }))}
                    />
                    <span>Job activo</span>
                  </label>
                  <div style={styles.metaText}>
                    Última modificación: {formatDateTime(dashboard?.configuracion.fechaModificacion)}
                  </div>
                  <div style={styles.metaText}>
                    Usuario: {dashboard?.configuracion.usuarioModificacion || "-"}
                  </div>
                  {dashboard?.configuracion.usaRespaldoAppSettings ? (
                    <div style={styles.warningNote}>Usando respaldo de `appsettings.json`.</div>
                  ) : null}
                </div>
              </div>

              <div style={styles.configActions}>
                <button
                  type="button"
                  style={styles.primaryButton}
                  onClick={() => void guardarConfiguracion()}
                  disabled={saving || runningAction !== ""}
                >
                  Guardar configuración
                </button>
              </div>
            </AppCard>
          </div>

          <div style={styles.kpiGrid}>
            <KpiCard label="Total procesados" value={String(dashboard?.kpis.totalProcesados ?? 0)} tone="blue" />
            <KpiCard label="Enviados" value={String(dashboard?.kpis.totalEnviados ?? 0)} tone="green" />
            <KpiCard label="Errores" value={String(dashboard?.kpis.totalErrores ?? 0)} tone="red" />
            <KpiCard label="Omitidos" value={String(dashboard?.kpis.totalOmitidos ?? 0)} tone="amber" />
            <KpiCard label="Duplicados" value={String(dashboard?.kpis.totalDuplicados ?? 0)} tone="slate" />
            <KpiCard
              label="Pendientes retry"
              value={String(dashboard?.kpis.totalPendientesRetry ?? 0)}
              tone="blue"
            />
          </div>

          <AppCard>
            <div style={styles.tableHeader}>
              <div>
                <h3 style={styles.cardTitle}>Logs del período</h3>
                <p style={styles.tableSubtitle}>
                  Auditoría de envío, omisiones, duplicados y respuestas del endpoint WUP.
                </p>
              </div>
            </div>

            <DataGridBase
              columns={columns}
              rows={dashboard?.logs ?? []}
              getRowKey={(row) => row.idLog}
              emptyMessage="No hay logs disponibles para el período actual."
            />
          </AppCard>
        </>
      )}
    </AppPage>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "green" | "red" | "amber" | "slate";
}) {
  return (
    <AppCard style={{ ...styles.kpiCard, ...kpiToneStyles[tone] }}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={styles.kpiValue}>{value}</div>
    </AppCard>
  );
}

const kpiToneStyles: Record<"blue" | "green" | "red" | "amber" | "slate", React.CSSProperties> = {
  blue: { background: "linear-gradient(135deg, #DBEAFE 0%, #EFF6FF 100%)" },
  green: { background: "linear-gradient(135deg, #DCFCE7 0%, #F0FDF4 100%)" },
  red: { background: "linear-gradient(135deg, #FEE2E2 0%, #FEF2F2 100%)" },
  amber: { background: "linear-gradient(135deg, #FEF3C7 0%, #FFF7ED 100%)" },
  slate: { background: "linear-gradient(135deg, #E2E8F0 0%, #F8FAFC 100%)" },
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  topGrid: {
    display: "grid",
    gridTemplateColumns: "1.4fr 1fr",
    gap: 16,
    alignItems: "start",
  },
  heroCard: {
    minHeight: 320,
    background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
    border: "1px solid #E2E8F0",
  },
  configCard: {
    border: "1px solid #E2E8F0",
  },
  heroHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 800,
    color: "#0F766E",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  heroTitle: {
    margin: "4px 0 8px",
    fontSize: 24,
    color: "#0F172A",
  },
  heroText: {
    margin: 0,
    color: "#475569",
    fontSize: 14,
  },
  heroActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  primaryButton: {
    border: "none",
    background: "#17143A",
    color: "#FFFFFF",
    borderRadius: 10,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#1E293B",
    borderRadius: 10,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  progressPanel: {
    marginTop: 18,
    border: "1px solid #E2E8F0",
    borderRadius: 14,
    padding: 16,
    background: "#FFFFFF",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  progressHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  progressTitle: {
    fontSize: 15,
    fontWeight: 800,
    color: "#0F172A",
  },
  progressMeta: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  progressValue: {
    fontSize: 28,
    color: "#17143A",
  },
  progressBarTrack: {
    width: "100%",
    height: 12,
    borderRadius: 999,
    background: "#E2E8F0",
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #17143A 0%, #2563EB 100%)",
  },
  progressStats: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    fontSize: 12,
    color: "#334155",
    fontWeight: 600,
  },
  cardTitle: {
    margin: 0,
    fontSize: 18,
    color: "#0F172A",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14,
    marginTop: 16,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  switchField: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    justifyContent: "center",
    padding: 12,
    borderRadius: 12,
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
  },
  switchRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontWeight: 700,
    color: "#0F172A",
  },
  label: {
    fontSize: 13,
    fontWeight: 700,
    color: "#334155",
  },
  input: {
    height: 42,
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    padding: "0 12px",
    fontSize: 14,
    boxSizing: "border-box",
  },
  configActions: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: 18,
  },
  metaText: {
    fontSize: 12,
    color: "#64748B",
  },
  warningNote: {
    fontSize: 12,
    color: "#B45309",
    fontWeight: 700,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 12,
    fontWeight: 600,
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
    gap: 12,
  },
  kpiCard: {
    border: "1px solid rgba(255,255,255,0.8)",
    minHeight: 112,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  kpiLabel: {
    fontSize: 13,
    color: "#475569",
    fontWeight: 700,
  },
  kpiValue: {
    fontSize: 30,
    color: "#0F172A",
    fontWeight: 800,
  },
  tableHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  tableSubtitle: {
    margin: "4px 0 0",
    fontSize: 13,
    color: "#64748B",
  },
  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
  },
  statusSuccess: {
    background: "#DCFCE7",
    color: "#166534",
  },
  statusError: {
    background: "#FEE2E2",
    color: "#991B1B",
  },
  statusWarning: {
    background: "#FEF3C7",
    color: "#92400E",
  },
  statusInfo: {
    background: "#DBEAFE",
    color: "#1D4ED8",
  },
  statusNeutral: {
    background: "#E2E8F0",
    color: "#334155",
  },
  logEmployeeCell: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  lockedBox: {
    borderRadius: 14,
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#991B1B",
    padding: 18,
    fontWeight: 700,
  },
};
