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
  acceso?: number | boolean | string | null;
}

export interface UsuarioPerfilRolDto {
  idUsuario: string;
  idPerfil: number;
  nombrePerfil: string;
  idRol: number;
  nombreRol: string;
}

export interface ExisteUsuarioPerfilRequest {
  idUsuario: string;
  idPerfil: number;
  idRol: number;
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
const MENU_DINAMICO_CACHE_PREFIX = "cj_menu_dinamico_";
const menuDinamicoMemoryCache = new Map<string, MenuDto[]>();

function extraerArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function getMenuCacheKey(idUsuario: string) {
  return `${MENU_DINAMICO_CACHE_PREFIX}${idUsuario.trim().toLowerCase()}`;
}

function readCachedMenu(idUsuario: string): MenuDto[] | null {
  const normalizedUser = idUsuario.trim();
  if (!normalizedUser) {
    return null;
  }

  const memoryKey = getMenuCacheKey(normalizedUser);
  const memoryValue = menuDinamicoMemoryCache.get(memoryKey);
  if (memoryValue) {
    return memoryValue;
  }

  try {
    const raw = window.sessionStorage.getItem(memoryKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    const items = extraerArray<MenuDto>(parsed);
    if (items.length > 0) {
      menuDinamicoMemoryCache.set(memoryKey, items);
    }
    return items;
  } catch {
    return null;
  }
}

function writeCachedMenu(idUsuario: string, items: MenuDto[]) {
  const normalizedUser = idUsuario.trim();
  if (!normalizedUser) {
    return;
  }

  const cacheKey = getMenuCacheKey(normalizedUser);
  menuDinamicoMemoryCache.set(cacheKey, items);

  try {
    window.sessionStorage.setItem(cacheKey, JSON.stringify(items));
  } catch {
    // Ignore storage errors and keep in-memory cache only.
  }
}

function clearCachedMenu(idUsuario?: string) {
  if (idUsuario && idUsuario.trim()) {
    const cacheKey = getMenuCacheKey(idUsuario);
    menuDinamicoMemoryCache.delete(cacheKey);

    try {
      window.sessionStorage.removeItem(cacheKey);
    } catch {
      // Ignore storage errors.
    }

    return;
  }

  for (const key of Array.from(menuDinamicoMemoryCache.keys())) {
    menuDinamicoMemoryCache.delete(key);
  }

  try {
    Object.keys(window.sessionStorage)
      .filter((key) => key.startsWith(MENU_DINAMICO_CACHE_PREFIX))
      .forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // Ignore storage errors.
  }
}

export const menuService = {
  async obtenerCompleto(): Promise<MenuDto[]> {
    const response = await httpClient.get<MenuDto[]>(`${BASE_URL}/completo`);
    return extraerArray<MenuDto>(response);
  },

  async existeUsuarioPerfil({
    idUsuario,
    idPerfil,
    idRol,
  }: ExisteUsuarioPerfilRequest): Promise<boolean> {
    const response = await httpClient.get<{ existe?: boolean }>(
      `${BASE_URL}/usuario-perfil-rol/existe`,
      {
        params: { idUsuario, idPerfil, idRol },
      }
    );

    return typeof response?.existe === "boolean" ? response.existe : false;
  },

  async guardarUsuarioPerfil(payload: GuardarUsuarioPerfilRequest) {
    const response = await httpClient.post(`${BASE_URL}/usuario-perfil`, payload);
    clearCachedMenu(payload.idUsuario);
    return response;
  },

  async guardarUsuarioPerfilRol(payload: GuardarUsuarioPerfilRolRequest) {
    const response = await httpClient.post(`${BASE_URL}/usuario-perfil-rol`, payload);
    clearCachedMenu(payload.idUsuario);
    return response;
  },

  async guardarAsignacionMenuRol(payload: GuardarAsignacionMenuRolRequest) {
    const response = await httpClient.post(`${BASE_URL}/rol/asignacion`, payload);
    clearCachedMenu();
    return response;
  },

  async obtenerMenuDinamicoPorUsuario(idUsuario: string, forceRefresh = false): Promise<MenuDto[]> {
    const cached = forceRefresh ? null : readCachedMenu(idUsuario);
    if (cached) {
      return cached;
    }

    try {
      const response = await httpClient.get<MenuDto[]>(`${BASE_URL}/dinamico`, {
        params: { idUsuario },
      });

      const items = extraerArray<MenuDto>(response);
      writeCachedMenu(idUsuario, items);
      return items;
    } catch (error) {
      const fallback = readCachedMenu(idUsuario);
      if (fallback) {
        return fallback;
      }

      throw error;
    }
  },

  async obtenerPorPerfilRol(idPerfil: number, idRol: number): Promise<MenuDto[]> {
    const response = await httpClient.get<MenuDto[]>(
      `${BASE_URL}/perfil/${idPerfil}/rol/${idRol}/asignado`
    );

    return extraerArray<MenuDto>(response);
  },

  async obtenerPerfilRolPorUsuario(idUsuario: string): Promise<UsuarioPerfilRolDto[]> {
    const response = await httpClient.get<UsuarioPerfilRolDto[]>(
      `${BASE_URL}/usuario/${encodeURIComponent(idUsuario)}/perfil-rol`
    );
    return extraerArray<UsuarioPerfilRolDto>(response);
  },

  async crearMenuPrincipal(payload: CrearMenuPrincipalRequest) {
    const response = await httpClient.post(`${BASE_URL}/principal`, payload);
    clearCachedMenu();
    return response;
  },

  async crearNodo(payload: CrearNodoMenuRequest) {
    const response = await httpClient.post(`${BASE_URL}/nodo`, payload);
    clearCachedMenu();
    return response;
  },
};
