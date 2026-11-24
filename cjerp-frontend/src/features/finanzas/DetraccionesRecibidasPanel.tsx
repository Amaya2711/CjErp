import { useCallback, useEffect, useMemo, useState } from "react";
import DataGridPro from "../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../components/datagrid/types";
import { obtenerDetraccionesCxc } from "../../api/conciliacionService";
import type { CxcDetraccion } from "../../models/conciliacionBcp";
import { useFillHeight } from "./useFillHeight";

const COLUMNS: GridColumn<CxcDetraccion>[] = [
  { dataField: "fechaPago", caption: "Fecha pago", dataType: "date", width: 100 },
  { dataField: "numeroConstancia", caption: "Constancia", width: 120 },
  { dataField: "montoDeposito", caption: "Depósito", dataType: "number", format: { type: "fixedPoint", precision: 2 }, width: 110, alignment: "right" },
  { dataField: "nroDocAdquiriente", caption: "RUC cliente", width: 120 },
  { dataField: "nombreAdquiriente", caption: "Cliente", minWidth: 220 },
  { dataField: "tipoComprobante", caption: "Tipo", width: 60 },
  { dataField: "serieComprobante", caption: "Serie", width: 80 },
  { dataField: "numeroComprobante", caption: "Número", width: 90 },
  { dataField: "periodoTributario", caption: "Periodo", width: 80 },
  { dataField: "idDocumento", caption: "Id factura SIRE", dataType: "number", width: 110 },
  { dataField: "observacion", caption: "Observación", width: 320 },
  { dataField: "numeroCuenta", caption: "Cuenta", width: 120, visible: false },
  { dataField: "archivoOrigen", caption: "Archivo", width: 220, visible: false },
  { dataField: "fechaCarga", caption: "Fecha carga", dataType: "date", width: 110, visible: false },
  { dataField: "usuarioCarga", caption: "Usuario carga", width: 120, visible: false },
];

const fmt = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Detracciones recibidas ya cargadas (el cliente depositó la detracción de una factura de CJ TELECOM). */
export default function DetraccionesRecibidasPanel({ activo }: { activo: boolean }) {
  const { ref: gRef, height: gH } = useFillHeight();
  const [filas, setFilas] = useState<CxcDetraccion[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      setFilas((await obtenerDetraccionesCxc()) ?? []);
    } catch (e) {
      setFilas([]);
      setError(e instanceof Error ? e.message : "No se pudieron cargar las detracciones.");
    } finally {
      setCargando(false);
    }
  }, []);

  // Se vuelve a consultar cada vez que se abre la pestaña (por si se acaba de cargar un archivo).
  useEffect(() => {
    if (activo) void cargar();
  }, [activo, cargar]);

  const resumen = useMemo<Array<[string, string]>>(
    () => [
      ["Detracciones", String(filas.length)],
      ["Total depositado (S/)", fmt(filas.reduce((s, f) => s + (f.montoDeposito ?? 0), 0))],
      ["Con factura en el SIRE", String(filas.filter((f) => f.idDocumento != null).length)],
      ["Sin factura en el SIRE", String(filas.filter((f) => f.idDocumento == null).length)],
      ["Por confirmar (duplicadas)", String(filas.filter((f) => !!f.observacion).length)],
    ],
    [filas],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Detracciones recibidas</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
              Depósitos de detracción hechos por los clientes a CJ TELECOM. Se cargan en "Carga de datos" &gt; Detracciones.
              Montos en soles, tal como los informa SUNAT.
            </p>
          </div>
          <button
            type="button"
            disabled={cargando}
            onClick={() => void cargar()}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #1e3a8a",
              background: "#fff",
              color: "#1e3a8a",
              fontWeight: 600,
              cursor: cargando ? "not-allowed" : "pointer",
            }}
          >
            {cargando ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {resumen.map(([label, value]) => (
            <div key={label} style={{ background: "#f1f5f9", borderRadius: 8, padding: "8px 14px" }}>
              <div style={{ fontSize: 11, color: "#64748b" }}>{label}</div>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        {error ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}
      </div>

      <div ref={gRef} style={{ background: "#fff", borderRadius: 12, padding: 8, height: gH, display: "flex", flexDirection: "column" }}>
        <DataGridPro<CxcDetraccion>
          dataSource={filas}
          keyExpr="idDetraccion"
          columns={COLUMNS}
          height="fill"
          loading={cargando}
          noDataText="Aún no hay detracciones cargadas."
          stateStoringKey="cxc-detracciones-recibidas"
          paging={{ pageSize: 100, pageSizes: [50, 100, 250, 500] }}
          exportFileName="cxc_detracciones_recibidas"
          allowExport
        />
      </div>
    </div>
  );
}
