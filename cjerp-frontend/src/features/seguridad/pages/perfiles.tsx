import { useMemo, useRef, useState } from "react";
import { useCrudForm } from "../../../hooks/useCrudForm";
import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppSectionHeader from "../../../components/base/AppSectionHeader";
import AppStatusMessage from "../../../components/base/AppStatusMessage";
import AppToolbar from "../../../components/base/AppToolbar";
import {
  perfilesService,
  type PerfilDto,
} from "../services/perfilesService";

type PerfilPayload = {
  nombrePerfil: string;
  descripcion: string;
  esActivo: boolean;
};

type Perfil = {
  id: number;
  nombrePerfil: string;
  descripcion: string;
  estado: "ACTIVO" | "INACTIVO";
  fechaCreacion: string;
};

type PerfilForm = {
  id: number | null;
  nombrePerfil: string;
  descripcion: string;
  estado: "ACTIVO" | "INACTIVO";
};

const formularioInicial: PerfilForm = {
  id: null,
  nombrePerfil: "",
  descripcion: "",
  estado: "ACTIVO",
};

function mapPerfilDtoToView(item: PerfilDto): Perfil {
  return {
    id: item.idPerfil,
    nombrePerfil: item.nombrePerfil,
    descripcion: item.descripcion ?? "",
    estado: item.esActivo ? "ACTIVO" : "INACTIVO",
    fechaCreacion: item.fechaCreacion
      ? new Date(item.fechaCreacion).toISOString().slice(0, 10)
      : "",
  };
}

const perfilesApi = {
  list: async () => {
    const perfiles = await perfilesService.listarPerfiles();
    return perfiles.map(mapPerfilDtoToView);
  },
  create: async (form: PerfilForm) => {
    const payload: PerfilPayload = {
      nombrePerfil: form.nombrePerfil.trim().toUpperCase(),
      descripcion: form.descripcion.trim(),
      esActivo: form.estado === "ACTIVO",
    };
    await perfilesService.crearPerfil(payload);
  },
  update: async (id: number, form: PerfilForm) => {
    const payload: PerfilPayload = {
      nombrePerfil: form.nombrePerfil.trim().toUpperCase(),
      descripcion: form.descripcion.trim(),
      esActivo: form.estado === "ACTIVO",
    };
    await perfilesService.actualizarPerfil(id, payload);
  },
  remove: async (id: number) => {
    await perfilesService.eliminarPerfil(id);
  },
};

export default function SeguridadPerfilesPage() {
  const sidePanelRef = useRef<HTMLDivElement | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});

  const {
    items: perfiles,
    form,
    setForm,
    loading: cargando,
    saving: guardando,
    error: errorMensaje,
    message: mensaje,
    panelOpen: panelAbierto,
    setPanelOpen: setPanelAbierto,
    mode: modo,
    setMode: setModo,
    idToDelete: idEliminar,
    setIdToDelete: setIdEliminar,
    handleSave,
    handleDelete,
    load: cargarPerfiles,
  } = useCrudForm<Perfil, PerfilForm>(perfilesApi, formularioInicial);

  const perfilesFiltrados = useMemo(() => {
    const texto = busqueda.trim().toUpperCase();
    if (!texto) return perfiles;

    return perfiles.filter(
      (x) =>
        x.nombrePerfil.toUpperCase().includes(texto) ||
        x.descripcion.toUpperCase().includes(texto) ||
        x.estado.toUpperCase().includes(texto)
    );
  }, [perfiles, busqueda]);

  const abrirNuevo = () => {
    setModo("nuevo");
    setForm(formularioInicial);
    setErrores({});
    setPanelAbierto(true);
  };

  const abrirEditar = (perfil: Perfil) => {
    setModo("editar");
    setForm({
      id: perfil.id,
      nombrePerfil: perfil.nombrePerfil,
      descripcion: perfil.descripcion,
      estado: perfil.estado,
    });
    setErrores({});
    setPanelAbierto(true);
  };

  const cerrarPanel = () => {
    setPanelAbierto(false);
    setForm(formularioInicial);
    setErrores({});
  };

  const validar = () => {
    const nuevosErrores: Record<string, string> = {};

    if (!form.nombrePerfil.trim()) {
      nuevosErrores.nombrePerfil = "Ingrese el nombre del perfil.";
    }

    if (form.nombrePerfil.trim().length > 100) {
      nuevosErrores.nombrePerfil = "El nombre no debe exceder 100 caracteres.";
    }

    if (!form.descripcion.trim()) {
      nuevosErrores.descripcion = "Ingrese la descripcion.";
    }

    setErrores(nuevosErrores);
    return Object.keys(nuevosErrores).length === 0;
  };

  const guardar = async () => {
    if (!validar()) return;

    await handleSave();
    setPanelAbierto(false);
    setForm(formularioInicial);
    await cargarPerfiles();
  };

  const confirmarEliminar = (id: number) => {
    setIdEliminar(id);
  };

  const eliminar = async () => {
    if (idEliminar == null) return;
    await handleDelete(idEliminar);
    setIdEliminar(null);
  };

  const perfilSeleccionadoEliminar = perfiles.find((x) => x.id === idEliminar);

  return (
    <AppPage title="Perfiles de seguridad">
      <AppToolbar>
        <input
          type="text"
          placeholder="Buscar por nombre, descripcion o estado"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={styles.searchInput}
        />
        <button style={styles.primaryButton} onClick={abrirNuevo}>
          Nuevo perfil
        </button>
      </AppToolbar>

      {mensaje ? <AppStatusMessage tone="success">{mensaje}</AppStatusMessage> : null}
      {errorMensaje ? <AppStatusMessage tone="error">{errorMensaje}</AppStatusMessage> : null}

      <AppCard style={styles.card}>
        <AppSectionHeader
          title="Listado de perfiles"
          description="Administra los perfiles, su estado y la información base del módulo."
        />
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Id</th>
                <th style={styles.th}>Nombre perfil</th>
                <th style={styles.th}>Descripcion</th>
                <th style={styles.th}>Estado</th>
                <th style={styles.th}>Fecha creacion</th>
                <th style={styles.thCenter}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={6} style={styles.emptyCell}>
                    Cargando perfiles...
                  </td>
                </tr>
              ) : perfilesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={6} style={styles.emptyCell}>
                    No se encontraron perfiles.
                  </td>
                </tr>
              ) : (
                perfilesFiltrados.map((perfil) => (
                  <tr key={perfil.id}>
                    <td style={styles.td}>{perfil.id}</td>
                    <td style={styles.tdBold}>{perfil.nombrePerfil}</td>
                    <td style={styles.td}>{perfil.descripcion}</td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.badge,
                          ...(perfil.estado === "ACTIVO"
                            ? styles.badgeActive
                            : styles.badgeInactive),
                        }}
                      >
                        {perfil.estado}
                      </span>
                    </td>
                    <td style={styles.td}>{perfil.fechaCreacion}</td>
                    <td style={styles.tdCenter}>
                      <div style={styles.actions}>
                        <button
                          style={styles.editButton}
                          onClick={() => abrirEditar(perfil)}
                        >
                          Editar
                        </button>
                        <button
                          style={styles.deleteButton}
                          onClick={() => confirmarEliminar(perfil.id)}
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
      </AppCard>

      {panelAbierto && (
        <div style={styles.overlay}>
          <div style={styles.sidePanel} ref={sidePanelRef}>
            <div style={styles.sidePanelHeader}>
              <div>
                <h2 style={styles.sideTitle}>
                  {modo === "nuevo" ? "Nuevo perfil" : "Editar perfil"}
                </h2>
                <p style={styles.sideSubtitle}>
                  Complete la informacion del perfil.
                </p>
              </div>

              <button style={styles.closeButton} onClick={cerrarPanel}>
                x
              </button>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Nombre del perfil</label>
              <input
                type="text"
                value={form.nombrePerfil}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, nombrePerfil: e.target.value }))
                }
                style={styles.input}
                placeholder="Ejemplo: PAGOS"
              />
              {errores.nombrePerfil && (
                <div style={styles.errorText}>{errores.nombrePerfil}</div>
              )}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Descripcion</label>
              <textarea
                value={form.descripcion}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, descripcion: e.target.value }))
                }
                style={styles.textarea}
                placeholder="Descripcion del perfil"
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
              <button
                style={styles.primaryButton}
                onClick={guardar}
                disabled={guardando}
              >
                {guardando
                  ? "Guardando..."
                  : modo === "nuevo"
                  ? "Guardar"
                  : "Actualizar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {idEliminar !== null && (
        <div style={styles.confirmOverlay}>
          <div style={styles.confirmBox}>
            <h3 style={styles.confirmTitle}>Confirmar eliminacion</h3>
            <p style={styles.confirmText}>
              Desea eliminar el perfil{" "}
              <strong>{perfilSeleccionadoEliminar?.nombrePerfil}</strong>?
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
    </AppPage>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 20,
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
  messageBox: {
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    color: "#991B1B",
    padding: 14,
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 600,
  },
  successBox: {
    background: "#ECFDF5",
    border: "1px solid #A7F3D0",
    color: "#047857",
    padding: 14,
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 600,
  },
  card: {
    background: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 8px 24px rgba(23,20,58,0.08)",
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
    zIndex: 3000,
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
    zIndex: 3100,
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
