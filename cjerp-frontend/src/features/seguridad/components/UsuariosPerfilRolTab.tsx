import { useCallback, useEffect, useMemo, useState } from "react";
import AppCard from "../../../components/base/AppCard";
import AppStatusMessage from "../../../components/base/AppStatusMessage";
import DataGridPro from "../../../components/datagrid/DataGridPro";
import type { GridColumn } from "../../../components/datagrid/types";
import { menuService, type UsuarioPerfilRolDto } from "../services/menuService";
import { perfilesService, type PerfilDto } from "../services/perfilesService";
import { rolesService, type RolDto } from "../services/rolesService";
import { usuariosService } from "../services/usuariosService";
import { getHttpErrorMessage } from "../../../utils/httpError";

type FilaUsuario = {
  clave: string;
  idUsuario: string;
  nombreEmpleado: string;
  idPerfil: number | null;
  nombrePerfil: string;
  idRol: number | null;
  nombreRol: string;
};

type Edicion = {
  clave: string;
  idPerfil: number | "";
  idRol: number | "";
};

const selectStyle: React.CSSProperties = {
  minHeight: 30,
  borderRadius: 8,
  border: "1px solid #CBD5E1",
  padding: "2px 6px",
  fontSize: 13,
  background: "#FFFFFF",
  color: "#0F172A",
  maxWidth: "100%",
};

const btnStyle: React.CSSProperties = {
  minHeight: 30,
  borderRadius: 8,
  border: "1px solid #CBD5E1",
  background: "#F8FAFC",
  color: "#334155",
  fontWeight: 700,
  padding: "0 10px",
  cursor: "pointer",
};

const btnPrimaryStyle: React.CSSProperties = {
  ...btnStyle,
  border: "none",
  background: "#17143A",
  color: "#FFFFFF",
};

export default function UsuariosPerfilRolTab() {
  const [filas, setFilas] = useState<FilaUsuario[]>([]);
  const [perfiles, setPerfiles] = useState<PerfilDto[]>([]);
  const [todosRoles, setTodosRoles] = useState<RolDto[]>([]);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const [usuarios, relaciones, perfilesData, rolesData] = await Promise.all([
        usuariosService.listarUsuarios(),
        menuService.listarUsuariosPerfilRol(),
        perfilesService.listarPerfiles(),
        rolesService.listarRoles(),
      ]);
      setTodosRoles(rolesData.filter((r) => r.esActivo !== false && r.estado !== false));

      const porUsuario = new Map<string, UsuarioPerfilRolDto[]>();
      relaciones.forEach((rel) => {
        const clave = rel.idUsuario.trim().toLowerCase();
        porUsuario.set(clave, [...(porUsuario.get(clave) ?? []), rel]);
      });

      // sp_UsuarioListar puede devolver el mismo usuario más de una vez.
      const usuariosUnicos = new Map(usuarios.map((u) => [u.idUsuario.trim().toLowerCase(), u]));

      const resultado: FilaUsuario[] = [];
      usuariosUnicos.forEach((usuario) => {
        const rels = porUsuario.get(usuario.idUsuario.trim().toLowerCase()) ?? [];
        if (rels.length === 0) {
          resultado.push({
            clave: `${usuario.idUsuario}|0|0`,
            idUsuario: usuario.idUsuario,
            nombreEmpleado: usuario.nombreEmpleado,
            idPerfil: null,
            nombrePerfil: "(Sin perfil)",
            idRol: null,
            nombreRol: "(Sin rol)",
          });
          return;
        }
        rels.forEach((rel) =>
          resultado.push({
            clave: `${usuario.idUsuario}|${rel.idPerfil}|${rel.idRol}`,
            idUsuario: usuario.idUsuario,
            nombreEmpleado: usuario.nombreEmpleado,
            idPerfil: rel.idPerfil,
            nombrePerfil: rel.nombrePerfil,
            idRol: rel.idRol,
            nombreRol: rel.nombreRol,
          })
        );
      });

      setFilas(resultado);
      setPerfiles(perfilesData);
    } catch (err: unknown) {
      setError(getHttpErrorMessage(err, "No se pudo cargar la lista de usuarios."));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const iniciarEdicion = (fila: FilaUsuario) => {
    setMensaje("");
    setError("");
    setEdicion({ clave: fila.clave, idPerfil: fila.idPerfil ?? "", idRol: fila.idRol ?? "" });
  };

  const cambiarPerfil = (valor: string) => {
    const idPerfil = valor ? Number(valor) : "";
    setEdicion((prev) => (prev ? { ...prev, idPerfil } : prev));
  };

  const guardar = async (fila: FilaUsuario) => {
    if (!edicion || edicion.idPerfil === "" || edicion.idRol === "") {
      setError("Debe seleccionar perfil y rol.");
      return;
    }

    setGuardando(true);
    setError("");
    setMensaje("");
    try {
      if (fila.idPerfil && fila.idRol) {
        await menuService.cambiarUsuarioPerfilRol({
          idUsuario: fila.idUsuario,
          idPerfilAnterior: fila.idPerfil,
          idRolAnterior: fila.idRol,
          idPerfil: edicion.idPerfil,
          idRol: edicion.idRol,
        });
      } else {
        await menuService.guardarUsuarioPerfilRol({
          idUsuario: fila.idUsuario,
          idPerfil: edicion.idPerfil,
          idRol: edicion.idRol,
        });
      }
      setEdicion(null);
      setMensaje(`Perfil y rol de ${fila.idUsuario} actualizados correctamente.`);
      await cargar();
    } catch (err: unknown) {
      setError(getHttpErrorMessage(err, "No se pudo actualizar el perfil y rol del usuario."));
    } finally {
      setGuardando(false);
    }
  };

  const columnas = useMemo<GridColumn<FilaUsuario>[]>(
    () => [
      { dataField: "idUsuario", caption: "Usuario", width: 160 },
      { dataField: "nombreEmpleado", caption: "Empleado", minWidth: 240 },
      {
        dataField: "nombrePerfil",
        caption: "Perfil",
        minWidth: 200,
        cellRender: (_value, fila) =>
          edicion?.clave === fila.clave ? (
            <select
              value={edicion.idPerfil}
              onChange={(e) => cambiarPerfil(e.target.value)}
              style={selectStyle}
              disabled={guardando}
            >
              <option value="">Seleccione</option>
              {perfiles.map((perfil) => (
                <option key={perfil.idPerfil} value={perfil.idPerfil}>
                  {perfil.nombrePerfil}
                </option>
              ))}
            </select>
          ) : (
            fila.nombrePerfil
          ),
      },
      {
        dataField: "nombreRol",
        caption: "Rol",
        minWidth: 200,
        cellRender: (_value, fila) =>
          edicion?.clave === fila.clave ? (
            <select
              value={edicion.idRol}
              onChange={(e) =>
                setEdicion((prev) =>
                  prev ? { ...prev, idRol: e.target.value ? Number(e.target.value) : "" } : prev
                )
              }
              style={selectStyle}
              disabled={guardando}
            >
              <option value="">Seleccione</option>
              {todosRoles.map((rol) => (
                <option key={rol.idRol} value={rol.idRol}>
                  {rol.nombreRol}
                </option>
              ))}
            </select>
          ) : (
            fila.nombreRol
          ),
      },
      {
        dataField: "clave",
        caption: "Acciones",
        width: 170,
        allowFiltering: false,
        allowSorting: false,
        allowGrouping: false,
        allowHeaderFilter: false,
        allowSearch: false,
        cellRender: (_value, fila) =>
          edicion?.clave === fila.clave ? (
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" style={btnPrimaryStyle} disabled={guardando} onClick={() => void guardar(fila)}>
                {guardando ? "Guardando..." : "Guardar"}
              </button>
              <button type="button" style={btnStyle} disabled={guardando} onClick={() => setEdicion(null)}>
                Cancelar
              </button>
            </div>
          ) : (
            <button type="button" style={btnStyle} disabled={guardando} onClick={() => iniciarEdicion(fila)}>
              Modificar
            </button>
          ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edicion, perfiles, todosRoles, guardando]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 }}>
      {cargando ? <AppStatusMessage tone="info">Cargando usuarios...</AppStatusMessage> : null}
      {mensaje ? <AppStatusMessage tone="success">{mensaje}</AppStatusMessage> : null}
      {error ? <AppStatusMessage tone="error">{error}</AppStatusMessage> : null}

      <AppCard>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <strong style={{ color: "#1E293B" }}>Usuarios registrados: {filas.length}</strong>
          <button type="button" style={btnStyle} onClick={() => void cargar()} disabled={cargando || guardando}>
            Recargar
          </button>
        </div>
        <DataGridPro<FilaUsuario>
          dataSource={filas}
          columns={columnas}
          keyExpr="clave"
          height="65vh"
          loading={cargando}
          noDataText="No hay usuarios para mostrar."
          stateStoringKey="seguridad-usuarios-perfil-rol"
          showSearchPanel
          allowExport={false}
          autoExpandAll={false}
          rowAlternation={false}
          rowPadding="4px 8px"
          paging={{ pageSize: 50, pageSizes: [20, 50, 100, 250] }}
        />
      </AppCard>
    </div>
  );
}
