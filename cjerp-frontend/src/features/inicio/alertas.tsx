import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import AppPage from "../../components/base/AppPage";
import AppStatusMessage from "../../components/base/AppStatusMessage";
import DataGridPro from "../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../components/datagrid/types";
import { buscarOrdenCompraCabecera, buscarOrdenCompraDetalle } from "../../api/ordenCompraService";
import type { OrdenCompraCabeceraDto } from "../../api/ordenCompraService";
import { getAuthUser } from "../../utils/authStorage";
import { getHttpErrorMessage } from "../../utils/httpError";

type AlertaTabKey = "oc";

type AlertaTab = {
  key: AlertaTabKey;
  label: string;
};

// Cada pestaña es un tipo de alerta por empleado; agregar aquí las siguientes.
// La cabecera no trae el tipo de trabajo: se completa con el detalle de la OC (valores distintos).
type OrdenCompraAlerta = OrdenCompraCabeceraDto & { tipoTrabajo: string };

const TABS: AlertaTab[] = [{ key: "oc", label: "Órdenes de compra" }];

function toPositiveNumber(...values: Array<string | number | null | undefined>): number {
  for (const value of values) {
    if (value == null) continue;
    const parsed = Number(String(value).trim());
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

// Color del estado según su contenido (texto que devuelve sp_OrdenCompra_BuscarCabecera).
function estadoTono(estado: string): { color: string; background: string } {
  const texto = estado.toLowerCase();
  if (texto.includes("rechaz")) return { color: "#B91C1C", background: "#FEE2E2" };
  if (texto.includes("3ra")) return { color: "#1D4ED8", background: "#DBEAFE" };
  if (texto.includes("2da")) return { color: "#C2410C", background: "#FFEDD5" };
  if (texto.includes("1ra") || texto.includes("pend")) return { color: "#9A6700", background: "#FEF3C7" };
  if (texto.includes("aprob")) return { color: "#047857", background: "#DCFCE7" };
  return { color: "#475569", background: "#E2E8F0" };
}

function EstadoBadge({ value }: { value: string }) {
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
        ...estadoTono(value),
      }}
    >
      {value}
    </span>
  );
}

const COLUMNAS_OC: GridColumn<OrdenCompraAlerta>[] = [
  { dataField: "idOc", caption: "OC", dataType: "number", width: 90, alignment: "left" },
  { dataField: "fecha", caption: "Fecha", dataType: "date", width: 110 },
  { dataField: "nombreCliente", caption: "Cliente", minWidth: 160 },
  { dataField: "nombreProyecto", caption: "Proyecto", minWidth: 160 },
  { dataField: "nombreSite", caption: "Site", minWidth: 160 },
  { dataField: "tipoTrabajo", caption: "Tipo trabajo", minWidth: 150 },
  {
    dataField: "estado",
    caption: "Estado",
    width: 150,
    cellRender: (value) => <EstadoBadge value={String(value ?? "").trim()} />,
  },
  { dataField: "responsable", caption: "Responsable", minWidth: 180 },
  // Total en la moneda real de la OC, sin convertir a soles.
  { dataField: "total", caption: "Total", dataType: "number", width: 130, format: { type: "fixedPoint", precision: 2 } },
  { dataField: "moneda", caption: "Moneda", width: 100, alignment: "center" },
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
};

export default function AlertasPage() {
  const authUser = getAuthUser();
  const idEmpleado = toPositiveNumber(authUser?.idEmpleado, authUser?.codEmp);

  const [tab, setTab] = useState<AlertaTabKey>("oc");
  const [ordenes, setOrdenes] = useState<OrdenCompraAlerta[]>([]);
  const [loading, setLoading] = useState(idEmpleado > 0);
  const [error, setError] = useState("");

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
        for (let i = 0; i < idsOc.length; i += 8) {
          if (cancelado) return;
          await Promise.all(
            idsOc.slice(i, i + 8).map(async (idOc) => {
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

  const contadores = useMemo<Record<AlertaTabKey, number>>(() => ({ oc: ordenes.length }), [ordenes]);

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
              <span style={{ ...styles.badge, ...(total === 0 ? styles.badgeEmpty : null) }}>{total}</span>
            </button>
          );
        })}
      </div>

      {!idEmpleado && (
        <AppStatusMessage tone="error">No se pudo identificar el empleado de la sesión.</AppStatusMessage>
      )}
      {error && <AppStatusMessage tone="error">{error}</AppStatusMessage>}
      {loading && <AppStatusMessage>Cargando alertas...</AppStatusMessage>}

      {tab === "oc" && !loading && idEmpleado > 0 && !error && (
        ordenes.length === 0 ? (
          <AppStatusMessage tone="success">No tienes órdenes de compra pendientes.</AppStatusMessage>
        ) : (
          <DataGridPro<OrdenCompraAlerta>
            dataSource={ordenes}
            columns={COLUMNAS_OC}
            keyExpr="idOc"
            height="65vh"
            noDataText="No hay órdenes de compra pendientes."
            stateStoringKey="alertas_oc"
            exportFileName="alertas_oc_pendientes"
            autoExpandAll={false}
            paging={{ pageSize: 50, pageSizes: [20, 50, 100, 250] }}
          />
        )
      )}
    </AppPage>
  );
}
