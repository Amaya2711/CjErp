import http from '../api/httpClient';

export interface RegistrarPagoDto {
  filtroOperativoKey: string;
  responsable: string;
  cuenta: string;
  tipoPago: string;
  monto: number;
  detalle: string;
  comentario: string;
  fechavencimiento?: string;
  fecehemision?: string;
  // Otros campos relevantes
}

export const registrarPago = async (dto: RegistrarPagoDto) => {
  const { data } = await http.post('/tesoreria/pagos/registrar', dto);
  return data;
};
