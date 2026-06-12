import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  Bot,
  Loader2,
  MessageSquareText,
  Sparkles,
  Table2,
  Trash2,
  WandSparkles,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppStatusMessage from "../../../components/base/AppStatusMessage";
import { consultarIaChat, getIaChatErrorMessage } from "./iachat/services/iaChatService";
import type {
  IaChatMessage,
  IaChatModuleCode,
  IaChatModuleInfo,
  IaChatResponse,
  IaChatChartType,
} from "./iachat/types";

const MODULES: IaChatModuleInfo[] = [
  {
    id: "GASTOS",
    name: "Gastos",
    description: "Consulta segura de planilla, OC, saldos y agrupaciones.",
    keywords: ["pendientes", "combustible", "sitios", "responsable", "este mes"],
    enabled: true,
    statusLabel: "Habilitado",
  },
  {
    id: "ASISTENCIA",
    name: "Asistencia",
    description: "Pendientes de configuracion para marcaciones y turnos.",
    keywords: ["faltas", "tardanzas", "turnos", "ingresos", "salidas"],
    enabled: false,
    statusLabel: "Proximamente",
  },
  {
    id: "LOGISTICO",
    name: "Logistico",
    description: "Pendiente de configuracion para trazabilidad y almacenes.",
    keywords: ["inventario", "movimientos", "almacen", "equipos", "entradas"],
    enabled: false,
    statusLabel: "Pendiente",
  },
  {
    id: "COMPRAS",
    name: "Compras",
    description: "Pendiente de configuracion para solicitudes y OC.",
    keywords: ["orden de compra", "proveedores", "solicitudes", "aprobaciones", "montos"],
    enabled: false,
    statusLabel: "Pendiente",
  },
  {
    id: "RRHH",
    name: "RRHH",
    description: "Pendiente de configuracion para personal y compensaciones.",
    keywords: ["vacaciones", "personal", "legajo", "roles", "asistencia"],
    enabled: false,
    statusLabel: "Pendiente",
  },
  {
    id: "VENTAS",
    name: "Ventas",
    description: "Pendiente de configuracion para ventas y cobranzas.",
    keywords: ["facturacion", "cobranzas", "clientes", "ranking", "periodo"],
    enabled: false,
    statusLabel: "Pendiente",
  },
];

const GASTOS_INITIAL_MESSAGE: IaChatMessage = {
  id: "welcome-gastos",
  role: "assistant",
  title: "Gastos - Asistente seguro",
  text: "Escribe una consulta en lenguaje natural. Yo resolvere si conviene detalle, resumen o grafico sin exponer SQL libre.",
  tone: "info",
};

const PENDING_MESSAGE = (module: IaChatModuleInfo): IaChatMessage => ({
  id: `pending-${module.id}`,
  role: "assistant",
  title: `${module.name} - Proximamente`,
  text: "Este modulo todavia no esta habilitado. Por ahora solo puedes usar Gastos.",
  tone: "info",
});

const COLORS = ["#0F766E", "#2563EB", "#F59E0B", "#7C3AED", "#DC2626", "#16A34A", "#334155"];

function createConversationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `conv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "number") {
    return new Intl.NumberFormat("es-PE", {
      maximumFractionDigits: 2,
    }).format(value);
  }

  if (typeof value === "boolean") {
    return value ? "Si" : "No";
  }

  if (value instanceof Date) {
    return value.toLocaleString("es-PE");
  }

  return String(value);
}

function getModuleBadgeStyles(enabled: boolean): CSSProperties {
  return enabled
    ? {
        background: "#ECFDF5",
        color: "#166534",
        border: "1px solid #A7F3D0",
      }
    : {
        background: "#FFF7ED",
        color: "#9A3412",
        border: "1px solid #FED7AA",
      };
}

function createInitialThread(module: IaChatModuleInfo): IaChatMessage[] {
  return [module.enabled ? GASTOS_INITIAL_MESSAGE : PENDING_MESSAGE(module)];
}

function buildDetailColumns(rows?: Record<string, unknown>[]) {
  if (!rows || rows.length === 0) {
    return [];
  }

  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) {
        columns.push(key);
      }
    }
  }

  return columns;
}

function summarizeNumericEntries(summary?: Record<string, unknown>) {
  if (!summary) {
    return [];
  }

  return Object.entries(summary)
    .filter(([, value]) => typeof value === "number")
    .slice(0, 6)
    .map(([label, value]) => ({
      label,
      value: value as number,
    }));
}

function buildChartData(response: IaChatResponse) {
  if (!response.chart) {
    return [];
  }

  return response.chart.rows.map((row) => {
    const categoryValue = row[response.chart!.categoryField];
    const numericValue = Number(row[response.chart!.valueField] ?? 0);

    return {
      ...row,
      __category: categoryValue ?? "Sin dato",
      __value: Number.isFinite(numericValue) ? numericValue : 0,
    };
  });
}

function getChartTitle(chartType: IaChatChartType) {
  return chartType === "pie"
    ? "Distribucion"
    : chartType === "line"
      ? "Tendencia"
      : "Comparacion";
}

function MessageBubble({ message }: { message: IaChatMessage }) {
  const isAssistant = message.role === "assistant";

  return (
    <div
      style={{
        ...styles.messageRow,
        ...(isAssistant ? styles.messageRowAssistant : styles.messageRowUser),
      }}
    >
      {isAssistant && (
        <div style={{ ...styles.avatar, ...styles.avatarAssistant }}>
          <Bot size={16} />
        </div>
      )}

      <div
        style={{
          ...styles.messageBubble,
          ...(isAssistant ? styles.assistantBubble : styles.userBubble),
          ...(message.tone === "error" ? styles.errorBubble : {}),
        }}
      >
        {message.title && <div style={styles.messageTitle}>{message.title}</div>}
        <div style={styles.messageText}>{message.text}</div>
        {message.response && <StructuredResponseBlock response={message.response} />}
      </div>

      {!isAssistant && (
        <div style={{ ...styles.avatar, ...styles.avatarUser }}>
          <MessageSquareText size={16} />
        </div>
      )}
    </div>
  );
}

function StructuredResponseBlock({ response }: { response: IaChatResponse }) {
  const detailColumns = buildDetailColumns(response.detailRows);
  const numericSummary = summarizeNumericEntries(response.summary);
  const chartData = buildChartData(response);

  return (
    <div style={styles.responseStack}>
      <div style={styles.responseMeta}>
        <span style={styles.metaChip}>Tipo: {response.responseType}</span>
        {typeof response.totalRows === "number" && (
          <span style={styles.metaChip}>Filas: {response.totalRows}</span>
        )}
      </div>

      {response.interpretedFilters && Object.keys(response.interpretedFilters).length > 0 && (
        <div style={styles.sectionBox}>
          <div style={styles.sectionBoxTitle}>Filtros interpretados</div>
          <div style={styles.filterGrid}>
            {Object.entries(response.interpretedFilters).map(([key, value]) => (
              <div key={key} style={styles.filterItem}>
                <span style={styles.filterLabel}>{key}</span>
                <span style={styles.filterValue}>{formatValue(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {numericSummary.length > 0 && (
        <div style={styles.kpiGrid}>
          {numericSummary.map((item) => (
            <div key={item.label} style={styles.kpiCard}>
              <div style={styles.kpiLabel}>{item.label}</div>
              <div style={styles.kpiValue}>{formatValue(item.value)}</div>
            </div>
          ))}
        </div>
      )}

      {response.chart && chartData.length > 0 && (
        <ChartBlock response={response} data={chartData} />
      )}

      {detailColumns.length > 0 && response.detailRows && response.detailRows.length > 0 && (
        <DetailTable columns={detailColumns} rows={response.detailRows} />
      )}
    </div>
  );
}

function DetailTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
}) {
  return (
    <div style={styles.tableShell}>
      <div style={styles.sectionBoxTitle}>
        Detalle
      </div>
      <div style={styles.tableScroll}>
        <table style={styles.table}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} style={styles.tableHead}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {columns.map((column) => (
                  <td key={`${rowIndex}-${column}`} style={styles.tableCell}>
                    {formatValue(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChartBlock({
  response,
  data,
}: {
  response: IaChatResponse;
  data: Array<Record<string, unknown> & { __category: unknown; __value: number }>;
}) {
  if (!response.chart) {
    return null;
  }

  return (
    <div style={styles.sectionBox}>
      <div style={styles.sectionBoxTitle}>
        {response.chart.title}
      </div>
      <div style={styles.chartShell}>
        <ResponsiveContainer width="100%" height={320}>
          {response.chart.chartType === "line" ? (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="__category" stroke="#64748B" tick={{ fontSize: 12 }} />
              <YAxis stroke="#64748B" tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="__value" stroke="#0F766E" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          ) : response.chart.chartType === "pie" ? (
            <PieChart>
              <Tooltip />
              <Legend />
              <Pie
                data={data}
                dataKey="__value"
                nameKey="__category"
                outerRadius={110}
                innerRadius={45}
                paddingAngle={2}
              >
                {data.map((_, index) => (
                  <Cell key={`pie-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="__category" stroke="#64748B" tick={{ fontSize: 12 }} />
              <YAxis stroke="#64748B" tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="__value" fill="#2563EB" radius={[8, 8, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <div style={styles.chartHint}>
        {getChartTitle(response.chart.chartType)}: {response.chart.categoryField} vs {response.chart.valueField}
      </div>
    </div>
  );
}

export default function IaChatPage() {
  const [selectedModuleId, setSelectedModuleId] = useState<IaChatModuleCode>("GASTOS");
  const [threads, setThreads] = useState<Record<string, IaChatMessage[]>>({
    GASTOS: createInitialThread(MODULES[0]),
  });
  const [conversationIds, setConversationIds] = useState<Record<string, string>>({
    GASTOS: createConversationId(),
  });
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const selectedModule = useMemo(
    () => MODULES.find((module) => module.id === selectedModuleId) ?? MODULES[0],
    [selectedModuleId]
  );

  const currentMessages = threads[selectedModule.id] ?? createInitialThread(selectedModule);
  const isEnabled = selectedModule.enabled;
  const canSend = isEnabled && !loading && question.trim().length > 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [currentMessages, loading, selectedModuleId]);

  useEffect(() => {
    if (!threads[selectedModule.id]) {
      setThreads((current) => ({
        ...current,
        [selectedModule.id]: createInitialThread(selectedModule),
      }));
    }

    if (!conversationIds[selectedModule.id]) {
      setConversationIds((current) => ({
        ...current,
        [selectedModule.id]: createConversationId(),
      }));
    }
  }, [selectedModule, conversationIds, threads]);

  const updateCurrentThread = (updater: (messages: IaChatMessage[]) => IaChatMessage[]) => {
    setThreads((current) => ({
      ...current,
      [selectedModule.id]: updater(current[selectedModule.id] ?? createInitialThread(selectedModule)),
    }));
  };

  const handleModuleChange = (module: IaChatModuleInfo) => {
    setSelectedModuleId(module.id);
    setErrorMessage(null);
    setQuestion("");

    setThreads((current) => {
      if (current[module.id]) {
        return current;
      }

      return {
        ...current,
        [module.id]: createInitialThread(module),
      };
    });

    setConversationIds((current) => {
      if (current[module.id]) {
        return current;
      }

      return {
        ...current,
        [module.id]: createConversationId(),
      };
    });
  };

  const handleKeywordClick = (keyword: string) => {
    setQuestion((current) => (current.trim().length > 0 ? `${current} ${keyword}` : keyword));
  };

  const clearConversation = () => {
    setErrorMessage(null);
    setThreads((current) => ({
      ...current,
      [selectedModule.id]: createInitialThread(selectedModule),
    }));
    setConversationIds((current) => ({
      ...current,
      [selectedModule.id]: createConversationId(),
    }));
  };

  const sendQuestion = async () => {
    const trimmedQuestion = question.trim();

    if (!isEnabled) {
      updateCurrentThread((messages) => [
        ...messages,
        {
          id: `pending-${Date.now()}`,
          role: "assistant",
          title: `${selectedModule.name} - Proximamente`,
          text: "Este modulo todavia no esta habilitado. Solo Gastos responde consultas por ahora.",
          tone: "info",
        },
      ]);
      return;
    }

    if (!trimmedQuestion || loading) {
      return;
    }

    const userMessage: IaChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: trimmedQuestion,
    };

    updateCurrentThread((messages) => [...messages, userMessage]);
    setLoading(true);
    setErrorMessage(null);
    setQuestion("");

    try {
      const response = await consultarIaChat({
        module: selectedModule.id,
        question: trimmedQuestion,
        conversationId: conversationIds[selectedModule.id] ?? null,
      });

      if (!response) {
        throw new Error("El asistente no devolvio una respuesta valida.");
      }

      const assistantMessage: IaChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        title: response.responseType === "conversation"
          ? "Respuesta"
          : response.responseType === "detail"
            ? "Detalle"
            : response.responseType === "summary"
              ? "Resumen"
              : "Grafico",
        text: response.answer,
        response,
        tone: response.success ? "success" : "error",
      };

      updateCurrentThread((messages) => [...messages, assistantMessage]);
    } catch (error) {
      const friendlyMessage = getIaChatErrorMessage(error);
      setErrorMessage(friendlyMessage);
      updateCurrentThread((messages) => [
        ...messages,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          title: "No se pudo completar la consulta",
          text: friendlyMessage,
          tone: "error",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppPage
      title="IA Chat Administrativo"
      actions={
        <div style={styles.pageActions}>
          <span style={styles.pageTag}>Reportes / Administrativo</span>
          <span style={styles.connectionPill}>
            <Sparkles size={14} />
            <span>{isEnabled ? "Conexion segura activa" : "Pendiente de configuracion"}</span>
          </span>
        </div>
      }
      style={styles.page}
    >
      <div style={styles.shell}>
        <AppCard style={styles.sidebarCard}>
          <div style={styles.sidebarHeader}>
            <div style={styles.assistantIcon}>
              <WandSparkles size={20} />
            </div>
            <div>
              <h2 style={styles.sidebarTitle}>Asistente del ERP</h2>
              <p style={styles.sidebarSubtitle}>Selecciona un modulo y conversa con filtros seguros.</p>
            </div>
          </div>

          <div style={styles.moduleList}>
            {MODULES.map((module) => {
              const selected = module.id === selectedModule.id;

              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => handleModuleChange(module)}
                  style={{
                    ...styles.moduleButton,
                    ...(selected ? styles.moduleButtonActive : {}),
                  }}
                >
                  <div style={styles.moduleIcon}>{module.name.slice(0, 1)}</div>
                  <div style={styles.moduleInfo}>
                    <div style={styles.moduleTopRow}>
                      <span style={styles.moduleName}>{module.name}</span>
                      <span style={{ ...styles.moduleBadge, ...getModuleBadgeStyles(module.enabled) }}>
                        {module.statusLabel}
                      </span>
                    </div>
                    <span style={styles.moduleDescription}>{module.description}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </AppCard>

        <div style={styles.chatColumn}>
          <AppStatusMessage tone={isEnabled ? "success" : "info"} style={styles.statusBanner}>
            {isEnabled
              ? "Gastos esta habilitado con Claude + SQL Server y solo usa herramientas de lectura."
              : "Este modulo aun no esta habilitado. Selecciona Gastos para ejecutar consultas reales."}
          </AppStatusMessage>

          {errorMessage && (
            <AppStatusMessage tone="error" style={styles.errorBanner}>
              {errorMessage}
            </AppStatusMessage>
          )}

          <AppCard style={styles.chatCard}>
            <div style={styles.toolbar}>
              <span style={styles.moduleChip}>Modulo: {selectedModule.name}</span>

              <div style={styles.toolbarRight}>
                <button type="button" onClick={clearConversation} style={styles.secondaryButton}>
                  <Trash2 size={16} />
                  Limpiar conversacion
                </button>
              </div>
            </div>

            <div style={styles.messagesPane}>
              {currentMessages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {loading && (
                <div style={styles.loadingRow}>
                  <div style={styles.avatarAssistant}>
                    <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                  </div>
                  <div style={styles.loadingBubble}>
                    <div style={styles.loadingTitle}>Analizando tu consulta...</div>
                    <div style={styles.loadingText}>Claude esta interpretando la pregunta y validando la herramienta correcta.</div>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div style={styles.composer}>
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendQuestion();
                  }
                }}
                rows={4}
                style={{
                  ...styles.composerInput,
                  ...(isEnabled ? {} : styles.composerDisabled),
                }}
                placeholder={
                  isEnabled
                    ? "Escribe tu consulta sobre Gastos..."
                    : "Selecciona Gastos para escribir una consulta."
                }
                disabled={loading || !isEnabled}
              />

              <button
                type="button"
                onClick={() => void sendQuestion()}
                disabled={!canSend}
                style={{
                  ...styles.sendButton,
                  ...(canSend ? {} : styles.sendButtonDisabled),
                }}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                    Enviando
                  </>
                ) : (
                  <>
                    <MessageSquareText size={16} />
                    Enviar
                  </>
                )}
              </button>
            </div>
          </AppCard>

          <AppCard style={styles.footerCard}>
            <div style={styles.footerHeader}>
              <div style={styles.footerTitle}>
                <Table2 size={16} />
                Palabras clave sugeridas
              </div>
              <div style={styles.footerSubtitle}>
                {selectedModule.enabled ? "Usalas como guia para consultas frecuentes." : "Disponibles como referencia para la siguiente fase."}
              </div>
            </div>

            <div style={styles.keywordWrap}>
              {selectedModule.keywords.map((keyword) => (
                <button
                  key={keyword}
                  type="button"
                  onClick={() => handleKeywordClick(keyword)}
                  style={styles.keywordChip}
                >
                  {keyword}
                </button>
              ))}
            </div>
          </AppCard>
        </div>
      </div>
    </AppPage>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    padding: 20,
    background:
      "radial-gradient(circle at top left, rgba(15,118,110,0.12), transparent 28%), radial-gradient(circle at top right, rgba(37,99,235,0.10), transparent 25%), linear-gradient(180deg, #F8FAFC 0%, #EEF2FF 100%)",
  },
  pageActions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  pageTag: {
    padding: "8px 14px",
    borderRadius: 999,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    fontWeight: 700,
    fontSize: 13,
  },
  connectionPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 14px",
    borderRadius: 999,
    background: "#ECFDF5",
    border: "1px solid #BBF7D0",
    color: "#166534",
    fontWeight: 800,
    fontSize: 13,
  },
  shell: {
    display: "grid",
    gridTemplateColumns: "320px minmax(0, 1fr)",
    gap: 18,
  },
  sidebarCard: {
    position: "sticky",
    top: 20,
    alignSelf: "start",
    border: "1px solid #E2E8F0",
    background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
  },
  sidebarHeader: {
    display: "flex",
    gap: 14,
    alignItems: "center",
    marginBottom: 18,
  },
  assistantIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    background: "linear-gradient(135deg, #0F766E 0%, #2563EB 100%)",
    color: "#FFFFFF",
    display: "grid",
    placeItems: "center",
    boxShadow: "0 12px 24px rgba(15,118,110,0.22)",
  },
  sidebarTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
    color: "#0F172A",
  },
  sidebarSubtitle: {
    margin: "4px 0 0",
    fontSize: 13,
    color: "#475569",
    lineHeight: 1.5,
  },
  moduleList: {
    display: "grid",
    gap: 12,
  },
  moduleButton: {
    width: "100%",
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    padding: 14,
    borderRadius: 18,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    cursor: "pointer",
    textAlign: "left",
    transition: "transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease",
  },
  moduleButtonActive: {
    borderColor: "#0F766E",
    boxShadow: "0 16px 28px rgba(15,118,110,0.10)",
    transform: "translateY(-1px)",
  },
  moduleIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    background: "linear-gradient(135deg, #0F172A 0%, #334155 100%)",
    color: "#FFFFFF",
    display: "grid",
    placeItems: "center",
    fontWeight: 800,
    flexShrink: 0,
  },
  moduleInfo: {
    minWidth: 0,
    display: "grid",
    gap: 6,
    flex: 1,
  },
  moduleTopRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  moduleName: {
    fontWeight: 800,
    color: "#0F172A",
  },
  moduleBadge: {
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
  },
  moduleDescription: {
    fontSize: 12,
    color: "#475569",
    lineHeight: 1.45,
  },
  chatColumn: {
    display: "grid",
    gap: 16,
  },
  statusBanner: {
    borderRadius: 18,
    padding: 14,
  },
  errorBanner: {
    borderRadius: 18,
    padding: 14,
  },
  chatCard: {
    border: "1px solid #E2E8F0",
    background: "linear-gradient(180deg, #FFFFFF 0%, #FAFBFF 100%)",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
    flexWrap: "wrap",
  },
  toolbarRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  moduleChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 999,
    background: "#0F172A",
    color: "#FFFFFF",
    fontWeight: 700,
    fontSize: 12,
  },
  secondaryButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    fontWeight: 700,
    cursor: "pointer",
  },
  messagesPane: {
    display: "grid",
    gap: 14,
    maxHeight: "62vh",
    overflowY: "auto",
    paddingRight: 6,
    marginBottom: 14,
  },
  messageRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
  },
  messageRowAssistant: {
    justifyContent: "flex-start",
  },
  messageRowUser: {
    justifyContent: "flex-end",
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  avatarAssistant: {
    background: "#0F766E",
    color: "#FFFFFF",
  },
  avatarUser: {
    background: "#2563EB",
    color: "#FFFFFF",
  },
  assistantBubble: {
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
  },
  userBubble: {
    background: "linear-gradient(135deg, #0F766E 0%, #0EA5E9 100%)",
    border: "1px solid rgba(15,118,110,0.2)",
    color: "#FFFFFF",
  },
  errorBubble: {
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    color: "#991B1B",
  },
  messageBubble: {
    maxWidth: "min(860px, 88%)",
    borderRadius: 20,
    padding: 16,
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
  },
  messageTitle: {
    fontWeight: 800,
    marginBottom: 8,
    color: "inherit",
  },
  messageText: {
    whiteSpace: "pre-wrap",
    lineHeight: 1.6,
    color: "inherit",
    fontSize: 14,
  },
  responseStack: {
    marginTop: 14,
    display: "grid",
    gap: 12,
  },
  responseMeta: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  metaChip: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "#FFFFFF",
    color: "#334155",
    border: "1px solid #E2E8F0",
    fontSize: 12,
    fontWeight: 700,
  },
  sectionBox: {
    borderRadius: 18,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    padding: 14,
  },
  sectionBoxTitle: {
    fontWeight: 800,
    color: "#0F172A",
    marginBottom: 10,
  },
  filterGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
  },
  filterItem: {
    borderRadius: 14,
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
    padding: 10,
  },
  filterLabel: {
    display: "block",
    fontSize: 11,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: 6,
    fontWeight: 800,
  },
  filterValue: {
    fontSize: 13,
    color: "#0F172A",
    fontWeight: 700,
    wordBreak: "break-word",
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 10,
  },
  kpiCard: {
    borderRadius: 16,
    border: "1px solid #E2E8F0",
    background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
    padding: 14,
  },
  kpiLabel: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 8,
    fontWeight: 700,
  },
  kpiValue: {
    fontSize: 20,
    color: "#0F172A",
    fontWeight: 900,
  },
  tableShell: {
    borderRadius: 18,
    border: "1px solid #E2E8F0",
    background: "#FFFFFF",
    padding: 14,
  },
  tableScroll: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 720,
  },
  tableHead: {
    textAlign: "left",
    padding: "10px 12px",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#475569",
    borderBottom: "1px solid #E2E8F0",
    background: "#F8FAFC",
    whiteSpace: "nowrap",
  },
  tableCell: {
    padding: "10px 12px",
    borderBottom: "1px solid #E2E8F0",
    color: "#0F172A",
    fontSize: 13,
    verticalAlign: "top",
  },
  chartShell: {
    width: "100%",
    height: 320,
  },
  chartHint: {
    marginTop: 8,
    fontSize: 12,
    color: "#64748B",
    fontWeight: 700,
  },
  footerCard: {
    border: "1px solid #E2E8F0",
    background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
  },
  footerHeader: {
    display: "grid",
    gap: 6,
    marginBottom: 14,
  },
  footerTitle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 800,
    color: "#0F172A",
  },
  footerSubtitle: {
    color: "#64748B",
    fontSize: 13,
  },
  keywordWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  },
  keywordChip: {
    padding: "10px 14px",
    borderRadius: 999,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    fontWeight: 700,
    cursor: "pointer",
    transition: "transform 120ms ease, box-shadow 120ms ease",
  },
  composer: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 12,
    alignItems: "stretch",
  },
  composerInput: {
    width: "100%",
    minHeight: 112,
    borderRadius: 18,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    padding: 14,
    fontSize: 14,
    color: "#0F172A",
    resize: "vertical",
    outline: "none",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
  },
  composerDisabled: {
    background: "#F8FAFC",
    color: "#94A3B8",
  },
  sendButton: {
    minWidth: 140,
    borderRadius: 18,
    border: "none",
    background: "linear-gradient(135deg, #0F766E 0%, #2563EB 100%)",
    color: "#FFFFFF",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "0 18px",
    boxShadow: "0 14px 24px rgba(15,118,110,0.18)",
  },
  sendButtonDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
    boxShadow: "none",
  },
  loadingRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
  },
  loadingBubble: {
    borderRadius: 20,
    padding: 16,
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
    maxWidth: "min(860px, 88%)",
  },
  loadingTitle: {
    fontWeight: 800,
    color: "#0F172A",
    marginBottom: 6,
  },
  loadingText: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 1.55,
  },
};
