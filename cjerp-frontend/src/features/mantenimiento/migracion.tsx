import AppCard from "../../components/base/AppCard";
import AppPage from "../../components/base/AppPage";

export default function MigracionPage() {
  return (
    <AppPage
      title="Migración"
      style={{
        background:
          "radial-gradient(circle at top right, rgba(14, 116, 144, 0.12), transparent 32%), linear-gradient(180deg, #F8FAFC 0%, #ECFEFF 100%)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 0.8fr)",
          gap: 18,
          alignItems: "stretch",
        }}
      >
        <AppCard
          style={{
            marginBottom: 0,
            border: "1px solid rgba(15, 118, 110, 0.12)",
            background: "linear-gradient(180deg, #FFFFFF 0%, #F0FDFA 100%)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: "rgba(13, 148, 136, 0.1)",
                  color: "#0F766E",
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: 0.2,
                }}
              >
                Mantenimiento / Migración
              </div>
              <h2 style={{ margin: "16px 0 8px", fontSize: 28, lineHeight: 1.1 }}>
                Importación de Excel para cargas masivas
              </h2>
            <p style={{ margin: 0, color: "#475569", fontSize: 14, lineHeight: 1.6 }}>
              Esta sección resume las reglas de validación del proceso de migración y actualización del
              archivo Excel del sistema VB .NET 2019.
            </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 12,
              }}
            >
              {[
                { label: "Hoja esperada", value: "GENERAL" },
                { label: "Modo principal", value: "Migrar" },
                { label: "Formato", value: ".xlsx" },
                { label: "Validación", value: "Estructura y filas" },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    borderRadius: 14,
                    padding: 14,
                    background: "#FFFFFF",
                    border: "1px solid #D8E5F2",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6 }}>{item.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div style={{ padding: 14, borderRadius: 14, background: "#F8FAFC", border: "1px solid #D8E5F2", color: "#475569", fontSize: 13, lineHeight: 1.6 }}>
              El importador se mantiene oculto en la navegación visible.
            </div>
          </div>
        </AppCard>

        <AppCard
          style={{
            marginBottom: 0,
            background: "linear-gradient(180deg, #0F172A 0%, #1E293B 100%)",
            color: "#E2E8F0",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: "#7DD3FC" }}>
              Reglas VB
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2 }}>
              Lo que valida el importador
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 10, color: "#CBD5E1" }}>
              <li>La hoja <strong>GENERAL</strong> y los encabezados del formato esperado.</li>
              <li>Las columnas principales para <strong>Migrar</strong> y <strong>Actualizar</strong>.</li>
              <li>Filas vacías, columnas faltantes y diferencias de estructura.</li>
              <li>Un resumen visual antes de enviar cualquier dato al proceso real.</li>
            </ul>
            <div
              style={{
                marginTop: 4,
                padding: 14,
                borderRadius: 14,
                background: "rgba(125, 211, 252, 0.1)",
                border: "1px solid rgba(125, 211, 252, 0.18)",
                color: "#E0F2FE",
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              La pantalla queda lista para evolucionar a importación real si luego quieres conectarla a un
              endpoint del backend.
            </div>
          </div>
        </AppCard>
      </div>
    </AppPage>
  );
}
