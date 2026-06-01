import httpClient from "./httpClient";
import type { CompensacionFiltro, CompensacionGuardarRequest, CompensacionRow } from "../models/compensacion";

const BASE_URL = "/admin/compensacion";

type ApiRow = Record<string, unknown>;

function getRowValue(row: ApiRow, key: string) {
  if (key in row) {
    return row[key];
  }

  const matchedKey = Object.keys(row).find((item) => item.toLowerCase() === key.toLowerCase());
  return matchedKey ? row[matchedKey] : undefined;
}

function getString(row: ApiRow, ...keys: string[]): string {
  for (const key of keys) {
    const value = getRowValue(row, key);
    if (value != null) {
      return String(value).trim();
    }
  }

  return "";
}

function getNumber(row: ApiRow, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = getRowValue(row, key);
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function getBoolean(row: ApiRow, ...keys: string[]): boolean {
  for (const key of keys) {
    const value = getRowValue(row, key);
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      return value === 1;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true" || normalized === "1") return true;
      if (normalized === "false" || normalized === "0") return false;
    }
  }

  return false;
}

function normalizeRow(row: ApiRow): CompensacionRow {
  const id = getNumber(row, "IdEmpleadoCompensacion", "idEmpleadoCompensacion") ?? 0;

  return {
    id,
    idEmpleadoCompensacion: id,
    idEmpleadoCj: getNumber(row, "IdEmpleadoCj", "idEmpleadoCj"),
    idEstado: getNumber(row, "IdEstado", "idEstado"),
    fecha: getString(row, "Fecha", "fecha"),
    idActivo: getNumber(row, "IdActivo", "idActivo"),
    idAutorizado: getNumber(row, "IdAutorizado", "idAutorizado"),
    fechaAutorizado: getString(row, "FechaAutorizado", "fechaAutorizado"),
    fechaInicio: getString(row, "FechaInicio", "fechaInicio"),
    fechaFin: getString(row, "FechaFin", "fechaFin"),
    fechaPre: getString(row, "FechaPre", "fechaPre"),
    fechaPrimera: getString(row, "FechaPrimera", "fechaPrimera"),
    idPre: getNumber(row, "IdPre", "idPre"),
    idPrimera: getNumber(row, "IdPrimera", "idPrimera"),
    idGestor: getNumber(row, "IdGestor", "idGestor"),
    usuario: getString(row, "Usuario", "usuario"),
    fechaCreacion: getString(row, "FechaCreacion", "fechaCreacion"),
    idRechazo: getNumber(row, "IdRechazo", "idRechazo"),
    fechaRechazo: getString(row, "FechaRechazo", "fechaRechazo"),
    pagada: getBoolean(row, "Pagada", "pagada"),
    comentario: getString(row, "Comentario", "comentario"),
    tipoCompensacion: getString(row, "TipoCompensacion", "tipoCompensacion"),
    cantidadDias: getNumber(row, "CantidadDias", "cantidadDias") ?? 0,
    idSaldoCompensacion: getNumber(row, "IdSaldoCompensacion", "idSaldoCompensacion"),
    idMovimiento: getNumber(row, "IdMovimiento", "idMovimiento"),
    procesadoSaldo: getBoolean(row, "ProcesadoSaldo", "procesadoSaldo"),
  };
}

export async function listarCompensaciones(filtro: CompensacionFiltro = {}): Promise<CompensacionRow[]> {
  const response = await httpClient.get<ApiRow[]>(BASE_URL, {
    params: {
      idEmpleadoCj: filtro.idEmpleadoCj,
      idEstado: filtro.idEstado,
      fechaDesde: filtro.fechaDesde,
      fechaHasta: filtro.fechaHasta,
      incluirInactivos: filtro.incluirInactivos,
    },
  });

  const rows = Array.isArray(response) ? response : [];
  return rows.map(normalizeRow);
}

export async function crearCompensacion(payload: CompensacionGuardarRequest) {
  return await httpClient.post<{ idEmpleadoCompensacion: number }>(BASE_URL, payload);
}

export async function actualizarCompensacion(id: number, payload: CompensacionGuardarRequest) {
  return await httpClient.put<unknown>(`${BASE_URL}/${id}`, payload);
}

export async function eliminarCompensacion(id: number) {
  return await httpClient.delete<unknown>(`${BASE_URL}/${id}`);
}
