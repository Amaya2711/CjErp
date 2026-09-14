import type { AxiosRequestConfig } from "axios";
import httpClient from "../../../api/httpClient";
import type {
  AiChatRequest,
  AiChatResponse,
  AiConversation,
  AiConversationDetail,
  AiStatus,
} from "../types";

export function getStatus(signal?: AbortSignal) {
  return httpClient.get<AiStatus>("/ai/status", { signal } satisfies AxiosRequestConfig);
}

export function sendMessage(request: AiChatRequest, signal?: AbortSignal) {
  return httpClient.post<AiChatResponse>("/ai/chat", request, { signal } satisfies AxiosRequestConfig);
}

export function getConversations(signal?: AbortSignal) {
  return httpClient.get<AiConversation[]>("/ai/conversations", { signal } satisfies AxiosRequestConfig);
}

export function getConversation(id: string, signal?: AbortSignal) {
  return httpClient.get<AiConversationDetail>(`/ai/conversations/${encodeURIComponent(id)}`, { signal } satisfies AxiosRequestConfig);
}

export function deleteConversation(id: string) {
  return httpClient.delete<void>(`/ai/conversations/${encodeURIComponent(id)}`);
}
