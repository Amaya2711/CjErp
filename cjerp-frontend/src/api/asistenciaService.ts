import httpClient from "./httpClient";
import type {
  AsistenciaReporteItem,
  AsistenciaReportePdfRequest,
  AsistenciaReporteQueryParams,
} from "../models/asistencia";

type AsistenciaReporteApiRow = Record<string, unknown>;

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

function normalizeAsistenciaRow(row: AsistenciaReporteApiRow): AsistenciaReporteItem {
  return {
    fecha: getString(row, "Fecha", "fecha"),
    hora: getString(row, "Hora", "hora"),
    nombreEmpleado: getString(row, "nombreempleado", "nombreEmpleado", "NombreEmpleado"),
    tipoAprobacion: getString(row, "TipoAprobacion", "tipoAprobacion", "tipo_aprobacion"),
    responsable: getString(row, "Responsable", "responsable"),
    estado: getString(row, "Estado", "estado"),
    comentario: getString(row, "Comentario", "comentario", "Observacion", "observacion"),
    empresa: getString(row, "empresa", "Empresa"),
    cliente: getString(row, "Cliente", "cliente"),
    area: getString(row, "Area", "area"),
    ubicacion: getString(row, "Ubicacion", "ubicacion"),
    idEmpleado: getNumber(row, "IdEmpleado", "idEmpleado") || null,
    estadoAct: getString(row, "EstadoAct", "estadoAct"),
    sexo: getString(row, "Sexo", "sexo"),
    fechaIniLaboral: getString(row, "FechaIniLaboral", "fechaIniLaboral"),
    fechaFinLaboral: getString(row, "FechaFinlaboral", "FechaFinLaboral", "fechaFinLaboral"),
    salida: getString(row, "Salida", "salida"),
    estadoMarcacionTexto: getString(row, "EstadoMarcacionTexto", "estadoMarcacionTexto"),
    tiempoTrabajado: getString(row, "TiempoTrabajado", "tiempoTrabajado"),
    totalHoras: getNumber(row, "TotalHoras", "totalHoras"),
    totalHorasLaborales: getNumber(row, "TotalHorasLaborales", "totalHorasLaborales"),
    estadoValidacionHoras: getString(row, "EstadoValidacionHoras", "estadoValidacionHoras", "Estadovalidacionhoras", "estadovalidacionhoras"),
    tiempoHoras: getString(row, "TiempoHoras", "tiempoHoras"),
    origenMarcacion: getString(row, "OrigenMarcacion", "origenMarcacion"),
  };
}

export async function buscarAsistencia(params: AsistenciaReporteQueryParams) {
  const response = await httpClient.get<AsistenciaReporteApiRow[]>("/asistencia/reporte", { params });
  const rows = Array.isArray(response) ? response : [];
  return rows.map(normalizeAsistenciaRow);
}

export async function exportarAsistenciaEmpleadoPdf(payload: AsistenciaReportePdfRequest) {
  return await httpClient.post<Blob>("/asistencia/reporte/pdf-empleado", payload, {
    responseType: "blob",
  });
}
