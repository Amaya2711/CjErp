// src/hooks/useFiltroOperativoLookup.ts

import { useEffect, useState, useCallback } from 'react';
import { getHttpErrorMessage } from '../utils/httpError';
import type {
  FiltroOperativoItem,
  TipoTrabajoOption,
  OtOption,
  TareaOption,
  FiltroOperativoValue,
} from '../models/filtroOperativo';
import {
  getFiltrosOperativos,
  getTipoTrabajo,
  getOTs,
  getTareas,
} from '../api/filtroOperativoService';

function areFiltroOperativoValuesEqual(
  left?: FiltroOperativoValue,
  right?: FiltroOperativoValue
): boolean {
  return (
    (left?.filtro?.filtroKey ?? '') === (right?.filtro?.filtroKey ?? '') &&
    (left?.filtro?.idCliente ?? 0) === (right?.filtro?.idCliente ?? 0) &&
    (left?.filtro?.idProyecto ?? 0) === (right?.filtro?.idProyecto ?? 0) &&
    (left?.filtro?.idSite ?? '') === (right?.filtro?.idSite ?? '') &&
    (left?.filtro?.correlativo ?? 0) === (right?.filtro?.correlativo ?? 0) &&
    (left?.tipoTrabajo?.tipoTrabajo ?? '') === (right?.tipoTrabajo?.tipoTrabajo ?? '') &&
    (left?.ot?.ot ?? '') === (right?.ot?.ot ?? '') &&
    (left?.tarea?.correlativo ?? 0) === (right?.tarea?.correlativo ?? 0) &&
    (left?.tarea?.tarea ?? '') === (right?.tarea?.tarea ?? '')
  );
}

interface UseFiltroOperativoLookupResult {
  filtros: FiltroOperativoItem[];
  tipoTrabajos: TipoTrabajoOption[];
  ots: OtOption[];
  tareas: TareaOption[];
  loading: boolean;
  error: string | null;
  value: FiltroOperativoValue;
  setValue: (value: FiltroOperativoValue) => void;
  handleFiltroChange: (filtroKey: string) => void;
  handleTipoTrabajoChange: (tipoTrabajo: string) => void;
  handleOtChange: (ot: string) => void;
  handleTareaChange: (correlativo: number | null) => void;
  reset: () => void;
}

export function useFiltroOperativoLookup(
  initialValue?: FiltroOperativoValue,
  onChange?: (value: FiltroOperativoValue) => void
): UseFiltroOperativoLookupResult {
  const [filtros, setFiltros] = useState<FiltroOperativoItem[]>([]);
  const [tipoTrabajos, setTipoTrabajos] = useState<TipoTrabajoOption[]>([]);
  const [ots, setOts] = useState<OtOption[]>([]);
  const [tareas, setTareas] = useState<TareaOption[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValueState] = useState<FiltroOperativoValue>(initialValue || {});

  useEffect(() => {
    const nextValue = initialValue || {};

    setValueState((prev) =>
      areFiltroOperativoValuesEqual(prev, nextValue) ? prev : nextValue
    );
  }, [initialValue]);

  // 🔹 Cargar filtros y tareas al iniciar
  useEffect(() => {
    if (filtros.length === 0 || value.filtro?.filtroKey) {
      return;
    }

    const matchedFiltro = filtros.find((filtro) =>
      Number(filtro.idCliente) === Number(value.filtro?.idCliente) &&
      Number(filtro.idProyecto) === Number(value.filtro?.idProyecto) &&
      String(filtro.idSite ?? "").trim() === String(value.filtro?.idSite ?? "").trim() &&
      Number(filtro.correlativo) === Number(value.filtro?.correlativo)
    );

    if (!matchedFiltro) {
      return;
    }

    setValueState((prev) => {
      if (prev.filtro?.filtroKey === matchedFiltro.filtroKey) {
        return prev;
      }

      return {
        ...prev,
        filtro: matchedFiltro,
      };
    });
  }, [filtros, value.filtro]);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);

        const [filtrosData, tareasData] = await Promise.all([
          getFiltrosOperativos(),
          getTareas(),
        ]);

        setFiltros(filtrosData);
        setTareas(tareasData);
        setError(null);
      } catch (error: unknown) {
        setError(getHttpErrorMessage(error, 'Error al cargar datos iniciales'));
      } finally {
        setLoading(false);
      }
    };

    void loadInitialData();
  }, []);

  // 🔹 Cargar tipoTrabajo y OT cuando cambia el filtro
  useEffect(() => {
    const filtroKey = value.filtro?.filtroKey;

    if (filtroKey) {
      const loadDependentData = async () => {
        try {
          setLoading(true);

          const [tipoTrabajosData, otsData] = await Promise.all([
            getTipoTrabajo(filtroKey),
            getOTs(filtroKey),
          ]);

          setTipoTrabajos(tipoTrabajosData);
          setOts(otsData);
          setError(null);
        } catch (error: unknown) {
          setError(getHttpErrorMessage(error, 'Error al cargar tipo de trabajo u OT'));
        } finally {
          setLoading(false);
        }
      };

      void loadDependentData();
    } else {
      setTipoTrabajos([]);
      setOts([]);
    }
  }, [value.filtro?.filtroKey]);

  // 🔹 Handlers

  const handleFiltroChange = useCallback(
    (filtroKey: string) => {
      const filtro = filtros.find(f => f.filtroKey === filtroKey);

      const newValue: FiltroOperativoValue = {
        filtro,
        tipoTrabajo: undefined,
        ot: undefined,
        tarea: undefined,
      };

      setValueState(newValue);
    },
    [filtros]
  );

  const handleTipoTrabajoChange = useCallback(
    (tipoTrabajo: string) => {
      setValueState(prev => ({
        ...prev,
        tipoTrabajo: tipoTrabajos.find(t => t.tipoTrabajo === tipoTrabajo),
      }));
    },
    [tipoTrabajos]
  );

  const handleOtChange = useCallback(
    (ot: string) => {
      setValueState(prev => ({
        ...prev,
        ot: ots.find(o => o.ot === ot),
      }));
    },
    [ots]
  );

  const handleTareaChange = useCallback(
    (correlativo: number | null) => {
      setValueState(prev => ({
        ...prev,
        tarea:
          correlativo == null
            ? undefined
            : tareas.find(t => t.correlativo === correlativo),
      }));
    },
    [tareas]
  );

  const reset = useCallback(() => {
    setValueState({});
  }, []);

  // 🔹 Notificar cambios al padre
  useEffect(() => {
    if (onChange) onChange(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return {
    filtros,
    tipoTrabajos,
    ots,
    tareas,
    loading,
    error,
    value,
    setValue: setValueState,
    handleFiltroChange,
    handleTipoTrabajoChange,
    handleOtChange,
    handleTareaChange,
    reset,
  };
}
