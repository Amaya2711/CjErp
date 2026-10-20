# 01 · Resumen Ejecutivo — Auditoría de Arquitectura Empresarial ERP (2026)

Dirigido a: Gerencia de TI · Fecha: 2026-10-14 · Alcance: repositorio `Cj-Erp-Web` (solo lectura). Los informes detallados están en los documentos 02–07; este resumen los sintetiza.

> **Límite de la auditoría.** Se analizó el código y la documentación del repo. No se accedió a SQL Server real, Railway, Vercel, Azure, SharePoint ni Power Platform. Todo lo que dependa de esos sistemas figura como NO VERIFICABLE y se lista en `14_Brechas_de_Informacion.md`. Las puntuaciones de la matriz (doc 09) son juicio profesional razonado, no medición.

## 1. Diagnóstico

| Área | Semáforo | Resumen |
|---|---|---|
| Arquitectura | AMARILLO | Monolito en capas (n-tier) con lógica de negocio en stored procedures. Adecuado para la escala; no es modular (`Domain` vacío, `Application` solo DTOs/interfaces). Microservicios no aportan valor, salvo separar el worker de jobs. |
| Autorización backend | ROJO | 0 usos de `Authorize(Roles/Policy)` en 52 controllers; los permisos viven solo en el frontend. |
| Secretos | ROJO | `appsettings.json` versionado con valores reales; `appsettings.Development.json` estuvo versionado en >15 commits; sin purga de historial. Rotación pendiente. |
| Exposición de SQL Server | GRIS | `Encrypt=false` / `TrustServerCertificate=true` por defecto en `SqlSettings`; la topología Railway→SQL no es verificable. |
| CI/CD y pruebas | ROJO | `.github/workflows` vacío; `main` despliega solo; ~474 pruebas existen (IA, Viáticos, vitest) pero no corren en CI; sin pruebas de pagos, conciliación, RRHH ni seguridad. |
| Datos / SQL | AMARILLO | Tablas núcleo sin DDL en el repo; ~52 % de SPs referenciados sin definición versionada (rango según agente: 129 de 250); `Planilla.Correlativo` no es único (77 duplicados legacy). |
| Continuidad (backup/DR) | GRIS | Sin documentación de backups ni DR. Sesiones en memoria, instancia única. |
| IA | AMARILLO | Chat con planner LLM y una sola herramienta fija (`sp_IA_Planilla_Buscar`). No es agente, ni RAG, ni MCP. La autorización por alcance existe pero está apagada. |
| Integración SharePoint | AMARILLO | Solo ERP→SharePoint (Graph, client credentials) y Excel `TBL_GASTOS`; frágil, no atómico, sin contrato de esquema. |
| Power Platform | GRIS | Nada en el repo; funcionamiento interno no verificable. |

## 2. Riesgos principales
1. **Sin autorización por rol en backend** + aprobador/usuario tomado del body (documentado, a re-verificar) → cualquier usuario autenticado puede invocar endpoints sensibles (incl. `KILL` de sesiones SQL, dashboard WUP con boletas).
2. **Secretos en el repo/historial** → rotar todas las credenciales (SMTP, JWT, SQL, Graph, WhatsApp, OpenAI/Anthropic) y decidir sobre purga del historial.
3. **IA con alcance desactivado** (`IaChat:ScopeEnforcement:Enabled=false`): un usuario con el menú puede ver gastos globales; y se envían nombres y montos a proveedores externos sin control de costo/tokens. Iframe de dashboard con `allow-scripts allow-same-origin` + JWT en `localStorage`.
4. **Sin CI/CD ni DR documentado**: un push a `main` despliega a producción.
5. **Webhook de WhatsApp sin firma** (`X-Hub-Signature-256`).

## 3. Fortalezas a preservar
- Patrón uniforme Controller→Service→SP/Dapper (parametrizado; el LLM no escribe SQL).
- Reglas de negocio ricas y probadas en producción (estados de Planilla, aprobaciones, pagos).
- Hangfire con reintentos; Swagger solo en Development; Hangfire Dashboard no expuesto; CORS sin comodín.
- Documentación operativa (`AGENTS.md`, `docs/`) y suite de pruebas en IA y Viáticos.
- Escritura Graph con reintentos ante 429/503/504.

## 4. Recomendación (resumen)
**No migrar todo a Azure ahora. Endurecer primero, integrar después, y adoptar una arquitectura híbrida por fases (Escenario G, implementado de forma incremental empezando por A reforzado y B selectivo).**

1. **0–30 días**: rotar secretos, autorización por rol/política en endpoints críticos, apagar/proteger `KILL`, firma del webhook, habilitar `ScopeEnforcement` de IA tras validar scripts, CI mínimo (build+tests), documentar backup/DR y confirmar cifrado SQL.
2. **31–90 días**: APIs empresariales versionadas con contratos (proyectos, empleados, OT, estados de pago, aprobaciones, documentos); piloto ERP–SharePoint por API; observabilidad.
3. **3–6 meses**: AI Gateway + catálogo de herramientas sobre APIs; sustituir Excel como integración; evaluar Azure para Key Vault, Entra ID, Monitor, Functions/Service Bus donde haya caso de uso.
4. **6–12 meses**: decidir migración selectiva (backend/SQL) con datos reales de costo, versión de SQL Server y latencia.

SharePoint: repositorio documental y colaboración, no fuente de datos operativos. Power Apps/Automate: solo vía APIs del ERP, nunca escritura directa a SQL. Azure: conveniente por servicios concretos (identidad, secretos, integración, IA), no como mudanza total.

## 5. Decisiones que debe aprobar la gerencia
1. Rotación de credenciales y política de gestión de secretos (P0).
2. Presupuesto para CI/CD y refactor de autorización (modelo por política).
3. Aprobar el principio "ERP = sistema de registro; todo acceso externo por API".
4. Autorizar el inventario de información pendiente con el equipo SharePoint/M365 y TI (doc 14).
5. Autorizar un piloto IA acotado (copiloto financiero de solo lectura) con gobierno definido.
6. Posponer la decisión de migración a Azure hasta contar con costos confirmados.

## 6. Información que impide una decisión definitiva
Versión/edición/tamaño de SQL Server y su hosting; réplicas y variables en Railway; licencias M365/Power Platform; permisos Graph reales; contenido de los desarrollos SharePoint/Power Apps; contratos con proveedores LLM; política de datos personales (Ley 29733). Ver doc 14.

## 7. Índice
01 Resumen · 02 Inventario · 03 Arquitectura actual · 04 SQL · 05 Seguridad/DevOps · 06 IA · 07 SharePoint/M365 · 08 Azure · 09 Matriz · 10 Arquitectura objetivo · 11 Roadmap · 12 Riesgos y ADR · 13 Oportunidades IA · 14 Brechas · 15 Presentación.
