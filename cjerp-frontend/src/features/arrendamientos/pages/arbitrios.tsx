import { listarArbitriosArrendamientos } from "../../../api/arrendamientosService";
import type { ArrendamientosFila } from "../../../models/arrendamientos";
import ArrendamientosListPage from "../components/ArrendamientosListPage";
import type { DataGridColumn } from "../../../components/base/DataGridBase";

const columns: DataGridColumn<ArrendamientosFila>[] = [
  { key: "codigo", header: "Codigo", render: (row) => row.codigo ?? "-" },
  { key: "nombre", header: "Contrato", render: (row) => row.nombre ?? "-" },
  { key: "inmueble", header: "Inmueble", render: (row) => row.inmueble ?? "-" },
  { key: "unidad", header: "Unidad", render: (row) => row.unidad ?? "-" },
  { key: "detalle", header: "Periodicidad", render: (row) => row.detalle ?? "-" },
  { key: "estado", header: "Estado", render: (row) => row.estado ?? "-" },
  { key: "moneda", header: "Moneda", render: (row) => row.moneda ?? "-" },
  {
    key: "importe",
    header: "Monto",
    align: "right",
    render: (row) =>
      (row.importe ?? 0).toLocaleString("es-PE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
  },
];

export default function ArrendamientosArbitriosPage() {
  return (
    <ArrendamientosListPage
      title="Arbitrios"
      description="Control de liquidaciones anuales y cobros periodicos."
      searchHint="codigo, contrato, inmueble, unidad, periodicidad"
      loadRows={listarArbitriosArrendamientos}
      columns={columns}
      emptyMessage="No existen arbitrios registrados."
    />
  );
}
