import { useEffect, useMemo, useState } from "react";
import type { GridColumn } from "../../../../../components/datagrid/types";
import { listarCatalogosIngreso } from "../../../../../api/logisticaEquiposService";
import type { IngresoCatalogo, IngresoConsulta, IngresoEtapa, IngresoLinea } from "../../../../../models/logisticaEquipos";
import { getHttpErrorMessage } from "../../../../../utils/httpError";

/** Línea de la grilla: la fila del servidor más la elección de estado hecha por el usuario. */
export type IngresoFila = IngresoLinea & { estadoNuevo?: number | null };

export type OpcionCatalogo = { value: number; label: string };

/** Catálogos de la pantalla (Constante UBICACION, UBI_ALMACEN y ESTADO_LOG). */
export function useCatalogosIngreso() {
  const [catalogos, setCatalogos] = useState<IngresoCatalogo[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    listarCatalogosIngreso()
      .then((data) => {
        if (!cancelled) setCatalogos(data);
      })
      .catch((err) => {
        if (!cancelled) setError(getHttpErrorMessage(err, "No se pudieron cargar los catálogos."));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    const opciones = (tipo: string): OpcionCatalogo[] =>
      catalogos.filter((c) => c.tipo === tipo).map((c) => ({ value: c.correlativo, label: c.nombre ?? String(c.correlativo) }));
    return {
      ubicaciones: opciones("UBICACION"),
      zonasAlmacen: opciones("UBI_ALMACEN"),
      estados: opciones("ESTADO_LOG"),
      error,
    };
  }, [catalogos, error]);
}

export type FiltrosIngreso = {
  usaPedidos: boolean;
  pedidos: string;
  usaSolicitudes: boolean;
  solicitudes: string;
  usaFecha: boolean;
  fechaIni: string;
  fechaFin: string;
  usaUbicacion: boolean;
  idUbicacion: number | null;
};

const hoyIso = () => new Date().toISOString().slice(0, 10);

export const filtrosIniciales = (): FiltrosIngreso => ({
  usaPedidos: false,
  pedidos: "",
  usaSolicitudes: false,
  solicitudes: "",
  usaFecha: false,
  fechaIni: hoyIso(),
  fechaFin: hoyIso(),
  usaUbicacion: false,
  idUbicacion: null,
});

export function construirConsulta(etapa: IngresoEtapa, f: FiltrosIngreso): IngresoConsulta {
  return {
    etapa,
    pedidos: f.usaPedidos ? f.pedidos.trim() : undefined,
    solicitudes: f.usaSolicitudes ? f.solicitudes.trim() : undefined,
    fechaIni: f.usaFecha ? f.fechaIni : undefined,
    fechaFin: f.usaFecha ? f.fechaFin : undefined,
    idUbicacion: f.usaUbicacion ? f.idUbicacion : undefined,
  };
}

const fechaCorta = (valor: unknown) => {
  const texto = String(valor ?? "");
  return texto ? texto.slice(0, 10) : "";
};

/** Columnas de las pestañas de recepción y validación (mismos campos visibles del formulario antiguo). */
export function columnasEstado(
  lookupEstados: OpcionCatalogo[],
  etiquetaEstadoActual: string,
): GridColumn<IngresoFila>[] {
  return [
    {
      dataField: "estadoNuevo",
      caption: "Estado",
      width: 150,
      fixed: true,
      allowEditing: true,
      lookup: lookupEstados,
      cellStyle: (valor) => (valor ? { fontWeight: 700, color: "#1F6F8B" } : { color: "#94A3B8" }),
    },
    { dataField: "pedidoSap", caption: "Pedido SAP", width: 120 },
    { dataField: "cantSap", caption: "Cantidad", dataType: "number", width: 90, format: { type: "fixedPoint", precision: 0 } },
    { dataField: "codPap", caption: "Código", width: 110 },
    { dataField: "nombreMaterial", caption: "Material", width: 300 },
    { dataField: "unidadMedida", caption: "UM", width: 60 },
    { dataField: "serie", caption: "Serie", width: 140 },
    { dataField: "guia", caption: "Nro. guía", width: 120 },
    { dataField: "observacion", caption: "Observación", width: 200 },
    { dataField: "idSolicitud", caption: "Id. solicitud", width: 110 },
    { dataField: "nombreCliente", caption: "Cliente", width: 160 },
    { dataField: "nombreProyecto", caption: "Proyecto", width: 180 },
    { dataField: "idSite", caption: "Site", width: 90 },
    { dataField: "nombreSite", caption: "Desc. site", width: 200 },
    { dataField: "tipoTrabajo", caption: "Trabajo", width: 140 },
    { dataField: "fecIngreso", caption: "Fec. guía", width: 100, calculateCellValue: (r) => fechaCorta(r.fecIngreso) },
    { dataField: "nomEstado", caption: etiquetaEstadoActual, width: 130 },
    { dataField: "comentario", caption: "Comentario", width: 200 },
    { dataField: "fecha", caption: "Fecha", width: 100, calculateCellValue: (r) => fechaCorta(r.fecha) },
  ];
}

export const ingresoStyles = {
  root: { display: "flex", flexDirection: "column" as const, flex: 1, minHeight: 0, gap: 10 },
  toolbar: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const },
  input: { border: "1px solid #CBD5E1", borderRadius: 8, padding: "6px 9px", fontSize: 13, background: "#fff" },
  check: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#334155" },
  primary: { background: "#1F6F8B", color: "#fff", border: 0, borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13 },
  secondary: { background: "#fff", color: "#1F6F8B", border: "1px solid #1F6F8B", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 13 },
  resumen: { color: "#64748B", fontSize: 12, marginLeft: "auto" },
  error: { background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 8, padding: "8px 12px", fontSize: 13 },
  ok: { background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#047857", borderRadius: 8, padding: "8px 12px", fontSize: 13 },
  gridHost: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" as const },
  panel: { border: "1px solid #E2E8F0", borderRadius: 10, padding: 12, background: "#F8FAFC", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" as const },
};
