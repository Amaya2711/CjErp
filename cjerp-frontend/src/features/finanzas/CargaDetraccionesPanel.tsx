import { useRef, useState } from "react";
import DataGridPro from "../../components/datagrid/DataGridPro";
import { useFillHeight } from "./useFillHeight";
import type { GridColumn } from "../../components/datagrid/types";
import { cargarDetraccionesCxc } from "../../api/conciliacionService";
import type { CxcCargaDetraccionFila, CxcCargaDetraccionesResponse } from "../../models/conciliacionBcp";

const COLUMNS_ANALISIS: GridColumn<CxcCargaDetraccionFila>[] = [
  { dataField: "linea", caption: "Línea", dataType: "number", width: 70 },
  { dataField: "estado", caption: "Estado", width: 150 },
  { dataField: "motivo", caption: "Motivo", width: 240 },
  { dataField: "aviso", caption: "Aviso", width: 300 },
  { dataField: "numeroConstancia", caption: "Constancia", width: 120 },
  { dataField: "fechaPago", caption: "Fecha pago", dataType: "date", width: 100 },
  { dataField: "montoDeposito", caption: "Depósito", dataType: "number", format: { type: "fixedPoint", precision: 2 }, width: 100, alignment: "right" },
  { dataField: "rucCliente", caption: "RUC cliente", width: 120 },
  { dataField: "cliente", caption: "Cliente", minWidth: 220 },
  { dataField: "tipoComprobante", caption: "Tipo", width: 60 },
  { dataField: "serieComprobante", caption: "Serie", width: 80 },
  { dataField: "numeroComprobante", caption: "Número", width: 90 },
  { dataField: "facturaEnSire", caption: "Factura en SIRE", dataType: "boolean", width: 110 },
];

function leerTexto(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

/** Carga de detracciones recibidas (csv SUNAT) del portal CxC. La clave es el Número de Constancia. */
export default function CargaDetraccionesPanel() {
  const { ref: gRef, height: gH } = useFillHeight();
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<{ nombre: string; contenido: string } | null>(null);
  const [analisis, setAnalisis] = useState<CxcCargaDetraccionesResponse | null>(null);
  const [resultado, setResultado] = useState("");
  const [error, setError] = useState("");
  const [procesando, setProcesando] = useState(false);

  const procesar = async (nombre: string, contenido: string, soloAnalizar: boolean) => {
    setProcesando(true);
    setError("");
    try {
      const response = await cargarDetraccionesCxc({ nombreArchivo: nombre, contenido, soloAnalizar });
      setAnalisis(response);
      if (!soloAnalizar) {
        setResultado(`${response.mensaje} Revise el resultado en la pestaña Detracciones.`);
        setArchivo(null);
        if (inputRef.current) inputRef.current.value = "";
      }
    } catch (e) {
      setAnalisis(null);
      setError(e instanceof Error ? e.message : "No se pudo procesar el archivo.");
    } finally {
      setProcesando(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    setAnalisis(null);
    setResultado("");
    setError("");
    if (!file) {
      setArchivo(null);
      return;
    }
    const contenido = leerTexto(await file.arrayBuffer());
    setArchivo({ nombre: file.name, contenido });
    await procesar(file.name, contenido, true);
  };

  const puedeGrabar = !!archivo && !!analisis && analisis.soloAnalizar && analisis.nuevos > 0 && !procesando;

  const resumen: Array<[string, number]> = analisis
    ? [
        ["Filas del archivo", analisis.totalFilas],
        ["Nuevas", analisis.nuevos],
        ["Ya existentes", analisis.yaExisten],
        ["Repetidas en archivo", analisis.repetidosEnArchivo],
        ["Inválidas", analisis.invalidos],
        ["Omitidas (compras)", analisis.omitidosCompra],
        ["Sin factura en SIRE", analisis.sinFacturaSire],
        ["Posible depósito duplicado", analisis.posiblesDuplicados],
      ]
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Carga de detracciones (SUNAT)</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
            Cargue el csv de detracciones. Solo se graban las recibidas por CJ TELECOM (las de compras se omiten). Primero se
            analiza sin grabar; la constancia identifica cada depósito, por lo que volver a cargar el mismo archivo no duplica nada.
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            disabled={procesando}
            style={{ display: "none" }}
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
          <button
            type="button"
            disabled={procesando}
            onClick={() => inputRef.current?.click()}
            style={{
              padding: "9px 18px",
              borderRadius: 8,
              border: "1px solid #1e3a8a",
              background: "#fff",
              color: "#1e3a8a",
              fontWeight: 600,
              cursor: procesando ? "not-allowed" : "pointer",
            }}
          >
            Seleccionar archivo
          </button>
          <span style={{ fontSize: 13, color: "#475569" }}>{archivo ? archivo.nombre : "Ningún archivo seleccionado"}</span>
          <button
            type="button"
            disabled={!puedeGrabar}
            onClick={() => archivo && void procesar(archivo.nombre, archivo.contenido, false)}
            style={{
              padding: "9px 18px",
              borderRadius: 8,
              border: "1px solid transparent",
              background: puedeGrabar ? "#166534" : "#cbd5e1",
              color: puedeGrabar ? "#fff" : "#64748b",
              fontWeight: 600,
              cursor: puedeGrabar ? "pointer" : "not-allowed",
            }}
          >
            {procesando ? "Procesando..." : `Grabar ${analisis?.nuevos ?? 0} nueva(s)`}
          </button>
        </div>

        {analisis ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {resumen.map(([label, value]) => (
              <div key={label} style={{ background: "#f1f5f9", borderRadius: 8, padding: "8px 14px" }}>
                <div style={{ fontSize: 11, color: "#64748b" }}>{label}</div>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        ) : null}

        {analisis && analisis.posiblesDuplicados > 0 ? (
          <div style={{ color: "#92400e", background: "#fef3c7", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
            Hay comprobantes con más de una constancia. Se guardarán ambos depósitos con una observación "por confirmar por el área".
          </div>
        ) : null}
        {resultado ? <div style={{ color: "#166534", fontSize: 13 }}>{resultado}</div> : null}
        {error ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}
      </div>

      {analisis ? (
        <div ref={gRef} style={{ background: "#fff", borderRadius: 12, padding: 8, height: gH, display: "flex", flexDirection: "column" }}>
          <DataGridPro<CxcCargaDetraccionFila>
            dataSource={analisis.filas}
            keyExpr="linea"
            columns={COLUMNS_ANALISIS}
            height="fill"
            noDataText="Sin filas."
            stateStoringKey="cxc-carga-detracciones-analisis"
            paging={{ pageSize: 100, pageSizes: [50, 100, 250, 500] }}
          />
        </div>
      ) : null}

    </div>
  );
}
