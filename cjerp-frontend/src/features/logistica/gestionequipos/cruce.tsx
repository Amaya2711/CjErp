import EtapasPage, { type EtapaTab } from "./equipos/EtapasPage";

/** Página 3: cruce, cierre y foliado. */
const ETAPAS: EtapaTab[] = [
  { key: "cruzar", label: "x Cruzar" },
  { key: "cerrar", label: "x Cerrar" },
  { key: "foliar", label: "x Foliar" },
];

export default function CruceSeriesPage() {
  return <EtapasPage title="Logística de equipos: cruce y cierre" etapas={ETAPAS} />;
}
