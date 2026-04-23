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

  // Load filtros and tareas on mount
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

  // Load tipoTrabajo and OT when filtro changes
  useEffect(() => {
    if (value.filtro?.filtroKey) {
      const loadDependentData = async () => {
        try {
          setLoading(true);
          const [tipoTrabajosData, otsData] = await Promise.all([
            getTipoTrabajo(value.filtro.filtroKey),
            getOTs(value.filtro.filtroKey),
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

  // Propagate changes SOLO cuando cambia por acción del usuario
  // Elimina este useEffect para evitar ciclos infinitos
  // useEffect(() => {
  //   if (onChange) onChange(value);
  // }, [value, onChange]);


  const handleFiltroChange = useCallback(
    (filtroKey: string) => {
      const filtro = filtros.find(f => f.filtroKey === filtroKey);
      const newValue = {
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
        tarea: correlativo == null ? undefined : tareas.find(t => t.correlativo === correlativo),
      }));
    },
    [tareas]
  );

  const reset = useCallback(() => {
    setValueState({});
  }, []);
  // Notificar cambios al padre solo después de actualizar el estado interno
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
