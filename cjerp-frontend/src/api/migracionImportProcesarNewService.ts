import httpClient from "./httpClient";

export type MigracionImportProcesarNewFilaDto = {
  filaExcel: number | null;
  OT: string | null;
  Cliente: string | null;
  Proyecto: string | null;
  IdSite: string | null;
  Site: string | null;
  TipoTrabajo: string | null;
  Status_Atp: string | null;
  ATP: string | null;
  Status_Pap: string | null;
  Estado_Oc: string | null;
  Nro_Oc: string | null;
  Posicion: string | null;
  MontoOc: number | null;
  MontoLiq: number | null;
  Monto_Bck: number | null;
  CenFile: string | null;
  Status_Gis: string | null;
  Estado_Ea: string | null;
  Folio: string | null;
  Folio2: string | null;
  StatusOt: string | null;
  StatusOt2: string | null;
  Zona: string | null;
  Capitalizacion: string | null;
  Status_Cj: string | null;
  Facturado: string | null;
  PrePasivo: string | null;
  Proyecto2: string | null;
  DiasOn: string | null;
  AntOn: string | null;
  Gerencia: string | null;
  AnoGestion: number | null;
  IdMoneda: number | null;
};

export type MigracionImportProcesarNewResumenDto = {
  accion: string;
  filasExcel: number;
  registrosConsolidados: number;
  coinciden: number;
  conDiferencias: number;
  noEncontrados: number;
  observados: number;
  ambiguos: number;
  actualizados: number;
};

export type MigracionImportProcesarNewDetalleDto = {
  estadoValidacion: string;
  oT: string;
  cliente: string;
  proyecto: string;
  idSite: string;
  site: string;
  tipoTrabajo: string;
  idMoneda: number | null;
  cantidadFilasExcel: number | null;
  estado_Oc: string | null;
  nro_Oc: string | null;
  posicion: string | null;
  montoOc: number | null;
  montoLiq: number | null;
  monto_Bck: number | null;
  montoOcActual: number | null;
  montoLiqActual: number | null;
  montoBckActual: number | null;
  observacion: string | null;
};

export type MigracionImportProcesarNewResultadoDto = {
  resumen: MigracionImportProcesarNewResumenDto;
  detalle: MigracionImportProcesarNewDetalleDto[];
  problemas: MigracionImportProcesarNewDetalleDto[];
};

export async function procesarMigracionImportNew(payload: {
  accion: "VALIDAR" | "ACTUALIZAR";
  datos: MigracionImportProcesarNewFilaDto[];
}): Promise<MigracionImportProcesarNewResultadoDto> {
  return await httpClient.post<MigracionImportProcesarNewResultadoDto>(
    "/mantenimiento/migracion/importar/procesar",
    payload
  );
}
