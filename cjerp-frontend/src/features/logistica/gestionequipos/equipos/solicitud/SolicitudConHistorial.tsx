import { useContext, useState } from "react";
import { AccionesPaginaContext } from "../accionesPagina";
import { estiloPestanas } from "../ingreso/ingresoComun";
import HistorialTab from "./HistorialTab";
import SolicitudTab from "./SolicitudTab";

type Sub = "registro" | "historial";

/**
 * Pestaña "Solicitud": subpestañas Registro (el pedido único) e Historial (solicitudes registradas).
 * Registro queda montado al cambiar de subpestaña para no perder lo elegido sin grabar; Historial se monta al abrirla.
 * Los botones de acción del encabezado (Vista previa / Grabar) solo se publican mientras Registro está visible.
 */
export default function SolicitudConHistorial() {
  const slotAcciones = useContext(AccionesPaginaContext);
  const [sub, setSub] = useState<Sub>("registro");
  const [historialAbierto, setHistorialAbierto] = useState(false);

  const abrir = (destino: Sub) => {
    if (destino === "historial") setHistorialAbierto(true);
    setSub(destino);
  };

  const pestana = (clave: Sub, etiqueta: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={sub === clave}
      onClick={() => abrir(clave)}
      style={{ ...estiloPestanas.tab, ...(sub === clave ? estiloPestanas.tabActive : null), padding: "6px 14px" }}
    >
      {etiqueta}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, gap: 8 }}>
      <div role="tablist" aria-label="Solicitud" style={estiloPestanas.tabs}>
        {pestana("registro", "Registro")}
        {pestana("historial", "Historial")}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: sub === "registro" ? "flex" : "none", flexDirection: "column" }}>
        <AccionesPaginaContext.Provider value={sub === "registro" ? slotAcciones : null}>
          <SolicitudTab />
        </AccionesPaginaContext.Provider>
      </div>
      {historialAbierto ? (
        <div style={{ flex: 1, minHeight: 0, display: sub === "historial" ? "flex" : "none", flexDirection: "column" }}>
          <HistorialTab />
        </div>
      ) : null}
    </div>
  );
}
