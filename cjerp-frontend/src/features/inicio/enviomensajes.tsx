import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import AppCard from "../../components/base/AppCard";
import AppPage from "../../components/base/AppPage";
import AppStatusMessage from "../../components/base/AppStatusMessage";
import DataGridBase, { type DataGridColumn } from "../../components/base/DataGridBase";
import { listarEmpleadosWup } from "../../api/empleadoService";
import { reportesWhatsappService } from "../../api/reportesWhatsappService";
import type { EmpleadoCta } from "../../models/empleadoCta";
import type {
  ReporteWhatsappManualSendItemResult,
  ReporteWhatsappManualSendRequest,
} from "../../models/reportesWhatsapp";
import { getHttpErrorMessage } from "../../utils/httpError";

type TipoMensaje =
  | "aviso"
  | "comunicado"
  | "recordatorio"
  | "invitacion"
  | "monitoreo"
  | "capacitacion"
  | "otro";

type TonoMensaje = "formal" | "cercano" | "urgente" | "informativo";

type DestinatarioRow = {
  idEmpleado: number;
  usuario: string;
  nombreEmpleado: string;
  numeroDocumento: string;
  telefono: string;
  correo: string;
  seleccionado: boolean;
};

type AdjuntoDraft = {
  id: string;
  nombreArchivo: string;
  contenidoBase64: string;
  contentType: string;
  size: number;
};

type PromptForm = {
  tipoMensaje: TipoMensaje;
  titulo: string;
  saludo: string;
  fecha: string;
  hora: string;
  lugar: string;
  motivo: string;
  objetivo: string;
  recomendaciones: string;
  cierre: string;
  firma: string;
  descripcionAdjunto: string;
  destinatario: string;
  tono: TonoMensaje;
};

type MessageFormatAction =
  | "bold"
  | "italic"
  | "strike"
  | "mono"
  | "bullet"
  | "newline";

const PROMPT_REFERENCIA = `Genera un mensaje de texto o WhatsApp corporativo para CJ Telecom con contenido personalizado, tono formal, claro y cercano.

Objetivo:
Redactar un mensaje listo para enviar a los destinatarios indicados, respetando este formato:

1. Encabezado llamativo con emojis si aplica.
2. Saludo cordial.
3. Cuerpo principal explicando el motivo del mensaje.
4. Detalle de fecha, hora, lugar o contexto si corresponde.
5. Lista de recomendaciones o indicaciones usando viñetas con ✅ cuando aplique.
6. Cierre de agradecimiento.
7. Firma institucional.

Reglas obligatorias:
- El texto debe quedar listo para copiar y enviar.
- Mantener redacción profesional, breve y ordenada.
- Resaltar en negrita únicamente la información importante: fecha, hora, actividad principal, instrucciones clave.
- Si se indica que hay documento adjunto, mencionar de forma natural que “se adjunta el documento” o “se comparte el archivo adjunto”.
- Si no hay adjunto, no mencionar archivos.
- No inventar datos faltantes.
- Si falta información, dejar un texto neutro y editable.
- No usar lenguaje excesivamente técnico.
- El mensaje debe verse bien en formato móvil.
- No agregar explicaciones fuera del mensaje final.`;

const INITIAL_PROMPT_FORM: PromptForm = {
  tipoMensaje: "comunicado",
  titulo: "",
  saludo: "Buenas tardes, estimados colaboradores:",
  fecha: "",
  hora: "",
  lugar: "",
  motivo: "",
  objetivo: "",
  recomendaciones: "",
  cierre: "Agradecemos su colaboración y participación durante esta actividad.",
  firma: "Área SSOMA – CJ Telecom",
  descripcionAdjunto: "",
  destinatario: "colaboradores",
  tono: "formal",
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function buildDisplayName(empleado: EmpleadoCta) {
  return empleado.nombreEmpleadoCJ || empleado.nombreEmpleado || `Empleado ${empleado.idEmpleado}`;
}

function buildDraftMessage(form: PromptForm, tieneAdjuntos: boolean) {
  const title = form.titulo.trim() || "COMUNICADO CJ TELECOM";
  const header = `📣 *${title.toUpperCase()}*`;
  const saludo = form.saludo.trim() || "Buenas tardes, estimados colaboradores:";

  const detalleEvento = [
    form.fecha.trim() ? `**${form.fecha.trim()}**` : "",
    form.hora.trim() ? `a las **${form.hora.trim()}**` : "",
    form.lugar.trim() ? `en **${form.lugar.trim()}**` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const motivoBase = form.motivo.trim() || "Se comparte la siguiente comunicación para su conocimiento y atención.";
  const cuerpo = detalleEvento
    ? `${motivoBase} ${detalleEvento}.`
    : motivoBase;

  const objetivo = form.objetivo.trim()
    ? `El objetivo es ${form.objetivo.trim()}.`
    : "";

  const recomendaciones = form.recomendaciones
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => `✅ ${item}`);

  const sections = [
    header,
    "",
    saludo,
    "",
    cuerpo,
    objetivo ? "" : null,
    objetivo || null,
    recomendaciones.length > 0 ? "" : null,
    recomendaciones.length > 0
      ? "Para ello, solicitamos su apoyo considerando las siguientes recomendaciones:"
      : null,
    ...(recomendaciones.length > 0 ? ["", ...recomendaciones] : []),
    tieneAdjuntos ? "" : null,
    tieneAdjuntos
      ? `📎 ${form.descripcionAdjunto.trim() || "Se adjunta el documento correspondiente para su revisión."}`
      : null,
    "",
    form.cierre.trim() || "Agradecemos su atención.",
    "",
    "Saludos cordiales.",
    `*${form.firma.trim() || "CJ Telecom"}*`,
  ];

  return sections.filter((item): item is string => item !== null).join("\n");
}

async function fileToBase64(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(`No se pudo leer el archivo ${file.name}.`));
    reader.readAsDataURL(file);
  });

  const [, base64 = ""] = dataUrl.split(",", 2);
  return base64;
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function unwrapSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
  suffix = prefix
) {
  const selectedText = value.slice(selectionStart, selectionEnd);

  if (selectedText.startsWith(prefix) && selectedText.endsWith(suffix)) {
    return {
      replacement: selectedText.slice(prefix.length, selectedText.length - suffix.length),
      rangeStart: selectionStart,
      rangeEnd: selectionEnd,
      selectionOffsetStart: 0,
      selectionOffsetEnd: -(prefix.length + suffix.length),
    };
  }

  const outerStart = selectionStart - prefix.length;
  const outerEnd = selectionEnd + suffix.length;
  if (
    outerStart >= 0 &&
    outerEnd <= value.length &&
    value.slice(outerStart, selectionStart) === prefix &&
    value.slice(selectionEnd, outerEnd) === suffix
  ) {
    return {
      replacement: selectedText,
      rangeStart: outerStart,
      rangeEnd: outerEnd,
      selectionOffsetStart: 0,
      selectionOffsetEnd: 0,
    };
  }

  return null;
}

function renderInlineWhatsappFormat(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let remaining = text;
  let key = 0;

  const patterns = [
    { regex: /```([^`]+)```/, render: (value: string) => <code key={`code-${key++}`} style={styles.inlineCode}>{value}</code> },
    { regex: /\*([^*\n]+)\*/, render: (value: string) => <strong key={`bold-${key++}`}>{value}</strong> },
    { regex: /_([^_\n]+)_/, render: (value: string) => <em key={`italic-${key++}`}>{value}</em> },
    { regex: /~([^~\n]+)~/, render: (value: string) => <s key={`strike-${key++}`}>{value}</s> },
  ];

  while (remaining.length > 0) {
    let nextMatchIndex = -1;
    let nextMatchLength = 0;
    let nextMatchValue = "";
    let nextRenderer: ((value: string) => ReactNode) | null = null;

    for (const pattern of patterns) {
      const match = pattern.regex.exec(remaining);
      if (!match || match.index < 0) {
        continue;
      }

      if (nextMatchIndex === -1 || match.index < nextMatchIndex) {
        nextMatchIndex = match.index;
        nextMatchLength = match[0].length;
        nextMatchValue = match[1];
        nextRenderer = pattern.render;
      }
    }

    if (nextMatchIndex === -1 || nextRenderer === null) {
      nodes.push(<Fragment key={`text-${key++}`}>{remaining}</Fragment>);
      break;
    }

    if (nextMatchIndex > 0) {
      nodes.push(<Fragment key={`text-${key++}`}>{remaining.slice(0, nextMatchIndex)}</Fragment>);
    }

    nodes.push(nextRenderer(nextMatchValue));
    remaining = remaining.slice(nextMatchIndex + nextMatchLength);
  }

  return nodes;
}

function renderWhatsappPreview(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return "El mensaje final aparecera aqui.";
  }

  const lines = message.split(/\r?\n/);

  return lines.map((line, index) => {
    const normalizedLine = line.trim();

    if (!normalizedLine) {
      return <div key={`line-${index}`} style={styles.previewSpacer} />;
    }

    if (normalizedLine.startsWith("• ")) {
      return (
        <div key={`line-${index}`} style={styles.previewBulletRow}>
          <span style={styles.previewBulletMarker}>•</span>
          <span>{renderInlineWhatsappFormat(normalizedLine.slice(2))}</span>
        </div>
      );
    }

    return (
      <div key={`line-${index}`}>
        {renderInlineWhatsappFormat(line)}
      </div>
    );
  });
}

export default function EnvioMensajesPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [promptForm, setPromptForm] = useState<PromptForm>(INITIAL_PROMPT_FORM);
  const [mensaje, setMensaje] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [destinatarios, setDestinatarios] = useState<DestinatarioRow[]>([]);
  const [adjuntos, setAdjuntos] = useState<AdjuntoDraft[]>([]);
  const [cargandoDestinatarios, setCargandoDestinatarios] = useState(false);
  const [cargandoAdjuntos, setCargandoAdjuntos] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [sendResults, setSendResults] = useState<ReporteWhatsappManualSendItemResult[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadDestinatarios = async () => {
      try {
        setCargandoDestinatarios(true);
        setError(null);
        const data = await listarEmpleadosWup();
        if (cancelled) return;

        setDestinatarios(
          (Array.isArray(data) ? data : [])
            .filter((item) => item.idEmpleado > 0)
            .map((item) => ({
              idEmpleado: item.idEmpleado,
              usuario: buildDisplayName(item),
              nombreEmpleado: buildDisplayName(item),
              numeroDocumento: item.nroDocumento || "",
              telefono: item.telefono?.trim() ?? "",
              correo: item.correo?.trim() ?? "",
              seleccionado: false,
            }))
            .sort((a, b) => a.nombreEmpleado.localeCompare(b.nombreEmpleado, "es-PE"))
        );
      } catch (err: unknown) {
        if (!cancelled) {
          setError(getHttpErrorMessage(err, "No se pudieron cargar los destinatarios WUP."));
        }
      } finally {
        if (!cancelled) {
          setCargandoDestinatarios(false);
        }
      }
    };

    void loadDestinatarios();
    return () => {
      cancelled = true;
    };
  }, []);

  const destinatariosFiltrados = useMemo(() => {
    const query = normalizeText(busqueda);
    if (!query) return destinatarios;

    return destinatarios.filter((item) =>
      [
        item.nombreEmpleado,
        item.usuario,
        item.numeroDocumento,
        item.telefono,
        item.correo,
      ].some((field) => normalizeText(field).includes(query))
    );
  }, [busqueda, destinatarios]);

  const destinatariosSeleccionados = useMemo(
    () => destinatarios.filter((item) => item.seleccionado),
    [destinatarios]
  );

  const selectionSummary = useMemo(() => {
    const seleccionadosIds = new Set(destinatariosFiltrados.map((item) => item.idEmpleado));
    const seleccionadosEnFiltro = destinatarios.filter(
      (item) => item.seleccionado && seleccionadosIds.has(item.idEmpleado)
    ).length;

    return {
      total: destinatarios.length,
      filtrados: destinatariosFiltrados.length,
      seleccionados: destinatariosSeleccionados.length,
      seleccionadosEnFiltro,
      withPhone: destinatariosSeleccionados.filter((item) => item.telefono.trim()).length,
    };
  }, [destinatarios, destinatariosFiltrados, destinatariosSeleccionados]);

  const canSend =
    !enviando &&
    mensaje.trim().length > 0 &&
    destinatariosSeleccionados.length > 0;
  const allDestinatariosSelected =
    destinatarios.length > 0 && destinatarios.every((item) => item.seleccionado);

  const updatePromptForm = <K extends keyof PromptForm>(key: K, value: PromptForm[K]) => {
    setPromptForm((current) => ({ ...current, [key]: value }));
  };

  const updateDestinatario = (idEmpleado: number, patch: Partial<DestinatarioRow>) => {
    setDestinatarios((current) =>
      current.map((item) => (item.idEmpleado === idEmpleado ? { ...item, ...patch } : item))
    );
  };

  const toggleSelectAllFiltered = (value: boolean) => {
    const ids = new Set(destinatariosFiltrados.map((item) => item.idEmpleado));
    setDestinatarios((current) =>
      current.map((item) => (ids.has(item.idEmpleado) ? { ...item, seleccionado: value } : item))
    );
  };

  const toggleSelectAll = () => {
    const nextValue = !allDestinatariosSelected;
    setDestinatarios((current) => current.map((item) => ({ ...item, seleccionado: nextValue })));
  };

  const handleGenerateDraft = () => {
    setMensaje(buildDraftMessage(promptForm, adjuntos.length > 0));
    setSuccessMessage("Se generó el borrador del mensaje con el formato corporativo solicitado.");
    setError(null);
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(PROMPT_REFERENCIA);
      setSuccessMessage("El prompt de referencia fue copiado al portapapeles.");
      setError(null);
    } catch {
      setError("No se pudo copiar el prompt de referencia.");
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    try {
      setCargandoAdjuntos(true);
      setError(null);
      const nextAdjuntos: AdjuntoDraft[] = [];
      for (const file of files) {
        const contenidoBase64 = await fileToBase64(file);
        nextAdjuntos.push({
          id: `${file.name}-${file.size}-${file.lastModified}`,
          nombreArchivo: file.name,
          contenidoBase64,
          contentType: file.type || "application/octet-stream",
          size: file.size,
        });
      }

      setAdjuntos((current) => {
        const existingIds = new Set(current.map((item) => item.id));
        return [...current, ...nextAdjuntos.filter((item) => !existingIds.has(item.id))];
      });
    } catch (err: unknown) {
      setError(getHttpErrorMessage(err, "No se pudieron preparar los adjuntos."));
    } finally {
      setCargandoAdjuntos(false);
      event.target.value = "";
    }
  };

  const handleRemoveAdjunto = (id: string) => {
    setAdjuntos((current) => current.filter((item) => item.id !== id));
  };

  const applyMessageFormat = (action: MessageFormatAction) => {
    const textarea = messageTextareaRef.current;
    if (!textarea) {
      return;
    }

    const { selectionStart, selectionEnd, value } = textarea;
    const selectedText = value.slice(selectionStart, selectionEnd);
    const hasSelection = selectionStart !== selectionEnd;

    let replacement = "";
    let nextSelectionStart = selectionStart;
    let nextSelectionEnd = selectionEnd;
    let replaceStart = selectionStart;
    let replaceEnd = selectionEnd;

    const applyWrappedFormat = (prefix: string, suffix = prefix, fallback = "texto") => {
      const unwrapped = unwrapSelection(value, selectionStart, selectionEnd, prefix, suffix);
      if (unwrapped) {
        replacement = unwrapped.replacement;
        replaceStart = unwrapped.rangeStart;
        replaceEnd = unwrapped.rangeEnd;
        nextSelectionStart = replaceStart;
        nextSelectionEnd = replaceStart + replacement.length;
        return;
      }

      const baseText = hasSelection ? selectedText : fallback;
      replacement = `${prefix}${baseText}${suffix}`;
      nextSelectionStart = selectionStart + prefix.length;
      nextSelectionEnd = selectionStart + prefix.length + baseText.length;
    };

    switch (action) {
      case "bold":
        applyWrappedFormat("*");
        break;
      case "italic":
        applyWrappedFormat("_");
        break;
      case "strike":
        applyWrappedFormat("~");
        break;
      case "mono":
        applyWrappedFormat("```", "```");
        break;
      case "bullet": {
        const baseText = hasSelection ? selectedText : "Nuevo punto";
        const lines = baseText.split(/\r?\n/);
        const allBulleted = lines.every((line) => line.trimStart().startsWith("• "));
        replacement = allBulleted
          ? lines.map((line) => line.replace(/^(\s*)•\s/, "$1")).join("\n")
          : lines.map((line) => `• ${line || " "}`.trimEnd()).join("\n");
        nextSelectionStart = selectionStart;
        nextSelectionEnd = selectionStart + replacement.length;
        break;
      }
      case "newline":
        replacement = "\n";
        nextSelectionStart = selectionStart + 1;
        nextSelectionEnd = selectionStart + 1;
        break;
    }

    const nextValue = value.slice(0, replaceStart) + replacement + value.slice(replaceEnd);
    setMensaje(nextValue);

    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextSelectionStart, nextSelectionEnd);
    });
  };

  const handleSend = async () => {
    try {
      setEnviando(true);
      setError(null);
      setSuccessMessage(null);

      const payload: ReporteWhatsappManualSendRequest = {
        titulo: promptForm.titulo.trim(),
        mensaje: mensaje.trim(),
        destinatarios: destinatariosSeleccionados.map((item) => ({
          idEmpleado: item.idEmpleado,
          usuario: item.usuario,
          nombreEmpleado: item.nombreEmpleado,
          telefono: item.telefono.trim(),
          correo: item.correo.trim(),
        })),
        adjuntos: adjuntos.map((item) => ({
          nombreArchivo: item.nombreArchivo,
          contenidoBase64: item.contenidoBase64,
          contentType: item.contentType,
        })),
      };

      console.log("[EnvioMensajes] Payload enviado al endpoint /reportes-whatsapp/enviar-mensaje-manual", payload);

      const response = await reportesWhatsappService.enviarMensajeManual(payload);
      setSendResults(response.resultados ?? []);
      setSuccessMessage(
        `Envío procesado. Destinatarios: ${response.totalDestinatarios}. Mensajes confirmados: ${response.enviados}. Errores: ${response.errores}.`
      );
    } catch (err: unknown) {
      setError(getHttpErrorMessage(err, "No se pudo enviar el mensaje manual."));
    } finally {
      setEnviando(false);
    }
  };

  const destinatarioColumns = useMemo<DataGridColumn<DestinatarioRow>[]>(
    () => [
      {
        key: "select",
        header: "Sel.",
        align: "center",
        render: (row) => (
          <input
            type="checkbox"
            checked={row.seleccionado}
            onChange={(event) => updateDestinatario(row.idEmpleado, { seleccionado: event.target.checked })}
          />
        ),
      },
      {
        key: "empleado",
        header: "Destinatario",
        render: (row) => (
          <div style={styles.employeeCell}>
            <strong>{row.nombreEmpleado}</strong>
            <span>{row.numeroDocumento || row.usuario || `ID ${row.idEmpleado}`}</span>
          </div>
        ),
      },
      {
        key: "telefono",
        header: "Telefono WUP",
        render: (row) => (
          <input
            type="text"
            value={row.telefono}
            onChange={(event) => updateDestinatario(row.idEmpleado, { telefono: event.target.value })}
            placeholder="51999999999"
            style={styles.tableInput}
          />
        ),
      },
      {
        key: "correo",
        header: "Correo",
        render: (row) => (
          <input
            type="text"
            value={row.correo}
            onChange={(event) => updateDestinatario(row.idEmpleado, { correo: event.target.value })}
            placeholder="correo@empresa.com"
            style={styles.tableInput}
          />
        ),
      },
    ],
    [destinatarios]
  );

  const resultColumns = useMemo<DataGridColumn<ReporteWhatsappManualSendItemResult>[]>(
    () => [
      {
        key: "empleado",
        header: "Destinatario",
        render: (row) => (
          <div style={styles.employeeCell}>
            <strong>{row.nombreEmpleado || row.usuario || `ID ${row.idEmpleado}`}</strong>
            <span>{row.telefono || "-"}</span>
          </div>
        ),
      },
      { key: "estado", header: "Estado", render: (row) => <span style={styles.statusBadge}>{row.estado}</span> },
      { key: "enviados", header: "Enviados", align: "center", render: (row) => row.enviados },
      { key: "errores", header: "Errores", align: "center", render: (row) => row.errores },
      { key: "detalle", header: "Detalle", render: (row) => row.detalle || "-" },
    ],
    []
  );

  return (
    <AppPage title="Envio de Mensajes">
      
      {error ? <AppStatusMessage tone="error">{error}</AppStatusMessage> : null}
      {successMessage ? <AppStatusMessage tone="success">{successMessage}</AppStatusMessage> : null}

      <div style={styles.summaryGrid}>
        <AppCard style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Destinatarios totales</div>
          <div style={styles.summaryValue}>{selectionSummary.total}</div>
        </AppCard>
        <AppCard style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Seleccionados</div>
          <div style={styles.summaryValue}>{selectionSummary.seleccionados}</div>
        </AppCard>
        <AppCard style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Con telefono</div>
          <div style={styles.summaryValue}>{selectionSummary.withPhone}</div>
        </AppCard>
        <AppCard style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Adjuntos</div>
          <div style={styles.summaryValue}>{adjuntos.length}</div>
        </AppCard>
      </div>

      <div style={styles.twoColumnLayout}>
        <AppCard>
          <div style={styles.sectionHeader}>
            <div>
              <h3 style={styles.sectionTitle}>Mensaje final y adjuntos</h3>
              <p style={styles.sectionText}>
                Puedes generar un borrador y luego ajustarlo manualmente antes del envio.
              </p>
            </div>
          </div>
          <label style={styles.field}>
            <span>Mensaje a enviar</span>
            <div style={styles.formatToolbar}>
              <button type="button" style={styles.formatButton} onClick={() => applyMessageFormat("bold")}>
                Negrita
              </button>
              <button type="button" style={styles.formatButton} onClick={() => applyMessageFormat("italic")}>
                Cursiva
              </button>
              <button type="button" style={styles.formatButton} onClick={() => applyMessageFormat("strike")}>
                Tachado
              </button>
              <button type="button" style={styles.formatButton} onClick={() => applyMessageFormat("mono")}>
                Codigo
              </button>
              <button type="button" style={styles.formatButton} onClick={() => applyMessageFormat("bullet")}>
                Viñetas
              </button>
              <button type="button" style={styles.formatButton} onClick={() => applyMessageFormat("newline")}>
                Salto
              </button>
            </div>
            <div style={styles.formatHint}>
              Formatos compatibles con WhatsApp: `*negrita*`, `_cursiva_`, `~tachado~` y ```codigo```.
            </div>
            <textarea
              ref={messageTextareaRef}
              value={mensaje}
              onChange={(event) => setMensaje(event.target.value)}
              rows={18}
              style={{ ...styles.textarea, minHeight: 360 }}
            />
          </label>
          <div style={styles.attachmentsHeader}>
            <strong>Adjuntos opcionales</strong>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => fileInputRef.current?.click()}
              disabled={cargandoAdjuntos}
            >
              {cargandoAdjuntos ? "Procesando..." : "Agregar documentos"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={handleFileChange}
            />
          </div>
          {adjuntos.length === 0 ? (
            <div style={styles.emptyBox}>No hay adjuntos cargados.</div>
          ) : (
            <div style={styles.attachmentsList}>
              {adjuntos.map((adjunto) => (
                <div key={adjunto.id} style={styles.attachmentItem}>
                  <div>
                    <strong>{adjunto.nombreArchivo}</strong>
                    <div style={styles.attachmentMeta}>{formatFileSize(adjunto.size)}</div>
                  </div>
                  <button
                    type="button"
                    style={styles.removeButton}
                    onClick={() => handleRemoveAdjunto(adjunto.id)}
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          )}
      
        </AppCard>

        <AppCard>




          <div style={styles.previewCard}>
            <div style={styles.previewTitle}>Vista previa</div>
            <div style={styles.previewBody}>{renderWhatsappPreview(mensaje)}</div>
          </div>

          <div style={styles.actionRow}>
            <button type="button" style={styles.secondaryButton} onClick={handleGenerateDraft}>
              Regenerar borrador
            </button>
            <button
              type="button"
              style={canSend ? styles.primaryButton : styles.disabledButton}
              onClick={() => void handleSend()}
              disabled={!canSend}
            >
              {enviando ? "Enviando..." : "Enviar mensaje"}
            </button>
          </div>
        </AppCard>
      </div>

      <AppCard>
        <div style={styles.sectionHeader}>
          <div>
            <h3 style={styles.sectionTitle}>Destinatarios indicados</h3>
            <p style={styles.sectionText}>
              Selecciona los destinatarios, ajusta su teléfono WUP si hace falta y prepara el envío masivo.
            </p>
          </div>
          <div style={styles.recipientActions}>
            <button type="button" style={styles.secondaryButton} onClick={toggleSelectAll}>
              {allDestinatariosSelected ? "Deseleccionar todo" : "Seleccionar todo"}
            </button>
            <button type="button" style={styles.secondaryButton} onClick={() => toggleSelectAllFiltered(true)}>
              Seleccionar filtro
            </button>
            <button type="button" style={styles.secondaryButton} onClick={() => toggleSelectAllFiltered(false)}>
              Limpiar filtro
            </button>
          </div>
        </div>

        <div style={styles.toolbar}>
          <input
            type="text"
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            placeholder="Buscar por nombre, documento, telefono o correo"
            style={styles.searchInput}
          />
          <div style={styles.toolbarHint}>
            Filtrados: {selectionSummary.filtrados} | Seleccionados en filtro: {selectionSummary.seleccionadosEnFiltro}
          </div>
        </div>

        <DataGridBase
          columns={destinatarioColumns}
          rows={destinatariosFiltrados}
          getRowKey={(row) => row.idEmpleado}
          loading={cargandoDestinatarios}
          loadingMessage="Cargando destinatarios WUP..."
          emptyMessage="No hay destinatarios disponibles para la búsqueda actual."
        />
      </AppCard>

      <AppCard>
        <div style={styles.sectionHeader}>
          <div>
            <h3 style={styles.sectionTitle}>Resultado del envio</h3>
            <p style={styles.sectionText}>
              Resumen por destinatario del último procesamiento manual.
            </p>
          </div>
        </div>

        <DataGridBase
          columns={resultColumns}
          rows={sendResults}
          getRowKey={(row) => `${row.idEmpleado}-${row.telefono}-${row.estado}`}
          emptyMessage="Aun no se ha realizado ningun envio manual."
        />
      </AppCard>
    </AppPage>
  );
}

const styles: Record<string, React.CSSProperties> = {
  hero: {
    background: "linear-gradient(135deg, #0F172A 0%, #1D4ED8 50%, #22C55E 100%)",
    color: "#FFFFFF",
    borderRadius: 18,
    padding: 24,
    marginBottom: 18,
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    opacity: 0.85,
  },
  heroTitle: {
    margin: "8px 0 10px",
    fontSize: 30,
    lineHeight: 1.1,
  },
  heroText: {
    margin: 0,
    maxWidth: 760,
    color: "rgba(255,255,255,0.9)",
    lineHeight: 1.6,
  },
  heroActions: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
    marginBottom: 18,
  },
  summaryCard: {
    marginBottom: 0,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#64748B",
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: 800,
    color: "#0F172A",
  },
  twoColumnLayout: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 0.95fr)",
    gap: 18,
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 16,
    flexWrap: "wrap",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    color: "#0F172A",
  },
  sectionText: {
    margin: "6px 0 0",
    color: "#475569",
    fontSize: 13,
    lineHeight: 1.55,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14,
  },
  field: {
    display: "grid",
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    color: "#334155",
  },
  input: {
    width: "100%",
    minHeight: 42,
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    padding: "10px 12px",
    fontSize: 13,
    color: "#0F172A",
    boxSizing: "border-box",
    background: "#FFFFFF",
  },
  textarea: {
    width: "100%",
    borderRadius: 12,
    border: "1px solid #CBD5E1",
    padding: "12px 14px",
    fontSize: 13,
    lineHeight: 1.55,
    color: "#0F172A",
    resize: "vertical",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  formatToolbar: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 8,
  },
  formatButton: {
    border: "1px solid #CBD5E1",
    background: "#F8FAFC",
    color: "#0F172A",
    borderRadius: 8,
    minHeight: 34,
    padding: "0 12px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  formatHint: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 8,
  },
  promptBox: {
    marginTop: 18,
    borderRadius: 14,
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    padding: 14,
  },
  promptPreview: {
    margin: "12px 0 0",
    whiteSpace: "pre-wrap",
    fontFamily: "Consolas, monospace",
    fontSize: 12,
    lineHeight: 1.55,
    color: "#334155",
    maxHeight: 260,
    overflow: "auto",
  },
  attachmentsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginTop: 18,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  attachmentsList: {
    display: "grid",
    gap: 10,
  },
  attachmentItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
  },
  attachmentMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "#64748B",
  },
  previewCard: {
    marginTop: 18,
    borderRadius: 14,
    border: "1px solid #BFDBFE",
    background: "#EFF6FF",
    padding: 16,
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: 800,
    color: "#1D4ED8",
    marginBottom: 10,
  },
  previewBody: {
    whiteSpace: "pre-wrap",
    fontSize: 14,
    lineHeight: 1.65,
    color: "#0F172A",
  },
  previewSpacer: {
    height: 10,
  },
  previewBulletRow: {
    display: "grid",
    gridTemplateColumns: "16px 1fr",
    gap: 8,
    alignItems: "start",
  },
  previewBulletMarker: {
    fontWeight: 800,
  },
  inlineCode: {
    fontFamily: "Consolas, 'Courier New', monospace",
    background: "rgba(15, 23, 42, 0.08)",
    padding: "1px 6px",
    borderRadius: 6,
    fontSize: 12,
  },
  actionRow: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 18,
    flexWrap: "wrap",
  },
  primaryButton: {
    border: "1px solid #1D4ED8",
    background: "#1D4ED8",
    color: "#FFFFFF",
    borderRadius: 10,
    minHeight: 42,
    padding: "0 16px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    borderRadius: 10,
    minHeight: 42,
    padding: "0 16px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  disabledButton: {
    border: "1px solid #CBD5E1",
    background: "#E2E8F0",
    color: "#94A3B8",
    borderRadius: 10,
    minHeight: 42,
    padding: "0 16px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "not-allowed",
  },
  removeButton: {
    border: "1px solid #FCA5A5",
    background: "#FFFFFF",
    color: "#B91C1C",
    borderRadius: 10,
    minHeight: 36,
    padding: "0 12px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
    flexWrap: "wrap",
    alignItems: "center",
  },
  searchInput: {
    minWidth: 280,
    flex: "1 1 320px",
    minHeight: 42,
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    padding: "10px 12px",
    fontSize: 13,
    color: "#0F172A",
  },
  toolbarHint: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700,
  },
  recipientActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  employeeCell: {
    display: "grid",
    gap: 4,
  },
  tableInput: {
    width: "100%",
    minWidth: 160,
    minHeight: 38,
    borderRadius: 8,
    border: "1px solid #CBD5E1",
    padding: "8px 10px",
    fontSize: 12,
    boxSizing: "border-box",
  },
  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 28,
    padding: "0 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    background: "#E0F2FE",
    color: "#075985",
  },
  emptyBox: {
    border: "1px dashed #CBD5E1",
    borderRadius: 12,
    background: "#F8FAFC",
    color: "#64748B",
    padding: 16,
    fontSize: 13,
    textAlign: "center",
  },
};
