import httpClient from "./httpClient";

/** Fila del Registro de Ventas SIRE. Fechas en formato yyyy-MM-dd. */
export type VentasSunatFilaDto = {
  rucEmisor: string | null;
  razonSocialEmisor: string | null;
  periodo: string | null;
  carSunat: string | null;
  fechaEmision: string | null;
  fechaVcto: string | null;
  tipoCp: string | null;
  serie: string | null;
  nroCp: string | null;
  nroFinal: string | null;
  tipoDocIdentidad: string | null;
  nroDocIdentidad: string | null;
  razonSocial: string | null;
  valorFacturadoExportacion: number | null;
  biGravada: number | null;
  dsctoBi: number | null;
  igv: number | null;
  dsctoIgv: number | null;
  mtoExonerado: number | null;
  mtoInafecto: number | null;
  isc: number | null;
  biGravIvap: number | null;
  ivap: number | null;
  icbper: number | null;
  otrosTributos: number | null;
  totalCp: number | null;
  moneda: string | null;
  tipoCambio: number | null;
  fecEmisionDocMod: string | null;
  tipoCpMod: string | null;
  serieCpMod: string | null;
  nroCpMod: string | null;
  idProyectoOperadores: string | null;
  tipoNota: string | null;
  estComp: string | null;
  valorFobEmbarcado: number | null;
  valorOpGratuitas: number | null;
  tipoOperacion: string | null;
  damCp: string | null;
  clu: string | null;
};

export type VentasSunatCargaResultDto = {
  lote: string;
  periodo: string;
  insertados: number;
  reemplazados: number;
};

export type VentasSunatResumenDto = {
  totalFilas: number;
  clienteAsignado: number;
  sinCliente: number;
};

export type VentasSunatRegistroDto = VentasSunatFilaDto & {
  idVentaSunat: number;
  idEmpresa: number | null;
  idCliente: number | null;
};

export type VentasSunatValidacionDto = {
  resumen: VentasSunatResumenDto;
  registros: VentasSunatRegistroDto[];
};

export async function cargarVentasSunat(datos: VentasSunatFilaDto[]): Promise<VentasSunatCargaResultDto> {
  return await httpClient.post<VentasSunatCargaResultDto>("/reportes/ventassunat/cargar", { datos });
}

export async function validarVentasSunat(lote: string): Promise<VentasSunatValidacionDto> {
  return await httpClient.post<VentasSunatValidacionDto>("/reportes/ventassunat/validar", { lote });
}
