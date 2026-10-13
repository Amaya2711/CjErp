import httpClient from "./httpClient";

const BASE_URL = "/admin/beneficios";

/** 1 = Préstamo (cuotas mensuales), 2 = Adelanto de sueldo (1 cuota). */
export const TIPO_PRESTAMO = 1;
export const TIPO_ADELANTO = 2;

export type BeneficioEmpleado = {
  idEmpleado: number;
  nombreEmpleado?: string | null;
  nroDocumento?: string | null;
  idAptoBeneficio?: number | null;
};

export type Beneficio = {
  idBeneficio: number;
  idTipoBeneficio: number;
  tipoBeneficio?: string | null;
  idEmpleado: number;
  nombreEmpleado?: string | null;
  nroDocumento?: string | null;
  monto: number;
  meses: number;
  mesInicio?: string | null;
  fechaCreacion?: string | null;
  idEstado?: number | null;
  nombreCliente?: string | null;
  idAprobado?: number | null;
  txtAprobado?: string | null;
  idAprobador?: number | null;
  aprobador?: string | null;
  fechaAprobador?: string | null;
};

export type BeneficioCuota = {
  idBeneficio: number;
  mesPago?: string | null;
  monto: number;
  idEstado?: number | null;
};

export type BeneficioRegistrarRequest = {
  idTipoBeneficio: number;
  idEmpleado: number;
  monto: number;
  meses: number;
  /** Primer día del mes de inicio (yyyy-MM-dd). */
  mesInicio: string;
};

export type BeneficioAccionResultado = {
  idBeneficio: number;
  procesado: boolean;
  mensaje?: string | null;
  correoEnviado?: boolean | null;
  correoMensaje?: string | null;
};

function extraerArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function listarEmpleadosBeneficio(): Promise<BeneficioEmpleado[]> {
  return extraerArray<BeneficioEmpleado>(await httpClient.get<BeneficioEmpleado[]>(`${BASE_URL}/empleados`));
}

export async function listarBeneficios(params: {
  idEmpleado?: number;
  idTipoBeneficio?: number;
  idAprobado?: number;
} = {}): Promise<Beneficio[]> {
  return extraerArray<Beneficio>(await httpClient.get<Beneficio[]>(BASE_URL, { params }));
}

export async function obtenerCronogramaBeneficio(idBeneficio: number): Promise<BeneficioCuota[]> {
  return extraerArray<BeneficioCuota>(
    await httpClient.get<BeneficioCuota[]>(`${BASE_URL}/${idBeneficio}/cronograma`)
  );
}

export async function registrarBeneficio(payload: BeneficioRegistrarRequest): Promise<{ idBeneficio: number }> {
  return await httpClient.post<{ idBeneficio: number }>(BASE_URL, payload);
}

export async function aprobarBeneficios(idsBeneficio: number[]): Promise<BeneficioAccionResultado[]> {
  return extraerArray<BeneficioAccionResultado>(
    await httpClient.post<BeneficioAccionResultado[]>(`${BASE_URL}/aprobar`, { idsBeneficio })
  );
}

export async function rechazarBeneficios(idsBeneficio: number[]): Promise<BeneficioAccionResultado[]> {
  return extraerArray<BeneficioAccionResultado>(
    await httpClient.post<BeneficioAccionResultado[]>(`${BASE_URL}/rechazar`, { idsBeneficio })
  );
}

/** Descarga el PDF de la solicitud (carta de adelanto o préstamo). */
export async function descargarPdfBeneficio(idBeneficio: number): Promise<Blob> {
  return await httpClient.get<Blob>(`${BASE_URL}/${idBeneficio}/pdf`, { responseType: "blob" });
}
