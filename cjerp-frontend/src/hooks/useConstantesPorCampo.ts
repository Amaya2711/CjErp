import { useEffect, useMemo, useState } from "react";
import { getConstanteOptionsPorCampo } from "../api/constantesService";
import type { ConstanteOption } from "../models/constante";
import { getHttpErrorMessage } from "../utils/httpError";

type UseConstantesPorCampoResult = {
  constantesPorCampo: Record<string, ConstanteOption[]>;
  loading: boolean;
  error: string | null;
};

export function useConstantesPorCampo(campos: string[]): UseConstantesPorCampoResult {
  const [constantesPorCampo, setConstantesPorCampo] = useState<Record<string, ConstanteOption[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const camposKey = useMemo(
    () => [...new Set(campos.map((campo) => campo.trim()).filter(Boolean))].join("|"),
    [campos]
  );

  useEffect(() => {
    const camposValidos = camposKey ? camposKey.split("|") : [];

    if (camposValidos.length === 0) {
      setConstantesPorCampo({});
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const results = await Promise.all(
          camposValidos.map(async (campo) => ({
            campo,
            options: await getConstanteOptionsPorCampo(campo),
          }))
        );

        if (cancelled) {
          return;
        }

        setConstantesPorCampo(
          results.reduce<Record<string, ConstanteOption[]>>((acc, item) => {
            acc[item.campo] = item.options;
            return acc;
          }, {})
        );
      } catch (err: unknown) {
        if (cancelled) {
          return;
        }

        setError(getHttpErrorMessage(err, "No se pudieron cargar las constantes."));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [camposKey]);

  return {
    constantesPorCampo,
    loading,
    error,
  };
}
