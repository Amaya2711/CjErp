export type PlanillaXmlResultadoDto = {
  nombreArchivo: string;
  valido: boolean;
  importado: boolean;
  estado: string;
  mensaje: string;
  periodo?: string | null;
  numeroDocumento?: string | null;
  nombreTrabajador?: string | null;
  idBoleta?: number | null;
  fechaValidacion?: string | null;
  fechaImportacion?: string | null;
  pdfGenerado: boolean;
  pdfReutilizado: boolean;
  pdfDisponible: boolean;
  mensajePdf?: string | null;
};

export type PlanillaXmlCargaMasivaResponseDto = {
  totalArchivos: number;
  validos: number;
  conError: number;
  importados: number;
  fallidos: number;
  pdfGenerados: number;
  pdfReutilizados: number;
  pdfDisponibles: number;
  pdfConError: number;
  resultados: PlanillaXmlResultadoDto[];
};

export type PlanillaBoletaPdfBase64ResponseDto = {
  idBoleta: number;
  nombreArchivo: string;
  base64: string;
};
