import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { FileSpreadsheet } from "lucide-react";
import AppPage from "../../components/base/AppPage";
import AppStatusMessage from "../../components/base/AppStatusMessage";
import DataGridPro from "../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../components/datagrid/types";
import { buscarOrdenCompraCabecera, buscarOrdenCompraDetalle } from "../../api/ordenCompraService";
import type { OrdenCompraCabeceraDto } from "../../api/ordenCompraService";
import { buildPlanillaConsultaEstadosRequest, consultarPlanillaEstados } from "../../api/planillaConsultaService";
import { listarBeneficios, TIPO_ADELANTO, TIPO_PRESTAMO, type Beneficio } from "../../api/beneficioService";
import { ESTADO_DESCANSO, listarDescansos, type Descanso } from "../../api/descansoService";
import { listarVacaciones } from "../../api/vacacionesService";
import { getAuthUser } from "../../utils/authStorage";
import { getHttpErrorMessage } from "../../utils/httpError";

type AlertaTabKey = "oc" | "gastos" | "vacaciones" | "descanso" | "adelanto" | "prestamo";

type AlertaTab = {
  key: AlertaTabKey;
  label: string;
};

// Cada pestaña es un tipo de alerta por empleado; agregar aquí las siguientes.
// La cabecera no trae el tipo de trabajo: se completa con el detalle de la OC (valores distintos).
type OrdenCompraAlerta = OrdenCompraCabeceraDto & { tipoTrabajo: string };

const TABS: AlertaTab[] = [
  { key: "oc", label: "Órdenes de compra" },
  { key: "gastos", label: "Gastos" },
  { key: "vacaciones", label: "Vacaciones" },
  { key: "descanso", label: "Descanso médico" },
  { key: "adelanto", label: "Adelanto de sueldo" },
  { key: "prestamo", label: "Préstamo" },
];

// Descanso médico en aprobación (97 a 100): propios del empleado o que le toca validar (1ro/2do/3er validador).
type DescansoAlerta = {
  clave: string;
  empleado: string;
  fechaInicio: string;
  fechaFin: string;
  dias: number;
  estado: string;
  relacion: string;
};

const ESTADOS_DESCANSO_PENDIENTE: Record<number, string> = {
  [ESTADO_DESCANSO.PRIMERA]: "1ERA APROBACIÓN",
  [ESTADO_DESCANSO.SEGUNDA]: "2DA APROBACIÓN",
  [ESTADO_DESCANSO.TERCERA]: "3ERA APROBACIÓN",
  [ESTADO_DESCANSO.CUARTA]: "4TA APROBACIÓN",
};

function mapDescansoAlerta(d: Descanso, relacion: string): DescansoAlerta {
  const fechaInicio = fechaDia(d.fechaInicio);
  const fechaFin = fechaDia(d.fechaFin);
  return {
    clave: `${d.idEmpleadoCj}|${fechaInicio}|${fechaFin}`,
    empleado: (d.nombreEmpleado ?? "").trim(),
    fechaInicio,
    fechaFin,
    dias: Number(d.dias ?? 0),
    estado: ESTADOS_DESCANSO_PENDIENTE[d.idEstado] ?? (d.estado ?? "").trim(),
    relacion,
  };
}

// Beneficio (adelanto / préstamo) propio pendiente de aprobación (IdAprobado = 0), como en /recursoshumanos/beneficio.
type BeneficioAlerta = {
  idBeneficio: number;
  empleado: string;
  monto: number;
  meses: number;
  mesInicio: string;
  fechaCreacion: string;
  estado: string;
};

// Mes de inicio como texto MM/yyyy (puede llegar como fecha ISO, dd/MM/yyyy o ya como MM/yyyy).
function mesAnio(value: unknown): string {
  const texto = String(value ?? "").trim();
  const iso = /^(\d{4})-(\d{2})/.exec(texto);
  if (iso) return `${iso[2]}/${iso[1]}`;
  const dma = /^\d{2}\/(\d{2})\/(\d{4})/.exec(texto);
  return dma ? `${dma[1]}/${dma[2]}` : texto;
}

function mapBeneficioAlerta(b: Beneficio): BeneficioAlerta {
  return {
    idBeneficio: b.idBeneficio,
    empleado: (b.nombreEmpleado ?? "").trim(),
    monto: Number(b.monto ?? 0),
    meses: Number(b.meses ?? 0),
    mesInicio: mesAnio(b.mesInicio),
    fechaCreacion: fechaDia(b.fechaCreacion),
    estado: (b.txtAprobado ?? "").trim() || "PENDIENTE",
  };
}

// Vacaciones (legacy) pendientes de validar: 97 = 1ra validación, 98 = 2da, 99 = 3ra. Le corresponde al
// validador respectivo del empleado (EmpleadoCjDetalle: IdResponsableCj / IdSegundoVacaciones / IdTerceroVacaciones).
type VacacionAlerta = {
  clave: string;
  empleado: string;
  fechaInicio: string;
  fechaFin: string;
  dias: number;
  estado: string;
  saldo: number | null;
  /** "Mi solicitud" (el empleado es el usuario) o "Por validar" (el usuario es el validador de la etapa). */
  relacion: string;
};

const ESTADOS_VACACION: Record<number, string> = {
  97: "1ERA VALIDACIÓN",
  98: "2DA VALIDACIÓN",
  99: "3ERA VALIDACIÓN",
};

// Gasto (Planilla) pendiente del empleado: 0 = pendiente de 1ª aprobación, 2 = observado (por subsanar).
const ESTADOS_GASTO_PENDIENTE = "0,2";

type GastoAlerta = {
  corre: number;
  fecha: string;
  cliente: string;
  proyecto: string;
  site: string;
  tipoTrabajo: string;
  detalle: string;
  observacion: string;
  solicitante: string;
  total: number;
  moneda: string;
  estado: string;
};

// Lee el valor de una fila del SP sin depender de mayúsculas/minúsculas del alias.
// Respeta el orden de prioridad de `nombres` (no el orden de columnas de la fila) y salta valores vacíos.
function leerCampo(row: Record<string, unknown>, ...nombres: string[]): unknown {
  const claves = Object.keys(row);
  for (const nombre of nombres) {
    const clave = claves.find((k) => k.toLowerCase() === nombre.toLowerCase());
    if (clave && row[clave] != null && String(row[clave]).trim() !== "") return row[clave];
  }
  return undefined;
}

// Identificadores numéricos (correlativo, OC, N°): sin separador de miles.
const formatoId = (valor: unknown) => String(valor ?? "");

// FecIngreso llega como dd/MM/yyyy; se convierte a ISO para ordenar y filtrar como fecha.
function fechaIso(value: unknown): string {
  const texto = String(value ?? "").trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(texto);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : texto;
}

function mapGastoRow(row: Record<string, unknown>): GastoAlerta {
  const texto = (...n: string[]) => String(leerCampo(row, ...n) ?? "").trim();
  return {
    corre: Number(leerCampo(row, "Corre", "Correlativo") ?? 0),
    fecha: fechaIso(leerCampo(row, "FecIngreso")),
    cliente: texto("Cliente"),
    proyecto: texto("NombreProyecto"),
    site: texto("Site"),
    tipoTrabajo: texto("Tipo_Trabajo", "TipoTrabajo"),
    detalle: texto("Detalle"),
    observacion: texto("ObservacionPlanilla", "Observacion"),
    solicitante: texto("Solicitante"),
    // Total en la moneda real del recibo, sin convertir a soles.
    total: Number(leerCampo(row, "Total") ?? 0),
    moneda: texto("Moneda"),
    estado: texto("EstadoNombre") || texto("Estado"),
  };
}

function fechaDia(value: unknown): string {
  const texto = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(texto) ? texto.slice(0, 10) : fechaIso(texto);
}

function mapVacacionAlerta(row: Record<string, unknown>, index: number, misIds: Set<number>): VacacionAlerta | null {
  const num = (...n: string[]) => {
    const valor = leerCampo(row, ...n);
    const parsed = Number(valor);
    return valor == null || valor === "" || !Number.isFinite(parsed) ? null : parsed;
  };
  const idEstado = num("IdEstado") ?? 0;
  const validador = idEstado === 97 ? num("IdResponsableCj") : idEstado === 98 ? num("IdSegundoVacaciones") : idEstado === 99 ? num("IdTerceroVacaciones") : null;
  if (!ESTADOS_VACACION[idEstado]) return null;
  const idDueno = num("IdEmpleadoCj");
  const esMia = idDueno != null && misIds.has(idDueno);
  const porValidar = validador != null && misIds.has(validador);
  if (!esMia && !porValidar) return null;

  const fechaInicio = fechaDia(leerCampo(row, "FechaInicio"));
  const fechaFin = fechaDia(leerCampo(row, "FechaFin"));
  const dias = fechaInicio && fechaFin
    ? Math.round((new Date(`${fechaFin}T00:00:00`).getTime() - new Date(`${fechaInicio}T00:00:00`).getTime()) / 86_400_000) + 1
    : 0;
  return {
    clave: `${num("IdEmpleadoCj") ?? index}|${fechaInicio}|${fechaFin}`,
    empleado: String(leerCampo(row, "NombreEmpleado") ?? "").trim(),
    fechaInicio,
    fechaFin,
    dias: Number.isFinite(dias) ? dias : 0,
    estado: ESTADOS_VACACION[idEstado],
    saldo: num("SaldoVacaciones"),
    relacion: porValidar ? "Por validar" : "Mi solicitud",
  };
}

function estadoVacacionTono(estado: string): { color: string; background: string } {
  if (estado.startsWith("1")) return { color: "#3730A3", background: "#EEF2FF" };
  if (estado.startsWith("2")) return { color: "#0369A1", background: "#F0F9FF" };
  return { color: "#B45309", background: "#FEF3C7" };
}

function toPositiveNumber(...values: Array<string | number | null | undefined>): number {
  for (const value of values) {
    if (value == null) continue;
    const parsed = Number(String(value).trim());
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

// Un color distinto por estado. Textos de sp_OrdenCompra_BuscarCabecera: "en Pre Aprob.", "En 1era aprobacion",
// "En 2da Aprob.", "En 3era Aprob.", "Aprobado" y "RECHAZADO". Los niveles se evalúan antes que "aprob".
function estadoTono(estado: string): { color: string; background: string } {
  const texto = estado.toLowerCase();
  if (texto.includes("rechaz")) return { color: "#B91C1C", background: "#FEE2E2" }; // rojo
  if (texto.includes("pre")) return { color: "#475569", background: "#E2E8F0" }; // gris
  if (/\b1(er|era|ra)\b/.test(texto)) return { color: "#9A6700", background: "#FEF3C7" }; // amarillo
  if (/\b2(da|a)\b/.test(texto)) return { color: "#C2410C", background: "#FFEDD5" }; // naranja
  if (/\b3(er|era|ra)\b/.test(texto)) return { color: "#1D4ED8", background: "#DBEAFE" }; // azul
  if (texto.includes("aprob")) return { color: "#047857", background: "#DCFCE7" }; // verde
  return { color: "#6D28D9", background: "#EDE9FE" }; // morado: otro estado
}

function estadoGastoTono(estado: string): { color: string; background: string } {
  const texto = estado.toLowerCase();
  if (texto.includes("rechaz")) return { color: "#B91C1C", background: "#FEE2E2" }; // rojo
  if (texto.includes("observ")) return { color: "#C2410C", background: "#FFEDD5" }; // naranja
  if (texto.includes("pend")) return { color: "#9A6700", background: "#FEF3C7" }; // amarillo
  if (texto.includes("pagad")) return { color: "#047857", background: "#DCFCE7" }; // verde
  if (texto.includes("aprob")) return { color: "#1D4ED8", background: "#DBEAFE" }; // azul
  return { color: "#475569", background: "#E2E8F0" }; // gris
}

function EstadoBadge({
  value,
  tono = estadoTono,
}: {
  value: string;
  tono?: (estado: string) => { color: string; background: string };
}) {
  if (!value) return <span>-</span>;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 800,
        lineHeight: 1,
        whiteSpace: "nowrap",
        ...tono(value),
      }}
    >
      {value}
    </span>
  );
}

// Subir el sufijo al cambiar columnas/orden para no heredar la configuración guardada en el navegador.
const GRID_STATE_KEY = "alertas_oc_v4";
const GRID_STATE_KEY_GASTOS = "alertas_gastos_v2";
const GRID_STATE_KEY_DESCANSO = "alertas_descanso_v1";
const GRID_STATE_KEY_ADELANTO = "alertas_adelanto_v2";
const GRID_STATE_KEY_PRESTAMO = "alertas_prestamo_v2";
const GRID_STATE_KEY_VACACIONES = "alertas_vacaciones_v2";

const COLUMNAS_OC: GridColumn<OrdenCompraAlerta>[] = [
  { dataField: "idOc", caption: "OC", dataType: "number", width: 90, alignment: "left", format: formatoId },
  { dataField: "fecha", caption: "Fecha", dataType: "date", width: 110 },
  { dataField: "nombreCliente", caption: "Cliente", minWidth: 160 },
  { dataField: "nombreProyecto", caption: "Proyecto", minWidth: 160 },
  { dataField: "nombreSite", caption: "Site", minWidth: 160 },
  { dataField: "tipoTrabajo", caption: "Tipo trabajo", minWidth: 150 },
  { dataField: "responsable", caption: "Responsable", minWidth: 180 },
  // Total en la moneda real de la OC, sin convertir a soles.
  { dataField: "total", caption: "Total", dataType: "number", width: 130, format: { type: "fixedPoint", precision: 2 } },
  { dataField: "moneda", caption: "Moneda", width: 100, alignment: "center" },
  {
    dataField: "estado",
    caption: "Estado",
    width: 150,
    cellRender: (value) => <EstadoBadge value={String(value ?? "").trim()} />,
  },
];

const COLUMNAS_GASTOS: GridColumn<GastoAlerta>[] = [
  { dataField: "corre", caption: "Correlativo", dataType: "number", width: 110, alignment: "left", format: formatoId },
  { dataField: "fecha", caption: "Fecha", dataType: "date", width: 110 },
  { dataField: "cliente", caption: "Cliente", minWidth: 160 },
  { dataField: "proyecto", caption: "Proyecto", minWidth: 160 },
  { dataField: "site", caption: "Site", minWidth: 160 },
  { dataField: "tipoTrabajo", caption: "Tipo trabajo", minWidth: 150 },
  { dataField: "detalle", caption: "Detalle", minWidth: 220 },
  { dataField: "observacion", caption: "Observación", minWidth: 240 },
  { dataField: "total", caption: "Total", dataType: "number", width: 130, format: { type: "fixedPoint", precision: 2 } },
  { dataField: "moneda", caption: "Moneda", width: 100, alignment: "center" },
  {
    dataField: "estado",
    caption: "Estado",
    width: 150,
    cellRender: (value) => <EstadoBadge value={String(value ?? "").trim()} tono={estadoGastoTono} />,
  },
];

const COLUMNAS_VACACIONES: GridColumn<VacacionAlerta>[] = [
  { dataField: "empleado", caption: "Empleado", minWidth: 220 },
  { dataField: "fechaInicio", caption: "Fecha inicio", dataType: "date", width: 120 },
  { dataField: "fechaFin", caption: "Fecha fin", dataType: "date", width: 120 },
  { dataField: "dias", caption: "Días", dataType: "number", width: 80, alignment: "right" },
  { dataField: "relacion", caption: "Relación", width: 120 },
  { dataField: "saldo", caption: "Saldo", dataType: "number", width: 100, alignment: "right" },
  {
    dataField: "estado",
    caption: "Estado",
    width: 170,
    cellRender: (value) => <EstadoBadge value={String(value ?? "").trim()} tono={estadoVacacionTono} />,
  },
];

const COLUMNAS_DESCANSO: GridColumn<DescansoAlerta>[] = [
  { dataField: "empleado", caption: "Empleado", minWidth: 220 },
  { dataField: "fechaInicio", caption: "Fecha inicio", dataType: "date", width: 120 },
  { dataField: "fechaFin", caption: "Fecha fin", dataType: "date", width: 120 },
  { dataField: "dias", caption: "Días", dataType: "number", width: 80, alignment: "right" },
  { dataField: "relacion", caption: "Relación", width: 120 },
  {
    dataField: "estado",
    caption: "Estado",
    width: 170,
    cellRender: (value) => <EstadoBadge value={String(value ?? "").trim()} tono={estadoVacacionTono} />,
  },
];

const COLUMNAS_BENEFICIO: GridColumn<BeneficioAlerta>[] = [
  { dataField: "idBeneficio", caption: "N°", dataType: "number", width: 110, alignment: "left", format: formatoId },
  { dataField: "empleado", caption: "Empleado", minWidth: 220 },
  { dataField: "fechaCreacion", caption: "Fecha solicitud", dataType: "date", width: 130 },
  { dataField: "mesInicio", caption: "Mes inicio", width: 110, alignment: "center" },
  { dataField: "monto", caption: "Monto", dataType: "number", width: 120, format: { type: "fixedPoint", precision: 2 } },
  { dataField: "meses", caption: "Cuotas", dataType: "number", width: 90, alignment: "right" },
  {
    dataField: "estado",
    caption: "Estado",
    width: 150,
    cellRender: (value) => <EstadoBadge value={String(value ?? "").trim()} tono={estadoGastoTono} />,
  },
];

const styles: Record<string, CSSProperties> = {
  tabs: { display: "flex", gap: 8, borderBottom: "1px solid #E5E7EB", marginBottom: 16 },
  exportar: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    border: "1px solid #CBD5E1",
    borderRadius: 8,
    background: "#FFFFFF",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    color: "#334155",
  },
  tab: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 700,
    color: "#64748B",
    borderBottom: "2px solid transparent",
  },
  tabActive: { color: "#0F172A", borderBottom: "2px solid #2563EB" },
  badge: {
    minWidth: 22,
    padding: "1px 7px",
    borderRadius: 999,
    background: "#DC2626",
    color: "#FFFFFF",
    fontSize: 12,
    textAlign: "center",
  },
  badgeEmpty: { background: "#CBD5E1" },
  kpis: { display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 },
  kpi: {
    minWidth: 150,
    padding: "10px 16px",
    borderRadius: 12,
    border: "1px solid #E5E7EB",
    background: "#FFFFFF",
    cursor: "pointer",
    textAlign: "left",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    font: "inherit",
  },
  kpiLabel: { fontSize: 12, fontWeight: 700 },
  kpiValor: { fontSize: 24, fontWeight: 800, lineHeight: 1 },
};

export default function AlertasPage() {
  const authUser = getAuthUser();
  const idEmpleado = toPositiveNumber(authUser?.idEmpleado, authUser?.codEmp);

  const [tab, setTab] = useState<AlertaTabKey>("oc");
  // Si el usuario aún no eligió pestaña, al terminar de cargar se abre la primera que tenga pendientes.
  const [tabElegida, setTabElegida] = useState(false);
  const [ordenes, setOrdenes] = useState<OrdenCompraAlerta[]>([]);
  const [loading, setLoading] = useState(idEmpleado > 0);
  const [error, setError] = useState("");
  const [gastos, setGastos] = useState<GastoAlerta[]>([]);
  const [loadingGastos, setLoadingGastos] = useState(idEmpleado > 0);
  const [errorGastos, setErrorGastos] = useState("");
  const [descansos, setDescansos] = useState<DescansoAlerta[]>([]);
  const [loadingDescansos, setLoadingDescansos] = useState(idEmpleado > 0);
  const [errorDescansos, setErrorDescansos] = useState("");
  const [adelantos, setAdelantos] = useState<BeneficioAlerta[]>([]);
  const [prestamos, setPrestamos] = useState<BeneficioAlerta[]>([]);
  const [loadingBeneficios, setLoadingBeneficios] = useState(idEmpleado > 0);
  const [errorBeneficios, setErrorBeneficios] = useState("");
  const [vacaciones, setVacaciones] = useState<VacacionAlerta[]>([]);
  const [loadingVacaciones, setLoadingVacaciones] = useState(idEmpleado > 0);
  const [errorVacaciones, setErrorVacaciones] = useState("");
  // Estado elegido en los KPI de Gastos; vacío = sin filtro. Clic otra vez sobre el mismo KPI lo revierte.
  const [estadoGasto, setEstadoGasto] = useState("");

  // sp_OrdenCompra_BuscarCabecera con @IdSolicitante = empleado logueado; solo las pendientes de validar.
  useEffect(() => {
    if (!idEmpleado) return;
    let cancelado = false;
    buscarOrdenCompraCabecera({ idSolicitante: idEmpleado, soloPendientesAprobacion: true })
      .then(async (cabeceras) => {
        const lista = Array.isArray(cabeceras) ? cabeceras : [];
        // El detalle se consulta por OC (como en oc_v1/oc_v2): el SP no garantiza filtrar por solicitante.
        const tiposPorOc = new Map<number, string>();
        const idsOc = [...new Set(lista.map((oc) => oc.idOc))];
        for (let i = 0; i < idsOc.length; i += 3) {
          if (cancelado) return;
          await Promise.all(
            idsOc.slice(i, i + 3).map(async (idOc) => {
              try {
                const detalles = await buscarOrdenCompraDetalle({ idOc: String(idOc) });
                const tipos = new Set<string>();
                for (const detalle of Array.isArray(detalles) ? detalles : []) {
                  const tipo = (detalle.tipoTrabajo ?? "").trim();
                  if (tipo) tipos.add(tipo);
                }
                tiposPorOc.set(idOc, [...tipos].join(", "));
              } catch {
                tiposPorOc.set(idOc, "");
              }
            }),
          );
        }
        if (cancelado) return;
        setOrdenes(lista.map((oc) => ({ ...oc, tipoTrabajo: tiposPorOc.get(oc.idOc) ?? "" })));
      })
      .catch((loadError) => {
        if (!cancelado) setError(getHttpErrorMessage(loadError, "No se pudieron cargar las órdenes de compra pendientes."));
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, [idEmpleado]);

  // sp_Planilla_Consulta_Estados con @IdEmpleado = empleado logueado (sin IdCargo: el SP no debe saltarse el filtro).
  useEffect(() => {
    if (!idEmpleado) return;
    let cancelado = false;
    consultarPlanillaEstados(
      buildPlanillaConsultaEstadosRequest(
        [
          { nombre: "Estados", valor: ESTADOS_GASTO_PENDIENTE, tipo: "string" },
          // Solo se listan filas: ModoLiviano omite los totales por OT/Importar/OC/banco que esta pantalla no muestra.
          { nombre: "ModoLiviano", valor: "true", tipo: "bool" },
        ],
        { baseParams: { idCargo: null, idEmpleado: String(idEmpleado) } },
      ),
      { timeoutMs: 120000 },
    )
      .then((response) => {
        if (cancelado) return;
        const filas = Array.isArray(response?.rows) ? response.rows : [];
        setGastos(filas.map(mapGastoRow).filter((g) => g.corre > 0));
      })
      .catch((loadError) => {
        if (!cancelado) setErrorGastos(getHttpErrorMessage(loadError, "No se pudieron cargar los gastos pendientes."));
      })
      .finally(() => {
        if (!cancelado) setLoadingGastos(false);
      });
    return () => {
      cancelado = true;
    };
  }, [idEmpleado]);

  // Vacaciones pendientes propias del usuario o cuyo validador de la etapa actual es el usuario (EmpleadoCj = codEmp).
  useEffect(() => {
    const misIds = new Set([authUser?.codEmp, authUser?.idEmpleado].map((v) => toPositiveNumber(v)).filter((v) => v > 0));
    if (misIds.size === 0) {
      setLoadingVacaciones(false);
      return;
    }
    let cancelado = false;
    listarVacaciones({ maxRows: 5000 })
      .then((response) => {
        if (cancelado) return;
        const filas = Array.isArray(response?.rows) ? response.rows : [];
        setVacaciones(filas.map((row, i) => mapVacacionAlerta(row, i, misIds)).filter((v): v is VacacionAlerta => v !== null));
      })
      .catch((loadError) => {
        if (!cancelado) setErrorVacaciones(getHttpErrorMessage(loadError, "No se pudieron cargar las vacaciones pendientes."));
      })
      .finally(() => {
        if (!cancelado) setLoadingVacaciones(false);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idEmpleado]);

  // Descansos médicos en aprobación: los del propio empleado y los que le toca validar (soloMios = validador del JWT).
  useEffect(() => {
    const misIds = [...new Set([authUser?.codEmp, authUser?.idEmpleado].map((v) => toPositiveNumber(v)).filter((v) => v > 0))];
    if (misIds.length === 0) {
      setLoadingDescansos(false);
      return;
    }
    let cancelado = false;
    const pendiente = (d: Descanso) => d.idEstado in ESTADOS_DESCANSO_PENDIENTE;
    Promise.all([
      Promise.all(misIds.map((id) => listarDescansos({ idEmpleadoCj: id }))).then((listas) => listas.flat()),
      // Si el SP aún no tiene @IdValidador esta consulta falla: se ignora y quedan solo los propios.
      listarDescansos({ soloMios: true }).catch(() => [] as Descanso[]),
    ])
      .then(([propios, porValidar]) => {
        if (cancelado) return;
        const mapa = new Map<string, DescansoAlerta>();
        for (const d of propios.filter(pendiente)) mapa.set(mapDescansoAlerta(d, "").clave, mapDescansoAlerta(d, "Mi solicitud"));
        for (const d of porValidar.filter(pendiente)) {
          const alerta = mapDescansoAlerta(d, "Por validar");
          mapa.set(alerta.clave, alerta);
        }
        setDescansos([...mapa.values()]);
      })
      .catch((loadError) => {
        if (!cancelado) setErrorDescansos(getHttpErrorMessage(loadError, "No se pudieron cargar los descansos médicos pendientes."));
      })
      .finally(() => {
        if (!cancelado) setLoadingDescansos(false);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idEmpleado]);

  // Adelantos y préstamos sin aprobar (sp_Beneficio_Listar @IdAprobado = 0).
  useEffect(() => {
    const misIds = new Set([authUser?.codEmp, authUser?.idEmpleado].map((v) => toPositiveNumber(v)).filter((v) => v > 0));
    if (misIds.size === 0) {
      setLoadingBeneficios(false);
      return;
    }
    let cancelado = false;
    // Solo los beneficios pendientes del empleado que ingresó (EmpleadoCj = codEmp).
    listarBeneficios({ idAprobado: 0 })
      .then((lista) => {
        if (cancelado) return;
        const propios = lista.filter((b) => b.idEstado !== 0 && misIds.has(Number(b.idEmpleado)));
        // Por id de tipo o, si no coincide, por el texto del tipo ("PRESTAMO" / "ADELANTO ...").
        const tipoTexto = (b: Beneficio) => (b.tipoBeneficio ?? "").toUpperCase();
        setAdelantos(propios.filter((b) => b.idTipoBeneficio === TIPO_ADELANTO || tipoTexto(b).includes("ADELANTO")).map(mapBeneficioAlerta));
        setPrestamos(propios.filter((b) => b.idTipoBeneficio === TIPO_PRESTAMO || tipoTexto(b).includes("PRESTAMO") || tipoTexto(b).includes("PRÉSTAMO")).map(mapBeneficioAlerta));
      })
      .catch((loadError) => {
        if (!cancelado) setErrorBeneficios(getHttpErrorMessage(loadError, "No se pudieron cargar los adelantos y préstamos pendientes."));
      })
      .finally(() => {
        if (!cancelado) setLoadingBeneficios(false);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idEmpleado]);

  const kpisGastos = useMemo(() => {
    const porEstado = new Map<string, number>();
    for (const gasto of gastos) {
      const estado = gasto.estado || "Sin estado";
      porEstado.set(estado, (porEstado.get(estado) ?? 0) + 1);
    }
    return [...porEstado.entries()].sort((a, b) => b[1] - a[1]);
  }, [gastos]);

  const gastosVisibles = useMemo(
    () => (estadoGasto ? gastos.filter((g) => (g.estado || "Sin estado") === estadoGasto) : gastos),
    [gastos, estadoGasto],
  );

  // Ambas pestañas se cargan al entrar a la página; el contador indica si cada una sigue cargando o falló.
  const estadoCarga: Record<AlertaTabKey, "cargando" | "error" | "ok"> = {
    oc: loading ? "cargando" : error ? "error" : "ok",
    gastos: loadingGastos ? "cargando" : errorGastos ? "error" : "ok",
    vacaciones: loadingVacaciones ? "cargando" : errorVacaciones ? "error" : "ok",
    descanso: loadingDescansos ? "cargando" : errorDescansos ? "error" : "ok",
    adelanto: loadingBeneficios ? "cargando" : errorBeneficios ? "error" : "ok",
    prestamo: loadingBeneficios ? "cargando" : errorBeneficios ? "error" : "ok",
  };

  const contadores = useMemo<Record<AlertaTabKey, number>>(
    () => ({ oc: ordenes.length, gastos: gastos.length, vacaciones: vacaciones.length, descanso: descansos.length, adelanto: adelantos.length, prestamo: prestamos.length }),
    [ordenes, gastos, vacaciones, descansos, adelantos, prestamos],
  );

  const cargando = Object.values(estadoCarga).some((estado) => estado === "cargando");
  useEffect(() => {
    if (tabElegida || cargando) return;
    const primera = TABS.find((item) => contadores[item.key] > 0);
    if (primera) setTab(primera.key);
  }, [cargando, contadores, tabElegida]);

  // Exporta a un solo Excel todas las pestañas (una hoja por pestaña, con los mismos encabezados del grid).
  const exportarTodo = async () => {
    const XLSX = await import("xlsx");
    const hoja = <T extends object>(columnas: GridColumn<T>[], filas: T[]) =>
      filas.map((fila) => {
        const salida: Record<string, string | number> = {};
        for (const c of columnas) {
          const valor = (fila as Record<string, unknown>)[c.dataField];
          salida[c.caption ?? c.dataField] =
            typeof valor === "number" ? valor : valor == null || valor === "" ? "" : String(valor);
        }
        return salida;
      });
    const hojas: Array<[string, Record<string, string | number>[]]> = [
      ["Órdenes de compra", hoja(COLUMNAS_OC, ordenes)],
      ["Gastos", hoja(COLUMNAS_GASTOS, gastos)],
      ["Vacaciones", hoja(COLUMNAS_VACACIONES, vacaciones)],
      ["Descanso médico", hoja(COLUMNAS_DESCANSO, descansos)],
      ["Adelanto de sueldo", hoja(COLUMNAS_BENEFICIO, adelantos)],
      ["Préstamo", hoja(COLUMNAS_BENEFICIO, prestamos)],
    ];
    const libro = XLSX.utils.book_new();
    for (const [nombre, filas] of hojas) {
      // Una pestaña sin alertas se exporta igual, con una hoja vacía, para que el archivo siempre tenga las 6.
      const hojaXlsx = filas.length ? XLSX.utils.json_to_sheet(filas) : XLSX.utils.aoa_to_sheet([["Sin alertas pendientes"]]);
      if (filas.length) {
        hojaXlsx["!cols"] = Object.keys(filas[0]).map((encabezado) => ({ wch: Math.min(Math.max(encabezado.length + 2, 14), 40) }));
      }
      XLSX.utils.book_append_sheet(libro, hojaXlsx, nombre);
    }
    const hoy = new Date();
    const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    XLSX.writeFile(libro, `alertas_${fecha}.xlsx`);
  };

  return (
    <AppPage
      title="Alertas - Notificaciones"
      actions={
        <button
          type="button"
          style={styles.exportar}
          disabled={cargando || idEmpleado <= 0}
          onClick={() => void exportarTodo()}
          title="Exportar todas las pestañas a un Excel"
        >
          <FileSpreadsheet size={16} color="#15803D" />
          Exportar
        </button>
      }
    >
      <div style={styles.tabs}>
        {TABS.map((item) => {
          const total = contadores[item.key];
          return (
            <button
              key={item.key}
              type="button"
              style={{ ...styles.tab, ...(tab === item.key ? styles.tabActive : null) }}
              onClick={() => {
                setTabElegida(true);
                setTab(item.key);
              }}
            >
              {item.label}
              <span style={{ ...styles.badge, ...(estadoCarga[item.key] !== "ok" || total === 0 ? styles.badgeEmpty : null) }}>
                {estadoCarga[item.key] === "cargando" ? "…" : estadoCarga[item.key] === "error" ? "!" : total}
              </span>
            </button>
          );
        })}
      </div>

      {!idEmpleado && (
        <AppStatusMessage tone="error">No se pudo identificar el empleado de la sesión.</AppStatusMessage>
      )}
      {tab === "oc" && error && <AppStatusMessage tone="error">{error}</AppStatusMessage>}
      {tab === "oc" && loading && <AppStatusMessage>Cargando alertas...</AppStatusMessage>}
      {tab === "gastos" && errorGastos && <AppStatusMessage tone="error">{errorGastos}</AppStatusMessage>}
      {tab === "gastos" && loadingGastos && <AppStatusMessage>Cargando alertas...</AppStatusMessage>}

      {tab === "vacaciones" && errorVacaciones && <AppStatusMessage tone="error">{errorVacaciones}</AppStatusMessage>}
      {tab === "vacaciones" && loadingVacaciones && <AppStatusMessage>Cargando alertas...</AppStatusMessage>}

      {tab === "vacaciones" && !loadingVacaciones && idEmpleado > 0 && !errorVacaciones && (
        vacaciones.length === 0 ? (
          <AppStatusMessage tone="success">No tienes vacaciones pendientes.</AppStatusMessage>
        ) : (
          <DataGridPro<VacacionAlerta>
            key={GRID_STATE_KEY_VACACIONES}
            dataSource={vacaciones}
            columns={COLUMNAS_VACACIONES}
            keyExpr="clave"
            height="65vh"
            noDataText="No hay vacaciones pendientes."
            stateStoringKey={GRID_STATE_KEY_VACACIONES}
            exportFileName="alertas_vacaciones_pendientes"
            autoExpandAll={false}
            paging={{ pageSize: 50, pageSizes: [20, 50, 100, 250] }}
          />
        )
      )}

      {tab === "descanso" && errorDescansos && <AppStatusMessage tone="error">{errorDescansos}</AppStatusMessage>}
      {tab === "descanso" && loadingDescansos && <AppStatusMessage>Cargando alertas...</AppStatusMessage>}

      {tab === "descanso" && !loadingDescansos && idEmpleado > 0 && !errorDescansos && (
        descansos.length === 0 ? (
          <AppStatusMessage tone="success">No tienes descansos médicos pendientes.</AppStatusMessage>
        ) : (
          <DataGridPro<DescansoAlerta>
            key={GRID_STATE_KEY_DESCANSO}
            dataSource={descansos}
            columns={COLUMNAS_DESCANSO}
            keyExpr="clave"
            height="65vh"
            noDataText="No hay descansos médicos pendientes."
            stateStoringKey={GRID_STATE_KEY_DESCANSO}
            exportFileName="alertas_descanso_medico_pendientes"
            autoExpandAll={false}
            paging={{ pageSize: 50, pageSizes: [20, 50, 100, 250] }}
          />
        )
      )}

      {(tab === "adelanto" || tab === "prestamo") && errorBeneficios && <AppStatusMessage tone="error">{errorBeneficios}</AppStatusMessage>}
      {(tab === "adelanto" || tab === "prestamo") && loadingBeneficios && <AppStatusMessage>Cargando alertas...</AppStatusMessage>}

      {(tab === "adelanto" || tab === "prestamo") && !loadingBeneficios && idEmpleado > 0 && !errorBeneficios && (() => {
        const esAdelanto = tab === "adelanto";
        const filas = esAdelanto ? adelantos : prestamos;
        const clave = esAdelanto ? GRID_STATE_KEY_ADELANTO : GRID_STATE_KEY_PRESTAMO;
        return filas.length === 0 ? (
          <AppStatusMessage tone="success">{esAdelanto ? "No hay adelantos de sueldo pendientes." : "No hay préstamos pendientes."}</AppStatusMessage>
        ) : (
          <DataGridPro<BeneficioAlerta>
            key={clave}
            dataSource={filas}
            columns={COLUMNAS_BENEFICIO}
            keyExpr={(row) => String(row.idBeneficio)}
            height="65vh"
            noDataText="No hay solicitudes pendientes."
            stateStoringKey={clave}
            exportFileName={esAdelanto ? "alertas_adelantos_pendientes" : "alertas_prestamos_pendientes"}
            autoExpandAll={false}
            paging={{ pageSize: 50, pageSizes: [20, 50, 100, 250] }}
          />
        );
      })()}

      {tab === "oc" && !loading && idEmpleado > 0 && !error && (
        ordenes.length === 0 ? (
          <AppStatusMessage tone="success">No tienes órdenes de compra pendientes.</AppStatusMessage>
        ) : (
          <DataGridPro<OrdenCompraAlerta>
            key={GRID_STATE_KEY}
            dataSource={ordenes}
            columns={COLUMNAS_OC}
            keyExpr="idOc"
            height="65vh"
            noDataText="No hay órdenes de compra pendientes."
            stateStoringKey={GRID_STATE_KEY}
            exportFileName="alertas_oc_pendientes"
            autoExpandAll={false}
            paging={{ pageSize: 50, pageSizes: [20, 50, 100, 250] }}
          />
        )
      )}

      {tab === "gastos" && !loadingGastos && idEmpleado > 0 && !errorGastos && (
        gastos.length === 0 ? (
          <AppStatusMessage tone="success">No tienes gastos pendientes.</AppStatusMessage>
        ) : (
          <>
            <div style={styles.kpis}>
              {kpisGastos.map(([estado, cantidad]) => {
                const activo = estadoGasto === estado;
                const { color, background } = estadoGastoTono(estado);
                return (
                  <button
                    key={estado}
                    type="button"
                    aria-pressed={activo}
                    title={activo ? "Quitar filtro" : `Filtrar por ${estado}`}
                    style={{
                      ...styles.kpi,
                      background,
                      color,
                      border: `2px solid ${activo ? color : "transparent"}`,
                      opacity: estadoGasto && !activo ? 0.55 : 1,
                    }}
                    onClick={() => setEstadoGasto((actual) => (actual === estado ? "" : estado))}
                  >
                    <span style={styles.kpiLabel}>{estado}</span>
                    <span style={styles.kpiValor}>{cantidad}</span>
                  </button>
                );
              })}
            </div>
          <DataGridPro<GastoAlerta>
            key={GRID_STATE_KEY_GASTOS}
            dataSource={gastosVisibles}
            columns={COLUMNAS_GASTOS}
            keyExpr={(row) => String(row.corre)}
            height="65vh"
            noDataText="No hay gastos pendientes."
            stateStoringKey={GRID_STATE_KEY_GASTOS}
            exportFileName="alertas_gastos_pendientes"
            autoExpandAll={false}
            paging={{ pageSize: 50, pageSizes: [20, 50, 100, 250] }}
          />
          </>
        )
      )}
    </AppPage>
  );
}
