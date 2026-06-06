import httpClient from "./httpClient";
import type {
  CompensacionFiltro,
  CompensacionGuardarRequest,
  CompensacionRow,
  CompensacionSaldo,
  ProcesarCompensacionRequest,
  ProcesarCompensacionResponse,
} from "../models/compensacion";

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
    idEstado: getNumber(
      row,
      "IdEstado",
      "idEstado",
      "idestado",
      "Id_Estado",
      "id_estado"
    ),
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
    nombreEmpleado: getString(row, "NombreEmpleado", "nombreEmpleado"),
    idResponsableCj: getNumber(row, "IdResponsableCj", "idResponsableCj"),
    idSegundoVacaciones: getNumber(row, "IdSegundoVacaciones", "idSegundoVacaciones"),
    primer: getString(row, "Primer", "primer"),
    segundo: getString(row, "Segundo", "segundo"),
    estado: getString(row, "Estado", "estado"),
    activo: getString(row, "Activo", "activo"),
    diasBase: getNumber(row, "DiasBase", "diasBase") ?? 0,
    diasGanados: getNumber(row, "DiasGanados", "diasGanados") ?? 0,
    diasTomados: getNumber(row, "DiasTomados", "diasTomados") ?? 0,
    diasPendientes: getNumber(row, "DiasPendientes", "diasPendientes") ?? 0,
    diasDisponibles: getNumber(row, "DiasDisponibles", "diasDisponibles") ?? 0,
    porcentajeUso: getNumber(row, "PorcentajeUso", "porcentajeUso") ?? 0,
  };
}

function toNullableDate(value: string) {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizePayload(payload: CompensacionGuardarRequest) {
  return {
    ...payload,
    fecha: payload.fecha.trim(),
    fechaAutorizado: toNullableDate(payload.fechaAutorizado),
    fechaInicio: toNullableDate(payload.fechaInicio),
    fechaFin: toNullableDate(payload.fechaFin),
    fechaPre: toNullableDate(payload.fechaPre),
    fechaPrimera: toNullableDate(payload.fechaPrimera),
    fechaRechazo: toNullableDate(payload.fechaRechazo),
    comentario: payload.comentario.trim(),
    tipoCompensacion: payload.tipoCompensacion.trim() || "COMPENSACION",
    usuario: payload.usuario.trim(),
  };
}

export async function listarCompensaciones(filtro: CompensacionFiltro = {}): Promise<CompensacionRow[]> {
  const response = await httpClient.get<ApiRow[]>(BASE_URL, {
    params: {
      idEmpleadoCj: filtro.idEmpleadoCj,
      IdEstado: filtro.idEstado,
      idActivo: filtro.idActivo,
      fechaDesde: filtro.fechaDesde,
      fechaHasta: filtro.fechaHasta,
      incluirInactivos: filtro.incluirInactivos,
    },
  });

  const rows = Array.isArray(response) ? response : [];
  return rows.map(normalizeRow);
}

export async function obtenerCompensacion(id: number): Promise<CompensacionRow> {
  const response = await httpClient.get<ApiRow>(`${BASE_URL}/${id}`);
  return normalizeRow(response);
}

export async function crearCompensacion(payload: CompensacionGuardarRequest) {
  return await httpClient.post<{ idEmpleadoCompensacion: number }>(
    BASE_URL,
    normalizePayload(payload)
  );
}

export async function actualizarCompensacion(id: number, payload: CompensacionGuardarRequest) {
  return await httpClient.put<unknown>(`${BASE_URL}/${id}`, normalizePayload(payload));
}

export async function eliminarCompensacion(id: number) {
  return await httpClient.delete<unknown>(`${BASE_URL}/${id}`);
}

export async function procesarCompensacion(
  payload: ProcesarCompensacionRequest
): Promise<ProcesarCompensacionResponse> {
  return await httpClient.post<ProcesarCompensacionResponse>(`${BASE_URL}/procesar`, {
    ...payload,
    fechaInicio: payload.fechaInicio.trim(),
    fechaFin: payload.fechaFin.trim(),
    comentario: payload.comentario?.trim() || undefined,
    usuario: payload.usuario.trim(),
  });
}

export async function obtenerSaldoCompensacion(idEmpleadoCj: number): Promise<CompensacionSaldo | null> {
  const response = await httpClient.get<ApiRow | null>(`${BASE_URL}/saldo`, {
    params: { idEmpleadoCj },
  });

  if (!response || typeof response !== "object") {
    return null;
  }

  return {
    idEmpleadoCj: getNumber(response, "IdEmpleadoCj", "idEmpleadoCj"),
    nombreEmpleado: getString(response, "NombreEmpleado", "nombreEmpleado"),
    diasBase: getNumber(response, "DiasBase", "diasBase") ?? 0,
    diasGanados: getNumber(response, "DiasGanados", "diasGanados") ?? 0,
    diasTomados: getNumber(response, "DiasTomados", "diasTomados") ?? 0,
    diasPendientes: getNumber(response, "DiasPendientes", "diasPendientes") ?? 0,
  };
}

export async function listarSaldosCompensacion(): Promise<CompensacionSaldo[]> {
  const response = await httpClient.get<ApiRow[]>(`${BASE_URL}/saldos`);
  const rows = Array.isArray(response) ? response : [];

  return rows.map((row) => ({
    idEmpleadoCj: getNumber(row, "IdEmpleadoCj", "idEmpleadoCj"),
    nombreEmpleado: getString(row, "NombreEmpleado", "nombreEmpleado"),
    diasBase: getNumber(row, "DiasBase", "diasBase") ?? 0,
    diasGanados: getNumber(row, "DiasGanados", "diasGanados") ?? 0,
    diasTomados: getNumber(row, "DiasTomados", "diasTomados") ?? 0,
    diasPendientes: getNumber(row, "DiasPendientes", "diasPendientes") ?? 0,
  }));
}
