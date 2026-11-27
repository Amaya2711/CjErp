import { useEffect, useRef, useState } from "react";
import { getErrorMessage } from "@cjerp/shared";
import {
  despachar,
  listarSeries,
  rechazar,
  reducirImagen,
  subirImagen,
  type DespachoLinea,
  type DespachoSerie,
} from "../api/despachosApi";

type Props = { linea: DespachoLinea; onListo: (mensaje: string) => void };

/** Una línea por despachar. Las reglas las valida el backend; aquí solo se evita enviar lo que seguro será rechazado. */
export default function LineaDespacho({ linea, onListo }: Props) {
  const [serie, setSerie] = useState(linea.serie ?? "");
  const [series, setSeries] = useState<DespachoSerie[]>([]);
  const [cantidad, setCantidad] = useState(String(linea.cantSap));
  const [observacion, setObservacion] = useState(linea.observacion ?? "");
  const [foto, setFoto] = useState<{ ruta: string; nombre: string } | null>(
    linea.rutaImagen ? { ruta: linea.rutaImagen, nombre: "Imagen registrada" } : null,
  );
  const [motivo, setMotivo] = useState("");
  const [rechazando, setRechazando] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputFoto = useRef<HTMLInputElement>(null);

  // Equipos: series libres del material (el backend vuelve a validarlas al despachar).
  useEffect(() => {
    if (!linea.esEquipo || !linea.codPap) return;
    const t = window.setTimeout(() => {
      listarSeries(linea.codPap!, serie)
        .then(setSeries)
        .catch(() => setSeries([]));
    }, 300);
    return () => window.clearTimeout(t);
  }, [linea.codPap, linea.esEquipo, serie]);

  const cantidadNum = Number(cantidad);
  const cantidadValida = linea.esEquipo || (cantidadNum > 0 && cantidadNum <= linea.cantSap);
  const puedeDespachar = !busy && !!foto && cantidadValida && (!linea.esEquipo || serie.trim().length > 0);

  async function onFoto(archivo: File | undefined) {
    if (!archivo) return;
    setError("");
    setBusy(true);
    try {
      const reducida = await reducirImagen(archivo);
      const r = await subirImagen(reducida, linea.nroSolicitud, linea.posicion);
      setFoto({ ruta: r.storagePath, nombre: r.fileName });
    } catch (e) {
      setError(getErrorMessage(e, "No se pudo subir la imagen."));
    } finally {
      setBusy(false);
    }
  }

  async function onDespachar() {
    if (!foto) return;
    setError("");
    setBusy(true);
    try {
      const r = await despachar([
        {
          nroSolicitud: linea.nroSolicitud,
          posicion: linea.posicion,
          serie: linea.esEquipo ? serie.trim() : undefined,
          cantidad: linea.esEquipo ? undefined : cantidadNum,
          rutaImagen: foto.ruta,
          observacion: observacion.trim() || undefined,
        },
      ]);
      onListo(r.conDiferencia > 0 ? "Despachado. La diferencia volvió a Disponible." : "Despachado.");
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRechazar() {
    setError("");
    setBusy(true);
    try {
      await rechazar([{ nroSolicitud: linea.nroSolicitud, posicion: linea.posicion }], motivo.trim());
      onListo("Línea rechazada.");
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Solicitud del sistema antiguo: solo lectura (se atiende en el sistema antiguo; el servidor también lo rechaza).
  if (!linea.esSistemaNuevo) {
    return (
      <div className="linea">
        <div className="linea-cab">
          <strong>{linea.nombreMaterial || linea.codPap}</strong>
          <span className="chip">{linea.esEquipo ? "Equipo" : "Material"} · pedido {linea.cantSap}</span>
        </div>
        <small>Cód. {linea.codPap} · pos. {linea.posicion} · {linea.nomEstado || `estado ${linea.idEstado}`}</small>
        {linea.serie && <small>Serie: {linea.serie}</small>}
        {linea.observacion && <small>Observación: {linea.observacion}</small>}
        <p className="aviso">Solicitud del sistema antiguo: solo lectura. Se despacha en el sistema antiguo.</p>
      </div>
    );
  }

  return (
    <div className="linea">
      <div className="linea-cab">
        <strong>{linea.nombreMaterial || linea.codPap}</strong>
        <span className="chip">{linea.esEquipo ? "Equipo" : "Material"} · pedido {linea.cantSap}</span>
      </div>
      <small>Cód. {linea.codPap} · pos. {linea.posicion}</small>

      {linea.esEquipo ? (
        <label>
          Serie
          <input
            list={`series-${linea.nroSolicitud}-${linea.posicion}`}
            value={serie}
            onChange={(e) => setSerie(e.target.value)}
            placeholder="Escriba o elija la serie"
            autoCapitalize="characters"
          />
          <datalist id={`series-${linea.nroSolicitud}-${linea.posicion}`}>
            {series.map((s) => (
              <option key={s.serie} value={s.serie} />
            ))}
          </datalist>
        </label>
      ) : (
        <label>
          Cantidad a despachar (máx. {linea.cantSap})
          <input type="number" inputMode="decimal" min={0} max={linea.cantSap} value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          {cantidadNum > 0 && cantidadNum < linea.cantSap && (
            <small>La diferencia ({linea.cantSap - cantidadNum}) volverá a Disponible.</small>
          )}
        </label>
      )}

      <div className="foto">
        <input
          ref={inputFoto}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => void onFoto(e.target.files?.[0])}
        />
        <button type="button" className="sec" disabled={busy} onClick={() => inputFoto.current?.click()}>
          {foto ? "Cambiar foto" : "Tomar foto (obligatoria)"}
        </button>
        {foto && <small>✔ {foto.nombre}</small>}
      </div>

      <label>
        Observación
        <input value={observacion} onChange={(e) => setObservacion(e.target.value)} />
      </label>

      {error && <p className="error" role="alert">{error}</p>}

      {!rechazando ? (
        <div className="acciones">
          <button type="button" disabled={!puedeDespachar} onClick={() => void onDespachar()}>
            {busy ? "Procesando…" : "Despachar"}
          </button>
          <button type="button" className="peligro" disabled={busy} onClick={() => setRechazando(true)}>
            Rechazar
          </button>
        </div>
      ) : (
        <div className="rechazo">
          <label>
            Motivo del rechazo (obligatorio)
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
          </label>
          <div className="acciones">
            <button type="button" className="peligro" disabled={busy || motivo.trim().length === 0} onClick={() => void onRechazar()}>
              Confirmar rechazo
            </button>
            <button type="button" className="sec" disabled={busy} onClick={() => setRechazando(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
