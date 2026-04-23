import httpClient from "../../../api/httpClient";

const PERFILES_BASE_URL = "/perfiles";
const ROLES_BASE_URL = "/roles";

export interface CommandResult {
  message?: string;
  idRol?: number;
}

export interface RolDto {
  idRol: number;
  idPerfil?: number;
  nombreRol: string;
  descripcion?: string;
  estado?: boolean;
  esActivo?: boolean;
  fechaCreacion?: string;
}

export interface CrearRolRequest {
  nombreRol: string;
  descripcion: string;
  esActivo: boolean;
}

export interface ActualizarRolRequest {
  nombreRol: string;
  descripcion: string;
  esActivo: boolean;
}

function extraerArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

export const rolesService = {
  async listarRolesPorPerfil(idPerfil: number): Promise<RolDto[]> {
    const data = await httpClient.get<RolDto[]>(
      `${PERFILES_BASE_URL}/${idPerfil}/roles`
    );

    return extraerArray<RolDto>(data);
  },

  async listarRoles(): Promise<RolDto[]> {
    const data = await httpClient.get<RolDto[]>(ROLES_BASE_URL);
    return extraerArray<RolDto>(data);
  },

  async crearRol(payload: CrearRolRequest): Promise<CommandResult> {
    return await httpClient.post<CommandResult>(ROLES_BASE_URL, payload);
  },

  async actualizarRol(
    idRol: number,
    payload: ActualizarRolRequest
  ): Promise<CommandResult> {
    return await httpClient.put<CommandResult>(`${ROLES_BASE_URL}/${idRol}`, payload);
  },

  async eliminarRol(idRol: number): Promise<CommandResult> {
    return await httpClient.delete<CommandResult>(`${ROLES_BASE_URL}/${idRol}`);
  },
};
