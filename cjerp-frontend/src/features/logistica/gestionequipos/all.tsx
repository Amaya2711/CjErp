import { useState } from "react";
import EtapasPage, { type EtapaTab } from "./equipos/EtapasPage";
import CampoTab from "./equipos/campo/CampoTab";
import DashboardTab from "./equipos/dashboard/DashboardTab";
import { ETAPAS as ETAPAS_SOLICITUD } from "./solicitudequipo";

const enSolicitud = (...keys: string[]) => ETAPAS_SOLICITUD.filter((etapa) => keys.includes(etapa.key));

/**
 * Logística de equipos: Solicitud, x Campo, Historial, Dashboard y Observadas (Alerta no se muestra).
 * Solicitud e Historial se definen en solicitudequipo; las demás pestañas se arman aquí.
 * (La página base completa con todas las etapas es /logistica/gestionequipos/demo.)
 */
export default function GestionEquiposAllPage() {
  // Pestaña activa (vacía = la primera) y solicitud con la que se abre x Campo cuando se llega desde otra pestaña (p. ej. el Dashboard).
  const [tab, setTab] = useState<string | undefined>(undefined);
  const [solicitudCampo, setSolicitudCampo] = useState("");

  const abrirSolicitudEnCampo = (nroSolicitud: string) => {
    setSolicitudCampo(nroSolicitud);
    setTab("campo");
  };

  const etapas: EtapaTab[] = [
    ...enSolicitud("solicitud"),
    // x Campo: si se llegó desde el Dashboard, se abre con esa solicitud ya filtrada.
    { key: "campo", label: "x Campo", content: <CampoTab solicitudInicial={solicitudCampo} /> },
    ...enSolicitud("historial"),
    // Dashboard: resumen ejecutivo de lo registrado en Solicitud y x Campo; el Nro. de solicitud abre x Campo filtrado.
    { key: "dashboard", label: "Dashboard", content: <DashboardTab onAbrirSolicitud={abrirSolicitudEnCampo} /> },
    // Observadas: líneas en estado 10, con los mismos filtros y columnas de x Campo (solo consulta).
    { key: "observadas", label: "Observadas", content: <CampoTab modo="observadas" /> },
  ];

  return (
    <EtapasPage
      title="Logística de equipos"
      etapas={etapas}
      activeKey={tab}
      // Al elegir una pestaña a mano se descarta el filtro heredado: x Campo vuelve a abrirse con todo lo pendiente.
      onTabChange={(key) => {
        setSolicitudCampo("");
        setTab(key);
      }}
    />
  );
}
