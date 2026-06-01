import type React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  actualizarCompensacion,
  crearCompensacion,
  eliminarCompensacion,
  listarCompensaciones,
} from "../../api/compensacionService";
import { listarEmpleadosCta } from "../../api/empleadoService";
import CrudToolbar, {
  matchesCrudToolbarSearch,
  type CrudToolbarSearchField,
} from "../../components/base/CrudToolbar";
import { useCrudForm } from "../../hooks/useCrudForm";
import type { EmpleadoCta } from "../../models/empleadoCta";
import type {
  CompensacionGuardarRequest,
  CompensacionRow,
} from "../../models/compensacion";
import { getHttpErrorMessage } from "../../utils/httpError";

const initialForm: CompensacionGuardarRequest = {
  id: undefined,
  idEmpleadoCj: null,
  idEstado: 1,
  fecha: "",
  idActivo: 1,
  idAutorizado: null,
  fechaAutorizado: "",
  fechaInicio: "",
  fechaFin: "",
  fechaPre: "",
  fechaPrimera: "",
  idPre: null,
  idPrimera: null,
  idGestor: null,
  usuario: "",
  idRechazo: null,
  fechaRechazo: "",
  pagada: false,
  comentario: "",
  tipoCompensacion: "",
  cantidadDias: 0,
  idSaldoCompensacion: null,
  idMovimiento: null,
  procesadoSaldo: false,
};

type ActivoFilter = "activos" | "todos" | "inactivos";

function toDateInput(value: string) {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;

  const parts = value.split(/[\/\s-]/).filter(Boolean);
  if (parts.length >= 3 && parts[0].length <= 2) {
    const [dd, mm, yyyy] = parts;
    return `${yyyy.padStart(4, "20")}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  return value.slice(0, 10);
}

function formatDateCell(value?: string) {
  const normalized = toDateInput(value ?? "");
  if (!normalized) return "-";
  const [yyyy, mm, dd] = normalized.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function toNullableNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function mapRowToForm(item: CompensacionRow): CompensacionGuardarRequest {
  return {
    id: item.id,
    idEmpleadoCj: item.idEmpleadoCj,
    idEstado: item.idEstado,
    fecha: toDateInput(item.fecha),
    idActivo: item.idActivo,
    idAutorizado: item.idAutorizado,
    fechaAutorizado: toDateInput(item.fechaAutorizado),
    fechaInicio: toDateInput(item.fechaInicio),
    fechaFin: toDateInput(item.fechaFin),
    fechaPre: toDateInput(item.fechaPre),
    fechaPrimera: toDateInput(item.fechaPrimera),
    idPre: item.idPre,
    idPrimera: item.idPrimera,
    idGestor: item.idGestor,
    usuario: item.usuario,
    idRechazo: item.idRechazo,
    fechaRechazo: toDateInput(item.fechaRechazo),
    pagada: item.pagada,
    comentario: item.comentario,
    tipoCompensacion: item.tipoCompensacion,
    cantidadDias: item.cantidadDias,
    idSaldoCompensacion: item.idSaldoCompensacion,
    idMovimiento: item.idMovimiento,
    procesadoSaldo: item.procesadoSaldo,
  };
}

function getEmpleadoLabel(
  employeeById: Map<number, EmpleadoCta>,
  idEmpleadoCj: number | null
) {
  if (!idEmpleadoCj) return "-";
  const empleado = employeeById.get(idEmpleadoCj);
  return empleado?.nombreEmpleadoCJ || empleado?.nombreEmpleado || String(idEmpleadoCj);
}

export default function CompensacionRealPage() {
  const [search, setSearch] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<ActivoFilter>("activos");
  const [empleados, setEmpleados] = useState<EmpleadoCta[]>([]);
  const [empleadosLoading, setEmpleadosLoading] = useState(false);
  const [empleadosError, setEmpleadosError] = useState<string | null>(null);

  const api = useMemo(
    () => ({
      list: () => listarCompensaciones({ incluirInactivos: true }),
      create: (payload: CompensacionGuardarRequest) => crearCompensacion(payload),
      update: (id: number, payload: CompensacionGuardarRequest) =>
        actualizarCompensacion(id, payload),
      remove: (id: number) => eliminarCompensacion(id),
    }),
    []
  );

  const {
    items,
    form,
    setForm,
    loading,
    saving,
    error,
    message,
    panelOpen,
    setPanelOpen,
    mode,
    setMode,
    idToDelete,
    setIdToDelete,
    handleSave,
    handleDelete,
  } = useCrudForm<CompensacionRow, CompensacionGuardarRequest>(api, initialForm);

  useEffect(() => {
    let cancelled = false;

    const loadEmpleados = async () => {
      try {
        setEmpleadosLoading(true);
        setEmpleadosError(null);
        const data = await listarEmpleadosCta();
        if (!cancelled) {
          setEmpleados(Array.isArray(data) ? data : []);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setEmpleadosError(
            getHttpErrorMessage(err, "No se pudieron cargar los empleados.")
          );
        }
      } finally {
        if (!cancelled) {
          setEmpleadosLoading(false);
        }
      }
    };

    void loadEmpleados();

    return () => {
      cancelled = true;
    };
  }, []);

  const employeeById = useMemo(() => {
    const map = new Map<number, EmpleadoCta>();
    empleados.forEach((item) => {
      if (item.idEmpleado > 0) {
        map.set(item.idEmpleado, item);
      }
    });
    return map;
  }, [empleados]);

  const employeeOptions = useMemo(() => {
    return [...empleados]
      .sort((a, b) =>
        (a.nombreEmpleadoCJ || a.nombreEmpleado || "").localeCompare(
          b.nombreEmpleadoCJ || b.nombreEmpleado || "",
          "es"
        )
      )
      .map((item) => ({
        value: String(item.idEmpleado),
        label: item.nombreEmpleadoCJ || item.nombreEmpleado || String(item.idEmpleado),
      }));
  }, [empleados]);

  const searchFields = useMemo<CrudToolbarSearchField<CompensacionRow>[]>(
    () => [
      { key: "id", label: "Id", getValue: (item) => item.id },
      {
        key: "empleado",
        label: "Empleado",
        getValue: (item) => getEmpleadoLabel(employeeById, item.idEmpleadoCj),
      },
      { key: "tipo", label: "Tipo", getValue: (item) => item.tipoCompensacion },
      { key: "comentario", label: "Comentario", getValue: (item) => item.comentario },
      { key: "saldo", label: "Saldo", getValue: (item) => item.idSaldoCompensacion },
      { key: "movimiento", label: "Movimiento", getValue: (item) => item.idMovimiento },
      { key: "estado", label: "Estado", getValue: (item) => item.idEstado },
    ],
    [employeeById]
  );

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch = matchesCrudToolbarSearch(item, search, searchFields);
      const matchesEmployee =
        !employeeFilter || String(item.idEmpleadoCj ?? "") === employeeFilter;
      const isActive = (item.idActivo ?? 1) === 1;
      const matchesActive =
        activeFilter === "todos"
          ? true
          : activeFilter === "activos"
            ? isActive
            : !isActive;

      return matchesSearch && matchesEmployee && matchesActive;
    });
  }, [activeFilter, employeeFilter, items, search, searchFields]);

  const stats = useMemo(() => {
    const totalDias = filteredItems.reduce(
      (sum, item) => sum + (Number.isFinite(item.cantidadDias) ? item.cantidadDias : 0),
      0
    );
    const activas = filteredItems.filter((item) => (item.idActivo ?? 1) === 1).length;
    const pagadas = filteredItems.filter((item) => item.pagada).length;
    const procesadasSaldo = filteredItems.filter((item) => item.procesadoSaldo).length;

    return {
      total: filteredItems.length,
      totalDias,
      activas,
      pagadas,
      procesadasSaldo,
    };
  }, [filteredItems]);

  const openNuevo = () => {
    setMode("nuevo");
    setForm(initialForm);
    setPanelOpen(true);
  };

  const openEditar = (item: CompensacionRow) => {
    setMode("editar");
    setForm(mapRowToForm(item));
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setMode("nuevo");
    setForm(initialForm);
  };

  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>Recursos Humanos</div>
          <h1 style={styles.title}>Compensacion real</h1>
          <p style={styles.subtitle}>
            CRUD operativo sobre registros de compensacion. La logica automatica de saldo,
            aprobacion de domingo o feriado y movimientos relacionados queda del lado SQL o backend.
          </p>
        </div>
      </div>

      <CrudToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por empleado, tipo, comentario, saldo, movimiento o estado..."
        searchFieldsHint="id, empleado, tipo compensacion, comentario, saldo, movimiento y estado"
        buttons={[
          {
            key: "nuevo",
            label: "Nuevo registro",
            onClick: openNuevo,
          },
          {
            key: "mostrar",
            label: panelOpen ? "Ocultar panel" : "Mostrar panel",
            onClick: () => setPanelOpen((prev) => !prev),
            variant: "secondary",
          },
        ]}
      >
        <div style={styles.toolbarFilters}>
          <label style={styles.toolbarField}>
            <span>Empleado</span>
            <select
              value={employeeFilter}
              onChange={(event) => setEmployeeFilter(event.target.value)}
              style={styles.toolbarSelect}
            >
              <option value="">Todos</option>
              {employeeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label style={styles.toolbarField}>
            <span>Estado visual</span>
            <select
              value={activeFilter}
              onChange={(event) => setActiveFilter(event.target.value as ActivoFilter)}
              style={styles.toolbarSelect}
            >
              <option value="activos">Solo activos</option>
              <option value="todos">Todos</option>
              <option value="inactivos">Solo inactivos</option>
            </select>
          </label>
        </div>
      </CrudToolbar>

      {error ? <div style={styles.errorBox}>{error}</div> : null}
      {message ? <div style={styles.successBox}>{message}</div> : null}
      {empleadosError ? <div style={styles.warningBox}>{empleadosError}</div> : null}

      <div style={styles.statsGrid}>
        <StatCard label="Registros visibles" value={String(stats.total)} tone="blue" />
        <StatCard label="Dias visibles" value={formatDecimal(stats.totalDias)} tone="amber" />
        <StatCard label="Activos" value={String(stats.activas)} tone="green" />
        <StatCard label="Pagadas" value={String(stats.pagadas)} tone="slate" />
        <StatCard
          label="Procesadas saldo"
          value={String(stats.procesadasSaldo)}
          tone="violet"
        />
      </div>

      <div style={styles.layout}>
        <div style={styles.tableCard}>
          <div style={styles.cardHeader}>
            <div>
              <strong>Listado de compensaciones</strong>
              <div style={styles.cardMeta}>
                {filteredItems.length} registro{filteredItems.length === 1 ? "" : "s"} visibles
              </div>
            </div>
            {loading ? <span style={styles.badge}>Cargando...</span> : null}
          </div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Id</th>
                  <th style={styles.th}>Empleado</th>
                  <th style={styles.th}>Fecha</th>
                  <th style={styles.th}>Tipo</th>
                  <th style={styles.th}>Dias</th>
                  <th style={styles.th}>Estado</th>
                  <th style={styles.th}>Activo</th>
                  <th style={styles.th}>Pagada</th>
                  <th style={styles.th}>Saldo</th>
                  <th style={styles.th}>Movimiento</th>
                  <th style={styles.th}>Procesado</th>
                  <th style={styles.th}>Comentario</th>
                  <th style={styles.th}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={13} style={styles.emptyCell}>
                      Cargando registros...
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={13} style={styles.emptyCell}>
                      No hay registros para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td style={styles.td}>{item.id}</td>
                      <td style={styles.td}>
                        <div style={styles.cellPrimary}>
                          {getEmpleadoLabel(employeeById, item.idEmpleadoCj)}
                        </div>
                        <div style={styles.cellSecondary}>Id {item.idEmpleadoCj ?? "-"}</div>
                      </td>
                      <td style={styles.td}>{formatDateCell(item.fecha)}</td>
                      <td style={styles.td}>{item.tipoCompensacion || "-"}</td>
                      <td style={styles.td}>{formatDecimal(item.cantidadDias)}</td>
                      <td style={styles.td}>{item.idEstado ?? "-"}</td>
                      <td style={styles.td}>
                        <StatusPill
                          label={(item.idActivo ?? 1) === 1 ? "Activo" : "Inactivo"}
                          tone={(item.idActivo ?? 1) === 1 ? "green" : "slate"}
                        />
                      </td>
                      <td style={styles.td}>
                        <StatusPill
                          label={item.pagada ? "Si" : "No"}
                          tone={item.pagada ? "blue" : "amber"}
                        />
                      </td>
                      <td style={styles.td}>{item.idSaldoCompensacion ?? "-"}</td>
                      <td style={styles.td}>{item.idMovimiento ?? "-"}</td>
                      <td style={styles.td}>
                        <StatusPill
                          label={item.procesadoSaldo ? "Si" : "No"}
                          tone={item.procesadoSaldo ? "violet" : "slate"}
                        />
                      </td>
                      <td style={styles.td}>
                        <span title={item.comentario || ""}>{item.comentario || "-"}</span>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.actions}>
                          <button
                            type="button"
                            style={styles.secondaryButton}
                            onClick={() => openEditar(item)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            style={styles.dangerButton}
                            onClick={() => setIdToDelete(item.id)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={styles.panelCard}>
          <div style={styles.cardHeader}>
            <div>
              <strong>{mode === "nuevo" ? "Nuevo registro" : "Editar registro"}</strong>
              <div style={styles.cardMeta}>
                Referencia funcional: alta, edicion y rechazo logico de compensacion.
              </div>
            </div>
            <button type="button" style={styles.secondaryButton} onClick={closePanel}>
              Limpiar
            </button>
          </div>

          {panelOpen ? (
            <div style={styles.formGrid}>
              <Field label="Empleado" required>
                <select
                  value={form.idEmpleadoCj != null ? String(form.idEmpleadoCj) : ""}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      idEmpleadoCj: toNullableNumber(event.target.value),
                    }))
                  }
                  style={styles.input}
                  disabled={empleadosLoading}
                >
                  <option value="">Seleccione</option>
                  {employeeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Fecha" required>
                <input
                  type="date"
                  value={form.fecha}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, fecha: event.target.value }))
                  }
                  style={styles.input}
                />
              </Field>

              <Field label="Tipo compensacion" required>
                <input
                  value={form.tipoCompensacion}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, tipoCompensacion: event.target.value }))
                  }
                  style={styles.input}
                  placeholder="Ej. DOMINGO, FERIADO, AJUSTE"
                />
              </Field>

              <Field label="Cantidad dias" required>
                <input
                  type="number"
                  step="0.01"
                  value={form.cantidadDias}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      cantidadDias: Number(event.target.value) || 0,
                    }))
                  }
                  style={styles.input}
                />
              </Field>

              <Field label="IdEstado">
                <input
                  value={form.idEstado ?? ""}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      idEstado: toNullableNumber(event.target.value),
                    }))
                  }
                  style={styles.input}
                />
              </Field>

              <Field label="IdActivo">
                <select
                  value={String(form.idActivo ?? 1)}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      idActivo: toNullableNumber(event.target.value),
                    }))
                  }
                  style={styles.input}
                >
                  <option value="1">Activo</option>
                  <option value="0">Inactivo</option>
                </select>
              </Field>

              <Field label="Pagada">
                <select
                  value={form.pagada ? "1" : "0"}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, pagada: event.target.value === "1" }))
                  }
                  style={styles.input}
                >
                  <option value="0">No</option>
                  <option value="1">Si</option>
                </select>
              </Field>

              <Field label="Procesado saldo">
                <select
                  value={form.procesadoSaldo ? "1" : "0"}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      procesadoSaldo: event.target.value === "1",
                    }))
                  }
                  style={styles.input}
                >
                  <option value="0">No</option>
                  <option value="1">Si</option>
                </select>
              </Field>

              <Field label="Fecha inicio">
                <input
                  type="date"
                  value={form.fechaInicio}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, fechaInicio: event.target.value }))
                  }
                  style={styles.input}
                />
              </Field>

              <Field label="Fecha fin">
                <input
                  type="date"
                  value={form.fechaFin}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, fechaFin: event.target.value }))
                  }
                  style={styles.input}
                />
              </Field>

              <Field label="Id autorizado">
                <input
                  value={form.idAutorizado ?? ""}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      idAutorizado: toNullableNumber(event.target.value),
                    }))
                  }
                  style={styles.input}
                />
              </Field>

              <Field label="Fecha autorizado">
                <input
                  type="date"
                  value={form.fechaAutorizado}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      fechaAutorizado: event.target.value,
                    }))
                  }
                  style={styles.input}
                />
              </Field>

              <Field label="Id saldo compensacion">
                <input
                  value={form.idSaldoCompensacion ?? ""}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      idSaldoCompensacion: toNullableNumber(event.target.value),
                    }))
                  }
                  style={styles.input}
                />
              </Field>

              <Field label="Id movimiento">
                <input
                  value={form.idMovimiento ?? ""}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      idMovimiento: toNullableNumber(event.target.value),
                    }))
                  }
                  style={styles.input}
                />
              </Field>

              <Field label="Comentario" fullWidth>
                <textarea
                  value={form.comentario}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, comentario: event.target.value }))
                  }
                  rows={5}
                  style={styles.textarea}
                />
              </Field>

              <div style={styles.formActions}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={closePanel}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  style={styles.primaryButton}
                  onClick={() => void handleSave()}
                  disabled={saving}
                >
                  {saving
                    ? "Guardando..."
                    : mode === "nuevo"
                      ? "Guardar"
                      : "Actualizar"}
                </button>
              </div>
            </div>
          ) : (
            <div style={styles.emptyForm}>
              Abre el panel para crear o editar un registro de compensacion.
            </div>
          )}
        </div>
      </div>

      {idToDelete ? (
        <div style={styles.deleteOverlay}>
          <div style={styles.deleteCard}>
            <h3 style={styles.deleteTitle}>Confirmar eliminacion</h3>
            <p style={styles.deleteText}>
              Se aplicara un borrado logico sobre el registro <strong>{idToDelete}</strong>.
            </p>
            <div style={styles.formActions}>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => setIdToDelete(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                style={styles.dangerFillButton}
                onClick={() =>
                  void handleDelete(idToDelete).then(() => setIdToDelete(null))
                }
              >
                Eliminar
              </button>
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
  required = false,
  fullWidth = false,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <label
      style={{
        ...styles.field,
        gridColumn: fullWidth ? "1 / -1" : undefined,
      }}
    >
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "amber" | "green" | "slate" | "violet";
}) {
  const tones: Record<string, React.CSSProperties> = {
    blue: { borderColor: "#BFDBFE", background: "#EFF6FF", color: "#1D4ED8" },
    amber: { borderColor: "#FDE68A", background: "#FFFBEB", color: "#B45309" },
    green: { borderColor: "#BBF7D0", background: "#F0FDF4", color: "#15803D" },
    slate: { borderColor: "#CBD5E1", background: "#F8FAFC", color: "#334155" },
    violet: { borderColor: "#DDD6FE", background: "#F5F3FF", color: "#6D28D9" },
  };

  return (
    <div style={{ ...styles.statCard, ...tones[tone] }}>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "slate" | "amber" | "blue" | "violet";
}) {
  const tones: Record<string, React.CSSProperties> = {
    green: { background: "#DCFCE7", color: "#166534" },
    slate: { background: "#E2E8F0", color: "#334155" },
    amber: { background: "#FEF3C7", color: "#92400E" },
    blue: { background: "#DBEAFE", color: "#1D4ED8" },
    violet: { background: "#EDE9FE", color: "#6D28D9" },
  };

  return <span style={{ ...styles.pill, ...tones[tone] }}>{label}</span>;
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 24,
    display: "grid",
    gap: 18,
  },
  hero: {
    display: "grid",
    gap: 8,
    padding: "24px 28px",
    borderRadius: 24,
    background:
      "linear-gradient(135deg, rgba(23,20,58,0.98) 0%, rgba(55,48,163,0.94) 45%, rgba(14,165,233,0.88) 100%)",
    color: "#FFFFFF",
    boxShadow: "0 18px 50px rgba(30, 41, 59, 0.18)",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    opacity: 0.82,
  },
  title: {
    margin: 0,
    fontSize: 34,
    lineHeight: 1.05,
  },
  subtitle: {
    margin: 0,
    maxWidth: 920,
    color: "rgba(255,255,255,0.86)",
    lineHeight: 1.6,
    fontSize: 14,
  },
  toolbarFilters: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "flex-end",
  },
  toolbarField: {
    display: "grid",
    gap: 6,
    minWidth: 180,
    fontSize: 11,
    fontWeight: 700,
    color: "#334155",
  },
  toolbarSelect: {
    height: 42,
    borderRadius: 10,
    border: "1px solid #D1D5DB",
    padding: "0 12px",
    fontSize: 12,
    background: "#FFFFFF",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
  },
  statCard: {
    border: "1px solid",
    borderRadius: 18,
    padding: "14px 16px",
    display: "grid",
    gap: 8,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: 700,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 800,
    lineHeight: 1,
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.5fr) minmax(360px, 0.95fr)",
    gap: 18,
    alignItems: "start",
  },
  tableCard: {
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: 22,
    overflow: "hidden",
    boxShadow: "0 18px 44px rgba(15, 23, 42, 0.06)",
  },
  panelCard: {
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: 22,
    overflow: "hidden",
    position: "sticky",
    top: 12,
    boxShadow: "0 18px 44px rgba(15, 23, 42, 0.06)",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    padding: "18px 20px",
    borderBottom: "1px solid #E2E8F0",
    color: "#0F172A",
  },
  cardMeta: {
    marginTop: 4,
    fontSize: 11,
    color: "#64748B",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "7px 10px",
    borderRadius: 999,
    background: "#EEF2FF",
    color: "#4338CA",
    fontSize: 11,
    fontWeight: 700,
  },
  tableWrap: {
    overflow: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 1220,
  },
  th: {
    position: "sticky",
    top: 0,
    background: "#F8FAFC",
    color: "#334155",
    textAlign: "left",
    padding: "12px 14px",
    fontSize: 11,
    fontWeight: 800,
    borderBottom: "1px solid #E2E8F0",
    zIndex: 1,
  },
  td: {
    padding: "12px 14px",
    fontSize: 12,
    color: "#0F172A",
    borderBottom: "1px solid #E2E8F0",
    verticalAlign: "top",
  },
  cellPrimary: {
    fontWeight: 700,
    color: "#0F172A",
  },
  cellSecondary: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 11,
  },
  emptyCell: {
    textAlign: "center",
    padding: 28,
    color: "#64748B",
    fontSize: 13,
  },
  actions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 54,
    padding: "5px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14,
    padding: 20,
  },
  field: {
    display: "grid",
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    color: "#334155",
  },
  input: {
    height: 42,
    borderRadius: 10,
    border: "1px solid #D1D5DB",
    padding: "0 12px",
    fontSize: 12,
    background: "#FFFFFF",
    color: "#0F172A",
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    borderRadius: 12,
    border: "1px solid #D1D5DB",
    padding: 12,
    fontSize: 12,
    background: "#FFFFFF",
    color: "#0F172A",
    boxSizing: "border-box",
    resize: "vertical",
    minHeight: 118,
  },
  formActions: {
    gridColumn: "1 / -1",
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 4,
  },
  primaryButton: {
    border: "none",
    background: "#4F46E5",
    color: "#FFFFFF",
    padding: "10px 16px",
    borderRadius: 10,
    fontWeight: 800,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    padding: "10px 16px",
    borderRadius: 10,
    fontWeight: 700,
    cursor: "pointer",
  },
  dangerButton: {
    border: "1px solid #FCA5A5",
    background: "#FFFFFF",
    color: "#B91C1C",
    padding: "10px 16px",
    borderRadius: 10,
    fontWeight: 700,
    cursor: "pointer",
  },
  dangerFillButton: {
    border: "none",
    background: "#DC2626",
    color: "#FFFFFF",
    padding: "10px 16px",
    borderRadius: 10,
    fontWeight: 800,
    cursor: "pointer",
  },
  emptyForm: {
    padding: 26,
    color: "#64748B",
    fontSize: 13,
  },
  errorBox: {
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C",
    borderRadius: 14,
    padding: "12px 14px",
  },
  successBox: {
    border: "1px solid #BBF7D0",
    background: "#F0FDF4",
    color: "#166534",
    borderRadius: 14,
    padding: "12px 14px",
  },
  warningBox: {
    border: "1px solid #FDE68A",
    background: "#FFFBEB",
    color: "#92400E",
    borderRadius: 14,
    padding: "12px 14px",
  },
  deleteOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3000,
    padding: 16,
  },
  deleteCard: {
    width: 420,
    maxWidth: "100%",
    background: "#FFFFFF",
    borderRadius: 18,
    padding: 24,
    boxShadow: "0 18px 54px rgba(15, 23, 42, 0.24)",
  },
  deleteTitle: {
    margin: 0,
    color: "#0F172A",
  },
  deleteText: {
    color: "#475569",
    lineHeight: 1.6,
    marginTop: 12,
    marginBottom: 0,
  },
};
