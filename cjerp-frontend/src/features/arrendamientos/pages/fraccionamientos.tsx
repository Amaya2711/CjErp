import { listarFraccionamientosArrendamientos } from "../../../api/arrendamientosService";
import type { ArrendamientosFila } from "../../../models/arrendamientos";
import ArrendamientosListPage from "../components/ArrendamientosListPage";
import type { DataGridColumn } from "../../../components/base/DataGridBase";

const columns: DataGridColumn<ArrendamientosFila>[] = [
  { key: "codigo", header: "Numero", render: (row) => row.codigo ?? "-" },
  { key: "nombre", header: "Contrato", render: (row) => row.nombre ?? "-" },
  { key: "arrendador", header: "Arrendador", render: (row) => row.arrendador ?? "-" },
  { key: "inquilino", header: "Inquilino", render: (row) => row.inquilino ?? "-" },
  { key: "detalle", header: "Cuotas", render: (row) => row.detalle ?? "-" },
  { key: "estado", header: "Estado", render: (row) => row.estado ?? "-" },
  { key: "moneda", header: "Moneda", render: (row) => row.moneda ?? "-" },
  {
    key: "importe",
    header: "Importe",
    align: "right",
    render: (row) =>
      (row.importe ?? 0).toLocaleString("es-PE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
  },
];

export default function ArrendamientosFraccionamientosPage() {
  return (
    <ArrendamientosListPage
      title="Fraccionamientos"
      description="Refinanciaciones y cuotas generadas por deuda fraccionada."
      searchHint="numero, contrato, inquilino, estado"
      loadRows={listarFraccionamientosArrendamientos}
      columns={columns}
      emptyMessage="No existen fraccionamientos registrados."
    />
  );
}
