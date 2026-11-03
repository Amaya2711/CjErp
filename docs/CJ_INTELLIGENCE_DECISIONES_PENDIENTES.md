# CJ Intelligence — decisiones, evidencia y casos abiertos

Inspección de **solo lectura** sobre JC_Db el 2026-11-01. No se modificó ningún dato, permiso, objeto ni configuración.
Etiquetas: **[E]** comprobado por consulta · **[C]** observado en código/definiciones · **[PV]** pendiente de validar.

## 1. `Usuario.IdEstado` — DECIDIDO: 1 = activo, 0 = inactivo; el filtro SE INCORPORA solo en CJ Intelligence
Confirmado por el responsable. **Efecto en los scripts:**
- `fn_IA_Cj_UsuarioValido` devuelve el usuario solo si existe **exactamente una** fila con ese nombre **y `IdEstado = 1`**. Usuario inexistente, ambiguo, con `IdEstado = 0`, **NULL** (la columna admite NULL; hoy no hay ninguno [E]) o cualquier otro valor ⇒ NULL ⇒ denegación, aunque conserve roles o permisos.
- Se evalúa en **cada operación**: las de conversación (crear, listar, abrir, renombrar, eliminar, iniciar turno), el alcance y las lecturas de autorización lo hacen vía `@IdUsuario`; las que dependen de un token (renovar, registrar resultado, guardar estado, completar) lo comprueban sobre el **propietario de la conversación**, así que un usuario desactivado a mitad de un turno **ya no puede seguir escribiendo** y, al retomar una conversación, no puede abrirla ni usarla.
- **No** se cambian estados en `dbo.Usuario`, **no** se modifica la autenticación general (`sp_ValidarUsuario`, `AuthService`) ni el chat anterior. Los usuarios inactivos siguen pudiendo iniciar sesión en el ERP (hallazgo aparte, abajo).
- Pruebas: script 21 (la definición exige `IdEstado = 1` y que las 13 operaciones relevantes usen la función), script 22 sección E (con un usuario **ya** inactivo: alcance, envoltorio, crear/listar/abrir/iniciar turno denegados; y con conversaciones de prueba insertadas a nombre del inactivo: no renueva, no registra resultados, no guarda estado, no completa; control con usuario activo que sí puede), script 23 sección 5 (como `cj_ia`) y una prueba unitaria en C# (cero filas ⇒ denegación). **[PV]** `IdEstado = NULL` no se puede probar con datos reales (no hay filas con NULL): se verifica por la definición (`NULL = 1` no es verdadero).

**Evidencia previa (para el registro) [E]:** la baja de empleado escribe `IdEstado = 0` ("Usuario desactivado"); `sp_UsuarioListar` filtra 1; el login no lo usa. Distribución: 313 con 1 y 15 con 0 (8 con empleado en baja, 3 con empleado activo, 4 sin EmpleadoCj). Usuarios afectados por el filtro: de los 15 inactivos, 14 sin rol activo ni uso del chat; **`UHINOJOSA`** tiene rol activo y permiso PROPIO (y además empleado sin resolver): quedará denegado en CJ Intelligence. Los 6 usuarios que usaron el chat anterior están activos.
- **Hallazgo aparte (fuera de este proyecto):** el login no valida `IdEstado`: los 15 usuarios desactivados pueden autenticarse en el ERP (1 con rol activo). Se informa; no se cambia aquí.
- **Para revisión de RRHH/TI:** 3 usuarios con `IdEstado = 0` cuyo empleado figura activo.

## 2. Usuarios observados (seis) — sin cambios automáticos [E]
Con rol activo y empleado no resuelto de forma única. **Con PROPIO/EQUIPO se mantienen denegados (`51047`); usuarios inexistentes o inactivos se deniegan con cualquier alcance; a nadie se le concede TOTAL como alternativa.** No se corrigen nombres, asociaciones, estados ni concesiones; se revisarán por separado.

| Usuario | Motivo | `IdEstado` | Concesión de IA | Chat |
|---|---|---|---|---|
| MTAFURT | no existe en `dbo.Usuario` | — | PROPIO | 0 |
| PCASTILLO | no existe en `dbo.Usuario` | — | PROPIO | 0 |
| ALAVALLE | `Empleado.IdEmpleadoCj` vacío o 0 | 1 | PROPIO | 0 |
| JRAMIREZ | igual | 1 | PROPIO | 0 |
| MTAFUR | igual | 1 | PROPIO | 0 |
| UHINOJOSA | igual; además `IdEstado = 0` (queda denegado también por el filtro de estado) | 0 | PROPIO | 0 |
Ninguno tiene asociaciones múltiples. **No se asume** que `MTAFURT` corresponda a `MTAFUR`: son nombres distintos para el sistema y para CJ Intelligence. Observación: 1 `Usuario.IdEmpleado` está compartido por dos usuarios (ambos resolverían al mismo `EmpleadoCj`; permisos por cuenta).

## 3. Identidad y reutilización del login — sin migraciones ni reasignaciones automáticas [E]/[C]
**Tipo y comparación de `Usuario.IdUsuario`:** `nvarchar(50) NOT NULL`, PK, collation `SQL_Latin1_General_CP1_CI_AS` (igual a la base y a las tablas que lo guardan; sin conflictos). Máximo real 14 caracteres. Sin espacios en los extremos. **10 de 328 contienen caracteres no ASCII.** La comparación **no distingue mayúsculas pero SÍ distingue acentos**: `LRODRIGUEZ` y `LRODRÍGUEZ` son **dos usuarios distintos** (se confundirían solo con una regla insensible a acentos, que no se usa).
**Reglas que se mantienen:** el login se conserva **exactamente como lo reconoce la autenticación** (el JWT lleva el valor canónico de la fila, no lo escrito); `fn_IA_Cj_UsuarioValido` compara con la collation de la columna y devuelve ese valor canónico; `IA_Conversacion.IdUsuario` lo guarda tal cual; C# lo compara con `Ordinal`; nunca se normaliza ni se compara con otra collation. `CjIntelligenceIdentity` acepta no ASCII y rechaza vacío, > 50 y controles.

**Qué pasaría con un cambio o reutilización del login (y qué se hace):**
| Situación | Efecto en conversaciones históricas | Tratamiento |
|---|---|---|
| Login **renombrado** (solo posible por SQL directo; ninguna pantalla ni código lo hace [C]) | Las conversaciones del nombre viejo quedan **inaccesibles** (fallo cerrado: ningún otro usuario las ve; el nombre nuevo no las hereda) | No se migran ni se reasignan automáticamente. Si se requiere recuperarlas, es una operación manual, auditada y aprobada, fuera de estos scripts |
| Login **eliminado** y luego **reutilizado** por otra persona (`SP_GenerarUsuario` verifica que el nombre no exista, pero nada impide regenerarlo tras un borrado) | La persona nueva **heredaría** las conversaciones del anterior: es el riesgo real | **Política:** los logins no se eliminan ni se reutilizan; el control de reutilización requiere decisión (ver abajo). Detección: el script 21 informa conversaciones cuyo propietario ya no existe en `Usuario`; y un login reutilizado **no** se detecta solo |
| Usuario **desactivado** (`IdEstado = 0`) | Conversaciones intactas pero **inaccesibles** mientras esté inactivo; al reactivarse vuelven a estar accesibles | Es el comportamiento buscado |
**Endurecimiento opcional (NO implementado, requiere tu decisión):** guardar en la conversación una marca del empleado asociado al crearla (`Usuario.IdEmpleado`) y exigir coincidencia al abrirla; si el login pasara a otra persona, dejaría de ver el historial. Costo: una columna más; si el empleado del usuario se re-vincula legítimamente, el historial quedaría oculto hasta que se apruebe un reasignado manual.
**FK:** la única FK hacia `Usuario` es `SegUsuarioMenuAccion` (0 filas, `NO ACTION`: bloquearía un renombrado si hubiera filas). Otras 12 tablas guardan el nombre como texto sin FK: el ERP ya depende de que el login sea inmutable.

## 4. Elevación de privilegios — DISEÑO OBJETIVO: firma con certificado (privilegios mínimos); `EXECUTE AS OWNER` queda descartada por ahora
Necesidad: el SQL dinámico de `sp_IA_Planilla_Buscar` (3 `sp_executesql`; modo RESUMEN) no hereda el encadenamiento de propiedad; `cj_ia` no tiene permisos de tabla. **Nada de esto se ha ejecutado.**

| Aspecto | Diseño (scripts 19 + 20 + 20c + 21b) |
|---|---|
| Objetos | certificado `cert_cj_ia_pagos` (clave privada con contraseña `CJ_CERT_PASSWORD`, **no** con la clave maestra); usuario **sin login** `usr_cert_cj_ia_pagos`; firma de `sp_IA_Cj_Pagos_Buscar` (sin `EXECUTE AS`) |
| Permisos efectivos | `cj_ia`: solo `EXECUTE` sobre 17 procedimientos propios (`sp_IA_Cj_Autorizacion_Alcance` es interno). El usuario-certificado: **SELECT únicamente** sobre `Planilla, Proyecto, Cliente, Site, Empleado, EmpleadoCj, Constante, a_tipo_cambio_diario` (las del SQL dinámico), **solo mientras el envoltorio firmado está en la pila**. No incluye `CuentaEmpleado`, `cabOrdenCompra`, `detOrdenCompra`, `Importar`. Sin INSERT/UPDATE/DELETE ni otras bases ni servidor |
| Dependencias | `cj_ia` (20); envoltorio sin `EXECUTE AS` (19); el SP compartido sigue usando esas 8 tablas en SQL dinámico (si cambia, la prueba 24 fallaría con 229 y habría que **proponer** un GRANT adicional; no se concede por iniciativa propia) |
| `DENY` de esquema | **No se aplica** (anularía la firma); se renuncia a esa capa. `cj_ia` sigue sin ningún GRANT de tabla; 21, 21b y 23 lo comprueban. 20c revoca un DENY previo si existiera |
| Firma inicial | `20c` (idempotente): certificado, usuario, GRANT, `ADD SIGNATURE` |
| Validación | `21b`: envoltorio sin `EXECUTE AS`; **firmado** con el certificado; firma **válida** para la definición actual (`sys.fn_check_object_signatures`); ningún otro procedimiento firmado; usuario sin login; exactamente 8 SELECT; sin acceso a tablas sensibles; sin DENY; `rol_cj_ia` sin GRANT de tabla; clave del certificado protegida por contraseña. Prueba funcional: **script 24** (real, bajo `cj_ia`) |
| **Renovación de la firma** | Cualquier `CREATE OR ALTER`/`ALTER` de `sp_IA_Cj_Pagos_Buscar` **elimina la firma**. Procedimiento tras modificarlo: (1) aplicar el cambio (19 o el `ALTER` aprobado) → (2) `20c` (vuelve a firmar; requiere `CJ_CERT_PASSWORD` del gestor de secretos) → (3) `21b` (debe dar 0 FALLA) → (4) `22` (`@SoloValidar`) → (5) `24` si hay autorización. Mientras esté sin firma, el modo RESUMEN **falla con permiso denegado** (no hay respaldo permisivo). Si el certificado o su contraseña se perdieran, se crea uno nuevo con `20d` + `20c` |
| Reversión | `20d` quita firma, usuario y certificado (el modo RESUMEN deja de funcionar). Volver a `EXECUTE AS OWNER` se prepararía aparte y requeriría nueva aprobación |
| [PV] | Que la firma cubra el SQL dinámico de un procedimiento **llamado** desde el firmado: `@SoloValidar = 1` **no** lo demuestra; lo demuestra el script 24 |
Comparación con la alternativa descartada: `EXECUTE AS OWNER` daba todo `dbo` dentro de la base y conservaba el `DENY`; la firma reduce el privilegio a SELECT sobre 8 tablas a cambio de procedimiento de re-firma y de perder el `DENY`.

## 5. Respaldos de log
Documentado por separado en `HALLAZGO_RESPALDO_LOG_JC_Db.md` (urgente: log al 99,8 %, ~8 GB libres). **Pendiente del responsable de SQL Server**; la ejecución de cualquier script sobre JC_Db sigue bloqueada hasta que confirme el respaldo disponible y el procedimiento de recuperación. No se cambia el modelo de recuperación, ni los archivos ni los respaldos desde este proyecto.

## Bloqueos, separados por lo que impiden
Nada de lo siguiente está ejecutado. Ejecutar scripts, pruebas con escritura, consultas reales de pagos, cambios de permisos y despliegues sigue **sin autorizar**.

### A. Para ejecutar cambios en JC_Db
| Bloqueo | Estado | Responsable |
|---|---|---|
| Atención del hallazgo del log (`docs/HALLAZGO_RESPALDO_LOG_JC_Db.md`, log al 99,8 %) | Pendiente | Responsable de SQL Server |
| Respaldo verificado antes de crear objetos | Pendiente | Responsable de SQL Server |
| Revisión final de los scripts 18–24 (esta entrega) | En revisión | Usted |
| Horario de ejecución (fuera de horario: 22 crea filas de prueba unos segundos) | Por acordar | Usted |
| Autorización expresa de ejecución; del script 24 y del plan de rendimiento aparte | Pendiente | Usted |

### B. Para habilitar el módulo a usuarios
| Bloqueo | Estado |
|---|---|
| Control de identidad (reutilización de logins): diseño y pruebas preparados en `CJ_INTELLIGENCE_IDENTIDAD.md`; **no resuelto** hasta aplicarlo y que `21` (0 conflictos), `22` (E–G), `23` y `SqlIdentityIntegrationTests` pasen | Preparado, no ejecutado |
| Escenario «otra persona con el mismo login, `IdEmpleado` y documento»: el sistema no lo detecta; **no se acepta como resuelto**. Control operativo definido en `CJ_INTELLIGENCE_PILOTO_CONTROL_IDENTIDAD.md` (validación de habilitados, aviso previo de reingresos, suspensión y SEPARAR antes de entregar un login, conciliación semanal) | Definido; **responsables por designar** (bloquea el piloto) |
| Estabilidad de `IdEmpleado`: puede cambiar (reingreso); la reutilización por `MAX+1` es una posibilidad de diseño no observada; hay 6 huecos de numeración de causa no confirmada; `Empleado` no tiene clave única | Documentado; **no confirmada** |
| Pruebas de integración satisfactorias (SQL, concurrencia de dos sesiones, primer mensaje simultáneo, pagos reales acotada) | Preparadas, **no ejecutadas** |
| Por usuario: solo los correctamente configurados (activo, huella válida = `IdEmpleado > 0` + documento en `EmpleadoCj`, permisos de `IaToolPermiso`). Hoy **280 de 313 activos** tienen huella válida; **33** quedarían denegados hasta corregir datos en RRHH | Los seis observados y esos 33 pueden seguir denegados sin bloquear a los demás |

### C. Para evaluar el modelo
| Bloqueo | Estado |
|---|---|
| Clave de OpenAI configurada como **secreto del entorno** (nunca en scripts, archivos ni mensajes), igual que la contraseña de `cj_ia` | Pendiente |

### D. Para completar la operación (no bloquean el piloto)
| Pendiente | Regla vigente |
|---|---|
| Retención del historial | Sin definir; **no existen purgas automáticas** |
| Revisión de los seis usuarios | No se corrigen datos automáticamente; permanecen denegados |
