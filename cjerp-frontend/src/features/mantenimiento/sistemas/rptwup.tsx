import {
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import type React from "react";
import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppStatusMessage from "../../../components/base/AppStatusMessage";
import DataGridBase, {
  type DataGridColumn,
} from "../../../components/base/DataGridBase";
import { exportarAsistenciaGerencialPdf } from "../../../api/asistenciaService";
import { descargarPdfBoleta } from "../../../api/planillaBoletaApi";
import { reportesWhatsappService } from "../../../api/reportesWhatsappService";
import type {
  ReporteWhatsappBoletaDestino,
  ReporteWhatsappConfiguracion,
  ReporteWhatsappDashboard,
  ReporteWhatsappEjecucionRequest,
  ReporteWhatsappLog,
  ReporteWhatsappTipo,
} from "../../../models/reportesWhatsapp";
import { getHttpErrorMessage } from "../../../utils/httpError";

const POLLING_RUNNING_MS = 1500;
const POLLING_IDLE_MS = 8000;
const DASHBOARD_TOP_LOGS = 50;
const DIAS_EJECUCION = [
  { value: "MONDAY", label: "Lunes" },
  { value: "TUESDAY", label: "Martes" },
  { value: "WEDNESDAY", label: "Miercoles" },
  { value: "THURSDAY", label: "Jueves" },
  { value: "FRIDAY", label: "Viernes" },
  { value: "SATURDAY", label: "Sabado" },
  { value: "SUNDAY", label: "Domingo" },
] as const;

const formInicial: ReporteWhatsappConfiguracion = {
  horaEjecucion: "07:00",
  diasEjecucion: [],
  cantidadEmpleadosPorBloque: 10,
  delaySegundosEntreBloques: 30,
  activo: false,
  usarSemanaEnCurso: false,
  usarMesEnCurso: false,
};

type RptWupModulePageProps = {
  tipo?: ReporteWhatsappTipo;
  pageTitle?: string;
  eyebrow?: string;
  heroTitle?: string;
  tableTitle?: string;
  tableSubtitle?: string;
  runtimeTitle?: string;
  enableGerencialPdfPreview?: boolean;
};

type BlobErrorResponse = {
  response?: {
    data?: unknown;
  };
};

async function getBlobHttpErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null) {
    const candidate = error as BlobErrorResponse;
    const responseData = candidate.response?.data;

    if (responseData instanceof Blob) {
      try {
        const text = (await responseData.text()).trim();
        if (text) {
          try {
            const parsed = JSON.parse(text) as Record<string, unknown>;
            const messages = [
              parsed.message,
              parsed.mensaje,
              parsed.detail,
              parsed.error,
              parsed.title,
            ];

            const firstMessage = messages.find(
              (item) => typeof item === "string" && item.trim()
            ) as string | undefined;

            if (firstMessage) {
              return firstMessage;
            }
          } catch {
            return text;
          }

          return text;
        }
      } catch {
        // Si no se puede leer el blob, usamos el fallback normal.
      }
    }
  }

  return getHttpErrorMessage(error, fallback);
}

function openBlobInNewTab(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  const normalized = value.trim();
  const noTimezoneMatch = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/
  );

  if (noTimezoneMatch) {
    const [, year, month, day, hour, minute, second = "00"] = noTimezoneMatch;
    const hourNumber = Number(hour);
    const displayHour = hourNumber % 12 || 12;
    const period = hourNumber < 12 ? "a. m." : "p. m.";
    return `${day}/${month}/${year}, ${displayHour}:${minute}:${second} ${period}`;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("es-PE", {
    timeZone: "America/Lima",
    hour12: true,
  });
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

function getCurrentMonthInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatPeriodoBoleta(value: string) {
  if (!value) {
    return "";
  }

  const [year, month] = value.split("-");
  if (!year || !month) {
    return value;
  }

  return `${month}/${year}`;
}

function getEstadoTone(estado: string) {
  const normalized = estado.toUpperCase();

  if (normalized === "ENVIADO") return styles.statusSuccess;
  if (normalized.startsWith("ERROR")) return styles.statusError;
  if (normalized.startsWith("OMITIDO")) return styles.statusWarning;
  if (normalized === "DUPLICADO_OMITIDO") return styles.statusInfo;
  return styles.statusNeutral;
}

function tryParseJsonObject(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function truncateText(value?: string | null, maxLength = 220) {
  if (!value) {
    return "";
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

function getResponsePreview(responseJson?: string) {
  const parsed = tryParseJsonObject(responseJson);
  if (parsed) {
    const candidates = [
      parsed.message,
      parsed.mensaje,
      parsed.error,
      parsed.detail,
      parsed.title,
      parsed.descripcion,
      parsed.description,
    ];

    const firstText = candidates.find((item) => typeof item === "string" && item.trim()) as string | undefined;
    if (firstText) {
      return truncateText(firstText);
    }
  }

  return truncateText(responseJson);
}

function buildCompactFileName(fileName: string, employeeId: number) {
  const normalized = fileName.trim();

  if (/^Reporte_Gerencial_Asistencia_\d{8}_\d{8}\.pdf$/i.test(normalized)) {
    return normalized;
  }

  if (/^rpt_asistencia_gerencial_/i.test(normalized) || normalized.toLowerCase().includes("gerencial")) {
    return normalized;
  }

  if (/^rpt_asistencia_/i.test(normalized)) {
    return normalized;
  }

  if (/\.pdf$/i.test(normalized)) {
    return normalized;
  }

  const match = fileName.match(/(\d{8})(?=\.pdf$)/i);
  const suffix = match?.[1] ?? "SINFECHA";
  const isGerencial = fileName.toLowerCase().includes("gerencial");
  return isGerencial
    ? `rpt_asistencia_gerencial_${employeeId}_${suffix}.pdf`
    : `rpt_asistencia_${employeeId}_${suffix}.pdf`;
}

function getRequestPreview(row: ReporteWhatsappLog) {
  const parsed = tryParseJsonObject(row.requestJson);
  if (!parsed) {
    return "";
  }

  const telefono = typeof parsed.Telefono === "string"
    ? parsed.Telefono
    : typeof parsed.telefono === "string"
      ? parsed.telefono
      : "";
  const archivo = typeof parsed.NombreArchivo === "string"
    ? parsed.NombreArchivo
    : typeof parsed.nombrearchivo === "string"
      ? parsed.nombrearchivo
      : "";
  const contenidoLength = typeof parsed.contenidoLength === "number"
    ? parsed.contenidoLength
    : typeof parsed.ContenidoLength === "number"
      ? parsed.ContenidoLength
      : null;
  const modo = typeof parsed.Modo === "string"
    ? parsed.Modo
    : typeof parsed.modo === "string"
      ? parsed.modo
      : "";

  const compactArchivo = archivo ? buildCompactFileName(archivo, row.idEmpleado) : "";

  const parts = [
    modo ? `Modo: ${modo}` : "",
    telefono ? `Tel: ${telefono}` : "",
    compactArchivo ? `Archivo: ${compactArchivo}` : "",
    contenidoLength != null ? `Base64: ${contenidoLength} chars` : "",
  ].filter(Boolean);

  return parts.join(" | ");
}

function getRequestBase64(requestJson?: string) {
  const parsed = tryParseJsonObject(requestJson);
  if (!parsed) {
    return "";
  }

  if (typeof parsed.Contenido === "string") {
    return parsed.Contenido;
  }

  if (typeof parsed.contenido === "string") {
    return parsed.contenido;
  }

  return "";
}

function getRequestFileName(row: ReporteWhatsappLog) {
  const parsed = tryParseJsonObject(row.requestJson);
  if (!parsed) {
    return `reporte_${row.idEmpleado || "wup"}.pdf`;
  }

  const rawName = typeof parsed.NombreArchivo === "string"
    ? parsed.NombreArchivo
    : typeof parsed.nombrearchivo === "string"
      ? parsed.nombrearchivo
      : "";

  if (!rawName.trim()) {
    return `reporte_${row.idEmpleado || "wup"}.pdf`;
  }

  return buildCompactFileName(rawName.trim(), row.idEmpleado);
}

function buildPostmanPayload(requestJson?: string) {
  const parsed = tryParseJsonObject(requestJson);
  if (!parsed) {
    return null;
  }

  const payload = {
    nombrearchivo: typeof parsed.NombreArchivo === "string"
      ? parsed.NombreArchivo
      : typeof parsed.nombrearchivo === "string"
        ? parsed.nombrearchivo
        : "",
    mensaje: typeof parsed.Mensaje === "string"
      ? parsed.Mensaje
      : typeof parsed.mensaje === "string"
        ? parsed.mensaje
        : "",
    modo: typeof parsed.Modo === "string"
      ? parsed.Modo
      : typeof parsed.modo === "string"
        ? parsed.modo
        : "",
    telefono: typeof parsed.Telefono === "string"
      ? parsed.Telefono
      : typeof parsed.telefono === "string"
        ? parsed.telefono
        : "",
    contenido: typeof parsed.Contenido === "string"
      ? parsed.Contenido
      : typeof parsed.contenido === "string"
        ? parsed.contenido
        : "",
  };

  return payload;
}

async function copyTextToClipboard(value: string) {
  if (!value) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function downloadBase64Pdf(row: ReporteWhatsappLog) {
  const base64 = getRequestBase64(row.requestJson);
  if (!base64) {
    window.alert("No hay archivo Base64 disponible para este registro.");
    return;
  }

  try {
    const binary = window.atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = getRequestFileName(row);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch {
    window.alert("No se pudo descargar el archivo Base64.");
  }
}

function renderLogDetail(row: ReporteWhatsappLog) {
  const responsePreview = getResponsePreview(row.responseJson);
  const requestPreview = getRequestPreview(row);
  const requestBase64 = getRequestBase64(row.requestJson);
  const showDiagnostics = row.estadoEnvio.toUpperCase().startsWith("ERROR");

  return (
    <div style={styles.logDetailCell}>
      <span>{row.mensajeError || "Sin observaciones"}</span>
      {showDiagnostics && responsePreview ? (
        <span style={styles.logDetailMeta}>Respuesta WUP: {responsePreview}</span>
      ) : null}
      {showDiagnostics && requestPreview ? (
        <span style={styles.logDetailMeta}>Payload: {requestPreview}</span>
      ) : null}
      {showDiagnostics && requestBase64 ? (
        <div style={styles.logActionRow}>
          <button
            type="button"
            style={styles.copyButton}
            onClick={() => {
              void copyTextToClipboard(requestBase64).then((copied) => {
                window.alert(copied ? "Base64 copiado al portapapeles." : "No se pudo copiar el Base64.");
              });
            }}
          >
            Copiar Base64
          </button>
        </div>
      ) : null}
      {showDiagnostics && requestBase64 ? (
        <div style={styles.logBase64Block}>
          <span style={styles.logDetailMeta}>Base64 completo:</span>
          <textarea
            readOnly
            value={requestBase64}
            style={styles.logBase64Input}
            rows={6}
          />
        </div>
      ) : null}
    </div>
  );
}

export function RptWupModulePage({
  tipo = "operativo",
  pageTitle = "Reportes automáticos WUP",
  eyebrow = "Automatización WUP",
  heroTitle = "Control operativo del envío de reportes",
  tableTitle = "Logs del período",
  tableSubtitle = "Auditoría de envío, omisiones, duplicados y respuestas del endpoint WUP.",
  runtimeTitle = "Ejecución actual",
  enableGerencialPdfPreview = false,
}: RptWupModulePageProps) {
  const [dashboard, setDashboard] = useState<ReporteWhatsappDashboard | null>(null);
  const [form, setForm] = useState<ReporteWhatsappConfiguracion>(formInicial);
  const [periodoBoleta, setPeriodoBoleta] = useState(getCurrentMonthInputValue);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [runningAction, setRunningAction] = useState<"" | "save" | "run" | "retry" | "reschedule">("");
  const [selectedDestinatarioIds, setSelectedDestinatarioIds] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const lastErrorLogSignatureRef = useRef("");
  const dashboardRequestInFlightRef = useRef(false);
  const tipoApi = tipo === "gerencial" ? "gerencial" : tipo === "boleta" ? "boleta" : "operativo";
  const periodoBoletaApi = tipoApi === "boleta" ? formatPeriodoBoleta(periodoBoleta) : undefined;

  const progress = useMemo(() => {
    const total = dashboard?.runtime.totalEmpleados ?? 0;
    const processed = dashboard?.runtime.empleadosProcesados ?? 0;
    return total <= 0 ? 0 : Math.min(100, Math.round((processed * 100) / total));
  }, [dashboard]);

  const destinatariosBoleta = dashboard?.destinatarios ?? [];
  const destinatariosSeleccionadosSet = useMemo(
    () => new Set(selectedDestinatarioIds),
    [selectedDestinatarioIds]
  );
  const destinatariosBoletaSeleccionados = useMemo(
    () => destinatariosBoleta.filter((row) => destinatariosSeleccionadosSet.has(row.idEmpleado)),
    [destinatariosBoleta, destinatariosSeleccionadosSet]
  );
  const requiereSeleccionBoleta = tipoApi === "boleta";
  const puedeEjecutarBoleta = !requiereSeleccionBoleta || destinatariosBoletaSeleccionados.length > 0;

  const loadDashboard = useEffectEvent(async (silent = false, signal?: AbortSignal) => {
    if (dashboardRequestInFlightRef.current) {
      return;
    }

    dashboardRequestInFlightRef.current = true;

    if (!silent) {
      setLoading(true);
    }

    try {
      const response = await reportesWhatsappService.obtenerDashboard(
        DASHBOARD_TOP_LOGS,
        tipoApi,
        periodoBoletaApi,
        { signal }
      );
      startTransition(() => {
        setDashboard(response);
        setForm((current) => {
          if (saving || runningAction === "save") {
            return current;
          }

          return {
            tipoReporte: response.configuracion.tipoReporte,
            horaEjecucion: response.configuracion.horaEjecucion || "07:00",
            diasEjecucion: response.configuracion.diasEjecucion ?? [],
            cantidadEmpleadosPorBloque: response.configuracion.cantidadEmpleadosPorBloque || 10,
            delaySegundosEntreBloques: response.configuracion.delaySegundosEntreBloques || 30,
            activo: !!response.configuracion.activo,
            usarSemanaEnCurso: !!response.configuracion.usarSemanaEnCurso,
            usarMesEnCurso: !!response.configuracion.usarMesEnCurso,
            usuarioModificacion: response.configuracion.usuarioModificacion,
            fechaModificacion: response.configuracion.fechaModificacion,
            usaRespaldoAppSettings: response.configuracion.usaRespaldoAppSettings,
          };
        });
      });
      setError("");
    } catch (err) {
      if (signal?.aborted) {
        return;
      }

      setError(getHttpErrorMessage(err, `No se pudo cargar el dashboard de reportes ${tipoApi}.`));
    } finally {
      dashboardRequestInFlightRef.current = false;
      if (!silent) {
        setLoading(false);
      }
    }
  });

  const refreshDashboardBurst = useEffectEvent(() => {
    void loadDashboard(true);

    for (const delayMs of [1000, 2500, 5000]) {
      window.setTimeout(() => {
        void loadDashboard(true);
      }, delayMs);
    }
  });

  useEffect(() => {
    const controller = new AbortController();
    void loadDashboard(false, controller.signal);
    return () => controller.abort();
  }, [tipoApi, periodoBoletaApi]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadDashboard(true);
    }, dashboard?.runtime.isRunning ? POLLING_RUNNING_MS : POLLING_IDLE_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [dashboard?.runtime.isRunning, tipoApi, periodoBoletaApi]);

  useEffect(() => {
    if (tipoApi !== "boleta") {
      if (selectedDestinatarioIds.length > 0) {
        setSelectedDestinatarioIds([]);
      }
      return;
    }

    const idsDisponibles = new Set(destinatariosBoleta.map((row) => row.idEmpleado).filter((id) => id > 0));
    setSelectedDestinatarioIds((current) => current.filter((id) => idsDisponibles.has(id)));
  }, [destinatariosBoleta, selectedDestinatarioIds.length, tipoApi]);

  useEffect(() => {
    const failedLogs = (dashboard?.logs ?? [])
      .filter((row) => row.estadoEnvio.toUpperCase().startsWith("ERROR"))
      .slice(0, 10);

    if (failedLogs.length === 0) {
      lastErrorLogSignatureRef.current = "";
      return;
    }

    const executionId = dashboard?.runtime.executionId || "no-execution";
    const nextSignature = `${tipoApi}:${executionId}:${failedLogs.length}:${failedLogs[0]?.idLog ?? 0}`;

    if (nextSignature === lastErrorLogSignatureRef.current) {
      return;
    }

    lastErrorLogSignatureRef.current = nextSignature;
    console.warn(
      `[RptWup:${tipoApi}] Errores recientes detectados`,
      failedLogs.map((row) => ({
        idLog: row.idLog,
        idEmpleado: row.idEmpleado,
        empleado: row.nombreEmpleado || row.usuario,
        telefono: row.telefono,
        estado: row.estadoEnvio,
        mensaje: row.mensajeError,
        respuesta: getResponsePreview(row.responseJson),
        payload: getRequestPreview(row),
        base64: getRequestBase64(row.requestJson),
        requestJson: tryParseJsonObject(row.requestJson) ?? row.requestJson,
        postmanRequest: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: buildPostmanPayload(row.requestJson),
        },
      }))
    );
  }, [dashboard?.logs, tipoApi]);

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
        key: "archivo",
        header: "Archivo",
        align: "center",
        render: (row) => getRequestBase64(row.requestJson) ? (
          <button
            type="button"
            style={styles.copyButton}
            onClick={() => downloadBase64Pdf(row)}
          >
            Descargar
          </button>
        ) : "-",
      },
      {
        key: "mensajeError",
        header: "Detalle",
        render: (row) => renderLogDetail(row),
      },
    ],
    []
  );

  const destinatarioColumns = useMemo<DataGridColumn<ReporteWhatsappBoletaDestino>[]>(
    () => [
      {
        key: "select",
        header: "Sel.",
        align: "center",
        render: (row) => (
          <input
            type="checkbox"
            checked={destinatariosSeleccionadosSet.has(row.idEmpleado)}
            onChange={(event) => {
              setSelectedDestinatarioIds((current) => {
                const next = new Set(current);
                if (event.target.checked) {
                  next.add(row.idEmpleado);
                } else {
                  next.delete(row.idEmpleado);
                }

                return Array.from(next);
              });
            }}
          />
        ),
      },
      {
        key: "estadoPdf",
        header: "PDF",
        render: (row) => (
          row.estadoPdf === "PDF_DISPONIBLE" && row.idBoleta ? (
            <button
              type="button"
              onClick={() => {
                void visualizarPdfBoleta(row);
              }}
              style={{
                ...styles.statusBadgeButton,
                ...styles.statusBadge,
                ...getEstadoTone(row.estadoPdf),
              }}
              disabled={downloadingPdf}
              title="Visualizar PDF de boleta"
            >
              {row.estadoPdf}
            </button>
          ) : (
            <span style={{ ...styles.statusBadge, ...getEstadoTone(row.estadoPdf) }}>
              {row.estadoPdf}
            </span>
          )
        ),
      },
      {
        key: "estadoDestino",
        header: "Destino",
        render: (row) => (
          <span style={{ ...styles.statusBadge, ...getEstadoTone(row.estadoDestino) }}>
            {row.estadoDestino}
          </span>
        ),
      },
      {
        key: "empleado",
        header: "Empleado",
        render: (row) => (
          <div style={styles.logEmployeeCell}>
            <strong>{row.nombreTrabajador || row.nombreEmpleado}</strong>
            <span>{row.usuario || `ID ${row.idEmpleado}`}</span>
          </div>
        ),
      },
      { key: "numeroDocumento", header: "Documento", render: (row) => row.numeroDocumento || "-" },
      { key: "telefono", header: "Telefono", render: (row) => row.telefono || "-" },
      { key: "correo", header: "Correo", render: (row) => row.correo || "-" },
      { key: "periodo", header: "Periodo", render: (row) => row.periodo || "-" },
    ],
    [destinatariosSeleccionadosSet, downloadingPdf]
  );

  const validar = () => {
    const nextErrors: Record<string, string> = {};

    if (!form.horaEjecucion.trim()) {
      nextErrors.horaEjecucion = "La hora es obligatoria.";
    }

    if (!/^\d{2}:\d{2}$/.test(form.horaEjecucion.trim())) {
      nextErrors.horaEjecucion = "Use formato HH:mm.";
    }

    if (tipoApi === "gerencial" && (form.diasEjecucion?.length ?? 0) === 0) {
      nextErrors.diasEjecucion = "Seleccione al menos un dia para la ejecucion automatica.";
    }

    if (form.cantidadEmpleadosPorBloque < 1) {
      nextErrors.cantidadEmpleadosPorBloque = "Debe ser mayor o igual a 1.";
    }

    if (form.cantidadEmpleadosPorBloque > 50) {
      nextErrors.cantidadEmpleadosPorBloque = "El máximo recomendado es 50.";
    }

    if (form.delaySegundosEntreBloques < 5) {
      nextErrors.delaySegundosEntreBloques = "Debe ser mayor o igual a 5.";
    }

    if (form.delaySegundosEntreBloques > 600) {
      nextErrors.delaySegundosEntreBloques = "El máximo recomendado es 600.";
    }

    setErrores(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const toggleDiaEjecucion = (dia: string) => {
    setForm((prev) => {
      const current = new Set(prev.diasEjecucion ?? []);
      if (current.has(dia)) {
        current.delete(dia);
      } else {
        current.add(dia);
      }

      return {
        ...prev,
        diasEjecucion: DIAS_EJECUCION
          .map((item) => item.value)
          .filter((value) => current.has(value)),
      };
    });
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
      await reportesWhatsappService.actualizarConfiguracion({ ...form, tipoReporte: tipoApi }, tipoApi);
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
    if ((action === "run" || action === "retry") && !puedeEjecutarBoleta) {
      setError("Marque al menos un destinatario antes de enviar o reintentar.");
      setSuccess("");
      return;
    }

    setRunningAction(action);
    setError("");
    setSuccess("");

    try {
      const payload: ReporteWhatsappEjecucionRequest | undefined =
        requiereSeleccionBoleta && (action === "run" || action === "retry")
          ? { idsEmpleadoSeleccionados: destinatariosBoletaSeleccionados.map((row) => row.idEmpleado) }
          : undefined;

      if (action === "run") {
        const response = await reportesWhatsappService.ejecutarAhora(tipoApi, periodoBoletaApi, payload);
        setSuccess(response.message || "Proceso manual encolado.");
      }

      if (action === "retry") {
        const response = await reportesWhatsappService.reintentarFallidos(tipoApi, periodoBoletaApi, payload);
        setSuccess(response.message || "Reintento encolado.");
      }

      if (action === "reschedule") {
        await reportesWhatsappService.reprogramarJob(tipoApi);
        setSuccess("Job reprogramado correctamente.");
      }

      refreshDashboardBurst();
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo ejecutar la acción solicitada."));
    } finally {
      setRunningAction("");
    }
  };

  const descargarPdfGerencial = async () => {
    setDownloadingPdf(true);
    setError("");
    setSuccess("");

    try {
      const blob = await exportarAsistenciaGerencialPdf({
        usarPeriodoAutomatico: true,
        destinatario: "Gerencia CJ Telecom",
      });

      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error("El PDF gerencial no contiene datos.");
      }

      const fechaInicio = dashboard?.periodoActual?.fechaInicio?.replaceAll("/", "") ?? "";
      const fechaFin = dashboard?.periodoActual?.fechaFin?.replaceAll("/", "") ?? "";
      const fileName = fechaInicio && fechaFin
        ? `Reporte_Gerencial_Asistencia_${fechaInicio}_${fechaFin}.pdf`
        : "Reporte_Gerencial_Asistencia.pdf";

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setSuccess("Vista previa del nuevo PDF gerencial descargada correctamente.");
    } catch (err) {
      setError(await getBlobHttpErrorMessage(err, "No se pudo descargar el PDF gerencial."));
    } finally {
      setDownloadingPdf(false);
    }
  };

  const visualizarPdfBoleta = async (row: ReporteWhatsappBoletaDestino) => {
    if (!row.idBoleta || row.idBoleta <= 0) {
      setError("No se encontro la boleta asociada para visualizar el PDF.");
      return;
    }

    setDownloadingPdf(true);
    setError("");
    setSuccess("");

    try {
      const blob = await descargarPdfBoleta(row.idBoleta);

      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error("El PDF de la boleta no contiene datos.");
      }

      openBlobInNewTab(blob);
      setSuccess(`PDF de boleta abierto para ${row.nombreTrabajador || row.nombreEmpleado}.`);
    } catch (err) {
      setError(await getBlobHttpErrorMessage(err, "No se pudo visualizar el PDF de la boleta."));
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <AppPage title={pageTitle} style={styles.page}>
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
            <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 16 }}>
              <AppCard style={styles.heroCard}>
                <div style={styles.heroHeader}>
                  <div>
                    <div style={styles.eyebrow}>{eyebrow}</div>
                    <h2 style={styles.heroTitle}>{heroTitle}</h2>
                    <p style={styles.heroText}>
                      Período actual: <strong>{dashboard?.periodoActual.etiquetaPeriodo || "-"}</strong>
                    </p>
                    {tipoApi === "boleta" ? (
                      <div style={styles.periodoField}>
                        <label style={styles.label}>Periodo de boleta</label>
                        <input
                          type="month"
                          value={periodoBoleta}
                          onChange={(event) => setPeriodoBoleta(event.target.value)}
                          style={styles.input}
                        />
                      </div>
                    ) : null}
                  </div>
                  <div style={styles.heroActions}>
                    {tipoApi === "gerencial" && enableGerencialPdfPreview ? (
                      <button
                        type="button"
                        style={styles.secondaryButton}
                        onClick={() => void descargarPdfGerencial()}
                        disabled={runningAction !== "" || downloadingPdf}
                      >
                        Ver nuevo PDF
                      </button>
                    ) : null}
                    <button
                      type="button"
                      style={styles.primaryButton}
                      onClick={() => void ejecutarAccion("run")}
                      disabled={runningAction !== "" || dashboard?.runtime.isRunning || !puedeEjecutarBoleta}
                    >
                      Ejecutar ahora
                    </button>
                    <button
                      type="button"
                      style={styles.secondaryButton}
                      onClick={() => void ejecutarAccion("retry")}
                      disabled={runningAction !== "" || dashboard?.runtime.isRunning || !puedeEjecutarBoleta}
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
                      <div style={styles.progressTitle}>{runtimeTitle}</div>
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
              <div style={{ marginTop: 8 }}>
                <div style={{ width: "100%" }}>
                  <div style={{ ...styles.kpiGrid, width: "100%" }}>
                    <KpiCard label="Total procesados" value={String(dashboard?.kpis.totalProcesados ?? 0)} tone="blue" />
                    <KpiCard label="Enviados" value={String(dashboard?.kpis.totalEnviados ?? 0)} tone="green" />
                    <KpiCard label="Errores" value={String(dashboard?.kpis.totalErrores ?? 0)} tone="red" />
                    <KpiCard label="Omitidos" value={String(dashboard?.kpis.totalOmitidos ?? 0)} tone="amber" />
                    <KpiCard label="Duplicados" value={String(dashboard?.kpis.totalDuplicados ?? 0)} tone="slate" />
                    <KpiCard label="Pendientes retry" value={String(dashboard?.kpis.totalPendientesRetry ?? 0)} tone="blue" />
                  </div>
                </div>
              </div>
            </div>
            <AppCard style={styles.configCard}>
              <h3 style={styles.cardTitle}>Configuración dinámica</h3>
              <div style={{ ...styles.formGrid, gridTemplateColumns: "1fr 1fr 1fr" }}>
                {/* Fila alineada de 3 campos */}
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
                    min={5}
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
              </div>

              {/* Día de ejecución y switch van debajo */}
              {tipoApi === "gerencial" ? (
                <>
                  <div style={styles.daySelectorField}>
                    <label style={styles.label}>Dias de ejecucion</label>
                    <div style={styles.daySelectorGrid}>
                      {DIAS_EJECUCION.map((dia) => {
                        const checked = (form.diasEjecucion ?? []).includes(dia.value);
                        return (
                          <label
                            key={dia.value}
                            style={{
                              ...styles.daySelectorOption,
                              ...(checked ? styles.daySelectorOptionActive : {}),
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleDiaEjecucion(dia.value)}
                            />
                            <span>{dia.label}</span>
                          </label>
                        );
                      })}
                    </div>
                    <span style={styles.helpText}>
                      Marca los dias en los que el reporte gerencial debe ejecutarse automaticamente a la hora indicada.
                    </span>
                    {errores.diasEjecucion ? <span style={styles.errorText}>{errores.diasEjecucion}</span> : null}
                  </div>

                  <div style={{ ...styles.switchField, marginTop: 12 }}>
                    <label style={styles.switchRow}>
                      <input
                        type="checkbox"
                        checked={!!form.usarMesEnCurso}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            usarMesEnCurso: event.target.checked,
                            usarSemanaEnCurso: false,
                          }))
                        }
                      />
                      <span>Imprimir mes en curso</span>
                    </label>
                    <div style={styles.metaText}>
                      Si no esta marcado, el reporte gerencial enviara por defecto la semana pasada completa, de lunes a domingo. Si esta marcado, enviara desde el primer dia del mes actual hasta hoy.
                    </div>
                  </div>
                </>
              ) : null}

              <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginTop: 18 }}>
                <div style={{ ...styles.switchField, marginBottom: 0, flex: 1 }}>
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
                <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
                  <button
                    type="button"
                    style={styles.primaryButton}
                    onClick={() => void guardarConfiguracion()}
                    disabled={saving || runningAction !== ""}
                  >
                    Guardar configuración
                  </button>
                </div>
              </div>
            </AppCard>
          </div>



          {tipoApi === "boleta" ? (
            <AppCard>
              <div style={styles.tableHeader}>
                <div>
                  <h3 style={styles.cardTitle}>Destinatarios activos</h3>
                  <p style={styles.tableSubtitle}>
                    Empleados activos del padrÃ³n WUP cruzados con boletas y PDF del perÃ­odo seleccionado.
                  </p>
                </div>
              </div>
              <div style={styles.selectionToolbar}>
                <span style={styles.selectionSummary}>
                  Marcados: {destinatariosBoletaSeleccionados.length} / {destinatariosBoleta.length}
                </span>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => setSelectedDestinatarioIds(destinatariosBoleta.map((row) => row.idEmpleado))}
                  disabled={destinatariosBoleta.length === 0}
                >
                  Marcar todos
                </button>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => setSelectedDestinatarioIds([])}
                  disabled={destinatariosBoletaSeleccionados.length === 0}
                >
                  Limpiar
                </button>
              </div>

              <DataGridBase
                columns={destinatarioColumns}
                rows={dashboard?.destinatarios ?? []}
                getRowKey={(row) => `${row.idEmpleado}-${row.idBoleta ?? "sin-boleta"}`}
                emptyMessage="No hay destinatarios disponibles para el perÃ­odo seleccionado."
              />
            </AppCard>
          ) : null}

          <AppCard>
            <div style={styles.tableHeader}>
              <div>
                <h3 style={styles.cardTitle}>{tableTitle}</h3>
                <p style={styles.tableSubtitle}>{tableSubtitle}</p>
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

export default function RptWupPage() {
  return <RptWupModulePage />;
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
  periodoField: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginTop: 14,
    maxWidth: 220,
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
  daySelectorField: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    gridColumn: "1 / -1",
  },
  daySelectorGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 10,
  },
  daySelectorOption: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  daySelectorOptionActive: {
    border: "1px solid #17143A",
    background: "#EEF2FF",
    boxShadow: "inset 0 0 0 1px rgba(23, 20, 58, 0.12)",
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
  helpText: {
    fontSize: 12,
    color: "#64748B",
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
  selectionToolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 14,
  },
  selectionSummary: {
    fontSize: 13,
    color: "#334155",
    fontWeight: 700,
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
  statusBadgeButton: {
    border: "none",
    cursor: "pointer",
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
  logDetailCell: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 260,
  },
  logDetailMeta: {
    fontSize: 12,
    color: "#64748B",
    whiteSpace: "normal",
    wordBreak: "break-word",
  },
  logBase64Block: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginTop: 4,
  },
  logActionRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  copyButton: {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  logBase64Input: {
    width: "100%",
    minWidth: 320,
    resize: "vertical",
    borderRadius: 8,
    border: "1px solid #CBD5E1",
    padding: 8,
    fontSize: 11,
    fontFamily: "Consolas, 'Courier New', monospace",
    color: "#0F172A",
    background: "#F8FAFC",
    boxSizing: "border-box",
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
