import EtapasPage, { type EtapaTab } from "./equipos/EtapasPage";
import EstadoTab from "./equipos/ingreso/EstadoTab";
import PedidoTab from "./equipos/ingreso/PedidoTab";
import SeriesTab from "./equipos/ingreso/SeriesTab";
import { recepcionarEquipos, validarEquipos } from "../../../api/logisticaEquiposService";

/** Página 1 de logística de equipos: ingreso (pedido, recepción, series y validación). Equivale a FrmLogistic_v1. */
const ETAPAS: EtapaTab[] = [
  { key: "pedido", label: "Pedido", content: <PedidoTab /> },
  {
    key: "recepcionar",
    label: "x Recepcionar",
    content: (
      <EstadoTab
        etapa="RECEPCION"
        estadosDestino={[1, 4, 6, 8]}
        estadoDefecto={1}
        etiquetaEstadoActual="Est. recepción"
        verbo="recepcionar"
        mostrarFiltros={false}
        grabar={recepcionarEquipos}
      />
    ),
  },
  { key: "series", label: "Series", content: <SeriesTab /> },
  {
    key: "validar",
    label: "x Validar",
    content: (
      <EstadoTab
        etapa="VALIDACION"
        estadosDestino={[2, 4, 6, 8]}
        estadoDefecto={2}
        etiquetaEstadoActual="Est. validación"
        verbo="validar"
        grabar={validarEquipos}
        conZonaAlmacen
      />
    ),
  },
];

export default function IngresoEquipoPage() {
  return <EtapasPage title="Logística de equipos: ingreso" etapas={ETAPAS} />;
}
