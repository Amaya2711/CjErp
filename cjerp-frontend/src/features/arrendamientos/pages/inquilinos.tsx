import { listarInquilinosArrendamientos } from "../../../api/arrendamientosService";
import type { ArrendamientosFila } from "../../../models/arrendamientos";
import ArrendamientosListPage from "../components/ArrendamientosListPage";
import type { DataGridColumn } from "../../../components/base/DataGridBase";

const columns: DataGridColumn<ArrendamientosFila>[] = [
  { key: "codigo", header: "Codigo", render: (row) => row.codigo ?? "-" },
  { key: "nombre", header: "Razon social", render: (row) => row.nombre ?? "-" },
  { key: "detalle", header: "Detalle", render: (row) => row.detalle ?? "-" },
  { key: "estado", header: "Estado", render: (row) => row.estado ?? "-" },
  { key: "responsable", header: "Responsable", render: (row) => row.responsable ?? "-" },
  { key: "observacion", header: "Observacion", render: (row) => row.observacion ?? "-" },
];

export default function ArrendamientosInquilinosPage() {
  return (
    <ArrendamientosListPage
      title="Inquilinos"
      description="Consulta y mantenimiento de la maestra de inquilinos."
      searchHint="codigo, razon social, detalle, estado"
      loadRows={listarInquilinosArrendamientos}
      columns={columns}
      emptyMessage="No existen inquilinos registrados."
    />
  );
}
