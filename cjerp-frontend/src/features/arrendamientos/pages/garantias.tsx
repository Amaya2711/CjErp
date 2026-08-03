import { listarGarantiasArrendamientos } from "../../../api/arrendamientosService";
import type { ArrendamientosFila } from "../../../models/arrendamientos";
import ArrendamientosListPage from "../components/ArrendamientosListPage";
import type { DataGridColumn } from "../../../components/base/DataGridBase";

const columns: DataGridColumn<ArrendamientosFila>[] = [
  { key: "codigo", header: "Codigo", render: (row) => row.codigo ?? "-" },
  { key: "nombre", header: "Contrato", render: (row) => row.nombre ?? "-" },
  { key: "arrendador", header: "Arrendador", render: (row) => row.arrendador ?? "-" },
  { key: "inquilino", header: "Inquilino", render: (row) => row.inquilino ?? "-" },
  { key: "estado", header: "Estado", render: (row) => row.estado ?? "-" },
  {
    key: "importe",
    header: "Garantia",
    align: "right",
    render: (row) =>
      (row.importe ?? 0).toLocaleString("es-PE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
  },
  {
    key: "saldo",
    header: "Pendiente",
    align: "right",
    render: (row) =>
      (row.saldo ?? 0).toLocaleString("es-PE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
  },
  { key: "observacion", header: "Observacion", render: (row) => row.observacion ?? "-" },
];

export default function ArrendamientosGarantiasPage() {
  return (
    <ArrendamientosListPage
      title="Garantias"
      description="Control de garantias pactadas, pagadas y aplicadas."
      searchHint="codigo, contrato, inquilino, estado"
      loadRows={listarGarantiasArrendamientos}
      columns={columns}
      emptyMessage="No existen garantias registradas."
    />
  );
}
