import type { AxiosRequestConfig } from "axios";
import httpClient from "./httpClient";
import type {
  ReporteWhatsappConfiguracion,
  ReporteWhatsappDashboard,
  ReporteWhatsappEjecucionResultado,
} from "../models/reportesWhatsapp";

const BASE_URL = "/reportes-whatsapp";
const buildConfig = (tipo?: string, periodo?: string) => ({
  params: {
    ...(tipo ? { tipo } : {}),
    ...(periodo ? { periodo } : {}),
  },
});

export const reportesWhatsappService = {
  async obtenerDashboard(topLogs = 200, tipo?: string, periodo?: string, config?: AxiosRequestConfig) {
    return await httpClient.get<ReporteWhatsappDashboard>(`${BASE_URL}/dashboard`, {
      ...config,
      params: { topLogs, ...(tipo ? { tipo } : {}), ...(periodo ? { periodo } : {}) },
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

  async ejecutarAhora(tipo?: string, periodo?: string) {
    return await httpClient.post<ReporteWhatsappEjecucionResultado>(`${BASE_URL}/ejecutar-ahora`, undefined, buildConfig(tipo, periodo));
  },

  async reintentarFallidos(tipo?: string, periodo?: string) {
    return await httpClient.post<ReporteWhatsappEjecucionResultado>(`${BASE_URL}/reintentar-fallidos`, undefined, buildConfig(tipo, periodo));
  },
};
