# IA Chat — Fase 2: procedimiento único de integración (escalonado, sin ambiente de pruebas)

> **Preparado, NO ejecutado.** La organización **no tiene ambientes de desarrollo o prueba**: todo está en producción y hay un respaldo diario. El responsable indicó (2026-10-03) que **`sp_IA_Planilla_Buscar` no está en uso actualmente** y que puede cambiarse. Esto es una **declaración del usuario, no una evidencia verificada** (la auditoría del IA Chat nunca funcionó en `JC_Db`, ver anexo del plan). Por eso el procedimiento es **escalonado**: primero lo inerte, luego el cambio acoplado, con recuperación en cada etapa. La Fase 2 **no está cerrada** hasta pasar los casos de `AI_COPILOT_FASE2_ACEPTACION.md` y retirar la ruta antigua. Si más adelante se dispone de una copia de la base, las mismas etapas se ensayan primero en ella.
> **Quién ejecuta qué**: los scripts SQL, el despliegue del backend y los cambios de variables de entorno los ejecuta el responsable; el asistente no se conecta a la base ni despliega. Cada script de cambio exige editar `@BaseDestino` con el nombre exacto de la base (guarda contra ejecuciones accidentales).

## 1. Dependencias reales de cada script
| Script | Qué hace | Depende de | Qué valida / qué NO valida |
|---|---|---|---|
| `04_verificar_estado_sp_…` | Lectura | catálogo del SP, `sys.dm_exec_procedure_stats` (permiso de estado del servidor), `IaChatAuditoria` (opcional) | **Solo** el estado de `dbo.sp_IA_Planilla_Buscar` (firma y texto ejecutable). **No** valida tabla de permisos, seed, menús ni backend |
| `05_definicion_vigente_…` | Lectura | el SP | Definición completa y una llamada idéntica a la del backend antiguo |
| `11_verificar_auditoria_…` | Lectura | SP y tabla de auditoría, DMV, permisos | Existencia del SP de auditoría, IDENTITY, permisos. `12` repite la existencia del SP (C08) |
| **`12_verificar_integracion_alcance_SoloLectura`** | Lectura | catálogo, `Seg*`, `Usuario`, `Empleado`, `EmpleadoCj`; `IaToolPermiso` solo por SQL dinámico | **Sí valida**: firma del SP, estructura/restricciones/trigger de `IaToolPermiso`, las 11 filas de la matriz, pares perfil-rol, menú Chat IA (solo los esperados), cobertura de cuentas, SP de auditoría. Seguro en cualquier base |
| `01_IaChatAuditoria` | Crea la tabla si falta y `CREATE OR ALTER` del SP de auditoría | permisos de DDL | Verificar con 12 (C08). Decisión pendiente del responsable; el usuario de la API necesita `EXECUTE` |
| `08_IaToolPermiso_Base` | Crea tabla, FK, índice único, CHECK, trigger | `SegPerfilRol(IdPerfilRol)` | Verificar con 12 (C02a–e) |
| `09_IaToolPermiso_Seed_MatrizAprobada` | Inserta 11 filas | 08; pares exactos y activos en `SegPerfilRol` | Revierte todo si alguna fila no encaja (12: C03/C04) |
| `02_sp_IA_Planilla_Buscar_Alcance` | Cambia el SP (22 parámetros) | nada; **incompatible con el backend sin el alcance activado** | 04 (firma/THROW), 12 (C01), `Aceptacion_SP_Alcance_Dev` |
| `Aceptacion_SP_Alcance_Dev` | Lectura (invoca el SP) | **02 aplicado**; parte B exige ids reales | Parte A autoverifica errores; parte B contra oráculo |
| `10_Menu_ChatIA_PerfilRol_2_34` | Asigna el menú a (2,4) y (15,4) | `SegMenu` (ruta única), `sp_SegPerfilRolMenu_Insertar` | **Al final**; 12 (C05b) |
| `13_rollback_integracion_alcance_DEV` | Elimina `IaToolPermiso` | — | Solo la tabla |
| `03_rollback_sp_…` | Restaura el SP anterior | — | 04/05 |

## 2. Prerrequisitos
1. **Respaldo verificado**: anotar el respaldo diario más reciente (fecha/hora) y tomar un **respaldo `COPY_ONLY` manual** justo antes de la Etapa E1. No restaurar encima de producción salvo desastre: ante un fallo de objetos se usa la recuperación por etapa (§5); un respaldo se restauraría con **otro nombre** para recuperar objetos puntuales.
2. **Línea base** (solo lectura): `04`, `12`, `11`. Esperado: 04 SIN ALCANCE (18 params); 12: C02 FALTA, C03 PENDIENTE, C05b PENDIENTE (26 y 27 con menú), C08 FALTA.
3. **Backend en Railway**: el responsable confirmó (2026-10-03) que el IA Chat **no está en uso** y que solo existe **una versión** desplegada (no hay una versión anterior a la que volver desde el panel). Punto de retorno: **etiquetar/anotar el commit actual** (`HEAD`) antes de desplegar; la vuelta atrás es **redesplegar ese commit** (cómo despliega Railway —desde el repositorio o manualmente— está por confirmar). El código nuevo está en el árbol de trabajo **sin commit** (solo cambios del trabajo de IA) hasta que el responsable decida.
   **Regla acordada**: solo se modifican procedimientos almacenados **del IA** (`sp_IA_Planilla_Buscar`; y, si se autoriza, se **crea** el que falta `sp_IaChatAuditoria_Insertar`). **Cualquier otro procedimiento almacenado se consulta antes.** El script 10 no modifica ningún SP: **ejecuta** el existente `sp_SegPerfilRolMenu_Insertar` y cambia datos de `SegPerfilRolMenu` (menú), por eso va al final y requiere confirmación expresa.
4. **Comunicación**: avisar a los usuarios con el menú Chat IA (perfil-rol 26 y 27) de que el IA Chat puede dejar de responder en la ventana de las etapas E3–E4.
5. En cada script de cambio, editar `@BaseDestino` con el nombre exacto de la base destino.

## 3. Configuración del backend
- Producción (Railway): la cadena `ConnectionStrings__DefaultConnection` ya viene de variables de entorno. La activación se hace con `IaChat__ScopeEnforcement__Enabled=true` (por defecto ausente = desactivado) y reinicio del servicio.
- **No ejecutar el backend local contra la base real con los secretos de `appsettings.Development.json` salvo necesidad**: inicia Hangfire y los schedulers (reportes de WhatsApp, exportación de asistencia a SharePoint, envío de push) con credenciales reales. Las pruebas de este plan se hacen contra el despliegue de Railway con cuentas controladas.
- No editar `appsettings*.json`, `vercel.json` ni `httpClient.ts`.

## 4. Etapas (cada una con criterio de avance; ante fallo ir a §5)
| Etapa | Acción | Criterio de avance |
|---|---|---|
| **E0** | Prerrequisitos (§2) | Respaldo anotado; línea base obtenida |
| **E1** *(inerte)* | Ejecutar `08`, luego `09` (y `01` si se decide corregir la auditoría); después `12` | C02a–e PASS; C03 PASS ×11; C04 PASS ×11; C08 PASS si se ejecutó 01. **No cambian el comportamiento** del sistema actual (nadie lee la tabla mientras el interruptor siga desactivado) |
| **E2** | Desplegar el backend con el código nuevo y el interruptor **desactivado** | Arranque sin errores (DI resuelve); pantallas habituales funcionan; el IA Chat, si se prueba, sigue por la ruta antigua |
| **E3** *(acoplado)* | En una ventana corta: ejecutar `02`; `04` (debe decir CON ALCANCE, 22 params) y `Aceptacion_SP_Alcance_Dev` parte A (todo PASS); poner `IaChat__ScopeEnforcement__Enabled=true` y reiniciar el backend | Entre 02 y el reinicio el IA Chat falla (aceptado: sin uso). Tras el reinicio, una consulta autorizada responde |
| **E4** | `Aceptacion_SP_Alcance_Dev` parte B y casos **F-01 a F-19** de `AI_COPILOT_FASE2_ACEPTACION.md` con cuentas controladas (PROPIO, EQUIPO, TOTAL sin globales, TOTAL con globales, sin perfil-rol, sin empleado, dos cuentas del mismo empleado). Reevaluación: cambiar un registro de `IaToolPermiso` (solo esa tabla) y repetir la consulta del mismo usuario **sin cerrar sesión ni reiniciar** | Todos PASS; con la matriz cargada, solo las cuentas de los 11 perfil-rol tienen acceso; el resto es denegado |
| **E5** | **Solo tras E4 aprobado**: ejecutar `10` (menú para IdPerfilRol 2 y 34) y `12` | C05b PASS (26, 27, 2, 34); probar en navegador esas cuentas. Los otros siete perfil-rol **no** cambian de menú |
| **E6** | Retirar la ruta antigua y el interruptor (checklist del anexo del plan, punto 7) y desplegar | Una única ruta con alcance obligatorio |

## 5. Recuperación por etapa
| Falla en | Acción |
|---|---|
| E1 | `13_rollback_integracion_alcance_DEV.sql` (elimina `IaToolPermiso`); el sistema actual no dependía de ella |
| E2 | Volver a la versión anterior del despliegue en Railway |
| E3 | Quitar la variable `IaChat__ScopeEnforcement__Enabled` y restaurar el SP con `03_rollback_sp_…sql`; verificar con `04`; si hace falta, volver a la versión anterior del backend |
| E4 | Ajustar/desactivar filas de `IaToolPermiso` (`EsActivo = 0`) o repetir E3 en sentido inverso |
| E5 | Quitar la asignación con la pantalla de seguridad "Menu - Perfil" (no usar el borrado masivo por perfil-rol) |
| Desastre de objetos | Restaurar el respaldo con **otro nombre** y recuperar los objetos |

## 6. Estado del código: qué está terminado y qué falta para probar el flujo real
| Componente | Estado |
|---|---|
| Contratos y alcance (`IIaAuthorizationService`, `IaResolvedScope`, `IaAuthorizationService`) | **Terminado**; probado sintéticamente |
| `IaPermissionStore`, `IaEmployeeDirectory` | **Terminados**; **sin probar contra BD** |
| Ejecutor con alcance obligatorio y retirada de las 15 columnas | **Terminado**; probado sintéticamente |
| Orquestador (autorización por consulta/exportación, memoria, "no disponible") | **Terminado**; **desactivado por defecto** (interruptor) |
| DI e interruptor en `Program.cs` | **Terminado** (compila; arranque real sin verificar) |
| Frontend "No disponible" vs cero | **Terminado**; sin pruebas automáticas ni manuales en navegador |
| SQL 01, 02, 08, 09, 10, 12, 13, Aceptación | **Preparados; ninguno ejecutado ni validado en SQL Server** |
| Pantalla y API de mantenimiento de permisos | **No implementadas** (tarea del plan) |
| Visibilidad persistente de fallos de auditoría | **No implementada** |

**Falta para probar el flujo real**: ejecutar los scripts por etapas y corregir lo que SQL Server rechace; desplegar el backend; cuentas controladas; los casos de aceptación; verificar las consultas Dapper con datos reales; decidir el `GRANT EXECUTE` de la auditoría.

## 7. Auditoría del IA Chat
`dbo.sp_IaChatAuditoria_Insertar` **no existe** en `JC_Db` (11_…): la auditoría nunca registró nada. Corregir con `01_IaChatAuditoria.sql` (decisión del responsable) y confirmar con `12` (C08). Mientras no exista, los accesos denegados tampoco quedarán registrados.
