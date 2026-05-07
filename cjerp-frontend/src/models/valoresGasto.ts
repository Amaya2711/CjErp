export interface ValoresGastoRequest {
  idCliente: number;
  idProyecto: number;
  idSite: string;
  correlativo: number;
  tipoTrabajo: string;
  ot?: string;
  usarOt: boolean;
  tipoCambio: number;
}

export interface ValoresGastoResponse {
  porcentaje: number;
  aprobado: number;
  pagado: number;
  adelantado: number;
  saldo2: number;
  saldo: number;
}
