import { useCallback, useEffect, useRef, useState } from "react";

// Lectura en voz alta con la Web Speech API del navegador (speechSynthesis). Sin librerias ni costo.
// Solo lee el texto de la respuesta del chat; nunca envia nada a ningun servicio propio.

const MAX_CHUNK_LENGTH = 200; // Chrome corta las lecturas largas: se encolan frases cortas.
const PREFERRED_LANGS = ["es-PE", "es-419", "es-MX", "es-US", "es-CO", "es-AR", "es-ES"];

function getSynthesis(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    return null;
  }

  return window.speechSynthesis;
}

/** Corta cualquier lectura en curso (al enviar una consulta, limpiar la conversacion o salir de la pagina). */
export function cancelSpeech() {
  getSynthesis()?.cancel();
}

/**
 * Convierte la respuesta (markdown) en texto legible en voz alta: sin simbolos de formato, con las tablas como
 * frases y los importes sin separador de miles (el decimal se lee "con": 1,234.50 -> "1234 con 50").
 */
export function toSpeakableText(raw: string): string {
  const withoutMarkup = raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*\|?\s*:?-{2,}:?(?:\s*\|\s*:?-{2,}:?)*\s*\|?\s*$/gm, "") // separador de tablas
    // Cada fila de tabla se lee como una frase: "AMX, SOLES, 1281".
    .split("\n")
    .map((line) =>
      line.includes("|")
        ? line
            .split("|")
            .map((cell) => cell.trim())
            .filter(Boolean)
            .join(", ")
        : line
    )
    .join("\n");

  return withoutMarkup
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/\*+/g, "")
    .replace(/__+/g, " ")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/S\/\.?\s?/g, "soles ")
    .replace(/%/g, " por ciento")
    .replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+\.\d+\b/g, (value) => value.replace(/,/g, "").replace(".", " con "))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Divide el texto en frases de longitud acotada, respetando saltos de linea y signos de puntuacion. */
export function splitIntoSpeechChunks(text: string, limit = MAX_CHUNK_LENGTH): string[] {
  const chunks: string[] = [];

  for (const line of text.split("\n")) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      continue;
    }

    const sentences = trimmedLine.match(/[^.!?;:]+[.!?;:]*/g) ?? [trimmedLine];
    let current = "";

    for (const sentence of sentences) {
      const piece = sentence.trim();
      if (!piece) {
        continue;
      }

      if (current && `${current} ${piece}`.length > limit) {
        chunks.push(current);
        current = "";
      }

      if (piece.length > limit) {
        // Frase muy larga sin puntuacion: se corta por palabras.
        let words = "";
        for (const word of piece.split(" ")) {
          if (words && `${words} ${word}`.length > limit) {
            chunks.push(words);
            words = word;
          } else {
            words = words ? `${words} ${word}` : word;
          }
        }
        current = words;
      } else {
        current = current ? `${current} ${piece}` : piece;
      }
    }

    if (current) {
      chunks.push(current);
    }
  }

  return chunks;
}

function pickSpanishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  for (const lang of PREFERRED_LANGS) {
    const match = voices.find((voice) => voice.lang.replace("_", "-").toLowerCase() === lang.toLowerCase());
    if (match) {
      return match;
    }
  }

  return voices.find((voice) => voice.lang.toLowerCase().startsWith("es")) ?? null;
}

export function useSpeechReader(lang = "es-PE") {
  const [supported] = useState(() => getSynthesis() !== null);
  const [speaking, setSpeaking] = useState(false);
  const tokenRef = useRef(0);
  const speakingRef = useRef(false);

  const finish = useCallback((token: number) => {
    // Los eventos de una lectura cancelada llegan tarde: solo cuenta el de la lectura vigente.
    if (tokenRef.current === token) {
      speakingRef.current = false;
      setSpeaking(false);
    }
  }, []);

  const speak = useCallback(
    (text: string) => {
      const synthesis = getSynthesis();
      if (!synthesis) {
        return;
      }

      const chunks = splitIntoSpeechChunks(toSpeakableText(text));
      if (chunks.length === 0) {
        return;
      }

      synthesis.cancel();
      tokenRef.current += 1;
      const token = tokenRef.current;
      const voice = pickSpanishVoice(synthesis.getVoices());

      chunks.forEach((chunk, index) => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.lang = voice?.lang ?? lang;
        if (voice) {
          utterance.voice = voice;
        }
        utterance.rate = 1;
        utterance.onerror = () => finish(token);
        if (index === chunks.length - 1) {
          utterance.onend = () => finish(token);
        }
        synthesis.speak(utterance);
      });

      speakingRef.current = true;
      setSpeaking(true);
    },
    [finish, lang]
  );

  const stop = useCallback(() => {
    tokenRef.current += 1;
    speakingRef.current = false;
    setSpeaking(false);
    getSynthesis()?.cancel();
  }, []);

  // Si el boton desaparece (otro mensaje, otra pagina) mientras lee, se corta la voz.
  useEffect(
    () => () => {
      if (speakingRef.current) {
        getSynthesis()?.cancel();
      }
    },
    []
  );

  return { supported, speaking, speak, stop };
}
