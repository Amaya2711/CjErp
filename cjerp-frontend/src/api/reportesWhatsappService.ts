import type { AxiosRequestConfig } from "axios";
import httpClient from "./httpClient";
import type {
  ReporteWhatsappConfiguracion,
  ReporteWhatsappDashboard,
  ReporteWhatsappEjecucionRequest,
  ReporteWhatsappEjecucionResultado,
  ReporteWhatsappManualSendRequest,
  ReporteWhatsappManualSendResult,
  ReporteMetaDestinatario,
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

  /** PDF que enviaría el job (sin enviarlo): primer empleado destino con datos, o el indicado. */
  async vistaPreviaPdf(tipo?: string, idEmpleado?: number) {
    return await httpClient.get<Blob>(`${BASE_URL}/vista-previa-pdf`, {
      params: { ...(tipo ? { tipo } : {}), ...(idEmpleado ? { idEmpleado } : {}) },
      responseType: "blob",
      timeout: 120000,
    });
  },

  /** Listado de sp_EmpleadoCj_Listar_Wup con la marca de habilitado para el envío por Meta. */
  async obtenerDestinatariosMeta() {
    return await httpClient.get<ReporteMetaDestinatario[]>(`${BASE_URL}/meta/destinatarios`);
  },

  /** Guarda los empleados desmarcados; el resto del listado queda habilitado. */
  async guardarDestinatariosMeta(idsExcluidos: number[]) {
    return await httpClient.put<boolean>(`${BASE_URL}/meta/destinatarios`, { idsExcluidos });
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

  async ejecutarAhora(tipo?: string, periodo?: string, payload?: ReporteWhatsappEjecucionRequest) {
    return await httpClient.post<ReporteWhatsappEjecucionResultado>(`${BASE_URL}/ejecutar-ahora`, payload, buildConfig(tipo, periodo));
  },

  async reintentarFallidos(tipo?: string, periodo?: string, payload?: ReporteWhatsappEjecucionRequest) {
    return await httpClient.post<ReporteWhatsappEjecucionResultado>(`${BASE_URL}/reintentar-fallidos`, payload, buildConfig(tipo, periodo));
  },

  async enviarMensajeManual(payload: ReporteWhatsappManualSendRequest) {
    return await httpClient.post<ReporteWhatsappManualSendResult>(`${BASE_URL}/enviar-mensaje-manual`, payload);
  },
};
