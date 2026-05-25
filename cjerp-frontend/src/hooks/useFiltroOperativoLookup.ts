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

type DependentLookupCacheEntry = {
  tipoTrabajos: TipoTrabajoOption[];
  ots: OtOption[];
};

let filtrosCache: FiltroOperativoItem[] | null = null;
let tareasCache: TareaOption[] | null = null;
let initialLookupPromise: Promise<{ filtros: FiltroOperativoItem[]; tareas: TareaOption[] }> | null = null;
const dependentLookupCache = new Map<string, DependentLookupCacheEntry>();
const dependentLookupPromises = new Map<string, Promise<DependentLookupCacheEntry>>();

function normalizeLookupText(value?: string | null): string {
  return String(value ?? "").trim().toLowerCase();
}

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
  const [filtros, setFiltros] = useState<FiltroOperativoItem[]>(() => filtrosCache ?? []);
  const [tipoTrabajos, setTipoTrabajos] = useState<TipoTrabajoOption[]>([]);
  const [ots, setOts] = useState<OtOption[]>([]);
  const [tareas, setTareas] = useState<TareaOption[]>(() => tareasCache ?? []);
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
    if (filtros.length === 0 || !value.filtro) {
      return;
    }

    const matchedFiltroByKey = value.filtro.filtroKey
      ? filtros.find((filtro) => filtro.filtroKey === value.filtro?.filtroKey)
      : undefined;

    const matchedFiltro =
      matchedFiltroByKey ??
      filtros.find((filtro) =>
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
        if (filtrosCache && tareasCache) {
          setFiltros(filtrosCache);
          setTareas(tareasCache);
          setError(null);
          return;
        }

        setLoading(true);

        if (!initialLookupPromise) {
          initialLookupPromise = Promise.all([
            getFiltrosOperativos(),
            getTareas(),
          ]).then(([filtrosData, tareasData]) => ({
            filtros: filtrosData,
            tareas: tareasData,
          }));
        }

        const { filtros: filtrosData, tareas: tareasData } = await initialLookupPromise;

        filtrosCache = filtrosData;
        tareasCache = tareasData;

        setFiltros(filtrosData);
        setTareas(tareasData);
        setError(null);
      } catch (error: unknown) {
        setError(getHttpErrorMessage(error, 'Error al cargar datos iniciales'));
      } finally {
        initialLookupPromise = null;
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
          const cached = dependentLookupCache.get(filtroKey);
          if (cached) {
            setTipoTrabajos(cached.tipoTrabajos);
            setOts(cached.ots);
            setValueState((prev) => {
              const selectedTipoTrabajo =
                cached.tipoTrabajos.find(
                  (item) =>
                    normalizeLookupText(item.tipoTrabajo) ===
                    normalizeLookupText(prev.tipoTrabajo?.tipoTrabajo ?? prev.filtro?.tipoTrabajo)
                ) ?? prev.tipoTrabajo;

              const selectedOt =
                cached.ots.find(
                  (item) =>
                    normalizeLookupText(item.ot) ===
                    normalizeLookupText(prev.ot?.ot ?? prev.filtro?.ot)
                ) ?? prev.ot;

              return {
                ...prev,
                tipoTrabajo: selectedTipoTrabajo,
                ot: selectedOt,
              };
            });
            setError(null);
            return;
          }

          setLoading(true);

          let dependentPromise = dependentLookupPromises.get(filtroKey);
          if (!dependentPromise) {
            dependentPromise = Promise.all([
              getTipoTrabajo(filtroKey),
              getOTs(filtroKey),
            ]).then(([tipoTrabajosData, otsData]) => ({
              tipoTrabajos: tipoTrabajosData,
              ots: otsData,
            }));
            dependentLookupPromises.set(filtroKey, dependentPromise);
          }

          const { tipoTrabajos: tipoTrabajosData, ots: otsData } = await dependentPromise;
          dependentLookupCache.set(filtroKey, {
            tipoTrabajos: tipoTrabajosData,
            ots: otsData,
          });

          setTipoTrabajos(tipoTrabajosData);
          setOts(otsData);
          setValueState((prev) => {
            const selectedTipoTrabajo =
              tipoTrabajosData.find(
                (item) =>
                  normalizeLookupText(item.tipoTrabajo) ===
                  normalizeLookupText(prev.tipoTrabajo?.tipoTrabajo ?? prev.filtro?.tipoTrabajo)
              ) ?? prev.tipoTrabajo;

            const selectedOt =
              otsData.find(
                (item) =>
                  normalizeLookupText(item.ot) ===
                  normalizeLookupText(prev.ot?.ot ?? prev.filtro?.ot)
              ) ?? prev.ot;

            return {
              ...prev,
              tipoTrabajo: selectedTipoTrabajo,
              ot: selectedOt,
            };
          });
          setError(null);
        } catch (error: unknown) {
          setError(getHttpErrorMessage(error, 'Error al cargar tipo de trabajo u OT'));
        } finally {
          dependentLookupPromises.delete(filtroKey);
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
