-- ============================================================================
-- SOLO LECTURA — Verificacion de la auditoria del IA Chat. No inserta, no modifica, no ejecuta el SP.
-- Objetivo: distinguir "nunca se uso" de "se intento registrar y fallo". Una tabla vacia NO prueba falta de uso
-- porque IaAuditService traga los errores de registro (solo escribe un aviso en el log).
-- Devolver TODOS los result sets.
-- ============================================================================
SET NOCOUNT ON;

-- [A1] El procedimiento existe? (sin fila = NO existe: toda llamada de auditoria falla en silencio)
SELECT o.name AS Procedimiento, o.create_date AS Creado, o.modify_date AS Modificado
FROM sys.objects o WHERE o.object_id = OBJECT_ID(N'dbo.sp_IaChatAuditoria_Insertar', N'P');

-- [A2] Parametros del procedimiento (el codigo envia @IdUsuario, @Modulo, @Pregunta, @Herramienta,
--      @ParametrosJson, @DuracionMs, @CantidadRegistros, @FueExitoso, @MensajeError)
SELECT p.parameter_id AS Orden, p.name AS Parametro, TYPE_NAME(p.user_type_id) AS Tipo, p.max_length AS LongitudBytes, p.has_default_value AS TieneDefault
FROM sys.parameters p WHERE p.object_id = OBJECT_ID(N'dbo.sp_IaChatAuditoria_Insertar')
ORDER BY p.parameter_id;

-- [A3] Tabla: columnas, nulabilidad, triggers y restricciones que podrian rechazar el INSERT
SELECT c.column_id AS Orden, c.name AS Columna, TYPE_NAME(c.user_type_id) AS Tipo, c.max_length AS LongitudBytes,
       c.is_nullable AS PermiteNull, c.is_identity AS EsIdentity
FROM sys.columns c WHERE c.object_id = OBJECT_ID(N'dbo.IaChatAuditoria') ORDER BY c.column_id;

SELECT tr.name AS NombreTrigger, tr.is_disabled AS Deshabilitado FROM sys.triggers tr WHERE tr.parent_id = OBJECT_ID(N'dbo.IaChatAuditoria');
SELECT cc.name AS Restriccion, cc.definition AS Definicion FROM sys.check_constraints cc WHERE cc.parent_object_id = OBJECT_ID(N'dbo.IaChatAuditoria');

-- [A4] Evidencia de uso historico de la identidad: last_value NULL = el IDENTITY nunca se uso (nunca hubo INSERT
--      o la tabla se recreo/trunco). last_value > 0 con 0 filas = hubo filas y se borraron.
SELECT ic.name AS ColumnaIdentity, ic.last_value AS UltimoValorUsado, IDENT_CURRENT(N'dbo.IaChatAuditoria') AS IdentCurrent,
       (SELECT COUNT(*) FROM dbo.IaChatAuditoria) AS FilasActuales
FROM sys.identity_columns ic WHERE ic.object_id = OBJECT_ID(N'dbo.IaChatAuditoria');

-- [A5] Ejecuciones del procedimiento segun la cache de planes (se vacia al reiniciar o modificar el objeto: vacio no prueba nada)
SELECT ps.last_execution_time AS UltimaEjecucion, ps.execution_count AS Ejecuciones, ps.cached_time AS PlanEnCacheDesde
FROM sys.dm_exec_procedure_stats ps
WHERE ps.database_id = DB_ID() AND ps.object_id = OBJECT_ID(N'dbo.sp_IaChatAuditoria_Insertar');

-- [A6] Permisos explicitos sobre el procedimiento y la tabla (quien puede ejecutar/insertar). Compare con el
--      usuario de BD con que se conecta la API (no se lee ni se muestra su cadena de conexion).
SELECT OBJECT_NAME(dp.major_id) AS Objeto, pr.name AS Principal, dp.permission_name AS Permiso, dp.state_desc AS Estado
FROM sys.database_permissions dp
JOIN sys.database_principals pr ON pr.principal_id = dp.grantee_principal_id
WHERE dp.major_id IN (OBJECT_ID(N'dbo.sp_IaChatAuditoria_Insertar'), OBJECT_ID(N'dbo.IaChatAuditoria'))
ORDER BY Objeto, Principal;

-- [A7] Usuarios de BD con rol que concede EXECUTE/INSERT amplio (db_owner, db_datawriter)
SELECT rp.name AS Rol, mp.name AS Miembro
FROM sys.database_role_members drm
JOIN sys.database_principals rp ON rp.principal_id = drm.role_principal_id
JOIN sys.database_principals mp ON mp.principal_id = drm.member_principal_id
WHERE rp.name IN (N'db_owner', N'db_datawriter')
ORDER BY rp.name, mp.name;
