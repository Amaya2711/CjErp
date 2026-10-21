import httpClient from "../../api/httpClient";

export const RUTA_ALERTAS = "/inicio/alertas";

/**
 * Indicador 0/1 de pendientes (OC por validar o gastos por atender) del empleado logueado.
 * Solo consulta totales (sp_OrdenCompra_ResumenEstados y sp_Planilla_Consulta_Estados_Resumen en el backend);
 * no carga el detalle de /inicio/alertas.
 */
export async function obtenerIndicadorPendientes(): Promise<number> {
  const response = await httpClient.get<{ indicador?: number }>("/inicio/indicadores/pendientes");
  return Number(response?.indicador ?? 0) || 0;
}
