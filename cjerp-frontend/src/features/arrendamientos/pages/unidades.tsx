import { listarUnidadesArrendamientos } from "../../../api/arrendamientosService";
import type { ArrendamientosFila } from "../../../models/arrendamientos";
import ArrendamientosListPage from "../components/ArrendamientosListPage";
import type { DataGridColumn } from "../../../components/base/DataGridBase";

const columns: DataGridColumn<ArrendamientosFila>[] = [
  { key: "codigo", header: "Codigo", render: (row) => row.codigo ?? "-" },
  { key: "nombre", header: "Unidad", render: (row) => row.nombre ?? "-" },
  { key: "detalle", header: "Tipo", render: (row) => row.detalle ?? "-" },
  { key: "inmueble", header: "Inmueble", render: (row) => row.inmueble ?? "-" },
  { key: "unidad", header: "Nivel", render: (row) => row.unidad ?? "-" },
  { key: "estado", header: "Estado", render: (row) => row.estado ?? "-" },
];

export default function ArrendamientosUnidadesPage() {
  return (
    <ArrendamientosListPage
      title="Unidades"
      description="Consulta de pisos, locales y unidades arrendables."
      searchHint="codigo, unidad, inmueble, estado"
      loadRows={listarUnidadesArrendamientos}
      columns={columns}
      emptyMessage="No existen unidades registradas."
    />
  );
}
