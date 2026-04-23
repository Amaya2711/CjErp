import http from '../api/httpClient';

export interface RegistrarPagoDto {
  filtroOperativoKey: string;
  responsable: string;
  cuenta: string;
  tipoPago: string;
  monto: number;
  detalle: string;
  comentario: string;
  fechaVencimiento?: string;
  fechaEmision?: string;
  solicitante?: string;
  gestor?: string;
  validador?: string;
  moneda?: string;
  bien?: string;
  comprobante?: string;
  serie?: string;
}

// Usar el endpoint RESTful estándar y camelCase
export const registrarPago = async (dto: RegistrarPagoDto) => {
  return await http.post('/tesoreria/gastos', dto);
};
