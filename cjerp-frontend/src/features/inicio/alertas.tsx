import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import AppPage from "../../components/base/AppPage";
import AppStatusMessage from "../../components/base/AppStatusMessage";
import DataGridPro from "../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../components/datagrid/types";
import { buscarOrdenCompraCabecera, buscarOrdenCompraDetalle } from "../../api/ordenCompraService";
import type { OrdenCompraCabeceraDto } from "../../api/ordenCompraService";
import { buildPlanillaConsultaEstadosRequest, consultarPlanillaEstados } from "../../api/planillaConsultaService";
import { getAuthUser } from "../../utils/authStorage";
import { getHttpErrorMessage } from "../../utils/httpError";

type AlertaTabKey = "oc" | "gastos";

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
];

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
  solicitante: string;
  total: number;
  moneda: string;
  estado: string;
};

// Lee el valor de una fila del SP sin depender de mayúsculas/minúsculas del alias.
function leerCampo(row: Record<string, unknown>, ...nombres: string[]): unknown {
  const clave = Object.keys(row).find((k) => nombres.some((n) => n.toLowerCase() === k.toLowerCase()));
  return clave ? row[clave] : undefined;
}

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
    solicitante: texto("Solicitante"),
    // Total en la moneda real del recibo, sin convertir a soles.
    total: Number(leerCampo(row, "Total") ?? 0),
    moneda: texto("Moneda"),
    estado: texto("EstadoNombre") || texto("Estado"),
  };
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
const GRID_STATE_KEY_GASTOS = "alertas_gastos_v1";

const COLUMNAS_OC: GridColumn<OrdenCompraAlerta>[] = [
  { dataField: "idOc", caption: "OC", dataType: "number", width: 90, alignment: "left" },
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
  { dataField: "corre", caption: "Correlativo", dataType: "number", width: 110, alignment: "left" },
  { dataField: "fecha", caption: "Fecha", dataType: "date", width: 110 },
  { dataField: "cliente", caption: "Cliente", minWidth: 160 },
  { dataField: "proyecto", caption: "Proyecto", minWidth: 160 },
  { dataField: "site", caption: "Site", minWidth: 160 },
  { dataField: "tipoTrabajo", caption: "Tipo trabajo", minWidth: 150 },
  { dataField: "detalle", caption: "Detalle", minWidth: 220 },
  { dataField: "total", caption: "Total", dataType: "number", width: 130, format: { type: "fixedPoint", precision: 2 } },
  { dataField: "moneda", caption: "Moneda", width: 100, alignment: "center" },
  {
    dataField: "estado",
    caption: "Estado",
    width: 150,
    cellRender: (value) => <EstadoBadge value={String(value ?? "").trim()} tono={estadoGastoTono} />,
  },
];

const styles: Record<string, CSSProperties> = {
  tabs: { display: "flex", gap: 8, borderBottom: "1px solid #E5E7EB", marginBottom: 16 },
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
  const [ordenes, setOrdenes] = useState<OrdenCompraAlerta[]>([]);
  const [loading, setLoading] = useState(idEmpleado > 0);
  const [error, setError] = useState("");
  const [gastos, setGastos] = useState<GastoAlerta[]>([]);
  const [loadingGastos, setLoadingGastos] = useState(idEmpleado > 0);
  const [errorGastos, setErrorGastos] = useState("");
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
        [{ nombre: "Estados", valor: ESTADOS_GASTO_PENDIENTE, tipo: "string" }],
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
  };

  const contadores = useMemo<Record<AlertaTabKey, number>>(
    () => ({ oc: ordenes.length, gastos: gastos.length }),
    [ordenes, gastos],
  );

  return (
    <AppPage title="Alertas - Notificaciones">
      <div style={styles.tabs}>
        {TABS.map((item) => {
          const total = contadores[item.key];
          return (
            <button
              key={item.key}
              type="button"
              style={{ ...styles.tab, ...(tab === item.key ? styles.tabActive : null) }}
              onClick={() => setTab(item.key)}
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
