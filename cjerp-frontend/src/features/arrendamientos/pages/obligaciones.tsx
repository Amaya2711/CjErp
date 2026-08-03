import { listarObligacionesArrendamientos } from "../../../api/arrendamientosService";
import type { ArrendamientosFila } from "../../../models/arrendamientos";
import ArrendamientosListPage from "../components/ArrendamientosListPage";
import type { DataGridColumn } from "../../../components/base/DataGridBase";

const columns: DataGridColumn<ArrendamientosFila>[] = [
  { key: "codigo", header: "Codigo", render: (row) => row.codigo ?? "-" },
  { key: "nombre", header: "Contrato", render: (row) => row.nombre ?? "-" },
  { key: "concepto", header: "Concepto", render: (row) => row.concepto ?? "-" },
  { key: "periodo", header: "Periodo", render: (row) => row.periodo ?? "-" },
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
  {
    key: "saldo",
    header: "Saldo",
    align: "right",
    render: (row) =>
      (row.saldo ?? 0).toLocaleString("es-PE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
  },
];

export default function ArrendamientosObligacionesPage() {
  return (
    <ArrendamientosListPage
      title="Obligaciones"
      description="Cronograma de obligaciones y saldos pendientes."
      searchHint="codigo, contrato, concepto, periodo, estado"
      loadRows={listarObligacionesArrendamientos}
      columns={columns}
      emptyMessage="No existen obligaciones registradas."
    />
  );
}
