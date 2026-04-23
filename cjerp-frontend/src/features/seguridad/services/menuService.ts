import httpClient from "../../../api/httpClient";

export interface MenuDto {
  idMenu: number;
  idMenuPadre?: number | null;
  nombreMenu: string;
  ruta?: string | null;
  icono?: string | null;
  ordenMenu: number;
  nivelMenu?: number | null;
  codigoMenu?: string | null;
  esVisible?: boolean;
  esActivo?: boolean;
  acceso?: number | boolean | null;
}

export interface ExisteUsuarioPerfilRequest {
  idUsuario: string;
  idPerfil: number;
}

export interface GuardarUsuarioPerfilRequest {
  idUsuario: string;
  idPerfil: number;
  usuarioCreacion?: string;
}

export interface GuardarUsuarioPerfilRolRequest {
  idUsuario: string;
  idPerfil: number;
  idRol: number;
}

export interface GuardarAsignacionMenuRolRequest {
  idPerfil: number;
  idRol: number;
  menus: {
    idMenu: number;
    acceso: boolean;
  }[];
}

export interface CrearMenuPrincipalRequest {
  nombreMenu: string;
  codigoMenu: string;
  icono?: string;
  ordenMenu?: number;
  esVisible?: boolean;
  esActivo?: boolean;
}

export interface CrearNodoMenuRequest {
  nombreMenu: string;
  idMenuPadre?: number;
  ruta?: string;
  codigoMenu?: string;
  icono?: string;
  ordenMenu?: number;
  esVisible?: boolean;
  esActivo?: boolean;
}

const BASE_URL = "/menu";

function extraerArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

export const menuService = {
  async obtenerCompleto(): Promise<MenuDto[]> {
    const response = await httpClient.get<MenuDto[]>(`${BASE_URL}/completo`);
    return extraerArray<MenuDto>(response);
  },

  async existeUsuarioPerfil({
    idUsuario,
    idPerfil,
  }: ExisteUsuarioPerfilRequest): Promise<boolean> {
    const response = await httpClient.get<{ existe?: boolean }>(
      `${BASE_URL}/usuario-perfil/existe`,
      {
        params: { idUsuario, idPerfil },
      }
    );

    return typeof response?.existe === "boolean" ? response.existe : false;
  },

  async guardarUsuarioPerfil(payload: GuardarUsuarioPerfilRequest) {
    return await httpClient.post(`${BASE_URL}/usuario-perfil`, payload);
  },

  async guardarUsuarioPerfilRol(payload: GuardarUsuarioPerfilRolRequest) {
    return await httpClient.post(`${BASE_URL}/usuario-perfil-rol`, payload);
  },

  async guardarAsignacionMenuRol(payload: GuardarAsignacionMenuRolRequest) {
    return await httpClient.post(`${BASE_URL}/rol/asignacion`, payload);
  },

  async obtenerMenuDinamicoPorUsuario(idUsuario: string): Promise<MenuDto[]> {
    const response = await httpClient.get<MenuDto[]>(`${BASE_URL}/dinamico`, {
      params: { idUsuario },
    });

    return extraerArray<MenuDto>(response);
  },

  async obtenerPorPerfilRol(idPerfil: number, idRol: number): Promise<MenuDto[]> {
    const response = await httpClient.get<MenuDto[]>(
      `${BASE_URL}/perfil/${idPerfil}/rol/${idRol}/asignado`
    );

    return extraerArray<MenuDto>(response);
  },

  async crearMenuPrincipal(payload: CrearMenuPrincipalRequest) {
    return await httpClient.post(`${BASE_URL}/principal`, payload);
  },

  async crearNodo(payload: CrearNodoMenuRequest) {
    return await httpClient.post(`${BASE_URL}/nodo`, payload);
  },
};
