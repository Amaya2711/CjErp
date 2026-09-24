import { useCallback, useEffect, useState } from "react";
import httpClient from "../../api/httpClient";

type Monitor = { totalComunicaciones: number; destinatarios: number; noLeidas: number; confirmadas: number; obligatoriasPendientes: number; dispositivosActivos: number; pushEnviados24Horas: number; pushErrores24Horas: number };
type Delivery = { idEmpleadoCj: number; nombreEmpleado: string; leido: boolean; fechaLectura?: string | null; confirmado: boolean; fechaConfirmacion?: string | null; tieneDispositivoActivo: boolean; ultimoPushEstado?: string | null; ultimoPushTipo?: string | null; fechaUltimoPush?: string | null; codigoUltimoPush?: string | null };
type Device = { idDispositivo: number; idEmpleadoCj: number; nombreEmpleado: string; idUsuario: string; plataforma: string; modelo?: string | null; versionSistema?: string | null; versionApp?: string | null; fechaRegistro: string; fechaUltimoAcceso: string; activo: boolean };

const cards: Array<{ key: keyof Monitor; label: string; tone: string }> = [
  { key: "totalComunicaciones", label: "Comunicaciones activas", tone: "#172554" },
  { key: "destinatarios", label: "Destinatarios", tone: "#1D4ED8" },
  { key: "noLeidas", label: "No leídas", tone: "#B45309" },
  { key: "confirmadas", label: "Confirmadas", tone: "#15803D" },
  { key: "obligatoriasPendientes", label: "Obligatorias pendientes", tone: "#B91C1C" },
  { key: "dispositivosActivos", label: "Dispositivos activos", tone: "#0F766E" },
  { key: "pushEnviados24Horas", label: "Push enviados · 24 h", tone: "#4338CA" },
  { key: "pushErrores24Horas", label: "Errores push · 24 h", tone: "#BE123C" },
];

export default function MobileCommunicationMonitorPage() {
  const [data, setData] = useState<Monitor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [communicationId, setCommunicationId] = useState("");
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState("");
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesError, setDevicesError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await httpClient.get<Monitor>("/mobile/admin/monitor")); }
    catch { setError("No tiene permiso o no fue posible cargar el monitor."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const loadTracking = async () => {
    const id = Number(communicationId);
    if (!Number.isInteger(id) || id <= 0) { setTrackingError("Ingrese un Id de comunicación válido."); return; }
    setTrackingLoading(true); setTrackingError(""); setDeliveries([]);
    try { setDeliveries(await httpClient.get<Delivery[]>(`/mobile/admin/comunicaciones/${id}/seguimiento`)); }
    catch { setTrackingError("No fue posible consultar el seguimiento de esta comunicación."); }
    finally { setTrackingLoading(false); }
  };
  const loadDevices = async () => {
    setDevicesLoading(true); setDevicesError("");
    try { setDevices(await httpClient.get<Device[]>("/mobile/admin/dispositivos?soloActivos=false&maximo=100")); }
    catch { setDevicesError("No fue posible consultar los dispositivos."); }
    finally { setDevicesLoading(false); }
  };
  return <main style={{ padding: 28, maxWidth: 1200, margin: "0 auto" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start", marginBottom: 24 }}><div><h1 style={{ margin: 0, color: "#172554" }}>Monitor de comunicaciones móviles</h1><p style={{ color: "#64748B" }}>Estado operativo de lectura, confirmación, dispositivos y despacho push.</p></div><button onClick={() => void load()} disabled={loading} style={button}>{loading ? "ACTUALIZANDO..." : "ACTUALIZAR"}</button></div>
    {error && <div style={{ background: "#FEF2F2", borderRadius: 10, color: "#B91C1C", padding: 16 }}>{error}</div>}
    {data && <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>{cards.map(card => <article key={card.key} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 18, borderTop: `4px solid ${card.tone}` }}><div style={{ color: "#64748B", fontSize: 14 }}>{card.label}</div><div style={{ color: card.tone, fontSize: 30, fontWeight: 800, marginTop: 8 }}>{data[card.key].toLocaleString()}</div></article>)}</section>}
    <section style={trackingPanel}><h2 style={{ marginTop: 0, color: "#172554" }}>Seguimiento por comunicación</h2><p style={{ color: "#64748B" }}>Auditoría de destinatarios, lectura, confirmación, dispositivo y último resultado push. Los tokens no se muestran.</p><div style={{ display: "flex", gap: 10, maxWidth: 460 }}><input type="number" min="1" placeholder="Id de comunicación" value={communicationId} onChange={event => setCommunicationId(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void loadTracking(); }} style={input} /><button onClick={() => void loadTracking()} disabled={trackingLoading} style={button}>{trackingLoading ? "CONSULTANDO..." : "CONSULTAR"}</button></div>{trackingError && <p style={{ color: "#B91C1C" }}>{trackingError}</p>}{deliveries.length > 0 && <div style={{ overflowX: "auto", marginTop: 18 }}><table style={table}><thead><tr><th style={cell}>Empleado CJ</th><th style={cell}>Lectura</th><th style={cell}>Confirmación</th><th style={cell}>Dispositivo</th><th style={cell}>Último push</th></tr></thead><tbody>{deliveries.map(row => <tr key={row.idEmpleadoCj}><td style={cell}>{row.nombreEmpleado}<br /><small>{row.idEmpleadoCj}</small></td><td style={cell}>{row.leido ? formatDate(row.fechaLectura) : "Pendiente"}</td><td style={cell}>{row.confirmado ? formatDate(row.fechaConfirmacion) : "Pendiente"}</td><td style={cell}>{row.tieneDispositivoActivo ? "Activo" : "Sin activo"}</td><td style={cell}>{row.ultimoPushEstado ?? "Sin intento"}{row.ultimoPushTipo ? ` · ${row.ultimoPushTipo}` : ""}{row.codigoUltimoPush ? <><br /><small>{row.codigoUltimoPush}</small></> : null}</td></tr>)}</tbody></table></div>}{!trackingLoading && !trackingError && communicationId && deliveries.length === 0 && <p style={{ color: "#64748B" }}>Sin destinatarios o sin resultados para esta comunicación.</p>}</section>
    <section style={trackingPanel}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}><div><h2 style={{ margin: 0, color: "#172554" }}>Dispositivos registrados</h2><p style={{ color: "#64748B" }}>Inventario administrativo sin tokens ni identificadores del equipo.</p></div><button onClick={() => void loadDevices()} disabled={devicesLoading} style={button}>{devicesLoading ? "CARGANDO..." : "VER DISPOSITIVOS"}</button></div>{devicesError && <p style={{ color: "#B91C1C" }}>{devicesError}</p>}{devices.length > 0 && <div style={{ overflowX: "auto", marginTop: 18 }}><table style={table}><thead><tr><th style={cell}>Empleado CJ</th><th style={cell}>Plataforma</th><th style={cell}>Aplicación</th><th style={cell}>Último acceso</th><th style={cell}>Estado</th></tr></thead><tbody>{devices.map(device => <tr key={device.idDispositivo}><td style={cell}>{device.nombreEmpleado}<br /><small>{device.idEmpleadoCj} · {device.idUsuario}</small></td><td style={cell}>{device.plataforma}{device.modelo ? ` · ${device.modelo}` : ""}<br /><small>{device.versionSistema ?? "Sin versión"}</small></td><td style={cell}>{device.versionApp ?? "Sin versión"}</td><td style={cell}>{formatDate(device.fechaUltimoAcceso)}</td><td style={cell}>{device.activo ? "Activo" : "Inactivo"}</td></tr>)}</tbody></table></div>}{!devicesLoading && !devicesError && devices.length === 0 && <p style={{ color: "#64748B" }}>Pulse “VER DISPOSITIVOS” para consultar el inventario.</p>}</section>
    {!data && loading && <p style={{ color: "#64748B" }}>Cargando indicadores…</p>}
  </main>;
}

const button: React.CSSProperties = { border: 0, borderRadius: 8, background: "#172554", color: "#fff", fontWeight: 800, padding: "11px 16px", cursor: "pointer" };
const trackingPanel: React.CSSProperties = { marginTop: 24, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 20 };
const input: React.CSSProperties = { flex: 1, minWidth: 0, border: "1px solid #CBD5E1", borderRadius: 8, padding: "10px 12px", font: "inherit" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 750 };
const cell: React.CSSProperties = { textAlign: "left", padding: 10, borderBottom: "1px solid #E2E8F0", verticalAlign: "top" };
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString() : "Sí";
