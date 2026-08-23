import httpClient from "./httpClient";
import type {
  ChequeFiltro,
  ChequeGuardarRequest,
  ChequeRechazarRequest,
  ChequeRow,
} from "../models/cheque";

const BASE_URL = "/tesoreria/cheques";

export type ChequeImagenUploadResponse = {
  fileName: string;
  fileUrl: string;
  storagePath: string;
};

function sanitizeNumber(value?: number | null): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

type ChequeApiRow = Record<string, unknown>;

function getString(row: ChequeApiRow, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string") {
      return value;
    }
    if (value != null) {
      return String(value);
    }
  }

  return "";
}

function getNullableString(row: ChequeApiRow, ...keys: string[]): string | null {
  const value = getString(row, ...keys).trim();
  return value ? value : null;
}

function getNumber(row: ChequeApiRow, ...keys: string[]): number {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}

function mapChequeRow(row: ChequeApiRow): ChequeRow {
  return {
    idCheque: getNumber(row, "idCheque", "IdCheque"),
    idBanco: getNumber(row, "idBanco", "IdBanco", "idbanco"),
    fechaCheque: getString(row, "fechaCheque", "FechaCheque", "fecha_cheque"),
    nroCheque: getString(row, "nroCheque", "NroCheque", "nro_cheque"),
    importe: getNumber(row, "importe", "Importe"),
    idMoneda: getNumber(row, "idMoneda", "IdMoneda", "idmoneda"),
    nombreMoneda: getNullableString(row, "nombreMoneda", "NombreMoneda", "nombremoneda", "moneda", "Moneda"),
    idEmpleado: getNumber(row, "idEmpleado", "IdEmpleado", "idempleado"),
    nombreEmpleado: getNullableString(
      row,
      "nombreEmpleado",
      "NombreEmpleado",
      "nombreempleado",
      "empleado",
      "Empleado",
      "nombreEmpleadoCJ",
      "NombreEmpleadoCJ",
      "nombreempleadocj"
    ),
    nombreBanco: getNullableString(row, "nombreBanco", "NombreBanco", "nombrebanco", "banco", "Banco"),
    idEstado: getNumber(row, "idEstado", "IdEstado", "idestado"),
    nombreEstado: getNullableString(row, "nombreEstado", "NombreEstado", "nombreestado", "estado", "Estado"),
    comentario: getNullableString(row, "comentario", "Comentario"),
    ruta: getNullableString(row, "ruta", "Ruta"),
    fechaCreacion: getNullableString(row, "fechaCreacion", "FechaCreacion", "fecha_creacion"),
    fechaModificacion: getNullableString(row, "fechaModificacion", "FechaModificacion", "fecha_modificacion"),
  };
}

export async function listarCheques(filtro: ChequeFiltro = {}): Promise<ChequeRow[]> {
  const response = await httpClient.get<ChequeApiRow[]>(BASE_URL, {
    params: {
      idEmpleado: sanitizeNumber(filtro.idEmpleado),
      idEstado: sanitizeNumber(filtro.idEstado),
    },
  });

  const rows = Array.isArray(response) ? response : [];
  return rows.map(mapChequeRow);
}

export async function obtenerCheque(idCheque: number): Promise<ChequeRow> {
  const response = await httpClient.get<ChequeApiRow>(`${BASE_URL}/${idCheque}`);
  return mapChequeRow(response ?? {});
}

export async function crearCheque(payload: ChequeGuardarRequest): Promise<ChequeRow> {
  const response = await httpClient.post<ChequeApiRow>(BASE_URL, payload);
  return mapChequeRow(response ?? {});
}

export async function actualizarCheque(idCheque: number, payload: ChequeGuardarRequest): Promise<ChequeRow> {
  const response = await httpClient.put<ChequeApiRow>(`${BASE_URL}/${idCheque}`, payload);
  return mapChequeRow(response ?? {});
}

export async function rechazarCheque(
  idCheque: number,
  payload: ChequeRechazarRequest
): Promise<ChequeRow> {
  const response = await httpClient.post<ChequeApiRow>(`${BASE_URL}/${idCheque}/rechazar`, payload);
  return mapChequeRow(response ?? {});
}

export async function subirImagenCheque(formData: FormData): Promise<ChequeImagenUploadResponse> {
  return await httpClient.post<ChequeImagenUploadResponse>(`${BASE_URL}/upload-imagen`, formData);
}

export async function obtenerAdjuntoCheque(ruta: string): Promise<Blob> {
  return await httpClient.get<Blob>(`${BASE_URL}/imagen`, {
    params: { ruta },
    responseType: "blob",
  });
}

export async function obtenerImagenCheque(ruta: string): Promise<Blob> {
  return await obtenerAdjuntoCheque(ruta);
}
