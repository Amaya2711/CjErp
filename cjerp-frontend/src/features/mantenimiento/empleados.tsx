import { useEffect, useMemo, useRef, useState } from "react";
import AppCard from "../../components/base/AppCard";
import AppPage from "../../components/base/AppPage";
import AppStatusMessage from "../../components/base/AppStatusMessage";
import ConfirmDialog from "../../components/base/ConfirmDialog";
import CrudToolbar, {
  matchesCrudToolbarSearch,
  type CrudToolbarSearchField,
} from "../../components/base/CrudToolbar";
import SidePanelForm from "../../components/base/SidePanelForm";
import {
  empleadosCrudService,
  type CrudLookupItem,
  type EmpleadoCrudItem,
  type EmpleadoCrudSaveRequest,
} from "../../api/empleadosCrudService";
import { getHttpErrorMessage } from "../../utils/httpError";

type EmpleadoForm = {
  id: number | null;
  apellidosEmpleado: string;
  nombresEmpleado: string;
  sexo: string;
  idDocumento: string;
  nroDocumento: string;
  telefono: string;
  correo: string;
  direccion: string;
  fechaIniLaboral: string;
  fechaFinLaboral: string;
  idEmpresaCj: string;
  idClienteCj: string;
  idAreaCj: string;
  idUbicacionCj: string;
  idResponsableCj: string;
  idSegundoVacaciones: string;
  idTerceroVacaciones: string;
};

type EmpleadoTab = "todos" | "pendientes" | "activos" | "inactivos";

const initialForm: EmpleadoForm = {
  id: null,
  apellidosEmpleado: "",
  nombresEmpleado: "",
  sexo: "",
  idDocumento: "",
  nroDocumento: "",
  telefono: "",
  correo: "",
  direccion: "",
  fechaIniLaboral: "",
  fechaFinLaboral: "",
  idEmpresaCj: "",
  idClienteCj: "",
  idAreaCj: "",
  idUbicacionCj: "",
  idResponsableCj: "",
  idSegundoVacaciones: "",
  idTerceroVacaciones: "",
};

function normalizeOptionValue(value: string | number | null | undefined): string {
  return value == null ? "" : String(value).trim();
}

function normalizeTextValue(value: string | null | undefined): string {
  return value == null ? "" : String(value);
}

function formatDateValue(value: string | null | undefined): string {
  const text = normalizeTextValue(value).trim();
  if (!text) {
    return "-";
  }

  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : text;
}

function normalizeUppercase(value: string | null | undefined): string {
  return (value ?? "").toUpperCase();
}

function splitFullName(fullName: string): { apellidosEmpleado: string; nombresEmpleado: string } {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length <= 1) {
    return {
      apellidosEmpleado: normalizeUppercase(fullName),
      nombresEmpleado: "",
    };
  }

  if (parts.length === 2) {
    return {
      apellidosEmpleado: normalizeUppercase(parts[0]),
      nombresEmpleado: normalizeUppercase(parts[1]),
    };
  }

  if (parts.length === 3) {
    return {
      apellidosEmpleado: normalizeUppercase(parts.slice(0, 2).join(" ")),
      nombresEmpleado: normalizeUppercase(parts[2]),
    };
  }

  return {
    apellidosEmpleado: normalizeUppercase(parts.slice(0, 2).join(" ")),
    nombresEmpleado: normalizeUppercase(parts.slice(2).join(" ")),
  };
}

function mapItemToForm(item: EmpleadoCrudItem): EmpleadoForm {
  const splitName = splitFullName(item.nombreEmpleado);

  return {
    id: item.idEmpleado,
    apellidosEmpleado: splitName.apellidosEmpleado,
    nombresEmpleado: splitName.nombresEmpleado,
    sexo: normalizeOptionValue(item.idSexo ?? item.sexo),
    idDocumento: normalizeOptionValue(item.idDocumento),
    nroDocumento: normalizeTextValue(item.nroDocumento),
    telefono: normalizeTextValue(item.telefono),
    correo: normalizeUppercase(normalizeTextValue(item.correo)),
    direccion: normalizeUppercase(normalizeTextValue(item.direccion)),
    fechaIniLaboral: normalizeTextValue(item.fechaIniLaboral),
    fechaFinLaboral: normalizeTextValue(item.fechaFinLaboral),
    idEmpresaCj: normalizeOptionValue(item.idEmpresaCj),
    idClienteCj: normalizeOptionValue(item.idClienteCj),
    idAreaCj: normalizeOptionValue(item.idAreaCj),
    idUbicacionCj: normalizeOptionValue(item.idUbicacionCj),
    idResponsableCj: normalizeOptionValue(item.idResponsableCj),
    idSegundoVacaciones: normalizeOptionValue(item.idSegundoVacaciones),
    idTerceroVacaciones: normalizeOptionValue(item.idTerceroVacaciones),
  };
}

function buildPayload(form: EmpleadoForm): EmpleadoCrudSaveRequest {
  const nombreEmpleado = `${normalizeUppercase(form.apellidosEmpleado).trim()} ${normalizeUppercase(form.nombresEmpleado).trim()}`
    .replace(/\s+/g, " ")
    .trim();

  return {
    nombreEmpleado,
    sexo: form.sexo || null,
    idSexo: form.sexo ? Number(form.sexo) : null,
    idDocumento: form.idDocumento ? Number(form.idDocumento) : null,
    nroDocumento: form.nroDocumento.trim() || null,
    telefono: form.telefono.trim() || null,
    correo: normalizeUppercase(form.correo).trim() || null,
    direccion: normalizeUppercase(form.direccion).trim() || null,
    fechaIniLaboral: form.fechaIniLaboral || null,
    fechaFinLaboral: form.fechaFinLaboral || null,
    idEmpresaCj: form.idEmpresaCj ? Number(form.idEmpresaCj) : null,
    idClienteCj: form.idClienteCj ? Number(form.idClienteCj) : null,
    idAreaCj: form.idAreaCj ? Number(form.idAreaCj) : null,
    idUbicacionCj: form.idUbicacionCj ? Number(form.idUbicacionCj) : null,
    idResponsableCj: form.idResponsableCj ? Number(form.idResponsableCj) : null,
    idSegundoVacaciones: form.idSegundoVacaciones ? Number(form.idSegundoVacaciones) : null,
    idTerceroVacaciones: form.idTerceroVacaciones ? Number(form.idTerceroVacaciones) : null,
  };
}

function lookupLabel(options: CrudLookupItem[], value: string): string {
  if (!value) return "";
  return options.find((item) => item.value === value)?.label ?? "";
}

function getEstadoLabel(idEstado: number | null | undefined): string {
  if (idEstado === 9) {
    return "PENDIENTE";
  }

  if (idEstado === 0) {
    return "INACTIVO";
  }

  return "ACTIVO";
}

function getEstadoNormalizado(item: EmpleadoCrudItem): string {
  return (item.estado || getEstadoLabel(item.idEstado)).trim().toUpperCase();
}

function matchesEmpleadoTab(item: EmpleadoCrudItem, tab: EmpleadoTab): boolean {
  const estado = getEstadoNormalizado(item);

  if (tab === "todos") {
    return true;
  }

  if (tab === "pendientes") {
    return item.idEstado === 9 || estado.includes("PENDIENTE");
  }

  if (tab === "inactivos") {
    return item.idEstado === 0 || estado.includes("INACTIVO") || estado.includes("BAJA");
  }

  return item.idEstado === 1 || estado.includes("ACTIVO");
}

function canApproveEmpleado(item: EmpleadoCrudItem, tab: EmpleadoTab): boolean {
  return tab === "pendientes" ? matchesEmpleadoTab(item, "pendientes") : item.idEstado === 9;
}

function canDeleteEmpleado(tab: EmpleadoTab): boolean {
  return tab === "pendientes" ? false : true;
}

export default function MantenimientoEmpleadosPage() {
  const [items, setItems] = useState<EmpleadoCrudItem[]>([]);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<EmpleadoTab>("todos");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [panelError, setPanelError] = useState("");
  const [success, setSuccess] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [mode, setMode] = useState<"nuevo" | "editar" | "ver">("nuevo");
  const [form, setForm] = useState<EmpleadoForm>(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteItem, setDeleteItem] = useState<EmpleadoCrudItem | null>(null);
  const [approveItem, setApproveItem] = useState<EmpleadoCrudItem | null>(null);
  const [empresas, setEmpresas] = useState<CrudLookupItem[]>([]);
  const [clientes, setClientes] = useState<CrudLookupItem[]>([]);
  const [areas, setAreas] = useState<CrudLookupItem[]>([]);
  const [ubicaciones, setUbicaciones] = useState<CrudLookupItem[]>([]);
  const [sexos, setSexos] = useState<CrudLookupItem[]>([]);
  const [tiposDocumento, setTiposDocumento] = useState<CrudLookupItem[]>([]);
  const [responsables, setResponsables] = useState<CrudLookupItem[]>([]);
  const [segundoValidadores, setSegundoValidadores] = useState<CrudLookupItem[]>([]);
  const [tercerValidadores, setTercerValidadores] = useState<CrudLookupItem[]>([]);
  const [areaQuery, setAreaQuery] = useState("");
  const [areaOpen, setAreaOpen] = useState(false);
  const [responsableQuery, setResponsableQuery] = useState("");
  const [responsableOpen, setResponsableOpen] = useState(false);
  const [segundoValidadorQuery, setSegundoValidadorQuery] = useState("");
  const [segundoValidadorOpen, setSegundoValidadorOpen] = useState(false);
  const [tableContentWidth, setTableContentWidth] = useState(0);
  const areaWrapRef = useRef<HTMLDivElement | null>(null);
  const responsableWrapRef = useRef<HTMLDivElement | null>(null);
  const segundoValidadorWrapRef = useRef<HTMLDivElement | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomScrollRef = useRef<HTMLDivElement | null>(null);

  const searchFields = useMemo<CrudToolbarSearchField<EmpleadoCrudItem>[]>(
    () => [
      { key: "idEmpleado", label: "Id", getValue: (item) => item.idEmpleado },
      { key: "nombreEmpleado", label: "Empleado", getValue: (item) => item.nombreEmpleado },
      { key: "nroDocumento", label: "Documento", getValue: (item) => item.nroDocumento },
      { key: "empresa", label: "Empresa", getValue: (item) => item.empresa },
      { key: "cliente", label: "Cliente", getValue: (item) => item.cliente },
      { key: "area", label: "Area", getValue: (item) => item.area },
      { key: "ubicacion", label: "Ubicacion", getValue: (item) => item.ubicacion },
      { key: "fechaIngreso", label: "Fecha ingreso", getValue: (item) => item.fechaIngreso },
      { key: "correo", label: "Correo", getValue: (item) => item.correo },
    ],
    []
  );

  const filteredItems = useMemo(
    () =>
      items.filter(
        (item) =>
          matchesEmpleadoTab(item, activeTab) && matchesCrudToolbarSearch(item, search, searchFields)
      ),
    [activeTab, items, search, searchFields]
  );

  const tabCounts = useMemo(
    () => ({
      todos: items.filter((item) => matchesCrudToolbarSearch(item, search, searchFields)).length,
      pendientes: items.filter(
        (item) => matchesEmpleadoTab(item, "pendientes") && matchesCrudToolbarSearch(item, search, searchFields)
      ).length,
      activos: items.filter(
        (item) =>
          matchesEmpleadoTab(item, "activos") && matchesCrudToolbarSearch(item, search, searchFields)
      ).length,
      inactivos: items.filter(
        (item) =>
          matchesEmpleadoTab(item, "inactivos") && matchesCrudToolbarSearch(item, search, searchFields)
      ).length,
    }),
    [items, search, searchFields]
  );

  useEffect(() => {
    const tableEl = tableScrollRef.current;
    const bottomEl = bottomScrollRef.current;

    if (!tableEl || !bottomEl) {
      return;
    }

    let syncingFromTable = false;
    let syncingFromBottom = false;

    const syncFromTable = () => {
      if (syncingFromBottom) return;
      syncingFromTable = true;
      bottomEl.scrollLeft = tableEl.scrollLeft;
      requestAnimationFrame(() => {
        syncingFromTable = false;
      });
    };

    const syncFromBottom = () => {
      if (syncingFromTable) return;
      syncingFromBottom = true;
      tableEl.scrollLeft = bottomEl.scrollLeft;
      requestAnimationFrame(() => {
        syncingFromBottom = false;
      });
    };

    tableEl.addEventListener("scroll", syncFromTable, { passive: true });
    bottomEl.addEventListener("scroll", syncFromBottom, { passive: true });

    bottomEl.scrollLeft = tableEl.scrollLeft;

    return () => {
      tableEl.removeEventListener("scroll", syncFromTable);
      bottomEl.removeEventListener("scroll", syncFromBottom);
    };
  }, [filteredItems.length]);

  useEffect(() => {
    const tableEl = tableScrollRef.current;

    if (!tableEl) {
      return;
    }

    let frameId = 0;

    const updateWidth = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        const nextWidth = Math.max(tableEl.scrollWidth, tableEl.clientWidth, 1);
        setTableContentWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
      });
    };

    updateWidth();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            updateWidth();
          });

    resizeObserver?.observe(tableEl);
    const tableNode = tableEl.querySelector("table");
    if (tableNode) {
      resizeObserver?.observe(tableNode);
    }

    window.addEventListener("resize", updateWidth);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, [filteredItems.length]);

  const loadEmployees = async () => {
    setLoading(true);
    setError("");

    try {
      const empleados = await empleadosCrudService.listar();
      setItems(empleados);
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo cargar el mantenimiento de empleados."));
    } finally {
      setLoading(false);
    }
  };

  const loadLookups = async () => {
    setLookupError("");

    try {
      const lookups = await empleadosCrudService.obtenerLookups();
      setEmpresas(lookups.empresas);
      setClientes(lookups.clientes);
      setAreas(lookups.areas);
      setUbicaciones(lookups.ubicaciones);
      setSexos(lookups.sexos);
      setTiposDocumento(lookups.tiposDocumento);
      setResponsables(lookups.responsables);
      setSegundoValidadores(lookups.segundoValidadores);
      setTercerValidadores(lookups.tercerValidadores);
    } catch (err) {
      setLookupError(getHttpErrorMessage(err, "No se pudieron cargar los catálogos de empleados."));
    }
  };

  useEffect(() => {
    void loadEmployees();
    void loadLookups();
  }, []);

  useEffect(() => {
    const selected = areas.find((item) => item.value === form.idAreaCj);
    setAreaQuery(selected?.label ?? "");
  }, [form.idAreaCj, areas]);

  useEffect(() => {
    const selected = responsables.find((item) => item.value === form.idResponsableCj);
    setResponsableQuery(selected?.label ?? "");
  }, [form.idResponsableCj, responsables]);

  useEffect(() => {
    const selected = segundoValidadores.find((item) => item.value === form.idSegundoVacaciones);
    setSegundoValidadorQuery(selected?.label ?? "");
  }, [form.idSegundoVacaciones, segundoValidadores]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (responsableWrapRef.current && !responsableWrapRef.current.contains(event.target as Node)) {
        setResponsableOpen(false);
        const selected = responsables.find((item) => item.value === form.idResponsableCj);
        setResponsableQuery(selected?.label ?? "");
      }

      if (areaWrapRef.current && !areaWrapRef.current.contains(event.target as Node)) {
        setAreaOpen(false);
        const selected = areas.find((item) => item.value === form.idAreaCj);
        setAreaQuery(selected?.label ?? "");
      }

      if (segundoValidadorWrapRef.current && !segundoValidadorWrapRef.current.contains(event.target as Node)) {
        setSegundoValidadorOpen(false);
        const selected = segundoValidadores.find((item) => item.value === form.idSegundoVacaciones);
        setSegundoValidadorQuery(selected?.label ?? "");
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [areas, form.idAreaCj, form.idResponsableCj, form.idSegundoVacaciones, responsables, segundoValidadores]);

  const openNew = () => {
    setMode("nuevo");
    setForm(initialForm);
    setErrors({});
    setPanelError("");
    setPanelOpen(true);
  };

  const openEdit = async (item: EmpleadoCrudItem) => {
    setMode("editar");
    setErrors({});
    setPanelError("");
    setSaving(true);

    try {
      const detalle = await empleadosCrudService.obtener(item.idEmpleado);
      setForm(mapItemToForm(detalle));
      setPanelOpen(true);
    } catch (err) {
      setPanelError(getHttpErrorMessage(err, "No se pudo cargar el detalle del empleado."));
      setPanelOpen(true);
    } finally {
      setSaving(false);
    }
  };

  const closePanel = () => {
    setPanelOpen(false);
    setForm(initialForm);
    setErrors({});
    setPanelError("");
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};

    if (!form.apellidosEmpleado.trim()) {
      nextErrors.apellidosEmpleado = "Ingrese los apellidos del empleado.";
    }

    if (!form.nombresEmpleado.trim()) {
      nextErrors.nombresEmpleado = "Ingrese los nombres del empleado.";
    }

    if (!form.sexo) {
      nextErrors.sexo = "Seleccione el sexo.";
    }

    if (!form.idDocumento) {
      nextErrors.idDocumento = "Seleccione el tipo de documento.";
    }

    if (!form.idEmpresaCj) {
      nextErrors.idEmpresaCj = "Seleccione la empresa.";
    }

    if (!form.idClienteCj) {
      nextErrors.idClienteCj = "Seleccione el cliente.";
    }

    if (!form.idAreaCj) {
      nextErrors.idAreaCj = "Seleccione el area.";
    }

    if (!form.idUbicacionCj) {
      nextErrors.idUbicacionCj = "Seleccione la ubicacion.";
    }

    if (!form.idResponsableCj) {
      nextErrors.idResponsableCj = "Seleccione el responsable.";
    }

    if (!form.idSegundoVacaciones) {
      nextErrors.idSegundoVacaciones = "Seleccione el 2do validador.";
    }

    if (!form.idTerceroVacaciones) {
      nextErrors.idTerceroVacaciones = "Seleccione el 3er validador.";
    }

    if (!form.nroDocumento.trim()) {
      nextErrors.nroDocumento = "Ingrese el numero de documento.";
    }

    if (!form.telefono.trim()) {
      nextErrors.telefono = "Ingrese el telefono.";
    }

    if (form.correo.trim() && !form.correo.includes("@")) {
      nextErrors.correo = "Ingrese un correo valido.";
    }

    if (!form.correo.trim()) {
      nextErrors.correo = "Ingrese el correo.";
    }

    if (!form.direccion.trim()) {
      nextErrors.direccion = "Ingrese la direccion.";
    }

    if (!form.fechaIniLaboral) {
      nextErrors.fechaIniLaboral = "Seleccione la fecha de inicio laboral.";
    }

    if (form.fechaIniLaboral && form.fechaFinLaboral && form.fechaIniLaboral > form.fechaFinLaboral) {
      nextErrors.fechaFinLaboral = "La fecha fin no puede ser menor a la fecha inicio.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    setPanelError("");

    try {
      const payload = buildPayload(form);

      if (mode === "nuevo") {
        await empleadosCrudService.crear(payload);
        setSuccess("Empleado creado correctamente.");
      } else if (form.id) {
        await empleadosCrudService.actualizar(form.id, payload);
        setSuccess("Empleado actualizado correctamente.");
      }

      closePanel();
      await loadEmployees();
    } catch (err) {
      setPanelError(getHttpErrorMessage(err, "No se pudo guardar el empleado."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await empleadosCrudService.eliminar(deleteItem.idEmpleado);
      setSuccess("Empleado dado de baja correctamente.");
      setDeleteItem(null);
      await loadEmployees();
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo dar de baja al empleado."));
    } finally {
      setSaving(false);
    }
  };

  const confirmApprove = async () => {
    if (!approveItem) {
      return;
    }

    const item = approveItem;
    setApprovingId(item.idEmpleado);
    setError("");
    setSuccess("");

    try {
      await empleadosCrudService.aprobar(item.idEmpleado);
      setSuccess("Empleado aprobado correctamente.");
      setApproveItem(null);
      await loadEmployees();
    } catch (err) {
      setError(getHttpErrorMessage(err, "No se pudo aprobar el empleado."));
    } finally {
      setApprovingId(null);
    }
  };

  const handleApprove = async (item: EmpleadoCrudItem) => {
    if (!canApproveEmpleado(item, activeTab)) {
      return;
    }

    setApproveItem(item);
  };

  return (
    <AppPage
      title=""
      fillHeight
      style={{ height: "100%", minHeight: 0, overflow: "hidden", boxSizing: "border-box" }}
    >
      <div style={styles.pageContent}>
      <CrudToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar empleados..."
        searchFieldsHint={searchFields.map((field) => field.label).join(", ")}
        buttons={[
          {
            key: "nuevo",
            label: "Nuevo empleado",
            onClick: openNew,
          },
          {
            key: "recargar",
            label: "Actualizar",
            onClick: () => void loadEmployees(),
            variant: "secondary",
          },
        ]}
      />

      <div style={styles.segmentedTabs}>
        <button
          type="button"
          style={
            activeTab === "todos"
              ? { ...styles.segmentedTabButton, ...styles.segmentedTabButtonActive }
              : styles.segmentedTabButton
          }
          onClick={() => setActiveTab("todos")}
        >
          Todos ({tabCounts.todos})
        </button>
        <button
          type="button"
          style={
            activeTab === "pendientes"
              ? { ...styles.segmentedTabButton, ...styles.segmentedTabButtonActive }
              : styles.segmentedTabButton
          }
          onClick={() => setActiveTab("pendientes")}
        >
          Pendientes ({tabCounts.pendientes})
        </button>
        <button
          type="button"
          style={
            activeTab === "activos"
              ? { ...styles.segmentedTabButton, ...styles.segmentedTabButtonActive }
              : styles.segmentedTabButton
          }
          onClick={() => setActiveTab("activos")}
        >
          Activos ({tabCounts.activos})
        </button>
        <button
          type="button"
          style={
            activeTab === "inactivos"
              ? { ...styles.segmentedTabButton, ...styles.segmentedTabButtonActive }
              : styles.segmentedTabButton
          }
          onClick={() => setActiveTab("inactivos")}
        >
          Inactivos ({tabCounts.inactivos})
        </button>
      </div>

      {loading ? <AppStatusMessage tone="info">Cargando empleados...</AppStatusMessage> : null}
      {success ? <AppStatusMessage tone="success">{success}</AppStatusMessage> : null}
      {error ? <AppStatusMessage tone="error">{error}</AppStatusMessage> : null}
      {lookupError ? <AppStatusMessage tone="error">{lookupError}</AppStatusMessage> : null}

      <AppCard style={styles.card}>
        <div style={styles.cardInner}>
          <div style={styles.headerRow}>
            <div>
              <h2 style={styles.title}>Crud de empleados</h2>
              <p style={styles.subtitle}>
                Mantenimiento de ficha laboral en base a `sp_EmpleadoCj_Ficha`.
              </p>
            </div>
            <div style={styles.counter}>{filteredItems.length} registro(s)</div>
          </div>

          <div style={styles.tableShell}>
            <div ref={tableScrollRef} style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Id</th>
                    <th style={styles.th}>Empleado</th>
                    <th style={styles.th}>Documento</th>
                    <th style={styles.th}>Empresa</th>
                    <th style={styles.th}>Cliente</th>
                    <th style={styles.th}>Estado</th>
                    <th style={styles.th}>Area</th>
                    <th style={styles.th}>Ubicacion</th>
                    <th style={styles.th}>Responsable</th>
                    <th style={styles.th}>Fecha ingreso</th>
                    <th style={styles.th}>Inicio</th>
                    <th style={styles.th}>Fin</th>
                    <th style={styles.th}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={13} style={styles.emptyCell}>
                        No se encontraron empleados.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => (
                      <tr key={item.idEmpleado}>
                        <td style={styles.td}>{item.idEmpleado}</td>
                        <td style={styles.tdBold}>{item.nombreEmpleado}</td>
                        <td style={styles.td}>{item.nroDocumento || "-"}</td>
                        <td style={styles.td}>{item.empresa || "-"}</td>
                        <td style={styles.td}>{item.cliente || "-"}</td>
                        <td style={styles.estadoCell}>{item.estado || getEstadoLabel(item.idEstado)}</td>
                        <td style={styles.td}>{item.area || "-"}</td>
                        <td style={styles.td}>{item.ubicacion || "-"}</td>
                        <td style={styles.td}>{item.responsable || "-"}</td>
                        <td style={styles.td}>{formatDateValue(item.fechaIngreso)}</td>
                        <td style={styles.td}>{formatDateValue(item.fechaIniLaboral)}</td>
                        <td style={styles.td}>{formatDateValue(item.fechaFinLaboral)}</td>
                        <td style={styles.actionsTd}>
                          <button
                            type="button"
                            style={{
                              ...styles.approveButton,
                              ...(!canApproveEmpleado(item, activeTab) || approvingId === item.idEmpleado
                                ? styles.disabledApproveButton
                                : {}),
                            }}
                            onClick={() => setApproveItem(item)}
                            disabled={!canApproveEmpleado(item, activeTab) || approvingId === item.idEmpleado}
                            title={canApproveEmpleado(item, activeTab) ? "Aprobar empleado" : "Solo disponible para pendientes"}
                          >
                            {approvingId === item.idEmpleado ? "Aprobando..." : "Aprobar"}
                          </button>
                          <button type="button" style={styles.secondaryButton} onClick={() => openEdit(item)}>
                            Editar
                          </button>
                          <button
                            type="button"
                            style={{
                              ...styles.dangerButton,
                              ...(canDeleteEmpleado(activeTab) ? {} : styles.disabledApproveButton),
                            }}
                            onClick={() => {
                              if (!canDeleteEmpleado(activeTab)) {
                                return;
                              }
                              setDeleteItem(item);
                            }}
                            disabled={!canDeleteEmpleado(activeTab)}
                            title={canDeleteEmpleado(activeTab) ? "Dar baja empleado" : "No disponible en Pendientes"}
                          >
                            Dar baja
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div ref={bottomScrollRef} style={styles.bottomScrollBar} aria-hidden="true">
              <div
                style={{
                  ...styles.bottomScrollSpacer,
                  width: tableContentWidth > 0 ? `${tableContentWidth}px` : "100%",
                }}
              />
            </div>
          </div>
        </div>
      </AppCard>
      </div>

      <SidePanelForm
        open={panelOpen}
        title={mode === "nuevo" ? "Nuevo empleado" : "Editar empleado"}
        subtitle="Actualice la ficha principal y los datos de detalle del empleado."
        onClose={closePanel}
        maxWidth={880}
        footer={
          <>
            <button type="button" style={styles.secondaryFooterButton} onClick={closePanel}>
              Cancelar
            </button>
            <button type="button" style={styles.primaryFooterButton} onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </>
        }
      >
        {panelError ? <AppStatusMessage tone="error">{panelError}</AppStatusMessage> : null}

      <div style={styles.formGrid}>
          <Field
            label="Apellidos"
            error={errors.apellidosEmpleado}
            input={
              <input
                type="text"
                value={form.apellidosEmpleado}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, apellidosEmpleado: normalizeUppercase(event.target.value) }))
                }
                style={getInputStyle(Boolean(errors.apellidosEmpleado))}
              />
            }
          />
          <Field
            label="Nombres"
            error={errors.nombresEmpleado}
            input={
              <input
                type="text"
                value={form.nombresEmpleado}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, nombresEmpleado: normalizeUppercase(event.target.value) }))
                }
                style={getInputStyle(Boolean(errors.nombresEmpleado))}
              />
            }
          />
          <Field
            label="Tipo de documento"
            error={errors.idDocumento}
            input={
              <select
                value={form.idDocumento}
                onChange={(event) => setForm((prev) => ({ ...prev, idDocumento: event.target.value }))}
                style={getInputStyle(Boolean(errors.idDocumento))}
              >
                <option value="">Seleccione...</option>
                {tiposDocumento.map((option) => (
                  <option key={`tipodoc-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            }
          />
          <Field
            label="Documento"
            error={errors.nroDocumento}
            input={
              <input
                type="text"
                value={form.nroDocumento}
                onChange={(event) => setForm((prev) => ({ ...prev, nroDocumento: event.target.value }))}
                style={getInputStyle(Boolean(errors.nroDocumento))}
              />
            }
          />
          <Field
            label="Sexo"
            error={errors.sexo}
            input={
              <select
                value={form.sexo}
                onChange={(event) => setForm((prev) => ({ ...prev, sexo: event.target.value }))}
                style={getInputStyle(Boolean(errors.sexo))}
              >
                <option value="">Seleccione...</option>
                {sexos.map((option) => (
                  <option key={`sexo-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            }
          />
          <Field
            label="Telefono"
            error={errors.telefono}
            input={
              <input
                type="text"
                value={form.telefono}
                onChange={(event) => setForm((prev) => ({ ...prev, telefono: event.target.value }))}
                style={getInputStyle(Boolean(errors.telefono))}
              />
            }
          />
          <Field
            label="Correo"
            error={errors.correo}
            input={
              <input
                type="email"
                value={form.correo}
                onChange={(event) => setForm((prev) => ({ ...prev, correo: normalizeUppercase(event.target.value) }))}
                style={getInputStyle(Boolean(errors.correo))}
              />
            }
          />
          <Field
            label="Empresa"
            error={errors.idEmpresaCj}
            input={
              <select
                value={form.idEmpresaCj}
                onChange={(event) => setForm((prev) => ({ ...prev, idEmpresaCj: event.target.value }))}
                style={getInputStyle(Boolean(errors.idEmpresaCj))}
              >
                <option value="">Seleccione...</option>
                {empresas.map((option) => (
                  <option key={`empresa-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            }
          />
          <Field
            label="Cliente"
            error={errors.idClienteCj}
            input={
              <select
                value={form.idClienteCj}
                onChange={(event) => setForm((prev) => ({ ...prev, idClienteCj: event.target.value }))}
                style={getInputStyle(Boolean(errors.idClienteCj))}
              >
                <option value="">Seleccione...</option>
                {clientes.map((option) => (
                  <option key={`cliente-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            }
          />
          <Field
            label="Area"
            error={errors.idAreaCj}
            input={
              <div ref={areaWrapRef} style={styles.typeaheadWrap}>
                <input
                  type="text"
                  value={areaQuery}
                  placeholder="Escriba para buscar..."
                  onFocus={() => setAreaOpen(true)}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setAreaQuery(nextValue);
                    setAreaOpen(true);

                    const exactMatch = areas.find((option) => option.label.toUpperCase() === nextValue.trim().toUpperCase());
                    setForm((prev) => ({
                      ...prev,
                      idAreaCj: exactMatch ? exactMatch.value : "",
                    }));
                  }}
                  style={getInputStyle(Boolean(errors.idAreaCj))}
                />
                {areaOpen ? (
                  <div style={styles.typeaheadMenu}>
                    {areas
                      .filter((option) => option.label.toUpperCase().includes(areaQuery.trim().toUpperCase()))
                      .slice(0, 80)
                      .map((option) => (
                        <button
                          key={`area-${option.value}`}
                          type="button"
                          style={styles.typeaheadItem}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setForm((prev) => ({ ...prev, idAreaCj: option.value }));
                            setAreaQuery(option.label);
                            setAreaOpen(false);
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    {areas.filter((option) =>
                      option.label.toUpperCase().includes(areaQuery.trim().toUpperCase())
                    ).length === 0 ? (
                      <div style={styles.typeaheadEmpty}>No se encontraron coincidencias.</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            }
          />
          <Field
            label="Ubicacion"
            error={errors.idUbicacionCj}
            input={
              <select
                value={form.idUbicacionCj}
                onChange={(event) => setForm((prev) => ({ ...prev, idUbicacionCj: event.target.value }))}
                style={getInputStyle(Boolean(errors.idUbicacionCj))}
              >
                <option value="">Seleccione...</option>
                {ubicaciones.map((option) => (
                  <option key={`ubicacion-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            }
          />
          <Field
            label="Responsable"
            error={errors.idResponsableCj}
            input={
              <div ref={responsableWrapRef} style={styles.typeaheadWrap}>
                <input
                  type="text"
                  value={responsableQuery}
                  placeholder="Escriba para buscar..."
                  onFocus={() => setResponsableOpen(true)}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setResponsableQuery(nextValue);
                    setResponsableOpen(true);

                    const exactMatch = responsables.find(
                      (option) => option.label.toUpperCase() === nextValue.trim().toUpperCase()
                    );
                    setForm((prev) => ({
                      ...prev,
                      idResponsableCj: exactMatch ? exactMatch.value : "",
                    }));
                  }}
                  style={getInputStyle(Boolean(errors.idResponsableCj))}
                />
                {responsableOpen ? (
                  <div style={styles.typeaheadMenu}>
                    {responsables
                      .filter((option) =>
                        option.label.toUpperCase().includes(responsableQuery.trim().toUpperCase())
                      )
                      .slice(0, 80)
                      .map((option) => (
                        <button
                          key={`resp-${option.value}`}
                          type="button"
                          style={styles.typeaheadItem}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setForm((prev) => ({ ...prev, idResponsableCj: option.value }));
                            setResponsableQuery(option.label);
                            setResponsableOpen(false);
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    {responsables.filter((option) =>
                      option.label.toUpperCase().includes(responsableQuery.trim().toUpperCase())
                    ).length === 0 ? (
                      <div style={styles.typeaheadEmpty}>No se encontraron coincidencias.</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            }
          />
          <Field
            label="2do validador vacaciones"
            error={errors.idSegundoVacaciones}
            input={
              <div ref={segundoValidadorWrapRef} style={styles.typeaheadWrap}>
                <input
                  type="text"
                  value={segundoValidadorQuery}
                  placeholder="Escriba para buscar..."
                  onFocus={() => setSegundoValidadorOpen(true)}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setSegundoValidadorQuery(nextValue);
                    setSegundoValidadorOpen(true);

                    const exactMatch = segundoValidadores.find(
                      (option) => option.label.toUpperCase() === nextValue.trim().toUpperCase()
                    );
                    setForm((prev) => ({
                      ...prev,
                      idSegundoVacaciones: exactMatch ? exactMatch.value : "",
                    }));
                  }}
                  style={getInputStyle(Boolean(errors.idSegundoVacaciones))}
                />
                {segundoValidadorOpen ? (
                  <div style={styles.typeaheadMenu}>
                    {segundoValidadores
                      .filter((option) =>
                        option.label.toUpperCase().includes(segundoValidadorQuery.trim().toUpperCase())
                      )
                      .slice(0, 80)
                      .map((option) => (
                        <button
                          key={`segundo-${option.value}`}
                          type="button"
                          style={styles.typeaheadItem}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setForm((prev) => ({ ...prev, idSegundoVacaciones: option.value }));
                            setSegundoValidadorQuery(option.label);
                            setSegundoValidadorOpen(false);
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    {segundoValidadores.filter((option) =>
                      option.label.toUpperCase().includes(segundoValidadorQuery.trim().toUpperCase())
                    ).length === 0 ? (
                      <div style={styles.typeaheadEmpty}>No se encontraron coincidencias.</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            }
          />
          <Field
            label="3er validador vacaciones"
            error={errors.idTerceroVacaciones}
            input={
              <select
                value={form.idTerceroVacaciones}
                onChange={(event) => setForm((prev) => ({ ...prev, idTerceroVacaciones: event.target.value }))}
                style={getInputStyle(Boolean(errors.idTerceroVacaciones))}
              >
                <option value="">Seleccione...</option>
                {tercerValidadores.map((option) => (
                  <option key={`tercero-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            }
          />
          <Field
            label="Fecha inicio laboral"
            error={errors.fechaIniLaboral}
            input={
              <input
                type="date"
                value={form.fechaIniLaboral}
                onChange={(event) => setForm((prev) => ({ ...prev, fechaIniLaboral: event.target.value }))}
                style={getInputStyle(Boolean(errors.fechaIniLaboral))}
              />
            }
          />
          <Field
            label="Fecha fin laboral"
            error={errors.fechaFinLaboral}
            input={
            <input
              type="date"
              value={form.fechaFinLaboral}
              onChange={(event) => setForm((prev) => ({ ...prev, fechaFinLaboral: event.target.value }))}
              disabled={mode === "nuevo"}
              style={getInputStyle(Boolean(errors.fechaFinLaboral), mode === "nuevo")}
            />
            }
          />
          <Field
            label="Direccion"
            error={errors.direccion}
            fullWidth
            input={
              <textarea
                value={form.direccion}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, direccion: normalizeUppercase(event.target.value) }))
                }
                style={{ ...getInputStyle(Boolean(errors.direccion)), minHeight: 96, resize: "vertical" }}
              />
            }
          />
        </div>

      </SidePanelForm>

      <ConfirmDialog
        open={deleteItem != null}
        title="Dar baja empleado"
        message={
          <>
            Se dará de baja el empleado <strong>{deleteItem?.nombreEmpleado ?? ""}</strong>. El registro dejará de aparecer
            en el mantenimiento activo.
          </>
        }
        confirmLabel={saving ? "Procesando..." : "Dar baja"}
        cancelLabel="Cancelar"
        destructive
        onCancel={() => setDeleteItem(null)}
        onConfirm={() => void handleDelete()}
      />

      <ConfirmDialog
        open={approveItem != null}
        title="Aprobar empleado"
        message={
          <>
            �Est� de acuerdo en aprobar la creaci�n del empleado <strong>{approveItem?.nombreEmpleado ?? ""}</strong>?
          </>
        }
        confirmLabel={approvingId === approveItem?.idEmpleado ? "Procesando..." : "Aprobar"}
        cancelLabel="Cancelar"
        onCancel={() => setApproveItem(null)}
        onConfirm={() => void confirmApprove()}
      />
    </AppPage>
  );
}

function Field({
  label,
  input,
  error,
  fullWidth = false,
}: {
  label: string;
  input: React.ReactNode;
  error?: string;
  fullWidth?: boolean;
}) {
  return (
    <label style={{ ...styles.field, ...(fullWidth ? styles.fieldFullWidth : undefined) }}>
      <span style={styles.label}>{label}</span>
      {input}
      {error ? <span style={styles.errorText}>{error}</span> : null}
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.infoItem}>
      <div style={styles.infoLabel}>{label}</div>
      <div style={styles.infoValue}>{value || "-"}</div>
    </div>
  );
}

function getInputStyle(hasError: boolean, disabled = false): React.CSSProperties {
  return {
    width: "100%",
    borderRadius: 12,
    border: `1px solid ${hasError ? "#FCA5A5" : disabled ? "#E2E8F0" : "#D6DCEB"}`,
    background: disabled ? "#F1F5F9" : "#F8FAFC",
    color: disabled ? "#94A3B8" : "#0F172A",
    padding: "12px 14px",
    fontSize: 14,
    outline: "none",
    cursor: disabled ? "not-allowed" : "text",
    opacity: disabled ? 0.72 : 1,
  };
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  pageContent: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    minHeight: 0,
    flex: 1,
    height: "100%",
  },
  cardInner: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    flex: 1,
    minHeight: 0,
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
    color: "#0F172A",
  },
  subtitle: {
    margin: "6px 0 0",
    fontSize: 14,
    color: "#64748B",
  },
  counter: {
    borderRadius: 999,
    padding: "10px 14px",
    background: "#EEF2FF",
    color: "#1D4ED8",
    fontWeight: 700,
    fontSize: 13,
  },
  segmentedTabs: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 2,
  },
  segmentedTabButton: {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#334155",
    borderRadius: 999,
    padding: "8px 14px",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  segmentedTabButtonActive: {
    borderColor: "#7C3AED",
    background: "#7C3AED",
    color: "#FFFFFF",
    boxShadow: "0 8px 18px rgba(124, 58, 237, 0.18)",
  },
  tableShell: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    flex: 1,
    minHeight: 0,
  },
  tableWrapper: {
    overflowX: "hidden",
    overflowY: "auto",
    border: "1px solid #E5E7EB",
    borderRadius: 18,
    flex: 1,
    minHeight: 0,
  },
  bottomScrollBar: {
    overflowX: "scroll",
    overflowY: "hidden",
    height: 18,
    minHeight: 18,
    border: "1px solid #E5E7EB",
    borderRadius: 999,
    background: "#F8FAFC",
  },
  bottomScrollSpacer: {
    height: 1,
  },
  table: {
    width: "max-content",
    minWidth: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    padding: "14px 16px",
    fontSize: 12,
    letterSpacing: 0.4,
    color: "#475569",
    background: "#F8FAFC",
    borderBottom: "1px solid #E5E7EB",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "14px 16px",
    borderBottom: "1px solid #EEF2F7",
    color: "#334155",
    fontSize: 14,
    verticalAlign: "top",
    whiteSpace: "nowrap",
  },
  estadoCell: {
    padding: "14px 16px",
    borderBottom: "1px solid #EEF2F7",
    color: "#334155",
    fontSize: 14,
    verticalAlign: "top",
    minWidth: 160,
    whiteSpace: "nowrap",
  },
  tdBold: {
    padding: "14px 16px",
    borderBottom: "1px solid #EEF2F7",
    color: "#0F172A",
    fontSize: 14,
    verticalAlign: "top",
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  estadoBadge: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.2,
  },
  actionsTd: {
    padding: "14px 16px",
    borderBottom: "1px solid #EEF2F7",
    display: "flex",
    gap: 8,
    flexWrap: "nowrap",
    whiteSpace: "nowrap",
  },
  emptyCell: {
    padding: 32,
    textAlign: "center",
    color: "#64748B",
  },
  secondaryButton: {
    border: "1px solid #BFDBFE",
    background: "#EFF6FF",
    color: "#1D4ED8",
    borderRadius: 10,
    padding: "8px 12px",
    fontWeight: 700,
    cursor: "pointer",
  },
  dangerButton: {
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C",
    borderRadius: 10,
    padding: "8px 12px",
    fontWeight: 700,
    cursor: "pointer",
  },
  approveButton: {
    border: "1px solid #86EFAC",
    background: "#F0FDF4",
    color: "#15803D",
    borderRadius: 10,
    padding: "8px 12px",
    fontWeight: 700,
    cursor: "pointer",
  },
  disabledApproveButton: {
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
    color: "#94A3B8",
    cursor: "not-allowed",
    opacity: 0.7,
  },
  primaryFooterButton: {
    border: "none",
    background: "#4F46E5",
    color: "#FFFFFF",
    borderRadius: 12,
    padding: "12px 18px",
    fontWeight: 800,
    cursor: "pointer",
  },
  secondaryFooterButton: {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    borderRadius: 12,
    padding: "12px 18px",
    fontWeight: 700,
    cursor: "pointer",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 16,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  fieldFullWidth: {
    gridColumn: "1 / -1",
  },
  label: {
    fontSize: 13,
    fontWeight: 700,
    color: "#334155",
  },
  errorText: {
    fontSize: 12,
    color: "#DC2626",
  },
  infoCard: {
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
    borderRadius: 18,
    padding: 18,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: 800,
    color: "#0F172A",
    marginBottom: 12,
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },
  infoItem: {
    borderRadius: 14,
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    padding: 12,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  infoValue: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: 700,
    color: "#0F172A",
  },
  typeaheadWrap: {
    position: "relative",
  },
  typeaheadMenu: {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    right: 0,
    maxHeight: 240,
    overflowY: "auto",
    border: "1px solid #CBD5E1",
    borderRadius: 12,
    background: "#FFFFFF",
    boxShadow: "0 14px 28px rgba(15, 23, 42, 0.14)",
    padding: 6,
    zIndex: 40,
    display: "grid",
    gap: 4,
  },
  typeaheadItem: {
    border: "none",
    background: "#FFFFFF",
    color: "#0F172A",
    textAlign: "left",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 12,
    cursor: "pointer",
  },
  typeaheadEmpty: {
    padding: "10px 12px",
    fontSize: 12,
    color: "#64748B",
  },
};
