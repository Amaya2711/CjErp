import httpClient from "./httpClient";
import type {
  PlanillaBoletaPdfBase64ResponseDto,
  PlanillaXmlCargaMasivaResponseDto,
} from "../models/planillaBoleta";

const BASE_URL = "/recursoshumanos/planillas";
const PDF_BASE_URL = "/planilla-boleta";

function buildFilesFormData(files: File[]): FormData {
  const formData = new FormData();

  files.forEach((file) => {
    formData.append("archivos", file);
  });

  return formData;
}

export async function validarXmlPlanilla(
  files: File[]
): Promise<PlanillaXmlCargaMasivaResponseDto> {
  return await httpClient.post<PlanillaXmlCargaMasivaResponseDto>(
    `${BASE_URL}/validar-xml`,
    buildFilesFormData(files),
    { timeout: 180000 }
  );
}

export async function importarXmlPlanilla(
  files: File[]
): Promise<PlanillaXmlCargaMasivaResponseDto> {
  return await httpClient.post<PlanillaXmlCargaMasivaResponseDto>(
    `${BASE_URL}/importar-xml`,
    buildFilesFormData(files),
    { timeout: 600000 }
  );
}

export async function descargarPdfBoleta(idBoleta: number): Promise<Blob> {
  return await httpClient.get<Blob>(`${PDF_BASE_URL}/pdf/${idBoleta}`, {
    responseType: "blob",
  });
}

export async function obtenerPdfBase64(idBoleta: number): Promise<PlanillaBoletaPdfBase64ResponseDto> {
  return await httpClient.get<PlanillaBoletaPdfBase64ResponseDto>(`${PDF_BASE_URL}/pdf-base64/${idBoleta}`);
}

export async function descargarZipPeriodo(periodo: string): Promise<Blob> {
  return await httpClient.get<Blob>(`${PDF_BASE_URL}/pdf-masivo/${encodeURIComponent(periodo)}`, {
    responseType: "blob",
    timeout: 120000,
  });
}
