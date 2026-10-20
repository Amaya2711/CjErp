import { useCallback, useEffect, useMemo, useState } from "react";
import DataGridPro from "../../../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../../../components/datagrid/types";
import { consultarDescuadresStock, consultarStockLogistica } from "../../../../api/logisticaEquiposService";
import type { LogisticaStock, LogisticaStockDescuadre } from "../../../../models/logisticaEquipos";
import { getHttpErrorMessage } from "../../../../utils/httpError";

type Vista = "saldos" | "descuadres";

const cantidad = { type: "fixedPoint", precision: 2 } as const;

const saldoColumn = (
  dataField: keyof LogisticaStock,
  caption: string,
  width = 110,
): GridColumn<LogisticaStock> => ({ dataField, caption, dataType: "number", width, format: cantidad });

/** Colas del flujo: cada columna es la cantidad pendiente de la SIGUIENTE etapa. */
const SALDO_COLUMNS: GridColumn<LogisticaStock>[] = [
  { dataField: "codPap", caption: "CodPap", width: 120, fixed: true },
  { dataField: "nombreMaterial", caption: "Material", width: 300, fixed: true },
  { dataField: "unidadMedida", caption: "UM", width: 70 },
  saldoColumn("stock", "Stock"),
  saldoColumn("disponible", "Disponible"),
  saldoColumn("aprobado", "Por aprobar"),
  saldoColumn("despachado", "Por despachar"),
  saldoColumn("enviado", "Por enviar"),
  saldoColumn("campo", "Por confirmar campo"),
  saldoColumn("cruce", "Por cruzar"),
  saldoColumn("cierre", "Por cerrar"),
  saldoColumn("folio", "Por foliar"),
  saldoColumn("culminadas", "Culminadas"),
  saldoColumn("excedente", "Excedente"),
  saldoColumn("observada", "Observada"),
  saldoColumn("bloqueado", "Bloqueado"),
  saldoColumn("recepcionado", "Recepcionado"),
  saldoColumn("validado", "Validado"),
  saldoColumn("solicitado", "Solicitado"),
];

const DESCUADRE_COLUMNS: GridColumn<LogisticaStockDescuadre>[] = [
  { dataField: "codPap", caption: "CodPap", width: 120 },
  { dataField: "nombreMaterial", caption: "Material", width: 300 },
  { dataField: "bucket", caption: "Bucket", width: 130 },
  { dataField: "enMaterialStock", caption: "En MaterialStock", dataType: "number", width: 140, format: cantidad },
  { dataField: "enStockSaldo", caption: "En libro (StockSaldo)", dataType: "number", width: 160, format: cantidad },
  { dataField: "diferencia", caption: "Diferencia", dataType: "number", width: 110, format: cantidad },
  { dataField: "tipo", caption: "Tipo", width: 150 },
];

/** Consulta de stock por material y control de descuadres entre MaterialStock y el libro de movimientos. */
export default function StockPanel() {
  const [vista, setVista] = useState<Vista>("saldos");
  const [texto, setTexto] = useState("");
  const [soloConSaldo, setSoloConSaldo] = useState(true);
  const [saldos, setSaldos] = useState<LogisticaStock[]>([]);
  const [descuadres, setDescuadres] = useState<LogisticaStockDescuadre[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(
    async (vistaActual: Vista) => {
      setLoading(true);
      setError("");
      try {
        if (vistaActual === "saldos") {
          setSaldos(await consultarStockLogistica(texto, soloConSaldo));
        } else {
          setDescuadres(await consultarDescuadresStock());
        }
      } catch (err) {
        setError(getHttpErrorMessage(err, "No se pudo consultar el stock."));
      } finally {
        setLoading(false);
      }
    },
    [texto, soloConSaldo],
  );

  const cambiarVista = (siguiente: Vista) => {
    setVista(siguiente);
    void cargar(siguiente);
  };

  // Carga inicial de los saldos (la lógica posterior la disparan los botones, no un efecto).
  useEffect(() => {
    let cancelled = false;
    consultarStockLogistica("", true)
      .then((data) => {
        if (!cancelled) setSaldos(data);
      })
      .catch((err) => {
        if (!cancelled) setError(getHttpErrorMessage(err, "No se pudo consultar el stock."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const resumen = useMemo(
    () => (vista === "saldos" ? `${saldos.length} materiales` : `${descuadres.length} diferencias`),
    [vista, saldos.length, descuadres.length],
  );

  return (
    <div style={styles.root}>
      <div style={styles.toolbar}>
        <div role="tablist" aria-label="Vista de stock" style={styles.segment}>
          {(["saldos", "descuadres"] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={vista === item}
              onClick={() => cambiarVista(item)}
              style={{ ...styles.segmentButton, ...(vista === item ? styles.segmentActive : null) }}
            >
              {item === "saldos" ? "Saldos por cola" : "Descuadres"}
            </button>
          ))}
        </div>

        {vista === "saldos" ? (
          <>
            <input
              value={texto}
              placeholder="Buscar CodPap o material…"
              onChange={(event) => setTexto(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void cargar(vista);
              }}
              style={styles.input}
            />
            <label style={styles.check}>
              <input type="checkbox" checked={soloConSaldo} onChange={(event) => setSoloConSaldo(event.target.checked)} />
              Solo con saldo
            </label>
          </>
        ) : null}

        <button type="button" onClick={() => void cargar(vista)} disabled={loading} style={styles.primary}>
          {loading ? "Consultando…" : "Consultar"}
        </button>
        <span style={styles.resumen}>{resumen}</span>
      </div>

      {error ? <div role="alert" style={styles.error}>{error}</div> : null}

      <div style={styles.gridHost}>
        {vista === "saldos" ? (
          <DataGridPro<LogisticaStock>
            dataSource={saldos}
            columns={SALDO_COLUMNS}
            keyExpr="codPap"
            height="fill"
            loading={loading}
            noDataText="No hay materiales para los filtros indicados."
            stateStoringKey="logistica-equipos-stock"
            showSearchPanel={false}
            allowExport
            exportFileName="stock_equipos"
            autoExpandAll={false}
            rowAlternation={false}
            rowPadding="3px 8px"
            paging={{ pageSize: 100, pageSizes: [50, 100, 250, 500] }}
          />
        ) : (
          <DataGridPro<LogisticaStockDescuadre>
            dataSource={descuadres}
            columns={DESCUADRE_COLUMNS}
            keyExpr={(row) => `${row.codPap}|${row.bucket}`}
            height="fill"
            loading={loading}
            noDataText="Sin descuadres: el libro y MaterialStock coinciden."
            stateStoringKey="logistica-equipos-descuadres"
            showSearchPanel={false}
            allowExport
            exportFileName="stock_descuadres"
            autoExpandAll={false}
            rowAlternation={false}
            rowPadding="3px 8px"
            paging={{ pageSize: 100, pageSizes: [50, 100, 250, 500] }}
            rowStyle={(row) => (row.tipo === "SALDO NEGATIVO" ? { color: "#B91C1C", fontWeight: 700 } : undefined)}
          />
        )}
      </div>
    </div>
  );
}

const styles = {
  root: { display: "flex", flexDirection: "column" as const, flex: 1, minHeight: 0, gap: 10 },
  toolbar: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" as const },
  segment: { display: "inline-flex", border: "1px solid #CBD5E1", borderRadius: 8, overflow: "hidden" },
  segmentButton: { border: 0, background: "#fff", color: "#475569", padding: "7px 14px", cursor: "pointer", fontSize: 13 },
  segmentActive: { background: "#1F6F8B", color: "#fff", fontWeight: 600 },
  input: { border: "1px solid #CBD5E1", borderRadius: 8, padding: "7px 10px", minWidth: 240, fontSize: 13 },
  check: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#334155" },
  primary: { background: "#1F6F8B", color: "#fff", border: 0, borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13 },
  resumen: { color: "#64748B", fontSize: 12, marginLeft: "auto" },
  error: { background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 8, padding: "8px 12px", fontSize: 13 },
  gridHost: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" as const },
};
