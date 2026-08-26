import { useEffect, useMemo, useState } from "react";
import AppCard from "../../../../components/base/AppCard";
import AppPage from "../../../../components/base/AppPage";
import AppStatusMessage from "../../../../components/base/AppStatusMessage";
import ConfirmDialog from "../../../../components/base/ConfirmDialog";
import InputBase from "../../../../components/base/InputBase";
import SelectBase from "../../../../components/base/SelectBase";
import ToolbarFiltro from "../../../../components/base/ToolbarFiltro";
import { menuService, type MenuDto } from "../../services/menuService";
import { rolesService, type RolDto } from "../../services/rolesService";
import {
  seguridadPermisosAccionesService,
  type PermisoAccionDto,
  type TipoElementoPermiso,
} from "../../services/seguridadPermisosAccionesService";
import { getHttpErrorMessage } from "../../../../utils/httpError";
import { getAuthUser } from "../../../../utils/authStorage";
import { listarEmpleadosCta } from "../../../../api/empleadoService";
import type { EmpleadoCta } from "../../../../models/empleadoCta";

type SubjectType = "rol" | "empleado";
type FormMode = "nuevo" | "editar";

type PermisoAccionForm = {
  idPermisoAccion: number | null;
  rutaPagina: string;
  claveAccion: string;
  etiqueta: string;
  tipoElemento: TipoElementoPermiso;
  subjectType: SubjectType;
  subjectId: string;
  puedeVer: boolean;
  puedeEjecutar: boolean;
  esActivo: boolean;
};

const formInicial: PermisoAccionForm = {
  idPermisoAccion: null,
  rutaPagina: "",
  claveAccion: "",
  etiqueta: "",
  tipoElemento: "button",
  subjectType: "rol",
  subjectId: "",
  puedeVer: true,
  puedeEjecutar: false,
  esActivo: true,
};

const tipoElementoOptions: { value: TipoElementoPermiso; label: string }[] = [
  { value: "menu", label: "Menu" },
  { value: "tab", label: "Pestana" },
  { value: "button", label: "Boton" },
  { value: "system", label: "Sistema" },
];

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function getDisplayNameFromRuta(ruta: string, menus: MenuDto[]) {
  const match = menus.find((menu) => normalizeText(menu.ruta) === ruta);
  return match?.nombreMenu ?? ruta;
}

export default function SeguridadPermisosAccionesPage() {
  const authUser = getAuthUser();
  const usuarioEjecucion =
    normalizeText(authUser?.usuario) ||
    normalizeText(authUser?.userName) ||
    normalizeText(authUser?.username) ||
    "SYSTEM";

  const [cargandoCatalogos, setCargandoCatalogos] = useState(false);
  const [cargandoLista, setCargandoLista] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const [menus, setMenus] = useState<MenuDto[]>([]);
  const [roles, setRoles] = useState<RolDto[]>([]);
  const [empleados, setEmpleados] = useState<EmpleadoCta[]>([]);
  const [permisos, setPermisos] = useState<PermisoAccionDto[]>([]);

  const [filtroRuta, setFiltroRuta] = useState("");
  const [filtroSubjectType, setFiltroSubjectType] = useState<SubjectType>(
    authUser?.idrol ? "rol" : "empleado"
  );
  const [filtroSubjectId, setFiltroSubjectId] = useState(
    authUser?.idrol ? String(authUser.idrol) : authUser?.idEmpleado ? String(authUser.idEmpleado) : ""
  );
  const [filtroTipoElemento, setFiltroTipoElemento] = useState<string>("");

  const [panelAbierto, setPanelAbierto] = useState(false);
  const [modo, setModo] = useState<FormMode>("nuevo");
  const [form, setForm] = useState<PermisoAccionForm>(formInicial);
  const [idEliminar, setIdEliminar] = useState<number | null>(null);

  const menuOptions = useMemo(() => {
    return menus
      .filter((menu) => normalizeText(menu.ruta))
      .map((menu) => ({
        value: normalizeText(menu.ruta),
        label: `${menu.nombreMenu} - ${normalizeText(menu.ruta)}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [menus]);

  const roleOptions = useMemo(
    () =>
      roles.map((rol) => ({
        value: String(rol.idRol),
        label: `${rol.nombreRol} (#${rol.idRol})`,
      })),
    [roles]
  );

  const employeeOptions = useMemo(
    () =>
      empleados.map((empleado) => ({
        value: String(empleado.idEmpleado),
        label: `${empleado.nombreEmpleado} (#${empleado.idEmpleado})`,
      })),
    [empleados]
  );

  const filteredPermisos = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) {
      return permisos;
    }

    return permisos.filter((permiso) => {
      return [
        permiso.rutaPagina,
        permiso.nombrePagina,
        permiso.claveAccion,
        permiso.etiqueta,
        permiso.tipoElemento,
        permiso.nombreRol,
        permiso.nombreEmpleado,
      ]
        .filter(Boolean)
        .some((valor) => String(valor).toLowerCase().includes(texto));
    });
  }, [busqueda, permisos]);

  const sujetoActualLabel = useMemo(() => {
    if (filtroSubjectType === "rol") {
      const rol = roles.find((item) => String(item.idRol) === filtroSubjectId);
      return rol ? `${rol.nombreRol} (#${rol.idRol})` : filtroSubjectId ? `Rol #${filtroSubjectId}` : "Sin rol";
    }

    const empleado = empleados.find((item) => String(item.idEmpleado) === filtroSubjectId);
    return empleado
      ? `${empleado.nombreEmpleado} (#${empleado.idEmpleado})`
      : filtroSubjectId
        ? `Empleado #${filtroSubjectId}`
        : "Sin empleado";
  }, [empleados, filtroSubjectId, filtroSubjectType, roles]);

  useEffect(() => {
    void cargarCatalogos();
  }, []);

  useEffect(() => {
    if (!filtroRuta || !filtroSubjectId) {
      setPermisos([]);
      return;
    }

    void cargarPermisos();
  }, [filtroRuta, filtroSubjectId, filtroSubjectType, filtroTipoElemento]);

  const cargarCatalogos = async () => {
    try {
      setCargandoCatalogos(true);
      setError("");
      setMensaje("");

      const [menuData, rolesData, empleadosData] = await Promise.allSettled([
        menuService.obtenerCompleto(),
        rolesService.listarRoles(),
        listarEmpleadosCta(),
      ]);

      if (menuData.status === "fulfilled") {
        setMenus(Array.isArray(menuData.value) ? menuData.value : []);
      }

      if (rolesData.status === "fulfilled") {
        setRoles(Array.isArray(rolesData.value) ? rolesData.value : []);
      }

      if (empleadosData.status === "fulfilled") {
        setEmpleados(Array.isArray(empleadosData.value) ? empleadosData.value : []);
      }

      if (
        menuData.status === "rejected" ||
        rolesData.status === "rejected" ||
        empleadosData.status === "rejected"
      ) {
        setError("No se pudieron cargar completamente los catalogos de seguridad.");
      }
    } catch (err: unknown) {
      console.error(err);
      setError(getHttpErrorMessage(err, "No se pudieron cargar los catalogos."));
    } finally {
      setCargandoCatalogos(false);
    }
  };

  const cargarPermisos = async () => {
    if (!filtroRuta || !filtroSubjectId) {
      return;
    }

    try {
      setCargandoLista(true);
      setError("");

      const permisosData = await seguridadPermisosAccionesService.listar({
        rutaPagina: filtroRuta,
        tipoElemento: filtroTipoElemento || undefined,
        ...(filtroSubjectType === "rol"
          ? { idRol: Number(filtroSubjectId) }
          : { idEmpleado: Number(filtroSubjectId) }),
      });

      setPermisos(Array.isArray(permisosData) ? permisosData : []);
    } catch (err: unknown) {
      console.error(err);
      setPermisos([]);
      setError(getHttpErrorMessage(err, "No se pudieron cargar los permisos."));
    } finally {
      setCargandoLista(false);
    }
  };

  const limpiarFormulario = () => {
    setForm({
      ...formInicial,
      rutaPagina: filtroRuta,
      subjectType: filtroSubjectType,
      subjectId: filtroSubjectId,
    });
  };

  const abrirNuevo = () => {
    if (!filtroRuta || !filtroSubjectId) {
      setError("Seleccione una pagina y un sujeto antes de crear un permiso.");
      return;
    }

    setModo("nuevo");
    setError("");
    setMensaje("");
    limpiarFormulario();
    setPanelAbierto(true);
  };

  const abrirEditar = (permiso: PermisoAccionDto) => {
    setModo("editar");
    setError("");
    setMensaje("");
    setForm({
      idPermisoAccion: permiso.idPermisoAccion,
      rutaPagina: permiso.rutaPagina,
      claveAccion: permiso.claveAccion,
      etiqueta: permiso.etiqueta ?? "",
      tipoElemento: (permiso.tipoElemento as TipoElementoPermiso) ?? "button",
      subjectType: permiso.idRol ? "rol" : "empleado",
      subjectId: permiso.idRol ? String(permiso.idRol) : String(permiso.idEmpleado ?? ""),
      puedeVer: Boolean(permiso.puedeVer),
      puedeEjecutar: Boolean(permiso.puedeEjecutar),
      esActivo: Boolean(permiso.esActivo),
    });
    setPanelAbierto(true);
  };

  const cerrarPanel = () => {
    setPanelAbierto(false);
    limpiarFormulario();
  };

  const validar = () => {
    const nextError: string[] = [];

    if (!form.rutaPagina.trim()) {
      nextError.push("La pagina es obligatoria.");
    }

    if (!form.claveAccion.trim()) {
      nextError.push("La clave de accion es obligatoria.");
    }

    if (!form.tipoElemento) {
      nextError.push("El tipo de elemento es obligatorio.");
    }

    if (!form.subjectId) {
      nextError.push(`Debe seleccionar un ${form.subjectType}.`);
    }

    if (nextError.length > 0) {
      setError(nextError.join(" "));
      setMensaje("");
      return false;
    }

    return true;
  };

  const guardar = async () => {
    if (!validar()) {
      return;
    }

    try {
      setGuardando(true);
      setError("");
      setMensaje("");

      const payload = {
        idPermisoAccion: form.idPermisoAccion,
        rutaPagina: form.rutaPagina.trim(),
        claveAccion: form.claveAccion.trim(),
        etiqueta: form.etiqueta.trim(),
        tipoElemento: form.tipoElemento,
        idRol: form.subjectType === "rol" ? Number(form.subjectId) : null,
        idEmpleado: form.subjectType === "empleado" ? Number(form.subjectId) : null,
        puedeVer: form.puedeVer,
        puedeEjecutar: form.puedeEjecutar,
        esActivo: form.esActivo,
        usuario: usuarioEjecucion,
      };

      if (form.idPermisoAccion) {
        await seguridadPermisosAccionesService.actualizar(form.idPermisoAccion, payload);
        setMensaje("Permiso actualizado correctamente.");
      } else {
        await seguridadPermisosAccionesService.guardar(payload);
        setMensaje("Permiso creado correctamente.");
      }

      setPanelAbierto(false);
      limpiarFormulario();
      await cargarPermisos();
    } catch (err: unknown) {
      console.error(err);
      setError(getHttpErrorMessage(err, "No se pudo guardar el permiso."));
    } finally {
      setGuardando(false);
    }
  };

  const confirmarEliminar = (idPermisoAccion: number) => {
    setIdEliminar(idPermisoAccion);
  };

  const eliminar = async () => {
    if (idEliminar == null) {
      return;
    }

    try {
      setGuardando(true);
      setError("");
      setMensaje("");
      await seguridadPermisosAccionesService.eliminar(idEliminar);
      setMensaje("Permiso eliminado correctamente.");
      setIdEliminar(null);
      await cargarPermisos();
    } catch (err: unknown) {
      console.error(err);
      setError(getHttpErrorMessage(err, "No se pudo eliminar el permiso."));
    } finally {
      setGuardando(false);
    }
  };

  const permisoEliminar = permisos.find((item) => item.idPermisoAccion === idEliminar);

  return (
    <AppPage title="Seguridad / Permisos de acciones">
      {cargandoCatalogos ? <AppStatusMessage tone="info">Cargando catalogos...</AppStatusMessage> : null}
      {cargandoLista ? <AppStatusMessage tone="info">Cargando permisos...</AppStatusMessage> : null}
      {mensaje ? <AppStatusMessage tone="success">{mensaje}</AppStatusMessage> : null}
      {error ? <AppStatusMessage tone="error">{error}</AppStatusMessage> : null}

      <AppCard
        title="Filtros y contexto"
        actions={
          <>
            <button type="button" style={styles.primaryButton} onClick={abrirNuevo}>
              Nuevo permiso
            </button>
            <button type="button" style={styles.secondaryButton} onClick={() => void cargarPermisos()}>
              Recargar
            </button>
          </>
        }
      >
        <ToolbarFiltro style={{ width: "100%", marginBottom: 12 }}>
          <SelectBase
            label="Pagina"
            value={filtroRuta}
            onChange={(event) => setFiltroRuta(event.target.value)}
            options={menuOptions}
            placeholder="Seleccione una pagina"
            style={{ flex: "1 1 320px" }}
          />

          <SelectBase
            label="Sujeto"
            value={filtroSubjectType}
            onChange={(event) => {
              const nextType = event.target.value as SubjectType;
              setFiltroSubjectType(nextType);
              setFiltroSubjectId("");
              setPermisos([]);
            }}
            options={[
              { value: "rol", label: "Rol" },
              { value: "empleado", label: "Empleado" },
            ]}
            placeholder="Seleccione"
            style={{ flex: "0 0 160px" }}
          />

          {filtroSubjectType === "rol" ? (
            <SelectBase
              label="Rol"
              value={filtroSubjectId}
              onChange={(event) => setFiltroSubjectId(event.target.value)}
              options={roleOptions}
              placeholder="Seleccione un rol"
              style={{ flex: "1 1 260px" }}
            />
          ) : (
            <SelectBase
              label="Empleado"
              value={filtroSubjectId}
              onChange={(event) => setFiltroSubjectId(event.target.value)}
              options={employeeOptions}
              placeholder="Seleccione un empleado"
              style={{ flex: "1 1 260px" }}
            />
          )}

          <SelectBase
            label="Tipo"
            value={filtroTipoElemento}
            onChange={(event) => setFiltroTipoElemento(event.target.value)}
            options={tipoElementoOptions}
            placeholder="Todos"
            style={{ flex: "0 0 170px" }}
          />

          <InputBase
            label="Buscar"
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            placeholder="Accion, etiqueta o pagina"
            style={{ flex: "1 1 280px" }}
          />
        </ToolbarFiltro>

        <div style={styles.summaryRow}>
          <div>
            <strong>Pagina:</strong> {filtroRuta ? getDisplayNameFromRuta(filtroRuta, menus) : "No seleccionada"}
          </div>
          <div>
            <strong>Sujeto:</strong> {sujetoActualLabel}
          </div>
          <div>
            <strong>Registros:</strong> {filteredPermisos.length}
          </div>
        </div>
      </AppCard>

      <AppCard title="Listado de permisos">
        {filtroRuta && filtroSubjectId ? (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Id</th>
                  <th style={styles.th}>Pagina</th>
                  <th style={styles.th}>Accion</th>
                  <th style={styles.th}>Etiqueta</th>
                  <th style={styles.th}>Tipo</th>
                  <th style={styles.th}>Sujeto</th>
                  <th style={styles.th}>Ver</th>
                  <th style={styles.th}>Ejecutar</th>
                  <th style={styles.th}>Activo</th>
                  <th style={styles.th}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredPermisos.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={styles.emptyCell}>
                      No se encontraron permisos para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredPermisos.map((permiso) => {
                    const sujeto = permiso.idRol
                      ? `Rol #${permiso.idRol}`
                      : permiso.idEmpleado
                        ? `Empleado #${permiso.idEmpleado}`
                        : "-";

                    return (
                      <tr key={permiso.idPermisoAccion}>
                        <td style={styles.td}>{permiso.idPermisoAccion}</td>
                        <td style={styles.tdBold}>{permiso.nombrePagina ?? permiso.rutaPagina}</td>
                        <td style={styles.td}>{permiso.claveAccion}</td>
                        <td style={styles.td}>{permiso.etiqueta ?? "-"}</td>
                        <td style={styles.td}>{permiso.tipoElemento}</td>
                        <td style={styles.td}>{sujeto}</td>
                        <td style={styles.tdCenter}>
                          <span style={permiso.puedeVer ? styles.badgeOk : styles.badgeNo}>
                            {permiso.puedeVer ? "Si" : "No"}
                          </span>
                        </td>
                        <td style={styles.tdCenter}>
                          <span style={permiso.puedeEjecutar ? styles.badgeOk : styles.badgeNo}>
                            {permiso.puedeEjecutar ? "Si" : "No"}
                          </span>
                        </td>
                        <td style={styles.tdCenter}>
                          <span style={permiso.esActivo ? styles.badgeOk : styles.badgeNo}>
                            {permiso.esActivo ? "Si" : "No"}
                          </span>
                        </td>
                        <td style={styles.tdActions}>
                          <button type="button" style={styles.actionButton} onClick={() => abrirEditar(permiso)}>
                            Editar
                          </button>
                          <button
                            type="button"
                            style={{ ...styles.actionButton, ...styles.actionButtonDanger }}
                            onClick={() => confirmarEliminar(permiso.idPermisoAccion)}
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={styles.emptyState}>
            Seleccione una pagina y un sujeto para consultar y administrar sus permisos.
          </div>
        )}
      </AppCard>

      {panelAbierto ? (
        <div style={styles.overlay}>
          <div style={styles.sidePanel}>
            <div style={styles.sideHeader}>
              <div>
                <h3 style={styles.sideTitle}>{modo === "nuevo" ? "Nuevo permiso" : "Editar permiso"}</h3>
                <p style={styles.sideSubtitle}>
                  Administre accesos por pagina, pestaña, boton o sistema.
                </p>
              </div>
              <button type="button" style={styles.closeButton} onClick={cerrarPanel}>
                ×
              </button>
            </div>

            <div style={styles.formGrid}>
              <SelectBase
                label="Pagina"
                value={form.rutaPagina}
                onChange={(event) => setForm((prev) => ({ ...prev, rutaPagina: event.target.value }))}
                options={menuOptions}
                placeholder="Seleccione una pagina"
              />

              <SelectBase
                label="Tipo sujeto"
                value={form.subjectType}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    subjectType: event.target.value as SubjectType,
                    subjectId: "",
                  }))
                }
                options={[
                  { value: "rol", label: "Rol" },
                  { value: "empleado", label: "Empleado" },
                ]}
              />

              {form.subjectType === "rol" ? (
                <SelectBase
                  label="Rol"
                  value={form.subjectId}
                  onChange={(event) => setForm((prev) => ({ ...prev, subjectId: event.target.value }))}
                  options={roleOptions}
                  placeholder="Seleccione un rol"
                />
              ) : (
                <SelectBase
                  label="Empleado"
                  value={form.subjectId}
                  onChange={(event) => setForm((prev) => ({ ...prev, subjectId: event.target.value }))}
                  options={employeeOptions}
                  placeholder="Seleccione un empleado"
                />
              )}

              <InputBase
                label="Clave de accion"
                value={form.claveAccion}
                onChange={(event) => setForm((prev) => ({ ...prev, claveAccion: event.target.value }))}
                placeholder="button.aprobar.ejecutar"
              />

              <InputBase
                label="Etiqueta"
                value={form.etiqueta}
                onChange={(event) => setForm((prev) => ({ ...prev, etiqueta: event.target.value }))}
                placeholder="Aprobar"
              />

              <SelectBase
                label="Tipo elemento"
                value={form.tipoElemento}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, tipoElemento: event.target.value as TipoElementoPermiso }))
                }
                options={tipoElementoOptions}
              />

              <div style={styles.checkboxGroup}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={form.puedeVer}
                    onChange={(event) => setForm((prev) => ({ ...prev, puedeVer: event.target.checked }))}
                  />
                  Puede ver
                </label>

                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={form.puedeEjecutar}
                    onChange={(event) => setForm((prev) => ({ ...prev, puedeEjecutar: event.target.checked }))}
                  />
                  Puede ejecutar
                </label>

                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={form.esActivo}
                    onChange={(event) => setForm((prev) => ({ ...prev, esActivo: event.target.checked }))}
                  />
                  Activo
                </label>
              </div>
            </div>

            <div style={styles.panelActions}>
              <button type="button" style={styles.secondaryButton} onClick={cerrarPanel} disabled={guardando}>
                Cancelar
              </button>
              <button type="button" style={styles.primaryButton} onClick={() => void guardar()} disabled={guardando}>
                {guardando ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={idEliminar != null}
        title="Eliminar permiso"
        message={
          permisoEliminar ? (
            <>
              <div>Confirma la eliminacion de este permiso:</div>
              <div style={{ marginTop: 8, fontWeight: 700 }}>
                {permisoEliminar.rutaPagina} / {permisoEliminar.claveAccion}
              </div>
            </>
          ) : (
            "Confirma la eliminacion del permiso seleccionado."
          )
        }
        confirmLabel={guardando ? "Eliminando..." : "Eliminar"}
        cancelLabel="Cancelar"
        onConfirm={() => void eliminar()}
        onCancel={() => setIdEliminar(null)}
        destructive
      />
    </AppPage>
  );
}

const styles: Record<string, React.CSSProperties> = {
  primaryButton: {
    minHeight: 40,
    padding: "0 14px",
    borderRadius: 10,
    border: "none",
    background: "#17143A",
    color: "#FFFFFF",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    minHeight: 40,
    padding: "0 14px",
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    fontWeight: 700,
    cursor: "pointer",
  },
  summaryRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 20,
    fontSize: 14,
    color: "#334155",
  },
  tableWrapper: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    textAlign: "left",
    padding: "10px 8px",
    borderBottom: "1px solid #E2E8F0",
    color: "#1E293B",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  td: {
    padding: "10px 8px",
    borderBottom: "1px solid #F1F5F9",
    verticalAlign: "top",
  },
  tdBold: {
    padding: "10px 8px",
    borderBottom: "1px solid #F1F5F9",
    verticalAlign: "top",
    fontWeight: 700,
  },
  tdCenter: {
    padding: "10px 8px",
    borderBottom: "1px solid #F1F5F9",
    verticalAlign: "top",
    textAlign: "center",
  },
  tdActions: {
    padding: "10px 8px",
    borderBottom: "1px solid #F1F5F9",
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  emptyCell: {
    padding: 18,
    textAlign: "center",
    color: "#64748B",
  },
  emptyState: {
    padding: 16,
    color: "#64748B",
  },
  badgeOk: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 42,
    padding: "4px 8px",
    borderRadius: 999,
    background: "#DCFCE7",
    color: "#166534",
    fontWeight: 700,
    fontSize: 12,
  },
  badgeNo: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 42,
    padding: "4px 8px",
    borderRadius: 999,
    background: "#FEE2E2",
    color: "#B91C1C",
    fontWeight: 700,
    fontSize: 12,
  },
  actionButton: {
    minHeight: 34,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    cursor: "pointer",
    fontWeight: 600,
  },
  actionButtonDanger: {
    borderColor: "#FCA5A5",
    color: "#B91C1C",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.35)",
    display: "flex",
    justifyContent: "flex-end",
    zIndex: 1300,
  },
  sidePanel: {
    width: 460,
    maxWidth: "100%",
    height: "100%",
    background: "#FFFFFF",
    boxShadow: "-8px 0 24px rgba(0,0,0,0.12)",
    padding: 24,
    boxSizing: "border-box",
    overflowY: "auto",
  },
  sideHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 20,
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
  formGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 14,
  },
  checkboxGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    border: "1px solid #E2E8F0",
    background: "#F8FAFC",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "#0F172A",
    fontWeight: 600,
  },
  panelActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 24,
  },
};
