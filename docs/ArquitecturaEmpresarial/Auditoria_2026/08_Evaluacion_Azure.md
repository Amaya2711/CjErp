# 08 · Evaluación de Microsoft Azure

> **Aviso sobre costos.** No existen cotizaciones ni datos de consumo en el repo. Este documento **no contiene precios**. Usa una escala relativa (Bajo/Medio/Alto) marcada como *supuesto*. Los costos reales requieren la calculadora de Azure y datos pendientes (doc 14). Capacidad tecnológica ≠ necesidad empresarial.

## 1. Pregunta central
¿Es Azure necesario? **No.** Es una alternativa con beneficios específicos. El ERP funciona hoy sin Azure; los problemas urgentes (autorización, secretos, CI/CD, DR) **no se resuelven migrando de proveedor**, se resuelven en el código y en el proceso.

## 2. Servicios evaluados

| Servicio | Caso de uso verificable en este ERP | Veredicto | Costo relativo (supuesto) |
|---|---|---|---|
| **Key Vault** | Secretos hoy en `appsettings.json` / historial git (SEC-04) | **Adoptar pronto**; funciona también desde Railway por API | Bajo |
| **Entra ID** | JWT propio + contraseñas en texto plano (SEC-03); SSO/MFA; coherencia con M365 | **Adoptar por fases** (SSO/MFA primero para admin) | Bajo/Medio (según licencias existentes: PV) |
| **Monitor / App Insights** | Observabilidad hoy = `ILogger` + `/health` solo SQL | **Adoptar** (SDK en .NET; no exige migrar hosting) | Medio (ingesta de logs) |
| **Azure Functions** | Integraciones puntuales ERP↔M365 (webhooks Graph, sincronización) | **Evaluar** si se necesita lógica server-side fuera de Power Automate | Bajo |
| **Service Bus / Event Grid** | Eventos (pago aprobado, OC aprobada) hacia M365/IA | **Diferir**: sin caso hoy; hoy basta API + Hangfire. Reevaluar ≥ 6 meses | Bajo/Medio |
| **API Management** | Catálogo/seguridad de APIs para externos (Power Platform, agentes) | **Evaluar** cuando haya >1 consumidor externo; alternativa: gateway en el propio API | Medio/Alto |
| **Blob Storage** | Archivos hoy en SharePoint/Graph | **No necesario** | — |
| **AI Search / AI Foundry** | RAG documental, acceso a modelos | **Evaluar en piloto IA**; no sustituye gobierno propio (AI Gateway) | Medio/Alto (uso) |
| **App Service / Container Apps** | Hosting backend hoy en Railway (Docker) | **Opcional**: ventaja = red privada hacia SQL y Defender; coste de migración | Medio |
| **Azure SQL DB** | Hoy SQL Server (versión/host PV) | Viable según repo (sin CLR/linked servers/xp_cmdshell/Agent versionado); requiere quitar `USE`, revisar DMV de `sp_Monitor_*`, extraer `dbo.vVacaciones`, activar `Encrypt` | Medio/Alto |
| **SQL Managed Instance** | Plan B si aparecen dependencias de instancia | Reserva | Alto |
| **SQL en VM** | Máxima compatibilidad | Solo si hay dependencias duras; conserva carga operativa | Medio/Alto |
| **VNet + Private Endpoint** | Reducir exposición de SQL a Internet (SEC-06) | **Solo si backend y SQL están en Azure**; si no, usar allowlist/túnel | Medio |
| **Azure Backup** | Backups no documentados | Relevante si SQL va a VM/MI; en Azure SQL DB hay backups gestionados | Medio |
| **Defender for Cloud** | Postura de seguridad | Solo con recursos en Azure; no por sí solo | Medio/Alto |

## 3. Beneficios reales para la aplicación actual
- **Seguridad**: Key Vault + Entra ID + red privada atacan hallazgos reales (SEC-03/04/06/20).
- **Operación**: Monitor/App Insights y backups gestionados cubren brechas de observabilidad y DR.
- **Integración M365**: Graph/Entra/Functions comparten identidad con SharePoint, Teams, Outlook.
- **IA**: Foundry/AI Search aportan RAG y modelos con residencia de datos configurable.

## 4. Beneficios para los procesos M365
Identidad única, Graph autenticado con managed identity (sin client secret), conectores y eventos fiables. Se logran en gran parte con Entra + Graph sin mover el ERP.

## 5. Desventajas
- Costo recurrente y menos predecible (egreso de datos, logs, Defender); curva de aprendizaje; riesgo de lock-in; migración de SQL con ventanas de corte; latencia si backend queda en Railway y SQL en Azure (o al revés) durante la transición; los jobs Hangfire y la sesión en memoria exigen ajustes antes de escalar horizontalmente.

## 6. Respuestas
- ¿Migrar SQL? **Aún no**: falta versión/edición/tamaño/jobs reales; ejecutar las consultas DMV de solo lectura del doc 04. Azure SQL DB parece viable.
- ¿Migrar backend de Railway? **No como prioridad.** Primero estado en memoria, CI/CD y secretos. Reevaluar si se decide SQL en Azure (latencia + red privada).
- ¿Migrar frontend de Vercel? **No**: sin beneficio demostrable.
- ¿Todo a la vez? **No.** Migración incremental (strangler), reversible por componente.
- ¿Integrar antes de migrar? **Sí.**

## 7. TCO a 12/24/36 meses
Sin datos confirmados no se calculan cifras. Plantilla a completar (marcar Confirmado/Estimado/Supuesto):

| Rubro | Hoy (Railway/Vercel/SQL actual) | Esc. B | Esc. C | Esc. D |
|---|---|---|---|---|
| Hosting backend/frontend | PV | PV | PV | PV |
| SQL (CPU/RAM/almacenamiento/backup) | PV | = hoy | = hoy | PV |
| Tráfico y egreso | PV | PV | PV | PV |
| Logs/monitoreo | PV | PV | PV | PV |
| Licencias M365/Power Platform/conectores premium | PV | PV | PV | PV |
| Consumo IA (tokens) | PV | PV | PV | PV |
| Desarrollo y migración (horas) | — | PV | PV | PV |
| Capacitación / soporte / DR | PV | PV | PV | PV |

Tendencia cualitativa (supuesto): B suma costo marginal bajo-medio; C y D suman costo de migración y recurrente, con retorno principalmente en seguridad de red y operación.

## 8. Recomendación
Azure como **capa selectiva** (Key Vault, Entra ID, Monitor; luego Functions/AI según piloto), conservando Railway/Vercel/SQL mientras no haya datos que justifiquen mover. Revisar a los 6 meses con costos reales.
