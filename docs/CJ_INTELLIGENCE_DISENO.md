# CJ Intelligence — diseño de persistencia, identidad, bloqueo y permisos (propuesta)

Estado: **PROPUESTA. Ningún script se ha ejecutado en JC_Db** y la ejecución está bloqueada hasta que el responsable de SQL Server atienda `HALLAZGO_RESPALDO_LOG_JC_Db.md` y confirme respaldo y recuperación. Inspección de solo lectura: 2026-11-01.
Scripts: `CjERP.Backend/Database/IaChat/18`–`24`. Código nuevo local, sin registrar en `Program.cs` ni desplegado. El chat anterior (`/reportes/administrativo/iachat`, `IaOrchestrator`, `/api/ia-chat`) **no cambia**.
Etiquetas: **[E]** comprobado por ejecución · **[C]** observado en código/definiciones · **[PV]** pendiente de verificar.
Documentos hermanos: `CJ_INTELLIGENCE_DECISIONES_PENDIENTES.md` (estado de usuario, seis casos, identidad y reutilización de login, firma) y `HALLAZGO_RESPALDO_LOG_JC_Db.md`.

## 1. Alcance y límites
- No se modifican: `Planilla`, `Seg*`, `Usuario` (ni sus estados), `IaToolPermiso`, `IaChatAuditoria`, `sp_IA_Planilla_Buscar`, `sp_ValidarUsuario`, la autenticación general.
- Primera entrega: pagos, importes **separados por moneda**, sin conversión (`a_tipo_cambio_diario` no tiene filas activas: las columnas `*Soles` y de tipo de cambio del SP se descartan).
- Retención: **pendiente de decisión**; no hay purgas automáticas. Modelo de OpenAI configurable (`OPENAI_MODEL`; hoy `gpt-4.1-mini`); credenciales solo por entorno (`CJ_IA_PASSWORD`, `CJ_CERT_PASSWORD`, `SQLCMDPASSWORD`, `OPENAI_API_KEY`): no aparecen en scripts, archivos versionados ni mensajes.

## 2. Identidad, estado del usuario y reutilización
- `Usuario.IdUsuario` (PK, `nvarchar(50)`, `CI_AS`) es el **nombre de usuario**; se conserva exactamente como lo reconoce la autenticación; sensible a acentos (`LRODRIGUEZ` ≠ `LRODRÍGUEZ`). Cadena [C]: login → `sp_ValidarUsuario` → JWT con el valor canónico de la fila → JwtBearer + sesión → el controlador lee **solo** el claim `IdUsuario` → `@IdUsuario` en `sp_IA_Cj_*` → `fn_IA_Cj_UsuarioValido`.
- **Estado (decidido): 1 = activo, 0 = inactivo.** `fn_IA_Cj_UsuarioValido` exige exactamente un usuario con `IdEstado = 1`; inexistente, inactivo, NULL o ambiguo ⇒ denegación, aunque conserve roles o permisos. Se valida en **cada operación**, incluidas las que dependen de un token (renovar, resultado, estado, completar: sobre el propietario de la conversación) y al retomar conversaciones. No se cambian estados ni la autenticación general.
- **Protegido (argumentos manipulados):** el usuario nunca viene del cuerpo, la URL ni el modelo; los esquemas de herramienta lo rechazan; las conversaciones filtran por propietario; el envoltorio de pagos no acepta lista de empleados. **No protegido (backend comprometido):** puede enviar cualquier `@IdUsuario` activo y actuar como ese usuario (con su nivel, no más). Mitigaciones: privilegios mínimos, límites del envoltorio, auditoría (`UsuarioLogin`), JWT de 30 min.
- **Cambio o reutilización del login:** sin migraciones ni reasignaciones automáticas. Renombrar (solo por SQL directo) deja las conversaciones inaccesibles (fallo cerrado); **reutilizar** un login eliminado sí haría heredar el historial: política de no eliminar/reutilizar y endurecimiento opcional pendiente de tu decisión (detalle en el documento hermano, sección 3).

## 3. Alcance en SQL y elevación de privilegios (diseño objetivo: firma con certificado)
**Alcance [C]:** `sp_IA_Cj_Autorizacion_Alcance` deriva el alcance desde el usuario validado y sus concesiones **vigentes**: el nivel pedido no puede superar el concedido (51041); empleado titular único y positivo (51047) — **si no se resuelve, PROPIO/EQUIPO se deniegan y no se concede TOTAL**; equipo = titular + subordinados directos, máx. 500 (51048); totales globales solo con `PermiteTotalesGlobales` (51043); sin concesión o usuario inexistente/inactivo (51040); nivel ausente (51041). `sp_IA_Cj_Pagos_Buscar` **no recibe empleados**: devuelve por `OUTPUT` lo aplicado y el backend lo compara (`CjIntelligenceScopeEvidence.Matches`), abortando el turno si difiere. Seis usuarios con rol activo no resuelven empleado: siguen denegados; corrección de datos por separado.
**Elevación:** `sp_IA_Cj_Pagos_Buscar` se crea **sin `EXECUTE AS`**; el script `20c` lo **firma** con `cert_cj_ia_pagos`, cuyo usuario sin login tiene **SELECT solo sobre 8 tablas** y solo mientras el envoltorio firmado está en la pila. Exige no aplicar el `DENY` de esquema (anularía la firma). **Renovación: cualquier ALTER del envoltorio elimina la firma → `20c` → `21b`.** Sin firma, el modo RESUMEN falla con permiso denegado (no hay respaldo permisivo). `@SoloValidar = 1` **no** demuestra que la firma cubra el SQL dinámico: lo demuestra el script `24` (real, bajo `cj_ia`, pendiente de autorización). Detalle, objetos, dependencias y reversión en el documento hermano, sección 4. No se habilita ninguna configuración del servidor ni se amplían permisos para que funcione.

## 4. Modelo, bloqueo, caducidad y recuperación
```
IA_Conversacion 1─N IA_Turno 1─N IA_Mensaje   (máx. 1 'user' + 1 'assistant' por turno)
                         └──N IA_ResultadoConsulta ─N─1 IA_AuditoriaConsulta (IdAuditoria opcional)
IA_Conversacion 1─1 IA_ConversacionEstado
```
Todo apunta hacia `IA_Turno`/`IA_Conversacion`. Varias herramientas = varias filas `(IdTurno, Intento, Orden)`. Orden: `UltimaSecuencia` atómica + índice único. Evidencia: argumentos validados, `AlcanceNivel`/`AlcanceHash` (**lo aplicado por SQL**), `FechaConsulta`, filas, `Truncado`, totales por moneda, lo entregado al modelo y su hash; una respuesta basada en un resultado guardado lo marca (`resultado_guardado`).
**Bloqueo:** `BloqueoPropietario` (GUID por solicitud) + `BloqueoExpira`; adquisición atómica (`UPDLOCK, HOLDLOCK`); solo escribe quien es propietario **y** no expiró **y** el usuario sigue activo (51050); liberación condicionada. **Llamadas largas:** TTL 120 s; `CjIntelligenceTurnLease` renueva cada TTL/3; presupuesto ≤ 4 consultas, 90 s por llamada al modelo, 300 s por turno; si se pierde el bloqueo se cancela la llamada y no se guarda nada (garantía también en SQL, probada en 22 sección B). **Idempotencia:** `ClientMessageId` único; un turno completado devuelve lo guardado; el reintento reutiliza el mensaje guardado; máx. 3 intentos.

## 5. Cambios sobre tablas existentes (todas vacías y sin otros consumidores [E])
`IA_Conversacion`: `IdUsuario INT → NVARCHAR(50) NOT NULL` (aborta si hay filas) y 4 columnas nuevas; `IA_Mensaje`: 4 columnas, FK, 2 índices únicos filtrados; `IA_AuditoriaConsulta`: `ADD UsuarioLogin NVARCHAR(100) NULL` (aditivo). Nuevas: `IA_Turno`, `IA_ConversacionEstado`, `IA_ResultadoConsulta`.

## 6. Scripts: qué escribe cada uno y cuáles consultan pagos
| Script | ¿Escribe en JC_Db? | ¿Consulta pagos? |
|---|---|---|
| `18a` instantánea · `21` / `21b` validación | **No** (solo lectura) | No |
| `18` esquema | **Sí** (DDL: tablas/columnas/índices) | No |
| `19` 3 funciones, 20 procedimientos (17 con EXECUTE para `cj_ia`) y 1 vista | **Sí** (crea objetos) | No (define el envoltorio, no lo ejecuta) |
| `20` login, usuario y rol `cj_ia` + `GRANT EXECUTE` | **Sí** (login, usuario, rol, permisos) | No |
| `20c` certificado, usuario-certificado, SELECT sobre 8 tablas, firma | **Sí** (certificado, usuario, permisos, firma) | No |
| `22` prueba funcional (administrador) | **Sí**: filas de prueba (limpiadas **solo por los GUID creados**) | **No** (`@SoloValidar = 1`) |
| `23` pruebas como `cj_ia` · `23b` limpieza por GUID | **Sí**: 1 conversación de prueba; `23b` la borra | **No** (`@SoloValidar = 1`; el SP compartido solo se consulta con `HAS_PERMS_BY_NAME`) |
| **`24` prueba real de pagos como `cj_ia`** | **No** (solo tablas temporales) | **SÍ: 1 ejecución real**, RESUMEN, 1 empleado, 1 día, TOP 5 |
| Plan de rendimiento (sección 9; sin scripts preparados) | No | **SÍ: hasta 7 ejecuciones** |
| `18b`, `20b`, `20d` reversiones | Sí (eliminan objetos creados; `18b` aborta si hay datos) | No |
**Autorizar 18–23b (persistencia y permisos) NO autoriza `24` ni el plan de rendimiento**: son autorizaciones separadas de consultas de pagos, con sus propios límites y ventana.

## 7. Secuencia de ejecución (BORRADOR hasta revisar los archivos completos y resolver el hallazgo del log)
**Requisitos previos (todos):** (R1) respaldo completo del mismo día confirmado (último visto: 2026-11-01 10:09, ~3,5 GB, `JC_Db_20261101.BAK`) y **procedimiento de recuperación acordado** (quién, desde dónde, cuánto tarda); `18a` no sustituye un respaldo; **[PV]** no se probó una restauración. (R2) Hallazgo del log atendido por el responsable de SQL Server (no se cambia aquí el modelo de recuperación, archivos ni respaldos). (R3) Contraseñas de `cj_ia` y del certificado en el gestor de secretos del entorno. (R4) Aprobación del contenido y del horario.
| Paso | Script | Escribe datos | Consulta pagos | Validación (0 FALLA o se detiene) | Si falla |
|---|---|---|---|---|---|
| 0 | `18a` | no | no | salida guardada; 6 tablas con 0 filas | no continuar |
| 1 | `18` | sí (DDL) | no | `21 -v Etapa=18` | `18b` |
| 2 | `19` | sí (objetos) | no | `21 -v Etapa=19` (incluye: sin `EXECUTE AS`, filtro `IdEstado = 1`, usuario activo en 13 operaciones) | `18b` |
| 3 | `22` | sí (filas de prueba, limpiadas) | no | 0 FALLA; revisar OMITIDA; "no quedan filas" = 0 | limpiar con los GUID impresos; `18b` si no hay datos |
| 4 | `20` (`CJ_IA_PASSWORD`) | sí (login/usuario/rol) | no | `21 -v Etapa=20` | `20b` |
| 5 | `20c` (`CJ_CERT_PASSWORD`) | sí (certificado, permisos, firma) | no | `21b` (firmado y válido, 8 SELECT exactos, sin DENY) | `20d`; el módulo de pagos queda sin RESUMEN |
| 6 | `23` (+ `23b`) como `cj_ia` | sí (1 conversación de prueba) | no | 0 FALLA | `20d` + `20b`; no configurar la conexión |
| 7 | **`24`** como `cj_ia` | no | **sí (1 ejecución)** — **autorización aparte** | Veredicto `OK` | `FALLA_PERMISOS_SQL_DINAMICO`: la firma no cubre el SQL dinámico → no se amplían permisos; se revisa el diseño con aprobación |
| 8 | plan de rendimiento | no | **sí (≤ 7)** — **autorización aparte** | umbrales de la sección 9 | detener |
| 9 | cadena `ConnectionStrings__CjIntelligence` y despliegue | configuración | no | — **aprobación aparte** | quitar la cadena: módulo apagado |
**Detener el despliegue:** `sqlcmd` con `:on error exit` (cada script se detiene en el primer error); cero FALLA tras cada paso o se detiene todo; no se pasa al siguiente sin confirmación; ante un fallo se envía la salida y no se improvisa. **Apagado de emergencia:** sin `ConnectionStrings:CjIntelligence` el módulo no opera; el chat anterior no se ve afectado. **Después de cualquier cambio** de `sp_IA_Cj_Pagos_Buscar`: `20c` → `21b` → `22` (y `24` si hay autorización).

## 8. Reversión previa al uso vs recuperación posterior
Previa (`18b`, `20b`, `20d`): solo con 0 datos reales; `18b` aborta (51003) si cualquiera de las 6 tablas tiene filas. Posterior: no se usa `18b`; apagar el módulo, respaldo de las tablas `IA_*`, corregir hacia adelante, borrado lógico, restauración solo por decisión expresa.

## 9. Rendimiento (autorización aparte; no se ha ejecutado nada)
Evidencia [E]: consultas de 98–118 s con 28.665 y 40.528 filas en `IaChatAuditoria`; `TamanoPagina`/`TOP` no acotan el trabajo interno (el SP arma todos los candidatos antes de paginar). **Máximo 7 ejecuciones, una sesión, en serie:** (1) RESUMEN 7 días, un cliente, PROPIO; (2) RESUMEN 31 días TOTAL por moneda; (3) repetición de 2; (4) DETALLE 31 días, página 50; (5) RESUMEN del mes anterior; (6) RESUMEN 400 días (solo si 1–5 cumplen); (7) caso con 0 filas. **Durante** (sesión de vigilancia sobre `sys.dm_exec_requests`/`sys.dm_db_task_space_usage`; `KILL` solo de la sesión marcada con `CONTEXT_INFO`): tiempo > 30 s, lecturas lógicas > 500.000, bloqueos > 5 s, `tempdb` > 1 GB, timeout de cliente 30 s. **Solo al terminar:** `STATISTICS IO/TIME`, filas, plan real. El plan estimado **no está garantizado completo** (tablas temporales internas y 3 `sp_executesql`). La prueba 24 (1 ejecución) es previa e independiente.

## 10. Implementación local y pruebas (tres capas SEPARADAS)
| Capa de pruebas | Proyecto | Qué usa | Estado |
|---|---|---|---|
| **Unitarias** (dobles, sin red ni SQL) | `Tests/CjERP.Backend.Tests.Ia` | proveedor, herramientas, resumidor, servicio de chat, identidad, latido, autorización | **[E]** 535 pasan, 0 fallan, 9 omitidas (alcance del chat anterior) |
| **Unitarias del controlador y registro** | `Tests/CjERP.Backend.Tests.Api` (nuevo; referencia `CjERP.Api`) | `CjIntelligenceController` con servicio doble, `AddCjIntelligence` | **[E]** 20 pasan |
| **Integración SQL** (categoría `SqlIntegration`) | `Tests/CjERP.Backend.Tests.Integration` (nuevo) | JC_Db con la conexión de `cj_ia`; **escribe** 1 conversación de prueba (se limpia con `23b`) | omitidas por defecto (`CJ_SQL_INTEGRATION=1`); **[PV]** sin ejecutar |
| **Consulta real de pagos** (categoría `PagosReal`) | mismo proyecto | 1 consulta como `cj_ia` (equivale al 24) | omitida por defecto (`CJ_SQL_PAGOS_REAL=1`, autorización aparte) |
| **OpenAI real** (categoría `OpenAiLive`) | mismo proyecto | 2 llamadas cortas, sin datos del ERP | omitidas por defecto (`OPENAI_LIVE_TESTS=1` + `OPENAI_API_KEY`) |
`dotnet test` normal **no** toca SQL ni OpenAI: las 7 pruebas de integración salen "Skipped" [E].
Piezas: contratos (`Application/DTOs/CjIntelligence`, `ICjIntelligenceChatService`); `OpenAiToolChatProvider` (herramientas, tokens, reintentos, modelo configurable); `CjIntelligencePagosTools` (validación estricta); `CjIntelligenceResultSummarizer`; `CjIntelligenceChatService`; acceso a datos SQL (`CjIntelligenceData`, `CjIntelligenceAuthorization`); `CjIntelligenceController` (`/api/ai/*`; responde "deshabilitado" mientras no se registre) y `CjIntelligenceRegistration` (**no** invocado desde `Program.cs`). Frontend: `clientMessageId`, `idUsuario` texto (`tsc` sin errores). El acceso SQL y el procedimiento firmado **solo** se prueban contra la base (22, 23, 24 y las pruebas de integración).

## 11. Pendiente
Hallazgo del log y respaldo/recuperación (responsable de SQL Server) · aprobación de contenido y horario · autorizaciones separadas de `24` y del plan de rendimiento · retención · control de reutilización de logins (endurecimiento opcional) · corrección de datos de los 6 usuarios y revisión de los 3 con `IdEstado = 0` y empleado activo · evaluación del modelo de OpenAI con preguntas reales cuando exista la clave en el entorno.

## 11. Correcciones de la ronda 3 (todo local; JC_Db sin cambios)
- **Compatibilidad con permisos vigentes** (`CjIntelligenceHistoryGuard`): TOTAL solo se muestra con TOTAL vigente; PROPIO/EQUIPO solo si los empleados guardados siguen dentro del alcance actual; resultados con totales globales exigen el permiso vigente; solo el último intento por turno; el estado guardado se devuelve solo con filtros revalidados (sin cifras restringidas). Se aplica al abrir, reintentar, enviar al modelo y al reutilizar respuestas.
- **Atomicidad**: validar y escribir van en una transacción breve con UPDLOCK+HOLDLOCK sobre la conversación (Resultado_Registrar, Estado_Guardar, Completar, Fallar). Prueba de dos sesiones en `SqlConcurrency` (omitida por defecto).
- **Idempotencia**: `ClientMessageId` obligatorio; reutilizarlo con otro contenido da conflicto (409); primer mensaje sin `conversationId` usa `Turno_IniciarNueva` sin duplicar conversaciones.
- **Identidad permanente** (ver `CJ_INTELLIGENCE_IDENTIDAD.md`): `IA_IdentidadUsuario` + `fn_IA_Cj_UsuarioValido` con huella (`IdEmpleado` + documento); cada conversación lleva su `IdIdentidad` (inmutable); un login reutilizado queda denegado y solo un administrador lo resuelve (`CONTINUAR` solo con el mismo documento y confirmación de la misma persona; `SEPARAR` archiva) con auditoría en `IA_IdentidadAuditoria`. `IdEmpleado` NO se da por estable (reingreso, `MAX+1`, sin clave única en `Empleado`); el escenario «mismo `IdEmpleado` reutilizado» solo se detecta si cambia el documento: **no resuelto**. Sin evidencia de alcance (nivel o lista de empleados ilegible, respuesta sin turno) lo guardado se **excluye siempre**, también para TOTAL.
- **Registro**: `AddCjIntelligence` exige `Enabled`, cadena `CjIntelligence` y `LoginReuseControlResolved = true`; la bandera es solo confirmación operativa, el control real es el de SQL. Antes: la reutilización de logins sigue **pendiente y bloquea habilitar el módulo**.
- Pruebas: Ia 616 OK / 9 omitidas; Api 28 OK; Integration 9 omitidas (dos sesiones, primer mensaje simultáneo, identidad de extremo a extremo). SQL: 14 scripts con sintaxis OK, ninguno ejecutado.

## 12. Objetos de JC_Db que se modificarían o crearían (NADA ejecutado)
- Tablas existentes: `IA_Conversacion` (IdUsuario INT→NVARCHAR(50), +Modulo, UltimaSecuencia, BloqueoPropietario, BloqueoExpira, CHECK), `IA_Mensaje` (+IdTurno, Secuencia, FinishReason, DuracionModeloMs, FK, 2 índices únicos filtrados), `IA_AuditoriaConsulta` (+UsuarioLogin).
- Tablas nuevas: `IA_Turno`, `IA_ConversacionEstado`, `IA_ResultadoConsulta`, `IA_IdentidadUsuario`, `IA_IdentidadAuditoria`. `IA_Conversacion` además: `IdIdentidad` (NOT NULL, FK) y el disparador `TR_IA_Conversacion_Identidad`.
- Procedimientos existentes modificados: **ninguno** (`sp_IA_Planilla_Buscar` intacto).
- Nuevos: `fn_IA_Cj_UsuarioValido`, `fn_IA_Cj_Huella`, `fn_IA_Cj_IdentidadVigente`, `vw_IA_Cj_Identidad_Conflicto` y 20 `sp_IA_Cj_*` (Identidad_Asegurar [interno] e Identidad_Resolver [solo administrador], Pagos_Buscar, Autorizacion_Alcance/Permisos/Empleado/Equipo, Conversacion_Crear/Listar/Abrir/Renombrar/Eliminar, Turno_Iniciar/IniciarNueva/Renovar/Completar/Fallar, Resultado_Registrar, Estado_Guardar, Auditoria_Registrar).
- Seguridad: login/usuario `cj_ia`, EXECUTE sobre 17 SP, certificado `cert_cj_ia_pagos`, usuario-certificado con SELECT sobre 8 tablas, firma del envoltorio.
