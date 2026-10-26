import { useEffect, useState } from "react";
import { buscarOrdenCompraCabecera } from "../../api/ordenCompraService";
import { buildPlanillaConsultaEstadosRequest, consultarPlanillaEstados } from "../../api/planillaConsultaService";
import { listarBeneficios, TIPO_ADELANTO, TIPO_PRESTAMO } from "../../api/beneficioService";
import { ESTADO_DESCANSO, listarDescansos } from "../../api/descansoService";
import { listarVacaciones } from "../../api/vacacionesService";
import { getAuthUser } from "../../utils/authStorage";

export type AlertaKpiKey = "oc" | "gastos" | "vacaciones" | "descanso" | "adelanto" | "prestamo";

export type AlertasConteos = Record<AlertaKpiKey, number | null>;

const VACIO: AlertasConteos = { oc: null, gastos: null, vacaciones: null, descanso: null, adelanto: null, prestamo: null };

const toPositive = (v: unknown): number => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const campo = (row: Record<string, unknown>, nombre: string): unknown => {
  const clave = Object.keys(row).find((k) => k.toLowerCase() === nombre.toLowerCase());
  return clave ? row[clave] : undefined;
};

const ESTADOS_DESCANSO = new Set<number>([ESTADO_DESCANSO.PRIMERA, ESTADO_DESCANSO.SEGUNDA, ESTADO_DESCANSO.TERCERA, ESTADO_DESCANSO.CUARTA]);

/**
 * Totales de pendientes del empleado logueado, con los mismos criterios de /inicio/alertas
 * (cada total se resuelve de forma independiente; si falla, queda en null).
 */
export function useAlertasConteos(habilitado: boolean): AlertasConteos {
  const [conteos, setConteos] = useState<AlertasConteos>(VACIO);

  useEffect(() => {
    if (!habilitado) return;
    const user = getAuthUser();
    const idEmpleado = toPositive(user?.idEmpleado) || toPositive(user?.codEmp);
    const misIds = new Set([toPositive(user?.codEmp), toPositive(user?.idEmpleado)].filter((v) => v > 0));
    if (!idEmpleado) return;

    let cancelado = false;
    const fijar = (parcial: Partial<AlertasConteos>) => {
      if (!cancelado) setConteos((actual) => ({ ...actual, ...parcial }));
    };

    buscarOrdenCompraCabecera({ idSolicitante: idEmpleado, soloPendientesAprobacion: true })
      .then((lista) => fijar({ oc: Array.isArray(lista) ? lista.length : 0 }))
      .catch(() => undefined);

    consultarPlanillaEstados(
      buildPlanillaConsultaEstadosRequest(
        [
          { nombre: "Estados", valor: "0,2", tipo: "string" },
          { nombre: "ModoLiviano", valor: "true", tipo: "bool" },
        ],
        { baseParams: { idCargo: null, idEmpleado: String(idEmpleado) } },
      ),
      { timeoutMs: 120000 },
    )
      .then((resp) => {
        const filas = Array.isArray(resp?.rows) ? resp.rows : [];
        fijar({ gastos: filas.filter((r) => toPositive(campo(r, "Corre") ?? campo(r, "Correlativo")) > 0).length });
      })
      .catch(() => undefined);

    listarVacaciones({ maxRows: 5000 })
      .then((resp) => {
        const filas = Array.isArray(resp?.rows) ? resp.rows : [];
        const total = filas.filter((row) => {
          const idEstado = Number(campo(row, "IdEstado"));
          const validador = idEstado === 97 ? campo(row, "IdResponsableCj") : idEstado === 98 ? campo(row, "IdSegundoVacaciones") : idEstado === 99 ? campo(row, "IdTerceroVacaciones") : null;
          if (![97, 98, 99].includes(idEstado)) return false;
          return misIds.has(toPositive(campo(row, "IdEmpleadoCj"))) || misIds.has(toPositive(validador));
        }).length;
        fijar({ vacaciones: total });
      })
      .catch(() => undefined);

    const pendiente = (d: { idEstado: number }) => ESTADOS_DESCANSO.has(d.idEstado);
    Promise.all([
      Promise.all([...misIds].map((id) => listarDescansos({ idEmpleadoCj: id }))).then((l) => l.flat()),
      listarDescansos({ soloMios: true }).catch(() => []),
    ])
      .then(([propios, porValidar]) => {
        const claves = new Set<string>();
        for (const d of [...propios, ...porValidar].filter(pendiente)) {
          claves.add(`${d.idEmpleadoCj}|${String(d.fechaInicio).slice(0, 10)}|${String(d.fechaFin).slice(0, 10)}`);
        }
        fijar({ descanso: claves.size });
      })
      .catch(() => undefined);

    listarBeneficios({ idAprobado: 0 })
      .then((lista) => {
        const propios = lista.filter((b) => b.idEstado !== 0 && misIds.has(Number(b.idEmpleado)));
        const tipo = (b: { tipoBeneficio?: string | null }) => (b.tipoBeneficio ?? "").toUpperCase();
        fijar({
          adelanto: propios.filter((b) => b.idTipoBeneficio === TIPO_ADELANTO || tipo(b).includes("ADELANTO")).length,
          prestamo: propios.filter((b) => b.idTipoBeneficio === TIPO_PRESTAMO || tipo(b).includes("PRESTAMO") || tipo(b).includes("PRÉSTAMO")).length,
        });
      })
      .catch(() => undefined);

    return () => {
      cancelado = true;
    };
  }, [habilitado]);

  return conteos;
}
