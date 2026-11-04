import { useCallback, useState } from "react";
import type { SolicitudCatalogo } from "../../../../../models/logisticaEquipos";
import { ingresoStyles as styles } from "../ingreso/ingresoComun";
import CampoBuscable, { type OpcionBuscable } from "./CampoBuscable";

export type DatosEntrega = {
  formaEnvio: number | null;
  razonSocial: number | null;
  ubigeo: string;
  direccion: string;
  referencia: string;
  entrega1: number | null;
  entrega2: number | null;
};

type EntregaDialogProps = {
  inicial: DatosEntrega;
  formasEnvio: SolicitudCatalogo[];
  opcionesEntrega: OpcionBuscable[];
  opcionesUbigeo: OpcionBuscable[];
  /** Motivo por el que se abrió (por ejemplo, un dato faltante al grabar). */
  error?: string;
  /** Advertencia de datos (por ejemplo, catálogo sin códigos). */
  aviso?: string;
  onAceptar: (datos: DatosEntrega) => void;
};

const estiloCampo = {
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  padding: "6px 9px",
  fontSize: 13,
  background: "#fff",
  width: "100%",
  boxSizing: "border-box" as const,
};
const estilo = {
  overlay: { position: "fixed" as const, inset: 0, background: "rgba(15, 23, 42, 0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 },
  dialog: { width: "100%", maxWidth: 720, maxHeight: "90vh", overflow: "auto", borderRadius: 16, background: "#fff", padding: 24, boxShadow: "0 12px 30px rgba(15,23,42,0.18)", display: "flex", flexDirection: "column" as const, gap: 14 },
  campos: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 },
};

const aNumero = (id: string | null) => (id === null ? null : Number(id));
const aTexto = (n: number | null) => (n === null ? null : String(n));

/**
 * Popup de datos de entrega. Mantiene su propio borrador: al digitar solo se vuelve a dibujar el popup (no la solicitud con
 * sus grillas, que era lo que hacía lenta la escritura) y los datos pasan a la solicitud al pulsar Aceptar.
 */
export default function EntregaDialog({ inicial, formasEnvio, opcionesEntrega, opcionesUbigeo, error, aviso, onAceptar }: EntregaDialogProps) {
  const [datos, setDatos] = useState<DatosEntrega>(inicial);
  const cambiar = useCallback((parcial: Partial<DatosEntrega>) => setDatos((actual) => ({ ...actual, ...parcial })), []);
  // Callbacks estables por campo (los CampoBuscable están memorizados).
  const alRazon = useCallback((id: string | null) => cambiar({ razonSocial: aNumero(id) }), [cambiar]);
  const alUbigeo = useCallback((id: string | null) => cambiar({ ubigeo: id ?? "" }), [cambiar]);
  const alEntrega1 = useCallback((id: string | null) => cambiar({ entrega1: aNumero(id) }), [cambiar]);
  const alEntrega2 = useCallback((id: string | null) => cambiar({ entrega2: aNumero(id) }), [cambiar]);

  return (
    <div style={estilo.overlay} role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Datos de entrega" style={estilo.dialog}>
        <h3 style={{ margin: 0, fontSize: 18, color: "#0F172A" }}>Datos de entrega</h3>
        {aviso ? <div role="alert" style={styles.error}>{aviso}</div> : null}
        {error ? <div role="alert" style={styles.error}>{error}</div> : null}
        <div style={estilo.campos}>
          <select value={datos.formaEnvio ?? ""} onChange={(e) => cambiar({ formaEnvio: e.target.value ? Number(e.target.value) : null })} style={estiloCampo}>
            <option value="">Medio de envío…</option>
            {formasEnvio.map((o) => (
              <option key={o.id} value={o.id}>{o.nombre}</option>
            ))}
          </select>
          <CampoBuscable
            opciones={opcionesEntrega}
            value={aTexto(datos.razonSocial)}
            onChange={alRazon}
            placeholder="Razón social…"
            style={estiloCampo}
          />
          <CampoBuscable
            opciones={opcionesUbigeo}
            value={datos.ubigeo || null}
            onChange={alUbigeo}
            placeholder="Ubigeo…"
            style={estiloCampo}
          />
          <input value={datos.direccion} onChange={(e) => cambiar({ direccion: e.target.value })} placeholder="Dirección de entrega" style={estiloCampo} />
          <input value={datos.referencia} onChange={(e) => cambiar({ referencia: e.target.value })} placeholder="Referencia" style={estiloCampo} />
          <CampoBuscable
            opciones={opcionesEntrega}
            value={aTexto(datos.entrega1)}
            onChange={alEntrega1}
            placeholder="Responsable de entrega 1…"
            style={estiloCampo}
          />
          <CampoBuscable
            opciones={opcionesEntrega}
            value={aTexto(datos.entrega2)}
            onChange={alEntrega2}
            placeholder="Responsable de entrega 2 (opcional)…"
            style={estiloCampo}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={() => onAceptar(datos)} style={styles.primary}>
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
