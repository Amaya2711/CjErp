import { useEffect, useState } from "react";
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

  useEffect(() => {
    const camposValidos = [...new Set(campos.map((campo) => campo.trim()).filter(Boolean))];

    if (camposValidos.length === 0) {
      setConstantesPorCampo({});
      return;
    }

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

        setConstantesPorCampo(
          results.reduce<Record<string, ConstanteOption[]>>((acc, item) => {
            acc[item.campo] = item.options;
            return acc;
          }, {})
        );
      } catch (err: unknown) {
        setError(getHttpErrorMessage(err, "No se pudieron cargar las constantes."));
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [campos]);

  return {
    constantesPorCampo,
    loading,
    error,
  };
}
