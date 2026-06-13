export type IaChatModuleCode =
  | "GASTOS"
  | "ASISTENCIA"
  | "LOGISTICO"
  | "COMPRAS"
  | "RRHH"
  | "VENTAS";

export type IaChatResponseType = "conversation" | "detail" | "summary" | "chart";
export type IaChatChartType = "bar" | "line" | "pie";
export type IaChatPresentationMode = "auto" | "executive" | "detail";

export type IaChatRequest = {
  module: IaChatModuleCode;
  question: string;
  conversationId: string | null;
  presentationMode?: IaChatPresentationMode | null;
  attachment?: IaChatImageAttachment | null;
};

export type IaChatImageAttachment = {
  fileName?: string | null;
  mimeType: string;
  base64Data: string;
  previewUrl?: string | null;
};

export type IaChatResponse = {
  success: boolean;
  module: IaChatModuleCode;
  answer: string;
  responseType: IaChatResponseType;
  interpretedFilters?: Record<string, unknown>;
  detailRows?: Record<string, unknown>[];
  summary?: Record<string, unknown>;
  chart?: {
    chartType: IaChatChartType;
    title: string;
    categoryField: string;
    valueField: string;
    rows: Record<string, unknown>[];
  };
  totalRows?: number;
  errorMessage?: string;
};

export type IaChatModuleInfo = {
  id: IaChatModuleCode;
  name: string;
  description: string;
  keywords: string[];
  enabled: boolean;
  statusLabel: string;
};

export type IaChatMessage = {
  id: string;
  role: "assistant" | "user";
  title?: string;
  text: string;
  response?: IaChatResponse;
  tone?: "default" | "error" | "success" | "info";
};
