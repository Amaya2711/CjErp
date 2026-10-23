import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties } from "react";
import * as XLSX from "xlsx";
import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppStatusMessage from "../../../components/base/AppStatusMessage";
import {
  cargarVentasSunat,
  validarVentasSunat,
  type VentasSunatFilaDto,
  type VentasSunatRegistroDto,
  type VentasSunatResumenDto,
} from "../../../api/ventasSunatService";
import DataGridPro from "../../../components/datagrid/DataGridPro";
import type { GridColumn, GridFormat } from "../../../components/datagrid/types";
import { getHttpErrorMessage } from "../../../utils/httpError";

type Key = keyof VentasSunatFilaDto;
type ColumnRule = { key: Key; aliases: string[] };

// Cabeceras del Registro de Ventas SIRE. Se incluyen también las variantes con tilde dañada (archivos con
// codificación incorrecta), porque la comparación ignora tildes y símbolos pero no letras faltantes.
const COLUMN_RULES: ColumnRule[] = [
  { key: "rucEmisor", aliases: ["Ruc"] },
  { key: "razonSocialEmisor", aliases: ["Razon Social"] },
  { key: "periodo", aliases: ["Periodo"] },
  { key: "carSunat", aliases: ["CAR SUNAT"] },
  { key: "fechaEmision", aliases: ["Fecha de emisión", "Fecha de emisin"] },
  { key: "fechaVcto", aliases: ["Fecha Vcto/Pago"] },
  { key: "tipoCp", aliases: ["Tipo CP/Doc."] },
  { key: "serie", aliases: ["Serie del CDP"] },
  { key: "nroCp", aliases: ["Nro CP o Doc. Nro Inicial (Rango)"] },
  { key: "nroFinal", aliases: ["Nro Final (Rango)"] },
  { key: "tipoDocIdentidad", aliases: ["Tipo Doc Identidad"] },
  { key: "nroDocIdentidad", aliases: ["Nro Doc Identidad"] },
  { key: "razonSocial", aliases: ["Apellidos Nombres/ Razón Social", "Apellidos Nombres/ Razn Social"] },
  { key: "valorFacturadoExportacion", aliases: ["Valor Facturado Exportación", "Valor Facturado Exportacin"] },
  { key: "biGravada", aliases: ["BI Gravada"] },
  { key: "dsctoBi", aliases: ["Dscto BI"] },
  { key: "igv", aliases: ["IGV / IPM"] },
  { key: "dsctoIgv", aliases: ["Dscto IGV / IPM"] },
  { key: "mtoExonerado", aliases: ["Mto Exonerado"] },
  { key: "mtoInafecto", aliases: ["Mto Inafecto"] },
  { key: "isc", aliases: ["ISC"] },
  { key: "biGravIvap", aliases: ["BI Grav IVAP"] },
  { key: "ivap", aliases: ["IVAP"] },
  { key: "icbper", aliases: ["ICBPER"] },
  { key: "otrosTributos", aliases: ["Otros Tributos"] },
  { key: "totalCp", aliases: ["Total CP"] },
  { key: "moneda", aliases: ["Moneda"] },
  { key: "tipoCambio", aliases: ["Tipo Cambio"] },
  { key: "fecEmisionDocMod", aliases: ["Fecha Emisión Doc Modificado", "Fecha Emisin Doc Modificado"] },
  { key: "tipoCpMod", aliases: ["Tipo CP Modificado"] },
  { key: "serieCpMod", aliases: ["Serie CP Modificado"] },
  { key: "nroCpMod", aliases: ["Nro CP Modificado"] },
  { key: "idProyectoOperadores", aliases: ["ID Proyecto Operadores Atribución", "ID Proyecto Operadores Atribucin"] },
  { key: "tipoNota", aliases: ["Tipo de Nota"] },
  { key: "estComp", aliases: ["Est. Comp"] },
  { key: "valorFobEmbarcado", aliases: ["Valor FOB Embarcado"] },
  { key: "valorOpGratuitas", aliases: ["Valor OP Gratuitas"] },
  { key: "tipoOperacion", aliases: ["Tipo Operación", "Tipo Operacin"] },
  { key: "damCp", aliases: ["DAM / CP"] },
  { key: "clu", aliases: ["CLU"] },
];

const AMOUNT_KEYS: Key[] = [
  "valorFacturadoExportacion", "biGravada", "dsctoBi", "igv", "dsctoIgv", "mtoExonerado", "mtoInafecto", "isc",
  "biGravIvap", "ivap", "icbper", "otrosTributos", "totalCp", "tipoCambio", "valorFobEmbarcado", "valorOpGratuitas",
];
const DATE_KEYS: Key[] = ["fechaEmision", "fechaVcto", "fecEmisionDocMod"];
const REQUIRED_KEYS: Key[] = ["rucEmisor", "periodo", "fechaEmision", "tipoCp", "serie", "nroCp", "razonSocial", "totalCp"];

function norm(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function text(value: unknown) {
  const s = value instanceof Date ? "" : String(value ?? "");
  return s.replace(/\s+/g, " ").trim() || null;
}

// Montos del SIRE: "S/ 104,780.08", "-S/ 104,313.00" o números.
function parseAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const negative = /^\(.*\)$/.test(raw) || raw.startsWith("-");
  const n = Number(raw.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parseDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const d = new Date(value.getTime() + 12 * 3600 * 1000);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const raw = String(value ?? "").trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (m) return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
}

type Parsed = { fileName: string; sheetName: string; datos: VentasSunatFilaDto[]; missing: string[]; periodo: string; error: string };

async function parseFile(file: File): Promise<Parsed> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("El archivo Excel no contiene hojas.");

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: true, defval: "" });

  // La fila 1 trae totales: la cabecera es la fila que contiene RUC y PERIODO.
  const headerAt = matrix.findIndex((row) => {
    const cells = (row ?? []).map(norm);
    return cells.includes("RUC") && cells.includes("PERIODO");
  });
  if (headerAt < 0) throw new Error("No se encontró la fila de cabecera del SIRE (Ruc ... Periodo).");

  const headers = (matrix[headerAt] ?? []).map(norm);
  const position = new Map<Key, number>();
  for (const rule of COLUMN_RULES) {
    const at = headers.findIndex((h) => rule.aliases.some((a) => norm(a) === h));
    if (at >= 0) position.set(rule.key, at);
  }
  const missing = REQUIRED_KEYS.filter((k) => !position.has(k)).map(String);

  const cellAt = (row: unknown[], key: Key) => row[position.get(key) ?? -1];

  const datos = matrix
    .slice(headerAt + 1)
    .filter((row) => text(cellAt(row ?? [], "nroCp")))
    .map((row) => {
      const out: Record<string, string | number | null> = {};
      for (const rule of COLUMN_RULES) {
        const v = cellAt(row, rule.key);
        out[rule.key] = AMOUNT_KEYS.includes(rule.key) ? parseAmount(v) : DATE_KEYS.includes(rule.key) ? parseDate(v) : text(v);
      }
      return out as unknown as VentasSunatFilaDto;
    });

  // La carga es por periodo (año-mes) y un solo RUC emisor.
  const periodos = [...new Set(datos.map((d) => d.periodo ?? ""))];
  const rucs = [...new Set(datos.map((d) => d.rucEmisor ?? ""))];
  let error = "";
  if (periodos.length > 1) error = `El archivo contiene varios periodos (${periodos.join(", ")}). Cargue un solo mes.`;
  else if (periodos.length === 1 && !/^\d{4}(0[1-9]|1[0-2])$/.test(periodos[0])) error = `Periodo no válido: ${periodos[0]}`;
  else if (rucs.length > 1) error = `El archivo contiene varios RUC emisores (${rucs.join(", ")}).`;

  return { fileName: file.name, sheetName, datos, missing, periodo: periodos[0] ?? "", error };
}

const periodoLabel = (p: string) => (p.length === 6 ? `${p.slice(4)}-${p.slice(0, 4)}` : p);

const btn = (bg: string, enabled = true): CSSProperties => ({
  borderRadius: 12,
  border: `1px solid ${bg}`,
  background: enabled ? bg : "#CBD5E1",
  color: "#FFFFFF",
  padding: "10px 14px",
  fontSize: 13,
  fontWeight: 800,
  cursor: enabled ? "pointer" : "not-allowed",
});

const MONTO: GridFormat = { type: "fixedPoint", precision: 2 };

type GridRow = VentasSunatFilaDto & { id: number; idEmpresa: number | null; idCliente: number | null };

const cutDate = (v: string | null) => (v ? v.slice(0, 10) : null);
const withDates = <T extends VentasSunatFilaDto>(r: T): T => ({
  ...r,
  fechaEmision: cutDate(r.fechaEmision),
  fechaVcto: cutDate(r.fechaVcto),
  fecEmisionDocMod: cutDate(r.fecEmisionDocMod),
});

const sinAsignar = (v: unknown) => (v == null ? <span style={{ color: "#B91C1C", fontWeight: 700 }}>Sin asignar</span> : String(v));

function SummaryCard({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div style={{ border: "1px solid #D8E5F2", borderRadius: 14, padding: 14, background: "#FFFFFF" }}>
      <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color: warn ? "#B91C1C" : "#0F172A" }}>{value}</div>
    </div>
  );
}

export default function VentasSunatPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [datos, setDatos] = useState<VentasSunatFilaDto[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [lote, setLote] = useState("");
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resumen, setResumen] = useState<VentasSunatResumenDto | null>(null);
  const [registros, setRegistros] = useState<VentasSunatRegistroDto[]>([]);

  const reset = () => {
    setFileName("");
    setSheetName("");
    setPeriodo("");
    setDatos([]);
    setMissing([]);
    setLote("");
    setInfo("");
    setError("");
    setResumen(null);
    setRegistros([]);
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    reset();
    setBusy(true);
    try {
      if (!/\.xlsx?$/i.test(file.name)) throw new Error("Solo se permiten archivos Excel (.xlsx / .xls).");
      const parsed = await parseFile(file);
      setFileName(parsed.fileName);
      setSheetName(parsed.sheetName);
      setDatos(parsed.datos);
      setMissing(parsed.missing);
      setPeriodo(parsed.periodo);
      setError(parsed.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo Excel.");
    } finally {
      setBusy(false);
    }
  };

  const grabar = async () => {
    if (!window.confirm(`Se grabará el periodo ${periodoLabel(periodo)} y se REEMPLAZARÁ lo cargado antes para ese periodo. ¿Continuar?`)) return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const carga = await cargarVentasSunat(datos);
      setLote(carga.lote);
      setInfo(
        `Periodo ${periodoLabel(carga.periodo)}: ${carga.insertados} registros cargados (${carga.reemplazados} reemplazados de una carga anterior). Ahora puede validar.`
      );
      setResumen(null);
      setRegistros([]);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo grabar el registro de ventas."));
    } finally {
      setBusy(false);
    }
  };

  const validar = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await validarVentasSunat(lote);
      setResumen(res.resumen);
      setRegistros(res.registros);
      setInfo("Validación completada: IdCliente grabado.");
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo validar el registro de ventas."));
    } finally {
      setBusy(false);
    }
  };

  // Una sola grilla: antes de validar muestra lo leído del Excel; después, lo grabado con IdEmpresa / IdCliente.
  const rows = useMemo<GridRow[]>(
    () =>
      registros.length > 0
        ? registros.map((r) => ({ ...withDates(r), id: r.idVentaSunat }))
        : datos.map((d, i) => ({ ...d, id: i + 1, idEmpresa: null, idCliente: null })),
    [registros, datos]
  );
  const validado = registros.length > 0;
  const num = (dataField: Key, caption: string, visible = true): GridColumn<GridRow> => ({
    dataField,
    caption,
    dataType: "number",
    format: MONTO,
    alignment: "right",
    visible,
  });

  const columns = useMemo<GridColumn<GridRow>[]>(
    () => [
      { dataField: "periodo", caption: "Periodo", width: 80 },
      { dataField: "fechaEmision", caption: "Emisión", dataType: "date", width: 100 },
      { dataField: "tipoCp", caption: "T/D", width: 60 },
      { dataField: "documento", caption: "Documento", width: 150, calculateCellValue: (r) => `${r.serie ?? ""}-${r.nroCp ?? ""}` },
      { dataField: "nroDocIdentidad", caption: "RUC cliente", width: 110 },
      { dataField: "razonSocial", caption: "Cliente (razón social)", minWidth: 260 },
      num("biGravada", "BI gravada"),
      num("dsctoBi", "Dscto BI"),
      num("igv", "IGV"),
      num("dsctoIgv", "Dscto IGV"),
      num("mtoInafecto", "Inafecto"),
      num("totalCp", "Total CP"),
      { dataField: "moneda", caption: "Mon.", width: 70 },
      { dataField: "tipoCambio", caption: "T/C", dataType: "number", width: 80 },
      { dataField: "razonSocialEmisor", caption: "Emisor", width: 160 },
      { dataField: "fechaVcto", caption: "Vcto/Pago", dataType: "date", visible: false },
      { dataField: "carSunat", caption: "CAR SUNAT", visible: false },
      num("valorFacturadoExportacion", "Exportación", false),
      num("mtoExonerado", "Exonerado", false),
      num("otrosTributos", "Otros tributos", false),
      { dataField: "fecEmisionDocMod", caption: "Emisión doc. modif.", dataType: "date", visible: false },
      { dataField: "tipoCpMod", caption: "T/D modif.", visible: false },
      { dataField: "serieCpMod", caption: "Serie modif.", visible: false },
      { dataField: "nroCpMod", caption: "Nro modif.", visible: false },
      { dataField: "tipoNota", caption: "Tipo nota", visible: false },
      { dataField: "estComp", caption: "Est. comp.", visible: false },
      { dataField: "tipoOperacion", caption: "Tipo operación", visible: false },
      { dataField: "idEmpresa", caption: "IdEmpresa", dataType: "number", width: 100 },
      { dataField: "idCliente", caption: "IdCliente", dataType: "number", visible: validado, width: 100, cellRender: sinAsignar },
    ],
    [validado]
  );

  const canSave = !busy && datos.length > 0 && missing.length === 0 && !error;

  return (
    <AppPage title="Ventas SUNAT">
      <div style={{ display: "grid", gap: 18 }}>
        <AppCard style={{ marginBottom: 0 }}>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.5 }}>
              Cargue el Excel del Registro de Ventas SIRE <strong>de un solo mes</strong>: al grabar se reemplaza lo cargado antes para ese
              periodo. Luego valide para asignar <strong>IdCliente</strong> (tabla Cliente, nombre igual a la razón social).
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={onFile} style={{ display: "none" }} />
              <button type="button" style={btn("#6D28D9", !busy)} disabled={busy} onClick={() => inputRef.current?.click()}>
                Cargar Excel
              </button>
              <button type="button" style={btn("#1D4ED8", canSave)} disabled={!canSave} onClick={grabar}>
                Grabar en base de datos
              </button>
              <button type="button" style={btn("#059669", !busy && Boolean(lote))} disabled={busy || !lote} onClick={validar}>
                Validar cliente
              </button>
              <button type="button" style={btn("#64748B", !busy)} disabled={busy} onClick={reset}>
                Limpiar
              </button>
            </div>
            {fileName ? (
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
                Archivo: {fileName} - Hoja: {sheetName} - Periodo: {periodo ? periodoLabel(periodo) : "-"} - Registros listos: {datos.length}
              </div>
            ) : null}
            {missing.length > 0 ? (
              <AppStatusMessage tone="error">Faltan columnas requeridas: {missing.join(", ")}</AppStatusMessage>
            ) : null}
            {error ? <AppStatusMessage tone="error">{error}</AppStatusMessage> : null}
            {info ? <AppStatusMessage tone="success">{info}</AppStatusMessage> : null}
          </div>
        </AppCard>

        {resumen ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <SummaryCard label="Filas" value={resumen.totalFilas} />
            <SummaryCard label="Cliente asignado" value={resumen.clienteAsignado} />
            <SummaryCard label="Sin cliente" value={resumen.sinCliente} warn={resumen.sinCliente > 0} />
          </div>
        ) : null}

        {rows.length > 0 ? (
          <AppCard style={{ marginBottom: 0 }}>
            <DataGridPro<GridRow>
              dataSource={rows}
              columns={columns}
              keyExpr="id"
              height="65vh"
              loading={busy}
              noDataText="Sin registros."
              stateStoringKey="ventassunat_sire"
              showSearchPanel
              exportFileName="ventas_sunat"
              paging={{ pageSize: 100, pageSizes: [50, 100, 250, 500] }}
              summary={{ totalItems: [{ column: "totalCp", type: "sum" }, { column: "documento", type: "count" }] }}
            />
          </AppCard>
        ) : null}
      </div>
    </AppPage>
  );
}
