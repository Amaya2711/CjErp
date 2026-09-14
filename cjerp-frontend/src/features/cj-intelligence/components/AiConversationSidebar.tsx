import { MessageSquare, MessageSquarePlus, Trash2, X } from "lucide-react";
import type { AiConversation } from "../types";

type Props = {
  conversations: AiConversation[];
  activeId: string | null;
  open: boolean;
  onClose: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (conversation: AiConversation) => void;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short" }).format(new Date(value));
}

export default function AiConversationSidebar({ conversations, activeId, open, onClose, onNew, onSelect, onDelete }: Props) {
  return (
    <aside className={`ai-sidebar ${open ? "is-open" : ""}`} aria-label="Conversaciones de CJ Intelligence">
      <div className="ai-sidebar-header">
        <div><span className="ai-eyebrow">Historial</span><h2>Conversaciones</h2></div>
        <button className="ai-icon-button ai-mobile-only" onClick={onClose} aria-label="Cerrar conversaciones"><X size={18} /></button>
      </div>
      <button className="ai-new-button" onClick={onNew}><MessageSquarePlus size={18} /> Nueva conversación</button>
      <div className="ai-conversation-list">
        {conversations.length === 0 ? <p className="ai-sidebar-empty">Tus análisis aparecerán aquí.</p> : conversations.map((conversation) => (
          <div className={`ai-conversation-item ${activeId === conversation.idConversacion ? "active" : ""}`} key={conversation.idConversacion}>
            <button onClick={() => onSelect(conversation.idConversacion)} aria-label={`Abrir ${conversation.titulo || "conversación"}`}>
              <MessageSquare size={16} />
              <span><strong>{conversation.titulo || "Nueva conversación"}</strong><small>{formatDate(conversation.fechaUltimoMensaje)}</small></span>
            </button>
            <button className="ai-delete-button" onClick={() => onDelete(conversation)} aria-label="Eliminar conversación"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <div className="ai-sidebar-note"><MessageSquare size={15} /> El acceso y los datos siempre los determina el ERP.</div>
    </aside>
  );
}
