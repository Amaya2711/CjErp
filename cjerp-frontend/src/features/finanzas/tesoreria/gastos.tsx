// --- ColumnFilterDropdown component for typing and filtering options ---

type ColumnFilterDropdownProps = {
  header: any;
  filtroColumnaMenuRef: React.RefObject<HTMLDivElement | null>;
  filtrosColumnas: Record<string, string[]>;
  setFiltrosColumnas: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  opcionesFiltroPorColumna: Record<string, string[]>;
  filtroBusqueda: string;
  setFiltroBusqueda: (valor: string) => void;
};

const ColumnFilterDropdown: React.FC<ColumnFilterDropdownProps> = ({ header, filtroColumnaMenuRef, filtrosColumnas, setFiltrosColumnas, opcionesFiltroPorColumna, filtroBusqueda, setFiltroBusqueda }) => {
  const opciones = (opcionesFiltroPorColumna[header.key] ?? []).filter((opcion) =>
    (opcion || "(Vacío)").toLowerCase().includes(filtroBusqueda.toLowerCase())
  );
  return (
    <div
      ref={filtroColumnaMenuRef}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        left: 0,
        width: 220,
        maxHeight: 280,
        overflow: "auto",
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
        borderRadius: 12,
        boxShadow: "0 10px 28px rgba(15, 23, 42, 0.14)",
        padding: 10,
        zIndex: 20,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong style={{ fontSize: 11, color: "#17143A" }}>{header.label}</strong>
        <button
          type="button"
          onClick={() =>
            setFiltrosColumnas((prev) => ({
              ...prev,
              [header.key]: [],
            }))
          }
          style={{
            border: "none",
            background: "transparent",
            color: "#6E4CCB",
            fontSize: 10,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Limpiar
        </button>
      </div>
      <input
        type="text"
        placeholder="Buscar opción..."
        value={filtroBusqueda}
        onChange={e => setFiltroBusqueda(e.target.value)}
        style={{
          width: "100%",
          marginBottom: 8,
          padding: "4px 8px",
          fontSize: 11,
          border: "1px solid #E5E7EB",
          borderRadius: 6,
        }}
      />
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 4px",
          fontSize: 11,
          color: "#374151",
          cursor: "pointer",
          borderBottom: "1px solid #F3F4F6",
          marginBottom: 4,
        }}
      >
        <input
          type="checkbox"
          checked={(filtrosColumnas[header.key] ?? []).length === 0}
          onChange={() =>
            setFiltrosColumnas((prev) => ({
              ...prev,
              [header.key]: [],
            }))
          }
        />
        <span>(Todas)</span>
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {opciones.map((opcion) => {
          const seleccionadas = filtrosColumnas[header.key] ?? [];
          const checked = seleccionadas.includes(opcion);
          return (
            <label
              key={`${header.key}-${opcion || "__empty__"}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 4px",
                fontSize: 11,
                color: "#374151",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  setFiltrosColumnas((prev) => {
                    const actuales = prev[header.key] ?? [];
                    const siguientes = checked
                      ? actuales.filter((item) => item !== opcion)
                      : [...actuales, opcion];
                    return {
                      ...prev,
                      [header.key]: siguientes,
                    };
                  })
                }
              />
              <span title={opcion || "(Vacío)"}>
                {opcion || "(Vacío)"}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
};
import React, { useEffect, useMemo, useRef, useState } from "react";
  // Estado para fila seleccionada
 
import { useCrudForm } from "../../../hooks/useCrudForm";
import httpClient from "../../../api/httpClient";
import {
  buildPlanillaConsultaEstadosRequest,
  consultarPlanillaEstados,
} from "../../../api/planillaConsultaService";
import CrudToolbar, { matchesCrudToolbarSearch, type CrudToolbarSearchField } from "../../../components/base/CrudToolbar";
import { FiltroOperativoLookup } from "../../../components/lookups/FiltroOperativoLookup";
import { listarEmpleadosCta } from "../../../api/empleadoService";
import { getTareas, getValoresGasto } from "../../../api/filtroOperativoService";
import { listarGestorOptions } from "../../../api/gestorService";
import { listarSolicitanteOptions } from "../../../api/solicitanteService";
import { listarValidadorOptions } from "../../../api/validadorService";
import { useConstantesPorCampo } from "../../../hooks/useConstantesPorCampo";
import type { ConstanteOption } from "../../../models/constante";
import type { FiltroOperativoValue, TareaOption } from "../../../models/filtroOperativo";
import type { EmpleadoCta } from "../../../models/empleadoCta";
import type { ValoresGastoRequest, ValoresGastoResponse } from "../../../models/valoresGasto";
import { getAuthUser } from "../../../utils/authStorage";
import { compressImageForUpload } from "../../../utils/imageCompression";

type GastoDto = {
  id: number;
  idSuministroProvisional?: number | null;
  fechaInicioSuministroProvisional?: string;
  filtroOperativoKey: string;
  responsable: string;
  responsableLabel?: string;
  idBancoCta?: number | null;
  idProyecto?: number | null;
  idSite?: string;
  correSite?: number | null;
  idTarea?: number | null;
  tareaLabel?: string;
  idCliente?: number | null;
  cuenta: string;
  cuentaNumero?: string;
  cuentaInter?: string;
  nombreCta?: string;
  ruc?: string;
  tipoPago: string;
  monto: number;
  subtotal?: number;
  total?: number;
  igv?: number;
  idRendicion?: number;
  detalle: string;
  comentario: string;
  fechaVencimiento?: string;
  fechaEmision?: string;
  solicitante?: string;
  solicitanteLabel?: string;
  gestor?: string;
  gestorLabel?: string;
  validador?: string;
  validadorLabel?: string;
  moneda?: string;
  monedaLabel?: string;
  bien?: string;
  bienLabel?: string;
  comprobante?: string;
  comprobanteLabel?: string;
  tipoPagoLabel?: string;
  serie?: string;
  facturaUrl?: string;
  facturaPath?: string;
  rutaFactura?: string;
  rutaFacturaOriginal?: string;
  rutaFacturaUrl?: string;
  rutaFacturaEnviada?: string;
  nombreProyecto?: string;
  clienteNombre?: string;
  tipoTrabajo?: string;
  siteNombre?: string;
  ot?: string;
  tipoCambio?: number;
  idUsuarioFactura?: number | null;
  estado?: number;
};

type GastoForm = {
  id: number | null;
  idSuministroProvisional: string;
  fechaInicioSuministroProvisional: string;
  filtroOperativo: FiltroOperativoValue;
  responsable: string;
  responsableLabel: string;
  idBancoCta: string;
  cuenta: string;
  cuentaNumero: string;
  cuentaInter: string;
  nombreCta: string;
  ruc: string;
  rendicion: boolean;
  tipoPago: string;
  monto: string;
  detalle: string;
  comentario: string;
  fechaVencimiento: string;
  fechaEmision: string;
  solicitante: string;
  solicitanteLabel: string;
  gestor: string;
  gestorLabel: string;
  validador: string;
  validadorLabel: string;
  moneda: string;
  monedaLabel: string;
  bien: string;
  bienLabel: string;
  comprobante: string;
  comprobanteLabel: string;
  serie: string;
  facturaUrl: string;
  facturaPath: string;
  rutaFactura?: string;
  rutaFacturaOriginal?: string;
  rutaFacturaUrl?: string;
  rutaFacturaEnviada?: string;
  estado: number;
};

type GastoPayload = {
  idSuministroProvisional?: number;
  filtroOperativoKey: string;
  responsable: string;
  idBancoCta?: number;
  idProyecto?: number;
  idSite?: string;
  correSite?: number;
  idTarea?: number;
  idCliente?: number;
  cuenta: string;
  cuentaNumero?: string;
  cuentaInter?: string;
  nombreCta?: string;
  ruc?: string;
  tipoPago: string;
  monto: number;
  subtotal?: number;
  total?: number;
  igv?: number;
  idRendicion: number;
  detalle: string;
  comentario: string;
  fechaVencimiento?: string;
  fechaEmision?: string;
  solicitante?: string;
  solicitanteLabel?: string;
  gestor?: string;
  gestorLabel?: string;
  validador?: string;
  validadorLabel?: string;
  moneda?: string;
  monedaLabel?: string;
  bien?: string;
  bienLabel?: string;
  comprobante?: string;
  comprobanteLabel?: string;
  tipoPagoLabel?: string;
  serie?: string;
  facturaUrl?: string;
  facturaPath?: string;
  tipoTrabajo?: string;
  siteNombre?: string;
  usuario?: string;
  ot?: string;
  tipoCambio?: number;
  idUsuarioFactura?: number;
  imgFactura?: string;
};

type FacturaUploadResponse = {
  fileName: string;
  fileUrl: string;
  storagePath: string;
};

type SuministroProvisionalVigenteOption = {
  idProvisional: number;
  idResponsable?: number | null;
  responsable?: string;
  idTarea?: number | null;
  tarea?: string;
  tipoTrabajo?: string;
  ot?: string;
  comentario?: string;
  monto?: number | null;
  fechaInicio?: string | null;
  nombreCliente?: string;
  nombreProyecto?: string;
  nombreSite?: string;
};

const GASTOS_API_URL = "/tesoreria/gastos";
const FACTURA_UPLOAD_API_URL = `${GASTOS_API_URL}/upload-factura`;
const TIPO_CAMBIO_GASTO = 3.8;
const TAREAS_CON_SUMINISTRO_VIGENTE = new Set([52, 53]);
const VALORES_GASTO_INICIALES: ValoresGastoResponse = {
  porcentaje: 0,
  aprobado: 0,
  pagado: 0,
  adelantado: 0,
  saldo2: 0,
  saldo: 0,
};


function extraerArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function extraerObjeto<T>(value: T): T {
  return value;
}

function obtenerFechaActual(): string {
  return new Date().toISOString().slice(0, 10);
}

function toPositiveNumber(...values: Array<string | number | null | undefined>): number {
  for (const value of values) {
    if (value == null) {
      continue;
    }

    const text = String(value).trim();
    if (!text) {
      continue;
    }

    const parsed = Number(text);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
}

function getConstanteStoredValue(option: ConstanteOption): string {
  return option.codigo || option.value || option.label;
}

function normalizeLookupToken(value?: string | null): string {
  const text = value?.trim() ?? "";

  if (!text) {
    return "";
  }

  const numeric = Number(text);

  if (Number.isFinite(numeric)) {
    return String(numeric);
  }

  return text;
}

function findConstanteOption(
  options: ConstanteOption[],
  selectedValue?: string | null
): ConstanteOption | undefined {
  const value = normalizeLookupToken(selectedValue);

  if (!value) {
    return undefined;
  }

  return options.find((option) =>
    [option.codigo, option.value, option.label]
      .map((candidate) => normalizeLookupToken(candidate))
      .filter(Boolean)
      .includes(value)
  );
}

function normalizeConstanteValue(options: ConstanteOption[], selectedValue?: string | null): string {
  const match = findConstanteOption(options, selectedValue);
  return match ? getConstanteStoredValue(match) : selectedValue?.trim() ?? "";
}

function getConstanteLabel(options: ConstanteOption[], selectedValue?: string | null): string {
  const match = findConstanteOption(options, selectedValue);
  return match?.label ?? selectedValue?.trim() ?? "";
}

function getConstanteLabelOrFallback(
  options: ConstanteOption[],
  selectedValue?: string | null,
  fallbackLabel?: string | null
): string {
  const match = findConstanteOption(options, selectedValue);

  if (match?.label) {
    return match.label;
  }

  return fallbackLabel?.trim() ?? "";
}

function getSelectValue(options: ConstanteOption[], selectedValue?: string | null): string {
  const match = findConstanteOption(options, selectedValue);
  return match ? getConstanteStoredValue(match) : selectedValue?.trim() ?? "";
}

function esConstanteValida(options: ConstanteOption[], selectedValue?: string | null): boolean {
  return Boolean(findConstanteOption(options, selectedValue));
}

function getTareaLabelOrFallback(
  tareas: TareaOption[],
  correlativo?: number | null,
  fallbackLabel?: string | null
): string {
  if (correlativo != null) {
    const match = tareas.find((tarea) => Number(tarea.correlativo) === Number(correlativo));
    if (match?.tarea) {
      return match.tarea;
    }
  }

  return fallbackLabel?.trim() ?? "";
}

function normalizeSearchText(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function matchesFlexibleSearch(label: string, query: string): boolean {
  const normalizedLabel = normalizeSearchText(label);
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return true;
  }

  const compactLabel = normalizedLabel.replace(/\s+/g, "");
  const compactQuery = normalizedQuery.replace(/\s+/g, "");

  if (compactLabel.includes(compactQuery)) {
    return true;
  }

  const labelWords = normalizedLabel.split(" ").filter(Boolean);
  const queryWords = normalizedQuery.split(" ").filter(Boolean);

  if (queryWords.length <= 1) {
    return false;
  }

  let labelIndex = 0;

  for (const queryWord of queryWords) {
    let found = false;

    while (labelIndex < labelWords.length) {
      if (labelWords[labelIndex].includes(queryWord)) {
        found = true;
        labelIndex += 1;
        break;
      }

      labelIndex += 1;
    }

    if (!found) {
      return false;
    }
  }

  return true;
}

function toNumberOrZero(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const IGV_RATE = 0.18;

function roundToTwoDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function renderGridCellText(value: unknown): React.ReactNode {
  const text = String(value ?? "").trim();

  if (!text) {
    return "";
  }

  return (
    <span
      title={text}
      style={{
        display: "block",
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        maxWidth: "100%",
      }}
    >
      {text}
    </span>
  );
}

function buildSuministroVigenteLabel(item: SuministroProvisionalVigenteOption): string {
  const idText = item.idProvisional ? String(item.idProvisional) : "";
  const fechaText = normalizeDateForInput(item.fechaInicio ?? "");
  const fechaDisplay = fechaText
    ? fechaText.split("-").reverse().join("/")
    : "";

  return [idText, fechaDisplay].filter(Boolean).join(" - ");
}

function requiereSuministroVigente(idTarea?: number | null): boolean {
  return idTarea != null && TAREAS_CON_SUMINISTRO_VIGENTE.has(Number(idTarea));
}

function normalizeColumnOptionValue(value: unknown): string {
  return String(value ?? "").trim();
}

function matchesColumnFilterValue(value: unknown, selectedValues: string[]): boolean {
  if (selectedValues.length === 0) {
    return true;
  }

  const normalizedValue = normalizeSearchText(normalizeColumnOptionValue(value));

  return selectedValues.some(
    (selectedValue) => normalizeSearchText(selectedValue) === normalizedValue
  );
}

function areFiltroOperativoValuesEqual(
  left?: FiltroOperativoValue,
  right?: FiltroOperativoValue
): boolean {
  return (
    (left?.filtro?.filtroKey ?? "") === (right?.filtro?.filtroKey ?? "") &&
    (left?.filtro?.idCliente ?? 0) === (right?.filtro?.idCliente ?? 0) &&
    (left?.filtro?.idProyecto ?? 0) === (right?.filtro?.idProyecto ?? 0) &&
    (left?.filtro?.idSite ?? "") === (right?.filtro?.idSite ?? "") &&
    (left?.filtro?.correlativo ?? 0) === (right?.filtro?.correlativo ?? 0) &&
    (left?.tipoTrabajo?.tipoTrabajo ?? "") === (right?.tipoTrabajo?.tipoTrabajo ?? "") &&
    (left?.ot?.ot ?? "") === (right?.ot?.ot ?? "") &&
    (left?.tarea?.correlativo ?? 0) === (right?.tarea?.correlativo ?? 0) &&
    (left?.tarea?.tarea ?? "") === (right?.tarea?.tarea ?? "")
  );
}

function isFacturaComprobante(
  options: ConstanteOption[],
  selectedValue?: string | null
): boolean {
  const match = findConstanteOption(options, selectedValue);
  const valuesToCheck = match
    ? [match.label, match.codigo, match.value]
    : [selectedValue];

  return valuesToCheck.some((value) => normalizeSearchText(value) === "factura");
}

function buildValoresGastoRequest(
  filtroOperativo: FiltroOperativoValue
): ValoresGastoRequest | null {
  const filtro = filtroOperativo.filtro;
  const tipoTrabajo = filtroOperativo.tipoTrabajo?.tipoTrabajo?.trim();
  const ot = filtroOperativo.ot?.ot?.trim();

  if (!filtro?.filtroKey || !tipoTrabajo) {
    return null;
  }

  const idCliente = toNumberOrZero(filtro.idCliente);
  const idProyecto = toNumberOrZero(filtro.idProyecto);
  const idSite = String(filtro.idSite ?? "").trim();
  const correlativo = toNumberOrZero(filtro.correlativo);

  if (idCliente <= 0 || !idSite || correlativo <= 0) {
    return null;
  }

  return {
    idCliente,
    idProyecto,
    idSite,
    correlativo,
    tipoTrabajo,
    ot: ot || undefined,
    usarOt: Boolean(ot),
    tipoCambio: TIPO_CAMBIO_GASTO,
  };
}

function formatDecimalValue(value: number): string {
  return new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getFacturaDisplayPath(facturaPath?: string, facturaUrl?: string): string {
  // Prioriza la URL pública de SharePoint si existe
  return facturaUrl?.trim() || facturaPath?.trim() || "";
}

function resolveFacturaFields(item: Partial<GastoDto>) {
  const facturaUrl =
    item.facturaUrl?.trim() ||
    item.rutaFacturaUrl?.trim() ||
    "";

  const facturaPath =
    item.facturaPath?.trim() ||
    item.rutaFactura?.trim() ||
    item.rutaFacturaOriginal?.trim() ||
    item.rutaFacturaEnviada?.trim() ||
    facturaUrl;

  return { facturaUrl, facturaPath };
}

function buildCuentaResumen(empleado: EmpleadoCta): string {
  return `Banco: ${empleado.nombreBanco || ""}, Tipo Cta: ${empleado.nombreCta || ""}, Cta. ${empleado.cuenta || ""}, CI: ${empleado.cuentaInter || ""}, Nro Doc: ${empleado.nroDocumento || ""}`;
}

function buildCuentaMetadata(empleado: EmpleadoCta) {
  return {
    cuentaNumero: empleado.cuenta || "",
    cuentaInter: empleado.cuentaInter || "",
    nombreCta: empleado.nombreCta || "",
    ruc: empleado.nroDocumento || "",
  };
}

function extractCuentaResumenParts(cuentaResumen?: string) {
  const match = /Tipo Cta:\s*(.*?),\s*Cta\.\s*(.*?),\s*CI:\s*(.*?),\s*Nro Doc:\s*(.*)$/i.exec(
    cuentaResumen ?? ""
  );

  return {
    nombreCta: match?.[1]?.trim() ?? "",
    cuentaNumero: match?.[2]?.trim() ?? "",
    cuentaInter: match?.[3]?.trim() ?? "",
    ruc: match?.[4]?.trim() ?? "",
  };
}

function getNumericUserId(value?: string | null): number | undefined {
  const digits = (value ?? "").replace(/\D/g, "");

  if (!digits) {
    return undefined;
  }

  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeDateForInput(dateStr?: string | null): string {
  const value = dateStr?.trim();

  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const year = slashMatch[3];

    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getHttpMessage(error: unknown, fallback: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: { data?: { message?: string } } }).response?.data?.message === "string"
  ) {
    return (error as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function findRecordValue(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in row) {
      return row[key];
    }
  }

  const normalizedEntries = Object.entries(row).map(([key, value]) => [key.toLowerCase(), value] as const);

  for (const key of keys) {
    const found = normalizedEntries.find(([entryKey]) => entryKey === key.toLowerCase());
    if (found) {
      return found[1];
    }
  }

  return undefined;
}

function getRecordString(row: Record<string, unknown>, ...keys: string[]): string {
  const value = findRecordValue(row, ...keys);
  return value == null ? "" : String(value).trim();
}

function getRecordNumber(row: Record<string, unknown>, ...keys: string[]): number | null {
  const value = findRecordValue(row, ...keys);

  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const text = String(value).trim();
  const directParsed = Number(text);
  if (Number.isFinite(directParsed)) {
    return directParsed;
  }

  const normalizedText = text.includes(",") && !text.includes(".")
    ? text.replace(",", ".")
    : text.replace(/,/g, "");
  const normalizedParsed = Number(normalizedText);

  return Number.isFinite(normalizedParsed) ? normalizedParsed : null;
}

function mapPlanillaConsultaRowToGastoDto(row: Record<string, unknown>, index: number): GastoDto {
  return {
    id: getRecordNumber(row, "Corre", "CorrelativoPlanilla", "Id", "id", "IdPlanilla", "idPlanilla") ?? index + 1,
    idSuministroProvisional:
      getRecordNumber(
        row,
        "IdSuministroProvisional",
        "idSuministroProvisional",
        "IdProvisional",
        "idProvisional",
        "idprovisional"
      ) ??
      undefined,
    fechaInicioSuministroProvisional: getRecordString(
      row,
      "FechaInicio",
      "fechaInicio",
      "fechainicio"
    ),
    filtroOperativoKey: getRecordString(row, "FiltroOperativoKey", "filtroOperativoKey", "FiltroKey", "filtroKey"),
    responsable: getRecordString(row, "IdResponsable", "idResponsable", "ResponsableId", "responsableId"),
    responsableLabel: getRecordString(row, "Responsable", "responsable", "NomResponsable", "nomResponsable"),
    idBancoCta: getRecordNumber(row, "IdBancoCta", "idBancoCta"),
    idProyecto: getRecordNumber(row, "IdProyecto", "idProyecto"),
    idSite: getRecordString(row, "IdSite", "idSite", "Site"),
    correSite: getRecordNumber(row, "CorSite", "corSite", "CorreSite", "correSite"),
    idTarea: getRecordNumber(row, "IdTarea", "idTarea", "TareaId", "tareaId", "Id_Tarea", "id_tarea"),
    tareaLabel: getRecordString(row, "Tarea", "tarea", "NomTarea", "nomTarea", "DescTarea", "descTarea"),
    idCliente: getRecordNumber(row, "IdCliente", "idCliente"),
    cuenta: getRecordString(row, "Cuenta", "cuenta"),
    cuentaNumero: getRecordString(row, "CuentaNumero", "cuentaNumero"),
    cuentaInter: getRecordString(row, "CuentaInter", "cuentaInter"),
    nombreCta: getRecordString(row, "NombreCta", "nombreCta"),
    ruc: getRecordString(row, "RUC", "Ruc", "ruc"),
    tipoPago: getRecordString(row, "IdTipoPago", "idTipoPago", "TipoPago", "tipoPago"),
    monto: getRecordNumber(row, "Total", "total", "Totalb", "totalb", "TotalPagar", "totalPagar") ?? 0,
    subtotal: getRecordNumber(row, "Subtotal", "subtotal", "Subtotalb", "subtotalb") ?? undefined,
    total: getRecordNumber(row, "Total", "total", "Totalb", "totalb", "TotalPagar", "totalPagar") ?? undefined,
    igv: getRecordNumber(row, "IGV", "Igv", "igv", "Igvb", "igvb") ?? undefined,
    idRendicion: getRecordNumber(row, "IdRendicion", "idRendicion") ?? undefined,
    detalle: getRecordString(row, "Detalle", "detalle"),
    comentario: getRecordString(row, "Observacion", "observacion", "Comentario", "comentario"),
    fechaVencimiento: getRecordString(row, "FechaDeposito", "fechaDeposito", "FechaVencimiento", "fechaVencimiento"),
    fechaEmision: getRecordString(row, "FecIngreso", "fecIngreso", "FechaEmision", "fechaEmision", "FecEmision", "fecEmision"),
    solicitante: getRecordString(row, "IdSolicitante", "idSolicitante"),
    solicitanteLabel: getRecordString(row, "Solicitante", "solicitante", "SolicitanteLabel", "solicitanteLabel"),
    gestor: getRecordString(row, "Gestor", "gestor"),
    gestorLabel: getRecordString(row, "GestorLabel", "gestorLabel"),
    validador: getRecordString(row, "IdValidador", "idValidador"),
    validadorLabel: getRecordString(row, "Validador", "validador", "ValidadorLabel", "validadorLabel"),
    moneda: getRecordString(row, "TipoMoneda", "tipoMoneda", "Moneda", "moneda"),
    monedaLabel: getRecordString(row, "Moneda", "moneda", "MonedaLabel", "monedaLabel"),
    bien: getRecordString(row, "IdBien", "idBien", "Bien", "bien"),
    bienLabel: getRecordString(row, "Bien", "bien", "BienLabel", "bienLabel"),
    comprobante: getRecordString(row, "IdComprobante", "idComprobante", "Comprobante", "comprobante"),
    comprobanteLabel: getRecordString(row, "Comprobante", "comprobante", "ComprobanteLabel", "comprobanteLabel"),
    tipoPagoLabel: getRecordString(row, "TipoPago", "tipoPago", "TipoPagoLabel", "tipoPagoLabel"),
    serie: getRecordString(row, "Serie", "serie"),
    facturaUrl: getRecordString(row, "FacturaUrl", "facturaUrl", "RutaFacturaUrl", "rutaFacturaUrl","imgFactura","ImgFactura"),
    //facturaPath: getRecordString(row, "FacturaPath", "facturaPath", "RutaFactura", "rutaFactura"),
    //rutaFactura: getRecordString(row, "RutaFactura", "rutaFactura"),
    //rutaFacturaOriginal: getRecordString(row, "RutaFacturaOriginal", "rutaFacturaOriginal"),
    //rutaFacturaUrl: getRecordString(row, "RutaFacturaUrl", "rutaFacturaUrl","imgFactura","ImgFactura"),
    //rutaFacturaEnviada: getRecordString(row, "RutaFacturaEnviada", "rutaFacturaEnviada"),
    nombreProyecto: getRecordString(row, "NombreProyecto", "nombreProyecto"),
    clienteNombre: getRecordString(row, "Cliente", "cliente", "NombreCliente", "nombreCliente"),
    tipoTrabajo: getRecordString(row, "Tipo_Trabajo", "tipo_Trabajo", "TipoTrabajo", "tipoTrabajo"),
    siteNombre: getRecordString(row, "Site", "site", "SiteNombre", "siteNombre", "NombreSite", "nombreSite"),
    ot: getRecordString(row, "Ot", "ot", "OT"),
    tipoCambio: getRecordNumber(row, "TipoCambio", "tipoCambio") ?? undefined,
    idUsuarioFactura: getRecordNumber(row, "IdUsuarioFactura", "idUsuarioFactura"),
    estado: getRecordNumber(row, "Estado", "estado") ?? 0,
  };
}

function mapGastoDtoToView(item: GastoDto): GastoForm {
  const cuentaParts = extractCuentaResumenParts(item.cuenta);
  const facturaFields = resolveFacturaFields(item);
  //console.log("estado raw:", item.estado, typeof item.estado);

  return {
    id: item.id,
    idSuministroProvisional:
      item.idSuministroProvisional != null ? String(item.idSuministroProvisional) : "",
    fechaInicioSuministroProvisional: item.fechaInicioSuministroProvisional ?? "",
    filtroOperativo: {
      filtro: {
        filtroKey: item.filtroOperativoKey,
        idCliente: toNumberOrZero(item.idCliente),
        idProyecto: toNumberOrZero(item.idProyecto),
        idSite: item.idSite ?? "",
        correlativo: toNumberOrZero(item.correSite),
        nroInterno: 0,
        nombreCliente: item.clienteNombre ?? "",
        nombreProyecto: item.nombreProyecto ?? "",
        nombreSite: item.siteNombre ?? "",
        tipoTrabajo: item.tipoTrabajo ?? "",
        ot: item.ot ?? "",
        fecAsignacion: null,
      },
      tipoTrabajo: item.tipoTrabajo ? { tipoTrabajo: item.tipoTrabajo } : undefined,
      ot: item.ot ? { ot: item.ot, fecAsignacion: null } : undefined,
      tarea: item.idTarea ? { correlativo: item.idTarea, tarea: item.tareaLabel ?? "" } : undefined,
    } as FiltroOperativoValue,
    responsable: item.responsable,
    responsableLabel: item.responsableLabel || item.responsable,
    idBancoCta: item.idBancoCta != null ? String(item.idBancoCta) : "",
    cuenta: item.cuenta,
    cuentaNumero: item.cuentaNumero || cuentaParts.cuentaNumero,
    cuentaInter: item.cuentaInter || cuentaParts.cuentaInter,
    nombreCta: item.nombreCta || cuentaParts.nombreCta,
    ruc: item.ruc || cuentaParts.ruc,
    rendicion: Number(item.idRendicion ?? 0) === 1,
    tipoPago: item.tipoPago || item.tipoPagoLabel || "",
    monto: item.monto?.toString() ?? "",
    detalle: item.detalle,
    comentario: item.comentario ?? (item as any).observacion ?? "",
    fechaVencimiento: normalizeDateForInput(item.fechaVencimiento),
    fechaEmision: normalizeDateForInput(item.fechaEmision),
    solicitante: item.solicitante || item.solicitanteLabel || "",
    solicitanteLabel: item.solicitanteLabel || "",
    gestor: item.gestor || item.gestorLabel || "",
    gestorLabel: item.gestorLabel || "",
    validador: item.validador || item.validadorLabel || "",
    validadorLabel: item.validadorLabel || "",
    moneda: item.moneda || item.monedaLabel || "",
    monedaLabel: item.monedaLabel || item.moneda || "",
    bien: item.bien || item.bienLabel || "",
    bienLabel: item.bienLabel || item.bien || "",
    comprobante: item.comprobante || item.comprobanteLabel || "",
    comprobanteLabel: item.comprobanteLabel || item.comprobante || "",
    serie: item.serie || "",
    facturaUrl: facturaFields.facturaUrl,
    facturaPath: facturaFields.facturaPath,
    rutaFactura: item.rutaFactura || "",
    rutaFacturaOriginal: item.rutaFacturaOriginal || "",
    rutaFacturaUrl: item.rutaFacturaUrl || "",
    rutaFacturaEnviada: item.rutaFacturaEnviada || "",
    estado: item.estado ?? 0,
    };
}

const formularioInicial: GastoForm = {
  id: null,
  idSuministroProvisional: "",
  fechaInicioSuministroProvisional: "",
  filtroOperativo: {},
  responsable: "",
  responsableLabel: "",
  idBancoCta: "",
  cuenta: "",
  cuentaNumero: "",
  cuentaInter: "",
  nombreCta: "",
  ruc: "",
  rendicion: false,
  tipoPago: "",
  monto: "",
  detalle: "",
  comentario: "",
  fechaVencimiento: "",
  fechaEmision: "",
  solicitante: "",
  solicitanteLabel: "",
  gestor: "",
  gestorLabel: "",
  validador: "",
  validadorLabel: "",
  moneda: "",
  monedaLabel: "",
  bien: "",
  bienLabel: "",
  comprobante: "",
  comprobanteLabel: "",
  serie: "",
  facturaUrl: "",
  facturaPath: "",
  estado: 0,
};

export default function GastosPage() {
  // Estado para fila seleccionada
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  // Estado para filtro de búsqueda por columna (para el dropdown de filtro tipo Excel)
  const [filtroBusquedaPorColumna, setFiltroBusquedaPorColumna] = useState<Record<string, string>>({});
    // Estado para ordenamiento
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const [showFacturaViewer, setShowFacturaViewer] = useState(false);
  const [valoresGasto, setValoresGasto] = useState<ValoresGastoResponse>(VALORES_GASTO_INICIALES);
  const [valoresGastoLoading, setValoresGastoLoading] = useState(false);
  const valoresGastoRequestRef = useRef(0);
  const [showPorcentajePopup, setShowPorcentajePopup] = useState(false);
  const porcentajeRef = useRef<HTMLSpanElement | null>(null);
  const sidePanelRef = useRef<HTMLDivElement | null>(null);
  const ultimoSuministroVigenteLookupKeyRef = useRef("");
  const preservarSuministroEdicionRef = useRef(false);
  const authUser = getAuthUser();
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [empleados, setEmpleados] = useState<EmpleadoCta[]>([]);
  const [empleadosLoading, setEmpleadosLoading] = useState(false);
  const [empleadosError, setEmpleadosError] = useState<string | null>(null);
  const [tareasCatalogo, setTareasCatalogo] = useState<TareaOption[]>([]);
  const [tareasCatalogoError, setTareasCatalogoError] = useState<string | null>(null);
  const [suministrosVigentes, setSuministrosVigentes] = useState<SuministroProvisionalVigenteOption[]>([]);
  const [suministrosVigentesLoading, setSuministrosVigentesLoading] = useState(false);
  const [suministrosVigentesError, setSuministrosVigentesError] = useState<string | null>(null);
  const [solicitanteOptions, setSolicitanteOptions] = useState<ConstanteOption[]>([]);
  const [solicitanteLoading, setSolicitanteLoading] = useState(false);
  const [solicitanteError, setSolicitanteError] = useState<string | null>(null);
  const [solicitanteInput, setSolicitanteInput] = useState("");
  const [showSolicitanteDropdown, setShowSolicitanteDropdown] = useState(false);
  const [highlightedSolicitanteIdx, setHighlightedSolicitanteIdx] = useState(-1);
  const [gestorOptions, setGestorOptions] = useState<ConstanteOption[]>([]);
  const [gestorLoading, setGestorLoading] = useState(false);
  const [gestorError, setGestorError] = useState<string | null>(null);
  const [gestorInput, setGestorInput] = useState("");
  const [showGestorDropdown, setShowGestorDropdown] = useState(false);
  const [highlightedGestorIdx, setHighlightedGestorIdx] = useState(-1);
  const [validadorOptions, setValidadorOptions] = useState<ConstanteOption[]>([]);
  const [validadorLoading, setValidadorLoading] = useState(false);
  const [validadorError, setValidadorError] = useState<string | null>(null);
  const [validadorInput, setValidadorInput] = useState("");
  const [showValidadorDropdown, setShowValidadorDropdown] = useState(false);
  const [highlightedValidadorIdx, setHighlightedValidadorIdx] = useState(-1);
  const [responsableInput, setResponsableInput] = useState("");
  const [showResponsableDropdown, setShowResponsableDropdown] = useState(false);
  const [highlightedResponsableIdx, setHighlightedResponsableIdx] = useState(-1);
  const [usarFechaEmision, setUsarFechaEmision] = useState(true);
  const [usarFechaVencimiento, setUsarFechaVencimiento] = useState(false);
  const [tipoCambio, setTipoCambio] = useState("3.80");
  const [showFacturaSourceMenu, setShowFacturaSourceMenu] = useState(false);
  const [facturaUploadLoading, setFacturaUploadLoading] = useState(false);
  const [facturaUploadError, setFacturaUploadError] = useState<string | null>(null);
  const [mostrarConfirmacionRechazo, setMostrarConfirmacionRechazo] = useState(false);
  const [mostrarMotivoRechazo, setMostrarMotivoRechazo] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [rechazando, setRechazando] = useState(false);
  const [rechazoError, setRechazoError] = useState<string | null>(null);
  const archivoFacturaInputRef = useRef<HTMLInputElement | null>(null);
  const camaraFacturaInputRef = useRef<HTMLInputElement | null>(null);

  const fechaActual = obtenerFechaActual();
  const idCargo = toPositiveNumber(authUser?.idCargo, authUser?.idrol);
  const idEmpleado = toPositiveNumber(authUser?.idEmpleado, authUser?.codEmp);
  const idUsuarioFactura = getNumericUserId(
    String(authUser?.codEmp ?? authUser?.idEmpleado ?? authUser?.empleado ?? "")
  );
  const camposConstantes = useMemo(
    () => ["tipo_bien", "tipo_comprobante", "tipo_pago", "tipo_moneda"],
    []
  );
  const {
    constantesPorCampo,
    loading: constantesLoading,
    error: constantesError,
  } = useConstantesPorCampo(camposConstantes);

  const tipoPagoOptions = constantesPorCampo.tipo_pago ?? [];
  const monedaOptions = constantesPorCampo.tipo_moneda ?? [];
  const bienOptions = constantesPorCampo.tipo_bien ?? [];
  const comprobanteOptions = constantesPorCampo.tipo_comprobante ?? [];

  // Utilidad para formatear fecha a MM/DD/YYYY en zona horaria de Perú (UTC-5)
  function formatDateToMMDDYYYYPeru(dateStr?: string) {
    if (!dateStr) return undefined;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return undefined;
    // Convertir a UTC-5 (hora de Perú)
    // Obtener los componentes de la fecha en UTC-5
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    // UTC-5 son -5 horas respecto a UTC
    const peruOffsetMs = -5 * 60 * 60 * 1000;
    const peruDate = new Date(utc + peruOffsetMs);
    const mm = String(peruDate.getMonth() + 1).padStart(2, '0');
    const dd = String(peruDate.getDate()).padStart(2, '0');
    const yyyy = peruDate.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  const buildGastoPayload = (form: GastoForm): GastoPayload => {
    const filtro = form.filtroOperativo.filtro;
    const tipoTrabajo = form.filtroOperativo.tipoTrabajo?.tipoTrabajo?.trim() ?? "";
    const ot = form.filtroOperativo.ot?.ot?.trim() ?? "";
    const tipoCambioValue = Number(tipoCambio);

    const payload: GastoPayload = {
      idSuministroProvisional: form.idSuministroProvisional
        ? Number(form.idSuministroProvisional)
        : undefined,
      filtroOperativoKey: form.filtroOperativo.filtro?.filtroKey || "",
      responsable: form.responsable,
      idBancoCta: form.idBancoCta ? Number(form.idBancoCta) : undefined,
      idProyecto: toNumberOrZero(filtro?.idProyecto) || undefined,
      idSite: String(filtro?.idSite ?? "").trim() || undefined,
      correSite: toNumberOrZero(filtro?.correlativo) || undefined,
      idTarea: form.filtroOperativo.tarea?.correlativo || undefined,
      idCliente: toNumberOrZero(filtro?.idCliente) || undefined,
      cuenta: form.cuenta,
      cuentaNumero: form.cuentaNumero || undefined,
      cuentaInter: form.cuentaInter || undefined,
      nombreCta: form.nombreCta || undefined,
      ruc: form.ruc || undefined,
      tipoPago: normalizeConstanteValue(tipoPagoOptions, form.tipoPago),
      tipoPagoLabel: getConstanteLabel(tipoPagoOptions, form.tipoPago) || undefined,
      monto: Number(form.monto),
      subtotal: subtotalAmount,
      total: totalAmount,
      igv: igvAmount,
      idRendicion: form.rendicion ? 1 : 0,
      detalle: form.detalle,
      comentario: form.comentario,
      fechaVencimiento: formatDateToMMDDYYYYPeru(form.fechaVencimiento),
      fechaEmision: formatDateToMMDDYYYYPeru(form.fechaEmision),
      solicitante: normalizeConstanteValue(solicitanteOptions, form.solicitante) || undefined,
      solicitanteLabel:
        getConstanteLabelOrFallback(solicitanteOptions, form.solicitante, form.solicitanteLabel) ||
        undefined,
      gestor: normalizeConstanteValue(gestorOptions, form.gestor) || undefined,
      gestorLabel: getConstanteLabel(gestorOptions, form.gestor) || undefined,
      validador: normalizeConstanteValue(validadorOptions, form.validador) || undefined,
      validadorLabel:
        getConstanteLabelOrFallback(validadorOptions, form.validador, form.validadorLabel) ||
        undefined,
      moneda: normalizeConstanteValue(monedaOptions, form.moneda) || undefined,
      monedaLabel: getConstanteLabel(monedaOptions, form.moneda) || undefined,
      bien: normalizeConstanteValue(bienOptions, form.bien) || undefined,
      bienLabel: getConstanteLabel(bienOptions, form.bien) || undefined,
      comprobante: normalizeConstanteValue(comprobanteOptions, form.comprobante) || undefined,
      comprobanteLabel: getConstanteLabel(comprobanteOptions, form.comprobante) || undefined,
      serie: form.serie || undefined,
      facturaUrl: form.facturaUrl || undefined,
      facturaPath: form.facturaPath || undefined,
      tipoTrabajo: tipoTrabajo || undefined,
      siteNombre: filtro?.nombreSite?.trim() || undefined,
      usuario: authUser?.usuario?.trim() || undefined,
      ot: ot || undefined,
      tipoCambio:
        Number.isFinite(tipoCambioValue) && tipoCambioValue > 0
          ? tipoCambioValue
          : TIPO_CAMBIO_GASTO,
      idUsuarioFactura,
      imgFactura: form.facturaUrl || undefined,
    };

    //console.log("[Gastos] Parámetros enviados a Guardar/Planilla", payload);

    return payload;
  };

  const gastosApi = {
    list: async () => {
      // Enviar el parámetro @Estados = '0,2' al endpoint
      const response = await consultarPlanillaEstados(
        buildPlanillaConsultaEstadosRequest([
          {
            nombre: "Estados",
            valor: "0,2",
            tipo: "string",
          },
        ])
      );

      return extraerArray<Record<string, unknown>>(response.rows).map((row, index) =>
        mapGastoDtoToView(mapPlanillaConsultaRowToGastoDto(row, index))
      );
    },

    create: async (form: GastoForm) => {
      const payload = buildGastoPayload(form);

      const response = await httpClient.post<GastoDto>(GASTOS_API_URL, payload);
      const data = extraerObjeto<GastoDto>(response);
      return mapGastoDtoToView(data);
    },

    update: async (id: number, form: GastoForm) => {
      const payload = buildGastoPayload(form);

      const response = await httpClient.put<GastoDto>(`${GASTOS_API_URL}/${id}`, payload);
      const data = extraerObjeto<GastoDto>(response);
      return mapGastoDtoToView(data);
    },

    remove: async (id: number) => {
      await httpClient.delete(`${GASTOS_API_URL}/${id}`);
    },
  };

  const {
    items: gastos,
    form,
    setForm,
    loading: cargando,
    saving: guardando,
    error: errorGuardado,
    panelOpen: panelAbierto,
    setPanelOpen: setPanelAbierto,
    mode: modo,
    setMode: setModo,
    idToDelete: idEliminar,
    setIdToDelete: setIdEliminar,
    handleSave,
    load: cargarGastos,
  } = useCrudForm<GastoForm, GastoForm>(gastosApi, formularioInicial);

  // Determinar color del porcentaje
  const porcentajeValue = Number(valoresGasto?.porcentaje ?? 0);
  let porcentajeColor = "#0F172A";
  if (porcentajeValue <= 0 && Number(valoresGasto?.pagado ?? 0) > 0) {
    porcentajeColor = "#DC2626"; // rojo si porcentaje <= 0 y pagado > 0
  } else if (porcentajeValue > 95) {
    porcentajeColor = "#DC2626"; // rojo
  } else if (porcentajeValue > 75) {
    porcentajeColor = "#EA580C"; // naranja
  } else if (porcentajeValue > 65) {
    porcentajeColor = "#FACC15"; // amarillo
  }

  // Eliminado: Mensaje de utilidad tipo popup
  const porcentajeValores = useMemo(
    () => [
      { label: "Monto OC", value: formatDecimalValue(valoresGasto.aprobado) },
      { label: "Pagado", value: formatDecimalValue(valoresGasto.pagado) },
      { label: "Saldo", value: formatDecimalValue(valoresGasto.saldo2) }, // antes Pendiente
      { label: "Solicitado", value: formatDecimalValue(valoresGasto.adelantado) },
      { label: "Pendiente", value: formatDecimalValue(valoresGasto.saldo) }, // antes Saldo
    ],
    [valoresGasto]
  );

  // Detectar si la moneda seleccionada es SOLES
  const monedaSeleccionada = findConstanteOption(monedaOptions, form.moneda);
  const esSoles = monedaSeleccionada && (monedaSeleccionada.label?.toUpperCase() === "SOLES" || monedaSeleccionada.value === "SOLES" || monedaSeleccionada.codigo === "SOLES");

  useEffect(() => {
    setEmpleadosLoading(true);
    setEmpleadosError(null);

    listarEmpleadosCta()
      .then((data) => {
        setEmpleados(Array.isArray(data) ? data : []);
      })
      .catch(() => setEmpleadosError("Error al cargar responsables"))
      .finally(() => setEmpleadosLoading(false));
  }, []);

  useEffect(() => {
    let activo = true;

    setSolicitanteLoading(true);
    setSolicitanteError(null);

    listarSolicitanteOptions({
      idCargo: idCargo > 0 ? idCargo : null,
      idEmpleado: idEmpleado > 0 ? idEmpleado : null,
    })
      .then((data) => {
        if (!activo) return;
        setSolicitanteOptions(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!activo) return;
        setSolicitanteError("Error al cargar solicitantes");
        setSolicitanteOptions([]);
      })
      .finally(() => {
        if (!activo) return;
        setSolicitanteLoading(false);
      });

    return () => {
      activo = false;
    };
  }, [idCargo, idEmpleado]);

  useEffect(() => {
    let activo = true;

    setGestorLoading(true);
    setGestorError(null);

    listarGestorOptions()
      .then((data) => {
        if (!activo) return;
        setGestorOptions(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!activo) return;
        setGestorError("Error al cargar gestores");
        setGestorOptions([]);
      })
      .finally(() => {
        if (!activo) return;
        setGestorLoading(false);
      });

    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    let activo = true;

    setValidadorLoading(true);
    setValidadorError(null);

    listarValidadorOptions()
      .then((data) => {
        if (!activo) return;
        setValidadorOptions(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!activo) return;
        setValidadorError("Error al cargar validadores");
        setValidadorOptions([]);
      })
      .finally(() => {
        if (!activo) return;
        setValidadorLoading(false);
      });

    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    let activo = true;

    setTareasCatalogoError(null);

    getTareas()
      .then((data) => {
        if (!activo) return;
        setTareasCatalogo(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!activo) return;
        setTareasCatalogo([]);
        setTareasCatalogoError("Error al cargar tareas.");
      });

    return () => {
      activo = false;
    };
  }, []);

  const empleadosSafe = Array.isArray(empleados) ? empleados : [];
  const gastosSafe = Array.isArray(gastos) ? gastos : [];

  const filteredResponsables =
    responsableInput.trim() === ""
      ? empleadosSafe
      : empleadosSafe.filter((emp) =>
          emp.nombreEmpleado.toLowerCase().includes(responsableInput.toLowerCase())
        );

  const filteredSolicitantes =
    solicitanteInput.trim() === ""
      ? solicitanteOptions
      : solicitanteOptions.filter((option) => matchesFlexibleSearch(option.label, solicitanteInput));

  const filteredGestores =
    gestorInput.trim() === ""
      ? gestorOptions
      : gestorOptions.filter((option) => matchesFlexibleSearch(option.label, gestorInput));

  const filteredValidadores =
    validadorInput.trim() === ""
      ? validadorOptions
      : validadorOptions.filter((option) => matchesFlexibleSearch(option.label, validadorInput));

  const valoresGastoRequestKey = useMemo(() => {
    const request = buildValoresGastoRequest(form.filtroOperativo);

    if (!request) {
      return "";
    }

    return JSON.stringify(request);
  }, [form.filtroOperativo]);

  const suministroVigenteLookupKey = useMemo(
    () =>
      JSON.stringify({
        filtroKey: form.filtroOperativo.filtro?.filtroKey ?? "",
        idCliente: form.filtroOperativo.filtro?.idCliente ?? 0,
        idProyecto: form.filtroOperativo.filtro?.idProyecto ?? 0,
        idSite: form.filtroOperativo.filtro?.idSite ?? "",
        correlativo: form.filtroOperativo.filtro?.correlativo ?? 0,
        tipoTrabajo: form.filtroOperativo.tipoTrabajo?.tipoTrabajo ?? "",
        ot: form.filtroOperativo.ot?.ot ?? "",
        idTarea: form.filtroOperativo.tarea?.correlativo ?? 0,
      }),
    [form.filtroOperativo]
  );

  useEffect(() => {
    const label = getConstanteLabelOrFallback(
      solicitanteOptions,
      form.solicitante,
      form.solicitanteLabel
    );
    setSolicitanteInput(label);
  }, [form.solicitante, form.solicitanteLabel, solicitanteOptions]);

  useEffect(() => {
    const label = getConstanteLabelOrFallback(
      validadorOptions,
      form.validador,
      form.validadorLabel
    );
    setValidadorInput(label);
  }, [form.validador, form.validadorLabel, validadorOptions]);

  useEffect(() => {
    const correlativo = form.filtroOperativo.tarea?.correlativo;

    if (correlativo == null || tareasCatalogo.length === 0) {
      return;
    }

    const tareaLabel = getTareaLabelOrFallback(
      tareasCatalogo,
      correlativo,
      form.filtroOperativo.tarea?.tarea
    );

    if (!tareaLabel || form.filtroOperativo.tarea?.tarea === tareaLabel) {
      return;
    }

    setForm((prev) => {
      if (prev.filtroOperativo.tarea?.correlativo !== correlativo || !prev.filtroOperativo.tarea) {
        return prev;
      }

      return {
        ...prev,
        filtroOperativo: {
          ...prev.filtroOperativo,
          tarea: {
            ...prev.filtroOperativo.tarea,
            tarea: tareaLabel,
          },
        },
      };
    });
  }, [form.filtroOperativo.tarea?.correlativo, form.filtroOperativo.tarea?.tarea, tareasCatalogo]);

  useEffect(() => {
    if (!panelAbierto || modo !== "editar" || !valoresGastoRequestKey) {
      return;
    }

    void cargarValoresGasto(form.filtroOperativo);
  }, [panelAbierto, modo, valoresGastoRequestKey]);

  useEffect(() => {
    if (!panelAbierto) {
      ultimoSuministroVigenteLookupKeyRef.current = "";
      preservarSuministroEdicionRef.current = false;
      setSuministrosVigentes([]);
      setSuministrosVigentesLoading(false);
      setSuministrosVigentesError(null);
      return;
    }

    const filtro = form.filtroOperativo.filtro;
    const idCliente = toNumberOrZero(filtro?.idCliente);
    const idProyecto = toNumberOrZero(filtro?.idProyecto);
    const idSite = String(filtro?.idSite ?? "").trim();
    const correSite = toNumberOrZero(filtro?.correlativo);
    const tipoTrabajo = form.filtroOperativo.tipoTrabajo?.tipoTrabajo?.trim() ?? "";
    const idTarea = toNumberOrZero(form.filtroOperativo.tarea?.correlativo);
    const requiereCombo = requiereSuministroVigente(idTarea);
    const conservarSeleccionActual =
      (modo === "editar" || preservarSuministroEdicionRef.current) &&
      Boolean(form.idSuministroProvisional?.trim()) &&
      suministrosVigentes.some(
        (item) => String(item.idProvisional) === form.idSuministroProvisional.trim()
      );

    if (!requiereCombo || idCliente <= 0 || idProyecto <= 0 || !idSite || correSite <= 0 || !tipoTrabajo) {
      if (!conservarSeleccionActual) {
        ultimoSuministroVigenteLookupKeyRef.current = "";
        setSuministrosVigentes([]);
      }
      setSuministrosVigentesLoading(false);
      setSuministrosVigentesError(null);
      if (!conservarSeleccionActual) {
        setForm((prev) => (prev.idSuministroProvisional ? { ...prev, idSuministroProvisional: "" } : prev));
      }
      return;
    }

    const lookupCambioReal =
      ultimoSuministroVigenteLookupKeyRef.current !== "" &&
      ultimoSuministroVigenteLookupKeyRef.current !== suministroVigenteLookupKey;
    ultimoSuministroVigenteLookupKeyRef.current = suministroVigenteLookupKey;

    let activo = true;
    setSuministrosVigentesLoading(true);
    setSuministrosVigentesError(null);
    if (lookupCambioReal) {
      setForm((prev) => (prev.idSuministroProvisional ? { ...prev, idSuministroProvisional: "" } : prev));
    }

    httpClient
      .get<SuministroProvisionalVigenteOption[]>(`${GASTOS_API_URL}/suministros-vigentes`, {
        params: {
          idCliente,
          idProyecto,
          idSite,
          correSite,
          tipoTrabajo,
        },
      })
      .then((data) => {
        if (!activo) {
          return;
        }

        const items = Array.isArray(data) ? data : [];
        const valorActual = form.idSuministroProvisional?.trim();
        const fallbackActual =
          (modo === "editar" || preservarSuministroEdicionRef.current) && valorActual
            ? {
                idProvisional: Number(valorActual),
                fechaInicio: form.fechaInicioSuministroProvisional || undefined,
              }
            : null;

        const itemsNormalizados =
          fallbackActual &&
          Number.isFinite(fallbackActual.idProvisional) &&
          !items.some((item) => String(item.idProvisional) === String(fallbackActual.idProvisional))
            ? [fallbackActual, ...items]
            : items;

        setSuministrosVigentes(itemsNormalizados);
        preservarSuministroEdicionRef.current = false;
        setForm((prev) => {
          if (!prev.idSuministroProvisional) {
            return prev;
          }

          const existeSeleccion = itemsNormalizados.some(
            (item) => String(item.idProvisional) === prev.idSuministroProvisional
          );

          return existeSeleccion ? prev : { ...prev, idSuministroProvisional: "" };
        });
      })
      .catch(() => {
        if (!activo) {
          return;
        }

        setSuministrosVigentes([]);
        setSuministrosVigentesError("No se pudo cargar el suministro provisional vigente.");
      })
      .finally(() => {
        if (!activo) {
          return;
        }

        setSuministrosVigentesLoading(false);
      });

    return () => {
      activo = false;
    };
  }, [
    panelAbierto,
    suministroVigenteLookupKey,
    setForm,
  ]);

  const cargarValoresGasto = async (filtroOperativo: FiltroOperativoValue) => {
    const request = buildValoresGastoRequest(filtroOperativo);

    if (!request) {
      //console.log("[Gastos] No se ejecuta sp_Finanzas_CargarValoresGasto porque faltan parámetros válidos.", {
      //  filtroOperativo,
      //});
      valoresGastoRequestRef.current += 1;
      setValoresGastoLoading(false);
      setValoresGasto(VALORES_GASTO_INICIALES);
      return;
    }

    //console.log("[Gastos] Parámetros enviados a sp_Finanzas_CargarValoresGasto", request);

    const currentRequestId = valoresGastoRequestRef.current + 1;
    valoresGastoRequestRef.current = currentRequestId;
    setValoresGastoLoading(true);

    try {
      const response = await getValoresGasto(request);
      //console.log("[Gastos] Respuesta de valores de gasto", response);

      if (valoresGastoRequestRef.current !== currentRequestId) {
        return;
      }

      setValoresGasto({
        porcentaje: toNumberOrZero(response.porcentaje),
        aprobado: toNumberOrZero(response.aprobado),
        pagado: toNumberOrZero(response.pagado),
        adelantado: toNumberOrZero(response.adelantado),
        saldo2: toNumberOrZero(response.saldo2),
        saldo: toNumberOrZero(response.saldo),
      });
    } catch {
      //console.error("[Gastos] Error al consultar sp_Finanzas_CargarValoresGasto", request);
      if (valoresGastoRequestRef.current !== currentRequestId) {
        return;
      }

      setValoresGasto(VALORES_GASTO_INICIALES);
    } finally {
      if (valoresGastoRequestRef.current === currentRequestId) {
        setValoresGastoLoading(false);
      }
    }
  };

  const subtotal = Number(form.monto);
  const hasSubtotal = form.monto.trim() !== "" && Number.isFinite(subtotal);
  const subtotalAmount = hasSubtotal ? subtotal : 0;
  const aplicaIgv = isFacturaComprobante(comprobanteOptions, form.comprobante);
  const igvAmount = roundToTwoDecimals(aplicaIgv ? subtotalAmount * IGV_RATE : 0);
  const totalAmount = roundToTwoDecimals(subtotalAmount + igvAmount);
  // Lógica para anteponer la URL de SharePoint solo al editar
  const SHAREPOINT_URL = "https://cjtelecom.sharepoint.com/sites/CJ-PROYECTOS/";
  const facturaDisplayPath =
    modo === "editar" && form.facturaPath && !form.facturaPath.startsWith("http")
      ? SHAREPOINT_URL + form.facturaPath.replace(/^\/+/, "")
      : getFacturaDisplayPath(form.facturaPath, form.facturaUrl);

  const subirFactura = async (file: File) => {
    const formData = new FormData();
    formData.append("archivo", file);

    if (form.id) {
      formData.append("gastoId", String(form.id));
    }

    if (form.filtroOperativo.filtro?.filtroKey) {
      formData.append("filtroOperativoKey", form.filtroOperativo.filtro.filtroKey);
    }

    if (form.serie) {
      formData.append("serie", form.serie);
    }

    if (form.responsable) {
      formData.append("responsable", form.responsable);
    }

    return httpClient.post<FacturaUploadResponse>(FACTURA_UPLOAD_API_URL, formData);
  };

  const procesarFacturaSeleccionada = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setShowFacturaSourceMenu(false);

    if (!file) {
      return;
    }

    setFacturaUploadLoading(true);
    setFacturaUploadError(null);

    try {
      const optimizedFile = await compressImageForUpload(file);
      const response = await subirFactura(optimizedFile);
      setForm((prev) => ({
        ...prev,
        facturaUrl: response.fileUrl || "",
        facturaPath: response.storagePath || response.fileUrl || "",
      }));
    } catch (error) {
      const errorMessage =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { message?: string } } }).response?.data?.message ===
          "string"
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      setFacturaUploadError(errorMessage || "No se pudo cargar la factura en SharePoint.");
    } finally {
      setFacturaUploadLoading(false);
    }
  };

  const abrirNuevo = () => {
    setModo("nuevo");
    valoresGastoRequestRef.current += 1;
    setValoresGastoLoading(false);
    setValoresGasto(VALORES_GASTO_INICIALES);
    setForm({
      ...formularioInicial,
      fechaEmision: fechaActual,
      fechaVencimiento: "",
    });
    setUsarFechaEmision(true);
    setUsarFechaVencimiento(false);
    setGestorInput("");
    setShowGestorDropdown(false);
    setHighlightedGestorIdx(-1);
    setValidadorInput("");
    setShowValidadorDropdown(false);
    setHighlightedValidadorIdx(-1);
    setSolicitanteInput("");
    setShowSolicitanteDropdown(false);
    setHighlightedSolicitanteIdx(-1);
    setResponsableInput("");
    setHighlightedResponsableIdx(-1);
    setShowResponsableDropdown(false);
    setSuministrosVigentes([]);
    setSuministrosVigentesLoading(false);
    setSuministrosVigentesError(null);
    setErrores({});
    setShowFacturaSourceMenu(false);
    setFacturaUploadError(null);
    setPanelAbierto(true);
    // Actualizar valores de gasto (porcentaje, etc.) al crear nuevo
    void cargarValoresGasto(formularioInicial.filtroOperativo);
  };

  const abrirEditar = (gasto: GastoForm) => {
    const tareaCorrelativo = gasto.filtroOperativo.tarea?.correlativo;
    const tareaNombre = getTareaLabelOrFallback(
      tareasCatalogo,
      tareaCorrelativo,
      gasto.filtroOperativo.tarea?.tarea
    );
    const facturaEditFields = resolveFacturaFields({
      facturaUrl: gasto.facturaUrl,
      facturaPath: gasto.facturaPath,
      rutaFactura: gasto.rutaFactura,
      rutaFacturaOriginal: gasto.rutaFacturaOriginal,
      rutaFacturaUrl: gasto.rutaFacturaUrl,
      rutaFacturaEnviada: gasto.rutaFacturaEnviada,
    });
    // Copiar todos los campos relevantes, asegurando comentario y rutas de imagen
    const gastoEditable: GastoForm = {
      ...gasto,
      comentario: gasto.comentario ?? "",
      rutaFactura: gasto.rutaFactura ?? "",
      rutaFacturaOriginal: gasto.rutaFacturaOriginal ?? "",
      rutaFacturaUrl: gasto.rutaFacturaUrl ?? "",
      rutaFacturaEnviada: gasto.rutaFacturaEnviada ?? "",
      filtroOperativo: {
        filtro: gasto.filtroOperativo.filtro ? { ...gasto.filtroOperativo.filtro } : undefined,
        tipoTrabajo: gasto.filtroOperativo.tipoTrabajo ? { ...gasto.filtroOperativo.tipoTrabajo } : undefined,
        ot: gasto.filtroOperativo.ot ? { ...gasto.filtroOperativo.ot } : undefined,
        tarea: gasto.filtroOperativo.tarea
          ? {
              ...gasto.filtroOperativo.tarea,
              tarea: tareaNombre,
            }
          : undefined,
      },
      fechaEmision: normalizeDateForInput(gasto.fechaEmision),
      fechaVencimiento: normalizeDateForInput(gasto.fechaVencimiento),
      facturaUrl: facturaEditFields.facturaUrl,
      facturaPath: facturaEditFields.facturaPath,
    };

    setModo("editar");
    preservarSuministroEdicionRef.current = Boolean(gastoEditable.idSuministroProvisional);
    valoresGastoRequestRef.current += 1;
    setValoresGastoLoading(false);
    setValoresGasto(VALORES_GASTO_INICIALES);
    setSuministrosVigentes(
      gastoEditable.idSuministroProvisional
        ? [
            {
              idProvisional: Number(gastoEditable.idSuministroProvisional),
              fechaInicio: gastoEditable.fechaInicioSuministroProvisional || undefined,
            },
          ]
        : []
    );
    setForm(gastoEditable);
    setUsarFechaEmision(Boolean(gastoEditable.fechaEmision));
    setUsarFechaVencimiento(Boolean(gastoEditable.fechaVencimiento));
    setGestorInput(getConstanteLabel(gestorOptions, gastoEditable.gestor));
    setShowGestorDropdown(false);
    setHighlightedGestorIdx(-1);
    setValidadorInput(
      getConstanteLabelOrFallback(
        validadorOptions,
        gastoEditable.validador,
        gastoEditable.validadorLabel
      )
    );
    setShowValidadorDropdown(false);
    setHighlightedValidadorIdx(-1);
    setSolicitanteInput(
      getConstanteLabelOrFallback(
        solicitanteOptions,
        gastoEditable.solicitante,
        gastoEditable.solicitanteLabel
      )
    );
    setShowSolicitanteDropdown(false);
    setHighlightedSolicitanteIdx(-1);
    const empleadoResponsable = empleadosSafe.find(
      (emp) => String(emp.idEmpleado) === gastoEditable.responsable
    );
    const responsableNombre =
      empleadoResponsable?.nombreEmpleado || gastoEditable.responsableLabel || "";

    if (empleadoResponsable && !gastoEditable.cuenta) {
      const cuentaMetadata = buildCuentaMetadata(empleadoResponsable);
      gastoEditable.idBancoCta =
        empleadoResponsable.idBancoCta != null ? String(empleadoResponsable.idBancoCta) : gastoEditable.idBancoCta;
      gastoEditable.cuenta = buildCuentaResumen(empleadoResponsable);
      gastoEditable.cuentaNumero = cuentaMetadata.cuentaNumero;
      gastoEditable.cuentaInter = cuentaMetadata.cuentaInter;
      gastoEditable.nombreCta = cuentaMetadata.nombreCta;
      gastoEditable.ruc = gastoEditable.ruc || cuentaMetadata.ruc;
    }

    setResponsableInput(responsableNombre);
    setHighlightedResponsableIdx(-1);
    setShowResponsableDropdown(false);
    setErrores({});
    setShowFacturaSourceMenu(false);
    setFacturaUploadError(null);
    setPanelAbierto(true);
    // Actualizar valores de gasto (porcentaje, etc.) al editar
    void cargarValoresGasto(gastoEditable.filtroOperativo);
  };

  const cerrarPanel = () => {
    setPanelAbierto(false);
    valoresGastoRequestRef.current += 1;
    setValoresGastoLoading(false);
    setValoresGasto(VALORES_GASTO_INICIALES);
    setForm(formularioInicial);
    setUsarFechaEmision(true);
    setUsarFechaVencimiento(false);
    setGestorInput("");
    setShowGestorDropdown(false);
    setHighlightedGestorIdx(-1);
    setValidadorInput("");
    setShowValidadorDropdown(false);
    setHighlightedValidadorIdx(-1);
    setSolicitanteInput("");
    setShowSolicitanteDropdown(false);
    setHighlightedSolicitanteIdx(-1);
    setResponsableInput("");
    setHighlightedResponsableIdx(-1);
    setShowResponsableDropdown(false);
    setSuministrosVigentes([]);
    setSuministrosVigentesLoading(false);
    setSuministrosVigentesError(null);
    setErrores({});
    setShowFacturaSourceMenu(false);
    setFacturaUploadError(null);
  };

  const validar = () => {
    const nuevosErrores: Record<string, string> = {};

    if (!form.filtroOperativo.filtro?.filtroKey) {
      nuevosErrores.filtroOperativo = "Seleccione un filtro operativo.";
    }

    if (!form.responsable) {
      nuevosErrores.responsable = "Seleccione un responsable.";
    }

    if (!form.filtroOperativo.tarea?.correlativo) {
      nuevosErrores.tarea = "Seleccione una tarea.";
    }

    if (form.responsable && !form.idBancoCta) {
      nuevosErrores.responsable = "El responsable seleccionado no tiene una cuenta válida.";
    }

    if (!form.tipoPago) {
      nuevosErrores.tipoPago = "Seleccione el tipo de pago.";
    }

    if (!form.monto || isNaN(Number(form.monto))) {
      nuevosErrores.monto = "Ingrese un monto válido.";
    }

    if (form.tipoPago && !esConstanteValida(tipoPagoOptions, form.tipoPago)) {
      nuevosErrores.tipoPago = "Seleccione un tipo de pago valido.";
    }

    if (form.bien && !esConstanteValida(bienOptions, form.bien)) {
      nuevosErrores.bien = "Seleccione un bien valido.";
    }

    if (form.comprobante && !esConstanteValida(comprobanteOptions, form.comprobante)) {
      nuevosErrores.comprobante = "Seleccione un comprobante valido.";
    }

    if (form.moneda && !esConstanteValida(monedaOptions, form.moneda)) {
      nuevosErrores.moneda = "Seleccione una moneda valida.";
    }

    if (form.solicitante && !esConstanteValida(solicitanteOptions, form.solicitante)) {
      nuevosErrores.solicitante = "Seleccione un solicitante valido.";
    }

    if (form.gestor && !esConstanteValida(gestorOptions, form.gestor)) {
      nuevosErrores.gestor = "Seleccione un gestor valido.";
    }

    if (form.validador && !esConstanteValida(validadorOptions, form.validador)) {
      nuevosErrores.validador = "Seleccione un validador valido.";
    }

    setErrores(nuevosErrores);
    return Object.keys(nuevosErrores).length === 0;
  };

  const guardar = async () => {
    if (!validar()) return;

    const guardado = await handleSave();
    if (!guardado) {
      return;
    }

    setPanelAbierto(false);
    setForm(formularioInicial);
    setResponsableInput("");
    setShowFacturaSourceMenu(false);
    setFacturaUploadError(null);
    await cargarGastos();
  };

  const confirmarEliminar = (gasto: GastoForm) => {
    if (selectedRowId !== gasto.id) {
      setRechazoError("Seleccione primero el registro que desea rechazar.");
      return;
    }

    setRechazoError(null);
    setIdEliminar(gasto.id);
    setMostrarConfirmacionRechazo(true);
  };

  const cancelarRechazo = () => {
    setMostrarConfirmacionRechazo(false);
    setMostrarMotivoRechazo(false);
    setMotivoRechazo("");
    setRechazoError(null);
    setIdEliminar(null);
  };

  const abrirPopupMotivoRechazo = () => {
    setMostrarConfirmacionRechazo(false);
    setMostrarMotivoRechazo(true);
    setMotivoRechazo("");
    setRechazoError(null);
  };

  const eliminar = async () => {
    if (idEliminar == null || !gastoSeleccionadoEliminar) return;

    if (!motivoRechazo.trim()) {
      setRechazoError("Debe ingresar el motivo del rechazo.");
      return;
    }

    const idSiteRechazo =
      String(gastoSeleccionadoEliminar.filtroOperativo.filtro?.idSite ?? "").trim() ||
      String(gastoSeleccionadoEliminar.filtroOperativo.filtro?.nombreSite ?? "").trim();

    if (!idSiteRechazo) {
      setRechazoError("No se pudo obtener el IdSite del registro seleccionado.");
      return;
    }

    try {
      setRechazando(true);
      setRechazoError(null);

      await httpClient.post(`${GASTOS_API_URL}/${idEliminar}/rechazar`, {
        idSite: idSiteRechazo,
        observacion: motivoRechazo.trim(),
        idAprobador: idEmpleado > 0 ? idEmpleado : undefined,
      });

      cancelarRechazo();
      setSelectedRowId(null);
      await cargarGastos();
    } catch (error) {
      setRechazoError(getHttpMessage(error, "No se pudo rechazar el registro."));
    } finally {
      setRechazando(false);
    }
  };

  const gastoSeleccionadoEliminar = gastosSafe.find((x) => x.id === idEliminar);


  const [busqueda, setBusqueda] = useState("");
  const [filtrosColumnas, setFiltrosColumnas] = useState<Record<string, string[]>>({});
  const [columnaFiltroAbierta, setColumnaFiltroAbierta] = useState<string | null>(null);
  const filtroColumnaMenuRef = useRef<HTMLDivElement>(null);
  // Solo columnas visibles: id, monto, tipoPago, ot, fechaEmision, fechaVencimiento
  const camposBusquedaGastos = useMemo<CrudToolbarSearchField<GastoForm>[]>(
    () => [
      { key: "id", label: "Id", getValue: (gasto) => gasto.id },
      { key: "cliente", label: "Cliente", getValue: (gasto) => gasto.filtroOperativo.filtro?.nombreCliente ?? "" },
      { key: "nombreProyecto", label: "Proyecto", getValue: (gasto) => gasto.filtroOperativo.filtro?.nombreProyecto ?? "" },
      { key: "site", label: "Site", getValue: (gasto) => gasto.filtroOperativo.filtro?.nombreSite ?? "" },
      { key: "tipoTrabajo", label: "Tipo Trabajo", getValue: (gasto) => gasto.filtroOperativo.filtro?.tipoTrabajo ?? gasto.filtroOperativo.tipoTrabajo?.tipoTrabajo ?? "" },
      { key: "tarea", label: "Tarea", getValue: (gasto) => getTareaLabelOrFallback(tareasCatalogo, gasto.filtroOperativo.tarea?.correlativo, gasto.filtroOperativo.tarea?.tarea) },
      { key: "bien", label: "Bien", getValue: (gasto) => getConstanteLabel(bienOptions, gasto.bien) },
      { key: "comprobante", label: "Comprobante", getValue: (gasto) => getConstanteLabel(comprobanteOptions, gasto.comprobante) },
      { key: "monto", label: "Monto", getValue: (gasto) => gasto.monto },
      { key: "moneda", label: "Moneda", getValue: (gasto) => gasto.monedaLabel || getConstanteLabel(monedaOptions, gasto.moneda) },
      { key: "fechaEmision", label: "Fecha emisión", getValue: (gasto) => gasto.fechaEmision },
      { key: "ot", label: "OT", getValue: (gasto) => gasto.filtroOperativo.ot?.ot },
      { key: "solicitante", label: "Solicitante", getValue: (gasto) => getConstanteLabelOrFallback(solicitanteOptions, gasto.solicitante, gasto.solicitanteLabel) },
      { key: "responsable", label: "Responsable", getValue: (gasto) => gasto.responsableLabel || gasto.responsable },
      { key: "validador", label: "Validador", getValue: (gasto) => getConstanteLabelOrFallback(validadorOptions, gasto.validador, gasto.validadorLabel) },
      { key: "detalle", label: "Detalle", getValue: (gasto) => gasto.detalle },
      { key: "estado", label: "Estado", getValue: (gasto) => gasto.estado  },
    ],
    [bienOptions, comprobanteOptions, monedaOptions, solicitanteOptions, tareasCatalogo, tipoPagoOptions, validadorOptions]
  );
  const getGridColumnValue = React.useCallback(
    (gasto: GastoForm, key: string): string | number => {
      switch (key) {
        case "id":
          return gasto.id ?? "";
        case "cliente":
          return gasto.filtroOperativo.filtro?.nombreCliente ?? "";
        case "nombreProyecto":
          return gasto.filtroOperativo.filtro?.nombreProyecto ?? "";
        case "site":
          return gasto.filtroOperativo.filtro?.nombreSite ?? "";
        case "tipoTrabajo":
          return gasto.filtroOperativo.filtro?.tipoTrabajo ?? gasto.filtroOperativo.tipoTrabajo?.tipoTrabajo ?? "";
        case "tarea":
          return getTareaLabelOrFallback(
            tareasCatalogo,
            gasto.filtroOperativo.tarea?.correlativo,
            gasto.filtroOperativo.tarea?.tarea
          );
        case "bien":
          return getConstanteLabel(bienOptions, gasto.bien);
        case "comprobante":
          return getConstanteLabel(comprobanteOptions, gasto.comprobante);
        case "monto":
          return gasto.monto !== undefined && gasto.monto !== null && gasto.monto !== ""
            ? Number(gasto.monto).toLocaleString("es-PE", { minimumFractionDigits: 2 })
            : "";
        case "moneda":
          return gasto.monedaLabel || getConstanteLabel(monedaOptions, gasto.moneda);
        case "fechaEmision":
          return gasto.fechaEmision
            ? new Date(gasto.fechaEmision).toLocaleDateString("es-PE")
            : "";
        case "ot":
          return gasto.filtroOperativo.ot?.ot ?? "";
        case "solicitante":
          return getConstanteLabelOrFallback(solicitanteOptions, gasto.solicitante, gasto.solicitanteLabel);
        case "responsable":
          return gasto.responsableLabel || gasto.responsable || "";
        case "validador":
          return getConstanteLabelOrFallback(validadorOptions, gasto.validador, gasto.validadorLabel);
        case "detalle":
          return gasto.detalle ? String(gasto.detalle).replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim() : "";
        case "estado":
          return gasto.estado ?? "";
        default:
          return (gasto as unknown as Record<string, unknown>)[key] == null
            ? ""
            : String((gasto as unknown as Record<string, unknown>)[key]);
      }
    },
    [bienOptions, comprobanteOptions, monedaOptions, solicitanteOptions, tareasCatalogo, validadorOptions]
  );
  // Ordenar y luego filtrar gastos: el ordenamiento se aplica a todos los registros cargados
  const gastosFiltrados = useMemo(() => {
    let sorted = [...gastosSafe];
    if (sortConfig) {
      const { key, direction } = sortConfig;
      const col = camposBusquedaGastos.find((c) => c.key === key);
      if (col) {
        sorted.sort((a, b) => {
          let aValue = col.getValue(a);
          let bValue = col.getValue(b);
          // Si es string, comparar insensible a mayúsculas
          if (typeof aValue === 'string' && typeof bValue === 'string') {
            aValue = aValue.toLowerCase();
            bValue = bValue.toLowerCase();
          }
          if (aValue == null) return 1;
          if (bValue == null) return -1;
          if (aValue < bValue) return direction === 'asc' ? -1 : 1;
          if (aValue > bValue) return direction === 'asc' ? 1 : -1;
          return 0;
        });
      }
    }
    // Filtrar después de ordenar
    return sorted
      .filter((gasto) => matchesCrudToolbarSearch(gasto, busqueda, camposBusquedaGastos))
      .filter((gasto) =>
        camposBusquedaGastos.every((campo) =>
          matchesColumnFilterValue(
            getGridColumnValue(gasto, campo.key),
            filtrosColumnas[campo.key] ?? []
          )
        )
      );
  }, [busqueda, camposBusquedaGastos, filtrosColumnas, gastosSafe, getGridColumnValue, sortConfig]);
  const handleFiltroOperativoChange = React.useCallback(
    (val: FiltroOperativoValue) => {
      setForm((prev) =>
        areFiltroOperativoValuesEqual(prev.filtroOperativo, val)
          ? prev
          : { ...prev, filtroOperativo: val }
      );
    },
    [setForm]
  );
  const columnasGridGastos = [
    { key: "id", label: "Id", width: "60px", align: "left" as const },
    { key: "acciones", label: "Acciones", width: "100px", align: "center" as const },
    { key: "cliente", label: "Cliente", width: "90px", align: "left" as const },
    { key: "nombreProyecto", label: "Proyecto", width: "100px", align: "left" as const },
    { key: "site", label: "Site", width: "180px", align: "left" as const },
    { key: "tipoTrabajo", label: "Tipo Trabajo", width: "100px", align: "left" as const },
    { key: "tarea", label: "Tarea", width: "140px", align: "left" as const },
    { key: "bien", label: "Bien", width: "80px", align: "left" as const },
    { key: "comprobante", label: "Comprobante", width: "140px", align: "left" as const },
    { key: "monto", label: "Monto", width: "100px", align: "left" as const },
    { key: "moneda", label: "Moneda", width: "80px", align: "left" as const },
    { key: "fechaEmision", label: "Fecha emisión", width: "130px", align: "left" as const },
    { key: "ot", label: "OT", width: "70px", align: "left" as const },
    { key: "solicitante", label: "Solicitante", width: "160px", align: "left" as const },
    { key: "responsable", label: "Responsable", width: "180px", align: "left" as const },
    { key: "validador", label: "Validador", width: "140px", align: "left" as const },   
    { key: "detalle", label: "Detalle", width: "320px", align: "left" as const },
    { key: "estado", label: "Estado", width: "80px", align: "left" as const },
  ];
  const columnasCongeladasGrid = new Set([
    "id",
    "acciones",
    "cliente",
    "nombreProyecto",
    "site",
    "tipoTrabajo",
  ]);
  const stickyLeftByColumn = useMemo(() => {
    let left = 0;
    const offsets: Record<string, number> = {};

    for (const columna of columnasGridGastos) {
      if (columnasCongeladasGrid.has(columna.key)) {
        offsets[columna.key] = left;
      }

      const width = Number.parseInt(columna.width, 10);
      left += Number.isFinite(width) ? width : 0;
    }

    return offsets;
  }, [columnasGridGastos]);

  const opcionesFiltroPorColumna = useMemo(() => {
    const opciones: Record<string, string[]> = {};

    camposBusquedaGastos.forEach((campo) => {
      const valoresUnicos = Array.from(
        new Set(
          gastosSafe.map((gasto) => normalizeColumnOptionValue(getGridColumnValue(gasto, campo.key)))
        )
      ).sort((left, right) => left.localeCompare(right, "es", { sensitivity: "base" }));

      opciones[campo.key] = valoresUnicos;
    });

    return opciones;
  }, [camposBusquedaGastos, gastosSafe, getGridColumnValue]);

  useEffect(() => {
    if (!columnaFiltroAbierta) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (
        filtroColumnaMenuRef.current &&
        !filtroColumnaMenuRef.current.contains(event.target as Node)
      ) {
        setColumnaFiltroAbierta(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [columnaFiltroAbierta]);

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 5 }}>

      <CrudToolbar
        searchValue={busqueda}
        onSearchChange={setBusqueda}
        searchPlaceholder="Buscar gastos..."
        //searchFieldsHint={camposBusquedaGastos.map((campo) => campo.label).join(", ")}
        buttons={[
          {
            key: "nuevo",
            label: "Nuevo gasto",
            onClick: abrirNuevo,
          },
          {
            key: "exportar",
            label: "Exportar",
            title: "Exportar",
            iconOnly: true,
            icon: "⤓",
            onClick: () => {
              // Exportar a CSV los registros filtrados y columnas visibles
              const headers = columnasGridGastos.filter(c => c.key !== "acciones").map(c => c.label);
              const keys = columnasGridGastos.filter(c => c.key !== "acciones").map(c => c.key);
              const rows = gastosFiltrados.map(gasto =>
                keys.map(key => {
                  switch (key) {
                    case "cliente":
                      return gasto.filtroOperativo.filtro?.nombreCliente ?? "";
                    case "nombreProyecto":
                      return gasto.filtroOperativo.filtro?.nombreProyecto ?? "";
                    case "tipoTrabajo":
                      return gasto.filtroOperativo.filtro?.tipoTrabajo ?? gasto.filtroOperativo.tipoTrabajo?.tipoTrabajo ?? "";
                    case "id":
                      return gasto.id;
                    case "site":
                      return gasto.filtroOperativo.filtro?.nombreSite ?? "";
                    case "solicitante":
                      return getConstanteLabelOrFallback(solicitanteOptions, gasto.solicitante, gasto.solicitanteLabel);
                    case "responsable":
                      return gasto.responsableLabel || gasto.responsable || "";
                    case "validador":
                      return getConstanteLabelOrFallback(validadorOptions, gasto.validador, gasto.validadorLabel);
                    case "tarea":
                      return getTareaLabelOrFallback(tareasCatalogo, gasto.filtroOperativo.tarea?.correlativo, gasto.filtroOperativo.tarea?.tarea);
                    case "detalle":
                      // Migrar el campo Detalle a una sola línea, reemplazando saltos de línea por espacio
                      return gasto.detalle ? String(gasto.detalle).replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim() : "";
                    case "bien":
                      return getConstanteLabel(bienOptions, gasto.bien);
                    case "comprobante":
                      return getConstanteLabel(comprobanteOptions, gasto.comprobante);
                    case "moneda":
                      return getConstanteLabel(monedaOptions, gasto.moneda);
                    case "monto":
                      return gasto.monto !== undefined && gasto.monto !== null && gasto.monto !== ""
                        ? Number(gasto.monto).toLocaleString("es-PE", { minimumFractionDigits: 2 })
                        : "";
                    case "ot":
                      return gasto.filtroOperativo.ot?.ot ?? "";
                    case "fechaEmision":
                      return gasto.fechaEmision ? (new Date(gasto.fechaEmision).toLocaleDateString("es-PE")) : "";
                    case "comentario":                      // Migrar el campo Comentario a una sola línea, reemplazando saltos de línea por espacio
                      return gasto.comentario ? String(gasto.comentario).replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim() : "";
                    case "estado": {
                      const estado = Number(gasto.estado);
                      return Number.isFinite(estado)
                        ? estado
                        : "";
                    }
                      default:
                      return (gasto as any)[key] ?? "";
                  }
                })
              );
              const csv = [headers, ...rows]
                .map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
                .join("\r\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `gastos_export_${new Date().toISOString().slice(0,10)}.csv`;
              document.body.appendChild(a);
              a.click();
              setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }, 0);
            },
          },
        ]}
      />

      {rechazoError && (
        <div
          style={{
            background: "#FEF2F2",
            border: "1px solid #FECACA",
            color: "#991B1B",
            padding: 14,
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {rechazoError}
        </div>
      )}

      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 16,
          padding: 20,
          boxShadow: "0 8px 24px rgba(23,20,58,0.08)",
        }}
      >
        <div
          style={{
            width: "100%",
            maxHeight: "70vh",
            overflow: "auto",
            position: "relative",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              {columnasGridGastos.map((columna) => (
                <col key={`col-${columna.key}`} style={{ width: columna.width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {columnasGridGastos.map((header) => {
                  const isSorted = sortConfig?.key === header.key;
                  const isFrozen = columnasCongeladasGrid.has(header.key);
                  return (
                    <th
                      key={header.key}
                      style={{
                        textAlign: header.align,
                        padding: "13px 11px",
                        fontSize: 11,
                        color: isSorted ? "#6E4CCB" : "#374151",
                        borderBottom: "1px solid #E5E7EB",
                        background: "#F9FAFB",
                        position: "sticky",
                        top: 0,
                        left: isFrozen ? stickyLeftByColumn[header.key] : undefined,
                        zIndex: isFrozen ? 4 : 3,
                        boxShadow: "0 1px 0 #E5E7EB",
                        borderRight: isFrozen ? "1px solid #E5E7EB" : undefined,
                        cursor: header.key !== 'acciones' ? 'pointer' : 'default',
                        userSelect: 'none',
                      }}
                      onClick={() => {
                        if (header.key === 'acciones') return;
                        setSortConfig((prev) => {
                          if (prev?.key === header.key) {
                            // Alternar dirección
                            return { key: header.key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
                          }
                          return { key: header.key, direction: 'asc' };
                        });
                      }}
                    >
                      {header.label}
                      {isSorted && (
                        <span style={{ marginLeft: 4, fontSize: 12 }}>
                          {sortConfig?.direction === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
              <tr>
                {columnasGridGastos.map((header) => {
                  const isFrozen = columnasCongeladasGrid.has(header.key);

                  return (
                    <th
                      key={`filter-${header.key}`}
                      style={{
                        padding: "2px 11px 10px",
                        borderBottom: "1px solid #E5E7EB",
                        background: "#F9FAFB",
                        position: "sticky",
                        top: 42,
                        left: isFrozen ? stickyLeftByColumn[header.key] : undefined,
                        zIndex: isFrozen ? 4 : 3,
                        borderRight: isFrozen ? "1px solid #E5E7EB" : undefined,
                      }}
                    >
                      {header.key === "acciones" ? null : (
                        <div style={{ position: "relative" }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setColumnaFiltroAbierta((prev) => (prev === header.key ? null : header.key));
                            }}
                            style={{
                              width: "100%",
                              height: 30,
                              borderRadius: 8,
                              border: (filtrosColumnas[header.key] ?? []).length > 0 ? "1px solid #C7D2FE" : "1px solid #D1D5DB",
                              padding: "0 9px",
                              fontSize: 10,
                              color: (filtrosColumnas[header.key] ?? []).length > 0 ? "#4338CA" : "#374151",
                              background: (filtrosColumnas[header.key] ?? []).length > 0 ? "#EEF2FF" : "#FFFFFF",
                              boxSizing: "border-box",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                            }}
                          >
                            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" 
                                stroke={(filtrosColumnas[header.key] ?? []).length > 0 ? '#4338CA' : '#6B7280'} 
                                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="22" y1="3" x2="2" y2="3" />
                                <line x1="16" y1="7" x2="8" y2="7" />
                                <line x1="10" y1="11" x2="14" y2="11" />
                                <line x1="21" y1="3" x2="14" y2="11" />
                                <line x1="3" y1="3" x2="10" y2="11" />
                                <line x1="8" y1="7" x2="8" y2="21" />
                                <line x1="16" y1="7" x2="16" y2="21" />
                              </svg>
                              {(filtrosColumnas[header.key] ?? []).length > 0 && (
                                <span style={{ fontSize: 10, color: '#4338CA', fontWeight: 600 }}>{(filtrosColumnas[header.key] ?? []).length}</span>
                              )}
                            </span>
                          </button>
                          {columnaFiltroAbierta === header.key && (
                            <ColumnFilterDropdown
                              header={header}
                              filtroColumnaMenuRef={filtroColumnaMenuRef}
                              filtrosColumnas={filtrosColumnas}
                              setFiltrosColumnas={setFiltrosColumnas}
                              opcionesFiltroPorColumna={opcionesFiltroPorColumna}
                              filtroBusqueda={filtroBusquedaPorColumna[header.key] || ""}
                              setFiltroBusqueda={valor => setFiltroBusquedaPorColumna((prev: Record<string, string>) => ({ ...prev, [header.key]: valor }))}
                            />
                          )}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={columnasGridGastos.length} style={{ padding: 24, textAlign: "center", color: "#6B7280", fontSize: 11 }}>
                    Cargando gastos...
                  </td>
                </tr>
              ) : gastosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={columnasGridGastos.length} style={{ padding: 24, textAlign: "center", color: "#6B7280", fontSize: 11 }}>
                    No se encontraron gastos.
                  </td>
                </tr>
              ) : (
                  gastosFiltrados.map((gasto) => (
                    <tr
                      key={gasto.id}
                      style={{
                        background: selectedRowId === gasto.id ? "#E0E7FF" : "transparent",
                      transition: "background 0.1s"
                    }}
                    onClick={() => {
                      setSelectedRowId(gasto.id);
                      if (rechazoError) {
                        setRechazoError(null);
                      }
                    }}
                    >
                      {columnasGridGastos.map((col) => (
                      <td
                        key={col.key}
                        style={{
                          padding: "13px 11px",
                          borderBottom: "1px solid #F3F4F6",
                          color: col.key === "responsable" ? "#17143A" : "#374151",
                          fontSize: 11,
                          fontWeight: col.key === "responsable" ? 700 : undefined,
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                          textOverflow: "ellipsis",
                          maxWidth: "100%",
                          position: columnasCongeladasGrid.has(col.key) ? "sticky" : undefined,
                          left: columnasCongeladasGrid.has(col.key)
                            ? stickyLeftByColumn[col.key]
                            : undefined,
                          zIndex: columnasCongeladasGrid.has(col.key) ? 2 : 1,
                          background: columnasCongeladasGrid.has(col.key)
                            ? selectedRowId === gasto.id
                              ? "#E0E7FF"
                              : "#FFFFFF"
                            : undefined,
                          borderRight: columnasCongeladasGrid.has(col.key)
                            ? "1px solid #E5E7EB"
                            : undefined,
                        }}
                      >

                        
                        {/* Renderizado de cada celda */}
                        {(() => {
                          switch (col.key) {
                            case "cliente":
                              return renderGridCellText(gasto.filtroOperativo.filtro?.nombreCliente);
                            case "nombreProyecto":
                              return renderGridCellText(gasto.filtroOperativo.filtro?.nombreProyecto);
                            case "tipoTrabajo":
                              return renderGridCellText(
                                gasto.filtroOperativo.filtro?.tipoTrabajo ??
                                  gasto.filtroOperativo.tipoTrabajo?.tipoTrabajo
                              );
                            case "id":
                              return renderGridCellText(gasto.id);
                            case "site":
                              return renderGridCellText(gasto.filtroOperativo.filtro?.nombreSite);
                            case "solicitante":
                              return renderGridCellText(
                                getConstanteLabelOrFallback(
                                  solicitanteOptions,
                                  gasto.solicitante,
                                  gasto.solicitanteLabel
                                )
                              );
                            case "responsable":
                              return renderGridCellText(gasto.responsableLabel || gasto.responsable || "");
                            case "validador":
                              return renderGridCellText(
                                getConstanteLabelOrFallback(
                                  validadorOptions,
                                  gasto.validador,
                                  gasto.validadorLabel
                                )
                              );
                            case "tarea":
                              return renderGridCellText(
                                getTareaLabelOrFallback(
                                  tareasCatalogo,
                                  gasto.filtroOperativo.tarea?.correlativo,
                                  gasto.filtroOperativo.tarea?.tarea
                                )
                              );
                            case "detalle":
                              return renderGridCellText(gasto.detalle);
                            case "comentario":
                                return renderGridCellText(
                                  gasto.comentario ? String(gasto.comentario).replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim() : ""
                                );
                            case "bien":
                              return renderGridCellText(getConstanteLabel(bienOptions, gasto.bien));
                            case "comprobante":
                              return renderGridCellText(getConstanteLabel(comprobanteOptions, gasto.comprobante));
                            case "moneda":
                              return renderGridCellText(getConstanteLabel(monedaOptions, gasto.moneda));
                            case "monto":
                              return renderGridCellText(
                                gasto.monto !== undefined && gasto.monto !== null && gasto.monto !== ""
                                  ? Number(gasto.monto).toLocaleString("es-PE", {
                                      minimumFractionDigits: 2,
                                    })
                                  : ""
                              );
                            case "ot":
                              return renderGridCellText(gasto.filtroOperativo.ot?.ot);
                            case "estado":
                              return renderGridCellText(String(gasto.estado ?? ""));
                            case "fechaEmision":
                              return renderGridCellText(
                                gasto.fechaEmision
                                  ? new Date(gasto.fechaEmision).toLocaleDateString("es-PE")
                                  : ""
                              );
                            case "acciones":
                              return (
                                <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                                  <button
                                    title="Editar"
                                    aria-label="Editar"
                                    style={{
                                      width: 34,
                                      height: 34,
                                      border: "1px solid #C7D2FE",
                                      background: "#EEF2FF",
                                      color: "#3730A3",
                                      borderRadius: 8,
                                      fontWeight: 700,
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: 15,
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      abrirEditar(gasto);
                                    }}
                                  >
                                    ✎
                                  </button>

                                  <button
                                    title="Rechazar"
                                    aria-label="Rechazar"
                                    style={{
                                      width: 34,
                                      height: 34,
                                      border: "1px solid #FECACA",
                                      background: "#FEF2F2",
                                      color: "#B91C1C",
                                      borderRadius: 8,
                                      fontWeight: 700,
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: 15,
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      confirmarEliminar(gasto);
                                    }}
                                  >
                                    🗑
                                  </button>
                                </div>
                              );
                            default:
                              return null;
                          }
                        })()}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Pie de grilla: cantidad de registros y suma por moneda */}
        <div style={{
          width: "100%",
          padding: "8px 0 0 0",
          fontSize: 12,
          color: "#374151",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <span>{`Registros encontrados: ${gastosFiltrados.length}`}</span>
          <span>
            {(() => {
              // Agrupar y sumar montos por moneda
              const resumen = new Map();
              gastosFiltrados.forEach(gasto => {
                const moneda = gasto.monedaLabel || gasto.moneda || "-";
                const monto = Number(gasto.monto) || 0;
                if (!resumen.has(moneda)) resumen.set(moneda, 0);
                resumen.set(moneda, resumen.get(moneda) + monto);
              });
              return Array.from(resumen.entries())
                .map(([moneda, suma]) => `${moneda}: ${suma.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`)
                .join(" | ");
            })()}
          </span>
        </div>
      </div>

      {panelAbierto && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.35)",
            display: "flex",
            justifyContent: "flex-end",
            zIndex: 3000,
          }}
        >
          <div
            style={{
              width: 900,
              maxWidth: "100%",
              height: "100%",
              background: "#FFFFFF",
              boxShadow: "-8px 0 24px rgba(0,0,0,0.12)",
              padding: 24,
              boxSizing: "border-box",
              overflowY: "auto",
            }}
            ref={sidePanelRef}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", width: "100%" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 24, color: "#17143A" }}>
                    {modo === "nuevo" ? "Nuevo gasto" : "Editar gasto"}
                  </h2>
                  <p style={{ marginTop: 8, marginBottom: 0, color: "#6B7280", fontSize: 13 }}>
                    Complete la información del gasto.
                  </p>
                  <p style={{ marginTop: 6, marginBottom: 0, color: "#475569", fontSize: 12 }}>
                    El sistema registra auditoria automatica por seccion al guardar o rechazar cambios.
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: "#374151" }}>Porcentaje:</span>
                  <span
                    ref={porcentajeRef}
                    style={{ fontSize: 18, fontWeight: 700, color: porcentajeColor, minWidth: 40, cursor: "pointer", position: "relative" }}
                    onClick={() => setShowPorcentajePopup((v) => !v)}
                  >
                    {valoresGastoLoading
                      ? "Cargando..."
                      : `${formatDecimalValue(valoresGasto.porcentaje)} %`}
                    {/* Eliminado: Popup de utilidad */}
                    {showPorcentajePopup && (
                      <div
                        style={{
                          position: "absolute",
                          top: 28,
                          right: 0,
                          background: "#fff",
                          border: "1px solid #E5E7EB",
                          borderRadius: 8,
                          boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                          padding: "20px 28px",
                          zIndex: 4000,
                          minWidth: 260,
                        }}
                      >
                        {porcentajeValores.map((item) => (
                          <React.Fragment key={item.label}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: 14 }}>
                              <span style={{ color: "#374151", fontWeight: 600 }}>{item.label}</span>
                              <span style={{ color: "#0F172A", fontWeight: 700 }}>{item.value}</span>
                            </div>
                            {item.label === "Saldo" && (
                              <hr style={{ border: 0, borderTop: "1px solid #E5E7EB", margin: "6px 0" }} />
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </span>
                  <button
                    style={{
                      border: "none",
                      background: "#F3F4F6",
                      color: "#17143A",
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 22,
                      lineHeight: "22px",
                    }}
                    onClick={cerrarPanel}
                  >
                    ×
                  </button>
                  {/* Eliminado: Etiqueta Utilidad bajo el botón */}
                </div>
              </div>
            </div>

            {errorGuardado && (
              <div
                style={{
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  color: "#991B1B",
                  padding: 14,
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 600,
                  marginBottom: 16,
                }}
              >
                {errorGuardado}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {/* Enlace para visualizar la factura solo si hay ruta y NO es modo nuevo ni editar */}
              {modo !== "nuevo" && modo !== "editar" && (form.facturaPath || form.facturaUrl) && (
                <a
                  href={facturaDisplayPath}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-block",
                    marginBottom: 10,
                    color: "#6E4CCB",
                    fontWeight: 600,
                    fontSize: 13,
                    textDecoration: "underline",
                    cursor: "pointer",
                  }}
                >
                  Ver factura
                </a>
              )}
              <FiltroOperativoLookup
                value={form.filtroOperativo}
                onChange={handleFiltroOperativoChange}
                onSelectionBlur={(value) => {
                  void cargarValoresGasto(value);
                }}
              />

              {errores.filtroOperativo && (
                <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>
                  {errores.filtroOperativo}
                </div>
              )}

              {errores.tarea && (
                <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>
                  {errores.tarea}
                </div>
              )}

              {constantesError ? (
                <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>
                  {constantesError}
                </div>
              ) : null}

              {solicitanteError ? (
                <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>
                  {solicitanteError}
                </div>
              ) : null}

              {gestorError ? (
                <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>
                  {gestorError}
                </div>
              ) : null}

              {validadorError ? (
                <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>
                  {validadorError}
                </div>
              ) : null}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1.25fr) minmax(260px, 1fr)",
                  gap: 12,
                  alignItems: "start",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>Responsable</label>
                  <div style={{ position: "relative", width: "100%" }}>
                    <input
                      type="text"
                      value={
                        empleadosSafe.find((emp) => String(emp.idEmpleado) === form.responsable)?.nombreEmpleado ||
                        form.responsableLabel ||
                        responsableInput ||
                        ""
                      }
                      onChange={(e) => {
                        setResponsableInput(e.target.value);
                        setShowResponsableDropdown(true);
                        setForm((prev) => ({
                          ...prev,
                          responsable: "",
                          responsableLabel: "",
                          idSuministroProvisional: "",
                          idBancoCta: "",
                          cuenta: "",
                          cuentaNumero: "",
                          cuentaInter: "",
                          nombreCta: "",
                          ruc: "",
                        }));
                      }}
                      onFocus={() => {
                        if (filteredResponsables.length > 0) setShowResponsableDropdown(true);
                      }}
                      onKeyDown={(e) => {
                        if (filteredResponsables.length === 0) return;

                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setHighlightedResponsableIdx((idx) => Math.min(idx + 1, filteredResponsables.length - 1));
                          setShowResponsableDropdown(true);
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setHighlightedResponsableIdx((idx) => Math.max(idx - 1, 0));
                          setShowResponsableDropdown(true);
                        } else if (e.key === "Enter") {
                          if (highlightedResponsableIdx >= 0 && highlightedResponsableIdx < filteredResponsables.length) {
                            const emp = filteredResponsables[highlightedResponsableIdx];
                            const cuentaMetadata = buildCuentaMetadata(emp);
                            setForm((prev) => ({
                              ...prev,
                              responsable: String(emp.idEmpleado),
                              responsableLabel: emp.nombreEmpleado,
                              idSuministroProvisional: "",
                              idBancoCta: emp.idBancoCta != null ? String(emp.idBancoCta) : "",
                              cuenta: buildCuentaResumen(emp),
                              cuentaNumero: cuentaMetadata.cuentaNumero,
                              cuentaInter: cuentaMetadata.cuentaInter,
                              nombreCta: cuentaMetadata.nombreCta,
                              ruc: cuentaMetadata.ruc,
                            }));
                            setResponsableInput(emp.nombreEmpleado);
                            setShowResponsableDropdown(false);
                            setHighlightedResponsableIdx(-1);
                          }
                        }
                      }}
                      placeholder="Seleccione..."
                      autoComplete="off"
                      required
                      style={{
                        width: "100%",
                        height: 42,
                        borderRadius: 10,
                        border: `1px solid ${errores.responsable ? "#F87171" : "#D1D5DB"}`,
                        padding: "0 12px",
                        fontSize: 11,
                        boxSizing: "border-box",
                      }}
                      disabled={empleadosLoading}
                    />

                    {showResponsableDropdown && filteredResponsables.length > 0 && (
                      <div
                        style={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          right: 0,
                          background: "#fff",
                          border: "1px solid #ccc",
                          zIndex: 1002,
                          maxHeight: 180,
                          overflowY: "auto",
                        }}
                      >
                        {filteredResponsables.map((emp, idx) => (
                          <div
                            key={`responsable-${emp.idEmpleado || emp.nombreEmpleado || idx}-${idx}`}
                            style={{
                              padding: 6,
                              cursor: "pointer",
                              background: idx === highlightedResponsableIdx ? "#e6f7ff" : undefined,
                              fontSize: 11,
                              lineHeight: 1.1,
                            }}
                            onMouseDown={() => {
                              const cuentaMetadata = buildCuentaMetadata(emp);
                              setForm((prev) => ({
                                ...prev,
                                responsable: String(emp.idEmpleado),
                                responsableLabel: emp.nombreEmpleado,
                                idSuministroProvisional: "",
                                idBancoCta: emp.idBancoCta != null ? String(emp.idBancoCta) : "",
                                cuenta: buildCuentaResumen(emp),
                                cuentaNumero: cuentaMetadata.cuentaNumero,
                                cuentaInter: cuentaMetadata.cuentaInter,
                                nombreCta: cuentaMetadata.nombreCta,
                                ruc: cuentaMetadata.ruc,
                              }));
                              setResponsableInput(emp.nombreEmpleado);
                              setShowResponsableDropdown(false);
                              setHighlightedResponsableIdx(-1);
                            }}
                          >
                            {emp.nombreEmpleado}
                          </div>
                        ))}
                      </div>
                    )}

                    {empleadosLoading && <span style={{ fontSize: 12, color: "#888" }}>Cargando...</span>}
                    {empleadosError && <span style={{ fontSize: 12, color: "red" }}>{empleadosError}</span>}
                  </div>

                  {errores.responsable && (
                    <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>
                      {errores.responsable}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>
                    Suministro vigente
                  </label>
                  <select
                    value={form.idSuministroProvisional}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        idSuministroProvisional: e.target.value,
                      }))
                    }
                    disabled={
                      !requiereSuministroVigente(form.filtroOperativo.tarea?.correlativo) ||
                      !form.filtroOperativo.filtro?.filtroKey ||
                      suministrosVigentesLoading
                    }
                    style={{
                      width: "100%",
                      height: 42,
                      borderRadius: 10,
                      border: `1px solid ${errores.idSuministroProvisional ? "#F87171" : "#D1D5DB"}`,
                      padding: "0 12px",
                      fontSize: 11,
                      boxSizing: "border-box",
                      background: "#FFFFFF",
                    }}
                  >
                    <option value="">
                      {!requiereSuministroVigente(form.filtroOperativo.tarea?.correlativo)
                        ? "No aplica"
                        : suministrosVigentesLoading
                        ? "Cargando..."
                        : suministrosVigentes.length > 0
                          ? "Seleccione..."
                          : "Sin registros vigentes"}
                    </option>
                    {suministrosVigentes.map((item) => (
                      <option key={item.idProvisional} value={String(item.idProvisional)}>
                        {buildSuministroVigenteLabel(item)}
                      </option>
                    ))}
                  </select>

                  {errores.idSuministroProvisional && (
                    <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>
                      {errores.idSuministroProvisional}
                    </div>
                  )}

                  {suministrosVigentesError && (
                    <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>
                      {suministrosVigentesError}
                    </div>
                  )}
                </div>
              </div>

        <div
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
    rowGap: 1.5,
    columnGap: 12,
    marginTop: 1.5,
  }}
>
  <div style={{ display: "flex", flexDirection: "column", gap: 1.5, gridColumn: "1 / -1", marginBottom: 8 }}>
    <label style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>Cuenta</label>
    <textarea
      value={form.cuenta}
      readOnly
      rows={2}
      placeholder="Cuenta bancaria asociada"
      style={{
        width: "100%",
        minHeight: 56,
        borderRadius: 10,
        border: "1px solid #D1D5DB",
        padding: 10,
        fontSize: 11,
        resize: "none",
        boxSizing: "border-box",
        overflow: "hidden",
        background: "#F9FAFB",
        color: "#374151",
      }}
    />
  </div>

  {/* DETALLE ocupa 2 filas */}
<div
  style={{
    display: "flex",
    flexDirection: "column",
    gap: 1.5,
    gridColumn: "span 6",
    gridRow: "span 2",
    marginBottom: 8,
  }}
>
  <label style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>
    Detalle
  </label>
  <textarea
    value={form.detalle}
    onChange={(e) =>
      setForm((prev) => ({ ...prev, detalle: e.target.value }))
    }
    rows={6}
    placeholder="Detalle del gasto"
    style={{
      width: "100%",
      borderRadius: 10,
      border: "1px solid #D1D5DB",
      padding: 12,
      fontSize: 11,
      resize: "vertical",
      boxSizing: "border-box",
      height: "100%",
    }}
  />
</div>

{/* FILA DERECHA 1: COMENTARIO */}
<div
  style={{
    display: "flex",
    flexDirection: "column",
    gap: 1.5,
    gridColumn: "span 6",
    marginBottom: 8,
  }}
>
  <label style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>
    Comentario
  </label>
  <textarea
    value={form.comentario}
    onChange={(e) =>
      setForm((prev) => ({ ...prev, comentario: e.target.value }))
    }
    rows={3}
    placeholder="Comentario adicional"
    style={{
      width: "100%",
      borderRadius: 10,
      border: "1px solid #D1D5DB",
      padding: 12,
      fontSize: 11,
      resize: "vertical",
      boxSizing: "border-box",
    }}
  />
</div>

{/* FILA DERECHA 2: FECHAS */}
<div
  style={{
    display: "flex",
    gap: 12,
    gridColumn: "span 6",
    marginBottom: 8,
  }}
>
  {/* FECHA EMISION */}
  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
    <label style={{ fontSize: 11, fontWeight: 700, display: "flex", gap: 6 }}>
      <input
        type="checkbox"
        checked={usarFechaEmision}
        onChange={(e) => {
          const checked = e.target.checked;
          setUsarFechaEmision(checked);
          setForm((prev) => ({
            ...prev,
            fechaEmision: checked
              ? prev.fechaEmision || fechaActual
              : "",
          }));
        }}
      />
      Fecha emisión
    </label>

    <input
      type="date"
      value={form.fechaEmision}
      disabled={!usarFechaEmision}
      onChange={(e) =>
        setForm((prev) => ({
          ...prev,
          fechaEmision: e.target.value,
        }))
      }
      style={{
        height: 42,
        borderRadius: 10,
        border: "1px solid #D1D5DB",
        padding: "0 12px",
        fontSize: 11,
        background: usarFechaEmision ? "#FFFFFF" : "#F3F4F6",
      }}
    />
  </div>

  {/* FECHA VENCIMIENTO */}
  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
    <label style={{ fontSize: 11, fontWeight: 700, display: "flex", gap: 6 }}>
      <input
        type="checkbox"
        checked={usarFechaVencimiento}
        onChange={(e) => {
          const checked = e.target.checked;
          setUsarFechaVencimiento(checked);
          setForm((prev) => ({
            ...prev,
            fechaVencimiento: checked
              ? prev.fechaVencimiento || fechaActual
              : "",
          }));
        }}
      />
      Fecha vencimiento
    </label>

    <input
      type="date"
      value={form.fechaVencimiento}
      disabled={!usarFechaVencimiento}
      onChange={(e) =>
        setForm((prev) => ({
          ...prev,
          fechaVencimiento: e.target.value,
        }))
      }
      style={{
        height: 42,
        borderRadius: 10,
        border: "1px solid #D1D5DB",
        padding: "0 12px",
        fontSize: 11,
        background: usarFechaVencimiento ? "#FFFFFF" : "#F3F4F6",
      }}
    />
  </div>
</div>

  <div style={{ display: "flex", flexDirection: "column", gap: 1.5, gridColumn: "span 4", marginBottom: 8 }}>
    <label style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>Bien</label>
    <select value={getSelectValue(bienOptions, form.bien)} onChange={(e) => setForm((prev) => ({ ...prev, bien: e.target.value }))} disabled={constantesLoading} style={{ width: "100%", height: 42, borderRadius: 10, border: `1px solid ${errores.bien ? "#F87171" : "#D1D5DB"}`, padding: "0 12px", fontSize: 11, background: "#FFFFFF" }}>
      <option value="">Seleccione</option>
     {bienOptions.map((option, index) => (
        <option
            key={`bien-${getConstanteStoredValue(option)}-${index}`}
            value={getConstanteStoredValue(option)}
          >
            {option.label}
        </option>
    ))}
    </select>
    {errores.bien && <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>{errores.bien}</div>}
  </div>

  <div style={{ display: "flex", flexDirection: "column", gap: 1.5, gridColumn: "span 4", marginBottom: 8 }}>
    <label style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>Comprobante</label>
    <select value={getSelectValue(comprobanteOptions, form.comprobante)} onChange={(e) => setForm((prev) => ({ ...prev, comprobante: e.target.value }))} disabled={constantesLoading} style={{ width: "100%", height: 42, borderRadius: 10, border: `1px solid ${errores.comprobante ? "#F87171" : "#D1D5DB"}`, padding: "0 12px", fontSize: 11, background: "#FFFFFF" }}>
      <option value="">Seleccione</option>
      {comprobanteOptions.map((option, index) => (
        <option
          key={`comprobante-${getConstanteStoredValue(option)}-${index}`}
          value={getConstanteStoredValue(option)}
        >
          {option.label}
        </option>
    ))}
    </select>
    {errores.comprobante && <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>{errores.comprobante}</div>}
  </div>

  <div style={{ display: "flex", alignItems: "center", gap: 12, gridColumn: "span 4", marginBottom: 8 }}>
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1.5 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>Serie</label>
      <input type="text" value={form.serie} onChange={(e) => setForm((prev) => ({ ...prev, serie: e.target.value }))} placeholder="Serie" style={{ width: "100%", height: 42, borderRadius: 10, border: "1px solid #D1D5DB", padding: "0 12px", fontSize: 11, boxSizing: "border-box" }} />
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        type="checkbox"
        id="rendicion"
        checked={form.rendicion}
        onChange={(e) => setForm((prev) => ({ ...prev, rendicion: e.target.checked }))}
        style={{ width: 16, height: 16 }}
      />
      <label htmlFor="rendicion" style={{ fontSize: 11, fontWeight: 700, color: "#374151", cursor: "pointer" }}>Rendición</label>
    </div>
  </div>

  {/* TIPO DE PAGO */}
  <div style={{ display: "flex", flexDirection: "column", gap: 1.5, gridColumn: "span 2", marginBottom: 8 }}>
    <label style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>Tipo de pago</label>
    <select
      value={getSelectValue(tipoPagoOptions, form.tipoPago)}
      onChange={(e) => setForm((prev) => ({ ...prev, tipoPago: e.target.value }))}
      disabled={constantesLoading}
      style={{
        width: "100%",
        height: 42,
        borderRadius: 10,
        border: `1px solid ${errores.tipoPago ? "#F87171" : "#D1D5DB"}`,
        padding: "0 12px",
        fontSize: 11,
        background: "#FFFFFF",
        boxSizing: "border-box",
      }}
    >
      <option value="">Seleccione</option>
      {tipoPagoOptions.map((option, index) => (
      <option
          key={`tipoPago-${getConstanteStoredValue(option)}-${index}`}
          value={getConstanteStoredValue(option)}
        >
        {option.label}
      </option>
      ))}
    </select>
    {errores.tipoPago && <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>{errores.tipoPago}</div>}
  </div>

{/* SUBTOTAL */}
  <div style={{ display: "flex", flexDirection: "column", gap: 1.5, gridColumn: "span 2", marginBottom: 8 }}>
    <label style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>Subtotal</label>
    <input
      type="number"
      value={form.monto}
      onChange={(e) => setForm((prev) => ({ ...prev, monto: e.target.value }))}
      step="0.01"
      style={{
        width: "100%",
        height: 42,
        borderRadius: 10,
        border: "1px solid #D1D5DB",
        padding: "0 12px",
        fontSize: 11,
        boxSizing: "border-box",
      }}
    />
  </div>

{/* IGV */}
  <div style={{ display: "flex", flexDirection: "column", gap: 1.5, gridColumn: "span 2", marginBottom: 8 }}>
    <label style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>IGV</label>
    <input
      type="number"
      value={hasSubtotal ? igvAmount.toFixed(2) : ""}
      readOnly
      step="0.01"
      style={{
        width: "100%",
        height: 42,
        borderRadius: 10,
        border: "1px solid #D1D5DB",
        padding: "0 12px",
        fontSize: 11,
        background: "#F3F4F6",
        boxSizing: "border-box",
      }}
    />
  </div>

{/* TOTAL */}
  <div style={{ display: "flex", flexDirection: "column", gap: 1.5, gridColumn: "span 2", marginBottom: 8 }}>
    <label style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>Total</label>
    <input
      type="number"
      value={hasSubtotal ? totalAmount.toFixed(2) : ""}
      readOnly
      step="0.01"
      style={{
        width: "100%",
        height: 42,
        borderRadius: 10,
        border: "1px solid #D1D5DB",
        padding: "0 12px",
        fontSize: 11,
        background: "#F3F4F6",
        boxSizing: "border-box",
      }}
    />
  </div>

{/* MONEDA */}
  <div style={{ display: "flex", alignItems: "flex-end", gap: 12, gridColumn: "span 2", marginBottom: 8 }}>
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1.5 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>Moneda</label>
      <select
        value={getSelectValue(monedaOptions, form.moneda)}
        onChange={(e) => setForm((prev) => ({ ...prev, moneda: e.target.value }))}
        disabled={constantesLoading}
        style={{
          width: "auto",
          minWidth: 80,
          maxWidth: "100%",
          height: 42,
          borderRadius: 10,
          border: `1px solid ${errores.moneda ? "#F87171" : "#D1D5DB"}`,
          padding: "0 12px",
          fontSize: 11,
          background: "#FFFFFF",
          boxSizing: "border-box",
        }}
      >
        <option value="">Seleccione</option>
        {monedaOptions.map((option, index) => (
          <option
            key={`moneda-${getConstanteStoredValue(option)}-${index}`}
            value={getConstanteStoredValue(option)}
          >
            {option.label}
          </option>
        ))}
      </select>
      {errores.moneda && <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>{errores.moneda}</div>}
    </div>
    {!esSoles && (
      <div style={{ display: "flex", flexDirection: "column", gap: 1.5, minWidth: 100, maxWidth: '100%', gridColumn: 'span 2' }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>Tipo de cambio</label>
        <input
          type="number"
          value={tipoCambio}
          min="0"
          step="0.01"
          onChange={e => setTipoCambio(e.target.value.replace(/^(\d*\.?\d{0,2}).*$/, '$1'))}
          placeholder="3.80"
          style={{
            width: "80%",
            height: 42,
            borderRadius: 10,
            border: "1px solid #D1D5DB",
            padding: "0 12px",
            fontSize: 11,
            boxSizing: "border-box",
          }}
        />
      </div>
    )}
  </div>

  <div style={{ display: "flex", flexDirection: "column", gap: 1.5, gridColumn: "span 4" }}>
    <label style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>Solicitante</label>
    <div style={{ position: "relative", width: "100%" }}>
      <input
        type="text"
        value={
          getConstanteLabelOrFallback(solicitanteOptions, form.solicitante, form.solicitanteLabel) ||
          solicitanteInput ||
          ""
        }
        onChange={(e) => {
          setSolicitanteInput(e.target.value);
          setShowSolicitanteDropdown(true);
          setHighlightedSolicitanteIdx(-1);
          setForm((prev) => ({ ...prev, solicitante: "" }));
        }}
        onFocus={() => {
          if (filteredSolicitantes.length > 0) {
            setShowSolicitanteDropdown(true);
          }
        }}
        onKeyDown={(e) => {
          if (filteredSolicitantes.length === 0) return;

          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightedSolicitanteIdx((idx) => Math.min(idx + 1, filteredSolicitantes.length - 1));
            setShowSolicitanteDropdown(true);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightedSolicitanteIdx((idx) => Math.max(idx - 1, 0));
            setShowSolicitanteDropdown(true);
          } else if (e.key === "Enter") {
            e.preventDefault();

            if (highlightedSolicitanteIdx >= 0 && highlightedSolicitanteIdx < filteredSolicitantes.length) {
              const option = filteredSolicitantes[highlightedSolicitanteIdx];
              setForm((prev) => ({ ...prev, solicitante: getConstanteStoredValue(option) }));
              setSolicitanteInput(option.label);
              setShowSolicitanteDropdown(false);
              setHighlightedSolicitanteIdx(-1);
            }
          }
        }}
        placeholder="Seleccione..."
        autoComplete="off"
        style={{
          width: "100%",
          height: 42,
          borderRadius: 10,
          border: `1px solid ${errores.solicitante ? "#F87171" : "#D1D5DB"}`,
          padding: "0 12px",
          fontSize: 11,
          boxSizing: "border-box",
          background: solicitanteLoading ? "#F3F4F6" : "#FFFFFF",
        }}
        disabled={solicitanteLoading || solicitanteOptions.length === 0}
      />

      {showSolicitanteDropdown && filteredSolicitantes.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid #ccc",
            zIndex: 1002,
            maxHeight: 180,
            overflowY: "auto",
          }}
        >
          {filteredSolicitantes.map((option, idx) => (
            <div
              key={`solicitante-${getConstanteStoredValue(option)}-${idx}`}
              style={{
                padding: 6,
                cursor: "pointer",
                background: idx === highlightedSolicitanteIdx ? "#e6f7ff" : undefined,
                fontSize: 11,
                lineHeight: 1.1,
              }}
              onMouseDown={() => {
                setForm((prev) => ({ ...prev, solicitante: getConstanteStoredValue(option) }));
                setSolicitanteInput(option.label);
                setShowSolicitanteDropdown(false);
                setHighlightedSolicitanteIdx(-1);
              }}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
    {errores.solicitante && <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>{errores.solicitante}</div>}
  </div>

  <div style={{ display: "flex", flexDirection: "column", gap: 1.5, gridColumn: "span 4" }}>
    <label style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>Gestor</label>
    <div style={{ position: "relative", width: "100%" }}>
      <input
        type="text"
        value={findConstanteOption(gestorOptions, form.gestor)?.label || gestorInput || ""}
        onChange={(e) => {
          setGestorInput(e.target.value);
          setShowGestorDropdown(true);
          setHighlightedGestorIdx(-1);
          setForm((prev) => ({ ...prev, gestor: "" }));
        }}
        onFocus={() => {
          if (filteredGestores.length > 0) {
            setShowGestorDropdown(true);
          }
        }}
        onKeyDown={(e) => {
          if (filteredGestores.length === 0) return;

          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightedGestorIdx((idx) => Math.min(idx + 1, filteredGestores.length - 1));
            setShowGestorDropdown(true);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightedGestorIdx((idx) => Math.max(idx - 1, 0));
            setShowGestorDropdown(true);
          } else if (e.key === "Enter") {
            e.preventDefault();

            if (highlightedGestorIdx >= 0 && highlightedGestorIdx < filteredGestores.length) {
              const option = filteredGestores[highlightedGestorIdx];
              setForm((prev) => ({ ...prev, gestor: getConstanteStoredValue(option) }));
              setGestorInput(option.label);
              setShowGestorDropdown(false);
              setHighlightedGestorIdx(-1);
            }
          }
        }}
        placeholder="Seleccione..."
        autoComplete="off"
        style={{
          width: "100%",
          height: 42,
          borderRadius: 10,
          border: `1px solid ${errores.gestor ? "#F87171" : "#D1D5DB"}`,
          padding: "0 12px",
          fontSize: 11,
          boxSizing: "border-box",
          background: gestorLoading ? "#F3F4F6" : "#FFFFFF",
        }}
        disabled={gestorLoading || gestorOptions.length === 0}
      />

      {showGestorDropdown && filteredGestores.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid #ccc",
            zIndex: 1002,
            maxHeight: 180,
            overflowY: "auto",
          }}
        >
          {filteredGestores.map((option, idx) => (
            <div
              key={`gestor-${getConstanteStoredValue(option)}-${idx}`}
              style={{
                padding: 6,
                cursor: "pointer",
                background: idx === highlightedGestorIdx ? "#e6f7ff" : undefined,
                fontSize: 11,
                lineHeight: 1.1,
              }}
              onMouseDown={() => {
                setForm((prev) => ({ ...prev, gestor: getConstanteStoredValue(option) }));
                setGestorInput(option.label);
                setShowGestorDropdown(false);
                setHighlightedGestorIdx(-1);
              }}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
    {errores.gestor && <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>{errores.gestor}</div>}
  </div>

  <div style={{ display: "flex", flexDirection: "column", gap: 1.5, gridColumn: "span 4" }}>
    <label style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>Validador</label>
    <div style={{ position: "relative", width: "100%" }}>
      <input
        type="text"
        value={
          getConstanteLabelOrFallback(validadorOptions, form.validador, form.validadorLabel) ||
          validadorInput ||
          ""
        }
        onChange={(e) => {
          setValidadorInput(e.target.value);
          setShowValidadorDropdown(true);
          setHighlightedValidadorIdx(-1);
          setForm((prev) => ({ ...prev, validador: "" }));
        }}
        onFocus={() => {
          if (filteredValidadores.length > 0) {
            setShowValidadorDropdown(true);
          }
        }}
        onKeyDown={(e) => {
          if (filteredValidadores.length === 0) return;

          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightedValidadorIdx((idx) => Math.min(idx + 1, filteredValidadores.length - 1));
            setShowValidadorDropdown(true);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightedValidadorIdx((idx) => Math.max(idx - 1, 0));
            setShowValidadorDropdown(true);
          } else if (e.key === "Enter") {
            e.preventDefault();

            if (highlightedValidadorIdx >= 0 && highlightedValidadorIdx < filteredValidadores.length) {
              const option = filteredValidadores[highlightedValidadorIdx];
              setForm((prev) => ({ ...prev, validador: getConstanteStoredValue(option) }));
              setValidadorInput(option.label);
              setShowValidadorDropdown(false);
              setHighlightedValidadorIdx(-1);
            }
          }
        }}
        placeholder="Seleccione..."
        autoComplete="off"
        style={{
          width: "100%",
          height: 42,
          borderRadius: 10,
          border: `1px solid ${errores.validador ? "#F87171" : "#D1D5DB"}`,
          padding: "0 12px",
          fontSize: 11,
          boxSizing: "border-box",
          background: validadorLoading ? "#F3F4F6" : "#FFFFFF",
        }}
        disabled={validadorLoading || validadorOptions.length === 0}
      />

      {showValidadorDropdown && filteredValidadores.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid #ccc",
            zIndex: 1002,
            maxHeight: 180,
            overflowY: "auto",
          }}
        >
          {filteredValidadores.map((option, idx) => (
            <div
              key={`validador-${getConstanteStoredValue(option)}-${idx}`}
              style={{
                padding: 6,
                cursor: "pointer",
                background: idx === highlightedValidadorIdx ? "#e6f7ff" : undefined,
                fontSize: 11,
                lineHeight: 1.1,
              }}
              onMouseDown={() => {
                setForm((prev) => ({ ...prev, validador: getConstanteStoredValue(option) }));
                setValidadorInput(option.label);
                setShowValidadorDropdown(false);
                setHighlightedValidadorIdx(-1);
              }}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
    {errores.validador && <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>{errores.validador}</div>}
  </div>
</div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 10 }}>
              {/* Botón de factura alineado a la izquierda */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0, flex: 1 }}>
                <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <button
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      marginLeft: 0,
                      cursor: facturaUploadLoading ? "wait" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      height: 36,
                      opacity: facturaUploadLoading ? 0.7 : 1,
                    }}
                    title="Cargar factura"
                    type="button"
                    disabled={facturaUploadLoading}
                    onClick={() => setShowFacturaSourceMenu((prev) => !prev)}
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="4" y="3" width="16" height="18" rx="2" fill="#6E4CCB"/>
                      <rect x="7" y="7" width="10" height="2" rx="1" fill="#fff"/>
                      <rect x="7" y="11" width="10" height="2" rx="1" fill="#fff"/>
                      <rect x="7" y="15" width="6" height="2" rx="1" fill="#fff"/>
                    </svg>
                  </button>
                  <div
                    style={{
                      minWidth: 0,
                      fontSize: 11,
                      color: facturaDisplayPath ? "#374151" : "#6B7280",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      cursor: facturaDisplayPath ? "pointer" : "default",
                      textDecoration: facturaDisplayPath ? "underline" : "none",
                    }}
                    title={facturaDisplayPath || "Sin factura cargada"}
                    onClick={() => {
                      if (facturaDisplayPath) setShowFacturaViewer(true);
                    }}
                  >
                    {facturaUploadLoading
                      ? "Cargando factura en SharePoint..."
                      : facturaDisplayPath || "Sin factura cargada"}
                  </div>
                        {/* Visualizador modal de factura */}
                        {showFacturaViewer && facturaDisplayPath && (
                          <div
                            style={{
                              position: "fixed",
                              inset: 0,
                              background: "rgba(15, 23, 42, 0.60)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              zIndex: 4000,
                            }}
                            onClick={() => setShowFacturaViewer(false)}
                          >
                            <div
                              style={{
                                background: "#fff",
                                borderRadius: 12,
                                padding: 16,
                                maxWidth: "90vw",
                                maxHeight: "90vh",
                                boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
                                position: "relative",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                              onClick={e => e.stopPropagation()}
                            >
                              <button
                                style={{
                                  position: "absolute",
                                  top: 8,
                                  right: 8,
                                  background: "#F3F4F6",
                                  border: "none",
                                  borderRadius: 6,
                                  width: 32,
                                  height: 32,
                                  fontSize: 20,
                                  fontWeight: 700,
                                  color: "#17143A",
                                  cursor: "pointer",
                                  zIndex: 2,
                                }}
                                onClick={() => setShowFacturaViewer(false)}
                                title="Cerrar"
                              >
                                ×
                              </button>
                              {facturaDisplayPath.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                                <img
                                  src={facturaDisplayPath}
                                  alt="Factura adjunta"
                                  style={{
                                    maxWidth: "80vw",
                                    maxHeight: "80vh",
                                    borderRadius: 8,
                                    boxShadow: "0 2px 12px rgba(0,0,0,0.10)",
                                  }}
                                />
                              ) : facturaDisplayPath.match(/\.(pdf)$/i) ? (
                                <iframe
                                  src={facturaDisplayPath}
                                  title="Factura PDF"
                                  style={{
                                    width: "80vw",
                                    height: "80vh",
                                    border: "none",
                                    borderRadius: 8,
                                    boxShadow: "0 2px 12px rgba(0,0,0,0.10)",
                                  }}
                                  allow="autoplay"
                                />
                              ) : (
                                <div style={{ color: "#DC2626", fontWeight: 600, fontSize: 14 }}>
                                  No se puede visualizar este tipo de archivo.
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                  {showFacturaSourceMenu && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: "calc(100% + 8px)",
                        background: "#FFFFFF",
                        border: "1px solid #E5E7EB",
                        borderRadius: 12,
                        boxShadow: "0 10px 28px rgba(15, 23, 42, 0.14)",
                        padding: 8,
                        zIndex: 1005,
                        minWidth: 180,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => camaraFacturaInputRef.current?.click()}
                        style={{
                          width: "100%",
                          border: "none",
                          background: "transparent",
                          textAlign: "left",
                          padding: "10px 12px",
                          borderRadius: 8,
                          cursor: "pointer",
                          fontSize: 11,
                          color: "#17143A",
                        }}
                      >
                        Tomar foto
                      </button>
                      <button
                        type="button"
                        onClick={() => archivoFacturaInputRef.current?.click()}
                        style={{
                          width: "100%",
                          border: "none",
                          background: "transparent",
                          textAlign: "left",
                          padding: "10px 12px",
                          borderRadius: 8,
                          cursor: "pointer",
                          fontSize: 11,
                          color: "#17143A",
                        }}
                      >
                        Elegir archivo
                      </button>
                    </div>
                  )}
                </div>
                {facturaUploadError && (
                  <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>
                    {facturaUploadError}
                  </div>
                )}
                <input
                  ref={archivoFacturaInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={procesarFacturaSeleccionada}
                />
                <input
                  ref={camaraFacturaInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: "none" }}
                  onChange={procesarFacturaSeleccionada}
                />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  style={{
                    border: "1px solid #D1D5DB",
                    background: "#FFFFFF",
                    color: "#17143A",
                    padding: "10px 16px",
                    borderRadius: 10,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  onClick={cerrarPanel}
                >
                  Cancelar
                </button>
                <button
                  style={{
                    border: "none",
                    background: "#6E4CCB",
                    color: "#FFFFFF",
                    padding: "10px 16px",
                    borderRadius: 10,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                  onClick={guardar}
                  disabled={guardando}
                >
                  {guardando ? "Guardando..." : modo === "nuevo" ? "Guardar" : "Actualizar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {mostrarConfirmacionRechazo && idEliminar !== null && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 3100,
          }}
        >
          <div
            style={{
              width: 420,
              maxWidth: "calc(100% - 24px)",
              background: "#FFFFFF",
              borderRadius: 16,
              padding: 24,
              boxShadow: "0 12px 28px rgba(0,0,0,0.16)",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 12, color: "#17143A" }}>
              Confirmar eliminación
            </h3>
            <p style={{ marginTop: 0, color: "#4B5563", lineHeight: 1.6 }}>
              ¿Desea rechazar el gasto <strong>{gastoSeleccionadoEliminar?.id}</strong>?
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
              <button
                style={{
                  border: "1px solid #D1D5DB",
                  background: "#FFFFFF",
                  color: "#17143A",
                  padding: "10px 16px",
                  borderRadius: 10,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                onClick={cancelarRechazo}
              >
                Cancelar
              </button>
              <button
                style={{
                  border: "none",
                  background: "#DC2626",
                  color: "#FFFFFF",
                  padding: "10px 16px",
                  borderRadius: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
                onClick={abrirPopupMotivoRechazo}
              >
                Rechazar
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarMotivoRechazo && idEliminar !== null && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 3101,
          }}
        >
          <div
            style={{
              width: 480,
              maxWidth: "calc(100% - 24px)",
              background: "#FFFFFF",
              borderRadius: 16,
              padding: 24,
              boxShadow: "0 12px 28px rgba(0,0,0,0.16)",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 12, color: "#17143A" }}>
              Motivo del rechazo
            </h3>
            <p style={{ marginTop: 0, color: "#4B5563", lineHeight: 1.6 }}>
              Ingrese la observación que se enviará al rechazo del registro seleccionado.
            </p>
            <textarea
              value={motivoRechazo}
              onChange={(e) => {
                setMotivoRechazo(e.target.value);
                if (rechazoError) {
                  setRechazoError(null);
                }
              }}
              placeholder="Ingrese el motivo del rechazo"
              rows={5}
              style={{
                width: "100%",
                borderRadius: 12,
                border: "1px solid #D1D5DB",
                padding: 12,
                fontSize: 12,
                boxSizing: "border-box",
                resize: "vertical",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
              <button
                style={{
                  border: "1px solid #D1D5DB",
                  background: "#FFFFFF",
                  color: "#17143A",
                  padding: "10px 16px",
                  borderRadius: 10,
                  fontWeight: 600,
                  cursor: rechazando ? "not-allowed" : "pointer",
                }}
                onClick={cancelarRechazo}
                disabled={rechazando}
              >
                Cancelar
              </button>
              <button
                style={{
                  border: "none",
                  background: "#DC2626",
                  color: "#FFFFFF",
                  padding: "10px 16px",
                  borderRadius: 10,
                  fontWeight: 700,
                  cursor: rechazando ? "not-allowed" : "pointer",
                }}
                onClick={eliminar}
                disabled={rechazando}
              >
                {rechazando ? "Rechazando..." : "Rechazar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
