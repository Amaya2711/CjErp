# 15 · Presentación Gerencial — Decisión Tecnológica ERP + IA + SharePoint + Azure

*(Una diapositiva por sección. Base: docs 01–14. Sin cifras de costo; pendientes de confirmar.)*

## 1. Situación
ERP propio funcional (React + .NET 8 + SQL Server en Railway/Vercel). Ecosistema SharePoint/Power Apps/Claude separado; el ERP le entrega Excel/JSON. Se evalúa Azure e IA.

## 2. Qué funciona (VERDE)
Patrón consistente Controller→Service→SP; reglas de negocio maduras; Hangfire; Swagger/CORS/Dashboard sin exposición indebida; pruebas en IA y Viáticos; documentación operativa.

## 3. Qué requiere intervención (ROJO)
- Sin autorización por rol en backend.
- Secretos en repositorio e historial.
- Sin CI/CD; `main` despliega solo.
- IA con alcance de datos desactivado y datos enviados a terceros sin control de costo.

## 4. Qué no sabemos (GRIS)
Versión/hosting de SQL, backups/DR, cifrado efectivo, costos reales, funcionamiento interno de M365/Power Apps.

## 5. Alternativas evaluadas
A Continuidad · B Azure como capa de integración · C Backend a Azure · D Todo a Azure · E M365 como plataforma · F Convergencia al ERP · G Híbrida optimizada.
Puntaje ponderado: G 4.40 · B 3.75 · F 3.60 · A 3.15 · C 3.10 · D 3.05 · E 3.05 (juicio razonado; ver doc 09).

## 6. Recomendación
**Endurecer → integrar por API → adoptar Azure de forma selectiva → decidir migración con datos reales.**
- ERP = sistema de registro; SharePoint = documentos; Power Platform = productividad vía API; IA detrás de un gateway que hereda permisos.
- Azure primero para Key Vault, Entra ID y Monitor; no mudar SQL/backend/frontend todavía.
- Excel pasa a ser reporte humano, no integración.

## 7. Roadmap
30 días: contención (secretos, autorización, CI, DR) · 90 días: APIs + piloto SharePoint + piloto IA · 6 meses: AI Gateway, SSO, Power Automate sobre API · 12 meses: decisión de migración selectiva.

## 8. IA: mayor retorno inicial
Copiloto financiero de solo lectura, reportes ejecutivos, interpretación de reportes, soporte ERP (RAG sobre documentación). Después: anomalías/duplicidades. Operaciones sensibles siempre con aprobación humana.

## 9. Decisiones solicitadas
1. Rotar credenciales y aprobar política de secretos. 2. Aprobar autorización por política y CI. 3. Aprobar ADR-001 (acceso externo solo por API). 4. Autorizar levantamiento de información (doc 14). 5. Autorizar piloto IA acotado. 6. Posponer migración a Azure hasta costos reales.

## 10. Próximos pasos
Reunión con TI/DBA y equipo M365; ejecutar consultas de solo lectura aprobadas; recalcular matriz con costos y ponderaciones de la gerencia.
