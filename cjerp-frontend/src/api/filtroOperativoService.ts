// src/api/filtroOperativoService.ts

import http from '../api/httpClient';
import type {
  FiltroOperativoItem,
  TipoTrabajoOption,
  OtOption,
  TareaOption,
} from '../models/filtroOperativo';

export const getFiltrosOperativos = async (): Promise<FiltroOperativoItem[]> => {
  return await http.get<FiltroOperativoItem[]>('/lookup/filtro-operativo/filtros');
};

export const getTipoTrabajo = async (filtroKey: string): Promise<TipoTrabajoOption[]> => {
  const data = await http.get<Array<{ tipoTrabajo?: string; TipoTrabajo?: string }>>('/lookup/filtro-operativo/tipotrabajo', {
    params: { filtroKey },
  });
  return data.map(item => ({
    tipoTrabajo: item.tipoTrabajo ?? item.TipoTrabajo
  }));
};

export const getOTs = async (filtroKey: string): Promise<OtOption[]> => {
  const data = await http.get<Array<{ ot?: string; OT?: string; fecAsignacion?: string | null; FecAsignacion?: string | null }>>('/lookup/filtro-operativo/ot', {
    params: { filtroKey },
  });
  return data.map(item => ({
    ot: item.ot ?? item.OT,
    fecAsignacion: item.fecAsignacion ?? item.FecAsignacion ?? null
  }));
};

export const getTareas = async (): Promise<TareaOption[]> => {
  return await http.get<TareaOption[]>('/lookup/filtro-operativo/tareas');
};
