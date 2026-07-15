import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { Ban, CalendarClock, ChevronRight, Eye, FileDown, RefreshCw, Save, Search, UserRound } from "lucide-react";
import { listarEmpleadosWup } from "../../api/empleadoService";
import {
  desactivarHistorialContrato,
  aprobarVigenciaContratoEmpleado,
  generarPlantillaContrato,
  obtenerContratoEmpleado,
  renovarContratoEmpleado,
  type ContratoEmpleadoHistorial,
  type ContratoEmpleadoSolicitudVigencia,
} from "../../api/contratosService";
import { listarFichaEmpleados, type FichaEmpleadoRow } from "../../api/fichaService";
import type { EmpleadoCta } from "../../models/empleadoCta";
import { getHttpErrorMessage } from "../../utils/httpError";
import { SHAREPOINT_BASE_URL } from "../../utils/sharepoint";

const PHOTO_BASE_URL = `${SHAREPOINT_BASE_URL}APLICATIVOS%20EXTERNOS/FOTOS%5FEMPLEADO`;
const PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ""];
const CONTRACTS_LIBRARY_ROOT = "APLICATIVOS EXTERNOS/FORMATOS_CONTRATOS";
const CONTRACTS_WORD_BASE_URL = "https://cjtelecom.sharepoint.com/:w:/r/sites/CJ-PROYECTOS/";
type ContractTemplateFamilyKey = "NECESIDADES" | "EXTRANJERO" | "SERVICIO_ESPECIFICO";
type ContractTemplateStageKey = "INICIAL" | "RENOVACION";
type ContractTemplateSelection = {
  family: ContractTemplateFamilyKey | "";
  stage: ContractTemplateStageKey | "";
};

const CONTRACT_TEMPLATE_FAMILIES: Array<{
  key: ContractTemplateFamilyKey;
  label: string;
  folder: string;
}> = [
  { key: "NECESIDADES", label: "Necesidades mercado", folder: "1_Form_Necesidades mercado" },
  { key: "EXTRANJERO", label: "Extranjero", folder: "2_Form_Extranjero" },
  { key: "SERVICIO_ESPECIFICO", label: "Servicio especifico", folder: "3_Form_Servicio Específico" },
];

const CONTRACT_TEMPLATE_STAGES: Array<{
  key: ContractTemplateStageKey;
  label: string;
  folder: string;
}> = [
  { key: "INICIAL", label: "Inicial", folder: "1_Inicial" },
  { key: "RENOVACION", label: "Renovacion", folder: "2_Renovacion" },
];

function getStageFolderForFamily(
  companyFolder: string,
  family: ContractTemplateFamilyKey,
  stage: ContractTemplateStageKey
): string {
  if (companyFolder === "1_TELECOM" && family === "SERVICIO_ESPECIFICO") {
    return stage === "INICIAL" ? "1_Inicial" : "2_Renovacion";
  }

  if (companyFolder === "2_GROUP" && family === "NECESIDADES" && stage === "INICIAL") {
    return "1_Inicial";
  }

  if (companyFolder === "4_PYDEX" && family === "SERVICIO_ESPECIFICO" && stage === "INICIAL") {
    return "1_Inicial";
  }

  if (family === "SERVICIO_ESPECIFICO") {
    return stage === "INICIAL" ? "1_Contrato_Inicial" : "2_Renovacion";
  }

  return CONTRACT_TEMPLATE_STAGES.find((option) => option.key === stage)?.folder ?? "";
}

const CONTRACT_PERIOD_MONTHS = ["En", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"] as const;

function buildSharePointWordUrl(path?: string | null): string {
  const raw = String(path ?? "").trim();
  if (!raw) {
    return "";
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  return `${CONTRACTS_WORD_BASE_URL}${encodeSharePointPath(raw.replace(/^\/+/, ""))}?web=1`;
}

function encodeSharePointPath(path: string): string {
  return path
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function normalizeSharePointFolderName(value?: string | null): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }

  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeContractPathSegment(value: string): string {
  return value
    .replace("EspecÃ­fico", "Específico");
}

function resolveCompanyFolderName(empresa?: string | null): string {
  const normalized = normalizeText(empresa ?? "");

  if (normalized.includes("telecom")) {
    return "1_TELECOM";
  }

  if (normalized.includes("group")) {
    return "2_GROUP";
  }

  if (normalized.includes("inmueble")) {
    return "3_INMUEBLES";
  }

  if (normalized.includes("pydex")) {
    return "4_PYDEX";
  }

  return normalizeSharePointFolderName(empresa);
}

function getServiceSpecificFamilyFolder(companyFolder: string): string {
  if (companyFolder === "1_TELECOM") {
    return "3_Fom_Serv Especifico";
  }

  if (companyFolder === "4_PYDEX") {
    return "3_Form_Servicio Específico";
  }

  return CONTRACT_TEMPLATE_FAMILIES.find((option) => option.key === "SERVICIO_ESPECIFICO")?.folder ?? "";
}

function buildContratoDocumentPath(
  item: Pick<RelationTableRow, "empresa" | "nombreEmpleado" | "fechaInicio" | "fechaFin">,
  selection: ContractTemplateSelection
): string {
  const companyFolder = resolveCompanyFolderName(item.empresa);
  const segments = [CONTRACTS_LIBRARY_ROOT, companyFolder];

  if (selection.family === "SERVICIO_ESPECIFICO") {
    const serviceFamilyFolder = getServiceSpecificFamilyFolder(companyFolder);
    const serviceStageFolder = selection.stage
      ? getStageFolderForFamily(companyFolder, selection.family, selection.stage)
      : "";
    const documentFileName = buildContratoDocumentFileName(item, selection);

    if (!serviceFamilyFolder || !serviceStageFolder || !documentFileName) {
      return "";
    }

    return [CONTRACTS_LIBRARY_ROOT, companyFolder, serviceFamilyFolder, serviceStageFolder, documentFileName]
      .filter(Boolean)
      .map((segment) => normalizeContractPathSegment(segment))
      .join("/");
  }

  const familyFolder = selection.family
    ? CONTRACT_TEMPLATE_FAMILIES.find((option) => option.key === selection.family)?.folder ?? ""
    : "";
  const resolvedFamilyFolder =
    companyFolder === "4_PYDEX" && String(selection.family) === "SERVICIO_ESPECIFICO"
      ? "3_Form_Servicio Específico"
      : familyFolder;
  if (!resolvedFamilyFolder) {
    return "";
  }
  segments.push(resolvedFamilyFolder);

  const stageFolder =
    selection.family && selection.stage
      ? getStageFolderForFamily(companyFolder, selection.family, selection.stage)
      : "";
  if (!stageFolder) {
    return "";
  }

  segments.push(stageFolder);
  const documentFileName = buildContratoDocumentFileName(item, selection);
  if (!documentFileName) {
    return "";
  }
  segments.push(documentFileName);

  return segments.filter(Boolean).map((segment) => normalizeContractPathSegment(segment)).join("/");
}

function isTelecomCompany(empresa?: string | null): boolean {
  return resolveCompanyFolderName(empresa) === "1_TELECOM";
}

function hasContractTemplatesLoaded(empresa?: string | null): boolean {
  const companyFolder = resolveCompanyFolderName(empresa);
  return (
    companyFolder === "1_TELECOM" ||
    companyFolder === "2_GROUP" ||
    companyFolder === "3_INMUEBLES" ||
    companyFolder === "4_PYDEX"
  );
}

function resolveContractTemplateFamily(item: Pick<RelationTableRow, "cliente" | "area" | "ubicacion">): ContractTemplateFamilyKey {
  const contextText = normalizeText([item.cliente, item.area, item.ubicacion].filter(Boolean).join(" "));

  if (contextText.includes("extranjero")) {
    return "EXTRANJERO";
  }

  if (contextText.includes("servicio especifico") || contextText.includes("serv especifico") || contextText.includes("especifico")) {
    return "SERVICIO_ESPECIFICO";
  }

  return "NECESIDADES";
}

function getTemplateFamilyLabel(key: ContractTemplateFamilyKey): string {
  return CONTRACT_TEMPLATE_FAMILIES.find((option) => option.key === key)?.label ?? key;
}

function getTemplateStageLabel(key: ContractTemplateStageKey): string {
  return CONTRACT_TEMPLATE_STAGES.find((option) => option.key === key)?.label ?? key;
}

function getTemplateFamilyLabelOrEmpty(key: ContractTemplateFamilyKey | ""): string {
  return key ? getTemplateFamilyLabel(key) : "";
}

function getTemplateStageLabelOrEmpty(key: ContractTemplateStageKey | ""): string {
  return key ? getTemplateStageLabel(key) : "";
}

function getTemplateFamilyFolder(key: ContractTemplateFamilyKey): string {
  return CONTRACT_TEMPLATE_FAMILIES.find((option) => option.key === key)?.folder ?? "";
}

function getTemplateStageFolder(key: ContractTemplateStageKey): string {
  return CONTRACT_TEMPLATE_STAGES.find((option) => option.key === key)?.folder ?? "";
}

function getCompanyShortCode(empresa?: string | null): string {
  const normalized = normalizeText(empresa ?? "");

  if (normalized.includes("telecom")) {
    return "TLC";
  }

  if (normalized.includes("group")) {
    return "GRP";
  }

  if (normalized.includes("inmueble")) {
    return "INM";
  }

  if (normalized.includes("pydex")) {
    return "PDX";
  }

  return normalizeText(empresa ?? "").replace(/[^a-z0-9]+/g, "").slice(0, 4).toUpperCase() || "DOC";
}

function getFamilyShortCode(family: ContractTemplateFamilyKey): string {
  switch (family) {
    case "NECESIDADES":
      return "NM";
    case "EXTRANJERO":
      return "EXT";
    case "SERVICIO_ESPECIFICO":
      return "SE";
    default:
      return family;
  }
}

function getStageShortCode(stage: ContractTemplateStageKey): string {
  return stage === "INICIAL" ? "1" : "2";
}

function formatContractPeriodToken(
  family: ContractTemplateFamilyKey,
  stage: ContractTemplateStageKey,
  fechaInicio?: string | null,
  fechaFin?: string | null
): string {
  const startDate = parseContractDate(fechaInicio);
  const endDate = parseContractDate(fechaFin);

  if (!startDate || !endDate) {
    return "";
  }

  const formatPart = (date: Date) => {
    const month = CONTRACT_PERIOD_MONTHS[date.getMonth()] ?? "Mes";
    const year = String(date.getFullYear()).slice(-2);
    return `${month}-${year}`;
  };

  const separator = family === "NECESIDADES" && stage === "INICIAL" ? "_a_" : "_";
  return `${formatPart(startDate)}${separator}${formatPart(endDate)}`;
}

function getStageFileSlug(
  family: ContractTemplateFamilyKey,
  stage: ContractTemplateStageKey
): string {
  if (stage === "INICIAL") {
    return "Contrato_Inicial";
  }

  return family === "NECESIDADES" ? "Renov_contrato" : "Renov_Contrato";
}

function getContractTemplateFileName(
  empresa: string | null | undefined,
  family: ContractTemplateFamilyKey,
  stage: ContractTemplateStageKey
): string {
  const templateMap: Record<ContractTemplateFamilyKey, Record<ContractTemplateStageKey, string>> = {
    NECESIDADES: {
      INICIAL: "1_APELLIDOS Y NOMBRES_Contrato_Inicial_TLC_NM_En-26_a_Dic-26.docx",
      RENOVACION: "1_APELLIDOS Y NOMBRES_Renov_contrato_TLC_NM_En-26_Dic-26.docx",
    },
    EXTRANJERO: {
      INICIAL: "1_APELLIDOS Y NOMBRES_Contrato_Inicial_TLC_EXT_En-26_Dic-26.docx",
      RENOVACION: "1_APELLIDOS Y NOMBRES_Renov_Contrato_TLC_EXT_En-26_Dic-26.docx",
    },
    SERVICIO_ESPECIFICO: {
      INICIAL: "1_APELLIDOS Y NOMBRES_Contrato_Inicial_TLC_SE_En-26_Dic-26.docx",
      RENOVACION: "1_APELLIDOS Y NOMBRES_Renov_Contrato_TLC_SE_En-26_Dic-26.docx",
    },
  };

  const baseTemplate = templateMap[family]?.[stage] ?? "";
  if (!baseTemplate) {
    return "";
  }

  if (resolveCompanyFolderName(empresa) === "2_GROUP" && family === "NECESIDADES" && stage === "INICIAL") {
    return "1_APELLIDOS Y NOMBRES_Contrato_Inicial_GRP_NM_En-26_Dic-26.docx";
  }

  if (resolveCompanyFolderName(empresa) === "4_PYDEX" && family === "NECESIDADES" && stage === "INICIAL") {
    return "1_APELLIDOS Y NOMBRES_Contrato_Inicial_PDX_NM_En-26_Dic-26.docx";
  }

  if (resolveCompanyFolderName(empresa) === "4_PYDEX" && family === "NECESIDADES" && stage === "RENOVACION") {
    return "1_APELLIDOS Y NOMBRES_Renov_Contrato_PDX_NM_En-26_Dic-26.docx";
  }

  if (resolveCompanyFolderName(empresa) === "4_PYDEX" && family === "EXTRANJERO" && stage === "INICIAL") {
    return "1_APELLIDOS Y NOMBRES_Contrato_Inicial_PDX_EXT_En-26_Dic-26.docx";
  }

  if (resolveCompanyFolderName(empresa) === "4_PYDEX" && family === "EXTRANJERO" && stage === "RENOVACION") {
    return "1_APELLIDOS Y NOMBRES_Renov_Contrato_PDX_EXT_En-26_Dic-26.docx";
  }

  if (resolveCompanyFolderName(empresa) === "4_PYDEX" && family === "SERVICIO_ESPECIFICO" && stage === "INICIAL") {
    return "1_APELLIDOS Y NOMBRES_Contrato_Inicial_PDX_SE_En-26_Dic-26.docx";
  }

  if (resolveCompanyFolderName(empresa) === "4_PYDEX" && family === "SERVICIO_ESPECIFICO" && stage === "RENOVACION") {
    return "1_APELLIDOS Y NOMBRES_Renov_Contrato_PDX_SE_En-26_Dic-26.docx";
  }

  if (resolveCompanyFolderName(empresa) === "3_INMUEBLES" && family === "NECESIDADES" && stage === "INICIAL") {
    return "1_APELLIDOS Y NOMBRES_Contrato_Inicial_INM_NM_En-26_Dic-26.docx";
  }

  if (resolveCompanyFolderName(empresa) === "3_INMUEBLES" && family === "NECESIDADES" && stage === "RENOVACION") {
    return "1_APELLIDOS Y NOMBRES_Renov_Contrato_INM_NM_En-26_Dic-26.docx";
  }

  if (resolveCompanyFolderName(empresa) === "3_INMUEBLES") {
    return baseTemplate.replace(/_TLC_/g, "_INM_");
  }

  if (resolveCompanyFolderName(empresa) === "2_GROUP") {
    return baseTemplate.replace(/_TLC_/g, "_GRP_").replace("Renov_contrato", "Renov_Contrato");
  }

  if (resolveCompanyFolderName(empresa) === "4_PYDEX") {
    return baseTemplate.replace(/_TLC_/g, "_PDX_").replace("Renov_contrato", "Renov_Contrato");
  }

  return baseTemplate;
}

function buildContratoDocumentFileName(
  item: Pick<RelationTableRow, "nombreEmpleado" | "fechaInicio" | "fechaFin" | "empresa">,
  selection: ContractTemplateSelection
): string {
  if (!selection.family || !selection.stage) {
    return "";
  }

  const templateName = getContractTemplateFileName(item.empresa, selection.family, selection.stage);
  if (templateName) {
    return templateName;
  }

  const employeeName = normalizeSharePointFolderName(item.nombreEmpleado).toUpperCase();
  const stageLabel = getStageFileSlug(selection.family, selection.stage);
  const companyCode = getCompanyShortCode(item.empresa);
  const familyCode = getFamilyShortCode(selection.family);
  const periodToken = formatContractPeriodToken(selection.family, selection.stage, item.fechaInicio, item.fechaFin);
  const parts = [
    `${getStageShortCode(selection.stage)}_${employeeName || "APELLIDOS Y NOMBRES"}`,
    stageLabel,
    companyCode,
    familyCode,
    periodToken,
  ].filter(Boolean);

  return `${parts.join("_")}.docx`;
}

function buildGeneratedContractFileName(
  item: Pick<RelationTableRow, "nombreEmpleado">,
  selection: ContractTemplateSelection
): string {
  const employeeName = normalizeSharePointFolderName(item.nombreEmpleado).toUpperCase() || "APELLIDOS Y NOMBRES";
  const stageLabel = selection.stage === "RENOVACION" ? "RENOVACION" : "INICIAL";
  return `${stageLabel}-${employeeName}.docx`;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatDateLabel(value?: string | null) {
  if (!value) return "-";
  const trimmed = value.trim();
  if (!trimmed) return "-";
  const datePart = trimmed.includes(" ") ? trimmed.split(" ")[0] : trimmed;
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!isoMatch) {
    return trimmed;
  }

  return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
}

function toInputDate(value?: string | null) {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const datePart = trimmed.includes(" ") ? trimmed.split(" ")[0] : trimmed;
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : "";
}

function parseContractDate(value?: string | null): Date | null {
  const normalized = toInputDate(value);
  if (!normalized) {
    return null;
  }

  const date = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDaysToDate(value?: string | null, days = 0): Date | null {
  const baseDate = parseContractDate(value);
  if (!baseDate) {
    return null;
  }

  const nextDate = new Date(baseDate);
  nextDate.setDate(nextDate.getDate() + days);
  return Number.isNaN(nextDate.getTime()) ? null : nextDate;
}

function formatContractWordDate(value?: string | null): string {
  const date = parseContractDate(value);
  if (!date) {
    return "";
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatContractWordDateFromDate(value?: Date | null): string {
  if (!value) {
    return "";
  }

  const day = String(value.getDate()).padStart(2, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const year = value.getFullYear();
  return `${day}/${month}/${year}`;
}

function getMonthsDifference(startDate?: Date | null, endDate?: Date | null): string {
  if (!startDate || !endDate) {
    return "";
  }

  const diffYears = endDate.getFullYear() - startDate.getFullYear();
  const diffMonths = endDate.getMonth() - startDate.getMonth();
  const totalMonths = diffYears * 12 + diffMonths;

  if (totalMonths < 0) {
    return "";
  }

  if (endDate.getDate() < startDate.getDate()) {
    return String(Math.max(totalMonths - 1, 0));
  }

  return String(totalMonths);
}

function resolveContractStatus(value?: string | null) {
  const endDate = parseContractDate(value);
  if (!endDate) {
    return "SIN FECHA";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffMs = endDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return "VENCIDO";
  }

  if (diffDays <= 30) {
    return "X VENCER";
  }

  return "VIGENTE";
}

function buildPhotoCandidates(idEmpleado: number): string[] {
  const baseName = encodeURIComponent(String(idEmpleado));
  return PHOTO_EXTENSIONS.map((extension) => `${PHOTO_BASE_URL}/${baseName}${extension}`);
}

function toText(value: unknown): string {
  if (value == null) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map((item) => toText(item)).filter(Boolean).join(", ");
  }

  if (typeof value === "boolean") {
    return value ? "Si" : "No";
  }

  return String(value).trim();
}

function getFichaValue(row: FichaEmpleadoRow, ...keys: string[]): string {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = toText(row[key]);
      if (value) {
        return value;
      }
    }
  }

  const normalizedEntries = Object.entries(row).map(([key, value]) => [key.toLowerCase(), value] as const);
  for (const key of keys) {
    const found = normalizedEntries.find(([entryKey]) => entryKey === key.toLowerCase());
    if (found) {
      const value = toText(found[1]);
      if (value) {
        return value;
      }
    }
  }

  return "";
}

function getFichaNumber(row: FichaEmpleadoRow, ...keys: string[]): number | null {
  const value = getFichaValue(row, ...keys);
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type RelationTableRow = {
  key: string;
  idEmpleado: number | null;
  nombreEmpleado: string;
  nroDocumento: string;
  direccion: string;
  empresa: string;
  area: string;
  cliente: string;
  ubicacion: string;
  fechaIniLaboral: string;
  fechaFinLaboral: string;
  nFechaIniLaboral: string;
  mesesN: string;
  cargoPrint: string;
  fechaInicio: string;
  fechaFin: string;
  nuevaFechaFinLaboral: string;
  meses: string;
  aprobacion1Fecha: string;
  aprobacion2Fecha: string;
  aprobacion3Fecha: string;
  aprobacionPendiente: string;
  estadoContrato: string;
};

function getRelationPendingApprovalStep(item: Pick<RelationTableRow, "nuevaFechaFinLaboral" | "aprobacion1Fecha" | "aprobacion2Fecha" | "aprobacion3Fecha">): 2 | 3 | null {
  if (!toInputDate(item.nuevaFechaFinLaboral) || toInputDate(item.aprobacion3Fecha)) {
    return null;
  }

  if (toInputDate(item.aprobacion2Fecha)) {
    return 3;
  }

  if (toInputDate(item.aprobacion1Fecha)) {
    return 2;
  }

  return null;
}

function canEditPendingApprovalStep(step: 2 | 3 | null): boolean {
  return step === 2 || step === 3;
}

function getRelationProposalEndDate(item: Pick<RelationTableRow, "nuevaFechaFinLaboral" | "fechaFin">): string {
  return toInputDate(item.nuevaFechaFinLaboral) || toInputDate(item.fechaFin);
}

function getRelationMonthsValue(item: Pick<RelationTableRow, "fechaFin" | "nuevaFechaFinLaboral" | "estadoContrato">): string {
  if (normalizeText(item.estadoContrato) === "vigente") {
    return "";
  }

  const contractEndDate = parseContractDate(item.fechaFin);
  const proposalEndDate = parseContractDate(getRelationProposalEndDate(item));
  if (!contractEndDate || !proposalEndDate) {
    return "";
  }

  return getMonthsDifference(contractEndDate, proposalEndDate);
}

function EmployeePhoto({
  idEmpleado,
  nombreEmpleado,
}: {
  idEmpleado: number | null;
  nombreEmpleado: string;
}) {
  const candidates = useMemo(
    () => (idEmpleado && idEmpleado > 0 ? buildPhotoCandidates(idEmpleado) : []),
    [idEmpleado]
  );
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [idEmpleado]);

  const src = candidates[index];

  if (!src) {
    return (
      <div style={styles.photoPlaceholder}>
        <UserRound size={40} />
        <div style={styles.photoPlaceholderTitle}>Sin foto</div>
        <div style={styles.photoPlaceholderText}>{nombreEmpleado || `Empleado ${idEmpleado ?? "-"}`}</div>
      </div>
    );
  }

  return (
    <div style={styles.photoFrame}>
      <img
        key={src}
        src={src}
        alt={nombreEmpleado || `Empleado ${idEmpleado}`}
        style={styles.photo}
        onError={() => setIndex((current) => current + 1)}
      />
    </div>
  );
}

export default function ContratosPage() {
  const [relationFilters, setRelationFilters] = useState({
    nombreEmpleado: "",
    nroDocumento: "",
    empresa: [] as string[],
    area: [] as string[],
    cliente: [] as string[],
    ubicacion: [] as string[],
    fechaInicio: "",
    fechaFin: "",
    aprobacionPendiente: [] as string[],
    estadoContrato: [] as string[],
  });
  const [relationSort, setRelationSort] = useState<{
    key:
      | "nombreEmpleado"
      | "nroDocumento"
      | "empresa"
      | "area"
      | "cliente"
      | "ubicacion"
      | "fechaInicio"
      | "fechaFin"
      | "aprobacionPendiente"
      | "estadoContrato";
    direction: "asc" | "desc";
  }>({
    key: "nombreEmpleado",
    direction: "asc",
  });
  const [activeTab, setActiveTab] = useState<"relacion" | "detalle">("relacion");
  const [employees, setEmployees] = useState<EmpleadoCta[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number>(0);
  const [relationRows, setRelationRows] = useState<FichaEmpleadoRow[]>([]);
  const [documentSelections, setDocumentSelections] = useState<Record<string, ContractTemplateSelection>>({});
  const [loadingRelation, setLoadingRelation] = useState(false);
  const [openingTemplateKey, setOpeningTemplateKey] = useState<string | null>(null);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const autoSaveInProgressRef = useRef(false);
  const [savingRelationEmployeeId, setSavingRelationEmployeeId] = useState<number | null>(null);
  const [processingRelationKey, setProcessingRelationKey] = useState<string | null>(null);
  const [processingRelationMessage, setProcessingRelationMessage] = useState("");
  const [relationNewEndDates, setRelationNewEndDates] = useState<Record<string, string>>({});
  const [deactivatingId, setDeactivatingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof obtenerContratoEmpleado>> | null>(null);
  const [newEndDate, setNewEndDate] = useState("");
  const [newEndDateOriginal, setNewEndDateOriginal] = useState("");
  const [observation, setObservation] = useState("");

  useEffect(() => {
    let active = true;

    const loadEmployees = async () => {
      setLoadingEmployees(true);
      setError("");

      try {
        const rows = await listarEmpleadosWup();
        if (!active) return;
        setEmployees(rows);
      } catch (err) {
        if (!active) return;
        setError(getHttpErrorMessage(err, "No se pudo cargar la lista de empleados."));
      } finally {
        if (active) {
          setLoadingEmployees(false);
        }
      }
    };

    void loadEmployees();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (selectedEmployeeId <= 0) {
      setDetail(null);
      setNewEndDate("");
      setNewEndDateOriginal("");
      setObservation("");
      return;
    }

    let active = true;

    const loadDetail = async () => {
      setLoadingDetail(true);
      setError("");
      setSuccess("");

      try {
        const response = await obtenerContratoEmpleado(selectedEmployeeId);
        if (!active) return;
        setDetail(response);
        const currentEndDate = toInputDate(response.solicitudVigencia?.nuevaFechaFinLaboral ?? response.empleado?.fechaFinLaboral);
        setNewEndDate(currentEndDate);
        setNewEndDateOriginal(currentEndDate);
        setObservation(response.solicitudVigencia?.aprobacion1Observacion ?? "");
      } catch (err) {
        if (!active) return;
        setError(getHttpErrorMessage(err, "No se pudo cargar el contrato del empleado."));
      } finally {
        if (active) {
          setLoadingDetail(false);
        }
      }
    };

    void loadDetail();
    return () => {
      active = false;
    };
  }, [selectedEmployeeId]);

  const filteredEmployees = useMemo(() => {
    const query = normalizeText(employeeSearch);
    return employees
      .filter((item) => !query || normalizeText(item.nombreEmpleado).includes(query))
      .sort((a, b) => a.nombreEmpleado.localeCompare(b.nombreEmpleado, "es"));
  }, [employeeSearch, employees]);

  const employee = detail?.empleado ?? null;
  const history = detail?.historial ?? [];
  const pendingRequest = detail?.solicitudVigencia ?? null;
  const pendingApprovalStep = getPendingApprovalStep(pendingRequest);

  const loadRelationRows = async () => {
    const response = await listarFichaEmpleados();
    setRelationRows(response.rows);
  };

  useEffect(() => {
    let active = true;

    const loadRelation = async () => {
      setLoadingRelation(true);

      try {
        const response = await listarFichaEmpleados();
        if (!active) return;
        setRelationRows(response.rows);
      } catch (err) {
        if (!active) return;
        setRelationRows([]);
        setError(getHttpErrorMessage(err, "No se pudo cargar la relacion de empleados."));
      } finally {
        if (active) {
          setLoadingRelation(false);
        }
      }
    };

    void loadRelation();
    return () => {
      active = false;
    };
  }, []);

  const relationTableRows = useMemo(() => {
    return relationRows.map((row, index) => ({
      key: `${getFichaValue(row, "IdEmpleado", "idEmpleado", "IdEmpleadoCj", "idEmpleadoCj") || index}`,
      idEmpleado: getFichaNumber(row, "IdEmpleado", "idEmpleado", "IdEmpleadoCj", "idEmpleadoCj"),
      nombreEmpleado: getFichaValue(row, "NombreEmpleado", "nombreEmpleado", "Nombre", "nombre") || "-",
      nroDocumento: getFichaValue(row, "NroDocumento", "nroDocumento", "Documento", "documento") || "-",
      direccion: getFichaValue(row, "Direccion", "direccion") || "",
      empresa: getFichaValue(row, "Empresa", "empresa") || "-",
      area: getFichaValue(row, "Area", "area", "Departamento", "departamento") || "-",
      cliente: getFichaValue(row, "Cliente", "cliente") || "-",
      ubicacion: getFichaValue(row, "Ubicacion", "ubicacion") || "-",
      fechaIniLaboral: getFichaValue(row, "FechaIniLaboral", "fechaIniLaboral", "fechainilaboral") || "",
      fechaFinLaboral: getFichaValue(row, "FechaFinLaboral", "FechaFinlaboral", "fechaFinLaboral", "fechafinlaboral", "fechfinlaboral") || "",
      nFechaIniLaboral: getFichaValue(row, "n_FechaIniLaboral", "N_FechaIniLaboral", "n_fechainilaboral", "nfechainilaboral") || "",
      mesesN: getFichaValue(row, "Meses_N", "MesesN", "meses_n", "Meses", "meses") || "",
      cargoPrint: getFichaValue(row, "CargoPrint", "cargoPrint", "Cargo", "cargo") || "",
      fechaInicio: getFichaValue(row, "FechaIniLaboral", "fechaIniLaboral", "fechainilaboral") || "-",
      fechaFin: getFichaValue(row, "FechaFinLaboral", "FechaFinlaboral", "fechaFinLaboral", "fechafinlaboral", "fechfinlaboral") || "-",
      nuevaFechaFinLaboral: getFichaValue(row, "NuevaFechaFinLaboral", "nuevaFechaFinLaboral"),
      meses: "",
      aprobacion1Fecha: getFichaValue(row, "Aprobacion1Fecha", "aprobacion1Fecha"),
      aprobacion2Fecha: getFichaValue(row, "Aprobacion2Fecha", "aprobacion2Fecha"),
      aprobacion3Fecha: getFichaValue(row, "Aprobacion3Fecha", "aprobacion3Fecha"),
      aprobacionPendiente: getRelationPendingApprovalLabel({
        nuevaFechaFinLaboral: getFichaValue(row, "NuevaFechaFinLaboral", "nuevaFechaFinLaboral"),
        aprobacion1Fecha: getFichaValue(row, "Aprobacion1Fecha", "aprobacion1Fecha"),
        aprobacion2Fecha: getFichaValue(row, "Aprobacion2Fecha", "aprobacion2Fecha"),
        aprobacion3Fecha: getFichaValue(row, "Aprobacion3Fecha", "aprobacion3Fecha"),
      }),
      estadoContrato: resolveContractStatus(getFichaValue(row, "FechaFinLaboral", "FechaFinlaboral", "fechaFinLaboral", "fechafinlaboral", "fechfinlaboral")),
    })) satisfies RelationTableRow[];
  }, [relationRows]);

  useEffect(() => {
    setDocumentSelections((current) => {
      const activeKeys = new Set(relationTableRows.map((item) => item.key));
      const nextEntries = Object.entries(current).filter(([key]) => activeKeys.has(key));
      if (nextEntries.length === Object.keys(current).length) {
        return current;
      }

      return Object.fromEntries(nextEntries) as Record<string, ContractTemplateSelection>;
    });
  }, [relationTableRows]);

  useEffect(() => {
    const vigenteKeys = new Set(
      relationTableRows
        .filter((item) => normalizeText(item.estadoContrato) === "vigente")
        .map((item) => item.key)
    );

    setDocumentSelections((current) => {
      let changed = false;
      const nextEntries = Object.entries(current).map(([key, selection]) => {
        if (!vigenteKeys.has(key) && selection.stage) {
          changed = true;
          return [key, { ...selection, stage: "" }] as const;
        }

        return [key, selection] as const;
      });

      if (!changed) {
        return current;
      }

      return Object.fromEntries(nextEntries) as Record<string, ContractTemplateSelection>;
    });
  }, [relationTableRows]);

  const getRelationRowKey = (item: { key: string; idEmpleado: number | null }) =>
    item.idEmpleado && item.idEmpleado > 0 ? String(item.idEmpleado) : item.key;

  const getRelationEditableEndDate = (item: RelationTableRow) =>
    relationNewEndDates[getRelationRowKey(item)] ?? getRelationProposalEndDate(item);

  const canEditRelationEndDate = (item: RelationTableRow) => {
    if (canEditPendingApprovalStep(getRelationPendingApprovalStep(item))) {
      return true;
    }

    const status = item.estadoContrato;
    const normalized = normalizeText(status);
    return normalized === "vencido" || normalized === "x vencer";
  };

  const getRelationDocumentSelection = (item: RelationTableRow): ContractTemplateSelection => {
    const defaultFamily = resolveContractTemplateFamily(item);
    const savedSelection = documentSelections[item.key];
    return {
      family: savedSelection?.family || defaultFamily,
      stage: savedSelection?.stage || "",
    };
  };

  const canApproveRelationStep = (item: RelationTableRow, step: 2 | 3) => {
    if (!item.idEmpleado || item.idEmpleado <= 0) {
      return false;
    }

    if (step === 3) {
      const selection = getRelationDocumentSelection(item);
      if (!selection.family || !selection.stage) {
        return false;
      }
    }

    return getRelationPendingApprovalStep(item) === step;
  };

  const relationFilterOptions = useMemo(() => {
    const collect = (key: "empresa" | "area" | "cliente" | "ubicacion" | "estadoContrato" | "aprobacionPendiente") => (
      [...new Set(relationTableRows.map((item) => String(item[key] ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }))
    );

    return {
      empresa: collect("empresa"),
      area: collect("area"),
      cliente: collect("cliente"),
      ubicacion: collect("ubicacion"),
      aprobacionPendiente: ["2da aprobacion", "3era aprobacion"],
      estadoContrato: collect("estadoContrato"),
    };
  }, [relationTableRows]);

  const filteredAndSortedRelationRows = useMemo(() => {
      const filtered = relationTableRows.filter((item) => (
      (!relationFilters.nombreEmpleado || normalizeText(item.nombreEmpleado).includes(normalizeText(relationFilters.nombreEmpleado))) &&
      (!relationFilters.nroDocumento || normalizeText(item.nroDocumento).includes(normalizeText(relationFilters.nroDocumento))) &&
      (relationFilters.empresa.length === 0 || relationFilters.empresa.includes(item.empresa)) &&
      (relationFilters.area.length === 0 || relationFilters.area.includes(item.area)) &&
      (relationFilters.cliente.length === 0 || relationFilters.cliente.includes(item.cliente)) &&
      (relationFilters.ubicacion.length === 0 || relationFilters.ubicacion.includes(item.ubicacion)) &&
      (!relationFilters.fechaInicio || normalizeText(formatDateLabel(item.fechaInicio)).includes(normalizeText(relationFilters.fechaInicio))) &&
      (!relationFilters.fechaFin || normalizeText(formatDateLabel(item.fechaFin)).includes(normalizeText(relationFilters.fechaFin))) &&
      (relationFilters.aprobacionPendiente.length === 0 || relationFilters.aprobacionPendiente.includes(item.aprobacionPendiente)) &&
      (relationFilters.estadoContrato.length === 0 || relationFilters.estadoContrato.includes(item.estadoContrato))
    ));

    return [...filtered].sort((a, b) => {
      const left = String(a[relationSort.key] ?? "");
      const right = String(b[relationSort.key] ?? "");
      const comparison = left.localeCompare(right, "es", { numeric: true, sensitivity: "base" });
      return relationSort.direction === "asc" ? comparison : -comparison;
    });
  }, [relationFilters, relationSort, relationTableRows]);

  const relationTableRowsWithMonths = useMemo(() => {
    return filteredAndSortedRelationRows.map((item) => ({
      ...item,
      meses: getRelationMonthsValue({
        fechaFin: item.fechaFin,
        nuevaFechaFinLaboral: getRelationEditableEndDate(item),
        estadoContrato: item.estadoContrato,
      }),
    }));
  }, [filteredAndSortedRelationRows, relationNewEndDates]);

  const toggleRelationSort = (
    key:
      | "nombreEmpleado"
      | "nroDocumento"
      | "empresa"
      | "area"
      | "cliente"
      | "ubicacion"
      | "fechaInicio"
      | "fechaFin"
      | "aprobacionPendiente"
      | "estadoContrato"
  ) => {
    setRelationSort((current) => (
    current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    ));
  };

  const updateDocumentSelection = (rowKey: string, patch: Partial<ContractTemplateSelection>) => {
    setDocumentSelections((current) => {
      const previous = current[rowKey] ?? { family: "", stage: "" };
      return {
        ...current,
        [rowKey]: { ...previous, ...patch },
      };
    });
  };

  const saveContractChange = async ({
    idEmpleado,
    nextEndDate,
    fechaIniLaboral,
    observationText,
  }: {
    idEmpleado: number;
    nextEndDate: string;
    fechaIniLaboral?: string;
    observationText?: string;
  }) => {
    if (!idEmpleado || idEmpleado <= 0) {
      setError("Debe seleccionar un empleado.");
      setSuccess("");
      return false;
    }

    if (!nextEndDate) {
      setError("Debe ingresar la nueva fecha fin de contrato.");
      setSuccess("");
      return false;
    }

    if (fechaIniLaboral && nextEndDate < toInputDate(fechaIniLaboral)) {
      setError("La nueva fecha fin no puede ser menor que la fecha de inicio laboral.");
      setSuccess("");
      return false;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await renovarContratoEmpleado({
        idEmpleado,
        nuevaFechaFinLaboral: nextEndDate,
        motivoMovimiento: "RENOVACION",
        observacion: (observationText ?? observation).trim(),
      });

      const refreshed = await obtenerContratoEmpleado(idEmpleado);
      const refreshedEndDate = toInputDate(refreshed.solicitudVigencia?.nuevaFechaFinLaboral ?? refreshed.empleado?.fechaFinLaboral);
      setDetail(refreshed);
      setNewEndDate(refreshedEndDate);
      setNewEndDateOriginal(refreshedEndDate);
      setObservation("");
      await loadRelationRows();
      setSuccess(
        response.actualizoSolicitudPendiente
          ? "La fecha fin propuesta fue actualizada en la solicitud pendiente."
          : "La fecha fue registrada con 1ra aprobacion y quedo pendiente de 2 validaciones."
      );
      return true;
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo registrar la solicitud de vigencia."));
      setSuccess("");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleApproveVigencia = async (
    idEmpleado: number,
    nivelAprobacion: number,
    documentPayload?: { documentPath?: string; fileName?: string }
  ) => {
    if (!idEmpleado || idEmpleado <= 0 || saving) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await aprobarVigenciaContratoEmpleado(idEmpleado, {
        nivelAprobacion,
        ...(documentPayload?.documentPath ? { documentPath: documentPayload.documentPath } : {}),
        ...(documentPayload?.fileName ? { fileName: documentPayload.fileName } : {}),
      });

      await loadRelationRows();

      if (selectedEmployeeId === idEmpleado) {
        const refreshed = await obtenerContratoEmpleado(idEmpleado);
        const refreshedEndDate = toInputDate(refreshed.solicitudVigencia?.nuevaFechaFinLaboral ?? refreshed.empleado?.fechaFinLaboral);
        setDetail(refreshed);
        setNewEndDate(refreshedEndDate);
        setNewEndDateOriginal(refreshedEndDate);
        setObservation("");
      }

      setSuccess(
        response.estadoSolicitud === "APROBADO"
          ? "La vigencia del contrato fue aprobada y aplicada correctamente."
          : `Aprobacion registrada. Quedan ${Math.max((response.aprobacionesRequeridas ?? 3) - (response.aprobacionesRealizadas ?? 0), 0)} validacion(es) pendiente(s).`
      );
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo registrar la aprobacion de la vigencia."));
      setSuccess("");
    } finally {
      setSaving(false);
    }
  };

  const handleRelationApprove = async (item: RelationTableRow, nivelAprobacion: 2 | 3) => {
    const idEmpleado = item.idEmpleado ?? 0;
    if (idEmpleado <= 0) {
      return;
    }

    if (nivelAprobacion === 3) {
      const selection = getRelationDocumentSelection(item);
      if (!selection.family || !selection.stage) {
        setError("Debe seleccionar ETAPA y VIGENCIA antes de aprobar la 3era validacion.");
        setSuccess("");
        return;
      }
    }

    const documentPayload =
      nivelAprobacion === 3
        ? (() => {
            const selection = getRelationDocumentSelection(item);
            const documentPath = buildContratoDocumentPath(
              {
                empresa: item.empresa,
                nombreEmpleado: item.nombreEmpleado,
                fechaInicio: item.fechaInicio,
                fechaFin: item.fechaFin,
              },
              selection
            );

            if (!documentPath) {
              setError("No se pudo resolver la ruta de la plantilla.");
              setSuccess("");
              return null;
            }

            return {
              documentPath,
              fileName: buildGeneratedContractFileName(
                {
                  nombreEmpleado: item.nombreEmpleado,
                },
                selection
              ),
            };
          })()
        : undefined;

    if (nivelAprobacion === 3 && !documentPayload) {
      return;
    }

    const rowKey = getRelationRowKey(item);
    const isThirdApproval = nivelAprobacion === 3;

    if (isThirdApproval) {
      setProcessingRelationKey(rowKey);
      setProcessingRelationMessage("Procesando 3era aprobacion. Espere mientras finaliza todo el proceso...");
    }

    const currentValue = (relationNewEndDates[rowKey] ?? "").trim();
    const originalValue = getRelationProposalEndDate(item);

    try {
      if (currentValue && currentValue !== originalValue) {
        const saved = await saveContractChange({
          idEmpleado,
          nextEndDate: currentValue,
          fechaIniLaboral: item.fechaInicio,
          observationText: "",
        });

        if (!saved) {
          return;
        }

        setRelationNewEndDates((current) => ({
          ...current,
          [rowKey]: currentValue,
        }));
      }

      await handleApproveVigencia(idEmpleado, nivelAprobacion, documentPayload ?? undefined);
    } finally {
      if (isThirdApproval) {
        setProcessingRelationKey(null);
        setProcessingRelationMessage("");
      }
    }
  };

  const handleOpenTemplate = async (item: RelationTableRow) => {
    const savedSelection = documentSelections[item.key];
    const defaultFamily = resolveContractTemplateFamily(item);
    const selection: ContractTemplateSelection = {
      family: savedSelection?.family || defaultFamily,
      stage: savedSelection?.stage || "",
    };

    if (!selection.family || !selection.stage) {
      setError("Seleccione una etapa y una vigencia antes de abrir la plantilla.");
      setSuccess("");
      return;
    }

    const documentPath = buildContratoDocumentPath(
      {
        empresa: item.empresa,
        nombreEmpleado: item.nombreEmpleado,
        fechaInicio: item.fechaInicio,
        fechaFin: item.fechaFin,
      },
      selection
    );

    if (!documentPath) {
      setError("No se pudo resolver la ruta de la plantilla.");
      setSuccess("");
      return;
    }

    const outputFileName = buildGeneratedContractFileName(
      {
        nombreEmpleado: item.nombreEmpleado,
      },
      selection
    );

    const previewWindow = window.open("", "_blank");
    if (previewWindow) {
      previewWindow.document.write("<p style='font-family:Arial,sans-serif'>Generando plantilla...</p>");
      previewWindow.document.close();
    }

    setOpeningTemplateKey(item.key);
    setError("");
    setSuccess("");

    try {
      const contractEndDate = parseContractDate(item.fechaFin);
      const nextStartDate = parseContractDate(item.nFechaIniLaboral) ?? addDaysToDate(item.fechaFin, 1);
      const proposalEndDate = parseContractDate(getRelationProposalEndDate(item));
      const effectiveEndDate = proposalEndDate ?? contractEndDate;
      const mesesContrato = item.mesesN.trim() || getMonthsDifference(nextStartDate, effectiveEndDate);

      const blob = await generarPlantillaContrato({
        documentPath,
        fileName: outputFileName,
        replacements: {
          NOMBREEMPLEADO: item.nombreEmpleado || "",
          NombreEmpleado: item.nombreEmpleado || "",
          NRODOCUMENTO: item.nroDocumento || "",
          NroDocumento: item.nroDocumento || "",
          DIRECCION: item.direccion || "",
          Direccion: item.direccion || "",
          AREA: item.area || "",
          Area: item.area || "",
          CLIENTE: item.cliente || "",
          Cliente: item.cliente || "",
          UBICACION: item.ubicacion || "",
          Ubicacion: item.ubicacion || "",
          CargoPrint: item.cargoPrint || "",
          FECHAINILABORAL: formatContractWordDate(item.fechaIniLaboral),
          FechaIniLaboral: formatContractWordDate(item.fechaIniLaboral),
          FECHAFINLABORAL: formatContractWordDateFromDate(effectiveEndDate),
          FechaFinLaboral: formatContractWordDateFromDate(effectiveEndDate),
          N_FECHAINILABORAL: formatContractWordDateFromDate(nextStartDate),
          N_FechaIniLaboral: formatContractWordDateFromDate(nextStartDate),
          N_fechainilaboral: formatContractWordDateFromDate(nextStartDate),
          N_FECHAFINLABORAL: formatContractWordDateFromDate(effectiveEndDate),
          N_FechaFinLaboral: formatContractWordDateFromDate(effectiveEndDate),
          N_FechaFinalLaboral: formatContractWordDateFromDate(effectiveEndDate),
          MESES_N: mesesContrato,
          Meses_N: mesesContrato,
        },
      });

      const blobUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement("a");
      downloadLink.href = blobUrl;
      downloadLink.download = outputFileName;
      downloadLink.rel = "noopener";
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();

      if (previewWindow) {
        previewWindow.close();
      }

      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err) {
      if (previewWindow) {
        previewWindow.close();
      }

      setError(getHttpErrorMessage(err, "No se pudo abrir la plantilla generada."));
      setSuccess("");
    } finally {
      setOpeningTemplateKey(null);
    }
  };

  const handleViewTemplate = (item: RelationTableRow) => {
    const savedSelection = documentSelections[item.key];
    const defaultFamily = resolveContractTemplateFamily(item);
    const selection: ContractTemplateSelection = {
      family: savedSelection?.family || defaultFamily,
      stage: savedSelection?.stage || "",
    };

    if (!selection.family || !selection.stage) {
      setError("Seleccione una etapa y una vigencia antes de ver la plantilla.");
      setSuccess("");
      return;
    }

    const documentPath = buildContratoDocumentPath(
      {
        empresa: item.empresa,
        nombreEmpleado: item.nombreEmpleado,
        fechaInicio: item.fechaInicio,
        fechaFin: item.fechaFin,
      },
      selection
    );

    if (!documentPath) {
      setError("No se pudo resolver la ruta de la plantilla.");
      setSuccess("");
      return;
    }

    const templateUrl = buildSharePointWordUrl(documentPath);
    if (!templateUrl) {
      setError("No se pudo construir la URL de SharePoint.");
      setSuccess("");
      return;
    }

    setError("");
    setSuccess("");
    window.open(templateUrl, "_blank", "noopener,noreferrer");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (autoSaveInProgressRef.current) {
      return;
    }

    if (newEndDate.trim() === newEndDateOriginal.trim()) {
      return;
    }

    if (!employee) {
      return;
    }

    const currentEmployee = employee;
    await saveContractChange({
      idEmpleado: currentEmployee.idEmpleado,
      nextEndDate: newEndDate,
      fechaIniLaboral: currentEmployee.fechaIniLaboral,
    });
  };

  const handleNewEndDateBlur = async () => {
    if (saving || !employee || employee.idEmpleado <= 0) {
      return;
    }

    const currentValue = newEndDate.trim();
    const originalValue = newEndDateOriginal.trim();

    if (!currentValue || currentValue === originalValue) {
      return;
    }

    const shouldSave = window.confirm("La fecha fin fue modificada. Desea grabar los cambios?");
    if (shouldSave) {
      autoSaveInProgressRef.current = true;
      try {
        await saveContractChange({
          idEmpleado: employee.idEmpleado,
          nextEndDate: currentValue,
          fechaIniLaboral: employee.fechaIniLaboral,
        });
      } finally {
        autoSaveInProgressRef.current = false;
      }
      return;
    }

    setNewEndDate(originalValue);
  };

  const handleDeactivateHistory = async (item: ContratoEmpleadoHistorial) => {
    if (!item.idHistorialLaboral) {
      return;
    }

    if (item.idActivo === false) {
      setError("El registro ya está desactivado.");
      setSuccess("");
      return;
    }

    setDeactivatingId(item.idHistorialLaboral);
    setError("");
    setSuccess("");

    try {
      await desactivarHistorialContrato(item.idHistorialLaboral);
      const refreshed = await obtenerContratoEmpleado(employee!.idEmpleado);
      setDetail(refreshed);
      setSuccess("El registro del historial fue desactivado correctamente.");
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo desactivar el registro del historial."));
    } finally {
      setDeactivatingId(null);
    }
  };

  const handleRelationEndDateBlur = async (item: RelationTableRow) => {
    if (savingRelationEmployeeId !== null) {
      return;
    }

    const idEmpleado = item.idEmpleado ?? 0;
    if (idEmpleado <= 0) {
      return;
    }

    const rowKey = getRelationRowKey(item);
    if (!canEditRelationEndDate(item)) {
      setRelationNewEndDates((current) => {
        const next = { ...current };
        delete next[rowKey];
        return next;
      });
      return;
    }

    const currentValue = (relationNewEndDates[rowKey] ?? "").trim();
    const originalValue = getRelationProposalEndDate(item);

    if (!currentValue || currentValue === originalValue) {
      return;
    }

    const shouldSave = window.confirm("La fecha fin fue modificada. Desea grabar los cambios?");
    if (!shouldSave) {
      setRelationNewEndDates((current) => {
        const next = { ...current };
        delete next[rowKey];
        return next;
      });
      return;
    }

    setSavingRelationEmployeeId(idEmpleado);
    try {
      const saved = await saveContractChange({
        idEmpleado,
        nextEndDate: currentValue,
        fechaIniLaboral: item.fechaInicio,
        observationText: "",
      });

      if (saved) {
        setRelationNewEndDates((current) => ({
          ...current,
          [rowKey]: currentValue,
        }));
      }
    } finally {
      setSavingRelationEmployeeId(null);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.breadcrumb}>Recursos Humanos / Contratos</div>
          <h1 style={styles.title}>Renovacion de contratos</h1>
          
        </div>
        <div style={styles.headerIconWrap}>
          <CalendarClock size={28} />
        </div>
      </div>

      <section style={styles.panel}>
        <div style={styles.tabsRow}>
          <button
            type="button"
            style={activeTab === "relacion" ? styles.tabButtonActive : styles.tabButton}
            onClick={() => setActiveTab("relacion")}
          >
            Relacion
          </button>
          <button
            type="button"
            style={activeTab === "detalle" ? styles.tabButtonActive : styles.tabButton}
            onClick={() => setActiveTab("detalle")}
          >
            Detalle
          </button>
        </div>

        {error ? <div style={styles.errorBox}>{error}</div> : null}
        {success ? <div style={styles.successBox}>{success}</div> : null}
        {processingRelationMessage ? (
          <div style={styles.pendingBox}>
            <div style={styles.pendingBoxTitle}>En proceso</div>
            <div style={styles.pendingBoxText}>
              <RefreshCw size={14} style={{ animation: "spin 1s linear infinite", marginRight: 6, verticalAlign: "text-bottom" }} />
              {processingRelationMessage}
            </div>
          </div>
        ) : null}

        {activeTab === "relacion" ? (
          <>
            {loadingRelation ? (
              <div style={styles.emptyState}>Cargando relacion de empleados...</div>
            ) : (
              <div style={styles.historyPanel}>
                <div style={styles.historyHeader}>
                  <h2 style={styles.historyTitle}>Listado de empleados</h2>
                  <span style={styles.historyCount}>{filteredAndSortedRelationRows.length} registro(s)</span>
                </div>

                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}><button type="button" style={styles.sortButton} onClick={() => toggleRelationSort("nombreEmpleado")}>Empleado{renderSortIndicator(relationSort, "nombreEmpleado")}</button></th>
                        <th style={styles.th}><button type="button" style={styles.sortButton} onClick={() => toggleRelationSort("empresa")}>Empresa{renderSortIndicator(relationSort, "empresa")}</button></th>
                        <th style={{ ...styles.th, ...styles.documentRouteHeader }}>ETAPA - VIGENCIA</th>
                        <th style={styles.th}><button type="button" style={styles.sortButton} onClick={() => toggleRelationSort("estadoContrato")}>Estado contrato{renderSortIndicator(relationSort, "estadoContrato")}</button></th>
                        <th style={styles.th}>MESES</th>
                        <th style={styles.th}>Aprob. pendiente</th>
                        <th style={styles.th}>Nueva fecha fin</th>
                        <th style={styles.th}>Accion</th>
                        <th style={styles.th}><button type="button" style={styles.sortButton} onClick={() => toggleRelationSort("nroDocumento")}>Documento{renderSortIndicator(relationSort, "nroDocumento")}</button></th>
                        <th style={styles.th}><button type="button" style={styles.sortButton} onClick={() => toggleRelationSort("cliente")}>Cliente{renderSortIndicator(relationSort, "cliente")}</button></th>
                        <th style={styles.th}><button type="button" style={styles.sortButton} onClick={() => toggleRelationSort("area")}>Area{renderSortIndicator(relationSort, "area")}</button></th>
                        <th style={styles.th}><button type="button" style={styles.sortButton} onClick={() => toggleRelationSort("ubicacion")}>Ubicacion{renderSortIndicator(relationSort, "ubicacion")}</button></th>
                        <th style={styles.th}><button type="button" style={styles.sortButton} onClick={() => toggleRelationSort("fechaInicio")}>Inicio{renderSortIndicator(relationSort, "fechaInicio")}</button></th>
                        <th style={styles.th}><button type="button" style={styles.sortButton} onClick={() => toggleRelationSort("fechaFin")}>Fin{renderSortIndicator(relationSort, "fechaFin")}</button></th>
                      </tr>
                      <tr>
                        <th style={styles.thFilter}><input value={relationFilters.nombreEmpleado} onChange={(event) => setRelationFilters((current) => ({ ...current, nombreEmpleado: event.target.value }))} style={styles.filterInput} placeholder="Filtrar" /></th>
                        <th style={styles.thFilter}>
                          <FilterCombo
                            label="Empresa"
                            options={relationFilterOptions.empresa}
                            selectedValues={relationFilters.empresa}
                            onChange={(values) => setRelationFilters((current) => ({ ...current, empresa: values }))}
                          />
                        </th>
                        <th style={styles.thFilter}></th>
                        <th style={styles.thFilter}>
                          <FilterCombo
                            label="Estado contrato"
                            options={relationFilterOptions.estadoContrato}
                            selectedValues={relationFilters.estadoContrato}
                            onChange={(values) => setRelationFilters((current) => ({ ...current, estadoContrato: values }))}
                          />
                        </th>
                        <th style={styles.thFilter}></th>
                        <th style={styles.thFilter}>
                          <FilterCombo
                            label="Aprob. pendiente"
                            options={relationFilterOptions.aprobacionPendiente}
                            selectedValues={relationFilters.aprobacionPendiente}
                            onChange={(values) => setRelationFilters((current) => ({ ...current, aprobacionPendiente: values }))}
                          />
                        </th>
                        <th style={styles.thFilter}></th>
                        <th style={styles.thFilter}></th>
                        <th style={styles.thFilter}><input value={relationFilters.nroDocumento} onChange={(event) => setRelationFilters((current) => ({ ...current, nroDocumento: event.target.value }))} style={styles.filterInput} placeholder="Filtrar" /></th>
                        <th style={styles.thFilter}>
                          <FilterCombo
                            label="Cliente"
                            options={relationFilterOptions.cliente}
                            selectedValues={relationFilters.cliente}
                            onChange={(values) => setRelationFilters((current) => ({ ...current, cliente: values }))}
                          />
                        </th>
                        <th style={styles.thFilter}>
                          <FilterCombo
                            label="Area"
                            options={relationFilterOptions.area}
                            selectedValues={relationFilters.area}
                            onChange={(values) => setRelationFilters((current) => ({ ...current, area: values }))}
                          />
                        </th>
                        <th style={styles.thFilter}>
                          <FilterCombo
                            label="Ubicacion"
                            options={relationFilterOptions.ubicacion}
                            selectedValues={relationFilters.ubicacion}
                            onChange={(values) => setRelationFilters((current) => ({ ...current, ubicacion: values }))}
                          />
                        </th>
                        <th style={styles.thFilter}><input value={relationFilters.fechaInicio} onChange={(event) => setRelationFilters((current) => ({ ...current, fechaInicio: event.target.value }))} style={styles.filterInput} placeholder="dd/mm/aaaa" /></th>
                        <th style={styles.thFilter}><input value={relationFilters.fechaFin} onChange={(event) => setRelationFilters((current) => ({ ...current, fechaFin: event.target.value }))} style={styles.filterInput} placeholder="dd/mm/aaaa" /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAndSortedRelationRows.length === 0 ? (
                        <tr>
                          <td style={styles.emptyTableCell} colSpan={14}>
                            No se encontraron empleados en la relacion del store.
                          </td>
                        </tr>
                      ) : (
                        relationTableRowsWithMonths.map((item) => {
                          const isProcessingThirdApproval = processingRelationKey === item.key && saving;

                          return (
                        <tr key={item.key}>
                          <td style={{ ...styles.td, ...styles.employeeNameCell }} title={item.nombreEmpleado}>
                            {item.nombreEmpleado}
                          </td>
                          <td style={styles.td}>{item.empresa}</td>
                          <td style={{ ...styles.td, ...styles.documentRouteCell }}>
                            {(() => {
                              const hasTemplates = hasContractTemplatesLoaded(item.empresa);
                              if (!hasTemplates) {
                                return (
                                  <div style={styles.documentHint}>
                                    Sin formatos cargados para {item.empresa || "esta empresa"}
                                  </div>
                                );
                              }

                              const defaultFamily = resolveContractTemplateFamily(item);
                              const savedSelection = documentSelections[item.key];
                              const selection: ContractTemplateSelection = {
                                family: savedSelection?.family || defaultFamily,
                                stage: savedSelection?.stage || "",
                              };
                              const familyOptions = CONTRACT_TEMPLATE_FAMILIES;
                              const canPickTemplateControls =
                                normalizeText(item.estadoContrato) === "vigente" ||
                                normalizeText(item.aprobacionPendiente) === "3era aprobacion";
                              const canPickStage = !!selection.family && canPickTemplateControls;
                              const isOpeningTemplate = openingTemplateKey === item.key;

                              return (
                                <div style={styles.documentCell}>
                                  <div style={styles.documentControls}>
                                    <label style={styles.documentControl}>
                                      <select
                                        value={selection.family}
                                        onChange={(event) =>
                                          updateDocumentSelection(item.key, {
                                            family: event.target.value as ContractTemplateFamilyKey | "",
                                            stage: "",
                                          })
                                        }
                                        style={{
                                          ...styles.documentSelect,
                                          ...(canPickTemplateControls ? {} : styles.documentSelectDisabled),
                                        }}
                                        disabled={!canPickTemplateControls}
                                      >
                                        <option value="">Seleccione...</option>
                                        {familyOptions.map((option) => (
                                          <option key={option.key} value={option.key}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>

                                    <div style={styles.documentStageRow}>
                                      <label style={styles.documentControl}>
                                        <select
                                          value={selection.stage}
                                          onChange={(event) =>
                                            updateDocumentSelection(item.key, {
                                              stage: event.target.value as ContractTemplateStageKey | "",
                                            })
                                          }
                                          style={{
                                            ...styles.documentSelect,
                                            ...(canPickStage ? {} : styles.documentSelectDisabled),
                                          }}
                                          disabled={!canPickStage}
                                        >
                                          <option value="">Seleccione...</option>
                                          {CONTRACT_TEMPLATE_STAGES.map((option) => (
                                            <option key={option.key} value={option.key}>
                                              {option.label}
                                            </option>
                                          ))}
                                        </select>
                                      </label>

                                      <div style={styles.documentActions}>
                                        <button
                                          type="button"
                                          onClick={() => handleViewTemplate(item)}
                                          style={{
                                            ...styles.templateIconButton,
                                            ...(canPickTemplateControls ? {} : styles.templateIconButtonDisabled),
                                          }}
                                          disabled={!canPickTemplateControls}
                                          title="Abrir plantilla original de SharePoint"
                                          aria-label="Ver plantilla"
                                        >
                                          <Eye size={16} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void handleOpenTemplate(item)}
                                          style={{
                                            ...styles.templateIconButton,
                                            ...(canPickTemplateControls && !isOpeningTemplate ? {} : styles.templateIconButtonDisabled),
                                          }}
                                          disabled={!canPickTemplateControls || isOpeningTemplate}
                                          title={isOpeningTemplate ? "Generando plantilla..." : "Generar y abrir plantilla"}
                                          aria-label="Abrir plantilla"
                                        >
                                          <FileDown size={16} />
                                        </button>
                                      </div>
                                    </div>
                                  </div>

                                  <div style={styles.documentHint}>
                                    {selection.family
                                      ? getTemplateFamilyLabelOrEmpty(selection.family)
                                      : "Necesidades mercado, Extranjero o Servicio especifico"}
                                    {selection.stage ? ` / ${getTemplateStageLabelOrEmpty(selection.stage)}` : ""}
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                          <td style={styles.td}>
                            <span style={getContractStatusBadgeStyle(item.estadoContrato)}>{item.estadoContrato}</span>
                          </td>
                          <td style={styles.td}>
                            {item.estadoContrato === "VIGENTE" ? "-" : item.meses || "-"}
                          </td>
                          <td style={styles.td}>
                            {item.aprobacionPendiente ? (
                              <span style={getContractStatusBadgeStyle("X VENCER")}>{item.aprobacionPendiente}</span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td
                            style={
                              canEditRelationEndDate(item)
                                ? styles.relationDateCellActive
                                : styles.relationDateCellInactive
                            }
                          >
                            <input
                              type="date"
                              value={getRelationEditableEndDate(item)}
                              onChange={(event) =>
                                setRelationNewEndDates((current) => ({
                                  ...current,
                                  [getRelationRowKey(item)]: event.target.value,
                                }))
                              }
                              onBlur={() => void handleRelationEndDateBlur(item)}
                              style={
                                canEditRelationEndDate(item)
                                  ? styles.relationInputDateActive
                                  : styles.relationInputDateInactive
                              }
                              disabled={!canEditRelationEndDate(item) || savingRelationEmployeeId === item.idEmpleado}
                            />
                          </td>
                          <td style={styles.td}>
                            <div style={styles.relationActionGroup}>
                              <button
                                type="button"
                                style={styles.secondaryButton}
                                title="Ver detalle"
                                aria-label="Ver detalle"
                                disabled={!item.idEmpleado || item.idEmpleado <= 0}
                                onClick={() => {
                                  if (!item.idEmpleado || item.idEmpleado <= 0) {
                                    return;
                                  }

                                  setSelectedEmployeeId(item.idEmpleado);
                                  setEmployeeSearch(item.nombreEmpleado);
                                  setActiveTab("detalle");
                                  setError("");
                                  setSuccess("");
                                }}
                              >
                                <ChevronRight size={14} />
                              </button>
                              <button
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                style={getDisabledActionButtonStyle(
                                  styles.approvalButtonInline,
                                  !canApproveRelationStep(item, 2) || isProcessingThirdApproval
                                )}
                                disabled={!canApproveRelationStep(item, 2) || isProcessingThirdApproval}
                                onClick={() => void handleRelationApprove(item, 2)}
                              >
                                <Save size={14} />
                                2da
                              </button>
                              <button
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                style={getDisabledActionButtonStyle(
                                  styles.approvalButtonInlineAlt,
                                  !canApproveRelationStep(item, 3) || isProcessingThirdApproval
                                )}
                                disabled={!canApproveRelationStep(item, 3) || isProcessingThirdApproval}
                                onClick={() => void handleRelationApprove(item, 3)}
                              >
                                {isProcessingThirdApproval ? (
                                  <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />
                                ) : (
                                  <Save size={14} />
                                )}
                                {isProcessingThirdApproval ? "Procesando..." : "3era"}
                              </button>
                            </div>
                          </td>
                          <td style={styles.td}>{item.nroDocumento}</td>
                          <td style={styles.td}>{item.cliente}</td>
                          <td style={styles.td}>{item.area}</td>
                          <td style={styles.td}>{item.ubicacion}</td>
                          <td style={styles.td}>{formatDateLabel(item.fechaInicio)}</td>
                          <td style={styles.td}>{formatDateLabel(item.fechaFin)}</td>
                        </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div style={styles.searchRow}>
              <label style={styles.fieldBlock}>
                <span style={styles.label}>Buscar empleado</span>
                <div style={styles.inputWithIcon}>
                  <Search size={16} />
                  <input
                    value={employeeSearch}
                    onChange={(event) => setEmployeeSearch(event.target.value)}
                    placeholder="Escriba el nombre del empleado"
                    style={styles.input}
                  />
                </div>
              </label>

              <label style={styles.fieldBlock}>
                <span style={styles.label}>Empleado</span>
                <select
                  value={selectedEmployeeId || ""}
                  onChange={(event) => setSelectedEmployeeId(Number(event.target.value) || 0)}
                  style={styles.select}
                  disabled={loadingEmployees}
                >
                  <option value="">Seleccione un empleado</option>
                  {filteredEmployees.map((item) => (
                    <option key={item.idEmpleado} value={item.idEmpleado}>
                      {item.nombreEmpleado}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                style={styles.refreshButton}
                onClick={() => {
                  if (employee?.idEmpleado) {
                    setSelectedEmployeeId(employee.idEmpleado);
                  }
                }}
                disabled={loadingDetail || selectedEmployeeId <= 0}
              >
                <RefreshCw size={16} />
                Recargar
              </button>
            </div>

            {loadingDetail ? (
              <div style={styles.emptyState}>Cargando contrato del empleado...</div>
            ) : !employee ? (
              <div style={styles.emptyState}>Seleccione un empleado para consultar su vigencia contractual.</div>
            ) : (
              <>
            <div style={styles.topSectionGrid}>
              <div style={styles.profileCard}>
                <div style={styles.profileHeader}>
                  <EmployeePhoto idEmpleado={employee.idEmpleado} nombreEmpleado={employee.nombreEmpleado} />

                  <div style={styles.profileMain}>
                    <h2 style={styles.profileName}>{employee.nombreEmpleado || `Empleado ${employee.idEmpleado}`}</h2>
                    <p style={styles.profileMeta}>
                      {employee.empresa || "Sin empresa"}
                      {employee.cliente ? ` | ${employee.cliente}` : ""}
                      {employee.area ? ` | ${employee.area}` : ""}
                      {employee.ubicacion ? ` | ${employee.ubicacion}` : ""}
                    </p>
                    <p style={styles.profileContact}>
                      {employee.correo || "Sin correo"}
                      {employee.telefono ? ` | ${employee.telefono}` : ""}
                      {employee.nroDocumento ? ` | ${employee.nroDocumento}` : ""}
                    </p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmit} style={styles.formCard}>
                <div style={styles.formStack}>
                  {pendingRequest ? (
                    <div style={styles.pendingBox}>
                      <div style={styles.pendingBoxTitle}>Solicitud de vigencia</div>
                      <div style={styles.pendingBoxText}>
                        Estado: {pendingRequest.estadoSolicitud || "-"} | Aprobaciones: {pendingRequest.aprobacionesRealizadas}/{pendingRequest.aprobacionesRequeridas}
                      </div>
                      <div style={styles.pendingBoxText}>
                        Nueva fecha fin solicitada: {formatDateLabel(pendingRequest.nuevaFechaFinLaboral)}
                      </div>
                      <div style={styles.pendingBoxText}>
                        La 1ra aprobacion se registra automaticamente al guardar la nueva fecha.
                      </div>
                    </div>
                  ) : null}

                  <div style={styles.datePairRow}>
                    <label style={styles.fieldBlock}>
                      <span style={styles.label}>Fecha inicio laboral</span>
                      <input value={toInputDate(employee.fechaIniLaboral)} readOnly style={styles.inputReadOnly} />
                    </label>

                    <label style={styles.fieldBlock}>
                      <span style={styles.label}>Fecha fin actual</span>
                      <input value={toInputDate(employee.fechaFinLaboral)} readOnly style={styles.inputReadOnly} />
                    </label>
                    <label style={styles.fieldBlock}>
                      <span style={styles.label}>Nueva fecha fin</span>
                      <input
                        type="date"
                        value={newEndDate}
                        onChange={(event) => setNewEndDate(event.target.value)}
                        onBlur={() => void handleNewEndDateBlur()}
                        style={
                          canEditPendingApprovalStep(pendingApprovalStep)
                            ? styles.inputDate
                            : pendingApprovalStep !== null
                              ? styles.inputReadOnly
                              : styles.inputDate
                        }
                        disabled={saving}
                      />
                    </label>
                  </div>

                  <label style={styles.fieldBlock}>
                    <span style={styles.label}>Observacion</span>
                    <textarea
                      value={observation}
                      onChange={(event) => setObservation(event.target.value)}
                      rows={4}
                      style={styles.textarea}
                      placeholder="Detalle de la renovacion o ampliacion del contrato"
                      disabled={saving}
                    />
                  </label>
                </div>

                <div style={styles.formActions}>
                  <button type="submit" style={styles.primaryButton} disabled={saving}>
                    <Save size={16} />
                    {saving ? "Guardando..." : "Registrar 1ra aprobacion"}
                  </button>
                </div>
              </form>
            </div>

            <div style={styles.historyPanel}>
              <div style={styles.historyHeader}>
                <h2 style={styles.historyTitle}>Historial contractual</h2>
                <span style={styles.historyCount}>{history.length} registro(s)</span>
              </div>

              {history.length === 0 ? (
                <div style={styles.emptyState}>No hay historial registrado para este empleado.</div>
              ) : (
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Movimiento</th>
                        <th style={styles.th}>Inicio</th>
                        <th style={styles.th}>Fin</th>
                        <th style={styles.th}>Baja</th>
                        <th style={styles.th}>Observacion</th>
                        <th style={styles.th}>Usuario</th>
                        <th style={styles.th}>Fecha registro</th>
                        <th style={styles.th}>Accion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((item) => (
                        <HistoryRow
                          key={item.idHistorialLaboral}
                          item={item}
                          onDeactivate={handleDeactivateHistory}
                          deactivatingId={deactivatingId}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function HistoryRow({
  item,
  onDeactivate,
  deactivatingId,
}: {
  item: ContratoEmpleadoHistorial;
  onDeactivate: (item: ContratoEmpleadoHistorial) => Promise<void>;
  deactivatingId: number | null;
}) {
  const inactive = item.idActivo === false;
  return (
    <tr style={inactive ? styles.historyRowInactive : undefined}>
      <td style={styles.td}>{item.tipoMovimiento || "-"}</td>
      <td style={styles.td}>{formatDateLabel(item.fechaIniLaboral)}</td>
      <td style={styles.td}>{formatDateLabel(item.fechaFinLaboral)}</td>
      <td style={styles.td}>{formatDateLabel(item.fechaBaja)}</td>
      <td style={styles.td}>{item.observacion || item.motivoMovimiento || "-"}</td>
      <td style={styles.td}>{item.usuarioCre || "-"}</td>
      <td style={styles.td}>{item.fechaCreacion ? item.fechaCreacion.replace("T", " ") : "-"}</td>
      <td style={styles.td}>
        {inactive ? (
          <span style={styles.inactiveTag}>Desactivado</span>
        ) : (
          <button
            type="button"
            style={styles.dangerButton}
            onClick={() => void onDeactivate(item)}
            disabled={deactivatingId === item.idHistorialLaboral}
          >
            <Ban size={14} />
            {deactivatingId === item.idHistorialLaboral ? "Desactivando..." : "Desactivar"}
          </button>
        )}
      </td>
    </tr>
  );
}

function FilterCombo({
  label,
  options,
  selectedValues,
  onChange,
}: {
  label: string;
  options: string[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const visibleOptions = useMemo(() => {
    const query = normalizeText(search);
    return options.filter((option) => !query || normalizeText(option).includes(query));
  }, [options, search]);

  const summary = selectedValues.length === 0 ? "Todos" : `${selectedValues.length} seleccionado(s)`;

  return (
    <div ref={containerRef} style={styles.filterComboWrap}>
      <button
        type="button"
        style={styles.filterComboButton}
        onClick={() => setOpen((current) => !current)}
      >
        <span style={styles.filterComboLabel}>{summary}</span>
        <span style={styles.filterComboCaret}>{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <div style={styles.filterComboMenu}>
          <div style={styles.filterComboTitle}>{label}</div>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Buscar ${label.toLowerCase()}...`}
            style={styles.filterComboSearch}
          />
          <div style={styles.filterComboActions}>
            <button
              type="button"
              style={styles.filterComboActionButton}
              onClick={() => onChange(options.slice())}
              disabled={options.length === 0}
            >
              Seleccionar todo
            </button>
            <button
              type="button"
              style={styles.filterComboClearButton}
              onClick={() => onChange([])}
            >
              Limpiar
            </button>
          </div>
          <div style={styles.filterComboOptions}>
            {visibleOptions.length === 0 ? (
              <div style={styles.filterComboEmpty}>Sin resultados</div>
            ) : (
              visibleOptions.map((option) => {
                const checked = selectedValues.includes(option);
                return (
                  <label key={option} style={styles.filterComboOption}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        onChange(
                          checked
                            ? selectedValues.filter((value) => value !== option)
                            : [...selectedValues, option]
                        )
                      }
                    />
                    <span>{option}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getContractStatusBadgeStyle(status: string): CSSProperties {
  switch (status) {
    case "VENCIDO":
      return styles.contractStatusExpired;
    case "X VENCER":
      return styles.contractStatusWarning;
    case "SIN FECHA":
      return styles.contractStatusNoDate;
    default:
      return styles.contractStatusActive;
  }
}

function renderSortIndicator(
  sort: {
    key: string;
    direction: "asc" | "desc";
  },
  key: string
) {
  if (sort.key !== key) {
    return "  ";
  }

  return sort.direction === "asc" ? " ↑" : " ↓";
}

function getDisabledActionButtonStyle(baseStyle: CSSProperties, disabled: boolean): CSSProperties {
  if (!disabled) {
    return baseStyle;
  }

  return {
    ...baseStyle,
    opacity: 0.45,
    cursor: "not-allowed",
    boxShadow: "none",
    filter: "grayscale(0.2)",
  };
}

function getPendingApprovalStep(request: ContratoEmpleadoSolicitudVigencia | null): 2 | 3 | null {
  if (!request || (request.estadoSolicitud ?? "").toUpperCase() !== "PENDIENTE") {
    return null;
  }

  const aprobacionesRealizadas =
    request.aprobacionesRealizadas ??
    [
      request.aprobacion1Fecha,
      request.aprobacion2Fecha,
      request.aprobacion3Fecha,
      request.aprobacion1IdEmpleado,
      request.aprobacion2IdEmpleado,
      request.aprobacion3IdEmpleado,
    ].filter((value) => value !== null && value !== undefined && value !== "").length;
  if (aprobacionesRealizadas >= 2) {
    return 3;
  }

  if (aprobacionesRealizadas >= 1) {
    return 2;
  }

  return 2;
}

function getRelationPendingApprovalLabel(item: Pick<RelationTableRow, "nuevaFechaFinLaboral" | "aprobacion1Fecha" | "aprobacion2Fecha" | "aprobacion3Fecha">): string {
  const step = getRelationPendingApprovalStep(item);
  if (step === 2) {
    return "2da aprobacion";
  }

  if (step === 3) {
    return "3era aprobacion";
  }

  return "";
}

const styles: Record<string, CSSProperties> = {
  page: {
    padding: 24,
    background: "#f5f7fb",
    minHeight: "100%",
    color: "#0f172a",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 20,
  },
  breadcrumb: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#475569",
    marginBottom: 8,
  },
  title: {
    margin: 0,
    fontSize: 30,
    lineHeight: 1.1,
    color: "#17143a",
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 0,
    color: "#475569",
    maxWidth: 760,
  },
  headerIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)",
    color: "#3730a3",
    flexShrink: 0,
  },
  panel: {
    background: "#ffffff",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    padding: 20,
    boxShadow: "0 16px 40px rgba(15, 23, 42, 0.06)",
  },
  tabsRow: {
    display: "inline-flex",
    gap: 8,
    padding: 6,
    borderRadius: 14,
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    marginBottom: 18,
  },
  tabButton: {
    minHeight: 40,
    borderRadius: 10,
    border: "none",
    background: "transparent",
    color: "#1e3a8a",
    padding: "0 18px",
    fontWeight: 800,
    cursor: "pointer",
  },
  tabButtonActive: {
    minHeight: 40,
    borderRadius: 10,
    border: "none",
    background: "#2563eb",
    color: "#ffffff",
    padding: "0 18px",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 10px 24px rgba(37, 99, 235, 0.22)",
  },
  relationIntro: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    color: "#17143a",
  },
  sectionText: {
    margin: "6px 0 0",
    color: "#475569",
    maxWidth: 760,
  },
  profileCard: {
    background: "#FFFFFF",
    borderRadius: 24,
    padding: 22,
    border: "1px solid #E2E8F0",
    boxShadow: "0 18px 42px rgba(15, 23, 42, 0.08)",
    marginBottom: 18,
  },
  profileHeader: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr)",
    gap: 20,
    alignItems: "center",
  },
  photoFrame: {
    width: 170,
    height: 210,
    borderRadius: 22,
    overflow: "hidden",
    border: "1px solid #E2E8F0",
    boxShadow: "0 16px 30px rgba(15,23,42,0.10)",
    background: "linear-gradient(180deg, #F8FAFC, #E2E8F0)",
  },
  photo: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  photoPlaceholder: {
    width: 170,
    height: 210,
    borderRadius: 22,
    display: "grid",
    placeItems: "center",
    alignContent: "center",
    gap: 8,
    border: "1px dashed #CBD5E1",
    color: "#64748B",
    background: "linear-gradient(180deg, #F8FAFC, #FFFFFF)",
  },
  photoPlaceholderTitle: {
    fontWeight: 800,
    color: "#0F172A",
  },
  photoPlaceholderText: {
    fontSize: 13,
    color: "#64748B",
  },
  profileMain: {
    display: "grid",
    gap: 10,
  },
  profileBadge: {
    display: "inline-flex",
    width: "fit-content",
    padding: "6px 10px",
    borderRadius: 999,
    background: "#DBEAFE",
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  profileName: {
    margin: 0,
    fontSize: 30,
    lineHeight: 1.1,
    fontWeight: 900,
    color: "#0F172A",
  },
  profileMeta: {
    margin: 0,
    fontSize: 15,
    color: "#475569",
    fontWeight: 600,
    lineHeight: 1.5,
  },
  profileContact: {
    margin: 0,
    fontSize: 14,
    color: "#334155",
    fontWeight: 700,
    lineHeight: 1.4,
  },
  searchRow: {
    display: "grid",
    gridTemplateColumns: "minmax(240px, 1fr) minmax(280px, 1fr) auto",
    gap: 14,
    alignItems: "end",
    marginBottom: 18,
  },
  fieldBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
  },
  label: {
    fontSize: 13,
    fontWeight: 700,
    color: "#334155",
  },
  inputWithIcon: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "0 12px",
    background: "#fff",
    color: "#64748b",
    height: 44,
  },
  input: {
    border: "none",
    outline: "none",
    width: "100%",
    fontSize: 14,
    color: "#0f172a",
    background: "transparent",
  },
  select: {
    height: 44,
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    padding: "0 12px",
    fontSize: 14,
    color: "#0f172a",
    background: "#fff",
  },
  refreshButton: {
    height: 44,
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "0 14px",
    cursor: "pointer",
    fontWeight: 700,
  },
  errorBox: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#b91c1c",
    borderRadius: 10,
    padding: "12px 14px",
    marginBottom: 16,
  },
  successBox: {
    background: "#f0fdf4",
    border: "1px solid #86efac",
    color: "#166534",
    borderRadius: 10,
    padding: "12px 14px",
    marginBottom: 16,
  },
  pendingBox: {
    borderRadius: 12,
    border: "1px solid #f59e0b",
    background: "#fffbeb",
    padding: "12px 14px",
    display: "grid",
    gap: 4,
  },
  pendingBoxTitle: {
    fontSize: 13,
    fontWeight: 800,
    color: "#92400e",
    textTransform: "uppercase" as const,
    letterSpacing: 0.3,
  },
  pendingBoxText: {
    fontSize: 13,
    color: "#78350f",
  },
  emptyState: {
    borderRadius: 12,
    border: "1px dashed #cbd5e1",
    padding: 28,
    textAlign: "center",
    color: "#64748b",
    background: "#f8fafc",
  },
  emptyTableCell: {
    padding: "28px 14px",
    textAlign: "center" as const,
    color: "#64748b",
    background: "#f8fafc",
    fontWeight: 600,
  },
  topSectionGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.6fr) minmax(320px, 0.9fr)",
    gap: 18,
    alignItems: "start",
    marginBottom: 18,
  },
  historyRowInactive: {
    background: "#fef2f2",
  },
  formCard: {
    borderRadius: 12,
    border: "1px solid #dbeafe",
    background: "#f8fbff",
    padding: 18,
  },
  formStack: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 14,
  },
  datePairRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 14,
  },
  inputReadOnly: {
    height: 44,
    borderRadius: 10,
    border: "1px solid #d1d5db",
    padding: "0 12px",
    background: "#f8fafc",
    color: "#475569",
  },
  inputDate: {
    height: 44,
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    padding: "0 12px",
    background: "#fff",
    color: "#0f172a",
  },
  textarea: {
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    padding: 12,
    resize: "vertical",
    fontFamily: "inherit",
    fontSize: 14,
    color: "#0f172a",
  },
  formActions: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: 16,
  },
  primaryButton: {
    height: 44,
    borderRadius: 10,
    border: "none",
    background: "#2563eb",
    color: "#fff",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "0 18px",
    cursor: "pointer",
    fontWeight: 700,
  },
  secondaryButton: {
    minHeight: 34,
    borderRadius: 10,
    border: "1px solid #bfdbfe",
    background: "#eff6ff",
    color: "#1d4ed8",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "0 12px",
    cursor: "pointer",
    fontWeight: 700,
  },
  relationActionGroup: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    minWidth: 260,
  },
  approvalButtonInline: {
    minHeight: 34,
    borderRadius: 10,
    border: "1px solid #fde68a",
    background: "#fffbeb",
    color: "#92400e",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "0 12px",
    cursor: "pointer",
    fontWeight: 700,
  },
  approvalButtonInlineAlt: {
    minHeight: 34,
    borderRadius: 10,
    border: "1px solid #c4b5fd",
    background: "#f5f3ff",
    color: "#6d28d9",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "0 12px",
    cursor: "pointer",
    fontWeight: 700,
  },
  historyPanel: {
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    background: "#fff",
    overflow: "hidden",
  },
  historyHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "16px 18px",
    borderBottom: "1px solid #e2e8f0",
    background: "#f8fafc",
  },
  historyTitle: {
    margin: 0,
    fontSize: 18,
    color: "#17143a",
  },
  historyCount: {
    fontSize: 13,
    fontWeight: 700,
    color: "#475569",
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 1380,
  },
  th: {
    textAlign: "left",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#475569",
    padding: "12px 14px",
    borderBottom: "1px solid #e2e8f0",
    background: "#f8fafc",
  },
  thFilter: {
    padding: "10px 14px",
    borderBottom: "1px solid #e2e8f0",
    background: "#f1f5f9",
  },
  sortButton: {
    border: "none",
    background: "transparent",
    padding: 0,
    margin: 0,
    color: "#475569",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase" as const,
    letterSpacing: 0.4,
    cursor: "pointer",
  },
  filterInput: {
    width: "100%",
    minWidth: 90,
    height: 34,
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    padding: "0 10px",
    fontSize: 12,
    color: "#0f172a",
    background: "#ffffff",
  },
  relationDateCellActive: {
    background: "#ecfdf5",
    verticalAlign: "top",
    paddingTop: 12,
  },
  relationDateCellInactive: {
    background: "#f8fafc",
    verticalAlign: "top",
    paddingTop: 12,
  },
  relationInputDateActive: {
    width: "100%",
    minWidth: 132,
    height: 34,
    borderRadius: 8,
    border: "1px solid #86efac",
    padding: "0 10px",
    fontSize: 12,
    color: "#166534",
    background: "#f0fdf4",
  },
  relationInputDateInactive: {
    width: "100%",
    minWidth: 132,
    height: 34,
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    padding: "0 10px",
    fontSize: 12,
    color: "#64748b",
    background: "#f8fafc",
  },
  filterComboWrap: {
    position: "relative",
    width: "100%",
    minWidth: 130,
  },
  filterComboButton: {
    width: "100%",
    minHeight: 36,
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#0f172a",
    padding: "0 10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
  },
  filterComboLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  filterComboCaret: {
    fontSize: 10,
    color: "#64748b",
  },
  filterComboMenu: {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    zIndex: 30,
    width: 280,
    maxHeight: 320,
    overflow: "auto",
    borderRadius: 12,
    border: "1px solid #dbeafe",
    background: "#ffffff",
    boxShadow: "0 18px 40px rgba(15, 23, 42, 0.12)",
    padding: 10,
  },
  filterComboTitle: {
    fontSize: 11,
    fontWeight: 800,
    color: "#334155",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  filterComboSearch: {
    width: "100%",
    height: 36,
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    padding: "0 10px",
    fontSize: 12,
    color: "#0f172a",
    marginBottom: 8,
  },
  filterComboActions: {
    display: "flex",
    gap: 8,
    marginBottom: 8,
  },
  filterComboActionButton: {
    flex: 1,
    height: 32,
    borderRadius: 8,
    border: "1px solid #c7d2fe",
    background: "#eef2ff",
    color: "#3730a3",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 700,
  },
  filterComboClearButton: {
    flex: 1,
    height: 32,
    borderRadius: 8,
    border: "1px solid #fecaca",
    background: "#fef2f2",
    color: "#b91c1c",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 700,
  },
  filterComboOptions: {
    display: "grid",
    gap: 6,
  },
  filterComboOption: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    color: "#0f172a",
    padding: "4px 2px",
  },
  filterComboEmpty: {
    fontSize: 12,
    color: "#64748b",
    padding: "6px 2px",
  },
  filterMultiSelect: {
    width: "100%",
    minWidth: 120,
    minHeight: 72,
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    padding: 6,
    fontSize: 12,
    color: "#0f172a",
    background: "#ffffff",
  },
  td: {
    padding: "12px 14px",
    borderBottom: "1px solid #eef2f7",
    fontSize: 14,
    color: "#0f172a",
    verticalAlign: "top",
  },
  employeeNameCell: {
    maxWidth: 180,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  sharePointLink: {
    display: "inline-block",
    width: "fit-content",
    color: "#1d4ed8",
    fontWeight: 700,
    textDecoration: "underline",
  },
  sharePointButton: {
    display: "inline-flex",
    width: "fit-content",
    color: "#1d4ed8",
    fontWeight: 700,
    textDecoration: "underline",
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
  },
  sharePointButtonSecondary: {
    display: "inline-flex",
    width: "fit-content",
    color: "#2563eb",
    fontWeight: 700,
    textDecoration: "underline",
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
    opacity: 0.9,
  },
  templateIconButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 999,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#1d4ed8",
    cursor: "pointer",
    padding: 0,
    flex: "0 0 auto",
  },
  templateIconButtonDisabled: {
    opacity: 0.38,
    cursor: "not-allowed",
    background: "#f8fafc",
    color: "#94a3b8",
  },
  documentCell: {
    display: "grid",
    gap: 8,
    minWidth: 0,
  },
  documentRouteHeader: {
    minWidth: 420,
  },
  documentRouteCell: {
    minWidth: 420,
  },
  documentControls: {
    display: "flex",
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    flexWrap: "nowrap",
  },
  documentStageRow: {
    display: "flex",
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    flexWrap: "nowrap",
  },
  documentActions: {
    display: "flex",
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  documentControl: {
    display: "grid",
    gap: 4,
    flex: "1 1 0",
    minWidth: 0,
  },
  documentControlLabel: {
    fontSize: 11,
    fontWeight: 800,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  documentSelect: {
    width: "100%",
    minWidth: 0,
    height: 34,
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    padding: "0 10px",
    fontSize: 12,
    color: "#0f172a",
    background: "#ffffff",
  },
  documentSelectDisabled: {
    opacity: 0.55,
    background: "#f8fafc",
    color: "#94a3b8",
    cursor: "not-allowed",
  },
  documentHint: {
    fontSize: 12,
    color: "#475569",
    fontWeight: 600,
    lineHeight: 1.35,
  },
  documentPathText: {
    fontSize: 12,
    color: "#475569",
    wordBreak: "break-word",
    lineHeight: 1.35,
  },
  dangerButton: {
    minHeight: 34,
    borderRadius: 10,
    border: "1px solid #fecaca",
    background: "#fff1f2",
    color: "#be123c",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "0 12px",
    cursor: "pointer",
    fontWeight: 700,
  },
  inactiveTag: {
    display: "inline-flex",
    padding: "4px 10px",
    borderRadius: 999,
    background: "#fee2e2",
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase" as const,
    letterSpacing: 0.3,
  },
  contractStatusExpired: {
    display: "inline-flex",
    padding: "4px 10px",
    borderRadius: 999,
    background: "#fee2e2",
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase" as const,
    letterSpacing: 0.3,
  },
  contractStatusWarning: {
    display: "inline-flex",
    padding: "4px 10px",
    borderRadius: 999,
    background: "#fef3c7",
    color: "#b45309",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase" as const,
    letterSpacing: 0.3,
  },
  contractStatusNoDate: {
    display: "inline-flex",
    padding: "4px 10px",
    borderRadius: 999,
    background: "#e2e8f0",
    color: "#475569",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase" as const,
    letterSpacing: 0.3,
  },
  contractStatusActive: {
    display: "inline-flex",
    padding: "4px 10px",
    borderRadius: 999,
    background: "#dcfce7",
    color: "#166534",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase" as const,
    letterSpacing: 0.3,
  },
};
