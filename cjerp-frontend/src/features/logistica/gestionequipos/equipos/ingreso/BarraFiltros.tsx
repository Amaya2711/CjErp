import { ingresoStyles, type FiltrosIngreso, type OpcionCatalogo } from "./ingresoComun";

type BarraFiltrosProps = {
  filtros: FiltrosIngreso;
  onChange: (filtros: FiltrosIngreso) => void;
  ubicaciones: OpcionCatalogo[];
  mostrarUbicacion?: boolean;
  cargando: boolean;
  onBuscar: () => void;
  resumen?: string;
};

/** Filtros de búsqueda de las pestañas (pedido, solicitud, fecha de guía y almacén). */
export default function BarraFiltros({ filtros, onChange, ubicaciones, mostrarUbicacion = false, cargando, onBuscar, resumen }: BarraFiltrosProps) {
  const set = (parcial: Partial<FiltrosIngreso>) => onChange({ ...filtros, ...parcial });
  const alEnter = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") onBuscar();
  };

  return (
    <div style={ingresoStyles.toolbar}>
      <label style={ingresoStyles.check}>
        <input type="checkbox" checked={filtros.usaPedidos} onChange={(e) => set({ usaPedidos: e.target.checked })} />
        Pedido(s)
      </label>
      <input
        value={filtros.pedidos}
        disabled={!filtros.usaPedidos}
        placeholder="4400000001, 4400000002"
        onChange={(e) => set({ pedidos: e.target.value })}
        onKeyDown={alEnter}
        style={{ ...ingresoStyles.input, width: 210 }}
      />

      <label style={ingresoStyles.check}>
        <input type="checkbox" checked={filtros.usaSolicitudes} onChange={(e) => set({ usaSolicitudes: e.target.checked })} />
        Id. solicitud(es)
      </label>
      <input
        value={filtros.solicitudes}
        disabled={!filtros.usaSolicitudes}
        onChange={(e) => set({ solicitudes: e.target.value })}
        onKeyDown={alEnter}
        style={{ ...ingresoStyles.input, width: 170 }}
      />

      <label style={ingresoStyles.check}>
        <input type="checkbox" checked={filtros.usaFecha} onChange={(e) => set({ usaFecha: e.target.checked })} />
        Fec. guía
      </label>
      <input type="date" value={filtros.fechaIni} disabled={!filtros.usaFecha} onChange={(e) => set({ fechaIni: e.target.value })} style={ingresoStyles.input} />
      <input type="date" value={filtros.fechaFin} disabled={!filtros.usaFecha} onChange={(e) => set({ fechaFin: e.target.value })} style={ingresoStyles.input} />

      {mostrarUbicacion ? (
        <>
          <label style={ingresoStyles.check}>
            <input type="checkbox" checked={filtros.usaUbicacion} onChange={(e) => set({ usaUbicacion: e.target.checked })} />
            Almacén
          </label>
          <select
            value={filtros.idUbicacion ?? ""}
            disabled={!filtros.usaUbicacion}
            onChange={(e) => set({ idUbicacion: e.target.value === "" ? null : Number(e.target.value) })}
            style={ingresoStyles.input}
          >
            <option value="">Seleccione…</option>
            {ubicaciones.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </>
      ) : null}

      <button type="button" onClick={onBuscar} disabled={cargando} style={ingresoStyles.primary}>
        {cargando ? "Consultando…" : "Buscar"}
      </button>
      {resumen ? <span style={ingresoStyles.resumen}>{resumen}</span> : null}
    </div>
  );
}

