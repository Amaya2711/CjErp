import { useState } from "react";
import EtapasPage, { type EtapaTab } from "./equipos/EtapasPage";
import CampoTab from "./equipos/campo/CampoTab";
import DashboardCierreTab, { ESTADOS_ETAPA, type EtapaCierre } from "./equipos/dashboard/DashboardCierreTab";

// Estados que seleccionan las solicitudes de cada pestaña. Igual que ESTADOS_ETAPA, salvo x Foliar: el sistema antiguo
// usa (16, 22, 23, 25). El Dashboard sigue con ESTADOS_ETAPA, porque clasifica cada línea por su propio estado.
const ESTADOS_CONSULTA: Record<EtapaCierre, string> = { ...ESTADOS_ETAPA, foliar: "16,22,23,25" };

/**
 * Página "Cierre" de Logística de equipos: x Cruzar (estado 14), x Cerrar (21, 7, 22, 23, 24, 25) y x Foliar (16),
 * más Reporte (todas las solicitudes, sin importar el estado, según los filtros) y Dashboard (resumen de las tres etapas).
 * Por ahora las tres etapas son de CONSULTA (las operaciones de cruzar, cerrar y foliar aún no están migradas):
 * POST /logistica/equipos/campo/consultar con `estados` → sp_Logistica_Campo_Consultar (script 20).
 * El Nro. de solicitud del Dashboard abre la pestaña de su etapa filtrada por esa solicitud.
 */
export default function CierreEquipoPage() {
  // Pestaña activa (vacía = la primera) y solicitud con la que se abre la etapa cuando se llega desde el Dashboard.
  const [tab, setTab] = useState<string | undefined>(undefined);
  const [solicitud, setSolicitud] = useState("");

  const abrirSolicitud = (nroSolicitud: string, etapa: EtapaCierre) => {
    setSolicitud(nroSolicitud);
    setTab(etapa);
  };

  const etapa = (key: EtapaCierre, label: string): EtapaTab => ({
    key,
    label,
    // key con la solicitud: si se llega con otra, la etapa se vuelve a montar con ese filtro.
    content: (
      <CampoTab
        key={`${key}-${solicitud}`}
        // Como el sistema antiguo (CargarCruce / CargarCierre / CargarFolio): todas las líneas de las solicitudes con alguna línea en esos estados.
        estados={ESTADOS_CONSULTA[key]}
        porSolicitud
        soloEquipos={key === "foliar"}
        etapa={label}
        solicitudInicial={solicitud}
      />
    ),
  });

  const etapas: EtapaTab[] = [
    etapa("cruzar", "x Cruzar"),
    etapa("cerrar", "x Cerrar"),
    etapa("foliar", "x Foliar"),
    { key: "reporte", label: "Reporte", content: <CampoTab modo="reporte" /> },
    { key: "dashboard", label: "Dashboard", content: <DashboardCierreTab onAbrirSolicitud={abrirSolicitud} /> },
  ];

  return (
    <EtapasPage
      title="Logística de equipos: cierre"
      etapas={etapas}
      activeKey={tab}
      // Al elegir una pestaña a mano se descarta la solicitud heredada.
      onTabChange={(key) => {
        setSolicitud("");
        setTab(key);
      }}
    />
  );
}
