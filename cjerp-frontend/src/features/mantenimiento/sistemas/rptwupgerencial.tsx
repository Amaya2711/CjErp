import { RptWupModulePage } from "./rptwup";

export default function RptWupGerencialPage() {
  return (
    <RptWupModulePage
      tipo="gerencial"
      pageTitle="Reportes gerenciales WUP"
      eyebrow="Automatización WUP gerencial"
      heroTitle="Control gerencial del envío de reportes"
      tableTitle="Logs del período gerencial"
      tableSubtitle="Auditoría gerencial de envío, reintentos y respuestas del endpoint WUP con log independiente."
      runtimeTitle="Ejecución gerencial actual"
    />
  );
}
