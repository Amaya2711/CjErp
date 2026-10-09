import { useCallback, useEffect, useState } from "react";
import {
  gastosExcelSharePointService,
  type GastosExcelSharePointConfig,
  type GastosExcelSharePointLog,
} from "../../api/gastosExcelSharePointService";
import { getHttpErrorMessage } from "../../utils/httpError";

/** Pestaña del job que actualiza la tabla de gastos (TBL_GASTOS) del Excel GASTOS.xlsx en SharePoint. */
export default function GastosExcelJobPanel() {
  const [config, setConfig] = useState<GastosExcelSharePointConfig | null>(null);
  const [history, setHistory] = useState<GastosExcelSharePointLog[]>([]);
  const [time, setTime] = useState("03:00");
  const [idCliente, setIdCliente] = useState("4");
  const [estadoPlanilla, setEstadoPlanilla] = useState("4");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const applyData = useCallback((configResponse: GastosExcelSharePointConfig, historyResponse: GastosExcelSharePointLog[]) => {
    setConfig(configResponse);
    setHistory(historyResponse);
    setTime(configResponse.horaEjecucion || "03:00");
    setIdCliente(String(configResponse.idCliente ?? 4));
    setEstadoPlanilla(String(configResponse.estadoPlanilla ?? 4));
  }, []);

  const reload = useCallback(async () => {
    const [configResponse, historyResponse] = await Promise.all([
      gastosExcelSharePointService.obtenerConfiguracion(),
      gastosExcelSharePointService.obtenerHistorial(),
    ]);
    applyData(configResponse, historyResponse);
  }, [applyData]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([gastosExcelSharePointService.obtenerConfiguracion(), gastosExcelSharePointService.obtenerHistorial()])
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
    const cliente = Number(idCliente);
    const estado = Number(estadoPlanilla);
    if (!Number.isInteger(cliente) || cliente <= 0 || !Number.isInteger(estado) || estado < 0) {
      setMessage("El cliente y el estado de planilla deben ser números válidos.");
      return;
    }

    setBusy(true);
    try {
      await gastosExcelSharePointService.actualizarConfiguracion({
        activo: true,
        horaEjecucion: time,
        idCliente: cliente,
        estadoPlanilla: estado,
      });
      setMessage("Configuración guardada. El Job se ejecutará automáticamente en la hora programada.");
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
        `Se limpiará y reescribirá la tabla ${config?.tabla || "TBL_GASTOS"} del archivo ${config?.archivo || "GASTOS.xlsx"} en SharePoint. ¿Desea continuar?`,
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const result = await gastosExcelSharePointService.ejecutar();
      setMessage(`Proceso encolado: ${result.jobId}`);
      await reload();
    } catch (error) {
      setMessage(getHttpErrorMessage(error, "No se pudo encolar la actualización."));
    } finally {
      setBusy(false);
    }
  };

  const retry = async (id: number) => {
    setBusy(true);
    try {
      const result = await gastosExcelSharePointService.reintentar(id);
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
          <p><strong>Archivo:</strong> {config?.archivo || "GASTOS.xlsx"}</p>
          <p><strong>Tabla:</strong> {config?.tabla || "TBL_GASTOS"}</p>
          <p><strong>Estado:</strong> {config?.activo ? "ACTIVO" : "INACTIVO"}</p>
          <p><strong>Horario:</strong> {config?.horaEjecucion || "03:00"} - Perú</p>
          <p><strong>Origen:</strong> Planilla · cliente {config?.idCliente ?? 4} · estado {config?.estadoPlanilla ?? 4}</p>
          <p><strong>Último resultado:</strong> {config?.ultimoEstado || "Pendiente"}</p>
          <p><strong>Registros:</strong> {config?.ultimaCantidadRegistros ?? 0}</p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>Configuración</h2>
          <label style={styles.label}>
            Hora
            <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </label>
          <div style={styles.formRow}>
            <label style={styles.label}>
              Cliente (IdCliente)
              <input type="number" min={1} value={idCliente} onChange={(event) => setIdCliente(event.target.value)} />
            </label>
            <label style={styles.label}>
              Estado de planilla
              <input type="number" min={0} value={estadoPlanilla} onChange={(event) => setEstadoPlanilla(event.target.value)} />
            </label>
          </div>
          <button type="button" disabled={busy} onClick={() => void saveConfig()} style={styles.button}>Guardar</button>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>Ejecución manual</h2>
          <p>
            Reemplaza el contenido de <strong>{config?.tabla || "TBL_GASTOS"}</strong> en <strong>{config?.archivo || "GASTOS.xlsx"}</strong> con
            los gastos actuales de Planilla. Si la consulta no devuelve filas, el Excel no se modifica.
          </p>
          <button type="button" disabled={busy} onClick={() => void execute()} style={styles.button}>Ejecutar ahora</button>
        </section>
      </div>

      {message && <p role="status" style={styles.message}>{message}</p>}

      <section style={styles.section}>
        <h2 style={styles.heading}>Historial</h2>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr><th>Fecha</th><th>Tipo</th><th>Cliente / Estado</th><th>Registros</th><th>Estado</th><th>Duración</th><th>Usuario</th><th /></tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.fechaInicioEjecucion).toLocaleString("es-PE")}</td>
                  <td>{item.tipoEjecucion}</td>
                  <td>{item.idCliente} / {item.estadoPlanilla}</td>
                  <td>{item.cantidadRegistros}</td>
                  <td title={item.mensaje || undefined}>{item.estado}</td>
                  <td>{item.duracionSegundos}s</td>
                  <td>{item.usuario || "-"}</td>
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
              {history.length === 0 && (
                <tr><td colSpan={8} style={styles.empty}>Sin ejecuciones registradas.</td></tr>
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
  formRow: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 },
  button: { background: "#1f6f8b", color: "#fff", border: 0, borderRadius: 6, padding: "9px 14px", cursor: "pointer" },
  linkButton: { background: "transparent", color: "#1f6f8b", border: 0, cursor: "pointer" },
  errorDetail: { color: "#b42318", marginRight: 10, cursor: "help" },
  message: { padding: 12, background: "#eef7f5", border: "1px solid #b5ded5", borderRadius: 6 },
  tableWrap: { overflowX: "auto" as const },
  table: { width: "100%", borderCollapse: "collapse" as const },
  empty: { textAlign: "center" as const, color: "#64748b", padding: 16 },
};
