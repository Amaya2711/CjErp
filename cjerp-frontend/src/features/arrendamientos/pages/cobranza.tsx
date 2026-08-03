import { listarPagosArrendamientos } from "../../../api/arrendamientosService";
import type { ArrendamientosFila } from "../../../models/arrendamientos";
import ArrendamientosListPage from "../components/ArrendamientosListPage";
import type { DataGridColumn } from "../../../components/base/DataGridBase";

const columns: DataGridColumn<ArrendamientosFila>[] = [
  { key: "codigo", header: "Gestion", render: (row) => row.codigo ?? "-" },
  { key: "fecha", header: "Fecha", render: (row) => row.fecha ?? "-" },
  { key: "arrendador", header: "Arrendador", render: (row) => row.arrendador ?? "-" },
  { key: "inquilino", header: "Inquilino", render: (row) => row.inquilino ?? "-" },
  { key: "estado", header: "Estado", render: (row) => row.estado ?? "-" },
  { key: "observacion", header: "Compromiso", render: (row) => row.observacion ?? "-" },
];

export default function ArrendamientosCobranzaPage() {
  return (
    <ArrendamientosListPage
      title="Gestion de cobranza"
      description="Registro de gestiones, compromisos y seguimiento."
      searchHint="gestion, arrendador, inquilino, estado"
      loadRows={listarPagosArrendamientos}
      columns={columns}
      emptyMessage="No existen gestiones de cobranza registradas."
    />
  );
}
