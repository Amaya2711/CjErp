# CJ Intelligence — kit de instalación en JC_Db (versión final única)

**Versión:** ver `MANIFIESTO.md` (identificador y SHA-256 de cada archivo). Este kit **reemplaza** cualquier otra copia de los scripts 18–24 de rondas anteriores; úselo solo a él.
**Estado (2026-11-01 a 2026-11-02): BLOQUE 2 EJECUTADO (script 24 = OK tras la contra-firma 20e).** BLOQUE 1 COMPLETO en `JC_Db`: ejecutados `18`, `19`, `20`, `20c`, `22`, `23`, `23b` y validados con `21` (etapas 18, 19 y 20: 0 fallas) y `21b` (10/10). `22`: 152/152 pruebas OK; `23` (como `cj_ia`): 45/45 OK; limpieza en 0 filas. Pendientes con autorización aparte: script `24` (consulta real de pagos), rendimiento y despliegue. El módulo sigue DESHABILITADO. El `22` y el `23` se corrigieron durante la ejecución (tabla temporal demasiado corta; una expectativa desactualizada); no cambió ningún objeto instalado.
**No hacen:** no cambian objetos compartidos del ERP (`Planilla`, `Seg*`, `Usuario`, `IaToolPermiso`, `sp_IA_Planilla_Buscar`, el chat anterior), no consultan pagos (salvo el script 24, aparte), no despliegan nada.

---

## 0. NO CONTINUAR SI… (requisitos antes de instalar)

**Estado comprobado el 2026-11-01 (solo lectura, antes de preparar este kit): el requisito del log NO está cumplido.**
Modelo FULL, `log_reuse_wait_desc = LOG_BACKUP`, log usado al 99,86 %, 0 respaldos de log en los últimos 7 días, 8,6 GB libres en el volumen. **Con ese estado no se debe instalar.** Detalle: `docs/HALLAZGO_RESPALDO_LOG_JC_Db.md`.

| # | Requisito | Cómo se comprueba | Si no se cumple |
|---|---|---|---|
| 0.1 | **Hallazgo del log atendido** y respaldo completo reciente | Script `00` (solo lectura). Debe terminar con `Detener = 0` | **NO CONTINUAR.** La decisión (respaldos de log, modelo SIMPLE, ampliar disco) es del responsable de SQL Server |
| 0.2 | Ventana horaria acordada, sin usuarios activos del ERP | Acta | No continuar |
| 0.3 | **Respaldo confirmado y procedimiento de recuperación probado, por escrito** | Confirmación humana (abajo) | **NO CONTINUAR** |
| 0.4 | Instantánea previa guardada (`18a`) | Archivo de salida guardado | No continuar |
| 0.5 | Las variables de entorno del paso que va a ejecutar están definidas (sin escribir secretos en el script) | Sección 5 | No continuar |

**0.3 — qué confirmar (lo hace el responsable de SQL Server; no forma parte de los scripts):**
1. Ruta y nombre del último respaldo completo `JC_Db_AAAAMMDD.BAK` y quién lo genera (no hay jobs de SQL Agent: la edición es Express).
2. Verificación del archivo: `RESTORE VERIFYONLY FROM DISK = N'<ruta>' WITH CHECKSUM;` sin errores.
3. Idealmente, una **restauración de prueba** en otro nombre (`RESTORE DATABASE <otro_nombre> FROM DISK = ... WITH MOVE ...`) con el tiempo medido. Un respaldo que nunca se restauró no es evidencia de recuperación.
4. Nombre del responsable, fecha y el RPO aceptado (pérdida máxima de datos), anotados en el acta.

---

## 1. Cómo se ejecutan (SQLCMD, consola y SSMS)

| Script | ¿Requiere modo SQLCMD? | Por qué |
|---|---|---|
| `00`, `18a`, `21b` | **No** (T-SQL normal) | Solo lectura, sin variables |
| `18`, `18b`, `19`, `20`, `20b`, `20c`, `20d`, `22`, `24` | **Sí** | Empiezan con `:on error exit` (detiene todo ante el primer error) |
| `20`, `20c`, `21`, `23`, `23b`, `24` | **Sí** | Usan variables `$(NOMBRE)` |

**Por consola (recomendado, sobre todo para los que llevan secretos).** `sqlcmd` toma como variable de scripting cualquier **variable de entorno** del proceso, así que los secretos no aparecen en la línea de comandos ni en el script.
```powershell
# PowerShell. Defina el secreto solo en ESTA sesión, desde su gestor de secretos; no lo escriba en archivos.
$env:CJ_IA_PASSWORD = '<desde el gestor de secretos>'
sqlcmd -S <SERVIDOR> -d JC_Db -E -b -I -i .\20_CjIntelligence_Usuario_cj_ia.sql -o .\salida_20.txt
Remove-Item Env:CJ_IA_PASSWORD
```
- **`-I` es obligatorio**: activa `QUOTED_IDENTIFIER`, como hace SSMS. Sin él `sqlcmd` falla al crear los índices filtrados del script 18. Desde SSMS no hace falta.
- `-E` = autenticación de Windows; con autenticación SQL use `-U <admin>` y la clave en `$env:SQLCMDPASSWORD` (también de entorno).
- `-b` hace que `sqlcmd` termine con código de error si falla. **No use `-e`** (haría eco del script).
- Agregue `-C` solo si el certificado del servidor no es de confianza.
- La clave no puede contener comillas simples (los scripts 20 y 20c la incrustan entre comillas).

**Desde SSMS en modo SQLCMD.** `Consulta > Modo SQLCMD`, conéctese **a la base JC_Db** con un administrador y abra el archivo. SSMS resuelve `$(VAR)` desde las variables de entorno **del proceso de SSMS**: para los secretos, defina la variable de entorno **antes de abrir SSMS** (abra SSMS desde esa misma consola). Para valores **no secretos** puede escribir `:setvar NOMBRE valor` en la primera línea de la ventana. **Nunca escriba una contraseña con `:setvar`** (quedaría en el editor). Los scripts `23` y `24` deben ejecutarse **conectados como `cj_ia`** (nueva conexión con autenticación SQL); los demás, como administrador.

**Regla general de parada:** si cualquier paso muestra un **error**, o una fila **`FALLA`**, o `Fallas > 0`, **deténgase**. No ejecute el paso siguiente. Los scripts son idempotentes (`CREATE OR ALTER`, comprobaciones previas) y, ante un error, `:on error exit` impide que continúen.

---

## 2. BLOQUE 1 — Instalación y validación (carpeta `1_Instalacion_y_Validacion`)

Antes de empezar: sección 0 completa. Guarde la salida de cada paso (`-o`) junto con el acta.

| Paso | Script | Requisitos | Comando (consola) | Resultado esperado | Detenerse si |
|---|---|---|---|---|---|
| **0.1** | `00_..._Prechequeo_Log_Respaldo_SoloLectura.sql` | Administrador con lectura de `msdb` y `VIEW DATABASE STATE` | `sqlcmd -S <SERVIDOR> -d JC_Db -E -b -I -i 00_CjIntelligence_Prechequeo_Log_Respaldo_SoloLectura.sql -o salida_00.txt` | Ninguna fila `DETENER`; segunda tabla `Detener = 0` y `Veredicto` "SIN BLOQUEOS AUTOMÁTICOS" (las filas `CONFIRMAR` se resuelven por escrito) | Cualquier `DETENER`. **Hoy daría `NO CONTINUAR`** |
| **0.4** | `18a_..._Snapshot_SoloLectura.sql` | Sección 0 cumplida | `sqlcmd -S <SERVIDOR> -d JC_Db -E -b -I -i 18a_CjIntelligence_Snapshot_SoloLectura.sql -o snapshot_antes_18.txt` | Las 6 tablas del chat con 0 filas; archivo guardado | Alguna tabla con filas |
| **1** | `18_CjIntelligence_Esquema.sql` | Paso 0.4; tablas base vacías | `sqlcmd -S <SERVIDOR> -d JC_Db -E -b -I -i 18_CjIntelligence_Esquema.sql -o salida_18.txt` | Termina sin errores. Crea 5 tablas nuevas, cambia `IA_Conversacion.IdUsuario` a `NVARCHAR(50)`, agrega columnas, FK, índices y el disparador | Cualquier error (p. ej. 51002/51003 = hay filas) |
| **1v** | `21_..._Validacion_SoloLectura.sql` | Paso 1 | `sqlcmd -S <SERVIDOR> -d JC_Db -E -b -I -v Etapa=18 -i 21_CjIntelligence_Validacion_SoloLectura.sql -o salida_21_18.txt` | Última tabla: `Fallas = 0` | `Fallas > 0` → revertir (sección 4) |
| **2** | `19_CjIntelligence_Procedimientos.sql` | Paso 1v en verde | `sqlcmd -S <SERVIDOR> -d JC_Db -E -b -I -i 19_CjIntelligence_Procedimientos.sql -o salida_19.txt` | Sin errores. Crea 3 funciones, 20 procedimientos y 1 vista (todos `fn_/sp_/vw_IA_Cj_*`) | Cualquier error |
| **2v** | `21` | Paso 2 | `... -v Etapa=19 -i 21_...sql -o salida_21_19.txt` | `Fallas = 0` | `Fallas > 0` |
| **3** | `20_CjIntelligence_Usuario_cj_ia.sql` | Paso 2v; `CJ_IA_PASSWORD` en el entorno | `$env:CJ_IA_PASSWORD='...'; sqlcmd -S <SERVIDOR> -d JC_Db -E -b -I -i 20_CjIntelligence_Usuario_cj_ia.sql -o salida_20.txt` | Sin errores. Crea login/usuario `cj_ia`, rol `rol_cj_ia` y 17 `GRANT EXECUTE` | Error (clave rechazada por la política, etc.) |
| **3v** | `21` | Paso 3 | `... -v Etapa=20 -i 21_...sql -o salida_21_20.txt` | `Fallas = 0` | `Fallas > 0` |
| **4** | `20c_CjIntelligence_Firma_Certificado.sql` | Paso 3v; `CJ_CERT_PASSWORD` en el entorno | `$env:CJ_CERT_PASSWORD='...'; sqlcmd -S <SERVIDOR> -d JC_Db -E -b -I -i 20c_CjIntelligence_Firma_Certificado.sql -o salida_20c.txt` | Sin errores. Crea certificado, usuario sin login, 8 `SELECT` y **firma** `sp_IA_Cj_Pagos_Buscar` | Error |
| **4v** | `21b_..._Validacion_Firma_SoloLectura.sql` | Paso 4 | `sqlcmd -S <SERVIDOR> -d JC_Db -E -b -I -i 21b_CjIntelligence_Validacion_Firma_SoloLectura.sql -o salida_21b.txt` | Todas las filas `OK` | Cualquier `FALLA` (p. ej. firma ausente) |
| **5** | `22_CjIntelligence_PruebaFuncional.sql` | Pasos 1–4 en verde; **fuera de horario** (crea unas filas de prueba unos segundos) | `sqlcmd -S <SERVIDOR> -d JC_Db -E -b -I -i 22_CjIntelligence_PruebaFuncional.sql -o salida_22.txt` | Imprime `Propietarios temporales: A=<u1> B=<u2>` y candidatos de alcance. Todas las filas `OK` u `OMITIDA`; segunda tabla `Fallas = 0`; fila final "Limpieza: no quedan filas" = `OK` | `Fallas > 0`, fila `ERROR INESPERADO`, o interrupción → **sección 4.3** |
| **6** | `23_CjIntelligence_Pruebas_cj_ia.sql` | Paso 5; variables de usuarios de prueba; **conectado como `cj_ia`** (`SQLCMDPASSWORD` de `cj_ia`) | `$env:SQLCMDPASSWORD='<clave de cj_ia>'; $env:CJ_TEST_USER_A='<u1>'; $env:CJ_TEST_USER_B='<u2>'; $env:CJ_TEST_USER_PROPIO='<usuario PROPIO>'; sqlcmd -S <SERVIDOR> -d JC_Db -U cj_ia -b -I -i 23_CjIntelligence_Pruebas_cj_ia.sql -o salida_23.txt` | Todas `OK`; `Fallas = 0`; imprime `Limpiar como administrador: 23b con GuidPrueba=<guid>` | `Fallas > 0` o error de conexión de `cj_ia` |
| **7** | `23b_..._Limpieza_PorGuid.sql` | Paso 6 (el GUID impreso) | `sqlcmd -S <SERVIDOR> -d JC_Db -E -b -I -v GuidPrueba="<guid>" -i 23b_CjIntelligence_Limpieza_PorGuid.sql -o salida_23b.txt` | `FilasRestantes = 0` | Error 51501/51502 (GUID inexistente o no es de PRUEBA): no borra nada |
| **8** | `21` y `21b` (verificación final) | Paso 7 | `... -v Etapa=20 -i 21_...sql` y `... -i 21b_...sql` | `Fallas = 0`; "Sin datos…" en `OK` (se limpió); **0 conflictos de identidad** | Cualquier falla: no habilitar nada |

**Al terminar el Bloque 1 el módulo sigue deshabilitado.** Este kit no configura el backend, no cambia cadenas de conexión ni toca Railway.

Qué hace cada pieza (resumen para la revisión): el `22` prueba persistencia, idempotencia, bloqueo, recuperación, permisos vigentes, **identidad permanente** (primera huella, reingreso, CONTINUAR, SEPARAR, restauración forzada, fallo forzado de `Resolver`) y escribe solo filas nuevas en conversaciones que él crea, que él mismo limpia por GUID; el `23` repite desde `cj_ia` lo que `cj_ia` no puede hacer; ninguno consulta pagos.

---

## 3. BLOQUE 2 — Consulta real de pagos (carpeta `2_Consulta_Real_Pagos`, independiente)

**Paso previo obligatorio (2.0): `20e_CjIntelligence_ContraFirma_SP_Compartido.sql`** (en `1_Instalacion_y_Validacion`). El primer intento del script 24 (2026-11-02) falló con `SELECT permission was denied on 'Constante'`: la firma del envoltorio (20c) **no** alcanza al SQL dinámico del procedimiento compartido `sp_IA_Planilla_Buscar` que éste llama. El 20e lo **contra-firma** con el mismo certificado (`ADD COUNTER SIGNATURE`). No cambia su código ni concede permisos nuevos, pero **modifica el estado de un objeto compartido del ERP** (su `modify_date` se actualiza) y cualquier `ALTER` futuro de `sp_IA_Planilla_Buscar` elimina la contra-firma (volver a ejecutar el 20e). Requiere autorización expresa. Comando (consola, `-U sa`, `CJ_CERT_PASSWORD` en el entorno; en SSMS, modo SQLCMD): `sqlcmd -S "<servidor,puerto>" -d JC_Db -U sa -b -I -i .e_CjIntelligence_ContraFirma_SP_Compartido.sql`. Esperado: una fila con `sp_IA_Planilla_Buscar | COUNTER SIGNATURE BY CERTIFICATE | cert_cj_ia_pagos`. Reversión: `Reversionf_CjIntelligence_ContraFirma_Reversion.sql`.
**Resultado verificado el 2026-11-02 (tercera ejecución del 24, ya con la contra-firma): `Veredicto = OK`**, 1 276 ms, 32 695 lecturas lógicas, alcance PROPIO, un único empleado, sin errores ni bloqueos.


**Solo con autorización expresa y separada** (del script, del día y de la ventana). Es la única consulta real de pagos del kit.
- **Requisitos:** Bloque 1 completo con `Fallas = 0`; `21b` en verde; respaldo y log según la sección 0; usuario con alcance PROPIO y un único empleado; fecha acordada.
- **Comando** (conectado como `cj_ia`, **timeout del cliente 30 s**):
```powershell
$env:SQLCMDPASSWORD='<clave de cj_ia>'; $env:CJ_TEST_USER_PROPIO='<usuario>'; $env:CJ_PAGOS_FECHA='2026-MM-DD'
sqlcmd -S <SERVIDOR> -d JC_Db -U cj_ia -t 30 -b -I -i 24_CjIntelligence_PruebaReal_Pagos_cj_ia.sql -o salida_24.txt
```
- **Resultado esperado:** columna `Veredicto = OK` (sin error, `NivelAplicado = PROPIO`, un único empleado). `FALLA_PERMISOS_SQL_DINAMICO` (229/230/297) significa que la firma no cubre el SQL dinámico: **no se amplían permisos**; se detiene y se corrige el diseño con aprobación.
- **Detener (`KILL` de esa sesión) si:** tiempo > 30 s, `logical_reads` > 500 000, bloqueos sobre otras sesiones > 5 s o cualquier síntoma de lentitud del ERP. Supervisión desde otra sesión de administrador (solo lectura): ver la consulta del encabezado del script 24 (filtra por `context_info = 0x434A49415245414C`).
- **No repetir ni ampliar** el rango sin nueva autorización. **No sustituye** el plan de rendimiento.

---

## 4. Reversión (carpeta `Reversion`) — sin eliminar datos reales

### 4.1 Cuál usar
| Hasta dónde llegó la instalación | Ejecutar, en este orden |
|---|---|
| Solo pasos 1–2 (`18` y/o `19`) | `18b` |
| Hasta el paso 3 (`20`) | `20b` → `18b` |
| Hasta el paso 4 (`20c`) | `20d` → `20b` → `18b` |
| Si se ejecutó la contra-firma (`20e`) | `20f` primero, y luego lo que corresponda de arriba |

Comandos: `sqlcmd -S <SERVIDOR> -d JC_Db -E -b -I -i <archivo>.sql -o salida_<archivo>.txt`. Antes de `20b`, quitar del entorno cualquier `ConnectionStrings__CjIntelligence` (si se hubiera configurado, lo que este kit no hace).

### 4.2 Por qué no eliminan datos reales
- **`18b` se niega a actuar (`THROW` + `:on error exit`) si cualquiera de las tablas de CJ Intelligence tiene filas** (`IA_Turno`, `IA_ResultadoConsulta`, `IA_ConversacionEstado`, `IA_Mensaje`, `IA_Conversacion`, `IA_AuditoriaConsulta`, `IA_IdentidadUsuario`, `IA_IdentidadAuditoria`). Solo elimina objetos creados por `18`/`19` y devuelve `IA_Conversacion.IdUsuario` a `INT` y `IA_AuditoriaConsulta` a 20 columnas.
- `20b` y `20d` solo eliminan el login/usuario/rol y el certificado/firma de este kit; no tocan datos.
- **Si ya hay conversaciones reales: NO use `18b`.** Deshabilite el módulo (no se registra en el backend) y consulte. `18b` no sirve después de la puesta en marcha.
- Verificación posterior: ejecute `18a` de nuevo y compare con `snapshot_antes_18.txt`.

### 4.3 Si el script 22 se interrumpe
No lo repita ni improvise. Cada creación imprimió `GUID de prueba creado: <guid>`.
1. Limpie cada conversación de prueba con `23b -v GuidPrueba="<guid>"` (solo borra si `Modulo = 'PRUEBA'`).
2. Revise lo que quedó de identidad (solo lectura): `SELECT * FROM dbo.IA_IdentidadUsuario; SELECT * FROM dbo.IA_IdentidadAuditoria;`. Las filas de los usuarios de prueba creadas por `22` (y solo si ese usuario **no tiene** conversaciones) pueden eliminarse **con sentencias `DELETE` acotadas por `IdIdentidad` o `IdUsuario` de esas filas**, revisadas por el responsable. Si alguna identidad pertenece a un usuario real con conversaciones reales, **no se toca**.
3. Hasta que `IA_IdentidadUsuario` e `IA_IdentidadAuditoria` queden sin filas de prueba, `18b` se negará a revertir (es lo esperado: protege datos).

---

## 5. Variables de entorno (solo nombres; nunca valores en archivos ni mensajes)

| Variable | Secreta | La usa | Contenido |
|---|---|---|---|
| `CJ_IA_PASSWORD` | **Sí** | `20` | Clave del login `cj_ia` (sin comillas simples; debe cumplir la política de contraseñas) |
| `CJ_CERT_PASSWORD` | **Sí** | `20c` | Clave de la llave privada del certificado de firma |
| `SQLCMDPASSWORD` | **Sí** | `23`, `24` (como `cj_ia`) y cualquier script como administrador SQL | Clave de la conexión actual de `sqlcmd` |
| `CJ_TEST_USER_A`, `CJ_TEST_USER_B` | No | `23` | Dos `IdUsuario` activos, distintos, con `IdEmpleado > 0` (los imprime el `22`) |
| `CJ_TEST_USER_PROPIO` | No | `23`, `24` | Usuario activo con nivel máximo PROPIO, sin totales globales y empleado único (lo imprime el `22`) |
| `CJ_TEST_USER_INACTIVO` | No (opcional) | `23` | Usuario con `IdEstado = 0`; si falta, esas pruebas se omiten |
| `CJ_PAGOS_FECHA` | No | `24` | Día `yyyy-MM-dd` autorizado |
| `-v Etapa=18\|19\|20` | No | `21` | Etapa de validación |
| `-v GuidPrueba="<guid>"` | No | `23b` | GUID que imprime el `22`/`23` |

Las claves de OpenAI y la cadena de conexión del backend (`ConnectionStrings__CjIntelligence`) **no se usan en este kit**.

---

## 6. BLOQUE 3 — Rendimiento y despliegue (PENDIENTES de autorización posterior; no se entregan scripts)
- **Plan de rendimiento** (hasta 7 ejecuciones controladas): otra autorización; no se ejecuta con el log o el disco en el estado actual.
- **Despliegue:** invocar `AddCjIntelligence` en el arranque del backend, definir la cadena `ConnectionStrings__CjIntelligence` (usuario `cj_ia`), `CjIntelligence:Enabled`, la confirmación `CjIntelligence:LoginReuseControlResolved` y publicar en Railway. Requiere: Bloque 1 completo, pruebas de integración satisfactorias, **control operativo de identidad con responsables designados** (`docs/CJ_INTELLIGENCE_PILOTO_CONTROL_IDENTIDAD.md`), clave de OpenAI como secreto del entorno.
- **Pendientes de operación (no bloquean la instalación):** retención del historial (sin purgas automáticas) y revisión de los seis usuarios (y los 33 sin huella válida).

---

## 7. Qué cambia en la base (para el acta)
- **Tablas existentes del chat modificadas:** `IA_Conversacion` (`IdUsuario` INT→`NVARCHAR(50)`; + `Modulo`, `UltimaSecuencia`, `BloqueoPropietario`, `BloqueoExpira`, `IdIdentidad`; CHECK, FK, índice y disparador), `IA_Mensaje` (+4 columnas, FK, 2 índices únicos filtrados), `IA_AuditoriaConsulta` (+`UsuarioLogin`).
- **Tablas nuevas:** `IA_Turno`, `IA_ConversacionEstado`, `IA_ResultadoConsulta`, `IA_IdentidadUsuario`, `IA_IdentidadAuditoria`.
- **Funciones / procedimientos / vista nuevos:** `fn_IA_Cj_UsuarioValido`, `fn_IA_Cj_Huella`, `fn_IA_Cj_IdentidadVigente`, 20 `sp_IA_Cj_*`, `vw_IA_Cj_Identidad_Conflicto`.
- **Seguridad:** login/usuario/rol `cj_ia` (17 `EXECUTE`, ningún permiso de tabla), certificado `cert_cj_ia_pagos`, usuario sin login con `SELECT` sobre 8 tablas, firma del envoltorio.
- **Sin cambios:** `Planilla`, `Seg*`, `Usuario`, `IaToolPermiso`, `IaChatAuditoria`, `sp_IA_Planilla_Buscar` y todo el ERP.
