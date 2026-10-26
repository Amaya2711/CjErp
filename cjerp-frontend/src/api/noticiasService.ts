import httpClient from "./httpClient";

export type NoticiaItem = {
  titulo: string;
  fuente: string;
  url: string;
  fechaPublicacion: string | null;
};

export type NoticiaSeccion = {
  clave: string;
  titulo: string;
  descripcion: string;
  noticias: NoticiaItem[];
};

export type NoticiasGerenciales = {
  fecha: string;
  generadoUtc: string;
  resumenEjecutivo: string | null;
  implicancias: string[];
  secciones: NoticiaSeccion[];
};

export async function obtenerNoticiasGerenciales(actualizar = false): Promise<NoticiasGerenciales> {
  return await httpClient.get<NoticiasGerenciales>("/inicio/noticias/gerencial", {
    params: { actualizar },
    timeout: 90000,
  });
}
