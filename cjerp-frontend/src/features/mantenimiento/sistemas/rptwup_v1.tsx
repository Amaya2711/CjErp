import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppStatusMessage from "../../../components/base/AppStatusMessage";
import ConfirmDialog from "../../../components/base/ConfirmDialog";
import DataGridPro from "../../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../../components/datagrid/types";
import { reportesWhatsappService } from "../../../api/reportesWhatsappService";
import type {
  ReporteMetaDestinatario,
  ReporteWhatsappConfiguracion,
  ReporteWhatsappDashboard,
  ReporteWhatsappLog,
} from "../../../models/reportesWhatsapp";
import { getHttpErrorMessage } from "../../../utils/httpError";

const TIPO = "meta";
const POLLING_RUNNING_MS = 2000;
const POLLING_IDLE_MS = 10000;

const DIAS_SEMANA = [
  { value: "MONDAY", label: "Lun" },
  { value: "TUESDAY", label: "Mar" },
  { value: "WEDNESDAY", label: "Mié" },
  { value: "THURSDAY", label: "Jue" },
  { value: "FRIDAY", label: "Vie" },
  { value: "SATURDAY", label: "Sáb" },
  { value: "SUNDAY", label: "Dom" },
] as const;

const configInicial: ReporteWhatsappConfiguracion = {
  horaEjecucion: "07:00",
  diasEjecucion: [],
  cantidadEmpleadosPorBloque: 10,
  delaySegundosEntreBloques: 30,
  activo: false,
  usarSemanaEnCurso: false,
  usarMesEnCurso: false,
};

const destinatarioColumns: GridColumn<ReporteMetaDestinatario>[] = [
  { dataField: "nombreEmpleado", caption: "Empleado", minWidth: 220 },
  { dataField: "usuario", caption: "Usuario", width: 150 },
  { dataField: "telefono", caption: "Teléfono", width: 140 },
  {
    dataField: "telefonoValido",
    caption: "Teléfono válido",
    width: 130,
    calculateCellValue: (row) => (row.telefonoValido ? "Sí" : "No"),
    cellRender: (value) => (
      <span style={{ color: value === "Sí" ? "#047857" : "#B91C1C", fontWeight: 600 }}>{String(value)}</span>
    ),
  },
  { dataField: "ubicacion", caption: "Ubicación", width: 160 },
  { dataField: "correo", caption: "Correo", minWidth: 200 },
  {
    dataField: "habilitado",
    caption: "Envío",
    width: 110,
    calculateCellValue: (row) => (row.habilitado ? "Habilitado" : "Excluido"),
  },
];

// Registros que no llegaron a generar un PDF (omitidos, duplicados, error generando el reporte).
const sinPdf = (estado: string) => /^(OMITIDO|DUPLICADO|ERROR_GENERANDO)/i.test(estado);

const logColumns: GridColumn<ReporteWhatsappLog>[] = [
  { dataField: "idLog", caption: "#", width: 70, dataType: "number", format: (value) => String(value ?? "") },
  {
    dataField: "pdf",
    caption: "PDF",
    width: 70,
    alignment: "center",
    allowSorting: false,
    allowFiltering: false,
    allowGrouping: false,
    allowHeaderFilter: false,
    allowSearch: false,
    calculateCellValue: () => "",
    cellRender: (_value, row) => <PdfLogButton row={row} />,
  },
  { dataField: "idEmpleado", caption: "Id empleado", dataType: "number", width: 100, format: (value) => String(value ?? "") },
  { dataField: "nombreEmpleado", caption: "Empleado", minWidth: 200 },
  { dataField: "telefono", caption: "Teléfono", width: 130 },
  { dataField: "estadoEnvio", caption: "Estado", width: 190 },
  { dataField: "origenEjecucion", caption: "Origen", width: 110 },
  { dataField: "usuarioEjecucion", caption: "Ejecutó", width: 110 },
  { dataField: "fechaEnvio", caption: "Enviado", width: 170, dataType: "datetime" },
  { dataField: "mensajeError", caption: "Detalle", minWidth: 260 },
];

// El PDF se pide como blob: si el servidor responde error, el mensaje llega como blob JSON.
async function getBlobHttpErrorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: unknown } } | null)?.response?.data;
  if (data instanceof Blob) {
    try {
      const text = (await data.text()).trim();
      if (text) {
        try {
          const parsed = JSON.parse(text) as { message?: unknown };
          if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message;
        } catch {
          return text;
        }
      }
    } catch {
      // Se usa el mensaje genérico.
    }
  }
  return getHttpErrorMessage(error, fallback);
}

function descripcionDias(dias?: string[]) {
  const marcados = DIAS_SEMANA.filter((d) => (dias ?? []).includes(d.value));
  if (marcados.length === 0 || marcados.length === DIAS_SEMANA.length) return "todos los días";
  return `los ${marcados.map((d) => d.label).join(", ")}`;
}

function formatHora(value: string) {
  const [h, m] = value.split(":");
  const hour = Number(h);
  if (Number.isNaN(hour)) return value;
  return `${hour % 12 || 12}:${m ?? "00"} ${hour < 12 ? "a. m." : "p. m."}`;
}

function PdfLogButton({ row }: { row: ReporteWhatsappLog }) {
  const [abriendo, setAbriendo] = useState(false);
  const habilitado = !sinPdf(row.estadoEnvio);

  const abrir = async () => {
    // La pestaña se abre antes de la espera para que el navegador no la bloquee como ventana emergente.
    const ventana = window.open("", "_blank");
    setAbriendo(true);
    try {
      const blob = await reportesWhatsappService.pdfEnviadoMeta(row.idLog);
      if (!(blob instanceof Blob) || blob.size === 0) throw new Error("El PDF no contiene datos.");
      const url = URL.createObjectURL(blob);
      if (ventana) ventana.location.href = url;
      else window.open(url, "_blank");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      ventana?.close();
      window.alert(await getBlobHttpErrorMessage(err, "No se pudo abrir el PDF de este registro."));
    } finally {
      setAbriendo(false);
    }
  };

  return (
    <button
      type="button"
      title={habilitado ? "Ver el PDF enviado" : "Este registro no generó PDF"}
      aria-label={habilitado ? "Ver el PDF enviado" : "Este registro no generó PDF"}
      disabled={!habilitado || abriendo}
      onClick={(e) => {
        e.stopPropagation();
        void abrir();
      }}
      style={{
        width: 30,
        height: 28,
        borderRadius: 8,
        border: `1px solid ${habilitado ? "#BFDBFE" : "#E5E7EB"}`,
        background: habilitado ? "#EFF6FF" : "#F3F4F6",
        color: habilitado ? "#1D4ED8" : "#9CA3AF",
        cursor: habilitado ? "pointer" : "not-allowed",
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {abriendo ? "…" : "PDF"}
    </button>
  );
}

export default function RptWupV1Page() {
  const [dashboard, setDashboard] = useState<ReporteWhatsappDashboard | null>(null);
  const [config, setConfig] = useState<ReporteWhatsappConfiguracion>(configInicial);
  const [configDirty, setConfigDirty] = useState(false);
  const [destinatarios, setDestinatarios] = useState<ReporteMetaDestinatario[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [savedKeys, setSavedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "config" | "seleccion" | "envio">("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [tab, setTab] = useState<"empleados" | "envios">("empleados");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const configDirtyRef = useRef(false);
  const inFlightRef = useRef(false);
  // El error del dashboard (p. ej. timeout al abrir) se limpia solo cuando una consulta posterior sí responde.
  const dashboardErrorRef = useRef(false);

  configDirtyRef.current = configDirty;

  const runtime = dashboard?.runtime;
  const isRunning = !!runtime?.isRunning;

  const loadDashboard = useCallback(async (silent: boolean) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const response = await reportesWhatsappService.obtenerDashboard(50, TIPO, undefined, { timeout: 90000 });
      setDashboard(response);
      if (!configDirtyRef.current) {
        setConfig({
          ...response.configuracion,
          horaEjecucion: response.configuracion.horaEjecucion || "07:00",
          activo: !!response.configuracion.activo,
          cantidadEmpleadosPorBloque: response.configuracion.cantidadEmpleadosPorBloque || 10,
          delaySegundosEntreBloques: response.configuracion.delaySegundosEntreBloques || 30,
        });
      }
      if (!silent || dashboardErrorRef.current) {
        dashboardErrorRef.current = false;
        setError("");
      }
    } catch (err) {
      if (!silent) {
        dashboardErrorRef.current = true;
        setError(getHttpErrorMessage(err, "No se pudo cargar el estado del reporte."));
      }
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const loadDestinatarios = useCallback(async () => {
    const rows = await reportesWhatsappService.obtenerDestinatariosMeta();
    setDestinatarios(rows);
    const keys = rows.filter((r) => r.habilitado).map((r) => String(r.idEmpleado));
    setSelectedKeys(keys);
    setSavedKeys(keys);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Los empleados activos (resultado del store) cargan al abrir la página, sin depender del dashboard.
      void loadDashboard(false);
      try {
        await loadDestinatarios();
      } catch (err) {
        if (!cancelled) setError(getHttpErrorMessage(err, "No se pudo cargar el listado de empleados."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadDashboard, loadDestinatarios]);

  useEffect(() => {
    const id = window.setInterval(() => void loadDashboard(true), isRunning ? POLLING_RUNNING_MS : POLLING_IDLE_MS);
    return () => window.clearInterval(id);
  }, [isRunning, loadDashboard]);

  const selectionDirty = useMemo(() => {
    if (selectedKeys.length !== savedKeys.length) return true;
    const saved = new Set(savedKeys);
    return selectedKeys.some((k) => !saved.has(k));
  }, [selectedKeys, savedKeys]);

  const seleccionados = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const seleccionadosConTelefono = useMemo(
    () => destinatarios.filter((d) => seleccionados.has(String(d.idEmpleado)) && d.telefonoValido).length,
    [destinatarios, seleccionados]
  );

  const gridRows = useMemo(
    () => destinatarios.map((d) => ({ ...d, habilitado: seleccionados.has(String(d.idEmpleado)) })),
    [destinatarios, seleccionados]
  );

  const guardarConfig = async () => {
    if (!/^\d{2}:\d{2}$/.test(config.horaEjecucion)) {
      setError("La hora del job debe tener formato HH:mm.");
      return;
    }
    setBusy("config");
    setError("");
    setSuccess("");
    try {
      await reportesWhatsappService.actualizarConfiguracion(
        // Meta envía de corrido: sin bloques ni espera entre ellos.
        { ...config, cantidadEmpleadosPorBloque: 100, delaySegundosEntreBloques: 0 },
        TIPO
      );
      setConfigDirty(false);
      configDirtyRef.current = false;
      setSuccess(
        config.activo
          ? `Job habilitado: se ejecutará ${descripcionDias(config.diasEjecucion)} a las ${formatHora(config.horaEjecucion)} (hora Lima).`
          : "Job deshabilitado: no se enviarán mensajes automáticos."
      );
      await loadDashboard(true);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo guardar la configuración del job."));
    } finally {
      setBusy("");
    }
  };

  const guardarSeleccion = async (): Promise<boolean> => {
    setBusy("seleccion");
    setError("");
    try {
      const idsExcluidos = destinatarios
        .filter((d) => !seleccionados.has(String(d.idEmpleado)))
        .map((d) => d.idEmpleado);
      await reportesWhatsappService.guardarDestinatariosMeta(idsExcluidos);
      setSavedKeys(selectedKeys);
      setSuccess("Selección de empleados guardada. El job solo enviará a los marcados.");
      return true;
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo guardar la selección de empleados."));
      return false;
    } finally {
      setBusy("");
    }
  };

  // PDF que se enviaría por Meta (primer empleado con asistencia en el período), sin enviar ni registrar nada.
  const verPdfEjemplo = async () => {
    // La pestaña se abre antes de la espera para que el navegador no la bloquee como ventana emergente.
    const ventana = window.open("", "_blank");
    setGenerandoPdf(true);
    setError("");
    try {
      const blob = await reportesWhatsappService.vistaPreviaPdf(TIPO);
      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error("El PDF no contiene datos.");
      }
      const url = URL.createObjectURL(blob);
      if (ventana) {
        ventana.location.href = url;
      } else {
        window.open(url, "_blank");
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      ventana?.close();
      setError(await getBlobHttpErrorMessage(err, "No se pudo generar la vista previa del PDF."));
    } finally {
      setGenerandoPdf(false);
    }
  };

  const enviarAhora = async () => {
    setConfirmOpen(false);
    setSuccess("");
    if (selectionDirty && !(await guardarSeleccion())) return;

    setBusy("envio");
    setError("");
    try {
      const ids = destinatarios.filter((d) => seleccionados.has(String(d.idEmpleado))).map((d) => d.idEmpleado);
      const result = await reportesWhatsappService.ejecutarAhora(TIPO, undefined, { idsEmpleadoSeleccionados: ids });
      if (result.accepted) {
        setSuccess("Envío iniciado: el servidor lo procesa de inmediato. El avance se muestra en 'Ejecución actual'.");
        setTab("envios");
        [1500, 4000].forEach((ms) => window.setTimeout(() => void loadDashboard(true), ms));
      } else {
        setError(result.message || "Ya existe una ejecución en curso.");
      }
      await loadDashboard(true);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo iniciar el envío."));
    } finally {
      setBusy("");
    }
  };

  const puedeAdministrar = dashboard?.puedeAdministrar !== false;
  const progress =
    runtime && runtime.totalEmpleados > 0
      ? Math.min(100, Math.round((runtime.empleadosProcesados * 100) / runtime.totalEmpleados))
      : 0;

  return (
    <AppPage title="Reporte de asistencia por WhatsApp (Meta)">
      {error ? <AppStatusMessage tone="error">{error}</AppStatusMessage> : null}
      {success ? <AppStatusMessage tone="success">{success}</AppStatusMessage> : null}

      <AppCard title="Job automático">
        <div style={styles.configRow}>
          <label style={styles.field}>
            <span style={styles.label}>Hora de ejecución (Lima)</span>
            <input
              type="time"
              style={styles.input}
              value={config.horaEjecucion}
              disabled={!puedeAdministrar || busy !== ""}
              onChange={(e) => {
                setConfig({ ...config, horaEjecucion: e.target.value });
                setConfigDirty(true);
              }}
            />
          </label>
          <label style={{ ...styles.field, justifyContent: "flex-end" }}>
            <span style={styles.checkRow}>
              <input
                type="checkbox"
                checked={config.activo}
                disabled={!puedeAdministrar || busy !== ""}
                onChange={(e) => {
                  setConfig({ ...config, activo: e.target.checked });
                  setConfigDirty(true);
                }}
              />
              <span style={{ fontWeight: 600 }}>Envío del job habilitado</span>
            </span>
          </label>
          <div style={styles.field}>
            <span style={styles.label}>Días de ejecución (sin marcar = todos los días)</span>
            <div style={{ display: "flex", gap: 10, height: 34, alignItems: "center", flexWrap: "wrap" }}>
              {DIAS_SEMANA.map((dia) => {
                const marcado = (config.diasEjecucion ?? []).includes(dia.value);
                return (
                  <label key={dia.value} style={styles.checkRow}>
                    <input
                      type="checkbox"
                      checked={marcado}
                      disabled={!puedeAdministrar || busy !== ""}
                      onChange={(e) => {
                        const actuales = config.diasEjecucion ?? [];
                        setConfig({
                          ...config,
                          diasEjecucion: e.target.checked
                            ? [...actuales, dia.value]
                            : actuales.filter((d) => d !== dia.value),
                        });
                        setConfigDirty(true);
                      }}
                    />
                    <span>{dia.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            style={{ ...styles.primaryButton, opacity: configDirty ? 1 : 0.6 }}
            disabled={!puedeAdministrar || busy !== "" || !configDirty}
            onClick={() => void guardarConfig()}
          >
            {busy === "config" ? "Guardando..." : "Guardar job"}
          </button>
        </div>
        <p style={styles.hint}>
          {dashboard
            ? config.activo && !configDirty
              ? `El job está habilitado y envía ${descripcionDias(config.diasEjecucion)} a las ${formatHora(config.horaEjecucion)} solo a los empleados marcados.`
              : "El job está deshabilitado o tiene cambios sin guardar."
            : "Cargando..."}
          {" "}Período del reporte: {dashboard?.periodoActual.etiquetaPeriodo ?? "-"}.
        </p>
      </AppCard>

      {dashboard ? (
        <div style={styles.kpiRow}>
          <span>Período {dashboard.periodoActual.etiquetaPeriodo}:</span>
          <strong>Procesados {dashboard.kpis.totalProcesados}</strong>
          <span style={{ color: "#047857" }}>Enviados {dashboard.kpis.totalEnviados}</span>
          <span style={{ color: dashboard.kpis.totalErrores > 0 ? "#B91C1C" : undefined, fontWeight: dashboard.kpis.totalErrores > 0 ? 700 : 400 }}>
            Errores {dashboard.kpis.totalErrores}
          </span>
          <span>Omitidos {dashboard.kpis.totalOmitidos + dashboard.kpis.totalDuplicados}</span>
        </div>
      ) : null}

      {runtime && runtime.executionId ? (
        <AppCard title="Ejecución actual">
          <div style={styles.runtimeRow}>
            <strong>{isRunning ? "En curso" : "Última ejecución"}</strong>
            <span>{runtime.mensaje}</span>
            <span>
              Procesados {runtime.empleadosProcesados}/{runtime.totalEmpleados} · Enviados {runtime.enviados} · Errores{" "}
              {runtime.errores} · Omitidos {runtime.omitidos + runtime.duplicados}
            </span>
          </div>
          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressBar, width: `${progress}%` }} />
          </div>
        </AppCard>
      ) : null}

      <div style={styles.tabs}>
        <button type="button" style={tab === "empleados" ? styles.tabActive : styles.tab} onClick={() => setTab("empleados")}>
          Empleados ({destinatarios.length})
        </button>
        <button type="button" style={tab === "envios" ? styles.tabActive : styles.tab} onClick={() => setTab("envios")}>
          Envíos del período ({dashboard?.logs.length ?? 0})
        </button>
      </div>

      {tab === "empleados" ? (
      <AppCard
        title={`Empleados activos — marcados: ${selectedKeys.length} de ${destinatarios.length}`}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={styles.secondaryButton} disabled={generandoPdf} onClick={() => void verPdfEjemplo()}>
              {generandoPdf ? "Generando..." : "Ver PDF de ejemplo"}
            </button>
            <button
              type="button"
              style={styles.secondaryButton}
              disabled={!puedeAdministrar || busy !== "" || !selectionDirty}
              onClick={() => void guardarSeleccion()}
            >
              {busy === "seleccion" ? "Guardando..." : "Guardar selección"}
            </button>
            <button
              type="button"
              style={{ ...styles.primaryButton, opacity: seleccionadosConTelefono > 0 && !isRunning ? 1 : 0.6 }}
              disabled={!puedeAdministrar || busy !== "" || isRunning || seleccionadosConTelefono === 0}
              onClick={() => setConfirmOpen(true)}
            >
              {busy === "envio" ? "Enviando..." : `Enviar ahora a marcados (${seleccionadosConTelefono})`}
            </button>
          </div>
        }
      >
        <DataGridPro<ReporteMetaDestinatario>
          dataSource={gridRows}
          columns={destinatarioColumns}
          keyExpr={(row) => String(row.idEmpleado)}
          height="55vh"
          loading={loading}
          noDataText="El store sp_EmpleadoCj_Listar_Wup no devolvió empleados."
          selection="multiple"
          selectedKeys={selectedKeys}
          onSelectionChanged={(keys) => setSelectedKeys(keys)}
          selectionDisabled={!puedeAdministrar || busy !== ""}
          stateStoringKey="rptwup_v1_destinatarios"
          showSearchPanel
          exportFileName="rptwup_v1_empleados"
          paging={{ pageSize: 50, pageSizes: [25, 50, 100, 250] }}
          rowPadding="4px 8px"
        />
        <p style={styles.hint}>
          Marcado = recibe el reporte (job y envío manual). Por defecto todos están marcados. Los empleados sin teléfono
          válido se omiten al enviar.
        </p>
      </AppCard>

      ) : (
      <AppCard title="Envíos del período">
        <DataGridPro<ReporteWhatsappLog>
          dataSource={dashboard?.logs ?? []}
          columns={logColumns}
          keyExpr={(row) => String(row.idLog)}
          height="40vh"
          noDataText="Aún no hay envíos en el período."
          stateStoringKey="rptwup_v1_logs"
          showSearchPanel={false}
          paging={{ pageSize: 25, pageSizes: [25, 50, 100] }}
          rowPadding="4px 8px"
        />
      </AppCard>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Enviar reportes por WhatsApp"
        message={`Se enviará el PDF de asistencia por WhatsApp (API oficial de Meta) a ${seleccionadosConTelefono} empleado(s) marcado(s). ¿Continuar?`}
        confirmLabel="Enviar"
        onConfirm={() => void enviarAhora()}
        onCancel={() => setConfirmOpen(false)}
      />
    </AppPage>
  );
}

const styles: Record<string, CSSProperties> = {
  tabs: { display: "flex", gap: 4, marginBottom: 12, borderBottom: "1px solid #E5E7EB" },
  tab: { padding: "8px 18px", border: "none", background: "transparent", color: "#475569", fontWeight: 600, cursor: "pointer", borderBottom: "2px solid transparent" },
  tabActive: { padding: "8px 18px", border: "none", background: "transparent", color: "#047857", fontWeight: 700, cursor: "pointer", borderBottom: "2px solid #047857" },
  configRow: { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end", padding: "12px 20px" },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 12, color: "#475569" },
  input: { height: 34, padding: "0 8px", border: "1px solid #CBD5E1", borderRadius: 6, fontSize: 14 },
  checkRow: { display: "flex", alignItems: "center", gap: 8, height: 34 },
  hint: { margin: 0, padding: "4px 20px 12px", fontSize: 12, color: "#64748B" },
  primaryButton: {
    height: 34,
    padding: "0 16px",
    border: "none",
    borderRadius: 6,
    background: "#047857",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
  },
  secondaryButton: {
    height: 34,
    padding: "0 16px",
    border: "1px solid #CBD5E1",
    borderRadius: 6,
    background: "#fff",
    color: "#0F172A",
    fontWeight: 600,
    cursor: "pointer",
  },
  kpiRow: { display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", fontSize: 13, margin: "0 0 12px", padding: "8px 14px", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8 },
  runtimeRow: { display: "flex", gap: 16, flexWrap: "wrap", padding: "12px 20px 4px", fontSize: 13 },
  progressTrack: { margin: "4px 20px 14px", height: 8, borderRadius: 4, background: "#E5E7EB", overflow: "hidden" },
  progressBar: { height: "100%", background: "#047857", transition: "width 0.4s" },
};
