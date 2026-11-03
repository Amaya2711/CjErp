# CJ Intelligence — identidad permanente y control de reutilización de logins

Estado: **preparado, NO ejecutado en JC_Db.** El módulo sigue deshabilitado. No se modifica `dbo.Usuario` ni se reasigna ninguna conversación sin aprobación explícita.

## 1. El problema
El propietario de una conversación es `Usuario.IdUsuario` (texto, clave primaria). Si ese login pasa a otra persona, la persona nueva heredaría el historial de la anterior (conversaciones, respuestas, cifras). `Usuario.Id` no sirve para distinguirlos (no es `IDENTITY`, no es único, existe un valor 0).

## 2. Ciclo de vida de `IdEmpleado` (revisión de reglas, código y datos; solo lectura, 2026-11-01)
`Usuario.IdEmpleado` apunta al `Empleado` legado, y éste a `EmpleadoCj.IdEmpleado` por `Empleado.IdEmpleadoCj`. Son tres identificadores distintos.

| Etapa | Qué hace el sistema (evidencia) | Consecuencia para `IdEmpleado` |
|---|---|---|
| **Creación** | `MantenimientoEmpleadosController` / `MantenimientoExternosController`: `IdEmpleado = ISNULL(MAX(IdEmpleado),0)+1` en `EmpleadoCj` (hay `UQ_EmpleadoCj_IdEmpleado`). El `Empleado` legado también usa `MAX+1` (`EnsureLegacyEmpleadoAsync`, `sp_EmpleadoCj_AprobarCompleto`). | No hay secuencia ni `IDENTITY`. **`Empleado` no tiene PK ni índice único**: hoy hay **1 `IdEmpleado` duplicado** en 4.748 filas. |
| **Baja** | `sp_EmpleadoCj_EliminarLogico`: `IdActivo = 0`. En `EmpleadoCj` hay 145 con `FechaBaja` y 22 con `IdEstado = 0`. No encontré borrado físico de `EmpleadoCj`, `Empleado` ni `Usuario` en el código. | El identificador se conserva. |
| **Reingreso** | Se crea una **fila nueva** en `EmpleadoCj` con `IdEmpleadoAnt` = la anterior (**1.064 filas**) y el documento se repite (**159 documentos** en más de una fila). Al aprobar, `EnsureUsuarioEmpleadoAsync` busca el `Usuario` por `IdEmpleado` **o por el login generado** y le hace `UPDATE`: nuevo `IdEmpleado`, `Clave = 'ADMIN'`, `IdEstado = 1`. | **La misma persona cambia de `IdEmpleado`.** |
| **Login generado** | `SP_GenerarUsuario` / `ResolveGeneratedUserName`: inicial + apellido (hasta 10 caracteres) mientras no exista ese login en `Usuario`. Si existe (homónimo), el `UPDATE` anterior **reapunta esa fila a otra persona**. | **Otra persona recibe el mismo login**, con un `IdEmpleado` nuevo y otro documento. |
| **Corrección** | Los `UPDATE` de `EmpleadoCj` no tienen restricción sobre el documento. Hoy **50 de 313 usuarios activos** tienen `NroDocumento` distinto entre `Empleado` y `EmpleadoCj` (la copia legada no se sincroniza); 9 `Empleado` y 33 `EmpleadoCj` sin documento. | El documento es editable y está incompleto. |
| **Huecos de numeración** | `EmpleadoCj` tiene 6 huecos (ids 1–1292, 1286 filas). **Existen huecos de numeración; su causa no está confirmada** (puede ser un borrado, una carga con saltos, una reversión u otra). | Sin conclusión sobre el origen. |
| **Reutilización por `MAX+1` (posibilidad por diseño)** | Como el nuevo `IdEmpleado` es `MAX+1`, si alguna vez se eliminara la **última** fila, su identificador se asignaría de nuevo a la siguiente persona. **No se observó ningún caso** ni se confirmó que el sistema elimine filas; se documenta como posibilidad. | Un `IdEmpleado` podría reutilizarse para otra persona. |

**Respuesta a la pregunta:** `IdEmpleado` **puede cambiar para la misma persona** (reingreso), **podría reutilizarse para otra** por el diseño `MAX+1` (posibilidad no observada; la causa de los huecos de numeración no está confirmada) y **no está protegido** por ninguna restricción en `Empleado`. **No se confirma su estabilidad** y por eso no se usa solo como huella.

## 3. Huella: `IdEmpleado` + documento
`fn_IA_Cj_Huella(login)` devuelve la huella actual: `IdEmpleado` y el SHA-256 de `IdDocumento:NroDocumento` normalizado (mayúsculas, sin espacios, guiones ni puntos), tomado de `EmpleadoCj` por la **misma cadena que el alcance** (Usuario → Empleado → EmpleadoCj). El documento identifica a la persona; `IdEmpleado` detecta el cambio de registro.

| Caso | `IdEmpleado` | Documento | Resultado |
|---|---|---|---|
| Normal | igual | igual | Acceso |
| Reingreso (misma persona) | **cambia** | igual | Denegado hasta **CONTINUAR** (permitido porque el documento es el mismo) |
| Homónimo / login reapuntado a otra persona | cambia | **cambia** | Denegado; **CONTINUAR se rechaza**; solo **SEPARAR** |
| **Mismo login y mismo `IdEmpleado` reutilizado para otra persona** | igual | **cambia** | Denegado; solo **SEPARAR** → **detectado** si el documento del registro es el de la persona nueva |
| Documento corregido (por error de digitación u otra causa) | igual | cambia | **Denegado y a revisión administrativa.** No se continúa ni se reasigna el historial de forma automática: CONTINUAR se rechaza; solo un administrador, con evidencia y aprobación, puede ejecutar SEPARAR (el historial queda archivado, no borrado) |
| Mismo login, mismo `IdEmpleado`, mismo documento | igual | igual | **No se distingue**: es, por definición, la misma persona según los datos |

**Escenario que pidió verificar (mismo login + mismo `IdEmpleado` reutilizado para otra persona): NO se declara resuelto.** El control lo detecta **solo si el documento del registro cambia con la persona**. Eso depende de un proceso que la base **no impone** (no hay restricción ni disparador sobre `NroDocumento`, y el documento falta o difiere en varios registros). Si alguien reutiliza el `IdEmpleado` **sin actualizar el documento**, el control no lo detecta. **Para el piloto el riesgo se cubre con un control operativo** (quién valida a las personas habilitadas, cómo se avisan reingresos y reasignaciones, quién suspende el acceso y ejecuta SEPARAR antes de entregar un login), definido en `CJ_INTELLIGENCE_PILOTO_CONTROL_IDENTIDAD.md`. Sigue **sin considerarse resuelto** técnicamente: una restricción en el ERP (documento válido al reasignar un empleado, o un identificador inmutable en `EmpleadoCj`) queda fuera de esta entrega.

## 4. Primera huella y huella ausente
- **Registro:** `sp_IA_Cj_Identidad_Asegurar` crea la identidad **al crear la primera conversación** (`Conversacion_Crear` o `Turno_IniciarNueva`) con la huella actual; es concurrente-seguro (bloqueo de rango + índice único filtrado: una sola identidad VIGENTE por login).
- **Huella ausente:** si falta cualquier dato (`IdEmpleado` ≤ 0, empleado legado repetido, sin `EmpleadoCj`, sin documento), `fn_IA_Cj_UsuarioValido` devuelve `NULL`: el login queda **denegado en todas las operaciones**, `Asegurar` lanza 51010 y **no se crea ninguna fila de identidad ni conversación**. Hoy: **280 de 313 usuarios activos** tienen huella válida; **33 quedarían denegados** (1 sin empleado válido, 32 sin documento o con la cadena incompleta). Se corrigen con datos de RRHH, no automáticamente (parte de la revisión de usuarios).
- El prefijo `~` queda reservado: ningún login que empiece con `~` es válido (hoy hay 0).

## 5. CONTINUAR y SEPARAR (solo administrador; sin `EXECUTE` para `cj_ia`)
`sp_IA_Cj_Identidad_Resolver` exige: acción, **aprobador**, **motivo** y **evidencia** (≥ 15 caracteres: cómo se comprobó que es o no la misma persona).
- **CONTINUAR:** además exige `@ConfirmaMismaPersona = 1` (**no basta con que sea el mismo login**) y **solo se permite si el documento no cambió**; si cambió, se rechaza (51074). Actualiza la huella; el historial se conserva.
- **SEPARAR:** es otra persona. El historial anterior **no se borra**: se archiva y deja de ser alcanzable (ver §6); la identidad anterior pasa a `RETIRADA` y el login recibe una identidad nueva y vacía.
- Ambos fallan sin hacer nada si no hay conflicto (51073) o si el login no tiene huella actual válida (51072).

## 6. Que SEPARAR no vuelva a exponer el historial al mismo login (cuatro barreras independientes)
1. **Propietario inalcanzable:** `IA_Conversacion.IdUsuario` y `IA_Turno.IdUsuario` pasan a `~retirada:<guid>`, que `fn_IA_Cj_UsuarioValido` nunca acepta como login.
2. **Identidad permanente en cada conversación:** `IA_Conversacion.IdIdentidad` (NOT NULL, FK a `IA_IdentidadUsuario`, **inmutable**). Todas las operaciones (listar, abrir, renombrar, eliminar, iniciar/renovar/completar turno, registrar resultado, guardar estado) exigen `IdIdentidad = fn_IA_Cj_IdentidadVigente(login)`. Aunque alguien devolviera `IdUsuario` al login, la conversación sigue siendo de la identidad `RETIRADA`.
3. **Disparador `TR_IA_Conversacion_Identidad`:** `IdIdentidad` no cambia nunca y `IdUsuario` solo cambia con la marca de sesión `cjia_resolver` que activa `Resolver`. **Es una protección contra actualizaciones accidentales** (un `UPDATE` suelto falla con 51080/51081); **no demuestra que solo `Resolver` pueda establecer la marca**: cualquier sesión con permiso puede llamar a `sp_set_session_context`. Una manipulación deliberada tampoco devolvería el historial, por la barrera 2 (`IdIdentidad`) y los permisos.
   - **Limpieza garantizada:** `Resolver` usa `TRY/CATCH`; activa la marca solo durante el archivado y la limpia al terminar bien y ante cualquier error (`sp_set_session_context` no es transaccional, así que un `ROLLBACK` no la limpia). El `CATCH` limpia la marca, revierte la transacción (archivado, identidad y auditoría juntos) y relanza el error original.
4. **Permisos:** `cj_ia` no tiene `UPDATE` sobre ninguna tabla ni `EXECUTE` sobre `Resolver`/`Asegurar`.

## 7. Identificación permanente de conversaciones
Las **anteriores** conservan para siempre el `IdIdentidad` con el que nacieron (ahora `RETIRADA`); las **nuevas** llevan el de la identidad nueva. La tabla `IA_Conversacion` está vacía hoy, así que no hay historial previo que atribuir (el script 18 aborta si tuviera filas).

## 8. Auditoría (`IA_IdentidadAuditoria`, una fila por resolución, sin borrado por la aplicación)
Fecha UTC, `IdUsuario`, acción, **login SQL real** (`ORIGINAL_LOGIN()`), aprobador declarado, motivo, evidencia, identidad anterior y posterior, **`IdEmpleado` y huella de documento anteriores y posteriores**, y cantidad de conversaciones y turnos archivados. `cj_ia` no puede leerla ni modificarla. Nota: la tabla no impide que un administrador la borre; es un límite de cualquier tabla sin control externo (PV: exportarla a un registro inmutable).

## 9. Pruebas — todas PREPARADAS, ninguna ejecutada
| Prueba | Qué demuestra |
|---|---|
| `21` etapa 18/19/20 (solo lectura) | Existen tablas, funciones, vista, FK y disparador; la función compara `IdEmpleado` y documento; las operaciones de conversación exigen la identidad vigente; **0 conflictos**; `cj_ia` sin `EXECUTE`/`SELECT` sobre identidad y auditoría |
| `22` secciones E–G (escribe; limpieza propia) | Primera huella; huella ausente (denegado, 51010, sin filas creadas); disparador (51080/51081); **reingreso** (denegado en listar/abrir/crear/turnos/pagos); validaciones de `Resolver` (51070/51071/51075); **CONTINUAR** con mismo documento (acceso e historial) y su auditoría completa; **mismo `IdEmpleado` con otro documento** (CONTINUAR rechazado 51074); **SEPARAR**: historial no accesible desde Abrir/Listar/Renombrar/Eliminar/Turno_Iniciar, no borrado, archivado, **restauración forzada de `IdUsuario` sin efecto**, conversaciones nuevas con la identidad nueva, auditoría de SEPARAR |
| `23` (como `cj_ia`) | `cj_ia` sin `EXECUTE` sobre `Resolver`/`Asegurar`, sin `SELECT` sobre identidad/auditoría, sin `UPDATE` sobre `IA_Conversacion` (se consulta con `HAS_PERMS_BY_NAME`, no se ejecuta) |
| `22` sección G8 (escribe; limpieza propia) | **Fallo forzado después de activar la marca**, sin ganchos de prueba: un turno ya archivado bajo el mismo propietario y `ClientMessageId` hace chocar el `UPDATE` de `IA_Turno` con el índice único (2601) tras activar la marca y archivar la conversación. Comprueba: se propaga el error original; la marca **no queda habilitada en la misma sesión**; un `UPDATE` directo de `IdUsuario` sigue rechazado (51081); `@@TRANCOUNT = 0`; el archivado se revirtió; la identidad no cambió; sin auditoría. Tras CONTINUAR y SEPARAR exitosos también comprueba que la marca queda limpia |
| `Tests.Api` `CjIntelligenceIdentityApiTests` (**unitarias, ejecutadas: 2/2**) | **Controlador real + servicio de chat real**: con conflicto de identidad todas las rutas responden 403 y el modelo y pagos no se alcanzan; tras SEPARAR, Abrir/Renombrar/Eliminar/Chat responden 404 y el listado queda vacío |
| `Tests.Integration` `SqlIdentityIntegrationTests` (**omitida**, gate `CJ_SQL_IDENTITY`) | El recorrido completo contra SQL real, **desde los procedimientos (store) y desde la API** (controlador real sobre el almacén real): reutilización, CONTINUAR sin confirmar (51075), CONTINUAR (acceso), documento distinto (51074), SEPARAR (404/200), identidades y auditoría; falla (no se omite en silencio) si el usuario de prueba ya usaba el módulo |
| Seguridad de las pruebas | Solo alteran la huella de la identidad **creada por la misma ejecución**; no tocan `Usuario`; limpian únicamente sus propios GUID, identidades y auditoría |

## 10. Cuándo se considera resuelto
No por la bandera `CjIntelligence:LoginReuseControlResolved` (solo confirmación operativa). Se considera resuelto cuando: (1) 18, 19 y 20 aplicados; (2) `21` sin fallas y con 0 conflictos; (3) `22` (E–G) y `23` sin fallas; (4) `SqlIdentityIntegrationTests` y la concurrencia aprobadas; **y (5) el control operativo del piloto (`CJ_INTELLIGENCE_PILOTO_CONTROL_IDENTIDAD.md`) tenga responsables designados y operando.** El escenario de otra persona con el mismo login, `IdEmpleado` y documento **no se acepta como resuelto**: el control operativo lo mitiga, no lo elimina. Todo requiere la autorización de ejecución, hoy pendiente.
