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

function extraerArray<T>(response: any): T[] {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  return [];
}

export const menuService = {
  async obtenerCompleto(): Promise<MenuDto[]> {
    const response: any = await httpClient.get(`${BASE_URL}/completo`);

    console.log("[menuService] obtenerCompleto", response);
    console.log("[menuService] obtenerCompleto es array response:", Array.isArray(response));
    console.log("[menuService] obtenerCompleto es array response.data:", Array.isArray(response?.data));

    return extraerArray<MenuDto>(response);
  },

  async existeUsuarioPerfil({
    idUsuario,
    idPerfil,
  }: ExisteUsuarioPerfilRequest): Promise<boolean> {
    const response: any = await httpClient.get(`${BASE_URL}/usuario-perfil/existe`, {
      params: { idUsuario, idPerfil },
    });

    console.log("[menuService] existeUsuarioPerfil", response);

    if (typeof response?.existe === "boolean") {
      return response.existe;
    }

    if (typeof response?.data?.existe === "boolean") {
      return response.data.existe;
    }

    return false;
  },

  async guardarUsuarioPerfil(payload: GuardarUsuarioPerfilRequest) {
    return await httpClient.post(`${BASE_URL}/usuario-perfil`, payload);
  },

  async guardarUsuarioPerfilRol(payload: GuardarUsuarioPerfilRolRequest) {
    return await httpClient.post(`${BASE_URL}/usuario-perfil-rol`, payload);
  },

  async guardarAsignacionMenuRol(payload: GuardarAsignacionMenuRolRequest) {
    return await httpClient.post(`${BASE_URL}/guardar-rol-menu`, payload);
  },

  async obtenerMenuDinamicoPorUsuario(idUsuario: string): Promise<MenuDto[]> {
    const response: any = await httpClient.get(`${BASE_URL}/dinamico`, {
      params: { idUsuario },
    });

    console.log("[menuService] response completo:", response);
    console.log("[menuService] response.data:", response?.data);
    console.log("[menuService] es array response:", Array.isArray(response));
    console.log("[menuService] es array response.data:", Array.isArray(response?.data));

    return extraerArray<MenuDto>(response);
  },

  async obtenerPorPerfilRol(idPerfil: number, idRol: number): Promise<MenuDto[]> {
    const response: any = await httpClient.get(
      `${BASE_URL}/perfil/${idPerfil}/rol/${idRol}/asignado`
    );

    console.log("[menuService] obtenerPorPerfilRol", response);
    console.log("[menuService] obtenerPorPerfilRol es array response:", Array.isArray(response));
    console.log("[menuService] obtenerPorPerfilRol es array response.data:", Array.isArray(response?.data));

    return extraerArray<MenuDto>(response);
  },

  async crearMenuPrincipal(payload: CrearMenuPrincipalRequest) {
    return await httpClient.post(`${BASE_URL}/crear-principal`, payload);
  },

  async crearNodo(payload: CrearNodoMenuRequest) {
    return await httpClient.post(`${BASE_URL}/crear`, payload);
  },
};