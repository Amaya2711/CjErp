import { useState } from "react";
import EtapasPage, { type EtapaTab } from "./equipos/EtapasPage";
import CampoTab from "./equipos/campo/CampoTab";
import DashboardAprobarTab from "./equipos/dashboard/DashboardAprobarTab";
import PorAprobarTab from "./equipos/solicitud/PorAprobarTab";

/**
 * Página "Aprobar" de Logística de equipos: solicitudes pendientes de aprobación (estado 9); se aprueban (con validador y
 * envío del PDF por correo) o rechazan (con motivo) en lote. Además incluye Reporte (todas las solicitudes, sin importar el estado,
 * según los filtros) y Dashboard (resumen ejecutivo de lo pendiente de aprobar; el Nro. de solicitud abre su detalle en x Aprobar).
 * x Aprobar reutiliza PorAprobarTab: POST /logistica/equipos/solicitud/por-aprobar, /solicitud/aprobar y /solicitud/rechazar.
 */
export default function AprobarEquipoPage() {
  // Pestaña activa (vacía = la primera) y solicitud cuyo detalle se muestra al llegar a x Aprobar desde el Dashboard.
  const [tab, setTab] = useState<string | undefined>(undefined);
  const [solicitudDetalle, setSolicitudDetalle] = useState("");

  const abrirDetalle = (nroSolicitud: string) => {
    setSolicitudDetalle(nroSolicitud);
    setTab("aprobar");
  };

  const etapas: EtapaTab[] = [
    // key con la solicitud: si se llega con otra, x Aprobar se vuelve a montar y carga su detalle.
    { key: "aprobar", label: "x Aprobar", content: <PorAprobarTab key={solicitudDetalle} solicitudInicial={solicitudDetalle} /> },
    { key: "reporte", label: "Reporte", content: <CampoTab modo="reporte" /> },
    { key: "dashboard", label: "Dashboard", content: <DashboardAprobarTab onAbrirSolicitud={abrirDetalle} /> },
  ];

  return (
    <EtapasPage
      title="Logística de equipos: aprobar"
      etapas={etapas}
      activeKey={tab}
      // Al elegir una pestaña a mano se descarta la solicitud heredada.
      onTabChange={(key) => {
        setSolicitudDetalle("");
        setTab(key);
      }}
    />
  );
}
