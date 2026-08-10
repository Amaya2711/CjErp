import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Download, FileDown } from "lucide-react";
import {
  listarInquilinosArrendamientos,
  listarInmueblesArrendamientos,
  listarPagosDshResumenAnualArrendamientos,
  obtenerDshPagosArrendamientos,
} from "../../../api/arrendamientosService";
import type {
  ArrendamientosDshPagosDetalle,
  ArrendamientosDshPagosInquilino,
  ArrendamientosDshPagosKpi,
  ArrendamientosFila,
} from "../../../models/arrendamientos";

type FilterState = {
  idInmueble: string;
  idInquilino: string;
  anio: string[];
};

type LookupRow = Pick<ArrendamientosFila, "id" | "codigo" | "nombre" | "detalle"> & {
  idInmueble?: number | null;
  nombreComercial?: string | null;
  razonSocial?: string | null;
};

type KpiMoneyLine = {
  currency: string;
  amount: number;
};

type KpiCard = {
  label: string;
  accent: string;
  hint: string;
  value?: string;
  lines?: KpiMoneyLine[];
};

type ServiceSummaryItem = {
  servicio: string;
  moneda: string;
  contrato: number;
  pagado: number;
  exonerado: number;
  saldo: number;
  cumplimiento: number;
};

type ServiceProgressItem = {
  servicio: string;
  cumplimiento: number;
  contrato: number;
  pagado: number;
  inquilinos: ServiceTenantItem[];
};

type StateSummaryItem = {
  estado: string;
  moneda: string;
  registros: number;
  contrato: number;
  pagado: number;
  exonerado: number;
  saldo: number;
  cumplimiento: number;
};

type ServiceTenantItem = {
  inquilino: string;
  color: string;
  contrato: number;
  widthPct: number;
};

type MonthlyServiceMatrixCell = {
  contrato: number;
  pagado: number;
  exonerada: number;
  debe: number;
};

type MonthlyServiceMatrixService = {
  servicio: string;
  moneda: string;
  celdas: Map<string, MonthlyServiceMatrixCell>;
};

type MonthlyServiceMatrixGroup = {
  inquilino: string;
  meses: string[];
  servicios: MonthlyServiceMatrixService[];
};

type PendingDebtByTenantYear = {
  inquilino: string;
  anio: string;
  moneda: string;
  debe: number;
};

const YEAR_OPTIONS = Array.from({ length: 11 }, (_, index) => 2025 + index);
const YEAR_FILTER_A_FECHA = "__A_FECHA__";

export default function ArrendamientosDshPagosPage() {
  const [filters, setFilters] = useState<FilterState>({
    idInmueble: "",
    idInquilino: "",
    anio: [YEAR_FILTER_A_FECHA],
  });
  const [inmuebles, setInmuebles] = useState<LookupRow[]>([]);
  const [inquilinos, setInquilinos] = useState<LookupRow[]>([]);
  const [legendInquilinos, setLegendInquilinos] = useState<ArrendamientosDshPagosInquilino[]>([]);
  const [dashboardDetalle, setDashboardDetalle] = useState<ArrendamientosDshPagosDetalle[]>([]);
  const [dashboardKpi, setDashboardKpi] = useState<ArrendamientosDshPagosKpi | null>(null);
  const [rows, setRows] = useState<ArrendamientosFila[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"resumen" | "mensual" | "ejecutivo" | "estado">("ejecutivo");
  const [pendingTenantFilter, setPendingTenantFilter] = useState<string>("");
  const [isYearFilterOpen, setIsYearFilterOpen] = useState(false);
  const [yearFilterDraft, setYearFilterDraft] = useState<string[]>(filters.anio);

  useEffect(() => {
    let alive = true;

    const cargar = async () => {
      try {
        const [inmueblesData, inquilinosData, dshPagosData] = await Promise.all([
          listarInmueblesArrendamientos(),
          listarInquilinosArrendamientos(),
          obtenerDshPagosArrendamientos({}),
        ]);

        if (!alive) {
          return;
        }

        setInmuebles(inmueblesData);
        setInquilinos(inquilinosData);
        setLegendInquilinos(dshPagosData.inquilinos ?? []);
        setDashboardDetalle(dshPagosData.detalle ?? []);
        setDashboardKpi(dshPagosData.kpi ?? null);
      } catch {
        if (!alive) {
          return;
        }

        setInmuebles([]);
        setInquilinos([]);
        setLegendInquilinos([]);
        setDashboardDetalle([]);
        setDashboardKpi(null);
      }
    };

    void cargar();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    void consultar({
      idInmueble: "",
      idInquilino: "",
      anio: [YEAR_FILTER_A_FECHA],
    });
    // Carga inicial del store anual con los filtros vacÃ­os.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const consultar = async (currentFilters: FilterState) => {
    try {
      setLoading(true);

      const isAFecha = currentFilters.anio.includes(YEAR_FILTER_A_FECHA);
      const { anioInicio, anioFin } = resolveYearRange(currentFilters.anio);
      const response = await listarPagosDshResumenAnualArrendamientos({
        idInmueble: parseNullableId(currentFilters.idInmueble),
        idInquilino: parseNullableId(currentFilters.idInquilino),
        ...(anioInicio != null && anioFin != null ? { anioInicio, anioFin } : {}),
      });

      const dashboardResponse = await obtenerDshPagosArrendamientos({
        idInmueble: parseNullableId(currentFilters.idInmueble),
        idInquilino: parseNullableId(currentFilters.idInquilino),
        anio: anioFin ?? anioInicio ?? null,
      });

      const cutoff = getAFechaCutoff();
      setRows(isAFecha ? filterRowsByCutoff(response, cutoff) : response);
      setDashboardDetalle(isAFecha ? filterRowsByCutoff(dashboardResponse.detalle ?? [], cutoff) : dashboardResponse.detalle ?? []);
      setDashboardKpi(dashboardResponse.kpi ?? null);
      setError(null);
    } catch (fetchError) {
      setRows([]);
      setDashboardDetalle([]);
      setDashboardKpi(null);
      setError(fetchError instanceof Error ? fetchError.message : "No se pudo cargar el resumen anual.");
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = async () => {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const exportDate = new Date().toISOString().slice(0, 10);
    const exportGroups = activeTab === "estado" ? pendingMonthlyMatrixGroupsFiltered : monthlyMatrix;
    const exportMonths = activeTab === "estado" ? pendingMonthlyMatrixMonths : monthlyMatrixMonths;
    const exportSheetName = activeTab === "estado" ? "Pendientes" : "Mensual";
    const exportHeaders = ["Inquilino", "Servicio", "Moneda", "Concepto", ...exportMonths.map((mes) => formatMonthLabel(mes)), "Total"];
    const exportRows = exportGroups.flatMap((group) =>
      group.servicios.flatMap((servicioBlock) =>
        (["Contrato", "Pagado", "Exonerada", "Debe"] as const).map((metric) => {
          const values = exportMonths.map((mes) => {
            const cell = servicioBlock.celdas.get(mes) ?? { contrato: 0, pagado: 0, exonerada: 0, debe: 0 };
            return metric === "Contrato"
              ? Number(cell.contrato ?? 0)
              : metric === "Pagado"
                ? Number(cell.pagado ?? 0)
                : metric === "Exonerada"
                  ? Number(cell.exonerada ?? 0)
                  : Number(cell.debe ?? 0);
          });

          return [
            group.inquilino,
            servicioBlock.servicio,
            servicioBlock.moneda,
            metric,
            ...values,
            values.reduce((sum, value) => sum + Number(value || 0), 0),
          ];
        })
      )
    );
    const exportSheet = XLSX.utils.aoa_to_sheet([exportHeaders, ...exportRows]);
    XLSX.utils.book_append_sheet(workbook, exportSheet, exportSheetName);

    XLSX.writeFile(workbook, `dshpagos_arrendamientos_${exportDate}.xlsx`);
  };

  const exportToPdf = async () => {
    const [{ default: jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const doc = new jsPDF({ orientation: "landscape", format: "a3" });
    const exportDate = new Date().toISOString().slice(0, 10);
    const exportGroups = activeTab === "estado" ? pendingMonthlyMatrixGroupsFiltered : monthlyMatrix;
    const exportMonths = activeTab === "estado" ? pendingMonthlyMatrixMonths : monthlyMatrixMonths;
    const title = activeTab === "estado" ? "Pendientes pago" : "Resumen mensual de arrendamientos";
    const subtitle =
      activeTab === "estado"
        ? `Inquilino: ${pendingTenantFilter || "Todos"} | Meses visibles: ${exportMonths.length}`
        : `Inmueble: ${selectedInmuebleLabel} | Inquilino: ${selectedInquilinoLabel} | Año: ${
            filters.anio.includes(YEAR_FILTER_A_FECHA) ? "A Fecha" : filters.anio.join(", ")
          }`;

    const headers = ["Inquilino", "Servicio", "Concepto", "Moneda", ...exportMonths.map((mes) => formatMonthLabel(mes)), "Total"];
    const body = exportGroups.flatMap((group) =>
      group.servicios.flatMap((servicioBlock) =>
        (["Contrato", "Pagado", "Exonerada", "Debe"] as const).map((metric) => {
          const values = exportMonths.map((mes) => {
            const cell = servicioBlock.celdas.get(mes) ?? { contrato: 0, pagado: 0, exonerada: 0, debe: 0 };
            const rawValue =
              metric === "Contrato"
                ? cell.contrato
                : metric === "Pagado"
                  ? cell.pagado
                  : metric === "Exonerada"
                    ? cell.exonerada
                    : cell.debe;

            return formatMoney(rawValue, servicioBlock.moneda);
          });

          const total = exportMonths.reduce((sum, mes) => {
            const cell = servicioBlock.celdas.get(mes) ?? { contrato: 0, pagado: 0, exonerada: 0, debe: 0 };
            const rawValue =
              metric === "Contrato"
                ? cell.contrato
                : metric === "Pagado"
                  ? cell.pagado
                  : metric === "Exonerada"
                    ? cell.exonerada
                    : cell.debe;
            return sum + Number(rawValue ?? 0);
          }, 0);

          return [
            group.inquilino,
            servicioBlock.servicio,
            metric,
            servicioBlock.moneda,
            ...values,
            formatMoney(total, servicioBlock.moneda),
          ];
        })
      )
    );

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(title, 14, 16);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(subtitle, 14, 23);
    doc.text(`Generado: ${exportDate}`, 14, 29);

    autoTableModule.default(doc, {
      startY: 34,
      head: [headers],
      body,
      styles: {
        fontSize: 7,
        cellPadding: 2,
        overflow: "linebreak",
        valign: "middle",
      },
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 42 },
        1: { cellWidth: 32 },
        2: { cellWidth: 24 },
        3: { cellWidth: 20, halign: "center" },
        [headers.length - 1]: { cellWidth: 28, halign: "right" },
      },
      didParseCell: (hookData) => {
        if (hookData.section === "body" && hookData.row.index % 4 === 3) {
          hookData.cell.styles.textColor = [225, 29, 72];
          hookData.cell.styles.fontStyle = "bold";
          hookData.cell.styles.fillColor = [255, 241, 242];
        }
      },
    });

    doc.save(`dshpagos_arrendamientos_${exportDate}.pdf`);
  };

  const actualizarFiltrosYConsultar = (nextFilters: FilterState) => {
    setFilters(nextFilters);
    void consultar(nextFilters);
  };

  const openYearFilter = () => {
    setYearFilterDraft(filters.anio);
    setIsYearFilterOpen(true);
  };

  const applyYearFilter = () => {
    const nextYears = normalizeSelectedYears(yearFilterDraft);
    actualizarFiltrosYConsultar({
      ...filters,
      anio: nextYears,
    });
    setIsYearFilterOpen(false);
  };

  const clearYearFilter = () => {
    setYearFilterDraft([]);
  };

  const toggleYearFilterValue = (year: string) => {
    setYearFilterDraft((current) => {
      if (year === YEAR_FILTER_A_FECHA) {
        return current.includes(YEAR_FILTER_A_FECHA) ? [] : [YEAR_FILTER_A_FECHA];
      }

      const next = current.filter((value) => value !== YEAR_FILTER_A_FECHA);
      return next.includes(year) ? next.filter((value) => value !== year) : [...next, year].sort((left, right) => Number(left) - Number(right));
    });
  };

  const toggleSelectAllYears = () => {
    setYearFilterDraft((current) =>
      current.length === YEAR_OPTIONS.length && !current.includes(YEAR_FILTER_A_FECHA)
        ? []
        : YEAR_OPTIONS.map((anio) => String(anio))
    );
  };

  const inmuebleOptions = inmuebles;
  const inquilinoOptions = useMemo(() => {
    return inquilinos;
  }, [inquilinos]);

  const monedaBase = normalizeCurrency(rows[0]?.moneda ?? "PEN");
  const contratosActivos = useMemo(() => countUniqueContracts(rows), [rows]);
  const contratoMontoPorMoneda = useMemo(() => summarizeAmountByCurrency(rows, (row) => Number(row.importe ?? 0), monedaBase), [rows, monedaBase]);
  const exoneradoMontoPorMoneda = useMemo(
    () => summarizeAmountByCurrency(rows, getExoneradoAmount, monedaBase),
    [rows, monedaBase]
  );
  const dashboardExoneradoMonto = useMemo(
    () => summarizeDetailAmountByCurrency(dashboardDetalle, getDashboardExoneradoAmount, monedaBase),
    [dashboardDetalle, monedaBase]
  );
  const isAFechaSelected = filters.anio.includes(YEAR_FILTER_A_FECHA);
  const exoneradoKpiLines = useMemo(() => {
    if (!isAFechaSelected && (dashboardKpi?.exonerado ?? 0) !== 0) {
      return [{ currency: monedaBase, amount: Number(dashboardKpi?.exonerado ?? 0) }];
    }

    if (dashboardExoneradoMonto.some((line) => Number(line.amount ?? 0) !== 0)) {
      return dashboardExoneradoMonto;
    }

    return exoneradoMontoPorMoneda;
  }, [dashboardExoneradoMonto, dashboardKpi?.exonerado, exoneradoMontoPorMoneda, monedaBase, isAFechaSelected]);

  const selectedInmuebleLabel = useMemo(() => {
    if (!filters.idInmueble) {
      return "Todos los inmuebles";
    }

    const match = inmuebleOptions.find((item) => String(item.id) === filters.idInmueble);
    return match ? match.nombre ?? `Inmueble ${match.id}` : "Inmueble no encontrado";
  }, [filters.idInmueble, inmuebleOptions]);

  const selectedInquilinoLabel = useMemo(() => {
    if (!filters.idInquilino) {
      return "Sin inquilino";
    }

    const match = inquilinoOptions.find((item) => String(item.id) === filters.idInquilino);
    return match ? buildInquilinoLabel(match) : "Inquilino no encontrado";
  }, [filters.idInquilino, inquilinoOptions]);

  const kpiCards = useMemo<KpiCard[]>(
    () => [
      {
        label: "Contratos activos",
        value: contratosActivos.toLocaleString("es-PE"),
        accent: "#0F766E",
        hint: selectedInquilinoLabel,
      },
      {
        label: "Contrato",
        lines: contratoMontoPorMoneda,
        accent: "#0EA5E9",
        hint: "",
      },
      {
        label: "Pagado",
        lines: summarizeAmountByCurrency(rows, (row) => Number(row.importeTransferido ?? 0), monedaBase),
        accent: "#7C3AED",
        hint: "",
      },
      {
        label: "Exonerado",
        lines: exoneradoKpiLines,
        accent: "#F59E0B",
        hint: "",
      },
      {
        label: "Saldo real",
        lines: summarizeAmountByCurrency(rows, (row) => computeSaldoReal(row), monedaBase),
        accent: "#1D4ED8",
        hint: "",
      },
    ],
    [
      contratosActivos,
      contratoMontoPorMoneda,
      dashboardExoneradoMonto,
      dashboardKpi?.exonerado,
      exoneradoMontoPorMoneda,
      exoneradoKpiLines,
      monedaBase,
      rows,
      selectedInmuebleLabel,
      selectedInquilinoLabel,
    ]
  );
  const executiveSummary = useMemo(() => buildServiceSummary(rows, monedaBase), [rows, monedaBase]);
  const monthlyMatrix = useMemo(() => buildMonthlyServiceMatrix(rows, monedaBase), [rows, monedaBase]);
  const monthlyMatrixMonths = useMemo(
    () => Array.from(new Set(monthlyMatrix.flatMap((group) => group.meses))).sort(comparePeriods),
    [monthlyMatrix]
  );
  const executiveProgress = useMemo(() => buildServiceProgress(rows, legendInquilinos), [rows, legendInquilinos]);
  const executiveLegend = useMemo(() => buildTenantLegend(rows, legendInquilinos), [rows, legendInquilinos]);
  const stateSummary = useMemo(() => buildStateSummary(rows, monedaBase), [rows, monedaBase]);
  const pendingMonthlyMatrixGroups = useMemo(() => {
    return monthlyMatrix.filter((group) =>
      group.servicios.some((servicioBlock) =>
        monthlyMatrixMonths.some((mes) => {
          const cell = servicioBlock.celdas.get(mes);
          return Number(cell?.debe ?? 0) > 0;
        })
      )
    );
  }, [monthlyMatrix, monthlyMatrixMonths]);
  const pendingMonthlyMatrixGroupsFiltered = useMemo(() => {
    if (!pendingTenantFilter) {
      return pendingMonthlyMatrixGroups;
    }

    const normalizedFilter = normalizeGroupKey(pendingTenantFilter);
    return pendingMonthlyMatrixGroups.filter((group) => normalizeGroupKey(group.inquilino) === normalizedFilter);
  }, [pendingMonthlyMatrixGroups, pendingTenantFilter]);
  const pendingMonthlyMatrixMonths = useMemo(() => {
    return monthlyMatrixMonths.filter((mes) =>
      pendingMonthlyMatrixGroupsFiltered.some((group) =>
        group.servicios.some((servicioBlock) => {
          const cell = servicioBlock.celdas.get(mes);
          return Number(cell?.debe ?? 0) > 0;
        })
      )
    );
  }, [pendingMonthlyMatrixGroupsFiltered, monthlyMatrixMonths]);
  const pendingDebtByTenantYear = useMemo<PendingDebtByTenantYear[]>(() => {
    const grouped = new Map<string, PendingDebtByTenantYear>();

    for (const row of rows) {
      const debe = Number(computeSaldoReal(row));
      if (debe <= 0) {
        continue;
      }

      const period = getRowPeriodYearMonth(row);
      if (!period) {
        continue;
      }

      const inquilino = (row.inquilino ?? row.nombre ?? "Sin inquilino").trim() || "Sin inquilino";
      const moneda = normalizeCurrency(row.moneda ?? monedaBase);
      const anio = String(period.year);
      const key = `${normalizeGroupKey(inquilino)}::${anio}::${moneda}`;
      const current = grouped.get(key) ?? { inquilino, anio, moneda, debe: 0 };
      current.debe += debe;
      grouped.set(key, current);
    }

    return Array.from(grouped.values()).sort((left, right) => {
      const tenantCompare = left.inquilino.localeCompare(right.inquilino, "es", { sensitivity: "base" });
      if (tenantCompare !== 0) {
        return tenantCompare;
      }

      const yearCompare = Number(left.anio) - Number(right.anio);
      if (yearCompare !== 0) {
        return yearCompare;
      }

      return left.moneda.localeCompare(right.moneda, "es", { sensitivity: "base" });
    });
  }, [rows, monedaBase]);
  const pendingDebtMax = useMemo(() => {
    return pendingDebtByTenantYear.reduce((max, item) => Math.max(max, item.debe), 0);
  }, [pendingDebtByTenantYear]);
  const pendingDebtByTenantGroups = useMemo(() => {
    const grouped = new Map<string, { inquilino: string; items: PendingDebtByTenantYear[] }>();

    for (const item of pendingDebtByTenantYear) {
      const key = normalizeGroupKey(item.inquilino);
      const current = grouped.get(key);
      if (current) {
        current.items.push(item);
      } else {
        grouped.set(key, {
          inquilino: item.inquilino,
          items: [item],
        });
      }
    }

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        items: group.items.slice().sort((left, right) => {
          const yearCompare = Number(left.anio) - Number(right.anio);
          if (yearCompare !== 0) {
            return yearCompare;
          }

          return left.moneda.localeCompare(right.moneda, "es", { sensitivity: "base" });
        }),
      }))
      .sort((left, right) => left.inquilino.localeCompare(right.inquilino, "es", { sensitivity: "base" }));
  }, [pendingDebtByTenantYear]);
  const pendingDebtServiceByTenantGroups = useMemo(() => {
    return pendingMonthlyMatrixGroups
      .map((group) => ({
        inquilino: group.inquilino,
        items: group.servicios
          .map((servicioBlock) => {
            const debe = monthlyMatrixMonths.reduce((sum, mes) => {
              const cell = servicioBlock.celdas.get(mes) ?? { contrato: 0, pagado: 0, exonerada: 0, debe: 0 };
              return sum + Number(cell.debe ?? 0);
            }, 0);

            return {
              servicio: servicioBlock.servicio,
              moneda: servicioBlock.moneda,
              debe,
            };
          })
          .filter((item) => item.debe > 0)
          .sort((left, right) => {
            const serviceCompare = left.servicio.localeCompare(right.servicio, "es", { sensitivity: "base" });
            if (serviceCompare !== 0) {
              return serviceCompare;
            }

            return left.moneda.localeCompare(right.moneda, "es", { sensitivity: "base" });
          }),
      }))
      .filter((group) => group.items.length > 0)
      .sort((left, right) => left.inquilino.localeCompare(right.inquilino, "es", { sensitivity: "base" }));
  }, [pendingMonthlyMatrixGroups, monthlyMatrixMonths]);
  const pendingDebtServiceMax = useMemo(() => {
    return pendingDebtServiceByTenantGroups.reduce((max, group) => {
      const groupMax = group.items.reduce((innerMax, item) => Math.max(innerMax, item.debe), 0);
      return Math.max(max, groupMax);
    }, 0);
  }, [pendingDebtServiceByTenantGroups]);

  return (
    <div style={styles.page}>
      <div style={styles.backgroundGlowA} />
      <div style={styles.backgroundGlowB} />

      <div style={styles.shell}>
        <header style={styles.hero}>
          <div style={styles.heroTitleBlock}>
            <p style={styles.eyebrow}>Arrendamientos</p>
            <h1 style={styles.title}>Reporte de alquileres</h1>
          </div>

          <div style={styles.heroFilters}>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Inmueble</span>
              <select
                value={filters.idInmueble}
                onChange={(event) =>
                  actualizarFiltrosYConsultar({
                    ...filters,
                    idInmueble: event.target.value,
                    idInquilino: "",
                  })
                }
                style={styles.select}
              >
                <option value="">Todos</option>
                {inmuebleOptions.map((item) => (
                  <option key={String(item.id)} value={String(item.id)}>
                    {item.nombre ?? `Inmueble ${item.id}`}
                  </option>
                ))}
              </select>
            </label>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>Inquilino</span>
              <select
                value={filters.idInquilino}
                onChange={(event) =>
                  actualizarFiltrosYConsultar({
                    ...filters,
                    idInquilino: event.target.value,
                  })
                }
                style={styles.select}
              >
                <option value="">Todos</option>
                {inquilinoOptions.map((item) => (
                  <option key={String(item.id)} value={String(item.id)}>
                    {buildInquilinoLabel(item)}
                  </option>
                ))}
              </select>
            </label>

            <div style={styles.field}>
              <span style={styles.fieldLabel}>Año</span>
              <div style={styles.yearFilterWrap}>
                <button
                  type="button"
                  onClick={() => (isYearFilterOpen ? setIsYearFilterOpen(false) : openYearFilter())}
                  style={styles.yearFilterButton}
                  aria-expanded={isYearFilterOpen}
                  aria-haspopup="dialog"
                  aria-label="Filtrar por año"
                >
                  <span style={styles.yearFilterButtonMeta}>
                    {filters.anio.includes(YEAR_FILTER_A_FECHA)
                      ? "A Fecha"
                      : filters.anio.length === YEAR_OPTIONS.length
                        ? "Todos"
                        : `${filters.anio.length} seleccionados`}
                  </span>
                  <span style={styles.yearFilterButtonCaret}>▾</span>
                </button>

                {isYearFilterOpen ? (
                  <div style={styles.yearFilterPanel} role="dialog" aria-label="Filtro de años">
                    <div style={styles.yearFilterPanelHeader}>
                      <button type="button" onClick={toggleSelectAllYears} style={styles.yearFilterHeaderAction}>
                        {yearFilterDraft.length === YEAR_OPTIONS.length ? "Borrar selección" : "Seleccionar todo"}
                      </button>
                      <button type="button" onClick={clearYearFilter} style={styles.yearFilterHeaderAction}>
                        Limpiar
                      </button>
                    </div>

                    <div style={styles.yearFilterList}>
                      <label key={YEAR_FILTER_A_FECHA} style={styles.yearFilterItem}>
                        <input
                          type="checkbox"
                          checked={yearFilterDraft.includes(YEAR_FILTER_A_FECHA)}
                          onChange={() => toggleYearFilterValue(YEAR_FILTER_A_FECHA)}
                          style={styles.yearFilterCheckbox}
                        />
                        <span style={styles.yearFilterItemLabel}>A Fecha</span>
                      </label>
                      {YEAR_OPTIONS.map((anio) => {
                        const value = String(anio);
                        const checked = yearFilterDraft.includes(value);

                        return (
                          <label key={value} style={styles.yearFilterItem}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleYearFilterValue(value)}
                              style={styles.yearFilterCheckbox}
                            />
                            <span style={styles.yearFilterItemLabel}>{anio}</span>
                          </label>
                        );
                      })}
                    </div>

                    <div style={styles.yearFilterPanelFooter}>
                      <button type="button" onClick={() => setIsYearFilterOpen(false)} style={styles.yearFilterSecondaryButton}>
                        Cancelar
                      </button>
                      <button type="button" onClick={applyYearFilter} style={styles.yearFilterPrimaryButton}>
                        Aceptar
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>&nbsp;</span>
              <button type="button" onClick={() => void consultar(filters)} style={styles.consultarButton}>
                Consultar
              </button>
            </label>

          </div>
        </header>

        <section style={styles.kpiGrid}>
          {kpiCards.map((card) => (
            <article
              key={card.label}
              onClick={card.label === "Saldo real" ? () => setActiveTab("estado") : undefined}
              role={card.label === "Saldo real" ? "button" : undefined}
              tabIndex={card.label === "Saldo real" ? 0 : undefined}
              onKeyDown={
                card.label === "Saldo real"
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setActiveTab("estado");
                      }
                    }
                  : undefined
              }
              style={{
                ...styles.kpiCard,
                borderTopColor: card.accent,
                ...(card.label === "Saldo real" ? styles.kpiCardClickable : {}),
              }}
            >
              <span style={styles.kpiLabel}>{card.label}</span>
              {card.lines ? (
                <div style={styles.kpiMoneyLines}>
                  {card.lines.map((line) => (
                    <div key={line.currency} style={styles.kpiMoneyLine}>
                      <span style={styles.kpiMoneyCurrency}>{line.currency}</span>
                      <span style={styles.kpiMoneyAmount}>{formatMoney(line.amount, line.currency)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <strong style={styles.kpiValue}>{card.value}</strong>
              )}
              {card.hint ? <span style={styles.kpiHint}>{card.hint}</span> : null}
            </article>
          ))}
        </section>

        <section style={styles.tabShell}>
          <div style={styles.tabBar}>
            <div style={styles.tabBarButtons}>
              <button
                type="button"
                onClick={() => setActiveTab("ejecutivo")}
                style={{
                  ...styles.tabButton,
                  ...(activeTab === "ejecutivo" ? styles.tabButtonActive : {}),
                }}
              >
                Ejecutivo
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("mensual")}
                style={{
                  ...styles.tabButton,
                  ...(activeTab === "mensual" ? styles.tabButtonActive : {}),
                }}
              >
                Mensual
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("estado")}
                style={{
                  ...styles.tabButton,
                  ...(activeTab === "estado" ? styles.tabButtonActive : {}),
                }}
              >
                Pendientes pago
              </button>
            </div>
            <div style={styles.tabBarActions}>
              <button type="button" onClick={() => void exportToExcel()} style={styles.exportButton} disabled={loading}>
                <Download size={18} strokeWidth={2.4} />
              </button>
              <button type="button" onClick={() => void exportToPdf()} style={styles.exportPdfButton} disabled={loading}>
                <FileDown size={18} strokeWidth={2.4} />
              </button>
            </div>
          </div>

          <div style={styles.tabBody}>
            {activeTab === "resumen" && (
              <>
                {loading && (
                  <div style={styles.stateBox}>
                    <strong style={styles.stateTitle}>Cargando resumen anual...</strong>
                    <span style={styles.stateText}>Consultando sp_Arrendamiento_ResumenAnual con los filtros seleccionados.</span>
                  </div>
                )}

                {!loading && error && (
                  <div style={styles.stateBoxError}>
                    <strong style={styles.stateTitle}>No se pudo cargar el resumen</strong>
                    <span style={styles.stateText}>{error}</span>
                  </div>
                )}

                {!loading && !error && (
                  <div style={styles.tableCard}>
                    <div style={styles.tableHeader}>
                      <div>
                        <h2 style={styles.sectionTitle}>Resumen anual</h2>
                        <p style={styles.sectionSubtitle}>
                          Resultado directo del store `sp_Arrendamiento_ResumenAnual` según los filtros elegidos.
                        </p>
                      </div>
                      <span style={styles.counterBadge}>{rows.length} registros</span>
                    </div>
                    <div style={styles.tableScroll}>
                      <table style={styles.table}>
                        <thead>
                          <tr>
                            <th style={styles.th}>Periodo</th>
                            <th style={styles.th}>Codigo</th>
                            <th style={styles.th}>Nombre</th>
                            <th style={styles.th}>Detalle</th>
                            <th style={styles.thRight}>Contrato</th>
                            <th style={styles.thRight}>Pagado</th>
                            <th style={styles.thRight}>Saldo</th>
                            <th style={styles.th}>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.length === 0 ? (
                            <tr>
                              <td style={styles.emptyCell} colSpan={8}>
                                No hay registros para el filtro actual.
                              </td>
                            </tr>
                          ) : (
                            rows.map((row, index) => (
                              <tr key={`${row.id ?? index}-${row.codigo ?? row.periodo ?? index}`} style={styles.tr}>
                                <td style={styles.td}>{row.periodo ?? "-"}</td>
                                <td style={styles.tdStrong}>{row.codigo ?? "-"}</td>
                                <td style={styles.td}>{row.nombre ?? "-"}</td>
                                <td style={styles.td}>{row.detalle ?? "-"}</td>
                                <td style={styles.tdRight}>{formatMoney(row.importe ?? 0, row.moneda ?? monedaBase)}</td>
                                <td style={styles.tdRight}>{formatMoney(row.importeTransferido ?? 0, row.moneda ?? monedaBase)}</td>
                                <td style={styles.tdRight}>{formatMoney(computeSaldoReal(row), row.moneda ?? monedaBase)}</td>
                                <td style={styles.td}>
                                  <span style={getPillStyle(row.estado)}>{row.estado ?? "-"}</span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === "mensual" && (
                <div style={styles.matrixShell}>
                  <div style={styles.tableHeader}>
                    <div>
                      <h2 style={styles.sectionTitle}>Resumen mensual</h2>
                      <p style={styles.sectionSubtitle}>
                        Formato tipo Excel con meses en el eje X y servicios agrupados por inquilino y moneda.
                      </p>
                    </div>
                  </div>
                {monthlyMatrix.length === 0 ? (
                  <div style={styles.stateBox}>
                    <strong style={styles.stateTitle}>No hay registros para mostrar.</strong>
                    <span style={styles.stateText}>No se encontraron datos en el store `sp_Arrendamiento_ResumenAnual` con los filtros seleccionados.</span>
                  </div>
                ) : (
                  <div style={styles.matrixList}>
                    <article style={styles.matrixGroup}>
                      <div style={styles.matrixScroll}>
                        <table style={styles.matrixTable}>
                          <thead>
                            <tr>
                              <th style={styles.matrixThCorner} colSpan={4} />
                              {monthlyMatrixMonths.map((mes) => (
                                <th key={mes} style={styles.matrixThRight}>
                                  {formatMonthLabel(mes)}
                                </th>
                              ))}
                              <th style={styles.matrixThTotal}>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {monthlyMatrix.length === 0 ? (
                              <tr>
                                <td style={styles.emptyCell} colSpan={monthlyMatrixMonths.length + 5}>
                                  No hay registros para mostrar.
                                </td>
                              </tr>
                            ) : (
                              monthlyMatrix.map((group) => (
                                <Fragment key={group.inquilino}>
                                  {group.servicios.length === 0 ? (
                                    <tr>
                                      <td style={styles.emptyCell} colSpan={monthlyMatrixMonths.length + 5}>
                                        No hay registros para mostrar.
                                      </td>
                                    </tr>
                                  ) : (
                                    group.servicios.map((servicioBlock, serviceIndex) => (
                                      <Fragment key={`${group.inquilino}::${servicioBlock.servicio}::${servicioBlock.moneda}`}>
                                        {(["Contrato", "Pagado", "Exonerada", "Debe"] as const).map((metric, metricIndex) => (
                                          <tr
                                            key={`${servicioBlock.servicio}::${metric}`}
                                            style={{
                                              ...styles.tr,
                                              ...(serviceIndex === 0 && metricIndex === 0 ? styles.matrixTenantStartRow : {}),
                                              ...(serviceIndex === group.servicios.length - 1 && metricIndex === 3 ? styles.matrixTenantEndRow : {}),
                                            }}
                                          >
                                            {serviceIndex === 0 && metricIndex === 0 ? (
                                              <td rowSpan={group.servicios.length * 4} style={styles.matrixTenantCell}>
                                                {group.inquilino}
                                              </td>
                                            ) : null}
                                            {metricIndex === 0 ? (
                                              <td rowSpan={4} style={getMonthlyServiceCellStyle(servicioBlock.servicio)}>
                                                {servicioBlock.servicio}
                                              </td>
                                            ) : null}
                                            <td style={styles.matrixMetricCell}>{metric}</td>
                                            <td style={styles.matrixCurrencyCell}>{servicioBlock.moneda}</td>
                                            {monthlyMatrixMonths.map((mes) => {
                                              const cell = servicioBlock.celdas.get(mes) ?? { contrato: 0, pagado: 0, exonerada: 0, debe: 0 };
                                              const value =
                                                metric === "Contrato"
                                                  ? cell.contrato
                                                  : metric === "Pagado"
                                                    ? cell.pagado
                                                    : metric === "Exonerada"
                                                      ? cell.exonerada
                                                      : cell.debe;

                                              return (
                                                <td
                                                  key={`${servicioBlock.servicio}-${metric}-${mes}`}
                                                  style={metric === "Debe" ? styles.matrixDebeValueCell : styles.matrixValueCell}
                                                >
                                                  {formatMoney(value, servicioBlock.moneda)}
                                                </td>
                                              );
                                            })}
                                            <td style={metric === "Debe" ? styles.matrixDebeTotalCell : styles.matrixTotalCell}>
                                              {formatMoney(
                                                monthlyMatrixMonths.reduce((sum, mes) => {
                                                  const cell = servicioBlock.celdas.get(mes) ?? { contrato: 0, pagado: 0, exonerada: 0, debe: 0 };
                                                  const value =
                                                    metric === "Contrato"
                                                      ? cell.contrato
                                                      : metric === "Pagado"
                                                        ? cell.pagado
                                                        : metric === "Exonerada"
                                                          ? cell.exonerada
                                                          : cell.debe;

                                                  return sum + Number(value || 0);
                                                }, 0),
                                                servicioBlock.moneda
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </Fragment>
                                    ))
                                  )}
                                </Fragment>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  </div>
                )}
              </div>
            )}

            {activeTab === "ejecutivo" && (
              <div style={styles.executiveStack}>
                <article style={styles.executivePanel}>
                  <div style={styles.executivePanelHeader}>
                    <h2 style={styles.executivePanelTitle}>Resumen anual por servicio</h2>
                  </div>
                  <div style={styles.executiveTableWrap}>
                    <table style={styles.executiveTable}>
                      <thead>
                        <tr>
                          <th style={styles.executiveTh}>Servicio</th>
                          <th style={styles.executiveTh}>Moneda</th>
                          <th style={styles.executiveThRight}>Contrato</th>
                          <th style={styles.executiveThRight}>Pagado</th>
                          <th style={styles.executiveThRight}>Exonerado</th>
                          <th style={styles.executiveThRight}>Saldo</th>
                          <th style={styles.executiveThRight}>Cumpl.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {executiveSummary.length === 0 ? (
                          <tr>
                            <td style={styles.executiveEmpty} colSpan={7}>
                              No hay registros para mostrar.
                            </td>
                          </tr>
                        ) : (
                          executiveSummary.map((item) => (
                            <tr key={`${item.servicio}-${item.moneda}`} style={styles.executiveTr}>
                              <td style={styles.executiveTdStrong}>{item.servicio}</td>
                              <td style={styles.executiveTd}>{item.moneda}</td>
                              <td style={styles.executiveTdRight}>{formatMoney(item.contrato, item.moneda)}</td>
                              <td style={styles.executiveTdRight}>{formatMoney(item.pagado, item.moneda)}</td>
                              <td style={styles.executiveTdRight}>{formatMoney(item.exonerado, item.moneda)}</td>
                              <td style={styles.executiveTdRight}>{formatMoney(item.saldo, item.moneda)}</td>
                              <td style={styles.executiveTdRight}>{formatPercent(item.cumplimiento)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </article>

                <article style={styles.executivePanel}>
                  <h2 style={styles.executivePanelTitle}>Cumplimiento de cobranza</h2>
                  {executiveLegend.length > 0 ? (
                    <div style={styles.legendShell}>
                      <span style={styles.legendTitle}>Leyenda</span>
                      <div style={styles.legendList}>
                        {executiveLegend.map((item) => (
                          <div key={item.inquilino} style={styles.legendItem}>
                            <span style={{ ...styles.legendColor, background: item.color }} />
                            <span style={styles.legendLabel}>{item.inquilino}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div style={styles.executiveBars}>
                    {executiveProgress.length === 0 ? (
                      <div style={styles.stateText}>No hay registros para mostrar.</div>
                    ) : (
                      executiveProgress.map((item) => (
                        <div key={item.servicio} style={styles.serviceProgressCard}>
                          <div style={styles.executiveBarRow}>
                            <span style={styles.executiveBarLabel}>{item.servicio}</span>
                            <div style={styles.executiveBarTrack} aria-hidden="true">
                              <div style={styles.executiveBarSegments}>
                                {item.inquilinos.map((tenant) => (
                                  <div
                                    key={`${item.servicio}-${tenant.inquilino}`}
                                    style={{
                                      ...styles.executiveBarSegment,
                                      width: `${tenant.widthPct}%`,
                                      background: tenant.color,
                                    }}
                                  />
                                ))}
                              </div>
                            </div>
                            <strong style={styles.executiveBarPercent}>{formatPercent(item.cumplimiento)}</strong>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </article>
              </div>
            )}

            {activeTab === "estado" && (
              <div style={styles.matrixShell}>
                {pendingDebtByTenantYear.length > 0 ? (
                  <div style={styles.pendingDebtShell}>
                    <div style={styles.pendingDebtTenantGroups}>
                      {pendingDebtByTenantGroups.map((group) => (
                        <div key={group.inquilino} style={styles.pendingDebtTenantGroup}>
                          <div style={styles.pendingDebtTenantHeader}>
                            <button
                              type="button"
                              onClick={() =>
                                setPendingTenantFilter((current) =>
                                  normalizeGroupKey(current) === normalizeGroupKey(group.inquilino) ? "" : group.inquilino
                                )
                              }
                              style={{
                                ...styles.pendingDebtTenantNameButton,
                                ...(normalizeGroupKey(pendingTenantFilter) === normalizeGroupKey(group.inquilino)
                                  ? styles.pendingDebtTenantNameButtonActive
                                  : {}),
                              }}
                            >
                              {group.inquilino}
                            </button>
                          </div>
                          <div style={styles.pendingDebtTenantContent}>
                            <div style={styles.pendingDebtPanel}>
                              <div style={styles.pendingDebtPanelTitle}>Por servicio</div>
                              <div style={styles.pendingDebtBars}>
                                {(pendingDebtServiceByTenantGroups.find((item) => normalizeGroupKey(item.inquilino) === normalizeGroupKey(group.inquilino))?.items ?? []).map((item) => {
                                  const width = pendingDebtServiceMax > 0 ? Math.max((item.debe / pendingDebtServiceMax) * 100, 4) : 0;
                                  return (
                                    <div key={`${group.inquilino}-${item.servicio}-${item.moneda}`} style={styles.pendingDebtServiceRow}>
                                      <div style={styles.pendingDebtServiceRowTop}>
                                        <div style={styles.pendingDebtServiceName}>{item.servicio}</div>
                                        <div style={styles.pendingDebtValueInline}>
                                          <span style={styles.pendingDebtValue}>{formatMoney(item.debe, item.moneda)}</span>
                                          <span style={styles.pendingDebtValueCurrency}>{item.moneda}</span>
                                        </div>
                                      </div>
                                      <div style={styles.pendingDebtTrack}>
                                        <div
                                          style={{
                                            ...styles.pendingDebtFill,
                                            width: `${width}%`,
                                          }}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            <div style={styles.pendingDebtPanel}>
                              <div style={styles.pendingDebtPanelTitle}>Por año</div>
                              <div style={styles.pendingDebtBars}>
                                {group.items.map((item) => {
                                  const width = pendingDebtMax > 0 ? Math.max((item.debe / pendingDebtMax) * 100, 4) : 0;
                                  return (
                                    <div key={`${item.inquilino}-${item.anio}-${item.moneda}`} style={styles.pendingDebtBarRow}>
                                      <div style={styles.pendingDebtTrack}>
                                        <div
                                          style={{
                                            ...styles.pendingDebtFill,
                                            width: `${width}%`,
                                          }}
                                        />
                                      </div>
                                      <div style={styles.pendingDebtValueBlock}>
                                        <div style={styles.pendingDebtValue}>{formatMoney(item.debe, item.moneda)}</div>
                                        <div style={styles.pendingDebtValueSubtitle}>
                                          {item.anio} · {item.moneda}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {monthlyMatrix.length === 0 ? (
                  <div style={styles.stateBox}>
                    <strong style={styles.stateTitle}>No hay registros para mostrar.</strong>
                    <span style={styles.stateText}>No se encontraron datos en el store `sp_Arrendamiento_ResumenAnual` con los filtros seleccionados.</span>
                  </div>
                 ) : pendingMonthlyMatrixMonths.length === 0 ? (
                   <div style={styles.stateBox}>
                     <strong style={styles.stateTitle}>No hay pendientes para mostrar.</strong>
                     <span style={styles.stateText}>No existen meses con DEBE mayor a 0 para el filtro actual.</span>
                   </div>
                 ) : pendingMonthlyMatrixGroupsFiltered.length === 0 ? (
                   <div style={styles.stateBox}>
                     <strong style={styles.stateTitle}>No hay pendientes para mostrar.</strong>
                     <span style={styles.stateText}>Ningún inquilino tiene DEBE mayor a 0 en los meses visibles.</span>
                   </div>
                 ) : (
                  <div style={styles.matrixList}>
                    <article style={styles.matrixGroup}>
                      <div style={styles.matrixScroll}>
                        <table style={styles.matrixTable}>
                          <thead>
                            <tr>
                              <th style={styles.matrixThCorner} colSpan={4} />
                              {pendingMonthlyMatrixMonths.map((mes) => (
                                <th key={mes} style={styles.matrixThRight}>
                                  {formatMonthLabel(mes)}
                                </th>
                              ))}
                              <th style={styles.matrixThTotal}>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pendingMonthlyMatrixGroupsFiltered.map((group) => (
                              <Fragment key={`pendiente-${group.inquilino}`}>
                                {group.servicios.length === 0 ? (
                                  <tr>
                                    <td style={styles.emptyCell} colSpan={pendingMonthlyMatrixMonths.length + 5}>
                                      No hay registros para mostrar.
                                    </td>
                                  </tr>
                                ) : (
                                  group.servicios.map((servicioBlock, serviceIndex) => (
                                    <Fragment key={`pendiente-${group.inquilino}::${servicioBlock.servicio}::${servicioBlock.moneda}`}>
                                      {(["Contrato", "Pagado", "Exonerada", "Debe"] as const).map((metric, metricIndex) => (
                                        <tr
                                          key={`pendiente-${servicioBlock.servicio}::${metric}`}
                                          style={{
                                            ...styles.tr,
                                            ...(serviceIndex === 0 && metricIndex === 0 ? styles.matrixTenantStartRow : {}),
                                            ...(serviceIndex === group.servicios.length - 1 && metricIndex === 3 ? styles.matrixTenantEndRow : {}),
                                          }}
                                        >
                                          {serviceIndex === 0 && metricIndex === 0 ? (
                                            <td rowSpan={group.servicios.length * 4} style={styles.matrixTenantCell}>
                                              {group.inquilino}
                                            </td>
                                          ) : null}
                                          {metricIndex === 0 ? (
                                            <td rowSpan={4} style={getMonthlyServiceCellStyle(servicioBlock.servicio)}>
                                              {servicioBlock.servicio}
                                            </td>
                                          ) : null}
                                          <td style={styles.matrixMetricCell}>{metric}</td>
                                          <td style={styles.matrixCurrencyCell}>{servicioBlock.moneda}</td>
                                          {pendingMonthlyMatrixMonths.map((mes) => {
                                            const cell = servicioBlock.celdas.get(mes) ?? { contrato: 0, pagado: 0, exonerada: 0, debe: 0 };
                                            const value =
                                              metric === "Contrato"
                                                ? cell.contrato
                                                : metric === "Pagado"
                                                  ? cell.pagado
                                                  : metric === "Exonerada"
                                                    ? cell.exonerada
                                                    : cell.debe;

                                            return (
                                              <td
                                                key={`pendiente-${servicioBlock.servicio}-${metric}-${mes}`}
                                                style={metric === "Debe" ? styles.matrixDebeValueCell : styles.matrixValueCell}
                                              >
                                                {formatMoney(value, servicioBlock.moneda)}
                                              </td>
                                            );
                                          })}
                                          <td style={metric === "Debe" ? styles.matrixDebeTotalCell : styles.matrixTotalCell}>
                                            {formatMoney(
                                              pendingMonthlyMatrixMonths.reduce((sum, mes) => {
                                                const cell = servicioBlock.celdas.get(mes) ?? { contrato: 0, pagado: 0, exonerada: 0, debe: 0 };
                                                const value =
                                                  metric === "Contrato"
                                                    ? cell.contrato
                                                    : metric === "Pagado"
                                                      ? cell.pagado
                                                      : metric === "Exonerada"
                                                        ? cell.exonerada
                                                        : cell.debe;

                                                return sum + Number(value || 0);
                                              }, 0),
                                              servicioBlock.moneda
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </Fragment>
                                  ))
                                )}
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

async function consultarResumen(
  currentFilters: FilterState,
  setRows: (rows: ArrendamientosFila[]) => void,
  setError: (value: string | null) => void,
  setLoading: (value: boolean) => void
) {
  try {
    setLoading(true);
    const selectedYears = parseSelectedYears(currentFilters.anio);
    const anioInicio = selectedYears.length > 0 ? selectedYears[0] : null;
    const anioFin = selectedYears.length > 0 ? selectedYears[selectedYears.length - 1] : null;
    const response = await listarPagosDshResumenAnualArrendamientos({
      idInmueble: parseNullableId(currentFilters.idInmueble),
      idInquilino: parseNullableId(currentFilters.idInquilino),
      ...(anioInicio != null && anioFin != null ? { anioInicio, anioFin } : {}),
    });

    setRows(response);
    setError(null);
  } catch (fetchError) {
    setRows([]);
    setError(fetchError instanceof Error ? fetchError.message : "No se pudo cargar el resumen anual.");
  } finally {
    setLoading(false);
  }
}

function parseNullableId(value: string): number | null {
  const text = value.trim();
  if (!text) {
    return null;
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseSelectedYears(values: string[]): number[] {
  return values
    .filter((value) => value !== YEAR_FILTER_A_FECHA)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
}

function normalizeSelectedYears(values: string[]): string[] {
  if (values.includes(YEAR_FILTER_A_FECHA)) {
    return [YEAR_FILTER_A_FECHA];
  }

  return values
    .map((value) => String(Number(value)))
    .filter((value) => Number.isFinite(Number(value)) && Number(value) > 0)
    .sort((left, right) => Number(left) - Number(right));
}

function resolveYearRange(values: string[]): { anioInicio: number | null; anioFin: number | null } {
  if (values.includes(YEAR_FILTER_A_FECHA)) {
    const currentYear = new Date().getFullYear();
    return { anioInicio: YEAR_OPTIONS[0], anioFin: currentYear };
  }

  const selectedYears = parseSelectedYears(values);
  const anioInicio = selectedYears.length > 0 ? selectedYears[0] : null;
  const anioFin = selectedYears.length > 0 ? selectedYears[selectedYears.length - 1] : null;
  return { anioInicio, anioFin };
}

function getAFechaCutoff(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function filterRowsByCutoff<T extends { periodo?: string | null; fecha?: string | null; fechaContabilizacion?: string | null }>(
  rows: T[],
  cutoff: { year: number; month: number }
): T[] {
  return rows.filter((row) => {
    const period = getRowPeriodYearMonth(row);
    if (!period) {
      return true;
    }

    if (period.year < cutoff.year) {
      return true;
    }

    if (period.year > cutoff.year) {
      return false;
    }

    return period.month <= cutoff.month;
  });
}

function getRowPeriodYearMonth(row: { periodo?: string | null; fecha?: string | null; fechaContabilizacion?: string | null }): { year: number; month: number } | null {
  const raw = (row.periodo ?? row.fechaContabilizacion ?? row.fecha ?? "").trim();
  if (!raw) {
    return null;
  }

  const periodMatch = raw.match(/^(\d{4})-(\d{2})/);
  if (periodMatch) {
    const year = Number(periodMatch[1]);
    const month = Number(periodMatch[2]);
    if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
      return { year, month };
    }
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function normalizeCurrency(currency?: string | null): string {
  const normalized = (currency ?? "PEN").trim().toUpperCase();
  return normalized.length === 3 ? normalized : "PEN";
}

function formatMoney(amount: number, currency?: string | null): string {
  const normalizedCurrency = normalizeCurrency(currency);
  const numericAmount = Number(amount ?? 0);

  try {
    const formattedAmount = new Intl.NumberFormat("es-PE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericAmount);

    if (normalizedCurrency === "USD") {
      return `$ ${formattedAmount}`;
    }

    if (normalizedCurrency === "PEN") {
      return `S/ ${formattedAmount}`;
    }

    return new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericAmount);
  } catch {
    const formattedAmount = numericAmount.toLocaleString("es-PE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    if (normalizedCurrency === "USD") {
      return `$ ${formattedAmount}`;
    }

    if (normalizedCurrency === "PEN") {
      return `S/ ${formattedAmount}`;
    }

    return `${normalizedCurrency} ${formattedAmount}`;
  }
}

function summarizeAmountByCurrency(
  rows: ArrendamientosFila[],
  amountSelector: (row: ArrendamientosFila) => number,
  fallbackCurrency: string
): KpiMoneyLine[] {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const currency = normalizeCurrency(row.moneda ?? fallbackCurrency);
    const current = totals.get(currency) ?? 0;
    totals.set(currency, current + Number(amountSelector(row) ?? 0));
  }

  return Array.from(totals.entries()).map(([currency, amount]) => ({ currency, amount }));
}

function summarizeDetailAmountByCurrency(
  rows: ArrendamientosDshPagosDetalle[],
  amountSelector: (row: ArrendamientosDshPagosDetalle) => number,
  fallbackCurrency: string
): KpiMoneyLine[] {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const currency = normalizeCurrency(row.moneda ?? fallbackCurrency);
    const current = totals.get(currency) ?? 0;
    totals.set(currency, current + Number(amountSelector(row) ?? 0));
  }

  return Array.from(totals.entries()).map(([currency, amount]) => ({ currency, amount }));
}

function getExoneradoAmount(row: ArrendamientosFila): number {
  const exoneradoExplcito = Number(row.exonerado ?? 0);
  if (exoneradoExplcito !== 0) {
    return exoneradoExplcito;
  }

  if (isExoneradoRow(row)) {
    return Number(row.importeOriginal ?? row.importeTransferido ?? row.importe ?? 0);
  }

  return 0;
}

function getDashboardExoneradoAmount(row: ArrendamientosDshPagosDetalle): number {
  if ((row.concepto ?? "").trim().toUpperCase() === "EXONERADO") {
    return Number(row.importe ?? 0);
  }

  if ((row.tipoMovimiento ?? "").trim().toUpperCase() === "PAGO" && (row.estado ?? "").trim().toUpperCase() === "EXONERADO") {
    return Number(row.importe ?? 0);
  }

  return 0;
}

function isExoneradoRow(row: ArrendamientosFila): boolean {
  const candidates = [row.tipoPago, row.concepto, row.detalle, row.tipo, row.nombre];

  return candidates.some((value) => (value ?? "").trim().toUpperCase() === "EXONERADO");
}

function computeSaldoReal(row: ArrendamientosFila): number {
  const contrato = Number(row.importe ?? 0);
  const pagado = Number(row.importeTransferido ?? 0);
  const exonerado = getExoneradoAmount(row);
  return Math.max(0, contrato - pagado - exonerado);
}

function countUniqueContracts(rows: ArrendamientosFila[]): number {
  const uniqueContracts = new Set<string>();

  for (const row of rows) {
    const code = normalizeContractCode(row.codigoContrato ?? row.codigo);
    if (code) {
      uniqueContracts.add(code);
    }
  }

  return uniqueContracts.size;
}

function buildServiceSummary(rows: ArrendamientosFila[], fallbackCurrency: string): ServiceSummaryItem[] {
    const grouped = new Map<string, ServiceSummaryItem>();

    for (const row of rows) {
      const servicio = normalizeServiceName(row.concepto ?? row.detalle ?? row.nombre ?? row.periodo ?? "Servicio");
      const moneda = normalizeCurrency(row.moneda ?? fallbackCurrency);
      const key = `${servicio}::${moneda}`;
      const contrato = Number(row.importe ?? 0);
      const pagado = Number(row.importeTransferido ?? 0);
      const exonerado = getExoneradoAmount(row);
      const saldo = Number(computeSaldoReal(row));

      const current = grouped.get(key);
      if (!current) {
        grouped.set(key, {
          servicio,
          moneda,
          contrato,
          pagado,
          exonerado,
          saldo,
          cumplimiento: calcularCumplimiento(pagado + exonerado, contrato),
        });
        continue;
      }

      current.contrato += contrato;
      current.pagado += pagado;
      current.exonerado += exonerado;
      current.saldo += saldo;
      current.cumplimiento = calcularCumplimiento(current.pagado + current.exonerado, current.contrato);
    }

  return Array.from(grouped.values()).sort((left, right) => {
    if (left.servicio === right.servicio) {
      return left.moneda.localeCompare(right.moneda);
    }

    return left.servicio.localeCompare(right.servicio);
  });
}

function buildStateSummary(rows: ArrendamientosFila[], fallbackCurrency: string): StateSummaryItem[] {
  const grouped = new Map<string, StateSummaryItem>();

  for (const row of rows) {
    const estado = normalizeStateName(row.estado ?? row.tipoPago ?? row.concepto ?? row.detalle ?? "Sin estado");
    const moneda = normalizeCurrency(row.moneda ?? fallbackCurrency);
    const key = `${estado}::${moneda}`;
    const contrato = Number(row.importe ?? 0);
    const pagado = Number(row.importeTransferido ?? 0);
    const exonerado = getExoneradoAmount(row);
    const saldo = Number(computeSaldoReal(row));

    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        estado,
        moneda,
        registros: 1,
        contrato,
        pagado,
        exonerado,
        saldo,
        cumplimiento: calcularCumplimiento(pagado + exonerado, contrato),
      });
      continue;
    }

    current.registros += 1;
    current.contrato += contrato;
    current.pagado += pagado;
    current.exonerado += exonerado;
    current.saldo += saldo;
    current.cumplimiento = calcularCumplimiento(current.pagado + current.exonerado, current.contrato);
  }

  return Array.from(grouped.values()).sort((left, right) => {
    if (left.estado === right.estado) {
      return left.moneda.localeCompare(right.moneda);
    }

    return left.estado.localeCompare(right.estado, "es", { sensitivity: "base" });
  });
}

function buildMonthlyServiceMatrix(rows: ArrendamientosFila[], fallbackCurrency: string): MonthlyServiceMatrixGroup[] {
  const grouped = new Map<string, MonthlyServiceMatrixGroup>();
  const serviceOrder = new Map<string, number>([
    ["ALQUILER", 1],
    ["COCHERA", 2],
    ["MANTENIMIENTO", 3],
  ]);

  for (const row of rows) {
    const periodo = (row.periodo ?? row.fechaContabilizacion ?? row.fecha ?? "").trim();
    if (!periodo) {
      continue;
    }

    const inquilino = (row.inquilino ?? row.nombre ?? "Sin inquilino").trim() || "Sin inquilino";
    const moneda = normalizeCurrency(row.moneda ?? fallbackCurrency);
    const key = normalizeGroupKey(inquilino);
    const servicio = normalizeServiceName(row.concepto ?? row.detalle ?? row.nombre ?? row.periodo ?? "Servicio");
    const contrato = Number(row.importe ?? 0);
    const pagado = Number(row.importeTransferido ?? 0);
    const exonerada = getExoneradoAmount(row);
    const debe = Number(computeSaldoReal(row));

    const current =
      grouped.get(key) ??
      ({
        inquilino,
        meses: [],
        servicios: [],
      } satisfies MonthlyServiceMatrixGroup);

    if (!current.meses.includes(periodo)) {
      current.meses.push(periodo);
      current.meses.sort(comparePeriods);
    }

    const normalizedServiceKey = normalizeGroupKey(servicio);
    const serviceIndex = current.servicios.findIndex((item) => normalizeGroupKey(item.servicio) === normalizedServiceKey);
      const serviceCurrent =
        serviceIndex >= 0
          ? current.servicios[serviceIndex]
          : {
              servicio,
              moneda,
              celdas: new Map<string, MonthlyServiceMatrixCell>(),
            };

    const cell = serviceCurrent.celdas.get(periodo) ?? { contrato: 0, pagado: 0, exonerada: 0, debe: 0 };
    cell.contrato += contrato;
    cell.pagado += pagado;
    cell.exonerada += exonerada;
    cell.debe += debe;
    serviceCurrent.celdas.set(periodo, cell);

    if (serviceIndex >= 0) {
      current.servicios[serviceIndex] = serviceCurrent;
    } else {
      current.servicios.push(serviceCurrent);
    }

    grouped.set(key, current);
  }

  return Array.from(grouped.values())
  .map((group) => ({
      ...group,
      meses: [...group.meses].sort(comparePeriods),
      servicios: [...group.servicios].sort((left, right) => {
        const leftOrder = serviceOrder.get(normalizeServiceKey(left.servicio)) ?? 99;
        const rightOrder = serviceOrder.get(normalizeServiceKey(right.servicio)) ?? 99;

        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }

        return left.servicio.localeCompare(right.servicio, "es", { sensitivity: "base" });
      }),
    }))
    .sort((left, right) => {
      const inquilinoCompare = left.inquilino.localeCompare(right.inquilino, "es", { sensitivity: "base" });
      return inquilinoCompare;
    });
}

function normalizeServiceKey(value: string): string {
  return normalizeServiceName(value).trim().toUpperCase();
}

function normalizeStateName(value?: string | null): string {
  const text = (value ?? "").trim();
  if (!text) {
    return "Sin estado";
  }

  return text
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getMonthlyServiceCellStyle(service: string): CSSProperties {
  const normalized = normalizeServiceKey(service);

  if (normalized === "ALQUILER") {
    return {
      ...styles.matrixServiceCell,
      background: "#C7F3CC",
    };
  }

  if (normalized === "COCHERA") {
    return {
      ...styles.matrixServiceCell,
      background: "#FFF5B8",
    };
  }

  if (normalized === "MANTENIMIENTO") {
    return {
      ...styles.matrixServiceCell,
      background: "#F8D9C8",
    };
  }

  return styles.matrixServiceCell;
}

function buildServiceProgress(rows: ArrendamientosFila[], lookupRows: ArrendamientosDshPagosInquilino[]): ServiceProgressItem[] {
  const grouped = new Map<
    string,
    {
      servicio: string;
      contrato: number;
      pagado: number;
      exonerado: number;
      inquilinos: Map<string, { contrato: number; pagado: number; exonerado: number; label: string }>;
    }
  >();

  for (const row of rows) {
    const servicio = normalizeServiceName(row.concepto ?? row.detalle ?? row.nombre ?? row.periodo ?? "Servicio");
    const serviceKey = normalizeGroupKey(servicio);
    const tenantLabel = (row.inquilino ?? "").trim() || "Sin inquilino";
    const commercialTenantLabel = resolveCommercialTenantLabel(tenantLabel, lookupRows);
    const tenantKey = normalizeGroupKey(tenantLabel);
    const contrato = Number(row.importe ?? 0);
    const pagado = Number(row.importeTransferido ?? 0);
    const exonerado = getExoneradoAmount(row);
    const current = grouped.get(serviceKey) ?? { servicio, contrato: 0, pagado: 0, exonerado: 0, inquilinos: new Map() };

    current.servicio = servicio;
    current.contrato += contrato;
    current.pagado += pagado;
    current.exonerado += exonerado;

    const tenantCurrent = current.inquilinos.get(tenantKey) ?? { contrato: 0, pagado: 0, exonerado: 0, label: commercialTenantLabel };
    tenantCurrent.contrato += contrato;
    tenantCurrent.pagado += pagado;
    tenantCurrent.exonerado += exonerado;
    tenantCurrent.label = commercialTenantLabel;
    current.inquilinos.set(tenantKey, tenantCurrent);

    grouped.set(serviceKey, current);
  }

  return Array.from(grouped.entries())
    .map(([, value]) => {
      const inquilinos = Array.from(value.inquilinos.values())
        .map((tenant) => ({
          inquilino: tenant.label,
          color: getTenantColor(tenant.label),
          contrato: tenant.contrato,
          widthPct: value.contrato > 0 ? ((tenant.pagado + tenant.exonerado) / value.contrato) * 100 : 0,
        }))
        .sort((left, right) => left.inquilino.localeCompare(right.inquilino));

      return {
        servicio: value.servicio,
        contrato: value.contrato,
        pagado: value.pagado,
        cumplimiento: calcularCumplimiento(value.pagado + value.exonerado, value.contrato),
        inquilinos,
      };
    })
    .sort((left, right) => right.cumplimiento - left.cumplimiento || left.servicio.localeCompare(right.servicio));
}

function buildTenantLegend(rows: ArrendamientosFila[], lookupRows: ArrendamientosDshPagosInquilino[]): ServiceTenantItem[] {
  const uniqueTenants = new Map<string, string>();

  for (const row of rows) {
    const tenantLabel = (row.inquilino ?? "").trim() || "Sin inquilino";
    const tenantKey = normalizeGroupKey(tenantLabel);
    if (!uniqueTenants.has(tenantKey)) {
      uniqueTenants.set(tenantKey, resolveCommercialTenantLabel(tenantLabel, lookupRows));
    }
  }

  return Array.from(uniqueTenants.entries())
    .map(([, label]) => ({
      inquilino: label,
      color: getTenantColor(label),
      contrato: 0,
      widthPct: 0,
    }))
    .sort((left, right) => left.inquilino.localeCompare(right.inquilino));
}

function resolveCommercialTenantLabel(rawLabel: string, lookupRows: ArrendamientosDshPagosInquilino[]): string {
  const target = normalizeGroupKey(rawLabel);

  const match = lookupRows.find((item) => {
    const razonSocial = normalizeGroupKey(item.razonSocial ?? "");
    const nombreComercial = normalizeGroupKey(item.nombreComercial ?? "");

    return target === nombreComercial || target === razonSocial;
  });

  if (!match) {
    return rawLabel;
  }

  return (match.nombreComercial ?? "").trim() || rawLabel;
}

function normalizeServiceName(value?: string | null): string {
  const text = (value ?? "").trim();
  if (!text) {
    return "Servicio";
  }

  const normalized = text.toLowerCase();

  if (normalized.includes("alquiler")) {
    return "Alquiler";
  }

  if (normalized.includes("cochera")) {
    return "Cochera";
  }

  if (normalized.includes("mantenimiento")) {
    return "Mantenimiento";
  }

  return text
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function calcularCumplimiento(pagado: number, contrato: number): number {
  if (contrato <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (pagado / contrato) * 100));
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function normalizeContractCode(value?: string | null): string {
  return (value ?? "").trim().toUpperCase();
}

function comparePeriods(left: string, right: string): number {
  const leftDate = parsePeriodToDate(left);
  const rightDate = parsePeriodToDate(right);

  if (leftDate && rightDate) {
    return leftDate.getTime() - rightDate.getTime();
  }

  return left.localeCompare(right);
}

function parsePeriodToDate(value: string): Date | null {
  const text = value.trim();
  if (!text) {
    return null;
  }

  const isoMatch = /^(\d{4})-(\d{2})$/.exec(text);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    return Number.isFinite(year) && Number.isFinite(month) ? new Date(year, month - 1, 1) : null;
  }

  const labelMatch = /^([A-Za-z]{3})-(\d{2,4})$/.exec(text);
  if (labelMatch) {
    const month = parseShortMonth(labelMatch[1]);
    const year = Number(labelMatch[2].length === 2 ? `20${labelMatch[2]}` : labelMatch[2]);
    return month != null && Number.isFinite(year) ? new Date(year, month - 1, 1) : null;
  }

  return null;
}

function parseShortMonth(value: string): number | null {
  const key = value.trim().toLowerCase();
  const months: Record<string, number> = {
    ene: 1,
    feb: 2,
    mar: 3,
    abr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    ago: 8,
    set: 9,
    sep: 9,
    oct: 10,
    nov: 11,
    dic: 12,
  };

  return months[key] ?? null;
}

function formatMonthLabel(value: string): string {
  const parsed = parsePeriodToDate(value);
  if (!parsed) {
    return value;
  }

  const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
  const month = monthNames[parsed.getMonth()] ?? "";
  const year = String(parsed.getFullYear()).slice(-2);
  return `${month}-${year}`;
}

function normalizeGroupKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function getSeriesColor(index: number): string {
  const palette = ["#2563EB", "#7C3AED", "#0F766E", "#D97706", "#DB2777", "#059669", "#DC2626", "#0EA5E9"];
  return palette[index % palette.length];
}

function getTenantColor(value: string): string {
  const normalized = normalizeGroupKey(value);

  if (normalized.includes("eureka")) {
    return "#0F9D58";
  }

  if (normalized.includes("mundo cayetana")) {
    return "#38BDF8";
  }

  if (normalized.includes("pizzeria antica")) {
    return "#F4B400";
  }

  if (normalized.includes("sonrisa segura")) {
    return "#DB4437";
  }

  const palette = ["#DB4437", "#0F9D58", "#38BDF8", "#F4B400"];
  const hash = Array.from(normalized).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

function buildInquilinoLabel(item: LookupRow): string {
  const nombre = (item.nombre ?? "").trim();
  const detalle = (item.detalle ?? "").trim();
  const codigo = (item.codigo ?? "").trim();
  return [nombre || codigo || "Inquilino", detalle].filter(Boolean).join(" - ");
}

function getPillStyle(value?: string | null): CSSProperties {
  const text = (value ?? "").trim().toUpperCase();

  if (["ACTIVO", "VIGENTE", "APROBADO", "PENDIENTE"].includes(text)) {
    return { ...styles.pill, background: "#DCFCE7", color: "#166534" };
  }

  if (["PARCIAL", "VENCIDO", "RECHAZADO"].includes(text)) {
    return { ...styles.pill, background: "#FEF3C7", color: "#92400E" };
  }

  if (["ANULADO", "INACTIVO"].includes(text)) {
    return { ...styles.pill, background: "#FEE2E2", color: "#991B1B" };
  }

  return styles.pill;
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "calc(100vh - 120px)",
    padding: "24px 24px 40px",
    position: "relative",
    overflow: "hidden",
    background: "#FFFFFF",
    color: "#111827",
  },
  shell: {
    position: "relative",
    zIndex: 1,
    maxWidth: 1480,
    margin: "0 auto",
    display: "grid",
    gap: 12,
  },
  backgroundGlowA: { display: "none" },
  backgroundGlowB: { display: "none" },
  hero: {
    display: "grid",
    gridTemplateColumns: "minmax(280px, 1.05fr) minmax(560px, 1.35fr)",
    gap: 12,
    alignItems: "flex-end",
    padding: 14,
    borderRadius: 18,
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    boxShadow: "0 14px 36px rgba(15,23,42,0.08)",
  },
  eyebrow: {
    margin: 0,
    textTransform: "uppercase",
    letterSpacing: "0.24em",
    fontSize: 11,
    color: "#93C5FD",
    fontWeight: 800,
  },
  title: {
    margin: "6px 0 0",
    fontSize: 32,
    lineHeight: 1.05,
    fontWeight: 900,
    color: "#111827",
  },
  heroTitleBlock: { minWidth: 0 },
  heroFilters: {
    display: "grid",
    gridTemplateColumns: "minmax(180px, 1fr) minmax(220px, 1.25fr) minmax(120px, 0.7fr) minmax(140px, 0.65fr)",
    gap: 10,
    alignItems: "end",
    minWidth: 0,
    width: "100%",
  },
  field: {
    display: "grid",
    gap: 6,
    minWidth: 0,
    width: "100%",
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#6B7280",
  },
  select: {
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    height: 44,
    borderRadius: 14,
    border: "1px solid #D1D5DB",
    background: "#FFFFFF",
    color: "#111827",
    padding: "0 14px",
    outline: "none",
    fontSize: 14,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  multiSelect: {
    height: "auto",
    minHeight: 44,
    padding: "8px 12px",
    overflowY: "auto",
    whiteSpace: "normal",
    textOverflow: "clip",
  },
  yearFilterButton: {
    width: "100%",
    minHeight: 44,
    borderRadius: 14,
    border: "1px solid #D1D5DB",
    background: "#FFFFFF",
    color: "#111827",
    padding: "0 14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 700,
    boxSizing: "border-box",
  },
  yearFilterButtonMeta: {
    fontSize: 12,
    fontWeight: 700,
    color: "#6B7280",
    whiteSpace: "nowrap",
  },
  yearFilterButtonLabel: {
    fontSize: 14,
    fontWeight: 800,
    color: "#111827",
  },
  yearFilterButtonCaret: {
    fontSize: 11,
    color: "#64748B",
    lineHeight: 1,
  },
  yearFilterWrap: {
    position: "relative",
    width: "100%",
  },
  yearFilterPanel: {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: 0,
    zIndex: 50,
    width: 280,
    maxWidth: "calc(100vw - 32px)",
    borderRadius: 16,
    border: "1px solid #D1D5DB",
    background: "#FFFFFF",
    boxShadow: "0 18px 45px rgba(15, 23, 42, 0.16)",
    padding: 12,
    display: "grid",
    gap: 12,
  },
  yearFilterPanelHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
  },
  yearFilterHeaderAction: {
    border: "none",
    background: "transparent",
    color: "#2563EB",
    fontSize: 12,
    fontWeight: 700,
    padding: 0,
    cursor: "pointer",
  },
  yearFilterList: {
    display: "grid",
    gap: 6,
    maxHeight: 220,
    overflowY: "auto",
    paddingRight: 4,
  },
  yearFilterItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 10,
    cursor: "pointer",
    userSelect: "none",
  },
  yearFilterItemLabel: {
    fontSize: 14,
    color: "#111827",
    fontWeight: 600,
  },
  yearFilterCheckbox: {
    width: 16,
    height: 16,
    accentColor: "#2563EB",
    flexShrink: 0,
  },
  yearFilterPanelFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
  },
  yearFilterSecondaryButton: {
    minHeight: 34,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #D1D5DB",
    background: "#FFFFFF",
    color: "#334155",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  yearFilterPrimaryButton: {
    minHeight: 34,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #1D4ED8",
    background: "#1D4ED8",
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  consultarButton: {
    width: "100%",
    height: 44,
    borderRadius: 14,
    border: "1px solid #93C5FD",
    background: "#FFFFFF",
    color: "#1D4ED8",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(37,99,235,0.12)",
  },
  exportButton: {
    width: "100%",
    height: 44,
    borderRadius: 14,
    border: "1px solid #F59E0B",
    background: "#FFFFFF",
    color: "#B45309",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(245,158,11,0.12)",
  },
  exportPdfButton: {
    width: "100%",
    height: 44,
    borderRadius: 14,
    border: "1px solid #7C3AED",
    background: "#FFFFFF",
    color: "#6D28D9",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(124,58,237,0.12)",
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 8,
  },
  kpiCard: {
    padding: 12,
    borderRadius: 16,
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderTopWidth: 4,
    borderTopStyle: "solid",
    minHeight: 104,
    display: "grid",
    alignContent: "start",
    gap: 5,
  },
  kpiCardClickable: {
    cursor: "pointer",
  },
  kpiLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.16em",
    color: "#64748B",
    fontWeight: 800,
  },
  kpiValue: {
    fontSize: 24,
    lineHeight: 1.1,
    color: "#111827",
    fontWeight: 900,
  },
  kpiMoneyLines: {
    display: "grid",
    gap: 6,
  },
  kpiMoneyLine: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    columnGap: 12,
    alignItems: "baseline",
  },
  kpiMoneyCurrency: {
    fontSize: 14,
    lineHeight: 1.2,
    color: "#475569",
    fontWeight: 800,
    textAlign: "left",
  },
  kpiMoneyAmount: {
    fontSize: 24,
    lineHeight: 1.1,
    color: "#111827",
    fontWeight: 900,
    textAlign: "right",
  },
  kpiHint: {
    fontSize: 13,
    lineHeight: 1.5,
    color: "#6B7280",
  },
  tabShell: {
    borderRadius: 20,
    overflow: "hidden",
    border: "1px solid #E5E7EB",
    background: "#FFFFFF",
    boxShadow: "0 16px 48px rgba(15,23,42,0.08)",
  },
  tabBar: {
    display: "flex",
    padding: 8,
    gap: 10,
    alignItems: "center",
    borderBottom: "1px solid #E5E7EB",
  },
  tabBarButtons: {
    display: "flex",
    gap: 6,
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  tabBarActions: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  tabButton: {
    border: "1px solid #D1D5DB",
    background: "#F8FAFC",
    color: "#334155",
    borderRadius: 999,
    padding: "10px 16px",
    fontWeight: 800,
    fontSize: 14,
  },
  tabButtonActive: {
    background: "linear-gradient(135deg, #2563EB, #7C3AED)",
    color: "#FFFFFF",
    borderColor: "transparent",
    boxShadow: "0 10px 24px rgba(37,99,235,0.22)",
  },
  tabBody: {
    padding: 10,
    background: "#FFFFFF",
  },
  tableCard: {
    display: "grid",
    gap: 14,
  },
  matrixShell: {
    display: "grid",
    gap: 10,
  },
  matrixList: {
    display: "grid",
    gap: 10,
  },
  matrixGroup: {
    display: "grid",
    gap: 6,
    padding: 8,
    borderRadius: 14,
    border: "1px solid #E5E7EB",
    background: "#F8FAFC",
  },
  matrixGroupHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  matrixGroupTitle: {
    margin: 0,
    fontSize: 18,
    lineHeight: 1.2,
    color: "#111827",
    fontWeight: 900,
  },
  matrixGroupSubtitle: {
    margin: "4px 0 0",
    fontSize: 13,
    color: "#64748B",
    fontWeight: 700,
  },
  matrixScroll: {
    overflowX: "auto",
    borderRadius: 14,
    border: "1px solid #E5E7EB",
    background: "#FFFFFF",
  },
  matrixTable: {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
    minWidth: 960,
    background: "#FFFFFF",
  },
  pendingDebtShell: {
    border: "1px solid #E2E8F0",
    borderRadius: 16,
    background: "#FFFFFF",
    padding: 10,
    display: "grid",
    gap: 8,
  },
  pendingDebtHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  pendingDebtTitle: {
    margin: 0,
    fontSize: 16,
    lineHeight: 1.2,
    fontWeight: 900,
    color: "#0F172A",
  },
  pendingDebtBars: {
    display: "grid",
    gap: 6,
  },
  pendingDebtTenantGroups: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8,
  },
  pendingDebtTenantGroup: {
    display: "grid",
    gap: 6,
    padding: 10,
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    background: "#F8FAFC",
  },
  pendingDebtTenantContent: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  pendingDebtPanel: {
    display: "grid",
    gap: 6,
  },
  pendingDebtPanelTitle: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "#64748B",
    fontWeight: 900,
  },
  pendingDebtTenantHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  pendingDebtTenantName: {
    fontSize: 15,
    fontWeight: 900,
    color: "#0F172A",
    lineHeight: 1.1,
  },
  pendingDebtTenantNameButton: {
    border: "none",
    background: "transparent",
    padding: 0,
    fontSize: 15,
    fontWeight: 900,
    color: "#0F172A",
    lineHeight: 1.1,
    cursor: "pointer",
    textAlign: "left",
  },
  pendingDebtTenantNameButtonActive: {
    color: "#2563EB",
    textDecoration: "underline",
  },
  pendingDebtBarRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    border: "1px solid #E5E7EB",
    borderRadius: 14,
    background: "#FAFAFB",
  },
  pendingDebtBarSubtitle: {
    fontSize: 11,
    color: "#64748B",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    fontWeight: 800,
  },
  pendingDebtTrack: {
    position: "relative",
    height: 12,
    borderRadius: 999,
    background: "#E5E7EB",
    overflow: "hidden",
  },
  pendingDebtFill: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #2563EB 0%, #8B5CF6 100%)",
    boxShadow: "0 4px 10px rgba(37, 99, 235, 0.2)",
  },
  pendingDebtValue: {
    fontSize: 13,
    fontWeight: 900,
    color: "#0F172A",
    whiteSpace: "nowrap",
  },
  pendingDebtValueBlock: {
    display: "grid",
    justifyItems: "end",
    gap: 2,
  },
  pendingDebtValueInline: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "flex-end",
    gap: 6,
    whiteSpace: "nowrap",
  },
  pendingDebtValueSubtitle: {
    fontSize: 12,
    color: "#64748B",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  pendingDebtValueCurrency: {
    fontSize: 12,
    color: "#64748B",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    fontWeight: 800,
  },
  pendingDebtServiceName: {
    fontSize: 13,
    fontWeight: 900,
    color: "#0F172A",
    lineHeight: 1.1,
  },
  pendingDebtServiceRow: {
    display: "grid",
    gap: 6,
    padding: "8px 10px",
    border: "1px solid #E5E7EB",
    borderRadius: 14,
    background: "#FAFAFB",
  },
  pendingDebtServiceRowTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minWidth: 0,
  },
  matrixThCorner: {
    background: "#FFFFFF",
    borderBottom: "1px solid #E5E7EB",
  },
  matrixTh: {
    textAlign: "left",
    padding: "8px 10px",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "#64748B",
    background: "#F8FAFC",
    position: "sticky",
    top: 0,
    whiteSpace: "nowrap",
  },
  matrixThRight: {
    textAlign: "right",
    padding: "8px 10px",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "#64748B",
    background: "#F8FAFC",
    position: "sticky",
    top: 0,
    whiteSpace: "nowrap",
  },
  matrixThTotal: {
    textAlign: "right",
    padding: "8px 10px",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "#64748B",
    background: "#F8FAFC",
    position: "sticky",
    top: 0,
    whiteSpace: "nowrap",
    fontWeight: 900,
  },
  matrixTenantCell: {
    padding: "10px 12px",
    fontSize: 15,
    fontWeight: 900,
    color: "#111827",
    borderTop: "3px solid #CBD5E1",
    borderBottom: "3px solid #CBD5E1",
    borderLeft: "3px solid #CBD5E1",
    borderRight: "3px solid #CBD5E1",
    backgroundColor: "#FFFFFF",
    background: "#FFFFFF",
    textAlign: "center",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
    position: "sticky",
    left: 0,
    minWidth: 180,
    width: 180,
    zIndex: 6,
    boxShadow: "2px 0 0 #CBD5E1",
    boxSizing: "border-box",
    overflow: "hidden",
    backgroundClip: "padding-box",
    isolation: "isolate",
  },
  matrixServiceCell: {
    padding: "10px 12px",
    fontWeight: 900,
    color: "#111827",
    border: "1px solid #D6DCEB",
    textAlign: "center",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
    position: "sticky",
    left: 180,
    minWidth: 150,
    width: 150,
    backgroundColor: "#FFFFFF",
    background: "#FFFFFF",
    zIndex: 5,
    boxShadow: "2px 0 0 #D6DCEB",
    boxSizing: "border-box",
    overflow: "hidden",
    backgroundClip: "padding-box",
    isolation: "isolate",
  },
  matrixCurrencyCell: {
    padding: "10px 12px",
    fontSize: 12,
    fontWeight: 800,
    color: "#475569",
    border: "1px solid #E5E7EB",
    textAlign: "center",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
    position: "sticky",
    left: 410,
    minWidth: 80,
    width: 80,
    backgroundColor: "#FFFFFF",
    background: "#FFFFFF",
    zIndex: 5,
    boxShadow: "2px 0 0 #E5E7EB",
    boxSizing: "border-box",
    overflow: "hidden",
    backgroundClip: "padding-box",
    isolation: "isolate",
  },
  matrixMetricCell: {
    padding: "10px 12px",
    fontWeight: 900,
    color: "#111827",
    border: "1px solid #E5E7EB",
    background: "#FFFFFF",
    textAlign: "left",
    whiteSpace: "nowrap",
    position: "sticky",
    left: 330,
    minWidth: 110,
    width: 110,
    backgroundColor: "#FFFFFF",
    zIndex: 4,
    boxShadow: "2px 0 0 #E5E7EB",
    boxSizing: "border-box",
    overflow: "hidden",
    backgroundClip: "padding-box",
    isolation: "isolate",
  },
  matrixValueCell: {
    padding: "10px 10px",
    textAlign: "right",
    border: "1px solid #E5E7EB",
    color: "#0F172A",
    fontWeight: 700,
    whiteSpace: "nowrap",
    background: "#FFFFFF",
    position: "relative",
    zIndex: 1,
  },
  matrixDebeValueCell: {
    padding: "10px 10px",
    textAlign: "right",
    border: "1px solid #E5E7EB",
    color: "#E11D48",
    fontWeight: 900,
    whiteSpace: "nowrap",
    background: "#FFF1F2",
    position: "relative",
    zIndex: 1,
  },
  matrixTotalCell: {
    padding: "10px 10px",
    textAlign: "right",
    border: "1px solid #E5E7EB",
    color: "#0F172A",
    fontWeight: 900,
    whiteSpace: "nowrap",
    background: "#EEF2FF",
    position: "relative",
    zIndex: 1,
  },
  matrixDebeTotalCell: {
    padding: "10px 10px",
    textAlign: "right",
    border: "1px solid #E5E7EB",
    color: "#E11D48",
    fontWeight: 900,
    whiteSpace: "nowrap",
    background: "#FFE4E6",
    position: "relative",
    zIndex: 1,
  },
  matrixTenantStartRow: {
    borderTop: "3px solid #CBD5E1",
  },
  matrixTenantEndRow: {
    borderBottom: "3px solid #CBD5E1",
  },
  tableHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 6,
    alignItems: "center",
  },
  tableHeaderActions: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    color: "#111827",
    fontWeight: 900,
  },
  sectionSubtitle: {
    margin: "6px 0 0",
    color: "#6B7280",
    fontSize: 13,
    lineHeight: 1.5,
  },
  counterBadge: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(37,99,235,0.14)",
    color: "#BFDBFE",
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid rgba(96,165,250,0.18)",
  },
  tableScroll: {
    overflowX: "auto",
    borderRadius: 16,
    border: "1px solid #E5E7EB",
    background: "#FFFFFF",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 1080,
    background: "#FFFFFF",
  },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "#64748B",
    background: "#F8FAFC",
    position: "sticky",
    top: 0,
  },
  thRight: {
    textAlign: "right",
    padding: "10px 12px",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "#64748B",
    background: "#F8FAFC",
    position: "sticky",
    top: 0,
  },
  tr: {
    borderTop: "1px solid #E5E7EB",
  },
  td: {
    padding: "10px 12px",
    color: "#374151",
    fontSize: 14,
    verticalAlign: "top",
  },
  tdRight: {
    padding: "10px 12px",
    color: "#374151",
    fontSize: 14,
    textAlign: "right",
    verticalAlign: "top",
  },
  tdStrong: {
    padding: "10px 12px",
    color: "#111827",
    fontSize: 14,
    fontWeight: 800,
    verticalAlign: "top",
  },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 28,
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
  },
  stateBox: {
    borderRadius: 16,
    padding: 14,
    background: "#EFF6FF",
    border: "1px solid #BFDBFE",
    display: "grid",
    gap: 8,
  },
  stateBoxError: {
    borderRadius: 16,
    padding: 14,
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    display: "grid",
    gap: 8,
  },
  executiveStack: {
    display: "grid",
    gap: 10,
  },
  executivePanel: {
    borderRadius: 16,
    border: "1px solid #E5E7EB",
    background: "#FFFFFF",
    padding: 12,
    boxShadow: "0 16px 44px rgba(15,23,42,0.06)",
  },
  executivePanelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  executivePanelTitle: {
    margin: 0,
    fontSize: 20,
    lineHeight: 1.15,
    color: "#111827",
    fontWeight: 900,
  },
  executiveTableWrap: {
    overflowX: "auto",
    borderRadius: 12,
    border: "1px solid #E5E7EB",
  },
  executiveTable: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 960,
    background: "#FFFFFF",
  },
  executiveTh: {
    textAlign: "left",
    padding: "10px 12px",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "#64748B",
    background: "#F8FAFC",
  },
  executiveThRight: {
    textAlign: "right",
    padding: "10px 12px",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "#64748B",
    background: "#F8FAFC",
  },
  executiveTr: {
    borderTop: "1px solid #E5E7EB",
  },
  executiveTd: {
    padding: "10px 12px",
    color: "#374151",
    fontSize: 14,
  },
  executiveTdStrong: {
    padding: "10px 12px",
    color: "#111827",
    fontSize: 14,
    fontWeight: 800,
  },
  executiveTdRight: {
    padding: "10px 12px",
    color: "#374151",
    fontSize: 14,
    textAlign: "right",
    whiteSpace: "nowrap",
  },
  executiveEmpty: {
    padding: 14,
    textAlign: "center",
    color: "#6B7280",
    fontSize: 14,
  },
  executiveBars: {
    display: "grid",
    gap: 10,
    marginTop: 8,
  },
  serviceProgressCard: {
    display: "grid",
    gap: 8,
    padding: 10,
    borderRadius: 12,
    border: "1px solid #E5E7EB",
    background: "#FFFFFF",
  },
  legendShell: {
    display: "grid",
    gap: 8,
    marginTop: 8,
    marginBottom: 6,
    padding: 8,
    borderRadius: 12,
    border: "1px solid #E5E7EB",
    background: "#F8FAFC",
  },
  legendTitle: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#64748B",
  },
  legendList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  },
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
  },
  legendColor: {
    width: 10,
    height: 10,
    borderRadius: "999px",
    flexShrink: 0,
  },
  legendLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: "#111827",
  },
  executiveBarRow: {
    display: "grid",
    gridTemplateColumns: "132px minmax(0, 1fr) 52px",
    gap: 14,
    alignItems: "center",
  },
  executiveBarLabel: {
    color: "#111827",
    fontSize: 14,
    fontWeight: 600,
  },
  executiveBarTrack: {
    width: "100%",
    height: 12,
    borderRadius: 999,
    background: "#E5E7EB",
    overflow: "hidden",
  },
  executiveBarSegments: {
    display: "flex",
    width: "100%",
    height: "100%",
  },
  executiveBarSegment: {
    height: "100%",
    minWidth: 2,
  },
  executiveBarPercent: {
    color: "#111827",
    fontSize: 14,
    fontWeight: 800,
    textAlign: "right",
  },
  serviceTenantWrap: {
    display: "grid",
    gap: 8,
  },
  serviceTenantLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "#64748B",
    fontWeight: 800,
  },
  serviceTenantList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  serviceTenantChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #E5E7EB",
    background: "#F8FAFC",
    color: "#111827",
  },
  serviceTenantDot: {
    width: 8,
    height: 8,
    borderRadius: "999px",
    flexShrink: 0,
  },
  serviceTenantText: {
    fontSize: 12,
    fontWeight: 700,
    color: "#111827",
  },
  stateTitle: {
    fontSize: 16,
    color: "#111827",
  },
  stateText: {
    fontSize: 14,
    color: "#4B5563",
    lineHeight: 1.5,
  },
  emptyCell: {
    padding: 18,
    textAlign: "center",
    color: "#6B7280",
    fontSize: 14,
  },
  mutedText: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: 600,
    marginTop: 4,
  },
};


