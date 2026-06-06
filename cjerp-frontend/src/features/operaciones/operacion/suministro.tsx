import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CrudToolbar, {
  matchesCrudToolbarSearch,
  type CrudToolbarSearchField,
} from "../../../components/base/CrudToolbar";
import { FiltroOperativoLookup } from "../../../components/lookups/FiltroOperativoLookup";
import {
  actualizarLogisticaSuministro,
  buscarLogisticaSuministro,
  insertarLogisticaSuministro,
  obtenerKpisLogisticaSuministro,
  uploadImagenLogisticaSuministro,
} from "../../../api/logisticaSuministroService";
import { listarSolicitanteOptions } from "../../../api/solicitanteService";
import { useConstantesPorCampo } from "../../../hooks/useConstantesPorCampo";
import type { ConstanteOption } from "../../../models/constante";
import type { FiltroOperativoValue, TareaOption } from "../../../models/filtroOperativo";
import type {
  LogisticaSuministroBuscarRequest,
  LogisticaSuministroDto,
  LogisticaSuministroInsertRequest,
  LogisticaSuministroKpis,
  LogisticaSuministroUpdateRequest,
} from "../../../models/logisticaSuministro";
import { getAuthUser } from "../../../utils/authStorage";
import { getHttpErrorMessage } from "../../../utils/httpError";
import { compressImageForUpload } from "../../../utils/imageCompression";
import { buildSharePointUrl } from "../../../utils/sharepoint";

type ColumnFilterDropdownProps = {
  header: { key: string; label: string };
  filtroColumnaMenuRef: React.RefObject<HTMLDivElement | null>;
  filtrosColumnas: Record<string, string[]>;
  setFiltrosColumnas: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  opcionesFiltroPorColumna: Record<string, string[]>;
  filtroBusqueda: string;
  setFiltroBusqueda: (value: string) => void;
};

type KpiTone = "blue" | "green" | "amber" | "red" | "violet";
type SortDirection = "asc" | "desc" | null;
type KpiIconKey =
  | "paid"
  | "reimbursed"
  | "pending"
  | "active"
  | "warning"
  | "critical"
  | "validation"
  | "recovery";

type SuministroKpiCard = {
  key: string;
  label: string;
  value: string;
  helper?: string;
  tone: KpiTone;
  icon: KpiIconKey;
};

type HeaderFilterState = {
  lookup: FiltroOperativoValue;
  fechaInicio: string;
  fechaFin: string;
};

type SuministroDraft = {
  idProvisional: string;
  filtroOperativo: FiltroOperativoValue;
  correlativo: string;
  tipoTrabajo: string;
  nombreCliente: string;
  nombreProyecto: string;
  nombreSite: string;
  fechaInicio: string;
  idAprobador: string;
  comentario: string;
  monto: string;
  idMoneda: string;
  idEnergia: string;
  idEmpresa: string;
  idEstado: string;
  montoClaro: string;
  montoCj: string;
  fechaOnAir: string;
  observacion: string;
  fechaCnx: string;
  nroSuministro: string;
  fechaEnvioEmail: string;
  fechaDesembolsoClaro: string;
  validacionCliente: string;
  ceco: string;
  cege: string;
  imagenUrl: string;
  imagenPath: string;
  esActivo: boolean | null;
  usuarioCreacion: string;
  fechaCreacion: string;
  usuarioActualizacion: string;
  fechaActualizacion: string;
};

function getFirstDayOfMonthInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

const createInitialFilters = (): HeaderFilterState => ({
  lookup: {},
  fechaInicio: getFirstDayOfMonthInputValue(),
  fechaFin: getTodayDateInputValue(),
});

function getTodayDateInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const createEmptyDraft = (): SuministroDraft => {
  const today = getTodayDateInputValue();
  return {
    idProvisional: "",
    filtroOperativo: {},
    correlativo: "",
    tipoTrabajo: "",
    nombreCliente: "",
    nombreProyecto: "",
    nombreSite: "",
    fechaInicio: today,
    idAprobador: "",
    comentario: "",
    monto: "",
    idMoneda: "",
    idEnergia: "",
    idEmpresa: "",
    idEstado: "",
    montoClaro: "",
    montoCj: "",
    fechaOnAir: "",
    observacion: "",
    fechaCnx: "",
    nroSuministro: "",
    fechaEnvioEmail: "",
    fechaDesembolsoClaro: "",
    validacionCliente: "",
    ceco: "",
    cege: "",
    imagenUrl: "",
    imagenPath: "",
    esActivo: null,
    usuarioCreacion: "",
    fechaCreacion: today,
    usuarioActualizacion: "",
    fechaActualizacion: today,
  };
};

const columns = [
  { key: "acciones", label: "Acciones", width: "110px" },
  { key: "idProvisional", label: "IdProvisional", width: "110px" },
  { key: "nombreSite", label: "Site", width: "190px" },
  { key: "fechaInicio", label: "Fecha inicio", width: "140px" },
  { key: "tarifa", label: "Tarifa", width: "150px" },
  { key: "empresa", label: "Empresa", width: "180px" },
  { key: "monto", label: "Monto", width: "120px" },
  { key: "montoClaro", label: "Monto Claro", width: "130px" },
  { key: "montoCj", label: "Monto CJ", width: "130px" },
  { key: "moneda", label: "Moneda", width: "120px" },
  { key: "fechaOnAir", label: "Fecha On Air", width: "140px" },
  { key: "fechaCnx", label: "Fecha CNX", width: "140px" },
  { key: "fechaEnvioEmail", label: "Fecha envio email", width: "160px" },
  { key: "fechaDesembolsoClaro", label: "Fecha desembolso Claro", width: "190px" },
  { key: "validacion", label: "Validación", width: "170px" },
  { key: "estadoSuministro", label: "Estado suministro", width: "180px" },
  { key: "nroSuministro", label: "Nro suministro", width: "160px" },
  { key: "ceco", label: "CECO", width: "140px" },
  { key: "cege", label: "CEGE", width: "140px" },
  { key: "nombreCliente", label: "Cliente", width: "190px" },
  { key: "nombreProyecto", label: "Proyecto", width: "190px" },
  { key: "tipoTrabajo", label: "Tipo trabajo", width: "180px" },
  { key: "comentario", label: "Comentario", width: "220px" },
  { key: "imgSustento", label: "ImgSustento", width: "220px" },
  { key: "aprobador", label: "Aprobador", width: "220px" },
] as const;

function ColumnFilterDropdown({
  header,
  filtroColumnaMenuRef,
  filtrosColumnas,
  setFiltrosColumnas,
  opcionesFiltroPorColumna,
  filtroBusqueda,
  setFiltroBusqueda,
}: ColumnFilterDropdownProps) {
  const opciones = (opcionesFiltroPorColumna[header.key] ?? []).filter((opcion) =>
    (opcion || "(Vacio)").toLowerCase().includes(filtroBusqueda.toLowerCase())
  );

  return (
    <div
      ref={filtroColumnaMenuRef}
      onClick={(event) => event.stopPropagation()}
      style={styles.columnFilter}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong style={{ fontSize: 11, color: "#17143A" }}>{header.label}</strong>
        <button
          type="button"
          onClick={() => setFiltrosColumnas((prev) => ({ ...prev, [header.key]: [] }))}
          style={styles.clearInlineButton}
        >
          Limpiar
        </button>
      </div>
      <input
        type="text"
        placeholder="Buscar opcion..."
        value={filtroBusqueda}
        onChange={(event) => setFiltroBusqueda(event.target.value)}
        style={styles.columnFilterInput}
      />
      <label style={styles.columnFilterItem}>
        <input
          type="checkbox"
          checked={(filtrosColumnas[header.key] ?? []).length === 0}
          onChange={() => setFiltrosColumnas((prev) => ({ ...prev, [header.key]: [] }))}
        />
        <span>(Todas)</span>
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {opciones.map((opcion) => {
          const seleccionadas = filtrosColumnas[header.key] ?? [];
          const checked = seleccionadas.includes(opcion);
          return (
            <label key={`${header.key}-${opcion}`} style={styles.columnFilterItem}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  setFiltrosColumnas((prev) => {
                    const actuales = prev[header.key] ?? [];
                    return {
                      ...prev,
                      [header.key]: checked
                        ? actuales.filter((item) => item !== opcion)
                        : [...actuales, opcion],
                    };
                  })
                }
              />
              <span>{opcion || "(Vacio)"}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function toNumber(value: string | number | null | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toPositiveNumber(...values: Array<string | number | null | undefined>) {
  for (const value of values) {
    if (value == null) continue;
    const parsed = Number(String(value).trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString("es-PE");
}

function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function formatPercent(value?: number | null) {
  return `${Number(value ?? 0).toLocaleString("es-PE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })}%`;
}

function normalizeDateForInput(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value).slice(0, 10);
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeColumnValue(value: unknown) {
  return String(value ?? "").trim();
}

function toDateOnlyValue(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value).slice(0, 10);
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isWithinDateRange(value?: string | null, start?: string, end?: string) {
  const dateValue = toDateOnlyValue(value);
  if (!dateValue) return false;
  if (start && dateValue < start) return false;
  if (end && dateValue > end) return false;
  return true;
}

function matchesColumnFilterValue(value: unknown, selectedValues: string[]) {
  if (!selectedValues.length) return true;
  return selectedValues.includes(normalizeColumnValue(value));
}

function getConstanteStoredValue(option: ConstanteOption) {
  return option.value || option.valor || option.codigo || option.label;
}

function normalizeLookupToken(value?: string | null) {
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

function findConstanteOption(options: ConstanteOption[], selectedValue?: string | null) {
  const normalized = normalizeLookupToken(selectedValue);
  if (!normalized) return undefined;

  return options.find((option) =>
    [option.value, option.valor, option.codigo, option.label]
      .map((value) => normalizeLookupToken(value))
      .filter(Boolean)
      .includes(normalized)
  );
}

function getSelectValue(options: ConstanteOption[], selectedValue?: string | null) {
  const match = findConstanteOption(options, selectedValue);
  return match ? getConstanteStoredValue(match) : selectedValue?.trim() ?? "";
}

function getConstanteLabel(options: ConstanteOption[], selectedValue?: string | null) {
  return findConstanteOption(options, selectedValue)?.label ?? "";
}

function normalizeText(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

function tryParsePositiveNumber(...values: Array<string | number | null | undefined>) {
  for (const value of values) {
    if (value == null) continue;
    const parsed = Number(String(value).trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function parseOptionalDecimal(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function getImageDisplayPath(path?: string | null, url?: string | null) {
  const resolved = url?.trim() || path?.trim() || "";
  if (!resolved) return "";
  if (resolved.startsWith("http")) return resolved;
  return buildSharePointUrl(resolved);
}

function sameSuministroRow(left: LogisticaSuministroDto, right: LogisticaSuministroDto) {
  const leftId = getProvisionalId(left);
  const rightId = getProvisionalId(right);

  if (leftId != null && rightId != null) {
    return Number(leftId) === Number(rightId);
  }

  return (
    String(left.idSite ?? "").trim().toLowerCase() === String(right.idSite ?? "").trim().toLowerCase() &&
    Number(left.correlativo ?? 0) === Number(right.correlativo ?? 0)
  );
}

function getProvisionalId(item: LogisticaSuministroDto) {
  return item.idSuministroProvisional ?? item.idSuministro ?? null;
}

function normalizeSuministroRow(item: LogisticaSuministroDto) {
  const raw = item as LogisticaSuministroDto & Record<string, unknown>;

  return {
    ...item,
    empresa:
      item.empresa ??
      (typeof raw.Empresa === "string" ? raw.Empresa : null) ??
      (typeof raw.empresa === "string" ? raw.empresa : null),
    nroSuministro:
      item.nroSuministro ??
      (typeof raw.NroSuministro === "string" ? raw.NroSuministro : null) ??
      (typeof raw.nroSuministro === "string" ? raw.nroSuministro : null) ??
      (typeof raw.nrosuministro === "string" ? raw.nrosuministro : null),
    estadoSuministro:
      item.estadoSuministro ??
      (typeof raw.EstadoSuministro === "string" ? raw.EstadoSuministro : null) ??
      (typeof raw.estadoSuministro === "string" ? raw.estadoSuministro : null) ??
      (typeof raw.estadosuministro === "string" ? raw.estadosuministro : null) ??
      (typeof raw.Estado === "string" ? raw.Estado : null) ??
      (typeof raw.estado === "string" ? raw.estado : null),
    validacionCliente:
      item.validacionCliente ??
      (typeof raw.ValidacionCliente === "number" ? raw.ValidacionCliente : null) ??
      (typeof raw.validacionCliente === "number" ? raw.validacionCliente : null) ??
      (typeof raw.validacioncliente === "number" ? raw.validacioncliente : null),
    validacion:
      item.validacion ??
      (typeof raw.Validacion === "string" ? raw.Validacion : null) ??
      (typeof raw.validacion === "string" ? raw.validacion : null),
    idEstado:
      item.idEstado ??
      (typeof raw.IdEstado === "number" ? raw.IdEstado : null) ??
      (typeof raw.idEstado === "number" ? raw.idEstado : null) ??
      (typeof raw.idestado === "number" ? raw.idestado : null),
    ceco:
      item.ceco ??
      (typeof raw.CECO === "string" ? raw.CECO : null) ??
      (typeof raw.ceco === "string" ? raw.ceco : null),
    cege:
      item.cege ??
      (typeof raw.CEGE === "string" ? raw.CEGE : null) ??
      (typeof raw.cege === "string" ? raw.cege : null),
  } satisfies LogisticaSuministroDto;
}

function compareTextValues(left: string, right: string, direction: Exclude<SortDirection, null>) {
  const leftValue = left.trim();
  const rightValue = right.trim();
  const result = leftValue.localeCompare(rightValue, "es", {
    sensitivity: "base",
    numeric: true,
  });

  return direction === "asc" ? result : -result;
}

function renderKpiIcon(icon: KpiIconKey, tone: KpiTone) {
  const strokeByTone: Record<KpiTone, string> = {
    blue: "#2563EB",
    green: "#16A34A",
    amber: "#F59E0B",
    red: "#DC2626",
    violet: "#8B5CF6",
  };

  const stroke = strokeByTone[tone];
  const baseProps = {
    width: 30,
    height: 30,
    viewBox: "0 0 32 32",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
  } as const;

  switch (icon) {
    case "paid":
      return (
        <svg {...baseProps}>
          <circle cx="16" cy="16" r="12.5" stroke={stroke} strokeWidth="2.5" />
          <path d="M18.9 10.9C17.9 10 16.2 9.7 14.8 10.3C13.6 10.8 12.8 12 12.8 13.2C12.8 14.5 13.8 15.5 15.8 16L16.9 16.3C18.1 16.6 19 17.1 19 18.3C19 19.5 17.9 20.6 16.2 20.7C14.8 20.8 13.4 20.2 12.5 19.2" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16 8.8V23.2" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
    case "reimbursed":
      return (
        <svg {...baseProps}>
          <path d="M8.2 13.8C8.2 10.3 11 7.5 14.5 7.5C16.7 7.5 18.7 8.6 19.9 10.4" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20.2 6.9V10.9H16.2" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M23.8 18.2C23.8 21.7 21 24.5 17.5 24.5C15.3 24.5 13.3 23.4 12.1 21.6" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M11.8 25.1V21.1H15.8" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M17.2 12.1H14.9C13.8 12.1 13 12.9 13 14C13 15.1 13.8 15.8 14.9 15.8H17.1C18.2 15.8 19 16.6 19 17.7C19 18.8 18.2 19.6 17.1 19.6H14.6" stroke={stroke} strokeWidth="2.1" strokeLinecap="round" />
        </svg>
      );
    case "pending":
      return (
        <svg {...baseProps}>
          <rect x="7" y="10" width="18" height="13.5" rx="2.8" stroke={stroke} strokeWidth="2.4" />
          <path d="M12 10V8.3C12 7 13 6 14.3 6H17.7C19 6 20 7 20 8.3V10" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="21.7" cy="20.7" r="4.6" fill="#FFF7ED" stroke={stroke} strokeWidth="2.2" />
          <path d="M21.7 18.5V21L23.3 22" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "active":
      return (
        <svg {...baseProps}>
          <path d="M13.3 9.4C13.3 7.5 14.9 6 16.8 6C18.7 6 20.3 7.5 20.3 9.4C20.3 11.3 18.7 12.9 16.8 12.9" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M11.1 13C8.8 13 7 14.8 7 17.1C7 19.4 8.8 21.2 11.1 21.2C13.3 21.2 15.1 19.4 15.1 17.1" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M21.4 13.6L25 15.7L21.4 17.9" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M19.1 21.5L15.5 19.4L19.1 17.2" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M18.5 15.8C18.8 17.3 18.4 19 17.2 20.1" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
    case "warning":
      return (
        <svg {...baseProps}>
          <path d="M16 6.8L26 24H6L16 6.8Z" fill="#FEF3C7" stroke={stroke} strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M16 12.3V18.2" stroke={stroke} strokeWidth="2.8" strokeLinecap="round" />
          <circle cx="16" cy="22" r="1.6" fill={stroke} />
        </svg>
      );
    case "critical":
      return (
        <svg {...baseProps}>
          <path d="M16 6.8L26 24H6L16 6.8Z" fill="#FEE2E2" stroke={stroke} strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M16 12.3V18.2" stroke={stroke} strokeWidth="2.8" strokeLinecap="round" />
          <circle cx="16" cy="22" r="1.6" fill={stroke} />
        </svg>
      );
    case "validation":
      return (
        <svg {...baseProps}>
          <circle cx="16" cy="16" r="12.5" fill="#DCFCE7" stroke={stroke} strokeWidth="2.2" />
          <path d="M10.8 16.4L14.1 19.7L21.6 12.3" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "recovery":
      return (
        <svg {...baseProps}>
          <path d="M7 24.5V17.5" stroke={stroke} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M13 24.5V13.5" stroke={stroke} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M19 24.5V10.5" stroke={stroke} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M25 24.5V7.5" stroke={stroke} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M7 11.5L13 8.8L18.5 11.4L25.2 5.8" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M21.8 5.8H25.4V9.3" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

function buildDraftFromRow(item: LogisticaSuministroDto): SuministroDraft {
  return {
    idProvisional: getProvisionalId(item) != null ? String(getProvisionalId(item)) : "",
    filtroOperativo: {
      filtro:
        item.idCliente && item.idProyecto && item.idSite && item.correlativo != null
          ? {
              filtroKey: `${item.idCliente}|${item.idProyecto}|${item.idSite}|${item.correlativo ?? 0}`,
              idCliente: item.idCliente,
              idProyecto: item.idProyecto,
              idSite: item.idSite,
              correlativo: item.correlativo,
              nroInterno: item.correlativo,
              nombreCliente: item.nombreCliente || "",
              nombreProyecto: item.nombreProyecto || "",
              nombreSite: item.nombreSite || "",
              tipoTrabajo: item.tipoTrabajo || "",
              ot: item.ot || "",
              fecAsignacion: null,
            }
          : undefined,
      tipoTrabajo: item.tipoTrabajo ? { tipoTrabajo: item.tipoTrabajo } : undefined,
      ot: item.ot ? { ot: item.ot, fecAsignacion: null } : undefined,
      tarea:
        item.idTarea != null
          ? { correlativo: item.idTarea, tarea: item.tarea || "" }
          : item.tarea
            ? { correlativo: 0, tarea: item.tarea }
            : undefined,
    },
    correlativo: item.correlativo ? String(item.correlativo) : "",
    tipoTrabajo: item.tipoTrabajo || "",
    nombreCliente: item.nombreCliente || "",
    nombreProyecto: item.nombreProyecto || "",
    nombreSite: item.nombreSite || "",
    fechaInicio: normalizeDateForInput(item.fechaInicio) || getTodayDateInputValue(),
    idAprobador: item.idAprobador ? String(item.idAprobador) : item.aprobador || "",
    comentario: item.comentario || "",
    monto: item.monto != null ? String(item.monto) : "",
    idMoneda: item.idMoneda != null ? String(item.idMoneda) : item.moneda || "",
    // Solo usar el id numérico si existe, nunca el label
    idEnergia: item.idEnergia != null ? String(item.idEnergia) : item.tarifa || "",
    idEmpresa: item.idEmpresa != null ? String(item.idEmpresa) : item.empresa || "",
    idEstado: item.idEstado != null ? String(item.idEstado) : item.estadoSuministro || "",
    montoClaro: item.montoClaro != null ? String(item.montoClaro) : "",
    montoCj: item.montoCj != null ? String(item.montoCj) : "",
    fechaOnAir: normalizeDateForInput(item.fechaOnAir),
    observacion: item.observacion || "",
    fechaCnx: normalizeDateForInput(item.fechaCnx),
    nroSuministro: item.nroSuministro || "",
    fechaEnvioEmail: normalizeDateForInput(item.fechaEnvioEmail),
    fechaDesembolsoClaro: normalizeDateForInput(item.fechaDesembolsoClaro),
    validacionCliente: item.validacionCliente != null ? String(item.validacionCliente) : item.validacion || "",
    ceco: item.ceco || "",
    cege: item.cege || "",
    imagenUrl: item.imagenUrl || "",
    imagenPath: item.imagenPath || "",
    esActivo: item.esActivo ?? null,
    usuarioCreacion: item.usuarioCreacion || "",
    fechaCreacion: normalizeDateForInput(item.fechaCreacion) || getTodayDateInputValue(),
    usuarioActualizacion: item.usuarioActualizacion || "",
    fechaActualizacion: normalizeDateForInput(item.fechaActualizacion) || getTodayDateInputValue(),
  };
}

function buildRowFromDraft(
  draft: SuministroDraft,
  fallback: LogisticaSuministroDto,
  aprobadorOptions: ConstanteOption[],
  monedaOptions: ConstanteOption[],
  tarifaOptions: ConstanteOption[],
  empresaOptions: ConstanteOption[],
  estadoOptions: ConstanteOption[],
  validacionOptions: ConstanteOption[]
): LogisticaSuministroDto {
  const aprobadorOption = findConstanteOption(aprobadorOptions, draft.idAprobador);
  const monedaOption = findConstanteOption(monedaOptions, draft.idMoneda);
  const tarifaOption = findConstanteOption(tarifaOptions, draft.idEnergia);
  const empresaOption = findConstanteOption(empresaOptions, draft.idEmpresa);
  const estadoOption = findConstanteOption(estadoOptions, draft.idEstado);
  const validacionOption = findConstanteOption(validacionOptions, draft.validacionCliente);
  const filtro = draft.filtroOperativo.filtro;
  const correlativo = toNumber(draft.correlativo || filtro?.correlativo);
  const idProvisional = draft.idProvisional.trim() ? Number(draft.idProvisional) : null;
  const monto = parseOptionalDecimal(draft.monto);
  const montoClaro = parseOptionalDecimal(draft.montoClaro);
  const montoCj = parseOptionalDecimal(draft.montoCj);

  return {
    ...fallback,
    idSuministroProvisional: idProvisional,
    idCliente: filtro?.idCliente ?? fallback.idCliente ?? null,
    nombreCliente: draft.nombreCliente || filtro?.nombreCliente || fallback.nombreCliente || "",
    idProyecto: filtro?.idProyecto ?? fallback.idProyecto ?? null,
    nombreProyecto: draft.nombreProyecto || filtro?.nombreProyecto || fallback.nombreProyecto || "",
    idSite: filtro?.idSite || fallback.idSite || "",
    nombreSite: draft.nombreSite || filtro?.nombreSite || fallback.nombreSite || "",
    correlativo: correlativo > 0 ? correlativo : fallback.correlativo ?? null,
    tipoTrabajo:
      draft.filtroOperativo.tipoTrabajo?.tipoTrabajo ||
      draft.tipoTrabajo ||
      filtro?.tipoTrabajo ||
      fallback.tipoTrabajo ||
      "",
    ot: draft.filtroOperativo.ot?.ot || fallback.ot || "",
    idTarea: draft.filtroOperativo.tarea?.correlativo ?? null,
    tarea: draft.filtroOperativo.tarea?.tarea || fallback.tarea || "",
    fechaInicio: draft.fechaInicio || fallback.fechaInicio || null,
    idAprobador: toNumber(draft.idAprobador) > 0 ? toNumber(draft.idAprobador) : null,
    aprobador: aprobadorOption?.label || fallback.aprobador || "",
    comentario: draft.comentario || "",
    monto: Number.isFinite(monto) ? monto : null,
    idMoneda: toNumber(draft.idMoneda) > 0 ? toNumber(draft.idMoneda) : null,
    moneda: monedaOption?.label || fallback.moneda || "",
    idEnergia: toNumber(draft.idEnergia) > 0 ? toNumber(draft.idEnergia) : null,
    tarifa: tarifaOption?.label || fallback.tarifa || "",
    idEmpresa: toNumber(draft.idEmpresa) > 0 ? toNumber(draft.idEmpresa) : null,
    empresa: empresaOption?.label || fallback.empresa || "",
    idEstado: toNumber(draft.idEstado) > 0 ? toNumber(draft.idEstado) : null,
    montoClaro: Number.isFinite(montoClaro) ? montoClaro : null,
    montoCj: Number.isFinite(montoCj) ? montoCj : null,
    fechaOnAir: draft.fechaOnAir || null,
    observacion: draft.observacion || "",
    fechaCnx: draft.fechaCnx || null,
    nroSuministro: draft.nroSuministro || "",
    estadoSuministro: estadoOption?.label || fallback.estadoSuministro || null,
    validacionCliente: toNumber(draft.validacionCliente) > 0 ? toNumber(draft.validacionCliente) : null,
    validacion: validacionOption?.label || fallback.validacion || null,
    fechaEnvioEmail: draft.fechaEnvioEmail || null,
    fechaDesembolsoClaro: draft.fechaDesembolsoClaro || null,
    ceco: draft.ceco.trim() || null,
    cege: draft.cege.trim() || null,
    imagenUrl: draft.imagenUrl || null,
    imagenPath: draft.imagenPath || null,
    fechaActualizacion: new Date().toISOString(),
  };
}

export default function SuministroPage() {
  const authUser = getAuthUser();
  const idCargo = toPositiveNumber(authUser?.idCargo, authUser?.idrol);
  const idEmpleado = toPositiveNumber(authUser?.idEmpleado, authUser?.codEmp);

  const [rows, setRows] = useState<LogisticaSuministroDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filters, setFilters] = useState<HeaderFilterState>(createInitialFilters);
  const [busqueda, setBusqueda] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [kpis, setKpis] = useState<LogisticaSuministroKpis | null>(null);
  const [kpisLoading, setKpisLoading] = useState(false);
  const [draft, setDraft] = useState<SuministroDraft>(createEmptyDraft);
  const [panelOpen, setPanelOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [filtrosColumnas, setFiltrosColumnas] = useState<Record<string, string[]>>({});
  const [columnaFiltroAbierta, setColumnaFiltroAbierta] = useState<string | null>(null);
  const [filtroBusqueda, setFiltroBusqueda] = useState("");
  const [validacionSortDirection, setValidacionSortDirection] = useState<SortDirection>(null);
  const [aprobadorOptions, setAprobadorOptions] = useState<ConstanteOption[]>([]);
  const [aprobadorLoading, setAprobadorLoading] = useState(false);
  const [aprobadorError, setAprobadorError] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState("");
  const [showImageViewer, setShowImageViewer] = useState(false);
  const filtroColumnaMenuRef = useRef<HTMLDivElement>(null);
  const lookupInputRef = useRef<HTMLInputElement | null>(null);
  const imagenInputRef = useRef<HTMLInputElement | null>(null);

  const { constantesPorCampo } = useConstantesPorCampo([
    "tipo_moneda",
    "ID_REEMBOLSO",
    "TARIFA_ENERGIA",
    "EMPRESA_ENERGIA",
    "estado_suministro",
    "ESTADO_SUMINISTRO",
  ]);
  const monedaOptions = constantesPorCampo.tipo_moneda ?? [];
  const tareaPermitidaOptions = constantesPorCampo.ID_REEMBOLSO ?? [];
  const tarifaOptions = constantesPorCampo.TARIFA_ENERGIA ?? [];
  const empresaOptions = constantesPorCampo.EMPRESA_ENERGIA ?? [];
  const estadoOptions = constantesPorCampo.estado_suministro ?? [];
  const validacionOptions = constantesPorCampo.ESTADO_SUMINISTRO ?? [];
  const imageDisplayPath = getImageDisplayPath(draft.imagenPath, draft.imagenUrl);

  const tareaPermitidaIds = useMemo(
    () =>
      new Set(
        tareaPermitidaOptions
          .map((option) => tryParsePositiveNumber(option.value, option.valor, option.codigo))
          .filter((value): value is number => value != null)
      ),
    [tareaPermitidaOptions]
  );

  const tareaPermitidaLabels = useMemo(
    () =>
      new Set(
        tareaPermitidaOptions
          .flatMap((option) => [option.label, option.value, option.valor, option.codigo])
          .map((value) => normalizeText(value))
          .filter(Boolean)
      ),
    [tareaPermitidaOptions]
  );

  const isTareaPermitida = useCallback(
    (correlativo?: number | null, tarea?: string | null) => {
      const hasIds = tareaPermitidaIds.size > 0;
      const hasLabels = tareaPermitidaLabels.size > 0;
      const normalizedLabel = normalizeText(tarea);

      if (correlativo != null && correlativo > 0 && hasIds) {
        return tareaPermitidaIds.has(correlativo);
      }

      if (normalizedLabel && hasLabels) {
        return tareaPermitidaLabels.has(normalizedLabel);
      }

      return !hasIds && !hasLabels;
    },
    [tareaPermitidaIds, tareaPermitidaLabels]
  );

  const tareaFilter = useCallback(
    (tarea: TareaOption) => isTareaPermitida(tarea.correlativo, tarea.tarea),
    [isTareaPermitida]
  );

  useEffect(() => {
    let activo = true;

    setAprobadorLoading(true);
    setAprobadorError("");

    listarSolicitanteOptions({
      idCargo: idCargo > 0 ? idCargo : null,
      idEmpleado: idEmpleado > 0 ? idEmpleado : null,
    })
      .then((data) => {
        if (!activo) return;
        setAprobadorOptions(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!activo) return;
        setAprobadorOptions([]);
        setAprobadorError("No se pudo cargar el combo de aprobadores.");
      })
      .finally(() => {
        if (!activo) return;
        setAprobadorLoading(false);
      });

    return () => {
      activo = false;
    };
  }, [idCargo, idEmpleado]);

  useEffect(() => {
    const filtro = draft.filtroOperativo.filtro;
    if (!filtro) return;

    setDraft((prev) => ({
      ...prev,
      correlativo: filtro.correlativo ? String(filtro.correlativo) : prev.correlativo,
      nombreCliente: filtro.nombreCliente || "",
      nombreProyecto: filtro.nombreProyecto || "",
      nombreSite: filtro.nombreSite || "",
      tipoTrabajo: prev.tipoTrabajo || filtro.tipoTrabajo || "",
    }));
  }, [draft.filtroOperativo.filtro]);

  useEffect(() => {
    const tareaSeleccionada = draft.filtroOperativo.tarea;
    if (!tareaSeleccionada) {
      return;
    }

    if (isTareaPermitida(tareaSeleccionada.correlativo, tareaSeleccionada.tarea)) {
      return;
    }

    setDraft((prev) => ({
      ...prev,
      filtroOperativo: {
        ...prev.filtroOperativo,
        tarea: undefined,
      },
    }));
  }, [draft.filtroOperativo.tarea, isTareaPermitida]);

  const loadKpis = useCallback(
    async (request?: Partial<LogisticaSuministroBuscarRequest>) => {
      const requestFechaInicio = request?.fechaInicio ?? filters.fechaInicio ?? null;
      const requestFechaFin = request?.fechaFin ?? filters.fechaFin ?? null;

      if (requestFechaInicio && requestFechaFin && requestFechaInicio > requestFechaFin) {
        setKpis(null);
        setKpisLoading(false);
        return;
      }

      setKpisLoading(true);

      try {
        const payload: LogisticaSuministroBuscarRequest = {
          idProvisional: request?.idProvisional ?? null,
          idCliente: request?.idCliente ?? filters.lookup.filtro?.idCliente ?? null,
          idProyecto: request?.idProyecto ?? filters.lookup.filtro?.idProyecto ?? null,
          fechaInicio: requestFechaInicio,
          fechaFin: requestFechaFin,
        };

        const data = await obtenerKpisLogisticaSuministro(payload);
        setKpis(data ?? null);
      } catch {
        setKpis(null);
      } finally {
        setKpisLoading(false);
      }
    },
    [filters.fechaFin, filters.fechaInicio, filters.lookup.filtro?.idCliente, filters.lookup.filtro?.idProyecto]
  );

  const loadData = async (request?: Partial<LogisticaSuministroBuscarRequest>) => {
    const requestFechaInicio = request?.fechaInicio ?? filters.fechaInicio ?? null;
    const requestFechaFin = request?.fechaFin ?? filters.fechaFin ?? null;

    if (requestFechaInicio && requestFechaFin && requestFechaInicio > requestFechaFin) {
      setError("La fecha inicio no puede ser mayor que la fecha fin.");
      setRows([]);
      setKpis(null);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setKpisLoading(true);
    setError("");

    try {
      const payload: LogisticaSuministroBuscarRequest = {
        idProvisional: request?.idProvisional ?? null,
        idCliente: request?.idCliente ?? filters.lookup.filtro?.idCliente ?? null,
        idProyecto: request?.idProyecto ?? filters.lookup.filtro?.idProyecto ?? null,
        fechaInicio: requestFechaInicio,
        fechaFin: requestFechaFin,
      };

      const [dataResult, kpisResult] = await Promise.allSettled([
        buscarLogisticaSuministro(payload),
        obtenerKpisLogisticaSuministro(payload),
      ]);

      if (dataResult.status !== "fulfilled") {
        throw dataResult.reason;
      }

      setRows(Array.isArray(dataResult.value) ? dataResult.value.map(normalizeSuministroRow) : []);
      setKpis(kpisResult.status === "fulfilled" ? (kpisResult.value ?? null) : null);
      setHasSearched(true);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo cargar la lista de suministros."));
      setRows([]);
      setKpis(null);
      setHasSearched(true);
    } finally {
      setLoading(false);
      setKpisLoading(false);
    }
  };

  useEffect(() => {
    if (!hasSearched) {
      return;
    }

    void loadKpis();
  }, [filters.fechaFin, filters.fechaInicio, hasSearched, loadKpis]);

  useEffect(() => {
    if (!columnaFiltroAbierta) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (filtroColumnaMenuRef.current && !filtroColumnaMenuRef.current.contains(event.target as Node)) {
        setColumnaFiltroAbierta(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [columnaFiltroAbierta]);

  const searchFields = useMemo<CrudToolbarSearchField<LogisticaSuministroDto>[]>(
    () => [
      { key: "idProvisional", label: "IdProvisional", getValue: (item) => getProvisionalId(item) },
      { key: "nombreSite", label: "Site", getValue: (item) => item.nombreSite },
      { key: "fechaInicio", label: "Fecha inicio", getValue: (item) => item.fechaInicio },
      { key: "tarifa", label: "Tarifa", getValue: (item) => item.tarifa },
      { key: "monto", label: "Monto", getValue: (item) => item.monto },
      { key: "montoClaro", label: "Monto Claro", getValue: (item) => item.montoClaro },
      { key: "montoCj", label: "Monto CJ", getValue: (item) => item.montoCj },
      { key: "moneda", label: "Moneda", getValue: (item) => item.moneda },
      { key: "empresa", label: "Empresa", getValue: (item) => item.empresa },
      { key: "fechaOnAir", label: "Fecha On Air", getValue: (item) => item.fechaOnAir },
      { key: "fechaCnx", label: "Fecha CNX", getValue: (item) => item.fechaCnx },
      { key: "fechaEnvioEmail", label: "Fecha envio email", getValue: (item) => item.fechaEnvioEmail },
      { key: "fechaDesembolsoClaro", label: "Fecha desembolso Claro", getValue: (item) => item.fechaDesembolsoClaro },
      { key: "estadoSuministro", label: "Estado suministro", getValue: (item) => item.estadoSuministro },
      { key: "nroSuministro", label: "Nro suministro", getValue: (item) => item.nroSuministro },
      { key: "ceco", label: "CECO", getValue: (item) => item.ceco },
      { key: "cege", label: "CEGE", getValue: (item) => item.cege },
      { key: "validacion", label: "Validación", getValue: (item) => item.validacion },
      { key: "nombreCliente", label: "Cliente", getValue: (item) => item.nombreCliente },
      { key: "nombreProyecto", label: "Proyecto", getValue: (item) => item.nombreProyecto },
      { key: "tipoTrabajo", label: "Tipo trabajo", getValue: (item) => item.tipoTrabajo },
      { key: "comentario", label: "Comentario", getValue: (item) => item.comentario },
      { key: "imgSustento", label: "ImgSustento", getValue: (item) => item.imagenPath || item.imagenUrl },
      { key: "aprobador", label: "Aprobador", getValue: (item) => item.aprobador },
    ],
    []
  );

  const getColumnValue = (item: LogisticaSuministroDto, key: string) => {
    switch (key) {
      case "idProvisional":
        return String(getProvisionalId(item) ?? "");
      case "fechaInicio":
      case "fechaOnAir":
      case "fechaCnx":
      case "fechaEnvioEmail":
      case "fechaDesembolsoClaro":
      case "fechaCreacion":
      case "fechaActualizacion":
      case "fechaEliminacion":
        return formatDate((item as Record<string, string | null | undefined>)[key]);
      case "imgSustento": {
        const fullPath = getImageDisplayPath(item.imagenPath, item.imagenUrl);
        if (!fullPath) {
          return <span style={{ color: '#888' }}>No existe enlace</span>;
        }
        return (
          <button
            type="button"
            style={{ cursor: "pointer", padding: 4, borderRadius: 4, border: '1px solid #1976d2', background: '#1976d2', color: '#fff', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title={fullPath}
            onClick={() => window.open(fullPath, '_blank')}
          >
            {/* Icono de enlace (SVG) */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 1 7 7l-3 3a5 5 0 0 1-7-7"/><path d="M14 11a5 5 0 0 0-7-7l-3 3a5 5 0 0 0 7 7"/></svg>
          </button>
        );
      }
      case "monto":
        return item.monto == null ? "" : String(item.monto);
      case "montoClaro":
        return item.montoClaro == null ? "" : String(item.montoClaro);
      case "montoCj":
        return item.montoCj == null ? "" : String(item.montoCj);
      case "esActivo":
        return item.esActivo == null ? "" : item.esActivo ? "Activo" : "Inactivo";
      default:
        return String((item as Record<string, unknown>)[key] ?? "");
    }
  };

  const filteredRows = useMemo(() => {
    const result = rows
      .filter((item) =>
        isWithinDateRange(item.fechaInicio, filters.fechaInicio || undefined, filters.fechaFin || undefined)
      )
      .filter((item) => matchesCrudToolbarSearch(item, busqueda, searchFields))
      .filter((item) =>
        searchFields.every((field) =>
          matchesColumnFilterValue(getColumnValue(item, field.key), filtrosColumnas[field.key] ?? [])
        )
      );

    if (!validacionSortDirection) {
      return result;
    }

    return [...result].sort((left, right) =>
      compareTextValues(left.validacion ?? "", right.validacion ?? "", validacionSortDirection)
    );
  }, [
    busqueda,
    filtrosColumnas,
    filters.fechaFin,
    filters.fechaInicio,
    rows,
    searchFields,
    validacionSortDirection,
  ]);

  const opcionesFiltroPorColumna = useMemo(() => {
    const result: Record<string, string[]> = {};
    searchFields.forEach((field) => {
      result[field.key] = Array.from(
        new Set(rows.map((item) => normalizeColumnValue(getColumnValue(item, field.key))))
      ).sort((left, right) => left.localeCompare(right, "es", { sensitivity: "base" }));
    });
    return result;
  }, [rows, searchFields]);

  const kpiCards = useMemo<SuministroKpiCard[]>(
    () => [
      {
        key: "totalPagadoMes",
        label: "Total pagado en el mes",
        value: formatCurrency(kpis?.totalPagadoMes),
        tone: "blue",
        icon: "paid",
      },
      {
        key: "totalReembolsadoMes",
        label: "Total reembolsado en el mes",
        value: formatCurrency(kpis?.totalReembolsadoMes),
        tone: "green",
        icon: "reimbursed",
      },
      {
        key: "saldoPendienteReembolso",
        label: "Saldo pendiente de reembolso",
        value: formatCurrency(kpis?.saldoPendienteReembolso),
        tone: "amber",
        icon: "pending",
      },
      {
        key: "suministrosProvisionalesActivos",
        label: "Sus. provisionales activos",
        value: String(kpis?.suministrosProvisionalesActivos ?? 0),
        helper: "casos",
        tone: "violet",
        icon: "active",
      },
      {
        key: "casosRiesgoMedio",
        label: "> 60 dias (riesgo medio)",
        value: String(kpis?.casosRiesgoMedio ?? 0),
        helper: "casos",
        tone: "amber",
        icon: "warning",
      },
      {
        key: "casosRiesgoCritico",
        label: "> 90 dias (riesgo critico)",
        value: String(kpis?.casosRiesgoCritico ?? 0),
        helper: "casos",
        tone: "red",
        icon: "critical",
      },
      {
        key: "porcentajePagosValidacionPrevia",
        label: "% pagos con validacion previa del cliente",
        value: formatPercent(kpis?.porcentajePagosValidacionPrevia),
        tone: "green",
        icon: "validation",
      },
      {
        key: "indiceRecupero",
        label: "Indice de recupero (IRP)",
        value: formatPercent(kpis?.indiceRecupero),
        helper: "reembolsado / pagado",
        tone: "blue",
        icon: "recovery",
      },
    ],
    [kpis]
  );

  const handleNuevo = () => {
    setDraft(createEmptyDraft());
    setIsEditMode(false);
    setPanelOpen(true);
    setMessage("");
    setImageUploadError("");
    setShowImageViewer(false);
    setTimeout(() => lookupInputRef.current?.focus(), 0);
  };

  const handleEditar = (row: LogisticaSuministroDto) => {
    setDraft(buildDraftFromRow(row));
    setIsEditMode(true);
    setPanelOpen(true);
    setMessage("");
    setImageUploadError("");
    setShowImageViewer(false);
  };

  const handleImageSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setUploadingImage(true);
    setImageUploadError("");

    try {
      const optimizedFile = await compressImageForUpload(file);
      const response = await uploadImagenLogisticaSuministro(optimizedFile, {
        correlativo: draft.correlativo,
        idSite: draft.filtroOperativo.filtro?.idSite,
        comentario: draft.comentario,
      });

      setDraft((prev) => ({
        ...prev,
        imagenUrl: response.fileUrl || "",
        imagenPath: response.storagePath || response.fileUrl || "",
      }));
    } catch (err) {
      setImageUploadError(getHttpErrorMessage(err, "No se pudo cargar la imagen en SharePoint."));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleGuardar = async () => {
    setError("");
    setMessage("");

    const filtro = draft.filtroOperativo.filtro;
    const correlativo = toNumber(draft.correlativo || filtro?.correlativo);
    const monto = parseOptionalDecimal(draft.monto);
    const montoClaro = parseOptionalDecimal(draft.montoClaro);
    const montoCj = parseOptionalDecimal(draft.montoCj);

    if (!filtro?.idCliente) {
      setError("Cliente es obligatorio.");
      return;
    }

    if (!filtro?.idProyecto) {
      setError("Proyecto es obligatorio.");
      return;
    }

    if (!filtro?.idSite) {
      setError("Site es obligatorio.");
      return;
    }

    if (draft.monto.trim() && (!Number.isFinite(monto) || (monto ?? 0) < 0)) {
      setError("Monto invalido.");
      return;
    }

    if (draft.montoClaro.trim() && (!Number.isFinite(montoClaro) || (montoClaro ?? 0) < 0)) {
      setError("Monto Claro invalido.");
      return;
    }

    if (draft.montoCj.trim() && (!Number.isFinite(montoCj) || (montoCj ?? 0) < 0)) {
      setError("Monto CJ invalido.");
      return;
    }

    setSaving(true);
    try {
      const resolvedTipoTrabajo =
        draft.filtroOperativo.tipoTrabajo?.tipoTrabajo?.trim() ||
        draft.tipoTrabajo.trim() ||
        filtro.tipoTrabajo?.trim() ||
        null;
      const resolvedOt = draft.filtroOperativo.ot?.ot?.trim() || null;
      const resolvedIdTarea =
        draft.filtroOperativo.tarea?.correlativo && draft.filtroOperativo.tarea.correlativo > 0
          ? draft.filtroOperativo.tarea.correlativo
          : null;
      const resolvedIdMoneda = toNumber(draft.idMoneda) > 0 ? toNumber(draft.idMoneda) : null;
      const currentEditingRow = rows.find((row) =>
        sameSuministroRow(row, {
          idSuministroProvisional: draft.idProvisional.trim() ? Number(draft.idProvisional) : null,
          idSite: filtro.idSite,
          correlativo: correlativo > 0 ? correlativo : null,
        })
      );

      if (isEditMode) {
        const updatePayload: LogisticaSuministroUpdateRequest = {
          idProvisional: draft.idProvisional.trim() ? Number(draft.idProvisional) : null,
          idCliente: filtro.idCliente,
          idProyecto: filtro.idProyecto,
          idSite: filtro.idSite,
          correlativo: correlativo > 0 ? correlativo : null,
          tipoTrabajo: resolvedTipoTrabajo,
          ot: resolvedOt,
          idTarea: resolvedIdTarea,
          fechaInicio: draft.fechaInicio || null,
          idAprobador: toNumber(draft.idAprobador) > 0 ? toNumber(draft.idAprobador) : null,
          comentario: draft.comentario.trim() || null,
          monto,
          idMoneda: resolvedIdMoneda,
          idEnergia: toNumber(draft.idEnergia) > 0 ? toNumber(draft.idEnergia) : null,
          idEmpresa: toNumber(draft.idEmpresa) > 0 ? toNumber(draft.idEmpresa) : null,
          idEstado: toNumber(draft.idEstado) > 0 ? toNumber(draft.idEstado) : null,
          montoClaro: Number.isFinite(montoClaro) ? montoClaro : null,
          montoCj: Number.isFinite(montoCj) ? montoCj : null,
          fechaOnAir: draft.fechaOnAir || null,
          observacion: draft.observacion.trim() || null,
          fechaCnx: draft.fechaCnx || null,
          nroSuministro: draft.nroSuministro.trim() || null,
          fechaEnvioEmail: draft.fechaEnvioEmail || null,
          fechaDesembolsoClaro: draft.fechaDesembolsoClaro || null,
          validacionCliente: toNumber(draft.validacionCliente) > 0 ? toNumber(draft.validacionCliente) : null,
          ceco: draft.ceco.trim() || null,
          cege: draft.cege.trim() || null,
          imagenUrl: draft.imagenUrl || null,
          imagenPath: draft.imagenPath || null,
        };

        await actualizarLogisticaSuministro(updatePayload);
        const updatedRow = buildRowFromDraft(
          draft,
          currentEditingRow ?? {},
          aprobadorOptions,
          monedaOptions,
          tarifaOptions,
          empresaOptions,
          estadoOptions,
          validacionOptions
        );
        setRows((prev) =>
          prev.map((row) =>
            sameSuministroRow(row, updatedRow)
              ? {
                  ...row,
                  ...updatedRow,
                }
              : row
          )
        );
        setMessage("Suministro actualizado correctamente.");
      } else {
        const insertPayload: LogisticaSuministroInsertRequest = {
          idCliente: filtro.idCliente,
          idProyecto: filtro.idProyecto,
          idSite: filtro.idSite,
          correlativo: correlativo > 0 ? correlativo : null,
          tipoTrabajo: resolvedTipoTrabajo,
          ot: resolvedOt,
          idTarea: resolvedIdTarea,
          fechaInicio: draft.fechaInicio || null,
          idAprobador: toNumber(draft.idAprobador) > 0 ? toNumber(draft.idAprobador) : null,
          comentario: draft.comentario.trim() || null,
          monto,
          idMoneda: resolvedIdMoneda,
          idEnergia: toNumber(draft.idEnergia) > 0 ? toNumber(draft.idEnergia) : null,
          idEmpresa: toNumber(draft.idEmpresa) > 0 ? toNumber(draft.idEmpresa) : null,
          idEstado: toNumber(draft.idEstado) > 0 ? toNumber(draft.idEstado) : null,
          montoClaro: Number.isFinite(montoClaro) ? montoClaro : null,
          montoCj: Number.isFinite(montoCj) ? montoCj : null,
          fechaOnAir: draft.fechaOnAir || null,
          observacion: draft.observacion.trim() || null,
          fechaCnx: draft.fechaCnx || null,
          nroSuministro: draft.nroSuministro.trim() || null,
          fechaEnvioEmail: draft.fechaEnvioEmail || null,
          fechaDesembolsoClaro: draft.fechaDesembolsoClaro || null,
          validacionCliente: toNumber(draft.validacionCliente) > 0 ? toNumber(draft.validacionCliente) : null,
          ceco: draft.ceco.trim() || null,
          cege: draft.cege.trim() || null,
          imagenUrl: draft.imagenUrl || null,
          imagenPath: draft.imagenPath || null,
        };

        await insertarLogisticaSuministro(insertPayload);
        setMessage("Suministro registrado correctamente.");
      }

      setPanelOpen(false);
      setDraft(createEmptyDraft());
      if (!isEditMode) {
        await loadData();
      }
    } catch (err) {
      setError(getHttpErrorMessage(err, isEditMode
        ? "No se pudo actualizar el suministro."
        : "No se pudo registrar el suministro."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.page}>
      {error ? <div style={styles.errorBanner}>{error}</div> : null}
      {message ? <div style={styles.successBanner}>{message}</div> : null}

      <section style={styles.card}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Suministro logistico</h2>
            <p style={styles.sectionText}>
              Consulta, alta y actualizacion de suministro provisional siguiendo el patron operativo actual.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", flex: 1, minWidth: 320 }}>
              <Field label="Fecha inicio">
                <input
                  type="date"
                  value={filters.fechaInicio}
                  onChange={(event) => setFilters((prev) => ({ ...prev, fechaInicio: event.target.value }))}
                  style={{ ...styles.input, width: 140, minWidth: 140 }}
                />
              </Field>
              <Field label="Fecha fin">
                <input
                  type="date"
                  value={filters.fechaFin}
                  onChange={(event) => setFilters((prev) => ({ ...prev, fechaFin: event.target.value }))}
                  style={{ ...styles.input, width: 140, minWidth: 140 }}
                />
              </Field>
              <div style={{ flex: 1, minWidth: 260, maxWidth: 500 }}>
              <CrudToolbar
                searchPlaceholder="Buscar suministro..."
                searchValue={busqueda}
                onSearchChange={setBusqueda}
                inputStyle={{ width: "100%", minWidth: 280, fontSize: 18, padding: "8px 12px" }}
              />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => {
                  setFilters(createInitialFilters());
                  setBusqueda("");
                  setFiltrosColumnas({});
                  setValidacionSortDirection(null);
                  setRows([]);
                  setKpis(null);
                  setKpisLoading(false);
                  setHasSearched(false);
                }}
              >
                Limpiar
              </button>
              <button type="button" style={styles.primaryButton} onClick={() => void loadData()}>
                Buscar
              </button>
              <button type="button" style={styles.primaryButton} onClick={handleNuevo}>
                Nuevo
              </button>
            </div>
          </div>
        </div>

        <div style={styles.kpiSection}>
          <div style={styles.kpiSectionHeader}>
            <h3 style={styles.kpiTitle}></h3>
            <span style={styles.kpiCaption}>
              {kpisLoading
                ? "Actualizando indicadores..."
                : hasSearched
                  ? "Indicadores del filtro consultado"
                  : "Los KPIs se cargan al presionar Buscar"}
            </span>
          </div>
          <div style={styles.kpiScroller}>
            {kpiCards.map((item) => (
              <button
                key={item.key}
                type="button"
                style={{
                  ...styles.kpiButton,
                  ...kpiToneStyles[item.tone],
                  ...(kpisLoading ? styles.kpiButtonLoading : {}),
                }}
              >
                <div style={{ ...styles.kpiIconWrap, ...kpiIconToneStyles[item.tone] }}>
                  {renderKpiIcon(item.icon, item.tone)}
                </div>
                <div style={styles.kpiContent}>
                  <span style={styles.kpiLabel}>{item.label}</span>
                  <strong style={styles.kpiValue}>{kpisLoading ? "..." : item.value}</strong>
                  {item.helper ? <span style={styles.kpiHelper}>{item.helper}</span> : null}
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section style={styles.card}>
        <div style={styles.segmentHeader}>
          <div>
            <h3 style={styles.subTitle}>Suministros encontrados</h3>
            <p style={styles.sectionText}>Listado principal con filtros por columna y acceso directo a edicion.</p>
          </div>
          <div style={styles.counterPill}>{filteredRows.length} registros</div>
        </div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {columns.map((header) => (
                  <th key={header.key} style={{ ...styles.th, width: header.width }}>
                    <div style={styles.thContent}>
                      <span>{header.label}</span>
                      {header.key !== "acciones" ? (
                        <div style={styles.thActions}>
                          {header.key === "validacion" ? (
                            <button
                              type="button"
                              style={styles.filterButton}
                              onClick={(event) => {
                                event.stopPropagation();
                                setValidacionSortDirection((prev) =>
                                  prev === null ? "asc" : prev === "asc" ? "desc" : null
                                );
                              }}
                            >
                              {validacionSortDirection === "asc"
                                ? "A-Z"
                                : validacionSortDirection === "desc"
                                  ? "Z-A"
                                  : "Ordenar"}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            style={styles.filterButton}
                            onClick={(event) => {
                              event.stopPropagation();
                              setColumnaFiltroAbierta((prev) => (prev === header.key ? null : header.key));
                              setFiltroBusqueda("");
                            }}
                          >
                            Filtrar
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {columnaFiltroAbierta === header.key && header.key !== "acciones" ? (
                      <ColumnFilterDropdown
                        header={header}
                        filtroColumnaMenuRef={filtroColumnaMenuRef}
                        filtrosColumnas={filtrosColumnas}
                        setFiltrosColumnas={setFiltrosColumnas}
                        opcionesFiltroPorColumna={opcionesFiltroPorColumna}
                        filtroBusqueda={filtroBusqueda}
                        setFiltroBusqueda={setFiltroBusqueda}
                      />
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length} style={styles.emptyCell}>Cargando suministros...</td>
                </tr>
              ) : !hasSearched ? (
                <tr>
                  <td colSpan={columns.length} style={styles.emptyCell}>Seleccione filtros y presione Buscar para listar suministros.</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} style={styles.emptyCell}>No hay datos para mostrar.</td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={`${getProvisionalId(row) ?? row.correlativo ?? "sin-id"}-${row.idSite ?? "sin-site"}`} style={styles.tr}>
                    <td style={styles.td}>
                      <button type="button" style={styles.smallActionButton} onClick={() => handleEditar(row)}>
                        Editar
                      </button>
                    </td>
                    {columns.filter((item) => item.key !== "acciones").map((column) => (
                      <td
                        key={`${row.correlativo ?? "sin-correlativo"}-${column.key}`}
                        style={styles.td}
                      >
                        {column.key === "nombreSite" ? (
                          <span style={styles.siteCell} title={row.nombreSite ?? undefined}>
                            {row.nombreSite}
                          </span>
                        ) : (
                          getColumnValue(row, column.key)
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {panelOpen ? (
        <div style={styles.sidePanelOverlay}>
          <div style={{ ...styles.card, ...styles.sidePanel }}>
            <div style={styles.sectionHeader}>
              <div>
                <h2 style={styles.sectionTitle}>
                  {isEditMode ? `Editar suministro #${draft.idProvisional || "-"}` : "Nuevo suministro"}
                </h2>
                <p style={styles.sectionText}>
                  {isEditMode
                    ? "Actualizacion del suministro provisional con el store dedicado."
                    : "Registro de nuevo suministro provisional para el cliente."}
                </p>
                <p style={{ ...styles.sectionText, fontSize: 12, color: "#475569" }}>
                  El sistema registra auditoria automatica por seccion al guardar cambios.
                </p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" style={styles.secondaryButton} onClick={() => setPanelOpen(false)}>
                  Cerrar
                </button>
                <button type="button" style={styles.primaryButton} onClick={() => void handleGuardar()} disabled={saving}>
                  {isEditMode ? (saving ? "Actualizando..." : "Actualizar") : saving ? "Guardando..." : "Guardar"}
                </button>
                <button type="button" style={styles.primaryButton} onClick={() => alert('Alta suministro')}>
                  Alta suministro
                </button>
              </div>
            </div>

            <div style={styles.innerSection}>
              <div style={{ gridColumn: "span 2" }}>
                <Label>Cliente / Proyecto / Site</Label>
                <FiltroOperativoLookup
                  value={draft.filtroOperativo}
                  onChange={(value) => setDraft((prev) => ({ ...prev, filtroOperativo: value }))}
                  tareaFilter={tareaFilter}
                  tareaInputMode="select"
                  filtroInputRef={lookupInputRef}
                />
              </div>

              <div style={styles.formGrid}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr",
                  gap: 28,
                  width: "100%"
                }}>
                  <Field label="IdAprobador">
                    <select
                      value={getSelectValue(aprobadorOptions, draft.idAprobador)}
                      onChange={(event) => setDraft((prev) => ({ ...prev, idAprobador: event.target.value }))}
                      style={{ ...styles.input, width: "100%", minWidth: 220, maxWidth: 600 }}
                      disabled={aprobadorLoading}
                    >
                      <option value="">{aprobadorLoading ? "Cargando..." : "Seleccione"}</option>
                      {aprobadorOptions.map((option, index) => (
                        <option key={`aprobador-${getConstanteStoredValue(option)}-${index}`} value={getConstanteStoredValue(option)}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Monto">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.monto}
                      onChange={(event) => setDraft((prev) => ({ ...prev, monto: event.target.value }))}
                      style={{ ...styles.input, width: "100%", minWidth: 60, maxWidth: 110 }}
                    />
                  </Field>
                  <Field label="IdMoneda">
                    <select
                      value={getSelectValue(monedaOptions, draft.idMoneda)}
                      onChange={(event) => setDraft((prev) => ({ ...prev, idMoneda: event.target.value }))}
                      style={{ ...styles.input, width: "100%", minWidth: 60, maxWidth: 110 }}
                    >
                      <option value="">{monedaOptions.length === 0 ? "Cargando..." : "Seleccione"}</option>
                      {monedaOptions.map((option, index) => (
                        <option key={`moneda-${getConstanteStoredValue(option)}-${index}`} value={getConstanteStoredValue(option)}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Fecha inicio">
                    <input
                      type="date"
                      value={draft.fechaInicio}
                      onChange={(event) => setDraft((prev) => ({ ...prev, fechaInicio: event.target.value }))}
                      style={{ ...styles.input, width: "100%", minWidth: 90, maxWidth: 130 }}
                    />
                  </Field>
                </div>

                <div style={{ ...styles.formRow, gridTemplateColumns: "repeat(5, minmax(160px, 1fr))" }}>
                  <Field label="Tarifa energia">
                    <select
                      value={getSelectValue(tarifaOptions, draft.idEnergia)}
                      onChange={(event) => setDraft((prev) => ({ ...prev, idEnergia: event.target.value }))}
                      style={styles.input}
                    >
                      <option value="">{tarifaOptions.length === 0 ? "Cargando..." : "Seleccione"}</option>
                      {tarifaOptions.map((option, index) => (
                        <option key={`tarifa-${getConstanteStoredValue(option)}-${index}`} value={getConstanteStoredValue(option)}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Empresa energia">
                    <select
                      value={getSelectValue(empresaOptions, draft.idEmpresa)}
                      onChange={(event) => setDraft((prev) => ({ ...prev, idEmpresa: event.target.value }))}
                      style={styles.input}
                    >
                      <option value="">{empresaOptions.length === 0 ? "Cargando..." : "Seleccione"}</option>
                      {empresaOptions.map((option, index) => (
                        <option key={`empresa-${getConstanteStoredValue(option)}-${index}`} value={getConstanteStoredValue(option)}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Monto Claro">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.montoClaro}
                      onChange={(event) => setDraft((prev) => ({ ...prev, montoClaro: event.target.value }))}
                      style={styles.input}
                    />
                  </Field>
                  <Field label="Monto CJ">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.montoCj}
                      onChange={(event) => setDraft((prev) => ({ ...prev, montoCj: event.target.value }))}
                      style={styles.input}
                    />
                  </Field>
                  <Field label="Nro suministro">
                    <input
                      value={draft.nroSuministro}
                      onChange={(event) => setDraft((prev) => ({ ...prev, nroSuministro: event.target.value }))}
                      style={styles.input}
                    />
                  </Field>
                </div>

                <div style={styles.formRow}>
                  <Field label="Fecha envio email">
                    <input
                      type="date"
                      value={draft.fechaEnvioEmail}
                      onChange={(event) => setDraft((prev) => ({ ...prev, fechaEnvioEmail: event.target.value }))}
                      style={styles.input}
                    />
                  </Field>
                  <Field label="Fecha desembolso Claro">
                    <input
                      type="date"
                      value={draft.fechaDesembolsoClaro}
                      onChange={(event) => setDraft((prev) => ({ ...prev, fechaDesembolsoClaro: event.target.value }))}
                      style={styles.input}
                    />
                  </Field>
                  <Field label="Fecha On Air">
                    <input
                      type="date"
                      value={draft.fechaOnAir}
                      onChange={(event) => setDraft((prev) => ({ ...prev, fechaOnAir: event.target.value }))}
                      style={styles.input}
                    />
                  </Field>
                  <Field label="Fecha CNX">
                    <input
                      type="date"
                      value={draft.fechaCnx}
                      onChange={(event) => setDraft((prev) => ({ ...prev, fechaCnx: event.target.value }))}
                      style={styles.input}
                    />
                  </Field>
                </div>

                <div style={styles.formRow}>
                  <Field label="Estado suministro">
                    <select
                      value={getSelectValue(estadoOptions, draft.idEstado)}
                      onChange={(event) => setDraft((prev) => ({ ...prev, idEstado: event.target.value }))}
                      style={styles.input}
                    >
                      <option value="">{estadoOptions.length === 0 ? "Cargando..." : "Seleccione"}</option>
                      {estadoOptions.map((option, index) => (
                        <option key={`estado-${getConstanteStoredValue(option)}-${index}`} value={getConstanteStoredValue(option)}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Validacion cliente">
                    <select
                      value={getSelectValue(validacionOptions, draft.validacionCliente)}
                      onChange={(event) => setDraft((prev) => ({ ...prev, validacionCliente: event.target.value }))}
                      style={styles.input}
                    >
                      <option value="">{validacionOptions.length === 0 ? "Cargando..." : "Seleccione"}</option>
                      {validacionOptions.map((option, index) => (
                        <option key={`validacion-${getConstanteStoredValue(option)}-${index}`} value={getConstanteStoredValue(option)}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="CECO">
                    <input
                      value={draft.ceco}
                      onChange={(event) => setDraft((prev) => ({ ...prev, ceco: event.target.value }))}
                      style={styles.input}
                    />
                  </Field>
                  <Field label="CEGE">
                    <input
                      value={draft.cege}
                      onChange={(event) => setDraft((prev) => ({ ...prev, cege: event.target.value }))}
                      style={styles.input}
                    />
                  </Field>
                  <Field label="Comentario">
                    <textarea
                      value={draft.comentario}
                      onChange={(event) => setDraft((prev) => ({ ...prev, comentario: event.target.value }))}
                      style={styles.textarea}
                      rows={4}
                    />
                  </Field>
                  <Field label="Observacion">
                    <textarea
                      value={draft.observacion}
                      onChange={(event) => setDraft((prev) => ({ ...prev, observacion: event.target.value }))}
                      style={styles.textarea}
                      rows={4}
                    />
                  </Field>
                  <Field label="Imagen">
                    <div style={styles.uploadWrap}>
                      <input
                        ref={imagenInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(event) => void handleImageSelected(event)}
                        style={{ display: "none" }}
                      />
                      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                        <button
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            cursor: uploadingImage ? "wait" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            height: 36,
                            opacity: uploadingImage ? 0.7 : 1,
                          }}
                          title="Cargar imagen"
                          type="button"
                          disabled={uploadingImage}
                          onClick={() => imagenInputRef.current?.click()}
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
                            color: imageDisplayPath ? "#374151" : "#6B7280",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            cursor: imageDisplayPath ? "pointer" : "default",
                            textDecoration: imageDisplayPath ? "underline" : "none",
                          }}
                          title={imageDisplayPath || "Sin factura cargada"}
                          onClick={() => {
                            if (imageDisplayPath) setShowImageViewer(true);
                          }}
                        >
                          {uploadingImage
                            ? "Cargando imagen en SharePoint..."
                            : imageDisplayPath || "Sin factura cargada"}
                        </div>
                      </div>
                      {showImageViewer && imageDisplayPath ? (
                        <div
                          style={styles.viewerOverlay}
                          onClick={() => setShowImageViewer(false)}
                        >
                          <div
                            style={styles.viewerCard}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button
                              type="button"
                              style={styles.viewerCloseButton}
                              onClick={() => setShowImageViewer(false)}
                              title="Cerrar"
                            >
                              x
                            </button>
                            <img src={imageDisplayPath} alt="Imagen adjunta" style={styles.viewerImage} />
                          </div>
                        </div>
                      ) : null}
                      {imageUploadError ? <span style={styles.errorText}>{imageUploadError}</span> : null}
                    </div>
                  </Field>
                </div>
              </div>

              {aprobadorError ? <span style={styles.errorText}>{aprobadorError}</span> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>{children}</label>;
}

const kpiToneStyles: Record<KpiTone, React.CSSProperties> = {
  blue: { background: "linear-gradient(180deg, #FFFFFF 0%, #EFF6FF 100%)" },
  green: { background: "linear-gradient(180deg, #FFFFFF 0%, #F0FDF4 100%)" },
  amber: { background: "linear-gradient(180deg, #FFFFFF 0%, #FFF7ED 100%)" },
  red: { background: "linear-gradient(180deg, #FFFFFF 0%, #FEF2F2 100%)" },
  violet: { background: "linear-gradient(180deg, #FFFFFF 0%, #F5F3FF 100%)" },
};

const kpiIconToneStyles: Record<KpiTone, React.CSSProperties> = {
  blue: { background: "#DBEAFE", color: "#1D4ED8" },
  green: { background: "#DCFCE7", color: "#16A34A" },
  amber: { background: "#FED7AA", color: "#EA580C" },
  red: { background: "#FECACA", color: "#DC2626" },
  violet: { background: "#E9D5FF", color: "#7C3AED" },
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    width: "100%",
  },
  card: {
    background: "#FFFFFF",
    borderRadius: 18,
    padding: 12,
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
    flexWrap: "wrap",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    color: "#0F172A",
  },
  sectionText: {
    margin: "4px 0 0",
    fontSize: 12,
    color: "#64748B",
  },
  subTitle: {
    margin: 0,
    fontSize: 16,
    color: "#0F172A",
  },
  segmentHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  counterPill: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "#F1F5F9",
    fontSize: 12,
    color: "#334155",
    fontWeight: 700,
  },
  formGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  formRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
    alignItems: "start",
  },
  kpiSection: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginTop: 6,
  },
  kpiSectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  kpiTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
    color: "#0F172A",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  kpiCaption: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: 600,
  },
  kpiScroller: {
    display: "grid",
    gridTemplateColumns: "repeat(8, minmax(210px, 1fr))",
    gap: 12,
    overflowX: "auto",
    paddingBottom: 4,
  },
  kpiButton: {
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    minHeight: 132,
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    gap: 14,
    textAlign: "left",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
    cursor: "default",
  },
  kpiButtonLoading: {
    opacity: 0.78,
  },
  kpiIconWrap: {
    width: 46,
    height: 46,
    minWidth: 46,
    borderRadius: 999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.7)",
    overflow: "hidden",
  },
  kpiContent: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: 800,
    color: "#334155",
    lineHeight: 1.35,
    textTransform: "uppercase",
  },
  kpiValue: {
    fontSize: 19,
    color: "#172554",
    lineHeight: 1.1,
  },
  kpiHelper: {
    fontSize: 12,
    color: "#475569",
    fontWeight: 700,
  },
  input: {
    width: "100%",
    height: 34,
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    padding: "0 10px",
    fontSize: 12,
    background: "#FFFFFF",
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    padding: "10px",
    fontSize: 12,
    background: "#FFFFFF",
    boxSizing: "border-box",
    resize: "vertical",
    minHeight: 88,
  },
  readOnlyInput: {
    width: "100%",
    height: 34,
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    padding: "0 10px",
    fontSize: 12,
    background: "#F8FAFC",
    color: "#475569",
    boxSizing: "border-box",
  },
  primaryButton: {
    border: "none",
    background: "#5B43D6",
    color: "#FFFFFF",
    borderRadius: 10,
    padding: "10px 16px",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#334155",
    borderRadius: 10,
    padding: "10px 16px",
    fontWeight: 700,
    cursor: "pointer",
  },
  smallActionButton: {
    border: "1px solid #BFDBFE",
    background: "#EFF6FF",
    color: "#1D4ED8",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  },
  tableWrap: {
    overflowX: "scroll",
    overflowY: "scroll",
    border: "1px solid #E2E8F0",
    borderRadius: 14,
    maxHeight: 420,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 1650,
    tableLayout: "fixed",
  },
  th: {
    position: "sticky",
    top: 0,
    textAlign: "left",
    padding: "7px 10px",
    borderBottom: "1px solid #E2E8F0",
    background: "#F8FAFC",
    fontSize: 12,
    color: "#334155",
    whiteSpace: "nowrap",
    zIndex: 5,
  },
  td: {
    padding: "7px 10px",
    borderBottom: "1px solid #EDF2F7",
    fontSize: 12,
    color: "#0F172A",
    verticalAlign: "top",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  siteCell: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: 180,
    display: "block",
  },
  tr: {
    cursor: "pointer",
  },
  thContent: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  thActions: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  filterButton: {
    border: "1px solid #CBD5E1",
    borderRadius: 999,
    padding: "3px 8px",
    fontSize: 10,
    cursor: "pointer",
  },
  columnFilter: {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    width: 230,
    maxHeight: 280,
    overflow: "auto",
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    boxShadow: "0 10px 28px rgba(15, 23, 42, 0.14)",
    padding: 10,
    zIndex: 20,
  },
  columnFilterInput: {
    width: "100%",
    marginBottom: 8,
    padding: "6px 8px",
    fontSize: 11,
    border: "1px solid #E5E7EB",
    borderRadius: 8,
  },
  columnFilterItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 4px",
    fontSize: 11,
    color: "#374151",
    cursor: "pointer",
  },
  clearInlineButton: {
    border: "none",
    background: "transparent",
    color: "#4338CA",
    fontSize: 10,
    fontWeight: 700,
    cursor: "pointer",
  },
  errorBanner: {
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    color: "#B91C1C",
    borderRadius: 14,
    padding: 14,
    fontSize: 13,
    fontWeight: 700,
  },
  successBanner: {
    background: "#ECFDF5",
    border: "1px solid #A7F3D0",
    color: "#047857",
    borderRadius: 14,
    padding: 14,
    fontSize: 13,
    fontWeight: 700,
  },
  emptyCell: {
    padding: 24,
    textAlign: "center",
    color: "#64748B",
    fontSize: 13,
  },
  sidePanelOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.35)",
    display: "flex",
    justifyContent: "flex-end",
    zIndex: 3000,
  },
  sidePanel: {
    width: 920,
    maxWidth: "100%",
    height: "100%",
    borderRadius: 0,
    boxShadow: "-8px 0 24px rgba(0,0,0,0.12)",
    overflowY: "auto",
  },
  innerSection: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  uploadWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
  },
  errorText: {
    fontSize: 12,
    color: "#DC2626",
    fontWeight: 600,
  },
  viewerOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.60)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4000,
  },
  viewerCard: {
    background: "#FFFFFF",
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
  },
  viewerCloseButton: {
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
  },
  viewerImage: {
    maxWidth: "80vw",
    maxHeight: "80vh",
    borderRadius: 8,
    boxShadow: "0 2px 12px rgba(0,0,0,0.10)",
  },
};
