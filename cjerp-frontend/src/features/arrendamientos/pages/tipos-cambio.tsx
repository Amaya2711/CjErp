import { listarTiposCambioArrendamientos } from "../../../api/arrendamientosService";
import type { ArrendamientosFila } from "../../../models/arrendamientos";
import ArrendamientosListPage from "../components/ArrendamientosListPage";
import type { DataGridColumn } from "../../../components/base/DataGridBase";

const columns: DataGridColumn<ArrendamientosFila>[] = [
  { key: "codigo", header: "Par", render: (row) => row.codigo ?? "-" },
  { key: "nombre", header: "Fecha", render: (row) => row.nombre ?? "-" },
  { key: "detalle", header: "Detalle", render: (row) => row.detalle ?? "-" },
  { key: "estado", header: "Estado", render: (row) => row.estado ?? "-" },
  {
    key: "importe",
    header: "Promedio",
    align: "right",
    render: (row) =>
      (row.importe ?? 0).toLocaleString("es-PE", {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
      }),
  },
  { key: "observacion", header: "Observacion", render: (row) => row.observacion ?? "-" },
];

export default function ArrendamientosTiposCambioPage() {
  return (
    <ArrendamientosListPage
      title="Tipos de cambio"
      description="Registro diario de conversion para operaciones del modulo."
      searchHint="par, fecha, estado, observacion"
      loadRows={listarTiposCambioArrendamientos}
      columns={columns}
      emptyMessage="No existen tipos de cambio registrados."
    />
  );
}
