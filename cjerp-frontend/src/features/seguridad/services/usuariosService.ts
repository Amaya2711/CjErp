import httpClient from "../../../api/httpClient";

const BASE_URL = "/usuarios";

export interface UsuarioDto {
  idUsuario: string;
  nombreEmpleado: string;
}

export const usuariosService = {
  async listarUsuarios(): Promise<UsuarioDto[]> {
    const data = await httpClient.get<UsuarioDto[]>(BASE_URL);
    return Array.isArray(data) ? data : [];
  },
};
