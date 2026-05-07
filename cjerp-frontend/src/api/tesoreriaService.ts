import http from '../api/httpClient';

export interface RegistrarPagoDto {
  filtroOperativoKey: string;
  responsable: string;
  cuenta: string;
  tipoPago: string;
  tipoPagoLabel?: string;
  monto: number;
  detalle: string;
  comentario: string;
  fechaVencimiento?: string;
  fechaEmision?: string;
  solicitante?: string;
  solicitanteLabel?: string;
  gestor?: string;
  gestorLabel?: string;
  validador?: string;
  validadorLabel?: string;
  moneda?: string;
  monedaLabel?: string;
  bien?: string;
  bienLabel?: string;
  comprobante?: string;
  comprobanteLabel?: string;
  serie?: string;
}

// Usar el endpoint RESTful estándar y camelCase
export const registrarPago = async (dto: RegistrarPagoDto) => {
  return await http.post('/tesoreria/gastos', dto);
};
