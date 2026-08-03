import { listarInmueblesArrendamientos } from "../../../api/arrendamientosService";
import type { ArrendamientosFila } from "../../../models/arrendamientos";
import ArrendamientosListPage from "../components/ArrendamientosListPage";
import type { DataGridColumn } from "../../../components/base/DataGridBase";

const columns: DataGridColumn<ArrendamientosFila>[] = [
  { key: "codigo", header: "Codigo", render: (row) => row.codigo ?? "-" },
  { key: "nombre", header: "Inmueble", render: (row) => row.nombre ?? "-" },
  { key: "detalle", header: "Tipo", render: (row) => row.detalle ?? "-" },
  { key: "inmueble", header: "Direccion", render: (row) => row.inmueble ?? "-" },
  { key: "estado", header: "Estado", render: (row) => row.estado ?? "-" },
  { key: "observacion", header: "Observacion", render: (row) => row.observacion ?? "-" },
];

export default function ArrendamientosInmueblesPage() {
  return (
    <ArrendamientosListPage
      title="Inmuebles"
      description="Consulta de edificios, locales y activos inmobiliarios."
      searchHint="codigo, nombre, tipo, direccion"
      loadRows={listarInmueblesArrendamientos}
      columns={columns}
      emptyMessage="No existen inmuebles registrados."
    />
  );
}
