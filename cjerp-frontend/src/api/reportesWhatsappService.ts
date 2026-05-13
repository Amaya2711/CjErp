import httpClient from "./httpClient";
import type {
  ReporteWhatsappConfiguracion,
  ReporteWhatsappDashboard,
  ReporteWhatsappEjecucionResultado,
} from "../models/reportesWhatsapp";

const BASE_URL = "/reportes-whatsapp";
const buildConfig = (tipo?: string) => ({
  params: tipo ? { tipo } : undefined,
});

export const reportesWhatsappService = {
  async obtenerDashboard(topLogs = 200, tipo?: string) {
    return await httpClient.get<ReporteWhatsappDashboard>(`${BASE_URL}/dashboard`, {
      params: { topLogs, ...(tipo ? { tipo } : {}) },
    });
  },

  async obtenerConfiguracion(tipo?: string) {
    return await httpClient.get<ReporteWhatsappConfiguracion>(`${BASE_URL}/configuracion`, buildConfig(tipo));
  },

  async actualizarConfiguracion(payload: ReporteWhatsappConfiguracion, tipo?: string) {
    return await httpClient.put<boolean>(`${BASE_URL}/configuracion`, payload, buildConfig(tipo));
  },

  async reprogramarJob(tipo?: string) {
    return await httpClient.post<boolean>(`${BASE_URL}/reprogramar-job`, undefined, buildConfig(tipo));
  },

  async ejecutarAhora(tipo?: string) {
    return await httpClient.post<ReporteWhatsappEjecucionResultado>(`${BASE_URL}/ejecutar-ahora`, undefined, buildConfig(tipo));
  },

  async reintentarFallidos(tipo?: string) {
    return await httpClient.post<ReporteWhatsappEjecucionResultado>(`${BASE_URL}/reintentar-fallidos`, undefined, buildConfig(tipo));
  },
};
