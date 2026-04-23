import httpClient from "../../../api/httpClient";

const BASE_URL = "/seguridad-permisos";

export interface PermisoMenu {
  idMenu: number;
  nombreMenu: string;
  puedeVer: boolean;
  puedeCrear: boolean;
  puedeEditar: boolean;
  puedeEliminar: boolean;
  puedeAprobar: boolean;
  puedeExportar: boolean;
}

export const seguridadPermisosService = {
  async obtenerPorRol(idRol: number): Promise<PermisoMenu[]> {
    const response = await httpClient.get<PermisoMenu[]>(`${BASE_URL}/rol/${idRol}`);
    return Array.isArray(response) ? response : [];
  },

  async guardarPorRol(idRol: number, permisos: PermisoMenu[], usuario = "SYSTEM") {
    for (const permiso of permisos) {
      await httpClient.put(`${BASE_URL}/rol/${idRol}`, {
        idMenu: permiso.idMenu,
        puedeVer: permiso.puedeVer,
        puedeCrear: permiso.puedeCrear,
        puedeEditar: permiso.puedeEditar,
        puedeEliminar: permiso.puedeEliminar,
        puedeAprobar: permiso.puedeAprobar,
        puedeExportar: permiso.puedeExportar,
        usuario,
      });
    }
  },
};
