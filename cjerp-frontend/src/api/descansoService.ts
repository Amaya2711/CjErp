import httpClient from "./httpClient";

const BASE_URL = "/admin/descanso";

/** Etapas (IdEstado): 97 = 1era aprobación, 98 = 2da, 99 = 3era, 100 = 4ta, 5 = aprobado final, 0 = rechazado. */
export const ESTADO_DESCANSO = {
  PRIMERA: 97,
  SEGUNDA: 98,
  TERCERA: 99,
  CUARTA: 100,
  APROBADO: 5,
  RECHAZADO: 0,
} as const;

export type DescansoEmpleado = {
  idEmpleado: number;
  nombreEmpleado?: string | null;
  nroDocumento?: string | null;
};

export type Descanso = {
  idEmpleadoCj: number;
  idEstado: number;
  estado?: string | null;
  nombreEmpleado?: string | null;
  nroDocumento?: string | null;
  fechaInicio: string;
  fechaFin: string;
  dias: number;
  usuario?: string | null;
  fechaCreacion?: string | null;
  ruta?: string | null;
  primerValidador?: string | null;
  segundoValidador?: string | null;
  tercerValidador?: string | null;
  fechaPre?: string | null;
  fechaPrimera?: string | null;
  fechaAutorizado?: string | null;
};

export type DescansoSolicitudKey = {
  idEmpleadoCj: number;
  fechaInicio: string;
  fechaFin: string;
  /** Etapa actual (97, 98, 99 o 100); solo se usa al aprobar. */
  idEstadoActual: number;
};

export type DescansoAccionResultado = {
  idEmpleadoCj: number;
  fechaInicio: string;
  fechaFin: string;
  procesado: boolean;
  mensaje?: string | null;
  correoEnviado?: boolean | null;
  correoMensaje?: string | null;
};

export type DescansoAdjuntoResultado = {
  fileName: string;
  fileUrl: string;
  storagePath: string;
};

function extraerArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function listarEmpleadosDescanso(): Promise<DescansoEmpleado[]> {
  return extraerArray<DescansoEmpleado>(await httpClient.get<DescansoEmpleado[]>(`${BASE_URL}/empleados`));
}

export async function listarDescansos(params: {
  idEstado?: number;
  idEmpleadoCj?: number;
  fechaInicial?: string;
  fechaFinal?: string;
} = {}): Promise<Descanso[]> {
  return extraerArray<Descanso>(await httpClient.get<Descanso[]>(BASE_URL, { params }));
}

/** Sube el documento sustento a SharePoint; devuelve la ruta que se registra en la solicitud. */
export async function subirAdjuntoDescanso(archivo: File, idEmpleadoCj?: number): Promise<DescansoAdjuntoResultado> {
  const formData = new FormData();
  formData.append("archivo", archivo);
  if (idEmpleadoCj) {
    formData.append("idEmpleadoCj", String(idEmpleadoCj));
  }
  return await httpClient.post<DescansoAdjuntoResultado>(`${BASE_URL}/adjunto`, formData);
}

export async function registrarDescanso(payload: {
  idEmpleadoCj: number;
  fechaInicio: string;
  fechaFin: string;
  ruta: string;
}): Promise<{ diasRegistrados: number }> {
  return await httpClient.post<{ diasRegistrados: number }>(BASE_URL, payload);
}

export async function aprobarDescansos(solicitudes: DescansoSolicitudKey[]): Promise<DescansoAccionResultado[]> {
  return extraerArray<DescansoAccionResultado>(
    await httpClient.post<DescansoAccionResultado[]>(`${BASE_URL}/aprobar`, { solicitudes })
  );
}

export async function rechazarDescansos(solicitudes: DescansoSolicitudKey[]): Promise<DescansoAccionResultado[]> {
  return extraerArray<DescansoAccionResultado>(
    await httpClient.post<DescansoAccionResultado[]>(`${BASE_URL}/rechazar`, { solicitudes })
  );
}

export async function descargarPdfDescanso(params: {
  idEmpleadoCj: number;
  fechaInicio: string;
  fechaFin: string;
}): Promise<Blob> {
  return await httpClient.get<Blob>(`${BASE_URL}/pdf`, { params, responseType: "blob" });
}
