import EtapasPage, { type EtapaTab } from "./equipos/EtapasPage";

/** Página 2: solicitud (regularizaciones), aprobación, despacho, envío, excedentes, recojo y consultas. */
const ETAPAS: EtapaTab[] = [
  { key: "solicitud", label: "Solicitud" },
  { key: "aprobar", label: "x Aprobar" },
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
