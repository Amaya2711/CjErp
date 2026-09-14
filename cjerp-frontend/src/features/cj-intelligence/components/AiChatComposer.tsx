import { Send, Square } from "lucide-react";
import { useState } from "react";

type Props = { loading: boolean; onSend: (message: string) => void; onCancel: () => void };

export default function AiChatComposer({ loading, onSend, onCancel }: Props) {
  const [value, setValue] = useState("");
  const submit = () => { const message = value.trim(); if (!message || loading) return; onSend(message); setValue(""); };
  return <div className="ai-composer-wrap">
    <textarea value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder="Escribe una pregunta sobre tu ERP..." aria-label="Pregunta para CJ Intelligence" rows={2} disabled={loading} />
    {loading ? <button className="ai-send-button secondary" onClick={onCancel} aria-label="Cancelar análisis"><Square size={16} /> Cancelar</button> : <button className="ai-send-button" onClick={submit} disabled={!value.trim()} aria-label="Enviar pregunta"><Send size={16} /> Enviar</button>}
    <small>Enter para enviar · Shift + Enter para una nueva línea</small>
  </div>;
}
