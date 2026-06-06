import { RptWupModulePage } from "./rptwup";

export default function RptBoletaPage() {
  return (
    <RptWupModulePage
      tipo="boleta"
      pageTitle="Reporte de boletas WUP"
      eyebrow="Automatizacion boletas"
      heroTitle="Control del envio de boletas de planilla"
      tableTitle="Logs del periodo"
      tableSubtitle="Auditoria del envio de boletas PDF, omisiones, duplicados y respuestas del endpoint WUP."
      runtimeTitle="Ejecucion actual"
    />
  );
}
