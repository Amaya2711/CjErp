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
