import httpClient from "../../../api/httpClient";
import type { MenuDto } from "../../../models/seguridad/menu.types";

const BASE_URL = "/menu";

export interface GuardarAsignacionMenuRolRequest {
  idPerfil: number;
  idRol: number;
  menuIds: number[];
}

export interface CrearMenuPrincipalRequest {
  nombreMenu: string;
  codigoMenu?: string;
  icono?: string;
  ordenMenu: number;
  esVisible: boolean;
  esActivo: boolean;
}

export interface SincronizarPerfilUsuarioRequest {
  idPerfil: number;
  idUsuario: string;
}

export const menuService = {
  async obtenerPorUsuario(idUsuario: string): Promise<MenuDto[]> {
    const response = await httpClient.get(`${BASE_URL}/usuario/${encodeURIComponent(idUsuario)}`);
    return response.data;
  },

  async obtenerPorPerfilRol(idPerfil: number, idRol: number): Promise<MenuDto[]> {
    const response = await httpClient.get(`${BASE_URL}/perfil/${idPerfil}/rol/${idRol}/asignado`);
    return response.data;
  },

  async obtenerCompleto(): Promise<MenuDto[]> {
    const response = await httpClient.get(`${BASE_URL}/completo`);
    return response.data;
  },

  async obtenerDinamicoTotal(): Promise<MenuDto[]> {
    const response = await httpClient.get(`${BASE_URL}/dinamico-total`);
    return response.data;
  },

  async obtenerDinamicoPorPerfil(idPerfil: number): Promise<MenuDto[]> {
    const response = await httpClient.get(`${BASE_URL}/perfil/${idPerfil}/dinamico`);
    return response.data;
  },

  async guardarAsignacionMenuRol(payload: GuardarAsignacionMenuRolRequest) {
    const response = await httpClient.post(`${BASE_URL}/rol/asignacion`, payload);
    return response.data;
  },

  async crearMenuPrincipal(payload: CrearMenuPrincipalRequest) {
    const response = await httpClient.post(`${BASE_URL}/principal`, payload);
    return response.data;
  },

  async sincronizarPerfilUsuario(payload: SincronizarPerfilUsuarioRequest) {
    const response = await httpClient.post(`${BASE_URL}/perfil-usuario/sincronizar`, payload);
    return response.data;
  }
};

export type { MenuDto };