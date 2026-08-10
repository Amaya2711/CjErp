import httpClient from "./httpClient";
import type {
  ArrendamientosCommandResult,
  ArrendamientosDashboard,
  ArrendamientosDshPagosFiltro,
  ArrendamientosDshPagosResponse,
  ArrendamientosEstadoCuentaFiltro,
  ArrendamientosFila,
  ArrendamientosResumenAnualFiltro,
} from "../models/arrendamientos";

async function listarArrendamientos(
  endpoint: string,
  params?: Record<string, string | number | null | undefined>
): Promise<ArrendamientosFila[]> {
  const query = new URLSearchParams();

  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value != null && value !== "") {
      query.set(key, String(value));
    }
  });

  const url = query.toString() ? `/arrendamientos/${endpoint}?${query.toString()}` : `/arrendamientos/${endpoint}`;
  const response = await httpClient.get<ArrendamientosFila[]>(url);
  return Array.isArray(response) ? response : [];
}

async function guardarArrendamientos<T>(endpoint: string, payload: T): Promise<ArrendamientosCommandResult> {
  const response = await httpClient.post<ArrendamientosCommandResult>(`/arrendamientos/${endpoint}`, payload);
  return response ?? { success: true, message: "Operacion completada correctamente." };
}

export async function obtenerDashboardArrendamientos(): Promise<ArrendamientosDashboard> {
  const response = await httpClient.get<ArrendamientosDashboard>("/arrendamientos/dashboard");
  return (
    response ?? {
      arrendadoresActivos: 0,
      inquilinosActivos: 0,
      contratosVigentes: 0,
      obligacionesPendientes: 0,
      totalPendientePEN: 0,
      totalPendienteUSD: 0,
      pagosMesPEN: 0,
      pagosMesUSD: 0,
    }
  );
}

export const listarArrendadoresArrendamientos = () => listarArrendamientos("arrendadores");
export const listarInquilinosArrendamientos = () => listarArrendamientos("inquilinos");
export const listarInmueblesArrendamientos = () => listarArrendamientos("inmuebles");
export const listarUnidadesArrendamientos = () => listarArrendamientos("unidades");
export const listarContratosArrendamientos = () => listarArrendamientos("contratos");
export const listarObligacionesArrendamientos = () => listarArrendamientos("obligaciones");
export const listarPagosArrendamientos = (anio?: number | null) => listarArrendamientos("pagos", { anio });
export async function listarPagosDshResumenAnualArrendamientos(
  filtro?: ArrendamientosResumenAnualFiltro
): Promise<ArrendamientosFila[]> {
  const params = new URLSearchParams();

  if (filtro?.idInmueble != null) params.set("idInmueble", String(filtro.idInmueble));
  if (filtro?.idInquilino != null) params.set("idInquilino", String(filtro.idInquilino));
  if (filtro?.idArrendador != null) params.set("idArrendador", String(filtro.idArrendador));
  if (filtro?.anioInicio != null) params.set("anioInicio", String(filtro.anioInicio));
  if (filtro?.anioFin != null) params.set("anioFin", String(filtro.anioFin));

  const query = params.toString();
  const response = await httpClient.get<ArrendamientosFila[]>(
    query ? `/arrendamientos/pagosdsh/resumen-anual?${query}` : "/arrendamientos/pagosdsh/resumen-anual"
  );
  return Array.isArray(response) ? response : [];
}
export const listarFraccionamientosArrendamientos = () => listarArrendamientos("fraccionamientos");
export const listarGarantiasArrendamientos = () => listarArrendamientos("garantias");
export const listarArbitriosArrendamientos = () => listarArrendamientos("arbitrios");
export const listarTiposCambioArrendamientos = () => listarArrendamientos("tipos-cambio");

export async function consultarEstadoCuentaArrendamientos(
  filtro: ArrendamientosEstadoCuentaFiltro
): Promise<ArrendamientosFila[]> {
  const params = new URLSearchParams();

  if (filtro.idContrato != null) params.set("idContrato", String(filtro.idContrato));
  if (filtro.idInquilino != null) params.set("idInquilino", String(filtro.idInquilino));
  if (filtro.idConcepto != null) params.set("idConcepto", String(filtro.idConcepto));

  const query = params.toString();
  const response = await httpClient.get<ArrendamientosFila[]>(
    query ? `/arrendamientos/estado-cuenta?${query}` : "/arrendamientos/estado-cuenta"
  );
  return Array.isArray(response) ? response : [];
}

export async function obtenerDshPagosArrendamientos(
  filtro: ArrendamientosDshPagosFiltro
): Promise<ArrendamientosDshPagosResponse> {
  const params = new URLSearchParams();

  if (filtro.idInmueble != null) params.set("idInmueble", String(filtro.idInmueble));
  if (filtro.idInquilino != null) params.set("idInquilino", String(filtro.idInquilino));
  if (filtro.anio != null) params.set("anio", String(filtro.anio));

  const query = params.toString();
  const response = await httpClient.get<ArrendamientosDshPagosResponse>(
    query ? `/arrendamientos/dshpagos?${query}` : "/arrendamientos/dshpagos"
  );

  const fallback: ArrendamientosDshPagosResponse = {
    idInmuebleSeleccionado: null,
    idInquilinoSeleccionado: null,
    aniosDisponibles: [],
    inmuebles: [],
    inquilinos: [],
    kpi: {
      contratosActivos: 0,
      obligacionesPendientes: 0,
      saldoPendiente: 0,
      pagosAplicados: 0,
      ultimoPagoFecha: null,
      ultimoPagoImporte: 0,
      monedaBase: null,
    },
    principal: [],
    detalle: [],
  };

  if (!response) {
    return fallback;
  }

  return {
    ...fallback,
    ...response,
    aniosDisponibles: Array.isArray(response.aniosDisponibles) ? response.aniosDisponibles : [],
    inmuebles: Array.isArray(response.inmuebles) ? response.inmuebles : [],
    inquilinos: Array.isArray(response.inquilinos) ? response.inquilinos : [],
    principal: Array.isArray(response.principal) ? response.principal : [],
    detalle: Array.isArray(response.detalle) ? response.detalle : [],
    kpi: {
      ...fallback.kpi,
      ...(response.kpi ?? {}),
    },
  };
}

export async function crearArrendadorArrendamientos(payload: unknown) {
  return guardarArrendamientos("arrendadores", payload);
}

export async function crearInquilinoArrendamientos(payload: unknown) {
  return guardarArrendamientos("inquilinos", payload);
}

export async function crearInmuebleArrendamientos(payload: unknown) {
  return guardarArrendamientos("inmuebles", payload);
}

export async function crearUnidadArrendamientos(payload: unknown) {
  return guardarArrendamientos("unidades", payload);
}

export async function crearContratoArrendamientos(payload: unknown) {
  return guardarArrendamientos("contratos", payload);
}

export async function crearVersionContratoArrendamientos(payload: unknown) {
  return guardarArrendamientos("contratos/versiones", payload);
}

export async function crearObligacionesArrendamientos(payload: unknown) {
  return guardarArrendamientos("obligaciones/generar", payload);
}

export async function crearPagoArrendamientos(payload: unknown) {
  return guardarArrendamientos("pagos", payload);
}

export async function actualizarPagoArrendamientos(idPago: number, payload: unknown) {
  return guardarArrendamientos(`pagos/${idPago}`, payload);
}

export async function aprobarPagoArrendamientos(idPago: number, payload: unknown) {
  return guardarArrendamientos(`pagos/${idPago}/aprobar`, payload);
}

export async function aplicarPagoArrendamientos(idPago: number, payload: unknown) {
  return guardarArrendamientos(`pagos/${idPago}/aplicar`, payload);
}

export async function revertirPagoArrendamientos(idPago: number, payload: unknown) {
  return guardarArrendamientos(`pagos/${idPago}/revertir`, payload);
}

export async function crearFraccionamientoArrendamientos(payload: unknown) {
  return guardarArrendamientos("fraccionamientos", payload);
}

export async function crearGarantiaArrendamientos(payload: unknown) {
  return guardarArrendamientos("garantias", payload);
}

export async function crearCobranzaArrendamientos(payload: unknown) {
  return guardarArrendamientos("cobranzas", payload);
}

export async function crearArbitrioArrendamientos(payload: unknown) {
  return guardarArrendamientos("arbitrios", payload);
}

export async function crearTipoCambioArrendamientos(payload: unknown) {
  return guardarArrendamientos("tipos-cambio", payload);
}
