import EtapasPage, { type EtapaTab } from "./equipos/EtapasPage";

/** Página 4: confirmación en campo. */
const ETAPAS: EtapaTab[] = [{ key: "campo", label: "x Campo" }];

export default function CampoEquipoPage() {
  return <EtapasPage title="Logística de equipos: campo" etapas={ETAPAS} />;
}
