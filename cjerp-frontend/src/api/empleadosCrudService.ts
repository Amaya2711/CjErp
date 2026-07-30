import httpClient from "./httpClient";

const EMPLEADOS_LIST_TIMEOUT_MS = 60000;
const EMPLEADOS_LOOKUPS_TIMEOUT_MS = 60000;

export type EmpleadoCrudItem = {
  idEmpleado: number;
  nombreEmpleado: string;
  sexo: string;
  tipoDoc: string;
  idSexo: number | null;
  nroDocumento: string;
  telefono: string;
  correo: string;
  empresa: string;
  cliente: string;
  area: string;
  ubicacion: string;
  responsable: string;
  soValidador: string;
  terValidador: string;
  fechaIngreso: string;
  fechaIniLaboral: string;
  fechaFinLaboral: string;
  direccion: string;
  cargoPrint: string;
  estado: string;
  idEstado: number | null;
  idDocumento: number | null;
  idEmpresaCj: number | null;
  idClienteCj: number | null;
  idAreaCj: number | null;
  idUbicacionCj: number | null;
  idResponsableCj: number | null;
  idSegundoVacaciones: number | null;
  idTerceroVacaciones: number | null;
};

export type EmpleadoCrudSaveRequest = {
  nombreEmpleado: string;
  sexo?: string | null;
  idSexo: number | null;
  idDocumento: number | null;
  nroDocumento?: string | null;
  telefono?: string | null;
  correo?: string | null;
  direccion?: string | null;
  fechaIngreso?: string | null;
  fechaIniLaboral?: string | null;
  fechaFinLaboral?: string | null;
  idEmpresaCj: number | null;
  idClienteCj: number | null;
  idAreaCj: number | null;
  idUbicacionCj: number | null;
  idResponsableCj: number | null;
  idSegundoVacaciones: number | null;
  idTerceroVacaciones: number | null;
};

export type CrudLookupItem = {
  value: string;
  label: string;
  codigo: string;
  campo: string;
  orden: number;
};

export type EmpleadoCrudLookups = {
  empresas: CrudLookupItem[];
  clientes: CrudLookupItem[];
  areas: CrudLookupItem[];
  ubicaciones: CrudLookupItem[];
  sexos: CrudLookupItem[];
  tiposDocumento: CrudLookupItem[];
  responsables: CrudLookupItem[];
  segundoValidadores: CrudLookupItem[];
  tercerValidadores: CrudLookupItem[];
};

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringValue(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function mapItem(raw: Record<string, unknown>): EmpleadoCrudItem {
  return {
    idEmpleado: Number(raw.idEmpleado ?? raw.IdEmpleado ?? 0),
    nombreEmpleado: toStringValue(raw.nombreEmpleado ?? raw.NombreEmpleado),
    sexo: toStringValue(raw.sexo ?? raw.Sexo),
    tipoDoc: toStringValue(raw.tipodoc ?? raw.TipoDoc ?? raw.tipodocumento ?? raw.TipoDocumento),
    idSexo: toNumber(raw.idsexo ?? raw.IdSexo),
    nroDocumento: toStringValue(raw.nroDocumento ?? raw.NroDocumento),
    telefono: toStringValue(raw.telefono ?? raw.Telefono),
    correo: toStringValue(raw.correo ?? raw.Correo),
    empresa: toStringValue(raw.empresa ?? raw.Empresa),
    cliente: toStringValue(raw.cliente ?? raw.Cliente),
    area: toStringValue(raw.area ?? raw.Area),
    ubicacion: toStringValue(raw.ubicacion ?? raw.Ubicacion),
    responsable: toStringValue(raw.responsable ?? raw.Responsable),
    soValidador: toStringValue(raw.soValidador ?? raw.SoValidador ?? raw.solValidador ?? raw.SolValidador),
    terValidador: toStringValue(raw.terValidador ?? raw.TerValidador ?? raw.tercerValidador ?? raw.TercerValidador),
    fechaIngreso: toStringValue(raw.fechaingreso ?? raw.fechaIngreso ?? raw.FechaIngreso),
    fechaIniLaboral: toStringValue(raw.fechaIniLaboral ?? raw.FechaIniLaboral),
    fechaFinLaboral: toStringValue(raw.fechaFinLaboral ?? raw.FechaFinLaboral),
    direccion: toStringValue(raw.direccion ?? raw.Direccion),
    cargoPrint: toStringValue(raw.cargoPrint ?? raw.CargoPrint),
    estado: toStringValue(raw.estado ?? raw.Estado),
    idEstado: toNumber(raw.idEstado ?? raw.IdEstado),
    idDocumento: toNumber(raw.iddocumento ?? raw.IdDocumento),
    idEmpresaCj: toNumber(raw.idEmpresaCj ?? raw.IdEmpresaCj),
    idClienteCj: toNumber(raw.idClienteCj ?? raw.IdClienteCj),
    idAreaCj: toNumber(raw.idAreaCj ?? raw.IdAreaCj),
    idUbicacionCj: toNumber(raw.idUbicacionCj ?? raw.IdUbicacionCj),
    idResponsableCj: toNumber(raw.idResponsableCj ?? raw.IdResponsableCj),
    idSegundoVacaciones: toNumber(raw.idSegundoVacaciones ?? raw.IdSegundoVacaciones),
    idTerceroVacaciones: toNumber(raw.idTerceroVacaciones ?? raw.IdTerceroVacaciones),
  };
}

function mapLookup(raw: Record<string, unknown>): CrudLookupItem {
  return {
    value: toStringValue(raw.value ?? raw.Value),
    label: toStringValue(raw.label ?? raw.Label),
    codigo: toStringValue(raw.codigo ?? raw.Codigo),
    campo: toStringValue(raw.campo ?? raw.Campo),
    orden: Number(raw.orden ?? raw.Orden ?? 0),
  };
}

export const empleadosCrudService = {
  async listar(nombreEmpleado?: string): Promise<EmpleadoCrudItem[]> {
    const response = await httpClient.get<Record<string, unknown>[] | unknown>("/mantenimiento/empleados", {
      params: nombreEmpleado ? { nombreEmpleado } : undefined,
      timeout: EMPLEADOS_LIST_TIMEOUT_MS,
    });

    return Array.isArray(response) ? response.map((item) => mapItem(item as Record<string, unknown>)) : [];
  },

  async obtener(idEmpleado: number): Promise<EmpleadoCrudItem> {
    const response = await httpClient.get<Record<string, unknown>>(`/mantenimiento/empleados/${idEmpleado}`);
    return mapItem(response);
  },

  async crear(payload: EmpleadoCrudSaveRequest): Promise<EmpleadoCrudItem> {
    const response = await httpClient.post<Record<string, unknown>>("/mantenimiento/empleados", payload);
    return mapItem(response);
  },

  async actualizar(idEmpleado: number, payload: EmpleadoCrudSaveRequest): Promise<EmpleadoCrudItem> {
    const response = await httpClient.put<Record<string, unknown>>(`/mantenimiento/empleados/${idEmpleado}`, payload);
    return mapItem(response);
  },

  async aprobar(idEmpleado: number): Promise<EmpleadoCrudItem> {
    const response = await httpClient.post<Record<string, unknown>>(`/mantenimiento/empleados/${idEmpleado}/aprobar`);
    return mapItem(response);
  },

  async eliminar(idEmpleado: number): Promise<void> {
    await httpClient.delete(`/mantenimiento/empleados/${idEmpleado}`);
  },

  async obtenerLookups(): Promise<EmpleadoCrudLookups> {
    const response = await httpClient.get<Record<string, unknown>>("/mantenimiento/empleados/lookups", {
      timeout: EMPLEADOS_LOOKUPS_TIMEOUT_MS,
    });

    return {
      empresas: Array.isArray(response.empresas)
        ? response.empresas.map((item) => mapLookup(item as Record<string, unknown>))
        : [],
      clientes: Array.isArray(response.clientes)
        ? response.clientes.map((item) => mapLookup(item as Record<string, unknown>))
        : [],
      areas: Array.isArray(response.areas)
        ? response.areas.map((item) => mapLookup(item as Record<string, unknown>))
        : [],
      ubicaciones: Array.isArray(response.ubicaciones)
        ? response.ubicaciones.map((item) => mapLookup(item as Record<string, unknown>))
        : [],
      sexos: Array.isArray(response.sexos)
        ? response.sexos.map((item) => mapLookup(item as Record<string, unknown>))
        : [],
      tiposDocumento: Array.isArray(response.tiposDocumento)
        ? response.tiposDocumento.map((item) => mapLookup(item as Record<string, unknown>))
        : [],
      responsables: Array.isArray(response.responsables)
        ? response.responsables.map((item) => mapLookup(item as Record<string, unknown>))
        : [],
      segundoValidadores: Array.isArray(response.segundoValidadores)
        ? response.segundoValidadores.map((item) => mapLookup(item as Record<string, unknown>))
        : [],
      tercerValidadores: Array.isArray(response.tercerValidadores)
        ? response.tercerValidadores.map((item) => mapLookup(item as Record<string, unknown>))
        : [],
    };
  },
};
