import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  descargarPdfBoleta,
  descargarZipPeriodo,
  importarXmlPlanilla,
  validarXmlPlanilla,
} from "../../api/planillaBoletaApi";
import type {
  PlanillaXmlCargaMasivaResponseDto,
  PlanillaXmlResultadoDto,
} from "../../models/planillaBoleta";
import { getHttpErrorMessage } from "../../utils/httpError";

type SelectedXmlFile = {
  id: string;
  file: File;
  clientError: string;
};

type ColumnConfig = {
  key: keyof PlanillaXmlResultadoDto;
  label: string;
  width: string;
};

type ColumnFilterDropdownProps = {
  column: ColumnConfig;
  filtroColumnaMenuRef: React.RefObject<HTMLDivElement | null>;
  filtrosColumnas: Record<string, string[]>;
  setFiltrosColumnas: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  opcionesFiltroPorColumna: Record<string, string[]>;
  filtroBusqueda: string;
  setFiltroBusqueda: (value: string) => void;
};

const MAX_FILE_SIZE_BYTES = 10_000_000;

const columns: ColumnConfig[] = [
  { key: "nombreArchivo", label: "NombreArchivo", width: "240px" },
  { key: "estado", label: "Estado", width: "170px" },
  { key: "mensaje", label: "Mensaje", width: "320px" },
  { key: "mensajePdf", label: "MensajePdf", width: "260px" },
  { key: "periodo", label: "Periodo", width: "130px" },
  { key: "numeroDocumento", label: "NumeroDocumento", width: "150px" },
  { key: "nombreTrabajador", label: "NombreTrabajador", width: "220px" },
  { key: "fechaValidacion", label: "FechaValidacion", width: "170px" },
  { key: "fechaImportacion", label: "FechaImportacion", width: "170px" },
];

function ColumnFilterDropdown({
  column,
  filtroColumnaMenuRef,
  filtrosColumnas,
  setFiltrosColumnas,
  opcionesFiltroPorColumna,
  filtroBusqueda,
  setFiltroBusqueda,
}: ColumnFilterDropdownProps) {
  const opciones = (opcionesFiltroPorColumna[column.key] ?? []).filter((opcion) =>
    (opcion || "(Vacio)").toLowerCase().includes(filtroBusqueda.toLowerCase())
  );

  return (
    <div
      ref={filtroColumnaMenuRef}
      onClick={(event) => event.stopPropagation()}
      style={styles.columnFilter}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong style={{ fontSize: 11, color: "#17143A" }}>{column.label}</strong>
        <button
          type="button"
          onClick={() => setFiltrosColumnas((prev) => ({ ...prev, [column.key]: [] }))}
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
          checked={(filtrosColumnas[column.key] ?? []).length === 0}
          onChange={() => setFiltrosColumnas((prev) => ({ ...prev, [column.key]: [] }))}
        />
        <span>(Todas)</span>
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {opciones.map((opcion) => {
          const seleccionadas = filtrosColumnas[column.key] ?? [];
          const checked = seleccionadas.includes(opcion);

          return (
            <label key={`${column.key}-${opcion}`} style={styles.columnFilterItem}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  setFiltrosColumnas((prev) => {
                    const actuales = prev[column.key] ?? [];
                    return {
                      ...prev,
                      [column.key]: checked
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

function createSelectionId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(16).slice(2)}`;
}

function validateSelectedFile(file: File): string {
  if (!file.name.toLowerCase().endsWith(".xml")) {
    return "Solo se permiten archivos .xml.";
  }

  if (file.size <= 0) {
    return "El archivo esta vacio.";
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `El archivo supera el tamano maximo permitido de ${MAX_FILE_SIZE_BYTES} bytes.`;
  }

  return "";
}

function formatDate(value?: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("es-PE");
}

function normalizeColumnValue(value: unknown): string {
  return String(value ?? "").trim();
}

function matchesColumnFilterValue(value: unknown, selectedValues: string[]): boolean {
  if (!selectedValues.length) {
    return true;
  }

  return selectedValues.includes(normalizeColumnValue(value));
}

function getRowColumnValue(row: PlanillaXmlResultadoDto, key: keyof PlanillaXmlResultadoDto): string {
  if (key === "fechaValidacion" || key === "fechaImportacion") {
    return formatDate(row[key] as string | null | undefined);
  }

  return String(row[key] ?? "");
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.summaryCard}>
      <span style={styles.summaryLabel}>{label}</span>
      <strong style={styles.summaryValue}>{value}</strong>
    </div>
  );
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }, 0);
}

export default function ImportarPlanillaXmlPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const filtroColumnaMenuRef = useRef<HTMLDivElement>(null);
  const [files, setFiles] = useState<SelectedXmlFile[]>([]);
  const [resultados, setResultados] = useState<PlanillaXmlResultadoDto[]>([]);
  const [loadingValidate, setLoadingValidate] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [columnaFiltroAbierta, setColumnaFiltroAbierta] = useState<string | null>(null);
  const [filtrosColumnas, setFiltrosColumnas] = useState<Record<string, string[]>>({});
  const [filtroBusqueda, setFiltroBusqueda] = useState("");
  const [sortKey, setSortKey] = useState<keyof PlanillaXmlResultadoDto>("nombreArchivo");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    if (!columnaFiltroAbierta) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (filtroColumnaMenuRef.current && !filtroColumnaMenuRef.current.contains(event.target as Node)) {
        setColumnaFiltroAbierta(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [columnaFiltroAbierta]);

  const hasClientInvalidFiles = useMemo(
    () => files.some((item) => Boolean(item.clientError)),
    [files]
  );

  const canValidate = files.length > 0 && !loadingValidate && !loadingImport;
  const hasValidationErrors = resultados.some((item) => !item.valido);
  const hasValidatedResults = resultados.length > 0;
  const canImport =
    files.length > 0 &&
    hasValidatedResults &&
    !hasValidationErrors &&
    !hasClientInvalidFiles &&
    !loadingValidate &&
    !loadingImport;

  const summary = useMemo(() => {
    if (resultados.length > 0) {
      return {
        totalArchivos: resultados.length,
        validos: resultados.filter((item) => item.valido).length,
        conError: resultados.filter((item) => !item.valido).length,
        importados: resultados.filter((item) => item.importado).length,
        fallidos: resultados.filter((item) => !item.importado).length,
        pdfGenerados: resultados.filter((item) => item.pdfGenerado).length,
        pdfReutilizados: resultados.filter((item) => item.pdfReutilizado).length,
        pdfDisponibles: resultados.filter((item) => item.pdfDisponible).length,
        pdfConError: resultados.filter((item) => item.importado && !item.pdfDisponible).length,
      };
    }

    return {
      totalArchivos: files.length,
      validos: files.filter((item) => !item.clientError).length,
      conError: files.filter((item) => Boolean(item.clientError)).length,
      importados: 0,
      fallidos: 0,
      pdfGenerados: 0,
      pdfReutilizados: 0,
      pdfDisponibles: 0,
      pdfConError: 0,
    };
  }, [files, resultados]);

  const opcionesFiltroPorColumna = useMemo(() => {
    const result: Record<string, string[]> = {};

    columns.forEach((column) => {
      result[column.key] = Array.from(
        new Set(resultados.map((item) => normalizeColumnValue(getRowColumnValue(item, column.key))))
      ).sort((left, right) => left.localeCompare(right, "es", { sensitivity: "base" }));
    });

    return result;
  }, [resultados]);

  const resultadosOrdenados = useMemo(() => {
    const filtered = resultados.filter((item) =>
      columns.every((column) =>
        matchesColumnFilterValue(getRowColumnValue(item, column.key), filtrosColumnas[column.key] ?? [])
      )
    );

    return [...filtered].sort((left, right) => {
      const leftValue = getRowColumnValue(left, sortKey);
      const rightValue = getRowColumnValue(right, sortKey);
      const comparison = leftValue.localeCompare(rightValue, "es", { sensitivity: "base", numeric: true });
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filtrosColumnas, resultados, sortDirection, sortKey]);

  const handleReplaceFiles = (incomingFiles: FileList | File[]) => {
    const nextFiles = Array.from(incomingFiles).map((file) => ({
      id: createSelectionId(file),
      file,
      clientError: validateSelectedFile(file),
    }));

    setFiles(nextFiles);
    setResultados([]);
    setError("");
    setMessage("");
    setFiltrosColumnas({});
    setColumnaFiltroAbierta(null);
    setFiltroBusqueda("");
  };

  const handleValidate = async () => {
    setLoadingValidate(true);
    setError("");
    setMessage("");

    try {
      const response: PlanillaXmlCargaMasivaResponseDto = await validarXmlPlanilla(files.map((item) => item.file));
      setResultados(Array.isArray(response.resultados) ? response.resultados : []);
      setMessage("Validacion completada correctamente.");
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo validar los XML de planilla."));
      setResultados([]);
    } finally {
      setLoadingValidate(false);
    }
  };

  const handleImport = async () => {
    setLoadingImport(true);
    setError("");
    setMessage("");

    try {
      const response: PlanillaXmlCargaMasivaResponseDto = await importarXmlPlanilla(files.map((item) => item.file));
      setResultados(Array.isArray(response.resultados) ? response.resultados : []);
      setMessage("Importacion completada correctamente.");
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo importar los XML de planilla."));
    } finally {
      setLoadingImport(false);
    }
  };

  const handleClear = () => {
    setFiles([]);
    setResultados([]);
    setError("");
    setMessage("");
    setDragActive(false);
    setFiltrosColumnas({});
    setColumnaFiltroAbierta(null);
    setFiltroBusqueda("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDownloadPdf = async (row: PlanillaXmlResultadoDto) => {
    if (!row.idBoleta) {
      setError("No se encontro el IdBoleta para descargar el PDF.");
      return;
    }

    try {
      const blob = await descargarPdfBoleta(row.idBoleta);
      const safePeriodo = (row.periodo ?? "").replace(/[^\dA-Za-z]/g, "");
      const safeDocumento = (row.numeroDocumento ?? "").replace(/[^\dA-Za-z]/g, "");
      downloadBlob(blob, `Boleta_${safePeriodo || row.idBoleta}_${safeDocumento || row.idBoleta}.pdf`);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo descargar el PDF de la boleta."));
    }
  };

  const handleDownloadZip = async () => {
    const periodo = resultados.find((item) => item.periodo)?.periodo?.trim();
    if (!periodo) {
      setError("No se pudo resolver el periodo para descargar el ZIP masivo.");
      return;
    }

    try {
      const blob = await descargarZipPeriodo(periodo);
      downloadBlob(blob, `Boletas_${periodo.replace(/[^\dA-Za-z]/g, "")}.zip`);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo descargar el ZIP del periodo."));
    }
  };

  const handleRemoveFile = (fileId: string) => {
    setFiles((prev) => prev.filter((item) => item.id !== fileId));
    setResultados([]);
    setError("");
    setMessage("");
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.sectionHeader}>
          <div>
            <h1 style={styles.sectionTitle}>Carga masiva de XML SUNAT</h1>
            <p style={styles.sectionText}>
              Valida e importa planillas XML dentro del flujo actual del ERP.
            </p>
          </div>
          <div style={styles.summaryInline}>
            <span style={styles.counterPill}>Archivos: {summary.totalArchivos}</span>
            <span style={styles.counterPill}>Validos: {summary.validos}</span>
            <span style={styles.counterPill}>Con error: {summary.conError}</span>
            <span style={styles.counterPill}>Importados: {summary.importados}</span>
            <span style={styles.counterPill}>Fallidos: {summary.fallidos}</span>
            <span style={styles.counterPill}>PDF disponibles: {summary.pdfDisponibles}</span>
          </div>
        </div>

        <div style={styles.summaryBoard}>
          <SummaryCard label="Total archivos" value={String(summary.totalArchivos)} />
          <SummaryCard label="Total validos" value={String(summary.validos)} />
          <SummaryCard label="Total con error" value={String(summary.conError)} />
          <SummaryCard label="Total importados" value={String(summary.importados)} />
          <SummaryCard label="Total fallidos" value={String(summary.fallidos)} />
          <SummaryCard label="PDF generados" value={String(summary.pdfGenerados)} />
          <SummaryCard label="PDF reutilizados" value={String(summary.pdfReutilizados)} />
          <SummaryCard label="PDF con error" value={String(summary.pdfConError)} />
        </div>

        <div style={styles.toolbarRow}>
          <button type="button" style={styles.primaryButton} onClick={() => fileInputRef.current?.click()}>
            Seleccionar XML
          </button>
          <button type="button" style={styles.secondaryButton} onClick={() => void handleValidate()} disabled={!canValidate}>
            {loadingValidate ? "Validando..." : "Validar XML"}
          </button>
          <button type="button" style={styles.primaryButton} onClick={() => void handleImport()} disabled={!canImport}>
            {loadingImport ? "Importando..." : "Importar XML"}
          </button>
          <button type="button" style={styles.secondaryButton} onClick={handleClear}>
            Limpiar
          </button>
          
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml,text/xml,application/xml"
            multiple
            style={{ display: "none" }}
            onChange={(event) => {
              if (event.target.files?.length) {
                handleReplaceFiles(event.target.files);
              }
            }}
          />
        </div>

        <div
          style={{
            ...styles.dropZone,
            ...(dragActive ? styles.dropZoneActive : {}),
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            if (event.dataTransfer.files?.length) {
              handleReplaceFiles(event.dataTransfer.files);
            }
          }}
        >
          <strong style={{ color: "#0F172A" }}>Arrastra tus XML aqui</strong>
          <span style={styles.dropHint}>
            Seleccion multiple, reemplazo completo de archivos y validacion basica antes de enviar.
          </span>
        </div>

        {files.length > 0 ? (
          <div style={styles.fileList}>
            {files.map((item) => (
              <div key={item.id} style={styles.fileItem}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <strong style={{ fontSize: 12, color: "#0F172A" }}>{item.file.name}</strong>
                  <span style={{ fontSize: 11, color: item.clientError ? "#B91C1C" : "#64748B" }}>
                    {item.clientError || `${item.file.size.toLocaleString("es-PE")} bytes`}
                  </span>
                </div>
                <button type="button" style={styles.smallDangerButton} onClick={() => handleRemoveFile(item.id)}>
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={styles.emptyBanner}>No hay archivos seleccionados.</div>
        )}

        {error ? <div style={styles.errorBanner}>{error}</div> : null}
        {message ? <div style={styles.successBanner}>{message}</div> : null}
      </div>

      <div style={styles.card}>
        <div style={styles.segmentHeader}>
          <div>
            <h2 style={styles.subTitle}>Resultados</h2>
            <p style={styles.sectionText}>
              El boton Importar XML permanece deshabilitado mientras existan archivos invalidos.
            </p>
          </div>
          {(loadingValidate || loadingImport) ? (
            <span style={styles.counterPill}>Procesando...</span>
          ) : null}
        </div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} style={{ ...styles.th, width: column.width }}>
                    <div style={styles.thContent}>
                      <button
                        type="button"
                        style={styles.headerButton}
                        onClick={() => {
                          if (sortKey === column.key) {
                            setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
                          } else {
                            setSortKey(column.key);
                            setSortDirection("asc");
                          }
                        }}
                      >
                        {column.label}
                        {sortKey === column.key ? (sortDirection === "asc" ? " ^" : " v") : ""}
                      </button>
                      <button
                        type="button"
                        style={styles.filterButton}
                        onClick={() => {
                          setFiltroBusqueda("");
                          setColumnaFiltroAbierta((prev) => (prev === column.key ? null : column.key));
                        }}
                      >
                        Filtrar
                      </button>
                    </div>
                    {columnaFiltroAbierta === column.key ? (
                      <ColumnFilterDropdown
                        column={column}
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
              {resultados.length === 0 ? (
                <tr>
                  <td style={styles.td} colSpan={columns.length}>
                    Pantalla vacia. Selecciona XML y ejecuta la validacion para ver resultados.
                  </td>
                </tr>
              ) : resultadosOrdenados.length === 0 ? (
                <tr>
                  <td style={styles.td} colSpan={columns.length}>
                    No hay resultados para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                resultadosOrdenados.map((row) => (
                  <tr key={`${row.nombreArchivo}-${row.numeroDocumento}-${row.periodo}`} style={styles.tr}>
                    <td style={styles.td}>{row.nombreArchivo}</td>
                    <td style={styles.td}>{row.estado}</td>
                    <td style={styles.td}>{row.mensaje}</td>
                    <td style={styles.td}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span>{row.mensajePdf ?? ""}</span>
                        {row.pdfDisponible && row.idBoleta ? (
                          <button
                            type="button"
                            style={styles.smallActionButton}
                            onClick={() => void handleDownloadPdf(row)}
                          >
                            Descargar PDF
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td style={styles.td}>{row.periodo ?? ""}</td>
                    <td style={styles.td}>{row.numeroDocumento ?? ""}</td>
                    <td style={styles.td}>{row.nombreTrabajador ?? ""}</td>
                    <td style={styles.td}>{formatDate(row.fechaValidacion)}</td>
                    <td style={styles.td}>{formatDate(row.fechaImportacion)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

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
    gap: 12,
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
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
  summaryInline: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    fontSize: 12,
    fontWeight: 700,
    color: "#334155",
  },
  counterPill: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "#F1F5F9",
    fontSize: 12,
    color: "#334155",
    fontWeight: 700,
  },
  summaryBoard: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
  },
  summaryCard: {
    background: "linear-gradient(135deg, #E0F2FE 0%, #F8FAFC 100%)",
    borderRadius: 12,
    padding: 10,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  summaryLabel: {
    fontSize: 12,
    color: "#475569",
  },
  summaryValue: {
    fontSize: 22,
    color: "#0F172A",
  },
  toolbarRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  primaryButton: {
    border: "none",
    background: "#1D4ED8",
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
  dropZone: {
    border: "1px dashed #94A3B8",
    borderRadius: 16,
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    background: "#F8FAFC",
    transition: "all 0.2s ease",
  },
  dropZoneActive: {
    borderColor: "#1D4ED8",
    background: "#EFF6FF",
  },
  dropHint: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
  },
  fileList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  fileItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    padding: "10px 12px",
  },
  emptyBanner: {
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    color: "#475569",
    borderRadius: 14,
    padding: 14,
    fontSize: 13,
    fontWeight: 700,
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
  segmentHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  subTitle: {
    margin: 0,
    fontSize: 16,
    color: "#0F172A",
  },
  tableWrap: {
    overflowX: "auto",
    border: "1px solid #E2E8F0",
    borderRadius: 14,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 1500,
    tableLayout: "fixed",
  },
  th: {
    position: "relative",
    textAlign: "left",
    padding: "7px 10px",
    borderBottom: "1px solid #E2E8F0",
    background: "#F8FAFC",
    fontSize: 12,
    color: "#334155",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "7px 10px",
    borderBottom: "1px solid #EDF2F7",
    fontSize: 12,
    color: "#0F172A",
    verticalAlign: "top",
  },
  tr: {
    cursor: "default",
  },
  thContent: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  headerButton: {
    border: "none",
    background: "transparent",
    color: "#334155",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    padding: 0,
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
  smallDangerButton: {
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 11,
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
    width: "fit-content",
  },
};
