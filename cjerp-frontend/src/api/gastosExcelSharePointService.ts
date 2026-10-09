import httpClient from "./httpClient";

export type GastosExcelSharePointConfig = {
  codigoJob: string;
  activo: boolean;
  horaEjecucion: string;
  timeZone: string;
  cronExpression: string;
  idCliente: number;
  estadoPlanilla: number;
  ultimaEjecucion?: string;
  ultimoEstado?: string;
  ultimaCantidadRegistros?: number;
  mensaje?: string;
  archivo: string;
  tabla: string;
};

export type GastosExcelSharePointLog = {
  id: number;
  tipoEjecucion: string;
  idCliente: number;
  estadoPlanilla: number;
  archivo: string;
  tabla: string;
  cantidadRegistros: number;
  estado: string;
  fechaInicioEjecucion: string;
  fechaFinEjecucion?: string;
  duracionSegundos: number;
  usuario?: string;
  mensaje?: string;
  detalleError?: string;
};

export type GastosExcelSharePointConfigUpdate = Pick<
  GastosExcelSharePointConfig,
  "activo" | "horaEjecucion" | "idCliente" | "estadoPlanilla"
>;

const BASE_URL = "/admin/gastos-excel-sharepoint";

export const gastosExcelSharePointService = {
  obtenerConfiguracion() {
    return httpClient.get<GastosExcelSharePointConfig>(`${BASE_URL}/configuracion`);
  },
  actualizarConfiguracion(payload: GastosExcelSharePointConfigUpdate) {
    return httpClient.put<void>(`${BASE_URL}/configuracion`, payload);
  },
  ejecutar() {
    return httpClient.post<{ accepted: boolean; jobId: string }>(`${BASE_URL}/ejecutar`);
  },
  obtenerHistorial(top = 100) {
    return httpClient.get<GastosExcelSharePointLog[]>(`${BASE_URL}/historial`, { params: { top } });
  },
  reintentar(id: number) {
    return httpClient.post<{ accepted: boolean; jobId: string }>(`${BASE_URL}/historial/${id}/reintentar`);
  },
};
