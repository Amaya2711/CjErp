import EtapasPage, { type EtapaTab } from "./equipos/EtapasPage";
import PorAprobarTab from "./equipos/solicitud/PorAprobarTab";
import SolicitudTab from "./equipos/solicitud/SolicitudTab";

/** Página 2: solicitud (regularizaciones), aprobación, despacho, envío, excedentes, recojo y consultas. */
export const ETAPAS: EtapaTab[] = [
  { key: "solicitud", label: "Solicitud", content: <SolicitudTab /> },
  { key: "aprobar", label: "x Aprobar", content: <PorAprobarTab /> },
  { key: "despachar", label: "x Despachar" },
  { key: "enviar", label: "x Enviar" },
  { key: "excedente", label: "Excedente" },
  { key: "recoger", label: "x Recoger" },
  { key: "reporte", label: "Reporte" },
  { key: "alerta", label: "Alerta" },
  { key: "dashboard", label: "Dashboard" },
  { key: "observadas", label: "Observadas" },
];

export default function SolicitudEquipoPage() {
  return <EtapasPage title="Logística de equipos: solicitud y despacho" etapas={ETAPAS} />;
}
