export type AiVisualizationType = "none" | "table" | "bar" | "line" | "pie" | "kpi" | "comparison";

export type AiChatRequest = {
  message: string;
  conversationId?: string;
  /** GUID por petición: reenviar el MISMO valor al reintentar evita mensajes duplicados. */
  clientMessageId?: string;
};

export type AiChatResponse = {
  answer: string;
  analysisType: string;
  suggestedVisualization: AiVisualizationType | string;
  data: Array<Record<string, unknown>>;
  queriesExecuted: number;
  executionTimeMs: number;
  warnings: string[];
};

export type AiConversation = {
  idConversacion: string;
  /** Nombre de usuario (dbo.Usuario.IdUsuario), texto. */
  idUsuario: string;
  titulo: string | null;
  fechaCreacion: string;
  fechaUltimoMensaje: string;
  idActivo: boolean;
};

export type AiMessage = {
  role: "user" | "assistant" | "system" | "tool" | string;
  content: string | null;
  fecha?: string;
};

export type AiConversationDetail = {
  conversation: AiConversation;
  messages: AiMessage[];
};

export type AiStatus = {
  enabled: boolean;
  available: boolean;
};
