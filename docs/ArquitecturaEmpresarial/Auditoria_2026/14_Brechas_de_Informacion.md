# 14 · Brechas de Información y Evidencias Requeridas

## 1. Alcance real de la auditoría
- **Analizado**: código y documentación de `Cj-Erp-Web` (FE, BE, scripts SQL versionados, docs). Los documentos 02 y 03 listan carpetas analizadas y pendientes.
- **No analizado / no accesible**: SQL Server real, Railway, Vercel, Azure, SharePoint, Power Apps/Automate, Claude (skills y conectores), app móvil (no está en el repo), contenido interno de la mayoría de servicios y scripts SQL.
- **No se ejecutaron** builds, tests, `npm audit` ni `dotnet list package --vulnerable`. La auditoría **no es exhaustiva**; no debe leerse como completa.
- El conector Microsoft 365 de Claude requiere autorización que esta sesión no pudo realizar.

## 2. Discrepancias abiertas entre hallazgos

| Tema | Fuente A | Fuente B | Acción |
|---|---|---|---|
| SPs versionados vs referenciados | Inventario: 149 vs ~183 | SQL: 250 referenciados, 129 sin definición; AGENTS.md: ~61 vs ~183 | Recontar con script reproducible |
| `new SqlConnection` fuera de la fábrica | 12 servicios + 4 controllers | 38 ocurrencias | Unificar criterio de conteo |
| IA: `IaChatService` | AGENTS.md/INTEGRATIONS.md lo listan | Ya no existe; lo reemplaza `IaOrchestrator` + `Services/AI/*` | Actualizar docs |
| Aprobador/usuario desde el body | Documentado | No re-verificado línea por línea | Verificar endpoint por endpoint |

## 3. Información a obtener (internos)
| # | Pendiente | Responsable |
|---|---|---|
| 1 | Versión, edición, tamaño, host y jobs (SQL Agent) de SQL Server; resultado de las 12 consultas DMV de solo lectura (doc 04) | DBA |
| 2 | Valor efectivo de cadena de conexión (Encrypt/Trust), topología Railway→SQL, IP allowlist | TI |
| 3 | Backups, RPO/RTO, pruebas de restauración | DBA |
| 4 | Réplicas, variables y plan en Railway; plan Vercel | TI |
| 5 | Visibilidad del repo (público/privado), accesos a GitHub | TI |
| 6 | Si las credenciales del historial siguen vigentes | Seguridad |
| 7 | Estado real de scripts SQL "NO EJECUTADO" (IA 02/08/09/10, Beneficio, Descanso, Logística, menú pagos v2) | DBA |
| 8 | Si `ScopeEnforcement` está activo en Railway | Backend |
| 9 | Contratos/condiciones de datos con OpenAI/Anthropic; consumo mensual de tokens | TI/Legal |
| 10 | Costos mensuales actuales (Railway, Vercel, SQL, SMTP, WUP, LLM) | Finanzas/TI |
| 11 | Datos personales tratados y política Ley 29733 | Legal |
| 12 | Repositorio y tecnología de la app móvil (Expo) | TI |

## 4. Preguntas para el equipo SharePoint / Microsoft 365
1. ¿Qué licencias M365 y Power Platform existen (Power Apps, Automate, premium, Copilot, Entra P1/P2)?
2. Inventario de flujos, apps y agentes (nombre, dueño, trigger, frecuencia, conectores, qué datos del ERP consumen).
3. ¿Cómo leen hoy `GASTOS.xlsx` / `TBL_GASTOS` y los JSON de asistencia? ¿Dependen de columnas fijas? ¿Hubo fallos por lectura parcial?
4. Permisos Graph de la aplicación del ERP (¿`Sites.ReadWrite.All`, `Files.ReadWrite.All`, `Mail.Send`?) y tenant/sitio.
5. ¿Los skills de Claude (auditor-gastos, ayuda, acta-reunion) escriben en SharePoint? ¿Con qué identidad y qué carpetas?
6. ¿Existe DLP de Power Platform y política de conectores?
7. ¿Qué información duplicada o corregida manualmente existe fuera del ERP?
8. ¿Estructura de bibliotecas, permisos, retención y versionado?
9. ¿Qué documentos son candidatos a RAG y con qué clasificación?
10. ¿Quién es dueño y quién da soporte a cada automatización?

## 5. Clasificación de la información sobre M365 (resumen)
- **Informada** (por el usuario): SharePoint, Power Apps, automatizaciones, Claude con acceso documental, carpetas automáticas, sin integración directa a tablas del ERP.
- **Comprobada en repo**: ERP→SharePoint por Graph; Excel `TBL_GASTOS`; JSON de asistencia; correo.
- **Hipótesis**: lectura de Excel por flujos; fragilidad ante lectura parcial; `clear` de tabla Excel.
- **Pendiente**: todo el funcionamiento interno del ecosistema M365.

## 6. Costos
Ningún costo se ha confirmado. Toda cifra futura debe etiquetarse Confirmado / Estimado / Supuesto.
