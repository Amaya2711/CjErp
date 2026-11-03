# Hallazgo: JC_Db sin respaldos de log, con el log al 99,8 % (requiere atención del responsable de SQL Server)

Fecha de la inspección: 2026-11-01. **Solo lectura.** Este proyecto **no** cambia el modelo de recuperación, no reduce archivos y no configura tareas de respaldo. Se documenta para que lo confirme y decida el responsable de SQL Server.

## Evidencia (consultas a `sys.databases`, `sys.database_files`, `sys.dm_db_log_stats`, `sys.dm_os_volume_stats`, `msdb`)
| Dato | Valor |
|---|---|
| Modelo de recuperación | **FULL** |
| Respaldos en `msdb` | 316 **completos** (tipo D), diarios, del 2025-09-15 al **2026-11-01 10:09**; **0 respaldos de log** (tipo L) en todo el historial |
| Último respaldo de log (`log_backup_time`) | 2025-09-15 14:21 (el día de creación de la base) |
| Motivo por el que el log no se libera | `log_reuse_wait_desc = LOG_BACKUP` |
| Tamaño del log | **41.987 MB**, de los cuales **41.920 MB usados (99,8 %)**; 686 VLF |
| Crecimiento del log | +64 MB por vez; máximo 2 TB (el límite real es el disco) |
| Datos (`ROWS`) | 3.697 MB |
| Volumen del archivo de log | 78 GB en total, **8 GB libres (10,9 %)** |
| Jobs de SQL Agent en `msdb.sysjobs` | **0**. La edición es **Express**, que no incluye SQL Agent: los respaldos completos diarios los ejecuta otro mecanismo que se desconoce |
| Respaldos completos | no dañados (`is_damaged = 0`), no `COPY_ONLY`, archivos `JC_Db_AAAAMMDD.BAK`, ~3,5 GB |

## Lectura
- En recuperación FULL el log solo se trunca con respaldos de log. Sin ellos crece indefinidamente: 41,9 GB desde la creación, ~**102 MB por día en promedio** (promedio desde 2025-09-15; el ritmo reciente puede ser mayor y no se midió).
- Con 8 GB libres, al ritmo promedio quedan del orden de **80 días** antes de agotar el disco; **no es una predicción**: depende de la carga real. Si el volumen se llena, SQL Server no puede escribir en el log y **toda la aplicación deja de poder modificar datos**.
- Solo se puede restaurar al instante del último respaldo completo (no a un punto intermedio), aunque la base esté en FULL.
- Un respaldo completo no trunca el log; los respaldos completos diarios existentes son válidos como punto de recuperación pero no resuelven el crecimiento.

## Qué no se sabe (confirmar con el responsable)
1. ¿Se esperan respaldos de log y no se están haciendo, o el modelo FULL es un residuo? ¿Qué RPO (pérdida máxima de datos aceptable) se espera?
2. ¿Quién ejecuta los respaldos completos (no hay jobs de SQL Agent; ¿tarea del sistema operativo, script externo, servicio gestionado?), dónde se copian y si se ha **probado una restauración** (el archivo `.BAK` está en el servidor; no se verificó su restaurabilidad).
3. ¿El disco del log se monitorea? ¿Hay alertas por espacio libre?
4. ¿Qué otros archivos comparten ese volumen de 78 GB?

## Decisión y acciones: solo del responsable
Opciones habituales (no se ejecutan aquí): respaldos de log periódicos con retención, o cambiar a recuperación SIMPLE si el RPO del último completo es aceptable; liberar espacio o ampliar el volumen. Reducir o truncar el log sin respaldo previo tiene consecuencias para la recuperación, por eso no se propone ni se ejecuta desde este proyecto.

## Relación con CJ Intelligence
- Los scripts 18–23 generan poco volumen de log (tablas nuevas sin datos masivos), pero **no deberían aplicarse con el log al 99,8 % y el disco al 89 %** sin que el responsable confirme que no hay riesgo inmediato.
- El plan exige respaldo confirmado antes de ejecutar (ver diseño, sección 7). Una instantánea de definiciones (`18a`) no sustituye un respaldo.
