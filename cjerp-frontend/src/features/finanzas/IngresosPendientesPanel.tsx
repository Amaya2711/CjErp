import { useCallback, useEffect, useMemo, useState } from "react";
import DataGridPro from "../../components/datagrid/DataGridPro";
import { useFillHeight } from "./useFillHeight";
import type { GridColumn } from "../../components/datagrid/types";
import { obtenerIngresosPendientes } from "../../api/conciliacionService";
import type { IngresoPendiente } from "../../models/conciliacionBcp";

const BANCOS = [
  { code: "", label: "Todos los bancos" },
  { code: "BCP", label: "BCP" },
  { code: "SCOTIABANK", label: "Scotiabank" },
  { code: "BBVA", label: "BBVA" },
  { code: "INTERBANK", label: "Interbank" },
];

const COLUMNS: GridColumn<IngresoPendiente>[] = [
  { dataField: "fecha", caption: "Fecha", dataType: "date", width: 100 },
  { dataField: "codigoBanco", caption: "Banco", width: 110 },
  { dataField: "empresa", caption: "Empresa", width: 160 },
  { dataField: "cuenta", caption: "Cuenta", width: 150 },
  { dataField: "moneda", caption: "Moneda", width: 90 },
  { dataField: "nroOperacion", caption: "Nº operación", width: 120 },
  { dataField: "descripcionOperacion", caption: "Descripción", minWidth: 260 },
  { dataField: "monto", caption: "Ingreso", dataType: "number", format: { type: "fixedPoint", precision: 2 }, width: 120, alignment: "right" },
  { dataField: "saldoPorAplicar", caption: "Saldo por aplicar", dataType: "number", format: { type: "fixedPoint", precision: 2 }, width: 140, alignment: "right" },
  { dataField: "fechaConciliacion", caption: "Fecha conciliación", dataType: "date", width: 130, visible: false },
  { dataField: "usuarioConciliacion", caption: "Usuario conciliación", width: 140, visible: false },
];

function formatMonto(value: number, moneda: string): string {
  const simbolo = moneda.toLowerCase().includes("lar") ? "$" : "S/";
  return `${simbolo} ${value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Pestaña INGRESO (portal CxC) - solo lectura.
 * Ingreso pendiente = movimiento conciliado, Monto > 0, Area Flujo "INGRESOS OP" y saldo por aplicar > 0.
 */
export default function IngresosPendientesPanel() {
  const { ref: gRef, height: gH } = useFillHeight();
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [codigoBanco, setCodigoBanco] = useState("");
  const [rows, setRows] = useState<IngresoPendiente[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await obtenerIngresosPendientes({ fechaInicio, fechaFin, codigoBanco });
      setRows(response?.ingresos ?? []);
    } catch (loadError) {
      setRows([]);
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los ingresos pendientes.");
    } finally {
      setLoading(false);
    }
  }, [fechaInicio, fechaFin, codigoBanco]);

  useEffect(() => {
    void cargar();
    // Carga inicial; luego se actualiza con el boton.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Totales por moneda real (nunca se mezclan ni se convierten monedas).
  const totalesPorMoneda = useMemo(() => {
    const map = new Map<string, { cantidad: number; saldo: number }>();
    rows.forEach((row) => {
      const moneda = (row.moneda || "Sin moneda").trim();
      const current = map.get(moneda) ?? { cantidad: 0, saldo: 0 };
      current.cantidad += 1;
      current.saldo += row.saldoPorAplicar;
      map.set(moneda, current);
    });
    return Array.from(map.entries());
  }, [rows]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Ingresos pendientes de conciliar con facturas</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
            Movimientos bancarios conciliados con Área Flujo INGRESOS OP, monto positivo y saldo por aplicar mayor a cero.
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            Banco
            <select value={codigoBanco} onChange={(event) => setCodigoBanco(event.target.value)} style={{ padding: 6 }}>
              {BANCOS.map((banco) => (
                <option key={banco.code} value={banco.code}>
                  {banco.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            Fecha inicio
            <input type="date" value={fechaInicio} onChange={(event) => setFechaInicio(event.target.value)} style={{ padding: 6 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            Fecha fin
            <input type="date" value={fechaFin} onChange={(event) => setFechaFin(event.target.value)} style={{ padding: 6 }} />
          </label>
          <button type="button" onClick={() => void cargar()} disabled={loading} style={{ padding: "8px 16px", cursor: "pointer" }}>
            {loading ? "Cargando..." : "Actualizar"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ background: "#f1f5f9", borderRadius: 8, padding: "8px 14px" }}>
            <div style={{ fontSize: 11, color: "#64748b" }}>Ingresos pendientes</div>
            <strong>{rows.length}</strong>
          </div>
          {totalesPorMoneda.map(([moneda, total]) => (
            <div key={moneda} style={{ background: "#f1f5f9", borderRadius: 8, padding: "8px 14px" }}>
              <div style={{ fontSize: 11, color: "#64748b" }}>Saldo por aplicar - {moneda} ({total.cantidad})</div>
              <strong>{formatMonto(total.saldo, moneda)}</strong>
            </div>
          ))}
        </div>

        {error ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}
      </div>

      <div ref={gRef} style={{ background: "#fff", borderRadius: 12, padding: 8, height: gH, display: "flex", flexDirection: "column" }}>
        <DataGridPro<IngresoPendiente>
          dataSource={rows}
          keyExpr="idMovimientoBanco"
          columns={COLUMNS}
          height="fill"
          loading={loading}
          noDataText="No hay ingresos pendientes con los filtros seleccionados."
          stateStoringKey="conciliacion-ingresos-pendientes"
          paging={{ pageSize: 100, pageSizes: [50, 100, 250, 500] }}
          exportFileName="ingresos_pendientes"
          allowExport
        />
      </div>
    </div>
  );
}
