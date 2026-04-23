import httpClient from "../../../api/httpClient";

const BASE_URL = "/perfiles";

export interface CommandResult {
  message?: string;
  idPerfil?: number;
}

export interface PerfilDto {
  idPerfil: number;
  nombrePerfil: string;
  descripcion?: string;
  esActivo?: boolean;
  fechaCreacion?: string | null;
}

export interface GuardarPerfilRequest {
  nombrePerfil: string;
  descripcion: string;
  esActivo: boolean;
}

function extraerArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

export const perfilesService = {
  async listarPerfiles(): Promise<PerfilDto[]> {
    const data = await httpClient.get<PerfilDto[]>(BASE_URL);
    return extraerArray<PerfilDto>(data);
  },

  async crearPerfil(payload: GuardarPerfilRequest): Promise<CommandResult> {
    return await httpClient.post<CommandResult>(BASE_URL, payload);
  },

  async actualizarPerfil(
    idPerfil: number,
    payload: GuardarPerfilRequest
  ): Promise<CommandResult> {
    return await httpClient.put<CommandResult>(`${BASE_URL}/${idPerfil}`, payload);
  },

  async eliminarPerfil(idPerfil: number): Promise<CommandResult> {
    return await httpClient.delete<CommandResult>(`${BASE_URL}/${idPerfil}`);
  },
};
