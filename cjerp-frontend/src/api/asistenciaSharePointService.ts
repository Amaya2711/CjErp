import httpClient from "./httpClient";

export type AsistenciaSharePointConfig = {
  codigoJob: string;
  activo: boolean;
  horaEjecucion: string;
  timeZone: string;
  cronExpression: string;
  ultimaEjecucion?: string;
  ultimoEstado?: string;
  ultimaCantidadRegistros?: number;
  ultimoArchivo?: string;
  mensaje?: string;
  detalleError?: string;
};

export type AsistenciaSharePointLog = {
  id: number;
  tipoEjecucion: string;
  fechaInicio: string;
  fechaFin: string;
  nombreArchivo: string;
  cantidadRegistros: number;
  estado: string;
  fechaInicioEjecucion: string;
  fechaFinEjecucion?: string;
  duracionSegundos: number;
  usuario?: string;
  mensaje?: string;
  detalleError?: string;
};

const BASE_URL = "/admin/asistencia-sharepoint";

export const asistenciaSharePointService = {
  obtenerConfiguracion() {
    return httpClient.get<AsistenciaSharePointConfig>(`${BASE_URL}/configuracion`);
  },
  actualizarConfiguracion(payload: Pick<AsistenciaSharePointConfig, "activo" | "horaEjecucion">) {
    return httpClient.put<void>(`${BASE_URL}/configuracion`, payload);
  },
  ejecutar(payload: { fechaInicio: string; fechaFin: string }) {
    return httpClient.post<{ accepted: boolean; jobId: string }>(`${BASE_URL}/ejecutar`, payload);
  },
  obtenerHistorial(top = 100) {
    return httpClient.get<AsistenciaSharePointLog[]>(`${BASE_URL}/historial`, { params: { top } });
  },
  reintentar(id: number) {
    return httpClient.post<{ accepted: boolean; jobId: string }>(`${BASE_URL}/historial/${id}/reintentar`);
  },
};
