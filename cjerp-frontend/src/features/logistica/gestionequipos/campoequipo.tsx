import CampoTab from "./equipos/campo/CampoTab";
import EtapasPage, { type EtapaTab } from "./equipos/EtapasPage";

/** Página 4: confirmación en campo. */
export const ETAPAS: EtapaTab[] = [{ key: "campo", label: "x Campo", content: <CampoTab /> }];

export default function CampoEquipoPage() {
  return <EtapasPage title="Logística de equipos: campo" etapas={ETAPAS} />;
}
