import httpClient from "../../../api/httpClient";

const BASE_URL = "/perfiles";

export interface PerfilDto {
  idPerfil: number;
  nombrePerfil: string;
  descripcion?: string;
  estado?: boolean;
}

export const perfilesService = {
  async listarPerfiles(): Promise<PerfilDto[]> {
    const response = await httpClient.get(BASE_URL);
    return response.data ?? [];
  }
};
