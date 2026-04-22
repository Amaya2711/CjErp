// src/api/filtroOperativoService.ts

import http from '../api/httpClient';
import type {
  FiltroOperativoItem,
  TipoTrabajoOption,
  OtOption,
  TareaOption,
} from '../models/filtroOperativo';

export const getFiltrosOperativos = async (): Promise<FiltroOperativoItem[]> => {
  const { data } = await http.get<FiltroOperativoItem[]>('/lookup/filtro-operativo/filtros');
  return data;
};

export const getTipoTrabajo = async (filtroKey: string): Promise<TipoTrabajoOption[]> => {
  console.log('[getTipoTrabajo] filtroKey enviado:', filtroKey);
  const { data } = await http.get<any[]>('/lookup/filtro-operativo/tipotrabajo', {
    params: { filtroKey },
  });
  // Mapea la propiedad a camelCase
  return data.map(item => ({
    tipoTrabajo: item.tipoTrabajo ?? item.TipoTrabajo
  }));
};

export const getOTs = async (filtroKey: string): Promise<OtOption[]> => {
  const { data } = await http.get<any[]>('/lookup/filtro-operativo/ot', {
    params: { filtroKey },
  });
  // Mapea la propiedad a camelCase
  return data.map(item => ({
    ot: item.ot ?? item.OT,
    fecAsignacion: item.fecAsignacion ?? item.FecAsignacion ?? null
  }));
};

export const getTareas = async (): Promise<TareaOption[]> => {
  const { data } = await http.get<TareaOption[]>('/lookup/filtro-operativo/tareas');
  return data;
};
