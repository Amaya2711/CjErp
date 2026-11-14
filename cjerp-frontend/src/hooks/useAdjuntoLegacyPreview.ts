import { useEffect, useState } from "react";
import { descargarArchivoLegacy } from "../api/archivoLegacyService";
import { tipoMedioDesdeBlob } from "../utils/adjuntos";

export type AdjuntoLegacyPreview = {
  url: string;
  tipo: "image" | "pdf" | "unknown";
  loading: boolean;
  error: string;
};

/** Vista previa (URL blob:) de un adjunto del sistema antiguo; solo descarga si `activo` y hay `codigo` numérico. */
export function useAdjuntoLegacyPreview(codigo: string | null | undefined, activo: boolean): AdjuntoLegacyPreview {
  const [estado, setEstado] = useState<AdjuntoLegacyPreview>({ url: "", tipo: "unknown", loading: false, error: "" });

  useEffect(() => {
    const limpio = String(codigo ?? "").trim();
    if (!activo || !/^\d+$/.test(limpio)) {
      setEstado({ url: "", tipo: "unknown", loading: false, error: "" });
      return;
    }
    let vigente = true;
    let objectUrl = "";
    setEstado({ url: "", tipo: "unknown", loading: true, error: "" });
    descargarArchivoLegacy(limpio)
      .then((blob) => {
        if (!vigente) return;
        objectUrl = URL.createObjectURL(blob);
        setEstado({ url: objectUrl, tipo: tipoMedioDesdeBlob(blob), loading: false, error: "" });
      })
      .catch(() => {
        if (vigente) setEstado({ url: "", tipo: "unknown", loading: false, error: "No se pudo recuperar el documento desde el sistema antiguo." });
      });
    return () => {
      vigente = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [codigo, activo]);

  return estado;
}
