import { Bot, Check, Copy, UserRound } from "lucide-react";
import { useState } from "react";
import type { AiMessage } from "../types";

export default function AiChatMessage({ message }: { message: AiMessage }) {
  const [copied, setCopied] = useState(false);
  const assistant = message.role === "assistant";
  const copy = async () => { if (!message.content) return; await navigator.clipboard?.writeText(message.content); setCopied(true); window.setTimeout(() => setCopied(false), 1500); };
  return <article className={`ai-message ${assistant ? "assistant" : "user"}`}>
    <div className="ai-avatar">{assistant ? <Bot size={18} /> : <UserRound size={17} />}</div>
    <div className="ai-message-body"><div className="ai-message-meta"><strong>{assistant ? "CJ Intelligence" : "Tú"}</strong>{assistant && message.content ? <button onClick={copy} className="ai-copy-button" aria-label="Copiar respuesta">{copied ? <Check size={14} /> : <Copy size={14} />}</button> : null}</div><div className="ai-message-content">{message.content || ""}</div></div>
  </article>;
}
