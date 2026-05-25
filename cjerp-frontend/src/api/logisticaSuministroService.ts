import httpClient from "./httpClient";
import type {
  LogisticaSuministroBuscarRequest,
  LogisticaSuministroDto,
  LogisticaSuministroInsertRequest,
  LogisticaSuministroKpis,
  LogisticaSuministroUpdateRequest,
} from "../models/logisticaSuministro";

export type LogisticaSuministroUploadResponse = {
  fileName: string;
  fileUrl: string;
  storagePath: string;
};

export async function buscarLogisticaSuministro(payload: LogisticaSuministroBuscarRequest) {
  return await httpClient.post<LogisticaSuministroDto[]>("/operacion/suministro/buscar", payload);
}

export async function obtenerKpisLogisticaSuministro(payload: LogisticaSuministroBuscarRequest) {
  return await httpClient.post<LogisticaSuministroKpis>("/operacion/suministro/kpis", payload);
}

export async function insertarLogisticaSuministro(payload: LogisticaSuministroInsertRequest) {
  return await httpClient.post<{ idSuministro: number; correlativo: number }>("/operacion/suministro/insertar", payload);
}

export async function actualizarLogisticaSuministro(payload: LogisticaSuministroUpdateRequest) {
  return await httpClient.post<unknown>("/operacion/suministro/actualizar", payload);
}

export async function uploadImagenLogisticaSuministro(file: File, context?: {
  correlativo?: string;
  idSite?: string;
  comentario?: string;
}) {
  const formData = new FormData();
  formData.append("archivo", file);

  if (context?.correlativo?.trim()) {
    formData.append("correlativo", context.correlativo.trim());
  }

  if (context?.idSite?.trim()) {
    formData.append("idSite", context.idSite.trim());
  }

  if (context?.comentario?.trim()) {
    formData.append("comentario", context.comentario.trim());
  }

  return await httpClient.post<LogisticaSuministroUploadResponse>(
    "/operacion/suministro/upload-imagen",
    formData
  );
}
