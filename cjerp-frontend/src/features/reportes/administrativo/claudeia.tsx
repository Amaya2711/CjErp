import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import AppCard from "../../../components/base/AppCard";
import AppPage from "../../../components/base/AppPage";
import AppStatusMessage from "../../../components/base/AppStatusMessage";

type ModalidadRespuesta = "consulta" | "documento" | "grafico" | "mensaje";

type ClaudeiaForm = {
  storeNombre: string;
  ddl: string;
  parametros: string;
  pregunta: string;
  modalidad: ModalidadRespuesta;
  periodoDefault: string;
};

const FORM_INICIAL: ClaudeiaForm = {
  storeNombre: "sp_NombreDelStore",
  ddl:
    "CREATE TABLE Ventas (VentaID INT, ClienteID INT, FechaVenta DATE, Total DECIMAL(12,2))\nCREATE TABLE Clientes (ClienteID INT, Nombre NVARCHAR(100), Ciudad NVARCHAR(80))\nEXEC sp_VentasPorMes @AÃ±o INT",
  parametros: "@AÃ±o INT",
  pregunta: "Genera un resumen de ventas por mes y devuelve los datos en una tabla.",
  modalidad: "consulta",
  periodoDefault: "ultimos 30 dias",
};

const BASE_PROMPT = `Eres un asistente experto en analisis de datos conectado a una base de datos SQL Server. Tu funcion es ayudar a los usuarios a consultar, analizar y visualizar datos respondiendo preguntas en lenguaje natural.

ANTES DE RESPONDER SIEMPRE DEBES:
1. Leer el store o consulta base indicado por el usuario.
2. Usar exclusivamente el esquema o DDL proporcionado.
3. Si falta el store, el esquema o la pregunta, pedir esa informacion antes de continuar.
4. No asumir tablas, columnas ni relaciones fuera del esquema recibido.
5. Nunca modificar datos: no uses INSERT, UPDATE, DELETE, DROP, ALTER ni instrucciones que cambien la base.
6. Si no se indica periodo, asumir los ultimos 30 dias.
7. Explicar brevemente en lenguaje natural lo encontrado antes de mostrar resultados.
8. Si ocurre un error, sugerir como reformular la pregunta.
9. Nunca inventar datos.

MODALIDADES DE RESPUESTA:
1. CONSULTA DE DATOS: devolver una consulta SQL optimizada para SQL Server y los resultados en tabla. Usa TOP en vez de LIMIT.
2. DOCUMENTO / RESUMEN: redactar un informe estructurado con contexto, hallazgos clave y conclusiones.
3. GRAFICO: devolver los datos estructurados en JSON listo para Chart.js o Recharts, indicando el tipo de grafico y sus etiquetas.

FORMATO DE RESPUESTA OBLIGATORIO:
- Consulta de datos:
{
  "tipo": "consulta",
  "reply": "Explicacion en lenguaje natural del resultado",
  "sql": "SELECT ...",
  "ejecutar": true
}

- Documento:
{
  "tipo": "documento",
  "reply": "Texto completo del informe o analisis",
  "sql": "SELECT ...",
  "ejecutar": true
}

- Grafico:
{
  "tipo": "grafico",
  "reply": "Descripcion de lo que muestra el grafico",
  "sql": "SELECT ...",
  "ejecutar": true,
  "grafico": {
    "tipo": "bar | line | pie | doughnut",
    "titulo": "Titulo del grafico",
    "labelField": "nombre_columna_para_etiquetas",
    "valueField": "nombre_columna_para_valores"
  }
}

- Respuesta conversacional:
{
  "tipo": "mensaje",
  "reply": "Respuesta al usuario",
  "sql": null,
  "ejecutar": false
}

IMPORTANTE PARA ESTA PANTALLA:
- Antes de formular una respuesta, confirma el store exacto que se va a consultar.
- Si el usuario cambia de store, vuelve a leer el nuevo DDL antes de responder.
- El store y el esquema son obligatorios para construir consultas validas.`;

function buildStructuredInput(form: ClaudeiaForm) {
  return {
    asistente: "IA Chat",
    store: {
      nombre: form.storeNombre.trim(),
      ddl: form.ddl.trim(),
      parametros: form.parametros.trim(),
    },
    pregunta: form.pregunta.trim(),
    modalidad: form.modalidad,
    periodoPorDefecto: form.periodoDefault.trim(),
  };
}

function buildPrompt(form: ClaudeiaForm) {
  const storeNombre = form.storeNombre.trim() || "(sin definir)";
  const ddl = form.ddl.trim() || "(sin DDL cargado)";
  const parametros = form.parametros.trim() || "(sin parametros)";
  const pregunta = form.pregunta.trim() || "(sin pregunta)";

  return `${BASE_PROMPT}

CONTEXTO DE LA CONSULTA ACTUAL:
- Store base: ${storeNombre}
- Parametros esperados: ${parametros}
- Periodo por defecto: ${form.periodoDefault.trim() || "ultimos 30 dias"}
- Modalidad solicitada: ${form.modalidad}

ESQUEMA O DDL DEL STORE:
${ddl}

PREGUNTA DEL USUARIO:
${pregunta}

REGLA FINAL:
- Si el store o el DDL no son suficientes para responder, solicita la aclaracion necesaria antes de generar SQL o un resumen.`;
}

function buildResponseTemplate(modalidad: ModalidadRespuesta) {
  if (modalidad === "documento") {
    return {
      tipo: "documento",
      reply: "Texto completo del informe o analisis",
      sql: "SELECT ...",
      ejecutar: true,
    };
  }

  if (modalidad === "grafico") {
    return {
      tipo: "grafico",
      reply: "Descripcion de lo que muestra el grafico",
      sql: "SELECT ...",
      ejecutar: true,
      grafico: {
        tipo: "bar | line | pie | doughnut",
        titulo: "Titulo del grafico",
        labelField: "nombre_columna_para_etiquetas",
        valueField: "nombre_columna_para_valores",
      },
    };
  }

  if (modalidad === "mensaje") {
    return {
      tipo: "mensaje",
      reply: "Respuesta al usuario",
      sql: null,
      ejecutar: false,
    };
  }

  return {
    tipo: "consulta",
    reply: "Explicacion en lenguaje natural del resultado",
    sql: "SELECT ...",
    ejecutar: true,
  };
}

export default function ClaudeiaPage() {
  const [form, setForm] = useState<ClaudeiaForm>(FORM_INICIAL);
  const [copiado, setCopiado] = useState<string | null>(null);

  const promptFinal = useMemo(() => buildPrompt(form), [form]);
  const entradaEstructurada = useMemo(() => JSON.stringify(buildStructuredInput(form), null, 2), [form]);
  const plantillaRespuesta = useMemo(
    () => JSON.stringify(buildResponseTemplate(form.modalidad), null, 2),
    [form.modalidad]
  );

  const updateField = <K extends keyof ClaudeiaForm>(key: K, value: ClaudeiaForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setCopiado(null);
  };

  const copiarTexto = async (texto: string, label: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(label);
    } catch {
      setCopiado("No se pudo copiar");
    }
  };

  const restaurarEjemplo = () => {
    setForm(FORM_INICIAL);
    setCopiado(null);
  };

  const puedeGenerar =
    form.storeNombre.trim().length > 0 && form.ddl.trim().length > 0 && form.pregunta.trim().length > 0;

  return (
    <AppPage
      title="IA Chat"
      actions={
        <div style={styles.headerActions}>
          <span style={styles.badge}>Reportes / Administrativo</span>
          <button type="button" style={styles.secondaryButton} onClick={restaurarEjemplo}>
            Restablecer ejemplo
          </button>
        </div>
      }
      style={styles.page}
    >
      <div style={styles.layout}>
        <div style={styles.mainColumn}>
          <AppStatusMessage tone={puedeGenerar ? "success" : "info"} style={styles.statusBox}>
            {puedeGenerar
              ? "El store, el esquema y la pregunta ya estan listos para generar el prompt."
              : "Completa el nombre del store, el DDL y la pregunta antes de continuar."}
          </AppStatusMessage>

          <AppCard style={styles.card}>
            <div style={styles.sectionHead}>
              <div>
                <h2 style={styles.sectionTitle}>Contexto obligatorio de IA Chat</h2>
                <p style={styles.sectionSubtitle}>
                  La consulta se construye a partir del store seleccionado y el esquema que pegues aqui.
                </p>
              </div>
            </div>

            <div style={styles.fieldGrid}>
              <label style={styles.field}>
                <span style={styles.label}>Store / consulta base</span>
                <input
                  value={form.storeNombre}
                  onChange={(event) => updateField("storeNombre", event.target.value)}
                  placeholder="sp_Planilla_Consulta_Aprobar"
                  style={styles.input}
                />
              </label>

              <label style={styles.field}>
                <span style={styles.label}>Modalidad de respuesta</span>
                <select
                  value={form.modalidad}
                  onChange={(event) => updateField("modalidad", event.target.value as ModalidadRespuesta)}
                  style={styles.input}
                >
                  <option value="consulta">Consulta de datos</option>
                  <option value="documento">Documento / resumen</option>
                  <option value="grafico">Grafico</option>
                  <option value="mensaje">Conversacional</option>
                </select>
              </label>

              <label style={styles.field}>
                <span style={styles.label}>Periodo por defecto</span>
                <input
                  value={form.periodoDefault}
                  onChange={(event) => updateField("periodoDefault", event.target.value)}
                  placeholder="ultimos 30 dias"
                  style={styles.input}
                />
              </label>

              <label style={styles.field}>
                <span style={styles.label}>Parametros esperados del store</span>
                <input
                  value={form.parametros}
                  onChange={(event) => updateField("parametros", event.target.value)}
                  placeholder="@FechaInicio DATE, @FechaFin DATE"
                  style={styles.input}
                />
              </label>
            </div>

            <label style={styles.fieldBlock}>
              <span style={styles.label}>Esquema / DDL</span>
              <textarea
                value={form.ddl}
                onChange={(event) => updateField("ddl", event.target.value)}
                rows={12}
                placeholder="Pega aqui el DDL de las tablas o la definicion del store."
                style={styles.textarea}
              />
            </label>
          </AppCard>

          <AppCard style={styles.card}>
            <div style={styles.sectionHead}>
              <div>
                <h2 style={styles.sectionTitle}>Pregunta del usuario</h2>
                <p style={styles.sectionSubtitle}>
                  Escribe la consulta en lenguaje natural. Si no indicas periodo, se asumiran los ultimos 30 dias.
                </p>
              </div>
            </div>

            <label style={styles.fieldBlock}>
              <span style={styles.label}>Que necesitas consultar?</span>
              <textarea
                value={form.pregunta}
                onChange={(event) => updateField("pregunta", event.target.value)}
                rows={8}
                placeholder="Ejemplo: mostrar ventas por mes del ultimo trimestre."
                style={styles.textarea}
              />
            </label>

            <div style={styles.buttonRow}>
              <button
                type="button"
                style={{ ...styles.primaryButton, ...(puedeGenerar ? {} : styles.primaryButtonDisabled) }}
                onClick={() => copiarTexto(promptFinal, "Prompt copiado")}
                disabled={!puedeGenerar}
              >
                Copiar prompt final
              </button>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => copiarTexto(entradaEstructurada, "JSON copiado")}
              >
                Copiar JSON de entrada
              </button>
            </div>

            {copiado ? <div style={styles.copiedNote}>{copiado}</div> : null}
          </AppCard>
        </div>

        <div style={styles.sideColumn}>
          <AppCard style={styles.cardSticky}>
            <div style={styles.sectionHead}>
              <div>
                <h2 style={styles.sectionTitle}>Prompt preparado</h2>
                <p style={styles.sectionSubtitle}>
                  Este es el texto que debes enviar al asistente con el store y el esquema ya cargados.
                </p>
              </div>
            </div>

            <textarea readOnly value={promptFinal} rows={22} style={styles.readOnlyTextarea} />
          </AppCard>

          <AppCard style={styles.card}>
            <div style={styles.sectionHead}>
              <div>
                <h2 style={styles.sectionTitle}>JSON de entrada</h2>
                <p style={styles.sectionSubtitle}>
                  Estructura recomendada para pasar la consulta al motor o al backend.
                </p>
              </div>
            </div>

            <textarea readOnly value={entradaEstructurada} rows={14} style={styles.codeTextarea} />
          </AppCard>

          <AppCard style={styles.card}>
            <div style={styles.sectionHead}>
              <div>
                <h2 style={styles.sectionTitle}>Plantilla de respuesta</h2>
                <p style={styles.sectionSubtitle}>
                  El formato cambia segun la modalidad seleccionada.
                </p>
              </div>
            </div>

            <textarea readOnly value={plantillaRespuesta} rows={12} style={styles.codeTextarea} />
          </AppCard>
        </div>
      </div>
    </AppPage>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    background:
      "radial-gradient(circle at top left, rgba(109, 40, 217, 0.08), transparent 30%), linear-gradient(180deg, #F8FAFC 0%, #EEF2FF 100%)",
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    background: "#EDE9FE",
    color: "#6D28D9",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.2,
  },
  secondaryButton: {
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#0F172A",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  primaryButton: {
    border: "1px solid #7C3AED",
    background: "#7C3AED",
    color: "#FFFFFF",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  primaryButtonDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 0.9fr)",
    gap: 18,
    alignItems: "start",
  },
  mainColumn: {
    display: "grid",
    gap: 18,
  },
  sideColumn: {
    display: "grid",
    gap: 18,
  },
  statusBox: {
    marginBottom: 0,
  },
  card: {
    marginBottom: 0,
  },
  cardSticky: {
    marginBottom: 0,
    position: "sticky",
    top: 18,
  },
  sectionHead: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 16,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 900,
    color: "#0F172A",
  },
  sectionSubtitle: {
    margin: "6px 0 0",
    fontSize: 13,
    color: "#475569",
    lineHeight: 1.5,
  },
  fieldGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14,
    marginBottom: 16,
  },
  field: {
    display: "grid",
    gap: 8,
  },
  fieldBlock: {
    display: "grid",
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: 800,
    color: "#334155",
  },
  input: {
    width: "100%",
    minHeight: 44,
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    padding: "10px 12px",
    fontSize: 13,
    color: "#0F172A",
    background: "#FFFFFF",
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    borderRadius: 12,
    border: "1px solid #CBD5E1",
    padding: "12px 14px",
    fontSize: 13,
    lineHeight: 1.6,
    color: "#0F172A",
    resize: "vertical",
    boxSizing: "border-box",
    background: "#FFFFFF",
    fontFamily: "inherit",
    minHeight: 160,
  },
  readOnlyTextarea: {
    width: "100%",
    borderRadius: 12,
    border: "1px solid #E2E8F0",
    padding: "12px 14px",
    fontSize: 12,
    lineHeight: 1.6,
    color: "#1E293B",
    resize: "vertical",
    boxSizing: "border-box",
    background: "#F8FAFC",
    fontFamily: "Consolas, monospace",
    minHeight: 320,
  },
  codeTextarea: {
    width: "100%",
    borderRadius: 12,
    border: "1px solid #E2E8F0",
    padding: "12px 14px",
    fontSize: 12,
    lineHeight: 1.6,
    color: "#1E293B",
    resize: "vertical",
    boxSizing: "border-box",
    background: "#F8FAFC",
    fontFamily: "Consolas, monospace",
    minHeight: 220,
  },
  buttonRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 14,
  },
  copiedNote: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: 700,
    color: "#059669",
  },
};
