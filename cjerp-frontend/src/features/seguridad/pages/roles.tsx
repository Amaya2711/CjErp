import { useEffect, useMemo, useState } from "react";
import { rolesService, type RolDto } from "../services/rolesService";

type Rol = {
  id: number;
  nombreRol: string;
  descripcion: string;
  estado: "ACTIVO" | "INACTIVO";
  fechaCreacion: string;
};

type RolForm = {
  id: number | null;
  nombreRol: string;
  descripcion: string;
  estado: "ACTIVO" | "INACTIVO";
};

const formularioInicial: RolForm = {
  id: null,
  nombreRol: "",
  descripcion: "",
  estado: "ACTIVO",
};

function mapRolDtoToViewModel(dto: RolDto): Rol {
  return {
    id: dto.idRol,
    nombreRol: dto.nombreRol,
    descripcion: dto.descripcion ?? "",
    estado: (dto.esActivo ?? dto.estado ?? false) ? "ACTIVO" : "INACTIVO",
    fechaCreacion: dto.fechaCreacion
      ? String(dto.fechaCreacion).slice(0, 10)
      : "",
  };
}

export default function SeguridadRolesPage() {
  const [roles, setRoles] = useState<Rol[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [modo, setModo] = useState<"nuevo" | "editar">("nuevo");
  const [form, setForm] = useState<RolForm>(formularioInicial);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [idEliminar, setIdEliminar] = useState<number | null>(null);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const cargarRoles = async () => {
    try {
      setCargando(true);
      setError("");

      const data = await rolesService.listarRoles();
      setRoles(data.map(mapRolDtoToViewModel));
    } catch (err) {
      console.error(err);
      setError("No se pudo cargar la lista de roles.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarRoles();
  }, []);

  const rolesFiltrados = useMemo(() => {
    const texto = busqueda.trim().toUpperCase();

    if (!texto) return roles;

    return roles.filter(
      (x) =>
        x.nombreRol.toUpperCase().includes(texto) ||
        x.descripcion.toUpperCase().includes(texto) ||
        x.estado.toUpperCase().includes(texto)
    );
  }, [roles, busqueda]);

  const abrirNuevo = () => {
    setModo("nuevo");
    setForm(formularioInicial);
    setErrores({});
    setMensaje("");
    setError("");
    setPanelAbierto(true);
  };

  const abrirEditar = (rol: Rol) => {
    setModo("editar");
    setForm({
      id: rol.id,
      nombreRol: rol.nombreRol,
      descripcion: rol.descripcion,
      estado: rol.estado,
    });
    setErrores({});
    setMensaje("");
    setError("");
    setPanelAbierto(true);
  };

  const cerrarPanel = () => {
    setPanelAbierto(false);
    setForm(formularioInicial);
    setErrores({});
  };

  const validar = () => {
    const nuevosErrores: Record<string, string> = {};

    if (!form.nombreRol.trim()) {
      nuevosErrores.nombreRol = "Ingrese el nombre del rol.";
    }

    if (form.nombreRol.trim().length > 100) {
      nuevosErrores.nombreRol = "El nombre no debe exceder 100 caracteres.";
    }

    if (!form.descripcion.trim()) {
      nuevosErrores.descripcion = "Ingrese la descripción.";
    }

    const nombreNormalizado = form.nombreRol.trim().toUpperCase();

    const yaExiste = roles.some(
      (x) => x.nombreRol.trim().toUpperCase() === nombreNormalizado && x.id !== form.id
    );

    if (yaExiste) {
      nuevosErrores.nombreRol = "Ya existe un rol con ese nombre.";
    }

    setErrores(nuevosErrores);
    return Object.keys(nuevosErrores).length === 0;
  };

  const guardar = async () => {
    if (!validar()) return;

    const nombreFinal = form.nombreRol.trim().toUpperCase();
    const descripcionFinal = form.descripcion.trim();

    try {
      setCargando(true);
      setError("");
      setMensaje("");

      const payload = {
        nombreRol: nombreFinal,
        descripcion: descripcionFinal,
        esActivo: form.estado === "ACTIVO",
      };

      if (modo === "nuevo") {
        await rolesService.crearRol(payload);
        setMensaje("Rol creado correctamente.");
      } else if (form.id != null) {
        await rolesService.actualizarRol(form.id, payload);
        setMensaje("Rol actualizado correctamente.");
      }

      await cargarRoles();
      cerrarPanel();
    } catch (err: any) {
      console.error(err);
      const mensajeError =
        err?.response?.data?.message ||
        err?.response?.data?.mensaje ||
        "No se pudo guardar la información del rol.";
      setError(mensajeError);
    } finally {
      setCargando(false);
    }
  };

  const confirmarEliminar = (id: number) => {
    setIdEliminar(id);
  };

  const eliminar = async () => {
    if (idEliminar == null) return;

    try {
      setCargando(true);
      setError("");
      setMensaje("");

      await rolesService.eliminarRol(idEliminar);
      setMensaje("Rol eliminado correctamente.");
      await cargarRoles();
      setIdEliminar(null);
    } catch (err: any) {
      console.error(err);
      const mensajeError =
        err?.response?.data?.message ||
        err?.response?.data?.mensaje ||
        "No se pudo eliminar el rol.";
      setError(mensajeError);
    } finally {
      setCargando(false);
    }
  };

  const rolSeleccionadoEliminar = roles.find((x) => x.id === idEliminar);

  return (
    <div style={styles.page}>
      <div style={styles.toolbar}>
        <input
          type="text"
          placeholder="Buscar por nombre, descripción o estado"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={styles.searchInput}
        />
        <button style={styles.primaryButton} onClick={abrirNuevo}>
          Nuevo rol
        </button>
      </div>

      {cargando ? <div style={styles.infoBox}>Cargando información...</div> : null}
      {mensaje ? <div style={styles.successBox}>{mensaje}</div> : null}
      {error ? <div style={styles.errorBox}>{error}</div> : null}

      <div style={styles.card}>
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Id</th>
                <th style={styles.th}>Nombre rol</th>
                <th style={styles.th}>Descripción</th>
                <th style={styles.th}>Estado</th>
                <th style={styles.th}>Fecha creación</th>
                <th style={styles.thCenter}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rolesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={6} style={styles.emptyCell}>
                    No se encontraron roles.
                  </td>
                </tr>
              ) : (
                rolesFiltrados.map((rol) => (
                  <tr key={rol.id}>
                    <td style={styles.td}>{rol.id}</td>
                    <td style={styles.tdBold}>{rol.nombreRol}</td>
                    <td style={styles.td}>{rol.descripcion}</td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.badge,
                          ...(rol.estado === "ACTIVO"
                            ? styles.badgeActive
                            : styles.badgeInactive),
                        }}
                      >
                        {rol.estado}
                      </span>
                    </td>
                    <td style={styles.td}>{rol.fechaCreacion}</td>
                    <td style={styles.tdCenter}>
                      <div style={styles.actions}>
                        <button
                          style={styles.editButton}
                          onClick={() => abrirEditar(rol)}
                        >
                          Editar
                        </button>
                        <button
                          style={styles.deleteButton}
                          onClick={() => confirmarEliminar(rol.id)}
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

      {panelAbierto && (
        <div style={styles.overlay}>
          <div style={styles.sidePanel}>
            <div style={styles.sidePanelHeader}>
              <div>
                <h2 style={styles.sideTitle}>
                  {modo === "nuevo" ? "Nuevo rol" : "Editar rol"}
                </h2>
                <p style={styles.sideSubtitle}>
                  Complete la información del rol.
                </p>
              </div>

              <button style={styles.closeButton} onClick={cerrarPanel}>
                ×
              </button>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Nombre del rol</label>
              <input
                type="text"
                value={form.nombreRol}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, nombreRol: e.target.value }))
                }
                style={styles.input}
                placeholder="Ejemplo: CONSULTA"
              />
              {errores.nombreRol && (
                <div style={styles.errorText}>{errores.nombreRol}</div>
              )}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Descripción</label>
              <textarea
                value={form.descripcion}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, descripcion: e.target.value }))
                }
                style={styles.textarea}
                placeholder="Descripción del rol"
              />
              {errores.descripcion && (
                <div style={styles.errorText}>{errores.descripcion}</div>
              )}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Estado</label>
              <select
                value={form.estado}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    estado: e.target.value as "ACTIVO" | "INACTIVO",
                  }))
                }
                style={styles.input}
              >
                <option value="ACTIVO">ACTIVO</option>
                <option value="INACTIVO">INACTIVO</option>
              </select>
            </div>

            <div style={styles.panelActions}>
              <button style={styles.secondaryButton} onClick={cerrarPanel}>
                Cancelar
              </button>
              <button style={styles.primaryButton} onClick={guardar}>
                {modo === "nuevo" ? "Guardar" : "Actualizar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {idEliminar !== null && (
        <div style={styles.confirmOverlay}>
          <div style={styles.confirmBox}>
            <h3 style={styles.confirmTitle}>Confirmar eliminación</h3>
            <p style={styles.confirmText}>
              ¿Desea eliminar el rol <strong>{rolSeleccionadoEliminar?.nombreRol}</strong>?
            </p>

            <div style={styles.confirmActions}>
              <button
                style={styles.secondaryButton}
                onClick={() => setIdEliminar(null)}
              >
                Cancelar
              </button>
              <button style={styles.deleteButtonSolid} onClick={eliminar}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },

  header: {
    background: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 8px 24px rgba(23,20,58,0.08)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },

  title: {
    margin: 0,
    fontSize: 28,
    color: "#17143A",
    fontWeight: 700,
  },

  subtitle: {
    marginTop: 8,
    marginBottom: 0,
    color: "#6B7280",
    fontSize: 14,
  },

  toolbar: {
    background: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 8px 24px rgba(23,20,58,0.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  searchInput: {
    width: "100%",
    maxWidth: 420,
    height: 42,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #D1D5DB",
    fontSize: 14,
    outline: "none",
  },

  card: {
    background: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 8px 24px rgba(23,20,58,0.08)",
  },

  infoBox: {
    borderRadius: 12,
    border: "1px solid #E5E7EB",
    background: "#FFFFFF",
    color: "#475569",
    padding: 10,
    fontSize: 13,
    fontWeight: 600,
  },

  successBox: {
    borderRadius: 12,
    border: "1px solid #A7F3D0",
    background: "#ECFDF5",
    color: "#047857",
    padding: 10,
    fontSize: 13,
    fontWeight: 700,
  },

  errorBox: {
    borderRadius: 12,
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C",
    padding: 10,
    fontSize: 13,
    fontWeight: 700,
  },

  tableWrapper: {
    width: "100%",
    overflowX: "auto",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
  },

  th: {
    textAlign: "left",
    padding: "14px 12px",
    fontSize: 13,
    color: "#374151",
    borderBottom: "1px solid #E5E7EB",
    background: "#F9FAFB",
  },

  thCenter: {
    textAlign: "center",
    padding: "14px 12px",
    fontSize: 13,
    color: "#374151",
    borderBottom: "1px solid #E5E7EB",
    background: "#F9FAFB",
  },

  td: {
    padding: "14px 12px",
    borderBottom: "1px solid #F3F4F6",
    color: "#374151",
    fontSize: 14,
  },

  tdBold: {
    padding: "14px 12px",
    borderBottom: "1px solid #F3F4F6",
    color: "#17143A",
    fontSize: 14,
    fontWeight: 700,
  },

  tdCenter: {
    padding: "14px 12px",
    borderBottom: "1px solid #F3F4F6",
    textAlign: "center",
  },

  emptyCell: {
    padding: 24,
    textAlign: "center",
    color: "#6B7280",
    fontSize: 14,
  },

  badge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
  },

  badgeActive: {
    background: "#DCFCE7",
    color: "#166534",
  },

  badgeInactive: {
    background: "#FEE2E2",
    color: "#991B1B",
  },

  actions: {
    display: "flex",
    justifyContent: "center",
    gap: 8,
  },

  primaryButton: {
    border: "none",
    background: "#6E4CCB",
    color: "#FFFFFF",
    padding: "10px 16px",
    borderRadius: 10,
    fontWeight: 700,
    cursor: "pointer",
  },

  secondaryButton: {
    border: "1px solid #D1D5DB",
    background: "#FFFFFF",
    color: "#17143A",
    padding: "10px 16px",
    borderRadius: 10,
    fontWeight: 600,
    cursor: "pointer",
  },

  editButton: {
    border: "1px solid #C7D2FE",
    background: "#EEF2FF",
    color: "#3730A3",
    padding: "8px 12px",
    borderRadius: 8,
    fontWeight: 600,
    cursor: "pointer",
  },

  deleteButton: {
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C",
    padding: "8px 12px",
    borderRadius: 8,
    fontWeight: 600,
    cursor: "pointer",
  },

  deleteButtonSolid: {
    border: "none",
    background: "#DC2626",
    color: "#FFFFFF",
    padding: "10px 16px",
    borderRadius: 10,
    fontWeight: 700,
    cursor: "pointer",
  },

  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.35)",
    display: "flex",
    justifyContent: "flex-end",
    zIndex: 1300,
  },

  sidePanel: {
    width: 420,
    maxWidth: "100%",
    height: "100%",
    background: "#FFFFFF",
    boxShadow: "-8px 0 24px rgba(0,0,0,0.12)",
    padding: 24,
    boxSizing: "border-box",
    overflowY: "auto",
  },

  sidePanelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 24,
  },

  sideTitle: {
    margin: 0,
    fontSize: 24,
    color: "#17143A",
  },

  sideSubtitle: {
    marginTop: 8,
    marginBottom: 0,
    color: "#6B7280",
    fontSize: 14,
  },

  closeButton: {
    border: "none",
    background: "#F3F4F6",
    color: "#17143A",
    width: 34,
    height: 34,
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 22,
    lineHeight: "22px",
  },

  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 18,
  },

  label: {
    fontSize: 14,
    fontWeight: 700,
    color: "#374151",
  },

  input: {
    width: "100%",
    height: 42,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #D1D5DB",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  },

  textarea: {
    width: "100%",
    minHeight: 100,
    padding: 12,
    borderRadius: 10,
    border: "1px solid #D1D5DB",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    resize: "vertical",
    fontFamily: "inherit",
  },

  errorText: {
    fontSize: 12,
    color: "#DC2626",
    fontWeight: 600,
  },

  panelActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 28,
  },

  confirmOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1400,
  },

  confirmBox: {
    width: 420,
    maxWidth: "calc(100% - 24px)",
    background: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 12px 28px rgba(0,0,0,0.16)",
  },

  confirmTitle: {
    marginTop: 0,
    marginBottom: 12,
    color: "#17143A",
  },

  confirmText: {
    marginTop: 0,
    color: "#4B5563",
    lineHeight: 1.6,
  },

  confirmActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 24,
  },
};