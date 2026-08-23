import httpClient from "./httpClient";
import type {
  AsistenciaActualizarEstadoMarcacionRequest,
  AsistenciaGerencialPdfRequest,
  AsistenciaTrackingQueryParams,
  AsistenciaTrackingResponse,
  AsistenciaReporteItem,
  AsistenciaReportePdfRequest,
  AsistenciaReporteQueryParams,
  AsistenciaEnviarPdfLlamadaAtencionResponse,
} from "../models/asistencia";

type AsistenciaReporteApiRow = Record<string, unknown>;

const RPT_ASISTENCIA_TIMEOUT_MS = 120000;

function getRowValue(row: AsistenciaReporteApiRow, key: string) {
  if (key in row) {
    return row[key];
  }

  const matchedKey = Object.keys(row).find((item) => item.toLowerCase() === key.toLowerCase());
  return matchedKey ? row[matchedKey] : undefined;
}

function getString(row: AsistenciaReporteApiRow, ...keys: string[]): string {
  for (const key of keys) {
    const value = getRowValue(row, key);
    if (value != null) {
      return String(value).trim();
    }
  }

  return "";
}

function getNumber(row: AsistenciaReporteApiRow, ...keys: string[]): number {
  for (const key of keys) {
    const value = getRowValue(row, key);
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.trim().replace(/\s+/g, "");
      const directParsed = Number(normalized);
      if (Number.isFinite(directParsed)) {
        return directParsed;
      }

      const hasComma = normalized.includes(",");
      const hasDot = normalized.includes(".");

      const normalizedNumber = hasComma && hasDot
        ? normalized.replace(/\./g, "").replace(",", ".")
        : hasComma
          ? normalized.replace(",", ".")
          : normalized;

      const parsed = Number(normalizedNumber);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function getDateTimeString(row: AsistenciaReporteApiRow, ...keys: string[]): string {
  for (const key of keys) {
    const value = getRowValue(row, key);
    if (value == null) {
      continue;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    const text = String(value).trim();
    if (text) {
      return text;
    }
  }

  return "";
}

function normalizeAsistenciaRow(row: AsistenciaReporteApiRow): AsistenciaReporteItem {
  return {
    fecha: getString(row, "Fecha", "fecha"),
    hora: getString(row, "Hora", "hora"),
    nombreEmpleado: getString(row, "nombreempleado", "nombreEmpleado", "NombreEmpleado"),
    telefono: getString(row, "Telefono", "telefono", "Celular", "celular", "TelefonoWup", "telefonoWup"),
    correoEmpleado: getString(row, "CorreoEmpleado", "correoEmpleado", "correoempleado"),
    correoResponsable: getString(row, "CorreoResponsable", "correoResponsable", "correoresponsable"),
    tipoAprobacion: getString(row, "TipoAprobacion", "tipoAprobacion", "tipo_aprobacion"),
    responsable: getString(row, "Responsable", "responsable"),
    estado: getString(row, "Estado", "estado"),
    comentario: getString(row, "Comentario", "comentario"),
    observacion: getString(row, "Observacion", "observacion"),
    empresa: getString(row, "empresa", "Empresa"),
    cliente: getString(row, "Cliente", "cliente"),
    proyecto: getString(row, "Proyecto", "proyecto", "NombreProyecto", "nombreProyecto"),
    site: getString(row, "Site", "site", "NombreSite", "nombreSite"),
    area: getString(row, "Area", "area"),
    ubicacion: getString(row, "Ubicacion", "ubicacion", "ValorIni", "valorini"),
    idEmpleado: getNumber(row, "IdEmpleado", "idEmpleado") || null,
    estadoAct: getString(row, "EstadoAct", "estadoAct"),
    sexo: getString(row, "Sexo", "sexo"),
    fechaIniLaboral: getString(row, "FechaIniLaboral", "fechaIniLaboral"),
    fechaFinLaboral: getString(row, "FechaFinlaboral", "FechaFinLaboral", "fechaFinLaboral"),
    salida: getString(row, "Salida", "salida"),
    estadoMarcacionTexto: getString(row, "EstadoMarcacionTexto", "estadoMarcacionTexto"),
    tiempoTrabajado: getString(row, "TiempoTrabajado", "tiempoTrabajado"),
    totalHoras: getNumber(row, "TotalHoras", "totalHoras"),
    totalHorasEmpleado: getNumber(row, "TotalHorasEmpleado", "totalHorasEmpleado"),
    totalHorasLaborales: getNumber(row, "TotalHorasLaborales", "totalHorasLaborales"),
    totalHorasFaltaAprobar: getNumber(row, "TotalHorasFaltaAprobar", "totalHorasFaltaAprobar"),
    estadoValidacionHoras: getString(row, "EstadoValidacionHoras", "estadoValidacionHoras", "Estadovalidacionhoras", "estadovalidacionhoras"),
    tiempoHoras: getString(row, "TiempoHoras", "tiempoHoras"),
    origenMarcacion: getString(row, "OrigenMarcacion", "origenMarcacion"),
  };
}

function normalizeTrackingRow(row: AsistenciaReporteApiRow) {
  return {
    idEmpleado: getNumber(row, "IdEmpleado", "idEmpleado") || 0,
    nombreEmpleado: getString(row, "nombreempleado", "nombreEmpleado", "NombreEmpleado"),
    fechaAsistencia: getString(row, "FechaAsistencia", "fechaAsistencia", "Fecha", "fecha"),
    hora: getString(row, "Hora", "hora", "FechaHora", "fechaHora"),
    horaSalida: getString(row, "HoraSalida", "horaSalida", "Salida", "salida") || null,
    latPto: (() => {
      const value = getRowValue(row, "LatPto") ?? getRowValue(row, "latpto") ?? getRowValue(row, "Latitud") ?? getRowValue(row, "latitud");
      if (value == null) return null;
      const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
      return Number.isFinite(parsed) ? parsed : null;
    })(),
    lonPto: (() => {
      const value = getRowValue(row, "LonPto") ?? getRowValue(row, "lonpto") ?? getRowValue(row, "Longitud") ?? getRowValue(row, "longitud");
      if (value == null) return null;
      const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
      return Number.isFinite(parsed) ? parsed : null;
    })(),
    source: getString(row, "Source", "source"),
    fechaHora: getDateTimeString(row, "FechaHora", "fechaHora") || null,
    imagen: getString(row, "Imagen", "imagen") || null,
    imagenSalida: getString(row, "ImagenSalida", "imagenSalida") || null,
    imagenFinal: getString(row, "ImagenFinal", "imagenFinal") || null,
  };
}

export async function buscarAsistencia(params: AsistenciaReporteQueryParams) {
  const response = await httpClient.get<AsistenciaReporteApiRow[]>("/asistencia/reporte", {
    params,
    timeout: RPT_ASISTENCIA_TIMEOUT_MS,
  });
  const rows = Array.isArray(response) ? response : [];
  return rows.map(normalizeAsistenciaRow);
}

export async function exportarAsistenciaEmpleadoPdf(payload: AsistenciaReportePdfRequest) {
  return await httpClient.post<Blob>("/asistencia/reporte/pdf-empleado", payload, {
    responseType: "blob",
    timeout: RPT_ASISTENCIA_TIMEOUT_MS,
  });
}

export async function exportarAsistenciaEmpleadoPdfValidacion(payload: AsistenciaReportePdfRequest) {
  return await httpClient.post<Blob>("/asistencia/reporte/pdf-empleado-validacion", payload, {
    responseType: "blob",
    timeout: RPT_ASISTENCIA_TIMEOUT_MS,
  });
}

export async function exportarAsistenciaEmpleadoPdfLlamadaAtencion(payload: AsistenciaReportePdfRequest) {
  return await httpClient.post<Blob>("/asistencia/reporte/pdf-empleado-llamada-atencion", payload, {
    responseType: "blob",
    timeout: RPT_ASISTENCIA_TIMEOUT_MS,
  });
}

export async function enviarAsistenciaEmpleadoPdfLlamadaAtencion(payload: AsistenciaReportePdfRequest) {
  return await httpClient.post<AsistenciaEnviarPdfLlamadaAtencionResponse>("/asistencia/reporte/pdf-empleado-llamada-atencion/enviar", payload, {
    skipAuthRedirect: true,
  });
}

export async function previsualizarAsistenciaEmpleadoPdfLlamadaAtencion(payload: AsistenciaReportePdfRequest) {
  return await httpClient.post<Blob>("/asistencia/reporte/pdf-empleado-llamada-atencion/preview", payload, {
    responseType: "blob",
    timeout: RPT_ASISTENCIA_TIMEOUT_MS,
  });
}

export async function verificarLlamadaAtencionEnviadaHoy(idEmpleado: number) {
  return await httpClient.get<{ enviadaHoy: boolean }>(`/asistencia/reporte/llamada-atencion/enviada-hoy/${idEmpleado}`, {
    skipAuthRedirect: true,
  });
}

export async function verificarLlamadaAtencionEnviadaHoyEnLote(idsEmpleado: number[]) {
  return await httpClient.post<{ enviadosHoyIds: number[] }>(
    "/asistencia/reporte/llamada-atencion/enviada-hoy",
    {
      idsEmpleado,
    },
    {
      skipAuthRedirect: true,
    }
  );
}

export async function exportarAsistenciaGerencialPdf(payload: AsistenciaGerencialPdfRequest = {}) {
  return await httpClient.post<Blob>("/asistencia/reporte/pdf-gerencial", payload, {
    responseType: "blob",
    timeout: 120000,
  });
}

export async function actualizarEstadoMarcacionAsistencia(payload: AsistenciaActualizarEstadoMarcacionRequest) {
  return await httpClient.put<{ success: boolean; message: string }>("/asistencia/reporte/estado-marcacion", payload);
}

export async function consultarSeguimientoEmpleado(payload: AsistenciaTrackingQueryParams) {
  const response = await httpClient.get<{ idEmpleado?: number; nombreEmpleado?: string; fechaAsistencia?: string; puntos?: AsistenciaReporteApiRow[] } | AsistenciaReporteApiRow[]>(
    "/asistencia/reporte/tracking",
    {
      params: payload,
    }
  );

  if (Array.isArray(response)) {
    const puntos = response.map(normalizeTrackingRow);
    return {
      idEmpleado: payload.idEmpleado,
      nombreEmpleado: puntos[0]?.nombreEmpleado ?? "",
      fechaAsistencia: payload.fechaAsistencia,
      puntos,
    } satisfies AsistenciaTrackingResponse;
  }

  const puntos = Array.isArray(response?.puntos) ? response.puntos.map(normalizeTrackingRow) : [];

  return {
    idEmpleado: response?.idEmpleado ?? payload.idEmpleado,
    nombreEmpleado: response?.nombreEmpleado ?? puntos[0]?.nombreEmpleado ?? "",
    fechaAsistencia: response?.fechaAsistencia ?? payload.fechaAsistencia,
    puntos,
  } satisfies AsistenciaTrackingResponse;
}
