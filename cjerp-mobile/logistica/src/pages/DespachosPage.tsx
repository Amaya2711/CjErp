import { useCallback, useEffect, useMemo, useState } from "react";
import { getErrorMessage, useSession } from "@cjerp/shared";
import { consultarDespachos, type DespachoLinea, type OrigenDespacho } from "../api/despachosApi";
import LineaDespacho from "./LineaDespacho";

type Grupo = { clave: string; nroSolicitud: string; site: string; proyecto: string; esNuevo: boolean; lineas: DespachoLinea[] };

export default function DespachosPage() {
  const { user, logout } = useSession();
  const [lineas, setLineas] = useState<DespachoLinea[]>([]);
  const [filtro, setFiltro] = useState("");
  const [origen, setOrigen] = useState<OrigenDespacho>("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);

  const cargar = useCallback(async (solicitudes?: string, origenSel: OrigenDespacho = "") => {
    setCargando(true);
    setError("");
    try {
      setLineas(await consultarDespachos(solicitudes, origenSel));
    } catch (e) {
      // 403 = el rol no tiene el menú MOB_LOG_DESPACHOS: el backend manda el mensaje.
      setError(getErrorMessage(e));
      setLineas([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar(undefined, "");
  }, [cargar]);

  const grupos = useMemo<Grupo[]>(() => {
    const mapa = new Map<string, Grupo>();
    for (const l of lineas) {
      const g =
        mapa.get(l.nroSolicitud) ??
        { clave: l.nroSolicitud, nroSolicitud: l.nroSolicitud, site: `${l.idSite ?? ""} ${l.nombreSite ?? ""}`.trim(), proyecto: l.nombreProyecto ?? "", esNuevo: l.esSistemaNuevo, lineas: [] };
      g.lineas.push(l);
      mapa.set(l.nroSolicitud, g);
    }
    return [...mapa.values()];
  }, [lineas]);

  return (
    <main className="lista">
      <header className="barra">
        <div>
          <h1>Por despachar</h1>
          <small>{user?.nombreEmpleado || user?.idUsuario}</small>
        </div>
        <button type="button" className="sec" onClick={() => void logout()}>
          Salir
        </button>
      </header>

      <form
        className="buscar"
        onSubmit={(e) => {
          e.preventDefault();
          void cargar(filtro, origen);
        }}
      >
        <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="N.º de solicitud (varios con coma)" inputMode="numeric" />
        <button type="submit">Buscar</button>
      </form>
      <select
        aria-label="Origen de la solicitud"
        value={origen}
        onChange={(e) => {
          const v = e.target.value as OrigenDespacho;
          setOrigen(v);
          void cargar(filtro, v);
        }}
      >
        <option value="">Todas (nuevo y antiguo)</option>
        <option value="NUEVO">Solo sistema nuevo</option>
        <option value="ANTIGUO">Solo sistema antiguo (lectura)</option>
      </select>

      {aviso && <p className="ok" role="status">{aviso}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {cargando && <p>Cargando…</p>}
      {!cargando && !error && grupos.length === 0 && <p>No hay despachos pendientes.</p>}

      {grupos.map((g) => (
        <section key={g.clave} className="card-grupo">
          <button type="button" className="grupo-cab" onClick={() => setAbierta(abierta === g.clave ? null : g.clave)}>
            <span>
              <strong>Solicitud {g.nroSolicitud}</strong>
              <small>{g.site}{g.proyecto ? ` · ${g.proyecto}` : ""}</small>
            </span>
            <span className="chip">{g.esNuevo ? "Nuevo" : "Antiguo · lectura"} · {g.lineas.length} {g.lineas.length === 1 ? "línea" : "líneas"}</span>
          </button>
          {abierta === g.clave &&
            g.lineas.map((l) => (
              <LineaDespacho
                key={`${l.nroSolicitud}-${l.posicion}`}
                linea={l}
                onListo={(mensaje) => {
                  setAviso(mensaje);
                  void cargar(filtro, origen);
                }}
              />
            ))}
        </section>
      ))}
    </main>
  );
}
