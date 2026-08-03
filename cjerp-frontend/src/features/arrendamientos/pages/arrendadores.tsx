import { listarArrendadoresArrendamientos } from "../../../api/arrendamientosService";
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

export default function ArrendamientosArrendadoresPage() {
  return (
    <ArrendamientosListPage
      title="Arrendadores"
      description="Consulta y mantenimiento de la maestra de arrendadores."
      searchHint="codigo, razon social, detalle, estado"
      loadRows={listarArrendadoresArrendamientos}
      columns={columns}
      emptyMessage="No existen arrendadores registrados."
    />
  );
}
