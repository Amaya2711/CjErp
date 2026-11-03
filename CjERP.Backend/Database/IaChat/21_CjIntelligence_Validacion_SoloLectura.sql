-- SOLO LECTURA. Validacion por etapas de los scripts 18, 19 y 20. No modifica nada.
-- Uso: sqlcmd -S <servidor> -d JC_Db -U <admin> -i 21_CjIntelligence_Validacion_SoloLectura.sql -v Etapa=18
--   Etapa=18 -> comprueba el esquema; Etapa=19 -> ademas funcion/procedimientos; Etapa=20 -> ademas el usuario cj_ia.
-- Cada fila: Resultado = OK | FALLA. CUALQUIER FALLA detiene el despliegue: no pasar a la etapa siguiente.
SET NOCOUNT ON;

DECLARE @E INT = $(Etapa);
DECLARE @r TABLE (Orden INT IDENTITY(1,1), Chequeo VARCHAR(140), Resultado VARCHAR(5), Detalle NVARCHAR(300));

IF @E NOT IN (18, 19, 20) THROW 51200, 'Etapa invalida: use 18, 19 o 20.', 1;

-- ===== Siempre: objetos compartidos sin cambios (fechas = las verificadas en la inspeccion del 2026-11-01).
-- sp_IA_Planilla_Buscar: tope 2026-11-02 08:31:38 = su contra-firma (script 20e, autorizada); su DEFINICION no se modifico. =====
INSERT @r (Chequeo, Resultado, Detalle)
SELECT 'Sin cambios: ' + v.n, CASE WHEN o.modify_date <= v.maxfecha THEN 'OK' ELSE 'FALLA' END, CONVERT(NVARCHAR(30), o.modify_date, 120)
FROM (VALUES ('IA_AuditoriaConsulta', CAST('2026-09-06 20:46:17' AS DATETIME)), ('IaChatAuditoria', '2026-06-12 08:21:14'),
             ('IaToolPermiso', '2026-10-03 08:59:55'), ('Planilla', '2026-10-29 19:50:31'), ('sp_IA_Planilla_Buscar', '2026-11-02 08:31:38'),
             ('Usuario', '2099-01-01')) v(n, maxfecha)
JOIN sys.objects o ON o.name = v.n AND o.type IN ('U', 'P')
WHERE v.n <> 'IA_AuditoriaConsulta' OR @E < 18;   -- tras el script 18 la auditoria cambia a proposito (columna agregada)

-- ===== Etapa 18: esquema =====
INSERT @r (Chequeo, Resultado, Detalle)
SELECT 'Tabla ' + n, CASE WHEN OBJECT_ID('dbo.' + n, 'U') IS NOT NULL THEN 'OK' ELSE 'FALLA' END, NULL
FROM (VALUES ('IA_Turno'), ('IA_ConversacionEstado'), ('IA_ResultadoConsulta'), ('IA_IdentidadUsuario'), ('IA_IdentidadAuditoria')) v(n);

INSERT @r (Chequeo, Resultado, Detalle)
SELECT 'Columna ' + t + '.' + c, CASE WHEN COL_LENGTH('dbo.' + t, c) IS NOT NULL THEN 'OK' ELSE 'FALLA' END, NULL
FROM (VALUES ('IA_Conversacion','Modulo'), ('IA_Conversacion','UltimaSecuencia'), ('IA_Conversacion','BloqueoPropietario'),
             ('IA_Conversacion','BloqueoExpira'), ('IA_Mensaje','IdTurno'), ('IA_Mensaje','Secuencia'),
             ('IA_Mensaje','FinishReason'), ('IA_Mensaje','DuracionModeloMs'), ('IA_AuditoriaConsulta','UsuarioLogin'),
             ('IA_Turno','IdUsuario'), ('IA_ResultadoConsulta','AlcanceEmpleados'), ('IA_ResultadoConsulta','UsaTotalesGlobales'),
             ('IA_IdentidadUsuario','IdEmpleado'), ('IA_IdentidadUsuario','HuellaDocumento'), ('IA_IdentidadUsuario','Estado'),
             ('IA_Conversacion','IdIdentidad'), ('IA_IdentidadAuditoria','AdminSql'), ('IA_IdentidadAuditoria','Evidencia')) v(t, c);

INSERT @r (Chequeo, Resultado, Detalle)
SELECT 'IA_Conversacion.IdUsuario es NVARCHAR(50) NOT NULL',
       CASE WHEN EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.IA_Conversacion') AND name = 'IdUsuario'
                         AND TYPE_NAME(user_type_id) = 'nvarchar' AND max_length = 100 AND is_nullable = 0) THEN 'OK' ELSE 'FALLA' END, NULL;

INSERT @r (Chequeo, Resultado, Detalle)
SELECT 'IA_AuditoriaConsulta tiene 21 columnas (20 originales + UsuarioLogin)', CASE WHEN COUNT(*) = 21 THEN 'OK' ELSE 'FALLA' END, CAST(COUNT(*) AS NVARCHAR(10))
FROM sys.columns WHERE object_id = OBJECT_ID('dbo.IA_AuditoriaConsulta');

INSERT @r (Chequeo, Resultado, Detalle)
SELECT 'Indice unico ' + n, CASE WHEN EXISTS (SELECT 1 FROM sys.indexes WHERE name = n AND is_unique = 1) THEN 'OK' ELSE 'FALLA' END, NULL
FROM (VALUES ('UX_IA_Turno_Usuario_ClientMessage'), ('UX_IA_Mensaje_Conversacion_Secuencia'),
             ('UX_IA_Mensaje_Turno_Rol'), ('UX_IA_ResultadoConsulta_Turno_Intento_Orden'), ('UX_IA_IdentidadUsuario_Vigente')) v(n);

INSERT @r (Chequeo, Resultado, Detalle)
SELECT 'Sin datos de CJ Intelligence antes del primer uso (' + t + ')', CASE WHEN n = 0 THEN 'OK' ELSE 'FALLA' END, CAST(n AS NVARCHAR(20))
FROM (SELECT 'IA_Turno' t, (SELECT COUNT_BIG(*) FROM dbo.IA_Turno) n UNION ALL SELECT 'IA_ResultadoConsulta', (SELECT COUNT_BIG(*) FROM dbo.IA_ResultadoConsulta)
      UNION ALL SELECT 'IA_ConversacionEstado', (SELECT COUNT_BIG(*) FROM dbo.IA_ConversacionEstado)) x
WHERE OBJECT_ID('dbo.IA_Turno', 'U') IS NOT NULL;   -- informativo: tras el uso real no debe exigirse

-- Informativo (vacio antes del primer uso): conversaciones cuyo propietario ya no existe en dbo.Usuario (login renombrado o eliminado)
INSERT @r (Chequeo, Resultado, Detalle)
SELECT 'Conversaciones con propietario inexistente en dbo.Usuario', CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FALLA' END, CAST(COUNT(*) AS NVARCHAR(20))
FROM dbo.IA_Conversacion c WHERE NOT EXISTS (SELECT 1 FROM dbo.Usuario u WHERE u.IdUsuario = c.IdUsuario);

-- ===== Etapa 19: funcion y procedimientos =====
IF @E >= 19
BEGIN
    INSERT @r (Chequeo, Resultado, Detalle)
    SELECT 'Procedimiento ' + n, CASE WHEN OBJECT_ID('dbo.' + n, 'P') IS NOT NULL THEN 'OK' ELSE 'FALLA' END, NULL
    FROM (VALUES ('sp_IA_Cj_Pagos_Buscar'), ('sp_IA_Cj_Autorizacion_Alcance'), ('sp_IA_Cj_Autorizacion_Permisos'),
                 ('sp_IA_Cj_Autorizacion_Empleado'), ('sp_IA_Cj_Autorizacion_Equipo'), ('sp_IA_Cj_Conversacion_Crear'),
                 ('sp_IA_Cj_Conversacion_Listar'), ('sp_IA_Cj_Conversacion_Abrir'), ('sp_IA_Cj_Conversacion_Renombrar'),
                 ('sp_IA_Cj_Conversacion_Eliminar'), ('sp_IA_Cj_Turno_Iniciar'), ('sp_IA_Cj_Turno_IniciarNueva'), ('sp_IA_Cj_Turno_Renovar'),
                 ('sp_IA_Cj_Turno_Completar'), ('sp_IA_Cj_Turno_Fallar'), ('sp_IA_Cj_Resultado_Registrar'),
                 ('sp_IA_Cj_Estado_Guardar'), ('sp_IA_Cj_Auditoria_Registrar'), ('sp_IA_Cj_Identidad_Asegurar'), ('sp_IA_Cj_Identidad_Resolver')) v(n);

    INSERT @r (Chequeo, Resultado, Detalle)
    SELECT 'Funcion fn_IA_Cj_UsuarioValido', CASE WHEN OBJECT_ID('dbo.fn_IA_Cj_UsuarioValido', 'FN') IS NOT NULL THEN 'OK' ELSE 'FALLA' END, NULL;

    INSERT @r (Chequeo, Resultado, Detalle)
    SELECT 'sp_IA_Cj_Pagos_Buscar NO usa EXECUTE AS (el privilegio lo aporta la firma, 20c)',
           CASE WHEN EXISTS (SELECT 1 FROM sys.sql_modules WHERE object_id = OBJECT_ID('dbo.sp_IA_Cj_Pagos_Buscar') AND execute_as_principal_id IS NULL) THEN 'OK' ELSE 'FALLA' END, NULL;

    INSERT @r (Chequeo, Resultado, Detalle)
    SELECT 'fn_IA_Cj_UsuarioValido exige IdEstado = 1 (usuario activo)',
           CASE WHEN OBJECT_DEFINITION(OBJECT_ID('dbo.fn_IA_Cj_UsuarioValido')) LIKE '%IdEstado = 1%' THEN 'OK' ELSE 'FALLA' END, NULL;

    INSERT @r (Chequeo, Resultado, Detalle)
    SELECT 'fn_IA_Cj_UsuarioValido exige que la identidad permanente (huella IdEmpleado) siga coincidiendo',
           CASE WHEN OBJECT_DEFINITION(OBJECT_ID('dbo.fn_IA_Cj_UsuarioValido')) LIKE '%IA[_]IdentidadUsuario%'
                 AND OBJECT_DEFINITION(OBJECT_ID('dbo.fn_IA_Cj_UsuarioValido')) LIKE '%IdEmpleado%' THEN 'OK' ELSE 'FALLA' END, NULL;

    INSERT @r (Chequeo, Resultado, Detalle)
    SELECT 'Funcion ' + n, CASE WHEN OBJECT_ID('dbo.' + n) IS NOT NULL THEN 'OK' ELSE 'FALLA' END, NULL
    FROM (VALUES ('fn_IA_Cj_Huella'), ('fn_IA_Cj_IdentidadVigente')) v(n);

    INSERT @r (Chequeo, Resultado, Detalle)
    SELECT 'IA_Conversacion.IdIdentidad es NOT NULL con FK y disparador de inmutabilidad',
           CASE WHEN EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.IA_Conversacion') AND name = 'IdIdentidad' AND is_nullable = 0)
                 AND EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_IA_Conversacion_Identidad')
                 AND OBJECT_ID('dbo.TR_IA_Conversacion_Identidad', 'TR') IS NOT NULL THEN 'OK' ELSE 'FALLA' END, NULL;

    INSERT @r (Chequeo, Resultado, Detalle)
    SELECT 'fn_IA_Cj_UsuarioValido compara IdEmpleado Y documento (huella)',
           CASE WHEN OBJECT_DEFINITION(OBJECT_ID('dbo.fn_IA_Cj_UsuarioValido')) LIKE '%fn[_]IA[_]Cj[_]Huella%'
                 AND OBJECT_DEFINITION(OBJECT_ID('dbo.fn_IA_Cj_UsuarioValido')) LIKE '%HuellaDocumento%' THEN 'OK' ELSE 'FALLA' END, NULL;

    INSERT @r (Chequeo, Resultado, Detalle)
    SELECT 'Operaciones sobre conversaciones exigen la identidad VIGENTE: ' + n,
           CASE WHEN OBJECT_DEFINITION(OBJECT_ID('dbo.' + n)) LIKE '%fn[_]IA[_]Cj[_]IdentidadVigente%' THEN 'OK' ELSE 'FALLA' END, NULL
    FROM (VALUES ('sp_IA_Cj_Conversacion_Listar'), ('sp_IA_Cj_Conversacion_Abrir'), ('sp_IA_Cj_Conversacion_Renombrar'), ('sp_IA_Cj_Conversacion_Eliminar'),
                 ('sp_IA_Cj_Turno_Iniciar'), ('sp_IA_Cj_Turno_Renovar'), ('sp_IA_Cj_Turno_Completar'), ('sp_IA_Cj_Resultado_Registrar'), ('sp_IA_Cj_Estado_Guardar')) v(n);

    INSERT @r (Chequeo, Resultado, Detalle)
    SELECT 'fn_IA_Cj_UsuarioValido exige huella valida (IdEmpleado > 0)',
           CASE WHEN REPLACE(OBJECT_DEFINITION(OBJECT_ID('dbo.fn_IA_Cj_UsuarioValido')), ' ', '') LIKE '%IdEmpleado>0%' THEN 'OK' ELSE 'FALLA' END, NULL;

    INSERT @r (Chequeo, Resultado, Detalle)
    SELECT 'La identidad se registra al crear conversaciones: ' + n,
           CASE WHEN OBJECT_DEFINITION(OBJECT_ID('dbo.' + n)) LIKE '%sp[_]IA[_]Cj[_]Identidad[_]Asegurar%' THEN 'OK' ELSE 'FALLA' END, NULL
    FROM (VALUES ('sp_IA_Cj_Conversacion_Crear'), ('sp_IA_Cj_Turno_IniciarNueva')) v(n);

    INSERT @r (Chequeo, Resultado, Detalle)
    SELECT 'Resolver limpia la marca de sesion al terminar y ante cualquier error (TRY/CATCH + ROLLBACK)',
           CASE WHEN OBJECT_DEFINITION(OBJECT_ID('dbo.sp_IA_Cj_Identidad_Resolver')) LIKE '%BEGIN CATCH%'
                 AND OBJECT_DEFINITION(OBJECT_ID('dbo.sp_IA_Cj_Identidad_Resolver')) LIKE '%ROLLBACK%'
                 AND (LEN(OBJECT_DEFINITION(OBJECT_ID('dbo.sp_IA_Cj_Identidad_Resolver'))) - LEN(REPLACE(OBJECT_DEFINITION(OBJECT_ID('dbo.sp_IA_Cj_Identidad_Resolver')), '@value = NULL', ''))) / LEN('@value = NULL') >= 3
                THEN 'OK' ELSE 'FALLA' END, NULL;

    INSERT @r (Chequeo, Resultado, Detalle)
    SELECT 'Vista de conflictos de identidad', CASE WHEN OBJECT_ID('dbo.vw_IA_Cj_Identidad_Conflicto', 'V') IS NOT NULL THEN 'OK' ELSE 'FALLA' END, NULL;

    INSERT @r (Chequeo, Resultado, Detalle)
    SELECT 'Conflictos de identidad pendientes (logins reutilizados)', CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FALLA' END, CAST(COUNT(*) AS NVARCHAR(20))
    FROM dbo.vw_IA_Cj_Identidad_Conflicto;

    INSERT @r (Chequeo, Resultado, Detalle)
    SELECT 'Valida usuario activo en cada operacion: ' + n,
           CASE WHEN OBJECT_DEFINITION(OBJECT_ID('dbo.' + n)) LIKE '%fn[_]IA[_]Cj[_]UsuarioValido%' THEN 'OK' ELSE 'FALLA' END, NULL
    FROM (VALUES ('sp_IA_Cj_Autorizacion_Alcance'), ('sp_IA_Cj_Autorizacion_Permisos'), ('sp_IA_Cj_Autorizacion_Empleado'),
                 ('sp_IA_Cj_Conversacion_Crear'), ('sp_IA_Cj_Conversacion_Listar'), ('sp_IA_Cj_Conversacion_Abrir'),
                 ('sp_IA_Cj_Conversacion_Renombrar'), ('sp_IA_Cj_Conversacion_Eliminar'), ('sp_IA_Cj_Turno_Iniciar'), ('sp_IA_Cj_Turno_IniciarNueva'),
                 ('sp_IA_Cj_Turno_Renovar'), ('sp_IA_Cj_Turno_Completar'), ('sp_IA_Cj_Resultado_Registrar'),
                 ('sp_IA_Cj_Estado_Guardar')) v(n);

    INSERT @r (Chequeo, Resultado, Detalle)
    SELECT 'Escritura bajo bloqueo es atomica (transaccion + UPDLOCK/HOLDLOCK sobre la conversacion): ' + n,
           CASE WHEN OBJECT_DEFINITION(OBJECT_ID('dbo.' + n)) LIKE '%UPDLOCK%' AND OBJECT_DEFINITION(OBJECT_ID('dbo.' + n)) LIKE '%HOLDLOCK%'
                 AND OBJECT_DEFINITION(OBJECT_ID('dbo.' + n)) LIKE '%BEGIN TRAN%' THEN 'OK' ELSE 'FALLA' END, NULL
    FROM (VALUES ('sp_IA_Cj_Resultado_Registrar'), ('sp_IA_Cj_Estado_Guardar'), ('sp_IA_Cj_Turno_Completar'), ('sp_IA_Cj_Turno_Fallar'),
                 ('sp_IA_Cj_Turno_Renovar'), ('sp_IA_Cj_Turno_Iniciar')) v(n);

    INSERT @r (Chequeo, Resultado, Detalle)
    SELECT 'Idempotencia: ClientMessageId es unico POR USUARIO',
           CASE WHEN EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_IA_Turno_Usuario_ClientMessage' AND is_unique = 1) THEN 'OK' ELSE 'FALLA' END, NULL;

    INSERT @r (Chequeo, Resultado, Detalle)
    SELECT 'sp_IA_Cj_Pagos_Buscar NO recibe lista de empleados del llamador',
           CASE WHEN NOT EXISTS (SELECT 1 FROM sys.parameters WHERE object_id = OBJECT_ID('dbo.sp_IA_Cj_Pagos_Buscar') AND name LIKE '@Alcance%') THEN 'OK' ELSE 'FALLA' END, NULL;

    INSERT @r (Chequeo, Resultado, Detalle)
    SELECT 'sp_IA_Cj_Pagos_Buscar devuelve lo aplicado (3 OUTPUT)',
           CASE WHEN (SELECT COUNT(*) FROM sys.parameters WHERE object_id = OBJECT_ID('dbo.sp_IA_Cj_Pagos_Buscar') AND is_output = 1
                      AND name IN ('@NivelAplicado', '@EmpleadosAplicados', '@GlobalesAplicado')) = 3 THEN 'OK' ELSE 'FALLA' END, NULL;

    INSERT @r (Chequeo, Resultado, Detalle)
    SELECT 'sp_IA_Cj_Pagos_Buscar tiene el modo @SoloValidar (pruebas sin consultar pagos)',
           CASE WHEN EXISTS (SELECT 1 FROM sys.parameters WHERE object_id = OBJECT_ID('dbo.sp_IA_Cj_Pagos_Buscar') AND name = '@SoloValidar') THEN 'OK' ELSE 'FALLA' END, NULL;

    INSERT @r (Chequeo, Resultado, Detalle)
    SELECT 'sp_IA_Cj_Pagos_Buscar sin SQL dinamico propio',
           CASE WHEN OBJECT_DEFINITION(OBJECT_ID('dbo.sp_IA_Cj_Pagos_Buscar')) NOT LIKE '%sp[_]executesql%'
                 AND REPLACE(OBJECT_DEFINITION(OBJECT_ID('dbo.sp_IA_Cj_Pagos_Buscar')), ' ', '') NOT LIKE '%EXEC(@%' THEN 'OK' ELSE 'FALLA' END, NULL;

END

-- ===== Etapa 20: usuario cj_ia =====
IF @E >= 20
BEGIN
    INSERT @r (Chequeo, Resultado, Detalle)
    SELECT 'Existen login, usuario y rol de cj_ia',
           CASE WHEN EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'cj_ia') AND DATABASE_PRINCIPAL_ID('cj_ia') IS NOT NULL
                 AND DATABASE_PRINCIPAL_ID('rol_cj_ia') IS NOT NULL THEN 'OK' ELSE 'FALLA' END, NULL;

    INSERT @r (Chequeo, Resultado, Detalle)
    SELECT 'cj_ia no pertenece a roles fijos ni a otros roles', CASE WHEN NOT EXISTS (
        SELECT 1 FROM sys.database_role_members m JOIN sys.database_principals r ON r.principal_id = m.role_principal_id
        WHERE m.member_principal_id = DATABASE_PRINCIPAL_ID('cj_ia') AND r.name <> 'rol_cj_ia') THEN 'OK' ELSE 'FALLA' END, NULL;

    INSERT @r (Chequeo, Resultado, Detalle)
    SELECT 'cj_ia no es sysadmin ni tiene permisos de servidor', CASE WHEN IS_SRVROLEMEMBER('sysadmin', 'cj_ia') = 0 AND NOT EXISTS (
        SELECT 1 FROM sys.server_permissions p JOIN sys.server_principals s ON s.principal_id = p.grantee_principal_id
        WHERE s.name = 'cj_ia' AND p.permission_name NOT IN ('CONNECT SQL')) THEN 'OK' ELSE 'FALLA' END, NULL;

    DECLARE @permisos TABLE (Chequeo VARCHAR(140), Resultado VARCHAR(5));
    EXECUTE AS USER = 'cj_ia';
    INSERT @permisos
    SELECT 'cj_ia SIN SELECT sobre ' + t, CASE WHEN HAS_PERMS_BY_NAME('dbo.' + t, 'OBJECT', 'SELECT') = 0 THEN 'OK' ELSE 'FALLA' END
    FROM (VALUES ('Planilla'), ('Usuario'), ('Empleado'), ('EmpleadoCj'), ('IaToolPermiso'), ('SegUsuarioPerfilRol'),
                 ('IA_Conversacion'), ('IA_Mensaje'), ('IA_Turno'), ('IA_ResultadoConsulta'), ('IA_AuditoriaConsulta'), ('IaChatAuditoria'), ('IA_IdentidadUsuario'), ('IA_IdentidadAuditoria')) v(t);
    INSERT @permisos
    SELECT 'cj_ia SIN INSERT/UPDATE/DELETE sobre IA_Mensaje',
           CASE WHEN HAS_PERMS_BY_NAME('dbo.IA_Mensaje', 'OBJECT', 'INSERT') = 0 AND HAS_PERMS_BY_NAME('dbo.IA_Mensaje', 'OBJECT', 'UPDATE') = 0
                 AND HAS_PERMS_BY_NAME('dbo.IA_Mensaje', 'OBJECT', 'DELETE') = 0 THEN 'OK' ELSE 'FALLA' END;
    INSERT @permisos
    SELECT 'cj_ia SIN EXECUTE sobre ' + p, CASE WHEN HAS_PERMS_BY_NAME('dbo.' + p, 'OBJECT', 'EXECUTE') = 0 THEN 'OK' ELSE 'FALLA' END
    FROM (VALUES ('sp_IA_Planilla_Buscar'), ('sp_IA_Cj_Autorizacion_Alcance'), ('sp_Planilla_Consulta_Estados'), ('sp_ValidarUsuario'),
             ('sp_IA_Cj_Identidad_Asegurar'), ('sp_IA_Cj_Identidad_Resolver')) v(p);
    INSERT @permisos
    SELECT 'cj_ia CON EXECUTE sobre ' + p, CASE WHEN HAS_PERMS_BY_NAME('dbo.' + p, 'OBJECT', 'EXECUTE') = 1 THEN 'OK' ELSE 'FALLA' END
    FROM (VALUES ('sp_IA_Cj_Pagos_Buscar'), ('sp_IA_Cj_Autorizacion_Permisos'), ('sp_IA_Cj_Autorizacion_Empleado'), ('sp_IA_Cj_Autorizacion_Equipo'),
                 ('sp_IA_Cj_Conversacion_Crear'), ('sp_IA_Cj_Conversacion_Listar'), ('sp_IA_Cj_Conversacion_Abrir'), ('sp_IA_Cj_Conversacion_Renombrar'),
                 ('sp_IA_Cj_Conversacion_Eliminar'), ('sp_IA_Cj_Turno_Iniciar'), ('sp_IA_Cj_Turno_IniciarNueva'), ('sp_IA_Cj_Turno_Renovar'), ('sp_IA_Cj_Turno_Completar'),
                 ('sp_IA_Cj_Turno_Fallar'), ('sp_IA_Cj_Resultado_Registrar'), ('sp_IA_Cj_Estado_Guardar'), ('sp_IA_Cj_Auditoria_Registrar')) v(p);
    INSERT @permisos
    SELECT 'cj_ia SIN CREATE TABLE / CREATE PROCEDURE', CASE WHEN HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE TABLE') = 0
                 AND HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE PROCEDURE') = 0 THEN 'OK' ELSE 'FALLA' END;
    REVERT;

    INSERT @r (Chequeo, Resultado, Detalle) SELECT Chequeo, Resultado, NULL FROM @permisos;
END

SELECT Orden, Chequeo, Resultado, Detalle FROM @r ORDER BY Orden;
SELECT @E AS Etapa, SUM(CASE WHEN Resultado = 'FALLA' THEN 1 ELSE 0 END) AS Fallas, COUNT(*) AS Chequeos FROM @r;
