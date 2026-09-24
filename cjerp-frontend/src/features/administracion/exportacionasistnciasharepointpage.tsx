import { useEffect, useState } from "react";
import AppPage from "../../components/base/AppPage";
import {
  asistenciaSharePointService,
  type AsistenciaSharePointConfig,
  type AsistenciaSharePointLog,
} from "../../api/asistenciaSharePointService";

function todayInputValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function firstDayInputValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function exportacionasistnciasharepointpage() {
  const [config, setConfig] = useState<AsistenciaSharePointConfig | null>(null);
  const [history, setHistory] = useState<AsistenciaSharePointLog[]>([]);
  const [active, setActive] = useState(true);
  const [time, setTime] = useState("02:00");
  const [from, setFrom] = useState(firstDayInputValue);
  const [to, setTo] = useState(todayInputValue);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [configResponse, historyResponse] = await Promise.all([
      asistenciaSharePointService.obtenerConfiguracion(),
      asistenciaSharePointService.obtenerHistorial(),
    ]);
    setConfig(configResponse);
    setHistory(historyResponse);
    setActive(configResponse.activo);
    setTime(configResponse.horaEjecucion || "02:00");
  };

  useEffect(() => {
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "No se pudo cargar la configuración."));
  }, []);

  const saveConfig = async () => {
    setBusy(true);
    try {
      await asistenciaSharePointService.actualizarConfiguracion({ activo: active, horaEjecucion: time });
      setMessage("Configuración guardada y Job reprogramado.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la configuración.");
    } finally {
      setBusy(false);
    }
  };

  const execute = async () => {
    if (!from || !to || from > to) {
      setMessage("El rango de fechas no es válido.");
      return;
    }
    if (!window.confirm(`Se generará Asistencia_${to.replaceAll("-", "")}.json y se reemplazará si ya existe. ¿Desea continuar?`)) return;
    setBusy(true);
    try {
      const result = await asistenciaSharePointService.ejecutar({ fechaInicio: from, fechaFin: to });
      setMessage(`Proceso encolado: ${result.jobId}`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo encolar la exportación.");
    } finally {
      setBusy(false);
    }
  };

  const retry = async (id: number) => {
    setBusy(true);
    try {
      const result = await asistenciaSharePointService.reintentar(id);
      setMessage(`Reintento encolado: ${result.jobId}`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo encolar el reintento.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppPage title="Exportación Asistencia - SharePoint">
      <div style={styles.grid}>
        <section style={styles.section}>
          <h2 style={styles.heading}>Estado del Job</h2>
          <p><strong>Stored Procedure:</strong> sp_asistencia_buscarporfechas_job</p>
          <p><strong>Estado:</strong> {config?.activo ? "ACTIVO" : "INACTIVO"}</p>
          <p><strong>Horario:</strong> {config?.horaEjecucion || "02:00"} - Perú</p>
          <p><strong>Último archivo:</strong> {config?.ultimoArchivo || "Sin ejecuciones"}</p>
          <p><strong>Último resultado:</strong> {config?.ultimoEstado || "Pendiente"}</p>
          <p><strong>Registros:</strong> {config?.ultimaCantidadRegistros ?? 0}</p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>Configuración</h2>
          <label style={styles.label}>
            Job activo
            <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          </label>
          <label style={styles.label}>
            Hora
            <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </label>
          <button type="button" disabled={busy} onClick={() => void saveConfig()} style={styles.button}>Guardar</button>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>Ejecución manual</h2>
          <div style={styles.formRow}>
            <label style={styles.label}>Fecha inicio<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
            <label style={styles.label}>Fecha fin<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          </div>
          <p>Archivo: <strong>Asistencia_{to.replaceAll("-", "") || "yyyyMMdd"}.json</strong></p>
          <button type="button" disabled={busy} onClick={() => void execute()} style={styles.button}>Ejecutar ahora</button>
        </section>
      </div>

      {message && <p role="status" style={styles.message}>{message}</p>}

      <section style={styles.section}>
        <h2 style={styles.heading}>Historial</h2>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Archivo</th><th>Registros</th><th>Estado</th><th>Duración</th><th /></tr></thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.fechaInicioEjecucion).toLocaleString("es-PE")}</td>
                  <td>{item.tipoEjecucion}</td>
                  <td>{item.nombreArchivo}</td>
                  <td>{item.cantidadRegistros}</td>
                  <td>{item.estado}</td>
                  <td>{item.duracionSegundos}s</td>
                  <td>
                    {item.estado === "ERROR" && (
                      <>
                        <span title={item.detalleError || item.mensaje || "Sin detalle"} style={styles.errorDetail}>
                          Ver error
                        </span>
                        <button type="button" onClick={() => void retry(item.id)} disabled={busy} style={styles.linkButton}>Reintentar</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppPage>
  );
}

const styles = {
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 },
  section: { background: "#fff", border: "1px solid #d8dee8", borderRadius: 8, padding: 20, marginBottom: 20 },
  heading: { marginTop: 0, color: "#1f3b57", fontSize: 18 },
  label: { display: "flex", flexDirection: "column" as const, gap: 6, marginBottom: 12, color: "#40566d" },
  formRow: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 },
  button: { background: "#1f6f8b", color: "#fff", border: 0, borderRadius: 6, padding: "9px 14px", cursor: "pointer" },
  linkButton: { background: "transparent", color: "#1f6f8b", border: 0, cursor: "pointer" },
  errorDetail: { color: "#b42318", marginRight: 10, cursor: "help" },
  message: { padding: 12, background: "#eef7f5", border: "1px solid #b5ded5", borderRadius: 6 },
  tableWrap: { overflowX: "auto" as const },
  table: { width: "100%", borderCollapse: "collapse" as const },
};
