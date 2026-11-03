import { Mic, MicOff, Send, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Props = { loading: boolean; onSend: (message: string) => void; onCancel: () => void };

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
type RecognitionCtor = new () => Recognition;

const getRecognitionCtor = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const SILENCE_MS = 2000;

const audioError = (code?: string) => {
  if (code === "not-allowed" || code === "service-not-allowed") return "El navegador no tiene permiso para usar el micrófono.";
  if (code === "no-speech") return "No se escuchó nada. Intenta nuevamente.";
  if (code === "audio-capture") return "No se encontró un micrófono.";
  if (code === "network") return "El reconocimiento de voz necesita conexión a internet.";
  return "No fue posible reconocer el audio.";
};

export default function AiChatComposer({ loading, onSend, onCancel }: Props) {
  const [value, setValue] = useState("");
  const [listening, setListening] = useState(false);
  const [audioMsg, setAudioMsg] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const baseRef = useRef("");
  const textRef = useRef("");
  const silenceRef = useRef<number | null>(null);
  const sendRef = useRef(onSend);
  useEffect(() => { sendRef.current = onSend; });
  const clearSilence = () => { if (silenceRef.current !== null) { window.clearTimeout(silenceRef.current); silenceRef.current = null; } };
  const Ctor = getRecognitionCtor();
  useEffect(() => () => { clearSilence(); recRef.current?.abort(); }, []);

  const submit = () => { const message = value.trim(); if (!message || loading) return; clearSilence(); recRef.current?.stop(); onSend(message); setValue(""); };

  const toggleMic = () => {
    if (!Ctor) return;
    if (listening) { clearSilence(); recRef.current?.stop(); return; }
    setAudioMsg(null);
    const rec = new Ctor();
    rec.lang = "es-PE"; rec.continuous = true; rec.interimResults = true;
    baseRef.current = value.trim() ? `${value.trim()} ` : "";
    rec.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
      const full = baseRef.current + text.trim();
      textRef.current = full;
      setValue(full);
      // Una pausa de 2 s sin voz se toma como el fin de la consulta: se detiene el micrófono y se envía.
      clearSilence();
      silenceRef.current = window.setTimeout(() => {
        silenceRef.current = null;
        recRef.current?.stop();
        const message = textRef.current.trim();
        if (message) { sendRef.current(message); setValue(""); textRef.current = ""; }
      }, SILENCE_MS);
    };
    rec.onerror = (event) => { if (event.error !== "aborted") setAudioMsg(audioError(event.error)); };
    rec.onend = () => { clearSilence(); setListening(false); recRef.current = null; };
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); recRef.current = null; }
  };

  return <div className="ai-composer-wrap">
    <textarea value={value} onChange={(event) => { textRef.current = event.target.value; setValue(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder={listening ? "Escuchando... habla ahora" : "Escribe o dicta una pregunta sobre tu ERP..."} aria-label="Pregunta para CJ Intelligence" rows={2} disabled={loading} />
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {Ctor && !loading ? <button type="button" className={`ai-send-button ${listening ? "" : "secondary"}`} onClick={toggleMic} aria-label={listening ? "Detener dictado" : "Dictar pregunta"} title={listening ? "Detener dictado" : "Dictar pregunta"}>{listening ? <MicOff size={16} /> : <Mic size={16} />}{listening ? " Detener" : ""}</button> : null}
      {loading ? <button className="ai-send-button secondary" onClick={onCancel} aria-label="Cancelar análisis"><Square size={16} /> Cancelar</button> : <button className="ai-send-button" onClick={submit} disabled={!value.trim()} aria-label="Enviar pregunta"><Send size={16} /> Enviar</button>}
    </div>
    <small>{audioMsg ?? (Ctor ? "Enter para enviar · Shift + Enter para una nueva línea · Micrófono para dictar (2 s de pausa envían la consulta)" : "Enter para enviar · Shift + Enter para una nueva línea")}</small>
  </div>;
}
