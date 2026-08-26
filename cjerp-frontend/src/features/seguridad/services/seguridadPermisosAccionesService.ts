import httpClient from "../../../api/httpClient";

export type TipoElementoPermiso = "menu" | "tab" | "button" | "system";

export interface PermisoAccionDto {
  idPermisoAccion: number;
  rutaPagina: string;
  nombrePagina?: string | null;
  claveAccion: string;
  etiqueta?: string | null;
  tipoElemento: TipoElementoPermiso | string;
  idRol?: number | null;
  nombreRol?: string | null;
  idEmpleado?: number | null;
  nombreEmpleado?: string | null;
  puedeVer: boolean;
  puedeEjecutar: boolean;
  esActivo: boolean;
  usuarioCreacion?: string | null;
  fechaCreacion?: string | null;
  usuarioModificacion?: string | null;
  fechaModificacion?: string | null;
}

export interface GuardarPermisoAccionRequest {
  idPermisoAccion?: number | null;
  rutaPagina: string;
  claveAccion: string;
  etiqueta?: string;
  tipoElemento: TipoElementoPermiso;
  idRol?: number | null;
  idEmpleado?: number | null;
  puedeVer: boolean;
  puedeEjecutar: boolean;
  esActivo: boolean;
  usuario?: string;
}

export interface FiltroPermisosAccion {
  rutaPagina?: string;
  idRol?: number;
  idEmpleado?: number;
  tipoElemento?: string;
}

const BASE_URL = "/seguridad-permisos-acciones";

function extraerArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

export const seguridadPermisosAccionesService = {
  async listar(filtro: FiltroPermisosAccion = {}): Promise<PermisoAccionDto[]> {
    const response = await httpClient.get<PermisoAccionDto[]>(BASE_URL, { params: filtro });
    return extraerArray<PermisoAccionDto>(response);
  },

  async obtener(idPermisoAccion: number): Promise<PermisoAccionDto | null> {
    const response = await httpClient.get<PermisoAccionDto>(`${BASE_URL}/${idPermisoAccion}`);
    return response ?? null;
  },

  async guardar(payload: GuardarPermisoAccionRequest): Promise<{ idPermisoAccion?: number; message?: string }> {
    return await httpClient.post(`${BASE_URL}`, payload);
  },

  async actualizar(
    idPermisoAccion: number,
    payload: GuardarPermisoAccionRequest
  ): Promise<{ idPermisoAccion?: number; message?: string }> {
    return await httpClient.put(`${BASE_URL}/${idPermisoAccion}`, payload);
  },

  async eliminar(idPermisoAccion: number): Promise<{ idPermisoAccion?: number; message?: string }> {
    return await httpClient.delete(`${BASE_URL}/${idPermisoAccion}`);
  },
};
