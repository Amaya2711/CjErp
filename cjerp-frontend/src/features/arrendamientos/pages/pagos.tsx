import { listarPagosArrendamientos } from "../../../api/arrendamientosService";
import type { ArrendamientosFila } from "../../../models/arrendamientos";
import ArrendamientosListPage from "../components/ArrendamientosListPage";
import type { DataGridColumn } from "../../../components/base/DataGridBase";

const columns: DataGridColumn<ArrendamientosFila>[] = [
  { key: "codigo", header: "Operacion", render: (row) => row.codigo ?? "-" },
  { key: "fecha", header: "Fecha", render: (row) => row.fecha ?? "-" },
  { key: "arrendador", header: "Arrendador", render: (row) => row.arrendador ?? "-" },
  { key: "inquilino", header: "Inquilino", render: (row) => row.inquilino ?? "-" },
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
  { key: "observacion", header: "Observacion", render: (row) => row.observacion ?? "-" },
];

export default function ArrendamientosPagosPage() {
  return (
    <ArrendamientosListPage
      title="Pagos"
      description="Registro y validacion de pagos con aplicacion por saldo y concepto."
      searchHint="operacion, arrendador, inquilino, estado, observacion"
      loadRows={listarPagosArrendamientos}
      columns={columns}
      emptyMessage="No existen pagos registrados."
    />
  );
}
