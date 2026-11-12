import { useCallback, useEffect, useState } from "react";
import {
  empleadosListaSharePointService,
  type EmpleadosListaSharePointConfig,
  type EmpleadosListaSharePointLog,
} from "../../api/empleadosListaSharePointService";
import { getHttpErrorMessage } from "../../utils/httpError";

/** Pestaña del job que sincroniza la lista M_EMPLEADOS de SharePoint con dbo.sp_Consultar_EmpleadoSharepoint. */
export default function EmpleadosListaJobPanel() {
  const [config, setConfig] = useState<EmpleadosListaSharePointConfig | null>(null);
  const [history, setHistory] = useState<EmpleadosListaSharePointLog[]>([]);
  const [active, setActive] = useState(false);
  const [time, setTime] = useState("04:00");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const applyData = useCallback((configResponse: EmpleadosListaSharePointConfig, historyResponse: EmpleadosListaSharePointLog[]) => {
    setConfig(configResponse);
    setHistory(historyResponse);
    setActive(configResponse.activo);
    setTime(configResponse.horaEjecucion || "04:00");
  }, []);

  const reload = useCallback(async () => {
    const [configResponse, historyResponse] = await Promise.all([
      empleadosListaSharePointService.obtenerConfiguracion(),
      empleadosListaSharePointService.obtenerHistorial(),
    ]);
    applyData(configResponse, historyResponse);
  }, [applyData]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([empleadosListaSharePointService.obtenerConfiguracion(), empleadosListaSharePointService.obtenerHistorial()])
      .then(([configResponse, historyResponse]) => {
        if (!cancelled) applyData(configResponse, historyResponse);
      })
      .catch((error) => {
        if (!cancelled) setMessage(getHttpErrorMessage(error, "No se pudo cargar la configuración del job."));
      });
    return () => {
      cancelled = true;
    };
  }, [applyData]);

  const saveConfig = async () => {
    setBusy(true);
    try {
      await empleadosListaSharePointService.actualizarConfiguracion({ activo: active, horaEjecucion: time });
      setMessage(active ? "Configuración guardada. El Job se ejecutará todos los días a la hora programada." : "Configuración guardada. El Job quedó inactivo.");
      await reload();
    } catch (error) {
      setMessage(getHttpErrorMessage(error, "No se pudo guardar la configuración."));
    } finally {
      setBusy(false);
    }
  };

  const execute = async () => {
    if (
      !window.confirm(
        `Se validarán todos los empleados contra la lista ${config?.lista || "M_EMPLEADOS"} de SharePoint: se agregarán los que falten y se modificarán solo los campos distintos. No se elimina ningún registro. ¿Desea continuar?`,
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const result = await empleadosListaSharePointService.ejecutar();
      const previousTop = history[0]?.id ?? 0;
      setMessage(`Proceso encolado (${result.jobId}). Esperando que el servidor lo ejecute…`);
      // El job corre en segundo plano: se consulta el historial hasta que aparezca la ejecución nueva.
      // Con cientos de empleados nuevos la primera corrida tarda varios minutos (un POST por empleado): se espera hasta 10 min.
      for (let attempt = 0; attempt < 200; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const [configResponse, historyResponse] = await Promise.all([
          empleadosListaSharePointService.obtenerConfiguracion(),
          empleadosListaSharePointService.obtenerHistorial(),
        ]);
        applyData(configResponse, historyResponse);
        const latest = historyResponse[0];
        if (latest && latest.id > previousTop && latest.estado === "INICIADO") {
          setMessage(`Sincronización en curso (${Math.round(((attempt + 1) * 3))} s)… puede tardar varios minutos; no cierre esta pantalla.`);
        }
        if (latest && latest.id > previousTop && latest.estado !== "INICIADO") {
          setMessage(
            `Ejecución ${latest.estado}: ${latest.mensaje || "sin detalle"}${latest.detalleError ? ` — Detalle: ${latest.detalleError}` : ""}`,
          );
          return;
        }
      }
      setMessage(
        `El job ${result.jobId} sigue sin terminar tras 10 min. Pulse "Actualizar" más tarde; si queda en INICIADO, revise que la API siga activa y sus logs.`,
      );
    } catch (error) {
      setMessage(getHttpErrorMessage(error, "No se pudo encolar la sincronización."));
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    try {
      await reload();
      setMessage("Historial actualizado.");
    } catch (error) {
      setMessage(getHttpErrorMessage(error, "No se pudo actualizar."));
    }
  };

  const retry = async (id: number) => {
    setBusy(true);
    try {
      const result = await empleadosListaSharePointService.reintentar(id);
      setMessage(`Reintento encolado: ${result.jobId}`);
      await reload();
    } catch (error) {
      setMessage(getHttpErrorMessage(error, "No se pudo encolar el reintento."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div style={styles.grid}>
        <section style={styles.section}>
          <h2 style={styles.heading}>Estado del Job</h2>
          <p><strong>Origen:</strong> {config?.origen || "sp_Consultar_EmpleadoSharepoint"}</p>
          <p><strong>Destino:</strong> Lista SharePoint {config?.lista || "M_EMPLEADOS"} (sitio CJ-TELECOM)</p>
          <p><strong>Columna clave:</strong> {config?.columnaClave || "-"}</p>
          <p><strong>Estado:</strong> {config?.activo ? "ACTIVO" : "INACTIVO"}</p>
          <p><strong>Horario:</strong> {config?.horaEjecucion || "04:00"} - Perú (diario)</p>
          <p><strong>Último resultado:</strong> {config?.ultimoEstado || "Pendiente"}</p>
          <p>
            <strong>Último envío:</strong> {config?.ultimaCantidadRegistros ?? 0} empleados · {config?.ultimaCantidadCreados ?? 0} nuevos ·{" "}
            {config?.ultimaCantidadActualizados ?? 0} modificados
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>Configuración</h2>
          <label style={styles.checkLabel}>
            <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
            Job activo (ejecución diaria)
          </label>
          <label style={styles.label}>
            Hora
            <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </label>
          <button type="button" disabled={busy} onClick={() => void saveConfig()} style={styles.button}>Guardar</button>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>Ejecución manual</h2>
          <p>
            Compara cada empleado con la lista <strong>{config?.lista || "M_EMPLEADOS"}</strong>: si no existe lo agrega; si existe y algún
            campo cambió, modifica solo ese campo. Nunca elimina ni recrea registros. Si el SP no devuelve filas, la lista no se modifica.
          </p>
          <button type="button" disabled={busy} onClick={() => void execute()} style={styles.button}>Ejecutar ahora</button>
        </section>
      </div>

      {message && <p role="status" style={styles.message}>{message}</p>}

      <section style={styles.section}>
        <h2 style={styles.heading}>
          Historial{" "}
          <button type="button" onClick={() => void refresh()} style={styles.linkButton}>Actualizar</button>
        </h2>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th>Fecha</th><th>Tipo</th><th>Empleados</th><th>Nuevos</th><th>Modificados</th><th>Sin cambios</th>
                <th>Estado</th><th>Duración</th><th>Usuario</th><th />
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.fechaInicioEjecucion).toLocaleString("es-PE")}</td>
                  <td>{item.tipoEjecucion}</td>
                  <td>{item.cantidadRegistros}</td>
                  <td>{item.cantidadCreados}</td>
                  <td>{item.cantidadActualizados}</td>
                  <td>{item.cantidadSinCambios}</td>
                  <td title={item.mensaje || undefined}>{item.estado}</td>
                  <td>{item.duracionSegundos}s</td>
                  <td>{item.usuario || "-"}</td>
                  <td>
                    {(item.estado === "ERROR" || item.estado === "CON_ERRORES") && (
                      <span title={item.detalleError || item.mensaje || "Sin detalle"} style={styles.errorDetail}>
                        Ver error
                      </span>
                    )}
                    {item.estado === "ERROR" && (
                      <button type="button" onClick={() => void retry(item.id)} disabled={busy} style={styles.linkButton}>Reintentar</button>
                    )}
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan={10} style={styles.empty}>Sin ejecuciones registradas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

const styles = {
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 },
  section: { background: "#fff", border: "1px solid #d8dee8", borderRadius: 8, padding: 20, marginBottom: 20 },
  heading: { marginTop: 0, color: "#1f3b57", fontSize: 18 },
  label: { display: "flex", flexDirection: "column" as const, gap: 6, marginBottom: 12, color: "#40566d" },
  checkLabel: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12, color: "#40566d" },
  button: { background: "#1f6f8b", color: "#fff", border: 0, borderRadius: 6, padding: "9px 14px", cursor: "pointer" },
  linkButton: { background: "transparent", color: "#1f6f8b", border: 0, cursor: "pointer" },
  errorDetail: { color: "#b42318", marginRight: 10, cursor: "help" },
  message: { padding: 12, background: "#eef7f5", border: "1px solid #b5ded5", borderRadius: 6 },
  tableWrap: { overflowX: "auto" as const },
  table: { width: "100%", borderCollapse: "collapse" as const },
  empty: { textAlign: "center" as const, color: "#64748b", padding: 16 },
};
