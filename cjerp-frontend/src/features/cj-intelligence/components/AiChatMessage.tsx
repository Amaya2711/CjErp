import { Bot, Check, Copy, Square, UserRound, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { AiMessage } from "../types";

export default function AiChatMessage({ message, autoSpeak = false }: { message: AiMessage; autoSpeak?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [range, setRange] = useState<[number, number] | null>(null);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
  useEffect(() => () => { if (canSpeak) window.speechSynthesis.cancel(); }, [canSpeak]);
  const speak = () => {
    if (!canSpeak || !message.content) return;
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); setRange(null); return; }
    window.speechSynthesis.cancel();
    // Mismo largo que el original (los símbolos pasan a espacios) para que charIndex coincida con lo que se muestra.
    const text = message.content.replace(/[*_`#>|]/g, " ");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onboundary = (event) => {
      if (event.name && event.name !== "word") return;
      const start = event.charIndex;
      const length = event.charLength || (/^\S+/.exec(text.slice(start))?.[0].length ?? 0);
      setRange(length > 0 ? [start, start + length] : null);
    };
    utterance.lang = "es-PE";
    utterance.onend = () => { setSpeaking(false); setRange(null); };
    utterance.onerror = () => { setSpeaking(false); setRange(null); };
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };
  // Lee la respuesta nueva una sola vez, al aparecer (el permiso lo da el clic en Enviar).
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { if (autoSpeak) speak(); }, [autoSpeak]);
  const assistant = message.role === "assistant";
  const copy = async () => { if (!message.content) return; await navigator.clipboard?.writeText(message.content); setCopied(true); window.setTimeout(() => setCopied(false), 1500); };
  return <article className={`ai-message ${assistant ? "assistant" : "user"}`}>
    <div className="ai-avatar">{assistant ? <Bot size={18} /> : <UserRound size={17} />}</div>
    <div className="ai-message-body"><div className="ai-message-meta"><strong>{assistant ? "CJ Intelligence" : "Tú"}</strong>{assistant && message.content ? <span style={{ display: "inline-flex", gap: 8 }}>{canSpeak ? <button onClick={speak} className="ai-copy-button" aria-label={speaking ? "Detener audio" : "Escuchar respuesta"} title={speaking ? "Detener audio" : "Escuchar respuesta"}>{speaking ? <Square size={14} /> : <Volume2 size={14} />}</button> : null}<button onClick={copy} className="ai-copy-button" aria-label="Copiar respuesta">{copied ? <Check size={14} /> : <Copy size={14} />}</button></span> : null}</div><div className="ai-message-content">{range && speaking && message.content
      ? <>{message.content.slice(0, range[0])}<mark className="ai-reading">{message.content.slice(range[0], range[1])}</mark>{message.content.slice(range[1])}</>
      : message.content || ""}</div></div>
  </article>;
}
