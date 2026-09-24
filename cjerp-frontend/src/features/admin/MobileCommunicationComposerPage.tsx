import { useState } from "react";
import type { FormEvent } from "react";
import httpClient from "../../api/httpClient";

type FormData = { tipo: number; titulo: string; mensaje: string; prioridad: number; tipoPersistencia: number; permiteConfirmacion: boolean; destinatarios: string; fechaProgramada: string; fechaVencimiento: string; rutaDestino: string; idReferencia: string; tipoReferencia: string };
type Recipient = { idEmpleadoCj: number; nombreEmpleado: string; idCargo?: number | null; correo?: string | null };
const initial: FormData = { tipo: 0, titulo: "", mensaje: "", prioridad: 0, tipoPersistencia: 0, permiteConfirmacion: false, destinatarios: "", fechaProgramada: "", fechaVencimiento: "", rutaDestino: "", idReferencia: "", tipoReferencia: "" };

export default function MobileCommunicationComposerPage() {
  const [form, setForm] = useState(initial); const [saving, setSaving] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [attachment, setAttachment] = useState<File | null>(null); const [search, setSearch] = useState(""); const [recipients, setRecipients] = useState<Recipient[]>([]);
  const update = <K extends keyof FormData>(key: K, value: FormData[K]) => setForm(current => ({ ...current, [key]: value }));
  const findRecipients = async () => { try { setRecipients(await httpClient.get<Recipient[]>(`/mobile/admin/destinatarios?busqueda=${encodeURIComponent(search)}`)); } catch { setError("No fue posible buscar destinatarios."); } };
  const addRecipient = (id: number) => { const ids = new Set(form.destinatarios.split(/[;,\s]+/).filter(Boolean)); ids.add(String(id)); update("destinatarios", [...ids].join(", ")); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    const destinatarios = [...new Set(form.destinatarios.split(/[;,\s]+/).map(value => Number(value)).filter(value => Number.isInteger(value) && value > 0))];
    if (!destinatarios.length) { setSaving(false); setError("Ingrese uno o más códigos de EmpleadoCj."); return; }
    try {
      const data = await httpClient.post<{ idComunicacion: number; destinatarios: number }>("/mobile/admin/comunicaciones", {
        tipo: Number(form.tipo), titulo: form.titulo, mensaje: form.mensaje, prioridad: Number(form.prioridad), tipoPersistencia: Number(form.tipoPersistencia), permiteConfirmacion: form.permiteConfirmacion,
        destinatarios, fechaProgramada: form.fechaProgramada || null, fechaVencimiento: form.fechaVencimiento || null, rutaDestino: form.rutaDestino || null, idReferencia: form.idReferencia ? Number(form.idReferencia) : null, tipoReferencia: form.tipoReferencia || null,
      });
      if (attachment) {
        const upload = new FormData(); upload.append("archivo", attachment);
        await httpClient.post(`/mobile/admin/comunicaciones/${data.idComunicacion}/adjuntos`, upload);
      }
      setMessage(`Comunicación ${data.idComunicacion} creada para ${data.destinatarios} destinatario(s)${attachment ? " con adjunto." : "."}`); setForm(initial); setAttachment(null);
    } catch { setError("No fue posible publicar. Verifique permisos, fechas y códigos EmpleadoCj."); }
    finally { setSaving(false); }
  };
  const mandatory = form.tipoPersistencia === 3;
  return <main style={styles.page}><h1 style={styles.title}>Nueva comunicación móvil</h1><p style={styles.subtitle}>La publicación se registra en el ERP y se dirige exclusivamente a códigos de empleado CJ.</p>
    <form onSubmit={submit} style={styles.form}>
      <label style={styles.full}>Título<input required maxLength={250} value={form.titulo} onChange={event => update("titulo", event.target.value)} style={styles.input} /></label>
      <label style={styles.full}>Mensaje<textarea required value={form.mensaje} onChange={event => update("mensaje", event.target.value)} style={{ ...styles.input, minHeight: 120, resize: "vertical" }} /></label>
      <label>Tipo<select value={form.tipo} onChange={event => update("tipo", Number(event.target.value))} style={styles.input}><option value={0}>Comunicado</option><option value={1}>Notificación</option><option value={2}>Alerta</option><option value={3}>Recordatorio</option><option value={4}>Tarea</option><option value={5}>Sistema</option></select></label>
      <label>Persistencia<select value={form.tipoPersistencia} onChange={event => update("tipoPersistencia", Number(event.target.value))} style={styles.input}><option value={0}>Informativa</option><option value={1}>Hasta lectura</option><option value={2}>Hasta confirmación</option><option value={3}>Obligatoria</option></select></label>
      <label>Prioridad<input type="number" min="0" max="10" value={form.prioridad} onChange={event => update("prioridad", Number(event.target.value))} style={styles.input} /></label>
      <label style={styles.full}>Destinatarios — códigos EmpleadoCj<input required placeholder="Ejemplo: 1160, 1201, 1202" value={form.destinatarios} onChange={event => update("destinatarios", event.target.value)} style={styles.input} /></label>
      <div style={styles.full}><span>Buscar destinatario activo</span><div style={styles.searchRow}><input placeholder="Nombre o código EmpleadoCj" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void findRecipients(); } }} style={styles.input} /><button type="button" onClick={() => void findRecipients()} style={styles.searchButton}>BUSCAR</button></div>{recipients.map(recipient => <div key={recipient.idEmpleadoCj} style={styles.recipient}><span>{recipient.nombreEmpleado} · {recipient.idEmpleadoCj}{recipient.idCargo ? ` · Cargo ${recipient.idCargo}` : ""}</span><button type="button" onClick={() => addRecipient(recipient.idEmpleadoCj)} style={styles.addButton}>AGREGAR</button></div>)}</div>
      <label>Programar envío<input type="datetime-local" value={form.fechaProgramada} onChange={event => update("fechaProgramada", event.target.value)} style={styles.input} /></label>
      <label>Vencimiento<input type="datetime-local" value={form.fechaVencimiento} onChange={event => update("fechaVencimiento", event.target.value)} style={styles.input} /></label>
      <label>Ruta interna opcional<input placeholder="/modulo/recurso/123" value={form.rutaDestino} onChange={event => update("rutaDestino", event.target.value)} style={styles.input} /></label>
      <label>Id. referencia opcional<input type="number" min="1" value={form.idReferencia} onChange={event => update("idReferencia", event.target.value)} style={styles.input} /></label>
      <label>Tipo referencia<input value={form.tipoReferencia} onChange={event => update("tipoReferencia", event.target.value)} style={styles.input} /></label>
      <label style={styles.full}>Adjunto opcional (PDF, Office, CSV/TXT o imagen; máximo 15 MB)<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp" onChange={event => setAttachment(event.target.files?.[0] ?? null)} style={styles.input} /></label>
      <label style={styles.checkbox}><input type="checkbox" checked={mandatory || form.permiteConfirmacion} disabled={mandatory} onChange={event => update("permiteConfirmacion", event.target.checked)} /> Requiere confirmación {mandatory ? "(obligatoria)" : ""}</label>
      {error && <p style={styles.error}>{error}</p>}{message && <p style={styles.success}>{message}</p>}
      <button disabled={saving} style={styles.button}>{saving ? "PUBLICANDO..." : "PUBLICAR COMUNICACIÓN"}</button>
    </form>
  </main>;
}

const styles: Record<string, React.CSSProperties> = { page: { maxWidth: 920, margin: "0 auto", padding: 28 }, title: { color: "#172554", marginBottom: 6 }, subtitle: { color: "#64748B", marginTop: 0 }, form: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 22 }, full: { gridColumn: "1 / -1", display: "grid", gap: 6, color: "#334155", fontWeight: 700 }, input: { width: "100%", boxSizing: "border-box", border: "1px solid #CBD5E1", borderRadius: 8, padding: 10, marginTop: 6, font: "inherit" }, checkbox: { gridColumn: "1 / -1", color: "#334155" }, button: { gridColumn: "1 / -1", border: 0, borderRadius: 9, background: "#172554", color: "#fff", fontWeight: 800, padding: 13, cursor: "pointer" }, error: { gridColumn: "1 / -1", color: "#B91C1C", margin: 0 }, success: { gridColumn: "1 / -1", color: "#15803D", margin: 0 }, searchRow: { display: "flex", gap: 8, alignItems: "end" }, searchButton: { border: 0, borderRadius: 8, background: "#334155", color: "#fff", fontWeight: 800, padding: "11px 16px", cursor: "pointer", whiteSpace: "nowrap" }, recipient: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 10px", fontWeight: 400 }, addButton: { border: "1px solid #1D4ED8", borderRadius: 7, background: "#EFF6FF", color: "#1D4ED8", fontWeight: 800, padding: "6px 9px", cursor: "pointer" } };
