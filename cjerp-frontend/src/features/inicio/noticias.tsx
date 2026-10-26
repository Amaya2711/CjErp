import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import AppPage from "../../components/base/AppPage";
import AppCard from "../../components/base/AppCard";
import AppStatusMessage from "../../components/base/AppStatusMessage";
import { obtenerNoticiasGerenciales, type NoticiasGerenciales } from "../../api/noticiasService";
import { getHttpErrorMessage } from "../../utils/httpError";

const styles: Record<string, CSSProperties> = {
  boton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    border: "1px solid #CBD5E1",
    borderRadius: 8,
    background: "#FFFFFF",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    color: "#334155",
  },
  resumen: { fontSize: 14, lineHeight: 1.7, color: "#0F172A", margin: 0 },
  subtitulo: { fontSize: 12, fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5, margin: "14px 0 6px" },
  lista: { margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: "#334155" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 16 },
  seccionTitulo: { margin: 0, fontSize: 16, fontWeight: 800, color: "#0F172A" },
  seccionDesc: { margin: "2px 0 12px", fontSize: 12, color: "#64748B" },
  noticia: { display: "block", padding: "10px 0", borderTop: "1px solid #E5E7EB", textDecoration: "none" },
  noticiaTitulo: { fontSize: 14, fontWeight: 700, color: "#1D4ED8", lineHeight: 1.4 },
  noticiaMeta: { marginTop: 3, fontSize: 12, color: "#64748B", display: "flex", gap: 6, alignItems: "center" },
};

function formatearFecha(iso: string | null): string {
  if (!iso) return "";
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime())
    ? ""
    : fecha.toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });
}

export default function NoticiasGerencialesPage() {
  const [reporte, setReporte] = useState<NoticiasGerenciales | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async (actualizar: boolean) => {
    setLoading(true);
    setError("");
    try {
      setReporte(await obtenerNoticiasGerenciales(actualizar));
    } catch (loadError) {
      setError(getHttpErrorMessage(loadError, "No se pudo cargar el reporte de noticias."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar(false);
  }, [cargar]);

  const sinNoticias = reporte != null && reporte.secciones.every((s) => s.noticias.length === 0);

  return (
    <AppPage
      title="Noticias gerenciales"
      actions={
        <button type="button" style={styles.boton} disabled={loading} onClick={() => void cargar(true)} title="Volver a generar el reporte">
          <RefreshCw size={16} />
          Actualizar
        </button>
      }
    >
      {error && <AppStatusMessage tone="error">{error}</AppStatusMessage>}
      {loading && <AppStatusMessage>Generando reporte del día...</AppStatusMessage>}
      {!loading && sinNoticias && (
        <AppStatusMessage tone="info">No se encontraron noticias en este momento. Intente actualizar más tarde.</AppStatusMessage>
      )}

      {!loading && reporte && !sinNoticias && (
        <div style={{ display: "grid", gap: 16 }}>
          <AppCard>
            <h2 style={styles.seccionTitulo}>Resumen ejecutivo - {reporte.fecha}</h2>
            <p style={styles.seccionDesc}>
              Rubro: infraestructura y soluciones integrales de telecomunicaciones. Generado el{" "}
              {new Date(reporte.generadoUtc).toLocaleString("es-PE", { timeZone: "America/Lima" })}.
            </p>
            {reporte.resumenEjecutivo ? (
              <>
                <p style={styles.resumen}>{reporte.resumenEjecutivo}</p>
                {reporte.implicancias.length > 0 && (
                  <>
                    <div style={styles.subtitulo}>Implicancias para CJ Telecom</div>
                    <ul style={styles.lista}>
                      {reporte.implicancias.map((texto) => (
                        <li key={texto}>{texto}</li>
                      ))}
                    </ul>
                  </>
                )}
                <div style={{ ...styles.noticiaMeta, marginTop: 10 }}>Resumen redactado por IA a partir de los titulares listados abajo; verifique en la fuente antes de decidir.</div>
              </>
            ) : (
              <p style={styles.resumen}>Resumen por IA no disponible: se muestran los titulares del día.</p>
            )}
          </AppCard>

          <div style={styles.grid}>
            {reporte.secciones.map((seccion) => (
              <AppCard key={seccion.clave}>
                <h3 style={styles.seccionTitulo}>{seccion.titulo}</h3>
                <p style={styles.seccionDesc}>{seccion.descripcion}</p>
                {seccion.noticias.length === 0 ? (
                  <div style={styles.noticiaMeta}>Sin noticias recientes.</div>
                ) : (
                  seccion.noticias.map((noticia) => (
                    <a key={noticia.url} href={noticia.url} target="_blank" rel="noopener noreferrer" style={styles.noticia}>
                      <div style={styles.noticiaTitulo}>{noticia.titulo}</div>
                      <div style={styles.noticiaMeta}>
                        <span>{noticia.fuente}</span>
                        {noticia.fechaPublicacion && <span>· {formatearFecha(noticia.fechaPublicacion)}</span>}
                        <ExternalLink size={12} />
                      </div>
                    </a>
                  ))
                )}
              </AppCard>
            ))}
          </div>
        </div>
      )}
    </AppPage>
  );
}
