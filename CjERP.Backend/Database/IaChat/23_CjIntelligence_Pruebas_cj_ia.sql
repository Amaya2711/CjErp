:on error exit
-- GUARDA DE BASE: la base destino es JC_Db.
DECLARE @BaseDestino SYSNAME = N'JC_Db';
IF DB_NAME() <> @BaseDestino
BEGIN
    RAISERROR(N'Guarda de base: la base activa no es la base destino (@BaseDestino). No se ejecuto nada.', 16, 1);
    SET NOEXEC ON;
END
GO
/* ============================================================================
   CJ INTELLIGENCE - PRUEBAS CONECTADO COMO cj_ia (script 23). NO EJECUTADA. Requiere scripts 18, 19 y 20.

   DEBE ejecutarse CONECTADO como cj_ia (no como administrador): si SUSER_SNAME() no es cj_ia aborta. La clave se toma de la
   variable de entorno SQLCMDPASSWORD (la lee sqlcmd directamente; no aparece en la linea de comandos):
       set SQLCMDPASSWORD=<desde el gestor de secretos>
       sqlcmd -S <servidor> -d JC_Db -U cj_ia -i 23_CjIntelligence_Pruebas_cj_ia.sql
   Variables de entorno de datos (NOMBRES de usuario, no secretos; los imprime el script 22):
       CJ_TEST_USER_A, CJ_TEST_USER_B       dos usuarios activos distintos, con IdEmpleado > 0 (identidad permanente)
       CJ_TEST_USER_PROPIO                  usuario activo cuyo nivel maximo es PROPIO y sin totales globales
       CJ_TEST_USER_INACTIVO                (opcional) usuario con IdEstado = 0; si falta, esas pruebas se omiten
   QUE COMPRUEBA
     1. cj_ia NO puede leer ni escribir tablas, ni ejecutar el SP compartido, ni los internos, ni crear objetos.
     2. cj_ia SI puede ejecutar los procedimientos autorizados.
     3. Acceso a conversaciones ajenas: el usuario B no ve, no abre, no renombra, no elimina ni usa la conversacion de A.
     4. No se pueden alterar los empleados del alcance (el parametro no existe) ni pedir mas nivel ni totales no autorizados.
   QUE ESCRIBE: UNA conversacion de prueba (Modulo = 'PRUEBA') para A, que al final se elimina de forma LOGICA. Como cj_ia
   no puede borrar filas, su GUID se imprime y se limpia despues con 23b_CjIntelligence_Limpieza_PorGuid.sql (administrador).
   NO consulta pagos: el envoltorio se invoca siempre con @SoloValidar = 1 y el SP compartido solo se consulta por permisos.
   ============================================================================ */
SET NOCOUNT ON;

IF SUSER_SNAME() <> N'cj_ia' OR USER_NAME() <> N'cj_ia'
    THROW 51400, 'Este script debe ejecutarse CONECTADO como cj_ia (no como administrador).', 1;

DECLARE @A NVARCHAR(50) = N'$(CJ_TEST_USER_A)', @B NVARCHAR(50) = N'$(CJ_TEST_USER_B)', @Propio NVARCHAR(50) = N'$(CJ_TEST_USER_PROPIO)';
IF @A = N'' OR @B = N'' OR @A = @B OR @Propio = N''
    THROW 51401, 'Faltan CJ_TEST_USER_A, CJ_TEST_USER_B (distintos) o CJ_TEST_USER_PROPIO.', 1;

DECLARE @res TABLE (Orden INT IDENTITY(1,1), Prueba VARCHAR(140), Esperado VARCHAR(60), Obtenido VARCHAR(60));
DECLARE @en INT, @enc BIT, @n INT, @v VARCHAR(60);
DECLARE @x TABLE (IdConversacion UNIQUEIDENTIFIER);
DECLARE @t TABLE (Resultado VARCHAR(30), IdTurno BIGINT, Intentos TINYINT, IdMensajeUsuario BIGINT, SecuenciaUsuario INT,
                  ContenidoUsuario NVARCHAR(MAX), IdMensajeAsistente BIGINT, SecuenciaAsistente INT, ContenidoAsistente NVARCHAR(MAX),
                  IdConversacion UNIQUEIDENTIFIER);
DECLARE @el TABLE (Eliminadas INT);
DECLARE @ac TABLE (Actualizadas INT);
DECLARE @li TABLE (IdConversacion UNIQUEIDENTIFIER, Titulo NVARCHAR(250), Modulo VARCHAR(30), FechaCreacion DATETIME2, FechaUltimoMensaje DATETIME2);
DECLARE @c UNIQUEIDENTIFIER, @cmIntruso UNIQUEIDENTIFIER = NEWID(), @prIntruso UNIQUEIDENTIFIER = NEWID();

-- ============ 1. Lo que cj_ia NO puede hacer (esperado: 229 permiso denegado / 262 sin permiso de crear) ============
-- Cada sentencia se compila con permisos: aunque el predicado sea falso, sin permiso falla igual.
SET @en = NULL; BEGIN TRY EXEC (N'SELECT TOP (1) 1 FROM dbo.Planilla'); SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('SELECT sobre Planilla', '229', CAST(@en AS VARCHAR(10)));
SET @en = NULL; BEGIN TRY EXEC (N'SELECT TOP (1) 1 FROM dbo.Usuario'); SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('SELECT sobre Usuario', '229', CAST(@en AS VARCHAR(10)));
SET @en = NULL; BEGIN TRY EXEC (N'SELECT TOP (1) 1 FROM dbo.IaToolPermiso'); SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('SELECT sobre IaToolPermiso', '229', CAST(@en AS VARCHAR(10)));
SET @en = NULL; BEGIN TRY EXEC (N'SELECT TOP (1) 1 FROM dbo.SegUsuarioPerfilRol'); SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('SELECT sobre SegUsuarioPerfilRol', '229', CAST(@en AS VARCHAR(10)));
SET @en = NULL; BEGIN TRY EXEC (N'SELECT TOP (1) 1 FROM dbo.IA_Mensaje'); SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('SELECT directo sobre IA_Mensaje', '229', CAST(@en AS VARCHAR(10)));
SET @en = NULL; BEGIN TRY EXEC (N'SELECT TOP (1) 1 FROM dbo.IA_Conversacion'); SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('SELECT directo sobre IA_Conversacion', '229', CAST(@en AS VARCHAR(10)));
SET @en = NULL; BEGIN TRY EXEC (N'INSERT dbo.IA_Mensaje (IdConversacion, Rol, Contenido) SELECT NEWID(), ''user'', N''x'' WHERE 1 = 0'); SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('INSERT directo en IA_Mensaje', '229', CAST(@en AS VARCHAR(10)));
SET @en = NULL; BEGIN TRY EXEC (N'UPDATE dbo.IA_Conversacion SET IdActivo = 0 WHERE 1 = 0'); SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('UPDATE directo en IA_Conversacion', '229', CAST(@en AS VARCHAR(10)));
SET @en = NULL; BEGIN TRY EXEC (N'DELETE dbo.IA_Turno WHERE 1 = 0'); SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('DELETE directo en IA_Turno', '229', CAST(@en AS VARCHAR(10)));
SET @en = NULL; BEGIN TRY EXEC (N'CREATE TABLE dbo.zz_cj_ia_no_debe_existir (a INT)'); SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('CREATE TABLE', '262', CAST(@en AS VARCHAR(10)));
SET @en = NULL; BEGIN TRY EXEC (N'CREATE PROCEDURE dbo.zz_cj_ia_no_debe_existir AS SELECT 1'); SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('CREATE PROCEDURE', '262', CAST(@en AS VARCHAR(10)));

-- Permisos sobre el SP compartido y otros SP de IA: se consultan (HAS_PERMS_BY_NAME), NO se ejecutan: si por error hubiera permiso,
-- ejecutarlos correria una consulta de pagos.
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Sin EXECUTE sobre sp_IA_Planilla_Buscar (SP compartido)', '0', CAST(HAS_PERMS_BY_NAME('dbo.sp_IA_Planilla_Buscar', 'OBJECT', 'EXECUTE') AS VARCHAR(2)));
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Sin EXECUTE sobre sp_IA_Planilla_Resumen', '0', CAST(HAS_PERMS_BY_NAME('dbo.sp_IA_Planilla_Resumen', 'OBJECT', 'EXECUTE') AS VARCHAR(2)));
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Sin EXECUTE sobre sp_Planilla_Consulta_Estados', '0', CAST(HAS_PERMS_BY_NAME('dbo.sp_Planilla_Consulta_Estados', 'OBJECT', 'EXECUTE') AS VARCHAR(2)));
-- Identidad permanente: cj_ia NO puede resolver conflictos ni registrar identidades ni leer el registro (se consulta el permiso; NO se ejecuta)
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Sin EXECUTE sobre sp_IA_Cj_Identidad_Resolver (solo administrador)', '0', CAST(HAS_PERMS_BY_NAME('dbo.sp_IA_Cj_Identidad_Resolver', 'OBJECT', 'EXECUTE') AS VARCHAR(2)));
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Sin EXECUTE sobre sp_IA_Cj_Identidad_Asegurar (interno)', '0', CAST(HAS_PERMS_BY_NAME('dbo.sp_IA_Cj_Identidad_Asegurar', 'OBJECT', 'EXECUTE') AS VARCHAR(2)));
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Sin SELECT sobre IA_IdentidadAuditoria', '0', CAST(HAS_PERMS_BY_NAME('dbo.IA_IdentidadAuditoria', 'OBJECT', 'SELECT') AS VARCHAR(2)));
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Sin UPDATE sobre IA_Conversacion (no puede mover historiales)', '0', CAST(HAS_PERMS_BY_NAME('dbo.IA_Conversacion', 'OBJECT', 'UPDATE') AS VARCHAR(2)));
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Sin SELECT sobre IA_IdentidadUsuario', '0', CAST(HAS_PERMS_BY_NAME('dbo.IA_IdentidadUsuario', 'OBJECT', 'SELECT') AS VARCHAR(2)));
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Sin SELECT sobre vw_IA_Cj_Identidad_Conflicto', '0', CAST(HAS_PERMS_BY_NAME('dbo.vw_IA_Cj_Identidad_Conflicto', 'OBJECT', 'SELECT') AS VARCHAR(2)));
DECLARE @nv VARCHAR(10), @el2 NVARCHAR(MAX), @gv BIT;
SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Autorizacion_Alcance @A, 'buscar_planilla', 'TOTAL', 0, @nv OUTPUT, @el2 OUTPUT, @gv OUTPUT; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('EXECUTE de sp_IA_Cj_Autorizacion_Alcance (interno)', '229', CAST(@en AS VARCHAR(10)));
SET @en = NULL; BEGIN TRY EXEC (N'SELECT dbo.fn_IA_Cj_UsuarioValido(N''x'')'); SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Invocar fn_IA_Cj_UsuarioValido directamente', '229', CAST(@en AS VARCHAR(10)));
SET @en = NULL; BEGIN TRY EXEC sys.sp_executesql N'SELECT TOP (1) 1 FROM dbo.Planilla'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('SQL dinamico sobre Planilla', '229', CAST(@en AS VARCHAR(10)));
SET @en = NULL; BEGIN TRY EXEC (N'EXECUTE AS USER = N''dbo'''); SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Suplantar a dbo (EXECUTE AS USER)', '15517', CAST(@en AS VARCHAR(10)));

-- ============ 2. Lo que cj_ia SI puede hacer ============
INSERT @x EXEC dbo.sp_IA_Cj_Conversacion_Crear @IdUsuario = @A, @Titulo = N'prueba cj_ia', @Modulo = 'PRUEBA';
SELECT @c = IdConversacion FROM @x;
PRINT 'GUID de prueba creado (limpiar con 23b): ' + CAST(@c AS VARCHAR(40));
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Crear conversacion (procedimiento autorizado)', '1', CAST(CASE WHEN @c IS NOT NULL THEN 1 ELSE 0 END AS VARCHAR(2)));
INSERT @li EXEC dbo.sp_IA_Cj_Conversacion_Listar @IdUsuario = @A, @Pagina = 1, @Tamano = 100;
SELECT @n = COUNT(*) FROM @li WHERE IdConversacion = @c;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Propietario ve su conversacion en Listar', '1', CAST(@n AS VARCHAR(10)));
EXEC dbo.sp_IA_Cj_Conversacion_Abrir @IdUsuario = @A, @IdConversacion = @c, @Encontrada = @enc OUTPUT;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Propietario abre su conversacion', '1', CAST(@enc AS VARCHAR(2)));

-- ============ 3. Conversaciones ajenas ============
DELETE @li; INSERT @li EXEC dbo.sp_IA_Cj_Conversacion_Listar @IdUsuario = @B, @Pagina = 1, @Tamano = 100;
SELECT @n = COUNT(*) FROM @li WHERE IdConversacion = @c;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('B no ve la conversacion de A en Listar', '0', CAST(@n AS VARCHAR(10)));
EXEC dbo.sp_IA_Cj_Conversacion_Abrir @IdUsuario = @B, @IdConversacion = @c, @Encontrada = @enc OUTPUT;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('B no abre la conversacion de A', '0', CAST(@enc AS VARCHAR(2)));
INSERT @ac EXEC dbo.sp_IA_Cj_Conversacion_Renombrar @IdUsuario = @B, @IdConversacion = @c, @Titulo = N'secuestrada'; SELECT @n = Actualizadas FROM @ac;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('B no renombra la conversacion de A', '0', CAST(@n AS VARCHAR(10)));
INSERT @el EXEC dbo.sp_IA_Cj_Conversacion_Eliminar @IdUsuario = @B, @IdConversacion = @c; SELECT @n = Eliminadas FROM @el;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('B no elimina la conversacion de A', '0', CAST(@n AS VARCHAR(10)));
INSERT @t EXEC dbo.sp_IA_Cj_Turno_Iniciar @IdUsuario = @B, @IdConversacion = @c, @ClientMessageId = @cmIntruso, @Propietario = @prIntruso, @Contenido = N'intruso', @TtlSegundos = 30;
SELECT @v = Resultado FROM @t;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('B no inicia turnos en la conversacion de A', 'NO_ENCONTRADA', @v);
SET @en = NULL; BEGIN TRY INSERT @li EXEC dbo.sp_IA_Cj_Conversacion_Listar @IdUsuario = N'__usuario_que_no_existe__'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Usuario inexistente: identidad invalida', '51010', CAST(@en AS VARCHAR(10)));
SET @en = NULL; BEGIN TRY INSERT @li EXEC dbo.sp_IA_Cj_Conversacion_Listar @IdUsuario = NULL; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Identidad nula: identidad invalida', '51010', CAST(@en AS VARCHAR(10)));

-- ============ 4. Alcance: no se puede ampliar ni alterar (todas fallan ANTES de consultar Planilla) ============
SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Pagos_Buscar @SoloValidar = 1, @IdUsuario = @Propio, @NivelSolicitado = 'PROPIO', @AlcanceEmpleados = N'1,2,3', @FechaInicio = N'2026-10-01', @FechaFin = N'2026-10-31'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Alterar los empleados del alcance (parametro inexistente)', '8145', CAST(@en AS VARCHAR(10)));
SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Pagos_Buscar @SoloValidar = 1, @IdUsuario = @Propio, @NivelSolicitado = 'EQUIPO', @FechaInicio = N'2026-10-01', @FechaFin = N'2026-10-31'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('PROPIO pidiendo EQUIPO', '51041', CAST(@en AS VARCHAR(10)));
SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Pagos_Buscar @SoloValidar = 1, @IdUsuario = @Propio, @NivelSolicitado = 'TOTAL', @FechaInicio = N'2026-10-01', @FechaFin = N'2026-10-31'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('PROPIO pidiendo TOTAL', '51041', CAST(@en AS VARCHAR(10)));
SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Pagos_Buscar @SoloValidar = 1, @IdUsuario = @Propio, @NivelSolicitado = NULL, @FechaInicio = N'2026-10-01', @FechaFin = N'2026-10-31'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Nivel ausente: sin nivel por defecto', '51041', CAST(@en AS VARCHAR(10)));
SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Pagos_Buscar @SoloValidar = 1, @IdUsuario = @Propio, @NivelSolicitado = 'PROPIO', @VerTotalesGlobales = 1, @FechaInicio = N'2026-10-01', @FechaFin = N'2026-10-31'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Totales globales no autorizados', '51043', CAST(@en AS VARCHAR(10)));
SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Pagos_Buscar @SoloValidar = 1, @IdUsuario = N'__usuario_que_no_existe__', @NivelSolicitado = 'PROPIO', @FechaInicio = N'2026-10-01', @FechaFin = N'2026-10-31'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Identidad inexistente en el envoltorio', '51040', CAST(@en AS VARCHAR(10)));
SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Pagos_Buscar @SoloValidar = 1, @IdUsuario = @Propio, @NivelSolicitado = 'PROPIO', @FechaInicio = N'2024-01-01', @FechaFin = N'2026-10-31'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Rango de fechas mayor a 400 dias', '51045', CAST(@en AS VARCHAR(10)));

-- ============ 5. Usuario INACTIVO (IdEstado = 0): denegado aunque conserve roles y permisos ============
DECLARE @Inactivo NVARCHAR(50) = N'$(CJ_TEST_USER_INACTIVO)';
IF @Inactivo <> N''
BEGIN
    SET @en = NULL; BEGIN TRY INSERT @li EXEC dbo.sp_IA_Cj_Conversacion_Listar @IdUsuario = @Inactivo; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Inactivo: no lista conversaciones', '51010', CAST(@en AS VARCHAR(10)));
    SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Conversacion_Abrir @IdUsuario = @Inactivo, @IdConversacion = @c, @Encontrada = @enc OUTPUT; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Inactivo: no abre conversaciones', '51010', CAST(@en AS VARCHAR(10)));
    SET @en = NULL; BEGIN TRY EXEC dbo.sp_IA_Cj_Pagos_Buscar @SoloValidar = 1, @IdUsuario = @Inactivo, @NivelSolicitado = 'PROPIO', @FechaInicio = N'2026-10-01', @FechaFin = N'2026-10-31'; SET @en = 0; END TRY BEGIN CATCH SET @en = ERROR_NUMBER(); END CATCH;
    INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Inactivo: envoltorio de pagos denegado', '51040', CAST(@en AS VARCHAR(10)));
END
ELSE PRINT 'CJ_TEST_USER_INACTIVO no definido: se omiten estas pruebas (la seccion E del script 22 las cubre como administrador).';

-- Cierre logico de la conversacion de prueba (la fila queda; se limpia con 23b)
DELETE @el; INSERT @el EXEC dbo.sp_IA_Cj_Conversacion_Eliminar @IdUsuario = @A, @IdConversacion = @c; SELECT @n = Eliminadas FROM @el;
INSERT @res (Prueba, Esperado, Obtenido) VALUES ('Propietario elimina (logico) su conversacion de prueba', '1', CAST(@n AS VARCHAR(10)));

SELECT Orden, Prueba, Esperado, Obtenido, CASE WHEN ISNULL(Esperado, '') = ISNULL(Obtenido, '') THEN 'OK' ELSE 'FALLA' END AS Resultado FROM @res ORDER BY Orden;
SELECT SUM(CASE WHEN ISNULL(Esperado, '') <> ISNULL(Obtenido, '') THEN 1 ELSE 0 END) AS Fallas, COUNT(*) AS Pruebas FROM @res;
PRINT 'Limpiar como administrador: 23b con GuidPrueba=' + CAST(@c AS VARCHAR(40));
GO

SET NOEXEC OFF;
GO
