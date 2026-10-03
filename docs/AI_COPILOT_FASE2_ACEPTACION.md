# IA Chat — Fase 2: casos de aceptación del flujo completo

> **Estado: PREPARADO, NO EJECUTADO. La Fase 2 NO está cerrada.** La ruta antigua (sin alcance) sigue activa en producción. Estos casos se ejecutan en **desarrollo** cuando existan: el SP `Database/IaChat/02_sp_IA_Planilla_Buscar_Alcance.sql` desplegado en esa BD, la fuente de permisos (`IIaPermissionStore`), el directorio de empleados (`IIaEmployeeDirectory`) y los IdPerfil/IdRol de Total y de totales globales. La Fase 2 solo se declara cerrada cuando todos los casos pasan con integración real **y** la ruta antigua fue retirada (ver anexo del plan).

## Principio de seguridad verificado (sin depender de la heurística)
La heurística `QuestionNeedsGlobalMetric` solo mejora la respuesta; **no es un control de seguridad**. Los controles que cierran las fugas son estructurales y se aplican aunque la heurística falle:

| Capa | Control | Evidencia (pruebas sintéticas, ejecutadas) |
|---|---|---|
| SP | alcance en `#Candidatos`; 15 columnas globales en NULL sin permiso | tests estáticos del script (texto); **pendiente ejecución real** |
| Ejecutor | retira las 15 columnas si `CanViewGlobalTotals = false` | `GastosPaginationScopeTests` |
| Orquestador | **repite** la retirada tras el ejecutor, antes de análisis/LLM/memoria/respuesta | `Seguridad_NoDependeDeLaHeuristica_...` (pregunta que la heurística no detecta + ejecutor que "filtra" valores centinela: ninguno llega a las peticiones al LLM, a la respuesta ni a la memoria; probado que **falla** si se desactiva esa retirada) |
| Memoria | alcance (nivel, campos, miembros, permiso de totales) revalidado al inicio del turno; si cambia o se revoca, se descarta TODA la memoria | `Revocacion_*`, `Activado_SiCambiaElAlcance_...` |
| Exportación | autoriza de nuevo, exige coincidencia de alcance y retira las columnas globales si no hay permiso vigente, aunque la memoria las tuviera | `Seguridad_Exportar_SinPermisoDeTotales_...` |

Fuera de este control (pre-existente, no modificado): el `ContextualSummary` y la `Question` de la exportación los envía el cliente tal cual al generador de informes; son texto del propio usuario, no datos del servidor.

## Casos de aceptación (ejecutar con integración real en desarrollo)
Datos de partida: 4 cuentas distintas — **A** (Propio), **B** (Equipo con ≥ 2 subordinados directos), **C** (Total sin totales globales), **D** (Total + totales globales) — más una cuenta **E** vinculada al mismo empleado que A (verifica independencia por cuenta). Anotar IdUsuario, IdEmpleadoCj y la lista de equipo esperada de cada una **desde la BD**, no desde la respuesta del sistema.

| ID | Caso | Pasos | Resultado esperado |
|---|---|---|---|
| F-01 | Propio | A pregunta "gastos del año" | Solo filas donde el empleado de A es responsable **o** solicitante; `TotalRegistros` = oráculo B01 del script; ninguna fila de otro empleado |
| F-02 | Propio: filtro ajeno | A pide "gastos de <otro empleado>" | 0 filas (el filtro solo reduce); nunca datos de ese empleado |
| F-03 | Equipo | B pregunta lo mismo | Filas del titular + subordinados **directos** (no nietos); total = oráculo B02 |
| F-04 | Total | C pregunta lo mismo | Todas las filas (total = oráculo B03) |
| F-05 | Totales globales denegados | A, B y C piden ventas/saldo de OC/site | Respuesta "no disponible"; sin filas; sin cifras; en la petición al LLM no aparece ningún valor global |
| F-06 | Totales globales denegados, pregunta que la heurística no detecta | C pregunta "cuánto se facturó por site" | Las 15 columnas ausentes en la respuesta, en `detailRows`, en la memoria y en lo enviado al LLM |
| F-07 | Totales globales concedidos | D pregunta ventas/saldo | Valores presentes e iguales a los del SP anterior (paridad de cálculos); un site con Ventas = 0 real muestra 0, no "No disponible" |
| F-08 | Permiso global independiente | cuenta con Propio + totales globales; cuenta con Total sin totales | La primera ve Ventas solo de sus filas; la segunda ve todas las filas pero ninguna columna global |
| F-09 | Cuentas del mismo empleado | E (sin permisos) pregunta | Denegada, aunque A tenga permisos; E no ve conversaciones de A |
| F-10 | Cambio de equipo | B consulta; en BD se agrega/quita un subordinado; B repite/continúa la misma conversación | La memoria previa se descarta (se ve que ya no responde "de memoria"); la nueva consulta refleja el equipo nuevo |
| F-11 | Revocación de totales globales | D consulta con ventas; se revoca el permiso global; D continúa la conversación y exporta | La memoria se descarta; no se reutilizan cifras previas; exportar pide volver a consultar |
| F-12 | Revocación total | se revoca todo permiso de A mid-conversación | Siguiente turno denegado y memoria vacía; al restituir el permiso no reaparece el contenido anterior |
| F-13 | Paginación | resultado > 1 página (tamaño bajo en desarrollo) | `TotalRegistros` igual en todas las páginas, sin duplicados, **todos los filtros (incluido Site) y el mismo alcance** en cada página; total acumulado = oráculo |
| F-14 | Exportación Propio/Equipo | exportar informe de gastos | Informe solo con filas del alcance; sin columnas globales |
| F-15 | Exportación ventas sin permiso | exportar "informe de ventas" con C | Informe marcado "No disponible por permisos": sin montos, porcentajes, KPIs ni semáforo |
| F-16 | Exportación con alcance cambiado | consultar con B, cambiar el equipo, exportar | Rechazada ("tu alcance de datos cambió") |
| F-17 | Fallo de verificación | simular caída de la fuente de permisos | Denegado, sin ejecutar SQL ni llamar al LLM (sin fallback sin restricción) |
| F-18 | SP de alcance | ejecutar `Aceptacion_SP_Alcance_Dev.sql` en desarrollo | Parte A: todos PASS; parte B: conteos = oráculo |
| F-19 | Plan de ejecución | comparar plan/lecturas lógicas del SP con y sin `@VerTotalesGlobales` | Documentar si los 4 APPLY globales dejan de ejecutarse. **Hasta medirlo no se afirma.** Si no se omiten, los NULL siguen siendo correctos pero el costo no baja |

Cada caso debe registrarse con: fecha, entorno, cuenta, pregunta exacta, captura de la respuesta de red (JSON), conteo de la BD y resultado PASS/FAIL.

## Comprobación manual en navegador: "No disponible" frente a un cero real
Se puede hacer **antes** de tener el SP, editando la respuesta de red con las herramientas del navegador (el cliente solo depende del JSON). Requiere `npm run dev` y una consulta que devuelva filas con site (p. ej. gastos de un cliente con varios sites).

1. Abrir DevTools → Network, ejecutar la consulta y localizar la respuesta de `POST /ia-chat/consultar`. Guardar una copia del JSON.
2. **Caso "cero real"**: con la opción *Override content* (o una extensión de reescritura de respuestas), editar `detailRows` para que cada fila tenga `"Ventas": 0`, `"ConPagadoSoles": 0`, `"Subtotal": 100`; **no** incluir `unavailableFields`. Esperado en la pantalla: tarjetas por site con **S/ 0.00** en ventas y total acumulado, "0.00%", y **sin** texto "No disponible".
3. **Caso "no disponible"**: editar el JSON para **quitar** las claves `Ventas`, `ConPagadoSoles` y las demás columnas globales de cada fila y agregar `"unavailableFields": ["Ventas","ConPagadoSoles","ConPagado", ...]` (las 15). Esperado: las tarjetas muestran **"No disponible"** en monto de ventas y total acumulado, y "Avance y saldo del sitio: No disponible"; **sin** barra de progreso, sin "Disponible/Agotado" y sin ningún "S/ 0.00" ni "0.00%" derivado.
4. En la tabla de detalle completo, la columna **Ventas** debe mostrar "No disponible" en el caso 3 y `0` en el caso 2.
5. Con la pregunta "informe de ventas" y el caso 3, generar la vista previa del informe: debe indicar que la métrica no está disponible, sin totales, porcentajes ni semáforos. En el caso 2 debe mostrar totales en cero y semáforos calculados.
6. Reglas de lectura: **cero real = columna presente con valor 0; no disponible = columna ausente y listada en `unavailableFields`.** Un NULL aislado sin `unavailableFields` no debe usarse como señal.

Registrar capturas de pantalla de los casos 2 y 3 como evidencia. **Estas comprobaciones no se han ejecutado.**

## Retirada de la ruta antigua (condición de cierre)
Ver el checklist de activación del anexo del plan (punto 7): eliminar `IaScopeEnforcementOptions`, la rama sin alcance de `IaOrchestrator.ExecuteSearchAsync`, `IGastosQueryExecutor.EjecutarBuscarPlanillaAsync`, hacer obligatorio `IIaAuthorizationService` y añadir un test que falle si reaparece una llamada sin alcance. Hasta entonces la Fase 2 permanece abierta.
