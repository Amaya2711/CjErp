# CJ Intelligence — control operativo de identidad para el piloto

Cubre el escenario que el diseño técnico no detecta por sí solo: **otra persona recibe el mismo login con el mismo `IdEmpleado` y el mismo documento** (por ejemplo, un registro de empleado reutilizado sin actualizar el documento). Mientras el ERP no lo impida, lo cubre este procedimiento. **No amplía el ERP.**

**Estado: definido; responsables SIN designar.** Los roles están definidos abajo. Los nombres los designa usted; este documento no los inventa. **El piloto no se habilita hasta que cada rol tenga un nombre y un suplente.**

## 1. Roles y responsables
| Rol | Qué hace | Responsable | Suplente |
|---|---|---|---|
| **Dueño del control** (Jefe de RRHH) | Valida quiénes están habilitados; aprueba toda resolución de identidad; firma la conciliación | *por designar* | *por designar* |
| **Operador de acceso** (TI / administrador SQL) | Suspende y restablece el acceso; ejecuta `CONTINUAR` / `SEPARAR`; guarda la evidencia | *por designar* | *por designar* |
| **Aprobador de dirección** | Aprueba el alcance (PROPIO / EQUIPO / TOTAL) de cada habilitado | *por designar* | *por designar* |

## 2. Quién está habilitado (lista de personas validadas)
- La **lista de habilitados** es el conjunto de usuarios con permiso activo del módulo (`IaToolPermiso`). **Nadie entra sin** una solicitud escrita del Aprobador de dirección y la validación del Dueño del control (nombre, **documento**, cargo, jefe).
- Antes de habilitar a cada persona, el Operador comprueba que `fn_IA_Cj_Huella` le devuelve una huella válida (empleado y documento presentes). Sin huella válida **no se habilita**.
- La lista se guarda con fecha y firma del Dueño del control.

## 3. Avisos de reingresos, bajas y reasignaciones
Regla: **ningún cambio de persona detrás de un login de la lista se aprueba en el ERP antes de avisar a TI.**
1. **Quién avisa:** RRHH, **antes** de aprobar en el ERP un alta, reingreso, cambio de empleado o corrección de documento que pueda tocar a un usuario de la lista (el flujo de aprobación reapunta la fila de `Usuario` si el login ya existe).
2. **Cómo:** solicitud escrita a TI (ticket o correo) con: login, nombre actual y nuevo, documento anterior y nuevo, motivo, fecha efectiva.
3. **Plazo:** el aviso llega **antes** de la aprobación; sin aviso, el Operador no restablece nada.
4. **Bajas:** RRHH avisa el mismo día; el Operador suspende el acceso el mismo día.

## 4. Suspensión y SEPARAR antes de entregar un login a otra persona
Responsable: **Operador de acceso**, con aprobación del **Dueño del control**.
1. **Suspender:** al recibir el aviso, el Operador desactiva el permiso del módulo del login (`IaToolPermiso.EsActivo = 0`) y registra fecha y hora. Desde ese momento el login no usa el módulo.
2. **Decidir (Dueño del control):**
   - *¿Es la misma persona?* Solo con evidencia (mismo documento verificado en la ficha de RRHH): `CONTINUAR`, con la evidencia y la confirmación de misma persona.
   - *¿Es otra persona, o el documento cambió, o hay duda?* `SEPARAR`. **Con duda se separa**; nunca se continúa.
3. **Ejecutar** (Operador): `sp_IA_Cj_Identidad_Resolver` con aprobador, motivo y evidencia. Verifica la fila nueva en `IA_IdentidadAuditoria` (acción, administrador, valores antes y después).
4. **Entregar el login a la otra persona solo después de que SEPARAR esté ejecutado y verificado.** Si el login ya se entregó antes, el acceso permanece suspendido hasta ejecutar SEPARAR.
5. **Restablecer:** el Operador reactiva el permiso únicamente después del paso 3.
6. **Documento corregido:** el sistema deniega y exige revisión. No se continúa ni se reasigna el historial automáticamente; decide el Dueño del control como en el paso 2.

## 5. Conciliación periódica (red de seguridad)
**Frecuencia:** semanal durante el piloto. **Responsable:** Operador prepara; Dueño del control revisa y firma.
- **Conflictos pendientes** (solo lectura): `SELECT * FROM dbo.vw_IA_Cj_Identidad_Conflicto;` debe devolver 0 filas, o cada fila tiene un caso abierto.
- **Personas detrás de cada login habilitado** (solo lectura): el Operador lista, para cada usuario de la lista, nombre, documento, cargo, fecha de ingreso y baja, y RRHH confirma que la persona que usa el login es la de la lista. Un cambio de nombre o cargo no avisado dispara el paso 4.
```sql
-- SOLO LECTURA. Personas detras de los logins con permiso activo del modulo (no modifica nada).
SELECT u.IdUsuario, u.IdEmpleado, cj.NombreEmpleado, cj.IdDocumento, cj.NroDocumento, cj.IdCargo, cj.fechaingreso, cj.FechaBaja, cj.IdActivo
FROM dbo.Usuario u
JOIN dbo.Empleado e ON e.IdEmpleado = u.IdEmpleado
JOIN dbo.EmpleadoCj cj ON cj.IdEmpleado = e.IdEmpleadoCj
WHERE u.IdEstado = 1
  AND u.IdUsuario IN (SELECT upr.IdUsuario FROM dbo.SegUsuarioPerfilRol upr
                      JOIN dbo.IaToolPermiso t ON t.IdPerfilRol = upr.IdPerfilRol AND t.EsActivo = 1 AND upr.EsActivo = 1)
ORDER BY u.IdUsuario;
```
- **Cualquier discrepancia** (documento distinto, persona distinta, baja): suspender (paso 4.1) y resolver (4.2–4.5).

## 6. Evidencia y trazabilidad
- Cada resolución deja su fila en `IA_IdentidadAuditoria` (administrador SQL real, aprobador, motivo, evidencia, valores antes y después).
- El Operador archiva fuera de la base el ticket, la ficha de RRHH y la lista firmada (PV: la tabla de auditoría no impide que un administrador la borre; la copia externa es la garantía).

## 7. Límites
Este control es humano y depende de que RRHH avise. Lo que detecta el sistema: cambio de `IdEmpleado` o de documento. Lo que no detecta: el mismo registro reasignado sin avisar y sin cambiar el documento. Para eso existe la conciliación semanal. **No sustituye una restricción en el ERP**, que queda fuera de esta entrega.
