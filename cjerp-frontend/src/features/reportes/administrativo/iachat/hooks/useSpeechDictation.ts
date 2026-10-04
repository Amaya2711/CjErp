import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Dictado por voz con la Web Speech API del navegador (Chrome/Edge). Sin librerias ni costo adicional.
// El texto reconocido SOLO se entrega por onTranscript: este hook nunca envia nada por si mismo.

type SpeechRecognitionAlternativeLike = { transcript: string };
type SpeechRecognitionResultLike = { isFinal: boolean; [index: number]: SpeechRecognitionAlternativeLike };
type SpeechRecognitionEventLike = { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike> };
type SpeechRecognitionErrorEventLike = { error: string };

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function resolveRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }

  const speechWindow = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Permite el acceso al microfono en el navegador para dictar.",
  "service-not-allowed": "El navegador no permite el reconocimiento de voz en este equipo.",
  "audio-capture": "No se encontro un microfono disponible.",
  network: "No se pudo conectar con el servicio de reconocimiento de voz.",
  "no-speech": "No se detecto voz. Intenta de nuevo.",
};

type UseSpeechDictationOptions = {
  lang?: string;
  /** Recibe el texto ya reconocido (finalText) y el parcial en curso (interimText). */
  onTranscript: (finalText: string, interimText: string) => void;
};

export function useSpeechDictation({ lang = "es-PE", onTranscript }: UseSpeechDictationOptions) {
  const recognitionConstructor = useMemo(() => resolveRecognitionConstructor(), []);
  const supported = recognitionConstructor !== null;

  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTextRef = useRef("");
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const start = useCallback(() => {
    if (!recognitionConstructor || recognitionRef.current) {
      return;
    }

    finalTextRef.current = "";
    setError(null);

    const recognition = new recognitionConstructor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? "";

        if (result.isFinal) {
          finalTextRef.current = `${finalTextRef.current} ${transcript}`.replace(/\s+/g, " ").trim();
        } else {
          interim += transcript;
        }
      }

      onTranscriptRef.current(finalTextRef.current, interim.replace(/\s+/g, " ").trim());
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted") {
        return;
      }

      setError(ERROR_MESSAGES[event.error] ?? "No se pudo completar el dictado.");
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch {
      recognitionRef.current = null;
      setError("No se pudo iniciar el dictado.");
    }
  }, [lang, recognitionConstructor]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  // Descarta lo que quede pendiente de reconocer (a diferencia de stop, no entrega mas texto).
  const abort = useCallback(() => {
    recognitionRef.current?.abort();
  }, []);

  // Al cerrar la pagina se corta el microfono.
  useEffect(
    () => () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    },
    []
  );

  return { supported, listening, error, start, stop, abort };
}
