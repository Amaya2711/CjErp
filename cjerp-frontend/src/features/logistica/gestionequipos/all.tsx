import EtapasPage, { type EtapaTab } from "./equipos/EtapasPage";
import { ETAPAS as ETAPAS_CAMPO } from "./campoequipo";
import { ETAPAS as ETAPAS_SOLICITUD } from "./solicitudequipo";

const enSolicitud = (...keys: string[]) => ETAPAS_SOLICITUD.filter((etapa) => keys.includes(etapa.key));

/**
 * Logística de equipos: Solicitud, x Campo, Reporte, Alerta, Dashboard y Observadas.
 * Las etapas se definen en solicitudequipo y campoequipo; las que aún no tienen contenido salen deshabilitadas.
 * (La página base completa con todas las etapas es /logistica/gestionequipos/demo.)
 */
const ETAPAS: EtapaTab[] = [
  ...enSolicitud("solicitud"),
  ...ETAPAS_CAMPO,
  ...enSolicitud("reporte", "alerta", "dashboard", "observadas"),
];

export default function GestionEquiposAllPage() {
  return <EtapasPage title="Logística de equipos" etapas={ETAPAS} />;
}
