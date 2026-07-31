import httpClient from "./httpClient";

export type MigracionImportAnalisisDto = {
  nombreArchivo: string;
  hojas: string[];
  nombreHoja: string;
  filasOrigen: number;
  filasConsolidadas: number;
  filasDuplicadasConsolidadas: number;
  encabezados: string[];
  filas: string[][];
  duplicados: MigracionImportGrupoDuplicadoDto[];
};

export type MigracionImportRegistroDuplicadoDto = {
  filaOrigen: number;
  valores: string[];
};

export type MigracionImportGrupoDuplicadoDto = {
  clave: string;
  cantidadRegistros: number;
  montoOcTotal: number;
  registros: MigracionImportRegistroDuplicadoDto[];
};

export type MigracionImportEjecucionResultadoDto = {
  filasStaging: number;
  filasInsertadas: number;
  filasActualizadas: number;
  filasNoEncontradas: number;
  operacionesCjNuevas: number;
};

export async function analizarMigracionImport(archivo: File): Promise<MigracionImportAnalisisDto> {
  const formData = new FormData();
  formData.append("archivo", archivo);

  return await httpClient.post<MigracionImportAnalisisDto>("/mantenimiento/migracion/analizar", formData, {
    timeout: 180000,
  });
}

export async function aplicarMigracionImport(
  archivo: File,
  modo: "migrar" | "actualizar"
): Promise<MigracionImportEjecucionResultadoDto> {
  const formData = new FormData();
  formData.append("archivo", archivo);
  formData.append("modo", modo);

  return await httpClient.post<MigracionImportEjecucionResultadoDto>("/mantenimiento/migracion/aplicar", formData, {
    timeout: 180000,
  });
}
