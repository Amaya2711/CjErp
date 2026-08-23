import { useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import * as XLSX from "xlsx";
import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppStatusMessage from "../../../components/base/AppStatusMessage";
import {
  procesarMigracionImportNew,
  type MigracionImportProcesarNewDetalleDto,
  type MigracionImportProcesarNewFilaDto,
  type MigracionImportProcesarNewResultadoDto,
} from "../../../api/migracionImportProcesarNewService";

type ActionMode = "VALIDAR" | "ACTUALIZAR";

type HeaderRule = {
  label: string;
  aliases?: string[];
};

type ParsedWorkbook = {
  fileName: string;
  sheetName: string;
  headers: string[];
  rows: string[][];
  data: MigracionImportProcesarNewFilaDto[];
  missingColumns: string[];
};

const HEADER_RULES: HeaderRule[] = [
  { label: "OT" },
  { label: "CLIENTE" },
  { label: "PROYECTO" },
  { label: "CODIGO", aliases: ["IDSITE", "CÃ“DIGO", "CODIGO SITE"] },
  { label: "SITE" },
  { label: "TIPO_TRABAJO" },
  { label: "STATUS_ATP", aliases: ["ESTATUS_ATP", "STATUS ATP", "ESTATUS ATP"] },
  { label: "ATP" },
  { label: "STATUS_PAP", aliases: ["ESTATUS_PAP", "STATUS PAP", "ESTATUS PAP"] },
  { label: "ESTADO_OC", aliases: ["ESTADO OC"] },
  { label: "NRO_OC", aliases: ["NRO OC"] },
  { label: "POS", aliases: ["POSICION", "POSICIÃ“N"] },
  { label: "MONTO_OC", aliases: ["MONTO OC"] },
  { label: "MONTO_LIQ", aliases: ["MONTO LIQ"] },
  { label: "MONTO_BCK", aliases: ["MONTO BCK", "MONTO BCK."] },
  { label: "CEN_FILE", aliases: ["CEN FILE"] },
  { label: "STATUS_GIS", aliases: ["ESTATUS_GIS", "STATUS GIS", "ESTATUS GIS", "GIS"] },
  { label: "ESTADO_EA", aliases: ["ESTATUS_EA", "ESTADO EA", "ESTATUS EA", "EA"] },
  { label: "FOLIO", aliases: ["FOLIO."] },
  { label: "FOLIO2", aliases: ["FOLIO 2", "FOLIO_2", "FOLIO II"] },
  { label: "STATUSOT", aliases: ["STATUS_OT", "ESTATUS_OT", "STATUS OT", "ESTATUS OT"] },
  { label: "STATUSOT2", aliases: ["STATUS_OT2", "ESTATUS_OT2", "STATUS OT2", "ESTATUS OT2"] },
  { label: "ZONA" },
  { label: "CAPITALIZACION" },
  { label: "STATUS_CJ", aliases: ["ESTATUS_CJ", "STATUS CJ", "ESTATUS CJ"] },
  { label: "FACTURADO" },
  { label: "PRE_PASIVO" },
  { label: "PROYECTO2" },
  { label: "DIASON", aliases: ["DIAS_ON", "DIAS_ACT", "DIAS ON AIR", "DÍAS_ACT", "DIASONAIR"] },
  { label: "ANTON", aliases: ["ANT_ON", "ANTG_ACT", "ANTG. ACT.", "ANTG ON AIR", "ANTONAIR"] },
  { label: "GERENCIA" },
  { label: "AÑO_GESTION", aliases: ["ANO_GESTION", "ANOGESTION", "AÑO_OP.", "ANO_OP.", "AÑO OP", "ANO OP"] },
  { label: "ID_MONEDA", aliases: ["IDMONEDA", "ID MONEDA", "MONEDA_ID"] },
];

function repairMojibake(value: string) {
  try {
    const repaired = decodeURIComponent(escape(value));
    return repaired.includes("\uFFFD") ? value : repaired;
  } catch {
    return value;
  }
}

function normalizeText(value: string) {
  return repairMojibake(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeCellValue(value: unknown) {
  return repairMojibake(String(value ?? "")).trim();
}

function createHeaderIndex(headers: string[]) {
  const index = new Map<string, number>();

  headers.forEach((header, position) => {
    const normalized = normalizeText(header);
    if (normalized && !index.has(normalized)) {
      index.set(normalized, position);
    }
  });

  return index;
}

function resolveHeaderIndex(index: Map<string, number>, rule: HeaderRule) {
  for (const key of [rule.label, ...(rule.aliases ?? [])].map(normalizeText)) {
    const match = index.get(key);
    if (match !== undefined) {
      return match;
    }
  }

  return -1;
}

function parseAmount(value: unknown) {
  const text = normalizeCellValue(value);
  if (!text) {
    return null;
  }

  let cleaned = text.replace(/[^\d,.-]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    cleaned = lastComma > lastDot ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  } else if (lastComma !== -1) {
    cleaned = cleaned.replace(",", ".");
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: unknown) {
  const text = normalizeCellValue(value);
  if (!text) {
    return null;
  }

  const parsed = Number.parseInt(text.replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function textAt(row: string[], index: Map<string, number>, rule: HeaderRule) {
  const position = resolveHeaderIndex(index, rule);
  return position >= 0 ? normalizeCellValue(row[position]) || null : null;
}

function numberAt(row: string[], index: Map<string, number>, rule: HeaderRule) {
  const position = resolveHeaderIndex(index, rule);
  return position >= 0 ? parseAmount(row[position]) : null;
}

function integerAt(row: string[], index: Map<string, number>, rule: HeaderRule) {
  const position = resolveHeaderIndex(index, rule);
  return position >= 0 ? parseInteger(row[position]) : null;
}

function mapRowsToPayload(headers: string[], rows: string[][]): ParsedWorkbook {
  const index = createHeaderIndex(headers);
  const missingColumns = HEADER_RULES.filter((rule) => resolveHeaderIndex(index, rule) === -1).map((rule) => rule.label);

  const data = rows
    .map((row, position) => ({
      row,
      filaExcel: position + 2,
    }))
    .filter(({ row }) => row.some((value) => normalizeCellValue(value) !== ""))
    .map(({ row, filaExcel }) => ({
      filaExcel,
      OT: textAt(row, index, { label: "OT" }),
      Cliente: textAt(row, index, { label: "CLIENTE" }),
      Proyecto: textAt(row, index, { label: "PROYECTO" }),
      IdSite: textAt(row, index, { label: "CODIGO", aliases: ["IDSITE", "IDSITE"] }),
      Site: textAt(row, index, { label: "SITE" }),
      TipoTrabajo: textAt(row, index, { label: "TIPO_TRABAJO" }),
      Status_Atp: textAt(row, index, { label: "STATUS_ATP" }),
      ATP: textAt(row, index, { label: "ATP" }),
      Status_Pap: textAt(row, index, { label: "STATUS_PAP" }),
      Estado_Oc: textAt(row, index, { label: "ESTADO_OC" }),
      Nro_Oc: textAt(row, index, { label: "NRO_OC" }),
      Posicion: textAt(row, index, { label: "POS", aliases: ["POSICION"] }),
      MontoOc: numberAt(row, index, { label: "MONTO_OC" }),
      MontoLiq: numberAt(row, index, { label: "MONTO_LIQ" }),
      Monto_Bck: numberAt(row, index, { label: "MONTO_BCK" }),
      CenFile: textAt(row, index, { label: "CEN_FILE" }),
      Status_Gis: textAt(row, index, { label: "STATUS_GIS" }),
      Estado_Ea: textAt(row, index, { label: "ESTADO_EA" }),
      Folio: textAt(row, index, { label: "FOLIO" }),
      Folio2: textAt(row, index, { label: "FOLIO2" }),
      StatusOt: textAt(row, index, { label: "STATUSOT" }),
      StatusOt2: textAt(row, index, { label: "STATUSOT2" }),
      Zona: textAt(row, index, { label: "ZONA" }),
      Capitalizacion: textAt(row, index, { label: "CAPITALIZACION" }),
      Status_Cj: textAt(row, index, { label: "STATUS_CJ" }),
      Facturado: textAt(row, index, { label: "FACTURADO" }),
      PrePasivo: textAt(row, index, { label: "PRE_PASIVO" }),
      Proyecto2: textAt(row, index, { label: "PROYECTO2" }),
      DiasOn: textAt(row, index, { label: "DIASON", aliases: ["DIAS_ON", "DIAS_ACT", "DIAS ON AIR", "DÍAS_ACT", "DIASONAIR"] }),
      AntOn: textAt(row, index, { label: "ANTON", aliases: ["ANT_ON", "ANTG_ACT", "ANTG. ACT.", "ANTG ON AIR", "ANTONAIR"] }),
      Gerencia: textAt(row, index, { label: "GERENCIA" }),
      AnoGestion: numberAt(row, index, { label: "AÑO_GESTION", aliases: ["ANO_GESTION", "ANOGESTION", "AÑO_OP.", "ANO_OP.", "AÑO OP", "ANO OP"] }),
      IdMoneda: integerAt(row, index, { label: "ID_MONEDA", aliases: ["IDMONEDA", "ID MONEDA", "MONEDA_ID"] }),
    }));

  return {
    fileName: "",
    sheetName: "",
    headers,
    rows,
    data,
    missingColumns,
  };
}

function parseExcelFile(file: File): Promise<ParsedWorkbook> {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames.includes("GENERAL") ? "GENERAL" : workbook.SheetNames[0];

    if (!sheetName) {
      throw new Error("El archivo Excel no contiene hojas.");
    }

    const worksheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      raw: false,
      defval: "",
    });

    if (matrix.length === 0) {
      throw new Error("La hoja seleccionada no contiene datos.");
    }

    const headers = (matrix[0] ?? []).map((value) => normalizeCellValue(value));
    const rows = matrix.slice(1).map((row) => (row ?? []).map((value) => normalizeCellValue(value)));
    const parsed = mapRowsToPayload(headers, rows);

    return {
      ...parsed,
      fileName: file.name,
      sheetName,
    };
  });
}

function summaryValue(value: number | undefined | null) {
  return Number.isFinite(value ?? NaN) ? String(value) : "0";
}

function ActionChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        borderRadius: 999,
        border: active ? "1px solid #6D28D9" : "1px solid #C7D2FE",
        background: active ? "#6D28D9" : "#FFFFFF",
        color: active ? "#FFFFFF" : "#3730A3",
        padding: "9px 14px",
        fontSize: 13,
        fontWeight: 800,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #D8E5F2", borderRadius: 14, padding: 14, background: "#FFFFFF" }}>
      <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color: "#0F172A" }}>{value}</div>
    </div>
  );
}

function DetailTable({
  rows,
  title,
}: {
  rows: MigracionImportProcesarNewDetalleDto[];
  title: string;
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ fontSize: 16, fontWeight: 900, color: "#0F172A" }}>{title}</div>
      <div style={{ overflow: "auto", border: "1px solid #E2E8F0", borderRadius: 14, background: "#FFFFFF" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1200 }}>
          <thead>
            <tr style={{ background: "#F8FAFC" }}>
              {["Estado", "OT", "Cliente", "Proyecto", "CODIGO", "Site", "Tipo", "Moneda", "Monto OC", "Monto LQ", "Monto BCK", "Obs."].map(
                (header) => (
                  <th
                    key={header}
                    style={{ textAlign: "left", padding: "12px 14px", fontSize: 12, fontWeight: 800, color: "#334155" }}
                  >
                    {header}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.estadoValidacion}-${index}`} style={{ borderTop: "1px solid #E2E8F0" }}>
                <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 800 }}>{row.estadoValidacion}</td>
                <td style={{ padding: "12px 14px", fontSize: 13 }}>{row.oT || "-"}</td>
                <td style={{ padding: "12px 14px", fontSize: 13 }}>{row.cliente || "-"}</td>
                <td style={{ padding: "12px 14px", fontSize: 13 }}>{row.proyecto || "-"}</td>
                <td style={{ padding: "12px 14px", fontSize: 13 }}>{row.idSite || "-"}</td>
                <td style={{ padding: "12px 14px", fontSize: 13 }}>{row.site || "-"}</td>
                <td style={{ padding: "12px 14px", fontSize: 13 }}>{row.tipoTrabajo || "-"}</td>
                <td style={{ padding: "12px 14px", fontSize: 13 }}>{row.idMoneda ?? "-"}</td>
                <td style={{ padding: "12px 14px", fontSize: 13 }}>{row.montoOc ?? "-"}</td>
                <td style={{ padding: "12px 14px", fontSize: 13 }}>{row.montoLiq ?? "-"}</td>
                <td style={{ padding: "12px 14px", fontSize: 13 }}>{row.monto_Bck ?? "-"}</td>
                <td style={{ padding: "12px 14px", fontSize: 13, whiteSpace: "normal" }}>{row.observacion || "-"}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={12} style={{ padding: 18, textAlign: "center", color: "#64748B", fontSize: 13 }}>
                  Sin registros para mostrar.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MantenimientoMigracionImportarPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [action, setAction] = useState<ActionMode>("VALIDAR");
  const [fileName, setFileName] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [datos, setDatos] = useState<MigracionImportProcesarNewFilaDto[]>([]);
  const [missingColumns, setMissingColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<MigracionImportProcesarNewResultadoDto | null>(null);

  const hasFile = Boolean(fileName);

  const loadWorkbook = async (file: File) => {
    setError("");
    setResult(null);
    setLoading(true);

    try {
      if (!file.name.toLowerCase().endsWith(".xlsx")) {
        throw new Error("Solo se permiten archivos .xlsx.");
      }

      const parsed = await parseExcelFile(file);
      setFileName(parsed.fileName);
      setSheetName(parsed.sheetName);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setDatos(parsed.data);
      setMissingColumns(parsed.missingColumns);
    } catch (err) {
      setFileName("");
      setSheetName("");
      setHeaders([]);
      setRows([]);
      setDatos([]);
      setMissingColumns([]);
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo Excel.");
    } finally {
      setLoading(false);
    }
  };

  const onInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await loadWorkbook(file);
    }
    event.target.value = "";
  };

  const handleClear = () => {
    setFileName("");
    setSheetName("");
    setHeaders([]);
    setRows([]);
    setDatos([]);
    setMissingColumns([]);
    setResult(null);
    setError("");
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleProcess = async () => {
    if (datos.length === 0) {
      setError("Primero carga una plantilla Excel valida.");
      return;
    }

    setError("");
    setProcessing(true);

    try {
      const response = await procesarMigracionImportNew({
        accion: action,
        datos,
      });

      setResult(response);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "No se pudo ejecutar el proceso de migracion.");
    } finally {
      setProcessing(false);
    }
  };

  const problematicRows = useMemo(() => result?.problemas ?? [], [result]);

  return (
    <AppPage title="Importar migracion">
      <div style={{ display: "grid", gap: 18 }}>
        <AppCard style={{ marginBottom: 0 }}>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#6D28D9", textTransform: "uppercase" }}>
                  Mantenimiento / Migracion
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, color: "#0F172A" }}>
                  Carga de plantilla Excel
                </div>
                <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.5 }}>
                  La accion disponible depende del store nuevo: solo admite <strong>VALIDAR</strong> y <strong>ACTUALIZAR</strong>.
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <ActionChip active={action === "VALIDAR"} label="Validar" onClick={() => setAction("VALIDAR")} />
                <ActionChip active={action === "ACTUALIZAR"} label="Actualizar" onClick={() => setAction("ACTUALIZAR")} />
              </div>
            </div>

            <div
              style={{
                border: "1px dashed #C7D2FE",
                borderRadius: 16,
                background: "#F8FAFC",
                padding: 16,
                display: "grid",
                gap: 12,
              }}
            >
              <input ref={inputRef} type="file" accept=".xlsx" onChange={onInputChange} />
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  style={{
                    borderRadius: 12,
                    border: "1px solid #6D28D9",
                    background: "#6D28D9",
                    color: "#FFFFFF",
                    padding: "10px 14px",
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Cargar Excel
                </button>
                <button
                  type="button"
                  onClick={handleProcess}
                  disabled={!hasFile || loading || processing}
                  style={{
                    borderRadius: 12,
                    border: "1px solid #1D4ED8",
                    background: hasFile && !loading && !processing ? "#1D4ED8" : "#93C5FD",
                    color: "#FFFFFF",
                    padding: "10px 14px",
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: hasFile && !loading && !processing ? "pointer" : "not-allowed",
                  }}
                >
                  {processing ? "Procesando..." : action === "VALIDAR" ? "Validar plantilla" : "Actualizar registros"}
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  style={{
                    borderRadius: 12,
                    border: "1px solid #CBD5E1",
                    background: "#FFFFFF",
                    color: "#0F172A",
                    padding: "10px 14px",
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Limpiar
                </button>
              </div>
            </div>

            {fileName ? (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A" }}>
                  Archivo: {fileName} {sheetName ? `- Hoja: ${sheetName}` : ""}
                </div>
                <div style={{ fontSize: 12, color: "#64748B" }}>
                  Filas leidas: {rows.length} - Registros listos: {datos.length}
                </div>
              </div>
            ) : null}

            {missingColumns.length > 0 ? (
              <AppStatusMessage tone="error">
                Faltan columnas requeridas: {missingColumns.join(", ")}
              </AppStatusMessage>
            ) : null}

            {error ? <AppStatusMessage tone="error">{error}</AppStatusMessage> : null}

            {result ? (
              <AppStatusMessage tone="success">
                {action === "VALIDAR"
                  ? `Validacion completada. ${summaryValue(result.resumen.registrosConsolidados)} registros consolidados.`
                  : `Actualizacion completada. ${summaryValue(result.resumen.actualizados)} registros actualizados.`}
              </AppStatusMessage>
            ) : null}
          </div>
        </AppCard>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          <SummaryCard label="Filas Excel" value={summaryValue(result?.resumen.filasExcel)} />
          <SummaryCard label="Consolidados" value={summaryValue(result?.resumen.registrosConsolidados)} />
          <SummaryCard label="Coinciden" value={summaryValue(result?.resumen.coinciden)} />
          <SummaryCard label="Diferencias" value={summaryValue(result?.resumen.conDiferencias)} />
          <SummaryCard label="No encontrados" value={summaryValue(result?.resumen.noEncontrados)} />
          <SummaryCard label="Actualizados" value={summaryValue(result?.resumen.actualizados)} />
        </div>

        {result ? (
          <AppCard style={{ marginBottom: 0 }}>
            <div style={{ display: "grid", gap: 16 }}>
              <DetailTable rows={result.detalle} title="Detalle general" />
              <DetailTable rows={problematicRows} title="Registros con observacion" />
            </div>
          </AppCard>
        ) : null}
      </div>
    </AppPage>
  );
}
