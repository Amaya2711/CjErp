import httpClient from "./httpClient";

export type MapaSiteRow = Record<string, unknown> & {
  Imagen?: string | null;
  ImagenSalida?: string | null;
  ImagenFinal?: string | null;
  FechaAsistencia?: string | null;
  imagen?: string | null;
  imagenSalida?: string | null;
  imagenFinal?: string | null;
  fechaAsistencia?: string | null;
};

export type MapaSiteQuery = {
  nombreSite?: string;
  departamento?: string;
  cliente?: string;
  proyecto?: string;
};

export async function consultarMapaSite(query: MapaSiteQuery = {}): Promise<MapaSiteRow[]> {
  const response = await httpClient.get<unknown>("/reportes/gerencial/mapasite", {
    params: query,
  });
  return Array.isArray(response) ? (response as MapaSiteRow[]) : [];
}

export async function consultarMapaPersonal(): Promise<MapaSiteRow[]> {
  const response = await httpClient.get<unknown>("/reportes/gerencial/mapapersonal");
  return Array.isArray(response) ? (response as MapaSiteRow[]) : [];
}
