import httpClient from "../../../api/httpClient";

const PERFILES_BASE_URL = "/perfiles";
const ROLES_BASE_URL = "/roles";

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

export const rolesService = {
  async listarRolesPorPerfil(idPerfil: number): Promise<RolDto[]> {
    const response = await httpClient.get(`${PERFILES_BASE_URL}/${idPerfil}/roles`);
    return response.data ?? [];
  },

  async listarRoles(): Promise<RolDto[]> {
    const response = await httpClient.get(ROLES_BASE_URL);
    return response.data ?? [];
  },

  async crearRol(payload: CrearRolRequest) {
    const response = await httpClient.post(ROLES_BASE_URL, payload);
    return response.data;
  },

  async actualizarRol(idRol: number, payload: ActualizarRolRequest) {
    const response = await httpClient.put(`${ROLES_BASE_URL}/${idRol}`, payload);
    return response.data;
  },

  async eliminarRol(idRol: number) {
    const response = await httpClient.delete(`${ROLES_BASE_URL}/${idRol}`);
    return response.data;
  },
};
