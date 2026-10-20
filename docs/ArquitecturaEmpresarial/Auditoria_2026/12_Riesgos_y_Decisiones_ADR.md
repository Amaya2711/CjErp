# 12 · Riesgos y Decisiones (ADR propuestos)

## 1. Registro de riesgos

| ID | Riesgo | Evidencia (doc) | Prob. | Impacto | Semáforo | Mitigación |
|---|---|---|---|---|---|---|
| R1 | Acceso a funciones sensibles por cualquier usuario autenticado | SEC-01, ARQ-01 | Alta | Alto | ROJO | Políticas por rol (H1-2) |
| R2 | Credenciales expuestas en repo/historial | SEC-04, ARQ-10 | Alta (si el repo se filtra: PV) | Alto | ROJO | Rotación + purga (H1-1) |
| R3 | IA expone gastos globales / datos a proveedores | IA-01, IA-02 | Media | Alto | ROJO | Scope ON, sandbox, minimización |
| R4 | Despliegue sin pruebas | SEC-19 | Alta | Medio/Alto | ROJO | CI + protección de `main` |
| R5 | Pérdida de datos / sin DR documentado | SQL-08 | Baja/Desconocida | Muy alto | GRIS | Documentar y probar restauración |
| R6 | SQL expuesto sin cifrado | SEC-06, SQL-07 | Desconocida | Alto | GRIS | Verificar valor efectivo; `Encrypt=true` |
| R7 | Duplicidad `Planilla.Correlativo` en escrituras por Correlativo | SQL-03 | Media | Alto | AMARILLO | Revisar las 2 rutas; no cambiar el identificador |
| R8 | Excel como integración (lectura parcial, sin contrato) | doc 07 | Media | Medio | AMARILLO | API + retiro gradual |
| R9 | Sesión/estado en memoria → pérdida en redeploy, no escala | ARQ-02/03 | Alta | Medio | AMARILLO | H2-4 |
| R10 | Migración prematura a Azure | doc 08 | Media | Alto | AMARILLO | Decisión tras costos reales |
| R11 | Sistemas paralelos M365 (datos duplicados) | doc 07 | Media | Medio | GRIS | Gobierno + API única |
| R12 | Dependencia de pocas personas / archivos de 5 000–9 000 líneas | ARQ-07 | Media | Medio | AMARILLO | Pruebas de caracterización + refactor focalizado |

## 2. ADRs propuestos (estado: PROPUESTO, requieren aprobación)

**ADR-001 — El ERP es sistema de registro; acceso externo solo por API.**
Contexto: Power Platform y agentes pueden saltar controles transaccionales. Decisión: prohibir lectura/escritura directa a SQL por externos; cuentas SQL de mínimo privilegio. Consecuencias: requiere API versionada (H2-1). Alternativa descartada: vistas SQL expuestas a Power BI/Power Apps (sin autorización de negocio).

**ADR-002 — Autorización por política en backend como fuente de verdad.**
Decisión: policies (rol, perfil, permiso de acción) evaluadas en API; el frontend solo refleja. Consecuencia: reutilizar `SegPermisoAccion`.

**ADR-003 — Endurecer antes de migrar.**
Decisión: no iniciar migración de hosting hasta cerrar H1 y tener costos reales (doc 08). Alternativa: migrar ya a Azure; descartada por heredar los mismos riesgos.

**ADR-004 — Azure selectivo (Key Vault, Entra ID, Monitor primero).**
Consecuencias: compatibles con Railway/Vercel; reversibles.

**ADR-005 — AI Gateway con permisos heredados y proveedores intercambiables.**
Decisión: toda llamada a LLM pasa por un gateway que audita, limita costo y aplica scope; herramientas = APIs del ERP; operaciones de escritura con aprobación humana. MCP solo como interfaz de herramientas, nunca sustituye autenticación ni contratos. Nota: una suscripción de Claude/Claude Code no equivale a una integración API de producción; verificar licencias, términos y costos.

**ADR-006 — SharePoint = documentos y colaboración; Excel no es mecanismo de integración.**
Mantener Excel solo como salida humana y compatibilidad temporal.

**ADR-007 — No microservicios; separar únicamente el worker de jobs.**

**ADR-008 — Power Apps vs React.** Power Apps para apps departamentales simples y solicitudes sobre API; React dentro del ERP para procesos transaccionales, grillas complejas y reglas de negocio.

**ADR-009 — Power Automate vs Hangfire/.NET/Functions.** Power Automate para flujos de productividad M365 (avisos, carpetas, aprobaciones informales); Hangfire/.NET para jobs del núcleo con reglas de negocio y reintentos; Functions para integraciones server-side que necesiten código y no pertenezcan al ERP.

## 3. Estado
Todos los ADR están en estado PROPUESTO; ninguno ha sido aprobado por la gerencia.
