import httpClient from "./httpClient";

export type EmpleadosListaSharePointConfig = {
  codigoJob: string;
  activo: boolean;
  horaEjecucion: string;
  timeZone: string;
  cronExpression: string;
  ultimaEjecucion?: string;
  ultimoEstado?: string;
  ultimaCantidadRegistros?: number;
  ultimaCantidadCreados?: number;
  ultimaCantidadActualizados?: number;
  mensaje?: string;
  lista: string;
  origen: string;
  columnaClave: string;
};

export type EmpleadosListaSharePointLog = {
  id: number;
  tipoEjecucion: string;
  lista: string;
  cantidadRegistros: number;
  cantidadCreados: number;
  cantidadActualizados: number;
  cantidadSinCambios: number;
  estado: string;
  fechaInicioEjecucion: string;
  fechaFinEjecucion?: string;
  duracionSegundos: number;
  usuario?: string;
  mensaje?: string;
  detalleError?: string;
};

export type EmpleadosListaSharePointConfigUpdate = Pick<EmpleadosListaSharePointConfig, "activo" | "horaEjecucion">;

const BASE_URL = "/admin/empleados-lista-sharepoint";

export const empleadosListaSharePointService = {
  obtenerConfiguracion() {
    return httpClient.get<EmpleadosListaSharePointConfig>(`${BASE_URL}/configuracion`);
  },
  actualizarConfiguracion(payload: EmpleadosListaSharePointConfigUpdate) {
    return httpClient.put<void>(`${BASE_URL}/configuracion`, payload);
  },
  ejecutar() {
    return httpClient.post<{ accepted: boolean; jobId: string }>(`${BASE_URL}/ejecutar`);
  },
  obtenerHistorial(top = 100) {
    return httpClient.get<EmpleadosListaSharePointLog[]>(`${BASE_URL}/historial`, { params: { top } });
  },
  reintentar(id: number) {
    return httpClient.post<{ accepted: boolean; jobId: string }>(`${BASE_URL}/historial/${id}/reintentar`);
  },
};
