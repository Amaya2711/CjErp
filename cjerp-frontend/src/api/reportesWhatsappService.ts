import httpClient from "./httpClient";
import type {
  ReporteWhatsappConfiguracion,
  ReporteWhatsappDashboard,
  ReporteWhatsappEjecucionResultado,
} from "../models/reportesWhatsapp";

const BASE_URL = "/reportes-whatsapp";

export const reportesWhatsappService = {
  async obtenerDashboard(topLogs = 200) {
    return await httpClient.get<ReporteWhatsappDashboard>(`${BASE_URL}/dashboard`, {
      params: { topLogs },
    });
  },

  async obtenerConfiguracion() {
    return await httpClient.get<ReporteWhatsappConfiguracion>(`${BASE_URL}/configuracion`);
  },

  async actualizarConfiguracion(payload: ReporteWhatsappConfiguracion) {
    return await httpClient.put<boolean>(`${BASE_URL}/configuracion`, payload);
  },

  async reprogramarJob() {
    return await httpClient.post<boolean>(`${BASE_URL}/reprogramar-job`);
  },

  async ejecutarAhora() {
    return await httpClient.post<ReporteWhatsappEjecucionResultado>(`${BASE_URL}/ejecutar-ahora`);
  },

  async reintentarFallidos() {
    return await httpClient.post<ReporteWhatsappEjecucionResultado>(`${BASE_URL}/reintentar-fallidos`);
  },
};
