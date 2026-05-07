// src/api/filtroOperativoService.ts

import http from '../api/httpClient';
import type {
  FiltroOperativoItem,
  TipoTrabajoOption,
  OtOption,
  TareaOption,
} from '../models/filtroOperativo';
import type { ValoresGastoRequest, ValoresGastoResponse } from '../models/valoresGasto';

export const getFiltrosOperativos = async (): Promise<FiltroOperativoItem[]> => {
  return await http.get<FiltroOperativoItem[]>('/lookup/filtro-operativo/filtros');
};

export const getTipoTrabajo = async (filtroKey: string): Promise<TipoTrabajoOption[]> => {
  const data = await http.get<Array<{ tipoTrabajo?: string; TipoTrabajo?: string }>>('/lookup/filtro-operativo/tipotrabajo', {
    params: { filtroKey },
  });
  return data
    .map(item => ({
      tipoTrabajo: item.tipoTrabajo ?? item.TipoTrabajo
    }))
    .filter(item => item.tipoTrabajo !== undefined) as TipoTrabajoOption[];
};

export const getOTs = async (filtroKey: string): Promise<OtOption[]> => {
  const data = await http.get<Array<{ ot?: string; OT?: string; fecAsignacion?: string | null; FecAsignacion?: string | null }>>('/lookup/filtro-operativo/ot', {
    params: { filtroKey },
  });
  return data
    .map(item => ({
      ot: item.ot ?? item.OT,
      fecAsignacion: item.fecAsignacion ?? item.FecAsignacion ?? null
    }))
    .filter(item => item.ot !== undefined) as OtOption[];
};

export const getTareas = async (): Promise<TareaOption[]> => {
  const data = await http.get<
    Array<{
      correlativo?: string | number;
      Correlativo?: string | number;
      tarea?: string;
      Tarea?: string;
    }>
  >('/lookup/filtro-operativo/tareas');

  return data
    .map((item) => ({
      correlativo: Number(item.correlativo ?? item.Correlativo ?? 0),
      tarea: item.tarea ?? item.Tarea ?? "",
    }))
    .filter((item) => Number.isFinite(item.correlativo) && item.correlativo > 0);
};

export const getValoresGasto = async (
  params: ValoresGastoRequest
): Promise<ValoresGastoResponse> => {
  return await http.get<ValoresGastoResponse>('/lookup/filtro-operativo/valores-gasto', {
    params: {
      idCliente: params.idCliente,
      idProyecto: params.idProyecto,
      idSite: params.idSite,
      correlativo: params.correlativo,
      tipoTrabajo: params.tipoTrabajo,
      ot: params.ot?.trim() || undefined,
      usarOt: params.usarOt,
      tipoCambio: params.tipoCambio,
    },
  });
};
