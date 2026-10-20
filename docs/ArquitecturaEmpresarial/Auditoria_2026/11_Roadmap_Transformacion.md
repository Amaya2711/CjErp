# 11 · Roadmap de Transformación

> Esfuerzos expresados en **persona-semanas relativas (supuesto)**, no presupuesto. Equipo = roles sugeridos. Cada iniciativa referencia hallazgos de los docs 02–07.

## Horizonte 1 — 0 a 30 días (contención)

| ID | Iniciativa | Estado actual | Actividades | Responsable | Dificultad | Esfuerzo | Indicador de éxito |
|---|---|---|---|---|---|---|---|
| H1-1 | Rotar secretos y limpiar repo (SEC-04) | Valores reales en `appsettings.json`, historial | Rotar SMTP/JWT/SQL/Graph/WhatsApp/LLM; mover a variables de entorno; sacar `tmp/`, `.env*`, `.csproj.user` del tracking; decidir purga de historial | TI + Seguridad | Media | 1–2 | 0 secretos en HEAD; credenciales previas revocadas |
| H1-2 | Autorización en backend (SEC-01/02) | `AddAuthorization()` vacío | Policies por rol/permiso en endpoints críticos (pagos, aprobaciones, SQL Monitor, WUP, seguridad); aprobador desde JWT | Backend | Alta | 3–4 | 100 % de endpoints sensibles con política; pruebas de acceso denegado |
| H1-3 | Cerrar endpoints peligrosos (SEC-09/10, TestConnection) | `KILL` y dashboard WUP abiertos | Restringir a admin; retirar anónimo de test | Backend | Baja | 0.5 | Pruebas 403 |
| H1-4 | Firma webhook WhatsApp (SEC-08) | Sin HMAC | Validar `X-Hub-Signature-256` | Backend | Baja | 0.5 | Rechazo de firmas inválidas |
| H1-5 | IA: scope y auditoría (IA-01/03) | `ScopeEnforcement` apagado; SP auditoría dudoso | Validar scripts SQL en BD; activar scope en entorno de prueba; registrar tokens/costo; sandbox del iframe sin `allow-same-origin` | Backend + IA | Media | 1–2 | Usuario sin permiso no ve gastos globales |
| H1-6 | CI mínimo (SEC-19) | Sin workflows | Build + tests FE/BE en PR; proteger `main` | DevOps | Baja | 1 | PR bloqueado si falla |
| H1-7 | Confirmar SQL: cifrado, red, backups (SEC-06, SQL-08) | No verificable | Ejecutar consultas DMV de solo lectura (aprobadas); documentar backup/RPO/RTO | DBA | Baja | 1 | Documento DR y prueba de restauración planificada |

## Horizonte 2 — 31 a 90 días (fundamentos de integración)
- **H2-1 APIs empresariales y contratos** (proyectos, empleados, OT, estados de pago, aprobaciones, documentos; OpenAPI; OAuth client-credentials con scopes). Dif. Alta, 4–6. Éxito: contratos publicados, un consumidor externo usando API.
- **H2-2 Piloto ERP–SharePoint por API** (sustituir lectura del Excel `TBL_GASTOS` por consulta API; Excel se mantiene en paralelo). Dif. Media, 2–3. Éxito: flujo M365 funcional sin leer Excel.
- **H2-3 Versionar BD** (DDL tablas núcleo, SPs faltantes, grants mínimos; reconciliar cifras 129/250 vs 149/183). Dif. Media, 3–4. Éxito: `JC_Db` reproducible desde repo.
- **H2-4 Estado en memoria** (sesión, `static List<GastoDto>`, memoria IA) → persistente/caché distribuida; separar worker de jobs. Dif. Media, 2–3.
- **H2-5 Observabilidad** (App Insights u otro; health con dependencias; alertas). Dif. Baja, 1–2.
- **H2-6 Piloto IA** (copiloto financiero de solo lectura sobre APIs; evaluación con conjunto de preguntas). Dif. Media, 3–4.
- **H2-7 Evaluación de costos Azure** con datos reales (doc 08 plantilla). Dif. Baja, 1.

## Horizonte 3 — 3 a 6 meses
- AI Gateway + catálogo de herramientas + RAG sobre documentos SharePoint (solo lectura, permisos heredados).
- Entra ID SSO/MFA para perfiles administrativos; migrar hash de contraseñas.
- Power Automate sobre APIs para flujos de productividad; políticas DLP de Power Platform.
- Retiro gradual de Excel como integración; refactor de archivos gigantes críticos (conciliación, pagos) con pruebas de caracterización.
- Gobierno de arquitectura (comité, catálogo de APIs).

## Horizonte 4 — 6 a 12 meses
- Decisión documentada sobre migración selectiva (SQL → Azure SQL DB; backend → Container Apps) con costos reales y plan de reversión.
- IA avanzada: anomalías, duplicidades, rentabilidad por proyecto; evaluación continua.
- Escalado horizontal; FinOps trimestral; retiro de código legacy duplicado.

## Dependencias críticas
H1-2 antecede a H2-1 y a toda IA transaccional; H2-3 antecede a cualquier migración de SQL; H2-4 antecede al escalado horizontal; H1-1 antecede a todo despliegue nuevo.

## Evidencia de cumplimiento (por horizonte)
Informe de rotación; matriz de endpoints vs políticas; pipeline verde en `main`; contratos OpenAPI; documento DR con prueba de restauración; informe de evaluación IA; acta de decisión de migración.
