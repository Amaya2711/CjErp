import { buscarOrdenCompraCabecera } from "../../api/ordenCompraService";
import { buildPlanillaConsultaEstadosRequest, consultarPlanillaEstados } from "../../api/planillaConsultaService";

export const RUTA_ALERTAS = "/inicio/alertas";

// Mismos criterios que la pantalla /inicio/alertas: OC pendientes de validar y gastos 0 = pendiente / 2 = observado.
const ESTADOS_GASTO_PENDIENTE = "0,2";

/** Cantidad de pendientes (OC + gastos) del empleado; falla de una fuente no impide contar la otra. */
export async function contarAlertasPendientes(idEmpleado: number): Promise<number> {
  if (!(idEmpleado > 0)) return 0;

  const [ordenes, gastos] = await Promise.all([
    buscarOrdenCompraCabecera({ idSolicitante: idEmpleado, soloPendientesAprobacion: true })
      .then((lista) => (Array.isArray(lista) ? lista.length : 0))
      .catch(() => 0),
    consultarPlanillaEstados(
      buildPlanillaConsultaEstadosRequest(
        [{ nombre: "Estados", valor: ESTADOS_GASTO_PENDIENTE, tipo: "string" }],
        { baseParams: { idCargo: null, idEmpleado: String(idEmpleado) } },
      ),
      { timeoutMs: 120000 },
    )
      .then((response) => (Array.isArray(response?.rows) ? response.rows.length : 0))
      .catch(() => 0),
  ]);

  return ordenes + gastos;
}
