import EtapasPage, { type EtapaTab } from "./equipos/EtapasPage";
import CampoTab from "./equipos/campo/CampoTab";
import EstadoTab from "./equipos/ingreso/EstadoTab";
import PedidoTab from "./equipos/ingreso/PedidoTab";
import SeriesTab from "./equipos/ingreso/SeriesTab";
import PorAprobarTab from "./equipos/solicitud/PorAprobarTab";
import SolicitudTab from "./equipos/solicitud/SolicitudTab";
import { recepcionarEquipos, validarEquipos } from "../../../api/logisticaEquiposService";

/**
 * PÁGINA BASE de logística de equipos (copia autocontenida de /logistica/gestionequipos/all).
 * Úsela como plantilla para nuevas páginas del módulo.
 *
 * Cómo agregar una etapa:
 *  1. Crear el SP en CjERP.Backend/Database/Logistica/NN_*.sql (todo acceso a datos va por stored procedure).
 *  2. Exponerlo en LogisticaEquiposController -> ILogisticaEquiposService -> LogisticaEquiposService.
 *  3. Agregar la función en src/api/logisticaEquiposService.ts y los tipos en src/models/logisticaEquipos.ts.
 *  4. Crear la pestaña en equipos/<grupo>/<Etapa>Tab.tsx con DataGridPro (patrón: equipos/campo/CampoTab.tsx).
 *  5. Reemplazar aquí la entrada sin `content` por `content: <EtapaTab />`.
 * Una entrada sin `content` se muestra deshabilitada ("Etapa pendiente de construir").
 */
const ETAPAS: EtapaTab[] = [
  // --- Ingreso ---
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

  // --- Solicitud y despacho ---
  { key: "solicitud", label: "Solicitud", content: <SolicitudTab /> },
  { key: "aprobar", label: "x Aprobar", content: <PorAprobarTab /> },
  { key: "despachar", label: "x Despachar" },
  { key: "enviar", label: "x Enviar" },

  // --- Campo y cierre ---
  { key: "campo", label: "x Campo", content: <CampoTab /> },
  { key: "cruzar", label: "x Cruzar" },
  { key: "cerrar", label: "x Cerrar" },

  // --- Excedentes, folio y consultas ---
  { key: "excedente", label: "Excedente" },
  { key: "recoger", label: "x Recoger" },
  { key: "foliar", label: "x Foliar" },
  { key: "reporte", label: "Reporte" },
  { key: "alerta", label: "Alerta" },
  { key: "dashboard", label: "Dashboard" },
  { key: "observadas", label: "Observadas" },
];

export default function GestionEquiposDemoPage() {
  return <EtapasPage title="Logística de equipos (base)" etapas={ETAPAS} />;
}
