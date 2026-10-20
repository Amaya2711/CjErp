# 10 · Arquitectura Empresarial Objetivo (3 años)

Principio rector: **un sistema de registro por entidad; todo acceso externo pasa por APIs autorizadas; la IA hereda los permisos del usuario.** Propuesta sujeta a validación (doc 14).

## 1. Diagrama

```mermaid
flowchart LR
  U[Usuarios] --> FE[React ERP]
  U --> PA[Power Apps / Teams]
  U --> CL[Claude / Copilot]
  FE --> GW[API Gateway ERP<br/>OAuth/JWT, rate limit, auditoría]
  PA --> PAu[Power Automate] --> GW
  CL --> AIG[AI Gateway] --> TC[Catálogo de herramientas]
  TC --> GW
  GW --> SVC[Servicios de dominio .NET]
  SVC --> SQL[(SQL Server<br/>sistema de registro)]
  SVC --> HF[Jobs / Hangfire (worker separado)]
  SVC --> SP[SharePoint / Graph<br/>documentos]
  SVC --> EVT[Eventos (opcional: Service Bus)]
  AIG --> LLM[Proveedores LLM desacoplados]
  AIG --> RAG[Índice RAG documental]
  RAG --> SP
  ID[Entra ID] -.-> FE & GW & PA & AIG
  KV[Key Vault] -.-> SVC & AIG
  OBS[Monitor / logs] -.-> GW & SVC & AIG
```

## 2. Sistema de registro y dueños

| Entidad / capacidad | Plataforma dueña | Responsable sugerido |
|---|---|---|
| Recibos/gastos, pagos, OC, aprobaciones, asistencia, RRHH, viáticos | **ERP + SQL Server** | TI / Finanzas / RRHH (dueño funcional) |
| Documentos, plantillas, colaboración, versionado | **SharePoint** | Administración / TI M365 |
| Flujos de productividad (avisos, recopilación, carpetas) | **Power Automate** (consumiendo APIs) | TI M365 |
| Apps departamentales ligeras | **Power Apps** (solo lectura/solicitudes vía API) | Área usuaria + TI |
| Identidad | **Entra ID** (objetivo) | TI |
| Secretos | **Key Vault** | TI |
| Modelos de IA | Detrás del **AI Gateway** (Claude/OpenAI/otros) | TI + Seguridad |

Regla: ningún equipo crea una segunda fuente de verdad de un proceso del ERP. Excel queda como salida humana, no como integración.

## 3. Capas objetivo
1. **API empresarial versionada** (`/api/v1/...`) con contratos (OpenAPI), scopes OAuth por consumidor y autorización por política (rol/perfil/permiso de acción). Sin esto, ni Power Platform ni IA son seguros.
2. **Servicios de dominio**: consolidar reglas hoy en SQL/controllers (SQL inline, `new SqlConnection`) hacia servicios; SQL conserva integridad y operaciones masivas.
3. **Datos**: DDL de tablas núcleo y SPs versionados; cuentas SQL de mínimo privilegio por aplicación; nada de lectura directa de tablas desde externos.
4. **Eventos/asincronía**: síncrono = consultas, validaciones, pagos y aprobaciones; asíncrono = reportes, exportaciones, notificaciones, indexación RAG, correo. Service Bus solo cuando haya ≥2 consumidores de eventos.
5. **IA**: AI Gateway (autenticación, cuota, auditoría de prompts/herramientas/respuestas, redacción de datos), orquestador, agentes por dominio de **solo lectura** al inicio; operaciones sensibles requieren aprobación humana y pasan por el mismo endpoint de negocio que la UI.
6. **Observabilidad/DevOps**: CI (build+tests), entornos dev/test/prod separados, trazas y alertas, backups probados, runbook DR.

## 4. Gobierno
Catálogo de APIs y aplicaciones; comité de arquitectura mensual; criterios de adopción tecnológica (caso de uso + dueño + costo + plan de salida); revisión de costos (FinOps) trimestral; gestión del ciclo de vida (retiro de pantallas legacy `_dev`, duplicados `_v1/_v2`).

## 5. Qué NO hacer
Microservicios; migración total inmediata; mover documentos a SQL; sustituir SharePoint; Power Apps escribiendo en tablas; permitir que un agente ejecute pagos/aprobaciones sin humano.
