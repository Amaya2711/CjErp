import httpClient from "./httpClient";
import type {
  EmpleadoPendienteBuscarRequest,
  EmpleadoPendienteDto,
  EmpleadoPendienteInsertRequest,
  EmpleadoPendienteUpdateRequest,
} from "../models/empleadoPendiente";

export type EmpleadoPendienteAdjuntoUploadResponse = {
  fileName: string;
  fileUrl: string;
  storagePath: string;
};

export async function buscarEmpleadoPendiente(payload: EmpleadoPendienteBuscarRequest) {
  return await httpClient.post<EmpleadoPendienteDto[]>("/administracion/pendientes/buscar", payload);
}

/** PDF con todos los pendientes agrupados por la relación empleado / responsable. */
export async function descargarPdfEmpleadoPendiente(): Promise<Blob> {
  return await httpClient.post<Blob>("/administracion/pendientes/pdf", {}, { responseType: "blob" });
}

export async function insertarEmpleadoPendiente(payload: EmpleadoPendienteInsertRequest) {
  return await httpClient.post("/administracion/pendientes/insertar", payload);
}

export async function actualizarEmpleadoPendiente(payload: EmpleadoPendienteUpdateRequest) {
  return await httpClient.post("/administracion/pendientes/actualizar", payload);
}

export async function subirAdjuntoEmpleadoPendiente(
  formData: FormData
): Promise<EmpleadoPendienteAdjuntoUploadResponse> {
  return await httpClient.post<EmpleadoPendienteAdjuntoUploadResponse>(
    "/administracion/pendientes/upload-archivo",
    formData
  );
}
