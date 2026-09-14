import httpClient from "../../../api/httpClient";
import type { CatalogEntry, CatalogForm, KnowledgePayload, KnowledgeMemory, MemoryHistory } from "./types";

export const listKnowledge = () => httpClient.get<KnowledgePayload>("/ai/knowledge");
export const getKnowledge = (id: number) => httpClient.get<KnowledgeMemory>(`/ai/knowledge/${id}`);
export const updateKnowledge = (id: number, data: Pick<KnowledgeMemory, "contenido" | "modulo" | "clave" | "importancia" | "confianza" | "observacionRevision">) => httpClient.put<KnowledgeMemory>(`/ai/knowledge/${id}`, data);
export const knowledgeAction = (id: number, action: "approve" | "observe" | "reject" | "activate" | "deactivate", motivo?: string | null) => httpClient.post<KnowledgeMemory>(`/ai/knowledge/${id}/${action}`, { motivo });
export const getMemoryHistory = (id: number) => httpClient.get<MemoryHistory[]>(`/ai/knowledge/${id}/history`);
export const listCatalog = () => httpClient.get<CatalogEntry[]>("/ai/knowledge/catalog");
export const createCatalog = (data: CatalogForm) => httpClient.post<CatalogEntry>("/ai/knowledge/catalog", data);
export const updateCatalog = (id: number, data: CatalogForm) => httpClient.put<CatalogEntry>(`/ai/knowledge/catalog/${id}`, data);
export const catalogAction = (id: number, action: "activate" | "deactivate") => httpClient.post<void>(`/ai/knowledge/catalog/${id}/${action}`);
