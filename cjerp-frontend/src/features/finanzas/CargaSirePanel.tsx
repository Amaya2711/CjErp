import { useCallback, useEffect, useRef, useState } from "react";
import DataGridPro from "../../components/datagrid/DataGridPro";
import { useFillHeight } from "./useFillHeight";
import type { GridColumn } from "../../components/datagrid/types";
import { cargarSireCxc, obtenerDocumentosCxc } from "../../api/conciliacionService";
import type { CxcCargaSireFila, CxcCargaSireResponse, CxcDocumento } from "../../models/conciliacionBcp";

const COLUMNS_ANALISIS: GridColumn<CxcCargaSireFila>[] = [
  { dataField: "linea", caption: "Línea", dataType: "number", width: 70 },
  { dataField: "estado", caption: "Estado", width: 150 },
  { dataField: "motivo", caption: "Motivo", width: 260 },
  { dataField: "fechaEmision", caption: "Emisión", dataType: "date", width: 100 },
  { dataField: "tipoCp", caption: "Tipo", width: 60 },
  { dataField: "serieCp", caption: "Serie", width: 80 },
  { dataField: "nroCp", caption: "Número", width: 90 },
  { dataField: "nroDocIdentidad", caption: "RUC cliente", width: 120 },
  { dataField: "razonSocialCliente", caption: "Cliente", minWidth: 220 },
  { dataField: "moneda", caption: "Moneda", width: 80 },
  { dataField: "totalCp", caption: "Total", dataType: "number", format: { type: "fixedPoint", precision: 2 }, width: 120, alignment: "right" },
  { dataField: "carSunat", caption: "CAR SUNAT", width: 230 },
];

const COLUMNS_CARGADOS: GridColumn<CxcDocumento>[] = [
  { dataField: "periodo", caption: "Periodo", width: 80 },
  { dataField: "fechaEmision", caption: "Emisión", dataType: "date", width: 100 },
  { dataField: "fechaVencimiento", caption: "Vencimiento", dataType: "date", width: 110 },
  { dataField: "tipoCp", caption: "Tipo", width: 60 },
  { dataField: "serieCp", caption: "Serie", width: 80 },
  { dataField: "nroCp", caption: "Número", width: 90 },
  { dataField: "nroDocIdentidad", caption: "RUC cliente", width: 120 },
  { dataField: "razonSocialCliente", caption: "Cliente", minWidth: 220 },
  { dataField: "moneda", caption: "Moneda", width: 80 },
  { dataField: "totalCp", caption: "Total", dataType: "number", format: { type: "fixedPoint", precision: 2 }, width: 120, alignment: "right" },
  { dataField: "tipoCambio", caption: "T.C.", dataType: "number", width: 80, visible: false },
  { dataField: "archivoOrigen", caption: "Archivo", width: 220, visible: false },
  { dataField: "fechaCarga", caption: "Fecha carga", dataType: "date", width: 110, visible: false },
  { dataField: "usuarioCarga", caption: "Usuario carga", width: 120, visible: false },
];

function leerTexto(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

/** Carga de datos del portal CxC: txt SIRE/SUNAT (registro de ventas). No duplica: la clave es el CAR SUNAT. */
export default function CargaSirePanel() {
  const { ref: aRef, height: aH } = useFillHeight();
  const { ref: dRef, height: dH } = useFillHeight();
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<{ nombre: string; contenido: string } | null>(null);
  const [analisis, setAnalisis] = useState<CxcCargaSireResponse | null>(null);
  const [resultado, setResultado] = useState("");
  const [error, setError] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [documentos, setDocumentos] = useState<CxcDocumento[]>([]);
  const [cargandoDocs, setCargandoDocs] = useState(false);

  const cargarDocumentos = useCallback(async () => {
    setCargandoDocs(true);
    try {
      setDocumentos((await obtenerDocumentosCxc()) ?? []);
    } catch (e) {
      setDocumentos([]);
      setError(e instanceof Error ? e.message : "No se pudieron cargar los documentos.");
    } finally {
      setCargandoDocs(false);
    }
  }, []);

  useEffect(() => {
    void cargarDocumentos();
  }, [cargarDocumentos]);

  const procesar = async (nombre: string, contenido: string, soloAnalizar: boolean) => {
    setProcesando(true);
    setError("");
    try {
      const response = await cargarSireCxc({ nombreArchivo: nombre, contenido, soloAnalizar });
      setAnalisis(response);
      if (!soloAnalizar) {
        setResultado(response.mensaje);
        setArchivo(null);
        if (inputRef.current) inputRef.current.value = "";
        await cargarDocumentos();
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
        ["Nuevos", analisis.nuevos],
        ["Ya existentes", analisis.yaExisten],
        ["Repetidos en archivo", analisis.repetidosEnArchivo],
        ["Inválidos", analisis.invalidos],
      ]
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Carga de comprobantes (SIRE / SUNAT)</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
            Cargue el txt del registro de ventas. Primero se analiza sin grabar; al confirmar solo se graban los comprobantes
            nuevos (el CAR SUNAT identifica cada uno, por lo que volver a cargar el mismo archivo no duplica nada).
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input
            ref={inputRef}
            type="file"
            accept=".txt,text/plain"
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
            {procesando ? "Procesando..." : `Grabar ${analisis?.nuevos ?? 0} nuevo(s)`}
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

        {resultado ? <div style={{ color: "#166534", fontSize: 13 }}>{resultado}</div> : null}
        {error ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}
      </div>

      {analisis ? (
        <div ref={aRef} style={{ background: "#fff", borderRadius: 12, padding: 8, height: aH, display: "flex", flexDirection: "column" }}>
          <DataGridPro<CxcCargaSireFila>
            dataSource={analisis.filas}
            keyExpr="linea"
            columns={COLUMNS_ANALISIS}
            height="fill"
            noDataText="Sin filas."
            stateStoringKey="cxc-carga-sire-analisis"
            paging={{ pageSize: 100, pageSizes: [50, 100, 250, 500] }}
          />
        </div>
      ) : null}

      <div ref={dRef} style={{ background: "#fff", borderRadius: 12, padding: 8, height: dH, display: "flex", flexDirection: "column" }}>
        <h3 style={{ margin: "4px 8px", fontSize: 15 }}>Comprobantes ya cargados ({documentos.length})</h3>
        <DataGridPro<CxcDocumento>
          dataSource={documentos}
          keyExpr="idDocumento"
          columns={COLUMNS_CARGADOS}
          height="fill"
          loading={cargandoDocs}
          noDataText="Aún no hay comprobantes cargados."
          stateStoringKey="cxc-documentos-cargados"
          paging={{ pageSize: 100, pageSizes: [50, 100, 250, 500] }}
          exportFileName="cxc_documentos"
          allowExport
        />
      </div>
    </div>
  );
}
